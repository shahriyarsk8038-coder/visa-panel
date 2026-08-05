// ============================================================================
// IVAC Extension License Guard & Authentication Module (With Auto-Restore Shield)
// ============================================================================

// Server URL (192.168.0.100 for local Wi-Fi testing, or https://your-domain.com when online)
const AUTH_SERVER_URL = "http://192.168.0.100:5000/api/client";

// Intercept chrome.storage.local.clear so LurkBD reset command never wipes auth tokens
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  const _origLocalClear = chrome.storage.local.clear;
  if (_origLocalClear) {
    chrome.storage.local.clear = function (callback) {
      chrome.storage.local.get([
        'extension_auth_user',
        'extension_auth_token',
        'extension_auth_status',
        'extension_auth_expire'
      ], (authData) => {
        _origLocalClear.call(chrome.storage.local, () => {
          // Restore auth data immediately after clear
          if (authData.extension_auth_user && authData.extension_auth_token) {
            chrome.storage.local.set(authData, () => {
              if (callback) callback();
            });
          } else {
            if (callback) callback();
          }
        });
      });
    };
  }
}

// Helper to save credentials with sync backup
async function saveAuthCredentials(data) {
  const payload = {
    extension_auth_user: data.username,
    extension_auth_token: data.token,
    extension_auth_status: data.status || 'active',
    extension_auth_expire: data.expireAt
  };

  // Save to local storage
  await new Promise(r => chrome.storage.local.set(payload, r));

  // Save to sync storage backup if available
  if (chrome.storage.sync) {
    try {
      await new Promise(r => chrome.storage.sync.set(payload, r));
    } catch (e) {}
  }
}

// Get current logged in user status (with auto-restore from sync)
async function getAuthStatus() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'extension_auth_user',
      'extension_auth_token',
      'extension_auth_status',
      'extension_auth_expire'
    ], async (result) => {
      
      let user = result.extension_auth_user;
      let token = result.extension_auth_token;

      // Auto-restore from sync storage if missing in local
      if (!user || !token) {
        if (chrome.storage.sync) {
          const syncRes = await new Promise(r => chrome.storage.sync.get([
            'extension_auth_user',
            'extension_auth_token',
            'extension_auth_status',
            'extension_auth_expire'
          ], r));

          if (syncRes.extension_auth_user && syncRes.extension_auth_token) {
            user = syncRes.extension_auth_user;
            token = syncRes.extension_auth_token;
            // Restore to local
            await new Promise(r => chrome.storage.local.set(syncRes, r));
          }
        }
      }

      if (!user || !token) {
        return resolve({ allowed: false, reason: "NOT_LOGGED_IN", message: "Please log in to use the extension." });
      }

      // Verify with server
      try {
        const response = await fetch(`${AUTH_SERVER_URL}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user, token: token })
        });

        const data = await response.json();

        if (data.allowed) {
          chrome.storage.local.set({
            extension_auth_status: 'active',
            extension_auth_expire: data.expireAt
          });
          resolve({ allowed: true, username: user, expireAt: data.expireAt });
        } else {
          chrome.storage.local.set({
            extension_auth_status: data.status || 'blocked'
          });
          resolve({ allowed: false, reason: data.status || 'blocked', message: data.message || "Access Denied by Admin" });
        }
      } catch (err) {
        resolve({ allowed: true, username: user, expireAt: result.extension_auth_expire, offline: true });
      }
    });
  });
}

// User Login function
async function loginExtensionUser(username, password) {
  try {
    const response = await fetch(`${AUTH_SERVER_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.allowed) {
      await saveAuthCredentials(data);
      return { success: true, message: data.message, user: data };
    } else {
      return { success: false, message: data.message || "Invalid credentials" };
    }
  } catch (err) {
    return { success: false, message: "Server connection failed! Make sure Admin Server is online." };
  }
}

// User Logout function
async function logoutExtensionUser() {
  const keys = [
    'extension_auth_user',
    'extension_auth_token',
    'extension_auth_status',
    'extension_auth_expire'
  ];
  await new Promise(r => chrome.storage.local.remove(keys, r));
  if (chrome.storage.sync) {
    try {
      await new Promise(r => chrome.storage.sync.remove(keys, r));
    } catch (e) {}
  }
}
