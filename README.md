# Hangout Route Planner

A working React Native + Expo MVP with a small Node.js backend. MapLibre renders OpenFreeMap maps, Overpass searches OpenStreetMap venues, and FOSSGIS OSRM supplies walking routes. No Google keys, registration, billing, external database, or backend framework is required. Group votes use a small local JSON file.

## Run locally

Use Node.js 22.18+ (Node 24 recommended).

~~~sh
npm install
npm run build:web
npm run mvp
~~~

Open http://127.0.0.1:63119. The server serves the web app and API together. Configuration defaults work without an .env file; .env.example contains optional overrides. To customize the defaults, copy .env.example to .env and edit the values.

For Expo web development with hot reload:

~~~sh
npm run dev
~~~

Tap the map to choose a start, choose Date/Friends/Family, set 500–2000 m and a budget preference, then Generate route. Select a pin or scroll the cards. Show walking directions expands the three route legs. The reset button returns to Rustaveli.

## Data and fallback behavior

The app starts in real-place mode. Within the bundled Tbilisi coverage it selects dated real OSM venues immediately, without waiting for Overpass. Outside that coverage it uses live Overpass, which is a shared public service and can fail or be overloaded. Successful queries are reused for ten minutes across vibe and budget changes. An earlier successful search can be reused for up to 24 hours after an outage, with a dated notice.

For a reliable Tbilisi demo, data/tbilisi-osm.json includes **2,811 real OpenStreetMap venues**, including 34 mapped nightclubs, within 20 km of Rustaveli. It was derived from the official Geofabrik Georgia extract with OSM data through **2026-10-16 20:21 UTC**. The server prefers this snapshot when the entire selected search circle fits inside its coverage. Set PREFER_LOCAL_PLACES=false for live-first search, which still falls back to the snapshot after an error. Cards retain real OSM links, the header says **OSM snapshot**, and a notice shows the date. The snapshot never moves venues to a different city. Other locations require a successful public search or a previously cached response. Live venue searches and walking requests each have a six-second timeout. A venue timeout offers a one-tap return to Rustaveli; a walking timeout retains the places with an approximate straight line.

Demo mode is a separate, explicit switch for illustrative names, coordinates, prices and scores. Live failures never silently introduce fictional venues.

If OSRM fails, genuine places remain visible with dashed straight lines, an approximate distance and a clear warning. No walking time or turn directions are invented. If the basemap fails, a tappable schematic remains available, including real venue search and a map retry button.

OpenStreetMap does not supply Google customer reviews. Cards display an explained **match score**, based on vibe and distance. A separate star rating previews review quality: most are clearly marked DEMO RATING, while three exact Tbilisi venues use dated online snapshots. Every new venue has a clearly marked mock price estimate in GEL. Budget filters those estimates strictly: $ allows up to 25 GEL, $$ up to 50 GEL, and $$$ up to 100 GEL per person per stop. These are simulated planning values rather than actual venue quotes. Opening hours, business status, accessibility and suitability can be incomplete; confirm them with the venue. The radius constrains each stop, not total walking distance.

## Mock prices and budget search

Every normalized venue, sample route, swapped stop and new voting option receives a deterministic per-person mock price. Restaurants assume one meal and a soft drink, cafes one drink and a small treat, bars one drink, clubs entry and one drink, and activities admission or a single session. Public parks/gardens/playgrounds/viewpoints have mock free entry unless a fee is mapped. A no-fee tag on a cafe never means free food.

| Budget | Maximum per person per stop | Maximum for three stops |
|---|---|---|
| $ | 25 GEL | 75 GEL |
| $$ | 50 GEL | 150 GEL |
| $$$ | 100 GEL | 300 GEL |

The selector filters candidates before scoring. Better ratings do not bypass the monetary cap. Higher budgets include cheaper venues too; they do not require spending the full amount. Mapped price tiers remain separate OSM metadata and still exclude known expensive tiers. Unknown prices now receive mock estimates and are filtered using those values. Prices do not change when the budget or search radius changes. The UI shows each stop estimate, what it covers, and an exact sum labeled Mock route total. All three group options show their own totals.

The category ranges were calibrated using public menus/listings researched on 2026-10-17: the official Sakhelosno menu (beer 12 GEL, gin tonic 24 GEL, Red Flag cocktail 28 GEL), Ruby Cafe public breakfast menu (12–25 GEL examples), and official TKT event listings (50 and 110 GEL from-price examples). These are category guides, not the quoted price at any suggested venue; quantities, fees and real prices can differ. data/price-research.json includes the exact source links. Estimates use the Tbilisi GEL model even if you move the map to another city.

No live menu scraping, currency API, Google account, billing or extra per-search network requests are needed. Historical polls remain immutable: older routes can show Price estimate unavailable until a fresh route is generated.

## Ratings and review preview

Each new itinerary includes a stable 3.0–4.9 star demo rating and short, explicitly fictional sample feedback for venues without a researched match. These are not customer ratings or visitor quotes. No imaginary reviewers or review counts are added. Scores remain stable for the same OSM ID across refreshes, budgets and radii.

Three venue identities have manually researched Tripadvisor snapshots from 2026-10-17: Shatre (4.4/5, 189 reviews), Ruby Cafe (4.9/5, 16 reviews), and Cafe Stamba (3.8/5, 328 reviews). Each card links the exact source, shows the research date, and labels the value ONLINE SNAPSHOT. Values were available on public pages/search caches at research time and are not live API results. Short summaries paraphrase review themes, including mixed feedback. Similar names at other branches do not inherit these scores. See data/review-snapshots.json for the sources.

Star quality adds a small separate ranking adjustment, so stronger ratings can beat otherwise similar picks without changing the displayed vibe-match percentage. Small real review samples are moderated toward 4.0. Radius, budget, opening hours, distinct stops and vibe restrictions continue to apply. The default ranking uses simulated ratings as part of this requested prototype preview; it is not suitable for real venue-quality decisions. Historical group options remain fixed and may show ratings unavailable until a fresh route is created.

No Google keys, billing, runtime scraping or extra network requests are required. Change researched snapshots deliberately after checking their source pages.

## New planning features

- **Friends styles:** Chill = activity → food → café/dessert; Bar hopping = food → two distinct bars/pubs; Club night = food → bar/pub → nightclub. Strict styles return a useful no-match message when there are not enough eligible venues.
- **Start time:** Enable Plan for a specific time, select date/time and the venue's IANA time zone (Asia/Tbilisi by default). Cards show arrival, departure and whether mapped hours cover the full visit. Planned stays are 45/60/45 minutes for a regular hangout, 60 minutes per bar-hopping stop, and 60/60/90 minutes for a club night. Walking times come from OSRM when available; otherwise they are explicitly estimated.
- **Opening-hour limits:** opening_hours.js evaluates weekly schedules and overnight hours. Missing, invalid or location-dependent holiday/solar rules remain unknown. Visits spanning an unsupported daylight-saving transition also remain unknown. Known-closed candidates are excluded, checking arrival and departure down to the second. A real walking-time conflict tries another eligible combination, with at most three route requests per generation; if none works, change the start time. Mapped hours do not confirm a business is currently operating.
- **Music and atmosphere:** Expand Music & atmosphere for techno, house, jazz, live music, quiet, dancing and outdoors. Matching mapped tags raise the score; known conflicting nightlife venues are excluded. Missing tags stay visible as unknown, so the app does not invent a genre or a quiet atmosphere.
- **Swap one stop:** Each card can replace its venue while retaining the other two IDs, then recalculate walking directions and planned visits. Previously swapped venues are avoided for that slot (up to 24). If no alternative fits, the existing route remains on screen.
- **Group voting:** Create two or three distinct routes from the current preferences. Share the link, vote, change a vote, and preview any option on the map. Poll options remain fixed once created. Counts refresh every 10 seconds. Revision checks prevent a delayed refresh from overwriting a newer vote. Leaving a vote or changing preferences cancels pending client actions; expired votes disable ballot buttons. An anonymous voter token is stored locally, and the server stores only its hash. This is one vote per stored browser/app identity, not an authenticated or fraud-resistant ballot.

Votes are saved in var/groups.json through serialized atomic writes and survive server restarts. Polls expire after seven days. The private prototype caps active polls at 200 and voters at 2,000 per poll. API write limits also apply. The source ZIP excludes private vote data and .env.

The running workspace is bound to your local network (HOST=0.0.0.0) to support sharing between devices. Copy / share uses the detected LAN address; friends must be on a reachable network and this backend must remain running. Windows firewall can affect connectivity. The download defaults to loopback: set HOST=0.0.0.0 to enable LAN sharing. Set PUBLIC_APP_URL to an actual hosted app URL, or to the correct LAN URL if auto-detection picks a different interface. HTTPS, authentication and shared storage/rate limiting are needed for a public production deployment. No Internet deployment was performed.

The API now also provides POST /api/itineraries/swap, POST /api/groups, GET /api/groups/:id, POST /api/groups/:id/vote and GET /api/voter. The plan input accepts preferences with friendsStyle, startLocal (YYYY-MM-DDTHH:mm), timeZone, music and atmosphere. Swaps add stopIds, swapIndex and excludeIds. Group creation adds a title; voting adds optionId and an X-Voter-Token header. Server responses never expose voter hashes.

## Backend and algorithm

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/health | Process health |
| GET | /api/config | Public map style and provider information |
| POST | /api/itineraries | Generate a real or explicit sample itinerary |

~~~json
{
  "start": { "latitude": 41.7011, "longitude": 44.7933 },
  "vibe": "Date",
  "radius": 1000,
  "budget": 2,
  "demoMode": false
}
~~~

1. Read the local OSM catalog when it covers the selected start and radius; otherwise run one bounded Overpass query for named activities, restaurants, cafés, bars and related categories. Normalize nodes and way/relation centers, exclude invalid/private/closed records and merge nearby duplicate representations.
2. Rank each stage for the chosen vibe, mapped suitability, distance, demo/sourced review quality and mock price limits. Family excludes mapped adult-only venues; Friends prefers arcades and a bar, pub or nightclub finale; cafés are used only when no nightlife venue fits the radius and mock budget; Date favors viewpoints, parks and galleries.
3. Start with eight candidates per stage and evaluate 512 distinct triplets; broaden to 16 per stage (at most 4,096 combinations) if no full visit fits. Rank the combined vibe match with a distance penalty and validate each scheduled visit. Friends styles choose food → bars or food → bar → club; Date, Family and Chill use activity → food → café/drinks. Swaps constrain the other two IDs before ranking alternatives.
4. Request an OSRM foot route through all four coordinates, returning geometry, distance, time and per-leg instructions. If actual travel time makes a known-hours visit impossible, try an eligible alternative within the bounded request limit. Group generation makes at most five sequential route attempts to produce two or three valid options.

server/planner.ts exports fetchNearbyPlaces(lat, lng, radius, placeType?, maxPrice?, signal?) and generateItinerary(vibe, radius, budget, { start?, demoMode?, signal? }). Provider selection, matching and public-service requests run on the backend.

Responses contain stops, route, notices, source, catalogSource (overpass or snapshot), fetchedAt and cache status. Error responses have an error object with code and message. Errors use 400 for invalid input, 413 for an oversized body, 415 for incorrect content type, 422 for missing/distinct venue matches, 429 for local limits and 502 for unavailable public search without a valid fallback.

The server limits JSON bodies to 8 KB, generations to 12 per IP per minute and concurrent work to four. Client disconnects cancel pending work. It defaults to loopback, checks browser origins and serves only dist/. The Node API uses built-in modules plus opening_hours.js for mapped schedules; it does not run Metro or Expo CLI in production.

Friends nightlife uses the mapped [OSM nightclub category](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dnightclub), alongside bars and pubs. Final cards say Bar stop, Pub stop or Club night and show a corresponding drink/music icon. This is a venue suggestion, with no guarantee about tonight's opening hours, event program or entry policy. Coffee/dessert fallback is explicitly explained.

## Public service limits

- Overpass requests are serialized with at least two seconds between starts. Cache reuse avoids querying when only the vibe or budget changes. There are no automatic retry loops or automatic provider rotation.
- OSRM requests are serialized with at least 1.1 seconds between starts, respecting FOSSGIS's one-request-per-second limit.
- Keep this as a private, single-server hackathon prototype. Shared services have no availability guarantee. Multiple processes need a shared request limiter; public/high-volume deployments need a provider agreement or self-hosted services.
- Attribution remains visible on the map and below the controls, including OpenFreeMap/OpenMapTiles/OpenStreetMap, FOSSGIS and a Fix the map link.

Optional .env values: PREFER_LOCAL_PLACES (true by default), OVERPASS_URL, OSRM_FOOT_URL, MAP_STYLE_URL, UPSTREAM_USER_AGENT, HOST, PORT, CORS_ORIGINS and EXPO_PUBLIC_API_BASE_URL. Use a meaningful project/contact user agent when deploying. After changing the map style, refresh the page or use Reconnect. Public service URLs must be configured by the server operator.

## Android and iOS

Native uses @maplibre/maplibre-react-native and the same OpenFreeMap style and backend. The Expo config plugin is already installed. **MapLibre requires an Expo development build; Expo Go cannot load its native module.**

For a physical phone, set HOST=0.0.0.0 and EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_LAN_IP:63119 in .env. The phone and server must share a reachable network. Start the backend, then build:

~~~sh
npx expo run:android
# On macOS with Xcode:
npx expo run:ios
~~~

Use HTTPS for remote/release deployments and account for platform HTTP restrictions during local development. Android/iOS bundles have been exported and typechecked; no native device or emulator run was performed here.

## Files

~~~text
App.tsx                       Main screen, controls, cards and walking instructions
src/MapCanvas.tsx             MapLibre GL JS web map
src/MapCanvas.native.tsx      Native MapLibre map
src/OfflineMap.tsx            Tappable schematic fallback
src/api.ts                    Typed API client and cancellation
shared/map-geometry.ts        Radius polygon, route feature and bounds
server/app.ts                 HTTP API, validation, static serving and local limits
server/planner.ts             Venue normalization, ranking, triplets and OSRM
server/request-gate.ts        Serialized provider request spacing
server/snapshot.ts            Server-only bundled snapshot loader
data/tbilisi-osm.json          Attributed real venue fallback
scripts/dev.mjs               API + Expo development launcher
scripts/smoke-live.mjs         Opt-in real provider smoke check
scripts/build-snapshot.mjs     Optional regional extract processing tool
tests/                        Algorithm, HTTP and browser regression checks
~~~

## Verification

~~~sh
npm test
npm run typecheck
npm run build:all
npm run test:e2e
# Makes public service requests; run sparingly:
npm run smoke:live
~~~

Validated: **90 algorithm/HTTP tests**, **28 Chrome browser tests**, TypeScript and web/Android/iOS bundle exports. Browser tests use deterministic provider fixtures and a minimal map style, including route generation, map tapping, controls, cancellation, explicit sample mode and service failure. The deeper regressions cover a 108-case style/radius/budget/music matrix, repeated swaps beyond the initial candidate batch, second-precision and overnight hours, 40 concurrent voters, ballot changes, failed disk-write recovery, persistence and expiry after restart, delayed create/load/vote/refresh responses, expired/invalid links, clipboard failure, custom share URLs, narrow/desktop layouts and keyboard radio selection. Browser tests do not hammer public map services. They use isolated port 63120 and installed Chrome; set PLAYWRIGHT_CHANNEL=msedge or PLAYWRIGHT_EXECUTABLE_PATH for another installed browser.

The real smoke check loaded OpenFreeMap, used the dated OSM snapshot during an Overpass outage, and received a **779 m / approximately 10 minute** FOSSGIS walking route via Glazed staircase → Shatre → Ruby. Its JSON result is saved locally in artifacts/live-itinerary.json. Public Overpass availability was not confirmed during this run. Expo/React Native build tooling currently reports transitive npm audit advisories; this prototype has not been audited for public production deployment.

## Refresh the snapshot

The snapshot is an Open Database License (ODbL) derived database: retain attribution, source, timestamp and the same license when redistributing it. The source JSON is included with this project. See data/README.md.

For an intentional refresh, download the current Georgia extract with node scripts/download-extract.mjs, then run the command below with the actual data timestamp shown on Geofabrik's download page. The optional parser is a development dependency; the full regional download is never bundled in the app or archive.

~~~sh
npm run snapshot:build -- artifacts/georgia-latest.osm.pbf 2026-10-16T20:21:21Z
~~~

Native clients need a fresh development build after installing AsyncStorage. Expo Go still cannot load MapLibre.

## Provider documentation

- [OpenFreeMap quick start](https://openfreemap.org/quick_start/)
- [MapLibre Expo native setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/)
- [Overpass public service guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [FOSSGIS routing service terms](https://routing.openstreetmap.de/about.html)
- [Geofabrik Georgia extracts](https://download.geofabrik.de/europe/georgia.html)
- [OpenStreetMap copyright and ODbL](https://www.openstreetmap.org/copyright)

- [opening_hours.js schedule parser](https://github.com/opening-hours/opening_hours.js)
- [OSM music tags](https://wiki.openstreetmap.org/wiki/Key:music)

## Upgrade live verification

The complete real-data flow was rechecked after the deep fixes: a scheduled Tbilisi Club night used Di Roma → Rustaveli Wine Bar → Cloud 9, received real FOSSGIS walking directions, retained unknown club hours, replaced only the food stop, created three distinct voting options, and accepted two votes from independent browser sessions through the LAN link. This verifies the local flow rather than tonight’s venue availability. Screenshots and the detailed result are saved locally under artifacts/.
