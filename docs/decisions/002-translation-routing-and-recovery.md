# ADR 002: Stable translation routing and recovery in place

**Status:** Accepted · **Date:** 2026-10-29

## Context

Camera recognition can produce requests faster than translation completes. Requests wait in a bounded queue, while connectivity or server configuration can change. Choosing the cache namespace at enqueue time but the translator at execution time could store a local result under an online key, or send a queued request to a newly configured server.

A frozen capture has a second failure mode: there may be no new recognition event to trigger automatic retries. Restarting the camera would discard the view the user is trying to read.

## Decision

Capture the selected translation mode and endpoint identity when a request enters the queue. Build its cache key from that same choice. Local work remains local even if online mode becomes available while it waits. Online work does not silently switch to local translation. If its endpoint changes before execution, fail that request instead of sending it to the replacement server.

Expose a recovery action for failed translations. It moves only error regions back to reading, increments their text versions, and resubmits them through the coordinator. It preserves geometry, original text, successful regions, and the camera's frozen state. A retry captures the currently selected route as a new request.

Each result carries a region ID and text version. The overlay store rejects results for an older version. The queue's generation guard suppresses results from cleared sessions. The UI distinguishes translation errors from camera-start errors.

## Alternatives considered

| Alternative                                                          | Tradeoff                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Choose the translator when a queued request starts                   | Convenient connectivity adaptation, but inconsistent with an already computed cache key               |
| Automatically fall back from any online error to offline translation | May lack models and silently changes translation behavior; not implemented                            |
| Restart capture after a translation error                            | Simple recovery, but loses the frozen image and retranslates successful regions                       |
| Retry every frame without limits                                     | Can flood an unavailable provider and repeat low-quality OCR requests                                 |
| Cancel all in-flight network and native calls immediately            | Requires cancellation support across platform boundaries; current guards reject stale results instead |

## Consequences

A queued request may fail after configuration changes and need an explicit retry. That is preferable to using a different server or mislabeling its cache entry. In-flight work may finish after the user leaves; stale result guards protect presentation, but they do not guarantee that provider processing or usage has stopped.

Recovery does not improve damaged OCR by itself. If the same input remains ambiguous, the user needs a clearer capture or a corrected source-language choice. A missing offline model still needs to be downloaded.

## Evidence

- Queue regressions fill both execution slots, change connectivity, and verify that waiting work retains its original translator and cache namespace.
- An endpoint-change regression verifies that queued work fails without contacting the replacement endpoint.
- Store tests preserve successful regions and reject late results from the previous text version.
- A coordinator regression recovers an error while frozen without a new OCR frame.
- A camera component test invokes recovery without restarting or resuming capture.
