//e2e-readonly-focus: 唯讀時之焦點(spec/流程_唯讀時之焦點.md)
//每個it為一個E2E-NNN×一種編輯模式, 每案全新瀏覽器; 操作只經示範宿主頁(test/host/index.html)之搜尋框、Ctrl+S、Alt+F與編輯器之真鍵盤滑鼠
//斷言註解之①②…對應spec該案「驗證／語意」之編號
import assert from 'assert'
import {
    MODES, MODE_NAMES, DOCS, keyModeSwitch, keysRo, launchBrowser, createFlow,
    waitEditable, waitInputs, waitFocusLeft, states, editorScrollTop, hostInfo,
    editor, typeAtEnd, focusInEditor, focusOnEditorItself, activeInfo, tabUntil
} from './tools/e2e-setup.mjs'
import { waitUntilExist } from './tools/e2eLib.mjs'


let flow = createFlow('readonly-focus')

//MODES_RICH, 編輯區為渲染結果之模式(分割預覽之編輯區為原始碼, 無核取方塊與可點之連結)
let MODES_RICH = ['wysiwyg', 'ir']


describe('e2e-readonly-focus：唯讀時之焦點', function() {

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

        //E2E-001 打字中儲存鎖定時編輯區失焦且快捷鍵無效
        //①起點: 示範宿主頁, 上傳期間唯讀3秒, 記錄聚焦與失焦通知 ②點擊: 編輯區 ③看到: 鎖定後編輯區失焦 ④輸入: a、Ctrl+S、Ctrl+Alt+2、切換模式、Z ⑤之後: 內容不變 ⑥副作用: 失焦通知恰一次
        it(`E2E-001 [${MODE_NAMES[mode]}] 打字中儲存鎖定時編輯區失焦且快捷鍵無效`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, focusLog: '1', saveLock: '3000' })
            await typeAtEnd(page, 'a')
            let info0 = await waitInputs(page, '回傳結尾為a', { lastEndsWith: 'a' })
            let [s0] = await states(page)
            assert.ok(s0.text.endsWith('a'), s0.text) //前提: 已輸入
            await page.keyboard.press('Control+s')
            await waitEditable(page, false)
            await page.waitForTimeout(300) //負向觀察窗: 焦點不得被拉回編輯區
            assert.strictEqual(await focusInEditor(page), false) //①
            await page.keyboard.press('Control+Alt+2')
            await page.keyboard.press(keyModeSwitch(mode))
            await page.keyboard.type('Z')
            await page.waitForTimeout(800) //負向觀察窗: 涵蓋回傳防抖, 按鍵不得改動內容或回傳
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(s1.text, s0.text) //②
            assert.strictEqual(s1.editable, 'false') //③
            assert.strictEqual(info.inputs.length, info0.inputs.length) //④
            assert.deepStrictEqual(info.fl.slice(info0.fl.length), ['blur']) //⑤
            assert.deepStrictEqual(logs, []) //⑥
        })

    }

    for (let mode of MODES) {

        //E2E-002 唯讀時以 Tab 鍵移入編輯區後按鍵不改內容
        //①起點: 示範宿主頁, 唯讀之RO ②點擊: 搜尋框 ③看到: 焦點進入編輯區 ④輸入: Tab若干次、Enter等按鍵序列 ⑤之後: 內容不變 ⑥副作用: 無回傳
        it(`E2E-002 [${MODE_NAMES[mode]}] 唯讀時以 Tab 鍵移入編輯區後按鍵不改內容`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, doc: 'RO', editable: '0' })
            let [s0] = await states(page)
            let reached = await tabUntil(page, focusInEditor)
            assert.strictEqual(reached, true) //①
            for (let key of keysRo(mode)) {
                await page.keyboard.press(key)
            }
            await page.waitForTimeout(1000) //負向觀察窗: 涵蓋回傳防抖, 按鍵不得改動內容或回傳
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(s1.text, s0.text) //②
            assert.strictEqual(s1.editable, 'false') //③
            assert.strictEqual(info.mdout, DOCS.RO) //④
            assert.deepStrictEqual(info.inputs, []) //⑤
            assert.strictEqual(s1.undoDisabled, true) //⑥
            assert.deepStrictEqual(logs, []) //⑦
        })

    }

    for (let mode of MODES_RICH) {

        //E2E-003 唯讀時滑鼠點擊核取方塊後按鍵回到頁面
        //①起點: 示範宿主頁, 唯讀之RO ②點擊: 核取方塊(左鍵、右鍵) ③看到: 焦點不留在編輯區 ④輸入: Esc兩次、按鍵序列 ⑤之後: 頁面收到Esc ⑥副作用: 內容不變、無回傳
        it(`E2E-003 [${MODE_NAMES[mode]}] 唯讀時滑鼠點擊核取方塊後按鍵回到頁面`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, doc: 'RO', editable: '0' })
            let [s0] = await states(page)
            let cb = editor(page).locator('input[type="checkbox"]').first()
            let checked0 = await cb.isChecked()
            for (let button of ['left', 'right']) {
                await cb.click({ button })
                await waitFocusLeft(page)
                await page.waitForTimeout(200) //負向觀察窗: 焦點不得留在或回到編輯區
                assert.strictEqual(await focusInEditor(page), false) //①
                await page.keyboard.press('Escape')
            }
            let info0 = await hostInfo(page)
            assert.deepStrictEqual(info0.docKeys, ['Escape', 'Escape']) //②
            assert.strictEqual(info0.lastKey, 'Escape') //②
            for (let key of keysRo(mode)) {
                await page.keyboard.press(key)
            }
            await page.waitForTimeout(1000) //負向觀察窗: 涵蓋回傳防抖
            let [s1] = await states(page)
            let info = await hostInfo(page)
            assert.strictEqual(await cb.isChecked(), checked0) //③
            assert.strictEqual(s1.text, s0.text) //④
            assert.strictEqual(s1.editable, 'false') //⑤
            assert.strictEqual(info.mdout, DOCS.RO) //⑥
            assert.deepStrictEqual(info.inputs, []) //⑦
            assert.deepStrictEqual(logs, []) //⑧
        })

    }

    for (let mode of MODES_RICH) {

        //E2E-004 唯讀時點擊連結另開分頁且按鍵回到頁面
        //①起點: 示範宿主頁, 唯讀之RO ②點擊: 內容中之「連結」 ③看到: 新分頁開啟 ④輸入: 關閉新分頁後按Esc ⑤之後: 頁面收到Esc ⑥副作用: 內容不變、無回傳
        it(`E2E-004 [${MODE_NAMES[mode]}] 唯讀時點擊連結另開分頁且按鍵回到頁面`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, doc: 'RO', editable: '0' })
            let [popup] = await Promise.all([
                page.context().waitForEvent('page', { timeout: 5000 }),
                editor(page).getByText('連結', { exact: true }).click(),
            ])
            assert.ok(popup.url().endsWith('/node_modules/vditor/package.json'), popup.url()) //①
            await popup.close()
            await waitFocusLeft(page)
            await page.waitForTimeout(200) //負向觀察窗: 焦點不得留在或回到編輯區
            assert.strictEqual(await focusInEditor(page), false) //②
            await page.keyboard.press('Escape')
            let info = await hostInfo(page)
            assert.deepStrictEqual(info.docKeys, ['Escape']) //③
            assert.strictEqual(info.mdout, DOCS.RO) //④
            assert.deepStrictEqual(info.inputs, []) //⑤
            assert.deepStrictEqual(logs, []) //⑥
        })

    }

    for (let mode of MODES) {

        //E2E-005 唯讀時以 Tab 鍵進入長文件捲動並一次離開
        //①起點: 示範宿主頁, 唯讀之LONG, 記錄聚焦與失焦通知 ②點擊: 搜尋框 ③看到: 焦點停在編輯區本身 ④輸入: Tab若干次、PageDown、Shift+Tab、Tab、Tab ⑤之後: 一次即離開且不落在隱藏iframe ⑥副作用: 通知成對、無回傳
        it(`E2E-005 [${MODE_NAMES[mode]}] 唯讀時以 Tab 鍵進入長文件捲動並一次離開`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, doc: 'LONG', editable: '0', focusLog: '1' })
            assert.strictEqual(await tabUntil(page, focusOnEditorItself), true) //①
            let top0 = await editorScrollTop(page)
            await page.keyboard.press('PageDown')
            await waitUntilExist(page, '編輯區已捲動', (t) => {
                let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
                return ed.scrollTop > t
            }, { arg: top0 })
            assert.ok(await editorScrollTop(page) > top0) //②
            await page.keyboard.press('Shift+Tab')
            await waitFocusLeft(page)
            await page.waitForTimeout(200) //負向觀察窗: 焦點不得被拉回
            assert.strictEqual(await focusInEditor(page), false) //③
            await page.keyboard.press('Tab')
            await waitUntilExist(page, '焦點回到編輯區本身', () => {
                let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
                return !!ed && document.activeElement === ed
            })
            assert.strictEqual(await focusOnEditorItself(page), true) //④
            await page.keyboard.press('Tab')
            await waitFocusLeft(page)
            await page.waitForTimeout(200) //負向觀察窗: 焦點不得被拉回
            let ae = await activeInfo(page)
            assert.strictEqual(await focusInEditor(page), false) //⑤
            assert.notStrictEqual(ae.tag, 'IFRAME') //⑤
            let info = await hostInfo(page)
            assert.deepStrictEqual(info.fl, ['focus', 'blur', 'focus', 'blur']) //⑥
            assert.deepStrictEqual(info.inputs, []) //⑦
            assert.deepStrictEqual(logs, []) //⑧
        })

    }

    for (let mode of MODES) {

        //E2E-006 唯讀時焦點在編輯區，頁面快捷鍵可移走焦點
        //①起點: 示範宿主頁, 唯讀之LONG ②點擊: 搜尋框 ③看到: 焦點停在編輯區本身 ④輸入: Tab若干次、Alt+F ⑤之後: 焦點位於搜尋框 ⑥副作用: 無
        it(`E2E-006 [${MODE_NAMES[mode]}] 唯讀時焦點在編輯區，頁面快捷鍵可移走焦點`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, doc: 'LONG', editable: '0' })
            assert.strictEqual(await tabUntil(page, focusOnEditorItself), true) //①
            await page.keyboard.press('Alt+f')
            await waitUntilExist(page, '焦點移至搜尋框', () => {
                return !!document.activeElement && document.activeElement.id === 'hostSearch'
            })
            await page.waitForTimeout(300) //負向觀察窗: 焦點不得被拉回編輯區
            let ae = await activeInfo(page)
            assert.strictEqual(ae.id, 'hostSearch') //②
            assert.deepStrictEqual(logs, []) //③
        })

    }

    for (let mode of MODES) {

        //E2E-007 唯讀時選取文字仍通知頁面且按鍵不觸發按鍵通知
        //①起點: 示範宿主頁, 唯讀之LONG, 記錄選取與按鍵通知 ②點擊: 搜尋框、編輯區(拖曳選取)、右上角空白處 ③看到: 文字被選取 ④輸入: Tab若干次、Esc、Ctrl+Enter、a ⑤之後: 選取與取消選取之通知 ⑥副作用: 按鍵無通知
        it(`E2E-007 [${MODE_NAMES[mode]}] 唯讀時選取文字仍通知頁面且按鍵不觸發按鍵通知`, async function() {
            let { page, logs } = await flow.openReady(browser, { mode, doc: 'LONG', editable: '0', cbLog: '1' })
            assert.strictEqual(await tabUntil(page, focusOnEditorItself), true) //①
            await page.keyboard.press('Escape')
            await page.keyboard.press('Control+Enter')
            await page.keyboard.press('a')
            await page.waitForTimeout(600) //負向觀察窗: 按鍵不得觸發通知
            let info0 = await hostInfo(page)
            assert.deepStrictEqual(info0.cb, []) //②
            let box = await editor(page).boundingBox()
            await page.mouse.move(box.x + 30, box.y + 60) //L2真滑鼠: 自左上方拖曳至右下方選取文字
            await page.mouse.down()
            await page.mouse.move(box.x + 200, box.y + 120, { steps: 8 })
            await page.mouse.up()
            await waitUntilExist(page, '選取通知', () => window.__cb.includes('select'))
            let sel = await page.evaluate(() => String(window.getSelection()))
            let info1 = await hostInfo(page)
            assert.ok(sel.trim().length > 0, JSON.stringify(sel)) //③
            assert.deepStrictEqual(info1.cb, ['select']) //③
            await page.mouse.click(box.x + box.width - 20, box.y + 20) //L2真滑鼠: 右上角空白處
            await waitUntilExist(page, '取消選取通知', () => window.__cb.includes('unSelect'))
            let info2 = await hostInfo(page)
            assert.deepStrictEqual(info2.cb, ['select', 'unSelect']) //④
            assert.deepStrictEqual(logs, []) //⑤
        })

    }

})
