export default function Home() {
  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: '800px',
      margin: '50px auto',
      padding: '20px',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>🚀 ModernTax API</h1>
      <h2 style={{ color: '#666', marginBottom: '40px' }}>Conductiv Integration Portal</h2>
      
      <div style={{
        background: '#f5f5f5',
        padding: '30px',
        borderRadius: '10px',
        marginBottom: '30px',
        textAlign: 'left'
      }}>
        <h3>API Status: ✅ LIVE</h3>
        <p><strong>Endpoint:</strong> <code>/api/verify</code></p>
        <p><strong>Method:</strong> POST</p>
        <p><strong>API Key:</strong> <code>mt_prod_conductiv_2025_3c651d11d29e</code></p>
      </div>

      <div style={{
        background: '#e3f2fd',
        padding: '20px',
        borderRadius: '10px',
        marginBottom: '30px'
      }}>
        <h3>Quick Test</h3>
        <button 
          onClick={() => {
            fetch('/api/verify', {
              method: 'POST',
              headers: {
                'X-API-Key': 'mt_prod_conductiv_2025_3c651d11d29e',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ test: true })
            })
            .then(r => r.json())
            .then(data => {
              document.getElementById('result').innerHTML = 
                '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
            })
            .catch(err => {
              document.getElementById('result').innerHTML = 
                '<p style="color:red">Error: ' + err.message + '</p>';
            });
          }}
          style={{
            background: '#2196F3',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          Test API Endpoint
        </button>
        <div id="result" style={{ marginTop: '20px' }}></div>
      </div>

      <div style={{ marginTop: '40px', color: '#666' }}>
        <p>📧 Support: matt@moderntax.io</p>
        <p>📱 Phone: 650-741-1085</p>
      </div>
    </div>
  );
}
