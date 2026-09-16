import { mkdir, rm, cp, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/anny-series-reservation", { recursive: true });
for (const path of ["manifest.json", "src", "README.md", "PRIVACY.md"]) await cp(path, `dist/anny-series-reservation/${path}`, { recursive: true });
execFileSync("zip", ["-qr", "anny-series-reservation.zip", "anny-series-reservation"], { cwd: "dist" });
await writeFile("dist/README.txt", "In Edge unter edge://extensions als entpackte Erweiterung den Ordner anny-series-reservation laden.\n");
