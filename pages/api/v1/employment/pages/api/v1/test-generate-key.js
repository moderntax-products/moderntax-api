import { APIKeyService } from '@/lib/api-keys';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = await APIKeyService.generateAPIKey('employer_com', 'employercom');
    
    return res.status(200).json({
      success: true,
      message: '✅ API Key generated successfully!',
      apiKey: apiKey,
      warning: '⚠️ Save this securely - shown only once!'
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}