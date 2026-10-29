# ADR 004: Reconstruct phrases and keep translations horizontal

**Status:** Accepted · **Date:** 2026-10-29

## Observed failures

The renderer inherited the OCR baseline angle, so a source angle of 90 degrees produced a vertical translation. Single-line CSS alone could not prevent rotation. Phrase grouping joined successive rows but missed words emitted as separate blocks on the same row. An older line-mode preference could still split local translation requests.

`Everyhing happens for a reason.` exposed another boundary: grouping words does not repair spelling. The offline translator received the misspelled word unchanged. The server prompt requested contextual repair, but that path requires a configured online service.

## Decision

- Render translation balloons horizontally, independently of source orientation. Preserve source geometry for tracking.
- Reassemble nearby, similarly sized fragments on one reading baseline before paragraph grouping, filtering, or menu detection. Use projected reading coordinates for rotated sources and constrain joins by spacing, angle, alignment, and overlap.
- Always process phrases/paragraphs in the camera. Remove the line-mode setting from the UI and retain its storage field only for compatibility. Separate menu entries remain separate.
- Before local English translation, use nspell and a bundled Hunspell dictionary to repair uniquely recoverable letter errors. Pass the complete corrected phrase to the local translator once. Preserve the original OCR in the overlay store and history.
- Online translation continues to send text and scene context to the configured provider for contextual interpretation. Lexical spelling repair is not a substitute for that reasoning.

## Constraints and alternatives

Unrestricted fuzzy substitution can change valid words or names. Local repair accepts only a unique one-edit insertion, deletion, substitution, or adjacent transposition. It leaves valid dictionary words, short isolated tokens, internal capitalized names, codes, URLs, and ambiguous candidates unchanged. A phrase needs at least half its tokens recognized by the dictionary. An isolated word of at least eight letters may be repaired if a unique candidate exists. This handles `Everyhing` without hard-coding that spelling.

These rules reduce accidental replacements; a unique suggestion is not proof of the author's intention. The original remains available for inspection. English is currently the only bundled correction dictionary. A valid but contextually wrong word such as `form` instead of `from` remains unchanged locally. Online interpretation still requires a configured service, and ambiguous model output is not guaranteed to be detected.

## Packaging

nspell and the dictionary load lazily. The pinned `dictionary-en` package supplies assets copied into the web build and APK, including its original license notice. No separate dictionary/model download is needed on Android. A browser still obtains these app assets from its host on first use.

If the dictionary cannot load, translation continues with the original OCR. Correction results are bounded in memory and translation cache keys include the engine version. Review that version when changing the dictionary or repair policy.

References: [nspell](https://github.com/wooorm/nspell), [dictionary-en and notices](https://github.com/wooorm/dictionaries/tree/main/dictionaries/en).

## Evidence

Tests cover source angles of 90, -90, and 180 degrees; same-row fragments; multiple rows; separate columns; missing letters; ambiguity; names; codes; valid words; and dictionary failure. An integration test starts with fragmented `Everyhing…` OCR and a legacy line-mode preference, then checks one local translation call containing `Everything happens for a reason.` and unchanged original text in the store.

Automated translation outputs are simulated. These tests establish the processing contract, not universal spelling correction, physical OCR accuracy, or live Gemini quality.
