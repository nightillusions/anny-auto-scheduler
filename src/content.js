(function initPanel() {
  "use strict";
  const CHANNEL = "anny-series-reservation-v1";
  const weekdays = [[1, "Mo"], [2, "Di"], [3, "Mi"], [4, "Do"], [5, "Fr"], [6, "Sa"], [0, "So"]];
  let template = null;
  let selectedResource = null;
  let bookingTimeRules = null;
  let running = false;
  let advanceBookingCutoff = null;
  let pendingAdvanceBookingValues = [];
  const serviceConfigurations = [];
  const pending = new Map();

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function mount() {
    if (!document.body || document.getElementById("anny-series-root")) return;
    const root = document.createElement("div");
    root.id = "anny-series-root";
    root.innerHTML = `<button class="as-trigger" type="button" aria-expanded="false" aria-controls="anny-series-panel">Serie</button>
      <aside id="anny-series-panel" class="as-panel" aria-label="Serienreservierung" hidden>
        <header><div><strong>Serienreservierung</strong><small>Nur für diese Anny-Seite</small></div><button class="as-close" type="button" aria-label="Schließen">×</button></header>
        <div class="as-body">
          <div class="as-template" role="status">Lege zuerst eine normale Reservierung an. Deren Ressource und Optionen werden automatisch als Vorlage übernommen.</div>
          <label>Zeitraum <span><input name="days" type="number" min="1" max="365" value="30"> Tage</span></label>
          <fieldset><legend>Wochentage</legend><div class="as-days">${weekdays.map(([value, label]) => `<label><input type="checkbox" value="${value}" ${value > 0 && value < 6 ? "checked" : ""}><span>${label}</span></label>`).join("")}</div></fieldset>
          <div class="as-times"><label>Von <input name="start-time" type="time" step="60" required></label><label>Bis <input name="end-time" type="time" step="60" required></label></div>
          <div class="as-time-rules" hidden></div>
          <label>Zeitzone <input name="timezone" type="text" value="${escapeHtml(Intl.DateTimeFormat().resolvedOptions().timeZone)}" required></label>
          <div class="as-preview"></div>
          <button class="as-submit" type="button" disabled>Reservierungen prüfen</button>
          <p class="as-note">Vor dem Start wird die genaue Anzahl bestätigt. Bereits bestehende oder abgelehnte Termine werden nicht automatisch überschrieben.</p>
          <div class="as-progress" aria-live="polite"></div>
        </div>
      </aside>`;
    document.body.append(root);
    const trigger = root.querySelector(".as-trigger");
    const panel = root.querySelector(".as-panel");
    const toggle = (open) => { panel.hidden = !open; trigger.setAttribute("aria-expanded", String(open)); };
    trigger.addEventListener("click", () => toggle(panel.hidden));
    root.addEventListener("pointerdown", (event) => event.stopPropagation());
    root.addEventListener("click", (event) => event.stopPropagation());
    root.querySelector(".as-close").addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      toggle(false);
    });
    root.querySelector(".as-submit").addEventListener("click", runBatch);
    root.addEventListener("change", updatePreview);
  }

  function showResourceSelection(selection) {
    mount();
    const root = document.getElementById("anny-series-root");
    if (!root) return;
    const selectionChanged = !template || String(template.resource_id) !== String(selection.resource_id) || String(template.service_id) !== String(selection.service_id);
    if (selectionChanged) {
      template = null;
      root.querySelector(".as-submit").disabled = true;
    }
    selectedResource = selection;
    bookingTimeRules = null;
    const service = selection.service_id ? ` · Service ${escapeHtml(selection.service_id)}` : "";
    root.querySelector(".as-template").innerHTML = `<b>Ressource ausgewählt</b><span>Ressource ${escapeHtml(selection.resource_id)}${service}<br>Lege eine normale Reservierung an, um Zeitraum und Optionen als Vorlage zu übernehmen.</span>`;
    root.querySelector(".as-panel").hidden = false;
    root.querySelector(".as-trigger").setAttribute("aria-expanded", "true");
    applyCurrentServiceConfiguration(true);
  }

  function applyCurrentServiceConfiguration(applyDefaults) {
    const root = document.getElementById("anny-series-root");
    if (!root || !selectedResource) return;
    const selectedResourceId = String(selectedResource.resource_id);
    const selectedResourceIdIsNumeric = /^\d+$/.test(selectedResourceId);
    const configuration = [...serviceConfigurations].reverse().find((item) =>
      (!item.serviceId || item.serviceId === String(selectedResource.service_id)) &&
      (!item.resourceId || item.resourceId === selectedResourceId || !selectedResourceIdIsNumeric)
    );
    if (!configuration) return;
    const rules = AnnyRecurrence.extractBookingTimeRules(configuration.response);
    if (!rules || (configuration.serviceId && rules.serviceId && configuration.serviceId !== rules.serviceId)) return;
    bookingTimeRules = rules;
    if (applyDefaults) {
      root.querySelector('[name="start-time"]').value = rules.startTime;
      root.querySelector('[name="end-time"]').value = rules.endTime;
    }
    const formatDuration = (minutes) => minutes % 60 === 0 ? `${minutes / 60} Std.` : `${minutes} Min.`;
    const duration = rules.hasFlexibleDuration && rules.minDuration != null && rules.maxDuration != null ? `Dauer: ${formatDuration(rules.minDuration)} bis ${formatDuration(rules.maxDuration)}` : "";
    const interval = rules.bookingInterval ? `Start im ${rules.bookingInterval}-Minuten-Intervall` : "";
    const schedule = !rules.allowsCrossSchedule || !rules.allowEndOffSchedule ? "Ressourcenzeitplan wird von Anny geprüft" : "";
    const note = root.querySelector(".as-time-rules");
    note.textContent = [rules.label, duration, interval, schedule].filter(Boolean).join(" · ");
    note.hidden = false;
  }

  function occurrences() {
    const root = document.getElementById("anny-series-root");
    return AnnyRecurrence.buildOccurrences(template, {
      days: Number(root.querySelector('[name="days"]').value),
      weekdays: [...root.querySelectorAll('.as-days input:checked')].map((input) => Number(input.value)),
      timeZone: root.querySelector('[name="timezone"]').value.trim(),
      startTime: root.querySelector('[name="start-time"]').value,
      endTime: root.querySelector('[name="end-time"]').value,
      latestEnd: advanceBookingCutoff,
      minDuration: bookingTimeRules?.minDuration,
      maxDuration: bookingTimeRules?.maxDuration,
      enforceDurationLimits: bookingTimeRules?.hasFlexibleDuration
    });
  }

  function updatePreview() {
    const root = document.getElementById("anny-series-root");
    if (!root || !template) return;
    try {
      const count = occurrences().length;
      const cutoffNote = advanceBookingCutoff ? ` bis vor ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: root.querySelector('[name="timezone"]').value.trim() }).format(new Date(advanceBookingCutoff))}` : "";
      root.querySelector(".as-preview").textContent = `${count} zusätzliche Reservierung${count === 1 ? "" : "en"} geplant${cutoffNote}`;
      root.querySelector(".as-submit").disabled = running || count === 0;
    } catch (error) {
      root.querySelector(".as-preview").textContent = error.message;
      root.querySelector(".as-submit").disabled = true;
    }
  }

  function createBooking(payload) {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timeout = setTimeout(() => { pending.delete(id); resolve({ ok: false, status: 0, error: "Zeitüberschreitung" }); }, 30000);
      pending.set(id, (result) => { clearTimeout(timeout); resolve(result); });
      window.postMessage({ channel: CHANNEL, type: "create", id, payload }, window.location.origin);
    });
  }

  function applyAdvanceBookingLimits(values) {
    const root = document.getElementById("anny-series-root");
    if (!root) return false;
    const timeZone = root.querySelector('[name="timezone"]').value.trim();
    const cutoff = AnnyRecurrence.extractAdvanceBookingCutoff({ booking_in_advance: values }, timeZone);
    if (cutoff && (!advanceBookingCutoff || new Date(cutoff) < new Date(advanceBookingCutoff))) advanceBookingCutoff = cutoff;
    return true;
  }

  async function runBatch() {
    if (running) return;
    const items = occurrences();
    if (!window.confirm(`${items.length} verbindliche Reservierungen nacheinander anlegen?`)) return;
    running = true;
    updatePreview();
    const progress = document.querySelector("#anny-series-root .as-progress");
    let success = 0;
    let skipped = 0;
    const failures = [];
    for (let index = 0; index < items.length; index += 1) {
      if (advanceBookingCutoff && new Date(items[index].end_date) >= new Date(advanceBookingCutoff)) {
        skipped += 1;
        continue;
      }
      progress.textContent = `Reserviere ${index + 1} von ${items.length} …`;
      const result = await createBooking(items[index]);
      if (result.ok) success += 1;
      else {
        failures.push(`${items[index].start_date}: HTTP ${result.status || "Netzwerk"}`);
        const cutoff = AnnyRecurrence.parseUnavailableIntervalCutoff(result.error, document.querySelector('#anny-series-root [name="timezone"]').value.trim());
        if (cutoff) advanceBookingCutoff = cutoff;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    running = false;
    progress.textContent = `${success} erfolgreich, ${failures.length} fehlgeschlagen, ${skipped} wegen Vorausbuchungslimit übersprungen.${failures.length ? ` ${failures.slice(0, 3).join("; ")}` : ""}`;
    updatePreview();
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== window || event.origin !== window.location.origin || message?.channel !== CHANNEL) return;
    if (message.type === "template") {
      template = message.payload;
      selectedResource = { resource_id: template.resource_id, service_id: template.service_id };
      mount();
      const root = document.getElementById("anny-series-root");
      root.querySelector(".as-template").innerHTML = `<b>Vorlage erkannt</b><span>Ressource ${escapeHtml(template.resource_id)} · Service ${escapeHtml(template.service_id)}<br>${escapeHtml(template.start_date)} – ${escapeHtml(template.end_date)}</span>`;
      root.querySelector('[name="start-time"]').value = template.start_date.slice(11, 16);
      root.querySelector('[name="end-time"]').value = template.end_date.slice(11, 16);
      applyCurrentServiceConfiguration(false);
      root.querySelector(".as-panel").hidden = false;
      root.querySelector(".as-trigger").setAttribute("aria-expanded", "true");
      if (pendingAdvanceBookingValues.length) {
        applyAdvanceBookingLimits(pendingAdvanceBookingValues);
        pendingAdvanceBookingValues = [];
      }
      updatePreview();
    } else if (message.type === "resource-selected" && message.payload?.resource_id) {
      showResourceSelection(message.payload);
    } else if (message.type === "service-configuration" && message.payload?.response) {
      serviceConfigurations.push(message.payload);
      applyCurrentServiceConfiguration(!template);
      updatePreview();
    } else if (message.type === "advance-booking-limits" && Array.isArray(message.values)) {
      if (!applyAdvanceBookingLimits(message.values)) pendingAdvanceBookingValues = pendingAdvanceBookingValues.concat(message.values);
      else updatePreview();
    } else if (message.type === "result" && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  window.postMessage({ channel: CHANNEL, type: "ready" }, window.location.origin);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
})();
