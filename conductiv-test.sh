#!/bin/bash

# Conductiv API Test Script

API_URL="https://moderntax-api-live.vercel.app/api/verify"
API_KEY="mt_prod_conductiv_2025_3c651d11d29e"

echo "Testing ModernTax API for Conductiv..."
echo ""

# Test with test SSN first
echo "Step 1: Testing with test SSN (000-00-0001)..."
curl -X POST $API_URL \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "use_case": "lending",
    "borrower": {
      "ssn": "000-00-0001",
      "first_name": "Test",
      "last_name": "User",
      "email": "test@conductiv.co",
      "dob": "1980-01-01"
    },
    "form_8821_data": {
      "taxpayer_name": "Test User",
      "taxpayer_ssn": "000-00-0001",
      "taxpayer_address": "123 Test St, San Francisco, CA 94105",
      "taxpayer_phone": "415-555-0100",
      "taxpayer_dob": "1980-01-01",
      "end_user_email": "test@conductiv.co",
      "tax_forms": ["1040", "W-2"],
      "tax_years": ["2023", "2022"],
      "taxpayer_signature": "Test User",
      "consent_timestamp": "2024-09-19T10:30:00Z",
      "ip_address": "192.168.1.1"
    },
    "platform_metadata": {
      "source": "conductiv",
      "client": "Test Bank",
      "client_id": "TEST001",
      "loan_id": "TEST-LOAN-001",
      "loan_officer": "Jane Smith",
      "loan_amount": 250000,
      "property_address": "456 Property St, SF, CA 94105"
    }
  }' | python3 -m json.tool

echo ""
echo "Test complete! For production, replace SSN with real SSN."
