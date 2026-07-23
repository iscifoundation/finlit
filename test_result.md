# FINLIT360 v3 - Test Results

## Major Update: Magic Link Auth + Business Feature Set

### What changed
1. **Magic-link email auth via Resend** (`POST /auth/magic-link` + `GET /auth/magic-callback?token=X`)
2. Real Admin `[email protected]` (mobile 7987140498) is the only account that can toggle demo login
3. **Team required** when creating programs (POST /programs → 400 if missing teamId)
4. **Program confirm** action extended: BM (own branch) always, Admin/RO anytime, PM only after 30 min with reason
5. **Branch creation** with `branchManagerEmail` auto-creates a BM user linked to the branch
6. Photos in PDFs now A6 size (~160×120mm) — 2 photos per page
7. **Daily Expenses** (`/expenses`) — per-day per-team, not per-program
8. **Attendance** (`/attendance`) — replaces Salaries; team-manager marks daily attendance
9. **Messages** (`/messages`) — threaded RO ↔ (Admin+PM)
10. **Settings** (`/settings`, `/settings/demo-login`) — only [email protected] can toggle demo login
11. Team members can have `isTeamManager: true` flag

## Testing Protocol
- ALWAYS read this file before invoking testing agent
- NEVER edit this "Testing Protocol" section
- Run backend tests via deep_testing_backend_nextjs
- ASK user before invoking deep_testing_frontend_nextjs

## Backend Tests Requested

### 1. Magic Link
- POST /auth/magic-link {email: "unknown@x"} → 404 not registered
- POST /auth/magic-link {email: "not-email"} → 400
- POST /auth/magic-link {email: "[email protected]"} → 200 success (email sends real via Resend — verify DB `magic_links` collection got a fresh row for this email with `used:false`)
- GET /auth/magic-callback?token=<the token from DB> → returns HTML with `localStorage.setItem('finlit_token', ...)` (302 → HTML). After first successful use, the `magic_links` row must have `used:true`. Second call to same token → redirects to `/?error=link_used`.
- Expired link → redirect to /?error=link_expired

### 2. Program creation requires team
- POST /programs {branchId, villageId, proposedDate, remarks} WITHOUT teamId → **400** "Team is required"
- POST /programs WITH valid teamId → 200

### 3. Confirmation matrix
- BM 9000000003 (own branch program) → confirm → 200
- BM 9000000003 for a program NOT in own branch → 403
- Admin (9000000001) → confirm any program in `proposed` state → 200
- RO 9000000004 → confirm own-RO program → 200; other-RO → 403
- PM 9000000002 → confirm a program < 30 min old → 403 "Try again in ... minutes"
- PM 9000000002 → confirm a program > 30 min old WITHOUT reason → 400 "Please provide a reason"
- PM with reason & > 30 min → 200 (test by inserting a program directly in DB with createdAt = 1 hour ago)

### 4. Branch auto-create BM
- Login as real admin (`[email protected]`, insert session directly). POST /branches {districtId, name:"AutoBranch", code:"AB", address:"...", branchManagerEmail:"[email protected]", branchManagerName:"New BM"} → 200; verify new user with role=branch_manager, email=[email protected], branchId=(new branch id), isDemo:false was created; branch.managerId and managerEmail are set.
- Same request as demo admin (9000000001) with new BM email → 403 "Demo users cannot auto-create..."

### 5. Settings
- Login as demo admin (9000000001) → GET /settings → 200
- Demo admin POST /settings/demo-login {enabled: false} → 403 "Only [email protected]..."
- Real admin (`[email protected]`) POST /settings/demo-login {enabled: false} → 200; verify /auth/send-otp for demo mobile now returns 403 "Demo login has been disabled..."
- Real admin POST /settings/demo-login {enabled: true} → 200; verify send-otp works again

### 6. Messages
- RO 9000000004 POST /messages {text:"Hello team"} → 200 (roId inferred from user.roId)
- Admin GET /messages?roId=<RO's roId> → returns list including the message
- PM GET /messages?roId=<RO's roId> → returns list
- Non-participant role (BM/Team) POST /messages → 403

### 7. Expenses & Attendance
- Team user (9000000005) POST /expenses {date, teamId, taxi:100, food:200, ...} → 200; verify total computed
- Team user GET /expenses → returns only own team's expenses
- Admin POST /expenses/:id/authenticate → 200, sets authenticatedBy
- Team user POST /attendance {date, teamId, records:[{memberId,status:'present'}, ...]} → 200
- Same date+team POST /attendance again → upserts (single row per date+team)

### 8. Full regression on prior features
- Auth send-otp/verify-otp/me/logout for demo admin (when demo enabled)
- Master data fee/salary privacy
- Full program lifecycle create→confirm→upload→authenticate
- Invoice CRUD + payment (PM 403 on GET /invoices)
- User Management: demo user restrictions
- Firebase-verify endpoint (still exists) rejects invalid tokens

Report all failures. Do NOT modify code.