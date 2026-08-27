window.HR_DEFER_REGISTRY = true;

async function startBrowsePage() {
await import('/assets/i18n.js');
await import('/assets/plugins.js');
const { createPluginSearchIndex, filterPluginSearchIndex } = await import('/assets/registry-search.js');
const { rankPlugins } = await import('/assets/registry-ranking.js');

(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var state = {
    q: params.get('q') || document.getElementById('q').value.trim() || '', cat: params.get('category') || 'all', source: params.get('source') || 'all',
    manifest: params.get('manifest') || 'all', language: params.get('language') || 'all',
    sort: params.get('sort') || 'relevance', limit: document.documentElement.dataset.registryPrerendered === 'true' ? 8 : 60
  };
  var list = document.getElementById('list');
  var note = document.getElementById('list-note');
  var clearBtn = document.getElementById('clear-filters');
  var publishedIndex = [], pendingIndex = [], hydrated = false, pendingLoaded = false;

  function searchableText(plugin) {
    return plugin.id + ' ' + HR.description(plugin) + ' ' + plugin.owner + ' ' + HR.categoryName(plugin.category) + ' ' + (plugin.language || '') + ' ' + (plugin.topics || []).join(' ') + ' ' + (plugin.packageName || '') + ' ' + (plugin.profile || '');
  }

  function setText(id, value) {
    var element = document.getElementById(id);
    if (element) element.textContent = Number(value || 0).toLocaleString();
  }

  function renderSummary() {
    var authors = new Set(HR.PUBLISHED.map(function (plugin) { return plugin.owner; }));
    setText('st-count', HR.PUBLISHED.length);
    setText('st-stars', HR.PUBLISHED.reduce(function (sum, plugin) { return sum + (plugin.stars || 0); }, 0));
    setText('st-author', authors.size);
    setText('st-auto', HR.PUBLISHED.filter(HR.manifestShapeValidated).length);
  }

  function populateFacets() {
    var chips = document.getElementById('chips');
    chips.innerHTML = '';
    var all = document.createElement('button');
    all.className = 'chip'; all.type = 'button'; all.dataset.cat = 'all';
    all.innerHTML = (window.HRI18N.locale === 'en-US' ? 'All ' : '全部 ') + '<span class="chip-count">' + HR.PUBLISHED.length.toLocaleString() + '</span>';
    chips.appendChild(all);
    Object.keys(HR.registry.categories || {}).forEach(function (key) {
      var chip = document.createElement('button');
      chip.className = 'chip'; chip.type = 'button'; chip.dataset.cat = key;
      var count = HR.PUBLISHED.filter(function (plugin) { return plugin.category === key; }).length;
      chip.innerHTML = HR.escapeHtml(HR.categoryName(key)) + ' <span class="chip-count">' + count.toLocaleString() + '</span>';
      chips.appendChild(chip);
    });
    if (state.cat !== 'all' && !HR.registry.categories[state.cat]) state.cat = 'all';
    chips.querySelectorAll('.chip').forEach(function (chip) {
      var active = chip.dataset.cat === state.cat;
      chip.classList.toggle('on', active); chip.setAttribute('aria-pressed', String(active));
    });

    var languageSelect = document.getElementById('language');
    var languageCounts = HR.PUBLISHED.reduce(function (counts, plugin) {
      if (plugin.language) counts[plugin.language] = (counts[plugin.language] || 0) + 1;
      return counts;
    }, {});
    languageSelect.innerHTML = '<option value="all">' + (window.HRI18N.locale === 'en-US' ? 'All languages' : '全部语言') + '</option>';
    Object.keys(languageCounts).sort(function (a, b) { return languageCounts[b] - languageCounts[a] || a.localeCompare(b); }).forEach(function (language) {
      var option = document.createElement('option');
      option.value = language; option.textContent = language + ' (' + languageCounts[language].toLocaleString() + ')';
      languageSelect.appendChild(option);
    });
    languageSelect.disabled = !Object.keys(languageCounts).length;
    if (state.language !== 'all' && !languageCounts[state.language]) state.language = 'all';
    ['source', 'manifest', 'language', 'sort'].forEach(function (id) {
      var select = document.getElementById(id);
      if ([...select.options].some(function (option) { return option.value === state[id]; })) select.value = state[id];
      else state[id] = id === 'sort' ? 'relevance' : 'all';
    });
  }

  async function hydrate(includePending) {
    await HR.startRegistryLoad();
    if ('caches' in window) {
      var snapshotCache = await caches.open('harness-registry-snapshot-v1');
      await snapshotCache.delete(new URL('data/registry-audit.json', document.baseURI).href);
    }
    if (!hydrated) {
      publishedIndex = createPluginSearchIndex(HR.PUBLISHED, searchableText);
      renderSummary(); populateFacets(); hydrated = true;
      document.documentElement.dataset.registryHydration = 'ready';
    }
    if (includePending && !pendingLoaded) {
      await HR.loadPending();
      pendingIndex = createPluginSearchIndex(HR.PENDING || [], searchableText);
      pendingLoaded = true;
    }
  }

  function bundleTerm(english) {
    var tip = english ? 'The install manifest declared in the root package.json via dsh.bundle.patch.' : '插件在仓库根目录 package.json 中通过 dsh.bundle.patch 声明的安装清单。';
    return '<span class="term" tabindex="0">dsh.bundle<i class="term-q">?</i><span class="term-tip" role="tooltip">' + tip + '</span></span>';
  }

  function syncUrl() {
    var next = new URLSearchParams();
    if (state.q) next.set('q', state.q);
    if (state.cat !== 'all') next.set('category', state.cat);
    if (state.source !== 'all') next.set('source', state.source);
    if (state.manifest !== 'all') next.set('manifest', state.manifest);
    if (state.language !== 'all') next.set('language', state.language);
    if (state.sort !== 'relevance') next.set('sort', state.sort);
    history.replaceState(null, '', location.pathname + (next.size ? '?' + next.toString() : '') + location.hash);
  }

  function apply() {
    var searchIndex = state.manifest === 'not_validated' ? publishedIndex.concat(pendingIndex) : publishedIndex;
    var rows = filterPluginSearchIndex(searchIndex, { category: state.cat, source: state.source, manifest: state.manifest, query: state.q });
    if (state.language !== 'all') rows = rows.filter(function (plugin) { return plugin.language === state.language; });
    if (!state.q && state.sort === 'relevance') rows = rankPlugins(rows);
    else if (state.sort !== 'relevance' || !state.q) rows.sort(function (a, b) {
      if (state.sort === 'forks') return b.forks - a.forks;
      if (state.sort === 'new') return String(b.pushedAt || '').localeCompare(String(a.pushedAt || ''));
      if (state.sort === 'added') return String(b.addedAt || '').localeCompare(String(a.addedAt || ''));
      if (state.sort === 'manifest') {
        var manifestDelta = Number(HR.manifestShapeValidated(b)) - Number(HR.manifestShapeValidated(a));
        if (manifestDelta) return manifestDelta;
      }
      return (b.stars || 0) - (a.stars || 0);
    });
    list.innerHTML = '';
    if (!rows.length) list.innerHTML = '<div class="prow-empty">' + (window.HRI18N.locale === 'en-US' ? 'No matching plugins.' : '没有匹配的插件 —— 试试换个关键词。') + '</div>';
    else rows.slice(0, state.limit).forEach(function (plugin, index) { list.appendChild(HR.row(plugin, index)); });
    var pendingCount = rows.filter(HR.pendingReview).length;
    var english = window.HRI18N.locale === 'en-US';
    note.innerHTML = rows.length.toLocaleString() + (english ? ' results' : ' 个结果') + (pendingCount ? ' · ' + pendingCount + (english ? ' candidates need a valid ' : ' 个候选仓库待补充 ') + bundleTerm(english) : '');
    clearBtn.textContent = english ? 'Clear filters' : '清除筛选';
    clearBtn.hidden = state.source === 'all' && state.manifest === 'all' && state.language === 'all';
    document.getElementById('load-more-wrap').hidden = rows.length <= state.limit;
    syncUrl();
  }

  async function refresh() {
    note.textContent = window.HRI18N.locale === 'en-US' ? 'Loading search index…' : '正在加载搜索索引…';
    try { await hydrate(state.manifest === 'not_validated'); apply(); }
    catch (error) {
      document.documentElement.dataset.registryHydration = 'failed';
      note.textContent = window.HRI18N.locale === 'en-US' ? 'Plugin search is temporarily unavailable.' : '插件搜索暂时无法加载，请稍后重试。';
    }
  }

  document.getElementById('q').value = state.q;
  document.getElementById('q').addEventListener('input', function (event) { state.q = event.target.value.trim(); state.limit = 60; refresh(); });
  document.getElementById('source').addEventListener('change', function (event) { state.source = event.target.value; state.limit = 60; refresh(); });
  document.getElementById('manifest').addEventListener('change', function (event) { state.manifest = event.target.value; state.limit = 60; refresh(); });
  document.getElementById('language').addEventListener('change', function (event) { state.language = event.target.value; state.limit = 60; refresh(); });
  document.getElementById('sort').addEventListener('change', function (event) { state.sort = event.target.value; state.limit = 60; refresh(); });
  clearBtn.addEventListener('click', function () { state.source = 'all'; state.manifest = 'all'; state.language = 'all'; state.limit = 60; refresh(); });
  document.getElementById('load-more').addEventListener('click', function () { state.limit += 60; refresh(); });
  document.getElementById('chips').addEventListener('click', function (event) {
    var chip = event.target.closest('.chip'); if (!chip) return;
    state.cat = chip.dataset.cat; state.limit = 60;
    document.querySelectorAll('#chips .chip').forEach(function (candidate) { candidate.classList.toggle('on', candidate === chip); });
    refresh();
  });
  document.querySelector('.intent-row').addEventListener('click', function (event) {
    var button = event.target.closest('[data-intent]'); if (!button) return;
    var input = document.getElementById('q'); input.value = button.dataset.intent; state.q = button.dataset.intent; state.limit = 60;
    refresh(); input.focus();
  });
  list.addEventListener('click', async function (event) {
    var button = event.target.closest('[data-install-plugin]'); if (!button) return;
    button.disabled = true; var original = button.textContent;
    button.textContent = window.HRI18N.locale === 'en-US' ? 'Loading…' : '加载中…';
    try { HR.openInstallDialog(await HR.loadPluginDetail(button.dataset.installPlugin)); button.textContent = original; }
    catch (error) { button.textContent = window.HRI18N.locale === 'en-US' ? 'Unable to load' : '加载失败'; }
    finally { button.disabled = false; }
  });
  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); document.getElementById('q').focus(); }
  });

  document.getElementById('typer').textContent = 'dsh plugin --profile web add github:owner/plugin';
  var needsImmediateResults = state.q || state.cat !== 'all' || state.source !== 'all' || state.manifest !== 'all' || state.language !== 'all' || state.sort !== 'relevance';
  if (needsImmediateResults || document.documentElement.dataset.registryPrerendered !== 'true') refresh();
  else {
    var warm = function () { hydrate(false).catch(function () { document.documentElement.dataset.registryHydration = 'failed'; }); };
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2000 });
    else setTimeout(warm, 1000);
  }
})();
}

if (document.documentElement.dataset.registryPrerendered === 'true' && document.documentElement.dataset.enhancementBoot !== 'ready') {
  requestAnimationFrame(function () { requestAnimationFrame(startBrowsePage); });
} else {
  startBrowsePage();
}
