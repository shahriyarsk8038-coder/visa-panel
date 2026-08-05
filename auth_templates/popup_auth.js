const AUTH_SERVER_URL = "http://192.168.0.100:5000/api/client";

document.addEventListener('DOMContentLoaded', () => {
  injectAuthUi();
});

function injectAuthUi() {
  const container = document.createElement('div');
  container.id = 'extensionAuthWrapper';
  container.innerHTML = `
    <style>
      #extensionAuthWrapper {
        font-family: 'Manrope', system-ui, sans-serif;
        margin-bottom: 12px;
      }
      .auth-card {
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #1e293b;
        border-radius: 10px;
        padding: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      .auth-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .auth-title {
        font-size: 13px;
        font-weight: 700;
        color: #38bdf8;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .auth-status-badge {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 99px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .badge-active-ext { background: #064e3b; color: #34d399; border: 1px solid #059669; }
      .badge-blocked-ext { background: #7f1d1d; color: #f87171; border: 1px solid #dc2626; }
      .badge-expired-ext { background: #78350f; color: #fbbf24; border: 1px solid #d97706; }

      .auth-form-group {
        margin-bottom: 8px;
      }
      .auth-form-group label {
        display: block;
        font-size: 10px;
        color: #94a3b8;
        margin-bottom: 3px;
      }
      .auth-form-group input {
        width: 100%;
        padding: 6px 8px;
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 6px;
        color: #fff;
        font-size: 11px;
        box-sizing: border-box;
      }
      .auth-btn {
        width: 100%;
        padding: 7px;
        background: #0284c7;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      .auth-btn:hover { background: #0369a1; }
      .auth-btn-danger { background: #991b1b; margin-top: 6px; }
      .auth-btn-danger:hover { background: #7f1d1d; }
      .auth-error {
        color: #f87171;
        font-size: 10px;
        margin-top: 6px;
        display: none;
      }
      .user-info-text {
        font-size: 11px;
        color: #cbd5e1;
        margin-bottom: 4px;
      }
    </style>

    <div class="auth-card">
      <div id="authLoginView">
        <div class="auth-header">
          <div class="auth-title">🔒 Account Security Login</div>
        </div>
        <form id="extLoginForm">
          <div class="auth-form-group">
            <label>User ID</label>
            <input type="text" id="extUser" placeholder="Enter your User ID" required>
          </div>
          <div class="auth-form-group">
            <label>Password</label>
            <input type="password" id="extPass" placeholder="Enter Password" required>
          </div>
          <div id="extAuthError" class="auth-error"></div>
          <button type="submit" class="auth-btn">Log In to Extension</button>
        </form>
      </div>

      <div id="authProfileView" style="display: none;">
        <div class="auth-header">
          <div class="auth-title">👤 User License Active</div>
          <span id="extStatusBadge" class="auth-status-badge badge-active-ext">ACTIVE</span>
        </div>
        <div class="user-info-text">User ID: <strong id="extDisplayUser" style="color:#fff;"></strong></div>
        <div class="user-info-text">Expires: <span id="extDisplayExpire" style="color:#38bdf8;"></span></div>
        <button id="extLogoutBtn" class="auth-btn auth-btn-danger">Logout Account</button>
      </div>
    </div>
  `;

  document.body.insertBefore(container, document.body.firstChild);

  checkAuthState();

  document.getElementById('extLoginForm').addEventListener('submit', handleExtLogin);
  document.getElementById('extLogoutBtn').addEventListener('click', handleExtLogout);
}

function checkAuthState() {
  chrome.storage.local.get(['extension_auth_user', 'extension_auth_token', 'extension_auth_status', 'extension_auth_expire'], async (res) => {
    let user = res.extension_auth_user;
    let token = res.extension_auth_token;

    // Check sync storage if local is empty
    if (!user || !token) {
      if (chrome.storage && chrome.storage.sync) {
        const syncRes = await new Promise(r => chrome.storage.sync.get(['extension_auth_user', 'extension_auth_token', 'extension_auth_status', 'extension_auth_expire'], r));
        if (syncRes.extension_auth_user && syncRes.extension_auth_token) {
          user = syncRes.extension_auth_user;
          token = syncRes.extension_auth_token;
          res = syncRes;
          chrome.storage.local.set(syncRes);
        }
      }
    }

    if (user && token) {
      try {
        const verifyRes = await fetch(`${AUTH_SERVER_URL}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user, token: token })
        });
        const data = await verifyRes.json();

        if (data.allowed) {
          showProfile(data.username, data.expireAt, 'active');
        } else {
          showProfile(user, res.extension_auth_expire, data.status || 'blocked');
        }
      } catch (err) {
        showProfile(user, res.extension_auth_expire, res.extension_auth_status || 'active');
      }
    } else {
      showLogin();
    }
  });
}

function showLogin() {
  document.getElementById('authLoginView').style.display = 'block';
  document.getElementById('authProfileView').style.display = 'none';
}

function showProfile(username, expireAt, status) {
  document.getElementById('authLoginView').style.display = 'none';
  document.getElementById('authProfileView').style.display = 'block';
  document.getElementById('extDisplayUser').textContent = username;

  const expDate = expireAt ? new Date(expireAt).toLocaleDateString() : 'N/A';
  document.getElementById('extDisplayExpire').textContent = expDate;

  const badge = document.getElementById('extStatusBadge');
  if (status === 'blocked') {
    badge.className = 'auth-status-badge badge-blocked-ext';
    badge.textContent = 'BLOCKED';
  } else if (status === 'expired') {
    badge.className = 'auth-status-badge badge-expired-ext';
    badge.textContent = 'EXPIRED';
  } else {
    badge.className = 'auth-status-badge badge-active-ext';
    badge.textContent = 'ACTIVE';
  }
}

async function handleExtLogin(e) {
  e.preventDefault();
  const username = document.getElementById('extUser').value;
  const password = document.getElementById('extPass').value;
  const errEl = document.getElementById('extAuthError');

  errEl.style.display = 'none';

  try {
    const res = await fetch(`${AUTH_SERVER_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.allowed) {
      const payload = {
        extension_auth_user: data.username,
        extension_auth_token: data.token,
        extension_auth_status: 'active',
        extension_auth_expire: data.expireAt
      };
      await chrome.storage.local.set(payload);
      if (chrome.storage && chrome.storage.sync) {
        try { await chrome.storage.sync.set(payload); } catch(e){}
      }
      showProfile(data.username, data.expireAt, 'active');
    } else {
      errEl.textContent = data.message || "Invalid credentials!";
      errEl.style.display = 'block';
    }
  } catch (err) {
    errEl.textContent = "Server connection failed!";
    errEl.style.display = 'block';
  }
}

async function handleExtLogout() {
  const keys = ['extension_auth_user', 'extension_auth_token', 'extension_auth_status', 'extension_auth_expire'];
  await chrome.storage.local.remove(keys);
  if (chrome.storage && chrome.storage.sync) {
    try { await chrome.storage.sync.remove(keys); } catch(e){}
  }
  showLogin();
}
