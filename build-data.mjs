/**
 * build-data.mjs — Kolkata SOS directory builder
 * ------------------------------------------------------------------
 * Run this ONCE (or occasionally to refresh) to produce
 * `data/kolkata-sos.json`. The website then reads that file instead of
 * calling the Overpass API on every page load.
 *
 *   node build-data.mjs
 *
 * Source : OpenStreetMap, via the free Overpass API.
 * Licence: ODbL 1.0 — © OpenStreetMap contributors.
 *
 * Requires Node 18+ (uses the built-in global fetch). No dependencies.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* ---------------- configuration ---------------- */

const OUT_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "data/kolkata-sos.json");

/** Kolkata metropolitan area — every query is hard-bounded to this box. */
const BBOX = "22.42,88.20,22.70,88.50";
const BBOX_LABEL = "22.42°–22.70° N, 88.20°–88.50° E";

/* Global Overpass mirrors, tried in order. Overpass instances are run
   voluntarily and get busy, so we rotate through several of them. */
const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

/* Overpass rejects requests that do not identify themselves. */
const USER_AGENT = "KolkataSOS-Directory-Builder/1.0 (static emergency directory; OSM ODbL data)";

/* Only hospitals and police stations are kept in the bundled dataset —
   the other emergency services are covered by official helplines. */
const LAYERS = [
  {
    id: "hospitals",
    patterns: [
      'nwr["amenity"="hospital"]',
      'nwr["healthcare"="hospital"]'
    ]
  },
  {
    id: "police",
    patterns: [
      'nwr["amenity"="police"]'
    ]
  }
];

/* ---------------- helpers ---------------- */

function queryOf(patterns){
  return "[out:json][timeout:180];\n(\n  " +
    patterns.map(p => p + "(" + BBOX + ")").join(";\n  ") +
    ";\n);\nout center tags;";
}

function splitPhones(raw){
  if (!raw) return [];
  return String(raw)
    .split(/[;,/]|\s+or\s+|\s+and\s+/i)
    .map(s => s.trim())
    .filter(s => (s.match(/\d/g) || []).length >= 5);
}

/** Normalise an Indian phone string to an E.164 dial-safe value. */
function toTel(raw){
  const first = splitPhones(raw)[0];
  if (!first) return null;
  let d = first.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!d) return null;
  if (/^91\d{10}$/.test(d)) return "+" + d;
  if (/^0\d{10}$/.test(d)) return "+91" + d.slice(1);
  if (/^0\d{2,4}\d{6,8}$/.test(d)) return "+91" + d.slice(1);
  if (/^\d{10}$/.test(d) && /^[6-9]/.test(d)) return "+91" + d;
  if (/^1800\d{6,8}$/.test(d)) return d;            // toll-free, keep as-is
  if (/^\d{8}$/.test(d)) return "+9133" + d;        // bare Kolkata landline
  if (/^\d{11,13}$/.test(d)) return "+" + d;
  return "+91" + d;
}

function phoneList(tags){
  const raw = tags["contact:phone"] || tags["phone"] || tags["phone:IN"] ||
              tags["contact:mobile"] || tags["mobile"] || tags["emergency:phone"] ||
              tags["operator:phone"] || tags["contact:phone:IN"] || "";
  const out = [];
  for (const p of splitPhones(raw)){
    const t = toTel(p);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function emailList(tags){
  const raw = tags["contact:email"] || tags["email"] || tags["operator:email"] || "";
  return String(raw).split(/[;,]/).map(s => s.trim())
    .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s));
}

function websiteOf(tags){
  const raw = tags["contact:website"] || tags["website"] || tags["url"] || "";
  const found = String(raw).split(/[;,\s]/).map(s => s.trim())
    .filter(s => /^https?:\/\//i.test(s));
  return found[0] || "";
}

function addressOf(tags){
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean);
  const area   = [tags["addr:suburb"] || tags["addr:neighbourhood"]].filter(Boolean);
  const city   = [tags["addr:city"] || tags["addr:town"]].filter(Boolean);
  const post   = [tags["addr:postcode"]].filter(Boolean);

  const parts = [].concat(street, area, city);
  /* A bare PIN code is not an address — only append it when we have a street
     or a locality to go with it. */
  if (parts.length) return parts.concat(post).join(", ");
  return tags["addr:full"] || tags["is_in"] || "";
}

function subtypeOf(tags, layer){
  if (layer === "hospitals"){
    if (/nursing\s*home/i.test(tags.name || "")) return "Nursing home";
    return "Hospital";
  }
  if (layer === "police"){
    if (/head\s*quarter|\bhq\b/i.test(tags.name || "")) return "Headquarters";
    if (/out\s*post|beat\b/i.test(tags.name || "")) return "Outpost";
    if (/quarter/i.test(tags.name || "")) return "Police quarters";
    return "Police station";
  }
  return "";
}

function insideBbox(lat, lon){
  const [s, w, n, e] = BBOX.split(",").map(Number);
  return lat >= s && lat <= n && lon >= w && lon <= e;
}

/* ---------------- Overpass client ---------------- */

async function overpass(query, label){
  const body = new URLSearchParams({ data: query });
  let lastErr = null;

  for (let round = 0; round < 3; round++){
    for (const mirror of MIRRORS){
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 180000);
      try {
        process.stdout.write(`  → ${new URL(mirror).host} … `);
        const res = await fetch(mirror, {
          method: "POST",
          body,
          signal: ctl.signal,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent": USER_AGENT,
            "Accept": "application/json"
          }
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const text = await res.text();
        if (text.trim().charAt(0) !== "{"){
          const msg = (text.match(/Error[^<]*/) || ["non-JSON response"])[0];
          throw new Error(msg.trim().slice(0, 90));
        }
        const json = JSON.parse(text);
        if (!Array.isArray(json.elements)) throw new Error("malformed payload");
        /* A Kolkata-wide query can legitimately return few rows, but never
           none. An empty set means we hit a mirror with the wrong coverage
           (some instances are regional), so treat it as a failure. */
        if (json.elements.length === 0 && label !== "optional"){
          throw new Error("mirror returned 0 rows — wrong coverage, skipping");
        }
        console.log(`ok (${json.elements.length} elements)`);
        return json.elements;
      } catch (err){
        clearTimeout(timer);
        lastErr = err;
        console.log(`failed — ${err.message}`);
      }
    }
    if (round < 2){
      const wait = 10000 * (round + 1);
      console.log(`  … every mirror busy, waiting ${wait / 1000}s before retry ${round + 2}/3`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr || new Error("All Overpass mirrors failed");
}

/* ---------------- main ---------------- */

async function main(){
  console.log("Kolkata SOS — building data/kolkata-sos.json");
  console.log("Bounding box:", BBOX, `(${BBOX_LABEL})\n`);

  const result = {};
  const counts = {};

  for (const layer of LAYERS){
    console.log(`Querying ${layer.id} …`);
    const elements = await overpass(queryOf(layer.patterns), layer.id);

    const records = [];
    const seen = new Set();

    for (const el of elements){
      const t = el.tags || {};
      const name = (t.name || t["name:en"] || "").trim();
      if (!name) continue;

      const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
      const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
      if (lat == null || lon == null || !insideBbox(lat, lon)) continue;

      const key = name.toLowerCase().replace(/[^a-z0-9]/g, "") + "|" +
                  lat.toFixed(3) + "," + lon.toFixed(3);
      if (seen.has(key)) continue;
      seen.add(key);

      const rec = {
        name,
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6))
      };
      const address = addressOf(t);
      if (address) rec.address = address;
      const phones = phoneList(t);
      if (phones.length) rec.phones = phones;
      const emails = emailList(t);
      if (emails.length) rec.emails = emails;
      const site = websiteOf(t);
      if (site) rec.website = site;
      if (t.operator && t.operator !== name) rec.operator = t.operator;
      const sub = subtypeOf(t, layer.id);
      if (sub) rec.type = sub;
      if (t.emergency === "yes") rec.emergency = true;
      rec.osm = el.type + "/" + el.id;

      records.push(rec);
    }

    records.sort((a, b) => a.name.localeCompare(b.name));
    result[layer.id] = records;
    counts[layer.id] = records.length;
    console.log(`  ${records.length} usable records kept ` +
      `(${records.filter(r => r.phones).length} with a phone number)\n`);
  }

  const payload = {
    meta: {
      title: "Kolkata SOS — emergency directory dataset",
      city: "Kolkata, West Bengal, India",
      bbox: BBOX,
      bboxLabel: BBOX_LABEL,
      generated: new Date().toISOString(),
      source: "OpenStreetMap, retrieved via the Overpass API",
      sourceUrl: "https://www.openstreetmap.org/",
      licence: "ODbL 1.0 — © OpenStreetMap contributors",
      note: "Generated by build-data.mjs. Re-run that script to refresh this file.",
      counts
    },
    ...result
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 1), "utf8");

  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1);
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`Total: ${counts.hospitals + counts.police} records, ${kb} KB`);
}

main().catch((err) => {
  console.error("\nBuild failed:", err.message);
  console.error("Overpass is a free, shared service and is sometimes busy. Just run the script again in a minute.");
  process.exit(1);
});
