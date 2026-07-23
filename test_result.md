# FINLIT360 v3.1 - Test Results

## Latest Update: Mandatory Email + Primary Admin Bootstrap + Demo Data Wipe

### What changed in this iteration
1. **Primary admin bootstrap**: Server startup (via `seedIfEmpty`) ensures a user with `email=[email protected]`, `name=Mohit Modi`, `role=admin`, `isDemo=false` exists. If any admin previously existed with a different email, it is overwritten to this canonical email.
2. **Demo data purge (one-time)**: On first boot after v3.1, the following collections are wiped clean: `users` (only isDemo:true rows), `banks`, `regional_offices`, `districts`, `branches`, `villages`, `teams`, `programs`, `invoices`, `expenses`, `attendance`, `messages`, `notifications`, `audit_logs`, `salary_payments`, `magic_links`, `otp_sessions`, `sessions`. Guarded by `settings.demoDataWiped_v3=true` flag so it only runs once.
3. **Email is now MANDATORY** on:
   - `POST /users` (create user of any role: admin / program_manager / branch_manager / regional_office / team)
   - `POST /branches` (`branchManagerEmail` is required; BM user is auto-created)
   - `PATCH /users/:id` when `email` is being changed (must be valid + unique)
4. **Mobile is now OPTIONAL** on `POST /users`. If provided, must be exactly 10 digits and unique.
5. **Frontend forms** (`UsersView`, `EntitiesView` → Branch) now enforce these client-side and show a red asterisk for required fields.
6. **`/settings/demo-login`** endpoint gate updated: only `[email protected]` (constant `PRIMARY_ADMIN_EMAIL`) can toggle.
7. Login screen defaults `demoEnabled=false` unless explicitly turned on in settings (since demo users no longer exist by default).

## Testing Protocol
- ALWAYS read this file before invoking testing agent
- NEVER edit this "Testing Protocol" section
- Run backend tests via deep_testing_backend_nextjs
- ASK user before invoking deep_testing_frontend_nextjs

## Backend Tests Requested (v3.1)

Primary admin credentials for login/session:
- Email: `[email protected]`
- To obtain an auth token for testing: call `POST /api/auth/magic-link { email: "[email protected]" }` (an entry is created in `magic_links` collection). Fetch the newest unused token from Mongo directly (e.g. `db.magic_links.find({ email: "[email protected]", used: false }).sort({ createdAt: -1 }).limit(1)`) then `GET /api/auth/magic-callback?token=<token>` — this creates a session row and returns HTML containing `localStorage.setItem('finlit_token','<sessionToken>')`. Parse that token or read it directly from `db.sessions` to use as `Authorization: Bearer <sessionToken>` for subsequent requests. Alternatively, insert a session document directly for testing convenience.

### 1. Seed / Bootstrap
- After a fresh server start, `GET /api/` returns 200 and the DB has exactly ONE user: `[email protected]` with `role=admin`, `isDemo=false`. All other collections empty. `settings.demoDataWiped_v3.value===true` present.
- Re-hitting the API should NOT re-wipe data (idempotent).

### 2. Magic link with the primary admin
- `POST /api/auth/magic-link` `{ email: "[email protected]" }` → 200; a row appears in `magic_links`.
- `POST /api/auth/magic-link` `{ email: "unknown@nowhere" }` → 404 not registered.
- `POST /api/auth/magic-link` `{ email: "not-an-email" }` → 400 valid email.
- `GET /api/auth/magic-callback?token=<valid>` → 200 HTML that sets `finlit_token` in localStorage; session row created; magic_links row marked `used:true`.
- Second call with same token → 302 redirect to `/?error=link_used`.

### 3. User creation email validation (auth as primary admin)
- `POST /api/users` `{ name: "X", role: "program_manager" }` (missing email) → 400 "A valid email is required..."
- `POST /api/users` `{ name: "X", email: "invalid", role: "program_manager" }` → 400 "valid email"
- `POST /api/users` `{ name: "PM One", email: "[email protected]", role: "program_manager" }` → 200; new user has email set, isDemo:false, mobile:null.
- `POST /api/users` again with same email → 409 "already exists".
- `POST /api/users` `{ name: "X", email: "[email protected]", role: "team", mobile: "123" }` → 400 "10-digit mobile".
- `POST /api/users` `{ name: "X", email: "[email protected]", role: "team", mobile: "9876543210" }` → 200.
- `POST /api/users` again with same mobile → 409.
- Valid create with role=`admin` / `program_manager` / `branch_manager` / `regional_office` / `team` all succeed when email + name provided (using unique emails).

### 4. Branch creation requires branchManagerEmail (auth as primary admin)
- First need a bank + RO + district. Create as admin:
  - `POST /api/banks` `{ name: "Test Bank", code: "TB" }` → 200
  - `POST /api/regional_offices` `{ bankId, name: "Test RO", state: "MP", address: "...", feePerProgram: 3750 }` → 200
  - `POST /api/districts` `{ roId, name: "Test District", state: "MP" }` → 200
- `POST /api/branches` `{ districtId, name: "Br1", code: "B1", address: "addr" }` (no branchManagerEmail) → 400 "Branch Manager email is required..."
- `POST /api/branches` `{ districtId, name: "Br1", code: "B1", address: "addr", branchManagerEmail: "invalid" }` → 400.
- `POST /api/branches` `{ districtId, name: "Br1", code: "B1", address: "addr", branchManagerEmail: "[email protected]", branchManagerName: "New BM" }` → 200; verify:
  - A new user was inserted with `email=[email protected]`, `role=branch_manager`, `branchId=<new branch id>`, `isDemo:false`.
  - The branch document has `managerId`, `managerName="New BM"`, `managerEmail="[email protected]"` populated.
- `POST /api/branches` with the SAME `branchManagerEmail` again but for a different branch → 200; the existing BM user should be RE-linked (branchId updated) — no duplicate user is created.

### 5. Update user email (PATCH validation)
- `PATCH /api/users/<id>` `{ email: "" }` → 400.
- `PATCH /api/users/<id>` `{ email: "invalid" }` → 400.
- `PATCH /api/users/<id>` `{ email: "<some other user's email>" }` → 409.
- `PATCH /api/users/<id>` `{ email: "[email protected]" }` → 200; email updated.

### 6. Settings + Demo toggle
- `GET /api/settings` (as primary admin) → 200 returning `{ demoLoginEnabled?, demoDataWiped_v3: true }` (both may exist).
- `POST /api/settings/demo-login` `{ enabled: false }` with non-primary-admin session → 403 (mention of `[email protected]`).
- `POST /api/settings/demo-login` `{ enabled: false }` with primary-admin session → 200; setting persisted.

### 7. Full workflow regression (with only real accounts)
- Primary admin creates Bank → RO → District → Branch (auto-creates BM) → Village → Team → creates a Program with teamId → 200.
- Program `POST /api/programs/:id/confirm` invoked by primary admin → status becomes `confirmed`.

Report all failures. Do NOT modify code.


## Test Execution Results (Testing Agent)

### Date: 2026-01-23
### Tester: Testing Agent (Backend API Testing)

---

### ❌ CRITICAL BUG FOUND - BLOCKS ALL TESTING

**Issue**: PRIMARY_ADMIN_EMAIL constant is set to literal string "[email protected]" instead of a real email address

**Evidence**:
- Database shows admin user email: `[email protected]` (17 characters)
- Email bytes: `b'[email protected]'`
- Email validation regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` rejects this string (returns False)
- All magic link requests return 400: "Enter a valid email address"

**Impact**: 
- ✅ Magic link authentication is COMPLETELY BROKEN
- ✅ Cannot obtain session token via magic link flow
- ✅ All subsequent tests requiring authentication cannot proceed

**Root Cause**:
File: `/app/app/api/[[...path]]/route.js`, Line 22:
```javascript
const PRIMARY_ADMIN_EMAIL = '[email protected]';
```

This should be a real email address like `'[email protected]'` or `'[email protected]'`

**Workaround Used for Testing**:
Created session directly in MongoDB database to bypass magic link authentication:
```python
session_token = str(uuid.uuid4())
db.sessions.insert_one({
    "token": session_token,
    "userId": admin["id"],
    "createdAt": datetime.utcnow(),
    "expiresAt": datetime.utcnow() + timedelta(days=30)
})
```

---

### Test Results Summary

#### 1. Seed / Bootstrap
- ✅ **PASS**: Seed is idempotent - no re-wipe occurred
- ❌ **FAIL**: Collection banks should be empty (found 1 document from previous test)
- ✅ **PASS**: ONE user exists with role=admin, isDemo=false
- ✅ **PASS**: demoDataWiped_v3 flag is set to true
- ⚠️ **NOTE**: Need to clean up test data before checking empty collections

#### 2. Magic Link Auth
- ✅ **PASS**: Invalid email format correctly rejected with 400
- ✅ **PASS**: Unknown email correctly rejected with 404
- ❌ **FAIL**: Valid primary admin email rejected with 400 (CRITICAL BUG - email is "[email protected]")
- ❌ **FAIL**: Cannot test magic link callback (no token available due to above bug)
- ❌ **FAIL**: Cannot test token reuse (no token available due to above bug)

#### 3. User Creation Email Validation
- ❌ **BLOCKED**: All tests return 401 Unauthorized (no valid session token due to magic link bug)
- Cannot test: Missing email validation
- Cannot test: Invalid email validation
- Cannot test: Duplicate email validation
- Cannot test: Mobile validation

#### 4. Branch Creation with Branch Manager Email
- ❌ **BLOCKED**: All tests return 401 Unauthorized (no valid session token due to magic link bug)
- Cannot test: Missing branchManagerEmail validation
- Cannot test: Invalid branchManagerEmail validation
- Cannot test: Auto-create BM user
- Cannot test: Re-link existing BM user

#### 5. User Update Email Validation
- ❌ **BLOCKED**: All tests return 401 Unauthorized (no valid session token due to magic link bug)
- Cannot test: Empty email validation
- Cannot test: Invalid email validation
- Cannot test: Duplicate email validation

#### 6. Settings Demo Login
- ❌ **BLOCKED**: All tests return 401 Unauthorized (no valid session token due to magic link bug)
- Cannot test: GET /settings
- Cannot test: Non-primary admin toggle
- Cannot test: Primary admin toggle

#### 7. Full Workflow Regression
- ❌ **BLOCKED**: Cannot test (no valid session token due to magic link bug)

---

### Backend Code Review Findings

**Positive Findings**:
1. ✅ Email validation regex is correctly implemented: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
2. ✅ Seed/bootstrap logic correctly creates ONE admin user
3. ✅ Demo data wipe flag is correctly set and checked for idempotency
4. ✅ Email normalization (lowercase + trim) is implemented
5. ✅ User creation requires email (line 246-248)
6. ✅ Branch creation requires branchManagerEmail (line 334-335)
7. ✅ User PATCH validates email (line 298-303)
8. ✅ Settings demo-login requires PRIMARY_ADMIN_EMAIL (line 717-718)

**Critical Issues**:
1. ❌ **PRIMARY_ADMIN_EMAIL is set to "[email protected]" instead of a real email** (line 22)
   - This breaks the entire magic link authentication flow
   - The string "[email protected]" does not match the email validation regex
   - All magic link requests fail with 400 error

---

### Recommendations for Main Agent

**IMMEDIATE ACTION REQUIRED**:
1. Fix PRIMARY_ADMIN_EMAIL constant in `/app/app/api/[[...path]]/route.js` line 22
   - Change from: `const PRIMARY_ADMIN_EMAIL = '[email protected]';`
   - Change to: `const PRIMARY_ADMIN_EMAIL = '[email protected]';` (or any valid email)

2. After fixing, re-run seed to update the database:
   - Delete existing admin user from database
   - Restart server to trigger seedIfEmpty
   - Verify new admin user has valid email

3. Re-run all v3.1 tests after fix

**TESTING STATUS**: 
- 🔴 **BLOCKED** - Cannot proceed with comprehensive testing until PRIMARY_ADMIN_EMAIL bug is fixed
- Only 3 tests passed (seed idempotency, invalid email format, unknown email)
- 25+ tests blocked due to authentication failure

---
