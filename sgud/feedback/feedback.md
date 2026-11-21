# 回饋（w-vditor-vue）

任務中發現之自有套件、全域技能、全域設定之調整與抽提提案；只增不改，處置結果另記一列並寫明承接哪一列。回饋是紀錄與提案，實際修改走各自之通報管道。

| 日期 | 類別 | 對象 | 內容 | 依據 |
|---|---|---|---|---|
| 2026-11-21 | 全域技能 | role-coder-for-test-e2e（§4 act、§11.2 flake 處置） | 建議加一條：驗證「某鍵使編輯區捲動」之案例，起點須以使用者可做之鍵盤動作置於可捲動處（文件開頭）並前提斷言，不依賴 Tab 聚焦後之預設捲動位置與插入點；回到開頭用條件連按而非固定次數。程式寫入內容之 textarea 聚焦時插入點在文末，檢視已在底部，案例可能靠數 px 之餘量通過，升瀏覽器後才現形。 | `spec/evidence/2026-11-21-vv585-sv-pagedown.md` §2、§4；`sgud/rule/rulebook.md` R-04 |
| 2026-11-21 | 全域技能 | role-coder-for-test-e2e（references/pixel-mismatch-diagnosis.md 或 full-run-and-instances.md） | 建議加「瀏覽器升版後單一模式案例轉紅」之歸因步驟：①以 `executablePath` 指向舊修訂之探測腳本取得兩版實量，不必換相依；②在無組件之原生元素上重現，原生同樣變動即為瀏覽器行為；③三格對照（原樣、去掉 `--lang`、暫換舊相依）分離語系與瀏覽器二進位。另載 `npm i <e2e 套件舊版> <w-playwright 舊版> --no-save` 之陷阱：新舊套件之 `w-playwright` 相依範圍不同時，npm 把新版巢狀裝在套件之 `node_modules` 下，換版不生效，須以 `launchBrowser()` 印 `browser.version()` 確認。 | `sgud/exp/experience.md` 2026-11-21 條 |
| 2026-11-21 | 自有套件 | w-package-tools-e2e（`launchBrowser`） | 提案（低優先）：`launchBrowser` 在呼叫端未給 `executablePath` 時讀環境變數（例如 `E2E_BROWSER_EXECUTABLE_PATH`），使升版歸因時對照舊修訂不必換相依、不必改測試輔助；現況須在測試輔助暫改 `launchBrowser` 呼叫或另寫探測腳本。 | `spec/evidence/2026-11-21-vv585-probe-vditor.mjs`（以 `executablePath` 直接啟動舊 headless shell） |
| 2026-11-21 | 全域設定 | — | 無 | — |
