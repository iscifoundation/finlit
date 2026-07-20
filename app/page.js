'use client';

import { useEffect, useState } from 'react';
import { api, getToken, setToken } from '@/lib/finlit/api';
import LoginScreen from '@/components/finlit/LoginScreen';
import AppShell from '@/components/finlit/AppShell';
import DashboardView from '@/components/finlit/DashboardView';
import CampsView from '@/components/finlit/CampsView';
import CampDetailView from '@/components/finlit/CampDetailView';
import CampExecuteView from '@/components/finlit/CampExecuteView';
import AnalyticsView from '@/components/finlit/AnalyticsView';
import MasterDataView from '@/components/finlit/MasterDataView';
import NotificationsView from '@/components/finlit/NotificationsView';
import AuditView from '@/components/finlit/AuditView';
import MyRouteView from '@/components/finlit/MyRouteView';
import RoutePlanningView from '@/components/finlit/RoutePlanningView';
import ReportsView from '@/components/finlit/ReportsView';

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState('dashboard');
  const [campId, setCampId] = useState(null);
  const [execCampId, setExecCampId] = useState(null);

  useEffect(() => {
    const t = getToken();
    if (!t) { setChecking(false); return; }
    api('/auth/me').then(res => setUser(res.user)).catch(() => setToken(null)).finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-500">Loading FINLIT360...</div>
    </div>;
  }

  if (!user) return <LoginScreen onLogin={u => { setUser(u); setView('dashboard'); }} />;

  const openCamp = (id) => { setCampId(id); setView('camp-detail'); };
  const executeCamp = (id) => { setExecCampId(id); setView('camp-execute'); };

  return (
    <AppShell user={user} view={view} setView={(v) => { setView(v); setCampId(null); setExecCampId(null); }} onLogout={() => setUser(null)}>
      {view === 'dashboard' && <DashboardView user={user} onOpenCamp={openCamp} setView={setView} />}
      {view === 'camps' && <CampsView user={user} onOpenCamp={openCamp} />}
      {view === 'camp-detail' && campId && <CampDetailView campId={campId} user={user} onBack={() => setView('camps')} onExecute={executeCamp} />}
      {view === 'camp-execute' && execCampId && <CampExecuteView campId={execCampId} user={user} onBack={() => { setExecCampId(null); setView('my-route'); }} />}
      {view === 'analytics' && <AnalyticsView />}
      {view === 'notifications' && <NotificationsView onOpenCamp={openCamp} />}
      {view === 'audit' && <AuditView />}
      {view === 'my-route' && <MyRouteView user={user} onExecute={executeCamp} onOpenCamp={openCamp} />}
      {view === 'route-planning' && <RoutePlanningView user={user} />}
      {view === 'reports' && <ReportsView onOpenCamp={openCamp} />}
      {['banks', 'projects', 'districts', 'branches', 'villages', 'teams', 'vehicles', 'users'].includes(view) && (
        <MasterDataView resource={view} user={user} />
      )}
    </AppShell>
  );
}

export default App;
