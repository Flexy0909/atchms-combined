# CSS Architecture & Styling Guide

This document breaks down the CSS design system used in the **Arusha Technical College Hostel Management System (ATCHMS)**. It explains the design principles, layouts (Flexbox and Grid), custom variables, responsive code, and interactive styling techniques.

---

## 1. Custom CSS Variables (Design System Tokens)

Instead of hardcoding colors, padding, or borders, the project uses **CSS Custom Properties** (Variables) defined inside the `:root` pseudo-class. This allows you to update the theme easily.

```css
:root {
  --primary: #0B5D3B;       /* ATC Dark Green - main branding color */
  --dark: #083D28;          /* Dark Green - used for headers and sidebars */
  --light: #EAF6F0;         /* Light Green Tint - used for backgrounds & hover states */
  --white: #FFFFFF;         /* Pure White - card and panel backgrounds */
  --gold: #D4AF37;          /* Gold Yellow - accent color for badges, active states */
  --text: #1f2a24;          /* Dark Charcoal - primary body text color */
  --muted: #5b6b62;         /* Grayish Green - secondary/muted helper text */
  --border: #e2ebe5;        /* Light Grayish Green - subtle divider lines & borders */
  --shadow-sm: 0 2px 6px rgba(8,61,40,0.06);
  --shadow: 0 10px 30px rgba(8,61,40,0.08); /* Card shadow */
  --radius: 14px;           /* Standardized border radius for rounded cards */
}
```

### Teacher Presentation Note:
*If the teacher asks:* **"Why did you use CSS variables?"**
*Answer:* "CSS variables help maintain a consistent design system. If the college requests to change the color scheme, I only need to edit the color code once in the `:root` block, and the entire website updates instantly."

---

## 2. Page Layout Models: Flexbox vs. Grid

The system utilizes CSS Layout models: **Flexbox** for one-dimensional layouts (rows or columns) and **CSS Grid** for two-dimensional layouts (complex pages).

### A. Flexbox (`display: flex`)
Used where elements need to align in a single line (row) or vertical stack (column):
- **Navbar Wrapper (`.nav`)**: Aligns the logo brand and the main menu on opposite sides.
  ```css
  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  ```
- **Brand Block (`.brand`)**: Places the logo image next to the college text.
- **Top Bar (`.topbar .wrap`)**: Horizontal flex row separating contact details and login/registration buttons.
- **List Items (`.notif li`)**: Aligns notification indicators/icons next to text descriptors.

### B. CSS Grid (`display: grid`)
Used for complex page layouts:
- **Application Shell (`.app`)**: Divides the screen into a sidebar (fixed width) and main content area.
  ```css
  .app {
    display: grid;
    grid-template-columns: 260px 1fr;
    min-height: calc(100vh - 80px);
  }
  ```
- **Dashboard Grid (`.dash-grid`)**: Splits the screen into a primary content column and a narrower side panel.
  ```css
  .dash-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 24px;
  }
  ```
- **3-Column Feature Cards (`.grid-3`)**: Automatically adjusts column counts dynamically.
  ```css
  .grid-3 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
  }
  ```

---

## 3. Interactive Styles & Micro-Animations

To make the application look modern and premium, we used several CSS state selectors and transition properties:

- **Smooth Transitions (`transition`)**: Prevents styles from switching instantly.
  ```css
  a {
    transition: color .2s ease;
  }
  .card {
    transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
  }
  ```
- **Card Hover Elevation**: Hovering over stats or action cards lifts the element slightly (`transform: translateY`) and darkens the shadow to mimic depth.
  ```css
  .card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow);
    border-color: #cfe4d8;
  }
  ```

---

## 4. Modern Forms with Floating Labels

The registration page forms feature interactive floating labels using the CSS sibling selector (`+`).

```css
/* Input field wrapper relative positioning */
.field {
  position: relative; 
  margin-bottom: 20px;
}

/* Label is positioned inside the input box initially */
.field label {
  position: absolute;
  top: 14px; 
  left: 14px;
  color: var(--muted); 
  font-size: 14px;
  pointer-events: none; 
  transition: all .2s ease;
}

/* When input is focused, or text is typed (not showing placeholder), label floats to the top-left */
.field input:focus + label,
.field input:not(:placeholder-shown) + label {
  top: 4px; 
  font-size: 11px; 
  color: var(--primary); 
  font-weight: 600;
  text-transform: uppercase;
}
```

### Teacher Presentation Note:
*If the teacher asks:* **"How do floating labels work without JavaScript?"**
*Answer:* "It uses pure CSS. The inputs have a placeholder of a single space (`placeholder=" "`). When the user clicks the input (`:focus`) or types text (`:not(:placeholder-shown)`), we select the adjacent label using the sibling selector (`+`) and apply a transition transform to move it up and make the font size smaller."

---

## 5. Responsive Design & Media Queries

To ensure the system works seamlessly on mobile phones, tablets, and laptops, we used CSS Media Queries to adapt the layout.

```css
@media (max-width: 980px) {
  /* On tablets/mobiles, change sidebar-main grid to single column */
  .app { 
    grid-template-columns: 1fr; 
  }
  /* Hide desktop sidebar on smaller screens */
  .sidebar { 
    display: none; 
  }
  /* Collapse dashboard columns to a single stack */
  .dash-grid { 
    grid-template-columns: 1fr; 
  }
}
```
- We also use the `clamp()` function for fluid typography (e.g. `font-size: clamp(28px, 4vw, 42px);`), which automatically scales text between mobile and desktop widths without writing multiple media queries.
