# ADR 001: Local recognition and optional contextual translation

**Status:** Accepted · **Date:** 2026-10-29

## Context

Camera OCR produces uncertain text and frequently divides a sentence across lines. Translating every detected fragment independently can lose meaning. Recognition errors can also survive translation: fluent output alone is not evidence that the source was read correctly.

The app must remain useful offline on Android, and online access must not force users to download local translation models first. Camera images should remain on the device in the current design.

## Decision

Keep recognition in the platform engine: CameraX and ML Kit on Android, Tesseract.js in the browser. Group adjacent aligned text into paragraphs, preserving separate columns and sentence boundaries. Menu scenes retain separate labels because neighboring menu entries do not necessarily form a sentence.

When a server is configured and the device reports connectivity, send the requested text and bounded scene context to that server. The Gemini adapter requests a natural translation and an uncertainty flag. Online mode skips local translation-model requirements. Without online configuration or connectivity, use the platform translator and its required models.

Provider credentials stay on the server. The app stores a separate client token. Camera images are not part of the HTTP contract.

## Alternatives considered

| Alternative                                   | Reason for the current choice                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Translate each word or OCR line independently | Loses sentence context and can misinterpret isolated terms                     |
| Send camera frames to a cloud vision service  | Adds image transmission and a network dependency to recognition                |
| Require local models for every session        | Creates an unnecessary download gate for configured online translation         |
| Always use a cloud translator                 | Prevents offline use and makes all translation depend on provider availability |
| Correct OCR through fuzzy word substitution   | Can silently replace valid words, names, or numbers with unrelated content     |

## Consequences

The app has two translation paths with different capabilities and failure modes. A single camera frame can contain unrelated content, so scene context must inform the requested translation without being appended to the result. Instructions embedded in recognized text are treated as data by the provider prompt.

An uncertainty flag is a model response, not proof of correctness. Latency, provider limits, and real translation quality still require measurement with a configured account. Automatic source selection does not run every script recognizer simultaneously; explicit source selection remains important for non-Latin scripts.

## Evidence and limits

Phrase and normalization tests cover multiline sentences, separate columns, and menu handling. Coordinator tests verify complete-text requests and skipping model checks online. Server adapter tests validate the request and response contract with simulated provider responses.

These tests do not establish live Gemini accuracy, device OCR quality, or offline model behavior on every Android version. See [Validation](../VALIDATION.md).

The bounded English lexical repair added in 0.2.1 is specified in [ADR 004](004-phrase-reconstruction-and-ocr-repair.md). It does not introduce unrestricted fuzzy substitution or replace provider-based interpretation.
