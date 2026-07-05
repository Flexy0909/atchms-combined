const mysql = require('mysql2/promise');

(async () => {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'atchms',
    password: 'AtcHms2026!',
    database: 'atc_hostel_db'
  });

  try {
    console.log('Creating allowed_admissions table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS allowed_admissions (
        admission_no VARCHAR(30) PRIMARY KEY,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add the user's tester admission number by default if it exists (e.g. 25050512146)
    await connection.execute(`
      INSERT IGNORE INTO allowed_admissions (admission_no) VALUES ('25050512146')
    `);
    
    console.log('✅ allowed_admissions table created and default tester whitelisted successfully!');
  } catch (err) {
    console.error('Error creating table:', err.message);
  } finally {
    await connection.end();
  }
})();
