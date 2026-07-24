'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ROLES, ROLE_LABELS } from '@/lib/finlit/api';
import { Plus, Trash2, Edit, Users, AlertCircle, KeyRound, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const ROLE_BADGE = {
  admin: 'bg-primary/10 text-primary border-primary/30',
  program_manager: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  branch_manager: 'bg-sky-50 text-sky-700 border-sky-200',
  regional_office: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  team: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function UsersView({ user }) {
  const [users, setUsers] = useState([]);
  const [refs, setRefs] = useState({ branches: [], ros: [], teams: [] });
  const [dialog, setDialog] = useState(null); // 'new' | user.id (for edit)
  const [form, setForm] = useState({ name: '', mobile: '', role: '', email: '', branchId: '', roId: '', teamId: '' });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [query, setQuery] = useState('');

  const isAdmin = user.role === ROLES.ADMIN;
  const isPM = user.role === ROLES.PROGRAM_MANAGER;
  const isDemo = !!user.isDemo;
  const canManage = !isDemo && (isAdmin || isPM);
  const allowedRoles = isAdmin ? Object.keys(ROLE_LABELS) : [ROLES.BRANCH_MANAGER, ROLES.TEAM];

  const load = () => api('/users').then(setUsers).catch(e => toast.error(e.message));
  useEffect(() => {
    load();
    Promise.all([api('/branches'), api('/regional_offices'), api('/teams')])
      .then(([b, r, t]) => setRefs({ branches: b, ros: r, teams: t }));
  }, []);

  const filtered = useMemo(() => users.filter(u => !query || [u.name, u.mobile, ROLE_LABELS[u.role]].some(x => (x || '').toLowerCase().includes(query.toLowerCase()))), [users, query]);

  const openNew = () => { setForm({ name: '', mobile: '', role: '', email: '', branchId: '', roId: '', teamId: '' }); setDialog('new'); };
  const openEdit = (u) => { setForm({ name: u.name || '', mobile: u.mobile || '', role: u.role || '', email: u.email || '', branchId: u.branchId || '', roId: u.roId || '', teamId: u.teamId || '' }); setDialog(u.id); };

  const [credsInfo, setCredsInfo] = useState(null); // { email, username, tempPassword, emailed, emailError, title }

  const submit = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (!form.role) return toast.error('Select a role');
    const emailNorm = (form.email || '').toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return toast.error('A valid email is required — credentials will be emailed here');
    const mobileNorm = (form.mobile || '').replace(/\D/g, '');
    if (mobileNorm && !/^\d{10}$/.test(mobileNorm)) return toast.error('Mobile must be 10 digits (or leave blank)');
    const payload = { name: form.name.trim(), mobile: mobileNorm || null, role: form.role, email: emailNorm };
    if (form.role === ROLES.BRANCH_MANAGER && form.branchId) payload.branchId = form.branchId;
    if (form.role === ROLES.REGIONAL_OFFICE && form.roId) payload.roId = form.roId;
    if (form.role === ROLES.TEAM && form.teamId) payload.teamId = form.teamId;
    setBusy(true);
    try {
      if (dialog === 'new') {
        const r = await api('/users', { method: 'POST', body: JSON.stringify(payload) });
        toast.success('User created');
        setDialog(null); load();
        // Show generated credentials so admin can copy/share if email failed
        if (r?._tempPassword) {
          setCredsInfo({
            title: 'User created',
            username: r.username || r.email,
            email: r.email,
            tempPassword: r._tempPassword,
            emailed: r._emailed,
            emailError: r._emailError,
          });
        }
      } else {
        const upd = { ...payload }; delete upd.mobile; // mobile is not editable
        if (!isAdmin) delete upd.role; // PM can't change role
        await api(`/users/${dialog}`, { method: 'PATCH', body: JSON.stringify(upd) });
        toast.success('User updated');
        setDialog(null); load();
      }
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const resetPassword = async (u) => {
    try {
      const r = await api(`/auth/reset-password/${u.id}`, { method: 'POST' });
      setCredsInfo({
        title: `Password reset for ${u.name}`,
        username: u.username || u.email,
        email: u.email,
        tempPassword: r.tempPassword,
        emailed: r.emailed,
        emailError: r.emailError,
      });
      toast.success('Password reset');
    } catch (e) { toast.error(e.message); }
  };

  const del = async () => {
    if (!confirmDel) return;
    try {
      await api(`/users/${confirmDel.id}`, { method: 'DELETE' });
      toast.success('User removed');
      setConfirmDel(null); load();
    } catch (e) { toast.error(e.message); setConfirmDel(null); }
  };

  return (
    <div className="space-y-4">
      {isDemo && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5" />
          <div className="text-sm text-amber-900">
            <b>Demo mode</b> — you are logged in as a demo user. Adding, editing or removing users is disabled. Sign in with your real Admin account to manage users.
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-2">
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, mobile or role..." className="h-10 flex-1" />
        {canManage && <Button onClick={openNew} className="h-10"><Plus className="w-4 h-4 mr-1" />Add User</Button>}
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3 font-medium text-slate-600">Name</th>
                <th className="text-left p-3 font-medium text-slate-600">Mobile</th>
                <th className="text-left p-3 font-medium text-slate-600">Role</th>
                <th className="text-left p-3 font-medium text-slate-600">Assigned</th>
                <th className="text-right p-3 font-medium text-slate-600 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const branch = refs.branches.find(b => b.id === u.branchId)?.name;
                const ro = refs.ros.find(r => r.id === u.roId)?.name;
                const team = refs.teams.find(t => t.id === u.teamId)?.name;
                const canEdit = canManage && !u.isDemo && (isAdmin || [ROLES.BRANCH_MANAGER, ROLES.TEAM].includes(u.role));
                const canDelete = canEdit && u.id !== user.id;
                return (
                  <tr key={u.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{u.name}</div>
                      {u.email && <div className="text-xs text-slate-500">{u.email}</div>}
                    </td>
                    <td className="p-3 font-mono text-xs">{u.mobile ? `+91 ${u.mobile}` : <span className="text-slate-400">—</span>}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={`${ROLE_BADGE[u.role] || ''} font-normal`}>{ROLE_LABELS[u.role]}</Badge>
                      {u.isDemo && <Badge variant="outline" className="ml-1 bg-slate-100 text-slate-600 border-slate-300 font-normal text-[10px]">Demo</Badge>}
                    </td>
                    <td className="p-3 text-slate-600 text-xs">{branch || ro || team || '—'}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {canEdit && <Button size="icon" variant="ghost" onClick={() => resetPassword(u)} className="h-8 w-8" title="Reset password"><KeyRound className="w-4 h-4 text-amber-600" /></Button>}
                      {canEdit && <Button size="icon" variant="ghost" onClick={() => openEdit(u)} className="h-8 w-8"><Edit className="w-4 h-4" /></Button>}
                      {canDelete && <Button size="icon" variant="ghost" onClick={() => setConfirmDel(u)} className="h-8 w-8"><Trash2 className="w-4 h-4 text-red-500" /></Button>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400 text-sm">No users match.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {isPM && !isDemo && (
        <div className="text-xs text-slate-500 flex items-start gap-2">
          <Users className="w-3.5 h-3.5 mt-0.5" />
          As Program Manager, you can add/edit/remove <b>Branch Managers</b> and <b>Team members</b> only. Contact Admin for other roles.
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog === 'new' ? 'Add User' : 'Edit User'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <Label>Email <span className="text-red-500">*</span></Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
              <div className="text-[11px] text-slate-400 mt-1">Users sign in with a magic link sent to this email.</div>
            </div>
            <div>
              <Label>Mobile <span className="text-slate-400 text-xs">(optional)</span></Label>
              <div className="flex">
                <div className="px-3 flex items-center border border-r-0 rounded-l-md bg-slate-50 text-sm text-slate-500">+91</div>
                <Input className="rounded-l-none" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10-digit mobile" disabled={dialog !== 'new'} />
              </div>
              {dialog !== 'new' && <div className="text-[11px] text-slate-400 mt-1">Mobile cannot be changed after creation</div>}
            </div>
            <div>
              <Label>Role <span className="text-red-500">*</span></Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v, branchId: '', roId: '', teamId: '' })} disabled={dialog !== 'new' && !isAdmin}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>{allowedRoles.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.role === ROLES.BRANCH_MANAGER && (
              <div>
                <Label>Assign to Branch</Label>
                <Select value={form.branchId} onValueChange={v => setForm({ ...form, branchId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>{refs.branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.role === ROLES.REGIONAL_OFFICE && (
              <div>
                <Label>Assign to Regional Office</Label>
                <Select value={form.roId} onValueChange={v => setForm({ ...form, roId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select RO" /></SelectTrigger>
                  <SelectContent>{refs.ros.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.role === ROLES.TEAM && (
              <div>
                <Label>Assign to Team (optional)</Label>
                <Select value={form.teamId} onValueChange={v => setForm({ ...form, teamId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                  <SelectContent>{refs.teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Saving...' : (dialog === 'new' ? 'Create User' : 'Save Changes')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDel} onOpenChange={o => !o && setConfirmDel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove user?</DialogTitle></DialogHeader>
          <div className="text-sm text-slate-600">
            Remove <b>{confirmDel?.name}</b>{confirmDel?.mobile ? ` (+91 ${confirmDel.mobile})` : confirmDel?.email ? ` (${confirmDel.email})` : ''}? Their sessions will be terminated. This cannot be undone.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={del}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!credsInfo} onOpenChange={o => !o && setCredsInfo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{credsInfo?.title || 'Credentials'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {credsInfo?.emailed ? (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5" /><div>Credentials emailed to <b>{credsInfo.email}</b>.</div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <div>Email delivery failed{credsInfo?.emailError ? `: ${credsInfo.emailError}` : ''}. Please share these credentials with the user manually.</div>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 divide-y">
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">Username</div>
                  <div className="font-mono text-sm">{credsInfo?.username}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard?.writeText(credsInfo?.username || ''); toast.success('Copied'); }}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">Temporary password</div>
                  <div className="font-mono text-sm">{credsInfo?.tempPassword}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard?.writeText(credsInfo?.tempPassword || ''); toast.success('Copied'); }}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="text-[11px] text-slate-500">The user will be asked to set a new password on their next sign-in.</div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCredsInfo(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
