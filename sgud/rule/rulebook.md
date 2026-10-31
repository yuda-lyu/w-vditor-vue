# 規則帳本（w-vditor-vue）

## e2e 落地映射（規則帳本之一節；對應全域技能 role-coder-for-test-e2e §3 契約）

規則以技能為準，本節只記本專案之落地與偏離。流程代號與 spec 之對應須與 `spec/設計要點與取捨.md` 第一節同步。

### 服務與 port

| 項目 | 值 |
|---|---|
| 後端 | 無（Vue 2 組件庫，無資料庫） |
| 前端 | 無 dev server；每個測試檔於 mocha `before` 自建本機靜態站（Node `http`），服務 `/host/`（`test/host`）、`/bundle/`（本檔編譯之元件）、`/node_modules/`（vue、vditor 資源） |
| 靜態站 port | `load` 8136、`editing` 8137、`parent-update` 8138、`readonly` 8139、`readonly-focus` 8140、`key-hint` 8141（≥ 8000，寫死不隨機；`mocha --parallel` 下各檔獨立；被佔用即拋錯，不 reuse、不殺他人行程） |
| 元件來源 | 每檔 `before` 以 `w-package-tools/src/rollupFiles.mjs`（同 `toolg/gDistRollupComps.mjs` 設定）由 `src/components/WVditorVue.vue` 編譯至 `test/_tmp/<流程代號>/dist`，`after` 刪除；環境變數 `E2E_SRC_DIR` 可改指他版原始碼供紅燈驗證（變異副本置於 `./tmp/<任務>/mut-<名>/`，內含 `WVditorVue.vue` 即可，其 `w-component-vue` 等相依自 repo 根 `node_modules` 解析）；環境變數 `E2E_DIST_DIR`（例 `./dist`，須含 `w-vditor-vue.umd.js`）改以現成 dist 供應元件、不編譯，供驗證 dist（靜態站只讀該夾，`teardown` 不刪） |
| 文件 fixture | `test/host/docs.json`（宿主頁與測試端讀同一檔） |
| w-screenctl | 未使用 |
| e2e 執行 | 全跑 `npm test`（`mocha --parallel "test/*.test.mjs" --timeout 180000`）；單檔 `npx mocha test/e2e-<流程代號>.test.mjs --reporter list --timeout 180000`；單案 `--grep "E2E-00N \[所見即所得\]"` |
| 共用實作 | `test/tools/e2eLib.mjs` 單一橋接 → `w-package-tools-e2e` 1.0.6（`launchBrowser`、`waitUntilExist`、`createKnownDefect`）；`test/tools/e2e-setup.mjs` 只留專案組態與專案原語 |

### 契約映射

| 契約 | 本專案實名 / 模式 | 偏離與依據 |
|---|---|---|
| C1 launch wrapper | `launchBrowser()`（套件，六旗標），每案 `beforeEach` 新開、`afterEach` 關閉 | |
| C2 server lifecycle | `createFlow(流程代號)` 之 `setup()`／`teardown()`，於各檔 root `before`／`after` | 無外部服務可 reuse：靜態站與測試同行程、`close` 即釋放，故不需 health 識別與 spawn 清理 |
| C3 換設定重啟 | 不適用 | 無後端設定 |
| C4 DB 重置 | 不適用 | 無資料庫；每案全新 context，宿主頁狀態不跨案 |
| C5 進站與語系 | `flow.openCase(browser, query, net)`／`flow.openReady(...)`；語系不適用 | 單一語系（vditor `zh_TW`）；以編輯模式三種為變體迴圈 |
| C6～C9、C13 截圖、紅框、遮罩、比對、regen | 不適用 | 技能 §0：本專案 e2e 無像素比對；組件庫無操作手冊讀者；同組織組件庫 w-component-vue 先例只做語意斷言（`spec/設計要點與取捨.md` ADR-007） |
| C10 輸入 | 編輯區為 contenteditable，以 `editor(page).click()` → Ctrl+End → `keyboard.type`（Pattern A）；宿主頁欄位以 `click` → 鍵盤 | 輸入法組字以 CDP `Input.imeSetComposition`／`Input.insertText`（L1.5）：Playwright 無組字 API，CDP Input 為瀏覽器真實輸入管線 |
| C11 偵測等待 | `waitUntilExist`、`pollUntil`（套件）＋ setup 之 `waitReady`、`waitHostMounted`、`waitMounted`、`waitAsset`、`waitText`、`waitInputs`、`waitMdout`、`waitMdoutSynced`、`waitUndo`、`waitEditable`、`waitStatus`、`waitFocusLeft` | |
| C12 settle 訊號 | 就緒＝編輯器之 `max-height:0` 遮擋解除且可見編輯區出現（`waitReady`）；就緒後 settle 1.5 秒 | |
| C14 端點 | `http://127.0.0.1:<port>` | |

### 專案特有機制

- 示範宿主頁 `test/host/index.html`：扮演嵌入編輯器之父層頁面；父層行為（回寫方式、資料與權限延遲到達、Ctrl+S 儲存之鎖定與伺服器回傳、版本取得）以網址參數設定（setup）。act 只經宿主頁之按鈕（`getByRole('button', { name })`）、Ctrl+S、Alt+F、搜尋框、備忘欄與編輯器之真鍵盤滑鼠（L1～L3）；不得以 `page.evaluate` 改動頁面狀態。
- 觀察（只讀）：`window.__inputs`（元件回傳序列）、`#mdout`（頁面持有之內容）、`window.__fl`（聚焦／失焦通知）、`window.__docKeys`（頁面收到之按鍵）、`window.__after`、`#hostStatus`、`#hostLastKey`；輸入過程取樣器 `startSampler` 於 act 前安裝、只讀取編輯區文字。
- 網路條件：`openCase` 之 `net`（`luteDelay`、`i18nDelay`、`luteAbort`、`i18nAbort`）以 `page.route` 延遲或中止資源請求（測試環境條件），延遲與中止並給時為延遲後才失敗；所有非本機請求一律阻擋並記錄。`openCase` 回傳之 `assets` 依序記錄排版引擎、語系檔、圖示之請求發出／送達／失敗（`lute:request`、`i18n:finished`、`lute:failed`…），以 `waitAsset` 於測試行程端輪詢，作為載入階段之前提與「關閉後不再下載」之驗證。
- 監聽殘留：`globalListeners`（CDP）取 window、document、visualViewport 上各事件型別之監聽數，與 `hide=1` 之對照頁比對；對照頁須以 `waitHostMounted`（偵測等待）確認掛載後再量——Playwright 於頁面主環境首次執行偵測等待時會於 window 注入 13 個命中檢查監聽（點擊不會），兩頁須同含（`spec/evidence/2026-10-04-destroy-probe5.log`）；不以事件型別排除（與元件之 mouse 類監聽同型別）。
- 已知缺陷協定：`runCase(this, fn)`＋`createKnownDefect` → `this.skip()` 標 pending，條目登錄於 spec〈已知落差〉。
- 固定等待只限：就緒後 settle、負向觀察窗、復原前停頓（vditor 以防抖寫入復原紀錄、無可觀察訊號，`spec/設計要點與取捨.md`〈復原前停頓〉）、操作節奏（逐鍵間隔、輸入法組字）、刪除後重繪 settle；每處註解寫明涵蓋之計時。

### 偏離與依據（彙整）

1. 不建像素標準圖：技能 §0 判定只採通用原則（ADR-007）；rubric 第 3 維以語意斷言為限。
2. 單一語系；編輯模式（所見即所得、即時渲染、分割預覽）為變體迴圈，前提不成立之模式於 spec 案例〈模式〉寫明排除理由。
3. 每檔自建靜態站與編譯目錄，不用共用後端與逐檔隔離 runner（無跨檔狀態）。
4. 輸入法以 CDP Input（L1.5）。
5. 觀察用 `page.evaluate` 只讀不寫；act 不用 `evaluate`、`fill`、`vm.*`。

### 已知缺口 / 待辦

- 無 pending 案例（`load` E2E-017 之 window scroll 殘留已於 2026-10-04 修復，ADR-008）；`runCase`／`createKnownDefect` 保留供日後已知缺陷使用。

## 規則（藍圖：程式碼須長成什麼樣）

### R-01 以原始碼引用 w-component-vue 內部模組時，其對呼叫端之必備介面須與已安裝版本同步

- **規則**：`src/` 內凡以原始碼（`w-component-vue/src/…`）引用之模組，其要求呼叫端預先宣告之欄位、須提供之介面，本元件須全數滿足；`package.json` 之 `w-component-vue` 相依下限不得低於「已比對之版本」。w-component-vue 改動其必備鍵（例：2.5.35 之 `buildPopper` 新增 `state`）時，不期待上游放寬，由本元件配合並升相依下限（自有套件不做向下相容補丁；Gitea #36，2026-11-01 主控裁定）。以 `dist` 引用者不受影響（dist 內嵌打包當時之版本），故此問題只在原始碼引用時出現，且只靠 `dist` 驗證抓不到。
- **盤點指令**（可重跑）：
  1. 站點全集：Grep `from 'w-component-vue/src` 於 `src/`。
  2. 必備鍵：讀 `node_modules/w-component-vue/src/js/buildPopper.mjs` 之 `_keys`（2.5.35 為 `:23-36`，另 `keyShow` 參數即本元件之 `showPopper`），與 `WVditorVue.vue` 之 data／props 逐鍵比對。
  3. 版本：`npm ls w-component-vue` 與 `package.json` 相依下限。
- **站點全集與判準**（2026-11-01 比對 w-component-vue 2.5.35）：

| 站點 | 位置 | 對呼叫端之必備介面 | 判定 |
|---|---|---|---|
| `convertColor` | `WVditorVue.vue:57` | 純函數 | 不適用 |
| `domResize` | `WVditorVue.vue:58` | directive 工廠 | 不適用 |
| `BuildPopper` | `WVditorVue.vue:59`、建立於 `mounted`（`new BuildPopper`） | vo 預先宣告 12 鍵：`mode`（data `:332`）、`mmkey`（`:323`）、`showPopper`（`:340`）、`triggerWidth`（`:336`）、`placement`（`:341`）、`placementDistX`（`:342`）、`placementDistY`（`:343`）、`transitionTime`（`:335`）、`isolated`（`:334`）、`editable`（prop `:307`）、`contentStyle`（`:337`）、`state`（`:338`） | 已套 12／12 |
| `WIconLoading` | `WVditorVue.vue:60` | 元件 | 不適用 |

- **`state` 之提供**：data `state: 'hidden'`（`:338`）；提示區外層 `.WPopperFix` 綁定 `:state="state"`（`:19`，比照 `WTooltip.vue`）；值域 hidden／opening／opened，關閉無過場、不使用 hiding；JSDoc 已述值與時機。
- **對應測試**：`test/e2e-key-hint.test.mjs` E2E-007（三模式：state 序列恰為 opening、opened、hidden，掛載無錯誤、`bp` 已建立）、E2E-008（未設觸發字串：state 恆 hidden、掛載無錯誤）、E2E-003／004（提示區被取代內容或鎖定而關閉時 state 為 hidden）；E2E-001～006 與其他流程「主控台無錯誤」之斷言亦會在掛載拋錯時轉紅。單檔指令：`npx mocha test/e2e-key-hint.test.mjs --reporter spec --timeout 180000`；驗證 dist：加環境變數 `E2E_DIST_DIR=./dist`。
- **變異證明**（`spec/evidence/2026-11-01-vd36-mutants.md`）：拿掉 data 之 `state`（M1）全 18 案紅；拿掉 `:state` 綁定（M2）10 案紅；初值改 opened（M3）4 案紅。

### 改動範圍 → e2e 檔（全域規範：跑受影響者；全套只在最末輪由主控跑）

| 改動範圍 | 必跑 | 理由 |
|---|---|---|
| 提示區（`.WPopperFix` 模板、`BuildPopper` 引用與 data、`keyHint`、`hideHint`、`insertValue`） | `e2e-key-hint` | 提示區之開啟、關閉、插入及鎖定、整份取代時關閉皆只在此檔設案例（其他五檔不設 `keyHint`） |
| `package.json` 相依升版（`w-component-vue`、`vditor`）、`WVditorVue.vue` 之 `mounted`／`beforeDestroy`／data 宣告 | 全部六檔；`dist` 重建者另以 `E2E_DIST_DIR=./dist` 跑 `e2e-key-hint` | 掛載期錯誤影響所有流程之「主控台無錯誤」 |
| `WVditorVue.vue` 之編輯與回傳、回寫判斷、唯讀鎖定、載入與銷毀 | 該流程檔（`editing`、`parent-update`、`readonly`、`readonly-focus`、`load`）及 `key-hint` | 單一元件，流程間共用 `loadValue`／`applyEditable` |
| `test/tools/e2e-setup.mjs`、`test/host/index.html`、`docs.json` | 全部六檔 | 共用基礎 |
