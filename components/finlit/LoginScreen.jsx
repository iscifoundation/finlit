'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { api, setToken, ROLE_LABELS } from '@/lib/finlit/api';
import { ShieldCheck, ArrowRight, Mail, CheckCircle2 } from 'lucide-react';

const DEMO = [
  { mobile: '9000000001', role: 'admin', name: 'Mohit Modi' },
  { mobile: '9000000002', role: 'program_manager', name: 'Priya Sharma' },
  { mobile: '9000000003', role: 'branch_manager', name: 'Vijay Joshi' },
  { mobile: '9000000004', role: 'regional_office', name: 'Regional Manager' },
  { mobile: '9000000005', role: 'team', name: 'Amit Pawar' },
];

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [demoStep, setDemoStep] = useState(null); // { mobile, otp }
  const [demoOtpInput, setDemoOtpInput] = useState('');

  useEffect(() => {
    api('/settings').then(s => setDemoEnabled(s.demoLoginEnabled === true)).catch(() => setDemoEnabled(false));
    // Handle error redirects from magic link
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) {
      const msg = { invalid_link: 'Invalid or unknown link', link_used: 'This link has already been used', link_expired: 'This link has expired. Please request a new one.', user_not_found: 'User account not found' }[err] || err;
      toast.error(msg);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const sendMagicLink = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error('Enter a valid email address');
    setLoading(true);
    try {
      await api('/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }) });
      toast.success(`Magic link sent to ${email}`);
      setSent(true);
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  const sendDemo = async (mobile) => {
    setLoading(true);
    try {
      const r = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ mobile }) });
      setDemoStep({ mobile, otp: r.demoOtp });
      setDemoOtpInput(r.demoOtp);
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  const verifyDemo = async () => {
    setLoading(true);
    try {
      const r = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ mobile: demoStep.mobile, otp: demoOtpInput }) });
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
            {sent ? (
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto"><CheckCircle2 className="w-7 h-7 text-emerald-600" /></div>
                <div className="font-semibold text-slate-900">Check your inbox</div>
                <div className="text-sm text-slate-600">We sent a magic sign-in link to<br /><b>{email}</b></div>
                <div className="text-xs text-slate-500">The link expires in 15 minutes. Also check your spam folder if not received.</div>
                <Button variant="outline" onClick={() => { setSent(false); setEmail(''); }} className="w-full">Use different email</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Email address</label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <Input
                      type="email"
                      className="pl-9 h-11"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      onKeyDown={e => e.key === 'Enter' && sendMagicLink()}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">We&apos;ll email you a secure sign-in link. No password needed.</p>
                </div>
                <Button className="w-full h-11" onClick={sendMagicLink} disabled={loading}>
                  {loading ? 'Sending...' : <>Send magic link<ArrowRight className="w-4 h-4 ml-1" /></>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {demoEnabled && (
          <div className="mt-6">
            <div className="text-xs text-slate-400 text-center mb-2">Quick demo access (OTP-based, no email)</div>
            <div className="space-y-1.5">
              {DEMO.map(u => (
                <button key={u.mobile} onClick={() => sendDemo(u.mobile)} className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{ROLE_LABELS[u.role]}</div>
                    <div className="text-xs text-slate-400">{u.name} • {u.mobile}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        )}

        {demoStep && (
          <Card className="mt-4 border-slate-200">
            <CardContent className="p-4 space-y-3">
              <div className="text-sm">Enter OTP for +91 {demoStep.mobile}</div>
              <Input value={demoOtpInput} onChange={e => setDemoOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))} className="text-center tracking-widest text-lg h-11" />
              <div className="text-xs text-slate-500">Demo OTP: <b>123456</b></div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDemoStep(null)}>Cancel</Button>
                <Button onClick={verifyDemo} disabled={loading} className="flex-1">{loading ? 'Verifying...' : 'Sign In'}</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
