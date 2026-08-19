<template>
    <div>

        <div class="bkh">
            <div style="font-size:1.5rem;">fullWidth</div>
            <a href="//yuda-lyu.github.io/w-vditor-vue/examples/ex-fullWidth.html" target="_blank" class="item-link">example</a>
            <a href="//github.com/yuda-lyu/w-vditor-vue/blob/master/docs/examples/ex-fullWidth.html" target="_blank" class="item-link">code</a>
        </div>

        <div class="bkp">

            <div style="font-size:0.9rem; color:#666; padding-bottom:10px;">* 組件寬度由外層容器決定, 不給予寬度即為滿版</div>

            <div style="padding-bottom:40px;">

                <WVditorVue
                    :height="300"
                    v-model="content"
                ></WVditorVue>

            </div>

        </div>

    </div>
</template>

<script>
import WVditorVue from './components/WVditorVue.vue'

export default {
    components: {
        WVditorVue,
    },
    data: function() {
        return {
            'content': '# w-vditor-vue\n\nabc中文123，一個包裝 vditor 的 Vue 2 編輯器組件。\n\n## 文字樣式\n\n**粗體**、*斜體*、~~刪除線~~，以及連結 [google](//www.google.com/)。\n\n## 清單\n\n- 無序項目\n- 支援巢狀\n    - 子項目\n\n1. 有序項目\n2. 第二項\n\n## 引用與分隔線\n\n> 三種編輯模式：所見即所得（wysiwyg）、即時渲染（ir）、分屏預覽（sv）。\n\n---\n\n## 表格\n\n| 屬性 | 說明 | 預設 |\n| --- | --- | --- |\n| value | markdown 字串 | 空字串 |\n| height | 編輯器高度（px） | 250 |\n| keyHint | 提示區觸發字串 | 空字串 |\n',
            'actions': [
            ],
        }
    },
}
</script>

<style>
</style>
