'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, ROLES, inr } from '@/lib/finlit/api';
import { Plus, Users, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

export default function TeamsView({ user }) {
  const [teams, setTeams] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [newTeam, setNewTeam] = useState({ name: '', members: [{ name: '', contact: '', dailySalary: '' }] });
  const [addMember, setAddMember] = useState({ teamId: '', name: '', contact: '', dailySalary: '' });

  const load = () => api('/teams').then(setTeams);
  useEffect(() => { load(); }, []);
  const canEdit = [ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role);
  const showSalary = user.role === ROLES.ADMIN;

  const createTeam = async () => {
    if (!newTeam.name) return toast.error('Team name required');
    try {
      await api('/teams', { method: 'POST', body: JSON.stringify({
        name: newTeam.name,
        members: newTeam.members.filter(m => m.name).map(m => ({ id: crypto.randomUUID(), name: m.name, contact: m.contact, dailySalary: +m.dailySalary || 0 })),
      }) });
      toast.success('Team created'); setDialog(null); setNewTeam({ name: '', members: [{ name: '', contact: '', dailySalary: '' }] }); load();
    } catch (e) { toast.error(e.message); }
  };

  const addTeamMember = async () => {
    const team = teams.find(t => t.id === addMember.teamId);
    if (!team) return;
    const newMember = { id: crypto.randomUUID(), name: addMember.name, contact: addMember.contact, dailySalary: +addMember.dailySalary || 0 };
    try {
      await api(`/teams/${team.id}`, { method: 'PATCH', body: JSON.stringify({ members: [...(team.members || []), newMember] }) });
      toast.success('Member added'); setDialog(null); setAddMember({ teamId: '', name: '', contact: '', dailySalary: '' }); load();
    } catch (e) { toast.error(e.message); }
  };

  const removeMember = async (teamId, memberId) => {
    const team = teams.find(t => t.id === teamId);
    try {
      await api(`/teams/${teamId}`, { method: 'PATCH', body: JSON.stringify({ members: (team.members || []).filter(m => m.id !== memberId) }) });
      toast.success('Member removed'); load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{teams.length} teams</div>
        {canEdit && <Button onClick={() => setDialog('new')}><Plus className="w-4 h-4 mr-1" />New Team</Button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map(t => (
          <Card key={t.id} className="border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><Users className="w-4 h-4 text-slate-500" /><div className="font-semibold">{t.name}</div></div>
                {canEdit && <Button size="sm" variant="ghost" onClick={() => { setAddMember({ teamId: t.id, name: '', contact: '', dailySalary: '' }); setDialog('member'); }}><UserPlus className="w-4 h-4" /></Button>}
              </div>
              <div className="space-y-2">
                {(t.members || []).map(m => (
                  <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-slate-500">{m.contact || '—'}</div>
                    </div>
                    {showSalary && m.dailySalary !== undefined && (
                      <div className="text-xs text-right">
                        <div className="text-slate-500">Daily</div>
                        <div className="font-medium">{inr(m.dailySalary)}</div>
                      </div>
                    )}
                    {canEdit && <Button size="icon" variant="ghost" onClick={() => removeMember(t.id, m.id)}><X className="w-4 h-4" /></Button>}
                  </div>
                ))}
                {(t.members || []).length === 0 && <div className="text-xs text-slate-400">No members yet</div>}
              </div>
            </CardContent>
          </Card>
        ))}
        {teams.length === 0 && <div className="text-slate-400 text-sm">No teams yet.</div>}
      </div>

      <Dialog open={dialog === 'new'} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Team</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Team name</Label><Input value={newTeam.name} onChange={e => setNewTeam({ ...newTeam, name: e.target.value })} /></div>
            <div>
              <Label>Members</Label>
              {newTeam.members.map((m, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 mt-1">
                  <Input placeholder="Name" value={m.name} onChange={e => { const arr = [...newTeam.members]; arr[i].name = e.target.value; setNewTeam({ ...newTeam, members: arr }); }} />
                  <Input placeholder="Contact" value={m.contact} onChange={e => { const arr = [...newTeam.members]; arr[i].contact = e.target.value; setNewTeam({ ...newTeam, members: arr }); }} />
                  {user.role === ROLES.ADMIN ? (
                    <Input placeholder="Salary/day" type="number" value={m.dailySalary} onChange={e => { const arr = [...newTeam.members]; arr[i].dailySalary = e.target.value; setNewTeam({ ...newTeam, members: arr }); }} />
                  ) : <div className="text-xs text-slate-400 self-center">(Admin sets salary)</div>}
                </div>
              ))}
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setNewTeam({ ...newTeam, members: [...newTeam.members, { name: '', contact: '', dailySalary: '' }] })}>Add member</Button>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={createTeam}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'member'} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={addMember.name} onChange={e => setAddMember({ ...addMember, name: e.target.value })} /></div>
            <div><Label>Contact</Label><Input value={addMember.contact} onChange={e => setAddMember({ ...addMember, contact: e.target.value })} /></div>
            {user.role === ROLES.ADMIN && <div><Label>Daily salary (₹)</Label><Input type="number" value={addMember.dailySalary} onChange={e => setAddMember({ ...addMember, dailySalary: e.target.value })} /></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={addTeamMember}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
