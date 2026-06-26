'use strict';

const LANGUAGES = [
  { code: 'zh_TW', label: '繁體中文 (Traditional Chinese)' },
  { code: 'zh_CN', label: '简体中文 (Simplified Chinese)' },
  { code: 'en',    label: 'English' },
  { code: 'ja',    label: '日本語 (Japanese)' },
  { code: 'ko_KR', label: '한국어 (Korean)' },
  { code: 'de',    label: 'Deutsch (German)' },
  { code: 'fr_FR', label: 'Français (French)' },
  { code: 'es',    label: 'Español (Spanish)' },
];

const TINYMCE_LANGS = browser.runtime.getURL('tinymce/js/tinymce/langs');

const select   = document.getElementById('lang-select');
const status   = document.getElementById('lang-status');
const verSpan  = document.getElementById('version');

// 顯示版本
try {
  verSpan.textContent = browser.runtime.getManifest().version;
} catch (_) {
  verSpan.textContent = '?';
}

// 檢查語系檔是否存在，標示哪些可用
async function hasLangFile(code) {
  if (code === 'en') return true;
  try {
    const r = await fetch(`${TINYMCE_LANGS}/${code}.js`, { method: 'HEAD' });
    return r.ok;
  } catch (_) {
    return false;
  }
}

async function buildOptions() {
  select.innerHTML = '';
  for (const lang of LANGUAGES) {
    const ok = await hasLangFile(lang.code);
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = ok ? lang.label : `${lang.label}（未安裝語系檔）`;
    opt.disabled = !ok;
    select.appendChild(opt);
  }
}

async function loadCurrent() {
  try {
    const { tinymce_lang } = await browser.storage.local.get('tinymce_lang');
    select.value = tinymce_lang || 'zh_TW';
  } catch (_) {
    select.value = 'zh_TW';
  }
}

function showStatus(msg) {
  status.textContent = msg;
  status.classList.add('visible');
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => status.classList.remove('visible'), 2500);
}

select.addEventListener('change', async () => {
  try {
    await browser.storage.local.set({ tinymce_lang: select.value });
    showStatus('✓ 已儲存，下次開啟撰寫視窗時生效');
  } catch (e) {
    showStatus('✗ 儲存失敗：' + e.message);
  }
});

(async function init() {
  await buildOptions();
  await loadCurrent();
})();
