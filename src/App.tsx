import { useState } from 'react';
import type { VoteRecord } from './data/electionData';
import { TopNav, type AppTab } from './components/TopNav';
import {
  VoterIdentityStep,
  type VerifiedVoter,
} from './components/VoterIdentityStep';
import { BallotStep } from './components/BallotStep';
import { VoteReceiptStep } from './components/VoteReceiptStep';
import { PublicSummaryView } from './components/PublicSummaryView';
import { AdminDashboardView } from './components/AdminDashboardView';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('vote');
  const [verifiedVoter, setVerifiedVoter] = useState<VerifiedVoter | null>(
    null
  );
  const [submittedReceipt, setSubmittedReceipt] = useState<VoteRecord | null>(
    null
  );

  const handleSelectTab = (tab: AppTab) => {
    setActiveTab(tab);
  };

  return (
    <div id="top" className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <TopNav activeTab={activeTab} onSelectTab={handleSelectTab} />

      <main className="flex-1">
        {activeTab === 'vote' && (
          <>
            {submittedReceipt ? (
              <VoteReceiptStep
                receipt={submittedReceipt}
                onViewResults={() => setActiveTab('results')}
                onVoteAnother={() => {
                  setSubmittedReceipt(null);
                  setVerifiedVoter(null);
                }}
              />
            ) : verifiedVoter ? (
              <BallotStep
                voter={verifiedVoter}
                onSubmitted={(receipt) => setSubmittedReceipt(receipt)}
                onChangeVoter={() => setVerifiedVoter(null)}
              />
            ) : (
              <VoterIdentityStep
                onVerified={(voter) => setVerifiedVoter(voter)}
              />
            )}
          </>
        )}

        {activeTab === 'results' && <PublicSummaryView />}

        {activeTab === 'admin' && <AdminDashboardView />}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Nominasi Guru · Pemilihan Penghargaan Guru Pilihan Siswa</p>
          <p>1 Suara per Siswa · 1 Nominasi per Guru · Sinkronisasi Excel</p>
        </div>
      </footer>
    </div>
  );
}
