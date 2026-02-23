import crypto from 'crypto';

export class APIKeyService {
  static async verifyAPIKey(bearerToken) {
    const validKey = process.env.EMPLOYER_API_KEY || 'mt_live_emp_employercom_prod';
    return { 
      valid: bearerToken === validKey,
      client: bearerToken === validKey ? 'employer.com' : null
    };
  }
}
