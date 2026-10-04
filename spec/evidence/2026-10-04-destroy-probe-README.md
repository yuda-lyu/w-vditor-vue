# 2026-10-04 載入中關閉之探測與紅燈驗證紀錄（ADR-008）

各 log 為探測腳本之原始輸出；探測腳本為一次性之暫存程式，未入版控，量測法與情境如下。

## 版本標籤

| 標籤 | 元件原始碼 |
|---|---|
| `cur` | 修正前（commit e97404d 之 `src/components/WVditorVue.vue`） |
| `fix` | 候選方案 B+：初始化未完成即銷毀時，vditor 未建立內部物件則寫入 `isDestroyed`，已建立則呼叫 `wysiwyg.unbindListener` |
| `fix2` | 候選方案 B+ 再覆寫 `showErrorTip` |
| `final` | 定稿之現行原始碼：`releaseCreating` 於兩種情形皆寫入 `isDestroyed` 並覆寫 `showErrorTip`（vditor 已建立內部物件時兩者皆無作用），再解除所見即所得之捲動監聽；行為與 `fix2` 相同 |

## 量測法

- probe1：Chrome DevTools Protocol 之 `DOMDebugger.getEventListeners(window)` 計 resize、scroll 數，減去開頁時不顯示編輯器之對照頁（`hide=1`）。
- probe2～4：計 window、document（probe2、3 另含 visualViewport）上各事件型別之數。probe2 之對照頁未執行偵測等待，各情境多出之 13 個型別（mousemove、mousedown、mouseup、pointerdown、pointerup、touchstart、touchend、touchcancel、click、auxclick、dblclick、contextmenu、`__playwright_global_listeners_check__`）為 Playwright 注入，非元件殘留（見 probe5）；probe3 之 log 未剔除，probe4 已剔除。
- probe5：Playwright 1.63.0 於何種操作後在 window 注入上述 13 個監聽：點擊不會，頁面主環境之偵測等待（`waitForFunction`、`waitUntilExist`）會。
- probe6：同 probe4 之量測（已剔除上述 13 個型別），以修改示範頁設定注入錯誤設定。
- probe7：就緒後反覆「關閉→開啟」，計 body 內圖示 SVG（含 `#vditor-icon-comment` 者）與 head 之 script 數。
- 定稿版（`final`）以 probe2～4、6 重跑；probe1 之情境由 probe2 全數涵蓋，未重跑。

## 情境代號

- probe1、probe2：S1 語系已到、排版引擎永不到，關閉；S2 語系未到即關閉，語系晚到、排版引擎永不到；S3 語系未到即關閉，兩者皆晚到；S4 語系已到、排版引擎晚到，關閉；S5 頁面自備語系、排版引擎永不到，關閉；S6 排版引擎永不到時開關 4 次；S7 就緒後關閉；S8 同頁兩個就緒編輯器（未關閉）；S0（probe2）就緒未關閉；S9（probe2）語系永不到，關閉後再點「X」；S10a、S10b（probe2）語系不合法、快取缺識別碼，關閉。
- probe3：P-a 已請求排版引擎後關閉、排版引擎晚到，三模式；P-b 工具列子選單含不存在之項目且頁面自備語系；P-c 同 P-b 但語系由 vditor 下載；P-d 語系未到即關閉，語系延後 1.5 秒後失敗；P-e 同 S2 而不過濾主控台。
- probe4：e3 編輯模式 `xxx`（打字機模式為組件預設之開啟）；e4 編輯模式 `xxx` 且關閉打字機模式。
- probe6：X2 `settings.comment` 為 null（語系由 vditor 下載）；X3 `settings.value` 為數字 1。

## 紅燈驗證

- `destroy-redrun-pre.log`：以修正前原始碼（`E2E_SRC_DIR`）執行 `test/e2e-load.test.mjs`，E2E-014、E2E-015（三模式）、E2E-017、E2E-025、E2E-026、E2E-027 共 8 條失敗，其餘 27 條通過。
- `destroy-redrun-fix.log`：以現行原始碼執行同檔，35 條全數通過。
