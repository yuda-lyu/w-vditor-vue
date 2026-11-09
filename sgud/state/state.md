# 狀態（現況）— w-vditor-vue

本檔只記現況，不寫過程（過程寫入 `sgud/exp/experience.md`）。規則帳本為藍圖（`sgud/rule/rulebook.md`），與本檔比對即知尚未做到者。

- 套件：以 Vue 2 封裝 vditor 4.0.1 之 Markdown 編輯器組件 `WVditorVue`（`src/components/WVditorVue.vue`）。`package.json` 版本 1.0.31（本輪未改版、未發布）。
- 相依：`w-component-vue ^2.5.44`、`vditor ^4.0.1`（2026-11-09 由 `^3.11.3` 升，GHSA-x2mx-f527-mxr9）、`wsemi ^1.9.51`；測試用 `w-package-tools-e2e ^1.0.23`（含 `reserveE2ePorts`）。vditor 之 LICENSE（`node_modules/vditor/LICENSE`）為 MIT。
- 最近一次驗證：2026-11-09（vd01）全套 `npm test`（`quiet-run --lock`）183 passing、0 failing、0 pending（見下〈2026-11-09 vditor 升 4.0.1〉；該輪末次全套數字以最末一行為準）。前次 2026-11-05（vd309）：180 passing（e2e 157＋單元 23）。`dist` 尚未以 4.0.1 重建（`dist/`、`docs/` 本輪不手改，重建與發布由主控處理）。

## 功能與流程

| 功能（流程） | spec | 測試檔（passing 數） | 規則帳本條目 | 狀態 |
|---|---|---|---|---|
| 編輯器載入與關閉 | `spec/流程_編輯器載入與關閉.md`（27 案例） | `test/e2e-load.test.mjs`（35） | e2e 映射 | 完成；已知落差見該 spec |
| 編輯與回傳 | `spec/流程_編輯與回傳.md`（12） | `test/e2e-editing.test.mjs`（34） | e2e 映射 | 完成；已知落差見該 spec |
| 頁面更新內容 | `spec/流程_頁面更新內容.md`（10） | `test/e2e-parent-update.test.mjs`（25） | e2e 映射 | 完成；已知落差見該 spec |
| 唯讀鎖定 | `spec/流程_唯讀鎖定.md`（14；2026-11-09 增 E2E-013 貼上、E2E-014 拖放） | `test/e2e-readonly.test.mjs`（32） | e2e 映射、R-02 | 完成；無已知落差 |
| 唯讀時之焦點 | `spec/流程_唯讀時之焦點.md`（7） | `test/e2e-readonly-focus.test.mjs`（19） | e2e 映射、R-02 | 完成；已知落差見該 spec（含 2026-11-09 分割預覽不通知取消選取） |
| 提示區插入（含提示區外層 `state` 屬性） | `spec/流程_提示區插入.md`（9；2026-11-09 增 E2E-009，分割預覽不支援提示區） | `test/e2e-key-hint.test.mjs`（14） | e2e 映射、R-01、R-02 | 完成；2026-11-01 補 `state`（Gitea #36）；2026-11-09 分割預覽輪移除（見下） |
| 預覽之媒體連結安全（2026-11-09 新增） | `spec/流程_預覽之媒體連結安全.md`（4） | `test/e2e-preview.test.mjs`（4） | e2e 映射、R-03 | 完成；vditor 4.0.1 修復 GHSA-x2mx-f527-mxr9，修前紅 3／4 |
| e2e 靜態站自動換埠（測試設施，非產品功能） | 規格 `dspec/e2e埠與多套件同跑.md` E1～E8、§5 | `test/unit-e2ePorts.test.mjs`（23；EP-001～EP-015） | R-E2E-PORT-01、e2e 映射 C2／C14 | 完成；2026-11-05（vd309，見下） |

## 2026-11-09 vditor 3.11.3 升 4.0.1（任務 vd01）

- 相依 `vditor` 改 `^4.0.1`（安裝 4.0.1；`package-lock.json` 隨更新）。起因：3.11.3 預覽 XSS（GHSA-x2mx-f527-mxr9，`Vditor.preview` 與分割預覽之媒體連結網址未跳脫即組成 `<video>`／`<audio>`，預設 `sanitize: true` 仍可經 `onerror` 執行腳本）。修復驗證：`e2e-preview` 4 案，3.11.3 之變異副本 E2E-001、002、004 紅（`window.__xss` 為 1）、4.0.1 全綠。
- 破壞性變更之處置（對外行為之改變已列 JSDoc 與 README〈vditor 4 notes〉）：①分割預覽之編輯區改為 textarea：唯讀以 `readOnly` 實現（`lockSvEditor`／`unlockSvEditor`，ADR-009）並於 `guardLock` 攔截編輯區本身之貼上，維持「同原生 readonly」；②**分割預覽不再支援提示區**（`keyHint` 於 sv 無作用，vditor 4 停用）；③**分割預覽不通知 `settings.unSelect`**（上游行為）。其餘（`input` 事件、`editable`、`value`、`settings` 之轉交）行為不變；工具列、匯出、i18n、icons 檔未變。
- 測試：全套 183 passing（升版前 180）；後續補 E2E-014 後 186（見下方最末驗證行）。數字變化：key-hint 18→14（分割預覽輪 5 案移除、新增 E2E-009）、新增 `e2e-preview` 4、readonly 26→32（新增 E2E-013、014 各三模式）。升版後未調整碼之基準：144 passing、36 failing（全為分割預覽輪，成因為測試輔助找不到 textarea），細節 `spec/evidence/2026-11-09-vd01-upgrade-4.0.1.md`。
- 變異：新增之元件碼 M1（不設 readOnly）9 案紅、M2（不攔 paste）紅、M3（不還原 readOnly）紅；`detectAndShowHint` 之 sv 檢查與既有 `drop` 攔截為防禦性（M5、M6 無案例能單獨擊殺，規則帳本 R-02 已記）。
- 測試設施：`e2e-setup.mjs` 之編輯區觀察統一支援 textarea；新增 `previewMedia`、環境變數 `E2E_VDITOR_DIR`；`test/host/docs.json` 新增 `XSS_LINK`、`XSS_VIDEO`、`XSS_AUDIO`、`MEDIA_OK`；`FLOW_PORTS` 新增 `preview: 8142`。
- 待主控：①`C:/opensrcOper/dspec/e2e埠與多套件同跑.md` 之埠登錄（w-vditor-vue 8136～8141）更新為 8136～8142；②`dist/` 以 4.0.1 重建並發布（使用端取得修復須新版 `dist`）；③是否需要於分割預覽自行實作提示區（本輪判為不做，見 `流程_提示區插入`〈已知落差〉）。

## 2026-11-01 配合 w-component-vue 2.5.35（Gitea #36）

- 組件 data 宣告 `state: 'hidden'`（`WVditorVue.vue:338`），提示區外層 `.WPopperFix` 綁定 `:state="state"`（`:19`），JSDoc 補 state 值（hidden、opening、opened；關閉無過場、不使用 hiding）與時機。`BuildPopper` 必備 12 鍵全數宣告（R-01 站點表）。
- 修前（2.5.35 + 未宣告 state）：每個組件實例於掛載時拋 `Error: invalid vo.state`、`bp` 為 null、設 keyHint 者提示區不出現；`e2e-key-hint` 14／14 紅、`e2e-editing` 34／34 紅（`spec/evidence/2026-11-01-vd36-mutants.md`）。
- 修後：state 實測序列 hidden、opening、opened、hidden（`spec/evidence/2026-11-01-vd36-post-fix.json`）；`e2e-key-hint` 新增 E2E-007（三模式）、E2E-008，E2E-003／004 補 state 斷言；3 個變異皆被殺。
- `dist/` 已以現行原始碼重建（含 2.5.35 之 `buildPopper` 與本組件之 `state` 宣告）；發布流程由主控處理。

## 2026-11-05 e2e 靜態站自動換埠（排程第 309 項，vd309）

- 基準埠（`load` 8136、`editing` 8137、`parent-update` 8138、`readonly` 8139、`readonly-focus` 8140、`key-hint` 8141；2026-11-09 增 `preview` 8142）單一定義於 `test/tools/e2ePorts.mjs`；沒有占用時埠、行為、斷言與導入前相同（不寫 `E2E_PORT_OFFSET`、不位移）。
- 基準埠被占用（占用者綁 `127.0.0.1`、`0.0.0.0`、`::`、`::1` 皆測）時，各流程自動換至下一個位移（+100、+200…），實際埠印入輸出（`[e2e-port]`）；`createFlow` 之 `flow.port`／`flow.origin` 於 `setup()` 後才確定；占用者 PID 不變、仍回應、被測碼打到 0 次。
- 絕不下殺：`test/` 無任何下殺原語、不引入 `child_process`（僅單元測試與一個夾具例外）、不呼叫 `noteOwn`；預約 root 為專屬名稱（`RESERVE_ROOT`），函式庫之殘留預約下殺在本套件永不匹配（EP-004、EP-015）。
- 綁定前連線檢查（`isPortAnswering`）：Windows 下占用者綁 `0.0.0.0`／`::`／`::1` 時，`listen(…,'127.0.0.1')` 不報 `EADDRINUSE` 而並存並搶走新連線，故先檢查再綁，遇占用 `reselect`（EP-008a／008b）。
- 單元測試 23 案以真實行程與真實監聽驗證（動態基準埠、隔離預約目錄與環境，不占用 8136～8141，與並行中之 e2e 檔互不干擾）；變異 17／17 被擊殺（M1～M17，EP 對應見 `sgud/exp/experience.md`）。
- 畫面含埠（規格 E7）：本套件無（無像素標準圖，斷言不含埠）；基準埠與位移埠之宿主頁截圖 6／6 位元組全同。
- 已知限制：①「連線檢查」與「綁定」之間仍有毫秒級窗口（無法消除）；②占用者資訊（PID）由函式庫 PowerShell 查詢，多檔並行負載下可能回「占用者查詢失敗」（不影響換埠）；③POSIX、真實 dev server 占用情境未測。

## 已知缺口與待辦

- 無 pending 案例；無未修復之已知落差新增項（各流程 spec〈已知落差〉為準）。
- 待主控：複審、刪除根目錄建議檔 `建議w-vditor-vue調整.md`、發布（含 `version`；本輪不動）。
- 日後 w-component-vue 升版若再改 `buildPopper` 必備鍵或其他以原始碼引用之模組介面，依 R-01 盤點。
