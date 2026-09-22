"use strict";

const PLANNER_PREFIX = "https://anny.eu/planner";
const PLANNER_MATCH = "https://anny.eu/planner*";
const injecting = new Map();

function isPlanner(url = "") {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://anny.eu" && parsed.pathname.startsWith("/planner");
  } catch {
    return false;
  }
}

async function inject(tabId, url) {
  if (!Number.isInteger(tabId) || !isPlanner(url) || injecting.has(tabId)) return;
  const task = (async () => {
    try {
      // Static content scripts remain the fast document_start path. This fallback
      // also covers already-open tabs, restored sessions, and SPA navigations.
      await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files: ["src/bridge-main.js"] });
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["src/content.css"] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["src/recurrence.js", "src/content.js"] });
    } catch (error) {
      // Restricted pages, a closing tab, or a navigation race are expected. A
      // subsequent committed/completed event retries without surfacing noise.
      console.debug("Anny Serienreservierung konnte noch nicht injiziert werden", error);
    } finally {
      injecting.delete(tabId);
    }
  })();
  injecting.set(tabId, task);
  await task;
}

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) void inject(details.tabId, details.url);
}, { url: [{ hostEquals: "anny.eu", pathPrefix: "/planner", schemes: ["https"] }] });

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) void inject(details.tabId, details.url);
}, { url: [{ hostEquals: "anny.eu", pathPrefix: "/planner", schemes: ["https"] }] });

chrome.action.onClicked.addListener((tab) => {
  void inject(tab.id, tab.url);
});

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: [PLANNER_MATCH, `${PLANNER_PREFIX}/*`] });
  await Promise.all(tabs.map((tab) => inject(tab.id, tab.url)));
});
