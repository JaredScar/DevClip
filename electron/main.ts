import { createHash } from 'crypto';
import { existsSync } from 'fs';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  Menu,
  nativeImage,
  net,
  protocol,
  screen,
  session,
  Tray,
} from 'electron';
import * as path from 'path';
import { setupAutoUpdater, checkForUpdatesOnStartup } from './autoUpdater';
import { getSourceLabelSync } from './sourceApp';
import { tryAddClipToSmartCollections } from '../database/collections';
import { appendAuditEvent, clampAuditRetentionDays, pruneAuditEventsRetentionDays } from '../database/audit';
import {
  clearAllClips,
  getClipById,
  getSettingsMap,
  initDatabase,
  insertClip,
  setSetting,
  type ClipRow,
} from '../database/db';
import { ensureSnippetsSchema } from '../database/snippets';
import { runAutomationForClip } from './automationEngine';
import { detectType } from './detectType';
import { shouldIgnore } from './ignoreRules';
import { registerIpcHandlers, resetLockSessionFromSettings } from './ipc';
import { tryAutoVaultSecretClip } from './vaultSession';
import { refreshEnterprisePolicyIfConfigured } from './enterprisePolicy';
import { hasStoredLicenseKey } from './licenseKeyStore';
import { refreshLicenseFromDisk, tryRefreshLicenseFromNetwork } from './licenseRuntime';
import { runCaptureIntegrations } from './integrationsCapture';
import { processSyncOutbox } from './syncOps';

/** Use file bundle unless explicitly in dev server mode (see package.json `dev:electron`). */
const isDev = process.env.DEVCLIP_DEV === '1';

const projectRoot = path.join(__dirname, '..', '..');

// Angular production build output directory.
const angularDistPath = path.join(projectRoot, 'angular-app', 'dist', 'angular-app', 'browser');

// Register a custom privileged scheme so we can serve Angular files with controlled
// response headers (including a permissive CSP). This replaces loadFile()/file://, because
// Electron's file:// protocol bypasses onHeadersReceived so CSP injection has no effect there.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'devclip',
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: false,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

function resolveAppIconPath(): string | undefined {
  const fromPublic = path.join(projectRoot, 'angular-app', 'public', 'devclip_icon_transparent.svg');
  const fromBuild = path.join(
    projectRoot,
    'angular-app',
    'dist',
    'angular-app',
    'browser',
    'devclip_icon_transparent.svg'
  );
  if (isDev && existsSync(fromPublic)) return fromPublic;
  if (!isDev && existsSync(fromBuild)) return fromBuild;
  if (existsSync(fromBuild)) return fromBuild;
  if (existsSync(fromPublic)) return fromPublic;
  return undefined;
}

/** PNG works reliably for `Tray` on Windows/Linux (SVG is not supported for tray icons). */
function resolveTrayIconPath(): string | undefined {
  const fromRoot = path.join(projectRoot, 'devclip_icon_transparent.png');
  if (existsSync(fromRoot)) return fromRoot;
  return undefined;
}

function showMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  createMainWindow();
}

function createTray(): void {
  if (tray && !tray.isDestroyed()) {
    return;
  }
  try {
    const trayPath = resolveTrayIconPath();
    let image: Electron.NativeImage | null = null;
    if (trayPath) {
      image = nativeImage.createFromPath(trayPath);
      if (!image.isEmpty()) {
        const size = process.platform === 'darwin' ? 22 : 16;
        image = image.resize({ width: size, height: size });
      } else {
        image = null;
      }
    }
    if (!image || image.isEmpty()) {
      console.warn('DevClip: tray icon not found; skipping system tray.');
      return;
    }
    const trayInstance = new Tray(image);
    trayInstance.setToolTip('DevClip');
    trayInstance.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Open DevClip',
          click: () => showMainWindow(),
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            app.quit();
          },
        },
      ])
    );
    trayInstance.on('double-click', () => {
      showMainWindow();
    });
    tray = trayInstance;
  } catch (e) {
    console.error('DevClip: could not create system tray:', e);
  }
}

const indexHtmlPath = path.join(
  __dirname,
  '..',
  '..',
  'angular-app',
  'dist',
  'angular-app',
  'browser',
  'index.html'
);

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
/** True while `app.quit()` is in progress so the main window can close instead of hiding to tray. */
let isQuitting = false;
let lastClipboardText = '';
let pollTimer: NodeJS.Timeout | null = null;
let settingsTimer: NodeJS.Timeout | null = null;
let cachedSettings: Record<string, string> = {};
let registeredOverlayAccelerators: string[] = [];
let overlayShortcutsPaused = false;
let lastOverlayShortcutSetting = '';
let lastClipboardPollMs = 500;
let lastImageSig = '';

function registerAppProtocol(): void {
  // Serve the Angular production bundle through devclip:// so we control the response
  // headers (including CSP). file:// loads bypass onHeadersReceived entirely, so CSP
  // injection via webRequest has no effect for loadFile() — hence this custom scheme.
  const csp = [
    "default-src 'self' devclip: data: blob:",
    "script-src 'self' devclip: 'unsafe-inline' 'unsafe-eval' blob:",
    "style-src 'self' devclip: 'unsafe-inline'",
    "img-src 'self' devclip: data: blob:",
    "font-src 'self' devclip: data:",
    "connect-src 'self' devclip: data: blob:",
    "worker-src blob:",
  ].join('; ');

  protocol.handle('devclip', async (request) => {
    const url = new URL(request.url);
    // Strip leading slash; fall back to index.html for the root and any SPA route.
    let pathname = decodeURIComponent(url.pathname);
    if (!pathname || pathname === '/') pathname = 'index.html';
    // Strip a leading slash so path.join works correctly on Windows.
    if (pathname.startsWith('/')) pathname = pathname.slice(1);

    const filePath = path.join(angularDistPath, pathname);
    const fileResponse = await net.fetch(`file://${filePath}`);

    const headers = new Headers(fileResponse.headers);
    headers.set('Content-Security-Policy', csp);
    return new Response(fileResponse.body, {
      status: fileResponse.status,
      headers,
    });
  });
}

function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function getSourceLabel(): string | null {
  return getSourceLabelSync();
}

function refreshSettingsCache(): void {
  try {
    cachedSettings = getSettingsMap();
  } catch {
    cachedSettings = {};
  }
}

function attachLoadFailureHandler(win: BrowserWindow, label: string): void {
  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      console.error(`${label} failed to load:`, errorCode, errorDescription, validatedURL);
      void dialog.showMessageBox(win, {
        type: 'error',
        title: 'DevClip',
        message: 'Could not load the DevClip window.',
        detail:
          'Build the Angular app first:\n\n  npm run build:ng\n\nOr use the dev workflow:\n\n  npm run dev',
      });
    }
  );
}

function createMainWindow(): BrowserWindow {
  const winWidth = 1100;
  const winHeight = 700;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const iconPath = resolveAppIconPath();
  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round((sw - winWidth) / 2),
    y: Math.round((sh - winHeight) / 2),
    title: 'DevClip',
    frame: true,
    transparent: false,
    backgroundColor: '#0d0d0d',
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: true,
    show: true,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    void win.loadURL('http://localhost:4200/');
  } else {
    void win.loadURL('devclip://devclip/');
  }

  attachLoadFailureHandler(win, 'Main window');

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  mainWindow = win;
  return win;
}

function createOverlayWindow(): BrowserWindow {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 760;
  const winHeight = 580;

  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round((sw - winWidth) / 2),
    y: Math.round((sh - winHeight) / 2),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    void win.loadURL('http://localhost:4200/#/overlay');
  } else {
    void win.loadURL('devclip://devclip/#/overlay');
  }

  attachLoadFailureHandler(win, 'Overlay');

  win.on('closed', () => {
    overlayWindow = null;
  });

  win.on('blur', () => {
    if (isDev) return;
  });

  return win;
}

function finalizeNewClip(row: ClipRow): void {
  if (tryAutoVaultSecretClip(row)) {
    return;
  }
  const live = getClipById(row.id);
  if (!live) {
    return;
  }
  tryAddClipToSmartCollections(live);
  broadcastNewClip(live);
  runCaptureIntegrations(live, app.getPath('userData'));
  appendAuditEvent({
    category: 'clip',
    action: 'captured',
    detail: { id: live.id, type: live.type },
  });
}

function broadcastNewClip(clip: ClipRow): void {
  const send = (win: BrowserWindow | null): void => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('clip:new', clip);
    }
  };
  send(mainWindow);
  send(overlayWindow);
}

function clampClipboardPollMs(raw: string | undefined): number {
  const n = parseInt(raw ?? '500', 10);
  if (Number.isNaN(n)) return 500;
  return Math.min(5000, Math.max(100, n));
}

function tryCaptureClipboardImage(): boolean {
  const img = clipboard.readImage();
  if (img.isEmpty()) {
    return false;
  }
  const png = img.toPNG();
  if (png.length > 4 * 1024 * 1024) {
    return true;
  }
  const sig = createHash('sha256').update(png).digest('hex');
  if (sig === lastImageSig) {
    return true;
  }
  lastImageSig = sig;
  if (cachedSettings.privateMode === '1' || cachedSettings.enterprisePolicyForcePrivate === '1') {
    return true;
  }
  const source = getSourceLabel();
  try {
    const row = insertClip({
      content: `data:image/png;base64,${png.toString('base64')}`,
      type: 'image',
      source,
      metadata: { mime: 'image/png', bytes: png.length },
    });
    runAutomationForClip(row);
    finalizeNewClip(row);
  } catch (e) {
    console.error('insertClip image failed', e);
  }
  return true;
}

function clipboardPollTick(): void {
  if (tryCaptureClipboardImage()) {
    return;
  }

  const text = clipboard.readText();
  const trimmed = text.trim();
  if (!trimmed || trimmed === lastClipboardText) {
    return;
  }
  lastClipboardText = trimmed;

  if (cachedSettings.privateMode === '1' || cachedSettings.enterprisePolicyForcePrivate === '1') {
    return;
  }

  const source = getSourceLabel();
  if (shouldIgnore(trimmed, source, cachedSettings)) {
    return;
  }

  const detected = detectType(trimmed);
  const metadata = {
    confidence: detected.confidence,
    ...(detected.language ? { language: detected.language } : {}),
  };

  try {
    const row = insertClip({
      content: trimmed,
      type: detected.type,
      source,
      metadata,
    });
    runAutomationForClip(row);
    finalizeNewClip(row);
  } catch (e) {
    console.error('insertClip failed', e);
  }
}

function startClipboardPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  lastClipboardText = clipboard.readText();
  lastImageSig = '';
  refreshSettingsCache();
  lastClipboardPollMs = clampClipboardPollMs(cachedSettings.clipboardPollMs);
  pollTimer = setInterval(clipboardPollTick, lastClipboardPollMs);
}

function startSettingsWatcher(): void {
  if (settingsTimer) {
    clearInterval(settingsTimer);
  }
  settingsTimer = setInterval(() => {
    refreshSettingsCache();
    syncLaunchAtLogin();
    const sc = cachedSettings.overlayShortcut ?? '';
    if (sc !== lastOverlayShortcutSetting) {
      lastOverlayShortcutSetting = sc;
      registerGlobalShortcut();
    }
    const nextPoll = clampClipboardPollMs(cachedSettings.clipboardPollMs);
    if (nextPoll !== lastClipboardPollMs) {
      lastClipboardPollMs = nextPoll;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      pollTimer = setInterval(clipboardPollTick, lastClipboardPollMs);
    }
  }, 2000);
}

function syncLaunchAtLogin(): void {
  try {
    app.setLoginItemSettings({ openAtLogin: cachedSettings.launchAtLogin === '1' });
  } catch {
    /* ignore */
  }
}

function positionOverlayWindow(win: BrowserWindow): void {
  const area = screen.getPrimaryDisplay().workArea;
  const b = win.getBounds();
  const pos = (cachedSettings.overlayPosition ?? 'center').trim() || 'center';
  let x = area.x + Math.round((area.width - b.width) / 2);
  let y = area.y + Math.round((area.height - b.height) / 2);
  if (pos === 'top') {
    y = area.y + 16;
    x = area.x + Math.round((area.width - b.width) / 2);
  } else if (pos === 'bottom') {
    y = area.y + area.height - b.height - 16;
    x = area.x + Math.round((area.width - b.width) / 2);
  }
  win.setPosition(x, y);
}

function toggleOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    overlayWindow = createOverlayWindow();
  }
  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    refreshSettingsCache();
    positionOverlayWindow(overlayWindow);
    overlayWindow.show();
    overlayWindow.focus();
    overlayWindow.webContents.focus();
  }
}

/** Preferred shortcut is often already taken (e.g. paste-as-plain-text in browsers/IDEs). */
const OVERLAY_SHORTCUT_CANDIDATES = [
  'CommandOrControl+Shift+V',
  'CommandOrControl+Alt+V',
  'CommandOrControl+Shift+O',
] as const;

function acceleratorLabelForLog(accelerator: string): string {
  const mod = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
  return accelerator.replace(/CommandOrControl/g, mod);
}

function unregisterAllOverlayShortcuts(): void {
  for (const a of registeredOverlayAccelerators) {
    try {
      globalShortcut.unregister(a);
    } catch {
      /* ignore */
    }
  }
  registeredOverlayAccelerators = [];
}

function registerGlobalShortcut(): void {
  if (overlayShortcutsPaused) {
    unregisterAllOverlayShortcuts();
    return;
  }
  unregisterAllOverlayShortcuts();
  const handler = (): void => {
    toggleOverlay();
  };

  const custom = (cachedSettings.overlayShortcut ?? '').trim();
  if (custom) {
    try {
      if (globalShortcut.register(custom, handler)) {
        registeredOverlayAccelerators.push(custom);
        return;
      }
      console.warn(
        `Custom overlay shortcut "${acceleratorLabelForLog(custom)}" could not be registered; falling back to defaults.`
      );
    } catch (e) {
      console.warn('Invalid overlay shortcut in settings:', e);
    }
  }

  for (const accelerator of OVERLAY_SHORTCUT_CANDIDATES) {
    if (globalShortcut.register(accelerator, handler)) {
      registeredOverlayAccelerators.push(accelerator);
      if (accelerator !== OVERLAY_SHORTCUT_CANDIDATES[0]) {
        const label = acceleratorLabelForLog(accelerator);
        console.warn(
          `Overlay hotkey: ${label} (preferred ${acceleratorLabelForLog(OVERLAY_SHORTCUT_CANDIDATES[0])} was unavailable - another app may own it)`
        );
      }
      return;
    }
  }
  console.error(
    'Failed to register any overlay global shortcut. Close other apps using Ctrl+Shift+V / Ctrl+Alt+V / Ctrl+Shift+O or quit duplicate DevClip instances.'
  );
}

function pauseOverlayShortcuts(): void {
  overlayShortcutsPaused = true;
  unregisterAllOverlayShortcuts();
}

function resumeOverlayShortcuts(): void {
  overlayShortcutsPaused = false;
  registerGlobalShortcut();
}

// Expose for IPC handler (renderer -> main) without creating circular imports.
(globalThis as unknown as { pauseOverlayShortcuts?: () => void; resumeOverlayShortcuts?: () => void }).pauseOverlayShortcuts =
  pauseOverlayShortcuts;
(globalThis as unknown as { pauseOverlayShortcuts?: () => void; resumeOverlayShortcuts?: () => void }).resumeOverlayShortcuts =
  resumeOverlayShortcuts;

app.whenReady().then(() => {
  registerAppProtocol();
  initDatabase(app.getPath('userData'));
  ensureSnippetsSchema();
  refreshSettingsCache();
  pruneAuditEventsRetentionDays(
    parseInt(clampAuditRetentionDays(getSettingsMap()['auditRetentionDays'] ?? '0'), 10)
  );
  resetLockSessionFromSettings(getSettingsMap());
  const ud = app.getPath('userData');
  if (isDev) {
    const cur = getSettingsMap()['licenseServerUrl'] ?? '';
    if (!cur.trim()) {
      setSetting('licenseServerUrl', 'http://localhost:3001');
      refreshSettingsCache();
    }
  }
  const licenseUrl = getSettingsMap()['licenseServerUrl'] ?? '';
  refreshLicenseFromDisk(ud, licenseUrl);
  void tryRefreshLicenseFromNetwork(ud, licenseUrl);
  setInterval(() => {
    const url = getSettingsMap()['licenseServerUrl'] ?? '';
    if (url.trim().startsWith('http') && hasStoredLicenseKey(ud)) {
      void tryRefreshLicenseFromNetwork(ud, url);
    }
  }, 60 * 60 * 1000);
  void refreshEnterprisePolicyIfConfigured(ud);
  setInterval(() => {
    void refreshEnterprisePolicyIfConfigured(ud);
  }, 30 * 60 * 1000);
  lastOverlayShortcutSetting = cachedSettings.overlayShortcut ?? '';
  registerIpcHandlers(getOverlayWindow, getMainWindow, broadcastNewClip);
  registerGlobalShortcut();
  startClipboardPolling();
  startSettingsWatcher();
  setInterval(() => {
    void processSyncOutbox();
  }, 60_000);
  void processSyncOutbox();
  syncLaunchAtLogin();
  createMainWindow();
  overlayWindow = createOverlayWindow();
  createTray();

  setupAutoUpdater(getMainWindow);
  if (!isDev) {
    void checkForUpdatesOnStartup();
  }

  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  refreshSettingsCache();
  if (cachedSettings.autoClearHistoryOnExit === '1') {
    try {
      clearAllClips();
    } catch (e) {
      console.error('clearAllClips on exit failed', e);
    }
  }
  unregisterAllOverlayShortcuts();
  globalShortcut.unregisterAll();
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  if (settingsTimer) {
    clearInterval(settingsTimer);
  }
});

app.on('window-all-closed', () => {
  // Closing the main window hides to tray; quitting is via tray menu / Cmd+Q / explicit app.quit().
});
