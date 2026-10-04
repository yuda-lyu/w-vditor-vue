//e2e-editing: 編輯與回傳(spec/流程_編輯與回傳.md)
//每個it為一個E2E-NNN×一種編輯模式, 每案全新瀏覽器; 操作只經示範宿主頁(test/host/index.html)之欄位與編輯器之真鍵盤滑鼠, 頁面回寫方式於開頁時設定
//斷言註解之①②…對應spec該案「驗證／語意」之編號
import assert from 'assert'
import {
    MODES, MODE_NAMES, DOCS, launchBrowser, createFlow,
    waitText, waitInputs, waitMdoutSynced, states, hostInfo,
    editor, toolbarButton, clickEnd, typeAtEnd, startSampler, stopSampler, checkTypingSamples, endsAfter
} from './tools/e2e-setup.mjs'
import { waitUntilExist } from './tools/e2eLib.mjs'


let flow = createFlow('editing')


describe('e2e-editing：編輯與回傳', function() {

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

    //runTyping, E2E-001～006之共同流程: 逐鍵輸入abcd → 輸入Y → 按一次「復原」
    //①起點: 示範宿主頁(回寫方式依案例) ②點擊: 編輯區、「復原」 ③看到: 逐字出現且不重載 ④輸入: abcd(每鍵150ms)、Y ⑤之後: 復原撤銷Y ⑥副作用: 頁面收到回傳並依方式回寫
    let runTyping = async (query) => {
        let { page, logs, base } = await flow.openReady(browser, query)
        let writeBack = query.writeMode !== 'none'
        await startSampler(page)
        await typeAtEnd(page, 'abcd', { delay: 150 })
        await waitInputs(page, '回傳結尾為abcd', { lastEndsWith: 'abcd' })
        if (writeBack) {
            await waitMdoutSynced(page)
        }
        let samples = await stopSampler(page)
        assert.strictEqual(checkTypingSamples(samples, base, 'abcd'), '') //①
        let [s1] = await states(page)
        let info1 = await hostInfo(page)
        assert.strictEqual(endsAfter(s1.text, base), 'abcd') //②
        if (writeBack) {
            assert.strictEqual(info1.mdout.trimEnd(), info1.inputs[info1.inputs.length - 1].trimEnd()) //③
        }
        else {
            assert.strictEqual(info1.mdout, DOCS.ORI) //③(不回寫時頁面內容不變)
        }
        await page.keyboard.type('Y')
        await waitInputs(page, '回傳結尾為abcdY', { lastEndsWith: 'abcdY' })
        if (writeBack) {
            await waitMdoutSynced(page)
        }
        let [s2] = await states(page)
        assert.strictEqual(endsAfter(s2.text, base), 'abcdY') //④
        await page.waitForTimeout(600) //停頓: 使最後一字寫入復原紀錄(分割預覽於回傳後另以100ms防抖寫入, vditor/src/ts/sv/process.ts, 無可觀察訊號)
        await toolbarButton(page, 'undo').click()
        await waitText(page, '復原一次後結尾為abcd', { endsWith: 'abcd' })
        let [s3] = await states(page)
        assert.strictEqual(endsAfter(s3.text, base), 'abcd') //⑤
        assert.deepStrictEqual(logs, []) //⑥
    }

    for (let [no, title, writeMode] of [
        ['E2E-001', '逐字輸入時頁面同步回寫', 'sync'],
        ['E2E-002', '頁面延後一拍回寫時輸入不受影響', 'micro'],
        ['E2E-003', '頁面於停止輸入後才回寫時輸入不受影響', 'debounce300'],
        ['E2E-004', '頁面修整結尾空白後回寫時輸入不受影響', 'trim'],
        ['E2E-005', '頁面不回寫時輸入照常且頁面內容不變', 'none'],
    ]) {
        for (let mode of MODES) {

            it(`${no} [${MODE_NAMES[mode]}] ${title}`, async function() {
                await runTyping({ mode, writeMode })
            })

        }
    }

    //E2E-006 頁面自備語系資料時逐字輸入正常(流程同runTyping)
    it(`E2E-006 [${MODE_NAMES.wysiwyg}] 頁面自備語系資料時逐字輸入正常`, async function() {
        await runTyping({ i18n: '1', writeMode: 'sync' })
    })

    for (let mode of MODES) {

        //E2E-007 中文輸入法組字完整接於末尾
        //①起點: 示範宿主頁 ②點擊: 編輯區 ③看到: 組字中之注音 ④輸入: 以輸入法組「中」「文」「字」 ⑤之後: 選字結果接於末尾 ⑥副作用: 頁面收到回傳並寫回
        it(`E2E-007 [${MODE_NAMES[mode]}] 中文輸入法組字完整接於末尾`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode, writeMode: 'sync' })
            await clickEnd(page)
            //輸入法組字: Playwright無組字API, 以瀏覽器輸入管線之輸入法指令(CDP Input)送出, 屬L1.5(CLAUDE_rulebook.md偏離與依據)
            let client = await page.context().newCDPSession(page)
            for (let [comp, word] of [['ㄓㄨㄥ', '中'], ['ㄨㄣˊ', '文'], ['ㄗˋ', '字']]) {
                await client.send('Input.imeSetComposition', { text: comp.slice(0, 1), selectionStart: 1, selectionEnd: 1 })
                await page.waitForTimeout(120) //操作節奏: 逐鍵組字
                await client.send('Input.imeSetComposition', { text: comp, selectionStart: comp.length, selectionEnd: comp.length })
                await page.waitForTimeout(120) //操作節奏: 逐鍵組字
                await client.send('Input.insertText', { text: word })
                await page.waitForTimeout(350) //操作節奏: 每字選定後停頓, 逾回傳防抖(100ms)使每字皆回傳並寫回
            }
            await client.detach()
            await waitInputs(page, '回傳結尾為中文字', { lastEndsWith: '中文字' })
            await waitMdoutSynced(page)
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(endsAfter(s1.text, base), '中文字') //①
            assert.ok(s1.text.startsWith(base), s1.text) //②
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //③
            assert.deepStrictEqual(logs, []) //④
        })

    }

    for (let mode of MODES) {

        //E2E-008 回傳內容同步顯示於另一個編輯器
        //①起點: 示範宿主頁, 另一個編輯器綁定同一份內容 ②點擊: 第一個編輯區 ③看到: 逐字出現 ④輸入: abcd(每鍵150ms) ⑤之後: 另一個編輯器顯示相同內容 ⑥副作用: 頁面收到回傳並寫回
        it(`E2E-008 [${MODE_NAMES[mode]}] 回傳內容同步顯示於另一個編輯器`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode, shared: '1' })
            await startSampler(page, 0)
            await typeAtEnd(page, 'abcd', { delay: 150, i: 0 })
            await waitInputs(page, '回傳結尾為abcd', { lastEndsWith: 'abcd' })
            await waitMdoutSynced(page)
            await waitUntilExist(page, '另一個編輯器顯示相同內容', () => {
                let txt = [...document.querySelectorAll('.WVditorFix')].map((fix) => {
                    let ed = [...fix.querySelectorAll('.vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
                    return ed ? ed.innerText.trim().replace(/\s+/g, ' ') : null
                })
                return txt.length === 2 && txt[0] === txt[1]
            })
            let samples = await stopSampler(page)
            let [a1, b1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(checkTypingSamples(samples, base, 'abcd'), '') //①
            assert.strictEqual(endsAfter(a1.text, base), 'abcd') //②
            assert.strictEqual(b1.text, a1.text) //③
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

    for (let mode of MODES) {

        //E2E-009 貼上後立即回傳且接著輸入接於末尾
        //①起點: 示範宿主頁 ②點擊: 「備忘」欄、編輯區 ③看到: 貼上內容出現於末尾 ④輸入: Ctrl+A、Ctrl+C、Ctrl+V、Y ⑤之後: Y接於貼上內容之後 ⑥副作用: 頁面收到回傳並寫回
        it(`E2E-009 [${MODE_NAMES[mode]}] 貼上後立即回傳且接著輸入接於末尾`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode })
            await page.getByRole('textbox', { name: '備忘' }).click()
            await page.keyboard.press('Control+a')
            await page.keyboard.press('Control+c')
            await clickEnd(page)
            await page.keyboard.press('Control+v')
            await waitInputs(page, '回傳含PASTE', { lastIncludes: DOCS.NOTE })
            await page.keyboard.type('Y')
            await waitInputs(page, '回傳結尾為Y', { lastEndsWith: `${DOCS.NOTE}Y` })
            await waitMdoutSynced(page)
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.ok(s1.text.startsWith(base), s1.text) //①
            assert.strictEqual(s1.text.slice(base.length).replace(/\s+/g, ''), `${DOCS.NOTE}Y`) //②
            assert.ok(info.inputs.length >= 2, JSON.stringify(info.inputs)) //③
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

    for (let mode of MODES) {

        //E2E-010 選取文字後點擊「粗體」立即回傳
        //①起點: 示範宿主頁 ②點擊: 編輯區、工具列「粗體」 ③看到: 文字套用粗體 ④輸入: abc、Shift+←×3、End、Y ⑤之後: Y接於末尾 ⑥副作用: 頁面收到含粗體標記之回傳
        it(`E2E-010 [${MODE_NAMES[mode]}] 選取文字後點擊「粗體」立即回傳`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode })
            await typeAtEnd(page, 'abc', { delay: 150 })
            let info0 = await waitInputs(page, '回傳結尾為abc', { lastEndsWith: 'abc' })
            let n0 = info0.inputs.length
            await page.keyboard.down('Shift')
            for (let k = 0; k < 3; k++) {
                await page.keyboard.press('ArrowLeft')
            }
            await page.keyboard.up('Shift')
            await toolbarButton(page, 'bold').click()
            await waitInputs(page, '回傳含粗體標記', { lastIncludes: '**abc**' })
            await waitMdoutSynced(page)
            let [s1] = await states(page)
            let info1 = await hostInfo(page)
            assert.ok(s1.text.startsWith(base), s1.text) //①
            assert.ok(info1.inputs.length > n0, JSON.stringify(info1.inputs)) //②
            assert.ok(info1.mdout.includes('**abc**'), info1.mdout) //③
            assert.strictEqual(info1.mdout.trimEnd(), info1.inputs[info1.inputs.length - 1].trimEnd()) //④
            let n1 = info1.inputs.length
            await page.keyboard.press('End')
            await page.keyboard.type('Y')
            await waitText(page, '編輯區去除空白後以Y結尾', { endsWith: 'Y' })
            await waitInputs(page, '輸入Y後之回傳', { count: n1 + 1 })
            let [s2] = await states(page)
            assert.ok(s2.text.startsWith(base), s2.text) //⑤
            assert.ok(s2.text.replace(/\s+/g, '').endsWith('Y'), s2.text) //⑤
            assert.deepStrictEqual(logs, []) //⑥
        })

    }

    for (let mode of MODES) {

        //E2E-011 鍵盤復原與重做立即回傳
        //①起點: 示範宿主頁 ②點擊: 編輯區 ③看到: 逐字出現 ④輸入: abc、Ctrl+Z、Ctrl+Y、Y ⑤之後: 復原、重做後內容與頁面一致 ⑥副作用: 每次皆回傳
        it(`E2E-011 [${MODE_NAMES[mode]}] 鍵盤復原與重做立即回傳`, async function() {
            let { page, logs, base } = await flow.openReady(browser, { mode })
            await typeAtEnd(page, 'abc', { delay: 150 })
            await waitInputs(page, '回傳結尾為abc', { lastEndsWith: 'abc' })
            await page.waitForTimeout(600) //停頓: 使最後一字寫入復原紀錄(分割預覽於回傳後另以100ms防抖寫入, 無可觀察訊號)
            await page.keyboard.press('Control+z')
            await waitText(page, '復原後結尾為ab', { endsWith: 'ab' })
            await waitInputs(page, '復原後回傳結尾為ab', { lastEndsWith: 'ab' })
            await waitMdoutSynced(page)
            let [s1] = await states(page)
            let info1 = await hostInfo(page)
            assert.strictEqual(endsAfter(s1.text, base), 'ab') //①
            assert.strictEqual(info1.mdout.trimEnd(), info1.inputs[info1.inputs.length - 1].trimEnd()) //①
            await page.keyboard.press('Control+y')
            await waitText(page, '重做後結尾為abc', { endsWith: 'abc' })
            await waitInputs(page, '重做後回傳結尾為abc', { lastEndsWith: 'abc' })
            await waitMdoutSynced(page)
            let [s2] = await states(page)
            let info2 = await hostInfo(page)
            assert.strictEqual(endsAfter(s2.text, base), 'abc') //②
            assert.strictEqual(info2.mdout.trimEnd(), info2.inputs[info2.inputs.length - 1].trimEnd()) //②
            await page.keyboard.type('Y')
            await waitInputs(page, '回傳結尾為abcY', { lastEndsWith: 'abcY' })
            let [s3] = await states(page)
            assert.strictEqual(endsAfter(s3.text, base), 'abcY') //③
            assert.deepStrictEqual(logs, []) //④
        })

    }

    for (let mode of MODES) {

        //E2E-012 全選刪除後重新輸入只留新內容
        //①起點: 示範宿主頁 ②點擊: 編輯區 ③看到: 內容清空 ④輸入: Ctrl+A、Backspace、NEW(每鍵150ms) ⑤之後: 只剩NEW ⑥副作用: 頁面持有之內容為NEW
        it(`E2E-012 [${MODE_NAMES[mode]}] 全選刪除後重新輸入只留新內容`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode })
            await editor(page).click()
            await page.keyboard.press('Control+a')
            await page.keyboard.press('Backspace')
            await page.waitForTimeout(300) //刪除後之重繪settle(編輯器重建空白段落), 之後才輸入
            await page.keyboard.type('NEW', { delay: 150 })
            await waitInputs(page, '回傳結尾為NEW', { lastEndsWith: 'NEW' })
            await waitMdoutSynced(page)
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(s1.text, 'NEW') //①
            assert.strictEqual(info.mdout.trimEnd(), 'NEW') //②
            assert.deepStrictEqual(logs, []) //③
        })

    }

})
