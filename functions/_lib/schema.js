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

function compareIsoDates(a, b) {
  return a.localeCompare(b);
}

function eventDedupeKey(event) {
  const group = typeof event.g === "string" ? event.g.trim() : "";
  if (event.ad) {
    return [event.d, event.ed || event.d, "all-day", event.t, group].join("|");
  }
  return [event.d, event.s, event.e, event.t, group].join("|");
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
    const hasAllDay = event.ad === true;

    if (hasAllDay) {
      const allowedEventKeys = new Set(["d", "ed", "ad", "t", "g"]);
      for (const key of eventKeys) {
        if (!allowedEventKeys.has(key)) {
          errors.push(`ev[${index}] has unexpected field for all-day event: ${key}`);
        }
      }

      const d = typeof event.d === "string" ? event.d.trim() : "";
      const ed = typeof event.ed === "string" ? event.ed.trim() : undefined;
      const t = typeof event.t === "string" ? event.t.trim() : "";
      const g = typeof event.g === "string" ? event.g.trim() : "";

      if (!d || !parseDateParts(d)) {
        errors.push(`ev[${index}].d must be a valid ISO date.`);
      }
      if (Object.prototype.hasOwnProperty.call(event, "ed")) {
        if (!ed || !parseDateParts(ed)) {
          errors.push(`ev[${index}].ed must be a valid ISO date when provided.`);
        } else if (d && parseDateParts(d) && compareIsoDates(ed, d) <= 0) {
          errors.push(`ev[${index}].ed must be after d for all-day exclusive spans.`);
        }
      }

      if (Object.prototype.hasOwnProperty.call(event, "s") || Object.prototype.hasOwnProperty.call(event, "e")) {
        errors.push(`ev[${index}] all-day event cannot include s or e.`);
      }

      if (typeof event.t !== "string" || t.length < 2) {
        errors.push(`ev[${index}].t must be a string with at least 2 characters.`);
      }
      if (Object.prototype.hasOwnProperty.call(event, "g") && !g) {
        errors.push(`ev[${index}].g must be a non-empty string when provided.`);
      }

      const dedupeKey = eventDedupeKey({ d, ed, ad: true, t, g });
      if (d && t) {
        if (seenPayloadKeys.has(dedupeKey)) {
          errors.push(`ev[${index}] duplicates another event in the payload.`);
        } else {
          seenPayloadKeys.add(dedupeKey);
        }
      }

      normalized.push({ d, ...(ed ? { ed } : {}), ad: true, t, ...(g ? { g } : {}) });
      return;
    }

    const allowedEventKeys = new Set(["d", "s", "e", "t", "g"]);
    for (const key of eventKeys) {
      if (!allowedEventKeys.has(key)) {
        errors.push(`ev[${index}] has unexpected field for timed event: ${key}`);
      }
    }

    const d = typeof event.d === "string" ? event.d.trim() : "";
    const s = typeof event.s === "string" ? event.s.trim() : "";
    const e = typeof event.e === "string" ? event.e.trim() : "";
    const t = typeof event.t === "string" ? event.t.trim() : "";
    const g = typeof event.g === "string" ? event.g.trim() : "";

    if (!d || !parseDateParts(d)) {
      errors.push(`ev[${index}].d must be a valid ISO date.`);
    }

    const startMinutes = parseTimeMinutes(s);
    const endMinutes = parseTimeMinutes(e);
    if (startMinutes === null) {
      errors.push(`ev[${index}].s must be a valid HH:MM time.`);
    }
    if (endMinutes === null) {
      errors.push(`ev[${index}].e must be a valid HH:MM time.`);
    }
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      errors.push(`ev[${index}] must end after it starts.`);
    }

    if (typeof event.t !== "string" || t.length < 2) {
      errors.push(`ev[${index}].t must be a string with at least 2 characters.`);
    }
    if (Object.prototype.hasOwnProperty.call(event, "g") && !g) {
      errors.push(`ev[${index}].g must be a non-empty string when provided.`);
    }

    const dedupeKey = eventDedupeKey({ d, s, e, t, g });
    if (d && s && e && t) {
      if (seenPayloadKeys.has(dedupeKey)) {
        errors.push(`ev[${index}] duplicates another event in the payload.`);
      } else {
        seenPayloadKeys.add(dedupeKey);
      }
    }

    normalized.push({ d, s, e, t, ...(g ? { g } : {}) });
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
  eventDedupeKey,
  parsePayload,
  validatePayload,
};
