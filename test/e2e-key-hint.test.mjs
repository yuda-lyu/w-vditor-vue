//e2e-key-hint: 提示區插入(spec/流程_提示區插入.md)
//每個it為一個E2E-NNN×一種編輯模式, 每案全新瀏覽器; 操作只經編輯器之真鍵盤滑鼠、提示區項目與示範宿主頁(test/host/index.html)之Ctrl+S儲存
//提示區開啟中之頁面動作一律以鍵盤(Ctrl+S)觸發: 提示區以點擊外部關閉, 以點擊觸發將無法分辨關閉原因
//斷言註解之①②…對應spec該案「驗證／語意」之編號
import assert from 'assert'
import {
    MODES, MODE_NAMES, DOCS, visText, launchBrowser, createFlow,
    waitEditable, waitInputs, waitMdoutSynced, waitStatus, states, hostInfo,
    editor, hintItem, typeAtEnd
} from './tools/e2e-setup.mjs'


let flow = createFlow('key-hint')


describe('e2e-key-hint：提示區插入', function() {

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

        //E2E-001 點選提示項目插入內容(以「/ht」為例)
        //①起點: 示範宿主頁, 觸發字串「/ht」 ②點擊: 編輯區、提示區之「插入XYZ」 ③看到: 提示區出現後插入XYZ ④輸入: 「 /ht」、QQ ⑤之後: QQ接於XYZ之後 ⑥副作用: 頁面只收到一次插入後之內容
        it(`E2E-001 [${MODE_NAMES[mode]}] 點選提示項目插入內容（以「/ht」為例）`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, keyHint: '/ht' })
            await typeAtEnd(page, ' /ht')
            await waitInputs(page, '回傳結尾為觸發字串', { lastEndsWith: '/ht' })
            await hintItem(page).waitFor({ state: 'visible', timeout: 5000 })
            let n0 = (await hostInfo(page)).inputs.length
            await hintItem(page).click()
            await waitInputs(page, '插入後回傳含XYZ', { count: n0 + 1, lastIncludes: 'XYZ' })
            await page.waitForTimeout(1500) //負向觀察窗: 涵蓋提示偵測輪詢(50ms)與回傳防抖, 確認不再有第二次回傳且提示區不重現
            let [s] = await states(page)
            let info = await hostInfo(page)
            let added = info.inputs.slice(n0)
            assert.ok(s.text.includes('XYZ'), s.text) //①
            assert.ok(!s.text.includes('/ht'), s.text) //①
            assert.strictEqual(added.length, 1, JSON.stringify(added)) //②
            assert.ok(!added[0].includes('/ht'), added[0]) //②
            assert.strictEqual(info.mdout, added[0]) //③
            assert.strictEqual(await hintItem(page).isVisible(), false) //④
            assert.strictEqual(s.undoDisabled, false) //⑤
            await page.keyboard.type('QQ', { delay: 150 })
            await waitInputs(page, '回傳含XYZQQ', { lastIncludes: 'XYZQQ' })
            let [s2] = await states(page)
            assert.ok(s2.text.includes('XYZQQ'), s2.text) //⑥
            assert.ok(s2.text.startsWith('標題') || s2.text.startsWith('# 標題'), s2.text) //⑦
            assert.deepStrictEqual(logs, []) //⑧
        })

    }

    for (let mode of MODES) {

        //E2E-002 中段觸發時只移除本次觸發字串(以「@」為例)
        //①起點: 示範宿主頁, 文件MAIL, 觸發字串「@」 ②點擊: 「第一段內容」、提示區之「插入XYZ」 ③看到: 提示區出現 ④輸入: End、「 @」、QQ ⑤之後: 後文a@b.com不變 ⑥副作用: 頁面持有之內容與最後回傳一致
        it(`E2E-002 [${MODE_NAMES[mode]}] 中段觸發時只移除本次觸發字串（以「@」為例）`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, keyHint: '@', doc: 'MAIL' })
            if (mode === 'sv') {
                //分割預覽之編輯區為原始碼, 以鍵盤移至第3行(第一段內容)
                await editor(page).click()
                await page.keyboard.press('Control+Home')
                await page.keyboard.press('ArrowDown')
                await page.keyboard.press('ArrowDown')
            }
            else {
                await editor(page).getByText('第一段內容', { exact: true }).click()
            }
            await page.keyboard.press('End')
            await page.keyboard.type(' @', { delay: 150 })
            await waitInputs(page, '回傳含觸發字串', { lastMatches: '第一段內容\\s@' })
            await hintItem(page).waitFor({ state: 'visible', timeout: 5000 })
            await hintItem(page).click()
            await waitInputs(page, '插入後回傳含XYZ', { lastIncludes: 'XYZ' })
            await page.keyboard.type('QQ', { delay: 150 })
            await waitInputs(page, '回傳含XYZQQ', { lastIncludes: 'XYZQQ' })
            await waitMdoutSynced(page)
            let [s] = await states(page)
            let info = await hostInfo(page)
            assert.ok(s.text.includes('第一段內容 XYZQQ'), s.text) //①
            assert.ok(s.text.includes('a@b.com'), s.text) //②
            assert.ok(info.mdout.includes('a@b.com') && !info.mdout.includes(' @XYZ'), info.mdout) //③
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

    for (let mode of MODES) {

        //E2E-003 提示區開啟中伺服器回傳新內容時提示區關閉
        //①起點: 示範宿主頁, 觸發字串「/ht」, 伺服器0.3秒後回傳SERVER ②點擊: 編輯區 ③看到: 提示區出現 ④輸入: 「 /ht」、Ctrl+S ⑤之後: 提示區關閉、顯示伺服器內容 ⑥副作用: 載入不回傳
        it(`E2E-003 [${MODE_NAMES[mode]}] 提示區開啟中伺服器回傳新內容時提示區關閉`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, keyHint: '/ht', saveReply: 'server', saveReplyAt: '300' })
            await typeAtEnd(page, ' /ht', { delay: 150 })
            await waitInputs(page, '回傳結尾為觸發字串', { lastEndsWith: '/ht' })
            await hintItem(page).waitFor({ state: 'visible', timeout: 5000 })
            let n0 = (await hostInfo(page)).inputs.length
            await page.keyboard.press('Control+s')
            await waitStatus(page, '已儲存')
            await page.waitForTimeout(600) //負向觀察窗: 提示區不得重現、載入不得回傳
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(await hintItem(page).isVisible(), false) //①
            assert.strictEqual(s1.text, visText(mode, DOCS.SERVER)) //②
            assert.strictEqual(info.inputs.length, n0) //③
            assert.deepStrictEqual(logs, []) //④
        })

    }

    for (let mode of MODES) {

        //E2E-004 提示區開啟中儲存鎖定時提示區關閉
        //①起點: 示範宿主頁, 觸發字串「/ht」, 上傳期間唯讀3秒 ②點擊: 編輯區 ③看到: 提示區出現 ④輸入: 「 /ht」、Ctrl+S ⑤之後: 提示區關閉、內容不變 ⑥副作用: 無回傳
        it(`E2E-004 [${MODE_NAMES[mode]}] 提示區開啟中儲存鎖定時提示區關閉`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, keyHint: '/ht', saveLock: '3000' })
            await typeAtEnd(page, ' /ht', { delay: 150 })
            await waitInputs(page, '回傳結尾為觸發字串', { lastEndsWith: '/ht' })
            await hintItem(page).waitFor({ state: 'visible', timeout: 5000 })
            let n0 = (await hostInfo(page)).inputs.length
            await page.keyboard.press('Control+s')
            await waitEditable(page, false)
            await page.waitForTimeout(600) //負向觀察窗: 提示區不得重現、不得回傳
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(await hintItem(page).isVisible(), false) //①
            assert.ok(s1.text.endsWith('/ht'), s1.text) //②
            assert.strictEqual(info.inputs.length, n0) //③
            assert.strictEqual(s1.undoDisabled, true) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

    //E2E-005 註冊多組觸發字串時依輸入者顯示提示區
    //①起點: 示範宿主頁, 觸發字串「/ht」與「/kw」 ②點擊: 編輯區、提示區之「插入XYZ」 ③看到: 提示區標示「/kw」 ④輸入: 「 /kw」 ⑤之後: 「/kw」被移除並插入XYZ ⑥副作用: 頁面收到插入後之內容
    it(`E2E-005 [${MODE_NAMES.wysiwyg}] 註冊多組觸發字串時依輸入者顯示提示區`, async function() {
        let { page, logs } = await flow.openReady(browser, { keyHint: '/ht,/kw' })
        await typeAtEnd(page, ' /kw')
        await waitInputs(page, '回傳結尾為/kw', { lastEndsWith: '/kw' })
        await hintItem(page).waitFor({ state: 'visible', timeout: 5000 })
        let key = (await page.locator('.hintKey').innerText()).trim()
        assert.strictEqual(key, '/kw') //①
        await hintItem(page).click()
        await waitInputs(page, '插入後回傳含XYZ', { lastIncludes: 'XYZ' })
        let [s] = await states(page)
        assert.ok(s.text.includes('XYZ'), s.text) //②
        assert.ok(!s.text.includes('/kw'), s.text) //②
        assert.deepStrictEqual(logs, []) //③
    })

    //E2E-006 觸發字串前非空白時不出現提示區
    //①起點: 示範宿主頁, 觸發字串「/ht」 ②點擊: 編輯區 ③看到: 提示區不出現 ④輸入: 「a/ht」 ⑤之後: 文字照常保留 ⑥副作用: 頁面收到含a/ht之內容
    it(`E2E-006 [${MODE_NAMES.wysiwyg}] 觸發字串前非空白時不出現提示區`, async function() {
        let { page, logs } = await flow.openReady(browser, { keyHint: '/ht' })
        await typeAtEnd(page, 'a/ht')
        await waitInputs(page, '回傳結尾為a/ht', { lastEndsWith: 'a/ht' })
        await page.waitForTimeout(1500) //負向觀察窗: 涵蓋提示偵測輪詢, 提示區不得出現
        let [s] = await states(page)
        assert.strictEqual(await hintItem(page).isVisible(), false) //①
        assert.ok(s.text.endsWith('a/ht'), s.text) //②
        assert.deepStrictEqual(logs, []) //③
    })

})
