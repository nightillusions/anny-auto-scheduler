import { mkdir, rm, cp, writeFile } from "node:fs/promises";
import { createZip } from "./zip.mjs";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/anny-series-reservation", { recursive: true });
for (const path of ["manifest.json", "src", "README.md", "PRIVACY.md"]) await cp(path, `dist/anny-series-reservation/${path}`, { recursive: true });
await createZip("dist/anny-series-reservation", "dist/anny-series-reservation.zip");
await writeFile("dist/README.txt", "In Edge unter edge://extensions als entpackte Erweiterung den Ordner anny-series-reservation laden.\n");
