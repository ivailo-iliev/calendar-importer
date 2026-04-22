"use strict";

const { google } = require("googleapis");
const { parsePayload, validatePayload, TIME_ZONE } = require("./_lib/schema");

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

function payloadEventKey(item) {
  return [item.d, item.s, item.e, item.t].join("|");
}

function formatDateInZone(dateTime) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateTime);
}

function formatTimeInZone(dateTime) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dateTime);
}

function calendarEventKey(event) {
  if (!event || typeof event.summary !== "string") {
    return null;
  }
  if (!event.start || !event.end || !event.start.dateTime || !event.end.dateTime) {
    return null;
  }
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return [
    formatDateInZone(start),
    formatTimeInZone(start),
    formatTimeInZone(end),
    event.summary,
  ].join("|");
}

async function loadExistingEventKeys(calendar, calendarId, events) {
  if (!events.length) {
    return new Set();
  }
  const dates = events.map((item) => item.d).sort();
  const timeMin = `${dates[0]}T00:00:00+03:00`;
  const timeMax = `${dates[dates.length - 1]}T23:59:59+03:00`;
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
      const key = calendarEventKey(event);
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
    const existingKeys = await loadExistingEventKeys(calendar, calendarId, normalized.ev);

    const results = [];
    for (const item of normalized.ev) {
      const key = payloadEventKey(item);
      if (existingKeys.has(key)) {
        results.push({
          d: item.d,
          s: item.s,
          e: item.e,
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
          start: {
            dateTime: `${item.d}T${item.s}:00`,
            timeZone: TIME_ZONE,
          },
          end: {
            dateTime: `${item.d}T${item.e}:00`,
            timeZone: TIME_ZONE,
          },
        },
      });

      results.push({
        d: item.d,
        s: item.s,
        e: item.e,
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
