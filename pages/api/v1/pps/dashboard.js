/**
 * GET /api/v1/pps/dashboard
 *
 * Serves the PPS call dashboard as a self-contained HTML page.
 * Connects to the WebSocket server for live call monitoring.
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wsHost = process.env.PPS_WS_HOST || 'localhost:8080';
  const apiBase = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ModernTax - IRS PPS Call Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f1117;
      color: #e4e4e7;
      min-height: 100vh;
    }
    .header {
      background: #18181b;
      border-bottom: 1px solid #27272a;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { font-size: 20px; font-weight: 600; }
    .header .subtitle { color: #71717a; font-size: 13px; margin-top: 2px; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }
    .status-badge.connected { background: #052e16; color: #4ade80; }
    .status-badge.disconnected { background: #450a0a; color: #f87171; }
    .status-badge .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: currentColor;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    .container { display: grid; grid-template-columns: 1fr 380px; gap: 0; height: calc(100vh - 65px); }

    /* Stats Bar */
    .stats-bar {
      grid-column: 1 / -1;
      background: #18181b;
      border-bottom: 1px solid #27272a;
      display: flex;
      gap: 0;
      padding: 0;
    }
    .stat-card {
      flex: 1;
      padding: 16px 20px;
      border-right: 1px solid #27272a;
    }
    .stat-card:last-child { border-right: none; }
    .stat-card .label { font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-card .value { font-size: 28px; font-weight: 700; margin-top: 4px; }
    .stat-card .value.green { color: #4ade80; }
    .stat-card .value.blue { color: #60a5fa; }
    .stat-card .value.yellow { color: #facc15; }

    /* Main transcript area */
    .transcript-panel {
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
    .transcript-panel h2 { font-size: 14px; color: #71717a; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }

    .segment {
      display: flex;
      gap: 12px;
      padding: 8px 12px;
      border-radius: 8px;
      margin-bottom: 4px;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .segment.irs_agent { background: #1e1b4b20; border-left: 3px solid #818cf8; }
    .segment.practitioner { background: #052e1620; border-left: 3px solid #4ade80; }
    .segment.unknown { background: #27272a40; border-left: 3px solid #71717a; }
    .segment .speaker {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      min-width: 100px;
      padding-top: 2px;
    }
    .segment .speaker.irs_agent { color: #818cf8; }
    .segment .speaker.practitioner { color: #4ade80; }
    .segment .text { font-size: 14px; line-height: 1.5; }
    .segment .time { font-size: 11px; color: #52525b; min-width: 60px; text-align: right; padding-top: 2px; }
    .segment.interim { opacity: 0.5; }

    /* Side panel */
    .side-panel {
      background: #18181b;
      border-left: 1px solid #27272a;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .panel-section {
      padding: 16px 20px;
      border-bottom: 1px solid #27272a;
    }
    .panel-section h3 {
      font-size: 12px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }

    /* Call phase indicator */
    .phase-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #27272a;
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .phase-indicator .phase-dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: #facc15;
      animation: pulse 1.5s infinite;
    }
    .phase-indicator .phase-name { font-size: 14px; font-weight: 500; }

    /* Request cards */
    .request-card {
      background: #27272a;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .request-card .biz-name { font-weight: 600; font-size: 14px; }
    .request-card .ein { font-size: 12px; color: #71717a; margin-top: 2px; }
    .request-card .details { font-size: 12px; color: #a1a1aa; margin-top: 8px; }
    .request-card .req-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      margin-top: 8px;
    }
    .request-card .req-status.sent { background: #052e16; color: #4ade80; }
    .request-card .req-status.in_progress { background: #422006; color: #facc15; }
    .request-card .req-status.pending { background: #27272a; color: #71717a; }

    /* AI suggestions */
    .suggestion {
      padding: 8px 12px;
      background: #1e1b4b30;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 6px;
      border-left: 2px solid #818cf8;
    }
    .issue {
      padding: 8px 12px;
      background: #450a0a30;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 6px;
      border-left: 2px solid #f87171;
    }

    /* Controls */
    .controls { padding: 16px 24px; background: #18181b; border-top: 1px solid #27272a; display: flex; gap: 12px; grid-column: 1 / -1; }
    .btn {
      padding: 8px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      border: none;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-primary { background: #4f46e5; color: white; }
    .btn-primary:hover { background: #4338ca; }
    .btn-danger { background: #dc2626; color: white; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-secondary { background: #27272a; color: #e4e4e7; }
    .btn-secondary:hover { background: #3f3f46; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Start call form */
    .start-form { display: none; padding: 24px; grid-column: 1 / -1; }
    .start-form.active { display: block; }
    .start-form h2 { font-size: 18px; margin-bottom: 16px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 13px; color: #a1a1aa; margin-bottom: 4px; }
    .form-group input, .form-group select {
      width: 100%;
      padding: 8px 12px;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 6px;
      color: #e4e4e7;
      font-size: 14px;
    }
    .form-group input:focus, .form-group select:focus { outline: none; border-color: #4f46e5; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>IRS PPS Call Dashboard</h1>
      <div class="subtitle">ModernTax Automated Calling System</div>
    </div>
    <div id="wsStatus" class="status-badge disconnected">
      <span class="dot"></span>
      <span>Disconnected</span>
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat-card">
      <div class="label">Call Status</div>
      <div class="value" id="callStatus">Idle</div>
    </div>
    <div class="stat-card">
      <div class="label">Duration</div>
      <div class="value blue" id="callDuration">0:00</div>
    </div>
    <div class="stat-card">
      <div class="label">Requests</div>
      <div class="value green" id="requestCount">0</div>
    </div>
    <div class="stat-card">
      <div class="label">Phase</div>
      <div class="value yellow" id="currentPhase">-</div>
    </div>
  </div>

  <div class="container">
    <div class="transcript-panel" id="transcriptPanel">
      <h2>Live Transcript</h2>
      <div id="transcriptList"></div>
    </div>

    <div class="side-panel">
      <div class="panel-section">
        <h3>Current Phase</h3>
        <div class="phase-indicator">
          <div class="phase-dot" id="phaseDot"></div>
          <div class="phase-name" id="phaseName">Idle</div>
        </div>
      </div>

      <div class="panel-section">
        <h3>Transcript Requests</h3>
        <div id="requestsList">
          <div style="color: #52525b; font-size: 13px;">No active requests</div>
        </div>
      </div>

      <div class="panel-section">
        <h3>AI Suggestions</h3>
        <div id="suggestionsList">
          <div style="color: #52525b; font-size: 13px;">Waiting for call to start...</div>
        </div>
      </div>

      <div class="panel-section">
        <h3>Issues</h3>
        <div id="issuesList">
          <div style="color: #52525b; font-size: 13px;">No issues detected</div>
        </div>
      </div>
    </div>
  </div>

  <div class="controls">
    <button class="btn btn-primary" id="startBtn" onclick="showStartForm()">Start New Call</button>
    <button class="btn btn-danger" id="endBtn" onclick="endCurrentCall()" disabled>End Call</button>
    <button class="btn btn-secondary" onclick="connectWS()">Reconnect WS</button>
  </div>

  <script>
    const API_BASE = '${apiBase}';
    const WS_HOST = '${wsHost}';
    const API_KEY = localStorage.getItem('pps_api_key') || prompt('Enter your PPS API key:');
    if (API_KEY) localStorage.setItem('pps_api_key', API_KEY);

    let ws = null;
    let currentCallId = null;
    let callStartTime = null;
    let durationInterval = null;

    // Connect to WebSocket server
    function connectWS(callId) {
      const url = callId
        ? 'wss://' + WS_HOST + '/dashboard?callId=' + callId
        : 'wss://' + WS_HOST + '/dashboard';

      ws = new WebSocket(url);

      ws.onopen = () => {
        document.getElementById('wsStatus').className = 'status-badge connected';
        document.getElementById('wsStatus').innerHTML = '<span class="dot"></span><span>Connected</span>';
      };

      ws.onclose = () => {
        document.getElementById('wsStatus').className = 'status-badge disconnected';
        document.getElementById('wsStatus').innerHTML = '<span class="dot"></span><span>Disconnected</span>';
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
      };
    }

    function handleWSMessage(msg) {
      switch (msg.type) {
        case 'transcript':
          addTranscriptSegment(msg.data);
          break;
        case 'interim':
          updateInterim(msg.data);
          break;
        case 'analysis':
          updateAnalysis(msg.data);
          break;
        case 'new_request':
          addRequest(msg.data);
          break;
        case 'request_updated':
          updateRequest(msg.data);
          break;
        case 'call_connected':
          document.getElementById('callStatus').textContent = 'Connected';
          break;
        case 'call_ended':
          handleCallEnded(msg.data);
          break;
        case 'state':
          restoreState(msg.data);
          break;
      }
    }

    function addTranscriptSegment(seg) {
      const list = document.getElementById('transcriptList');
      // Remove interim
      const interim = list.querySelector('.interim');
      if (interim) interim.remove();

      const div = document.createElement('div');
      div.className = 'segment ' + seg.speaker;
      const mins = Math.floor(seg.timestampMs / 60000);
      const secs = Math.floor((seg.timestampMs % 60000) / 1000);
      div.innerHTML =
        '<div class="speaker ' + seg.speaker + '">' + formatSpeaker(seg.speaker) + '</div>' +
        '<div class="text">' + escapeHtml(seg.text) + '</div>' +
        '<div class="time">' + mins + ':' + String(secs).padStart(2, '0') + '</div>';
      list.appendChild(div);
      list.parentElement.scrollTop = list.parentElement.scrollHeight;
    }

    function updateInterim(seg) {
      const list = document.getElementById('transcriptList');
      let interim = list.querySelector('.interim');
      if (!interim) {
        interim = document.createElement('div');
        interim.className = 'segment interim ' + seg.speaker;
        list.appendChild(interim);
      }
      interim.innerHTML =
        '<div class="speaker ' + seg.speaker + '">' + formatSpeaker(seg.speaker) + '</div>' +
        '<div class="text">' + escapeHtml(seg.text) + '</div>';
      list.parentElement.scrollTop = list.parentElement.scrollHeight;
    }

    function updateAnalysis(analysis) {
      if (analysis.phase) {
        document.getElementById('phaseName').textContent = formatPhase(analysis.phase);
        document.getElementById('currentPhase').textContent = formatPhase(analysis.phase);
      }

      if (analysis.suggestions?.length) {
        const el = document.getElementById('suggestionsList');
        el.innerHTML = analysis.suggestions.map(s => '<div class="suggestion">' + escapeHtml(s) + '</div>').join('');
      }

      if (analysis.issues?.length) {
        const el = document.getElementById('issuesList');
        el.innerHTML = analysis.issues.map(i => '<div class="issue">' + escapeHtml(i) + '</div>').join('');
      }
    }

    function addRequest(req) {
      const list = document.getElementById('requestsList');
      if (list.querySelector('[data-placeholder]')) list.innerHTML = '';

      const card = document.createElement('div');
      card.className = 'request-card';
      card.id = 'req-' + (req.ein || req.request_order);
      card.innerHTML = renderRequestCard(req);
      list.appendChild(card);

      document.getElementById('requestCount').textContent =
        list.querySelectorAll('.request-card').length;
    }

    function updateRequest(req) {
      const card = document.getElementById('req-' + (req.ein || req.request_order));
      if (card) card.innerHTML = renderRequestCard(req);
    }

    function renderRequestCard(req) {
      return '<div class="biz-name">' + escapeHtml(req.business_name) + '</div>' +
        '<div class="ein">EIN: ' + escapeHtml(req.ein || 'N/A') + '</div>' +
        '<div class="details">' +
          (req.form_types?.length ? 'Forms: ' + req.form_types.join(', ') + '<br>' : '') +
          (req.transcript_types?.length ? 'Types: ' + req.transcript_types.join(', ') + '<br>' : '') +
          (req.tax_years?.length ? 'Years: ' + req.tax_years.join(', ') : '') +
        '</div>' +
        '<span class="req-status ' + (req.status || 'pending') + '">' + (req.status || 'pending') + '</span>';
    }

    function handleCallEnded(data) {
      document.getElementById('callStatus').textContent = 'Completed';
      document.getElementById('endBtn').disabled = true;
      document.getElementById('startBtn').disabled = false;
      if (durationInterval) clearInterval(durationInterval);
    }

    function restoreState(state) {
      if (state.segments) {
        state.segments.forEach(s => addTranscriptSegment(s));
      }
      if (state.phase) {
        document.getElementById('phaseName').textContent = formatPhase(state.phase);
        document.getElementById('currentPhase').textContent = formatPhase(state.phase);
      }
    }

    // API calls
    async function startCall(fromNumber, clients) {
      const resp = await fetch(API_BASE + '/api/v1/pps/start-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ fromNumber, clients }),
      });
      const data = await resp.json();
      if (data.callId) {
        currentCallId = data.callId;
        document.getElementById('callStatus').textContent = 'Dialing...';
        document.getElementById('endBtn').disabled = false;
        document.getElementById('startBtn').disabled = true;

        callStartTime = Date.now();
        durationInterval = setInterval(updateDuration, 1000);

        // Connect WS to this call
        connectWS(currentCallId);
      }
      return data;
    }

    async function endCurrentCall() {
      if (!currentCallId) return;
      await fetch(API_BASE + '/api/v1/pps/end-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ callId: currentCallId }),
      });
    }

    function updateDuration() {
      if (!callStartTime) return;
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      document.getElementById('callDuration').textContent = mins + ':' + String(secs).padStart(2, '0');
    }

    function showStartForm() {
      const from = prompt('Enter the phone number to call from (or leave blank for auto-rotate):');
      startCall(from || undefined, []);
    }

    // Helpers
    function formatSpeaker(s) {
      if (s === 'irs_agent') return 'IRS Agent';
      if (s === 'practitioner') return 'Practitioner';
      return 'Unknown';
    }
    function formatPhase(p) {
      return p.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
    }
    function escapeHtml(s) {
      const div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    }

    // Auto-connect on load
    connectWS();
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
