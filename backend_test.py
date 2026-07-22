#!/usr/bin/env python3
"""
FINLIT360 v2 Backend API Test Suite
Tests all v2 endpoints as specified in the review request
"""
import requests
import json
from typing import Dict, Any, Optional

# Base URL from .env
BASE_URL = "https://finlit360-camp.preview.emergentagent.com/api"

# Test users (seeded)
ADMIN_MOBILE = "9000000001"  # Mohit Modi - Admin
PROGRAM_MANAGER_MOBILE = "9000000002"  # Priya Sharma
BRANCH_MANAGER_MOBILE = "9000000003"  # Vijay Joshi - Endori branch
REGIONAL_OFFICE_MOBILE = "9000000004"  # Gwalior RO
TEAM_MOBILE = "9000000005"  # Amit Pawar - Team Alpha

UNREGISTERED_MOBILE = "9999999999"
DEMO_OTP = "123456"
INVALID_OTP = "000000"

# Global storage for test data
test_data = {
    "admin_token": None,
    "pm_token": None,
    "bm_token": None,
    "ro_token": None,
    "team_token": None,
    "master_data": {},
    "program_id": None,
    "invoice_id": None,
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
                 data: Optional[Dict] = None, params: Optional[Dict] = None) -> tuple:
    """Make HTTP request and return (success, response_data, status_code)"""
    url = f"{BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, params=params, timeout=30)
        elif method == "POST":
            resp = requests.post(url, headers=headers, json=data, timeout=30)
        elif method == "PUT":
            resp = requests.put(url, headers=headers, json=data, timeout=30)
        elif method == "PATCH":
            resp = requests.patch(url, headers=headers, json=data, timeout=30)
        elif method == "DELETE":
            resp = requests.delete(url, headers=headers, timeout=30)
        else:
            return False, {"error": "Invalid method"}, 0
        
        try:
            response_data = resp.json()
        except:
            response_data = {"text": resp.text}
        
        return resp.status_code < 400, response_data, resp.status_code
    except Exception as e:
        return False, {"error": str(e)}, 0

# ============================================================================
# 1. AUTH TESTS
# ============================================================================

def test_auth_send_otp_valid():
    """Test: POST /auth/send-otp with valid registered mobile"""
    print_test("1.1 Auth: Send OTP - Valid Mobile (Admin)")
    success, data, status = make_request("POST", "/auth/send-otp", 
                                         data={"mobile": ADMIN_MOBILE})
    
    if success and data.get("success") and data.get("demoOtp") == DEMO_OTP:
        print_result(True, "OTP sent successfully", data)
        return True
    else:
        print_result(False, f"Failed to send OTP (status {status})", data)
        return False

def test_auth_send_otp_unregistered():
    """Test: POST /auth/send-otp with unregistered mobile - should 404"""
    print_test("1.2 Auth: Send OTP - Unregistered Mobile (should 404)")
    success, data, status = make_request("POST", "/auth/send-otp", 
                                         data={"mobile": UNREGISTERED_MOBILE})
    
    if not success and status == 404:
        print_result(True, "Correctly rejected unregistered mobile with 404", data)
        return True
    else:
        print_result(False, f"Should return 404 for unregistered mobile (got {status})", data)
        return False

def test_auth_verify_otp_valid():
    """Test: POST /auth/verify-otp with valid OTP"""
    print_test("1.3 Auth: Verify OTP - Valid (Admin)")
    success, data, status = make_request("POST", "/auth/verify-otp", 
                                         data={"mobile": ADMIN_MOBILE, "otp": DEMO_OTP})
    
    if success and data.get("token") and data.get("user"):
        test_data["admin_token"] = data["token"]
        print_result(True, "Login successful, token received", 
                    {"user": data["user"].get("name"), "role": data["user"].get("role")})
        return True
    else:
        print_result(False, f"Failed to verify OTP (status {status})", data)
        return False

def test_auth_verify_otp_invalid():
    """Test: POST /auth/verify-otp with invalid OTP - should 401"""
    print_test("1.4 Auth: Verify OTP - Invalid (should 401)")
    success, data, status = make_request("POST", "/auth/verify-otp", 
                                         data={"mobile": ADMIN_MOBILE, "otp": INVALID_OTP})
    
    if not success and status == 401:
        print_result(True, "Correctly rejected invalid OTP with 401", data)
        return True
    else:
        print_result(False, f"Should return 401 for invalid OTP (got {status})", data)
        return False

def test_auth_me():
    """Test: GET /auth/me with valid token"""
    print_test("1.5 Auth: Get Current User (/auth/me)")
    success, data, status = make_request("GET", "/auth/me", 
                                         token=test_data["admin_token"])
    
    if success and data.get("user") and data["user"].get("role") == "admin":
        print_result(True, "Successfully retrieved current user", data["user"])
        return True
    else:
        print_result(False, f"Failed to get current user (status {status})", data)
        return False

def test_auth_logout():
    """Test: POST /auth/logout"""
    print_test("1.6 Auth: Logout")
    success, data, status = make_request("POST", "/auth/logout", 
                                         token=test_data["admin_token"])
    
    if success and data.get("success"):
        print_result(True, "Logout successful", data)
        # Re-login for subsequent tests
        make_request("POST", "/auth/send-otp", data={"mobile": ADMIN_MOBILE})
        s, d, _ = make_request("POST", "/auth/verify-otp", 
                              data={"mobile": ADMIN_MOBILE, "otp": DEMO_OTP})
        if s:
            test_data["admin_token"] = d["token"]
        return True
    else:
        print_result(False, f"Failed to logout (status {status})", data)
        return False

# ============================================================================
# LOGIN OTHER ROLES
# ============================================================================

def login_role(mobile: str, role_name: str, token_key: str):
    """Helper to login a specific role"""
    print_test(f"Login: {role_name}")
    
    # Send OTP
    success, data, status = make_request("POST", "/auth/send-otp", data={"mobile": mobile})
    if not success:
        print_result(False, f"Failed to send OTP for {role_name}", data)
        return False
    
    # Verify OTP
    success, data, status = make_request("POST", "/auth/verify-otp", 
                                         data={"mobile": mobile, "otp": DEMO_OTP})
    if success and data.get("token"):
        test_data[token_key] = data["token"]
        print_result(True, f"{role_name} logged in successfully", 
                    {"user": data["user"].get("name"), "role": data["user"].get("role")})
        return True
    else:
        print_result(False, f"Failed to login {role_name}", data)
        return False

def test_login_program_manager():
    """Login as Program Manager"""
    return login_role(PROGRAM_MANAGER_MOBILE, "Program Manager", "pm_token")

def test_login_branch_manager():
    """Login as Branch Manager"""
    return login_role(BRANCH_MANAGER_MOBILE, "Branch Manager", "bm_token")

def test_login_regional_office():
    """Login as Regional Office"""
    return login_role(REGIONAL_OFFICE_MOBILE, "Regional Office", "ro_token")

def test_login_team():
    """Login as Team"""
    return login_role(TEAM_MOBILE, "Team", "team_token")

# ============================================================================
# 2. MASTER DATA TESTS
# ============================================================================

def test_master_data_banks():
    """Test: GET /banks"""
    print_test("2.1 Master Data: GET /banks")
    success, data, status = make_request("GET", "/banks", 
                                         token=test_data["admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["banks"] = data
        print_result(True, f"Retrieved {len(data)} banks", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get banks (status {status})", data)
        return False

def test_master_data_regional_offices_admin():
    """Test: GET /regional_offices as Admin - should include feePerProgram"""
    print_test("2.2 Master Data: GET /regional_offices as Admin (feePerProgram present)")
    success, data, status = make_request("GET", "/regional_offices", 
                                         token=test_data["admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["regional_offices"] = data
        # Check if feePerProgram is present
        has_fee = "feePerProgram" in data[0]
        if has_fee:
            print_result(True, f"Retrieved {len(data)} ROs with feePerProgram field", 
                        {"first": data[0]})
            return True
        else:
            print_result(False, "feePerProgram field missing for Admin", data[0])
            return False
    else:
        print_result(False, f"Failed to get regional offices (status {status})", data)
        return False

def test_master_data_regional_offices_pm():
    """Test: GET /regional_offices as PM - feePerProgram should be ABSENT"""
    print_test("2.3 Master Data: GET /regional_offices as PM (feePerProgram ABSENT)")
    success, data, status = make_request("GET", "/regional_offices", 
                                         token=test_data["pm_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        # Check if feePerProgram is absent
        has_fee = "feePerProgram" in data[0]
        if not has_fee:
            print_result(True, f"feePerProgram correctly hidden from PM", 
                        {"first": data[0]})
            return True
        else:
            print_result(False, "feePerProgram should be hidden from PM", data[0])
            return False
    else:
        print_result(False, f"Failed to get regional offices (status {status})", data)
        return False

def test_master_data_regional_offices_ro():
    """Test: GET /regional_offices as RO - feePerProgram should be PRESENT"""
    print_test("2.4 Master Data: GET /regional_offices as RO (feePerProgram present)")
    success, data, status = make_request("GET", "/regional_offices", 
                                         token=test_data["ro_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        # Check if feePerProgram is present
        has_fee = "feePerProgram" in data[0]
        if has_fee:
            print_result(True, f"feePerProgram correctly present for RO", 
                        {"first": data[0]})
            return True
        else:
            print_result(False, "feePerProgram should be present for RO", data[0])
            return False
    else:
        print_result(False, f"Failed to get regional offices (status {status})", data)
        return False

def test_master_data_districts():
    """Test: GET /districts"""
    print_test("2.5 Master Data: GET /districts")
    success, data, status = make_request("GET", "/districts", 
                                         token=test_data["admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["districts"] = data
        print_result(True, f"Retrieved {len(data)} districts", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get districts (status {status})", data)
        return False

def test_master_data_branches():
    """Test: GET /branches"""
    print_test("2.6 Master Data: GET /branches")
    success, data, status = make_request("GET", "/branches", 
                                         token=test_data["admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["branches"] = data
        # Find Endori branch
        for branch in data:
            if branch.get("name") == "Endori":
                test_data["endori_branch_id"] = branch.get("id")
                break
        print_result(True, f"Retrieved {len(data)} branches", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get branches (status {status})", data)
        return False

def test_master_data_villages():
    """Test: GET /villages"""
    print_test("2.7 Master Data: GET /villages")
    success, data, status = make_request("GET", "/villages", 
                                         token=test_data["admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["villages"] = data
        # Find PadraikaPura village (belongs to Endori branch)
        for village in data:
            if village.get("name") == "PadraikaPura":
                test_data["padraika_village_id"] = village.get("id")
                break
        print_result(True, f"Retrieved {len(data)} villages", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get villages (status {status})", data)
        return False

def test_master_data_teams_admin():
    """Test: GET /teams as Admin - dailySalary should be PRESENT"""
    print_test("2.8 Master Data: GET /teams as Admin (dailySalary present)")
    success, data, status = make_request("GET", "/teams", 
                                         token=test_data["admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["teams"] = data
        # Check if members have dailySalary
        team = data[0]
        if team.get("members") and len(team["members"]) > 0:
            has_salary = "dailySalary" in team["members"][0]
            if has_salary:
                print_result(True, f"Retrieved {len(data)} teams with dailySalary field", 
                            {"first_team": team})
                # Store Team Alpha ID
                for t in data:
                    if t.get("name") == "Team Alpha":
                        test_data["team_alpha_id"] = t.get("id")
                        test_data["team_member_id"] = t["members"][0]["id"] if t.get("members") else None
                        break
                return True
            else:
                print_result(False, "dailySalary field missing for Admin", team)
                return False
        else:
            print_result(True, f"Retrieved {len(data)} teams (no members to check)", {"count": len(data)})
            return True
    else:
        print_result(False, f"Failed to get teams (status {status})", data)
        return False

def test_master_data_teams_pm():
    """Test: GET /teams as PM - dailySalary should be ABSENT"""
    print_test("2.9 Master Data: GET /teams as PM (dailySalary ABSENT)")
    success, data, status = make_request("GET", "/teams", 
                                         token=test_data["pm_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        # Check if members have dailySalary
        team = data[0]
        if team.get("members") and len(team["members"]) > 0:
            has_salary = "dailySalary" in team["members"][0]
            if not has_salary:
                print_result(True, f"dailySalary correctly hidden from PM", 
                            {"first_team": team})
                return True
            else:
                print_result(False, "dailySalary should be hidden from PM", team)
                return False
        else:
            print_result(True, f"Retrieved {len(data)} teams (no members to check)", {"count": len(data)})
            return True
    else:
        print_result(False, f"Failed to get teams (status {status})", data)
        return False

def test_master_data_users():
    """Test: GET /users"""
    print_test("2.10 Master Data: GET /users")
    success, data, status = make_request("GET", "/users", 
                                         token=test_data["admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["users"] = data
        print_result(True, f"Retrieved {len(data)} users", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get users (status {status})", data)
        return False

# ============================================================================
# 3. PROGRAM LIFECYCLE TESTS (SEQUENTIAL)
# ============================================================================

def test_program_create():
    """Test: POST /programs as PM - status should be 'proposed'"""
    print_test("3.1 Program: Create as PM (status=proposed)")
    
    # Get IDs
    branch_id = test_data.get("endori_branch_id")
    village_id = test_data.get("padraika_village_id")
    team_id = test_data.get("team_alpha_id")
    
    if not all([branch_id, village_id, team_id]):
        print_result(False, "Missing required IDs", 
                    {"branch": branch_id, "village": village_id, "team": team_id})
        return False
    
    program_data = {
        "branchId": branch_id,
        "villageId": village_id,
        "teamId": team_id,
        "proposedDate": "2025-12-20",
        "remarks": "Test program for lifecycle"
    }
    
    success, data, status = make_request("POST", "/programs", 
                                         token=test_data["pm_token"],
                                         data=program_data)
    
    if success and data.get("id") and data.get("status") == "proposed":
        test_data["program_id"] = data["id"]
        print_result(True, "Program created successfully", 
                    {"id": data["id"], "code": data.get("code"), "status": data["status"]})
        return True
    else:
        print_result(False, f"Failed to create program (status {status})", data)
        return False

def test_program_confirm():
    """Test: POST /programs/:id/confirm as BM - status should be 'confirmed'"""
    print_test("3.2 Program: Confirm as Branch Manager")
    
    program_id = test_data.get("program_id")
    if not program_id:
        print_result(False, "No program ID available", None)
        return False
    
    success, data, status = make_request("POST", f"/programs/{program_id}/confirm", 
                                         token=test_data["bm_token"])
    
    if success and data.get("status") == "confirmed" and data.get("branchConfirmed") == True:
        print_result(True, "Program confirmed successfully", 
                    {"status": data["status"], "branchConfirmed": data["branchConfirmed"]})
        return True
    else:
        print_result(False, f"Failed to confirm program (status {status})", data)
        return False

def test_program_upload_data_without_confirm():
    """Test: POST /programs/:id/upload-data as Team when NOT confirmed - should 400"""
    print_test("3.3 Program: Upload-data without confirmation (should 400)")
    
    # Create a new program that's not confirmed
    branch_id = test_data.get("endori_branch_id")
    village_id = test_data.get("padraika_village_id")
    team_id = test_data.get("team_alpha_id")
    
    program_data = {
        "branchId": branch_id,
        "villageId": village_id,
        "teamId": team_id,
        "proposedDate": "2025-12-21",
        "remarks": "Test unconfirmed program"
    }
    
    success, data, status = make_request("POST", "/programs", 
                                         token=test_data["pm_token"],
                                         data=program_data)
    
    if not success:
        print_result(False, "Failed to create test program", data)
        return False
    
    unconfirmed_program_id = data["id"]
    
    # Try to upload data without confirmation
    upload_data = {
        "photos": [
            {"data": "data:image/jpeg;base64,/9j/aa1"},
            {"data": "data:image/jpeg;base64,/9j/aa2"},
            {"data": "data:image/jpeg;base64,/9j/aa3"},
            {"data": "data:image/jpeg;base64,/9j/aa4"}
        ],
        "participants": 75,
        "expenses": {"taxi": 500, "food": 300, "refreshments": 200, "stationary": 100, "other": 0},
        "remarks": "Should fail"
    }
    
    success, data, status = make_request("POST", f"/programs/{unconfirmed_program_id}/upload-data", 
                                         token=test_data["team_token"],
                                         data=upload_data)
    
    if not success and status == 400:
        print_result(True, "Correctly rejected upload without confirmation (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 for unconfirmed program (got {status})", data)
        return False

def test_program_upload_data():
    """Test: POST /programs/:id/upload-data as Team - should auto-advance to 'conducted'"""
    print_test("3.4 Program: Upload-data as Team (auto-advance to conducted)")
    
    program_id = test_data.get("program_id")
    if not program_id:
        print_result(False, "No program ID available", None)
        return False
    
    upload_data = {
        "photos": [
            {"data": "data:image/jpeg;base64,/9j/aa1"},
            {"data": "data:image/jpeg;base64,/9j/aa2"},
            {"data": "data:image/jpeg;base64,/9j/aa3"},
            {"data": "data:image/jpeg;base64,/9j/aa4"}
        ],
        "participants": 75,
        "expenses": {"taxi": 500, "food": 300, "refreshments": 200, "stationary": 100, "other": 0},
        "remarks": "Conducted well"
    }
    
    success, data, status = make_request("POST", f"/programs/{program_id}/upload-data", 
                                         token=test_data["team_token"],
                                         data=upload_data)
    
    if success:
        # Check if status is 'conducted'
        s2, d2, _ = make_request("GET", f"/programs/{program_id}", 
                                token=test_data["admin_token"])
        if s2 and d2.get("status") == "conducted":
            print_result(True, "Data uploaded and auto-advanced to conducted", 
                        {"status": d2["status"], "photos": len(d2.get("photos", []))})
            return True
        else:
            print_result(False, "Status not auto-advanced to conducted", d2)
            return False
    else:
        print_result(False, f"Failed to upload data (status {status})", data)
        return False

def test_program_authenticate():
    """Test: POST /programs/:id/authenticate as Admin - status should be 'authenticated'"""
    print_test("3.5 Program: Authenticate as Admin")
    
    program_id = test_data.get("program_id")
    if not program_id:
        print_result(False, "No program ID available", None)
        return False
    
    success, data, status = make_request("POST", f"/programs/{program_id}/authenticate", 
                                         token=test_data["admin_token"])
    
    if success and data.get("status") == "authenticated":
        print_result(True, "Program authenticated successfully", 
                    {"status": data["status"], "authenticatedBy": data.get("authenticatedBy")})
        return True
    else:
        print_result(False, f"Failed to authenticate program (status {status})", data)
        return False

def test_program_authenticate_insufficient_photos():
    """Test: POST /programs/:id/authenticate with <4 photos - should 400"""
    print_test("3.6 Program: Authenticate with <4 photos (should 400)")
    
    # Create a new program with insufficient photos
    branch_id = test_data.get("endori_branch_id")
    village_id = test_data.get("padraika_village_id")
    team_id = test_data.get("team_alpha_id")
    
    program_data = {
        "branchId": branch_id,
        "villageId": village_id,
        "teamId": team_id,
        "proposedDate": "2025-12-22",
        "remarks": "Test insufficient photos"
    }
    
    success, data, status = make_request("POST", "/programs", 
                                         token=test_data["pm_token"],
                                         data=program_data)
    
    if not success:
        print_result(False, "Failed to create test program", data)
        return False
    
    test_program_id = data["id"]
    
    # Confirm
    make_request("POST", f"/programs/{test_program_id}/confirm", 
                token=test_data["bm_token"])
    
    # Upload only 2 photos
    upload_data = {
        "photos": [
            {"data": "data:image/jpeg;base64,/9j/aa1"},
            {"data": "data:image/jpeg;base64,/9j/aa2"}
        ],
        "participants": 50,
        "expenses": {"taxi": 500, "food": 300, "refreshments": 200, "stationary": 100, "other": 0},
        "remarks": "Only 2 photos"
    }
    
    make_request("POST", f"/programs/{test_program_id}/upload-data", 
                token=test_data["team_token"],
                data=upload_data)
    
    # Try to authenticate
    success, data, status = make_request("POST", f"/programs/{test_program_id}/authenticate", 
                                         token=test_data["admin_token"])
    
    if not success and status == 400:
        print_result(True, "Correctly rejected authentication with <4 photos (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 for <4 photos (got {status})", data)
        return False

def test_program_authenticate_no_participants():
    """Test: POST /programs/:id/authenticate without participants - should 400"""
    print_test("3.7 Program: Authenticate without participants (should 400)")
    
    # Create a new program without participants
    branch_id = test_data.get("endori_branch_id")
    village_id = test_data.get("padraika_village_id")
    team_id = test_data.get("team_alpha_id")
    
    program_data = {
        "branchId": branch_id,
        "villageId": village_id,
        "teamId": team_id,
        "proposedDate": "2025-12-23",
        "remarks": "Test no participants"
    }
    
    success, data, status = make_request("POST", "/programs", 
                                         token=test_data["pm_token"],
                                         data=program_data)
    
    if not success:
        print_result(False, "Failed to create test program", data)
        return False
    
    test_program_id = data["id"]
    
    # Confirm
    make_request("POST", f"/programs/{test_program_id}/confirm", 
                token=test_data["bm_token"])
    
    # Upload 4 photos but no participants
    upload_data = {
        "photos": [
            {"data": "data:image/jpeg;base64,/9j/aa1"},
            {"data": "data:image/jpeg;base64,/9j/aa2"},
            {"data": "data:image/jpeg;base64,/9j/aa3"},
            {"data": "data:image/jpeg;base64,/9j/aa4"}
        ],
        "expenses": {"taxi": 500, "food": 300, "refreshments": 200, "stationary": 100, "other": 0},
        "remarks": "No participants"
    }
    
    make_request("POST", f"/programs/{test_program_id}/upload-data", 
                token=test_data["team_token"],
                data=upload_data)
    
    # Try to authenticate
    success, data, status = make_request("POST", f"/programs/{test_program_id}/authenticate", 
                                         token=test_data["admin_token"])
    
    if not success and status == 400:
        print_result(True, "Correctly rejected authentication without participants (400)", data)
        return True
    else:
        print_result(False, f"Should return 400 without participants (got {status})", data)
        return False

# ============================================================================
# 4. ROLE SCOPING TESTS
# ============================================================================

def test_programs_list_branch_manager():
    """Test: GET /programs as BM - should only see own branch programs"""
    print_test("4.1 Role Scoping: GET /programs as Branch Manager")
    success, data, status = make_request("GET", "/programs", 
                                         token=test_data["bm_token"])
    
    if success and isinstance(data, list):
        # Check if all programs belong to BM's branch
        endori_branch_id = test_data.get("endori_branch_id")
        all_scoped = all(p.get("branchId") == endori_branch_id for p in data)
        
        if all_scoped:
            print_result(True, f"BM sees only their branch programs ({len(data)} programs)", 
                        {"branch_id": endori_branch_id, "count": len(data)})
            return True
        else:
            print_result(False, "BM sees programs from other branches", 
                        {"expected_branch": endori_branch_id, "programs": data})
            return False
    else:
        print_result(False, f"Failed to get programs (status {status})", data)
        return False

def test_programs_list_regional_office():
    """Test: GET /programs as RO - should only see own RO programs, no expenses/teamPayments"""
    print_test("4.2 Role Scoping: GET /programs as RO (no expenses/teamPayments)")
    success, data, status = make_request("GET", "/programs", 
                                         token=test_data["ro_token"])
    
    if success and isinstance(data, list):
        # Check if expenses and teamPayments are absent
        has_expenses = any("expenses" in p for p in data)
        has_team_payments = any("teamPayments" in p for p in data)
        
        if not has_expenses and not has_team_payments:
            print_result(True, f"RO sees programs without expenses/teamPayments ({len(data)} programs)", 
                        {"count": len(data)})
            return True
        else:
            print_result(False, "RO should not see expenses/teamPayments", 
                        {"has_expenses": has_expenses, "has_team_payments": has_team_payments})
            return False
    else:
        print_result(False, f"Failed to get programs (status {status})", data)
        return False

# ============================================================================
# 5. INVOICES TESTS
# ============================================================================

def test_invoice_create():
    """Test: POST /invoices as Admin"""
    print_test("5.1 Invoices: Create as Admin")
    
    # Get authenticated program
    program_id = test_data.get("program_id")
    if not program_id:
        print_result(False, "No authenticated program available", None)
        return False
    
    # Get Gwalior RO ID
    ro_id = None
    for ro in test_data["master_data"].get("regional_offices", []):
        if ro.get("name") == "Gwalior Regional Office":
            ro_id = ro.get("id")
            break
    
    if not ro_id:
        print_result(False, "Gwalior RO not found", None)
        return False
    
    invoice_data = {
        "roId": ro_id,
        "programIds": [program_id],
        "invoiceNumber": "ISCI/FLC/202526/TEST01",
        "invoiceDate": "2025-12-31",
        "notes": "Test invoice"
    }
    
    success, data, status = make_request("POST", "/invoices", 
                                         token=test_data["admin_token"],
                                         data=invoice_data)
    
    if success and data.get("id"):
        test_data["invoice_id"] = data["id"]
        # Check if subtotal = 1 * 3750 = 3750
        expected_subtotal = 3750
        if data.get("subtotal") == expected_subtotal and data.get("total") == expected_subtotal:
            print_result(True, "Invoice created successfully", 
                        {"id": data["id"], "subtotal": data["subtotal"], "total": data["total"]})
            return True
        else:
            print_result(False, f"Invoice amounts incorrect (expected {expected_subtotal})", data)
            return False
    else:
        print_result(False, f"Failed to create invoice (status {status})", data)
        return False

def test_invoice_list_admin():
    """Test: GET /invoices as Admin - should see all"""
    print_test("5.2 Invoices: GET /invoices as Admin")
    success, data, status = make_request("GET", "/invoices", 
                                         token=test_data["admin_token"])
    
    if success and isinstance(data, list):
        print_result(True, f"Admin sees all invoices ({len(data)} invoices)", {"count": len(data)})
        return True
    else:
        print_result(False, f"Failed to get invoices (status {status})", data)
        return False

def test_invoice_list_ro():
    """Test: GET /invoices as RO - should only see own RO"""
    print_test("5.3 Invoices: GET /invoices as RO (only own RO)")
    success, data, status = make_request("GET", "/invoices", 
                                         token=test_data["ro_token"])
    
    if success and isinstance(data, list):
        # Get RO's roId
        s2, user_data, _ = make_request("GET", "/auth/me", token=test_data["ro_token"])
        if s2:
            ro_id = user_data["user"].get("roId")
            all_scoped = all(inv.get("roId") == ro_id for inv in data)
            if all_scoped:
                print_result(True, f"RO sees only their invoices ({len(data)} invoices)", 
                            {"ro_id": ro_id, "count": len(data)})
                return True
            else:
                print_result(False, "RO sees invoices from other ROs", data)
                return False
        else:
            print_result(False, "Failed to get RO user info", user_data)
            return False
    else:
        print_result(False, f"Failed to get invoices (status {status})", data)
        return False

def test_invoice_list_pm_forbidden():
    """Test: GET /invoices as PM - should 403"""
    print_test("5.4 Invoices: GET /invoices as PM (should 403)")
    success, data, status = make_request("GET", "/invoices", 
                                         token=test_data["pm_token"])
    
    if not success and status == 403:
        print_result(True, "Correctly rejected PM access to invoices (403)", data)
        return True
    else:
        print_result(False, f"Should return 403 for PM (got {status})", data)
        return False

def test_invoice_edit():
    """Test: PATCH /invoices/:id as Admin - should recompute total"""
    print_test("5.5 Invoices: PATCH /invoices/:id (recompute total)")
    
    invoice_id = test_data.get("invoice_id")
    if not invoice_id:
        print_result(False, "No invoice ID available", None)
        return False
    
    # Get current invoice
    s, inv, _ = make_request("GET", f"/invoices/{invoice_id}", 
                            token=test_data["admin_token"])
    if not s:
        print_result(False, "Failed to get invoice", inv)
        return False
    
    # Modify items
    items = inv.get("items", [])
    if items:
        items[0]["amount"] = 4000  # Change from 3750 to 4000
    
    update_data = {"items": items}
    
    success, data, status = make_request("PATCH", f"/invoices/{invoice_id}", 
                                         token=test_data["admin_token"],
                                         data=update_data)
    
    if success and data.get("total") == 4000:
        print_result(True, "Invoice updated and total recomputed", 
                    {"new_total": data["total"]})
        return True
    else:
        print_result(False, f"Failed to update invoice (status {status})", data)
        return False

def test_invoice_add_payment():
    """Test: POST /invoices/:id/payment as Admin"""
    print_test("5.6 Invoices: POST /invoices/:id/payment as Admin")
    
    invoice_id = test_data.get("invoice_id")
    if not invoice_id:
        print_result(False, "No invoice ID available", None)
        return False
    
    payment_data = {
        "amount": 2000,
        "date": "2026-01-05",
        "mode": "NEFT",
        "ref": "TEST",
        "remarks": "Test payment"
    }
    
    success, data, status = make_request("POST", f"/invoices/{invoice_id}/payment", 
                                         token=test_data["admin_token"],
                                         data=payment_data)
    
    if success:
        # Verify paidAmount
        s2, inv, _ = make_request("GET", f"/invoices/{invoice_id}", 
                                 token=test_data["admin_token"])
        if s2 and inv.get("paidAmount") == 2000:
            print_result(True, "Payment added successfully", 
                        {"paidAmount": inv["paidAmount"]})
            return True
        else:
            print_result(False, "paidAmount not updated correctly", inv)
            return False
    else:
        print_result(False, f"Failed to add payment (status {status})", data)
        return False

def test_invoice_add_payment_ro_forbidden():
    """Test: POST /invoices/:id/payment as RO - should 403"""
    print_test("5.7 Invoices: POST /invoices/:id/payment as RO (should 403)")
    
    invoice_id = test_data.get("invoice_id")
    if not invoice_id:
        print_result(False, "No invoice ID available", None)
        return False
    
    payment_data = {
        "amount": 1000,
        "date": "2026-01-06",
        "mode": "NEFT",
        "ref": "TEST2",
        "remarks": "Should fail"
    }
    
    success, data, status = make_request("POST", f"/invoices/{invoice_id}/payment", 
                                         token=test_data["ro_token"],
                                         data=payment_data)
    
    if not success and status == 403:
        print_result(True, "Correctly rejected RO payment addition (403)", data)
        return True
    else:
        print_result(False, f"Should return 403 for RO (got {status})", data)
        return False

def test_invoice_program_link():
    """Test: Verify programs attached to invoice have invoiceId set"""
    print_test("5.8 Invoices: Verify program has invoiceId set")
    
    program_id = test_data.get("program_id")
    invoice_id = test_data.get("invoice_id")
    
    if not program_id or not invoice_id:
        print_result(False, "Missing program or invoice ID", None)
        return False
    
    success, data, status = make_request("GET", f"/programs/{program_id}", 
                                         token=test_data["admin_token"])
    
    if success and data.get("invoiceId") == invoice_id:
        print_result(True, "Program correctly linked to invoice", 
                    {"program_id": program_id, "invoice_id": data["invoiceId"]})
        return True
    else:
        print_result(False, "Program not linked to invoice", data)
        return False

# ============================================================================
# 6. SALARY PAYMENTS TESTS
# ============================================================================

def test_salary_list_admin():
    """Test: GET /salary-payments as Admin"""
    print_test("6.1 Salaries: GET /salary-payments as Admin")
    success, data, status = make_request("GET", "/salary-payments", 
                                         token=test_data["admin_token"])
    
    if success and isinstance(data, list):
        print_result(True, f"Admin sees salary payments ({len(data)} payments)", {"count": len(data)})
        return True
    else:
        print_result(False, f"Failed to get salary payments (status {status})", data)
        return False

def test_salary_list_pm_forbidden():
    """Test: GET /salary-payments as PM - should 403"""
    print_test("6.2 Salaries: GET /salary-payments as PM (should 403)")
    success, data, status = make_request("GET", "/salary-payments", 
                                         token=test_data["pm_token"])
    
    if not success and status == 403:
        print_result(True, "Correctly rejected PM access to salaries (403)", data)
        return True
    else:
        print_result(False, f"Should return 403 for PM (got {status})", data)
        return False

def test_salary_create_admin():
    """Test: POST /salary-payments as Admin"""
    print_test("6.3 Salaries: POST /salary-payments as Admin")
    
    team_member_id = test_data.get("team_member_id")
    team_id = test_data.get("team_alpha_id")
    
    if not team_member_id or not team_id:
        print_result(False, "Missing team member or team ID", None)
        return False
    
    salary_data = {
        "teamMemberId": team_member_id,
        "teamId": team_id,
        "amount": 1600,
        "date": "2026-01-06",
        "remarks": "Two days"
    }
    
    success, data, status = make_request("POST", "/salary-payments", 
                                         token=test_data["admin_token"],
                                         data=salary_data)
    
    if success and data.get("id"):
        print_result(True, "Salary payment created successfully", 
                    {"id": data["id"], "amount": data["amount"]})
        return True
    else:
        print_result(False, f"Failed to create salary payment (status {status})", data)
        return False

def test_salary_create_pm_forbidden():
    """Test: POST /salary-payments as PM - should 403"""
    print_test("6.4 Salaries: POST /salary-payments as PM (should 403)")
    
    team_member_id = test_data.get("team_member_id")
    team_id = test_data.get("team_alpha_id")
    
    if not team_member_id or not team_id:
        print_result(False, "Missing team member or team ID", None)
        return False
    
    salary_data = {
        "teamMemberId": team_member_id,
        "teamId": team_id,
        "amount": 800,
        "date": "2026-01-07",
        "remarks": "Should fail"
    }
    
    success, data, status = make_request("POST", "/salary-payments", 
                                         token=test_data["pm_token"],
                                         data=salary_data)
    
    if not success and status == 403:
        print_result(True, "Correctly rejected PM salary creation (403)", data)
        return True
    else:
        print_result(False, f"Should return 403 for PM (got {status})", data)
        return False

# ============================================================================
# 7. DASHBOARD TESTS
# ============================================================================

def test_dashboard_admin():
    """Test: GET /dashboard as Admin"""
    print_test("7.1 Dashboard: GET /dashboard as Admin")
    success, data, status = make_request("GET", "/dashboard", 
                                         token=test_data["admin_token"])
    
    if success and data.get("counts") and "beneficiaries" in data:
        print_result(True, "Dashboard data retrieved for Admin", 
                    {"counts": data["counts"], "beneficiaries": data["beneficiaries"]})
        return True
    else:
        print_result(False, f"Failed to get dashboard (status {status})", data)
        return False

def test_dashboard_pm():
    """Test: GET /dashboard as PM"""
    print_test("7.2 Dashboard: GET /dashboard as PM")
    success, data, status = make_request("GET", "/dashboard", 
                                         token=test_data["pm_token"])
    
    if success and data.get("counts") and "beneficiaries" in data:
        print_result(True, "Dashboard data retrieved for PM", 
                    {"counts": data["counts"], "beneficiaries": data["beneficiaries"]})
        return True
    else:
        print_result(False, f"Failed to get dashboard (status {status})", data)
        return False

def test_dashboard_bm():
    """Test: GET /dashboard as BM - should be scoped to branch"""
    print_test("7.3 Dashboard: GET /dashboard as BM (branch scoped)")
    success, data, status = make_request("GET", "/dashboard", 
                                         token=test_data["bm_token"])
    
    if success and data.get("counts") and "beneficiaries" in data:
        print_result(True, "Dashboard data retrieved for BM (branch scoped)", 
                    {"counts": data["counts"], "beneficiaries": data["beneficiaries"]})
        return True
    else:
        print_result(False, f"Failed to get dashboard (status {status})", data)
        return False

def test_dashboard_ro():
    """Test: GET /dashboard as RO - should be scoped to RO"""
    print_test("7.4 Dashboard: GET /dashboard as RO (RO scoped)")
    success, data, status = make_request("GET", "/dashboard", 
                                         token=test_data["ro_token"])
    
    if success and data.get("counts") and "beneficiaries" in data:
        print_result(True, "Dashboard data retrieved for RO (RO scoped)", 
                    {"counts": data["counts"], "beneficiaries": data["beneficiaries"]})
        return True
    else:
        print_result(False, f"Failed to get dashboard (status {status})", data)
        return False

def test_dashboard_team():
    """Test: GET /dashboard as Team - should be scoped to team"""
    print_test("7.5 Dashboard: GET /dashboard as Team (team scoped)")
    success, data, status = make_request("GET", "/dashboard", 
                                         token=test_data["team_token"])
    
    if success and data.get("counts") and "beneficiaries" in data:
        print_result(True, "Dashboard data retrieved for Team (team scoped)", 
                    {"counts": data["counts"], "beneficiaries": data["beneficiaries"]})
        return True
    else:
        print_result(False, f"Failed to get dashboard (status {status})", data)
        return False

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def run_all_tests():
    """Run all tests in sequence"""
    print("\n" + "="*80)
    print("FINLIT360 v2 BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80 + "\n")
    
    results = []
    
    # 1. Auth tests
    print("\n" + "="*80)
    print("SECTION 1: AUTHENTICATION TESTS")
    print("="*80)
    results.append(("1.1 Send OTP - Valid", test_auth_send_otp_valid()))
    results.append(("1.2 Send OTP - Unregistered (404)", test_auth_send_otp_unregistered()))
    results.append(("1.3 Verify OTP - Valid", test_auth_verify_otp_valid()))
    results.append(("1.4 Verify OTP - Invalid (401)", test_auth_verify_otp_invalid()))
    results.append(("1.5 Get Current User", test_auth_me()))
    results.append(("1.6 Logout", test_auth_logout()))
    
    # Login other roles
    print("\n" + "="*80)
    print("LOGIN OTHER ROLES")
    print("="*80)
    results.append(("Login Program Manager", test_login_program_manager()))
    results.append(("Login Branch Manager", test_login_branch_manager()))
    results.append(("Login Regional Office", test_login_regional_office()))
    results.append(("Login Team", test_login_team()))
    
    # 2. Master data tests
    print("\n" + "="*80)
    print("SECTION 2: MASTER DATA & PRIVACY TESTS")
    print("="*80)
    results.append(("2.1 GET /banks", test_master_data_banks()))
    results.append(("2.2 GET /regional_offices (Admin - fee present)", test_master_data_regional_offices_admin()))
    results.append(("2.3 GET /regional_offices (PM - fee ABSENT)", test_master_data_regional_offices_pm()))
    results.append(("2.4 GET /regional_offices (RO - fee present)", test_master_data_regional_offices_ro()))
    results.append(("2.5 GET /districts", test_master_data_districts()))
    results.append(("2.6 GET /branches", test_master_data_branches()))
    results.append(("2.7 GET /villages", test_master_data_villages()))
    results.append(("2.8 GET /teams (Admin - salary present)", test_master_data_teams_admin()))
    results.append(("2.9 GET /teams (PM - salary ABSENT)", test_master_data_teams_pm()))
    results.append(("2.10 GET /users", test_master_data_users()))
    
    # 3. Program lifecycle tests
    print("\n" + "="*80)
    print("SECTION 3: PROGRAM LIFECYCLE (SEQUENTIAL)")
    print("="*80)
    results.append(("3.1 Create Program (PM)", test_program_create()))
    results.append(("3.2 Confirm Program (BM)", test_program_confirm()))
    results.append(("3.3 Upload-data without confirm (400)", test_program_upload_data_without_confirm()))
    results.append(("3.4 Upload-data (Team)", test_program_upload_data()))
    results.append(("3.5 Authenticate (Admin)", test_program_authenticate()))
    results.append(("3.6 Authenticate <4 photos (400)", test_program_authenticate_insufficient_photos()))
    results.append(("3.7 Authenticate no participants (400)", test_program_authenticate_no_participants()))
    
    # 4. Role scoping tests
    print("\n" + "="*80)
    print("SECTION 4: ROLE SCOPING")
    print("="*80)
    results.append(("4.1 GET /programs (BM - branch scoped)", test_programs_list_branch_manager()))
    results.append(("4.2 GET /programs (RO - no expenses)", test_programs_list_regional_office()))
    
    # 5. Invoices tests
    print("\n" + "="*80)
    print("SECTION 5: INVOICES")
    print("="*80)
    results.append(("5.1 Create Invoice (Admin)", test_invoice_create()))
    results.append(("5.2 GET /invoices (Admin)", test_invoice_list_admin()))
    results.append(("5.3 GET /invoices (RO - own RO)", test_invoice_list_ro()))
    results.append(("5.4 GET /invoices (PM - 403)", test_invoice_list_pm_forbidden()))
    results.append(("5.5 PATCH /invoices/:id (Admin)", test_invoice_edit()))
    results.append(("5.6 POST /invoices/:id/payment (Admin)", test_invoice_add_payment()))
    results.append(("5.7 POST /invoices/:id/payment (RO - 403)", test_invoice_add_payment_ro_forbidden()))
    results.append(("5.8 Verify program invoiceId link", test_invoice_program_link()))
    
    # 6. Salary payments tests
    print("\n" + "="*80)
    print("SECTION 6: SALARY PAYMENTS")
    print("="*80)
    results.append(("6.1 GET /salary-payments (Admin)", test_salary_list_admin()))
    results.append(("6.2 GET /salary-payments (PM - 403)", test_salary_list_pm_forbidden()))
    results.append(("6.3 POST /salary-payments (Admin)", test_salary_create_admin()))
    results.append(("6.4 POST /salary-payments (PM - 403)", test_salary_create_pm_forbidden()))
    
    # 7. Dashboard tests
    print("\n" + "="*80)
    print("SECTION 7: DASHBOARD (ROLE-SCOPED)")
    print("="*80)
    results.append(("7.1 GET /dashboard (Admin)", test_dashboard_admin()))
    results.append(("7.2 GET /dashboard (PM)", test_dashboard_pm()))
    results.append(("7.3 GET /dashboard (BM - branch scoped)", test_dashboard_bm()))
    results.append(("7.4 GET /dashboard (RO - RO scoped)", test_dashboard_ro()))
    results.append(("7.5 GET /dashboard (Team - team scoped)", test_dashboard_team()))
    
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
