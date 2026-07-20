'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, CAMP_STATUS_META } from '@/lib/finlit/api';
import { FileText, Download } from 'lucide-react';

export default function ReportsView({ onOpenCamp }) {
  const [camps, setCamps] = useState([]);
  const [refs, setRefs] = useState({ villages: [], branches: [], districts: [] });

  useEffect(() => {
    Promise.all([api('/camps'), api('/villages'), api('/branches'), api('/districts')])
      .then(([c, v, b, d]) => { setCamps(c); setRefs({ villages: v, branches: b, districts: d }); });
  }, []);

  const doneCamps = camps.filter(c => ['completed', 'verified', 'in_report', 'closed'].includes(c.status));

  const downloadCsv = () => {
    const rows = [['Camp ID', 'Village', 'Branch', 'District', 'Status', 'Date', 'Beneficiaries', 'Women', 'Photos', 'GPS']];
    for (const c of doneCamps) {
      const v = refs.villages.find(x => x.id === c.villageId)?.name || '';
      const b = refs.branches.find(x => x.id === c.branchId)?.name || '';
      const d = refs.districts.find(x => x.id === c.districtId)?.name || '';
      rows.push([
        c.code, v, b, d, c.status,
        c.completedAt ? new Date(c.completedAt).toISOString().slice(0, 10) : '',
        c.attendance?.total || 0,
        c.attendance?.female || 0,
        (c.photos || []).length,
        c.gpsStart ? `${c.gpsStart.lat},${c.gpsStart.lng}` : '',
      ]);
    }
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `finlit360_report_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => window.print();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-slate-600 text-sm">{doneCamps.length} completed camps</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadCsv}><Download className="w-4 h-4 mr-1" />Download CSV</Button>
          <Button variant="outline" onClick={printReport}><FileText className="w-4 h-4 mr-1" />Print / PDF</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Camp Completion Report</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2">Camp</th>
                  <th className="text-left px-3 py-2">Village</th>
                  <th className="text-left px-3 py-2">Branch</th>
                  <th className="text-left px-3 py-2">District</th>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-right px-3 py-2">Beneficiaries</th>
                  <th className="text-right px-3 py-2">Women</th>
                  <th className="text-right px-3 py-2">Photos</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {doneCamps.map(c => {
                  const v = refs.villages.find(x => x.id === c.villageId)?.name || '—';
                  const b = refs.branches.find(x => x.id === c.branchId)?.name || '—';
                  const d = refs.districts.find(x => x.id === c.districtId)?.name || '—';
                  return (
                    <tr key={c.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => onOpenCamp(c.id)}>
                      <td className="px-3 py-2 font-mono text-xs">{c.code}</td>
                      <td className="px-3 py-2">{v}</td>
                      <td className="px-3 py-2">{b}</td>
                      <td className="px-3 py-2">{d}</td>
                      <td className="px-3 py-2 text-xs">{c.completedAt ? new Date(c.completedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2 text-right">{c.attendance?.total || 0}</td>
                      <td className="px-3 py-2 text-right">{c.attendance?.female || 0}</td>
                      <td className="px-3 py-2 text-right">{(c.photos || []).length}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className={`${CAMP_STATUS_META[c.status]?.color} border-0`}>{CAMP_STATUS_META[c.status]?.label}</Badge></td>
                    </tr>
                  );
                })}
                {doneCamps.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-slate-400">No completed camps yet</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
