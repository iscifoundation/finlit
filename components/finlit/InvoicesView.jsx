'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, inr, amountInWords, ROLES } from '@/lib/finlit/api';
import { downloadInvoicePdf } from './pdf';
import { ArrowLeft, Plus, Download, FileText, ArrowRight, Wallet, Edit, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function InvoicesView({ user, view, setView, currentId, setCurrentId }) {
  const [invoices, setInvoices] = useState([]);
  const [ros, setRos] = useState([]);
  const [banks, setBanks] = useState([]);
  const [genOpen, setGenOpen] = useState(false);

  const load = () => api('/invoices').then(setInvoices);
  useEffect(() => {
    load();
    api('/regional_offices').then(setRos);
    api('/banks').then(setBanks);
  }, []);

  if (view === 'invoice-detail' && currentId) {
    return <InvoiceDetail id={currentId} user={user} banks={banks} ros={ros} onBack={() => { setCurrentId(null); setView('invoices'); load(); }} />;
  }

  const canGen = user.role === ROLES.ADMIN;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{invoices.length} invoices</div>
        {canGen && <Button onClick={() => setGenOpen(true)}><Plus className="w-4 h-4 mr-1" />Generate Invoice</Button>}
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="text-center py-14 text-slate-400 text-sm">No invoices yet</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {invoices.map(inv => {
                const ro = ros.find(r => r.id === inv.roId);
                const paid = inv.paidAmount || 0;
                const status = paid >= inv.total ? { l: 'Paid', c: 'bg-emerald-50 text-emerald-700 border-emerald-200' } : paid > 0 ? { l: 'Partial', c: 'bg-amber-50 text-amber-700 border-amber-200' } : { l: 'Unpaid', c: 'bg-slate-50 text-slate-600 border-slate-200' };
                return (
                  <button key={inv.id} onClick={() => { setCurrentId(inv.id); setView('invoice-detail'); }} className="w-full text-left p-4 hover:bg-slate-50 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{inv.invoiceNumber}</span>
                        <span className="text-sm font-medium">{ro?.name || '—'}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{new Date(inv.date).toLocaleDateString('en-IN')} • {(inv.items || []).length} programs • <b>{inr(inv.total)}</b></div>
                    </div>
                    <Badge variant="outline" className={status.c}>{status.l}</Badge>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {genOpen && <GenerateDialog user={user} ros={ros} onClose={() => setGenOpen(false)} onCreated={() => { setGenOpen(false); load(); }} />}
    </div>
  );
}

function GenerateDialog({ user, ros, onClose, onCreated }) {
  const [roId, setRoId] = useState('');
  const [programs, setPrograms] = useState([]);
  const [selected, setSelected] = useState({});
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (roId) {
      api('/programs?status=authenticated').then(list => setPrograms(list.filter(p => p.roId === roId && !p.invoiceId)));
    } else { setPrograms([]); setSelected({}); }
  }, [roId]);

  const ro = ros.find(r => r.id === roId);
  const selCount = Object.values(selected).filter(Boolean).length;
  const total = selCount * (ro?.feePerProgram || 0);
  const submit = async () => {
    const ids = programs.filter(p => selected[p.id]).map(p => p.id);
    if (!ids.length) return toast.error('Select at least one program');
    setBusy(true);
    try {
      await api('/invoices', { method: 'POST', body: JSON.stringify({ roId, programIds: ids, invoiceNumber, invoiceDate, notes }) });
      toast.success('Invoice generated');
      onCreated();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Generate Invoice</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Regional Office</Label>
            <Select value={roId} onValueChange={setRoId}>
              <SelectTrigger><SelectValue placeholder="Select RO" /></SelectTrigger>
              <SelectContent>{ros.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
            {ro && <div className="text-xs text-slate-500 mt-1">Fee per program: <b>{inr(ro.feePerProgram || 0)}</b></div>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Invoice Number</Label><Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="e.g. ISCI/FLC/202526/FLC01" /></div>
            <div><Label>Invoice Date</Label><Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></div>
          </div>
          {roId && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Authenticated Programs ({programs.length})</Label>
                {programs.length > 0 && <button className="text-xs text-primary" onClick={() => { const all = {}; programs.forEach(p => { all[p.id] = true; }); setSelected(all); }}>Select all</button>}
              </div>
              <div className="border rounded-md max-h-64 overflow-y-auto">
                {programs.length === 0 ? <div className="text-center py-8 text-sm text-slate-400">No un-invoiced authenticated programs.</div> :
                  programs.map(p => (
                    <label key={p.id} className="flex items-center gap-2 p-2 border-b hover:bg-slate-50">
                      <Checkbox checked={!!selected[p.id]} onCheckedChange={c => setSelected({ ...selected, [p.id]: c })} />
                      <div className="flex-1 text-sm">
                        <div>{p.code} • {p.proposedDate ? new Date(p.proposedDate).toLocaleDateString('en-IN') : ''}</div>
                        <div className="text-xs text-slate-500">{p.participants || 0} participants</div>
                      </div>
                    </label>
                  ))}
              </div>
            </div>
          )}
          <div><Label>Notes</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment terms / notes" /></div>
          <div className="p-3 bg-slate-50 rounded-md text-sm">
            <div className="flex justify-between"><span>Selected programs:</span><span>{selCount}</span></div>
            <div className="flex justify-between mt-1"><span>Total (excl. GST):</span><b>{inr(total)}</b></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || selCount === 0}>Generate</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDetail({ id, user, banks, ros, onBack }) {
  const [inv, setInv] = useState(null);
  const [editing, setEditing] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), mode: 'NEFT', ref: '', remarks: '' });

  const load = () => api(`/invoices/${id}`).then(setInv);
  useEffect(() => { load(); }, [id]);
  if (!inv) return <div className="text-slate-400">Loading...</div>;

  const ro = ros.find(r => r.id === inv.roId);
  const bank = banks.find(b => b.id === inv.bankId);
  const canEdit = user.role === ROLES.ADMIN;
  const paid = inv.paidAmount || 0;
  const due = (inv.total || 0) - paid;

  const save = async () => {
    try {
      await api(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify({ items: inv.items, adjustments: +inv.adjustments || 0, notes: inv.notes, billTo: inv.billTo, invoiceNumber: inv.invoiceNumber, date: inv.date }) });
      toast.success('Saved'); setEditing(false); load();
    } catch (e) { toast.error(e.message); }
  };
  const addPayment = async () => {
    try {
      await api(`/invoices/${id}/payment`, { method: 'POST', body: JSON.stringify(pay) });
      toast.success('Payment recorded'); setPayOpen(false); setPay({ amount: '', date: new Date().toISOString().slice(0, 10), mode: 'NEFT', ref: '', remarks: '' }); load();
    } catch (e) { toast.error(e.message); }
  };
  const deleteInv = async () => {
    if (!confirm('Delete this invoice? Attached programs become uninvoiced.')) return;
    try { await api(`/invoices/${id}`, { method: 'DELETE' }); toast.success('Deleted'); onBack(); } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap no-print">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
        <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{inv.invoiceNumber}</span>
        <div className="ml-auto flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(inv, { bank })}><Download className="w-4 h-4 mr-1" />PDF</Button>
          {canEdit && !editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Edit className="w-4 h-4 mr-1" />Edit</Button>}
          {canEdit && editing && <Button size="sm" onClick={save}><Save className="w-4 h-4 mr-1" />Save</Button>}
          {canEdit && <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}><Wallet className="w-4 h-4 mr-1" />Record Payment</Button>}
          {canEdit && <Button size="sm" variant="ghost" onClick={deleteInv}><Trash2 className="w-4 h-4" /></Button>}
        </div>
      </div>

      <Card className="border-slate-200 print-area">
        <CardContent className="p-8">
          {/* Header */}
          <div className="text-center border-b pb-4">
            <div className="text-xl font-bold text-slate-900">ISCI FOUNDATION</div>
            <div className="text-xs text-slate-500 mt-1">B-801, Elexir M.K. City, New Sirol Road, New City Center, Gwalior - 474006</div>
            <div className="text-[10px] text-slate-400 mt-0.5">CIN: U85300MP2019NPL049683 &nbsp;&nbsp; SECTION 8 LICENCE NO: 116329</div>
          </div>

          <div className="flex justify-between mt-4 text-sm">
            <div>
              <div className="font-medium">To,</div>
              {editing ? (
                <Input value={inv.billTo?.title || ''} onChange={e => setInv({ ...inv, billTo: { ...inv.billTo, title: e.target.value } })} />
              ) : <div>{inv.billTo?.title}</div>}
              <div className="font-semibold">{bank?.name}</div>
              {editing ? (
                <Input value={inv.billTo?.address || ''} onChange={e => setInv({ ...inv, billTo: { ...inv.billTo, address: e.target.value } })} className="mt-1" />
              ) : <div className="text-slate-600">{inv.billTo?.address}</div>}
            </div>
            <div className="text-right text-sm">
              <div><b>INV NO:</b> {editing ? <Input className="inline-block w-56" value={inv.invoiceNumber} onChange={e => setInv({ ...inv, invoiceNumber: e.target.value })} /> : inv.invoiceNumber}</div>
              <div className="mt-1"><b>DATE:</b> {editing ? <Input type="date" className="inline-block w-40" value={new Date(inv.date).toISOString().slice(0, 10)} onChange={e => setInv({ ...inv, date: e.target.value })} /> : new Date(inv.date).toLocaleDateString('en-IN')}</div>
            </div>
          </div>

          <div className="mt-5 text-sm text-slate-700">
            <div>Dear Sir,</div>
            <div className="mt-1">This is with reference to the Financial Literacy Camps conducted by ISCI Foundation on your behalf. Please find below the details of the camps completed. As agreed, kindly make required payment against the below activities. The relevant documentation for the said activities has been attached.</div>
          </div>

          <table className="w-full mt-5 border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border p-2 text-left w-12">S.No.</th>
                <th className="border p-2 text-left">Program</th>
                <th className="border p-2 text-left w-28">Date</th>
                <th className="border p-2 text-left">Branch</th>
                <th className="border p-2 text-left">Village</th>
                <th className="border p-2 text-right w-32">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(inv.items || []).map((it, i) => (
                <tr key={it.id}>
                  <td className="border p-2">{i + 1}</td>
                  <td className="border p-2">{it.program}</td>
                  <td className="border p-2">{it.date ? new Date(it.date).toLocaleDateString('en-IN') : ''}</td>
                  <td className="border p-2">{editing ? <Input value={it.branch} onChange={e => { const arr = [...inv.items]; arr[i] = { ...it, branch: e.target.value }; setInv({ ...inv, items: arr }); }} /> : it.branch}</td>
                  <td className="border p-2">{editing ? <Input value={it.village} onChange={e => { const arr = [...inv.items]; arr[i] = { ...it, village: e.target.value }; setInv({ ...inv, items: arr }); }} /> : it.village}</td>
                  <td className="border p-2 text-right">{editing ? <Input type="number" value={it.amount} onChange={e => { const arr = [...inv.items]; arr[i] = { ...it, amount: +e.target.value }; setInv({ ...inv, items: arr, subtotal: arr.reduce((s, x) => s + (+x.amount || 0), 0), total: arr.reduce((s, x) => s + (+x.amount || 0), 0) + (+inv.adjustments || 0) }); }} /> : Number(it.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              <tr>
                <td colSpan="5" className="border p-2 text-right font-semibold">TOTAL</td>
                <td className="border p-2 text-right font-bold">₹ {Number(inv.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-3 text-sm"><b>In Words:</b> {amountInWords(inv.total)} Rupees Only /-</div>

          <div className="mt-6 text-sm border-t pt-4">
            <div className="font-semibold mb-1">Payment Details</div>
            <div>A/c Name: ISCI Foundation</div>
            <div>Bank: Indusind Bank, Branch: City Centre, Gwalior</div>
            <div>IFSC: INDB0000123 &nbsp;&nbsp; A/c No: 259462543217</div>
          </div>

          <div className="mt-8 flex justify-between text-sm">
            <div className="text-slate-500">{inv.notes}</div>
            <div className="text-right">
              <div className="text-slate-500">Raised by,</div>
              <div className="font-semibold text-slate-900">ISCI FOUNDATION</div>
              <div className="my-6 border-b border-slate-300 w-48 mx-auto text-[10px] text-slate-400">Signature / Seal</div>
              <div>Mr. Mohit Modi</div>
              <div className="text-slate-500 text-xs">For ISCI Foundation, Director</div>
            </div>
          </div>

          {/* Payments record */}
          {(inv.payments || []).length > 0 && (
            <div className="mt-8 border-t pt-4 no-print">
              <div className="font-semibold text-sm mb-2">Payments received</div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr><th className="text-left p-2">Date</th><th className="text-left p-2">Amount</th><th className="text-left p-2">Mode</th><th className="text-left p-2">Ref</th><th className="text-left p-2">Remarks</th></tr>
                </thead>
                <tbody>
                  {inv.payments.map(p => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2">{new Date(p.date).toLocaleDateString('en-IN')}</td>
                      <td className="p-2 font-medium">{inr(p.amount)}</td>
                      <td className="p-2">{p.mode || '—'}</td>
                      <td className="p-2">{p.ref || '—'}</td>
                      <td className="p-2">{p.remarks || '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-slate-50 font-semibold"><td className="p-2">Total paid</td><td className="p-2">{inr(paid)}</td><td colSpan="3" className="p-2">Due: <b>{inr(due)}</b></td></tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Amount (₹)</Label><Input type="number" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} /></div>
            <div><Label>Date</Label><Input type="date" value={pay.date} onChange={e => setPay({ ...pay, date: e.target.value })} /></div>
            <div><Label>Mode</Label>
              <Select value={pay.mode} onValueChange={v => setPay({ ...pay, mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Reference / UTR</Label><Input value={pay.ref} onChange={e => setPay({ ...pay, ref: e.target.value })} /></div>
            <div><Label>Remarks</Label><Input value={pay.remarks} onChange={e => setPay({ ...pay, remarks: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button><Button onClick={addPayment}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
