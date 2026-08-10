js
'use client';

import * as XLSX from 'xlsx';

// Consolidated Excel export — mirrors the PDF summary table.
// Uses the program's PROPOSED date (not the authentication date).
export function downloadROReportExcel(programs, refs) {
  const rows = programs.map((p, i) => {
    const b = refs.branches?.find(x => x.id === p.branchId)?.name || '';
    const d = refs.districts?.find(x => x.id === p.districtId)?.name || '';
    const v = refs.villages?.find(x => x.id === p.villageId)?.name || '';
    const dateStr = p.proposedDate ? new Date(p.proposedDate).toLocaleDateString('en-IN') : '';
    return {
      'S.No.': i + 1,
      'Code': p.code || '',
      'Date': dateStr,
      'District': d,
      'Branch': b,
      'Village': v,
      'Participants': p.participants || 0,
    };
  });

  const totalBenef = programs.reduce((s, p) => s + (p.participants || 0), 0);

  const headerRows = [
    ['AUTHENTICATED PROGRAMS - CONSOLIDATED REPORT'],
    ['Regional Office', refs.ro?.name || ''],
    ['Bank', refs.bank?.name || ''],
    ['Report Date', new Date().toLocaleDateString('en-IN')],
    ['Total Programs', programs.length],
    ['Total Beneficiaries', totalBenef],
    [],
  ];

  const ws = XLSX.utils.aoa_to_sheet(headerRows);
  XLSX.utils.sheet_add_json(ws, rows, { origin: -1 });
  ws['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 14 }, { wch: 18 },
    { wch: 20 }, { wch: 20 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Consolidated Report');
  const roName = (refs.ro?.name || 'RO').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `${roName}_ConsolidatedReport_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
