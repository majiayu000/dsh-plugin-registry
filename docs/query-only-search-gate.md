# Query-only search gate (#106)

Decision date: 2026-11-17. Related: #106, earlier [in-memory](paged-search-prototype.md)
and [D1](d1-search-experiment.md) experiments. Local workerd only: no deployment,
no Cloudflare account access, no production route or browser change.

## Decision this gate supports

Whether the website may replace the full browser directory download with a
30-result `/api/search` page served by a Worker that holds a query-only build
artifact in memory.

- **Metrics:** per-request CPU for cold and warm requests, isolate memory
  (retained after startup and observed peak), raw page size, and exact
  agreement with the browser's current search order.
- **Stop (reject) conditions:** a common request exceeds the Workers Free
  10 ms CPU limit in local workerd, memory leaves no clear headroom under the
  128 MB isolate limit, or results/cards/install detail cannot be kept
  identical to the current browser behavior.
- **Not decided here:** the actual Workers plan and account budget. Those need
  account data and a preview deployment, which this gate does not perform.

## What was built

`node experiments/query-only/build.mjs` writes `.generated/query-only/` from the
complete current snapshot, with ranking time fixed to `registry.generatedAt`:

- `query-document.txt`: the query index plus per-listing facets, bundled into
  the Worker as an ASCII-only text module and parsed once at startup.
- `public/data/search-cards/<version>/*.json`: 4,096 display-card shards.
- `public/data/plugin-shards/*.json` and `detail-build.json`: install-detail
  records served by the unchanged production `handlePluginDetail`.

One content version is a SHA-256 over the index, every card shard and every
detail shard. Card shards carry that version; a page whose card shard has
another version fails with 503 instead of mixing content, and a request with a
stale `version` returns 409. The same version is written to `detail-build.json`.

`experiments/query-only/worker.js` serves `/api/search` (30 per page) and
`/api/plugins/...`. The query engine in `experiments/shared/query-index.js` now
also applies the browser's `listing` filter (`standard` default, `low_signal`,
`all`; #115), and was optimized without changing results:

- dense rank arrays replace request-time `localeCompare` ties and date sorts;
- relevance top-K visits matches by descending quality and skips rows whose
  id/name upper bound cannot reach the current 30th score;
- explicit sorts stop after the primary-key group containing the K-th row;
- filtered recommendation stops inside the first diversity pass when exact;
- topic words are stored pre-split, removing a regex split per scored row.

Omitting `listing` keeps the previous all-entries semantics, so the D1
experiment's comparisons are unchanged.

## Semantic result

Snapshot `2026-11-16T19:27:05.568Z`: 26,655 published plugins, 5,044 eligible
pending candidates (31,699 rows). The oracle (`experiments/query-only/oracle.mjs`)
runs the current `page-browse.js` `apply()` sequence with the browser modules.

- `node experiments/query-only/verify.mjs`: **333 whole-result and 1,734
  page comparisons match exactly** (all sorts, three listings, category /
  source / manifest / language filters, pending candidates, both locales,
  120 deterministic terms sampled from the snapshot, first/middle/last pages).
- Through workerd HTTP: 24 pages, 630 cards field-equal to the snapshot's
  browse fields, 63 install-detail lookups equal to the snapshot plugin, one
  content version across search and detail, stale version returns 409.
- Raw page size: 32–41 KB for 30 results (target ≤ 50 KB); no-match 0.8 KB.

## Runtime measurements (local workerd)

Wrangler 4.163.0 local workerd (darwin-arm64), Node 25.9.0, Apple Silicon.
**The host was heavily loaded during every run (1-minute load average
160–400 from unrelated processes).** Wall times and V8 sampling profiles are
therefore not reported as CPU: the sampler attributed descheduled time to
whatever frame was running (a zero-match query sampled 0–110 ms). CPU below is
workerd user-runtime process CPU time (`ps`, 10 ms resolution) averaged over
batches of 30–60 identical sequential requests, minus a baseline batch that is
rejected with 400 before any query or asset read. It still includes local
asset serving for card shards, which production may not bill to the Worker.

| Request (warm, batch average, 3 runs) | Process CPU | Net of 400 baseline |
| --- | ---: | ---: |
| 400 baseline | 3.0–3.7 ms | 0 |
| `zzzzqx` (no match: query + JSON, no card reads) | 3.3 ms | ≈ 0 |
| Default home page 1 / page 2 | 16.3–19.3 ms | 12.7–16.3 ms |
| `memory` / `记忆` / `mcp server` | 18.2–21.7 ms | 14.7–18.0 ms |
| `agent` / `dsh` | 24.7–27.7 ms | 21.2–24.0 ms |
| `a` (25,017 matches) | 29.3–30.3 ms | 25.8–27.3 ms |
| `agent`, page 40 | 31.2–35.0 ms | 27.7–32.0 ms |
| `category=memory` / `manifest=not_validated` | 20.7–23.7 ms | 17.2–20.0 ms |

The default page needs no query work, so its ~13–16 ms is the card path:
30 `ASSETS.fetch` subrequests served by the local asset worker in the same
process, plus parsing ~290 KB. Production may not bill asset serving to the
Worker; that split can only be observed on Cloudflare. The query computation
is the difference on top of it (about +4 ms for `memory`, +8 to +14 ms for
broad terms), consistent with the Node figures below.

Same engine in Node, thread CPU per query only (no cards/HTTP), 50 warm
iterations: default page ≤ 0.02 ms, `记忆` 1.2, `memory` 4.0, `dsh` 8.2,
`agent` 9.6, `agent` page 40 12.3, `a` 16.2 ms. Loading/parsing the 30 card
shards a page needs (~290 KB, 30 subrequests) costs ~2 ms of parse in Node.

Cold and startup (workerd process CPU):

- Eager entry startup: 440–570 ms process CPU including workerd boot;
  lazy entry (no parse at startup) 370 ms. The 28.8 MB document parse inside
  workerd is ~150 ms (lazy cold request 210 ms vs eager cold 60 ms).
  Startup stays under the 1 s startup limit locally.
- First request after startup: 60 ms (home) and 100 ms (`a`).

Memory (V8 heap via inspector; peak is the maximum observed between requests,
not a true peak):

- Retained after startup: 66.8 MiB used. The text module string alone is
  ~29 MiB (lazy entry before parse: 29.0 MiB).
- Observed maximum used heap: 89–98 MiB; committed heap reached 116–154 MiB
  locally without an enforced limit. Six concurrent requests: 200 for all,
  72–75 MiB used afterwards.
- Bundle: 28,176 KiB uncompressed (limit 64 MiB); 4,353 static asset files
  (Free limit 20,000).

## Decision

**Rejected for Workers Free.** Every result page in local workerd uses more
than 10 ms of process CPU, broad queries more than 20 ms. Even if asset
serving were free in production, query computation alone exceeds 10 ms for
`a` and deep `agent` pages (Node thread CPU, and +14 ms in workerd), and cold
requests use 60–100 ms. This matches the earlier cloud traces and meets the
stop condition. Memory also leaves thin headroom: ~67 MiB retained before
any request and up to ~98 MiB used observed under a 128 MB isolate limit.

**Pending for a paid plan.** With the Paid default of 30 s CPU, CPU would not
block adoption, but memory headroom and real billed CPU must be measured on a
preview deployment against the actual account plan. That requires account
data and a deployment, which this gate does not do. The website keeps its
current client search; nothing here is wired into the Pages build.

Cheaper next steps if pursued: drop the retained module string (e.g. split
the document or load it from assets with a cold-start trade-off), and move
card loading out of 30 subrequests per page.

## Reproduction

```sh
npm ci
node --test tests/query-index.test.mjs tests/search-api.test.mjs tests/query-only.test.mjs
node experiments/query-only/build.mjs
node experiments/query-only/verify.mjs
node experiments/query-only/profile.mjs --out .generated/profiles/eager-home.json
node experiments/query-only/profile.mjs --cold 'q=a' --skip-verify --rounds 1 --batch 30
node experiments/query-only/profile.mjs --entry worker-lazy.js --skip-verify --rounds 1 --batch 30
```

`profile.mjs` starts `wrangler dev` locally (no login), connects to its
inspector, and kills itself after 15 minutes. Run it on an idle host for
cleaner numbers; per-request V8 samples are kept in its JSON output.
