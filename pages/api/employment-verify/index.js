export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { employee } = req.body;

  if (!employee) {
    return res.status(400).json({
      error: 'Missing "employee" field',
    });
  }

  const required = ['ssn', 'first_name', 'last_name', 'employer_name'];
  const missing = required.filter((field) => !employee[field]);

  if (missing.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missing.join(', ')}`,
    });
  }

  return res.status(200).json({
    request_id: `req_${Date.now()}`,
    status: 'success',
    message: 'Request received and processed',
    employee_info: {
      name: `${employee.first_name} ${employee.last_name}`,
      ssn_last_four: employee.ssn.slice(-4),
    },
    employer: employee.employer_name,
  });
}
