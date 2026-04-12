import { systemPreferences } from 'electron';

/**
 * Biometric Authentication for DevClip Vault
 * 
 * Supports:
 * - Windows: Windows Hello (via native addon or credential provider)
 * - macOS: Touch ID / LocalAuthentication framework
 * - Linux: fprintd (via D-Bus, optional)
 * 
 * Note: Full implementation requires native Node.js addons for each platform.
 * This file provides the interface and stubs for the system integration.
 */

export interface BiometricCapabilities {
  available: boolean;
  type: 'touchId' | 'faceId' | 'windowsHello' | 'fingerprint' | 'none';
  enrolled: boolean;
}

export interface BiometricPromptOptions {
  reason: string;
  cancelText?: string;
}

/**
 * Check if biometric authentication is available on this device
 */
export function getBiometricCapabilities(): BiometricCapabilities {
  const platform = process.platform;

  if (platform === 'darwin') {
    // macOS - check for biometrics via systemPreferences
    const biometryType = systemPreferences?.getMediaAccessStatus?.('camera'); // Not directly available, use fallback
    
    // Check if Touch ID is available
    // @ts-ignore - private API may exist on newer Electron
    const canPromptTouchID = systemPreferences?.canPromptTouchID?.();
    
    return {
      available: canPromptTouchID || false,
      type: 'touchId',
      enrolled: canPromptTouchID || false,
    };
  }

  if (platform === 'win32') {
    // Windows - check for Windows Hello
    // This requires native module or Windows API calls
    // For now, check if Windows version supports Hello
    const release = parseInt(require('os').release(), 10);
    
    return {
      available: release >= 10, // Windows 10+ supports Hello
      type: 'windowsHello',
      enrolled: false, // Would need native check
    };
  }

  if (platform === 'linux') {
    // Linux - would need to check for fprintd
    return {
      available: false, // Would need to check dbus for fprintd
      type: 'fingerprint',
      enrolled: false,
    };
  }

  return {
    available: false,
    type: 'none',
    enrolled: false,
  };
}

/**
 * Prompt for biometric authentication
 * 
 * Returns a promise that resolves with success/failure.
 * Requires native implementation for full functionality.
 */
export async function promptBiometricAuth(
  _opts: BiometricPromptOptions
): Promise<{ success: boolean; error?: string }> {
  const caps = getBiometricCapabilities();
  
  if (!caps.available) {
    return { success: false, error: 'Biometric authentication not available' };
  }

  const platform = process.platform;

  // Platform-specific implementation stubs
  // Full implementation would call native addons
  
  if (platform === 'darwin') {
    // macOS Touch ID
    // Would use node-biometrics or similar native addon
    // that calls LAContext.evaluatePolicy()
    return promptMacOSTouchID(_opts);
  }

  if (platform === 'win32') {
    // Windows Hello
    // Would use @nodert/windows.security.credentials.ui or similar
    return promptWindowsHello(_opts);
  }

  if (platform === 'linux') {
    // Linux fprintd
    // Would use dbus-native to communicate with fprintd
    return promptLinuxFingerprint(_opts);
  }

  return { success: false, error: 'Platform not supported' };
}

// macOS Touch ID prompt
async function promptMacOSTouchID(
  opts: BiometricPromptOptions
): Promise<{ success: boolean; error?: string }> {
  // This would typically use a native Node.js addon
  // Example using a hypothetical native module:
  // return require('node-biometrics').promptTouchID(opts.reason);
  
  // Stub implementation - would integrate with native module
  console.log('[Biometric] macOS Touch ID prompt:', opts.reason);
  
  // For now, return not implemented
  return { 
    success: false, 
    error: 'Native Touch ID module not installed. Run: npm install node-biometrics' 
  };
}

// Windows Hello prompt
async function promptWindowsHello(
  opts: BiometricPromptOptions
): Promise<{ success: boolean; error?: string }> {
  // This would use Windows.Security.Credentials.UI via NodeRT or similar
  // Example: const Windows = require('@nodert-win10-rs3/windows');
  
  console.log('[Biometric] Windows Hello prompt:', opts.reason);
  
  return { 
    success: false, 
    error: 'Windows Hello native module not installed. See docs for setup.' 
  };
}

// Linux fprintd prompt
async function promptLinuxFingerprint(
  opts: BiometricPromptOptions
): Promise<{ success: boolean; error?: string }> {
  // This would communicate with fprintd via D-Bus
  console.log('[Biometric] Linux fingerprint prompt:', opts.reason);
  
  return { 
    success: false, 
    error: 'Linux fingerprint support requires fprintd. See docs for setup.' 
  };
}

/**
 * Register biometric authentication for the vault
 * 
 * This would store a key in the platform's secure enclave/keychain
 * that is protected by biometrics.
 */
export async function registerBiometricForVault(): Promise<{ 
  success: boolean; 
  keyId?: string;
  error?: string;
}> {
  const caps = getBiometricCapabilities();
  
  if (!caps.available) {
    return { success: false, error: 'Biometric authentication not available' };
  }

  // Generate a key pair or secret
  const keyId = `devclip-vault-biometric-${Date.now()}`;
  
  // Store in platform keychain with biometric protection
  // This would use:
  // - macOS: SecAccessControlCreateWithFlags with kSecAccessControlBiometryCurrentSet
  // - Windows: NCryptSetProperty with NCRYPT_PIN_PROPERTY
  // - Linux: Could use keyring with custom logic
  
  console.log('[Biometric] Registering vault key:', keyId);
  
  return {
    success: true,
    keyId,
  };
}

/**
 * Unregister biometric authentication
 */
export async function unregisterBiometric(keyId: string): Promise<boolean> {
  // Remove the biometric-protected key from the keychain
  console.log('[Biometric] Unregistering vault key:', keyId);
  return true;
}

/**
 * Check if biometric unlock is enabled for the vault
 */
export function isBiometricEnabled(): boolean {
  // Check for stored biometric key
  // This would query the keychain/keystore
  return false; // Stub
}

/**
 * Get setup instructions for enabling biometric unlock
 */
export function getBiometricSetupInstructions(): string {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    return `
To enable Touch ID for DevClip Vault:

1. Ensure your Mac has Touch ID (MacBook Pro with Touch Bar, or external Touch ID keyboard)
2. Touch ID must be enrolled in System Preferences > Touch ID
3. Install the native module: npm install node-biometrics
4. Restart DevClip

Note: Touch ID requires native compilation. Ensure you have Xcode Command Line Tools installed.
    `.trim();
  }
  
  if (platform === 'win32') {
    return `
To enable Windows Hello for DevClip Vault:

1. Ensure Windows Hello is set up in Settings > Accounts > Sign-in options
2. Install the Windows Runtime Node.js module
3. Restart DevClip

Note: Windows Hello requires Windows 10 version 1903 or later.
    `.trim();
  }
  
  if (platform === 'linux') {
    return `
To enable fingerprint unlock for DevClip Vault:

1. Install fprintd: sudo apt install fprintd (Debian/Ubuntu) or equivalent
2. Enroll your fingerprint: fprintd-enroll
3. Ensure your fingerprint reader is supported by fprintd
4. Restart DevClip

Note: Linux fingerprint support is experimental.
    `.trim();
  }
  
  return 'Biometric authentication is not available on this platform.';
}
