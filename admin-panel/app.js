const API_BASE = '/api/admin';

let usersData = [];
let adminToken = localStorage.getItem('adminToken') || null;

document.addEventListener('DOMContentLoaded', () => {
  if (adminToken) {
    showDashboard();
  } else {
    showLoginModal();
  }

  // Event Listeners
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('btnLogout').addEventListener('click', handleLogout);
  document.getElementById('btnRefresh').addEventListener('click', loadUsers);
  document.getElementById('btnRefreshSessions').addEventListener('click', loadSessions);
  document.getElementById('searchInput').addEventListener('input', renderUsers);

  // Modal Handlers
  document.getElementById('btnOpenCreateModal').addEventListener('click', () => {
    document.getElementById('createUserModal').style.display = 'flex';
  });
  document.getElementById('btnCloseCreateModal').addEventListener('click', () => {
    document.getElementById('createUserModal').style.display = 'none';
  });
  document.getElementById('btnCancelCreate').addEventListener('click', () => {
    document.getElementById('createUserModal').style.display = 'none';
  });
  document.getElementById('createUserForm').addEventListener('submit', handleCreateUser);

  document.getElementById('btnChangePass').addEventListener('click', () => {
    document.getElementById('changePassModal').style.display = 'flex';
  });
  document.getElementById('btnClosePassModal').addEventListener('click', () => {
    document.getElementById('changePassModal').style.display = 'none';
  });
  document.getElementById('btnCancelPass').addEventListener('click', () => {
    document.getElementById('changePassModal').style.display = 'none';
  });
  document.getElementById('changePassForm').addEventListener('submit', handleChangePassword);
});

function showLoginModal() {
  document.getElementById('loginModal').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showDashboard() {
  document.getElementById('loginModal').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadUsers();
  loadSessions();
  // Auto-refresh sessions every 30 seconds
  setInterval(loadSessions, 30000);
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('adminUser').value;
  const password = document.getElementById('adminPass').value;
  const errorEl = document.getElementById('loginError');

  errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      adminToken = data.token;
      localStorage.setItem('adminToken', adminToken);
      showDashboard();
    } else {
      errorEl.textContent = data.message || 'Login failed!';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'Server connection error! Make sure backend is running.';
    errorEl.style.display = 'block';
  }
}

function handleLogout() {
  adminToken = null;
  localStorage.removeItem('adminToken');
  showLoginModal();
}

async function loadUsers() {
  try {
    const res = await fetch(`${API_BASE}/users`);
    const data = await res.json();

    if (data.success) {
      usersData = data.users;
      updateStats();
      renderUsers();
    }
  } catch (err) {
    console.error('Failed to load users', err);
  }
}

function updateStats() {
  const total = usersData.length;
  let active = 0;
  let blocked = 0;
  let expired = 0;

  usersData.forEach(u => {
    if (u.computedStatus === 'blocked') blocked++;
    else if (u.computedStatus === 'expired') expired++;
    else active++;
  });

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statActive').textContent = active;
  document.getElementById('statBlocked').textContent = blocked;
  document.getElementById('statExpired').textContent = expired;
}

function renderUsers() {
  const tbody = document.getElementById('usersTableBody');
  const query = document.getElementById('searchInput').value.toLowerCase();

  const filtered = usersData.filter(u => 
    u.username.toLowerCase().includes(query) || 
    (u.note && u.note.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
          No extension users found. Click "Create New Buyer User" to add one!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const isBlocked = u.status === 'blocked';
    const isExpired = u.isExpired;
    
    let badgeHtml = '';
    if (isBlocked) {
      badgeHtml = `<span class="badge badge-blocked"><i class="fa-solid fa-ban"></i> Blocked</span>`;
    } else if (isExpired) {
      badgeHtml = `<span class="badge badge-expired"><i class="fa-solid fa-clock"></i> Expired</span>`;
    } else {
      badgeHtml = `<span class="badge badge-active"><i class="fa-solid fa-check"></i> Active</span>`;
    }

    // Device Lock Badge
    let deviceBadge = '';
    if (u.boundDeviceId) {
      deviceBadge = `<span style="color: var(--accent-cyan); font-weight: 600;" title="Device ID: ${u.boundDeviceId}"><i class="fa-solid fa-laptop-code"></i> Locked (1-PC)</span>`;
    } else {
      deviceBadge = `<span style="color: var(--text-muted); font-size: 11px;"><i class="fa-solid fa-unlock"></i> Unbound (First Login Pending)</span>`;
    }

    const expireDateFormatted = new Date(u.expireAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const lastActiveFormatted = u.lastLogin 
      ? new Date(u.lastLogin).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '<span style="color: var(--text-muted);">Never</span>';

    return `
      <tr>
        <td><strong>${escapeHtml(u.username)}</strong></td>
        <td><code>${escapeHtml(u.password)}</code></td>
        <td>${badgeHtml}</td>
        <td>${deviceBadge}</td>
        <td>${expireDateFormatted}</td>
        <td>${lastActiveFormatted}</td>
        <td><span style="color: var(--text-secondary);">${escapeHtml(u.note || '-')}</span></td>
        <td class="text-right">
          <div style="display: inline-flex; align-items: center; gap: 8px;">
            <!-- Block Switch Toggle -->
            <label class="switch" title="${isBlocked ? 'Click to Unblock' : 'Click to Block'}">
              <input type="checkbox" ${!isBlocked ? 'checked' : ''} onchange="toggleBlockUser('${u.id}')">
              <span class="slider"></span>
            </label>

            <!-- Reset PC Lock Button -->
            <button class="btn btn-secondary btn-sm" onclick="resetDeviceLock('${u.id}')" title="Reset PC Lock (Allow User to Log In on New Computer)">
              <i class="fa-solid fa-arrows-rotate"></i> Reset PC
            </button>

            <!-- Extend 30 Days Button -->
            <button class="btn btn-secondary btn-sm" onclick="extendUserValidity('${u.id}', 30)" title="Extend 30 Days">
              <i class="fa-solid fa-calendar-plus"></i> +30D
            </button>

            <!-- Delete Button -->
            <button class="btn btn-icon btn-sm" onclick="deleteUser('${u.id}', '${escapeHtml(u.username)}')" title="Delete User">
              <i class="fa-solid fa-trash" style="color: var(--accent-red);"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleCreateUser(e) {
  e.preventDefault();
  const username = document.getElementById('newUsername').value;
  const password = document.getElementById('newPassword').value;
  const validityDays = document.getElementById('newValidityDays').value;
  const note = document.getElementById('newNote').value;
  const errorEl = document.getElementById('createError');

  errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, validityDays, note })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('createUserForm').reset();
      document.getElementById('createUserModal').style.display = 'none';
      loadUsers();
    } else {
      errorEl.textContent = data.message || 'Failed to create user!';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'Server error during creation!';
    errorEl.style.display = 'block';
  }
}

async function toggleBlockUser(userId) {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/toggle-block`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      loadUsers();
    }
  } catch (err) {
    alert('Failed to toggle block status!');
  }
}

// Reset Device Lock
async function resetDeviceLock(userId) {
  if (!confirm('Reset PC Lock for this user? They will be able to log in on a new computer.')) return;

  try {
    const res = await fetch(`${API_BASE}/users/${userId}/reset-device`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadUsers();
    }
  } catch (err) {
    alert('Failed to reset device lock!');
  }
}

async function extendUserValidity(userId, days) {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days })
    });
    const data = await res.json();
    if (data.success) {
      loadUsers();
    }
  } catch (err) {
    alert('Failed to extend validity!');
  }
}

async function deleteUser(userId, username) {
  if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;

  try {
    const res = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      loadUsers();
    }
  } catch (err) {
    alert('Failed to delete user!');
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const oldPassword = document.getElementById('oldAdminPass').value;
  const newPassword = document.getElementById('newAdminPass').value;
  const errorEl = document.getElementById('passError');

  errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = await res.json();

    if (data.success) {
      alert('Admin password updated successfully!');
      document.getElementById('changePassForm').reset();
      document.getElementById('changePassModal').style.display = 'none';
    } else {
      errorEl.textContent = data.message || 'Failed to update password!';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'Server error during password update!';
    errorEl.style.display = 'block';
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Live Sessions ──
async function loadSessions() {
  try {
    const res = await fetch('/api/admin/sessions');
    const data = await res.json();
    if (data.success) renderSessions(data.sessions);
  } catch (e) {
    console.error('Failed to load sessions', e);
  }
}

function renderSessions(sessions) {
  const tbody = document.getElementById('sessionsTableBody');
  const badge = document.getElementById('onlineBadge');
  const statOnline = document.getElementById('statOnline');

  if (!sessions || sessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;padding:20px;">No active sessions yet...</td></tr>';
    badge.textContent = '0 Online';
    statOnline.textContent = '0';
    return;
  }

  // Sort: online first
  sessions.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));

  const onlineCount = sessions.filter(s => s.online).length;
  badge.textContent = onlineCount + ' Online';
  statOnline.textContent = onlineCount;

  tbody.innerHTML = sessions.map(s => {
    const lastPing = new Date(s.lastPing);
    const timeAgo = getTimeAgo(lastPing);
    const deviceShort = s.deviceId ? s.deviceId.substring(0, 12) + '...' : 'Unknown';
    const statusBadge = s.online
      ? '<span style="background:#10b981;color:#fff;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:600;">🟢 Online</span>'
      : '<span style="background:#6b7280;color:#fff;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:600;">⚫ Offline</span>';
    return `<tr>
      <td><strong>${escapeHtml(s.username)}</strong></td>
      <td><code style="font-size:11px;background:#f3f4f6;padding:2px 6px;border-radius:4px;">${escapeHtml(deviceShort)}</code></td>
      <td>${escapeHtml(s.ip || '—')}</td>
      <td>${timeAgo}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');
}

function getTimeAgo(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}
