// ============================================================================
// Content Script Guard - Protects IVAC Website & Shields Auth Tokens from Wipes
// ============================================================================

(function () {
  const AUTH_SERVER_URL = "http://192.168.0.100:5000/api/client";

  // Intercept clear calls on extension storage
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

  async function checkLicenseBeforeRunning() {
    chrome.storage.local.get([
      'extension_auth_user',
      'extension_auth_token',
      'extension_auth_status'
    ], async (result) => {
      let username = result.extension_auth_user;
      let token = result.extension_auth_token;

      // Auto-restore from sync storage if local was wiped
      if (!username || !token) {
        if (chrome.storage && chrome.storage.sync) {
          const syncRes = await new Promise(r => chrome.storage.sync.get([
            'extension_auth_user',
            'extension_auth_token',
            'extension_auth_status',
            'extension_auth_expire'
          ], r));

          if (syncRes.extension_auth_user && syncRes.extension_auth_token) {
            username = syncRes.extension_auth_user;
            token = syncRes.extension_auth_token;
            // Restore to local
            chrome.storage.local.set(syncRes);
          }
        }
      }

      if (!username || !token) {
        blockWebpageExecution("⚠️ EXTENSION NOT LOGGED IN", "Please open the extension popup and log in with your User ID & Password.");
        return;
      }

      // Verify with backend server
      try {
        const response = await fetch(`${AUTH_SERVER_URL}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, token })
        });
        const data = await response.json();

        if (!data.allowed) {
          blockWebpageExecution("🚫 ACCESS BLOCKED BY ADMIN", data.message || "Your extension license has been suspended or expired.");
        }
      } catch (e) {
        if (result.extension_auth_status === 'blocked') {
          blockWebpageExecution("🚫 ACCOUNT BLOCKED", "Your extension access has been blocked by Admin.");
        }
      }
    });
  }

  function blockWebpageExecution(title, message) {
    console.warn(`[IVAC Guard] ${title}: ${message}`);
    window.IVAC_EXTENSION_BLOCKED = true;

    window.addEventListener('DOMContentLoaded', () => {
      // Remove any duplicate banner
      const existing = document.getElementById('ivac-license-block-banner');
      if (existing) existing.remove();

      const banner = document.createElement('div');
      banner.id = 'ivac-license-block-banner';
      banner.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        background: rgba(11, 15, 25, 0.96) !important;
        color: #ffffff !important;
        z-index: 999999999 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        font-family: Arial, sans-serif !important;
        text-align: center !important;
        padding: 30px !important;
      `;

      banner.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.15); border: 2px solid #ef4444; padding: 40px; border-radius: 16px; max-width: 500px;">
          <div style="font-size: 50px; margin-bottom: 15px;">🔒</div>
          <h1 style="color: #ef4444; font-size: 24px; margin-bottom: 10px; font-weight: bold;">${title}</h1>
          <p style="color: #d1d5db; font-size: 15px; margin-bottom: 20px; line-height: 1.5;">${message}</p>
          <div style="font-size: 13px; color: #9ca3af; background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px;">
            Please contact the extension seller/admin to activate or renew your subscription.
          </div>
        </div>
      `;

      document.body.appendChild(banner);
    });
  }

  checkLicenseBeforeRunning();
})();
