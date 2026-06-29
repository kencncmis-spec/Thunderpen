/**
 * background.js
 * 管理 compose scripts 的注入、與各撰寫視窗的連線、以及儲存/送出前的內容同步。
 */

'use strict';

// tabId -> Port 對應表
const composePorts = new Map();
// tabId -> 最新 HTML 內容（連續同步用）
const latestContent = new Map();

// ── 註冊 Compose Scripts ────────────────────────────────────────────────────

let _composeRegistration = null;

(async function () {
  try {
    // 先 unregister 舊的（防止重複註冊堆疊）
    if (_composeRegistration && _composeRegistration.unregister) {
      try { await _composeRegistration.unregister(); } catch (_) {}
    }
    _composeRegistration = await messenger.composeScripts.register({
      js:  [{ file: 'compose/inject.js'  }],
      css: [{ file: 'compose/inject.css' }]
    });
  } catch (e) {
    console.error('[TinyMCE BG] composeScripts 註冊失敗:', e);
  }
})();

// ── Port 連線管理 ────────────────────────────────────────────────────────────

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== 'compose-editor') return;

  const tab = port.sender?.tab;
  if (!tab) return;

  const tabId = tab.id;
  composePorts.set(tabId, port);

  port.onDisconnect.addListener(() => {
    composePorts.delete(tabId);
    latestContent.delete(tabId);
  });

  port.onMessage.addListener(async (msg) => {
    switch (msg.action) {
      // Compose script 要求取得初始內文
      case 'getComposeDetails': {
        try {
          const details = await messenger.compose.getComposeDetails(tabId);
          port.postMessage({ action: 'composeDetails', details });
        } catch (e) {
          console.error('[TinyMCE] getComposeDetails failed:', e);
          port.postMessage({ action: 'composeDetails', details: { body: '', isPlainText: false } });
        }
        break;
      }

      // Compose script 定期推送最新 HTML — 只快取，不立刻 setComposeDetails
      // （setComposeDetails 會觸發 Thunderbird 重繪 body，導致 TinyMCE DOM 被清掉）
      case 'syncContent': {
        latestContent.set(tabId, msg.html);
        break;
      }

      // Save Draft 等 Thunderbird 內部路徑可能直接讀 body.innerHTML，
      // 這時 compose script 主動推送並要求即時 setComposeDetails
      case 'flushContent': {
        latestContent.set(tabId, msg.html);
        try {
          await messenger.compose.setComposeDetails(tabId, { body: msg.html });
        } catch (_) {}
        break;
      }

      // Compose script 回應 requestContent（送出前最後確認）
      case 'content': {
        const resolver = pendingResolvers.get(tabId);
        if (resolver) {
          pendingResolvers.delete(tabId);
          resolver(msg.html);
        }
        break;
      }
    }
  });
});

// ── 送出前同步 ───────────────────────────────────────────────────────────────

/** tabId -> resolve function，用於等待 compose script 回傳內容 */
const pendingResolvers = new Map();

messenger.compose.onBeforeSend.addListener(async (tab) => {
  const port = composePorts.get(tab.id);
  if (!port) return {};

  const cached = latestContent.get(tab.id);

  // 1. 通知 compose script 從 DOM 移除 toolbar（避免 Thunderbird 序列化時帶入）
  try { port.postMessage({ action: 'prepareForSend' }); } catch (_) {}

  // 2. 要求 compose script 回傳乾淨的最新內容
  const html = await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingResolvers.delete(tab.id);
      resolve(cached ?? '');
    }, 3000);

    pendingResolvers.set(tab.id, (content) => {
      clearTimeout(timeout);
      resolve(content);
    });

    try {
      port.postMessage({ action: 'requestContent' });
    } catch (_) {
      clearTimeout(timeout);
      pendingResolvers.delete(tab.id);
      resolve(cached ?? '');
    }
  });

  // 3. 明確呼叫 setComposeDetails 寫回（return details 不一定每個版本都吃）
  try {
    await messenger.compose.setComposeDetails(tab.id, { body: html });
  } catch (e) {
    console.error('[TinyMCE BG] setComposeDetails on send failed:', e);
  }

  // 4. 同時走 return details 路徑（雙保險）
  return { details: { body: html } };
});
