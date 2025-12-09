/**
 * IRS Transcript Delivery System - Standardized API Response Module
 * 
 * This module ensures consistent data structures between all API endpoints and webhooks
 * for seamless integration with partners like Conductiv
 * 
 * Author: ModernTax Engineering
 * Date: 2025-10-14
 * Version: 2.0
 */

// ============================================================================
// STANDARDIZED RESPONSE SCHEMAS
// ============================================================================

/**
 * Base Response Schema
 * All API responses inherit from this structure
 */
class BaseResponse {
  constructor(requestId) {
    this.request_id = requestId;
    this.timestamp = new Date().toISOString();
    this.api_version = "2.0";
    this.response_type = "base";
  }
}

/**
 * Status Response Schema
 * Used for /api/status/[requestId] endpoint
 */
class StatusResponse extends BaseResponse {
  constructor(requestId) {
    super(requestId);
    this.response_type = "status";
    this.status = "pending"; // pending | processing | completed | failed
    this.percent_complete = 0;
    this.taxpayer = null;
    this.transcripts = [];
    this.documents = {};
    this.metadata = {};
    this.processing_info = {};
    this.urls = {};
  }
}

/**
 * Webhook Response Schema
 * Used for webhook notifications
 */
class WebhookResponse extends BaseResponse {
  constructor(requestId) {
    super(requestId);
    this.response_type = "webhook";
    this.event_type = "transcript.update"; // transcript.update | transcript.complete | transcript.failed
    this.status = "pending";
    this.taxpayer = null;
    this.transcripts = [];
    this.documents = {};
    this.metadata = {};
    this.urls = {};
  }
}

/**
 * Document Response Schema
 * Used for /api/transcripts/[requestId]/json endpoint
 */
class DocumentResponse extends BaseResponse {
  constructor(requestId) {
    super(requestId);
    this.response_type = "document";
    this.taxpayer = null;
    this.transcripts = [];
    this.documents = {};
    this.urls = {};
  }
}

// ============================================================================
// STANDARDIZED DATA STRUCTURES
// ============================================================================

/**
 * Taxpayer Information Structure
 */
class TaxpayerInfo {
  constructor(data = {}) {
    this.name = data.name || null;
    this.ssn_last_four = data.ssn_last_four || null;
    this.tax_years = data.tax_years || [];
    this.tax_forms = data.tax_forms || [];
    this.filing_status = data.filing_status || null;
    this.address = data.address || null;
  }
}

/**
 * Transcript Structure
 */
class Transcript {
  constructor(data = {}) {
    this.source_file = data.source_file || null;
    this.tax_year = data.tax_year || null;
    this.forms = data.forms || [];
    this.metadata = {
      tracking_number: data.tracking_number || null,
      tax_period: data.tax_period || null,
      processed_at: data.processed_at || new Date().toISOString(),
      file_size_bytes: data.file_size_bytes || null,
      page_count: data.page_count || null
    };
    this.income_data = data.income_data || null;
  }
}

/**
 * Form Structure
 */
class FormInfo {
  constructor(data = {}) {
    this.type = data.type || null; // W-2, 1099, 1098, 5498, 1040, etc.
    this.description = data.description || null;
    this.employer = data.employer || null;
    this.payer = data.payer || null;
    this.amount = data.amount || null;
    this.tax_year = data.tax_year || null;
  }
}

/**
 * Income Data Structure
 */
class IncomeData {
  constructor(data = {}) {
    this.adjusted_gross_income = data.adjusted_gross_income || null;
    this.wages_salaries = data.wages_salaries || null;
    this.business_income = data.business_income || null;
    this.capital_gains = data.capital_gains || null;
    this.other_income = data.other_income || null;
    this.total_income = data.total_income || null;
    this.refund_amount = data.refund_amount || null;
    this.amount_owed = data.amount_owed || null;
  }
}

/**
 * Document URLs Structure
 */
class DocumentUrls {
  constructor(data = {}) {
    this.html_files = data.html_files || [];
    this.json_endpoint = data.json_endpoint || null;
    this.pdf_download = data.pdf_download || null;
    this.status_endpoint = data.status_endpoint || null;
    this.storage_urls = data.storage_urls || {};
  }
}

/**
 * Processing Information Structure
 */
class ProcessingInfo {
  constructor(data = {}) {
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = new Date().toISOString();
    this.completed_at = data.completed_at || null;
    this.estimated_completion = data.estimated_completion || null;
    this.processing_time_ms = data.processing_time_ms || null;
    this.message = data.message || "Request received";
    this.error = data.error || null;
    this.retry_count = data.retry_count || 0;
  }
}

// ============================================================================
// RESPONSE BUILDER
// ============================================================================

class ResponseBuilder {
  /**
   * Build standardized status response
   */
  static buildStatusResponse(requestData) {
    const response = new StatusResponse(requestData.request_id);
    
    // Set status and progress
    response.status = requestData.status || "pending";
    response.percent_complete = requestData.percent_complete || 0;
    
    // Add taxpayer information
    if (requestData.taxpayer) {
      response.taxpayer = new TaxpayerInfo(requestData.taxpayer);
    }
    
    // Add transcripts
    if (requestData.transcripts && Array.isArray(requestData.transcripts)) {
      response.transcripts = requestData.transcripts.map(t => new Transcript(t));
    }
    
    // Add documents
    response.documents = this.buildDocumentsSection(requestData);
    
    // Add URLs
    response.urls = new DocumentUrls({
      html_files: requestData.transcript_urls || [],
      json_endpoint: `/api/transcripts/${requestData.request_id}/json`,
      status_endpoint: `/api/status/${requestData.request_id}`,
      storage_urls: requestData.storage_urls || {}
    });
    
    // Add processing info
    response.processing_info = new ProcessingInfo({
      created_at: requestData.created_at,
      completed_at: requestData.completed_at,
      message: requestData.message,
      processing_time_ms: requestData.processing_time_ms
    });
    
    // Add metadata
    response.metadata = {
      source: requestData.source || "irs_pps",
      environment: requestData.environment || "production",
      api_key_used: requestData.api_key_used ? "***" + requestData.api_key_used.slice(-4) : null,
      request_source_ip: requestData.source_ip || null
    };
    
    return response;
  }
  
  /**
   * Build standardized webhook response
   */
  static buildWebhookResponse(requestData, eventType = "transcript.complete") {
    const response = new WebhookResponse(requestData.request_id);
    
    // Set event type and status
    response.event_type = eventType;
    response.status = requestData.status || "completed";
    
    // Add taxpayer information
    if (requestData.taxpayer) {
      response.taxpayer = new TaxpayerInfo(requestData.taxpayer);
    }
    
    // Add transcripts
    if (requestData.transcripts && Array.isArray(requestData.transcripts)) {
      response.transcripts = requestData.transcripts.map(t => new Transcript(t));
    }
    
    // Add documents
    response.documents = this.buildDocumentsSection(requestData);
    
    // Add URLs
    response.urls = new DocumentUrls({
      html_files: requestData.transcript_urls || [],
      json_endpoint: `/api/transcripts/${requestData.request_id}/json`,
      status_endpoint: `/api/status/${requestData.request_id}`,
      storage_urls: requestData.storage_urls || {}
    });
    
    // Add metadata
    response.metadata = {
      webhook_sent_at: new Date().toISOString(),
      webhook_url: requestData.webhook_url || null,
      webhook_retry_count: requestData.webhook_retry_count || 0,
      processing_time_ms: requestData.processing_time_ms || null
    };
    
    return response;
  }
  
  /**
   * Build standardized document response
   */
  static buildDocumentResponse(requestData) {
    const response = new DocumentResponse(requestData.request_id);
    
    // Add taxpayer information
    if (requestData.taxpayer) {
      response.taxpayer = new TaxpayerInfo(requestData.taxpayer);
    }
    
    // Add transcripts
    if (requestData.transcripts && Array.isArray(requestData.transcripts)) {
      response.transcripts = requestData.transcripts.map(t => new Transcript(t));
    }
    
    // Add documents
    response.documents = this.buildDocumentsSection(requestData);
    
    // Add URLs
    response.urls = new DocumentUrls({
      html_files: requestData.transcript_urls || [],
      storage_urls: requestData.storage_urls || {}
    });
    
    return response;
  }
  
  /**
   * Build documents section
   */
  static buildDocumentsSection(requestData) {
    const documents = {
      total_count: 0,
      by_year: {},
      by_type: {},
      available_forms: [],
      income_summary: {}
    };
    
    if (requestData.transcripts && Array.isArray(requestData.transcripts)) {
      // Count total documents
      documents.total_count = requestData.transcripts.length;
      
      // Organize by year and type
      requestData.transcripts.forEach(transcript => {
        const year = transcript.tax_year || "unknown";
        
        // By year
        if (!documents.by_year[year]) {
          documents.by_year[year] = [];
        }
        documents.by_year[year].push(transcript);
        
        // By form type
        if (transcript.forms) {
          transcript.forms.forEach(form => {
            const formType = form.type;
            if (!documents.by_type[formType]) {
              documents.by_type[formType] = [];
            }
            documents.by_type[formType].push({
              year: year,
              ...form
            });
            
            // Track available forms
            if (!documents.available_forms.includes(formType)) {
              documents.available_forms.push(formType);
            }
          });
        }
        
        // Add income summary
        if (transcript.income_data) {
          documents.income_summary[year] = new IncomeData(transcript.income_data);
        }
      });
    }
    
    return documents;
  }
}

// ============================================================================
// RESPONSE VALIDATOR
// ============================================================================

class ResponseValidator {
  /**
   * Validate response structure
   */
  static validate(response) {
    const errors = [];
    const warnings = [];
    
    // Check required fields
    if (!response.request_id) {
      errors.push("Missing required field: request_id");
    }
    
    if (!response.timestamp) {
      errors.push("Missing required field: timestamp");
    }
    
    if (!response.api_version) {
      warnings.push("Missing api_version field");
    }
    
    // Check response type specific validations
    switch (response.response_type) {
      case "status":
        this.validateStatusResponse(response, errors, warnings);
        break;
      case "webhook":
        this.validateWebhookResponse(response, errors, warnings);
        break;
      case "document":
        this.validateDocumentResponse(response, errors, warnings);
        break;
      default:
        warnings.push(`Unknown response type: ${response.response_type}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  static validateStatusResponse(response, errors, warnings) {
    if (!response.status) {
      errors.push("Status response missing 'status' field");
    }
    
    if (response.percent_complete === undefined) {
      warnings.push("Status response missing 'percent_complete' field");
    }
    
    if (!response.processing_info) {
      warnings.push("Status response missing 'processing_info' section");
    }
  }
  
  static validateWebhookResponse(response, errors, warnings) {
    if (!response.event_type) {
      errors.push("Webhook response missing 'event_type' field");
    }
    
    if (!response.metadata || !response.metadata.webhook_sent_at) {
      warnings.push("Webhook response missing webhook timestamp");
    }
  }
  
  static validateDocumentResponse(response, errors, warnings) {
    if (!response.transcripts || response.transcripts.length === 0) {
      warnings.push("Document response has no transcripts");
    }
    
    if (!response.urls) {
      warnings.push("Document response missing 'urls' section");
    }
  }
}

// ============================================================================
// RESPONSE TRANSFORMER
// ============================================================================

class ResponseTransformer {
  /**
   * Transform legacy response to standardized format
   */
  static fromLegacy(legacyData, responseType = "status") {
    const standardData = {
      request_id: legacyData.request_id || legacyData.id,
      status: legacyData.status,
      percent_complete: legacyData.percent_complete,
      taxpayer: {
        name: legacyData.taxpayer_name,
        tax_years: legacyData.tax_years,
        tax_forms: legacyData.tax_forms,
        ssn_last_four: legacyData.ssn_last_four
      },
      transcripts: legacyData.transcripts || [],
      transcript_urls: legacyData.transcript_urls 
        ? Object.values(legacyData.transcript_urls)
        : [],
      created_at: legacyData.created_at,
      completed_at: legacyData.completed_at,
      message: legacyData.message,
      source_ip: legacyData.ip_address,
      webhook_url: legacyData.webhook_url
    };
    
    switch (responseType) {
      case "status":
        return ResponseBuilder.buildStatusResponse(standardData);
      case "webhook":
        return ResponseBuilder.buildWebhookResponse(standardData);
      case "document":
        return ResponseBuilder.buildDocumentResponse(standardData);
      default:
        return ResponseBuilder.buildStatusResponse(standardData);
    }
  }
  
  /**
   * Convert standardized response to partner-specific format
   */
  static toPartnerFormat(standardResponse, partnerName = "conductiv") {
    switch (partnerName.toLowerCase()) {
      case "conductiv":
        return this.toConductivFormat(standardResponse);
      case "employercom":
        return this.toEmployercomFormat(standardResponse);
      default:
        return standardResponse;
    }
  }
  
  /**
   * Convert to Conductiv format
   */
  static toConductivFormat(response) {
    return {
      request_id: response.request_id,
      status: response.status,
      transcripts_available: response.status === "completed",
      status_url: `https://moderntax-api-live.vercel.app${response.urls?.status_endpoint}`,
      json_url: `https://moderntax-api-live.vercel.app${response.urls?.json_endpoint}`,
      html_urls: response.urls?.html_files || [],
      taxpayer_name: response.taxpayer?.name,
      tax_years: response.taxpayer?.tax_years,
      tax_forms: response.taxpayer?.tax_forms,
      income_verification: response.documents?.income_summary,
      form_documents: response.documents?.available_forms?.map(formType => ({
        form_type: formType,
        count: response.documents.by_type[formType]?.length || 0
      })),
      verification_complete: response.status === "completed",
      timestamp: response.timestamp
    };
  }
  
  /**
   * Convert to Employer.com format
   */
  static toEmployercomFormat(response) {
    // Implementation for Employer.com format
    return {
      request_id: response.request_id,
      status: response.status,
      employment_verification: {
        // Map employment-specific fields
      },
      timestamp: response.timestamp
    };
  }
}

// ============================================================================
// API RESPONSE HANDLER
// ============================================================================

class ApiResponseHandler {
  constructor(config = {}) {
    this.config = {
      validateResponses: config.validateResponses !== false,
      includeDebugInfo: config.includeDebugInfo || false,
      partnerName: config.partnerName || "conductiv",
      apiVersion: config.apiVersion || "2.0"
    };
  }
  
  /**
   * Handle status endpoint response
   */
  handleStatusRequest(requestData) {
    // Build standardized response
    const response = ResponseBuilder.buildStatusResponse(requestData);
    
    // Validate if enabled
    if (this.config.validateResponses) {
      const validation = ResponseValidator.validate(response);
      if (!validation.valid) {
        console.error("Response validation failed:", validation.errors);
        if (this.config.includeDebugInfo) {
          response._debug = validation;
        }
      }
    }
    
    // Transform to partner format if needed
    if (this.config.partnerName) {
      return ResponseTransformer.toPartnerFormat(response, this.config.partnerName);
    }
    
    return response;
  }
  
  /**
   * Handle webhook notification
   */
  async handleWebhookNotification(requestData, webhookUrl) {
    // Build standardized response
    const response = ResponseBuilder.buildWebhookResponse(
      requestData, 
      requestData.status === "completed" ? "transcript.complete" : "transcript.update"
    );
    
    // Validate if enabled
    if (this.config.validateResponses) {
      const validation = ResponseValidator.validate(response);
      if (!validation.valid) {
        console.error("Webhook validation failed:", validation.errors);
      }
    }
    
    // Transform to partner format
    const partnerResponse = ResponseTransformer.toPartnerFormat(
      response, 
      this.config.partnerName
    );
    
    // Send webhook
    try {
      const webhookResult = await this.sendWebhook(webhookUrl, partnerResponse);
      return {
        success: true,
        response: partnerResponse,
        webhook_result: webhookResult
      };
    } catch (error) {
      console.error("Webhook send failed:", error);
      return {
        success: false,
        response: partnerResponse,
        error: error.message
      };
    }
  }
  
  /**
   * Handle document request
   */
  handleDocumentRequest(requestData) {
    // Build standardized response
    const response = ResponseBuilder.buildDocumentResponse(requestData);
    
    // Validate if enabled
    if (this.config.validateResponses) {
      const validation = ResponseValidator.validate(response);
      if (!validation.valid) {
        console.error("Document response validation failed:", validation.errors);
      }
    }
    
    // Transform to partner format if needed
    if (this.config.partnerName) {
      return ResponseTransformer.toPartnerFormat(response, this.config.partnerName);
    }
    
    return response;
  }
  
  /**
   * Send webhook notification
   */
  async sendWebhook(webhookUrl, data) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ModernTax-Signature': this.generateWebhookSignature(data),
        'X-ModernTax-Timestamp': new Date().toISOString(),
        'X-ModernTax-Version': this.config.apiVersion
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }
    
    return {
      status: response.status,
      statusText: response.statusText,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Generate webhook signature
   */
  generateWebhookSignature(data) {
    const crypto = require('crypto');
    const secret = process.env.WEBHOOK_SECRET || 'default_secret';
    const payload = JSON.stringify(data);
    
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Response Classes
  BaseResponse,
  StatusResponse,
  WebhookResponse,
  DocumentResponse,
  
  // Data Structure Classes
  TaxpayerInfo,
  Transcript,
  FormInfo,
  IncomeData,
  DocumentUrls,
  ProcessingInfo,
  
  // Utility Classes
  ResponseBuilder,
  ResponseValidator,
  ResponseTransformer,
  ApiResponseHandler,
  
  // Factory function for easy usage
  createResponseHandler: (config) => new ApiResponseHandler(config)
};
