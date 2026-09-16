import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  const result = Buffer.alloc(2);
  result.writeUInt16LE(value);
  return result;
}

function uint32(value) {
  const result = Buffer.alloc(4);
  result.writeUInt32LE(value >>> 0);
  return result;
}

function dosTimestamp(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

async function collect(directory, archiveRoot) {
  const entries = [];
  for (const name of (await readdir(directory)).sort()) {
    const diskPath = path.join(directory, name);
    const info = await stat(diskPath);
    const archivePath = `${archiveRoot}/${name}`.replaceAll(path.sep, "/");
    if (info.isDirectory()) entries.push(...await collect(diskPath, archivePath));
    else entries.push({ archivePath, data: await readFile(diskPath), modified: info.mtime });
  }
  return entries;
}

export async function createZip(sourceDirectory, destination, archiveRoot = path.basename(sourceDirectory)) {
  const entries = await collect(sourceDirectory, archiveRoot);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.archivePath, "utf8");
    const checksum = crc32(entry.data);
    const timestamp = dosTimestamp(entry.modified);
    const common = [uint16(0x0800), uint16(0), uint16(timestamp.time), uint16(timestamp.date), uint32(checksum), uint32(entry.data.length), uint32(entry.data.length), uint16(name.length), uint16(0)];
    const local = Buffer.concat([uint32(0x04034b50), uint16(20), ...common, name, entry.data]);
    const central = Buffer.concat([
      uint32(0x02014b50), uint16(20), uint16(20), ...common,
      uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.concat([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(entries.length), uint16(entries.length),
    uint32(centralDirectory.length), uint32(offset), uint16(0)
  ]);
  await writeFile(destination, Buffer.concat([...localParts, centralDirectory, end]));
}
