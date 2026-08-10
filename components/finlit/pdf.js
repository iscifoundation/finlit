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

// Cache & lazy-loader for branding logos placed in /public
// Users can drop `isci-logo.png` and `nabard-logo.png` in /app/public and they'll be picked up automatically.
async function loadLogoDataUrl(publicPath) {
  return new Promise(resolve => {
    fetch(publicPath).then(r => {
      if (!r.ok) return resolve(null);
      return r.blob().then(b => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(b);
      });
    }).catch(() => resolve(null));
  });
}

async function ensureBrandingLogos() {
  if (typeof window === 'undefined') return;
  if (window.__FINLIT_LOGOS_LOADED__) return;
  window.__FINLIT_LOGOS_LOADED__ = true;
  const [mpgb, nabard, isci] = await Promise.all([
    loadLogoDataUrl('/mpgb-logo.png'),
    loadLogoDataUrl('/nabard-logo.png'),
    loadLogoDataUrl('/isci-logo.png'),
  ]);
  if (mpgb)   window.__FINLIT_MPGB_LOGO__   = mpgb;
  if (nabard) window.__FINLIT_NABARD_LOGO__ = nabard;
  if (isci)   window.__FINLIT_ISCI_LOGO__   = isci;
}

// Green tone used for header/footer bands (from reference report)
const BRAND_GREEN = { r: 46, g: 125, b: 90 };

// Draw the top branding band — MPGB logo left, title center, NABARD logo right.
function brandingHeader(doc, opts = {}) {
  const title = opts.title || 'FINANCIAL LITERACY PROGRAM - EVENT REPORT';
  // Header band background (white with a bottom accent line)
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setDrawColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setLineWidth(1.2);
  doc.line(0, 30, 210, 30);
  // Left logo (MPGB / partner bank)
  if (window.__FINLIT_MPGB_LOGO__) {
    try { doc.addImage(window.__FINLIT_MPGB_LOGO__, 'PNG', 10, 4, 22, 22); } catch (e) { /* skip */ }
  }
  // Right logo (NABARD)
  if (window.__FINLIT_NABARD_LOGO__) {
    try { doc.addImage(window.__FINLIT_NABARD_LOGO__, 'PNG', 178, 4, 22, 22); } catch (e) { /* skip */ }
  }
  // Centered title
  doc.setTextColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(title, 105, 17, { align: 'center' });
  doc.setTextColor(0);
}

// Draw the bottom branding band — ISCI logo left + "Implemented & Submitted By: ISCI FOUNDATION, GWALIOR"
function brandingFooter(doc) {
  // Bottom accent line
  doc.setDrawColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setLineWidth(1.2);
  doc.line(0, 268, 210, 268);
  // ISCI logo
  if (window.__FINLIT_ISCI_LOGO__) {
    try { doc.addImage(window.__FINLIT_ISCI_LOGO__, 'PNG', 10, 272, 22, 22); } catch (e) { /* skip */ }
  }
  // Footer text
  doc.setTextColor(80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Implemented & Submitted By:', 40, 280);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.setTextColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.text('ISCI FOUNDATION, GWALIOR', 40, 288);
  doc.setTextColor(0);
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

// Load an image data URL and get natural dimensions
function loadDim(src) {
  return new Promise(resolve => {
    if (!src) return resolve({ w: 16, h: 9 });
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ w: img.naturalWidth || 16, h: img.naturalHeight || 9 });
    img.onerror = () => resolve({ w: 16, h: 9 });
    img.src = src;
  });
}

// Fetch a remote image (e.g. Cloudinary URL) and convert to data URL so jsPDF can embed it.
// If input is already a data URL, returns as-is.
async function toDataUrl(src) {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  try {
    const res = await fetch(src, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('toDataUrl failed for', src, e.message);
    return null;
  }
}

// Resolve a photo record to a usable image data URL and dimensions. Prefers `.url` (Cloudinary), falls back to legacy `.data`.
async function resolvePhoto(ph) {
  const src = ph.url || ph.data;
  if (!src) return { dataUrl: null, dim: { w: 16, h: 9 } };
  const dataUrl = await toDataUrl(src);
  const dim = await loadDim(dataUrl || src);
  return { dataUrl, dim };
}

// Fit (imgW × imgH) inside (boxW × boxH) preserving aspect ratio.
// Returns { w, h, dx, dy } where dx/dy center the image inside the box.
function fitContain(imgW, imgH, boxW, boxH) {
  const rImg = imgW / imgH;
  const rBox = boxW / boxH;
  let w, h;
  if (rImg > rBox) { w = boxW; h = boxW / rImg; }
  else            { h = boxH; w = boxH * rImg; }
  return { w, h, dx: (boxW - w) / 2, dy: (boxH - h) / 2 };
}

export async function downloadProgramPdf(p, refs) {
  await ensureBrandingLogos();
  const doc = new jsPDF();
  brandingHeader(doc, { title: 'FINANCIAL LITERACY PROGRAM - EVENT REPORT' });

  const dateStr = p.proposedDate;
  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('en-IN') : '';

  // Compact details in TWO columns (below the header band). Team is NOT included.
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  const details = [
    ['Program ID', p.code],
    ['Bank', refs.bank?.name],
    ['Regional Office', refs.ro?.name],
    ['State', refs.district?.state],
    ['District', refs.district?.name],
    ['Branch', refs.branch?.name],
    ['Village', refs.village?.name],
    ['Date', formattedDate],
    ['Participants', p.participants || 0],
    ['Status', (p.status || '').replace('_', ' ')],
  ];
  let y = 36;
  for (let i = 0; i < details.length; i += 2) {
    const [l1, v1] = details[i];
    const [l2, v2] = details[i + 1] || ['', ''];
    doc.setFont('helvetica', 'bold'); doc.text(`${l1}:`, 20, y);
    doc.setFont('helvetica', 'normal'); doc.text(String(v1 || '-'), 55, y);
    if (l2) {
      doc.setFont('helvetica', 'bold'); doc.text(`${l2}:`, 115, y);
      doc.setFont('helvetica', 'normal'); doc.text(String(v2 || '-'), 150, y);
    }
    y += 5;
  }
  if (p.remarks) {
    doc.setFont('helvetica', 'bold'); doc.text('Remarks:', 20, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(String(p.remarks), 170);
    doc.text(lines.slice(0, 2), 20, y + 5);
    y += 5 + Math.min(lines.length, 2) * 4;
  }

  // Photos — 2×2 grid on the SAME page, aspect-ratio preserved (no stretching)
  const photos = (p.photos || []).filter(ph => ph.url || ph.data).slice(0, 4);
  if (photos.length) {
    y += 3;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0);
    doc.text('Pictures of the Event', 20, y);
    y += 4;
    const gridStartY = y;
    const boxW = 82;
    const boxH = 52;
    const gapX = 5;
    const gapY = 12;
    // Preload all photos in parallel (fetch Cloudinary URL → data URL)
    const resolved = await Promise.all(photos.map(resolvePhoto));
    for (let i = 0; i < photos.length; i++) {
      const ph = photos[i];
      const { dataUrl, dim } = resolved[i];
      const row = Math.floor(i / 2);
      const col = i % 2;
      const boxX = 20 + col * (boxW + gapX);
      const boxY = gridStartY + row * (boxH + gapY);
      doc.setFillColor(245, 247, 250);
      doc.rect(boxX, boxY, boxW, boxH, 'F');
      const f = fitContain(dim.w, dim.h, boxW, boxH);
      if (dataUrl) {
        try { doc.addImage(dataUrl, 'JPEG', boxX + f.dx, boxY + f.dy, f.w, f.h); } catch (e) { /* skip */ }
      } else {
        // Fallback marker if the Cloudinary URL failed to fetch (CORS / network)
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text('[image unavailable]', boxX + boxW / 2, boxY + boxH / 2, { align: 'center' });
        doc.setTextColor(0);
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
      let cap = `Photo ${i + 1}`;
      if (ph.gps?.lat != null && ph.gps?.lng != null) cap += ` | GPS ${(+ph.gps.lat).toFixed(4)}, ${(+ph.gps.lng).toFixed(4)}`;
      if (ph.uploadedAt) cap += ` | ${new Date(ph.uploadedAt).toLocaleDateString('en-IN')}`;
      doc.text(cap, boxX, boxY + boxH + 4);
      doc.setTextColor(0);
    }
    y = gridStartY + Math.ceil(photos.length / 2) * (boxH + gapY);
  }

  // Authentication line (WITHOUT the director's name / designation)
  y += 4;
  doc.setDrawColor(220); doc.line(20, y, 190, y);
  y += 6;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(80);
  doc.text('Authenticated for and on behalf of ISCI Foundation.', 20, y);
  doc.setTextColor(0); doc.setFont('helvetica', 'normal');

  // Footer branding band
  brandingFooter(doc);
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

export async function downloadROReportPdf(programs, refs, options = {}) {
  await ensureBrandingLogos();
  const { includePhotos = true } = options;
  const doc = new jsPDF();
  brandingHeader(doc, { title: 'AUTHENTICATED PROGRAMS - CONSOLIDATED REPORT' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Regional Office: ${refs.ro?.name || ''}`, 20, 36);
  if (refs.bank?.name) doc.text(`Bank: ${refs.bank.name}`, 20, 42);
  doc.text(`Report Date: ${new Date().toLocaleDateString('en-IN')}`, 20, 48);
  doc.text(`Total Programs: ${programs.length}`, 20, 54);
  const totalBenef = programs.reduce((s, p) => s + (p.participants || 0), 0);
  doc.text(`Total Beneficiaries: ${totalBenef.toLocaleString('en-IN')}`, 20, 60);

  autoTable(doc, {
    startY: 66,
    head: [['S.No.', 'Code', 'Date', 'District', 'Branch', 'Village', 'Participants']],
    body: programs.map((p, i) => {
      const b = refs.branches?.find(x => x.id === p.branchId)?.name || '';
      const d = refs.districts?.find(x => x.id === p.districtId)?.name || '';
      const v = refs.villages?.find(x => x.id === p.villageId)?.name || '';
      return [
        i + 1,
        p.code,
        p.proposedDate ? new Date(p.proposedDate).toLocaleDateString('en-IN') : '',
        d, b, v, p.participants || 0,
      ];
    }),
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b], textColor: 255 },
    margin: { bottom: 30 },
  });
  brandingFooter(doc);

  // Per-program detail — ONE page per program, aspect preserved
  if (includePhotos) {
    for (let idx = 0; idx < programs.length; idx++) {
      const p = programs[idx];
      const b = refs.branches?.find(x => x.id === p.branchId);
      const d = refs.districts?.find(x => x.id === p.districtId);
      const v = refs.villages?.find(x => x.id === p.villageId);
      doc.addPage();
      brandingHeader(doc, { title: `${p.code} - EVENT REPORT` });

      // Compact 2-col details (no Team field)
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      const dateStr = p.proposedDate;
      const details = [
        ['Regional Office', refs.ro?.name],
        ['State', d?.state],
        ['District', d?.name],
        ['Branch', b?.name],
        ['Village', v?.name],
        ['Date', dateStr ? new Date(dateStr).toLocaleDateString('en-IN') : '-'],
        ['Participants', p.participants || 0],
        ['Status', (p.status || '').replace('_', ' ')],
      ];
      let y = 36;
      for (let i = 0; i < details.length; i += 2) {
        const [l1, v1] = details[i];
        const [l2, v2] = details[i + 1] || ['', ''];
        doc.setFont('helvetica', 'bold'); doc.text(`${l1}:`, 20, y);
        doc.setFont('helvetica', 'normal'); doc.text(String(v1 || '-'), 55, y);
        if (l2) {
          doc.setFont('helvetica', 'bold'); doc.text(`${l2}:`, 115, y);
          doc.setFont('helvetica', 'normal'); doc.text(String(v2 || '-'), 150, y);
        }
        y += 5;
      }
      if (p.remarks) {
        doc.setFont('helvetica', 'bold'); doc.text('Remarks:', 20, y);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(String(p.remarks), 170);
        doc.text(lines.slice(0, 2), 20, y + 5);
        y += 5 + Math.min(lines.length, 2) * 4;
      }

      const photos = (p.photos || []).filter(ph => ph.url || ph.data).slice(0, 4);
      if (photos.length) {
        y += 3;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0);
        doc.text('Pictures of the Event', 20, y); y += 4;
        const gridStartY = y;
        const boxW = 82, boxH = 52, gapX = 5, gapY = 12;
        const resolved = await Promise.all(photos.map(resolvePhoto));
        for (let i = 0; i < photos.length; i++) {
          const ph = photos[i];
          const { dataUrl, dim } = resolved[i];
          const row = Math.floor(i / 2);
          const col = i % 2;
          const boxX = 20 + col * (boxW + gapX);
          const boxY = gridStartY + row * (boxH + gapY);
          doc.setFillColor(245, 247, 250);
          doc.rect(boxX, boxY, boxW, boxH, 'F');
          const f = fitContain(dim.w, dim.h, boxW, boxH);
          if (dataUrl) {
            try { doc.addImage(dataUrl, 'JPEG', boxX + f.dx, boxY + f.dy, f.w, f.h); } catch (e) { /* skip */ }
          } else {
            doc.setFontSize(8); doc.setTextColor(150);
            doc.text('[image unavailable]', boxX + boxW / 2, boxY + boxH / 2, { align: 'center' });
            doc.setTextColor(0);
          }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
          let cap = `Photo ${i + 1}`;
          if (ph.gps?.lat != null && ph.gps?.lng != null) cap += ` | GPS ${(+ph.gps.lat).toFixed(4)}, ${(+ph.gps.lng).toFixed(4)}`;
          if (ph.uploadedAt) cap += ` | ${new Date(ph.uploadedAt).toLocaleDateString('en-IN')}`;
          doc.text(cap, boxX, boxY + boxH + 4);
          doc.setTextColor(0);
        }
        y = gridStartY + Math.ceil(photos.length / 2) * (boxH + gapY);
      } else {
        doc.setFontSize(9); doc.setTextColor(150);
        doc.text('No photo evidence available', 20, y + 6);
        doc.setTextColor(0);
      }

      // Authentication line (no director name/designation)
      y += 4;
      doc.setDrawColor(220); doc.line(20, y, 190, y);
      y += 6;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(80);
      doc.text('Authenticated for and on behalf of ISCI Foundation.', 20, y);
      doc.setTextColor(0); doc.setFont('helvetica', 'normal');

      brandingFooter(doc);
    }
  }

  // Final signature page (also without director name/designation)
  doc.addPage();
  brandingHeader(doc, { title: 'Report Summary' });
  doc.setFontSize(11); doc.setTextColor(0); doc.setFont('helvetica', 'normal');
  doc.text('This report is authenticated by ISCI Foundation.', 105, 60, { align: 'center' });
  doc.text(`Total programs conducted and authenticated: ${programs.length}`, 105, 68, { align: 'center' });
  doc.text(`Total beneficiaries reached: ${totalBenef.toLocaleString('en-IN')}`, 105, 76, { align: 'center' });
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(80);
  doc.text('Authenticated for and on behalf of ISCI Foundation.', 105, 100, { align: 'center' });
  doc.setTextColor(0);

  brandingFooter(doc);
  const roName = (refs.ro?.name || 'RO').replace(/\s+/g, '_');
  doc.save(`${roName}_ConsolidatedReport_${new Date().toISOString().slice(0, 10)}.pdf`);
}
