//e2ePorts: e2e靜態站之基準埠與自動換埠之單一定義(規格 dspec/e2e埠與多套件同跑.md E1～E6, E8), e2e-setup.mjs與單元測試皆自此匯入, 共用實作經./e2eLib.mjs單一橋接
//- 各流程為一個測試檔(mocha --parallel下各一個行程), 於行程內以Node http監聽固定埠之靜態站, 流程之間互不相連, 故每個流程各自預約一個埠(applyEnv:false, 不寫環境變數E2E_PORT_OFFSET), 以reservation.portOf(基準埠)取實際埠
//- 沒有占用時即基準埠, 埠與行為同導入前; 基準埠被占用時換至下一個位移(整百), 實際埠印入輸出([e2e-port]); 絕不下殺占用者(本套件的e2e沒有任何依埠、依名稱或依命令列下殺之程式)
//- 預約之後、綁定之前被占用: Windows下占用者綁在萬用位址(0.0.0.0、::)或IPv6(::1)時, 綁127.0.0.1不報EADDRINUSE而是並存(後綁者的新連線優先, 即搶走對方流量), 故綁定前須以連線檢查確認無人接聽, 遇占用即reselect換下一個位移
import net from 'net'
import { reserveE2ePorts, describePortOwners } from './e2eLib.mjs'


//FLOW_PORTS, 流程代號與其靜態站基準埠(≥8000、固定不隨機、與sgud/rule/rulebook.md之e2e映射一致); 實際埠一律經reserveFlowPort/listenReserved取得, 不得直接使用此處之值
const FLOW_PORTS = {
    'load': 8136,
    'editing': 8137,
    'parent-update': 8138,
    'readonly': 8139,
    'readonly-focus': 8140,
    'key-hint': 8141,
}


//OTHER_TEST_PORTS, 本套件其他測試(非各流程靜態站)寫死之埠, 交給reserveE2ePorts之avoid避開; 實查(test/ 與 test/tools/ 全部.mjs)無任何其他寫死之埠, 由unit-e2ePorts.test.mjs EP-003守護清單與實際一致
const OTHER_TEST_PORTS = []


//RESERVE_ROOT, 預約之root: 函式庫以root判定「殘留預約是否屬本專案」, 屬本專案且記有已確認身分之行程(noteOwn記下者)的殘留預約會被下殺其行程;
//本套件從不記錄可供下殺之身分(不呼叫noteOwn), 且此處刻意不用專案根路徑而用專屬名稱, 使任何殘留預約之root都不可能與之相符 → 函式庫之殘留下殺在本套件永不觸發(預設拒絕, 由EP-015以真實行程守護)
const RESERVE_ROOT = 'w-vditor-vue-e2e-static-sites-never-reap'


//baseOf, 取流程之基準埠; opt.basePort僅供單元測試改用動態取得之空閒埠, 免占用真實流程埠而干擾並行中之e2e檔
function baseOf(flow, opt = {}) {
    let base = Number.isInteger(opt.basePort) ? opt.basePort : FLOW_PORTS[flow]
    if (!base) {
        throw new Error(`未登錄之流程代號: ${flow}`)
    }
    return base
}


//reserveFlowPort, 預約流程之靜態站埠(applyEnv:false); 回傳reservation(portOf、reselect、release); opt.reserve供單元測試注入regDir、env、probe、log、maxTries等
function reserveFlowPort(flow, opt = {}) {
    let base = baseOf(flow, opt)
    return reserveE2ePorts([base], { avoid: OTHER_TEST_PORTS, root: RESERVE_ROOT, ...(opt.reserve || {}), applyEnv: false })
}


//connectOne, 對host:port發起連線: 連上或逾時(收嚴, 視為有人)回true; 被拒或該位址族不可用回false
function connectOne(port, host, timeout) {
    return new Promise((resolve) => {
        let c = net.connect({ port, host })
        let finish = (v) => {
            c.removeAllListeners()
            c.on('error', () => {})
            c.destroy()
            resolve(v)
        }
        c.setTimeout(timeout, () => finish(true))
        c.once('connect', () => finish(true))
        c.once('error', (err) => finish(!['ECONNREFUSED', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'ENETUNREACH', 'EHOSTUNREACH'].includes(err.code)))
    })
}


//isPortAnswering, 127.0.0.1或::1是否有人接聽(以新連線檢查, 不送任何請求)
async function isPortAnswering(port, opt = {}) {
    let timeout = Number.isInteger(opt.timeout) && opt.timeout > 0 ? opt.timeout : 3000
    for (let host of ['127.0.0.1', '::1']) {
        if (await connectOne(port, host, timeout)) {
            return true
        }
    }
    return false
}


//listenOnce, 以新的server綁定host:port; 失敗時關閉並拋出原錯誤
function listenOnce(createServer, port, host) {
    let server = createServer(port)
    return new Promise((resolve, reject) => {
        let onError = (err) => {
            try {
                server.close(() => {})
            }
            catch (e) {}
            reject(err)
        }
        server.once('error', onError)
        server.listen(port, host, () => {
            server.off('error', onError)
            resolve(server)
        })
    })
}


/**
 * 依預約之埠綁定靜態站：綁定前以連線檢查確認無人接聽，已有人接聽或綁定遇EADDRINUSE即reselect換下一個位移，不下殺、不沿用占用者；重選用盡拋錯(err.code為E2E_PORT_EXHAUSTED)並於訊息附保留後被占用之埠與占用者
 *
 * @param {Object} r 輸入reserveFlowPort之回傳物件
 * @param {Number} base 輸入基準埠
 * @param {Function} createServer 輸入(port)=>尚未listen之net.Server工廠函數
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {String} [opt.host='127.0.0.1'] 輸入綁定位址字串，預設'127.0.0.1'
 * @param {Function} [opt.answering] 輸入(port)=>Promise<Boolean>之占用檢查函數，預設isPortAnswering(單元測試用於隔離EADDRINUSE路徑)
 * @param {Function} [opt.log=console.log] 輸入輸出函數，預設console.log
 * @returns {Promise<Object>} 回傳{server,port}
 */
async function listenReserved(r, base, createServer, opt = {}) {
    let host = opt.host || '127.0.0.1'
    let answering = typeof opt.answering === 'function' ? opt.answering : isPortAnswering
    let log = typeof opt.log === 'function' ? opt.log : console.log
    let busy = []
    while (true) {
        let port = r.portOf(base)
        let why = ''
        if (await answering(port)) {
            why = '已有人接聽'
        }
        else {
            try {
                let server = await listenOnce(createServer, port, host)
                return { server, port }
            }
            catch (err) {
                if (err.code !== 'EADDRINUSE') {
                    throw err
                }
                why = '綁定遇EADDRINUSE'
            }
        }
        let owners = describePortOwners(port)
        busy.push(`埠 ${port}(${why}; ${owners})`)
        log(`[e2e-port] 埠 ${port} 於保留後被他人占用(${why}; ${owners}), 不沿用、不下殺, 重選`)
        try {
            r.reselect(`埠 ${port} ${why}`)
        }
        catch (err) {
            err.message += `\n保留後被占用之埠: ${busy.join('; ')}`
            err.busy = busy
            throw err
        }
    }
}


export {
    FLOW_PORTS,
    OTHER_TEST_PORTS,
    RESERVE_ROOT,
    baseOf,
    reserveFlowPort,
    isPortAnswering,
    listenReserved
}
