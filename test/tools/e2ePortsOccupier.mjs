//e2ePortsOccupier: 單元測試(unit-e2ePorts.test.mjs)用之真實占用者行程, 模擬「別的套件正在跑之服務」
//用法: node e2ePortsOccupier.mjs <port> [host|-]   host未給或'-'同node預設(雙棧::)
//- 在指定埠起一個真實HTTP監聽; 帶x-e2e-probe標頭之請求(測試自己探測用)不計次, 其餘請求(被測碼打到者)計入hits, 回應JSON { occupier, pid, hits }
//- 啟動後印一行JSON({ ready, pid }或{ error }); 父行程關閉stdin時自行結束(不需被殺)
import http from 'http'

let port = Number(process.argv[2])
let host = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : undefined
let hits = 0
let server = http.createServer((req, res) => {
    if (!req.headers['x-e2e-probe']) {
        hits++
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ occupier: true, pid: process.pid, hits }))
})
server.on('error', (err) => {
    console.log(JSON.stringify({ error: err.code || err.message }))
    process.exit(3)
})
server.listen(port, host, () => {
    console.log(JSON.stringify({ ready: true, pid: process.pid }))
})
process.stdin.resume()
process.stdin.on('end', () => {
    process.exit(0)
})
