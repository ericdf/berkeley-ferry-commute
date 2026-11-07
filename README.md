# The Ferry Commute

A three-minute browser cartoon of one commute using the proposed Berkeley Marina ferry. It runs door to door, from Grizzly Peak Blvd at Senior Ave to an office near Civic Center, and back home that evening by way of a pizza from Gioia on Hopkins.

**Watch it:** https://ericdf.github.io/berkeley-ferry-commute/

## Run it

It's a static site with no build step:

```sh
python3 -m http.server 8765   # then open http://localhost:8765
```

Controls: Play/Pause (Space), ←/→ seek 5 s, Restart, Morning/Evening, speed 0.5×–2×, and chapter buttons (Hills, Marina, Ferry, BART, Office, Return, Home). Speed only changes how fast the cartoon plays; the trip clock and every total stay the same.

Preview a single frame with `?ev=INDEX&p=0..1` (for example `?ev=40&p=0.5`). `?sweep` draws every event once and logs any errors. `tools/frames.sh OUTDIR 0 1 2 …` saves stills with headless Chrome while the server is running.

## Changing the numbers

Everything is in **`js/config.js`**:
- start and leave-work times;
- SUV mpg, gas price, parking, fares and the ferry subsidy;
- driving and walking speeds, sailing time;
- the pizza cooling curve;
- the event list itself.

`js/timeline.js` computes every clock time, caption duration and summary total from that file, so nothing on screen is typed in by hand.

## Files

| File | What |
|---|---|
| `js/config.js` | All inputs and the ordered list of trip events |
| `js/timeline.js` | Event times, the master clock, routes and totals |
| `js/geo.js` | **Generated** map data: shoreline, streets, routes, places |
| `js/art.js` | Cartoon kit: SUV, commuter, skyline, bridges, thermometer |
| `js/scenes.js` | One renderer per scene |
| `js/player.js` | Playback, controls, summary cards, transcript |
| `tools/build-geo.py` | Builds `js/geo.js` |

## Map notes

- **Where the map data comes from.** The spec's reference project is `~/prj/gtpb` (Grand Theft Parking: Berkeley). Its `js/streets-data.js` is cropped to the flats, Hopkins to Dwight and Sacramento to Shattuck, so it doesn't reach the hills or the Marina. The cartoon therefore re-routes over the same City of Berkeley centerline dataset, uncropped, from `~/prj/berkeley-public-records/L0/sources/streets/streets-2026-10-20-street-centerlines.geojson`, using gtpb's approach to building the street graph.
- **What gtpb supplied.** The Gioia location (two-thirds of the way along the Hopkins block from California to McGee) and the old Berkeley Pier alignment from `gtpb/ferry/js/marina-geo.js`. The proposed pier is drawn 1,080 ft out along that alignment.
- **How the routes are found.** All routes are shortest-time paths on the real street graph. They respect one-way streets and keep the car off Berkeley's footpaths, stairways and lanes (Rose Walk, Vine Lane and so on). The morning route is Senior → La Loma → Euclid → Cedar → Shattuck → University → Marina, 4.9 mi. The evening route is University → Sacramento → Hopkins.
- **The parking search.** It circles McGee, Ada, California, Hopkins, Carlotta, Posen and Monterey. The space it ends at is the street node closest to home that is a 1.0-mile walk from Gioia, which puts it up Rose St.
- **The shoreline.** OpenStreetMap coastline (© OpenStreetMap contributors). Rebuild with:
  ```sh
  curl -o coast.json --data-urlencode 'data=[out:json];way["natural"="coastline"](37.70,-122.53,37.93,-122.20);out geom;' https://maps.mail.ru/osm/tools/overpass/api/interpreter
  python3 -I tools/build-geo.py STREET_CENTERLINES.geojson coast.json
  ```
- **What the data doesn't cover.** The centerlines stop at the Alameda County line. The San Francisco points (Ferry Building, BART stations, office) and the ferry's path west of Treasure Island are placed by hand. The city data names the hill street **Senior Ave**, so that's what the signs say.

## License

MIT, © 2026 Eric Friedman (see `LICENSE`). Any copy or reuse has to keep the copyright notice and credit Eric Friedman.

The map data in `js/geo.js` keeps its own terms: the shoreline is © OpenStreetMap contributors (ODbL), and the street centerlines come from the City of Berkeley.
