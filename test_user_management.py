#!/usr/bin/env python3
"""
FINLIT360 v2 - User Management Endpoint Tests
Tests the new User Management endpoints with permission matrix
"""
import requests
import json
import uuid
from datetime import datetime, timedelta
from pymongo import MongoClient

# Base URL from .env
BASE_URL = "https://finlit360-camp.preview.emergentagent.com/api"

# MongoDB connection
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "finlit360"

# Test users (seeded)
DEMO_ADMIN_MOBILE = "9000000001"  # Demo Admin - isDemo: true
DEMO_PM_MOBILE = "9000000002"  # Demo PM - isDemo: true
REAL_ADMIN_MOBILE = "7987140498"  # Real Admin - isDemo: false
DEMO_OTP = "123456"

# Test data storage
test_data = {
    "demo_admin_token": None,
    "demo_pm_token": None,
    "real_admin_token": None,
    "test_pm_token": None,
    "test_bm_token": None,
    "test_ro_token": None,
    "test_team_token": None,
    "created_user_ids": [],
    "branch_id": None,
}

def print_test(name: str):
    """Print test name"""
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def print_result(success: bool, message: str, details: any = None):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if details:
        print(f"Details: {json.dumps(details, indent=2, default=str)[:800]}")

def make_request(method: str, endpoint: str, token: str = None, 
                 data: dict = None) -> tuple:
    """Make HTTP request and return (success, response_data, status_code)"""
    url = f"{BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, timeout=30)
        elif method == "POST":
            resp = requests.post(url, headers=headers, json=data, timeout=30)
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

def get_db():
    """Get MongoDB database connection"""
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]

# ============================================================================
# SETUP: Login and prepare test data
# ============================================================================

def setup_demo_admin_login():
    """Login as demo admin"""
    print_test("SETUP: Login Demo Admin (9000000001)")
    
    # Send OTP
    success, data, status = make_request("POST", "/auth/send-otp", 
                                         data={"mobile": DEMO_ADMIN_MOBILE})
    if not success:
        print_result(False, f"Failed to send OTP (status {status})", data)
        return False
    
    # Verify OTP
    success, data, status = make_request("POST", "/auth/verify-otp", 
                                         data={"mobile": DEMO_ADMIN_MOBILE, "otp": DEMO_OTP})
    if success and data.get("token"):
        test_data["demo_admin_token"] = data["token"]
        print_result(True, "Demo Admin logged in", {"user": data["user"].get("name")})
        return True
    else:
        print_result(False, f"Failed to login (status {status})", data)
        return False

def setup_demo_pm_login():
    """Login as demo PM"""
    print_test("SETUP: Login Demo PM (9000000002)")
    
    # Send OTP
    success, data, status = make_request("POST", "/auth/send-otp", 
                                         data={"mobile": DEMO_PM_MOBILE})
    if not success:
        print_result(False, f"Failed to send OTP (status {status})", data)
        return False
    
    # Verify OTP
    success, data, status = make_request("POST", "/auth/verify-otp", 
                                         data={"mobile": DEMO_PM_MOBILE, "otp": DEMO_OTP})
    if success and data.get("token"):
        test_data["demo_pm_token"] = data["token"]
        print_result(True, "Demo PM logged in", {"user": data["user"].get("name")})
        return True
    else:
        print_result(False, f"Failed to login (status {status})", data)
        return False

def setup_real_admin_session():
    """Create session for real admin in MongoDB"""
    print_test("SETUP: Create Real Admin Session (7987140498)")
    
    try:
        db = get_db()
        
        # Get real admin user
        real_admin = db.users.find_one({"mobile": REAL_ADMIN_MOBILE})
        if not real_admin:
            print_result(False, "Real admin user not found in DB", None)
            return False
        
        # Create session token
        token = str(uuid.uuid4())
        session_doc = {
            "token": token,
            "userId": real_admin["id"],
            "createdAt": datetime.utcnow(),
            "expiresAt": datetime.utcnow() + timedelta(days=30)
        }
        
        db.sessions.insert_one(session_doc)
        test_data["real_admin_token"] = token
        
        print_result(True, "Real Admin session created", 
                    {"userId": real_admin["id"], "token": token[:20] + "..."})
        return True
    except Exception as e:
        print_result(False, f"Failed to create session: {str(e)}", None)
        return False

def setup_test_pm_user():
    """Create a non-demo PM user for testing"""
    print_test("SETUP: Create Test PM User (9111111114)")
    
    try:
        db = get_db()
        
        # Check if user already exists
        existing = db.users.find_one({"mobile": "9111111114"})
        if existing:
            # Delete existing user and sessions
            db.users.delete_one({"mobile": "9111111114"})
            db.sessions.delete_many({"userId": existing["id"]})
        
        # Create test PM user
        pm_id = str(uuid.uuid4())
        pm_doc = {
            "id": pm_id,
            "name": "Test PM",
            "mobile": "9111111114",
            "role": "program_manager",
            "email": "testpm@test.com",
            "isDemo": False,
            "createdAt": datetime.utcnow()
        }
        
        db.users.insert_one(pm_doc)
        test_data["created_user_ids"].append(pm_id)
        
        # Create session for test PM
        token = str(uuid.uuid4())
        session_doc = {
            "token": token,
            "userId": pm_id,
            "createdAt": datetime.utcnow(),
            "expiresAt": datetime.utcnow() + timedelta(days=30)
        }
        
        db.sessions.insert_one(session_doc)
        test_data["test_pm_token"] = token
        
        print_result(True, "Test PM user created", {"id": pm_id, "mobile": "9111111114"})
        return True
    except Exception as e:
        print_result(False, f"Failed to create test PM: {str(e)}", None)
        return False

def setup_get_branch_id():
    """Get a valid branch ID for testing"""
    print_test("SETUP: Get Branch ID")
    
    try:
        db = get_db()
        branch = db.branches.find_one({})
        if branch:
            test_data["branch_id"] = branch["id"]
            print_result(True, "Branch ID retrieved", {"id": branch["id"], "name": branch.get("name")})
            return True
        else:
            print_result(False, "No branches found in DB", None)
            return False
    except Exception as e:
        print_result(False, f"Failed to get branch: {str(e)}", None)
        return False

# ============================================================================
# TEST 1: Demo Admin Restrictions
# ============================================================================

def test_demo_admin_post_users_forbidden():
    """Test: Demo Admin POST /users - should 403"""
    print_test("1.1 Demo Admin: POST /users (should 403)")
    
    user_data = {
        "name": "Test User",
        "mobile": "9111111111",
        "role": "team"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["demo_admin_token"],
                                         data=user_data)
    
    if not success and status == 403:
        error_msg = data.get("error", "").lower()
        if "demo" in error_msg and "cannot add" in error_msg:
            print_result(True, "Correctly rejected demo admin POST /users (403)", data)
            return True
        else:
            print_result(False, f"Error message should mention demo restriction: {data}", data)
            return False
    else:
        print_result(False, f"Should return 403 for demo admin (got {status})", data)
        return False

def test_demo_admin_patch_users_forbidden():
    """Test: Demo Admin PATCH /users/:id - should 403"""
    print_test("1.2 Demo Admin: PATCH /users/:id (should 403)")
    
    # Get any user ID
    try:
        db = get_db()
        user = db.users.find_one({"mobile": "9000000005"})  # Team user
        if not user:
            print_result(False, "No user found for testing", None)
            return False
        
        user_id = user["id"]
    except Exception as e:
        print_result(False, f"Failed to get user: {str(e)}", None)
        return False
    
    update_data = {"name": "Updated Name"}
    
    success, data, status = make_request("PATCH", f"/users/{user_id}", 
                                         token=test_data["demo_admin_token"],
                                         data=update_data)
    
    if not success and status == 403:
        error_msg = data.get("error", "").lower()
        if "demo" in error_msg:
            print_result(True, "Correctly rejected demo admin PATCH /users (403)", data)
            return True
        else:
            print_result(False, f"Error message should mention demo restriction: {data}", data)
            return False
    else:
        print_result(False, f"Should return 403 for demo admin (got {status})", data)
        return False

def test_demo_admin_delete_users_forbidden():
    """Test: Demo Admin DELETE /users/:id - should 403"""
    print_test("1.3 Demo Admin: DELETE /users/:id (should 403)")
    
    # Get any user ID
    try:
        db = get_db()
        user = db.users.find_one({"mobile": "9000000005"})  # Team user
        if not user:
            print_result(False, "No user found for testing", None)
            return False
        
        user_id = user["id"]
    except Exception as e:
        print_result(False, f"Failed to get user: {str(e)}", None)
        return False
    
    success, data, status = make_request("DELETE", f"/users/{user_id}", 
                                         token=test_data["demo_admin_token"])
    
    if not success and status == 403:
        error_msg = data.get("error", "").lower()
        if "demo" in error_msg:
            print_result(True, "Correctly rejected demo admin DELETE /users (403)", data)
            return True
        else:
            print_result(False, f"Error message should mention demo restriction: {data}", data)
            return False
    else:
        print_result(False, f"Should return 403 for demo admin (got {status})", data)
        return False

def test_demo_admin_get_users_allowed():
    """Test: Demo Admin GET /users - should 200 (viewing allowed)"""
    print_test("1.4 Demo Admin: GET /users (should 200)")
    
    success, data, status = make_request("GET", "/users", 
                                         token=test_data["demo_admin_token"])
    
    if success and isinstance(data, list):
        print_result(True, f"Demo admin can view users ({len(data)} users)", {"count": len(data)})
        return True
    else:
        print_result(False, f"Failed to get users (status {status})", data)
        return False

def test_demo_pm_post_users_forbidden():
    """Test: Demo PM POST /users - should 403"""
    print_test("1.5 Demo PM: POST /users (should 403)")
    
    user_data = {
        "name": "Test User",
        "mobile": "9111111112",
        "role": "team"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["demo_pm_token"],
                                         data=user_data)
    
    if not success and status == 403:
        error_msg = data.get("error", "").lower()
        if "demo" in error_msg:
            print_result(True, "Correctly rejected demo PM POST /users (403)", data)
            return True
        else:
            print_result(False, f"Error message should mention demo restriction: {data}", data)
            return False
    else:
        print_result(False, f"Should return 403 for demo PM (got {status})", data)
        return False

# ============================================================================
# TEST 2: Real Admin Permissions
# ============================================================================

def test_real_admin_create_team_user():
    """Test: Real Admin POST /users with role=team - should 200"""
    print_test("2.1 Real Admin: POST /users (role=team)")
    
    user_data = {
        "name": "Test Team User",
        "mobile": "9111111112",
        "role": "team",
        "email": "testteam@test.com"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["real_admin_token"],
                                         data=user_data)
    
    if success and data.get("id"):
        test_data["created_user_ids"].append(data["id"])
        test_data["test_team_user_id"] = data["id"]
        print_result(True, "Team user created successfully", 
                    {"id": data["id"], "name": data["name"], "role": data["role"]})
        return True
    else:
        print_result(False, f"Failed to create team user (status {status})", data)
        return False

def test_real_admin_create_branch_manager():
    """Test: Real Admin POST /users with role=branch_manager + branchId - should 200 and update branch"""
    print_test("2.2 Real Admin: POST /users (role=branch_manager with branchId)")
    
    branch_id = test_data.get("branch_id")
    if not branch_id:
        print_result(False, "No branch ID available", None)
        return False
    
    user_data = {
        "name": "Test Branch Manager",
        "mobile": "9111111113",
        "role": "branch_manager",
        "branchId": branch_id,
        "email": "testbm@test.com"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["real_admin_token"],
                                         data=user_data)
    
    if success and data.get("id"):
        test_data["created_user_ids"].append(data["id"])
        test_data["test_bm_user_id"] = data["id"]
        
        # Verify branch.managerId and managerName are updated
        try:
            db = get_db()
            branch = db.branches.find_one({"id": branch_id})
            if branch and branch.get("managerId") == data["id"] and branch.get("managerName") == data["name"]:
                print_result(True, "Branch Manager created and branch updated", 
                            {"userId": data["id"], "branchId": branch_id, 
                             "managerId": branch.get("managerId"), "managerName": branch.get("managerName")})
                return True
            else:
                print_result(False, "Branch not updated correctly", 
                            {"expected_managerId": data["id"], "actual": branch})
                return False
        except Exception as e:
            print_result(False, f"Failed to verify branch update: {str(e)}", None)
            return False
    else:
        print_result(False, f"Failed to create branch manager (status {status})", data)
        return False

def test_real_admin_duplicate_mobile():
    """Test: Real Admin POST /users with duplicate mobile - should 409"""
    print_test("2.3 Real Admin: POST /users (duplicate mobile - should 409)")
    
    user_data = {
        "name": "Duplicate User",
        "mobile": "9111111112",  # Already used
        "role": "team"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["real_admin_token"],
                                         data=user_data)
    
    if not success and status == 409:
        error_msg = data.get("error", "").lower()
        if "already exists" in error_msg or "duplicate" in error_msg:
            print_result(True, "Correctly rejected duplicate mobile (409)", data)
            return True
        else:
            print_result(False, f"Error message should mention duplicate: {data}", data)
            return False
    else:
        print_result(False, f"Should return 409 for duplicate mobile (got {status})", data)
        return False

def test_real_admin_invalid_mobile():
    """Test: Real Admin POST /users with invalid mobile - should 400"""
    print_test("2.4 Real Admin: POST /users (invalid mobile - should 400)")
    
    user_data = {
        "name": "Invalid Mobile User",
        "mobile": "123",  # Invalid
        "role": "team"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["real_admin_token"],
                                         data=user_data)
    
    if not success and status == 400:
        error_msg = data.get("error", "").lower()
        if "mobile" in error_msg or "10-digit" in error_msg:
            print_result(True, "Correctly rejected invalid mobile (400)", data)
            return True
        else:
            print_result(False, f"Error message should mention mobile: {data}", data)
            return False
    else:
        print_result(False, f"Should return 400 for invalid mobile (got {status})", data)
        return False

def test_real_admin_missing_name():
    """Test: Real Admin POST /users without name - should 400"""
    print_test("2.5 Real Admin: POST /users (missing name - should 400)")
    
    user_data = {
        "mobile": "9111111115",
        "role": "team"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["real_admin_token"],
                                         data=user_data)
    
    if not success and status == 400:
        error_msg = data.get("error", "").lower()
        if "name" in error_msg:
            print_result(True, "Correctly rejected missing name (400)", data)
            return True
        else:
            print_result(False, f"Error message should mention name: {data}", data)
            return False
    else:
        print_result(False, f"Should return 400 for missing name (got {status})", data)
        return False

def test_real_admin_invalid_role():
    """Test: Real Admin POST /users with invalid role - should 400"""
    print_test("2.6 Real Admin: POST /users (invalid role - should 400)")
    
    user_data = {
        "name": "Invalid Role User",
        "mobile": "9111111116",
        "role": "super_admin"  # Invalid
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["real_admin_token"],
                                         data=user_data)
    
    if not success and status == 400:
        error_msg = data.get("error", "").lower()
        if "role" in error_msg:
            print_result(True, "Correctly rejected invalid role (400)", data)
            return True
        else:
            print_result(False, f"Error message should mention role: {data}", data)
            return False
    else:
        print_result(False, f"Should return 400 for invalid role (got {status})", data)
        return False

def test_real_admin_patch_user():
    """Test: Real Admin PATCH /users/:id - should 200"""
    print_test("2.7 Real Admin: PATCH /users/:id (update name)")
    
    user_id = test_data.get("test_team_user_id")
    if not user_id:
        print_result(False, "No test user ID available", None)
        return False
    
    update_data = {"name": "Renamed Team User"}
    
    success, data, status = make_request("PATCH", f"/users/{user_id}", 
                                         token=test_data["real_admin_token"],
                                         data=update_data)
    
    if success and data.get("name") == "Renamed Team User":
        print_result(True, "User updated successfully", {"id": user_id, "name": data["name"]})
        return True
    else:
        print_result(False, f"Failed to update user (status {status})", data)
        return False

def test_real_admin_patch_demo_user_forbidden():
    """Test: Real Admin PATCH /users/:id on demo user - should 403"""
    print_test("2.8 Real Admin: PATCH /users/:id (demo user - should 403)")
    
    # Get demo user ID
    try:
        db = get_db()
        demo_user = db.users.find_one({"mobile": "9000000005", "isDemo": True})
        if not demo_user:
            print_result(False, "No demo user found", None)
            return False
        
        user_id = demo_user["id"]
    except Exception as e:
        print_result(False, f"Failed to get demo user: {str(e)}", None)
        return False
    
    update_data = {"name": "Should Fail"}
    
    success, data, status = make_request("PATCH", f"/users/{user_id}", 
                                         token=test_data["real_admin_token"],
                                         data=update_data)
    
    if not success and status == 403:
        error_msg = data.get("error", "").lower()
        if "demo" in error_msg and "cannot be edited" in error_msg:
            print_result(True, "Correctly rejected editing demo user (403)", data)
            return True
        else:
            print_result(False, f"Error message should mention demo restriction: {data}", data)
            return False
    else:
        print_result(False, f"Should return 403 for demo user edit (got {status})", data)
        return False

def test_real_admin_delete_demo_user_forbidden():
    """Test: Real Admin DELETE /users/:id on demo user - should 403"""
    print_test("2.9 Real Admin: DELETE /users/:id (demo user - should 403)")
    
    # Get demo user ID
    try:
        db = get_db()
        demo_user = db.users.find_one({"mobile": "9000000005", "isDemo": True})
        if not demo_user:
            print_result(False, "No demo user found", None)
            return False
        
        user_id = demo_user["id"]
    except Exception as e:
        print_result(False, f"Failed to get demo user: {str(e)}", None)
        return False
    
    success, data, status = make_request("DELETE", f"/users/{user_id}", 
                                         token=test_data["real_admin_token"])
    
    if not success and status == 403:
        error_msg = data.get("error", "").lower()
        if "demo" in error_msg and "cannot be deleted" in error_msg:
            print_result(True, "Correctly rejected deleting demo user (403)", data)
            return True
        else:
            print_result(False, f"Error message should mention demo restriction: {data}", data)
            return False
    else:
        print_result(False, f"Should return 403 for demo user delete (got {status})", data)
        return False

def test_real_admin_delete_self_forbidden():
    """Test: Real Admin DELETE /users/:id on self - should 400"""
    print_test("2.10 Real Admin: DELETE /users/:id (self - should 400)")
    
    # Get real admin user ID
    try:
        db = get_db()
        real_admin = db.users.find_one({"mobile": REAL_ADMIN_MOBILE})
        if not real_admin:
            print_result(False, "Real admin not found", None)
            return False
        
        user_id = real_admin["id"]
    except Exception as e:
        print_result(False, f"Failed to get real admin: {str(e)}", None)
        return False
    
    success, data, status = make_request("DELETE", f"/users/{user_id}", 
                                         token=test_data["real_admin_token"])
    
    if not success and status == 400:
        error_msg = data.get("error", "").lower()
        if "cannot delete yourself" in error_msg or "delete yourself" in error_msg:
            print_result(True, "Correctly rejected self-delete (400)", data)
            return True
        else:
            print_result(False, f"Error message should mention self-delete: {data}", data)
            return False
    else:
        print_result(False, f"Should return 400 for self-delete (got {status})", data)
        return False

def test_real_admin_delete_user():
    """Test: Real Admin DELETE /users/:id - should 200 and remove sessions"""
    print_test("2.11 Real Admin: DELETE /users/:id (verify user and sessions removed)")
    
    user_id = test_data.get("test_team_user_id")
    if not user_id:
        print_result(False, "No test user ID available", None)
        return False
    
    success, data, status = make_request("DELETE", f"/users/{user_id}", 
                                         token=test_data["real_admin_token"])
    
    if success and data.get("success"):
        # Verify user is deleted
        try:
            db = get_db()
            user = db.users.find_one({"id": user_id})
            sessions = list(db.sessions.find({"userId": user_id}))
            
            if user is None and len(sessions) == 0:
                print_result(True, "User and sessions deleted successfully", 
                            {"userId": user_id, "sessions_count": len(sessions)})
                # Remove from created_user_ids since it's deleted
                if user_id in test_data["created_user_ids"]:
                    test_data["created_user_ids"].remove(user_id)
                return True
            else:
                print_result(False, "User or sessions not deleted", 
                            {"user_exists": user is not None, "sessions_count": len(sessions)})
                return False
        except Exception as e:
            print_result(False, f"Failed to verify deletion: {str(e)}", None)
            return False
    else:
        print_result(False, f"Failed to delete user (status {status})", data)
        return False

# ============================================================================
# TEST 3: Program Manager (Non-Demo) Permissions
# ============================================================================

def test_pm_create_branch_manager():
    """Test: Non-demo PM POST /users with role=branch_manager - should 200"""
    print_test("3.1 Non-demo PM: POST /users (role=branch_manager)")
    
    user_data = {
        "name": "PM Created BM",
        "mobile": "9111111117",
        "role": "branch_manager",
        "email": "pmbm@test.com"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["test_pm_token"],
                                         data=user_data)
    
    if success and data.get("id"):
        test_data["created_user_ids"].append(data["id"])
        test_data["pm_created_bm_id"] = data["id"]
        print_result(True, "PM created branch manager successfully", 
                    {"id": data["id"], "name": data["name"], "role": data["role"]})
        return True
    else:
        print_result(False, f"Failed to create branch manager (status {status})", data)
        return False

def test_pm_create_team():
    """Test: Non-demo PM POST /users with role=team - should 200"""
    print_test("3.2 Non-demo PM: POST /users (role=team)")
    
    user_data = {
        "name": "PM Created Team",
        "mobile": "9111111118",
        "role": "team",
        "email": "pmteam@test.com"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["test_pm_token"],
                                         data=user_data)
    
    if success and data.get("id"):
        test_data["created_user_ids"].append(data["id"])
        test_data["pm_created_team_id"] = data["id"]
        print_result(True, "PM created team user successfully", 
                    {"id": data["id"], "name": data["name"], "role": data["role"]})
        return True
    else:
        print_result(False, f"Failed to create team user (status {status})", data)
        return False

def test_pm_create_admin_forbidden():
    """Test: Non-demo PM POST /users with role=admin - should 403"""
    print_test("3.3 Non-demo PM: POST /users (role=admin - should 403)")
    
    user_data = {
        "name": "PM Created Admin",
        "mobile": "9111111119",
        "role": "admin"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["test_pm_token"],
                                         data=user_data)
    
    if not success and status == 403:
        error_msg = data.get("error", "").lower()
        if "program manager" in error_msg and ("branch manager" in error_msg or "team" in error_msg):
            print_result(True, "Correctly rejected PM creating admin (403)", data)
            return True
        else:
            print_result(False, f"Error message should mention PM restriction: {data}", data)
            return False
    else:
        print_result(False, f"Should return 403 for PM creating admin (got {status})", data)
        return False

def test_pm_create_regional_office_forbidden():
    """Test: Non-demo PM POST /users with role=regional_office - should 403"""
    print_test("3.4 Non-demo PM: POST /users (role=regional_office - should 403)")
    
    user_data = {
        "name": "PM Created RO",
        "mobile": "9111111120",
        "role": "regional_office"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["test_pm_token"],
                                         data=user_data)
    
    if not success and status == 403:
        error_msg = data.get("error", "").lower()
        if "program manager" in error_msg:
            print_result(True, "Correctly rejected PM creating RO (403)", data)
            return True
        else:
            print_result(False, f"Error message should mention PM restriction: {data}", data)
            return False
    else:
        print_result(False, f"Should return 403 for PM creating RO (got {status})", data)
        return False

def test_pm_create_program_manager_forbidden():
    """Test: Non-demo PM POST /users with role=program_manager - should 403"""
    print_test("3.5 Non-demo PM: POST /users (role=program_manager - should 403)")
    
    user_data = {
        "name": "PM Created PM",
        "mobile": "9111111121",
        "role": "program_manager"
    }
    
    success, data, status = make_request("POST", "/users", 
                                         token=test_data["test_pm_token"],
                                         data=user_data)
    
    if not success and status == 403:
        error_msg = data.get("error", "").lower()
        if "program manager" in error_msg:
            print_result(True, "Correctly rejected PM creating PM (403)", data)
            return True
        else:
            print_result(False, f"Error message should mention PM restriction: {data}", data)
            return False
    else:
        print_result(False, f"Should return 403 for PM creating PM (got {status})", data)
        return False

def test_pm_patch_branch_manager():
    """Test: Non-demo PM PATCH /users/:id on branch manager - should 200"""
    print_test("3.6 Non-demo PM: PATCH /users/:id (branch manager)")
    
    user_id = test_data.get("pm_created_bm_id")
    if not user_id:
        print_result(False, "No PM-created BM ID available", None)
        return False
    
    update_data = {"name": "Updated BM Name"}
    
    success, data, status = make_request("PATCH", f"/users/{user_id}", 
                                         token=test_data["test_pm_token"],
                                         data=update_data)
    
    if success and data.get("name") == "Updated BM Name":
        print_result(True, "PM updated branch manager successfully", {"id": user_id, "name": data["name"]})
        return True
    else:
        print_result(False, f"Failed to update branch manager (status {status})", data)
        return False

def test_pm_patch_admin_forbidden():
    """Test: Non-demo PM PATCH /users/:id on admin - should 403"""
    print_test("3.7 Non-demo PM: PATCH /users/:id (admin - should 403)")
    
    # Get admin user ID
    try:
        db = get_db()
        admin_user = db.users.find_one({"role": "admin", "isDemo": False})
        if not admin_user:
            print_result(False, "No admin user found", None)
            return False
        
        user_id = admin_user["id"]
    except Exception as e:
        print_result(False, f"Failed to get admin user: {str(e)}", None)
        return False
    
    update_data = {"name": "Should Fail"}
    
    success, data, status = make_request("PATCH", f"/users/{user_id}", 
                                         token=test_data["test_pm_token"],
                                         data=update_data)
    
    if not success and status == 403:
        error_msg = data.get("error", "").lower()
        if "program manager" in error_msg:
            print_result(True, "Correctly rejected PM editing admin (403)", data)
            return True
        else:
            print_result(False, f"Error message should mention PM restriction: {data}", data)
            return False
    else:
        print_result(False, f"Should return 403 for PM editing admin (got {status})", data)
        return False

def test_pm_delete_admin_forbidden():
    """Test: Non-demo PM DELETE /users/:id on admin - should 403"""
    print_test("3.8 Non-demo PM: DELETE /users/:id (admin - should 403)")
    
    # Get admin user ID
    try:
        db = get_db()
        admin_user = db.users.find_one({"role": "admin", "isDemo": False})
        if not admin_user:
            print_result(False, "No admin user found", None)
            return False
        
        user_id = admin_user["id"]
    except Exception as e:
        print_result(False, f"Failed to get admin user: {str(e)}", None)
        return False
    
    success, data, status = make_request("DELETE", f"/users/{user_id}", 
                                         token=test_data["test_pm_token"])
    
    if not success and status == 403:
        error_msg = data.get("error", "").lower()
        if "program manager" in error_msg:
            print_result(True, "Correctly rejected PM deleting admin (403)", data)
            return True
        else:
            print_result(False, f"Error message should mention PM restriction: {data}", data)
            return False
    else:
        print_result(False, f"Should return 403 for PM deleting admin (got {status})", data)
        return False

# ============================================================================
# TEST 4: Other Roles (BM, RO, Team) - All should get 403
# ============================================================================

def test_other_roles_forbidden():
    """Test: BM, RO, Team users cannot POST/PATCH/DELETE users - should 403"""
    print_test("4.1 Other Roles: POST /users (should 403)")
    
    # Create sessions for BM, RO, Team users
    try:
        db = get_db()
        
        # Get BM user
        bm_user = db.users.find_one({"mobile": "9000000003"})  # Demo BM
        if bm_user:
            token = str(uuid.uuid4())
            db.sessions.insert_one({
                "token": token,
                "userId": bm_user["id"],
                "createdAt": datetime.utcnow(),
                "expiresAt": datetime.utcnow() + timedelta(days=30)
            })
            test_data["test_bm_token"] = token
        
        # Get RO user
        ro_user = db.users.find_one({"mobile": "9000000004"})  # Demo RO
        if ro_user:
            token = str(uuid.uuid4())
            db.sessions.insert_one({
                "token": token,
                "userId": ro_user["id"],
                "createdAt": datetime.utcnow(),
                "expiresAt": datetime.utcnow() + timedelta(days=30)
            })
            test_data["test_ro_token"] = token
        
        # Get Team user
        team_user = db.users.find_one({"mobile": "9000000005"})  # Demo Team
        if team_user:
            token = str(uuid.uuid4())
            db.sessions.insert_one({
                "token": token,
                "userId": team_user["id"],
                "createdAt": datetime.utcnow(),
                "expiresAt": datetime.utcnow() + timedelta(days=30)
            })
            test_data["test_team_token"] = token
    except Exception as e:
        print_result(False, f"Failed to create sessions: {str(e)}", None)
        return False
    
    user_data = {
        "name": "Test User",
        "mobile": "9111111122",
        "role": "team"
    }
    
    results = []
    
    # Test BM
    if test_data.get("test_bm_token"):
        success, data, status = make_request("POST", "/users", 
                                             token=test_data["test_bm_token"],
                                             data=user_data)
        if not success and status == 403:
            print_result(True, "BM correctly rejected (403)", data)
            results.append(True)
        else:
            print_result(False, f"BM should get 403 (got {status})", data)
            results.append(False)
    
    # Test RO
    if test_data.get("test_ro_token"):
        success, data, status = make_request("POST", "/users", 
                                             token=test_data["test_ro_token"],
                                             data=user_data)
        if not success and status == 403:
            print_result(True, "RO correctly rejected (403)", data)
            results.append(True)
        else:
            print_result(False, f"RO should get 403 (got {status})", data)
            results.append(False)
    
    # Test Team
    if test_data.get("test_team_token"):
        success, data, status = make_request("POST", "/users", 
                                             token=test_data["test_team_token"],
                                             data=user_data)
        if not success and status == 403:
            print_result(True, "Team correctly rejected (403)", data)
            results.append(True)
        else:
            print_result(False, f"Team should get 403 (got {status})", data)
            results.append(False)
    
    return all(results)

# ============================================================================
# CLEANUP
# ============================================================================

def cleanup_test_data():
    """Clean up test users created during testing"""
    print_test("CLEANUP: Remove Test Users")
    
    try:
        db = get_db()
        
        # Delete test users
        for user_id in test_data["created_user_ids"]:
            db.users.delete_one({"id": user_id})
            db.sessions.delete_many({"userId": user_id})
        
        # Delete test PM user (9111111114)
        test_pm = db.users.find_one({"mobile": "9111111114"})
        if test_pm:
            db.users.delete_one({"mobile": "9111111114"})
            db.sessions.delete_many({"userId": test_pm["id"]})
        
        # Delete any other test users by mobile pattern
        test_mobiles = ["9111111112", "9111111113", "9111111114", "9111111117", 
                       "9111111118", "9111111119", "9111111120", "9111111121", "9111111122"]
        for mobile in test_mobiles:
            user = db.users.find_one({"mobile": mobile})
            if user:
                db.users.delete_one({"mobile": mobile})
                db.sessions.delete_many({"userId": user["id"]})
        
        print_result(True, f"Cleaned up {len(test_data['created_user_ids'])} test users", None)
        return True
    except Exception as e:
        print_result(False, f"Failed to cleanup: {str(e)}", None)
        return False

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def run_all_tests():
    """Run all User Management tests"""
    print("\n" + "="*80)
    print("FINLIT360 v2 - USER MANAGEMENT ENDPOINT TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80 + "\n")
    
    results = []
    
    # Setup
    print("\n" + "="*80)
    print("SETUP")
    print("="*80)
    results.append(("SETUP: Demo Admin Login", setup_demo_admin_login()))
    results.append(("SETUP: Demo PM Login", setup_demo_pm_login()))
    results.append(("SETUP: Real Admin Session", setup_real_admin_session()))
    results.append(("SETUP: Test PM User", setup_test_pm_user()))
    results.append(("SETUP: Get Branch ID", setup_get_branch_id()))
    
    # Test 1: Demo restrictions
    print("\n" + "="*80)
    print("TEST 1: DEMO USER RESTRICTIONS")
    print("="*80)
    results.append(("1.1 Demo Admin POST /users (403)", test_demo_admin_post_users_forbidden()))
    results.append(("1.2 Demo Admin PATCH /users (403)", test_demo_admin_patch_users_forbidden()))
    results.append(("1.3 Demo Admin DELETE /users (403)", test_demo_admin_delete_users_forbidden()))
    results.append(("1.4 Demo Admin GET /users (200)", test_demo_admin_get_users_allowed()))
    results.append(("1.5 Demo PM POST /users (403)", test_demo_pm_post_users_forbidden()))
    
    # Test 2: Real Admin permissions
    print("\n" + "="*80)
    print("TEST 2: REAL ADMIN PERMISSIONS")
    print("="*80)
    results.append(("2.1 Real Admin Create Team User", test_real_admin_create_team_user()))
    results.append(("2.2 Real Admin Create BM + Update Branch", test_real_admin_create_branch_manager()))
    results.append(("2.3 Real Admin Duplicate Mobile (409)", test_real_admin_duplicate_mobile()))
    results.append(("2.4 Real Admin Invalid Mobile (400)", test_real_admin_invalid_mobile()))
    results.append(("2.5 Real Admin Missing Name (400)", test_real_admin_missing_name()))
    results.append(("2.6 Real Admin Invalid Role (400)", test_real_admin_invalid_role()))
    results.append(("2.7 Real Admin PATCH User", test_real_admin_patch_user()))
    results.append(("2.8 Real Admin PATCH Demo User (403)", test_real_admin_patch_demo_user_forbidden()))
    results.append(("2.9 Real Admin DELETE Demo User (403)", test_real_admin_delete_demo_user_forbidden()))
    results.append(("2.10 Real Admin DELETE Self (400)", test_real_admin_delete_self_forbidden()))
    results.append(("2.11 Real Admin DELETE User + Sessions", test_real_admin_delete_user()))
    
    # Test 3: PM permissions
    print("\n" + "="*80)
    print("TEST 3: PROGRAM MANAGER (NON-DEMO) PERMISSIONS")
    print("="*80)
    results.append(("3.1 PM Create Branch Manager", test_pm_create_branch_manager()))
    results.append(("3.2 PM Create Team", test_pm_create_team()))
    results.append(("3.3 PM Create Admin (403)", test_pm_create_admin_forbidden()))
    results.append(("3.4 PM Create RO (403)", test_pm_create_regional_office_forbidden()))
    results.append(("3.5 PM Create PM (403)", test_pm_create_program_manager_forbidden()))
    results.append(("3.6 PM PATCH Branch Manager", test_pm_patch_branch_manager()))
    results.append(("3.7 PM PATCH Admin (403)", test_pm_patch_admin_forbidden()))
    results.append(("3.8 PM DELETE Admin (403)", test_pm_delete_admin_forbidden()))
    
    # Test 4: Other roles
    print("\n" + "="*80)
    print("TEST 4: OTHER ROLES (BM, RO, TEAM) - ALL FORBIDDEN")
    print("="*80)
    results.append(("4.1 BM/RO/Team POST /users (403)", test_other_roles_forbidden()))
    
    # Cleanup
    print("\n" + "="*80)
    print("CLEANUP")
    print("="*80)
    results.append(("CLEANUP: Remove Test Users", cleanup_test_data()))
    
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
