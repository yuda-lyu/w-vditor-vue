import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'


let fdSrc = './src/components/'
let fdTar = './dist'


rollupFiles({
    fns: 'WVditorVue.vue',
    fdSrc,
    fdTar,
    format: 'umd',
    //nameDistType: 'kebabCase',
    hookNameDist: () => {
        return 'w-vditor-vue'
    },
    globals: {
        'vue': 'Vue',
    },
    external: [
        'vue',
    ],
})

