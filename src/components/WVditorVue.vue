<template>
    <div
        :changeValue="changeValue"
        :changeEditable="changeEditable"
        :changeShowPopper="changeShowPopper"
    >

        <WIconLoading v-if="loading"></WIconLoading>

        <div
            class="WVditorFix"
            :style="`${loading?'heigh:0px; max-height:0px; overflow-y:hidden;':''}`"
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
import isestr from 'wsemi/src/isestr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
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
 * @vue-prop {String} [value=''] 輸入markdown字串，可使用v-model雙向綁定，預設為''
 * @vue-prop {Number} [height=400] 輸入編輯器高度數字，單位為px，預設為400
 * @vue-prop {Object} [settings={}] 輸入vditor設定物件，會覆蓋組件內建預設值，內建預設值詳見原始碼處def_settings，各設定項詳見vditor官方文件
 * @vue-prop {String} [settings.mode='wysiwyg'] 輸入編輯模式字串，可選'sv'(雙欄位)、'ir'(即時渲染)、'wysiwyg'(所見即所得)，預設為'wysiwyg'
 * @vue-prop {String} [settings.lang='zh_TW'] 輸入語系字串，可選'zh_CN'、'zh_TW'、'en_US'、'ja_JP'、'ko_KR'、'ru_RU'、'sv_SE'、'fr_FR'、'pt_BR'，預設為'zh_TW'
 * @vue-prop {String} [settings.theme='classic'] 輸入編輯器主題字串，可選'classic'、'dark'，預設為'classic'
 * @vue-prop {String} [settings.cdn='https://unpkg.com/vditor@[版本]'] 輸入vditor執行期動態載入資源(lute、i18n、icons、katex等)之來源位置字串，該位置之下需有dist資料夾，預設為vditor內建之unpkg位置
 * @vue-prop {Object} [settings.i18n=null] 輸入自訂語系物件，給予後vditor將不再下載i18n語系檔，供內網部署時減少依賴，預設為null代表由settings.cdn下載對應settings.lang之語系檔
 * @vue-prop {String} [settings.icon='ant'] 輸入工具列圖示組字串，可選'ant'、'material'，圖示檔由settings.cdn下載，預設為'ant'
 * @vue-prop {Array} [settings.toolbar=['詳見原始碼']] 輸入工具列項目陣列，預設詳見原始碼處def_settings->toolbar
 * @vue-prop {String} [settings.placeholder=''] 輸入編輯器無內容時顯示之提示字串，預設為''
 * @vue-prop {String|Array} [keyHint=''] 輸入打字時調用提示區之完整觸發字串或其陣列，例如給予'/ht'則輸入「/ht」即顯示提示區，亦可給予'@'、'/ht'等任意字串，或給予['/ht','/kw']陣列註冊多組，給予''則不啟用提示區，預設為''。觸發字串須位於行首或其前方為空白字元方會生效，且點選提示項目後該觸發字串會由內容中移除
 * @vue-prop {Number} [hintTimeDetect=100] 輸入偵測提示區之debounce時間數字，單位為ms，預設100。因vditor之編輯回調options.input為debounce機制，打字時每次按鍵皆重新計時，停止打字後才觸發，而提示區偵測與value回拋皆由該回調驅動，故此值即為打完keyHint後至提示區出現之延遲，亦為v-model同步之延遲；vditor原生預設為800ms，另因其同時決定undo還原點之合併粒度，給予過小值會使undo變得瑣碎
 * @vue-prop {String} [hintBackgroundColor='#fff'] 輸入提示窗背景顏色字串，預設'#fff'
 * @vue-prop {Boolean} [hintShadow=true] 輸入提示窗是否顯示陰影布林值，預設true
 * @vue-prop {String} [hintShadowStyle='0 5px 5px -3px rgba(0,0,0,.2), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12)'] 輸入提示窗陰影樣式字串，預設'0 5px 5px -3px rgba(0,0,0,.2), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12)'
 * @vue-prop {Number} [cmpZIndex=3000] 輸入提示窗使用z-index數字，預設3000
 * @vue-prop {Boolean} [editable=true] 輸入是否為編輯模式布林值，給予false則編輯器為唯讀，預設true
 * @vue-event {String} input 當使用者於編輯器內輸入文字，或由提示區點選插入內容時發射，帶出當前markdown字串，供v-model接收
 * @vue-slot {Object} content 提示區內容之渲染slot，需搭配keyHint使用，slot props為{ hint, funInsert, funHide }，hint為當前觸發之keyHint字串，funInsert(v)為插入字串v至編輯器游標處之函數，funHide()為隱藏提示區之函數
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

            loading: true,
            disposal: false,

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

            contentEditor: null,

            showPopper: false,
            placement: 'bottom-start', //定位左下
            placementDistX: 0,
            placementDistY: -15,

            valueTrans: '',

            useHint: '',

        }
    },
    mounted: function() {
        //console.log('mounted')

        let vo = this

        let core = async() => {

            //wait $el
            await waitFun(() => {
                return vo.$el !== undefined
            })

            //wait divVditor, 因loading=false之後才能開始顯示divVditor, 故須等待divVditor是否出現, 組件銷毀時divVditor已被移除, 亦須解除等待
            await waitFun(() => {
                if (vo.disposal) {
                    return true
                }
                let ele = get(vo, '$refs.divVditor')
                return isEle(ele)
            })

            //check, 組件已銷毀(如彈窗於編輯器初始化完成前被關閉)時跳出, 避免於銷毀後建立Vditor實例
            if (vo.disposal) {
                return
            }

            //divVditor
            let divVditor = vo.$refs.divVditor
            // console.log('divVditor', divVditor)

            //contentEditor
            vo.contentEditor = new Vditor(divVditor, vo.useSettings)
            // console.log('contentEditor', vo.contentEditor)

            //wait contentEditor, 因new Vditor後會需一小段時間初始化, 故須等待vditor來判斷vditor是否初始化完成, 組件銷毀時contentEditor會被設null, 亦須解除等待
            await waitFun(() => {
                // let getCurrentMode = get(vo, 'contentEditor.getCurrentMode') //因contentEditor.getCurrentMode是原型已為function, 故無法用此做判斷
                // return isfun(getCurrentMode)
                if (vo.disposal) {
                    return true
                }
                let v = get(vo, 'contentEditor.vditor')
                return iseobj(v)
            })
            // console.log(`vo.contentEditor.getCurrentMode()`, vo.contentEditor.getCurrentMode())

            //check, 組件已銷毀(如彈窗於編輯器初始化完成前被關閉)時跳出, 避免呼叫contentEditor.setValue報錯
            if (vo.disposal) {
                return
            }

            //removeExportPdf, 於toolbar渲染完成後移除export之PDF子項
            vo.removeExportPdf()

            //loading, 組件不依照loading顯隱, loading為依賴、組件完成載入、組件初始化後才改為false
            vo.loading = false

            //update valueTrans, 於mounted進行第1次賦值觸發, 故直接更新valueTrans, 避免emit出去再進來更新
            vo.valueTrans = vo.value

            //setValue, 於mounted進行第1次賦值, 之後給computed偵測修改
            vo.contentEditor.setValue(vo.value)

            // //emit, 於組件內初始化第一次觸發故不須emit
            // vo.$emit('input', value)

        }

        //core
        core()
            .catch((err) => {
                console.log(err)
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

        //disposal, 供背景async流程(mounted core、relaEditable core)偵測解除等待, 不可用contentEditor===null判別已銷毀, 因contentEditor初始即null無法區分尚未建立與已銷毀
        vo.disposal = true

        //destroy
        if (vo.contentEditor) {
            vo.contentEditor.destroy()
            vo.contentEditor = null
        }

        //destroy
        if (vo.bp) {
            vo.bp.destroy()
        }

    },
    computed: {

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
            st.hint.extend = extend
            // console.log('st.hint.extend', st.hint.extend)

            //add input
            st.input = (value) => {
                // console.log(vo.mmkey, 'input', value)

                //update valueTrans, 由組件內input觸發, 故直接更新valueTrans, 避免emit出去再進來更新
                vo.valueTrans = value

                //detectAndShowHint
                vo.detectAndShowHint(value)

                //emit
                vo.$emit('input', value)

            }

            // console.log('st', st)
            return st
        },

        changeValue: function() {
            // console.log('computed changeValue')

            let vo = this

            //trigger
            let value = vo.value

            //relaValue
            vo.relaValue(value)

            return ''
        },

        changeEditable: function() {
            //console.log('computed changeEditable')

            let vo = this

            //trigger
            let editable = vo.editable

            //relaEditable
            vo.relaEditable(editable)

            return ''
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

            let vo = this

            //check
            //避免使用waitFun, 因多組件value非同步更新, 會導致打字時或hint時連動觸發更新value問題
            //第1次調用value為空字串, 第2次loading可能為true, 此處統一處理loading=false情形
            if (vo.loading) {
                return
            }

            //check, 避免多組件時使用hint會反覆觸發
            if (vo.value === vo.valueTrans) {
                return
            }

            //update valueTrans, 由組件外變更value觸發, 故須再另外儲存至valueTrans
            vo.valueTrans = vo.value

            //setValue
            vo.contentEditor.setValue(vo.value)

            // //emit, 由外部變更value觸發故不須emit
            // vo.$emit('input', value)

        },

        relaEditable: function() {

            let vo = this

            async function core() {

                //wait, 組件銷毀時loading不會再變false, 亦須解除等待
                await waitFun(() => {
                    return !vo.loading || vo.disposal
                })

                //check, 組件已銷毀(如彈窗於編輯器初始化完成前被關閉)時跳出, 避免呼叫contentEditor.enable報錯
                if (vo.contentEditor === null || vo.disposal) {
                    return
                }

                //editable
                if (vo.editable) {
                    vo.contentEditor.enable()
                }
                else {
                    vo.contentEditor.disabled()
                }

            }

            //core
            core()
                .catch((err) => {
                    console.log(err)
                })

        },

        removeExportPdf: function() {
            let vo = this

            //vditor之Export.ts把Markdown、PDF、HTML三個子項寫死於panelElement.innerHTML, 無設定可挑選,
            //而PDF匯出會於iframe內重建vditor環境, 額外由cdn取得dist/index.css、dist/method.min.js、
            //js/i18n/zh_CN.js(固定zh_CN, 不隨options.lang)與hljs樣式共4項, 內網無法取得,
            //故於toolbar渲染完成後直接移除該子項
            let n = 0
            let t = setInterval(() => {
                n++

                //check, 組件已銷毀時解除
                if (vo.disposal) {
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

        insertValue: function(v, from) {
            let vo = this
            let f = get(vo, 'contentEditor.insertValue')
            if (isfun(f)) {

                //insertValue
                vo.contentEditor.insertValue(v)

                //取得當前value
                let value = vo.contentEditor.getValue()

                //移除觸發用之keyHint字串
                //useHint為本次實際觸發之keyHint(由divTrigger內tar元素之tpht屬性取得), 只移除它,
                //不可迭代全部keyHints, 否則多keyHint時會誤刪內文中其他keyHint之字樣
                //另僅移除最後一次出現者, 因該處才是本次所打入的, 不可用replaceAll以免誤刪內文中相同字串
                // console.log('value(ori)', value)
                if (isestr(vo.useHint)) {
                    let ind = value.lastIndexOf(vo.useHint)
                    if (ind >= 0) {
                        value = value.substring(0, ind) + value.substring(ind + vo.useHint.length)
                    }
                }
                // console.log('value(replace)', value)

                //update valueTrans, 由組件內insertValue觸發, 故直接更新valueTrans, 避免emit出去再進來更新
                vo.valueTrans = vo.value

                //setValue
                vo.contentEditor.setValue(value)

                //emit
                vo.$emit('input', value)

            }
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

