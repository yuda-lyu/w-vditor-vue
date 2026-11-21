//vv585 probe1: 分割預覽唯讀時以Tab進入編輯區(textarea)後, 各鍵對捲動之影響; 以REV選瀏覽器修訂(1248=156、1255=159)、LANGMODE選語系(default=旗標組之zh-TW、none=不帶--lang、en-US)
import os from 'os'
import path from 'path'
import { createFlow, tabUntil, focusOnEditorItself } from '../../test/tools/e2e-setup.mjs'
import { launchBrowser } from '../../test/tools/e2eLib.mjs'

let REV = process.env.REV || '1255'
let LANGMODE = process.env.LANGMODE || 'default'
let MODE = process.env.MODE || 'sv'
let exe = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright', `chromium_headless_shell-${REV}`, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')

let measure = (page) => page.evaluate(() => {
    let ed = [...document.querySelectorAll('.WVditorFix .vditor-reset[contenteditable], .WVditorFix textarea.vditor-sv')].find((e) => e.offsetParent !== null)
    let ae = document.activeElement
    let r = ed.getBoundingClientRect()
    let cs = getComputedStyle(ed)
    return {
        tag: ed.tagName,
        isActive: ae === ed,
        aeTag: ae ? ae.tagName : null,
        scrollTop: ed.scrollTop,
        scrollHeight: ed.scrollHeight,
        clientHeight: ed.clientHeight,
        selStart: ed.selectionStart,
        selEnd: ed.selectionEnd,
        readOnly: ed.readOnly,
        disabled: ed.disabled,
        winY: window.scrollY,
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        overflowY: cs.overflowY,
        fontFamily: cs.fontFamily,
        lineHeight: cs.lineHeight,
        valueLen: ed.value !== undefined ? ed.value.length : null,
        padB: cs.paddingBottom,
        padT: cs.paddingTop,
        selAnchorInEd: (() => { let s = getSelection(); return s && s.anchorNode ? ed.contains(s.anchorNode) : null })(),
    }
})

let main = async () => {
    let flow = createFlow('readonly-focus')
    await flow.setup()
    let lo = {}
    if (LANGMODE === 'none') {
        lo = { lang: false }
    }
    else if (LANGMODE !== 'default') {
        lo = { lang: LANGMODE }
    }
    let browser = await launchBrowser({ executablePath: exe, ...lo })
    let out = { REV, LANGMODE, MODE, version: browser.version() }
    try {
        let { page } = await flow.openReady(browser, { mode: MODE, doc: 'LONG', editable: '0', focusLog: '1' })
        out.nav = await page.evaluate(() => ({ lang: navigator.language, ua: navigator.userAgent }))
        out.initial = await measure(page)
        out.reached = await tabUntil(page, focusOnEditorItself)
        out.afterTab = await measure(page)
        let steps = process.env.STEPS ? process.env.STEPS.split(',') : ['PageDown', 'PageDown', 'ArrowDown', 'End', 'Space', 'wheel']
        out.steps = []
        for (let k of steps) {
            let before = await measure(page)
            if (k === 'wheel') {
                let r = before.rect
                await page.mouse.move(r[0] + 50, r[1] + 50)
                await page.mouse.wheel(0, 200)
            }
            else {
                await page.keyboard.press(k)
            }
            await page.waitForTimeout(700)
            let after = await measure(page)
            out.steps.push({ key: k, scrollTop: [before.scrollTop, after.scrollTop], sel: [before.selStart, after.selStart], winY: [before.winY, after.winY], isActive: after.isActive })
        }
    }
    finally {
        await browser.close()
        await flow.teardown()
    }
    console.log('PROBE ' + JSON.stringify(out, null, 1))
}

main().then(() => process.exit(0)).catch((e) => { console.log('PROBE-ERR', e); process.exit(1) })
