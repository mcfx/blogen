const fs = require('fs')
const path = require('path')
const marked = require('marked')
const katex = require('katex')
const hljs = require('highlight.js')
const hljsDefineSolidity = require('highlightjs-solidity');
const yaml = require('yaml')
const ejs = require('ejs')
const { minify } = require('html-minifier')

hljsDefineSolidity(hljs);

const {
    createHash
} = require('crypto');

const blogPath = process.argv[2]
const blogRenderPath = path.join(blogPath, 'release')
const sourcePath = path.join(blogPath, 'source')
const postsPath = path.join(sourcePath, 'posts')
const assetsPath = path.join(sourcePath, 'assets')
const templatesPath = path.join(sourcePath, 'templates')

if (!fs.existsSync(blogRenderPath)) fs.mkdirSync(blogRenderPath)

function katexRender(text, displayMode) {
    return katex.renderToString(text, { strict: false, displayMode: displayMode })
}

var replaceHtmlEntites = (function () {
    var translate_re = /&(nbsp|amp|quot|lt|gt|#39);/g;
    var translate = {
        "nbsp": " ",
        "amp": "&",
        "quot": "\"",
        "lt": "<",
        "gt": ">",
        "#39": "'",
    };
    return function (s) {
        return (s.replace(translate_re, function (_, entity) {
            return translate[entity];
        }));
    }
})();

function katexMarkdownRender(text, displayMode) {
    text = replaceHtmlEntites(text).replace(/\$/g, "")
    if (displayMode) text = text.replace(/\\\n/g, '\\\\\n')
    if (text.includes('&')) console.log(text)
    return katexRender(text, displayMode)
}

let markedRenderer = new marked.Renderer()

function katexWrapper(originalFunc) {
    return function (text, ...args) {
        const isTeXInline = /\$(.*)\$/g.test(text)
        const isTeXLine = /^\$\$((\s|.)*)\$\$$/.test(text)

        if (!isTeXLine && isTeXInline) {
            text = text.replace(/(\$([^\$]*)\$)+/g, function (_, x) {
                if (x.indexOf('<code>') >= 0 || x.indexOf('</code>') >= 0) {
                    return x
                } else {
                    return '<span class="tex">' + katexMarkdownRender(x, false) + '</span>'
                }
            })
        } else if (isTeXLine) {
            text = '<div class="tex">' + katexMarkdownRender(text, true) + '</div>'
        }
        return originalFunc(text, ...args)
    }
}

for (const funcname of ['paragraph', 'listitem', 'tablecell'])
    markedRenderer[funcname] = katexWrapper(markedRenderer[funcname])

let assets = {}

function assetWrapper(originalFunc, type, newHrefFunc) {
    return function (href, title, text) {
        if (!href.startsWith('https://') && !href.startsWith('http://') && !href.startsWith('/') && !href.startsWith('#')) {
            const filePath = path.join(assetsPath, href)
            console.assert(fs.existsSync(filePath), type + " not found: " + href)
            const hash = createHash('sha256');
            hash.update(fs.readFileSync(filePath))
            const newHref = '/assets/' + newHrefFunc(hash, href)
            assets[newHref] = filePath
            href = newHref
        }
        return originalFunc.call(this, href, title, text)
    }
}

markedRenderer.image = assetWrapper(markedRenderer.image, 'image', (hash, href) => hash.digest('hex') + path.extname(href))
markedRenderer.link = assetWrapper(markedRenderer.link, 'file', (hash, href) => path.parse(href).name + '-' + hash.digest('hex').substring(0, 8) + path.extname(href))

markedRenderer.heading = function (text, level, raw, slugger) {
    const url = slugger.slug(raw)
    this.headings.push({ level: level, text: text, url: url })
    return '<h' + level + ' id="' + url + '">' +
        '<a name="' + text + '">' +
        text +
        '</h' + level + '>\n';
}

marked.setOptions({
    renderer: markedRenderer,
    highlight: function (code, lang) {
        if (lang == 'plain' || lang == '') return code
        return hljs.highlight(code, { language: lang }).value
    }
})

function render(text) {
    markedRenderer.headings = []
    const renderedText = marked(text)
    return {
        text: renderedText,
        headings: markedRenderer.headings,
    }
}

const config = yaml.parse(fs.readFileSync(path.join(blogPath, 'source/config.yml'), { encoding: 'utf-8' }))
const postsPerPage = config['posts-per-page']
const tagsUrls = config.tagsUrls || {}

let posts = {}
let tagPosts = { '': [] }
let datePosts = {}
let urlSet = {}

fs.readdirSync(postsPath).sort((a, b) => b.localeCompare(a)).forEach(file => {
    let content = fs.readFileSync(path.join(postsPath, file), { encoding: 'utf-8' }) + '\n'
    const metaSplitter = '\n#! meta end\n'
    const headSplitter = '\n#! head end\n'

    const metaPos = content.indexOf(metaSplitter)
    let meta = ''
    if (metaPos != -1) {
        meta = content.substring(0, metaPos).split('\n').map((x) => x.startsWith('#! ') ? x.substr(3) : x).join('\n')
        content = content.substring(metaPos + metaSplitter.length)
    } else {
        while (content.startsWith('#! ')) {
            const lfPos = content.indexOf('\n')
            meta += content.substring(3, lfPos) + '\n'
            content = content.substring(lfPos + 1)
        }
    }

    const headPos = content.indexOf(headSplitter)
    let head = ''
    if (headPos != -1) {
        head = content.substring(0, headPos)
        content = content.substring(headPos + headSplitter.length)
    } else {
        const pos = content.indexOf('\n\n')
        head = content.substring(0, pos == -1 ? content.length : pos)
    }
    meta = yaml.parse(meta) || {}

    const filename = file.substring(0, file.length - 3)
    const date = filename.substring(0, 10)
    const title = meta.title || filename
    const url = ((meta.url || '/posts/' + filename + '/') + '/').replace('//', '/')
    const tags = meta.tags || []

    head = render(head).text
    const renderResult = render(content)
    content = renderResult.text
    headings = renderResult.headings
    tags.forEach(tag => {
        if (typeof (tagPosts[tag]) == "undefined") tagPosts[tag] = []
        tagPosts[tag].push(filename)
    })
    tagPosts[''].push(filename)

    const dateMonth = date.substring(0, 7)
    if (typeof (datePosts[dateMonth]) == "undefined") datePosts[dateMonth] = []
    datePosts[dateMonth].push(filename)

    console.assert(typeof (urlSet[url]) == "undefined", "posts can't have the same url")
    urlSet[url] = true

    posts[filename] = {
        id: filename,
        title: title,
        url: url,
        tags: tags,
        date: date,
        head: head,
        content: content,
        headings: headings,
        extra: meta.extra || {},
    }
})

function getTagUrl(tag) {
    if (typeof (tagsUrls[tag]) != "undefined") return tagsUrls[tag]
    return '/tag/' + tag + '/'
}

function compile(filename) {
    const filePath = path.join(templatesPath, filename)
    return ejs.compile(fs.readFileSync(filePath, { encoding: 'utf-8' }), { filename: filePath })
}

function minifyHtml(html) {
    return minify(html, {
        collapseWhitespace: true,
        removeComments: true,
        collapseBooleanAttributes: true,
        useShortDoctype: true,
        removeEmptyAttributes: true,
        removeOptionalTags: true,
        minifyJS: true
    })
}

pageTemplate = compile('page.ejs')
postTemplate = compile('post.ejs')
tocTemplate = compile('toc.ejs')
postsTemplate = compile('posts.ejs')
rssTemplate = compile('rss.ejs')

for (const [_, post] of Object.entries(posts)) {
    const pt = path.join(blogRenderPath, post.url)
    if (!fs.existsSync(pt)) fs.mkdirSync(pt, { recursive: true })
    if (post.content.includes("<p>#! toc")) {
        post.content = post.content.replace(/<p>#! toc .*<\/p>/g, x => tocTemplate({ headings: post.headings, name: x.substring(10, x.length - 4) }))
    }
    fs.writeFileSync(
        path.join(pt, 'index.html'),
        minifyHtml(pageTemplate({ title: post.title, body: postTemplate({ post: post, getTagUrl: getTagUrl }) })),
        { encoding: 'utf-8' }
    )
}

function genPages(postIds, title, urlCallback) {
    const totalPages = Math.floor((postIds.length + postsPerPage - 1) / postsPerPage)
    let pageUrls = []
    for (let i = 0; i < totalPages; i++)
        pageUrls.push(urlCallback(i + 1))
    for (let i = 0; i < totalPages; i++) {
        let tmpPosts = []
        for (let j = i * postsPerPage; j < postIds.length && j < (i + 1) * postsPerPage; j++)
            tmpPosts.push(posts[postIds[j]])
        const pt = path.join(blogRenderPath, pageUrls[i])
        if (!fs.existsSync(pt)) fs.mkdirSync(pt, { recursive: true })
        fs.writeFileSync(
            path.join(pt, 'index.html'),
            minifyHtml(pageTemplate({
                title: title,
                body: postsTemplate({
                    title: title,
                    posts: tmpPosts,
                    totalPages: totalPages,
                    curPage: i + 1,
                    getPageUrl: page => pageUrls[page - 1],
                })
            })),
            { encoding: 'utf-8' }
        )
    }
}

genPages(tagPosts[''], '', page => page == 1 ? '/' : '/page/' + page + '/')
for (const [tag, postIds] of Object.entries(tagPosts))
    if (tag != '') genPages(postIds, '包含标签 ' + tag + ' 的文章', page => getTagUrl(tag) + (page == 1 ? '' : page + '/'))

for (const [date, postIds] of Object.entries(datePosts))
    genPages(postIds, date.substring(0, 4) + ' 年 ' + date.substring(5, 7).replace(/^0/, '') + ' 月', page => '/' + date.replace('-', '/') + '/' + (page == 1 ? '' : page + '/'))

fs.writeFileSync(
    path.join(blogRenderPath, '/feed.xml'),
    rssTemplate({ posts: tagPosts[''].map(x => posts[x])}),
    { encoding: 'utf-8' }
)

const renderAssetsPath = path.join(blogRenderPath, '/assets/')
if (!fs.existsSync(renderAssetsPath)) fs.mkdirSync(renderAssetsPath, { recursive: true })
for (const [dst, src] of Object.entries(assets))
    fs.copyFileSync(src, path.join(blogRenderPath, dst))

if (config.requireFiles) {
    config.requireFiles.forEach(filename => fs.copyFileSync(path.join(sourcePath, filename), path.join(blogRenderPath, filename)))
}
