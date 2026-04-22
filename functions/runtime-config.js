"use strict";

exports.handler = async function handler() {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify({
      googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    }),
  };
};
