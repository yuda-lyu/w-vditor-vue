import rollupVueToHtml from 'w-package-tools/src/rollupVueToHtml.mjs'


let opt = {
    title: `w-vditor-vue`,
    head: `

    <!-- rollupVueToHtml已自動添加@babel/polyfill與vue -->

    `,
    newVue: ``,
    globals: {
        'vue': 'Vue',
    },
    external: [
        'vue',
    ],
}
rollupVueToHtml('./src/App.vue', './docs/examples/app.html', opt)

