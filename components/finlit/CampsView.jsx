'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, CAMP_STATUS_META, ROLES } from '@/lib/finlit/api';
import { Plus, Search, Tent, MapPin, Calendar } from 'lucide-react';
import CreateCampDialog from './CreateCampDialog';

export default function CampsView({ user, onOpenCamp }) {
  const [camps, setCamps] = useState([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refs, setRefs] = useState({ villages: [], branches: [], districts: [], teams: [] });
  const [openCreate, setOpenCreate] = useState(false);

  const load = () => api('/camps').then(setCamps).catch(() => {});

  useEffect(() => {
    load();
    Promise.all([api('/villages'), api('/branches'), api('/districts'), api('/teams')])
      .then(([villages, branches, districts, teams]) => setRefs({ villages, branches, districts, teams }))
      .catch(() => {});
  }, []);

  const canCreate = [ROLES.SUPER_ADMIN, ROLES.PROGRAM_MANAGER, ROLES.DISTRICT_COORDINATOR].includes(user.role);

  const enriched = useMemo(() => camps.map(c => ({
    ...c,
    village: refs.villages.find(v => v.id === c.villageId)?.name || '—',
    branch: refs.branches.find(b => b.id === c.branchId)?.name || '—',
    district: refs.districts.find(d => d.id === c.districtId)?.name || '—',
    team: refs.teams.find(t => t.id === c.teamId)?.name || '—',
  })), [camps, refs]);

  const filtered = enriched.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (q) {
      const t = q.toLowerCase();
      return c.code?.toLowerCase().includes(t) || c.village?.toLowerCase().includes(t) || c.branch?.toLowerCase().includes(t) || c.district?.toLowerCase().includes(t);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by camp ID, village, branch, district..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(CAMP_STATUS_META).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canCreate && (
          <Button onClick={() => setOpenCreate(true)} className="gap-1"><Plus className="w-4 h-4" />New Camp</Button>
        )}
      </div>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base flex items-center gap-2"><Tent className="w-4 h-4" />Camps ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 && <div className="text-center py-10 text-slate-400">No camps found.</div>}
          {filtered.map(c => (
            <button key={c.id} onClick={() => onOpenCamp(c.id)} className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-primary hover:bg-primary/5 transition">
              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{c.code}</span>
                  <span className="font-medium text-slate-800 truncate">{c.village}</span>
                  <span className="text-xs text-slate-500 truncate">• {c.branch}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.district}</span>
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{c.proposedDate ? new Date(c.proposedDate).toLocaleDateString() : '—'}</span>
                  <Badge variant="outline" className={`${CAMP_STATUS_META[c.status]?.color} border-0`}>{CAMP_STATUS_META[c.status]?.label}</Badge>
                </div>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {openCreate && <CreateCampDialog open={openCreate} onOpenChange={setOpenCreate} refs={refs} onCreated={() => { load(); setOpenCreate(false); }} />}
    </div>
  );
}
