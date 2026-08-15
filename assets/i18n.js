/* Harness Registry — lightweight zh-CN / en-US runtime i18n */
(function () {
  'use strict';

  var STORAGE_KEY = 'harness-registry-locale';
  var saved = localStorage.getItem(STORAGE_KEY);
  var locale = saved || (navigator.language && navigator.language.toLowerCase().indexOf('zh') === 0 ? 'zh-CN' : 'en-US');

  var en = {
    '浏览插件': 'Browse', '发布': 'Publish', '统计': 'Stats', '规范': 'Policy', '返回插件列表': 'Back to plugins',
    '发布你的插件': 'Publish your plugin', '审核规范': 'Review policy', '收录规范': 'Listing policy', 'API 文档': 'API docs',
    'DeepSeek Harness': 'DeepSeek Harness', '数据接口 API': 'Data API', '返回插件库': 'Back to registry',
    '举报此插件': 'Report plugin', '作者协议': 'Author agreement',
    '给 Harness 装上能力。': 'Give Harness new capabilities.',
    '路由、检索、评测、安全 —— 社区维护的插件都在这里。新手不必读懂源码：复制一行命令，回车，装好了。': 'Routing, retrieval, evaluation, and security — community-maintained plugins in one place. Copy one command, press Enter, and you are ready.',
    '搜索插件、作者或能力关键词…': 'Search plugins, authors, or capabilities…',
    '收录插件': 'Plugins', '本周下载': 'Weekly installs', '认证作者': 'Verified authors', '兼容 CLI 版本': 'Compatible CLI',
    '全部': 'All', '工具': 'Tools', '检索': 'Retrieval', '路由': 'Routing', '评测': 'Evaluation',
    '安全': 'Security', '调试': 'Debugging', '集成': 'Integrations', '性能': 'Performance', '数据': 'Data',
    '仅看官方认证': 'Verified only', '按周下载量': 'Weekly installs', '按评分': 'Rating', '按最近更新': 'Recently updated',
    '本周精选': 'Featured this week', '全部插件': 'All plugins', '每周一更新': 'Updated every Monday',
    '官方': 'Official', '安装': 'Install', '已复制 ✓': 'Copied ✓',
    '没有匹配的插件 —— 试试换个关键词，或': 'No matching plugins — try another keyword, or ',
    '自己发布一个': 'publish your own',
    '统计 · 公开数据': 'Stats · Public data', 'Registry 的脉搏。': 'The pulse of the registry.',
    '所有数字每 10 分钟刷新一次，来自 CLI 的匿名安装回执。趋势比绝对值重要 —— 看曲线，不看单日尖峰。': 'All metrics refresh every 10 minutes from anonymous CLI installation receipts. Trends matter more than one-day spikes.',
    '环比上周': 'week over week', '个本周新入库': 'new this week', '活跃作者': 'Active authors',
    '近 30 天有发布': 'Published in the last 30 days', '平均评分': 'Average rating', '全部已评分插件': 'All rated plugins',
    '下载趋势': 'Install trend', '近 30 天 · 全站日下载量': 'Last 30 days · daily installs',
    '分类分布': 'Category distribution', '按周下载量': 'By weekly installs', '插件榜': 'Plugin ranking',
    '周下载 Top 5 · 环比变化': 'Top 5 weekly installs · change', '作者榜': 'Author ranking',
    '按全部插件的周下载合计': 'Total weekly installs across plugins', '插件数': 'Plugins', '周下载': 'Weekly installs', '环比': 'Change',
    '30 天前': '30 days ago', '20 天前': '20 days ago', '10 天前': '10 days ago', '今天': 'Today',
    '复制安装命令': 'Copy install command', '安装步骤': 'Install steps', '复制命令': 'Copy command', '收藏': 'Favorite',
    '官方认证': 'Verified', '需要 Harness CLI': 'Requires Harness CLI', '还没装 CLI？先运行': 'Need the CLI? Run',
    '插件信息': 'Plugin information', '版本记录': 'Versions', '权限': 'Permissions', '依赖': 'Dependencies',
    '它能做什么': 'What it does', '三分钟上手': 'Get started in three minutes', '新手常见问题': 'Common questions',
    '维护者': 'Maintainer', '官方团队 · 已验证域名 dsh.dev': 'Official team · verified dsh.dev domain',
    '周下载趋势': 'Weekly install trend', '本周': 'This week', '信息': 'Information', '许可证': 'License',
    '发布于': 'Published', '最近更新': 'Last updated', '仓库': 'Repository', '安全扫描': 'Security scan',
    '通过 · 0 告警': 'Passed · 0 alerts', '当前': 'Current', '运行时': 'Runtime', '协议': 'Protocol',
    '插件依赖': 'Plugin dependencies', '无（零依赖设计）': 'None (zero-dependency)', '冲突': 'Conflicts',
    '网络访问': 'Network access', '进程执行': 'Process execution', '需确认': 'Confirmation required', '敏感': 'Sensitive',
    '连接你声明的 MCP 服务器': 'Connects to declared MCP servers', '拉起本地 MCP stdio 服务': 'Starts local MCP stdio servers',
    '把 MCP 工具服务器接入 Harness 会话 —— 一次配置，即可让模型调用文件系统、数据库与内部 API，全程走 Harness 的权限审批。': 'Connect MCP tool servers to Harness sessions so models can call filesystems, databases, and internal APIs through the Harness approval flow.',
    'MCP（Model Context Protocol）让模型可以安全地调用外部工具。mcp-bridge 是 Harness 与 MCP 服务器之间的桥：你在配置里声明服务器地址，Harness 会话中就多出一组可用工具，且每一次调用都会经过 Harness 的权限审批流。': 'MCP lets models call external tools safely. mcp-bridge connects Harness to declared MCP servers, with every call passing through the Harness approval flow.',
    '安装后在': 'After installation, declare a server in', '里声明一个服务器：': ':',
    '之后直接对 Harness 说「查一下昨天的订单量」，它会自动选择': 'Then ask Harness to query yesterday’s orders. It will select the',
    '工具并展示调用详情。': 'tool and show the call details.',
    '装完没反应？': 'Nothing happened after install?', '每次都弹审批？': 'Approval every time?', '能同时接几个服务器？': 'How many servers can I connect?',
    '确认 CLI 版本 ≥ 0.9.0，然后': 'Confirm CLI ≥ 0.9.0, then run', '一键体检。': 'for diagnostics.',
    '把只读工具加进': 'Add read-only tools to the', '白名单。': 'allowlist.', '没有硬性上限，实测 8 个并发稳定运行。': 'There is no hard limit; eight concurrent servers are tested.',
    '插件声明的每一项权限都会在安装时向你确认。Harness 采用最小授权：未声明的能力一律拒绝。': 'Every declared permission is confirmed during installation. Harness denies capabilities that were not explicitly declared.',
    '作者工作台': 'Author workspace', '把你的插件，放进所有人的终端。': 'Put your plugin in everyone’s terminal.',
    '第一次发布也不必慌：下面每一步都有实时校验。通过后进入人工审核，通常 1–2 个工作日。': 'Every step includes live validation. Once submitted, manual review usually takes 1–2 business days.',
    '填写信息': 'Plugin details', '名称、分类、简介': 'Name, category, description', '声明权限': 'Declare permissions',
    '最小授权原则': 'Least privilege', '校验 manifest': 'Validate manifest', '实时语法检查': 'Live syntax checks',
    '提交审核': 'Submit for review', '1–2 个工作日': '1–2 business days', '插件 ID': 'Plugin ID',
    '显示名称': 'Display name', '初始版本': 'Initial version', '分类': 'Category', '一句话简介': 'Short description',
    '全局唯一，发布后不可改名。用户通过': 'Globally unique and immutable after publishing. Users install it with',
    '安装它。': '.', '字，至少 10 字。': ' characters; at least 10.', '再写具体一点（至少 10 字），告诉用户它解决什么问题。': 'Be more specific — use at least 10 characters to explain the problem it solves.',
    '（新手提示：能不申请就不申请，审核会逐个核对）': '(Request only what you need; reviewers check every permission.)',
    '文件读取': 'File read', '读取工作区内的文件': 'Read workspace files', '文件写入': 'File write',
    '创建或修改本地文件': 'Create or modify local files', '发起外部 HTTP 请求': 'Make external HTTP requests',
    '运行子进程（敏感）': 'Run subprocesses (sensitive)', '发布前检查': 'Pre-publish checks',
    '插件 ID 合规且未被占用': 'Plugin ID is valid and available', '版本号符合 semver': 'Version follows semver',
    '简介 ≥ 10 字': 'Description is at least 10 characters', 'manifest 是合法 JSON': 'Manifest is valid JSON',
    'manifest 与表单信息一致': 'Manifest matches form values', '权限已在表单中同步声明': 'Permissions match the manifest',
    '提交后进入安全扫描 + 人工审核队列。首次发布需验证作者邮箱。': 'Submissions enter security scanning and manual review. First-time authors must verify their email.',
    '已进入审核队列 · 编号 #A-2041': 'Added to review queue · #A-2041', '提交中…': 'Submitting…', '已提交 ✓': 'Submitted ✓',
    '可直接编辑，右侧清单会实时校验。': 'Edit directly; the checklist validates in real time.', 'JSON 解析失败，请检查语法。': 'JSON parsing failed. Check the syntax.',
    'ID 只能包含小写字母、数字和连字符，且至少 3 个字符。': 'Use lowercase letters, numbers, and hyphens; minimum 3 characters.',
    '遵循语义化版本，例如 0.1.0。': 'Use semantic versioning, such as 0.1.0.',
    '给用户看的名字': 'Name shown to users', '用户在列表里只会看到这一句，说清楚它解决什么问题。': 'This is the one sentence users see in the list. Explain the problem it solves.'
    , '插件作者': 'Plugin authors', '自动发现': 'Auto-discovered', 'Manifest 已验证': 'Manifest verified', '仅看社区目录': 'Community catalog only',
    '按 Stars': 'By Stars', '按 Forks': 'By Forks',
    '全部语言': 'All languages', '编程语言': 'Programming language', '语言数据待同步': 'Language data pending',
    '插件数据暂时无法加载，请稍后重试。': 'Plugin data is temporarily unavailable. Please try again later.',
    '插件数据暂时无法加载。': 'Plugin data is temporarily unavailable.', '作者暂未提供简介。': 'No description provided.',
    '社区目录收录': 'Community catalog', '查看 GitHub': 'View on GitHub', '验证范围': 'Verification scope', '社区数据': 'Community data',
    '插件数据加载失败': 'Unable to load plugin data', '没有找到这个插件': 'Plugin not found',
    '数据来自社区目录与 GitHub dsh-plugin Topic。这里不制造下载量或评分，只展示可以被验证的公开指标。': 'Data comes from the community catalog and the GitHub dsh-plugin topic. No fabricated installs or ratings — only verifiable public metrics.',
    '已收录仓库合计': 'Across listed repositories', '可安装插件': 'Installable plugins', '按 GitHub owner 去重': 'Unique GitHub owners',
    'manifest 验证通过': 'Manifest verified', '可直接安装': 'Ready to install', '按可安装插件数量': 'By installable plugin count', '来源构成': 'Source composition', '可信等级': 'Trust levels',
    '社区目录与自动发现': 'Community catalog and auto-discovered', '发布列表与审计队列': 'Published registry and audit queue', '待审查': 'Pending review', '已隔离': 'Quarantined', '数据生成于：': 'Generated: ', '按收录插件的 Stars 合计': 'Total Stars across listed plugins',
    '每 2 小时自动同步': 'Auto-sync every 2 hours', '每 2 小时自动发现': 'Auto-discovery every 2 hours',
    '提交仓库，公开走完审核。': 'Submit your repository. Keep the review public.',
    '先运行仓库预检，再创建带检查结果的 GitHub Issue。维护者反馈、修复记录和最终结论都留在 GitHub；满足契约的仓库仍会自动发现。': 'Run the repository pre-check, then create a GitHub issue with the results. Maintainer feedback, fixes, and the final decision stay on GitHub; eligible repositories are still auto-discovered.',
    'GitHub 提交流程': 'GitHub submission flow', '检查仓库': 'Check repository', '公开元数据': 'Public metadata', '预填提交': 'Prefill submission', '检查结果': 'Check results', 'GitHub 审核': 'GitHub review', 'Issue 可追踪': 'Trackable issue', '进入列表': 'Get listed', '合并后同步': 'Sync after approval',
    '每 2 小时': 'Every 2 hours', '无需提交表单': 'No submission form', '自动发现最低契约': 'Minimum auto-discovery contract', '自动发现要求根目录 package.json 声明 dsh.bundle。': 'Auto-discovery requires dsh.bundle in the root package.json.',
    '让自动发现生效': 'Enable auto-discovery', '在根目录 package.json 中声明可安装的 bundle。': 'Declare an installable bundle in the root package.json.',
    '在 GitHub 仓库设置中添加': 'Add the', 'Topic。': 'topic.', '保持仓库公开且未归档；Fork 默认不会收录。': 'Keep the repository public and unarchived; forks are excluded by default.',
    '等待下一次定时同步，或在下面立即检查。': 'Wait for the next scheduled sync or check it below.', '查看完整收录规范': 'View the full listing policy',
    'GitHub 是正式提交通道': 'GitHub is the official submission channel', '每次提交都会创建公开 Issue，用于自动检查、维护者反馈和最终结论。': 'Every submission creates a public issue for automated checks, maintainer feedback, and the final decision.', '查看提交队列': 'View submission queue',
    '提交插件仓库': 'Submit a plugin repository', '输入公开 GitHub 仓库，先完成预检，再生成带结果的正式提交。': 'Enter a public GitHub repository, run the pre-check, then generate a formal submission with the results.',
    'GitHub 仓库': 'GitHub repository', '公开仓库存在': 'Public repository exists', '包含 dsh-plugin Topic': 'Includes the dsh-plugin topic',
    '声明有效的 dsh.bundle': 'Declares a valid dsh.bundle', '仓库未归档且不是 Fork': 'Repository is unarchived and not a fork',
    '例如：owner/repo': 'Example: owner/repository', '自动发现检查结果': 'Auto-discovery check results', '待检查': 'Pending', '通过': 'Passed', '未通过': 'Failed',
    '提交到 GitHub': 'Submit to GitHub', '先检查仓库，GitHub 提交会自动带上预检结果。': 'Check the repository first. The GitHub submission will include the pre-check results.',
    '发布前准备': 'Before you submit', '提交后会发生什么': 'What happens after submission', 'GitHub 创建公开提交 Issue。': 'GitHub creates a public submission issue.', '预检结果和维护者反馈集中记录。': 'Pre-check results and maintainer feedback stay in one place.', '按评论修复仓库后，在同一 Issue 跟进。': 'Fix the repository and follow up in the same issue.', '审核完成后进入目录同步。': 'After approval, the repository enters directory sync.', '直接填写 GitHub 表单': 'Open the GitHub form directly',
    '浏览 GitHub Topic': 'Browse GitHub topic', '检查中…': 'Checking…', '重新检查': 'Check again',
    '检查通过。这个仓库会在下一轮同步中被自动发现。': 'Checks passed. This repository will be discovered during the next sync.',
    '还有项目未通过，请按上面的契约修复后重新检查。': 'Some checks failed. Fix the repository contract above and check again.'
    , '加载更多': 'Load more',
    '收录 · 本站规则': 'Listing · Registry policy', '怎样进入公开列表。': 'How plugins enter the public registry.',
    '这里说明 Harness Registry 自己执行的发现、验证和治理规则。本页就是本站完整规范，所有入口均在站内完成。': 'This page documents the discovery, verification, and governance rules enforced by Harness Registry. This is the complete policy, and every entry point stays within this site.',
    '自动收录条件': 'Automatic listing requirements', '仓库必须同时满足以下条件，缺少任何一项都不会进入公开插件列表。': 'A repository must meet every requirement below before it can enter the public plugin list.',
    '公开且可访问': 'Public and accessible', '同步任务必须能读取仓库元数据和根目录 package.json。': 'The sync job must be able to read repository metadata and the root package.json.',
    '带有发现标记': 'Discovery marker present', '仓库需声明 dsh-plugin Topic，供定时任务发现。': 'The repository must declare the dsh-plugin topic so the scheduled job can discover it.',
    '声明可安装 bundle': 'Installable bundle declared', '根目录 package.json 的 dsh.bundle.patch 必须是安全的相对路径。': 'The root package.json must provide dsh.bundle.patch as a safe relative path.',
    '状态符合要求': 'Repository status eligible', '已归档仓库和 Fork 不会自动进入公开列表。': 'Archived repositories and forks are not automatically listed.',
    'Manifest 最低契约': 'Minimum manifest contract', 'patch 路径不能是绝对路径，也不能通过 .. 跳出仓库目录。对应文件需要随仓库一同维护。': 'The patch path cannot be absolute or escape the repository with ... The referenced file must be maintained in the repository.',
    '本站显示的状态': 'Statuses shown by this registry', '状态说明的是本站验证到了什么，不代表对插件代码作出安全背书。': 'Statuses describe what this registry verified; they are not a security endorsement of plugin code.',
    'Manifest 已验证': 'Manifest verified', '自动发现，并通过根目录 bundle 格式校验；可进入公开列表。': 'Automatically discovered and passed the root bundle shape check; eligible for the public list.',
    '精选': 'Curated', '由 Registry 维护流程标记的收录项；仍不代表功能质量或安全性已经审核。': 'An entry selected through the Registry maintenance process; this still does not mean its quality or security was audited.',
    '待审查': 'Pending review', '仓库已被发现，但尚未满足可安装契约，不出现在公开安装列表。': 'The repository was discovered but does not yet meet the installable contract, so it is excluded from the public install list.',
    '已隔离': 'Quarantined', '因误收录、重复、风险或治理决定被排除，不出现在公开列表。': 'Excluded for misclassification, duplication, risk, or a governance decision; not shown in the public list.',
    '验证边界': 'Verification boundary', '本站只检查公开元数据和 manifest 结构，不运行插件代码，不验证安装后的行为，也不持续监控权限变化。': 'The Registry checks public metadata and manifest shape only. It does not run plugin code, verify post-install behavior, or continuously monitor permission changes.',
    '复制安装命令只代表命令已进入剪贴板，不代表插件已经安装。安装前请自行检查仓库内容、依赖和所需权限。': 'Copying an install command only places it on the clipboard; it does not install the plugin. Review the repository, dependencies, and requested permissions before installation.',
    '同步与移除': 'Sync and removal', '公开数据按计划定时刷新。新仓库不会立即出现，元数据也可能在下一轮同步前保持旧值。': 'Public data refreshes on a schedule. New repositories do not appear immediately, and metadata may remain stale until the next sync.',
    '不再满足条件、已归档或被隔离的插件会从公开列表移除。为避免异常同步覆盖健康数据，数量大幅下降或发现不完整时会停止发布新快照。': 'Plugins that no longer qualify, are archived, or are quarantined are removed from the public list. A new snapshot is withheld when discovery is incomplete or counts drop unexpectedly.',
    '检查我的仓库': 'Check my repository', '返回插件列表': 'Back to plugins'
  };

  var placeholders = {
    '搜索插件、作者或能力关键词…': 'Search plugins, authors, or capabilities…',
    '例如：git-scribe（小写字母、数字、连字符）': 'e.g. git-scribe (lowercase letters, numbers, hyphens)',
    '给用户看的名字': 'Name shown to users',
    '用户在列表里只会看到这一句，说清楚它解决什么问题。': 'Explain the problem this plugin solves.'
    , 'owner/repo 或 GitHub URL': 'owner/repo or GitHub URL'
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
      if (node.parentElement && !/^(SCRIPT|STYLE|CODE)$/.test(node.parentElement.tagName)) node.nodeValue = translateText(node.nodeValue);
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
        if (node.nodeType === Node.TEXT_NODE) node.nodeValue = translateText(node.nodeValue);
        else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.HRI18N = { locale: locale, translateText: translateText };
})();
