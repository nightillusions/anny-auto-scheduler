const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const vm = require("node:vm");

test("injects the extension into planner tabs that are already open at installation", async () => {
  const listeners = {};
  const calls = [];
  const chrome = {
    action: { onClicked: { addListener: (listener) => { listeners.clicked = listener; } } },
    runtime: { onInstalled: { addListener: (listener) => { listeners.installed = listener; } } },
    tabs: { query: async () => [{ id: 42, url: "https://anny.eu/planner" }] },
    webNavigation: {
      onCommitted: { addListener: (listener) => { listeners.committed = listener; } },
      onHistoryStateUpdated: { addListener: (listener) => { listeners.history = listener; } }
    },
    scripting: {
      executeScript: async (options) => { calls.push(["script", options]); },
      insertCSS: async (options) => { calls.push(["css", options]); }
    }
  };
  const source = await readFile("src/background.js", "utf8");
  vm.runInNewContext(source, { chrome, console, URL });

  await listeners.installed();

  assert.deepEqual(calls.map(([type]) => type), ["script", "css", "script"]);
  assert.equal(calls[0][1].world, "MAIN");
  assert.deepEqual(Array.from(calls[2][1].files), ["src/recurrence.js", "src/content.js"]);
});

test("ignores action clicks outside the Anny planner", async () => {
  const listeners = {};
  let injected = false;
  const chrome = {
    action: { onClicked: { addListener: (listener) => { listeners.clicked = listener; } } },
    runtime: { onInstalled: { addListener() {} } },
    tabs: { query: async () => [] },
    webNavigation: {
      onCommitted: { addListener() {} },
      onHistoryStateUpdated: { addListener() {} }
    },
    scripting: {
      executeScript: async () => { injected = true; },
      insertCSS: async () => { injected = true; }
    }
  };
  const source = await readFile("src/background.js", "utf8");
  vm.runInNewContext(source, { chrome, console, URL });

  listeners.clicked({ id: 7, url: "https://example.com/" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(injected, false);
});
