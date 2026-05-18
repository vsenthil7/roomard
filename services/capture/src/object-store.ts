/**
 * Object store abstraction. Local dev uses MinIO (S3 API), prod uses Baidu BOS
 * (S3-compatible) or AWS S3. The S3 SDK works for all three.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createLogger } from '@roomard/logger';
import { IntegrationError } from '@roomard/errors';

const log = createLogger({ name: 'capture.object-store' });

export interface ObjectStoreConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

export function objectStoreConfigFromEnv(): ObjectStoreConfig {
  return {
    endpoint: process.env.OBJECT_STORE_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.OBJECT_STORE_REGION ?? 'us-east-1',
    accessKeyId: process.env.OBJECT_STORE_ACCESS_KEY ?? 'roomard',
    secretAccessKey: process.env.OBJECT_STORE_SECRET_KEY ?? 'roomard-dev-secret',
    bucket: process.env.OBJECT_STORE_BUCKET ?? 'roomard-evidence',
    forcePathStyle: process.env.OBJECT_STORE_FORCE_PATH_STYLE !== 'false',
  };
}

export class ObjectStore {
  private readonly client: S3Client;

  constructor(private readonly cfg: ObjectStoreConfig) {
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: cfg.forcePathStyle,
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<{ uri: string; sha256: string }> {
    const { createHash } = await import('node:crypto');
    const sha256 = createHash('sha256').update(body).digest('hex');
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.cfg.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          Metadata: { sha256 },
          ServerSideEncryption: 'AES256',
        }),
      );
    } catch (err) {
      log.error({ err, key }, 'object store put failed');
      throw new IntegrationError('object store unavailable', { key });
    }
    return { uri: `s3://${this.cfg.bucket}/${key}`, sha256 };
  }

  async get(key: string): Promise<Buffer> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      );
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err) {
      log.error({ err, key }, 'object store get failed');
      throw new IntegrationError('object store unavailable', { key });
    }
  }
}

/** Stub implementation used by unit tests — keeps blobs in memory. */
export class InMemoryObjectStore {
  private readonly blobs = new Map<string, { body: Buffer; contentType: string; sha256: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<{ uri: string; sha256: string }> {
    const { createHash } = await import('node:crypto');
    const sha256 = createHash('sha256').update(body).digest('hex');
    this.blobs.set(key, { body, contentType, sha256 });
    return { uri: `memory://${key}`, sha256 };
  }

  async get(key: string): Promise<Buffer> {
    const b = this.blobs.get(key);
    if (!b) throw new Error(`key not found: ${key}`);
    return b.body;
  }

  size(): number {
    return this.blobs.size;
  }
}

export type AnyObjectStore = Pick<ObjectStore, 'put' | 'get'>;
