# 2026-11-21 分割預覽唯讀編輯區在 Chromium 156 與 159 下對 PageDown 之行為（vv585）

起因：`e2e-readonly-focus` E2E-005〔分割預覽〕於 Chromium 159（headless shell revision 1255，playwright-core 1.65.1）紅：按 PageDown 後等不到「編輯區已捲動」；同案之所見即所得、即時渲染皆綠；Chromium 156（revision 1248，playwright-core 1.64.1）全綠。本檔記歸因與機制之實量。

探測腳本（本目錄，可重跑；以環境變數 `REV`＝瀏覽器修訂 1248｜1255、`MODE`＝wysiwyg｜ir｜sv、`LANGMODE`＝default｜none｜en-US、`STEPS`＝逗號分隔之按鍵序列選擇）：

- `2026-11-21-vv585-probe-vditor.mjs`：組件＋vditor（示範宿主頁，`doc=LONG`、唯讀），Tab 進入編輯區本身後依序按鍵，記錄捲動位置、插入點、頁面捲動。
- `2026-11-21-vv585-probe-native.mjs`：無 vditor、無組件之原生 `<textarea>`（60 行、程式設值）對照組。

腳本借用 `readonly-focus` 流程之靜態站（埠 8140、`test/_tmp/readonly-focus`），不可與 `e2e-readonly-focus` 同時執行。執行（本套件根目錄）：

```
REV=1248 MODE=sv STEPS="PageDown,Control+Home,PageDown" node spec/evidence/2026-11-21-vv585-probe-vditor.mjs
REV=1255 MODE=sv STEPS="PageDown,Control+Home,PageDown" node spec/evidence/2026-11-21-vv585-probe-vditor.mjs
REV=1248 node spec/evidence/2026-11-21-vv585-probe-native.mjs
REV=1255 node spec/evidence/2026-11-21-vv585-probe-native.mjs
```

## 1. 變因分離（以 `test/e2e-readonly-focus.test.mjs` 全檔，19 案）

| 格 | 相依 | 瀏覽器 | `navigator.language` | 結果 |
|---|---|---|---|---|
| (c) 原樣（lock） | w-package-tools-e2e 1.0.46／w-playwright 1.0.3／playwright-core 1.65.1 | 159.0.8154.6 | zh-TW（旗標組之 `--lang=zh-TW`） | 18 passing、1 failing（E2E-005 分割預覽） |
| (b) 去掉 `--lang` | 同 (c)，`launchBrowser({ lang:false })` | 159.0.8154.6 | en-US | 18 passing、1 failing（同案、同訊息） |
| (a) 舊版 | w-package-tools-e2e 1.0.45＋w-playwright 1.0.1／playwright-core 1.64.1 | 156.0.8078.4 | zh-TW | 19 passing |

唯一變因為瀏覽器二進位（156 → 159）；語系旗標不是變因（(b) 與 (c) 同紅）。

## 2. 組件＋vditor：分割預覽（`LONG`，唯讀，Tab 進入編輯區本身）

編輯區為 `textarea.vditor-sv`，`clientHeight` 262、`scrollHeight` 1506、底部內距 132px、最大捲動位置 1244、內容 236 字元。

| 時點 | 捲動位置 | 插入點（selectionStart） | 兩版是否相同 |
|---|---|---|---|
| 載入完成（尚未聚焦） | 0 | 236（文末；程式寫入 `value` 之結果） | 是 |
| Tab 聚焦後 | 1232（最大 1244，差 12px） | 236 | 是 |

自 Tab 聚焦後之狀態依序按鍵（捲動位置；插入點；頁面 `scrollY`）：

| 按鍵序列 | Chromium 156 | Chromium 159 |
|---|---|---|
| PageDown | 1232 → **1244**；236；0 | 1232 → **1232（不動）**；236 → **0**；頁面被捲動（0 → 108～446，隨宿主頁版面） |
| 再按 PageDown | 1244 不動；頁面被捲動 | 1232 → 1244；頁面不再動 |
| （自 Tab 聚焦後）Ctrl+Home | 自 PageDown 後之 1244 起量得 1244 → 0，插入點不變（236）；自 1232 起之全檔測試亦一次即到開頭 | 1232 → **1232（不動）**；236 → 0 |
| 再按 Ctrl+Home | — | 1232 → 0 |
| 已在開頭後 PageDown | 0 → 229 | 0 → 229 |
| 已在開頭後再按 PageDown | 229 → 458 | 229 → 458 |
| 已在 458 按 PageUp | 458 → 229 | 458 → 229 |
| （自 Tab 聚焦後）PageUp | 未測 | 1232 → 1133；插入點 236 → 196 |
| （自 Tab 聚焦後）ArrowUp | 未測 | 捲動不動；插入點 236 → 229 |
| （自 Tab 聚焦後）Home | 未測 | 全無變化 |

所見即所得、即時渲染（`contenteditable=false` 之 div）：載入後與 Tab 聚焦後捲動位置皆為 0（最大 1063）；PageDown 0 → 229，兩版相同；Ctrl+Home 229 → 0，兩版相同。

## 3. 對照組：無 vditor、無組件之原生 `<textarea>`（寬 600、高 260、60 行、以程式設 `value`、`readOnly`）

| 情形 | Chromium 156 | Chromium 159 |
|---|---|---|
| 唯讀、插入點在文末（程式設值之預設）：Tab 聚焦後 | 捲動位置 1060（＝最大）；插入點 583 | 同左 |
| 同上，PageDown | 捲動位置 1060 不動；插入點 583；頁面被捲動 787 | 1060 不動；插入點 583 → **0**；頁面被捲動 670 |
| 同上，再 PageDown／PageUp | 頁面再捲；PageUp 1060 → 829 | 頁面再捲；PageUp 1060 → 829 |
| 唯讀、插入點在開頭：PageDown ×2 | 0 → 231 → 462；插入點 0 | 0 → 226 → 446；插入點 0 → 84 → 187（插入點隨檢視移動） |
| 可編輯、插入點在文末：PageDown | 1060 不動；插入點 583；頁面被捲動 787 | 同左 |

## 4. 結論

1. 組件行為在 156 與 159 相同：keydown 不被攔下預設行為（`guardLock` 只 `stopPropagation`），編輯區可聚焦、可捲動（自文件開頭 PageDown 兩版皆 +229）。
2. 差異在瀏覽器對原生唯讀 textarea 之按鍵處理：插入點在文末且檢視已在底部時，159 之 PageDown 不再把檢視捲到底、改把插入點移到開頭並捲動頁面；Ctrl+Home 第一次只移插入點、不捲動檢視。對照組（無組件）同樣出現，故非組件之行為。
3. 原測試之 ② 在 156 通過，靠的是 Tab 聚焦後檢視離底尚有 12px（底部內距）之巧合，並非「編輯區可被 PageDown 捲動」之保證：分割預覽之編輯區聚焦時已在文末，本無可捲動量。
4. 處置：測試起點改為先連按 Ctrl+Home 回到文件開頭（前提斷言捲動位置為 0），再驗 PageDown 使捲動位置增加；② 之判準未放寬。
