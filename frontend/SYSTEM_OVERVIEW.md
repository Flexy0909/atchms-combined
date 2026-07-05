# ATCHMS System Architecture & Integration Overview

This document provides a comprehensive overview of how the **Arusha Technical College Hostel Management System (ATCHMS)** operates. It covers system workflows, user roles, security, and external system integrations.

---

## 1. System Architecture: Static Mockup to Production Web App

During your presentation, you can explain that the current frontend is built with **HTML5 and CSS3** (semantic structuring, fully styled), and the production system will run on a **Model-View-Controller (MVC)** architecture.

```
       [ Client Browser ]
               │ (HTTPS Requests)
               ▼
   [ Controller / API Layer ]  ◄──►  [ GePG & SMS Gateways ]
               │
               ▼
      [ Database Layer ] (MySQL / PostgreSQL)
```

---

## 2. User Roles & Access Control

The system supports two distinct portals:
1. **Student Portal**
   - Access to registration, login, and personal overview.
   - Browse hostels and apply for a room.
   - View allocated room details and roommate contacts.
   - Pay hostel fees (with simulated Government Control Numbers).
   - Submit and track maintenance tickets (e.g. plumbing, electrical).
2. **Admin Portal (Dean of Students & Wardens)**
   - Review incoming applications (Approve / Reject).
   - Allocate students to rooms based on capacity and study programme.
   - Verify payment transaction references.
   - Monitor active maintenance requests and assign repairs to technicians.
   - View visual statistics (occupancy rate, revenue collected, open tickets).

---

## 3. Core System Workflows

### A. Hostel Application & Allocation Workflow
1. **Registration**: Student registers using their official college **Admission Number** (ensuring only registered ATC students can apply).
2. **Application Submission**: Student logs in, views available hostels, and selects their preferred block (e.g., Mount Meru Hall - Block B).
3. **Admin Review**: In the admin panel, the application appears as `Pending`. The Warden/Dean reviews the request and clicks `Approve`.
4. **Room Assignment**: The system automatically assigns the student to an available room (e.g., B-204) in their preferred block matching their gender.

### B. Payment & GePG Integration Workflow
All Tanzanian public institutions (like ATC) use the **Government e-Payment Gateway (GePG)**.
1. **Billing**: Once approved, the system generates a billing entry for the student.
2. **Control Number Request**: The college server calls the GePG API to request a payment **Control Number**.
3. **Display**: The student receives a unique 12-digit Control Number (e.g. `992200384112`) on their dashboard.
4. **Payment**: The student pays using mobile money (M-Pesa, Tigo Pesa, Airtel Money) or via bank transfer.
5. **Callback Notification**: The payment provider sends a secure XML/JSON payment notification to the college's server callback URL.
6. **Confirmation**: The server marks the payment status as `Paid` in the database, sends a verification SMS to the student, and generates a digital receipt.

### C. Maintenance Request Workflow
1. **Filing**: A resident student notices an issue (e.g. leaky tap) and submits a ticket via `maintenance.html`, specifying the priority (Low, Medium, High).
2. **Triage**: The warden views the ticket on the admin maintenance board.
3. **Execution**: The warden assigns a college technician (e.g., plumber) to resolve the issue, and marks the status as `In Progress`.
4. **Resolution**: Once resolved, the ticket is closed (`Resolved`), and a notification is updated on the student's dashboard.

---

## 4. Key Security Practices for Production

To make this product commercial-ready, explain that the following security measures will be implemented in the database backend:
- **Password Hashing**: Storing passwords using secure encryption algorithms (like **bcrypt**) rather than plain text.
- **SQL Injection Prevention**: Using **Prepared Statements** and Parameterized Queries to prevent attackers from executing arbitrary commands on your database.
- **Cross-Site Scripting (XSS) Protection**: Sanitizing and escaping all user input before rendering it on the page to prevent malicious scripts from running.
- **Session Security**: Using HTTPS, secure HTTP-only cookies, and session timeouts to protect logged-in accounts.
- **GePG Verification**: Using digital signatures (public/private key pairs) to verify that callback payment alerts are coming legitimately from the government gateway.
- **Role-Based Middleware**: Restricting admin pages (`/admin-*.html`) so that even if a student types the URL directly, they are redirected back to the login page.
