# Engineering decisions

These records explain the constraints, alternatives, and consequences behind Lens Viva. They describe implemented behavior; they do not imply that every deployment or device scenario has been validated.

| Record                                                 | Decision                                                                    | Status   |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | -------- |
| [001](001-local-recognition-contextual-translation.md) | Keep recognition local and make contextual translation optional             | Accepted |
| [002](002-translation-routing-and-recovery.md)         | Capture translation routing when queued and recover failed regions in place | Accepted |
| [003](003-readable-overlays-and-demonstration.md)      | Preserve single-line translations and provide an explicitly simulated demo  | Accepted |

Each record connects a product problem to a technical decision, the rejected alternatives, relevant tests, and remaining limits. Use the [validation guide](../VALIDATION.md) to distinguish automated evidence from checks requiring a real device or provider account.
