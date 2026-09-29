export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

const KM_PER_DEG_LAT = 111.195;
const cosDeg = (deg: number) => Math.cos((deg * Math.PI) / 180);

/** Lat/lon box covering a square of 2 × halfSizeKm on the ground, so EPSG:4326 exports have square pixels. */
export function squareBBox(lat: number, lon: number, halfSizeKm: number): BBox {
  const dLat = halfSizeKm / KM_PER_DEG_LAT;
  const dLon = halfSizeKm / (KM_PER_DEG_LAT * cosDeg(lat));
  return { minLon: lon - dLon, minLat: lat - dLat, maxLon: lon + dLon, maxLat: lat + dLat };
}

export function bboxSizeKm(b: BBox): { widthKm: number; heightKm: number } {
  const lat = (b.minLat + b.maxLat) / 2;
  return {
    widthKm: (b.maxLon - b.minLon) * KM_PER_DEG_LAT * cosDeg(lat),
    heightKm: (b.maxLat - b.minLat) * KM_PER_DEG_LAT,
  };
}
