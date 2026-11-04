# 狀態（現況）— w-vditor-vue

本檔只記現況，不寫過程（過程寫入 `sgud/exp/experience.md`）。規則帳本為藍圖（`sgud/rule/rulebook.md`），與本檔比對即知尚未做到者。

- 套件：以 Vue 2 封裝 vditor 3.11.3 之 Markdown 編輯器組件 `WVditorVue`（`src/components/WVditorVue.vue`）。`package.json` 版本 1.0.29（本輪未改版、未發布）。
- 相依：`w-component-vue ^2.5.43`、`vditor ^3.11.3`、`wsemi ^1.9.49`；測試用 `w-package-tools-e2e ^1.0.22`（含 `reserveE2ePorts`）。
- 最近一次驗證：2026-11-05（vd309）全套 `npm test`（`quiet-run --lock`）180 passing、0 failing、0 pending（e2e 157＋單元 23，2 分 22 秒；沒有占用時六流程皆在基準埠 8136～8141、輸出無位移）；六個基準埠同時被四種位址之占用者占住時全套亦 180 passing（占用者全數存活、0 次被打到）。前次 2026-11-01（vd36）：157 passing；`dist` 以現行原始碼重建後 `E2E_DIST_DIR=./dist` 跑 `e2e-key-hint` 18 passing。

## 功能與流程

| 功能（流程） | spec | 測試檔（passing 數） | 規則帳本條目 | 狀態 |
|---|---|---|---|---|
| 編輯器載入與關閉 | `spec/流程_編輯器載入與關閉.md`（27 案例） | `test/e2e-load.test.mjs`（35） | e2e 映射 | 完成；已知落差見該 spec |
| 編輯與回傳 | `spec/流程_編輯與回傳.md`（12） | `test/e2e-editing.test.mjs`（34） | e2e 映射 | 完成；已知落差見該 spec |
| 頁面更新內容 | `spec/流程_頁面更新內容.md`（10） | `test/e2e-parent-update.test.mjs`（25） | e2e 映射 | 完成；已知落差見該 spec |
| 唯讀鎖定 | `spec/流程_唯讀鎖定.md`（12） | `test/e2e-readonly.test.mjs`（26） | e2e 映射 | 完成；無已知落差 |
| 唯讀時之焦點 | `spec/流程_唯讀時之焦點.md`（7） | `test/e2e-readonly-focus.test.mjs`（19） | e2e 映射 | 完成；已知落差見該 spec |
| 提示區插入（含提示區外層 `state` 屬性） | `spec/流程_提示區插入.md`（8） | `test/e2e-key-hint.test.mjs`（18） | e2e 映射、R-01 | 完成；2026-11-01 補 `state`（Gitea #36，見下） |
| e2e 靜態站自動換埠（測試設施，非產品功能） | 規格 `dspec/e2e埠與多套件同跑.md` E1～E8、§5 | `test/unit-e2ePorts.test.mjs`（23；EP-001～EP-015） | R-E2E-PORT-01、e2e 映射 C2／C14 | 完成；2026-11-05（vd309，見下） |

## 2026-11-01 配合 w-component-vue 2.5.35（Gitea #36）

- 組件 data 宣告 `state: 'hidden'`（`WVditorVue.vue:338`），提示區外層 `.WPopperFix` 綁定 `:state="state"`（`:19`），JSDoc 補 state 值（hidden、opening、opened；關閉無過場、不使用 hiding）與時機。`BuildPopper` 必備 12 鍵全數宣告（R-01 站點表）。
- 修前（2.5.35 + 未宣告 state）：每個組件實例於掛載時拋 `Error: invalid vo.state`、`bp` 為 null、設 keyHint 者提示區不出現；`e2e-key-hint` 14／14 紅、`e2e-editing` 34／34 紅（`spec/evidence/2026-11-01-vd36-mutants.md`）。
- 修後：state 實測序列 hidden、opening、opened、hidden（`spec/evidence/2026-11-01-vd36-post-fix.json`）；`e2e-key-hint` 新增 E2E-007（三模式）、E2E-008，E2E-003／004 補 state 斷言；3 個變異皆被殺。
- `dist/` 已以現行原始碼重建（含 2.5.35 之 `buildPopper` 與本組件之 `state` 宣告）；發布流程由主控處理。

## 2026-11-05 e2e 靜態站自動換埠（排程第 309 項，vd309）

- 基準埠（`load` 8136、`editing` 8137、`parent-update` 8138、`readonly` 8139、`readonly-focus` 8140、`key-hint` 8141）單一定義於 `test/tools/e2ePorts.mjs`；沒有占用時埠、行為、斷言與導入前相同（不寫 `E2E_PORT_OFFSET`、不位移）。
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
