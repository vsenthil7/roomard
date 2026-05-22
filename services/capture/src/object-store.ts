/**
 * Object store abstraction. Local dev uses MinIO (S3 API), prod uses Baidu BOS
 * (S3-compatible) or AWS S3. The S3 SDK works for all three.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { IntegrationError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';

const log = createLogger({ name: 'capture.object-store' });

export interface ObjectStoreConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
  /** Send ServerSideEncryption: AES256 on put. Off for dev MinIO (no KMS); on in prod. */
  serverSideEncryption: boolean;
}

export function objectStoreConfigFromEnv(): ObjectStoreConfig {
  // G-50: docker-compose (and the deployment contract) provide the object-store
  // config under the S3_* names; earlier code only read OBJECT_STORE_* and so
  // silently fell back to http://localhost:9000 with the wrong credentials,
  // which inside the container is nothing — every capture failed with
  // ECONNREFUSED -> 502 “object store unavailable”. Prefer S3_* (what the infra
  // sets), keep OBJECT_STORE_* as an accepted alias, then the dev default.
  const env = process.env;
  return {
    endpoint: env.S3_ENDPOINT ?? env.OBJECT_STORE_ENDPOINT ?? 'http://localhost:9000',
    region: env.S3_REGION ?? env.OBJECT_STORE_REGION ?? 'us-east-1',
    accessKeyId: env.S3_ACCESS_KEY ?? env.OBJECT_STORE_ACCESS_KEY ?? 'roomard',
    secretAccessKey: env.S3_SECRET_KEY ?? env.OBJECT_STORE_SECRET_KEY ?? 'roomard-dev-secret',
    bucket: env.S3_BUCKET_EVIDENCE ?? env.OBJECT_STORE_BUCKET ?? 'roomard-evidence',
    forcePathStyle:
      (env.S3_FORCE_PATH_STYLE ?? env.OBJECT_STORE_FORCE_PATH_STYLE) !== 'false',
    // G-51: dev MinIO has no KMS, so SSE-S3 (AES256) puts fail with 501
    // NotImplemented. Default OFF; real deployments set S3_SSE=true (BOS/S3
    // honour AES256 natively).
    serverSideEncryption: (env.S3_SSE ?? env.OBJECT_STORE_SSE) === 'true',
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
          ...(this.cfg.serverSideEncryption ? { ServerSideEncryption: 'AES256' as const } : {}),
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
