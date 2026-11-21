import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { getStorageMode, mutateDb, readDb } from './store.ts';

const DB_PATH = path.resolve(process.cwd(), 'data', 'voting-db.json');

let originalDbRaw: string | null = null;
const savedEnv = {
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
};

function restoreEnv() {
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

before(async () => {
  try {
    originalDbRaw = await fs.readFile(DB_PATH, 'utf8');
  } catch {
    originalDbRaw = null;
  }
});

after(async () => {
  restoreEnv();
  if (originalDbRaw !== null) {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.writeFile(DB_PATH, originalDbRaw, 'utf8');
  } else {
    await fs.rm(DB_PATH, { force: true });
  }
});

test('invalid Redis URL (e.g. "123") falls back cleanly to filesystem storage', async () => {
  process.env.UPSTASH_REDIS_REST_URL = '123';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'dummy-token';

  assert.notEqual(getStorageMode(), 'redis');
  const db = await readDb();
  assert.ok(Array.isArray(db.votes));
  assert.ok(db.votes.length >= 2);
});

test('unreachable or unauthorized Redis URL falls back to filesystem on initial connect', async () => {
  const failingServer = http.createServer((_req, res) => {
    res.statusCode = 401;
    res.end('Unauthorized');
  });
  await new Promise<void>((resolve) => {
    failingServer.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = failingServer.address() as AddressInfo;

  try {
    process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${addr.port}`;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'bad-token';

    const db = await readDb();
    assert.ok(Array.isArray(db.votes));
    assert.notEqual(getStorageMode(), 'redis');
  } finally {
    await new Promise<void>((resolve, reject) => {
      failingServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('valid Redis REST server reads and persists mutations', async () => {
  let storedValue: string | null = null;
  const mockRedisServer = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer valid-token') {
      res.statusCode = 401;
      res.end('Unauthorized');
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/get/')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ result: storedValue }));
      return;
    }

    if (req.method === 'POST' && req.url?.startsWith('/set/')) {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        storedValue = JSON.parse(body) as string;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ result: 'OK' }));
      });
      return;
    }

    res.statusCode = 404;
    res.end('Not found');
  });

  await new Promise<void>((resolve) => {
    mockRedisServer.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = mockRedisServer.address() as AddressInfo;

  try {
    process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${addr.port}`;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'valid-token';

    assert.equal(getStorageMode(), 'redis');
    const initial = await readDb();
    assert.equal(initial.votes.length, 2);

    await mutateDb((db) => {
      db.votes.push({
        id: 'vote-redis-test',
        fullName: 'Redis Tester',
        className: '71',
        submittedAt: '2026-11-20T10:00:00.000Z',
        selections: initial.votes[0].selections,
      });
    });

    const afterMutate = await readDb();
    assert.equal(afterMutate.votes.length, 3);
    assert.equal(afterMutate.votes[2].fullName, 'Redis Tester');
  } finally {
    await new Promise<void>((resolve, reject) => {
      mockRedisServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
