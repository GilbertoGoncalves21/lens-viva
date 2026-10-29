# Contextual translation server

This optional Node.js service translates recognized camera text using Gemini. The app groups related OCR lines and sends the complete text with scene context to `POST /translate`. The provider is instructed to translate meaning, repair only unambiguous OCR errors, and mark ambiguous input as uncertain.

**The service is not enabled by default.** Supply your own provider credentials, run or host the server, and configure its URL in the app. No provider key or public translation endpoint is bundled with the APK. Automated tests use simulated responses; they do not verify live Gemini translation quality.

## Local setup

Use the repository's Node.js version from [`.nvmrc`](../.nvmrc). Run commands from the repository root.

Copy the example configuration on macOS / Linux:

```sh
cp server/.env.example server/.env
```

Or in Windows PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

Fill in `GEMINI_API_KEY` and choose `GEMINI_MODEL` in `server/.env`. Generate a separate client token:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set the generated value as `CLIENT_TOKEN`, then start the service:

```sh
npm run server:start
```

In the app, open **Settings → Online translation → Configure server**. For a browser on the same computer, enter `http://127.0.0.1:8787/translate` and your `CLIENT_TOKEN`.

`CLIENT_TOKEN` controls access to your server. `GEMINI_API_KEY` authenticates your server with Gemini and stays exclusively in the server environment. Never enter the Gemini API key into the app's token field.

## Environment variables

| Variable          | Purpose                                     | Default or requirement                                          |
| ----------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `GEMINI_API_KEY`  | Gemini provider credential                  | Required; server only                                           |
| `GEMINI_MODEL`    | Model identifier used by the adapter        | Required; verify the example value for your account             |
| `CLIENT_TOKEN`    | Separate bearer token accepted from the app | Required; at least 24 characters                                |
| `HOST`            | Listening interface                         | `127.0.0.1`                                                     |
| `PORT`            | Listening port                              | `8787`                                                          |
| `ALLOWED_ORIGINS` | Comma-separated browser origins             | `https://localhost,http://localhost:4200,http://127.0.0.1:4200` |

Use [`.env.example`](.env.example) as a template. Local `.env` files are ignored by Git. The server uses Node.js built-in modules and `fetch`; there is no separate server package to install.

`npm run server:start` reads `server/.env`. On a host that injects environment variables directly, use `node server/index.mjs` instead.

## Using the server from a phone

Deploy the service behind an HTTPS endpoint reachable from the device. Configure the app with the full endpoint, for example `https://translate.example.com/translate`, and the separate client token.

- `localhost` on a phone refers to the phone, not the development computer.
- The default listener is loopback only. Set `HOST` to the interface required by your host, such as `0.0.0.0` inside a container, and terminate TLS at your hosting proxy.
- Add the actual web app origins to `ALLOWED_ORIGINS`. The default `https://localhost` entry supports the configured Capacitor Android origin.
- CORS controls browser origins; bearer authentication is still required for translation requests.
- Request and concurrency limits apply per process and are held in memory. Multiple instances need shared traffic controls if you require a global quota.
- The shared client token supports a privately configured client. It is stored in app preferences and is not a substitute for per-user authentication in a public multi-user service.

No hosting deployment or public access configuration is performed by this repository.

## Translation behavior and data

With the server configured and the device reporting a connection, the app skips local translation model checks. Camera images stay on the device; recognized text and scene context are sent to this service and then to Gemini.

Without connectivity, Android uses ML Kit translation and needs the corresponding offline models. If a configured server fails, the app reports online translation as unavailable rather than automatically retrying through the offline translator.

The adapter requests structured JSON and accepts only complete responses with valid fields. `uncertain: true` tells the app to ask for clearer input rather than display the returned text as a confirmed translation. Model output can still be wrong; the flag does not guarantee detection of every error.

Provider access, quotas, data handling, and hosting costs depend on the accounts you configure.

## HTTP contract

### Request

```http
POST /translate
Content-Type: application/json
Authorization: Bearer <CLIENT_TOKEN>
```

```json
{
    "text": "Everything happens for a reason.",
    "context": "Everything happens for a reason.",
    "sourceLanguage": "en",
    "targetLanguage": "es"
}
```

All four fields are required. `context` may be an empty string; the app normally includes scene text. Language fields accept a two- or three-letter code with an optional region subtag. Validation checks the format; actual language support depends on the provider.

### Successful response

The following is an illustrative Spanish translation, not a captured live-provider result:

```json
{
    "translatedText": "Todo sucede por una razón.",
    "uncertain": false
}
```

An ambiguous reading may return:

```json
{
    "translatedText": "",
    "uncertain": true
}
```

### Errors

| Status | Error                            | Meaning                                             |
| ------ | -------------------------------- | --------------------------------------------------- |
| `400`  | `INVALID_JSON` / `INVALID_INPUT` | Invalid JSON or request fields                      |
| `401`  | `UNAUTHORIZED`                   | Missing or incorrect client token                   |
| `403`  | `ORIGIN_DENIED`                  | Browser origin is not allowed                       |
| `404`  | `NOT_FOUND`                      | Unsupported route or method                         |
| `413`  | `BODY_TOO_LARGE`                 | Request body exceeds the limit                      |
| `415`  | `JSON_REQUIRED`                  | JSON content type is required                       |
| `429`  | `RATE_LIMITED`                   | Request or concurrency limit reached                |
| `502`  | `TRANSLATION_UNAVAILABLE`        | Provider request failed or its response was invalid |

Error responses use the shape `{ "error": "ERROR_CODE" }`. An allowed CORS preflight request receives `204`.

## Limits

- Text and context: up to **4,000 characters each**.
- Request body: up to **32 KiB**.
- Translation requests: **30 per minute** and **two concurrent requests** per process.
- Provider timeout: **15 seconds**; the app's HTTP timeout is **20 seconds**.
- Responses use `Cache-Control: no-store`.

The service does not log request text, authorization headers, or upstream response bodies. Hosting proxies and provider services have their own logging and retention settings.

## Tests

```sh
npm run server:test
```

Tests cover the HTTP contract, authentication, allowed origins, invalid input, request limits, and the Gemini adapter with simulated responses. No API key or paid provider call is required.

Run the application suite with `npm test -- --watch=false` to cover online routing, context-sensitive caching, and skipping local model checks.

## Provider references

- [Gemini generateContent API](https://ai.google.dev/api/generate-content)
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Model catalog](https://ai.google.dev/gemini-api/docs/models)
- [ML Kit on-device translation](https://developers.google.com/ml-kit/language/translation/android)

See the [architecture overview](../docs/ARCHITECTURE.md) for the app pipeline and the [development guide](../docs/DEVELOPMENT.md) for the repository workflow.
