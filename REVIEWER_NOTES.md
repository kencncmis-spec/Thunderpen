# Notes for Reviewers — Thunderpen 雷霆筆

## 中文摘要（給審核員快速理解）

本外掛將 [TinyMCE 7](https://www.tiny.cloud/) 富文本編輯器整合至 Thunderbird
撰寫視窗，取代預設的內建編輯器。TinyMCE 為 MIT 授權（GPL-2.0+ 相容）的
開源編輯器，廣泛應用於 WordPress、Atlassian 等大型專案。

## Known Linter Warnings

### 1. `compose` permission 警告（誤報）
The validator may flag the `"compose"` permission as unknown.
This is a **Thunderbird-specific** WebExtension permission, documented at:
https://webextension-api.thunderbird.net/en/latest/compose.html

It is required for `messenger.compose.getComposeDetails()` /
`setComposeDetails()` / `onBeforeSend` — the core APIs of this add-on.

### 2. `innerHTML` / `Function` constructor warnings in `tinymce/`
所有此類警告均位於第三方函式庫 **TinyMCE 7**（未經修改的原版）：
- `tinymce/js/tinymce/tinymce.min.js`
- `tinymce/js/tinymce/themes/silver/theme.min.js`
- `tinymce/js/tinymce/models/dom/model.min.js`
- `tinymce/js/tinymce/plugins/*/plugin.min.js`

TinyMCE 內部對 `innerHTML` 與 `Function constructor` 的使用，皆為
**自身產生的靜態模板字串**，並未拼接外部輸入，無 XSS 風險。

來源驗證：所有檔案皆直接取自 TinyMCE 官方 self-hosted 發行包，
SHA 校驗可於下載頁取得：
https://www.tiny.cloud/get-tiny/self-hosted/

### 3. `compose/inject.js` 中 indirect `eval` 的使用

我方程式碼有 **兩處** `(0, eval)(code)` 呼叫（行 118、行 135），原因：

本外掛的 content script 注入於 `about:blank?compose` 頁面，該頁面 CSP
**禁止以 `<script src="moz-extension://...">` 載入擴充套件內檔案**。
經實測，這是讓 TinyMCE 能順利掛載於 Thunderbird 撰寫視窗的唯一方式。

被 eval 的內容**僅限於擴充套件本地的 `tinymce/` 檔案**（透過
`fetch(browser.runtime.getURL(...))` 取得），絕無載入或執行任何網路內容
或使用者輸入。已驗證所有 URL 皆為 `moz-extension://` 開頭、指向本擴充
套件內的靜態檔案。

`background.js` 不使用 `eval` / `Function`。所有 `innerHTML` 的使用點皆
為我們自行產生的靜態字串，無外部輸入。

## Permissions Justification

| Permission | Why |
|---|---|
| `compose` | Read/write the message body via `compose.*` APIs |
| `storage` | Persist user preferences (toolbar language, default font) |

No network requests are made. No telemetry. No external CDN dependencies —
TinyMCE is fully bundled and self-hosted.

## Source

- Build script: `build.ps1` (PowerShell, Windows)
- TinyMCE version bundled: 7.x (Community edition, MIT licensed)
- TinyMCE source: https://www.tiny.cloud/get-tiny/self-hosted/
