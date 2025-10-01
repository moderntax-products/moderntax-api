# Conductiv Implementation Guide - ModernTax API

## Quick Start

Your production API is LIVE and ready for real SSN verifications.

### API Credentials
- Endpoint: https://moderntax-api-live.vercel.app/api/verify
- API Key: mt_prod_conductiv_2025_3c651d11d29e
- Method: POST

## Required Form 8821 Fields

You MUST collect these fields from the borrower:

1. taxpayer_name - Full legal name
2. taxpayer_ssn - Social Security Number (XXX-XX-XXXX)
3. taxpayer_address - Complete mailing address
4. taxpayer_phone - Daytime phone
5. taxpayer_dob - Date of birth (YYYY-MM-DD)
6. end_user_email - Email for notifications
7. tax_forms - Array of forms ["1040", "W-2"]
8. tax_years - Array of years ["2023", "2022"]
9. taxpayer_signature - Electronic signature
10. consent_timestamp - ISO 8601 timestamp
11. ip_address - User IP for audit

## Test First with Test SSN

Test SSN: 000-00-0001 (High income, no charge)

## Then Use Production SSN

Real SSNs will be charged $45 and take 30-60 seconds to process.

## Support

Email: matt@moderntax.io
Phone: 650-741-1085
