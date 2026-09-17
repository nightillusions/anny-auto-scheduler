const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOccurrences, extractAdvanceBookingCutoff, parseUnavailableIntervalCutoff } = require("../src/recurrence.js");

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

test("excludes reservations ending at or after the advance-booking cutoff", () => {
  const result = buildOccurrences({ resource_id: "1", service_id: "2", start_date: "2026-09-29T10:00:00+02:00", end_date: "2026-09-29T12:00:00+02:00" }, {
    days: 3,
    weekdays: [3, 4, 5],
    timeZone: "Europe/Berlin",
    latestEnd: "2026-10-01T12:00:00+02:00"
  });
  assert.deepEqual(result.map((occurrence) => occurrence.start_date), ["2026-09-30T10:00:00+02:00"]);
});

test("extracts Anny's advance-booking cutoff from unavailable_interval errors", () => {
  const body = JSON.stringify({ errors: [{ status: "400", code: "unavailable_interval", detail: "Die Buchung muss vor dem Vorausbuchungszeitraum am 01.10.2026 23:59 enden." }] });
  assert.equal(parseUnavailableIntervalCutoff(body, "Europe/Berlin"), "2026-10-01T23:59:00+02:00");
});

test("extracts an advance-booking period from locations responses", () => {
  const response = { data: [{ attributes: { booking_in_advance_days: 14 } }] };
  const now = new Date("2026-09-17T10:00:00+02:00");
  assert.equal(extractAdvanceBookingCutoff(response, "Europe/Berlin", now), "2026-10-01T23:59:00+02:00");
});
