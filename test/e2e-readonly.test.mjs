//e2e-readonly: 唯讀鎖定(spec/流程_唯讀鎖定.md)
//每個it為一個E2E-NNN×一種編輯模式, 每案全新瀏覽器; 唯讀之切換只經示範宿主頁(test/host/index.html)之唯讀切換鈕與Ctrl+S儲存觸發, 或為開頁時設定之唯讀文件與權限延遲到達
//斷言註解之①②…對應spec該案「驗證／語意」之編號
import assert from 'assert'
import {
    MODES, MODE_NAMES, DOCS, visText, launchBrowser, createFlow,
    waitReady, waitUndo, waitEditable, waitText, waitInputs, waitMdoutSynced, waitStatus, states, sampleStates, hostInfo,
    editor, toolbarButton, hostButton, typeAtEnd, tabUntil, endsAfter
} from './tools/e2e-setup.mjs'
import { waitUntilExist } from './tools/e2eLib.mjs'


let flow = createFlow('readonly')

//MODES_RICH, 編輯區為渲染結果之模式(分割預覽之編輯區為原始碼, 無核取方塊、圖片、輸入框元素與點擊處理)
let MODES_RICH = ['wysiwyg', 'ir']


describe('e2e-readonly：唯讀鎖定', function() {

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

    //checkReadonlySamples, E2E-001、002之共同斷言(取樣每50ms一次共40次, 涵蓋三模式延後寫入復原紀錄而重新啟用「復原」之時機)
    let checkReadonlySamples = (samples, mode, logs) => {
        assert.ok(samples.every((s) => s.text === visText(mode, DOCS.ORI)), JSON.stringify(samples.map((s) => s.text))) //①
        assert.ok(samples.every((s) => s.editable === 'false'), JSON.stringify(samples.map((s) => s.editable))) //②
        assert.ok(samples.every((s) => s.undoDisabled === true), JSON.stringify(samples.map((s) => s.undoDisabled))) //③
        assert.ok(samples.every((s) => s.boldDisabled === true), JSON.stringify(samples.map((s) => s.boldDisabled))) //④
        assert.deepStrictEqual(logs, []) //⑤
    }

    for (let mode of MODES) {

        //E2E-001 開啟唯讀文件時不可編輯且工具列停用
        //①起點: 示範宿主頁, 唯讀文件 ②點擊: 無 ③看到: 文件內容、工具列停用 ④輸入: 無 ⑤之後: 整段期間維持停用 ⑥副作用: 無
        it(`E2E-001 [${MODE_NAMES[mode]}] 開啟唯讀文件時不可編輯且工具列停用`, async function() {
            let { page, logs } = await flow.openCase(browser, { mode, editable: '0' })
            await waitReady(page)
            checkReadonlySamples(await sampleStates(page), mode, logs)
        })

    }

    //E2E-002 頁面自備語系資料之唯讀文件工具列停用
    //①起點: 示範宿主頁, 唯讀文件, 頁面自備語系資料 ②～⑥同E2E-001
    it(`E2E-002 [${MODE_NAMES.wysiwyg}] 頁面自備語系資料之唯讀文件工具列停用`, async function() {
        let { page, logs } = await flow.openCase(browser, { editable: '0', i18n: '1' })
        await waitReady(page)
        checkReadonlySamples(await sampleStates(page), 'wysiwyg', logs)
    })

    for (let mode of MODES) {

        //E2E-003 唯讀文件載入後收到資料時「復原」仍停用
        //①起點: 示範宿主頁, 唯讀文件, 2.5秒後送達NEW_SHORT ②點擊: 無 ③看到: 新內容 ④輸入: 無 ⑤之後: 「復原」停用 ⑥副作用: 無
        it(`E2E-003 [${MODE_NAMES[mode]}] 唯讀文件載入後收到資料時「復原」仍停用`, async function() {
            let { page, logs } = await flow.openCase(browser, { mode, editable: '0', dataAt: '2500', dataDoc: 'NEW_SHORT' })
            await waitReady(page)
            let expected = visText(mode, DOCS.NEW_SHORT)
            await waitText(page, '資料送達後顯示新內容', { equals: expected }, { timeout: 15000 })
            await page.waitForTimeout(1000) //負向觀察窗: 載入後vditor延後寫入復原紀錄而啟用「復原」, 確認唯讀監看改回
            let [s] = await states(page)
            assert.strictEqual(s.text, expected) //①
            assert.strictEqual(s.undoDisabled, true) //②
            assert.deepStrictEqual(logs, []) //③
        })

    }

    for (let mode of MODES) {

        //E2E-004 點擊「設為唯讀」後無法輸入，「設為可編輯」後恢復
        //①起點: 示範宿主頁 ②點擊: 「設為唯讀」、編輯區、「設為可編輯」 ③看到: 唯讀時輸入無效 ④輸入: Z、Y ⑤之後: 解除後Y接於末尾 ⑥副作用: 唯讀時無回傳
        it(`E2E-004 [${MODE_NAMES[mode]}] 點擊「設為唯讀」後無法輸入，「設為可編輯」後恢復`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode })
            await hostButton(page, '設為唯讀').click()
            await waitEditable(page, false)
            let [s0] = await states(page)
            assert.strictEqual(s0.editable, 'false') //①
            assert.strictEqual(s0.boldDisabled, true) //①
            await editor(page).click()
            await page.keyboard.type('Z')
            await page.waitForTimeout(600) //負向觀察窗: 唯讀時輸入不得改動內容或回傳
            let [s1] = await states(page)
            let info1 = await hostInfo(page)
            assert.strictEqual(s1.text, base) //②
            assert.deepStrictEqual(info1.inputs, []) //②
            await hostButton(page, '設為可編輯').click()
            await waitEditable(page, true)
            let [s2] = await states(page)
            assert.strictEqual(s2.editable, 'true') //③
            await typeAtEnd(page, 'Y')
            await waitInputs(page, '回傳結尾為Y', { lastEndsWith: 'Y' })
            await waitMdoutSynced(page)
            let [s3] = await states(page)
            let info3 = await hostInfo(page)
            assert.strictEqual(endsAfter(s3.text, base), 'Y') //④
            assert.strictEqual(info3.mdout.trimEnd(), info3.inputs[info3.inputs.length - 1].trimEnd()) //⑤
            assert.deepStrictEqual(logs, []) //⑥
        })

    }

    for (let [no, title, from, to] of [
        ['E2E-005', '載入中收到唯讀權限時就緒即唯讀', '1', '0'],
        ['E2E-006', '載入中收到編輯權限時就緒即可編輯', '0', '1'],
    ]) {

        //E2E-005/006 載入中收到權限時就緒即套用
        //①起點: 示範宿主頁, 50ms後送達權限, 排版引擎延後1秒 ②點擊: 無 ③看到: 就緒時即為最終之唯讀或可編輯 ④輸入: 無 ⑤之後: 工具列隨之 ⑥副作用: 無
        it(`${no} [${MODE_NAMES.wysiwyg}] ${title}`, async function() {
            let { page, logs } = await flow.openCase(browser, { editable: from, permAt: '50', permTo: to }, { luteDelay: 1000 })
            await waitReady(page)
            await page.waitForTimeout(1000) //負向觀察窗: 就緒後不得翻轉
            let [s] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(info.loadingAtPerm, true) //①前提
            assert.strictEqual(s.editable, to === '1' ? 'true' : 'false') //②
            assert.strictEqual(s.boldDisabled, to !== '1') //③
            assert.deepStrictEqual(logs, []) //④
        })

    }

    for (let mode of MODES) {

        //E2E-007 輸入後立即儲存鎖定時最後輸入照常回傳
        //①起點: 示範宿主頁, 儲存時上傳期間唯讀3秒 ②點擊: 編輯區 ③看到: 「上傳中…」 ④輸入: ab(每鍵150ms)、c、Ctrl+S ⑤之後: abc保留且回傳 ⑥副作用: 唯讀期間工具列維持停用
        it(`E2E-007 [${MODE_NAMES[mode]}] 輸入後立即儲存鎖定時最後輸入照常回傳`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode, saveLock: '3000' })
            await typeAtEnd(page, 'ab', { delay: 150 })
            await page.keyboard.type('c')
            await page.keyboard.press('Control+s')
            await waitInputs(page, '鎖定前之輸入回傳', { lastEndsWith: 'abc' })
            await waitMdoutSynced(page)
            await page.waitForTimeout(500) //負向觀察窗: 回傳後vditor寫入復原紀錄而啟用「復原」, 確認唯讀監看改回且不再變動
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(info.status, '上傳中…') //①
            assert.strictEqual(s1.editable, 'false') //②
            assert.strictEqual(s1.undoDisabled, true) //③
            assert.strictEqual(s1.boldDisabled, true) //④
            assert.strictEqual(endsAfter(s1.text, base), 'abc') //⑤
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //⑥
            assert.ok(info.mdout.trimEnd().endsWith('abc'), info.mdout) //⑥
            assert.deepStrictEqual(logs, []) //⑦
        })

    }

    for (let mode of MODES) {

        //E2E-008 鎖定期間收到伺服器內容，解鎖後可復原
        //①起點: 示範宿主頁, 上傳期間唯讀2.5秒、伺服器0.8秒後回傳SERVER ②點擊: 編輯區、「復原」 ③看到: 鎖定期間顯示伺服器內容 ④輸入: abc、Ctrl+S ⑤之後: 解鎖後復原回到輸入後之內容 ⑥副作用: 唯讀期間「復原」停用
        it(`E2E-008 [${MODE_NAMES[mode]}] 鎖定期間收到伺服器內容，解鎖後可復原`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, saveLock: '2500', saveReply: 'server', saveReplyAt: '800' })
            await typeAtEnd(page, 'abc')
            await waitInputs(page, '回傳結尾為abc', { lastEndsWith: 'abc' })
            await page.waitForTimeout(600) //停頓: 使輸入寫入復原紀錄(分割預覽於回傳後另以100ms防抖寫入, 無可觀察訊號)
            let [sE] = await states(page)
            await page.keyboard.press('Control+s')
            let expected = visText(mode, DOCS.SERVER)
            await waitText(page, '鎖定期間顯示伺服器內容', { equals: expected })
            await page.waitForTimeout(1000) //負向觀察窗: 載入後vditor延後寫入復原紀錄而啟用「復原」, 確認唯讀監看改回
            let [s1] = await states(page)
            assert.strictEqual(s1.text, expected) //①
            assert.strictEqual(s1.editable, 'false') //②
            assert.strictEqual(s1.undoDisabled, true) //③
            assert.strictEqual(s1.boldDisabled, true) //④
            await waitStatus(page, '已儲存')
            await waitUndo(page, false)
            let [s2] = await states(page)
            assert.strictEqual(s2.undoDisabled, false) //⑤
            await toolbarButton(page, 'undo').click()
            await waitText(page, '復原至輸入後之內容', { equals: sE.text })
            let [s3] = await states(page)
            assert.strictEqual(s3.text, sE.text) //⑥
            assert.deepStrictEqual(logs, []) //⑦
        })

    }

    for (let mode of MODES_RICH) {

        //E2E-009 唯讀時點擊待辦核取方塊與圖片無效
        //①起點: 示範宿主頁, 唯讀之TASKS ②點擊: 核取方塊、圖片 ③看到: 勾選不變、無編輯框 ④輸入: 無 ⑤之後: 內容不變 ⑥副作用: 無回傳
        it(`E2E-009 [${MODE_NAMES[mode]}] 唯讀時點擊待辦核取方塊與圖片無效`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, doc: 'TASKS', editable: '0' })
            let [s0] = await states(page)
            let cb = page.locator('.WVditorFix .vditor-reset input[type="checkbox"]').first()
            assert.ok(await cb.count() >= 1) //①前提
            let checked0 = await cb.isChecked()
            await cb.click()
            await page.waitForTimeout(800) //負向觀察窗: 點擊後不得勾選、改動或回傳
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(await cb.isChecked(), checked0) //②
            assert.strictEqual(s1.text, s0.text) //③
            assert.strictEqual(info.mdout, DOCS.TASKS) //④
            assert.deepStrictEqual(info.inputs, []) //⑤
            assert.strictEqual(s1.undoDisabled, true) //⑥
            let img = page.locator('.WVditorFix .vditor-reset img').first()
            assert.ok(await img.count() >= 1) //⑦前提
            await img.click()
            await page.waitForTimeout(500) //負向觀察窗: 不得出現可編輯之圖片彈窗
            let nInputs = await page.evaluate(() => [...document.querySelectorAll('.WVditorFix .vditor-panel input')].filter((e) => e.offsetParent !== null).length)
            assert.strictEqual(nInputs, 0) //⑦
            assert.deepStrictEqual(logs, []) //⑧
        })

    }

    for (let mode of MODES_RICH) {

        //E2E-010 唯讀時點擊內容下方空白處不新增段落
        //①起點: 示範宿主頁, 唯讀之BELOW ②點擊: 內容下方空白處、「設為可編輯」、最後一段 ③看到: 段落數不變 ④輸入: Ctrl+End、Q ⑤之後: Q接於最後一段 ⑥副作用: 回傳末段文字Q
        it(`E2E-010 [${MODE_NAMES[mode]}] 唯讀時點擊內容下方空白處不新增段落`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, doc: 'BELOW', editable: '0' })
            let count = () => page.evaluate(() => [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null).children.length)
            let n0 = await count()
            let pt = await page.evaluate(() => {
                let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
                let r = ed.getBoundingClientRect()
                let rl = ed.lastElementChild.getBoundingClientRect()
                return { x: r.left + r.width / 2, y: Math.min(r.bottom - 10, rl.bottom + 40) }
            })
            await page.mouse.click(pt.x, pt.y) //L2真滑鼠: 內容下方空白處
            await page.waitForTimeout(500) //負向觀察窗: 不得新增段落
            assert.strictEqual(await count(), n0) //①
            await hostButton(page, '設為可編輯').click()
            await waitEditable(page, true)
            await page.locator('.WVditorFix .vditor-reset[contenteditable]:visible p').last().click()
            await page.keyboard.press('Control+End')
            await page.keyboard.type('Q')
            let info = await waitInputs(page, '回傳結尾為Q', { lastEndsWith: 'Q' })
            assert.strictEqual(info.inputs[info.inputs.length - 1].trimEnd(), '# 標題\n\n末段文字Q') //②
            assert.deepStrictEqual(logs, []) //③
        })

    }

    for (let mode of MODES_RICH) {

        //E2E-011 唯讀時於內容中之輸入框打字不回傳
        //①起點: 示範宿主頁, 唯讀之FORM ②點擊: 搜尋框 ③看到: 焦點移至內容中之輸入框 ④輸入: Tab若干次、Z ⑤之後: 無回傳 ⑥副作用: 頁面內容不變
        it(`E2E-011 [${MODE_NAMES[mode]}] 唯讀時於內容中之輸入框打字不回傳`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, doc: 'FORM', editable: '0' })
            let reached = await tabUntil(page, (p) => p.evaluate(() => {
                let ae = document.activeElement
                return !!ae && ae.tagName === 'INPUT' && !!ae.closest('.WVditorFix .vditor-reset')
            }))
            assert.strictEqual(reached, true) //①前提
            await page.keyboard.type('Z')
            await page.waitForTimeout(1000) //負向觀察窗: 涵蓋回傳防抖, 不得回傳
            let info = await hostInfo(page)
            assert.deepStrictEqual(info.inputs, []) //②
            assert.strictEqual(info.mdout, DOCS.FORM) //③
            assert.deepStrictEqual(logs, []) //④
        })

    }

    for (let mode of MODES_RICH) {

        //E2E-012 鎖定後點擊停用之「標題」不吞掉最後輸入
        //①起點: 示範宿主頁, 回傳防抖600ms, 上傳期間唯讀3秒 ②點擊: 編輯區、工具列「標題」 ③看到: 「標題」停用 ④輸入: Z、Ctrl+S ⑤之後: Z照常回傳 ⑥副作用: 回傳恰1次
        it(`E2E-012 [${MODE_NAMES[mode]}] 鎖定後點擊停用之「標題」不吞掉最後輸入`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, writeMode: 'none', hintTimeDetect: '600', saveLock: '3000' })
            await typeAtEnd(page, 'Z')
            await page.keyboard.press('Control+s')
            await waitUntilExist(page, '「標題」已停用', () => {
                let b = document.querySelector('.WVditorFix .vditor-toolbar button[data-type="headings"]')
                return !!b && b.classList.contains('vditor-menu--disabled')
            })
            let disabled = await toolbarButton(page, 'headings').evaluate((b) => b.classList.contains('vditor-menu--disabled'))
            assert.strictEqual(disabled, true) //①前提
            await toolbarButton(page, 'headings').click()
            await waitInputs(page, '鎖定前之輸入回傳', { count: 1 })
            await page.waitForTimeout(600) //負向觀察窗: 不得重複回傳
            let info = await hostInfo(page)
            assert.strictEqual(info.inputs.length, 1) //②
            assert.ok(info.inputs[0].trimEnd().endsWith('Z'), JSON.stringify(info.inputs)) //②
            assert.deepStrictEqual(logs, []) //③
        })

    }

})
