"use strict";

const { google } = require("googleapis");

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

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed." });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!accessToken) {
    return json(401, { error: "Missing Google access token." });
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth });
    const response = await calendar.calendarList.list();
    const calendars = (response.data.items || []).map((item) => ({
      id: item.id,
      summary: item.summary || item.id,
      primary: Boolean(item.primary),
      accessRole: item.accessRole || "",
    }));
    return json(200, { calendars });
  } catch (error) {
    const message =
      error && error.response && error.response.data && error.response.data.error
        ? error.response.data.error.message
        : error.message || "Google Calendar request failed.";
    return json(502, { error: message });
  }
};
