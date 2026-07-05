const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function main() {
  const pool = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'atchms',
    password: 'AtcHms2026!',
    database: 'atc_hostel_db'
  });

  const passwordHash = await bcrypt.hash('Test@1234', 10);

  await pool.execute(`
    INSERT INTO users (fullname, email, password_hash, role, admission_no, programme, academic_year, phone_no)
    VALUES (?, ?, ?, 'student', ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE fullname = fullname
  `, [
    'Test Invader',
    'testinvader@mail.com',
    passwordHash,
    '99999999999',
    'Computer Engineering',
    '2025/2026',
    '+255700000000'
  ]);

  console.log('✅ Test student inserted:');
  console.log('   Name:         Test Invader');
  console.log('   Email:        testinvader@mail.com');
  console.log('   Password:     Test@1234');
  console.log('   Admission No: 99999999999');
  console.log('   Status:       NOT whitelisted — will be BLOCKED on login');

  await pool.end();
}

main().catch(console.error);
