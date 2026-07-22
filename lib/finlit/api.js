'use client';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('finlit_token');
}
export function setToken(t) {
  if (typeof window === 'undefined') return;
  if (t) localStorage.setItem('finlit_token', t); else localStorage.removeItem('finlit_token');
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const ROLES = {
  ADMIN: 'admin',
  PROGRAM_MANAGER: 'program_manager',
  BRANCH_MANAGER: 'branch_manager',
  REGIONAL_OFFICE: 'regional_office',
  TEAM: 'team',
};

export const ROLE_LABELS = {
  admin: 'Admin (ISCI Foundation)',
  program_manager: 'Program Manager',
  branch_manager: 'Branch Manager',
  regional_office: 'Regional Office',
  team: 'Team',
};

export const STATUS = {
  proposed: { label: 'Awaiting Confirmation', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  change_requested: { label: 'Change Requested', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  confirmed: { label: 'Confirmed', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  conducted: { label: 'Pending Authentication', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  authenticated: { label: 'Authenticated', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export function inr(n) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(+n || 0);
}

export function amountInWords(num) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const n = Math.floor(+num || 0);
  if (n === 0) return 'Zero';
  function twoDigits(x) { return x < 20 ? a[x] : b[Math.floor(x/10)] + (x%10 ? ' ' + a[x%10] : ''); }
  function threeDigits(x) { return (x >= 100 ? a[Math.floor(x/100)] + ' Hundred ' : '') + (x%100 ? twoDigits(x%100) : ''); }
  let s = '';
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n / 100000) % 100);
  const thousand = Math.floor((n / 1000) % 100);
  const hundred = n % 1000;
  if (crore) s += threeDigits(crore) + ' Crore ';
  if (lakh) s += twoDigits(lakh) + ' Lakh ';
  if (thousand) s += twoDigits(thousand) + ' Thousand ';
  if (hundred) s += threeDigits(hundred);
  return s.trim();
}
