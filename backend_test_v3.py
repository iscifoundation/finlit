#!/usr/bin/env python3
"""
FINLIT360 v3 Backend API Comprehensive Test Suite
Tests all v3 features as specified in the review request
"""
import requests
import json
import time
from typing import Dict, Any, Optional
from pymongo import MongoClient
from datetime import datetime, timedelta
import uuid

# Base URL from .env
BASE_URL = "https://finlit360-camp.preview.emergentagent.com/api"

# MongoDB connection
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "your_database_name"

# Test users (seeded)
DEMO_ADMIN_MOBILE = "9000000001"
DEMO_PM_MOBILE = "9000000002"
DEMO_BM_MOBILE = "9000000003"  # Endori branch
DEMO_RO_MOBILE = "9000000004"  # Gwalior RO
DEMO_TEAM_MOBILE = "9000000005"

REAL_ADMIN_EMAIL = "[email protected]"
REAL_ADMIN_MOBILE = "7987140498"

DEMO_OTP = "123456"

# Global storage for test data
test_data = {
    "demo_admin_token": None,
    "demo_pm_token": None,
    "demo_bm_token": None,
    "demo_ro_token": None,
    "demo_team_token": None,
    "real_admin_token": None,
    "real_admin_user_id": None,
    "master_data": {},
    "test_cleanup": [],  # Track items to cleanup
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
# 1. MAGIC LINK AUTH TESTS
# ============================================================================

def test_magic_link_unknown_email():
    """Test: POST /auth/magic-link with unknown email - should 404"""
    print_test("1.1 Magic Link: Unknown email (should 404)")
    success, data, status = make_request("POST", "/auth/magic-link", 
                                         data={"email": "unknown@x"})
    
    if not success and status == 404:
        print_result(True, "Correctly rejected unknown email with 404", data)
        return True
    else:
        print_result(False, f"Should return 404 for unknown email (got {status})", data)
        return False

def test_magic_link_invalid_email():
    """Test: POST /auth/magic-link with invalid email format - should 400"""
    print_test("1.2 Magic Link: Invalid email format (should 400)")
    success, data, status = make_request("POST", "/auth/magic-link", 
                                         data={"email": "not-email"})
    
    if not success and status == 400:
        print_result(True, "Correctly rejected invalid email with 400", data)
        return True
    else:
        print_result(False, f"Should return 400 for invalid email (got {status})", data)
        return False

def test_magic_link_valid_email():
    """Test: POST /auth/magic-link with valid email - should 200 and create DB record"""
    print_test("1.3 Magic Link: Valid email (should 200 + DB record)")
    success, data, status = make_request("POST", "/auth/magic-link", 
                                         data={"email": REAL_ADMIN_EMAIL})
    
    if success and status == 200 and data.get("success"):
        # Check DB for magic_links record
        db = get_db()
        link = db.magic_links.find_one({"email": REAL_ADMIN_EMAIL, "used": False}, sort=[("createdAt", -1)])
        if link:
            test_data["magic_link_token"] = link["token"]
            print_result(True, "Magic link sent and DB record created", 
                        {"email": REAL_ADMIN_EMAIL, "used": link["used"]})
            return True
        else:
            print_result(False, "Magic link sent but no DB record found", data)
            return False
    else:
        print_result(False, f"Failed to send magic link (status {status})", data)
        return False

def test_magic_link_callback_valid():
    """Test: GET /auth/magic-callback with valid token - should return HTML with localStorage"""
    print_test("1.4 Magic Link Callback: Valid token (should return HTML)")
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
                test_data["real_admin_token"] = match.group(1)
                # Check DB - magic_links should be marked used=true
                db = get_db()
                link = db.magic_links.find_one({"token": token})
                if link and link.get("used") == True:
                    print_result(True, "Magic link callback successful, token extracted, DB marked used", 
                                {"token_length": len(test_data["real_admin_token"])})
                    return True
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
    print_test("1.5 Magic Link Callback: Reuse token (should redirect with error=link_used)")
    token = test_data.get("magic_link_token")
    if not token:
        print_result(False, "No magic link token available", None)
        return False
    
    success, data, status = make_request("GET", f"/auth/magic-callback?token={token}", 
                                         expect_html=True)
    
    # Should be a redirect (3xx)
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
        if "error=link_used" in text:
            print_result(True, "Correctly redirected with error=link_used", {"status": status})
            return True
        else:
            print_result(False, f"Should redirect with error=link_used (got {status})", data)
            return False

def test_magic_link_callback_invalid():
    """Test: GET /auth/magic-callback with invalid token - should redirect with error=invalid_link"""
    print_test("1.6 Magic Link Callback: Invalid token (should redirect with error=invalid_link)")
    success, data, status = make_request("GET", "/auth/magic-callback?token=invalid", 
                                         expect_html=True)
    
    # Should be a redirect (3xx)
    if status in [301, 302, 303, 307, 308]:
        location = data.get("headers", {}).get("Location", "")
        if "error=invalid_link" in location:
            print_result(True, "Correctly redirected with error=invalid_link", {"location": location})
            return True
        else:
            print_result(False, f"Redirect doesn't contain error=invalid_link: {location}", data)
            return False
    else:
        # Check if it's in the response text
        text = data.get("text", "")
        if "error=invalid_link" in text:
            print_result(True, "Correctly redirected with error=invalid_link", {"status": status})
            return True
        else:
            print_result(False, f"Should redirect with error=invalid_link (got {status})", data)
            return False

# ============================================================================
# 2. PROGRAM CREATION REQUIRES TEAM
# ============================================================================

def test_program_create_without_team():
    """Test: POST /programs without teamId - should 400"""
    print_test("2.1 Program: Create without teamId (should 400)")
    
    # Login as PM first
    make_request("POST", "/auth/send-otp", data={"mobile": DEMO_PM_MOBILE})
    s, d, _ = make_request("POST", "/auth/verify-otp", 
                          data={"mobile": DEMO_PM_MOBILE, "otp": DEMO_OTP})
    if s:
        test_data["demo_pm_token"] = d["token"]
    
    # Get branch and village IDs
    s, branches, _ = make_request("GET", "/branches", token=test_data["demo_pm_token"])
    s2, villages, _ = make_request("GET", "/villages", token=test_data["demo_pm_token"])
    
    if not s or not s2 or not branches or not villages:
        print_result(False, "Failed to get master data", None)
        return False
    
    program_data = {
        "branchId": branches[0]["id"],
        "villageId": villages[0]["id"],
        "proposedDate": "2025-12-25",
        "remarks": "Test without team"
    }
    
    success, data, status = make_request("POST", "/programs", 
                                         token=test_data["demo_pm_token"],
                                         data=program_data)
    
    if not success and status == 400 and "team" in data.get("error", "").lower():
        print_result(True, "Correctly rejected program without teamId (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 with team error (got {status})", data)
        return False

def test_program_create_with_team():
    """Test: POST /programs with valid teamId - should 200"""
    print_test("2.2 Program: Create with teamId (should 200)")
    
    # Get team ID
    s, teams, _ = make_request("GET", "/teams", token=test_data["demo_pm_token"])
    if not s or not teams:
        print_result(False, "Failed to get teams", None)
        return False
    
    test_data["team_alpha_id"] = teams[0]["id"]
    
    # Get branch and village IDs
    s, branches, _ = make_request("GET", "/branches", token=test_data["demo_pm_token"])
    s2, villages, _ = make_request("GET", "/villages", token=test_data["demo_pm_token"])
    
    program_data = {
        "branchId": branches[0]["id"],
        "villageId": villages[0]["id"],
        "teamId": test_data["team_alpha_id"],
        "proposedDate": "2025-12-26",
        "remarks": "Test with team"
    }
    
    success, data, status = make_request("POST", "/programs", 
                                         token=test_data["demo_pm_token"],
                                         data=program_data)
    
    if success and data.get("id") and data.get("status") == "proposed":
        test_data["test_program_id"] = data["id"]
        test_data["test_cleanup"].append(("program", data["id"]))
        print_result(True, "Program created successfully with teamId", 
                    {"id": data["id"], "status": data["status"]})
        return True
    else:
        print_result(False, f"Failed to create program (status {status})", data)
        return False

# ============================================================================
# 3. CONFIRMATION MATRIX TESTS
# ============================================================================

def test_confirm_bm_own_branch():
    """Test: BM confirms own branch program - should 200"""
    print_test("3.1 Confirm: BM confirms own branch program (should 200)")
    
    # Login as BM
    make_request("POST", "/auth/send-otp", data={"mobile": DEMO_BM_MOBILE})
    s, d, _ = make_request("POST", "/auth/verify-otp", 
                          data={"mobile": DEMO_BM_MOBILE, "otp": DEMO_OTP})
    if s:
        test_data["demo_bm_token"] = d["token"]
        test_data["demo_bm_branch_id"] = d["user"].get("branchId")
    
    # Create a program in BM's branch
    s, branches, _ = make_request("GET", "/branches", token=test_data["demo_pm_token"])
    bm_branch = next((b for b in branches if b["id"] == test_data["demo_bm_branch_id"]), None)
    
    if not bm_branch:
        print_result(False, "BM branch not found", None)
        return False
    
    s2, villages, _ = make_request("GET", "/villages", token=test_data["demo_pm_token"])
    bm_village = next((v for v in villages if v["branchId"] == bm_branch["id"]), None)
    
    if not bm_village:
        print_result(False, "Village in BM branch not found", None)
        return False
    
    program_data = {
        "branchId": bm_branch["id"],
        "villageId": bm_village["id"],
        "teamId": test_data["team_alpha_id"],
        "proposedDate": "2025-12-27",
        "remarks": "Test BM confirm"
    }
    
    s3, prog, _ = make_request("POST", "/programs", 
                              token=test_data["demo_pm_token"],
                              data=program_data)
    
    if not s3:
        print_result(False, "Failed to create test program", prog)
        return False
    
    test_data["bm_program_id"] = prog["id"]
    test_data["test_cleanup"].append(("program", prog["id"]))
    
    # BM confirms
    success, data, status = make_request("POST", f"/programs/{prog['id']}/confirm", 
                                         token=test_data["demo_bm_token"])
    
    if success and data.get("status") == "confirmed" and data.get("branchConfirmed") == True:
        print_result(True, "BM successfully confirmed own branch program", 
                    {"status": data["status"], "branchConfirmed": data["branchConfirmed"]})
        return True
    else:
        print_result(False, f"BM failed to confirm (status {status})", data)
        return False

def test_confirm_bm_other_branch():
    """Test: BM confirms other branch program - should 403"""
    print_test("3.2 Confirm: BM confirms other branch program (should 403)")
    
    # Get a branch different from BM's branch
    s, branches, _ = make_request("GET", "/branches", token=test_data["demo_pm_token"])
    other_branch = next((b for b in branches if b["id"] != test_data["demo_bm_branch_id"]), None)
    
    if not other_branch:
        print_result(False, "Other branch not found", None)
        return False
    
    s2, villages, _ = make_request("GET", "/villages", token=test_data["demo_pm_token"])
    other_village = next((v for v in villages if v["branchId"] == other_branch["id"]), None)
    
    if not other_village:
        print_result(False, "Village in other branch not found", None)
        return False
    
    program_data = {
        "branchId": other_branch["id"],
        "villageId": other_village["id"],
        "teamId": test_data["team_alpha_id"],
        "proposedDate": "2025-12-28",
        "remarks": "Test BM other branch"
    }
    
    s3, prog, _ = make_request("POST", "/programs", 
                              token=test_data["demo_pm_token"],
                              data=program_data)
    
    if not s3:
        print_result(False, "Failed to create test program", prog)
        return False
    
    test_data["test_cleanup"].append(("program", prog["id"]))
    
    # BM tries to confirm
    success, data, status = make_request("POST", f"/programs/{prog['id']}/confirm", 
                                         token=test_data["demo_bm_token"])
    
    if not success and status == 403:
        print_result(True, "Correctly rejected BM confirming other branch (403)", data)
        return True
    else:
        print_result(False, f"Should return 403 for other branch (got {status})", data)
        return False

def test_confirm_admin_any():
    """Test: Admin confirms any program - should 200"""
    print_test("3.3 Confirm: Admin confirms any program (should 200)")
    
    # Login as demo admin
    make_request("POST", "/auth/send-otp", data={"mobile": DEMO_ADMIN_MOBILE})
    s, d, _ = make_request("POST", "/auth/verify-otp", 
                          data={"mobile": DEMO_ADMIN_MOBILE, "otp": DEMO_OTP})
    if s:
        test_data["demo_admin_token"] = d["token"]
    
    # Create a program
    s, branches, _ = make_request("GET", "/branches", token=test_data["demo_pm_token"])
    s2, villages, _ = make_request("GET", "/villages", token=test_data["demo_pm_token"])
    
    program_data = {
        "branchId": branches[0]["id"],
        "villageId": villages[0]["id"],
        "teamId": test_data["team_alpha_id"],
        "proposedDate": "2025-12-29",
        "remarks": "Test admin confirm"
    }
    
    s3, prog, _ = make_request("POST", "/programs", 
                              token=test_data["demo_pm_token"],
                              data=program_data)
    
    if not s3:
        print_result(False, "Failed to create test program", prog)
        return False
    
    test_data["test_cleanup"].append(("program", prog["id"]))
    
    # Admin confirms
    success, data, status = make_request("POST", f"/programs/{prog['id']}/confirm", 
                                         token=test_data["demo_admin_token"])
    
    if success and data.get("status") == "confirmed":
        print_result(True, "Admin successfully confirmed program", 
                    {"status": data["status"]})
        return True
    else:
        print_result(False, f"Admin failed to confirm (status {status})", data)
        return False

def test_confirm_ro_own():
    """Test: RO confirms own RO program - should 200"""
    print_test("3.4 Confirm: RO confirms own RO program (should 200)")
    
    # Login as RO
    make_request("POST", "/auth/send-otp", data={"mobile": DEMO_RO_MOBILE})
    s, d, _ = make_request("POST", "/auth/verify-otp", 
                          data={"mobile": DEMO_RO_MOBILE, "otp": DEMO_OTP})
    if s:
        test_data["demo_ro_token"] = d["token"]
        test_data["demo_ro_id"] = d["user"].get("roId")
    
    # Get programs in RO's region
    s2, programs, _ = make_request("GET", "/programs", token=test_data["demo_ro_token"])
    
    # Create a new program in RO's region
    s3, branches, _ = make_request("GET", "/branches", token=test_data["demo_pm_token"])
    s4, villages, _ = make_request("GET", "/villages", token=test_data["demo_pm_token"])
    
    program_data = {
        "branchId": branches[0]["id"],
        "villageId": villages[0]["id"],
        "teamId": test_data["team_alpha_id"],
        "proposedDate": "2025-12-30",
        "remarks": "Test RO confirm"
    }
    
    s5, prog, _ = make_request("POST", "/programs", 
                              token=test_data["demo_pm_token"],
                              data=program_data)
    
    if not s5:
        print_result(False, "Failed to create test program", prog)
        return False
    
    test_data["test_cleanup"].append(("program", prog["id"]))
    
    # RO confirms
    success, data, status = make_request("POST", f"/programs/{prog['id']}/confirm", 
                                         token=test_data["demo_ro_token"])
    
    if success and data.get("status") == "confirmed":
        print_result(True, "RO successfully confirmed own RO program", 
                    {"status": data["status"]})
        return True
    else:
        print_result(False, f"RO failed to confirm (status {status})", data)
        return False

def test_confirm_pm_under_30min():
    """Test: PM confirms program < 30 min old - should 403"""
    print_test("3.5 Confirm: PM confirms program < 30 min old (should 403)")
    
    # Create a fresh program
    s, branches, _ = make_request("GET", "/branches", token=test_data["demo_pm_token"])
    s2, villages, _ = make_request("GET", "/villages", token=test_data["demo_pm_token"])
    
    program_data = {
        "branchId": branches[0]["id"],
        "villageId": villages[0]["id"],
        "teamId": test_data["team_alpha_id"],
        "proposedDate": "2025-12-31",
        "remarks": "Test PM < 30 min"
    }
    
    s3, prog, _ = make_request("POST", "/programs", 
                              token=test_data["demo_pm_token"],
                              data=program_data)
    
    if not s3:
        print_result(False, "Failed to create test program", prog)
        return False
    
    test_data["test_cleanup"].append(("program", prog["id"]))
    
    # PM tries to confirm immediately
    success, data, status = make_request("POST", f"/programs/{prog['id']}/confirm", 
                                         token=test_data["demo_pm_token"])
    
    if not success and status == 403 and "30" in data.get("error", ""):
        print_result(True, "Correctly rejected PM confirm < 30 min (403)", data)
        return True
    else:
        print_result(False, f"Should return 403 with 30 min message (got {status})", data)
        return False

def test_confirm_pm_over_30min_no_reason():
    """Test: PM confirms program > 30 min old WITHOUT reason - should 400"""
    print_test("3.6 Confirm: PM confirms > 30 min WITHOUT reason (should 400)")
    
    # Create a program with createdAt = 1 hour ago in DB
    db = get_db()
    s, branches, _ = make_request("GET", "/branches", token=test_data["demo_pm_token"])
    s2, villages, _ = make_request("GET", "/villages", token=test_data["demo_pm_token"])
    s3, teams, _ = make_request("GET", "/teams", token=test_data["demo_pm_token"])
    
    prog_id = str(uuid.uuid4())
    old_time = datetime.utcnow() - timedelta(hours=1)
    
    program_doc = {
        "id": prog_id,
        "code": f"FLC-TEST{int(time.time())}",
        "branchId": branches[0]["id"],
        "villageId": villages[0]["id"],
        "teamId": teams[0]["id"],
        "proposedDate": datetime.utcnow() + timedelta(days=1),
        "status": "proposed",
        "branchConfirmed": False,
        "createdAt": old_time,
        "updatedAt": old_time,
        "createdBy": "test",
        "timeline": [],
        "photos": [],
        "teamPayments": [],
        "remarks": "Test PM > 30 min"
    }
    
    # Get RO and district info
    s4, districts, _ = make_request("GET", "/districts", token=test_data["demo_pm_token"])
    district = next((d for d in districts if d["id"] == branches[0]["districtId"]), None)
    if district:
        program_doc["districtId"] = district["id"]
        program_doc["roId"] = district["roId"]
        s5, ros, _ = make_request("GET", "/regional_offices", token=test_data["demo_admin_token"])
        ro = next((r for r in ros if r["id"] == district["roId"]), None)
        if ro:
            program_doc["bankId"] = ro["bankId"]
    
    db.programs.insert_one(program_doc)
    test_data["test_cleanup"].append(("program", prog_id))
    
    # PM tries to confirm without reason
    success, data, status = make_request("POST", f"/programs/{prog_id}/confirm", 
                                         token=test_data["demo_pm_token"])
    
    if not success and status == 400 and "reason" in data.get("error", "").lower():
        print_result(True, "Correctly rejected PM confirm without reason (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 with reason error (got {status})", data)
        return False

def test_confirm_pm_over_30min_with_reason():
    """Test: PM confirms program > 30 min old WITH reason - should 200"""
    print_test("3.7 Confirm: PM confirms > 30 min WITH reason (should 200)")
    
    # Create a program with createdAt = 1 hour ago in DB
    db = get_db()
    s, branches, _ = make_request("GET", "/branches", token=test_data["demo_pm_token"])
    s2, villages, _ = make_request("GET", "/villages", token=test_data["demo_pm_token"])
    s3, teams, _ = make_request("GET", "/teams", token=test_data["demo_pm_token"])
    
    prog_id = str(uuid.uuid4())
    old_time = datetime.utcnow() - timedelta(hours=2)
    
    program_doc = {
        "id": prog_id,
        "code": f"FLC-TEST{int(time.time())}",
        "branchId": branches[0]["id"],
        "villageId": villages[0]["id"],
        "teamId": teams[0]["id"],
        "proposedDate": datetime.utcnow() + timedelta(days=1),
        "status": "proposed",
        "branchConfirmed": False,
        "createdAt": old_time,
        "updatedAt": old_time,
        "createdBy": "test",
        "timeline": [],
        "photos": [],
        "teamPayments": [],
        "remarks": "Test PM > 30 min with reason"
    }
    
    # Get RO and district info
    s4, districts, _ = make_request("GET", "/districts", token=test_data["demo_pm_token"])
    district = next((d for d in districts if d["id"] == branches[0]["districtId"]), None)
    if district:
        program_doc["districtId"] = district["id"]
        program_doc["roId"] = district["roId"]
        s5, ros, _ = make_request("GET", "/regional_offices", token=test_data["demo_admin_token"])
        ro = next((r for r in ros if r["id"] == district["roId"]), None)
        if ro:
            program_doc["bankId"] = ro["bankId"]
    
    db.programs.insert_one(program_doc)
    test_data["test_cleanup"].append(("program", prog_id))
    
    # PM confirms with reason
    success, data, status = make_request("POST", f"/programs/{prog_id}/confirm", 
                                         token=test_data["demo_pm_token"],
                                         data={"reason": "Branch manager unavailable"})
    
    if success and data.get("status") == "confirmed":
        print_result(True, "PM successfully confirmed with reason", 
                    {"status": data["status"], "pmConfirmationReason": data.get("pmConfirmationReason")})
        return True
    else:
        print_result(False, f"PM failed to confirm with reason (status {status})", data)
        return False

# ============================================================================
# 4. BRANCH AUTO-CREATE BM TESTS
# ============================================================================

def test_branch_create_bm_real_admin():
    """Test: Real admin creates branch with branchManagerEmail - should auto-create BM user"""
    print_test("4.1 Branch: Real admin auto-creates BM (should 200)")
    
    # Get real admin user ID and create session
    db = get_db()
    real_admin = db.users.find_one({"email": REAL_ADMIN_EMAIL})
    if not real_admin:
        print_result(False, "Real admin user not found in DB", None)
        return False
    
    test_data["real_admin_user_id"] = real_admin["id"]
    
    # Create session for real admin
    session_token = str(uuid.uuid4())
    db.sessions.insert_one({
        "token": session_token,
        "userId": real_admin["id"],
        "createdAt": datetime.utcnow(),
        "expiresAt": datetime.utcnow() + timedelta(days=30)
    })
    test_data["real_admin_token"] = session_token
    test_data["test_cleanup"].append(("session", session_token))
    
    # Get district ID
    s, districts, _ = make_request("GET", "/districts", token=test_data["real_admin_token"])
    if not s or not districts:
        print_result(False, "Failed to get districts", None)
        return False
    
    # Create branch with BM email
    branch_data = {
        "districtId": districts[0]["id"],
        "name": "AutoBranch Test",
        "code": f"ABT{int(time.time())}",
        "address": "Test Address",
        "branchManagerEmail": f"newbm{int(time.time())}@test.com",
        "branchManagerName": "New BM Test"
    }
    
    success, data, status = make_request("POST", "/branches", 
                                         token=test_data["real_admin_token"],
                                         data=branch_data)
    
    if success and data.get("id"):
        branch_id = data["id"]
        test_data["test_cleanup"].append(("branch", branch_id))
        
        # Check if BM user was created
        bm_user = db.users.find_one({"email": branch_data["branchManagerEmail"]})
        if bm_user and bm_user.get("role") == "branch_manager" and bm_user.get("branchId") == branch_id:
            test_data["test_cleanup"].append(("user", bm_user["id"]))
            print_result(True, "Branch created and BM user auto-created", 
                        {"branch_id": branch_id, "bm_user_id": bm_user["id"], 
                         "bm_email": bm_user["email"]})
            return True
        else:
            print_result(False, "BM user not created or not linked correctly", bm_user)
            return False
    else:
        print_result(False, f"Failed to create branch (status {status})", data)
        return False

def test_branch_create_bm_demo_admin():
    """Test: Demo admin tries to auto-create BM - should 403"""
    print_test("4.2 Branch: Demo admin auto-creates BM (should 403)")
    
    # Get district ID
    s, districts, _ = make_request("GET", "/districts", token=test_data["demo_admin_token"])
    if not s or not districts:
        print_result(False, "Failed to get districts", None)
        return False
    
    # Try to create branch with BM email
    branch_data = {
        "districtId": districts[0]["id"],
        "name": "Demo AutoBranch",
        "code": f"DAB{int(time.time())}",
        "address": "Demo Address",
        "branchManagerEmail": f"demobm{int(time.time())}@test.com",
        "branchManagerName": "Demo BM"
    }
    
    success, data, status = make_request("POST", "/branches", 
                                         token=test_data["demo_admin_token"],
                                         data=branch_data)
    
    if not success and status == 403 and "demo" in data.get("error", "").lower():
        print_result(True, "Correctly rejected demo admin auto-create BM (403)", data)
        return True
    else:
        print_result(False, f"Should return 403 for demo admin (got {status})", data)
        return False

# ============================================================================
# 5. SETTINGS TOGGLE TESTS
# ============================================================================

def test_settings_get_demo_admin():
    """Test: Demo admin GET /settings - should 200"""
    print_test("5.1 Settings: Demo admin GET /settings (should 200)")
    success, data, status = make_request("GET", "/settings", 
                                         token=test_data["demo_admin_token"])
    
    if success and "demoLoginEnabled" in data:
        print_result(True, "Demo admin can view settings", data)
        return True
    else:
        print_result(False, f"Failed to get settings (status {status})", data)
        return False

def test_settings_toggle_demo_admin():
    """Test: Demo admin POST /settings/demo-login - should 403"""
    print_test("5.2 Settings: Demo admin toggle demo login (should 403)")
    success, data, status = make_request("POST", "/settings/demo-login", 
                                         token=test_data["demo_admin_token"],
                                         data={"enabled": False})
    
    if not success and status == 403 and REAL_ADMIN_EMAIL in data.get("error", ""):
        print_result(True, "Correctly rejected demo admin toggle (403)", data)
        return True
    else:
        print_result(False, f"Should return 403 mentioning real admin email (got {status})", data)
        return False

def test_settings_toggle_real_admin_disable():
    """Test: Real admin POST /settings/demo-login {enabled:false} - should 200"""
    print_test("5.3 Settings: Real admin disables demo login (should 200)")
    success, data, status = make_request("POST", "/settings/demo-login", 
                                         token=test_data["real_admin_token"],
                                         data={"enabled": False})
    
    if success and data.get("success") and data.get("value") == False:
        print_result(True, "Real admin successfully disabled demo login", data)
        return True
    else:
        print_result(False, f"Failed to disable demo login (status {status})", data)
        return False

def test_settings_demo_otp_disabled():
    """Test: After disable, /auth/send-otp for demo mobile - should 403"""
    print_test("5.4 Settings: Demo OTP after disable (should 403)")
    success, data, status = make_request("POST", "/auth/send-otp", 
                                         data={"mobile": DEMO_ADMIN_MOBILE})
    
    if not success and status == 403 and "disabled" in data.get("error", "").lower():
        print_result(True, "Correctly rejected demo OTP when disabled (403)", data)
        return True
    else:
        print_result(False, f"Should return 403 with disabled message (got {status})", data)
        return False

def test_settings_toggle_real_admin_enable():
    """Test: Real admin POST /settings/demo-login {enabled:true} - should 200"""
    print_test("5.5 Settings: Real admin enables demo login (should 200)")
    success, data, status = make_request("POST", "/settings/demo-login", 
                                         token=test_data["real_admin_token"],
                                         data={"enabled": True})
    
    if success and data.get("success") and data.get("value") == True:
        print_result(True, "Real admin successfully enabled demo login", data)
        return True
    else:
        print_result(False, f"Failed to enable demo login (status {status})", data)
        return False

def test_settings_demo_otp_enabled():
    """Test: After enable, /auth/send-otp for demo mobile - should 200"""
    print_test("5.6 Settings: Demo OTP after enable (should 200)")
    success, data, status = make_request("POST", "/auth/send-otp", 
                                         data={"mobile": DEMO_ADMIN_MOBILE})
    
    if success and data.get("success"):
        print_result(True, "Demo OTP works again after enable", data)
        return True
    else:
        print_result(False, f"Demo OTP should work (status {status})", data)
        return False

# ============================================================================
# 6. MESSAGES TESTS
# ============================================================================

def test_messages_ro_post():
    """Test: RO POST /messages - should 200 with roId inferred"""
    print_test("6.1 Messages: RO POST /messages (should 200)")
    success, data, status = make_request("POST", "/messages", 
                                         token=test_data["demo_ro_token"],
                                         data={"text": "Hello from RO"})
    
    if success and data.get("id") and data.get("roId") == test_data["demo_ro_id"]:
        test_data["test_message_id"] = data["id"]
        test_data["test_cleanup"].append(("message", data["id"]))
        print_result(True, "RO successfully posted message", 
                    {"id": data["id"], "roId": data["roId"]})
        return True
    else:
        print_result(False, f"RO failed to post message (status {status})", data)
        return False

def test_messages_admin_get():
    """Test: Admin GET /messages?roId=X - should 200 with array"""
    print_test("6.2 Messages: Admin GET /messages (should 200)")
    success, data, status = make_request("GET", "/messages", 
                                         token=test_data["demo_admin_token"],
                                         params={"roId": test_data["demo_ro_id"]})
    
    if success and isinstance(data, list):
        print_result(True, f"Admin retrieved messages ({len(data)} messages)", 
                    {"count": len(data)})
        return True
    else:
        print_result(False, f"Failed to get messages (status {status})", data)
        return False

def test_messages_pm_get():
    """Test: PM GET /messages?roId=X - should 200 with array"""
    print_test("6.3 Messages: PM GET /messages (should 200)")
    success, data, status = make_request("GET", "/messages", 
                                         token=test_data["demo_pm_token"],
                                         params={"roId": test_data["demo_ro_id"]})
    
    if success and isinstance(data, list):
        print_result(True, f"PM retrieved messages ({len(data)} messages)", 
                    {"count": len(data)})
        return True
    else:
        print_result(False, f"Failed to get messages (status {status})", data)
        return False

def test_messages_bm_post():
    """Test: BM POST /messages - should 403"""
    print_test("6.4 Messages: BM POST /messages (should 403)")
    success, data, status = make_request("POST", "/messages", 
                                         token=test_data["demo_bm_token"],
                                         data={"text": "Should fail"})
    
    if not success and status == 403:
        print_result(True, "Correctly rejected BM posting message (403)", data)
        return True
    else:
        print_result(False, f"Should return 403 for BM (got {status})", data)
        return False

# ============================================================================
# 7. EXPENSES & ATTENDANCE TESTS
# ============================================================================

def test_expenses_team_post():
    """Test: Team POST /expenses - should 200 with total computed"""
    print_test("7.1 Expenses: Team POST /expenses (should 200)")
    
    # Login as team
    make_request("POST", "/auth/send-otp", data={"mobile": DEMO_TEAM_MOBILE})
    s, d, _ = make_request("POST", "/auth/verify-otp", 
                          data={"mobile": DEMO_TEAM_MOBILE, "otp": DEMO_OTP})
    if s:
        test_data["demo_team_token"] = d["token"]
    
    expense_data = {
        "date": "2026-01-10",
        "teamId": test_data["team_alpha_id"],
        "taxi": 100,
        "food": 50,
        "refreshments": 0,
        "stationary": 0,
        "other": 0
    }
    
    success, data, status = make_request("POST", "/expenses", 
                                         token=test_data["demo_team_token"],
                                         data=expense_data)
    
    if success and data.get("id") and data.get("total") == 150:
        test_data["test_expense_id"] = data["id"]
        test_data["test_cleanup"].append(("expense", data["id"]))
        print_result(True, "Team successfully posted expense with correct total", 
                    {"id": data["id"], "total": data["total"]})
        return True
    else:
        print_result(False, f"Failed to post expense (status {status})", data)
        return False

def test_expenses_team_get():
    """Test: Team GET /expenses - should only see own team"""
    print_test("7.2 Expenses: Team GET /expenses (only own team)")
    success, data, status = make_request("GET", "/expenses", 
                                         token=test_data["demo_team_token"])
    
    if success and isinstance(data, list):
        # Check if all expenses belong to team's team
        all_own_team = all(e.get("teamId") == test_data["team_alpha_id"] for e in data)
        if all_own_team:
            print_result(True, f"Team sees only own expenses ({len(data)} expenses)", 
                        {"count": len(data)})
            return True
        else:
            print_result(False, "Team sees expenses from other teams", data)
            return False
    else:
        print_result(False, f"Failed to get expenses (status {status})", data)
        return False

def test_expenses_admin_authenticate():
    """Test: Admin POST /expenses/:id/authenticate - should 200"""
    print_test("7.3 Expenses: Admin authenticates expense (should 200)")
    
    expense_id = test_data.get("test_expense_id")
    if not expense_id:
        print_result(False, "No expense ID available", None)
        return False
    
    success, data, status = make_request("POST", f"/expenses/{expense_id}/authenticate", 
                                         token=test_data["demo_admin_token"])
    
    if success and data.get("success"):
        # Verify authenticatedBy is set
        s2, exp, _ = make_request("GET", "/expenses", token=test_data["demo_admin_token"])
        if s2:
            authenticated_exp = next((e for e in exp if e["id"] == expense_id), None)
            if authenticated_exp and authenticated_exp.get("authenticatedBy"):
                print_result(True, "Admin successfully authenticated expense", 
                            {"authenticatedBy": authenticated_exp["authenticatedBy"]})
                return True
            else:
                print_result(False, "Expense not authenticated", authenticated_exp)
                return False
        else:
            print_result(False, "Failed to verify authentication", None)
            return False
    else:
        print_result(False, f"Failed to authenticate expense (status {status})", data)
        return False

def test_attendance_team_post():
    """Test: Team POST /attendance - should 200"""
    print_test("7.4 Attendance: Team POST /attendance (should 200)")
    
    # Get team members
    s, teams, _ = make_request("GET", "/teams", token=test_data["demo_team_token"])
    if not s or not teams:
        print_result(False, "Failed to get teams", None)
        return False
    
    team = next((t for t in teams if t["id"] == test_data["team_alpha_id"]), None)
    if not team or not team.get("members"):
        print_result(False, "Team or members not found", None)
        return False
    
    attendance_data = {
        "date": "2026-01-10",
        "teamId": test_data["team_alpha_id"],
        "records": [
            {"memberId": team["members"][0]["id"], "status": "present"}
        ]
    }
    
    success, data, status = make_request("POST", "/attendance", 
                                         token=test_data["demo_team_token"],
                                         data=attendance_data)
    
    if success and data.get("id"):
        test_data["test_attendance_date"] = "2026-01-10"
        print_result(True, "Team successfully posted attendance", 
                    {"id": data["id"], "records": len(data.get("records", []))})
        return True
    else:
        print_result(False, f"Failed to post attendance (status {status})", data)
        return False

def test_attendance_upsert():
    """Test: Team POST /attendance same date+team - should upsert (single row)"""
    print_test("7.5 Attendance: Upsert same date+team (should have single row)")
    
    # Get team members
    s, teams, _ = make_request("GET", "/teams", token=test_data["demo_team_token"])
    team = next((t for t in teams if t["id"] == test_data["team_alpha_id"]), None)
    
    # Post again with different records
    attendance_data = {
        "date": "2026-01-10",
        "teamId": test_data["team_alpha_id"],
        "records": [
            {"memberId": team["members"][0]["id"], "status": "absent"}
        ]
    }
    
    success, data, status = make_request("POST", "/attendance", 
                                         token=test_data["demo_team_token"],
                                         data=attendance_data)
    
    if success:
        # Check DB - should have only ONE row for this date+team
        db = get_db()
        count = db.attendance.count_documents({
            "teamId": test_data["team_alpha_id"],
            "dateStr": "2026-01-10"
        })
        if count == 1:
            print_result(True, "Attendance upserted correctly (single row)", 
                        {"count": count})
            return True
        else:
            print_result(False, f"Should have 1 row, found {count}", None)
            return False
    else:
        print_result(False, f"Failed to post attendance (status {status})", data)
        return False

# ============================================================================
# 8. REGRESSION TESTS
# ============================================================================

def test_regression_demo_otp():
    """Test: Demo OTP still works when enabled"""
    print_test("8.1 Regression: Demo OTP works")
    make_request("POST", "/auth/send-otp", data={"mobile": DEMO_ADMIN_MOBILE})
    success, data, status = make_request("POST", "/auth/verify-otp", 
                                         data={"mobile": DEMO_ADMIN_MOBILE, "otp": DEMO_OTP})
    
    if success and data.get("token"):
        print_result(True, "Demo OTP still works", {"user": data["user"].get("name")})
        return True
    else:
        print_result(False, f"Demo OTP failed (status {status})", data)
        return False

def test_regression_master_data_privacy():
    """Test: Master data fee/salary privacy still works"""
    print_test("8.2 Regression: Master data privacy")
    
    # RO fee - Admin sees, PM doesn't
    s1, ro_admin, _ = make_request("GET", "/regional_offices", token=test_data["demo_admin_token"])
    s2, ro_pm, _ = make_request("GET", "/regional_offices", token=test_data["demo_pm_token"])
    
    has_fee_admin = "feePerProgram" in ro_admin[0] if ro_admin else False
    has_fee_pm = "feePerProgram" in ro_pm[0] if ro_pm else False
    
    # Team salary - Admin sees, PM doesn't
    s3, team_admin, _ = make_request("GET", "/teams", token=test_data["demo_admin_token"])
    s4, team_pm, _ = make_request("GET", "/teams", token=test_data["demo_pm_token"])
    
    has_salary_admin = "dailySalary" in team_admin[0]["members"][0] if team_admin and team_admin[0].get("members") else False
    has_salary_pm = "dailySalary" in team_pm[0]["members"][0] if team_pm and team_pm[0].get("members") else False
    
    if has_fee_admin and not has_fee_pm and has_salary_admin and not has_salary_pm:
        print_result(True, "Master data privacy working correctly", 
                    {"fee_admin": has_fee_admin, "fee_pm": has_fee_pm, 
                     "salary_admin": has_salary_admin, "salary_pm": has_salary_pm})
        return True
    else:
        print_result(False, "Master data privacy not working", 
                    {"fee_admin": has_fee_admin, "fee_pm": has_fee_pm, 
                     "salary_admin": has_salary_admin, "salary_pm": has_salary_pm})
        return False

def test_regression_program_lifecycle():
    """Test: Full program lifecycle with teamId"""
    print_test("8.3 Regression: Full program lifecycle")
    
    # Create
    s, branches, _ = make_request("GET", "/branches", token=test_data["demo_pm_token"])
    s2, villages, _ = make_request("GET", "/villages", token=test_data["demo_pm_token"])
    
    program_data = {
        "branchId": branches[0]["id"],
        "villageId": villages[0]["id"],
        "teamId": test_data["team_alpha_id"],
        "proposedDate": "2026-01-15",
        "remarks": "Regression test"
    }
    
    s3, prog, _ = make_request("POST", "/programs", 
                              token=test_data["demo_pm_token"],
                              data=program_data)
    
    if not s3:
        print_result(False, "Failed to create program", prog)
        return False
    
    prog_id = prog["id"]
    test_data["test_cleanup"].append(("program", prog_id))
    
    # Confirm
    s4, prog2, _ = make_request("POST", f"/programs/{prog_id}/confirm", 
                               token=test_data["demo_bm_token"])
    
    # Upload
    upload_data = {
        "photos": [
            {"data": "data:image/jpeg;base64,/9j/aa1"},
            {"data": "data:image/jpeg;base64,/9j/aa2"},
            {"data": "data:image/jpeg;base64,/9j/aa3"},
            {"data": "data:image/jpeg;base64,/9j/aa4"}
        ],
        "participants": 80
    }
    
    s5, prog3, _ = make_request("POST", f"/programs/{prog_id}/upload-data", 
                               token=test_data["demo_team_token"],
                               data=upload_data)
    
    # Authenticate
    s6, prog4, _ = make_request("POST", f"/programs/{prog_id}/authenticate", 
                               token=test_data["demo_admin_token"])
    
    if s6 and prog4.get("status") == "authenticated":
        print_result(True, "Full program lifecycle works", 
                    {"status": prog4["status"]})
        return True
    else:
        print_result(False, "Program lifecycle failed", prog4)
        return False

def test_regression_invoice_crud():
    """Test: Invoice CRUD + payment"""
    print_test("8.4 Regression: Invoice CRUD + payment")
    
    # Get authenticated program
    s, programs, _ = make_request("GET", "/programs?status=authenticated", 
                                 token=test_data["demo_admin_token"])
    
    if not s or not programs:
        print_result(False, "No authenticated programs", None)
        return False
    
    prog = programs[0]
    
    # Get RO
    s2, ros, _ = make_request("GET", "/regional_offices", token=test_data["demo_admin_token"])
    ro = ros[0] if ros else None
    
    if not ro:
        print_result(False, "No RO found", None)
        return False
    
    # Create invoice
    invoice_data = {
        "roId": ro["id"],
        "programIds": [prog["id"]],
        "invoiceNumber": f"TEST-{int(time.time())}",
        "invoiceDate": "2026-01-15"
    }
    
    s3, inv, _ = make_request("POST", "/invoices", 
                             token=test_data["demo_admin_token"],
                             data=invoice_data)
    
    if not s3:
        print_result(False, "Failed to create invoice", inv)
        return False
    
    test_data["test_cleanup"].append(("invoice", inv["id"]))
    
    # Add payment
    payment_data = {
        "amount": 1000,
        "date": "2026-01-16",
        "mode": "NEFT",
        "ref": "TEST"
    }
    
    s4, pay, _ = make_request("POST", f"/invoices/{inv['id']}/payment", 
                             token=test_data["demo_admin_token"],
                             data=payment_data)
    
    if s4:
        print_result(True, "Invoice CRUD + payment works", 
                    {"invoice_id": inv["id"]})
        return True
    else:
        print_result(False, "Payment failed", pay)
        return False

def test_regression_invoice_pm_forbidden():
    """Test: PM 403 on GET /invoices"""
    print_test("8.5 Regression: PM 403 on GET /invoices")
    success, data, status = make_request("GET", "/invoices", 
                                         token=test_data["demo_pm_token"])
    
    if not success and status == 403:
        print_result(True, "PM correctly forbidden from invoices", data)
        return True
    else:
        print_result(False, f"Should return 403 for PM (got {status})", data)
        return False

def test_regression_user_management():
    """Test: User management demo restrictions"""
    print_test("8.6 Regression: User management demo restrictions")
    
    # Demo admin tries to create user
    user_data = {
        "name": "Test User",
        "mobile": f"9{int(time.time())}",
        "role": "team"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["demo_admin_token"],
                                         data=user_data)
    
    if not success and status == 403 and "demo" in data.get("error", "").lower():
        print_result(True, "Demo admin correctly restricted from user management", data)
        return True
    else:
        print_result(False, f"Should return 403 for demo admin (got {status})", data)
        return False

def test_regression_firebase_verify():
    """Test: Firebase-verify endpoint rejects invalid tokens"""
    print_test("8.7 Regression: Firebase-verify rejects invalid tokens")
    success, data, status = make_request("POST", "/auth/firebase-verify", 
                                         data={"idToken": "invalid"})
    
    if not success and status == 401:
        print_result(True, "Firebase-verify correctly rejects invalid token", data)
        return True
    else:
        print_result(False, f"Should return 401 for invalid token (got {status})", data)
        return False

# ============================================================================
# CLEANUP
# ============================================================================

def cleanup_test_data():
    """Cleanup test data from DB"""
    print_test("CLEANUP: Removing test data")
    
    db = get_db()
    cleanup_count = 0
    
    for item_type, item_id in test_data.get("test_cleanup", []):
        try:
            if item_type == "program":
                db.programs.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "branch":
                db.branches.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "user":
                db.users.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "session":
                db.sessions.delete_one({"token": item_id})
                cleanup_count += 1
            elif item_type == "message":
                db.messages.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "expense":
                db.expenses.delete_one({"id": item_id})
                cleanup_count += 1
            elif item_type == "invoice":
                db.invoices.delete_one({"id": item_id})
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
    print("FINLIT360 v3 BACKEND API COMPREHENSIVE TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80 + "\n")
    
    results = []
    
    # 1. Magic Link Auth
    print("\n" + "="*80)
    print("SECTION 1: MAGIC LINK AUTH")
    print("="*80)
    results.append(("1.1 Magic Link - Unknown email (404)", test_magic_link_unknown_email()))
    results.append(("1.2 Magic Link - Invalid email (400)", test_magic_link_invalid_email()))
    results.append(("1.3 Magic Link - Valid email (200 + DB)", test_magic_link_valid_email()))
    results.append(("1.4 Magic Link Callback - Valid token", test_magic_link_callback_valid()))
    results.append(("1.5 Magic Link Callback - Reuse (error=link_used)", test_magic_link_callback_reuse()))
    results.append(("1.6 Magic Link Callback - Invalid (error=invalid_link)", test_magic_link_callback_invalid()))
    
    # 2. Program creation requires team
    print("\n" + "="*80)
    print("SECTION 2: PROGRAM CREATION REQUIRES TEAM")
    print("="*80)
    results.append(("2.1 Program - Create without teamId (400)", test_program_create_without_team()))
    results.append(("2.2 Program - Create with teamId (200)", test_program_create_with_team()))
    
    # 3. Confirmation matrix
    print("\n" + "="*80)
    print("SECTION 3: CONFIRMATION MATRIX")
    print("="*80)
    results.append(("3.1 Confirm - BM own branch (200)", test_confirm_bm_own_branch()))
    results.append(("3.2 Confirm - BM other branch (403)", test_confirm_bm_other_branch()))
    results.append(("3.3 Confirm - Admin any (200)", test_confirm_admin_any()))
    results.append(("3.4 Confirm - RO own (200)", test_confirm_ro_own()))
    results.append(("3.5 Confirm - PM < 30 min (403)", test_confirm_pm_under_30min()))
    results.append(("3.6 Confirm - PM > 30 min no reason (400)", test_confirm_pm_over_30min_no_reason()))
    results.append(("3.7 Confirm - PM > 30 min with reason (200)", test_confirm_pm_over_30min_with_reason()))
    
    # 4. Branch auto-create BM
    print("\n" + "="*80)
    print("SECTION 4: BRANCH AUTO-CREATE BM")
    print("="*80)
    results.append(("4.1 Branch - Real admin auto-creates BM (200)", test_branch_create_bm_real_admin()))
    results.append(("4.2 Branch - Demo admin auto-creates BM (403)", test_branch_create_bm_demo_admin()))
    
    # 5. Settings toggle
    print("\n" + "="*80)
    print("SECTION 5: SETTINGS TOGGLE")
    print("="*80)
    results.append(("5.1 Settings - Demo admin GET (200)", test_settings_get_demo_admin()))
    results.append(("5.2 Settings - Demo admin toggle (403)", test_settings_toggle_demo_admin()))
    results.append(("5.3 Settings - Real admin disable (200)", test_settings_toggle_real_admin_disable()))
    results.append(("5.4 Settings - Demo OTP disabled (403)", test_settings_demo_otp_disabled()))
    results.append(("5.5 Settings - Real admin enable (200)", test_settings_toggle_real_admin_enable()))
    results.append(("5.6 Settings - Demo OTP enabled (200)", test_settings_demo_otp_enabled()))
    
    # 6. Messages
    print("\n" + "="*80)
    print("SECTION 6: MESSAGES")
    print("="*80)
    results.append(("6.1 Messages - RO POST (200)", test_messages_ro_post()))
    results.append(("6.2 Messages - Admin GET (200)", test_messages_admin_get()))
    results.append(("6.3 Messages - PM GET (200)", test_messages_pm_get()))
    results.append(("6.4 Messages - BM POST (403)", test_messages_bm_post()))
    
    # 7. Expenses & Attendance
    print("\n" + "="*80)
    print("SECTION 7: EXPENSES & ATTENDANCE")
    print("="*80)
    results.append(("7.1 Expenses - Team POST (200)", test_expenses_team_post()))
    results.append(("7.2 Expenses - Team GET (own team)", test_expenses_team_get()))
    results.append(("7.3 Expenses - Admin authenticate (200)", test_expenses_admin_authenticate()))
    results.append(("7.4 Attendance - Team POST (200)", test_attendance_team_post()))
    results.append(("7.5 Attendance - Upsert (single row)", test_attendance_upsert()))
    
    # 8. Regression
    print("\n" + "="*80)
    print("SECTION 8: REGRESSION TESTS")
    print("="*80)
    results.append(("8.1 Regression - Demo OTP", test_regression_demo_otp()))
    results.append(("8.2 Regression - Master data privacy", test_regression_master_data_privacy()))
    results.append(("8.3 Regression - Program lifecycle", test_regression_program_lifecycle()))
    results.append(("8.4 Regression - Invoice CRUD", test_regression_invoice_crud()))
    results.append(("8.5 Regression - PM 403 invoices", test_regression_invoice_pm_forbidden()))
    results.append(("8.6 Regression - User management demo", test_regression_user_management()))
    results.append(("8.7 Regression - Firebase verify", test_regression_firebase_verify()))
    
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
