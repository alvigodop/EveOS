const textEncoder = new TextEncoder();

function crcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function write16(view, offset, value) { view.setUint16(offset, value, true); }
function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

async function bytesFrom(value) {
  if (typeof value === "string") return textEncoder.encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  return textEncoder.encode(JSON.stringify(value, null, 2));
}

export async function createStoredZip(entries) {
  const prepared = [];
  for (const entry of entries) {
    const name = textEncoder.encode(String(entry.name).replace(/\\/g, "/"));
    const bytes = await bytesFrom(entry.data);
    prepared.push({ name, bytes, crc: crc32(bytes), date: dosDateTime(entry.date) });
  }
  let localSize = 0;
  for (const entry of prepared) localSize += 30 + entry.name.length + entry.bytes.length;
  let centralSize = 0;
  for (const entry of prepared) centralSize += 46 + entry.name.length;
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let offset = 0;
  const central = [];
  for (const entry of prepared) {
    const localOffset = offset;
    write32(view, offset, 0x04034b50); write16(view, offset + 4, 20);
    write16(view, offset + 6, 0x0800); write16(view, offset + 8, 0);
    write16(view, offset + 10, entry.date.time); write16(view, offset + 12, entry.date.day);
    write32(view, offset + 14, entry.crc); write32(view, offset + 18, entry.bytes.length);
    write32(view, offset + 22, entry.bytes.length); write16(view, offset + 26, entry.name.length);
    write16(view, offset + 28, 0); offset += 30;
    output.set(entry.name, offset); offset += entry.name.length;
    output.set(entry.bytes, offset); offset += entry.bytes.length;
    central.push({ ...entry, localOffset });
  }
  const centralOffset = offset;
  for (const entry of central) {
    write32(view, offset, 0x02014b50); write16(view, offset + 4, 20); write16(view, offset + 6, 20);
    write16(view, offset + 8, 0x0800); write16(view, offset + 10, 0);
    write16(view, offset + 12, entry.date.time); write16(view, offset + 14, entry.date.day);
    write32(view, offset + 16, entry.crc); write32(view, offset + 20, entry.bytes.length);
    write32(view, offset + 24, entry.bytes.length); write16(view, offset + 28, entry.name.length);
    write16(view, offset + 30, 0); write16(view, offset + 32, 0); write16(view, offset + 34, 0);
    write16(view, offset + 36, 0); write32(view, offset + 38, 0); write32(view, offset + 42, entry.localOffset);
    offset += 46; output.set(entry.name, offset); offset += entry.name.length;
  }
  const directorySize = offset - centralOffset;
  write32(view, offset, 0x06054b50); write16(view, offset + 4, 0); write16(view, offset + 6, 0);
  write16(view, offset + 8, prepared.length); write16(view, offset + 10, prepared.length);
  write32(view, offset + 12, directorySize); write32(view, offset + 16, centralOffset); write16(view, offset + 20, 0);
  return new Blob([output], { type: "application/zip" });
}
