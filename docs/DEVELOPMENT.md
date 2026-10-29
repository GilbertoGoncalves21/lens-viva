# Development guide

Run commands from the repository root unless a section explicitly changes directories. The Android project and optional translation server share the root npm toolchain; the server has no separate dependency installation.

## Toolchain

- Use the Node.js version in [`.nvmrc`](../.nvmrc). The package's `engines` field follows the installed Angular toolchain's supported Node.js ranges.
- The package manager is `npm@11.16.0`. Commit `package-lock.json` when dependencies or root package metadata change.
- Android requires JDK 21, SDK Platform 36, SDK Build-Tools, and Android SDK Platform-Tools. Install them through Android Studio's SDK Manager.
- Use the checked-in Gradle wrapper rather than a global Gradle installation.

If your version manager supports `.nvmrc`, select that version before installing dependencies:

```sh
nvm use
npm ci
```

On Windows, install or select the version listed in `.nvmrc` using your Node.js version manager. Verify with `node --version` and `npm --version`.

## Web development

```sh
npm start
```

The development server is available at `http://localhost:4200`. Camera access requires permission and a secure context: use localhost on the development computer or HTTPS when accessing a hosted build.

```sh
npm run build
```

Production output is written to `dist/lens-viva/browser/`. Configure the web host to return `index.html` for application routes. Deploying the web app does not deploy the translation server.

The browser engine is useful for UI development and camera testing, but local translation depends on the browser's Translator API and supported language pairs. Use the optional online service when a compatible local translator is unavailable.

## Verification

```sh
npm test -- --watch=false
npm run server:test
npm run build
```

Application tests use Angular's Vitest integration. Server tests use Node.js's built-in test runner and a simulated provider. They need no `.env` file or provider account and make no live Gemini calls.

The [CI workflow](../.github/workflows/ci.yml) runs those three checks after `npm ci` on pushes, pull requests, and manual dispatch. It uses the official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) actions. Native tests and device verification are separate from this workflow.

## Android development

Set `JAVA_HOME` to a JDK 21 installation. Android Studio's bundled `jbr` can be used when it provides Java 21. Set the local Android SDK location through Android Studio or an ignored `android/local.properties` file.

Build and synchronize the web assets after changes:

```sh
npm run android:sync
npm run android:open
```

`android:sync` runs the production web build and copies its output into the native project. Do not edit or commit the copied web assets under `android/app/src/main/assets/public/`.

For native unit tests and a debug APK:

```sh
cd android
```

macOS / Linux:

```sh
bash ./gradlew :app:testDebugUnitTest :app:assembleDebug
```

Windows PowerShell:

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Native JUnit reports are generated under `android/app/build/reports/tests/testDebugUnitTest/`.

To build and launch through Capacitor from the repository root, connect an authorized device or start an emulator, then run:

```sh
npm run android:run
```

### Windows paths containing accented characters

On the original development machine, Gradle workers encountered Java argument-file encoding and Unix-domain socket temporary-path problems. If you encounter the same errors, use this workaround from `android/`, adjusting `JAVA_HOME` to your JDK 21 location:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$lensBuildTemp = Join-Path $env:PUBLIC 'lens-viva-build-tmp'
New-Item -ItemType Directory -Force -Path $lensBuildTemp | Out-Null
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$lensBuildTemp -Dfile.encoding=COMPAT"
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon '-Dorg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=COMPAT'
```

These environment changes apply to the current PowerShell session. Keep machine-specific paths out of committed configuration.

## Optional online server

Use the [server guide](../server/README.md). Local browser development accepts a loopback HTTP endpoint; a physical phone requires reachable HTTPS. The Gemini API key remains on the server, and the app receives only the server URL and a separate client token.

The repository contains an example environment file, not an active provider configuration. Running tests or building the APK does not enable online translation.

## Version and release preparation

Keep the application version aligned in:

- `package.json` and the root metadata in `package-lock.json`;
- `src/environments/environment.ts` and `src/environments/environment.development.ts`;
- `versionName` in `android/app/build.gradle`.

Increment Android's `versionCode` for a new distributed Android build. `engineVersion` identifies translation-processing/cache behavior and should change when cached results become incompatible; it is separate from the application version.

Before distributing a build, run the relevant automated checks and verify camera access, live recognition, freeze/resume, language switching, and overlays on a real device. Check both offline models and online server behavior when the release changes translation.

Release signing and automated store publication are not configured. Configure signing outside committed files before producing a distributable release. Keep signing material and credentials private. Attach APKs or app bundles to a release or distribute them through your delivery channel instead of committing them to the source repository.

## Preparing the first remote push

The project already has a local Git repository. From its root, inspect the files that will be published:

```sh
git status --short
git status --short --ignored
git add --dry-run .
```

The ignore rules exclude dependencies, build outputs, delivery artifacts, environment files, local SDK configuration, and signing keys. The example environment file and Gradle wrapper should remain included. Avoid `git add -f` for ignored local files.

After reviewing the source, choose the remote repository and commit the intended files. Configure that repository's remote URL before pushing. Repository visibility, branch protection, a project license, signing, and hosting are decisions for the project owner; no remote address or license is assumed by this setup.
