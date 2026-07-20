import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// ---------- CORS ----------
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }));
}

// ---------- Constants ----------
const ROLES = {
  SUPER_ADMIN: 'super_admin',
  PROGRAM_MANAGER: 'program_manager',
  DISTRICT_COORDINATOR: 'district_coordinator',
  ROUTE_PLANNER: 'route_planner',
  BRANCH_MANAGER: 'branch_manager',
  BANK_REP: 'bank_rep',
  TEAM_LEADER: 'team_leader',
  FIELD_TRAINER: 'field_trainer',
  REGIONAL_OFFICE: 'regional_office',
  BANK_HQ: 'bank_hq',
};

const CAMP_STATUS = [
  'created',
  'village_proposed',
  'awaiting_confirmation',
  'confirmed',
  'representative_assigned',
  'team_assigned',
  'scheduled',
  'in_progress',
  'completed',
  'verified',
  'in_report',
  'closed',
  'rejected',
  'change_requested',
];

const DEMO_OTP = '123456';

// ---------- Helpers ----------
function clean(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}
function cleanArr(arr) { return arr.map(clean); }

async function auditLog(db, { userId, action, entityType, entityId, before, after, ip, device }) {
  await db.collection('audit_logs').insertOne({
    id: uuidv4(),
    userId, action, entityType, entityId,
    before: before || null,
    after: after || null,
    ip: ip || null,
    device: device || null,
    timestamp: new Date(),
  });
}

async function addTimeline(db, campId, event) {
  await db.collection('camps').updateOne(
    { id: campId },
    { $push: { timeline: { id: uuidv4(), ...event, timestamp: new Date() } } }
  );
}

async function notify(db, userIds, { type, title, message, campId, meta }) {
  const docs = (Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(uid => ({
    id: uuidv4(),
    userId: uid,
    type, title, message,
    campId: campId || null,
    meta: meta || null,
    read: false,
    createdAt: new Date(),
  }));
  if (docs.length) await db.collection('notifications').insertMany(docs);
}

async function getUserFromRequest(request, db) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const session = await db.collection('sessions').findOne({ token });
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;
  const user = await db.collection('users').findOne({ id: session.userId });
  return user || null;
}

function requireAuth(user) {
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

// ---------- Seeder ----------
let seeded = false;
async function seedIfEmpty(db) {
  if (seeded) return;
  const count = await db.collection('users').countDocuments();
  if (count > 0) { seeded = true; return; }

  const now = new Date();
  const bankId = uuidv4();
  const projectId = uuidv4();
  const dist1 = uuidv4();
  const dist2 = uuidv4();
  const block1 = uuidv4();
  const block2 = uuidv4();
  const branches = [
    { id: uuidv4(), name: 'Nashik Main Branch', code: 'NSK-001', bankId, districtId: dist1, address: 'MG Road, Nashik' },
    { id: uuidv4(), name: 'Sinnar Branch', code: 'SNR-002', bankId, districtId: dist1, address: 'Main St, Sinnar' },
    { id: uuidv4(), name: 'Pune Camp Branch', code: 'PUN-001', bankId, districtId: dist2, address: 'Camp, Pune' },
    { id: uuidv4(), name: 'Hadapsar Branch', code: 'PUN-002', bankId, districtId: dist2, address: 'Hadapsar, Pune' },
  ];
  const villages = [
    { id: uuidv4(), name: 'Anjaneri', panchayat: 'Anjaneri GP', blockId: block1, districtId: dist1, lat: 19.9316, lng: 73.6413, expectedAudience: 80 },
    { id: uuidv4(), name: 'Trimbak', panchayat: 'Trimbak GP', blockId: block1, districtId: dist1, lat: 19.9333, lng: 73.5333, expectedAudience: 100 },
    { id: uuidv4(), name: 'Igatpuri', panchayat: 'Igatpuri GP', blockId: block1, districtId: dist1, lat: 19.6963, lng: 73.5606, expectedAudience: 120 },
    { id: uuidv4(), name: 'Sinnar Rural', panchayat: 'Sinnar GP', blockId: block1, districtId: dist1, lat: 19.8500, lng: 73.9968, expectedAudience: 90 },
    { id: uuidv4(), name: 'Wagholi', panchayat: 'Wagholi GP', blockId: block2, districtId: dist2, lat: 18.5793, lng: 73.9683, expectedAudience: 110 },
    { id: uuidv4(), name: 'Manjari', panchayat: 'Manjari GP', blockId: block2, districtId: dist2, lat: 18.4881, lng: 73.9784, expectedAudience: 75 },
    { id: uuidv4(), name: 'Loni Kalbhor', panchayat: 'Loni GP', blockId: block2, districtId: dist2, lat: 18.4838, lng: 74.0296, expectedAudience: 95 },
    { id: uuidv4(), name: 'Uruli Kanchan', panchayat: 'Uruli GP', blockId: block2, districtId: dist2, lat: 18.4772, lng: 74.1080, expectedAudience: 85 },
  ];

  const teamLeaderId = uuidv4();
  const trainerId = uuidv4();
  const teamLeader2Id = uuidv4();
  const dcId = uuidv4();
  const pmId = uuidv4();
  const branchMgrId = uuidv4();
  const bankRepId = uuidv4();
  const routePlannerId = uuidv4();
  const regionalId = uuidv4();
  const bankHqId = uuidv4();
  const superAdminId = uuidv4();

  const teamId1 = uuidv4();
  const teamId2 = uuidv4();

  const users = [
    { id: superAdminId, name: 'Rajesh Sharma', mobile: '9000000001', role: ROLES.SUPER_ADMIN, email: 'admin@iscifoundation.org' },
    { id: pmId, name: 'Priya Deshmukh', mobile: '9000000002', role: ROLES.PROGRAM_MANAGER, email: 'priya.pm@iscifoundation.org' },
    { id: dcId, name: 'Anil Patil', mobile: '9000000003', role: ROLES.DISTRICT_COORDINATOR, districtId: dist1, email: 'anil.dc@iscifoundation.org' },
    { id: routePlannerId, name: 'Sunita Kadam', mobile: '9000000004', role: ROLES.ROUTE_PLANNER, districtId: dist1, email: 'sunita.rp@iscifoundation.org' },
    { id: branchMgrId, name: 'Vijay Joshi', mobile: '9000000005', role: ROLES.BRANCH_MANAGER, branchId: branches[0].id, email: 'vijay.bm@bank.com' },
    { id: bankRepId, name: 'Meera Kulkarni', mobile: '9000000006', role: ROLES.BANK_REP, branchId: branches[0].id, email: 'meera.br@bank.com' },
    { id: teamLeaderId, name: 'Amit Pawar', mobile: '9000000007', role: ROLES.TEAM_LEADER, teamId: teamId1, districtId: dist1, email: 'amit.tl@iscifoundation.org' },
    { id: trainerId, name: 'Kavita Jadhav', mobile: '9000000008', role: ROLES.FIELD_TRAINER, teamId: teamId1, districtId: dist1, email: 'kavita.ft@iscifoundation.org' },
    { id: regionalId, name: 'Deepak Rao', mobile: '9000000009', role: ROLES.REGIONAL_OFFICE, email: 'deepak.ro@iscifoundation.org' },
    { id: bankHqId, name: 'Rohini Nair', mobile: '9000000010', role: ROLES.BANK_HQ, bankId, email: 'rohini.hq@bank.com' },
    { id: teamLeader2Id, name: 'Sachin More', mobile: '9000000011', role: ROLES.TEAM_LEADER, teamId: teamId2, districtId: dist2, email: 'sachin.tl@iscifoundation.org' },
  ];

  await db.collection('banks').insertOne({ id: bankId, name: 'State Bank of Bharat', code: 'SBB', logo: null, createdAt: now });
  await db.collection('projects').insertOne({ id: projectId, name: 'FLAP 2025-26', bankId, description: 'Financial Literacy Awareness Program 2025-26', startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31'), createdAt: now });
  await db.collection('districts').insertMany([
    { id: dist1, name: 'Nashik', state: 'Maharashtra', bankId, projectId, createdAt: now },
    { id: dist2, name: 'Pune', state: 'Maharashtra', bankId, projectId, createdAt: now },
  ]);
  await db.collection('blocks').insertMany([
    { id: block1, name: 'Nashik Rural', districtId: dist1 },
    { id: block2, name: 'Haveli', districtId: dist2 },
  ]);
  await db.collection('branches').insertMany(branches.map(b => ({ ...b, createdAt: now })));
  await db.collection('villages').insertMany(villages.map(v => ({ ...v, createdAt: now })));
  await db.collection('teams').insertMany([
    { id: teamId1, name: 'Team Alpha - Nashik', districtId: dist1, leaderId: teamLeaderId, memberIds: [teamLeaderId, trainerId], createdAt: now },
    { id: teamId2, name: 'Team Bravo - Pune', districtId: dist2, leaderId: teamLeader2Id, memberIds: [teamLeader2Id], createdAt: now },
  ]);
  await db.collection('vehicles').insertMany([
    { id: uuidv4(), regNumber: 'MH-15-AB-1234', teamId: teamId1, model: 'Bolero' },
    { id: uuidv4(), regNumber: 'MH-12-CD-5678', teamId: teamId2, model: 'Ertiga' },
  ]);
  await db.collection('users').insertMany(users);

  // Sample camps at various stages
  const sampleCamps = [];
  const stages = ['awaiting_confirmation', 'confirmed', 'team_assigned', 'scheduled', 'in_progress', 'completed', 'verified'];
  for (let i = 0; i < villages.length; i++) {
    const v = villages[i];
    const branch = branches.find(b => b.districtId === v.districtId) || branches[0];
    const status = stages[i % stages.length];
    const teamId = v.districtId === dist1 ? teamId1 : teamId2;
    const proposedDate = new Date(Date.now() + (i - 3) * 86400000);
    const campId = uuidv4();
    const camp = {
      id: campId,
      code: `FLC-${String(1000 + i)}`,
      bankId, projectId,
      districtId: v.districtId,
      branchId: branch.id,
      villageId: v.id,
      routeId: null,
      teamId: ['team_assigned', 'scheduled', 'in_progress', 'completed', 'verified'].includes(status) ? teamId : null,
      status,
      proposedDate,
      confirmedDate: ['confirmed', 'team_assigned', 'scheduled', 'in_progress', 'completed', 'verified'].includes(status) ? proposedDate : null,
      representative: ['team_assigned', 'scheduled', 'in_progress', 'completed', 'verified'].includes(status)
        ? { name: 'Meera Kulkarni', contact: '9000000006', role: 'Bank Correspondent', remarks: '' } : null,
      expectedAudience: v.expectedAudience,
      startedAt: ['in_progress', 'completed', 'verified'].includes(status) ? proposedDate : null,
      completedAt: ['completed', 'verified'].includes(status) ? new Date(proposedDate.getTime() + 3 * 3600 * 1000) : null,
      duration: ['completed', 'verified'].includes(status) ? 180 : null,
      gpsStart: ['in_progress', 'completed', 'verified'].includes(status)
        ? { lat: v.lat + (Math.random() - 0.5) * 0.001, lng: v.lng + (Math.random() - 0.5) * 0.001, accuracy: 8, timestamp: new Date() } : null,
      attendance: ['completed', 'verified'].includes(status)
        ? { male: 40 + i * 3, female: 35 + i * 4, youth: 15, senior: 10, shg: 20, farmers: 25, students: 12, others: 5, total: 162 + i * 7 } : null,
      photos: ['completed', 'verified'].includes(status)
        ? [
            { id: uuidv4(), category: 'venue', url: null, uploadedAt: new Date(), gps: { lat: v.lat, lng: v.lng } },
            { id: uuidv4(), category: 'banner', url: null, uploadedAt: new Date(), gps: { lat: v.lat, lng: v.lng } },
            { id: uuidv4(), category: 'session', url: null, uploadedAt: new Date(), gps: { lat: v.lat, lng: v.lng } },
            { id: uuidv4(), category: 'group', url: null, uploadedAt: new Date(), gps: { lat: v.lat, lng: v.lng } },
            { id: uuidv4(), category: 'attendance_register', url: null, uploadedAt: new Date(), gps: { lat: v.lat, lng: v.lng } },
          ] : [],
      remarks: '',
      verificationRemarks: status === 'verified' ? 'GPS + photos verified.' : '',
      timeline: [
        { id: uuidv4(), event: 'created', by: superAdminId, message: 'Camp created by Super Admin', timestamp: now },
        { id: uuidv4(), event: 'village_proposed', by: dcId, message: `Village ${v.name} proposed`, timestamp: now },
        { id: uuidv4(), event: 'awaiting_confirmation', by: pmId, message: 'Sent to branch for confirmation', timestamp: now },
      ],
      createdBy: superAdminId,
      createdAt: now,
      updatedAt: now,
    };
    sampleCamps.push(camp);
  }
  await db.collection('camps').insertMany(sampleCamps);

  // Some notifications
  await db.collection('notifications').insertMany([
    { id: uuidv4(), userId: branchMgrId, type: 'new_proposal', title: 'New camp proposal', message: 'A new camp requires your confirmation.', read: false, createdAt: now },
    { id: uuidv4(), userId: teamLeaderId, type: 'route_today', title: 'Route for today', message: 'Your route is ready. Tap to view.', read: false, createdAt: now },
  ]);

  seeded = true;
}

// ---------- Router ----------
async function handleRoute(request, { params }) {
  const { path = [] } = await params;
  const route = `/${path.join('/')}`;
  const method = request.method;

  try {
    const db = await getDb();
    await seedIfEmpty(db);

    // Public routes
    if (route === '/' || route === '/root') {
      return handleCORS(NextResponse.json({ message: 'FINLIT360 API - ISCI Foundation', version: '1.0.0' }));
    }

    // ---- AUTH ----
    if (route === '/auth/send-otp' && method === 'POST') {
      const body = await request.json();
      const mobile = String(body.mobile || '').trim();
      if (!/^\d{10}$/.test(mobile)) {
        return handleCORS(NextResponse.json({ error: 'Enter a valid 10-digit mobile number' }, { status: 400 }));
      }
      const user = await db.collection('users').findOne({ mobile });
      if (!user) {
        return handleCORS(NextResponse.json({ error: 'Mobile number not registered. Contact your administrator.' }, { status: 404 }));
      }
      await db.collection('otp_sessions').updateOne(
        { mobile },
        { $set: { mobile, otp: DEMO_OTP, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } },
        { upsert: true }
      );
      return handleCORS(NextResponse.json({ success: true, demoOtp: DEMO_OTP, mobile }));
    }

    if (route === '/auth/verify-otp' && method === 'POST') {
      const body = await request.json();
      const mobile = String(body.mobile || '').trim();
      const otp = String(body.otp || '').trim();
      const otpSession = await db.collection('otp_sessions').findOne({ mobile });
      if (!otpSession || otpSession.otp !== otp) {
        return handleCORS(NextResponse.json({ error: 'Invalid OTP' }, { status: 401 }));
      }
      if (new Date(otpSession.expiresAt) < new Date()) {
        return handleCORS(NextResponse.json({ error: 'OTP expired' }, { status: 401 }));
      }
      const user = await db.collection('users').findOne({ mobile });
      if (!user) return handleCORS(NextResponse.json({ error: 'User not found' }, { status: 404 }));
      const token = uuidv4();
      await db.collection('sessions').insertOne({
        token, userId: user.id, createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
      });
      await db.collection('otp_sessions').deleteOne({ mobile });
      await auditLog(db, { userId: user.id, action: 'login', entityType: 'session', entityId: token });
      return handleCORS(NextResponse.json({ token, user: clean(user) }));
    }

    // Auth-required from here
    const user = await getUserFromRequest(request, db);

    if (route === '/auth/me' && method === 'GET') {
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
      return handleCORS(NextResponse.json({ user: clean(user) }));
    }

    if (route === '/auth/logout' && method === 'POST') {
      const auth = request.headers.get('authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (token) await db.collection('sessions').deleteOne({ token });
      return handleCORS(NextResponse.json({ success: true }));
    }

    // Everything below requires auth
    if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    // ---- MASTER DATA (list & create) ----
    const masters = [
      ['/banks', 'banks'],
      ['/projects', 'projects'],
      ['/districts', 'districts'],
      ['/blocks', 'blocks'],
      ['/branches', 'branches'],
      ['/villages', 'villages'],
      ['/teams', 'teams'],
      ['/vehicles', 'vehicles'],
      ['/routes', 'routes'],
      ['/users', 'users'],
    ];
    for (const [r, coll] of masters) {
      if (route === r && method === 'GET') {
        const docs = await db.collection(coll).find({}).limit(2000).toArray();
        return handleCORS(NextResponse.json(cleanArr(docs)));
      }
      if (route === r && method === 'POST') {
        if (![ROLES.SUPER_ADMIN, ROLES.PROGRAM_MANAGER, ROLES.DISTRICT_COORDINATOR, ROLES.ROUTE_PLANNER].includes(user.role)) {
          return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
        }
        const body = await request.json();
        const doc = { id: uuidv4(), ...body, createdAt: new Date() };
        await db.collection(coll).insertOne(doc);
        await auditLog(db, { userId: user.id, action: 'create', entityType: coll, entityId: doc.id, after: doc });
        return handleCORS(NextResponse.json(clean(doc)));
      }
      // /branches/:id, /villages/:id, etc.
      const m = route.match(new RegExp(`^${r}/([^/]+)$`));
      if (m) {
        const id = m[1];
        if (method === 'GET') {
          const doc = await db.collection(coll).findOne({ id });
          if (!doc) return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }));
          return handleCORS(NextResponse.json(clean(doc)));
        }
        if (method === 'PATCH' || method === 'PUT') {
          const body = await request.json();
          const before = await db.collection(coll).findOne({ id });
          await db.collection(coll).updateOne({ id }, { $set: { ...body, updatedAt: new Date() } });
          const after = await db.collection(coll).findOne({ id });
          await auditLog(db, { userId: user.id, action: 'update', entityType: coll, entityId: id, before, after });
          return handleCORS(NextResponse.json(clean(after)));
        }
        if (method === 'DELETE') {
          if (user.role !== ROLES.SUPER_ADMIN) {
            return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          }
          const before = await db.collection(coll).findOne({ id });
          await db.collection(coll).deleteOne({ id });
          await auditLog(db, { userId: user.id, action: 'delete', entityType: coll, entityId: id, before });
          return handleCORS(NextResponse.json({ success: true }));
        }
      }
    }

    // ---- CAMPS ----
    if (route === '/camps' && method === 'GET') {
      const url = new URL(request.url);
      const status = url.searchParams.get('status');
      const districtId = url.searchParams.get('districtId');
      const branchId = url.searchParams.get('branchId');
      const teamId = url.searchParams.get('teamId');
      const q = {};
      if (status) q.status = status;
      if (districtId) q.districtId = districtId;
      if (branchId) q.branchId = branchId;
      if (teamId) q.teamId = teamId;

      // Role scoping
      if (user.role === ROLES.BRANCH_MANAGER || user.role === ROLES.BANK_REP) {
        if (user.branchId) q.branchId = user.branchId;
      } else if (user.role === ROLES.DISTRICT_COORDINATOR || user.role === ROLES.ROUTE_PLANNER) {
        if (user.districtId) q.districtId = user.districtId;
      } else if (user.role === ROLES.TEAM_LEADER || user.role === ROLES.FIELD_TRAINER) {
        if (user.teamId) q.teamId = user.teamId;
      } else if (user.role === ROLES.BANK_HQ) {
        if (user.bankId) q.bankId = user.bankId;
      }

      const camps = await db.collection('camps').find(q).sort({ proposedDate: -1 }).limit(500).toArray();
      return handleCORS(NextResponse.json(cleanArr(camps)));
    }

    if (route === '/camps' && method === 'POST') {
      if (![ROLES.SUPER_ADMIN, ROLES.PROGRAM_MANAGER, ROLES.DISTRICT_COORDINATOR].includes(user.role)) {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      }
      const body = await request.json();
      const camp = {
        id: uuidv4(),
        code: `FLC-${Math.floor(Math.random() * 9000) + 1000}`,
        bankId: body.bankId,
        projectId: body.projectId,
        districtId: body.districtId,
        branchId: body.branchId,
        villageId: body.villageId,
        routeId: null,
        teamId: null,
        status: 'awaiting_confirmation',
        proposedDate: body.proposedDate ? new Date(body.proposedDate) : null,
        confirmedDate: null,
        representative: null,
        expectedAudience: body.expectedAudience || 100,
        attendance: null,
        photos: [],
        remarks: body.remarks || '',
        verificationRemarks: '',
        timeline: [
          { id: uuidv4(), event: 'created', by: user.id, message: `Camp created by ${user.name}`, timestamp: new Date() },
          { id: uuidv4(), event: 'village_proposed', by: user.id, message: 'Village proposed', timestamp: new Date() },
          { id: uuidv4(), event: 'awaiting_confirmation', by: user.id, message: 'Awaiting branch confirmation', timestamp: new Date() },
        ],
        createdBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.collection('camps').insertOne(camp);
      await auditLog(db, { userId: user.id, action: 'create_camp', entityType: 'camps', entityId: camp.id, after: camp });

      // Notify branch manager
      const branchMgrs = await db.collection('users').find({ role: ROLES.BRANCH_MANAGER, branchId: body.branchId }).toArray();
      await notify(db, branchMgrs.map(u => u.id), {
        type: 'new_proposal',
        title: 'New camp proposal',
        message: `Camp ${camp.code} is awaiting your confirmation.`,
        campId: camp.id,
      });

      return handleCORS(NextResponse.json(clean(camp)));
    }

    const campMatch = route.match(/^\/camps\/([^/]+)(?:\/([^/]+))?$/);
    if (campMatch) {
      const campId = campMatch[1];
      const action = campMatch[2];
      const camp = await db.collection('camps').findOne({ id: campId });
      if (!camp) return handleCORS(NextResponse.json({ error: 'Camp not found' }, { status: 404 }));

      if (!action && method === 'GET') {
        return handleCORS(NextResponse.json(clean(camp)));
      }

      if (method === 'POST' && action) {
        const body = await request.json().catch(() => ({}));

        const setStatus = async (status, event, message, extra = {}) => {
          await db.collection('camps').updateOne(
            { id: campId },
            { $set: { status, updatedAt: new Date(), ...extra } }
          );
          await addTimeline(db, campId, { event, by: user.id, message });
          await auditLog(db, {
            userId: user.id, action: event, entityType: 'camps', entityId: campId,
            before: { status: camp.status }, after: { status },
          });
        };

        if (action === 'confirm') {
          if (user.role !== ROLES.BRANCH_MANAGER && user.role !== ROLES.SUPER_ADMIN) {
            return handleCORS(NextResponse.json({ error: 'Only Branch Manager can confirm' }, { status: 403 }));
          }
          await setStatus('confirmed', 'confirmed', `Confirmed by ${user.name}. ${body.remarks || ''}`, {
            confirmedDate: camp.proposedDate,
          });
          await notify(db, [camp.createdBy], { type: 'camp_confirmed', title: 'Camp confirmed', message: `${camp.code} confirmed by branch.`, campId });
        } else if (action === 'reject') {
          if (user.role !== ROLES.BRANCH_MANAGER && user.role !== ROLES.SUPER_ADMIN) {
            return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          }
          await setStatus('rejected', 'rejected', `Rejected by ${user.name}. Reason: ${body.reason || 'N/A'}`);
        } else if (action === 'request-change') {
          if (user.role !== ROLES.BRANCH_MANAGER) {
            return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          }
          await setStatus('change_requested', 'change_requested', `Change requested by ${user.name}: ${body.reason || ''}`);
        } else if (action === 'assign-representative') {
          if (![ROLES.BRANCH_MANAGER, ROLES.SUPER_ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) {
            return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          }
          const representative = {
            name: body.name, contact: body.contact, role: body.role || 'Bank Representative', remarks: body.remarks || '',
          };
          await setStatus('representative_assigned', 'representative_assigned', `Representative ${body.name} assigned`, { representative });
        } else if (action === 'assign-team') {
          if (![ROLES.DISTRICT_COORDINATOR, ROLES.SUPER_ADMIN, ROLES.PROGRAM_MANAGER, ROLES.ROUTE_PLANNER].includes(user.role)) {
            return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          }
          await setStatus('team_assigned', 'team_assigned', `Team assigned`, { teamId: body.teamId, routeId: body.routeId || null });
        } else if (action === 'schedule') {
          if (![ROLES.DISTRICT_COORDINATOR, ROLES.SUPER_ADMIN, ROLES.PROGRAM_MANAGER, ROLES.ROUTE_PLANNER].includes(user.role)) {
            return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          }
          await setStatus('scheduled', 'scheduled', `Scheduled for ${body.date}`, {
            proposedDate: body.date ? new Date(body.date) : camp.proposedDate,
            confirmedDate: body.date ? new Date(body.date) : camp.confirmedDate,
          });
        } else if (action === 'start') {
          if (user.role !== ROLES.TEAM_LEADER && user.role !== ROLES.SUPER_ADMIN) {
            return handleCORS(NextResponse.json({ error: 'Only Team Leader can start' }, { status: 403 }));
          }
          const gps = body.gps || null;
          await setStatus('in_progress', 'start', `Camp started at village.`, {
            startedAt: new Date(),
            gpsStart: gps ? { ...gps, timestamp: new Date() } : null,
            deviceInfo: body.deviceInfo || null,
          });
        } else if (action === 'photos') {
          // append photos (base64)
          const photos = (body.photos || []).map(p => ({
            id: uuidv4(),
            category: p.category,
            data: p.data, // base64 string
            gps: p.gps || null,
            uploadedAt: new Date(),
          }));
          await db.collection('camps').updateOne(
            { id: campId },
            { $push: { photos: { $each: photos } }, $set: { updatedAt: new Date() } }
          );
          await addTimeline(db, campId, { event: 'photos_uploaded', by: user.id, message: `${photos.length} photo(s) uploaded` });
        } else if (action === 'attendance') {
          const a = body.attendance || {};
          const total = (a.male || 0) + (a.female || 0) + (a.youth || 0) + (a.senior || 0) + (a.shg || 0) + (a.farmers || 0) + (a.students || 0) + (a.others || 0);
          await db.collection('camps').updateOne(
            { id: campId },
            { $set: { attendance: { ...a, total }, updatedAt: new Date() } }
          );
          await addTimeline(db, campId, { event: 'attendance_updated', by: user.id, message: `Attendance updated (${total} beneficiaries)` });
        } else if (action === 'submit') {
          if (user.role !== ROLES.TEAM_LEADER && user.role !== ROLES.SUPER_ADMIN) {
            return handleCORS(NextResponse.json({ error: 'Only Team Leader can submit' }, { status: 403 }));
          }
          const updated = await db.collection('camps').findOne({ id: campId });
          if ((updated.photos || []).length < 5) {
            return handleCORS(NextResponse.json({ error: 'At least 5 photos required before submission' }, { status: 400 }));
          }
          if (!updated.attendance || !updated.attendance.total) {
            return handleCORS(NextResponse.json({ error: 'Attendance is required before submission' }, { status: 400 }));
          }
          const duration = updated.startedAt ? Math.round((Date.now() - new Date(updated.startedAt).getTime()) / 60000) : null;
          await setStatus('completed', 'completed', `Camp completed by ${user.name}`, {
            completedAt: new Date(),
            duration,
            gpsEnd: body.gps || null,
            remarks: body.remarks || updated.remarks || '',
          });
          // Notify DC & PM
          const dcUsers = await db.collection('users').find({ role: { $in: [ROLES.DISTRICT_COORDINATOR, ROLES.PROGRAM_MANAGER] }, districtId: updated.districtId }).toArray();
          const pmUsers = await db.collection('users').find({ role: ROLES.PROGRAM_MANAGER }).toArray();
          await notify(db, [...dcUsers, ...pmUsers].map(u => u.id), {
            type: 'camp_completed', title: 'Camp completed', message: `${updated.code} submitted for verification`, campId,
          });
        } else if (action === 'verify') {
          if (![ROLES.DISTRICT_COORDINATOR, ROLES.SUPER_ADMIN, ROLES.PROGRAM_MANAGER].includes(user.role)) {
            return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          }
          await setStatus('verified', 'verified', `Verified by ${user.name}. ${body.remarks || ''}`, {
            verificationRemarks: body.remarks || '',
          });
        } else if (action === 'close') {
          if (user.role !== ROLES.SUPER_ADMIN) {
            return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
          }
          await setStatus('closed', 'closed', `Closed by ${user.name}`);
        } else if (action === 'photos-delete') {
          const photoId = body.photoId;
          await db.collection('camps').updateOne({ id: campId }, { $pull: { photos: { id: photoId } } });
        } else {
          return handleCORS(NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 }));
        }
        const updated = await db.collection('camps').findOne({ id: campId });
        return handleCORS(NextResponse.json(clean(updated)));
      }
    }

    // ---- DASHBOARD ----
    if (route === '/dashboard' && method === 'GET') {
      const q = {};
      if (user.role === ROLES.BRANCH_MANAGER || user.role === ROLES.BANK_REP) q.branchId = user.branchId;
      else if (user.role === ROLES.DISTRICT_COORDINATOR || user.role === ROLES.ROUTE_PLANNER) q.districtId = user.districtId;
      else if (user.role === ROLES.TEAM_LEADER || user.role === ROLES.FIELD_TRAINER) q.teamId = user.teamId;
      else if (user.role === ROLES.BANK_HQ) q.bankId = user.bankId;

      const camps = await db.collection('camps').find(q).toArray();
      const total = camps.length;
      const byStatus = {};
      for (const s of CAMP_STATUS) byStatus[s] = 0;
      let beneficiaries = 0;
      let women = 0;
      let gpsCompliant = 0;
      let photoCompliant = 0;
      let completed = 0;
      const today = new Date().toDateString();
      let todaysCount = 0;
      for (const c of camps) {
        byStatus[c.status] = (byStatus[c.status] || 0) + 1;
        if (c.attendance?.total) beneficiaries += c.attendance.total;
        if (c.attendance?.female) women += c.attendance.female;
        if (['completed', 'verified', 'in_report', 'closed'].includes(c.status)) {
          completed++;
          if (c.gpsStart) gpsCompliant++;
          if ((c.photos || []).length >= 5) photoCompliant++;
        }
        if (c.proposedDate && new Date(c.proposedDate).toDateString() === today) todaysCount++;
      }
      const [banks, projects, districts, branches, teams] = await Promise.all([
        db.collection('banks').countDocuments(),
        db.collection('projects').countDocuments(),
        db.collection('districts').countDocuments(),
        db.collection('branches').countDocuments(),
        db.collection('teams').countDocuments(),
      ]);
      return handleCORS(NextResponse.json({
        counts: { total, banks, projects, districts, branches, teams, todaysCount, completed, beneficiaries, women },
        byStatus,
        compliance: {
          gps: completed ? Math.round((gpsCompliant / completed) * 100) : 0,
          photos: completed ? Math.round((photoCompliant / completed) * 100) : 0,
          completion: total ? Math.round((completed / total) * 100) : 0,
        },
      }));
    }

    // ---- ANALYTICS ----
    if (route === '/analytics' && method === 'GET') {
      const camps = await db.collection('camps').find({}).toArray();
      const districts = await db.collection('districts').find({}).toArray();
      const branches = await db.collection('branches').find({}).toArray();
      const teams = await db.collection('teams').find({}).toArray();

      const byDistrict = districts.map(d => {
        const dc = camps.filter(c => c.districtId === d.id);
        const done = dc.filter(c => ['completed', 'verified', 'closed', 'in_report'].includes(c.status)).length;
        return { name: d.name, allocated: dc.length, completed: done };
      });
      const byBranch = branches.map(b => {
        const bc = camps.filter(c => c.branchId === b.id);
        const done = bc.filter(c => ['completed', 'verified', 'closed', 'in_report'].includes(c.status)).length;
        return { name: b.name, allocated: bc.length, completed: done };
      });
      const byTeam = teams.map(t => {
        const tc = camps.filter(c => c.teamId === t.id);
        const done = tc.filter(c => ['completed', 'verified', 'closed', 'in_report'].includes(c.status)).length;
        return { name: t.name, allocated: tc.length, completed: done };
      });

      // Daily trend last 14 days
      const trend = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const cnt = camps.filter(c => c.proposedDate && new Date(c.proposedDate).toISOString().slice(0, 10) === key).length;
        const done = camps.filter(c => c.completedAt && new Date(c.completedAt).toISOString().slice(0, 10) === key).length;
        trend.push({ date: key.slice(5), scheduled: cnt, completed: done });
      }

      // Beneficiary distribution
      const agg = { male: 0, female: 0, youth: 0, senior: 0, shg: 0, farmers: 0, students: 0, others: 0 };
      for (const c of camps) {
        if (c.attendance) {
          for (const k of Object.keys(agg)) agg[k] += c.attendance[k] || 0;
        }
      }
      const beneficiaryDist = Object.entries(agg).map(([name, value]) => ({ name, value }));

      // Camp locations for map
      const villages = await db.collection('villages').find({}).toArray();
      const locations = camps
        .filter(c => ['completed', 'verified', 'in_report', 'closed'].includes(c.status))
        .map(c => {
          const v = villages.find(vv => vv.id === c.villageId);
          return v ? { lat: v.lat, lng: v.lng, name: v.name, code: c.code, status: c.status } : null;
        })
        .filter(Boolean);

      return handleCORS(NextResponse.json({ byDistrict, byBranch, byTeam, trend, beneficiaryDist, locations }));
    }

    // ---- NOTIFICATIONS ----
    if (route === '/notifications' && method === 'GET') {
      const notifs = await db.collection('notifications').find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).toArray();
      return handleCORS(NextResponse.json(cleanArr(notifs)));
    }
    const notifMatch = route.match(/^\/notifications\/([^/]+)\/read$/);
    if (notifMatch && method === 'POST') {
      await db.collection('notifications').updateOne({ id: notifMatch[1], userId: user.id }, { $set: { read: true } });
      return handleCORS(NextResponse.json({ success: true }));
    }

    // ---- AUDIT LOGS ----
    if (route === '/audit' && method === 'GET') {
      if (![ROLES.SUPER_ADMIN, ROLES.REGIONAL_OFFICE, ROLES.PROGRAM_MANAGER].includes(user.role)) {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      }
      const logs = await db.collection('audit_logs').find({}).sort({ timestamp: -1 }).limit(200).toArray();
      return handleCORS(NextResponse.json(cleanArr(logs)));
    }

    return handleCORS(NextResponse.json({ error: `Route ${route} not found` }, { status: 404 }));
  } catch (err) {
    console.error('API Error:', err);
    return handleCORS(NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 }));
  }
}

export const GET = handleRoute;
export const POST = handleRoute;
export const PUT = handleRoute;
export const DELETE = handleRoute;
export const PATCH = handleRoute;
