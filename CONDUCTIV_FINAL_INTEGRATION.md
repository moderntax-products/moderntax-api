# Conductiv + ModernTax Integration Summary

## ✅ What is Working Now

### Live Production API
- **Endpoint:** https://moderntax-api-live.vercel.app/api/verify
- **API Key:** mt_prod_conductiv_2025_3c651d11d29e
- **Status:** LIVE and accepting requests
- **Response Time:** ~200ms

### What the API Does
1. Accepts Form 8821 data via POST request
2. Validates API key
3. Returns income verification data
4. Provides transcript PDF URLs
5. Includes tax years 2022-2023 data

## 📋 Required Fields from Conductiv

### IRS Form 8821 Requirements
These fields MUST be collected from the borrower:

1. **Taxpayer Information**
   - Full Legal Name
   - Social Security Number (SSN)
   - Current Mailing Address
   - Daytime Phone Number
   - Email Address

2. **Tax Information**
   - Tax Forms to Retrieve (1040, W-2, 1099, etc.)
   - Tax Years (typically 2022, 2023)

3. **Electronic Consent**
   - Electronic Signature (typed full name)
   - Consent Timestamp (when they agreed)
   - IP Address (for audit trail)

## 🧪 Test SSNs (No Charge)
- 000-00-0001 = High income ($150k)
- 000-00-0002 = Low income ($25k)
- 000-00-0003 = No records found

## 💰 Pricing
- 1-1,000 verifications/month: $45 each
- 1,001-5,000/month: $40 each
- 5,000+/month: $35 each

## 📞 Support
- Email: matt@moderntax.io
- Phone: 650-741-1085

## ✅ Ready for Testing
The API is live. Conductiv can start integration immediately with test SSNs.
