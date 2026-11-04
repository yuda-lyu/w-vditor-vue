//unit-e2ePorts: e2e靜態站自動換埠(規格 dspec/e2e埠與多套件同跑.md E1～E6、E8、§5)之單元測試, 一律使用真實行程與真實監聽
//與環境無關: 基準埠一律動態取得空閒埠(freeBase, 保證P、P+100、P+200空閒), 期望值由其推得; 預約目錄與環境變數以opt.reserve隔離; 不碰真實流程埠(8136～8141), 故可與同一mocha --parallel中並行之e2e檔同跑;
//占用者占不到(EADDRINUSE)視為已被占用, 本機無該位址族(IPv6)之變體改驗「該位址族確實不存在」, 不用skip當常態
import assert from 'assert'
import fs from 'fs'
import http from 'http'
import net from 'net'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { FLOW_PORTS, OTHER_TEST_PORTS, RESERVE_ROOT, reserveFlowPort, isPortAnswering, listenReserved } from './tools/e2ePorts.mjs'
import { createFlow } from './tools/e2e-setup.mjs'
import { createE2ePortClaimer, pidExists } from './tools/e2eLib.mjs'


const testDir = path.dirname(fileURLToPath(import.meta.url))
const toolsDir = path.join(testDir, 'tools')
const fdTmp = path.join(testDir, '_tmp', `unit-e2ePorts-${process.pid}`) //本檔之臨時資料(隔離預約目錄、假dist), 測完即刪
const fpOccupier = path.join(toolsDir, 'e2ePortsOccupier.mjs')
const fpHolder = path.join(toolsDir, 'e2ePortsHolder.mjs')
const fpStaleHolder = path.join(toolsDir, 'e2ePortsStaleHolder.mjs')
const thisFile = path.basename(fileURLToPath(import.meta.url))
//測試夾具: 唯一允許使用child_process與noteOwn之工具檔(見EP-004)
const FIXTURE_SPAWN = ['tools/e2ePortsStaleHolder.mjs']

//占用者可綁定之位址變體: host為e2ePortsOccupier.mjs之第2參數('-'為node預設雙棧::), probe為測試自己探測占用者時連線之位址
const HOSTS = [
    { name: '127.0.0.1', host: '127.0.0.1', probe: '127.0.0.1' },
    { name: '0.0.0.0', host: '0.0.0.0', probe: '127.0.0.1' },
    { name: '::(雙棧預設)', host: '-', probe: '127.0.0.1' },
    { name: '::1', host: '::1', probe: '::1' },
]

let started = [] //本檔啟動之行程(占用者、另一預約行程), after時確保結束
let regSeq = 0


//newRegDir, 本檔專用之隔離預約目錄(每次一個新的)
function newRegDir() {
    let fd = path.join(fdTmp, `reg-${++regSeq}`)
    fs.mkdirSync(fd, { recursive: true })
    return fd
}


//bindFree, host:port是否可綁定; 該位址族不存在(EAFNOSUPPORT、EADDRNOTAVAIL)視為可綁(此機器上不會有占用者)
function bindFree(port, host) {
    return new Promise((resolve) => {
        let s = net.createServer()
        s.once('error', (err) => resolve(['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(err.code)))
        s.listen(port, host, () => s.close(() => resolve(true)))
    })
}


async function allFree(port) {
    for (let host of ['127.0.0.1', '0.0.0.0', '::', '::1']) {
        if (!(await bindFree(port, host))) {
            return false
        }
    }
    return true
}


//osPort, 向作業系統要一個目前空閒之埠
function osPort() {
    return new Promise((resolve, reject) => {
        let s = net.createServer()
        s.once('error', reject)
        s.listen(0, '127.0.0.1', () => {
            let p = s.address().port
            s.close(() => resolve(p))
        })
    })
}


//freeBase, 取得基準埠P, 保證P、P+100、P+200目前在四種位址皆空閒(動態, 不寫死)
//作業系統配發之埠落在Windows暫時埠範圍(49152～65535, 並行中之瀏覽器行程持續消耗, 且逐次遞增可能逼近65535而放不下P+200),
//故以配發值折回20000～45000區間(遠離暫時埠範圍)作候選, 仍以實際綁定驗證三個埠空閒
async function freeBase() {
    for (let i = 0; i < 60; i++) {
        let p = 20000 + ((await osPort()) % 25000)
        if ((await allFree(p)) && (await allFree(p + 100)) && (await allFree(p + 200))) {
            return p
        }
    }
    throw new Error('找不到可用之測試基準埠')
}


//httpGet, 對host:port發一個新連線之GET(agent:false, 免keep-alive重用舊連線而看不出新連線被誰接走); probe=true帶x-e2e-probe標頭使占用者不計次
function httpGet(host, port, pathname, probe = false) {
    return new Promise((resolve) => {
        let headers = { connection: 'close' }
        if (probe) {
            headers['x-e2e-probe'] = '1'
        }
        let req = http.get({ host, port, path: pathname, headers, timeout: 3000, agent: false }, (res) => {
            let body = ''
            res.on('data', (d) => (body += d))
            res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body }))
        })
        req.on('error', () => resolve(null))
        req.on('timeout', () => {
            req.destroy()
            resolve(null)
        })
    })
}


//readLine, 讀子行程stdout之第一行
function readLine(stream) {
    return new Promise((resolve, reject) => {
        let buf = ''
        let onData = (d) => {
            buf += d
            let k = buf.indexOf('\n')
            if (k >= 0) {
                stream.off('data', onData)
                resolve(buf.slice(0, k).trim())
            }
        }
        stream.on('data', onData)
        stream.once('end', () => reject(new Error(`子行程輸出結束前未見一行: ${buf}`)))
    })
}


//waitFor, 於測試行程端輪詢條件成立(偵測式等待), 逾時拋錯
async function waitFor(label, cond, timeout = 30000) {
    let t0 = Date.now()
    while (!cond()) {
        if (Date.now() - t0 > timeout) {
            throw new Error(`逾時未見: ${label}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
}


//terminateOwn, 終止本檔自己建立之行程(僅用於EP-015自己經夾具啟動之誘餌行程, pid由夾具回報且剛驗證存活)
function terminateOwn(pid) {
    try {
        process.kill(pid)
    }
    catch (err) {}
}


//forceKillChild, 強制終止本檔自己啟動之子行程(持有child物件, 無PID回收問題); EP-015用以模擬持有者被taskkill /F
function forceKillChild(child) {
    child.kill()
}


//stopChild, 關閉子行程stdin使其自行結束並等待; 逾時才終止(只終止本檔自己啟動者)
async function stopChild(child) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return
    }
    let exited = new Promise((resolve) => child.once('exit', resolve))
    try {
        child.stdin.end()
    }
    catch (err) {}
    let t = setTimeout(() => forceKillChild(child), 8000)
    await exited
    clearTimeout(t)
}


//startOccupier, 起一個真實占用者行程占住port; 回傳null=本機無該位址族; own=false=占不到(已被他人占用, 視為已占); stat()回傳{pid,hits}(探測不計次)
async function startOccupier(port, h) {
    let child = spawn(process.execPath, [fpOccupier, String(port), h.host], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
    started.push(child)
    let msg = JSON.parse(await readLine(child.stdout))
    if (msg.error) {
        await stopChild(child)
        if (['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(msg.error)) {
            return null
        }
        if (msg.error === 'EADDRINUSE') {
            return { own: false, pid: null, alive: () => true, stat: async () => httpGet(h.probe, port, '/__stat', true), stop: async () => {} }
        }
        throw new Error(`占用者啟動失敗: ${msg.error}`)
    }
    return {
        own: true,
        pid: msg.pid,
        alive: () => child.exitCode === null && child.signalCode === null,
        stat: async () => {
            let r = await httpGet(h.probe, port, '/__stat', true)
            return r ? JSON.parse(r.body) : null
        },
        stop: () => stopChild(child),
    }
}


//assertOccupierUntouched, 占用者(自己啟動者)仍在、PID不變、仍回應、被測碼打到0次
async function assertOccupierUntouched(occ, label) {
    if (!occ.own) {
        return
    }
    assert.ok(occ.alive(), `${label}: 占用者行程已結束(被殺?)`)
    let s = await occ.stat()
    assert.ok(s, `${label}: 占用者不再回應`)
    assert.strictEqual(s.pid, occ.pid, `${label}: 占用者PID改變`)
    assert.strictEqual(s.hits, 0, `${label}: 占用者被被測碼打到${s.hits}次`)
}


//absentFamily, 該位址族確實不可用(startOccupier回null時驗證, 不以此當作略過之藉口)
async function absentFamily(h) {
    return new Promise((resolve) => {
        let s = net.createServer()
        s.once('error', (err) => resolve(['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(err.code)))
        s.listen(0, h.host === '-' ? '::' : h.host, () => s.close(() => resolve(false)))
    })
}


//stripComments, 去除行註解(`//`前為行首或空白者, 免誤傷'http://'), 供原始碼掃描
function stripComments(src) {
    return src.replace(/(^|\s)\/\/.*$/gm, '$1')
}


//readSources, 讀test/*.mjs與test/tools/*.mjs之原始碼(去註解): { 相對路徑: 內容 }
function readSources() {
    let out = {}
    for (let [dir, rel] of [[testDir, ''], [toolsDir, 'tools/']]) {
        for (let f of fs.readdirSync(dir)) {
            if (f.endsWith('.mjs')) {
                out[`${rel}${f}`] = stripComments(fs.readFileSync(path.join(dir, f), 'utf8'))
            }
        }
    }
    return out
}


describe('unit-e2ePorts：e2e靜態站自動換埠', function() {

    this.timeout(180000) //含查占用者(PowerShell)與多個行程之啟停, 單獨執行不帶--timeout時亦足夠

    before(function() {
        fs.mkdirSync(fdTmp, { recursive: true })
    })

    after(async function() {
        for (let child of started) {
            await stopChild(child)
        }
        fs.rmSync(fdTmp, { recursive: true, force: true })
        try {
            fs.rmdirSync(path.join(testDir, '_tmp'))
        }
        catch (err) {}
    })

    //E1: 基準埠寫死且≥8000, 單一定義
    it('EP-001 基準埠表: 與e2e檔一一對應, 皆≥8000且互異, 間距小於位移間距(換埠後不會落在其他流程之基準埠上)', function() {
        let codes = fs.readdirSync(testDir).map((f) => /^e2e-(.+)\.test\.mjs$/.exec(f)).filter(Boolean).map((m) => m[1]).sort()
        assert.deepStrictEqual(Object.keys(FLOW_PORTS).sort(), codes, 'FLOW_PORTS之流程代號須與test/e2e-*.test.mjs一一對應')
        for (let code of codes) {
            let src = fs.readFileSync(path.join(testDir, `e2e-${code}.test.mjs`), 'utf8')
            assert.ok(src.includes(`createFlow('${code}')`), `e2e-${code}.test.mjs須以createFlow('${code}')建立流程`)
        }
        let ports = Object.values(FLOW_PORTS)
        assert.ok(ports.every((p) => Number.isInteger(p) && p >= 8000 && p <= 65535), '基準埠須為≥8000之整數')
        assert.strictEqual(new Set(ports).size, ports.length, '基準埠須互異')
        assert.ok(Math.max(...ports) - Math.min(...ports) < 100, '基準埠之最大差須小於位移間距100')
    })

    //E1、§5-1: 實際埠一律由共用函式解析; 測試碼無寫死之網址或埠
    it('EP-002 靜態守護: 無寫死之主機:埠, 基準埠字面只在e2ePorts.mjs, 綁定只經listenReserved', function() {
        let src = readSources()
        let bases = new RegExp(`\\b(${Object.values(FLOW_PORTS).join('|')})\\b`)
        for (let [f, code] of Object.entries(src)) {
            if (f === thisFile) {
                continue
            }
            assert.ok(!/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):\d/.test(code), `${f}: 可執行碼含寫死之主機:埠, 須由reservation.portOf衍生`)
            if (f !== 'tools/e2ePorts.mjs') {
                assert.ok(!bases.test(code), `${f}: 含基準埠字面, 基準埠只可定義於tools/e2ePorts.mjs`)
            }
            if (!['tools/e2ePorts.mjs', 'tools/e2ePortsOccupier.mjs'].includes(f)) {
                assert.ok(!/\.listen\(/.test(code), `${f}: 不得直接listen, 須經listenReserved(預約埠, 遇占用換埠)`)
            }
        }
        assert.ok(/listenReserved\(/.test(src['tools/e2e-setup.mjs']) && /reserveFlowPort\(/.test(src['tools/e2e-setup.mjs']), 'e2e-setup.mjs須以reserveFlowPort預約並以listenReserved綁定')
    })

    //E8: 非e2e靜態站之固定埠須列入avoid; 清單與實際寫死之埠一致
    it('EP-003 OTHER_TEST_PORTS: 等於test/與test/tools/內其他寫死之埠(實查為空)', function() {
        let src = readSources()
        let found = new Set()
        for (let [f, code] of Object.entries(src)) {
            if (['tools/e2ePorts.mjs', 'tools/e2ePortsOccupier.mjs', 'tools/e2ePortsHolder.mjs', ...FIXTURE_SPAWN, thisFile].includes(f)) {
                continue
            }
            for (let m of code.matchAll(/\blisten\(\s*(\d{4,5})\b/g)) {
                found.add(Number(m[1]))
            }
            //名稱含port(不分大小寫, 含basePort、serverPort、HTTP_PORT等)而被指派4～5位數字面者
            for (let m of code.matchAll(/[A-Za-z_]*port[A-Za-z_]*\s*[:=]\s*(\d{4,5})\b/gi)) {
                found.add(Number(m[1]))
            }
        }
        assert.deepStrictEqual([...found].sort(), [...OTHER_TEST_PORTS].sort(), '其他測試寫死之埠須全數列入OTHER_TEST_PORTS(或清單多列了不存在者)')
    })

    //E4: 絕不殺占用者; 本套件無任何依埠、依名稱、依命令列下殺之原語, 也不記錄可供函式庫下殺之身分
    it('EP-004 下殺守護: test/與test/tools/無任何下殺原語、不引入child_process、不呼叫noteOwn(函式庫之殘留下殺只依noteOwn記下之身分); 本檔與夾具之例外受限', function() {
        let src = readSources()
        let kill = /taskkill|Stop-Process|process\.kill|\.kill\(|\.Kill\(|Terminate|wmic|netstat|pkill|killall|killPortListeners|killOwnListeners|killOwnTree|\breapShardProcesses\s*\(|\bnoteOwn\b|\bexec(?:File)?(?:Sync)?\(|\bspawnSync\b|Invoke-CimMethod/
        for (let [f, code] of Object.entries(src)) {
            if (f === thisFile || FIXTURE_SPAWN.includes(f)) {
                continue
            }
            assert.ok(!kill.test(code), `${f}: 含下殺原語或noteOwn, 須只動本實例且經確認身分`)
            assert.ok(!/child_process/.test(code), `${f}: 不得引入child_process(行程之啟動與終止只限本檔與測試夾具)`)
        }
        //本檔: 只能終止自己啟動之行程, kill呼叫恰2處(forceKillChild之child.kill、terminateOwn之process.kill), 增減須回頭審視
        let me = src[thisFile]
        assert.strictEqual((me.match(/\.kill\(/g) || []).length, 2, '本檔之kill呼叫須恰2處: forceKillChild與terminateOwn')
        //夾具: 唯一使用noteOwn與child_process者, 只可被本檔引用
        for (let f of FIXTURE_SPAWN) {
            let name = path.basename(f)
            for (let [g, code] of Object.entries(src)) {
                if (g !== f && g !== thisFile) {
                    assert.ok(!code.includes(name), `${g}: 不得引用測試夾具${name}`)
                }
            }
        }
    })

    //E1、E6: 沒有占用時即基準埠, 不寫環境變數, 輸出印實際埠
    it('EP-005 沒有占用: 即基準埠、未位移、不寫環境變數、輸出印基準埠', async function() {
        let P = await freeBase()
        let env = {}
        let logs = []
        let r = reserveFlowPort('probe', { basePort: P, reserve: { regDir: newRegDir(), env, log: (s) => logs.push(s) } })
        try {
            assert.strictEqual(r.portOf(P), P)
            assert.strictEqual(r.shifted, false)
            assert.strictEqual(r.offset, 0)
            assert.ok(logs.some((s) => s.includes('[e2e-port]') && s.includes(String(P))), `輸出須印實際埠: ${logs.join(' | ')}`)
            assert.deepStrictEqual(env, {}, 'applyEnv:false不得寫入(注入之)環境變數物件')
        }
        finally {
            r.release()
        }
        //不注入env(正式路徑): 不得改動本行程之E2E_PORT_OFFSET／E2E_PORT_HOLD(期望埠與當下環境變數有關, 此處只驗環境變數未被寫入)
        let before = JSON.stringify([process.env.E2E_PORT_OFFSET, process.env.E2E_PORT_HOLD])
        let r2 = reserveFlowPort('probe', { basePort: P, reserve: { regDir: newRegDir(), log: () => {} } })
        try {
            assert.strictEqual(JSON.stringify([process.env.E2E_PORT_OFFSET, process.env.E2E_PORT_HOLD]), before, '正式路徑不得寫入E2E_PORT_OFFSET／E2E_PORT_HOLD')
        }
        finally {
            r2.release()
        }
    })

    //E2、E4、E6: 基準埠被占用且不是本實例 → 自動換埠, 占用者不動(真實行程, 四種位址)
    for (let h of HOSTS) {
        it(`EP-006 [占用者綁${h.name}] 基準埠被占用: 換至下一個位移, 占用者PID不變、仍回應、被測碼打到0次`, async function() {
            let P = await freeBase()
            let occ = await startOccupier(P, h)
            if (!occ) {
                assert.ok(await absentFamily(h), `${h.name}無法占用, 但此位址族並非不存在`)
                return
            }
            let logs = []
            let r = reserveFlowPort('probe', { basePort: P, reserve: { regDir: newRegDir(), env: {}, log: (s) => logs.push(s) } })
            try {
                assert.strictEqual(r.portOf(P), P + 100, '期望動態算出: P空閒之保證下, 被占時為下一個位移P+100')
                assert.strictEqual(r.shifted, true)
                assert.ok(logs.some((s) => s.includes('[e2e-port]') && s.includes(String(P)) && s.includes(String(P + 100))), `輸出須印基準埠與實際埠: ${logs.join(' | ')}`)
                await assertOccupierUntouched(occ, h.name)
            }
            finally {
                r.release()
                await occ.stop()
            }
        })
    }

    //E3: 多個連續位移皆被占用 → 繼續往後
    it('EP-007 P與P+100皆被占用: 換至P+200', async function() {
        let P = await freeBase()
        let h = HOSTS[2]
        let o1 = await startOccupier(P, h)
        let o2 = await startOccupier(P + 100, h)
        let r = reserveFlowPort('probe', { basePort: P, reserve: { regDir: newRegDir(), env: {}, log: () => {} } })
        try {
            assert.strictEqual(r.portOf(P), P + 200)
            await assertOccupierUntouched(o1, 'P')
            await assertOccupierUntouched(o2, 'P+100')
        }
        finally {
            r.release()
            await o1.stop()
            await o2.stop()
        }
    })

    //E5: 預約(偵測空閒)之後、綁定之前被占用 → 重選; 先預約、後起占用者即為真實競爭
    it('EP-008a 預約後綁定前被占用(綁127.0.0.1者, 綁定遇真實EADDRINUSE): 重選至P+100, 占用者不動', async function() {
        let P = await freeBase()
        let logs = []
        let r = reserveFlowPort('probe', { basePort: P, reserve: { regDir: newRegDir(), env: {}, log: (s) => logs.push(s) } })
        assert.strictEqual(r.portOf(P), P, '前提: 預約當下P空閒')
        let occ = await startOccupier(P, HOSTS[0]) //預約之後才占用
        let got = null
        try {
            //answering固定回false, 使本案確實走到listen遇EADDRINUSE之路徑(連線檢查路徑由EP-008b驗)
            got = await listenReserved(r, P, () => http.createServer((req, res) => res.end('OURS')), { answering: async () => false, log: (s) => logs.push(s) })
            assert.strictEqual(got.port, P + 100)
            assert.ok(logs.some((s) => s.includes('重選') && s.includes('EADDRINUSE')), `須印重選與原因: ${logs.join(' | ')}`)
            assert.strictEqual((await httpGet('127.0.0.1', P + 100, '/x')).body, 'OURS')
            await assertOccupierUntouched(occ, '127.0.0.1')
        }
        finally {
            if (got) {
                await new Promise((resolve) => got.server.close(resolve))
            }
            r.release()
            await occ.stop()
        }
    })

    //E5: Windows下占用者綁萬用位址或IPv6時, 綁127.0.0.1不報EADDRINUSE而與之並存, 須靠綁定前之連線檢查
    for (let h of HOSTS) {
        it(`EP-008b [占用者綁${h.name}] 預約後綁定前被占用: 綁定前連線檢查發現, 重選至P+100, 占用者不動、其新連線不被搶走`, async function() {
            let P = await freeBase()
            let logs = []
            let r = reserveFlowPort('probe', { basePort: P, reserve: { regDir: newRegDir(), env: {}, log: (s) => logs.push(s) } })
            assert.strictEqual(r.portOf(P), P, '前提: 預約當下P空閒')
            let occ = await startOccupier(P, h) //預約之後才占用
            if (!occ) {
                r.release()
                assert.ok(await absentFamily(h), `${h.name}無法占用, 但此位址族並非不存在`)
                return
            }
            let got = null
            try {
                got = await listenReserved(r, P, () => http.createServer((req, res) => res.end('OURS')), { log: (s) => logs.push(s) })
                assert.strictEqual(got.port, P + 100)
                assert.ok(logs.some((s) => s.includes('重選') && s.includes('已有人接聽')), `須印重選與原因: ${logs.join(' | ')}`)
                //占用者之新連線仍由占用者接(不被本測試站搶走)
                let who = await httpGet(h.probe, P, '/who', true)
                assert.ok(who && who.body.includes('"occupier":true'), `埠${P}之新連線被別的服務接走: ${who && who.body}`)
                await assertOccupierUntouched(occ, h.name)
            }
            finally {
                if (got) {
                    await new Promise((resolve) => got.server.close(resolve))
                }
                r.release()
                await occ.stop()
            }
        })
    }

    //E5: 重選上限內仍失敗就停止, 訊息寫明誰占用
    it('EP-009 重選用盡: 拋E2E_PORT_EXHAUSTED且訊息寫明被占用之埠與占用者, 不下殺', async function() {
        let P = await freeBase()
        let r = reserveFlowPort('probe', { basePort: P, reserve: { regDir: newRegDir(), env: {}, maxTries: 2, log: () => {} } })
        let o1 = await startOccupier(P, HOSTS[2]) //預約之後才占用P與P+100
        let o2 = await startOccupier(P + 100, HOSTS[2])
        let got = null
        try {
            await assert.rejects(
                async () => {
                    got = await listenReserved(r, P, () => http.createServer(), { log: () => {} })
                },
                (err) => {
                    assert.strictEqual(err.code, 'E2E_PORT_EXHAUSTED')
                    assert.ok(err.message.includes('保留後被占用之埠'), err.message)
                    assert.ok(err.message.includes(`埠 ${P}(`), err.message)
                    return true
                }
            )
            await assertOccupierUntouched(o1, 'P')
            await assertOccupierUntouched(o2, 'P+100')
        }
        finally {
            if (got) {
                await new Promise((resolve) => got.server.close(resolve)) //預期拋錯卻綁定成功時(被測碼有缺陷), 關掉該站免得拖住mocha不結束
            }
            r.release()
            await o1.stop()
            await o2.stop()
        }
    })

    //E2: 同機另一個行程(另一套件或另一個e2e行程)已預約同一基準埠 → 換埠; 其結束後釋放
    it('EP-010 跨行程預約: 另一行程已預約P → 本行程換至P+100; 該行程結束後P重新可用', async function() {
        let P = await freeBase()
        let regDir = newRegDir()
        let holder = spawn(process.execPath, [fpHolder, String(P), regDir], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
        started.push(holder)
        let first = JSON.parse(await readLine(holder.stdout))
        assert.strictEqual(first.port, P, '另一行程先預約, 取得基準埠')
        let r = reserveFlowPort('probe', { basePort: P, reserve: { regDir, env: {}, log: () => {} } })
        assert.strictEqual(r.portOf(P), P + 100)
        r.release()
        await stopChild(holder)
        let r2 = reserveFlowPort('probe', { basePort: P, reserve: { regDir, env: {}, log: () => {} } })
        try {
            assert.strictEqual(r2.portOf(P), P, '持有者結束(正常結束)後預約須已釋放')
        }
        finally {
            r2.release()
        }
    })

    //E1: 多開工具指定位移(E2E_PORT_OFFSET)時, 自該位移起選
    it('EP-011 環境變數E2E_PORT_OFFSET=100已指定: 自該位移起選(P空閒仍用P+100)', async function() {
        let P = await freeBase()
        let r = reserveFlowPort('probe', { basePort: P, reserve: { regDir: newRegDir(), env: { E2E_PORT_OFFSET: '100' }, log: () => {} } })
        try {
            assert.strictEqual(r.portOf(P), P + 100)
        }
        finally {
            r.release()
        }
    })

    it('EP-012 isPortAnswering: 空閒為false, 任一位址變體有人接聽為true', async function() {
        let P = await freeBase()
        assert.strictEqual(await isPortAnswering(P), false)
        for (let h of HOSTS) {
            let occ = await startOccupier(P, h)
            if (!occ) {
                assert.ok(await absentFamily(h))
                continue
            }
            try {
                assert.strictEqual(await isPortAnswering(P), true, `占用者綁${h.name}時須判為有人接聽`)
            }
            finally {
                await occ.stop()
            }
        }
        assert.strictEqual(await isPortAnswering(P), false, '占用者結束後須回到空閒')
    })

    //§5-1、§5-3: createFlow(實際被e2e檔使用之路徑)被占用時換埠, 靜態站可用, 占用者不動, teardown釋放
    for (let h of [HOSTS[0], HOSTS[2]]) {
        it(`EP-013 [占用者綁${h.name}] createFlow: 基準埠被占用 → 靜態站換至P+100且可提供頁面, 占用者不動, teardown後釋放預約與埠`, async function() {
            let P = await freeBase()
            let occ = await startOccupier(P, h)
            let regDir = newRegDir()
            let fdDist = path.join(fdTmp, `dist-${++regSeq}`)
            fs.mkdirSync(fdDist, { recursive: true })
            fs.writeFileSync(path.join(fdDist, 'w-vditor-vue.umd.js'), 'FAKE_BUNDLE_MARKER')
            let logs = []
            let flow = createFlow('unit-e2ePorts-wiring', { basePort: P, reserve: { regDir, env: {}, log: (s) => logs.push(s) } })
            let prev = process.env.E2E_DIST_DIR
            process.env.E2E_DIST_DIR = fdDist
            let pSetup = flow.setup() //getDistDir於setup開頭同步讀取環境變數, 之後即可還原
            if (prev === undefined) {
                delete process.env.E2E_DIST_DIR
            }
            else {
                process.env.E2E_DIST_DIR = prev
            }
            let tornDown = false
            try {
                await pSetup
                assert.strictEqual(flow.base, P)
                assert.strictEqual(flow.port, P + 100)
                assert.strictEqual(flow.origin, `http://127.0.0.1:${P + 100}`)
                let page = await httpGet('127.0.0.1', flow.port, '/host/index.html')
                assert.ok(page && page.status === 200 && /html/.test(page.type), '實際埠須提供宿主頁')
                let bundle = await httpGet('127.0.0.1', flow.port, '/bundle/w-vditor-vue.umd.js')
                assert.strictEqual(bundle && bundle.body, 'FAKE_BUNDLE_MARKER')
                await assertOccupierUntouched(occ, h.name)
                await flow.teardown()
                tornDown = true
                assert.strictEqual(await isPortAnswering(P + 100), false, 'teardown後實際埠須已關閉')
                let again = reserveFlowPort('probe', { basePort: P, reserve: { regDir, env: {}, log: () => {} } })
                try {
                    assert.strictEqual(again.portOf(P), P + 100, 'teardown須釋放預約(否則再預約會移至P+200)')
                }
                finally {
                    again.release()
                }
            }
            finally {
                if (!tornDown) {
                    await flow.teardown()
                }
                await occ.stop()
            }
        })
    }

    it('EP-014 createFlow沒有占用: 靜態站即基準埠, origin由實際埠衍生', async function() {
        let P = await freeBase()
        let fdDist = path.join(fdTmp, `dist-${++regSeq}`)
        fs.mkdirSync(fdDist, { recursive: true })
        fs.writeFileSync(path.join(fdDist, 'w-vditor-vue.umd.js'), 'FAKE_BUNDLE_MARKER')
        let flow = createFlow('unit-e2ePorts-wiring', { basePort: P, reserve: { regDir: newRegDir(), env: {}, log: () => {} } })
        let prev = process.env.E2E_DIST_DIR
        process.env.E2E_DIST_DIR = fdDist
        let pSetup = flow.setup()
        if (prev === undefined) {
            delete process.env.E2E_DIST_DIR
        }
        else {
            process.env.E2E_DIST_DIR = prev
        }
        try {
            await pSetup
            assert.strictEqual(flow.port, P)
            assert.strictEqual(flow.origin, `http://127.0.0.1:${P}`)
            assert.strictEqual((await httpGet('127.0.0.1', P, '/bundle/w-vditor-vue.umd.js')).body, 'FAKE_BUNDLE_MARKER')
        }
        finally {
            await flow.teardown()
        }
    })

    //E4: 函式庫唯一會自動下殺之路徑是「殘留預約回收」(同root、記有已確認身分之行程); 本套件以專屬root使其永不匹配
    it('EP-015 殘留預約不下殺: 同root(專案根)之殘留預約記有存活行程之身分, 本套件預約該埠時回收預約回到基準埠, 但不殺該行程', async function() {
        let P = await freeBase()
        let regDir = newRegDir()
        let holder = spawn(process.execPath, [fpStaleHolder, String(P), regDir], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
        started.push(holder)
        let info = JSON.parse(await readLine(holder.stdout))
        let decoyPid = info.decoyPid
        try {
            //等函式庫背景取樣, 把誘餌行程(持有者之子)之身分寫入殘留預約(known); 取得前提: 預約確實記有可供下殺之身分
            let claimer = createE2ePortClaimer({ regDir, log: () => {} })
            await waitFor('殘留預約記有誘餌行程之身分', () => {
                let cur = claimer.read(P)
                return !!cur && Array.isArray(cur.known) && cur.known.some((k) => k.pid === decoyPid)
            })
            assert.strictEqual(claimer.read(P).root, path.resolve(process.cwd()), '前提: 殘留預約之root為專案根(舊行為下會被下殺)')
            assert.notStrictEqual(path.resolve(RESERVE_ROOT), path.resolve(process.cwd()), '本套件之預約root須與專案根不同')
            //強制終止持有者(模擬taskkill /F: 不釋放預約, 不終止其子行程); 持有者是本檔自己啟動者
            forceKillChild(holder)
            await new Promise((resolve) => holder.once('exit', resolve))
            assert.ok(pidExists(decoyPid), '前提: 持有者死後誘餌行程仍存活')
            let logs = []
            let r = reserveFlowPort('probe', { basePort: P, reserve: { regDir, env: {}, log: (s) => logs.push(s) } })
            try {
                assert.strictEqual(r.portOf(P), P, '持有者已死, 殘留預約被回收, 回到基準埠')
                assert.ok(pidExists(decoyPid), `誘餌行程被下殺: ${logs.join(' | ')}`)
                assert.ok(!logs.some((s) => s.includes('下殺')), `不得有下殺紀錄: ${logs.join(' | ')}`)
            }
            finally {
                r.release()
            }
        }
        finally {
            terminateOwn(decoyPid)
        }
    })

})
