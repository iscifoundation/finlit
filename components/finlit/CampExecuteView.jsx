'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/finlit/api';
import { ArrowLeft, MapPin, Camera, Users, PlayCircle, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const REQUIRED_PHOTOS = [
  { key: 'venue', label: 'Venue' },
  { key: 'banner', label: 'Banner' },
  { key: 'session', label: 'Training Session' },
  { key: 'group', label: 'Group Photo' },
  { key: 'attendance_register', label: 'Attendance Register' },
];

async function compressImage(file, maxW = 1024, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function CampExecuteView({ campId, user, onBack }) {
  const [camp, setCamp] = useState(null);
  const [village, setVillage] = useState(null);
  const [gps, setGps] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [gpsDistance, setGpsDistance] = useState(null);
  const [attendance, setAttendance] = useState({ male: 0, female: 0, youth: 0, senior: 0, shg: 0, farmers: 0, students: 0, others: 0 });
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRefs = useRef({});

  const load = () => api(`/camps/${campId}`).then(async c => {
    setCamp(c);
    if (c.attendance) setAttendance({ ...attendance, ...c.attendance, total: undefined });
    if (c.remarks) setRemarks(c.remarks);
    if (c.villageId) {
      const villages = await api('/villages');
      setVillage(villages.find(v => v.id === c.villageId));
    }
  });

  useEffect(() => { load(); }, [campId]);

  const captureGps = () => {
    setGpsError(null);
    if (!navigator.geolocation) return setGpsError('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const g = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setGps(g);
        if (village) {
          const d = haversine(g.lat, g.lng, village.lat, village.lng);
          setGpsDistance(d);
        }
      },
      err => setGpsError(err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  const startCamp = async () => {
    if (!gps) return toast.error('Capture GPS location first');
    setBusy(true);
    try {
      const updated = await api(`/camps/${campId}/start`, {
        method: 'POST',
        body: JSON.stringify({ gps, deviceInfo: { ua: navigator.userAgent, online: navigator.onLine } }),
      });
      setCamp(updated);
      toast.success('Camp started – GPS captured');
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const uploadPhoto = async (category, file) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = await compressImage(file);
      const updated = await api(`/camps/${campId}/photos`, {
        method: 'POST',
        body: JSON.stringify({ photos: [{ category, data, gps }] }),
      });
      setCamp(updated);
      toast.success(`${category} photo uploaded`);
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const saveAttendance = async () => {
    setBusy(true);
    try {
      const updated = await api(`/camps/${campId}/attendance`, { method: 'POST', body: JSON.stringify({ attendance }) });
      setCamp(updated);
      toast.success('Attendance saved');
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const submitCamp = async () => {
    setBusy(true);
    try {
      await saveAttendance();
      const updated = await api(`/camps/${campId}/submit`, { method: 'POST', body: JSON.stringify({ gps, remarks }) });
      setCamp(updated);
      toast.success('Camp submitted – pending verification');
      onBack();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  if (!camp) return <div>Loading...</div>;

  const photoStatus = REQUIRED_PHOTOS.map(rp => ({
    ...rp, uploaded: (camp.photos || []).some(p => p.category === rp.key),
  }));
  const uploadedCount = (camp.photos || []).length;
  const total = Object.values(attendance).reduce((a, b) => a + (+b || 0), 0);
  const gpsFarOff = gpsDistance !== null && gpsDistance > 500;

  const started = ['in_progress', 'completed', 'verified'].includes(camp.status);

  return (
    <div className="max-w-2xl mx-auto space-y-3 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
        <div className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{camp.code}</div>
        <Badge className="bg-orange-500 hover:bg-orange-500">FIELD EXECUTION</Badge>
      </div>

      {/* Step 1: GPS + Start */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" />Step 1 – GPS Capture &amp; Start</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {village && (
            <div className="text-sm text-slate-600">Planned village: <b>{village.name}</b> ({village.lat.toFixed(4)}, {village.lng.toFixed(4)})</div>
          )}
          <Button onClick={captureGps} variant="outline" className="w-full"><MapPin className="w-4 h-4 mr-1" />Capture Current GPS</Button>
          {gpsError && <div className="text-xs text-red-600">{gpsError}</div>}
          {gps && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm">
              <div>📍 {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} (±{Math.round(gps.accuracy)}m)</div>
              {gpsDistance !== null && (
                <div className={`text-xs mt-1 ${gpsFarOff ? 'text-red-700' : 'text-emerald-700'}`}>
                  {gpsFarOff ? <AlertTriangle className="w-3 h-3 inline mr-1" /> : <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                  Distance from planned village: {Math.round(gpsDistance)} m {gpsFarOff && '– GPS MISMATCH! Please explain in remarks.'}
                </div>
              )}
            </div>
          )}
          {!started ? (
            <Button onClick={startCamp} disabled={!gps || busy} className="w-full bg-emerald-600 hover:bg-emerald-700"><PlayCircle className="w-4 h-4 mr-1" />Start Camp</Button>
          ) : (
            <div className="text-emerald-600 text-sm flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />Camp started at {camp.startedAt ? new Date(camp.startedAt).toLocaleTimeString() : '—'}</div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Attendance */}
      <Card className={!started ? 'opacity-60 pointer-events-none' : ''}>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" />Step 2 – Attendance</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['male', 'Male'], ['female', 'Female'], ['youth', 'Youth'], ['senior', 'Senior Citizens'],
              ['shg', 'SHG Members'], ['farmers', 'Farmers'], ['students', 'Students'], ['others', 'Others'],
            ].map(([k, label]) => (
              <div key={k}>
                <Label className="text-xs">{label}</Label>
                <Input type="number" min="0" value={attendance[k] || 0} onChange={e => setAttendance({ ...attendance, [k]: +e.target.value })} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm">Total: <b>{total}</b></div>
            <Button size="sm" variant="outline" onClick={saveAttendance} disabled={busy}>Save</Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Photos */}
      <Card className={!started ? 'opacity-60 pointer-events-none' : ''}>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Camera className="w-4 h-4" />Step 3 – Upload Photos (min 5 required)</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-2"><Progress value={(uploadedCount / 5) * 100} /><div className="text-xs text-slate-500 mt-1">{uploadedCount} / 5 uploaded</div></div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {photoStatus.map(p => (
              <div key={p.key} className="space-y-1">
                <div className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden bg-slate-50 relative">
                  {p.uploaded ? (
                    (() => {
                      const ph = (camp.photos || []).find(x => x.category === p.key);
                      return ph?.data ? <img src={ph.data} className="w-full h-full object-cover" alt={p.label} /> : <CheckCircle2 className="w-8 h-8 text-emerald-600" />;
                    })()
                  ) : (
                    <Camera className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <input
                  ref={el => fileRefs.current[p.key] = el}
                  type="file" accept="image/*" capture="environment" hidden
                  onChange={e => uploadPhoto(p.key, e.target.files?.[0])}
                />
                <Button size="sm" variant={p.uploaded ? 'outline' : 'default'} className="w-full text-xs" onClick={() => fileRefs.current[p.key]?.click()} disabled={busy}>
                  {p.uploaded ? 'Replace' : 'Upload'} {p.label}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 4: Remarks */}
      <Card className={!started ? 'opacity-60 pointer-events-none' : ''}>
        <CardHeader className="pb-2"><CardTitle className="text-base">Step 4 – Field Remarks</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Challenges, feedback, suggestions, special observations..." />
        </CardContent>
      </Card>

      {/* Step 5: Submit */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t p-3 flex gap-2 z-10">
        <Button variant="outline" onClick={onBack}>Save &amp; Exit</Button>
        <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={submitCamp} disabled={busy || !started || uploadedCount < 5 || total === 0}>
          <Send className="w-4 h-4 mr-1" />Finish &amp; Submit Camp
        </Button>
      </div>
    </div>
  );
}
