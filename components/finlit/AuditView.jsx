'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ROLE_LABELS } from '@/lib/finlit/api';
import { ScrollText } from 'lucide-react';

export default function AuditView() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  useEffect(() => {
    api('/audit').then(setLogs).catch(() => {});
    api('/users').then(setUsers).catch(() => {});
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ScrollText className="w-4 h-4" />Audit Trail ({logs.length})</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Timestamp</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">User</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Action</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Entity</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => {
                const u = users.find(x => x.id === l.userId);
                return (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs">{u ? `${u.name} (${ROLE_LABELS[u.role]})` : l.userId}</td>
                    <td className="px-3 py-2 text-xs capitalize font-mono">{l.action?.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 text-xs">{l.entityType} <span className="text-slate-400">{l.entityId?.slice(0, 8)}</span></td>
                    <td className="px-3 py-2 text-xs text-slate-500 max-w-md truncate">
                      {l.before?.status && l.after?.status && `${l.before.status} → ${l.after.status}`}
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">No audit entries yet</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
