'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api, setToken } from '@/lib/finlit/api';
import { ShieldCheck, Lock, User as UserIcon, Eye, EyeOff } from 'lucide-react';

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  // Force password change step
  const [mustChange, setMustChange] = useState(false);
  const [tempSession, setTempSession] = useState(null); // { token, user }
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    // Clean any legacy error params from magic-link redirects
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const submitLogin = async () => {
    if (!username.trim() || !password) return toast.error('Enter username and password');
    setLoading(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: username.trim(), password }) });
      if (r.mustChangePassword) {
        setTempSession(r);
        setToken(r.token); // token needed to call change-password
        setMustChange(true);
        toast.info('Please set a new password to continue');
      } else {
        setToken(r.token);
        toast.success(`Welcome, ${r.user.name}`);
        onLogin(r.user);
      }
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  const submitChange = async () => {
    if (!newPassword || newPassword.length < 6) return toast.error('New password must be at least 6 characters');
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: password, newPassword }),
      });
      toast.success('Password updated. Signing you in...');
      onLogin({ ...tempSession.user, mustChangePassword: false });
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
            {!mustChange ? (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-slate-700">Username</Label>
                  <div className="relative mt-1.5">
                    <UserIcon className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <Input
                      className="pl-9 h-11"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="Admin or your email"
                      autoComplete="username"
                      onKeyDown={e => e.key === 'Enter' && document.getElementById('login-pw')?.focus()}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700">Password</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <Input
                      id="login-pw"
                      type={showPw ? 'text' : 'password'}
                      className="pl-9 pr-10 h-11"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Your password"
                      autoComplete="current-password"
                      onKeyDown={e => e.key === 'Enter' && submitLogin()}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button className="w-full h-11" onClick={submitLogin} disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
                <p className="text-[11px] text-slate-400 text-center pt-1">
                  Forgot your password? Ask your administrator to reset it.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center pb-2">
                  <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-2">
                    <Lock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="font-semibold text-slate-900">Set a new password</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Welcome{tempSession?.user?.name ? `, ${tempSession.user.name}` : ''}! You must change your temporary password before continuing.
                  </div>
                </div>
                <div>
                  <Label className="text-sm">New password</Label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="h-11 mt-1.5" placeholder="At least 6 characters" />
                </div>
                <div>
                  <Label className="text-sm">Confirm new password</Label>
                  <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="h-11 mt-1.5" onKeyDown={e => e.key === 'Enter' && submitChange()} />
                </div>
                <Button className="w-full h-11" onClick={submitChange} disabled={loading}>
                  {loading ? 'Updating...' : 'Set password & continue'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-[11px] text-slate-400 text-center mt-6">
          Contact your administrator if you need access.
        </div>
      </div>
    </div>
  );
}
