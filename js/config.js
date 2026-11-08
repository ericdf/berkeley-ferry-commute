'use strict';
// ============================================================================
// EVERY NUMBER IN THE CARTOON LIVES HERE.
// The clock, the captions' time jumps and every summary total are computed from
// this object by js/timeline.js. Change a value, reload, and everything follows.
//
//   [scenario]  an illustrative choice for this story
//   [input]     a price or factor you supplied or that comes from a public figure
//   [map]       measured from the street/shoreline geometry in js/geo.js
// ============================================================================
window.CFG = {
  startTime: '7:05 AM',            // [scenario] leaves home
  officeLeaves: '5:15 PM',         // [scenario] leaves the office

  vehicle: {
    name: 'Large SUV',             // [scenario] generic, Land Rover-ish; no particular make
    mpg: 17,                       // [scenario] real-world combined mpg for a big SUV
    mpgRange: [14, 20],            // [scenario] for the low/high fuel & CO2 range
  },
  gasPrice: 6.50,                  // [input] $/gal
  co2KgPerGallon: 8.887,           // [input] tailpipe CO2 per gallon of gasoline (EPA)

  parkingFee: 8,                   // [input] terminal lot, all day
  ferryFare: 6.74,                 // [input] WETA's projected 2035 Berkeley–SF fare, each way
  ferrySubsidy: 6.35,              // [input] WETA's projected 2035 public subsidy per boarding.
                                   //         WETA proposes Berkeley cover the operating gap (Marina hotel-tax surcharge).
  bartFare: 2.50,                  // [scenario] Embarcadero <-> Civic Center, each way

  // Average moving speeds by street class, mph [scenario]. Stops and traffic are separate events.
  carMph: { 'Principal Arterial': 21, 'Major Collector': 20, 'Local': 16 },
  walkMph: 3.0,                    // [scenario]
  sailMin: 30,                     // [scenario] Berkeley -> Ferry Building, underway
  bartRideMin: 7,                  // [scenario] Embarcadero -> Civic Center, 3 stops

  // Pizza: steaming at the counter, cooling in its box (Newton's law; illustrative)
  pizza: { hotF: 185, roomF: 60, perMin: 0.06, steamyAboveF: 140, coldBelowF: 95 },
};

// ----------------------------------------------------------------------------
// THE TRIP, as an ordered list of events. Each one has:
//   ch      chapter marker      scene   which picture to draw
//   kind    'move' (in motion) | 'wait' (waiting/access) | 'errand' (the pizza detour)
//           | 'card' (summary freeze, clock stopped) | 'work' (the workday, skipped)
//   mode    car | walk | ferry | bart (for 'move' and moving errands)
//   min     minutes on the clock   — or computed from a route distance:
//   route + to   drive/walk a GEO route to a cross street, a metre mark, or 'end'
//   m       metres (walk legs not on the street map)
//   ss      screen seconds at 1x speed
//   cap     caption; {d} is replaced by the leg's distance, {min} by its minutes
// ----------------------------------------------------------------------------
CFG.events = [
  // ---------------- MORNING ----------------
  { ch: 'Hills', scene: 'title', kind: 'card', ss: 8, cap: 'One commute, door to door, using the proposed Berkeley ferry.' },
  { ch: 'Hills', scene: 'hills', kind: 'move', mode: 'car', route: 'am', to: 'Euclid Ave', ss: 7,
    cap: 'Grizzly Peak Blvd at Senior Ave. The Bay and San Francisco are out west, about 10 miles away. Down the hill.' },
  { scene: 'map', kind: 'wait', min: 1, vig: 'stop', ss: 2.5, cap: 'Stop signs on the hill streets: about 1 minute in all.' },
  { scene: 'map', kind: 'move', mode: 'car', route: 'am', to: 'University Ave', ss: 4, cap: 'Cedar, then Shattuck to University Ave.' },
  { scene: 'map', kind: 'wait', min: 1.5, vig: 'light', ss: 2.5, cap: 'Red light: University at Shattuck.' },
  { scene: 'map', kind: 'move', mode: 'car', route: 'am', to: 'MLK Jr Way', ss: 2, cap: 'West on University Ave.' },
  { scene: 'map', kind: 'wait', min: 4, vig: 'traffic', ss: 3, cap: 'Traffic on University: 4 minutes.' },
  { scene: 'map', kind: 'move', mode: 'car', route: 'am', to: 'Sacramento St', ss: 2, cap: 'West on University Ave.' },
  { scene: 'map', kind: 'wait', min: 1, vig: 'light', ss: 2, cap: 'Red light: Sacramento St.' },
  { scene: 'map', kind: 'move', mode: 'car', route: 'am', to: 'San Pablo Ave', ss: 2, cap: 'West on University Ave.' },
  { scene: 'map', kind: 'wait', min: 1.5, vig: 'light', ss: 2.5, cap: 'Red light: San Pablo Ave.' },
  { scene: 'map', kind: 'move', mode: 'car', route: 'am', to: 'end', ss: 4, cap: 'Under I-80 and out University to the Marina.' },

  { ch: 'Marina', scene: 'marina', kind: 'wait', min: 4, ss: 4.5, act: 'park',
    cap: 'Find a space in the terminal lot and pay: ${parking} for the day.' },
  { scene: 'marina', kind: 'move', mode: 'walk', m: 430, ss: 3, act: 'walkPier', cap: 'Walk out the proposed 1,080-ft pier to the boat: {d}, {min} min.' },
  { scene: 'wait', kind: 'wait', min: 20, ss: 4, cap: 'Wait for the boat: 20 minutes.' },

  { ch: 'Ferry', scene: 'board', kind: 'wait', min: 5, ss: 2.5, cap: 'Boarding and departure: 5 minutes.' },
  { scene: 'crossing', kind: 'move', mode: 'ferry', route: 'ferry', ss: 8, cap: 'Across the Bay, west of Treasure Island, to the Ferry Building: {d}, {min} min underway.' },
  { scene: 'ferrybldg', kind: 'wait', min: 5, ss: 2, act: 'dock', cap: 'Docking and getting off: 5 minutes.' },

  { ch: 'BART', scene: 'ferrybldg', kind: 'move', mode: 'walk', m: 400, ss: 3, act: 'walkBart', cap: 'Walk to Embarcadero BART: {d}, {min} min.' },
  { scene: 'bart', kind: 'wait', min: 3, ss: 2, act: 'gates', cap: 'Down to the platform, through the fare gates: 3 minutes.' },
  { scene: 'bart', kind: 'wait', min: 5, ss: 2.5, act: 'platform', cap: 'Wait for a train: 5 minutes.' },
  { scene: 'bart', kind: 'move', mode: 'bart', min: 'bartRideMin', route: 'bart', ss: 4, act: 'ride', cap: 'BART to Civic Center: {d}, {min} min.' },
  { scene: 'bart', kind: 'wait', min: 3, ss: 2, act: 'exit', cap: 'Up and out of Civic Center station: 3 minutes.' },

  { ch: 'Office', scene: 'office', kind: 'move', mode: 'walk', m: 250, ss: 3, cap: 'Walk to the office: {d}, {min} min.' },
  { scene: 'office', kind: 'card', card: 'am', ss: 10, cap: 'At the office door.' },

  // ---------------- EVENING ----------------
  { ch: 'Return', scene: 'later', kind: 'work', until: 'officeLeaves', ss: 3, cap: 'Later that day…' },
  { scene: 'office', kind: 'move', mode: 'walk', m: 250, ss: 1.5, rev: true, cap: 'Back to Civic Center BART: {d}, {min} min.' },
  { scene: 'bart', kind: 'wait', min: 8, ss: 2, act: 'platform', cap: 'Station, fare gates and a train: 8 minutes.' },
  { scene: 'bart', kind: 'move', mode: 'bart', min: 'bartRideMin', route: 'bart', ss: 2.5, act: 'ride', rev: true, cap: 'BART to Embarcadero: {min} min.' },
  { scene: 'bart', kind: 'wait', min: 3, ss: 1.2, act: 'exit', cap: 'Up to the street: 3 minutes.' },
  { scene: 'ferrybldg', kind: 'move', mode: 'walk', m: 400, ss: 1.5, act: 'walkBart', rev: true, cap: 'Walk to the Ferry Building: {min} min.' },
  { scene: 'wait', kind: 'wait', min: 15, ss: 3, eve: true, cap: 'Just missed one. Wait for the next boat: 15 minutes.' },
  { scene: 'board', kind: 'wait', min: 5, ss: 2.5, eve: true, cap: 'Boarding and departure: 5 minutes.' },
  { scene: 'crossing', kind: 'move', mode: 'ferry', route: 'ferry', rev: true, ss: 6, cap: 'Back across the Bay to the proposed Berkeley terminal: {min} min.' },
  { scene: 'marina', kind: 'wait', min: 5, ss: 2, act: 'arrive', cap: 'Docking and getting off: 5 minutes.' },
  { scene: 'marina', kind: 'move', mode: 'walk', m: 430, ss: 1.5, act: 'walkBack', cap: 'Walk back down the pier to the SUV: {min} min.' },
  { scene: 'marina', kind: 'wait', min: 2, ss: 1.2, act: 'leave', cap: 'Out of the lot: 2 minutes.' },
  { scene: 'map', kind: 'move', mode: 'car', route: 'pm', to: 'San Pablo Ave', ss: 2.5, cap: 'East on University Ave. Pizza sounds good. Gioia, on Hopkins.' },
  { scene: 'map', kind: 'wait', min: 5, vig: 'traffic', ss: 3, cap: 'Evening traffic on University: 5 minutes.' },
  { scene: 'map', kind: 'move', mode: 'car', route: 'pm', to: 'end', ss: 3, cap: 'Sacramento St to Hopkins St.' },

  { scene: 'hopkins', kind: 'errand', mode: 'car', route: 'search', to: 'Rose St', ss: 7,
    cap: 'Hopkins St: Class IV cycle tracks, and no open curb space near Gioia. Circle the blocks.' },
  { scene: 'map', kind: 'errand', mode: 'car', route: 'search', to: 'end', ss: 3.5, cap: 'Keep looking… a space, 1.0 mile away up Rose St.' },
  { scene: 'map', kind: 'errand', min: 1, ss: 1.5, cap: 'Park.' },
  { scene: 'walk', kind: 'errand', mode: 'walk', route: 'walk', to: 'end', ss: 4, cap: 'Walk back down to Gioia: {d}, {min} min.' },
  { scene: 'pizza', kind: 'errand', min: 6, ss: 4, cap: 'Order up. One pizza, steaming hot.', pizzaStart: true },
  { scene: 'walk', kind: 'errand', mode: 'walk', route: 'walk', to: 'end', rev: true, ss: 4.5, pizza: true, cap: 'Walk the mile back to the SUV: {min} min. The pizza is cooling.' },
  { ch: 'Home', scene: 'map', kind: 'move', mode: 'car', route: 'home', to: 'Euclid Ave', ss: 2, pizza: true, cap: 'Drive home up the hill.' },
  { scene: 'map', kind: 'wait', min: 1, vig: 'stop', ss: 2, pizza: true, cap: 'Stop signs: about 1 minute.' },
  { scene: 'map', kind: 'move', mode: 'car', route: 'home', to: 'end', ss: 3, pizza: true, cap: 'Up to Grizzly Peak Blvd.' },
  { scene: 'home', kind: 'card', card: 'pm', ss: 11, pizza: true, cap: 'Home. The pizza is cold.' },
  { scene: 'end', kind: 'card', card: 'end', ss: 9, cap: 'What the day cost.' },
];
