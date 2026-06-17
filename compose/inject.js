/**
 * inject.js  —  Compose Script
 *
 * 執行環境：about:blank?compose 的 content script 隔離世界。
 * 策略：用 eval 把 TinyMCE 程式碼跑在自己的環境（不依賴頁面 script 注入）。
 */

'use strict';

(async function () {

  const TINYMCE_BASE = browser.runtime.getURL('tinymce/js/tinymce');
  const SYNC_DEBOUNCE_MS = 600;

  // 防重入：只用 window flag，不用 DOM 檢查（DOM 可能有舊草稿殘留的 #kc-toolbar）
  if (window.__kcInjectStarted) {
    console.log('[TinyMCE Composer] 重複，略過');
    return;
  }
  window.__kcInjectStarted = true;

  // 立刻深度清除舊草稿可能殘留的 TinyMCE UI 元素
  const cleanStaleUI = () => {
    if (!document.body) return;
    // 1. 移除所有 tox 系 class 元素（不論深度）
    document.body.querySelectorAll(
      '#kc-toolbar, [data-kc-ui], ' +
      '[class*="tox-"], [class^="tox-"], .tox'
    ).forEach(el => el.remove());

    // 2. 把舊的 #kc-content unwrap（保留其內容，移除外層 div）
    document.body.querySelectorAll('#kc-content').forEach(el => {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      el.remove();
    });
  };
  cleanStaleUI();

  // 載入中橫幅
  const loading = document.createElement('div');
  loading.id = '_kc_loading';
  loading.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
    'background:#1565C0;color:#fff;padding:4px 8px;font:12px sans-serif;';
  loading.contentEditable = 'false';
  loading.textContent = '[TinyMCE] 載入中...';
  (document.body || document.documentElement).appendChild(loading);

  console.log('[TinyMCE Composer] inject.js 開始, href=', location.href);

  await new Promise(r => setTimeout(r, 100));

  // ── 建立 DOM 骨架 ─────────────────────────────────────────────────────────
  // toolbar 直接放在 body 內，並標上 data-kc-ui 標記，
  // 儲存草稿時由 onAfterSave 清理。
  const toolbarEl = document.createElement('div');
  toolbarEl.id = 'kc-toolbar';
  toolbarEl.setAttribute('data-kc-ui', '1');
  toolbarEl.contentEditable = 'false';
  toolbarEl.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:2147483646;' +
    'min-height:44px;background:#f9f9f9;border-bottom:1px solid #e0e0e0;';

  const contentEl = document.createElement('div');
  contentEl.id = 'kc-content';

  // 過濾掉舊草稿可能殘留的 TinyMCE UI 元素（防止重新載入時 toolbar HTML 被當內容）
  const isUiNode = (n) => {
    if (n.nodeType !== 1) return false;
    if (n.id === '_kc_loading' || n.id === 'kc-toolbar') return true;
    if (n.hasAttribute && n.hasAttribute('data-kc-ui')) return true;
    if (n.classList && (
      n.classList.contains('tox') ||
      n.classList.contains('tox-tinymce') ||
      n.classList.contains('tox-tinymce-inline') ||
      n.classList.contains('tox-tinymce-aux') ||
      n.classList.contains('tox-silver-sink')
    )) return true;
    return false;
  };
  const kids = Array.from(document.body.childNodes).filter(n => !isUiNode(n));
  // 移除原本 body 內所有殘留 UI 元素
  Array.from(document.body.childNodes).filter(isUiNode).forEach(n => n.remove());
  kids.forEach(n => contentEl.appendChild(n));

  document.body.appendChild(toolbarEl);
  document.body.appendChild(contentEl);

  Object.assign(document.body.style, {
    margin: '0', padding: '44px 0 0 0', height: '100%',
    overflow: 'auto', boxSizing: 'border-box'
  });

  // ── 強制 standards mode（about:blank 預設為 quirks）──────────────────────
  if (document.compatMode !== 'CSS1Compat') {
    try {
      Object.defineProperty(document, 'compatMode', {
        configurable: true,
        get: () => 'CSS1Compat'
      });
      console.log('[TinyMCE Composer] 已覆寫 compatMode');
    } catch (e) {
      console.warn('[TinyMCE Composer] 覆寫 compatMode 失敗:', e.message);
    }
  }

  // ── 取得 TinyMCE 程式碼並 eval ────────────────────────────────────────────
  let tmce;
  try {
    console.log('[TinyMCE Composer] 抓取 tinymce.min.js...');
    const resp = await fetch(TINYMCE_BASE + '/tinymce.min.js');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const code = await resp.text();
    console.log('[TinyMCE Composer] 程式碼長度:', code.length);

    // indirect eval — 跑在我們的 global scope
    (0, eval)(code);
    console.log('[TinyMCE Composer] eval 後 tinymce:', typeof tinymce);

    tmce = (typeof tinymce !== 'undefined') ? tinymce : window.tinymce;
    if (!tmce) throw new Error('tinymce 未定義');

    // ── 攔截 ScriptLoader，改用 fetch + eval 載入 plugins / themes / icons / models / langs
    const origLoadScript = tmce.ScriptLoader && tmce.ScriptLoader.loadScript;
    if (tmce.ScriptLoader && origLoadScript) {
      tmce.ScriptLoader.loadScript = function (url) {
        console.log('[TinyMCE Loader] fetch:', url);
        return fetch(url)
          .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
            return r.text();
          })
          .then(code => {
            (0, eval)(code);
          });
      };
      console.log('[TinyMCE Composer] ScriptLoader 已 patch');
    } else {
      console.warn('[TinyMCE Composer] 找不到 ScriptLoader.loadScript，plugin 可能載入失敗');
    }
  } catch (e) {
    console.error('[TinyMCE Composer] 載入 TinyMCE 失敗:', e);
    loading.textContent = '[TinyMCE] 載入失敗：' + e.message;
    loading.style.background = '#c62828';
    return;
  }

  // ── 格式複製外掛 ──────────────────────────────────────────────────────────
  (function registerFormatPainter() {
    let saved = null, painting = false;
    tmce.PluginManager.add('kc_fp', (ed) => {
      function cap() {
        const n = ed.selection.getNode(), cs = ed.getWin().getComputedStyle(n);
        return {
          bold: ed.formatter.match('bold'), italic: ed.formatter.match('italic'),
          underline: ed.formatter.match('underline'), strike: ed.formatter.match('strikethrough'),
          fg: n.style.color || cs.color, bg: n.style.backgroundColor || cs.backgroundColor,
          fs: n.style.fontSize || cs.fontSize, ff: n.style.fontFamily || cs.fontFamily,
        };
      }
      function applyF(f) {
        const t = (n, v) => v ? ed.formatter.apply(n) : ed.formatter.remove(n);
        t('bold', f.bold); t('italic', f.italic);
        t('underline', f.underline); t('strikethrough', f.strike);
        const ok = v => v && !v.includes('rgba(0, 0, 0, 0)') && v !== 'transparent';
        if (ok(f.fg)) ed.formatter.apply('forecolor',   { value: f.fg });
        if (ok(f.bg)) ed.formatter.apply('hilitecolor', { value: f.bg });
        if (f.fs) ed.formatter.apply('fontsize', { value: f.fs });
        if (f.ff) ed.formatter.apply('fontname',  { value: f.ff });
      }
      ed.ui.registry.addToggleButton('kc_fp', {
        text: '複製格式',
        tooltip: '點擊複製格式，再選取目標文字套用',
        onSetup: api => {
          const upd = () => api.setActive(painting);
          ed.on('SelectionChange NodeChange', upd);
          return () => ed.off('SelectionChange NodeChange', upd);
        },
        onAction: () => {
          if (!painting) {
            saved = cap(); painting = true;
            ed.getContainer().style.cursor = 'crosshair';
          } else {
            if (saved && !ed.selection.isCollapsed()) applyF(saved);
            saved = null; painting = false;
            ed.getContainer().style.cursor = '';
          }
        }
      });
      ed.on('mouseup', () => {
        if (painting && saved && !ed.selection.isCollapsed()) {
          setTimeout(() => {
            applyF(saved); saved = null; painting = false;
            ed.getContainer().style.cursor = '';
          }, 20);
        }
      });
    });
  })();

  // ── 連線 background ──────────────────────────────────────────────────────
  const port = browser.runtime.connect({ name: 'compose-editor' });

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  // ── 語系設定 ──────────────────────────────────────────────────────────────
  // 支援的語系（label, code, langFile）。code 是 TinyMCE 認得的代號。
  const LANGUAGES = [
    { code: 'zh_TW', label: '繁體中文' },
    { code: 'zh_CN', label: '簡體中文' },
    { code: 'en',    label: 'English' },
    { code: 'ja',    label: '日本語' },
    { code: 'ko_KR', label: '한국어' },
    { code: 'de',    label: 'Deutsch' },
    { code: 'fr_FR', label: 'Français' },
    { code: 'es',    label: 'Español' },
  ];

  let currentLang = 'zh_TW';
  try {
    const stored = await browser.storage.local.get('tinymce_lang');
    if (stored.tinymce_lang) currentLang = stored.tinymce_lang;
  } catch (_) {}

  // 自訂語系切換外掛
  tmce.PluginManager.add('kc_lang', (ed) => {
    ed.ui.registry.addMenuButton('kc_lang', {
      text: '語系',
      tooltip: '切換編輯器介面語言',
      fetch: (cb) => {
        const items = LANGUAGES.map((l) => ({
          type: 'menuitem',
          text: l.label + (l.code === currentLang ? ' ✓' : ''),
          onAction: async () => {
            try {
              await browser.storage.local.set({ tinymce_lang: l.code });
              ed.notificationManager.open({
                text: '已切換到「' + l.label + '」，下次開啟撰寫視窗生效。',
                type: 'success',
                timeout: 3000
              });
            } catch (e) {
              console.error('[TinyMCE Composer] 儲存語系設定失敗:', e);
            }
          }
        }));
        cb(items);
      }
    });
  });

  // 確認語系檔存在；不存在則退回英文
  const langFileUrl = TINYMCE_BASE + '/langs/' + currentLang + '.js';
  let langOk = false;
  try {
    const r = await fetch(langFileUrl, { method: 'HEAD' });
    langOk = r.ok;
  } catch (_) {}
  if (!langOk && currentLang !== 'en') {
    console.warn('[TinyMCE Composer] 找不到語系檔', currentLang, '，使用英文');
    currentLang = 'en';
  }

  // ── 初始化 TinyMCE ────────────────────────────────────────────────────────
  console.log('[TinyMCE Composer] 啟動 tinymce.init, 語系=', currentLang);
  tmce.init({
    selector: '#kc-content',
    inline: true,
    toolbar_persist: true,
    fixed_toolbar_container: '#kc-toolbar',

    plugins: [
      'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
      'anchor', 'searchreplace', 'visualblocks', 'code',
      'insertdatetime', 'media', 'table', 'wordcount', 'kc_fp', 'kc_lang'
    ],
    toolbar:
      'undo redo | kc_fp | ' +
      'bold italic underline strikethrough | ' +
      'forecolor backcolor | ' +
      'alignleft aligncenter alignright | ' +
      'bullist numlist outdent indent | ' +
      'table | image link | removeformat | code | kc_lang',
    menubar: 'edit view insert format tools table',
    toolbar_mode: 'wrap',

    base_url: TINYMCE_BASE,
    suffix: '.min',
    license_key: 'gpl',
    promotion: false,
    branding: false,
    language: currentLang === 'en' ? undefined : currentLang,
    language_url: currentLang === 'en' ? undefined :
                  TINYMCE_BASE + '/langs/' + currentLang + '.js',

    images_upload_handler: (blobInfo) => new Promise((res) => {
      const r = new FileReader();
      r.onload = ev => res(ev.target.result);
      r.readAsDataURL(blobInfo.blob());
    }),
    image_advtab: true,

    content_style:
      '#kc-content { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",' +
      '"Microsoft JhengHei", "PingFang TC", sans-serif; font-size: 14px;' +
      'line-height: 1.6; padding: 8px 12px; color: #1a1a1a; }' +
      'table { border-collapse: collapse; }' +
      'td, th { border: 1px solid #ccc; padding: 4px 8px; }',

    setup(ed) {
      ed.on('init', () => {
        console.log('[TinyMCE Composer] tinymce init 完成！');
        const b = document.getElementById('_kc_loading');
        if (b) b.remove();


        // 標記 TinyMCE UI 元素為非編輯區
        const markUI = (el) => {
          if (el && el.nodeType === 1 &&
              (el.classList?.contains('tox-tinymce-aux') ||
               el.classList?.contains('tox-silver-sink'))) {
            el.setAttribute('data-kc-ui', '1');
            el.contentEditable = 'false';
          }
        };
        document.querySelectorAll('.tox-tinymce-aux, .tox-silver-sink').forEach(markUI);
        new MutationObserver((muts) => {
          for (const m of muts) m.addedNodes.forEach((n) => markUI(n));
        }).observe(document.body, { childList: true });

        const sync = debounce(() => {
          port.postMessage({ action: 'syncContent', html: ed.getContent() });
        }, SYNC_DEBOUNCE_MS);
        ed.on('input change keyup paste', sync);

        port.onMessage.addListener(msg => {
          if (msg.action === 'requestContent') {
            port.postMessage({ action: 'content', html: ed.getContent() });
          }
        });
      });
      ed.on('LoadError', err => {
        console.error('[TinyMCE Composer] LoadError:', err);
      });
    }
  });

})().catch(err => {
  console.error('[TinyMCE Composer] 主流程錯誤:', err);
});
