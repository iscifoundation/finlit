'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/finlit/api';
import { Bell, CheckCheck } from 'lucide-react';

export default function NotificationsView({ onOpenCamp }) {
  const [list, setList] = useState([]);
  const load = () => api('/notifications').then(setList);
  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    await api(`/notifications/${id}/read`, { method: 'POST' });
    load();
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" />Notifications ({list.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 && <div className="text-center py-10 text-slate-400">No notifications</div>}
        {list.map(n => (
          <div key={n.id} className={`p-3 rounded-lg border ${n.read ? 'bg-white' : 'bg-blue-50 border-blue-100'}`}>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="font-medium text-sm">{n.title}</div>
                <div className="text-xs text-slate-600">{n.message}</div>
                <div className="text-[11px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex flex-col gap-1">
                {n.campId && <Button size="sm" variant="outline" onClick={() => onOpenCamp(n.campId)}>Open</Button>}
                {!n.read && <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}><CheckCheck className="w-4 h-4" /></Button>}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
