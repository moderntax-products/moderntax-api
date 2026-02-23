// =====================================================
// IRS BATCH TRANSCRIPT DOWNLOADER v6
// =====================================================
// Downloads transcripts from IRS SOR inbox, runs
// compliance screening, and uploads to ModernTax API.
//
// Changes from v5:
// - Uploads transcript HTML to ModernTax API
// - Server-side compliance screening
// - Auto-notifies lender clients when ready
// - Fixes first-transcript skip bug
// - Adds upload toggle and API config
// =====================================================

(async function() {
    if (!location.href.includes('list_mail.jsp')) {
        alert('Run this on the IRS Inbox page!');
        return;
    }

    const delay = ms => new Promise(r => setTimeout(r, ms));

    // ==================================================
    // CONFIGURATION - SET THESE BEFORE RUNNING
    // ==================================================
    const CONFIG = {
        // ModernTax API endpoint
        apiBaseUrl: window.MODERNTAX_API_URL || 'https://api.moderntax.io',
        apiKey: window.MODERNTAX_API_KEY || '',

        // Optional: link uploads to a specific call/batch
        callId: window.MODERNTAX_CALL_ID || '',
        batchId: window.MODERNTAX_BATCH_ID || '',
    };

    // ---- Load dependencies ----
    async function loadScript(url, checkGlobal) {
        if (window[checkGlobal]) return;
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = resolve;
            s.onerror = () => reject(new Error(`Failed to load ${url}`));
            document.head.appendChild(s);
        });
    }

    try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
        console.log('%c Dependencies loaded ', 'background:#38a169;color:white;padding:3px');
    } catch (e) {
        alert('Failed to load PDF libraries. Check your internet connection.\n' + e.message);
        return;
    }

    const { jsPDF } = window.jspdf;

    // ---- Get all message links ----
    const links = document.querySelectorAll('a[href*="read_content.jsp"]');
    const seen = new Set();
    const messages = [];

    links.forEach(link => {
        const match = link.href.match(/itemId=(\d+)/);
        if (match && !seen.has(match[1])) {
            seen.add(match[1]);
            messages.push({ id: match[1], subject: link.textContent.trim() });
        }
    });

    console.log(`%c Found ${messages.length} transcripts `, 'background:#1e3a5f;color:white;padding:5px;font-weight:bold');

    // ---- Progress panel ----
    document.getElementById('irs-batch')?.remove();
    const panel = document.createElement('div');
    panel.id = 'irs-batch';
    panel.innerHTML = `
        <style>
            #irs-batch { position:fixed; top:10px; right:10px; width:520px; background:#1e3a5f; color:white; padding:20px; border-radius:10px; font-family:system-ui; font-size:13px; z-index:999999; box-shadow:0 8px 30px rgba(0,0,0,0.4); max-height:85vh; overflow-y:auto; }
            #irs-batch h3 { margin:0 0 15px; color:#90cdf4; }
            #irs-batch .progress { background:#2d3748; border-radius:5px; height:24px; margin:10px 0; }
            #irs-batch .progress-bar { background:linear-gradient(90deg,#4299e1,#38a169); height:100%; border-radius:5px; transition:width 0.3s; display:flex; align-items:center; justify-content:center; font-weight:600; }
            #irs-batch .log { background:#1a202c; padding:10px; border-radius:5px; max-height:400px; overflow-y:auto; font-family:monospace; font-size:11px; margin-top:10px; }
            #irs-batch .success { color:#68d391; }
            #irs-batch .error { color:#fc8181; }
            #irs-batch .info { color:#90cdf4; }
            #irs-batch .warn { color:#f6e05e; }
            #irs-batch .controls { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
            #irs-batch button { color:white; border:none; padding:10px 16px; border-radius:5px; cursor:pointer; font-weight:600; }
            #irs-batch .btn-cancel { background:#e53e3e; }
            #irs-batch .btn-toggle { background:#4a5568; font-size:11px; padding:6px 12px; }
            #irs-batch .btn-toggle.active { background:#38a169; }
            #irs-batch .config-row { display:flex; gap:6px; margin:8px 0; align-items:center; }
            #irs-batch .config-row input { flex:1; padding:4px 8px; border-radius:4px; border:1px solid #4a5568; background:#2d3748; color:white; font-size:11px; }
            #irs-batch .config-row label { font-size:11px; min-width:60px; }
        </style>
        <h3>IRS Batch Transcript Downloader v6</h3>
        <div>Processing <strong id="irs-curr">0</strong> / <strong>${messages.length}</strong></div>
        <div class="progress"><div class="progress-bar" id="irs-pbar" style="width:0%">0%</div></div>
        <div class="config-row">
            <label>API URL:</label>
            <input id="irs-api-url" value="${CONFIG.apiBaseUrl}" placeholder="https://api.moderntax.io" />
        </div>
        <div class="config-row">
            <label>API Key:</label>
            <input id="irs-api-key" type="password" value="${CONFIG.apiKey}" placeholder="Your PPS API key" />
        </div>
        <div class="config-row">
            <label>Batch ID:</label>
            <input id="irs-batch-id" value="${CONFIG.batchId}" placeholder="Optional batch ID" />
        </div>
        <div class="controls">
            <button class="btn-toggle active" id="irs-upload-toggle" onclick="window.irsUploadMode=!window.irsUploadMode;this.textContent=window.irsUploadMode?'Upload ON':'Upload OFF';this.classList.toggle('active')">Upload ON</button>
            <button class="btn-toggle active" id="irs-pdf-toggle" onclick="window.irsPdfMode=!window.irsPdfMode;this.textContent=window.irsPdfMode?'PDF ON':'PDF OFF';this.classList.toggle('active')">PDF ON</button>
            <button class="btn-toggle" id="irs-html-toggle" onclick="window.irsAlsoHtml=!window.irsAlsoHtml;this.textContent=window.irsAlsoHtml?'+HTML ON':'+HTML OFF';this.classList.toggle('active')">+HTML OFF</button>
            <button class="btn-toggle active" id="irs-report-toggle" onclick="window.irsReport=!window.irsReport;this.textContent=window.irsReport?'Report ON':'Report OFF';this.classList.toggle('active')">Report ON</button>
            <button class="btn-cancel" onclick="window.irsCancel=true;this.textContent='Cancelling...'">Cancel</button>
        </div>
        <div class="log" id="irs-log"></div>
    `;
    document.body.appendChild(panel);

    const log = document.getElementById('irs-log');
    const addLog = (msg, cls='info') => {
        log.innerHTML += `<div class="${cls}">${msg}</div>`;
        log.scrollTop = log.scrollHeight;
    };

    window.irsCancel = false;
    window.irsPdfMode = true;
    window.irsAlsoHtml = false;
    window.irsReport = true;
    window.irsUploadMode = true;

    // ---- Hidden render container ----
    const renderContainer = document.createElement('div');
    renderContainer.id = 'irs-render';
    renderContainer.style.cssText = 'position:fixed; left:-9999px; top:0; width:1000px; background:white; z-index:-1;';
    document.body.appendChild(renderContainer);

    // ---- Compliance Screening (client-side, same as v5) ----
    function screenTranscript(htmlString, metadata) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const fullText = doc.body?.textContent || '';

        const finding = {
            taxpayerName: metadata.name || '',
            tin: metadata.tin || '',
            formType: metadata.formType || '',
            taxYear: metadata.taxYear || '',
            transcriptType: metadata.shortType || '',
            isBlank: false,
            hasBalanceDue: false, hasAccruedInterest: false, hasAccruedPenalty: false,
            hasLateFilingPenalty: false, hasUnderreportingNotice: false,
            hasCollectionAction: false, hasLien: false, hasLevy: false,
            hasAmendedReturn: false, hasExtension: false, isSubstitutedReturn: false,
            hasExamination: false, hasInstallmentAgreement: false, hasOfferInCompromise: false,
            hasMismatch: false,
            grossReceipts: null, totalIncome: null, totalDeductions: null,
            ordinaryIncome: null, totalAssets: null, totalTax: null, balanceDue: null,
            accountBalance: null, accruedInterest: null, accruedPenalty: null,
            accountBalancePlusAccruals: null,
            transactionCodes: [], flags: [], severity: 'CLEAN',
        };

        if (fullText.match(/no record of return filed/i) ||
            fullText.match(/no tax return filed/i) ||
            fullText.match(/return not present/i)) {
            finding.isBlank = true;
            finding.flags.push({ type: 'UNFILED', severity: 'CRITICAL', message: `No return filed for ${metadata.formType || 'form'} - Tax Year ${metadata.taxYear}` });
        }

        // New-format parsing
        const itemContainers = doc.querySelectorAll('.item-container');
        itemContainers.forEach(c => {
            const label = c.querySelector('.item-label')?.textContent?.trim() || '';
            const value = c.querySelector('.item-value')?.textContent?.trim() || '';
            if (label.match(/^Account balance:/i)) finding.accountBalance = parseDollar(value);
            if (label.match(/Account balance plus accruals/i)) finding.accountBalancePlusAccruals = parseDollar(value);
            if (label.match(/Total Tax per Taxpayer/i)) finding.totalTax = parseDollar(value);
        });

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

        // Old-format parsing
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
                        if (c === 166 || c === 276) { finding.hasLateFilingPenalty = true; finding.flags.push({ type: 'PENALTY', severity: 'WARNING', message: `Late filing/payment penalty (TC ${code}) - ${amount} on ${date}` }); }
                        if (c === 922 || c === 290 || c === 291) { finding.hasUnderreportingNotice = true; finding.flags.push({ type: 'UNDERREPORTING', severity: 'WARNING', message: `Underreporting/adjustment (TC ${code}) - ${amount} on ${date}` }); }
                        if (c === 530 || c === 520 || c === 550) { finding.hasCollectionAction = true; finding.flags.push({ type: 'COLLECTION', severity: 'CRITICAL', message: `Collection action (TC ${code}: ${explanation}) on ${date}` }); }
                        if (c === 582 || c === 583) { finding.hasLien = true; finding.flags.push({ type: 'LIEN', severity: 'CRITICAL', message: `Federal tax lien (TC ${code}) filed on ${date}` }); }
                        if (c === 670 && explanation?.match(/levy/i)) { finding.hasLevy = true; finding.flags.push({ type: 'LEVY', severity: 'CRITICAL', message: `Levy action (TC ${code}) on ${date} - ${amount}` }); }
                        if (c === 977 || c === 290) finding.hasAmendedReturn = true;
                        if (c === 460) finding.hasExtension = true;
                        if (c === 150 && explanation?.match(/substitute/i)) { finding.isSubstitutedReturn = true; finding.flags.push({ type: 'SFR', severity: 'CRITICAL', message: `IRS filed Substitute for Return (SFR) on ${date}` }); }
                        if (c === 420 || c === 421) { finding.hasExamination = true; finding.flags.push({ type: 'AUDIT', severity: 'CRITICAL', message: `Examination/audit initiated (TC ${code}) on ${date}` }); }
                        if (c === 971 && explanation?.match(/installment/i)) { finding.hasInstallmentAgreement = true; finding.flags.push({ type: 'INSTALLMENT', severity: 'WARNING', message: `Installment agreement (TC ${code}) on ${date}` }); }
                        if (c === 480 || c === 481) { finding.hasOfferInCompromise = true; finding.flags.push({ type: 'OIC', severity: 'WARNING', message: `Offer in Compromise (TC ${code}) on ${date}` }); }
                    }
                }
            });
        }

        const effectiveBalance = finding.accountBalancePlusAccruals ?? finding.accountBalance ?? finding.balanceDue;
        if (effectiveBalance !== null && effectiveBalance > 0) {
            finding.hasBalanceDue = true;
            finding.flags.push({ type: 'BALANCE_DUE', severity: 'CRITICAL', message: `Outstanding balance due: ${formatDollar(effectiveBalance)}` });
        }
        if (finding.accruedInterest !== null && finding.accruedInterest > 0) {
            finding.hasAccruedInterest = true;
            finding.flags.push({ type: 'INTEREST', severity: 'WARNING', message: `Accrued interest: ${formatDollar(finding.accruedInterest)}` });
        }
        if (finding.accruedPenalty !== null && finding.accruedPenalty > 0) {
            finding.hasAccruedPenalty = true;
            finding.flags.push({ type: 'PENALTY', severity: 'WARNING', message: `Accrued penalty: ${formatDollar(finding.accruedPenalty)}` });
        }

        const severities = finding.flags.map(f => f.severity);
        if (severities.includes('CRITICAL')) finding.severity = 'CRITICAL';
        else if (severities.includes('WARNING')) finding.severity = 'WARNING';
        else if (severities.includes('INFO')) finding.severity = 'INFO';
        else finding.severity = 'CLEAN';

        return finding;
    }

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

    // ---- Compliance Report Generator ----
    function generateComplianceReport(allFindings, downloadResults) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        const criticals = allFindings.filter(f => f.severity === 'CRITICAL').length;
        const warnings = allFindings.filter(f => f.severity === 'WARNING').length;
        const clean = allFindings.filter(f => f.severity === 'CLEAN' || f.severity === 'INFO').length;

        let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Compliance Screening Report</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px;background:#f8fafc;color:#1e293b}
.header{text-align:center;margin-bottom:30px;padding:20px;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:white;border-radius:10px}
.header h1{margin:0 0 5px;font-size:24px}
.header p{margin:0;opacity:.8;font-size:14px}
.summary{display:flex;gap:15px;margin-bottom:25px;flex-wrap:wrap}
.card{flex:1;min-width:120px;padding:15px;border-radius:8px;text-align:center}
.card h3{margin:0;font-size:28px}.card p{margin:4px 0 0;font-size:12px;opacity:.7}
.card-total{background:#e2e8f0;color:#1e293b}
.card-critical{background:#fee2e2;color:#991b1b}
.card-warning{background:#fef3c7;color:#92400e}
.card-clean{background:#dcfce7;color:#166534}
.entity{background:white;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:15px;overflow:hidden}
.entity-header{padding:12px 16px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
.entity-header.CRITICAL{background:#fee2e2;color:#991b1b}
.entity-header.WARNING{background:#fef3c7;color:#92400e}
.entity-header.CLEAN,.entity-header.INFO{background:#dcfce7;color:#166534}
.entity-body{padding:16px}
.flag{padding:6px 10px;margin:4px 0;border-radius:4px;font-size:13px}
.flag.CRITICAL{background:#fee2e2;color:#991b1b}.flag.WARNING{background:#fef3c7;color:#92400e}.flag.INFO{background:#dbeafe;color:#1e40af}
.fin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin:10px 0}
.fin-item{background:#f1f5f9;padding:8px 12px;border-radius:4px;font-size:13px}
.fin-item span{font-weight:600}
.tc-table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0}
.tc-table th{background:#f1f5f9;text-align:left;padding:6px 8px}
.tc-table td{padding:6px 8px;border-bottom:1px solid #e2e8f0}
</style></head><body>
<div class="header"><h1>Compliance Screening Report</h1><p>${dateStr} | ${allFindings.length} transcripts analyzed</p></div>
<div class="summary">
<div class="card card-total"><h3>${allFindings.length}</h3><p>Total</p></div>
<div class="card card-critical"><h3>${criticals}</h3><p>Critical</p></div>
<div class="card card-warning"><h3>${warnings}</h3><p>Warning</p></div>
<div class="card card-clean"><h3>${clean}</h3><p>Clean</p></div>
</div>`;

        // Group by taxpayer
        const byTaxpayer = {};
        allFindings.forEach(f => {
            const key = f.tin || f.taxpayerName || 'Unknown';
            if (!byTaxpayer[key]) byTaxpayer[key] = { name: f.taxpayerName, tin: f.tin, findings: [] };
            byTaxpayer[key].findings.push(f);
        });

        for (const [key, group] of Object.entries(byTaxpayer)) {
            const worstSeverity = group.findings.some(f => f.severity === 'CRITICAL') ? 'CRITICAL' :
                group.findings.some(f => f.severity === 'WARNING') ? 'WARNING' : 'CLEAN';

            html += `<div class="entity"><div class="entity-header ${worstSeverity}"><span>${group.name} (${group.tin})</span><span>${worstSeverity}</span></div><div class="entity-body">`;

            for (const f of group.findings) {
                html += `<div style="margin-bottom:12px"><strong>${f.formType} - ${f.taxYear} (${f.transcriptType})</strong>`;

                if (f.flags.length > 0) {
                    f.flags.forEach(flag => {
                        html += `<div class="flag ${flag.severity}">${flag.severity}: ${flag.message}</div>`;
                    });
                } else {
                    html += `<div class="flag INFO">CLEAN - No issues found</div>`;
                }

                // Financial data
                const finFields = [
                    ['Gross Receipts', f.grossReceipts], ['Total Income', f.totalIncome],
                    ['Total Deductions', f.totalDeductions], ['Ordinary Income', f.ordinaryIncome],
                    ['Total Assets', f.totalAssets], ['Total Tax', f.totalTax],
                    ['Balance Due', f.balanceDue], ['Account Balance', f.accountBalance],
                ];
                const hasFinData = finFields.some(([, v]) => v !== null);
                if (hasFinData) {
                    html += `<div class="fin-grid">`;
                    finFields.forEach(([label, val]) => {
                        if (val !== null) html += `<div class="fin-item">${label}: <span>${formatDollar(val)}</span></div>`;
                    });
                    html += `</div>`;
                }

                // Transaction codes
                if (f.transactionCodes?.length > 0) {
                    html += `<table class="tc-table"><tr><th>Code</th><th>Description</th><th>Date</th><th>Amount</th></tr>`;
                    f.transactionCodes.forEach(tc => {
                        html += `<tr><td>${tc.code}</td><td>${tc.explanation}</td><td>${tc.date}</td><td>${tc.amount}</td></tr>`;
                    });
                    html += `</table>`;
                }

                html += `</div>`;
            }

            html += `</div></div>`;
        }

        html += `</body></html>`;
        return html;
    }

    // ---- HTML to PDF converter ----
    async function htmlToPdf(htmlString, filename) {
        renderContainer.innerHTML = htmlString;
        await delay(500);

        const canvas = await html2canvas(renderContainer, {
            scale: 2, useCORS: true, logging: false,
            width: 1000, windowWidth: 1000, backgroundColor: '#ffffff'
        });

        const imgWidth = 210;
        const pageHeight = 297;
        const margin = 8;
        const contentWidth = imgWidth - (margin * 2);
        const imgHeight = (canvas.height * contentWidth) / canvas.width;

        const pdf = new jsPDF('p', 'mm', 'a4');
        let heightLeft = imgHeight;
        let position = margin;
        const imgData = canvas.toDataURL('image/jpeg', 0.92);

        pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, imgHeight);
        heightLeft -= (pageHeight - margin * 2);

        while (heightLeft > 0) {
            position = -(pageHeight - margin * 2) * (Math.ceil((imgHeight - heightLeft) / (pageHeight - margin * 2))) + margin;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, imgHeight);
            heightLeft -= (pageHeight - margin * 2);
        }

        pdf.setProperties({ title: filename.replace('.pdf', ''), creator: 'ModernTax IRS Transcript Downloader v6' });
        renderContainer.innerHTML = '';
        return pdf.output('blob');
    }

    // ---- Download helper ----
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ---- Upload to ModernTax API ----
    async function uploadToApi(transcripts) {
        const apiUrl = document.getElementById('irs-api-url')?.value || CONFIG.apiBaseUrl;
        const apiKey = document.getElementById('irs-api-key')?.value || CONFIG.apiKey;
        const batchId = document.getElementById('irs-batch-id')?.value || CONFIG.batchId;

        if (!apiKey) {
            addLog('  API key not set - skipping upload', 'error');
            return null;
        }

        try {
            const response = await fetch(`${apiUrl}/api/v1/pps/transcripts/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                },
                body: JSON.stringify({
                    transcripts,
                    callId: CONFIG.callId || undefined,
                    batchId: batchId || undefined,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (err) {
            addLog(`  Upload failed: ${err.message}`, 'error');
            return null;
        }
    }

    const results = [];
    const allFindings = [];
    const uploadQueue = [];

    // Name expansions
    const nameMap = {
        'FIL A BAGE': 'Fill A Bagel',
        'FILL A BAG': 'Fill A Bagel'
    };

    // ==========================================================
    // MAIN PROCESSING LOOP
    // ==========================================================

    for (let i = 0; i < messages.length; i++) {
        if (window.irsCancel) { addLog('Cancelled', 'error'); break; }

        const msg = messages[i];
        document.getElementById('irs-curr').textContent = i + 1;
        const pct = Math.round((i + 1) / messages.length * 100);
        document.getElementById('irs-pbar').style.width = pct + '%';
        document.getElementById('irs-pbar').textContent = pct + '%';

        addLog(`[${i+1}/${messages.length}] ${msg.subject.substring(0,50)}...`);

        try {
            // Step 1: Initialize session
            const viewUrl = `/semail/views/view_file.jsp?mailId=${msg.id}&index=0&ext=html&action=view`;
            addLog(`  Initializing session...`, 'warn');

            // FIX for first-transcript bug: pre-warm session before main request
            if (i === 0) {
                await fetch(viewUrl, { credentials: 'include' });
                await delay(2000);
                // Re-fetch to properly initialize
                await fetch(viewUrl, { credentials: 'include' });
            } else {
                await fetch(viewUrl, { credentials: 'include' });
            }

            // Step 2: Wait for IRS redirect
            addLog(`  Waiting for IRS...`, 'warn');
            await delay(5000);

            // Step 3: Fetch transcript
            addLog(`  Fetching transcript...`, 'info');
            const transcriptResp = await fetch('/semail/servlet/FileDownload', { credentials: 'include' });
            const transcriptHtml = await transcriptResp.text();

            // Validate transcript content
            if (transcriptHtml.includes('transcript-title') || transcriptHtml.includes('item-container') ||
                transcriptHtml.includes('Tax Return Transcript') || transcriptHtml.includes('Account Transcript') ||
                transcriptHtml.includes('Wage and Income') || transcriptHtml.includes('Record of Account') ||
                transcriptHtml.includes('No record of return filed')) {

                const parser = new DOMParser();
                const doc = parser.parseFromString(transcriptHtml, 'text/html');
                const fullText = doc.body?.textContent || '';
                const titleText = doc.querySelector('title')?.textContent || '';

                // Parse transcript type
                const titleEl = doc.querySelector('h1.transcript-title') || doc.querySelector('h2') || doc.querySelector('h3 b');
                let transcriptType = titleEl?.textContent?.trim() || titleText || 'Transcript';
                let shortType = 'Transcript';
                if (transcriptType.match(/Return Transcript/i)) shortType = 'Return Transcript';
                else if (transcriptType.match(/Account Transcript/i)) shortType = 'Account Transcript';
                else if (transcriptType.match(/Record of Account/i)) shortType = 'Record of Account';
                else if (transcriptType.match(/Wage and Income/i)) shortType = 'Wage and Income';

                // Parse metadata
                let formType = '', tin = '', taxYear = '', taxpayerName = '';
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

                const name = nameMap[taxpayerName] || taxpayerName || 'Unknown';
                const baseFilename = `${name} - ${formType} ${shortType} - ${taxYear}`;
                const metadata = { name, tin, formType, taxYear, shortType };

                // ---- COMPLIANCE SCREENING (client-side preview) ----
                addLog(`  Screening for compliance...`, 'warn');
                const finding = screenTranscript(transcriptHtml, metadata);
                allFindings.push(finding);

                if (finding.severity === 'CRITICAL') {
                    finding.flags.forEach(f => { if (f.severity === 'CRITICAL') addLog(`  CRITICAL: ${f.message}`, 'error'); });
                } else if (finding.severity === 'WARNING') {
                    finding.flags.forEach(f => { if (f.severity === 'WARNING') addLog(`  WARNING: ${f.message}`, 'warn'); });
                } else {
                    addLog(`  Clean - no issues`, 'success');
                }

                // ---- QUEUE FOR API UPLOAD ----
                if (window.irsUploadMode) {
                    uploadQueue.push({
                        html: transcriptHtml,
                        filename: baseFilename + '.html',
                    });
                }

                // ---- DOWNLOAD PDF ----
                if (window.irsPdfMode) {
                    addLog(`  Converting to PDF...`, 'warn');
                    try {
                        const pdfBlob = await htmlToPdf(transcriptHtml, baseFilename + '.pdf');
                        downloadBlob(pdfBlob, baseFilename + '.pdf');
                        addLog(`  ${baseFilename}.pdf`, 'success');
                    } catch (pdfErr) {
                        addLog(`  PDF failed: ${pdfErr.message}, falling back to HTML`, 'error');
                        const htmlBlob = new Blob([transcriptHtml], { type: 'text/html' });
                        downloadBlob(htmlBlob, baseFilename + '.html');
                        addLog(`  ${baseFilename}.html (fallback)`, 'success');
                    }
                }

                if (window.irsAlsoHtml || !window.irsPdfMode) {
                    const htmlBlob = new Blob([transcriptHtml], { type: 'text/html' });
                    downloadBlob(htmlBlob, baseFilename + '.html');
                    addLog(`  ${baseFilename}.html`, 'success');
                }

                results.push({ success: true, filename: baseFilename, name, tin, formType, taxYear });

            } else {
                addLog(`  Did not get transcript content`, 'error');
                results.push({ success: false, error: 'No transcript content' });
            }

        } catch (err) {
            addLog(`  Error: ${err.message}`, 'error');
            results.push({ success: false, error: err.message });
        }

        await delay(1500);
    }

    // ---- Cleanup render container ----
    renderContainer.remove();

    // ==========================================================
    // UPLOAD TO MODERNTAX API
    // ==========================================================
    if (window.irsUploadMode && uploadQueue.length > 0) {
        addLog(`\nUploading ${uploadQueue.length} transcripts to ModernTax...`, 'info');

        // Upload in batches of 10 to avoid payload limits
        const batchSize = 10;
        let uploaded = 0;
        let uploadErrors = 0;

        for (let i = 0; i < uploadQueue.length; i += batchSize) {
            const batch = uploadQueue.slice(i, i + batchSize);
            addLog(`  Uploading batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uploadQueue.length/batchSize)}...`, 'warn');

            const uploadResult = await uploadToApi(batch);

            if (uploadResult?.success) {
                uploaded += uploadResult.transcripts?.length || 0;
                uploadErrors += uploadResult.errors?.length || 0;

                if (uploadResult.summary) {
                    const s = uploadResult.summary;
                    addLog(`  Server screening: ${s.critical} critical, ${s.warning} warnings, ${s.clean} clean`, s.critical > 0 ? 'error' : 'success');
                }

                // Log any critical findings from server
                uploadResult.transcripts?.forEach(t => {
                    if (t.severity === 'CRITICAL') {
                        addLog(`  ALERT: ${t.businessName} ${t.formType} ${t.taxYear} - ${t.flagCount} flags`, 'error');
                    }
                });
            } else {
                uploadErrors += batch.length;
            }
        }

        addLog(`\nUpload complete: ${uploaded} uploaded, ${uploadErrors} errors`, uploaded > 0 ? 'success' : 'error');
    }

    // ==========================================================
    // GENERATE & DOWNLOAD COMPLIANCE REPORT
    // ==========================================================
    if (window.irsReport && allFindings.length > 0) {
        addLog(`\nGenerating Compliance Screening Report...`, 'info');

        const reportHtml = generateComplianceReport(allFindings, results);
        const now = new Date();
        const dateSlug = now.toISOString().split('T')[0];
        const reportFilename = `Compliance Screening Report - ${dateSlug}`;

        const reportBlob = new Blob([reportHtml], { type: 'text/html' });
        downloadBlob(reportBlob, reportFilename + '.html');
        addLog(`  ${reportFilename}.html`, 'success');

        if (window.irsPdfMode) {
            try {
                addLog(`  Converting report to PDF...`, 'warn');
                const reportRender = document.createElement('div');
                reportRender.id = 'irs-render';
                reportRender.style.cssText = 'position:fixed; left:-9999px; top:0; width:1000px; background:white; z-index:-1;';
                document.body.appendChild(reportRender);
                reportRender.innerHTML = reportHtml;
                await delay(800);

                const canvas = await html2canvas(reportRender, {
                    scale: 2, useCORS: true, logging: false,
                    width: 1000, windowWidth: 1000, backgroundColor: '#f8fafc'
                });

                const imgWidth = 210, pageHeight = 297, margin = 8;
                const contentWidth = imgWidth - (margin * 2);
                const imgHeight = (canvas.height * contentWidth) / canvas.width;
                const pdf = new jsPDF('p', 'mm', 'a4');
                let heightLeft = imgHeight;
                let position = margin;
                const imgData = canvas.toDataURL('image/jpeg', 0.92);

                pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, imgHeight);
                heightLeft -= (pageHeight - margin * 2);

                while (heightLeft > 0) {
                    position = -(pageHeight - margin * 2) * (Math.ceil((imgHeight - heightLeft) / (pageHeight - margin * 2))) + margin;
                    pdf.addPage();
                    pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, imgHeight);
                    heightLeft -= (pageHeight - margin * 2);
                }

                pdf.setProperties({ title: reportFilename, creator: 'ModernTax Compliance Screening v6' });
                const reportPdfBlob = pdf.output('blob');
                downloadBlob(reportPdfBlob, reportFilename + '.pdf');
                reportRender.remove();
                addLog(`  ${reportFilename}.pdf`, 'success');
            } catch (e) {
                addLog(`  Report PDF failed: ${e.message} (HTML version was saved)`, 'error');
            }
        }
    }

    // ---- Final Summary ----
    const ok = results.filter(r => r.success).length;
    const criticals = allFindings.filter(f => f.severity === 'CRITICAL').length;
    const warnings = allFindings.filter(f => f.severity === 'WARNING').length;

    addLog(`\n${'='.repeat(50)}`, 'info');
    addLog(`Downloaded ${ok}/${messages.length} transcripts`, ok > 0 ? 'success' : 'error');
    if (window.irsUploadMode) {
        addLog(`Uploaded ${uploadQueue.length} to ModernTax API`, uploadQueue.length > 0 ? 'success' : 'warn');
    }
    addLog(`Compliance: ${criticals} critical, ${warnings} warnings, ${allFindings.length - criticals - warnings} clean`,
        criticals > 0 ? 'error' : warnings > 0 ? 'warn' : 'success');

    if (ok > 0) {
        const byName = {};
        results.filter(r => r.success).forEach(r => {
            if (!byName[r.name]) byName[r.name] = [];
            byName[r.name].push(r);
        });

        Object.keys(byName).forEach(n => {
            addLog(`\n${n} (TIN: ${byName[n][0].tin})`, 'info');
            byName[n].forEach(r => addLog(`   ${r.formType} ${r.taxYear}`, 'success'));
        });
    }

    const uploadMsg = window.irsUploadMode ? `\nUploaded ${uploadQueue.length} to ModernTax.` : '';
    alert(`Done! Downloaded ${ok}/${messages.length} transcripts.${uploadMsg}\n\nCompliance: ${criticals} critical, ${warnings} warnings.\n\nCheck your Downloads folder for transcripts + report.`);
    return { results, findings: allFindings };
})();
