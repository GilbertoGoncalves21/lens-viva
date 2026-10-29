# Validation and release evidence

Unit coverage measures exercised code, not translation accuracy or camera reliability. Use this guide to keep automated evidence separate from real-device and provider checks.

## Local verification record: 0.2.1

Recorded on **2026-10-29**: **1,434 tests passed across 44 files**. V8 coverage: **97.73% lines**, 97.34% statements, 93.52% branches, and 96.57% functions. Production web build, Capacitor sync, and Android debug assembly passed. Dictionary affix, word-list, and license assets were verified in both web and native output.

New regressions cover horizontal translations for rotated OCR, fragmented words assembled into one phrase, missing-letter repair including `Everyhing`, and preserving original OCR. The integrated offline flow asserts one corrected whole-phrase translation call even with a legacy line preference. Translator output remains simulated. Physical-device and live-provider acceptance remain pending.

## Local verification record: 0.2.0

Recorded on **2026-10-29**:

| Check                                         | Result                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Angular / Vitest                              | 1,424 tests passed across 43 files                                                 |
| V8 coverage                                   | 97.76% lines; 97.41% statements; 93.71% branches; 96.48% functions                 |
| Node.js server tests                          | 7 passed with a simulated provider                                                 |
| Production web build and Capacitor sync       | Passed                                                                             |
| Android debug build and native unit-test task | Passed; unchanged native test inputs reused Gradle's cached result                 |
| Browser card at 320 px                        | Automatic and target labels remained single-line; no horizontal page overflow      |
| Browser demonstration                         | Phrase, menu, long-text panel, keyboard selection, and original comparison checked |

These are local results, not a remote CI run or physical-device acceptance. The demo's curated outputs are not provider evaluation evidence.

## Automated verification

```sh
npm run test:coverage
npm run server:test
npm run build
npm run android:sync
```

From `android/`, use the Gradle wrapper to run `:app:testDebugUnitTest :app:assembleDebug` as described in the [development guide](DEVELOPMENT.md).

The regression suite covers phrase grouping, menu terminology, overlay fitting, queue concurrency and cache routing, session lifecycle, failed-region recovery, and original-text comparison. The new frozen-frame recovery scenario asserts that a successful translation is preserved and an older result cannot overwrite a retried region.

An integration test also connects the real recognition coordinator, translation queue, cache, overlay store, and Angular HTTP client. It submits a multiline frozen phrase, simulates an HTTP failure, retries without another frame, and verifies the completed translation and history entry. Only the platform boundaries and HTTP response are simulated; no provider call is made.

Server tests use a simulated provider. The demo uses curated translations. Neither establishes live translation accuracy.

## Browser review

Open `/camera` and `/demo` on the development server. Check mobile widths of 320 and 390 pixels, a short viewport, and a desktop viewport.

| Scenario                      | Expected result                                                       |
| ----------------------------- | --------------------------------------------------------------------- |
| Automatic source              | Compact automatic label; no split words in the language card          |
| Phrase example                | Single-line translation; comparison reveals the original              |
| Menu example                  | Separate labels and readable overlays                                 |
| Long-text example             | Reading panel; complete text available through horizontal scrolling   |
| Scene change after comparison | New example starts with translated text                               |
| Keyboard navigation           | Visible focus; scenario and comparison buttons work without a pointer |
| Permission or model gate      | Clear next action; language selection and demo remain reachable       |

## Real-device checks still required

These checks require hardware or a configured provider and must not be marked passed based on unit tests or fixtures.

| Scenario                                   | What to record                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Printed phrase, paragraph, and menu        | Device, lighting, source/target languages, OCR text, and translation result |
| Japanese source                            | Selected recognizer, legibility, and correct language routing               |
| Freeze during an active request            | Frame stays fixed; a late valid result remains correctly anchored           |
| Failed translation while frozen            | Recovery preserves capture and successful translations                      |
| App background/foreground and rotation     | No duplicate camera stream or misplaced preview                             |
| Offline with and without downloaded models | Correct model gate and successful translation when models are present       |
| Reachable online service without models    | Complete-text request and no local-model download gate                      |
| Provider error, timeout, or ambiguous OCR  | Explicit failure or uncertainty; no guessed success state                   |
| Connectivity and endpoint changes          | Cache separation, correct routing, and recovery behavior                    |

For a provider evaluation, use a small fixed set of public or synthetic texts. Save the source text, OCR output, expected meaning, actual translation, model identifier, and elapsed time. Separating OCR errors from translation errors makes the next improvement measurable. Use request counts and latency measurements from the actual deployment rather than estimating them from local unit tests.

## Current limitations

The repository does not configure a live provider account, public endpoint, multi-user authentication, release signing, or an automated hardware test lab. Native unit tests cover policies and build compatibility; they do not prove physical camera behavior. See the [decision records](decisions/README.md) for the reasons behind current tradeoffs.
