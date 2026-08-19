import fs from 'fs'
import _ from 'lodash-es'
import w from 'wsemi'
import getFiles from 'w-package-tools/src/getFiles.mjs'
import cleanFolder from 'w-package-tools/src/cleanFolder.mjs'
import parseVueCode from 'w-package-tools/src/parseVueCode.mjs'
import extractHtml from 'w-package-tools/src/extractHtml.mjs'
import kebabPropsVueTemp from 'w-package-tools/src/kebabPropsVueTemp.mjs'


let fdSrc = './src/'
let fdTestHtml = './test-html/'
let fdTestSrc = './test-action/'


function writeHtml(v) {

    function getAppTmp() {
        //產出之html為in-DOM template, 瀏覽器解析時會將屬性名小寫化(:keyHint => :keyhint)而對不上camelCase的prop,
        //故須先將binding屬性轉為kebab-case(:keyHint => :key-hint), 僅作用於template不影響head與script
        return kebabPropsVueTemp(v.tmp)
    }

    function procHtml(h) {

        //change cmp name
        h = w.replace(h, 'WVditorVue', 'w-vditor-vue')

        return h
    }

    //opt
    let opt = {
        title: `example for ${v.casename}`,
        head: `
    
        <!-- extractHtml已自動添加@babel/polyfill與vue -->
    
        <!-- w-vditor-vue -->
        <script src="../dist/w-vditor-vue.umd.js"></script>
        
        <!-- w-jsonview-tree -->
        <script src="https://cdn.jsdelivr.net/npm/w-jsonview-tree@latest/dist/w-jsonview-tree.umd.js"></script>
        <script>
            let jv=window['w-jsonview-tree']
        </script>
    
        <style>
            .item-link {
                display: inline-block;
                margin: 10px 10px 0px 0px;
                padding: 5px 10px;
                font-size: 0.8rem;
                color: #fff;
                background-color: #443a65;
                cursor: pointer;
                text-decoration: none;
            }
            .bkh { /* 寬 */
                padding:20px;
            }
            @media screen and (max-width:800px){ /* 中 */
                .bkh {
                    padding:10px;
                }
            }
            @media screen and (max-width:400px){ /* 窄 */
                .bkh {
                    padding:5px;
                }
            }
            .bkp { /* 寬 */
                padding:0px 20px;
            }
            @media screen and (max-width:800px){ /* 中 */
                .bkp {
                    padding:0px 10px;
                }
            }
            @media screen and (max-width:400px){ /* 窄 */
                .bkp {
                    padding:0px 5px;
                }
            }
            .cpitem {
                transition: all 0.3s;
                padding: 5px 15px;
                cursor: pointer;
            }
            .cpitem-white {
                background: #fff;
            }
            .cpitem-white:hover {
                background: #eee;
            }
            .cpitem-black {
                background: #333;
            }
            .cpitem-black:hover {
                background: #555;
            }
        </style>
    
        `,
        appTag: `div`,
        appClass: `bkh`,
        appStyle: ``,
        appTmp: getAppTmp(),
        installVue: `Vue.component('w-vditor-vue', window['w-vditor-vue'])`,
        newVue: ``,
        data: v.data,
        mounted: v.mounted,
        computed: v.computed,
        methods: v.methods,
        action: v.action,
        procHtml,
        fpHtml: `${fdTestHtml}${v.fn}.html`,
        fpAction: `${fdTestSrc}${v.fn}.action.json`,
    }

    //extractHtml
    extractHtml(opt)

}


function extractApp(fn) {

    //casename
    let tfn = fn.replace('App', '')
    tfn = tfn.replace('.vue', '')
    let casename = _.toLower(tfn[0]) + w.strdelleft(tfn, 1)

    //read
    let hh = fs.readFileSync(fdSrc + fn, 'utf8')

    //parseVueCode
    let { tmp, data, mounted, computed, methods, action } = parseVueCode(hh)

    //writeHtml
    writeHtml({
        fn: `ex-${casename}`,
        casename,
        tmp,
        data,
        mounted,
        computed,
        methods,
        action,
    })

}


function main() {
    //由jsdoc產製之wsemi.html, 自動添加將example轉換成codepen線上編輯功能

    //cleanFolder
    cleanFolder(fdTestHtml)
    //cleanFolder(fdTestSrc)

    //getFiles
    let ltfs = getFiles(fdSrc)

    //filter
    ltfs = _.filter(ltfs, function(v) {
        return v.indexOf('App') >= 0
    })
    _.pull(ltfs, 'App.vue')
    //console.log(ltfs)

    //extractApp
    _.each(ltfs, function(v) {
        console.log('extracting: ' + fdSrc + v)
        extractApp(v)
    })

}
main()
