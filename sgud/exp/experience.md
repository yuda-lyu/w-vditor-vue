# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.過長時抽出舊者為`experience_<年月日>.md`,並於本檔註明何時抽出.

## 2026-11-22 自 Claude Code 自動記憶提取之舊教訓（原記於 2026-08-19～2026-10-04；處理流程見 `sgud/proc/process.md`）

- **`extractHtml` 產出之範例 html 是 in-DOM template，camelCase prop 靜默失效**（2026-08-19）：`w-package-tools` 之 `extractHtml` 由 `.vue` 範例產出 `test-html/ex-*.html`，其為 in-DOM template（`new Vue({el:'#app'})` 直接解析既有 DOM），瀏覽器把屬性名全部小寫化，`:keyHint` 變 `:keyhint` 而對不上 prop，且**無任何錯誤訊息**——組件照常掛載，只有該 prop 恆為預設值。`extractHtml` 並未串接 `kebabPropsVueTemp`，須於 `toolg/gExtractHtml.mjs` 之 `getAppTmp()` 自行包 `kebabPropsVueTemp(v.tmp)`（現況已套，檔內有註解）；它只作用於 template（不含 head／script），實測不傷 `style="font-size:1.5rem;"`、`v-slot:content=`、`@click="a(); b();"`。凡 prop 有多字 camelCase（`keyHint`、`hintBorderRadius`…）者新增範例後，驗收須對產出之 html 實跑瀏覽器看該 prop 之行為，不能只看頁面有渲染出來。
- **提示區（hint）不改用 w-component-vue 之 WPopup／WTooltip**（2026-08-19 決議維持現況，2026-11-22 重驗仍成立）：提示區外層 `.WPopperFix` 直接由 `buildPopper.mjs` 驅動（`BuildPopper`，規則帳本 R-01），錨點是 vditor 執行期依游標位置產生之 `div.vditor-hint`（`WVditorVue.vue` 之 `funGetDivTrigger` 以 `vo.$el.querySelector('[class="vditor-hint"]')` 取得）。`WTooltip.vue` 之 `funGetDivTrigger()` 寫死回傳其自身 template 內包住 `trigger` slot 之 `$refs.divTrigger`，props 沒有任何一個能注入外部錨點元素；要改須動上游加 `triggerElement`／`funGetTrigger` prop，或在本組件內做「影子 trigger」再同步位置（比現況更複雜易失準）。另三項差異（就算解決錨點也要處理）：WPopup 內容走 `Teleport to="body"`（現況留在組件內）；WPopup 之 slot props 只有 `funHide`，缺本組件特有之 `hint`（哪個 keyHint 觸發）與 `funInsert`（把選中值插回編輯器）；預設外觀不同（WTooltip 預設底色 `rgba(60,60,60,0.75)` 深色，本組件 `hintBackgroundColor` 預設 `#fff`），換過去會改動既有 UI。
- **唯讀類問題先列「焦點進入途徑 × 事件 × 模式」全表再設計**（2026-10-04）：唯讀之第三、四輪修改都漏格；現行定案見 ADR-004、ADR-005 與 `spec/流程_唯讀時之焦點.md`。
- **審查期間不改受審檔**（2026-10-04）：第五輪（載入中關閉之殘留）三方審查（兩位 Opus、一位 GPT sol）期間，我先改了受審之 `WVditorVue.vue`，sol 讀到新內容致 canary 失敗，部分意見針對改後版本而非送審版本。教訓：派審未回報前，不改受審之檔（原始碼與測試）。

## 2026-11-25 全庫連動後 `e2e-readonly-focus` E2E-005〔分割預覽〕整檔轉紅（任務 tvd619；規則見 `sgud/rule/rulebook.md` R-04 第 2、5 點；證據 `spec/evidence/2026-11-25-tvd619-smooth-scroll.md`）

- **二分第一步：先在「舊版」暫存副本重現，不是先換依賴**。兩個連動提交各 `git archive` 到暫存夾、各自 `npm ci`，整檔 e2e：舊版亦紅，即排除依賴升版，不必再逐一換套件。逐套件 `diff -rq` 兩副本之 `node_modules/<套件>/src` 全相同（只有 `dist` 與 `package.json` 差），也證明這輪連動對測試路徑無實質變更。
- **「整檔紅、`--grep` 單跑綠」先量成敗機率，不要立刻推論前置案留了狀態**：每案全新瀏覽器，前置案不可能留狀態；本案之 4 種前置案組合皆紅、單跑偶綠，實為機率事件（連跑 10 次紅 8）。單次結果不能當結論，連跑 10 次取失敗率。
- **時序競賽之取證法**：探針以頁內 4ms 計時器記錄（捲動位置、插入點）之變化時刻，並於每個按鍵前後標記時刻，即可看出「位置讀到 0 之後 2ms 才按 PageDown」；再以參數化變體（讀到即按／等 100、300、600ms／連續 N 幀不變）各連跑數次，比較成敗率。加診斷用之固定等待與多餘 `evaluate` 會改變時序（本輪單跑 E2E-005 因此由綠轉紅），探針應另寫腳本，不要改被測案例。
- **Chromium 之鍵盤捲動是平滑捲動**：Ctrl+Home 自 1232 捲到 0 約 170ms；`scrollTop` 讀到目標值後 1～3ms 內送下一個捲動鍵，實測會被吞掉（編輯區與插入點皆不動；「該幀動畫尚未結束」為推定，未讀 Chromium 原始碼）。同步條件用「捲動位置連續數幀不變」（`waitScrollSettled`，頁內 `requestAnimationFrame`；1 幀不夠——動畫開始前就判靜止於起點，2、3 幀無差別，取 3），不用「位置到達目標」；`--disable-smooth-scrolling` 可證明因果（A 變體 4／4 綠）。
- **`page.waitForFunction` 之預設輪詢為 `requestAnimationFrame`**：`waitUntilExist` 一讀到條件成立即返回，與「該幀內動畫剛好結束」同步，使「讀到即按」之間隔只有 1～3ms，正是競賽窗。凡以「位置／尺寸到達」為條件、緊接送鍵或點擊者，皆須問「到達那一刻動畫是否已結束」。
- **為何先前各輪皆綠仍未證實**：現行環境下原序列通過率約 1／11；先前之全套 `--parallel` 同時 7 個瀏覽器、機器負載、作業系統動畫設定、工作階段連線狀態皆可能改變失敗機率，無法重建。回報時只寫「機率事件、環境相依」，不寫成已證之成因。
- **暫存副本 `npm ci` 之陷阱**：①使用者之 npm 設定有 `min-release-age=7`，其排除清單（`wsemi`、`w-*`）對鎖檔內傳遞相依之版本不生效，近 7 天發布之自有套件版本會 `ETARGET`；對該次指令加 `--min-release-age=0`（版本由鎖檔 integrity 固定，只用於暫存副本）。②共用 npm 快取內容檔遺失時報 `ENOENT … _cacache`，改以 `--cache <暫存夾內私有路徑>`，不動使用者全域快取。
- **`quiet-run`（cmd）傳中文 `--grep` 會亂碼而 0 案**：選案用 ASCII（`E2E-005`），不用 `E2E-005 [分割預覽]`。
- 守門：副本測試以 `NODE_OPTIONS=--import=<守門模組 file URL>` 掛解析守門；須同時允許主控工具之目錄（`quiet-run` 自身之模組），否則 `quiet-run` 被擋。
- 變異（M1、M2）以修後之測試重跑仍紅，見 R-04。

## 2026-11-21 瀏覽器升至 Chromium 159 後分割預覽 PageDown 案紅（任務 vv585；規則見 `sgud/rule/rulebook.md` R-04）

- **先分離變因再動手**：相依升版同時換了瀏覽器修訂（156 → 159）與旗標組（新增 `--lang=zh-TW`）。三格對照（原樣、去掉 `--lang`、暫換舊相依）即得：紅只隨瀏覽器二進位而變，語系不是變因。對照要跑「同一份測試全檔」，不只是單案，才看得出是否僅此一案。
- **有「分割預覽才紅、其餘兩模式綠」之差別時，先在無組件之原生元素上重現**：本案以 60 行 `<textarea readonly>` 加程式設值，即重現 159 之 PageDown 行為改變（插入點移到開頭、檢視不捲）；原生同樣變動即可判為瀏覽器行為，不必讀組件。探測腳本留在 `spec/evidence/`（探測 `REV` 以 `executablePath` 指向舊 headless shell，不必換相依）。
- **舊測試通過是巧合**：分割預覽之 textarea 以程式寫入內容，插入點在文末；Tab 聚焦即捲到近底（捲動位置 1232／最大 1244，底部內距 132px 使差 12px），原案 PageDown 靠這 12px 通過。斷言「某鍵使捲動位置增加」前，先量起點是否有可捲動量。
- **Chromium 159 之唯讀 textarea，插入點與檢視不同步時，Ctrl+Home 第一次只移插入點、不捲動檢視，第二次才捲到開頭**（156 一次即到）；輔助以「連按直到捲動位置為 0」（`homeUntilTop`）而非固定次數（2026-11-25 起改為每次按後等捲動靜止，見上條 tvd619）。
- **以 `npm i … --no-save` 暫換舊瀏覽器之陷阱**：`w-package-tools-e2e@1.0.45` 之相依要求 `w-playwright ^1.0.2`，npm 把 1.0.3 與 playwright-core 1.65.1 巢狀裝在 `node_modules/w-package-tools-e2e/node_modules/` 下，根層之 `w-playwright@1.0.1` 變成 extraneous 而不生效（仍啟動 159）。須移除該巢狀兩個目錄（先確認無目錄連結），並以 `launchBrowser()` 印 `browser.version()` 確認為 156 才算換成；還原用 `npm ci --min-release-age=0`（約 4 分鐘）並以 `npm ls` 核對。
- 變異證明（M1 阻止 PageDown 預設行為、M2 分割預覽 `overflow:hidden`）見 R-04；M2 紅在「回到開頭」之前提而非 ②，因編輯區連 Ctrl+Home 都捲不動。

## 2026-11-09 vditor 3.11.3 升 4.0.1（任務 vd01；規則見 `sgud/rule/rulebook.md` R-02、R-03）

- **跨主版號升 vditor 時，先只升版不改碼跑全套，再把「找不到元素」與「行為變了」分開**：4.0.1 之分割預覽編輯區由 contenteditable 改為 textarea，36 案分割預覽輪全因測試輔助之 `.vditor-reset[contenteditable]` 找不到而逾時（非產品壞）；輔助改為同時認 textarea 後才露出 10 案真差異（停用之 textarea 不能聚焦、選取，唯讀須以 `readOnly` 實現並在 `guardLock` 攔 paste，因 `setRangeText` 不受 readonly 限制；4.0 起分割預覽無提示區、不通知 `unSelect`，皆為上游行為，探測確認後依封裝權責不補發）。XSS 案例須先探測有效載荷（超連結夾帶 `onerror` 有效，Markdown 連結語法被淨化為 `%22` 無效），並以變異副本（`import` 改指 3.11.3 之 `dist` 加 `E2E_VDITOR_DIR` 供應同版 lute）證明修前紅；等載入失敗以 `video.error !== null` 為同步點。細節見 `spec/evidence/2026-11-09-vd01-upgrade-4.0.1.md`。

## 2026-11-05 e2e 靜態站自動換埠（排程第 309 項，任務 vd309；規則見 `sgud/rule/rulebook.md` R-E2E-PORT-01）

- **Windows 下 `listen(port,'127.0.0.1')` 遇占用者綁 `0.0.0.0`／`::`（雙棧預設）／`::1` 不報 `EADDRINUSE`，而是並存，且新連線由更具體的 `127.0.0.1` 者（我們）接走。** 只有占用者也綁 `127.0.0.1` 才報。所以盤點寫的「被占用即拋錯，不誤打」只對一種占用者成立；其餘情形是「測試全綠，同時搶走對方 127.0.0.1 之新連線」（修前實測：`::` 占用時 `e2e-load` 35 passing，驅動每 300 ms 對該埠發新連線，319 次被我們的 404 接走）。偵測空閒用實際綁定（`reserveE2ePorts` 內建，四種位址皆試），綁定前再以連線檢查（`isPortAnswering`，對 `127.0.0.1`、`::1` 發新連線）補「預約後被搶走」之窗口。
- **驗「新連線被誰接走」必須每次用新連線**：Node 預設 keep-alive，同一個 `http.get` agent 會重用與占用者之舊連線，使探測永遠回占用者（第一次診斷因此看到「被接走 0 次」，是假象）。探測用 `agent:false` 加 `connection: close`。
- **`mocha --parallel` 下六個流程是各自行程內之獨立服務，彼此不相連**：不用 `E2E_PORT_OFFSET`（寫環境變數會讓同一 worker 後續檔共用位移），改每流程 `reserveE2ePorts([基準埠], { applyEnv: false })`，實際埠取 `portOf`。`applyEnv:false` 仍以環境變數 `E2E_PORT_OFFSET` 為起選位移，多開工具指定位移時自動配合。
- **預約要放在編譯之後、綁定之前緊接**：`setup()` 的 rollup 編譯要數秒，預約放前面則「偵測空閒」到「綁定」之間隔數秒。
- **單元測試要能與並行中之 e2e 檔同跑，故不得占用真實流程埠（8136～8141）**：基準埠改用作業系統配發之動態空閒埠 P（保證 P、P+100、P+200 空閒；配發值接近 65535 時折回 20000～50000，仍以實際綁定驗證），期望值由 P 推得；`createFlow` 加 `opt.basePort`／`opt.reserve`／`opt.listen` 接縫（流程代號只用來命名 `test/_tmp/<代號>`，單元測試用獨立代號，免刪到並行中 e2e 檔的編譯目錄）；以 `E2E_DIST_DIR` 指向假 dist（`setup()` 開頭同步讀環境變數，之後即可還原）避開編譯。預約目錄以 `opt.reserve.regDir` 隔離、環境以 `opt.reserve.env = {}` 隔離。
- `describePortOwners`（PowerShell 查占用者）每次 1～3 秒，單元測試因此約 2 分鐘；它只在「偵測到占用」那一支路徑才呼叫，沒占用時零成本。
- 單元測試之 `freeBase` 第一版遇 OS 配發值 > 64000 就 `continue`，Windows 配發逐次遞增，連續 40 次都落在高位，整批案例找不到基準埠而紅（連續 5 案）；改為折回而非丟棄。
- **模擬「持有者被強制終止、其子行程仍存活」要用 `detached: true` 起子行程**：libuv 在 Windows 把非 detached 的子行程放進隨父行程結束而關閉的 job，父被 `TerminateProcess` 時子行程一併被殺，測不到「殘留之存活行程」（EP-015 第一版誘餌行程隨持有者一起死而紅）。夾具 `test/tools/e2ePortsStaleHolder.mjs` 即此作法。
- **函式庫唯一自動下殺路徑是「殘留預約回收」**（`reserveE2ePorts` 在回收到同 `root`、`known` 非空之殘留預約時，依其記下的身分下殺）；`known` 只由 `noteOwn` 寫入。本套件不呼叫 `noteOwn`，且預約 `root` 用專屬名稱（`RESERVE_ROOT`，不用專案根路徑），雙重使其永不匹配。變異 M15（root 改回預設）實測：誘餌行程被函式庫下殺、EP-015 轉紅。
- **變異測試時被測碼的缺陷會讓測試洩漏 server，使 mocha 不結束而拖到 harness 逾時**（第一次變異 M2 因 EP-009 預期拋錯卻綁定成功、server 未關而卡 15 分鐘）：測試的 `finally` 必須關閉「預期失敗卻成功」所得到的資源；變異 harness 加 `--exit` 與較短逾時。強制中斷變異 harness 後，被暫時改寫的檔須自備份還原並比對雜湊（開跑前先備份）。
- 修前紅要在**動手改碼前**對現況碼跑（本輪三項：`::` 占用全綠但搶走新連線；`127.0.0.1` 占用 `e2e-load` 1 failing；全套 parallel 同時占 8136（`::`）與 8139（`127.0.0.1`）得 131 passing／1 failing）。

## 2026-11-01 w-component-vue 2.5.35 之 buildPopper 必備鍵（Gitea #36，任務 vd36）

- **以原始碼引用 w-component-vue 內部模組時，其必須鍵改版即須同步。** 本元件 `import BuildPopper from 'w-component-vue/src/js/buildPopper.mjs'`，BuildPopper 檢查呼叫端 vo 須預先宣告之鍵（`_keys`）。2.5.35 新增 `state`，本元件 data 未宣告 → `mounted` 內 `new BuildPopper` 拋 `invalid vo.state`。依賴下限 `^2.5.34` 使新安裝者取得 2.5.35 而中招。**dist 驗證抓不到**（dist 內嵌打包當時之舊版），所以升 w-component-vue 後必須以原始碼編譯跑 e2e（本套件 e2e 預設即由 src 編譯）。盤點與站點見 `sgud/rule/rulebook.md` R-01。
- **影響面比建議檔所述更廣**：`new BuildPopper` 於 `mounted` 無條件建立，不分有無 `keyHint`；掛載一律拋錯。未設觸發字串者編輯器照常可用（`core()` 在 BuildPopper 之前已啟動），只在主控台留一筆錯誤，所以症狀只在「斷言主控台無錯誤」或設了 `keyHint` 時才被看到。
- **派工文字與原始碼不一致時以原始碼為準**：派工提示寫 state 值域含 `hiding`，實讀 w-component-vue 2.5.35：值域為 hidden／opening／opened，關閉無過場、由 opened（開啟中途關閉則 opening）直接成為 hidden，不使用 hiding（`buildPopper.mjs:62`、`:448`、`:472` 註解；`WTooltip.vue` JSDoc）。實測序列亦無 hiding（`spec/evidence/2026-11-01-vd36-post-fix.json`）。
- **state 轉換用 MutationObserver 記錄，不用輪詢取樣**：`startHintStateRecorder` 以 MutationObserver 只讀記錄 `.WPopperFix` 之 `state` 屬性每次變化，序列斷言恰為 `['opening','opened','hidden']`，並於關閉後留 0.6 秒負向觀察窗（涵蓋過場追蹤器後備訊號 200＋300 ms）。20 ms 輪詢可能漏掉過渡值。`waitHintState(page,'hidden')` 之初始值本身就是 hidden，須在已等到 opened（並點擊關閉）之後才呼叫，否則立即通過。
- **opening 約 0.18～0.2 秒**：實測 `hidden`（t≈8ms）→ `opening`（t≈140ms 顯示）→ `opened`（t≈324ms）→ 點擊關閉後 `hidden`；`transitionTime` 為 200。
- **變異副本作法**：`E2E_SRC_DIR` 指向 `./tmp/<任務>/mut-<名>/`（只放變異後之 `WVditorVue.vue`），其 `import 'w-component-vue/…'` 由祖先目錄（repo 根）之 `node_modules` 解析，不必複製相依；以腳本由現行 src 產生並要求每個替換恰命中 1 次。
- **驗證 dist**：本套件 e2e 預設由 src 編譯，不碰 `dist`；`E2E_DIST_DIR=./dist` 改以現成 dist 供應（`test/tools/e2e-setup.mjs` 之 `getDistDir`），`teardown` 不會刪它。重建 dist：`node toolg/gDistRollupComps.mjs`（約 7 秒）；`dist` 受版控，重建會使 `dist/*.umd.js(.map)` 出現在 diff。
- `npm install w-component-vue@^2.5.35` 會順手把 `package.json` 補上結尾換行（原無）並微調 `package-lock.json`；`quiet-run` 包住 npm 指令，輸出才不佔對話。
