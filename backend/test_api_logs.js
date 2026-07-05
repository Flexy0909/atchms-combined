async function run() {
  const payload = { email: 'admin@atc.ac.tz', password: 'admin' }; // standard admin account credentials
  try {
    const loginRes = await fetch('http://127.0.0.1:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const loginData = await loginRes.json();
    if (!loginData.token) {
      console.error('Login failed:', loginData);
      return;
    }
    console.log('✅ Logged in successfully. Token obtained.');

    const logsRes = await fetch('http://127.0.0.1:4000/api/admin/audit-logs?limit=5', {
      headers: { 'Authorization': 'Bearer ' + loginData.token, 'Content-Type': 'application/json' }
    });
    const logsData = await logsRes.json();
    console.log('✅ Audit logs response:', JSON.stringify(logsData, null, 2));
  } catch (err) {
    console.error('Error running diagnostic:', err.message);
  }
}
run();
