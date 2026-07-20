'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { api, setToken, ROLE_LABELS } from '@/lib/finlit/api';
import {
  LayoutDashboard, Tent, Landmark, FolderKanban, MapPin, Building2, Home, Users, Truck,
  Route as RouteIcon, BarChart3, Bell, ShieldCheck, LogOut, Menu, ClipboardList, FileText, ScrollText,
} from 'lucide-react';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: 'all' },
  { key: 'camps', label: 'Camps', icon: Tent, roles: 'all' },
  { key: 'route-planning', label: 'Route Planning', icon: RouteIcon, roles: ['super_admin', 'program_manager', 'district_coordinator', 'route_planner'] },
  { key: 'my-route', label: 'My Route (Today)', icon: MapPin, roles: ['team_leader', 'field_trainer'] },
  { key: 'banks', label: 'Banks', icon: Landmark, roles: ['super_admin', 'program_manager'] },
  { key: 'projects', label: 'Projects', icon: FolderKanban, roles: ['super_admin', 'program_manager'] },
  { key: 'districts', label: 'Districts', icon: MapPin, roles: ['super_admin', 'program_manager'] },
  { key: 'branches', label: 'Branches', icon: Building2, roles: ['super_admin', 'program_manager', 'district_coordinator'] },
  { key: 'villages', label: 'Villages', icon: Home, roles: ['super_admin', 'program_manager', 'district_coordinator', 'route_planner'] },
  { key: 'teams', label: 'Teams', icon: Users, roles: ['super_admin', 'program_manager', 'district_coordinator'] },
  { key: 'vehicles', label: 'Vehicles', icon: Truck, roles: ['super_admin', 'program_manager', 'district_coordinator'] },
  { key: 'users', label: 'Users', icon: Users, roles: ['super_admin'] },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, roles: 'all' },
  { key: 'reports', label: 'Reports', icon: FileText, roles: ['super_admin', 'program_manager', 'district_coordinator', 'regional_office', 'bank_hq'] },
  { key: 'notifications', label: 'Notifications', icon: Bell, roles: 'all' },
  { key: 'audit', label: 'Audit Trail', icon: ScrollText, roles: ['super_admin', 'program_manager', 'regional_office'] },
];

export default function AppShell({ user, view, setView, onLogout, children }) {
  const [notifCount, setNotifCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api('/notifications').then(list => setNotifCount(list.filter(n => !n.read).length)).catch(() => {});
  }, [view]);

  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setToken(null);
    onLogout();
  };

  const allowed = (n) => n.roles === 'all' || n.roles.includes(user.role);
  const NavList = ({ onNav }) => (
    <nav className="flex-1 overflow-y-auto py-3">
      {NAV.filter(allowed).map(n => (
        <button key={n.key}
          onClick={() => { setView(n.key); onNav?.(); }}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition ${view === n.key ? 'bg-sidebar-accent text-white border-l-4 border-sidebar-primary' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 border-l-4 border-transparent'}`}>
          <n.icon className="w-4 h-4" />
          <span>{n.label}</span>
          {n.key === 'notifications' && notifCount > 0 && (
            <Badge className="ml-auto bg-red-500 text-white hover:bg-red-500">{notifCount}</Badge>
          )}
        </button>
      ))}
    </nav>
  );

  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-sidebar text-sidebar-foreground flex-col fixed inset-y-0 z-30">
        <div className="p-4 flex items-center gap-2 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-sidebar-primary" />
          </div>
          <div>
            <div className="font-bold text-sidebar-foreground">FINLIT360</div>
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">ISCI Foundation</div>
          </div>
        </div>
        <NavList />
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2">
            <Avatar className="w-9 h-9"><AvatarFallback className="bg-sidebar-primary text-white text-xs">{initials}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-[11px] text-sidebar-foreground/60 truncate">{ROLE_LABELS[user.role]}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={logout} className="text-sidebar-foreground hover:bg-sidebar-accent"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 sticky top-0 z-20">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="lg:hidden"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-sidebar text-sidebar-foreground border-r-0">
              <div className="p-4 flex items-center gap-2 border-b border-sidebar-border">
                <ShieldCheck className="w-5 h-5 text-sidebar-primary" />
                <div className="font-bold">FINLIT360</div>
              </div>
              <NavList onNav={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="font-semibold text-slate-800">{NAV.find(n => n.key === view)?.label || 'Dashboard'}</div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => setView('notifications')} className="relative">
              <Bell className="w-5 h-5" />
              {notifCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{notifCount}</span>}
            </Button>
            <div className="hidden md:flex items-center gap-2 text-sm">
              <Avatar className="w-8 h-8"><AvatarFallback className="bg-primary text-white text-xs">{initials}</AvatarFallback></Avatar>
              <div>
                <div className="font-medium leading-tight">{user.name}</div>
                <div className="text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</div>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 min-w-0">{children}</main>
      </div>
    </div>
  );
}
