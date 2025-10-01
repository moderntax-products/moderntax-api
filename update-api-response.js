// In the API response, provide both PDF and TXT options
documents: {
  transcript_pdf: `https://moderntax-api-live.vercel.app/api/documents/${requestId}/transcript.pdf`,
  transcript_txt: `https://moderntax-api-live.vercel.app/api/documents/${requestId}/transcript.txt`,
  transcript_html: `https://moderntax-api-live.vercel.app/api/documents/${requestId}/transcript.html`,
  forms_available: ['1040', 'W-2', 'Schedule C'],
  retrieval_endpoint: `/api/documents/${requestId}`,
  expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
}
