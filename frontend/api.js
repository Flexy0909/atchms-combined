/* ATCHMS Frontend API Helper — include in every page */
(function () {
  // When deployed to Vercel, use the VPS backend URL directly.
  // Falls back to relative path when running on the same VPS.
  const VPS_API = 'http://185.202.236.94/atchms/api';
  const IS_VERCEL = window.location.hostname !== '185.202.236.94' &&
                    !window.location.hostname.includes('localhost') &&
                    !window.location.hostname.includes('127.0.0.1');
  const BASE_PATH = IS_VERCEL ? '' : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
  const API = IS_VERCEL ? VPS_API : BASE_PATH + 'api';

  window.ATCHMS = {
    getToken : () => sessionStorage.getItem('atchms_token'),
    getUser  : () => JSON.parse(sessionStorage.getItem('atchms_user') || 'null'),
    isLoggedIn: () => !!sessionStorage.getItem('atchms_token'),
    isAdmin  : () => {
      const u = JSON.parse(sessionStorage.getItem('atchms_user') || 'null');
      return u && u.role === 'admin';
    },

    login: async (email, password) => {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email, password })
      });
      const d = await r.json();
      if (d.token) {
        sessionStorage.setItem('atchms_token', d.token);
        sessionStorage.setItem('atchms_user',  JSON.stringify(d.user));
      }
      return d;
    },

    logout: () => {
      sessionStorage.removeItem('atchms_token');
      sessionStorage.removeItem('atchms_user');
      window.location.href = BASE_PATH + 'login.html';
    },

    api: async (path, options = {}) => {
      const token = sessionStorage.getItem('atchms_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const r = await fetch(`${API}${path}`, {
        ...options, headers: { ...headers, ...(options.headers || {}) }
      });
      return r.json();
    },

    requireAuth: (redirectTo = null) => {
      if (!redirectTo) redirectTo = BASE_PATH + 'login.html';
      if (!sessionStorage.getItem('atchms_token')) {
        window.location.href = redirectTo;
        return false;
      }
      return true;
    },

    requireAdmin: () => {
      const u = JSON.parse(sessionStorage.getItem('atchms_user') || 'null');
      if (!u || u.role !== 'admin') {
        window.location.href = BASE_PATH + 'login.html';
        return false;
      }
      return true;
    },

    requireStudent: () => {
      if (!window.ATCHMS.requireAuth()) return false;
      const u = JSON.parse(sessionStorage.getItem('atchms_user') || 'null');
      if (u && u.role === 'admin') {
        window.location.href = BASE_PATH + 'admin.html';
        return false;
      }
      window.ATCHMS.checkProfileCompletion();
      return true;
    },

    checkProfileCompletion: async () => {
      const u = JSON.parse(sessionStorage.getItem('atchms_user') || 'null');
      if (!u || u.role === 'admin') return;
      const path = window.location.pathname;
      if (path.includes('profile.html') || path.includes('login.html') || path.includes('register.html')) {
        return;
      }
      try {
        const p = await window.ATCHMS.api('/auth/profile');
        const isComplete = p.first_name && p.last_name && p.phone_no && p.programme && p.academic_year && p.gender && p.avatar_url;
        if (!isComplete) {
          window.location.href = BASE_PATH + 'profile.html?incomplete=1';
        }
      } catch (e) {
        console.error('Profile check failed:', e);
      }
    },

    previewImage: (url) => {
      if (!url) return;
      let lightbox = document.getElementById('atchms-lightbox');
      if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'atchms-lightbox';
        lightbox.style.cssText = `
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        `;
        lightbox.innerHTML = `
          <div style="position: relative; max-width: 90%; max-height: 90%; display: flex; flex-direction: column; align-items: center;">
            <button id="atchms-lightbox-close" style="position: absolute; top: -40px; right: 0; background: none; border: none; color: #fff; font-size: 32px; cursor: pointer; font-weight: bold; padding: 5px;">&times;</button>
            <img id="atchms-lightbox-img" src="" style="max-width: 100%; max-height: 80vh; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); object-fit: contain; transform: scale(0.95); transition: transform 0.3s ease;" />
            <div style="color: #fff; margin-top: 15px; font-size: 14px; font-family: sans-serif; background: rgba(0,0,0,0.6); padding: 6px 16px; border-radius: 20px;">Image Preview</div>
          </div>
        `;
        document.body.appendChild(lightbox);
        lightbox.addEventListener('click', (e) => {
          if (e.target === lightbox || e.target.id === 'atchms-lightbox-close') {
            lightbox.style.opacity = '0';
            lightbox.style.pointerEvents = 'none';
            document.getElementById('atchms-lightbox-img').style.transform = 'scale(0.95)';
          }
        });
      }
      const img = document.getElementById('atchms-lightbox-img');
      img.src = url;
      lightbox.style.pointerEvents = 'auto';
      lightbox.style.opacity = '1';
      setTimeout(() => {
        img.style.transform = 'scale(1)';
      }, 50);
    },

    fmtDate: (d) => d ? new Date(d).toLocaleDateString('en-GB',
      { day:'2-digit', month:'short', year:'numeric' }) : '—',

    badgeClass: (status) => ({
      approved: 'badge-green', pending: 'badge-gold', rejected: 'badge-red',
      paid: 'badge-green', active: 'badge-green', open: 'badge-gold',
      'in-progress': 'badge-gold', resolved: 'badge-green',
      full: 'badge-red', closed: 'badge-red'
    }[status] || 'badge-gold'),

    // Premium Custom UI Alert Modal
    alert: (message, title = "Arusha Technical College") => {
      return new Promise((resolve) => {
        // Detect alert theme dynamically
        let themeColor = 'var(--primary, #0B5D3B)';
        let iconHtml = 'ℹ️';
        const titleLower = title.toLowerCase();
        const msgLower = message.toLowerCase();

        if (titleLower.includes('success') || msgLower.includes('success') || msgLower.includes('✅') || msgLower.includes('successfully')) {
          themeColor = '#2aa874';
          iconHtml = '✅';
        } else if (titleLower.includes('error') || msgLower.includes('error') || msgLower.includes('failed') || msgLower.includes('❌') || msgLower.includes('invalid')) {
          themeColor = '#c0392b';
          iconHtml = '❌';
        } else if (titleLower.includes('warning') || titleLower.includes('confirm') || msgLower.includes('warning')) {
          themeColor = 'var(--gold, #D4AF37)';
          iconHtml = '⚠️';
        }

        // Clean double emojis if they exist in message
        let cleanMsg = message;
        if (cleanMsg.startsWith('✅') || cleanMsg.startsWith('❌') || cleanMsg.startsWith('⚠️')) {
          cleanMsg = cleanMsg.substring(2).trim();
        }

        const overlay = document.createElement('div');
        overlay.className = 'atchms-modal-overlay';
        
        const box = document.createElement('div');
        box.className = 'atchms-modal-box';
        box.style.borderTop = `5px solid ${themeColor}`;
        box.innerHTML = `
          <div class="atchms-modal-icon" style="font-size: 40px; text-align: center; margin-bottom: 12px;">${iconHtml}</div>
          <div class="atchms-modal-header" style="text-align: center; font-size: 18px; font-weight: 700; color: var(--dark, #083D28); margin-bottom: 10px;">${title}</div>
          <div class="atchms-modal-body" style="text-align: center; font-size: 14.5px; color: var(--text, #1f2a24); line-height: 1.6; margin-bottom: 24px;">${cleanMsg}</div>
          <div class="atchms-modal-footer" style="text-align: center;">
            <button class="btn btn-primary" style="padding: 10px 30px; font-size: 14px; border-radius: 8px; width: auto; background-color: ${themeColor}; border: none; color: white;">OK</button>
          </div>
        `;
        
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        setTimeout(() => {
          overlay.classList.add('active');
          box.classList.add('active');
        }, 10);
        
        box.querySelector('button').addEventListener('click', () => {
          overlay.classList.remove('active');
          box.classList.remove('active');
          setTimeout(() => {
            document.body.removeChild(overlay);
            resolve();
          }, 200);
        });
      });
    },

    // Premium Custom UI Confirm Modal
    confirm: (message, title = "Confirm Action") => {
      return new Promise((resolve) => {
        // Detect alert theme dynamically
        let themeColor = 'var(--primary, #0B5D3B)';
        let iconHtml = '❓';
        const titleLower = title.toLowerCase();
        const msgLower = message.toLowerCase();

        if (titleLower.includes('success') || msgLower.includes('success') || msgLower.includes('✅') || msgLower.includes('successfully')) {
          themeColor = '#2aa874';
          iconHtml = '✅';
        } else if (titleLower.includes('error') || msgLower.includes('error') || msgLower.includes('failed') || msgLower.includes('delete') || msgLower.includes('remove')) {
          themeColor = '#c0392b';
          iconHtml = '⚠️';
        } else if (titleLower.includes('confirm') || titleLower.includes('warning') || msgLower.includes('sure')) {
          themeColor = 'var(--gold, #D4AF37)';
          iconHtml = '⚠️';
        }

        const overlay = document.createElement('div');
        overlay.className = 'atchms-modal-overlay';
        
        const box = document.createElement('div');
        box.className = 'atchms-modal-box';
        box.style.borderTop = `5px solid ${themeColor}`;
        box.innerHTML = `
          <div class="atchms-modal-icon" style="font-size: 40px; text-align: center; margin-bottom: 12px;">${iconHtml}</div>
          <div class="atchms-modal-header" style="text-align: center; font-size: 18px; font-weight: 700; color: var(--dark, #083D28); margin-bottom: 10px;">${title}</div>
          <div class="atchms-modal-body" style="text-align: center; font-size: 14.5px; color: var(--text, #1f2a24); line-height: 1.6; margin-bottom: 24px;">${message}</div>
          <div class="atchms-modal-footer" style="display: flex; gap: 12px; justify-content: center;">
            <button class="btn btn-outline cancel-btn" style="padding: 10px 22px; font-size: 14px; border-radius: 8px; width: auto; border: 1.5px solid var(--border, #cccccc); color: var(--text, #333333); background: transparent;">Cancel</button>
            <button class="btn btn-primary confirm-btn" style="padding: 10px 22px; font-size: 14px; border-radius: 8px; width: auto; background-color: ${themeColor}; border: none; color: white;">Confirm</button>
          </div>
        `;
        
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        setTimeout(() => {
          overlay.classList.add('active');
          box.classList.add('active');
        }, 10);
        
        const close = (result) => {
          overlay.classList.remove('active');
          box.classList.remove('active');
          setTimeout(() => {
            document.body.removeChild(overlay);
            resolve(result);
          }, 200);
        };
        
        box.querySelector('.cancel-btn').addEventListener('click', () => close(false));
        box.querySelector('.confirm-btn').addEventListener('click', () => close(true));
      });
    }
  };

  // Inject Premium Modal Styles
  const style = document.createElement('style');
  style.textContent = `
    .atchms-modal-overlay {
      position: fixed; inset: 0;
      background: rgba(8, 61, 40, 0.45);
      backdrop-filter: blur(5px);
      display: grid; place-items: center;
      z-index: 99999; opacity: 0;
      pointer-events: none;
      visibility: hidden;
      transition: opacity 0.25s ease, visibility 0.25s ease;
    }
    .atchms-modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
      visibility: visible;
    }
    .atchms-modal-box {
      background: var(--white, #ffffff);
      border-radius: var(--radius, 14px);
      box-shadow: 0 20px 50px rgba(8, 61, 40, 0.15);
      width: 90%; max-width: 420px;
      padding: 24px;
      transform: translateY(20px);
      transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.2);
    }
    .atchms-modal-box.active { transform: translateY(0); }
    .atchms-modal-header {
      font-size: 17px; font-weight: 700;
      color: var(--dark, #083D28); margin-bottom: 8px;
    }
    .atchms-modal-body {
      font-size: 14px; color: var(--text, #1f2a24);
      line-height: 1.5; margin-bottom: 20px;
    }
    .atchms-modal-footer { text-align: right; }
    
    /* Notifications Toaster Alert */
    .notification-toaster {
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--white, #ffffff);
      border-left: 5px solid var(--primary, #0B5D3B);
      box-shadow: 0 10px 30px rgba(0,0,0,0.15);
      border-radius: 8px;
      padding: 16px;
      z-index: 10000;
      width: 320px;
      transform: translateX(380px);
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.25);
      font-family: inherit;
    }
    .notification-toaster.active {
      transform: translateX(0);
    }
    .notification-toaster h5 {
      margin: 0 0 4px 0;
      font-size: 14.5px;
      color: var(--dark, #083D28);
      font-weight: 700;
    }
    .notification-toaster p {
      margin: 0;
      font-size: 13px;
      color: var(--text, #1f2a24);
      line-height: 1.4;
    }
    
    /* Header Notifications Bell styling */
    /* Header Notifications Bell styling */
    .notif-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .notif-bell {
      position: relative;
      font-size: 16px;
      width: 36px;
      height: 36px;
      border: 1px solid var(--border);
      border-radius: 50%;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--white);
      color: var(--dark);
      transition: all 0.2s ease;
    }
    .notif-bell:hover {
      background: #f4fdf8;
      border-color: var(--primary);
    }
    .notif-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      background: #e74c3c;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      border-radius: 50%;
      min-width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--white);
    }
    .notif-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      background: var(--white);
      box-shadow: 0 10px 30px rgba(0,0,0,0.15);
      border-radius: 10px;
      width: 320px;
      border: 1px solid var(--border);
      display: none;
      flex-direction: column;
      z-index: 9999;
      margin-top: 8px;
    }
    .notif-dropdown.active {
      display: flex;
    }
    .notif-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      font-size: 14px;
      color: var(--dark);
    }
    .notif-header a {
      font-size: 12px;
      color: var(--primary);
    }
    .notif-list {
      max-height: 280px;
      overflow-y: auto;
    }
    .notif-item {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      color: var(--text);
      line-height: 1.4;
      cursor: pointer;
      transition: background 0.2s ease;
      text-align: left;
    }
    .notif-item:hover {
      background: #f7fbf8;
    }
    .notif-item.unread {
      background: #f0f7f3;
      font-weight: 500;
    }
    .notif-item h6 {
      margin: 0 0 3px 0;
      font-size: 13px;
      color: var(--dark);
      font-weight: 600;
    }
    .notif-item p {
      margin: 0;
      font-size: 12px;
      color: var(--text);
    }
    .notif-item span {
      font-size: 10px;
      color: var(--muted);
      display: block;
      margin-top: 4px;
    }
    .notif-empty {
      padding: 24px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
    }
  `;
  // Automatic Inactivity Session Timeout
  if (window.ATCHMS.isLoggedIn()) {
    const user = window.ATCHMS.getUser();
    const timeoutDuration = (user && user.role === 'admin') ? 15 * 60 * 1000 : 30 * 60 * 1000;
    
    let lastActivityTime = Date.now();
    const updateActivity = () => { lastActivityTime = Date.now(); };
    
    ['click', 'mousemove', 'keypress', 'touchstart'].forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });
    
    setInterval(() => {
      if (Date.now() - lastActivityTime >= timeoutDuration) {
        window.ATCHMS.logout();
      }
    }, 10000);
  }

  // Show toast notification
  window.ATCHMS.showToast = (title, message) => {
    const toast = document.createElement('div');
    toast.className = 'notification-toaster';
    toast.innerHTML = `<h5>🔔 ${title}</h5><p>${message}</p>`;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('active'), 100);
    
    setTimeout(() => {
      toast.classList.remove('active');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  };

  // Initialize Real-time Notification Stream
  window.ATCHMS.initNotificationStream = () => {
    const token = window.ATCHMS.getToken();
    if (!token) return;

    const streamUrl = `${API}/notifications/stream?token=${encodeURIComponent(token)}`;
    const source = new EventSource(streamUrl);

    source.onmessage = (event) => {
      try {
        const notification = JSON.parse(event.data);
        window.ATCHMS.showToast(notification.title, notification.message);
        
        const customEvent = new CustomEvent('atchms-notification', { detail: notification });
        window.dispatchEvent(customEvent);
      } catch (err) {
        console.error('Error parsing notification event:', err);
      }
    };

    source.onerror = (err) => {
      console.warn('SSE notification stream disconnected. Reconnecting in 5s...');
      source.close();
      setTimeout(window.ATCHMS.initNotificationStream, 5000);
    };
  };

  // Setup Bell UI in Header Menu
  const setupNotificationsBellUI = async () => {
    const nav = document.querySelector('.nav');
    if (!nav || !window.ATCHMS.isLoggedIn()) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'notif-wrapper';
    wrapper.style.marginLeft = '12px';
    wrapper.innerHTML = `
      <a href="#" class="notif-bell" id="bell-toggle">
        🔔<span class="notif-badge" id="notif-count" style="display:none;">0</span>
      </a>
      <div class="notif-dropdown" id="notif-dropdown">
        <div class="notif-header">
          <span>Notifications</span>
          <a href="#" id="mark-all-read-btn">Mark all read</a>
        </div>
        <div class="notif-list" id="notif-list">
          <div class="notif-empty">No notifications yet</div>
        </div>
      </div>
    `;
    nav.appendChild(wrapper);

    const toggleBtn = wrapper.querySelector('#bell-toggle');
    const dropdown = wrapper.querySelector('#notif-dropdown');
    const listContainer = wrapper.querySelector('#notif-list');
    const badgeCount = wrapper.querySelector('#notif-count');
    const markReadBtn = wrapper.querySelector('#mark-all-read-btn');

    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      dropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) dropdown.classList.remove('active');
    });

    let notifications = [];

    const renderNotifications = () => {
      const unreadCount = notifications.filter(n => !n.is_read).length;
      if (unreadCount > 0) {
        badgeCount.textContent = unreadCount;
        badgeCount.style.display = 'flex';
      } else {
        badgeCount.style.display = 'none';
      }

      if (notifications.length === 0) {
        listContainer.innerHTML = '<div class="notif-empty">No notifications yet</div>';
        return;
      }

      listContainer.innerHTML = notifications.map(n => `
        <div class="notif-item${n.is_read ? '' : ' unread'}">
          <h6>${n.title}</h6>
          <p>${n.message}</p>
          <span>${window.ATCHMS.fmtDate(n.created_at)}</span>
        </div>
      `).join('');
    };

    const fetchNotifications = async () => {
      try {
        const rows = await window.ATCHMS.api('/notifications');
        notifications = rows;
        renderNotifications();
      } catch (err) {
        console.error('Failed to load notifications:', err);
      }
    };

    markReadBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await window.ATCHMS.api('/notifications/mark-read', { method: 'POST' });
        notifications = notifications.map(n => ({ ...n, is_read: true }));
        renderNotifications();
      } catch (err) {
        console.error(err);
      }
    });

    fetchNotifications();

    window.addEventListener('atchms-notification', (e) => {
      const newNotif = e.detail;
      notifications.unshift(newNotif);
      renderNotifications();
    });
  };

  // Auto-connect and check blocked state if logged in
  if (window.ATCHMS.isLoggedIn()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        window.ATCHMS.initNotificationStream();
        setupNotificationsBellUI();
      });
    } else {
      window.ATCHMS.initNotificationStream();
      setupNotificationsBellUI();
    }
  }

  document.head.appendChild(style);

  /* ══════════════════════════════════════════════
     PWA: Service Worker Registration
     ══════════════════════════════════════════════ */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(BASE_PATH + 'sw.js', { scope: BASE_PATH })
        .then(reg => {
          console.log('[ATCHMS PWA] Service Worker registered ✅ scope:', reg.scope);
          // Auto-update on new version
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateBanner();
              }
            });
          });
        })
        .catch(err => console.warn('[ATCHMS PWA] SW registration failed:', err));
    });
  }

  /* ── PWA Install Prompt Banner ── */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Only show once per session
    if (!sessionStorage.getItem('pwa_install_dismissed')) {
      showInstallBanner();
    }
  });

  function showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
      <div style="
        position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
        background:linear-gradient(135deg,#0B5D3B,#1a8a5a);
        color:#fff; padding:14px 20px; border-radius:16px;
        box-shadow:0 8px 32px rgba(0,0,0,0.3);
        display:flex; align-items:center; gap:14px;
        z-index:99999; max-width:360px; width:calc(100% - 32px);
        backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.2);
        animation: slideUp 0.4s ease;
      ">
        <img src="${BASE_PATH}icons/icon-72x72.png" style="width:40px;height:40px;border-radius:10px;" alt="ATCHMS" />
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px;">Install ATCHMS App</div>
          <div style="font-size:12px;opacity:0.85;">Access offline, faster loading</div>
        </div>
        <button id="pwa-install-btn" style="
          background:#FFD700;color:#0B5D3B;border:none;
          padding:8px 16px;border-radius:999px;font-weight:700;
          font-size:13px;cursor:pointer;white-space:nowrap;
        ">Install</button>
        <button id="pwa-dismiss-btn" style="
          background:rgba(255,255,255,0.2);color:#fff;border:none;
          width:28px;height:28px;border-radius:50%;cursor:pointer;
          font-size:16px;display:flex;align-items:center;justify-content:center;
        ">✕</button>
      </div>
      <style>@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>
    `;
    document.body.appendChild(banner);

    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[ATCHMS PWA] Install outcome:', outcome);
        deferredPrompt = null;
      }
      banner.remove();
    });

    document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
      sessionStorage.setItem('pwa_install_dismissed', '1');
      banner.remove();
    });
  }

  function showUpdateBanner() {
    if (document.getElementById('pwa-update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.innerHTML = `
      <div style="
        position:fixed; top:16px; left:50%; transform:translateX(-50%);
        background:#1a8a5a; color:#fff; padding:12px 20px; border-radius:12px;
        box-shadow:0 4px 20px rgba(0,0,0,0.25); display:flex;
        align-items:center; gap:12px; z-index:99999; max-width:340px;
        width:calc(100% - 32px);
      ">
        <span>🔄 New version available!</span>
        <button onclick="window.location.reload()" style="
          background:#FFD700;color:#0B5D3B;border:none;
          padding:6px 14px;border-radius:999px;font-weight:700;
          font-size:13px;cursor:pointer;
        ">Update</button>
      </div>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 10000);
  }

})();
