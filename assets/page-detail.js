await import('/assets/i18n.js');
await import('/assets/plugins.js');
const { findPluginById } = await import('/assets/plugin-detail.js');
(async function () {
  'use strict';
  try { await HR.ready; } catch (error) { document.getElementById('plugin-name').textContent = '插件数据加载失败'; return; }
  var requested = document.body.dataset.pluginId || new URLSearchParams(location.search).get('plugin');
  var english = window.HRI18N.locale === 'en-US';
  var plugin = findPluginById(HR.PLUGINS, requested);
  if (!plugin) {
    document.title = english ? 'Plugin not found — DeepSeek Harness Plugin Registry' : '插件不存在 — DeepSeek Harness Plugin Registry';
    document.getElementById('detail-root').innerHTML =
      '<a class="crumb" href="index.html">← ' + (english ? 'Back to plugins' : '返回插件列表') + '</a>' +
      '<div class="prow-empty"><h1>' + (english ? 'Plugin not found' : '没有找到这个插件') + '</h1><p>' +
      (english ? 'The link may be outdated or the plugin is no longer listed.' : '链接可能已经失效，或者该插件已不再收录。') +
      '</p></div>';
    return;
  }
  document.title = plugin.name + ' — DeepSeek Harness Plugin Registry';
  HR.track(plugin.id, 'view');
  document.getElementById('plugin-name').textContent = plugin.name;
  document.getElementById('plugin-owner').textContent = '@' + plugin.owner;
  var pluginDescription = HR.description(plugin) || (english ? 'No description provided. Review the GitHub source before installing.' : '作者未提供简介；安装前请先查看 GitHub 源码。');
  document.getElementById('plugin-desc').textContent = pluginDescription;
  document.getElementById('readme-desc').textContent = pluginDescription;
  document.getElementById('source-pill').innerHTML = HR.sourcePill(plugin);
  document.getElementById('avatar-slot').appendChild(HR.avatar(plugin, 'lg'));
  document.getElementById('install-command').textContent = plugin.install;
  var installCopyStatus = document.getElementById('install-copy-status');
  installCopyStatus.textContent = english
    ? 'Copying this command does not install the plugin. Run it in a terminal to start installation.'
    : '复制命令不会安装插件；只有在终端执行后，安装才会开始。';
  document.getElementById('plugin-stars').textContent = plugin.stars.toLocaleString();
  document.getElementById('plugin-forks').textContent = plugin.forks.toLocaleString();
  document.getElementById('maintainer').textContent = '@' + plugin.owner;
  document.getElementById('category').textContent = HR.categoryName(plugin.category);
  var missingMetadata = english ? 'Not provided' : '未提供';
  document.getElementById('package-label').textContent = english ? 'Package' : '包名';
  document.getElementById('package-status').textContent = plugin.packageName || missingMetadata;
  document.getElementById('profile-label').textContent = 'Profile';
  document.getElementById('profile-status').textContent = plugin.profile || 'web';
  var language = typeof plugin.language === 'string' ? plugin.language.trim() : '';
  document.getElementById('language-label').textContent = english ? 'Language' : '开发语言';
  document.getElementById('language-status').textContent = language || missingMetadata;
  document.getElementById('license-label').textContent = 'License';
  document.getElementById('license-status').textContent = plugin.license || missingMetadata;
  document.getElementById('release-label').textContent = english ? 'Latest release' : '最新版本';
  document.getElementById('release-status').textContent = plugin.latestRelease && plugin.latestRelease.tag || missingMetadata;
  document.getElementById('updated-label').textContent = english ? 'Last updated' : '最近更新';
  var updatedStatus = document.getElementById('updated-status');
  var hasValidPushedAt = typeof plugin.pushedAt === 'string' && !Number.isNaN(Date.parse(plugin.pushedAt));
  updatedStatus.textContent = hasValidPushedAt ? plugin.pushedAt.slice(0, 10) : missingMetadata;
  if (hasValidPushedAt) {
    updatedStatus.dateTime = plugin.pushedAt;
    updatedStatus.title = english ? 'Last push to the GitHub repository' : 'GitHub 仓库最后推送时间';
  }
  var addedStatus = document.getElementById('added-status');
  var hasValidAddedAt = typeof plugin.addedAt === 'string' && !Number.isNaN(Date.parse(plugin.addedAt));
  addedStatus.textContent = hasValidAddedAt ? plugin.addedAt.slice(0, 10) : missingMetadata;
  if (hasValidAddedAt) addedStatus.dateTime = plugin.addedAt;
  document.getElementById('source').textContent = HR.sourceLabel(plugin).replace(/^来源：|^Source:\s*/, '');
  var manifestShapeValidated = HR.manifestShapeValidated(plugin);
  var patchStatus = plugin.verification && plugin.verification.patch || 'not_checked';
  var patchLabel = patchStatus === 'exists'
    ? (english ? 'File confirmed' : '文件已确认')
    : (patchStatus === 'missing' ? (english ? 'File not found' : '未找到文件') : (english ? 'Not checked' : '未检查'));
  document.getElementById('manifest-label').textContent = 'Manifest';
  document.getElementById('manifest-status').textContent = HR.manifestLabel(plugin).replace(/^Manifest\s*/, '');
  document.getElementById('patch-label').textContent = english ? 'Patch file' : 'Patch 文件';
  document.getElementById('patch-status').textContent = patchLabel;
  document.getElementById('installation-test-label').textContent = english ? 'Installation test' : '安装测试';
  document.getElementById('installation-test-status').textContent = english ? 'Not performed' : '未执行';
  var verifiedCommit = typeof plugin.verifiedCommit === 'string' && /^[0-9a-f]{40}$/.test(plugin.verifiedCommit) ? plugin.verifiedCommit : '';
  if (verifiedCommit) {
    var commitUrl = 'https://github.com/' + String(plugin.id).split('#')[0] + '/commit/' + verifiedCommit;
    document.getElementById('commit-cell').hidden = false;
    var evidenceCommit = document.getElementById('evidence-commit');
    evidenceCommit.href = commitUrl;
    evidenceCommit.textContent = verifiedCommit.slice(0, 7);
    document.getElementById('commit-row').hidden = false;
    var commitLink = document.getElementById('commit-link');
    commitLink.href = commitUrl;
    commitLink.textContent = verifiedCommit.slice(0, 7);
  }
  document.getElementById('evidence-source').textContent = plugin.source === 'curated' ? (english ? 'Community catalog' : '社区目录') : (english ? 'GitHub discovery' : 'GitHub 自动发现');
  document.getElementById('evidence-manifest').textContent = manifestShapeValidated ? (english ? 'Format checked' : '格式检查通过') : (english ? 'Not checked' : '未检查');
  document.getElementById('evidence-patch').textContent = patchLabel;
  document.getElementById('evidence-installation').textContent = english ? 'Not performed' : '未执行';
  document.getElementById('manifest-decision').textContent = manifestShapeValidated
    ? (patchStatus === 'exists'
      ? (english ? 'The manifest matched dsh.bundle and its referenced patch file existed at synchronization time.' : '同步时，Manifest 符合 dsh.bundle 格式，且引用的 Patch 文件真实存在。')
      : (english ? 'The manifest matched dsh.bundle, but the referenced patch file was not confirmed.' : 'Manifest 符合 dsh.bundle 格式，但引用的 Patch 文件尚未确认。'))
    : (english ? 'The registry has not checked this repository manifest; confirm its installation instructions in the repository.' : '本站没有检查这个仓库的 Manifest，请先在仓库中确认安装说明。');
  ['repo-button', 'repo-link'].forEach(function (id) {
    var element = document.getElementById(id);
    element.href = plugin.url;
    element.addEventListener('click', function () { HR.track(plugin.id, 'outbound'); });
  });
  document.getElementById('install-btn').textContent = HR.installActionLabel(plugin);
  document.getElementById('install-btn').classList.toggle('btn-primary', manifestShapeValidated);
  document.getElementById('repo-button').classList.toggle('btn-primary', !manifestShapeValidated);
  document.getElementById('evidence-title').textContent = manifestShapeValidated ? (english ? 'Manifest format checked' : 'Manifest 格式检查通过') : (english ? 'Source recorded as community catalog' : '来源记录为社区目录');
  document.getElementById('evidence-copy').textContent = manifestShapeValidated
    ? (english ? 'At sync time, the root package.json matched the dsh.bundle format and the patch-file check is shown separately. The registry did not run the plugin, test installation, or audit security.' : '同步时，仓库根目录 package.json 符合 dsh.bundle 格式，Patch 文件检查结果单独展示；本站没有运行插件、测试安装或审计安全性。')
    : (english ? 'The entry was synchronized from a public community catalog. The registry did not check its manifest, run the plugin, test installation, or audit security.' : '该条目同步自公开社区目录；本站没有检查 Manifest、运行插件、测试安装或审计安全性。');
  document.getElementById('topic-list').innerHTML = (plugin.topics || []).map(function (topic) { return '<span class="topic-chip">' + HR.escapeHtml(topic) + '</span>'; }).join('') || '<span class="topic-chip">dsh-plugin</span>';
  document.getElementById('install-btn').addEventListener('click', function () { HR.openInstallDialog(plugin); });
  var related = HR.PLUGINS.filter(function (candidate) { return candidate.id !== plugin.id && candidate.category === plugin.category; })
    .sort(function (a, b) { return HR.compareByRanking(a, b); })
    .slice(0, 3);
  if (related.length) {
    document.getElementById('related-section').hidden = false;
    related.forEach(function (candidate) {
      var link = document.createElement('a');
      link.className = 'related-item';
      link.href = HR.detailHref(candidate);
      link.innerHTML = '<span><b>' + HR.escapeHtml(candidate.name) + '</b><small>@' + HR.escapeHtml(candidate.owner) + '</small></span><strong>' + HR.fmtNumber(candidate.stars) + ' ★</strong>';
      document.getElementById('related-list').appendChild(link);
    });
  }
  document.getElementById('copy-btn').addEventListener('click', function () {
    HR.copyText(this, plugin.install).then(function (copied) {
      if (copied) HR.track(plugin.id, 'copy');
      installCopyStatus.textContent = copied
        ? (english ? 'Command copied. The plugin is not installed yet. Paste and run it in your terminal.' : '命令已复制，插件尚未安装。请粘贴到终端并执行。')
        : (english ? 'Copy failed. Select the command above and copy it manually.' : '复制失败，请选中上方命令手动复制。');
    });
  });
})();
