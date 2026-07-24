'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, STATUS, ROLES, ROLE_LABELS, inr } from '@/lib/finlit/api';
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, ShieldCheck, PlayCircle, MapPin, Calendar, Users, Camera, Download, Wallet, Building2, Clock, UsersRound, ImageIcon, X as XIcon, Edit3 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadProgramPdf } from './pdf';

export default function ProgramDetailView({ id, user, onBack, onExecute }) {
  const [p, setP] = useState(null);
  const [refs, setRefs] = useState({});
  const [dialog, setDialog] = useState(null);
  const [fd, setFd] = useState({});
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { src, index }

  const load = () => api(`/programs/${id}`).then(setP).catch(e => toast.error(e.message));

  useEffect(() => {
    load();
    Promise.all([api('/regional_offices'), api('/districts'), api('/branches'), api('/villages'), api('/teams'), api('/users'), api('/banks')])
      .then(([ros, districts, branches, villages, teams, users, banks]) => setRefs({ ros, districts, branches, villages, teams, users, banks }));
  }, [id]);

  if (!p) return <div className="text-slate-400">Loading...</div>;

  const ro = refs.ros?.find(x => x.id === p.roId);
  const district = refs.districts?.find(x => x.id === p.districtId);
  const branch = refs.branches?.find(x => x.id === p.branchId);
  const village = refs.villages?.find(x => x.id === p.villageId);
  const team = refs.teams?.find(x => x.id === p.teamId);
  const bank = refs.banks?.find(x => x.id === p.bankId);

  const doAction = async (action, body = {}) => {
    setBusy(true);
    try {
      const r = await api(`/programs/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) });
      setP(r);
      toast.success('✓ ' + action.replace('-', ' '));
      setDialog(null); setFd({});
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  // Available actions based on role & status
  const actions = [];
  if (p.status === 'proposed' || p.status === 'change_requested') {
    if (user.role === ROLES.BRANCH_MANAGER && p.branchId === user.branchId) {
      actions.push({ k: 'confirm', label: 'Confirm Date', Icon: CheckCircle2 });
      actions.push({ k: 'request-change', label: 'Request Change', Icon: RefreshCw, variant: 'outline' });
    }
    if (user.role === ROLES.ADMIN) actions.push({ k: 'confirm', label: 'Confirm as Admin', Icon: CheckCircle2 });
    if (user.role === ROLES.REGIONAL_OFFICE && p.roId === user.roId) actions.push({ k: 'confirm', label: 'Confirm as RO', Icon: CheckCircle2 });
    if (user.role === ROLES.PROGRAM_MANAGER) {
      const minsSinceCreation = (Date.now() - new Date(p.createdAt).getTime()) / 60000;
      if (minsSinceCreation >= 30) actions.push({ k: 'confirm-pm', label: 'Confirm on behalf of Branch', Icon: CheckCircle2, variant: 'outline' });
      else actions.push({ k: 'wait-pm', label: `Wait ${Math.ceil(30 - minsSinceCreation)}m for BM`, Icon: Clock, variant: 'ghost', disabled: true });
    }
  }
  if ([ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role) && ['change_requested', 'proposed'].includes(p.status)) {
    actions.push({ k: 'reschedule', label: 'Reschedule', Icon: Calendar, variant: 'outline' });
  }
  // Change team — allowed for admin/PM before the program is conducted
  if ([ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role) && ['proposed', 'confirmed', 'change_requested'].includes(p.status)) {
    actions.push({ k: 'assign-team', label: p.teamId ? 'Change Team' : 'Assign Team', Icon: UsersRound, variant: 'outline' });
  }
  if ([ROLES.ADMIN, ROLES.PROGRAM_MANAGER, ROLES.TEAM].includes(user.role) && p.status === 'confirmed') {
    actions.push({ k: 'execute', label: 'Conduct Program', Icon: PlayCircle, special: true });
  }
  // Edit photos — allowed for team/PM/admin before authentication (once photos exist)
  if ([ROLES.ADMIN, ROLES.PROGRAM_MANAGER, ROLES.TEAM].includes(user.role) && p.status === 'conducted' && (p.photos || []).length > 0) {
    actions.push({ k: 'execute', label: 'Edit Photos / Data', Icon: Edit3, variant: 'outline', special: true });
  }
  if ([ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role) && p.status === 'conducted') {
    actions.push({ k: 'authenticate', label: 'Authenticate', Icon: ShieldCheck });
  }
  if ([ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role) && p.status === 'authenticated') {
    actions.push({ k: 'unauthenticate', label: 'Request Re-authentication', Icon: RefreshCw, variant: 'outline' });
  }
  const canSeeExpense = [ROLES.ADMIN, ROLES.PROGRAM_MANAGER, ROLES.TEAM].includes(user.role);
  const canPdf = ['conducted', 'authenticated'].includes(p.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">{p.code}</span>
        <Badge variant="outline" className={STATUS[p.status]?.color}>{STATUS[p.status]?.label}</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {canPdf && <Button size="sm" variant="outline" onClick={() => downloadProgramPdf(p, { ro, district, branch, village, bank })}><Download className="w-4 h-4 mr-1" />Download PDF</Button>}
          {actions.map(a => (
            <Button key={a.k} size="sm" variant={a.variant || 'default'} disabled={busy || a.disabled}
              onClick={() => a.special ? onExecute(p.id) : (a.k === 'confirm-pm' ? setDialog('confirm-pm') : (a.k === 'confirm' ? doAction('confirm') : setDialog(a.k)))}>
              <a.Icon className="w-4 h-4 mr-1" />{a.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-slate-200">
          <CardContent className="p-5 space-y-4">
            <div className="font-semibold text-slate-900">Program Details</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <Field label="Bank" value={bank?.name} />
              <Field label="Regional Office" value={ro?.name} />
              <Field label="District" value={district?.name} />
              <Field label="Branch" value={branch?.name} />
              <Field label="Village" value={village?.name} />
              <Field label="State" value={district?.state} />
              <Field label="Proposed Date" value={p.proposedDate ? new Date(p.proposedDate).toLocaleDateString('en-IN') : '—'} />
              <Field label="Branch Confirmation" value={p.branchConfirmed ? '✓ Confirmed' : 'Pending'} />
              <Field label="Team" value={team?.name || '—'} />
              {p.participants !== null && <Field label="Participants" value={p.participants} />}
              {p.authenticatedAt && <Field label="Authenticated On" value={new Date(p.authenticatedAt).toLocaleDateString('en-IN')} />}
            </div>

            {(p.photos || []).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2"><Camera className="w-4 h-4 text-slate-500" /><div className="text-sm font-medium">Photos ({p.photos.length}/4)</div></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {p.photos.map((ph, i) => (
                    <button
                      type="button"
                      key={ph.id}
                      onClick={() => ph.data && setLightbox({ src: ph.data, index: i, gps: ph.gps })}
                      className="group relative aspect-video rounded-lg border overflow-hidden bg-slate-50 hover:ring-2 hover:ring-primary/40 focus:outline-none focus:ring-2 focus:ring-primary transition"
                    >
                      {ph.data
                        ? <img src={ph.data} alt={`Photo ${i+1}`} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-slate-300"><Camera className="w-6 h-6" /></div>}
                      <div className="absolute top-1.5 left-1.5 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">#{i+1}</div>
                      {ph.gps && <div className="absolute bottom-1.5 left-1.5 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">📍 {(+ph.gps.lat).toFixed(4)}, {(+ph.gps.lng).toFixed(4)}</div>}
                      {ph.data && <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><ImageIcon className="w-6 h-6 text-white drop-shadow" /></div>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canSeeExpense && p.expenses && (
              <div>
                <div className="flex items-center gap-2 mb-2"><Wallet className="w-4 h-4 text-slate-500" /><div className="text-sm font-medium">Expenses</div></div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[['taxi', 'Taxi/Fuel'], ['food', 'Food'], ['refreshments', 'Refreshments'], ['stationary', 'Stationery'], ['other', 'Other']].map(([k, l]) => (
                    <div key={k} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                      <div className="text-xs text-slate-500">{l}</div>
                      <div className="font-medium text-slate-800">{inr(p.expenses[k] || 0)}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-sm text-slate-700">Total expenses: <b>{inr(Object.values(p.expenses).reduce((s, v) => s + (+v || 0), 0))}</b></div>
              </div>
            )}

            {p.remarks && (
              <div><div className="text-xs text-slate-500">Field remarks</div><div className="text-sm text-slate-700">{p.remarks}</div></div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="font-semibold text-slate-900 mb-3">Timeline</div>
            <ol className="relative border-l-2 border-slate-100 ml-2 space-y-4">
              {(p.timeline || []).slice().reverse().map(t => {
                const usr = refs.users?.find(u => u.id === t.by);
                return (
                  <li key={t.id} className="ml-4">
                    <div className="absolute -left-[5px] w-2 h-2 rounded-full bg-primary mt-2" />
                    <div className="text-xs font-medium text-slate-700 capitalize">{t.event?.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-slate-500">{t.message}</div>
                    <div className="text-[10px] text-slate-400">{usr ? `${usr.name} (${ROLE_LABELS[usr.role]}) • ` : ''}{new Date(t.timestamp).toLocaleString('en-IN')}</div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!dialog} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="capitalize">{dialog?.replace('-', ' ')}</DialogTitle></DialogHeader>
          {dialog === 'request-change' && <div><Label>Reason</Label><Textarea value={fd.reason || ''} onChange={e => setFd({ reason: e.target.value })} placeholder="E.g. requested a different date..." /></div>}
          {dialog === 'confirm-pm' && <div><Label>Reason for confirming on behalf of Branch Manager <span className="text-red-500">*</span></Label><Textarea value={fd.reason || ''} onChange={e => setFd({ reason: e.target.value })} placeholder="E.g. Branch Manager unreachable for 30+ minutes..." required /></div>}
          {dialog === 'reschedule' && <div><Label>New date</Label><Input type="date" value={fd.date || ''} onChange={e => setFd({ date: e.target.value })} /></div>}
          {dialog === 'assign-team' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                Current team: <span className="font-medium text-slate-800">{team?.name || '— none —'}</span>
                {team?.leaderName && <> • Leader: <span className="font-medium text-slate-800">{team.leaderName}</span></>}
              </div>
              <div>
                <Label>New team <span className="text-red-500">*</span></Label>
                <select className="w-full h-10 border rounded-md px-3 text-sm bg-white mt-1" value={fd.teamId || ''} onChange={e => setFd({ ...fd, teamId: e.target.value })}>
                  <option value="">Select a team...</option>
                  {(refs.teams || []).filter(t => t.id !== p.teamId).map(t => (
                    <option key={t.id} value={t.id}>{t.name}{t.leaderName ? ` — Leader: ${t.leaderName}` : ''}</option>
                  ))}
                </select>
                {(refs.teams || []).length <= (p.teamId ? 1 : 0) && <div className="text-[11px] text-amber-600 mt-1">No other teams available. Create a team first under Teams.</div>}
              </div>
              <div>
                <Label>Reason (optional)</Label>
                <Textarea value={fd.reason || ''} onChange={e => setFd({ ...fd, reason: e.target.value })} placeholder="E.g. team availability, geographic proximity, etc." />
              </div>
            </div>
          )}
          {dialog === 'authenticate' && <div className="text-sm text-slate-600">Confirm this program is verified? It will be visible to Regional Office and can be included in an invoice.</div>}
          {dialog === 'unauthenticate' && <div><Label>Reason</Label><Textarea value={fd.reason || ''} onChange={e => setFd({ reason: e.target.value })} /></div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (dialog === 'assign-team' && !fd.teamId) return toast.error('Select a team');
                doAction(dialog === 'confirm-pm' ? 'confirm' : dialog, fd);
              }}
              disabled={busy}
            >
              {dialog === 'assign-team' ? 'Change Team' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo Lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            aria-label="Close"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full w-10 h-10 flex items-center justify-center transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
          <div className="max-w-[95vw] max-h-[92vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <img src={lightbox.src} alt={`Photo ${lightbox.index + 1}`} className="max-w-full max-h-[86vh] object-contain rounded-md shadow-2xl" />
            <div className="mt-3 flex items-center gap-3 text-white/80 text-xs">
              <span>Photo {lightbox.index + 1} / {(p.photos || []).length}</span>
              {lightbox.gps && <span>📍 {(+lightbox.gps.lat).toFixed(5)}, {(+lightbox.gps.lng).toFixed(5)}</span>}
              <a href={lightbox.src} download={`${p.code}-photo-${lightbox.index + 1}.jpg`} onClick={e => e.stopPropagation()} className="underline hover:text-white">Download</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className="font-medium text-slate-800">{value || '—'}</div></div>;
}
