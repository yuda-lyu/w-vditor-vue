# 狀態（現況）— w-vditor-vue

本檔只記現況，不寫過程（過程寫入 `sgud/exp/experience.md`）。規則帳本為藍圖（`sgud/rule/rulebook.md`），與本檔比對即知尚未做到者。

- 套件：以 Vue 2 封裝 vditor 3.11.3 之 Markdown 編輯器組件 `WVditorVue`（`src/components/WVditorVue.vue`）。`package.json` 版本 1.0.23（本輪未改版、未發布）。
- 相依：`w-component-vue ^2.5.35`（`node_modules` 為 2.5.35）、`vditor ^3.11.3`、`wsemi ^1.9.36`。
- 最近一次驗證：2026-11-01（vd36 修正輪）全套 `npm test`（`quiet-run --lock`）157 passing、0 failing、0 pending；`dist` 以現行原始碼重建後，`E2E_DIST_DIR=./dist` 跑 `e2e-key-hint` 18 passing。

## 功能與流程

| 功能（流程） | spec | 測試檔（passing 數） | 規則帳本條目 | 狀態 |
|---|---|---|---|---|
| 編輯器載入與關閉 | `spec/流程_編輯器載入與關閉.md`（27 案例） | `test/e2e-load.test.mjs`（35） | e2e 映射 | 完成；已知落差見該 spec |
| 編輯與回傳 | `spec/流程_編輯與回傳.md`（12） | `test/e2e-editing.test.mjs`（34） | e2e 映射 | 完成；已知落差見該 spec |
| 頁面更新內容 | `spec/流程_頁面更新內容.md`（10） | `test/e2e-parent-update.test.mjs`（25） | e2e 映射 | 完成；已知落差見該 spec |
| 唯讀鎖定 | `spec/流程_唯讀鎖定.md`（12） | `test/e2e-readonly.test.mjs`（26） | e2e 映射 | 完成；無已知落差 |
| 唯讀時之焦點 | `spec/流程_唯讀時之焦點.md`（7） | `test/e2e-readonly-focus.test.mjs`（19） | e2e 映射 | 完成；已知落差見該 spec |
| 提示區插入（含提示區外層 `state` 屬性） | `spec/流程_提示區插入.md`（8） | `test/e2e-key-hint.test.mjs`（18） | e2e 映射、R-01 | 完成；2026-11-01 補 `state`（Gitea #36，見下） |

## 2026-11-01 配合 w-component-vue 2.5.35（Gitea #36）

- 組件 data 宣告 `state: 'hidden'`（`WVditorVue.vue:338`），提示區外層 `.WPopperFix` 綁定 `:state="state"`（`:19`），JSDoc 補 state 值（hidden、opening、opened；關閉無過場、不使用 hiding）與時機。`BuildPopper` 必備 12 鍵全數宣告（R-01 站點表）。
- 修前（2.5.35 + 未宣告 state）：每個組件實例於掛載時拋 `Error: invalid vo.state`、`bp` 為 null、設 keyHint 者提示區不出現；`e2e-key-hint` 14／14 紅、`e2e-editing` 34／34 紅（`spec/evidence/2026-11-01-vd36-mutants.md`）。
- 修後：state 實測序列 hidden、opening、opened、hidden（`spec/evidence/2026-11-01-vd36-post-fix.json`）；`e2e-key-hint` 新增 E2E-007（三模式）、E2E-008，E2E-003／004 補 state 斷言；3 個變異皆被殺。
- `dist/` 已以現行原始碼重建（含 2.5.35 之 `buildPopper` 與本組件之 `state` 宣告）；發布流程由主控處理。

## 已知缺口與待辦

- 無 pending 案例；無未修復之已知落差新增項（各流程 spec〈已知落差〉為準）。
- 待主控：複審、刪除根目錄建議檔 `建議w-vditor-vue調整.md`、發布（含 `version`；本輪不動）。
- 日後 w-component-vue 升版若再改 `buildPopper` 必備鍵或其他以原始碼引用之模組介面，依 R-01 盤點。
