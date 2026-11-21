//vv585 probe2: 純HTML對照(無vditor、無元件): 長文本唯讀/可編輯textarea、插入點在文末或開頭, Tab進入後按PageDown之行為; 以REV選瀏覽器修訂
import os from 'os'
import path from 'path'
import { launchBrowser } from '../../test/tools/e2eLib.mjs'

let REV = process.env.REV || '1255'
let exe = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright', `chromium_headless_shell-${REV}`, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')

let lines = []
for (let i = 0; i < 60; i++) {
    lines.push(`第${i}行內容${'x'.repeat(i % 7)}`)
}
let text = lines.join('\n')

let html = `<!doctype html><html><body style="margin:0">
<div style="height:400px">上方佔位<input id="a" value="搜尋"></div>
<textarea id="ta" style="width:600px;height:260px;overflow:auto;line-height:22px;font-size:14px"></textarea>
<div style="height:1500px">下方佔位<input id="b"></div>
<script>
document.getElementById('ta').value = ${JSON.stringify(text)}
</script>
</body></html>`

let measure = (page) => page.evaluate(() => {
    let ed = document.getElementById('ta')
    return { active: document.activeElement === ed, scrollTop: ed.scrollTop, max: ed.scrollHeight - ed.clientHeight, sel: ed.selectionStart, winY: window.scrollY }
})

let main = async () => {
    let browser = await launchBrowser({ executablePath: exe })
    let out = { REV, version: browser.version(), cases: [] }
    try {
        for (let c of [
            { name: 'readonly-caretEnd', ro: true, caret: 'end' },
            { name: 'readonly-caretStart', ro: true, caret: 'start' },
            { name: 'editable-caretEnd', ro: false, caret: 'end' },
            { name: 'readonly-caretEnd-scrolled0', ro: true, caret: 'end', top: 0 },
        ]) {
            let ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
            let page = await ctx.newPage()
            await page.setContent(html)
            await page.evaluate((c) => {
                let ed = document.getElementById('ta')
                ed.readOnly = c.ro
                if (c.caret === 'start') {
                    ed.setSelectionRange(0, 0)
                }
                else {
                    ed.setSelectionRange(ed.value.length, ed.value.length)
                }
                if (c.top !== undefined) {
                    ed.scrollTop = c.top
                }
                else if (c.caret === 'start') {
                    ed.scrollTop = 0
                }
            }, c)
            await page.click('#a')
            await page.keyboard.press('Tab')
            let r = { name: c.name, afterTab: await measure(page), keys: [] }
            for (let k of ['PageDown', 'PageDown', 'PageUp']) {
                let b = await measure(page)
                await page.keyboard.press(k)
                await page.waitForTimeout(500)
                let a = await measure(page)
                r.keys.push({ k, before: b, after: a })
            }
            out.cases.push(r)
            await ctx.close()
        }
    }
    finally {
        await browser.close()
    }
    console.log('PROBE2 ' + JSON.stringify(out))
}

main().then(() => process.exit(0)).catch((e) => { console.log('PROBE2-ERR', e); process.exit(1) })
