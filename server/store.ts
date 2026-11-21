import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  NOMINATIONS,
  TEACHERS,
  type VoteRecord,
} from '../src/data/electionData.ts';

export interface VotingDatabase {
  version: number;
  adminPasscodeHash: string | null;
  votes: VoteRecord[];
}

export type StorageMode = 'redis' | 'file' | 'tmp';

const REDIS_KEY = 'nominasi_guru:voting_db:v2';
const LOCAL_DATA_DIR = path.resolve(process.cwd(), 'data');
const LOCAL_DB_PATH = path.join(LOCAL_DATA_DIR, 'voting-db.json');
const TMP_DB_PATH = path.join(os.tmpdir(), 'nominasi-guru-voting-db.json');

let writeLock: Promise<void> = Promise.resolve();
let forceTmpStorage = Boolean(process.env.VERCEL);

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeLock.then(fn, fn);
  writeLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

const warnedInvalidUrls = new Set<string>();
const failedRedisEndpoints = new Set<string>();
const verifiedRedisEndpoints = new Set<string>();

function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function getRedisConfig(): { url: string; token: string; key: string } | null {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    '';
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    '';
  if (!url || !token) {
    return null;
  }
  if (!isValidHttpUrl(url)) {
    if (!warnedInvalidUrls.has(url)) {
      warnedInvalidUrls.add(url);
      console.warn(
        `[store] Invalid Redis REST URL ("${url}"). Falling back to local filesystem storage.`
      );
    }
    return null;
  }
  const normalizedUrl = url.replace(/\/+$/, '');
  const key = `${normalizedUrl}::${token}`;
  if (failedRedisEndpoints.has(key)) {
    return null;
  }
  return { url: normalizedUrl, token, key };
}

export function getStorageMode(): StorageMode {
  if (getRedisConfig()) return 'redis';
  if (forceTmpStorage) return 'tmp';
  return 'file';
}

function buildSeedDatabase(): VotingDatabase {
  const votes: VoteRecord[] = [];

  const sampleVoters = [
    { id: 'vote-seed-001', fullName: 'Nadia Putri Pratama', className: '91', offset: 0 },
    { id: 'vote-seed-002', fullName: 'Rafi Akbar Maulana', className: '83', offset: 2 },
  ];

  for (const voter of sampleVoters) {
    const selections: Record<string, string> = {};
    TEACHERS.forEach((teacher, idx) => {
      const cat = NOMINATIONS[(idx + voter.offset) % NOMINATIONS.length];
      selections[teacher.id] = cat.id;
    });

    votes.push({
      id: voter.id,
      fullName: voter.fullName,
      className: voter.className,
      submittedAt: '2026-11-20T08:30:00.000Z',
      selections,
    });
  }

  return {
    version: 2,
    adminPasscodeHash: null,
    votes,
  };
}

async function readFromRedis(
  url: string,
  token: string,
  endpointKey: string
): Promise<VotingDatabase> {
  const res = await fetch(`${url}/get/${encodeURIComponent(REDIS_KEY)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Gagal membaca database Redis (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as { result?: string | null };
  verifiedRedisEndpoints.add(endpointKey);
  if (typeof json.result === 'string' && json.result.length > 0) {
    const parsed = JSON.parse(json.result) as VotingDatabase;
    if (Array.isArray(parsed.votes)) {
      return parsed;
    }
  }
  const seed = buildSeedDatabase();
  await writeToRedis(url, token, seed);
  return seed;
}

async function writeToRedis(
  url: string,
  token: string,
  db: VotingDatabase
): Promise<void> {
  const res = await fetch(`${url}/set/${encodeURIComponent(REDIS_KEY)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(JSON.stringify(db)),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Gagal menyimpan database ke Redis (HTTP ${res.status}).`);
  }
}

async function atomicWriteFile(targetPath: string, db: VotingDatabase): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`
  );
  await fs.writeFile(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(tmpPath, targetPath);
}

async function readFromFilesystem(): Promise<VotingDatabase> {
  const activePath = forceTmpStorage ? TMP_DB_PATH : LOCAL_DB_PATH;
  try {
    const raw = await fs.readFile(activePath, 'utf8');
    const parsed = JSON.parse(raw) as VotingDatabase;
    if (!Array.isArray(parsed.votes)) {
      throw new Error('Invalid DB schema');
    }
    return parsed;
  } catch {
    const seed = buildSeedDatabase();
    await writeToFilesystem(seed);
    return seed;
  }
}

async function writeToFilesystem(db: VotingDatabase): Promise<void> {
  if (forceTmpStorage) {
    await atomicWriteFile(TMP_DB_PATH, db);
    return;
  }
  try {
    await atomicWriteFile(LOCAL_DB_PATH, db);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EROFS' || code === 'EACCES' || code === 'EPERM') {
      forceTmpStorage = true;
      await atomicWriteFile(TMP_DB_PATH, db);
    } else {
      throw err;
    }
  }
}

async function ensureDbExists(): Promise<{
  db: VotingDatabase;
  redis: { url: string; token: string; key: string } | null;
}> {
  const redis = getRedisConfig();
  if (redis) {
    try {
      const db = await readFromRedis(redis.url, redis.token, redis.key);
      return { db, redis };
    } catch (err) {
      if (!verifiedRedisEndpoints.has(redis.key)) {
        failedRedisEndpoints.add(redis.key);
        console.warn(
          '[store] Initial Redis connection failed; falling back to local filesystem storage:',
          err instanceof Error ? err.message : err
        );
        return { db: await readFromFilesystem(), redis: null };
      }
      throw err;
    }
  }
  return { db: await readFromFilesystem(), redis: null };
}

export async function readDb(): Promise<VotingDatabase> {
  return withLock(async () => {
    const { db } = await ensureDbExists();
    return db;
  });
}

export async function mutateDb<T>(
  mutator: (db: VotingDatabase) => Promise<T> | T
): Promise<T> {
  return withLock(async () => {
    const { db, redis } = await ensureDbExists();
    const result = await mutator(db);
    if (redis) {
      await writeToRedis(redis.url, redis.token, db);
    } else {
      await writeToFilesystem(db);
    }
    return result;
  });
}

export function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasscodeHash(passcode: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derived = crypto.scryptSync(passcode, salt, 64);
    if (keyBuf.length !== derived.length) return false;
    return crypto.timingSafeEqual(keyBuf, derived);
  } catch {
    return false;
  }
}

export function resetElectionData(db: VotingDatabase): void {
  db.votes = [];
}
