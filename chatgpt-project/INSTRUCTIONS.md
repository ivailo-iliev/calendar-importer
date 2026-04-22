# Schedule Extraction Instructions

Return JSON only. Do not include commentary, Markdown, code fences, or explanatory text.

Use the schema in `schedule.schema.json` exactly.

Rules:
- Build the schedule first as expanded JSON with human-readable keys:
  - top-level: `timezone`, `events`
  - event keys: `date`, `start`, `end`, `title`
- `timezone` must always be `Europe/Sofia`.
- `date` must be a final absolute date in `YYYY-MM-DD`.
- `start` and `end` must be `HH:MM` in 24-hour format.
- `title` must map to one of the allowed values from the schema enum and nothing else.
- Do not invent titles outside the enum.
- If a title cannot be mapped confidently to an enum value, omit that event.
- Then convert the expanded JSON to compact JSON with keys `tz`, `ev`, and event keys `d`, `s`, `e`, `t` only for URL generation.
- Output only this final JSON object with exactly these keys:
  - `expanded`: the expanded human-readable JSON object (copy/paste target for the web page editor).
  - `url`: final link in this exact format:
    `https://calendar-importer.netlify.app/import?payload64=<deflate-raw+base64url(compact-minified-json)>`
- Do not output `minified`, `payload`, or any extra fields.

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
