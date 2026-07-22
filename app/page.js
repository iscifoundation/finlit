'use client';

import { useEffect, useState } from 'react';
import { api, getToken, setToken } from '@/lib/finlit/api';
import LoginScreen from '@/components/finlit/LoginScreen';
import AppShell from '@/components/finlit/AppShell';
import DashboardView from '@/components/finlit/DashboardView';
import ProgramsView from '@/components/finlit/ProgramsView';
import ProgramDetailView from '@/components/finlit/ProgramDetailView';
import ProgramExecuteView from '@/components/finlit/ProgramExecuteView';
import EntitiesView from '@/components/finlit/EntitiesView';
import TeamsView from '@/components/finlit/TeamsView';
import InvoicesView from '@/components/finlit/InvoicesView';
import SalariesView from '@/components/finlit/SalariesView';
import NotificationsView from '@/components/finlit/NotificationsView';
import AuditView from '@/components/finlit/AuditView';

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState('dashboard');
  const [programId, setProgramId] = useState(null);
  const [execId, setExecId] = useState(null);
  const [invoiceId, setInvoiceId] = useState(null);
  const [initialFilter, setInitialFilter] = useState('');

  useEffect(() => {
    const t = getToken();
    if (!t) { setChecking(false); return; }
    api('/auth/me').then(r => setUser(r.user)).catch(() => setToken(null)).finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">Loading FINLIT360...</div>;
  if (!user) return <LoginScreen onLogin={u => { setUser(u); setView('dashboard'); }} />;

  const openProgram = (id) => { setProgramId(id); setView('program-detail'); };
  const executeProgram = (id) => { setExecId(id); setView('program-execute'); };

  const changeView = (v) => {
    setView(v);
    setProgramId(null); setExecId(null); setInvoiceId(null); setInitialFilter('');
  };

  return (
    <AppShell user={user} view={view} setView={changeView} onLogout={() => { setUser(null); setView('dashboard'); }}>
      {view === 'dashboard' && <DashboardView user={user} setView={setView} onOpenProgram={openProgram} onFilter={setInitialFilter} />}
      {view === 'programs' && <ProgramsView user={user} onOpenProgram={openProgram} initialFilter={initialFilter} />}
      {view === 'program-detail' && programId && <ProgramDetailView id={programId} user={user} onBack={() => changeView('programs')} onExecute={executeProgram} />}
      {view === 'program-execute' && execId && <ProgramExecuteView id={execId} user={user} onBack={() => { setExecId(null); setView('program-detail'); setProgramId(execId); }} />}
      {view === 'entities' && <EntitiesView user={user} />}
      {view === 'teams' && <TeamsView user={user} />}
      {(view === 'invoices' || view === 'invoice-detail') && <InvoicesView user={user} view={view} setView={setView} currentId={invoiceId} setCurrentId={setInvoiceId} />}
      {view === 'salaries' && <SalariesView />}
      {view === 'notifications' && <NotificationsView onOpenProgram={openProgram} />}
      {view === 'audit' && <AuditView />}
    </AppShell>
  );
}

export default App;
