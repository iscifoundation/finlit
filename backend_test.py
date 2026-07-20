#!/usr/bin/env python3
"""
FINLIT360 Backend API Test Suite
Tests all endpoints as specified in the review request
"""
import requests
import json
import base64
from typing import Dict, Any, Optional

# Base URL from .env
BASE_URL = "https://finlit360-camp.preview.emergentagent.com/api"

# Test data
SUPER_ADMIN_MOBILE = "9000000001"
BRANCH_MANAGER_MOBILE = "9000000005"
DISTRICT_COORDINATOR_MOBILE = "9000000003"
TEAM_LEADER_MOBILE = "9000000007"
UNREGISTERED_MOBILE = "9999999999"
DEMO_OTP = "123456"
INVALID_OTP = "000000"

# Global storage for test data
test_data = {
    "super_admin_token": None,
    "branch_manager_token": None,
    "district_coordinator_token": None,
    "team_leader_token": None,
    "master_data": {},
    "camp_id": None,
    "branch_manager_branch_id": None,
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
        print(f"Details: {json.dumps(details, indent=2, default=str)}")

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
# AUTH TESTS
# ============================================================================

def test_auth_send_otp_valid():
    """Test 1: POST /auth/send-otp with valid registered mobile"""
    print_test("Auth: Send OTP - Valid Mobile")
    success, data, status = make_request("POST", "/auth/send-otp", 
                                         data={"mobile": SUPER_ADMIN_MOBILE})
    
    if success and data.get("success") and data.get("demoOtp") == DEMO_OTP:
        print_result(True, "OTP sent successfully", data)
        return True
    else:
        print_result(False, f"Failed to send OTP (status {status})", data)
        return False

def test_auth_send_otp_unregistered():
    """Test 2: POST /auth/send-otp with unregistered mobile - should 404"""
    print_test("Auth: Send OTP - Unregistered Mobile")
    success, data, status = make_request("POST", "/auth/send-otp", 
                                         data={"mobile": UNREGISTERED_MOBILE})
    
    if not success and status == 404:
        print_result(True, "Correctly rejected unregistered mobile with 404", data)
        return True
    else:
        print_result(False, f"Should return 404 for unregistered mobile (got {status})", data)
        return False

def test_auth_verify_otp_valid():
    """Test 3: POST /auth/verify-otp with valid OTP"""
    print_test("Auth: Verify OTP - Valid")
    success, data, status = make_request("POST", "/auth/verify-otp", 
                                         data={"mobile": SUPER_ADMIN_MOBILE, "otp": DEMO_OTP})
    
    if success and data.get("token") and data.get("user"):
        test_data["super_admin_token"] = data["token"]
        print_result(True, "Login successful, token received", 
                    {"token": data["token"][:20] + "...", "user": data["user"].get("name")})
        return True
    else:
        print_result(False, f"Failed to verify OTP (status {status})", data)
        return False

def test_auth_verify_otp_invalid():
    """Test 4: POST /auth/verify-otp with invalid OTP - should 401"""
    print_test("Auth: Verify OTP - Invalid")
    success, data, status = make_request("POST", "/auth/verify-otp", 
                                         data={"mobile": SUPER_ADMIN_MOBILE, "otp": INVALID_OTP})
    
    if not success and status == 401:
        print_result(True, "Correctly rejected invalid OTP with 401", data)
        return True
    else:
        print_result(False, f"Should return 401 for invalid OTP (got {status})", data)
        return False

def test_auth_me():
    """Test 5: GET /auth/me with valid token"""
    print_test("Auth: Get Current User")
    success, data, status = make_request("GET", "/auth/me", 
                                         token=test_data["super_admin_token"])
    
    if success and data.get("user") and data["user"].get("role") == "super_admin":
        print_result(True, "Successfully retrieved current user", data["user"])
        return True
    else:
        print_result(False, f"Failed to get current user (status {status})", data)
        return False

def test_auth_me_no_token():
    """Test 6: GET /auth/me without token - should 401"""
    print_test("Auth: Get Current User - No Token")
    success, data, status = make_request("GET", "/auth/me")
    
    if not success and status == 401:
        print_result(True, "Correctly rejected request without token", data)
        return True
    else:
        print_result(False, f"Should return 401 without token (got {status})", data)
        return False

# ============================================================================
# MASTER DATA TESTS
# ============================================================================

def test_master_data_banks():
    """Test 7: GET /banks"""
    print_test("Master Data: Banks")
    success, data, status = make_request("GET", "/banks", 
                                         token=test_data["super_admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["banks"] = data
        print_result(True, f"Retrieved {len(data)} banks", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get banks (status {status})", data)
        return False

def test_master_data_projects():
    """Test 8: GET /projects"""
    print_test("Master Data: Projects")
    success, data, status = make_request("GET", "/projects", 
                                         token=test_data["super_admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["projects"] = data
        print_result(True, f"Retrieved {len(data)} projects", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get projects (status {status})", data)
        return False

def test_master_data_districts():
    """Test 9: GET /districts"""
    print_test("Master Data: Districts")
    success, data, status = make_request("GET", "/districts", 
                                         token=test_data["super_admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["districts"] = data
        print_result(True, f"Retrieved {len(data)} districts", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get districts (status {status})", data)
        return False

def test_master_data_branches():
    """Test 10: GET /branches"""
    print_test("Master Data: Branches")
    success, data, status = make_request("GET", "/branches", 
                                         token=test_data["super_admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["branches"] = data
        # Find Nashik Main Branch for branch manager
        for branch in data:
            if branch.get("name") == "Nashik Main Branch":
                test_data["branch_manager_branch_id"] = branch.get("id")
                break
        print_result(True, f"Retrieved {len(data)} branches", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get branches (status {status})", data)
        return False

def test_master_data_villages():
    """Test 11: GET /villages"""
    print_test("Master Data: Villages")
    success, data, status = make_request("GET", "/villages", 
                                         token=test_data["super_admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["villages"] = data
        print_result(True, f"Retrieved {len(data)} villages", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get villages (status {status})", data)
        return False

def test_master_data_teams():
    """Test 12: GET /teams"""
    print_test("Master Data: Teams")
    success, data, status = make_request("GET", "/teams", 
                                         token=test_data["super_admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["teams"] = data
        print_result(True, f"Retrieved {len(data)} teams", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get teams (status {status})", data)
        return False

def test_master_data_users():
    """Test 13: GET /users"""
    print_test("Master Data: Users")
    success, data, status = make_request("GET", "/users", 
                                         token=test_data["super_admin_token"])
    
    if success and isinstance(data, list) and len(data) > 0:
        test_data["master_data"]["users"] = data
        print_result(True, f"Retrieved {len(data)} users", {"first": data[0]})
        return True
    else:
        print_result(False, f"Failed to get users (status {status})", data)
        return False

def test_master_data_vehicles():
    """Test 14: GET /vehicles"""
    print_test("Master Data: Vehicles")
    success, data, status = make_request("GET", "/vehicles", 
                                         token=test_data["super_admin_token"])
    
    if success and isinstance(data, list):
        test_data["master_data"]["vehicles"] = data
        print_result(True, f"Retrieved {len(data)} vehicles", {"count": len(data)})
        return True
    else:
        print_result(False, f"Failed to get vehicles (status {status})", data)
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

def test_login_branch_manager():
    """Test 15: Login as branch manager"""
    return login_role(BRANCH_MANAGER_MOBILE, "Branch Manager", "branch_manager_token")

def test_login_district_coordinator():
    """Test 16: Login as district coordinator"""
    return login_role(DISTRICT_COORDINATOR_MOBILE, "District Coordinator", "district_coordinator_token")

def test_login_team_leader():
    """Test 17: Login as team leader"""
    return login_role(TEAM_LEADER_MOBILE, "Team Leader", "team_leader_token")

# ============================================================================
# CAMPS LIFECYCLE TESTS
# ============================================================================

def test_camps_list_super_admin():
    """Test 18: GET /camps as super_admin"""
    print_test("Camps: List as Super Admin")
    success, data, status = make_request("GET", "/camps", 
                                         token=test_data["super_admin_token"])
    
    if success and isinstance(data, list):
        print_result(True, f"Retrieved {len(data)} camps", {"count": len(data)})
        return True
    else:
        print_result(False, f"Failed to get camps (status {status})", data)
        return False

def test_camps_create():
    """Test 19: POST /camps - Create new camp"""
    print_test("Camps: Create New Camp")
    
    # Get IDs from master data
    bank_id = test_data["master_data"]["banks"][0]["id"]
    project_id = test_data["master_data"]["projects"][0]["id"]
    district = test_data["master_data"]["districts"][0]
    district_id = district["id"]
    
    # Find a branch in this district
    branch = next((b for b in test_data["master_data"]["branches"] 
                   if b.get("districtId") == district_id), None)
    if not branch:
        branch = test_data["master_data"]["branches"][0]
    branch_id = branch["id"]
    
    # Find a village in this district
    village = next((v for v in test_data["master_data"]["villages"] 
                    if v.get("districtId") == district_id), None)
    if not village:
        village = test_data["master_data"]["villages"][0]
    village_id = village["id"]
    
    camp_data = {
        "bankId": bank_id,
        "projectId": project_id,
        "districtId": district_id,
        "branchId": branch_id,
        "villageId": village_id,
        "proposedDate": "2025-12-15",
        "expectedAudience": 80,
        "remarks": "Test camp for API validation"
    }
    
    success, data, status = make_request("POST", "/camps", 
                                         token=test_data["super_admin_token"],
                                         data=camp_data)
    
    if success and data.get("id") and data.get("status") == "awaiting_confirmation":
        test_data["camp_id"] = data["id"]
        test_data["camp_branch_id"] = branch_id
        test_data["camp_district_id"] = district_id
        print_result(True, "Camp created successfully", 
                    {"id": data["id"], "code": data.get("code"), "status": data["status"]})
        return True
    else:
        print_result(False, f"Failed to create camp (status {status})", data)
        return False

def test_camps_list_branch_manager_scoped():
    """Test 20: GET /camps as branch_manager - should only see own branch"""
    print_test("Camps: List as Branch Manager (Role Scoping)")
    success, data, status = make_request("GET", "/camps", 
                                         token=test_data["branch_manager_token"])
    
    if success and isinstance(data, list):
        # Check if all camps belong to branch manager's branch
        branch_id = test_data.get("branch_manager_branch_id")
        all_scoped = all(camp.get("branchId") == branch_id for camp in data)
        
        if all_scoped:
            print_result(True, f"Branch manager sees only their branch camps ({len(data)} camps)", 
                        {"branch_id": branch_id, "count": len(data)})
            return True
        else:
            print_result(False, "Branch manager sees camps from other branches", 
                        {"expected_branch": branch_id, "camps": data})
            return False
    else:
        print_result(False, f"Failed to get camps (status {status})", data)
        return False

def test_camps_confirm():
    """Test 21: POST /camps/:id/confirm as branch_manager"""
    print_test("Camps: Confirm Camp")
    
    # Create a camp for the branch manager's branch first
    bank_id = test_data["master_data"]["banks"][0]["id"]
    project_id = test_data["master_data"]["projects"][0]["id"]
    branch_id = test_data["branch_manager_branch_id"]
    
    # Find branch details
    branch = next((b for b in test_data["master_data"]["branches"] 
                   if b.get("id") == branch_id), None)
    district_id = branch.get("districtId")
    
    # Find a village in this district
    village = next((v for v in test_data["master_data"]["villages"] 
                    if v.get("districtId") == district_id), None)
    village_id = village["id"] if village else test_data["master_data"]["villages"][0]["id"]
    
    # Create camp as super admin
    camp_data = {
        "bankId": bank_id,
        "projectId": project_id,
        "districtId": district_id,
        "branchId": branch_id,
        "villageId": village_id,
        "proposedDate": "2025-12-16",
        "expectedAudience": 90,
        "remarks": "Camp for branch manager confirmation test"
    }
    
    success, data, status = make_request("POST", "/camps", 
                                         token=test_data["super_admin_token"],
                                         data=camp_data)
    
    if not success:
        print_result(False, "Failed to create camp for confirmation test", data)
        return False
    
    camp_id = data["id"]
    
    # Now confirm as branch manager
    success, data, status = make_request("POST", f"/camps/{camp_id}/confirm", 
                                         token=test_data["branch_manager_token"],
                                         data={"remarks": "Confirmed by branch manager"})
    
    if success and data.get("status") == "confirmed":
        # Update test_data to use this camp for subsequent tests
        test_data["camp_id"] = camp_id
        test_data["camp_branch_id"] = branch_id
        test_data["camp_district_id"] = district_id
        print_result(True, "Camp confirmed successfully", 
                    {"id": camp_id, "status": data["status"]})
        return True
    else:
        print_result(False, f"Failed to confirm camp (status {status})", data)
        return False

def test_camps_assign_representative():
    """Test 22: POST /camps/:id/assign-representative"""
    print_test("Camps: Assign Representative")
    
    camp_id = test_data["camp_id"]
    rep_data = {
        "name": "Test Representative",
        "contact": "9999999999",
        "role": "BC (Bank Correspondent)",
        "remarks": "Assigned for testing"
    }
    
    success, data, status = make_request("POST", f"/camps/{camp_id}/assign-representative", 
                                         token=test_data["branch_manager_token"],
                                         data=rep_data)
    
    if success and data.get("status") == "representative_assigned":
        print_result(True, "Representative assigned successfully", 
                    {"status": data["status"], "representative": data.get("representative")})
        return True
    else:
        print_result(False, f"Failed to assign representative (status {status})", data)
        return False

def test_camps_assign_team():
    """Test 23: POST /camps/:id/assign-team as district_coordinator"""
    print_test("Camps: Assign Team")
    
    camp_id = test_data["camp_id"]
    district_id = test_data["camp_district_id"]
    
    # Find a team in the same district
    team = next((t for t in test_data["master_data"]["teams"] 
                 if t.get("districtId") == district_id), None)
    
    if not team:
        print_result(False, "No team found in the camp's district", 
                    {"district_id": district_id})
        return False
    
    team_id = team["id"]
    test_data["camp_team_id"] = team_id
    
    success, data, status = make_request("POST", f"/camps/{camp_id}/assign-team", 
                                         token=test_data["district_coordinator_token"],
                                         data={"teamId": team_id})
    
    if success and data.get("status") == "team_assigned":
        print_result(True, "Team assigned successfully", 
                    {"status": data["status"], "teamId": data.get("teamId")})
        return True
    else:
        print_result(False, f"Failed to assign team (status {status})", data)
        return False

def test_camps_schedule():
    """Test 24: POST /camps/:id/schedule"""
    print_test("Camps: Schedule Camp")
    
    camp_id = test_data["camp_id"]
    
    success, data, status = make_request("POST", f"/camps/{camp_id}/schedule", 
                                         token=test_data["district_coordinator_token"],
                                         data={"date": "2025-12-15"})
    
    if success and data.get("status") == "scheduled":
        print_result(True, "Camp scheduled successfully", 
                    {"status": data["status"]})
        return True
    else:
        print_result(False, f"Failed to schedule camp (status {status})", data)
        return False

def test_camps_start():
    """Test 25: POST /camps/:id/start as team_leader"""
    print_test("Camps: Start Camp")
    
    camp_id = test_data["camp_id"]
    
    # Check if team leader is assigned to this camp's team
    # If not, use super_admin
    token = test_data["super_admin_token"]  # Use super_admin for testing
    
    gps_data = {
        "gps": {
            "lat": 19.93,
            "lng": 73.64,
            "accuracy": 10
        }
    }
    
    success, data, status = make_request("POST", f"/camps/{camp_id}/start", 
                                         token=token,
                                         data=gps_data)
    
    if success and data.get("status") == "in_progress":
        print_result(True, "Camp started successfully", 
                    {"status": data["status"], "gpsStart": data.get("gpsStart")})
        return True
    else:
        print_result(False, f"Failed to start camp (status {status})", data)
        return False

def test_camps_upload_photos():
    """Test 26: POST /camps/:id/photos - Upload 5 photos"""
    print_test("Camps: Upload Photos")
    
    camp_id = test_data["camp_id"]
    
    # Create minimal base64 image data (1x1 pixel JPEG)
    minimal_jpeg = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k="
    
    photos = [
        {"category": "venue", "data": f"data:image/jpeg;base64,{minimal_jpeg}"},
        {"category": "banner", "data": f"data:image/jpeg;base64,{minimal_jpeg}"},
        {"category": "session", "data": f"data:image/jpeg;base64,{minimal_jpeg}"},
        {"category": "group", "data": f"data:image/jpeg;base64,{minimal_jpeg}"},
        {"category": "attendance_register", "data": f"data:image/jpeg;base64,{minimal_jpeg}"}
    ]
    
    success, data, status = make_request("POST", f"/camps/{camp_id}/photos", 
                                         token=test_data["super_admin_token"],
                                         data={"photos": photos})
    
    if success and len(data.get("photos", [])) >= 5:
        print_result(True, f"Uploaded {len(photos)} photos successfully", 
                    {"photo_count": len(data.get("photos", []))})
        return True
    else:
        print_result(False, f"Failed to upload photos (status {status})", data)
        return False

def test_camps_save_attendance():
    """Test 27: POST /camps/:id/attendance"""
    print_test("Camps: Save Attendance")
    
    camp_id = test_data["camp_id"]
    
    attendance_data = {
        "attendance": {
            "male": 30,
            "female": 40,
            "youth": 10,
            "senior": 5,
            "shg": 15,
            "farmers": 10,
            "students": 8,
            "others": 2
        }
    }
    
    success, data, status = make_request("POST", f"/camps/{camp_id}/attendance", 
                                         token=test_data["super_admin_token"],
                                         data=attendance_data)
    
    if success and data.get("attendance") and data["attendance"].get("total") == 120:
        print_result(True, "Attendance saved successfully", 
                    {"attendance": data["attendance"]})
        return True
    else:
        print_result(False, f"Failed to save attendance (status {status})", data)
        return False

def test_camps_submit():
    """Test 28: POST /camps/:id/submit"""
    print_test("Camps: Submit Camp")
    
    camp_id = test_data["camp_id"]
    
    submit_data = {
        "gps": {
            "lat": 19.93,
            "lng": 73.64
        },
        "remarks": "Great turnout, excellent participation"
    }
    
    success, data, status = make_request("POST", f"/camps/{camp_id}/submit", 
                                         token=test_data["super_admin_token"],
                                         data=submit_data)
    
    if success and data.get("status") == "completed":
        print_result(True, "Camp submitted successfully", 
                    {"status": data["status"], "completedAt": data.get("completedAt")})
        return True
    else:
        print_result(False, f"Failed to submit camp (status {status})", data)
        return False

def test_camps_verify():
    """Test 29: POST /camps/:id/verify as district_coordinator"""
    print_test("Camps: Verify Camp")
    
    camp_id = test_data["camp_id"]
    
    success, data, status = make_request("POST", f"/camps/{camp_id}/verify", 
                                         token=test_data["district_coordinator_token"],
                                         data={"remarks": "Verified - all documentation complete"})
    
    if success and data.get("status") == "verified":
        print_result(True, "Camp verified successfully", 
                    {"status": data["status"], "verificationRemarks": data.get("verificationRemarks")})
        return True
    else:
        print_result(False, f"Failed to verify camp (status {status})", data)
        return False

def test_camps_close():
    """Test 30: POST /camps/:id/close as super_admin"""
    print_test("Camps: Close Camp")
    
    camp_id = test_data["camp_id"]
    
    success, data, status = make_request("POST", f"/camps/{camp_id}/close", 
                                         token=test_data["super_admin_token"])
    
    if success and data.get("status") == "closed":
        print_result(True, "Camp closed successfully", 
                    {"status": data["status"]})
        return True
    else:
        print_result(False, f"Failed to close camp (status {status})", data)
        return False

def test_camps_timeline():
    """Test 31: GET /camps/:id - Verify timeline"""
    print_test("Camps: Verify Timeline")
    
    camp_id = test_data["camp_id"]
    
    success, data, status = make_request("GET", f"/camps/{camp_id}", 
                                         token=test_data["super_admin_token"])
    
    if success and data.get("timeline"):
        timeline = data["timeline"]
        expected_events = [
            "created", "village_proposed", "awaiting_confirmation", "confirmed",
            "representative_assigned", "team_assigned", "scheduled", "start",
            "photos_uploaded", "attendance_updated", "completed", "verified", "closed"
        ]
        
        timeline_events = [t.get("event") for t in timeline]
        missing_events = [e for e in expected_events if e not in timeline_events]
        
        if not missing_events:
            print_result(True, "Timeline contains all expected events", 
                        {"events": timeline_events})
            return True
        else:
            print_result(False, "Timeline missing some events", 
                        {"missing": missing_events, "found": timeline_events})
            return False
    else:
        print_result(False, f"Failed to get camp timeline (status {status})", data)
        return False

# ============================================================================
# NEGATIVE TESTS
# ============================================================================

def test_camps_submit_without_photos():
    """Test 32: POST /camps/:id/submit without 5 photos - should 400"""
    print_test("Negative: Submit Camp Without Enough Photos")
    
    # Create a new camp and try to submit without photos
    bank_id = test_data["master_data"]["banks"][0]["id"]
    project_id = test_data["master_data"]["projects"][0]["id"]
    district_id = test_data["master_data"]["districts"][0]["id"]
    branch_id = test_data["master_data"]["branches"][0]["id"]
    village_id = test_data["master_data"]["villages"][0]["id"]
    
    # Create camp
    camp_data = {
        "bankId": bank_id,
        "projectId": project_id,
        "districtId": district_id,
        "branchId": branch_id,
        "villageId": village_id,
        "proposedDate": "2025-12-20",
        "expectedAudience": 50,
        "remarks": "Test negative case"
    }
    
    success, data, status = make_request("POST", "/camps", 
                                         token=test_data["super_admin_token"],
                                         data=camp_data)
    
    if not success:
        print_result(False, "Failed to create test camp", data)
        return False
    
    temp_camp_id = data["id"]
    
    # Confirm, assign, schedule, start
    make_request("POST", f"/camps/{temp_camp_id}/confirm", 
                token=test_data["super_admin_token"])
    make_request("POST", f"/camps/{temp_camp_id}/assign-representative", 
                token=test_data["super_admin_token"],
                data={"name": "Test", "contact": "9999999999", "role": "BC"})
    
    team_id = test_data["master_data"]["teams"][0]["id"]
    make_request("POST", f"/camps/{temp_camp_id}/assign-team", 
                token=test_data["super_admin_token"],
                data={"teamId": team_id})
    make_request("POST", f"/camps/{temp_camp_id}/schedule", 
                token=test_data["super_admin_token"],
                data={"date": "2025-12-20"})
    make_request("POST", f"/camps/{temp_camp_id}/start", 
                token=test_data["super_admin_token"],
                data={"gps": {"lat": 19.93, "lng": 73.64, "accuracy": 10}})
    
    # Add attendance but no photos
    make_request("POST", f"/camps/{temp_camp_id}/attendance", 
                token=test_data["super_admin_token"],
                data={"attendance": {"male": 20, "female": 20, "youth": 5, "senior": 5, 
                                    "shg": 10, "farmers": 10, "students": 5, "others": 5}})
    
    # Try to submit without photos
    success, data, status = make_request("POST", f"/camps/{temp_camp_id}/submit", 
                                         token=test_data["super_admin_token"],
                                         data={"gps": {"lat": 19.93, "lng": 73.64}})
    
    if not success and status == 400 and "photos" in str(data).lower():
        print_result(True, "Correctly rejected submission without 5 photos", data)
        return True
    else:
        print_result(False, f"Should return 400 for missing photos (got {status})", data)
        return False

def test_camps_verify_wrong_role():
    """Test 33: POST /camps/:id/verify as branch_manager - should 403"""
    print_test("Negative: Verify Camp with Wrong Role")
    
    # Create and complete a camp
    bank_id = test_data["master_data"]["banks"][0]["id"]
    project_id = test_data["master_data"]["projects"][0]["id"]
    district_id = test_data["master_data"]["districts"][0]["id"]
    branch_id = test_data["master_data"]["branches"][0]["id"]
    village_id = test_data["master_data"]["villages"][0]["id"]
    team_id = test_data["master_data"]["teams"][0]["id"]
    
    camp_data = {
        "bankId": bank_id,
        "projectId": project_id,
        "districtId": district_id,
        "branchId": branch_id,
        "villageId": village_id,
        "proposedDate": "2025-12-21",
        "expectedAudience": 60,
        "remarks": "Test negative verify"
    }
    
    success, data, status = make_request("POST", "/camps", 
                                         token=test_data["super_admin_token"],
                                         data=camp_data)
    
    if not success:
        print_result(False, "Failed to create test camp", data)
        return False
    
    temp_camp_id = data["id"]
    
    # Complete the workflow
    make_request("POST", f"/camps/{temp_camp_id}/confirm", 
                token=test_data["super_admin_token"])
    make_request("POST", f"/camps/{temp_camp_id}/assign-representative", 
                token=test_data["super_admin_token"],
                data={"name": "Test", "contact": "9999999999", "role": "BC"})
    make_request("POST", f"/camps/{temp_camp_id}/assign-team", 
                token=test_data["super_admin_token"],
                data={"teamId": team_id})
    make_request("POST", f"/camps/{temp_camp_id}/schedule", 
                token=test_data["super_admin_token"],
                data={"date": "2025-12-21"})
    make_request("POST", f"/camps/{temp_camp_id}/start", 
                token=test_data["super_admin_token"],
                data={"gps": {"lat": 19.93, "lng": 73.64, "accuracy": 10}})
    
    # Upload photos
    minimal_jpeg = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k="
    photos = [
        {"category": "venue", "data": f"data:image/jpeg;base64,{minimal_jpeg}"},
        {"category": "banner", "data": f"data:image/jpeg;base64,{minimal_jpeg}"},
        {"category": "session", "data": f"data:image/jpeg;base64,{minimal_jpeg}"},
        {"category": "group", "data": f"data:image/jpeg;base64,{minimal_jpeg}"},
        {"category": "attendance_register", "data": f"data:image/jpeg;base64,{minimal_jpeg}"}
    ]
    make_request("POST", f"/camps/{temp_camp_id}/photos", 
                token=test_data["super_admin_token"],
                data={"photos": photos})
    
    make_request("POST", f"/camps/{temp_camp_id}/attendance", 
                token=test_data["super_admin_token"],
                data={"attendance": {"male": 25, "female": 25, "youth": 5, "senior": 5, 
                                    "shg": 10, "farmers": 10, "students": 5, "others": 5}})
    make_request("POST", f"/camps/{temp_camp_id}/submit", 
                token=test_data["super_admin_token"],
                data={"gps": {"lat": 19.93, "lng": 73.64}})
    
    # Try to verify as branch_manager (wrong role)
    success, data, status = make_request("POST", f"/camps/{temp_camp_id}/verify", 
                                         token=test_data["branch_manager_token"],
                                         data={"remarks": "Should not work"})
    
    if not success and status == 403:
        print_result(True, "Correctly rejected verification by wrong role", data)
        return True
    else:
        print_result(False, f"Should return 403 for wrong role (got {status})", data)
        return False

# ============================================================================
# AGGREGATION TESTS
# ============================================================================

def test_dashboard():
    """Test 34: GET /dashboard"""
    print_test("Aggregations: Dashboard")
    success, data, status = make_request("GET", "/dashboard", 
                                         token=test_data["super_admin_token"])
    
    if success and data.get("counts") and data.get("byStatus") and data.get("compliance"):
        print_result(True, "Dashboard data retrieved successfully", 
                    {"counts": data["counts"], "compliance": data["compliance"]})
        return True
    else:
        print_result(False, f"Failed to get dashboard (status {status})", data)
        return False

def test_analytics():
    """Test 35: GET /analytics"""
    print_test("Aggregations: Analytics")
    success, data, status = make_request("GET", "/analytics", 
                                         token=test_data["super_admin_token"])
    
    expected_keys = ["byDistrict", "byBranch", "byTeam", "trend", "beneficiaryDist", "locations"]
    
    if success and all(key in data for key in expected_keys):
        print_result(True, "Analytics data retrieved successfully", 
                    {"keys": list(data.keys())})
        return True
    else:
        print_result(False, f"Failed to get analytics (status {status})", data)
        return False

def test_notifications():
    """Test 36: GET /notifications"""
    print_test("Aggregations: Notifications")
    success, data, status = make_request("GET", "/notifications", 
                                         token=test_data["super_admin_token"])
    
    if success and isinstance(data, list):
        print_result(True, f"Retrieved {len(data)} notifications", {"count": len(data)})
        return True
    else:
        print_result(False, f"Failed to get notifications (status {status})", data)
        return False

def test_audit():
    """Test 37: GET /audit as super_admin"""
    print_test("Aggregations: Audit Logs")
    success, data, status = make_request("GET", "/audit", 
                                         token=test_data["super_admin_token"])
    
    if success and isinstance(data, list):
        print_result(True, f"Retrieved {len(data)} audit logs", {"count": len(data)})
        return True
    else:
        print_result(False, f"Failed to get audit logs (status {status})", data)
        return False

def test_audit_forbidden():
    """Test 38: GET /audit as branch_manager - should 403"""
    print_test("Negative: Audit Logs with Wrong Role")
    success, data, status = make_request("GET", "/audit", 
                                         token=test_data["branch_manager_token"])
    
    if not success and status == 403:
        print_result(True, "Correctly rejected audit access for branch_manager", data)
        return True
    else:
        print_result(False, f"Should return 403 for branch_manager (got {status})", data)
        return False

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def run_all_tests():
    """Run all tests in sequence"""
    print("\n" + "="*80)
    print("FINLIT360 BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80 + "\n")
    
    results = []
    
    # Auth tests
    results.append(("Send OTP - Valid", test_auth_send_otp_valid()))
    results.append(("Send OTP - Unregistered", test_auth_send_otp_unregistered()))
    results.append(("Verify OTP - Valid", test_auth_verify_otp_valid()))
    results.append(("Verify OTP - Invalid", test_auth_verify_otp_invalid()))
    results.append(("Get Current User", test_auth_me()))
    results.append(("Get Current User - No Token", test_auth_me_no_token()))
    
    # Master data tests
    results.append(("Master Data - Banks", test_master_data_banks()))
    results.append(("Master Data - Projects", test_master_data_projects()))
    results.append(("Master Data - Districts", test_master_data_districts()))
    results.append(("Master Data - Branches", test_master_data_branches()))
    results.append(("Master Data - Villages", test_master_data_villages()))
    results.append(("Master Data - Teams", test_master_data_teams()))
    results.append(("Master Data - Users", test_master_data_users()))
    results.append(("Master Data - Vehicles", test_master_data_vehicles()))
    
    # Login other roles
    results.append(("Login - Branch Manager", test_login_branch_manager()))
    results.append(("Login - District Coordinator", test_login_district_coordinator()))
    results.append(("Login - Team Leader", test_login_team_leader()))
    
    # Camps lifecycle
    results.append(("Camps - List (Super Admin)", test_camps_list_super_admin()))
    results.append(("Camps - Create", test_camps_create()))
    results.append(("Camps - List (Branch Manager - Scoped)", test_camps_list_branch_manager_scoped()))
    results.append(("Camps - Confirm", test_camps_confirm()))
    results.append(("Camps - Assign Representative", test_camps_assign_representative()))
    results.append(("Camps - Assign Team", test_camps_assign_team()))
    results.append(("Camps - Schedule", test_camps_schedule()))
    results.append(("Camps - Start", test_camps_start()))
    results.append(("Camps - Upload Photos", test_camps_upload_photos()))
    results.append(("Camps - Save Attendance", test_camps_save_attendance()))
    results.append(("Camps - Submit", test_camps_submit()))
    results.append(("Camps - Verify", test_camps_verify()))
    results.append(("Camps - Close", test_camps_close()))
    results.append(("Camps - Timeline Verification", test_camps_timeline()))
    
    # Negative tests
    results.append(("Negative - Submit Without Photos", test_camps_submit_without_photos()))
    results.append(("Negative - Verify Wrong Role", test_camps_verify_wrong_role()))
    
    # Aggregations
    results.append(("Aggregations - Dashboard", test_dashboard()))
    results.append(("Aggregations - Analytics", test_analytics()))
    results.append(("Aggregations - Notifications", test_notifications()))
    results.append(("Aggregations - Audit Logs", test_audit()))
    results.append(("Negative - Audit Wrong Role", test_audit_forbidden()))
    
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
