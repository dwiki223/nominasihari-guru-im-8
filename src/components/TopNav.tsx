export type AppTab = 'vote' | 'results' | 'admin';

interface TopNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
}

export function TopNav({ activeTab, onSelectTab }: TopNavProps) {
  const navItems: Array<{ id: AppTab; label: string; shortLabel: string }> = [
    { id: 'vote', label: 'Voting Siswa', shortLabel: 'Voting' },
    { id: 'results', label: 'Hasil Sementara', shortLabel: 'Hasil' },
    { id: 'admin', label: 'Panel Panitia', shortLabel: 'Panitia' },
  ];

  const primaryActionTab: AppTab = activeTab === 'vote' ? 'results' : 'vote';
  const primaryActionLabel =
    activeTab === 'vote' ? 'Lihat Hasil' : 'Mulai Memilih';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:gap-8 sm:px-6">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('vote');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 sm:text-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-900"
        >
          Nominasi Guru
        </a>

        <nav
          aria-label="Navigasi Utama"
          className="flex items-center gap-4 sm:gap-7"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-900 ${
                  isActive
                    ? 'text-blue-900 underline decoration-blue-900 decoration-2 underline-offset-8'
                    : 'text-slate-600 hover:text-slate-900 hover:underline hover:decoration-slate-300 hover:underline-offset-8'
                }`}
              >
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="hidden sm:flex items-center shrink-0">
          <button
            type="button"
            onClick={() => onSelectTab(primaryActionTab)}
            className="rounded-lg bg-blue-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </header>
  );
}
