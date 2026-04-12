#!/usr/bin/env node

/**
 * DevClip License Management CLI
 * 
 * Commands:
 *   generate-keys          Generate new RSA key pair for license signing
 *   create                 Create a new license JWT
 *   verify <file>          Verify a license file
 *   inspect <file>         Inspect license contents without verifying
 * 
 * Environment:
 *   LICENSE_PRIVATE_KEY    Path to private key file or PEM content
 *   LICENSE_PUBLIC_KEY     Path to public key file or PEM content
 * 
 * Examples:
 *   node license-cli.mjs generate-keys > keys.json
 *   LICENSE_PRIVATE_KEY="$(cat private.pem)" node license-cli.mjs create --org-id=... --tier=enterprise
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';

// Load env from .env if present
try {
  const require = createRequire(import.meta.url);
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env' });
} catch {}

import {
  generateLicenseKeyPair,
  createLicenseJWT,
  verifyLicenseJWT,
  decodeLicenseJWT,
  getLicenseStatus,
  generateLicenseFile,
  createEnterpriseOfflineLicense,
  LICENSE_TIERS,
} from '../../src/utils/license.mjs';

const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
  console.log(`
DevClip License Management CLI

Commands:
  generate-keys              Generate new RSA key pair
  create [options]            Create a license
  verify <file>              Verify a license file
  inspect <file>             Inspect license (no signature check)
  status <file>              Get detailed license status

Create options:
  --org-id=<uuid>            Organization ID (required)
  --org-name=<name>          Organization name (required)
  --tier=<tier>              Tier: free, pro, enterprise (required)
  --seats=<n>                Max seats (default: 5)
  --days=<n>                 Validity in days (default: 365)
  --hardware-id=<id>         Optional hardware binding
  --output=<file>            Write to file instead of stdout

Environment:
  LICENSE_PRIVATE_KEY        Path or content of private key (PEM)
  LICENSE_PUBLIC_KEY         Path or content of public key (PEM)
`);
}

function loadKey(envVar) {
  const value = process.env[envVar];
  if (!value) return null;
  
  // If value looks like a path (no PEM headers), read the file
  if (!value.includes('-----BEGIN') && !value.includes('-----END')) {
    try {
      return readFileSync(value, 'utf8');
    } catch {
      return value; // Assume it's already the key content
    }
  }
  return value;
}

function parseArgs(args) {
  const options = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      options[key.replace(/-/g, '_')] = value;
    }
  }
  return options;
}

async function main() {
  switch (command) {
    case 'generate-keys': {
      const keys = generateLicenseKeyPair();
      console.log(JSON.stringify(keys, null, 2));
      break;
    }

    case 'create': {
      const opts = parseArgs(args.slice(1));
      
      if (!opts.org_id || !opts.org_name || !opts.tier) {
        console.error('Error: --org-id, --org-name, and --tier are required');
        process.exit(1);
      }

      if (!Object.values(LICENSE_TIERS).includes(opts.tier)) {
        console.error(`Error: Invalid tier. Must be one of: ${Object.values(LICENSE_TIERS).join(', ')}`);
        process.exit(1);
      }

      const days = parseInt(opts.days || '365', 10);
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const license = generateLicenseFile({
        orgId: opts.org_id,
        orgName: opts.org_name,
        tier: opts.tier,
        maxSeats: parseInt(opts.seats || '5', 10),
        expiresAt,
        hardwareId: opts.hardware_id || null,
      });

      if (opts.output) {
        writeFileSync(opts.output, license);
        console.log(`License written to ${opts.output}`);
      } else {
        console.log(license);
      }
      break;
    }

    case 'verify': {
      const file = args[1];
      if (!file) {
        console.error('Error: License file path required');
        process.exit(1);
      }

      try {
        const content = readFileSync(file, 'utf8');
        const licenseData = JSON.parse(content);
        const jwt = licenseData.jwt || licenseData.license_jwt;
        
        if (!jwt) {
          console.error('Error: No JWT found in license file');
          process.exit(1);
        }

        const result = verifyLicenseJWT(jwt);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.valid ? 0 : 1);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'inspect': {
      const file = args[1];
      if (!file) {
        console.error('Error: License file path required');
        process.exit(1);
      }

      try {
        const content = readFileSync(file, 'utf8');
        const licenseData = JSON.parse(content);
        const jwt = licenseData.jwt || licenseData.license_jwt;
        
        if (!jwt) {
          console.error('Error: No JWT found in license file');
          process.exit(1);
        }

        const decoded = decodeLicenseJWT(jwt);
        console.log(JSON.stringify(decoded, null, 2));
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'status': {
      const statusFile = args[1];
      if (!statusFile) {
        console.error('Error: License file path required');
        process.exit(1);
      }

      try {
        const content = readFileSync(statusFile, 'utf8');
        const licenseData = JSON.parse(content);
        const jwt = licenseData.jwt || licenseData.license_jwt;
        
        if (!jwt) {
          console.error('Error: No JWT found in license file');
          process.exit(1);
        }

        const status = getLicenseStatus(jwt);
        console.log(JSON.stringify(status, null, 2));
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default:
      showHelp();
      break;
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
