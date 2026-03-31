import * as fs from 'fs';
import * as path from 'path';
import { safeStorage } from 'electron';

export type AiSecretId = 'openai' | 'anthropic' | 'hosted';

function encPath(userData: string, id: AiSecretId): string {
  return path.join(userData, `.ai-secret.${id}`);
}

function plainPath(userData: string, id: AiSecretId): string {
  return path.join(userData, `.ai-secret.${id}.plain`);
}

export function hasAiSecret(userData: string, id: AiSecretId): boolean {
  return fs.existsSync(encPath(userData, id)) || fs.existsSync(plainPath(userData, id));
}

export function readAiSecret(userData: string, id: AiSecretId): string | null {
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

export function writeAiSecret(userData: string, id: AiSecretId, key: string): void {
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
