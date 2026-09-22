(function initPanel() {
  "use strict";
  if (globalThis.__annySeriesContentInstalled) return;
  globalThis.__annySeriesContentInstalled = true;
  const CHANNEL = "anny-series-reservation-v1";
  const weekdays = [[1, "Mo"], [2, "Di"], [3, "Mi"], [4, "Do"], [5, "Fr"], [6, "Sa"], [0, "So"]];
  let template = null;
  let running = false;
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
          <div class="as-template" role="status">Anmeldung wird automatisch erkannt. Lege danach eine normale Reservierung als Vorlage an.</div>
          <label>Zeitraum <span><input name="days" type="number" min="1" max="365" value="30"> Tage</span></label>
          <fieldset><legend>Wochentage</legend><div class="as-days">${weekdays.map(([value, label]) => `<label><input type="checkbox" value="${value}" ${value > 0 && value < 6 ? "checked" : ""}><span>${label}</span></label>`).join("")}</div></fieldset>
          <div class="as-times"><label>Von <input name="start-time" type="time" step="60" required disabled></label><label>Bis <input name="end-time" type="time" step="60" required disabled></label></div>
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
    root.querySelector(".as-close").addEventListener("click", () => toggle(false));
    root.querySelector(".as-submit").addEventListener("click", runBatch);
    root.addEventListener("change", updatePreview);
  }

  function occurrences() {
    const root = document.getElementById("anny-series-root");
    return AnnyRecurrence.buildOccurrences(template, {
      days: Number(root.querySelector('[name="days"]').value),
      weekdays: [...root.querySelectorAll('.as-days input:checked')].map((input) => Number(input.value)),
      timeZone: root.querySelector('[name="timezone"]').value.trim(),
      startTime: root.querySelector('[name="start-time"]').value,
      endTime: root.querySelector('[name="end-time"]').value
    });
  }

  function updatePreview() {
    const root = document.getElementById("anny-series-root");
    if (!root || !template) return;
    try {
      const count = occurrences().length;
      root.querySelector(".as-preview").textContent = `${count} zusätzliche Reservierung${count === 1 ? "" : "en"} geplant`;
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

  async function runBatch() {
    if (running) return;
    const items = occurrences();
    if (!window.confirm(`${items.length} verbindliche Reservierungen nacheinander anlegen?`)) return;
    running = true;
    updatePreview();
    const progress = document.querySelector("#anny-series-root .as-progress");
    let success = 0;
    const failures = [];
    for (let index = 0; index < items.length; index += 1) {
      progress.textContent = `Reserviere ${index + 1} von ${items.length} …`;
      const result = await createBooking(items[index]);
      if (result.ok) success += 1;
      else failures.push(`${items[index].start_date}: HTTP ${result.status || "Netzwerk"}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    running = false;
    progress.textContent = `${success} erfolgreich, ${failures.length} fehlgeschlagen.${failures.length ? ` ${failures.slice(0, 3).join("; ")}` : ""}`;
    updatePreview();
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== window || event.origin !== window.location.origin || message?.channel !== CHANNEL) return;
    if (message.type === "auth-ready") {
      mount();
      if (!template) document.querySelector("#anny-series-root .as-template").innerHTML = "<b>Anmeldung erkannt</b><span>Lege jetzt eine normale Reservierung als Vorlage an.</span>";
    } else if (message.type === "template") {
      template = message.payload;
      mount();
      const root = document.getElementById("anny-series-root");
      root.querySelector(".as-template").innerHTML = `<b>Vorlage erkannt</b><span>Ressource ${escapeHtml(template.resource_id)} · Service ${escapeHtml(template.service_id)}<br>${escapeHtml(template.start_date)} – ${escapeHtml(template.end_date)}</span>`;
      root.querySelector('[name="start-time"]').value = template.start_date.slice(11, 16);
      root.querySelector('[name="end-time"]').value = template.end_date.slice(11, 16);
      root.querySelector('[name="start-time"]').disabled = false;
      root.querySelector('[name="end-time"]').disabled = false;
      root.querySelector(".as-panel").hidden = false;
      root.querySelector(".as-trigger").setAttribute("aria-expanded", "true");
      updatePreview();
    } else if (message.type === "result" && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
})();
