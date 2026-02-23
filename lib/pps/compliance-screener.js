/**
 * Server-side Compliance Screening Engine.
 * Ported from irs-batch-v5.js's screenTranscript() logic.
 *
 * Parses IRS transcript HTML and extracts:
 * - Financial data (gross receipts, income, deductions, etc.)
 * - Compliance flags (balance due, liens, levies, penalties, unfiled returns)
 * - Transaction codes with categorization
 * - Overall severity rating (CLEAN, INFO, WARNING, CRITICAL)
 */

import { JSDOM } from 'jsdom';

/**
 * Screen a single transcript HTML for compliance issues.
 *
 * @param {string} htmlString — Raw HTML from IRS SOR
 * @param {object} metadata — { name, tin, formType, taxYear, shortType }
 * @returns {object} Compliance finding with flags and financial data
 */
export function screenTranscript(htmlString, metadata = {}) {
  const dom = new JSDOM(htmlString);
  const doc = dom.window.document;
  const fullText = doc.body?.textContent || '';

  const finding = {
    taxpayerName: metadata.name || '',
    tin: metadata.tin || '',
    formType: metadata.formType || '',
    taxYear: metadata.taxYear || '',
    transcriptType: metadata.shortType || '',

    isBlank: false,
    hasBalanceDue: false,
    hasAccruedInterest: false,
    hasAccruedPenalty: false,
    hasLateFilingPenalty: false,
    hasUnderreportingNotice: false,
    hasCollectionAction: false,
    hasLien: false,
    hasLevy: false,
    hasAmendedReturn: false,
    hasExtension: false,
    isSubstitutedReturn: false,
    hasExamination: false,
    hasInstallmentAgreement: false,
    hasOfferInCompromise: false,
    hasMismatch: false,

    grossReceipts: null,
    totalIncome: null,
    totalDeductions: null,
    ordinaryIncome: null,
    totalAssets: null,
    totalTax: null,
    balanceDue: null,

    accountBalance: null,
    accruedInterest: null,
    accruedPenalty: null,
    accountBalancePlusAccruals: null,

    transactionCodes: [],
    flags: [],
    severity: 'CLEAN',
  };

  // No Record Filed
  if (fullText.match(/no record of return filed/i) ||
      fullText.match(/no tax return filed/i) ||
      fullText.match(/return not present/i)) {
    finding.isBlank = true;
    finding.flags.push({
      type: 'UNFILED',
      severity: 'CRITICAL',
      message: `No return filed for ${metadata.formType || 'form'} - Tax Year ${metadata.taxYear}`,
    });
  }

  // New-format: .item-container
  const itemContainers = doc.querySelectorAll('.item-container');
  itemContainers.forEach(container => {
    const label = container.querySelector('.item-label')?.textContent?.trim() || '';
    const value = container.querySelector('.item-value')?.textContent?.trim() || '';

    if (label.match(/^Account balance:/i)) finding.accountBalance = parseDollar(value);
    if (label.match(/Account balance plus accruals/i)) finding.accountBalancePlusAccruals = parseDollar(value);
    if (label.match(/Total Tax per Taxpayer/i)) finding.totalTax = parseDollar(value);
  });

  // Interest and penalty (new format)
  const interestPenalty = doc.querySelectorAll('.interest-and-penalty');
  interestPenalty.forEach(div => {
    const dts = div.querySelectorAll('dt');
    const dds = div.querySelectorAll('dd');
    dts.forEach((dt, idx) => {
      const label = dt.textContent.trim();
      const value = dds[idx]?.textContent?.trim() || '';
      if (label.match(/Accrued interest/i)) finding.accruedInterest = parseDollar(value);
      if (label.match(/Accrued penalty/i)) finding.accruedPenalty = parseDollar(value);
    });
  });

  // Old-format: table rows
  const allTDs = doc.querySelectorAll('td[scope="row"], td[valign="top"]');
  allTDs.forEach(td => {
    const label = td.textContent.trim().replace(/:\s*$/, '');
    const nextTd = td.nextElementSibling;
    const value = nextTd?.textContent?.trim() || '';

    if (label.match(/^GROSS RECEIPTS$/i)) finding.grossReceipts = parseDollar(value);
    if (label.match(/^TOTAL INCOME$/i)) finding.totalIncome = parseDollar(value);
    if (label.match(/^TOTAL DEDUCTIONS$/i)) finding.totalDeductions = parseDollar(value);
    if (label.match(/^ORDINARY INCOME/i) && !label.match(/OTHER/i)) finding.ordinaryIncome = parseDollar(value);
    if (label.match(/^TOTAL ASSETS$/i)) finding.totalAssets = parseDollar(value);
    if (label.match(/^TOTAL BALANCE DUE/i)) finding.balanceDue = parseDollar(value);
    if (label.match(/^BALANCE DUE OVERPAYMENT/i)) {
      const bal = parseDollar(value);
      if (bal !== null && bal > 0) finding.balanceDue = bal;
    }
  });

  // Transaction codes
  const txTable = doc.querySelector('#transaction-codes');
  if (txTable) {
    const rows = txTable.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const code = cells[0]?.textContent?.trim();
        const explanation = cells[1]?.textContent?.trim().split('\n')[0];
        const date = cells[3]?.textContent?.trim() || '';
        const amount = cells[4]?.textContent?.trim() || '';

        if (code) {
          finding.transactionCodes.push({ code, explanation, date, amount });
          const c = parseInt(code);

          if (c === 166 || c === 276) {
            finding.hasLateFilingPenalty = true;
            finding.flags.push({ type: 'PENALTY', severity: 'WARNING', message: `Late filing/payment penalty (TC ${code}) - ${amount} on ${date}` });
          }
          if (c === 922 || c === 290 || c === 291) {
            finding.hasUnderreportingNotice = true;
            finding.flags.push({ type: 'UNDERREPORTING', severity: 'WARNING', message: `Underreporting/adjustment notice (TC ${code}) - ${amount} on ${date}` });
          }
          if (c === 530 || c === 520 || c === 550) {
            finding.hasCollectionAction = true;
            finding.flags.push({ type: 'COLLECTION', severity: 'CRITICAL', message: `Collection action (TC ${code}: ${explanation}) on ${date}` });
          }
          if (c === 582 || c === 583) {
            finding.hasLien = true;
            finding.flags.push({ type: 'LIEN', severity: 'CRITICAL', message: `Federal tax lien (TC ${code}) filed on ${date}` });
          }
          if (c === 670 && explanation?.match(/levy/i)) {
            finding.hasLevy = true;
            finding.flags.push({ type: 'LEVY', severity: 'CRITICAL', message: `Levy action (TC ${code}) on ${date} - ${amount}` });
          }
          if (c === 977 || c === 290) finding.hasAmendedReturn = true;
          if (c === 460) finding.hasExtension = true;
          if (c === 150 && explanation?.match(/substitute/i)) {
            finding.isSubstitutedReturn = true;
            finding.flags.push({ type: 'SFR', severity: 'CRITICAL', message: `IRS filed Substitute for Return (SFR) on ${date}` });
          }
          if (c === 420 || c === 421) {
            finding.hasExamination = true;
            finding.flags.push({ type: 'AUDIT', severity: 'CRITICAL', message: `Examination/audit initiated (TC ${code}) on ${date}` });
          }
          if (c === 971 && explanation?.match(/installment/i)) {
            finding.hasInstallmentAgreement = true;
            finding.flags.push({ type: 'INSTALLMENT', severity: 'WARNING', message: `Installment agreement (TC ${code}) on ${date}` });
          }
          if (c === 480 || c === 481) {
            finding.hasOfferInCompromise = true;
            finding.flags.push({ type: 'OIC', severity: 'WARNING', message: `Offer in Compromise (TC ${code}) on ${date}` });
          }
        }
      }
    });
  }

  // Balance due check
  const effectiveBalance = finding.accountBalancePlusAccruals ?? finding.accountBalance ?? finding.balanceDue;
  if (effectiveBalance !== null && effectiveBalance > 0) {
    finding.hasBalanceDue = true;
    finding.flags.push({ type: 'BALANCE_DUE', severity: 'CRITICAL', message: `Outstanding balance due: ${formatDollar(effectiveBalance)}` });
  }

  // Accrued interest
  if (finding.accruedInterest !== null && finding.accruedInterest > 0) {
    finding.hasAccruedInterest = true;
    finding.flags.push({ type: 'INTEREST', severity: 'WARNING', message: `Accrued interest: ${formatDollar(finding.accruedInterest)}` });
  }

  // Accrued penalty
  if (finding.accruedPenalty !== null && finding.accruedPenalty > 0) {
    finding.hasAccruedPenalty = true;
    finding.flags.push({ type: 'PENALTY', severity: 'WARNING', message: `Accrued penalty: ${formatDollar(finding.accruedPenalty)}` });
  }

  // Income mismatch
  const returnIncome = extractField(fullText, /TOTAL INCOME:\s*\$([\d,.]+)/);
  const computerIncome = extractField(fullText, /TOTAL INCOME PER COMPUTER:\s*\$([\d,.]+)/);
  if (returnIncome !== null && computerIncome !== null && returnIncome !== computerIncome) {
    finding.hasMismatch = true;
    finding.flags.push({ type: 'MISMATCH', severity: 'WARNING', message: `Income mismatch: Reported ${formatDollar(returnIncome)} vs IRS computed ${formatDollar(computerIncome)}` });
  }

  // Zero gross receipts on business return
  if (finding.grossReceipts !== null && finding.grossReceipts === 0 &&
      !finding.isBlank && metadata.formType?.match(/1065|1120|Schedule C/i)) {
    finding.flags.push({ type: 'ZERO_INCOME', severity: 'INFO', message: `Business return shows $0 gross receipts for ${metadata.taxYear}` });
  }

  // Overall severity
  const severities = finding.flags.map(f => f.severity);
  if (severities.includes('CRITICAL')) finding.severity = 'CRITICAL';
  else if (severities.includes('WARNING')) finding.severity = 'WARNING';
  else if (severities.includes('INFO')) finding.severity = 'INFO';
  else finding.severity = 'CLEAN';

  return finding;
}

/**
 * Parse transcript HTML to extract metadata (name, TIN, form type, year, transcript type).
 */
export function parseTranscriptMetadata(htmlString) {
  const dom = new JSDOM(htmlString);
  const doc = dom.window.document;
  const fullText = doc.body?.textContent || '';
  const titleText = doc.querySelector('title')?.textContent || '';

  // Transcript type
  const titleEl = doc.querySelector('h1.transcript-title') || doc.querySelector('h2') || doc.querySelector('h3 b');
  let transcriptType = titleEl?.textContent?.trim() || titleText || 'Transcript';
  let shortType = 'Transcript';
  if (transcriptType.match(/Return Transcript/i)) shortType = 'Return Transcript';
  else if (transcriptType.match(/Account Transcript/i)) shortType = 'Account Transcript';
  else if (transcriptType.match(/Record of Account/i)) shortType = 'Record of Account';
  else if (transcriptType.match(/Wage and Income/i)) shortType = 'Wage and Income';

  let formType = '', tin = '', taxYear = '', taxpayerName = '';

  // New format
  const items = doc.querySelectorAll('.item-container');
  items.forEach(item => {
    const label = item.querySelector('.item-label')?.textContent?.trim() || '';
    const value = item.querySelector('.item-value')?.textContent?.trim() || '';

    if (label === 'Form Number:' || label === 'Form:') formType = value;
    if (label.includes('Taxpayer Identification Number')) tin = value;
    if (label.match(/Tax Period|Report for Tax Period/i)) {
      const m = value.match(/(\d{4})/);
      if (m) taxYear = m[1];
    }
    if (label && !value && label.length > 2 && label.length < 60 &&
        !label.includes(':') && !label.match(/^(Original|Duplicate|\d|FUDGE|1016)/)) {
      if (!taxpayerName) taxpayerName = label;
    }
  });

  // Old format fallback
  if (!formType || !tin || !taxYear) {
    const allBolds = doc.querySelectorAll('b, strong');
    allBolds.forEach(b => {
      const label = b.textContent.trim();
      const nextTd = b.closest('td')?.nextElementSibling;
      const value = nextTd?.textContent?.trim() || '';

      if (label.match(/Form Number/i)) formType = formType || value;
      if (label.match(/EIN Provided|SSN Provided|Taxpayer Identification/i)) tin = tin || value;
      if (label.match(/Tax Period/i)) {
        const m = value.match(/(\d{4})/);
        if (m) taxYear = taxYear || m[1];
      }
    });

    if (!formType) {
      const titleMatch = titleText.match(/(?:Tax Return Transcript|Account Transcript)\s*(?:--\s*)?(\d{4}[A-Z]?)/);
      if (titleMatch) formType = titleMatch[1];
    }
    if (!taxYear) {
      const titleMatch = titleText.match(/(\d{6})/);
      if (titleMatch) taxYear = titleMatch[1].substring(0, 4);
    }
    if (!taxpayerName) {
      const nameMatch = fullText.match(/NAME\(S\) SHOWN ON RETURN:\s*(.+?)(?:\n|$)/);
      if (nameMatch) taxpayerName = nameMatch[1].trim();
    }
  }

  return {
    name: taxpayerName || 'Unknown',
    tin,
    formType,
    taxYear,
    shortType,
    transcriptType,
    isNoRecord: fullText.match(/no record of return filed/i) !== null,
  };
}

// Helpers
function parseDollar(str) {
  if (!str) return null;
  const match = str.match(/[-]?\$?([\d,]+\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(/,/g, ''));
  return str.includes('-') ? -val : val;
}

function formatDollar(val) {
  if (val === null || val === undefined) return 'N/A';
  const abs = Math.abs(val);
  const formatted = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return val < 0 ? '-' + formatted : formatted;
}

function extractField(text, regex) {
  const m = text.match(regex);
  if (!m) return null;
  return parseFloat(m[1].replace(/,/g, ''));
}
