import { BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

export type UpdaterStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string }
  | { phase: 'not-available'; version: string }
  | { phase: 'downloading'; percent: number; transferred: number; total: number }
  | { phase: 'downloaded'; version: string }
  | { phase: 'error'; message: string };

let currentStatus: UpdaterStatus = { phase: 'idle' };
let getMainWin: (() => BrowserWindow | null) | null = null;

function broadcast(status: UpdaterStatus): void {
  currentStatus = status;
  const win = getMainWin?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:status', status);
  }
}

export function setupAutoUpdater(getWindow: () => BrowserWindow | null): void {
  getMainWin = getWindow;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    broadcast({ phase: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    broadcast({ phase: 'available', version: String(info.version ?? '') });
  });

  autoUpdater.on('update-not-available', (info) => {
    broadcast({ phase: 'not-available', version: String(info.version ?? '') });
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcast({
      phase: 'downloading',
      percent: Math.round(progress.percent ?? 0),
      transferred: progress.transferred ?? 0,
      total: progress.total ?? 0,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ phase: 'downloaded', version: String(info.version ?? '') });
  });

  autoUpdater.on('error', (err) => {
    broadcast({ phase: 'error', message: String(err?.message ?? err) });
  });

  ipcMain.handle('updater:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: String((err as Error)?.message ?? err) };
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: String((err as Error)?.message ?? err) };
    }
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
    return { ok: true as const };
  });

  ipcMain.handle('updater:getStatus', () => currentStatus);
}

/** Silently check once on startup; errors are swallowed to not disrupt startup. */
export async function checkForUpdatesOnStartup(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // Ignore network / config errors on startup
  }
}
