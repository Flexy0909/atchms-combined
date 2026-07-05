/* ================================================================
   ATCHMS AI Chatbot — chatbot.js
   Powered by hostel-bot model on Contabo server
   Floating widget, injected on every page via <script src="chatbot.js">
   ================================================================ */
(function () {
  'use strict';

  const CHATBOT_ENDPOINT = '/atchms/api/chatbot';

  /* ── ATCHMS System Prompt / Brain ── */
  const SYSTEM_PROMPT = `You are ATCHMS Assistant, the official AI chatbot for the Arusha Technical College Hostel Management System (ATCHMS). You are helpful, friendly, professional, and knowledgeable about all aspects of the hostel system.

## About ATCHMS
ATCHMS is the official digital platform for managing student hostel accommodation at Arusha Technical College (ATC), located on Sokoine Road, Arusha, Tanzania. It serves students, hostel administrators, and college staff.

## Key Features You Can Help With

### 1. Student Registration & Login
- Students register using their Admission Number and Email
- Login is via Admission Number or Email + Password
- Admins login ONLY with Email (not admission number)
- Forgot password: Students use Admission Number; Admins use Email to receive OTP

### 2. Hostel Application Process
- Students must be registered and logged in to apply
- Navigate to "My Application" from the dashboard
- Fill in personal details, programme, academic year, gender
- Select a hostel block and room using the 3D room map
- Submit application; status starts as "Pending"
- Admin reviews and approves/rejects applications
- Once approved, a payment control number is generated

### 3. Available Hostels
- ATC has multiple hostel blocks for male and female students
- Rooms are allocated by admin via a 3D room allocation portal
- Students can view room availability, bed labels, and photos
- Each room has a specific number of beds; admin assigns specific beds

### 4. Payment System
- After approval, students receive a control number for payment
- Payment methods: M-Pesa, bank transfer, or mobile money
- Students submit the transaction reference code on the payments page
- Payment status goes to "Verifying" — NOT automatically "Paid"
- Admin must verify the transaction before status changes to "Paid"
- Students receive notifications when payment is verified

### 5. Maintenance Requests
- Students can submit maintenance/repair requests from their dashboard
- Categories: Electrical, Plumbing, Furniture, Cleaning, Network, Other
- Requests go to admin who updates status: Open → In Progress → Resolved
- Students get notified on status changes

### 6. Admin Features
- Admin Dashboard: Overview of students, rooms, applications, payments
- Student Management: View all student details, reset passwords
- Room Management: 3D room allocation, bed label assignment
- Applications: Approve or reject hostel applications with reason
- Payments: Verify payment proofs, issue control numbers
- Reports: Activity logs, logged-in users, financial reports
- Rules: Manage hostel rules visible to students

### 7. Profile & Settings
- Students can update profile photo, phone number, gender, programme
- Password can be changed via profile or forgot-password flow
- Blocked accounts are flagged by admin

### 8. Notifications
- Real-time notifications for application status, payment verification
- Bell icon in header shows unread count
- Click to view all notifications

### 9. Contact Information
- Phone: +255 687 771 750
- Email: hostels@atc.ac.tz / dean@atc.ac.tz
- Office Hours: Monday–Friday 08:00–17:00, Saturday 09:00–13:00
- Address: Arusha Technical College, Sokoine Road, P.O. Box 296, Arusha, Tanzania
- Developer: Salum Abdallah Salum | WhatsApp: +255 687 771 750

### 10. PWA (Progressive Web App)
- ATCHMS can be installed on phones like an app
- Works offline: cached pages available without internet
- Click "Install" banner when prompted or use browser "Add to Home Screen"

## Behavior Guidelines
- Always maintain an extremely professional, official, polite, and respectful tone (appropriate for a college administration assistant). Do not use slang.
- CRITICAL: Output ONLY the final response to the user. Do NOT write any internal monologues, reasoning steps, thoughts, plans, self-corrections, or analysis.
- CRITICAL RULE: Only answer based on the provided Hostel Knowledge Base. If a student asks something outside of the hostel system or if the information is not in your data, politely reply: "I am sorry, I can only assist with ATCHMS hostel-related inquiries. Please contact the warden's office for further assistance."
- If you don't know something, say so honestly and suggest contacting the hostel office or dean.
- For account-specific issues (e.g., "where is my control number"), tell the student to check their dashboard or contact admin.
- Never make up room numbers, prices, or personal data.
- Respond in the same language the user writes in (English or Swahili).
- Keep responses short, clear, and well-structured — use bullet points when listing steps.
- If asked about technical errors, suggest refreshing the page or contacting support.
- Tumia msimbo kwa uangalifu.`;

  /* ── Conversation History ── */
  let conversationHistory = [{ role: 'system', content: SYSTEM_PROMPT }];
  let isOpen = false;
  let isTyping = false;

  /* ── Call AI API ── */
  async function askChatbot(userMessage) {
    conversationHistory.push({ role: 'user', content: userMessage });
    try {
      const response = await fetch(CHATBOT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const reply = data.choices[0].message.content;
      conversationHistory.push({ role: 'assistant', content: reply });
      return reply;
    } catch (err) {
      console.error('[ATCHMS Bot] Error:', err);
      conversationHistory.pop(); // Remove failed user message
      return "Sorry, I'm having trouble connecting right now. Please try again or contact the hostel office at **hostels@atc.ac.tz** or call **+255 687 771 750**.";
    }
  }

  /* ── Format bot reply (basic markdown → HTML) ── */
  function formatMessage(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;font-size:13px;color:#0B5D3B;">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 style="margin:8px 0 4px;font-size:14px;color:#0B5D3B;">$1</h3>')
      .replace(/^- (.+)$/gm, '<li style="margin:2px 0;padding-left:4px;">$1</li>')
      .replace(/(<li.*<\/li>\n?)+/g, m => `<ul style="padding-left:16px;margin:6px 0;">${m}</ul>`)
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  /* ── Suggested Quick Replies ── */
  const QUICK_REPLIES = [
    '🏠 How do I apply for a hostel?',
    '💳 How do I pay hostel fees?',
    '🔑 How do I reset my password?',
    '🛠️ How do I report a maintenance issue?',
    '📋 How do I check my application status?',
    '📞 How do I contact the hostel office?',
  ];

  /* ── Build Widget HTML ── */
  function buildWidget() {
    const widget = document.createElement('div');
    widget.id = 'atchms-chat-widget';
    widget.innerHTML = `
      <!-- Chat Toggle Button -->
      <button id="chat-fab" aria-label="Open ATCHMS Assistant" title="Chat with ATCHMS Assistant">
        <span id="chat-fab-icon">💬</span>
        <span id="chat-fab-close" style="display:none;">✕</span>
        <span id="chat-unread-dot"></span>
      </button>

      <!-- Chat Panel -->
      <div id="chat-panel" aria-hidden="true">
        <!-- Header -->
        <div id="chat-header">
          <div id="chat-header-left">
            <div id="chat-avatar">
              <img src="/atchms/atc-logo.png" alt="ATCHMS Bot" />
              <span id="chat-online-dot"></span>
            </div>
            <div>
              <div id="chat-title">ATCHMS Assistant</div>
              <div id="chat-subtitle">Powered by AI · Online</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="chat-clear-btn" title="Clear chat">🗑</button>
            <button id="chat-close-btn" title="Close">✕</button>
          </div>
        </div>

        <!-- Messages -->
        <div id="chat-messages">
          <div class="chat-msg bot-msg" id="welcome-msg">
            <div class="msg-bubble">
              👋 <strong>Hello! I'm your ATCHMS Assistant.</strong><br><br>
              I can help you with hostel applications, payments, room allocation, maintenance requests, and much more!<br><br>
              <em>What can I help you with today?</em>
            </div>
          </div>
          <!-- Quick Replies -->
          <div id="quick-replies">
            ${QUICK_REPLIES.map(q => `<button class="quick-reply-btn">${q}</button>`).join('')}
          </div>
          <!-- Typing Indicator (inside messages so insertBefore works) -->
          <div id="chat-typing" style="display:none;">
            <div class="chat-msg bot-msg">
              <div class="msg-bubble typing-bubble">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div id="chat-input-area">
          <textarea id="chat-input" placeholder="Ask me anything about ATCHMS…" rows="1" maxlength="500"></textarea>
          <button id="chat-send-btn" title="Send message">➤</button>
        </div>
        <div id="chat-footer">ATCHMS AI Assistant · ATC Arusha</div>
      </div>
    `;
    document.body.appendChild(widget);
  }

  /* ── Inject Styles ── */
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      /* ── FAB Button ── */
      #chat-fab {
        position: fixed;
        bottom: 80px;
        right: 20px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #0B5D3B, #1a8a5a);
        color: #fff;
        border: none;
        cursor: pointer;
        font-size: 24px;
        box-shadow: 0 6px 24px rgba(11,93,59,0.45);
        z-index: 9998;
        transition: transform .25s, box-shadow .25s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #chat-fab:hover { transform: scale(1.1); box-shadow: 0 10px 32px rgba(11,93,59,0.55); }
      #chat-unread-dot {
        position: absolute;
        top: 6px; right: 6px;
        width: 10px; height: 10px;
        background: #FFD700;
        border-radius: 50%;
        display: none;
        border: 2px solid #fff;
      }

      /* ── Chat Panel ── */
      #chat-panel {
        position: fixed;
        bottom: 148px;
        right: 16px;
        width: min(380px, calc(100vw - 24px));
        max-height: 70vh;
        background: #fff;
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(11,93,59,0.12);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 9997;
        opacity: 0;
        transform: translateY(20px) scale(0.95);
        pointer-events: none;
        transition: opacity .3s ease, transform .3s ease;
      }
      #chat-panel.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: all;
      }

      /* ── Header ── */
      #chat-header {
        background: linear-gradient(135deg, #0B5D3B, #1a8a5a);
        color: #fff;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      #chat-header-left { display: flex; align-items: center; gap: 12px; }
      #chat-avatar {
        width: 40px; height: 40px;
        border-radius: 50%;
        background: rgba(255,255,255,0.2);
        overflow: hidden;
        position: relative;
        flex-shrink: 0;
        border: 2px solid rgba(255,255,255,0.4);
      }
      #chat-avatar img { width: 100%; height: 100%; object-fit: cover; }
      #chat-online-dot {
        position: absolute; bottom: 1px; right: 1px;
        width: 10px; height: 10px;
        background: #4ade80;
        border-radius: 50%;
        border: 2px solid #0B5D3B;
      }
      #chat-title { font-weight: 700; font-size: 14px; }
      #chat-subtitle { font-size: 11px; opacity: .75; }
      #chat-close-btn, #chat-clear-btn {
        background: rgba(255,255,255,0.15);
        border: none; color: #fff;
        width: 28px; height: 28px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 13px;
        display: flex; align-items: center; justify-content: center;
        transition: background .2s;
      }
      #chat-close-btn:hover, #chat-clear-btn:hover { background: rgba(255,255,255,0.3); }

      /* ── Messages Area ── */
      #chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px 14px 8px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 380px;
        scroll-behavior: smooth;
      }
      #chat-messages::-webkit-scrollbar { width: 4px; }
      #chat-messages::-webkit-scrollbar-thumb { background: #c9e6d8; border-radius: 4px; }

      .chat-msg { display: flex; }
      .bot-msg { justify-content: flex-start; }
      .user-msg { justify-content: flex-end; }

      .msg-bubble {
        max-width: 82%;
        padding: 10px 14px;
        border-radius: 18px;
        font-size: 13.5px;
        line-height: 1.55;
        word-wrap: break-word;
      }
      .bot-msg .msg-bubble {
        background: #f0f7f3;
        border-bottom-left-radius: 6px;
        color: #1f2a24;
        border: 1px solid #e0ede6;
      }
      .user-msg .msg-bubble {
        background: linear-gradient(135deg, #0B5D3B, #1a8a5a);
        color: #fff;
        border-bottom-right-radius: 6px;
      }

      /* Typing dots */
      .typing-bubble {
        display: flex; gap: 5px; align-items: center;
        padding: 12px 16px;
      }
      .typing-bubble span {
        width: 7px; height: 7px;
        background: #0B5D3B;
        border-radius: 50%;
        animation: typingDot 1.2s infinite ease-in-out;
      }
      .typing-bubble span:nth-child(2) { animation-delay: .2s; }
      .typing-bubble span:nth-child(3) { animation-delay: .4s; }
      @keyframes typingDot {
        0%, 80%, 100% { transform: scale(.7); opacity: .4; }
        40% { transform: scale(1); opacity: 1; }
      }

      /* Quick replies */
      #quick-replies {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 4px;
      }
      .quick-reply-btn {
        background: #f0f7f3;
        border: 1.5px solid #c9e6d8;
        color: #0B5D3B;
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background .2s, transform .15s;
        font-family: inherit;
      }
      .quick-reply-btn:hover {
        background: #0B5D3B;
        color: #fff;
        border-color: #0B5D3B;
        transform: translateY(-1px);
      }

      /* Timestamp */
      .msg-time {
        font-size: 10px;
        opacity: .45;
        margin-top: 3px;
        padding: 0 4px;
      }
      .bot-msg .msg-time { text-align: left; }
      .user-msg .msg-time { text-align: right; }

      /* ── Input Area ── */
      #chat-input-area {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        padding: 10px 14px;
        border-top: 1px solid #e8f2ec;
        background: #fff;
      }
      #chat-input {
        flex: 1;
        border: 1.5px solid #d0e8da;
        border-radius: 20px;
        padding: 10px 14px;
        font-size: 13.5px;
        font-family: inherit;
        resize: none;
        outline: none;
        max-height: 100px;
        line-height: 1.4;
        transition: border-color .2s;
        color: #1f2a24;
        background: #f9fdfb;
      }
      #chat-input:focus { border-color: #0B5D3B; background: #fff; }
      #chat-send-btn {
        width: 40px; height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, #0B5D3B, #1a8a5a);
        color: #fff;
        border: none;
        cursor: pointer;
        font-size: 16px;
        flex-shrink: 0;
        transition: transform .2s, opacity .2s;
        display: flex; align-items: center; justify-content: center;
      }
      #chat-send-btn:hover { transform: scale(1.1); }
      #chat-send-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }

      #chat-footer {
        text-align: center;
        font-size: 10px;
        color: #8aab99;
        padding: 4px 0 8px;
        background: #fff;
      }

      /* Error bubble */
      .error-bubble .msg-bubble {
        background: #fff3f3;
        border-color: #ffd0d0;
        color: #c0392b;
      }

      /* Mobile adjustments */
      @media (max-width: 480px) {
        #chat-panel { bottom: 140px; right: 8px; left: 8px; width: auto; }
        #chat-fab { bottom: 75px; right: 14px; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ── Helper: add message bubble ── */
  function addMessage(text, role, isError = false) {
    const container = document.getElementById('chat-messages');
    const typing = document.getElementById('chat-typing');

    // Remove quick replies after first user message
    if (role === 'user') {
      const qr = document.getElementById('quick-replies');
      if (qr) qr.remove();
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg ' + (role === 'user' ? 'user-msg' : 'bot-msg') + (isError ? ' error-bubble' : '');

    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const content = role === 'user' ? escapeHtml(text) : formatMessage(text);

    wrapper.innerHTML = '<div><div class="msg-bubble">' + content + '</div><div class="msg-time">' + now + '</div></div>';

    // Insert before typing indicator (which is now inside #chat-messages)
    if (typing && typing.parentNode === container) {
      container.insertBefore(wrapper, typing);
    } else {
      container.appendChild(wrapper);
    }

    // Scroll to bottom
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 20);
    return wrapper;
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  /* ── Show/Hide typing indicator ── */
  function setTyping(show) {
    const el = document.getElementById('chat-typing');
    const container = document.getElementById('chat-messages');
    el.style.display = show ? 'block' : 'none';
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 20);
  }

  /* ── Toggle chat open/close ── */
  function toggleChat() {
    isOpen = !isOpen;
    const panel = document.getElementById('chat-panel');
    const fabIcon = document.getElementById('chat-fab-icon');
    const fabClose = document.getElementById('chat-fab-close');
    const dot = document.getElementById('chat-unread-dot');

    panel.classList.toggle('open', isOpen);
    panel.setAttribute('aria-hidden', String(!isOpen));
    fabIcon.style.display = isOpen ? 'none' : 'flex';
    fabClose.style.display = isOpen ? 'flex' : 'none';
    dot.style.display = 'none';

    if (isOpen) {
      setTimeout(() => document.getElementById('chat-input').focus(), 300);
    }
  }

  /* ── Send message ── */
  async function sendMessage(text) {
    const input = text || document.getElementById('chat-input').value.trim();
    if (!input || isTyping) return;

    document.getElementById('chat-input').value = '';
    autoResize(document.getElementById('chat-input'));
    addMessage(input, 'user');

    isTyping = true;
    document.getElementById('chat-send-btn').disabled = true;
    setTyping(true);

    const reply = await askChatbot(input);

    setTyping(false);
    addMessage(reply, 'bot');

    isTyping = false;
    document.getElementById('chat-send-btn').disabled = false;
    document.getElementById('chat-input').focus();
  }

  /* ── Auto-resize textarea ── */
  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  /* ── Clear chat ── */
  function clearChat() {
    const msgs = document.getElementById('chat-messages');
    msgs.innerHTML = `
      <div class="chat-msg bot-msg" id="welcome-msg">
        <div class="msg-bubble">
          👋 <strong>Chat cleared!</strong><br><br>
          How can I help you today?
        </div>
      </div>
      <div id="quick-replies">
        ${QUICK_REPLIES.map(q => `<button class="quick-reply-btn">${q}</button>`).join('')}
      </div>
    `;
    conversationHistory = [{ role: 'system', content: SYSTEM_PROMPT }];
    bindQuickReplies();
  }

  /* ── Bind quick reply buttons ── */
  function bindQuickReplies() {
    document.querySelectorAll('.quick-reply-btn').forEach(btn => {
      btn.addEventListener('click', () => sendMessage(btn.textContent));
    });
  }

  /* ── Init ── */
  function init() {
    injectStyles();
    buildWidget();

    // Show unread dot after 3 seconds to entice users
    setTimeout(() => {
      if (!isOpen) document.getElementById('chat-unread-dot').style.display = 'block';
    }, 3000);

    // FAB toggle
    document.getElementById('chat-fab').addEventListener('click', toggleChat);
    document.getElementById('chat-close-btn').addEventListener('click', toggleChat);
    document.getElementById('chat-clear-btn').addEventListener('click', clearChat);

    // Send button
    document.getElementById('chat-send-btn').addEventListener('click', () => sendMessage());

    // Enter to send (Shift+Enter for newline)
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea
    document.getElementById('chat-input').addEventListener('input', function () {
      autoResize(this);
    });

    // Quick replies
    bindQuickReplies();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
