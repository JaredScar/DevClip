const { notarize } = require('@electron/notarize');

/**
 * Notarization hook for electron-builder
 * Called automatically during macOS build if APPLE_ID and APPLE_PASSWORD env vars are set
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  // Skip notarization in development if no credentials
  if (!process.env.APPLE_ID || !process.env.APPLE_PASSWORD) {
    console.warn('Skipping notarization: APPLE_ID and/or APPLE_PASSWORD not set');
    return;
  }

  console.log(`Notarizing ${appPath}...`);

  await notarize({
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID, // Optional, for teams with multiple signing identities
  });

  console.log('Notarization complete!');
};
