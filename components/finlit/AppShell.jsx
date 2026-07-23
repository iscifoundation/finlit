'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { api, setToken, ROLE_LABELS, ROLES } from '@/lib/finlit/api';
import { LayoutDashboard, Tent, FileText, Landmark, Users, Bell, LogOut, Menu, Building2, Wallet, MapPin, ScrollText, ShieldCheck, MessageSquare, Settings } from 'lucide-react';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: 'all' },
  { key: 'programs', label: 'Programs', icon: Tent, roles: 'all' },
  { key: 'entities', label: 'Locations', icon: Building2, roles: ['admin', 'program_manager'] },
  { key: 'teams', label: 'Teams', icon: Users, roles: ['admin', 'program_manager'] },
  { key: 'users', label: 'Users', icon: Users, roles: ['admin', 'program_manager'] },
  { key: 'expenses', label: 'Expenses', icon: Wallet, roles: ['admin', 'program_manager', 'team'] },
  { key: 'attendance', label: 'Attendance', icon: Users, roles: ['admin', 'program_manager', 'team'] },
  { key: 'invoices', label: 'Invoices', icon: FileText, roles: ['admin', 'regional_office'] },
  { key: 'reports', label: 'Reports', icon: FileText, roles: ['admin', 'program_manager', 'regional_office'] },
  { key: 'messages', label: 'Messages', icon: MessageSquare, roles: ['admin', 'program_manager', 'regional_office'] },
  { key: 'settings', label: 'Settings', icon: Settings, roles: ['admin'] },
  { key: 'audit', label: 'Audit', icon: ScrollText, roles: ['admin'] },
];

export default function AppShell({ user, view, setView, onLogout, children }) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api('/notifications').then(l => setUnread(l.filter(n => !n.read).length)).catch(() => {});
  }, [view]);

  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setToken(null); onLogout();
  };

  const items = NAV.filter(n => n.roles === 'all' || n.roles.includes(user.role));
  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const Nav = ({ onNav }) => (
    <nav className="space-y-1 p-3">
      {items.map(n => {
        const active = view === n.key || (view === 'program-detail' && n.key === 'programs') || (view === 'program-execute' && n.key === 'programs') || (view === 'invoice-detail' && n.key === 'invoices');
        return (
          <button key={n.key} onClick={() => { setView(n.key); onNav?.(); }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition ${active ? 'bg-primary text-primary-foreground' : 'text-slate-600 hover:bg-slate-100'}`}>
            <n.icon className="w-4 h-4" />
            <span>{n.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="hidden lg:flex w-60 bg-white border-r border-slate-200 flex-col fixed inset-y-0 z-30">
        <div className="h-14 px-4 flex items-center gap-2 border-b border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">FINLIT360</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">ISCI Foundation</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto"><Nav /></div>
      </aside>

      <div className="flex-1 lg:ml-60 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 sticky top-0 z-20 no-print">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="lg:hidden"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="h-14 px-4 flex items-center gap-2 border-b">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <div className="font-semibold">FINLIT360</div>
              </div>
              <Nav onNav={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="font-semibold text-slate-800 capitalize">{items.find(i => i.key === view)?.label || (view || '').replace('-', ' ')}</div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => setView('notifications')} className="relative">
              <Bell className="w-5 h-5" />
              {unread > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 hover:bg-slate-100 rounded-md px-2 py-1.5">
                  <Avatar className="w-8 h-8"><AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback></Avatar>
                  <div className="hidden md:block text-left">
                    <div className="text-sm font-medium leading-tight">{user.name}</div>
                    <div className="text-[11px] text-slate-500">{ROLE_LABELS[user.role]}</div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}><LogOut className="w-4 h-4 mr-2" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 min-w-0">{children}</main>
      </div>
    </div>
  );
}
