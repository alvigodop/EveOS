export const PI = Math.PI;

export function rowLatitude(y, height) {
  return 90 - ((y + 0.5) / height) * 180;
}

export function rowWeight(y, height) {
  return Math.max(0.000001, Math.cos(rowLatitude(y, height) * PI / 180));
}

export function pixelGeo(x, y, width, height) {
  return {
    longitude: ((x + 0.5) / width) * 360 - 180,
    latitude: rowLatitude(y, height),
  };
}

export function percentileFromHistogram(histogram, total, fraction, start = 0) {
  if (!total) return 0;
  const target = Math.max(1, Math.ceil(total * fraction));
  let count = 0;
  for (let value = start; value < histogram.length; value += 1) {
    count += histogram[value];
    if (count >= target) return value;
  }
  return histogram.length - 1;
}

export function latitudeBand(latitude) {
  const absolute = Math.abs(latitude);
  if (absolute <= 23.5) return "tropical";
  if (absolute <= 66.5) return "midLatitude";
  return "polar";
}
