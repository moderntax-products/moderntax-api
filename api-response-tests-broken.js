

/**
 * Test 3: Compare status and webhook response consistency
 */
function testResponseConsistency() {
  // Build both responses using ResponseBuilder directly (not handler)
  const statusResponse = ResponseBuilder.buildStatusResponse(mockRequestData);
  const webhookResponse = ResponseBuilder.buildWebhookResponse(
    mockRequestData,
    'transcript.complete'
  );
  
  // Compare core data structures
  const corePaths = [
    'taxpayer',
    'transcripts',
    'documents',
    'urls'
  ];
  
  const differences = [];
  
  for (const path of corePaths) {
    const pathDiffs = compareStructure(
      statusResponse[path],
      webhookResponse[path],
      path
    );
    differences.push(...pathDiffs);
  }
  
  return {
    success: differences.length === 0,
    message: differences.length === 0
      ? 'Status and webhook responses have consistent structure'
      : `Found ${differences.length} structural differences`,
    details: differences.length > 0 ? { differences } : null
  };
}

/**
 * Test 4: Validate response validation
 */
function testResponseValidation() {
  // Test valid response
  const validResponse = ResponseBuilder.buildStatusResponse(mockRequestData);
  const validResult = ResponseValidator.validate(validResponse);
  
  // Test invalid response (missing required fields)
  const invalidResponse = {
    response_type: 'status',
    status: 'completed'
    // Missing request_id and timestamp
  };
  const invalidResult = ResponseValidator.validate(invalidResponse);
  
  return {
    success: validResult.valid && !invalidResult.valid,
    message: 'Response validation working correctly',
    details: {
      validResponse: validResult,
      invalidResponse: invalidResult
    }
  };
}

/**
 * Test 5: Test partner format transformation (Conductiv)
 */
function testConductivFormatTransformation() {
  const standardResponse = ResponseBuilder.buildStatusResponse(mockRequestData);
  const conductivFormat = ResponseTransformer.toPartnerFormat(
    standardResponse,
    'conductiv'
  );
  
  // Check Conductiv-specific fields
  const requiredFields = [
    'request_id',
    'status',
    'transcripts_available',
    'status_url',
    'json_url',
    'html_urls',
    'taxpayer_name',
    'tax_years',
    'tax_forms',
    'income_verification',
    'form_documents',
    'verification_complete',
    'timestamp'
  ];
  
  const missingFields = requiredFields.filter(field => !(field in conductivFormat));
  
  return {
    success: missingFields.length === 0,
    message: missingFields.length === 0
      ? 'Conductiv format transformation successful'
      : `Missing fields in Conductiv format`,
    details: missingFields.length > 0 ? { missingFields } : null
  };
}

/**
 * Test 6: Test document response structure
 */
function testDocumentResponseStructure() {
  const response = ResponseBuilder.buildDocumentResponse(mockRequestData);
  
  // Check structure
  const hasCorrectStructure = 
    response.response_type === 'document' &&
    response.taxpayer !== null &&
    Array.isArray(response.transcripts) &&
    response.documents !== null &&
    response.urls !== null;
  
  return {
    success: hasCorrectStructure,
    message: hasCorrectStructure
      ? 'Document response structure correct'
      : 'Document response structure incorrect',
    details: { response }
  };
}

/**
 * Test 7: Test legacy format transformation
 */
function testLegacyTransformation() {
  const legacyData = {
    request_id: 'req_old_format',
    status: 'completed',
    percent_complete: 100,
    taxpayer_name: 'John Doe',
    tax_years: ['2023', '2022'],
    tax_forms: ['W-2', '1099'],
    transcripts: [],
    transcript_urls: {
      file1: 'https://example.com/file1.html',
      file2: 'https://example.com/file2.html'
    },
    created_at: '2025-01-01T00:00:00Z',
    completed_at: '2025-01-01T01:00:00Z',
    message: 'Test message'
  };
  
  const transformed = ResponseTransformer.fromLegacy(legacyData, 'status');
  
  // Check if transformation maintains data
  const success = 
    transformed.request_id === legacyData.request_id &&
    transformed.status === legacyData.status &&
    transformed.taxpayer.name === legacyData.taxpayer_name &&
    transformed.urls.html_files.length === 2;
  
  return {
    success,
    message: success
      ? 'Legacy format transformation successful'
      : 'Legacy format transformation failed',
    details: { transformed }
  };
}

/**
 * Test 8: Test income data aggregation
 */
function testIncomeDataAggregation() {
  const response = ResponseBuilder.buildStatusResponse(mockRequestData);
  
  // Check income summary structure
  const incomeSummary = response.documents.income_summary;
  const has2022Data = incomeSummary['2022'] && 
    incomeSummary['2022'].adjusted_gross_income === 150000;
  const has2023Data = incomeSummary['2023'] && 
    incomeSummary['2023'].adjusted_gross_income === 165000;
  
  return {
    success: has2022Data && has2023Data,
    message: 'Income data aggregation working correctly',
    details: { incomeSummary }
  };
}

/**
 * Test 9: Test form categorization
 */
function testFormCategorization() {
  const response = ResponseBuilder.buildStatusResponse(mockRequestData);
  
  // Check forms are categorized by type
  const formsByType = response.documents.by_type;
  const hasW2 = formsByType['W-2'] && formsByType['W-2'].length === 2;
  const has1099 = formsByType['1099'] && formsByType['1099'].length === 1;
  const has1098 = formsByType['1098'] && formsByType['1098'].length === 1;
  
  return {
    success: hasW2 && has1099 && has1098,
    message: 'Form categorization working correctly',
    details: { 
      formsByType,
      availableForms: response.documents.available_forms
    }
  };
}

/**
 * Test 10: End-to-end consistency test
 */
function testEndToEndConsistency() {
  const handler = createResponseHandler({
    validateResponses: true,
    partnerName: 'conductiv'
  });
  
  // Generate all response types
  const statusResponse = handler.handleStatusRequest(mockRequestData);
  const documentResponse = handler.handleDocumentRequest(mockRequestData);
  
  // Build webhook response manually to compare
  const webhookResponse = ResponseTransformer.toPartnerFormat(
    ResponseBuilder.buildWebhookResponse(mockRequestData, 'transcript.complete'),
    'conductiv'
  );
  
  // Check key data consistency across all responses
  const allHaveRequestId = 
    statusResponse.request_id === mockRequestData.request_id &&
    documentResponse.request_id === mockRequestData.request_id &&
    webhookResponse.request_id === mockRequestData.request_id;
  
  const allHaveConsistentData = 
    statusResponse.taxpayer_name === mockRequestData.taxpayer.name &&
    webhookResponse.taxpayer_name === mockRequestData.taxpayer.name;
  
  return {
    success: allHaveRequestId && allHaveConsistentData,
    message: 'End-to-end consistency verified',
    details: {
      statusFormat: Object.keys(statusResponse),
      documentFormat: Object.keys(documentResponse),
      webhookFormat: Object.keys(webhookResponse)
    }
  };
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

function runAllTests() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║   IRS TRANSCRIPT DELIVERY SYSTEM - API RESPONSE TEST SUITE    ║
║                      Version 2.0                              ║
╚════════════════════════════════════════════════════════════════╝
`);

  const tests = [
    { name: 'Status Response Structure', fn: testStatusResponseStructure },
    { name: 'Webhook Response Structure', fn: testWebhookResponseStructure },
    { name: 'Response Consistency', fn: testResponseConsistency },
    { name: 'Response Validation', fn: testResponseValidation },
    { name: 'Conductiv Format Transformation', fn: testConductivFormatTransformation },
    { name: 'Document Response Structure', fn: testDocumentResponseStructure },
    { name: 'Legacy Format Transformation', fn: testLegacyTransformation },
    { name: 'Income Data Aggregation', fn: testIncomeDataAggregation },
    { name: 'Form Categorization', fn: testFormCategorization },
    { name: 'End-to-End Consistency', fn: testEndToEndConsistency }
  ];
  
  const results = [];
  let passedCount = 0;
  let failedCount = 0;
  
  for (const test of tests) {
    const result = runTest(test.name, test.fn);
    results.push({
      name: test.name,
      ...result
    });
    
    if (result.success) {
      passedCount++;
    } else {
      failedCount++;
    }
  }
  
  // Print summary
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                        TEST SUMMARY                           ║
╚════════════════════════════════════════════════════════════════╝

Total Tests: ${tests.length}
Passed: ${passedCount} ✅
Failed: ${failedCount} ❌
Success Rate: ${((passedCount / tests.length) * 100).toFixed(1)}%
`);

  // Print failed test details
  if (failedCount > 0) {
    console.log('FAILED TESTS:');
    console.log('─────────────');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`• ${r.name}`);
        if (r.error) console.log(`  Error: ${r.error}`);
        if (r.details) console.log(`  Details:`, r.details);
      });
  }
  
  return {
    total: tests.length,
    passed: passedCount,
    failed: failedCount,
    results
  };
}

// ============================================================================
// EXPORTS AND EXECUTION
// ============================================================================

// Run tests if executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
  runTest,
  compareStructure,
  
  // Individual test functions
  testStatusResponseStructure,
  testWebhookResponseStructure,
  testResponseConsistency,
  testResponseValidation,
  testConductivFormatTransformation,
  testDocumentResponseStructure,
  testLegacyTransformation,
  testIncomeDataAggregation,
  testFormCategorization,
  testEndToEndConsistency,
  
  // Test data
  mockRequestData
};
