/**
 * IRS W-2 Transcript HTML Parser
 * Extracts employment data from IRS HTML transcripts
 */

class IRSEmploymentParser {
  constructor(htmlContent) {
    this.html = htmlContent;
  }

  parse() {
    const employers = this.extractEmployers();
    const ssn = this.extractSSN();
    const taxYear = this.extractTaxYear();

    return {
      ssn_last_four: ssn ? ssn.slice(-4) : 'XXXX',
      tax_year: taxYear,
      employment_status: employers.length > 0 ? 'active' : 'no_records',
      employers: employers,
      summary: {
        total_employers: employers.length,
        total_w2_income: this.calculateTotalIncome(employers),
        multi_employer_detected: employers.length > 1,
        employment_history: employers.map((e, idx) => ({
          employer: e.employer_name,
          title: e.job_title || 'Not specified',
          ein: e.ein,
          wages: e.wages,
          year: taxYear
        }))
      }
    };
  }

  extractEmployers() {
    const employers = [];
    const w2Sections = this.html.split(/Form W-2 Wage and Tax Statement/);
    
    for (let i = 1; i < w2Sections.length; i++) {
      const section = w2Sections[i];
      const employer = this.parseW2Section(section);
      if (employer) {
        employer.index = i;
        employers.push(employer);
      }
    }

    return employers;
  }

  parseW2Section(sectionHtml) {
    try {
      const einMatch = sectionHtml.match(/Employer Identification Number \(EIN\):(XXXXX\d{4})/);
      const ein = einMatch ? einMatch[1].trim() : null;
      
      if (!ein) return null;

      let employerName = 'Unknown Employer';
      const tdMatches = sectionHtml.match(/<td[^>]*>([A-Z][A-Z\s\-\.]{0,50})<\/td>/g);
      if (tdMatches && tdMatches.length > 0) {
        for (const match of tdMatches) {
          const extracted = match.match(/>([A-Z][A-Z\s\-\.]{0,50})</)[1].trim();
          if (extracted.length > 2 && extracted.length < 50 && 
              !extracted.includes('XXXXX') && 
              !extracted.includes('EIN') &&
              !extracted.includes('SSN')) {
            employerName = extracted;
            break;
          }
        }
      }

      const wagesMatch = sectionHtml.match(/Wages, Tips and Other Compensation:[^$]*\$([0-9,]+\.\d{2})/);
      let wages = 0;
      if (wagesMatch) {
        wages = parseFloat(wagesMatch[1].replace(/,/g, ''));
      }

      const has401k = sectionHtml.includes('Code "AA"') || 
                      sectionHtml.includes('401(k)') ||
                      sectionHtml.includes('Designated Roth');

      return {
        employer_name: employerName,
        ein: ein,
        wages: wages,
        wages_formatted: `$${wages.toLocaleString('en-US', {minimumFractionDigits: 2})}`,
        has_401k: has401k,
        job_title: 'W-2 Employee',
        employment_type: 'W-2'
      };
    } catch (error) {
      console.error('Error parsing W-2 section:', error);
      return null;
    }
  }

  extractSSN() {
    const ssnMatch = this.html.match(/SSN Provided:.*?(XXX-XX-\d{4})/i) ||
                     this.html.match(/Social Security Number:.*?(XXX-XX-\d{4})/i);
    return ssnMatch ? ssnMatch[1] : 'XXX-XX-XXXX';
  }

  extractTaxYear() {
    const yearMatch = this.html.match(/Tax Period Requested:.*?(\d{4})|December,\s*(\d{4})/i);
    if (yearMatch) {
      return yearMatch[1] || yearMatch[2] || new Date().getFullYear();
    }
    return new Date().getFullYear();
  }

  calculateTotalIncome(employers) {
    return employers.reduce((sum, e) => sum + (e.wages || 0), 0);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = IRSEmploymentParser;
}
