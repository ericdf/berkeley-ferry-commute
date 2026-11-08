'use strict';
// ============================================================================
// COMMUTER REALITY CHECK — every number the game uses lives here.
// js/play-sim.js reads this object; nothing in the sim or UI is typed in by hand.
//
//   [input]     a published price/figure (source noted)
//   [scenario]  an illustrative choice for the game; tune freely
//   [estimate]  a reasonable figure not taken from a published source; verify
//
// Times are 'H:MM' 24-hour strings or minutes. Legs given as [am, pm] are
// [outbound, return] minutes (e.g. downhill vs. uphill on a bike).
// ============================================================================
// BART stations. lot: all-day parking that fills by a time each morning (null = no BART lot).
const ST = {
  dbk:   { name: 'Downtown Berkeley', ll: [37.8701, -122.2681], rideCivic: 25,
           fare: { civic: 5.30, fidi: 5.05 }, lot: null },               // [input] civic: 2026 BART fare table
  nbk:   { name: 'North Berkeley', ll: [37.8740, -122.2834], rideCivic: 27,
           fare: { civic: 5.40, fidi: 5.15 }, lot: { fee: 3.00, stallsToday: 700, stalls: 200, fillToday: '7:35', fillSdMin: 10 } },  // [input] BART Board cap: 200 rider spaces after the housing
  ashby: { name: 'Ashby', ll: [37.8529, -122.2700], rideCivic: 23,
           fare: { civic: 5.15, fidi: 4.90 }, lot: { fee: 3.00, stallsToday: 535, stalls: 85, fillToday: '7:30', fillSdMin: 10 } },   // [input] BART Board cap: 85 rider spaces after the housing
  ecp:   { name: 'El Cerrito Plaza', ll: [37.9030, -122.2990], rideCivic: 31,
           fare: { civic: 5.70, fidi: 5.45 }, lot: { fee: 3.00, fillToday: '7:20', fillSdMin: 10 } }, // [input] civic fare
};
// lots: [estimate] $3/day; today's fill times [scenario]. Cars arrive at a steady rate from firstCar,
// so a lot with fewer stalls fills proportionally sooner (computed at the bottom of this file).
const BART_FIRST_CAR = '5:30';            // [scenario] when commuters start filling BART lots

// AC Transit Transbay F: about every 30 min all day [input]; from Salesforce Transit Center at :15/:45,
// 27 min to Ashby BART, 34 to Shattuck & Allston [input]. Toward SF, times at Shattuck & Allston are
// [estimate] :20/:50. lead = minutes after Shattuck & Allston; ride/back = minutes to/from SF from that stop.
const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const tm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const every = (a, b, step) => { const out = []; for (let t = tm(a); t <= tm(b); t += step) out.push(t); return out; };
const lineF = (lead, ride, back) => ({
  line: 'F',
  am: every('5:20', '10:20', 30).map((t) => [hm(t + lead), hm(t + lead + ride)]),
  pm: every('15:15', '20:45', 30).map((t) => [hm(t), hm(t + back)]),
});

window.PLAY = {
  days: 21,                                  // [scenario] workdays in a month

  defaults: {
    home: 'hills', dest: 'civic',
    arrive: '9:00', leave: '17:30',
    has: { car: true, bike: false, ebike: true },
    kids: true,
    strict: false,                           // a job where you can never be late
    schedule: 'normal',                      // steady | normal | chaotic
    vot: 25,                                 // [scenario] $ per hour of your time
    rainLyft: true,                          // cyclists take a Lyft when it rains
    bikeAlong: true,                         // the bike rides BART or the ferry and you ride the SF end
  },

  maxWalkMin: 45,                            // [scenario] longest walk that counts as a way to get somewhere
  strictCushionMin: 30,                      // [scenario] can't-be-late: plan to be at work this early

  // ---------------- The ferry (proposed) ----------------
  ferry: {
    // [input] WETA Berkeley Ferry Business Plan (2021–22), illustrative service:
    // 2 vessels, ~35-min peak headway, 8 AM peak trips 6:30–noon, 8 PM trips 3:30–8:30.
    // Exact times below are [scenario] placements consistent with that plan.
    amFromBerkeley: ['6:30', '7:05', '7:40', '8:15', '8:50', '9:25', '10:30', '11:45'],
    pmFromSF: ['15:30', '16:05', '16:40', '17:15', '17:50', '18:25', '19:30', '20:30'],
    seatsPerBoat: 400,                       // [estimate] WETA's current boats carry 400–445
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
      fillSdMin: 12,
      // Who parks here, cars per minute once the first boat is coming. The lot + curb fill time is
      // computed from these at the bottom of this file. [estimate]
      firstCar: '6:00',
      arrivals: {
        berkeley: 1.6,                       // Berkeley ferry riders who drive
        region: 1.4,                         // El Cerrito, Richmond, Albany, Kensington, Emeryville: the ferry is their closest boat
      },
      bartSpillShare: 0.10,                  // share of BART parkers who lose their North Berkeley / Ashby space and come here
      bartSpillWindowMin: 120,               // ...spread over the morning rush
    },
  },

  // ---------------- AC Transit Transbay buses ----------------
  transbay: {
    fare: 6.50,                              // [input] AC Transit Transbay adult fare, July 2026
    maxWaitMin: 45,                          // [scenario] a longer wait than this and you take BART instead
    stc: [37.7896, -122.3965],               // Salesforce Transit Center
  },

  // ---------------- BART ----------------
  bart: {
    stationMin: 3,                           // [scenario] street to platform, each end
    bikeParkMin: 2,                          // [scenario] lock or unlock the bike at the station
    parkMin: 4,                              // [scenario] find a space in the BART lot and pay
    waitMaxMin: 10,                          // [scenario] wait is uniform 0..this
    delayP: 0.05, delayMin: [10, 25],        // [estimate] chance per trip of a meaningful delay
    fbToEmbarcaderoMin: 8,                   // [map] Ferry Building to Embarcadero platform
  },

  // ---------------- Destinations in SF ----------------
  dests: {
    civic: {
      label: 'Civic Center', fareKey: 'civic', bartRideAdj: 0, bartWalkMin: 4,
      bikeFromFerry: 12, bikeFromBart: 2,    // [map] up Market St, 1.9 mi
      fromSTC: { min: 20, walk: 6, fare: 2.85, mode: 'muni' },   // Muni Metro from Montgomery
      ferryEgressMin: 27, ferryEgressWalkMin: 10, ferryEgressFare: 2.55, // [scenario] FB→Embarcadero→BART→Civic Center (cartoon legs); [input] 2026 fare
      garage: 30,                            // [estimate] all-day garage near Civic Center
      driveAdjMin: 0,
    },
    fidi: {
      label: 'Financial District', fareKey: 'fidi', bartRideAdj: -6, bartWalkMin: 6,
      bikeFromFerry: 4, bikeFromBart: 2,
      fromSTC: { min: 6, walk: 6, fare: 0 },
      ferryEgressMin: 8, ferryEgressFare: 0,
      garage: 38,                            // [estimate]
      driveAdjMin: -3,
    },
    soma: {                                  // 2nd & Folsom: the Google, Salesforce and startup blocks
      label: 'SoMA', fareKey: 'fidi', bartRideAdj: -7, bartWalkMin: 11,   // Embarcadero station, then walk
      bikeFromFerry: 6, bikeFromBart: 4,
      fromSTC: { min: 6, walk: 6, fare: 0 },
      ferryEgressMin: 16, ferryEgressFare: 0, // [map] Ferry Bldg down the Embarcadero and Folsom, ~0.8 mi
      garage: 32,                            // [estimate]
      driveAdjMin: -5,                       // first exits off the bridge
      ll: [37.7853, -122.3955],
    },
    mbay: {                                  // 3rd St at Chase Center: Uber, UCSF, the biotech blocks
      label: 'Mission Bay', fareKey: 'civic', bartRideAdj: -2,             // Powell St station...
      bikeFromFerry: 12, bikeFromBart: 11,   // [map] Embarcadero to Chase Center 2.1 mi; Powell down 4th St
      fromSTC: { min: 24, walk: 9, fare: 2.85, mode: 'muni' },  // walk to Yerba Buena/Moscone, the T
      bartWalkMin: 24, bartFootMin: 9, bartEgressFare: 2.85, // ...then the Central Subway T to UCSF/Chase Center. [input] Muni $2.85
      ferryEgressMin: 30, ferryEgressWalkMin: 10, ferryEgressFare: 2.85, ferryEgressMode: 'muni',  // Muni from Embarcadero down King St
      garage: 28,                            // [estimate]
      driveAdjMin: -2,                       // I-80 to the 4th St exit
      ll: [37.7680, -122.3893],
    },
  },

  // ---------------- Driving ----------------
  drive: {
    perMile: 0.30,                           // [estimate] gas + wear for an average car
    toll: 8.50,                              // [input] Bay Bridge 2026, charged westbound only
    trafficMin: [0, 15],                     // [scenario] everyday variation, each way
    bridgeMessP: 0.15, bridgeMessMin: [15, 40], // [scenario] a bad day on the bridge
    marinaToSF: { min: 28, miles: 11 },      // [estimate] fallback when the ferry lot is full
    stationToSF: { min: 28, miles: 11 },     // [estimate] fallback when the BART lot is full
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
  rainFx: {                                  // what rain does [estimate]
    trafficMin: [5, 20],                     // extra minutes on every drive, each way
    bridgeMessP: 0.35,                       // a bad bridge day is likelier (vs drive.bridgeMessP)
    lyftSurgeP: 0.6,                         // surge pricing is likelier (vs lyft.surgeP)
    walkX: 1.15,                             // walking takes 15% longer
    ferryCancelP: 0.04,                      // a storm cancels the boats for the day
  },

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
  // Positions are lat/lon. Leg minutes are door to door for that leg at commute hour, from the
  // street-route lengths that tools/build-play-geo.py prints. [estimate] unless noted.
  // bike/ebike are [to, from]; null = not a realistic option.
  // parkRide: where you'd drive and park for BART (Downtown Berkeley has no BART lot).
  homes: {
    hills: {
      label: 'Berkeley hills', sub: 'Grizzly Peak & Senior', ll: [37.8829, -122.2489],
      station: { ...ST.dbk, rescueLyft: { min: 10, cost: 14 } },
      toStation: { walk: null, bike: [14, 40], ebike: [12, 20],
                   bus: { name: 'AC Transit 65', ride: 30, headway: 45, fare: 2.50 }, // [input] ~45-min headway, ~30-min ride
                   lyft: { min: 13, cost: 21 } },
      toMarina:  { walk: null, bike: [26, 51], ebike: [21, 28],
                   bus: { name: '65 + 51B', chain: [                          // the 65 to Downtown Berkeley BART, then the 51B
                     { name: 'AC Transit 65', ride: 30, headway: 45, fare: 2.50 },
                     { name: 'AC Transit 51B', ride: 15, headway: 15, fare: 0, walkAfter: 12 } ] }, // transfer free on Clipper; 51B ends at 3rd & University
                   lyft: { min: 18, cost: 26 }, drive: { min: 20, miles: 4.9 } },        // [map] 4.9 mi, cartoon route
      parkRide: { station: ST.nbk, drive: { min: 12, miles: 2.8 } },   // [map] 2.8 mi
      driveSF: { min: 45, miles: 15 },
    },
    toaks: {
      label: 'Thousand Oaks', sub: 'Thousand Oaks & Colusa', ll: [37.89654, -122.28523],
      station: { ...ST.ecp, rescueLyft: { min: 16, cost: 20 } },
      toStation: { walk: 19, bike: [6, 9], ebike: [5, 5], bus: null, lyft: { min: 5, cost: 10 } },
      toMarina:  { walk: null, bike: [24, 27], ebike: [17, 18], bus: null,
                   lyft: { min: 14, cost: 17 }, drive: { min: 14, miles: 4.0 } },
      parkRide: { station: ST.ecp, drive: { min: 4, miles: 0.9 } },
      transbay: { line: 'FS', stop: 'Solano & Colusa', ll: [37.89135, -122.27986], walk: 2,   // [input] the FS's whole weekday schedule
                  am: [['6:10', '6:50'], ['7:52', '8:30']], pm: [['16:30', '17:35'], ['18:30', '19:24']] },
      driveSF: { min: 35, miles: 14 },
    },
    nberk: {
      label: 'North Berkeley flats', sub: 'Cedar & California', ll: [37.8775, -122.2795],
      station: { ...ST.nbk, rescueLyft: { min: 9, cost: 13 } },
      toStation: { walk: 10, bike: [4, 4], ebike: [3, 3], bus: null, lyft: { min: 5, cost: 10 } },
      toMarina:  { walk: null, bike: [16, 18], ebike: [11, 12],
                   bus: { name: 'AC Transit 51B', ride: 20, headway: 15, fare: 2.50, walkAfter: 12 },
                   lyft: { min: 10, cost: 16 }, drive: { min: 11, miles: 3.0 } },
      parkRide: { station: ST.nbk, drive: { min: 3, miles: 0.5 } },
      transbay: { line: 'FS', stop: 'Shattuck & Cedar', ll: [37.87975, -122.26905], walk: 12,  // FS times + minutes to this stop
                  am: [['6:16', '6:50'], ['7:58', '8:30']], pm: [['16:30', '17:28'], ['18:30', '19:18']] },
      driveSF: { min: 35, miles: 13 },
    },
    sixth: {
      label: 'West Berkeley', sub: '6th & University', ll: [37.86799, -122.29766],
      station: { ...ST.dbk, rescueLyft: { min: 10, cost: 14 } },
      toStation: { walk: 35, bike: [11, 11], ebike: [8, 8],
                   bus: { name: 'AC Transit 51B', ride: 12, headway: 15, fare: 2.50 }, lyft: { min: 7, cost: 12 } },
      toMarina:  { walk: 28, bike: [8, 8], ebike: [6, 6], bus: null,                     // over the I-80 bike/ped bridge
                   lyft: { min: 5, cost: 10 }, drive: { min: 5, miles: 1.2 } },
      parkRide: { station: ST.nbk, drive: { min: 6, miles: 1.3 } },
      driveSF: { min: 28, miles: 11 },
      transbay: { line: 'FS', stop: 'University & 6th', ll: [37.86970, -122.29850], walk: 2,   // FS times + minutes to this stop
                  am: [['6:27', '6:50'], ['8:09', '8:30']], pm: [['16:30', '17:15'], ['18:30', '19:05']] },
    },
    central: {
      label: 'Central Berkeley', sub: 'Dwight & Bonar', ll: [37.86159, -122.28581],
      station: { ...ST.ashby, rescueLyft: { min: 13, cost: 17 } },
      toStation: { walk: 31, bike: [9, 9], ebike: [7, 7], bus: null, lyft: { min: 7, cost: 12 } },
      toMarina:  { walk: 41, bike: [13, 14], ebike: [9, 10], bus: null,
                   lyft: { min: 10, cost: 13 }, drive: { min: 9, miles: 2.2 } },
      parkRide: { station: ST.ashby, drive: { min: 6, miles: 1.6 } },
      transbay: { stop: 'Shattuck & Dwight', ll: [37.86410, -122.26780], walk: 24, ...lineF(3, 36, 31) },
      driveSF: { min: 30, miles: 12 },
    },
    elmwood: {
      label: 'Elmwood', sub: 'Russell & Benvenue', ll: [37.85832, -122.2544],
      station: { ...ST.ashby, rescueLyft: { min: 13, cost: 17 } },
      toStation: { walk: 21, bike: [7, 7], ebike: [5, 5], bus: null, lyft: { min: 6, cost: 11 } },
      toMarina:  { walk: null, bike: [26, 27], ebike: [18, 19],
                   bus: { name: 'AC Transit 51B', ride: 35, headway: 15, fare: 2.50, walkAfter: 12 },
                   lyft: { min: 17, cost: 19 }, drive: { min: 16, miles: 4.5 } },
      parkRide: { station: ST.ashby, drive: { min: 5, miles: 1.1 } },
      transbay: { stop: 'Adeline & Russell', ll: [37.85660, -122.26850], walk: 18, ...lineF(10, 28, 25) },
      driveSF: { min: 33, miles: 12 },
    },
    south: {
      label: 'South Berkeley', sub: 'King & Ashby', ll: [37.8539, -122.27424],
      station: { ...ST.ashby, rescueLyft: { min: 13, cost: 17 } },
      toStation: { walk: 8, bike: [3, 3], ebike: [2, 2], bus: null, lyft: { min: 4, cost: 9 } },
      toMarina:  { walk: null, bike: [20, 21], ebike: [14, 15], bus: null,
                   lyft: { min: 13, cost: 16 }, drive: { min: 12, miles: 3.3 } },
      parkRide: { station: ST.ashby, drive: { min: 2, miles: 0.4 } },
      transbay: { stop: 'Ashby BART', ll: [37.85300, -122.26990], walk: 6, ...lineF(8, 30, 27) },
      driveSF: { min: 30, miles: 11 },
    },
  },

  // ---------------- The strategies ----------------
  // access: drive | bike | ebike | walk | transit (the bus) | lyft
  // via:    ferry | bart | car
  strategies: [
    { id: 'ferry_drive',       via: 'ferry', access: 'drive', label: 'Drive → Ferry' },
    { id: 'ferry_drive_early', via: 'ferry', access: 'drive', early: 1, label: 'Drive → Ferry, one boat early' },
    { id: 'ferry_ebike',       via: 'ferry', access: 'ebike', label: 'E-bike → Ferry' },
    { id: 'ferry_bike',        via: 'ferry', access: 'bike',  label: 'Bike → Ferry' },
    { id: 'ferry_walk',        via: 'ferry', access: 'walk',  label: 'Walk → Ferry' },
    { id: 'ferry_transit',     via: 'ferry', access: 'transit', label: 'Bus → Ferry' },
    { id: 'ferry_lyft',        via: 'ferry', access: 'lyft',  label: 'Lyft → Ferry' },
    { id: 'bart_drive',        via: 'bart',  access: 'drive', label: 'Drive → BART' },
    { id: 'bart_drive_early',  via: 'bart',  access: 'drive', beatLot: 1, label: 'Drive → BART before the lot fills' },
    { id: 'bart_ebike',        via: 'bart',  access: 'ebike', label: 'E-bike → BART' },
    { id: 'bart_bike',         via: 'bart',  access: 'bike',  label: 'Bike → BART' },
    { id: 'bart_walk',         via: 'bart',  access: 'walk',  label: 'Walk → BART' },
    { id: 'bart_transit',      via: 'bart',  access: 'transit', label: 'Bus → BART' },
    { id: 'bart_lyft',         via: 'bart',  access: 'lyft',  label: 'Lyft → BART' },
    { id: 'transbay',          via: 'tbus',  access: 'walk',  label: 'Transbay bus' },
    { id: 'drive_sf',          via: 'car',   access: 'drive', label: 'Drive into SF' },
  ],
};

// ---------------- Derived: when each lot fills ----------------
(function () {
  const T = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const H = (m) => { m = Math.round(m / 5) * 5; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  let displaced = 0;
  for (const s of Object.values(ST)) {
    const L = s.lot; if (!L) continue;
    if (L.stallsToday) {
      L.perMin = L.stallsToday / (T(L.fillToday) - T(BART_FIRST_CAR));      // today's arrival rate
      L.fillMean = H(T(BART_FIRST_CAR) + L.stalls / L.perMin);              // same drivers, fewer stalls
      displaced += L.stallsToday - L.stalls;
    } else L.fillMean = L.fillToday;
  }
  const F = window.PLAY.ferry.lot;
  F.arrivals.bartSpill = displaced * F.bartSpillShare / F.bartSpillWindowMin;
  F.displaced = displaced;
  F.perMin = Object.values(F.arrivals).reduce((a, b) => a + b, 0);
  F.fillMean = H(T(F.firstCar) + (F.stalls + F.curb) / F.perMin);
})();

