import { useState, type FormEvent } from 'react';
import { Award, ShieldCheck, ArrowRight, UserCheck } from 'lucide-react';
import { CLASS_OPTIONS } from '../data/electionData';
import { verifyVoterIdentityRemote } from '../services/apiClient';
import {
  normalizeClassName,
  normalizeName,
  validateVoterIdentity,
} from '../utils/votingRules';

export interface VerifiedVoter {
  fullName: string;
  className: string;
}

interface VoterIdentityStepProps {
  onVerified: (voter: VerifiedVoter) => void;
}

export function VoterIdentityStep({ onVerified }: VoterIdentityStepProps) {
  const [fullName, setFullName] = useState('');
  const [className, setClassName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = normalizeName(fullName);
    const cleanClass = normalizeClassName(className);

    const clientCheck = validateVoterIdentity(cleanName, cleanClass);
    if (!clientCheck.valid) {
      setError(clientCheck.error ?? 'Mohon lengkapi nama lengkap dan kelas.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await verifyVoterIdentityRemote({
        fullName: cleanName,
        className: cleanClass,
      });
      onVerified({
        fullName: res.voter.fullName,
        className: res.voter.className,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal memeriksa identitas pemilih.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
        {/* Left Column: Editorial Intro & Academic Artwork */}
        <div className="flex flex-col justify-between gap-6 lg:col-span-6">
          <div className="space-y-4">
            <p className="text-xs font-semibold tracking-wide text-amber-700">
              Penghargaan Guru Pilihan Siswa · 27 Guru · 29 Kategori Nominasi
            </p>
            <h1 className="font-display text-3xl font-bold leading-tight text-slate-900 sm:text-4xl lg:text-[2.65rem]">
              Pemilihan Nominasi Guru Terbaik
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-slate-600">
              Berikan apresiasi terbaik untuk bapak dan ibu guru. Tuliskan nama lengkap dan pilih kelas Anda sebelum mengisi surat suara nominasi.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100">
              {!imgFailed ? (
                <img
                  src="/src/assets/images/academic_awards_emblem_1795237447213.jpg"
                  alt="Ilustrasi Penghargaan Nominasi Guru"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-100 to-slate-200 p-6 text-center">
                  <Award className="h-10 w-10 text-amber-700" />
                  <p className="font-display text-lg font-semibold text-slate-800">
                    Anugerah Nominasi Guru
                  </p>
                </div>
              )}
            </div>

            <div className="divide-y divide-slate-100 px-5 py-4 text-sm text-slate-700">
              <div className="flex items-start gap-3 pb-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-900" />
                <div>
                  <span className="font-semibold text-slate-900">1 Nominasi per Guru:</span>{' '}
                  Setiap nama guru mendapat tepat 1 gelar nominasi pilihan Anda.
                </div>
              </div>
              <div className="flex items-start gap-3 pt-3">
                <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <span className="font-semibold text-slate-900">Nominasi Tidak Bisa Ganda:</span>{' '}
                  Gelar yang sudah dipilih untuk seorang guru otomatis terkunci dan tidak dapat dipilih lagi di guru berikutnya.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Voter Registration Form */}
        <div className="flex flex-col justify-start lg:col-span-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="mb-6 border-b border-slate-100 pb-4">
              <p className="text-xs font-medium text-slate-500">
                Langkah 1 dari 2 · Identitas Pemilih
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">
                Nama Lengkap dan Kelas Siswa
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label
                  htmlFor="voter-full-name"
                  className="mb-1.5 block text-sm font-semibold text-slate-800"
                >
                  Nama Lengkap Siswa
                </label>
                <input
                  id="voter-full-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Contoh: Alya Rahma Putri"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
                />
              </div>

              <div>
                <label
                  htmlFor="voter-class"
                  className="mb-1.5 block text-sm font-semibold text-slate-800"
                >
                  Kelas
                </label>
                <select
                  id="voter-class"
                  required
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
                >
                  <option value="">Pilih kelas Anda...</option>
                  {CLASS_OPTIONS.map((cls) => (
                    <option key={cls} value={cls}>
                      Kelas {cls}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-500">
                  Tersedia untuk kelas 71–74, 81–85, dan 91–95.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
              >
                <span>
                  {submitting
                    ? 'Memeriksa Data...'
                    : 'Lanjut Pilih Nominasi'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
