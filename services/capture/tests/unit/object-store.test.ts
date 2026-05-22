/**
 * Unit tests for the object-store abstraction (CP-59).
 *
 * The real ObjectStore wraps the AWS S3 SDK (used against MinIO in dev, BOS/S3
 * in prod). We mock @aws-sdk/client-s3 so both the success path and the
 * IntegrationError-on-failure path are covered without a live MinIO. The
 * InMemoryObjectStore stub and objectStoreConfigFromEnv are tested directly.
 */
import { IntegrationError } from '@roomard/errors';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the S3 SDK. send() is a vi.fn we can resolve or reject per test.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = sendMock;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

const { ObjectStore, InMemoryObjectStore, objectStoreConfigFromEnv } = await import(
  '../../src/object-store.js'
);

const cfg = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  accessKeyId: 'k',
  secretAccessKey: 's',
  bucket: 'test-bucket',
  forcePathStyle: true,
  serverSideEncryption: false,
};

describe('objectStoreConfigFromEnv', () => {
  const orig = { ...process.env };
  beforeEach(() => {
    process.env = { ...orig };
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('OBJECT_STORE_') || k.startsWith('S3_')) delete process.env[k];
    }
  });

  it('returns sensible MinIO dev defaults when nothing is set', () => {
    const c = objectStoreConfigFromEnv();
    expect(c.endpoint).toBe('http://localhost:9000');
    expect(c.bucket).toBe('roomard-evidence');
    expect(c.forcePathStyle).toBe(true);
    // G-51: SSE defaults OFF (dev MinIO has no KMS).
    expect(c.serverSideEncryption).toBe(false);
  });

  it('reads overrides from the environment (OBJECT_STORE_* alias)', () => {
    process.env.OBJECT_STORE_ENDPOINT = 'https://bos.example.com';
    process.env.OBJECT_STORE_BUCKET = 'prod-evidence';
    process.env.OBJECT_STORE_FORCE_PATH_STYLE = 'false';
    const c = objectStoreConfigFromEnv();
    expect(c.endpoint).toBe('https://bos.example.com');
    expect(c.bucket).toBe('prod-evidence');
    expect(c.forcePathStyle).toBe(false);
  });

  it('G-50: reads the S3_* names docker-compose actually provides', () => {
    process.env.S3_ENDPOINT = 'http://minio:9000';
    process.env.S3_ACCESS_KEY = 'roomard_minio';
    process.env.S3_SECRET_KEY = 'roomard_minio_dev_pwd';
    process.env.S3_BUCKET_EVIDENCE = 'roomard-evidence';
    process.env.S3_SSE = 'true';
    const c = objectStoreConfigFromEnv();
    expect(c.endpoint).toBe('http://minio:9000');
    expect(c.accessKeyId).toBe('roomard_minio');
    expect(c.secretAccessKey).toBe('roomard_minio_dev_pwd');
    expect(c.bucket).toBe('roomard-evidence');
    expect(c.serverSideEncryption).toBe(true);
  });
});

describe('ObjectStore (S3 SDK mocked)', () => {
  beforeEach(() => sendMock.mockReset());

  it('put returns an s3:// uri + sha256 and sends a PutObjectCommand', async () => {
    sendMock.mockResolvedValueOnce({});
    const store = new ObjectStore(cfg);
    const body = Buffer.from('hello evidence');
    const { uri, sha256 } = await store.put('evidence/abc.jpg', body, 'image/jpeg');
    expect(uri).toBe('s3://test-bucket/evidence/abc.jpg');
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('put omits ServerSideEncryption by default (G-51: dev MinIO has no KMS)', async () => {
    sendMock.mockResolvedValueOnce({});
    const store = new ObjectStore(cfg);
    await store.put('k', Buffer.from('x'), 'image/jpeg');
    const cmd = sendMock.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(cmd.input.ServerSideEncryption).toBeUndefined();
  });

  it('put sends ServerSideEncryption when enabled', async () => {
    sendMock.mockResolvedValueOnce({});
    const store = new ObjectStore({ ...cfg, serverSideEncryption: true });
    await store.put('k', Buffer.from('x'), 'image/jpeg');
    const cmd = sendMock.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(cmd.input.ServerSideEncryption).toBe('AES256');
  });

  it('put wraps an SDK failure in IntegrationError', async () => {
    sendMock.mockRejectedValueOnce(new Error('connection refused'));
    const store = new ObjectStore(cfg);
    await expect(store.put('k', Buffer.from('x'), 'image/jpeg')).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it('get streams the object body back as a Buffer', async () => {
    async function* chunks(): AsyncIterable<Buffer> {
      yield Buffer.from('part1-');
      yield Buffer.from('part2');
    }
    sendMock.mockResolvedValueOnce({ Body: chunks() });
    const store = new ObjectStore(cfg);
    const out = await store.get('evidence/abc.jpg');
    expect(out.toString()).toBe('part1-part2');
  });

  it('get wraps an SDK failure in IntegrationError', async () => {
    sendMock.mockRejectedValueOnce(new Error('no such key'));
    const store = new ObjectStore(cfg);
    await expect(store.get('missing')).rejects.toBeInstanceOf(IntegrationError);
  });
});

describe('InMemoryObjectStore', () => {
  it('round-trips a blob and reports size', async () => {
    const store = new InMemoryObjectStore();
    const body = Buffer.from('in-memory blob');
    const { uri, sha256 } = await store.put('k1', body, 'image/png');
    expect(uri).toBe('memory://k1');
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(store.size()).toBe(1);
    const got = await store.get('k1');
    expect(got.toString()).toBe('in-memory blob');
  });

  it('throws when a key is not found', async () => {
    const store = new InMemoryObjectStore();
    await expect(store.get('nope')).rejects.toThrow(/key not found/);
  });
});
