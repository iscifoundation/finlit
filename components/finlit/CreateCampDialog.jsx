'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/finlit/api';
import { toast } from 'sonner';

export default function CreateCampDialog({ open, onOpenChange, refs, onCreated }) {
  const [banks, setBanks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({
    bankId: '', projectId: '', districtId: '', branchId: '', villageId: '',
    proposedDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    expectedAudience: 100, remarks: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api('/banks'), api('/projects')]).then(([b, p]) => {
      setBanks(b); setProjects(p);
      setForm(f => ({ ...f, bankId: b[0]?.id || '', projectId: p[0]?.id || '' }));
    });
  }, []);

  const branchesInDistrict = refs.branches.filter(b => !form.districtId || b.districtId === form.districtId);
  const villagesInDistrict = refs.villages.filter(v => !form.districtId || v.districtId === form.districtId);

  const submit = async () => {
    if (!form.bankId || !form.projectId || !form.districtId || !form.branchId || !form.villageId) {
      return toast.error('Please fill all required fields');
    }
    setSaving(true);
    try {
      await api('/camps', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Camp created & sent to branch for confirmation');
      onCreated();
    } catch (e) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create New Camp</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
          <div className="col-span-2">
            <Label>Bank</Label>
            <Select value={form.bankId} onValueChange={v => setForm({ ...form, bankId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Project</Label>
            <Select value={form.projectId} onValueChange={v => setForm({ ...form, projectId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>District</Label>
            <Select value={form.districtId} onValueChange={v => setForm({ ...form, districtId: v, branchId: '', villageId: '' })}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{refs.districts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Branch</Label>
            <Select value={form.branchId} onValueChange={v => setForm({ ...form, branchId: v })}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{branchesInDistrict.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Village</Label>
            <Select value={form.villageId} onValueChange={v => setForm({ ...form, villageId: v })}>
              <SelectTrigger><SelectValue placeholder="Choose village" /></SelectTrigger>
              <SelectContent>{villagesInDistrict.map(v => <SelectItem key={v.id} value={v.id}>{v.name} ({v.panchayat})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Proposed Date</Label>
            <Input type="date" value={form.proposedDate} onChange={e => setForm({ ...form, proposedDate: e.target.value })} />
          </div>
          <div>
            <Label>Expected Audience</Label>
            <Input type="number" value={form.expectedAudience} onChange={e => setForm({ ...form, expectedAudience: +e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Remarks</Label>
            <Textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} placeholder="Optional notes for the branch..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Creating...' : 'Create Camp'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
