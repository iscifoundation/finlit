#!/usr/bin/env python3
"""
FINLIT360 v3.2 Backend Test - Cloudinary Direct Upload Architecture
Tests the new photo upload flow that rejects base64 and only accepts Cloudinary URLs.
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
    'village': None,
    'team': None,
    'program': None
}

def log(msg, level="INFO"):
    """Log test messages"""
    print(f"[{level}] {msg}")

def test_auth():
    """Test 1: Authenticate as Admin"""
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
        
        if response.status_code == 401:
            log("❌ FAIL: Admin login returned 401. Password may need reset via mongosh.", "ERROR")
            log("Run: db.users.updateOne({role:'admin'},{$set:{passwordHash: <bcrypt hash of 'Password'>, mustChangePassword:true}})", "ERROR")
            return False
        
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
        return False

def headers():
    """Get auth headers"""
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def setup_program_chain():
    """Test 2: Setup Bank → RO → District → Branch → Village → Team → Program → Confirm"""
    log("\n" + "=" * 80)
    log("TEST 2: Setup Program Chain")
    log("=" * 80)
    
    try:
        # Create Bank
        log("\n--- Creating Bank ---")
        bank_resp = requests.post(
            f"{BASE_URL}/banks",
            json={"name": "Test Bank Cloudinary", "code": "TB-CLOUD"},
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
                "name": "Test RO Cloudinary",
                "code": "RO-CLOUD",
                "bankId": bank['id'],
                "feePerProgram": 5000
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
                "name": "Test District Cloudinary",
                "code": "TD-CLOUD",
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
        
        # Create Branch
        log("\n--- Creating Branch ---")
        branch_resp = requests.post(
            f"{BASE_URL}/branches",
            json={
                "name": "Test Branch Cloudinary",
                "code": "BR-CLOUD",
                "districtId": district['id'],
                "branchManagerEmail": f"bm-cloud-test-{datetime.now().timestamp()}@example.com",
                "branchManagerName": "BM Cloudinary Test",
                "address": "Test Address"
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
        
        # Create Village
        log("\n--- Creating Village ---")
        village_resp = requests.post(
            f"{BASE_URL}/villages",
            json={
                "name": "Test Village Cloudinary",
                "branchId": branch['id']
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
        
        # Create Team
        log("\n--- Creating Team ---")
        team_resp = requests.post(
            f"{BASE_URL}/teams",
            json={
                "name": "Test Team Cloudinary",
                "leaderMode": "new",
                "leaderName": "Team Leader Cloudinary",
                "leaderEmail": f"tl-cloud-test-{datetime.now().timestamp()}@example.com",
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
        
        # Create Program
        log("\n--- Creating Program ---")
        proposed_date = (datetime.now() + timedelta(days=7)).isoformat()
        program_resp = requests.post(
            f"{BASE_URL}/programs",
            json={
                "branchId": branch['id'],
                "villageId": village['id'],
                "teamId": team['id'],
                "proposedDate": proposed_date,
                "remarks": "Test program for Cloudinary upload testing"
            },
            headers=headers(),
            timeout=10
        )
        if program_resp.status_code != 200:
            log(f"❌ FAIL: Program creation failed: {program_resp.status_code} - {program_resp.text}", "ERROR")
            return False
        program = program_resp.json()
        created_ids['program'] = program['id']
        log(f"✅ Program created: {program.get('code', 'N/A')} (ID: {program['id']})")
        log(f"   Status: {program.get('status', 'N/A')}")
        
        # Confirm Program
        log("\n--- Confirming Program ---")
        confirm_resp = requests.post(
            f"{BASE_URL}/programs/{program['id']}/confirm",
            json={},
            headers=headers(),
            timeout=10
        )
        if confirm_resp.status_code != 200:
            log(f"❌ FAIL: Program confirmation failed: {confirm_resp.status_code} - {confirm_resp.text}", "ERROR")
            return False
        confirmed_program = confirm_resp.json()
        log(f"✅ Program confirmed: {confirmed_program.get('code', 'N/A')}")
        log(f"   Status: {confirmed_program.get('status', 'N/A')}")
        log(f"   Branch confirmed: {confirmed_program.get('branchConfirmed', False)}")
        
        log("\n✅ PASS: Full program chain setup successfully")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception during setup: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

def test_reject_base64():
    """Test 3: Reject base64 upload (400)"""
    log("\n" + "=" * 80)
    log("TEST 3: Reject Base64 Upload")
    log("=" * 80)
    
    try:
        program_id = created_ids['program']
        response = requests.post(
            f"{BASE_URL}/programs/{program_id}/upload-data",
            json={
                "photos": [
                    {"data": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBD"}
                ]
            },
            headers=headers(),
            timeout=10
        )
        
        log(f"Status: {response.status_code}")
        log(f"Response: {response.text}")
        
        if response.status_code != 400:
            log(f"❌ FAIL: Expected 400, got {response.status_code}", "ERROR")
            return False
        
        response_data = response.json()
        error_msg = response_data.get('error', '').lower()
        
        if 'url' not in error_msg and 'required' not in error_msg:
            log(f"❌ FAIL: Error message doesn't mention 'url is required': {response_data.get('error')}", "ERROR")
            return False
        
        log(f"✅ PASS: Base64 upload correctly rejected with 400")
        log(f"   Error message: {response_data.get('error')}")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception: {str(e)}", "ERROR")
        return False

def test_reject_empty_url():
    """Test 4: Reject empty URL (400)"""
    log("\n" + "=" * 80)
    log("TEST 4: Reject Empty URL")
    log("=" * 80)
    
    try:
        program_id = created_ids['program']
        response = requests.post(
            f"{BASE_URL}/programs/{program_id}/upload-data",
            json={
                "photos": [
                    {"url": ""}
                ]
            },
            headers=headers(),
            timeout=10
        )
        
        log(f"Status: {response.status_code}")
        log(f"Response: {response.text}")
        
        if response.status_code != 400:
            log(f"❌ FAIL: Expected 400, got {response.status_code}", "ERROR")
            return False
        
        log(f"✅ PASS: Empty URL correctly rejected with 400")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception: {str(e)}", "ERROR")
        return False

def test_reject_malformed_url():
    """Test 5: Reject malformed URL (400)"""
    log("\n" + "=" * 80)
    log("TEST 5: Reject Malformed URL")
    log("=" * 80)
    
    try:
        program_id = created_ids['program']
        response = requests.post(
            f"{BASE_URL}/programs/{program_id}/upload-data",
            json={
                "photos": [
                    {"url": "not-a-url"}
                ]
            },
            headers=headers(),
            timeout=10
        )
        
        log(f"Status: {response.status_code}")
        log(f"Response: {response.text}")
        
        if response.status_code != 400:
            log(f"❌ FAIL: Expected 400, got {response.status_code}", "ERROR")
            return False
        
        response_data = response.json()
        error_msg = response_data.get('error', '').lower()
        
        if 'http' not in error_msg and 'url' not in error_msg:
            log(f"❌ FAIL: Error message doesn't mention http(s) URL: {response_data.get('error')}", "ERROR")
            return False
        
        log(f"✅ PASS: Malformed URL correctly rejected with 400")
        log(f"   Error message: {response_data.get('error')}")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception: {str(e)}", "ERROR")
        return False

def test_accept_cloudinary_url():
    """Test 6: Accept valid Cloudinary URL with metadata (200)"""
    log("\n" + "=" * 80)
    log("TEST 6: Accept Valid Cloudinary URL")
    log("=" * 80)
    
    try:
        program_id = created_ids['program']
        response = requests.post(
            f"{BASE_URL}/programs/{program_id}/upload-data",
            json={
                "photos": [
                    {
                        "url": "https://res.cloudinary.com/o5sh6ccg/image/upload/v1/test/a.jpg",
                        "publicId": "test/a",
                        "width": 1200,
                        "height": 900,
                        "bytes": 480000,
                        "gps": {"lat": 26.2, "lng": 78.2},
                        "source": "camera"
                    }
                ]
            },
            headers=headers(),
            timeout=10
        )
        
        log(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {response.status_code}", "ERROR")
            log(f"Response: {response.text}", "ERROR")
            return False
        
        program = response.json()
        photos = program.get('photos', [])
        
        if len(photos) == 0:
            log(f"❌ FAIL: No photos in program", "ERROR")
            return False
        
        photo = photos[0]
        log(f"Photo stored: {json.dumps(photo, indent=2, default=str)}")
        
        # Verify required fields
        checks = [
            ('id', lambda p: 'id' in p and p['id'], "Photo has UUID id"),
            ('url', lambda p: p.get('url') == "https://res.cloudinary.com/o5sh6ccg/image/upload/v1/test/a.jpg", "URL unchanged"),
            ('publicId', lambda p: p.get('publicId') == "test/a", "publicId set"),
            ('width', lambda p: p.get('width') == 1200, "width set"),
            ('height', lambda p: p.get('height') == 900, "height set"),
            ('bytes', lambda p: p.get('bytes') == 480000, "bytes set"),
            ('gps', lambda p: p.get('gps', {}).get('lat') == 26.2 and p.get('gps', {}).get('lng') == 78.2, "GPS set"),
            ('source', lambda p: p.get('source') == "camera", "source set"),
            ('uploadedAt', lambda p: 'uploadedAt' in p, "uploadedAt set"),
            ('no_data', lambda p: 'data' not in p, "NO data field (base64 not stored)")
        ]
        
        all_passed = True
        for field, check_fn, desc in checks:
            if check_fn(photo):
                log(f"   ✅ {desc}")
            else:
                log(f"   ❌ {desc}", "ERROR")
                all_passed = False
        
        if not all_passed:
            log(f"❌ FAIL: Some field checks failed", "ERROR")
            return False
        
        log(f"✅ PASS: Valid Cloudinary URL accepted with correct metadata")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

def test_photo_appending():
    """Test 7: Photos append (don't replace)"""
    log("\n" + "=" * 80)
    log("TEST 7: Photo Appending (Not Replacing)")
    log("=" * 80)
    
    try:
        program_id = created_ids['program']
        
        # Get current photo count
        get_resp = requests.get(
            f"{BASE_URL}/programs/{program_id}",
            headers=headers(),
            timeout=10
        )
        if get_resp.status_code != 200:
            log(f"❌ FAIL: Could not fetch program: {get_resp.status_code}", "ERROR")
            return False
        
        program_before = get_resp.json()
        photos_before = len(program_before.get('photos', []))
        log(f"Photos before: {photos_before}")
        
        # Upload another photo
        response = requests.post(
            f"{BASE_URL}/programs/{program_id}/upload-data",
            json={
                "photos": [
                    {
                        "url": "https://res.cloudinary.com/o5sh6ccg/image/upload/v1/test/b.jpg",
                        "publicId": "test/b",
                        "width": 1920,
                        "height": 1080,
                        "bytes": 650000,
                        "gps": {"lat": 28.5, "lng": 77.2},
                        "source": "gallery"
                    }
                ]
            },
            headers=headers(),
            timeout=10
        )
        
        log(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {response.status_code}", "ERROR")
            log(f"Response: {response.text}", "ERROR")
            return False
        
        program_after = response.json()
        photos_after = len(program_after.get('photos', []))
        log(f"Photos after: {photos_after}")
        
        if photos_after != photos_before + 1:
            log(f"❌ FAIL: Expected {photos_before + 1} photos, got {photos_after}", "ERROR")
            return False
        
        # Verify the new photo is present
        new_photo = program_after['photos'][-1]
        if new_photo.get('url') != "https://res.cloudinary.com/o5sh6ccg/image/upload/v1/test/b.jpg":
            log(f"❌ FAIL: New photo URL mismatch", "ERROR")
            return False
        
        log(f"✅ PASS: Photos correctly appended (not replaced)")
        log(f"   Previous photo still present: {program_after['photos'][0].get('url')}")
        log(f"   New photo added: {new_photo.get('url')}")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception: {str(e)}", "ERROR")
        return False

def test_delete_photo():
    """Test 8: Delete photo"""
    log("\n" + "=" * 80)
    log("TEST 8: Delete Photo")
    log("=" * 80)
    
    try:
        program_id = created_ids['program']
        
        # Get current program
        get_resp = requests.get(
            f"{BASE_URL}/programs/{program_id}",
            headers=headers(),
            timeout=10
        )
        if get_resp.status_code != 200:
            log(f"❌ FAIL: Could not fetch program: {get_resp.status_code}", "ERROR")
            return False
        
        program = get_resp.json()
        photos_before = program.get('photos', [])
        
        if len(photos_before) == 0:
            log(f"❌ FAIL: No photos to delete", "ERROR")
            return False
        
        photo_to_delete = photos_before[0]
        photo_id = photo_to_delete.get('id')
        log(f"Deleting photo ID: {photo_id}")
        log(f"Photos before delete: {len(photos_before)}")
        
        # Delete photo
        response = requests.post(
            f"{BASE_URL}/programs/{program_id}/delete-photo",
            json={"photoId": photo_id},
            headers=headers(),
            timeout=10
        )
        
        log(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            log(f"❌ FAIL: Expected 200, got {response.status_code}", "ERROR")
            log(f"Response: {response.text}", "ERROR")
            return False
        
        program_after = response.json()
        photos_after = program_after.get('photos', [])
        log(f"Photos after delete: {len(photos_after)}")
        
        if len(photos_after) != len(photos_before) - 1:
            log(f"❌ FAIL: Expected {len(photos_before) - 1} photos, got {len(photos_after)}", "ERROR")
            return False
        
        # Verify the photo is actually removed
        remaining_ids = [p.get('id') for p in photos_after]
        if photo_id in remaining_ids:
            log(f"❌ FAIL: Deleted photo still present", "ERROR")
            return False
        
        log(f"✅ PASS: Photo successfully deleted")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception: {str(e)}", "ERROR")
        return False

def test_auto_transition_to_conducted():
    """Test 9: Auto-transition to 'conducted' after 4 uploads + participants > 0"""
    log("\n" + "=" * 80)
    log("TEST 9: Auto-transition to 'conducted'")
    log("=" * 80)
    
    try:
        program_id = created_ids['program']
        
        # Get current program
        get_resp = requests.get(
            f"{BASE_URL}/programs/{program_id}",
            headers=headers(),
            timeout=10
        )
        program = get_resp.json()
        current_photos = len(program.get('photos', []))
        log(f"Current photos: {current_photos}")
        log(f"Current status: {program.get('status')}")
        
        # Upload photos until we have 4
        photos_needed = max(0, 4 - current_photos)
        log(f"Need to upload {photos_needed} more photos to reach 4")
        
        for i in range(photos_needed):
            log(f"\n--- Uploading photo {i+1}/{photos_needed} ---")
            response = requests.post(
                f"{BASE_URL}/programs/{program_id}/upload-data",
                json={
                    "photos": [
                        {
                            "url": f"https://res.cloudinary.com/o5sh6ccg/image/upload/v1/test/photo{i+3}.jpg",
                            "publicId": f"test/photo{i+3}",
                            "width": 1600,
                            "height": 1200,
                            "bytes": 550000,
                            "gps": {"lat": 25.0 + i, "lng": 75.0 + i},
                            "source": "camera"
                        }
                    ]
                },
                headers=headers(),
                timeout=10
            )
            if response.status_code != 200:
                log(f"❌ FAIL: Photo upload failed: {response.status_code}", "ERROR")
                return False
            log(f"✅ Photo {i+1} uploaded")
        
        # Verify we have 4 photos but status is still 'confirmed' (not 'conducted' yet)
        get_resp = requests.get(
            f"{BASE_URL}/programs/{program_id}",
            headers=headers(),
            timeout=10
        )
        program = get_resp.json()
        photo_count = len(program.get('photos', []))
        log(f"\nPhotos after uploads: {photo_count}")
        log(f"Status after uploads: {program.get('status')}")
        
        if photo_count < 4:
            log(f"❌ FAIL: Expected at least 4 photos, got {photo_count}", "ERROR")
            return False
        
        if program.get('status') == 'conducted':
            log(f"❌ FAIL: Status changed to 'conducted' before setting participants", "ERROR")
            return False
        
        # Now set participants > 0
        log(f"\n--- Setting participants to 65 ---")
        response = requests.post(
            f"{BASE_URL}/programs/{program_id}/upload-data",
            json={"participants": 65},
            headers=headers(),
            timeout=10
        )
        
        log(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            log(f"❌ FAIL: Setting participants failed: {response.status_code}", "ERROR")
            log(f"Response: {response.text}", "ERROR")
            return False
        
        program_final = response.json()
        final_status = program_final.get('status')
        final_participants = program_final.get('participants')
        
        log(f"Final status: {final_status}")
        log(f"Final participants: {final_participants}")
        log(f"Final photo count: {len(program_final.get('photos', []))}")
        
        if final_status != 'conducted':
            log(f"❌ FAIL: Expected status 'conducted', got '{final_status}'", "ERROR")
            return False
        
        if final_participants != 65:
            log(f"❌ FAIL: Expected participants 65, got {final_participants}", "ERROR")
            return False
        
        log(f"✅ PASS: Status correctly transitioned to 'conducted' after 4 photos + participants")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

def test_authenticated_state_guard():
    """Test 10: Authenticated-state guard (409)"""
    log("\n" + "=" * 80)
    log("TEST 10: Authenticated State Guard")
    log("=" * 80)
    
    try:
        program_id = created_ids['program']
        
        # First authenticate the program
        log("--- Authenticating program ---")
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
        log(f"Program status after auth: {program.get('status')}")
        
        if program.get('status') != 'authenticated':
            log(f"❌ FAIL: Expected status 'authenticated', got '{program.get('status')}'", "ERROR")
            return False
        
        log(f"✅ Program authenticated successfully")
        
        # Now try to upload a photo (should get 409)
        log("\n--- Attempting to upload photo after authentication ---")
        upload_resp = requests.post(
            f"{BASE_URL}/programs/{program_id}/upload-data",
            json={
                "photos": [
                    {
                        "url": "https://res.cloudinary.com/o5sh6ccg/image/upload/v1/test/after-auth.jpg",
                        "publicId": "test/after-auth",
                        "width": 1200,
                        "height": 900,
                        "bytes": 400000,
                        "source": "camera"
                    }
                ]
            },
            headers=headers(),
            timeout=10
        )
        
        log(f"Upload status: {upload_resp.status_code}")
        log(f"Upload response: {upload_resp.text}")
        
        if upload_resp.status_code != 409:
            log(f"❌ FAIL: Expected 409, got {upload_resp.status_code}", "ERROR")
            return False
        
        error_data = upload_resp.json()
        error_msg = error_data.get('error', '').lower()
        
        if 'authenticated' not in error_msg or 'admin' not in error_msg:
            log(f"❌ FAIL: Error message doesn't mention authenticated/admin: {error_data.get('error')}", "ERROR")
            return False
        
        log(f"✅ Upload correctly rejected with 409")
        log(f"   Error: {error_data.get('error')}")
        
        # Try to delete a photo (should also get 409)
        log("\n--- Attempting to delete photo after authentication ---")
        
        # Get a photo ID
        get_resp = requests.get(
            f"{BASE_URL}/programs/{program_id}",
            headers=headers(),
            timeout=10
        )
        program = get_resp.json()
        photos = program.get('photos', [])
        
        if len(photos) > 0:
            photo_id = photos[0].get('id')
            delete_resp = requests.post(
                f"{BASE_URL}/programs/{program_id}/delete-photo",
                json={"photoId": photo_id},
                headers=headers(),
                timeout=10
            )
            
            log(f"Delete status: {delete_resp.status_code}")
            log(f"Delete response: {delete_resp.text}")
            
            if delete_resp.status_code != 409:
                log(f"❌ FAIL: Expected 409 for delete, got {delete_resp.status_code}", "ERROR")
                return False
            
            log(f"✅ Delete correctly rejected with 409")
        else:
            log(f"⚠️  No photos to test delete (skipping delete test)")
        
        log(f"\n✅ PASS: Authenticated state guard working correctly")
        return True
        
    except Exception as e:
        log(f"❌ FAIL: Exception: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

def cleanup():
    """Test 11: Cleanup test data"""
    log("\n" + "=" * 80)
    log("TEST 11: Cleanup")
    log("=" * 80)
    
    try:
        # Delete in reverse order of dependencies
        cleanup_order = [
            ('program', 'programs'),
            ('team', 'teams'),
            ('village', 'villages'),
            ('branch', 'branches'),
            ('district', 'districts'),
            ('ro', 'regional_offices'),
            ('bank', 'banks')
        ]
        
        for key, collection in cleanup_order:
            entity_id = created_ids.get(key)
            if entity_id:
                log(f"\n--- Deleting {collection}/{entity_id} ---")
                
                # Special handling for program deletion (requires confirm)
                if collection == 'programs':
                    response = requests.delete(
                        f"{BASE_URL}/{collection}/{entity_id}",
                        json={"confirm": "DELETE"},
                        headers=headers(),
                        timeout=10
                    )
                else:
                    response = requests.delete(
                        f"{BASE_URL}/{collection}/{entity_id}",
                        headers=headers(),
                        timeout=10
                    )
                
                if response.status_code == 200:
                    log(f"✅ Deleted {collection}/{entity_id}")
                else:
                    log(f"⚠️  Could not delete {collection}/{entity_id}: {response.status_code} - {response.text}", "WARN")
        
        log(f"\n✅ PASS: Cleanup completed")
        return True
        
    except Exception as e:
        log(f"⚠️  Cleanup exception: {str(e)}", "WARN")
        return True  # Don't fail the test suite on cleanup errors

def main():
    """Run all tests"""
    log("=" * 80)
    log("FINLIT360 v3.2 - Cloudinary Direct Upload Backend Tests")
    log("=" * 80)
    log(f"Base URL: {BASE_URL}")
    log(f"Admin: {ADMIN_USERNAME}")
    log("")
    
    tests = [
        ("Auth", test_auth),
        ("Setup Program Chain", setup_program_chain),
        ("Reject Base64", test_reject_base64),
        ("Reject Empty URL", test_reject_empty_url),
        ("Reject Malformed URL", test_reject_malformed_url),
        ("Accept Cloudinary URL", test_accept_cloudinary_url),
        ("Photo Appending", test_photo_appending),
        ("Delete Photo", test_delete_photo),
        ("Auto-transition to Conducted", test_auto_transition_to_conducted),
        ("Authenticated State Guard", test_authenticated_state_guard),
        ("Cleanup", cleanup)
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
            
            # Stop if setup fails
            if name == "Setup Program Chain" and not result:
                log("\n❌ Setup failed. Stopping tests.", "ERROR")
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
