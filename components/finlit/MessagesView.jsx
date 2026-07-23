'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ROLES } from '@/lib/finlit/api';
import { Send, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function MessagesView({ user }) {
  const [ros, setRos] = useState([]);
  const [roId, setRoId] = useState(user.roId || '');
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if ([ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) {
      api('/regional_offices').then(rs => { setRos(rs); if (rs.length && !roId) setRoId(rs[0].id); });
    }
  }, []);

  const load = () => {
    if (!roId && user.role !== ROLES.REGIONAL_OFFICE) return;
    const url = user.role === ROLES.REGIONAL_OFFICE ? '/messages' : `/messages?roId=${roId}`;
    api(url).then(m => { setMsgs(m); setTimeout(() => scrollRef.current?.scrollTo({ top: 99999 }), 100); });
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [roId]);

  const send = async () => {
    if (!text.trim()) return;
    const body = { text: text.trim() };
    if ([ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) body.roId = roId;
    try { await api('/messages', { method: 'POST', body: JSON.stringify(body) }); setText(''); load(); }
    catch (e) { toast.error(e.message); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {[ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role) && (
        <div>
          <Select value={roId} onValueChange={setRoId}>
            <SelectTrigger><SelectValue placeholder="Select Regional Office to chat with" /></SelectTrigger>
            <SelectContent>{ros.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <Card className="border-slate-200"><CardContent className="p-4">
        <div className="font-semibold flex items-center gap-2 mb-3"><MessageSquare className="w-4 h-4" />Conversation</div>
        <div ref={scrollRef} className="h-[420px] overflow-y-auto space-y-2 border rounded-md p-3 bg-slate-50">
          {msgs.length === 0 && <div className="text-center text-slate-400 text-sm py-10">No messages yet. Start the conversation below.</div>}
          {msgs.map(m => {
            const mine = m.from === user.id;
            const isRO = m.fromRole === ROLES.REGIONAL_OFFICE;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] p-2.5 rounded-lg text-sm ${mine ? 'bg-primary text-primary-foreground' : (isRO ? 'bg-emerald-50 text-slate-800 border border-emerald-100' : 'bg-white text-slate-800 border border-slate-200')}`}>
                  <div className="text-[10px] opacity-70 mb-0.5">{m.fromName} • {new Date(m.createdAt).toLocaleString('en-IN')}</div>
                  <div>{m.text}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          <Input value={text} onChange={e => setText(e.target.value)} placeholder="Type a message..." onKeyDown={e => e.key === 'Enter' && send()} />
          <Button onClick={send}><Send className="w-4 h-4" /></Button>
        </div>
      </CardContent></Card>
    </div>
  );
}
