/* Harness Registry — real registry loader and shared render helpers */
import { writeClipboardText } from './clipboard.js'

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
        '<ol class="install-steps">' +
          '<li><span>01</span><div><b>' + (english ? 'Open a terminal' : '打开终端') + '</b><p>' + (english ? 'Use the computer where DeepSeek Harness is installed.' : '在已经安装 DeepSeek Harness 的电脑上操作。') + '</p></div></li>' +
          '<li><span>02</span><div><b>' + (english ? 'Copy the command below' : '复制下面的命令') + '</b><p>' + (english ? 'The button only writes the command to your clipboard.' : '按钮只会把命令写入剪贴板，不会直接执行。') + '</p></div></li>' +
          '<li><span>03</span><div><b>' + (english ? 'Paste and press Enter' : '粘贴并按 Enter') + '</b><p>' + (english ? 'Wait for DSH to report the result, then follow any plugin-specific setup in its README.' : '等待 DSH 输出安装结果；如插件需要额外配置，请继续查看仓库 README。') + '</p></div></li>' +
        '</ol>' +
        '<div class="install-dialog-command"><span>$</span><code data-install-command></code></div>' +
        '<button class="btn btn-primary install-dialog-copy" type="button" data-install-copy autofocus>' + (english ? 'Copy install command' : '复制安装命令') + '</button>' +
        '<p class="install-dialog-status" data-install-status aria-live="polite">' + (english ? 'Nothing is executed until you paste the command into a terminal.' : '只有粘贴到终端并执行后，安装才会开始。') + '</p>' +
        '<aside class="install-dialog-safety"><b>' + (english ? 'Before you install' : '安装前请确认') + '</b><p>' + (english ? 'Plugins are third-party code from GitHub. Review the repository before running the command. Manifest format verification is not a security audit.' : '插件是来自 GitHub 的第三方代码。执行前请检查仓库内容；Manifest 格式验证不代表安全审计。') + '</p></aside>' +
        '<footer class="install-dialog-links"><a data-install-repo target="_blank" rel="noopener">' + (english ? 'Review GitHub source' : '查看 GitHub 源码') + '</a><a href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noopener">' + (english ? 'Need DeepSeek Harness?' : '还没安装 DeepSeek Harness？') + '</a></footer>' +
      '</div>';
    document.body.appendChild(dialog);

    dialog.querySelector('[data-install-close]').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('[data-install-copy]').addEventListener('click', function () {
      if (!activeInstallPlugin) return;
      var status = dialog.querySelector('[data-install-status]');
      copyText(this, activeInstallPlugin.install).then(function (copied) {
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
    dialog.querySelector('#install-dialog-title').textContent = english ? 'How to install ' + plugin.name : '安装 ' + plugin.name + ' 的步骤';
    dialog.querySelector('[data-install-command]').textContent = plugin.install;
    dialog.querySelector('[data-install-repo]').href = plugin.url;
    var copyButton = dialog.querySelector('[data-install-copy]');
    copyButton.textContent = english ? 'Copy install command' : '复制安装命令';
    copyButton.classList.remove('done', 'error');
    dialog.querySelector('[data-install-status]').textContent = english ? 'Nothing is executed until you paste the command into a terminal.' : '只有粘贴到终端并执行后，安装才会开始。';
    document.documentElement.classList.add('modal-open');
    if (!dialog.open) dialog.showModal();
    copyButton.focus();
  }

  function installBtn(plugin) {
    var button = document.createElement('button');
    button.className = 'btn btn-sm';
    button.textContent = locale() === 'en' ? 'Install steps' : '安装步骤';
    button.title = locale() === 'en' ? 'Open install guide' : '打开安装说明';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      openInstallDialog(plugin);
    });
    return button;
  }

  function sourcePill(plugin) {
    if (plugin.trustLevel === 'curated' || plugin.source === 'curated') return '<span class="pill pill-official">' + (locale() === 'en' ? 'Community catalog' : '社区目录收录') + '</span>';
    return '<span class="pill">' + (locale() === 'en' ? 'Manifest verified' : 'Manifest 已验证') + '</span>';
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
    element.className = 'prow';
    element.innerHTML =
      '<span class="prow-idx">' + String(index + 1).padStart(3, '0') + '</span>' +
      '<span class="prow-av"></span>' +
      '<div class="prow-main">' +
        '<div class="prow-name"><a href="' + detailHref(plugin) + '">' + escapeHtml(plugin.name) + '</a>' + sourcePill(plugin) + '</div>' +
        '<div class="prow-desc">' + escapeHtml(description(plugin) || (locale() === 'en' ? 'No description provided. Review the GitHub source before installing.' : '作者未提供简介；安装前请先查看 GitHub 源码。')) + '</div>' +
        '<div class="prow-signals">' + topicSignals(plugin) + (updatedLabel(plugin.pushedAt) ? '<span class="prow-updated">' + updatedLabel(plugin.pushedAt) + '</span>' : '') + '</div>' +
      '</div>' +
      '<div class="prow-meta"><b>@' + escapeHtml(plugin.owner) + '</b><br>' + escapeHtml(categoryName(plugin.category)) + '</div>' +
      '<div class="prow-stars">' + STAR + '<b>' + fmtNumber(plugin.stars) + '</b><small>Stars</small></div>' +
      '<div class="prow-forks">' + FORK + '<b>' + fmtNumber(plugin.forks) + '</b><small>Forks</small></div>' +
      '<div class="prow-act"></div>';
    element.querySelector('.prow-av').appendChild(avatar(plugin));
    element.querySelector('.prow-act').appendChild(installBtn(plugin));
    return element;
  }

  async function loadRegistry() {
    var response = await fetch('data/plugins.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Registry HTTP ' + response.status);
    var registry = await response.json();
    if (!Array.isArray(registry.plugins)) throw new Error('Invalid registry document');
    HR.registry = registry;
    HR.PLUGINS = registry.plugins;
    return registry;
  }

  var HR = window.HR = {
    PLUGINS: [],
    registry: { categories: {}, stats: {} },
    STAR: STAR,
    FORK: FORK,
    fmtNumber: fmtNumber,
    description: description,
    categoryName: categoryName,
    avatar: avatar,
    copyText: copyText,
    openInstallDialog: openInstallDialog,
    installBtn: installBtn,
    sourcePill: sourcePill,
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
