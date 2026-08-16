/* Harness Registry — real registry loader and shared render helpers */
import { writeClipboardText } from './clipboard.js'
import { hasDshCandidateContext } from './candidate-relevance.js'
import { computeRankingScore } from './registry-ranking.js'
import { trackPluginEvent } from './track.js'

(function () {
  'use strict';

  var STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
  var FORK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v2c0 3 2 4 6 4s6-1 6-4V7M12 13v4"/></svg>';

  function locale() {
    return window.HRI18N && window.HRI18N.locale === 'en-US' ? 'en' : 'zh';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char];
    });
  }

  function fmtNumber(value) {
    var n = Number(value) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  function description(plugin) {
    return plugin.description && (plugin.description[locale()] || plugin.description.zh || plugin.description.en) || '';
  }

  function categoryName(key) {
    var entry = HR.registry.categories && HR.registry.categories[key];
    return entry ? (entry[locale()] || entry.zh || entry.en || key) : key;
  }

  function avatar(plugin, cls) {
    var el = document.createElement('div');
    el.className = 'pavatar' + (plugin.source === 'curated' ? '' : ' alt') + (cls ? ' ' + cls : '');
    var fallback = document.createElement('span');
    fallback.className = 'pavatar-fallback';
    fallback.textContent = plugin.name.charAt(0).toUpperCase();
    el.appendChild(fallback);
    if (plugin.icon) {
      var image = document.createElement('img');
      image.src = plugin.icon;
      image.alt = '';
      image.loading = cls === 'lg' ? 'eager' : 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('load', function () { el.classList.add('has-image'); });
      image.addEventListener('error', function () { image.remove(); });
      el.appendChild(image);
    }
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function copyText(button, command) {
    var original = button.textContent;
    button.setAttribute('aria-live', 'polite');
    return writeClipboardText(command).then(function () {
      button.textContent = locale() === 'en' ? 'Copied ✓' : '已复制 ✓';
      button.classList.add('done');
      return true;
    }).catch(function () {
      button.textContent = locale() === 'en' ? 'Copy failed' : '复制失败';
      button.classList.add('error');
      return false;
    }).finally(function () {
      setTimeout(function () {
        button.textContent = original;
        button.classList.remove('done', 'error');
      }, 1500);
    });
  }

  var activeInstallPlugin = null;

  function manifestShapeValidated(plugin) {
    return Boolean(plugin && plugin.verification && plugin.verification.manifest === 'shape_validated');
  }

  function pendingReview(plugin) {
    return Boolean(plugin && plugin.trustLevel === 'pending_review');
  }

  function sourceLabel(plugin) {
    if (plugin.recommendationSource === 'x') return locale() === 'en' ? 'Source: X recommendation' : '来源：X 推荐';
    if (plugin.source === 'curated') return locale() === 'en' ? 'Source: community catalog' : '来源：社区目录';
    if (pendingReview(plugin)) return locale() === 'en' ? 'Source: GitHub candidate' : '来源：GitHub 候选';
    return locale() === 'en' ? 'Source: GitHub discovery' : '来源：GitHub 自动发现';
  }

  function manifestLabel(plugin) {
    if (manifestShapeValidated(plugin)) return locale() === 'en' ? 'Manifest format checked' : 'Manifest 格式检查通过';
    if (pendingReview(plugin)) return locale() === 'en' ? 'Valid dsh.bundle missing' : '缺少有效 dsh.bundle';
    return locale() === 'en' ? 'Manifest not checked' : 'Manifest 未检查';
  }

  function installActionLabel(plugin) {
    if (manifestShapeValidated(plugin)) return locale() === 'en' ? 'Install steps' : '安装步骤';
    return locale() === 'en' ? 'View install method' : '查看安装方式';
  }

  function ensureInstallDialog() {
    var existing = document.getElementById('install-dialog');
    if (existing) return existing;
    var english = locale() === 'en';
    var dialog = document.createElement('dialog');
    dialog.id = 'install-dialog';
    dialog.className = 'install-dialog';
    dialog.setAttribute('aria-labelledby', 'install-dialog-title');
    dialog.innerHTML =
      '<div class="install-dialog-card">' +
        '<header class="install-dialog-head">' +
          '<div><span class="install-dialog-kicker">DSH PLUGIN INSTALL</span><h2 id="install-dialog-title"></h2></div>' +
          '<button class="install-dialog-close" type="button" data-install-close aria-label="' + (english ? 'Close install guide' : '关闭安装说明') + '">×</button>' +
        '</header>' +
        '<p class="install-dialog-intro">' + (english ? 'Copying the command does not install the plugin. Run it in a terminal on the computer where DeepSeek Harness is installed.' : '复制命令不会自动安装。请在运行 DeepSeek Harness 的电脑上打开终端并执行。') + '</p>' +
        '<aside class="install-dialog-evidence" data-install-evidence></aside>' +
        '<ol class="install-steps">' +
          '<li><span>01</span><div><b>' + (english ? 'Open a terminal' : '打开终端') + '</b><p>' + (english ? 'Use the computer where DeepSeek Harness is installed.' : '在已经安装 DeepSeek Harness 的电脑上操作。') + '</p></div></li>' +
          '<li><span>02</span><div><b>' + (english ? 'Copy the command below' : '复制下面的命令') + '</b><p>' + (english ? 'The button only writes the command to your clipboard.' : '按钮只会把命令写入剪贴板，不会直接执行。') + '</p></div></li>' +
          '<li><span>03</span><div><b>' + (english ? 'Paste and press Enter' : '粘贴并按 Enter') + '</b><p>' + (english ? 'Wait for DSH to report the result, then follow any plugin-specific setup in its README.' : '等待 DSH 输出安装结果；如插件需要额外配置，请继续查看仓库 README。') + '</p></div></li>' +
        '</ol>' +
        '<div class="install-dialog-command"><span>$</span><code data-install-command></code></div>' +
        '<button class="btn btn-primary install-dialog-copy" type="button" data-install-copy autofocus>' + (english ? 'Copy install command' : '复制安装命令') + '</button>' +
        '<p class="install-dialog-status" data-install-status aria-live="polite">' + (english ? 'Nothing is executed until you paste the command into a terminal.' : '只有粘贴到终端并执行后，安装才会开始。') + '</p>' +
        '<aside class="install-dialog-safety"><b>' + (english ? 'Registry boundary' : '本站验证边界') + '</b><p>' + (english ? 'Plugins are third-party code from GitHub. This registry does not audit plugin security or test installation. Review the repository before running the command.' : '插件是来自 GitHub 的第三方代码。本站不审计插件安全性，也不测试实际安装；执行命令前请先检查仓库。') + '</p></aside>' +
        '<footer class="install-dialog-links"><a data-install-repo target="_blank" rel="noopener">' + (english ? 'Review GitHub source' : '查看 GitHub 源码') + '</a><a href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noopener">' + (english ? 'Need DeepSeek Harness?' : '还没安装 DeepSeek Harness？') + '</a></footer>' +
      '</div>';
    document.body.appendChild(dialog);

    dialog.querySelector('[data-install-close]').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('[data-install-copy]').addEventListener('click', function () {
      if (!activeInstallPlugin) return;
      var tracked = activeInstallPlugin;
      var status = dialog.querySelector('[data-install-status]');
      copyText(this, tracked.install).then(function (copied) {
        if (copied) trackPluginEvent(tracked.id, 'copy');
        status.textContent = copied
          ? (english ? 'Command copied. The plugin is not installed yet. Switch to your terminal, paste the command, and press Enter.' : '命令已复制，插件尚未安装。请切换到终端，粘贴命令并按 Enter。')
          : (english ? 'Copy failed. Select the command above and copy it manually.' : '复制失败，请选中上方命令手动复制。');
      });
    });
    dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', function () {
      document.documentElement.classList.remove('modal-open');
      activeInstallPlugin = null;
    });
    return dialog;
  }

  function openInstallDialog(plugin) {
    activeInstallPlugin = plugin;
    var english = locale() === 'en';
    var dialog = ensureInstallDialog();
    var manifestChecked = manifestShapeValidated(plugin);
    var patchStatus = plugin.verification && plugin.verification.patch;
    var verifiedCommit = typeof plugin.verifiedCommit === 'string' && /^[0-9a-f]{40}$/.test(plugin.verifiedCommit) ? plugin.verifiedCommit : '';
    var commitLine = verifiedCommit
      ? '<p class="install-dialog-commit">' + (english ? 'Manifest checked against HEAD commit ' : 'Manifest 校验时的仓库 HEAD：') +
        '<a href="https://github.com/' + escapeHtml(String(plugin.id).split('#')[0]) + '/commit/' + escapeHtml(verifiedCommit) + '" target="_blank" rel="noopener">' + escapeHtml(verifiedCommit.slice(0, 7)) + '</a>' +
        (english ? '. Installing always pulls the latest repository state.' : '。安装命令始终拉取仓库最新状态。') + '</p>'
      : '';
    dialog.querySelector('#install-dialog-title').textContent = manifestChecked
      ? (english ? 'How to install ' + plugin.name : '安装 ' + plugin.name + ' 的步骤')
      : (english ? 'Install information for ' + plugin.name : plugin.name + ' 的安装信息');
    dialog.querySelector('[data-install-command]').textContent = plugin.install;
    dialog.querySelector('[data-install-repo]').href = plugin.url;
    dialog.querySelector('[data-install-evidence]').innerHTML = '<b>' + escapeHtml(manifestLabel(plugin)) + '</b><p>' + (manifestChecked
      ? (patchStatus === 'exists'
        ? (english ? 'The root package.json matched dsh.bundle and the referenced patch file existed at synchronization time. Installation was not run or tested.' : '同步时，仓库根目录 package.json 符合 dsh.bundle 格式，且引用的 Patch 文件存在；本站没有运行或测试安装。')
        : (english ? 'The root package.json matched dsh.bundle, but the referenced patch file was not confirmed. Installation was not run or tested.' : '仓库根目录 package.json 符合 dsh.bundle 格式，但引用的 Patch 文件尚未确认；本站没有运行或测试安装。'))
      : (english ? 'This command came from the community catalog. The registry did not check the repository manifest or confirm that the command installs successfully.' : '这条命令来自社区目录；本站没有检查仓库 Manifest，也没有确认命令能够成功安装。')) + '</p>' + commitLine;
    var copyButton = dialog.querySelector('[data-install-copy]');
    copyButton.textContent = english ? 'Copy install command' : '复制安装命令';
    copyButton.classList.remove('done', 'error');
    dialog.querySelector('[data-install-status]').textContent = english ? 'Nothing is executed until you paste the command into a terminal.' : '只有粘贴到终端并执行后，安装才会开始。';
    document.documentElement.classList.add('modal-open');
    if (!dialog.open) dialog.showModal();
    copyButton.focus();
  }

  function installBtn(plugin) {
    if (pendingReview(plugin)) {
      var link = document.createElement('a');
      link.className = 'btn btn-sm btn-repository';
      link.href = plugin.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = locale() === 'en' ? 'View repository' : '查看仓库';
      link.title = locale() === 'en'
        ? 'This candidate has no verified install command; review it on GitHub'
        : '该候选项没有经过验证的安装命令，请前往 GitHub 查看';
      link.addEventListener('click', function () { trackPluginEvent(plugin.id, 'outbound'); });
      return link;
    }
    var button = document.createElement('button');
    button.className = 'btn btn-sm';
    button.textContent = installActionLabel(plugin);
    button.title = manifestShapeValidated(plugin)
      ? (locale() === 'en' ? 'Open install guide' : '打开安装说明')
      : (locale() === 'en' ? 'Review an unchecked install method' : '查看未经 Manifest 检查的安装方式');
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      openInstallDialog(plugin);
    });
    return button;
  }

  function rankPills(plugin) {
    if (pendingReview(plugin)) return '';
    var english = locale() === 'en';
    var ranking = computeRankingScore(plugin);
    var pills = [];
    if (ranking.badges.issueSubmitted) pills.push('<span class="pill pill-rank">' + (english ? 'Issue submitted' : 'Issue 收录') + '</span>');
    if (ranking.badges.newListing) pills.push('<span class="pill pill-new">' + (english ? 'New listing' : '新收录') + '</span>');
    if (ranking.badges.maintained && pills.length < 2) pills.push('<span class="pill pill-rank">' + (english ? 'Actively maintained' : '活跃维护') + '</span>');
    if (!pills.length) return '';
    var b = ranking.breakdown;
    var tooltip = english
      ? 'Recommendation ' + ranking.score.toFixed(2) + ' · popularity ' + b.pop.toFixed(2) + ' · maintenance ' + b.maint.toFixed(2) + ' · trust ×' + b.trust.toFixed(2)
      : '推荐分 ' + ranking.score.toFixed(2) + ' · 热度 ' + b.pop.toFixed(2) + ' · 维护 ' + b.maint.toFixed(2) + ' · 信任 ×' + b.trust.toFixed(2);
    return '<span class="rank-pills" title="' + escapeHtml(tooltip) + '">' + pills.join('') + '</span>';
  }

  function sourcePill(plugin) {
    var manifestClass = manifestShapeValidated(plugin) ? 'pill-manifest' : (pendingReview(plugin) ? 'pill-pending' : 'pill-unchecked');
    var special = plugin.special
      ? '<span class="pill pill-special">' + (locale() === 'en' ? 'Special listing' : '特别收录') + '</span>'
      : '';
    var manifest = manifestShapeValidated(plugin) || pendingReview(plugin)
      ? '<span class="pill ' + manifestClass + '">' + escapeHtml(manifestLabel(plugin)) + '</span>'
      : '';
    return special + rankPills(plugin) + '<span class="pill pill-source">' + escapeHtml(sourceLabel(plugin)) + '</span>' +
      manifest;
  }

  function detailHref(plugin) {
    return 'plugin-detail.html?plugin=' + encodeURIComponent(plugin.id);
  }

  function updatedLabel(value) {
    if (!value) return '';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    var stamp = date.toISOString().slice(0, 10);
    return (locale() === 'en' ? 'Updated ' : '更新于 ') + stamp;
  }

  function topicSignals(plugin) {
    return (plugin.topics || [])
      .filter(function (topic) { return !/^(dsh-plugin|deepseek-harness|dsh)$/i.test(topic); })
      .slice(0, 2)
      .map(function (topic) { return '<span class="prow-topic">#' + escapeHtml(topic) + '</span>'; })
      .join('');
  }

  function row(plugin, index) {
    var element = document.createElement('div');
    var isPending = pendingReview(plugin);
    var nameHref = isPending ? plugin.url : detailHref(plugin);
    var nameTarget = isPending ? ' target="_blank" rel="noopener"' : '';
    var category = plugin.category ? categoryName(plugin.category) : (locale() === 'en' ? 'Category pending' : '分类待确认');
    element.className = 'prow' + (isPending ? ' prow-pending' : '');
    element.innerHTML =
      '<span class="prow-idx">' + String(index + 1).padStart(3, '0') + '</span>' +
      '<span class="prow-av"></span>' +
      '<div class="prow-main">' +
        '<div class="prow-name"><a href="' + escapeHtml(nameHref) + '"' + nameTarget + '>' + escapeHtml(plugin.name) + '</a>' + sourcePill(plugin) + '</div>' +
        '<div class="prow-desc">' + escapeHtml(description(plugin) || (isPending
          ? (locale() === 'en' ? 'GitHub found this repository, but it has no recognizable plugin install entry yet.' : 'GitHub 已发现该仓库，但它还没有可识别的插件安装入口。')
          : (locale() === 'en' ? 'No description provided. Review the GitHub source before installing.' : '作者未提供简介；安装前请先查看 GitHub 源码。'))) + '</div>' +
        '<div class="prow-signals">' + topicSignals(plugin) + (updatedLabel(plugin.pushedAt) ? '<span class="prow-updated">' + updatedLabel(plugin.pushedAt) + '</span>' : '') + '</div>' +
      '</div>' +
      '<div class="prow-meta"><b>@' + escapeHtml(plugin.owner) + '</b><br>' + escapeHtml(category) + '</div>' +
      '<div class="prow-stars">' + STAR + '<b>' + fmtNumber(plugin.stars) + '</b><small>Stars</small></div>' +
      '<div class="prow-forks">' + (plugin.forks == null ? '<b>—</b>' : FORK + '<b>' + fmtNumber(plugin.forks) + '</b>') + '<small>Forks</small></div>' +
      '<div class="prow-act"></div>';
    element.querySelector('.prow-av').appendChild(avatar(plugin));
    element.querySelector('.prow-act').appendChild(installBtn(plugin));
    return element;
  }

  function normalizePendingPlugin(entry) {
    var parts = String(entry.id || '').split('/');
    var owner = entry.owner || parts.shift() || '';
    var name = entry.name || parts.join('/') || entry.id;
    return {
      id: entry.id,
      name: name,
      owner: owner,
      url: entry.url,
      description: entry.description || { zh: '', en: '' },
      category: entry.category || '',
      stars: Number(entry.stars) || 0,
      forks: entry.forks == null ? null : Number(entry.forks) || 0,
      language: entry.language || '',
      pushedAt: entry.pushedAt || null,
      addedAt: null,
      source: 'discovered',
      trustLevel: 'pending_review',
      verification: { manifest: 'not_validated', patch: 'not_checked', installation: 'not_tested' },
      topics: entry.topics || ['dsh-plugin'],
      icon: entry.icon || (owner ? 'https://github.com/' + encodeURIComponent(owner) + '.png?size=96' : '')
    };
  }

  function updateFreshness(registry) {
    var nodes = document.querySelectorAll('[data-freshness]');
    if (!nodes.length || !registry || !registry.generatedAt) return;
    var generated = Date.parse(registry.generatedAt);
    if (Number.isNaN(generated)) return;
    var hours = Math.max(0, (Date.now() - generated) / 36e5);
    var english = locale() === 'en';
    var text;
    if (hours < 1) text = english ? 'Data updated just now' : '数据刚刚更新';
    else if (hours < 24) text = english ? 'Data updated ' + Math.floor(hours) + 'h ago' : '数据更新于 ' + Math.floor(hours) + ' 小时前';
    else text = english ? 'Data updated ' + Math.floor(hours / 24) + 'd ago' : '数据更新于 ' + Math.floor(hours / 24) + ' 天前';
    nodes.forEach(function (el) {
      el.textContent = text;
      el.hidden = false;
      el.classList.toggle('stale', hours >= 24);
      el.title = (english ? 'Snapshot generated at ' : '快照生成时间：') + registry.generatedAt;
    });
  }

  async function loadRegistry() {
    var responses = await Promise.all([
      fetch('data/plugins.json', { cache: 'no-cache' }),
      fetch('data/registry-audit.json', { cache: 'no-cache' }).catch(function () { return null; })
    ]);
    var response = responses[0];
    if (!response.ok) throw new Error('Registry HTTP ' + response.status);
    var registry = await response.json();
    if (!Array.isArray(registry.plugins)) throw new Error('Invalid registry document');
    var audit = responses[1] && responses[1].ok ? await responses[1].json() : { pendingReview: [] };
    var publishedIds = new Set(registry.plugins.map(function (plugin) { return plugin.id.toLowerCase(); }));
    var candidates = Array.isArray(audit.pendingReview)
      ? audit.pendingReview.filter(function (entry) {
          return entry && entry.id && entry.url && !publishedIds.has(entry.id.toLowerCase()) && hasDshCandidateContext(entry);
        }).map(normalizePendingPlugin)
      : [];
    HR.registry = registry;
    HR.PUBLISHED = registry.plugins;
    HR.PENDING = candidates;
    HR.PLUGINS = registry.plugins.concat(candidates);
    updateFreshness(registry);
    return registry;
  }

  var HR = window.HR = {
    PLUGINS: [],
    PUBLISHED: [],
    PENDING: [],
    registry: { categories: {}, stats: {} },
    STAR: STAR,
    FORK: FORK,
    fmtNumber: fmtNumber,
    description: description,
    categoryName: categoryName,
    avatar: avatar,
    copyText: copyText,
    compareByRanking: function (a, b) { return computeRankingScore(b).score - computeRankingScore(a).score; },
    openInstallDialog: openInstallDialog,
    installBtn: installBtn,
    manifestShapeValidated: manifestShapeValidated,
    pendingReview: pendingReview,
    sourceLabel: sourceLabel,
    manifestLabel: manifestLabel,
    installActionLabel: installActionLabel,
    sourcePill: sourcePill,
    track: trackPluginEvent,
    detailHref: detailHref,
    row: row,
    escapeHtml: escapeHtml
  };
  HR.ready = loadRegistry().catch(function (error) {
    console.error(error);
    document.documentElement.classList.add('registry-error');
    throw error;
  });
})();
