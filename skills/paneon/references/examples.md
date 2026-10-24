# One-off explanatory examples

These two pages keep their title, topic, presets and initial values in source; users can explore the available settings in the page. Run them as they are, or copy the complete skill directory and edit the source to write a new explanation for the current conversation. They take no business JSON input and are not built-in pages.

`<skill>` is the absolute path of this skill directory. Run either page and give the human the returned URL:

```bash
paneon panel run <skill>/assets/examples/dining-philosophers/panel.tsx --cwd /work/project --json
paneon panel run <skill>/assets/examples/sentinel-leap-array/panel.tsx --cwd /work/project --json
```

## Dining philosophers

Five philosophers share five forks; each needs the two adjacent forks to eat. The example compares left-fork-first acquisition (which reaches a five-person deadlock), a global table lock held through eating (one diner at a time), and ascending fork-number acquisition (prevents circular waiting while allowing independent diners to overlap). The classic problem and resource-ordering approach are described in [CS 537: Deadlock](https://pages.cs.wisc.edu/~solomon/cs537/html/deadlock.html).

Each philosopher runs one six-line program: `enter(table);`, two `take(...)` lines, `eat();`, `put(left); put(right);`, and `leave(table);`. The ordered strategy changes only the two take lines to ascending fork numbers. Entry/exit is exclusive only in the serial strategy; the other two permit free entry. One simulation step attempts one displayed source line. A successful instruction advances that philosopher's program counter by one. A failed acquisition leaves it on the same line, and the scheduler skips that philosopher until its resource is available. Ready philosophers take turns in P0 → P4 order. Each philosopher eats one meal and then leaves; there are no hidden thinking/eating ticks or automatically combined entry, acquisition, release or exit operations.

The detail panel highlights the next line with an arrow and marks the last successful instruction with a check. Every node shows its progress out of six lines. Dashed fork arrows preview the next acquisition in blue, become orange after a blocked attempt, and turn red if they belong to a deadlock. All three colors point to the requested fork; the diagram never replaces them with person-to-person deadlock arrows. Solid gray lines show fork ownership and end outside the person circles. Serial entry waits refer to the central dining permit and are labeled separately.

Play, pause, previous/next step, timeline seeking and reset are page-local. Autoplay executes one step per second. Switching strategies restarts the scenario; “Reproduce deadlock” jumps to the reachable left-first deadlock. Select a philosopher to inspect held forks and that philosopher's program counter; otherwise the detail panel follows the last acting philosopher. Colors follow the configured light/dark theme; labels follow the configured Chinese/English language. The model derives ownership, waits and deadlock cycles from actual state transitions; it does not simulate OS threads or predict real execution time. Ordered acquisition prevents deadlock but does not by itself prove starvation freedom or guarantee overlapping meals for every interleaving.

This page is a local simulation. It has no annotation controls and emits no events.

## Sentinel LeapArray

The authoritative source is fixed at [alibaba/Sentinel commit a3f40ba8e900c8489bd520274739f17235a7721c](https://github.com/alibaba/Sentinel/tree/a3f40ba8e900c8489bd520274739f17235a7721c). The page links these implementations at that version:

- [LeapArray](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/base/LeapArray.java): mapping, `currentWindow` branches, `values`, expiry check.
- [WindowWrap](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/base/WindowWrap.java): left-closed, right-open bucket interval.
- [BucketLeapArray](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/metric/BucketLeapArray.java): updates the start time and resets metrics.
- [MetricBucket](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/data/MetricBucket.java): PASS counter and reset.
- [ArrayMetric](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/metric/ArrayMetric.java): the statistics entry calls `currentWindow` before aggregating `values`. Its default constructor uses the occupiable implementation; this example models sequential requests without priority borrowing.

The initial scenario uses a QPS limit of 5, 4 slots and a 1000 ms statistics interval (250 ms per bucket). Users edit the QPS limit, interval, slot count, and request rows (arrival time in ms and number of independent requests). Steady, burst and idle presets populate the request editor. Apply & restart validates and applies the draft; invalid edits leave the previous scenario intact. The interval must be 100–10000 ms and divisible by 2–8 slots. Arrivals are integer timestamps from 0–60000 ms; the page supports up to 100 rows and 1000 requests per scenario.

- [DefaultController](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/controller/DefaultController.java): ordinary QPS fast rejection checks `floor(passQps) + 1 <= threshold` for each individual request.
- [StatisticNode](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/node/StatisticNode.java): `passQps` divides the active PASS count by the statistics interval in seconds.

Each arrival accesses its current bucket before summing active buckets, so a reused slot is reset before that request's check. A passed request increments PASS; a rejected request increments BLOCK without increasing PASS. Equal-time requests are processed individually in input order, rather than as one bulk `acquireCount`. The time-to-slot diagram, before/after bucket values, active-bucket sum, cumulative pass/block totals and decision formula all come from the same recorded trace. Long idle periods do not create skipped buckets or eagerly clear other slots. Expiration uses `time - start > interval`; equality remains valid until an access resets that slot. This is bucket-based statistics, not an exact event-timestamp sliding window.

Play, pause, restart and the draggable, keyboard-accessible time slider inspect a deterministic trace. Seeking backward restores past state without generating requests or simulating actual clock rollback. The request history also allows inspecting individual requests that share a timestamp. The old `model.ts` retains low-level clock-rollback and negative-time examples for model tests; they are not controls in this request-driven page. Chinese/English copy and light/dark themes follow the page environment.

This is a plain TypeScript teaching model. It does not run Java, verify lock/CAS contention or real performance, or simulate priority borrowing, warm-up, queueing, or the occupiable bucket extension. The page performs no external business operations and emits no browsing events. The human's experience and follow-up questions are for the main agent to confirm; do not report automated checks as the human having tried the page.
