import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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

const clean = d => { if (!d) return d; const { _id, ...r } = d; return r; };
const cleanArr = a => a.map(clean);

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

// ---------- Seed ----------
let seeded = false;
async function seedIfEmpty(db) {
  if (seeded) return;
  if (await db.collection('users').countDocuments() > 0) { seeded = true; return; }
  const now = new Date();

  const bankId = uuidv4();
  const roId = uuidv4();
  const dist1 = uuidv4();
  const dist2 = uuidv4();
  const b1 = uuidv4(), b2 = uuidv4(), b3 = uuidv4();

  await db.collection('banks').insertOne({
    id: bankId, name: 'Madhya Pradesh Gramin Bank', code: 'MPGB', createdAt: now,
  });
  await db.collection('regional_offices').insertOne({
    id: roId, bankId, name: 'Gwalior Regional Office',
    address: 'Regional Office, City Centre, Gwalior, Madhya Pradesh',
    state: 'Madhya Pradesh', contactPerson: 'Regional Manager', contactNumber: '',
    feePerProgram: 3750, programsAllocated: 42, createdAt: now,
  });
  await db.collection('districts').insertMany([
    { id: dist1, roId, name: 'Gwalior', state: 'Madhya Pradesh', createdAt: now },
    { id: dist2, roId, name: 'Morena', state: 'Madhya Pradesh', createdAt: now },
  ]);
  await db.collection('branches').insertMany([
    { id: b1, districtId: dist1, name: 'Endori', code: 'END', address: 'Endori', createdAt: now },
    { id: b2, districtId: dist1, name: 'Aantri Kailaras', code: 'AKS', address: 'Aantri', createdAt: now },
    { id: b3, districtId: dist2, name: 'Morena Main', code: 'MRN', address: 'Morena', createdAt: now },
  ]);
  const v1 = uuidv4(), v2 = uuidv4(), v3 = uuidv4(), v4 = uuidv4();
  await db.collection('villages').insertMany([
    { id: v1, branchId: b1, name: 'PadraikaPura', lat: 26.2183, lng: 78.1828, expectedAudience: 80, createdAt: now },
    { id: v2, branchId: b1, name: 'Bhitarwar', lat: 26.0210, lng: 78.1900, expectedAudience: 100, createdAt: now },
    { id: v3, branchId: b2, name: 'Mamchaun', lat: 26.4520, lng: 78.2100, expectedAudience: 90, createdAt: now },
    { id: v4, branchId: b3, name: 'Sabalgarh', lat: 26.2600, lng: 77.4200, expectedAudience: 120, createdAt: now },
  ]);

  const adminId = uuidv4(), pmId = uuidv4(), bmId = uuidv4(), roUserId = uuidv4(), teamUserId = uuidv4();
  await db.collection('users').insertMany([
    { id: adminId, name: 'Mohit Modi', mobile: '9000000001', role: ROLES.ADMIN, email: 'admin@iscifoundation.org' },
    { id: pmId, name: 'Priya Sharma', mobile: '9000000002', role: ROLES.PROGRAM_MANAGER, email: 'priya.pm@iscifoundation.org' },
    { id: bmId, name: 'Vijay Joshi', mobile: '9000000003', role: ROLES.BRANCH_MANAGER, branchId: b1, email: 'vijay@mpgb.in' },
    { id: roUserId, name: 'Regional Manager', mobile: '9000000004', role: ROLES.REGIONAL_OFFICE, roId, email: 'ro@mpgb.in' },
    { id: teamUserId, name: 'Amit Pawar', mobile: '9000000005', role: ROLES.TEAM, email: 'amit@iscifoundation.org' },
  ]);
  // Set branch manager ref
  await db.collection('branches').updateOne({ id: b1 }, { $set: { managerId: bmId, managerName: 'Vijay Joshi' } });

  const teamId = uuidv4();
  await db.collection('teams').insertOne({
    id: teamId, name: 'Team Alpha',
    members: [
      { id: uuidv4(), name: 'Amit Pawar', contact: '9000000005', dailySalary: 800, userId: teamUserId },
      { id: uuidv4(), name: 'Kavita Jadhav', contact: '9000000006', dailySalary: 600 },
    ],
    createdAt: now,
  });

  // Sample programs at various statuses
  const stages = ['proposed', 'confirmed', 'conducted', 'authenticated'];
  const villages = [{ id: v1, branchId: b1 }, { id: v2, branchId: b1 }, { id: v3, branchId: b2 }, { id: v4, branchId: b3 }];
  const programs = [];
  for (let i = 0; i < villages.length; i++) {
    const status = stages[i];
    const v = villages[i];
    const branch = await db.collection('branches').findOne({ id: v.branchId });
    const district = await db.collection('districts').findOne({ id: branch.districtId });
    const proposedDate = new Date(Date.now() + (i - 1) * 86400000);
    programs.push({
      id: uuidv4(),
      code: `FLC-${1000 + i}`,
      bankId, roId,
      districtId: district.id, branchId: branch.id, villageId: v.id,
      teamId,
      proposedDate,
      status, // proposed | confirmed | conducted | authenticated | change_requested | rejected
      branchConfirmed: ['confirmed', 'conducted', 'authenticated'].includes(status),
      branchConfirmedAt: ['confirmed', 'conducted', 'authenticated'].includes(status) ? now : null,
      branchConfirmedBy: ['confirmed', 'conducted', 'authenticated'].includes(status) ? bmId : null,
      participants: ['conducted', 'authenticated'].includes(status) ? 65 + i * 5 : null,
      photos: ['conducted', 'authenticated'].includes(status)
        ? [1, 2, 3, 4].map(n => ({ id: uuidv4(), data: null, gps: { lat: 26.2 + i * 0.01, lng: 78.18 + i * 0.01 }, uploadedAt: now, index: n }))
        : [],
      expenses: ['conducted', 'authenticated'].includes(status) ? { taxi: 500, food: 300, refreshments: 200, stationary: 100, other: 0 } : null,
      teamPayments: [],
      remarks: '',
      authenticatedBy: status === 'authenticated' ? pmId : null,
      authenticatedAt: status === 'authenticated' ? now : null,
      invoiceId: null,
      timeline: [
        { id: uuidv4(), event: 'created', by: pmId, message: 'Program created', timestamp: now },
      ],
      createdBy: pmId, createdAt: now, updatedAt: now,
    });
  }
  await db.collection('programs').insertMany(programs);
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
      await db.collection('otp_sessions').updateOne(
        { mobile },
        { $set: { mobile, otp: DEMO_OTP, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } },
        { upsert: true }
      );
      return cors(NextResponse.json({ success: true, demoOtp: DEMO_OTP, mobile }));
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
          const body = await request.json();
          // Only admin can change fees
          if (c === 'regional_offices' && 'feePerProgram' in body && user.role !== ROLES.ADMIN) delete body.feePerProgram;
          const before = await db.collection(c).findOne({ id });
          await db.collection(c).updateOne({ id }, { $set: { ...body, updatedAt: new Date() } });
          const after = await db.collection(c).findOne({ id });
          await audit(db, { userId: user.id, action: 'update', entityType: c, entityId: id, before, after });
          return cors(NextResponse.json(clean(after)));
        }
        if (method === 'DELETE' && user.role === ROLES.ADMIN) {
          await db.collection(c).deleteOne({ id });
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
      const branch = await db.collection('branches').findOne({ id: body.branchId });
      if (!branch) return cors(NextResponse.json({ error: 'Branch not found' }, { status: 400 }));
      const district = await db.collection('districts').findOne({ id: branch.districtId });
      const ro = await db.collection('regional_offices').findOne({ id: district.roId });
      const prog = {
        id: uuidv4(),
        code: `FLC-${Math.floor(Math.random() * 9000) + 1000}`,
        bankId: ro.bankId, roId: ro.id,
        districtId: district.id, branchId: branch.id,
        villageId: body.villageId, teamId: body.teamId || null,
        proposedDate: body.proposedDate ? new Date(body.proposedDate) : null,
        status: 'proposed', branchConfirmed: false,
        branchConfirmedAt: null, branchConfirmedBy: null,
        participants: null, photos: [], expenses: null, teamPayments: [],
        remarks: body.remarks || '', authenticatedBy: null, authenticatedAt: null, invoiceId: null,
        timeline: [{ id: uuidv4(), event: 'created', by: user.id, message: `Program proposed by ${user.name}`, timestamp: new Date() }],
        createdBy: user.id, createdAt: new Date(), updatedAt: new Date(),
      };
      await db.collection('programs').insertOne(prog);
      await audit(db, { userId: user.id, action: 'create_program', entityType: 'programs', entityId: prog.id, after: prog });
      // Notify branch manager
      if (branch.managerId) {
        await notify(db, [branch.managerId], { type: 'confirm_needed', title: 'Confirmation required', message: `${prog.code} awaiting your confirmation`, programId: prog.id });
      }
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
          if (user.role !== ROLES.BRANCH_MANAGER && user.role !== ROLES.ADMIN) return cors(NextResponse.json({ error: 'Only Branch Manager can confirm' }, { status: 403 }));
          if (user.role === ROLES.BRANCH_MANAGER && prog.branchId !== user.branchId) return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          await setAndLog({
            status: 'confirmed', branchConfirmed: true, branchConfirmedAt: new Date(), branchConfirmedBy: user.id,
          }, 'confirmed', `Date confirmed by ${user.name}`);
          await notify(db, [prog.createdBy], { type: 'confirmed', title: 'Program confirmed', message: `${prog.code} confirmed`, programId: id });
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

    // NOTIFICATIONS
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
