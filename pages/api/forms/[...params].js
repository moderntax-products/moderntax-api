// pages/api/forms/[...params].js
// This handles all form endpoints and returns proper PDFs

import { jsPDF } from 'jspdf';

export default async function handler(req, res) {
  const { params } = req.query;
  
if (!params || params.length < 3) {
    return res.status(404).json({ error: 'Invalid form URL format' });
  }
  
  const [formType, taxYear, requestIdWithExt] = params;
  const requestId = requestIdWithExt.replace('.pdf', '').replace('.html', '');
  const isPDF = requestIdWithExt.endsWith('.pdf');
  
  // Generate form content based on type
  let formContent = '';
  let formTitle = '';
  
  switch(formType.toUpperCase()) {
    case '1040':
      formTitle = `Form 1040 - U.S. Individual Income Tax Return (${taxYear})`;
      formContent = generate1040Content(requestId, taxYear);
      break;
    case 'W2':
    case 'W-2':
      formTitle = `Form W-2 - Wage and Tax Statement (${taxYear})`;
      formContent = generateW2Content(requestId, taxYear);
      break;
    case '1099':
      formTitle = `Form 1099 - Miscellaneous Income (${taxYear})`;
      formContent = generate1099Content(requestId, taxYear);
      break;
    case '1098':
      formTitle = `Form 1098 - Mortgage Interest Statement (${taxYear})`;
      formContent = generate1098Content(requestId, taxYear);
      break;
    default:
      return res.status(404).json({ error: 'Unknown form type' });
  }
  
  // Return PDF or HTML based on extension
  if (isPDF) {
    // Generate actual PDF
    const doc = new jsPDF();
    
    // Add header
    doc.setFontSize(16);
    doc.text(formTitle, 20, 20);
    doc.setFontSize(11);
    doc.text(`Request ID: ${requestId}`, 20, 30);
    
    // Add form content
    const lines = formContent.split('\n');
    let yPosition = 45;
    
    lines.forEach(line => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
      doc.text(line, 20, yPosition);
      yPosition += 7;
    });
    
    // Add footer
    doc.setFontSize(8);
    doc.text('This is a test document for ModernTax API sandbox mode', 20, 280);
    doc.text(`Generated: ${new Date().toISOString()}`, 20, 285);
    
    // Return as PDF
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${formType}_${taxYear}_${requestId}.pdf"`);
    return res.send(pdfBuffer);
    
  } else {
    // Return HTML version
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${formTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .section { margin: 20px 0; }
    .row { display: flex; justify-content: space-between; margin: 5px 0; }
    .label { font-weight: bold; }
    .value { text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${formTitle}</h1>
    <p>Request ID: ${requestId}</p>
  </div>
  <pre>${formContent}</pre>
  <div style="margin-top: 50px; font-size: 10px; color: #666;">
    <p>This is a test document for ModernTax API sandbox mode</p>
    <p>Generated: ${new Date().toISOString()}</p>
  </div>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  }
}

function generate1040Content(requestId, taxYear) {
  return `
FORM 1040 - INDIVIDUAL INCOME TAX RETURN
Tax Year: ${taxYear}

Filing Status: Married Filing Joint
----------------------------------------

INCOME:
1. Wages, salaries, tips               $105,248
2. Interest income                     $1,234
3. Dividend income                     $2,456
4. Business income                     $35,000
5. Capital gains                       $4,568

ADJUSTED GROSS INCOME (AGI):           $148,506

DEDUCTIONS:
Standard deduction                     $27,700
Taxable income                        $120,806

TAX CALCULATION:
Tax on taxable income                  $21,543
Credits                                ($2,000)
Total tax                              $19,543

PAYMENTS:
Federal income tax withheld            $22,000
Estimated tax payments                 $0

REFUND:                                $2,457

Taxpayer Signature: /s/ Electronic Signature
Date: ${new Date().toLocaleDateString()}
`;
}

function generateW2Content(requestId, taxYear) {
  return `
FORM W-2 - WAGE AND TAX STATEMENT
Tax Year: ${taxYear}

EMPLOYER INFORMATION:
DILL CORPORATION
123 Corporate Blvd
San Francisco, CA 94105
EIN: 12-3456789

EMPLOYEE INFORMATION:
Request ID: ${requestId}
SSN: ***-**-****

WAGE AND TAX INFORMATION:
----------------------------------------
Box 1: Wages, tips, other comp        $105,248.00
Box 2: Federal income tax withheld    $22,000.00
Box 3: Social security wages          $105,248.00
Box 4: Social security tax withheld   $6,525.38
Box 5: Medicare wages                 $105,248.00
Box 6: Medicare tax withheld          $1,526.10
Box 12a: Code D - 401(k)              $19,500.00
Box 14: State income tax withheld     $8,420.00

STATE INFORMATION:
State: CA
State wages: $105,248.00
State income tax: $8,420.00
`;
}

function generate1099Content(requestId, taxYear) {
  return `
FORM 1099-MISC - MISCELLANEOUS INCOME
Tax Year: ${taxYear}

PAYER INFORMATION:
INVESTMENT COMPANY LLC
456 Investment Ave
New York, NY 10001
EIN: 98-7654321

RECIPIENT INFORMATION:
Request ID: ${requestId}
SSN: ***-**-****

INCOME INFORMATION:
----------------------------------------
Box 1: Rents                          $0.00
Box 2: Royalties                      $0.00
Box 3: Other income                   $4,568.00
Box 4: Federal tax withheld           $0.00
Box 5: Fishing boat proceeds          $0.00
Box 6: Medical payments                $0.00
Box 7: Nonemployee compensation        $35,000.00

Total reported: $39,568.00
`;
}

function generate1098Content(requestId, taxYear) {
  return `
FORM 1098 - MORTGAGE INTEREST STATEMENT
Tax Year: ${taxYear}

LENDER INFORMATION:
FIRST NATIONAL BANK
789 Banking Center
San Francisco, CA 94105
EIN: 11-2233445

BORROWER INFORMATION:
Request ID: ${requestId}
SSN: ***-**-****

MORTGAGE INFORMATION:
----------------------------------------
Box 1: Mortgage interest              $18,543.00
Box 2: Points paid                    $0.00
Box 3: Refund of overpaid interest    $0.00
Box 4: Mortgage insurance premiums    $1,200.00
Box 5: Property taxes                 $4,800.00

Property Address:
123 Main Street
San Francisco, CA 94105

Loan Number: 1234567890
`;
}
