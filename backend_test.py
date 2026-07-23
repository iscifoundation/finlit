#!/usr/bin/env python3
"""
FINLIT360 v3.1 Backend API Test Suite
Tests all backend functionality including:
1. Seed/Bootstrap
2. Magic Link Auth
3. User Creation Email Validation
4. Branch Creation with Branch Manager Email
5. User Update Email Validation
6. Settings Demo Login
7. Full Workflow Regression
"""

import os
import sys
import requests
import uuid
from datetime import datetime, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/.env')

MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME_ENV = os.getenv('DB_NAME', 'your_database_name')
# The API uses 'finlit360' if DB_NAME is 'your_database_name' (see lib/db.js line 15)
DB_NAME = 'finlit360' if DB_NAME_ENV == 'your_database_name' else DB_NAME_ENV
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
API_URL = f"{BASE_URL}/api"

PRIMARY_ADMIN_EMAIL = 'info@iscifoundation.org'

# MongoDB connection
client = MongoClient(MONGO_URL)
db = client[DB_NAME]

# Test results tracking
test_results = {
    'passed': 0,
    'failed': 0,
    'blocked': 0,
    'details': []
}

def log_test(test_name, status, message):
    """Log test result"""
    symbol = '✅' if status == 'PASS' else '❌' if status == 'FAIL' else '⚠️'
    print(f"{symbol} {test_name}: {message}")
    test_results['details'].append({
        'test': test_name,
        'status': status,
        'message': message
    })
    if status == 'PASS':
        test_results['passed'] += 1
    elif status == 'FAIL':
        test_results['failed'] += 1
    else:
        test_results['blocked'] += 1

def get_admin_user():
    """Get the primary admin user from database"""
    return db.users.find_one({'email': PRIMARY_ADMIN_EMAIL})

def create_test_session(user_id):
    """Create a test session directly in MongoDB"""
    session_token = str(uuid.uuid4())
    db.sessions.insert_one({
        "token": session_token,
        "userId": user_id,
        "createdAt": datetime.utcnow(),
        "expiresAt": datetime.utcnow() + timedelta(days=30)
    })
    return session_token

def cleanup_test_data():
    """Clean up test data created during tests (except primary admin)"""
    # Keep only the primary admin user
    db.users.delete_many({'email': {'$ne': PRIMARY_ADMIN_EMAIL}})
    # Clean up other collections
    for collection in ['banks', 'regional_offices', 'districts', 'branches', 'villages', 
                      'teams', 'programs', 'invoices', 'expenses', 'attendance', 
                      'messages', 'notifications', 'audit_logs', 'salary_payments']:
        db[collection].delete_many({})
    # Clean up auth-related collections except sessions (we need our test session)
    db.magic_links.delete_many({})
    db.otp_sessions.delete_many({})

print("=" * 80)
print("FINLIT360 v3.1 Backend API Test Suite")
print("=" * 80)
print(f"API URL: {API_URL}")
print(f"MongoDB: {MONGO_URL}/{DB_NAME}")
print(f"Primary Admin Email: {PRIMARY_ADMIN_EMAIL}")
print("=" * 80)

# ============================================================================
# TEST 1: SEED / BOOTSTRAP
# ============================================================================
print("\n" + "=" * 80)
print("TEST 1: SEED / BOOTSTRAP")
print("=" * 80)

try:
    # Hit the API to trigger seed
    response = requests.get(f"{API_URL}/", timeout=10)
    
    if response.status_code == 200:
        log_test("1.1 API Health Check", "PASS", "API is responding")
    else:
        log_test("1.1 API Health Check", "FAIL", f"API returned {response.status_code}")
    
    # Check database state
    admin_user = get_admin_user()
    
    if admin_user:
        log_test("1.2 Primary Admin Exists", "PASS", f"Admin user found with email {admin_user['email']}")
        
        if admin_user['role'] == 'admin':
            log_test("1.3 Admin Role", "PASS", "Admin has correct role")
        else:
            log_test("1.3 Admin Role", "FAIL", f"Admin role is {admin_user['role']}, expected 'admin'")
        
        if admin_user.get('isDemo') == False:
            log_test("1.4 Admin isDemo Flag", "PASS", "Admin isDemo is False")
        else:
            log_test("1.4 Admin isDemo Flag", "FAIL", f"Admin isDemo is {admin_user.get('isDemo')}")
    else:
        log_test("1.2 Primary Admin Exists", "FAIL", "No admin user found")
        log_test("1.3 Admin Role", "BLOCKED", "Cannot check - no admin user")
        log_test("1.4 Admin isDemo Flag", "BLOCKED", "Cannot check - no admin user")
    
    # Check total user count
    user_count = db.users.count_documents({})
    if user_count == 1:
        log_test("1.5 Single Admin User", "PASS", "Exactly 1 user exists")
    else:
        log_test("1.5 Single Admin User", "FAIL", f"Found {user_count} users, expected 1")
    
    # Check demoDataWiped_v3 flag
    wipe_flag = db.settings.find_one({'key': 'demoDataWiped_v3'})
    if wipe_flag and wipe_flag.get('value') == True:
        log_test("1.6 Demo Data Wipe Flag", "PASS", "demoDataWiped_v3 flag is set to true")
    else:
        log_test("1.6 Demo Data Wipe Flag", "FAIL", "demoDataWiped_v3 flag not set correctly")
    
    # Test idempotency - hit API again
    response2 = requests.get(f"{API_URL}/", timeout=10)
    user_count2 = db.users.count_documents({})
    if user_count2 == user_count:
        log_test("1.7 Seed Idempotency", "PASS", "User count unchanged after second API call")
    else:
        log_test("1.7 Seed Idempotency", "FAIL", f"User count changed from {user_count} to {user_count2}")

except Exception as e:
    log_test("1.0 Seed/Bootstrap Tests", "FAIL", f"Exception: {str(e)}")

# ============================================================================
# TEST 2: MAGIC LINK AUTH
# ============================================================================
print("\n" + "=" * 80)
print("TEST 2: MAGIC LINK AUTH")
print("=" * 80)

try:
    # Test 2.1: Invalid email format
    response = requests.post(f"{API_URL}/auth/magic-link", 
                            json={'email': 'not-an-email'},
                            timeout=10)
    if response.status_code == 400 and 'valid email' in response.text.lower():
        log_test("2.1 Invalid Email Format", "PASS", "Correctly rejected invalid email format")
    else:
        log_test("2.1 Invalid Email Format", "FAIL", f"Expected 400, got {response.status_code}: {response.text}")
    
    # Test 2.2: Unknown email
    response = requests.post(f"{API_URL}/auth/magic-link",
                            json={'email': 'unknown@nowhere.com'},
                            timeout=10)
    if response.status_code == 404 and 'not registered' in response.text.lower():
        log_test("2.2 Unknown Email", "PASS", "Correctly rejected unknown email")
    else:
        log_test("2.2 Unknown Email", "FAIL", f"Expected 404, got {response.status_code}: {response.text}")
    
    # Test 2.3: Valid primary admin email
    response = requests.post(f"{API_URL}/auth/magic-link",
                            json={'email': PRIMARY_ADMIN_EMAIL},
                            timeout=10)
    if response.status_code == 200:
        log_test("2.3 Valid Primary Admin Email", "PASS", "Magic link request accepted")
        
        # Check if magic link was created in database
        magic_link = db.magic_links.find_one({'email': PRIMARY_ADMIN_EMAIL}, sort=[('createdAt', -1)])
        if magic_link:
            log_test("2.4 Magic Link Created", "PASS", "Magic link entry created in database")
            
            # Test 2.5: Magic link callback
            token = magic_link['token']
            response = requests.get(f"{API_URL}/auth/magic-callback?token={token}",
                                   allow_redirects=False,
                                   timeout=10)
            if response.status_code == 200 and 'finlit_token' in response.text:
                log_test("2.5 Magic Link Callback", "PASS", "Callback successful, session token in response")
                
                # Check if session was created
                session = db.sessions.find_one({}, sort=[('createdAt', -1)])
                if session:
                    log_test("2.6 Session Created", "PASS", "Session entry created in database")
                else:
                    log_test("2.6 Session Created", "FAIL", "No session found in database")
                
                # Check if magic link was marked as used
                used_link = db.magic_links.find_one({'token': token})
                if used_link and used_link.get('used') == True:
                    log_test("2.7 Magic Link Marked Used", "PASS", "Magic link marked as used")
                else:
                    log_test("2.7 Magic Link Marked Used", "FAIL", "Magic link not marked as used")
                
                # Test 2.8: Reuse same token
                response = requests.get(f"{API_URL}/auth/magic-callback?token={token}",
                                       allow_redirects=False,
                                       timeout=10)
                if response.status_code == 302 and 'link_used' in response.headers.get('Location', ''):
                    log_test("2.8 Token Reuse Prevention", "PASS", "Correctly rejected reused token")
                else:
                    log_test("2.8 Token Reuse Prevention", "FAIL", f"Expected 302 redirect, got {response.status_code}")
            else:
                log_test("2.5 Magic Link Callback", "FAIL", f"Expected 200 with token, got {response.status_code}")
                log_test("2.6 Session Created", "BLOCKED", "Cannot check - callback failed")
                log_test("2.7 Magic Link Marked Used", "BLOCKED", "Cannot check - callback failed")
                log_test("2.8 Token Reuse Prevention", "BLOCKED", "Cannot check - callback failed")
        else:
            log_test("2.4 Magic Link Created", "FAIL", "No magic link found in database")
            log_test("2.5 Magic Link Callback", "BLOCKED", "Cannot check - no magic link")
            log_test("2.6 Session Created", "BLOCKED", "Cannot check - no magic link")
            log_test("2.7 Magic Link Marked Used", "BLOCKED", "Cannot check - no magic link")
            log_test("2.8 Token Reuse Prevention", "BLOCKED", "Cannot check - no magic link")
    else:
        log_test("2.3 Valid Primary Admin Email", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")
        log_test("2.4 Magic Link Created", "BLOCKED", "Cannot check - request failed")
        log_test("2.5 Magic Link Callback", "BLOCKED", "Cannot check - request failed")
        log_test("2.6 Session Created", "BLOCKED", "Cannot check - request failed")
        log_test("2.7 Magic Link Marked Used", "BLOCKED", "Cannot check - request failed")
        log_test("2.8 Token Reuse Prevention", "BLOCKED", "Cannot check - request failed")

except Exception as e:
    log_test("2.0 Magic Link Auth Tests", "FAIL", f"Exception: {str(e)}")

# ============================================================================
# SETUP: Create test session for authenticated tests
# ============================================================================
print("\n" + "=" * 80)
print("SETUP: Creating test session for authenticated tests")
print("=" * 80)

admin_user = get_admin_user()
if not admin_user:
    print("❌ CRITICAL: Cannot proceed - no admin user found")
    sys.exit(1)

# Clean up old test sessions
db.sessions.delete_many({'userId': admin_user['id']})

# Create new test session
session_token = create_test_session(admin_user['id'])
headers = {'Authorization': f'Bearer {session_token}'}
print(f"✅ Test session created: {session_token[:20]}...")

# Clean up test data before proceeding
cleanup_test_data()
print("✅ Test data cleaned up")

# ============================================================================
# TEST 3: USER CREATION EMAIL VALIDATION
# ============================================================================
print("\n" + "=" * 80)
print("TEST 3: USER CREATION EMAIL VALIDATION")
print("=" * 80)

try:
    # Test 3.1: Missing email
    response = requests.post(f"{API_URL}/users",
                            headers=headers,
                            json={'name': 'Test User', 'role': 'program_manager'},
                            timeout=10)
    if response.status_code == 400 and 'valid email' in response.text.lower():
        log_test("3.1 Missing Email", "PASS", "Correctly rejected missing email")
    else:
        log_test("3.1 Missing Email", "FAIL", f"Expected 400, got {response.status_code}: {response.text}")
    
    # Test 3.2: Invalid email format
    response = requests.post(f"{API_URL}/users",
                            headers=headers,
                            json={'name': 'Test User', 'email': 'invalid', 'role': 'program_manager'},
                            timeout=10)
    if response.status_code == 400 and 'valid email' in response.text.lower():
        log_test("3.2 Invalid Email Format", "PASS", "Correctly rejected invalid email")
    else:
        log_test("3.2 Invalid Email Format", "FAIL", f"Expected 400, got {response.status_code}: {response.text}")
    
    # Test 3.3: Valid user creation
    response = requests.post(f"{API_URL}/users",
                            headers=headers,
                            json={'name': 'PM One', 'email': 'pm1@test.com', 'role': 'program_manager'},
                            timeout=10)
    if response.status_code == 200:
        user_data = response.json()
        log_test("3.3 Valid User Creation", "PASS", f"User created with email {user_data.get('email')}")
        pm1_id = user_data.get('id')
        
        # Verify in database
        db_user = db.users.find_one({'id': pm1_id})
        if db_user and db_user.get('isDemo') == False and db_user.get('mobile') is None:
            log_test("3.4 User Properties", "PASS", "User has isDemo=False, mobile=None")
        else:
            log_test("3.4 User Properties", "FAIL", f"User properties incorrect: isDemo={db_user.get('isDemo')}, mobile={db_user.get('mobile')}")
    else:
        log_test("3.3 Valid User Creation", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")
        log_test("3.4 User Properties", "BLOCKED", "Cannot check - user creation failed")
    
    # Test 3.5: Duplicate email
    response = requests.post(f"{API_URL}/users",
                            headers=headers,
                            json={'name': 'PM Two', 'email': 'pm1@test.com', 'role': 'program_manager'},
                            timeout=10)
    if response.status_code == 409 and 'already exists' in response.text.lower():
        log_test("3.5 Duplicate Email", "PASS", "Correctly rejected duplicate email")
    else:
        log_test("3.5 Duplicate Email", "FAIL", f"Expected 409, got {response.status_code}: {response.text}")
    
    # Test 3.6: Invalid mobile format
    response = requests.post(f"{API_URL}/users",
                            headers=headers,
                            json={'name': 'Team Member', 'email': 'team1@test.com', 'role': 'team', 'mobile': '123'},
                            timeout=10)
    if response.status_code == 400 and '10-digit' in response.text.lower():
        log_test("3.6 Invalid Mobile Format", "PASS", "Correctly rejected invalid mobile")
    else:
        log_test("3.6 Invalid Mobile Format", "FAIL", f"Expected 400, got {response.status_code}: {response.text}")
    
    # Test 3.7: Valid mobile
    response = requests.post(f"{API_URL}/users",
                            headers=headers,
                            json={'name': 'Team Member', 'email': 'team1@test.com', 'role': 'team', 'mobile': '9876543210'},
                            timeout=10)
    if response.status_code == 200:
        log_test("3.7 Valid Mobile", "PASS", "User created with valid mobile")
        team1_id = response.json().get('id')
    else:
        log_test("3.7 Valid Mobile", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")
    
    # Test 3.8: Duplicate mobile
    response = requests.post(f"{API_URL}/users",
                            headers=headers,
                            json={'name': 'Team Member 2', 'email': 'team2@test.com', 'role': 'team', 'mobile': '9876543210'},
                            timeout=10)
    if response.status_code == 409 and 'mobile' in response.text.lower():
        log_test("3.8 Duplicate Mobile", "PASS", "Correctly rejected duplicate mobile")
    else:
        log_test("3.8 Duplicate Mobile", "FAIL", f"Expected 409, got {response.status_code}: {response.text}")
    
    # Test 3.9: Create users with different roles
    roles_to_test = ['admin', 'branch_manager', 'regional_office']
    for idx, role in enumerate(roles_to_test):
        response = requests.post(f"{API_URL}/users",
                                headers=headers,
                                json={'name': f'{role.title()} User', 'email': f'{role}{idx}@test.com', 'role': role},
                                timeout=10)
        if response.status_code == 200:
            log_test(f"3.9.{idx+1} Create {role}", "PASS", f"User with role {role} created")
        else:
            log_test(f"3.9.{idx+1} Create {role}", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")

except Exception as e:
    log_test("3.0 User Creation Tests", "FAIL", f"Exception: {str(e)}")

# ============================================================================
# TEST 4: BRANCH CREATION WITH BRANCH MANAGER EMAIL
# ============================================================================
print("\n" + "=" * 80)
print("TEST 4: BRANCH CREATION WITH BRANCH MANAGER EMAIL")
print("=" * 80)

try:
    # Setup: Create Bank, RO, District
    bank_response = requests.post(f"{API_URL}/banks",
                                 headers=headers,
                                 json={'name': 'Test Bank', 'code': 'TB'},
                                 timeout=10)
    if bank_response.status_code == 200:
        bank_id = bank_response.json().get('id')
        log_test("4.0.1 Setup Bank", "PASS", f"Bank created: {bank_id}")
    else:
        log_test("4.0.1 Setup Bank", "FAIL", f"Expected 200, got {bank_response.status_code}")
        raise Exception("Cannot proceed without bank")
    
    ro_response = requests.post(f"{API_URL}/regional_offices",
                               headers=headers,
                               json={'bankId': bank_id, 'name': 'Test RO', 'state': 'MP', 
                                    'address': 'Test Address', 'feePerProgram': 3750},
                               timeout=10)
    if ro_response.status_code == 200:
        ro_id = ro_response.json().get('id')
        log_test("4.0.2 Setup RO", "PASS", f"RO created: {ro_id}")
    else:
        log_test("4.0.2 Setup RO", "FAIL", f"Expected 200, got {ro_response.status_code}")
        raise Exception("Cannot proceed without RO")
    
    district_response = requests.post(f"{API_URL}/districts",
                                     headers=headers,
                                     json={'roId': ro_id, 'name': 'Test District', 'state': 'MP'},
                                     timeout=10)
    if district_response.status_code == 200:
        district_id = district_response.json().get('id')
        log_test("4.0.3 Setup District", "PASS", f"District created: {district_id}")
    else:
        log_test("4.0.3 Setup District", "FAIL", f"Expected 200, got {district_response.status_code}")
        raise Exception("Cannot proceed without district")
    
    # Test 4.1: Missing branchManagerEmail
    response = requests.post(f"{API_URL}/branches",
                            headers=headers,
                            json={'districtId': district_id, 'name': 'Branch 1', 'code': 'B1', 'address': 'addr'},
                            timeout=10)
    if response.status_code == 400 and 'email' in response.text.lower():
        log_test("4.1 Missing Branch Manager Email", "PASS", "Correctly rejected missing branchManagerEmail")
    else:
        log_test("4.1 Missing Branch Manager Email", "FAIL", f"Expected 400, got {response.status_code}: {response.text}")
    
    # Test 4.2: Invalid branchManagerEmail
    response = requests.post(f"{API_URL}/branches",
                            headers=headers,
                            json={'districtId': district_id, 'name': 'Branch 1', 'code': 'B1', 
                                 'address': 'addr', 'branchManagerEmail': 'invalid'},
                            timeout=10)
    if response.status_code == 400 and 'email' in response.text.lower():
        log_test("4.2 Invalid Branch Manager Email", "PASS", "Correctly rejected invalid email")
    else:
        log_test("4.2 Invalid Branch Manager Email", "FAIL", f"Expected 400, got {response.status_code}: {response.text}")
    
    # Test 4.3: Valid branch creation with auto-create BM
    response = requests.post(f"{API_URL}/branches",
                            headers=headers,
                            json={'districtId': district_id, 'name': 'Branch 1', 'code': 'B1',
                                 'address': 'addr', 'branchManagerEmail': 'bm1@test.com',
                                 'branchManagerName': 'BM One'},
                            timeout=10)
    if response.status_code == 200:
        branch_data = response.json()
        branch1_id = branch_data.get('id')
        log_test("4.3 Valid Branch Creation", "PASS", f"Branch created: {branch1_id}")
        
        # Verify BM user was created
        bm_user = db.users.find_one({'email': 'bm1@test.com'})
        if bm_user:
            log_test("4.4 BM User Auto-Created", "PASS", f"BM user created with id {bm_user['id']}")
            
            if bm_user.get('role') == 'branch_manager':
                log_test("4.5 BM User Role", "PASS", "BM user has correct role")
            else:
                log_test("4.5 BM User Role", "FAIL", f"BM role is {bm_user.get('role')}")
            
            if bm_user.get('branchId') == branch1_id:
                log_test("4.6 BM User Branch Link", "PASS", "BM user linked to branch")
            else:
                log_test("4.6 BM User Branch Link", "FAIL", f"BM branchId is {bm_user.get('branchId')}, expected {branch1_id}")
            
            if bm_user.get('isDemo') == False:
                log_test("4.7 BM User isDemo", "PASS", "BM user isDemo is False")
            else:
                log_test("4.7 BM User isDemo", "FAIL", f"BM isDemo is {bm_user.get('isDemo')}")
        else:
            log_test("4.4 BM User Auto-Created", "FAIL", "BM user not found in database")
            log_test("4.5 BM User Role", "BLOCKED", "Cannot check - no BM user")
            log_test("4.6 BM User Branch Link", "BLOCKED", "Cannot check - no BM user")
            log_test("4.7 BM User isDemo", "BLOCKED", "Cannot check - no BM user")
        
        # Verify branch has manager info
        if branch_data.get('managerId') and branch_data.get('managerName') == 'BM One' and branch_data.get('managerEmail') == 'bm1@test.com':
            log_test("4.8 Branch Manager Info", "PASS", "Branch has correct manager info")
        else:
            log_test("4.8 Branch Manager Info", "FAIL", f"Branch manager info incorrect: {branch_data}")
    else:
        log_test("4.3 Valid Branch Creation", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")
        log_test("4.4 BM User Auto-Created", "BLOCKED", "Cannot check - branch creation failed")
        log_test("4.5 BM User Role", "BLOCKED", "Cannot check - branch creation failed")
        log_test("4.6 BM User Branch Link", "BLOCKED", "Cannot check - branch creation failed")
        log_test("4.7 BM User isDemo", "BLOCKED", "Cannot check - branch creation failed")
        log_test("4.8 Branch Manager Info", "BLOCKED", "Cannot check - branch creation failed")
    
    # Test 4.9: Re-use existing BM user
    response = requests.post(f"{API_URL}/branches",
                            headers=headers,
                            json={'districtId': district_id, 'name': 'Branch 2', 'code': 'B2',
                                 'address': 'addr2', 'branchManagerEmail': 'bm1@test.com',
                                 'branchManagerName': 'BM One Updated'},
                            timeout=10)
    if response.status_code == 200:
        branch2_data = response.json()
        branch2_id = branch2_data.get('id')
        log_test("4.9 Branch with Existing BM", "PASS", f"Branch 2 created: {branch2_id}")
        
        # Verify no duplicate BM user was created
        bm_count = db.users.count_documents({'email': 'bm1@test.com'})
        if bm_count == 1:
            log_test("4.10 No Duplicate BM User", "PASS", "Only 1 BM user exists")
            
            # Verify BM user was re-linked to new branch
            bm_user = db.users.find_one({'email': 'bm1@test.com'})
            if bm_user.get('branchId') == branch2_id:
                log_test("4.11 BM User Re-linked", "PASS", "BM user re-linked to new branch")
            else:
                log_test("4.11 BM User Re-linked", "FAIL", f"BM branchId is {bm_user.get('branchId')}, expected {branch2_id}")
        else:
            log_test("4.10 No Duplicate BM User", "FAIL", f"Found {bm_count} BM users, expected 1")
            log_test("4.11 BM User Re-linked", "BLOCKED", "Cannot check - duplicate users exist")
    else:
        log_test("4.9 Branch with Existing BM", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")
        log_test("4.10 No Duplicate BM User", "BLOCKED", "Cannot check - branch creation failed")
        log_test("4.11 BM User Re-linked", "BLOCKED", "Cannot check - branch creation failed")

except Exception as e:
    log_test("4.0 Branch Creation Tests", "FAIL", f"Exception: {str(e)}")

# ============================================================================
# TEST 5: USER UPDATE EMAIL VALIDATION
# ============================================================================
print("\n" + "=" * 80)
print("TEST 5: USER UPDATE EMAIL VALIDATION")
print("=" * 80)

try:
    # Create a test user to update
    response = requests.post(f"{API_URL}/users",
                            headers=headers,
                            json={'name': 'Update Test User', 'email': 'updatetest@test.com', 'role': 'program_manager'},
                            timeout=10)
    if response.status_code == 200:
        test_user_id = response.json().get('id')
        log_test("5.0 Setup Test User", "PASS", f"Test user created: {test_user_id}")
    else:
        log_test("5.0 Setup Test User", "FAIL", f"Expected 200, got {response.status_code}")
        raise Exception("Cannot proceed without test user")
    
    # Test 5.1: Empty email
    response = requests.patch(f"{API_URL}/users/{test_user_id}",
                             headers=headers,
                             json={'email': ''},
                             timeout=10)
    if response.status_code == 400 and 'valid email' in response.text.lower():
        log_test("5.1 Empty Email", "PASS", "Correctly rejected empty email")
    else:
        log_test("5.1 Empty Email", "FAIL", f"Expected 400, got {response.status_code}: {response.text}")
    
    # Test 5.2: Invalid email format
    response = requests.patch(f"{API_URL}/users/{test_user_id}",
                             headers=headers,
                             json={'email': 'invalid'},
                             timeout=10)
    if response.status_code == 400 and 'valid email' in response.text.lower():
        log_test("5.2 Invalid Email Format", "PASS", "Correctly rejected invalid email")
    else:
        log_test("5.2 Invalid Email Format", "FAIL", f"Expected 400, got {response.status_code}: {response.text}")
    
    # Test 5.3: Duplicate email (use primary admin email)
    response = requests.patch(f"{API_URL}/users/{test_user_id}",
                             headers=headers,
                             json={'email': PRIMARY_ADMIN_EMAIL},
                             timeout=10)
    if response.status_code == 409 and 'already' in response.text.lower():
        log_test("5.3 Duplicate Email", "PASS", "Correctly rejected duplicate email")
    else:
        log_test("5.3 Duplicate Email", "FAIL", f"Expected 409, got {response.status_code}: {response.text}")
    
    # Test 5.4: Valid email update
    response = requests.patch(f"{API_URL}/users/{test_user_id}",
                             headers=headers,
                             json={'email': 'newemail@test.com'},
                             timeout=10)
    if response.status_code == 200:
        updated_user = response.json()
        if updated_user.get('email') == 'newemail@test.com':
            log_test("5.4 Valid Email Update", "PASS", "Email updated successfully")
        else:
            log_test("5.4 Valid Email Update", "FAIL", f"Email not updated: {updated_user.get('email')}")
    else:
        log_test("5.4 Valid Email Update", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")

except Exception as e:
    log_test("5.0 User Update Tests", "FAIL", f"Exception: {str(e)}")

# ============================================================================
# TEST 6: SETTINGS DEMO LOGIN
# ============================================================================
print("\n" + "=" * 80)
print("TEST 6: SETTINGS DEMO LOGIN")
print("=" * 80)

try:
    # Test 6.1: GET settings
    response = requests.get(f"{API_URL}/settings",
                           headers=headers,
                           timeout=10)
    if response.status_code == 200:
        settings = response.json()
        log_test("6.1 GET Settings", "PASS", f"Settings retrieved: {settings}")
        
        if 'demoDataWiped_v3' in settings:
            log_test("6.2 Demo Data Wipe Flag in Settings", "PASS", "demoDataWiped_v3 present in settings")
        else:
            log_test("6.2 Demo Data Wipe Flag in Settings", "FAIL", "demoDataWiped_v3 not in settings")
    else:
        log_test("6.1 GET Settings", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")
        log_test("6.2 Demo Data Wipe Flag in Settings", "BLOCKED", "Cannot check - GET failed")
    
    # Test 6.3: Non-primary admin cannot toggle (create a different admin user)
    response = requests.post(f"{API_URL}/users",
                            headers=headers,
                            json={'name': 'Other Admin', 'email': 'otheradmin@test.com', 'role': 'admin'},
                            timeout=10)
    if response.status_code == 200:
        other_admin_id = response.json().get('id')
        other_session = create_test_session(other_admin_id)
        other_headers = {'Authorization': f'Bearer {other_session}'}
        
        response = requests.post(f"{API_URL}/settings/demo-login",
                                headers=other_headers,
                                json={'enabled': False},
                                timeout=10)
        if response.status_code == 403 and PRIMARY_ADMIN_EMAIL in response.text:
            log_test("6.3 Non-Primary Admin Toggle", "PASS", "Correctly rejected non-primary admin")
        else:
            log_test("6.3 Non-Primary Admin Toggle", "FAIL", f"Expected 403, got {response.status_code}: {response.text}")
    else:
        log_test("6.3 Non-Primary Admin Toggle", "BLOCKED", "Cannot create other admin user")
    
    # Test 6.4: Primary admin can toggle
    response = requests.post(f"{API_URL}/settings/demo-login",
                            headers=headers,
                            json={'enabled': False},
                            timeout=10)
    if response.status_code == 200:
        log_test("6.4 Primary Admin Toggle", "PASS", "Primary admin can toggle demo login")
        
        # Verify setting was persisted
        setting = db.settings.find_one({'key': 'demoLoginEnabled'})
        if setting and setting.get('value') == False:
            log_test("6.5 Setting Persisted", "PASS", "demoLoginEnabled set to False")
        else:
            log_test("6.5 Setting Persisted", "FAIL", f"Setting not persisted correctly: {setting}")
    else:
        log_test("6.4 Primary Admin Toggle", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")
        log_test("6.5 Setting Persisted", "BLOCKED", "Cannot check - toggle failed")

except Exception as e:
    log_test("6.0 Settings Tests", "FAIL", f"Exception: {str(e)}")

# ============================================================================
# TEST 7: FULL WORKFLOW REGRESSION
# ============================================================================
print("\n" + "=" * 80)
print("TEST 7: FULL WORKFLOW REGRESSION")
print("=" * 80)

try:
    # Use existing bank, RO, district, branch from Test 4
    # Get the branch we created
    branch = db.branches.find_one({}, sort=[('createdAt', -1)])
    if not branch:
        log_test("7.0 Setup Check", "FAIL", "No branch found from previous tests")
        raise Exception("Cannot proceed without branch")
    
    branch_id = branch['id']
    district_id = branch['districtId']
    
    # Get district and RO
    district = db.districts.find_one({'id': district_id})
    ro_id = district['roId']
    ro = db.regional_offices.find_one({'id': ro_id})
    bank_id = ro['bankId']
    
    log_test("7.0 Setup Check", "PASS", f"Using Bank={bank_id}, RO={ro_id}, District={district_id}, Branch={branch_id}")
    
    # Create Village
    response = requests.post(f"{API_URL}/villages",
                            headers=headers,
                            json={'name': 'Test Village', 'districtId': district_id},
                            timeout=10)
    if response.status_code == 200:
        village_id = response.json().get('id')
        log_test("7.1 Create Village", "PASS", f"Village created: {village_id}")
    else:
        log_test("7.1 Create Village", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")
        raise Exception("Cannot proceed without village")
    
    # Create Team
    response = requests.post(f"{API_URL}/teams",
                            headers=headers,
                            json={'name': 'Test Team', 'districtId': district_id,
                                 'members': [{'name': 'Member 1', 'role': 'Leader', 'dailySalary': 500}]},
                            timeout=10)
    if response.status_code == 200:
        team_id = response.json().get('id')
        log_test("7.2 Create Team", "PASS", f"Team created: {team_id}")
    else:
        log_test("7.2 Create Team", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")
        raise Exception("Cannot proceed without team")
    
    # Create Program
    response = requests.post(f"{API_URL}/programs",
                            headers=headers,
                            json={'branchId': branch_id, 'villageId': village_id, 'teamId': team_id,
                                 'proposedDate': datetime.utcnow().isoformat(), 'remarks': 'Test program'},
                            timeout=10)
    if response.status_code == 200:
        program_data = response.json()
        program_id = program_data.get('id')
        log_test("7.3 Create Program", "PASS", f"Program created: {program_id}")
        
        # Verify program properties
        if program_data.get('status') == 'proposed':
            log_test("7.4 Program Status", "PASS", "Program status is 'proposed'")
        else:
            log_test("7.4 Program Status", "FAIL", f"Program status is {program_data.get('status')}")
        
        if program_data.get('branchConfirmed') == False:
            log_test("7.5 Program Not Confirmed", "PASS", "Program branchConfirmed is False")
        else:
            log_test("7.5 Program Not Confirmed", "FAIL", f"Program branchConfirmed is {program_data.get('branchConfirmed')}")
    else:
        log_test("7.3 Create Program", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")
        log_test("7.4 Program Status", "BLOCKED", "Cannot check - program creation failed")
        log_test("7.5 Program Not Confirmed", "BLOCKED", "Cannot check - program creation failed")
        raise Exception("Cannot proceed without program")
    
    # Confirm Program
    response = requests.post(f"{API_URL}/programs/{program_id}/confirm",
                            headers=headers,
                            json={},
                            timeout=10)
    if response.status_code == 200:
        confirmed_program = response.json()
        log_test("7.6 Confirm Program", "PASS", "Program confirmed by admin")
        
        if confirmed_program.get('status') == 'confirmed':
            log_test("7.7 Program Status After Confirm", "PASS", "Program status is 'confirmed'")
        else:
            log_test("7.7 Program Status After Confirm", "FAIL", f"Program status is {confirmed_program.get('status')}")
        
        if confirmed_program.get('branchConfirmed') == True:
            log_test("7.8 Program Branch Confirmed", "PASS", "Program branchConfirmed is True")
        else:
            log_test("7.8 Program Branch Confirmed", "FAIL", f"Program branchConfirmed is {confirmed_program.get('branchConfirmed')}")
        
        if confirmed_program.get('branchConfirmedBy') == admin_user['id']:
            log_test("7.9 Confirmed By Admin", "PASS", "Program confirmed by correct user")
        else:
            log_test("7.9 Confirmed By Admin", "FAIL", f"Program confirmed by {confirmed_program.get('branchConfirmedBy')}")
    else:
        log_test("7.6 Confirm Program", "FAIL", f"Expected 200, got {response.status_code}: {response.text}")
        log_test("7.7 Program Status After Confirm", "BLOCKED", "Cannot check - confirm failed")
        log_test("7.8 Program Branch Confirmed", "BLOCKED", "Cannot check - confirm failed")
        log_test("7.9 Confirmed By Admin", "BLOCKED", "Cannot check - confirm failed")

except Exception as e:
    log_test("7.0 Full Workflow Tests", "FAIL", f"Exception: {str(e)}")

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"✅ PASSED: {test_results['passed']}")
print(f"❌ FAILED: {test_results['failed']}")
print(f"⚠️  BLOCKED: {test_results['blocked']}")
print(f"TOTAL: {test_results['passed'] + test_results['failed'] + test_results['blocked']}")
print("=" * 80)

# Print failed tests
if test_results['failed'] > 0:
    print("\nFAILED TESTS:")
    for detail in test_results['details']:
        if detail['status'] == 'FAIL':
            print(f"  ❌ {detail['test']}: {detail['message']}")

# Exit with appropriate code
sys.exit(0 if test_results['failed'] == 0 else 1)
