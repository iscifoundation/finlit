'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ROLES } from '@/lib/finlit/api';
import { downloadROReportPdf } from './pdf';
import { downloadROReportExcel } from './excel';
import { Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportsView({ user }) {
  const [ros, setRos] = useState([]);
  const [roId, setRoId] = useState(user.roId || '');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/regional_offices').then(rs => { setRos(rs); if (rs.length && !roId) setRoId(rs[0].id); });
  }, []);

  // mode: 'summary' | 'full' | 'excel'
  const download = async (mode) => {
    if (!roId) return toast.error('Select a Regional Office');
    setBusy(true);
    try {
      const [progs, districts, branches, villages, banks, allRos] = await Promise.all([
        api('/programs?status=authenticated'), api('/districts'), api('/branches'), api('/villages'), api('/banks'), api('/regional_offices'),
      ]);
      let filtered = progs.filter(p => p.roId === roId);
      if (fromDate) filtered = filtered.filter(p => new Date(p.proposedDate) >= new Date(fromDate));
      if (toDate) filtered = filtered.filter(p => new Date(p.proposedDate) <= new Date(toDate + 'T23:59:59'));
      if (filtered.length === 0) { toast.error('No authenticated programs in selected range'); setBusy(false); return; }
      const roMeta = allRos.find(r => r.id === roId);
      const bank = banks.find(b => b.id === roMeta?.bankId);
      const refs = { ro: roMeta, bank, districts, branches, villages };
      if (mode === 'excel') {
        downloadROReportExcel(filtered, refs);
      } else {
        downloadROReportPdf(filtered, refs, { includePhotos: mode === 'full' });
      }
      toast.success(`Downloaded report with ${filtered.length} program(s)`);
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const canPickRO = [ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role);

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="border-slate-200"><CardContent className="p-5 space-y-4">
        <div>
          <div className="text-lg font-semibold">Consolidated Report</div>
          <div className="text-sm text-slate-500">Download a combined report of all authenticated programs, either as a total or for a specific date range.</div>
        </div>
        {canPickRO && (
          <div><Label>Regional Office</Label>
            <Select value={roId} onValueChange={setRoId}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ros.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><Label>From date (optional)</Label><Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div>
          <div><Label>To date (optional)</Label><Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></div>
        </div>
        <div className="text-xs text-slate-500">Leave dates blank to include all authenticated programs. Dates are based on each program's proposed date.</div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => download('summary')} disabled={busy}><Download className="w-4 h-4 mr-1" />Summary PDF</Button>
          <Button onClick={() => download('full')} disabled={busy}><Download className="w-4 h-4 mr-1" />Full PDF (with A6 photos)</Button>
          <Button variant="outline" onClick={() => download('excel')} disabled={busy}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
        </div>
      </CardContent></Card>
    </div>
  );
}
