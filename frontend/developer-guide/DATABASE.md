# Database Design & Implementation Guide

This document explains the database structure designed for the **Arusha Technical College Hostel Management System (ATCHMS)**. This information will help you explain how the backend database works when presenting to your teacher.

---

## 1. Database Architecture & Design Choices

For a system like ATCHMS, a **Relational Database Management System (RDBMS)** such as **MySQL** or **PostgreSQL** is the standard choice. 

### Why RDBMS?
- **Data Integrity**: Enforces relationships between students, rooms, and payments (e.g., you cannot allocate a room that does not exist).
- **ACID Transactions**: Ensures payment transactions are reliable (e.g., if a fee payment is processed, it is either fully saved or rolled back, avoiding partial updates).
- **Structured Queries**: Easy to run reports (e.g., calculation of occupancy rates and total revenue).

---

## 2. Entity Relationship Diagram (ERD) Overview

The database is built around **six core tables**:
1. `users` — Stores login credentials and profile information for both students and administrators.
2. `hostels` — Stores information about hostel blocks (e.g., Mount Meru Block A).
3. `rooms` — Stores room numbers, capacities, and current occupancy.
4. `applications` — Stores student housing requests and their approval statuses.
5. `payments` — Tracks transactions, control numbers, and payment statuses.
6. `maintenance_tickets` — Stores reported room issues and resolution statuses.

---

## 3. Detailed Database Schema (SQL Table Creation)

Here is the exact SQL code to create the database schema. Review the columns, data types, and constraints (Primary Keys and Foreign Keys).

```sql
-- Create Database
CREATE DATABASE atc_hostel_db;
USE atc_hostel_db;

-- 1. USERS TABLE
-- Stores details for both students and admins. Role-based access control is determined by the 'role' column.
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fullname VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Stored securely using hashing (e.g., bcrypt)
    admission_no VARCHAR(30) UNIQUE NULL, -- Nullable for admins
    programme VARCHAR(100) NULL,          -- Nullable for admins
    academic_year VARCHAR(10) NULL,       -- Nullable for admins
    phone_no VARCHAR(20) NOT NULL,
    role ENUM('student', 'admin') DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. HOSTELS TABLE
-- Stores properties of each hostel block.
CREATE TABLE hostels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,          -- e.g., 'Mount Meru Hall - Block B'
    gender_type ENUM('male', 'female', 'mixed', 'international') NOT NULL,
    total_rooms INT NOT NULL,
    fee_per_semester DECIMAL(10, 2) NOT NULL, -- e.g., 120000.00
    status ENUM('open', 'full', 'closed') DEFAULT 'open'
);

-- 3. ROOMS TABLE
-- Represents individual rooms in a hostel.
CREATE TABLE rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hostel_id INT NOT NULL,
    room_number VARCHAR(10) NOT NULL,    -- e.g., 'B-204'
    capacity INT NOT NULL DEFAULT 2,     -- Max students in room
    occupied_count INT NOT NULL DEFAULT 0, -- Current students allocated
    status ENUM('available', 'full', 'maintenance') DEFAULT 'available',
    FOREIGN KEY (hostel_id) REFERENCES hostels(id) ON DELETE CASCADE
);

-- 4. APPLICATIONS TABLE
-- Stores student housing applications.
CREATE TABLE applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    preferred_hostel_id INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    submitted_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    decision_date TIMESTAMP NULL,
    remarks VARCHAR(255) NULL,           -- Teacher's note if rejected
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (preferred_hostel_id) REFERENCES hostels(id) ON DELETE CASCADE
);

-- 5. ALLOCATIONS TABLE
-- Links a student to a room once their application is approved.
CREATE TABLE allocations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT UNIQUE NOT NULL,      -- A student can only have 1 active allocation
    room_id INT NOT NULL,
    academic_year VARCHAR(15) NOT NULL,  -- e.g., '2026/2027'
    allocated_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lease_end_date DATE NOT NULL,
    status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- 6. PAYMENTS TABLE
-- Tracks fee payments, including Tanzanian Government e-Payment Gateway (GePG) control numbers.
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    control_number VARCHAR(12) UNIQUE NOT NULL, -- 12-digit GePG control number
    amount DECIMAL(10, 2) NOT NULL,
    payment_type VARCHAR(50) NOT NULL,         -- e.g., 'Semester 1 Hostel Fee'
    payment_method VARCHAR(30) NULL,           -- e.g., 'M-Pesa', 'CRDB Transfer'
    transaction_reference VARCHAR(100) UNIQUE NULL, -- Reference from mobile network/bank
    status ENUM('pending', 'paid', 'refundable', 'expired') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP NULL,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. MAINTENANCE TICKETS TABLE
-- Stores maintenance request details submitted by students.
CREATE TABLE maintenance_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    room_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,         -- e.g., 'Bathroom tap leaking'
    description TEXT NOT NULL,
    priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
    status ENUM('open', 'in-progress', 'resolved') DEFAULT 'open',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);
```

---

## 4. Key Database Concepts & Teacher Question Prep

### Q1: What are Primary Keys (PK) and Foreign Keys (FK) here?
- **Primary Key (PK)**: A unique identifier for every record in a table (e.g., `id` in `users`). No two users can have the same ID.
- **Foreign Key (FK)**: A link between two tables. For example, `room_id` in the `allocations` table references `id` in the `rooms` table. This ensures that a student cannot be assigned to a room that doesn't exist.

### Q2: What is database normalization, and did you use it?
Yes! The database is normalized to the **Third Normal Form (3NF)**:
- **1NF**: Every column contains atomic (single) values (e.g., we separate `fullname` into a single field, and there are no repeating groups).
- **2NF**: No partial dependencies. All non-key fields in a table depend fully on the primary key. For example, hostel properties (like fee) are in the `hostels` table, not repeated in the `rooms` table.
- **3NF**: No transitive dependencies. Non-key columns do not depend on other non-key columns. For example, roommate details are found by querying the `allocations` table using the `room_id`, rather than saving a roommate's name inside another student's row.

### Q3: How do you calculate the occupancy rate using SQL?
You join the `rooms` and `hostels` tables, summing up capacities and actual occupancies:
```sql
SELECT 
    h.name AS hostel_name,
    SUM(r.capacity) AS total_capacity,
    SUM(r.occupied_count) AS total_occupied,
    ROUND((SUM(r.occupied_count) / SUM(r.capacity)) * 100, 1) AS occupancy_rate
FROM rooms r
JOIN hostels h ON r.hostel_id = h.id
GROUP BY h.id;
```
