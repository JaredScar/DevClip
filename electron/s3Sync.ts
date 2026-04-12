/**
 * S3-Compatible Sync Storage for DevClip
 *
 * Enables syncing encrypted bundles to S3-compatible object storage
 * such as AWS S3, MinIO, Wasabi, Backblaze B2, or self-hosted options.
 */

import { createHash, createHmac } from 'crypto';

export interface S3SyncConfig {
  endpoint: string; // e.g., https://s3.amazonaws.com or https://minio.example.com
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string; // Optional path prefix, e.g., 'devclip/'
  forcePathStyle?: boolean; // For MinIO and other self-hosted S3
}

interface S3Object {
  key: string;
  lastModified: Date;
  etag: string;
  size: number;
}

/**
 * Generate AWS Signature Version 4 for S3 API requests
 */
function generateAWSSignature(
  method: string,
  url: URL,
  headers: Record<string, string>,
  payload: string,
  config: S3SyncConfig
): Record<string, string> {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
  const service = 's3';

  // Create canonical request
  const canonicalUri = url.pathname;
  const canonicalQuerystring = url.search.slice(1);
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k.toLowerCase()}:${headers[k].trim()}\n`)
    .join('');
  const signedHeaders = Object.keys(headers)
    .sort()
    .map((k) => k.toLowerCase())
    .join(';');
  const payloadHash = createHash('sha256').update(payload).digest('hex');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // Create string to sign
  const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timeStamp,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  // Calculate signature
  const dateKey = createHmac('sha256', `AWS4${config.secretAccessKey}`).update(dateStamp).digest();
  const dateRegionKey = createHmac('sha256', dateKey).update(config.region).digest();
  const dateRegionServiceKey = createHmac('sha256', dateRegionKey).update(service).digest();
  const signingKey = createHmac('sha256', dateRegionServiceKey).update('aws4_request').digest();
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'X-Amz-Date': timeStamp,
  };
}

/**
 * S3 Sync Provider implementation
 */
export class S3SyncProvider {
  private config: S3SyncConfig;

  constructor(config: S3SyncConfig) {
    this.config = config;
  }

  /**
   * Build the full URL for an S3 object
   */
  private getObjectUrl(key: string): string {
    const { endpoint, bucket, forcePathStyle } = this.config;
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');

    if (forcePathStyle) {
      // Path-style: https://endpoint/bucket/key
      return `${endpoint}/${bucket}/${encodedKey}`;
    }
    // Virtual-hosted-style: https://bucket.endpoint/key
    return `${endpoint.replace(/:\/\//, `://${bucket}.`)}${encodedKey}`;
  }

  /**
   * Upload an encrypted sync bundle to S3
   */
  async uploadBundle(deviceId: string, bundleData: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const key = `${this.config.prefix || ''}sync/${deviceId}/bundle.json`;
      const url = this.getObjectUrl(key);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(bundleData)),
        'x-amz-content-sha256': createHash('sha256').update(bundleData).digest('hex'),
        Host: new URL(url).host,
      };

      const authHeaders = generateAWSSignature('PUT', new URL(url), headers, bundleData, this.config);

      const response = await fetch(url, {
        method: 'PUT',
        headers: { ...headers, ...authHeaders },
        body: bundleData,
      });

      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `S3 upload failed: ${response.status} ${text}` };
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: `S3 upload error: ${(err as Error).message}` };
    }
  }

  /**
   * Download the latest sync bundle from S3
   */
  async downloadBundle(deviceId: string): Promise<{ ok: boolean; data?: string; error?: string }> {
    try {
      const key = `${this.config.prefix || ''}sync/${deviceId}/bundle.json`;
      const url = this.getObjectUrl(key);

      const headers: Record<string, string> = {
        Host: new URL(url).host,
      };

      const authHeaders = generateAWSSignature('GET', new URL(url), headers, '', this.config);

      const response = await fetch(url, {
        method: 'GET',
        headers: { ...headers, ...authHeaders },
      });

      if (response.status === 404) {
        return { ok: true, data: '' }; // No bundle yet
      }

      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `S3 download failed: ${response.status} ${text}` };
      }

      const data = await response.text();
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: `S3 download error: ${(err as Error).message}` };
    }
  }

  /**
   * List sync bundles from S3 (for multi-device sync)
   */
  async listBundles(): Promise<{ ok: boolean; objects?: S3Object[]; error?: string }> {
    try {
      const prefix = `${this.config.prefix || ''}sync/`;
      const url = new URL(`${this.config.endpoint}/${this.config.bucket}`);
      url.searchParams.set('list-type', '2');
      url.searchParams.set('prefix', prefix);

      const headers: Record<string, string> = {
        Host: url.host,
      };

      const authHeaders = generateAWSSignature('GET', url, headers, '', this.config);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { ...headers, ...authHeaders },
      });

      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `S3 list failed: ${response.status} ${text}` };
      }

      const xml = await response.text();

      // Parse simple XML response (in real implementation, use proper XML parser)
      const objects: S3Object[] = [];
      const keyMatches = xml.match(/<Key>([^<]+)<\/Key>/g);
      const dateMatches = xml.match(/<LastModified>([^<]+)<\/LastModified>/g);
      const etagMatches = xml.match(/<ETag>([^<]+)<\/ETag>/g);
      const sizeMatches = xml.match(/<Size>(\d+)<\/Size>/g);

      if (keyMatches) {
        for (let i = 0; i < keyMatches.length; i++) {
          objects.push({
            key: keyMatches[i].replace(/<\/?Key>/g, ''),
            lastModified: new Date(dateMatches?.[i]?.replace(/<\/?LastModified>/g, '') || ''),
            etag: etagMatches?.[i]?.replace(/<\/?ETag>/g, '') || '',
            size: parseInt(sizeMatches?.[i]?.replace(/<\/?Size>/g, '') || '0', 10),
          });
        }
      }

      return { ok: true, objects };
    } catch (err) {
      return { ok: false, error: `S3 list error: ${(err as Error).message}` };
    }
  }

  /**
   * Delete a sync bundle from S3
   */
  async deleteBundle(deviceId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const key = `${this.config.prefix || ''}sync/${deviceId}/bundle.json`;
      const url = this.getObjectUrl(key);

      const headers: Record<string, string> = {
        Host: new URL(url).host,
      };

      const authHeaders = generateAWSSignature('DELETE', new URL(url), headers, '', this.config);

      const response = await fetch(url, {
        method: 'DELETE',
        headers: { ...headers, ...authHeaders },
      });

      if (!response.ok && response.status !== 404) {
        const text = await response.text();
        return { ok: false, error: `S3 delete failed: ${response.status} ${text}` };
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: `S3 delete error: ${(err as Error).message}` };
    }
  }
}

/**
 * Validate S3 configuration
 */
export function validateS3Config(config: Partial<S3SyncConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.endpoint) errors.push('Endpoint is required');
  if (!config.bucket) errors.push('Bucket name is required');
  if (!config.region) errors.push('Region is required');
  if (!config.accessKeyId) errors.push('Access Key ID is required');
  if (!config.secretAccessKey) errors.push('Secret Access Key is required');

  if (config.endpoint) {
    try {
      new URL(config.endpoint);
    } catch {
      errors.push('Endpoint must be a valid URL');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Common S3-compatible providers presets
 */
export const S3_PROVIDER_PRESETS = {
  aws: {
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1',
  },
  minio: {
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    forcePathStyle: true,
  },
  wasabi: {
    endpoint: 'https://s3.wasabisys.com',
    region: 'us-east-1',
  },
  backblaze: {
    endpoint: 'https://s3.us-west-002.backblazeb2.com',
    region: 'us-west-002',
  },
  digitalocean: {
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    region: 'nyc3',
  },
};
