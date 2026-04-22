# Schedule Extraction Instructions

Return JSON only. Do not include commentary, Markdown, code fences, or explanatory text.

Use the schema in `schedule.schema.json` exactly.

Rules:
- Build the schedule first as expanded JSON with human-readable keys:
  - top-level: `timezone`, `events`
  - event keys:
    - timed: `date`, `start`, `end`, `title`
    - all-day: `date`, `title`, `allDay: true`, optional `endDate`
- `timezone` must always be `Europe/Sofia`.
- `date` and optional `endDate` must be final absolute dates in `YYYY-MM-DD`.
- `start` and `end` must be `HH:MM` in 24-hour format.
- `title` must map to one of the allowed values from the schema enum and nothing else.
- Do not invent titles outside the enum.
- If a title cannot be mapped confidently to an enum value, omit that event.
- Then convert expanded JSON to compact JSON with keys `tz`, `ev` and canonical event shapes only:
  - timed event: `d`, `s`, `e`, `t`
  - all-day event: `d`, `t`, `ad: true`, optional `ed`
- All-day `ed` uses **exclusive end-date semantics** (same as Google Calendar all-day `end.date`).
  - Missing `ed` means single-day all-day.
  - Present `ed` means multi-day all-day span from `d` inclusive to `ed` exclusive.
- Explicitly forbid legacy/alternate keys in compact output (`date`, `start`, `end`, `allDay`, `endDate`, `day`, `title`, etc.).
- Explicitly forbid shape mixing in compact output:
  - no `ad: true` with `s`/`e`
  - no timed events with `ed`
- Output only this final JSON object with exactly these keys:
  - `expanded`: the expanded human-readable JSON object (copy/paste target for the web page editor).
  - `url`: final link in this exact format:
    `https://calendar-importer.netlify.app/import?payload64=<deflate-raw+base64url(compact-minified-json)>`
- Do not output `minified`, `payload`, or any extra fields.

Compact examples (canonical):
- timed: `{"d":"2026-04-27","s":"18:00","e":"19:00","t":"Балет"}`
- all-day single-day: `{"d":"2026-04-27","ad":true,"t":"СФП"}`
- all-day multi-day: `{"d":"2026-04-27","ed":"2026-04-30","ad":true,"t":"Танци"}`

Date rules:
- The screenshot is a 7-column week view ordered left to right.
- If at least one column date is readable, use it as the anchor day.
- Infer other column dates by adding or subtracting whole days from the anchor column based on column position.
- Use only dates in the current month or next month at the time of parsing.
- Never place events in the past relative to the current local date at import time.
- If interpreting a day number in the current month would place the event in the past, roll that event to the next month.
- Handle week boundaries across months naturally (for example, a week can span April 27 through May 3).
- If no column date is readable at all, return an empty `ev` array.

End-time rules:
- Events within the same day must be ordered by start time.
- For every event except the last event of the day, set `e` equal to the next event start time.
- For the last event of the day:
  - `Растяжки` ends 30 minutes after start.
  - `Балет` ends 2 hours after start.
  - every other allowed title ends 1 hour after start.

Contract compatibility note: keep this prompt, `schedule.schema.json`, `functions/_lib/schema.js`, and `web/import.html` aligned as one contract. Any format change must update all four together.
