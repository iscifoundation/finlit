'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import { api } from '@/lib/finlit/api';
import { MapPin } from 'lucide-react';

const COLORS = ['hsl(217,91%,45%)', 'hsl(142,71%,45%)', 'hsl(38,92%,50%)', 'hsl(271,91%,65%)', 'hsl(340,82%,52%)', 'hsl(180,71%,45%)', 'hsl(20,91%,55%)', 'hsl(280,71%,55%)'];

export default function AnalyticsView() {
  const [data, setData] = useState(null);
  useEffect(() => { api('/analytics').then(setData); }, []);
  if (!data) return <div className="text-slate-400">Loading analytics...</div>;

  return (
    <div className="space-y-4">
      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">District-wise Progress</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.byDistrict}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="allocated" fill="hsl(217,91%,45%)" name="Allocated" />
                <Bar dataKey="completed" fill="hsl(142,71%,45%)" name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Branch-wise Progress</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.byBranch} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="allocated" fill="hsl(217,91%,45%)" />
                <Bar dataKey="completed" fill="hsl(142,71%,45%)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Daily Camp Trend (last 14 days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="scheduled" stroke="hsl(217,91%,45%)" strokeWidth={2} />
                <Line type="monotone" dataKey="completed" stroke="hsl(142,71%,45%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Beneficiary Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.beneficiaryDist.filter(x => x.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={80} label={(e) => e.name}>
                  {data.beneficiaryDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Team Performance</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.byTeam}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="allocated" fill="hsl(271,91%,65%)" />
              <Bar dataKey="completed" fill="hsl(142,71%,45%)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" />Completed Camp Locations</CardTitle></CardHeader>
        <CardContent>
          {data.locations.length === 0 ? (
            <div className="text-sm text-slate-400">No completed camps yet.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {data.locations.map((l, i) => (
                <a key={i} href={`https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}#map=13/${l.lat}/${l.lng}`} target="_blank" rel="noreferrer" className="p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition text-sm">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-slate-500">{l.code} • {l.status}</div>
                  <div className="text-[11px] text-slate-400">{l.lat.toFixed(4)}, {l.lng.toFixed(4)} ⇄ View on map</div>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
