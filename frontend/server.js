const express = require('express');
const mysql   = require('mysql2/promise');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');

const app = express();
const PORT = 4000;
const JWT_SECRET = 'atchms_jwt_2026_ATC_secret';

// Web Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self' http: https: data: 'unsafe-inline' 'unsafe-eval';");
  next();
});

app.use(cors({ origin: '*' }));
app.use(express.json());

const pool = mysql.createPool({
  host: '127.0.0.1', user: 'atchms', password: 'AtcHms2026!',
  database: 'atc_hostel_db', waitForConnections: true, connectionLimit: 10
});

// Auto-initialize Tables
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        action VARCHAR(100) NOT NULL,
        target VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(100) NOT NULL,
        token VARCHAR(6) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Audit logs and password resets tables verified/created.');
  } catch (e) {
    console.error('Database Initialization failed:', e.message);
  }
})();

// Audit logging helper
const logAction = async (username, action, target, req) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    await pool.execute(
      'INSERT INTO audit_logs (username, action, target, ip_address) VALUES (?,?,?,?)',
      [username || 'anonymous', action, target, ip]
    );
  } catch (err) {
    console.error('Logging failed:', err.message);
  }
};

// Rate Limiter for Login
const loginAttempts = {};
const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  
  if (loginAttempts[ip]) {
    const attempt = loginAttempts[ip];
    if (attempt.count >= 5 && now - attempt.lastAttempt < 15 * 60 * 1000) {
      return res.status(429).json({
        error: 'Too many failed login attempts. Account temporarily locked for 15 minutes.'
      });
    }
    if (now - attempt.lastAttempt > 15 * 60 * 1000) {
      attempt.count = 0;
    }
  }
  next();
};

/* ── Middleware ── */
const auth = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(h.split(' ')[1], JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
};
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });

/* ── Health ── */
app.get('/api/health', (req, res) => res.json({ status: 'ok', db: 'atc_hostel_db' }));

/* ── AUTH ── */
app.post('/api/auth/register', async (req, res) => {
  const { fullname, email, password, admission_no, programme, academic_year, phone_no } = req.body;
  if (!fullname || !email || !password || !phone_no)
    return res.status(400).json({ error: 'Missing required fields' });
  
  // Regex Inputs Validations
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^0\d{9}$/;
  const admRegex = /^[0-9]{11}$/;

  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format.' });
  }
  if (!phoneRegex.test(phone_no)) {
    return res.status(400).json({ error: 'Phone number must be exactly 10 digits starting with 0 (e.g. 0713445667).' });
  }
  if (admission_no && !admRegex.test(admission_no)) {
    return res.status(400).json({ error: 'Admission Number must follow the 11-digit numeric format (e.g. 25050512146).' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const [r] = await pool.execute(
      `INSERT INTO users (fullname,email,password_hash,admission_no,programme,academic_year,phone_no)
       VALUES (?,?,?,?,?,?,?)`,
      [fullname, email, hash, admission_no||null, programme||null, academic_year||null, phone_no]
    );
    
    await logAction(email, 'user_creation', `Registered account id ${r.insertId}`, req);
    res.json({ success: true, id: r.insertId, message: 'Registration successful!' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ error: 'Email or admission number already registered.' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', rateLimitMiddleware, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Admission number/Email and password required' });
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    let query = 'SELECT * FROM users WHERE email=?';
    if (!email.includes('@')) {
      query = 'SELECT * FROM users WHERE admission_no=?';
    }
    const [rows] = await pool.execute(query, [email]);
    if (!rows.length) {
      if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, lastAttempt: 0 };
      loginAttempts[ip].count++;
      loginAttempts[ip].lastAttempt = Date.now();
      await logAction(email, 'failed_login', 'Invalid email credentials', req);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = rows[0];
    if (!(await bcrypt.compare(password, user.password_hash))) {
      if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, lastAttempt: 0 };
      loginAttempts[ip].count++;
      loginAttempts[ip].lastAttempt = Date.now();
      await logAction(email, 'failed_login', 'Invalid password credentials', req);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Clear login attempts on success
    if (loginAttempts[ip]) delete loginAttempts[ip];

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.fullname, email: user.email },
      JWT_SECRET, { expiresIn: '1h' } // 1 hour token expiration
    );
    
    await logAction(email, 'login', 'Successful sign-in', req);

    res.json({ token, user: { id: user.id, fullname: user.fullname, role: user.role,
      email: user.email, admission_no: user.admission_no, programme: user.programme,
      academic_year: user.academic_year, phone_no: user.phone_no } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PASSWORD RESET FLOW ── */
app.post('/api/auth/forgot-password', async (req, res) => {
  const { admission_no } = req.body;
  if (!admission_no) return res.status(400).json({ error: 'Admission number is required.' });
  try {
    const [rows] = await pool.execute('SELECT email FROM users WHERE admission_no=?', [admission_no]);
    if (!rows.length) {
      return res.status(400).json({ error: 'No account found with this admission number.' });
    }
    
    const email = rows[0].email;
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    await pool.execute('DELETE FROM password_resets WHERE email=?', [email]);
    await pool.execute(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
      [email, token, expiresAt]
    );
    
    await logAction(admission_no, 'password_reset_request', 'Requested one-time OTP reset token via admission number', req);
    
    res.json({
      success: true,
      message: `Reset token generated successfully! (Simulation OTP: ${token})`,
      token: token
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { admission_no, token, new_password } = req.body;
  if (!admission_no || !token || !new_password) {
    return res.status(400).json({ error: 'Admission number, token and new password are required.' });
  }
  try {
    const [userRows] = await pool.execute('SELECT email FROM users WHERE admission_no=?', [admission_no]);
    if (!userRows.length) {
      return res.status(400).json({ error: 'No account found with this admission number.' });
    }
    const email = userRows[0].email;

    const [rows] = await pool.execute(
      'SELECT * FROM password_resets WHERE email=? AND token=? AND expires_at > NOW()',
      [email, token]
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }
    
    const hash = await bcrypt.hash(new_password, 12);
    await pool.execute('UPDATE users SET password_hash=? WHERE email=?', [hash, email]);
    await pool.execute('DELETE FROM password_resets WHERE email=?', [email]);
    
    await logAction(admission_no, 'password_reset_success', 'Successfully reset account password via admission number', req);
    res.json({ success: true, message: 'Password reset successfully!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PROFILE (fresh user data from DB) ── */
app.get('/api/auth/profile', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, fullname, email, admission_no, programme, academic_year, phone_no, role FROM users WHERE id=?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── HOSTELS ── */
app.get('/api/hostels', async (req, res) => {
  try { const [r] = await pool.execute('SELECT * FROM hostels ORDER BY id'); res.json(r); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── ROOMS ── */
app.get('/api/rooms', async (req, res) => {
  try {
    const [r] = await pool.execute(
      `SELECT r.*, h.name AS hostel_name, h.gender_type
       FROM rooms r JOIN hostels h ON r.hostel_id=h.id ORDER BY r.hostel_id, r.room_number`
    );
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── APPLICATIONS ── */
app.post('/api/applications', auth, async (req, res) => {
  const { preferred_hostel_id } = req.body;
  if (!preferred_hostel_id) return res.status(400).json({ error: 'Preferred hostel required' });
  try {
    const [ex] = await pool.execute(
      'SELECT id FROM applications WHERE student_id=? AND status IN ("pending","approved")',
      [req.user.id]
    );
    if (ex.length) return res.status(400).json({ error: 'You already have an active application.' });
    const [r] = await pool.execute(
      'INSERT INTO applications (student_id,preferred_hostel_id) VALUES (?,?)',
      [req.user.id, preferred_hostel_id]
    );
    res.json({ success: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/applications', auth, async (req, res) => {
  try {
    let r;
    if (req.user.role === 'admin') {
      [r] = await pool.execute(
        `SELECT a.*, u.fullname, u.admission_no, u.programme, u.academic_year, h.name AS hostel_name
         FROM applications a JOIN users u ON a.student_id=u.id
         JOIN hostels h ON a.preferred_hostel_id=h.id ORDER BY a.submitted_date DESC`
      );
    } else {
      [r] = await pool.execute(
        `SELECT a.*, h.name AS hostel_name FROM applications a
         JOIN hostels h ON a.preferred_hostel_id=h.id WHERE a.student_id=? ORDER BY a.submitted_date DESC`,
        [req.user.id]
      );
    }
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/applications/:id', auth, adminOnly, async (req, res) => {
  const { status, remarks } = req.body;
  if (!['approved','rejected'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Update application status
    await conn.execute(
      'UPDATE applications SET status=?, decision_date=NOW(), remarks=? WHERE id=?',
      [status, remarks||null, req.params.id]
    );

    let warning = null;

    if (status === 'approved') {
      // 2. Fetch application and student details
      const [[appDetails]] = await conn.execute(
        'SELECT student_id, preferred_hostel_id FROM applications WHERE id = ?',
        [req.params.id]
      );

      if (appDetails) {
        // Fetch hostel fee
        const [[hostel]] = await conn.execute(
          'SELECT fee_per_semester FROM hostels WHERE id = ?',
          [appDetails.preferred_hostel_id]
        );

        const feeAmount = hostel ? hostel.fee_per_semester : 120000;

        // 3. Find first available room in the preferred hostel block
        const [availableRooms] = await conn.execute(
          'SELECT id, room_number FROM rooms WHERE hostel_id = ? AND occupied_count < capacity LIMIT 1',
          [appDetails.preferred_hostel_id]
        );

        if (availableRooms.length > 0) {
          const room = availableRooms[0];

          // 4. Create allocation record (avoid duplicate active allocation)
          const [existingAlloc] = await conn.execute(
            'SELECT id FROM allocations WHERE student_id = ? AND status = "active"',
            [appDetails.student_id]
          );

          if (existingAlloc.length === 0) {
            await conn.execute(
              'INSERT INTO allocations (student_id, room_id, academic_year, lease_end_date) VALUES (?, ?, "2026/2027", "2027-06-30")',
              [appDetails.student_id, room.id]
            );

            // 5. Update room occupied count
            await conn.execute(
              'UPDATE rooms SET occupied_count = occupied_count + 1 WHERE id = ?',
              [room.id]
            );
          }

          // 6. Generate GePG Control Number & Create Billing
          const cn = '9922' + Math.floor(10000000 + Math.random() * 90000000).toString();
          await conn.execute(
            'INSERT INTO payments (student_id, control_number, amount, payment_type) VALUES (?, ?, ?, "Semester 1 Hostel Fee")',
            [appDetails.student_id, cn, feeAmount]
          );

          await logAction(req.user.email, 'allocation_approval', `Approved app ${req.params.id}, allocated room ${room.room_number}, control number ${cn}`, req);
        } else {
          warning = 'Application approved, but no available rooms in preferred hostel block. Placed on waitlist.';
          await logAction(req.user.email, 'allocation_waitlist', `Approved app ${req.params.id} but waitlisted (no rooms)`, req);
        }
      }
    } else {
      await logAction(req.user.email, 'allocation_rejection', `Rejected application ${req.params.id}`, req);
    }

    await conn.commit();
    res.json({ success: true, warning });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

/* ── ALLOCATIONS ── */
app.get('/api/allocations/mine', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.academic_year, a.status, a.allocated_on, a.lease_end_date,
              r.room_number, r.floor, r.capacity, r.occupied_count,
              h.name AS hostel_name, h.gender_type
       FROM allocations a
       JOIN rooms r ON a.room_id = r.id
       JOIN hostels h ON r.hostel_id = h.id
       WHERE a.student_id = ? AND a.status = 'active'
       LIMIT 1`,
      [req.user.id]
    );
    if (!rows.length) return res.json({ error: 'No active allocation' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/allocations', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.*, u.fullname, u.admission_no, r.room_number, h.name AS hostel_name
       FROM allocations a
       JOIN users u ON a.student_id = u.id
       JOIN rooms r ON a.room_id = r.id
       JOIN hostels h ON r.hostel_id = h.id
       ORDER BY a.allocated_on DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PAYMENTS ── */
app.get('/api/payments', auth, async (req, res) => {
  try {
    let r;
    if (req.user.role === 'admin') {
      [r] = await pool.execute(
        `SELECT p.*, u.fullname, u.admission_no FROM payments p
         JOIN users u ON p.student_id=u.id ORDER BY p.created_at DESC`
      );
    } else {
      [r] = await pool.execute(
        'SELECT * FROM payments WHERE student_id=? ORDER BY created_at DESC', [req.user.id]
      );
    }
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payments/pay', auth, async (req, res) => {
  const { control_number, transaction_reference, payment_method } = req.body;
  if (!control_number || !transaction_reference) {
    return res.status(400).json({ error: 'Control number and transaction reference are required.' });
  }
  try {
    const [payRows] = await pool.execute('SELECT * FROM payments WHERE control_number=? AND student_id=?', [control_number, req.user.id]);
    if (!payRows.length) return res.status(400).json({ error: 'Invalid control number.' });
    
    const payment = payRows[0];
    if (payment.status === 'paid') return res.status(400).json({ error: 'This bill has already been paid.' });
    
    await pool.execute(
      'UPDATE payments SET status="paid", payment_method=?, transaction_reference=?, paid_at=NOW() WHERE id=?',
      [payment_method || 'M-Pesa', transaction_reference, payment.id]
    );
    
    await logAction(req.user.email, 'payment_received', `Paid TSh ${payment.amount} for ${payment.payment_type}`, req);
    res.json({ success: true, message: 'Payment verified and marked as PAID!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payments', auth, adminOnly, async (req, res) => {
  const { student_id, amount, payment_type } = req.body;
  const cn = Math.floor(100000000000 + Math.random() * 900000000000).toString();
  try {
    const [r] = await pool.execute(
      'INSERT INTO payments (student_id,control_number,amount,payment_type) VALUES (?,?,?,?)',
      [student_id, cn, amount, payment_type]
    );
    res.json({ success: true, control_number: cn, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── MAINTENANCE ── */
app.get('/api/maintenance', auth, async (req, res) => {
  try {
    let r;
    if (req.user.role === 'admin') {
      [r] = await pool.execute(
        `SELECT m.*, u.fullname, u.admission_no FROM maintenance_tickets m
         JOIN users u ON m.student_id=u.id ORDER BY m.submitted_at DESC`
      );
    } else {
      [r] = await pool.execute(
        'SELECT * FROM maintenance_tickets WHERE student_id=? ORDER BY submitted_at DESC', [req.user.id]
      );
    }
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/maintenance', auth, async (req, res) => {
  const { title, description, priority } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Title and description required' });
  try {
    const [r] = await pool.execute(
      'INSERT INTO maintenance_tickets (student_id,room_id,title,description,priority) VALUES (?,1,?,?,?)',
      [req.user.id, title, description, priority||'medium']
    );
    res.json({ success: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/maintenance/:id', auth, adminOnly, async (req, res) => {
  const { status } = req.body;
  const resolved = status === 'resolved' ? new Date() : null;
  try {
    await pool.execute('UPDATE maintenance_tickets SET status=?, resolved_at=? WHERE id=?',
      [status, resolved, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── ROOMS & ALLOCATIONS ── */
app.get('/api/rooms', auth, async (req, res) => {
  try {
    const [r] = await pool.execute(
      `SELECT r.*, h.name AS hostel_name, h.gender_type FROM rooms r
       JOIN hostels h ON r.hostel_id=h.id`
    );
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/allocations/my', auth, async (req, res) => {
  try {
    const [allocs] = await pool.execute(
      `SELECT a.*, r.room_number, h.name AS hostel_name, h.gender_type
       FROM allocations a
       JOIN rooms r ON a.room_id = r.id
       JOIN hostels h ON r.hostel_id = h.id
       WHERE a.student_id = ? AND a.status = 'active'`,
      [req.user.id]
    );
    if (allocs.length === 0) {
      return res.json({ allocated: false });
    }
    const alloc = allocs[0];
    
    const [roommates] = await pool.execute(
      `SELECT u.fullname, u.email, u.admission_no, u.programme, u.academic_year, u.phone_no
       FROM allocations al JOIN users u ON al.student_id = u.id
       WHERE al.room_id = ? AND al.student_id != ? AND al.status = 'active'`,
      [alloc.room_id, req.user.id]
    );
    
    res.json({
      allocated: true,
      room_number: alloc.room_number,
      floor: '2nd Floor',
      hostel_name: alloc.hostel_name,
      gender_type: alloc.gender_type,
      allocated_on: alloc.allocated_on,
      lease_end_date: alloc.lease_end_date,
      roommates: roommates
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── STUDENTS (admin) ── */
app.get('/api/students', auth, adminOnly, async (req, res) => {
  try {
    const [r] = await pool.execute(
      `SELECT u.id, u.fullname, u.email, u.admission_no, u.programme, u.academic_year,
              u.phone_no, u.created_at,
              a.status AS application_status, h.name AS hostel_name
       FROM users u
       LEFT JOIN applications a ON a.student_id=u.id
       LEFT JOIN hostels h ON a.preferred_hostel_id=h.id
       WHERE u.role='student' ORDER BY u.created_at DESC`
    );
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── DASHBOARD STATS ── */
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const [[{ total_students }]] = await pool.execute(
      'SELECT COUNT(*) AS total_students FROM users WHERE role="student"');
    const [[{ total_applications }]] = await pool.execute(
      'SELECT COUNT(*) AS total_applications FROM applications');
    const [[{ pending }]] = await pool.execute(
      'SELECT COUNT(*) AS pending FROM applications WHERE status="pending"');
    const [[{ open_tickets }]] = await pool.execute(
      'SELECT COUNT(*) AS open_tickets FROM maintenance_tickets WHERE status="open"');
    const [[{ total_rooms }]] = await pool.execute(
      'SELECT SUM(total_rooms) AS total_rooms FROM hostels');
    const [[{ total_occupied }]] = await pool.execute(
      'SELECT SUM(occupied_count) AS total_occupied FROM rooms');
    const cap = (total_rooms||0)*2, occ = total_occupied||0;
    res.json({ total_students, total_applications,
      pending_applications: pending, open_tickets,
      occupancy: cap>0 ? Math.round((occ/cap)*100) : 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, '127.0.0.1', () =>
  console.log(`✅ ATCHMS API running on http://127.0.0.1:${PORT}`));
