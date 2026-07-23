'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, inr, ROLES } from '@/lib/finlit/api';
import { Plus, Wallet, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ExpensesView({ user }) {
  const [list, setList] = useState([]);
  const [teams, setTeams] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), teamId: '', taxi: 0, food: 0, refreshments: 0, stationary: 0, other: 0, remarks: '' });
  const load = () => api('/expenses').then(setList);
  useEffect(() => { load(); api('/teams').then(setTeams); }, []);
  const canAdd = [ROLES.ADMIN, ROLES.PROGRAM_MANAGER, ROLES.TEAM].includes(user.role);
  const canAuth = [ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role);

  const submit = async () => {
    if (!form.teamId) return toast.error('Select a team');
    try { await api('/expenses', { method: 'POST', body: JSON.stringify(form) }); toast.success('Expense logged'); setOpen(false); setForm({ date: new Date().toISOString().slice(0, 10), teamId: '', taxi: 0, food: 0, refreshments: 0, stationary: 0, other: 0, remarks: '' }); load(); }
    catch (e) { toast.error(e.message); }
  };
  const authenticate = async (id) => { try { await api(`/expenses/${id}/authenticate`, { method: 'POST' }); toast.success('Authenticated'); load(); } catch (e) { toast.error(e.message); } };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Daily Expenses</div>
          <div className="text-xs text-slate-500">Log field expenses per day, per team (regardless of number of programs)</div>
        </div>
        {canAdd && <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Log Expense</Button>}
      </div>
      <Card className="border-slate-200"><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50"><tr>
            <th className="text-left p-3">Date</th><th className="text-left p-3">Team</th>
            <th className="text-right p-3">Taxi</th><th className="text-right p-3">Food</th><th className="text-right p-3">Refresh.</th>
            <th className="text-right p-3">Stationery</th><th className="text-right p-3">Other</th><th className="text-right p-3">Total</th>
            <th className="text-left p-3">Status</th>
          </tr></thead>
          <tbody>
            {list.map(e => (
              <tr key={e.id} className="border-t">
                <td className="p-3">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                <td className="p-3">{teams.find(t => t.id === e.teamId)?.name || '—'}</td>
                <td className="p-3 text-right">{inr(e.taxi)}</td>
                <td className="p-3 text-right">{inr(e.food)}</td>
                <td className="p-3 text-right">{inr(e.refreshments)}</td>
                <td className="p-3 text-right">{inr(e.stationary)}</td>
                <td className="p-3 text-right">{inr(e.other)}</td>
                <td className="p-3 text-right font-medium">{inr(e.total)}</td>
                <td className="p-3">{e.authenticatedAt ? <span className="text-emerald-700 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Authenticated</span> : (canAuth ? <Button size="sm" variant="outline" onClick={() => authenticate(e.id)}>Authenticate</Button> : <span className="text-xs text-amber-700">Pending</span>)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="9" className="p-8 text-center text-slate-400">No expenses logged yet.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Log Daily Expense</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div><Label>Team</Label>
            <Select value={form.teamId} onValueChange={v => setForm({ ...form, teamId: v })}>
              <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
              <SelectContent>{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {[['taxi','Taxi/Fuel'],['food','Food'],['refreshments','Refreshments'],['stationary','Stationery'],['other','Other']].map(([k,l]) => (
            <div key={k}><Label>{l} (₹)</Label><Input type="number" value={form[k]} onChange={e => setForm({ ...form, [k]: +e.target.value || 0 })} /></div>
          ))}
          <div className="col-span-2"><Label>Remarks</Label><Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit}>Save</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
