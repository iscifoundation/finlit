'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ROLES, STATUS, inr } from '@/lib/finlit/api';
import { Tent, CheckCircle2, Clock, Users, MapPin, ArrowRight, FileText, Download } from 'lucide-react';
import { downloadROReportPdf } from './pdf';
import { toast } from 'sonner';

const Stat = ({ label, value, sub, tone = 'default', onClick }) => {
  const tones = {
    default: 'bg-white',
    amber: 'bg-amber-50/50 border-amber-200',
    sky: 'bg-sky-50/50 border-sky-200',
    indigo: 'bg-indigo-50/50 border-indigo-200',
    emerald: 'bg-emerald-50/50 border-emerald-200',
  };
  return (
    <button onClick={onClick} className={`text-left p-5 rounded-xl border ${tones[tone]} hover:shadow-sm transition w-full`}>
      <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">{label}</div>
      <div className="text-3xl font-semibold text-slate-900 mt-2">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </button>
  );
};

export default function DashboardView({ user, setView, onOpenProgram, onFilter }) {
  const [d, setD] = useState(null);
  const [progs, setProgs] = useState([]);
  const [ro, setRO] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api('/dashboard').then(setD);
    api('/programs').then(setProgs);
    if (user.role === ROLES.REGIONAL_OFFICE && user.roId) {
      api(`/regional_offices/${user.roId}`).then(setRO).catch(() => {});
    }
  }, [user.roId, user.role]);

  const downloadFullReport = async (withPhotos) => {
    setDownloading(true);
    try {
      const [allProgs, districts, branches, villages, banks, ros] = await Promise.all([
        api('/programs?status=authenticated'),
        api('/districts'), api('/branches'), api('/villages'), api('/banks'), api('/regional_offices'),
      ]);
      const roMeta = ros.find(r => r.id === (user.roId || allProgs[0]?.roId));
      const bank = banks.find(b => b.id === roMeta?.bankId);
      const filtered = user.role === ROLES.REGIONAL_OFFICE ? allProgs.filter(p => p.roId === user.roId) : allProgs;
      if (!filtered.length) { toast.error('No authenticated programs yet.'); setDownloading(false); return; }
      downloadROReportPdf(filtered, { ro: roMeta, bank, districts, branches, villages }, { includePhotos: withPhotos });
      toast.success('Report generated');
    } catch (e) { toast.error(e.message); }
    setDownloading(false);
  };

  if (!d) return <div className="text-slate-400">Loading...</div>;
  const c = d.counts;

  const upcoming = progs.filter(p => ['confirmed', 'proposed'].includes(p.status)).slice(0, 5);
  const attention = progs.filter(p => (user.role === ROLES.BRANCH_MANAGER && p.status === 'proposed') || (user.role === ROLES.PROGRAM_MANAGER && ['change_requested', 'conducted'].includes(p.status)) || (user.role === ROLES.ADMIN && p.status === 'conducted')).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hi, {user.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500 mt-1">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {user.role === ROLES.REGIONAL_OFFICE ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Total Assigned" value={ro?.programsAllocated || c.total} sub="Per Regional Office" onClick={() => setView('programs')} />
          <Stat label="Conducted" value={c.conducted + c.authenticated} sub={`${d.beneficiaries.toLocaleString('en-IN')} beneficiaries`} tone="indigo" onClick={() => { onFilter?.('conducted'); setView('programs'); }} />
          <Stat label="Pending Authentication" value={c.pendingAuth} sub="Awaiting ISCI verify" tone="amber" onClick={() => { onFilter?.('conducted'); setView('programs'); }} />
          <Stat label="Authenticated" value={c.authenticated} sub="Ready for billing" tone="emerald" onClick={() => { onFilter?.('authenticated'); setView('programs'); }} />
        </div>
      ) : user.role === ROLES.BRANCH_MANAGER ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Awaiting Your Confirmation" value={c.pendingConfirm} tone="amber" onClick={() => { onFilter?.('proposed'); setView('programs'); }} />
          <Stat label="Confirmed (Upcoming)" value={c.confirmed} tone="sky" onClick={() => { onFilter?.('confirmed'); setView('programs'); }} />
          <Stat label="Conducted" value={c.conducted + c.authenticated} tone="emerald" onClick={() => { onFilter?.('conducted'); setView('programs'); }} />
          <Stat label="Total Assigned" value={c.total} onClick={() => setView('programs')} />
        </div>
      ) : user.role === ROLES.TEAM ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Pending Confirmation" value={c.proposed + c.change_requested} tone="amber" onClick={() => { onFilter?.('proposed'); setView('programs'); }} />
          <Stat label="Confirmed & Ready" value={c.confirmed} tone="sky" onClick={() => { onFilter?.('confirmed'); setView('programs'); }} />
          <Stat label="Conducted" value={c.conducted} tone="indigo" onClick={() => { onFilter?.('conducted'); setView('programs'); }} />
          <Stat label="Authenticated" value={c.authenticated} tone="emerald" onClick={() => { onFilter?.('authenticated'); setView('programs'); }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Total Programs" value={c.total} onClick={() => setView('programs')} />
          <Stat label="Pending Confirmation" value={c.proposed + c.change_requested} tone="amber" onClick={() => { onFilter?.('proposed'); setView('programs'); }} />
          <Stat label="Confirmed" value={c.confirmed} tone="sky" onClick={() => { onFilter?.('confirmed'); setView('programs'); }} />
          <Stat label="Pending Auth" value={c.pendingAuth} tone="indigo" onClick={() => { onFilter?.('conducted'); setView('programs'); }} />
          <Stat label="Authenticated" value={c.authenticated} sub={`${d.beneficiaries.toLocaleString('en-IN')} beneficiaries`} tone="emerald" onClick={() => { onFilter?.('authenticated'); setView('programs'); }} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-slate-900">Needs your attention</div>
              <button className="text-xs text-slate-500 hover:text-primary" onClick={() => setView('programs')}>View all</button>
            </div>
            {attention.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">Nothing pending 🎉</div>
            ) : attention.map(p => (
              <button key={p.id} onClick={() => onOpenProgram(p.id)} className="w-full text-left flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"><Clock className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{p.code}</div>
                  <div className="text-xs text-slate-500">{STATUS[p.status]?.label} • {p.proposedDate ? new Date(p.proposedDate).toLocaleDateString('en-IN') : '—'}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-slate-900">Upcoming (confirmed dates)</div>
              <button className="text-xs text-slate-500 hover:text-primary" onClick={() => setView('programs')}>View all</button>
            </div>
            {upcoming.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">No upcoming programs</div>
            ) : upcoming.map(p => (
              <button key={p.id} onClick={() => onOpenProgram(p.id)} className="w-full text-left flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition">
                <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center"><MapPin className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{p.code}</div>
                  <div className="text-xs text-slate-500">{STATUS[p.status]?.label} • {p.proposedDate ? new Date(p.proposedDate).toLocaleDateString('en-IN') : '—'}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {user.role === ROLES.REGIONAL_OFFICE && ro?.feePerProgram && (
        <Card className="border-slate-200">
          <CardContent className="p-5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm text-slate-500">Agreed fee per program</div>
              <div className="text-2xl font-semibold text-slate-900 mt-1">{inr(ro.feePerProgram)}</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => downloadFullReport(false)} disabled={downloading}>
                <Download className="w-4 h-4 mr-1" />Summary Report
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadFullReport(true)} disabled={downloading}>
                <Download className="w-4 h-4 mr-1" />Full Report (with photos)
              </Button>
              <Button size="sm" onClick={() => setView('invoices')}><FileText className="w-4 h-4 mr-1" />Invoices</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {[ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role) && c.authenticated > 0 && (
        <Card className="border-slate-200">
          <CardContent className="p-5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm text-slate-500">Consolidated Report</div>
              <div className="text-slate-700 mt-1">Download all {c.authenticated} authenticated programs as a single PDF</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => downloadFullReport(false)} disabled={downloading}>
                <Download className="w-4 h-4 mr-1" />Summary PDF
              </Button>
              <Button size="sm" onClick={() => downloadFullReport(true)} disabled={downloading}>
                <Download className="w-4 h-4 mr-1" />Full Report (with photos)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
