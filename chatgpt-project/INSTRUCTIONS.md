# Schedule Extraction Instructions

Use these two schemas exactly:
- `schedule.expanded.schema.json` for the JSON that appears in the answer.
- `schedule.compact.schema.json` for the compact payload that is encoded into the URL.

Output format:
- First output exactly one Markdown `json` code block containing only the expanded JSON object.
- After the code block, output exactly one plain URL on its own line in this format:
  `https://calendar-importer.netlify.app/import?payload64=<deflate-raw+base64url(compact-minified-json)>`
- Do not output commentary, headings, labels, bullets, or explanatory text.
- Do not output the compact JSON directly unless it is inside the encoded `payload64` URL.

Expanded JSON rules:
- Top-level keys must be exactly `timezone` and `events`.
- Event keys:
  - timed: `date`, `start`, `end`, `title`, optional `group`
  - all-day: `date`, `title`, `allDay: true`, optional `endDate`, optional `group`
- `timezone` must always be `Europe/Sofia`.
- `date` and optional `endDate` must be final absolute dates in `YYYY-MM-DD`.
- `start` and `end` must be `HH:MM` in 24-hour format.
- Use this default title dictionary when mapping visible schedule entries:
  - `СФП`
  - `НО под`
  - `ОФП`
  - `Танци`
  - `Денкова`
  - `Балет`
  - `Растяжки`
- If the user explicitly requests a specific title in their text message, you may use that exact title even if it is not in the default dictionary.
- If an event is marked with a group number or label, copy it exactly into the optional string field `group`.
- When two groups train with the same coach at the same time, emit one event rather than two and combine the group numbers in the `group` field with a comma and no spaces (for example, `"group": "1,2"`). This produces the calendar tag `Group:1,2`.
- If a visible label is clearly a non-event marker, omit it. Example: `Почивен ден`.
- If a visible label is neither a clear event nor a user-requested custom title, omit that item.

Compact payload rules:
- Convert the expanded JSON to compact JSON with keys `tz`, `ev` and canonical event shapes only:
  - timed event: `d`, `s`, `e`, `t`, optional `g`
  - all-day event: `d`, `t`, `ad: true`, optional `ed`, optional `g`
- All-day `ed` uses exclusive end-date semantics.
  - Missing `ed` means single-day all-day.
  - Present `ed` means multi-day all-day span from `d` inclusive to `ed` exclusive.
- Copy expanded `group` to compact `g` as a string.
- Use only canonical compact keys and shapes:
  - no `ad: true` with `s` or `e`
  - no timed events with `ed`

Canonical compact examples:
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
- Handle week boundaries across months naturally, for example a week can span April 27 through May 3.
- If no column date is readable at all, return an empty events array in the expanded JSON, and encode the matching empty compact payload in the URL.

End-time rules:
- Events within the same day must be ordered by start time.
- For every event except the last event of the day, set `end` in expanded JSON and `e` in compact JSON equal to the next event start time.
- For the last event of the day:
  - `Растяжки` ends 30 minutes after start.
  - `Балет` ends 2 hours after start.
  - every other allowed title ends 1 hour after start.
