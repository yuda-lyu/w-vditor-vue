# 規則帳本（w-vditor-vue）

## e2e 落地映射（規則帳本之一節；對應全域技能 role-coder-for-test-e2e §3 契約）

規則以技能為準，本節只記本專案之落地與偏離。流程代號與 spec 之對應須與 `spec/設計要點與取捨.md` 第一節同步。

### 服務與 port

| 項目 | 值 |
|---|---|
| 後端 | 無（Vue 2 組件庫，無資料庫） |
| 前端 | 無 dev server；每個測試檔於 mocha `before` 自建本機靜態站（Node `http`），服務 `/host/`（`test/host`）、`/bundle/`（本檔編譯之元件）、`/node_modules/`（vue、vditor 資源） |
| 靜態站 port | 基準埠：`load` 8136、`editing` 8137、`parent-update` 8138、`readonly` 8139、`readonly-focus` 8140、`key-hint` 8141、`preview` 8142（≥ 8000，寫死不隨機；`preview` 為 2026-11-09 新增，跨套件之埠登錄表 `dspec/e2e埠與多套件同跑.md` 原記 8136～8141，須由主控更新為 8136～8142；**單一定義於 `test/tools/e2ePorts.mjs`**）；`mocha --parallel` 下各檔獨立、各自預約自己的埠；基準埠被占用時自動換至下一個位移（+100、+200…），實際埠印入輸出（`[e2e-port]`），**絕不下殺、不沿用占用者**（R-E2E-PORT-01） |
| 元件來源 | 每檔 `before` 以 `w-package-tools/src/rollupFiles.mjs`（同 `toolg/gDistRollupComps.mjs` 設定）由 `src/components/WVditorVue.vue` 編譯至 `test/_tmp/<流程代號>/dist`，`after` 刪除；環境變數 `E2E_SRC_DIR` 可改指他版原始碼供紅燈驗證（變異副本置於 `./tmp/<任務>/mut-<名>/`，內含 `WVditorVue.vue` 即可，其 `w-component-vue` 等相依自 repo 根 `node_modules` 解析）；環境變數 `E2E_DIST_DIR`（例 `./dist`，須含 `w-vditor-vue.umd.js`）改以現成 dist 供應元件、不編譯，供驗證 dist（靜態站只讀該夾，`teardown` 不刪）；環境變數 `E2E_VDITOR_DIR`（vditor 套件資料夾，須含 `dist/index.js`）使靜態站以該夾供應 `/node_modules/vditor/`（lute、語系、圖示），供紅燈驗證以舊版 vditor 重現修前行為，須與變異副本（把 `import 'vditor'`、`'vditor/dist/index.css'` 改為指向同一舊版）併用，見 R-03 |
| 文件 fixture | `test/host/docs.json`（宿主頁與測試端讀同一檔） |
| w-screenctl | 未使用 |
| e2e 執行 | 全跑 `npm test`（`mocha --parallel "test/*.test.mjs" --timeout 180000`）；單檔 `npx mocha test/e2e-<流程代號>.test.mjs --reporter list --timeout 180000`；單案 `--grep "E2E-00N \[所見即所得\]"` |
| 共用實作 | `test/tools/e2eLib.mjs` 單一橋接 → `w-package-tools-e2e` 1.0.22（`launchBrowser`、`waitUntilExist`、`pollUntil`、`createKnownDefect`、`reserveE2ePorts`、`describePortOwners`）；`test/tools/e2e-setup.mjs` 只留專案組態與專案原語；埠相關（基準埠、預約、綁定）集中於 `test/tools/e2ePorts.mjs` |

### 契約映射

| 契約 | 本專案實名 / 模式 | 偏離與依據 |
|---|---|---|
| C1 launch wrapper | `launchBrowser()`（套件，六旗標），每案 `beforeEach` 新開、`afterEach` 關閉 | |
| C2 server lifecycle | `createFlow(流程代號)` 之 `setup()`／`teardown()`，於各檔 root `before`／`after`；`setup()` 先編譯元件，再 `reserveFlowPort`（`reserveE2ePorts([基準埠], { applyEnv: false })`）預約、`listenReserved` 綁定；`teardown()` 關站並釋放預約 | 無外部服務可 reuse：靜態站與測試同行程、`close` 即釋放，故不需 health 識別與 spawn 清理。埠不經 `createServiceManager`／`E2E_PORT_OFFSET`（六個流程各為獨立行程內之獨立服務，互不相連，不必一起位移），改 `applyEnv:false` 各自預約；綁定前以連線檢查（`isPortAnswering`）確認無人接聽——Windows 下占用者綁 `0.0.0.0`／`::`／`::1` 時綁 `127.0.0.1` 不報 `EADDRINUSE`、會並存且搶走對方新連線（R-E2E-PORT-01） |
| C3 換設定重啟 | 不適用 | 無後端設定 |
| C4 DB 重置 | 不適用 | 無資料庫；每案全新 context，宿主頁狀態不跨案 |
| C5 進站與語系 | `flow.openCase(browser, query, net)`／`flow.openReady(...)`；語系不適用 | 單一語系（vditor `zh_TW`）；以編輯模式三種為變體迴圈 |
| C6～C9、C13 截圖、紅框、遮罩、比對、regen | 不適用 | 技能 §0：本專案 e2e 無像素比對；組件庫無操作手冊讀者；同組織組件庫 w-component-vue 先例只做語意斷言（`spec/設計要點與取捨.md` ADR-007） |
| C10 輸入 | 編輯區為 contenteditable，以 `editor(page).click()` → Ctrl+End → `keyboard.type`（Pattern A）；宿主頁欄位以 `click` → 鍵盤 | 輸入法組字以 CDP `Input.imeSetComposition`／`Input.insertText`（L1.5）：Playwright 無組字 API，CDP Input 為瀏覽器真實輸入管線 |
| C11 偵測等待 | `waitUntilExist`、`pollUntil`（套件）＋ setup 之 `waitReady`、`waitHostMounted`、`waitMounted`、`waitAsset`、`waitText`、`waitInputs`、`waitMdout`、`waitMdoutSynced`、`waitUndo`、`waitEditable`、`waitStatus`、`waitFocusLeft` | |
| C12 settle 訊號 | 就緒＝編輯器之 `max-height:0` 遮擋解除且可見編輯區出現（`waitReady`）；就緒後 settle 1.5 秒 | |
| C14 端點 | `http://127.0.0.1:<實際埠>`（`flow.origin`，於 `setup()` 綁定後由實際埠衍生；測試碼無寫死之主機:埠，EP-002 守護） | |

### 專案特有機制

- 示範宿主頁 `test/host/index.html`：扮演嵌入編輯器之父層頁面；父層行為（回寫方式、資料與權限延遲到達、Ctrl+S 儲存之鎖定與伺服器回傳、版本取得）以網址參數設定（setup）。act 只經宿主頁之按鈕（`getByRole('button', { name })`）、Ctrl+S、Alt+F、搜尋框、備忘欄與編輯器之真鍵盤滑鼠（L1～L3）；不得以 `page.evaluate` 改動頁面狀態。
- 觀察（只讀）：`window.__inputs`（元件回傳序列）、`#mdout`（頁面持有之內容）、`window.__fl`（聚焦／失焦通知）、`window.__docKeys`（頁面收到之按鍵）、`window.__after`、`#hostStatus`、`#hostLastKey`；輸入過程取樣器 `startSampler` 於 act 前安裝、只讀取編輯區文字。
- 網路條件：`openCase` 之 `net`（`luteDelay`、`i18nDelay`、`luteAbort`、`i18nAbort`）以 `page.route` 延遲或中止資源請求（測試環境條件），延遲與中止並給時為延遲後才失敗；所有非本機請求一律阻擋並記錄。`openCase` 回傳之 `assets` 依序記錄排版引擎、語系檔、圖示之請求發出／送達／失敗（`lute:request`、`i18n:finished`、`lute:failed`…），以 `waitAsset` 於測試行程端輪詢，作為載入階段之前提與「關閉後不再下載」之驗證。
- 編輯區觀察（vditor 4 起）：分割預覽之編輯區為 textarea，其餘兩模式為 `.vditor-reset[contenteditable]`；`states`、`waitReady`、`waitEditable`、`waitText`、`rawText`、`startSampler`、`focusInEditor`、`focusOnEditorItself`、`editor` 與宿主頁 `after` 記錄一律以 `.vditor-reset[contenteditable], textarea.vditor-sv` 找可見編輯區，文字取 `value`（textarea）或 `innerText`，可編輯狀態取 `!disabled && !readOnly`（textarea）或 `contenteditable`（轉為 'true'／'false'）；新增之編輯區觀察須沿用，不得只寫 `contenteditable` 選擇器（修前：36 案分割預覽輪因找不到編輯區逾時）。`previewMedia(page, i)` 只讀觀察預覽區之播放器與全域旗標 `window.__xss`。
- 監聽殘留：`globalListeners`（CDP）取 window、document、visualViewport 上各事件型別之監聽數，與 `hide=1` 之對照頁比對；對照頁須以 `waitHostMounted`（偵測等待）確認掛載後再量——Playwright 於頁面主環境首次執行偵測等待時會於 window 注入 13 個命中檢查監聽（點擊不會），兩頁須同含（`spec/evidence/2026-10-04-destroy-probe5.log`）；不以事件型別排除（與元件之 mouse 類監聽同型別）。
- 已知缺陷協定：`runCase(this, fn)`＋`createKnownDefect` → `this.skip()` 標 pending，條目登錄於 spec〈已知落差〉。
- 固定等待只限：就緒後 settle、負向觀察窗、復原前停頓（vditor 以防抖寫入復原紀錄、無可觀察訊號，`spec/設計要點與取捨.md`〈復原前停頓〉）、操作節奏（逐鍵間隔、輸入法組字）、刪除後重繪 settle；每處註解寫明涵蓋之計時。

### 偏離與依據（彙整）

1. 不建像素標準圖：技能 §0 判定只採通用原則（ADR-007）；rubric 第 3 維以語意斷言為限。
2. 單一語系；編輯模式（所見即所得、即時渲染、分割預覽）為變體迴圈，前提不成立之模式於 spec 案例〈模式〉寫明排除理由。
3. 每檔自建靜態站與編譯目錄，不用共用後端與逐檔隔離 runner（無跨檔狀態）；因此規格「逐檔 runner 改 `killOwnListeners`」不適用（本套件無 runner、無依埠下殺）。
3a. 埠：各流程為獨立行程內之獨立服務，故每流程各自 `reserveE2ePorts([基準埠], { applyEnv: false })`（規格 E3「同一實例多埠一起位移」在此退化為單埠）；實際埠取自 `reservation.portOf`，不經 `resolveE2ePort`／`E2E_PORT_OFFSET`（`applyEnv:false` 時該環境變數仍作為起選位移，多開工具指定位移時照用）。
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

### R-E2E-PORT-01 e2e 靜態站埠：基準埠單一定義、被占用自動換埠、絕不下殺非本實例（規格 `dspec/e2e埠與多套件同跑.md` E1～E8、§5；2026-11-05 vd309）

- **規則**：
  1. 基準埠（≥ 8000、寫死不隨機）只定義於 `test/tools/e2ePorts.mjs` 之 `FLOW_PORTS`；其他程式碼不得出現基準埠字面，也不得寫死「主機:埠」。實際埠一律來自 `reserveFlowPort`（`reserveE2ePorts([基準埠], { applyEnv: false, avoid: OTHER_TEST_PORTS })`）之 `portOf`。
  2. 靜態站只經 `listenReserved` 綁定：綁定前以 `isPortAnswering`（對 `127.0.0.1`、`::1` 發新連線，不送請求）確認無人接聽，已有人接聽或綁定遇 `EADDRINUSE` 即 `reselect` 換下一個位移；重選用盡拋 `E2E_PORT_EXHAUSTED` 並於訊息寫明被占用之埠與占用者。
  3. **絕不下殺占用者**：`test/`、`test/tools/` 無任何下殺原語（依埠、依名稱、依命令列），且不呼叫 `noteOwn`（函式庫之殘留下殺只依 `noteOwn` 記下之身分；不記錄就不會殺）。
  4. 沒有占用時即基準埠、不寫 `E2E_PORT_OFFSET`、不位移，埠與行為同導入前；有占用時實際埠印入輸出（`[e2e-port]`）。
  5. `OTHER_TEST_PORTS`（本套件其他測試寫死之埠）須與實際一致；實查為空（本套件除七個流程靜態站外無任何寫死之埠）。
  6. 畫面含埠之流程（規格 E7）：本套件無（無像素標準圖；斷言不含埠；`popup.url().endsWith('/node_modules/vditor/package.json')` 與埠無關）。日後新增含埠畫面之流程，須依規格 E7 擇一：比對端覆蓋（`overlayRegions`）或 `reserveE2ePorts(…, { baseOnly: true })`。
- **盤點指令**（可重跑；EP-002～EP-004 以程式守護同一內容）：
  1. `Grep "localhost:|127\.0\.0\.1:" test/` → 命中者皆由實際埠衍生：`e2e-setup.mjs` 之 `127.0.0.1:${port}`，與 `unit-e2ePorts.test.mjs` 內由動態空閒埠 P 衍生之期望值；EP-002 以「`:` 後為數字字面」守護（`:${…}` 不算）。
  2. `Grep "taskkill|Stop-Process|process\.kill|\.kill\(|wmic|netstat|killPortListeners|killOwnListeners|noteOwn" test/ spec/ toolg/` → 僅 `unit-e2ePorts.test.mjs` 以 `child.kill()` 收尾自己啟動之測試子行程；其餘 0 命中。
  3. `Grep "\.listen\(" test/` → 僅 `tools/e2ePorts.mjs`（`listenOnce`）、`tools/e2ePortsOccupier.mjs`（測試用占用者）與 `unit-e2ePorts.test.mjs`（空閒埠探測）。
  4. `Grep "813[6-9]|814[0-2]" test/` → 僅 `tools/e2ePorts.mjs`（與註解中之埠範圍字樣，如 `unit-e2ePorts.test.mjs` 檔頭）。
- **站點全集與判準**（2026-11-05 實查）：

| 站點 | 現況（導入前 → 導入後） | 判定 |
|---|---|---|
| `e2e-setup.mjs` `startServer`（原 `listen(port,'127.0.0.1')`） | 被占用時：占用者綁 `127.0.0.1` 拋 `EADDRINUSE` 失敗；占用者綁 `0.0.0.0`／`::`／`::1` 時**成功並存**，全綠但搶走對方新連線（修前實測 319 次）→ 改 `listenReserved` | 已改 |
| `createFlow` 之 `port`／`origin` | 建立時即定 → 改 `setup()` 後才定，以 getter 提供 | 已改 |
| 依埠／依名稱／依命令列下殺（`killPortListeners`、`taskkill`、`Stop-Process`、`process.kill`、`wmic`、`netstat`） | 本套件 0 處（含 `spec/evidence`、`toolg`、引用之 `launchBrowser` 系列與 `rollupFiles`） | 不適用，EP-004 守護 |
| `test/*.test.mjs` 之主機:埠 | 0 處寫死（`popup.url()` 只比後綴） | 符合，EP-002 守護 |
| 逐檔 runner（`killPortListeners`→`killOwnListeners`） | 本套件無 runner | 不適用 |
| 其他測試寫死之埠（`avoid`） | 0 處 | `OTHER_TEST_PORTS = []`，EP-003 守護 |

- **對應測試**：`test/unit-e2ePorts.test.mjs`（EP-001～EP-014；真實行程與真實監聽，動態期望，與同一 `mocha --parallel` 中之 e2e 檔互不干擾）。單檔指令：`node node_modules/mocha/bin/mocha.js test/unit-e2ePorts.test.mjs --reporter spec --timeout 180000`。
- **變異證明**（2026-11-05；暫時改碼 → 跑 `unit-e2ePorts` → 還原並以雜湊回驗；17／17 擊殺）：

| 變異 | 擊殺（轉紅）之案例 |
|---|---|
| M1 `reserveFlowPort` 不預約（`portOf` 恆為基準埠） | EP-005、006×4、007、008a、008b×4、009、010、011、013×2 |
| M2 綁定前不做連線檢查 | EP-008b×4、009 |
| M3 綁定遇 `EADDRINUSE` 不重選 | EP-008a |
| M4 偵測到占用後不 `reselect` | EP-008a、008b×4、009 |
| M5 連線檢查漏掉 `::1` | EP-008b[::1]、012 |
| M6 `teardown` 不釋放預約 | EP-013×2 |
| M7 `origin` 由基準埠衍生 | EP-013×2 |
| M8 流程埠表重複 | EP-001 |
| M9 `e2e-setup` 直接 `listen` 並寫死埠 | EP-002、003、013[::]、014 |
| M10 `e2e-setup` 加入下殺原語 | EP-004 |
| M11 `e2e-setup` 寫死主機:埠 | EP-002 |
| M12 `OTHER_TEST_PORTS` 多列不存在之埠 | EP-003 |
| M13 新增寫死埠而未列入清單 | EP-003 |
| M14 `applyEnv` 改 `true` | EP-005 |
| M15 預約 root 改回專案根（殘留預約下殺可匹配） | EP-015（誘餌行程被函式庫下殺） |
| M16 `e2e-setup` 引入 `child_process` | EP-004 |
| M17 `e2e-setup` 呼叫 `noteOwn` | EP-004 |

  變異腳本（逐一以唯一字串替換 → 跑 `unit-e2ePorts` → 還原並比對雜湊）與結果存於該輪任務證據夾，不入庫；重做時對上表每列之「變異」重現即可。

### R-02 分割預覽（vditor ≥ 4 之 textarea 編輯區）之唯讀、貼上與提示區（2026-11-09 vd01，ADR-009）

- **規則**：
  1. 唯讀時，分割預覽之 textarea 須為「readOnly 且未 disabled」：`applyEditable` 與 `enforceLock` 於呼叫 vditor 之 `disabled()` 後呼叫 `lockSvEditor`（設 `readOnly`、解除 `disabled`）；解除唯讀時 `unlockSvEditor` 還原 `readOnly`。理由：vditor 之 `disabled` 使 textarea 無法 Tab 聚焦、無法選取，與唯讀同原生 readonly 之承諾不符。
  2. vditor 寫入 textarea 之路徑不受 readonly 限制者，唯讀時須在 `guardLock` 攔截。已知：paste（`ts/sv/index.ts:33-39` → `sv/process.ts:4-12` 之 `setRangeText`）→ `guardLock` 之 paste 分支（只攔編輯區本身為目標者）；drop（`ts/util/editorCommonEvent.ts:68-79`，僅 `Files`、`text/html` 走 `pasteCode`）→ 原有之 drop 攔截；keydown／input／composition → 原有攔截。
  3. 分割預覽不支援提示區（vditor 4 停用）：JSDoc `keyHint`、README 載明；`detectAndShowHint` 於分割預覽不偵測（防禦性，行為上與 vditor 隱藏提示元素等價）。
  4. 分割預覽取消選取不呼叫 `settings.unSelect`（上游行為，不補發）。
- **盤點指令**（可重跑）：
  1. 組件站點：Grep `isSvEditor|lockSvEditor|unlockSvEditor|isSvLocked|type === 'paste'|getCurrentMode\(\) === 'sv'` 於 `src/components/WVditorVue.vue`。
  2. vditor 設定 textarea 屬性之全集：Grep `sv.element.disabled` 於 `node_modules/vditor/src`（4.0.1：`index.ts:170、184`、`toolbar/Record.ts:38、59`、`upload/index.ts:257、265`、`undo/index.ts:55、74` 為讀取）；每處須判定唯讀時是否可達（`Record`、`upload` 為鎖定前已開始之功能，JSDoc `editable` 載明不在唯讀保證內）。
  3. vditor 寫入 textarea 值之全集：Grep `setRangeText|\.value = ` 於 `node_modules/vditor/src/ts/sv`、`src/index.ts`、`src/ts/util/fixBrowserBehavior.ts`，逐一對照 `guardLock` 是否攔截使用者可達之入口。
  4. 提示：Grep `currentMode === "sv"` 於 `node_modules/vditor/src/ts/hint`。
- **站點全集與判準**（2026-11-09 比對 vditor 4.0.1）：

| 站點 | 使用者可達之入口 | 判定 |
|---|---|---|
| paste（`sv/index.ts:33-39`） | 唯讀時 Tab 聚焦編輯區後 Ctrl+V | 已套（`guardLock` paste 分支）；`readonly` E2E-013 |
| drop（`editorCommonEvent.ts:68-79`） | 拖放頁面文字、檔案至編輯區 | 使用者不可達：唯讀之 textarea 與 contenteditable=false 之編輯區不接受拖放（`dragover` 未被接受，不發生 `drop` 事件）；變異 M6（`LOCK_EVENTS` 去掉 `drop`）`readonly` E2E-014 仍綠，故既有之 `drop` 攔截屬防禦性（保留，不刪）；E2E-014 以真滑鼠拖放守護可觀察不變式（可編輯時同一拖放會改動內容，2026-11-09 探測） |
| keydown／keyup／input／composition | 鍵盤、輸入法 | 已套（原有）；`readonly`、`readonly-focus` 各案 |
| toolbar（停用中按鈕） | 點擊 | 已套（原有） |
| Record／upload 改 `disabled` | 鎖定前已開始之功能 | 不在唯讀保證內（JSDoc） |
| 提示區 | 設 `keyHint` 後輸入觸發字串 | vditor 停用；`key-hint` E2E-009 |
| unSelect | 取消選取 | 上游不通知；`readonly-focus` E2E-007（分割預覽輪只斷言無新通知） |

- **對應測試**：`e2e-readonly` E2E-001、004、007、008、013 之分割預覽輪；`e2e-readonly-focus` E2E-001、002、005、006、007 之分割預覽輪；`e2e-key-hint` E2E-009。單檔指令：`npx mocha test/e2e-readonly.test.mjs --reporter spec --timeout 180000 --grep "分割預覽"`。
- **變異證明**（`spec/evidence/2026-11-09-vd01-upgrade-4.0.1.md` 第 4 節）：M1（不設 readOnly）9 案紅、M2（不攔 paste）E2E-013 紅、M3（不還原 readOnly）readonly E2E-004 紅；`detectAndShowHint` 之分割預覽檢查為防禦性、行為等價，無案例能單獨擊殺。
- **vditor 升版時**：重跑上列盤點 1～4；組件註解引用 vditor 原始碼行號（`vditor/src/...:行`），升版後須逐一核對並更新（本輪已依 4.0.1 更新）。

### R-03 預覽區之媒體連結安全（GHSA-x2mx-f527-mxr9；2026-11-09 vd01）

- **規則**：分割預覽之預覽區顯示指向影片或音訊之連結時，連結網址只能成為播放器之屬性值，其中之引號、空白與 `onerror` 等字樣不得被執行；`vditor` 相依須 ≥ 4.0.1（`package.json` 為 `^4.0.1`）；組件不改動 `preview.markdown.sanitize` 之預設（true）；測試與 spec 不寫使用端之專案名。
- **盤點指令**：
  1. 版本：`npm ls vditor`（須 ≥ 4.0.1）與 `node_modules/vditor/src/ts/markdown/mediaRender.ts` 之 `replaceMedia` 為 DOM 屬性設定。
  2. 站點：Grep `mediaRender` 於 `node_modules/vditor/src`（呼叫者：`ts/preview/index.ts:242`、`ts/markdown/previewRender.ts:151`、`method.ts`、`ts/export/index.ts:82`）。
  3. 組件未覆寫 `preview.markdown.sanitize`：Grep `sanitize` 於 `src/`（0 命中為合格）。
- **站點全集與判準**：

| 站點 | 說明 | 判定 |
|---|---|---|
| 分割預覽之預覽區（`preview/index.ts:242`） | 組件可達（`mode=sv`） | 已守護（`e2e-preview` E2E-001～004） |
| 預覽按鈕（工具列 `preview`） | 組件預設工具列不含（`def_settings.toolbar`），使用端自行加入時走同一 `previewRender.ts:151` | 同一函式，未另設案例 |
| 匯出 HTML（`export/index.ts:82`） | 匯出頁自帶 `Vditor.mediaRender` 呼叫，下載後於使用者機器開啟，行為同一函式 | 同一函式，未另設案例 |
| 所見即所得、即時渲染 | 不呼叫 `mediaRender`、不產生播放器 | 不適用 |

- **對應測試**：`test/e2e-preview.test.mjs`（`流程_預覽之媒體連結安全` E2E-001～004；4 案）。單檔指令：`npx mocha test/e2e-preview.test.mjs --reporter spec --timeout 180000`。
- **修前紅**（變異副本以 vditor 3.11.3 取代）：先產副本 `node tmp/vd01/make-mut-old.mjs`（腳本不入庫：讀 `src/components/WVditorVue.vue`，把 `import Vditor from 'vditor'` 與 `import 'vditor/dist/index.css'` 改為指向 `tmp/vd01/old/package/dist/`，舊版以 `npm pack vditor@3.11.3 --pack-destination tmp/vd01/pack` 解開至 `tmp/vd01/old`），再 `E2E_SRC_DIR=tmp/vd01/mut-old-vditor E2E_VDITOR_DIR=tmp/vd01/old/package npx mocha test/e2e-preview.test.mjs --reporter spec --timeout 180000`：E2E-001、002、004 紅（`"xss":1`），E2E-003 綠。2026-11-09 實測結果見 `spec/evidence/2026-11-09-vd01-upgrade-4.0.1.md` 第 6 節。
- **日後**：升 vditor 時重跑本流程；若新版再改 `mediaRender`，以 `spec/evidence/2026-11-09-vd01-xss-probe.json` 之三種輸入（超連結夾帶、Markdown 連結、正常連結）重探。

### 改動範圍 → e2e 檔（全域規範：跑受影響者；全套只在最末輪由主控跑）

| 改動範圍 | 必跑 | 理由 |
|---|---|---|
| 提示區（`.WPopperFix` 模板、`BuildPopper` 引用與 data、`keyHint`、`hideHint`、`insertValue`） | `e2e-key-hint` | 提示區之開啟、關閉、插入及鎖定、整份取代時關閉皆只在此檔設案例（其他五檔不設 `keyHint`） |
| `package.json` 相依升版（`w-component-vue`、`vditor`）、`WVditorVue.vue` 之 `mounted`／`beforeDestroy`／data 宣告 | 全部七檔；`dist` 重建者另以 `E2E_DIST_DIR=./dist` 跑 `e2e-key-hint`、`e2e-preview`；vditor 升版另依 R-02、R-03 重驗 | 掛載期錯誤影響所有流程之「主控台無錯誤」；vditor 之編輯區、提示、預覽行為隨版本變 |
| 分割預覽之唯讀（`lockSvEditor`、`unlockSvEditor`、`isSvLocked`、`guardLock` 之 paste）、`enforceLock`、`applyEditable` | `e2e-readonly`、`e2e-readonly-focus`（皆含分割預覽輪） | R-02 |
| 預覽區（`settings.preview`、vditor 預覽與媒體渲染） | `e2e-preview` | R-03 |
| `WVditorVue.vue` 之編輯與回傳、回寫判斷、唯讀鎖定、載入與銷毀 | 該流程檔（`editing`、`parent-update`、`readonly`、`readonly-focus`、`load`）及 `key-hint` | 單一元件，流程間共用 `loadValue`／`applyEditable` |
| `test/tools/e2e-setup.mjs`、`test/host/index.html`、`docs.json` | 全部七檔 | 共用基礎 |
| `test/tools/e2ePorts.mjs`、`e2eLib.mjs`（埠相關）、`e2ePortsOccupier.mjs`、`e2ePortsHolder.mjs` | `unit-e2ePorts`＋任一 e2e 檔（代表性：`e2e-load`；與外部占用者併用另見 R-E2E-PORT-01 情境驅動） | 靜態站埠之共用基礎 |
