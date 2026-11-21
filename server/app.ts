import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { buildElectionWorkbookBuffer } from './excelService.ts';
import {
  getStorageMode,
  hashPasscode,
  mutateDb,
  readDb,
  resetElectionData,
  verifyPasscodeHash,
} from './store.ts';
import {
  computeElectionSummary,
  makeVoterKey,
  normalizeClassName,
  normalizeName,
  validateCompleteBallot,
  validateVoterIdentity,
} from '../src/utils/votingRules.ts';

dotenv.config();

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const RAW_ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || 'dwiki223@guru.smp.belajar.id'
)
  .trim()
  .toLowerCase();
const FALLBACK_ADMIN_EMAIL = 'dwiki223@guru.smp.belajar.id';

function isAuthorizedAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!RAW_ADMIN_EMAIL) return true;
  if (RAW_ADMIN_EMAIL.includes('@')) {
    return normalized === RAW_ADMIN_EMAIL || normalized === FALLBACK_ADMIN_EMAIL;
  }
  return (
    normalized === FALLBACK_ADMIN_EMAIL ||
    normalized.startsWith(`${RAW_ADMIN_EMAIL}@`)
  );
}

interface FirebaseConfigFile {
  projectId?: string;
}

function readFirebaseProjectId(): string {
  try {
    const raw = fs.readFileSync(
      path.resolve(process.cwd(), 'firebase-applet-config.json'),
      'utf8'
    );
    const parsed = JSON.parse(raw) as FirebaseConfigFile;
    return parsed.projectId ?? '';
  } catch {
    return '';
  }
}

const FIREBASE_PROJECT_ID = readFirebaseProjectId();

interface AdminSessionPayload {
  sub: string;
  method: 'passcode' | 'google';
  exp: number;
}

function signAdminSession(sub: string, method: 'passcode' | 'google'): string {
  const payload: AdminSessionPayload = {
    sub,
    method,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyAdminSession(token: string): AdminSessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as AdminSessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

let cachedCerts: Record<string, string> = {};
let cachedCertsExpiry = 0;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  if (Date.now() < cachedCertsExpiry && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!res.ok) {
    throw new Error('Gagal mengambil sertifikat publik Google.');
  }
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600 * 1000;
  cachedCerts = (await res.json()) as Record<string, string>;
  cachedCertsExpiry = Date.now() + maxAgeMs;
  return cachedCerts;
}

async function verifyFirebaseIdToken(
  idToken: string
): Promise<{ email: string; name?: string } | null> {
  if (!FIREBASE_PROJECT_ID) return null;
  const segments = idToken.split('.');
  if (segments.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = segments;

  try {
    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString('utf8')
    ) as { alg?: string; kid?: string };
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as {
      aud?: string;
      iss?: string;
      exp?: number;
      iat?: number;
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };

    if (header.alg !== 'RS256' || !header.kid) return null;
    const certs = await getFirebasePublicCerts();
    const cert = certs[header.kid];
    if (!cert) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const isValidSig = verifier.verify(
      cert,
      Buffer.from(signatureB64, 'base64url')
    );
    if (!isValidSig) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.aud !== FIREBASE_PROJECT_ID) return null;
    if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
      return null;
    }
    if (!payload.exp || payload.exp <= nowSec) return null;
    if (!payload.iat || payload.iat > nowSec + 300) return null;
    if (!payload.sub || !payload.email || payload.email_verified !== true) {
      return null;
    }

    return { email: payload.email.toLowerCase(), name: payload.name };
  } catch {
    return null;
  }
}

interface AuthenticatedRequest extends Request {
  adminSession?: AdminSessionPayload;
}

function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Akses panitia memerlukan otentikasi.' });
    return;
  }
  const session = verifyAdminSession(match[1]);
  if (!session) {
    res.status(401).json({ error: 'Sesi panitia tidak valid atau sudah berakhir.' });
    return;
  }
  req.adminSession = session;
  next();
}

function timingSafeCompareText(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createApiApp(): express.Express {
  const app = express();

  // Guard for Vercel serverless runtime if req.body was already parsed
  app.use((req, _res, next) => {
    const reqAny = req as unknown as {
      body?: unknown;
      _body?: boolean;
      readable?: boolean;
    };
    if (
      reqAny.body &&
      typeof reqAny.body === 'object' &&
      !reqAny._body &&
      reqAny.readable === false
    ) {
      reqAny._body = true;
    }
    next();
  });

  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, storageMode: getStorageMode() });
  });

  app.get('/api/election/summary', async (_req, res) => {
    try {
      const db = await readDb();
      const summary = computeElectionSummary(db.votes);
      res.json(summary);
    } catch {
      res.status(500).json({ error: 'Gagal memuat ringkasan voting.' });
    }
  });

  app.post('/api/voters/verify', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        fullName?: unknown;
        className?: unknown;
      };
      const fullName =
        typeof body.fullName === 'string' ? normalizeName(body.fullName) : '';
      const className =
        typeof body.className === 'string'
          ? normalizeClassName(body.className)
          : '';

      const validation = validateVoterIdentity(fullName, className);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const db = await readDb();
      const voterKey = makeVoterKey(fullName, className);
      const alreadyVoted = db.votes.some(
        (v) => makeVoterKey(v.fullName, v.className) === voterKey
      );
      if (alreadyVoted) {
        res.status(409).json({
          error: `Siswa "${fullName}" di kelas ${className} sudah mengirimkan suara sebelumnya.`,
        });
        return;
      }

      res.json({
        ok: true,
        voter: {
          fullName,
          className,
        },
      });
    } catch {
      res.status(500).json({ error: 'Terjadi kesalahan saat memeriksa data siswa.' });
    }
  });

  app.post('/api/votes', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        fullName?: unknown;
        className?: unknown;
        selections?: unknown;
      };

      const fullName =
        typeof body.fullName === 'string' ? normalizeName(body.fullName) : '';
      const className =
        typeof body.className === 'string'
          ? normalizeClassName(body.className)
          : '';

      const identityCheck = validateVoterIdentity(fullName, className);
      if (!identityCheck.valid) {
        res.status(400).json({ error: identityCheck.error });
        return;
      }

      if (
        !body.selections ||
        typeof body.selections !== 'object' ||
        Array.isArray(body.selections)
      ) {
        res.status(400).json({ error: 'Format pilihan nominasi tidak valid.' });
        return;
      }

      const cleanSelections: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.selections as Record<string, unknown>)) {
        if (typeof v === 'string') {
          cleanSelections[k] = v;
        }
      }

      const ballotCheck = validateCompleteBallot(cleanSelections);
      if (!ballotCheck.valid) {
        res.status(400).json({ error: ballotCheck.error });
        return;
      }

      const voterKey = makeVoterKey(fullName, className);

      const result = await mutateDb((db) => {
        const duplicate = db.votes.some(
          (v) => makeVoterKey(v.fullName, v.className) === voterKey
        );
        if (duplicate) {
          return {
            status: 409 as const,
            error: `Siswa "${fullName}" di kelas ${className} sudah memilih sebelumnya. Suara ganda ditolak.`,
          };
        }

        const now = new Date().toISOString();
        const vote = {
          id: `vote-${crypto.randomUUID()}`,
          fullName,
          className,
          submittedAt: now,
          selections: cleanSelections,
        };
        db.votes.push(vote);

        return { status: 200 as const, vote };
      });

      if (result.status !== 200) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.json({ ok: true, receipt: result.vote });
    } catch {
      res.status(500).json({ error: 'Gagal menyimpan suara voting.' });
    }
  });

  app.get('/api/admin/auth-status', async (_req, res) => {
    try {
      const db = await readDb();
      const envPasscodeActive = Boolean(
        process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0
      );
      res.json({
        envPasscodeActive,
        hasPasscodeConfigured: envPasscodeActive || Boolean(db.adminPasscodeHash),
        authorizedGoogleEmail: RAW_ADMIN_EMAIL.includes('@')
          ? RAW_ADMIN_EMAIL
          : FALLBACK_ADMIN_EMAIL,
      });
    } catch {
      res.status(500).json({ error: 'Gagal memeriksa status autentikasi panitia.' });
    }
  });

  app.post('/api/admin/claim-passcode', async (req, res) => {
    try {
      if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0) {
        res.status(403).json({
          error: 'Passcode panitia dikelola melalui variabel lingkungan server.',
        });
        return;
      }

      const body = (req.body || {}) as { passcode?: unknown };
      const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';
      if (passcode.length < 6 || passcode.length > 64) {
        res.status(400).json({
          error: 'Passcode panitia minimal 6 karakter dan maksimal 64 karakter.',
        });
        return;
      }

      const outcome = await mutateDb((db) => {
        if (db.adminPasscodeHash) {
          return { claimed: false as const };
        }
        db.adminPasscodeHash = hashPasscode(passcode);
        return { claimed: true as const };
      });

      if (!outcome.claimed) {
        res.status(409).json({
          error: 'Passcode panitia sudah pernah diatur. Silakan masuk menggunakan passcode tersebut.',
        });
        return;
      }

      const sessionToken = signAdminSession('panitia-local', 'passcode');
      res.json({ ok: true, sessionToken });
    } catch {
      res.status(500).json({ error: 'Gagal mengatur passcode panitia.' });
    }
  });

  app.post('/api/admin/login', async (req, res) => {
    try {
      const body = (req.body || {}) as { passcode?: unknown };
      const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';
      if (!passcode) {
        res.status(400).json({ error: 'Passcode wajib diisi.' });
        return;
      }

      const envPass = process.env.ADMIN_PASSCODE?.trim();
      let isValid = false;
      if (envPass) {
        isValid = timingSafeCompareText(passcode, envPass);
      } else {
        const db = await readDb();
        if (!db.adminPasscodeHash) {
          res.status(400).json({
            error: 'Passcode belum diatur. Gunakan formulir pengaturan awal panitia.',
          });
          return;
        }
        isValid = verifyPasscodeHash(passcode, db.adminPasscodeHash);
      }

      if (!isValid) {
        res.status(401).json({ error: 'Passcode panitia tidak sesuai.' });
        return;
      }

      const sessionToken = signAdminSession('panitia-local', 'passcode');
      res.json({ ok: true, sessionToken });
    } catch {
      res.status(500).json({ error: 'Gagal memproses login panitia.' });
    }
  });

  app.post('/api/admin/google-login', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        res.status(401).json({ error: 'Token identitas Google tidak ditemukan.' });
        return;
      }

      const verified = await verifyFirebaseIdToken(match[1]);
      if (!verified) {
        res.status(401).json({ error: 'Token identitas Google tidak valid atau kedaluwarsa.' });
        return;
      }

      if (!isAuthorizedAdminEmail(verified.email)) {
        res.status(403).json({
          error: `Akun ${verified.email} tidak terdaftar sebagai panitia resmi.`,
        });
        return;
      }

      const sessionToken = signAdminSession(verified.email, 'google');
      res.json({ ok: true, sessionToken, email: verified.email });
    } catch {
      res.status(500).json({ error: 'Gagal memverifikasi akun Google panitia.' });
    }
  });

  app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
    try {
      const db = await readDb();
      const summary = computeElectionSummary(db.votes);
      const sortedVotes = [...db.votes].sort((a, b) =>
        b.submittedAt.localeCompare(a.submittedAt)
      );
      res.json({
        summary,
        votes: sortedVotes,
        storageMode: getStorageMode(),
      });
    } catch {
      res.status(500).json({ error: 'Gagal memuat data panitia.' });
    }
  });

  app.get('/api/admin/export-excel', requireAdmin, async (_req, res) => {
    try {
      const db = await readDb();
      const buffer = await buildElectionWorkbookBuffer(db.votes);
      const dateTag = new Date().toISOString().slice(0, 10);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Voting_Nominasi_Guru_${dateTag}.xlsx"`
      );
      res.send(buffer);
    } catch {
      res.status(500).json({ error: 'Gagal membuat file Excel.' });
    }
  });

  app.post('/api/admin/reset-votes', requireAdmin, async (_req, res) => {
    try {
      await mutateDb((db) => {
        resetElectionData(db);
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Gagal mereset data suara.' });
    }
  });

  return app;
}
