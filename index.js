const fs = require('fs')
const path = require('path')
const marked = require('marked')
const katex = require('katex')
const hljs = require('highlight.js')
const yaml = require('yaml')
const ejs = require('ejs')

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
    var translate_re = /&(nbsp|amp|quot|lt|gt);/g;
    var translate = {
        "nbsp": " ",
        "amp": "&",
        "quot": "\"",
        "lt": "<",
        "gt": ">"
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
    return katexRender(text, displayMode)
}

let markedRenderer = new marked.Renderer()
markedRenderer.originalParagraph = markedRenderer.paragraph
markedRenderer.originalImage = markedRenderer.image
markedRenderer.originalHeading = markedRenderer.heading

markedRenderer.paragraph = function (text) {
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
    return this.originalParagraph(text)
}

let images = {}

markedRenderer.image = function (href, title, text) {
    if (!href.startsWith('https://') && !href.startsWith('http://') && !href.startsWith('//')) {
        const imgPath = path.join(assetsPath, href)
        console.assert(fs.existsSync(imgPath), "image not found: " + href)
        const hash = createHash('sha256');
        hash.update(fs.readFileSync(imgPath))
        const newHref = '/assets/' + hash.digest('hex') + path.extname(href)
        images[newHref] = imgPath
        href = newHref
    }
    return this.originalImage(href, title, text)
}

markedRenderer.heading = function (text, level, raw, slugger) {
    return '<h' + level + ' id="' + this.options.headerPrefix + slugger.slug(raw) + '">' +
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
    return marked(text)
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
        meta = content.substr(0, metaPos).split('\n').map((x) => x.startsWith('#! ') ? x.substr(3) : x).join('\n')
        content = content.substr(metaPos + metaSplitter.length)
    } else {
        while (content.startsWith('#! ')) {
            const lfPos = content.indexOf('\n')
            meta += content.substr(3, lfPos - 3) + '\n'
            content = content.substr(lfPos + 1)
        }
    }

    const headPos = content.indexOf(headSplitter)
    let head = ''
    if (headPos != -1) {
        head = content.substr(0, headPos)
        content = content.substr(headPos + headSplitter.length)
    } else {
        const pos = content.indexOf('\n\n')
        head = content.substr(0, pos == -1 ? content.length : pos)
    }
    meta = yaml.parse(meta) || {}

    const filename = file.substr(0, file.length - 3)
    const date = filename.substr(0, 10)
    const title = meta.title || filename
    const url = ((meta.url || '/posts/' + filename + '/') + '/').replace('//', '/')
    const tags = meta.tags || []

    head = render(head)
    content = render(content)
    tags.forEach(tag => {
        if (typeof (tagPosts[tag]) == "undefined") tagPosts[tag] = []
        tagPosts[tag].push(filename)
    })
    tagPosts[''].push(filename)

    const dateMonth = date.substr(0, 7)
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
        extra: meta.extra || {},
    }
})

function getTagUrl(tag) {
    if (typeof (tagsUrls[tag]) != "undefined") return tagsUrls[tag]
    return '/tag/' + tag + '/'
}

pageTemplate = ejs.compile(fs.readFileSync(path.join(templatesPath, 'page.ejs'), { encoding: 'utf-8' }))
postTemplate = ejs.compile(fs.readFileSync(path.join(templatesPath, 'post.ejs'), { encoding: 'utf-8' }))
postsTemplate = ejs.compile(fs.readFileSync(path.join(templatesPath, 'posts.ejs'), { encoding: 'utf-8' }))

for (const [_, post] of Object.entries(posts)) {
    const pt = path.join(blogRenderPath, post.url)
    if (!fs.existsSync(pt)) fs.mkdirSync(pt, { recursive: true })
    fs.writeFileSync(
        path.join(pt, 'index.html'),
        pageTemplate({ title: post.title, body: postTemplate({ post: post, getTagUrl: getTagUrl }) }),
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
            pageTemplate({
                title: title,
                body: postsTemplate({
                    title: title,
                    posts: tmpPosts,
                    totalPages: totalPages,
                    curPage: i + 1,
                    getPageUrl: page => pageUrls[page - 1],
                })
            }),
            { encoding: 'utf-8' }
        )
    }
}

genPages(tagPosts[''], '', page => page == 1 ? '/' : '/page/' + page + '/')
for (const [tag, postIds] of Object.entries(tagPosts))
    if (tag != '') genPages(postIds, '包含标签 ' + tag + ' 的文章', page => getTagUrl(tag) + (page == 1 ? '' : page + '/'))

for (const [date, postIds] of Object.entries(datePosts))
    genPages(postIds, date.substr(0, 4) + ' 年 ' + date.substr(5, 7).replace(/^0/, '') + ' 月', page => '/' + date.replace('-', '/') + '/' + (page == 1 ? '' : page + '/'))

const renderAssetsPath = path.join(blogRenderPath, '/assets/')
if (!fs.existsSync(renderAssetsPath)) fs.mkdirSync(renderAssetsPath, { recursive: true })
for (const [dst, src] of Object.entries(images))
    fs.copyFileSync(src, path.join(blogRenderPath, dst))

if (config.requireFiles) {
    config.requireFiles.forEach(filename => fs.copyFileSync(path.join(sourcePath, filename), path.join(blogRenderPath, filename)))
}