import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  CloudUpload,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderSync,
  KeyRound,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import {
  NOMINATION_MAP,
  TEACHERS,
  type ElectionSummary,
  type VoteRecord,
} from '../data/electionData';
import {
  claimAdminPasscode,
  fetchAdminAuthStatus,
  fetchAdminOverview,
  fetchExportExcelBlob,
  loginAdminGoogle,
  loginAdminPasscode,
  resetElectionVotes,
} from '../services/apiClient';
import {
  getCachedDriveAccessToken,
  initGoogleAuth,
  signInWithGoogleDrive,
  signOutGoogle,
} from '../services/firebaseAuth';
import {
  listDriveExcelFiles,
  updateExistingExcelInDrive,
  uploadNewExcelToDrive,
  type DriveExcelFile,
} from '../services/googleDriveService';

type AdminSubTab = 'tally' | 'votes';

function GoogleSignInButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gsi-material-button"
    >
      <div className="gsi-material-button-content-wrapper">
        <div className="gsi-material-button-icon">
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            style={{ display: 'block' }}
          >
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
            <path fill="none" d="M0 0h48v48H0z" />
          </svg>
        </div>
        <span className="gsi-material-button-contents">{label}</span>
      </div>
    </button>
  );
}

export function AdminDashboardView() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<{
    envPasscodeActive: boolean;
    hasPasscodeConfigured: boolean;
    authorizedGoogleEmail: string;
  } | null>(null);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(
    getCachedDriveAccessToken()
  );
  const [driveFiles, setDriveFiles] = useState<DriveExcelFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [pendingUpdateFile, setPendingUpdateFile] =
    useState<DriveExcelFile | null>(null);

  const [summary, setSummary] = useState<ElectionSummary | null>(null);
  const [votes, setVotes] = useState<VoteRecord[]>([]);
  const [storageMode, setStorageMode] = useState<'redis' | 'file' | 'tmp' | null>(
    null
  );
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [subTab, setSubTab] = useState<AdminSubTab>('tally');
  const [expandedVoteId, setExpandedVoteId] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    fetchAdminAuthStatus()
      .then(setAuthStatus)
      .catch(() => undefined);

    const unsub = initGoogleAuth(
      (user, accessToken) => {
        setGoogleUser(user);
        setDriveAccessToken(accessToken);
      },
      (user) => {
        setGoogleUser(user);
        setDriveAccessToken(getCachedDriveAccessToken());
      }
    );
    return () => unsub();
  }, []);

  const loadOverview = async (token: string) => {
    setLoadingOverview(true);
    setActionError(null);
    try {
      const data = await fetchAdminOverview(token);
      setSummary(data.summary);
      setVotes(data.votes);
      setStorageMode(data.storageMode ?? null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal memuat data panitia.'
      );
    } finally {
      setLoadingOverview(false);
    }
  };

  useEffect(() => {
    if (sessionToken) {
      loadOverview(sessionToken);
    }
  }, [sessionToken]);

  const handlePasscodeAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = authStatus?.hasPasscodeConfigured
        ? await loginAdminPasscode(passcodeInput)
        : await claimAdminPasscode(passcodeInput);
      setSessionToken(res.sessionToken);
      setPasscodeInput('');
      const updatedStatus = await fetchAdminAuthStatus();
      setAuthStatus(updatedStatus);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Gagal masuk ke panel panitia.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async (alsoUnlockAdmin: boolean) => {
    setAuthError(null);
    setDriveError(null);
    setDriveNotice(null);
    setAuthLoading(true);
    try {
      const result = await signInWithGoogleDrive();
      setGoogleUser(result.user);
      setDriveAccessToken(result.accessToken);

      if (alsoUnlockAdmin && !sessionToken) {
        const loginRes = await loginAdminGoogle(result.idToken);
        setSessionToken(loginRes.sessionToken);
      }

      setDriveLoading(true);
      try {
        const files = await listDriveExcelFiles(result.accessToken);
        setDriveFiles(files);
        setDriveNotice('Google Drive terhubung dan daftar file Excel dimuat.');
      } catch (driveErr) {
        setDriveError(
          driveErr instanceof Error
            ? driveErr.message
            : 'Terhubung ke Google, namun gagal memuat daftar Drive.'
        );
      } finally {
        setDriveLoading(false);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
      if (alsoUnlockAdmin) setAuthError(msg);
      else setDriveError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRefreshDriveFiles = async () => {
    if (!driveAccessToken) return;
    setDriveLoading(true);
    setDriveError(null);
    try {
      const files = await listDriveExcelFiles(driveAccessToken);
      setDriveFiles(files);
    } catch (err) {
      setDriveError(
        err instanceof Error
          ? err.message
          : 'Gagal memuat file Excel dari Google Drive.'
      );
    } finally {
      setDriveLoading(false);
    }
  };

  const handleDownloadLocalExcel = async () => {
    if (!sessionToken) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      const blob = await fetchExportExcelBlob(sessionToken);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Voting_Nominasi_Guru_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setActionSuccess('File Excel (.xlsx) berhasil diunduh.');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal mengunduh file Excel.'
      );
    }
  };

  const handleUploadNewToDrive = async () => {
    if (!sessionToken || !driveAccessToken) return;
    setDriveLoading(true);
    setDriveError(null);
    setDriveNotice(null);
    try {
      const blob = await fetchExportExcelBlob(sessionToken);
      const fileName = `Voting_Nominasi_Guru_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const created = await uploadNewExcelToDrive(
        driveAccessToken,
        blob,
        fileName
      );
      setDriveNotice(`File "${created.name}" berhasil disimpan ke Google Drive.`);
      const files = await listDriveExcelFiles(driveAccessToken);
      setDriveFiles(files);
    } catch (err) {
      setDriveError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan file Excel ke Google Drive.'
      );
    } finally {
      setDriveLoading(false);
    }
  };

  const handleConfirmUpdateDriveFile = async () => {
    if (!sessionToken || !driveAccessToken || !pendingUpdateFile) return;
    const targetFile = pendingUpdateFile;
    setPendingUpdateFile(null);
    setDriveLoading(true);
    setDriveError(null);
    setDriveNotice(null);
    try {
      const blob = await fetchExportExcelBlob(sessionToken);
      const updated = await updateExistingExcelInDrive(
        driveAccessToken,
        targetFile.id,
        blob
      );
      setDriveNotice(
        `File "${updated.name}" di Google Drive berhasil diperbarui dengan data terbaru.`
      );
      const files = await listDriveExcelFiles(driveAccessToken);
      setDriveFiles(files);
    } catch (err) {
      setDriveError(
        err instanceof Error
          ? err.message
          : 'Gagal memperbarui file Excel di Google Drive.'
      );
    } finally {
      setDriveLoading(false);
    }
  };

  const handleResetVotes = async () => {
    if (!sessionToken) return;
    setShowResetModal(false);
    setActionError(null);
    setActionSuccess(null);
    try {
      await resetElectionVotes(sessionToken);
      setActionSuccess('Data suara berhasil direset.');
      await loadOverview(sessionToken);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal mereset data suara.'
      );
    }
  };

  if (!sessionToken) {
    const isClaimMode = authStatus && !authStatus.hasPasscodeConfigured;
    return (
      <section className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="border-b border-slate-100 pb-4">
            <p className="text-xs font-medium text-slate-500">
              Akses Terbatas · Panitia Pemilihan
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
              Masuk Panel Panitia
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Pantau rekap suara seluruh guru dan simpan seluruh data dalam format Excel ke Google Drive.
            </p>
          </div>

          <div className="mt-6 space-y-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-800">
                Masuk dengan Akun Google Panitia
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Sekaligus menghubungkan Google Drive untuk menyimpan & memperbarui file Excel.
              </p>
              <div className="mt-3">
                <GoogleSignInButton
                  label="Sign in with Google"
                  onClick={() => handleGoogleSignIn(true)}
                  disabled={authLoading}
                />
              </div>
            </div>

            <div className="relative flex items-center">
              <div className="flex-grow border-t border-slate-200" />
              <span className="mx-3 shrink-0 text-xs text-slate-400">atau</span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <form onSubmit={handlePasscodeAuth} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-passcode"
                  className="mb-1.5 block text-sm font-semibold text-slate-800"
                >
                  {isClaimMode
                    ? 'Buat Passcode Panitia Pertama Kali'
                    : 'Passcode Panitia'}
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-passcode"
                    type="password"
                    required
                    minLength={6}
                    value={passcodeInput}
                    onChange={(e) => setPasscodeInput(e.target.value)}
                    placeholder={
                      isClaimMode
                        ? 'Minimal 6 karakter untuk pengaturan awal'
                        : 'Masukkan passcode panitia'
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
                  />
                </div>
                {isClaimMode && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Passcode belum diatur di server. Masukkan passcode pilihan Anda untuk mengamankan panel ini.
                  </p>
                )}
              </div>

              {authError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {authLoading
                  ? 'Memproses...'
                  : isClaimMode
                  ? 'Simpan Passcode & Masuk'
                  : 'Masuk dengan Passcode'}
              </button>
            </form>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Dashboard Panitia · Rekap Suara · Sinkronisasi Excel Google Drive
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-slate-900">
            Panel Panitia Pemilihan
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadOverview(sessionToken)}
            disabled={loadingOverview}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingOverview ? 'animate-spin' : ''}`}
            />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadLocalExcel}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-900 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Unduh Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              setSessionToken(null);
              if (googleUser) {
                await signOutGoogle();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {actionSuccess}
        </div>
      )}

      {storageMode === 'tmp' && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3.5 text-xs text-amber-950">
          <p className="font-semibold">
            Penyimpanan Sementara Serverless Aktif (Vercel)
          </p>
          <p className="mt-1 leading-relaxed text-amber-900">
            Data saat ini disimpan di direktori sementara serverless (<code>/tmp</code>) dan dapat ter-reset saat cold start. Agar data suara permanen di Vercel, tambahkan variabel lingkungan{' '}
            <code>UPSTASH_REDIS_REST_URL</code> dan{' '}
            <code>UPSTASH_REDIS_REST_TOKEN</code> (atau hubungkan Vercel KV), serta rutin cadangkan file Excel ke Google Drive.
          </p>
        </div>
      )}

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Suara Masuk</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {summary.totalBallots}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">
              Kelas Berpartisipasi
            </p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {summary.participatingClasses}{' '}
              <span className="text-sm font-normal text-slate-400">
                / {summary.totalClasses}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">
              Jumlah Guru
            </p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {summary.teacherTallies.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">
              Kategori Nominasi
            </p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {summary.categorySummaries.length}
            </p>
          </div>
        </div>
      )}

      {/* Google Drive Excel Sync Section */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <div
          className={`flex flex-col gap-4 md:flex-row md:items-center md:justify-between ${
            driveError || driveNotice || driveAccessToken
              ? 'border-b border-slate-100 pb-4'
              : ''
          }`}
        >
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Data Format Excel (.xlsx) & Google Drive
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Simpan seluruh rekap nominasi, matriks 27 guru, dan detail pemilih sebagai workbook Excel 3-sheet langsung ke Google Drive Anda.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {!driveAccessToken ? (
              <GoogleSignInButton
                label="Sign in with Google"
                onClick={() => handleGoogleSignIn(false)}
                disabled={driveLoading}
              />
            ) : (
              <button
                type="button"
                onClick={handleUploadNewToDrive}
                disabled={driveLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                <CloudUpload className="h-3.5 w-3.5" />
                <span>Simpan Excel Baru ke Drive</span>
              </button>
            )}
          </div>
        </div>

        {driveError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800"
          >
            {driveError}
          </div>
        )}

        {driveNotice && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800"
          >
            {driveNotice}
          </div>
        )}

        {driveAccessToken && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span>
                Terhubung sebagai{' '}
                <strong className="text-slate-900">
                  {googleUser?.email ?? 'Akun Google'}
                </strong>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRefreshDriveFiles}
                  disabled={driveLoading}
                  className="inline-flex items-center gap-1 font-semibold text-blue-900 hover:underline"
                >
                  <FolderSync className="h-3.5 w-3.5" />
                  <span>Segarkan Daftar Drive</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await signOutGoogle();
                    setDriveAccessToken(null);
                    setDriveFiles([]);
                  }}
                  className="text-slate-500 hover:text-slate-800"
                >
                  Putuskan Drive
                </button>
              </div>
            </div>

            {driveFiles.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                Belum ada file Excel (.xlsx) yang ditemukan di Google Drive Anda. Klik &ldquo;Simpan Excel Baru ke Drive&rdquo; untuk membuat file workbook pertama.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                      <th className="px-3.5 py-2.5">Nama File Excel di Drive</th>
                      <th className="px-3.5 py-2.5">Terakhir Diubah</th>
                      <th className="px-3.5 py-2.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {driveFiles.map((file) => (
                      <tr key={file.id} className="hover:bg-slate-50/70">
                        <td className="px-3.5 py-2.5 font-medium text-slate-900">
                          {file.name}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-slate-500 tabular-nums">
                          {file.modifiedTime
                            ? new Date(file.modifiedTime).toLocaleString('id-ID')
                            : '-'}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={driveLoading}
                              onClick={() => setPendingUpdateFile(file)}
                              className="rounded border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Perbarui Isi
                            </button>
                            {file.webViewLink && (
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Buka ${file.name} di Google Drive`}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-slate-600 hover:text-slate-900"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>Buka</span>
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sub-navigation Tabs */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Bagian Panel Panitia"
          className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1"
        >
          {(
            [
              { id: 'tally', label: 'Rekap Nominasi (27 Guru)' },
              { id: 'votes', label: `Log Pemilih (${votes.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={subTab === tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                subTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowResetModal(true)}
          className="text-xs font-medium text-red-700 hover:underline"
        >
          Reset Data Suara
        </button>
      </div>

      {subTab === 'tally' && summary && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3 w-12">No</th>
                <th className="px-4 py-3">Nama Guru</th>
                <th className="px-4 py-3">Nominasi Terbanyak</th>
                <th className="px-4 py-3 text-right">Suara Teratas</th>
                <th className="px-4 py-3">Rincian Seluruh Nominasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.teacherTallies.map((item) => (
                <tr key={item.teacher.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums">
                    {String(item.teacher.order).padStart(2, '0')}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {item.teacher.name}
                  </td>
                  <td className="px-4 py-3 font-medium text-amber-800">
                    {item.topCategory ? item.topCategory.category.label : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                    {item.topCategory ? item.topCategory.votes : 0}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {item.breakdown.length > 0
                      ? item.breakdown
                          .map((b) => `${b.category.label} (${b.votes})`)
                          .join(' · ')
                      : 'Belum ada suara'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'votes' && (
        <div className="space-y-3">
          {votes.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
              Belum ada suara siswa yang masuk.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {votes.map((vote) => {
                const isExpanded = expandedVoteId === vote.id;
                return (
                  <div key={vote.id} className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {vote.fullName}{' '}
                          <span className="font-normal text-slate-500">
                            · Kelas {vote.className}
                          </span>
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                          {new Date(vote.submittedAt).toLocaleString('id-ID')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedVoteId(isExpanded ? null : vote.id)
                        }
                        className="self-start text-xs font-semibold text-blue-900 hover:underline sm:self-center"
                      >
                        {isExpanded
                          ? 'Tutup Rincian 27 Guru'
                          : 'Lihat Rincian 27 Guru'}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                        {TEACHERS.map((teacher) => {
                          const cat = NOMINATION_MAP.get(
                            vote.selections[teacher.id]
                          );
                          return (
                            <div
                              key={teacher.id}
                              className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-1.5"
                            >
                              <span className="truncate text-slate-700">
                                {teacher.name}
                              </span>
                              <span className="font-semibold text-blue-900 shrink-0">
                                {cat?.label ?? '-'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {pendingUpdateFile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-drive-update-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2
              id="confirm-drive-update-title"
              className="font-display text-lg font-bold text-slate-900"
            >
              Konfirmasi Perbarui File Google Drive
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Apakah Anda yakin ingin menimpa isi file{' '}
              <strong className="text-slate-900">{pendingUpdateFile.name}</strong>{' '}
              di Google Drive Anda dengan rekap data voting Excel terbaru?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingUpdateFile(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmUpdateDriveFile}
                className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Ya, Perbarui File
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-reset-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2
              id="confirm-reset-title"
              className="font-display text-lg font-bold text-slate-900"
            >
              Reset Data Suara Voting
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Tindakan ini akan menghapus seluruh suara yang sudah masuk. Lanjutkan?
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleResetVotes}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
              >
                Ya, Reset Semua Suara
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
