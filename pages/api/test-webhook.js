export default async function handler(req, res) {
  const testUrl = req.query.url || 'https://webhook.site/304a24a8-a91f-457a-ad36-47e5aa33b960';
  
  try {
    console.log('Attempting to send webhook to:', testUrl);
    
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ModernTax-Test/1.0'
      },
      body: JSON.stringify({
        test: true,
        timestamp: new Date().toISOString(),
        message: 'This is a test webhook from ModernTax'
      })
    });
    
    return res.status(200).json({
      success: true,
      webhook_url: testUrl,
      status: response.status,
      statusText: response.statusText
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).json({
      success: false,
      webhook_url: testUrl,
      error: error.message
    });
  }
}
