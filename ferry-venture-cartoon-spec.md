# Browser Cartoon Specification: The Berkeley Ferry Commute

## Purpose

Create a short, browser-based cartoon that makes the proposed Berkeley ferry commute legible as a complete trip, door to door. The story follows one driver from a home near Grizzly Peak and Senior Road to an office near Civic Center in San Francisco, then back home after work. It should show the ferry trip in context with the driving, parking, waiting, walking, and BART legs required to use it.

The piece is an advocacy explainer about the ferry venture and its tradeoffs. It should be pointed and memorable, while keeping route geometry, time accounting, costs, and environmental estimates transparent. The visual joke should emerge from the journey and its logistics rather than from fabricated facts.

## Deliverable

Build a self-contained browser experience that can be opened locally and played from beginning to end. Use a cartoon / animated editorial illustration style, not a realistic driving simulator. The user should be able to start, pause, replay, and skip between the morning and evening sequences. It should run in a current desktop browser and adapt to a narrow mobile screen.

Target viewing time: **about 2–3 minutes**, with an absolute cap of 4 minutes for the default playthrough. The journey represents realistic elapsed time through accelerated cinematic cuts. Do not make the viewer watch every second of traffic, waiting, sailing, train travel, or walking.

## Project research and map source

Before implementation, inspect the maps and relevant geographic assets in the user's `grand-theft-parking-berkeley` project. Use those maps as the geographic reference for Berkeley streets, the Marina, and the surrounding shoreline. Reuse or adapt suitable project assets where the license and project conventions permit, and retain required attribution.

- Do not substitute a generic San Francisco map or invent Berkeley street geometry.
- Trace the route through the actual street network from **Grizzly Peak Boulevard at Senior Road** to **University Avenue**, then into the Berkeley Marina and the proposed new pier/ferry terminal location.
- Use actual orientation and shoreline geometry. When the camera faces west or southwest from the hills or Marina, keep the Bay and the San Francisco skyline/shoreline outline visible in the distance. Establish a consistent horizon so viewers can tell which way the car is headed.
- The proposed pier and terminal should be visibly identified as proposed. Do not imply that a new terminal already exists.
- If the project maps do not show a route, terminal footprint, or useful elevation, identify the gap and use clearly labeled, minimal supplementary data. Do not pretend an illustrative route is surveyed or navigation-grade.

## Story and sequence

### Opening card — the whole trip

Open on a compact title and a small regional map connecting the Berkeley hills, the Marina, San Francisco's Ferry Building, and Civic Center. Introduce the driver and their large, fuel-hungry SUV (a generic Land Rover-like vehicle; avoid implying a specific owner's real commute). Caption the vehicle class as an illustrative assumption.

Show a digital clock in the **upper-right corner** throughout the trip. It is the master clock and advances continuously, including during cuts and waiting. Use a readable 12-hour time with AM/PM. The trip begins at a clearly stated illustrative weekday morning time; select a plausible start time that makes the office arrival realistic, and make the start time easy to change in the source.

### Morning: hills to the Marina

1. Start at **Grizzly Peak Boulevard and Senior Road**. Show a recognizable hilltop / ridge view, with the Bay and San Francisco visible whenever the camera faces that direction.
2. The driver heads toward University Avenue and the Marina, following the real street network in the map reference.
3. Show the SUV negotiating traffic and stopping at a representative set of traffic lights and stop signs. Use a few cuts and short motion snippets to convey the route; do not animate every block or every signal.
4. The clock must account for plausible traffic delay. Compress screen time, not the elapsed journey. Add brief captions such as “traffic,” “red light,” or “stop sign” at selected moments, with the clock jumping forward by the modeled delay.
5. At University Avenue, show the turn toward the Marina and the approach to the proposed terminal / pier.
6. Show the driver entering the Marina, parking in the proposed terminal parking area, and paying to park. Label the parking fee and duration as assumptions unless grounded in a supplied source.
7. The driver waits **20 minutes** before boarding. Make the full 20-minute wait explicit in the clock and in a caption, but represent it with a short visual cut (for example, changing light, a loading animation, or a watch/phone check).

### Ferry crossing and San Francisco arrival

8. Show boarding and departure from the proposed Berkeley terminal. Clearly distinguish time spent boarding / departure from time underway if both are modeled.
9. Animate a short, legible crossing of the Bay toward the Ferry Building. Keep Berkeley and San Francisco in their correct relative directions. Avoid implying a straight-line route if the actual or proposed route differs; follow project material if it exists, otherwise label the sailing path as illustrative.
10. The ferry arrives at the Ferry Building. The digital clock continues to advance through sailing, docking, and disembarking.
11. The driver walks to BART, enters the station, rides to Civic Center, exits, and walks into an office building. Mark station access, train, and final walk as distinct but brisk beats.
12. At the office door, freeze briefly on a summary card that reports:
    - departure time from home;
    - office arrival time;
    - total door-to-door morning elapsed time;
    - time actually in motion, broken down by car, ferry, BART, and walking;
    - waiting / parking / boarding / transfer time;
    - total time in transit, with the definition stated (sum of movement legs; show waiting separately).

### Evening: return and missed pickup

13. Cut forward to the end of the workday. Use a clear **“Later that day”** intertitle; the clock jumps to the evening departure from the office or the time the driver reaches the Ferry Building.
14. Reverse the transit chain: walk to Civic Center BART, ride to the Ferry Building, walk to the terminal, board the ferry, and cross back to Berkeley. The ferry should arrive at the Berkeley terminal before the driver returns to the car.
15. The driver walks from the terminal to the SUV, exits the Marina, and drives toward home via Hopkins Street.
16. At Hopkins, show that the driver wants to pick up food but finds no available curbside parking at the relevant stop. The established Class IV cycle tracks are shown clearly in the street scene. Do not depict the cycle tracks as a universal cause of unavailable parking; stage this as the scenario's specific search outcome and label it as a modeled / illustrative condition.
17. Show a short, legible search for parking and the driver ultimately parking **one mile away**. State whether the mile is one-way walking distance or a mile-away location; default to a one-mile walk each way if that is what the source scenario intends, and make the distance explicit onscreen.
18. The driver walks to the food pickup location, cannot make the pickup because the parking / access scenario has defeated the errand (or completes it only if the story's chosen version explicitly says so), walks back to the SUV, and drives home. Use time jumps for both walks; do not make the audience watch the entire walk.
19. At home, stop the master clock and show a final return summary:
    - evening departure / return-home times;
    - total evening door-to-door elapsed time;
    - total movement time and total waiting / parking-search / errand time;
    - total round-trip elapsed time from home departure to home return;
    - aggregate time in motion across both days' commute legs (clearly indicate it is the same-day round trip);
    - the extra cost and time attributable to the illustrative one-mile-away parking detour / walk, shown separately from the baseline ferry commute.

## Timing and cinematic pacing

The digital clock is authoritative. Every scene cut, skip, and intertitle must preserve elapsed time. The audience should understand the difference between:

- **screen time**: the few minutes it takes to watch the cartoon;
- **elapsed clock time**: actual modeled time between departure and arrival;
- **time in motion**: driving, sailing, riding BART, and walking;
- **waiting / access time**: traffic delay, signal stops, parking, the 20-minute wait, boarding, transfers, parking search, and pickup-related delay.

Implement the trip as a sequence of timed events with editable durations, rather than tying the clock to animation frame count. Scene animations can be accelerated or cut away, but elapsed-time values must remain stable if playback speed changes. Provide a compact progress bar or chapter markers for “Hills,” “Marina,” “Ferry,” “BART,” “Office,” “Return,” and “Home.”

## Cost and environmental estimates

Show estimates as estimates, with their inputs visible in a compact “How we estimated this” panel. Do not present uncertain operating assumptions as observed outcomes.

### Fuel cost

- Estimate the SUV's fuel use from a selectable, clearly named vehicle class or model and a stated real-world or EPA fuel economy assumption.
- Compute road distance from the route geometry or a documented routing estimate. Include both morning and evening vehicle miles, including any extra evening driving caused by the Hopkins parking search if modeled.
- Use a clearly dated gasoline price input. Display gallons and fuel cost separately; use fuel cost for the car only, not as a proxy for total commute cost.
- Do not silently choose a premium fuel price or a particular Land Rover trim. If a model is selected, cite the source for its fuel economy and fuel type.
- Show parking and ferry fares separately if included. Do not imply they are fuel costs.

### Environmental impact

Report tailpipe greenhouse gas emissions from the SUV separately from an optional broader trip estimate. For the broader estimate, include only components with defensible inputs: vehicle fuel, ferry passenger emissions under an explicit allocation method, BART passenger emissions under an explicit method, and any other included travel. State whether emissions are tailpipe CO2 or CO2e and avoid mixing those labels.

- Show SUV gallons burned and estimated tailpipe emissions.
- If ferry emissions are estimated, disclose whether emissions are divided by passenger count, passenger capacity, or another allocation basis. Mark the number as highly scenario-dependent when load factor and vessel data are unknown.
- If BART emissions are included, cite the per-passenger-mile or equivalent factor and identify the factor's year/source.
- Provide a comparison only when using the same boundary and units for both alternatives. If a comparison commute (for example, a direct drive or a different transit option) is not sourced or modeled, do not invent a numerical “savings” claim.
- Prefer a range when important inputs are uncertain. Include a short note that the cartoon's selected vehicle, traffic conditions, ferry operating details, and parking outcome are scenario assumptions.

## Visual and interaction requirements

- Cartoon editorial style with expressive but non-photorealistic characters and vehicles; readable at typical laptop size.
- The SUV should look conspicuously large and fuel-intensive without using a real brand logo. A “Land Rover-like” silhouette is acceptable.
- The Bay and San Francisco outline must appear in background shots whenever the camera points toward them, especially at the hills, Marina, and ferry crossing. Do not show the City inland or on the wrong side of the Bay.
- Keep the upper-right digital clock visible, high contrast, and unobstructed in every scene. On mobile, reposition it without hiding the route or captions.
- Keep place names, clock changes, fare/cost numbers, and trip summaries large enough to read. Use captions and motion cues so the story still makes sense with sound off.
- Give the viewer controls to play/pause, restart, change playback speed, and jump to the morning / evening chapter. Speed changes affect animation only; the modeled clock and totals remain the same.
- Include a concise assumptions / sources drawer and an accessible text transcript of the scene sequence and final figures.

## Data, implementation, and auditability

- Keep route geometry, travel durations, costs, vehicle assumptions, and emissions factors in a single editable data/config object rather than burying numbers in animation code.
- Derive all displayed totals from that configuration. Do not manually type a summary total that can disagree with the scene clock.
- Make each event carry a start time, duration, location, movement/wait classification, and caption. Use this event list to generate the master clock and summaries.
- Separate sourced values from illustrative scenario inputs in the interface and code comments.
- Cite data sources in the assumptions drawer with links and retrieval / publication dates where appropriate.
- Add an end-card disclosure that this is an illustrative scenario, not a prediction of service performance or a claim that every trip will experience identical traffic, parking, or transfer conditions.

## Acceptance criteria

1. The complete default playthrough is about 2–3 minutes and remains under 4 minutes.
2. The full route visibly begins at Grizzly Peak Boulevard and Senior Road, follows Berkeley's real street layout toward University Avenue and the Marina, crosses the Bay, connects through the Ferry Building and BART to Civic Center, and returns through Hopkins to the hills.
3. A visible digital clock in the upper right advances correctly through every modeled event, including explicit traffic time and the 20-minute Marina wait.
4. The morning office arrival has a door-to-door summary and a breakdown of movement versus waiting/access time.
5. The evening ferry return, Hopkins parking-search scenario, one-mile-away parking, walks, and home arrival are shown with the elapsed time included.
6. Fuel use and cost are reproducible from displayed assumptions. Environmental estimates clearly state their boundary, units, sources, and uncertainty.
7. The Bay and San Francisco remain geographically plausible and visible in relevant west-facing shots.
8. The viewer can pause, replay, change animation speed, and jump between chapters without corrupting clock totals.
9. The `grand-theft-parking-berkeley` map project is inspected and acknowledged in implementation notes, including any map assets reused and any gaps that required illustrative assumptions.
