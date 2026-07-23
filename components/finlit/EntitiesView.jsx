'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, inr, ROLES } from '@/lib/finlit/api';
import { Plus, Landmark, Building2, MapPin, Home } from 'lucide-react';
import { toast } from 'sonner';

export default function EntitiesView({ user }) {
  const [tab, setTab] = useState('banks');
  const [data, setData] = useState({ banks: [], regional_offices: [], districts: [], branches: [], villages: [] });
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    const [banks, ros, districts, branches, villages] = await Promise.all([
      api('/banks'), api('/regional_offices'), api('/districts'), api('/branches'), api('/villages'),
    ]);
    setData({ banks, regional_offices: ros, districts, branches, villages });
  };
  useEffect(() => { load(); }, []);

  const isAdmin = user.role === ROLES.ADMIN;

  const create = async (endpoint) => {
    try {
      const body = { ...form };
      if ('feePerProgram' in body) body.feePerProgram = +body.feePerProgram;
      if ('programsAllocated' in body) body.programsAllocated = +body.programsAllocated;
      if ('lat' in body) body.lat = +body.lat;
      if ('lng' in body) body.lng = +body.lng;
      await api(`/${endpoint}`, { method: 'POST', body: JSON.stringify(body) });
      toast.success('Created');
      setDialog(null); setForm({}); load();
    } catch (e) { toast.error(e.message); }
  };

  const T = ({ children, active, onClick }) => (
    <button onClick={onClick} className={`px-3 py-2 text-sm rounded-md transition ${active ? 'bg-primary text-primary-foreground' : 'text-slate-600 hover:bg-slate-100'}`}>{children}</button>
  );

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="banks"><Landmark className="w-4 h-4 mr-1" />Banks</TabsTrigger>
          <TabsTrigger value="regional_offices">Regional Offices</TabsTrigger>
          <TabsTrigger value="districts"><MapPin className="w-4 h-4 mr-1" />Districts</TabsTrigger>
          <TabsTrigger value="branches"><Building2 className="w-4 h-4 mr-1" />Branches</TabsTrigger>
          <TabsTrigger value="villages"><Home className="w-4 h-4 mr-1" />Villages</TabsTrigger>
        </TabsList>

        <TabsContent value="banks" className="space-y-2">
          <Row title="Banks" count={data.banks.length} onAdd={isAdmin ? () => setDialog('bank') : null} />
          <Table items={data.banks} cols={[['name', 'Name'], ['code', 'Code']]} />
        </TabsContent>
        <TabsContent value="regional_offices" className="space-y-2">
          <Row title="Regional Offices" count={data.regional_offices.length} onAdd={isAdmin ? () => setDialog('ro') : null} />
          <Table items={data.regional_offices} cols={[['name', 'Name'], ['state', 'State'], ['address', 'Address'], ['programsAllocated', 'Programs Allocated'], ['feePerProgram', 'Fee/Program', v => inr(v)]]} />
        </TabsContent>
        <TabsContent value="districts" className="space-y-2">
          <Row title="Districts" count={data.districts.length} onAdd={() => setDialog('district')} />
          <Table items={data.districts} cols={[['name', 'Name'], ['state', 'State']]} />
        </TabsContent>
        <TabsContent value="branches" className="space-y-2">
          <Row title="Branches" count={data.branches.length} onAdd={() => setDialog('branch')} />
          <Table items={data.branches} cols={[['name', 'Name'], ['code', 'Code'], ['address', 'Address'], ['managerName', 'Manager']]} />
        </TabsContent>
        <TabsContent value="villages" className="space-y-2">
          <Row title="Villages" count={data.villages.length} onAdd={() => setDialog('village')} />
          <Table items={data.villages} cols={[['name', 'Name'], ['lat', 'Lat'], ['lng', 'Lng'], ['expectedAudience', 'Expected']]} />
        </TabsContent>
      </Tabs>

      {dialog === 'bank' && (
        <FormDialog title="New Bank" onClose={() => { setDialog(null); setForm({}); }} onSubmit={() => create('banks')}>
          <Field label="Name" val={form.name} set={v => setForm({ ...form, name: v })} />
          <Field label="Code" val={form.code} set={v => setForm({ ...form, code: v })} />
        </FormDialog>
      )}
      {dialog === 'ro' && (
        <FormDialog title="New Regional Office" onClose={() => { setDialog(null); setForm({}); }} onSubmit={() => create('regional_offices')}>
          <SelectField label="Bank" val={form.bankId} set={v => setForm({ ...form, bankId: v })} options={data.banks.map(b => ({ value: b.id, label: b.name }))} />
          <Field label="Name" val={form.name} set={v => setForm({ ...form, name: v })} />
          <Field label="State" val={form.state} set={v => setForm({ ...form, state: v })} />
          <Field label="Address" val={form.address} set={v => setForm({ ...form, address: v })} />
          <Field label="Contact Person" val={form.contactPerson} set={v => setForm({ ...form, contactPerson: v })} />
          <Field label="Contact Number" val={form.contactNumber} set={v => setForm({ ...form, contactNumber: v })} />
          {isAdmin && <Field label="Fee per Program (₹)" type="number" val={form.feePerProgram} set={v => setForm({ ...form, feePerProgram: v })} />}
          <Field label="Programs Allocated (total)" type="number" val={form.programsAllocated} set={v => setForm({ ...form, programsAllocated: v })} />
        </FormDialog>
      )}
      {dialog === 'district' && (
        <FormDialog title="New District" onClose={() => { setDialog(null); setForm({}); }} onSubmit={() => create('districts')}>
          <SelectField label="Regional Office" val={form.roId} set={v => setForm({ ...form, roId: v })} options={data.regional_offices.map(r => ({ value: r.id, label: r.name }))} />
          <Field label="Name" val={form.name} set={v => setForm({ ...form, name: v })} />
          <Field label="State" val={form.state} set={v => setForm({ ...form, state: v })} />
        </FormDialog>
      )}
      {dialog === 'branch' && (
        <FormDialog title="New Branch" onClose={() => { setDialog(null); setForm({}); }} onSubmit={() => {
          if (!form.name?.trim()) return toast.error('Branch name is required');
          if (!form.districtId) return toast.error('Select a district');
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.branchManagerEmail || '').trim())) return toast.error('Branch Manager email is required for magic-link login');
          create('branches');
        }}>
          <SelectField label="District *" val={form.districtId} set={v => setForm({ ...form, districtId: v })} options={data.districts.map(d => ({ value: d.id, label: d.name }))} />
          <Field label="Name *" val={form.name} set={v => setForm({ ...form, name: v })} />
          <Field label="Code" val={form.code} set={v => setForm({ ...form, code: v })} />
          <Field label="Address" val={form.address} set={v => setForm({ ...form, address: v })} />
          <div className="pt-2 border-t mt-2">
            <div className="text-xs font-medium text-slate-600 mb-2">Branch Manager (auto-created for magic-link login)</div>
            <Field label="Manager Name" val={form.branchManagerName} set={v => setForm({ ...form, branchManagerName: v })} />
            <Field label="Manager Email *" type="email" val={form.branchManagerEmail} set={v => setForm({ ...form, branchManagerEmail: v })} />
            <Field label="Manager Mobile (optional)" val={form.branchManagerMobile} set={v => setForm({ ...form, branchManagerMobile: v })} />
          </div>
        </FormDialog>
      )}
      {dialog === 'village' && (
        <FormDialog title="New Village" onClose={() => { setDialog(null); setForm({}); }} onSubmit={() => create('villages')}>
          <SelectField label="Branch" val={form.branchId} set={v => setForm({ ...form, branchId: v })} options={data.branches.map(b => ({ value: b.id, label: b.name }))} />
          <Field label="Name" val={form.name} set={v => setForm({ ...form, name: v })} />
          <Field label="Latitude" type="number" val={form.lat} set={v => setForm({ ...form, lat: v })} />
          <Field label="Longitude" type="number" val={form.lng} set={v => setForm({ ...form, lng: v })} />
          <Field label="Expected Audience" type="number" val={form.expectedAudience} set={v => setForm({ ...form, expectedAudience: v })} />
        </FormDialog>
      )}
    </div>
  );
}

function Row({ title, count, onAdd }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-slate-500">{count} {title.toLowerCase()}</div>
      {onAdd && <Button size="sm" onClick={onAdd}><Plus className="w-4 h-4 mr-1" />Add</Button>}
    </div>
  );
}
function Table({ items, cols }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>{cols.map(c => <th key={c[0]} className="text-left px-4 py-2 font-medium text-slate-600">{c[1]}</th>)}</tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-t hover:bg-slate-50">
                  {cols.map(c => <td key={c[0]} className="px-4 py-2">{c[2] ? c[2](it[c[0]]) : (it[c[0]] ?? '—')}</td>)}
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={cols.length} className="text-center py-8 text-slate-400">No records</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
function Field({ label, val, set, type = 'text' }) {
  return <div><Label>{label}</Label><Input type={type} value={val ?? ''} onChange={e => set(e.target.value)} /></div>;
}
function SelectField({ label, val, set, options }) {
  return <div><Label>{label}</Label>
    <Select value={val || ''} onValueChange={set}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
  </div>;
}
function FormDialog({ title, children, onClose, onSubmit }) {
  return <Dialog open onOpenChange={onClose}>
    <DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <div className="space-y-3">{children}</div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit}>Create</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
