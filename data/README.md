# Tbilisi venue snapshot

The JSON is a derived OpenStreetMap database, licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Attribution: © OpenStreetMap contributors. Regional extract by Geofabrik.

Source: https://download.geofabrik.de/europe/georgia.html (Georgia PBF). OSM data through 2026-10-16T20:21:21Z. The JSON records its download date, origin, coverage center, 20,000 m coverage radius and source element IDs. Full source JSON is provided in this project. No OSM contributor personal metadata is included.

The optional scripts/build-snapshot.mjs filters named activities and dining/drinks venues and computes bounding-box centers for ways/relations. It conservatively skips incomplete geometries. It does not verify whether businesses are currently open.

The default runtime prefers this catalog whenever the entire search circle fits the snapshot coverage, without waiting for a public service. Live-first mode can also use it after an Overpass failure. The UI labels the snapshot and date. The source JSON can be refreshed intentionally with the documented development script.

## Review preview data

review-snapshots.json is a separate, manually researched file of three aggregate ratings and brief original summaries. It is not part of the OSM extract. Each record links its public Tripadvisor page and is dated 2026-10-17. Counts and scores may be stale; do not present them as live Google/OSM ratings. All other app scores and feedback are generated demo data, with no customer review count. No individual reviews are reproduced.

## Mock price calibration

price-research.json records public menu/listing examples researched on 2026-10-17, with source URLs. They guide fictional category price ranges; no venue is assigned a verified quote from these sources. All generated price estimates are marked mock, use GEL per person per stop, and are stable for the same venue/category/model. The active caps are 25/50/100 GEL, including on swaps and group alternatives. These separately compiled examples are not part of the OSM extract.
