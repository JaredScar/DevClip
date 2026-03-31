/** Placeholder registry for future password-manager / secrets integrations (§5.7). */

export interface VaultExternalProviderInfo {
  id: string;
  label: string;
  status: 'planned';
}

export function listVaultExternalProviderHooks(): VaultExternalProviderInfo[] {
  return [
    { id: 'browser_password', label: 'Browser password manager', status: 'planned' },
    { id: '1password', label: '1Password', status: 'planned' },
  ];
}
