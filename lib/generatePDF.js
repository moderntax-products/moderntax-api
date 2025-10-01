const { jsPDF } = require('jspdf');

function generateIRSTranscriptPDF(transcriptData) {
  const doc = new jsPDF();
  
  // IRS Header
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.rect(10, 10, 190, 10);
  doc.text('This Product Contains Sensitive Taxpayer Data', 105, 17, { align: 'center' });
  
  // Title
  doc.setFontSize(16);
  doc.text('Wage and Income Transcript', 105, 35, { align: 'center' });
  
  // Header info
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Request Date: ${transcriptData.requestDate}`, 140, 45);
  doc.text(`Response Date: ${transcriptData.responseDate}`, 140, 50);
  doc.text(`Tracking Number: ${transcriptData.trackingNumber}`, 140, 55);
  
  // Taxpayer Info
  doc.text(`SSN Provided: ${transcriptData.ssn}`, 20, 70);
  doc.text(`Tax Period Requested: ${transcriptData.taxPeriod}`, 20, 75);
  doc.text(`Taxpayer Name: ${transcriptData.taxpayerName}`, 20, 80);
  
  // W-2 Forms
  let yPos = 95;
  doc.setFont(undefined, 'bold');
  doc.text('Form W-2 Wage and Tax Statement', 20, yPos);
  
  transcriptData.w2Forms.forEach((w2, index) => {
    yPos += 10;
    doc.setFont(undefined, 'bold');
    doc.text(`W-2 #${index + 1}`, 20, yPos);
    
    yPos += 5;
    doc.setFont(undefined, 'normal');
    doc.text(`Employer: ${w2.employer}`, 25, yPos);
    yPos += 5;
    doc.text(`EIN: ${w2.ein}`, 25, yPos);
    yPos += 5;
    doc.text(`Wages: $${w2.wages.toFixed(2)}`, 25, yPos);
    yPos += 5;
    doc.text(`Federal Tax Withheld: $${w2.fedWithheld.toFixed(2)}`, 25, yPos);
    yPos += 5;
    doc.text(`Social Security Tax: $${w2.ssWithheld.toFixed(2)}`, 25, yPos);
    yPos += 5;
    doc.text(`Medicare Tax: $${w2.medicareWithheld.toFixed(2)}`, 25, yPos);
    yPos += 10;
    
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
  });
  
  // Summary
  doc.setFont(undefined, 'bold');
  doc.text('Tax Return Summary', 20, yPos);
  yPos += 5;
  doc.setFont(undefined, 'normal');
  doc.text(`Filing Status: ${transcriptData.filingStatus}`, 25, yPos);
  yPos += 5;
  doc.text(`Adjusted Gross Income: $${transcriptData.agi.toFixed(2)}`, 25, yPos);
  yPos += 5;
  doc.text(`Taxable Income: $${transcriptData.taxableIncome.toFixed(2)}`, 25, yPos);
  yPos += 5;
  doc.text(`Tax Per Return: $${transcriptData.taxPerReturn.toFixed(2)}`, 25, yPos);
  
  // Footer
  doc.setFontSize(10);
  doc.rect(10, 270, 190, 10);
  doc.text('This Product Contains Sensitive Taxpayer Data', 105, 277, { align: 'center' });
  
  return doc.output('arraybuffer');
}

module.exports = { generateIRSTranscriptPDF };
