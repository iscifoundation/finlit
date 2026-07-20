'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/finlit/api';
import { toast } from 'sonner';
import { Route as RouteIcon, MapPin } from 'lucide-react';

function haversine(a, b) {
  const R = 6371;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function RoutePlanningView({ user }) {
  const [villages, setVillages] = useState([]);
  const [teams, setTeams] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [selected, setSelected] = useState({});
  const [districtFilter, setDistrictFilter] = useState('');
  const [teamId, setTeamId] = useState('');
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [routeName, setRouteName] = useState('Route ' + new Date().toISOString().slice(0, 10));

  useEffect(() => {
    Promise.all([api('/villages'), api('/teams'), api('/districts')]).then(([v, t, d]) => {
      setVillages(v); setTeams(t); setDistricts(d);
      setDistrictFilter(d[0]?.id || '');
    });
  }, []);

  const filtered = villages.filter(v => !districtFilter || v.districtId === districtFilter);
  const selectedList = filtered.filter(v => selected[v.id]);

  // simple nearest-neighbour sequencing
  const sequenced = useMemo(() => {
    if (selectedList.length === 0) return [];
    const remaining = [...selectedList];
    const ordered = [remaining.shift()];
    while (remaining.length) {
      const last = ordered[ordered.length - 1];
      remaining.sort((a, b) => haversine(last, a) - haversine(last, b));
      ordered.push(remaining.shift());
    }
    return ordered;
  }, [selectedList]);

  const totalKm = sequenced.reduce((acc, v, i) => i === 0 ? 0 : acc + haversine(sequenced[i-1], v), 0);
  const estTime = Math.round(totalKm * 3 + sequenced.length * 60); // rough mins
  const fuel = Math.round(totalKm / 12); // liters at 12 kmpl

  const saveRoute = async () => {
    if (!teamId || sequenced.length === 0) return toast.error('Select villages and a team');
    try {
      await api('/routes', {
        method: 'POST',
        body: JSON.stringify({
          name: routeName, date, districtId: districtFilter, teamId,
          villageIds: sequenced.map(v => v.id),
          totalDistance: Math.round(totalKm * 10) / 10,
          estimatedTime: estTime,
          fuelEstimate: fuel,
        }),
      });
      toast.success('Route saved');
      setSelected({});
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" />Select Villages</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-3">
            <Select value={districtFilter} onValueChange={setDistrictFilter}>
              <SelectTrigger><SelectValue placeholder="District" /></SelectTrigger>
              <SelectContent>{districts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            {filtered.map(v => (
              <label key={v.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 cursor-pointer">
                <Checkbox checked={!!selected[v.id]} onCheckedChange={(c) => setSelected({ ...selected, [v.id]: c })} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{v.name}</div>
                  <div className="text-xs text-slate-500">{v.panchayat} • {v.lat.toFixed(4)}, {v.lng.toFixed(4)}</div>
                </div>
                <div className="text-xs text-slate-400">Est. {v.expectedAudience}</div>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><RouteIcon className="w-4 h-4" />Optimized Route</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded bg-blue-50"><div className="text-xs text-blue-700">Villages</div><div className="font-bold text-blue-900">{sequenced.length}</div></div>
            <div className="p-2 rounded bg-emerald-50"><div className="text-xs text-emerald-700">Distance</div><div className="font-bold text-emerald-900">{totalKm.toFixed(1)} km</div></div>
            <div className="p-2 rounded bg-amber-50"><div className="text-xs text-amber-700">Fuel</div><div className="font-bold text-amber-900">{fuel} L</div></div>
          </div>

          <ol className="space-y-1 text-sm">
            {sequenced.map((v, i) => (
              <li key={v.id} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center">{i + 1}</div>
                <span>{v.name}</span>
              </li>
            ))}
            {sequenced.length === 0 && <div className="text-xs text-slate-400">Select villages on the left</div>}
          </ol>

          <div><Label>Route Name</Label><Input value={routeName} onChange={e => setRouteName(e.target.value)} /></div>
          <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div>
            <Label>Assign Team</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
              <SelectContent>{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <Button onClick={saveRoute} className="w-full">Save Route</Button>
        </CardContent>
      </Card>
    </div>
  );
}
