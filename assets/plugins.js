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
    writeClipboardText(command).then(function () {
      button.textContent = locale() === 'en' ? 'Copied ✓' : '已复制 ✓';
      button.classList.add('done');
    }).catch(function () {
      button.textContent = locale() === 'en' ? 'Copy failed' : '复制失败';
      button.classList.add('error');
    }).finally(function () {
      setTimeout(function () {
        button.textContent = original;
        button.classList.remove('done', 'error');
      }, 1500);
    });
  }

  function installBtn(plugin) {
    var button = document.createElement('button');
    button.className = 'btn btn-sm';
    button.textContent = locale() === 'en' ? 'Install' : '安装';
    button.title = (locale() === 'en' ? 'Copy install command: ' : '复制安装命令：') + plugin.install;
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      copyText(button, plugin.install);
    });
    return button;
  }

  function sourcePill(plugin) {
    if (plugin.trustLevel === 'curated' || plugin.source === 'curated') return '<span class="pill pill-official">' + (locale() === 'en' ? 'Curated' : '精选') + '</span>';
    return '<span class="pill">' + (locale() === 'en' ? 'Manifest verified' : 'Manifest 已验证') + '</span>';
  }

  function detailHref(plugin) {
    return 'plugin-detail.html?plugin=' + encodeURIComponent(plugin.id);
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
    var response = await fetch('/data/plugins.json', { cache: 'no-cache' });
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
