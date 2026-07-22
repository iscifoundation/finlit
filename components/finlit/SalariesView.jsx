'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, inr } from '@/lib/finlit/api';
import { Wallet, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function SalariesView() {
  const [teams, setTeams] = useState([]);
  const [payments, setPayments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ teamMemberId: '', teamId: '', amount: '', date: new Date().toISOString().slice(0, 10), remarks: '' });

  const load = async () => {
    const [t, p, pr] = await Promise.all([api('/teams'), api('/salary-payments'), api('/programs?status=authenticated')]);
    setTeams(t); setPayments(p); setPrograms(pr);
  };
  useEffect(() => { load(); }, []);

  // Compute earnings & remaining per member
  const stats = useMemo(() => {
    const s = {};
    for (const t of teams) {
      for (const m of (t.members || [])) {
        // Count authenticated programs by this team member
        const days = programs.filter(p => p.teamId === t.id).length;
        const earned = days * (+m.dailySalary || 0);
        const paid = payments.filter(pay => pay.teamMemberId === m.id).reduce((sum, pay) => sum + (+pay.amount || 0), 0);
        s[m.id] = { member: m, team: t, days, earned, paid, due: earned - paid };
      }
    }
    return s;
  }, [teams, programs, payments]);

  const addPayment = async () => {
    if (!form.teamMemberId || !form.amount) return toast.error('Fill all fields');
    try {
      await api('/salary-payments', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Payment recorded');
      setDialog(false); setForm({ teamMemberId: '', teamId: '', amount: '', date: new Date().toISOString().slice(0, 10), remarks: '' });
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-900">Team Salaries</div>
          <div className="text-xs text-slate-500">Visible to Admin only</div>
        </div>
        <Button onClick={() => setDialog(true)}><Plus className="w-4 h-4 mr-1" />Record Payment</Button>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3 font-medium text-slate-600">Member</th>
                <th className="text-left p-3 font-medium text-slate-600">Team</th>
                <th className="text-left p-3 font-medium text-slate-600">Contact</th>
                <th className="text-right p-3 font-medium text-slate-600">Daily Salary</th>
                <th className="text-right p-3 font-medium text-slate-600">Days (Auth.)</th>
                <th className="text-right p-3 font-medium text-slate-600">Earned</th>
                <th className="text-right p-3 font-medium text-slate-600">Paid</th>
                <th className="text-right p-3 font-medium text-slate-600">Due</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(stats).map(({ member, team, days, earned, paid, due }) => (
                <tr key={member.id} className="border-t">
                  <td className="p-3 font-medium">{member.name}</td>
                  <td className="p-3 text-slate-600">{team.name}</td>
                  <td className="p-3 text-slate-600">{member.contact || '—'}</td>
                  <td className="p-3 text-right">{inr(member.dailySalary || 0)}</td>
                  <td className="p-3 text-right">{days}</td>
                  <td className="p-3 text-right">{inr(earned)}</td>
                  <td className="p-3 text-right text-emerald-700">{inr(paid)}</td>
                  <td className="p-3 text-right font-medium">{inr(due)}</td>
                </tr>
              ))}
              {Object.keys(stats).length === 0 && <tr><td colSpan="8" className="text-center py-8 text-slate-400">No team members</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardContent className="p-5">
          <div className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><Wallet className="w-4 h-4" />Payment History</div>
          {payments.length === 0 ? <div className="text-slate-400 text-sm">No payments recorded yet.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr><th className="text-left p-2">Date</th><th className="text-left p-2">Member</th><th className="text-right p-2">Amount</th><th className="text-left p-2">Remarks</th></tr>
                </thead>
                <tbody>
                  {payments.map(p => {
                    const m = stats[p.teamMemberId]?.member;
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="p-2">{new Date(p.date).toLocaleDateString('en-IN')}</td>
                        <td className="p-2 font-medium">{m?.name || p.teamMemberId}</td>
                        <td className="p-2 text-right">{inr(p.amount)}</td>
                        <td className="p-2 text-slate-600">{p.remarks || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Salary Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Team Member</Label>
              <Select value={form.teamMemberId} onValueChange={v => { const s = stats[v]; setForm({ ...form, teamMemberId: v, teamId: s?.team?.id }); }}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{Object.values(stats).map(({ member, team, due }) => <SelectItem key={member.id} value={member.id}>{member.name} ({team.name}) — Due: {inr(due)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div><Label>Remarks</Label><Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button><Button onClick={addPayment}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
