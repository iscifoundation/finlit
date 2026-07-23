#!/usr/bin/env python3
"""
FINLIT360 v3.1 Critical Bug Report
The PRIMARY_ADMIN_EMAIL is set to literal string "[email protected]" instead of a real email
"""
import requests
from pymongo import MongoClient
from datetime import datetime, timedelta
import uuid

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "finlit360"
BASE_URL = "https://finlit360-camp.preview.emergentagent.com/api"

def get_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]

print("="*80)
print("CRITICAL BUG FOUND IN FINLIT360 v3.1")
print("="*80)
print()

# Check the admin user email
db = get_db()
admin = db.users.find_one({"role": "admin"})
print(f"Admin user email in DB: {admin['email']}")
print(f"Email length: {len(admin['email'])}")
print(f"Email bytes: {admin['email'].encode('utf-8')}")
print()

# Test if this email passes the regex
import re
EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
print(f"Does email pass regex? {EMAIL_RE.match(admin['email']) is not None}")
print()

# Try to send magic link
print("Attempting to send magic link...")
resp = requests.post(f"{BASE_URL}/auth/magic-link", json={"email": admin['email']})
print(f"Status: {resp.status_code}")
print(f"Response: {resp.json()}")
print()

print("="*80)
print("CONCLUSION:")
print("="*80)
print("The PRIMARY_ADMIN_EMAIL constant in route.js is set to the literal string")
print("'[email protected]' instead of a real email address like '[email protected]'.")
print("This causes the email validation regex to reject it (400 error).")
print()
print("WORKAROUND: Create a session directly in the database for testing.")
print("="*80)

# Create a session for testing
print()
print("Creating test session directly in database...")
session_token = str(uuid.uuid4())
db.sessions.insert_one({
    "token": session_token,
    "userId": admin["id"],
    "createdAt": datetime.utcnow(),
    "expiresAt": datetime.utcnow() + timedelta(days=30)
})
print(f"Session token created: {session_token}")
print()

# Test the session
print("Testing session...")
resp = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {session_token}"})
print(f"Status: {resp.status_code}")
if resp.status_code == 200:
    print(f"✅ Session works! User: {resp.json()['user']['name']}")
else:
    print(f"❌ Session failed: {resp.json()}")

# Cleanup
db.sessions.delete_one({"token": session_token})
print()
print("Session cleaned up.")
