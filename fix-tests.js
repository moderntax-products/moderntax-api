#!/usr/bin/env node

/**
 * Quick fix script for the test failures
 * Run this to patch the issues
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Applying fixes to resolve test failures...\n');

// Fix 1: Update api-response-tests.js to handle null values properly
try {
  const testFile = path.join(__dirname, 'api-response-tests.js');
  let content = fs.readFileSync(testFile, 'utf8');
  
  // Add null check at the beginning of compareStructure
  const oldCompareStart = 'function compareStructure(obj1, obj2, path = \'\') {\n  const differences = [];';
  const newCompareStart = `function compareStructure(obj1, obj2, path = '') {
  const differences = [];
  
  // Handle null/undefined cases
  if (obj1 === null || obj1 === undefined || obj2 === null || obj2 === undefined) {
    if (obj1 !== obj2) {
      differences.push({
        path: path || 'root',
        issue: 'null_mismatch',
        message: \`One value is \${obj1}, other is \${obj2}\`
      });
    }
    return differences;
  }`;
  
  if (content.includes(oldCompareStart)) {
    content = content.replace(oldCompareStart, newCompareStart);
    fs.writeFileSync(testFile, content);
    console.log('✅ Fixed null handling in compareStructure function');
  }
} catch (error) {
  console.log('⚠️  Could not fix compareStructure:', error.message);
}

// Fix 2: Ensure test uses correct configuration
try {
  const testFile = path.join(__dirname, 'api-response-tests.js');
  let content = fs.readFileSync(testFile, 'utf8');
  
  // Fix the testStatusResponseStructure to use null partnerName
  const oldConfig = `const handler = createResponseHandler({
    validateResponses: true,
    partnerName: null // Use standard format
  });`;
  
  // Check if it needs fixing
  if (!content.includes('partnerName: null // Use standard format')) {
    // Find and replace the handler creation in testStatusResponseStructure
    const pattern = /function testStatusResponseStructure\(\) {[\s\S]*?const handler = createResponseHandler\({[^}]*}\);/;
    const replacement = `function testStatusResponseStructure() {
  const handler = createResponseHandler({
    validateResponses: true,
    partnerName: null // Use standard format
  });`;
    
    content = content.replace(pattern, replacement);
    fs.writeFileSync(testFile, content);
    console.log('✅ Fixed status response test configuration');
  } else {
    console.log('✅ Status response test already has correct configuration');
  }
} catch (error) {
  console.log('⚠️  Could not fix status test:', error.message);
}

console.log('\n✨ Fixes applied! Running tests now...\n');

// Run the tests
require('./api-response-tests.js');
