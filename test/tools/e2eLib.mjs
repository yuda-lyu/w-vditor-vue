//e2eLib: w-package-tools-e2e共用實作之單一橋接, 測試檔與e2e-setup.mjs一律經此引用, 升版只改package.json之版號
//本專案不建像素標準圖(見CLAUDE_rulebook.md之e2e映射〈偏離與依據〉), 故只轉出啟動瀏覽器、偵測等待(頁面內、測試行程端)、已知缺陷協定與自動換埠(reserveE2ePorts, 規格dspec/e2e埠與多套件同跑.md)
import launchBrowser from 'w-package-tools-e2e/src/launchBrowser.mjs'
import waitUntilExist from 'w-package-tools-e2e/src/waitUntilExist.mjs'
import pollUntil from 'w-package-tools-e2e/src/pollUntil.mjs'
import createKnownDefect from 'w-package-tools-e2e/src/createKnownDefect.mjs'
import reserveE2ePorts, { createE2ePortClaimer } from 'w-package-tools-e2e/src/reserveE2ePorts.mjs'
import { describePortOwners } from 'w-package-tools-e2e/src/reapShardProcesses.mjs'
import pidExists from 'w-package-tools-e2e/src/pidExists.mjs'


//createE2ePortClaimer、pidExists僅供單元測試(unit-e2ePorts.test.mjs)讀取預約與判斷行程是否存活
export {
    launchBrowser,
    waitUntilExist,
    pollUntil,
    createKnownDefect,
    reserveE2ePorts,
    describePortOwners,
    createE2ePortClaimer,
    pidExists
}
