/* Harness Registry — lightweight zh-CN / en-US runtime i18n */
(function () {
  'use strict';

  var STORAGE_KEY = 'harness-registry-locale';
  var saved = localStorage.getItem(STORAGE_KEY);
  var locale = saved || (navigator.language && navigator.language.toLowerCase().indexOf('zh') === 0 ? 'zh-CN' : 'en-US');

  var en = {
    '跳到主要内容': 'Skip to main content', '主要导航': 'Primary navigation',
    '浏览插件': 'Browse', '发布': 'Publish', '统计': 'Stats', '规范': 'Policy', '返回插件列表': 'Back to plugins',
    '发布你的插件': 'Publish your plugin', '收录规范': 'Listing policy', 'API 文档': 'API docs',
    'DeepSeek Harness': 'DeepSeek Harness', '注册表 JSON': 'Registry JSON', '返回插件库': 'Back to registry',
    '给 Harness 装上能力。': 'Give Harness new capabilities.',
    '社区精选与 GitHub 自动发现的插件都在这里 —— Manifest 校验、commit 锁定、安装命令，都已替你做好。': 'Curated picks and auto-discovered plugins in one place — manifest verification, commit pinning, and copy-ready install commands, all done for you.',
    '描述你想让 Harness 做什么…': 'Describe what you want Harness to do…',
    '试试': 'Try', '终端界面': 'Terminal UI', '消息通知': 'Notifications', '网页搜索': 'Web search', '工作流': 'Workflows',
    '收录插件': 'Plugins', '可浏览仓库': 'Browsable repositories', '全部': 'All', '工具': 'Tools', '检索': 'Retrieval', '路由': 'Routing', '评测': 'Evaluation',
    '安全': 'Security', '调试': 'Debugging', '集成': 'Integrations', '性能': 'Performance', '数据': 'Data',
    '按最近更新': 'Recently updated',
    '全部插件': 'All plugins', '插件与候选仓库': 'Plugins and candidate repositories', '官方': 'Official', '安装': 'Install', '已复制 ✓': 'Copied ✓',
    '没有匹配的插件 —— 试试换个关键词，或': 'No matching plugins — try another keyword, or ',
    '自己发布一个': 'publish your own',
    'Registry 的脉搏。': 'The pulse of the registry.',
    '分类分布': 'Category distribution', '插件榜': 'Plugin ranking',
    '作者榜': 'Author ranking',
    '插件数': 'Plugins', '复制安装命令': 'Copy install command', '安装步骤': 'Install steps', '复制命令': 'Copy command', '收藏': 'Favorite',
    '插件信息': 'Plugin information', '权限': 'Permissions', '依赖': 'Dependencies',
    '它能做什么': 'What it does', '维护者': 'Maintainer', '本周': 'This week', '信息': 'Information', '最近更新': 'Last updated', '仓库': 'Repository', '当前': 'Current', '运行时': 'Runtime', '协议': 'Protocol',
    '冲突': 'Conflicts',
    '需确认': 'Confirmation required', '敏感': 'Sensitive',
    '提交审核': 'Submit for review', '分类': 'Category', '文件读取': 'File read', '插件作者': 'Plugin authors', '自动发现': 'Auto-discovered', 'Manifest 检查通过': 'Manifest checks passed', '全部来源': 'All sources', '插件来源': 'Plugin source', '社区目录': 'Community catalog', 'GitHub 自动发现': 'GitHub discovery',
    'Manifest 状态': 'Manifest status', '全部 Manifest 状态': 'All Manifest statuses', '格式检查通过': 'Format checked', '未检查': 'Not checked',
    '排序方式': 'Sort order', 'Manifest 检查通过优先': 'Manifest checks passed first', '按最近收录': 'Recently listed',
    '按 Stars（已收录优先）': 'By Stars (listed first)', '按 Stars（含候选仓库）': 'By Stars (including candidates)', '按 Stars': 'By Stars', '按 Forks': 'By Forks',
    '全部语言': 'All languages', '编程语言': 'Programming language', '语言数据待同步': 'Language data pending',
    '插件数据暂时无法加载，请稍后重试。': 'Plugin data is temporarily unavailable. Please try again later.',
    '插件数据暂时无法加载。': 'Plugin data is temporarily unavailable.', '社区目录收录': 'Community catalog', '查看 GitHub': 'View on GitHub', '验证范围': 'Verification scope', '社区数据': 'Community data',
    '来源': 'Source', '安装测试': 'Installation test', '未执行': 'Not performed', '它能做什么': 'What it does', '安装前请确认': 'Before installing', '校验 Commit': 'Verified commit',
    '查看 GitHub 仓库中的 README、依赖和额外配置。': 'Review the README, dependencies, and additional setup in the GitHub repository.',
    '本站不审计插件安全性，也没有执行安装测试。': 'This registry does not audit plugin security or perform installation tests.',
    '本站收录': 'Listed here', '同类插件': 'Similar plugins', '报告条目信息问题 ↗': 'Report listing data ↗',
    '插件数据加载失败': 'Unable to load plugin data', '没有找到这个插件': 'Plugin not found',
    '数据来自社区目录与 GitHub dsh-plugin Topic。这里不制造下载量或评分，只展示可以被验证的公开指标。': 'Data comes from the community catalog and the GitHub dsh-plugin topic. No fabricated installs or ratings — only verifiable public metrics.',
    '已收录仓库合计': 'Across listed repositories', '可安装插件': 'Installable plugins', '公开列表条目': 'Public listing entries', '仅已收录条目 · 按 owner 去重': 'Listed entries only · unique owners',
    '格式检查通过': 'Format checked', 'dsh.bundle 声明格式有效': 'Valid dsh.bundle declarations', '公开列表中的数据来源': 'Data sources in the public list', '按公开列表条目数量': 'By public listing entries',
    '来源构成': 'Source composition', '已隔离': 'Quarantined', '数据生成于：': 'Generated: ', '按收录插件的 Stars 合计': 'Total Stars across listed plugins',
    '每 2 小时自动同步': 'Auto-sync every 2 hours', '每 2 小时自动发现': 'Auto-discovery every 2 hours',
    '把仓库交给审核队列。': 'Send your repository to the review queue.',
    '检查仓库、补充审核资料、站内提交。你不需要离开页面；提交记录会公开进入 GitHub 队列，方便维护者反馈和持续跟进。': 'Check the repository, add review details, and submit without leaving the site. A public GitHub record keeps maintainer feedback and follow-up trackable.',
    '站内审核提交流程': 'On-site review submission flow', '补充资料': 'Add details', '审核所需信息': 'Review information', '站内提交': 'Submit here', '无需跳转': 'No redirect', '跟踪审核': 'Track review', '公开 Issue': 'Public issue',
    '检查仓库': 'Check repository', '公开元数据': 'Public metadata', '检查结果': 'Check results', 'GitHub 审核': 'GitHub review', '每 2 小时': 'Every 2 hours', '自动发现要求根目录 package.json 声明 dsh.bundle。': 'Auto-discovery requires dsh.bundle in the root package.json.',
    'Topic。': 'topic.', '查看完整收录规范': 'View the full listing policy',
    '查看提交队列': 'View submission queue',
    '站内提交，GitHub 留痕': 'Submit here, track on GitHub', '表单会把预检和作者资料整理成公开审核工单，并自动通知维护者。': 'The form turns checks and author details into a public review issue and notifies the maintainer.',
    '提交插件仓库': 'Submit a plugin repository', '先确认仓库状态，再补充两项审核资料。整个过程大约需要一分钟。': 'Confirm the repository, then add the two required review details. It takes about a minute.',
    'GitHub 仓库': 'GitHub repository', '公开仓库存在': 'Public repository exists', '包含 dsh-plugin Topic': 'Includes the dsh-plugin topic',
    '声明有效的 dsh.bundle': 'Declares a valid dsh.bundle', '仓库未归档且不是 Fork': 'Repository is unarchived and not a fork',
    '例如：owner/repo': 'Example: owner/repository', '自动发现检查结果': 'Auto-discovery check results', '待检查': 'Pending', '通过': 'Passed', '未通过': 'Failed',
    '提交到 GitHub': 'Submit to GitHub', '先检查仓库，GitHub 提交会自动带上预检结果。': 'Check the repository first. The GitHub submission will include the pre-check results.',
    '补充审核资料': 'Add review details', 'GitHub 用户名': 'GitHub username', '用于在公开审核记录中联系你。': 'Used to contact you in the public review record.', '插件简介': 'Plugin summary', '补充说明': 'Additional notes', '可选': 'optional', '至少 20 个字符': '20 characters minimum',
    '我是该仓库的所有者或主要维护者，并有权提交收录。': 'I own or substantially maintain this repository and am authorized to submit it.', '我理解仓库地址、简介和补充说明会公开进入 GitHub 审核 Issue。': 'I understand that the repository, summary, and notes will appear in a public GitHub review issue.',
    '由 Cloudflare Turnstile 保护，验证结果不会公开。': 'Protected by Cloudflare Turnstile. Verification results are not public.', '改用 GitHub 提交 ↗': 'Use GitHub instead ↗', '已进入审核队列': 'Added to the review queue', '查看公开审核记录 ↗': 'View public review record ↗',
    '发布前准备': 'Before you submit', '审核会怎样进行': 'How review works', '系统创建公开审核 Issue，并指派维护者。': 'The system creates a public review issue and assigns the maintainer.', '预检结果、作者说明和反馈集中记录。': 'Pre-checks, author context, and feedback stay together.', '需要调整时，在同一条审核记录中跟进。': 'Follow up in the same review record when changes are needed.', '符合收录契约后，由目录同步任务更新列表。': 'Once the listing contract is met, the sync job updates the directory.', '备用 GitHub 提交通道': 'GitHub fallback channel',
    '浏览 GitHub Topic': 'Browse GitHub topic', '检查中…': 'Checking…', '重新检查': 'Check again',
    '检查通过。这个仓库会在下一轮同步中被自动发现。': 'Checks passed. This repository will be discovered during the next sync.', '加载更多': 'Load more',
    '收录 · 本站规则': 'Listing · Registry policy', '怎样进入可安装列表。': 'How plugins enter the installable registry.',
    '这里说明 Harness Registry 自己执行的发现、验证和治理规则。本页就是本站完整规范，所有入口均在站内完成。': 'This page documents the discovery, verification, and governance rules enforced by Harness Registry. This is the complete policy, and every entry point stays within this site.',
    '自动收录条件': 'Automatic listing requirements', '仓库必须同时满足以下条件，才能进入可安装插件列表；缺少有效 dsh.bundle、但具有额外 DSH 关联信号的候选仓库仍会公开展示并标注状态。': 'A repository must meet every requirement below to enter the installable plugin list. Candidates without a valid dsh.bundle remain visible only when they provide an additional DSH relevance signal.',
    '公开且可访问': 'Public and accessible', '同步任务必须能读取仓库元数据和根目录 package.json。': 'The sync job must be able to read repository metadata and the root package.json.',
    '已归档仓库和 Fork 不会被本站收录。': 'Archived repositories and forks are not listed.',
    '带有发现标记': 'Discovery marker present', '候选相关性明确': 'Candidate relevance established', '缺少有效 bundle 时，仓库名称、简介或额外 Topic 必须还能表明它与 DSH 有关；仅有发现 Topic 的仓库不会展示。': 'Without a valid bundle, the repository name, description, or an additional topic must still establish a DSH connection. The discovery topic alone is not enough for display.',
    '声明可安装 bundle': 'Installable bundle declared', 'Manifest 与 Patch 已确认': 'Manifest and patch confirmed', '自动发现，根目录 bundle 格式有效，且引用的 Patch 文件存在；可进入可安装列表。': 'Automatically discovered with a valid root bundle and an existing referenced patch file; eligible for the installable list.',
    '状态符合要求': 'Repository status eligible',
    'Manifest 最低契约': 'Minimum manifest contract', '本站显示的状态': 'Statuses shown by this registry', '状态说明的是本站验证到了什么，不代表对插件代码作出安全背书。': 'Statuses describe what this registry verified; they are not a security endorsement of plugin code.',
    'Manifest 格式检查通过': 'Manifest format checked', '来源：社区目录': 'Source: community catalog', '从社区维护的公开目录同步；本站没有检查其 Manifest、功能质量或安全性。': 'Synchronized from a community-maintained public catalog; this registry did not check its Manifest, functionality, quality, or security.',
    '精选': 'Curated', '缺少有效 dsh.bundle': 'Valid dsh.bundle missing', '仓库已被发现并显示在浏览列表中，但不提供安装命令；补充有效声明后会自动转为可安装状态。': 'The repository is visible in the directory, but no install command is provided. It becomes installable automatically after adding a valid declaration.',
    '已隔离': 'Quarantined', '因误收录、重复、风险或治理决定被排除，不出现在公开列表。': 'Excluded for misclassification, duplication, risk, or a governance decision; not shown in the public list.',
    '验证边界': 'Verification boundary', '本站只检查公开元数据和 manifest 结构，不运行插件代码，不验证安装后的行为，也不持续监控权限变化。': 'The Registry checks public metadata and manifest shape only. It does not run plugin code, verify post-install behavior, or continuously monitor permission changes.',
    '复制安装命令只代表命令已进入剪贴板，不代表插件已经安装。安装前请自行检查仓库内容、依赖和所需权限。': 'Copying an install command only places it on the clipboard; it does not install the plugin. Review the repository, dependencies, and requested permissions before installation.',
    '同步与移除': 'Sync and removal', '公开数据按计划定时刷新。新仓库不会立即出现，元数据也可能在下一轮同步前保持旧值。': 'Public data refreshes on a schedule. New repositories do not appear immediately, and metadata may remain stale until the next sync.',
    '不再满足条件、已归档或被隔离的插件会从公开列表移除。为避免异常同步覆盖健康数据，数量大幅下降或发现不完整时会停止发布新快照。': 'Plugins that no longer qualify, are archived, or are quarantined are removed from the public list. A new snapshot is withheld when discovery is incomplete or counts drop unexpectedly.',
    '检查我的仓库': 'Check my repository', '返回插件列表': 'Back to plugins',
    '本站掌握的信息': 'What this registry knows', '常见需求': 'Common needs', '页面目录': 'On this page'
  };

  var placeholders = {
    '描述你想让 Harness 做什么…': 'Describe what you want Harness to do…', 'owner/repo 或 GitHub URL': 'owner/repo or GitHub URL', '例如：octocat': 'e.g. octocat',
    '用一两句话说明插件解决什么问题、提供什么能力。': 'In one or two sentences, explain the problem and capability.',
    '可以补充已知限制、迁移说明或希望审核者重点关注的内容。': 'Add known limitations, migration notes, or anything reviewers should focus on.'
  };

  function translateText(raw) {
    if (locale !== 'en-US' || !raw || !raw.trim()) return raw;
    var lead = raw.match(/^\s*/)[0];
    var tail = raw.match(/\s*$/)[0];
    var text = raw.trim();
    if (en[text]) return lead + en[text] + tail;
    text = text
      .replace(/^(\d+) 个结果$/, '$1 results')
      .replace(/^(\d+) 天前$/, '$1 days ago')
      .replace(/^(\d+) 周前$/, '$1 weeks ago')
      .replace(/^(\d+) 个月前$/, '$1 months ago')
      .replace(/^昨天$/, 'Yesterday')
      .replace(/ · 官方$/, ' · Official')
      .replace(/更新$/, ' updated')
      .replace(/次 \/ 周$/, '/ week');
    Object.keys(en).sort(function (a, b) { return b.length - a.length; }).forEach(function (key) {
      if (text.indexOf(key) >= 0) text = text.split(key).join(en[key]);
    });
    return lead + text + tail;
  }

  function translateElement(root) {
    if (locale !== 'en-US') return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var parent = node.parentElement;
      if (!parent || /^(SCRIPT|STYLE|CODE)$/.test(parent.tagName)) return;
      // [data-dyn] 标记的子树承载第三方注册表内容（插件名/简介），模糊词典不得改写。
      if (parent.closest('[data-dyn]')) return;
      node.nodeValue = translateText(node.nodeValue);
    });
    if (root.querySelectorAll) {
      root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(function (el) {
        ['placeholder', 'title', 'aria-label'].forEach(function (attr) {
          var value = el.getAttribute(attr);
          if (!value) return;
          el.setAttribute(attr, placeholders[value] || translateText(value).trim());
        });
      });
    }
  }

  function addSwitcher() {
    var host = document.querySelector('.topbar-r');
    if (!host || host.querySelector('.locale-switch')) return;
    var button = document.createElement('button');
    button.className = 'locale-switch';
    button.type = 'button';
    button.textContent = locale === 'zh-CN' ? 'EN' : '中';
    button.setAttribute('aria-label', locale === 'zh-CN' ? 'Switch to English' : '切换到中文');
    button.addEventListener('click', function () {
      localStorage.setItem(STORAGE_KEY, locale === 'zh-CN' ? 'en-US' : 'zh-CN');
      location.reload();
    });
    host.insertBefore(button, host.lastElementChild);
  }

  function translateTitle() {
    if (locale !== 'en-US') return;
    var titles = {
      '/': 'DeepSeek Harness Plugin Registry',
      '/index.html': 'DeepSeek Harness Plugin Registry',
      '/dashboard.html': 'Stats — DeepSeek Harness Plugin Registry',
      '/plugin-detail.html': 'Plugin Details — DeepSeek Harness Plugin Registry',
      '/publish.html': 'Publish Plugin — DeepSeek Harness Plugin Registry'
      , '/policy.html': 'Listing Policy — DeepSeek Harness Plugin Registry'
    };
    document.title = titles[location.pathname] || document.title;
  }

  document.documentElement.lang = locale;
  translateTitle();
  translateElement(document.body);
  addSwitcher();

  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.parentElement && !node.parentElement.closest('[data-dyn]')) node.nodeValue = translateText(node.nodeValue);
        }
        else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.HRI18N = { locale: locale, translateText: translateText };
})();
