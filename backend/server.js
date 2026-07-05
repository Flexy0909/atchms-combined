const express = require('express');
const mysql   = require('mysql2/promise');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');
const nodemailer = require('nodemailer');
const fs_env   = require('fs');
const path_env = require('path');

// Native .env file loader (zero dependencies)
try {
  const envPath = path_env.join(__dirname, '.env');
  if (fs_env.existsSync(envPath)) {
    const envConfig = fs_env.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const firstEqual = trimmed.indexOf('=');
      if (firstEqual > 0) {
        const key = trimmed.substring(0, firstEqual).trim();
        const value = trimmed.substring(firstEqual + 1).trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      }
    });
    console.log('[Env] Loaded environment configuration from .env');
  }
} catch (e) {
  console.warn('[Env] Failed to load .env file:', e.message);
}

const app = express();
const PORT = 4000;
const JWT_SECRET = 'atchms_jwt_2026_ATC_secret';

app.set('trust proxy', true);

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

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
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'atchms',
  password: process.env.DB_PASSWORD || 'AtcHms2026!',
  database: process.env.DB_NAME     || 'atc_hostel_db',
  waitForConnections: true,
  connectionLimit: 10
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id INT PRIMARY KEY,
        avatar_url VARCHAR(255) DEFAULT NULL,
        gender VARCHAR(10) DEFAULT NULL,
        programme VARCHAR(255) DEFAULT NULL,
        academic_year VARCHAR(50) DEFAULT NULL,
        phone_no VARCHAR(20) DEFAULT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    `);
    
    try {
      await pool.query("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS layout_json TEXT NULL");
    } catch (alterErr) {
      console.log('Skipping rooms ALTER TABLE:', alterErr.message);
    }

    try {
      await pool.query("ALTER TABLE allocations ADD COLUMN IF NOT EXISTS bed_label VARCHAR(50) NULL");
    } catch (alterErr) {
      console.log('Skipping allocations ALTER TABLE:', alterErr.message);
    }

    console.log('✅ Audit logs, password resets, user profiles, and 3D schema additions verified/created.');
  } catch (e) {
    console.error('Database Initialization failed:', e.message);
  }
})();

// Nodemailer SMTP setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: {
    user: process.env.SMTP_USER || 'ethereal_user_placeholder',
    pass: process.env.SMTP_PASS || 'ethereal_pass_placeholder'
  }
});

const sendEmailAlert = async (to, subject, text, html) => {
  try {
    if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('placeholder')) {
      console.log(`✉️ [EMAIL LOG] to: ${to} | subject: ${subject}\ntext: ${text}`);
      return;
    }
    await transporter.sendMail({
      from: '"ATCHMS Notifications" <noreply@atc.ac.tz>',
      to,
      subject,
      text,
      html
    });
    console.log(`✉️ Email dispatched to ${to}`);
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err.message);
  }
};

// Active SSE connections keyed by user_id
const sseClients = new Map();

const registerSseClient = (userId, res) => {
  const uid = parseInt(userId);
  if (!sseClients.has(uid)) {
    sseClients.set(uid, []);
  }
  sseClients.get(uid).push(res);
};

const unregisterSseClient = (userId, res) => {
  const uid = parseInt(userId);
  const clients = sseClients.get(uid);
  if (clients) {
    const idx = clients.indexOf(res);
    if (idx !== -1) {
      clients.splice(idx, 1);
    }
    if (clients.length === 0) {
      sseClients.delete(uid);
    }
  }
};

const pushNotificationToClient = (userId, notification) => {
  const clients = sseClients.get(parseInt(userId));
  if (clients && clients.length > 0) {
    clients.forEach(res => {
      res.write(`data: ${JSON.stringify(notification)}\n\n`);
    });
  }
};

const createNotification = async (userId, title, message) => {
  try {
    const [result] = await pool.execute(
      'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
      [userId, title, message]
    );
    const notificationId = result.insertId;

    const newNotification = {
      id: notificationId,
      user_id: userId,
      title,
      message,
      is_read: false,
      created_at: new Date()
    };

    pushNotificationToClient(userId, newNotification);

    const [userRows] = await pool.execute('SELECT email, fullname FROM users WHERE id = ?', [userId]);
    if (userRows && userRows.length > 0) {
      const user = userRows[0];
      const emailText = `Hello ${user.fullname},\n\n${message}\n\nBest regards,\nArusha Technical College Hostel Management Team`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0B5D3B;">ATC Hostel Management System</h2>
          <p>Hello <strong>${user.fullname}</strong>,</p>
          <p>${message}</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #718096;">This is an automated notification from ATCHMS. Please do not reply to this email.</p>
        </div>
      `;
      sendEmailAlert(user.email, title, emailText, emailHtml);
    }
  } catch (err) {
    console.error('❌ Error creating notification:', err.message);
  }
};

// Audit logging helper
const logAction = async (username, action, target, req) => {
  const ip = getClientIp(req);
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
  const ip = getClientIp(req);
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
  const { first_name, middle_name, last_name, email, password, admission_no, programme, academic_year, phone_no } = req.body;
  if (!first_name || !last_name || !email || !password || !phone_no)
    return res.status(400).json({ error: 'First name, last name, email, password, and phone number are required.' });
  
  const fullname = [first_name, middle_name, last_name].filter(Boolean).join(' ');

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
      `INSERT INTO users (fullname, first_name, middle_name, last_name, email, password_hash, admission_no, programme, academic_year, phone_no)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [fullname, first_name, middle_name || null, last_name, email, hash, admission_no||null, programme||null, academic_year||null, phone_no]
    );
    
    await logAction(email, 'user_creation', `Registered account id ${r.insertId}`, req);
    res.json({ success: true, id: r.insertId, message: 'Registration successful!' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ error: 'Email or admission number already registered.' });
  }
});

app.post('/api/admin/users', auth, adminOnly, async (req, res) => {
  const { first_name, middle_name, last_name, email, password, admission_no, programme, academic_year, phone_no, gender, role } = req.body;
  if (!first_name || !last_name || !email || !password || !phone_no)
    return res.status(400).json({ error: 'First name, last name, email, password, and phone number are required.' });
  
  const fullname = [first_name, middle_name, last_name].filter(Boolean).join(' ');
  const userRole = role === 'admin' ? 'admin' : 'student';

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^0\d{9}$/;
  const admRegex = /^[0-9]{11}$/;

  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format.' });
  }
  if (!phoneRegex.test(phone_no)) {
    return res.status(400).json({ error: 'Phone number must be exactly 10 digits starting with 0.' });
  }
  if (userRole === 'student' && (!admission_no || !admRegex.test(admission_no))) {
    return res.status(400).json({ error: 'Admission Number is required for students and must be exactly 11 digits.' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const [r] = await pool.execute(
      `INSERT INTO users (fullname, first_name, middle_name, last_name, email, password_hash, admission_no, programme, academic_year, phone_no, role)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [fullname, first_name, middle_name || null, last_name, email, hash, admission_no||null, programme||null, academic_year||null, phone_no, userRole]
    );

    if (userRole === 'student') {
      await pool.execute(
        `INSERT INTO user_profiles (user_id, gender, programme, academic_year, phone_no)
         VALUES (?, ?, ?, ?, ?)`,
        [r.insertId, gender || 'male', programme || null, academic_year || null, phone_no]
      );
    }

    await logAction(req.user.email, 'admin_user_creation', `Registered account id ${r.insertId} as ${userRole}`, req);
    res.json({ success: true, id: r.insertId, message: 'User registered successfully by administrator!' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ error: 'Email or admission number already registered.' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', rateLimitMiddleware, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Admission number/Email and password required' });
  const ip = getClientIp(req);

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

    let isBlocked = false;
    if (user.role !== 'admin') {
      const [allowed] = await pool.execute('SELECT 1 FROM allowed_admissions WHERE admission_no = ?', [user.admission_no || '']);
      if (allowed.length === 0) {
        isBlocked = true;
      }
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.fullname, email: user.email, blocked: isBlocked },
      JWT_SECRET, { expiresIn: '1h' } // 1 hour token expiration
    );
    
    if (isBlocked) {
      await logAction(email, 'login_blocked', 'Access Blocked — Student not whitelisted', req);
    } else {
      await logAction(email, 'login', 'Successful sign-in', req);
    }

    res.json({
      token,
      user: {
        id: user.id,
        fullname: user.fullname,
        role: user.role,
        email: user.email,
        admission_no: user.admission_no,
        programme: user.programme,
        academic_year: user.academic_year,
        phone_no: user.phone_no,
        blocked: isBlocked
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PASSWORD RESET FLOW ── */
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email, admission_no } = req.body;
  if (!email && !admission_no) {
    return res.status(400).json({ error: 'Email address or Admission number is required.' });
  }
  try {
    let rows;
    if (email) {
      [rows] = await pool.execute('SELECT admission_no, email FROM users WHERE email=?', [email]);
    } else {
      [rows] = await pool.execute('SELECT admission_no, email FROM users WHERE admission_no=?', [admission_no]);
    }

    if (!rows.length) {
      return res.status(400).json({ error: 'No account found matching this identity.' });
    }
    
    const targetEmail = rows[0].email;
    const targetAdm = rows[0].admission_no;
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    await pool.execute('DELETE FROM password_resets WHERE email=?', [targetEmail]);
    await pool.execute(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
      [targetEmail, token, expiresAt]
    );
    
    await logAction(targetAdm, 'password_reset_request', 'Requested password reset token via email/admission number', req);
    
    // Send email alert with Nodemailer
    const mailOptions = {
      from: '"ATCHMS Support" <noreply@atc.ac.tz>',
      to: targetEmail,
      subject: 'ATCHMS Password Reset Token',
      text: `Hello,\n\nYou have requested to reset your password on ATCHMS. Your 6-digit one-time reset token is: ${token}\n\nThis token will expire in 15 minutes.`,
      html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
               <h2 style="color: #0B5D3B;">Arusha Technical College</h2>
               <h3>Password Reset Verification Code</h3>
               <p>Hello,</p>
               <p>Your one-time verification token to reset your password is:</p>
               <div style="font-size: 24px; font-weight: bold; background: #f4fdf8; color: #0B5D3B; padding: 12px 24px; display: inline-block; letter-spacing: 4px; border-radius: 6px; margin: 10px 0;">${token}</div>
               <p>This token will expire in 15 minutes. If you did not request this reset, please ignore this email.</p>
               <br/>
               <small style="color: #888;">Arusha Technical College Hostel Management System (ATCHMS)</small>
             </div>`
    };
    
    try {
      await transporter.sendMail(mailOptions);
    } catch (mailErr) {
      console.error('Nodemailer failed, logging token:', mailErr.message);
    }

    res.json({
      success: true,
      message: `Reset token sent to ${targetEmail}!`,
      token: token
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { admission_no, email, token, new_password } = req.body;
  if ((!admission_no && !email) || !token || !new_password) {
    return res.status(400).json({ error: 'Identity, token and new password are required.' });
  }
  try {
    let targetEmail = email;
    let targetAdm = admission_no;
    if (!targetEmail) {
      const [userRows] = await pool.execute('SELECT email FROM users WHERE admission_no=?', [admission_no]);
      if (!userRows.length) return res.status(400).json({ error: 'No account found with this admission number.' });
      targetEmail = userRows[0].email;
    } else if (!targetAdm) {
      const [userRows] = await pool.execute('SELECT admission_no FROM users WHERE email=?', [email]);
      if (!userRows.length) return res.status(400).json({ error: 'No account found with this email.' });
      targetAdm = userRows[0].admission_no;
    }

    const [rows] = await pool.execute(
      'SELECT * FROM password_resets WHERE email=? AND token=? AND expires_at > NOW()',
      [targetEmail, token]
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }
    
    const hash = await bcrypt.hash(new_password, 12);
    await pool.execute('UPDATE users SET password_hash=? WHERE email=?', [hash, targetEmail]);
    await pool.execute('DELETE FROM password_resets WHERE email=?', [targetEmail]);
    
    await logAction(targetAdm, 'password_reset_success', 'Successfully reset account password via email/admission number', req);
    res.json({ success: true, message: 'Password reset successfully!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PROFILE (fresh user data from DB with joined user_profiles table) ── */
app.get('/api/auth/profile', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.fullname, u.first_name, u.middle_name, u.last_name, u.email, u.admission_no, u.role,
              COALESCE(p.programme, u.programme) AS programme,
              COALESCE(p.academic_year, u.academic_year) AS academic_year,
              COALESCE(p.phone_no, u.phone_no) AS phone_no,
              p.avatar_url, p.gender
       FROM users u LEFT JOIN user_profiles p ON u.id = p.user_id
       WHERE u.id=?`,
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

    // Notify student
    createNotification(req.user.id, 'Application Submitted', 'Your hostel application has been submitted successfully and is pending review.');

    // Notify administrators
    try {
      const [admins] = await pool.execute('SELECT id FROM users WHERE role = "admin"');
      admins.forEach(admin => {
        createNotification(admin.id, 'New Hostel Application', `Student ${req.user.fullname || 'Salum Abdallah'} has submitted a new hostel application for review.`);
      });
    } catch (adminErr) {
      console.error('Failed to notify admins:', adminErr.message);
    }

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

    // 1. Fetch application details first so we have student_id
    const [[appDetails]] = await conn.execute(
      'SELECT student_id, preferred_hostel_id FROM applications WHERE id = ?',
      [req.params.id]
    );

    if (!appDetails) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // 2. Update application status
    await conn.execute(
      'UPDATE applications SET status=?, decision_date=NOW(), remarks=? WHERE id=?',
      [status, remarks||null, req.params.id]
    );

    let warning = null;
    let notifyTitle = '';
    let notifyMsg = '';

    if (status === 'approved') {
      // Fetch hostel fee
      const [[hostel]] = await conn.execute(
        'SELECT fee_per_semester FROM hostels WHERE id = ?',
        [appDetails.preferred_hostel_id]
      );

      const feeAmount = hostel ? hostel.fee_per_semester : 120000;

      // Generate GePG Control Number & Create Billing
      const cn = '9922' + Math.floor(10000000 + Math.random() * 90000000).toString();
      await conn.execute(
        'INSERT INTO payments (student_id, control_number, amount, payment_type) VALUES (?, ?, ?, "Semester 1 Hostel Fee")',
        [appDetails.student_id, cn, feeAmount]
      );

      notifyTitle = 'Application Approved';
      notifyMsg = `Congratulations! Your hostel application has been approved. Please select your room and bed using the 3D room selector on your dashboard. Use Control Number: ${cn} to pay the hostel fee.`;

      await logAction(req.user.email, 'application_approval', `Approved app ${req.params.id}, control number ${cn}`, req);
    } else {
      notifyTitle = 'Application Rejected';
      notifyMsg = `Your hostel application has been rejected by the administrator. Remarks: ${remarks || 'No remarks provided.'}`;
      
      await logAction(req.user.email, 'allocation_rejection', `Rejected application ${req.params.id}`, req);
    }

    await conn.commit();
    
    // Async notification dispatcher
    createNotification(appDetails.student_id, notifyTitle, notifyMsg);

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
    if (payment.status === 'verifying') return res.status(400).json({ error: 'This payment is already pending verification.' });
    
    await pool.execute(
      'UPDATE payments SET status="verifying", payment_method=?, transaction_reference=?, paid_at=NOW() WHERE id=?',
      [payment_method || 'M-Pesa', transaction_reference, payment.id]
    );
    
    // Notify student of submitted fee
    createNotification(req.user.id, 'Payment Submitted', `Your payment of TSh ${payment.amount} for "${payment.payment_type}" has been submitted for verification. Transaction Reference: ${transaction_reference}.`);

    // Notify admins of verification needed
    try {
      const [admins] = await pool.execute('SELECT id FROM users WHERE role = "admin"');
      admins.forEach(admin => {
        createNotification(admin.id, 'Payment Pending Verification', `Student ${req.user.fullname || 'Student'} submitted payment proof for TSh ${payment.amount} ("${payment.payment_type}"). Control Number: ${control_number}.`);
      });
    } catch (adminErr) {
      console.error(adminErr);
    }

    await logAction(req.user.email, 'payment_submitted', `Submitted proof for TSh ${payment.amount} for ${payment.payment_type}`, req);
    res.json({ success: true, message: 'Payment submitted for verification.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── ADMIN VERIFY PAYMENT ── */
app.put('/api/admin/payments/:id/verify', auth, adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const paymentId = req.params.id;
    const [[payment]] = await conn.execute('SELECT * FROM payments WHERE id = ? FOR UPDATE', [paymentId]);
    if (!payment) {
      await conn.rollback();
      return res.status(404).json({ error: 'Payment not found.' });
    }
    
    if (payment.status === 'paid') {
      await conn.rollback();
      return res.status(400).json({ error: 'Payment already verified.' });
    }

    // 1. Update payment status to paid
    await conn.execute('UPDATE payments SET status = "paid" WHERE id = ?', [paymentId]);

    let allocationMsg = '';
    
    // 2. Check if the payment is for hostel fee and student is not yet allocated
    const isHostelFee = payment.payment_type.toLowerCase().includes('hostel fee');
    
    if (isHostelFee) {
      const [[existingAlloc]] = await conn.execute(
        'SELECT id FROM allocations WHERE student_id = ? AND status = "active"',
        [payment.student_id]
      );

      if (!existingAlloc) {
        // Fetch approved application
        const [[app]] = await conn.execute(
          'SELECT preferred_hostel_id FROM applications WHERE student_id = ? AND status = "approved" ORDER BY id DESC LIMIT 1',
          [payment.student_id]
        );

        if (app) {
          // Fetch student gender
          const [[profile]] = await conn.execute(
            'SELECT gender FROM user_profiles WHERE user_id = ?',
            [payment.student_id]
          );
          const gender = profile ? profile.gender : 'male';

          // Find first available room in preferred hostel block matching gender
          const [[room]] = await conn.execute(
            `SELECT r.id, r.room_number, r.capacity, r.occupied_count 
             FROM rooms r
             JOIN hostels h ON r.hostel_id = h.id
             WHERE r.hostel_id = ? 
               AND (h.gender_type = 'mixed' OR h.gender_type = ?) 
               AND r.occupied_count < r.capacity 
               AND r.status = 'available'
             ORDER BY r.room_number ASC
             LIMIT 1`,
            [app.preferred_hostel_id, gender]
          );

          if (room) {
            // Find occupied beds in this room
            const [occupiedBeds] = await conn.execute(
              'SELECT bed_label FROM allocations WHERE room_id = ? AND status = "active"',
              [room.id]
            );
            const occupiedLabels = occupiedBeds.map(b => b.bed_label);
            
            // Determine next free bed label
            const possibleLabels = room.capacity === 2 ? ['Bed A', 'Bed B'] : ['Bed A', 'Bed B', 'Bed C', 'Bed D'];
            let allocatedBed = null;
            for (let label of possibleLabels) {
              if (!occupiedLabels.includes(label)) {
                allocatedBed = label;
                break;
              }
            }
            if (!allocatedBed) {
              allocatedBed = `Bed ${occupiedLabels.length + 1}`;
            }

            // Create active allocation
            await conn.execute(
              `INSERT INTO allocations (student_id, room_id, academic_year, lease_end_date, bed_label) 
               VALUES (?, ?, "2026/2027", "2027-06-30", ?)`,
              [payment.student_id, room.id, allocatedBed]
            );

            // Increment room occupancy
            await conn.execute(
              'UPDATE rooms SET occupied_count = occupied_count + 1 WHERE id = ?',
              [room.id]
            );

            allocationMsg = ` You have been automatically allocated to Room ${room.room_number}, ${allocatedBed}.`;
          } else {
            allocationMsg = ` Your payment has been verified, but all rooms in your preferred block matching your gender are currently full. You have been placed on the waitlist.`;
          }
        }
      }
    }

    await conn.commit();

    createNotification(
      payment.student_id, 
      'Payment Verified', 
      `Your payment of TSh ${payment.amount} for "${payment.payment_type}" has been verified successfully.${allocationMsg}`
    );

    await logAction(req.user.email, 'payment_verified', `Verified payment ID: ${paymentId}.${allocationMsg ? ' Auto-allocated room.' : ''}`, req);

    res.json({ success: true, message: 'Payment verified successfully.' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

app.post('/api/payments', auth, adminOnly, async (req, res) => {
  const { student_id, amount, payment_type } = req.body;
  const cn = Math.floor(100000000000 + Math.random() * 900000000000).toString();
  try {
    const [r] = await pool.execute(
      'INSERT INTO payments (student_id,control_number,amount,payment_type) VALUES (?,?,?,?)',
      [student_id, cn, amount, payment_type]
    );

    // Notify student of new invoice
    createNotification(student_id, 'New Invoice Issued', `A new payment invoice for "${payment_type}" with amount TSh ${amount} has been issued. Use GePG Control Number: ${cn} to pay.`);

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

    // Notify student
    createNotification(req.user.id, 'Ticket Submitted Successfully', `Your maintenance ticket "${title}" has been submitted and is currently marked as pending.`);

    // Notify admins
    try {
      const [admins] = await pool.execute('SELECT id FROM users WHERE role = "admin"');
      admins.forEach(admin => {
        createNotification(admin.id, 'New Maintenance Ticket', `Student ${req.user.fullname || 'Student'} submitted a new ticket: "${title}".`);
      });
    } catch (adminErr) {
      console.error(adminErr);
    }

    res.json({ success: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/maintenance/:id', auth, adminOnly, async (req, res) => {
  const { status } = req.body;
  const resolved = status === 'resolved' ? new Date() : null;
  try {
    const [[ticket]] = await pool.execute('SELECT student_id, title FROM maintenance_tickets WHERE id=?', [req.params.id]);

    await pool.execute('UPDATE maintenance_tickets SET status=?, resolved_at=? WHERE id=?',
      [status, resolved, req.params.id]);

    if (ticket) {
      createNotification(ticket.student_id, 'Ticket Status Update', `Your maintenance ticket "${ticket.title}" is now marked as "${status}".`);
    }

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

app.get('/api/rooms/:id/details', auth, async (req, res) => {
  try {
    const [[room]] = await pool.execute(
      `SELECT r.*, h.name AS hostel_name, h.gender_type FROM rooms r
       JOIN hostels h ON r.hostel_id=h.id WHERE r.id = ?`,
      [req.params.id]
    );
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Fetch active allocations in this room
    const [allocations] = await pool.execute(
      `SELECT al.student_id, al.bed_label, u.fullname, u.admission_no, u.phone_no, up.avatar_url
       FROM allocations al
       JOIN users u ON al.student_id = u.id
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE al.room_id = ? AND al.status = 'active'`,
      [req.params.id]
    );

    res.json({ room, allocations });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/applications/select-room', auth, async (req, res) => {
  const { room_id, bed_label } = req.body;
  if (!room_id || !bed_label) return res.status(400).json({ error: 'Room ID and Bed Label are required' });

  try {
    // 1. Check if user has an approved application
    const [apps] = await pool.execute(
      'SELECT id, preferred_hostel_id FROM applications WHERE student_id = ? AND status = "approved"',
      [req.user.id]
    );
    if (apps.length === 0) {
      return res.status(400).json({ error: 'You do not have an approved application. Please wait for approval first.' });
    }
    const app = apps[0];

    // 2. Check if student already has an active allocation
    const [existing] = await pool.execute(
      'SELECT id FROM allocations WHERE student_id = ? AND status = "active"',
      [req.user.id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'You are already allocated to a room.' });
    }

    // 3. Verify room belongs to preferred hostel
    const [[room]] = await pool.execute('SELECT * FROM rooms WHERE id = ?', [room_id]);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.hostel_id !== app.preferred_hostel_id) {
      return res.status(400).json({ error: 'Selected room is not in your preferred hostel block.' });
    }

    // 4. Verify room is not full and bed is free
    if (room.occupied_count >= room.capacity) {
      return res.status(400).json({ error: 'This room is already full.' });
    }

    const [bedOccupied] = await pool.execute(
      'SELECT id FROM allocations WHERE room_id = ? AND bed_label = ? AND status = "active"',
      [room_id, bed_label]
    );
    if (bedOccupied.length > 0) {
      return res.status(400).json({ error: 'Selected bed slot is already taken.' });
    }

    // 5. Create allocation record and update occupied_count
    await pool.execute(
      'INSERT INTO allocations (student_id, room_id, academic_year, lease_end_date, bed_label) VALUES (?, ?, "2026/2027", "2027-06-30", ?)',
      [req.user.id, room_id, bed_label]
    );
    await pool.execute('UPDATE rooms SET occupied_count = occupied_count + 1 WHERE id = ?', [room_id]);

    // Create system notification
    createNotification(req.user.id, 'Room Selected', `You have successfully selected Room: ${room.room_number}, Bed: ${bed_label}. Your lease is now active.`);

    res.json({ success: true, message: 'Room and bed selected successfully!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rooms/:id/allocate', auth, adminOnly, async (req, res) => {
  const room_id = req.params.id;
  const { student_id, bed_label } = req.body;
  if (!student_id || !bed_label) return res.status(400).json({ error: 'Student ID and Bed Label are required' });

  try {
    const [[room]] = await pool.execute('SELECT * FROM rooms WHERE id = ?', [room_id]);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Verify bed is not occupied
    const [occupied] = await pool.execute(
      'SELECT id FROM allocations WHERE room_id = ? AND bed_label = ? AND status = "active"',
      [room_id, bed_label]
    );
    if (occupied.length > 0) {
      return res.status(400).json({ error: 'This bed is already allocated.' });
    }

    // Remove any previous active allocation for this student
    const [existing] = await pool.execute(
      'SELECT id, room_id FROM allocations WHERE student_id = ? AND status = "active"',
      [student_id]
    );
    if (existing.length > 0) {
      // decrement old room occupied count
      await pool.execute('UPDATE rooms SET occupied_count = occupied_count - 1 WHERE id = ?', [existing[0].room_id]);
      await pool.execute('DELETE FROM allocations WHERE id = ?', [existing[0].id]);
    }

    // Insert new allocation
    await pool.execute(
      'INSERT INTO allocations (student_id, room_id, academic_year, lease_end_date, bed_label) VALUES (?, ?, "2026/2027", "2027-06-30", ?)',
      [student_id, room_id, bed_label]
    );
    await pool.execute('UPDATE rooms SET occupied_count = occupied_count + 1 WHERE id = ?', [room_id]);

    createNotification(student_id, 'Room Allocated by Admin', `An administrator has allocated you to Room: ${room.room_number}, Bed: ${bed_label}.`);

    res.json({ success: true, message: 'Room allocated successfully!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rooms/:id/deallocate', auth, adminOnly, async (req, res) => {
  const room_id = req.params.id;
  const { student_id, bed_label } = req.body;
  try {
    const [existing] = await pool.execute(
      'SELECT id FROM allocations WHERE student_id = ? AND room_id = ? AND bed_label = ? AND status = "active"',
      [student_id, room_id, bed_label]
    );
    if (existing.length === 0) {
      return res.status(400).json({ error: 'Allocation not found.' });
    }
    
    await pool.execute('DELETE FROM allocations WHERE id = ?', [existing[0].id]);
    await pool.execute('UPDATE rooms SET occupied_count = GREATEST(0, occupied_count - 1) WHERE id = ?', [room_id]);

    createNotification(student_id, 'Room Deallocated', `An administrator has cancelled your hostel room allocation.`);

    res.json({ success: true, message: 'Bed deallocated successfully!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/rooms/:id/media', auth, adminOnly, async (req, res) => {
  const { photo_url, virtual_tour_url } = req.body;
  try {
    await pool.execute(
      'UPDATE rooms SET photo_url = ?, virtual_tour_url = ? WHERE id = ?',
      [photo_url || null, virtual_tour_url || null, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/rooms/:id/layout', auth, async (req, res) => {
  try {
    const [[room]] = await pool.execute('SELECT layout_json FROM rooms WHERE id = ?', [req.params.id]);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ layout: room.layout_json ? JSON.parse(room.layout_json) : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/rooms/:id/layout', auth, adminOnly, async (req, res) => {
  const { layout } = req.body;
  try {
    const layoutStr = layout ? JSON.stringify(layout) : null;
    await pool.execute('UPDATE rooms SET layout_json = ? WHERE id = ?', [layoutStr, req.params.id]);
    res.json({ success: true, message: 'Room layout saved successfully!' });
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
              a.status AS application_status, h.name AS hostel_name,
              p.avatar_url, p.gender
       FROM users u
       LEFT JOIN user_profiles p ON u.id = p.user_id
       LEFT JOIN applications a ON a.student_id=u.id
       LEFT JOIN hostels h ON a.preferred_hostel_id=h.id
       WHERE u.role='student' ORDER BY u.created_at DESC`
    );
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const [r] = await pool.execute(
      `SELECT u.id, u.fullname, u.email, u.admission_no, u.programme, u.academic_year,
              u.phone_no, u.role, u.created_at,
              p.avatar_url, p.gender
       FROM users u
       LEFT JOIN user_profiles p ON u.id = p.user_id
       ORDER BY u.created_at DESC`
    );
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── ADMISSIONS WHITELIST (admin) ── */
app.get('/api/admin/whitelist', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM allowed_admissions ORDER BY added_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/whitelist', auth, adminOnly, async (req, res) => {
  const { admission_no } = req.body;
  if (!admission_no) return res.status(400).json({ error: 'Admission number is required' });
  try {
    await pool.execute('INSERT IGNORE INTO allowed_admissions (admission_no) VALUES (?)', [admission_no]);
    await logAction(req.user.email, 'whitelist_add', `Added ${admission_no} to whitelist`, req);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/whitelist/:admission_no', auth, adminOnly, async (req, res) => {
  try {
    await pool.execute('DELETE FROM allowed_admissions WHERE admission_no = ?', [req.params.admission_no]);
    await logAction(req.user.email, 'whitelist_remove', `Removed ${req.params.admission_no} from whitelist`, req);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── AUDIT LOGS (admin) ── */
app.get('/api/admin/audit-logs', auth, adminOnly, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 100, 500); // cap at 500, safe to inline
  const action = req.query.action || null;
  try {
    let sql = 'SELECT * FROM audit_logs';
    const params = [];
    if (action) { sql += ' WHERE action = ?'; params.push(action); }
    sql += ` ORDER BY timestamp DESC LIMIT ${limit}`; // safe: parseInt-validated integer
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── ACTIVE SESSIONS (admin) ── */
// Returns users with live SSE connection + most recent successful login per user from audit_logs
app.get('/api/admin/active-sessions', auth, adminOnly, async (req, res) => {
  try {
    const hours = Math.min(parseInt(req.query.hours) || 24, 168); // cap at 7 days
    // Live SSE connections: user_ids currently holding an open SSE stream
    const liveUserIds = Array.from(sseClients.keys());

    // Most recent successful login per user from audit_logs within the time window
    const [recentLogins] = await pool.execute(
      `SELECT a.username, a.ip_address, a.timestamp,
              u.id AS user_id, u.fullname, u.role
       FROM audit_logs a
       LEFT JOIN users u ON u.email = a.username OR u.admission_no = a.username
       WHERE a.action = 'login'
         AND a.timestamp >= NOW() - INTERVAL ${hours} HOUR
       ORDER BY a.timestamp DESC
       LIMIT 200`
    );

    // Deduplicate: keep only the most recent login per username
    const seen = new Set();
    const deduplicated = [];
    for (const row of recentLogins) {
      if (!seen.has(row.username)) {
        seen.add(row.username);
        deduplicated.push({
          ...row,
          is_live: liveUserIds.includes(row.user_id)
        });
      }
    }

    res.json({
      live_count: liveUserIds.length,
      sessions: deduplicated
    });
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

/* ── NOTIFICATIONS & EVENTS ── */
app.get('/api/notifications/stream', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 30000);

    registerSseClient(userId, res);

    req.on('close', () => {
      clearInterval(keepAlive);
      unregisterSseClient(userId, res);
    });

  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/notifications', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/mark-read', auth, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE notifications SET is_read=TRUE WHERE user_id=?',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Profile / Avatar / Password API routes
const multer = require('multer');
const path_m = require('path');
const fs_m   = require('fs');
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = '/var/www/atchms/uploads/avatars';
    fs_m.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path_m.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, 'avatar_' + req.user.id + '_' + Date.now() + ext);
  }
});
const avatarUpload = multer({ storage: avatarStorage, limits: { fileSize: 3*1024*1024 } });
app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { first_name, middle_name, last_name, fullname: passedFullname, email, phone_no, programme, academic_year, gender } = req.body;
    let finalFullname = passedFullname;
    if (first_name && last_name) {
      finalFullname = [first_name, middle_name, last_name].filter(Boolean).join(' ');
    }
    await pool.query(
      'UPDATE users SET fullname=?, first_name=?, middle_name=?, last_name=?, email=? WHERE id=?',
      [finalFullname, first_name || null, middle_name || null, last_name || null, email, req.user.id]
    );
    await pool.query(
      `INSERT INTO user_profiles (user_id, phone_no, programme, academic_year, gender)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE phone_no=?, programme=?, academic_year=?, gender=?`,
      [req.user.id, phone_no, programme, academic_year, gender, phone_no, programme, academic_year, gender]
    );
    res.json({ success: true });
  } catch(err) { console.error(err); res.status(500).json({ error: 'Update failed' }); }
});
app.post('/api/auth/avatar', auth, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const avatarUrl = '/atchms/uploads/avatars/' + req.file.filename;
    await pool.query(
      `INSERT INTO user_profiles (user_id, avatar_url)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE avatar_url=?`,
      [req.user.id, avatarUrl, avatarUrl]
    );
    res.json({ success: true, avatar_url: avatarUrl });
  } catch(err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
});
app.post('/api/auth/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.user.id]);
    res.json({ success: true });
  } catch(err) { console.error(err); res.status(500).json({ error: 'Password change failed' }); }
});

// Admin overrides student password directly
app.post('/api/admin/reset-student-password', auth, adminOnly, async (req, res) => {
  const { student_id, new_password } = req.body;
  if (!student_id || !new_password) {
    return res.status(400).json({ error: 'Student ID and new password are required.' });
  }
  try {
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, student_id]);
    res.json({ success: true, message: 'Student password reset successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Native axios Mock using fetch for dependency-free request execution
const axios = {
  post: async (url, data, config = {}) => {
    let targetUrl = url;
    if (url === 'https://groq.com') {
      targetUrl = 'https://api.groq.com/openai/v1/chat/completions';
    } else if (url === 'https://openrouter.ai') {
      targetUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }
    
    const headers = { 'Content-Type': 'application/json', ...(config.headers || {}) };
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Request failed with status ${res.status}: ${errText}`);
    }
    const resData = await res.json();
    return { data: resData };
  }
};

app.post('/api/chatbot', async (req, res) => {
    const { message, messages } = req.body;

    // The strict instructions you requested for your ATCHMS persona
    const systemPrompt = `You are the ATCHMS Hostel System Assistant. You are strictly restricted to answering queries related to the ATCHMS knowledge database, including applications, control numbers, payments, room allocation, and maintenance. If a user asks an out-of-bounds question, politely reject it. Critical instruction: Tumia msimbo kwa uangalifu.`;

    // Normalise request messages array for standard completions API payloads
    const promptMessages = messages || [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
    ];

    // 1. Primary Cloud Route: Groq Cloud (llama3-8b-8192)
    if (process.env.GROQ_API_KEY) {
        try {
            console.log('[Chatbot] Trying Groq Cloud (llama3-8b-8192)...');
            const groqResponse = await axios.post('https://groq.com', {
                model: "llama3-8b-8192",
                messages: promptMessages,
                max_tokens: 400
            }, {
                headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
            });
            const reply = groqResponse.data.choices[0].message.content;
            return res.json({ 
                response: reply,
                choices: [{ message: { role: 'assistant', content: reply } }]
            });
        } catch (error) {
            console.error("Groq Cloud failed, switching to OpenRouter Cloud backup...", error.message);
        }
    }

    // 2. Fallback Cloud Route: OpenRouter Cloud (meta-llama/llama-3-8b-instruct:free)
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey) {
        try {
            console.log('[Chatbot] Trying OpenRouter Cloud (meta-llama/llama-3-8b-instruct:free)...');
            const openRouterResponse = await axios.post('https://openrouter.ai', {
                model: "meta-llama/llama-3-8b-instruct:free",
                messages: promptMessages,
                max_tokens: 400
            }, {
                headers: { 
                    'Authorization': `Bearer ${openrouterKey}`,
                    'HTTP-Referer': 'http://185.202.236.94/atchms/',
                    'X-Title': 'ATCHMS Hostel Bot'
                }
            });
            const reply = openRouterResponse.data.choices[0].message.content;
            return res.json({ 
                response: reply,
                choices: [{ message: { role: 'assistant', content: reply } }]
            });
        } catch (error) {
            console.error("OpenRouter Backup failed:", error.message);
        }
    }

    // 3. Fallback Local/Tunnel Route: Ollama (hostel-bot)
    try {
        const ollamaBaseUrl = process.env.OLLAMA_HOSTEL_BOT_URL
            ? `${process.env.OLLAMA_HOSTEL_BOT_URL.replace(/\/$/, '')}/v1/chat/completions`
            : 'http://127.0.0.1:11434/v1/chat/completions';
        console.log(`[Chatbot] Trying local fallback Ollama (${ollamaBaseUrl})...`);
        const ollamaResponse = await axios.post(ollamaBaseUrl, {
            model: "hostel-bot",
            messages: promptMessages
        });
        const reply = ollamaResponse.data.choices[0].message.content;
        return res.json({ 
            response: reply,
            choices: [{ message: { role: 'assistant', content: reply } }]
        });
    } catch (error) {
        console.error("Ollama Local Backup failed:", error.message);
    }

    // 4. Absolute Failure state
    return res.status(500).json({ error: "All cloud chatbot engines are currently unreachable." });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ ATCHMS API running on http://127.0.0.1:${PORT}`);
});
