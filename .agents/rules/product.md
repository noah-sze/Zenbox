---
trigger: always_on
---

# Zenbox 產品規格與架構白皮書 (Product Spec & Architecture)

> **開發者**：Noah Sze  
> **軟體系列**：Zen 極簡軟體矩陣 (The Zen Suite)  
> **系統代號**：Zenbox — 自託管視覺化第二大腦 (Self-Hosted Visual Second Brain)

---

## 1. 產品定位與核心使命 (Product Definition & Mission)

### 1.1 產品定位
Zenbox 是一款**「絕對本地優先（Local-First）」**的自託管個人媒體收藏夾與視覺化第二大腦。它專為數位資產管理者、設計師、研究員與創作者打造，提供跨平台無縫存取、毫秒級檢索、極致離線與連線媒體瀏覽體驗，並具備強大的無伺服器直接檔案可讀性。

### 1.2 核心使命
- **資料主權歸還**：原生檔案系統是唯一的宇宙事實來源（Single Source of Truth），脫離任何軟體也能被直接讀取與遷移。
- **冷靜無干擾**：延續 Zen 系列哲學，作為一把極致鋒利、高信噪比、無多餘雜訊的「視覺資產索引儀與客觀展示鏡」。
- **極速流暢**：無論本機收藏了上萬張高解析圖片或影片，UI 始終保持 60/120fps 的流暢反應，搜尋與標籤聚合即時反饋。

---

## 2. Zen 系列產品哲學與設計邊界 (Zen Product Philosophy & Strict Boundaries)

### 2.1 客觀鏡子與零說教 (Zero Preachiness & High Signal)
- **客觀事實，拒絕干涉**：只呈現資產屬性（標籤、時間、尺寸、格式），不做主觀推薦或打分。
- **無雜訊極簡 (Zero Noise)**：無廣告、無社交社群模組、無心靈雞湯、無強制訂閱或打卡懲罰機制。
- **全局極簡文案契約 (The 5 Rules of Ultra-Concise Copy)**：
  1. **去上下文冗餘**：嚴禁「新增媒體項目」、「已歸檔標籤」；統一精簡為「新增」、「已歸檔」、「標籤」。
  2. **去口語與客套廢話**：嚴禁「請您…」、「您可以…」、「溫馨提示…」、「成功完成…」。
  3. **動作動詞純粹化**：統一使用「新增」、「儲存」、「匯出」、「刪除」、「恢復」等最短有力動詞。
  4. **通知與 Toast 極限精簡**：2～4 字結束，如「已儲存」、「已刪除」、「已建立」。
  5. **空狀態客觀陳述**：如「無媒體」、「無標籤」、「無快取」。

### 2.2 非目標範疇 (Non-Goals)
- 不做社群互動與公眾分享平台（僅專注個人與私有託管）。
- 不對原生媒體進行任何有損、不可逆的修改（原檔絕對不可變）。
- 不把元數據鎖定在專有黑盒資料庫中。

---

## 3. 核心系統架構：Decoupled Monolith (解耦單體架構)

前後端採用「職責嚴格解耦，同環境打包部署」架構：

```
+-------------------------------------------------------------+
|                      Zenbox Monorepo                        |
|                                                             |
|  +------------------------+      +-----------------------+  |
|  |     Frontend (PWA)     |      |    Backend Service    |  |
|  |  React + TS + Tailwind | <==> | Node.js + Hono + TS   |  |
|  |  Dexie.js (Offline DB) | HTTP | SQLite (Disposable)   |  |
|  +------------------------+      +-----------------------+  |
|                                              |              |
|                               +--------------+--------------+
|                               |                             |
|                               v                             v
|                    +--------------------+        +--------------------+
|                    | storage/originals/ |        |   storage/cache/   |
|                    | 媒體檔 + Sidecar   |        | 縮圖 + HLS 串流    |
|                    | (唯一真理源)       |        | (隨時可拋棄重建)   |
|                    +--------------------+        +--------------------+
+-------------------------------------------------------------+
```

### 3.1 儲存與資料真理源 (Single Source of Truth)
1. **原生檔案系統（`/storage/originals`）**：
   - 所有的照片、影片（`.jpg`, `.png`, `.webp`, `.mp4`, `.mov` 等）存放於此。
   - **Sidecar 伴隨文件**：每份媒體檔案皆在同級目錄下擁有同名 `.json` 伴隨文件（例如 `artwork.jpg` 伴隨 `artwork.json`）。
   - Sidecar 內容包含標籤、加入時間、來源 URL、備註等元數據：
     ```json
     {
       "title": "Minimal Architecture",
       "tags": ["design", "architecture", "minimal"],
       "addedAt": "2026-10-30T19:30:00.000Z",
       "sourceUrl": "https://...",
       "notes": "客觀備註內容"
     }
     ```
2. **可拋棄的 SQLite 索引（Disposable SQLite Index）**：
   - SQLite 僅作為高速檢索與標籤多對多聚合的「快取資料庫」。
   - 當資料庫遺失或重新初始化時，後端啟動自動完整掃描 `/storage/originals` 並重建 SQLite 資料表。
3. **快取隔離層（`/storage/cache`）**：
   - 包含多種解析度縮圖（Sharp 產生）與 HLS 串流分片（FFmpeg 產生）。
   - 磁碟空間不足時隨時可直接清空，系統會按需自動重新生成。

### 3.2 標籤系統架構 (Tag System Architecture)
- **多對多關聯（Many-to-Many）**：
  - `media` 表：記錄檔案名稱、寬高、時長、雜湊值、加入時間等。
  - `tags` 表：記錄唯一標籤名、色彩樣式、計數。
  - `media_tags` 表：關聯 `media_id` 與 `tag_id`，具備覆蓋索引，保障多標籤 `AND`（同時符合）與 `OR`（任一符合）檢索在毫秒內完成。
- **雙寫保證（Dual-Write Consistency）**：
  - 前端修改標籤時，後端即時原子化更新 SQLite 與實體 Sidecar `.json`。
- **自動外部匯入初始化**：
  - 當檔案被外部手動複製進 `/storage/originals`，後端監聽器自動補齊預設的 Sidecar `.json` 並登錄 SQLite。

---

## 4. 後端架構與彈性 (Backend Stack & Resilience)

- **運行時與框架**：Node.js (v24+) + Hono + TypeScript。
- **資料庫**：SQLite（原生高效驅動）。
- **目錄變更監聽與防抖 (Chokidar with Debounce)**：
  - 監聽 `/storage/originals` 檔案事件（`add`, `change`, `unlink`）。
  - 實作防抖計時器（800ms～1500ms），待檔案 I/O 完全寫入關閉後才觸發元數據抽取與佇列任務，杜絕檔案被鎖定或未傳輸完畢所產生的讀取錯誤。
- **媒體處理任務佇列 (Worker Queue with Concurrency & Retry)**：
  - 使用 `sharp` 產生 WebP/AVIF 縮圖與主要色彩提取。
  - 使用 `fluent-ffmpeg` 抽取影片首幀與轉碼 HLS 串流。
  - 實作並發控制（Concurrency Limit，如最多 2-4 個 I/O 任務並行）與錯誤重試機制，防止批量匯入時引發 CPU 爆表或記憶體溢出（OOM）。
- **驗證機制**：全局密碼保護（Session / JWT Bearer）。

---

## 5. 前端架構與跨平台規範 (Frontend & Cross-Platform)

- **技術棧**：Vite + React + TypeScript + TailwindCSS + `vite-plugin-pwa`。
- **離線資料庫**：Dexie.js 建立瀏覽器端本地 IndexedDB 快取，斷網時照常即時檢索與標籤快取。
- **離線背景同步 (Background Sync & Queue)**：
  - 離線時修改標籤或上傳，暫存於 Dexie 離線任務佇列，恢復連線後背景依序自動重放同步。
- **多平台意識與適配**：
  - **Safe Area Insets**：CSS 變數封裝 `--sat`, `--sab`, `--sal`, `--sar`，完美貼合 iOS PWA 全螢幕、動態島與底端導航橫條。
  - **Desktop**：
    - `Cmd+K` / `Ctrl+K` 呼叫全域命令面板（`<CommandPalette>`）。
    - 支援原生拖曳（Drag & Drop）檔案至瀏覽器批次匯入。
  - **Mobile / Tablet**：
    - 隱藏複雜熱鍵，使用底部抽屜（`<BottomSheet>`）與原生觸控選單。
    - 支援 Web Share Target API，手機瀏覽器按「分享」可直接將媒體傳入 Zenbox。
- **超大規模渲染優化 (Extreme Masonry Performance)**：
  - 瀑布流（Masonry Grid）整合虛擬化分欄與 `IntersectionObserver` 無限滾動。
  - 圖片採用固定長寬比預佔位（Aspect Ratio Placeholder）與漸進加載，徹底杜絕 Layout Shift（版面抖動）。

---

## 6. UI/UX 核心設計規範 (Vercel-inspired Minimalist)

- **主題**：純粹暗黑模式（Pure Dark Mode），`#000000` 底色，高對比幾何線條。
- **零陰影扁平化**：**絕對禁止使用陰影 (`shadow-none`)**，嚴格依靠 1px 微邊框 (`border border-border`) 界定層級。
- **字體層級**：
  - UI 介面、標籤徽章、代碼與數據指標：`JetBrains Mono`（`font-mono`）。
  - 備註與長篇文字閱讀：`Noto Serif TC` / `Newsreader`。
- **三大層級元件架構 (Three-Tier Component Hierarchy)**：
  - L1: 基礎圖元 (Design Tokens)
  - L2: 原子控件 (Primitive Components, `src/components/ui/`)
  - L3: 領域模式 (Domain Patterns, 複用 2 次以上必須抽離)
- **彈窗互動契約**：
  - **瞬時彈出 (Instant Pop)**：嚴禁慢速漸入動畫，保證老舊裝置零掉幀。
  - **焦點管理**：彈窗掛載時禁止自動獲取焦點 (`autoFocus={false}`)，防止行動端虛擬鍵盤無故遮擋內容。
  - **幾何高度穩定**：嚴禁在彈窗中動態插入元素撐大高度（Anti-Jitter）。
