import * as fs from 'fs';
import * as path from 'path';
import { safeStorage } from 'electron';

export function licenseKeyFilePath(userData: string): string {
  return path.join(userData, '.license-key');
}

function licenseKeyPlainPath(userData: string): string {
  return path.join(userData, '.license-key.plain');
}

export function hasStoredLicenseKey(userData: string): boolean {
  return (
    fs.existsSync(licenseKeyFilePath(userData)) ||
    fs.existsSync(licenseKeyPlainPath(userData))
  );
}

export function readLicenseKey(userData: string): string | null {
  const encPath = licenseKeyFilePath(userData);
  const plainPath = licenseKeyPlainPath(userData);
  try {
    if (fs.existsSync(encPath)) {
      const buf = fs.readFileSync(encPath);
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buf);
      }
      return buf.toString('utf8');
    }
    if (fs.existsSync(plainPath)) {
      return fs.readFileSync(plainPath, 'utf8');
    }
  } catch {
    return null;
  }
  return null;
}

export function writeLicenseKey(userData: string, key: string): void {
  const encPath = licenseKeyFilePath(userData);
  const plainPath = licenseKeyPlainPath(userData);
  if (fs.existsSync(plainPath)) {
    try {
      fs.unlinkSync(plainPath);
    } catch {
      /* ignore */
    }
  }
  const trimmed = key.trim();
  if (!trimmed) {
    if (fs.existsSync(encPath)) {
      try {
        fs.unlinkSync(encPath);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString(trimmed);
    fs.writeFileSync(encPath, enc);
  } else {
    fs.writeFileSync(plainPath, trimmed, 'utf8');
  }
}
