(function installAnnyBridge() {
  "use strict";
  if (window.__annySeriesBridgeInstalled) return;
  window.__annySeriesBridgeInstalled = true;

  const CHANNEL = "anny-series-reservation-v1";
  const ENDPOINT = "https://b.anny.eu/api/v1/bookings/instant";
  const LOCATIONS_ENDPOINT = "https://b.anny.eu/api/v1/resources/locations";
  const SERVICE_CONFIGURATION_ENDPOINT = "https://b.anny.eu/api/v1/service-configuration";
  const RESOURCE_CHILDREN_PATTERN = /^https:\/\/b\.anny\.eu\/api\/v1\/resources\/([^/?]+)\/children(?:[/?]|$)/;
  let credentials = null;

  function headerValue(headers, name) {
    try { return new Headers(headers || {}).get(name); } catch { return null; }
  }

  function inspect(url, init) {
    if (!String(url).startsWith(ENDPOINT) || init?.method?.toUpperCase() !== "POST") return;
    const authorization = headerValue(init.headers, "authorization");
    const appKey = headerValue(init.headers, "x-app-key") || "anny_shop";
    if (authorization) credentials = { authorization, appKey };
    try {
      const payload = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      if (payload?.resource_id && payload?.service_id && payload?.start_date && payload?.end_date) {
        window.postMessage({ channel: CHANNEL, type: "template", payload }, window.location.origin);
      }
    } catch { /* Ignore request bodies that are not JSON. */ }
  }

  function inspectResourceSelection(url, init) {
    const match = RESOURCE_CHILDREN_PATTERN.exec(String(url));
    if (!match || (init?.method && init.method.toUpperCase() !== "GET")) return;
    const authorization = headerValue(init?.headers, "authorization");
    const appKey = headerValue(init?.headers, "x-app-key") || "anny_shop";
    if (authorization) credentials = { authorization, appKey };
    try {
      const requestUrl = new URL(url, window.location.origin);
      const serviceId = requestUrl.searchParams.get("filter[availability_service_id]");
      window.postMessage({
        channel: CHANNEL,
        type: "resource-selected",
        payload: {
          resource_id: decodeURIComponent(match[1]),
          service_id: serviceId,
          available_from: requestUrl.searchParams.get("filter[available_from]"),
          available_to: requestUrl.searchParams.get("filter[available_to]")
        }
      }, window.location.origin);
    } catch { /* Ignore malformed resource-selection requests. */ }
  }

  function inspectLocations(url, body) {
    if (!String(url).startsWith(LOCATIONS_ENDPOINT)) return;
    try {
      const values = [];
      const isLimitKey = (path) => /(advance|ahead|future|voraus)/i.test(path) && /(book|reserv|period|window|range|limit)/i.test(path);
      const visit = (value, path = "") => {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          const childPath = `${path}.${key}`;
          if (isLimitKey(childPath) && (typeof child === "string" || typeof child === "number")) values.push(child);
          visit(child, childPath);
        }
      };
      visit(JSON.parse(body));
      if (values.length) window.postMessage({ channel: CHANNEL, type: "advance-booking-limits", values }, window.location.origin);
    } catch { /* Ignore unavailable or changed locations responses. */ }
  }

  function inspectServiceConfiguration(url, body) {
    if (!String(url).startsWith(SERVICE_CONFIGURATION_ENDPOINT)) return;
    try {
      const configurations = [];
      const visit = (value) => {
        if (!value || typeof value !== "object") return;
        const attributes = value.attributes && typeof value.attributes === "object" ? value.attributes : value;
        if (attributes.label === "Tagesbuchung" && typeof attributes.default_start_time === "string" && typeof attributes.default_end_time === "string") {
          configurations.push({ startTime: attributes.default_start_time.slice(0, 5), endTime: attributes.default_end_time.slice(0, 5) });
        }
        for (const child of Object.values(value)) visit(child);
      };
      visit(JSON.parse(body));
      if (configurations[0]) window.postMessage({ channel: CHANNEL, type: "default-booking-times", payload: configurations[0] }, window.location.origin);
    } catch { /* Ignore unavailable or changed service-configuration responses. */ }
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function monitoredFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    const merged = input instanceof Request ? { method: input.method, headers: input.headers, ...init } : init;
    if (input instanceof Request && init.body === undefined) {
      // Request bodies are streams. Read a clone without delaying or consuming the
      // request Anny sends, otherwise clients using fetch(new Request(...)) are missed.
      input.clone().text().then((body) => inspect(url, { ...merged, body })).catch(() => inspect(url, merged));
    } else {
      inspect(url, merged);
    }
    inspectResourceSelection(url, merged);
    const response = nativeFetch(input, init);
    if (String(url).startsWith(LOCATIONS_ENDPOINT)) response.then((result) => result.clone().text().then((body) => inspectLocations(url, body)).catch(() => {})).catch(() => {});
    if (String(url).startsWith(SERVICE_CONFIGURATION_ENDPOINT)) response.then((result) => result.clone().text().then((body) => inspectServiceConfiguration(url, body)).catch(() => {})).catch(() => {});
    return response;
  };

  // Anny may switch its HTTP client implementation without changing the API.
  // Observe XMLHttpRequest as well as fetch so the extension remains transport-agnostic.
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function monitoredOpen(method, url, ...rest) {
    this.__annySeriesRequest = { method, url, headers: {} };
    return nativeOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.setRequestHeader = function monitoredHeader(name, value) {
    if (this.__annySeriesRequest) this.__annySeriesRequest.headers[name] = value;
    return nativeSetHeader.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function monitoredSend(body) {
    if (this.__annySeriesRequest) inspect(this.__annySeriesRequest.url, { ...this.__annySeriesRequest, body });
    if (this.__annySeriesRequest) inspectResourceSelection(this.__annySeriesRequest.url, this.__annySeriesRequest);
    if (this.__annySeriesRequest && String(this.__annySeriesRequest.url).startsWith(LOCATIONS_ENDPOINT)) {
      this.addEventListener("loadend", () => inspectLocations(this.__annySeriesRequest.url, this.responseText), { once: true });
    }
    if (this.__annySeriesRequest && String(this.__annySeriesRequest.url).startsWith(SERVICE_CONFIGURATION_ENDPOINT)) {
      this.addEventListener("loadend", () => inspectServiceConfiguration(this.__annySeriesRequest.url, this.responseText), { once: true });
    }
    return nativeSend.call(this, body);
  };

  window.addEventListener("message", async (event) => {
    const message = event.data;
    if (event.source !== window || event.origin !== window.location.origin || message?.channel !== CHANNEL || message.type !== "create") return;
    if (!credentials) {
      window.postMessage({ channel: CHANNEL, type: "result", id: message.id, ok: false, status: 401, error: "Keine aktive Anny-Anmeldung erkannt." }, window.location.origin);
      return;
    }
    try {
      const response = await nativeFetch(ENDPOINT, {
        method: "POST",
        headers: {
          accept: "application/vnd.api+json",
          "content-type": "application/vnd.api+json",
          authorization: credentials.authorization,
          "x-app-key": credentials.appKey
        },
        body: JSON.stringify(message.payload)
      });
      const body = await response.text();
      window.postMessage({ channel: CHANNEL, type: "result", id: message.id, ok: response.ok, status: response.status, error: response.ok ? "" : body.slice(0, 500) }, window.location.origin);
    } catch (error) {
      window.postMessage({ channel: CHANNEL, type: "result", id: message.id, ok: false, status: 0, error: error instanceof Error ? error.message : "Netzwerkfehler" }, window.location.origin);
    }
  });
})();
