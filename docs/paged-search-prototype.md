# Paged search prototype

Decision date: 2026-11-07. Related: #106. Target: Workers Free.

This branch is an experiment, not a production search migration. The browser
still uses its existing on-demand directory download. Do not merge or switch
the browser: observed cloud CPU samples exceed the Free request budget.
Local wall-clock timing is not billed CPU time.

## Implementation

`npm run build` derives a compact query index and install-free display cards
from the existing registry and audit snapshots. Ranking scores are fixed at
`registry.generatedAt`. The index is compiled into the Pages Function through
`.generated/search.json`; it is not fetched and parsed on the first request.
Cards are divided into 4,096 static buckets, written in batches of 64 to avoid
exhausting file descriptors. A page reads only its selected card buckets.

`GET /api/search` accepts `q`, `category`, `source`, `manifest`, `language`,
`sort`, `locale`, `page`, and optional `version`. It returns at most 30 cards,
the full match count, global facets, summary and build version. Matching,
sorting and default owner diversity happen before pagination. Pending
candidates remain opt-in through `manifest=not_validated`.

Search and existing detail responses share one build UUID. This changes even
for code-only builds, so a changed ranking implementation cannot reuse cached
pages from an earlier build. A stale pagination version returns 409. Missing
cards return 503 rather than a partial or empty successful result. HEAD misses
cannot populate the response cache with an empty GET representation.

## Observed local results

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

```sh
npm ci
npm test
npm run validate:registry
npm run check:ranking
npm run build
npm run check:performance
npm run test:e2e
bash -c 'ulimit -n 1024; node --test tests/seo-generation.test.mjs'
node node_modules/wrangler/bin/wrangler.js check startup --pages --outfile /tmp/search-startup.cpuprofile
node node_modules/wrangler/bin/wrangler.js pages dev dist --port 5570 --inspector-port 5571 --persist-to /tmp/search-fresh-runtime
```

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
