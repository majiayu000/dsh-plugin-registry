await import('/assets/i18n.js');
await import('/assets/plugins.js');
const { compareDefaultPluginOrder, createPluginSearchIndex, filterPluginSearchIndex } = await import('/assets/registry-search.js');
const { computeRankingScore, rankPlugins } = await import('/assets/registry-ranking.js');
(async function () {
  'use strict';
  var initialParams = new URLSearchParams(location.search);
  var state = {
    q: initialParams.get('q') || '',
    cat: initialParams.get('category') || 'all',
    source: initialParams.get('source') || 'all',
    manifest: initialParams.get('manifest') || 'all',
    language: initialParams.get('language') || 'all',
    sort: initialParams.get('sort') || 'relevance',
    limit: 60
  };
  var list = document.getElementById('list');
  var note = document.getElementById('list-note');
  var clearBtn = document.getElementById('clear-filters');

  try { await HR.ready; }
  catch (error) {
    list.innerHTML = '<div class="prow-empty">插件数据暂时无法加载，请稍后重试。</div>';
    return;
  }

  function searchableText(plugin) {
    return plugin.id + ' ' + HR.description(plugin) + ' ' + plugin.owner + ' ' + HR.categoryName(plugin.category) + ' ' + (plugin.language || '') + ' ' + (plugin.topics || []).join(' ') + ' ' + (plugin.packageName || '') + ' ' + (plugin.profile || '');
  }
  var publishedIndex = createPluginSearchIndex(HR.PUBLISHED, searchableText);
  var pendingIndex = createPluginSearchIndex(HR.PENDING || [], searchableText);

  /* 统计条 */
  var totalStars = HR.PUBLISHED.reduce(function (sum, plugin) { return sum + plugin.stars; }, 0);
  var authors = {};
  HR.PUBLISHED.forEach(function (p) { authors[p.owner] = 1; });
  animateNum('st-count', HR.PUBLISHED.length, '');
  animateNum('st-stars', totalStars, '');
  animateNum('st-author', Object.keys(authors).length, '');
  animateNum('st-auto', HR.PUBLISHED.filter(HR.manifestShapeValidated).length, '');

  function animateNum(id, target, suffix) {
    var el = document.getElementById(id);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = target.toLocaleString() + suffix; return; }
    var t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / 700);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString() + suffix;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* 列表渲染 + 筛选 */
  function bundleTerm(english) {
    var tip = english
      ? 'The install manifest a plugin declares in its root package.json via dsh.bundle.patch. Repos without a valid declaration are listed as candidates with no install command; they become installable automatically once added.'
      : '插件在仓库根目录 package.json 中通过 dsh.bundle.patch 声明的安装清单。缺少有效声明的仓库仅作为候选展示，暂无安装命令；补充后会自动转为可安装。';
    return '<span class="term" tabindex="0">dsh.bundle<i class="term-q">?</i><span class="term-tip" role="tooltip">' + tip + '</span></span>';
  }

  function apply() {
    var searchIndex = state.manifest === 'not_validated' ? publishedIndex.concat(pendingIndex) : publishedIndex;
    var rows = filterPluginSearchIndex(searchIndex, {
      category: state.cat,
      source: state.source,
      manifest: state.manifest,
      query: state.q,
    });
    if (state.language !== 'all') rows = rows.filter(function (plugin) { return plugin.language === state.language; });
    if (!state.q && state.sort === 'relevance') {
      rows = rankPlugins(rows);
    } else if (state.sort !== 'relevance' || !state.q) rows.sort(function (a, b) {
      if (state.sort === 'relevance') return compareDefaultPluginOrder(a, b);
      if (state.sort === 'forks') return b.forks - a.forks;
      if (state.sort === 'new') return String(b.pushedAt || '').localeCompare(String(a.pushedAt || ''));
      if (state.sort === 'added') return String(b.addedAt || '').localeCompare(String(a.addedAt || ''));
      if (state.sort === 'manifest') {
        var manifestDelta = Number(b.verification && b.verification.manifest === 'shape_validated') - Number(a.verification && a.verification.manifest === 'shape_validated');
        if (manifestDelta) return manifestDelta;
        return compareDefaultPluginOrder(a, b);
      }
      return b.stars - a.stars;
    });
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = '<div class="prow-empty">没有匹配的插件 —— 试试换个关键词，或<a href="publish.html" style="color:var(--fg)">自己发布一个</a>。</div>';
    } else {
      rows.slice(0, state.limit).forEach(function (p, i) { list.appendChild(HR.row(p, i)); });
    }
    var pendingCount = rows.filter(HR.pendingReview).length;
    var english = window.HRI18N.locale === 'en-US';
    note.innerHTML = rows.length + (english ? ' results' : ' 个结果') + (pendingCount
      ? ' · ' + pendingCount + (english ? ' candidate repositories need a valid ' : ' 个候选仓库待补充 ') + bundleTerm(english)
      : '');
    clearBtn.textContent = english ? 'Clear filters' : '清除筛选';
    clearBtn.hidden = state.source === 'all' && state.manifest === 'all' && state.language === 'all';
    document.getElementById('load-more-wrap').hidden = rows.length <= state.limit;
    syncUrl();
  }

  function syncUrl() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.cat !== 'all') params.set('category', state.cat);
    if (state.source !== 'all') params.set('source', state.source);
    if (state.manifest !== 'all') params.set('manifest', state.manifest);
    if (state.language !== 'all') params.set('language', state.language);
    if (state.sort !== 'relevance') params.set('sort', state.sort);
    history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash);
  }

  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value.trim(); state.limit = 60; apply(); });
  document.getElementById('source').addEventListener('change', function (e) { state.source = e.target.value; state.limit = 60; apply(); });
  document.getElementById('manifest').addEventListener('change', function (e) { state.manifest = e.target.value; state.limit = 60; apply(); });
  document.getElementById('language').addEventListener('change', function (e) { state.language = e.target.value; state.limit = 60; apply(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; state.limit = 60; apply(); });
  clearBtn.addEventListener('click', function () {
    state.source = 'all'; state.manifest = 'all'; state.language = 'all';
    ['source', 'manifest', 'language'].forEach(function (id) { document.getElementById(id).value = 'all'; });
    state.limit = 60;
    apply();
  });
  document.getElementById('load-more').addEventListener('click', function () { state.limit += 60; apply(); });
  document.getElementById('chips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip');
    if (!c) return;
    document.querySelectorAll('#chips .chip').forEach(function (x) { x.classList.remove('on'); });
    c.classList.add('on');
    document.querySelectorAll('#chips .chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
    state.cat = c.dataset.cat;
    state.limit = 60;
    apply();
  });

  Object.keys(HR.registry.categories || {}).forEach(function (key) {
    var chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.setAttribute('aria-pressed', 'false');
    chip.dataset.cat = key;
    var count = HR.PUBLISHED.filter(function (plugin) { return plugin.category === key; }).length;
    chip.appendChild(document.createTextNode(HR.categoryName(key) + ' '));
    var countEl = document.createElement('span');
    countEl.className = 'chip-count';
    countEl.textContent = count.toLocaleString();
    chip.appendChild(countEl);
    document.getElementById('chips').appendChild(chip);
  });
  document.getElementById('all-count').textContent = HR.PUBLISHED.length.toLocaleString();
  if (state.cat !== 'all' && !HR.registry.categories[state.cat]) state.cat = 'all';
  document.querySelectorAll('#chips .chip').forEach(function (chip) {
    var active = chip.dataset.cat === state.cat;
    chip.classList.toggle('on', active);
    chip.setAttribute('aria-pressed', String(active));
  });
  var languageSelect = document.getElementById('language');
  var languageCounts = HR.PUBLISHED.reduce(function (counts, plugin) {
    if (plugin.language) counts[plugin.language] = (counts[plugin.language] || 0) + 1;
    return counts;
  }, {});
  Object.keys(languageCounts).sort(function (a, b) { return languageCounts[b] - languageCounts[a] || a.localeCompare(b); }).forEach(function (language) {
    var option = document.createElement('option');
    option.value = language;
    option.textContent = language + ' (' + languageCounts[language].toLocaleString() + ')';
    languageSelect.appendChild(option);
  });
  if (!Object.keys(languageCounts).length) {
    languageSelect.disabled = true;
    languageSelect.options[0].textContent = window.HRI18N.locale === 'en-US' ? 'Language data pending' : '语言数据待同步';
  }
  if (state.language !== 'all' && !languageCounts[state.language]) state.language = 'all';
  ['source', 'manifest', 'language', 'sort'].forEach(function (id) {
    var select = document.getElementById(id);
    if ([...select.options].some(function (option) { return option.value === state[id]; })) select.value = state[id];
    else state[id] = id === 'sort' ? 'relevance' : 'all';
  });
  document.getElementById('q').value = state.q;
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); document.getElementById('q').focus(); }
  });
  document.querySelector('.intent-row').addEventListener('click', function (event) {
    var button = event.target.closest('[data-intent]');
    if (!button) return;
    var input = document.getElementById('q');
    input.value = button.dataset.intent;
    state.q = button.dataset.intent;
    state.limit = 60;
    apply();
    input.focus();
  });

  /* 终端打字循环 */
  var examples = HR.PUBLISHED.filter(HR.manifestShapeValidated).slice(0, 3).map(function (p) { return p.install; });
  var CMDS = examples.length ? examples : ['dsh plugin --profile web add github:owner/plugin'];
  var typer = document.getElementById('typer');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { typer.textContent = CMDS[0]; }
  else {
    var ci = 0, pos = 0, deleting = false;
    (function tick() {
      var cmd = CMDS[ci];
      if (!deleting) {
        pos++;
        typer.textContent = cmd.slice(0, pos);
        if (pos === cmd.length) { deleting = true; setTimeout(tick, 2100); return; }
        setTimeout(tick, 55 + Math.random() * 60);
      } else {
        pos--;
        typer.textContent = cmd.slice(0, pos);
        if (pos === 0) { deleting = false; ci = (ci + 1) % CMDS.length; setTimeout(tick, 350); return; }
        setTimeout(tick, 26);
      }
    })();
  }

  apply();
})();
