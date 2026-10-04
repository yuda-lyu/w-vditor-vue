//e2eLib: w-package-tools-e2e共用實作之單一橋接, 測試檔與e2e-setup.mjs一律經此引用, 升版只改package.json之版號
//本專案不建像素標準圖(見CLAUDE_rulebook.md之e2e映射〈偏離與依據〉), 故只轉出啟動瀏覽器、偵測等待(頁面內、測試行程端)與已知缺陷協定
import launchBrowser from 'w-package-tools-e2e/src/launchBrowser.mjs'
import waitUntilExist from 'w-package-tools-e2e/src/waitUntilExist.mjs'
import pollUntil from 'w-package-tools-e2e/src/pollUntil.mjs'
import createKnownDefect from 'w-package-tools-e2e/src/createKnownDefect.mjs'


export {
    launchBrowser,
    waitUntilExist,
    pollUntil,
    createKnownDefect
}
