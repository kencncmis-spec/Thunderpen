# ⚡ 雷霆筆 Thunderpen

> *讓你的 Thunderbird 也能像專業編輯器一樣，從容下筆。*

雷霆筆（Thunderpen）是一款 Thunderbird 撰寫視窗外掛，以業界廣泛使用的
**TinyMCE** 富文本編輯器取代 Thunderbird 預設的內文編輯區，
帶來表格、圖片、格式複製、多國語系等現代化編輯體驗。

無論你是寫客服回覆、商務報價、技術文件，還是日常的問候信，
都能用熟悉的工具列、所見即所得地完成。

## 支援版本

Thunderbird 115（Supernova）以上，包含 140 ESR。

## 安裝步驟

### Step 1：下載 TinyMCE

1. 前往 https://www.tiny.cloud/get-tiny/self-hosted/
2. 下載 **TinyMCE Community** 版（免費，選 "Download TinyMCE"）
3. 解壓縮後，將 `tinymce/` 資料夾內的**所有內容**複製到本專案的 `tinymce/` 資料夾

   完成後目錄結構應如下：
   ```
   tb_editer/
   └── tinymce/
       ├── tinymce.min.js   ← 必要
       ├── plugins/
       ├── themes/
       ├── icons/
       └── ...
   ```

### Step 2：加入語系檔（必要）

1. 前往 https://www.tiny.cloud/get-tiny/language-packages/
2. 下載你要的語系 `.js` 檔，例如：
   - `zh_TW.js`（繁體中文）
   - `zh_CN.js`（簡體中文）
   - `ja.js`（日本語）
   - `ko_KR.js`（한국어）
   - `de.js`、`fr_FR.js`、`es.js` …
3. 放到 `tinymce/js/tinymce/langs/` 資料夾下

外掛內建語系選單（工具列最右側「語系」按鈕），可隨時切換已下載的語系。
未下載的語系若被選到會自動退回英文。

### Step 3：安裝外掛到 Thunderbird

**開發/測試方式（推薦）：**

1. 開啟 Thunderbird
2. 選單 → **工具** → **外掛程式與佈景主題**
3. 點選齒輪圖示 → **從檔案安裝外掛程式...**
4. 選取 `thunderpen.xpi`（見下方打包說明）

**或使用暫時安裝（不需打包）：**

1. 在網址列輸入 `about:debugging`
2. 點選 **此 Thunderbird**
3. 點選 **暫時性載入外掛程式...**
4. 選取本資料夾內的 `manifest.json`

### Step 4：打包為 .xpi

在本資料夾執行：

```powershell
.\build.ps1
```

會產生 `thunderpen.xpi`，可分發安裝。

## 功能說明

| 功能 | 說明 |
|------|------|
| **語系切換** | 工具列右側「語系」按鈕，支援中/英/日/韓/德/法/西，切換後重開撰寫視窗生效 |
| **複製格式** | 選取來源文字 → 點「複製格式」→ 選取目標文字自動套用 |
| **表格** | 工具列 Table 選單，支援插入、刪除、合併儲存格 |
| **圖片插入** | 支援上傳圖片（自動轉 base64 內嵌）或填入圖片 URL |
| **格式控制** | 粗體、斜體、底線、刪除線、文字顏色、背景色 |
| **純文字模式** | 偵測到純文字模式時顯示提示，不會強行啟用 TinyMCE |

## 注意事項

- 本外掛使用 `compose.onBeforeSend` 在送出前同步 TinyMCE 內容，若在極慢的電腦上可能有 3 秒超時
- 圖片採 base64 內嵌，大圖片會增加郵件大小
- 若 TinyMCE 載入失敗，Thunderbird 仍可正常使用原始編輯器（外掛不影響核心功能）
