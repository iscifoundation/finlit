'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { api, setToken, ROLE_LABELS } from '@/lib/finlit/api';
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase-client';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { ShieldCheck, ArrowRight } from 'lucide-react';

const DEMO = [
  { mobile: '9000000001', role: 'admin', name: 'Mohit Modi' },
  { mobile: '9000000002', role: 'program_manager', name: 'Priya Sharma' },
  { mobile: '9000000003', role: 'branch_manager', name: 'Vijay Joshi' },
  { mobile: '9000000004', role: 'regional_office', name: 'Regional Manager' },
  { mobile: '9000000005', role: 'team', name: 'Amit Pawar' },
];
const DEMO_MOBILES = new Set(DEMO.map(d => d.mobile));

export default function LoginScreen({ onLogin }) {
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [flow, setFlow] = useState('firebase'); // 'firebase' | 'demo'
  const [showRecaptcha, setShowRecaptcha] = useState(false);
  const confirmationRef = useRef(null);
  const recaptchaRef = useRef(null);

  const useFirebase = isFirebaseConfigured();

  useEffect(() => {
    return () => {
      // Cleanup reCAPTCHA on unmount
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch { /* ignore */ }
      }
    };
  }, []);

  const sendFirebaseOtp = async (m) => {
    const target = m || mobile;
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('Firebase not configured');
      // Reset any existing recaptcha
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch { /* ignore */ }
        recaptchaRef.current = null;
      }
      const container = document.getElementById('recaptcha-container');
      if (container) container.innerHTML = '';
      
      // Show recaptcha container and wait for DOM update
      setShowRecaptcha(true);
      
      // Wait for next tick to ensure DOM is updated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'normal',
        callback: () => { /* solved */ },
        'expired-callback': () => { toast.error('Security check expired. Please try again.'); },
      });
      await recaptchaRef.current.render();
      const confirmation = await signInWithPhoneNumber(auth, `+91${target}`, recaptchaRef.current);
      confirmationRef.current = confirmation;
      toast.success(`OTP sent to +91 ${target}`);
      setMobile(target); setOtp(''); setStep('otp'); setFlow('firebase'); setShowRecaptcha(false);
    } catch (e) {
      const msg = String(e?.code || e?.message || e);
      let friendly = msg;
      if (msg.includes('unauthorized-domain')) friendly = 'This domain is not authorized in your Firebase project. Add it in Firebase Console → Authentication → Settings → Authorized domains.';
      else if (msg.includes('invalid-phone-number')) friendly = 'Invalid phone number format.';
      else if (msg.includes('quota-exceeded')) friendly = 'Daily SMS quota exceeded. Try again tomorrow or increase quota in Firebase Console.';
      else if (msg.includes('too-many-requests')) friendly = 'Too many attempts. Please wait a few minutes and try again.';
      else if (msg.includes('captcha-check-failed') || msg.includes('recaptcha')) friendly = 'Security check failed. Please try again.';
      toast.error(friendly);
      setShowRecaptcha(false);
      if (recaptchaRef.current) { try { recaptchaRef.current.clear(); } catch { /* ignore */ } recaptchaRef.current = null; }
    }
    setLoading(false);
  };

  const sendDemoOtp = async (m) => {
    const target = m || mobile;
    setLoading(true);
    try {
      const r = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ mobile: target }) });
      toast.success(`Demo OTP: ${r.demoOtp}`);
      setMobile(target); setOtp(r.demoOtp || ''); setStep('otp'); setFlow('demo');
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  const startSend = async (m) => {
    const target = m || mobile;
    if (!/^\d{10}$/.test(target)) return toast.error('Enter a 10-digit mobile number');
    // Demo mobiles always use demo OTP path (fast, no real SMS)
    if (DEMO_MOBILES.has(target) || !useFirebase) return sendDemoOtp(target);
    return sendFirebaseOtp(target);
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(otp)) return toast.error('Enter 6-digit OTP');
    setLoading(true);
    try {
      if (flow === 'firebase' && confirmationRef.current) {
        const result = await confirmationRef.current.confirm(otp);
        const idToken = await result.user.getIdToken();
        const r = await api('/auth/firebase-verify', { method: 'POST', body: JSON.stringify({ idToken }) });
        setToken(r.token);
        toast.success(`Welcome, ${r.user.name}`);
        onLogin(r.user);
      } else {
        const r = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ mobile, otp }) });
        setToken(r.token);
        toast.success(`Welcome, ${r.user.name}`);
        onLogin(r.user);
      }
    } catch (e) {
      toast.error(e.message.replace('auth/', '').replace(/-/g, ' '));
    }
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
                      onKeyDown={e => e.key === 'Enter' && startSend()}
                    />
                  </div>
                  {useFirebase && !DEMO_MOBILES.has(mobile) && mobile.length === 10 && (
                    <p className="text-[11px] text-emerald-700 mt-1">A real SMS OTP will be sent via Firebase</p>
                  )}
                </div>
                {showRecaptcha && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="text-xs text-blue-900 mb-2 font-medium">🔒 Please complete the security check below to receive your OTP:</div>
                    <div id="recaptcha-container" className="flex justify-center"></div>
                  </div>
                )}
                <Button className="w-full h-11" onClick={() => startSend()} disabled={loading}>
                  {loading ? (showRecaptcha ? 'Waiting for verification...' : 'Sending...') : <>Continue<ArrowRight className="w-4 h-4 ml-1" /></>}
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
                    placeholder="6-digit code"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && verify()}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Sent to +91 {mobile}. {flow === 'demo' ? <>Demo OTP: <b>123456</b></> : 'Check your SMS'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setStep('mobile'); setOtp(''); }} className="h-11">Back</Button>
                  <Button onClick={verify} disabled={loading} className="flex-1 h-11">{loading ? 'Verifying...' : 'Sign In'}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6">
          <div className="text-xs text-slate-400 text-center mb-2">Quick demo access (no real SMS)</div>
          <div className="space-y-1.5">
            {DEMO.map(u => (
              <button key={u.mobile} onClick={() => sendDemoOtp(u.mobile)} className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition">
                <div>
                  <div className="text-sm font-medium text-slate-800">{ROLE_LABELS[u.role]}</div>
                  <div className="text-xs text-slate-400">{u.name} • {u.mobile}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </div>
        </div>

        {/* Firebase reCAPTCHA hidden fallback container (unused when visible one is rendered) */}
        <div id="recaptcha-fallback" style={{ display: 'none' }}></div>
      </div>
    </div>
  );
}
