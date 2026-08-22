const textDecoder = new TextDecoder("utf-8", { fatal: false });

function ascii(bytes, start, length) {
  let output = "";
  const end = Math.min(bytes.length, start + length);
  for (let index = start; index < end; index += 1) output += String.fromCharCode(bytes[index]);
  return output;
}

function cleanText(value, maximum = 4096) {
  return String(value || "").replace(/\0+$/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, maximum);
}

function pngMetadata(bytes, view) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  const chunks = []; const text = {}; let offset = 8; let header = null;
  const colorTypes = { 0: "grayscale", 2: "truecolor", 3: "indexed", 4: "grayscale-alpha", 6: "truecolor-alpha" };
  const metadata = { format: "PNG", signatureValid: true, chunks, text };
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false); const type = ascii(bytes, offset + 4, 4);
    const dataStart = offset + 8; const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) { metadata.truncated = true; break; }
    chunks.push(type);
    if (type === "IHDR" && length >= 13) {
      header = {
        width: view.getUint32(dataStart, false), height: view.getUint32(dataStart + 4, false),
        bitDepth: bytes[dataStart + 8], colorType: bytes[dataStart + 9],
        colorModel: colorTypes[bytes[dataStart + 9]] || "unknown",
        compressionMethod: bytes[dataStart + 10], filterMethod: bytes[dataStart + 11],
        interlaced: bytes[dataStart + 12] === 1,
      };
    } else if (type === "pHYs" && length >= 9) {
      metadata.pixelDensity = {
        x: view.getUint32(dataStart, false), y: view.getUint32(dataStart + 4, false),
        unit: bytes[dataStart + 8] === 1 ? "pixels-per-meter" : "unknown",
      };
    } else if (type === "gAMA" && length >= 4) metadata.gamma = view.getUint32(dataStart, false) / 100000;
    else if (type === "sRGB" && length >= 1) {
      metadata.srgbRenderingIntent = ["perceptual", "relative-colorimetric", "saturation", "absolute-colorimetric"][bytes[dataStart]] || "unknown";
    } else if (type === "iCCP") {
      const zero = bytes.indexOf(0, dataStart); metadata.iccProfileName = cleanText(ascii(bytes, dataStart, Math.max(0, zero - dataStart)), 256);
    } else if (type === "tEXt") {
      const zero = bytes.indexOf(0, dataStart); if (zero >= dataStart && zero < dataEnd) text[cleanText(ascii(bytes, dataStart, zero - dataStart), 128)] = cleanText(ascii(bytes, zero + 1, dataEnd - zero - 1));
    } else if (type === "iTXt") {
      const zero = bytes.indexOf(0, dataStart); if (zero >= dataStart && zero + 3 < dataEnd) {
        const keyword = cleanText(ascii(bytes, dataStart, zero - dataStart), 128);
        const compressed = bytes[zero + 1] === 1; let cursor = zero + 3;
        const languageEnd = bytes.indexOf(0, cursor); cursor = languageEnd >= 0 ? languageEnd + 1 : dataEnd;
        const translatedEnd = bytes.indexOf(0, cursor); cursor = translatedEnd >= 0 ? translatedEnd + 1 : dataEnd;
        text[keyword] = compressed ? "[compressed iTXt]" : cleanText(textDecoder.decode(bytes.subarray(cursor, dataEnd)));
      }
    } else if (type === "eXIf") {
      metadata.exif = parseTiff(bytes.subarray(dataStart, dataEnd));
    }
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  metadata.header = header;
  metadata.chunkCounts = Object.fromEntries([...new Set(chunks)].map((type) => [type, chunks.filter((value) => value === type).length]));
  metadata.hasAlpha = [4, 6].includes(header?.colorType) || chunks.includes("tRNS");
  metadata.hasColorProfile = chunks.includes("iCCP") || chunks.includes("sRGB");
  if (!Object.keys(text).length) delete metadata.text;
  return metadata;
}

function tiffValue(bytes, view, entryOffset, little) {
  const tag = view.getUint16(entryOffset, little); const type = view.getUint16(entryOffset + 2, little);
  const count = view.getUint32(entryOffset + 4, little); const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const size = (sizes[type] || 1) * count; const stored = entryOffset + 8;
  const dataOffset = size <= 4 ? stored : view.getUint32(stored, little);
  if (dataOffset < 0 || dataOffset + size > bytes.byteLength) return { tag, value: null };
  const local = dataOffset;
  if (type === 2) return { tag, value: cleanText(ascii(bytes, local, count)) };
  if (type === 3) return { tag, value: count === 1 ? view.getUint16(dataOffset, little) : Array.from({ length: count }, (_, index) => view.getUint16(dataOffset + index * 2, little)) };
  if (type === 4) return { tag, value: count === 1 ? view.getUint32(dataOffset, little) : Array.from({ length: count }, (_, index) => view.getUint32(dataOffset + index * 4, little)) };
  if (type === 5 && count) {
    const numerator = view.getUint32(dataOffset, little); const denominator = view.getUint32(dataOffset + 4, little);
    return { tag, value: denominator ? numerator / denominator : null };
  }
  if (type === 1 || type === 7) return { tag, value: count === 1 ? bytes[local] : Array.from(bytes.subarray(local, local + Math.min(count, 64))) };
  return { tag, value: null };
}

function parseTiff(bytes) {
  if (bytes.length < 8) return { valid: false };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const order = ascii(bytes, 0, 2); const little = order === "II";
  if (!little && order !== "MM") return { valid: false };
  if (view.getUint16(2, little) !== 42) return { valid: false };
  const names = {
    0x010e: "description", 0x010f: "make", 0x0110: "model", 0x0112: "orientation",
    0x011a: "xResolution", 0x011b: "yResolution", 0x0128: "resolutionUnit",
    0x0131: "software", 0x0132: "dateTime", 0x829a: "exposureTime", 0x829d: "fNumber",
    0x8827: "iso", 0x9003: "dateTimeOriginal", 0xa002: "pixelWidth", 0xa003: "pixelHeight",
    0xa405: "focalLength35mm",
  };
  const output = { valid: true, byteOrder: little ? "little-endian" : "big-endian" };
  const readIfd = (relativeOffset, depth = 0) => {
    if (!relativeOffset || depth > 2) return;
    const absolute = relativeOffset;
    if (absolute + 2 > bytes.byteLength) return;
    const count = view.getUint16(absolute, little);
    for (let index = 0; index < Math.min(count, 256); index += 1) {
      const entry = absolute + 2 + index * 12; if (entry + 12 > bytes.byteLength) break;
      const { tag, value } = tiffValue(bytes, view, entry, little);
      if (names[tag] && value !== null) output[names[tag]] = value;
      if (tag === 0x8769 && Number.isInteger(value)) readIfd(value, depth + 1);
      if (tag === 0x8825) output.gpsMetadataPresent = true;
    }
  };
  readIfd(view.getUint32(4, little));
  return output;
}

function jpegMetadata(bytes, view) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const metadata = { format: "JPEG", signatureValid: true, markers: [] }; let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    let marker = bytes[offset + 1]; offset += 2;
    while (marker === 0xff && offset < bytes.length) marker = bytes[offset++];
    if ([0xd8, 0xd9].includes(marker)) continue;
    if (marker === 0xda) break;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset, false); const dataStart = offset + 2; const dataEnd = offset + length;
    if (length < 2 || dataEnd > bytes.length) { metadata.truncated = true; break; }
    metadata.markers.push(`FF${marker.toString(16).padStart(2, "0").toUpperCase()}`);
    if (marker === 0xe0 && ascii(bytes, dataStart, 5) === "JFIF\0" && length >= 16) {
      metadata.jfif = {
        version: `${bytes[dataStart + 5]}.${bytes[dataStart + 6]}`,
        densityUnit: ["none", "dpi", "dpcm"][bytes[dataStart + 7]] || "unknown",
        xDensity: view.getUint16(dataStart + 8, false), yDensity: view.getUint16(dataStart + 10, false),
      };
    } else if (marker === 0xe1 && ascii(bytes, dataStart, 6) === "Exif\0\0") metadata.exif = parseTiff(bytes.subarray(dataStart + 6, dataEnd));
    else if (marker === 0xe1 && ascii(bytes, dataStart, 29).includes("http://ns.adobe.com/xap/1.0/")) metadata.xmpPresent = true;
    else if (marker === 0xe2 && ascii(bytes, dataStart, 11) === "ICC_PROFILE") metadata.iccProfilePresent = true;
    else if (marker === 0xfe) metadata.comment = cleanText(ascii(bytes, dataStart, length - 2));
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
      metadata.frame = { precision: bytes[dataStart], height: view.getUint16(dataStart + 1, false), width: view.getUint16(dataStart + 3, false), components: bytes[dataStart + 5], progressive: marker === 0xc2 };
    }
    offset = dataEnd;
  }
  return metadata;
}

function webpMetadata(bytes, view) {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const metadata = { format: "WebP", signatureValid: true, chunks: [] }; let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4); const length = view.getUint32(offset + 4, true); const dataStart = offset + 8;
    if (dataStart + length > bytes.length) { metadata.truncated = true; break; }
    metadata.chunks.push(type);
    if (type === "VP8X" && length >= 10) {
      const flags = bytes[dataStart]; metadata.extended = {
        animation: !!(flags & 2), xmp: !!(flags & 4), exif: !!(flags & 8), alpha: !!(flags & 16), icc: !!(flags & 32),
        width: 1 + bytes[dataStart + 4] + (bytes[dataStart + 5] << 8) + (bytes[dataStart + 6] << 16),
        height: 1 + bytes[dataStart + 7] + (bytes[dataStart + 8] << 8) + (bytes[dataStart + 9] << 16),
      };
    }
    offset = dataStart + length + (length % 2);
  }
  return metadata;
}

export async function extractImageContainerMetadata(blob) {
  if (!(blob instanceof Blob)) return null;
  const buffer = await blob.arrayBuffer(); const bytes = new Uint8Array(buffer); const view = new DataView(buffer);
  const parsed = pngMetadata(bytes, view) || jpegMetadata(bytes, view) || webpMetadata(bytes, view) || { format: "unknown", signatureValid: false };
  return {
    ...parsed,
    mimeType: blob.type || null,
    byteSize: blob.size,
    privacy: { gpsCoordinatesExtracted: false, gpsMetadataPresent: !!parsed.exif?.gpsMetadataPresent },
  };
}
