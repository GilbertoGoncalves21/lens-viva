# Contributing to Lens Viva

Start with the [README](README.md), [development guide](docs/DEVELOPMENT.md), and [architecture overview](docs/ARCHITECTURE.md).

## Making a change

1. Create a branch for one focused improvement.
2. Keep changes within the relevant page, service, utility, or native engine.
3. Add or update meaningful tests when behavior changes.
4. Update documentation when setup, configuration, language coverage, or user-visible behavior changes.
5. Describe the problem, the resulting behavior, and your validation in the pull request.

Use English for repository documentation and pull request descriptions. Interface text belongs in the locale dictionaries rather than hard-coded templates.

## Development conventions

- Keep TypeScript strict and use `unknown` when a value's type is not established.
- Keep camera, OCR, translation, and rendering responsibilities separate.
- Use the shared models for data crossing service and platform boundaries.
- Follow the existing structure of the area you are changing; avoid unrelated architecture rewrites.
- Preserve keyboard access, labels, focus handling, and readable contrast when changing the interface.
- Use the repository's EditorConfig and Prettier configuration. Format edited files without reformatting unrelated code.
- Keep provider credentials on the server. Use synthetic text in tests and examples.

## Verification

From the repository root:

```sh
npm ci
npm test -- --watch=false
npm run server:test
npm run build
```

For native changes, also run `npm run android:sync` and `:app:testDebugUnitTest :app:assembleDebug` using the Gradle wrapper in `android/`.

Automated tests cannot verify real camera behavior or provider translation quality. For camera changes, describe the device, Android version or browser, language pair, and what you observed. Cover live capture and freeze/resume when relevant. Label mocked provider results as simulated.

## Updating interface translations

The seven dictionaries are in [`public/i18n/`](public/i18n/). Keep their nested keys consistent and preserve interpolation placeholders such as `{{date}}`. Test longer labels and non-Latin scripts in the affected screens.

Recognition languages and translation destinations are separate lists in [`constants.ts`](src/app/shared/utils/constants/constants.ts). Adding a destination does not automatically add an OCR recognizer. Changes to script recognition may also require Kotlin and Gradle updates.

## Reporting a problem

Include steps to reproduce, expected and actual behavior, the app version, platform, source and target languages, and whether online translation was configured. For OCR problems, provide non-sensitive sample text and explain lighting or framing conditions that affect reproduction.

Never include API keys, client tokens, private documents, or unredacted environment files in issues, screenshots, or pull requests.

## Repository contents

Commit source files, tests, documentation, the npm lockfile, Android resources, and the Gradle wrapper. Keep dependencies, local SDK paths, caches, generated web assets, APKs, signing keys, and `.env` files out of commits.

The repository has no project license yet. Contributions do not establish a new license for the project; licensing decisions belong to the project owner.
