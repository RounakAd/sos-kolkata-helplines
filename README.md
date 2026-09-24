# Kolkata SOS — One-Stop Emergency Directory

A single-file static website that lists every emergency number for Kolkata, West Bengal,
plus every hospital and police station in the city with a one-tap Google Maps link.

There is **no backend, no build step and no runtime API call**. Drop the folder on
GitHub Pages and it works.

---

## What's in the folder

| Path | What it is |
|---|---|
| `index.html` | The entire website — HTML, CSS and JavaScript in one file. |
| `data/kolkata-sos.json` | The directory data: Kolkata hospitals and police stations. |
| `build-data.mjs` | The one-off script that generated that JSON file. |

---

## Deploying to GitHub Pages

1. Create a new repository and upload `index.html`, the `data/` folder and `build-data.mjs`.
2. In the repository go to **Settings → Pages**.
3. Under **Source**, pick **Deploy from a branch**, choose `main` and the `/ (root)` folder.
4. Save. The site goes live at `https://<your-username>.github.io/<repo-name>/`.

The page loads its data with a relative path (`data/kolkata-sos.json`), so it works
from a repository sub-path without any changes.

To preview locally, don't open the file directly — browsers block `file://` reads of
local JSON. Serve the folder instead:

```bash
python -m http.server 8000
# then open http://localhost:8000/
```

---

## Refreshing the directory data

`data/kolkata-sos.json` is a snapshot, not a live feed — the site never calls the
Overpass API while a visitor is using it. To pull in new hospitals, renamed police
stations or newly added phone numbers:

```bash
node build-data.mjs
```

That's it. It queries OpenStreetMap once, writes `data/kolkata-sos.json`, and prints a
summary. Commit the updated file and the site picks it up. The script needs Node 18 or
newer and has no dependencies.

Overpass is a free, volunteer-run service and is occasionally busy. The script rotates
through several mirrors and retries automatically — if it still fails, wait a minute and
run it again.

---

## What is and isn't in the data file

**In it** — hospitals, police stations and pet care (veterinary clinics, animal
shelters, pet services) inside the Kolkata bounding box (22.42°–22.70° N,
88.20°–88.50° E), with coordinates, addresses, phone numbers, emails and websites
where OpenStreetMap has them.

**Not in it** — fire stations, ambulance stations, towing and cyber cells.
OpenStreetMap has almost no coverage of those in Kolkata, so instead of showing
empty categories the site lists the **official government helplines** for each of
them: 101 (fire), 102 (ambulance), 1930 (cyber crime) and 1033 / 1073 (breakdown
and road accidents).

Pet care is thin for the same reason — OpenStreetMap only has a handful of
veterinary practices mapped in Kolkata, and none with a phone number. Those cards
therefore show **location and address only**. The animal welfare organisations in
the Pet Care tab carry the real contact numbers.

---

## The tabs

| Tab | Contents |
|---|---|
| **Helplines** | 45 government-verified numbers in 13 groups: emergency, women, cyber, missing persons, Kolkata Metro, railways, disaster, children, elderly, mental health & de-addiction, support & inclusion, road, and utilities. |
| **Hospitals** | Every hospital and nursing home in Kolkata, with phone, email and map. |
| **Police Stations** | Every police station, with a Google Maps link. No phone numbers — OpenStreetMap doesn't have them, and inventing them would be worse than omitting them. |
| **Pet Care** | Mapped veterinary clinics and pet services, plus animal rescue organisations with real phone numbers. |
| **NGOs** | Kolkata non-profits for children, girls, women, the elderly, specially-abled children, animals and drug addiction. |
| **Women's Safety** | One-tap SOS with live GPS, a pre-written alert, WhatsApp / SMS / email sending, a siren and a fake-call escape tool. |

---

## Where the NGO details come from

Every organisation in the NGOs tab is a real, named Kolkata non-profit. Addresses,
phone numbers and emails were taken from the organisation's **own website** where
one exists — CINI, Sanlaap, Manovikas Kendra, IICP, Kripa Foundation, All Bengal
Women's Union, Little Sisters of the Poor — and otherwise from a public animal
welfare directory. Each card shows its source.

These are community organisations, **not emergency services**. Details can go
stale: the site says so prominently, and the section tells users to confirm before
travelling or donating. If you spot something out of date, edit the `NGO_ORGS`
array in `index.html` — it's a plain list of objects.

---

## Credits

- Directory data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
  retrieved via the [Overpass API](https://overpass-api.de/) under the ODbL.
- Helpline numbers: Government of India / Government of West Bengal.
- Site: **Created by Rounak Adhikary** — [@ig_chromozome](https://instagram.com/ig_chromozome)

Always dial **112** in a life-threatening emergency.
