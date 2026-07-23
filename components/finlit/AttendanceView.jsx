'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ROLES } from '@/lib/finlit/api';
import { UserCheck, UserX, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function AttendanceView({ user }) {
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [records, setRecords] = useState({}); // { memberId: 'present'|'absent' }
  const [history, setHistory] = useState([]);

  useEffect(() => { api('/teams').then(t => { setTeams(t); if (t.length) setTeamId(t[0].id); }); }, []);
  useEffect(() => { if (teamId) api(`/attendance?teamId=${teamId}`).then(setHistory); }, [teamId, date]);

  const team = teams.find(t => t.id === teamId);
  const canMark = [ROLES.ADMIN, ROLES.PROGRAM_MANAGER, ROLES.TEAM].includes(user.role);

  const existing = history.find(h => new Date(h.date).toISOString().slice(0, 10) === date);
  useEffect(() => {
    const map = {};
    if (existing) { for (const r of (existing.records || [])) map[r.memberId] = r.status; }
    setRecords(map);
  }, [existing?.id, teamId, date]);

  const save = async () => {
    if (!teamId) return toast.error('Select team');
    const recs = (team?.members || []).map(m => ({ memberId: m.id, status: records[m.id] || 'absent' }));
    try { await api('/attendance', { method: 'POST', body: JSON.stringify({ teamId, date, records: recs }) }); toast.success('Attendance saved'); api(`/attendance?teamId=${teamId}`).then(setHistory); }
    catch (e) { toast.error(e.message); }
  };

  // Aggregate
  const summary = useMemo(() => {
    const s = {};
    for (const h of history) for (const r of (h.records || [])) {
      s[r.memberId] = s[r.memberId] || { present: 0, absent: 0 };
      s[r.memberId][r.status] = (s[r.memberId][r.status] || 0) + 1;
    }
    return s;
  }, [history]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-end">
        <div className="flex-1"><Label>Team</Label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        {canMark && <Button onClick={save}><Save className="w-4 h-4 mr-1" />Save Attendance</Button>}
      </div>

      <Card className="border-slate-200"><CardContent className="p-5">
        <div className="font-semibold mb-3">Mark Attendance — {new Date(date).toLocaleDateString('en-IN')}</div>
        <div className="space-y-2">
          {(team?.members || []).map(m => (
            <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
              <div className="flex-1">
                <div className="text-sm font-medium">{m.name} {m.isTeamManager && <Badge variant="outline" className="ml-1 bg-primary/10 text-primary border-primary/30 font-normal text-[10px]">Team Manager</Badge>}</div>
                <div className="text-xs text-slate-500">{m.contact || '—'}</div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant={records[m.id] === 'present' ? 'default' : 'outline'} onClick={() => canMark && setRecords({ ...records, [m.id]: 'present' })}><UserCheck className="w-4 h-4 mr-1" />Present</Button>
                <Button size="sm" variant={records[m.id] === 'absent' ? 'destructive' : 'outline'} onClick={() => canMark && setRecords({ ...records, [m.id]: 'absent' })}><UserX className="w-4 h-4 mr-1" />Absent</Button>
              </div>
            </div>
          ))}
          {!(team?.members || []).length && <div className="text-sm text-slate-400 text-center py-6">No members in this team</div>}
        </div>
      </CardContent></Card>

      <Card className="border-slate-200"><CardContent className="p-5">
        <div className="font-semibold mb-3">Attendance Summary (this team)</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50"><tr><th className="text-left p-2">Member</th><th className="text-right p-2">Present days</th><th className="text-right p-2">Absent days</th></tr></thead>
          <tbody>
            {(team?.members || []).map(m => (
              <tr key={m.id} className="border-t">
                <td className="p-2">{m.name}</td>
                <td className="p-2 text-right text-emerald-700">{summary[m.id]?.present || 0}</td>
                <td className="p-2 text-right text-red-600">{summary[m.id]?.absent || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
