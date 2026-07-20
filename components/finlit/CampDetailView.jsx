'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, CAMP_STATUS_META, ROLES, ROLE_LABELS } from '@/lib/finlit/api';
import { ArrowLeft, MapPin, Calendar, Users, Camera, Clock, CheckCircle2, XCircle, RefreshCw, UserCheck, Truck, PlayCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

function StatusPill({ status }) {
  const m = CAMP_STATUS_META[status] || { label: status, color: 'bg-slate-100' };
  return <span className={`text-xs px-2 py-1 rounded-full font-medium ${m.color}`}>{m.label}</span>;
}

export default function CampDetailView({ campId, user, onBack, onExecute }) {
  const [camp, setCamp] = useState(null);
  const [refs, setRefs] = useState({ villages: [], branches: [], districts: [], teams: [], banks: [], projects: [], users: [] });
  const [dialog, setDialog] = useState(null); // action name or null
  const [formData, setFormData] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => api(`/camps/${campId}`).then(setCamp).catch(e => toast.error(e.message));

  useEffect(() => {
    load();
    Promise.all([api('/villages'), api('/branches'), api('/districts'), api('/teams'), api('/banks'), api('/projects'), api('/users')])
      .then(([villages, branches, districts, teams, banks, projects, users]) => setRefs({ villages, branches, districts, teams, banks, projects, users }));
  }, [campId]);

  if (!camp) return <div className="text-slate-400">Loading...</div>;

  const village = refs.villages.find(v => v.id === camp.villageId);
  const branch = refs.branches.find(b => b.id === camp.branchId);
  const district = refs.districts.find(d => d.id === camp.districtId);
  const team = refs.teams.find(t => t.id === camp.teamId);
  const bank = refs.banks.find(b => b.id === camp.bankId);
  const project = refs.projects.find(p => p.id === camp.projectId);

  const doAction = async (action, body = {}) => {
    setBusy(true);
    try {
      const updated = await api(`/camps/${campId}/${action}`, { method: 'POST', body: JSON.stringify(body) });
      setCamp(updated);
      toast.success(`Action: ${action.replace('-', ' ')} ✓`);
      setDialog(null);
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  // Which actions can this user perform?
  const actions = [];
  if (user.role === ROLES.BRANCH_MANAGER && camp.status === 'awaiting_confirmation') {
    actions.push({ key: 'confirm', label: 'Confirm', Icon: CheckCircle2, variant: 'default' });
    actions.push({ key: 'request-change', label: 'Request Change', Icon: RefreshCw, variant: 'outline' });
    actions.push({ key: 'reject', label: 'Reject', Icon: XCircle, variant: 'destructive' });
  }
  if ([ROLES.BRANCH_MANAGER, ROLES.SUPER_ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role) && ['confirmed', 'change_requested'].includes(camp.status)) {
    actions.push({ key: 'assign-representative', label: 'Assign Representative', Icon: UserCheck, variant: 'default' });
  }
  if ([ROLES.DISTRICT_COORDINATOR, ROLES.SUPER_ADMIN, ROLES.PROGRAM_MANAGER, ROLES.ROUTE_PLANNER].includes(user.role) && ['representative_assigned', 'confirmed'].includes(camp.status)) {
    actions.push({ key: 'assign-team', label: 'Assign Team', Icon: Truck, variant: 'default' });
  }
  if ([ROLES.DISTRICT_COORDINATOR, ROLES.SUPER_ADMIN, ROLES.PROGRAM_MANAGER, ROLES.ROUTE_PLANNER].includes(user.role) && ['team_assigned'].includes(camp.status)) {
    actions.push({ key: 'schedule', label: 'Confirm Schedule', Icon: Calendar, variant: 'default' });
  }
  if (user.role === ROLES.TEAM_LEADER && ['scheduled', 'team_assigned'].includes(camp.status)) {
    actions.push({ key: 'execute', label: 'Start / Execute Camp', Icon: PlayCircle, variant: 'default', special: true });
  }
  if ((user.role === ROLES.TEAM_LEADER || user.role === ROLES.FIELD_TRAINER) && camp.status === 'in_progress') {
    actions.push({ key: 'execute', label: 'Continue Execution', Icon: PlayCircle, variant: 'default', special: true });
  }
  if ([ROLES.DISTRICT_COORDINATOR, ROLES.SUPER_ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role) && camp.status === 'completed') {
    actions.push({ key: 'verify', label: 'Verify Camp', Icon: ShieldCheck, variant: 'default' });
  }
  if (user.role === ROLES.SUPER_ADMIN && camp.status === 'verified') {
    actions.push({ key: 'close', label: 'Close Camp', Icon: CheckCircle2, variant: 'default' });
  }

  const openDialog = (key) => { setFormData({}); setDialog(key); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
        <div className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{camp.code}</div>
        <StatusPill status={camp.status} />
        <div className="ml-auto flex flex-wrap gap-2">
          {actions.map(a => (
            <Button key={a.key} size="sm" variant={a.variant} disabled={busy}
              onClick={() => a.special ? onExecute(camp.id) : (['confirm'].includes(a.key) ? doAction(a.key) : openDialog(a.key))}>
              <a.Icon className="w-4 h-4 mr-1" />{a.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Overview */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Camp Overview</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><div className="text-xs text-slate-500">Village</div><div className="font-medium">{village?.name}</div><div className="text-xs text-slate-500">{village?.panchayat}</div></div>
              <div><div className="text-xs text-slate-500">Branch</div><div className="font-medium">{branch?.name}</div><div className="text-xs text-slate-500">{branch?.code}</div></div>
              <div><div className="text-xs text-slate-500">District</div><div className="font-medium">{district?.name}</div></div>
              <div><div className="text-xs text-slate-500">Bank</div><div className="font-medium">{bank?.name}</div></div>
              <div><div className="text-xs text-slate-500">Project</div><div className="font-medium">{project?.name}</div></div>
              <div><div className="text-xs text-slate-500">Team</div><div className="font-medium">{team?.name || '—'}</div></div>
              <div><div className="text-xs text-slate-500">Proposed Date</div><div className="font-medium">{camp.proposedDate ? new Date(camp.proposedDate).toLocaleDateString() : '—'}</div></div>
              <div><div className="text-xs text-slate-500">Expected Audience</div><div className="font-medium">{camp.expectedAudience || '—'}</div></div>
              <div><div className="text-xs text-slate-500">Coordinates</div><div className="font-medium">{village ? `${village.lat.toFixed(4)}, ${village.lng.toFixed(4)}` : '—'}</div>{village && <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${village.lat}&mlon=${village.lng}#map=13/${village.lat}/${village.lng}`} className="text-xs text-primary">Open on map ↗</a>}</div>
            </div>

            {camp.representative && (
              <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm">
                <div className="text-xs text-blue-700 mb-1">Bank Representative</div>
                <div className="font-medium">{camp.representative.name} • {camp.representative.role}</div>
                <div className="text-xs text-slate-600">📞 {camp.representative.contact}</div>
                {camp.representative.remarks && <div className="text-xs text-slate-500 mt-1">{camp.representative.remarks}</div>}
              </div>
            )}

            {camp.attendance && (
              <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-emerald-700" /><div className="font-medium text-emerald-800">Attendance ({camp.attendance.total} total)</div></div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {Object.entries(camp.attendance).filter(([k]) => k !== 'total').map(([k, v]) => (
                    <div key={k} className="bg-white p-2 rounded border"><div className="text-slate-500 capitalize">{k}</div><div className="font-semibold">{v}</div></div>
                  ))}
                </div>
              </div>
            )}

            {(camp.photos || []).length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2"><Camera className="w-4 h-4" /><div className="font-medium">Photo Evidence ({camp.photos.length})</div></div>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {camp.photos.map(p => (
                    <div key={p.id} className="aspect-square rounded-lg border overflow-hidden bg-slate-100 relative">
                      {p.data ? <img src={p.data} alt={p.category} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 text-center p-1 capitalize">{p.category?.replace('_', ' ')}</div>}
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 capitalize">{p.category?.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {camp.gpsStart && (
              <div className="mt-4 p-3 rounded-lg bg-slate-50 border text-xs">
                <div className="font-medium mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" />GPS Log</div>
                <div>Start: {camp.gpsStart.lat.toFixed(6)}, {camp.gpsStart.lng.toFixed(6)} • accuracy ±{camp.gpsStart.accuracy || '?'}m</div>
                {camp.gpsEnd && <div>End: {camp.gpsEnd.lat.toFixed(6)}, {camp.gpsEnd.lng.toFixed(6)}</div>}
                {camp.duration && <div>Duration: {camp.duration} minutes</div>}
              </div>
            )}

            {camp.remarks && (
              <div className="mt-3 text-sm"><div className="text-xs text-slate-500">Field Remarks</div><div>{camp.remarks}</div></div>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Activity Timeline</CardTitle></CardHeader>
          <CardContent>
            <ol className="relative border-l border-slate-200 ml-2 space-y-4">
              {[...(camp.timeline || [])].reverse().map(t => {
                const usr = refs.users.find(u => u.id === t.by);
                return (
                  <li key={t.id} className="ml-4">
                    <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-primary" />
                    <div className="text-xs font-medium text-slate-700 capitalize">{t.event?.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-slate-600">{t.message}</div>
                    <div className="text-[11px] text-slate-400">{usr ? `${usr.name} (${ROLE_LABELS[usr.role]}) • ` : ''}{new Date(t.timestamp).toLocaleString()}</div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Action Dialogs */}
      <Dialog open={!!dialog} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="capitalize">{dialog?.replace('-', ' ')}</DialogTitle></DialogHeader>
          {dialog === 'request-change' && (
            <div><Label>Reason</Label><Textarea value={formData.reason || ''} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="E.g. requested a different date..." /></div>
          )}
          {dialog === 'reject' && (
            <div><Label>Reason for rejection</Label><Textarea value={formData.reason || ''} onChange={e => setFormData({ ...formData, reason: e.target.value })} /></div>
          )}
          {dialog === 'assign-representative' && (
            <div className="space-y-2">
              <div><Label>Name</Label><Input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="E.g. Meera Kulkarni" /></div>
              <div><Label>Contact number</Label><Input value={formData.contact || ''} onChange={e => setFormData({ ...formData, contact: e.target.value })} /></div>
              <div><Label>Role at branch</Label>
                <Select value={formData.role || ''} onValueChange={v => setFormData({ ...formData, role: v })}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {['Branch Manager', 'BC (Bank Correspondent)', 'Accountant', 'Field Officer', 'Other Representative'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Remarks</Label><Textarea value={formData.remarks || ''} onChange={e => setFormData({ ...formData, remarks: e.target.value })} /></div>
            </div>
          )}
          {dialog === 'assign-team' && (
            <div className="space-y-2">
              <Label>Team</Label>
              <Select value={formData.teamId || ''} onValueChange={v => setFormData({ ...formData, teamId: v })}>
                <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>{refs.teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {dialog === 'schedule' && (
            <div><Label>Confirm Date</Label><Input type="date" value={formData.date || (camp.proposedDate ? new Date(camp.proposedDate).toISOString().slice(0, 10) : '')} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
          )}
          {dialog === 'verify' && (
            <div><Label>Verification remarks</Label><Textarea value={formData.remarks || ''} onChange={e => setFormData({ ...formData, remarks: e.target.value })} placeholder="GPS verified, photos verified..." /></div>
          )}
          {dialog === 'close' && <div className="text-sm text-slate-600">This will move the camp to closed state.</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={() => doAction(dialog, formData)} disabled={busy}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
