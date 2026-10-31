# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.過長時抽出舊者為`experience_<年月日>.md`,並於本檔註明何時抽出.

## 2026-11-01 w-component-vue 2.5.35 之 buildPopper 必備鍵（Gitea #36，任務 vd36）

- **以原始碼引用 w-component-vue 內部模組時，其必須鍵改版即須同步。** 本元件 `import BuildPopper from 'w-component-vue/src/js/buildPopper.mjs'`，BuildPopper 檢查呼叫端 vo 須預先宣告之鍵（`_keys`）。2.5.35 新增 `state`，本元件 data 未宣告 → `mounted` 內 `new BuildPopper` 拋 `invalid vo.state`。依賴下限 `^2.5.34` 使新安裝者取得 2.5.35 而中招。**dist 驗證抓不到**（dist 內嵌打包當時之舊版），所以升 w-component-vue 後必須以原始碼編譯跑 e2e（本套件 e2e 預設即由 src 編譯）。盤點與站點見 `sgud/rule/rulebook.md` R-01。
- **影響面比建議檔所述更廣**：`new BuildPopper` 於 `mounted` 無條件建立，不分有無 `keyHint`；掛載一律拋錯。未設觸發字串者編輯器照常可用（`core()` 在 BuildPopper 之前已啟動），只在主控台留一筆錯誤，所以症狀只在「斷言主控台無錯誤」或設了 `keyHint` 時才被看到。
- **派工文字與原始碼不一致時以原始碼為準**：派工提示寫 state 值域含 `hiding`，實讀 w-component-vue 2.5.35：值域為 hidden／opening／opened，關閉無過場、由 opened（開啟中途關閉則 opening）直接成為 hidden，不使用 hiding（`buildPopper.mjs:62`、`:448`、`:472` 註解；`WTooltip.vue` JSDoc）。實測序列亦無 hiding（`spec/evidence/2026-11-01-vd36-post-fix.json`）。
- **state 轉換用 MutationObserver 記錄，不用輪詢取樣**：`startHintStateRecorder` 以 MutationObserver 只讀記錄 `.WPopperFix` 之 `state` 屬性每次變化，序列斷言恰為 `['opening','opened','hidden']`，並於關閉後留 0.6 秒負向觀察窗（涵蓋過場追蹤器後備訊號 200＋300 ms）。20 ms 輪詢可能漏掉過渡值。`waitHintState(page,'hidden')` 之初始值本身就是 hidden，須在已等到 opened（並點擊關閉）之後才呼叫，否則立即通過。
- **opening 約 0.18～0.2 秒**：實測 `hidden`（t≈8ms）→ `opening`（t≈140ms 顯示）→ `opened`（t≈324ms）→ 點擊關閉後 `hidden`；`transitionTime` 為 200。
- **變異副本作法**：`E2E_SRC_DIR` 指向 `./tmp/<任務>/mut-<名>/`（只放變異後之 `WVditorVue.vue`），其 `import 'w-component-vue/…'` 由祖先目錄（repo 根）之 `node_modules` 解析，不必複製相依；以腳本由現行 src 產生並要求每個替換恰命中 1 次。
- **驗證 dist**：本套件 e2e 預設由 src 編譯，不碰 `dist`；`E2E_DIST_DIR=./dist` 改以現成 dist 供應（`test/tools/e2e-setup.mjs` 之 `getDistDir`），`teardown` 不會刪它。重建 dist：`node toolg/gDistRollupComps.mjs`（約 7 秒）；`dist` 受版控，重建會使 `dist/*.umd.js(.map)` 出現在 diff。
- `npm install w-component-vue@^2.5.35` 會順手把 `package.json` 補上結尾換行（原無）並微調 `package-lock.json`；`quiet-run` 包住 npm 指令，輸出才不佔對話。
