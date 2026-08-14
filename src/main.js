import './styles.css'

const plugins = [
  { name: 'dsh-vision-toolkit', owner: 'Anionex', category: 'tools', label: '工具能力', description: '让纯文本模型完成图片问答、长截图 OCR、UI 还原、视觉定位与像素差异检查。', stars: 247, forks: 16, tags: ['VISION', 'OCR', 'WEB UI'], glyph: '◉', verified: true },
  { name: 'dsh-agent-teams', owner: 'NanmiCoder', category: 'workflow', label: '工作流', description: '为 DeepSeek Harness 增加 Agent Teams，让多个 Agent 组织分工并协作交付。', stars: 166, forks: 13, tags: ['MULTI-AGENT', 'TEAMS'], glyph: 'A²', verified: true },
  { name: 'dsh-tianshu-tui', owner: 'huiliyi37', category: 'ui', label: '界面增强', description: 'DeepSeek Harness 交互式终端 UI，并增加 TDD、证据门和 Harness 工作流。', stars: 97, forks: 4, tags: ['TUI', 'TERMINAL', 'TDD'], glyph: 'T', verified: true },
  { name: 'dsh-at-file', owner: 'omdsh-dev', category: 'ui', label: '界面增强', description: 'Codex 风格的 @file 引用：在输入框搜索工作区文件，并把内容附加到提示词。', stars: 70, forks: 2, tags: ['COMPOSER', 'WORKSPACE'], glyph: '@', verified: true },
  { name: 'dsh-turn-rewind', owner: 'Anionex', category: 'session', label: '会话', description: '回退对话与工作区代码状态，由持久化 Change Ledger 记录每一次变更。', stars: 27, forks: 0, tags: ['REWIND', 'LEDGER'], glyph: '↶', verified: true },
  { name: 'dsh-notification', owner: 'omdsh-dev', category: 'integration', label: '集成', description: '在任务完成时发送桌面通知，支持按结果类型和关键词设置包含或排除规则。', stars: 27, forks: 3, tags: ['NOTIFICATION', 'DESKTOP'], glyph: 'N' },
  { name: 'dsh-computer-use', owner: 'Anionex', category: 'tools', label: '工具能力', description: '面向 macOS 的无障碍优先电脑操作，拒绝过期状态并限制输入作用域。', stars: 15, forks: 1, tags: ['MACOS', 'ACCESSIBILITY'], glyph: '⌁', verified: true },
  { name: 'dsh-toolkit', owner: 'omdsh-dev', category: 'tools', label: '工具能力', description: '十个零依赖确定性工具：时间、编码、JSON、计算、CSV、正则、Markdown 与更多。', stars: 13, forks: 0, tags: ['ZERO DEP', 'UTILITIES'], glyph: '10' },
  { name: 'dsh-deep-research', owner: 'omdsh-dev', category: 'workflow', label: '工作流', description: '基于官方工作流引擎的自适应深度研究编排器，组织检索、阅读与报告输出。', stars: 6, forks: 0, tags: ['RESEARCH', 'ORCHESTRATOR'], glyph: 'R' },
  { name: 'deepseek-harness-tui', owner: 'openma-ai', category: 'ui', label: '界面增强', description: '使用 Rust 与 ratatui 构建的 DSH 终端客户端，可独立运行或作为 Profile Bundle 加载。', stars: 5, forks: 0, tags: ['RUST', 'RATATUI'], glyph: '⌘' },
  { name: 'dsh-sidechain', owner: 'Buyi-wsgzg', category: 'session', label: '会话', description: '提供 /side 持久侧会话与 /btw 一次性侧问，在临时 Fork 中运行且不写入主历史。', stars: 3, forks: 0, tags: ['SIDE SESSION', 'FORK'], glyph: 'S' },
  { name: 'dsh-kb-sieve', owner: 'omdsh-dev', category: 'tools', label: '工具能力', description: '从 Markdown、Word 与 PDF 构建可审计知识库，提供确定性检索和原文读取。', stars: 1, forks: 0, tags: ['KNOWLEDGE', 'DOCUMENTS'], glyph: 'K' }
].map(plugin => ({ ...plugin, install: `dsh plugin add github:${plugin.owner}/${plugin.name}` }))

const categories = [['all', '全部'], ['tools', '工具能力'], ['ui', '界面增强'], ['workflow', '工作流'], ['session', '会话'], ['integration', '集成']]
const totalStars = plugins.reduce((total, plugin) => total + plugin.stars, 0)

const icons = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="10" height="10"/><path d="M16 8V5H5v11h3"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>',
  github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.61-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.03A9.56 9.56 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.76c0 .26.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>'
}

document.querySelector('#app').innerHTML = `
  <header class="site-header">
    <div class="header-inner shell-wide">
      <a class="brand" href="#"><span class="brand-symbol"><i></i><i></i></span><b>DSH</b><span>PLUGINS</span></a>
      <nav aria-label="主导航"><a class="active" href="#directory">全部插件</a><a href="#directory">排行榜</a><a href="#principles">收录标准</a></nav>
      <label class="nav-search" for="nav-search-input">${icons.search}<input id="nav-search-input" type="search" placeholder="搜索插件…"><kbd>⌘K</kbd></label>
      <a class="header-github" href="https://github.com/awesome-dsh-plugin/awesome-dsh-plugin" target="_blank" rel="noreferrer">${icons.github}<span>GitHub</span></a>
      <button class="submit" type="button">提交插件 ${icons.arrow}</button>
    </div>
  </header>

  <main>
    <section class="hero shell">
      <div class="kicker"><span>DEEPSEEK HARNESS</span><i></i><span>社区插件目录</span></div>
      <h1>为每一种 Harness 工作流<br>找到合适的<span>插件。</span></h1>
      <p>搜索社区维护的 DeepSeek Harness 插件，对比能力、GitHub Stars 与维护者信息，然后复制命令直接安装。</p>
      <div class="stats" aria-label="目录统计">
        <div><strong>${plugins.length}</strong><span>已收录插件</span></div>
        <div><strong>${categories.length - 1}</strong><span>能力分类</span></div>
        <div><strong>${totalStars}</strong><span>GitHub Stars</span></div>
        <div><strong>OPEN</strong><span>社区维护</span></div>
      </div>
      <form class="hero-search" id="hero-search" role="search">
        ${icons.search}<label class="sr-only" for="hero-search-input">搜索插件</label>
        <input id="hero-search-input" type="search" autocomplete="off" placeholder="你希望 Harness 获得什么能力？">
        <button type="submit">搜索 ${icons.arrow}</button>
      </form>
      <div class="suggestions"><span>试试</span><button data-query="OCR">图片与 OCR</button><button data-query="Agent Teams">多 Agent 协作</button><button data-query="TUI">终端界面</button><button data-query="Research">深度研究</button></div>
    </section>

    <section class="directory shell" id="directory">
      <div class="directory-heading">
        <div><span class="section-label">PLUGIN DIRECTORY / 目录</span><h2>探索 DSH 插件</h2></div>
        <div class="match-count"><strong id="match-count">${plugins.length}</strong><span>匹配的插件</span></div>
      </div>

      <div class="filter-block">
        <p>能力分类</p>
        <div class="categories" role="tablist" aria-label="插件分类">
          ${categories.map(([value, label], index) => `<button type="button" role="tab" aria-selected="${index === 0}" class="category${index === 0 ? ' active' : ''}" data-category="${value}">${label}<small>${value === 'all' ? plugins.length : plugins.filter(plugin => plugin.category === value).length}</small></button>`).join('')}
        </div>
        <div class="sort-row">
          <span>排序：</span>
          <button class="sort active" type="button" data-sort="stars">STARS</button>
          <button class="sort" type="button" data-sort="forks">FORKS</button>
          <button class="sort" type="button" data-sort="name">名称</button>
          <label class="result-search" for="result-search-input">${icons.search}<input id="result-search-input" type="search" autocomplete="off" placeholder="筛选当前结果"></label>
        </div>
      </div>

      <div class="result-heading"><span>目录结果</span><h3>社区插件</h3></div>
      <div class="plugin-grid" id="plugin-grid"></div>
      <div class="empty" id="empty" hidden><strong>0</strong><h3>没有匹配的插件</h3><button id="reset" type="button">清除筛选</button></div>
    </section>

    <section class="principles shell" id="principles">
      <div><span class="section-label">A BETTER DIRECTORY</span><h2>Stars 很重要，<br>但不代表全部。</h2></div>
      <ol><li><span>01</span><p><b>来源明确</b>每个插件直接链接到公开源码仓库。</p></li><li><span>02</span><p><b>信息可比较</b>名称、作者、简介、Stars 与 Forks 使用统一位置。</p></li><li><span>03</span><p><b>安装够直接</b>一键复制命令，不在目录页堆叠无关元数据。</p></li></ol>
    </section>
  </main>

  <footer><div class="shell-wide"><a class="brand" href="#"><span class="brand-symbol"><i></i><i></i></span><b>DSH</b><span>PLUGINS</span></a><p>社区维护，与 DeepSeek 官方无隶属关系。</p><div><a href="#directory">全部插件</a><a href="#principles">收录标准</a><a href="https://github.com/awesome-dsh-plugin/awesome-dsh-plugin">GitHub</a></div></div></footer>`

const heroInput = document.querySelector('#hero-search-input')
const navInput = document.querySelector('#nav-search-input')
const resultInput = document.querySelector('#result-search-input')
const grid = document.querySelector('#plugin-grid')
const matchCount = document.querySelector('#match-count')
const empty = document.querySelector('#empty')
let activeCategory = 'all'
let activeSort = 'stars'

function card(plugin, index) {
  const repo = `https://github.com/${plugin.owner}/${plugin.name}`
  return `<article class="plugin-card" style="--delay:${Math.min(index * 45, 300)}ms">
    <header><span class="card-number">${String(index + 1).padStart(2, '0')}</span><img src="https://github.com/${plugin.owner}.png?size=64" alt="" loading="lazy"><span class="owner">@${plugin.owner}</span>${plugin.verified ? `<span class="curated">${icons.check} 精选</span>` : '<span class="community">社区</span>'}</header>
    <div class="card-body"><h3><a href="${repo}" target="_blank" rel="noreferrer">${plugin.name}</a></h3><p>${plugin.description}</p><div class="tags">${plugin.tags.map(tag => `<span>${tag}</span>`).join('')}</div></div>
    <footer><div class="metrics"><strong>★ ${plugin.stars.toLocaleString('en-US')}</strong><span>${plugin.forks} FORKS</span></div><span class="category-label">${plugin.label}</span><a class="repo-link" href="${repo}" target="_blank" rel="noreferrer" aria-label="在 GitHub 查看 ${plugin.name}">${icons.github}</a><button class="install" type="button" data-install="${plugin.install}"><span>安装</span>${icons.copy}</button></footer>
  </article>`
}

function render() {
  const query = resultInput.value.trim().toLowerCase()
  const visible = plugins.filter(plugin => {
    const categoryMatch = activeCategory === 'all' || plugin.category === activeCategory
    const text = `${plugin.name} ${plugin.owner} ${plugin.description} ${plugin.label} ${plugin.tags.join(' ')}`.toLowerCase()
    return categoryMatch && (!query || text.includes(query))
  })
  visible.sort((a, b) => activeSort === 'name' ? a.name.localeCompare(b.name) : b[activeSort] - a[activeSort] || b.stars - a.stars)
  grid.innerHTML = visible.map(card).join('')
  matchCount.textContent = visible.length
  grid.hidden = visible.length === 0
  empty.hidden = visible.length !== 0
  document.querySelectorAll('.install').forEach(button => button.addEventListener('click', () => copyInstall(button)))
}

async function copyInstall(button) {
  try {
    await navigator.clipboard.writeText(button.dataset.install)
    button.classList.add('copied')
    button.innerHTML = `<span>已复制</span>${icons.check}`
    setTimeout(() => { button.classList.remove('copied'); button.innerHTML = `<span>安装</span>${icons.copy}` }, 1600)
  } catch { button.querySelector('span').textContent = '复制失败' }
}

function searchFrom(input) {
  resultInput.value = input.value
  render()
}

document.querySelector('#hero-search').addEventListener('submit', event => { event.preventDefault(); searchFrom(heroInput); document.querySelector('#directory').scrollIntoView({ behavior: 'smooth' }) })
heroInput.addEventListener('input', () => searchFrom(heroInput))
navInput.addEventListener('input', () => { searchFrom(navInput); document.querySelector('#directory').scrollIntoView({ behavior: 'smooth' }) })
resultInput.addEventListener('input', render)
document.querySelectorAll('.suggestions button').forEach(button => button.addEventListener('click', () => { heroInput.value = button.dataset.query; searchFrom(heroInput); document.querySelector('#directory').scrollIntoView({ behavior: 'smooth' }) }))
document.querySelectorAll('.category').forEach(button => button.addEventListener('click', () => { activeCategory = button.dataset.category; document.querySelectorAll('.category').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-selected', String(item === button)) }); render() }))
document.querySelectorAll('.sort').forEach(button => button.addEventListener('click', () => { activeSort = button.dataset.sort; document.querySelectorAll('.sort').forEach(item => item.classList.toggle('active', item === button)); render() }))
document.querySelector('#reset').addEventListener('click', () => { heroInput.value = ''; navInput.value = ''; resultInput.value = ''; activeCategory = 'all'; document.querySelectorAll('.category').forEach((item, index) => { item.classList.toggle('active', index === 0); item.setAttribute('aria-selected', String(index === 0)) }); render() })
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); navInput.focus() } })

render()
