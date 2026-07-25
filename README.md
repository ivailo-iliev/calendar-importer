# Practice Calendar Import

A small Netlify app for importing schedule JSON into Google Calendar.

It includes:
- A browser UI at `/import` for Google sign-in, expanded JSON editing, and payload submission.
- Netlify Functions for runtime config, calendar discovery, and event creation.
- Payload validation for schema shape, event limits, and event time/all-day consistency.

## Project Structure

- `web/import.html` — Single-page UI for auth, JSON editing, calendar selection, and event creation.
- `web/index.html` — Redirects to `/import`.
- `functions/runtime-config.js` — Returns runtime config (`GOOGLE_CLIENT_ID`).
- `functions/list-calendars.js` — Lists Google calendars available to the signed-in user.
- `functions/create-events.js` — Validates payload and inserts events into Google Calendar, skipping duplicates.
- `functions/_lib/schema.js` — Validation and normalization rules for schedule payloads.
- `chatgpt-project/schedule.expanded.schema.json` — Expanded schema for the editor-facing JSON returned by ChatGPT.
- `chatgpt-project/schedule.compact.schema.json` — Compact schema for the encoded `payload64` URL contract.
- `chatgpt-project/INSTRUCTIONS.md` — Prompting rules for schedule extraction.

## Prerequisites

- Node.js 18+ (recommended for Netlify Functions compatibility).
- A Google Cloud OAuth Client ID for Google Identity Services.
- Netlify CLI (optional for local development):

```bash
npm install -g netlify-cli
```

## Installation

```bash
npm install
```

## Configuration

Set the Google client ID as an environment variable:

```bash
export GOOGLE_CLIENT_ID="your-google-oauth-client-id"
```

For Netlify, set `GOOGLE_CLIENT_ID` in your site environment variables.

## Public Repository Notes

- This repository is intended to be safe to clone publicly.
- Keep secrets out of Git. In particular, do not commit `.env` files, OAuth secrets, refresh tokens, or captured access tokens.
- `GOOGLE_CLIENT_ID` is required at runtime, but it should be configured in Netlify or your local shell, not committed to the repository.

## Running Locally

Use Netlify Dev so static files and functions run together:

```bash
netlify dev
```

Then open:

- `http://localhost:8888/import`

## Payload Formats

The import UI accepts an expanded JSON shape in the editor and converts it to the compact backend contract before submission.

The ChatGPT-facing schemas intentionally allow free-form titles. The preferred schedule-title dictionary and any exclusions such as non-event labels are defined in `chatgpt-project/INSTRUCTIONS.md`, not enforced in the JSON Schema files.

Expanded JSON shape accepted by the UI:

```json
{
  "timezone": "Europe/Sofia",
  "events": [
    {
      "date": "2026-04-27",
      "start": "18:00",
      "end": "19:00",
      "title": "Балет",
      "group": "2"
    },
    {
      "date": "2026-04-28",
      "allDay": true,
      "title": "СФП"
    }
  ]
}
```

The backend expects a compact JSON object with:

- `tz`: required and must equal `Europe/Sofia`
- `ev`: array of events (max 35)

Exactly two canonical event types are accepted:

1. Timed event (required: `d`, `s`, `e`, `t`)
   - `d`: date in `YYYY-MM-DD`
   - `s`: start time in `HH:MM` (24-hour)
   - `e`: end time in `HH:MM` (24-hour), and `s < e`
   - `t`: title string (minimum 2 characters)
   - `g` (optional): group number or label as a non-empty string

2. All-day event (required: `d`, `t`, `ad: true`; optional: `ed`)
   - `d`: start date in `YYYY-MM-DD` (inclusive)
   - `ad`: must be `true`
   - `t`: title string (minimum 2 characters)
   - `g` (optional): group number or label as a non-empty string
   - `ed` (optional): exclusive end date in `YYYY-MM-DD`
     - missing `ed` => single-day all-day event
     - present `ed` => multi-day all-day span, and `ed` must be after `d`

Field-mixing is invalid:
- all-day events cannot include `s` or `e`
- timed events cannot include `ed` or `ad`

Additional validation rules are enforced in `functions/_lib/schema.js`:
- No unexpected top-level or event fields.
- Maximum of 35 events.
- No duplicate events with deterministic keys:
  - timed: `d|s|e|t`
  - all-day: `d|ed-or-d|all-day|t`

## Contract Reference Samples (Drift Checks)

The following compact payload samples are canonical and copy-paste valid:

```json
{
  "tz": "Europe/Sofia",
  "ev": [
    { "d": "2026-04-27", "s": "18:00", "e": "19:00", "t": "Балет", "g": "2" },
    { "d": "2026-04-28", "ad": true, "t": "СФП" },
    { "d": "2026-04-29", "ed": "2026-05-02", "ad": true, "t": "Танци" }
  ]
}
```

## Change Together Rule

To prevent schema drift, any contract update must modify these files in the **same commit**:

- `chatgpt-project/schedule.expanded.schema.json`
- `chatgpt-project/schedule.compact.schema.json`
- `chatgpt-project/INSTRUCTIONS.md`
- `functions/_lib/schema.js`
- `web/import.html`

## API Endpoints

All functions are served under `/.netlify/functions`.

### `GET /runtime-config`
Returns:

```json
{ "googleClientId": "..." }
```

### `GET /list-calendars`
Requires header:

- `Authorization: Bearer <google_access_token>`

Returns calendar list for the signed-in account.

### `POST /create-events`
Requires:

- `Authorization: Bearer <google_access_token>`
- JSON body matching the payload rules above

Optional query parameter:

- `calendarId` (defaults to `primary`)

Behavior:

- Loads existing events in the payload date range.
- Skips duplicates already present.
- Inserts non-duplicate events and returns per-event results. Events with `g` receive a Google Calendar description in the form `Group: <group>`.

## Deployment

This repo is configured for Netlify:

- Static publish directory: `web`
- Functions directory: `functions`

## Usage Flow

> Note: `payload64` must be encoded as `deflate-raw+base64url`; plain `deflate` is not accepted by the current decoder implementation.
1. Open `/import`.
2. Sign in with Google.
3. Select a target calendar.
4. Paste expanded payload JSON into the editor, or pass compact JSON via `?payload64=...` encoded as `deflate-raw+base64url`.
5. Click **Create Events**.
6. Review created vs skipped events in status output.

## Security Notes

- Access tokens are provided by Google Identity Services in-browser.
- Functions require Bearer tokens and forward requests to Google Calendar API.
- Do not commit secrets (OAuth client secrets, API keys, or tokens) to the repo.
