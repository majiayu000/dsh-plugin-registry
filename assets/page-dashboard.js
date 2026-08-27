window.HR_DEFER_REGISTRY = true;
await import('/assets/i18n.js');
(async function () {
  'use strict';
  if (document.documentElement.dataset.registryPrerendered === 'true') return;
  await import('/assets/plugins.js');
  try { await HR.startRegistryLoad(); } catch (error) { document.querySelector('main').innerHTML = '<div class="prow-empty">插件数据暂时无法加载。</div>'; return; }
  var plugins = HR.PUBLISHED;
  var authors = {};
  plugins.forEach(function (plugin) { authors[plugin.owner] = true; });
  document.getElementById('k-stars').textContent = plugins.reduce(function (sum, plugin) { return sum + plugin.stars; }, 0).toLocaleString();
  document.getElementById('k-count').textContent = plugins.length.toLocaleString();
  document.getElementById('k-author').textContent = Object.keys(authors).length.toLocaleString();
  document.getElementById('k-auto').textContent = plugins.filter(HR.manifestShapeValidated).length.toLocaleString();

  function bars(target, rows) {
    var max = Math.max.apply(null, rows.map(function (row) { return row.value; })) || 1;
    document.getElementById(target).innerHTML = rows.map(function (row) {
      var width = row.value === 0 ? 0 : Math.max(2, Math.round(row.value / max * 100));
      return '<div class="hbar-row"><span>' + HR.escapeHtml(row.name) + '</span><div class="hbar-track"><div class="hbar-fill" style="width:' + width + '%"></div></div><span class="hbar-n">' + row.value.toLocaleString() + '</span></div>';
    }).join('');
  }

  var byCategory = {};
  plugins.forEach(function (plugin) { byCategory[plugin.category] = (byCategory[plugin.category] || 0) + 1; });
  bars('cats', Object.keys(byCategory).map(function (key) { return { name: HR.categoryName(key), value: byCategory[key] }; }).sort(function (a, b) { return b.value - a.value; }));
  var curated = plugins.filter(function (plugin) { return plugin.source === 'curated'; }).length;
  var english = window.HRI18N.locale === 'en-US';
  bars('sources', [
    { name: english ? 'Community catalog' : '社区目录', value: curated },
    { name: english ? 'GitHub discovery' : 'GitHub 自动发现', value: plugins.length - curated }
  ]);
  document.getElementById('updated').textContent = (window.HRI18N.locale === 'en-US' ? 'Generated: ' : '数据生成于：') + new Date(HR.registry.generatedAt).toLocaleString();

  document.getElementById('top-rows').innerHTML = plugins.slice().sort(function (a, b) { return b.stars - a.stars; }).slice(0, 10).map(function (plugin, index) {
    return '<tr><td class="r" style="color:var(--faint)">' + (index + 1) + '</td><td class="nm"><a href="' + HR.detailHref(plugin) + '">' + HR.escapeHtml(plugin.id) + '</a></td><td class="r">' + plugin.stars.toLocaleString() + '</td><td class="r">' + plugin.forks.toLocaleString() + '</td></tr>';
  }).join('');

  var byAuthor = {};
  plugins.forEach(function (plugin) { if (!byAuthor[plugin.owner]) byAuthor[plugin.owner] = { count: 0, stars: 0 }; byAuthor[plugin.owner].count += 1; byAuthor[plugin.owner].stars += plugin.stars; });
  document.getElementById('author-rows').innerHTML = Object.keys(byAuthor).map(function (owner) { return { owner: owner, count: byAuthor[owner].count, stars: byAuthor[owner].stars }; }).sort(function (a, b) { return b.stars - a.stars; }).slice(0, 10).map(function (author) {
    return '<tr><td class="nm">@' + HR.escapeHtml(author.owner) + '</td><td class="r">' + author.count + '</td><td class="r">' + author.stars.toLocaleString() + '</td></tr>';
  }).join('');
})();
