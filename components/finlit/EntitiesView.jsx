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
import { Plus, Landmark, Building2, MapPin, Home, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// Add-permissions per entity type (drives edit/delete visibility too)
const CAN_MANAGE = {
  banks: [ROLES.ADMIN],
  regional_offices: [ROLES.ADMIN],
  districts: [ROLES.ADMIN, ROLES.PROGRAM_MANAGER],
  branches: [ROLES.ADMIN, ROLES.PROGRAM_MANAGER],
  villages: [ROLES.ADMIN, ROLES.PROGRAM_MANAGER],
};

const TITLES = {
  banks: 'Bank',
  regional_offices: 'Regional Office',
  districts: 'District',
  branches: 'Branch',
  villages: 'Village',
};

export default function EntitiesView({ user }) {
  const [tab, setTab] = useState('banks');
  const [data, setData] = useState({ banks: [], regional_offices: [], districts: [], branches: [], villages: [] });
  const [dialog, setDialog] = useState(null); // { type: 'bank'|'ro'|..., mode: 'create'|'edit', id? }
  const [form, setForm] = useState({});
  const [confirmDel, setConfirmDel] = useState(null); // { collection, id, label }
  const [busy, setBusy] = useState(false);
  const [bmCreds, setBmCreds] = useState(null);

  const load = async () => {
    const [banks, ros, districts, branches, villages] = await Promise.all([
      api('/banks'), api('/regional_offices'), api('/districts'), api('/branches'), api('/villages'),
    ]);
    setData({ banks, regional_offices: ros, districts, branches, villages });
  };
  useEffect(() => { load(); }, []);

  const isAdmin = user.role === ROLES.ADMIN;
  const canManage = (col) => (CAN_MANAGE[col] || []).includes(user.role);

  // --------- SUBMIT (create OR update) ----------
  const save = async () => {
    if (!dialog) return;
    const { type, mode, id } = dialog;
    // Basic validation per type
    if (type === 'bank') {
      if (!form.name?.trim()) return toast.error('Bank name is required');
    }
    if (type === 'ro') {
      if (!form.name?.trim()) return toast.error('Name is required');
      if (!form.bankId) return toast.error('Select a bank');
    }
    if (type === 'district') {
      if (!form.name?.trim()) return toast.error('District name is required');
      if (!form.roId) return toast.error('Select a regional office');
    }
    if (type === 'branch') {
      if (!form.name?.trim()) return toast.error('Branch name is required');
      if (!form.districtId) return toast.error('Select a district');
      if (mode === 'create' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.branchManagerEmail || '').trim())) return toast.error('Branch Manager email is required (a login will be auto-created)');
    }
    if (type === 'village') {
      if (!form.name?.trim()) return toast.error('Village name is required');
      if (!form.branchId) return toast.error('Select a branch');
    }
    const collection = colFor(type);
    const body = { ...form };
    if ('feePerProgram' in body && body.feePerProgram !== '') body.feePerProgram = +body.feePerProgram;
    if ('programsAllocated' in body && body.programsAllocated !== '') body.programsAllocated = +body.programsAllocated;
    if ('lat' in body && body.lat !== '') body.lat = +body.lat;
    if ('lng' in body && body.lng !== '') body.lng = +body.lng;
    if ('expectedAudience' in body && body.expectedAudience !== '') body.expectedAudience = +body.expectedAudience;
    setBusy(true);
    try {
      if (mode === 'create') {
        const r = await api(`/${collection}`, { method: 'POST', body: JSON.stringify(body) });
        toast.success(`${TITLES[collection]} created`);
        if (type === 'branch' && r?._bmTempPassword) {
          setBmCreds({
            username: body.branchManagerEmail,
            tempPassword: r._bmTempPassword,
            emailed: r._bmEmailed,
            emailError: r._bmEmailError,
            email: body.branchManagerEmail,
          });
        }
      } else {
        // Editing — never send BM auto-create fields
        delete body.branchManagerName; delete body.branchManagerEmail; delete body.branchManagerMobile;
        await api(`/${collection}/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast.success(`${TITLES[collection]} updated`);
      }
      setDialog(null); setForm({}); load();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const openCreate = (type) => { setForm({}); setDialog({ type, mode: 'create' }); };
  const openEdit = (type, item) => {
    const { _id, id, createdAt, updatedAt, ...rest } = item;
    setForm(rest);
    setDialog({ type, mode: 'edit', id });
  };
  const doDelete = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try {
      await api(`/${confirmDel.collection}/${confirmDel.id}`, { method: 'DELETE' });
      toast.success('Deleted');
      setConfirmDel(null); load();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  // Helper lookups for showing FK labels in tables
  const bankOf = (id) => data.banks.find(x => x.id === id)?.name || '—';
  const roOf = (id) => data.regional_offices.find(x => x.id === id)?.name || '—';
  const distOf = (id) => data.districts.find(x => x.id === id)?.name || '—';
  const branchOf = (id) => data.branches.find(x => x.id === id)?.name || '—';

  const rowActions = (collection, type, item) => {
    if (!canManage(collection)) return null;
    return (
      <div className="flex items-center justify-end gap-1">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(type, item)} title="Edit"><Edit className="w-4 h-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setConfirmDel({ collection, id: item.id, label: item.name || item.id })} title="Delete"><Trash2 className="w-4 h-4 text-red-500" /></Button>
      </div>
    );
  };

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
          <Row title="Banks" count={data.banks.length} onAdd={canManage('banks') ? () => openCreate('bank') : null} />
          <Table
            items={data.banks}
            cols={[['name', 'Name'], ['code', 'Code']]}
            actions={item => rowActions('banks', 'bank', item)}
          />
        </TabsContent>

        <TabsContent value="regional_offices" className="space-y-2">
          <Row title="Regional Offices" count={data.regional_offices.length} onAdd={canManage('regional_offices') ? () => openCreate('ro') : null} />
          <Table
            items={data.regional_offices}
            cols={[
              ['name', 'Name'],
              ['bankId', 'Bank', bankOf],
              ['state', 'State'],
              ['address', 'Address'],
              ['programsAllocated', 'Programs Allocated'],
              ['feePerProgram', 'Fee/Program', v => v != null ? inr(v) : '—'],
            ]}
            actions={item => rowActions('regional_offices', 'ro', item)}
          />
        </TabsContent>

        <TabsContent value="districts" className="space-y-2">
          <Row title="Districts" count={data.districts.length} onAdd={canManage('districts') ? () => openCreate('district') : null} />
          <Table
            items={data.districts}
            cols={[
              ['name', 'Name'],
              ['roId', 'Regional Office', roOf],
              ['state', 'State'],
            ]}
            actions={item => rowActions('districts', 'district', item)}
          />
        </TabsContent>

        <TabsContent value="branches" className="space-y-2">
          <Row title="Branches" count={data.branches.length} onAdd={canManage('branches') ? () => openCreate('branch') : null} />
          <Table
            items={data.branches}
            cols={[
              ['name', 'Name'],
              ['code', 'Code'],
              ['districtId', 'District', distOf],
              ['address', 'Address'],
              ['managerName', 'Manager'],
            ]}
            actions={item => rowActions('branches', 'branch', item)}
          />
        </TabsContent>

        <TabsContent value="villages" className="space-y-2">
          <Row title="Villages" count={data.villages.length} onAdd={canManage('villages') ? () => openCreate('village') : null} />
          <Table
            items={data.villages}
            cols={[
              ['name', 'Name'],
              ['branchId', 'Branch', branchOf],
              ['lat', 'Lat'],
              ['lng', 'Lng'],
              ['expectedAudience', 'Expected'],
            ]}
            actions={item => rowActions('villages', 'village', item)}
          />
        </TabsContent>
      </Tabs>

      {/* Create/Edit dialogs */}
      {dialog?.type === 'bank' && (
        <FormDialog
          title={`${dialog.mode === 'edit' ? 'Edit' : 'New'} Bank`}
          submitLabel={dialog.mode === 'edit' ? 'Save' : 'Create'}
          onClose={() => { setDialog(null); setForm({}); }}
          onSubmit={save}
          busy={busy}
        >
          <Field label="Name *" val={form.name} set={v => setForm({ ...form, name: v })} />
          <Field label="Code" val={form.code} set={v => setForm({ ...form, code: v })} />
        </FormDialog>
      )}

      {dialog?.type === 'ro' && (
        <FormDialog
          title={`${dialog.mode === 'edit' ? 'Edit' : 'New'} Regional Office`}
          submitLabel={dialog.mode === 'edit' ? 'Save' : 'Create'}
          onClose={() => { setDialog(null); setForm({}); }}
          onSubmit={save}
          busy={busy}
        >
          <SelectField label="Bank *" val={form.bankId} set={v => setForm({ ...form, bankId: v })} options={data.banks.map(b => ({ value: b.id, label: b.name }))} />
          <Field label="Name *" val={form.name} set={v => setForm({ ...form, name: v })} />
          <Field label="State" val={form.state} set={v => setForm({ ...form, state: v })} />
          <Field label="Address" val={form.address} set={v => setForm({ ...form, address: v })} />
          <Field label="Contact Person" val={form.contactPerson} set={v => setForm({ ...form, contactPerson: v })} />
          <Field label="Contact Number" val={form.contactNumber} set={v => setForm({ ...form, contactNumber: v })} />
          {isAdmin && <Field label="Fee per Program (₹)" type="number" val={form.feePerProgram} set={v => setForm({ ...form, feePerProgram: v })} />}
          <Field label="Programs Allocated (total)" type="number" val={form.programsAllocated} set={v => setForm({ ...form, programsAllocated: v })} />
        </FormDialog>
      )}

      {dialog?.type === 'district' && (
        <FormDialog
          title={`${dialog.mode === 'edit' ? 'Edit' : 'New'} District`}
          submitLabel={dialog.mode === 'edit' ? 'Save' : 'Create'}
          onClose={() => { setDialog(null); setForm({}); }}
          onSubmit={save}
          busy={busy}
        >
          <SelectField label="Regional Office *" val={form.roId} set={v => setForm({ ...form, roId: v })} options={data.regional_offices.map(r => ({ value: r.id, label: r.name }))} />
          <Field label="Name *" val={form.name} set={v => setForm({ ...form, name: v })} />
          <Field label="State" val={form.state} set={v => setForm({ ...form, state: v })} />
        </FormDialog>
      )}

      {dialog?.type === 'branch' && (
        <FormDialog
          title={`${dialog.mode === 'edit' ? 'Edit' : 'New'} Branch`}
          submitLabel={dialog.mode === 'edit' ? 'Save' : 'Create'}
          onClose={() => { setDialog(null); setForm({}); }}
          onSubmit={save}
          busy={busy}
        >
          <SelectField label="District *" val={form.districtId} set={v => setForm({ ...form, districtId: v })} options={data.districts.map(d => ({ value: d.id, label: d.name }))} />
          <Field label="Name *" val={form.name} set={v => setForm({ ...form, name: v })} />
          <Field label="Code" val={form.code} set={v => setForm({ ...form, code: v })} />
          <Field label="Address" val={form.address} set={v => setForm({ ...form, address: v })} />
          {dialog.mode === 'create' ? (
            <div className="pt-2 border-t mt-2">
              <div className="text-xs font-medium text-slate-600 mb-2">Branch Manager (auto-created login)</div>
              <Field label="Manager Name" val={form.branchManagerName} set={v => setForm({ ...form, branchManagerName: v })} />
              <Field label="Manager Email *" type="email" val={form.branchManagerEmail} set={v => setForm({ ...form, branchManagerEmail: v })} />
              <Field label="Manager Mobile (optional)" val={form.branchManagerMobile} set={v => setForm({ ...form, branchManagerMobile: v })} />
            </div>
          ) : (
            <div className="pt-2 border-t mt-2 text-[11px] text-slate-500">
              Current manager: <span className="font-medium text-slate-700">{form.managerName || '—'}</span>
              <span className="text-slate-400"> — to change or reset the manager, use the Users tab.</span>
            </div>
          )}
        </FormDialog>
      )}

      {dialog?.type === 'village' && (
        <FormDialog
          title={`${dialog.mode === 'edit' ? 'Edit' : 'New'} Village`}
          submitLabel={dialog.mode === 'edit' ? 'Save' : 'Create'}
          onClose={() => { setDialog(null); setForm({}); }}
          onSubmit={save}
          busy={busy}
        >
          <SelectField label="Branch *" val={form.branchId} set={v => setForm({ ...form, branchId: v })} options={data.branches.map(b => ({ value: b.id, label: b.name }))} />
          <Field label="Name *" val={form.name} set={v => setForm({ ...form, name: v })} />
          <Field label="Latitude" type="number" val={form.lat} set={v => setForm({ ...form, lat: v })} />
          <Field label="Longitude" type="number" val={form.lng} set={v => setForm({ ...form, lng: v })} />
          <Field label="Expected Audience" type="number" val={form.expectedAudience} set={v => setForm({ ...form, expectedAudience: v })} />
        </FormDialog>
      )}

      {/* Delete confirm */}
      <Dialog open={!!confirmDel} onOpenChange={o => !o && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {confirmDel?.label}?</DialogTitle></DialogHeader>
          <div className="text-sm text-slate-600">
            This action cannot be undone. Records with dependent data (child locations, programs, etc.) will be protected and cannot be deleted until their dependents are removed or reassigned.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>{busy ? 'Deleting...' : 'Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BM credentials post-create */}
      <Dialog open={!!bmCreds} onOpenChange={o => !o && setBmCreds(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Branch Manager credentials</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {bmCreds?.emailed
              ? <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">Credentials emailed to <b>{bmCreds.email}</b>.</div>
              : <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">Email delivery failed{bmCreds?.emailError ? `: ${bmCreds.emailError}` : ''}. Please share these credentials with the Branch Manager manually.</div>}
            <div className="rounded-lg border divide-y">
              <div className="p-3">
                <div className="text-[11px] text-slate-500 uppercase">Username</div>
                <div className="font-mono text-sm">{bmCreds?.username}</div>
              </div>
              <div className="p-3">
                <div className="text-[11px] text-slate-500 uppercase">Temporary password</div>
                <div className="font-mono text-sm">{bmCreds?.tempPassword}</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-500">The Branch Manager will be asked to set a new password on first sign-in.</div>
          </div>
          <DialogFooter><Button onClick={() => setBmCreds(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// dialog.type -> collection name
function colFor(type) {
  return ({ bank: 'banks', ro: 'regional_offices', district: 'districts', branch: 'branches', village: 'villages' })[type];
}

function Row({ title, count, onAdd }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-slate-500">{count} {title.toLowerCase()}</div>
      {onAdd && <Button size="sm" onClick={onAdd}><Plus className="w-4 h-4 mr-1" />Add</Button>}
    </div>
  );
}

function Table({ items, cols, actions }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {cols.map(c => <th key={c[0]} className="text-left px-4 py-2 font-medium text-slate-600">{c[1]}</th>)}
                {actions && <th className="text-right px-4 py-2 font-medium text-slate-600 w-24">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-t hover:bg-slate-50">
                  {cols.map(c => <td key={c[0]} className="px-4 py-2">{c[2] ? c[2](it[c[0]]) : (it[c[0]] ?? '—')}</td>)}
                  {actions && <td className="px-4 py-2 text-right">{actions(it)}</td>}
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={cols.length + (actions ? 1 : 0)} className="text-center py-8 text-slate-400">No records</td></tr>}
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
    <Select value={val || ''} onValueChange={set}><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
  </div>;
}

function FormDialog({ title, children, onClose, onSubmit, submitLabel = 'Create', busy }) {
  return <Dialog open onOpenChange={onClose}>
    <DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <div className="space-y-3">{children}</div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onSubmit} disabled={busy}>{busy ? 'Saving...' : submitLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
