/**
 * IRS Transcript Delivery System - API Implementation
 * 
 * Implementation examples showing how to use the standardized response module
 * in your API endpoints to ensure consistent data structures
 * 
 * Author: ModernTax Engineering
 * Date: 2025-10-14
 * Version: 2.0
 */

const {
  ApiResponseHandler,
  ResponseBuilder,
  ResponseTransformer,
  createResponseHandler
} = require('./api-response-standardizer');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Create response handler with configuration
const responseHandler = createResponseHandler({
  validateResponses: true,        // Enable validation in development
  includeDebugInfo: process.env.NODE_ENV !== 'production',
  partnerName: 'conductiv',       // Default partner format
  apiVersion: '2.0'
});

// ============================================================================
// API ENDPOINT: /api/status/[requestId]
// ============================================================================

/**
 * Status endpoint implementation with standardized responses
 */
async function statusEndpoint(req, res) {
  const { requestId } = req.params;
  const apiKey = req.headers['x-api-key'];
  
  try {
    // Validate API key
    if (!validateApiKey(apiKey)) {
      return res.status(401).json({
        error: 'Invalid API key',
        timestamp: new Date().toISOString()
      });
    }
    
    // Get request data from database
    const requestData = await getRequestFromDatabase(requestId);
    
    if (!requestData) {
      return res.status(404).json({
        error: 'Request not found',
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Build standardized response
    const response = responseHandler.handleStatusRequest({
      request_id: requestData.request_id,
      status: requestData.status,
      percent_complete: requestData.percent_complete,
      taxpayer: {
        name: requestData.taxpayer_name,
        ssn_last_four: requestData.ssn_last_four,
        tax_years: requestData.tax_years,
        tax_forms: requestData.tax_forms,
        filing_status: requestData.filing_status
      },
      transcripts: requestData.transcripts,
      transcript_urls: requestData.transcript_urls,
      storage_urls: requestData.storage_urls,
      created_at: requestData.created_at,
      completed_at: requestData.completed_at,
      message: requestData.message,
      processing_time_ms: requestData.processing_time_ms,
      source_ip: req.ip,
      api_key_used: apiKey,
      environment: process.env.NODE_ENV || 'development'
    });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-API-Version', '2.0');
    res.setHeader('X-Request-ID', requestId);
    
    // Send response
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

// ============================================================================
// API ENDPOINT: /api/transcripts/[requestId]/json
// ============================================================================

/**
 * Document JSON endpoint with standardized responses
 */
async function documentJsonEndpoint(req, res) {
  const { requestId } = req.params;
  const apiKey = req.headers['x-api-key'];
  
  try {
    // Validate API key
    if (!validateApiKey(apiKey)) {
      return res.status(401).json({
        error: 'Invalid API key',
        timestamp: new Date().toISOString()
      });
    }
    
    // Get request data from database
    const requestData = await getRequestFromDatabase(requestId);
    
    if (!requestData) {
      return res.status(404).json({
        error: 'Request not found',
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Build standardized document response
    const response = responseHandler.handleDocumentRequest({
      request_id: requestData.request_id,
      taxpayer: {
        name: requestData.taxpayer_name,
        ssn_last_four: requestData.ssn_last_four,
        tax_years: requestData.tax_years,
        tax_forms: requestData.tax_forms
      },
      transcripts: requestData.transcripts,
      transcript_urls: requestData.transcript_urls,
      storage_urls: requestData.storage_urls
    });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-API-Version', '2.0');
    res.setHeader('X-Request-ID', requestId);
    
    // Send response
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('Document endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }
}

// ============================================================================
// API ENDPOINT: /api/transcripts/[requestId]/html
// ============================================================================

/**
 * HTML URLs endpoint with standardized responses
 */
async function documentHtmlEndpoint(req, res) {
  const { requestId } = req.params;
  const apiKey = req.headers['x-api-key'];
  
  try {
    // Validate API key
    if (!validateApiKey(apiKey)) {
      return res.status(401).json({
        error: 'Invalid API key',
        timestamp: new Date().toISOString()
      });
    }
    
    // Get request data from database
    const requestData = await getRequestFromDatabase(requestId);
    
    if (!requestData) {
      return res.status(404).json({
        error: 'Request not found',
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Build standardized HTML response
    const response = {
      request_id: requestData.request_id,
      timestamp: new Date().toISOString(),
      api_version: '2.0',
      response_type: 'html_urls',
      files: requestData.transcript_urls ? 
        Object.entries(requestData.transcript_urls).map(([key, url], index) => ({
          file_number: index + 1,
          file_key: key,
          url: url,
          description: `IRS Wage and Income Transcript - Page ${index + 1}`,
          access_type: 'public',
          content_type: 'text/html'
        })) : [],
      access_note: 'Files are publicly accessible. Click URLs to view or download HTML transcripts.',
      total_files: Object.keys(requestData.transcript_urls || {}).length
    };
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-API-Version', '2.0');
    res.setHeader('X-Request-ID', requestId);
    
    // Send response
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('HTML endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

/**
 * Send webhook notification with standardized format
 */
async function sendWebhookNotification(requestData) {
  try {
    // Check if webhook URL exists
    if (!requestData.webhook_url) {
      console.log('No webhook URL provided for request:', requestData.request_id);
      return null;
    }
    
    // Send webhook with standardized format
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
        storage_urls: requestData.storage_urls,
        created_at: requestData.created_at,
        completed_at: requestData.completed_at,
        message: requestData.message,
        processing_time_ms: requestData.processing_time_ms,
        webhook_url: requestData.webhook_url
      },
      requestData.webhook_url
    );
    
    if (result.success) {
      console.log(`Webhook sent successfully for request ${requestData.request_id}`);
      
      // Update database with webhook status
      await updateWebhookStatus(requestData.request_id, {
        webhook_sent: true,
        webhook_sent_at: new Date().toISOString(),
        webhook_response: result.webhook_result
      });
    } else {
      console.error(`Webhook failed for request ${requestData.request_id}:`, result.error);
      
      // Schedule retry
      await scheduleWebhookRetry(requestData.request_id, requestData.webhook_url);
    }
    
    return result;
    
  } catch (error) {
    console.error('Webhook notification error:', error);
    throw error;
  }
}

// ============================================================================
// PROCESSING PIPELINE
// ============================================================================

/**
 * Process transcript upload and trigger webhook
 */
async function processTranscriptUpload(requestId, files) {
  try {
    console.log(`Processing transcript upload for request ${requestId}`);
    
    // Update request status to processing
    await updateRequestStatus(requestId, {
      status: 'processing',
      percent_complete: 50,
      message: 'Processing uploaded transcripts'
    });
    
    // Parse transcript files
    const transcripts = [];
    for (const file of files) {
      const parsed = await parseTranscriptFile(file);
      transcripts.push({
        source_file: file.filename,
        tax_year: parsed.tax_year,
        forms: parsed.forms,
        metadata: {
          tracking_number: parsed.tracking_number,
          tax_period: parsed.tax_period,
          file_size_bytes: file.size,
          processed_at: new Date().toISOString()
        },
        income_data: parsed.income_data
      });
    }
    
    // Update request with transcript data
    const updatedRequest = await updateRequestStatus(requestId, {
      status: 'completed',
      percent_complete: 100,
      transcripts: transcripts,
      transcript_urls: files.reduce((acc, file, index) => {
        acc[`file_${index + 1}`] = file.public_url;
        return acc;
      }, {}),
      completed_at: new Date().toISOString(),
      message: 'Transcripts successfully retrieved and processed'
    });
    
    // Send webhook notification
    await sendWebhookNotification(updatedRequest);
    
    console.log(`Successfully processed request ${requestId}`);
    return updatedRequest;
    
  } catch (error) {
    console.error(`Error processing transcript upload for ${requestId}:`, error);
    
    // Update request status to failed
    await updateRequestStatus(requestId, {
      status: 'failed',
      percent_complete: 0,
      message: `Processing failed: ${error.message}`,
      error: error.message
    });
    
    throw error;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate API key
 */
function validateApiKey(apiKey) {
  const validKeys = [
    'mt_prod_conductiv_2025_3c651d11d29e',
    'mt_sandbox_conductiv_test',
    'mt_sandbox_emp_employercom_test123'
  ];
  
  return validKeys.includes(apiKey);
}

/**
 * Get request from database
 */
async function getRequestFromDatabase(requestId) {
  // This is a mock implementation
  // Replace with actual database query
  
  // Example data structure
  return {
    request_id: requestId,
    status: 'completed',
    percent_complete: 100,
    taxpayer_name: 'John Doe',
    ssn_last_four: '6789',
    tax_years: ['2024', '2023', '2022'],
    tax_forms: ['W-2', '1099', '1098', '5498'],
    filing_status: 'Married Filing Jointly',
    transcripts: [
      {
        source_file: '108934923338-1.html',
        tax_year: '2022',
        forms: [
          { type: 'W-2', description: 'Wage and Tax Statement' },
          { type: '1099', description: 'Miscellaneous Income' }
        ],
        metadata: {
          tracking_number: '108934923338',
          tax_period: 'December, 2022'
        },
        income_data: {
          adjusted_gross_income: 150000,
          wages_salaries: 130000,
          business_income: 20000,
          total_income: 150000
        }
      }
    ],
    transcript_urls: {
      file_1: 'https://nixzwnfjglojemozlvmf.supabase.co/storage/v1/object/public/irs-transcripts/req_xxx/file-1.html',
      file_2: 'https://nixzwnfjglojemozlvmf.supabase.co/storage/v1/object/public/irs-transcripts/req_xxx/file-2.html'
    },
    created_at: '2025-10-06T15:03:57.900443',
    completed_at: '2025-10-10T15:40:24.039Z',
    message: 'Transcripts successfully retrieved and processed',
    processing_time_ms: 2500,
    webhook_url: 'https://api.conductiv.co/webhooks/moderntax'
  };
}

/**
 * Update request status in database
 */
async function updateRequestStatus(requestId, updates) {
  // This is a mock implementation
  // Replace with actual database update
  
  console.log(`Updating request ${requestId}:`, updates);
  
  // Return updated request data
  return {
    request_id: requestId,
    ...updates,
    updated_at: new Date().toISOString()
  };
}

/**
 * Update webhook status in database
 */
async function updateWebhookStatus(requestId, webhookData) {
  // This is a mock implementation
  // Replace with actual database update
  
  console.log(`Updating webhook status for ${requestId}:`, webhookData);
  return true;
}

/**
 * Schedule webhook retry
 */
async function scheduleWebhookRetry(requestId, webhookUrl, retryCount = 0) {
  // This is a mock implementation
  // Replace with actual retry logic (e.g., using a job queue)
  
  const delays = [1000, 5000, 30000, 300000]; // 1s, 5s, 30s, 5m
  const delay = delays[Math.min(retryCount, delays.length - 1)];
  
  console.log(`Scheduling webhook retry for ${requestId} in ${delay}ms (attempt ${retryCount + 1})`);
  
  setTimeout(async () => {
    const requestData = await getRequestFromDatabase(requestId);
    requestData.webhook_retry_count = retryCount + 1;
    await sendWebhookNotification(requestData);
  }, delay);
}

/**
 * Parse transcript HTML file
 */
async function parseTranscriptFile(file) {
  // This is a mock implementation
  // Replace with actual HTML parsing logic
  
  return {
    tax_year: '2022',
    tracking_number: '108934923338',
    tax_period: 'December, 2022',
    forms: [
      { type: 'W-2', description: 'Wage and Tax Statement' },
      { type: '1099', description: 'Miscellaneous Income' }
    ],
    income_data: {
      adjusted_gross_income: 150000,
      wages_salaries: 130000,
      business_income: 20000,
      total_income: 150000
    }
  };
}

// ============================================================================
// EXPRESS.JS ROUTE SETUP EXAMPLE
// ============================================================================

/**
 * Example of setting up routes in Express.js
 */
function setupRoutes(app) {
  // Status endpoint
  app.get('/api/status/:requestId', statusEndpoint);
  
  // Document endpoints
  app.get('/api/transcripts/:requestId/json', documentJsonEndpoint);
  app.get('/api/transcripts/:requestId/html', documentHtmlEndpoint);
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      api_version: '2.0',
      environment: process.env.NODE_ENV || 'development'
    });
  });
  
  // API documentation endpoint
  app.get('/api/docs', (req, res) => {
    res.status(200).json({
      title: 'IRS Transcript Delivery System API',
      version: '2.0',
      base_url: 'https://moderntax-api-live.vercel.app',
      endpoints: [
        {
          path: '/api/status/:requestId',
          method: 'GET',
          description: 'Get complete status and transcript data'
        },
        {
          path: '/api/transcripts/:requestId/json',
          method: 'GET',
          description: 'Get parsed transcript data in JSON format'
        },
        {
          path: '/api/transcripts/:requestId/html',
          method: 'GET',
          description: 'Get URLs to raw HTML transcript files'
        }
      ],
      authentication: {
        type: 'API Key',
        header: 'X-API-Key',
        example: 'mt_prod_conductiv_2025_3c651d11d29e'
      }
    });
  });
}

// ============================================================================
// NEXT.JS API ROUTE EXAMPLE
// ============================================================================

/**
 * Example Next.js API route handler
 */
async function nextJsApiHandler(req, res) {
  const { method, query, headers, body } = req;
  const { requestId, format } = query;
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
  
  // Handle OPTIONS request
  if (method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Route to appropriate handler
  switch (format) {
    case 'json':
      return documentJsonEndpoint({ params: { requestId }, headers }, res);
    case 'html':
      return documentHtmlEndpoint({ params: { requestId }, headers }, res);
    default:
      return statusEndpoint({ params: { requestId }, headers }, res);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Endpoint handlers
  statusEndpoint,
  documentJsonEndpoint,
  documentHtmlEndpoint,
  
  // Processing functions
  sendWebhookNotification,
  processTranscriptUpload,
  
  // Utility functions
  validateApiKey,
  getRequestFromDatabase,
  updateRequestStatus,
  
  // Setup functions
  setupRoutes,
  nextJsApiHandler,
  
  // Response handler instance
  responseHandler
};
