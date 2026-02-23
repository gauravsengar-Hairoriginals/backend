#!/bin/bash

# Configuration
API_URL="http://localhost:8082/api/v1"
TIMESTAMP=$(date +%s)
EMAIL="verify_user_${TIMESTAMP}@example.com"
PASSWORD="password123"
PHONE="999${TIMESTAMP: -7}" # Generate a 10-digit phone number

echo "Starting verification..."
echo "Registering user: $EMAIL / $PHONE"

# 1. Register User
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Verify User",
    "email": "'"$EMAIL"'",
    "phone": "'"$PHONE"'",
    "password": "'"$PASSWORD"'",
    "role": "stylist"
  }')

# Check for registration success (assuming it returns 201 and some user data)
if [[ $REGISTER_RESPONSE == *"error"* ]]; then
  echo "Registration failed: $REGISTER_RESPONSE"
  exit 1
fi

echo "User registered. Logging in..."

# 2. Login to get token
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "'"$EMAIL"'",
    "password": "'"$PASSWORD"'"
  }')

ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')

if [[ "$ACCESS_TOKEN" == "null" || -z "$ACCESS_TOKEN" ]]; then
  echo "Login failed. Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "Login successful. Token obtained."

# 3. Update Stylist Profile with Salon Details
echo "Updating stylist profile with salon details..."
SALON_NAME="Test Salon $TIMESTAMP"
SALON_ADDRESS="123 Test St"
OWNER_PHONE="888${TIMESTAMP: -7}"

UPDATE_RESPONSE=$(curl -s -X PATCH "$API_URL/profile/stylist" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "salonName": "'"$SALON_NAME"'",
    "salonAddress": "'"$SALON_ADDRESS"'",
    "salonCity": "Test City",
    "salonState": "Test State",
    "salonPincode": "123456",
    "ownerName": "Test Owner",
    "ownerPhone": "'"$OWNER_PHONE"'",
    "latitude": 12.345678,
    "longitude": 76.543210
  }')

# Check if update response contains error
if [[ $UPDATE_RESPONSE == *"error"* || $UPDATE_RESPONSE == *"statusCode"* ]]; then
  echo "Update failed: $UPDATE_RESPONSE"
  exit 1
fi

echo "Profile updated."

# 4. Get Profile to Verify
echo "Fetching profile to verify salon details..."
GET_RESPONSE=$(curl -s -X GET "$API_URL/profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

# 5. Check for Salon Name
RETRIEVED_SALON_NAME=$(echo $GET_RESPONSE | jq -r '.stylistProfile.salonName')

if [[ "$RETRIEVED_SALON_NAME" == "$SALON_NAME" ]]; then
  echo "SUCCESS: Retrieved salon name matches updated salon name: $RETRIEVED_SALON_NAME"
else
  echo "FAILURE: Retrieved salon name '$RETRIEVED_SALON_NAME' does not match expected '$SALON_NAME'"
  echo "Full Response: $GET_RESPONSE"
  exit 1
fi
