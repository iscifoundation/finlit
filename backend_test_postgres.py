#!/usr/bin/env python3
"""
FINLIT360 v3.3 Backend Test - Supabase Postgres Migration
Tests the MongoDB → Postgres migration via JSONB shim at /app/lib/pgdb.js
All existing API contracts should behave identically.
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://finlit360-camp.preview.emergentagent.com/api"
ADMIN_USERNAME = "Admin"
ADMIN_PASSWORD = "Password"

# Test state
token = None
created_ids = {
    'bank': None,
    'ro': None,
    'district': None,
    'branch': None,
    'bm_user': None,
    'village': None,
    'team': None,
    'team_leader': None,
    'programs': [],  # Will store multiple program IDs for sequencing tests
}

def log(msg, level="INFO"):
    """Log test messages"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")

def test_auth():
    """Test 1: Authenticate as Admin (username Admin / password Password)"""
    global token
    log("=" * 80)
    log("TEST 1: Admin Authentication")
    log("=" * 80)
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
            timeout=10
        )
        
        log(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {response.status_code}", "ERROR")
            log(f"Response: {response.text}", "ERROR")
            return False
        
        data = response.json()
        if 'token' not in data:
            log(f"❌ FAIL: No token in response: {data}", "ERROR")
            return False
        
        token = data['token']
        log(f"✅ PASS: Admin authenticated successfully")
        log(f"Token: {token[:20]}...")
        log(f"User: {data.get('user', {}).get('name', 'N/A')}")
        log(f"Must change password: {data.get('mustChangePassword', False)}")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception during auth: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

def headers():
    """Get auth headers"""
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def test_full_crud_chain():
    """Test 2: Full CRUD chain with auto-user creation verification"""
    log("\n" + "=" * 80)
    log("TEST 2: Full CRUD Chain (Bank → RO → District → Branch → Village → Team → Program)")
    log("=" * 80)
    
    try:
        # Create Bank
        log("\n--- Creating Bank ---")
        bank_resp = requests.post(
            f"{BASE_URL}/banks",
            json={"name": "TB", "code": "TBC"},
            headers=headers(),
            timeout=10
        )
        if bank_resp.status_code != 200:
            log(f"❌ FAIL: Bank creation failed: {bank_resp.status_code} - {bank_resp.text}", "ERROR")
            return False
        bank = bank_resp.json()
        created_ids['bank'] = bank['id']
        log(f"✅ Bank created: {bank['name']} (ID: {bank['id']})")
        
        # Create Regional Office
        log("\n--- Creating Regional Office ---")
        ro_resp = requests.post(
            f"{BASE_URL}/regional_offices",
            json={
                "name": "TRO",
                "state": "MP",
                "bankId": bank['id'],
                "feePerProgram": 3750
            },
            headers=headers(),
            timeout=10
        )
        if ro_resp.status_code != 200:
            log(f"❌ FAIL: RO creation failed: {ro_resp.status_code} - {ro_resp.text}", "ERROR")
            return False
        ro = ro_resp.json()
        created_ids['ro'] = ro['id']
        log(f"✅ RO created: {ro['name']} (ID: {ro['id']})")
        
        # Create District
        log("\n--- Creating District ---")
        district_resp = requests.post(
            f"{BASE_URL}/districts",
            json={
                "name": "TD",
                "state": "MP",
                "roId": ro['id']
            },
            headers=headers(),
            timeout=10
        )
        if district_resp.status_code != 200:
            log(f"❌ FAIL: District creation failed: {district_resp.status_code} - {district_resp.text}", "ERROR")
            return False
        district = district_resp.json()
        created_ids['district'] = district['id']
        log(f"✅ District created: {district['name']} (ID: {district['id']})")
        
        # Create Branch with auto-BM creation
        log("\n--- Creating Branch (with auto-BM creation) ---")
        bm_email = f"tbm-{datetime.now().timestamp()}@example.com"
        branch_resp = requests.post(
            f"{BASE_URL}/branches",
            json={
                "name": "TBr",
                "districtId": district['id'],
                "branchManagerEmail": bm_email,
                "branchManagerName": "Test BM"
            },
            headers=headers(),
            timeout=10
        )
        if branch_resp.status_code != 200:
            log(f"❌ FAIL: Branch creation failed: {branch_resp.status_code} - {branch_resp.text}", "ERROR")
            return False
        branch = branch_resp.json()
        created_ids['branch'] = branch['id']
        log(f"✅ Branch created: {branch['name']} (ID: {branch['id']})")
        
        # Verify auto-created BM user
        log("\n--- Verifying auto-created Branch Manager user ---")
        users_resp = requests.get(f"{BASE_URL}/users", headers=headers(), timeout=10)
        if users_resp.status_code != 200:
            log(f"❌ FAIL: Could not fetch users: {users_resp.status_code}", "ERROR")
            return False
        
        users = users_resp.json()
        bm_user = next((u for u in users if u.get('email') == bm_email), None)
        
        if not bm_user:
            log(f"❌ FAIL: Branch Manager user not auto-created", "ERROR")
            return False
        
        if bm_user.get('role') != 'branch_manager':
            log(f"❌ FAIL: BM user role is '{bm_user.get('role')}', expected 'branch_manager'", "ERROR")
            return False
        
        if bm_user.get('branchId') != branch['id']:
            log(f"❌ FAIL: BM user branchId mismatch", "ERROR")
            return False
        
        created_ids['bm_user'] = bm_user['id']
        log(f"✅ Branch Manager user auto-created: {bm_user['name']} (role={bm_user['role']}, branchId={bm_user['branchId']})")
        
        # Create Village
        log("\n--- Creating Village ---")
        village_resp = requests.post(
            f"{BASE_URL}/villages",
            json={
                "name": "TV",
                "branchId": branch['id'],
                "lat": 26.2,
                "lng": 78.2
            },
            headers=headers(),
            timeout=10
        )
        if village_resp.status_code != 200:
            log(f"❌ FAIL: Village creation failed: {village_resp.status_code} - {village_resp.text}", "ERROR")
            return False
        village = village_resp.json()
        created_ids['village'] = village['id']
        log(f"✅ Village created: {village['name']} (ID: {village['id']})")
        
        # Create Team with auto-leader creation
        log("\n--- Creating Team (with auto-leader creation) ---")
        tl_email = f"tl-{datetime.now().timestamp()}@example.com"
        team_resp = requests.post(
            f"{BASE_URL}/teams",
            json={
                "name": "TT",
                "leaderMode": "new",
                "leaderName": "TL",
                "leaderEmail": tl_email,
                "leaderDailySalary": 500
            },
            headers=headers(),
            timeout=10
        )
        if team_resp.status_code != 200:
            log(f"❌ FAIL: Team creation failed: {team_resp.status_code} - {team_resp.text}", "ERROR")
            return False
        team = team_resp.json()
        created_ids['team'] = team['id']
        log(f"✅ Team created: {team['name']} (ID: {team['id']})")
        
        # Verify auto-created Team Leader user
        log("\n--- Verifying auto-created Team Leader user ---")
        users_resp = requests.get(f"{BASE_URL}/users", headers=headers(), timeout=10)
        if users_resp.status_code != 200:
            log(f"❌ FAIL: Could not fetch users: {users_resp.status_code}", "ERROR")
            return False
        
        users = users_resp.json()
        tl_user = next((u for u in users if u.get('email') == tl_email), None)
        
        if not tl_user:
            log(f"❌ FAIL: Team Leader user not auto-created", "ERROR")
            return False
        
        if tl_user.get('role') != 'team':
            log(f"❌ FAIL: Team Leader role is '{tl_user.get('role')}', expected 'team'", "ERROR")
            return False
        
        if not tl_user.get('isTeamLeader'):
            log(f"❌ FAIL: Team Leader isTeamLeader flag not set", "ERROR")
            return False
        
        if tl_user.get('teamId') != team['id']:
            log(f"❌ FAIL: Team Leader teamId mismatch", "ERROR")
            return False
        
        created_ids['team_leader'] = tl_user['id']
        log(f"✅ Team Leader user auto-created: {tl_user['name']} (role={tl_user['role']}, isTeamLeader={tl_user.get('isTeamLeader')}, teamId={tl_user['teamId']})")
        
        # Create Program
        log("\n--- Creating Program ---")
        proposed_date = (datetime.now() + timedelta(days=7)).isoformat()
        program_resp = requests.post(
            f"{BASE_URL}/programs",
            json={
                "branchId": branch['id'],
                "villageId": village['id'],
                "teamId": team['id'],
                "proposedDate": proposed_date
            },
            headers=headers(),
            timeout=10
        )
        if program_resp.status_code != 200:
            log(f"❌ FAIL: Program creation failed: {program_resp.status_code} - {program_resp.text}", "ERROR")
            return False
        program = program_resp.json()
        created_ids['programs'].append(program['id'])
        
        # Verify program code format
        code = program.get('code', '')
        if not code.startswith('FLC/2627/'):
            log(f"❌ FAIL: Program code format incorrect: {code}", "ERROR")
            return False
        
        log(f"✅ Program created: {code} (ID: {program['id']})")
        log(f"   Status: {program.get('status', 'N/A')}")
        
        log("\n✅ PASS: Full CRUD chain completed successfully with auto-user creation")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception during CRUD chain: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

def test_program_code_sequencing():
    """Test 3: Per-RO program code sequencing and resequencing"""
    log("\n" + "=" * 80)
    log("TEST 3: Per-RO Program Code Sequencing")
    log("=" * 80)
    
    try:
        ro_id = created_ids['ro']
        branch_id = created_ids['branch']
        village_id = created_ids['village']
        team_id = created_ids['team']
        
        # Create 2 more programs for the same RO (we already have 1)
        log("\n--- Creating 2 more programs for same RO ---")
        proposed_date = (datetime.now() + timedelta(days=7)).isoformat()
        
        for i in range(2):
            program_resp = requests.post(
                f"{BASE_URL}/programs",
                json={
                    "branchId": branch_id,
                    "villageId": village_id,
                    "teamId": team_id,
                    "proposedDate": proposed_date
                },
                headers=headers(),
                timeout=10
            )
            if program_resp.status_code != 200:
                log(f"❌ FAIL: Program {i+2} creation failed: {program_resp.status_code}", "ERROR")
                return False
            
            program = program_resp.json()
            created_ids['programs'].append(program['id'])
            log(f"✅ Program {i+2} created: {program.get('code')} (ID: {program['id']})")
        
        # Verify we have 3 programs with sequential codes
        log("\n--- Verifying sequential codes ---")
        programs_resp = requests.get(f"{BASE_URL}/programs", headers=headers(), timeout=10)
        if programs_resp.status_code != 200:
            log(f"❌ FAIL: Could not fetch programs: {programs_resp.status_code}", "ERROR")
            return False
        
        all_programs = programs_resp.json()
        our_programs = [p for p in all_programs if p['id'] in created_ids['programs']]
        our_programs.sort(key=lambda p: p.get('seq', 0))
        
        if len(our_programs) != 3:
            log(f"❌ FAIL: Expected 3 programs, found {len(our_programs)}", "ERROR")
            return False
        
        codes = [p.get('code') for p in our_programs]
        log(f"Programs before deletion: {codes}")
        
        # Delete the middle program (#2) with confirm
        log("\n--- Deleting middle program (with confirm) ---")
        middle_program_id = our_programs[1]['id']
        middle_code = our_programs[1].get('code')
        
        delete_resp = requests.delete(
            f"{BASE_URL}/programs/{middle_program_id}",
            json={"confirm": "DELETE"},
            headers=headers(),
            timeout=10
        )
        
        if delete_resp.status_code != 200:
            log(f"❌ FAIL: Program deletion failed: {delete_resp.status_code} - {delete_resp.text}", "ERROR")
            return False
        
        log(f"✅ Program {middle_code} deleted successfully")
        
        # Remove from our tracking
        created_ids['programs'].remove(middle_program_id)
        
        # Verify resequencing
        log("\n--- Verifying resequencing ---")
        programs_resp = requests.get(f"{BASE_URL}/programs", headers=headers(), timeout=10)
        if programs_resp.status_code != 200:
            log(f"❌ FAIL: Could not fetch programs after deletion: {programs_resp.status_code}", "ERROR")
            return False
        
        all_programs = programs_resp.json()
        remaining_programs = [p for p in all_programs if p['id'] in created_ids['programs']]
        remaining_programs.sort(key=lambda p: p.get('seq', 0))
        
        if len(remaining_programs) != 2:
            log(f"❌ FAIL: Expected 2 remaining programs, found {len(remaining_programs)}", "ERROR")
            return False
        
        # Check that codes are now 001 and 002
        remaining_codes = [p.get('code') for p in remaining_programs]
        log(f"Programs after deletion: {remaining_codes}")
        
        # Extract sequence numbers
        seqs = [p.get('seq') for p in remaining_programs]
        if seqs != [1, 2]:
            log(f"❌ FAIL: Sequences not resequenced correctly: {seqs}", "ERROR")
            return False
        
        log(f"✅ Programs resequenced correctly: {remaining_codes}")
        
        # Test DELETE without confirm (should get 400)
        log("\n--- Testing DELETE without confirm ---")
        delete_no_confirm_resp = requests.delete(
            f"{BASE_URL}/programs/{remaining_programs[0]['id']}",
            json={},
            headers=headers(),
            timeout=10
        )
        
        if delete_no_confirm_resp.status_code != 400:
            log(f"❌ FAIL: Expected 400 for DELETE without confirm, got {delete_no_confirm_resp.status_code}", "ERROR")
            return False
        
        error_data = delete_no_confirm_resp.json()
        error_msg = error_data.get('error', '').lower()
        
        if 'confirm' not in error_msg or 'delete' not in error_msg:
            log(f"❌ FAIL: Error message doesn't mention confirm/DELETE: {error_data.get('error')}", "ERROR")
            return False
        
        log(f"✅ DELETE without confirm correctly rejected with 400")
        log(f"   Error: {error_data.get('error')}")
        
        log("\n✅ PASS: Program code sequencing and resequencing working correctly")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception during sequencing test: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

def test_photo_upload_regression():
    """Test 4: Photo upload regression (base64 rejected, Cloudinary URL accepted)"""
    log("\n" + "=" * 80)
    log("TEST 4: Photo Upload Regression")
    log("=" * 80)
    
    try:
        # Use the first remaining program
        if not created_ids['programs']:
            log(f"❌ FAIL: No programs available for testing", "ERROR")
            return False
        
        program_id = created_ids['programs'][0]
        
        # First, confirm the program so we can upload data
        log("\n--- Confirming program ---")
        confirm_resp = requests.post(
            f"{BASE_URL}/programs/{program_id}/confirm",
            json={},
            headers=headers(),
            timeout=10
        )
        if confirm_resp.status_code != 200:
            log(f"⚠️  Program confirmation failed (may already be confirmed): {confirm_resp.status_code}", "WARN")
        
        # Test 1: Reject base64 upload (400)
        log("\n--- Testing base64 rejection ---")
        base64_resp = requests.post(
            f"{BASE_URL}/programs/{program_id}/upload-data",
            json={
                "photos": [
                    {"data": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBD"}
                ]
            },
            headers=headers(),
            timeout=10
        )
        
        log(f"Base64 upload status: {base64_resp.status_code}")
        
        if base64_resp.status_code != 400:
            log(f"❌ FAIL: Expected 400 for base64, got {base64_resp.status_code}", "ERROR")
            log(f"Response: {base64_resp.text}", "ERROR")
            return False
        
        log(f"✅ Base64 upload correctly rejected with 400")
        
        # Test 2: Accept Cloudinary URL with metadata (200)
        log("\n--- Testing Cloudinary URL acceptance ---")
        cloudinary_resp = requests.post(
            f"{BASE_URL}/programs/{program_id}/upload-data",
            json={
                "photos": [
                    {
                        "url": "https://res.cloudinary.com/o5sh6ccg/image/upload/v1/x.jpg",
                        "publicId": "x",
                        "width": 1200,
                        "height": 900,
                        "bytes": 500000,
                        "gps": {"lat": 26, "lng": 78},
                        "source": "camera"
                    }
                ]
            },
            headers=headers(),
            timeout=10
        )
        
        log(f"Cloudinary upload status: {cloudinary_resp.status_code}")
        
        if cloudinary_resp.status_code != 200:
            log(f"❌ FAIL: Expected 200 for Cloudinary URL, got {cloudinary_resp.status_code}", "ERROR")
            log(f"Response: {cloudinary_resp.text}", "ERROR")
            return False
        
        program = cloudinary_resp.json()
        photos = program.get('photos', [])
        
        if len(photos) == 0:
            log(f"❌ FAIL: No photos stored", "ERROR")
            return False
        
        photo = photos[0]
        
        # Verify photo structure
        required_fields = ['id', 'url', 'publicId', 'width', 'height', 'bytes', 'gps', 'source', 'uploadedAt']
        missing_fields = [f for f in required_fields if f not in photo]
        
        if missing_fields:
            log(f"❌ FAIL: Missing required fields: {missing_fields}", "ERROR")
            return False
        
        # Verify NO data field
        if 'data' in photo:
            log(f"❌ FAIL: Photo has 'data' field (base64 should not be stored)", "ERROR")
            return False
        
        log(f"✅ Cloudinary URL accepted with correct metadata")
        log(f"   Photo fields: {list(photo.keys())}")
        log(f"   NO 'data' field present ✓")
        
        log("\n✅ PASS: Photo upload regression tests passed")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception during photo upload test: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

def test_complex_filter_regression():
    """Test 5: Complex filter regression (dashboard, login by email)"""
    log("\n" + "=" * 80)
    log("TEST 5: Complex Filter Regression")
    log("=" * 80)
    
    try:
        # Test 1: Dashboard endpoint (uses $or, $in, $ne operators)
        log("\n--- Testing dashboard endpoint ---")
        dashboard_resp = requests.get(
            f"{BASE_URL}/dashboard",
            headers=headers(),
            timeout=10
        )
        
        log(f"Dashboard status: {dashboard_resp.status_code}")
        
        if dashboard_resp.status_code != 200:
            log(f"❌ FAIL: Dashboard returned {dashboard_resp.status_code}", "ERROR")
            log(f"Response: {dashboard_resp.text}", "ERROR")
            
            # Check if it's a Postgres-specific error
            if dashboard_resp.status_code == 500:
                error_text = dashboard_resp.text.lower()
                if 'parameter' in error_text or 'does not exist' in error_text:
                    log(f"⚠️  POSTGRES SHIM REGRESSION: {dashboard_resp.text}", "ERROR")
            
            return False
        
        dashboard_data = dashboard_resp.json()
        log(f"✅ Dashboard endpoint returned 200")
        log(f"   Dashboard keys: {list(dashboard_data.keys())}")
        
        # Test 2: Login by email (uses $or:[{username},{email}])
        log("\n--- Testing login by email ---")
        
        # Get the BM user email
        bm_user_id = created_ids.get('bm_user')
        if not bm_user_id:
            log(f"⚠️  No BM user to test email login", "WARN")
        else:
            users_resp = requests.get(f"{BASE_URL}/users", headers=headers(), timeout=10)
            if users_resp.status_code == 200:
                users = users_resp.json()
                bm_user = next((u for u in users if u.get('id') == bm_user_id), None)
                
                if bm_user and bm_user.get('email'):
                    bm_email = bm_user['email']
                    
                    # Try to login with email (we don't know the password, so we expect 401 for wrong password)
                    # But if the query itself is broken, we'd get a different error
                    login_resp = requests.post(
                        f"{BASE_URL}/auth/login",
                        json={"username": bm_email, "password": "wrongpassword"},
                        timeout=10
                    )
                    
                    log(f"Login by email status: {login_resp.status_code}")
                    
                    # We expect 401 (wrong password), not 500 (query error)
                    if login_resp.status_code == 500:
                        log(f"❌ FAIL: Login by email returned 500 (query error)", "ERROR")
                        log(f"Response: {login_resp.text}", "ERROR")
                        
                        error_text = login_resp.text.lower()
                        if 'parameter' in error_text or 'does not exist' in error_text:
                            log(f"⚠️  POSTGRES SHIM REGRESSION: $or query broken", "ERROR")
                        
                        return False
                    
                    if login_resp.status_code == 401:
                        error_data = login_resp.json()
                        error_msg = error_data.get('error', '').lower()
                        
                        # Should be "invalid username or password", not a query error
                        if 'invalid' in error_msg or 'password' in error_msg:
                            log(f"✅ Login by email query working (401 for wrong password)")
                        else:
                            log(f"⚠️  Unexpected error message: {error_data.get('error')}", "WARN")
                    else:
                        log(f"⚠️  Unexpected status code: {login_resp.status_code}", "WARN")
                else:
                    log(f"⚠️  BM user has no email", "WARN")
            else:
                log(f"⚠️  Could not fetch users", "WARN")
        
        log("\n✅ PASS: Complex filter regression tests passed")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception during complex filter test: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

def test_dependency_guards():
    """Test 6: Dependency guards (delete bank with RO, delete team with program)"""
    log("\n" + "=" * 80)
    log("TEST 6: Dependency Guards")
    log("=" * 80)
    
    try:
        # Test 1: Delete bank while RO references it (should get 409)
        log("\n--- Testing delete bank with RO dependency ---")
        bank_id = created_ids['bank']
        
        delete_bank_resp = requests.delete(
            f"{BASE_URL}/banks/{bank_id}",
            headers=headers(),
            timeout=10
        )
        
        log(f"Delete bank status: {delete_bank_resp.status_code}")
        
        if delete_bank_resp.status_code != 409:
            log(f"❌ FAIL: Expected 409 for bank with RO, got {delete_bank_resp.status_code}", "ERROR")
            log(f"Response: {delete_bank_resp.text}", "ERROR")
            return False
        
        error_data = delete_bank_resp.json()
        error_msg = error_data.get('error', '').lower()
        
        if 'regional' not in error_msg and 'reference' not in error_msg:
            log(f"❌ FAIL: Error message doesn't mention dependency: {error_data.get('error')}", "ERROR")
            return False
        
        log(f"✅ Delete bank correctly rejected with 409")
        log(f"   Error: {error_data.get('error')}")
        
        # Test 2: Delete team while program references it (should get 409)
        log("\n--- Testing delete team with program dependency ---")
        team_id = created_ids['team']
        
        delete_team_resp = requests.delete(
            f"{BASE_URL}/teams/{team_id}",
            headers=headers(),
            timeout=10
        )
        
        log(f"Delete team status: {delete_team_resp.status_code}")
        
        if delete_team_resp.status_code != 409:
            log(f"❌ FAIL: Expected 409 for team with program, got {delete_team_resp.status_code}", "ERROR")
            log(f"Response: {delete_team_resp.text}", "ERROR")
            return False
        
        error_data = delete_team_resp.json()
        error_msg = error_data.get('error', '').lower()
        
        if 'program' not in error_msg and 'reference' not in error_msg:
            log(f"❌ FAIL: Error message doesn't mention dependency: {error_data.get('error')}", "ERROR")
            return False
        
        log(f"✅ Delete team correctly rejected with 409")
        log(f"   Error: {error_data.get('error')}")
        
        log("\n✅ PASS: Dependency guards working correctly")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception during dependency guard test: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

def test_authenticated_program_guard():
    """Test 7: Authenticated program guard (409 after authentication)"""
    log("\n" + "=" * 80)
    log("TEST 7: Authenticated Program Guard")
    log("=" * 80)
    
    try:
        # Use the first program
        if not created_ids['programs']:
            log(f"❌ FAIL: No programs available for testing", "ERROR")
            return False
        
        program_id = created_ids['programs'][0]
        
        # Get current program state
        log("\n--- Getting program state ---")
        get_resp = requests.get(
            f"{BASE_URL}/programs/{program_id}",
            headers=headers(),
            timeout=10
        )
        
        if get_resp.status_code != 200:
            log(f"❌ FAIL: Could not fetch program: {get_resp.status_code}", "ERROR")
            return False
        
        program = get_resp.json()
        current_status = program.get('status')
        log(f"Current program status: {current_status}")
        
        # If not already conducted, we need to make it conducted first
        if current_status != 'conducted':
            log("\n--- Making program 'conducted' (4 photos + participants) ---")
            
            # Upload 3 more photos (we already have 1)
            for i in range(3):
                photo_resp = requests.post(
                    f"{BASE_URL}/programs/{program_id}/upload-data",
                    json={
                        "photos": [
                            {
                                "url": f"https://res.cloudinary.com/o5sh6ccg/image/upload/v1/test/photo{i+2}.jpg",
                                "publicId": f"test/photo{i+2}",
                                "width": 1200,
                                "height": 900,
                                "bytes": 500000,
                                "gps": {"lat": 26, "lng": 78},
                                "source": "camera"
                            }
                        ]
                    },
                    headers=headers(),
                    timeout=10
                )
                if photo_resp.status_code != 200:
                    log(f"⚠️  Photo upload {i+2} failed: {photo_resp.status_code}", "WARN")
            
            # Set participants
            participants_resp = requests.post(
                f"{BASE_URL}/programs/{program_id}/upload-data",
                json={"participants": 65},
                headers=headers(),
                timeout=10
            )
            
            if participants_resp.status_code != 200:
                log(f"⚠️  Setting participants failed: {participants_resp.status_code}", "WARN")
            else:
                program = participants_resp.json()
                log(f"Program status after participants: {program.get('status')}")
        
        # Authenticate the program
        log("\n--- Authenticating program ---")
        auth_resp = requests.post(
            f"{BASE_URL}/programs/{program_id}/authenticate",
            json={},
            headers=headers(),
            timeout=10
        )
        
        log(f"Authenticate status: {auth_resp.status_code}")
        
        if auth_resp.status_code != 200:
            log(f"❌ FAIL: Authentication failed: {auth_resp.status_code}", "ERROR")
            log(f"Response: {auth_resp.text}", "ERROR")
            return False
        
        program = auth_resp.json()
        if program.get('status') != 'authenticated':
            log(f"❌ FAIL: Program status is '{program.get('status')}', expected 'authenticated'", "ERROR")
            return False
        
        log(f"✅ Program authenticated successfully")
        
        # Try to upload data (should get 409)
        log("\n--- Attempting upload-data after authentication ---")
        upload_resp = requests.post(
            f"{BASE_URL}/programs/{program_id}/upload-data",
            json={
                "photos": [
                    {
                        "url": "https://res.cloudinary.com/o5sh6ccg/image/upload/v1/test/after-auth.jpg",
                        "publicId": "test/after-auth",
                        "width": 1200,
                        "height": 900,
                        "bytes": 500000,
                        "source": "camera"
                    }
                ]
            },
            headers=headers(),
            timeout=10
        )
        
        log(f"Upload after auth status: {upload_resp.status_code}")
        
        if upload_resp.status_code != 409:
            log(f"❌ FAIL: Expected 409 for upload after auth, got {upload_resp.status_code}", "ERROR")
            log(f"Response: {upload_resp.text}", "ERROR")
            return False
        
        error_data = upload_resp.json()
        log(f"✅ Upload correctly rejected with 409")
        log(f"   Error: {error_data.get('error')}")
        
        # Try to delete photo (should also get 409)
        log("\n--- Attempting delete-photo after authentication ---")
        
        get_resp = requests.get(f"{BASE_URL}/programs/{program_id}", headers=headers(), timeout=10)
        program = get_resp.json()
        photos = program.get('photos', [])
        
        if len(photos) > 0:
            photo_id = photos[0].get('id')
            delete_photo_resp = requests.post(
                f"{BASE_URL}/programs/{program_id}/delete-photo",
                json={"photoId": photo_id},
                headers=headers(),
                timeout=10
            )
            
            log(f"Delete photo after auth status: {delete_photo_resp.status_code}")
            
            if delete_photo_resp.status_code != 409:
                log(f"❌ FAIL: Expected 409 for delete-photo after auth, got {delete_photo_resp.status_code}", "ERROR")
                return False
            
            log(f"✅ Delete photo correctly rejected with 409")
        
        log("\n✅ PASS: Authenticated program guard working correctly")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception during authenticated guard test: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

def test_cleanup():
    """Test 8: Cleanup - delete all test data"""
    log("\n" + "=" * 80)
    log("TEST 8: Cleanup")
    log("=" * 80)
    
    try:
        # Delete in reverse order of dependencies
        
        # Delete programs
        log("\n--- Deleting programs ---")
        for program_id in created_ids['programs']:
            delete_resp = requests.delete(
                f"{BASE_URL}/programs/{program_id}",
                json={"confirm": "DELETE"},
                headers=headers(),
                timeout=10
            )
            if delete_resp.status_code == 200:
                log(f"✅ Deleted program {program_id}")
            else:
                log(f"⚠️  Could not delete program {program_id}: {delete_resp.status_code}", "WARN")
        
        # Delete team
        if created_ids['team']:
            log("\n--- Deleting team ---")
            delete_resp = requests.delete(
                f"{BASE_URL}/teams/{created_ids['team']}",
                headers=headers(),
                timeout=10
            )
            if delete_resp.status_code == 200:
                log(f"✅ Deleted team {created_ids['team']}")
            else:
                log(f"⚠️  Could not delete team: {delete_resp.status_code}", "WARN")
        
        # Delete village
        if created_ids['village']:
            log("\n--- Deleting village ---")
            delete_resp = requests.delete(
                f"{BASE_URL}/villages/{created_ids['village']}",
                headers=headers(),
                timeout=10
            )
            if delete_resp.status_code == 200:
                log(f"✅ Deleted village {created_ids['village']}")
            else:
                log(f"⚠️  Could not delete village: {delete_resp.status_code}", "WARN")
        
        # Delete branch
        if created_ids['branch']:
            log("\n--- Deleting branch ---")
            delete_resp = requests.delete(
                f"{BASE_URL}/branches/{created_ids['branch']}",
                headers=headers(),
                timeout=10
            )
            if delete_resp.status_code == 200:
                log(f"✅ Deleted branch {created_ids['branch']}")
            else:
                log(f"⚠️  Could not delete branch: {delete_resp.status_code}", "WARN")
        
        # Delete district
        if created_ids['district']:
            log("\n--- Deleting district ---")
            delete_resp = requests.delete(
                f"{BASE_URL}/districts/{created_ids['district']}",
                headers=headers(),
                timeout=10
            )
            if delete_resp.status_code == 200:
                log(f"✅ Deleted district {created_ids['district']}")
            else:
                log(f"⚠️  Could not delete district: {delete_resp.status_code}", "WARN")
        
        # Delete RO
        if created_ids['ro']:
            log("\n--- Deleting regional office ---")
            delete_resp = requests.delete(
                f"{BASE_URL}/regional_offices/{created_ids['ro']}",
                headers=headers(),
                timeout=10
            )
            if delete_resp.status_code == 200:
                log(f"✅ Deleted RO {created_ids['ro']}")
            else:
                log(f"⚠️  Could not delete RO: {delete_resp.status_code}", "WARN")
        
        # Delete bank
        if created_ids['bank']:
            log("\n--- Deleting bank ---")
            delete_resp = requests.delete(
                f"{BASE_URL}/banks/{created_ids['bank']}",
                headers=headers(),
                timeout=10
            )
            if delete_resp.status_code == 200:
                log(f"✅ Deleted bank {created_ids['bank']}")
            else:
                log(f"⚠️  Could not delete bank: {delete_resp.status_code}", "WARN")
        
        # Delete auto-created users
        log("\n--- Deleting auto-created users ---")
        for user_key in ['bm_user', 'team_leader']:
            user_id = created_ids.get(user_key)
            if user_id:
                delete_resp = requests.delete(
                    f"{BASE_URL}/users/{user_id}",
                    headers=headers(),
                    timeout=10
                )
                if delete_resp.status_code == 200:
                    log(f"✅ Deleted user {user_id}")
                else:
                    log(f"⚠️  Could not delete user {user_id}: {delete_resp.status_code}", "WARN")
        
        # Verify only primary admin remains
        log("\n--- Verifying only primary admin remains ---")
        users_resp = requests.get(f"{BASE_URL}/users", headers=headers(), timeout=10)
        if users_resp.status_code == 200:
            users = users_resp.json()
            non_admin_users = [u for u in users if u.get('role') != 'admin']
            
            if len(non_admin_users) > 0:
                log(f"⚠️  {len(non_admin_users)} non-admin users still exist", "WARN")
                for u in non_admin_users:
                    log(f"   - {u.get('name')} ({u.get('role')}, {u.get('email')})", "WARN")
            else:
                log(f"✅ Only admin user(s) remain")
        
        log("\n✅ PASS: Cleanup completed")
        return True
        
    except Exception as e:
        log(f"⚠️  Cleanup exception: {str(e)}", "WARN")
        import traceback
        traceback.print_exc()
        return True  # Don't fail the test suite on cleanup errors

def main():
    """Run all tests"""
    log("=" * 80)
    log("FINLIT360 v3.3 - Supabase Postgres Migration Backend Tests")
    log("=" * 80)
    log(f"Base URL: {BASE_URL}")
    log(f"Admin: {ADMIN_USERNAME}")
    log("")
    
    tests = [
        ("Auth", test_auth),
        ("Full CRUD Chain", test_full_crud_chain),
        ("Program Code Sequencing", test_program_code_sequencing),
        ("Photo Upload Regression", test_photo_upload_regression),
        ("Complex Filter Regression", test_complex_filter_regression),
        ("Dependency Guards", test_dependency_guards),
        ("Authenticated Program Guard", test_authenticated_program_guard),
        ("Cleanup", test_cleanup)
    ]
    
    results = []
    
    for name, test_fn in tests:
        try:
            result = test_fn()
            results.append((name, result))
            
            # Stop if auth fails
            if name == "Auth" and not result:
                log("\n❌ Authentication failed. Stopping tests.", "ERROR")
                break
            
            # Stop if CRUD chain fails
            if name == "Full CRUD Chain" and not result:
                log("\n❌ CRUD chain failed. Stopping tests.", "ERROR")
                break
                
        except Exception as e:
            log(f"\n❌ Test '{name}' raised exception: {str(e)}", "ERROR")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status}: {name}")
    
    log("")
    log(f"Total: {passed}/{total} tests passed")
    log("=" * 80)
    
    # Exit with appropriate code
    sys.exit(0 if passed == total else 1)

if __name__ == "__main__":
    main()
