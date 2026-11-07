# Isolated D1 search experiment

Decision date: 2026-11-07. Related: #106 / draft #107. This is a standalone
experiment under `experiments/d1`, not a production binding or browser change.

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

## Minimal implementation

The offline builder projects the same 22,831 published and 4,687 eligible
pending records into a single SQLite table. Text is normalized with the
existing JavaScript rules before import. Precomputed date/ID ordering avoids
differences between SQLite binary ordering and JavaScript `localeCompare`.
Source order remains available for stable ties. Published rows occupy the
primary-key range in default recommendation order; no secondary index is
required for that common browse path. Initial import therefore writes roughly
27,518 plugin rows plus metadata/schema overhead, rather than about 78,000
rows with two extra indexes.

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

## Local evidence

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

## Cloud evidence and decision

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

**Decision: retain the experiment, do not adopt this scan-based D1 query for
production, and keep #107 draft.** Moving work into D1 substantially reduced
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
