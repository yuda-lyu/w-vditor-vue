//e2e: WVditorVue之生命週期與資料流(初始內容寫入時機、復原起點、回寫、鎖定)
//元件由現行src編譯至test/_tmp(不依賴./dist), 以本機靜態站提供vditor資源(settings.cdn)並阻擋所有外網請求,
//以路由延遲lute或語系檔模擬較慢之網路或主機; 每case全新瀏覽器; 使用者操作走真鍵盤滑鼠, 父層行為以頁面層級之資料變更模擬;
//斷言畫面內容、復原鈕狀態、value回拋序列、主控台錯誤與window監聽殘留
//組件定位(裁決2026-10-04): 單一編輯者之輸入組件, 只負責載入父層value並顯示、內容一變更即回拋、依editable鎖定;
//延遲或亂序回寫之協調屬父層責任; 多組件或多人同時編輯(共編)須父層與組件層皆支援CRDT等協作機制, 本組件目前不支援共編; 皆不在本組件之需求內, 故不測
//需求:
//R01 編輯器就緒後必顯示初始內容(不論語系檔來源、lute到達時機、編輯模式、同頁實例數), 載入不回拋input, 且無lute未載入之錯誤
//R02 開啟後初始內容即復原起點: 復原鈕停用, 按復原鈕或Ctrl+Z內容不變且不回拋input
//R03 輸入後連按復原: 停在初始內容, 復原鈕轉為停用, 最後回拋值等於初始內容
//R04 載入期間組件外變更value: 就緒後顯示最新值, 且為復原起點
//R05 就緒後組件外變更value且使用者尚未編輯: 顯示新值, 且為新的復原起點(按復原不回到變更前)
//R06 編輯器初始化完成前銷毀(語系檔未到或lute未到): 不拋錯, 不呼叫settings.after, 初始化完成後無殘留之window監聽; 就緒後銷毀亦不拋錯且無殘留
//R07 editable=false: 就緒後唯讀, 復原鈕與編輯類工具列始終停用
//R08 value為null時視為空字串(不顯示字面null), 其他非字串轉為字串顯示
//R09 提示區(keyHint)插入內容後: 內容正確且觸發字串已移除, 只回拋一次清理後之值, 提示窗已關閉, 復原歷史保留, 之後之輸入接於插入內容之後;
//    只移除游標前本次輸入之觸發字串(文件中段觸發且後文含相同字串時不誤刪後文); 提示區開啟中父層載入新內容時提示區關閉
//R10 settings.after: 於編輯器初始化完成且已載入value後被呼叫一次, 接收者為vditor合併後之設定
//R11 使用者已編輯後組件外變更value: 保留復原歷史(可復原至變更前之編輯內容)
//R12 父層以v-model或於input事件內同步回寫(含微任務後回寫、debounce回寫最後之值、修整結尾空白)或不回寫, 三種編輯模式下逐鍵輸入:
//    過程無重載(已輸入不消失、開頭不被插入)、終態完整、value與最後回拋一致、游標維持於末尾、按一次復原撤銷最後一字;
//    含中文輸入法組字、settings.i18n; 父層把回拋值單向同步至另一組件時, 該組件顯示之而本組件不重載
//R13 父層把value設為與編輯器內容及最後回拋值皆不同之值(例如設回先前之內容): 以value為準載入;
//    使用者已輸入而尚未回拋時父層改值, 亦視為已編輯而保留復原歷史, 其後再次改值仍保留;
//    回寫判斷之兩分支: 等於最後回拋值(使用者已再輸入而尚未回拋)、等於當前內容(載入後尚未回拋)皆不重載;
//    sv模式父層修整開頭空白屬內容變更, 以value為準載入
//R14 單向綁定(不回寫): 保留使用者輸入, 之後父層改值仍會載入
//R15 就緒後父層切換editable(例如上傳期間鎖定): false時唯讀且輸入無效、不回拋, 改回true後可輸入; 初始化期間切換則於就緒時套用最新之editable;
//    鎖定期間維持唯讀一致: 鎖定前最後輸入之在途回拋與寫入復原堆疊、鎖定期間父層載入新內容, 皆不使復原鈕或編輯區重新啟用(解鎖後可復原);
//    提示區關閉且無法插入; 編輯區內核取方塊與圖片點擊無效, 點擊內容下方空白處不新增段落(解鎖後之輸入落點不變); 打字中鎖定時編輯區失焦, 快捷鍵無效;
//    唯讀期間以Tab鍵移入編輯區(編輯區本身、核取方塊、連結)時按鍵與快捷鍵無效、可捲動, 以Tab或Shift+Tab一次即離開, 頁面程式聚焦可移走焦點, settings.focus與settings.blur照常且成對;
//    滑鼠點擊(含右鍵)取得之焦點不留在編輯區內, 之後之按鍵回到頁面; 編輯區內表單控制項之輸入不回拋; 停用之工具列按鈕不影響鎖定前輸入之回拋
//R16 使用者以貼上、工具列、鍵盤復原與重做、全選刪除等方式變更內容(三種編輯模式): 一變更即回拋, 不重載, 之後之輸入接於末尾
import assert from 'assert'
import launchBrowser from 'w-package-tools-e2e/src/launchBrowser.mjs'
import t from './tools/e2eInitUndo.mjs'


let ORI = '# 標題\n\n第一段內容abc\n\n第二段內容xyz\n' //測試頁預設value
let ORI_TEXT = '標題 第一段內容abc 第二段內容xyz' //wysiwyg可見文字(空白正規化)
let ORI_SRC_TEXT = '# 標題 第一段內容abc 第二段內容xyz' //ir與sv可見文字(含markdown標記)
let SECOND_TEXT = '第二個 第二個實例之內容' //第二實例可見文字
let EXT = '# 外部\n\n外部變更之內容\n' //父層變更之內容


//visText, 只含標題與段落之markdown於各模式之可見文字(空白正規化): wysiwyg不顯示標題標記, ir與sv顯示
function visText(mode, md) {
    return (mode === 'wysiwyg' ? md.replace(/^#+ /gm, '') : md).trim().replace(/\s+/g, ' ')
}


describe('e2e-init-undo', function() {

    let server = null
    let browser = null

    before(async function() {
        this.timeout(300000) //含rollup編譯元件
        await t.buildComponent()
        t.writePage()
        server = await t.startServer()
    })

    after(function() {
        if (server) {
            server.close()
        }
        t.cleanup()
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

    it('R01/R02 一般開啟: 顯示初始內容、不回拋、復原鈕停用, 按復原鈕內容不變且不回拋', async function() {
        let { page, logs, external } = await t.openCase(browser, {})
        await t.waitReady(page)
        await t.sleep(1500) //觀察窗涵蓋undoDelay(預設100ms)之防抖寫入復原堆疊
        let [s0] = await t.states(page)
        let info0 = await t.pageInfo(page)
        assert.strictEqual(s0.text, ORI_TEXT) //R01: 就緒後顯示初始內容
        assert.deepStrictEqual(info0.inputs, []) //R01: 載入不回拋input
        assert.strictEqual(s0.undoDisabled, true) //R02: 復原鈕停用
        await page.click('#mdout') //使頁面存在選取範圍, 貼近真人操作(無選取範圍時vditor復原會另拋getRangeAt錯誤而不回拋)
        await t.clickUndo(page)
        let [s1] = await t.states(page)
        let info = await t.pageInfo(page)
        assert.strictEqual(s1.text, ORI_TEXT) //R02: 按復原鈕內容不變
        assert.deepStrictEqual(info.inputs, []) //R02: 不回拋input
        assert.strictEqual(info.mdout, ORI) //R02: value維持初始內容
        assert.deepStrictEqual(logs, []) //R01: 無主控台錯誤
        assert.deepStrictEqual(external, []) //測試不依賴外網
    })

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R02 ${mode}模式點入編輯區後按Ctrl+Z: 內容不變且不回拋`, async function() {
            let { page, logs } = await t.openCase(browser, { mode })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            await page.locator('.WVditorFix .vditor-reset[contenteditable]:visible').first().click()
            await page.keyboard.press('Control+End')
            await page.keyboard.press('Control+z')
            await t.sleep(600)
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(s0.text, visText(mode, ORI)) //前置: 顯示初始內容
            assert.strictEqual(s1.text, s0.text) //R02: Ctrl+Z內容不變
            assert.deepStrictEqual(info.inputs, []) //R02: 不回拋input
            assert.deepStrictEqual(logs, [])
        })

    }

    it('R03 輸入後連按復原: 停在初始內容且復原鈕轉為停用', async function() {
        let { page, logs } = await t.openCase(browser, {})
        await t.waitReady(page)
        await t.sleep(1500)
        await t.typeAtEnd(page, 'ZZZ')
        let [s0] = await t.states(page)
        assert.strictEqual(s0.text, `${ORI_TEXT}ZZZ`) //前置: 輸入已生效
        assert.strictEqual(s0.undoDisabled, false) //前置: 有可復原之編輯
        await t.clickUndo(page)
        let [s1] = await t.states(page)
        assert.strictEqual(s1.text, ORI_TEXT) //R03: 復原回到初始內容
        assert.strictEqual(s1.undoDisabled, true) //R03: 已到復原起點, 復原鈕停用
        await t.clickUndo(page)
        let [s2] = await t.states(page)
        let info = await t.pageInfo(page)
        assert.strictEqual(s2.text, ORI_TEXT) //R03: 再按復原仍停在初始內容
        assert.strictEqual(info.inputs[info.inputs.length - 1], ORI) //R03: 最後回拋值等於初始內容
        assert.deepStrictEqual(logs, [])
    })

    it('R01 lute延遲1.5秒: 仍顯示初始內容且無lute未載入之錯誤', async function() {
        let { page, logs } = await t.openCase(browser, {}, { lute: 1500 })
        await t.waitReady(page)
        await t.sleep(1500)
        let [s] = await t.states(page)
        let info = await t.pageInfo(page)
        assert.strictEqual(s.text, ORI_TEXT) //R01: 顯示初始內容
        assert.strictEqual(s.undoDisabled, true) //R02: 復原鈕停用
        assert.deepStrictEqual(info.inputs, []) //R01: 載入不回拋input
        assert.strictEqual(info.mdout, ORI) //R01: value未被改動
        assert.deepStrictEqual(logs, []) //R01: 無Md2VditorDOM等lute未載入之錯誤
    })

    it('R01 呼叫端給予settings.i18n且為頁內首開: 顯示初始內容', async function() {
        let { page, logs } = await t.openCase(browser, { i18n: '1' })
        await t.waitReady(page)
        await t.sleep(1500)
        let [s] = await t.states(page)
        let info = await t.pageInfo(page)
        assert.strictEqual(s.text, ORI_TEXT) //R01: 語系物件由呼叫端給予時亦顯示初始內容
        assert.strictEqual(s.undoDisabled, true) //R02
        assert.deepStrictEqual(info.inputs, []) //R01
        assert.deepStrictEqual(logs, []) //R01
    })

    it('R02 同頁關閉後再開(腳本已載入): 顯示初始內容且復原鈕停用', async function() {
        let { page, logs } = await t.openCase(browser, {})
        await t.waitReady(page)
        await t.sleep(500)
        await page.click('#btnToggle') //關閉
        await page.locator('.WVditorFix').waitFor({ state: 'detached' })
        await page.click('#btnToggle') //再開
        await t.waitReady(page)
        await t.sleep(1500)
        let [s] = await t.states(page)
        assert.strictEqual(s.text, ORI_TEXT) //R01
        assert.strictEqual(s.undoDisabled, true) //R02: 再開之實例復原鈕亦停用
        assert.deepStrictEqual(logs, [])
    })

    it('R04 載入期間組件外變更value: 就緒後顯示最新值且為復原起點', async function() {
        let { page, logs } = await t.openCase(browser, { value: 'AAA初值', changeAt: '50', changeTo: 'BBB新值' }, { lute: 1000 })
        await t.waitReady(page)
        await t.sleep(1500)
        let [s] = await t.states(page)
        let info = await t.pageInfo(page)
        assert.strictEqual(info.loadingAtChange, true) //前置: 改值當下仍在載入
        assert.strictEqual(s.text, 'BBB新值') //R04: 顯示最新值, 非建構時之舊值
        assert.strictEqual(info.mdout, 'BBB新值') //R04: 畫面與value一致
        assert.strictEqual(s.undoDisabled, true) //R04: 最新值為復原起點
        assert.deepStrictEqual(info.inputs, []) //R01
        assert.deepStrictEqual(logs, [])
    })

    it('R04 呼叫端給予settings.i18n且於lute到達前變更value: 顯示最新值且無錯誤', async function() {
        let { page, logs } = await t.openCase(browser, { i18n: '1', changeAt: '60', changeTo: 'BBB新值' }, { lute: 800 })
        await t.waitReady(page)
        await t.sleep(1500)
        let [s] = await t.states(page)
        let info = await t.pageInfo(page)
        assert.strictEqual(s.text, 'BBB新值') //R04
        assert.strictEqual(s.undoDisabled, true) //R04
        assert.deepStrictEqual(info.errs, []) //R04: 無render錯誤
        assert.deepStrictEqual(logs, []) //R04: 無Md2VditorDOM錯誤
    })

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R05 ${mode}模式就緒後組件外變更value(尚未編輯): 顯示新值且按復原不回到變更前`, async function() {
            let changeTo = '# 新內容\n\n非同步載入後之內容\n'
            let expected = mode === 'wysiwyg' ? '新內容 非同步載入後之內容' : '# 新內容 非同步載入後之內容'
            let { page, logs } = await t.openCase(browser, { mode, value: '', changeAt: '2500', changeTo })
            await t.waitReady(page)
            await page.waitForFunction(() => document.querySelector('#mdout').textContent.includes('新內容'))
            await t.sleep(1000)
            let [s0] = await t.states(page)
            assert.strictEqual(s0.text, expected) //R05: 顯示新值
            assert.strictEqual(s0.undoDisabled, true) //R05: 新值為復原起點
            await page.click('#mdout')
            await t.clickUndo(page)
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(s1.text, expected) //R05: 按復原不回到變更前之空白
            assert.deepStrictEqual(info.inputs, []) //R05: 不回拋input
            assert.deepStrictEqual(logs, [])
        })

    }

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R11 ${mode}模式使用者已編輯後組件外變更value: 保留復原歷史, 可復原至變更前之編輯內容`, async function() {
            let { page, logs } = await t.openCase(browser, { mode })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            await t.typeAtEnd(page, 'ZZZ')
            let [sE] = await t.states(page)
            assert.strictEqual(sE.text.slice(s0.text.length).trimStart(), 'ZZZ') //前置: 已編輯
            await t.setContent(page, EXT)
            await t.sleep(1000)
            let [s1] = await t.states(page)
            assert.strictEqual(s1.text, visText(mode, EXT)) //前置: 顯示外部變更之值
            assert.strictEqual(s1.undoDisabled, false) //R11: 保留復原歷史
            await t.clickUndo(page)
            let [s2] = await t.states(page)
            assert.strictEqual(s2.text, sE.text) //R11: 復原至變更前之編輯內容
            assert.deepStrictEqual(logs, [])
        })

    }

    //R12核心: 逐鍵輸入abcd後再輸入Y並按一次復原, 檢查過程與終態
    let runTypingCase = async function(query) {
        let { page, logs } = await t.openCase(browser, query)
        await t.waitReady(page)
        await t.sleep(1500)
        let [s0] = await t.states(page)
        let base = s0.text
        await t.startSampler(page)
        await t.typeSlowAtEnd(page, 'abcd')
        await t.sleep(1200) //涵蓋debounce300ms之回寫
        let samples = await t.stopSampler(page)
        assert.strictEqual(t.checkTypingSamples(samples, base, 'abcd'), '') //R12: 過程無重載、開頭未被插入
        let [s1] = await t.states(page)
        let info = await t.pageInfo(page)
        assert.strictEqual(s1.text.slice(base.length).trimStart(), 'abcd') //R12: 終態完整
        if (query.writeMode === 'none') {
            assert.strictEqual(info.mdout, ORI) //R14: 單向綁定時value不變
        }
        else {
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //R12: value與最後回拋一致
        }
        await page.keyboard.type('Y')
        await t.sleep(1200)
        let [s2] = await t.states(page)
        assert.strictEqual(s2.text.slice(base.length).trimStart(), 'abcdY') //R12: 游標維持於末尾
        await t.clickUndo(page)
        await t.sleep(600)
        let [s3] = await t.states(page)
        assert.strictEqual(s3.text.slice(base.length).trimStart(), 'abcd') //R12: 按一次復原撤銷最後一字
        assert.deepStrictEqual(logs, [])
    }

    for (let mode of ['wysiwyg', 'ir', 'sv']) {
        for (let writeMode of ['sync', 'micro', 'debounce300', 'trim', 'none']) {

            it(`R12 ${mode}模式×${writeMode}回寫: 逐鍵輸入無重載且終態、游標、復原皆正確`, async function() {
                await runTypingCase({ mode, writeMode })
            })

        }
    }

    it('R12 給予settings.i18n且同步回寫: 逐鍵輸入無重載且終態、游標、復原皆正確', async function() {
        await runTypingCase({ i18n: '1', writeMode: 'sync' })
    })

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R12 ${mode}模式×同步回寫之中文輸入法組字: 組字結果完整接於末尾`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, writeMode: 'sync' })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            let base = s0.text
            let ed = page.locator('.WVditorFix .vditor-reset[contenteditable]:visible').first()
            await ed.click()
            await page.keyboard.press('Control+End')
            let client = await page.context().newCDPSession(page)
            for (let [comp, word] of [['ㄓㄨㄥ', '中'], ['ㄨㄣˊ', '文'], ['ㄗˋ', '字']]) {
                await client.send('Input.imeSetComposition', { text: comp.slice(0, 1), selectionStart: 1, selectionEnd: 1 })
                await t.sleep(120)
                await client.send('Input.imeSetComposition', { text: comp, selectionStart: comp.length, selectionEnd: comp.length })
                await t.sleep(120)
                await client.send('Input.insertText', { text: word })
                await t.sleep(350) //逾防抖100ms, 每字皆回拋並回寫
            }
            await client.detach()
            await t.sleep(1200)
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(s1.text.slice(base.length).trimStart(), '中文字') //R12: 組字結果完整接於末尾
            assert.ok(s1.text.startsWith(base), s1.text) //R12: 開頭未被插入
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //R12: value與最後回拋一致
            assert.deepStrictEqual(logs, [])
        })

    }

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R12 ${mode}模式父層把回拋值單向同步至另一組件: 另一組件顯示之, 本組件不重載`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, shared: '1' }) //第二實例綁同一value, 由父層單向帶入
            await t.waitReady(page)
            await t.sleep(1500)
            let [a0] = await t.states(page)
            let base = a0.text
            await t.startSampler(page, 0)
            await t.typeSlowAtEnd(page, 'abcd', 150, 0)
            await t.sleep(1200)
            let samples = await t.stopSampler(page)
            assert.strictEqual(t.checkTypingSamples(samples, base, 'abcd'), '') //R12: 本組件無重載
            let [a1, b1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.ok(a1.text.startsWith(base), a1.text) //R12: 本組件終態完整
            assert.strictEqual(a1.text.slice(base.length).trimStart(), 'abcd') //R12
            assert.strictEqual(b1.text, a1.text) //R12: 另一組件顯示同步之值
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //R12: value與最後回拋一致
            assert.deepStrictEqual(logs, [])
        })

    }

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R13 ${mode}模式父層設回先前之內容: 與編輯器內容及最後回拋值皆不同, 以value為準載入`, async function() {
            let { page, logs } = await t.openCase(browser, { mode })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            let base = s0.text
            await t.typeSlowAtEnd(page, 'ab', 250)
            await t.sleep(400)
            let info0 = await t.pageInfo(page)
            assert.strictEqual(info0.inputs.length, 2) //前置: 回拋[含a, 含ab]且已同步回寫
            await t.setContent(page, info0.inputs[0]) //父層設回含a之內容
            await t.sleep(600)
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.ok(s1.text.startsWith(base), s1.text) //R13: 以value為準載入
            assert.strictEqual(s1.text.slice(base.length).trimStart(), 'a') //R13
            assert.strictEqual(info.mdout, info0.inputs[0]) //R13: 畫面與value一致
            assert.deepStrictEqual(logs, [])
        })

        it(`R13 ${mode}模式載入後尚未回拋時父層給予與畫面相同之值(僅結尾換行不同): 視為回寫而不重載, 游標維持`, async function() {
            let { page, logs } = await t.openCase(browser, { mode })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            let base = s0.text
            await page.locator('.WVditorFix .vditor-reset[contenteditable]:visible').first().click()
            await page.keyboard.press('Control+End')
            await t.setContent(page, `${ORI}\n`) //等於當前內容(僅結尾換行不同), 尚無回拋值
            await t.sleep(300)
            await page.keyboard.type('Y')
            await t.sleep(700)
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.ok(s1.text.startsWith(base), s1.text) //R13: 不重載
            assert.strictEqual(s1.text.slice(base.length).trimStart(), 'Y') //R13: Y接於末尾(游標維持)
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //R13: 之後之輸入照常回拋與回寫
            assert.deepStrictEqual(logs, [])
        })

    }

    //以下三案之前提為「已輸入而尚未回拋」, sv模式每次輸入即同步回拋(元件說明hintTimeDetect)而無此期間, 故只測wysiwyg與ir
    for (let mode of ['wysiwyg', 'ir']) {

        it(`R13 ${mode}模式使用者已輸入而尚未回拋時父層改值: 載入父層之值, 視為已編輯而保留復原歷史`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, writeMode: 'none', hintTimeDetect: '600' }) //防抖600ms, 確保改值落於尚未回拋期間
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            await t.typeSlowAtEnd(page, 'Z', 0)
            await t.setContent(page, EXT) //於Z尚未回拋時設值
            await t.sleep(1200) //涵蓋防抖600ms後寫入復原堆疊
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(s1.text, visText(mode, EXT)) //R13: 載入父層之值
            assert.deepStrictEqual(info.inputs, []) //R13: 被取代之輸入不再回拋
            assert.strictEqual(s1.undoDisabled, false) //R11/R13: 保留復原歷史
            await t.clickUndo(page)
            let [s2] = await t.states(page)
            assert.strictEqual(s2.text, s0.text) //R11/R13: 可復原至變更前已記錄之內容(Z未經防抖寫入復原堆疊)
            assert.deepStrictEqual(logs, [])
        })

        it(`R13 ${mode}模式使用者已輸入而尚未回拋時父層連續改值兩次: 兩次皆載入且保留復原歷史, 可復原至第一次之內容`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, writeMode: 'none', hintTimeDetect: '600' }) //防抖600ms, 確保第一次改值落於尚未回拋期間
            await t.waitReady(page)
            await t.sleep(1500)
            await t.typeSlowAtEnd(page, 'Z', 0)
            let e1 = '# E1\n\n第一次外部\n'
            let e2 = '# E2\n\n第二次外部\n'
            await t.setContent(page, e1) //於Z尚未回拋時設值
            await t.sleep(1200)
            let [s1] = await t.states(page)
            assert.strictEqual(s1.text, visText(mode, e1)) //前置: 載入第一次之值
            await t.setContent(page, e2)
            await t.sleep(1200)
            let [s2] = await t.states(page)
            assert.strictEqual(s2.text, visText(mode, e2)) //R13: 載入第二次之值
            assert.strictEqual(s2.undoDisabled, false) //R13: 仍保留復原歷史
            await t.clickUndo(page)
            let [s3] = await t.states(page)
            assert.strictEqual(s3.text, visText(mode, e1)) //R13: 可復原至第一次之內容
            assert.deepStrictEqual(logs, [])
        })

        it(`R13 ${mode}模式父層回寫最後回拋值而使用者已再輸入(尚未回拋): 視為回寫而不重載, 新輸入保留`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, writeMode: 'none', hintTimeDetect: '600' }) //單向綁定並由測試設值, 防抖600ms使b尚未回拋
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            let base = s0.text
            await t.typeSlowAtEnd(page, 'a', 0)
            await t.sleep(900) //a已回拋
            let info0 = await t.pageInfo(page)
            assert.strictEqual(info0.inputs.length, 1) //前置: 回拋含a之值
            await page.keyboard.type('b')
            await t.setContent(page, info0.inputs[0]) //b尚未回拋時, 父層回寫含a之值(等於最後回拋值而不等於當前內容)
            await t.sleep(300)
            let [s1] = await t.states(page)
            assert.strictEqual(s1.text.slice(base.length).trimStart(), 'ab') //R13: 不重載, b保留
            await page.keyboard.type('c')
            await t.sleep(900)
            let [s2] = await t.states(page)
            assert.ok(s2.text.startsWith(base), s2.text) //R13
            assert.strictEqual(s2.text.slice(base.length).trimStart(), 'abc') //R13: 游標維持, 之後之輸入接於末尾
            assert.deepStrictEqual(logs, [])
        })

    }

    it('R13 sv模式父層修整開頭空白: 開頭空白之增減屬內容變更, 以value為準載入(畫面與value一致)', async function() {
        let { page, logs } = await t.openCase(browser, { mode: 'sv', writeMode: 'trim' })
        await t.waitReady(page)
        await t.sleep(1500)
        let ed = page.locator('.WVditorFix .vditor-reset[contenteditable]:visible').first()
        await ed.click()
        await page.keyboard.press('Control+Home')
        await page.keyboard.type(' ')
        await t.sleep(800)
        let [s1] = await t.states(page)
        let info = await t.pageInfo(page)
        assert.ok(info.inputs.length > 0 && /^\s/.test(info.inputs[0]), JSON.stringify(info.inputs)) //前置: 回拋含開頭空白
        assert.strictEqual(info.mdout, info.inputs[info.inputs.length - 1].trim()) //前置: 父層修整兩端後回寫
        assert.strictEqual(s1.text, ORI_SRC_TEXT) //R13: 以value為準載入, 開頭空白已被父層移除
        assert.deepStrictEqual(logs, [])
    })

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R14 ${mode}模式單向綁定: 保留使用者輸入, 之後父層改值仍會載入`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, writeMode: 'none' })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            await t.typeSlowAtEnd(page, 'abc', 250)
            await t.sleep(600)
            let [s1] = await t.states(page)
            assert.ok(s1.text.startsWith(s0.text), s1.text) //R14: 保留輸入
            assert.strictEqual(s1.text.slice(s0.text.length).trimStart(), 'abc') //R14
            await t.setContent(page, EXT)
            await t.sleep(800)
            let [s2] = await t.states(page)
            assert.strictEqual(s2.text, visText(mode, EXT)) //R14: 父層改值仍會載入
            assert.deepStrictEqual(logs, [])
        })

    }

    it('R15 就緒後父層切換editable(上傳期間鎖定): false時唯讀且輸入無效、不回拋, 改回true後可輸入', async function() {
        let { page, logs } = await t.openCase(browser, {})
        await t.waitReady(page)
        await t.sleep(1500)
        await page.evaluate(() => {
            window.__vm.editable = false //父層鎖定
        })
        await t.sleep(300)
        let [s0] = await t.states(page)
        assert.strictEqual(s0.editable, 'false') //R15: 唯讀
        assert.strictEqual(s0.boldDisabled, true) //R15: 編輯類工具列停用
        //點擊落於最後一段文字上(唯讀時點擊內容下方空白處另見R15專案)
        let pLast = page.locator('.WVditorFix .vditor-reset[contenteditable]:visible p').last()
        await pLast.click({ force: true })
        await page.keyboard.type('Z')
        await t.sleep(600)
        let [s1] = await t.states(page)
        let info1 = await t.pageInfo(page)
        assert.strictEqual(s1.text, ORI_TEXT) //R15: 鎖定時輸入無效
        assert.deepStrictEqual(info1.inputs, []) //R15: 鎖定時不回拋
        await page.evaluate(() => {
            window.__vm.editable = true //父層解除鎖定
        })
        await t.sleep(300)
        await pLast.click()
        await page.keyboard.press('End')
        await page.keyboard.type('Y')
        await t.sleep(700)
        let [s2] = await t.states(page)
        let info2 = await t.pageInfo(page)
        assert.strictEqual(s2.editable, 'true') //R15: 可編輯
        assert.strictEqual(s2.text, `${ORI_TEXT}Y`) //R15: 解除後可輸入
        assert.strictEqual(info2.mdout.trimEnd(), info2.inputs[info2.inputs.length - 1].trimEnd()) //R15: 解除後回拋
        assert.deepStrictEqual(logs, [])
    })

    for (let to of ['0', '1']) {

        it(`R15 初始化期間父層把editable改為${to === '1' ? 'true' : 'false'}: 就緒時套用最新之editable`, async function() {
            let { page, logs } = await t.openCase(browser, { editable: to === '1' ? '0' : '1', editableAt: '50', editableTo: to }, { lute: 1000 })
            await t.waitReady(page)
            await t.sleep(1000)
            let [s] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(info.loadingAtEditable, true) //前置: 切換當下仍在初始化
            assert.strictEqual(s.editable, to === '1' ? 'true' : 'false') //R15: 就緒時套用最新之editable
            assert.strictEqual(s.boldDisabled, to !== '1') //R15: 編輯類工具列隨之啟用或停用
            assert.deepStrictEqual(logs, [])
        })

    }

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R15 ${mode}模式輸入後隨即鎖定(回拋與寫入復原堆疊尚在途): 鎖定後維持唯讀且復原鈕停用, 鎖定前之輸入照常回拋`, async function() {
            let { page, logs } = await t.openCase(browser, { mode })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            let base = s0.text
            await t.typeSlowAtEnd(page, 'ab')
            await page.keyboard.type('c')
            await page.evaluate(() => {
                window.__vm.editable = false //最後一鍵後隨即鎖定
            })
            await t.sleep(1000) //涵蓋vditor延後之回拋與寫入復原堆疊
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(s1.editable, 'false') //R15: 唯讀
            assert.strictEqual(s1.undoDisabled, true) //R15: 復原鈕維持停用
            assert.strictEqual(s1.boldDisabled, true) //R15: 編輯類工具列維持停用
            assert.strictEqual(s1.text.slice(base.length).trimStart(), 'abc') //R15: 鎖定前之輸入保留
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //R15: 鎖定前之輸入照常回拋
            assert.ok(info.mdout.trimEnd().endsWith('abc'), info.mdout) //R15
            assert.deepStrictEqual(logs, [])
        })

    }

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R15 ${mode}模式已編輯後鎖定, 鎖定期間父層送來新內容: 載入且維持唯讀、復原鈕停用; 解鎖後可復原至載入前之內容`, async function() {
            let { page, logs } = await t.openCase(browser, { mode })
            await t.waitReady(page)
            await t.sleep(1500)
            await t.typeAtEnd(page, 'abc')
            let [sE] = await t.states(page)
            await page.evaluate(() => {
                window.__vm.editable = false //父層鎖定(例如上傳)
            })
            await t.sleep(300)
            let fromServer = '# 標題\n\n第一段內容abc\n\n伺服器回傳之內容\n'
            await t.setContent(page, fromServer) //鎖定期間父層送來新內容
            await t.sleep(1000) //涵蓋vditor延後寫入復原堆疊
            let [s1] = await t.states(page)
            assert.strictEqual(s1.text, visText(mode, fromServer)) //R15: 載入新內容
            assert.strictEqual(s1.editable, 'false') //R15: 維持唯讀
            assert.strictEqual(s1.undoDisabled, true) //R15: 復原鈕維持停用
            assert.strictEqual(s1.boldDisabled, true) //R15
            await page.evaluate(() => {
                window.__vm.editable = true //解除鎖定
            })
            await t.sleep(300)
            let [s2] = await t.states(page)
            assert.strictEqual(s2.undoDisabled, false) //R15: 解鎖後可復原(已編輯故保留歷史)
            await t.clickUndo(page)
            let [s3] = await t.states(page)
            assert.strictEqual(s3.text, sE.text) //R11/R15: 復原至載入前之內容
            assert.deepStrictEqual(logs, [])
        })

        it(`R15 ${mode}模式提示區開啟中鎖定: 提示區關閉且無法插入, 內容不變`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, keyHint: '/ht' })
            await t.waitReady(page)
            await t.sleep(1500)
            await t.typeSlowAtEnd(page, ' /ht')
            await page.locator('.hintItem').waitFor({ state: 'visible', timeout: 5000 }) //前置: 提示區出現
            let n0 = (await t.pageInfo(page)).inputs.length
            await page.evaluate(() => {
                window.__vm.editable = false //父層鎖定
            })
            await t.sleep(600)
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(await page.locator('.hintItem').isVisible(), false) //R15: 提示區關閉
            assert.ok(s1.text.endsWith('/ht'), s1.text) //R15: 內容不變
            assert.strictEqual(info.inputs.length, n0) //R15: 不回拋
            assert.strictEqual(s1.undoDisabled, true) //R15: 復原鈕停用
            assert.deepStrictEqual(logs, [])
        })

    }

    for (let mode of ['wysiwyg', 'ir']) {

        it(`R15 ${mode}模式唯讀時點擊工作清單核取方塊與圖片: 內容不變、不回拋、不出現可編輯之彈窗`, async function() {
            let value = '# 標題\n\n- [ ] 待辦一\n- [x] 待辦二\n\n![圖](/node_modules/vditor/dist/images/logo.png)\n'
            let { page, logs } = await t.openCase(browser, { mode, value, editable: '0' })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            let cb = page.locator('.WVditorFix .vditor-reset input[type="checkbox"]').first()
            assert.strictEqual(await cb.count(), 1) //前置: 有核取方塊
            let checked0 = await cb.isChecked()
            await cb.click()
            await t.sleep(800)
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(await cb.isChecked(), checked0) //R15: 核取狀態不變
            assert.strictEqual(s1.text, s0.text) //R15: 內容不變
            assert.strictEqual(info.mdout, value) //R15: value不變
            assert.deepStrictEqual(info.inputs, []) //R15: 不回拋
            assert.strictEqual(s1.undoDisabled, true) //R15: 復原鈕停用
            let img = page.locator('.WVditorFix .vditor-reset img').first()
            if (await img.count() > 0) {
                await img.click()
                await t.sleep(500)
                let nInputs = await page.evaluate(() => [...document.querySelectorAll('.WVditorFix .vditor-panel input')].filter((e) => e.offsetParent !== null).length)
                assert.strictEqual(nInputs, 0) //R15: 不出現可編輯之圖片彈窗
            }
            assert.deepStrictEqual(logs, [])
        })

    }

    //focusInEditor, 焦點是否位於可見編輯區內(含編輯區本身)
    let focusInEditor = (page) => page.evaluate(() => {
        let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
        return !!ed && ed.contains(document.activeElement)
    })

    //keyModeSwitch, 切換至其他模式之快捷鍵(sv模式時切至wysiwyg, 其餘切至sv)
    let keyModeSwitch = (mode) => (mode === 'sv' ? 'Control+Alt+7' : 'Control+Alt+9')

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R15 ${mode}模式打字中鎖定(編輯區持有焦點): 編輯區失焦, 標題與切換模式之快捷鍵無效`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, focusLog: '1' })
            await t.waitReady(page)
            await t.sleep(1500)
            await t.typeAtEnd(page, 'a')
            let [s0] = await t.states(page)
            let info0 = await t.pageInfo(page)
            await page.evaluate(() => {
                window.__vm.editable = false //父層鎖定
            })
            await t.sleep(300)
            assert.strictEqual(await focusInEditor(page), false) //R15: 編輯區失焦
            await page.keyboard.press('Control+Alt+2') //標題快捷鍵
            await page.keyboard.press(keyModeSwitch(mode)) //切換模式之快捷鍵
            await page.keyboard.type('Z')
            await t.sleep(800)
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.ok(s0.text.endsWith('a'), s0.text) //前置: 已輸入
            assert.strictEqual(s1.text, s0.text) //R15: 內容不變(亦未切換模式)
            assert.strictEqual(s1.editable, 'false') //R15: 維持唯讀
            assert.strictEqual(info.inputs.length, info0.inputs.length) //R15: 不回拋
            assert.deepStrictEqual(info.fl.slice(info0.fl.length), ['blur']) //R15: 鎖定時之失焦仍交vditor(保存選取範圍), settings.blur恰一次(防退化)
            assert.deepStrictEqual(logs, [])
        })

    }

    //唯讀時焦點仍可進入編輯區: 以Tab鍵可移入編輯區本身或其內之連結、核取方塊, 點擊核取方塊亦使其取得焦點
    let VAL_RO = '# 標題\n\n- [ ] 待辦一\n- [x] 待辦二\n\n前文[連結](/node_modules/vditor/package.json)後文\n\n末段文字\n'

    //VAL_LONG, 超出可視高度且無可聚焦子元素之內容, 唯讀時以Tab鍵可移入編輯區本身(Chrome之可捲動容器)
    let VAL_LONG = '# 標題\n\n' + Array.from({ length: 30 }, (v, i) => `第${i + 1}段文字`).join('\n\n') + '\n'

    //logDocKeys, 記錄頁面document於bubble階段收到之按鍵(模擬父層之快捷鍵, 例如對話框以Esc關閉)
    let logDocKeys = (page) => page.evaluate(() => {
        window.__docKeys = []
        document.addEventListener('keydown', (e) => {
            window.__docKeys.push(e.key)
        })
    })

    //focusOnEditorItself, 焦點是否位於可見編輯區本身
    let focusOnEditorItself = (page) => page.evaluate(() => {
        let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
        return !!ed && document.activeElement === ed
    })

    //tabToEditorItself, 自頁首按鈕以Tab鍵將焦點移入編輯區本身
    let tabToEditorItself = async (page) => {
        await page.locator('#btnToggle').focus()
        for (let k = 0; k < 80; k++) {
            await page.keyboard.press('Tab')
            if (await focusOnEditorItself(page)) {
                return true
            }
        }
        return false
    }

    //keysRo, 換行、標題、刪除、空白(核取方塊之鍵盤勾選)、字元、切換模式之快捷鍵, 最後為Tab(縮排或插入定位字元)
    let keysRo = (mode) => ['Enter', 'Control+Alt+2', 'Backspace', 'Delete', 'Space', 'Z', keyModeSwitch(mode), 'Tab']

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R15 ${mode}模式唯讀時以Tab鍵將焦點移入編輯區再按鍵: 內容不變、不回拋、無錯誤`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, value: VAL_RO, editable: '0' })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            await page.locator('#btnToggle').focus()
            let reached = false
            for (let k = 0; k < 80; k++) {
                await page.keyboard.press('Tab')
                if (await focusInEditor(page)) {
                    reached = true
                    break
                }
            }
            assert.strictEqual(reached, true) //前置: 以Tab鍵可將焦點移入唯讀之編輯區
            for (let key of keysRo(mode)) {
                await page.keyboard.press(key)
            }
            await t.sleep(1000) //涵蓋vditor延後之回拋
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(s1.text, s0.text) //R15: 內容不變(亦未切換模式)
            assert.strictEqual(s1.editable, 'false') //R15: 維持唯讀
            assert.strictEqual(info.mdout, VAL_RO) //R15: value不變
            assert.deepStrictEqual(info.inputs, []) //R15: 不回拋
            assert.strictEqual(s1.undoDisabled, true) //R15: 復原鈕停用
            assert.deepStrictEqual(logs, []) //R15: 無錯誤
        })

    }

    for (let mode of ['wysiwyg', 'ir']) {

        //以鍵盤(Tab)移至核取方塊後之按鍵(含空白鍵)由上一案涵蓋
        it(`R15 ${mode}模式唯讀時以滑鼠左鍵與右鍵點擊核取方塊: 焦點不留在編輯區內, 之後之按鍵回到頁面且內容不變`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, value: VAL_RO, editable: '0' })
            await t.waitReady(page)
            await t.sleep(1500)
            await logDocKeys(page)
            let [s0] = await t.states(page)
            let cb = page.locator('.WVditorFix .vditor-reset input[type="checkbox"]').first()
            let checked0 = await cb.isChecked()
            for (let button of ['left', 'right']) {
                await cb.click({ button })
                await t.sleep(300) //涵蓋延後之失焦
                assert.strictEqual(await focusInEditor(page), false) //R15: 滑鼠取得之焦點不留在編輯區內
                await page.keyboard.press('Escape')
            }
            let docKeys = await page.evaluate(() => window.__docKeys.slice())
            assert.deepStrictEqual(docKeys, ['Escape', 'Escape']) //R15: 之後之按鍵回到頁面
            for (let key of keysRo(mode)) {
                await page.keyboard.press(key)
            }
            await t.sleep(1000) //涵蓋vditor延後之回拋
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(await cb.isChecked(), checked0) //R15: 核取狀態不變
            assert.strictEqual(s1.text, s0.text) //R15: 內容不變(亦未切換模式)
            assert.strictEqual(s1.editable, 'false') //R15: 維持唯讀
            assert.strictEqual(info.mdout, VAL_RO) //R15: value不變
            assert.deepStrictEqual(info.inputs, []) //R15: 不回拋
            assert.deepStrictEqual(logs, []) //R15: 無錯誤
        })

        //sv模式之編輯區無點擊處理(node_modules/vditor/src/ts/sv/index.ts), 故只測wysiwyg與ir
        it(`R15 ${mode}模式唯讀時點擊內容下方空白處: 不新增段落, 解鎖後於文件末尾之輸入接於最後一段`, async function() {
            let value = '# 標題\n\n末段文字\n'
            let { page, logs } = await t.openCase(browser, { mode, value, editable: '0' })
            await t.waitReady(page)
            await t.sleep(1500)
            let edSel = '.WVditorFix .vditor-reset[contenteditable]'
            let count = () => page.evaluate((sel) => [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null).children.length, edSel)
            let n0 = await count()
            let pt = await page.evaluate((sel) => {
                let ed = [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null)
                let r = ed.getBoundingClientRect()
                let rl = ed.lastElementChild.getBoundingClientRect()
                return { x: r.left + r.width / 2, y: Math.min(r.bottom - 10, rl.bottom + 40) }
            }, edSel)
            await page.mouse.click(pt.x, pt.y) //內容下方空白處
            await t.sleep(500)
            assert.strictEqual(await count(), n0) //R15: 唯讀時點擊不新增段落
            await page.evaluate(() => {
                window.__vm.editable = true //解除鎖定
            })
            await t.sleep(300)
            await page.locator(`${edSel}:visible p`).last().click()
            await page.keyboard.press('Control+End')
            await page.keyboard.type('Q')
            await t.sleep(700)
            let info = await t.pageInfo(page)
            assert.strictEqual(info.inputs[info.inputs.length - 1].trimEnd(), '# 標題\n\n末段文字Q') //R15: 解鎖後之輸入接於最後一段
            assert.deepStrictEqual(logs, [])
        })

        //HTML區塊之表單控制項為可輸入之元素, 其input等事件冒泡至編輯區
        it(`R15 ${mode}模式唯讀時於編輯區內之表單控制項(HTML區塊之input)輸入: 不回拋、value不變`, async function() {
            let value = '# 標題\n\n<input type="text" value="x">\n\n末段文字\n'
            let { page, logs } = await t.openCase(browser, { mode, value, editable: '0' })
            await t.waitReady(page)
            await t.sleep(1500)
            await page.locator('#btnToggle').focus()
            let reached = false
            for (let k = 0; k < 80; k++) {
                await page.keyboard.press('Tab')
                reached = await page.evaluate(() => {
                    let ae = document.activeElement
                    return !!ae && ae.tagName === 'INPUT' && !!ae.closest('.WVditorFix .vditor-reset')
                })
                if (reached) {
                    break
                }
            }
            assert.strictEqual(reached, true) //前置: 以Tab鍵可移至編輯區內之input
            await page.keyboard.type('Z')
            await t.sleep(1000) //涵蓋vditor延後之回拋
            let info = await t.pageInfo(page)
            assert.deepStrictEqual(info.inputs, []) //R15: 不回拋
            assert.strictEqual(info.mdout, value) //R15: value不變
            assert.deepStrictEqual(logs, [])
        })

        //vditor之標題鈕先清除渲染計時器才檢查停用(node_modules/vditor/src/ts/toolbar/Headings.ts:35-38), sv模式每次輸入即同步回拋而不受影響
        it(`R15 ${mode}模式輸入後隨即鎖定再點擊停用之標題鈕: 鎖定前之最後輸入仍回拋`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, writeMode: 'none', hintTimeDetect: '600' }) //防抖600ms, 確保點擊落於回拋之前
            await t.waitReady(page)
            await t.sleep(1500)
            await t.typeSlowAtEnd(page, 'Z', 0)
            await page.evaluate(() => {
                window.__vm.editable = false //父層鎖定
            })
            await t.sleep(50)
            let btn = page.locator('.WVditorFix .vditor-toolbar button[data-type="headings"]')
            assert.strictEqual(await btn.evaluate((b) => b.classList.contains('vditor-menu--disabled')), true) //前置: 標題鈕已停用
            await btn.click({ force: true })
            await t.sleep(1200) //涵蓋防抖600ms後之回拋
            let info = await t.pageInfo(page)
            assert.strictEqual(info.inputs.length, 1) //R15: 鎖定前之最後輸入仍回拋
            assert.ok(info.inputs[0].trimEnd().endsWith('Z'), JSON.stringify(info.inputs)) //R15
            assert.deepStrictEqual(logs, [])
        })

    }

    it('R15 wysiwyg模式唯讀時點擊連結: 照常另開連結, 焦點不留在編輯區內, 之後之Esc回到頁面', async function() {
        let { page, logs } = await t.openCase(browser, { value: VAL_RO, editable: '0' })
        await t.waitReady(page)
        await t.sleep(1500)
        await logDocKeys(page)
        let [popup] = await Promise.all([
            page.context().waitForEvent('page', { timeout: 5000 }),
            page.locator('.WVditorFix .vditor-reset a').first().click(),
        ])
        assert.ok(popup) //R15: 連結照常另開
        await popup.close()
        await t.sleep(300) //涵蓋延後之失焦
        assert.strictEqual(await focusInEditor(page), false) //R15: 滑鼠取得之焦點不留在編輯區內
        await page.keyboard.press('Escape')
        let docKeys = await page.evaluate(() => window.__docKeys.slice())
        let info = await t.pageInfo(page)
        assert.deepStrictEqual(docKeys, ['Escape']) //R15: 之後之按鍵回到頁面
        assert.strictEqual(info.mdout, VAL_RO) //R15: value不變
        assert.deepStrictEqual(info.inputs, []) //R15: 不回拋
        assert.deepStrictEqual(logs, [])
    })

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R15 ${mode}模式唯讀時以Tab鍵移入可捲動之編輯區本身: 方向鍵可捲動, Shift+Tab與Tab一次即離開且不落在看不見之元素, settings.focus與settings.blur成對`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, value: VAL_LONG, editable: '0', focusLog: '1' })
            await t.waitReady(page)
            await t.sleep(1500)
            assert.strictEqual(await tabToEditorItself(page), true) //前置: 以Tab鍵可移入編輯區本身
            let scrollTop = () => page.evaluate(() => [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null).scrollTop)
            let top0 = await scrollTop()
            await page.keyboard.press('PageDown')
            await t.sleep(300)
            assert.ok(await scrollTop() > top0) //R15: 鍵盤焦點保留, 可捲動唯讀之編輯區
            await page.keyboard.press('Shift+Tab')
            await t.sleep(200)
            assert.strictEqual(await focusInEditor(page), false) //R15: Shift+Tab一次即離開(不被vditor拉回)
            await page.keyboard.press('Tab')
            await t.sleep(200)
            assert.strictEqual(await focusOnEditorItself(page), true) //前置: 再以Tab鍵移入
            await page.keyboard.press('Tab')
            await t.sleep(200)
            let after = await page.evaluate(() => (document.activeElement ? document.activeElement.tagName : null))
            assert.strictEqual(await focusInEditor(page), false) //R15: Tab一次即離開(不被vditor拉回)
            assert.notStrictEqual(after, 'IFRAME') //R15: 不落在看不見之匯出用iframe
            let info = await t.pageInfo(page)
            assert.deepStrictEqual(info.fl, ['focus', 'blur', 'focus', 'blur']) //R15: settings.focus與settings.blur照常且成對
            assert.deepStrictEqual(info.inputs, []) //R15: 不回拋
            assert.deepStrictEqual(logs, [])
        })

        it(`R15 ${mode}模式唯讀時焦點在編輯區本身, 頁面以程式聚焦其他元素: 焦點移出而不被拉回`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, value: VAL_LONG, editable: '0' })
            await t.waitReady(page)
            await t.sleep(1500)
            assert.strictEqual(await tabToEditorItself(page), true) //前置: 以Tab鍵可移入編輯區本身
            await page.evaluate(() => {
                document.querySelector('#btnToggle').focus() //頁面程式聚焦(例如對話框開啟時自動聚焦)
            })
            await t.sleep(300)
            let id = await page.evaluate(() => (document.activeElement ? document.activeElement.id : null))
            assert.strictEqual(id, 'btnToggle') //R15: 焦點移至頁面指定之元素
            assert.deepStrictEqual(logs, [])
        })

    }

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R16 ${mode}模式貼上: 一變更即回拋且不重載, 之後之輸入接於貼上內容之後`, async function() {
            let { page, logs } = await t.openCase(browser, { mode })
            await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${t.port}` })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            let base = s0.text
            let ed = page.locator('.WVditorFix .vditor-reset[contenteditable]:visible').first()
            await ed.click()
            await page.keyboard.press('Control+End')
            await page.evaluate(() => navigator.clipboard.writeText('PASTE'))
            await page.keyboard.press('Control+v')
            await t.sleep(600)
            await page.keyboard.type('Y')
            await t.sleep(600)
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.ok(s1.text.startsWith(base), s1.text) //R16: 開頭未變(未重載)
            assert.strictEqual(s1.text.slice(base.length).replace(/\s+/g, ''), 'PASTEY') //R16: 貼上內容與之後之輸入接於末尾
            assert.ok(info.inputs.length >= 2, JSON.stringify(info.inputs)) //R16: 一變更即回拋
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //R16: value與最後回拋一致
            assert.deepStrictEqual(logs, [])
        })

        it(`R16 ${mode}模式工具列(選取後按粗體): 一變更即回拋且不重載, 之後之輸入接於末尾`, async function() {
            let { page, logs } = await t.openCase(browser, { mode })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            let base = s0.text
            await t.typeSlowAtEnd(page, 'abc')
            await t.sleep(600)
            await page.keyboard.down('Shift')
            for (let k = 0; k < 3; k++) {
                await page.keyboard.press('ArrowLeft')
            }
            await page.keyboard.up('Shift')
            let n0 = (await t.pageInfo(page)).inputs.length
            await page.locator('.vditor-toolbar button[data-type="bold"]').click()
            await t.sleep(600)
            let [s1] = await t.states(page)
            let info1 = await t.pageInfo(page)
            assert.ok(s1.text.startsWith(base), s1.text) //R16: 開頭未變(未重載)
            assert.ok(info1.inputs.length > n0, JSON.stringify(info1.inputs)) //R16: 一變更即回拋
            assert.ok(info1.mdout.includes('**abc**'), info1.mdout) //R16: 粗體已套用
            assert.strictEqual(info1.mdout.trimEnd(), info1.inputs[info1.inputs.length - 1].trimEnd()) //R16: value與最後回拋一致
            await page.keyboard.press('End')
            await page.keyboard.type('Y')
            await t.sleep(600)
            let [s2] = await t.states(page)
            assert.ok(s2.text.startsWith(base), s2.text) //R16: 之後之輸入未落至開頭
            assert.ok(s2.text.replace(/\s+/g, '').endsWith('Y'), s2.text) //R16: 之後之輸入接於末尾
            assert.deepStrictEqual(logs, [])
        })

        it(`R16 ${mode}模式鍵盤復原與重做: 一變更即回拋且不重載, 之後之輸入接於末尾`, async function() {
            let { page, logs } = await t.openCase(browser, { mode })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            let base = s0.text
            await t.typeSlowAtEnd(page, 'abc')
            await t.sleep(600)
            await page.keyboard.press('Control+z')
            await t.sleep(600)
            let [s1] = await t.states(page)
            let info1 = await t.pageInfo(page)
            assert.strictEqual(s1.text.slice(base.length).trimStart(), 'ab') //R16: 復原撤銷最後一字
            assert.strictEqual(info1.mdout.trimEnd(), info1.inputs[info1.inputs.length - 1].trimEnd()) //R16: 復原即回拋且value一致
            await page.keyboard.press('Control+y')
            await t.sleep(600)
            let [s2] = await t.states(page)
            let info2 = await t.pageInfo(page)
            assert.strictEqual(s2.text.slice(base.length).trimStart(), 'abc') //R16: 重做還原
            assert.strictEqual(info2.mdout.trimEnd(), info2.inputs[info2.inputs.length - 1].trimEnd()) //R16: 重做即回拋且value一致
            await page.keyboard.type('Y')
            await t.sleep(600)
            let [s3] = await t.states(page)
            assert.strictEqual(s3.text.slice(base.length).trimStart(), 'abcY') //R16: 之後之輸入接於末尾
            assert.deepStrictEqual(logs, [])
        })

        it(`R16 ${mode}模式全選刪除後輸入: 一變更即回拋且不重載`, async function() {
            let { page, logs } = await t.openCase(browser, { mode })
            await t.waitReady(page)
            await t.sleep(1500)
            let ed = page.locator('.WVditorFix .vditor-reset[contenteditable]:visible').first()
            await ed.click()
            await page.keyboard.press('Control+a')
            await page.keyboard.press('Backspace')
            await t.sleep(300)
            await page.keyboard.type('NEW', { delay: 150 })
            await t.sleep(600)
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(s1.text, 'NEW') //R16: 舊內容不再出現(未重載)
            assert.strictEqual(info.mdout.trimEnd(), 'NEW') //R16: value一致
            assert.deepStrictEqual(logs, [])
        })

    }

    it('R06 語系檔未到即關閉: 不拋錯、不呼叫settings.after, 初始化完成後無殘留window監聽', async function() {
        let { page: pageBase } = await t.openCase(browser, { hide: '1' })
        await t.sleep(1000)
        let base = await t.windowListeners(pageBase) //對照: 未掛載元件之頁面
        let { page, logs } = await t.openCase(browser, { destroyAt: '300', after: '1' }, { i18n: 1500 })
        await t.sleep(4500) //涵蓋語系檔與lute到達後之初始化
        let info = await t.pageInfo(page)
        assert.strictEqual(info.existedAtDestroy, true) //前置(正向對照): 銷毀前元件已掛載
        assert.strictEqual(info.loadingAtDestroy, true) //前置: 銷毀當下仍在載入
        assert.strictEqual(await page.locator('.WVditorFix').count(), 0) //前置: 已關閉
        assert.deepStrictEqual(info.errs, []) //R06: Vue生命週期無錯誤
        assert.deepStrictEqual(logs, []) //R06: 主控台無錯誤
        assert.deepStrictEqual(info.after, []) //R06: 不呼叫settings.after
        assert.deepStrictEqual(await t.windowListeners(page), base) //R06: 無殘留之window監聽
    })

    it('R06 就緒後關閉: 不拋錯且無殘留window監聽', async function() {
        let { page: pageBase } = await t.openCase(browser, { hide: '1' })
        await t.sleep(1000)
        let base = await t.windowListeners(pageBase) //對照: 未掛載元件之頁面
        let { page, logs } = await t.openCase(browser, {})
        await t.waitReady(page)
        await t.sleep(800)
        await page.click('#btnToggle') //關閉
        await page.locator('.WVditorFix').waitFor({ state: 'detached' })
        await t.sleep(800)
        let info = await t.pageInfo(page)
        assert.deepStrictEqual(info.errs, []) //R06: Vue生命週期無錯誤
        assert.deepStrictEqual(logs, []) //R06: 主控台無錯誤
        assert.deepStrictEqual(await t.windowListeners(page), base) //R06: 無殘留之window監聽
    })

    it('R06 語系檔已到、lute未到即關閉: 不拋錯、不呼叫settings.after, 初始化完成後無殘留window監聽', async function() {
        let { page: pageBase } = await t.openCase(browser, { hide: '1' })
        await t.sleep(1000)
        let base = await t.windowListeners(pageBase)
        let { page, logs } = await t.openCase(browser, { destroyAt: '300', after: '1' }, { lute: 1500 })
        await t.sleep(4500)
        let info = await t.pageInfo(page)
        assert.strictEqual(info.existedAtDestroy, true) //前置(正向對照)
        assert.strictEqual(info.loadingAtDestroy, true) //前置
        assert.strictEqual(await page.locator('.WVditorFix').count(), 0) //前置
        assert.deepStrictEqual(info.errs, []) //R06
        assert.deepStrictEqual(logs, []) //R06
        assert.deepStrictEqual(info.after, []) //R06
        assert.deepStrictEqual(await t.windowListeners(page), base) //R06: lute到達後vditor之initUI所綁之監聽亦已移除
    })

    //三種模式各有延後寫入復原堆疊之計時(vditor/src/ts/wysiwyg/afterRenderEvent.ts:42、ir/process.ts:78、sv/process.ts:140); settings.i18n只影響語系檔載入時序, 與模式無關, 只測wysiwyg
    for (let [mode, i18n] of [['wysiwyg', '0'], ['wysiwyg', '1'], ['ir', '0'], ['sv', '0']]) {

        it(`R07 ${mode}模式editable=false${i18n === '1' ? '且給予settings.i18n' : ''}: 就緒後唯讀且復原鈕與編輯類工具列始終停用`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, editable: '0', i18n })
            await t.waitReady(page)
            let samples = []
            for (let k = 0; k < 40; k++) { //取樣約2秒以上, 涵蓋防抖寫入復原堆疊
                let [s] = await t.states(page)
                samples.push(s)
                await t.sleep(50)
            }
            assert.ok(samples.every((s) => s.text === visText(mode, ORI)), JSON.stringify(samples.map((s) => s.text))) //R01
            assert.ok(samples.every((s) => s.editable === 'false'), JSON.stringify(samples.map((s) => s.editable))) //R07: 唯讀
            assert.ok(samples.every((s) => s.undoDisabled === true), JSON.stringify(samples.map((s) => s.undoDisabled))) //R07: 復原鈕始終停用
            assert.ok(samples.every((s) => s.boldDisabled === true), JSON.stringify(samples.map((s) => s.boldDisabled))) //R07: 編輯類工具列始終停用
            assert.deepStrictEqual(logs, [])
        })

    }

    it('R07 editable=false且就緒後組件外變更value: 復原鈕維持停用', async function() {
        let { page, logs } = await t.openCase(browser, { editable: '0', changeAt: '2500', changeTo: '# 新內容\n' })
        await t.waitReady(page)
        await page.waitForFunction(() => document.querySelector('#mdout').textContent.includes('新內容'))
        await t.sleep(1000)
        let [s] = await t.states(page)
        assert.strictEqual(s.text, '新內容') //前置: 已顯示新值
        assert.strictEqual(s.undoDisabled, true) //R07: 復原鈕維持停用
        assert.deepStrictEqual(logs, [])
    })

    it('R08 value為null: 顯示空白而非字面null, 輸入後回拋不含null, 再改回null時清空', async function() {
        let { page, logs } = await t.openCase(browser, { valueNull: '1' })
        await t.waitReady(page)
        await t.sleep(1000)
        let [s0] = await t.states(page)
        let info0 = await t.pageInfo(page)
        assert.strictEqual(s0.text, '') //R08: 視為空字串
        assert.deepStrictEqual(info0.inputs, []) //R01: 載入不回拋
        await page.locator('.vditor-wysiwyg .vditor-reset').click()
        await page.keyboard.type('ZZZ')
        await t.sleep(700)
        let info = await t.pageInfo(page)
        assert.ok(info.inputs.length > 0) //前置: 輸入已回拋
        assert.ok(info.inputs.every((v) => !v.includes('null')), JSON.stringify(info.inputs)) //R08: 回拋值不含null
        assert.strictEqual(info.inputs[info.inputs.length - 1].trim(), 'ZZZ') //R08
        await t.setContent(page, null)
        await t.sleep(800)
        let [s1] = await t.states(page)
        assert.strictEqual(s1.text, '') //R08: 改回null時清空且不顯示null
        assert.deepStrictEqual(logs, [])
    })

    it('R08 value為數字: 轉為字串顯示', async function() {
        let { page, logs } = await t.openCase(browser, { valueNum: '1' })
        await t.waitReady(page)
        await t.sleep(1000)
        let [s] = await t.states(page)
        assert.strictEqual(s.text, '12345') //R08: 非字串轉為字串, 與修正前之顯示一致
        assert.deepStrictEqual(logs, [])
    })

    for (let mode of ['ir', 'sv']) {

        it(`R01/R02/R03 ${mode}模式: 顯示初始內容且復原鈕停用, 輸入後連按復原停在初始內容`, async function() {
            let { page, logs } = await t.openCase(browser, { mode })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s0] = await t.states(page)
            let info0 = await t.pageInfo(page)
            assert.strictEqual(s0.text, ORI_SRC_TEXT) //R01
            assert.deepStrictEqual(info0.inputs, []) //R01
            assert.strictEqual(s0.undoDisabled, true) //R02
            await t.typeAtEnd(page, 'ZZZ')
            let [s1] = await t.states(page)
            assert.ok(s1.text.endsWith('ZZZ'), s1.text) //前置: 輸入已生效
            await t.clickUndo(page)
            await t.clickUndo(page)
            let [s2] = await t.states(page)
            assert.strictEqual(s2.text, ORI_SRC_TEXT) //R03
            assert.strictEqual(s2.undoDisabled, true) //R03
            assert.deepStrictEqual(logs, [])
        })

        it(`R01 ${mode}模式且lute延遲1.5秒: 仍顯示初始內容`, async function() {
            let { page, logs } = await t.openCase(browser, { mode }, { lute: 1500 })
            await t.waitReady(page)
            await t.sleep(1500)
            let [s] = await t.states(page)
            assert.strictEqual(s.text, ORI_SRC_TEXT) //R01
            assert.strictEqual(s.undoDisabled, true) //R02
            assert.deepStrictEqual(logs, []) //R01: 無Md2VditorIRDOM、SpinVditorSVDOM等錯誤
        })

    }

    it('R01/R02 同頁兩實例同時開啟: 皆顯示各自內容且復原鈕停用', async function() {
        let { page, logs } = await t.openCase(browser, { instances: '2' })
        await t.waitReady(page)
        await t.sleep(1500)
        let ss = await t.states(page)
        assert.deepStrictEqual(ss.map((s) => s.text), [ORI_TEXT, SECOND_TEXT]) //R01
        assert.deepStrictEqual(ss.map((s) => s.undoDisabled), [true, true]) //R02
        assert.deepStrictEqual(logs, [])
    })

    it('R01 同頁兩實例同時開啟且lute延遲1.5秒: 皆顯示各自內容', async function() {
        let { page, logs } = await t.openCase(browser, { instances: '2' }, { lute: 1500 })
        await t.waitReady(page)
        await t.sleep(1500)
        let ss = await t.states(page)
        assert.deepStrictEqual(ss.map((s) => s.text), [ORI_TEXT, SECOND_TEXT]) //R01
        assert.deepStrictEqual(logs, []) //R01
    })

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R09 ${mode}模式提示區插入內容後: 內容正確、只回拋清理後之值、提示窗關閉、復原歷史保留且之後之輸入接於插入內容之後`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, keyHint: '/ht' })
            await t.waitReady(page)
            await t.sleep(1500)
            await t.typeAtEnd(page, ' /ht')
            await page.locator('.hintItem').waitFor({ state: 'visible', timeout: 5000 }) //前置: 提示區出現
            let n0 = (await t.pageInfo(page)).inputs.length
            await page.locator('.hintItem').click()
            await t.sleep(1500) //觀察窗涵蓋提示區偵測(findAnchor輪詢)與防抖
            let [s] = await t.states(page)
            let info = await t.pageInfo(page)
            let inputsAfter = info.inputs.slice(n0)
            assert.ok(s.text.includes('XYZ'), s.text) //R09: 已插入
            assert.ok(!s.text.includes('/ht'), s.text) //R09: 觸發字串已移除
            assert.strictEqual(inputsAfter.length, 1, JSON.stringify(inputsAfter)) //R09: 只回拋一次
            assert.ok(!inputsAfter[0].includes('/ht'), inputsAfter[0]) //R09: 回拋清理後之值
            assert.strictEqual(info.mdout, inputsAfter[0]) //R09: value為插入後之值
            assert.strictEqual(await page.locator('.hintItem').isVisible(), false) //R09: 提示窗已關閉
            assert.strictEqual(s.undoDisabled, false) //R09: 復原歷史保留(插入未被當成組件外變更而清空)
            await page.keyboard.type('QQ', { delay: 150 })
            await t.sleep(800)
            let [s2] = await t.states(page)
            assert.ok(s2.text.includes('XYZQQ'), s2.text) //R09: 之後之輸入接於插入內容之後
            assert.ok(s2.text.startsWith('標題') || s2.text.startsWith('# 標題'), s2.text) //R09: 未落至文件開頭
            assert.deepStrictEqual(logs, [])
        })

    }

    for (let mode of ['wysiwyg', 'ir', 'sv']) {

        it(`R09 ${mode}模式於文件中段觸發且後文含相同字串: 只移除本次輸入之觸發字串, 之後之輸入接於插入內容之後`, async function() {
            let value = '# 標題\n\n第一段內容\n\n聯絡a@b.com\n'
            let { page, logs } = await t.openCase(browser, { mode, keyHint: '@', value })
            await t.waitReady(page)
            await t.sleep(1500)
            if (mode === 'sv') {
                //sv模式為原始碼, 以鍵盤移至第一段(第3行)
                await page.locator('.WVditorFix .vditor-reset[contenteditable]:visible').first().click()
                await page.keyboard.press('Control+Home')
                await page.keyboard.press('ArrowDown')
                await page.keyboard.press('ArrowDown')
            }
            else {
                await page.locator('.WVditorFix .vditor-reset[contenteditable]:visible p').first().click() //第一段
            }
            await page.keyboard.press('End')
            await page.keyboard.type(' @', { delay: 150 })
            await page.locator('.hintItem').waitFor({ state: 'visible', timeout: 5000 }) //前置: 提示區出現
            await page.locator('.hintItem').click()
            await t.sleep(1200)
            await page.keyboard.type('QQ', { delay: 150 })
            await t.sleep(800)
            let [s] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.ok(s.text.includes('第一段內容 XYZQQ'), s.text) //R09: 移除本次輸入之觸發字串並於該處插入, 之後之輸入接於其後
            assert.ok(s.text.includes('a@b.com'), s.text) //R09: 後文之相同字串未被誤刪
            assert.ok(info.mdout.includes('a@b.com') && !info.mdout.includes(' @XYZ'), info.mdout) //R09: value一致
            assert.strictEqual(info.mdout.trimEnd(), info.inputs[info.inputs.length - 1].trimEnd()) //R09
            assert.deepStrictEqual(logs, [])
        })

        it(`R09/R13 ${mode}模式提示區開啟中父層載入新內容: 提示區關閉, 以value為準載入且不回拋`, async function() {
            let { page, logs } = await t.openCase(browser, { mode, keyHint: '/ht', writeMode: 'none' })
            await t.waitReady(page)
            await t.sleep(1500)
            await t.typeSlowAtEnd(page, ' /ht')
            await page.locator('.hintItem').waitFor({ state: 'visible', timeout: 5000 }) //前置: 提示區出現
            let n0 = (await t.pageInfo(page)).inputs.length
            await t.setContent(page, EXT) //父層載入新內容(整份取代, 提示區記錄之插入位置失效)
            await t.sleep(600)
            let [s1] = await t.states(page)
            let info = await t.pageInfo(page)
            assert.strictEqual(await page.locator('.hintItem').isVisible(), false) //R09: 提示區關閉
            assert.strictEqual(s1.text, visText(mode, EXT)) //R13: 以value為準載入
            assert.strictEqual(info.inputs.length, n0) //R13: 載入不回拋
            assert.deepStrictEqual(logs, [])
        })

    }

    it('R10 settings.after: 於初始化完成且已載入value後被呼叫一次, 接收者為合併後之設定', async function() {
        let { page, logs } = await t.openCase(browser, { after: '1' })
        await t.waitReady(page)
        await t.sleep(1500)
        let info = await t.pageInfo(page)
        assert.strictEqual(info.after.length, 1) //R10: 呼叫一次
        assert.strictEqual(info.after[0].text.replace(/\s+/g, ' '), ORI_TEXT) //R10: 呼叫當下已載入value
        assert.strictEqual(info.after[0].receiverHasMode, true) //R10: 接收者為vditor合併後之設定
        assert.deepStrictEqual(logs, [])
    })

    it('R10 settings.after且editable=false: 呼叫當下已為唯讀', async function() {
        let { page, logs } = await t.openCase(browser, { after: '1', editable: '0' })
        await t.waitReady(page)
        await t.sleep(1000)
        let info = await t.pageInfo(page)
        assert.strictEqual(info.after.length, 1) //R10
        assert.strictEqual(info.after[0].editable, 'false') //R10: 唯讀已於after前套用
        assert.deepStrictEqual(logs, [])
    })

})
