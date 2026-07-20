'use client';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('finlit_token');
}
export function setToken(t) {
  if (typeof window === 'undefined') return;
  if (t) localStorage.setItem('finlit_token', t);
  else localStorage.removeItem('finlit_token');
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
    err.data = data;
    throw err;
  }
  return data;
}

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  PROGRAM_MANAGER: 'program_manager',
  DISTRICT_COORDINATOR: 'district_coordinator',
  ROUTE_PLANNER: 'route_planner',
  BRANCH_MANAGER: 'branch_manager',
  BANK_REP: 'bank_rep',
  TEAM_LEADER: 'team_leader',
  FIELD_TRAINER: 'field_trainer',
  REGIONAL_OFFICE: 'regional_office',
  BANK_HQ: 'bank_hq',
};

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  program_manager: 'Program Manager',
  district_coordinator: 'District Coordinator',
  route_planner: 'Route Planner',
  branch_manager: 'Branch Manager',
  bank_rep: 'Bank Representative',
  team_leader: 'ISCI Team Leader',
  field_trainer: 'Field Trainer',
  regional_office: 'Regional Office',
  bank_hq: 'Bank Head Office',
};

export const CAMP_STATUS_META = {
  created: { label: 'Created', color: 'bg-slate-100 text-slate-700' },
  village_proposed: { label: 'Village Proposed', color: 'bg-slate-100 text-slate-700' },
  awaiting_confirmation: { label: 'Awaiting Confirmation', color: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-800' },
  representative_assigned: { label: 'Rep Assigned', color: 'bg-blue-100 text-blue-800' },
  team_assigned: { label: 'Team Assigned', color: 'bg-indigo-100 text-indigo-800' },
  scheduled: { label: 'Scheduled', color: 'bg-indigo-100 text-indigo-800' },
  in_progress: { label: 'In Progress', color: 'bg-orange-100 text-orange-800' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-800' },
  verified: { label: 'Verified', color: 'bg-green-100 text-green-800' },
  in_report: { label: 'In Report', color: 'bg-green-100 text-green-800' },
  closed: { label: 'Closed', color: 'bg-slate-200 text-slate-800' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
  change_requested: { label: 'Change Requested', color: 'bg-yellow-100 text-yellow-800' },
};
