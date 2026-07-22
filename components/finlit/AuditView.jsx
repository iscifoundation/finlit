'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { api, ROLE_LABELS } from '@/lib/finlit/api';

export default function AuditView() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  useEffect(() => { api('/audit').then(setLogs).catch(() => {}); api('/users').then(setUsers).catch(() => {}); }, []);
  return (
    <Card className="border-slate-200">
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr><th className="text-left p-3 font-medium text-slate-600">Time</th><th className="text-left p-3 font-medium text-slate-600">User</th><th className="text-left p-3 font-medium text-slate-600">Action</th><th className="text-left p-3 font-medium text-slate-600">Entity</th></tr>
          </thead>
          <tbody>
            {logs.map(l => {
              const u = users.find(x => x.id === l.userId);
              return <tr key={l.id} className="border-t"><td className="p-3 text-xs">{new Date(l.timestamp).toLocaleString('en-IN')}</td><td className="p-3">{u ? `${u.name} • ${ROLE_LABELS[u.role]}` : l.userId?.slice(0,8)}</td><td className="p-3 capitalize font-mono text-xs">{l.action?.replace(/_/g, ' ')}</td><td className="p-3 text-xs text-slate-600">{l.entityType}<br /><span className="text-slate-400">{l.entityId?.slice(0,8)}</span></td></tr>;
            })}
            {logs.length === 0 && <tr><td colSpan="4" className="text-center py-10 text-slate-400">No audit entries.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
