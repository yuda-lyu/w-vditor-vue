<template>
    <div>

        <div class="bkh">
            <div style="font-size:1.5rem;">settings</div>
            <a href="//yuda-lyu.github.io/w-vditor-vue/examples/ex-settings.html" target="_blank" class="item-link">example</a>
            <a href="//github.com/yuda-lyu/w-vditor-vue/blob/master/docs/examples/ex-settings.html" target="_blank" class="item-link">code</a>
        </div>

        <div class="bkp">

            <div style="font-size:0.9rem; color:#666; padding-bottom:10px;">* settings為vditor原生設定, 會覆蓋組件內建預設值, 各設定項詳見
                <a href="//b3log.org/vditor/" target="_blank" rel="noreferrer noopener">vditor</a> 官方文件
            </div>

            <div style="display:flex; flex-wrap:wrap; padding-bottom:40px;">

                <div style="width:620px; max-width:100%;">

                    <WVditorVue
                        :height="300"
                        :settings="settings"
                        v-model="content"
                    ></WVditorVue>

                </div>

                <div style="padding:0px 20px;">

                    <div style="font-size:0.8rem; color:#666; padding-bottom:5px;">settings</div>
                    <div style="border:1px solid #ddd; width:400px; max-width:100%; height:300px; overflow:auto;">
                        <div style="padding-left:5px;">
                            <div id="optjson" style="font-size:10pt;"></div>
                        </div>
                    </div>

                </div>

            </div>

        </div>

    </div>
</template>

<script>
import WVditorVue from './components/WVditorVue.vue'
import jv from 'w-jsonview-tree'

export default {
    components: {
        WVditorVue,
    },
    data: function() {
        return {
            'content': '# w-vditor-vue\n\nabc中文123，一個包裝 vditor 的 Vue 2 編輯器組件。\n\n## 文字樣式\n\n**粗體**、*斜體*、~~刪除線~~，以及連結 [google](//www.google.com/)。\n\n## 清單\n\n- 無序項目\n- 支援巢狀\n    - 子項目\n\n1. 有序項目\n2. 第二項\n\n## 引用與分隔線\n\n> 三種編輯模式：所見即所得（wysiwyg）、即時渲染（ir）、分屏預覽（sv）。\n\n---\n\n## 表格\n\n| 屬性 | 說明 | 預設 |\n| --- | --- | --- |\n| value | markdown 字串 | 空字串 |\n| height | 編輯器高度（px） | 250 |\n| keyHint | 提示區觸發字串 | 空字串 |\n',
            'settings': {
                mode: 'ir',
                lang: 'en_US',
                placeholder: 'type something...',
                counter: {
                    enable: true,
                    type: 'markdown',
                },
                toolbar: [
                    'headings',
                    'bold',
                    'italic',
                    'strike',
                    'link',
                    '|',
                    'list',
                    'ordered-list',
                    '|',
                    'quote',
                    'line',
                    'table',
                    '|',
                    'undo',
                    'redo',
                ],
            },
            'actions': [
            ],
        }
    },
    mounted: function() {
        let vo = this
        jv(vo.settings, document.querySelector('#optjson'), { expanded: true })
    },
}
</script>

<style>
</style>
