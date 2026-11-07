# Paged search prototype

Decision date: 2026-11-07. Related: #106. Target: Workers Free.

This document archives the in-memory prototype's measurements. That runtime
exceeded Workers Free CPU limits and is not enabled in production. Its handler
now lives in `experiments/in-memory`, with reusable indexing/query code in
`experiments/shared`. The production browser and SEO build keep their original
on-demand browse behavior; there is no production `/api/search` route.

The current isolated implementation and acceptance boundaries are described in
[d1-search-experiment.md](d1-search-experiment.md). Merging these experiments does
not enable production search or a D1 publisher.

## Historical implementation

The earlier prototype compiled a query index into a Pages Function and emitted
4,096 card buckets. It precomputed six sort orders, diversified default order,
and one/two-code-unit fragment candidates. Its handler paginated 30 cards,
rejected stale versions, and failed on missing cards. That deployment integration
was removed after runtime measurement failed. The pure query and handler tests
remain reproducible with `node --test tests/query-index.test.mjs tests/search-api.test.mjs`.

## Initial prototype: observed local results

Snapshot: 22,831 published plugins and 4,687 eligible pending candidates.
Runtime: Wrangler 4.123.0 local workerd; Node 25.9.0 drives the measurement.
One first request followed by 30 varied sequential requests over English,
Chinese, category, sorting, no-match queries and three pages. The local cache
directory was fresh. Numbers below are observations, not cloud guarantees.

| Measurement | Earlier dynamic index / 256 buckets | Compiled index / 4,096 buckets |
| --- | ---: | ---: |
| First `memory` response wall time | 174.6 ms | 73.5 ms |
| Warm wall p95 | 43.7 ms | 40.2 ms |
| Used heap after workload | 83.9 MiB | 52.1 MiB |
| Allocated heap after workload | 122.0 MiB | 60.0 MiB |
| Card data read for 30 `memory` results | 3,129,882 bytes / 2,998 cards | 264,275 bytes / 249 cards |

The first page was 37,978 raw JSON bytes; the largest of the 31 measured
responses was 41,257 bytes. The compiled bundle was 13,580.30 KiB raw and
3,713.85 KiB gzip. Local startup sampling reported 7.6 ms active in an 81.9 ms
profile window, with only four samples; this does not certify cloud startup.

The warm V8 profile estimated 22.1 ms active per request on average, including
GC. It contains unresolved `(program)` samples, profiler overhead and runtime
work. It is neither per-request CPU p95 nor Cloudflare billed CPU. Before/after
heap observations do not measure peak memory or concurrent isolate pressure.

## Verification and reproduction

Current isolated checks:

```sh
npm ci
node --test tests/query-index.test.mjs tests/search-api.test.mjs
node experiments/d1/build.mjs
node experiments/d1/verify.mjs
```

The former deployment commands are historical: the Pages-integrated source can
be inspected at commit `3fc280c0a60c2e0bb6a538cefdd2ca4ede20f0e9`. Running the
normal build on the current revision does not generate that prototype.

Unit coverage compares query ordering with existing browser functions at a
fixed clock, including locale fallbacks, explicit sort ties, pending filters,
diversity across page boundaries and immutable shared records. API tests cover
bounded pages, invalid input, changed versions, failed card reads and HEAD.
Use a fresh local runtime/cache path for a new cold run. Attach DevTools to the
inspector for CPU/heap sampling; measure wall latency separately.

## Adoption gate

The user selected Free-plan constraints explicitly. Current official limits
are 10 ms CPU per HTTP request, 128 MB per isolate and 64 MiB uncompressed
Worker size; gzip size is no longer a limit. Pages Functions share Workers
Free request quotas. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
and [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/).

### Cloud preview result: reject this execution approach for Free

An isolated preview on 2026-11-07 received 31 sequential requests from the
development machine through its existing network path; observed edge was LAX.
All returned HTTP 200. A temporary Pages tail supplied 17 trace events with
`cpuTime` and `outcome=ok`: 13 exceeded 10 ms, ranging from 7 to 87 ms overall.
The first `memory` request used 87 ms CPU; representative later requests used
24 ms (`memory`, English), 33 ms (`agent`) and 38 ms (unfiltered relevance).
The 17 traces are incomplete coverage, not a population CPU percentile.
HTTP 200 does not prove Free-budget compliance: the account subscription was
not readable and the platform permits limited overages.

Client-observed first response was 1,985 ms and warm p95 700 ms on that network
path. These do not establish latency from other user locations. The measured
preview was `10754b74.dsh-plugin-registry.pages.dev`; subsequent changes only
corrected build-version identity and bounded build-time file writes.

Decision: retain the API/semantic prototype as a draft; do not adopt its
full-index scan for production under the requested Free budget. Further work
must reduce request-time query computation or separately evaluate a read-only
query projection. Peak/concurrent memory also remains unverified. Do not
assume response-cache hits cover new queries or cold isolates. No database,
plan upgrade or production frontend switch is part of this prototype. The
temporary tail session was removed after measurement.

## Indexed iteration: measured and rejected for Free

The next iteration was deployed only to preview
`c70a5fe3.dsh-plugin-registry.pages.dev` on 2026-11-07. It uses the same directory
snapshot and returns exactly the same results: 432 whole-result comparisons
and 1,728 page comparisons against the previous query implementation matched.
Tests additionally cover rare fragments avoiding unrelated rows, Unicode and
lone surrogates, all sort ties, broad-query pages and large offsets. Independent
bounded fuzz comparisons also matched the existing browser ordering.

The generated query document is 20,456,143 bytes, including 91,429 fragment
postings. The Worker bundle is 22,603.65 KiB raw. A fresh local runtime measured
warm wall p95 24.1 ms over the same 30-request workload; used heap after the run
was 78.9 MiB, allocated heap 86.7 MiB. A prior run overlapped the full test suite
and is excluded from latency comparisons. Neither run measured memory peaks.

Cloud measurement sent 45 requests through the existing network path to LAX:
one first request, 36 sequential queries/pages, six concurrent queries, one
repeat and one 199-character repeated-term query. All returned HTTP 200. Tail
captured 24 CPU traces, not a complete distribution:

| Phase | CPU trace coverage | CPU range | Samples over 10 ms |
| --- | ---: | ---: | ---: |
| First `memory` request | 1/1 | 94 ms | 1 |
| Sequential queries | 18/36 | 2–80 ms | 7 |
| Six concurrent requests | 4/6 | 25–98 ms | 4 |
| Repeat `memory` | 1/1 | 1 ms | 0 |
| Repeated `a` terms | 0/1 | Unknown | Unknown |

Unfiltered recommendation now had 5/6 ms samples and star sorting 7/8 ms.
English `agent` still used 27/20 ms, single-letter `a` 80 ms, and `dsh` 40 ms
on sequential requests. The repeat may have hit cache, but this was not
independently established. The first request is the first sent by this run;
isolate coldness was not independently observable. The long repeated query
took 1,895 ms client wall time, with no captured CPU trace, so no CPU conclusion
is drawn for that case. Tail was deleted successfully after measurement.

Decision: the agreed stopping condition is met. Keep this experiment in the
draft PR, do not switch production, and stop refining the in-memory execution
approach. A later read-only database projection evaluation must preserve
substring/localization and ranking semantics and verify its own Free quotas;
it is not automatically approved by these results. No database or plan changes
were made. Sustained load and cloud peak memory remain unverified.

## Follow-up: isolated D1 experiment

The separate [D1 experiment](d1-search-experiment.md) preserved tested result
semantics. Its latest trigram candidate JOIN reduced memory reads to 5,416,
but broad dsh queries still read 123,530 rows and time-dependent ranking can
rewrite the full projection during incremental refresh. Free read capacity and the two-hour refresh
write budget are not acceptable adoption evidence. Do not enable this execution path in production; neither
execution approach is connected to production browser search.
