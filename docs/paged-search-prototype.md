# Paged search prototype

Decision date: 2026-11-07. Related: #106. Target: Workers Free.

This branch is an experiment, not a production search migration. The browser
still uses its existing on-demand directory download. Do not merge or switch
the browser until the Free request CPU budget and production memory headroom
are established. Local wall-clock timing is not billed CPU time.

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

Keep this as a draft while cloud CPU and peak/concurrent memory remain
unverified. Do not assume response-cache hits cover new queries or cold
isolates. If the in-memory query cannot meet Free limits, reject this execution
approach and evaluate a read-only query projection separately. No database,
plan upgrade or production frontend switch is part of this prototype.
