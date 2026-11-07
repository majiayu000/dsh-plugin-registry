# Isolated D1 search experiment

Decision date: 2026-11-07. Related: #106 / draft #107. This is a standalone
experiment under `experiments/d1`, not a production binding or browser change.

Current merge scope: isolated experiment code, tests and evidence. Production
SEO generation, browser behavior, Pages routes and bindings do not enable this
API. Stable identities and compact derived ranks now prevent time-only content
rewrites; see the final section. Historical cloud results below used the earlier
schema and are not acceptance measurements for the current implementation.

## Decision and stopping conditions

Determine whether moving substring matching and relevance ranking into D1 can
preserve the current results while meeting Workers Free CPU and D1 usage
limits. Stop adoption if result semantics differ, Worker CPU frequently exceeds
10 ms, or read/write capacity is inadequate for the observed workload. A
successful HTTP response alone is not adoption evidence.

Official D1 Free limits are 5 million rows read/day, 100,000 rows written/day,
5 GB total storage and 500 MB per database. Limits are shared across the account,
and queries fail when the daily limit is exhausted. A scan counts all rows
read, not just the returned cards; secondary indexes also add writes.
Sources: [pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[limits](https://developers.cloudflare.com/d1/platform/limits/),
[result metadata](https://developers.cloudflare.com/d1/worker-api/return-object/).

## Implementation

The offline builder projects the same 22,831 published and 4,687 eligible
pending records into a plugin table and an FTS5 trigram candidate index. Text is normalized with the
existing JavaScript rules before import. Precomputed date/ID ordering avoids
differences between SQLite binary ordering and JavaScript `localeCompare`.
Source order remains available for stable ties. Published rows occupy the
primary-key range in default recommendation order; no secondary index is
required for that common browse path. The original base-table import wrote 27,523 rows. Adding the trigram index
later wrote another 27,525 rows in the isolated database; these are actual D1
metrics, not SQLite internal change counts.

Search uses bound terms and `instr`, preserving literal substring behavior for
Chinese, English, punctuation and repeated terms. Default FTS5 tokenization
was rejected: it misses `memory` inside `memorytools` and `记忆` inside `记忆工具`.
The database computes relevance, count and the page's IDs. Only 30 display
cards return to the Worker. Filtered default recommendation is the exception:
it returns matching IDs/owners so the existing owner-diversity pass can operate
on the filtered set before slicing. This path needs separate CPU measurement.

No result cache is used, so measurements do not rely on cache hits. The API
exposes D1 rows-read, rows-written and SQL-duration metadata for the experiment.
Those diagnostics are not a production UI. A stale snapshot version returns
409, invalid request parameters return 400, and database failures return 503.
Unicode strings with unpaired UTF-16 surrogates are rejected at projection
build time instead of silently changing matches during UTF-8 import.

## Reproduction

Run from the repository with Node 22.13+ (uses `node:sqlite`):

```sh
npm ci
node experiments/d1/build.mjs
node experiments/d1/verify.mjs
npx wrangler deploy --dry-run --config experiments/d1/wrangler.jsonc
```

The builder writes only ignored `.generated/d1/` SQL and a local SQLite file.
Remote import/deploy are intentionally separate operations against the named
experiment database and Worker. The production `wrangler.jsonc`, Pages
workflow and browser are unchanged. Do not point this experiment at an
existing application database or import repeatedly without checking shared
daily quota.

## Original local evidence (before trigram indexing)

- Current full projection: 27,518 records, 75,972,608-byte local SQLite file;
  SQL import file 55,534,828 bytes.
- Fixture comparison: 972 cases covering all six sorts, filters, multiple
  pages, SQL punctuation, language fallbacks, emoji and repeated terms.
- Full-snapshot comparison: 213 queries/pages exactly match the existing query
  implementation, including broad single-letter queries and pending records.
- Independent review tested additional Unicode and error paths. The observed
  surrogate conversion gap is now a build error with a regression assertion.
- Compiled Worker: 8.79 KiB raw / 3.89 KiB gzip in the local dry run.
- Query plan: unfiltered default browsing uses the integer primary key;
  substring matching and general filtered queries still scan the table.
  Local SQLite timing is not cloud Worker CPU or D1 billed rows.

## Original cloud scan experiment

The isolated database imported 27,518 plugin rows and one build document.
Cloudflare reported 27,522 rows read, 27,523 rows written and 76,075,008 bytes
stored for import. A separate count/build readback matched the local projection.
The first account-usage query was rate-limited; a later successful analytics
response showed no recorded usage for that UTC day before import. Analytics
can lag and this does not verify the account's subscription.

Worker version `ad934d02-c78a-4c87-993c-844ce10b8e0b` used data version
`8ef43e06-d7da-4c92-8b70-e6674b5096fd`. Fourteen sequential/page requests all
returned HTTP 200. Twelve captured CPU traces ranged from 1 to 6 ms; none
exceeded 10 ms. The first memory request and default first page had no CPU
trace. A first request does not prove a fresh isolate. CPU coverage is incomplete,
so this is not full Free-runtime acceptance.

| Request | Worker CPU (ms) | D1 rows read | D1 SQL time (ms) | Max requests/day if exclusively using 5M reads |
| --- | ---: | ---: | ---: | ---: |
| Default first page | unknown | 121 | 1.92 | 41,322 |
| Default second page | 2 | 151 | 1.67 | 33,112 |
| Stars | 3 | 96,102 | 88.96 | 52 |
| UI category/default | 6 | 29,696 | 70.73 | 168 |
| `memory`, second page | 1 | 32,039 | 94.45 | 156 |
| `记忆` | 3 | 32,914 | 110.09 | 151 |
| `agent` | 3 | 50,514 | 127.34 | 98 |
| `a` | 2 | 141,144 | 170.38 | 35 |
| `dsh` | 2 | 141,679 | 162.78 | 35 |
| No match | 1 | 27,522 | 86.25 | 181 |
| `terminal tool` | 2 | 28,147 | 88.69 | 177 |

These are per-request accounting ceilings, not supported daily users or a
traffic forecast. Each new page incurs the query cost again. Other applications,
imports and failed/unfinished work can consume the shared allowance. D1 SQL
execution time is separate from Worker CPU and client-observed wall time.

The measurement stopped at 785,251 reads (zero writes), before the 800,000-read
experiment target. Concurrency was skipped because remaining headroom was too
small; the temporary tail was deleted. Client wall time through LAX ranged from
359 to 1,463 ms, with a 1,198 ms first request. This small sample does not meet
the proposed <=500 ms hot p95 target or establish performance in other regions.
Sample responses were at most 40,753 bytes. A separate cloud readback matched
all 30 `memory` IDs and total 886 to the local oracle; invalid page and stale
version responses were 400 and 409 respectively.

**Historical decision: do not adopt the original scan-based query in production.** Moving work into D1 substantially reduced
observed Worker CPU, but did not establish adequate Free read capacity. Real
traffic demand, first-request CPU, concurrency and peak memory remain unverified.

Full refresh is also not viable with the current two-hour sync schedule: even
inserting 27,518 plugin rows 12 times needs 330,216 daily writes, over the
100,000 limit before deletion/index overhead. This experiment has no production
refresh or atomic snapshot-publication integration; do not attach its seed import
to the current workflow. No production browser, Pages binding, custom domain or
subscription was changed. The named experiment database and Worker are retained.

Any next proposal must reduce scanned rows (or use static client-side query
artifacts) and establish an update strategy within the same quota before
production integration. Caching alone does not establish a safe uncached path.


## Indexed queries and incremental-update validation (latest)

The candidate index uses FTS5's **trigram** tokenizer, not its default whole-word
matching. It stores only index entries, with normalized content supplied by a
view of the plugin table. Query terms become quoted three-Unicode-codepoint
fragments, including escaped quotes. An indexed JOIN produces candidates;
`instr` still verifies the full term and locale before the unchanged ranking.
False-positive candidates cannot become false matches. Two-codepoint terms,
including `记忆` and `😀a`, still scan. NUL-containing fragments are skipped;
NULs in indexed text become spaces so later characters remain searchable.
See [SQLite's trigram semantics](https://www.sqlite.org/fts5.html#the_trigram_tokenizer).

Constant term extraction replaces per-row correlated `json_each` scans. A
response-time version check rejects publication between metadata and card reads
with 409 rather than returning mixed data. This requires publishers to update
content and version atomically; the experiment does not provide a cloud publisher.

On the existing isolated database, creating the index read 27,520 rows and wrote
27,525 rows. Storage became 85,045,248 bytes. Local SQLite reported 47,996
internal changes for the same operation: **SQLite total_changes is not D1 billed
rows_written**. Before index creation the valid account-wide UTC-day analytics
reported 872,333 reads and 27,523 writes. An initial 401 was resolved by Wrangler's
existing-session refresh, without changing subscriptions or application keys.

The intermediate IN-list implementation (Worker `2d9cb365-aa00-4505-aa16-d4c066fdf8eb`)
received 16 successful requests, spending 648,626 reads and zero writes. Fourteen
CPU traces were 1–5 ms. It exposed a broad-query regression for `dsh`; replacing
the intermediate list with a JOIN removed it. These 16 measurements must not be
attributed to the final Worker version.

Final Worker `77bf9576-bdd8-4a8f-9e47-b118619f7407`, still using data snapshot
`8ef43e06-d7da-4c92-8b70-e6674b5096fd`:

| Query | Original reads | Final JOIN reads | Final CPU |
| --- | ---: | ---: | ---: |
| `memory` | 32,039 | 5,416 | 4 ms |
| `dsh` | 141,679 | 123,530 | 5 ms |
| `terminal tool` | 28,147 | 505 | not sampled |
| No match | 27,522 | 5 | not sampled |

The final two traced requests consumed 128,946 reads and zero writes. Additional
readback matched all IDs and totals for memory (886), terminal tool (49), and
no-match (0), consuming another 5,926 reads. Combined with the intermediate run,
this round's search validation spent 783,498 reads. All temporary tails were
deleted. Concurrency was not run. Two final-version CPU samples do not establish
cold-isolate or sustained-load acceptance. Final Worker upload was about 10 KiB.

The unchanged short-term scan path measured 95,731 reads for `a` in the
intermediate run; stars used 96,103 and UI-category default used 29,697. Those
paths were not remeasured after the JOIN-only change. Broad/short terms and
non-default browse remain capacity constraints even when selective queries improve.

### Incremental-update experiment

`sync.mjs` plans INSERT/UPDATE/DELETE from actual projection differences by
primary-key slot, and validates application in one **local SQLite transaction**.
No-op plans retain the current version and perform zero writes. Metadata advances
only with effective changes. A stale base is rejected before mutation; injected
failure rolls back cards, FTS changes and version together. FTS triggers update
only for text changes, not card/quality-only updates. BLOB reads preserve embedded
NUL strings when comparing rows because node:sqlite TEXT reads truncate them.

Full 27,518-row local snapshot results:

| Input change | Plugin inserts / updates / deletes | Text-changing slots | SQLite total_changes |
| --- | --- | ---: | ---: |
| Same input | 0 / 0 / 0 | 0 | 0 |
| One existing icon changed | 0 / 1 / 0 | 0 | 2 |
| Only generatedAt +2 hours | 0 / 27,518 / 0 | 21,172 | 349,543 |
| New plugin inserted first | 1 / 27,518 / 0 | 27,504 | 428,302 |

The last column includes SQLite internal FTS operations, **not cloud billing**.
The updated plugin-row counts alone demonstrate the remaining issue: `pos` is
home rank, not stable identity, and quality/order fields depend on snapshot time
and dense rankings. Two-hour refreshes can still update all 27,518 rows, requiring
at least 330,216 plugin-row writes/day at 12 refreshes before additional overhead.
Do not freeze ranking time or change search semantics to hide this fan-out.

Focused checks: 1,026 fixture result comparisons and 213 full-snapshot query/page
comparisons; no-op/card-only updates; insert/delete/reorder; NUL/quotes/emoji;
FTS integrity after edits; rollback after a text mutation; stale-base rejection;
409 with no items when publication interrupts a search. These pass locally.

**Historical decision:** retain the indexed candidate query and local delta prototype,
but do not wire a cloud writer or production browser to it.
Selective-query reads improve substantially; Free capacity for broad searches and
scheduled updates remains unproven/insufficient. A production-capable next step
would separate stable plugin identity from derived display order and time-based
ranking. D1 atomic delta publication, concurrency, cloud peak memory and actual
traffic requirements are not validated. Production stayed on its original build.


## Stable identities and merge boundary (current)

Plugin `pos` now identifies a plugin independently of its rank. Incremental builds
pass `readIdentities(db)` into `buildProjection(registry, audit, identities)` to
reuse existing allocations; new identities receive new positions. The delta
planner rejects reassignment of an existing identity. A fresh build needs no
previous map. There is no legacy-schema migration or fallback.

Time-dependent quality, source order and dense ranking fields live in
`rank_blocks`: one JSON tuple per identity, grouped into 256-position blocks.
`home_pages` stores the actual 30-position default pages. The database reads
rank tuples while sorting, so changes in rank no longer move plugin text or cards.
The delta transaction updates changed plugin rows, changed rank blocks, changed
home pages and metadata together. It preserves rollback and stale-base checks;
missing expected home pages fail instead of returning a false empty success.

Full 27,518-row snapshot, advancing only generatedAt by two hours:

- Plugin insert/update/delete: **0 / 0 / 0**; text changes: **0**.
- Changed rank blocks: **108**; changed home pages: **735**; metadata: **1**.
- This plan contains **844 table writes**, versus 27,518 plugin updates plus FTS
  churn in the previous layout. Twelve identical-sized refresh plans would mean
  10,128 table writes, but real upstream changes can differ. These are local
  plan counts, not observed D1 billing.
- Unchanged input performs zero writes; an existing icon change performs two.
- Adding/removing/promoting a plugin preserves positions of remaining identities.
- Local file including FTS: 83,464,192 bytes.

Focused verification compares 1,031 fixture results and 213 whole-snapshot
queries/pages against the existing search oracle. Tests cover text edits,
identity stability, no-op refresh, time-only refresh, missing home pages,
rollback after both FTS and derived-data changes, stale bases, and publication
interrupting a query. CI explicitly builds and verifies the experiment on Node 22.

**Merge decision:** this revision is suitable to merge as an isolated experiment
once its current-head checks pass. It is not production search enablement. The
failed in-memory route and SEO artifact generation have been removed from the
production path; reusable query code lives in `experiments/shared`, historical
handler code in `experiments/in-memory`. Normal Pages compilation has no
`/api/search` route or generated search index/card artifacts.

The retained cloud experiment still runs the preceding schema/version. Do not
deploy the current Worker onto that older database. New-schema cloud CPU/read
accounting, atomic D1 delta publication, concurrent load and peak memory still
need acceptance before any production switch. Broad-query read capacity also
remains an open concern; no subscription or production binding was changed.
