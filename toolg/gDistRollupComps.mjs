import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'


let fdSrc = './src/components/'
let fdTar = './dist'


rollupFiles({
    fns: 'WVditorVue.vue',
    fdSrc,
    fdTar,
    format: 'umd',
    nameDistType: 'kebabCase',
    globals: {
        'vue': 'Vue',
    },
    external: [
        'vue',
    ],
})

