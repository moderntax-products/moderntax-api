/**
 * IRS Transcript Delivery System - API Response Tests (Simplified Working Version)
 * Version: 2.0
 */

const {
  ResponseBuilder,
  ResponseTransformer,
  ApiResponseHandler,
  createResponseHandler
} = require('./api-response-standardizer');

// Test data
const mockRequestData = {
  request_id: 'req_1759763036842_xx5b2ck9m',
  status: 'completed',
  percent_complete: 100,
  taxpayer: {
    name: 'Gopal Swamy',
    ssn_last_four: '3338',
    tax_years: ['2024', '2023', '2022'],
    tax_forms: ['W-2', '1099', '1098', '5498'],
    filing_status: 'Married Filing Jointly'
  },
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
    file_1: 'https://nixzwnfjglojemozlvmf.supabase.co/storage/v1/object/public/irs-transcripts/req_1759763036842_xx5b2ck9m/108934923338-1.html',
    file_2: 'https://nixzwnfjglojemozlvmf.supabase.co/storage/v1/object/public/irs-transcripts/req_1759763036842_xx5b2ck9m/108934923338-2.html'
  },
  created_at: '2025-10-06T15:03:57.900443',
  completed_at: '2025-10-10T15:40:24.039Z',
  message: 'Transcripts successfully retrieved and processed',
  processing_time_ms: 2543,
  webhook_url: 'https://api.conductiv.co/webhooks/moderntax',
  source_ip: '192.168.1.100',
  api_key_used: 'mt_prod_conductiv_2025_3c651d11d29e'
};

// Run tests
console.log(`
╔════════════════════════════════════════════════════════════════╗
║   IRS TRANSCRIPT DELIVERY SYSTEM - API RESPONSE TEST SUITE    ║
║                      Version 2.0                              ║
╚════════════════════════════════════════════════════════════════╝
`);

let passedTests = 0;
let failedTests = 0;

// Test 1: Create response handler
console.log('\n📋 Test 1: Create Response Handler');
try {
  const handler = createResponseHandler({
    validateResponses: true,
    partnerName: 'conductiv'
  });
  console.log('✅ Response handler created successfully');
  passedTests++;
} catch (error) {
  console.log('❌ Failed to create response handler:', error.message);
  failedTests++;
}

// Test 2: Build status response (raw format)
console.log('\n📋 Test 2: Build Status Response (Raw Format)');
try {
  const statusResponse = ResponseBuilder.buildStatusResponse(mockRequestData);
  const requiredFields = ['request_id', 'timestamp', 'api_version', 'response_type', 'status', 
                          'percent_complete', 'taxpayer', 'transcripts', 'documents', 'urls'];
  const hasAllFields = requiredFields.every(field => field in statusResponse);
  
  if (hasAllFields) {
    console.log('✅ Status response has all required fields');
    console.log(`   - Request ID: ${statusResponse.request_id}`);
    console.log(`   - Status: ${statusResponse.status}`);
    console.log(`   - Response Type: ${statusResponse.response_type}`);
    passedTests++;
  } else {
    const missing = requiredFields.filter(field => !(field in statusResponse));
    console.log('❌ Status response missing fields:', missing.join(', '));
    failedTests++;
  }
} catch (error) {
  console.log('❌ Failed to build status response:', error.message);
  failedTests++;
}

// Test 3: Build webhook response
console.log('\n📋 Test 3: Build Webhook Response');
try {
  const webhookResponse = ResponseBuilder.buildWebhookResponse(mockRequestData, 'transcript.complete');
  if (webhookResponse.event_type === 'transcript.complete' && webhookResponse.status === 'completed') {
    console.log('✅ Webhook response built successfully');
    console.log(`   - Event Type: ${webhookResponse.event_type}`);
    console.log(`   - Status: ${webhookResponse.status}`);
    console.log(`   - Response Type: ${webhookResponse.response_type}`);
    passedTests++;
  } else {
    console.log('❌ Webhook response incorrect');
    failedTests++;
  }
} catch (error) {
  console.log('❌ Failed to build webhook response:', error.message);
  failedTests++;
}

// Test 4: Transform to Conductiv format
console.log('\n📋 Test 4: Transform to Conductiv Format');
try {
  const statusResponse = ResponseBuilder.buildStatusResponse(mockRequestData);
  const conductivFormat = ResponseTransformer.toPartnerFormat(statusResponse, 'conductiv');
  
  if (conductivFormat.transcripts_available && conductivFormat.status_url && conductivFormat.json_url) {
    console.log('✅ Conductiv format transformation successful');
    console.log(`   - Status URL: ${conductivFormat.status_url}`);
    console.log(`   - JSON URL: ${conductivFormat.json_url}`);
    console.log(`   - Transcripts Available: ${conductivFormat.transcripts_available}`);
    passedTests++;
  } else {
    console.log('❌ Conductiv format missing required fields');
    failedTests++;
  }
} catch (error) {
  console.log('❌ Failed to transform to Conductiv format:', error.message);
  failedTests++;
}

// Test 5: Handler with Conductiv format
console.log('\n📋 Test 5: Handler with Conductiv Format');
try {
  const handler = createResponseHandler({
    validateResponses: true,
    partnerName: 'conductiv'
  });
  
  const response = handler.handleStatusRequest(mockRequestData);
  
  if (response.request_id && response.transcripts_available !== undefined) {
    console.log('✅ Handler processed request successfully');
    console.log(`   - Format: Conductiv`);
    console.log(`   - Request ID: ${response.request_id}`);
    console.log(`   - Verification Complete: ${response.verification_complete}`);
    passedTests++;
  } else {
    console.log('❌ Handler response incorrect');
    failedTests++;
  }
} catch (error) {
  console.log('❌ Handler failed:', error.message);
  failedTests++;
}

// Test 6: Document response
console.log('\n📋 Test 6: Build Document Response');
try {
  const documentResponse = ResponseBuilder.buildDocumentResponse(mockRequestData);
  if (documentResponse.response_type === 'document' && documentResponse.transcripts) {
    console.log('✅ Document response built successfully');
    console.log(`   - Response Type: ${documentResponse.response_type}`);
    console.log(`   - Transcripts Count: ${documentResponse.transcripts.length}`);
    passedTests++;
  } else {
    console.log('❌ Document response incorrect');
    failedTests++;
  }
} catch (error) {
  console.log('❌ Failed to build document response:', error.message);
  failedTests++;
}

// Test 7: Compare response consistency
console.log('\n📋 Test 7: Response Consistency');
try {
  const statusResponse = ResponseBuilder.buildStatusResponse(mockRequestData);
  const webhookResponse = ResponseBuilder.buildWebhookResponse(mockRequestData, 'transcript.complete');
  
  // Check key fields match
  const consistencyCheck = 
    statusResponse.request_id === webhookResponse.request_id &&
    statusResponse.status === webhookResponse.status &&
    JSON.stringify(statusResponse.taxpayer) === JSON.stringify(webhookResponse.taxpayer) &&
    JSON.stringify(statusResponse.transcripts) === JSON.stringify(webhookResponse.transcripts);
  
  if (consistencyCheck) {
    console.log('✅ Status and webhook responses are consistent');
    passedTests++;
  } else {
    console.log('❌ Responses have inconsistent data');
    failedTests++;
  }
} catch (error) {
  console.log('❌ Consistency check failed:', error.message);
  failedTests++;
}

// Test 8: Income data aggregation
console.log('\n📋 Test 8: Income Data Aggregation');
try {
  const response = ResponseBuilder.buildStatusResponse(mockRequestData);
  const incomeSummary = response.documents.income_summary;
  
  if (incomeSummary && incomeSummary['2022'] && incomeSummary['2022'].adjusted_gross_income === 150000) {
    console.log('✅ Income data aggregation working correctly');
    console.log(`   - 2022 AGI: $${incomeSummary['2022'].adjusted_gross_income.toLocaleString()}`);
    passedTests++;
  } else {
    console.log('❌ Income data aggregation failed');
    failedTests++;
  }
} catch (error) {
  console.log('❌ Income aggregation error:', error.message);
  failedTests++;
}

// Print summary
const totalTests = passedTests + failedTests;
const successRate = ((passedTests / totalTests) * 100).toFixed(1);

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                        TEST SUMMARY                           ║
╚════════════════════════════════════════════════════════════════╝

Total Tests: ${totalTests}
Passed: ${passedTests} ✅
Failed: ${failedTests} ❌
Success Rate: ${successRate}%
`);

if (failedTests === 0) {
  console.log('🎉 All tests passed! The standardization module is working correctly.\n');
  console.log('Next steps:');
  console.log('1. Review MIGRATION_GUIDE.md for integration instructions');
  console.log('2. Update your API endpoints using examples from api-implementation.js');
  console.log('3. Test with your actual Conductiv webhook endpoint\n');
} else {
  console.log('⚠️  Some tests failed. Please check the errors above.\n');
}

// Export for use in other files
module.exports = {
  mockRequestData,
  runTests: () => {
    return {
      passed: passedTests,
      failed: failedTests,
      total: totalTests
    };
  }
};
