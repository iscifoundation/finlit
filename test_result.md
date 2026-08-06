# FINLIT360 v3.2 – Cloudinary direct-upload + PDF-embed test plan

## What changed (Phase 1: prevent 520 errors)
1. **Frontend photo uploads bypass our API entirely** — images are compressed client-side to ≤500 KB and POSTed directly to Cloudinary via unsigned upload preset.
   - Cloudinary cloud name: `o5sh6ccg`
   - Cloudinary preset: `finlit_photos` (unsigned)
   - Folder: `finlit360`
   - Env vars: `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_PRESET`
2. **Backend `POST /api/programs/:id/upload-data`** now REQUIRES `photos[].url` (http(s) URL). Base64 `photos[].data` is REJECTED with 400. Stored fields per photo: `id`, `url`, `publicId`, `width`, `height`, `bytes`, `gps`, `source`, `uploadedAt`.
3. **PDF report** now fetches each Cloudinary URL, converts to a data URL in-browser, then embeds via jsPDF `addImage`. Legacy base64 photos (`.data`) still render (backward compat).

## Testing Protocol
- ALWAYS read this file before invoking testing agent
- NEVER edit this "Testing Protocol" section
- Run backend tests via deep_testing_backend_nextjs
- ASK user before invoking deep_testing_frontend_nextjs

## Backend tests requested

Auth: `POST /api/auth/login { username: "Admin", password: "Password" }` — token is returned (mustChangePassword may be true — that's fine, the returned token is still usable for testing). Add `Authorization: Bearer <token>` header on subsequent requests.

Note: password in Mongo may have been changed by earlier tests. If Admin login returns 401, reset via mongosh:
`db.users.updateOne({role:"admin"},{$set:{passwordHash: <bcrypt hash of "Password">, mustChangePassword:true}})` — bcrypt library is at `/app/node_modules/bcryptjs`.

### 1. Setup a program in `confirmed` state (needed for upload-data as team, but Admin/PM can skip that gate)
- Create: Bank → RO → District → Branch (with `branchManagerEmail`) → Village → Team (with `leaderMode:"new"`, `leaderName`, `leaderEmail`) → Program (with all IDs + `teamId` + `proposedDate`).
- Confirm the program: `POST /api/programs/:id/confirm` (as Admin).

### 2. Reject base64 upload (regression prevention)
- `POST /api/programs/:id/upload-data { photos: [{ data: "data:image/jpeg;base64,/9j/..." }] }` (as Admin)
- Expect **400** with message mentioning `url is required` (no base64 accepted). This proves the API no longer receives large image payloads.

### 3. Reject malformed url
- `POST /api/programs/:id/upload-data { photos: [{ url: "" }] }` → **400**.
- `POST /api/programs/:id/upload-data { photos: [{ url: "not-a-url" }] }` → **400** with "http(s) URL" message.

### 4. Accept Cloudinary-style URL payloads
- `POST /api/programs/:id/upload-data { photos: [ { url: "https://res.cloudinary.com/o5sh6ccg/image/upload/v1/test/a.jpg", publicId: "test/a", width: 1200, height: 900, bytes: 480000, gps: { lat: 26.2, lng: 78.2 }, source: "camera" } ] }`
- Expect **200**; program `photos` array should contain a new item with `id` (uuid), `url` exactly as given, `publicId`, `width`, `height`, `bytes`, `gps`, `source`, `uploadedAt`.
- The response should NOT contain any `data` field on photos.

### 5. Appending, not replacing
- Upload another photo via the same endpoint — verify the array grows (previous photo remains).

### 6. Delete photo
- `POST /api/programs/:id/delete-photo { photoId: "<id from step 4>" }` (as Admin) → **200**, the photo is removed.
- Verify `program.photos` length decreased by 1.

### 7. Auto-transition to `conducted`
- After 4 uploads + setting `participants > 0` via `POST /api/programs/:id/upload-data { participants: 65 }`, the status should flip to `conducted` automatically (existing behaviour; verify unchanged).

### 8. Authenticated-state guard
- After `POST /api/programs/:id/authenticate` (Admin), attempts to `upload-data` new photos or delete a photo should return **409** with "Ask Admin to request re-authentication before editing." (already-implemented guard; sanity-check).

### 9. Cleanup
- Delete test artefacts after tests (banks/ROs/districts/branches/villages/teams/programs created for this test).

Report pass/fail for each with concrete evidence. DO NOT modify code.
