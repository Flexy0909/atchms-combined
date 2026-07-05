const mysql = require('mysql2/promise');

(async () => {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'atchms',
    password: 'AtcHms2026!',
    database: 'atc_hostel_db'
  });

  try {
    console.log('Creating notifications table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(150) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Notifications table created successfully!');
  } catch (err) {
    console.error('Error creating table:', err.message);
  } finally {
    await connection.end();
  }
})();
