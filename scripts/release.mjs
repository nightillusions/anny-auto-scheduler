import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const [changeType, subject, ...files] = process.argv.slice(2);
const validTypes = new Set(["fix", "feat", "breaking"]);

if (!validTypes.has(changeType) || !subject || files.length === 0) {
  throw new Error('Usage: node scripts/release.mjs <fix|feat|breaking> "subject" <related-files...>');
}

function nextVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Unsupported version: ${version}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (changeType === "breaking") return `${major + 1}.0.0`;
  if (changeType === "feat") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

async function updateVersion(file, version) {
  const json = JSON.parse(await readFile(file, "utf8"));
  json.version = version;
  await writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const version = nextVersion(packageJson.version);
await Promise.all([updateVersion("package.json", version), updateVersion("manifest.json", version)]);
execFileSync(process.execPath, ["scripts/package.mjs"], { stdio: "inherit" });

execFileSync("git", ["add", "--", ...files, "package.json", "manifest.json"], { stdio: "inherit" });
const prefix = changeType === "breaking" ? "feat!" : changeType;
execFileSync("git", ["commit", "-m", `${prefix}: ${subject}`], { stdio: "inherit" });