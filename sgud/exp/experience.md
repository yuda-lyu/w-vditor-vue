# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.過長時抽出舊者為`experience_<年月日>.md`,並於本檔註明何時抽出.

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
