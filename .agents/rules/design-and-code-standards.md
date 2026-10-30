---
trigger: always_on
---

# Zenbox 設計與代碼規範 (Design & Code Standards)

> **開發者**：Noah Sze  
> **軟體系列**：Zen 極簡軟體矩陣 (The Zen Suite)  
> **通用標準依據**：繼承自 Zenfit 產品設計規範，貫徹極簡冷靜的高信噪比工程美學。

---

## 0. 元件分層架構與真理源契約 (Three-Tier Component Architecture)

- **L1. 基礎設計圖元 (Design Tokens & CSS Variables)**：
  - 顏色、字體、間距、圓角均透過 CSS 變數或 Tailwind 配置收斂，嚴禁任意魔術數字。
- **L2. 原子元件與基礎控件 (Primitive & Base Components)**：
  - 所有基礎互動控件（按鈕、輸入框、彈窗、標籤、選單等）統一由 `src/components/ui/`（基於 `shadcn/ui` / Radix）作為唯一真理源。
  - 業務層絕對嚴禁繞過共用元件自行以原生 HTML 標籤拼湊重複樣式。
- **L3. 領域模式與複合元件 (Domain Patterns & Layout Blocks)**：
  - 跨頁面出現 2 次及以上的 UI 結構（例如媒體卡片 `MediaCard`、標籤徽章列 `TagBadgeList`、指令面板項目等），嚴禁複製貼上 JSX，必須立即收斂封裝為共用 Pattern。

---

## 1. 核心視覺風格 (Core Visual Style)

- **Vercel 極簡工程師美學**：追求極簡、高對比、冷靜具備工藝感的現代黑客設計。
- **純粹對比**：以純黑 (`#000000`) 作為主背景，搭配純白 (`#ffffff`) 與灰階微邊框 (`border border-border`)。
- **扁平化設計 (Flat Design)**：**絕對禁止在任何卡片或容器上使用陰影 (`shadow-none`)**。層級劃分完全依靠細緻邊框與微透明度對比。
- **字體排印規範 (Typography)**：
  - **介面、代碼、標籤與元數據**：嚴格使用等寬字體 `JetBrains Mono`（`font-mono`）。
  - **備註、筆記與長篇閱讀**：使用襯線字體 `Noto Serif TC` 或 `Newsreader`（`font-serif`）。
  - **盤古之白 (Pangu Spacing)**：所有中文與英文/數字之間必須插入一個半形空格（例如「支援 4K 影片與 WebP 縮圖」而非「支援4K影片與WebP縮圖」）。

---

## 2. 佈局與跨平台互動標準 (Layout & Cross-Platform Standards)

- **Safe Area Insets 全面適配**：
  - 在全域 CSS 中宣告 `--sat`, `--sab`, `--sal`, `--sar`，確保 iOS PWA 全螢幕、動態島與底端導航橫條完全貼合。
- **瞬時彈出 (Instant Pop) 規範**：
  - Dialog / Modal 彈窗本體全面採用原生級瞬時彈出，**嚴禁在卡片上附加慢速 `animate-in fade-in` 動畫**，杜絕在舊設備或重載運算時掉幀。
- **焦點管理與禁止自動聚焦 (No Auto-Focus)**：
  - 彈窗或畫面掛載時，**絕對禁止**在輸入框設置 `autoFocus` 或透過 JS 主動 `.focus()`，避免行動端虛擬鍵盤在畫面切換時自動彈出遮擋視野。
- **彈窗高度穩定性 (Anti-Jitter)**：
  - 彈窗幾何高度必須恆定，嚴禁在互動過程中動態插入或移除元素導致彈窗高度突增跳動。
- **毛玻璃與遮罩規範 (Frosted Glassmorphism)**：
  - 遮罩層全面使用專屬帶透明度變數：`bg-overlay backdrop-blur-[2px]`。
  - **嚴禁在動態 CSS 變數上直接使用 Tailwind 透明度修飾符（如 `bg-background/80`）**：避免 Tailwind CSS 編譯為 `color-mix()` 導致舊版 WebKit (iOS <= 15) 回退變成 100% 實色黑塊。
- **純本地狀態視圖 (Tabs as Pure Local State)**：
  - 頁面內部視圖或標籤過濾切換，預設使用純本地狀態（`useState`），嚴禁污染瀏覽器網址列；點擊瀏覽器返回鍵必須確定且直接地返回上一層頁面。

---

## 3. 全局極簡文本契約 (Global Ultra-Concise UI Copy Contract)

Zen 系列軟體是一把冷靜、精準、高信噪比的儀器，介面中的每一個字元都應具備不可替代的資訊價值：

1. **去上下文冗餘（去所屬對象綴詞）**：
   - 嚴禁「新增媒體」、「已歸檔標籤」、「編輯備註」；統一精簡為「新增」、「已歸檔」、「編輯」。
2. **去口語與客套廢話（零修飾、零說教）**：
   - 嚴禁「請您…」、「您可以…」、「點擊此處…」、「溫馨提示…」、「成功完成…」。只陳述客觀事實與動作結果。
3. **動作動詞純粹化（強動詞、最短字數）**：
   - 按鈕操作統一使用最短有力動詞：「新增」、「儲存」、「匯出」、「刪除」、「恢復」。
4. **通知與 Toast 極限精簡（對象 + 結果）**：
   - 彈出通知在 2～4 個字內結束：「已儲存」、「已歸檔」、「已刪除」、「已備份」。
5. **空狀態客觀陳述（去情緒、零指引說教）**：
   - 僅說明客觀現狀：「無媒體」、「無標籤」、「無快取」。

---

## 4. 代碼與型別規範 (Code & TypeScript Standards)

- **關注點分離**：
  - UI 元件專注於渲染與事件派發。
  - 資料庫查詢、Chokidar 檔案監聽、Sharp/FFmpeg 佇列與防抖邏輯完整收斂於後端服務或前端自定義 Hooks。
- **TypeScript 靜態型別約束**：
  - **絕對禁止使用 `any` 型別**，所有檔案結構、Sidecar JSON、資料庫 Entity 與 API 傳輸物件均需具備嚴格強型別。
- **I/O 與檔案系統安全性**：
  - 外部檔案寫入原生檔案系統時必須具備防抖（Debounce）機制。
  - 後端媒體轉碼必須具備任務佇列（Queue）並發限制與重試機制，防止磁碟與記憶體溢出。

---

## 5. 負面清單（絕對禁止項，Strict Prohibitions）

1. **不得在容器或卡片上使用陰影**：絕對禁止 `shadow-sm`, `shadow-md`, `shadow-lg` 等。
2. **不得 Copy-Paste JSX**：凡重複 2 次以上必須抽離共用元件。
3. **不得使用任意魔術數值**：嚴禁未經定義的任意類名（如 `text-[#1a1a1a]`）。
4. **不得使用 `any` 型別**：全專案啟用嚴格 TypeScript。
5. **不得在彈窗掛載時自動聚焦輸入框**：嚴禁 `autoFocus`。
6. **不得在彈窗卡片上使用慢速漸入動畫**：必須瞬時彈出（Instant Pop）。
7. **不得動態插入元素撐大彈窗容器**：彈窗容器高度必須維持穩定。
8. **不得在動態 CSS 變數上附加 Tailwind 透明度修飾符**：避免舊版 WebKit `color-mix()` 遮罩實色 bug。
9. **不得擅自修改 `/originals` 中的原生媒體檔案**：原始媒體唯讀不可變，一切衍生檔案歸入 `/cache`，元數據歸入 Sidecar `.json`。
10. **不得在無使用者明確命令或同意下自行執行 `git commit` 或 `git push`**。
