"use strict";

const TIME_ZONE = "Europe/Sofia";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function parsePayload(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Request body must be a non-empty JSON string.");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("Payload is not valid JSON.");
  }
  return parsed;
}

function parseDateParts(value) {
  if (!DATE_RE.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function parseTimeMinutes(value) {
  if (!TIME_RE.test(value)) {
    return null;
  }
  const [hour, minute] = value.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function validatePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { errors: ["Payload must be a JSON object."], normalized: null };
  }
  const keys = Object.keys(payload);
  const allowedKeys = new Set(["tz", "ev"]);
  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      errors.push(`Unexpected top-level field: ${key}`);
    }
  }

  if (!Object.prototype.hasOwnProperty.call(payload, "tz")) {
    errors.push("tz is required.");
  }
  const normalizedTimeZone = typeof payload.tz === "string" ? payload.tz.trim() : "";
  if (normalizedTimeZone !== TIME_ZONE) {
    errors.push(`tz must equal ${TIME_ZONE}.`);
  }

  if (!Array.isArray(payload.ev)) {
    errors.push("ev must be an array.");
    return { errors, normalized: null };
  }
  if (payload.ev.length > 35) {
    errors.push("ev may contain at most 35 events.");
  }

  const normalized = [];
  const seenPayloadKeys = new Set();
  payload.ev.forEach((event, index) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      errors.push(`ev[${index}] must be an object.`);
      return;
    }

    const eventKeys = Object.keys(event);
    const allowedEventKeys = new Set(["d", "s", "e", "t"]);
    for (const key of eventKeys) {
      if (!allowedEventKeys.has(key)) {
        errors.push(`ev[${index}] has unexpected field: ${key}`);
      }
    }

    const { d, s, e, t } = event;
    if (typeof d !== "string" || !parseDateParts(d)) {
      errors.push(`ev[${index}].d must be a valid ISO date.`);
    }

    const startMinutes = typeof s === "string" ? parseTimeMinutes(s) : null;
    const endMinutes = typeof e === "string" ? parseTimeMinutes(e) : null;
    if (startMinutes === null) {
      errors.push(`ev[${index}].s must be a valid HH:MM time.`);
    }
    if (endMinutes === null) {
      errors.push(`ev[${index}].e must be a valid HH:MM time.`);
    }
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      errors.push(`ev[${index}] must end after it starts.`);
    }

    if (typeof t !== "string" || t.trim().length < 2) {
      errors.push(`ev[${index}].t must be a string with at least 2 characters.`);
    }

    const normalizedTitle = typeof t === "string" ? t.trim() : t;
    const dedupeKey = [d, s, e, normalizedTitle].join("|");
    if (d && s && e && normalizedTitle) {
      if (seenPayloadKeys.has(dedupeKey)) {
        errors.push(`ev[${index}] duplicates another event in the payload.`);
      } else {
        seenPayloadKeys.add(dedupeKey);
      }
    }

    normalized.push({ d, s, e, t: normalizedTitle });
  });

  return {
    errors,
    normalized: errors.length
      ? null
      : {
          tz: TIME_ZONE,
          ev: normalized,
        },
  };
}

module.exports = {
  TIME_ZONE,
  parsePayload,
  validatePayload,
};
