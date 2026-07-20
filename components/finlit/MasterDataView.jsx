'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ROLE_LABELS } from '@/lib/finlit/api';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

const CONFIG = {
  banks: { label: 'Banks', collection: 'banks', columns: [['name', 'Name'], ['code', 'Code']], fields: [['name', 'Name'], ['code', 'Code']] },
  projects: { label: 'Projects', collection: 'projects', columns: [['name', 'Name'], ['description', 'Description']], fields: [['name', 'Name'], ['description', 'Description'], ['bankId', 'Bank', 'ref:banks']] },
  districts: { label: 'Districts', collection: 'districts', columns: [['name', 'Name'], ['state', 'State']], fields: [['name', 'Name'], ['state', 'State'], ['bankId', 'Bank', 'ref:banks']] },
  branches: { label: 'Branches', collection: 'branches', columns: [['name', 'Name'], ['code', 'Code'], ['address', 'Address']], fields: [['name', 'Name'], ['code', 'Code'], ['address', 'Address'], ['bankId', 'Bank', 'ref:banks'], ['districtId', 'District', 'ref:districts']] },
  villages: { label: 'Villages', collection: 'villages', columns: [['name', 'Name'], ['panchayat', 'Panchayat'], ['lat', 'Lat'], ['lng', 'Lng']], fields: [['name', 'Name'], ['panchayat', 'Panchayat'], ['districtId', 'District', 'ref:districts'], ['lat', 'Latitude', 'number'], ['lng', 'Longitude', 'number'], ['expectedAudience', 'Expected Audience', 'number']] },
  teams: { label: 'Teams', collection: 'teams', columns: [['name', 'Name']], fields: [['name', 'Name'], ['districtId', 'District', 'ref:districts']] },
  vehicles: { label: 'Vehicles', collection: 'vehicles', columns: [['regNumber', 'Reg. Number'], ['model', 'Model']], fields: [['regNumber', 'Reg. Number'], ['model', 'Model'], ['teamId', 'Team', 'ref:teams']] },
  users: { label: 'Users', collection: 'users', columns: [['name', 'Name'], ['mobile', 'Mobile'], ['role', 'Role', 'role'], ['email', 'Email']], fields: [['name', 'Name'], ['mobile', 'Mobile'], ['email', 'Email'], ['role', 'Role', 'role']] },
};

export default function MasterDataView({ resource, user }) {
  const cfg = CONFIG[resource];
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [refs, setRefs] = useState({});

  const load = () => api(`/${cfg.collection}`).then(setItems);
  useEffect(() => {
    load();
    const refKeys = cfg.fields.filter(f => f[2]?.startsWith?.('ref:')).map(f => f[2].split(':')[1]);
    Promise.all(refKeys.map(k => api(`/${k}`))).then(results => {
      const map = {};
      refKeys.forEach((k, i) => { map[k] = results[i]; });
      setRefs(map);
    });
  }, [resource]);

  const submit = async () => {
    try {
      await api(`/${cfg.collection}`, { method: 'POST', body: JSON.stringify(form) });
      toast.success(`${cfg.label.slice(0, -1)} created`);
      setOpen(false); setForm({}); load();
    } catch (e) { toast.error(e.message); }
  };

  const renderVal = (item, col) => {
    const [k, , type] = col;
    const v = item[k];
    if (type === 'role') return ROLE_LABELS[v] || v;
    return v ?? '—';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-slate-500 text-sm">{items.length} {cfg.label.toLowerCase()}</div>
        <Button onClick={() => { setForm({}); setOpen(true); }} className="gap-1"><Plus className="w-4 h-4" />Add {cfg.label.slice(0, -1)}</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>{cfg.columns.map(c => <th key={c[0]} className="text-left px-4 py-2 font-medium text-slate-600">{c[1]}</th>)}</tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} className="border-t hover:bg-slate-50">
                    {cfg.columns.map(c => <td key={c[0]} className="px-4 py-2">{renderVal(it, c)}</td>)}
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={cfg.columns.length} className="text-center py-8 text-slate-400">No records</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add {cfg.label.slice(0, -1)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {cfg.fields.map(([k, label, type]) => {
              if (type?.startsWith?.('ref:')) {
                const list = refs[type.split(':')[1]] || [];
                return (
                  <div key={k}>
                    <Label>{label}</Label>
                    <Select value={form[k] || ''} onValueChange={v => setForm({ ...form, [k]: v })}>
                      <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                      <SelectContent>{list.map(o => <SelectItem key={o.id} value={o.id}>{o.name || o.code || o.id}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                );
              }
              if (type === 'role') {
                return (
                  <div key={k}>
                    <Label>{label}</Label>
                    <Select value={form[k] || ''} onValueChange={v => setForm({ ...form, [k]: v })}>
                      <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                      <SelectContent>{Object.entries(ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                );
              }
              return (
                <div key={k}>
                  <Label>{label}</Label>
                  <Input type={type === 'number' ? 'number' : 'text'} value={form[k] || ''} onChange={e => setForm({ ...form, [k]: type === 'number' ? +e.target.value : e.target.value })} />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
