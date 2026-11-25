# 2026-11-25 `e2e-readonly-focus` E2E-005〔分割預覽〕於全庫連動後整檔轉紅之歸因（tvd619）

結論：測試之同步條件缺陷（時序競賽），與依賴升版、組件、vditor 皆無關。Chromium 對鍵盤觸發之捲動（Ctrl+Home、PageDown 等）採平滑捲動（約 170ms 之動畫）；測試以「捲動位置為 0」為回到開頭之同步點，位置讀到 0 後 1～3ms 內按 PageDown，實測該次按鍵被吞掉（編輯區不動、插入點不動）。同一案例之成敗取決於按鍵與動畫末幀之相位，非固定失敗。

分清楚：**實測事實**＝讀到 0 後 1～3ms 內按 PageDown 紅 10／11；晚 ≥100ms 或「連續數幀不變」後按皆綠；啟動旗標加 `--disable-smooth-scrolling` 皆綠。**推定**＝「該幀動畫尚未結束，瀏覽器忽略此時之鍵盤捲動」屬瀏覽器內部行為，未讀 Chromium 原始碼證實。

探測腳本：`2026-11-25-tvd619-probe.mjs`（以環境變數 `PROBE_ROOT` 指向套件根，任一提交之副本皆可——變體 A、B、E、F、G 內建「位置為 0 即按」之舊判準，不呼叫該根之 `homeUntilTop`；`VARIANTS`、`REPS`、`LAUNCH_ARGS`；與 `e2e-readonly-focus` 共用埠，不可同時執行）。

## 1. 二分：舊版相依組亦紅，「舊綠新紅」未重現

兩份暫存副本（`git archive` 取兩個連動提交，各自 `npm ci`，副本內自建 `node_modules`、不建目錄連結；解析守門確認未解析到副本之外）：

| 副本 | 相依組 | `e2e-readonly-focus` 整檔 |
|---|---|---|
| 連動前提交 | w-component-vue 2.5.71、wsemi 1.9.76、w-package-tools 1.1.30、w-package-tools-e2e 1.0.52、w-playwright 1.0.4、w-jsonview-tree 1.0.46 | 18 passing、1 failing（E2E-005〔分割預覽〕：`waitUntilExist 超過 10000ms 仍找不到「編輯區已捲動」`） |
| 連動後提交（現行） | w-component-vue 2.5.72、wsemi 1.9.77、w-package-tools 1.1.31、w-package-tools-e2e 1.0.53、w-playwright 1.0.5、w-jsonview-tree 1.0.47 | 同左（主控之重跑紀錄三次皆紅，不入庫）；本輪於正式 repo 未改動之測試上，E2E-005 三模式連跑 10 次，分割預覽輪紅 8、綠 2，另整檔 1 次綠；此相依組之暫存副本未另跑整檔（相依與程式同正式 repo） |

- 兩副本之 playwright-core 皆 1.65.1、瀏覽器皆為同一份 Chromium 159.0.8154.6（headless shell revision 1255）。
- 逐套件比對兩副本 `node_modules` 之 `src/`：w-component-vue、wsemi、w-package-tools、w-package-tools-e2e、w-playwright、w-jsonview-tree 皆**逐檔相同**（`diff -rq` 無輸出），vditor 之 `dist` 亦相同；差異只在各套件重建之 `dist` 與 `package.json`。測試之編譯與執行路徑（`w-package-tools/src/rollupFiles.mjs`、`w-package-tools-e2e/src/*`、`w-playwright/src/*`）無任何差別。
- 主控原記連動項目未列 w-playwright 1.0.4 → 1.0.5（`package-lock.json` 有，`src/` 無差別）。

## 2. 失敗之表象與相依於「前面有案先跑」之假象

- 整檔紅、`--grep "E2E-005"` 單跑曾綠：不是前置案留下狀態（每案全新瀏覽器），是成敗本來就是機率事件。正式 repo 於未改動之連動後提交上連跑 E2E-005（三模式）10 次：分割預覽輪 **紅 8、綠 2**（另整檔 1 次綠）；探針變體 A（與原測試同序列）共 11 次：**綠 1、紅 10**。
- 前置案（001、002、003、004 各自）+ 005 之四種組合皆紅，與單跑 005 之差別只在機率之抽樣。

## 3. 機制（實測事實與推定分列）：平滑捲動剛結束時緊接著按 PageDown 被吞

探針於分割預覽（`LONG`、唯讀，Tab 聚焦編輯區本身後）每 4ms 取樣捲動位置，並標記按鍵時點（單位 ms，自取樣起算）。原測試序列（變體 A：Ctrl+Home 連按至多 5 次→`waitUntilExist` 捲動位置為 0→按 PageDown）之一次紅例：

| 時點 | 事件 |
|---|---|
| 1 | Ctrl+Home 第 1 次（只移插入點，捲動位置維持 1232） |
| 16～18 | `homeUntilTop` 連按 5 次已結束（5 次共約 17ms；回傳 false，因按後立即讀仍為 1232） |
| 19～169 | 捲動位置 1232 → 1146 → 1007 → 808 → 576 → 352 → 171 → 54 → 3 → **0**（平滑捲動，約 150ms） |
| 170 | `waitUntilExist` 讀到 0（動畫之末幀） |
| 172 | 按 PageDown |
| 其後 1500ms | 捲動位置維持 0、插入點維持 0（PageDown 無作用） |

不同按鍵間隔之結果（分割預覽，每格連跑次數見括號）：

| 變體 | 回到開頭後之同步條件 | 按 PageDown 之時點 | PageDown 後捲動位置 > 0 |
|---|---|---|---|
| A（原測試） | 捲動位置為 0（讀到即按） | 讀到後約 1～3ms | 1／11 |
| E | 同上，再等 100ms | 末幀後約 110ms | 3／3 |
| F | 同上，再等 300ms | 約 310ms | 3／3 |
| B | 同上，再等 600ms | 約 610ms | 3／3 |
| C | 每次 Ctrl+Home 後等 300ms 再判斷 | 約 300ms | 3／3 |
| H1、H2、H3 | 每次 Ctrl+Home 後等「捲動位置連續 1、2、3 幀不變」，為 0 即止 | 末幀後約 1～3 幀 | 各 5／5 |
| A，但啟動旗標加 `--disable-smooth-scrolling` | 同 A | 同 A | 4／4（無動畫，Ctrl+Home 一次即到 0；`homeUntilTop` 回 true） |
| H1、H2、H3，加 `--disable-smooth-scrolling` | 同上 | 同上 | 各 5／5 |

- 所見即所得、即時渲染之編輯區為 `contenteditable=false` 之 div，自開頭起算，Ctrl+Home 無捲動、無動畫，故不受影響（兩模式於紅例中皆綠）。
- 組件未攔 PageDown（`guardLock` 只 `stopPropagation`，R-02／R-04）；探針未載入任何組件修改。
- 為何先前各輪皆綠，**未能證實**：上述機率行為在現行環境（空閒、Chromium 159）下 A 約 1／11 通過；先前之綠（2026-11-21 起數輪全套）時之機器狀態無法重建。已知本機之瀏覽器回報 `prefers-reduced-motion` 為 no-preference（`matchMedia('(prefers-reduced-motion: reduce)').matches` 為 false），Windows 之動畫效果為開（`UserPreferencesMask` 9E1E078012000000、`MinAnimate` 1），執行此工作之使用者工作階段為「已中斷連線」狀態（`qwinsta`）；Chromium 之平滑捲動是否因作業系統之動畫設定或遠端連線狀態而開關，與按鍵時點之負載抖動（全套 `--parallel` 同時 7 個瀏覽器時按鍵延遲較大），皆可能使失敗機率隨環境改變，但本輪未能在受控條件下證實。可證實者為：只要同步條件改為「捲動靜止」，在平滑捲動開、關兩種條件下皆通過。

## 4. 修法與驗證

- `test/tools/e2e-setup.mjs`：新增 `waitScrollSettled(page, frames = 3, timeout = 5000)`（頁面內以 `requestAnimationFrame` 觀察捲動位置連續 `frames` 幀不變，回傳靜止時之位置；逾時回 null 僅防懸置）；`homeUntilTop` 改為每次 Ctrl+Home 後等捲動靜止，靜止於 0 才回 true。
- `test/e2e-readonly-focus.test.mjs` E2E-005：以 `assert.strictEqual(await homeUntilTop(page), true)` 取代「`homeUntilTop` ＋ `waitUntilExist` 捲動位置為 0」。
- 修前：正式 repo E2E-005 三模式連跑 10 次，分割預覽輪紅 8；整檔三次紅（主控之重跑紀錄，不入庫）。
- 修後：同法連跑 10 次，**全綠 10／10**；整檔連跑 5 次，各 19 passing；套用同一修法之連動前副本（舊相依組）整檔 19 passing。關閉平滑捲動之驗證：於該副本之 `launchBrowser` 包裝加 `--disable-smooth-scrolling`（暫存副本專用，不入庫），E2E-005 三模式連跑 3 次各 3 passing；旗標確實生效另由探針佐證（變體 A 加該旗標之取樣時間軸只有 1～2 筆變化，即無動畫）。
- 變異（程式碼）：以 `E2E_SRC_DIR` 指向變異副本，修後之測試仍轉紅——M1（鎖定時對 `PageDown` 阻止預設行為）三模式紅（逾時於「編輯區已捲動」）、M2（分割預覽唯讀時 `overflow:hidden`）分割預覽輪紅（`homeUntilTop` 回 false 之前提斷言）、其餘兩模式綠，見 `sgud/rule/rulebook.md` R-04。
- 變異（同步條件）：還原整段修法（`homeUntilTop` 改回按後即讀位置、起點改回以 `waitUntilExist` 等位置為 0）即為修前版本，分割預覽輪 8／10 紅。
- 幀數取捨：H1 於動畫開始前即判定「靜止於 1232」而多按一次 Ctrl+Home（5 輪皆 `hu` 為 3），H2、H3 皆 `hu` 為 2、成敗同為 5／5；故不取 1 幀，2 與 3 幀無可觀察之差別，取 3 幀保留餘裕（約 50ms，遠小於人手按鍵間隔，亦遠小於 5 秒逾時）。
- 產品影響：無。以人手按鍵之間隔（數百毫秒以上）不會落入動畫末幀；組件、`dist` 皆無改動。
