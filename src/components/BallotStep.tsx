import { useMemo, useState } from 'react';
import { Check, Search, X, AlertCircle, Send } from 'lucide-react';
import {
  NOMINATIONS,
  NOMINATION_MAP,
  TEACHERS,
  TEACHER_MAP,
  type VoteRecord,
} from '../data/electionData';
import { submitVoteBallot } from '../services/apiClient';
import {
  assignNomination,
  getUsedNominationsMap,
  validateCompleteBallot,
} from '../utils/votingRules';
import type { VerifiedVoter } from './VoterIdentityStep';

interface BallotStepProps {
  voter: VerifiedVoter;
  onSubmitted: (receipt: VoteRecord) => void;
  onChangeVoter: () => void;
}

type BallotFilter = 'all' | 'pending' | 'done';

export function BallotStep({
  voter,
  onSubmitted,
  onChangeVoter,
}: BallotStepProps) {
  const [ballot, setBallot] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<BallotFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const usedMap = useMemo(() => getUsedNominationsMap(ballot), [ballot]);
  const selectedCount = Object.keys(ballot).length;
  const totalTeachers = TEACHERS.length;
  const remainingCount = totalTeachers - selectedCount;
  const progressPercent = Math.round((selectedCount / totalTeachers) * 100);

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return TEACHERS.filter((teacher) => {
      const hasChoice = Boolean(ballot[teacher.id]);
      if (filter === 'pending' && hasChoice) return false;
      if (filter === 'done' && !hasChoice) return false;
      if (q && !teacher.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ballot, filter, searchQuery]);

  const handleSelectCategory = (teacherId: string, categoryId: string) => {
    setFeedbackError(null);
    const result = assignNomination(ballot, teacherId, categoryId);
    if (!result.ok) {
      setFeedbackError(result.error ?? 'Nominasi tidak dapat dipilih.');
      return;
    }
    setBallot(result.ballot);
  };

  const handleOpenConfirm = () => {
    setFeedbackError(null);
    const check = validateCompleteBallot(ballot);
    if (!check.valid) {
      setFeedbackError(
        check.error ?? 'Lengkapi pilihan nominasi untuk semua guru.'
      );
      setFilter('pending');
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setFeedbackError(null);
    try {
      const res = await submitVoteBallot({
        fullName: voter.fullName,
        className: voter.className,
        selections: ballot,
      });
      setShowConfirmModal(false);
      onSubmitted(res.receipt);
    } catch (err) {
      setShowConfirmModal(false);
      setFeedbackError(
        err instanceof Error ? err.message : 'Gagal mengirim suara voting.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      {/* Voter Identity & Progress Header */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Langkah 2 dari 2 · Surat Suara Pemilih
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
              Pilih 1 Nominasi untuk Setiap Guru
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">
                {voter.fullName}
              </span>
              <span aria-hidden="true">·</span>
              <span>Kelas {voter.className}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onChangeVoter}
                className="text-xs font-medium text-blue-900 underline underline-offset-4 hover:text-blue-700"
              >
                Ganti Pemilih
              </button>
            </div>
          </div>

          <div className="min-w-[220px] space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-600">Progres Pilihan</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {selectedCount} / {totalTeachers} Guru
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-900 transition-transform duration-200 origin-left"
                style={{
                  transform: `scaleX(${Math.max(progressPercent, 0) / 100})`,
                }}
              />
            </div>
            <p className="text-right text-xs text-slate-500 tabular-nums">
              {remainingCount === 0
                ? 'Semua guru telah dipilih'
                : `${remainingCount} guru lagi perlu dipilih`}
            </p>
          </div>
        </div>

        {feedbackError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{feedbackError}</span>
          </div>
        )}
      </div>

      {/* Main 2-Column Ballot Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="space-y-4 lg:col-span-8">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Cari nama guru"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama guru..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:bg-white focus:outline-none"
              />
            </div>

            <div
              role="group"
              aria-label="Filter status guru"
              className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
            >
              {(
                [
                  { id: 'all', label: `Semua (${totalTeachers})` },
                  { id: 'pending', label: `Belum (${remainingCount})` },
                  { id: 'done', label: `Selesai (${selectedCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    filter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredTeachers.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">
                Tidak ada guru yang cocok dengan filter saat ini.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFilter('all');
                  setSearchQuery('');
                }}
                className="mt-3 text-xs font-semibold text-blue-900 underline underline-offset-4"
              >
                Tampilkan semua 27 guru
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {filteredTeachers.map((teacher) => {
                const chosenCatId = ballot[teacher.id] ?? '';
                const chosenCat = chosenCatId
                  ? NOMINATION_MAP.get(chosenCatId)
                  : undefined;

                return (
                  <div
                    key={teacher.id}
                    className={`flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                      chosenCat ? 'bg-slate-50/70' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 font-mono text-xs font-semibold tabular-nums text-slate-700">
                        {String(teacher.order).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {teacher.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {chosenCat ? (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                              <Check className="h-3.5 w-3.5" />
                              Nominasi terpilih: {chosenCat.label}
                            </span>
                          ) : (
                            'Belum ada nominasi dipilih'
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:w-72 shrink-0">
                      <select
                        aria-label={`Pilih nominasi untuk ${teacher.name}`}
                        value={chosenCatId}
                        onChange={(e) =>
                          handleSelectCategory(teacher.id, e.target.value)
                        }
                        className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15 ${
                          chosenCatId
                            ? 'border-blue-900/40 bg-white font-medium text-slate-900'
                            : 'border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        <option value="">-- Pilih 1 Nominasi --</option>
                        {NOMINATIONS.map((cat) => {
                          const assignedToTeacherId = usedMap[cat.id];
                          const isTakenByOther =
                            Boolean(assignedToTeacherId) &&
                            assignedToTeacherId !== teacher.id;
                          const ownerName = isTakenByOther
                            ? TEACHER_MAP.get(assignedToTeacherId)?.name
                            : null;

                          return (
                            <option
                              key={cat.id}
                              value={cat.id}
                              disabled={isTakenByOther}
                            >
                              {isTakenByOther
                                ? `${cat.label} (Dipilih: ${ownerName})`
                                : cat.label}
                            </option>
                          );
                        })}
                      </select>

                      {chosenCatId && (
                        <button
                          type="button"
                          onClick={() => handleSelectCategory(teacher.id, '')}
                          aria-label={`Kosongkan nominasi ${teacher.name}`}
                          title="Lepas pilihan"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:col-span-4 lg:sticky lg:top-20">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Ketersediaan Nominasi
                </h2>
                <p className="text-xs text-slate-500 tabular-nums">
                  {NOMINATIONS.length - selectedCount} tersedia · {selectedCount}{' '}
                  sudah dipakai
                </p>
              </div>
            </div>

            <div className="mt-3 max-h-80 overflow-y-auto pr-1 divide-y divide-slate-100">
              {NOMINATIONS.map((cat) => {
                const ownerId = usedMap[cat.id];
                const owner = ownerId ? TEACHER_MAP.get(ownerId) : undefined;
                return (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between gap-2 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p
                        className={`font-medium truncate ${
                          owner
                            ? 'text-slate-400 line-through'
                            : 'text-slate-800'
                        }`}
                      >
                        {cat.label}
                      </p>
                      {owner && (
                        <p className="truncate text-[11px] text-slate-500">
                          {owner.name}
                        </p>
                      )}
                    </div>
                    {owner ? (
                      <button
                        type="button"
                        onClick={() => handleSelectCategory(owner.id, '')}
                        className="shrink-0 text-[11px] font-medium text-blue-900 hover:underline"
                      >
                        Lepas
                      </button>
                    ) : (
                      <span className="shrink-0 text-[11px] text-emerald-700 font-medium">
                        Tersedia
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleOpenConfirm}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 ${
                  remainingCount === 0
                    ? 'bg-blue-900 text-white hover:bg-blue-800'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                <Send className="h-4 w-4" />
                <span>
                  {remainingCount === 0
                    ? 'Kirim Suara Voting'
                    : `Kirim Suara (${remainingCount} Guru Tersisa)`}
                </span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-ballot-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2
                id="confirm-ballot-title"
                className="font-display text-xl font-bold text-slate-900"
              >
                Konfirmasi Pengiriman Suara
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Pemilih: <strong className="text-slate-900">{voter.fullName}</strong> · Kelas{' '}
                <strong className="text-slate-900">{voter.className}</strong>
              </p>
            </div>

            <div className="overflow-y-auto px-6 py-4">
              <p className="mb-3 text-xs text-slate-600">
                Setelah dikirim, suara Anda akan tercatat dan pilihan tidak dapat diubah kembali.
              </p>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {TEACHERS.map((teacher) => {
                  const cat = NOMINATION_MAP.get(ballot[teacher.id]);
                  return (
                    <div
                      key={teacher.id}
                      className="flex items-center justify-between gap-4 px-3.5 py-2 text-xs"
                    >
                      <span className="font-medium text-slate-800">
                        {String(teacher.order).padStart(2, '0')}. {teacher.name}
                      </span>
                      <span className="font-semibold text-blue-900 shrink-0">
                        {cat?.label ?? '-'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Periksa Lagi
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmSubmit}
                className="rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {submitting ? 'Mengirim Suara...' : 'Konfirmasi & Kirim Suara'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
