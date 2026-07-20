'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { api, CAMP_STATUS_META, ROLE_LABELS } from '@/lib/finlit/api';
import { Tent, Building2, Landmark, Users, CheckCircle2, Clock, MapPin, Camera, TrendingUp, IndianRupee } from 'lucide-react';

const StatCard = ({ Icon, label, value, sub, color = 'text-primary' }) => (
  <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-lg bg-slate-50 flex items-center justify-center ${color}`}><Icon className="w-5 h-5" /></div>
      <div>
        <div className="text-2xl font-bold text-slate-800 leading-tight">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
        {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
      </div>
    </CardContent>
  </Card>
);

export default function DashboardView({ user, onOpenCamp, setView }) {
  const [data, setData] = useState(null);
  const [camps, setCamps] = useState([]);

  useEffect(() => {
    api('/dashboard').then(setData).catch(() => {});
    api('/camps').then(setCamps).catch(() => {});
  }, []);

  if (!data) return <div className="animate-pulse text-slate-400">Loading dashboard...</div>;

  const c = data.counts;
  const upcoming = camps.filter(x => ['awaiting_confirmation', 'confirmed', 'representative_assigned', 'team_assigned', 'scheduled'].includes(x.status)).slice(0, 5);
  const recent = [...camps].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Welcome */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
        <div>
          <div className="text-2xl font-bold text-slate-800">Welcome back, {user.name.split(' ')[0]} 👋</div>
          <div className="text-sm text-slate-500">Logged in as <b>{ROLE_LABELS[user.role]}</b> • {new Date().toDateString()}</div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1"><MapPin className="w-3 h-3" />GPS: {data.compliance.gps}%</Badge>
          <Badge variant="outline" className="gap-1"><Camera className="w-3 h-3" />Photos: {data.compliance.photos}%</Badge>
          <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="w-3 h-3" />Completion: {data.compliance.completion}%</Badge>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard Icon={Tent} label="Total Camps" value={c.total} color="text-blue-600" />
        <StatCard Icon={CheckCircle2} label="Completed" value={c.completed} color="text-emerald-600" />
        <StatCard Icon={Clock} label="Today's Camps" value={c.todaysCount} color="text-orange-600" />
        <StatCard Icon={Users} label="Beneficiaries" value={c.beneficiaries.toLocaleString()} color="text-purple-600" />
        <StatCard Icon={Users} label="Women" value={c.women.toLocaleString()} color="text-pink-600" sub={c.beneficiaries ? `${Math.round(c.women/c.beneficiaries*100)}%` : ''} />
        <StatCard Icon={Landmark} label="Banks / Branches" value={`${c.banks} / ${c.branches}`} color="text-indigo-600" />
      </div>

      {/* Progress + status pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Camp Pipeline</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(data.byStatus).filter(([, v]) => v > 0).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between p-2 rounded-lg border border-slate-200">
                  <span className={`text-xs px-2 py-1 rounded ${CAMP_STATUS_META[k]?.color || ''}`}>{CAMP_STATUS_META[k]?.label || k}</span>
                  <span className="font-semibold text-slate-700">{v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Compliance</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1"><span>GPS-tagged camps</span><span className="font-medium">{data.compliance.gps}%</span></div>
              <Progress value={data.compliance.gps} />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1"><span>Photo evidence</span><span className="font-medium">{data.compliance.photos}%</span></div>
              <Progress value={data.compliance.photos} />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1"><span>Completion rate</span><span className="font-medium">{data.compliance.completion}%</span></div>
              <Progress value={data.compliance.completion} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex-row justify-between items-center">
            <CardTitle className="text-base">Upcoming Camps</CardTitle>
            <button className="text-xs text-primary" onClick={() => setView('camps')}>View all &rarr;</button>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 && <div className="text-sm text-slate-400">No upcoming camps.</div>}
            {upcoming.map(c => (
              <button key={c.id} onClick={() => onOpenCamp(c.id)} className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-primary hover:bg-primary/5 transition">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500">{c.code}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${CAMP_STATUS_META[c.status]?.color}`}>{CAMP_STATUS_META[c.status]?.label}</span>
                  <span className="ml-auto text-xs text-slate-500">{c.proposedDate ? new Date(c.proposedDate).toLocaleDateString() : '—'}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex-row justify-between items-center">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <button className="text-xs text-primary" onClick={() => setView('camps')}>View all &rarr;</button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.map(c => (
              <button key={c.id} onClick={() => onOpenCamp(c.id)} className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-primary hover:bg-primary/5 transition">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500">{c.code}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${CAMP_STATUS_META[c.status]?.color}`}>{CAMP_STATUS_META[c.status]?.label}</span>
                  <span className="ml-auto text-xs text-slate-500">{new Date(c.updatedAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
