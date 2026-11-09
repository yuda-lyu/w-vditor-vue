# w-vditor-vue
A wrapper vditor for vue.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![language](https://img.shields.io/badge/vue-2.x-brightgreen.svg)](https://github.com/vuejs/vue) 
[![npm version](http://img.shields.io/npm/v/w-vditor-vue.svg?style=flat)](https://npmjs.org/package/w-vditor-vue) 
[![license](https://img.shields.io/npm/l/w-vditor-vue.svg?style=flat)](https://npmjs.org/package/w-vditor-vue) 
[![npm download](https://img.shields.io/npm/dt/w-vditor-vue.svg)](https://npmjs.org/package/w-vditor-vue) 
[![npm download](https://img.shields.io/npm/dm/w-vditor-vue.svg)](https://npmjs.org/package/w-vditor-vue) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-vditor-vue.svg)](https://www.jsdelivr.com/package/npm/w-vditor-vue)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-vditor-vue/module-WVditorVue.html).

## Example
To view some examples for more understanding, visit examples:

> **all examples:** [web](https://yuda-lyu.github.io/w-vditor-vue/examples/app.html) [[source code](https://github.com/yuda-lyu/w-vditor-vue/blob/master/docs/examples/app.html)]

## Installation

### Using npm(ES6 module):
```alias
npm i w-vditor-vue
```

### In a browser(UMD module):

Add script for vue.
```alias
<script src="https://cdn.jsdelivr.net/npm/vue@2.x/dist/vue.min.js"></script>
```

Add script for w-vditor-vue, vditor has been bundled into the umd file(css included), only vue is required.
```alias
<script src="https://yuda-lyu.github.io/w-vditor-vue/dist/w-vditor-vue.umd.js"></script>
```

> Note: vditor still downloads its runtime resources(lute, i18n, icons, katex...) from `https://unpkg.com/vditor@[version]` on demand, it can be redirected by `settings.cdn`.

### For intranet / offline deployment

The umd file already contains vditor itself and its css, but vditor loads a few resources at runtime by `<script>`/`<link>` from `options.cdn`(default `https://unpkg.com/vditor@[version]`). To run without internet access, copy `node_modules/vditor/dist` to a folder served by your own site, then point `settings.cdn` to the folder **containing** `dist`:

```alias
<w-vditor-vue
    :settings="{ cdn: '/static/vditor' }"
    v-model="content"
></w-vditor-vue>
```

so that vditor resolves `/static/vditor/dist/js/lute/lute.min.js` and so on.

Resources actually requested(verified by serving them locally with all external requests blocked):

| resource | when | size |
|---|---|---|
| `dist/js/lute/lute.min.js` | always(markdown engine) | 3.7 MB |
| `dist/js/i18n/[lang].js` | always, unless `settings.i18n` is given as an object | 3 KB |
| `dist/js/icons/[icon].js` | always(`settings.icon` default `'ant'`) | 42 KB |
| `dist/css/content-theme/[theme].css` | always | 20 KB(whole folder) |
| `dist/js/katex/*` | only when the content has `$$...$$` | 1.5 MB |
| `dist/images/emoji/*` | only when image emojis are used | 112 KB |
| `dist/js/{mermaid,echarts,graphviz,abcjs,markmap,flowchart.js,mathjax,...}` | only when the content has the matching code block | 0.03 ~ 6.5 MB each |

The whole `dist` is about 22 MB, most of which belongs to renderers that are never fetched unless the corresponding syntax appears. It is safe to copy only the folders your content needs, plus `js/lute`, `js/i18n`, `js/icons` and `css/`.

Copy the `dist` of the same vditor version as the one bundled in the umd file (see `dependencies.vditor` in `package.json`); `js/lute/lute.min.js` differs between vditor versions and must match.

## vditor 4 notes

w-vditor-vue bundles vditor `^4.0.1` (3.x had a preview XSS fixed in 4.0.1: GHSA-x2mx-f527-mxr9). Behaviour changes that matter to users of the component:

- `settings.mode='sv'` (split preview): the editing area is a plain `<textarea>` in vditor 4. Read-only (`editable=false`) still behaves like the native `readonly` (focusable by Tab, scrollable, selectable, not editable); the component sets `readOnly` on the textarea because vditor 4 uses `disabled`, which cannot be focused or selected.
- `keyHint` (the hint area) is **not supported in `sv` mode**: vditor 4 disables hints there. Typing the trigger string is plain text and no hint area is shown. `wysiwyg` and `ir` modes are unchanged.
- The `input` event is still emitted on every change; in `sv` mode it is emitted for every input without debounce, as before.
