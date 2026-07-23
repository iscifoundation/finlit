#!/usr/bin/env python3
"""
FINLIT360 v3.1 Backend API Test Suite
Tests v3.1 changes: mandatory email, primary admin bootstrap, demo data wipe
"""
import requests
import json
import time
from typing import Dict, Any, Optional
from pymongo import MongoClient
from datetime import datetime, timedelta
import uuid
import os

# Load from .env
BASE_URL = "https://finlit360-camp.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "finlit360"  # As per review request

PRIMARY_ADMIN_EMAIL = "[email protected]"

# Global storage for test data
test_data = {
    "admin_token": None,
    "admin_user_id": None,
    "created_items": [],  # Track items to cleanup
}

def print_test(name: str):
    """Print test name"""
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def print_result(success: bool, message: str, details: Any = None):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if details:
        print(f"Details: {json.dumps(details, indent=2, default=str)[:500]}")

def make_request(method: str, endpoint: str, token: Optional[str] = None, 
                 data: Optional[Dict] = None, params: Optional[Dict] = None,
                 expect_html: bool = False) -> tuple:
    """Make HTTP request and return (success, response_data, status_code)"""
    url = f"{BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, params=params, timeout=30, allow_redirects=False)
        elif method == "POST":
            resp = requests.post(url, headers=headers, json=data, timeout=30, allow_redirects=False)
        elif method == "PUT":
            resp = requests.put(url, headers=headers, json=data, timeout=30, allow_redirects=False)
        elif method == "PATCH":
            resp = requests.patch(url, headers=headers, json=data, timeout=30, allow_redirects=False)
        elif method == "DELETE":
            resp = requests.delete(url, headers=headers, timeout=30, allow_redirects=False)
        else:
            return False, {"error": "Invalid method"}, 0
        
        if expect_html:
            return resp.status_code < 400, {"text": resp.text, "headers": dict(resp.headers)}, resp.status_code
        
        try:
            response_data = resp.json()
        except:
            response_data = {"text": resp.text[:500]}
        
        return resp.status_code < 400, response_data, resp.status_code
    except Exception as e:
        return False, {"error": str(e)}, 0

def get_db():
    """Get MongoDB database connection"""
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]

# ============================================================================
# 1. SEED / BOOTSTRAP TESTS
# ============================================================================

def test_seed_bootstrap():
    """Test: After server start, DB has exactly ONE user ([email protected]) and demoDataWiped_v3=true"""
    print_test("1.1 Seed/Bootstrap: ONE user + demoDataWiped_v3 flag")
    
    # Hit API to trigger seedIfEmpty (use /root or any endpoint)
    success, data, status = make_request("GET", "/root")
    if not success or status != 200:
        print_result(False, f"API root endpoint failed (status {status})", data)
        return False
    
    # Check DB
    db = get_db()
    
    # Check users collection - should have exactly ONE user
    users = list(db.users.find({}))
    if len(users) != 1:
        print_result(False, f"Expected exactly 1 user, found {len(users)}", 
                    {"users": [{"email": u.get("email"), "role": u.get("role")} for u in users]})
        return False
    
    user = users[0]
    if user.get("email") != PRIMARY_ADMIN_EMAIL:
        print_result(False, f"User email should be {PRIMARY_ADMIN_EMAIL}, got {user.get('email')}", user)
        return False
    
    if user.get("role") != "admin":
        print_result(False, f"User role should be admin, got {user.get('role')}", user)
        return False
    
    if user.get("isDemo") != False:
        print_result(False, f"User isDemo should be false, got {user.get('isDemo')}", user)
        return False
    
    test_data["admin_user_id"] = user["id"]
    
    # Check demoDataWiped_v3 flag
    wipe_flag = db.settings.find_one({"key": "demoDataWiped_v3"})
    if not wipe_flag or wipe_flag.get("value") != True:
        print_result(False, "demoDataWiped_v3 flag not set or not true", wipe_flag)
        return False
    
    # Check other collections are empty
    collections_to_check = ['banks', 'regional_offices', 'districts', 'branches', 'villages', 
                           'teams', 'programs', 'invoices', 'expenses', 'attendance', 
                           'messages', 'notifications', 'audit_logs', 'salary_payments']
    
    for coll in collections_to_check:
        count = db[coll].count_documents({})
        if count > 0:
            print_result(False, f"Collection {coll} should be empty, found {count} documents", None)
            return False
    
    print_result(True, "Bootstrap successful: ONE user, demoDataWiped_v3=true, all other collections empty", 
                {"user_email": user.get("email"), "user_role": user.get("role"), "isDemo": user.get("isDemo")})
    return True

def test_seed_idempotent():
    """Test: Re-hitting API should NOT re-wipe data (idempotent)"""
    print_test("1.2 Seed/Bootstrap: Idempotent (no re-wipe)")
    
    # Create a test bank to verify it doesn't get wiped
    db = get_db()
    test_bank_id = str(uuid.uuid4())
    db.banks.insert_one({
        "id": test_bank_id,
        "name": "Test Bank Idempotent",
        "code": "TBI",
        "createdAt": datetime.utcnow()
    })
    
    # Hit API again
    success, data, status = make_request("GET", "/root")
    if not success or status != 200:
        print_result(False, f"API root endpoint failed (status {status})", data)
        return False
    
    # Check if test bank still exists
    test_bank = db.banks.find_one({"id": test_bank_id})
    if not test_bank:
        print_result(False, "Test bank was wiped - seed is NOT idempotent", None)
        return False
    
    # Cleanup
    db.banks.delete_one({"id": test_bank_id})
    
    print_result(True, "Seed is idempotent - no re-wipe occurred", None)
    return True

# ============================================================================
# 2. MAGIC LINK AUTH TESTS
# ============================================================================

def test_magic_link_invalid_email():
    """Test: POST /auth/magic-link with invalid email format - should 400"""
    print_test("2.1 Magic Link: Invalid email format (should 400)")
    success, data, status = make_request("POST", "/auth/magic-link", 
                                         data={"email": "not-an-email"})
    
    if not success and status == 400 and "valid email" in data.get("error", "").lower():
        print_result(True, "Correctly rejected invalid email with 400", data)
        return True
    else:
        print_result(False, f"Should return 400 for invalid email (got {status})", data)
        return False

def test_magic_link_unknown_email():
    """Test: POST /auth/magic-link with unknown email - should 404"""
    print_test("2.2 Magic Link: Unknown email (should 404)")
    success, data, status = make_request("POST", "/auth/magic-link", 
                                         data={"email": "unknown@nowhere.com"})
    
    if not success and status == 404 and "not registered" in data.get("error", "").lower():
        print_result(True, "Correctly rejected unknown email with 404", data)
        return True
    else:
        print_result(False, f"Should return 404 for unknown email (got {status})", data)
        return False

def test_magic_link_valid_email():
    """Test: POST /auth/magic-link with primary admin email - should 200 and create DB record"""
    print_test("2.3 Magic Link: Valid email (should 200 + DB record)")
    success, data, status = make_request("POST", "/auth/magic-link", 
                                         data={"email": PRIMARY_ADMIN_EMAIL})
    
    if success and status == 200 and data.get("success"):
        # Check DB for magic_links record
        db = get_db()
        link = db.magic_links.find_one({"email": PRIMARY_ADMIN_EMAIL, "used": False}, sort=[("createdAt", -1)])
        if link:
            test_data["magic_link_token"] = link["token"]
            print_result(True, "Magic link sent and DB record created", 
                        {"email": PRIMARY_ADMIN_EMAIL, "used": link["used"]})
            return True
        else:
            print_result(False, "Magic link sent but no DB record found", data)
            return False
    else:
        print_result(False, f"Failed to send magic link (status {status})", data)
        return False

def test_magic_link_callback_valid():
    """Test: GET /auth/magic-callback with valid token - should return HTML with localStorage"""
    print_test("2.4 Magic Link Callback: Valid token (should return HTML + session)")
    token = test_data.get("magic_link_token")
    if not token:
        print_result(False, "No magic link token available", None)
        return False
    
    success, data, status = make_request("GET", f"/auth/magic-callback?token={token}", 
                                         expect_html=True)
    
    if success and status == 200:
        html = data.get("text", "")
        if "localStorage.setItem('finlit_token'" in html:
            # Extract token from HTML
            import re
            match = re.search(r"localStorage\.setItem\('finlit_token','([^']+)'\)", html)
            if match:
                test_data["admin_token"] = match.group(1)
                # Check DB - magic_links should be marked used=true
                db = get_db()
                link = db.magic_links.find_one({"token": token})
                if link and link.get("used") == True:
                    # Check session was created
                    session = db.sessions.find_one({"token": test_data["admin_token"]})
                    if session:
                        print_result(True, "Magic link callback successful, token extracted, DB marked used, session created", 
                                    {"token_length": len(test_data["admin_token"])})
                        return True
                    else:
                        print_result(False, "Session not created in DB", None)
                        return False
                else:
                    print_result(False, "Magic link not marked as used in DB", link)
                    return False
            else:
                print_result(False, "Token not found in HTML", html[:200])
                return False
        else:
            print_result(False, "HTML doesn't contain localStorage.setItem", html[:200])
            return False
    else:
        print_result(False, f"Failed to get callback (status {status})", data)
        return False

def test_magic_link_callback_reuse():
    """Test: GET /auth/magic-callback with same token again - should redirect with error=link_used"""
    print_test("2.5 Magic Link Callback: Reuse token (should redirect with error=link_used)")
    token = test_data.get("magic_link_token")
    if not token:
        print_result(False, "No magic link token available", None)
        return False
    
    success, data, status = make_request("GET", f"/auth/magic-callback?token={token}", 
                                         expect_html=True)
    
    # Should be a redirect (3xx) or contain error in response
    if status in [301, 302, 303, 307, 308]:
        location = data.get("headers", {}).get("Location", "")
        if "error=link_used" in location:
            print_result(True, "Correctly redirected with error=link_used", {"location": location})
            return True
        else:
            print_result(False, f"Redirect doesn't contain error=link_used: {location}", data)
            return False
    else:
        # Check if it's in the response text
        text = data.get("text", "")
        if "error=link_used" in text or "link_used" in text:
            print_result(True, "Correctly redirected with error=link_used", {"status": status})
            return True
        else:
            print_result(False, f"Should redirect with error=link_used (got {status})", data)
            return False

# ============================================================================
# 3. USER CREATION EMAIL VALIDATION TESTS
# ============================================================================

def test_user_create_missing_email():
    """Test: POST /users without email - should 400"""
    print_test("3.1 User Create: Missing email (should 400)")
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["admin_token"],
                                         data={"name": "Test User", "role": "program_manager"})
    
    if not success and status == 400 and "email" in data.get("error", "").lower():
        print_result(True, "Correctly rejected user without email (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 with email error (got {status})", data)
        return False

def test_user_create_invalid_email():
    """Test: POST /users with invalid email - should 400"""
    print_test("3.2 User Create: Invalid email (should 400)")
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["admin_token"],
                                         data={"name": "Test User", "email": "invalid", "role": "program_manager"})
    
    if not success and status == 400 and "valid email" in data.get("error", "").lower():
        print_result(True, "Correctly rejected invalid email (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 with valid email error (got {status})", data)
        return False

def test_user_create_valid_email():
    """Test: POST /users with valid email - should 200"""
    print_test("3.3 User Create: Valid email (should 200)")
    email = f"pm{int(time.time())}@test.com"
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["admin_token"],
                                         data={"name": "PM One", "email": email, "role": "program_manager"})
    
    if success and status == 200 and data.get("id"):
        test_data["created_items"].append(("user", data["id"]))
        test_data["pm_user_id"] = data["id"]
        test_data["pm_email"] = email
        if data.get("email") == email and data.get("isDemo") == False and data.get("mobile") is None:
            print_result(True, "User created successfully with email", 
                        {"id": data["id"], "email": data["email"], "isDemo": data["isDemo"]})
            return True
        else:
            print_result(False, "User created but fields incorrect", data)
            return False
    else:
        print_result(False, f"Failed to create user (status {status})", data)
        return False

def test_user_create_duplicate_email():
    """Test: POST /users with duplicate email - should 409"""
    print_test("3.4 User Create: Duplicate email (should 409)")
    email = test_data.get("pm_email")
    if not email:
        print_result(False, "No PM email available", None)
        return False
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["admin_token"],
                                         data={"name": "PM Two", "email": email, "role": "program_manager"})
    
    if not success and status == 409 and "already exists" in data.get("error", "").lower():
        print_result(True, "Correctly rejected duplicate email (409)", data)
        return True
    else:
        print_result(False, f"Should return 409 for duplicate email (got {status})", data)
        return False

def test_user_create_invalid_mobile():
    """Test: POST /users with invalid mobile - should 400"""
    print_test("3.5 User Create: Invalid mobile (should 400)")
    email = f"team{int(time.time())}@test.com"
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["admin_token"],
                                         data={"name": "Team One", "email": email, "role": "team", "mobile": "123"})
    
    if not success and status == 400 and "10-digit" in data.get("error", ""):
        print_result(True, "Correctly rejected invalid mobile (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 for invalid mobile (got {status})", data)
        return False

def test_user_create_valid_mobile():
    """Test: POST /users with valid mobile - should 200"""
    print_test("3.6 User Create: Valid mobile (should 200)")
    email = f"team{int(time.time())}@test.com"
    mobile = f"98765{int(time.time()) % 100000:05d}"
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["admin_token"],
                                         data={"name": "Team One", "email": email, "role": "team", "mobile": mobile})
    
    if success and status == 200 and data.get("id"):
        test_data["created_items"].append(("user", data["id"]))
        test_data["team_mobile"] = mobile
        print_result(True, "User created successfully with mobile", 
                    {"id": data["id"], "mobile": data["mobile"]})
        return True
    else:
        print_result(False, f"Failed to create user (status {status})", data)
        return False

def test_user_create_duplicate_mobile():
    """Test: POST /users with duplicate mobile - should 409"""
    print_test("3.7 User Create: Duplicate mobile (should 409)")
    mobile = test_data.get("team_mobile")
    if not mobile:
        print_result(False, "No team mobile available", None)
        return False
    
    email = f"team2{int(time.time())}@test.com"
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["admin_token"],
                                         data={"name": "Team Two", "email": email, "role": "team", "mobile": mobile})
    
    if not success and status == 409 and "mobile already exists" in data.get("error", "").lower():
        print_result(True, "Correctly rejected duplicate mobile (409)", data)
        return True
    else:
        print_result(False, f"Should return 409 for duplicate mobile (got {status})", data)
        return False

# ============================================================================
# 4. BRANCH CREATION WITH BRANCH MANAGER EMAIL TESTS
# ============================================================================

def test_branch_create_missing_bm_email():
    """Test: POST /branches without branchManagerEmail - should 400"""
    print_test("4.1 Branch Create: Missing branchManagerEmail (should 400)")
    
    # First create Bank -> RO -> District
    bank_data = {"name": "Test Bank", "code": "TB"}
    s1, bank, _ = make_request("POST", "/banks", token=test_data["admin_token"], data=bank_data)
    if not s1:
        print_result(False, "Failed to create bank", bank)
        return False
    test_data["created_items"].append(("bank", bank["id"]))
    test_data["bank_id"] = bank["id"]
    
    ro_data = {"bankId": bank["id"], "name": "Test RO", "state": "MP", "address": "Test Address", "feePerProgram": 3750}
    s2, ro, _ = make_request("POST", "/regional_offices", token=test_data["admin_token"], data=ro_data)
    if not s2:
        print_result(False, "Failed to create RO", ro)
        return False
    test_data["created_items"].append(("regional_office", ro["id"]))
    test_data["ro_id"] = ro["id"]
    
    district_data = {"roId": ro["id"], "name": "Test District", "state": "MP"}
    s3, district, _ = make_request("POST", "/districts", token=test_data["admin_token"], data=district_data)
    if not s3:
        print_result(False, "Failed to create district", district)
        return False
    test_data["created_items"].append(("district", district["id"]))
    test_data["district_id"] = district["id"]
    
    # Try to create branch without branchManagerEmail
    branch_data = {"districtId": district["id"], "name": "Br1", "code": "B1", "address": "addr"}
    success, data, status = make_request("POST", "/branches", token=test_data["admin_token"], data=branch_data)
    
    if not success and status == 400 and "branch manager email" in data.get("error", "").lower():
        print_result(True, "Correctly rejected branch without branchManagerEmail (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 for missing branchManagerEmail (got {status})", data)
        return False

def test_branch_create_invalid_bm_email():
    """Test: POST /branches with invalid branchManagerEmail - should 400"""
    print_test("4.2 Branch Create: Invalid branchManagerEmail (should 400)")
    
    district_id = test_data.get("district_id")
    if not district_id:
        print_result(False, "No district ID available (previous test failed)", None)
        return False
    
    branch_data = {
        "districtId": district_id,
        "name": "Br1",
        "code": "B1",
        "address": "addr",
        "branchManagerEmail": "invalid"
    }
    success, data, status = make_request("POST", "/branches", token=test_data["admin_token"], data=branch_data)
    
    if not success and status == 400:
        print_result(True, "Correctly rejected invalid branchManagerEmail (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 for invalid branchManagerEmail (got {status})", data)
        return False

def test_branch_create_valid_bm_email():
    """Test: POST /branches with valid branchManagerEmail - should 200 and auto-create BM user"""
    print_test("4.3 Branch Create: Valid branchManagerEmail (should 200 + auto-create BM)")
    
    bm_email = f"bm{int(time.time())}@test.com"
    branch_data = {
        "districtId": test_data["district_id"],
        "name": "Br1",
        "code": "B1",
        "address": "addr",
        "branchManagerEmail": bm_email,
        "branchManagerName": "New BM"
    }
    success, data, status = make_request("POST", "/branches", token=test_data["admin_token"], data=branch_data)
    
    if success and status == 200 and data.get("id"):
        test_data["created_items"].append(("branch", data["id"]))
        test_data["branch_id"] = data["id"]
        test_data["bm_email"] = bm_email
        
        # Verify BM user was created
        db = get_db()
        bm_user = db.users.find_one({"email": bm_email})
        if bm_user:
            test_data["created_items"].append(("user", bm_user["id"]))
            if (bm_user.get("role") == "branch_manager" and 
                bm_user.get("branchId") == data["id"] and 
                bm_user.get("isDemo") == False):
                # Verify branch has manager info
                if (data.get("managerId") == bm_user["id"] and 
                    data.get("managerName") == "New BM" and 
                    data.get("managerEmail") == bm_email):
                    print_result(True, "Branch created and BM user auto-created successfully", 
                                {"branch_id": data["id"], "bm_user_id": bm_user["id"], "bm_email": bm_email})
                    return True
                else:
                    print_result(False, "Branch manager info not set correctly", data)
                    return False
            else:
                print_result(False, "BM user created but fields incorrect", bm_user)
                return False
        else:
            print_result(False, "BM user not created", None)
            return False
    else:
        print_result(False, f"Failed to create branch (status {status})", data)
        return False

def test_branch_create_existing_bm_email():
    """Test: POST /branches with existing branchManagerEmail - should 200 and re-link existing user"""
    print_test("4.4 Branch Create: Existing branchManagerEmail (should 200 + re-link)")
    
    bm_email = test_data.get("bm_email")
    if not bm_email:
        print_result(False, "No BM email available", None)
        return False
    
    branch_data = {
        "districtId": test_data["district_id"],
        "name": "Br2",
        "code": "B2",
        "address": "addr2",
        "branchManagerEmail": bm_email,
        "branchManagerName": "Existing BM"
    }
    success, data, status = make_request("POST", "/branches", token=test_data["admin_token"], data=branch_data)
    
    if success and status == 200 and data.get("id"):
        test_data["created_items"].append(("branch", data["id"]))
        
        # Verify BM user was re-linked (branchId updated)
        db = get_db()
        bm_users = list(db.users.find({"email": bm_email}))
        if len(bm_users) == 1:
            bm_user = bm_users[0]
            if bm_user.get("branchId") == data["id"]:
                print_result(True, "Branch created and existing BM user re-linked (no duplicate)", 
                            {"branch_id": data["id"], "bm_user_id": bm_user["id"], "bm_count": len(bm_users)})
                return True
            else:
                print_result(False, f"BM user branchId not updated (expected {data['id']}, got {bm_user.get('branchId')})", bm_user)
                return False
        else:
            print_result(False, f"Expected 1 BM user, found {len(bm_users)}", bm_users)
            return False
    else:
        print_result(False, f"Failed to create branch (status {status})", data)
        return False

# ============================================================================
# 5. USER UPDATE EMAIL VALIDATION TESTS
# ============================================================================

def test_user_update_empty_email():
    """Test: PATCH /users/:id with empty email - should 400"""
    print_test("5.1 User Update: Empty email (should 400)")
    
    user_id = test_data.get("pm_user_id")
    if not user_id:
        print_result(False, "No PM user ID available", None)
        return False
    
    success, data, status = make_request("PATCH", f"/users/{user_id}", 
                                         token=test_data["admin_token"],
                                         data={"email": ""})
    
    if not success and status == 400 and "email" in data.get("error", "").lower():
        print_result(True, "Correctly rejected empty email (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 for empty email (got {status})", data)
        return False

def test_user_update_invalid_email():
    """Test: PATCH /users/:id with invalid email - should 400"""
    print_test("5.2 User Update: Invalid email (should 400)")
    
    user_id = test_data.get("pm_user_id")
    if not user_id:
        print_result(False, "No PM user ID available", None)
        return False
    
    success, data, status = make_request("PATCH", f"/users/{user_id}", 
                                         token=test_data["admin_token"],
                                         data={"email": "invalid"})
    
    if not success and status == 400 and "valid email" in data.get("error", "").lower():
        print_result(True, "Correctly rejected invalid email (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 for invalid email (got {status})", data)
        return False

def test_user_update_duplicate_email():
    """Test: PATCH /users/:id with another user's email - should 409"""
    print_test("5.3 User Update: Duplicate email (should 409)")
    
    user_id = test_data.get("pm_user_id")
    if not user_id:
        print_result(False, "No PM user ID available", None)
        return False
    
    success, data, status = make_request("PATCH", f"/users/{user_id}", 
                                         token=test_data["admin_token"],
                                         data={"email": PRIMARY_ADMIN_EMAIL})
    
    if not success and status == 409 and "already uses this email" in data.get("error", "").lower():
        print_result(True, "Correctly rejected duplicate email (409)", data)
        return True
    else:
        print_result(False, f"Should return 409 for duplicate email (got {status})", data)
        return False

def test_user_update_valid_email():
    """Test: PATCH /users/:id with valid new email - should 200"""
    print_test("5.4 User Update: Valid new email (should 200)")
    
    user_id = test_data.get("pm_user_id")
    if not user_id:
        print_result(False, "No PM user ID available", None)
        return False
    
    new_email = f"pm_updated{int(time.time())}@test.com"
    success, data, status = make_request("PATCH", f"/users/{user_id}", 
                                         token=test_data["admin_token"],
                                         data={"email": new_email})
    
    if success and status == 200 and data.get("email") == new_email:
        print_result(True, "User email updated successfully", 
                    {"user_id": user_id, "new_email": new_email})
        return True
    else:
        print_result(False, f"Failed to update email (status {status})", data)
        return False

# ============================================================================
# 6. SETTINGS DEMO LOGIN TESTS
# ============================================================================

def test_settings_get():
    """Test: GET /settings as primary admin - should 200"""
    print_test("6.1 Settings: GET /settings (should 200)")
    success, data, status = make_request("GET", "/settings", token=test_data["admin_token"])
    
    if success and status == 200:
        if "demoDataWiped_v3" in data and data["demoDataWiped_v3"] == True:
            print_result(True, "Settings retrieved successfully", data)
            return True
        else:
            print_result(False, "demoDataWiped_v3 not in settings or not true", data)
            return False
    else:
        print_result(False, f"Failed to get settings (status {status})", data)
        return False

def test_settings_demo_login_non_primary():
    """Test: POST /settings/demo-login with non-primary admin - should 403"""
    print_test("6.2 Settings: Non-primary admin toggle demo login (should 403)")
    
    # Create another admin user
    other_admin_email = f"admin{int(time.time())}@test.com"
    s1, other_admin, _ = make_request("POST", "/users", 
                                      token=test_data["admin_token"],
                                      data={"name": "Other Admin", "email": other_admin_email, "role": "admin"})
    if not s1:
        print_result(False, "Failed to create other admin", other_admin)
        return False
    
    test_data["created_items"].append(("user", other_admin["id"]))
    
    # Create session for other admin
    db = get_db()
    other_token = str(uuid.uuid4())
    db.sessions.insert_one({
        "token": other_token,
        "userId": other_admin["id"],
        "createdAt": datetime.utcnow(),
        "expiresAt": datetime.utcnow() + timedelta(days=30)
    })
    test_data["created_items"].append(("session", other_token))
    
    # Try to toggle demo login
    success, data, status = make_request("POST", "/settings/demo-login", 
                                         token=other_token,
                                         data={"enabled": False})
    
    if not success and status == 403 and PRIMARY_ADMIN_EMAIL in data.get("error", ""):
        print_result(True, "Correctly rejected non-primary admin (403)", data)
        return True
    else:
        print_result(False, f"Should return 403 mentioning primary admin email (got {status})", data)
        return False

def test_settings_demo_login_primary():
    """Test: POST /settings/demo-login with primary admin - should 200"""
    print_test("6.3 Settings: Primary admin toggle demo login (should 200)")
    
    success, data, status = make_request("POST", "/settings/demo-login", 
                                         token=test_data["admin_token"],
                                         data={"enabled": False})
    
    if success and status == 200 and data.get("success") and data.get("value") == False:
        print_result(True, "Primary admin successfully toggled demo login", data)
        return True
    else:
        print_result(False, f"Failed to toggle demo login (status {status})", data)
        return False

# ============================================================================
# 7. FULL WORKFLOW REGRESSION TESTS
# ============================================================================

def test_full_workflow():
    """Test: Primary admin creates Bank → RO → District → Branch → Village → Team → Program (with teamId) → Confirm"""
    print_test("7.1 Full Workflow: Bank → RO → District → Branch → Village → Team → Program → Confirm")
    
    # Bank (already created in test 4.1)
    bank_id = test_data.get("bank_id")
    if not bank_id:
        print_result(False, "No bank ID available", None)
        return False
    
    # RO (already created in test 4.1)
    ro_id = test_data.get("ro_id")
    if not ro_id:
        print_result(False, "No RO ID available", None)
        return False
    
    # District (already created in test 4.1)
    district_id = test_data.get("district_id")
    if not district_id:
        print_result(False, "No district ID available", None)
        return False
    
    # Branch (already created in test 4.3)
    branch_id = test_data.get("branch_id")
    if not branch_id:
        print_result(False, "No branch ID available", None)
        return False
    
    # Village
    village_data = {"branchId": branch_id, "name": "Test Village", "state": "MP"}
    s1, village, _ = make_request("POST", "/villages", token=test_data["admin_token"], data=village_data)
    if not s1:
        print_result(False, "Failed to create village", village)
        return False
    test_data["created_items"].append(("village", village["id"]))
    
    # Team
    team_data = {
        "name": "Test Team",
        "branchId": branch_id,
        "members": [
            {"name": "Member 1", "mobile": f"91234{int(time.time()) % 100000:05d}", "dailySalary": 500}
        ]
    }
    s2, team, _ = make_request("POST", "/teams", token=test_data["admin_token"], data=team_data)
    if not s2:
        print_result(False, "Failed to create team", team)
        return False
    test_data["created_items"].append(("team", team["id"]))
    
    # Program
    program_data = {
        "branchId": branch_id,
        "villageId": village["id"],
        "teamId": team["id"],
        "proposedDate": "2026-02-01",
        "remarks": "Full workflow test"
    }
    s3, program, _ = make_request("POST", "/programs", token=test_data["admin_token"], data=program_data)
    if not s3:
        print_result(False, "Failed to create program", program)
        return False
    test_data["created_items"].append(("program", program["id"]))
    
    # Confirm program
    s4, confirmed, _ = make_request("POST", f"/programs/{program['id']}/confirm", 
                                    token=test_data["admin_token"])
    if not s4:
        print_result(False, "Failed to confirm program", confirmed)
        return False
    
    if confirmed.get("status") == "confirmed":
        print_result(True, "Full workflow successful: Bank → RO → District → Branch → Village → Team → Program → Confirm", 
                    {"program_id": program["id"], "status": confirmed["status"]})
        return True
    else:
        print_result(False, f"Program not confirmed (status: {confirmed.get('status')})", confirmed)
        return False

# ============================================================================
# CLEANUP
# ============================================================================

def cleanup_test_data():
    """Cleanup test data from DB"""
    print_test("CLEANUP: Removing test data")
    
    db = get_db()
    cleanup_count = 0
    
    # Reverse order to handle dependencies
    for item_type, item_id in reversed(test_data.get("created_items", [])):
        try:
            if item_type == "program":
                db.programs.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "team":
                db.teams.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "village":
                db.villages.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "branch":
                db.branches.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "district":
                db.districts.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "regional_office":
                db.regional_offices.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "bank":
                db.banks.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "user":
                db.users.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "session":
                db.sessions.delete_one({"token": item_id})
                cleanup_count += 1
        except Exception as e:
            print(f"Failed to cleanup {item_type} {item_id}: {e}")
    
    print_result(True, f"Cleaned up {cleanup_count} test items", None)

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def run_all_tests():
    """Run all tests in sequence"""
    print("\n" + "="*80)
    print("FINLIT360 v3.1 BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"DB Name: {DB_NAME}")
    print("="*80 + "\n")
    
    results = []
    
    # 1. Seed / Bootstrap
    print("\n" + "="*80)
    print("SECTION 1: SEED / BOOTSTRAP")
    print("="*80)
    results.append(("1.1 Seed/Bootstrap - ONE user + demoDataWiped_v3", test_seed_bootstrap()))
    results.append(("1.2 Seed/Bootstrap - Idempotent", test_seed_idempotent()))
    
    # 2. Magic Link Auth
    print("\n" + "="*80)
    print("SECTION 2: MAGIC LINK AUTH")
    print("="*80)
    results.append(("2.1 Magic Link - Invalid email (400)", test_magic_link_invalid_email()))
    results.append(("2.2 Magic Link - Unknown email (404)", test_magic_link_unknown_email()))
    results.append(("2.3 Magic Link - Valid email (200 + DB)", test_magic_link_valid_email()))
    results.append(("2.4 Magic Link Callback - Valid token", test_magic_link_callback_valid()))
    results.append(("2.5 Magic Link Callback - Reuse (error=link_used)", test_magic_link_callback_reuse()))
    
    # 3. User Creation Email Validation
    print("\n" + "="*80)
    print("SECTION 3: USER CREATION EMAIL VALIDATION")
    print("="*80)
    results.append(("3.1 User Create - Missing email (400)", test_user_create_missing_email()))
    results.append(("3.2 User Create - Invalid email (400)", test_user_create_invalid_email()))
    results.append(("3.3 User Create - Valid email (200)", test_user_create_valid_email()))
    results.append(("3.4 User Create - Duplicate email (409)", test_user_create_duplicate_email()))
    results.append(("3.5 User Create - Invalid mobile (400)", test_user_create_invalid_mobile()))
    results.append(("3.6 User Create - Valid mobile (200)", test_user_create_valid_mobile()))
    results.append(("3.7 User Create - Duplicate mobile (409)", test_user_create_duplicate_mobile()))
    
    # 4. Branch Creation with Branch Manager Email
    print("\n" + "="*80)
    print("SECTION 4: BRANCH CREATION WITH BRANCH MANAGER EMAIL")
    print("="*80)
    results.append(("4.1 Branch Create - Missing branchManagerEmail (400)", test_branch_create_missing_bm_email()))
    results.append(("4.2 Branch Create - Invalid branchManagerEmail (400)", test_branch_create_invalid_bm_email()))
    results.append(("4.3 Branch Create - Valid branchManagerEmail (200 + auto-create)", test_branch_create_valid_bm_email()))
    results.append(("4.4 Branch Create - Existing branchManagerEmail (200 + re-link)", test_branch_create_existing_bm_email()))
    
    # 5. User Update Email Validation
    print("\n" + "="*80)
    print("SECTION 5: USER UPDATE EMAIL VALIDATION")
    print("="*80)
    results.append(("5.1 User Update - Empty email (400)", test_user_update_empty_email()))
    results.append(("5.2 User Update - Invalid email (400)", test_user_update_invalid_email()))
    results.append(("5.3 User Update - Duplicate email (409)", test_user_update_duplicate_email()))
    results.append(("5.4 User Update - Valid new email (200)", test_user_update_valid_email()))
    
    # 6. Settings Demo Login
    print("\n" + "="*80)
    print("SECTION 6: SETTINGS DEMO LOGIN")
    print("="*80)
    results.append(("6.1 Settings - GET /settings (200)", test_settings_get()))
    results.append(("6.2 Settings - Non-primary admin toggle (403)", test_settings_demo_login_non_primary()))
    results.append(("6.3 Settings - Primary admin toggle (200)", test_settings_demo_login_primary()))
    
    # 7. Full Workflow Regression
    print("\n" + "="*80)
    print("SECTION 7: FULL WORKFLOW REGRESSION")
    print("="*80)
    results.append(("7.1 Full Workflow - Bank → Program → Confirm", test_full_workflow()))
    
    # Cleanup
    cleanup_test_data()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    failed = sum(1 for _, result in results if not result)
    total = len(results)
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed} ✅")
    print(f"Failed: {failed} ❌")
    print(f"Success Rate: {(passed/total)*100:.1f}%\n")
    
    if failed > 0:
        print("Failed Tests:")
        for name, result in results:
            if not result:
                print(f"  ❌ {name}")
    
    print("\n" + "="*80)
    
    return passed, failed, total

if __name__ == "__main__":
    try:
        passed, failed, total = run_all_tests()
        exit(0 if failed == 0 else 1)
    except KeyboardInterrupt:
        print("\n\nTests interrupted by user")
        exit(1)
    except Exception as e:
        print(f"\n\nFatal error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
