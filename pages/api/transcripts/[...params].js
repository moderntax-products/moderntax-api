const { generateIRSTranscriptPDF } = require('../../../lib/generatePDF');

export default async function handler(req, res) {
  const { params } = req.query;
  
  if (!params || params.length < 2) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  
  const [requestId, format] = params;
  
  // Parse request ID to extract year and SSN type
  // Format: req_TIMESTAMP_RANDOM or req_TIMESTAMP_RANDOM_2022
  const parts = requestId.split('_');
  const requestedYear = parts[3] || '2023'; // Default to 2023 if no year specified
  
  const ssnType = requestId.includes('0001') ? 'high' : 
                  requestId.includes('0002') ? 'low' : 'default';
  
  // Generate year-specific data
  const transcriptData = {
    requestId,
    trackingNumber: `10880${requestedYear}${Math.floor(Math.random() * 100000)}`,
    requestDate: new Date().toLocaleDateString('en-US'),
    responseDate: new Date().toLocaleDateString('en-US'),
    ssn: 'XXX-XX-9616',
    taxPeriod: `December 31, ${requestedYear}`,
    taxpayerName: 'PRIS D LUN',
    taxpayerAddress: '11633 PROPERTY LANE, CITY, ST 12345',
    formNumber: '1040',
    filingStatus: 'Married Filing Joint',
    year: requestedYear,
    
    // Adjust amounts based on year (older years have lower amounts)
    agi: ssnType === 'low' ? 25000 : (requestedYear === '2023' ? 148506 : requestedYear === '2022' ? 142000 : 138000),
    taxableIncome: ssnType === 'low' ? 15000 : (requestedYear === '2023' ? 112154 : requestedYear === '2022' ? 108000 : 105000),
    taxPerReturn: ssnType === 'low' ? 2500 : (requestedYear === '2023' ? 21866 : requestedYear === '2022' ? 20500 : 19800),
    selfEmploymentTax: ssnType === 'low' ? 0 : (requestedYear === '2023' ? 6577 : requestedYear === '2022' ? 6200 : 6000),
    
    // Year-specific W-2 data
    w2Forms: requestedYear === '2023' ? [
      { employer: 'DILL CORPORATION', ein: 'XX-XXX8071', wages: 473, fedWithheld: 18, ssWithheld: 29, medicareWithheld: 6 },
      { employer: 'SHAN ENTERPRISES', ein: 'XX-XXX9845', wages: 1303, fedWithheld: 46, ssWithheld: 80, medicareWithheld: 18 },
      { employer: 'JAAC INDUSTRIES', ein: 'XX-XXX7408', wages: 16847, fedWithheld: 1494, ssWithheld: 1044, medicareWithheld: 244 },
      { employer: 'XERT TECHNOLOGIES', ein: 'XX-XXX4605', wages: 16979, fedWithheld: 1139, ssWithheld: 1052, medicareWithheld: 246 }
    ] : requestedYear === '2022' ? [
      { employer: 'DILL CORPORATION', ein: 'XX-XXX8071', wages: 450, fedWithheld: 17, ssWithheld: 28, medicareWithheld: 6 },
      { employer: 'SHAN ENTERPRISES', ein: 'XX-XXX9845', wages: 1250, fedWithheld: 44, ssWithheld: 77, medicareWithheld: 18 },
      { employer: 'JAAC INDUSTRIES', ein: 'XX-XXX7408', wages: 16000, fedWithheld: 1400, ssWithheld: 992, medicareWithheld: 232 }
    ] : [
      { employer: 'DILL CORPORATION', ein: 'XX-XXX8071', wages: 425, fedWithheld: 16, ssWithheld: 26, medicareWithheld: 6 },
      { employer: 'SHAN ENTERPRISES', ein: 'XX-XXX9845', wages: 1200, fedWithheld: 42, ssWithheld: 74, medicareWithheld: 17 }
    ],
    
    transactions: [
      { code: '150', explanation: 'Tax return filed', date: `04-15-${parseInt(requestedYear)+1}`, amount: 21866 },
      { code: '806', explanation: 'W-2 or 1099 withholding', date: `04-15-${parseInt(requestedYear)+1}`, amount: -12512 }
    ]
  };
  
  if (format === 'pdf') {
    try {
      // Generate PDF with year-specific data
      const pdfBuffer = generateIRSTranscriptPDF(transcriptData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${requestId}-transcript.pdf"`);
      return res.send(Buffer.from(pdfBuffer));
    } catch (error) {
      console.error('PDF generation error:', error);
      return res.status(500).json({ error: 'PDF generation failed' });
    }
  }
  
  if (format === 'json') {
    return res.status(200).json(transcriptData);
  }
  
  return res.status(400).json({ error: 'Invalid format' });
}
