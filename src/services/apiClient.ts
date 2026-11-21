import type {
  ElectionSummary,
  VoteRecord,
} from '../data/electionData';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error || 'Permintaan gagal diproses.';
    throw new Error(msg);
  }
  return data as T;
}

export async function fetchPublicSummary(): Promise<ElectionSummary> {
  const res = await fetch('/api/election/summary');
  return parseJson<ElectionSummary>(res);
}

export async function verifyVoterIdentityRemote(payload: {
  fullName: string;
  className: string;
}): Promise<{
  ok: boolean;
  voter: { fullName: string; className: string };
}> {
  const res = await fetch('/api/voters/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function submitVoteBallot(payload: {
  fullName: string;
  className: string;
  selections: Record<string, string>;
}): Promise<{ ok: boolean; receipt: VoteRecord }> {
  const res = await fetch('/api/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function fetchAdminAuthStatus(): Promise<{
  envPasscodeActive: boolean;
  hasPasscodeConfigured: boolean;
  authorizedGoogleEmail: string;
}> {
  const res = await fetch('/api/admin/auth-status');
  return parseJson(res);
}

export async function claimAdminPasscode(
  passcode: string
): Promise<{ ok: boolean; sessionToken: string }> {
  const res = await fetch('/api/admin/claim-passcode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  return parseJson(res);
}

export async function loginAdminPasscode(
  passcode: string
): Promise<{ ok: boolean; sessionToken: string }> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  return parseJson(res);
}

export async function loginAdminGoogle(
  idToken: string
): Promise<{ ok: boolean; sessionToken: string; email: string }> {
  const res = await fetch('/api/admin/google-login', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  return parseJson(res);
}

export async function fetchAdminOverview(sessionToken: string): Promise<{
  summary: ElectionSummary;
  votes: VoteRecord[];
  storageMode?: 'redis' | 'file' | 'tmp';
}> {
  const res = await fetch('/api/admin/overview', {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  return parseJson(res);
}

export async function fetchExportExcelBlob(sessionToken: string): Promise<Blob> {
  const res = await fetch('/api/admin/export-excel', {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Gagal mengunduh Excel.');
  }
  return res.blob();
}

export async function resetElectionVotes(
  sessionToken: string
): Promise<{ ok: boolean }> {
  const res = await fetch('/api/admin/reset-votes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({}),
  });
  return parseJson(res);
}
