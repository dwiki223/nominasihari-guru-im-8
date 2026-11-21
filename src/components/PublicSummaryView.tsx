import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { ElectionSummary } from '../data/electionData';
import { fetchPublicSummary } from '../services/apiClient';

type SummaryMode = 'teachers' | 'categories';

export function PublicSummaryView() {
  const [summary, setSummary] = useState<ElectionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SummaryMode>('teachers');
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicSummary();
      setSummary(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal memuat hasil sementara.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredTeachers = useMemo(() => {
    if (!summary) return [];
    const q = search.trim().toLowerCase();
    return summary.teacherTallies.filter((item) =>
      q
        ? item.teacher.name.toLowerCase().includes(q) ||
          (item.topCategory?.category.label.toLowerCase().includes(q) ?? false)
        : true
    );
  }, [summary, search]);

  const filteredCategories = useMemo(() => {
    if (!summary) return [];
    const q = search.trim().toLowerCase();
    return summary.categorySummaries.filter((item) =>
      q
        ? item.category.label.toLowerCase().includes(q) ||
          (item.leadingTeacher?.teacher.name.toLowerCase().includes(q) ?? false)
        : true
    );
  }, [summary, search]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Rekapitulasi Real-Time · Tanpa Data Pribadi Siswa
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-slate-900">
            Hasil Sementara Nominasi Guru
          </h1>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Muat Ulang Data</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {loading && !summary ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white p-5"
            />
          ))}
        </div>
      ) : summary ? (
        <>
          {/* 4-Column Metric Strip */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">
                Total Suara Masuk
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {summary.totalBallots}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">
                Kelas Berpartisipasi
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {summary.participatingClasses}{' '}
                <span className="text-sm font-normal text-slate-400">
                  / {summary.totalClasses}
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">
                Guru Dinominasikan
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {summary.teacherTallies.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">
                Kategori Nominasi
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {summary.categorySummaries.length}
              </p>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Cari guru atau nominasi"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  mode === 'teachers'
                    ? 'Cari nama guru atau nominasi teratas...'
                    : 'Cari kategori nominasi atau guru...'
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:bg-white focus:outline-none"
              />
            </div>

            <div
              role="group"
              aria-label="Mode tampilan hasil"
              className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
            >
              <button
                type="button"
                onClick={() => setMode('teachers')}
                className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'teachers'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Guru (27)
              </button>
              <button
                type="button"
                onClick={() => setMode('categories')}
                className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'categories'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Kategori (29)
              </button>
            </div>
          </div>

          {/* Table */}
          {mode === 'teachers' ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3 w-12">No</th>
                    <th className="px-4 py-3">Nama Guru</th>
                    <th className="px-4 py-3">Nominasi Terbanyak</th>
                    <th className="px-4 py-3 text-right">Suara Teratas</th>
                    <th className="px-4 py-3">Sebaran Suara Lainnya</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTeachers.map((item) => (
                    <tr key={item.teacher.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums">
                        {String(item.teacher.order).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {item.teacher.name}
                      </td>
                      <td className="px-4 py-3 font-medium text-amber-800">
                        {item.topCategory ? item.topCategory.category.label : 'Belum ada'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {item.topCategory ? item.topCategory.votes : 0}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {item.breakdown.length > 1
                          ? item.breakdown
                              .slice(1, 4)
                              .map((b) => `${b.category.label} (${b.votes})`)
                              .join(' · ')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3 w-12">No</th>
                    <th className="px-4 py-3">Kategori Nominasi</th>
                    <th className="px-4 py-3">Guru Peraih Suara Terbanyak</th>
                    <th className="px-4 py-3 text-right">Suara Pemimpin</th>
                    <th className="px-4 py-3 text-right">Total Pemilih Kategori</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCategories.map((item, idx) => (
                    <tr key={item.category.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {item.category.label}
                      </td>
                      <td className="px-4 py-3 font-medium text-blue-900">
                        {item.leadingTeacher
                          ? item.leadingTeacher.teacher.name
                          : 'Belum ada'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {item.leadingTeacher ? item.leadingTeacher.votes : 0}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                        {item.totalVotes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
