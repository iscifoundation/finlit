'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, STATUS, ROLES } from '@/lib/finlit/api';
import { Search, Plus, ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function ProgramsView({ user, onOpenProgram, initialFilter }) {
  const [progs, setProgs] = useState([]);
  const [refs, setRefs] = useState({ ros: [], districts: [], branches: [], villages: [], teams: [] });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initialFilter || 'all');
  const [openNew, setOpenNew] = useState(false);
  const [nf, setNf] = useState({ branchId: '', villageId: '', teamId: '', proposedDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), remarks: '' });

  const load = () => api('/programs').then(setProgs).catch(() => {});
  useEffect(() => {
    load();
    Promise.all([api('/regional_offices'), api('/districts'), api('/branches'), api('/villages'), api('/teams')])
      .then(([ros, districts, branches, villages, teams]) => setRefs({ ros, districts, branches, villages, teams }));
  }, []);
  useEffect(() => { if (initialFilter) setStatus(initialFilter); }, [initialFilter]);

  const canCreate = [ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role);
  const enriched = useMemo(() => progs.map(p => ({
    ...p,
    village: refs.villages.find(v => v.id === p.villageId)?.name || '—',
    branch: refs.branches.find(b => b.id === p.branchId)?.name || '—',
    district: refs.districts.find(d => d.id === p.districtId)?.name || '—',
  })), [progs, refs]);
  const filtered = enriched.filter(p => (status === 'all' || p.status === status) && (!q || [p.code, p.village, p.branch, p.district].some(x => (x || '').toLowerCase().includes(q.toLowerCase()))));

  const create = async () => {
    if (!nf.branchId || !nf.villageId) return toast.error('Select branch & village');
    if (!nf.teamId) return toast.error('Team is required');
    try {
      await api('/programs', { method: 'POST', body: JSON.stringify({ ...nf, proposedDate: nf.proposedDate }) });
      toast.success('Program created & sent to branch for confirmation');
      setOpenNew(false); setNf({ branchId: '', villageId: '', teamId: '', proposedDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), remarks: '' });
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by ID, village, branch, district..." className="pl-9 h-10" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="md:w-56 h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {canCreate && <Button onClick={() => setOpenNew(true)} className="h-10"><Plus className="w-4 h-4 mr-1" />New Program</Button>}
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-slate-400">No programs found</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(p => (
                <button key={p.id} onClick={() => onOpenProgram(p.id)} className="w-full text-left p-4 hover:bg-slate-50 transition flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{p.code}</span>
                      <span className="font-medium text-slate-800">{p.village}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{p.branch} • {p.district}</span>
                      <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{p.proposedDate ? new Date(p.proposedDate).toLocaleDateString('en-IN') : '—'}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className={`${STATUS[p.status]?.color}`}>{STATUS[p.status]?.label}</Badge>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Program</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Branch</Label>
              <Select value={nf.branchId} onValueChange={v => setNf({ ...nf, branchId: v, villageId: '' })}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{refs.branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Village</Label>
              <Select value={nf.villageId} onValueChange={v => setNf({ ...nf, villageId: v })}>
                <SelectTrigger><SelectValue placeholder="Select village" /></SelectTrigger>
                <SelectContent>{refs.villages.filter(v => !nf.branchId || v.branchId === nf.branchId).map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Team <span className="text-red-500">*</span></Label>
              <Select value={nf.teamId} onValueChange={v => setNf({ ...nf, teamId: v })}>
                <SelectTrigger><SelectValue placeholder="Select team (required)" /></SelectTrigger>
                <SelectContent>{refs.teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Proposed date</Label>
              <Input type="date" value={nf.proposedDate} onChange={e => setNf({ ...nf, proposedDate: e.target.value })} />
            </div>
            <div><Label>Remarks (optional)</Label><Input value={nf.remarks} onChange={e => setNf({ ...nf, remarks: e.target.value })} placeholder="Notes for the branch" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button onClick={create}>Create & Notify Branch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
