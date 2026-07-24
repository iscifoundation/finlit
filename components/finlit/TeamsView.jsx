'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, ROLES, inr } from '@/lib/finlit/api';
import { Plus, Users, UserPlus, X, Star, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default function TeamsView({ user }) {
  const [teams, setTeams] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [newTeam, setNewTeam] = useState({
    name: '',
    leaderName: '', leaderEmail: '', leaderMobile: '', leaderDailySalary: '',
    members: [{ name: '', contact: '', dailySalary: '' }],
  });
  const [addMember, setAddMember] = useState({ teamId: '', name: '', contact: '', dailySalary: '' });
  const [busy, setBusy] = useState(false);
  const [leaderCreds, setLeaderCreds] = useState(null);

  const load = () => api('/teams').then(setTeams);
  useEffect(() => { load(); }, []);
  const canEdit = [ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role);
  const showSalary = user.role === ROLES.ADMIN;

  const createTeam = async () => {
    if (!newTeam.name.trim()) return toast.error('Team name required');
    if (!newTeam.leaderName.trim()) return toast.error('Team Leader name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((newTeam.leaderEmail || '').trim())) return toast.error('Team Leader email is required (used to create their login)');
    setBusy(true);
    try {
      const r = await api('/teams', { method: 'POST', body: JSON.stringify({
        name: newTeam.name.trim(),
        leaderName: newTeam.leaderName.trim(),
        leaderEmail: newTeam.leaderEmail.trim(),
        leaderMobile: newTeam.leaderMobile.trim(),
        leaderDailySalary: +newTeam.leaderDailySalary || 0,
        members: newTeam.members.filter(m => m.name).map(m => ({ id: crypto.randomUUID(), name: m.name, contact: m.contact, dailySalary: +m.dailySalary || 0 })),
      }) });
      toast.success('Team created');
      setDialog(null);
      setNewTeam({ name: '', leaderName: '', leaderEmail: '', leaderMobile: '', leaderDailySalary: '', members: [{ name: '', contact: '', dailySalary: '' }] });
      load();
      if (r?._leaderTempPassword) {
        setLeaderCreds({
          username: r.leaderEmail,
          email: r.leaderEmail,
          tempPassword: r._leaderTempPassword,
          emailed: r._leaderEmailed,
          emailError: r._leaderEmailError,
        });
      }
    } catch (e) { toast.error(e.message); }
    setBusy(false);
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><Users className="w-4 h-4 text-slate-500" /><div className="font-semibold truncate">{t.name}</div></div>
                  {t.leaderName && (
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-500">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      <span>Leader:</span>
                      <span className="font-medium text-slate-700">{t.leaderName}</span>
                      {t.leaderEmail && <span className="text-slate-400 truncate">• {t.leaderEmail}</span>}
                    </div>
                  )}
                </div>
                {canEdit && <Button size="sm" variant="ghost" onClick={() => { setAddMember({ teamId: t.id, name: '', contact: '', dailySalary: '' }); setDialog('member'); }}><UserPlus className="w-4 h-4" /></Button>}
              </div>
              <div className="space-y-2">
                {(t.members || []).map(m => {
                  const isLeader = m.userId && m.userId === t.leaderId;
                  return (
                  <div key={m.id} className={`flex items-center gap-2 p-2 rounded-lg ${isLeader ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                    <div className="flex-1">
                      <div className="text-sm font-medium flex items-center gap-1">
                        {m.name}
                        {isLeader && <Star className="w-3 h-3 text-amber-500 fill-amber-500" title="Team Leader" />}
                      </div>
                      <div className="text-xs text-slate-500">{m.contact || '—'}</div>
                    </div>
                    {showSalary && m.dailySalary !== undefined && (
                      <div className="text-xs text-right">
                        <div className="text-slate-500">Daily</div>
                        <div className="font-medium">{inr(m.dailySalary)}</div>
                      </div>
                    )}
                    {canEdit && !isLeader && <Button size="icon" variant="ghost" onClick={() => removeMember(t.id, m.id)}><X className="w-4 h-4" /></Button>}
                  </div>
                );})}
                {(t.members || []).length === 0 && <div className="text-xs text-slate-400">No members yet</div>}
              </div>
            </CardContent>
          </Card>
        ))}
        {teams.length === 0 && <div className="text-slate-400 text-sm">No teams yet.</div>}
      </div>

      <Dialog open={dialog === 'new'} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Team</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <div>
              <Label>Team name <span className="text-red-500">*</span></Label>
              <Input value={newTeam.name} onChange={e => setNewTeam({ ...newTeam, name: e.target.value })} placeholder="e.g. Alpha Field Team" />
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                Team Leader (login will be auto-created)
              </div>
              <div>
                <Label className="text-xs">Leader name <span className="text-red-500">*</span></Label>
                <Input value={newTeam.leaderName} onChange={e => setNewTeam({ ...newTeam, leaderName: e.target.value })} placeholder="Full name" />
              </div>
              <div>
                <Label className="text-xs">Leader email <span className="text-red-500">*</span></Label>
                <Input type="email" value={newTeam.leaderEmail} onChange={e => setNewTeam({ ...newTeam, leaderEmail: e.target.value })} placeholder="leader@example.com" />
                <div className="text-[10px] text-slate-500 mt-1">Credentials will be emailed to this address. Also becomes their login username.</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Leader mobile (optional)</Label>
                  <Input value={newTeam.leaderMobile} onChange={e => setNewTeam({ ...newTeam, leaderMobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10-digit" />
                </div>
                {user.role === ROLES.ADMIN && (
                  <div>
                    <Label className="text-xs">Leader daily salary (₹)</Label>
                    <Input type="number" value={newTeam.leaderDailySalary} onChange={e => setNewTeam({ ...newTeam, leaderDailySalary: e.target.value })} />
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label>Additional members (optional)</Label>
              <div className="text-[11px] text-slate-500 mb-2">The leader is automatically added as a member. Add other field-team members below.</div>
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
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={createTeam} disabled={busy}>{busy ? 'Creating...' : 'Create'}</Button></DialogFooter>
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

      <Dialog open={!!leaderCreds} onOpenChange={o => !o && setLeaderCreds(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Team Leader credentials</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {leaderCreds?.emailed
              ? <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">Credentials emailed to <b>{leaderCreds.email}</b>.</div>
              : <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">Email delivery failed{leaderCreds?.emailError ? `: ${leaderCreds.emailError}` : ''}. Please share these credentials with the Team Leader manually.</div>}
            <div className="rounded-lg border divide-y">
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500 uppercase">Username</div>
                  <div className="font-mono text-sm">{leaderCreds?.username}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard?.writeText(leaderCreds?.username || ''); toast.success('Copied'); }}><Copy className="w-4 h-4" /></Button>
              </div>
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500 uppercase">Temporary password</div>
                  <div className="font-mono text-sm">{leaderCreds?.tempPassword}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard?.writeText(leaderCreds?.tempPassword || ''); toast.success('Copied'); }}><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="text-[11px] text-slate-500">The Team Leader will be asked to set a new password on first sign-in.</div>
          </div>
          <DialogFooter><Button onClick={() => setLeaderCreds(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
