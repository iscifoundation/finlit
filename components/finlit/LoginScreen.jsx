'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api, setToken, ROLE_LABELS } from '@/lib/finlit/api';
import { ShieldCheck, Landmark, MapPin, Users, Camera, BarChart3 } from 'lucide-react';

const DEMO_USERS = [
  { mobile: '9000000001', role: 'super_admin' },
  { mobile: '9000000002', role: 'program_manager' },
  { mobile: '9000000003', role: 'district_coordinator' },
  { mobile: '9000000004', role: 'route_planner' },
  { mobile: '9000000005', role: 'branch_manager' },
  { mobile: '9000000006', role: 'bank_rep' },
  { mobile: '9000000007', role: 'team_leader' },
  { mobile: '9000000008', role: 'field_trainer' },
  { mobile: '9000000009', role: 'regional_office' },
  { mobile: '9000000010', role: 'bank_hq' },
];

export default function LoginScreen({ onLogin }) {
  const [step, setStep] = useState('mobile'); // mobile | otp
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const sendOtp = async (m) => {
    const target = m || mobile;
    if (!/^\d{10}$/.test(target)) return toast.error('Enter a 10-digit mobile number');
    setLoading(true);
    try {
      const res = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ mobile: target }) });
      toast.success(`OTP sent to +91 ${target}. Demo OTP: ${res.demoOtp}`);
      setMobile(target);
      setOtp(res.demoOtp || '');
      setStep('otp');
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) return toast.error('Enter 6-digit OTP');
    setLoading(true);
    try {
      const res = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ mobile, otp }) });
      setToken(res.token);
      toast.success(`Welcome, ${res.user.name}`);
      onLogin(res.user);
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row">
      {/* Left branding */}
      <div className="finlit-hero-gradient text-white lg:w-1/2 p-8 lg:p-14 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">FINLIT360</div>
              <div className="text-xs text-white/70">ISCI Foundation</div>
            </div>
          </div>
          <h1 className="mt-10 text-3xl lg:text-4xl font-bold leading-tight">Financial Literacy Campaign Management</h1>
          <p className="mt-4 text-white/80 max-w-lg">Enterprise-grade platform to plan, execute, verify and report Financial Literacy Awareness Camps conducted on behalf of banks &mdash; with GPS-tagged evidence and complete audit trails.</p>

          <div className="mt-10 grid grid-cols-2 gap-4 max-w-lg">
            {[
              { Icon: Landmark, t: 'Multi-Bank & Multi-Project' },
              { Icon: MapPin, t: 'GPS-tagged execution' },
              { Icon: Users, t: 'Role-based dashboards' },
              { Icon: Camera, t: 'Photo + attendance evidence' },
              { Icon: BarChart3, t: 'Real-time analytics' },
              { Icon: ShieldCheck, t: 'Immutable audit trail' },
            ].map(({ Icon, t }, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Icon className="w-4 h-4 text-emerald-300" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-white/60 mt-10">&copy; 2025 ISCI Foundation. All rights reserved.</div>
      </div>

      {/* Right login */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 bg-slate-50">
        <Card className="w-full max-w-md shadow-xl border-slate-200">
          <CardHeader>
            <CardTitle className="text-2xl">Sign in to FINLIT360</CardTitle>
            <CardDescription>Login with your registered mobile number.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 'mobile' ? (
              <>
                <div>
                  <Label htmlFor="mobile">Mobile number</Label>
                  <div className="flex mt-1.5">
                    <div className="px-3 flex items-center border rounded-l-md bg-slate-100 text-sm">+91</div>
                    <Input id="mobile" className="rounded-l-none" value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" />
                  </div>
                </div>
                <Button className="w-full" onClick={() => sendOtp()} disabled={loading}>{loading ? 'Sending...' : 'Send OTP'}</Button>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="otp">Enter 6-digit OTP</Label>
                  <Input id="otp" className="mt-1.5 tracking-widest text-center text-lg" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" />
                  <p className="text-xs text-muted-foreground mt-1">Sent to +91 {mobile}. Demo OTP is <b>123456</b>.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('mobile')}>Back</Button>
                  <Button className="flex-1" onClick={verifyOtp} disabled={loading}>{loading ? 'Verifying...' : 'Verify & Continue'}</Button>
                </div>
              </>
            )}

            <div className="pt-3 mt-3 border-t">
              <div className="text-xs text-slate-500 mb-2">Quick demo login (all 10 roles pre-seeded):</div>
              <div className="grid grid-cols-2 gap-1.5">
                {DEMO_USERS.map(u => (
                  <button key={u.mobile} onClick={() => sendOtp(u.mobile)} className="text-left text-xs px-2 py-1.5 rounded border border-slate-200 hover:border-primary hover:bg-primary/5 transition">
                    <div className="font-medium text-slate-700">{ROLE_LABELS[u.role]}</div>
                    <div className="text-slate-400">{u.mobile}</div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
