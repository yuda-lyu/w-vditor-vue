//e2ePortsStaleHolder: 單元測試(unit-e2ePorts.test.mjs EP-015)用之另一個行程
//模擬「同一專案(root=cwd)之另一個e2e行程, 以noteOwn記下一個子行程之身分, 而後被強制終止(taskkill /F 類)而留下殘留預約」, 用於驗證本套件預約該埠時函式庫之殘留下殺不會觸發
//用法: node e2ePortsStaleHolder.mjs <basePort> <regDir>
//- 以root=process.cwd()(本套件正式預約改用專屬root, 與之不同)預約基準埠, 啟動一個誘餌子行程(最多存活120秒後自行結束)並noteOwn
//- 以noteOwn回傳之Promise為同步點(await): 其解開(涵蓋誘餌之那次取樣已寫入預約檔)且ok為true, 才印一行JSON({ pid, decoyPid, noted, tableDone })後持續等待被終止(不自行結束、不釋放預約); 讀到該行即確知預約檔已記有誘餌之身分, 測試端不必輪詢預約檔
//  tableDone為經'delay:<ms>'注入之取行程表已完成之次數(未注入為0), 供測試以語意(非時刻)確認「印行前延遲之取樣已完成」
//- ok不為true(取樣用盡重試仍失敗等)則印一行JSON({ error: 'note-failed', reason, pid, decoyPid, noted })並以非0結束(不印成功行)
//- 環境變數E2E_PORTS_FIXTURE_TABLE(僅本夾具使用, 經函式庫之正式注入點opt.tableAsync; 正式e2e流程不經本檔, 不受影響):
//  'delay:<ms>'=每次取行程表前先延遲<ms>毫秒(模擬全機滿載時取樣慢; 其後仍取真實行程表, 使記下之身分為真實起始時間)
//  'fail'=取行程表恆失敗(模擬取樣失敗; noteRetryMs為0使有界重試立即用盡, noteOwn回ok:false)
//  未設=函式庫預設(背景查詢真實行程表)
//- 本檔是測試夾具(唯一允許使用noteOwn與child_process之測試工具檔), 不屬於本套件正式的e2e流程
import { spawn } from 'child_process'
import { reserveE2ePorts, listProcessTable } from './e2eLib.mjs'

let base = Number(process.argv[2])
let regDir = process.argv[3]
let mode = String(process.env.E2E_PORTS_FIXTURE_TABLE || '')
let tableDone = 0 //經delay注入之取行程表已完成(已呼叫函式庫之cb)之次數


//tableOpt, 依E2E_PORTS_FIXTURE_TABLE組出注入函式庫之選項; 未設回傳空物件(不注入)
function tableOpt(mode) {
    if (mode === '') {
        return {}
    }
    let m = /^delay:(\d+)$/.exec(mode)
    if (m) {
        let ms = Number(m[1])
        return {
            tableAsync: (cb) => setTimeout(() => {
                let table = listProcessTable()
                tableDone++
                cb(table)
            }, ms)
        }
    }
    if (mode === 'fail') {
        return { tableAsync: (cb) => cb(null), noteRetryMs: 0 }
    }
    throw new Error(`E2E_PORTS_FIXTURE_TABLE不合法: ${mode}`)
}


let r = reserveE2ePorts([base], { applyEnv: false, root: process.cwd(), regDir, env: {}, log: () => {}, ...tableOpt(mode) })
//detached: libuv將非detached之子行程放入隨父行程結束而關閉之job，父被強制終止時子行程會一併被殺, 無法模擬「殘留之存活行程」
let decoy = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 120000)'], { stdio: 'ignore', windowsHide: true, detached: true })
decoy.unref()
//noteOwn之計時器與背景查詢皆不阻擋行程結束, 等待其Promise期間須自行保持事件迴圈(否則無其他事物時行程會先結束)
let keep = setInterval(() => {}, 1000)
let res = await r.noteOwn(decoy)
if (res.ok === true) {
    console.log(JSON.stringify({ pid: process.pid, decoyPid: decoy.pid, noted: res, tableDone }))
}
else {
    console.log(JSON.stringify({ error: 'note-failed', reason: res.reason, pid: process.pid, decoyPid: decoy.pid, noted: res }))
    clearInterval(keep)
    process.exitCode = 1
}
