/** Shared HTTPS (or localhost HTTP) allowlist for outbound integration URLs. */
export function isAllowedIntegrationUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
