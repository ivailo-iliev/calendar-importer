"use strict";

const { google } = require("googleapis");
const { eventDedupeKey, parsePayload, validatePayload } = require("./_lib/schema");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function resolveCalendarId(event) {
  const query = event.queryStringParameters || {};
  const value = typeof query.calendarId === "string" ? query.calendarId.trim() : "";
  return value || "primary";
}

function calendarEventGroup(event) {
  const description = typeof event.description === "string" ? event.description : "";
  return description.startsWith("Group: ") ? description.slice(7).trim() : "";
}

function formatDateInZone(dateTime, timeZone) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateTime);
}

function formatTimeInZone(dateTime, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dateTime);
}

function calendarEventKey(event, timeZone) {
  if (!event || typeof event.summary !== "string") {
    return null;
  }
  const normalizedSummary = event.summary.trim();
  if (!normalizedSummary) {
    return null;
  }
  if (!event.start || !event.end) {
    return null;
  }
  if (event.start.date && event.end.date) {
    return eventDedupeKey({
      d: event.start.date,
      ed: event.end.date || event.start.date,
      ad: true,
      t: normalizedSummary,
      g: calendarEventGroup(event),
    });
  }
  if (!event.start.dateTime || !event.end.dateTime) {
    return null;
  }
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return eventDedupeKey({
    d: formatDateInZone(start, timeZone),
    s: formatTimeInZone(start, timeZone),
    e: formatTimeInZone(end, timeZone),
    t: normalizedSummary,
    g: calendarEventGroup(event),
  });
}

function nextDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function loadExistingEventKeys(calendar, calendarId, events, timeZone) {
  if (!events.length) {
    return new Set();
  }
  const rangeStarts = events.map((item) => item.d);
  const rangeEndsExclusive = events.map((item) => (item.ad ? item.ed || nextDate(item.d) : nextDate(item.d)));
  const timeMin = `${rangeStarts.sort()[0]}T00:00:00Z`;
  const timeMax = `${rangeEndsExclusive.sort().slice(-1)[0]}T00:00:00Z`;
  const keys = new Set();
  let pageToken = undefined;

  do {
    const response = await calendar.events.list({
      calendarId,
      singleEvents: true,
      showDeleted: false,
      timeMin,
      timeMax,
      maxResults: 2500,
      pageToken,
    });
    for (const event of response.data.items || []) {
      const key = calendarEventKey(event, timeZone);
      if (key) {
        keys.add(key);
      }
    }
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return keys;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!accessToken) {
    return json(401, { error: "Missing Google access token." });
  }

  let payload;
  try {
    payload = parsePayload(event.body || "");
  } catch (error) {
    return json(400, { error: error.message });
  }

  const { errors, normalized } = validatePayload(payload);
  if (errors.length) {
    return json(400, { error: "Payload validation failed.", details: errors });
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = resolveCalendarId(event);
    const existingKeys = await loadExistingEventKeys(calendar, calendarId, normalized.ev, normalized.tz);

    const results = [];
    for (const item of normalized.ev) {
      const key = eventDedupeKey(item);
      if (existingKeys.has(key)) {
        results.push({
          d: item.d,
          ...(item.ad ? { ad: true, ...(item.ed ? { ed: item.ed } : {}) } : { s: item.s, e: item.e }),
          t: item.t,
          skipped: true,
          reason: "duplicate",
        });
        continue;
      }

      const response = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: item.t,
          ...(item.g ? { description: `Group: ${item.g}` } : {}),
          start: item.ad
            ? { date: item.d }
            : {
                dateTime: `${item.d}T${item.s}:00`,
                timeZone: normalized.tz,
              },
          end: item.ad
            ? { date: item.ed || nextDate(item.d) }
            : {
                dateTime: `${item.d}T${item.e}:00`,
                timeZone: normalized.tz,
              },
        },
      });

      results.push({
        d: item.d,
        ...(item.ad ? { ad: true, ...(item.ed ? { ed: item.ed } : {}) } : { s: item.s, e: item.e }),
        t: item.t,
        id: response.data.id || null,
        htmlLink: response.data.htmlLink || null,
        status: response.data.status || "confirmed",
      });
      existingKeys.add(key);
    }

    return json(200, {
      calendarId,
      created: results.filter((item) => !item.skipped).length,
      skipped: results.filter((item) => item.skipped).length,
      results,
    });
  } catch (error) {
    const message =
      error && error.response && error.response.data && error.response.data.error
        ? error.response.data.error.message
        : error.message || "Google Calendar request failed.";
    return json(502, { error: message });
  }
};
