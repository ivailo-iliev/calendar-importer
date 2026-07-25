"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePayload } = require("../functions/_lib/schema");

const baseEvent = { d: "2026-07-25", s: "10:50", e: "11:40", t: "Балет" };

test("allows otherwise identical events assigned to different groups", () => {
  const result = validatePayload({
    tz: "Europe/Sofia",
    ev: [{ ...baseEvent, g: "2" }, { ...baseEvent, g: "3" }],
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.normalized.ev.length, 2);
});

test("rejects identical events assigned to the same group", () => {
  const result = validatePayload({
    tz: "Europe/Sofia",
    ev: [{ ...baseEvent, g: "2" }, { ...baseEvent, g: "2" }],
  });

  assert.deepEqual(result.errors, ["ev[1] duplicates another event in the payload."]);
  assert.equal(result.normalized, null);
});

test("continues to de-duplicate identical ungrouped all-day events", () => {
  const event = { d: "2026-07-25", ad: true, t: "Балет" };
  const result = validatePayload({ tz: "Europe/Sofia", ev: [event, { ...event }] });

  assert.deepEqual(result.errors, ["ev[1] duplicates another event in the payload."]);
});
