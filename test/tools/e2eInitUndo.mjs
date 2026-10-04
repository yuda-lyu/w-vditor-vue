//e2e-init-undo之共用工具: 編譯元件、靜態站、測試頁、開頁與觀察
//測試中介資料一律落 ./test/_tmp/e2e-init-undo/, 由測試檔after刪除
import fs from 'fs'
import http from 'http'
import path from 'path'
import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'


let fdRoot = path.resolve('./') //專案根目錄, 測試須於專案根執行
let fdTmp = path.resolve('./test/_tmp/e2e-init-undo')
let fdDist = path.join(fdTmp, 'dist')
let fpPage = path.join(fdTmp, 'page.html')
let port = 8136 //固定port, 不隨機
let origin = `http://127.0.0.1:${port}`


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


//以與toolg/gDistRollupComps.mjs相同之設定, 由現行src編譯元件, 不依賴./dist
async function buildComponent() {
    fs.mkdirSync(fdTmp, { recursive: true })
    await rollupFiles({
        fns: 'WVditorVue.vue',
        fdSrc: './src/components/',
        fdTar: fdDist,
        format: 'umd',
        nameDistType: 'kebabCase',
        globals: {
            'vue': 'Vue',
        },
        external: [
            'vue',
        ],
    })
    //rollupFiles內部吞掉錯誤只console.log, 且編譯前會清空輸出資料夾, 故以產物存在判定編譯成功
    let fp = path.join(fdDist, 'w-vditor-vue.umd.js')
    if (!fs.existsSync(fp)) {
        throw new Error(`編譯元件失敗, 找不到${fp}`)
    }
}


//測試頁: 依網址參數組出情境, 只以元件公開介面(props、value與input事件、slot、settings)操作, 以頁面層級之資料變更模擬呼叫端行為
let pageHtml = `<!doctype html>
<html lang="zh-tw">
<head>
    <meta http-equiv="content-type" content="text/html; charset=UTF-8" />
    <title>e2e-init-undo</title>
    <script src="/node_modules/vue/dist/vue.min.js"></script>
    <script src="/test/_tmp/e2e-init-undo/dist/w-vditor-vue.umd.js"></script>
</head>
<body>
    <div id="app">
        <button id="btnToggle" @click="show=!show">toggle</button>
        <w-vditor-vue
            v-if="show"
            :height="300"
            :settings="settings"
            :editable="editable"
            :key-hint="keyHint"
            :hint-time-detect="hintTimeDetect"
            :value="content"
            @input="onInput"
        >
            <template v-slot:content="props">
                <div class="hintBox"><button class="hintItem" @click="props.funInsert('XYZ'); props.funHide();">插入XYZ</button></div>
            </template>
        </w-vditor-vue>
        <pre id="mdout">{{content}}</pre>
        <w-vditor-vue
            v-if="show && instances>=2"
            :height="300"
            :settings="settings"
            v-model="content2"
        ></w-vditor-vue>
        <w-vditor-vue
            v-if="show && shared"
            :height="300"
            :settings="settings"
            :value="content"
            @input="onInput"
        ></w-vditor-vue>
    </div>
    <script>
        window.__errs = []
        window.__inputs = []
        window.__after = []
        Vue.config.errorHandler = function(err, vm, info) {
            window.__errs.push('vue[' + info + ']: ' + (err && err.message))
            console.error(err)
        }
        function isLoading() {
            let fix = document.querySelector('.WVditorFix')
            return !!fix && (fix.getAttribute('style') || '').includes('max-height')
        }
        async function main() {
            let q = new URLSearchParams(location.search)
            let settings = {
                cdn: '/node_modules/vditor',
                lang: 'zh_TW',
            }
            if (q.has('mode')) {
                settings.mode = q.get('mode')
            }
            if (q.get('i18n') === '1') {
                //呼叫端直接給予語系物件(元件說明之內網用法)
                let txt = await (await fetch('/node_modules/vditor/dist/js/i18n/zh_TW.js')).text()
                new Function(txt)()
                settings.i18n = window.VditorI18n
                delete window.VditorI18n
            }
            if (q.get('after') === '1') {
                settings.after = function() {
                    let ed = document.querySelector('.WVditorFix .vditor-reset[contenteditable]')
                    window.__after.push({
                        text: ed ? ed.innerText.trim() : null,
                        editable: ed ? ed.getAttribute('contenteditable') : null,
                        receiverHasMode: !!(this && this.mode),
                    })
                }
            }
            let value = q.has('value') ? q.get('value') : '# 標題\\n\\n第一段內容abc\\n\\n第二段內容xyz\\n'
            if (q.get('valueNull') === '1') {
                value = null
            }
            if (q.get('valueNum') === '1') {
                value = 12345
            }
            //writeMode, 父層回寫方式: sync(等同v-model), micro(微任務後回寫), debounce300(停止回拋300ms後回寫最後之值), trim(修整後回寫), none(單向綁定不回寫)
            let writeMode = q.get('writeMode') || 'sync'
            let tDebounce = null
            Vue.component('w-vditor-vue', window['w-vditor-vue'])
            window.__vm = new Vue({
                el: '#app',
                data: function() {
                    return {
                        show: q.get('hide') !== '1',
                        settings,
                        editable: q.get('editable') !== '0',
                        keyHint: q.get('keyHint') || '',
                        hintTimeDetect: q.has('hintTimeDetect') ? Number(q.get('hintTimeDetect')) : undefined, //未給時用元件預設(100ms)
                        content: value,
                        instances: Number(q.get('instances') || 1),
                        content2: '# 第二個\\n\\n第二個實例之內容\\n',
                        shared: q.get('shared') === '1', //另一實例綁同一value, 由父層單向帶入本組件之回拋值
                    }
                },
                methods: {
                    onInput: function(v) {
                        window.__inputs.push(v)
                        if (writeMode === 'micro') {
                            Promise.resolve().then(() => {
                                this.content = v
                            })
                        }
                        else if (writeMode === 'debounce300') {
                            clearTimeout(tDebounce)
                            tDebounce = setTimeout(() => {
                                this.content = v
                            }, 300)
                        }
                        else if (writeMode === 'trim') {
                            this.content = v.trim()
                        }
                        else if (writeMode === 'none') {
                            //單向綁定, 不回寫
                        }
                        else {
                            this.content = v
                        }
                    },
                },
            })
            if (q.has('changeAt')) {
                setTimeout(function() {
                    window.__loadingAtChange = isLoading()
                    window.__vm.content = q.get('changeTo')
                }, Number(q.get('changeAt')))
            }
            if (q.has('editableAt')) {
                setTimeout(function() {
                    window.__loadingAtEditable = isLoading()
                    window.__vm.editable = q.get('editableTo') === '1'
                }, Number(q.get('editableAt')))
            }
            if (q.has('destroyAt')) {
                setTimeout(function() {
                    window.__existedAtDestroy = !!document.querySelector('.WVditorFix')
                    window.__loadingAtDestroy = isLoading()
                    window.__vm.show = false
                }, Number(q.get('destroyAt')))
            }
        }
        main().catch(function(err) {
            window.__errs.push('main: ' + (err && err.message))
        })
    </script>
</body>
</html>
`


function writePage() {
    fs.mkdirSync(fdTmp, { recursive: true })
    fs.writeFileSync(fpPage, pageHtml, 'utf8')
}


//靜態站: 以專案根為根, 解碼後必做路徑穿越防護
function startServer() {
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
        let fp = path.resolve(fdRoot, '.' + pathname)
        if (!fp.startsWith(fdRoot + path.sep)) {
            res.writeHead(403)
            res.end('forbidden')
            return
        }
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
            res.writeHead(404)
            res.end('not found')
            return
        }
        res.writeHead(200, { 'content-type': kpMime[path.extname(fp)] || 'application/octet-stream', 'cache-control': 'no-store' })
        fs.createReadStream(fp).pipe(res)
    })
    return new Promise((resolve, reject) => {
        server.once('error', (err) => {
            reject(new Error(`無法於127.0.0.1:${port}啟動測試站(${err.code}), 請確認該port未被佔用`))
        })
        server.listen(port, '127.0.0.1', () => {
            resolve(server)
        })
    })
}


function cleanup() {
    fs.rmSync(fdTmp, { recursive: true, force: true })
    //test/_tmp已無其他測試之資料夾時一併移除, 非空時rmdirSync會拋錯而保留
    try {
        fs.rmdirSync(path.dirname(fdTmp))
    }
    catch (err) {}
}


//開頁: 每case全新context; 阻擋並記錄所有非本機請求(測試不得依賴外網); 收集主控台錯誤; delays可延遲或中止lute與語系檔
async function openCase(browser, query = {}, delays = {}) {
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
    if (delays.lute) {
        await page.route('**/dist/js/lute/lute.min.js', async (route) => {
            await sleep(delays.lute)
            await route.continue()
        })
    }
    if (delays.i18n) {
        await page.route('**/dist/js/i18n/*.js', async (route) => {
            await sleep(delays.i18n)
            await route.continue()
        })
    }
    let qs = new URLSearchParams(query).toString()
    await page.goto(`${origin}/test/_tmp/e2e-init-undo/page.html?${qs}`)
    return { context, page, logs, external }
}


//就緒: 元件之載入遮擋(max-height:0)解除且編輯區已出現
async function waitReady(page, timeout = 15000) {
    await page.waitForFunction(() => {
        let fixes = [...document.querySelectorAll('.WVditorFix')]
        if (fixes.length === 0) {
            return false
        }
        return fixes.every((fix) => {
            let loading = (fix.getAttribute('style') || '').includes('max-height')
            let ed = [...fix.querySelectorAll('.vditor-reset[contenteditable]')].find((e) => e.offsetParent !== null)
            return !loading && !!ed
        })
    }, null, { timeout, polling: 20 })
}


//觀察: 各實例可見編輯區之文字、復原鈕是否停用、粗體鈕是否停用、contenteditable
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


async function pageInfo(page) {
    return page.evaluate(() => {
        return {
            inputs: window.__inputs.slice(),
            errs: window.__errs.slice(),
            after: window.__after.slice(),
            mdout: document.querySelector('#mdout').textContent,
            existedAtDestroy: window.__existedAtDestroy,
            loadingAtDestroy: window.__loadingAtDestroy,
            loadingAtChange: window.__loadingAtChange,
            loadingAtEditable: window.__loadingAtEditable,
        }
    })
}


//window之resize與scroll監聽數(CDP), 供驗證銷毀後無殘留
async function windowListeners(page) {
    let client = await page.context().newCDPSession(page)
    let { result } = await client.send('Runtime.evaluate', { expression: 'window' })
    let { listeners } = await client.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
    await client.detach()
    let resize = listeners.filter((l) => l.type === 'resize').length
    let scroll = listeners.filter((l) => l.type === 'scroll').length
    return { resize, scroll }
}


//模擬呼叫端於頁面層級變更value
async function setContent(page, v) {
    await page.evaluate((v) => {
        window.__vm.content = v
    }, v)
}


async function clickUndo(page, i = 0) {
    await page.locator('.WVditorFix').nth(i).locator('.vditor-toolbar button[data-type="undo"]').click({ force: true })
    await sleep(600)
}


async function typeAtEnd(page, txt, i = 0) {
    let ed = page.locator('.WVditorFix').nth(i).locator('.vditor-reset[contenteditable]:visible').first()
    await ed.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(txt)
    await sleep(700)
}


//逐鍵輸入: 每鍵間隔delay(預設150ms, 慢於預設100ms之防抖, 使每鍵皆回拋), 用以產生多筆在途回寫
async function typeSlowAtEnd(page, txt, delay = 150, i = 0) {
    let ed = page.locator('.WVditorFix').nth(i).locator('.vditor-reset[contenteditable]:visible').first()
    await ed.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(txt, { delay })
}


//取樣: 每20ms記錄第i個實例可見編輯區之文字(空白正規化), 供檢查輸入過程有無重載或錯位
async function startSampler(page, i = 0) {
    await page.evaluate((i) => {
        window.__samples = []
        window.__samplerTimer = setInterval(() => {
            let fix = document.querySelectorAll('.WVditorFix')[i]
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


//檢查取樣序列: 每筆皆以輸入前文字base開頭(開頭未被插入), 其後為typed之前綴(可含模式造成之前導空白), 且已輸入字數不減少(無重載退回)
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


export default {
    port,
    sleep,
    buildComponent,
    writePage,
    startServer,
    cleanup,
    openCase,
    waitReady,
    states,
    pageInfo,
    windowListeners,
    setContent,
    clickUndo,
    typeAtEnd,
    typeSlowAtEnd,
    startSampler,
    stopSampler,
    checkTypingSamples,
}
