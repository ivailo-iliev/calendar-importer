# Practice Calendar Import

A small Netlify app for importing compact schedule JSON into Google Calendar.

It includes:
- A browser UI at `/import` for Google sign-in and payload submission.
- Netlify Functions for runtime config, calendar discovery, and event creation.
- Payload validation for schema shape, event limits, and event time consistency.

## Project Structure

- `web/import.html` — Single-page UI for auth, JSON editing, calendar selection, and event creation.
- `web/index.html` — Redirects to `/import`.
- `functions/runtime-config.js` — Returns runtime config (`GOOGLE_CLIENT_ID`).
- `functions/list-calendars.js` — Lists Google calendars available to the signed-in user.
- `functions/create-events.js` — Validates payload and inserts events into Google Calendar, skipping duplicates.
- `functions/_lib/schema.js` — Validation and normalization rules for schedule payloads.
- `chatgpt-project/schedule.schema.json` — Schema used when generating schedule JSON.
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

## Running Locally

Use Netlify Dev so static files and functions run together:

```bash
netlify dev
```

Then open:

- `http://localhost:8888/import`

## Payload Format

The backend expects a compact JSON object with:

- `tz`: optional IANA timezone string (defaults to `Europe/Sofia`)
- `ev`: array of events (max 35)

Timed event shape:

- `d`: date in `YYYY-MM-DD`
- `s`: start time in `HH:MM` (24-hour)
- `e`: end time in `HH:MM` (24-hour)
- `t`: title string (minimum 2 characters)

All-day event shape:

- `d`: date in `YYYY-MM-DD`
- `ad`: `true`
- `t`: title string (minimum 2 characters)

Additional validation rules are enforced in `functions/_lib/schema.js`:

- No unexpected top-level or event fields.
- Maximum of 35 events.
- No duplicate events with identical normalized keys.
- Timed events must satisfy `start < end`.
- All-day events must not include `s` or `e`.

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
- Inserts non-duplicate events and returns per-event results.

## Deployment

This repo is configured for Netlify:

- Static publish directory: `web`
- Functions directory: `netlify/functions` (as set in `netlify.toml`)

> Note: if you deploy this exact repository, ensure your function source layout matches your build setup. If your functions are in `functions/`, either move/copy them to `netlify/functions` or update `netlify.toml` accordingly.

## Usage Flow


> Note: `payload64` must be encoded as `deflate-raw+base64url`; plain `deflate` is not accepted by the current decoder implementation.
1. Open `/import`.
2. Sign in with Google.
3. Select a target calendar.
4. Paste payload JSON (or pass it via `?payload64=...` URL query encoded as `deflate-raw+base64url`).
5. Click **Create Events**.
6. Review created vs skipped events in status output.

## Security Notes

- Access tokens are provided by Google Identity Services in-browser.
- Functions require Bearer tokens and forward requests to Google Calendar API.
- Do not commit secrets (OAuth client secrets, API keys, or tokens) to the repo.
