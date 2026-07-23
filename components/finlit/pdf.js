'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { amountInWords } from '@/lib/finlit/api';

const ISCI = {
  name: 'ISCI FOUNDATION',
  address: 'B-801, Elexir M.K. City, New Sirol Road, New City Center,\nGwalior - 474006',
  cin: 'CIN: U85300MP2019NPL049683',
  license: 'SECTION 8 LICENCE NO: 116329',
  email: 'info@iscifoundation.org',
  phone: '+91-9462543217',
  bank: {
    name: 'ISCI Foundation',
    bankName: 'Indusind Bank',
    branch: 'City Centre, Gwalior',
    ifsc: 'INDB0000123',
    accNo: '259462543217',
  },
  director: 'Mr. Mohit Modi',
};

function header(doc) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 40, 90);
  doc.text(ISCI.name, 105, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(ISCI.address, 105, 24, { align: 'center' });
  doc.setFontSize(8);
  doc.text(ISCI.cin + '   ' + ISCI.license, 105, 32, { align: 'center' });
  doc.setDrawColor(20, 40, 90);
  doc.setLineWidth(0.5);
  doc.line(15, 36, 195, 36);
}

function footer(doc) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(200);
    doc.line(15, 285, 195, 285);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${ISCI.email}  //  ${ISCI.phone}`, 105, 290, { align: 'center' });
    doc.text(`Page ${i} of ${total}`, 195, 290, { align: 'right' });
  }
}

export function downloadProgramPdf(p, refs) {
  const doc = new jsPDF();
  header(doc);

  const dateStr = p.conductedAt || p.proposedDate;
  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('en-IN') : '';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0);
  doc.text('FINANCIAL LITERACY CAMP - PROGRAM REPORT', 105, 46, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  let y = 56;
  const line = (l, v) => { doc.setFont('helvetica', 'bold'); doc.text(l, 20, y); doc.setFont('helvetica', 'normal'); doc.text(String(v || '-'), 70, y); y += 6; };
  line('Program ID:', p.code);
  line('Bank:', refs.bank?.name);
  line('Regional Office:', refs.ro?.name);
  line('State:', refs.district?.state);
  line('District:', refs.district?.name);
  line('Branch:', refs.branch?.name);
  line('Village:', refs.village?.name);
  line('Date:', formattedDate);
  line('Participants:', p.participants || 0);
  line('Status:', (p.status || '').replace('_', ' '));
  if (p.remarks) { line('Remarks:', p.remarks); }

  // Photos - A6 size (approx 105x148mm each, 2 photos per page)
  const photos = (p.photos || []).filter(ph => ph.data).slice(0, 4);
  if (photos.length) {
    photos.forEach((ph, i) => {
      if (i === 0) {
        // Continue on current page if room, else new page
        if (y > 130) { doc.addPage(); header(doc); y = 44; }
        doc.setFont('helvetica', 'bold');
        doc.text('Photo Evidence', 20, y); y += 4;
      } else if (i % 2 === 0) {
        doc.addPage(); header(doc); y = 44;
      }
      try { doc.addImage(ph.data, 'JPEG', 25, y + (i % 2) * 130, 160, 120); } catch (e) { /* ignore */ }
    });
    y += 260;
  }

  if (y > 240) doc.addPage();

  // Signature
  y = Math.max(y, 250);
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text('Authenticated for and on behalf of', 20, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(ISCI.name, 20, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${ISCI.director},  For ISCI Foundation Director`, 20, y + 12);

  footer(doc);
  const fname = [refs.ro?.name, refs.district?.name, refs.branch?.name, refs.village?.name, formattedDate].filter(Boolean).join('_').replace(/\s+/g, '_') + '.pdf';
  doc.save(fname);
}

export function downloadInvoicePdf(inv, refs) {
  const doc = new jsPDF();
  header(doc);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('INVOICE', 195, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`INV NO: ${inv.invoiceNumber}`, 195, 50, { align: 'right' });
  doc.text(`DATE: ${new Date(inv.date).toLocaleDateString('en-IN')}`, 195, 55, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('To,', 20, 46);
  doc.text(inv.billTo?.title || 'The Regional Manager', 20, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const addr = (inv.billTo?.address || '').split(',').map(s => s.trim()).filter(Boolean);
  const bankName = refs.bank?.name || '';
  doc.text(bankName, 20, 58);
  addr.forEach((line, i) => doc.text(line, 20, 63 + i * 5));

  const startY = 63 + addr.length * 5 + 8;
  doc.setFontSize(9);
  doc.text('Dear Sir,', 20, startY);
  const intro = doc.splitTextToSize('This is with reference to the Financial Literacy Camps conducted by ISCI Foundation on your behalf. Kindly find below the details of the camps completed. As agreed, please make the required payment against the below activities. The relevant documentation for the said activities has been attached.', 175);
  doc.text(intro, 20, startY + 6);

  const tableY = startY + 6 + intro.length * 5 + 4;
  autoTable(doc, {
    startY: tableY,
    head: [['S.No.', 'Program', 'Date', 'Branch', 'Village', 'Amount (₹)']],
    body: (inv.items || []).map((it, i) => [
      i + 1, it.program, it.date ? new Date(it.date).toLocaleDateString('en-IN') : '',
      it.branch, it.village, Number(it.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    ]),
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [20, 40, 90], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 5: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });

  let y = doc.lastAutoTable.finalY + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`TOTAL:  ₹ ${Number(inv.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 195, y, { align: 'right' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`In Words: ${amountInWords(inv.total)} Rupees Only /-`, 20, y);
  y += 10;

  // Bank details
  doc.setFont('helvetica', 'bold');
  doc.text('Payment Details', 20, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`A/c Name:  ${ISCI.bank.name}`, 20, y); y += 5;
  doc.text(`Bank:  ${ISCI.bank.bankName},  Branch:  ${ISCI.bank.branch}`, 20, y); y += 5;
  doc.text(`IFSC:  ${ISCI.bank.ifsc}     A/c No:  ${ISCI.bank.accNo}`, 20, y); y += 12;

  if (y > 250) { doc.addPage(); y = 40; }

  // Signature
  doc.setFontSize(9);
  doc.text('Raised by,', 130, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(ISCI.name, 130, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(ISCI.director, 130, y + 20);
  doc.text('For ISCI Foundation', 130, y + 25);
  doc.text('Director', 130, y + 30);
  // Draw signature box
  doc.setDrawColor(180);
  doc.rect(130, y + 8, 60, 10);
  doc.setTextColor(150);
  doc.setFontSize(7);
  doc.text('(Signature / Seal)', 160, y + 14, { align: 'center' });

  footer(doc);
  doc.save(`${inv.invoiceNumber.replace(/\//g, '_')}.pdf`);
}

export function downloadROReportPdf(programs, refs, options = {}) {
  const { includePhotos = true } = options;
  const doc = new jsPDF();
  header(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('AUTHENTICATED PROGRAMS - CONSOLIDATED REPORT', 105, 46, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Regional Office: ${refs.ro?.name || ''}`, 20, 54);
  if (refs.bank?.name) doc.text(`Bank: ${refs.bank.name}`, 20, 60);
  doc.text(`Report Date: ${new Date().toLocaleDateString('en-IN')}`, 20, 66);
  doc.text(`Total Programs: ${programs.length}`, 20, 72);
  const totalBenef = programs.reduce((s, p) => s + (p.participants || 0), 0);
  doc.text(`Total Beneficiaries: ${totalBenef.toLocaleString('en-IN')}`, 20, 78);

  autoTable(doc, {
    startY: 84,
    head: [['S.No.', 'Code', 'Date', 'District', 'Branch', 'Village', 'Participants']],
    body: programs.map((p, i) => {
      const b = refs.branches?.find(x => x.id === p.branchId)?.name || '';
      const d = refs.districts?.find(x => x.id === p.districtId)?.name || '';
      const v = refs.villages?.find(x => x.id === p.villageId)?.name || '';
      return [
        i + 1,
        p.code,
        p.conductedAt ? new Date(p.conductedAt).toLocaleDateString('en-IN') : (p.proposedDate ? new Date(p.proposedDate).toLocaleDateString('en-IN') : ''),
        d, b, v, p.participants || 0,
      ];
    }),
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [20, 40, 90], textColor: 255 },
  });

  // Per-program detail pages
  if (includePhotos) {
    programs.forEach((p, idx) => {
      const b = refs.branches?.find(x => x.id === p.branchId);
      const d = refs.districts?.find(x => x.id === p.districtId);
      const v = refs.villages?.find(x => x.id === p.villageId);
      doc.addPage();
      header(doc);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`Program ${idx + 1} of ${programs.length} — ${p.code}`, 105, 46, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      let y = 56;
      const line = (l, val) => { doc.setFont('helvetica', 'bold'); doc.text(l, 20, y); doc.setFont('helvetica', 'normal'); doc.text(String(val || '-'), 70, y); y += 6; };
      line('Regional Office:', refs.ro?.name);
      line('State:', d?.state);
      line('District:', d?.name);
      line('Branch:', b?.name);
      line('Village:', v?.name);
      const dateStr = p.conductedAt || p.proposedDate;
      line('Date:', dateStr ? new Date(dateStr).toLocaleDateString('en-IN') : '-');
      line('Participants:', p.participants || 0);
      if (p.remarks) line('Remarks:', p.remarks);

      const photos = (p.photos || []).filter(ph => ph.data).slice(0, 4);
      if (photos.length) {
        photos.forEach((ph, i) => {
          if (i % 2 === 0) { doc.addPage(); header(doc); y = 44; doc.setFont('helvetica','bold'); doc.text(`${p.code} - Photo Evidence (${i+1}-${Math.min(i+2, photos.length)} of ${photos.length})`, 20, y); y += 4; }
          try { doc.addImage(ph.data, 'JPEG', 25, y + (i % 2) * 130, 160, 120); } catch (e) { /* skip */ }
        });
      } else {
        y += 4;
        doc.setFontSize(9); doc.setTextColor(150);
        doc.text('No photo evidence available', 20, y);
        doc.setTextColor(0);
      }
    });
  }

  // Final signature page
  doc.addPage();
  header(doc);
  doc.setFontSize(10);
  doc.text('This report is authenticated by ISCI Foundation.', 105, 60, { align: 'center' });
  doc.text(`Total programs conducted and authenticated: ${programs.length}`, 105, 68, { align: 'center' });
  doc.text(`Total beneficiaries reached: ${totalBenef.toLocaleString('en-IN')}`, 105, 76, { align: 'center' });

  doc.setFontSize(9); doc.setTextColor(80);
  doc.text('Authenticated for and on behalf of', 130, 210);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0);
  doc.text(ISCI.name, 130, 218);
  doc.setDrawColor(180); doc.rect(130, 222, 60, 12);
  doc.setTextColor(150); doc.setFontSize(7);
  doc.text('(Signature / Seal)', 160, 229, { align: 'center' });
  doc.setTextColor(0); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(ISCI.director, 130, 240);
  doc.text('For ISCI Foundation, Director', 130, 245);

  footer(doc);
  const roName = (refs.ro?.name || 'RO').replace(/\s+/g, '_');
  doc.save(`${roName}_ConsolidatedReport_${new Date().toISOString().slice(0, 10)}.pdf`);
}
