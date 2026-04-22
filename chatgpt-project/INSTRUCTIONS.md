# Schedule Extraction Instructions

Return JSON only. Do not include commentary, Markdown, code fences, or explanatory text.

Use the schema in `schedule.schema.json` exactly.

Rules:
- Output a single JSON object with `tz` and `ev`.
- `tz` must always be `Europe/Sofia`.
- `ev` must contain only final events.
- Each event object must use only `d`, `s`, `e`, `t`.
- `d` must be a final absolute date in `YYYY-MM-DD`.
- `s` and `e` must be `HH:MM` in 24-hour format.
- `t` must be one of the enum values from the schema and nothing else.
- Do not invent titles outside the enum.
- If a title cannot be mapped confidently to an enum value, omit that event.

Date rules:
- The screenshot is a 7-column week view ordered left to right.
- If at least one column date is readable, use it as the anchor day.
- Infer other column dates by adding or subtracting whole days from the anchor column based on column position.
- Use the current local month and year at the time of parsing.
- If a parsed day number is invalid for the current month, clamp it to day 28.
- If no column date is readable at all, return an empty `ev` array.

End-time rules:
- Events within the same day must be ordered by start time.
- For every event except the last event of the day, set `e` equal to the next event start time.
- For the last event of the day:
  - `Растяжки` ends 30 minutes after start.
  - `Балет` ends 2 hours after start.
  - every other allowed title ends 1 hour after start.
