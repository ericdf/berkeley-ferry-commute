# Commuter Reality Check — handoff notes

A companion to the cartoon. The cartoon tells one story. This page lets the viewer choose their own: where they live, when they work, what they own, how messy their days are. Then it plays 21 workdays and scores every way of getting to San Francisco against **the same month of luck**.

Open `play.html` (same static server as the cartoon). `?auto=ferry_drive` jumps straight into a month with that strategy. Add `&results=1` to skip to the scorecard, or `&day=N` to show one day's map. `home=`, `dest=` and `seed=` fix the rest.

## Files

| File | What |
|---|---|
| `play.html` | Page shell: map, four steps (life → pick → month → results), assumptions |
| `js/play-config.js` | **Every number.** Homes, legs, fares, ferry schedule, parking, life-event odds. Each value is tagged `[input]`, `[scenario]`, `[estimate]` or `[map]` |
| `js/play-sim.js` | Pure simulation, no DOM. Runs in node (see the header comment) |
| `js/play-ui.js` | Form, map drawing (reuses `js/geo.js`), day playback, scorecard |
| `js/play-geo.js` | **Generated** map lines: street routes for each home, BART track, I-80 and the Bay Bridge |
| `tools/build-play-geo.py` | Builds `js/play-geo.js` (usage at the top of the file) |
| `css/play.css` | Layered on `css/style.css` |

## How the simulation works

1. **Luck is drawn once per month** (`drawLuck`, seeded). Every random number is drawn in a fixed order whether or not it gets used, so changing one setting never reshuffles the rest. Each day has: running late (5–15 min), a late meeting (45–120 min), the school calling (leave 12:30–3:00), rain, the time the ferry lot fills, BART wait and delay, bus lateness, Lyft surge, and bridge traffic.
2. **Each strategy plans like a sensible person.** Drive → BART parks at the home's `parkRide` station (Downtown Berkeley has no BART lot, so the hills park at North Berkeley). Each BART lot fills by a time each morning (`ST` at the top of `js/play-config.js`); arrive after that and you drive into SF. "Before the lot fills" leaves early enough to beat it. With "my bike rides BART or the ferry with me", bike riders ride the SF end too (`bikeFromBart`, `bikeFromFerry`) instead of walking or taking Muni.
   Planning: It works backward from "be at work by" to a leave time. With **"I can never be late"** checked, it plans to arrive `strictCushionMin` (30) minutes early, and the results pick the best option that was never late. Ferry riders pick the latest boat that gets them there on time; the "one boat early" variant takes the boat before that to beat the parking.
3. **Then the day plays forward** with that day's luck, and the consequences fall out of it:
   - You arrive at the Marina after the lot fills, so you drive into SF (toll plus garage).
   - You miss the planned boat, so you wait about 35 minutes.
   - You get out at 1:30 PM, or after the last boat, or the next boat is more than 45 min off: you take BART home. **If your car is at the Marina, you Lyft back for it** (the stranded car).
   - The bus is too far off, or service has ended: Lyft.
   - It rains: cyclists Lyft, or ride wet (the user decides).
4. **Scoring:** money (fares, parking, Muni, tolls, garages, and $/mile for every drive), hours (every leg, every minute on foot, every wait on a platform, pier, bus stop or Lyft pickup, and time at work before it starts), when you get home (typical = median, and the latest), late-to-work days, lot-full days, stranded cars, Lyft count. "Total" is money plus hours × the user's value of time.

## Known simplifications and next steps

- **Leg times are estimates**, in `PLAY.homes`. Better: compute them from the street graph in `js/geo.js`, the way the cartoon does its routes.
- **Bus timetables are synthetic.** Departures run at :07 + k × headway. Better: load the AC Transit GTFS feed for the 65, 51B and others.
- **Lot fill times are derived, not typed in** (bottom of `js/play-config.js`). The ferry lot fills from cars per minute: Berkeley drivers, drivers from El Cerrito, Richmond, Albany, Kensington and Emeryville, and BART parkers displaced from North Berkeley and Ashby. The BART lots use the BART Board caps for the housing projects (North Berkeley 700 → 200 spaces, Ashby 535 → 85), and fill proportionally sooner than they do today.
- **Ferry verdict.** The results test the ferry against 10 months of luck × 5 values of time ($0–$75/h). If no ferry option is ever best, they say so at the top. They also compare morning seats (8 boats × `seatsPerBoat`) with parking (lot + Marina Blvd) and name the first boat after the lot is full.
- **No overnight logic.** A stranded car is rescued the same evening. Leaving it overnight and taking a Lyft back the next morning is another option.
- **No Clipper transfer discount**, no monthly passes, no BayPass.
- **Only six home presets.** Next step: tap anywhere on the map and route from there.
- **Regional analysis:** score LEHD LODES home→work pairs with `PlaySim.runAll` to estimate how many commuters each mode serves best.
- **Cartoon tie-in:** a "watch this day" button could play the chosen day in the cartoon's scene engine.

## Sources (from the cartoon's research plus this session)

- WETA Berkeley Ferry Service Business Plan v1.0 (2022) and Board deck (Nov 2021): 2 vessels, ~35-min peak headway, 8 + 8 peak trips, ~25-min crossing, 2035 fare and subsidy.
- City of Berkeley, Pier-Ferry Draft Parking Management Implementation Plan (May 2026): 265 paid full-day stalls, overflow on Marina Blvd. No parking on University west of I-80.
- BART 2026 fare table: Downtown Berkeley ↔ Civic Center $5.30, El Cerrito Plaza ↔ Civic Center $5.70, Civic Center ↔ Embarcadero $2.55.
- MTC/BATA: Bay Bridge toll $8.50 (2026).
- AC Transit 65: about every 45 min on weekdays; 72% rider-reported on-time (Transit app).
