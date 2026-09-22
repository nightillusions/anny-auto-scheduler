import { readFile } from "node:fs/promises";

const files = ["src/background.js", "src/bridge-main.js", "src/content.js", "src/recurrence.js"];

for (const file of files) {
  const source = await readFile(file, "utf8");
  try {
    // Function construction compiles classic-script syntax without executing the
    // browser-only IIFEs. This also works when Bun handles `node` package scripts.
    Function(source);
    console.log(`✓ ${file}`);
  } catch (error) {
    console.error(`Syntax error in ${file}:`);
    throw error;
  }
}
