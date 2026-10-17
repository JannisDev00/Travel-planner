const fs = require("fs");
const path = require("path");

const cities = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "cities.json"), "utf8")
);

function findCity(name) {
  return cities.find((c) => c.name === name) || null;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function perKmRate(distanceKm) {
  if (distanceKm < 1000) return 0.18;
  if (distanceKm < 3000) return 0.13;
  if (distanceKm < 7000) return 0.09;
  return 0.07;
}

// Rough, self-contained estimate (no live flight data source is available here):
// round-trip price scales with great-circle distance, and routes beyond ~6500km
// are assumed to need a connection.
function estimateFlight(originCityName, dest) {
  const origin = findCity(originCityName);
  if (!origin || !Number.isFinite(dest.lat) || !Number.isFinite(dest.lon)) return null;

  const distanceKm = Math.round(haversineKm(origin, dest));
  const rate = perKmRate(distanceKm);
  const rawPrice = 120 + rate * distanceKm * 2;
  const roundTripPriceUSD = Math.max(80, Math.round(rawPrice / 5) * 5);

  const stops = distanceKm > 6500 ? 1 : 0;
  const directHours = distanceKm / 850 + 0.75;
  const totalDurationHours = Math.round((stops ? directHours * 1.2 + 2 : directHours) * 10) / 10;

  return {
    originCity: origin.name,
    originIata: origin.iata,
    destinationIata: dest.iata || null,
    distanceKm,
    roundTripPriceUSD,
    stops,
    totalDurationHours,
  };
}

module.exports = { estimateFlight, cities };
