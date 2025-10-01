// pages/api/webhooks/slack-notify.js
// This endpoint receives webhooks from Supabase and sends Slack notifications

export default async function handler(req, res) {
  // Verify this is a POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the Slack webhook URL from environment variables
  const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
  
  if (!SLACK_WEBHOOK_URL) {
    console.error('SLACK_WEBHOOK_URL not configured');
    return res.status(500).json({ error: 'Slack webhook not configured' });
  }

  try {
    // Parse the Supabase webhook payload
    const { type, table, record, old_record } = req.body;
    
    // Only process INSERT events on verification_requests table
    if (type !== 'INSERT' || table !== 'verification_requests') {
      return res.status(200).json({ message: 'Event ignored' });
    }

    // Extract request details
    const {
      request_id,
      taxpayer_name,
      taxpayer_ssn_last4,
      taxpayer_email,
      current_address,
      city,
      state,
      zip_code,
      telephone,
      tax_years,
      tax_forms,
      status,
      created_at,
      metadata
    } = record;

    // Parse metadata for additional info
    const metaData = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    const source = metaData?.source || 'Unknown';
    const isTestMode = record.ssn_hash === 'test' || taxpayer_ssn_last4?.startsWith('000');
    
    // Determine emoji and color based on status
    const emoji = isTestMode ? '🧪' : '📋';
    const color = isTestMode ? '#FFA500' : '#36C5F0';
    
    // Format tax years and forms for display
    const taxYearsFormatted = Array.isArray(tax_years) ? tax_years.join(', ') : tax_years;
    const taxFormsFormatted = Array.isArray(tax_forms) ? tax_forms.join(', ') : tax_forms;
    
    // Build Slack message
    const slackMessage = {
      text: `${emoji} New IRS Verification Request: ${request_id}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} New IRS Verification Request`,
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Request ID:*\n\`${request_id}\``
            },
            {
              type: 'mrkdwn',
              text: `*Status:*\n${status} ${isTestMode ? '(Test Mode)' : '(Production)'}`
            },
            {
              type: 'mrkdwn',
              text: `*Taxpayer:*\n${taxpayer_name}`
            },
            {
              type: 'mrkdwn',
              text: `*SSN (Last 4):*\n${taxpayer_ssn_last4 || 'Not provided'}`
            },
            {
              type: 'mrkdwn',
              text: `*Email:*\n${taxpayer_email || 'Not provided'}`
            },
            {
              type: 'mrkdwn',
              text: `*Phone:*\n${telephone || 'Not provided'}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Address:*\n${current_address || 'Not provided'}\n${city}, ${state} ${zip_code}`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Tax Years:*\n${taxYearsFormatted}`
            },
            {
              type: 'mrkdwn',
              text: `*Forms Requested:*\n${taxFormsFormatted}`
            }
          ]
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Source:* ${source} | *Created:* ${new Date(created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '📄 View Form 8821',
                emoji: true
              },
              url: `https://moderntax-api-live.vercel.app/api/form8821/${request_id}`,
              style: 'primary'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '📊 Check Status',
                emoji: true
              },
              url: `https://moderntax-api-live.vercel.app/api/status/${request_id}`
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '📤 Upload Documents',
                emoji: true
              },
              url: `https://moderntax-api-live.vercel.app/api/professional-portal?request=${request_id}`
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🔍 View in Supabase',
                emoji: true
              },
              url: `https://supabase.com/dashboard/project/nixzwnfjglojemozlvmf/editor/table-editor/verification_requests?filter=request_id%3Aeq%3A${request_id}`
            }
          ]
        }
      ],
      attachments: [
        {
          color: color,
          footer: 'ModernTax API',
          footer_icon: 'https://moderntax-api-live.vercel.app/favicon.ico',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    // Add warning if address fields are missing
    if (!current_address || current_address === 'Address required' || 
        !city || city === 'City required' || 
        state === 'XX' || 
        zip_code === '00000') {
      slackMessage.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚠️ *Warning:* Missing required Form 8821 fields (address/city/state/zip). Request may not be processable.`
        }
      });
    }

    // Send to Slack
    const slackResponse = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage)
    });

    if (!slackResponse.ok) {
      throw new Error(`Slack webhook failed: ${slackResponse.status}`);
    }

    // Log success
    console.log(`Slack notification sent for request: ${request_id}`);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Slack notification sent',
      request_id 
    });

  } catch (error) {
    console.error('Error sending Slack notification:', error);
    return res.status(500).json({ 
      error: 'Failed to send Slack notification',
      details: error.message 
    });
  }
}
