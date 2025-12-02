/**
 * Centerstone CSV/Excel File Parser
 * Handles reading and parsing Excel files or CSV text
 */

import { CenterstoneCSVRow } from '../types/centerstone';

// ============================================================================
// CSV PARSING UTILITIES
// ============================================================================

/**
 * Parse CSV text content into array of objects
 * Handles both comma and semicolon delimiters
 */
export function parseCSVText(csvText: string): CenterstoneCSVRow[] {
  const lines = csvText.trim().split('\n');

  if (lines.length < 2) {
    throw new Error('CSV must have at least 2 lines (header + data)');
  }

  // Detect delimiter (comma or semicolon)
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';

  // Parse header
  const headers = parseCSVLine(headerLine, delimiter).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, '_')
  );

  // Parse data rows
  const rows: CenterstoneCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    const values = parseCSVLine(line, delimiter);

    // Build row object
    const row: CenterstoneCSVRow = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = values[j] ? values[j].trim() : '';

      if (value) {
        (row as any)[header] = value;
      }
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line (handles quoted values with commas)
 */
function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const values: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      // Field delimiter
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  values.push(current);

  return values;
}

// ============================================================================
// EXCEL FILE PARSING
// ============================================================================

/**
 * Parse Excel file (XLSX format) using SheetJS
 *
 * Installation: npm install xlsx
 *
 * Usage:
 *   import * as XLSX from 'xlsx';
 *   const workbook = XLSX.read(buffer, { type: 'buffer' });
 *   const rows = parseExcelFile(workbook);
 */
export function parseExcelFile(
  workbook: any,
  sheetIndex: number = 0
): CenterstoneCSVRow[] {
  try {
    const sheetNames = workbook.SheetNames;

    if (!sheetNames || sheetNames.length === 0) {
      throw new Error('Excel file has no sheets');
    }

    const sheetName = sheetNames[sheetIndex];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    // Convert sheet to array of objects
    // SheetJS docs: https://docs.sheetjs.com/docs/api/utilities/table
    // @ts-ignore - SheetJS types not always available
    const rows = XLSX.utils.sheet_to_json(worksheet) as CenterstoneCSVRow[];

    return rows;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${(error as Error).message}`);
  }
}

/**
 * Alternative: Parse Excel using simple approach if SheetJS not available
 * Assumes worksheet is already converted to JSON
 */
export function normalizeExcelRows(rows: any[]): CenterstoneCSVRow[] {
  return rows.map((row) => {
    const normalized: CenterstoneCSVRow = {};

    Object.keys(row).forEach((key) => {
      const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
      const value = row[key];

      // Skip null/undefined values
      if (value !== null && value !== undefined) {
        (normalized as any)[normalizedKey] = String(value).trim();
      }
    });

    return normalized;
  });
}

// ============================================================================
// FILE FORMAT DETECTION
// ============================================================================

/**
 * Detect file format from filename or MIME type
 */
export function detectFileFormat(
  filename: string
): 'csv' | 'xlsx' | 'xls' | 'unknown' {
  const ext = filename.toLowerCase().split('.').pop() || '';

  switch (ext) {
    case 'csv':
      return 'csv';
    case 'xlsx':
      return 'xlsx';
    case 'xls':
      return 'xls';
    default:
      return 'unknown';
  }
}

// ============================================================================
// FILE CONTENT DETECTION
// ============================================================================

/**
 * Detect if buffer is Excel file (XLSX)
 * Excel files start with specific magic bytes
 */
export function isExcelFile(buffer: Buffer): boolean {
  // XLSX files are ZIP files, start with PK
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return true;
  }

  // XLS files start with D0CF
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf) {
    return true;
  }

  return false;
}

/**
 * Check if content is valid CSV text
 */
export function isCSVContent(content: string): boolean {
  const lines = content.trim().split('\n');
  return lines.length >= 2;
}

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

/**
 * Convert parsed rows back to CSV format
 * Useful for error reports or re-uploading failed rows
 */
export function rowsToCSV(rows: CenterstoneCSVRow[]): string {
  if (rows.length === 0) return '';

  // Get all unique keys from all rows
  const keys = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => keys.add(key));
  });

  const headers = Array.from(keys);
  const headerLine = headers.join(',');

  // Convert rows to CSV
  const lines = [headerLine];

  rows.forEach((row) => {
    const values = headers.map((header) => {
      const value = (row as any)[header] || '';
      // Escape quotes and wrap in quotes if contains comma
      const escaped = String(value).replace(/"/g, '""');
      return escaped.includes(',') || escaped.includes('"')
        ? `"${escaped}"`
        : escaped;
    });
    lines.push(values.join(','));
  });

  return lines.join('\n');
}

/**
 * Sample CSV content for documentation/testing
 */
export function generateSampleCSV(): string {
  return `legal_name,TID,credit_application_id,email,loan_officer_name,entity_type,phone,loan_amount,expected_close_date,notes
Rya Tech Inc,47-1324567,SBA-2025-001,rahul@ryatech.com,Christopher Ahn,Business,(510) 555-1234,250000,2025-12-31,Manufacturing company
Samuel E Shearer,37-1124259,SBA-2025-002,samuel@example.com,Christopher Ahn,Individual,(415) 555-5678,50000,2025-11-30,Sole proprietor
Mirancce LLC,22-3673068,SBA-2025-003,prince@mirancce.com,Mathew Paek,Business,(650) 555-9999,100000,2025-12-15,Real estate`;
}
