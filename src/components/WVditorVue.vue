<template>
    <div
        :changeShowPopper="changeShowPopper"
    >

        <WIconLoading v-if="loading"></WIconLoading>

        <div
            class="WVditorFix"
            :style="`${loading?'height:0px; max-height:0px; overflow-y:hidden;':''}`"
        >

            <div ref="divVditor"></div>

            <div
                ref="divContent"
                class="WPopperFix"
                :style="`z-index:${cmpZIndex};`"
                v-show="showPopper"
                v-domresize
                @domresize="updatePopper"
            >
                <div
                    :style="`${contentStyle} background:${useHintBackgroundColor}; ${useHintBorderRadius} ${useHintShadow}`"
                    v-if="showPopper"
                >
                    <slot
                        name="content"
                        :hint="useHint"
                        :funInsert="(v)=>{insertValue(v,'slot')}"
                        :funHide="()=>{updateValue(false,'slot')}"
                    ></slot>
                </div>
            </div>

        </div>

    </div>
</template>

<script>
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import last from 'lodash-es/last.js'
import pull from 'lodash-es/pull.js'
import isNumber from 'lodash-es/isNumber.js'
import genID from 'wsemi/src/genID.mjs'
import genPm from 'wsemi/src/genPm.mjs'
import replace from 'wsemi/src/replace.mjs'
import waitFun from 'wsemi/src/waitFun.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import isstr from 'wsemi/src/isstr.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import isEle from 'wsemi/src/isEle.mjs'
import convertColor from 'w-component-vue/src/js/convertColor.mjs'
import domResize from 'w-component-vue/src/js/domResize.mjs'
import BuildPopper from 'w-component-vue/src/js/buildPopper.mjs'
import WIconLoading from 'w-component-vue/src/components/WIconLoading.vue'
import Vditor from 'vditor' //直接引用vditor, 已能被rollup打包進dist, 故不再需要由外部引入cdn
import 'vditor/dist/index.css' //rollup-plugin-postcss會將css注入至dist, 故不再需要由外部引入css


//tootip與popup不共用已出現項目清單, 避免互相影響
let kpRespList = {
    tooltip: [],
    popup: [],
}
function funAddTrigger(mode, mmkey) {
    kpRespList[mode].push(mmkey)
}
function funCheckTrigger(mode, mmkey) {
    return last(kpRespList[mode]) === mmkey
}
function funRemoveTrigger(mode, mmkey) {
    pull(kpRespList[mode], mmkey)
}


//toMarkdown, 將value轉為寫入編輯器之markdown字串, null與undefined視為空字串, 其他非字串轉為字串
function toMarkdown(v) {
    if (v === null || v === undefined) {
        return ''
    }
    if (!isstr(v)) {
        return String(v)
    }
    return v
}


//normEcho, 比對回寫用之正規化, 換行符統一為\n並忽略結尾空白: vditor回拋值結尾帶換行, 父層以v-model.trim等回寫時結尾空白會被修整
function normEcho(v) {
    return toMarkdown(v).replace(/\r\n?/g, '\n').trimEnd()
}


//LOCK_EVENTS, 唯讀期間於組件根之capture階段攔截之事件, 註冊與移除共用(guardLock依事件分類處置)
let LOCK_EVENTS = ['click', 'touchstart', 'keydown', 'keyup', 'focus', 'blur', 'input', 'compositionstart', 'compositionend', 'drop']


let def_settings = {
    mode: 'wysiwyg', //sv: 雙欄位, ir:即時渲染, wysiwyg:所見即所得
    // debugger: true,
    // height: 500,
    // placeholder: '請輸入Markdown格式文字',
    theme: 'classic',
    lang: 'zh_TW',
    counter: {
        enable: false,
        type: 'markdown',
    },
    tab: '\t',
    typewriterMode: true,
    toolbarConfig: {
        pin: true
    },
    cache: {
        enable: false
    },
    toolbar: [
        // 'emoji',
        'headings',
        'bold',
        'italic',
        'strike',
        'link',
        '|',
        'list',
        'ordered-list',
        // 'check',
        'outdent',
        'indent',
        '|',
        'quote',
        'line',
        // 'code',
        // 'inline-code',
        'insert-before',
        'insert-after',
        '|',
        // 'record',
        'table',
        '|',
        'undo',
        'redo',
        '|',
        'edit-mode',
        // 'content-theme',
        // 'code-theme',
        'export',
        // {
        //     name: 'more',
        //     toolbar: [
        //         'fullscreen',
        //         'both',
        //         // 'preview',
        //         // 'info',
        //         // 'help',
        //     ],
        // },
        // {
        //     hotkey: '⇧⌘S',
        //     name: 'sponsor',
        //     tipPosition: 's',
        //     tip: 'toolbar icon tip',
        //     className: 'right',
        //     icon: '<svg></svg>',
        //     click: () => {
        //         console.log('toolbar click')
        //     },
        // },
    ],
    hint: {
        parse: true,
        delay: 0,
        extend: [
            // {
            //     key: 'md',
            //     hint: async (value) => {
            //         console.log('hint.extend hint', value)
            //         let ts = [
            //             {
            //                 html: '<h6>md1</h6>',
            //                 value: '[google](https://www.google.com/)',
            //             },
            //             {
            //                 html: `<div>md2 <span style="color:#f26;">test2</span></div>`,
            //                 value: 'vvv2',
            //             },
            //         ]
            //         return ts
            //     },
            // },
        ],
    },
    // input: (msg) => {
    //     console.log('input', msg)
    // },
    preview: {
        maxWidth: 1e10,
        delay: 0,
        actions: [], //['desktop', 'tablet', 'mobile', 'mp-wechat', 'zhihu'] //移除分享按鈕
        hljs: {
            style: 'monokai',
            lineNumber: true
        },
        // parse: (ele) => { //預覽回調
        //     console.log('preview.parse', ele) //僅分割預覽之預覽區有效
        //     return ele
        // },
        // transform: (h) => { //渲染之前回調
        //     console.log('preview.transform', h) //僅分割預覽之預覽區有效
        //     return h
        // },
    },
}


/**
 * 基於vditor之markdown編輯器組件，vditor本體與其樣式已打包至dist，故使用時不需再由外部引入vditor之js與css。
 * 但vditor於執行期仍會以script或link動態下載lute(markdown引擎)、i18n語系、icons圖示、content-theme樣式等資源，
 * 並於內容含公式或圖表語法時另外下載katex、mermaid、echarts等渲染器，預設來源為「https://unpkg.com/vditor@[版本]」。
 * 內網或無法連外時，可將node_modules/vditor/dist複製至自架站台，再通過settings.cdn指向該dist之上一層目錄，
 * 例如settings.cdn給予'/static/vditor'，vditor即會改由'/static/vditor/dist/js/lute/lute.min.js'取得資源。
 * 另工具列export之PDF子項已固定移除，僅保留Markdown與HTML，因PDF匯出會於iframe內重建vditor環境，
 * 額外由settings.cdn取得dist/index.css、dist/method.min.js、js/i18n/zh_CN.js與hljs樣式共4項資源。
 *
 * 組件定位為單一編輯者之輸入組件，與原生input相同：載入父層給予之資料並顯示、內容一變更即回拋、依editable鎖定編輯；回拋資料要同步至其他組件或上傳伺服器、上傳期間是否鎖定編輯、多組件共用資料之單向同步，皆由父層負責。多組件或多人同時編輯同一份資料(共編)須父層與組件層皆支援CRDT等協作機制，非僅由編輯器單方處理，本組件目前不支援共編。
 *
 * @vue-prop {String} [value=''] 輸入markdown字串，為編輯器內容之唯一來源(settings.value與settings.cache之內容於初始化完成時皆被value取代)，可使用v-model雙向綁定，亦可只給value並於input事件內回寫或不回寫，null與undefined視為''，其他非字串會轉為字串，預設為''。編輯器初始化完成時載入當下之value(含初始化期間父層才給予之資料)並作為復原起點；之後value變更時，若等於組件最後回拋之值或編輯器當前內容則為回寫而不重載(比對時忽略結尾空白與換行符\r\n、\n之差異，開頭空白之增減屬內容變更)，否則以value為準載入：使用者尚未編輯時變更後之內容即成為新的復原起點，已有編輯則保留復原歷史；載入時若編輯區持有焦點，游標不保留。換載另一份文件或需捨棄編輯時，請以key重建組件
 * @vue-prop {Number} [height=400] 輸入編輯器高度數字，單位為px，預設為400
 * @vue-prop {Object} [settings={}] 輸入vditor設定物件，會覆蓋組件內建預設值，內建預設值詳見原始碼處def_settings，各設定項詳見vditor官方文件。settings、height、keyHint、hintTimeDetect皆於建立編輯器時採用，之後變更不生效，需變更時請以key重建組件。其中settings.input由組件接管；settings.after會於編輯器初始化完成且已載入value後呼叫一次，組件於初始化完成前即銷毀時則不呼叫；settings.cache.enable為true時須同時給予settings.cache.id。lute或語系檔無法載入、settings.lang或settings.mode不合法、settings.cache缺id、或初始化完成時處理失敗時，組件會停留於載入圖示
 * @vue-prop {String} [settings.mode='wysiwyg'] 輸入編輯模式字串，可選'sv'(雙欄位)、'ir'(即時渲染)、'wysiwyg'(所見即所得)，預設為'wysiwyg'
 * @vue-prop {String} [settings.lang='zh_TW'] 輸入語系字串，可選'zh_CN'、'zh_TW'、'en_US'、'ja_JP'、'ko_KR'、'ru_RU'、'sv_SE'、'fr_FR'、'pt_BR'，預設為'zh_TW'
 * @vue-prop {String} [settings.theme='classic'] 輸入編輯器主題字串，可選'classic'、'dark'，預設為'classic'
 * @vue-prop {String} [settings.cdn='https://unpkg.com/vditor@[版本]'] 輸入vditor執行期動態載入資源(lute、i18n、icons、katex等)之來源位置字串，該位置之下需有dist資料夾，預設為vditor內建之unpkg位置
 * @vue-prop {Object} [settings.i18n=null] 輸入自訂語系物件，給予後vditor將不再下載i18n語系檔，供內網部署時減少依賴，預設為null代表由settings.cdn下載對應settings.lang之語系檔
 * @vue-prop {String} [settings.icon='ant'] 輸入工具列圖示組字串，可選'ant'、'material'，圖示檔由settings.cdn下載，預設為'ant'
 * @vue-prop {Array} [settings.toolbar=['詳見原始碼']] 輸入工具列項目陣列，預設詳見原始碼處def_settings->toolbar
 * @vue-prop {String} [settings.placeholder=''] 輸入編輯器無內容時顯示之提示字串，預設為''
 * @vue-prop {String|Array} [keyHint=''] 輸入打字時調用提示區之完整觸發字串或其陣列，例如給予'/ht'則輸入「/ht」即顯示提示區，亦可給予'@'、'/ht'等任意字串，或給予['/ht','/kw']陣列註冊多組，給予''則不啟用提示區，預設為''。觸發字串須位於行首或其前方為空白字元方會生效，且點選提示項目後會移除游標前本次輸入之觸發字串再插入(游標已移離觸發字串時則只插入)
 * @vue-prop {Number} [hintTimeDetect=100] 輸入偵測提示區之debounce時間數字，單位為ms，預設100。因vditor之編輯回調options.input為debounce機制，打字時每次按鍵皆重新計時，停止打字後才觸發，而提示區偵測與value回拋皆由該回調驅動，故此值即為打完keyHint後至提示區出現之延遲，亦為v-model同步之延遲；vditor原生預設為800ms，另因其同時決定undo還原點之合併粒度，給予過小值會使undo變得瑣碎。sv模式之options.input為每次輸入即同步觸發，提示區偵測與v-model同步不受此值影響
 * @vue-prop {String} [hintBackgroundColor='#fff'] 輸入提示窗背景顏色字串，預設'#fff'
 * @vue-prop {Boolean} [hintShadow=true] 輸入提示窗是否顯示陰影布林值，預設true
 * @vue-prop {String} [hintShadowStyle='0 5px 5px -3px rgba(0,0,0,.2), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12)'] 輸入提示窗陰影樣式字串，預設'0 5px 5px -3px rgba(0,0,0,.2), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12)'
 * @vue-prop {Number} [cmpZIndex=3000] 輸入提示窗使用z-index數字，預設3000
 * @vue-prop {Boolean} [editable=true] 輸入是否為編輯模式布林值，給予false則編輯器為唯讀，可隨時切換(例如父層上傳資料期間鎖定編輯)，預設true。唯讀期間組件維持編輯區不可編輯、編輯類工具列與復原重做停用，鎖定時編輯區失焦並關閉提示區，編輯區內之按鍵、輸入(含其內之表單控制項)、核取方塊、圖片與內容下方空白處之點擊，以及停用中之工具列按鈕皆不交由vditor處理，使用者無法改動內容。唯讀期間同原生readonly，編輯區仍可以Tab鍵聚焦(內容超出時可捲動，可聚焦其中之連結、核取方塊、表格與程式碼區塊)，滑鼠、觸控等非鍵盤取得之焦點則不保留；焦點位於編輯區內時其按鍵不往外傳遞(頁面於capture階段之監聽仍收得到，並保留Tab移動焦點、捲動、開啟連結、複製等瀏覽器預設行為)。唯讀期間settings.focus、settings.blur(由組件代為呼叫)、settings.select、settings.unSelect、settings.link.click與圖片預覽照常，settings.keydown、settings.esc、settings.ctrlEnter不呼叫；自訂工具列項目不由組件停用，鎖定前已開始之settings.upload上傳與settings.comment評論功能不在唯讀保證內。唯讀期間父層仍可變更value；鎖定前之最後輸入可能於鎖定後才回拋
 * @vue-event {String} input 編輯器內容變更時發射(使用者輸入、刪除、貼上、工具列操作、復原或重做，或由提示區點選插入內容)，帶出當前markdown字串，供v-model接收；wysiwyg與ir模式多數輸入於停止輸入hintTimeDetect毫秒後發射，sv模式每次輸入即發射；組件銷毀時尚未發射之最後輸入不再回拋
 * @vue-slot {Object} content 提示區內容之渲染slot，需搭配keyHint使用，slot props為{ hint, funInsert, funHide }，hint為當前觸發之keyHint字串，funInsert(v)為插入v至編輯器游標處之函數(v以HTML片段插入，含使用者輸入等不可信資料時須由呼叫端跳脫；唯讀或編輯器未就緒時不插入)，funHide()為隱藏提示區之函數
 */
export default {
    directives: {
        domresize: domResize(),
    },
    components: {
        WIconLoading,
    },
    props: {
        value: {
            type: String,
            default: '',
        },
        height: {
            type: Number,
            default: 400,
        },
        settings: {
            type: Object,
            default: () => {},
        },
        keyHint: {
            type: [String, Array],
            default: '',
        },
        hintTimeDetect: {
            type: Number,
            default: 100,
        },
        hintBorderRadius: {
            type: Number,
            default: 4,
        },
        hintBackgroundColor: {
            type: String,
            default: '#fff',
        },
        hintShadow: {
            type: Boolean,
            default: true,
        },
        hintShadowStyle: {
            type: String,
            default: '0 5px 5px -3px rgba(0,0,0,.2), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12)',
        },
        cmpZIndex: {
            type: Number,
            default: 3000,
        },
        editable: {
            type: Boolean,
            default: true,
        },
    },
    data: function() {
        return {

            //stage, 組件生命週期階段(唯一狀態來源):
            //created: 已建立實例, 尚未建立編輯器
            //creating: 已掛載並建立vditor, 等待語系檔與lute載入, 此時編輯器尚不可寫入
            //ready: vditor初始化完成(after回調)且已載入value, 可編輯與載入value
            //failed: vditor已初始化完成但組件就緒處理失敗, 維持載入圖示且不可寫入, 銷毀時仍須銷毀vditor
            //destroyed: 組件已銷毀(或於編輯器初始化完成前即銷毀)
            stage: 'created',

            mmkey: genID(), //beforeMount內無法變更data, mounted內會晚於computed, 故優先放於data生成
            // mmkey: (() => {
            //     let id = genID()
            //     console.log('data gen mmkey', id)
            //     return id
            // })(),

            bp: null,

            mode: 'popup', //tooltip, popup
            kind: 'click', //hover, click
            isolated: true, //因完全使用事件觸發, 故isolated=true
            transitionTime: 200,
            triggerWidth: null,
            contentStyle: '',

            showPopper: false,
            placement: 'bottom-start', //定位左下
            placementDistX: 0,
            placementDistY: -15,

            useHint: '',

        }
    },
    created: function() {
        //非畫面狀態之實例屬性, 不放data以免被Vue觀察(vditor實例若為響應式會被深度觀察)

        let vo = this

        vo.contentEditor = null //vditor實例
        vo.valueEmittedLast = null //最後回拋之值, 父層回寫該值時不重載, null代表載入後尚未回拋
        vo.valueLoadedMd = '' //上次載入value後編輯器之內容, 供判斷使用者是否已編輯(含尚未回拋之輸入)
        vo.editedAfterLoad = false //自上次載入value後使用者是否已編輯(由input回呼設定, 保留歷史之載入亦設定), 供父層變更value時判斷是否重設復原起點
        vo.lockObserver = null //唯讀期間監看工具列與編輯區之MutationObserver, 存在即代表唯讀已套用(isLockApplied)
        vo.lockTypes = [] //鎖定當下已停用之工具列項目, 供唯讀期間檢查是否被重新啟用
        vo.fLockGuard = null //唯讀期間攔截vditor處理之監聽函數(LOCK_EVENTS, 由guardLock處置)

    },
    mounted: function() {
        //console.log('mounted')

        let vo = this

        let core = async() => {

            //wait $el
            await waitFun(() => {
                return vo.$el !== undefined
            })

            //wait divVditor, 組件銷毀時divVditor已被移除, 亦須解除等待
            await waitFun(() => {
                if (vo.stage === 'destroyed') {
                    return true
                }
                let ele = get(vo, '$refs.divVditor')
                return isEle(ele)
            })

            //check, 組件已銷毀(如彈窗於編輯器初始化完成前被關閉)時跳出, 避免於銷毀後建立Vditor實例
            if (vo.stage === 'destroyed') {
                return
            }

            //divVditor
            let divVditor = vo.$refs.divVditor
            // console.log('divVditor', divVditor)

            //settings, 快照建構時採用之設定, 呼叫端自帶之settings.after由組件於就緒後代為呼叫
            let settings = vo.useSettings
            let afterUser = get(settings, 'after')

            //stage, 建立vditor, 等待其初始化完成
            vo.stage = 'creating'

            //contentEditor, 以vditor之after回調為就緒點:
            //vditor未給settings.i18n時須先非同步載入語系檔才建立vditor物件, 之後一律再非同步載入lute, 載入後才initUI並呼叫after,
            //若僅偵測vditor物件存在即寫入內容, 早於lute時會拋錯而使編輯器空白, 晚於initUI時空白已先進入復原堆疊而使按復原即清空內容
            //after由vditor於lute載入後之Promise內呼叫, 故於建構式回傳後才會觸發, 此時editor已賦值
            let editor = new Vditor(divVditor, {
                ...settings,
                after: () => {
                    //onEditorReady內錯誤須於此接住, 否則會中斷vditor於after之後載入工具列圖示
                    try {
                        vo.onEditorReady(editor, afterUser)
                    }
                    catch (err) {
                        console.log(err)
                        //stage, 就緒處理失敗時vditor已初始化完成, 標記failed使銷毀時仍銷毀vditor
                        if (vo.stage === 'creating') {
                            vo.stage = 'failed'
                        }
                    }
                },
            })
            vo.contentEditor = editor
            // console.log('contentEditor', vo.contentEditor)

        }

        //core
        core()
            .catch((err) => {
                console.log(err)
            })

        //fLockGuard, 唯讀期間攔截vditor之處理(處置詳見guardLock), touchstart僅供iPhone之工具列(vditor以touchstart代替click)故設passive
        vo.fLockGuard = (e) => {
            vo.guardLock(e)
        }
        each(LOCK_EVENTS, (k) => {
            vo.$el.addEventListener(k, vo.fLockGuard, { capture: true, passive: k === 'touchstart' })
        })

        //BuildPopper
        let keyShow = 'showPopper'
        let evNameValue = 'change-show-popper'
        vo.bp = new BuildPopper(vo,
            vo.funGetDivTrigger,
            vo.funGetDivContent,
            keyShow,
            evNameValue,
            {
                funAddTrigger,
                funCheckTrigger,
                funRemoveTrigger,
            })

        //監聽evNameValue
        vo.bp.on(evNameValue, (showPopper) => {
            // console.log(vo.mmkey, 'bp.on', evNameValue, showPopper)
            if (!showPopper) { //僅處理隱藏事件
                vo.useHint = '' //隱藏時清空useHint
            }
        })

        //mounted
        vo.bp.mounted()

    },
    beforeDestroy: function() {
        //console.log('beforeDestroy')

        let vo = this

        //stage, 銷毀前之階段供判斷可否立即銷毀vditor
        let stagePrev = vo.stage
        vo.stage = 'destroyed'

        //unwatchLock, 停止唯讀監看
        vo.unwatchLock()

        //fLockGuard
        if (vo.fLockGuard) {
            each(LOCK_EVENTS, (k) => {
                vo.$el.removeEventListener(k, vo.fLockGuard, true)
            })
            vo.fLockGuard = null
        }

        //destroy, vditor初始化完成(ready或failed)時以其destroy完整銷毀;
        //初始化未完成(creating)時不呼叫destroy, vditor亦無取消初始化之介面:
        //語系檔未載入前vditor尚無vditor物件, destroy會因讀取vditor.element而報錯;
        //lute未載入前destroy雖可執行, 但其UIUnbindListener會移除同頁其他編輯器之window resize監聽(vditor以模組層單一變數保存), 且lute事後送達時vditor仍會initUI並重新綁定,
        //故改由releaseCreating依初始化進度釋放已綁定之監聽並阻止後續處理, lute於銷毀後才送達者由onEditorReady於初始化完成時補做銷毀
        if (vo.contentEditor) {
            if (stagePrev === 'ready' || stagePrev === 'failed') {
                vo.contentEditor.destroy()
            }
            else {
                vo.releaseCreating(vo.contentEditor)
            }
            vo.contentEditor = null
        }

        //destroy
        if (vo.bp) {
            vo.bp.destroy()
        }

    },
    watch: {
        //裁決(2026-10-04), 組件定位與權責, 勿因父層之個別需求而偏離:
        //本組件為單一編輯者之輸入組件, 與原生input及CKEditor、TinyMCE、Quill之官方Vue封裝同類, 只負責三件事:
        //1.編輯器初始化完成時載入父層給予之value並顯示(之後父層再給新資料則以value為準載入)
        //2.內容一變更即回拋input
        //3.依editable鎖定編輯, 鎖定期間工具列、編輯區與提示區之唯讀一致性由本組件負責維持
        //回拋資料要同步至其他組件或上傳伺服器、上傳期間鎖定編輯(給editable=false)、多組件共用資料之單向同步, 皆屬父層責任;
        //父層回寫只要等於最後回拋值或編輯器當前內容即視為回寫(含延後回寫), 回寫到已被更新回拋取代之舊值則以value為準載入,
        //延遲或亂序回寫之協調屬父層責任, 本組件不推測回寫來源與先後, 勿於本組件加入回拋紀錄、時間窗等協調邏輯
        //多組件或多人同時編輯同一份資料(共編)須父層與組件層皆支援CRDT等協作機制方能達成, 非僅由編輯器組件單方處理:
        //父層須提供協作機制並嚴格控制資料之收送, 組件須提供對應之變更粒度與套用遠端變更之介面;
        //本組件目前為單一編輯者之定位而不支援共編, 需共編時應另行規劃父層與組件之CRDT支援, 不可以組件內之推測邏輯代替

        value: function() {
            //父層變更value, 只在value真的變更時觸發(Vue於值相同時不通知)
            let vo = this
            vo.relaValue()
        },

        editable: function() {
            //父層變更editable(例如上傳資料期間鎖定編輯)
            let vo = this
            vo.applyEditable()
        },

    },
    computed: {

        loading: function() {
            //loading, 編輯器初始化完成前顯示載入圖示並隱藏編輯器
            let vo = this
            return vo.stage !== 'ready'
        },

        keyHints: function() {
            let vo = this

            //hts
            let hts = vo.keyHint
            if (isestr(vo.keyHint)) {
                hts = [vo.keyHint]
            }
            // console.log('hts', hts)

            return hts
        },

        useSettings: function() {
            //console.log('computed useSettings')

            let vo = this

            let st = {
                ...def_settings,
                ...vo.settings,
            }
            // console.log('st', st)

            //add height
            st.height = vo.height

            //add undoDelay, vditor之options.input是包在setTimeout(..., undoDelay)內, 且前面有clearTimeout,
            //即為debounce: 打字時每次按鍵都重新計時, 停止打字後才觸發。
            //而偵測keyHint之detectAndShowHint與v-model回拋皆由options.input驅動, 故此值即為提示區之偵測延遲,
            //vditor預設800ms過久, 會讓提示區與v-model都慢一拍
            st.undoDelay = vo.hintTimeDetect

            //extend
            let extend = []
            each(vo.keyHints, (v) => {
                if (!isestr(v)) {
                    return true //跳出換下一個
                }
                let ht = {
                    key: v,
                    hint: async (value) => {
                        // console.log('hint.extend hint', value)
                        let ts = [
                            {
                                html: `<div name="tar" tpht="${v}" style="display:none;"></div>`,
                                value: '',
                            },
                        ]
                        return ts
                    },
                }
                extend.push(ht)
            })
            //hint, 以新物件寫入extend, 避免改寫呼叫端settings.hint或模組層def_settings.hint(vditor亦會往extend陣列push項目, vditor/src/ts/hint/index.ts:22)
            st.hint = { ...st.hint, extend }
            // console.log('st.hint.extend', st.hint.extend)

            //add input
            st.input = (value) => {
                // console.log(vo.mmkey, 'input', value)

                //check, 非ready時不處理, vditor之防抖回調可能於組件銷毀後才觸發
                if (vo.stage !== 'ready') {
                    return
                }

                //editedAfterLoad, input皆由使用者操作(輸入、復原、重做、工具列、提示區插入)觸發; 鎖定前之最後輸入可能於鎖定後才觸發, 照常回拋
                vo.editedAfterLoad = true

                //valueEmittedLast, 父層回寫此值時不重載
                vo.valueEmittedLast = value

                //detectAndShowHint
                vo.detectAndShowHint(value)

                //emit, 內容一變更即回拋; 裁決(2026-10-04): 回拋後資料之去向(同步至其他組件、上傳伺服器)與上傳期間之鎖定(editable)皆由父層負責
                vo.$emit('input', value)

            }

            // console.log('st', st)
            return st
        },

        changeShowPopper: function () {
            //console.log('computed changeShowPopper')

            let vo = this

            //trigger
            let showPopper = vo.showPopper
            let isolated = vo.isolated

            //updateValue
            if (!isolated) {
                vo.updateValue(showPopper, 'changeShowPopper')
            }

            return ''
        },

        useHintBorderRadius: function() {
            //console.log('computed useHintBorderRadius')

            let vo = this

            if (isNumber(vo.hintBorderRadius)) {
                return `border-radius:${vo.hintBorderRadius}px;`
            }
            return ''
        },

        useHintBackgroundColor: function() {
            //console.log('computed useHintBackgroundColor')

            let vo = this

            return convertColor(vo.hintBackgroundColor)
        },

        useHintShadow: function() {
            //console.log('computed useHintShadow')

            let vo = this

            //check
            if (!vo.hintShadow) {
                return ''
            }

            //hintShadowStyle
            let s = replace(vo.hintShadowStyle, ';', '')
            if (s !== '') {
                return `box-shadow:${s};`
            }

            return ''
        },

    },
    methods: {

        relaValue: function() {
            //父層變更value時由watch呼叫

            let vo = this

            //check, 編輯器未就緒時不處理, 就緒時onEditorReady會載入當下之value
            if (vo.stage !== 'ready') {
                return
            }

            //check, 父層回寫(v-model或於input事件內回寫)之值不重載
            if (vo.isEcho(vo.value)) {
                return
            }

            //hideHint, 整份內容將被取代, 開啟中之提示區所記錄之插入位置已失效
            vo.hideHint()

            //loadValue, 父層給予新資料(例如後端資料於就緒後才到), 以value為準載入:
            //使用者自上次載入後尚未編輯時(含尚未回拋之輸入), 新資料即成為復原起點, 避免按復原回到變更前之內容(例如資料到達前之空白);
            //已有編輯時保留復原歷史, 避免清除使用者之編輯紀錄; 比對經正規化, 避免切換編輯模式之序列化差異誤判
            let edited = vo.editedAfterLoad || normEcho(vo.contentEditor.getValue()) !== normEcho(vo.valueLoadedMd)
            vo.loadValue(!edited)

            //唯讀期間載入時, vditor於延後寫入復原堆疊時會重新啟用復原鈕, 由唯讀監看(watchLock)改回唯讀

        },

        isEcho: function(value) {
            //判斷value是否為父層回寫: 等於最後回拋之值(含使用者回拋後又輸入而尚未回拋時之回寫), 或等於編輯器當前內容(含載入後尚未回拋時之回寫), 比對忽略結尾空白與換行符差異
            //裁決(2026-10-04): 只以最後回拋值及當前內容判斷, 不保留多筆回拋紀錄、不設時效;
            //父層延遲或亂序回寫之協調屬父層責任(見watch處之裁決), 其值不等於上述二者時即以value為準載入

            let vo = this

            //先比對最後回拋值(同步回寫皆屬此), 不符才取編輯器內容比對, 避免每次回寫皆以lute轉換全文
            let c = normEcho(value)
            if (vo.valueEmittedLast !== null && c === normEcho(vo.valueEmittedLast)) {
                return true
            }
            if (c === normEcho(vo.contentEditor.getValue())) {
                return true
            }
            return false
        },

        onEditorReady: function(editor, afterUser) {
            //vditor完成初始化(lute已載入且initUI完成)時由after回調呼叫

            let vo = this

            //check, 組件已於vditor完成初始化前銷毀(lute於銷毀後才送達, beforeDestroy當時無法完整銷毀, 見releaseCreating), 於此補做銷毀, 呼叫端之after不呼叫
            if (vo.stage === 'destroyed') {
                editor.destroy()
                return
            }

            //removeExportPdf, 於toolbar渲染完成後移除export之PDF子項
            vo.removeExportPdf()

            //loadValue, 載入當下之value(含creating期間父層才給予之資料)並作為復原起點
            vo.loadValue(true)

            //stage, 就緒
            vo.stage = 'ready'

            //applyEditable, 唯讀時於此同步套用(含creating期間父層才給予之editable), initUI會重新啟用工具列; 可編輯時沿用vditor初始化後之狀態
            if (!vo.editable) {
                vo.applyEditable()
            }

            //afterUser, 呼叫端自帶之settings.after, 依vditor原呼叫方式以其合併後之設定為接收者
            if (isfun(afterUser)) {
                afterUser.call(get(editor, 'vditor.options'))
            }

        },

        releaseCreating: function(editor) {
            //vditor初始化未完成即銷毀組件時, 釋放vditor已綁定之全域監聽並阻止其後續處理(不呼叫vditor之destroy之原因見beforeDestroy)
            //isDestroyed與showErrorTip為vditor之private成員(TypeScript之private於執行期為一般屬性), 以實例屬性寫入

            //isDestroyed, vditor之destroy所設、init開頭所檢查之旗標: 語系檔未載入時令其載入後init直接返回, 不建立編輯區亦不再請求lute;
            //init已執行時寫入無作用, 僅使狀態與已銷毀一致
            editor.isDestroyed = true

            //showErrorTip, 語系檔於銷毀後才載入失敗時不顯示vditor之錯誤提示(提示附加於body, 編輯器已移除); init已執行時已無待處理之語系檔
            editor.showErrorTip = () => {}

            //unbindListener, vditor物件已建立(語系檔已載入或頁面自備語系, init已執行)而初始化未完成時, 解除建立所見即所得編輯區時綁定之window scroll監聽;
            //lute於銷毀後才送達時vditor仍會initUI並呼叫after, 由onEditorReady補做完整銷毀(含initUI綁定之resize監聽);
            //設定錯誤使vditor於init或initUI中途拋錯時, 未保存之所見即所得編輯區(或自建構式拋錯而未取得之vditor)與已綁定之resize監聽無從釋放, 見spec/流程_編輯器載入與關閉.md〈已知落差〉
            let w = get(editor, 'vditor.wysiwyg', null)
            if (w && isfun(w.unbindListener)) {
                w.unbindListener()
            }

        },

        loadValue: function(clearStack) {
            //以當前value載入編輯器, 供初始化與父層變更value共用

            let vo = this

            //value, null與undefined視為空字串, 其他非字串轉為字串, 避免vditor將null轉為字面文字顯示並回拋
            let value = toMarkdown(vo.value)

            //setValue, clearStack=true時清空復原堆疊並以載入之內容為復原起點
            vo.contentEditor.setValue(value, clearStack)

            //紀錄載入後內容(經lute正規化), 載入後尚未回拋
            vo.valueLoadedMd = vo.contentEditor.getValue()
            vo.valueEmittedLast = null

            //editedAfterLoad, 重設復原起點時歸零; 保留復原歷史時堆疊內含使用者之編輯, 之後之載入亦須保留
            vo.editedAfterLoad = !clearStack

        },

        applyEditable: function() {
            //依editable套用唯讀或可編輯, 供就緒時與父層變更editable時共用

            let vo = this

            //check, 編輯器未就緒時不處理, 就緒時onEditorReady會套用當下之editable
            if (vo.stage !== 'ready') {
                return
            }

            //enable
            if (vo.editable) {
                vo.unwatchLock()
                vo.contentEditor.enable()
                return
            }

            //disabled
            vo.contentEditor.disabled()

            //blurEditor, 焦點位於編輯區內時使其失焦, 鎖定後之鍵盤操作回到頁面; 此時唯讀尚未套用, vditor照常保存選取範圍並呼叫settings.blur
            vo.blurEditor()

            //check, settings.blur可能於回呼內銷毀組件或切換editable
            if (vo.stage !== 'ready' || vo.editable) {
                return
            }

            //hideHint, 唯讀期間不可經提示區插入
            vo.hideHint()

            //watchLock, 唯讀期間維持唯讀, 建立後即為唯讀已套用
            vo.watchLock()

            //blurEditor, vditor之失焦處理於選取不在編輯區內且無保存範圍時會拉回焦點(vditor/src/ts/util/selection.ts:17), 唯讀已套用後再確認一次(此時失焦已不交vditor處理)
            vo.blurEditor()

        },

        blurEditor: function() {
            //令編輯區內持有焦點者(編輯區本身或其內之連結、核取方塊、表格等)失焦

            let vo = this

            let ele = vo.getEditorElement()
            let ae = document.activeElement
            if (isEle(ele) && isEle(ae) && ele.contains(ae)) {
                ae.blur()
            }

        },

        releaseFocus: function() {
            //唯讀已套用期間令編輯區內非以鍵盤取得之焦點失焦, 由guardLock延後呼叫

            let vo = this

            //check
            if (vo.stage !== 'ready' || !vo.isLockApplied()) {
                return
            }

            //blur, 期間若改以鍵盤移動焦點(:focus-visible)則保留
            let ele = vo.getEditorElement()
            let ae = document.activeElement
            if (isEle(ele) && isEle(ae) && ele.contains(ae) && !ae.matches(':focus-visible')) {
                ae.blur()
            }

        },

        isLockApplied: function() {
            //唯讀是否已套用: lockObserver只由applyEditable之鎖定分支於失焦後建立、解鎖分支與銷毀時移除, 故lockObserver非null即stage為ready且鎖定分支已完成失焦
            let vo = this
            return vo.lockObserver !== null
        },

        guardLock: function(e) {
            //唯讀期間攔截vditor之處理(由fLockGuard於組件根capture階段呼叫), vditor之點擊、按鍵、焦點與輸入處理皆不檢查唯讀:
            //點擊核取方塊會勾選並回拋(vditor/src/ts/wysiwyg/index.ts:412-423、ir/index.ts:140-147), 點擊圖片會開啟可編輯之圖片彈窗(wysiwyg/index.ts:427-433),
            //點擊內容下方空白處會新增空段落(wysiwyg/index.ts:450-463、ir/index.ts:191-204, 解鎖後之輸入會落入該段);
            //焦點位於編輯區內時按鍵處理與快捷鍵會改動內容並回拋(util/editorCommonEvent.ts:116-230), 其內之表單控制項(程式碼複製鈕之textarea、HTML區塊之input)之輸入會經vditor回拋(wysiwyg/index.ts:332、ir/index.ts:119);
            //編輯區失焦時經getEditorRange拉回焦點(util/editorCommonEvent.ts:41-57、util/selection.ts:17), 使Tab鍵、頁面程式聚焦或點擊他處無法移走焦點;
            //停用中之標題鈕先清除渲染計時器才檢查停用(toolbar/Headings.ts:35-38), 會使鎖定前最後輸入不再回拋
            //點擊與按鍵類事件以prop判斷(父層一鎖定即防護), 焦點與輸入類事件以唯讀已套用判斷(鎖定時之失焦與組字提交仍交vditor)

            let vo = this

            //check
            if (vo.stage !== 'ready') {
                return
            }
            let t = e.target
            if (!isEle(t)) {
                return
            }
            let type = e.type
            let applied = vo.isLockApplied()
            let locked = !vo.editable || applied

            //toolbar, 停用中之工具列按鈕不交由vditor處理(含鍵盤Enter、空白鍵觸發之click)
            if (type === 'click' || type === 'touchstart') {
                let btn = t.closest('.vditor-toolbar button')
                if (isEle(btn) && vo.$el.contains(btn)) {
                    if (locked && btn.classList.contains('vditor-menu--disabled')) {
                        if (type === 'click') {
                            e.preventDefault()
                        }
                        e.stopPropagation()
                    }
                    return
                }
            }

            //check, 以下僅處理當前模式編輯區內之事件
            let ele = vo.getEditorElement()
            if (!isEle(ele) || !ele.contains(t)) {
                return
            }

            //keydown、keyup, 不交由vditor處理, 不阻止瀏覽器預設行為(Tab移動焦點、方向鍵捲動、Enter開啟連結、複製)
            if (type === 'keydown' || type === 'keyup') {
                if (locked) {
                    e.stopPropagation()
                }
                return
            }

            //click, 核取方塊(含鍵盤空白鍵觸發之click)、圖片、內容下方空白處(點擊對象為編輯區本身)不交由vditor處理, 連結照常由vditor開啟
            if (type === 'click') {
                if (locked && (t.tagName === 'INPUT' || t.tagName === 'IMG' || t === ele)) {
                    e.preventDefault()
                    e.stopPropagation()
                }
                return
            }

            //input、compositionstart、compositionend、drop, 編輯區內表單控制項之輸入不交由vditor處理, 控制項本身照常(不屬markdown內容)
            if (type === 'input' || type === 'compositionstart' || type === 'compositionend' || type === 'drop') {
                if (applied) {
                    e.stopPropagation()
                }
                return
            }

            //focus、blur
            if (type === 'focus' || type === 'blur') {

                //check
                if (!applied) {
                    return
                }

                //編輯區本身之焦點變化不交由vditor處理(避免失焦時拉回焦點), 改由組件呼叫settings.focus、settings.blur, 同原生readonly照常通知;
                //子元素之focus、blur不冒泡而不會觸發vditor之處理, 不攔截以免干擾內容中元素自身之處理
                if (t === ele) {
                    e.stopPropagation()
                    let opt = get(vo, ['contentEditor', 'vditor', 'options'], null)
                    let f = get(opt, type, null)
                    if (isfun(f)) {
                        f.call(opt, vo.contentEditor.getValue()) //依vditor原呼叫方式(vditor/src/ts/util/editorCommonEvent.ts:23、:54)以合併後之設定為接收者
                    }
                }

                //focus, 非以鍵盤取得之焦點(滑鼠、觸控、右鍵、拖曳等, 不符:focus-visible)不留在唯讀之編輯區內, 延後失焦以免干擾進行中之指標操作;
                //以Tab鍵取得之焦點保留, 供捲動、聚焦連結、表格與程式碼區塊
                if (type === 'focus' && !t.matches(':focus-visible')) {
                    setTimeout(() => {
                        vo.releaseFocus()
                    }, 0)
                }

            }

        },

        watchLock: function() {
            //唯讀期間以MutationObserver監看組件內之class與contenteditable, 被重新啟用時即改回唯讀

            let vo = this

            //check, 組件已銷毀(例如settings.blur回呼內銷毀)時不建立
            if (vo.stage !== 'ready') {
                return
            }

            //lockTypes, 鎖定當下已停用之工具列項目
            vo.lockTypes = [...vo.$el.querySelectorAll('.vditor-toolbar button[data-type].vditor-menu--disabled')].map((ele) => {
                return ele.getAttribute('data-type')
            })

            //check
            if (vo.lockObserver) {
                return
            }

            //lockObserver, 回呼於同一微任務檢查點執行, 畫面上不會出現被重新啟用之狀態
            vo.lockObserver = new MutationObserver(() => {
                vo.enforceLock()
            })
            vo.lockObserver.observe(vo.$el, { subtree: true, attributes: true, attributeFilter: ['class', 'contenteditable'] })

        },

        unwatchLock: function() {
            //停止唯讀監看

            let vo = this

            if (vo.lockObserver) {
                vo.lockObserver.disconnect()
                vo.lockObserver = null
            }
            vo.lockTypes = []

        },

        enforceLock: function() {
            //唯讀期間維持唯讀: vditor於延後寫入復原堆疊時一律啟用復原鈕(vditor/src/ts/undo/index.ts:130-132),
            //切換編輯模式時啟用編輯類工具列與新模式之編輯區(vditor/src/ts/toolbar/EditMode.ts:44), 皆於此改回唯讀

            let vo = this

            //check
            if (vo.stage !== 'ready' || vo.editable) {
                return
            }

            //editableEle, 當前模式之編輯區是否可編輯
            let ele = vo.getEditorElement()
            let editableEle = isEle(ele) && ele.getAttribute('contenteditable') !== 'false'

            //enabledBtn, 鎖定當下已停用之工具列項目是否被重新啟用
            let enabledBtn = vo.lockTypes.some((t) => {
                let b = vo.$el.querySelector(`.vditor-toolbar button[data-type="${t}"]`)
                return isEle(b) && !b.classList.contains('vditor-menu--disabled')
            })

            //disabled, 已全部停用時不呼叫, 避免其屬性寫入再觸發監看
            if (editableEle || enabledBtn) {
                vo.contentEditor.disabled()
            }

        },

        hideHint: function() {
            //關閉提示區: BuildPopper之updateValue於唯讀時不動作(w-component-vue/src/js/buildPopper.mjs:465),
            //故直接設定showPopper後以displayPopper同步popper狀態(唯讀或showPopper=false時即隱藏, buildPopper.mjs:414)

            let vo = this

            //check
            if (!vo.showPopper) {
                return
            }

            //hide
            vo.showPopper = false
            vo.useHint = ''
            let f = get(vo, 'bp.displayPopper')
            if (isfun(f)) {
                vo.bp.displayPopper('hideHint')
            }

        },

        removeExportPdf: function() {
            let vo = this

            //vditor之Export.ts把Markdown、PDF、HTML三個子項寫死於panelElement.innerHTML, 無設定可挑選,
            //而PDF匯出會於iframe內重建vditor環境, 額外由cdn取得dist/index.css、dist/method.min.js、
            //js/i18n/zh_CN.js(固定zh_CN, 不隨options.lang)與hljs樣式共4項, 內網無法取得,
            //故於toolbar渲染完成後直接移除該子項

            //vditorExportIframe, 僅供PDF匯出且高度為0而不可見(vditor/src/ts/ui/initUI.ts:76-78), PDF匯出已移除, 移出Tab鍵順序,
            //避免唯讀時以Tab鍵離開編輯區後焦點落在看不見之元素(可編輯時Tab鍵由vditor插入定位字元而不會到達)
            let ifr = null
            try {
                ifr = vo.$el.querySelector('iframe#vditorExportIframe')
            }
            catch (err) {}
            if (isEle(ifr)) {
                ifr.setAttribute('tabindex', '-1')
            }

            let n = 0
            let t = setInterval(() => {
                n++

                //check, 組件已銷毀時解除
                if (vo.stage === 'destroyed') {
                    clearInterval(t)
                    return
                }

                //ele, 限定於本組件內查找, 避免影響同頁其他實例
                let ele = null
                try {
                    ele = vo.$el.querySelector('.vditor-toolbar button[data-type="pdf"]')
                }
                catch (err) {}

                //remove
                if (isEle(ele)) {
                    clearInterval(t)
                    ele.remove()
                    return
                }

                //check, 逾時跳出, 不影響其他功能
                if (n > 40) {
                    clearInterval(t)
                }

            }, 50)

        },

        funGetDivTrigger: function() {
            let vo = this
            let divTrigger = null
            try {
                divTrigger = vo.$el.querySelector('[class="vditor-hint"]')
            }
            catch (err) {}
            return divTrigger
        },

        funGetDivContent: function() {
            let vo = this
            let divContent = get(vo, '$refs.divContent', null)
            return divContent
        },

        findAnchor: function() {
            let vo = this

            let pm = genPm()

            let n = 0
            let t = setInterval(() => {
                n++

                //check, 非ready(例如組件已銷毀)時停止輪詢, 回傳null由呼叫端略過
                if (vo.stage !== 'ready') {
                    clearInterval(t)
                    pm.resolve(null)
                    return
                }

                //funGetDivTrigger
                let ele = vo.funGetDivTrigger()

                //check
                if (isEle(ele)) {
                    clearInterval(t)
                    pm.resolve(ele)
                }

                //check
                if (n > 100) {
                    clearInterval(t)
                    pm.reject('can not find the ele')
                }

            }, 50)

            return pm
        },

        getUseHint: function(divTrigger) {
            // let vo = this

            //tpht
            let tpht = ''
            try {
                tpht = divTrigger.querySelector('div[name="tar"]').getAttribute('tpht')
            }
            catch (err) {}

            return tpht
        },

        detectAndShowHint: function(v) {
            let vo = this

            //check
            if (!isearr(vo.keyHints)) {
                return
            }

            //findAnchor
            vo.findAnchor()
                .then((divTrigger) => {
                    // console.log('divTrigger', divTrigger)

                    //check, 輪詢期間組件已銷毀或已被鎖定時不顯示提示區
                    if (!isEle(divTrigger) || vo.stage !== 'ready' || !vo.editable) {
                        return
                    }

                    //check
                    if (divTrigger.style.display === 'none') {
                        return
                    }
                    // console.log('divTrigger', divTrigger)

                    //完全透明
                    // divTrigger.style.opacity = 0 //因顯示之後再偵測隱藏會有顯隱問題, 使用者體驗不佳, 改為使用css強制隱藏

                    //顯示時取得與儲存useHint
                    vo.useHint = vo.getUseHint(divTrigger)
                    // console.log('divTrigger', divTrigger, 'useHint', vo.useHint)

                    //evShow, 第1參數為buildPopper之mode(需等於data.mode才會顯示), 非kind
                    vo.evShow('popup', 'call')

                    //blur, 編輯器移除焦點, 避免使用者此時通過鍵盤刪除或再變更
                    vo.contentEditor.blur()

                })
                .catch((err) => {
                    console.log(err)
                })

        },

        evShow: function(kind, from) {
            let vo = this
            let f = get(vo, 'bp.evShow')
            if (isfun(f)) {
                vo.bp.evShow(kind, from)
            }
        },

        evHide: function(kind, from) {
            let vo = this
            let f = get(vo, 'bp.evHide')
            if (isfun(f)) {
                vo.bp.evHide(kind, from)
            }
        },

        updatePopper: function(msg, from) {
            let vo = this
            let f = get(vo, 'bp.updatePopper')
            if (isfun(f)) {
                vo.bp.updatePopper(msg, from)
            }
        },

        updateValue: function(value, from) {
            let vo = this
            let f = get(vo, 'bp.updateValue')
            if (isfun(f)) {
                vo.bp.updateValue(value, from)
            }
        },

        getEditorElement: function() {
            //當前編輯模式之編輯區元素
            let vo = this
            let mode = vo.contentEditor.getCurrentMode()
            return get(vo, ['contentEditor', 'vditor', mode, 'element'], null)
        },

        getHintRange: function() {
            //取得提示區之插入位置: 提示區開啟時編輯區已失焦, 文件選取範圍仍位於編輯區內時取之, 否則取vditor於失焦時保存之範圍(vditor/src/ts/util/editorCommonEvent.ts:52)

            let vo = this

            let ele = vo.getEditorElement()
            if (!isEle(ele)) {
                return null
            }
            let sel = window.getSelection()
            if (sel && sel.rangeCount > 0 && ele.contains(sel.getRangeAt(0).startContainer)) {
                return sel.getRangeAt(0).cloneRange()
            }
            let r = get(vo, ['contentEditor', 'vditor', vo.contentEditor.getCurrentMode(), 'range'], null)
            if (r && ele.contains(r.startContainer)) {
                return r.cloneRange()
            }
            return null
        },

        removeHintTrigger: function(range) {
            //移除插入位置前本次輸入之觸發字串(同vditor自身提示之作法, vditor/src/ts/hint/index.ts:171-172), 回傳移除後之插入位置;
            //只檢查游標前緊鄰之文字, 不以全文搜尋, 避免誤刪他處之相同字串(例如觸發字串為@而後文含email); 游標已移離觸發字串時回傳原位置而只插入

            let vo = this

            //check
            if (!range || !range.collapsed || !isestr(vo.useHint)) {
                return range
            }

            //node, 插入位置位於元素邊界時改取其前之文字節點
            let node = range.startContainer
            let off = range.startOffset
            if (node.nodeType === 1 && off > 0 && node.childNodes[off - 1] && node.childNodes[off - 1].nodeType === 3) {
                node = node.childNodes[off - 1]
                off = node.data.length
            }

            //remove
            let len = vo.useHint.length
            if (node.nodeType === 3 && off >= len && node.data.substring(off - len, off) === vo.useHint) {
                let r = document.createRange()
                r.setStart(node, off - len)
                r.setEnd(node, off)
                r.deleteContents()
                return r
            }

            return range
        },

        insertValue: function(v, from) {
            //由提示區插入v, v以HTML片段插入(vditor/src/index.ts:278-280)

            let vo = this

            //check, 唯讀或編輯器未就緒時不插入並關閉提示區(提示區可能於鎖定前開啟, 或呼叫端於非同步流程後才呼叫funInsert)
            if (vo.stage !== 'ready' || !vo.editable) {
                vo.hideHint()
                return
            }

            //range, 插入位置並移除其前本次輸入之觸發字串
            let range = vo.removeHintTrigger(vo.getHintRange())

            //selection, 將游標設於插入位置並聚焦編輯區, 供vditor於此插入且插入後可接續輸入
            if (range) {
                let ele = vo.getEditorElement()
                ele.focus()
                let sel = window.getSelection()
                sel.removeAllRanges()
                sel.addRange(range)
            }

            //insertValue, 由vditor插入並經其正常之輸入流程回拋(st.input內記錄最後回拋值與已編輯), 插入後游標位於插入內容之後
            vo.contentEditor.insertValue(v)

        },

    },
}
</script>

<style scoped>
.WPopperFix[data-popper-reference-hidden] {
    visibility: hidden;
    pointer-events: none;
}
.WVditorFix >>> .vditor-reset {
    font-size: inherit;
}
.WVditorFix >>> div.vditor-hint:has(div[name="tar"]) { /* 使觸發區divTrigger(原本彈窗)完全透明 */
    visibility: hidden;
    pointer-events: none;
    outline: none;
}
</style>

