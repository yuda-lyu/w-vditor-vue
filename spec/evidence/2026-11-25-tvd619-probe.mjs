//tvd619 probe: 分割預覽(唯讀, LONG)以Tab進入後, 回到文件開頭(Ctrl+Home)與PageDown之間之時序; 以PROBE_ROOT指向套件根(任一提交之副本皆可, 其node_modules供應相依)
//環境變數: PROBE_ROOT(必), VARIANTS(逗號分隔, 預設A,B), REPS(預設5), MODE(預設sv), LAUNCH_ARGS(空白分隔之瀏覽器啟動旗標)
//變體: A=位置為0即按(舊判準), B/E/F/G=A再等600/100/300/1000ms, C=每次Ctrl+Home後等300ms, H1/H2/H3=每次Ctrl+Home後等捲動位置連續1/2/3幀不變
import path from 'path'
import { pathToFileURL } from 'url'

let root = path.resolve(process.env.PROBE_ROOT)
let setup = await import(pathToFileURL(path.join(root, 'test/tools/e2e-setup.mjs')).href)
let lib = await import(pathToFileURL(path.join(root, 'test/tools/e2eLib.mjs')).href)
let { createFlow, tabUntil, focusOnEditorItself, editorScrollTop, launchBrowser } = setup
let { waitUntilExist } = lib

//homeUntilTop, 舊判準(按後即讀捲動位置是否為0), 內建於探針以不依賴PROBE_ROOT之版本
let homeUntilTop = async (page, max = 5) => {
    for (let k = 0; k < max; k++) {
        await page.keyboard.press('Control+Home')
        if ((await editorScrollTop(page)) === 0) {
            return true
        }
    }
    return false
}

let VARIANTS = (process.env.VARIANTS || 'A,B').split(',')
let REPS = Number(process.env.REPS || 5)
let MODE = process.env.MODE || 'sv'

let snap = (page) => page.evaluate(() => {
    let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable], .WVditorFix textarea.vditor-sv')].find((e) => e.offsetParent !== null)
    return { st: ed.scrollTop, ss: ed.selectionStart }
})

let startSampler = (page) => page.evaluate(() => {
    let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable], .WVditorFix textarea.vditor-sv')].find((e) => e.offsetParent !== null)
    window.__tl = []
    window.__t0 = performance.now()
    window.__marks = []
    let last = ''
    window.__timer = setInterval(() => {
        let k = ed.scrollTop + '/' + ed.selectionStart
        if (k !== last) {
            last = k
            window.__tl.push([Math.round(performance.now() - window.__t0), ed.scrollTop, ed.selectionStart])
        }
    }, 4)
})
let mark = (page, label) => page.evaluate((l) => { window.__marks.push([Math.round(performance.now() - window.__t0), l]) }, label)

let runOne = async (flow, browser, variant) => {
    let { page } = await flow.openReady(browser, { mode: MODE, doc: 'LONG', editable: '0', focusLog: '1' })
    let reached = await tabUntil(page, focusOnEditorItself)
    await startSampler(page)
    let hu = null
    if (variant.startsWith('H')) {
        //每次Ctrl+Home後等「捲動位置連續N幀不變」(N取自變體名H1、H2、H3), 為0即止
        let n = Number(variant.slice(1))
        for (let k = 0; k < 5; k++) {
            await mark(page, 'home')
            await page.keyboard.press('Control+Home')
            let st = await page.evaluate((nn) => new Promise((resolve) => {
                let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable], .WVditorFix textarea.vditor-sv')].find((e) => e.offsetParent !== null)
                let last = ed.scrollTop
                let cnt = 0
                let tick = () => {
                    let cur = ed.scrollTop
                    if (cur === last) {
                        cnt++
                    }
                    else {
                        cnt = 0
                        last = cur
                    }
                    if (cnt >= nn) {
                        resolve(cur)
                    }
                    else {
                        requestAnimationFrame(tick)
                    }
                }
                requestAnimationFrame(tick)
            }), n)
            if (st === 0) {
                hu = k + 1
                break
            }
        }
        await mark(page, 'stableTop')
    }
    else if (variant === 'C') {
        //每次Ctrl+Home後等300ms再看是否到頂(模擬人工逐次按)
        for (let k = 0; k < 5; k++) {
            await mark(page, 'home')
            await page.keyboard.press('Control+Home')
            await page.waitForTimeout(300)
            if ((await editorScrollTop(page)) === 0) {
                hu = k + 1
                break
            }
        }
    }
    else {
        await mark(page, 'homeUntilTop')
        hu = await homeUntilTop(page)
        await mark(page, 'homeUntilTop-end')
        await waitUntilExist(page, '編輯區已回到文件開頭', () => {
            let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable], .WVditorFix textarea.vditor-sv')].find((e) => e.offsetParent !== null)
            return ed.scrollTop === 0
        })
        await mark(page, 'atTop')
        let top0 = await editorScrollTop(page)
        if (top0 !== 0) {
            throw new Error('top0=' + top0)
        }
        let waitMs = { A: 0, B: 600, E: 100, F: 300, G: 1000 }[variant]
        if (waitMs) {
            await page.waitForTimeout(waitMs)
        }
    }
    await mark(page, 'PageDown')
    await page.keyboard.press('PageDown')
    await page.waitForTimeout(1500)
    let fin = await snap(page)
    let tl = await page.evaluate(() => ({ tl: window.__tl, marks: window.__marks, rm: matchMedia('(prefers-reduced-motion: reduce)').matches }))
    await page.context().close()
    return { variant, reached, hu, fin, tl: tl.tl, marks: tl.marks, rm: tl.rm }
}

let flow = createFlow('readonly-focus')
await flow.setup()
let results = []
try {
    for (let rep = 0; rep < REPS; rep++) {
        for (let v of VARIANTS) {
            let la = process.env.LAUNCH_ARGS ? process.env.LAUNCH_ARGS.split(' ') : null
            let browser = await launchBrowser(la ? { args: la } : {})
            try {
                let r = await runOne(flow, browser, v)
                results.push(r)
                console.log('[probe-run]', JSON.stringify({ rep, v, ver: browser.version(), args: la, hu: r.hu, finalSt: r.fin.st, finalSs: r.fin.ss, ok: r.fin.st > 0, rm: r.rm, tlLen: r.tl.length, marks: r.marks }))
            }
            finally {
                await browser.close()
            }
        }
    }
}
finally {
    await flow.teardown()
}
for (let v of VARIANTS) {
    let rs = results.filter((r) => r.variant === v)
    console.log('[probe-sum]', v, 'ok', rs.filter((r) => r.fin.st > 0).length, '/', rs.length)
}
process.exit(0)
