import * as fs from 'fs';
import * as path from 'path';
import { safeStorage } from 'electron';

export type IntegrationSecretId =
  | 'notion'
  | 'github'
  | 'jira'
  | 'webhook_hmac'
  /** Bearer for org policy URL + org snippet feed (Enterprise). */
  | 'enterprise';

function encPath(userData: string, id: IntegrationSecretId): string {
  return path.join(userData, `.integration-secret.${id}`);
}

function plainPath(userData: string, id: IntegrationSecretId): string {
  return path.join(userData, `.integration-secret.${id}.plain`);
}

export function hasIntegrationSecret(userData: string, id: IntegrationSecretId): boolean {
  return fs.existsSync(encPath(userData, id)) || fs.existsSync(plainPath(userData, id));
}

export function readIntegrationSecret(userData: string, id: IntegrationSecretId): string | null {
  const enc = encPath(userData, id);
  const plain = plainPath(userData, id);
  try {
    if (fs.existsSync(enc)) {
      const buf = fs.readFileSync(enc);
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buf);
      }
      return buf.toString('utf8');
    }
    if (fs.existsSync(plain)) {
      return fs.readFileSync(plain, 'utf8');
    }
  } catch {
    return null;
  }
  return null;
}

export function writeIntegrationSecret(userData: string, id: IntegrationSecretId, key: string): void {
  const enc = encPath(userData, id);
  const plain = plainPath(userData, id);
  if (fs.existsSync(plain)) {
    try {
      fs.unlinkSync(plain);
    } catch {
      /* ignore */
    }
  }
  const trimmed = key.trim();
  if (!trimmed) {
    if (fs.existsSync(enc)) {
      try {
        fs.unlinkSync(enc);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(enc, safeStorage.encryptString(trimmed));
  } else {
    fs.writeFileSync(plain, trimmed, 'utf8');
  }
}
