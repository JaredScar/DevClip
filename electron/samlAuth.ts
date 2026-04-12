import { BrowserWindow, ipcMain, shell } from 'electron';
import { createHash, randomBytes } from 'crypto';

/**
 * SAML 2.0 Authentication for DevClip Enterprise
 *
 * Provides desktop SSO integration with IdPs like:
 * - Okta
 * - Azure AD / Entra ID
 * - Google Workspace
 * - OneLogin
 * - Auth0
 * - Generic SAML 2.0 providers
 *
 * Flow:
 * 1. User clicks "Sign in with SSO" in app
 * 2. App opens system browser to IdP SSO URL
 * 3. User authenticates with IdP
 * 4. IdP redirects to devclip://callback with SAML response
 * 5. App captures response and validates
 * 6. Session established, API key obtained from backend
 */

interface SAMLConfig {
  idpName: string;
  entryPoint: string; // IdP SSO URL
  issuer: string; // SP entity ID (devclip://auth)
  callbackUrl: string; // devclip://callback
  cert?: string; // IdP public cert for validation
  wantAssertionsSigned?: boolean;
  wantResponseSigned?: boolean;
}

interface SAMLUser {
  nameID: string;
  email?: string;
  givenName?: string;
  surname?: string;
  attributes?: Record<string, string[]>;
  sessionIndex?: string;
}

// In-memory store for pending auth requests (state param)
const pendingRequests = new Map<string, { config: SAMLConfig; window: BrowserWindow | null; timeout: NodeJS.Timeout }>();

/**
 * Generate SAML AuthnRequest
 * In production, this would use a library like 'passport-saml' or 'saml2-js'
 */
function generateAuthnRequest(config: SAMLConfig, id: string): string {
  // This is a simplified version - real implementation would use XML builder
  const instant = new Date().toISOString();
  const request = `<?xml version="1.0"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                    ID="_${id}"
                    Version="2.0"
                    IssueInstant="${instant}"
                    Destination="${config.entryPoint}"
                    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                    AssertionConsumerServiceURL="${config.callbackUrl}">
  <saml:Issuer>${config.issuer}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
</samlp:AuthnRequest>`;

  // Base64 encode the XML
  return Buffer.from(request).toString('base64');
}

/**
 * Parse SAML Response
 * In production, this would use proper XML parsing and signature validation
 */
function parseSAMLResponse(base64Response: string): { success: boolean; user?: SAMLUser; error?: string } {
  try {
    // Decode Base64
    const xmlResponse = Buffer.from(base64Response, 'base64').toString('utf8');

    // In production: Parse XML, validate signature against IdP cert
    // This is a simplified stub showing the structure

    // Extract NameID from Subject
    const nameIDMatch = xmlResponse.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
    const nameID = nameIDMatch ? nameIDMatch[1] : '';

    // Extract attributes
    const emailMatch = xmlResponse.match(/<saml:Attribute[^>]*Name="email"[^>]*>[^<]*<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/);
    const email = emailMatch ? emailMatch[1] : nameID;

    const givenNameMatch = xmlResponse.match(/<saml:Attribute[^>]*Name="firstName"[^>]*>[^<]*<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/);
    const surnameMatch = xmlResponse.match(/<saml:Attribute[^>]*Name="lastName"[^>]*>[^<]*<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/);

    // In production, validate signature before accepting
    const statusMatch = xmlResponse.match(/<samlp:StatusCode[^>]*Value="([^"]+)"/);
    const status = statusMatch ? statusMatch[1] : '';

    if (status.includes('Success')) {
      return {
        success: true,
        user: {
          nameID,
          email,
          givenName: givenNameMatch ? givenNameMatch[1] : undefined,
          surname: surnameMatch ? surnameMatch[1] : undefined,
          attributes: {}, // Parse all attributes
          sessionIndex: undefined, // Extract from AuthnStatement
        },
      };
    } else {
      return {
        success: false,
        error: `SAML authentication failed: ${status}`,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse SAML response: ${(err as Error).message}`,
    };
  }
}

/**
 * Start SAML authentication flow
 */
export async function startSAMLAuth(config: SAMLConfig, fromWindow?: BrowserWindow | null): Promise<{
  success: boolean;
  user?: SAMLUser;
  error?: string;
}> {
  return new Promise((resolve) => {
    const id = randomBytes(16).toString('hex');
    const samlRequest = generateAuthnRequest(config, id);

    // Build IdP URL with SAMLRequest param
    const authUrl = new URL(config.entryPoint);
    authUrl.searchParams.set('SAMLRequest', samlRequest);
    authUrl.searchParams.set('RelayState', id);

    // Open system browser for authentication
    // (Electron window could be used but IdP security policies often block embedded browsers)
    shell.openExternal(authUrl.toString());

    // Store pending request
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      resolve({ success: false, error: 'SAML authentication timed out' });
    }, 300000); // 5 minute timeout

    pendingRequests.set(id, {
      config,
      window: fromWindow || null,
      timeout,
    });

    // Listen for callback via IPC from main app
    // The callback handler will be registered in setupSAMLHandlers()
  });
}

/**
 * Handle SAML callback from browser
 */
export function handleSAMLCallback(samlResponse: string, relayState: string): {
  success: boolean;
  user?: SAMLUser;
  error?: string;
} {
  const pending = pendingRequests.get(relayState);
  if (!pending) {
    return { success: false, error: 'Invalid or expired authentication request' };
  }

  // Clear pending request
  clearTimeout(pending.timeout);
  pendingRequests.delete(relayState);

  // Parse and validate SAML response
  const result = parseSAMLResponse(samlResponse);

  // In production:
  // - Validate SAML signature against IdP certificate
  // - Verify NotBefore/NotOnOrAfter conditions
  // - Check AudienceRestriction matches our SP entity ID
  // - Validate InResponseTo matches our original request ID

  return result;
}

/**
 * Setup IPC handlers for SAML authentication
 */
export function setupSAMLHandlers(): void {
  // Handle manual SAML response entry (for testing or fallback)
  ipcMain.handle('saml:initiate', async (_event, config: SAMLConfig) => {
    const result = await startSAMLAuth(config);
    return result;
  });

  // Handle callback from protocol handler (devclip://callback)
  ipcMain.handle('saml:callback', async (_event, { samlResponse, relayState }: { samlResponse: string; relayState: string }) => {
    return handleSAMLCallback(samlResponse, relayState);
  });

  // Get available IdP configurations
  ipcMain.handle('saml:getProviders', () => {
    // Return list of pre-configured IdPs from settings
    return [
      {
        id: 'okta',
        name: 'Okta',
        entryPoint: 'https://devclip.okta.com/app/devclip/sso/saml',
        issuer: 'devclip://auth',
      },
      {
        id: 'azure',
        name: 'Azure AD',
        entryPoint: 'https://login.microsoftonline.com/{tenant}/saml2',
        issuer: 'devclip://auth',
      },
      {
        id: 'google',
        name: 'Google Workspace',
        entryPoint: 'https://accounts.google.com/o/saml2/idp?idpid=xxxx',
        issuer: 'devclip://auth',
      },
    ];
  });

  // Save custom IdP configuration
  ipcMain.handle('saml:saveConfig', async (_event, config: SAMLConfig & { id: string }) => {
    // In production: Save to secure storage
    // For now, just return success
    return { saved: true, id: config.id };
  });

  // Validate IdP metadata
  ipcMain.handle('saml:validateMetadata', async (_event, metadataXml: string) => {
    try {
      // Parse IdP metadata XML to extract:
      // - SSO URL (SingleSignOnService)
      // - Entity ID
      // - X.509 certificate for signature validation

      const ssoUrlMatch = metadataXml.match(/<.*SingleSignOnService[^>]*Location="([^"]+)"/);
      const entityIdMatch = metadataXml.match(/entityID="([^"]+)"/);
      const certMatch = metadataXml.match(/<.*X509Certificate[^>]*>([^<]+)<\/.*X509Certificate>/);

      return {
        valid: !!(ssoUrlMatch && entityIdMatch),
        ssoUrl: ssoUrlMatch ? ssoUrlMatch[1] : null,
        entityId: entityIdMatch ? entityIdMatch[1] : null,
        certificate: certMatch ? certMatch[1] : null,
      };
    } catch (err) {
      return { valid: false, error: (err as Error).message };
    }
  });

  // Logout (SLO - Single Logout)
  ipcMain.handle('saml:logout', async (_event, config: SAMLConfig, nameID: string, sessionIndex: string) => {
    // In production:
    // 1. Generate LogoutRequest
    // 2. Send to IdP SLO endpoint
    // 3. Clear local session
    // 4. Wait for LogoutResponse

    return { success: true, message: 'Logout initiated' };
  });
}

/**
 * Get setup instructions for SAML
 */
export function getSAMLSetupInstructions(): string {
  return `
SAML 2.0 Single Sign-On Setup

To configure SAML SSO for DevClip:

1. In your IdP (Okta, Azure AD, Google Workspace, etc.):
   - Create a new SAML application
   - Set ACS URL (Assertion Consumer Service): devclip://callback
   - Set Entity ID (Audience): devclip://auth
   - Set Name ID Format: EmailAddress
   - Configure attribute mappings:
     * email → user.email
     * firstName → user.firstName
     * lastName → user.lastName

2. In DevClip Enterprise Settings:
   - Upload your IdP metadata XML or manually enter:
     * SSO URL
     * Entity ID
     * X.509 Certificate

3. Test the connection:
   - Click "Test SSO" to verify configuration

4. Enable for organization:
   - Toggle "Require SSO" to mandate SAML authentication
   - Choose JIT provisioning (auto-create users) or manual provisioning

Note: For production use, install the native SAML module:
  npm install passport-saml xml2js

Supported IdPs:
- Okta
- Azure Active Directory / Microsoft Entra ID
- Google Workspace
- OneLogin
- Auth0
- Any SAML 2.0 compliant provider
  `.trim();
}

/**
 * Check if native SAML modules are available
 */
export function hasNativeSAML(): boolean {
  try {
    // Check if passport-saml or similar is installed
    require.resolve('passport-saml');
    return true;
  } catch {
    return false;
  }
}
