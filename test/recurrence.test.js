const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOccurrences } = require("../src/recurrence.js");

test("filters weekdays and keeps resource options", () => {
  const result = buildOccurrences({ resource_id: "110091", service_id: "307", start_date: "2026-09-26T06:00:00+02:00", end_date: "2026-09-26T13:00:00+02:00" }, { days: 7, weekdays: [1], timeZone: "Europe/Berlin" });
  assert.deepEqual(result, [{ resource_id: "110091", service_id: "307", start_date: "2026-09-28T06:00:00+02:00", end_date: "2026-09-28T13:00:00+02:00" }]);
});

test("adjusts offset across daylight-saving transition", () => {
  const result = buildOccurrences({ resource_id: "1", service_id: "2", start_date: "2026-10-24T09:00:00+02:00", end_date: "2026-10-24T10:00:00+02:00" }, { days: 2, weekdays: [0, 1], timeZone: "Europe/Berlin" });
  assert.equal(result[0].start_date, "2026-10-25T09:00:00+01:00");
  assert.equal(result[1].start_date, "2026-10-26T09:00:00+01:00");
});

test("rejects unsafe horizons", () => {
  assert.throws(() => buildOccurrences({ start_date: "2026-01-01T10:00:00Z", end_date: "2026-01-01T11:00:00Z" }, { days: 366, weekdays: [1], timeZone: "UTC" }), /365/);
});

test("allows explicitly selected times", () => {
  const [result] = buildOccurrences({ resource_id: "1", service_id: "2", start_date: "2026-09-26T06:00:00+02:00", end_date: "2026-09-26T13:00:00+02:00" }, { days: 1, weekdays: [0], timeZone: "Europe/Berlin", startTime: "08:30", endTime: "11:45" });
  assert.equal(result.start_date, "2026-09-27T08:30:00+02:00");
  assert.equal(result.end_date, "2026-09-27T11:45:00+02:00");
});

test("rejects an end before start for same-day bookings", () => {
  assert.throws(() => buildOccurrences({ resource_id: "1", service_id: "2", start_date: "2026-09-26T06:00:00+02:00", end_date: "2026-09-26T13:00:00+02:00" }, { days: 1, weekdays: [0], timeZone: "UTC", startTime: "12:00", endTime: "11:00" }), /Endzeit/);
});
