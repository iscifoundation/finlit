'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { api, setToken, ROLE_LABELS } from '@/lib/finlit/api';
import { ShieldCheck, ArrowRight } from 'lucide-react';

const DEMO = [
  { mobile: '9000000001', role: 'admin', name: 'Mohit Modi' },
  { mobile: '9000000002', role: 'program_manager', name: 'Priya Sharma' },
  { mobile: '9000000003', role: 'branch_manager', name: 'Vijay Joshi' },
  { mobile: '9000000004', role: 'regional_office', name: 'Regional Manager' },
  { mobile: '9000000005', role: 'team', name: 'Amit Pawar' },
];

export default function LoginScreen({ onLogin }) {
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const sendOtp = async (m) => {
    const t = m || mobile;
    if (!/^\d{10}$/.test(t)) return toast.error('Enter a 10-digit mobile number');
    setLoading(true);
    try {
      const r = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ mobile: t }) });
      toast.success(`OTP sent. Demo: ${r.demoOtp}`);
      setMobile(t); setOtp(r.demoOtp || ''); setStep('otp');
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(otp)) return toast.error('Enter 6-digit OTP');
    setLoading(true);
    try {
      const r = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ mobile, otp }) });
      setToken(r.token);
      toast.success(`Welcome, ${r.user.name}`);
      onLogin(r.user);
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground mb-4">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">FINLIT360</h1>
          <p className="text-sm text-slate-500 mt-1">ISCI Foundation • Campaign Management</p>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6">
            {step === 'mobile' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Mobile number</label>
                  <div className="flex mt-1.5">
                    <div className="px-3 flex items-center border border-r-0 border-slate-200 rounded-l-md bg-slate-50 text-sm text-slate-500">+91</div>
                    <Input
                      className="rounded-l-none h-11"
                      value={mobile}
                      onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit mobile"
                      onKeyDown={e => e.key === 'Enter' && sendOtp()}
                    />
                  </div>
                </div>
                <Button className="w-full h-11" onClick={() => sendOtp()} disabled={loading}>
                  {loading ? 'Sending...' : <>Continue<ArrowRight className="w-4 h-4 ml-1" /></>}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Enter OTP</label>
                  <Input
                    className="mt-1.5 h-11 text-center tracking-widest text-lg"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    onKeyDown={e => e.key === 'Enter' && verify()}
                  />
                  <p className="text-xs text-slate-500 mt-2">Sent to +91 {mobile}. Demo OTP: <b>123456</b></p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('mobile')} className="h-11">Back</Button>
                  <Button onClick={verify} disabled={loading} className="flex-1 h-11">{loading ? 'Verifying...' : 'Sign In'}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6">
          <div className="text-xs text-slate-400 text-center mb-2">Quick demo access</div>
          <div className="space-y-1.5">
            {DEMO.map(u => (
              <button key={u.mobile} onClick={() => sendOtp(u.mobile)} className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition">
                <div>
                  <div className="text-sm font-medium text-slate-800">{ROLE_LABELS[u.role]}</div>
                  <div className="text-xs text-slate-400">{u.name} • {u.mobile}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
