'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/finlit/api';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsView({ user }) {
  const [settings, setSettings] = useState({});
  const canToggle = user.email === '[email protected]';
  const load = () => api('/settings').then(setSettings);
  useEffect(() => { load(); }, []);

  const toggleDemo = async (v) => {
    try { await api('/settings/demo-login', { method: 'POST', body: JSON.stringify({ enabled: v }) }); toast.success(`Demo login ${v ? 'enabled' : 'disabled'}`); load(); }
    catch (e) { toast.error(e.message); }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="border-slate-200"><CardContent className="p-5 space-y-4">
        <div><div className="text-lg font-semibold">Settings</div><div className="text-sm text-slate-500">System-wide configuration</div></div>
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div>
            <div className="font-medium">Demo login enabled</div>
            <div className="text-xs text-slate-500">When on, the 5 demo role buttons work on the login screen. Turn off for production.</div>
          </div>
          <Switch checked={settings.demoLoginEnabled !== false} onCheckedChange={toggleDemo} disabled={!canToggle} />
        </div>
        {!canToggle && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5" />Only <b className="mx-1">[email protected]</b> can change this setting.
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
