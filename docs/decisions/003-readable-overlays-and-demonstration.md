# ADR 003: Readable overlays and an honest interactive demonstration

**Status:** Accepted · **Date:** 2026-10-29

## Context

Translations do not have the same width as their source text. Fixing a balloon to a narrow OCR box can split a word across lines. Making every balloon larger can cause overlap or cover most of the scene. The automatic-language label also overflowed its compact language card.

Reviewers cannot always grant camera access or configure a translation server. They need a way to inspect the interaction while understanding which results are simulated.

## Decision

Preserve single-line translation text. Fit balloons within the preview using measured rendered width, and switch to a reading panel when text cannot remain readable or placements collide. The reading panel scrolls horizontally for long text rather than truncating translations or breaking words. It is anchored near the bottom and capped at 70% of the preview height so the scene remains visible; its content scrolls instead of being clipped.

Use a compact localized automatic-language label in the camera card while retaining the full name in its title. Present live/frozen state, processing progress, ready translations, and actionable failures separately. Disable the capture control while a freeze/resume operation is pending.

Add a lazy-loaded `/demo` route with curated phrase, menu, and long-text examples. It reuses the production overlay component, allows comparison with original text, and labels every result as illustrative. It does not access the camera, change user preferences, invoke OCR, or call a translation provider.

## Alternatives considered

| Alternative                                              | Tradeoff                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| Break words to stay inside the OCR box                   | Saves space but makes short labels difficult to read           |
| Shrink all text until it fits                            | Can produce inaccessible, unreadable text                      |
| Truncate translations with an ellipsis                   | Conceals part of the result the user needs                     |
| Cover the original paragraph with a large opaque block   | Hides scene context and makes visual navigation harder         |
| Require a camera and API account for every demonstration | Makes review depend on hardware, permissions, and credentials  |
| Present fixture translations as live results             | Creates misleading evidence of recognition or provider quality |

## Consequences

Horizontal scrolling is a deliberate usability tradeoff for long translations. The panel explains that interaction, and original text remains available. The example route demonstrates rendering and interaction, not recognition accuracy, latency, or live provider quality.

The existing module-based application remains intact. The new demonstration is a standalone lazy-loaded component; rewriting unrelated pages would increase the regression surface without addressing the observed failures.

## Verification

Overlay tests cover no-wrap layout, text measurement, dense scenes, and original-text toggling. Browser checks cover the language card at mobile widths and all three demonstration examples. The rendering path is shared with the camera screen, while actual Android camera validation remains a separate task in [Validation](../VALIDATION.md).
