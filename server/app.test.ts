import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import handler from '../api/index.ts';
import { NOMINATIONS, TEACHERS } from '../src/data/electionData.ts';

const DB_PATH = path.resolve(process.cwd(), 'data', 'voting-db.json');

let server: http.Server;
let baseUrl: string;
let originalDbRaw: string | null = null;

before(async () => {
  try {
    originalDbRaw = await fs.readFile(DB_PATH, 'utf8');
  } catch {
    originalDbRaw = null;
  }

  server = http.createServer((req, res) => {
    handler(req, res);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  if (originalDbRaw !== null) {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.writeFile(DB_PATH, originalDbRaw, 'utf8');
  } else {
    await fs.rm(DB_PATH, { force: true });
  }
});

test('GET /api/health returns ok and active storage mode', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; storageMode: string };
  assert.equal(body.ok, true);
  assert.ok(['redis', 'file', 'tmp'].includes(body.storageMode));
});

test('GET /api/election/summary returns 27 teachers, 29 categories, 14 classes', async () => {
  const res = await fetch(`${baseUrl}/api/election/summary`);
  assert.equal(res.status, 200);
  const summary = (await res.json()) as {
    totalClasses: number;
    teacherTallies: unknown[];
    categorySummaries: unknown[];
  };
  assert.equal(summary.totalClasses, 14);
  assert.equal(summary.teacherTallies.length, 27);
  assert.equal(summary.categorySummaries.length, 29);
});

test('POST /api/voters/verify validates allowed classes 71..95 and blocks invalid class', async () => {
  const badRes = await fetch(`${baseUrl}/api/voters/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Budi Santoso', className: '75' }),
  });
  assert.equal(badRes.status, 400);

  const okRes = await fetch(`${baseUrl}/api/voters/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Siti Aminah Test', className: '71' }),
  });
  assert.equal(okRes.status, 200);
  const data = (await okRes.json()) as { ok: boolean };
  assert.equal(data.ok, true);
});

test('POST /api/votes enforces 1-to-1 nomination uniqueness and blocks duplicate voter', async () => {
  const duplicateCatSelections: Record<string, string> = {};
  TEACHERS.forEach((teacher) => {
    duplicateCatSelections[teacher.id] = NOMINATIONS[0].id;
  });

  const dupCatRes = await fetch(`${baseUrl}/api/votes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Tester Ganda Nominasi',
      className: '82',
      selections: duplicateCatSelections,
    }),
  });
  assert.equal(dupCatRes.status, 400);

  const validSelections: Record<string, string> = {};
  TEACHERS.forEach((teacher, idx) => {
    validSelections[teacher.id] = NOMINATIONS[idx].id;
  });

  const submitRes = await fetch(`${baseUrl}/api/votes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Raka Pratama Test',
      className: '94',
      selections: validSelections,
    }),
  });
  assert.equal(submitRes.status, 200);

  const dupVoterRes = await fetch(`${baseUrl}/api/votes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'raka   pratama test',
      className: '94',
      selections: validSelections,
    }),
  });
  assert.equal(dupVoterRes.status, 409);
});

test('GET /api/admin/overview blocks unauthenticated requests', async () => {
  const res = await fetch(`${baseUrl}/api/admin/overview`);
  assert.equal(res.status, 401);
});
