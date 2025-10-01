export default async function handler(req, res) {
  const { params } = req.query;
  
  if (!params || params.length < 3) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  
  const [formType, year, filename] = params;
  
  // For now, return a simple HTML representation that browsers will display as PDF-like
  let htmlContent = '';
  
  if (formType === '1040') {
    htmlContent = generate1040HTML(year);
  } else if (formType === 'W2' || formType === 'W-2') {
    htmlContent = generateW2HTML(year, filename);
  } else if (formType === '1098') {
    htmlContent = generate1098HTML(year);
  } else if (formType === '1099DIV') {
    htmlContent = generate1099HTML(year);
  } else {
    return res.status(404).json({ error: 'Form type not found' });
  }
  
  // Return HTML that looks like an IRS form
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(htmlContent);
}

function generate1040HTML(year) {
  return `<!DOCTYPE html>
<html>
<head>
<title>Form 1040 - ${year}</title>
<style>
body { font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px; }
.header { background: #f0f0f0; padding: 10px; text-align: center; font-weight: bold; }
.section { margin: 20px 0; padding: 10px; border: 1px solid #ccc; }
.row { display: flex; justify-content: space-between; margin: 5px 0; }
.label { font-weight: bold; }
.value { text-align: right; }
</style>
</head>
<body>
<div class="header">Department of the Treasury - Internal Revenue Service<br/>
Form 1040 - U.S. Individual Income Tax Return (${year})</div>

<div class="section">
<h3>Filing Status</h3>
<div class="row"><span>✓ Married Filing Joint</span></div>
</div>

<div class="section">
<h3>Income</h3>
<div class="row"><span class="label">1. Wages, salaries, tips</span><span class="value">$105,248</span></div>
<div class="row"><span class="label">2. Interest</span><span class="value">$0</span></div>
<div class="row"><span class="label">3. Dividends</span><span class="value">$0</span></div>
<div class="row"><span class="label">4. Business income</span><span class="value">$46,547</span></div>
<div class="row"><span class="label">11. Adjusted Gross Income</span><span class="value">$148,506</span></div>
</div>

<div class="section">
<h3>Tax and Credits</h3>
<div class="row"><span class="label">12. Standard deduction</span><span class="value">$27,700</span></div>
<div class="row"><span class="label">15. Taxable income</span><span class="value">$112,154</span></div>
<div class="row"><span class="label">16. Tax</span><span class="value">$21,866</span></div>
</div>

<div class="section">
<h3>Payments</h3>
<div class="row"><span class="label">25. Federal tax withheld</span><span class="value">$12,512</span></div>
<div class="row"><span class="label">37. Amount you owe</span><span class="value">$9,354</span></div>
</div>

<div class="section">
<p>Taxpayer Signature: _________________ Date: _________</p>
<p>Spouse Signature: ___________________ Date: _________</p>
</div>
</body>
</html>`;
}

function generateW2HTML(year, filename) {
  const employerNum = filename.includes('_1') ? 1 : filename.includes('_2') ? 2 : 3;
  const employers = {
    1: { name: 'DILL CORPORATION', ein: 'XX-XXX8071', wages: 473, fed: 18, ss: 29, med: 6 },
    2: { name: 'SHAN ENTERPRISES', ein: 'XX-XXX9845', wages: 1303, fed: 46, ss: 80, med: 18 },
    3: { name: 'JAAC INDUSTRIES', ein: 'XX-XXX7408', wages: 16847, fed: 1494, ss: 1044, med: 244 }
  };
  const emp = employers[employerNum];
  
  return `<!DOCTYPE html>
<html>
<head>
<title>Form W-2 - ${year}</title>
<style>
body { font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px; }
.header { background: #f0f0f0; padding: 10px; text-align: center; font-weight: bold; }
.box { border: 1px solid #000; padding: 5px; margin: 5px 0; min-height: 40px; }
.row { display: flex; gap: 10px; }
.box-label { font-size: 10px; font-weight: bold; }
.box-value { font-size: 14px; margin-top: 5px; }
</style>
</head>
<body>
<div class="header">Form W-2 Wage and Tax Statement ${year}</div>

<div class="row">
<div class="box" style="flex: 1;">
<div class="box-label">a. Employee's SSN</div>
<div class="box-value">XXX-XX-9616</div>
</div>
</div>

<div class="row">
<div class="box" style="flex: 1;">
<div class="box-label">b. Employer identification number (EIN)</div>
<div class="box-value">${emp.ein}</div>
</div>
</div>

<div class="row">
<div class="box" style="flex: 1;">
<div class="box-label">c. Employer's name, address, and ZIP code</div>
<div class="box-value">${emp.name}<br/>123 Business Ave<br/>City, ST 12345</div>
</div>
</div>

<div class="row">
<div class="box" style="flex: 1;">
<div class="box-label">e. Employee's name</div>
<div class="box-value">PRIS D LUN</div>
</div>
</div>

<div class="row">
<div class="box" style="width: 150px;">
<div class="box-label">1. Wages, tips, other comp.</div>
<div class="box-value">$${emp.wages.toLocaleString()}.00</div>
</div>
<div class="box" style="width: 150px;">
<div class="box-label">2. Federal income tax withheld</div>
<div class="box-value">$${emp.fed.toLocaleString()}.00</div>
</div>
</div>

<div class="row">
<div class="box" style="width: 150px;">
<div class="box-label">3. Social security wages</div>
<div class="box-value">$${emp.wages.toLocaleString()}.00</div>
</div>
<div class="box" style="width: 150px;">
<div class="box-label">4. Social security tax withheld</div>
<div class="box-value">$${emp.ss.toLocaleString()}.00</div>
</div>
</div>

<div class="row">
<div class="box" style="width: 150px;">
<div class="box-label">5. Medicare wages and tips</div>
<div class="box-value">$${emp.wages.toLocaleString()}.00</div>
</div>
<div class="box" style="width: 150px;">
<div class="box-label">6. Medicare tax withheld</div>
<div class="box-value">$${emp.med.toLocaleString()}.00</div>
</div>
</div>
</body>
</html>`;
}

function generate1098HTML(year) {
  return `<!DOCTYPE html>
<html>
<head>
<title>Form 1098 - ${year}</title>
<style>
body { font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px; }
.header { background: #f0f0f0; padding: 10px; text-align: center; font-weight: bold; }
.box { border: 1px solid #000; padding: 10px; margin: 10px 0; }
.label { font-weight: bold; font-size: 12px; }
.value { font-size: 16px; margin-top: 5px; }
</style>
</head>
<body>
<div class="header">Form 1098 Mortgage Interest Statement ${year}</div>

<div class="box">
<div class="label">RECIPIENT/LENDER</div>
<div class="value">DOVE MORTGAGE<br/>Recipient TIN: XX-XXX5132</div>
</div>

<div class="box">
<div class="label">PAYER/BORROWER</div>
<div class="value">PRIS D LUN<br/>Payer SSN: XXX-XX-9616</div>
</div>

<div class="box">
<div class="label">Box 1: Mortgage interest received from payer/borrower</div>
<div class="value">$6,019.00</div>
</div>

<div class="box">
<div class="label">Box 2: Outstanding mortgage principal</div>
<div class="value">$152,010.00</div>
</div>

<div class="box">
<div class="label">Property Address</div>
<div class="value">11633 Property Lane, City, ST 12345</div>
</div>
</body>
</html>`;
}

function generate1099HTML(year) {
  return `<!DOCTYPE html>
<html>
<head>
<title>Form 1099-DIV - ${year}</title>
<style>
body { font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px; }
.header { background: #f0f0f0; padding: 10px; text-align: center; font-weight: bold; }
.box { border: 1px solid #000; padding: 10px; margin: 10px 0; }
</style>
</head>
<body>
<div class="header">Form 1099-DIV Dividends and Distributions ${year}</div>

<div class="box">
<strong>PAYER:</strong> ROBI INVESTMENTS<br/>
Payer TIN: XX-XXX4776
</div>

<div class="box">
<strong>RECIPIENT:</strong> PRIS D LUN<br/>
Recipient SSN: XXX-XX-9616
</div>

<div class="box">
<strong>Box 1a:</strong> Total ordinary dividends: $0.00
</div>

<div class="box">
<strong>Box 1b:</strong> Qualified dividends: $0.00
</div>
</body>
</html>`;
}
