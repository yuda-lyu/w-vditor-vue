//e2ePortsStaleHolder: 單元測試(unit-e2ePorts.test.mjs EP-015)用之另一個行程
//模擬「同一專案(root=cwd)之另一個e2e行程, 以noteOwn記下一個子行程之身分, 而後被強制終止(taskkill /F 類)而留下殘留預約」, 用於驗證本套件預約該埠時函式庫之殘留下殺不會觸發
//用法: node e2ePortsStaleHolder.mjs <basePort> <regDir>
//- 以root=process.cwd()(本套件正式預約改用專屬root, 與之不同)預約基準埠, 啟動一個誘餌子行程(最多存活120秒後自行結束)並noteOwn; 印一行JSON({ pid, decoyPid })後持續等待被終止(不自行結束、不釋放預約)
//- 本檔是測試夾具(唯一允許使用noteOwn與child_process之測試工具檔), 不屬於本套件正式的e2e流程
import { spawn } from 'child_process'
import { reserveE2ePorts } from './e2eLib.mjs'

let base = Number(process.argv[2])
let regDir = process.argv[3]
let r = reserveE2ePorts([base], { applyEnv: false, root: process.cwd(), regDir, env: {}, log: () => {} })
//detached: libuv將非detached之子行程放入隨父行程結束而關閉之job，父被強制終止時子行程會一併被殺, 無法模擬「殘留之存活行程」
let decoy = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 120000)'], { stdio: 'ignore', windowsHide: true, detached: true })
decoy.unref()
r.noteOwn(decoy)
console.log(JSON.stringify({ pid: process.pid, decoyPid: decoy.pid }))
setInterval(() => {}, 1000)
