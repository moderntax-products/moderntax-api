export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { employee } = req.body;

  if (!employee) {
    return res.status(400).json({ error: 'Missing employee field' });
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
