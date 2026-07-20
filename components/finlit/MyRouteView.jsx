'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, CAMP_STATUS_META } from '@/lib/finlit/api';
import { MapPin, Navigation, PlayCircle, Route as RouteIcon } from 'lucide-react';

export default function MyRouteView({ user, onExecute, onOpenCamp }) {
  const [camps, setCamps] = useState([]);
  const [villages, setVillages] = useState([]);

  useEffect(() => {
    Promise.all([api('/camps'), api('/villages')]).then(([c, v]) => { setCamps(c); setVillages(v); });
  }, []);

  const today = new Date().toDateString();
  const todaysCamps = camps.filter(c => c.proposedDate && new Date(c.proposedDate).toDateString() === today);
  const upcoming = camps.filter(c => c.proposedDate && new Date(c.proposedDate) > new Date() && ['scheduled', 'team_assigned'].includes(c.status)).slice(0, 5);
  const allToShow = todaysCamps.length ? todaysCamps : upcoming;

  const totalDistance = allToShow.length > 1 ? allToShow.length * 12 : 0; // rough estimate
  const estTime = allToShow.length * 45; // min

  return (
    <div className="space-y-4">
      <Card className="finlit-hero-gradient text-white border-0">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs opacity-90"><RouteIcon className="w-4 h-4" />TODAY&apos;S ROUTE</div>
          <div className="text-2xl font-bold mt-1">{allToShow.length} villages planned</div>
          <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
            <div><div className="opacity-75 text-xs">Distance</div><div className="font-bold">~{totalDistance} km</div></div>
            <div><div className="opacity-75 text-xs">Est. Time</div><div className="font-bold">~{Math.floor(estTime / 60)}h {estTime % 60}m</div></div>
            <div><div className="opacity-75 text-xs">Fuel Est.</div><div className="font-bold">~{Math.round(totalDistance * 8)}</div></div>
          </div>
        </CardContent>
      </Card>

      {allToShow.length === 0 && (
        <div className="text-center py-10 text-slate-400">No camps assigned today.</div>
      )}

      <div className="space-y-2">
        {allToShow.map((c, idx) => {
          const v = villages.find(vv => vv.id === c.villageId);
          return (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{v?.name}</div>
                      <Badge className={`${CAMP_STATUS_META[c.status]?.color} border-0 hover:bg-inherit`}>{CAMP_STATUS_META[c.status]?.label}</Badge>
                    </div>
                    <div className="text-xs text-slate-500">{v?.panchayat} • {c.code} • Expected: {c.expectedAudience}</div>
                    {v && <div className="text-xs text-slate-400 mt-1"><MapPin className="w-3 h-3 inline" /> {v.lat.toFixed(4)}, {v.lng.toFixed(4)}</div>}
                  </div>
                  <div className="flex flex-col gap-1">
                    {v && <Button size="sm" variant="outline" asChild><a href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`} target="_blank" rel="noreferrer"><Navigation className="w-4 h-4 mr-1" />Navigate</a></Button>}
                    <Button size="sm" onClick={() => onExecute(c.id)} className="bg-emerald-600 hover:bg-emerald-700"><PlayCircle className="w-4 h-4 mr-1" />Start</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
