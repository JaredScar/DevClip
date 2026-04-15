import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export interface ClipPayload {
  id: number;
  content: string;
  type: string;
  source: string | null;
  created_at: number;
  is_pinned: number;
  tags_json?: string;
  use_count?: number;
  metadata_json?: string;
}

export interface ClipSearchOptionsPayload {
  tagNames?: string[];
  dateFrom?: number;
  dateTo?: number;
  sourceApp?: string;
  fuzzy?: boolean;
}

const api = {
  getClips: () => ipcRenderer.invoke('clips:get'),
  getClipActivityByDay: (startUnix: number, endUnix: number) =>
    ipcRenderer.invoke('clips:activityByDay', startUnix, endUnix),
  getInsightsSummary: (startUnix: number, endUnix: number) =>
    ipcRenderer.invoke('insights:getSummary', startUnix, endUnix),
  searchClips: (query: string, typeFilter: string, opts?: ClipSearchOptionsPayload) =>
    ipcRenderer.invoke('clips:search', query, typeFilter, opts ?? {}),
  saveClip: (payload: { content: string; type: string; source?: string | null }) =>
    ipcRenderer.invoke('clips:save', payload),
  togglePin: (id: number) => ipcRenderer.invoke('clips:pin', id),
  deleteClip: (id: number) => ipcRenderer.invoke('clips:delete', id),
  clearAllClips: () => ipcRenderer.invoke('clips:clearAll') as Promise<{ ok: boolean }>,
  incrementClipUse: (id: number) => ipcRenderer.invoke('clips:incrementUse', id),
  tagClip: (clipId: number, tagName: string) => ipcRenderer.invoke('clips:tag', clipId, tagName),
  untagClip: (clipId: number, tagName: string) => ipcRenderer.invoke('clips:untag', clipId, tagName),
  getClipTags: (clipId: number) => ipcRenderer.invoke('clips:getTags', clipId) as Promise<string[]>,
  copyToClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  copyImageToClipboard: (dataUrl: string) =>
    ipcRenderer.invoke('clipboard:writeImage', dataUrl),
  licenseGetStatus: () => ipcRenderer.invoke('license:getStatus'),
  licenseSetKey: (key: string) => ipcRenderer.invoke('license:setKey', key),
  licenseClear: () => ipcRenderer.invoke('license:clear'),
  lockGetState: () => ipcRenderer.invoke('lock:getState'),
  lockUnlock: (pin: string) => ipcRenderer.invoke('lock:unlock', pin),
  lockLockSession: () => ipcRenderer.invoke('lock:lockSession'),
  lockSetPin: (pin: string) => ipcRenderer.invoke('lock:setPin', pin),
  lockClearPin: () => ipcRenderer.invoke('lock:clearPin'),
  collectionsList: () => ipcRenderer.invoke('collections:list'),
  collectionsCreate: (name: string, opts?: { isSmart?: boolean; query?: string | null }) =>
    ipcRenderer.invoke('collections:create', name, opts ?? {}),
  collectionsRefreshSmart: (id: number) => ipcRenderer.invoke('collections:refreshSmart', id),
  collectionsDelete: (id: number) => ipcRenderer.invoke('collections:delete', id),
  collectionsAddClip: (collectionId: number, clipId: number) =>
    ipcRenderer.invoke('collections:addClip', collectionId, clipId),
  collectionsRemoveClip: (collectionId: number, clipId: number) =>
    ipcRenderer.invoke('collections:removeClip', collectionId, clipId),
  collectionsExportJson: () => ipcRenderer.invoke('collections:exportJson') as Promise<string>,
  collectionsImportJson: (json: string) => ipcRenderer.invoke('collections:importJson', json),
  automationList: () => ipcRenderer.invoke('automation:list'),
  automationCreate: (payload: {
    name: string;
    trigger: string;
    conditions: string;
    actions: string;
    enabled?: number;
  }) => ipcRenderer.invoke('automation:create', payload),
  automationUpdate: (payload: {
    id: number;
    name: string;
    enabled: number;
    trigger: string;
    conditions: string;
    actions: string;
  }) => ipcRenderer.invoke('automation:update', payload),
  automationDelete: (id: number) => ipcRenderer.invoke('automation:delete', id),
  hideOverlay: () => ipcRenderer.invoke('overlay:hide'),
  overlayPauseShortcuts: () => ipcRenderer.invoke('overlay:pauseShortcuts') as Promise<{ ok: boolean }>,
  overlayResumeShortcuts: () => ipcRenderer.invoke('overlay:resumeShortcuts') as Promise<{ ok: boolean }>,
  showMain: () => ipcRenderer.invoke('main:show'),
  minimizeMain: () => ipcRenderer.invoke('main:minimize'),
  openExternalUrl: (url: string) =>
    ipcRenderer.invoke('shell:openExternal', url) as Promise<{ ok: boolean; error?: string }>,
  onNewClip: (callback: (clip: ClipPayload) => void) => {
    const handler = (_event: IpcRendererEvent, clip: ClipPayload) => callback(clip);
    ipcRenderer.on('clip:new', handler);
    return () => ipcRenderer.removeListener('clip:new', handler);
  },
  settingsGet: () => ipcRenderer.invoke('settings:get') as Promise<Record<string, string>>,
  settingsSet: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  listTags: () => ipcRenderer.invoke('tags:list'),
  getSnippets: () => ipcRenderer.invoke('snippets:get'),
  searchSnippets: (query: string) => ipcRenderer.invoke('snippets:search', query),
  saveSnippet: (payload: {
    title: string;
    content: string;
    variables: string;
    tags: string;
    category?: string;
    shortcode?: string | null;
  }) => ipcRenderer.invoke('snippets:save', payload),
  updateSnippet: (payload: {
    id: number;
    title: string;
    content: string;
    variables: string;
    tags: string;
    category?: string;
    shortcode?: string | null;
  }) => ipcRenderer.invoke('snippets:update', payload),
  deleteSnippet: (id: number) => ipcRenderer.invoke('snippets:delete', id),
  toggleSnippetPin: (id: number) => ipcRenderer.invoke('snippets:pin', id),
  incrementSnippetUse: (id: number) => ipcRenderer.invoke('snippets:incrementUse', id),
  cryptoDigest: (algorithm: string, text: string) =>
    ipcRenderer.invoke('crypto:digest', algorithm, text) as Promise<string>,
  exportSnippetsJson: () => ipcRenderer.invoke('snippets:exportJson') as Promise<string>,
  importSnippetsJson: (jsonText: string) =>
    ipcRenderer.invoke('snippets:importJson', jsonText) as Promise<{ imported: number; errors: string[] }>,
  resolveSnippetShortcode: (token: string) =>
    ipcRenderer.invoke('snippets:resolveShortcode', token) as Promise<Record<string, unknown> | null>,
  vaultGetState: () =>
    ipcRenderer.invoke('vault:getState') as Promise<{
      configured: boolean;
      unlocked: boolean;
      entryCount: number;
    }>,
  vaultListExternalHooks: () =>
    ipcRenderer.invoke('vault:listExternalHooks') as Promise<
      { id: string; label: string; status: 'planned' }[]
    >,
  vaultSetup: (pin: string) => ipcRenderer.invoke('vault:setup', pin),
  vaultUnlock: (pin: string) => ipcRenderer.invoke('vault:unlock', pin),
  vaultLock: () => ipcRenderer.invoke('vault:lock'),
  vaultChangePin: (oldPin: string, newPin: string) =>
    ipcRenderer.invoke('vault:changePin', oldPin, newPin),
  vaultDisable: (pin: string) => ipcRenderer.invoke('vault:disable', pin),
  vaultListMeta: () =>
    ipcRenderer.invoke('vault:listMeta') as Promise<
      { id: number; created_at: number; type: string; title_hint: string }[]
    >,
  vaultAddFromClip: (clipId: number, titleHint?: string) =>
    ipcRenderer.invoke('vault:addFromClip', clipId, titleHint ?? ''),
  vaultAddManual: (payload: { type?: string; titleHint?: string; content: string }) =>
    ipcRenderer.invoke('vault:addManual', payload),
  vaultDeleteEntry: (entryId: number) => ipcRenderer.invoke('vault:deleteEntry', entryId),
  vaultCopyEntry: (entryId: number) => ipcRenderer.invoke('vault:copyEntry', entryId),
  aiGetKeyStatus: () =>
    ipcRenderer.invoke('ai:getKeyStatus') as Promise<{
      openai: boolean;
      anthropic: boolean;
      hosted: boolean;
    }>,
  aiSetApiKey: (slot: 'openai' | 'anthropic' | 'hosted', key: string) =>
    ipcRenderer.invoke('ai:setApiKey', slot, key) as Promise<{ ok: boolean; error?: string }>,
  aiRunAction: (payload: {
    action: string;
    clipContent: string;
    clipType?: string;
    extra?: string;
    appendToHistory?: boolean;
  }) =>
    ipcRenderer.invoke('ai:runAction', payload) as Promise<
      { ok: true; text: string } | { ok: false; error: string }
    >,
  syncGetStatus: () =>
    ipcRenderer.invoke('sync:getStatus') as Promise<{
      tierOk: boolean;
      enabled: boolean;
      remoteUrl: string;
      lastSyncAt: string;
      lastError: string;
      pendingOutbox: number;
      online: boolean;
      deviceCount: number;
      categoriesJson: string;
    }>,
  syncSaveConfig: (patch: Record<string, string>) =>
    ipcRenderer.invoke('sync:saveConfig', patch) as Promise<{ ok: boolean }>,
  syncPush: (passphrase: string) =>
    ipcRenderer.invoke('sync:push', passphrase) as Promise<{ ok: true } | { ok: false; error: string }>,
  syncPull: (passphrase: string) =>
    ipcRenderer.invoke('sync:pull', passphrase) as Promise<{ ok: true } | { ok: false; error: string }>,
  syncExportBackup: (passphrase: string) =>
    ipcRenderer.invoke('sync:exportBackup', passphrase) as Promise<
      { ok: true; path: string } | { ok: false; error: string }
    >,
  syncImportBackup: (passphrase: string) =>
    ipcRenderer.invoke('sync:importBackup', passphrase) as Promise<{ ok: true } | { ok: false; error: string }>,
  syncProcessOutbox: () => ipcRenderer.invoke('sync:processOutbox') as Promise<{ ok: boolean }>,
  integrationsGetStatus: () =>
    ipcRenderer.invoke('integrations:getStatus') as Promise<{
      outboundEnabled: boolean;
      outboundUrl: string;
      payloadFormat: string;
      hasWebhookHmac: boolean;
      notionPageId: string;
      notionTokenSet: boolean;
      notionOnCapture: boolean;
      slackWebhookUrl: string;
      slackOnCapture: boolean;
      githubTokenSet: boolean;
      jiraSite: string;
      jiraEmail: string;
      jiraTokenSet: boolean;
      jiraCaptureIssueKey: string;
      jiraOnCapture: boolean;
    }>,
  integrationsSaveSettings: (patch: Record<string, string>) =>
    ipcRenderer.invoke('integrations:saveSettings', patch) as Promise<{ ok: boolean }>,
  integrationsSetSecret: (id: string, value: string) =>
    ipcRenderer.invoke('integrations:setSecret', id, value) as Promise<{ ok: boolean; error?: string }>,
  integrationsTestWebhook: () =>
    ipcRenderer.invoke('integrations:testWebhook') as Promise<{ ok: true } | { ok: false; error: string }>,
  integrationsSendNotion: (clipId: number) =>
    ipcRenderer.invoke('integrations:sendNotion', clipId) as Promise<{ ok: true } | { ok: false; error: string }>,
  integrationsSendSlack: (clipId: number) =>
    ipcRenderer.invoke('integrations:sendSlack', clipId) as Promise<{ ok: true } | { ok: false; error: string }>,
  integrationsCreateGist: (payload: { clipId: number; isPublic?: boolean; filename?: string }) =>
    ipcRenderer.invoke('integrations:createGist', payload) as Promise<
      { ok: true; url: string } | { ok: false; error: string }
    >,
  integrationsJiraComment: (payload: { clipId: number; issueKey: string }) =>
    ipcRenderer.invoke('integrations:jiraComment', payload) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  enterpriseGetStatus: () => ipcRenderer.invoke('enterprise:getStatus'),
  enterpriseSaveSettings: (patch: Record<string, string>) =>
    ipcRenderer.invoke('enterprise:saveSettings', patch) as Promise<{ ok: true }>,
  enterpriseSetApiToken: (token: string) =>
    ipcRenderer.invoke('enterprise:setApiToken', token) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  enterpriseFetchPolicy: () =>
    ipcRenderer.invoke('enterprise:fetchPolicy') as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  enterpriseGetCloudAnalytics: () =>
    ipcRenderer.invoke('enterprise:getCloudAnalytics') as Promise<
      | { ok: true; data: unknown }
      | { ok: false; error: string }
    >,
  enterpriseGetCloudBillingSummary: () =>
    ipcRenderer.invoke('enterprise:getCloudBillingSummary') as Promise<
      | { ok: true; data: unknown }
      | { ok: false; error: string }
    >,
  enterpriseGetCloudInvoices: () =>
    ipcRenderer.invoke('enterprise:getCloudInvoices') as Promise<
      | { ok: true; data: unknown }
      | { ok: false; error: string }
    >,
  enterpriseGetCloudTeamActivity: () =>
    ipcRenderer.invoke('enterprise:getCloudTeamActivity') as Promise<
      | { ok: true; data: unknown }
      | { ok: false; error: string }
    >,
  enterpriseImportOrgSnippets: () =>
    ipcRenderer.invoke('enterprise:importOrgSnippets') as Promise<
      | { ok: true; imported: number; errors: string[] }
      | { ok: false; error: string }
    >,
  auditExportJsonl: () =>
    ipcRenderer.invoke('audit:exportJsonl') as Promise<
      { ok: true; path: string } | { ok: false; error: string }
    >,
  auditExportCsv: () =>
    ipcRenderer.invoke('audit:exportCsv') as Promise<
      { ok: true; path: string } | { ok: false; error: string }
    >,
  getAppVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
  updaterCheck: () =>
    ipcRenderer.invoke('updater:check') as Promise<{ ok: boolean; error?: string }>,
  updaterDownload: () =>
    ipcRenderer.invoke('updater:download') as Promise<{ ok: boolean; error?: string }>,
  updaterInstall: () =>
    ipcRenderer.invoke('updater:install') as Promise<{ ok: boolean }>,
  updaterGetStatus: () =>
    ipcRenderer.invoke('updater:getStatus') as Promise<Record<string, unknown>>,
  updaterSetChannel: (channel: 'stable' | 'beta' | 'nightly') =>
    ipcRenderer.invoke('updater:setChannel', channel) as Promise<{ ok: boolean; channel: string }>,
  updaterGetChannel: () =>
    ipcRenderer.invoke('updater:getChannel') as Promise<'stable' | 'beta' | 'nightly'>,
  onUpdaterStatus: (callback: (status: Record<string, unknown>) => void) => {
    const handler = (_event: IpcRendererEvent, status: Record<string, unknown>) => callback(status);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
  // Biometric authentication
  biometricGetCapabilities: () =>
    ipcRenderer.invoke('biometric:getCapabilities') as Promise<{
      available: boolean;
      type: 'touchId' | 'faceId' | 'windowsHello' | 'fingerprint' | 'none';
      enrolled: boolean;
    }>,
  biometricGetSetupInstructions: () =>
    ipcRenderer.invoke('biometric:getSetupInstructions') as Promise<string>,
  biometricIsEnabled: () => ipcRenderer.invoke('biometric:isEnabled') as Promise<boolean>,
  biometricPrompt: (reason: string) =>
    ipcRenderer.invoke('biometric:prompt', reason) as Promise<{ success: boolean; error?: string }>,
  biometricRegisterForVault: () =>
    ipcRenderer.invoke('biometric:registerForVault') as Promise<{
      success: boolean;
      keyId?: string;
      error?: string;
    }>,
  biometricUnregister: (keyId: string) =>
    ipcRenderer.invoke('biometric:unregister', keyId) as Promise<{ ok: boolean }>,
};

contextBridge.exposeInMainWorld('devclip', api);

declare global {
  interface Window {
    devclip: typeof api;
  }
}
