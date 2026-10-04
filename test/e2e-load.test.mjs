//e2e-load: 編輯器載入與關閉(spec/流程_編輯器載入與關閉.md)
//每個it為一個E2E-NNN×一種編輯模式, 每案全新瀏覽器; 操作只經示範宿主頁(test/host/index.html)之按鈕與編輯器之真鍵盤滑鼠, 頁面行為與網路條件於開頁時設定
//斷言註解之①②…對應spec該案「驗證／語意」之編號
import assert from 'assert'
import {
    MODES, MODE_NAMES, DOCS, visText, launchBrowser, createFlow,
    waitReady, waitHostMounted, waitMounted, loadingState, waitUndo, waitText, waitInputs, states, exportMenuItems, hostInfo, globalListeners, waitAsset,
    toolbarButton, hostButton, clickEnd, typeAtEnd, endsAfter
} from './tools/e2e-setup.mjs'


let flow = createFlow('load')


describe('e2e-load：編輯器載入與關閉', function() {

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

    //baseListeners, 對照頁(開頁時不顯示編輯器)之全域監聽數; 以偵測等待確認掛載, 使Playwright注入之命中檢查監聽與受測頁相同(見globalListeners)
    let baseListeners = async () => {
        let { page, context } = await flow.openCase(browser, { hide: '1' })
        await waitHostMounted(page)
        let n = await globalListeners(page)
        await context.close()
        return n
    }

    //closeEditor, 點擊「關閉編輯器」並等編輯器移除
    let closeEditor = async (page) => {
        await hostButton(page, '關閉編輯器').click()
        await page.locator('.WVditorFix').waitFor({ state: 'detached' })
    }

    //I18N_FAIL_MSG, vditor於語系檔載入失敗時顯示之訊息(示範頁之語系檔位置)
    let I18N_FAIL_MSG = 'GET /node_modules/vditor/dist/js/i18n/zh_TW.js net::ERR_ABORTED 404 (Not Found)'

    for (let mode of MODES) {

        //E2E-001 開啟文件後顯示內容且「復原」停用
        //①起點: 示範宿主頁, 預設文件ORI ②點擊: 工具列「復原」、編輯區 ③看到: 文件內容且「復原」停用 ④輸入: Ctrl+End、Ctrl+Z ⑤之後看到: 內容不變 ⑥副作用: 頁面未收到回傳
        it(`E2E-001 [${MODE_NAMES[mode]}] 開啟文件後顯示內容且「復原」停用`, async function() {
            let { page, logs, external } = await flow.openCase(browser, { mode })
            await waitReady(page)
            await page.waitForTimeout(1500) //負向觀察窗: 涵蓋載入後延後寫入復原紀錄之防抖(100ms), 確認載入不回傳且「復原」維持停用
            let [s0] = await states(page)
            let info0 = await hostInfo(page)
            assert.strictEqual(s0.text, visText(mode, DOCS.ORI)) //①
            assert.deepStrictEqual(info0.inputs, []) //②
            assert.strictEqual(s0.undoDisabled, true) //③
            await toolbarButton(page, 'undo').click()
            await page.waitForTimeout(600) //負向觀察窗: 點擊停用之「復原」後不得改動內容或回傳
            let [s1] = await states(page)
            assert.strictEqual(s1.text, s0.text) //④
            assert.deepStrictEqual((await hostInfo(page)).inputs, []) //④
            await clickEnd(page)
            await page.keyboard.press('Control+z')
            await page.waitForTimeout(600) //負向觀察窗: Ctrl+Z後不得改動內容或回傳
            let [s2] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(s2.text, s0.text) //⑤
            assert.deepStrictEqual(info.inputs, []) //⑤
            assert.strictEqual(info.mdout, DOCS.ORI) //⑥
            assert.deepStrictEqual(external, []) //⑦
            assert.deepStrictEqual(logs, []) //⑧
        })

    }

    for (let mode of MODES) {

        //E2E-002 輸入後按「復原」回到開啟時內容
        //①起點: 示範宿主頁 ②點擊: 編輯區 ③看到: 文件內容 ④輸入: Ctrl+End後ZZZ ⑤之後: 點「復原」兩次, 回到開啟時內容 ⑥副作用: 頁面最後收到開啟時內容
        it(`E2E-002 [${MODE_NAMES[mode]}] 輸入後按「復原」回到開啟時內容`, async function() {
            let { page, logs } = await flow.openCase(browser, { mode })
            await waitReady(page)
            await page.waitForTimeout(1500) //就緒後之settle: 涵蓋載入後延後寫入復原紀錄(100ms), 使之後之輸入為獨立之復原步驟
            let [s0] = await states(page)
            let base = s0.text
            await typeAtEnd(page, 'ZZZ')
            await waitInputs(page, '回傳結尾為ZZZ', { lastEndsWith: 'ZZZ' })
            await waitUndo(page, false)
            let [s1] = await states(page)
            assert.strictEqual(endsAfter(s1.text, base), 'ZZZ') //①
            assert.strictEqual(s1.undoDisabled, false) //①
            await page.waitForTimeout(600) //停頓: 使最後輸入寫入復原紀錄(分割預覽於回傳後另以100ms防抖寫入, 無可觀察訊號)
            await toolbarButton(page, 'undo').click()
            await waitText(page, '復原後回到開啟時內容', { equals: base })
            await waitUndo(page, true)
            let [s2] = await states(page)
            assert.strictEqual(s2.text, base) //②
            assert.strictEqual(s2.undoDisabled, true) //②
            await toolbarButton(page, 'undo').click()
            await page.waitForTimeout(600) //負向觀察窗: 已在復原起點, 再點擊不得越過
            let [s3] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(s3.text, base) //③
            assert.strictEqual(info.inputs[info.inputs.length - 1].trimEnd(), DOCS.ORI.trimEnd()) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

    for (let mode of MODES) {

        //E2E-003 網路較慢時仍顯示文件內容
        //①起點: 示範宿主頁, 排版引擎延後1.5秒 ②點擊: 無 ③看到: 載入圖示後顯示文件內容 ④輸入: 無 ⑤之後: 「復原」停用 ⑥副作用: 頁面未收到回傳
        it(`E2E-003 [${MODE_NAMES[mode]}] 網路較慢時仍顯示文件內容`, async function() {
            let { page, logs } = await flow.openCase(browser, { mode }, { luteDelay: 1500 })
            await waitReady(page)
            await page.waitForTimeout(1500) //負向觀察窗: 涵蓋延後寫入復原紀錄之防抖
            let [s] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(s.text, visText(mode, DOCS.ORI)) //①
            assert.strictEqual(s.undoDisabled, true) //②
            assert.deepStrictEqual(info.inputs, []) //③
            assert.strictEqual(info.mdout, DOCS.ORI) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

    //E2E-004 頁面自備語系資料時顯示文件內容
    //①起點: 示範宿主頁, 頁面自備語系資料 ②點擊: 無 ③看到: 文件內容 ④輸入: 無 ⑤之後: 「復原」停用 ⑥副作用: 頁面未收到回傳
    it(`E2E-004 [${MODE_NAMES.wysiwyg}] 頁面自備語系資料時顯示文件內容`, async function() {
        let { page, logs } = await flow.openCase(browser, { i18n: '1' })
        await waitReady(page)
        await page.waitForTimeout(1500) //負向觀察窗: 涵蓋延後寫入復原紀錄之防抖
        let [s] = await states(page)
        let info = await hostInfo(page)
        assert.strictEqual(s.text, visText('wysiwyg', DOCS.ORI)) //①
        assert.strictEqual(s.undoDisabled, true) //②
        assert.deepStrictEqual(info.inputs, []) //③
        assert.deepStrictEqual(logs, []) //④
    })

    //E2E-005 關閉後重新開啟編輯器仍顯示內容
    //①起點: 示範宿主頁 ②點擊: 「關閉編輯器」、「開啟編輯器」 ③看到: 編輯器消失後重新出現 ④輸入: 無 ⑤之後: 顯示文件內容且「復原」停用 ⑥副作用: 無
    it(`E2E-005 [${MODE_NAMES.wysiwyg}] 關閉後重新開啟編輯器仍顯示內容`, async function() {
        let { page, logs } = await flow.openCase(browser, {})
        await waitReady(page)
        await hostButton(page, '關閉編輯器').click()
        await page.locator('.WVditorFix').waitFor({ state: 'detached' })
        await hostButton(page, '開啟編輯器').click()
        await waitReady(page)
        await page.waitForTimeout(1500) //負向觀察窗: 涵蓋延後寫入復原紀錄之防抖
        let [s] = await states(page)
        assert.strictEqual(s.text, visText('wysiwyg', DOCS.ORI)) //①
        assert.strictEqual(s.undoDisabled, true) //②
        assert.deepStrictEqual(logs, []) //③
    })

    //E2E-006 同頁兩個編輯器各自顯示內容
    //①起點: 示範宿主頁, 兩個編輯器 ②點擊: 無 ③看到: 兩個編輯器各自之文件 ④輸入: 無 ⑤之後: 兩個「復原」皆停用 ⑥副作用: 無
    it(`E2E-006 [${MODE_NAMES.wysiwyg}] 同頁兩個編輯器各自顯示內容`, async function() {
        let { page, logs } = await flow.openCase(browser, { instances: '2' })
        await waitReady(page)
        await page.waitForTimeout(1500) //負向觀察窗: 涵蓋延後寫入復原紀錄之防抖
        let ss = await states(page)
        assert.deepStrictEqual(ss.map((s) => s.text), [visText('wysiwyg', DOCS.ORI), visText('wysiwyg', DOCS.SECOND)]) //①
        assert.deepStrictEqual(ss.map((s) => s.undoDisabled), [true, true]) //②
        assert.deepStrictEqual(logs, []) //③
    })

    //E2E-007 網路較慢時兩個編輯器仍各自顯示內容
    //①起點: 示範宿主頁, 兩個編輯器, 排版引擎延後1.5秒 ②點擊: 無 ③看到: 兩個編輯器各自之文件 ④輸入: 無 ⑤之後: 無錯誤 ⑥副作用: 無
    it(`E2E-007 [${MODE_NAMES.wysiwyg}] 網路較慢時兩個編輯器仍各自顯示內容`, async function() {
        let { page, logs } = await flow.openCase(browser, { instances: '2' }, { luteDelay: 1500 })
        await waitReady(page)
        await page.waitForTimeout(1500) //負向觀察窗: 涵蓋延後寫入復原紀錄之防抖
        let ss = await states(page)
        assert.deepStrictEqual(ss.map((s) => s.text), [visText('wysiwyg', DOCS.ORI), visText('wysiwyg', DOCS.SECOND)]) //①
        assert.deepStrictEqual(logs, []) //②
    })

    //E2E-008 載入中收到資料時顯示最新資料
    //①起點: 示範宿主頁, 開啟時AAA, 50ms後送達BBB, 排版引擎延後1秒 ②點擊: 無 ③看到: 載入完成後顯示BBB ④輸入: 無 ⑤之後: 「復原」停用 ⑥副作用: 頁面未收到回傳
    it(`E2E-008 [${MODE_NAMES.wysiwyg}] 載入中收到資料時顯示最新資料`, async function() {
        let { page, logs } = await flow.openCase(browser, { doc: 'AAA', dataAt: '50', dataDoc: 'BBB' }, { luteDelay: 1000 })
        await waitReady(page)
        await page.waitForTimeout(1500) //負向觀察窗: 涵蓋延後寫入復原紀錄之防抖
        let [s] = await states(page)
        let info = await hostInfo(page)
        assert.strictEqual(info.loadingAtData, true) //①前提
        assert.strictEqual(s.text, DOCS.BBB) //②
        assert.strictEqual(info.mdout, DOCS.BBB) //③
        assert.strictEqual(s.undoDisabled, true) //④
        assert.deepStrictEqual(info.inputs, []) //⑤
        assert.deepStrictEqual(logs, []) //⑥
    })

    //E2E-009 自備語系資料且載入中收到資料
    //①起點: 示範宿主頁, 自備語系資料, 60ms後送達BBB, 排版引擎延後0.8秒 ②點擊: 無 ③看到: 顯示BBB ④輸入: 無 ⑤之後: 「復原」停用 ⑥副作用: 無錯誤
    it(`E2E-009 [${MODE_NAMES.wysiwyg}] 自備語系資料且載入中收到資料`, async function() {
        let { page, logs } = await flow.openCase(browser, { i18n: '1', dataAt: '60', dataDoc: 'BBB' }, { luteDelay: 800 })
        await waitReady(page)
        await page.waitForTimeout(1500) //負向觀察窗: 涵蓋延後寫入復原紀錄之防抖
        let [s] = await states(page)
        let info = await hostInfo(page)
        assert.strictEqual(s.text, DOCS.BBB) //①
        assert.strictEqual(s.undoDisabled, true) //②
        assert.deepStrictEqual(info.errs, []) //③
        assert.deepStrictEqual(logs, []) //④
    })

    //E2E-010 頁面給予空值時顯示空白
    //①起點: 示範宿主頁, 開啟時為空值 ②點擊: 編輯區、「清除內容」 ③看到: 空白編輯區 ④輸入: ZZZ ⑤之後: 清除後為空白 ⑥副作用: 回傳不含null
    it(`E2E-010 [${MODE_NAMES.wysiwyg}] 頁面給予空值時顯示空白`, async function() {
        let { page, logs } = await flow.openCase(browser, { doc: 'NULL' })
        await waitReady(page)
        await page.waitForTimeout(1000) //負向觀察窗: 載入不回傳
        let [s0] = await states(page)
        let info0 = await hostInfo(page)
        assert.strictEqual(s0.text, '') //①
        assert.deepStrictEqual(info0.inputs, []) //②
        await typeAtEnd(page, 'ZZZ')
        let info1 = await waitInputs(page, '回傳結尾為ZZZ', { lastEndsWith: 'ZZZ' })
        assert.ok(info1.inputs.every((v) => !v.includes('null')), JSON.stringify(info1.inputs)) //③
        assert.strictEqual(info1.inputs[info1.inputs.length - 1].trim(), 'ZZZ') //③
        await hostButton(page, '清除內容').click()
        await waitText(page, '清除後編輯區為空白', { equals: '' })
        let [s2] = await states(page)
        assert.strictEqual(s2.text, '') //④
        assert.deepStrictEqual(logs, []) //⑤
    })

    //E2E-011 頁面給予數字時以文字顯示
    //①起點: 示範宿主頁, 開啟時為數字12345 ②點擊: 無 ③看到: 「12345」 ④輸入: 無 ⑤之後: 無 ⑥副作用: 無錯誤
    it(`E2E-011 [${MODE_NAMES.wysiwyg}] 頁面給予數字時以文字顯示`, async function() {
        let { page, logs } = await flow.openCase(browser, { doc: 'NUM' })
        await waitReady(page)
        let [s] = await states(page)
        assert.strictEqual(s.text, '12345') //①
        assert.deepStrictEqual(logs, []) //②
    })

    //E2E-012 載入完成時通知頁面一次
    //①起點: 示範宿主頁, 記錄載入完成通知 ②點擊: 無 ③看到: 文件內容 ④輸入: 無 ⑤之後: 通知恰一次 ⑥副作用: 無
    it(`E2E-012 [${MODE_NAMES.wysiwyg}] 載入完成時通知頁面一次`, async function() {
        let { page, logs } = await flow.openCase(browser, { after: '1' })
        await waitReady(page)
        await page.waitForTimeout(1500) //負向觀察窗: 通知不得重複
        let info = await hostInfo(page)
        assert.strictEqual(info.after.length, 1) //①
        assert.strictEqual(info.after[0].text.replace(/\s+/g, ' '), visText('wysiwyg', DOCS.ORI)) //②
        assert.strictEqual(info.after[0].receiverHasMode, true) //③
        assert.deepStrictEqual(logs, []) //④
    })

    //E2E-013 唯讀文件載入完成通知時已為唯讀
    //①起點: 示範宿主頁, 唯讀, 記錄載入完成通知 ②點擊: 無 ③看到: 文件內容 ④輸入: 無 ⑤之後: 通知當下已唯讀 ⑥副作用: 無
    it(`E2E-013 [${MODE_NAMES.wysiwyg}] 唯讀文件載入完成通知時已為唯讀`, async function() {
        let { page, logs } = await flow.openCase(browser, { after: '1', editable: '0' })
        await waitReady(page)
        await page.waitForTimeout(1000) //負向觀察窗: 通知不得重複
        let info = await hostInfo(page)
        assert.strictEqual(info.after.length, 1) //①
        assert.strictEqual(info.after[0].editable, 'false') //②
        assert.deepStrictEqual(logs, []) //③
    })

    //E2E-014 語系資料送達前關閉編輯器不留殘餘
    //①起點: 示範宿主頁, 語系檔延後1.5秒 ②點擊: 「關閉編輯器」 ③看到: 編輯器移除 ④輸入: 無 ⑤之後: 語系檔到達後不再下載排版引擎、無錯誤、無通知 ⑥副作用: 無殘留之全域監聽
    it(`E2E-014 [${MODE_NAMES.wysiwyg}] 語系資料送達前關閉編輯器不留殘餘`, async function() {
        let base = await baseListeners()
        let { page, logs, assets } = await flow.openCase(browser, { after: '1' }, { i18nDelay: 1500 })
        await waitMounted(page)
        await closeEditor(page)
        let assetsAtClose = assets.slice()
        await waitAsset(assets, 'i18n:finished') //語系檔於關閉後送達
        await page.waitForTimeout(1000) //負向觀察窗: 語系檔送達後不得再下載排版引擎、建立編輯器或發出通知
        let info = await hostInfo(page)
        assert.strictEqual(info.existedAtClose, true) //①前提
        assert.strictEqual(info.loadingAtClose, true) //①前提
        assert.ok(!assetsAtClose.includes('i18n:finished'), JSON.stringify(assetsAtClose)) //①前提: 關閉時語系檔尚未送達
        assert.strictEqual(await page.locator('.WVditorFix').count(), 0) //②
        assert.deepStrictEqual(info.errs, []) //③
        assert.deepStrictEqual(logs, []) //④
        assert.deepStrictEqual(info.after, []) //⑤
        assert.deepStrictEqual(await globalListeners(page), base) //⑥
        assert.ok(!assets.includes('lute:request'), JSON.stringify(assets)) //⑦
    })

    for (let mode of MODES) {

        //E2E-015 排版引擎送達前關閉編輯器不留殘餘
        //①起點: 示範宿主頁, 排版引擎延後1.5秒 ②點擊: 「關閉編輯器」(已開始下載排版引擎時) ③看到: 編輯器移除 ④輸入: 無 ⑤之後: 關閉當下即無殘留, 排版引擎到達後無錯誤、無通知 ⑥副作用: 無殘留之全域監聽
        it(`E2E-015 [${MODE_NAMES[mode]}] 排版引擎送達前關閉編輯器不留殘餘`, async function() {
            let base = await baseListeners()
            let { page, logs, assets } = await flow.openCase(browser, { after: '1', mode }, { luteDelay: 1500 })
            await waitMounted(page)
            await waitAsset(assets, 'lute:request') //已開始下載排版引擎: vditor已建立內部物件與各模式編輯區
            await closeEditor(page)
            let nAtClose = await globalListeners(page) //關閉當下(排版引擎尚未送達)之監聽
            let assetsAtClose = assets.slice()
            await waitAsset(assets, 'lute:finished') //排版引擎於關閉後送達
            await page.waitForTimeout(1000) //負向觀察窗: 排版引擎送達後vditor之初始化與組件補做之銷毀(同步), 確認無錯誤、無通知
            let info = await hostInfo(page)
            assert.strictEqual(info.existedAtClose, true) //①前提
            assert.strictEqual(info.loadingAtClose, true) //①前提
            assert.ok(!assetsAtClose.includes('lute:finished'), JSON.stringify(assetsAtClose)) //①前提: 關閉時與量測⑦時排版引擎尚未送達
            assert.strictEqual(await page.locator('.WVditorFix').count(), 0) //②
            assert.deepStrictEqual(info.errs, []) //③
            assert.deepStrictEqual(logs, []) //④
            assert.deepStrictEqual(info.after, []) //⑤
            assert.deepStrictEqual(await globalListeners(page), base) //⑥
            assert.deepStrictEqual(nAtClose, base) //⑦
        })

    }

    //E2E-016 載入完成後關閉編輯器不留殘餘
    //①起點: 示範宿主頁 ②點擊: 「關閉編輯器」 ③看到: 編輯器移除 ④輸入: 無 ⑤之後: 無錯誤 ⑥副作用: 無殘留之window監聽
    it(`E2E-016 [${MODE_NAMES.wysiwyg}] 載入完成後關閉編輯器不留殘餘`, async function() {
        let base = await baseListeners()
        let { page, logs } = await flow.openCase(browser, {})
        await waitReady(page)
        await closeEditor(page)
        await page.waitForTimeout(800) //負向觀察窗: 銷毀後之延後處理不得拋錯
        let info = await hostInfo(page)
        assert.deepStrictEqual(info.errs, []) //①
        assert.deepStrictEqual(logs, []) //②
        assert.deepStrictEqual(await globalListeners(page), base) //③
    })

    //E2E-017 排版引擎無法取得時停留在載入圖示
    //①起點: 示範宿主頁, 排版引擎之請求中止 ②點擊: 「關閉編輯器」 ③看到: 載入圖示持續 ④輸入: 無 ⑤之後: 關閉後無元件錯誤 ⑥副作用: 無殘留之全域監聽
    it(`E2E-017 [${MODE_NAMES.wysiwyg}] 排版引擎無法取得時停留在載入圖示`, async function() {
        let base = await baseListeners()
        let { page, assets } = await flow.openCase(browser, {}, { luteAbort: true })
        await waitMounted(page)
        await waitAsset(assets, 'lute:failed') //排版引擎下載失敗
        await page.waitForTimeout(1000) //負向觀察窗: 資源失敗後不得就緒
        let ls = await loadingState(page)
        let info0 = await hostInfo(page)
        assert.strictEqual(ls.hidden, true) //①
        assert.strictEqual(ls.iconVisible, true) //①
        assert.deepStrictEqual(info0.inputs, []) //②
        await closeEditor(page)
        await page.waitForTimeout(800) //負向觀察窗: 關閉後之延後處理不得拋錯
        let info1 = await hostInfo(page)
        assert.deepStrictEqual(info1.errs, []) //③
        assert.deepStrictEqual(await globalListeners(page), base) //④
    })

    //E2E-018 語系資料無法取得時停留在載入圖示
    //①起點: 示範宿主頁, 語系檔之請求中止 ②點擊: 「關閉編輯器」、訊息之「X」 ③看到: 載入圖示持續與vditor之錯誤訊息 ④輸入: 無 ⑤之後: 關閉後訊息仍在, 點「X」後消失 ⑥副作用: 無殘留之全域監聽
    it(`E2E-018 [${MODE_NAMES.wysiwyg}] 語系資料無法取得時停留在載入圖示`, async function() {
        let base = await baseListeners()
        let { page, assets } = await flow.openCase(browser, {}, { i18nAbort: true })
        await waitMounted(page)
        await waitAsset(assets, 'i18n:failed') //語系檔下載失敗
        await page.waitForTimeout(1000) //負向觀察窗: 資源失敗後不得就緒
        let ls = await loadingState(page)
        let info0 = await hostInfo(page)
        let msg = page.getByText(I18N_FAIL_MSG)
        assert.strictEqual(ls.hidden, true) //①
        assert.strictEqual(ls.iconVisible, true) //①
        assert.strictEqual(await msg.isVisible(), true) //②
        assert.deepStrictEqual(info0.inputs, []) //③
        await closeEditor(page)
        await page.waitForTimeout(800) //負向觀察窗: 關閉後之延後處理不得拋錯
        let info1 = await hostInfo(page)
        assert.deepStrictEqual(info1.errs, []) //④
        assert.deepStrictEqual(await globalListeners(page), base) //⑤
        assert.strictEqual(await msg.isVisible(), true) //⑥
        await page.locator('.vditor-tip').getByText('X', { exact: true }).click()
        await msg.waitFor({ state: 'hidden' })
        assert.strictEqual(await msg.isVisible(), false) //⑦
    })

    //E2E-019 匯出選單只提供 Markdown 與 HTML
    //①起點: 示範宿主頁 ②點擊: 工具列「匯出」 ③看到: 選單展開 ④輸入: 無 ⑤之後: 只有Markdown與HTML ⑥副作用: 無
    it(`E2E-019 [${MODE_NAMES.wysiwyg}] 匯出選單只提供 Markdown 與 HTML`, async function() {
        let { page, logs } = await flow.openReady(browser, {})
        await toolbarButton(page, 'export').click()
        await page.locator('.WVditorFix .vditor-toolbar button[data-type="markdown"]').waitFor({ state: 'visible' })
        let items = await exportMenuItems(page)
        assert.deepStrictEqual(items, ['Markdown', 'HTML']) //①
        assert.strictEqual(await page.locator('.WVditorFix .vditor-toolbar button[data-type="pdf"]').count(), 0) //②
        assert.deepStrictEqual(logs, []) //③
    })

    for (let [no, title, query, other] of [
        ['E2E-020', '頁面另給設定內容時以頁面內容為準', { svalue: 'SVALUE' }, '設定內容'],
        ['E2E-021', '啟用快取時以頁面內容為準', { cache: 'id', cacheSeed: 'CACHED' }, '快取內容'],
    ]) {

        //E2E-020/021 設定內容或快取內容於就緒時被頁面內容取代
        //①起點: 示範宿主頁, 另給設定內容或預存快取內容 ②點擊: 無 ③看到: 頁面交給編輯器之內容 ④輸入: 無 ⑤之後: 「復原」停用 ⑥副作用: 頁面未收到回傳
        it(`${no} [${MODE_NAMES.wysiwyg}] ${title}`, async function() {
            let { page, logs } = await flow.openReady(browser, query)
            let [s] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(s.text, visText('wysiwyg', DOCS.ORI)) //①
            assert.ok(!s.text.includes(other), s.text) //②
            assert.strictEqual(s.undoDisabled, true) //③
            assert.deepStrictEqual(info.inputs, []) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

    for (let [no, title, query] of [
        ['E2E-022', '語系設定不合法時停留在載入圖示', { lang: 'xx_XX' }],
        ['E2E-023', '啟用快取卻未給識別碼時停留在載入圖示', { cache: 'noid' }],
    ]) {

        //E2E-022/023 設定錯誤時停留在載入圖示
        //①起點: 示範宿主頁, 不合法之語系或快取設定 ②點擊: 「關閉編輯器」 ③看到: 載入圖示持續 ④輸入: 無 ⑤之後: 無回傳, 關閉後無元件錯誤 ⑥副作用: 無殘留之全域監聽
        it(`${no} [${MODE_NAMES.wysiwyg}] ${title}`, async function() {
            let base = await baseListeners()
            let { page } = await flow.openCase(browser, query)
            await waitMounted(page)
            await page.waitForTimeout(3000) //負向觀察窗: 設定錯誤時不得就緒
            let ls = await loadingState(page)
            let info = await hostInfo(page)
            assert.strictEqual(ls.hidden, true) //①
            assert.strictEqual(ls.iconVisible, true) //①
            assert.deepStrictEqual(info.inputs, []) //②
            assert.deepStrictEqual(info.errs, []) //③
            await closeEditor(page)
            await page.waitForTimeout(800) //負向觀察窗: 關閉後之延後處理不得拋錯
            let info1 = await hostInfo(page)
            assert.deepStrictEqual(info1.errs, []) //④
            assert.deepStrictEqual(await globalListeners(page), base) //⑤
        })

    }

    //E2E-024 關閉時尚未回傳之輸入不再回傳
    //①起點: 示範宿主頁, 回傳防抖600ms ②點擊: 編輯區、「關閉編輯器」 ③看到: 編輯器移除 ④輸入: Z ⑤之後: Z不回傳 ⑥副作用: 頁面內容不變
    it(`E2E-024 [${MODE_NAMES.wysiwyg}] 關閉時尚未回傳之輸入不再回傳`, async function() {
        let { page, logs } = await flow.openReady(browser, { hintTimeDetect: '600' })
        await typeAtEnd(page, 'Z')
        await hostButton(page, '關閉編輯器').click()
        await page.locator('.WVditorFix').waitFor({ state: 'detached' })
        await page.waitForTimeout(1500) //負向觀察窗: 涵蓋600ms防抖, 被關閉之輸入不得回傳
        let info = await hostInfo(page)
        assert.strictEqual(await page.locator('.WVditorFix').count(), 0) //①
        assert.deepStrictEqual(info.inputs, []) //②
        assert.strictEqual(info.mdout, DOCS.ORI) //③
        assert.deepStrictEqual(info.errs, []) //④
        assert.deepStrictEqual(logs, []) //⑤
    })

    //E2E-025 語系資料於關閉後才無法取得時不顯示訊息
    //①起點: 示範宿主頁, 語系檔延後1.5秒後失敗 ②點擊: 「關閉編輯器」 ③看到: 編輯器移除 ④輸入: 無 ⑤之後: 語系檔失敗後頁面不出現訊息 ⑥副作用: 無殘留之全域監聽
    it(`E2E-025 [${MODE_NAMES.wysiwyg}] 語系資料於關閉後才無法取得時不顯示訊息`, async function() {
        let base = await baseListeners()
        let { page, assets } = await flow.openCase(browser, { after: '1' }, { i18nDelay: 1500, i18nAbort: true })
        await waitMounted(page)
        await closeEditor(page)
        let assetsAtClose = assets.slice()
        await waitAsset(assets, 'i18n:failed') //語系檔於關閉後下載失敗
        await page.waitForTimeout(1000) //負向觀察窗: 語系檔失敗後不得出現訊息(vditor於失敗時同步附加訊息)
        let info = await hostInfo(page)
        assert.strictEqual(info.existedAtClose, true) //①前提
        assert.strictEqual(info.loadingAtClose, true) //①前提
        assert.ok(!assetsAtClose.includes('i18n:failed'), JSON.stringify(assetsAtClose)) //①前提: 關閉時語系檔尚未失敗
        assert.strictEqual(await page.locator('.WVditorFix').count(), 0) //②
        assert.strictEqual(await page.getByText(I18N_FAIL_MSG).count(), 0) //③
        assert.deepStrictEqual(info.errs, []) //④
        assert.deepStrictEqual(info.after, []) //⑤
        assert.deepStrictEqual(await globalListeners(page), base) //⑥
    })

    //E2E-026 排版引擎無法取得時反覆開關編輯器不累積事件監聽
    //①起點: 示範宿主頁, 排版引擎之請求中止 ②點擊: 「關閉編輯器」、「開啟編輯器」交替 ③看到: 每次開啟皆停在載入圖示 ④輸入: 無 ⑤之後: 最後關閉後無元件錯誤 ⑥副作用: 無殘留之全域監聽
    it(`E2E-026 [${MODE_NAMES.wysiwyg}] 排版引擎無法取得時反覆開關編輯器不累積事件監聽`, async function() {
        let base = await baseListeners()
        let { page, assets } = await flow.openCase(browser, {}, { luteAbort: true })
        let loads = []
        for (let k = 1; k <= 3; k++) {
            if (k > 1) {
                await hostButton(page, '開啟編輯器').click()
            }
            await waitMounted(page)
            await waitAsset(assets, 'lute:failed', k) //本次開啟之排版引擎下載失敗
            loads.push(await loadingState(page))
            await closeEditor(page)
        }
        await page.waitForTimeout(800) //負向觀察窗: 關閉後之延後處理不得拋錯
        let info = await hostInfo(page)
        for (let ls of loads) {
            assert.strictEqual(ls.hidden, true) //①
            assert.strictEqual(ls.iconVisible, true) //①
        }
        assert.deepStrictEqual(info.inputs, []) //②
        assert.deepStrictEqual(info.errs, []) //③
        assert.deepStrictEqual(await globalListeners(page), base) //④
    })

    //E2E-027 編輯模式設定不合法時停留在載入圖示
    //①起點: 示範宿主頁, 編輯模式設為xxx ②點擊: 「關閉編輯器」 ③看到: 載入圖示持續 ④輸入: 無 ⑤之後: 無回傳, 關閉後無元件錯誤 ⑥副作用: 無殘留之全域監聽
    it(`E2E-027 [${MODE_NAMES.wysiwyg}] 編輯模式設定不合法時停留在載入圖示`, async function() {
        let base = await baseListeners()
        let { page, assets } = await flow.openCase(browser, { mode: 'xxx', after: '1' })
        await waitMounted(page)
        await waitAsset(assets, 'lute:finished') //排版引擎已送達, vditor隨即依設定之模式初始化
        await page.waitForTimeout(1000) //負向觀察窗: 設定錯誤時不得就緒
        let ls = await loadingState(page)
        let info0 = await hostInfo(page)
        assert.strictEqual(ls.hidden, true) //①
        assert.strictEqual(ls.iconVisible, true) //①
        assert.deepStrictEqual(info0.inputs, []) //②
        assert.deepStrictEqual(info0.after, []) //②
        assert.deepStrictEqual(info0.errs, []) //③
        await closeEditor(page)
        await page.waitForTimeout(800) //負向觀察窗: 關閉後之延後處理不得拋錯
        let info1 = await hostInfo(page)
        assert.deepStrictEqual(info1.errs, []) //④
        assert.deepStrictEqual(await globalListeners(page), base) //⑤
    })

})
