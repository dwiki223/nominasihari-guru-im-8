import { CheckCircle2 } from 'lucide-react';
import {
  NOMINATION_MAP,
  TEACHERS,
  type VoteRecord,
} from '../data/electionData';

interface VoteReceiptStepProps {
  receipt: VoteRecord;
  onViewResults: () => void;
  onVoteAnother: () => void;
}

export function VoteReceiptStep({
  receipt,
  onViewResults,
  onVoteAnother,
}: VoteReceiptStepProps) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <CheckCircle2 className="mt-1 h-7 w-7 shrink-0 text-emerald-700" />
            <div>
              <p className="text-xs font-semibold text-emerald-700">
                Suara Berhasil Dicatat
              </p>
              <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
                Terima Kasih Telah Berpartisipasi
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Pilihan nominasi Anda telah tersimpan permanen ke dalam rekapitulasi sekolah.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Nama Lengkap</p>
            <p className="mt-0.5 font-semibold text-slate-900">
              {receipt.fullName}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Kelas</p>
            <p className="mt-0.5 font-semibold text-slate-900">
              Kelas {receipt.className}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Ringkasan 27 Pilihan Nominasi Anda
          </h2>
          <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {TEACHERS.map((teacher) => {
              const catId = receipt.selections[teacher.id];
              const cat = catId ? NOMINATION_MAP.get(catId) : undefined;
              return (
                <div
                  key={teacher.id}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
                >
                  <span className="text-slate-700">
                    <span className="mr-2 font-mono text-xs text-slate-400 tabular-nums">
                      {String(teacher.order).padStart(2, '0')}
                    </span>
                    {teacher.name}
                  </span>
                  <span className="font-semibold text-blue-900 shrink-0">
                    {cat?.label ?? '-'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onVoteAnother}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Kembali ke Halaman Awal
          </button>
          <button
            type="button"
            onClick={onViewResults}
            className="rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Lihat Hasil Sementara
          </button>
        </div>
      </div>
    </section>
  );
}
