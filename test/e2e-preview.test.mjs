//e2e-preview: 預覽之媒體連結安全(spec/流程_預覽之媒體連結安全.md)
//每個it為一個E2E-NNN(只測分割預覽: 所見即所得與即時渲染無預覽區), 每案全新瀏覽器; 操作只經編輯器之真鍵盤滑鼠與示範宿主頁(test/host/index.html)
//內容中之腳本指令為「window.__xss=1」, 若被執行則頁面全域旗標window.__xss為1(previewMedia讀取, 只讀)
//斷言註解之①②…對應spec該案「驗證／語意」之編號
import assert from 'assert'
import {
    MODE_NAMES, DOCS, launchBrowser, createFlow,
    waitInputs, hostInfo, previewMedia, typeAtEnd
} from './tools/e2e-setup.mjs'
import { waitUntilExist } from './tools/e2eLib.mjs'


let flow = createFlow('preview')


//onlyResourceErrors, 主控台訊息是否只有「播放器網址無效之資源載入失敗」(夾帶指令之網址與/media/*對本機站台為404, 屬各案例之預期, 非元件錯誤)
function onlyResourceErrors(logs) {
    return logs.every((l) => l.startsWith('[error] Failed to load resource'))
}


//waitMediaFailed, 等第一個編輯器之預覽區出現指定標籤之播放器且其載入已失敗(video.error非空, 同步點), 之後之負向觀察窗由呼叫端給定
async function waitMediaFailed(page, tag) {
    await waitUntilExist(page, `預覽區出現${tag}播放器且載入已失敗`, (t) => {
        let fix = document.querySelectorAll('.WVditorFix')[0]
        let pv = fix ? fix.querySelector('.vditor-preview') : null
        let m = pv ? pv.querySelector(t) : null
        return !!m && m.error !== null
    }, { timeout: 10000, arg: tag })
}


describe('e2e-preview：預覽之媒體連結安全', function() {

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

    //E2E-001 分割預覽不執行影片連結中夾帶的腳本
    //①起點: 示範宿主頁, 分割預覽, 文件XSS_VIDEO ②點擊: 無 ③看到: 預覽區出現影片播放器 ④輸入: 無 ⑤之後: 夾帶之指令不被執行 ⑥副作用: 載入不回傳
    it(`E2E-001 [${MODE_NAMES.sv}] 分割預覽不執行影片連結中夾帶的腳本`, async function() {
        let { page, logs } = await flow.openReady(browser, { mode: 'sv', doc: 'XSS_VIDEO' })
        await waitMediaFailed(page, 'video')
        await page.waitForTimeout(500) //負向觀察窗: 載入失敗後旗標不得被設定(失敗事件之處理函式於同一任務佇列執行, 此窗確認其後不再變動)
        let pv = await previewMedia(page)
        let info = await hostInfo(page)
        assert.strictEqual(pv.media.length, 1, JSON.stringify(pv)) //①
        assert.strictEqual(pv.media[0].tag, 'video', JSON.stringify(pv)) //①
        assert.strictEqual(pv.xss, undefined, JSON.stringify(pv)) //②
        assert.deepStrictEqual(pv.media[0].attrs, ['controls', 'src'], JSON.stringify(pv)) //③
        assert.strictEqual(pv.media[0].src, `x" onerror="window.__xss=1" a=".mp4`, JSON.stringify(pv)) //④
        assert.deepStrictEqual(info.inputs, []) //⑤
        assert.ok(onlyResourceErrors(logs), JSON.stringify(logs)) //⑥
    })

    //E2E-002 分割預覽不執行音訊連結中夾帶的腳本
    //①起點: 示範宿主頁, 分割預覽, 文件XSS_AUDIO ②～⑥同E2E-001(播放器改為音訊)
    it(`E2E-002 [${MODE_NAMES.sv}] 分割預覽不執行音訊連結中夾帶的腳本`, async function() {
        let { page, logs } = await flow.openReady(browser, { mode: 'sv', doc: 'XSS_AUDIO' })
        await waitMediaFailed(page, 'audio')
        await page.waitForTimeout(500) //負向觀察窗: 同E2E-001
        let pv = await previewMedia(page)
        let info = await hostInfo(page)
        assert.strictEqual(pv.media.length, 1, JSON.stringify(pv)) //①
        assert.strictEqual(pv.media[0].tag, 'audio', JSON.stringify(pv)) //①
        assert.strictEqual(pv.xss, undefined, JSON.stringify(pv)) //②
        assert.deepStrictEqual(pv.media[0].attrs, ['controls', 'src'], JSON.stringify(pv)) //③
        assert.strictEqual(pv.media[0].src, `x" onerror="window.__xss=1" a=".mp3`, JSON.stringify(pv)) //④
        assert.deepStrictEqual(info.inputs, []) //⑤
        assert.ok(onlyResourceErrors(logs), JSON.stringify(logs)) //⑥
    })

    //E2E-003 分割預覽顯示正常的影片與音訊連結
    //①起點: 示範宿主頁, 分割預覽, 文件MEDIA_OK ②點擊: 無 ③看到: 預覽區出現影片與音訊播放器 ④輸入: 無 ⑤之後: 播放器之網址即連結所寫 ⑥副作用: 無
    it(`E2E-003 [${MODE_NAMES.sv}] 分割預覽顯示正常的影片與音訊連結`, async function() {
        let { page, logs } = await flow.openReady(browser, { mode: 'sv', doc: 'MEDIA_OK' })
        await waitMediaFailed(page, 'video') //網址對本機站台為404, 載入失敗為預期; 以此為預覽已渲染之同步點
        await waitMediaFailed(page, 'audio')
        let pv = await previewMedia(page)
        let vs = pv.media.filter((m) => m.tag === 'video')
        let as = pv.media.filter((m) => m.tag === 'audio')
        assert.strictEqual(vs.length, 1, JSON.stringify(pv)) //①
        assert.strictEqual(as.length, 1, JSON.stringify(pv)) //①
        assert.strictEqual(vs[0].src, '/media/a.mp4', JSON.stringify(pv)) //②
        assert.strictEqual(vs[0].controls, true, JSON.stringify(pv)) //②
        assert.strictEqual(as[0].src, '/media/a.mp3', JSON.stringify(pv)) //③
        assert.strictEqual(as[0].controls, true, JSON.stringify(pv)) //③
        assert.strictEqual(pv.links, 0, JSON.stringify(pv)) //④
        assert.ok(onlyResourceErrors(logs), JSON.stringify(logs)) //資源載入失敗以外無錯誤
    })

    //E2E-004 輸入含影片連結的內容時預覽區不執行夾帶的腳本
    //①起點: 示範宿主頁, 分割預覽, 預設文件 ②點擊: 編輯區 ③看到: 預覽區出現影片播放器 ④輸入: 換行與XSS_LINK(超連結行) ⑤之後: 夾帶之指令不被執行 ⑥副作用: 頁面持有之內容含該超連結原文
    it(`E2E-004 [${MODE_NAMES.sv}] 輸入含影片連結的內容時預覽區不執行夾帶的腳本`, async function() {
        let { page, logs } = await flow.openReady(browser, { mode: 'sv' })
        await typeAtEnd(page, `\n${DOCS.XSS_LINK}`)
        await waitInputs(page, '回傳含超連結原文', { lastIncludes: DOCS.XSS_LINK })
        await waitMediaFailed(page, 'video')
        await page.waitForTimeout(500) //負向觀察窗: 同E2E-001
        let pv = await previewMedia(page)
        let info = await hostInfo(page)
        assert.strictEqual(pv.media.length, 1, JSON.stringify(pv)) //①
        assert.strictEqual(pv.media[0].tag, 'video', JSON.stringify(pv)) //①
        assert.strictEqual(pv.xss, undefined, JSON.stringify(pv)) //②
        assert.deepStrictEqual(pv.media[0].attrs, ['controls', 'src'], JSON.stringify(pv)) //③
        assert.ok(info.mdout.includes(DOCS.XSS_LINK), info.mdout) //④
        assert.ok(onlyResourceErrors(logs), JSON.stringify(logs)) //⑤
    })

})
