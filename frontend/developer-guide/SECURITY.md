# ATCHMS Security Architecture & Best Practices Guide

This document outlines the security architecture implemented in the **Arusha Technical College Hostel Management System (ATCHMS)**. This guide covers the 20 core security practices and checklists requested for academic defense and production deployments.

---

## 🛡️ 1. Authentication Security

### A. Password Hashing (Bcrypt)
- **Implementation**: We never store plain-text passwords. All student and administrator passwords are encrypted in the `users` table using **Bcrypt** with a work factor (salt rounds) of 10.
- **Node.js Code pattern**:
  ```javascript
  // Hashing during registration
  const passwordHash = await bcrypt.hash(password, 10);
  
  // Verification during login
  const isMatch = await bcrypt.compare(password, user.password_hash);
  ```

### B. Strong Password Policy
- The registration script enforces strong complexity validation on the client and server side:
  - Minimum of 8 characters.
  - At least one uppercase letter, one lowercase letter, one number, and one special character (e.g., `Mashaka@2026`).

### C. Email & Role Verification
- **Activation Flow**: Newly registered student accounts require an email verification status update before they can apply for hostels, protecting the portal from spam registrations.

---

## 🔒 2. Session & Token Security

### A. Stateless JWT Authentication
- Session tokens are generated as **JSON Web Tokens (JWT)** on successful login and signed using a secure secret key.
- Tokens are stored securely in browser `localStorage` and sent via the HTTP `Authorization: Bearer <token>` header for subsequent requests.

### B. Session Timeout
- Inactivity timeouts are monitored on the client side:
  - **Students**: Auto-logout after 30 minutes of inactivity.
  - **Admins**: Auto-logout after 15 minutes of inactivity.

---

## 🗄️ 3. Database Security

### A. Prepared Statements (SQL Injection Prevention)
- **No Raw Queries**: We never concatenate user inputs directly into SQL queries.
- **Implementation**: The backend database connector (`mysql2/promise`) pre-compiles all SQL statements using **Prepared Statements** and passes inputs as bound parameters:
  ```javascript
  // Prevent SQL injection by using parameterized inputs
  const [result] = await pool.execute(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );
  ```

### B. Database Constraints & Integrity
- **Unique Constraints**: Unique fields like `admission_no`, `email`, and `phone_no` prevent duplicate account creation in the `users` table.
- **Foreign Keys**: Cascading constraints (e.g., `room_id REFERENCES rooms(id)`) ensure that no allocations can be made to invalid rooms, preserving database referential integrity.

---

## 🌐 4. Web & Header Security

### A. Secure Headers
The production Nginx proxy is configured to inject security headers on every response:
- `X-Frame-Options: DENY` — Prevents Clickjacking attacks.
- `X-Content-Type-Options: nosniff` — Prevents MIME-sniffing attacks.
- `Content-Security-Policy (CSP)` — Prevents Cross-Site Scripting (XSS) by restricting resource loading domains.

### B. HTTPS Everywhere
- The system is configured to resolve exclusively under SSL (HTTPS) in production (e.g., `https://hostel.atc.ac.tz`).
- Nginx blocks HTTP request ports and issues a `301 Moved Permanently` redirect to force SSL usage.

---

## 🚫 5. XSS & CSRF Mitigation

### A. Cross-Site Scripting (XSS) Prevention
- In the frontend files, we render all dynamic text nodes using `element.textContent` rather than `element.innerHTML`.
- This ensures that if a student inputs HTML or JS code (e.g., `<script>alert('hack')</script>`), the browser displays it as text instead of executing it.

### B. Cross-Site Request Forgery (CSRF) Protection
- For API routes, authentication is handled via header-bound JWT tokens rather than automatic cookies. Because standard web browsers do not auto-append authorization headers to cross-origin requests, this acts as built-in protection against CSRF.

---

## 🔑 6. Role-Based Access Control (RBAC)

The system enforces authorization filters via middleware handlers.

### Access Levels:
1. **Student**: Can only view their own applications, make payments, and file maintenance tickets for their allocated room.
2. **Warden / Hostel Officer**: Can review applications and allocate rooms.
3. **Dean of Students / Admin**: Full console access to modify allocation algorithms and payments.
4. **System Admin**: Manage user roles and system audits.

### Express Middleware Pattern:
```javascript
// RBAC Middleware
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin only' });
  }
  next();
}
```

---

## 📋 7. Audit Logging & Tracking
- **Action Logs**: The backend maintains a transactional history tracking admin choices. Every approval, rejection, room assignment, or payment verification is recorded with the user ID, timestamp, and IP address.

---

## 💰 8. Payment & GePG Integration Security
- **Backend Verification**: We never trust payment completion flags sent from the client browser.
- **GePG Flow**:
  1. Once approved, the system generates a billing control number.
  2. The payment callback webhook endpoint receives payment alerts directly from the Government e-Payment Gateway (GePG).
  3. The server validates the cryptographic signature of the GePG callback payload before updating the database payment status to `paid`.

---

## ♿ 9. Data Protection (Disability & Guardians)
- **Sensitive Data Isolation**: Fields containing student disabilities or medical history notes are restricted. They are excluded from student-facing views and only loaded in admin views for Wardens or Hostel Officers.
- **Guardian Details**: Guardian phone numbers and contacts are only visible to the student owner and admin staff to ensure compliance with personal data privacy guidelines.

---

## 💾 10. Backups & Server Recovery
- **Database Backup**: Daily automated cron backups export the MySQL database structure and data, keeping the files in a secure off-site archive.
- **Server Security**: The VPS firewall is configured to close all unused port lines. Root SSH logins are disabled in favor of secure public/private keys.
