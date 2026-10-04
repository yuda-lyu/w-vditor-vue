//e2e-setup: e2e測試之專案組態與專案專屬原語, 共用實作經./e2eLib.mjs單一橋接
//- 每個測試檔為一個流程(spec/流程_*.md), 各自以固定port之本機靜態站與test/_tmp/<流程代號>/之編譯目錄執行, 供mocha --parallel並行
//- 元件由現行src以rollup編譯(與toolg/gDistRollupComps.mjs同設定), 不依賴./dist; 環境變數E2E_SRC_DIR可改指他版src供紅燈驗證
//- 宿主頁test/host/index.html扮演父層頁面, 父層行為於開頁時以網址參數設定(setup); act階段只經宿主頁之按鈕、快捷鍵與編輯器之真鍵盤滑鼠
//- 本模組之讀取類函數(states、hostInfo等)只供斷言觀察, 不改動頁面狀態
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'
import { launchBrowser, waitUntilExist, pollUntil, createKnownDefect } from './e2eLib.mjs'


let projRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..') //本模組位於test/tools, 上兩層為專案根
let testDir = path.join(projRoot, 'test')
let fdTmpRoot = path.join(testDir, '_tmp')
let fdHost = path.join(testDir, 'host')


//FLOW_PORTS, 流程代號與其靜態站port(≥8000、固定不隨機、與CLAUDE_rulebook.md之e2e映射一致)
let FLOW_PORTS = {
    'load': 8136,
    'editing': 8137,
    'parent-update': 8138,
    'readonly': 8139,
    'readonly-focus': 8140,
    'key-hint': 8141,
}


//MODES, 編輯模式(各案例之變體迴圈), 名稱同vditor工具列「切換編輯模式」之選項文字
let MODES = ['wysiwyg', 'ir', 'sv']
let MODE_NAMES = {
    wysiwyg: '所見即所得',
    ir: '即時渲染',
    sv: '分割預覽',
}


//keyModeSwitch, 切換至其他編輯模式之快捷鍵(分割預覽切至所見即所得, 其餘切至分割預覽)
function keyModeSwitch(mode) {
    return mode === 'sv' ? 'Control+Alt+7' : 'Control+Alt+9'
}


//keysRo, 唯讀時驗證按鍵無效之序列: 換行、二級標題、刪除、空白(核取方塊之鍵盤勾選)、字元、切換模式、Tab(縮排或插入定位字元)
function keysRo(mode) {
    return ['Enter', 'Control+Alt+2', 'Backspace', 'Delete', 'Space', 'Z', keyModeSwitch(mode), 'Tab']
}


//DOCS, 宿主頁之文件(與宿主頁讀同一檔)
let DOCS = JSON.parse(fs.readFileSync(path.join(fdHost, 'docs.json'), 'utf8'))


let kpMime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
}


let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


//visText, 只含標題與段落之markdown於各模式之可見文字(空白正規化): 所見即所得不顯示標題標記, 即時渲染與分割預覽顯示
function visText(mode, md) {
    return (mode === 'wysiwyg' ? md.replace(/^#+ /gm, '') : md).trim().replace(/\s+/g, ' ')
}


//getSrcDir, 元件原始碼資料夾, 預設專案之src/components; E2E_SRC_DIR供紅燈驗證改指他版
function getSrcDir() {
    let fd = process.env.E2E_SRC_DIR ? path.resolve(process.env.E2E_SRC_DIR) : path.join(projRoot, 'src', 'components')
    if (!fs.existsSync(path.join(fd, 'WVditorVue.vue'))) {
        throw new Error(`找不到元件原始碼: ${path.join(fd, 'WVditorVue.vue')}`)
    }
    return fd
}


//buildComponent, 以與toolg/gDistRollupComps.mjs相同之設定編譯元件至fdDist
async function buildComponent(fdDist) {
    fs.mkdirSync(fdDist, { recursive: true })
    await rollupFiles({
        fns: 'WVditorVue.vue',
        fdSrc: getSrcDir(),
        fdTar: fdDist,
        format: 'umd',
        nameDistType: 'kebabCase',
        globals: {
            'vue': 'Vue',
        },
        external: [
            'vue',
        ],
        bLog: false,
    })
    //rollupFiles內部吞掉錯誤只console.log, 且編譯前會清空輸出資料夾, 故以產物存在判定編譯成功
    let fp = path.join(fdDist, 'w-vditor-vue.umd.js')
    if (!fs.existsSync(fp)) {
        throw new Error(`編譯元件失敗, 找不到${fp}`)
    }
}


//resolveUnder, 解碼後之路徑落於root之下才回傳絕對路徑(路徑穿越防護)
function resolveUnder(root, rel) {
    let fp = path.resolve(root, '.' + rel)
    if (fp !== root && !fp.startsWith(root + path.sep)) {
        return null
    }
    return fp
}


//startServer, 本機靜態站: /host/為宿主頁, /bundle/為本流程編譯之元件, /node_modules/為vue與vditor資源, 其餘404
function startServer(port, fdDist) {
    let origin = `http://127.0.0.1:${port}`
    let roots = [
        ['/host/', fdHost],
        ['/bundle/', fdDist],
        ['/node_modules/', path.join(projRoot, 'node_modules')],
    ]
    let server = http.createServer((req, res) => {
        let pathname
        try {
            pathname = decodeURIComponent(new URL(req.url, origin).pathname)
        }
        catch (err) {
            res.writeHead(400)
            res.end('bad request')
            return
        }
        let fp = null
        for (let [prefix, root] of roots) {
            if (pathname.startsWith(prefix)) {
                fp = resolveUnder(root, pathname.slice(prefix.length - 1))
                break
            }
        }
        if (!fp || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
            res.writeHead(404)
            res.end('not found')
            return
        }
        res.writeHead(200, { 'content-type': kpMime[path.extname(fp)] || 'application/octet-stream', 'cache-control': 'no-store' })
        fs.createReadStream(fp).pipe(res)
    })
    return new Promise((resolve, reject) => {
        server.once('error', (err) => {
            reject(new Error(`無法於127.0.0.1:${port}啟動測試站(${err.code}), 該port為本專案固定配發(CLAUDE_rulebook.md), 請確認未被其他程式佔用`))
        })
        server.listen(port, '127.0.0.1', () => {
            resolve(server)
        })
    })
}


//removeFlowDir, 刪除本流程之中介資料; test/_tmp已無其他流程之資料夾時一併移除(並行中之其他檔尚在使用時保留)
function removeFlowDir(fdFlow) {
    fs.rmSync(fdFlow, { recursive: true, force: true })
    try {
        fs.rmdirSync(fdTmpRoot)
    }
    catch (err) {}
}


//createFlow, 建立一個流程之執行環境: setup於mocha之before(編譯並啟動靜態站), teardown於after(關站並刪除中介資料)
function createFlow(flow) {
    let port = FLOW_PORTS[flow]
    if (!port) {
        throw new Error(`未登錄之流程代號: ${flow}`)
    }
    let origin = `http://127.0.0.1:${port}`
    let fdFlow = path.join(fdTmpRoot, flow)
    let fdDist = path.join(fdFlow, 'dist')
    let server = null

    let setup = async () => {
        await buildComponent(fdDist)
        server = await startServer(port, fdDist)
    }

    let teardown = async () => {
        if (server) {
            await new Promise((resolve) => server.close(() => resolve()))
            server = null
        }
        removeFlowDir(fdFlow)
    }

    //openCase, 每case全新context開啟宿主頁: 阻擋並記錄所有非本機請求(測試不得依賴外網); 收集主控台錯誤;
    //net可延遲(luteDelay、i18nDelay, 毫秒)或中止(luteAbort、i18nAbort)排版引擎與語系檔之請求, 模擬較慢或中斷之網路(測試環境條件, 屬setup), 延遲與中止並給時為延遲後才失敗;
    //assets依序記錄排版引擎(lute)、語系檔(i18n)、圖示(icons)之請求發出、送達與失敗('<資源>:request'、':finished'、':failed'), 供觀察vditor之載入進度
    let openCase = async (browser, query = {}, net = {}) => {
        let context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
        let external = []
        await context.route('**/*', (route) => {
            let u = route.request().url()
            if (u.startsWith(origin)) {
                route.fallback()
                return
            }
            external.push(u)
            route.abort()
        })
        let page = await context.newPage()
        let logs = []
        page.on('console', (m) => {
            let t = m.text()
            if (m.type() === 'error' || /TypeError|Error:/.test(t)) {
                logs.push(`[${m.type()}] ${t.split('\n')[0]}`)
            }
        })
        page.on('pageerror', (e) => {
            logs.push(`[pageerror] ${e.message}`)
        })
        let assets = []
        let assetKind = (req) => {
            let u = req.url()
            if (!u.startsWith(origin)) {
                return null
            }
            if (u.includes('/dist/js/lute/')) {
                return 'lute'
            }
            if (u.includes('/dist/js/i18n/')) {
                return 'i18n'
            }
            if (u.includes('/dist/js/icons/')) {
                return 'icons'
            }
            return null
        }
        for (let [ev, tag] of [['request', 'request'], ['requestfinished', 'finished'], ['requestfailed', 'failed']]) {
            page.on(ev, (req) => {
                let k = assetKind(req)
                if (k) {
                    assets.push(`${k}:${tag}`)
                }
            })
        }
        let routeNet = async (glob, delay, abort) => {
            if (!delay && !abort) {
                return
            }
            await page.route(glob, async (route) => {
                if (delay) {
                    await sleep(delay)
                }
                if (abort) {
                    await route.abort()
                }
                else {
                    await route.continue()
                }
            })
        }
        await routeNet('**/dist/js/lute/lute.min.js', net.luteDelay, net.luteAbort)
        await routeNet('**/dist/js/i18n/*.js', net.i18nDelay, net.i18nAbort)
        let qs = new URLSearchParams(query).toString()
        await page.goto(`${origin}/host/index.html?${qs}`)
        return { context, page, logs, external, assets }
    }

    //openReady, 開啟宿主頁並等就緒後settle, 另回傳開啟時第一個編輯器之可見文字(base)
    let openReady = async (browser, query = {}, net = {}) => {
        let r = await openCase(browser, query, net)
        await waitReady(r.page)
        await r.page.waitForTimeout(1500) //就緒後之settle: 涵蓋載入後延後寫入復原紀錄(防抖100ms)與唯讀之套用, 使之後之輸入為獨立之復原步驟
        let [s0] = await states(r.page)
        return { ...r, base: s0 ? s0.text : null }
    }

    return {
        flow,
        port,
        origin,
        setup,
        teardown,
        openCase,
        openReady,
    }
}


//waitReady, 就緒: 每個編輯器之載入遮擋(max-height:0)解除且可見編輯區已出現
async function waitReady(page, timeout = 15000) {
    await waitUntilExist(page, '編輯器就緒', () => {
        let fixes = [...document.querySelectorAll('.WVditorFix')]
        if (fixes.length === 0) {
            return false
        }
        return fixes.every((fix) => {
            let loading = (fix.getAttribute('style') || '').includes('max-height')
            let ed = [...fix.querySelectorAll('.vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
            return !loading && !!ed
        })
    }, { timeout })
}


//waitHostMounted, 宿主頁已完成掛載(編輯器開關鈕之文字已由模板產生), 供開頁時不顯示編輯器之對照頁使用
async function waitHostMounted(page, timeout = 15000) {
    await waitUntilExist(page, '宿主頁掛載', () => {
        let btn = document.querySelector('#btnToggle')
        return !!btn && /編輯器$/.test(btn.textContent.trim())
    }, { timeout })
}


//waitMounted, 編輯器已掛載但仍在載入(載入圖示顯示中)
async function waitMounted(page, timeout = 15000) {
    await waitUntilExist(page, '編輯器掛載且載入中', () => {
        let fix = document.querySelector('.WVditorFix')
        return !!fix && (fix.getAttribute('style') || '').includes('max-height')
    }, { timeout })
}


//loadingState, 觀察第一個編輯器之載入狀態: 載入圖示是否可見、編輯器是否仍被遮擋(max-height:0)
async function loadingState(page) {
    return page.evaluate(() => {
        let fix = document.querySelector('.WVditorFix')
        let icon = document.querySelector('[cmp="loading"]')
        return {
            exists: !!fix,
            hidden: !!fix && (fix.getAttribute('style') || '').includes('max-height'),
            iconVisible: !!icon && icon.offsetParent !== null,
        }
    })
}


//waitUndo, 等第i個編輯器之「復原」成為停用(disabled=true)或可用
async function waitUndo(page, disabled, opt = {}) {
    let { timeout = 5000, i = 0 } = opt
    await waitUntilExist(page, `「復原」${disabled ? '停用' : '可用'}`, ([d, idx]) => {
        let fix = document.querySelectorAll('.WVditorFix')[idx]
        let b = fix ? fix.querySelector('.vditor-toolbar button[data-type="undo"]') : null
        return !!b && b.classList.contains('vditor-menu--disabled') === d
    }, { timeout, arg: [disabled, i] })
}


//waitEditable, 等第i個編輯器之可見編輯區成為可編輯(editable=true)或不可編輯
async function waitEditable(page, editable, opt = {}) {
    let { timeout = 5000, i = 0 } = opt
    await waitUntilExist(page, `編輯區${editable ? '可編輯' : '不可編輯'}`, ([e, idx]) => {
        let fix = document.querySelectorAll('.WVditorFix')[idx]
        let ed = fix ? [...fix.querySelectorAll('.vditor-reset[contenteditable]')].find((x) => x.offsetParent !== null) : null
        return !!ed && ed.getAttribute('contenteditable') === (e ? 'true' : 'false')
    }, { timeout, arg: [editable, i] })
}


//waitFocusLeft, 等焦點離開第一個編輯器之可見編輯區
async function waitFocusLeft(page, timeout = 3000) {
    await waitUntilExist(page, '焦點離開編輯區', () => {
        let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
        return !ed || !ed.contains(document.activeElement)
    }, { timeout })
}


//states, 觀察各編輯器: 可見編輯區之文字(空白正規化)、復原鈕與粗體鈕是否停用、編輯區之contenteditable
async function states(page) {
    return page.evaluate(() => {
        return [...document.querySelectorAll('.WVditorFix')].map((fix) => {
            let ed = [...fix.querySelectorAll('.vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null) || null
            let undo = fix.querySelector('.vditor-toolbar button[data-type="undo"]')
            let bold = fix.querySelector('.vditor-toolbar button[data-type="bold"]')
            return {
                text: ed ? ed.innerText.trim().replace(/\s+/g, ' ') : null,
                undoDisabled: undo ? undo.classList.contains('vditor-menu--disabled') : null,
                boldDisabled: bold ? bold.classList.contains('vditor-menu--disabled') : null,
                editable: ed ? ed.getAttribute('contenteditable') : null,
            }
        })
    })
}


//sampleStates, 每interval毫秒觀察一次各編輯器之第一個(states之第1筆), 共n次, 回傳序列(觀察用)
async function sampleStates(page, n = 40, interval = 50) {
    let samples = []
    for (let k = 0; k < n; k++) {
        let [s] = await states(page)
        samples.push(s)
        await page.waitForTimeout(interval) //觀察間隔
    }
    return samples
}


//exportMenuItems, 第一個編輯器工具列「匯出」所展開選單中可見項目之文字(觀察用)
async function exportMenuItems(page) {
    return page.evaluate(() => {
        let btn = document.querySelector('.WVditorFix .vditor-toolbar button[data-type="export"]')
        let item = btn ? btn.parentElement : null
        if (!item) {
            return null
        }
        return [...item.querySelectorAll('button[data-type]')].filter((b) => b !== btn && b.offsetParent !== null).map((b) => b.innerText.trim())
    })
}


//editorScrollTop, 第一個編輯器可見編輯區之捲動位置(觀察用)
async function editorScrollTop(page) {
    return page.evaluate(() => {
        let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
        return ed ? ed.scrollTop : null
    })
}


//rawText, 觀察第i個編輯器可見編輯區之原始文字(不正規化空白), 供檢查開頭空白
async function rawText(page, i = 0) {
    return page.evaluate((idx) => {
        let fix = document.querySelectorAll('.WVditorFix')[idx]
        let ed = fix ? [...fix.querySelectorAll('.vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null) : null
        return ed ? ed.innerText : null
    }, i)
}


//hostInfo, 觀察宿主頁: 元件回傳之內容序列、頁面持有之內容(#mdout)、錯誤、回呼紀錄、儲存狀態與最近按鍵
async function hostInfo(page) {
    return page.evaluate(() => {
        return {
            inputs: window.__inputs.slice(),
            errs: window.__errs.slice(),
            after: window.__after.slice(),
            fl: window.__fl.slice(),
            cb: window.__cb.slice(),
            docKeys: window.__docKeys.slice(),
            mdout: document.querySelector('#mdout').textContent,
            status: document.querySelector('#hostStatus').textContent.trim(),
            lastKey: document.querySelector('#hostLastKey').textContent.trim(),
            existedAtClose: window.__existedAtClose,
            loadingAtClose: window.__loadingAtClose,
            loadingAtData: window.__loadingAtData,
            loadingAtPerm: window.__loadingAtPerm,
        }
    })
}


//globalListeners, window、document、visualViewport上各事件型別之監聽數(CDP), 供驗證關閉後無殘留;
//Playwright首次於頁面主環境執行偵測等待(waitForFunction, 即waitUntilExist)時會於window注入一組命中檢查監聽(mousemove、click、pointerdown等與__playwright_global_listeners_check__, 點擊不會),
//故對照頁須先以waitHostMounted偵測掛載再量, 使兩頁同樣含有該組監聽; 不以事件型別排除(與元件之mouse類監聽同型別)
async function globalListeners(page) {
    let client = await page.context().newCDPSession(page)
    let r = {}
    for (let k of ['window', 'document', 'window.visualViewport']) {
        let { result } = await client.send('Runtime.evaluate', { expression: k })
        let m = {}
        if (result.objectId) {
            let { listeners } = await client.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
            for (let l of listeners) {
                m[l.type] = (m[l.type] || 0) + 1
            }
        }
        r[k] = m
    }
    await client.detach()
    return r
}


//waitAsset, 等openCase之assets出現指定紀錄(例如'lute:request')達count次, 於測試行程端輪詢
async function waitAsset(assets, key, count = 1, timeout = 15000) {
    await pollUntil(`資源紀錄${key}達${count}次`, () => assets.filter((a) => a === key).length >= count, { timeout, interval: 50 })
}


//editor, 第i個編輯器之可見編輯區
function editor(page, i = 0) {
    return page.locator('.WVditorFix').nth(i).locator('.vditor-reset[contenteditable]:visible').first()
}


//toolbarButton, 第i個編輯器之工具列按鈕(type為vditor之data-type)
function toolbarButton(page, type, i = 0) {
    return page.locator('.WVditorFix').nth(i).locator(`.vditor-toolbar button[data-type="${type}"]`)
}


//hostButton, 宿主頁之按鈕(以按鈕文字定位)
function hostButton(page, name) {
    return page.getByRole('button', { name, exact: true })
}


//hintItem, 提示區中宿主頁提供之項目(「插入XYZ」按鈕)
function hintItem(page) {
    return page.getByRole('button', { name: '插入XYZ', exact: true })
}


//clickEnd, 點擊編輯區並以Ctrl+End將游標移至文件末
async function clickEnd(page, i = 0) {
    await editor(page, i).click()
    await page.keyboard.press('Control+End')
}


//typeAtEnd, 點擊編輯區、游標移至文件末後以真鍵盤輸入; delay為每鍵間隔(預設0)
async function typeAtEnd(page, txt, opt = {}) {
    let { i = 0, delay = 0 } = opt
    await clickEnd(page, i)
    await page.keyboard.type(txt, { delay })
}


//waitInputs, 等元件回傳之內容序列滿足條件後回傳宿主頁觀察; cond可含count(筆數至少)、lastEndsWith(最後一筆去除結尾空白後之結尾)、lastIncludes(最後一筆包含)、lastMatches(最後一筆符合之正規式字串)
async function waitInputs(page, label, cond, opt = {}) {
    let { timeout = 10000 } = opt
    await waitUntilExist(page, label, (c) => {
        let a = window.__inputs
        if ('count' in c && a.length < c.count) {
            return false
        }
        let v = a.length > 0 ? a[a.length - 1] : null
        if ('lastEndsWith' in c && (v === null || !v.trimEnd().endsWith(c.lastEndsWith))) {
            return false
        }
        if ('lastIncludes' in c && (v === null || !v.includes(c.lastIncludes))) {
            return false
        }
        if ('lastMatches' in c && (v === null || !new RegExp(c.lastMatches).test(v))) {
            return false
        }
        return true
    }, { timeout, arg: cond })
    return hostInfo(page)
}


//waitText, 等第i個編輯器之可見文字(空白正規化)滿足條件; cond可含equals、endsWith、includes、excludes
async function waitText(page, label, cond, opt = {}) {
    let { timeout = 10000, i = 0 } = opt
    await waitUntilExist(page, label, ([c, idx]) => {
        let fix = document.querySelectorAll('.WVditorFix')[idx]
        let ed = fix ? [...fix.querySelectorAll('.vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null) : null
        if (!ed) {
            return false
        }
        let t = ed.innerText.trim().replace(/\s+/g, ' ')
        if ('equals' in c && t !== c.equals) {
            return false
        }
        if ('endsWith' in c && !t.endsWith(c.endsWith)) {
            return false
        }
        if ('includes' in c && !t.includes(c.includes)) {
            return false
        }
        if ('excludes' in c && t.includes(c.excludes)) {
            return false
        }
        return true
    }, { timeout, arg: [cond, i] })
}


//waitMdout, 等頁面持有之內容(#mdout)滿足條件; cond可含equals、includes
async function waitMdout(page, label, cond, opt = {}) {
    let { timeout = 10000 } = opt
    await waitUntilExist(page, label, (c) => {
        let t = document.querySelector('#mdout').textContent
        if ('equals' in c && t !== c.equals) {
            return false
        }
        if ('includes' in c && !t.includes(c.includes)) {
            return false
        }
        return true
    }, { timeout, arg: cond })
}


//waitMdoutSynced, 等頁面持有之內容與元件最後回傳一致(忽略結尾空白), 供頁面延後回寫時等待
async function waitMdoutSynced(page, timeout = 10000) {
    await waitUntilExist(page, '頁面持有之內容與最後回傳一致', () => {
        let a = window.__inputs
        return a.length > 0 && document.querySelector('#mdout').textContent.trimEnd() === a[a.length - 1].trimEnd()
    }, { timeout })
}


//waitStatus, 等宿主頁之儲存狀態文字為指定值
async function waitStatus(page, status, timeout = 10000) {
    await waitUntilExist(page, `儲存狀態「${status}」`, (s) => {
        return document.querySelector('#hostStatus').textContent.trim() === s
    }, { timeout, arg: status })
}


//focusInEditor, 焦點是否位於第一個編輯器之可見編輯區內(含編輯區本身)
async function focusInEditor(page) {
    return page.evaluate(() => {
        let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
        return !!ed && ed.contains(document.activeElement)
    })
}


//focusOnEditorItself, 焦點是否位於第一個編輯器之可見編輯區本身
async function focusOnEditorItself(page) {
    return page.evaluate(() => {
        let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
        return !!ed && document.activeElement === ed
    })
}


//activeInfo, 焦點元素之tagName與id
async function activeInfo(page) {
    return page.evaluate(() => {
        let ae = document.activeElement
        return {
            tag: ae ? ae.tagName : null,
            id: ae ? ae.id : null,
        }
    })
}


//tabUntil, 點擊宿主頁之搜尋框後連按Tab, 直到check(page)為真(最多max次), 回傳是否到達
async function tabUntil(page, check, max = 80) {
    await page.getByRole('textbox', { name: '搜尋' }).click()
    for (let k = 0; k < max; k++) {
        await page.keyboard.press('Tab')
        if (await check(page)) {
            return true
        }
    }
    return false
}


//startSampler, 每20ms記錄第i個編輯器可見文字(空白正規化), 供檢查輸入過程有無重載或錯位(觀察用)
async function startSampler(page, i = 0) {
    await page.evaluate((idx) => {
        window.__samples = []
        window.__samplerTimer = setInterval(() => {
            let fix = document.querySelectorAll('.WVditorFix')[idx]
            let ed = fix ? [...fix.querySelectorAll('.vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null) : null
            if (ed) {
                window.__samples.push(ed.innerText.trim().replace(/\s+/g, ' '))
            }
        }, 20)
    }, i)
}


async function stopSampler(page) {
    return page.evaluate(() => {
        clearInterval(window.__samplerTimer)
        return window.__samples
    })
}


//checkTypingSamples, 檢查取樣序列: 每筆皆以輸入前文字base開頭(開頭未被插入), 其後為typed之前綴(可含模式造成之前導空白), 且已輸入字數不減少(無重載退回)
function checkTypingSamples(samples, base, typed) {
    let nLast = 0
    for (let s of samples) {
        if (!s.startsWith(base)) {
            return `開頭被改動: ${s}`
        }
        let rest = s.slice(base.length).trimStart()
        if (!typed.startsWith(rest)) {
            return `出現非輸入之內容: ${s}`
        }
        if (rest.length < nLast) {
            return `已輸入之內容消失(重載): ${s}`
        }
        nLast = rest.length
    }
    return ''
}


//endsAfter, 取base之後之文字(去除前導空白), 供比對接於末尾之輸入
function endsAfter(text, base) {
    return text.startsWith(base) ? text.slice(base.length).trimStart() : null
}


//runCase, 執行案例; 走到spec〈已知落差〉登錄之產品缺陷徵狀(knownDefect)時標為pending, 其餘錯誤照常失敗
async function runCase(ctx, fn) {
    try {
        await fn()
    }
    catch (err) {
        if (err && err.knownDefect) {
            console.log(`      pending: ${err.message}`)
            ctx.skip()
        }
        throw err
    }
}


export {
    projRoot,
    FLOW_PORTS,
    MODES,
    MODE_NAMES,
    DOCS,
    keyModeSwitch,
    keysRo,
    sleep,
    visText,
    launchBrowser,
    createFlow,
    waitReady,
    waitHostMounted,
    waitMounted,
    loadingState,
    waitUndo,
    waitEditable,
    waitFocusLeft,
    states,
    sampleStates,
    exportMenuItems,
    editorScrollTop,
    rawText,
    hostInfo,
    globalListeners,
    waitAsset,
    editor,
    toolbarButton,
    hostButton,
    hintItem,
    clickEnd,
    typeAtEnd,
    waitInputs,
    waitText,
    waitMdout,
    waitMdoutSynced,
    waitStatus,
    focusInEditor,
    focusOnEditorItself,
    activeInfo,
    tabUntil,
    startSampler,
    stopSampler,
    checkTypingSamples,
    endsAfter,
    createKnownDefect,
    runCase
}
