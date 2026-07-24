'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { api, ROLES } from '@/lib/finlit/api';
import { ArrowLeft, Camera, Image as ImageIcon, MapPin, Users, Wallet, Send, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

async function compress(file, maxW = 1400, q = 0.75) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = img.width * s; c.height = img.height * s;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(file);
  });
}

export default function ProgramExecuteView({ id, user, onBack }) {
  const [p, setP] = useState(null);
  const [village, setVillage] = useState(null);
  const [gps, setGps] = useState(null);
  const [reusedGpsQueue, setReusedGpsQueue] = useState([]); // GPSes from deleted photos (used first in edit mode)
  const [participants, setParticipants] = useState(0);
  const [expenses, setExpenses] = useState({ taxi: 0, food: 0, refreshments: 0, stationary: 0, other: 0 });
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const camRef = useRef(null);
  const galRef = useRef(null);

  // Edit mode: program is already conducted, admin/PM/team is replacing/adding photos.
  const isEditMode = p?.status === 'conducted';

  useEffect(() => {
    api(`/programs/${id}`).then(async pp => {
      setP(pp);
      if (pp.participants) setParticipants(pp.participants);
      if (pp.expenses) setExpenses({ ...expenses, ...pp.expenses });
      if (pp.remarks) setRemarks(pp.remarks);
      let v = null;
      if (pp.villageId) {
        v = await api(`/villages/${pp.villageId}`);
        setVillage(v);
      }
      // In edit mode, reuse the ORIGINAL capture GPS (from the first existing photo) — never re-fetch device location.
      if (pp.status === 'conducted') {
        const originalGps = (pp.photos || []).find(ph => ph.gps?.lat != null)?.gps;
        if (originalGps) setGps({ ...originalGps, reused: true });
        else if (v?.lat != null) setGps({ lat: v.lat, lng: v.lng, reused: true, fromVillage: true });
      } else if (navigator.geolocation) {
        // Fresh capture — fetch device GPS
        navigator.geolocation.getCurrentPosition(
          pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
          () => {},
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }
    });
  }, [id]);

  if (!p) return <div className="text-slate-400">Loading...</div>;

  const upload = async (source, files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const data = [];
      // In edit mode, use reused GPS queue first (from deleted photos), then fall back to base gps
      const queue = [...reusedGpsQueue];
      for (const f of files) {
        let photoGps = gps;
        if (isEditMode && queue.length > 0) photoGps = queue.shift();
        data.push({ data: await compress(f), gps: photoGps, source });
      }
      const r = await api(`/programs/${id}/upload-data`, { method: 'POST', body: JSON.stringify({ photos: data }) });
      setP(r);
      setReusedGpsQueue(queue);
      toast.success(`${data.length} photo${data.length>1?'s':''} uploaded`);
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const deletePhoto = async (photoId) => {
    try {
      // Preserve the deleted photo's GPS so a replacement can inherit it in edit mode
      if (isEditMode) {
        const deletedGps = (p.photos || []).find(ph => ph.id === photoId)?.gps;
        if (deletedGps) setReusedGpsQueue(q => [...q, deletedGps]);
      }
      const r = await api(`/programs/${id}/delete-photo`, { method: 'POST', body: JSON.stringify({ photoId }) });
      setP(r);
    } catch (e) { toast.error(e.message); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const r = await api(`/programs/${id}/upload-data`, { method: 'POST', body: JSON.stringify({ participants, expenses, remarks }) });
      setP(r);
      toast.success('Saved. ' + (r.status === 'conducted' ? 'Awaiting authentication.' : ''));
      if (r.status === 'conducted') onBack();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const photoCount = (p.photos || []).length;
  const totalExp = Object.values(expenses).reduce((s, v) => s + (+v || 0), 0);
  const canSubmit = photoCount >= 4 && participants > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
        <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">{p.code}</span>
      </div>

      {/* GPS */}
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-slate-500" />
            <div className="flex-1">
              <div className="font-medium">Location</div>
              {gps ? (
                <div className="text-xs text-slate-500">
                  {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                  {gps.accuracy ? <> • ±{Math.round(gps.accuracy)}m</> : null}
                  {gps.reused && <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-amber-800">
                    <MapPin className="w-3 h-3" />{gps.fromVillage ? 'Village GPS' : 'Original capture'}
                  </span>}
                </div>
              ) : (
                <div className="text-xs text-slate-500">{isEditMode ? 'No original GPS on file' : 'Capturing GPS...'}</div>
              )}
              {isEditMode && (
                <div className="text-[11px] text-slate-500 mt-1">
                  Editing after conduction — replacement photos reuse the ORIGINAL capture location (device GPS is not re-detected).
                </div>
              )}
            </div>
            {!isEditMode && <Button size="sm" variant="outline" onClick={() => navigator.geolocation.getCurrentPosition(pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }))}>Refresh</Button>}
          </div>
          {village && gps && !isEditMode && (() => {
            const d = Math.hypot((gps.lat - village.lat) * 111000, (gps.lng - village.lng) * 111000 * Math.cos(gps.lat * Math.PI / 180));
            return d > 500 && <div className="mt-2 text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />You are {Math.round(d)}m from planned village — please explain in remarks.</div>;
          })()}
        </CardContent>
      </Card>

      {/* Photos */}
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-medium flex items-center gap-2"><Camera className="w-4 h-4" />GPS-tagged Photos</div>
              <div className="text-xs text-slate-500">Minimum 4 photos required</div>
            </div>
            <div className="text-sm font-medium">{photoCount}/4</div>
          </div>
          <Progress value={(photoCount / 4) * 100} className="h-1.5 mb-3" />
          <div className="grid grid-cols-4 gap-2 mb-3">
            {Array.from({ length: Math.max(4, photoCount) }).map((_, i) => {
              const ph = p.photos?.[i];
              return (
                <div key={i} className="aspect-square rounded-lg border-2 border-dashed border-slate-200 overflow-hidden bg-slate-50 relative">
                  {ph?.data ? (
                    <>
                      <img src={ph.data} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => deletePhoto(ph.id)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300"><Camera className="w-5 h-5" /></div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input ref={camRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => upload('camera', e.target.files)} />
            <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={e => upload('gallery', e.target.files)} />
            <Button variant="outline" onClick={() => camRef.current?.click()} disabled={busy}><Camera className="w-4 h-4 mr-1" />Camera</Button>
            <Button variant="outline" onClick={() => galRef.current?.click()} disabled={busy}><ImageIcon className="w-4 h-4 mr-1" />Gallery</Button>
          </div>
        </CardContent>
      </Card>

      {/* Participants */}
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="font-medium flex items-center gap-2 mb-2"><Users className="w-4 h-4" />Number of Participants</div>
          <Input type="number" min="0" value={participants} onChange={e => setParticipants(+e.target.value || 0)} className="h-11 text-lg" />
        </CardContent>
      </Card>

      {/* Expenses moved to dashboard - per day, not per program */}
      <Card className="border-slate-200 border-dashed">
        <CardContent className="p-4 text-sm text-slate-500 flex items-start gap-2">
          <Wallet className="w-4 h-4 mt-0.5" />
          <div><b>Expenses are logged separately.</b> Go to <b>Expenses</b> from the sidebar to log the day&apos;s expenses (taxi, food, refreshments, stationery) for your team as a whole.</div>
        </CardContent>
      </Card>

      {/* Remarks */}
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <Label>Remarks (optional)</Label>
          <Textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Observations, challenges, feedback..." />
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 lg:left-60 bg-white border-t p-3 flex gap-2 z-10 no-print">
        <Button variant="outline" onClick={onBack}>Save & Exit</Button>
        <Button className="flex-1" onClick={save} disabled={busy || !canSubmit}>
          <Send className="w-4 h-4 mr-1" />{canSubmit ? 'Submit for Authentication' : `Need ${Math.max(0, 4 - photoCount)} more photo(s)${participants ? '' : ' & participants'}`}
        </Button>
      </div>
    </div>
  );
}
