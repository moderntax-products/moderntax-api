# IRS Transcript Delivery System - API Standardization Migration Guide

## Overview

This guide will help you integrate the new standardized API response format into your existing IRS Transcript Delivery System. The standardization ensures consistent data structures between status endpoints and webhooks for seamless integration with partners like Conductiv.

## What's New

### Key Improvements
1. **Consistent Response Structure**: All endpoints and webhooks now share the same data format
2. **Automatic Validation**: Built-in response validation to catch issues early
3. **Partner-Specific Formats**: Automatic transformation to partner formats (Conductiv, Employer.com)
4. **Better Error Handling**: Standardized error responses across all endpoints
5. **Enhanced Documentation**: Self-documenting response structures

## File Structure

```
/your-project-root/
├── api-response-standardizer.js    # Core standardization module
├── api-implementation.js           # Implementation examples
├── api-response-tests.js          # Test suite
└── pages/api/                     # Your existing API routes
    ├── status/
    │   └── [requestId].js         # Update this file
    ├── transcripts/
    │   └── [requestId]/
    │       ├── json.js            # Update this file
    │       └── html.js            # Update this file
    └── webhooks/
        └── process.js             # Update this file
```

## Migration Steps

### Step 1: Install the Standardization Module

Copy the three provided files to your project:

```bash
# Copy the standardization files to your project
cp api-response-standardizer.js ~/moderntax-api-live/
cp api-implementation.js ~/moderntax-api-live/
cp api-response-tests.js ~/moderntax-api-live/
```

### Step 2: Update Your Status Endpoint

**File**: `pages/api/status/[requestId].js`

**Before** (Current Implementation):
```javascript
export default async function handler(req, res) {
  const { requestId } = req.query;
  
  // Your existing logic
  const requestData = await getRequestData(requestId);
  
  // Old response format
  res.json({
    request_id: requestId,
    status: requestData.status,
    // ... other fields
  });
}
```

**After** (With Standardization):
```javascript
import { createResponseHandler } from '../../../api-response-standardizer';

// Create handler with your configuration
const responseHandler = createResponseHandler({
  validateResponses: true,
  partnerName: 'conductiv',
  apiVersion: '2.0'
});

export default async function handler(req, res) {
  const { requestId } = req.query;
  const apiKey = req.headers['x-api-key'];
  
  // Validate API key
  if (!isValidApiKey(apiKey)) {
    return res.status(401).json({
      error: 'Invalid API key',
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    // Get your existing data
    const requestData = await getRequestData(requestId);
    
    if (!requestData) {
      return res.status(404).json({
        error: 'Request not found',
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Use standardized response handler
    const response = responseHandler.handleStatusRequest({
      request_id: requestData.request_id,
      status: requestData.status,
      percent_complete: requestData.percent_complete,
      taxpayer: {
        name: requestData.taxpayer_name,
        ssn_last_four: requestData.ssn_last_four,
        tax_years: requestData.tax_years,
        tax_forms: requestData.tax_forms
      },
      transcripts: requestData.transcripts,
      transcript_urls: requestData.transcript_urls,
      created_at: requestData.created_at,
      completed_at: requestData.completed_at,
      message: requestData.message,
      source_ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      api_key_used: apiKey
    });
    
    // Set headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-API-Version', '2.0');
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('Status endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }
}
```

### Step 3: Update Your JSON Endpoint

**File**: `pages/api/transcripts/[requestId]/json.js`

**After** (With Standardization):
```javascript
import { createResponseHandler } from '../../../../api-response-standardizer';

const responseHandler = createResponseHandler({
  validateResponses: true,
  partnerName: 'conductiv'
});

export default async function handler(req, res) {
  const { requestId } = req.query;
  
  try {
    const requestData = await getRequestData(requestId);
    
    // Use standardized document response
    const response = responseHandler.handleDocumentRequest({
      request_id: requestData.request_id,
      taxpayer: {
        name: requestData.taxpayer_name,
        ssn_last_four: requestData.ssn_last_four,
        tax_years: requestData.tax_years,
        tax_forms: requestData.tax_forms
      },
      transcripts: requestData.transcripts,
      transcript_urls: requestData.transcript_urls
    });
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('JSON endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }
}
```

### Step 4: Update Your Webhook Handler

**File**: `pages/api/webhooks/process.js` (or wherever you handle webhooks)

**After** (With Standardization):
```javascript
import { createResponseHandler } from '../../../api-response-standardizer';

const responseHandler = createResponseHandler({
  validateResponses: true,
  partnerName: 'conductiv'
});

export async function sendWebhook(requestData) {
  if (!requestData.webhook_url) {
    console.log('No webhook URL for request:', requestData.request_id);
    return;
  }
  
  try {
    // Use standardized webhook handler
    const result = await responseHandler.handleWebhookNotification(
      {
        request_id: requestData.request_id,
        status: requestData.status,
        taxpayer: {
          name: requestData.taxpayer_name,
          ssn_last_four: requestData.ssn_last_four,
          tax_years: requestData.tax_years,
          tax_forms: requestData.tax_forms
        },
        transcripts: requestData.transcripts,
        transcript_urls: requestData.transcript_urls,
        created_at: requestData.created_at,
        completed_at: requestData.completed_at,
        message: requestData.message,
        webhook_url: requestData.webhook_url
      },
      requestData.webhook_url
    );
    
    if (result.success) {
      console.log(`Webhook sent successfully for ${requestData.request_id}`);
    } else {
      console.error(`Webhook failed for ${requestData.request_id}:`, result.error);
      // Implement retry logic here
    }
    
    return result;
    
  } catch (error) {
    console.error('Webhook error:', error);
    throw error;
  }
}
```

### Step 5: Update Your Upload Script

**File**: `upload_ready.js` or `convert_and_send.js`

Add webhook notification after processing:

```javascript
const { sendWebhookNotification } = require('./api-implementation');

// After uploading and processing files
async function processUpload(requestId, files) {
  // ... your existing upload logic ...
  
  // Update database with completed status
  const updatedRequest = await updateRequestStatus(requestId, {
    status: 'completed',
    percent_complete: 100,
    transcripts: parsedTranscripts,
    transcript_urls: fileUrls,
    completed_at: new Date().toISOString()
  });
  
  // Send standardized webhook
  await sendWebhookNotification(updatedRequest);
}
```

### Step 6: Environment Variables

Add these to your `.env` file:

```bash
# API Configuration
API_VERSION=2.0
WEBHOOK_SECRET=your_webhook_secret_here
NODE_ENV=production

# Partner Configuration
DEFAULT_PARTNER=conductiv
VALIDATE_RESPONSES=true
```

### Step 7: Run Tests

Test your migration:

```bash
# Run the test suite
node api-response-tests.js

# Test individual endpoints
curl -X GET https://moderntax-api-live.vercel.app/api/status/req_1759763036842_xx5b2ck9m \
  -H "X-API-Key: mt_prod_conductiv_2025_3c651d11d29e" \
  | jq .

# Compare old vs new response structure
node -e "
const old = require('./old-response.json');
const new = require('./new-response.json');
const { compareStructure } = require('./api-response-tests');
console.log(compareStructure(old, new));
"
```

## Response Format Comparison

### Old Format (Before Standardization)
```json
{
  "request_id": "req_xxx",
  "status": "completed",
  "taxpayer_name": "John Doe",
  "transcripts": [...],
  "transcript_urls": {...}
}
```

### New Standardized Format
```json
{
  "request_id": "req_xxx",
  "timestamp": "2025-10-14T12:00:00Z",
  "api_version": "2.0",
  "response_type": "status",
  "status": "completed",
  "percent_complete": 100,
  "taxpayer": {
    "name": "John Doe",
    "ssn_last_four": "6789",
    "tax_years": ["2023", "2022"],
    "tax_forms": ["W-2", "1099"]
  },
  "transcripts": [...],
  "documents": {
    "total_count": 3,
    "by_year": {...},
    "by_type": {...},
    "available_forms": ["W-2", "1099"],
    "income_summary": {...}
  },
  "urls": {
    "html_files": [...],
    "json_endpoint": "/api/transcripts/req_xxx/json",
    "status_endpoint": "/api/status/req_xxx"
  },
  "processing_info": {
    "created_at": "...",
    "completed_at": "...",
    "processing_time_ms": 2500
  },
  "metadata": {
    "source": "irs_pps",
    "environment": "production"
  }
}
```

### Conductiv-Specific Format (Automatically Transformed)
```json
{
  "request_id": "req_xxx",
  "status": "completed",
  "transcripts_available": true,
  "status_url": "https://moderntax-api-live.vercel.app/api/status/req_xxx",
  "json_url": "https://moderntax-api-live.vercel.app/api/transcripts/req_xxx/json",
  "html_urls": [...],
  "taxpayer_name": "John Doe",
  "tax_years": ["2023", "2022"],
  "income_verification": {...},
  "verification_complete": true,
  "timestamp": "2025-10-14T12:00:00Z"
}
```

## Deployment Checklist

- [ ] Copy standardization files to project
- [ ] Update all API endpoints
- [ ] Update webhook handlers
- [ ] Add environment variables
- [ ] Run test suite
- [ ] Test with Postman/curl
- [ ] Deploy to Vercel staging
- [ ] Test webhook delivery
- [ ] Monitor logs for errors
- [ ] Deploy to production
- [ ] Notify Conductiv of update
- [ ] Update API documentation

## Rollback Plan

If issues occur after deployment:

1. **Quick Rollback**: Revert to previous deployment on Vercel
```bash
vercel rollback
```

2. **Code Rollback**: Remove standardization and restore old handlers
```bash
git revert HEAD
vercel --prod
```

3. **Partial Rollback**: Keep standardization but disable validation
```javascript
const responseHandler = createResponseHandler({
  validateResponses: false,  // Disable validation
  partnerName: null         // Use raw format
});
```

## Support & Troubleshooting

### Common Issues

**Issue**: Webhook not sending
**Solution**: Check `webhook_url` is present in request data

**Issue**: Validation errors in logs
**Solution**: Check all required fields are being passed to handler

**Issue**: Partner receiving wrong format
**Solution**: Verify `partnerName` configuration is correct

**Issue**: Old clients breaking
**Solution**: Use legacy transformation:
```javascript
const { ResponseTransformer } = require('./api-response-standardizer');
const standardResponse = ResponseTransformer.fromLegacy(oldData);
```

### Debug Mode

Enable debug mode for detailed logging:

```javascript
const responseHandler = createResponseHandler({
  validateResponses: true,
  includeDebugInfo: true,  // Adds _debug field to responses
  partnerName: 'conductiv'
});
```

### Monitoring

Monitor these metrics after deployment:
- Response time (should be <200ms)
- Error rate (should be <1%)
- Webhook delivery success rate
- API validation warnings

## Next Steps

1. **Phase 1** (Week 1): Deploy to staging, test with Conductiv
2. **Phase 2** (Week 2): Deploy to production with monitoring
3. **Phase 3** (Week 3): Add support for additional partners
4. **Phase 4** (Month 2): Add advanced features (batch processing, async queues)

## Contact

For questions or issues:
- **Technical Lead**: matt@moderntax.io
- **Documentation**: This guide + code comments
- **Support**: Create issue in project repository

---

**Last Updated**: October 14, 2025  
**Version**: 2.0  
**Status**: Ready for Integration
