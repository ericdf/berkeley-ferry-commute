'use strict';
// ============================================================================
// PLAY A MONTH — every number the game uses lives here.
// js/play-sim.js reads this object; nothing in the sim or UI is typed in by hand.
//
//   [input]     a published price/figure (source noted)
//   [scenario]  an illustrative choice for the game; tune freely
//   [estimate]  a reasonable figure not taken from a published source; verify
//
// Times are 'H:MM' 24-hour strings or minutes. Legs given as [am, pm] are
// [outbound, return] minutes (e.g. downhill vs. uphill on a bike).
// ============================================================================
window.PLAY = {
  days: 21,                                  // [scenario] workdays in a month

  defaults: {
    home: 'hills', dest: 'civic',
    arrive: '9:00', leave: '17:30',
    has: { car: true, bike: false, ebike: true },
    kids: true,
    schedule: 'normal',                      // steady | normal | chaotic
    vot: 25,                                 // [scenario] $ per hour of your time
    rainLyft: true,                          // cyclists take a Lyft when it rains
  },

  // ---------------- The ferry (proposed) ----------------
  ferry: {
    // [input] WETA Berkeley Ferry Business Plan (2021–22), illustrative service:
    // 2 vessels, ~35-min peak headway, 8 AM peak trips 6:30–noon, 8 PM trips 3:30–8:30.
    // Exact times below are [scenario] placements consistent with that plan.
    amFromBerkeley: ['6:30', '7:05', '7:40', '8:15', '8:50', '9:25', '10:30', '11:45'],
    pmFromSF: ['15:30', '16:05', '16:40', '17:15', '17:50', '18:25', '19:30', '20:30'],
    boardMin: 5, sailMin: 30, dockMin: 5,    // [scenario] same as the cartoon (js/config.js)
    fare: 6.74,                              // [input] WETA projected 2035 fare, each way
    pierWalkMin: 5,                          // [map] lot to the end of the 1,080-ft pier
    bikeToPierMin: 2,
    parkMin: 4,                              // [scenario] find a space and pay
    bufferMin: 5,                            // [scenario] planned slack before boarding
    maxWaitBeforeBart: 45,                   // [scenario] longer than this, you take BART instead
    lot: {
      fee: 8,                                // [input] all-day ferry parking, $8
      stalls: 265,                           // [input] City of Berkeley draft Parking Mgmt Plan, May 2026
      curb: 50,                              // [estimate] usable Marina Blvd curb; none on University west of I-80
      fillMean: '7:25',                      // [scenario] lot + curb full; riders from Albany, El Cerrito,
      fillSdMin: 12,                         //            Kensington, Emeryville compete for the same stalls
    },
  },

  // ---------------- BART ----------------
  bart: {
    stationMin: 3,                           // [scenario] street to platform, each end
    waitMaxMin: 10,                          // [scenario] wait is uniform 0..this
    delayP: 0.05, delayMin: [10, 25],        // [estimate] chance per trip of a meaningful delay
    fbToEmbarcaderoMin: 8,                   // [map] Ferry Building to Embarcadero platform
  },

  // ---------------- Destinations in SF ----------------
  dests: {
    civic: {
      label: 'Civic Center', fareKey: 'civic', bartRideAdj: 0, bartWalkMin: 4,
      ferryEgressMin: 27, ferryEgressFare: 2.55, // [scenario] FB→Embarcadero→BART→Civic Center (cartoon legs); [input] 2026 fare
      garage: 30,                            // [estimate] all-day garage near Civic Center
      driveAdjMin: 0,
    },
    fidi: {
      label: 'Financial District', fareKey: 'fidi', bartRideAdj: -6, bartWalkMin: 6,
      ferryEgressMin: 8, ferryEgressFare: 0,
      garage: 38,                            // [estimate]
      driveAdjMin: -3,
    },
  },

  // ---------------- Driving ----------------
  drive: {
    perMile: 0.30,                           // [estimate] gas + wear for an average car
    toll: 8.50,                              // [input] Bay Bridge 2026, charged westbound only
    trafficMin: [0, 15],                     // [scenario] everyday variation, each way
    bridgeMessP: 0.15, bridgeMessMin: [15, 40], // [scenario] a bad day on the bridge
    marinaToSF: { min: 28, miles: 11 },      // [estimate] fallback when the lot is full
    garageWalkMin: 5,
  },

  lyft: {
    waitMin: 5, surgeP: 0.2, surgeX: 1.4, surgeWaitMin: 5,  // [scenario]
  },

  bus: {
    walkToStopMin: 3,
    maxWaitMin: 15,                          // [scenario] morning: longer than this, you call a Lyft
    pmMaxWaitMin: 30,                        // [scenario] evening: you'll wait a bit longer to get home
    lateP: 0.28, lateMin: [5, 15],           // [input] Transit app: 72% of 65 riders report on time
    serviceEnds: '19:30',                    // [estimate] last useful evening bus in the hills/Marina
  },

  bikePerDay: { bike: 0.30, ebike: 1.00 },   // [estimate] wear, charging, amortized purchase
  rainP: 0.12,                               // [estimate] share of workdays wet enough to matter

  // ---------------- Life happens ----------------
  // Probabilities per workday, by how predictable your schedule is.
  life: {
    steady:  { runLateP: 0.10, lateMeetingP: 0.06, leaveEarlyP: 0.01, leaveEarlyKidsP: 0.03 },
    normal:  { runLateP: 0.20, lateMeetingP: 0.12, leaveEarlyP: 0.02, leaveEarlyKidsP: 0.05 },
    chaotic: { runLateP: 0.30, lateMeetingP: 0.22, leaveEarlyP: 0.03, leaveEarlyKidsP: 0.08 },
    runLateMin: [5, 15],                     // [scenario] out the door this much late
    lateMeetingMin: [45, 120],               // [scenario] leave work this much later
    leaveEarlyWindow: ['12:30', '15:00'],    // [scenario] "the school called"
  },

  // ---------------- Where you live ----------------
  // Positions are lat/lon. Leg minutes are door to door for that leg at commute hour.
  // [estimate] unless noted. bike/ebike are [to, from]; null = not a realistic option.
  homes: {
    hills: {
      label: 'Berkeley hills', sub: 'Grizzly Peak & Senior', ll: [37.8829, -122.2489],
      station: { name: 'Downtown Berkeley', ll: [37.8701, -122.2681], rideCivic: 25,
                 fare: { civic: 5.30, fidi: 5.05 },      // [input] civic: 2026 BART fare table
                 rescueLyft: { min: 10, cost: 14 } },
      toStation: { walk: null, bike: [14, 40], ebike: [12, 20],
                   bus: { name: 'AC Transit 65', ride: 30, headway: 45, fare: 2.50 }, // [input] ~45-min headway, ~30-min ride
                   lyft: { min: 13, cost: 21 } },
      toMarina:  { walk: null, bike: [25, 50], ebike: [20, 28],
                   bus: { name: '65 + 51B', ride: 50, headway: 45, fare: 2.50 },
                   lyft: { min: 18, cost: 26 }, drive: { min: 20, miles: 4.9 } },        // [map] 4.9 mi, cartoon route
      driveSF: { min: 45, miles: 15 },
    },
    nberk: {
      label: 'North Berkeley flats', sub: 'Cedar & California', ll: [37.8775, -122.2795],
      station: { name: 'North Berkeley', ll: [37.8740, -122.2834], rideCivic: 27,
                 fare: { civic: 5.40, fidi: 5.15 }, rescueLyft: { min: 9, cost: 13 } },
      toStation: { walk: 10, bike: [4, 4], ebike: [3, 3], bus: null, lyft: { min: 5, cost: 10 } },
      toMarina:  { walk: null, bike: [15, 17], ebike: [11, 12],
                   bus: { name: 'AC Transit 51B', ride: 20, headway: 25, fare: 2.50 },
                   lyft: { min: 10, cost: 16 }, drive: { min: 11, miles: 3.0 } },
      driveSF: { min: 35, miles: 13 },
    },
    westb: {
      label: 'West Berkeley', sub: '5th & Virginia', ll: [37.8722, -122.2997],
      station: { name: 'Downtown Berkeley', ll: [37.8701, -122.2681], rideCivic: 25,
                 fare: { civic: 5.30, fidi: 5.05 }, rescueLyft: { min: 10, cost: 14 } },
      toStation: { walk: 35, bike: [11, 12], ebike: [8, 9],
                   bus: { name: 'AC Transit 51B', ride: 15, headway: 15, fare: 2.50 },
                   lyft: { min: 8, cost: 12 } },
      toMarina:  { walk: 22, bike: [8, 8], ebike: [6, 6], bus: null,
                   lyft: { min: 6, cost: 11 }, drive: { min: 6, miles: 1.5 } },
      driveSF: { min: 30, miles: 11 },
    },
    albany: {
      label: 'Albany', sub: 'Solano Ave', ll: [37.8907, -122.2930],
      station: { name: 'El Cerrito Plaza', ll: [37.9030, -122.2990], rideCivic: 31,
                 fare: { civic: 5.70, fidi: 5.45 },      // [input] civic: 2026 BART fare table
                 rescueLyft: { min: 12, cost: 18 } },
      toStation: { walk: 15, bike: [6, 6], ebike: [5, 5], bus: null, lyft: { min: 6, cost: 11 } },
      toMarina:  { walk: null, bike: [22, 24], ebike: [15, 16], bus: null,
                   lyft: { min: 12, cost: 18 }, drive: { min: 12, miles: 3.6 } },
      driveSF: { min: 35, miles: 14 },
    },
  },


  // ---------------- The strategies ----------------
  // access: drive | bike | ebike | transit (bus, or walk if close) | lyft
  // via:    ferry | bart | car
  strategies: [
    { id: 'ferry_drive',       via: 'ferry', access: 'drive', label: 'Drive → Ferry' },
    { id: 'ferry_drive_early', via: 'ferry', access: 'drive', early: 1, label: 'Drive → Ferry, one boat early' },
    { id: 'ferry_ebike',       via: 'ferry', access: 'ebike', label: 'E-bike → Ferry' },
    { id: 'ferry_bike',        via: 'ferry', access: 'bike',  label: 'Bike → Ferry' },
    { id: 'ferry_transit',     via: 'ferry', access: 'transit', label: 'Bus → Ferry' },
    { id: 'ferry_lyft',        via: 'ferry', access: 'lyft',  label: 'Lyft → Ferry' },
    { id: 'bart_ebike',        via: 'bart',  access: 'ebike', label: 'E-bike → BART' },
    { id: 'bart_bike',         via: 'bart',  access: 'bike',  label: 'Bike → BART' },
    { id: 'bart_transit',      via: 'bart',  access: 'transit', label: 'Bus → BART' },
    { id: 'bart_lyft',         via: 'bart',  access: 'lyft',  label: 'Lyft → BART' },
    { id: 'drive_sf',          via: 'car',   access: 'drive', label: 'Drive into SF' },
  ],
};
