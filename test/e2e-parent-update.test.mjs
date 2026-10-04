//e2e-parent-update: 頁面更新內容(spec/流程_頁面更新內容.md)
//每個it為一個E2E-NNN×一種編輯模式, 每案全新瀏覽器; 頁面之更新只經示範宿主頁(test/host/index.html)之按鈕與Ctrl+S儲存觸發, 或為開頁時設定之資料延遲到達
//斷言註解之①②…對應spec該案「驗證／語意」之編號
import assert from 'assert'
import {
    MODES, MODE_NAMES, DOCS, visText, launchBrowser, createFlow,
    waitReady, waitText, waitInputs, waitMdoutSynced, waitStatus, states, rawText, hostInfo,
    editor, toolbarButton, hostButton, clickEnd, typeAtEnd, endsAfter
} from './tools/e2e-setup.mjs'
import { waitUntilExist } from './tools/e2eLib.mjs'


let flow = createFlow('parent-update')

//MODES_ASYNC, 回傳有防抖延遲之模式(分割預覽每次輸入即同步回傳, 無「已輸入而尚未回傳」之期間)
let MODES_ASYNC = ['wysiwyg', 'ir']


describe('e2e-parent-update：頁面更新內容', function() {

    let browser = null

    before(async function() {
        this.timeout(300000) //含rollup編譯元件
        await flow.setup()
    })

    after(async function() {
        await flow.teardown()
    })

    beforeEach(async function() {
        browser = await launchBrowser()
    })

    afterEach(async function() {
        if (browser) {
            await browser.close()
            browser = null
        }
    })

    for (let mode of MODES) {

        //E2E-001 尚未編輯時頁面送來資料且成為復原起點
        //①起點: 示範宿主頁, 開啟時空白, 2.5秒後送達NEW ②點擊: 「復原」 ③看到: 新內容 ④輸入: 無 ⑤之後: 復原不回到空白 ⑥副作用: 頁面未收到回傳
        it(`E2E-001 [${MODE_NAMES[mode]}] 尚未編輯時頁面送來資料且成為復原起點`, async function() {
            let { page, logs } = await flow.openCase(browser, { mode, doc: 'EMPTY', dataAt: '2500', dataDoc: 'NEW' })
            await waitReady(page)
            let expected = visText(mode, DOCS.NEW)
            await waitText(page, '資料送達後顯示新內容', { equals: expected }, { timeout: 15000 })
            await page.waitForTimeout(1000) //負向觀察窗: 涵蓋載入後延後寫入復原紀錄之防抖, 確認「復原」維持停用
            let [s0] = await states(page)
            let info0 = await hostInfo(page)
            assert.strictEqual(info0.loadingAtData, false) //①前提: 送達時已載入完成
            assert.strictEqual(s0.text, expected) //①
            assert.strictEqual(s0.undoDisabled, true) //②
            await toolbarButton(page, 'undo').click()
            await page.waitForTimeout(600) //負向觀察窗: 點擊後不得回到空白
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(s1.text, expected) //③
            assert.deepStrictEqual(info.inputs, []) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

    for (let mode of MODES) {

        //E2E-002 編輯後取得最新版本仍可復原至編輯內容
        //①起點: 示範宿主頁 ②點擊: 編輯區、「取得最新版本」、「復原」 ③看到: 最新版本 ④輸入: ZZZ ⑤之後: 復原回到編輯內容 ⑥副作用: 無
        it(`E2E-002 [${MODE_NAMES[mode]}] 編輯後取得最新版本仍可復原至編輯內容`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode })
            await typeAtEnd(page, 'ZZZ')
            await waitInputs(page, '回傳結尾為ZZZ', { lastEndsWith: 'ZZZ' })
            let [sE] = await states(page)
            assert.strictEqual(endsAfter(sE.text, base), 'ZZZ') //①前提
            await page.waitForTimeout(600) //停頓: 使輸入寫入復原紀錄(分割預覽於回傳後另以100ms防抖寫入, 載入新內容會清除未寫入者, 無可觀察訊號)
            await hostButton(page, '取得最新版本').click()
            await waitText(page, '顯示最新版本', { equals: visText(mode, DOCS.PULL1) })
            await page.waitForTimeout(600) //停頓: 使載入之內容寫入復原紀錄(防抖100ms, 無可觀察訊號)
            let [s1] = await states(page)
            assert.strictEqual(s1.text, visText(mode, DOCS.PULL1)) //②
            assert.strictEqual(s1.undoDisabled, false) //③
            await toolbarButton(page, 'undo').click()
            await waitText(page, '復原至編輯內容', { equals: sE.text })
            let [s2] = await states(page)
            assert.strictEqual(s2.text, sE.text) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

    for (let mode of MODES) {

        //E2E-003 恢復上一版時以頁面內容為準
        //①起點: 示範宿主頁, 頁面同步回寫並記錄版本 ②點擊: 編輯區、「恢復上一版」 ③看到: 較早之版本 ④輸入: a、b(每鍵250ms) ⑤之後: 畫面與頁面內容一致 ⑥副作用: 頁面持有第一次回傳
        it(`E2E-003 [${MODE_NAMES[mode]}] 恢復上一版時以頁面內容為準`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode })
            await typeAtEnd(page, 'ab', { delay: 250 })
            let info0 = await waitInputs(page, '回傳2次且結尾為ab', { count: 2, lastEndsWith: 'ab' })
            assert.strictEqual(info0.inputs.length, 2) //①前提
            assert.ok(info0.inputs[0].trimEnd().endsWith('a'), JSON.stringify(info0.inputs)) //①前提
            await hostButton(page, '恢復上一版').click()
            await waitText(page, '恢復後結尾為a', { endsWith: 'a' })
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.ok(s1.text.startsWith(base), s1.text) //②
            assert.strictEqual(endsAfter(s1.text, base), 'a') //②
            assert.strictEqual(info.mdout, info0.inputs[0]) //③
            assert.deepStrictEqual(logs, []) //④
        })

    }

    for (let mode of MODES) {

        //E2E-004 儲存後伺服器回傳相同內容時游標位置不變
        //①起點: 示範宿主頁, 伺服器0.3秒後回傳上傳內容接換行 ②點擊: 編輯區 ③看到: 「已儲存」 ④輸入: Ctrl+End、Ctrl+S、Y ⑤之後: Y接於末尾 ⑥副作用: 頁面寫回伺服器回傳
        it(`E2E-004 [${MODE_NAMES[mode]}] 儲存後伺服器回傳相同內容時游標位置不變`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode, saveReply: 'echo', saveReplyAt: '300' })
            await clickEnd(page)
            await page.keyboard.press('Control+s')
            await waitStatus(page, '已儲存')
            let info0 = await hostInfo(page)
            assert.strictEqual(info0.mdout, `${DOCS.ORI}\n`) //①前提: 頁面已寫回
            await page.keyboard.type('Y')
            await waitInputs(page, '回傳結尾為Y', { lastEndsWith: 'Y' })
            await waitMdoutSynced(page)
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.ok(s1.text.startsWith(base), s1.text) //②
            assert.strictEqual(endsAfter(s1.text, base), 'Y') //②
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //③
            assert.deepStrictEqual(logs, []) //④
        })

    }

    for (let mode of MODES_ASYNC) {

        //E2E-005 輸入尚未回傳時取得最新版本
        //①起點: 示範宿主頁, 回傳防抖600ms、頁面不回寫 ②點擊: 編輯區、「取得最新版本」、「復原」 ③看到: 最新版本 ④輸入: Z ⑤之後: 復原回到開啟時內容 ⑥副作用: Z不再回傳
        it(`E2E-005 [${MODE_NAMES[mode]}] 輸入尚未回傳時取得最新版本`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode, writeMode: 'none', hintTimeDetect: '600' })
            await typeAtEnd(page, 'Z')
            await hostButton(page, '取得最新版本').click()
            await waitText(page, '顯示最新版本', { equals: visText(mode, DOCS.PULL1) })
            await page.waitForTimeout(1200) //負向觀察窗: 涵蓋600ms防抖, 確認被取代之輸入不再回傳, 並使載入之內容寫入復原紀錄
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(s1.text, visText(mode, DOCS.PULL1)) //①
            assert.deepStrictEqual(info.inputs, []) //②
            assert.strictEqual(s1.undoDisabled, false) //③
            await toolbarButton(page, 'undo').click()
            await waitText(page, '復原至開啟時內容', { equals: base })
            let [s2] = await states(page)
            assert.strictEqual(s2.text, base) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

    for (let mode of MODES_ASYNC) {

        //E2E-006 輸入尚未回傳時連續取得兩個版本仍可復原
        //①起點: 示範宿主頁, 回傳防抖600ms、頁面不回寫 ②點擊: 編輯區、「取得最新版本」兩次、「復原」 ③看到: 第二個版本 ④輸入: Z ⑤之後: 復原回到第一個版本 ⑥副作用: 無
        it(`E2E-006 [${MODE_NAMES[mode]}] 輸入尚未回傳時連續取得兩個版本仍可復原`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, writeMode: 'none', hintTimeDetect: '600' })
            await typeAtEnd(page, 'Z')
            await hostButton(page, '取得最新版本').click()
            await waitText(page, '顯示第一個版本', { equals: visText(mode, DOCS.PULL1) })
            let [s1] = await states(page)
            assert.strictEqual(s1.text, visText(mode, DOCS.PULL1)) //①前提
            await page.waitForTimeout(1200) //停頓: 使載入之內容寫入復原紀錄(防抖600ms, 無可觀察訊號)
            await hostButton(page, '取得最新版本').click()
            await waitText(page, '顯示第二個版本', { equals: visText(mode, DOCS.PULL2) })
            await page.waitForTimeout(1200) //停頓: 同上
            let [s2] = await states(page)
            assert.strictEqual(s2.text, visText(mode, DOCS.PULL2)) //②
            assert.strictEqual(s2.undoDisabled, false) //③
            await toolbarButton(page, 'undo').click()
            await waitText(page, '復原至第一個版本', { equals: visText(mode, DOCS.PULL1) })
            let [s3] = await states(page)
            assert.strictEqual(s3.text, visText(mode, DOCS.PULL1)) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

    for (let mode of MODES_ASYNC) {

        //E2E-007 儲存回應晚到時繼續輸入不受影響
        //①起點: 示範宿主頁, 回傳防抖600ms, 伺服器0.3秒後回傳上傳內容接換行 ②點擊: 編輯區 ③看到: 「已儲存」 ④輸入: a、Ctrl+S、b、c ⑤之後: abc皆保留 ⑥副作用: 頁面寫回上傳時之內容
        it(`E2E-007 [${MODE_NAMES[mode]}] 儲存回應晚到時繼續輸入不受影響`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode, hintTimeDetect: '600', saveReply: 'echo', saveReplyAt: '300' })
            await typeAtEnd(page, 'a')
            await waitInputs(page, '回傳結尾為a', { lastEndsWith: 'a' })
            await page.keyboard.press('Control+s')
            await page.keyboard.type('b')
            await waitStatus(page, '已儲存')
            let info1 = await hostInfo(page)
            let [s1] = await states(page)
            assert.strictEqual(info1.inputs.length, 1) //①前提: 寫回時b尚未回傳
            assert.strictEqual(info1.mdout, `${info1.inputs[0]}\n`) //①前提: 頁面已寫回上傳時之內容
            assert.strictEqual(endsAfter(s1.text, base), 'ab') //②
            await page.keyboard.type('c')
            await waitInputs(page, '回傳結尾為abc', { lastEndsWith: 'abc' })
            let [s2] = await states(page)
            assert.strictEqual(endsAfter(s2.text, base), 'abc') //③
            assert.deepStrictEqual(logs, []) //④
        })

    }

    //E2E-008 分割預覽下頁面修整開頭空白時以頁面內容為準
    //①起點: 示範宿主頁, 分割預覽, 頁面修整兩端空白後回寫 ②點擊: 編輯區 ③看到: 開頭空白被移除 ④輸入: Ctrl+Home、空白 ⑤之後: 畫面與頁面內容一致 ⑥副作用: 頁面持有修整後之內容
    it(`E2E-008 [${MODE_NAMES.sv}] 分割預覽下頁面修整開頭空白時以頁面內容為準`, async function() {
        let { page, logs } = await flow.openReady(browser, { mode: 'sv', writeMode: 'trim' })
        await editor(page).click()
        await page.keyboard.press('Control+Home')
        await page.keyboard.type(' ')
        await waitInputs(page, '回傳開頭空白之內容', { count: 1 })
        await waitUntilExist(page, '編輯區開頭空白已移除', () => {
            let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
            return !!ed && ed.innerText.startsWith('#')
        })
        let info = await hostInfo(page)
        let raw = await rawText(page)
        let [s1] = await states(page)
        assert.ok(/^\s/.test(info.inputs[0]), JSON.stringify(info.inputs)) //①前提
        assert.strictEqual(info.mdout, info.inputs[info.inputs.length - 1].trim()) //②
        assert.strictEqual(s1.text, visText('sv', DOCS.ORI)) //③
        assert.ok(!/^\s/.test(raw), JSON.stringify(raw.slice(0, 20))) //③開頭無空白
        assert.deepStrictEqual(logs, []) //④
    })

    for (let mode of MODES) {

        //E2E-009 頁面不回寫時保留輸入且之後仍可更新
        //①起點: 示範宿主頁, 頁面不回寫 ②點擊: 編輯區、「取得最新版本」 ③看到: 輸入保留, 之後顯示最新版本 ④輸入: abc(每鍵250ms) ⑤之後: 最新版本 ⑥副作用: 無
        it(`E2E-009 [${MODE_NAMES[mode]}] 頁面不回寫時保留輸入且之後仍可更新`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode, writeMode: 'none' })
            await typeAtEnd(page, 'abc', { delay: 250 })
            await waitInputs(page, '回傳結尾為abc', { lastEndsWith: 'abc' })
            let [s1] = await states(page)
            assert.strictEqual(endsAfter(s1.text, base), 'abc') //①
            await hostButton(page, '取得最新版本').click()
            await waitText(page, '顯示最新版本', { equals: visText(mode, DOCS.PULL1) })
            let [s2] = await states(page)
            assert.strictEqual(s2.text, visText(mode, DOCS.PULL1)) //②
            assert.deepStrictEqual(logs, []) //③
        })

    }

    for (let mode of MODES) {

        //E2E-010 伺服器以 CRLF 換行回傳相同內容時游標不變
        //①起點: 示範宿主頁, 伺服器0.3秒後回傳上傳內容並改為CRLF換行 ②點擊: 編輯區 ③看到: 「已儲存」 ④輸入: Ctrl+End、Ctrl+S、Y ⑤之後: Y接於末尾 ⑥副作用: 頁面寫回CRLF之內容
        it(`E2E-010 [${MODE_NAMES[mode]}] 伺服器以 CRLF 換行回傳相同內容時游標不變`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode, saveReply: 'echoCrlf', saveReplyAt: '300' })
            await clickEnd(page)
            await page.keyboard.press('Control+s')
            await waitStatus(page, '已儲存')
            let info0 = await hostInfo(page)
            assert.ok(info0.mdout.includes('\r\n'), JSON.stringify(info0.mdout)) //①前提: 頁面已寫回CRLF之內容
            assert.strictEqual(info0.mdout.replace(/\r/g, ''), DOCS.ORI) //①前提
            await page.keyboard.type('Y')
            await waitInputs(page, '回傳結尾為Y', { lastEndsWith: 'Y' })
            let [s1] = await states(page)
            assert.ok(s1.text.startsWith(base), s1.text) //②
            assert.strictEqual(endsAfter(s1.text, base), 'Y') //②
            assert.deepStrictEqual(logs, []) //③
        })

    }

})
