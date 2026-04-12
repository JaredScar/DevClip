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

export interface DevClipApi {
  getClips: () => Promise<unknown[]>;
  getClipActivityByDay: (
    startUnix: number,
    endUnix: number
  ) => Promise<{ day: string; count: number }[]>;
  getInsightsSummary: (
    startUnix: number,
    endUnix: number
  ) => Promise<{
    windowStart: number;
    windowEnd: number;
    captures: number;
    distinctSources: number;
    topSources: { source: string; count: number }[];
    types: { type: string; count: number }[];
    hourCounts: { hour: number; count: number }[];
    peakHour: number | null;
    avgUseCountCaptured: number;
    sumUseCountCaptured: number;
    topClips: { id: number; preview: string; type: string; use_count: number }[];
    topSnippets: { id: number; title: string; use_count: number }[];
    snippetCount: number;
    last7Days: { day: string; count: number }[];
  }>;
  searchClips: (
    query: string,
    typeFilter: string,
    opts?: ClipSearchOptionsPayload
  ) => Promise<unknown[]>;
  saveClip: (payload: { content: string; type: string; source?: string | null }) => Promise<unknown>;
  togglePin: (id: number) => Promise<unknown>;
  deleteClip: (id: number) => Promise<unknown>;
  incrementClipUse: (id: number) => Promise<unknown>;
  tagClip: (clipId: number, tagName: string) => Promise<unknown>;
  untagClip: (clipId: number, tagName: string) => Promise<unknown>;
  getClipTags: (clipId: number) => Promise<string[]>;
  copyToClipboard: (text: string) => Promise<unknown>;
  copyImageToClipboard: (dataUrl: string) => Promise<unknown>;
  licenseGetStatus: () => Promise<{
    tier: string;
    isEnterprise?: boolean;
    hasKey: boolean;
    expiresAt?: string | null;
    cachedAt?: string | null;
    deviceCount?: number | null;
    features?: string | null;
  }>;
  licenseSetKey: (key: string) => Promise<Record<string, unknown>>;
  licenseClear: () => Promise<Record<string, unknown>>;
  lockGetState: () => Promise<{ enabled: boolean; unlocked: boolean }>;
  lockUnlock: (pin: string) => Promise<{ ok: boolean }>;
  lockLockSession: () => Promise<{ ok: boolean }>;
  lockSetPin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  lockClearPin: () => Promise<{ ok: boolean }>;
  collectionsList: () => Promise<
    {
      id: number;
      name: string;
      is_smart: number;
      query: string | null;
      created_at: string;
      clip_count: number;
    }[]
  >;
  collectionsCreate: (
    name: string,
    opts?: { isSmart?: boolean; query?: string | null }
  ) => Promise<{ id: number }>;
  collectionsRefreshSmart: (id: number) => Promise<{ ok: boolean }>;
  collectionsDelete: (id: number) => Promise<{ ok: boolean }>;
  collectionsAddClip: (collectionId: number, clipId: number) => Promise<{ ok: boolean }>;
  collectionsRemoveClip: (collectionId: number, clipId: number) => Promise<{ ok: boolean }>;
  collectionsExportJson: () => Promise<string>;
  collectionsImportJson: (json: string) => Promise<unknown>;
  automationList: () => Promise<
    {
      id: number;
      name: string;
      enabled: number;
      trigger: string;
      conditions: string;
      actions: string;
      created_at: string;
    }[]
  >;
  automationCreate: (payload: {
    name: string;
    trigger: string;
    conditions: string;
    actions: string;
    enabled?: number;
  }) => Promise<{ id: number }>;
  automationUpdate: (payload: {
    id: number;
    name: string;
    enabled: number;
    trigger: string;
    conditions: string;
    actions: string;
  }) => Promise<{ ok: boolean }>;
  automationDelete: (id: number) => Promise<{ ok: boolean }>;
  hideOverlay: () => Promise<unknown>;
  showMain: () => Promise<unknown>;
  minimizeMain: () => Promise<unknown>;
  openExternalUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
  onNewClip: (callback: (clip: ClipPayload) => void) => () => void;
  settingsGet: () => Promise<Record<string, string>>;
  settingsSet: (key: string, value: string) => Promise<unknown>;
  listTags: () => Promise<{ id: number; name: string }[]>;
  getSnippets: () => Promise<unknown[]>;
  searchSnippets: (query: string) => Promise<unknown[]>;
  saveSnippet: (payload: {
    title: string;
    content: string;
    variables: string;
    tags: string;
    category?: string;
    shortcode?: string | null;
  }) => Promise<unknown>;
  updateSnippet: (payload: {
    id: number;
    title: string;
    content: string;
    variables: string;
    tags: string;
    category?: string;
    shortcode?: string | null;
  }) => Promise<unknown>;
  deleteSnippet: (id: number) => Promise<unknown>;
  toggleSnippetPin: (id: number) => Promise<unknown>;
  incrementSnippetUse: (id: number) => Promise<{ ok: boolean }>;
  cryptoDigest: (algorithm: string, text: string) => Promise<string>;
  exportSnippetsJson: () => Promise<string>;
  importSnippetsJson: (jsonText: string) => Promise<{ imported: number; errors: string[] }>;
  resolveSnippetShortcode: (token: string) => Promise<Record<string, unknown> | null>;
  vaultGetState: () => Promise<{ configured: boolean; unlocked: boolean; entryCount: number }>;
  vaultListExternalHooks: () => Promise<{ id: string; label: string; status: 'planned' }[]>;
  vaultSetup: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  vaultUnlock: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  vaultLock: () => Promise<{ ok: boolean }>;
  vaultChangePin: (oldPin: string, newPin: string) => Promise<{ ok: boolean; error?: string }>;
  vaultDisable: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  vaultListMeta: () => Promise<
    { id: number; created_at: number; type: string; title_hint: string }[]
  >;
  vaultAddFromClip: (
    clipId: number,
    titleHint?: string
  ) => Promise<{ ok: boolean; error?: string; entryId?: number }>;
  vaultAddManual: (payload: {
    type?: string;
    titleHint?: string;
    content: string;
  }) => Promise<{ ok: boolean; error?: string; entryId?: number }>;
  vaultDeleteEntry: (entryId: number) => Promise<{ ok: boolean; error?: string }>;
  vaultCopyEntry: (entryId: number) => Promise<{ ok: boolean; error?: string }>;
  aiGetKeyStatus: () => Promise<{ openai: boolean; anthropic: boolean; hosted: boolean }>;
  aiSetApiKey: (
    slot: 'openai' | 'anthropic' | 'hosted',
    key: string
  ) => Promise<{ ok: boolean; error?: string }>;
  aiRunAction: (payload: {
    action: string;
    clipContent: string;
    clipType?: string;
    extra?: string;
    appendToHistory?: boolean;
  }) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  syncGetStatus: () => Promise<{
    tierOk: boolean;
    enabled: boolean;
    remoteUrl: string;
    lastSyncAt: string;
    lastError: string;
    pendingOutbox: number;
    online: boolean;
    deviceCount: number;
    categoriesJson: string;
  }>;
  syncSaveConfig: (patch: Record<string, string>) => Promise<{ ok: boolean }>;
  syncPush: (passphrase: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  syncPull: (passphrase: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  syncExportBackup: (
    passphrase: string
  ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  syncImportBackup: (passphrase: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  syncProcessOutbox: () => Promise<{ ok: boolean }>;
  integrationsGetStatus: () => Promise<{
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
  }>;
  integrationsSaveSettings: (patch: Record<string, string>) => Promise<{ ok: boolean }>;
  integrationsSetSecret: (id: string, value: string) => Promise<{ ok: boolean; error?: string }>;
  integrationsTestWebhook: () => Promise<{ ok: true } | { ok: false; error: string }>;
  integrationsSendNotion: (clipId: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  integrationsSendSlack: (clipId: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  integrationsCreateGist: (payload: {
    clipId: number;
    isPublic?: boolean;
    filename?: string;
  }) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  integrationsJiraComment: (payload: {
    clipId: number;
    issueKey: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  enterpriseGetStatus: () => Promise<{
    isEnterprise: boolean;
    orgDashboardUrl: string;
    policyUrl: string;
    policyLastOk: string;
    policyLastError: string;
    snippetsFeedUrl: string;
    hasOrgApiToken: boolean;
    auditEventCount: number;
    auditRetentionDays: string;
    policyDisableAi: boolean;
    policyDisableSync: boolean;
    policyForcePrivate: boolean;
    policySignatureValid: boolean;
  }>;
  enterpriseSaveSettings: (patch: Record<string, string>) => Promise<{ ok: true }>;
  enterpriseSetApiToken: (token: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  enterpriseFetchPolicy: () => Promise<{ ok: true; signatureValid: boolean } | { ok: false; error: string }>;
  enterpriseImportOrgSnippets: () => Promise<
    { ok: true; imported: number; errors: string[] } | { ok: false; error: string }
  >;
  auditExportJsonl: () => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  auditExportCsv: () => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  getAppVersion: () => Promise<string>;
  updaterCheck: () => Promise<{ ok: boolean; error?: string }>;
  updaterDownload: () => Promise<{ ok: boolean; error?: string }>;
  updaterInstall: () => Promise<{ ok: boolean }>;
  updaterGetStatus: () => Promise<Record<string, unknown>>;
  onUpdaterStatus: (callback: (status: Record<string, unknown>) => void) => () => void;
}

declare global {
  interface Window {
    devclip: DevClipApi;
  }
}

export {};
