(function initRecurrence(root) {
  "use strict";

  const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

  function parseLocal(value) {
    const match = ISO_LOCAL.exec(value);
    if (!match) throw new TypeError(`Ungültiger ISO-Zeitpunkt: ${value}`);
    return match.slice(1, 7).map(Number);
  }

  function addDays(parts, days) {
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
    return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), ...parts.slice(3)];
  }

  function offsetAt(instant, timeZone) {
    const fields = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
      }).formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])
    );
    return Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second) - instant.getTime();
  }

  function zonedIso(parts, timeZone) {
    const wallClock = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
    let instant = new Date(wallClock);
    for (let i = 0; i < 3; i += 1) instant = new Date(wallClock - offsetAt(instant, timeZone));
    const offsetMinutes = Math.round(offsetAt(instant, timeZone) / 60000);
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absolute = Math.abs(offsetMinutes);
    const pad = (value) => String(value).padStart(2, "0");
    return `${parts[0]}-${pad(parts[1])}-${pad(parts[2])}T${pad(parts[3])}:${pad(parts[4])}:${pad(parts[5])}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
  }

  function parseUnavailableIntervalCutoff(body, timeZone) {
    try {
      const error = JSON.parse(body).errors?.find((item) => item.code === "unavailable_interval");
      const match = /(?:am|on)\s+(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/i.exec(error?.detail || "");
      if (!match) return null;
      return zonedIso([Number(match[3]), Number(match[2]), Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6] || 0)], timeZone);
    } catch {
      return null;
    }
  }

  function extractDefaultBookingTimes(data) {
    const rules = extractBookingTimeRules(data);
    return rules?.label === "Tagesbuchung" ? { startTime: rules.startTime, endTime: rules.endTime } : null;
  }

  function extractBookingTimeRules(data) {
    const configurations = Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : [];
    const configuration = configurations.find((item) => item?.attributes && typeof item.attributes.label === "string" && /^\d{2}:\d{2}/.test(item.attributes.default_start_time) && /^\d{2}:\d{2}/.test(item.attributes.default_end_time));
    const attributes = configuration?.attributes;
    if (!attributes) return null;
    const serviceId = attributes.services_with_quantity?.[0]?.service?.id;
    const service = data.included?.find((item) => item?.type === "services" && String(item.id) === String(serviceId));
    const integerOrNull = (value) => Number.isInteger(value) && value >= 0 ? value : null;
    return {
      label: attributes.label,
      serviceId: serviceId == null ? null : String(serviceId),
      startTime: attributes.default_start_time.slice(0, 5),
      endTime: attributes.default_end_time.slice(0, 5),
      minDuration: integerOrNull(attributes.min_duration),
      maxDuration: integerOrNull(attributes.max_duration),
      bookingInterval: integerOrNull(service?.attributes?.booking_interval ?? attributes.booking_interval),
      allowsCrossSchedule: attributes.allows_cross_schedule === true,
      allowEndOffSchedule: service?.attributes?.allow_end_off_schedule === true
    };
  }

  function extractAdvanceBookingCutoff(data, timeZone, now = new Date()) {
    const candidates = [];
    const isLimitKey = (path) => /(advance|ahead|future|voraus)/i.test(path) && /(book|reserv|period|window|range|limit)/i.test(path);
    const localDate = (instant) => {
      const fields = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
      return [fields.year, fields.month, fields.day];
    };
    const addCandidate = (value) => {
      if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3660) {
        const date = addDays([...localDate(now), 0, 0, 0], value);
        candidates.push(zonedIso([...date.slice(0, 3), 23, 59, 0], timeZone));
      } else if (typeof value === "string") {
        const local = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (local) candidates.push(zonedIso([Number(local[1]), Number(local[2]), Number(local[3]), 23, 59, 0], timeZone));
        else if (!Number.isNaN(new Date(value).getTime())) candidates.push(value);
      }
    };
    const visit = (value, path = "") => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        const childPath = `${path}.${key}`;
        if (isLimitKey(childPath)) addCandidate(child);
        visit(child, childPath);
      }
    };
    visit(data);
    return candidates.sort((left, right) => new Date(left) - new Date(right))[0] || null;
  }

  function buildOccurrences(template, options) {
    const horizon = Number(options.days);
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 365) throw new RangeError("Der Zeitraum muss zwischen 1 und 365 Tagen liegen.");
    if (!Array.isArray(options.weekdays) || options.weekdays.length === 0) throw new RangeError("Mindestens einen Wochentag auswählen.");
    const latestEnd = options.latestEnd ? new Date(options.latestEnd) : null;
    if (latestEnd && Number.isNaN(latestEnd.getTime())) throw new TypeError("Ungültiges Ende des Vorausbuchungszeitraums.");
    // The API values carry local wall-clock times. Recreate these rather than adding
    // 24-hour durations so reservations remain stable across daylight-saving changes.
    const originalStart = parseLocal(template.start_date);
    const originalEnd = parseLocal(template.end_date);
    const parseTime = (value, fallback) => {
      if (!value) return fallback.slice(3);
      const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
      if (!match) throw new TypeError("Uhrzeiten müssen das Format HH:MM verwenden.");
      const time = match.slice(1, 4).map((part) => Number(part || 0));
      if (time[0] > 23 || time[1] > 59 || time[2] > 59) throw new RangeError("Ungültige Uhrzeit.");
      return time;
    };
    const startTime = parseTime(options.startTime, originalStart);
    const endTime = parseTime(options.endTime, originalEnd);
    const startDay = Date.UTC(...[originalStart[0], originalStart[1] - 1, originalStart[2]]);
    const endDay = Date.UTC(...[originalEnd[0], originalEnd[1] - 1, originalEnd[2]]);
    const endDayDelta = Math.round((endDay - startDay) / 86400000);
    if (endDayDelta === 0 && (endTime[0] * 3600 + endTime[1] * 60 + endTime[2]) <= (startTime[0] * 3600 + startTime[1] * 60 + startTime[2])) {
      throw new RangeError("Die Endzeit muss nach der Startzeit liegen.");
    }
    const durationMinutes = endDayDelta * 1440 + (endTime[0] * 60 + endTime[1]) - (startTime[0] * 60 + startTime[1]);
    if (Number.isInteger(options.minDuration) && durationMinutes < options.minDuration) throw new RangeError(`Die Buchungsdauer muss mindestens ${options.minDuration} Minuten betragen.`);
    if (Number.isInteger(options.maxDuration) && durationMinutes > options.maxDuration) throw new RangeError(`Die Buchungsdauer darf höchstens ${options.maxDuration} Minuten betragen.`);
    const results = [];
    for (let day = 1; day <= horizon; day += 1) {
      const startDate = addDays(originalStart, day);
      const start = [...startDate.slice(0, 3), ...startTime];
      const weekday = new Date(Date.UTC(start[0], start[1] - 1, start[2])).getUTCDay();
      if (!options.weekdays.includes(weekday)) continue;
      const endDate = addDays(start, endDayDelta);
      const end = [...endDate.slice(0, 3), ...endTime];
      const occurrence = {
        resource_id: String(template.resource_id),
        service_id: String(template.service_id),
        start_date: zonedIso(start, options.timeZone),
        end_date: zonedIso(end, options.timeZone)
      };
      if (!latestEnd || new Date(occurrence.end_date) < latestEnd) results.push(occurrence);
    }
    return results;
  }

  const api = Object.freeze({ buildOccurrences, extractAdvanceBookingCutoff, extractBookingTimeRules, extractDefaultBookingTimes, parseLocal, parseUnavailableIntervalCutoff, zonedIso });
  root.AnnyRecurrence = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis === "undefined" ? window : globalThis);
