import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

function cors(r) {
  r.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*');
  r.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  r.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return r;
}
export async function OPTIONS() { return cors(new NextResponse(null, { status: 200 })); }

const ROLES = {
  ADMIN: 'admin',
  PROGRAM_MANAGER: 'program_manager',
  BRANCH_MANAGER: 'branch_manager',
  REGIONAL_OFFICE: 'regional_office',
  TEAM: 'team',
};

const DEMO_OTP = '123456';
const PRIMARY_ADMIN_EMAIL = 'info@iscifoundation.org';
const PRIMARY_ADMIN_USERNAME = 'Admin';
const PRIMARY_ADMIN_DEFAULT_PW = 'Password';
const PRIMARY_ADMIN_NAME = 'Mohit Modi';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = d => { if (!d) return d; const { _id, passwordHash, ...r } = d; return r; };
const cleanArr = a => a.map(clean);

function hashPw(pw) { return bcrypt.hashSync(String(pw), 10); }
function checkPw(pw, hash) { try { return bcrypt.compareSync(String(pw), String(hash || '')); } catch { return false; } }
function genPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  // ensure at least one digit and one letter
  if (!/\d/.test(out)) out = out.slice(0, -1) + '7';
  if (!/[a-zA-Z]/.test(out)) out = 'A' + out.slice(1);
  return out;
}

async function audit(db, { userId, action, entityType, entityId, before, after }) {
  await db.collection('audit_logs').insertOne({
    id: uuidv4(), userId, action, entityType, entityId,
    before: before || null, after: after || null, timestamp: new Date(),
  });
}

async function notify(db, userIds, { type, title, message, programId, meta }) {
  const arr = (Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean);
  if (!arr.length) return;
  await db.collection('notifications').insertMany(arr.map(uid => ({
    id: uuidv4(), userId: uid, type, title, message,
    programId: programId || null, meta: meta || null, read: false, createdAt: new Date(),
  })));
}

async function timeline(db, programId, event, userId, message) {
  await db.collection('programs').updateOne(
    { id: programId },
    { $push: { timeline: { id: uuidv4(), event, by: userId, message, timestamp: new Date() } }, $set: { updatedAt: new Date() } }
  );
}

async function getUser(request, db) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const s = await db.collection('sessions').findOne({ token });
  if (!s || new Date(s.expiresAt) < new Date()) return null;
  return db.collection('users').findOne({ id: s.userId });
}

// ---------- Seed / Migration ----------
let seeded = false;
async function seedIfEmpty(db) {
  if (seeded) return;
  const now = new Date();

  // ONE-TIME MIGRATION: wipe legacy demo/random seed data so the app starts clean for production.
  const wipedFlag = await db.collection('settings').findOne({ key: 'demoDataWiped_v3' });
  if (!wipedFlag) {
    await db.collection('users').deleteMany({ isDemo: true });
    // Purge sample tenant + operational data from earlier seeds
    for (const c of ['banks', 'regional_offices', 'districts', 'branches', 'villages', 'teams',
      'programs', 'invoices', 'expenses', 'attendance', 'messages', 'notifications',
      'audit_logs', 'salary_payments', 'magic_links', 'otp_sessions', 'sessions']) {
      await db.collection(c).deleteMany({});
    }
    await db.collection('settings').updateOne(
      { key: 'demoDataWiped_v3' },
      { $set: { key: 'demoDataWiped_v3', value: true, at: now } },
      { upsert: true }
    );
    console.log('[FINLIT360] Cleared legacy demo/random seed data');
  }

  // Ensure primary admin exists (idempotent) — with username=Admin / password=Password / mustChangePassword=true
  const primary = await db.collection('users').findOne({ $or: [{ username: PRIMARY_ADMIN_USERNAME }, { email: PRIMARY_ADMIN_EMAIL }] });
  if (!primary) {
    const existingAdmin = await db.collection('users').findOne({ role: ROLES.ADMIN });
    const passwordHash = hashPw(PRIMARY_ADMIN_DEFAULT_PW);
    if (existingAdmin) {
      await db.collection('users').updateOne(
        { id: existingAdmin.id },
        { $set: {
          username: PRIMARY_ADMIN_USERNAME,
          email: PRIMARY_ADMIN_EMAIL,
          name: existingAdmin.name || PRIMARY_ADMIN_NAME,
          passwordHash, mustChangePassword: true,
          isDemo: false, updatedAt: now,
        } }
      );
      console.log(`[FINLIT360] Migrated existing admin -> username="${PRIMARY_ADMIN_USERNAME}"`);
    } else {
      await db.collection('users').insertOne({
        id: uuidv4(),
        username: PRIMARY_ADMIN_USERNAME,
        name: PRIMARY_ADMIN_NAME,
        email: PRIMARY_ADMIN_EMAIL,
        mobile: null,
        role: ROLES.ADMIN,
        passwordHash,
        mustChangePassword: true,
        isDemo: false,
        createdAt: now,
      });
      console.log(`[FINLIT360] Bootstrapped primary admin username="${PRIMARY_ADMIN_USERNAME}" password="${PRIMARY_ADMIN_DEFAULT_PW}"`);
    }
  } else {
    // Ensure username field exists on the primary admin document
    if (!primary.username || !primary.passwordHash) {
      await db.collection('users').updateOne(
        { id: primary.id },
        { $set: {
          username: PRIMARY_ADMIN_USERNAME,
          passwordHash: primary.passwordHash || hashPw(PRIMARY_ADMIN_DEFAULT_PW),
          mustChangePassword: primary.mustChangePassword ?? true,
          updatedAt: now,
        } }
      );
    }
  }

  seeded = true;
}

// ------- Router -------
async function handle(request, { params }) {
  const { path = [] } = await params;
  const route = `/${path.join('/')}`;
  const method = request.method;

  try {
    const db = await getDb();
    await seedIfEmpty(db);

    if (route === '/' || route === '/root') {
      return cors(NextResponse.json({ message: 'FINLIT360 API v2', version: '2.0.0' }));
    }

    // AUTH
    if (route === '/auth/send-otp' && method === 'POST') {
      const { mobile } = await request.json();
      if (!/^\d{10}$/.test(mobile || '')) return cors(NextResponse.json({ error: 'Enter a valid 10-digit mobile number' }, { status: 400 }));
      const u = await db.collection('users').findOne({ mobile });
      if (!u) return cors(NextResponse.json({ error: 'Mobile number not registered' }, { status: 404 }));
      // Check demo login setting for non-demo mobiles
      const s = await db.collection('settings').findOne({ key: 'demoLoginEnabled' });
      const demoEnabled = s ? !!s.value : true;
      if (!demoEnabled && u.isDemo) return cors(NextResponse.json({ error: 'Demo login has been disabled by the administrator.' }, { status: 403 }));
      await db.collection('otp_sessions').updateOne(
        { mobile },
        { $set: { mobile, otp: DEMO_OTP, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } },
        { upsert: true }
      );
      return cors(NextResponse.json({ success: true, demoOtp: DEMO_OTP, mobile }));
    }

    // ---- USERNAME + PASSWORD LOGIN ----
    if (route === '/auth/login' && method === 'POST') {
      const { username, password } = await request.json();
      const idRaw = String(username || '').trim();
      if (!idRaw || !password) return cors(NextResponse.json({ error: 'Username and password are required' }, { status: 400 }));
      // Match on username (case-insensitive) OR email (lowercase)
      const idLower = idRaw.toLowerCase();
      const u = await db.collection('users').findOne({
        $or: [
          { username: idRaw },
          { username: idLower },
          { email: idLower },
        ],
      });
      if (!u) return cors(NextResponse.json({ error: 'Invalid username or password' }, { status: 401 }));
      if (!u.passwordHash) return cors(NextResponse.json({ error: 'Account has no password set. Contact your administrator.' }, { status: 401 }));
      if (!checkPw(password, u.passwordHash)) return cors(NextResponse.json({ error: 'Invalid username or password' }, { status: 401 }));
      const token = uuidv4();
      await db.collection('sessions').insertOne({ token, userId: u.id, createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400 * 1000) });
      await audit(db, { userId: u.id, action: 'login_password', entityType: 'session', entityId: token });
      return cors(NextResponse.json({ token, user: clean(u), mustChangePassword: !!u.mustChangePassword }));
    }

    // ---- MAGIC LINK AUTH (legacy — kept for backwards compat but hidden in UI) ----
    if (route === '/auth/magic-link' && method === 'POST') {
      const { email } = await request.json();
      const normalized = String(email || '').toLowerCase().trim();
      if (!EMAIL_RE.test(normalized)) return cors(NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 }));
      const u = await db.collection('users').findOne({ email: normalized });
      if (!u) return cors(NextResponse.json({ error: 'Email not registered. Contact your administrator.' }, { status: 404 }));
      const token = uuidv4() + uuidv4().replace(/-/g, '');
      await db.collection('magic_links').insertOne({
        token, email: normalized, userId: u.id,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        used: false, createdAt: new Date(),
      });
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:3000`;
      const link = `${baseUrl}/api/auth/magic-callback?token=${token}`;
      try {
        const { sendMagicLink } = await import('@/lib/mailer');
        await sendMagicLink({ to: normalized, name: u.name, link });
      } catch (e) {
        console.error('Magic link email failed:', e.message);
        return cors(NextResponse.json({ error: `Failed to send email: ${e.message}` }, { status: 500 }));
      }
      return cors(NextResponse.json({ success: true, message: 'Magic link sent to your email' }));
    }

    if (route === '/auth/magic-callback' && method === 'GET') {
      const url = new URL(request.url);
      const token = url.searchParams.get('token');
      if (!token) return cors(NextResponse.json({ error: 'Missing token' }, { status: 400 }));
      const link = await db.collection('magic_links').findOne({ token });
      if (!link) return NextResponse.redirect(new URL('/?error=invalid_link', request.url));
      if (link.used) return NextResponse.redirect(new URL('/?error=link_used', request.url));
      if (new Date(link.expiresAt) < new Date()) return NextResponse.redirect(new URL('/?error=link_expired', request.url));
      const u = await db.collection('users').findOne({ id: link.userId });
      if (!u) return NextResponse.redirect(new URL('/?error=user_not_found', request.url));
      const sessionToken = uuidv4();
      await db.collection('sessions').insertOne({ token: sessionToken, userId: u.id, createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400 * 1000) });
      await db.collection('magic_links').updateOne({ token }, { $set: { used: true, usedAt: new Date() } });
      await audit(db, { userId: u.id, action: 'login_magic', entityType: 'session', entityId: sessionToken });
      // Redirect to a small HTML page that saves the token to localStorage and redirects to dashboard
      const html = `<!DOCTYPE html><html><head><title>Signing in...</title><style>body{font-family:Inter,sans-serif;background:#f8fafc;color:#1e293b;text-align:center;padding:80px 20px}</style></head><body><div style="font-size:18px;font-weight:600">Signing you in...</div><div style="font-size:13px;color:#64748b;margin-top:8px">Redirecting to your dashboard</div><script>try{localStorage.setItem('finlit_token','${sessionToken}');}catch(e){}setTimeout(function(){window.location.href='/';},400);</script></body></html>`;
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    }

    if (route === '/auth/verify-otp' && method === 'POST') {
      const { mobile, otp } = await request.json();
      const s = await db.collection('otp_sessions').findOne({ mobile });
      if (!s || s.otp !== otp) return cors(NextResponse.json({ error: 'Invalid OTP' }, { status: 401 }));
      if (new Date(s.expiresAt) < new Date()) return cors(NextResponse.json({ error: 'OTP expired' }, { status: 401 }));
      const u = await db.collection('users').findOne({ mobile });
      const token = uuidv4();
      await db.collection('sessions').insertOne({ token, userId: u.id, createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400 * 1000) });
      await db.collection('otp_sessions').deleteOne({ mobile });
      await audit(db, { userId: u.id, action: 'login', entityType: 'session', entityId: token });
      return cors(NextResponse.json({ token, user: clean(u) }));
    }

    if (route === '/auth/firebase-verify' && method === 'POST') {
      const { idToken } = await request.json();
      let payload;
      try {
        const { verifyFirebaseIdToken } = await import('@/lib/firebase-admin');
        payload = await verifyFirebaseIdToken(idToken);
      } catch (e) {
        return cors(NextResponse.json({ error: `Firebase verification failed: ${e.message}` }, { status: 401 }));
      }
      const phone = payload.phone_number || '';
      // Extract last 10 digits as our internal mobile format
      const mobile = phone.replace(/\D/g, '').slice(-10);
      if (!/^\d{10}$/.test(mobile)) return cors(NextResponse.json({ error: 'Invalid phone number in token' }, { status: 400 }));
      let u = await db.collection('users').findOne({ mobile });
      if (!u) {
        return cors(NextResponse.json({ error: `Mobile +91 ${mobile} is not registered. Please contact your administrator to be added to FINLIT360.` }, { status: 404 }));
      }
      const token = uuidv4();
      await db.collection('sessions').insertOne({ token, userId: u.id, createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400 * 1000) });
      await audit(db, { userId: u.id, action: 'login_firebase', entityType: 'session', entityId: token });
      return cors(NextResponse.json({ token, user: clean(u) }));
    }

    const user = await getUser(request, db);
    if (route === '/auth/me' && method === 'GET') {
      if (!user) return cors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
      return cors(NextResponse.json({ user: clean(user) }));
    }
    if (route === '/auth/logout' && method === 'POST') {
      const auth = request.headers.get('authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (token) await db.collection('sessions').deleteOne({ token });
      return cors(NextResponse.json({ success: true }));
    }
    if (!user) return cors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    // ---- CHANGE PASSWORD (self) ----
    if (route === '/auth/change-password' && method === 'POST') {
      const { oldPassword, newPassword } = await request.json();
      if (!newPassword || String(newPassword).length < 6) return cors(NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 }));
      // First-time change (mustChangePassword) may skip oldPassword only if user has never set a real password;
      // still, we require oldPassword to prevent session hijacking scenarios
      if (!checkPw(oldPassword, user.passwordHash)) return cors(NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 }));
      await db.collection('users').updateOne(
        { id: user.id },
        { $set: { passwordHash: hashPw(newPassword), mustChangePassword: false, passwordChangedAt: new Date() } }
      );
      await audit(db, { userId: user.id, action: 'change_password', entityType: 'users', entityId: user.id });
      return cors(NextResponse.json({ success: true }));
    }

    // ---- RESET USER PASSWORD (admin/PM for scoped users) ----
    if (route.match(/^\/auth\/reset-password\/([^/]+)$/) && method === 'POST') {
      const targetId = route.match(/^\/auth\/reset-password\/([^/]+)$/)[1];
      const target = await db.collection('users').findOne({ id: targetId });
      if (!target) return cors(NextResponse.json({ error: 'User not found' }, { status: 404 }));
      if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      if (user.role === ROLES.PROGRAM_MANAGER && ![ROLES.BRANCH_MANAGER, ROLES.TEAM].includes(target.role)) {
        return cors(NextResponse.json({ error: 'Program Manager can only reset Branch Manager or Team passwords' }, { status: 403 }));
      }
      const newPw = genPassword(10);
      await db.collection('users').updateOne(
        { id: targetId },
        { $set: { passwordHash: hashPw(newPw), mustChangePassword: true, passwordChangedAt: new Date() } }
      );
      // Attempt to email new credentials
      let emailed = false, emailError = null;
      if (target.email) {
        try {
          const { sendNotificationEmail } = await import('@/lib/mailer');
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const body = `Your FINLIT360 password has been reset by ${user.name}.<br/><br/>
            <b>Username:</b> ${target.username || target.email}<br/>
            <b>Temporary password:</b> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-family:monospace">${newPw}</code><br/><br/>
            You will be asked to set a new password on your next login.`;
          await sendNotificationEmail({ to: target.email, subject: 'FINLIT360 password reset', name: target.name, body, cta: { url: baseUrl, label: 'Sign in to FINLIT360' } });
          emailed = true;
        } catch (e) { emailError = e.message; console.error('Password reset email failed:', e.message); }
      }
      await audit(db, { userId: user.id, action: 'reset_password', entityType: 'users', entityId: targetId });
      return cors(NextResponse.json({ success: true, tempPassword: newPw, emailed, emailError }));
    }

    // USER MANAGEMENT (special rules: only NON-DEMO Admin/PM can manage)
    if (route === '/users' && method === 'POST') {
      if (user.isDemo) return cors(NextResponse.json({ error: 'Demo users cannot add new users. Please sign in with your real account.' }, { status: 403 }));
      if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const body = await request.json();
      if (!body.name?.trim()) return cors(NextResponse.json({ error: 'Name is required' }, { status: 400 }));
      if (!Object.values(ROLES).includes(body.role)) return cors(NextResponse.json({ error: 'Invalid role' }, { status: 400 }));
      // Email is now mandatory (magic-link is the primary auth)
      const emailNorm = String(body.email || '').toLowerCase().trim();
      if (!EMAIL_RE.test(emailNorm)) {
        return cors(NextResponse.json({ error: 'A valid email is required. Users log in via a magic link sent to this address.' }, { status: 400 }));
      }
      const dupEmail = await db.collection('users').findOne({ email: emailNorm });
      if (dupEmail) return cors(NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 }));
      // Mobile is now optional; if provided, must be 10 digits and unique
      const mobileRaw = String(body.mobile || '').trim();
      if (mobileRaw) {
        if (!/^\d{10}$/.test(mobileRaw)) return cors(NextResponse.json({ error: 'Enter a valid 10-digit mobile number (or leave blank)' }, { status: 400 }));
        const dupMob = await db.collection('users').findOne({ mobile: mobileRaw });
        if (dupMob) return cors(NextResponse.json({ error: 'A user with this mobile already exists' }, { status: 409 }));
      }
      // PM can only create branch_manager and team users
      if (user.role === ROLES.PROGRAM_MANAGER && ![ROLES.BRANCH_MANAGER, ROLES.TEAM].includes(body.role)) {
        return cors(NextResponse.json({ error: 'Program Manager can only add Branch Managers and Team members' }, { status: 403 }));
      }
      const doc = {
        id: uuidv4(),
        username: emailNorm, // email is the username for created users
        name: body.name.trim(), mobile: mobileRaw || null, role: body.role,
        email: emailNorm, isDemo: false, createdAt: new Date(), createdBy: user.id,
      };
      // Auto-generate a temporary password + require change on first login
      const tempPassword = genPassword(10);
      doc.passwordHash = hashPw(tempPassword);
      doc.mustChangePassword = true;
      if (body.role === ROLES.BRANCH_MANAGER && body.branchId) doc.branchId = body.branchId;
      if (body.role === ROLES.REGIONAL_OFFICE && body.roId) doc.roId = body.roId;
      if (body.role === ROLES.TEAM && body.teamId) doc.teamId = body.teamId;
      await db.collection('users').insertOne(doc);
      await audit(db, { userId: user.id, action: 'create_user', entityType: 'users', entityId: doc.id, after: { ...doc, passwordHash: '[REDACTED]' } });
      // If BM assigned to branch, also set branch.managerId + managerName
      if (doc.role === ROLES.BRANCH_MANAGER && doc.branchId) {
        await db.collection('branches').updateOne({ id: doc.branchId }, { $set: { managerId: doc.id, managerName: doc.name } });
      }
      // Email the temp credentials
      let emailed = false, emailError = null;
      try {
        const { sendNotificationEmail } = await import('@/lib/mailer');
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const body2 = `Welcome to FINLIT360! Your account has been created by ${user.name}.<br/><br/>
          <b>Username:</b> ${doc.username}<br/>
          <b>Temporary password:</b> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-family:monospace">${tempPassword}</code><br/><br/>
          Please sign in and you will be asked to set your own password on first login.`;
        await sendNotificationEmail({ to: doc.email, subject: 'Your FINLIT360 account is ready', name: doc.name, body: body2, cta: { url: baseUrl, label: 'Sign in to FINLIT360' } });
        emailed = true;
      } catch (e) { emailError = e.message; console.error('Welcome email failed:', e.message); }
      return cors(NextResponse.json({ ...clean(doc), _tempPassword: tempPassword, _emailed: emailed, _emailError: emailError }));
    }

    const uMatch = route.match(/^\/users\/([^/]+)$/);
    if (uMatch) {
      const uid = uMatch[1];
      const target = await db.collection('users').findOne({ id: uid });
      if (!target) return cors(NextResponse.json({ error: 'User not found' }, { status: 404 }));

      if (method === 'GET') return cors(NextResponse.json(clean(target)));

      if (method === 'PATCH' || method === 'PUT') {
        if (user.isDemo) return cors(NextResponse.json({ error: 'Demo users cannot edit users' }, { status: 403 }));
        if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
        if (target.isDemo) return cors(NextResponse.json({ error: 'Demo users cannot be edited' }, { status: 403 }));
        if (user.role === ROLES.PROGRAM_MANAGER && ![ROLES.BRANCH_MANAGER, ROLES.TEAM].includes(target.role)) {
          return cors(NextResponse.json({ error: 'Program Manager can only edit Branch Managers and Team members' }, { status: 403 }));
        }
        const body = await request.json();
        const update = {};
        for (const k of ['name', 'branchId', 'roId', 'teamId']) if (k in body) update[k] = body[k];
        if ('email' in body) {
          const em = String(body.email || '').toLowerCase().trim();
          if (!EMAIL_RE.test(em)) return cors(NextResponse.json({ error: 'A valid email is required' }, { status: 400 }));
          const dup = await db.collection('users').findOne({ email: em, id: { $ne: uid } });
          if (dup) return cors(NextResponse.json({ error: 'Another user already uses this email' }, { status: 409 }));
          update.email = em;
        }
        // Admin only: allow role change (but not toward admin unless already admin)
        if (user.role === ROLES.ADMIN && body.role && Object.values(ROLES).includes(body.role)) update.role = body.role;
        update.updatedAt = new Date();
        await db.collection('users').updateOne({ id: uid }, { $set: update });
        const after = await db.collection('users').findOne({ id: uid });
        await audit(db, { userId: user.id, action: 'update_user', entityType: 'users', entityId: uid, before: target, after });
        return cors(NextResponse.json(clean(after)));
      }

      if (method === 'DELETE') {
        if (user.isDemo) return cors(NextResponse.json({ error: 'Demo users cannot delete users' }, { status: 403 }));
        if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
        if (target.isDemo) return cors(NextResponse.json({ error: 'Demo users cannot be deleted' }, { status: 403 }));
        if (target.id === user.id) return cors(NextResponse.json({ error: 'You cannot delete yourself' }, { status: 400 }));
        if (user.role === ROLES.PROGRAM_MANAGER && ![ROLES.BRANCH_MANAGER, ROLES.TEAM].includes(target.role)) {
          return cors(NextResponse.json({ error: 'Program Manager can only delete Branch Managers and Team members' }, { status: 403 }));
        }
        await db.collection('users').deleteOne({ id: uid });
        await db.collection('sessions').deleteMany({ userId: uid });
        await audit(db, { userId: user.id, action: 'delete_user', entityType: 'users', entityId: uid, before: target });
        return cors(NextResponse.json({ success: true }));
      }
    }

    // Special: Branch POST with auto-create Branch Manager user from email
    if (route === '/branches' && method === 'POST') {
      if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const body = await request.json();
      const bmEmail = String(body.branchManagerEmail || '').toLowerCase().trim();
      if (!EMAIL_RE.test(bmEmail)) {
        return cors(NextResponse.json({ error: 'Branch Manager email is required (used to send the magic-link login).' }, { status: 400 }));
      }
      if (!body.name?.trim()) return cors(NextResponse.json({ error: 'Branch name is required' }, { status: 400 }));
      if (!body.districtId) return cors(NextResponse.json({ error: 'District is required' }, { status: 400 }));
      const doc = { id: uuidv4(), name: body.name.trim(), code: body.code, address: body.address, districtId: body.districtId, createdAt: new Date() };
      // Ensure BM user exists and is linked
      let bmUser = await db.collection('users').findOne({ email: bmEmail });
      let bmTempPw = null;
      if (!bmUser) {
        if (user.isDemo) return cors(NextResponse.json({ error: 'Demo users cannot auto-create Branch Manager accounts. Sign in with your real account.' }, { status: 403 }));
        bmTempPw = genPassword(10);
        bmUser = {
          id: uuidv4(),
          username: bmEmail,
          name: (body.branchManagerName || bmEmail.split('@')[0]).trim(),
          email: bmEmail,
          mobile: body.branchManagerMobile || null,
          role: ROLES.BRANCH_MANAGER,
          branchId: doc.id,
          passwordHash: hashPw(bmTempPw),
          mustChangePassword: true,
          isDemo: false,
          createdBy: user.id, createdAt: new Date(),
        };
        await db.collection('users').insertOne(bmUser);
        await audit(db, { userId: user.id, action: 'auto_create_bm', entityType: 'users', entityId: bmUser.id, after: { ...bmUser, passwordHash: '[REDACTED]' } });
      } else {
        await db.collection('users').updateOne({ id: bmUser.id }, { $set: { branchId: doc.id, role: ROLES.BRANCH_MANAGER } });
      }
      doc.managerId = bmUser.id;
      doc.managerName = bmUser.name;
      doc.managerEmail = bmEmail;
      await db.collection('branches').insertOne(doc);
      await audit(db, { userId: user.id, action: 'create', entityType: 'branches', entityId: doc.id, after: doc });
      // Email the new BM their credentials (only if we just created them)
      let bmEmailed = false, bmEmailError = null;
      if (bmTempPw) {
        try {
          const { sendNotificationEmail } = await import('@/lib/mailer');
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const body2 = `Welcome to FINLIT360! Your Branch Manager account has been created by ${user.name} for branch <b>${doc.name}</b>.<br/><br/>
            <b>Username:</b> ${bmUser.username}<br/>
            <b>Temporary password:</b> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-family:monospace">${bmTempPw}</code><br/><br/>
            Please sign in and you will be asked to set your own password on first login.`;
          await sendNotificationEmail({ to: bmUser.email, subject: 'Your FINLIT360 Branch Manager account', name: bmUser.name, body: body2, cta: { url: baseUrl, label: 'Sign in to FINLIT360' } });
          bmEmailed = true;
        } catch (e) { bmEmailError = e.message; console.error('BM welcome email failed:', e.message); }
      }
      return cors(NextResponse.json({ ...clean(doc), _bmTempPassword: bmTempPw, _bmEmailed: bmEmailed, _bmEmailError: bmEmailError }));
    }

    // Generic CRUD for these collections
    const crud = ['banks', 'regional_offices', 'districts', 'branches', 'villages', 'teams', 'users'];
    for (const c of crud) {
      if (route === `/${c}` && method === 'GET') {
        let items = await db.collection(c).find({}).limit(3000).toArray();
        // Scope users list for non-admin
        if (c === 'regional_offices' && user.role === ROLES.REGIONAL_OFFICE && user.roId) items = items.filter(x => x.id === user.roId);
        if (c === 'branches' && user.role === ROLES.BRANCH_MANAGER && user.branchId) items = items.filter(x => x.id === user.branchId);
        // Hide fees from non-admin, non-RO
        if (c === 'regional_offices' && ![ROLES.ADMIN, ROLES.REGIONAL_OFFICE].includes(user.role)) {
          items = items.map(x => { const { feePerProgram, ...rest } = x; return rest; });
        }
        // Hide salary info from non-admin
        if (c === 'teams' && user.role !== ROLES.ADMIN) {
          items = items.map(x => ({ ...x, members: (x.members || []).map(m => { const { dailySalary, ...rest } = m; return rest; }) }));
        }
        return cors(NextResponse.json(cleanArr(items)));
      }
      if (route === `/${c}` && method === 'POST') {
        if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
        // Only admin can set fees / create RO
        const body = await request.json();
        if (c === 'regional_offices' && user.role !== ROLES.ADMIN) return cors(NextResponse.json({ error: 'Only Admin can create Regional Offices' }, { status: 403 }));
        if (c === 'banks' && user.role !== ROLES.ADMIN) return cors(NextResponse.json({ error: 'Only Admin can create Banks' }, { status: 403 }));
        const doc = { id: uuidv4(), ...body, createdAt: new Date() };
        await db.collection(c).insertOne(doc);
        await audit(db, { userId: user.id, action: 'create', entityType: c, entityId: doc.id, after: doc });
        return cors(NextResponse.json(clean(doc)));
      }
      const m = route.match(new RegExp(`^/${c}/([^/]+)$`));
      if (m) {
        const id = m[1];
        if (method === 'GET') {
          const d = await db.collection(c).findOne({ id });
          if (!d) return cors(NextResponse.json({ error: 'Not found' }, { status: 404 }));
          return cors(NextResponse.json(clean(d)));
        }
        if (method === 'PATCH' || method === 'PUT') {
          if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          // Only Admin can edit Banks and Regional Offices (matches add permission)
          if ((c === 'banks' || c === 'regional_offices') && user.role !== ROLES.ADMIN) {
            return cors(NextResponse.json({ error: `Only Admin can edit ${c === 'banks' ? 'Banks' : 'Regional Offices'}` }, { status: 403 }));
          }
          const body = await request.json();
          // Sanitize immutable fields
          delete body.id; delete body._id; delete body.createdAt;
          // Only admin can change fees
          if (c === 'regional_offices' && 'feePerProgram' in body && user.role !== ROLES.ADMIN) delete body.feePerProgram;
          const before = await db.collection(c).findOne({ id });
          if (!before) return cors(NextResponse.json({ error: 'Not found' }, { status: 404 }));
          await db.collection(c).updateOne({ id }, { $set: { ...body, updatedAt: new Date() } });
          const after = await db.collection(c).findOne({ id });
          // Cascade: if branch name/manager changes, keep managerName in sync
          if (c === 'branches' && 'name' in body) {
            // no user-facing rename cascade needed here
          }
          await audit(db, { userId: user.id, action: 'update', entityType: c, entityId: id, before, after });
          return cors(NextResponse.json(clean(after)));
        }
        if (method === 'DELETE') {
          // Mirror add permissions: PM may delete districts/branches/villages/teams; Admin may delete anything
          const adminOnly = ['banks', 'regional_offices', 'users'];
          if (adminOnly.includes(c) && user.role !== ROLES.ADMIN) {
            return cors(NextResponse.json({ error: `Only Admin can delete ${c.replace('_', ' ')}` }, { status: 403 }));
          }
          if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) {
            return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          }
          // Dependency guards — prevent deletion when child records exist
          const guards = {
            banks: async () => await db.collection('regional_offices').countDocuments({ bankId: id }),
            regional_offices: async () => await db.collection('districts').countDocuments({ roId: id }),
            districts: async () => await db.collection('branches').countDocuments({ districtId: id }),
            branches: async () => (
              (await db.collection('villages').countDocuments({ branchId: id })) +
              (await db.collection('programs').countDocuments({ branchId: id }))
            ),
            villages: async () => await db.collection('programs').countDocuments({ villageId: id }),
            teams: async () => await db.collection('programs').countDocuments({ teamId: id }),
          };
          if (guards[c]) {
            const dep = await guards[c]();
            if (dep > 0) {
              const label = { banks: 'regional offices', regional_offices: 'districts', districts: 'branches', branches: 'villages/programs', villages: 'programs', teams: 'programs' }[c];
              return cors(NextResponse.json({ error: `Cannot delete — ${dep} ${label} still reference this record. Remove or reassign them first.` }, { status: 409 }));
            }
          }
          const before = await db.collection(c).findOne({ id });
          if (!before) return cors(NextResponse.json({ error: 'Not found' }, { status: 404 }));
          await db.collection(c).deleteOne({ id });
          // For branches, also unlink the assigned branch manager (don't delete the user)
          if (c === 'branches' && before.managerId) {
            await db.collection('users').updateOne({ id: before.managerId }, { $unset: { branchId: '' } });
          }
          await audit(db, { userId: user.id, action: 'delete', entityType: c, entityId: id, before });
          return cors(NextResponse.json({ success: true }));
        }
      }
    }

    // PROGRAMS
    if (route === '/programs' && method === 'GET') {
      const url = new URL(request.url);
      const status = url.searchParams.get('status');
      const q = {};
      if (status) q.status = status;
      // Scope
      if (user.role === ROLES.BRANCH_MANAGER && user.branchId) q.branchId = user.branchId;
      if (user.role === ROLES.REGIONAL_OFFICE && user.roId) q.roId = user.roId;
      if (user.role === ROLES.TEAM) {
        const teams = await db.collection('teams').find({ 'members.userId': user.id }).toArray();
        q.teamId = { $in: teams.map(t => t.id) };
      }
      // RO sees only authenticated for finance view — but for dashboard we return all in own RO
      let items = await db.collection('programs').find(q).sort({ proposedDate: -1 }).limit(1000).toArray();
      // Hide expense details from RO (they see only fees)
      if (user.role === ROLES.REGIONAL_OFFICE) items = items.map(p => { const { expenses, teamPayments, ...rest } = p; return rest; });
      return cors(NextResponse.json(cleanArr(items)));
    }

    if (route === '/programs' && method === 'POST') {
      if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const body = await request.json();
      if (!body.teamId) return cors(NextResponse.json({ error: 'Team is required. Please select a team before creating the program.' }, { status: 400 }));
      const branch = await db.collection('branches').findOne({ id: body.branchId });
      if (!branch) return cors(NextResponse.json({ error: 'Branch not found' }, { status: 400 }));
      const district = await db.collection('districts').findOne({ id: branch.districtId });
      const ro = await db.collection('regional_offices').findOne({ id: district.roId });
      const team = await db.collection('teams').findOne({ id: body.teamId });
      if (!team) return cors(NextResponse.json({ error: 'Selected team not found' }, { status: 400 }));
      const prog = {
        id: uuidv4(),
        code: `FLC-${Math.floor(Math.random() * 9000) + 1000}`,
        bankId: ro.bankId, roId: ro.id,
        districtId: district.id, branchId: branch.id,
        villageId: body.villageId, teamId: body.teamId,
        proposedDate: body.proposedDate ? new Date(body.proposedDate) : null,
        status: 'proposed', branchConfirmed: false,
        branchConfirmedAt: null, branchConfirmedBy: null, confirmedByRole: null,
        pmConfirmationReason: null,
        participants: null, photos: [], expenses: null, teamPayments: [],
        remarks: body.remarks || '', authenticatedBy: null, authenticatedAt: null, invoiceId: null,
        timeline: [{ id: uuidv4(), event: 'created', by: user.id, message: `Program proposed by ${user.name}`, timestamp: new Date() }],
        createdBy: user.id, createdAt: new Date(), updatedAt: new Date(),
      };
      await db.collection('programs').insertOne(prog);
      await audit(db, { userId: user.id, action: 'create_program', entityType: 'programs', entityId: prog.id, after: prog });
      if (branch.managerId) {
        await notify(db, [branch.managerId], { type: 'confirm_needed', title: 'Confirmation required', message: `${prog.code} awaiting your confirmation`, programId: prog.id });
      }
      const roUsers = await db.collection('users').find({ role: ROLES.REGIONAL_OFFICE, roId: ro.id }).toArray();
      await notify(db, roUsers.map(u => u.id), { type: 'new_program', title: 'New program created', message: `${prog.code} awaiting branch confirmation`, programId: prog.id });
      return cors(NextResponse.json(clean(prog)));
    }

    // /programs/:id and /programs/:id/:action
    const pMatch = route.match(/^\/programs\/([^/]+)(?:\/([^/]+))?$/);
    if (pMatch) {
      const id = pMatch[1];
      const action = pMatch[2];
      const prog = await db.collection('programs').findOne({ id });
      if (!prog) return cors(NextResponse.json({ error: 'Program not found' }, { status: 404 }));

      if (!action && method === 'GET') {
        // Scope check
        if (user.role === ROLES.BRANCH_MANAGER && prog.branchId !== user.branchId) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
        if (user.role === ROLES.REGIONAL_OFFICE && prog.roId !== user.roId) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
        let p = { ...prog };
        if (user.role === ROLES.REGIONAL_OFFICE) { delete p.expenses; delete p.teamPayments; }
        // Non-admin: don't reveal expenses to Branch mgr either (only Admin, PM, Team see expenses)
        if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER, ROLES.TEAM].includes(user.role)) {
          delete p.expenses; delete p.teamPayments;
        }
        return cors(NextResponse.json(clean(p)));
      }

      if (method === 'POST' && action) {
        const body = await request.json().catch(() => ({}));
        const setAndLog = async (setObj, event, message) => {
          await db.collection('programs').updateOne({ id }, { $set: { ...setObj, updatedAt: new Date() } });
          await timeline(db, id, event, user.id, message);
          await audit(db, { userId: user.id, action: event, entityType: 'programs', entityId: id, before: prog, after: { ...prog, ...setObj } });
        };

        if (action === 'confirm') {
          const isBM = user.role === ROLES.BRANCH_MANAGER;
          const isRO = user.role === ROLES.REGIONAL_OFFICE;
          const isAdmin = user.role === ROLES.ADMIN;
          const isPM = user.role === ROLES.PROGRAM_MANAGER;
          if (!isBM && !isAdmin && !isRO && !isPM) return cors(NextResponse.json({ error: 'Not allowed to confirm' }, { status: 403 }));
          if (isBM && prog.branchId !== user.branchId) return cors(NextResponse.json({ error: 'You can only confirm programs of your own branch' }, { status: 403 }));
          if (isRO && prog.roId !== user.roId) return cors(NextResponse.json({ error: 'You can only confirm programs of your own Regional Office' }, { status: 403 }));
          if (isPM) {
            const minsSinceCreation = (Date.now() - new Date(prog.createdAt).getTime()) / 60000;
            if (minsSinceCreation < 30) return cors(NextResponse.json({ error: `Only Branch Manager can confirm within the first 30 minutes. Try again in ${Math.ceil(30 - minsSinceCreation)} minute(s).` }, { status: 403 }));
            if (!body.reason?.trim()) return cors(NextResponse.json({ error: 'Please provide a reason for confirming on behalf of the branch' }, { status: 400 }));
          }
          const roleLabel = isBM ? 'Branch Manager' : isRO ? 'Regional Office' : isAdmin ? 'Admin' : 'Program Manager';
          const reason = body.reason ? ` Reason: ${body.reason}` : '';
          await setAndLog({
            status: 'confirmed', branchConfirmed: true, branchConfirmedAt: new Date(), branchConfirmedBy: user.id,
            confirmedByRole: user.role,
            pmConfirmationReason: isPM ? body.reason : (prog.pmConfirmationReason || null),
          }, 'confirmed', `Date confirmed by ${user.name} (${roleLabel}).${reason}`);
          await notify(db, [prog.createdBy], { type: 'confirmed', title: 'Program confirmed', message: `${prog.code} confirmed by ${roleLabel}`, programId: id });
        } else if (action === 'request-change') {
          if (user.role !== ROLES.BRANCH_MANAGER) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          await setAndLog({ status: 'change_requested' }, 'change_requested', `Change requested: ${body.reason || ''}`);
          await notify(db, [prog.createdBy], { type: 'change_requested', title: 'Change requested', message: `${prog.code}: ${body.reason || ''}`, programId: id });
        } else if (action === 'reschedule') {
          if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          await setAndLog({ proposedDate: new Date(body.date), status: 'proposed', branchConfirmed: false }, 'rescheduled', `Rescheduled to ${new Date(body.date).toDateString()}`);
          const branch = await db.collection('branches').findOne({ id: prog.branchId });
          if (branch?.managerId) await notify(db, [branch.managerId], { type: 'confirm_needed', title: 'Re-confirmation needed', message: `${prog.code} needs confirmation`, programId: id });
        } else if (action === 'assign-team') {
          if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          await setAndLog({ teamId: body.teamId }, 'assign_team', `Team assigned`);
        } else if (action === 'upload-data') {
          // Team uploads execution data (photos, participants, expenses)
          if (![ROLES.TEAM, ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          if (!prog.branchConfirmed && user.role === ROLES.TEAM) return cors(NextResponse.json({ error: 'Program must be confirmed by Branch Manager first' }, { status: 400 }));
          const payload = {};
          if (body.photos) payload.photos = body.photos.map(p => ({ id: uuidv4(), data: p.data, gps: p.gps || null, source: p.source || 'camera', uploadedAt: new Date() }));
          if (body.participants !== undefined) payload.participants = +body.participants;
          if (body.expenses) payload.expenses = body.expenses;
          if (body.teamPayments) payload.teamPayments = body.teamPayments;
          if (body.remarks !== undefined) payload.remarks = body.remarks;
          // Append photos rather than replace if body.photos
          if (payload.photos) {
            await db.collection('programs').updateOne({ id }, { $push: { photos: { $each: payload.photos } } });
            delete payload.photos;
          }
          if (Object.keys(payload).length) {
            await db.collection('programs').updateOne({ id }, { $set: { ...payload, updatedAt: new Date() } });
          }
          const cur = await db.collection('programs').findOne({ id });
          if ((cur.photos || []).length >= 4 && cur.participants && !cur.conducted) {
            await db.collection('programs').updateOne({ id }, { $set: { status: 'conducted', conductedAt: new Date() } });
            await timeline(db, id, 'conducted', user.id, 'Program conducted, awaiting authentication');
            const pms = await db.collection('users').find({ role: { $in: [ROLES.PROGRAM_MANAGER, ROLES.ADMIN] } }).toArray();
            await notify(db, pms.map(u => u.id), { type: 'authenticate_needed', title: 'Program awaiting authentication', message: `${prog.code} conducted`, programId: id });
          }
          await audit(db, { userId: user.id, action: 'upload_data', entityType: 'programs', entityId: id });
        } else if (action === 'delete-photo') {
          if (![ROLES.TEAM, ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          await db.collection('programs').updateOne({ id }, { $pull: { photos: { id: body.photoId } } });
        } else if (action === 'authenticate') {
          if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          if ((prog.photos || []).length < 4) return cors(NextResponse.json({ error: 'At least 4 photos required' }, { status: 400 }));
          if (!prog.participants) return cors(NextResponse.json({ error: 'Participants required' }, { status: 400 }));
          await setAndLog({ status: 'authenticated', authenticatedBy: user.id, authenticatedAt: new Date() }, 'authenticated', `Authenticated by ${user.name}`);
          await notify(db, [prog.createdBy], { type: 'authenticated', title: 'Program authenticated', message: `${prog.code} authenticated`, programId: id });
        } else if (action === 'unauthenticate') {
          if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          await setAndLog({ status: 'conducted', authenticatedBy: null, authenticatedAt: null }, 'unauthenticate', `Reverted by ${user.name}: ${body.reason || ''}`);
        } else {
          return cors(NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 }));
        }
        const updated = await db.collection('programs').findOne({ id });
        return cors(NextResponse.json(clean(updated)));
      }
    }

    // INVOICES
    if (route === '/invoices' && method === 'GET') {
      const q = {};
      if (user.role === ROLES.REGIONAL_OFFICE) q.roId = user.roId;
      else if (user.role !== ROLES.ADMIN) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const list = await db.collection('invoices').find(q).sort({ date: -1 }).limit(500).toArray();
      return cors(NextResponse.json(cleanArr(list)));
    }
    if (route === '/invoices' && method === 'POST') {
      // Generate invoice from authenticated programs for an RO
      if (user.role !== ROLES.ADMIN) return cors(NextResponse.json({ error: 'Only Admin can generate invoices' }, { status: 403 }));
      const { roId, programIds, invoiceNumber, invoiceDate, notes } = await request.json();
      const ro = await db.collection('regional_offices').findOne({ id: roId });
      if (!ro) return cors(NextResponse.json({ error: 'RO not found' }, { status: 400 }));
      const progs = await db.collection('programs').find({ id: { $in: programIds || [] } }).toArray();
      if (!progs.length) return cors(NextResponse.json({ error: 'No programs selected' }, { status: 400 }));
      const fee = ro.feePerProgram || 0;
      const items = [];
      for (const p of progs) {
        const branch = await db.collection('branches').findOne({ id: p.branchId });
        const village = await db.collection('villages').findOne({ id: p.villageId });
        items.push({
          id: uuidv4(), programId: p.id, program: 'Financial Literacy Camp',
          date: p.conductedAt || p.proposedDate, branch: branch?.name || '', village: village?.name || '',
          amount: fee,
        });
      }
      const subtotal = items.reduce((s, i) => s + (+i.amount || 0), 0);
      const inv = {
        id: uuidv4(),
        invoiceNumber: invoiceNumber || `ISCI/FLC/${new Date().getFullYear()}/FLC${String(Date.now()).slice(-4)}`,
        roId, bankId: ro.bankId,
        date: invoiceDate ? new Date(invoiceDate) : new Date(),
        billTo: {
          title: 'The Regional Manager',
          name: ro.name,
          address: ro.address,
        },
        items, subtotal, adjustments: 0, total: subtotal,
        notes: notes || 'As agreed, kindly make required payment against the above activities.',
        paidAmount: 0, paidDate: null,
        payments: [],
        createdBy: user.id, createdAt: new Date(),
      };
      await db.collection('invoices').insertOne(inv);
      await db.collection('programs').updateMany({ id: { $in: programIds } }, { $set: { invoiceId: inv.id } });
      await audit(db, { userId: user.id, action: 'create_invoice', entityType: 'invoices', entityId: inv.id, after: inv });
      return cors(NextResponse.json(clean(inv)));
    }
    const iMatch = route.match(/^\/invoices\/([^/]+)(?:\/([^/]+))?$/);
    if (iMatch) {
      const id = iMatch[1]; const action = iMatch[2];
      const inv = await db.collection('invoices').findOne({ id });
      if (!inv) return cors(NextResponse.json({ error: 'Invoice not found' }, { status: 404 }));
      if (user.role === ROLES.REGIONAL_OFFICE && inv.roId !== user.roId) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      if (![ROLES.ADMIN, ROLES.REGIONAL_OFFICE].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

      if (!action && method === 'GET') return cors(NextResponse.json(clean(inv)));
      if (!action && (method === 'PATCH' || method === 'PUT')) {
        if (user.role !== ROLES.ADMIN) return cors(NextResponse.json({ error: 'Only Admin can edit' }, { status: 403 }));
        const body = await request.json();
        // Recompute total
        if (body.items) body.subtotal = body.items.reduce((s, i) => s + (+i.amount || 0), 0);
        body.total = (body.subtotal ?? inv.subtotal) + (body.adjustments ?? inv.adjustments ?? 0);
        await db.collection('invoices').updateOne({ id }, { $set: { ...body, updatedAt: new Date() } });
        const after = await db.collection('invoices').findOne({ id });
        return cors(NextResponse.json(clean(after)));
      }
      if (action === 'payment' && method === 'POST') {
        if (user.role !== ROLES.ADMIN) return cors(NextResponse.json({ error: 'Only Admin can record payment' }, { status: 403 }));
        const { amount, date, mode, ref, remarks } = await request.json();
        const payment = { id: uuidv4(), amount: +amount, date: new Date(date || Date.now()), mode, ref, remarks, addedBy: user.id, addedAt: new Date() };
        await db.collection('invoices').updateOne({ id }, {
          $push: { payments: payment },
          $inc: { paidAmount: +amount },
          $set: { paidDate: payment.date, updatedAt: new Date() },
        });
        return cors(NextResponse.json({ success: true, payment }));
      }
      if (method === 'DELETE' && user.role === ROLES.ADMIN) {
        await db.collection('programs').updateMany({ invoiceId: id }, { $set: { invoiceId: null } });
        await db.collection('invoices').deleteOne({ id });
        return cors(NextResponse.json({ success: true }));
      }
    }

    // SALARY PAYMENTS (Admin only)
    if (route === '/salary-payments' && method === 'GET') {
      if (user.role !== ROLES.ADMIN) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const list = await db.collection('salary_payments').find({}).sort({ date: -1 }).limit(500).toArray();
      return cors(NextResponse.json(cleanArr(list)));
    }
    if (route === '/salary-payments' && method === 'POST') {
      if (user.role !== ROLES.ADMIN) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const body = await request.json();
      const doc = { id: uuidv4(), ...body, amount: +body.amount, date: new Date(body.date || Date.now()), addedBy: user.id, createdAt: new Date() };
      await db.collection('salary_payments').insertOne(doc);
      return cors(NextResponse.json(clean(doc)));
    }

    // DASHBOARD (role-scoped)
    if (route === '/dashboard' && method === 'GET') {
      const q = {};
      if (user.role === ROLES.BRANCH_MANAGER && user.branchId) q.branchId = user.branchId;
      if (user.role === ROLES.REGIONAL_OFFICE && user.roId) q.roId = user.roId;
      if (user.role === ROLES.TEAM) {
        const teams = await db.collection('teams').find({ 'members.userId': user.id }).toArray();
        q.teamId = { $in: teams.map(t => t.id) };
      }
      const progs = await db.collection('programs').find(q).toArray();
      const counts = {
        total: progs.length,
        proposed: progs.filter(p => p.status === 'proposed').length,
        change_requested: progs.filter(p => p.status === 'change_requested').length,
        confirmed: progs.filter(p => p.status === 'confirmed').length,
        conducted: progs.filter(p => p.status === 'conducted').length,
        authenticated: progs.filter(p => p.status === 'authenticated').length,
      };
      counts.pendingAuth = counts.conducted;
      counts.pendingConfirm = counts.proposed;
      const beneficiaries = progs.reduce((s, p) => s + (p.participants || 0), 0);
      return cors(NextResponse.json({ counts, beneficiaries }));
    }

    // ---- SETTINGS (Admin only, only real admin [email protected] can toggle demo login) ----
    if (route === '/settings' && method === 'GET') {
      const all = await db.collection('settings').find({}).toArray();
      const out = {};
      for (const s of all) out[s.key] = s.value;
      return cors(NextResponse.json(out));
    }
    if (route === '/settings/demo-login' && method === 'POST') {
      if (user.role !== ROLES.ADMIN || user.email !== PRIMARY_ADMIN_EMAIL) {
        return cors(NextResponse.json({ error: `Only ${PRIMARY_ADMIN_EMAIL} can change this setting` }, { status: 403 }));
      }
      const { enabled } = await request.json();
      await db.collection('settings').updateOne(
        { key: 'demoLoginEnabled' },
        { $set: { key: 'demoLoginEnabled', value: !!enabled, updatedAt: new Date(), updatedBy: user.id } },
        { upsert: true }
      );
      await audit(db, { userId: user.id, action: 'toggle_demo_login', entityType: 'settings', entityId: 'demoLoginEnabled', after: { value: !!enabled } });
      return cors(NextResponse.json({ success: true, value: !!enabled }));
    }

    // ---- MESSAGES (RO <-> Admin+PM threaded) ----
    if (route === '/messages' && method === 'GET') {
      const url = new URL(request.url);
      let roId = url.searchParams.get('roId');
      if (user.role === ROLES.REGIONAL_OFFICE) roId = user.roId;
      if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER, ROLES.REGIONAL_OFFICE].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const q = roId ? { roId } : {};
      const msgs = await db.collection('messages').find(q).sort({ createdAt: 1 }).limit(500).toArray();
      return cors(NextResponse.json(cleanArr(msgs)));
    }
    if (route === '/messages' && method === 'POST') {
      const { text, roId: reqRoId } = await request.json();
      if (!text?.trim()) return cors(NextResponse.json({ error: 'Message text required' }, { status: 400 }));
      let roId = reqRoId;
      if (user.role === ROLES.REGIONAL_OFFICE) roId = user.roId;
      if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER, ROLES.REGIONAL_OFFICE].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      if (!roId) return cors(NextResponse.json({ error: 'roId required' }, { status: 400 }));
      const doc = { id: uuidv4(), roId, from: user.id, fromRole: user.role, fromName: user.name, text: text.trim(), createdAt: new Date() };
      await db.collection('messages').insertOne(doc);
      // Notify the other party
      const recipients = [];
      if (user.role === ROLES.REGIONAL_OFFICE) {
        const pmsAndAdmins = await db.collection('users').find({ role: { $in: [ROLES.ADMIN, ROLES.PROGRAM_MANAGER] }, isDemo: { $ne: true } }).toArray();
        recipients.push(...pmsAndAdmins.map(x => x.id));
      } else {
        const roUsers = await db.collection('users').find({ role: ROLES.REGIONAL_OFFICE, roId }).toArray();
        recipients.push(...roUsers.map(x => x.id));
      }
      await notify(db, recipients, { type: 'new_message', title: 'New message', message: text.trim().slice(0, 100) });
      return cors(NextResponse.json(clean(doc)));
    }

    // ---- DAILY EXPENSES ----
    if (route === '/expenses' && method === 'GET') {
      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const q = {};
      if (from || to) {
        q.date = {};
        if (from) q.date.$gte = new Date(from);
        if (to) q.date.$lte = new Date(to);
      }
      // Team members see only own team's expenses
      if (user.role === ROLES.TEAM) {
        const teams = await db.collection('teams').find({ 'members.userId': user.id }).toArray();
        q.teamId = { $in: teams.map(t => t.id) };
      }
      if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER, ROLES.TEAM].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const list = await db.collection('expenses').find(q).sort({ date: -1 }).limit(500).toArray();
      return cors(NextResponse.json(cleanArr(list)));
    }
    if (route === '/expenses' && method === 'POST') {
      if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER, ROLES.TEAM].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const body = await request.json();
      const doc = {
        id: uuidv4(),
        date: new Date(body.date || Date.now()),
        teamId: body.teamId,
        taxi: +body.taxi || 0, food: +body.food || 0, refreshments: +body.refreshments || 0,
        stationary: +body.stationary || 0, other: +body.other || 0,
        remarks: body.remarks || '',
        programIds: body.programIds || [],
        authenticatedBy: null, authenticatedAt: null,
        createdBy: user.id, createdAt: new Date(),
      };
      doc.total = doc.taxi + doc.food + doc.refreshments + doc.stationary + doc.other;
      await db.collection('expenses').insertOne(doc);
      return cors(NextResponse.json(clean(doc)));
    }
    const expM = route.match(/^\/expenses\/([^/]+)(?:\/([^/]+))?$/);
    if (expM) {
      const id = expM[1]; const action = expM[2];
      if (method === 'DELETE') {
        if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
        await db.collection('expenses').deleteOne({ id });
        return cors(NextResponse.json({ success: true }));
      }
      if (action === 'authenticate' && method === 'POST') {
        if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
        await db.collection('expenses').updateOne({ id }, { $set: { authenticatedBy: user.id, authenticatedAt: new Date() } });
        return cors(NextResponse.json({ success: true }));
      }
    }

    // ---- ATTENDANCE ----
    if (route === '/attendance' && method === 'GET') {
      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const teamId = url.searchParams.get('teamId');
      const q = {};
      if (teamId) q.teamId = teamId;
      if (from || to) {
        q.date = {};
        if (from) q.date.$gte = new Date(from);
        if (to) q.date.$lte = new Date(to);
      }
      const list = await db.collection('attendance').find(q).sort({ date: -1 }).limit(1000).toArray();
      return cors(NextResponse.json(cleanArr(list)));
    }
    if (route === '/attendance' && method === 'POST') {
      if (![ROLES.ADMIN, ROLES.PROGRAM_MANAGER, ROLES.TEAM].includes(user.role)) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const body = await request.json();
      const doc = {
        id: uuidv4(),
        date: new Date(body.date || Date.now()),
        teamId: body.teamId,
        records: body.records || [], // [{ memberId, status: 'present'|'absent' }]
        markedBy: user.id, createdAt: new Date(),
      };
      // Upsert: one attendance record per team+date
      const dateStr = doc.date.toISOString().slice(0, 10);
      await db.collection('attendance').updateOne(
        { teamId: doc.teamId, dateStr },
        { $set: { ...doc, dateStr } },
        { upsert: true }
      );
      return cors(NextResponse.json(clean(doc)));
    }


    if (route === '/notifications' && method === 'GET') {
      const list = await db.collection('notifications').find({ userId: user.id }).sort({ createdAt: -1 }).limit(100).toArray();
      return cors(NextResponse.json(cleanArr(list)));
    }
    const nMatch = route.match(/^\/notifications\/([^/]+)\/read$/);
    if (nMatch && method === 'POST') {
      await db.collection('notifications').updateOne({ id: nMatch[1], userId: user.id }, { $set: { read: true } });
      return cors(NextResponse.json({ success: true }));
    }

    // AUDIT (admin only)
    if (route === '/audit' && method === 'GET') {
      if (user.role !== ROLES.ADMIN) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const list = await db.collection('audit_logs').find({}).sort({ timestamp: -1 }).limit(300).toArray();
      return cors(NextResponse.json(cleanArr(list)));
    }

    return cors(NextResponse.json({ error: `Route ${route} not found` }, { status: 404 }));
  } catch (e) {
    console.error('API Error', e);
    return cors(NextResponse.json({ error: e.message }, { status: 500 }));
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
