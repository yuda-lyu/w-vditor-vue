//e2ePortsHolder: 單元測試(unit-e2ePorts.test.mjs)用之另一個行程, 以同一個預約目錄預約基準埠(模擬同機另一套件或另一個e2e行程), 用於驗證跨行程預約
//用法: node e2ePortsHolder.mjs <basePort> <regDir>
//- 預約後印一行JSON({ port, pid }), 持有至父行程關閉stdin(此時正常結束並釋放預約); 不綁定埠
import { reserveFlowPort } from './e2ePorts.mjs'

let base = Number(process.argv[2])
let regDir = process.argv[3]
let r = reserveFlowPort('holder', { basePort: base, reserve: { regDir, env: {}, log: () => {} } })
console.log(JSON.stringify({ port: r.portOf(base), pid: process.pid }))
process.stdin.resume()
process.stdin.on('end', () => {
    process.exit(0)
})
