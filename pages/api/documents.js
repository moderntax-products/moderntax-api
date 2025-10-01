export default function handler(req, res) {
  // Get request_id from query params
  const { id, format } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Missing request ID. Use ?id=req_123&format=pdf' });
  }
  
  // Generate transcript content
  const transcriptData = {
    requestId: id,
    date: new Date().toLocaleDateString(),
    taxpayer: 'John Doe',
    ssn: '***-**-6789',
    tax2023: {
      wages: 130000,
      business: 20000,
      agi: 150000,
      tax: 19678,
      withheld: 22500,
      refund: 2822
    },
    tax2022: {
      wages: 125000,
      business: 20000,
      agi: 145000,
      tax: 18920,
      withheld: 21500,
      refund: 2580
    }
  };
  
  if (format === 'json') {
    // Return JSON format
    return res.status(200).json(transcriptData);
  }
  
  if (format === 'txt' || format === 'text') {
    // Return text format
    const transcript = `
IRS TAX TRANSCRIPT
==================
Request ID: ${id}
Date: ${transcriptData.date}
Taxpayer: ${transcriptData.taxpayer}
SSN: ${transcriptData.ssn}

TAX YEAR 2023
=============
Wages: $${transcriptData.tax2023.wages.toLocaleString()}
Business Income: $${transcriptData.tax2023.business.toLocaleString()}
Adjusted Gross Income: $${transcriptData.tax2023.agi.toLocaleString()}
Tax Withheld: $${transcriptData.tax2023.withheld.toLocaleString()}
Refund: $${transcriptData.tax2023.refund.toLocaleString()}

TAX YEAR 2022
=============
Wages: $${transcriptData.tax2022.wages.toLocaleString()}
Business Income: $${transcriptData.tax2022.business.toLocaleString()}
Adjusted Gross Income: $${transcriptData.tax2022.agi.toLocaleString()}
Tax Withheld: $${transcriptData.tax2022.withheld.toLocaleString()}
Refund: $${transcriptData.tax2022.refund.toLocaleString()}

CERTIFICATION
=============
CAF Number: 0316-30210R
PTIN: P01809554
Retrieved: ${new Date().toISOString()}
Expires: ${new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()}

This transcript is valid for 72 hours.
ModernTax Inc. - api.moderntax.io
`;
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `inline; filename="${id}-transcript.txt"`);
    return res.status(200).send(transcript);
  }
  
  // Default to HTML that looks like a PDF
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>IRS Tax Transcript - ${id}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 800px;
            margin: 40px auto;
            padding: 40px;
            background: white;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h1 { color: #003366; border-bottom: 2px solid #003366; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border: 1px solid #ddd; }
        th { background: #f0f0f0; font-weight: bold; }
        .header-info { background: #f9f9f9; padding: 15px; margin: 20px 0; border-left: 4px solid #003366; }
        .total-row { font-weight: bold; background: #f0f8ff; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <h1>IRS TAX TRANSCRIPT</h1>
    
    <div class="header-info">
        <strong>Request ID:</strong> ${id}<br>
        <strong>Generated:</strong> ${transcriptData.date}<br>
        <strong>Taxpayer:</strong> ${transcriptData.taxpayer}<br>
        <strong>SSN:</strong> ${transcriptData.ssn}
    </div>
    
    <h2>Tax Year 2023</h2>
    <table>
        <tr><th>Income Type</th><th>Amount</th></tr>
        <tr><td>Wages, Salaries, Tips</td><td>$${transcriptData.tax2023.wages.toLocaleString()}</td></tr>
        <tr><td>Business Income</td><td>$${transcriptData.tax2023.business.toLocaleString()}</td></tr>
        <tr class="total-row"><td>Adjusted Gross Income</td><td>$${transcriptData.tax2023.agi.toLocaleString()}</td></tr>
        <tr><td>Tax Withheld</td><td>$${transcriptData.tax2023.withheld.toLocaleString()}</td></tr>
        <tr class="total-row"><td>Refund Amount</td><td>$${transcriptData.tax2023.refund.toLocaleString()}</td></tr>
    </table>
    
    <h2>Tax Year 2022</h2>
    <table>
        <tr><th>Income Type</th><th>Amount</th></tr>
        <tr><td>Wages, Salaries, Tips</td><td>$${transcriptData.tax2022.wages.toLocaleString()}</td></tr>
        <tr><td>Business Income</td><td>$${transcriptData.tax2022.business.toLocaleString()}</td></tr>
        <tr class="total-row"><td>Adjusted Gross Income</td><td>$${transcriptData.tax2022.agi.toLocaleString()}</td></tr>
        <tr><td>Tax Withheld</td><td>$${transcriptData.tax2022.withheld.toLocaleString()}</td></tr>
        <tr class="total-row"><td>Refund Amount</td><td>$${transcriptData.tax2022.refund.toLocaleString()}</td></tr>
    </table>
    
    <div class="footer">
        <strong>Certification:</strong> Official IRS Tax Transcript<br>
        <strong>CAF Number:</strong> 0316-30210R<br>
        <strong>PTIN:</strong> P01809554<br>
        <strong>Retrieved:</strong> ${new Date().toISOString()}<br>
        <strong>Valid Until:</strong> ${new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()}<br><br>
        <em>ModernTax Inc. - For verification purposes only</em>
    </div>
</body>
</html>`;
  
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
