(function installAnnyBridge() {
  "use strict";
  if (window.__annySeriesBridgeInstalled) return;
  window.__annySeriesBridgeInstalled = true;

  const CHANNEL = "anny-series-reservation-v1";
  const ENDPOINT = "https://b.anny.eu/api/v1/bookings/instant";
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
    return nativeFetch(input, init);
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
