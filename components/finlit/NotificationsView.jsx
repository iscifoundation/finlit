'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/finlit/api';
import { Bell, ArrowRight } from 'lucide-react';

export default function NotificationsView({ onOpenProgram }) {
  const [list, setList] = useState([]);
  const load = () => api('/notifications').then(setList);
  useEffect(() => { load(); }, []);
  const markRead = async (id) => { await api(`/notifications/${id}/read`, { method: 'POST' }); load(); };
  return (
    <Card className="border-slate-200">
      <CardContent className="p-5">
        <div className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><Bell className="w-4 h-4" />Notifications</div>
        {list.length === 0 ? <div className="text-slate-400 text-sm text-center py-10">All caught up.</div> : (
          <div className="space-y-2">
            {list.map(n => (
              <div key={n.id} className={`p-3 rounded-lg border ${n.read ? 'bg-white border-slate-100' : 'bg-primary/5 border-primary/20'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{n.title}</div>
                    <div className="text-xs text-slate-600">{n.message}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString('en-IN')}</div>
                  </div>
                  {n.programId && <Button size="sm" variant="ghost" onClick={() => { onOpenProgram(n.programId); markRead(n.id); }}>Open<ArrowRight className="w-3 h-3 ml-1" /></Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
