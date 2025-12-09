#!/bin/bash

set -e

API_URL="https://moderntax-api-live.vercel.app"
API_KEY="mt_sandbox_emp_employercom_test123"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   MODERNTAX EMPLOYMENT VERIFICATION API - TEST SUITE          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

test_case() {
  echo ""
  echo -e "${YELLOW}[TEST]${NC} $1"
}

success() {
  echo -e "${GREEN}✓ PASSED${NC}: $1"
  ((PASSED++))
}

fail() {
  echo -e "${RED}✗ FAILED${NC}: $1"
  ((FAILED++))
}

# TEST 1: Single Employer
test_case "Single Employer Scenario (000-00-0001)"
RESPONSE=$(curl -s -X POST "$API_URL/api/v1/employment/verify" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"employee": {"ssn": "000-00-0001"}}')

if echo "$RESPONSE" | grep -q '"request_id"'; then
  success "Returns request_id"
else
  fail "Missing request_id"
fi

if echo "$RESPONSE" | grep -q '"total_employers":1'; then
  success "Total employers = 1"
else
  fail "Should have 1 employer"
fi

# TEST 2: Multi-Employer (CRITICAL)
test_case "Multi-Employer Scenario (000-00-0002) - CRITICAL"
RESPONSE=$(curl -s -X POST "$API_URL/api/v1/employment/verify" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"employee": {"ssn": "000-00-0002"}}')

if echo "$RESPONSE" | grep -q '"total_employers":3'; then
  success "Total employers = 3"
else
  fail "Should have 3 employers"
fi

if echo "$RESPONSE" | grep -q '"multi_employer_detected":true'; then
  success "multi_employer_detected = true"
else
  fail "multi_employer_detected should be true"
fi

if echo "$RESPONSE" | grep -q 'FIVE\|POTB\|NIVA'; then
  success "Real employer names present"
else
  fail "Employer names not found"
fi

# TEST 3: No Records
test_case "No Employment Records (000-00-0003)"
RESPONSE=$(curl -s -X POST "$API_URL/api/v1/employment/verify" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"employee": {"ssn": "000-00-0003"}}')

if echo "$RESPONSE" | grep -q '"employment_status":"no_records"'; then
  success "Status = no_records"
else
  fail "Status should be no_records"
fi

# TEST 4: Terminated
test_case "Terminated Employee (000-00-0004)"
RESPONSE=$(curl -s -X POST "$API_URL/api/v1/employment/verify" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"employee": {"ssn": "000-00-0004"}}')

if echo "$RESPONSE" | grep -q '"employment_status":"terminated"'; then
  success "Status = terminated"
else
  fail "Status should be terminated"
fi

# TEST 5: Invalid API Key
test_case "API Key Validation"
RESPONSE=$(curl -s -X POST "$API_URL/api/v1/employment/verify" \
  -H "X-API-Key: invalid_key" \
  -H "Content-Type: application/json" \
  -d '{"employee": {"ssn": "000-00-0001"}}')

if echo "$RESPONSE" | grep -q '"error"'; then
  success "Returns error for invalid API key"
else
  fail "Should reject invalid API key"
fi

# TEST 6: Missing SSN
test_case "Field Validation"
RESPONSE=$(curl -s -X POST "$API_URL/api/v1/employment/verify" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"employee": {}}')

if echo "$RESPONSE" | grep -q '"error"'; then
  success "Returns error for missing SSN"
else
  fail "Should return error for missing SSN"
fi

# TEST 7: Invalid SSN Format
test_case "SSN Format Validation"
RESPONSE=$(curl -s -X POST "$API_URL/api/v1/employment/verify" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"employee": {"ssn": "invalid"}}')

if echo "$RESPONSE" | grep -q '"error"'; then
  success "Returns error for invalid SSN format"
else
  fail "Should return error for invalid format"
fi

# TEST 8: Response Headers
test_case "Response Headers"
RESPONSE_HEADERS=$(curl -s -i -X POST "$API_URL/api/v1/employment/verify" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"employee": {"ssn": "000-00-0001"}}' 2>&1)

if echo "$RESPONSE_HEADERS" | grep -q "Content-Type.*application/json"; then
  success "Returns Content-Type header"
else
  fail "Missing Content-Type header"
fi

# TEST 9: CORS Headers
test_case "CORS Headers"
if echo "$RESPONSE_HEADERS" | grep -q "Access-Control-Allow-Origin"; then
  success "Returns CORS header"
else
  fail "Missing CORS header"
fi

# TEST 10: Status Endpoint
test_case "Status Endpoint"
REQUEST_ID=$(curl -s -X POST "$API_URL/api/v1/employment/verify" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"employee": {"ssn": "000-00-0001"}}' | grep -o '"request_id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ ! -z "$REQUEST_ID" ]; then
  STATUS_RESPONSE=$(curl -s -X GET "$API_URL/api/v1/employment/status/$REQUEST_ID" \
    -H "X-API-Key: $API_KEY")
  
  if echo "$STATUS_RESPONSE" | grep -q '"status"'; then
    success "Status endpoint working"
  else
    fail "Status endpoint not returning data"
  fi
else
  fail "Could not get request_id for status test"
fi

# SUMMARY
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                        TEST SUMMARY                            ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo -e "║ Passed: ${GREEN}$PASSED${NC}"
echo -e "║ Failed: ${RED}$FAILED${NC}"
echo "╚════════════════════════════════════════════════════════════════╝"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED - READY FOR BEN MONDAY${NC}"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  exit 1
fi
