# Teacher Defense Q&A Prep Sheet

This document contains the exact questions your teacher is likely to ask during your office meeting, along with the professional answers you should give. Studying these will show the teacher that you fully understand the coding and design details of the system.

---

## Part 1: HTML & Structural Questions

### Q1: What does `<!DOCTYPE html>` mean at the top of your files?
- **Answer**: "It tells the web browser that the document is written in HTML5. It ensures the browser renders the page correctly in standard mode rather than quirks mode."

### Q2: Why did you include `<meta name="viewport" content="width=device-width, initial-scale=1">`?
- **Answer**: "This tag is essential for responsive design. It tells the browser to set the width of the page to match the screen width of the device (mobile, tablet, or desktop) and sets the initial zoom level to 1. Without it, mobile browsers render the page as if it were a desktop screen, making the text tiny."

### Q3: What is the difference between an Ordered List (`<ol>`) and an Unordered List (`<ul>`) in your code?
- **Answer**: "I used an Unordered List (`<ul>`) for bullet points where the sequence doesn't matter (such as room facilities or technical skills). I used an Ordered List (`<ol>`) for sequential items (such as the steps in our hostel services or my personal hobbies) which automatically numbers them 1, 2, 3, etc."

### Q4: Why did you use `Semantic HTML` elements like `<header>`, `<nav>`, `<main>`, `<aside>`, and `<footer>` instead of just using `<div>` tags everywhere?
- **Answer**: "Semantic tags make the code cleaner and improve SEO and accessibility. It helps search engines and screen readers identify the structure of the page (e.g. knowing where the sidebar navigation is versus the main content)."

---

## Part 2: CSS & Styling Questions

### Q5: How did you implement responsive design for the layout?
- **Answer**: "I used CSS Media Queries. In `style.css`, when the screen width drops below `980px` (tablets and mobile phones), the sidebar is hidden (`display: none`), and the grid layout shifts from multiple columns to a single column (`grid-template-columns: 1fr`). This stacks the layout vertically for easy reading on mobile screens."

### Q6: What is the difference between Flexbox and CSS Grid in your project?
- **Answer**: "I used **CSS Grid** for the page-level structure (like splitting the screen into a `260px` sidebar and the main content) and for dashboard panels because Grid is two-dimensional (columns and rows). I used **Flexbox** for aligning linear elements in one direction, like the buttons in the navigation bar, headers, or lists where items align horizontally in a single row."

### Q7: Why did you use `box-sizing: border-box;` in the universal CSS selector (`*`)?
- **Answer**: "By default, browsers add padding and border widths to the total width of an element, causing layouts to break. `border-box` tells the browser to include padding and border inside the declared width, making layout math much easier and preventing elements from spilling over."

### Q8: How did you implement the interactive forms and floating labels?
- **Answer**: "I used a CSS-only technique. The inputs have relative parent containers, and the labels are absolute-positioned over the input. When the input is focused (`:focus`) or has text typed (`:not(:placeholder-shown)`), we use the adjacent sibling selector (`+`) to style and transition the label upwards, changing its color and size."

---

## Part 3: Backend & Database Questions

### Q9: What is the difference between GET and POST methods in your forms?
- **Answer**: 
  - "I use **POST** for forms like Registration, Login, and Payments because POST sends data in the HTTP request body. It keeps sensitive information (like passwords) hidden from the browser address bar and history."
  - "I would use **GET** for search and filters because GET appends parameters to the URL (e.g. `?search=Amina`), which allows users to bookmark or share specific search result pages."

### Q10: How will you handle user authentication and separate students from admins?
- **Answer**: "In the backend database, the `users` table has a `role` column containing either `'student'` or `'admin'`. When a user logs in, the server generates a secure session cookie or token containing their user ID and role. Server middleware intercepts every page request: if a student attempts to access `/admin.html`, the middleware checks their session role, blocks access, and redirects them to the student dashboard."

### Q11: Explain how you prevent database security issues like SQL Injection.
- **Answer**: "I will use **Prepared Statements** and parameter binding. Instead of joining raw user inputs directly into SQL queries, the queries are pre-compiled with placeholders, and input variables are sent separately. This treats user input strictly as data, not executable SQL code."

### Q12: How does the GePG system integrate with your database?
- **Answer**: 
  1. "When an application is approved, the system creates a billing record in the `payments` table and calls the GePG API to fetch a **Control Number**."
  2. "The system saves the 12-digit Control Number returned by GePG. The student sees this control number on their payments page."
  3. "When the student pays via bank or mobile money, GePG sends a payment callback notification to our server."
  4. "The server verifies the GePG digital signature, updates the status of the control number in our database to `paid`, and records the payment date."
