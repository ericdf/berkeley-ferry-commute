'use strict';
// ============================================================================
// COMMUTER REALITY CHECK — the simulation. Pure functions, no DOM, so it runs in node too:
//   node -e 'global.window={};require("./js/play-config.js");require("./js/play-sim.js");
//            console.log(window.PlaySim.runAll(window.PLAY.defaults, 42).map(r=>[r.label,r.totals]))'
//
// Every strategy lives through the SAME 21 days of luck (same late mornings,
// same late meetings, same rain, same lot-fill times), so the comparison is fair.
// ============================================================================
(function () {
  const P = () => window.PLAY;

  // ---------- time ----------
  const T = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const fmt = (min) => {
    min = Math.round(min);
    let h = Math.floor(min / 60), m = ((min % 60) + 60) % 60;
    const ap = h >= 12 && h < 24 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
  };
  const money = (x) => '$' + x.toFixed(2);

  // ---------- seeded randomness ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One month of luck. Every number is drawn in a fixed order, used or not,
  // so changing one setting never reshuffles the rest of the month.
  function drawLuck(profile, seed) {
    const C = P(), r = mulberry32(seed), L = C.life[profile.schedule] || C.life.normal;
    const uni = ([a, b]) => a + r() * (b - a);
    const gate = (p, v) => (r() < p ? v : 0);
    const normal = () => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const days = [];
    for (let i = 0; i < C.days; i++) {
      const runLateV = uni(C.life.runLateMin), runLate = gate(L.runLateP, runLateV);
      const earlyV = uni(C.life.leaveEarlyWindow.map(T));
      const earlyHit = r() < (profile.kids ? L.leaveEarlyKidsP : L.leaveEarlyP);
      const meetV = uni(C.life.lateMeetingMin), meetHit = r() < L.lateMeetingP;
      const rain = r() < C.rainP;
      const lotFill = T(C.ferry.lot.fillMean) + normal() * C.ferry.lot.fillSdMin;
      const bartWait = [r() * C.bart.waitMaxMin, r() * C.bart.waitMaxMin];
      const bartDelay = [uni(C.bart.delayMin), uni(C.bart.delayMin)].map((v) => gate(C.bart.delayP, v));
      const busLate = [uni(C.bus.lateMin), uni(C.bus.lateMin)].map((v) => gate(C.bus.lateP, v));
      // Rain changes the odds, not the order of the draws: surge and bridge trouble are likelier,
      // and every drive gets a rain slowdown on top of everyday traffic.
      const R = C.rainFx, surgeP = rain ? R.lyftSurgeP : C.lyft.surgeP, bridgeP = rain ? R.bridgeMessP : C.drive.bridgeMessP;
      const surge = [r() < surgeP, r() < surgeP];
      const traffic = [uni(C.drive.trafficMin), uni(C.drive.trafficMin)];
      const bridge = [uni(C.drive.bridgeMessMin), uni(C.drive.bridgeMessMin)].map((v) => gate(bridgeP, v));
      const bartLotZ = normal();          // how early the BART lots fill today (same day for every station)
      const rainSlow = [uni(R.trafficMin), uni(R.trafficMin)];
      const ferryCancel = r() < (rain ? R.ferryCancelP : 0);
      if (rain) { traffic[0] += rainSlow[0]; traffic[1] += rainSlow[1]; }
      days.push({
        runLate: Math.round(runLate),
        leaveEarlyAt: earlyHit ? Math.round(earlyV / 5) * 5 : null,
        lateMeeting: !earlyHit && meetHit ? Math.round(meetV / 5) * 5 : 0,
        rain, ferryCancel, lotFill, bartLotZ, bartWait, bartDelay, busLate, surge, traffic, bridge,
      });
    }
    return days;
  }

  // ---------- helpers ----------
  const BUS_OFFSET = 7; // timetable: departures at :07 + k*headway (fixed, like a real schedule)
  const nextBus = (t, bus) => { const k = Math.ceil((t - BUS_OFFSET) / bus.headway); return BUS_OFFSET + k * bus.headway; };
  const lastBusBy = (t, bus) => { const k = Math.floor((t - BUS_OFFSET) / bus.headway); return BUS_OFFSET + k * bus.headway; };

  // Leave-home time to be somewhere by arriveBy on a bus (or a chain of buses with transfers)
  const planBus = (arriveBy, b) => {
    const chain = b.chain || [b];
    let t = arriveBy - (chain[chain.length - 1].walkAfter || 0);
    for (let i = chain.length - 1; i >= 0; i--) t = lastBusBy(t - chain[i].ride, chain[i]);
    return t - P().bus.walkToStopMin;
  };

  function transitChoice(legs) {
    if (!legs) return null;
    if (legs.walk != null && legs.walk <= 15) return { type: 'walk', min: legs.walk };
    if (legs.bus) return { type: 'bus', bus: legs.bus };
    if (legs.walk != null) return { type: 'walk', min: legs.walk };
    return null;
  }

  function context(profile) {
    const C = P();
    const home = C.homes[profile.home], dest = C.dests[profile.dest];
    return { C, home, dest, profile,
      target: T(profile.arrive), leaveWork: T(profile.leave),
      plan: T(profile.arrive) - (profile.strict ? C.strictCushionMin : 0), // what you plan around
      bartRide: home.station.rideCivic + dest.bartRideAdj,
      bartFare: home.station.fare[dest.fareKey],
      ferryLeg: C.ferry.boardMin + C.ferry.sailMin + C.ferry.dockMin };
  }

  function eligible(s, profile) {
    const C = P(), home = C.homes[profile.home], has = profile.has || {};
    const legs = s.via === 'ferry' ? home.toMarina : home.toStation;
    if (s.via === 'tbus') return !!home.transbay;
    if (s.access === 'drive' && s.via === 'bart') return !!has.car && !!(home.parkRide && home.parkRide.station.lot);
    if (s.access === 'drive') return !!has.car && (s.via !== 'ferry' || !!home.toMarina.drive);
    if (s.access === 'bike') return !!has.bike && !!legs.bike;
    if (s.access === 'ebike') return !!has.ebike && !!legs.ebike;
    if (s.access === 'transit') return !!transitChoice(legs);
    if (s.access === 'lyft') return !!legs.lyft;
    return true;
  }

  function labelFor(s, profile) {
    if (s.via === 'tbus') return `Transbay bus (${P().homes[profile.home].transbay.line})`;
    if (s.access !== 'transit') return s.label;
    const home = P().homes[profile.home];
    const tc = transitChoice(s.via === 'ferry' ? home.toMarina : home.toStation);
    return s.label.replace('Bus', tc && tc.type === 'walk' ? 'Walk' : 'Bus');
  }

  // ---------- one day ----------
  function simDay(s, x, luck) {
    const { C, home, dest, profile } = x;
    const d = { ev: [], legs: [], cost: 0, late: 0, stranded: false, lotFull: false, lyfts: 0, drove: false, walkMin: 0, waitMin: 0 };
    const W = (m) => { m *= luck.rain ? C.rainFx.walkX : 1; d.walkMin += m; return m; };   // minutes on foot (slower in the rain)
    const part = (total, foot) => total + W(foot) - foot;   // a leg that is partly on foot (walk + Muni)
    const egressWalk = dest.ferryEgressWalkMin ?? dest.ferryEgressMin, bartFoot = dest.bartFootMin ?? dest.bartWalkMin;
    const Wt = (m) => { d.waitMin += m; return m; };  // minutes standing around: platforms, piers, bus stops, Lyft pickups
    // Drive → BART parks at the home's park-and-ride station; everyone else uses the home station.
    const parkRide = s.via === 'bart' && s.access === 'drive' ? home.parkRide : null;
    const stn = parkRide ? parkRide.station : home.station;
    const bRide = stn.rideCivic + dest.bartRideAdj, bFare = stn.fare[dest.fareKey];
    const say = (t, text, kind = 'info') => d.ev.push({ t, text, kind });
    const pay = (amt) => { d.cost += amt; };
    const leg = (from, to, mode, half) => d.legs.push({ from, to, mode, half });
    const usedBike = { v: false };
    // With "bike comes along", the bike rides BART or the ferry and you ride the SF end too.
    const bikeKind = s.access === 'bike' || s.access === 'ebike', bikePlan = !!profile.bikeAlong && bikeKind;
    const along = () => bikePlan && usedBike.v;   // false on a rainy day you took a Lyft instead
    const bartEgress = () => (along() ? dest.bikeFromBart : part(dest.bartWalkMin, bartFoot));
    const ferryEgress = () => (along() ? dest.bikeFromFerry : part(dest.ferryEgressMin, egressWalk));
    const ferryEgressFare = () => (along() ? 0 : dest.ferryEgressFare);
    const ferryEgressMode = () => (along() ? s.access : dest.ferryEgressFare ? dest.ferryEgressMode || 'bart' : 'walk');

    const lyft = (L, clock, half, why, from, to) => {
      const surge = luck.surge[half === 'am' ? 0 : 1];
      const cost = L.cost * (surge ? C.lyft.surgeX : 1);
      const min = L.min + Wt(C.lyft.waitMin + (surge ? C.lyft.surgeWaitMin : 0));
      pay(cost); d.lyfts++;
      say(clock, `${why}Lyft ${money(cost)}${surge ? ' (surge pricing)' : ''}.`, why ? 'bad' : 'info');
      leg(from, to, 'car', half);
      return clock + min;
    };

    // Ride/walk/bus between home and an access point. dir: 0 = toward SF, 1 = toward home.
    const access = (kind, legs, clock, dir, place) => {
      const half = dir ? 'pm' : 'am';
      const [from, to] = dir ? [place, 'home'] : ['home', place];
      if (kind === 'bike' || kind === 'ebike') {
        if (luck.rain && profile.rainLyft) return lyft(legs.lyft, clock, half, 'Raining. ', from, to);
        usedBike.v = true; leg(from, to, kind, half);
        if (luck.rain) say(clock, 'Raining. You ride anyway and arrive wet.', 'bad');
        return clock + legs[kind][dir] + (place === 'station' && !profile.bikeAlong ? C.bart.bikeParkMin : 0);  // lock or unlock at the station
      }
      if (kind === 'lyft') return lyft(legs.lyft, clock, half, '', from, to);
      const tc = transitChoice(legs);
      if (tc.type === 'walk') { leg(from, to, 'walk', half); return clock + W(tc.min); }
      // one bus, or a chain with a transfer (the 65 to Downtown Berkeley, then the 51B)
      const chain = tc.bus.chain ? (dir ? tc.bus.chain.slice().reverse() : tc.bus.chain) : [tc.bus];
      const last = tc.bus.chain ? tc.bus.chain[tc.bus.chain.length - 1] : tc.bus;
      clock += W(C.bus.walkToStopMin) + (dir ? W(last.walkAfter || 0) : 0);
      for (let i = 0; i < chain.length; i++) {
        const bus = chain[i], dep = nextBus(clock, bus), wait = dep - clock;
        if (dir && dep > T(C.bus.serviceEnds)) return lyft(legs.lyft, clock, half, `No ${bus.name} this late. `, from, to);
        // A Lyft instead of a long wait, only if the time saved is worth its price to you (or you can't be late)
        const worthIt = (!dir && profile.strict) || (wait / 60) * (profile.vot || 0) > legs.lyft.cost - bus.fare;
        if (wait > (dir ? C.bus.pmMaxWaitMin : C.bus.maxWaitMin) && worthIt) {
          return lyft(legs.lyft, clock, half, `Next ${bus.name} isn't until ${fmt(dep)}. `, from, to);
        }
        const lateBy = i === 0 ? Math.round(luck.busLate[dir]) : 0;
        if (lateBy) say(dep, `The ${bus.name} is ${lateBy} min late.`, 'bad');
        else if (wait > 20) say(clock, `Wait ${Math.round(wait)} min for the ${bus.name}.`);
        pay(bus.fare); Wt(wait + lateBy);
        clock = dep + bus.ride + lateBy;
      }
      leg(from, to, 'bus', half);
      return clock + (dir ? W(C.bus.walkToStopMin) : W(last.walkAfter || 0));  // stop to front door / last stop to the pier
    };

    const bart = (clock, dir) => {
      const half = dir ? 'pm' : 'am';
      clock += W(C.bart.stationMin) + Wt(luck.bartWait[dir]);
      const delay = Math.round(luck.bartDelay[dir]);
      if (delay) say(clock, `BART delay: ${delay} min.`, 'bad');
      clock += bRide + delay + W(C.bart.stationMin);
      pay(bFare + (along() ? 0 : dest.bartEgressFare || 0));
      leg(dir ? 'dest' : 'station', dir ? 'station' : 'dest', 'bart', half);
      return clock;
    };

    const driveToSF = (clock, from) => {   // from: 'home' | 'marina' | 'station'
      const trip = from === 'marina' ? C.drive.marinaToSF : from === 'station' ? C.drive.stationToSF : home.driveSF;
      const mins = trip.min, miles = trip.miles;
      clock += mins + dest.driveAdjMin + luck.traffic[0];
      if (luck.bridge[0]) { clock += luck.bridge[0]; say(clock, `Bay Bridge backup: +${Math.round(luck.bridge[0])} min.`, 'bad'); }
      pay(C.drive.toll + miles * C.drive.perMile + dest.garage);
      say(clock, `Toll ${money(C.drive.toll)}, garage ${money(dest.garage)}.`);
      leg(from, 'dest', 'car', 'am');
      d.drove = true;
      return clock + W(C.drive.garageWalkMin);
    };
    const driveHomeFromSF = (clock) => {
      clock += W(C.drive.garageWalkMin) + home.driveSF.min + dest.driveAdjMin + luck.traffic[1];
      if (luck.bridge[1]) { clock += luck.bridge[1]; say(clock, `Bridge traffic home: +${Math.round(luck.bridge[1])} min.`, 'bad'); }
      pay(home.driveSF.miles * C.drive.perMile);
      leg('dest', 'home', 'car', 'pm');
      return clock;
    };

    // ================= MORNING =================
    const F = C.ferry, boats = F.amFromBerkeley.map(T), legsM = home.toMarina, legsS = home.toStation;
    let plannedLeave, plannedBoat = null;

    if (s.via === 'ferry') {
      let i = boats.length - 1;
      const egPlan = bikePlan ? dest.bikeFromFerry : dest.ferryEgressMin;
      while (i > 0 && boats[i] + x.ferryLeg + egPlan > x.plan) i--;
      i = Math.max(0, i - (s.early || 0));
      plannedBoat = boats[i];
      const atPier = plannedBoat - F.bufferMin;
      if (s.access === 'drive') plannedLeave = atPier - F.pierWalkMin - F.parkMin - legsM.drive.min - 7;
      else if (s.access === 'bike' || s.access === 'ebike') plannedLeave = atPier - F.bikeToPierMin - legsM[s.access][0];
      else if (s.access === 'lyft') plannedLeave = atPier - F.pierWalkMin - legsM.lyft.min - C.lyft.waitMin;
      else {
        const tc = transitChoice(legsM);
        if (tc.type === 'walk') plannedLeave = atPier - F.pierWalkMin - tc.min;
        else plannedLeave = planBus(atPier - F.pierWalkMin, tc.bus);
      }
    } else if (s.via === 'bart') {
      const atStation = x.plan - ((bikePlan ? dest.bikeFromBart : dest.bartWalkMin) + 2 * C.bart.stationMin + bRide + 5) - 5;
      if (parkRide) {
        plannedLeave = atStation - C.bart.parkMin - parkRide.drive.min - 3;
        // beat the lot: be parked two "spreads" before it usually fills
        if (s.beatLot) plannedLeave = Math.min(plannedLeave, T(stn.lot.fillMean) - 2 * stn.lot.fillSdMin - parkRide.drive.min);
      }
      else if (s.access === 'bike' || s.access === 'ebike') plannedLeave = atStation - legsS[s.access][0] - (profile.bikeAlong ? 0 : C.bart.bikeParkMin);
      else if (s.access === 'lyft') plannedLeave = atStation - legsS.lyft.min - C.lyft.waitMin;
      else {
        const tc = transitChoice(legsS);
        if (tc.type === 'walk') plannedLeave = atStation - tc.min;
        else plannedLeave = planBus(atStation, tc.bus);
      }
    } else if (s.via === 'tbus') {
      const tb = home.transbay, trips = tb.am.map(([a, b]) => [T(a), T(b)]);
      let k = trips.length - 1;
      while (k > 0 && trips[k][1] + dest.fromSTC.min > x.plan) k--;
      plannedLeave = trips[k][0] - tb.walk - 3;
    } else {
      plannedLeave = x.plan - (home.driveSF.min + dest.driveAdjMin + 7 + C.drive.garageWalkMin) - 5;
    }
    plannedLeave = Math.round(plannedLeave);

    let clock = plannedLeave + luck.runLate;
    const leftHome = clock;
    if (luck.runLate) say(clock, `Out the door ${luck.runLate} min late.`, 'bad');
    else say(clock, `Leave home at ${fmt(clock)}.`);
    if (luck.rain && !bikeKind) say(clock, luck.ferryCancel ? 'Storm. Wind and rain all day.' : 'Raining. Slow roads, slow walking.', 'bad');

    let carAt = null; // 'marina' | 'sf'

    if (s.via === 'car') {
      clock = driveToSF(clock, 'home'); carAt = 'sf';
    } else if (s.via === 'tbus') {
      const tb = home.transbay, trips = tb.am.map(([a, b]) => [T(a), T(b)]);
      clock += W(tb.walk);
      const trip = trips.find((t) => t[0] >= clock);
      if (!trip || trip[0] - clock > C.transbay.maxWaitMin) {
        say(clock, trip ? `Next ${tb.line} isn't until ${fmt(trip[0])}. Over to BART.` : `No more ${tb.line} buses this morning. Over to BART.`, 'bad');
        clock = lyft(legsS.lyft, clock, 'am', 'To BART: ', 'home', 'station');
        clock = bart(clock, 0) + bartEgress();
      } else {
        const lateBy = Math.round(luck.busLate[0]);
        if (lateBy) say(trip[0], `The ${tb.line} is ${lateBy} min late.`, 'bad');
        else if (trip[0] - clock > 15) say(clock, `Wait ${Math.round(trip[0] - clock)} min for the ${fmt(trip[0])} ${tb.line}.`);
        Wt(trip[0] - clock + lateBy);
        pay(C.transbay.fare + dest.fromSTC.fare);
        leg('home', 'tstop', 'walk', 'am'); leg('tstop', 'stc', 'bus', 'am'); leg('stc', 'dest', dest.fromSTC.mode || 'walk', 'am');
        clock = trip[1] + lateBy + part(dest.fromSTC.min, dest.fromSTC.walk);
      }
    } else if (parkRide) {
      const lot = stn.lot, fill = T(lot.fillMean) + luck.bartLotZ * lot.fillSdMin;
      clock += parkRide.drive.min + luck.traffic[0] * 0.3;
      pay(parkRide.drive.miles * C.drive.perMile);
      leg('home', 'station', 'car', 'am');
      if (clock > fill) {
        d.lotFull = true;
        say(clock, `${stn.name} BART lot full (filled up by ${fmt(fill)}). Drive into SF instead.`, 'bad');
        clock = driveToSF(clock, 'station'); carAt = 'sf';
      } else {
        pay(lot.fee); carAt = 'station';
        say(clock, `Parked at ${stn.name} BART: ${money(lot.fee)}.`);
        clock = bart(clock + C.bart.parkMin, 0) + bartEgress();
      }
    } else if (s.via === 'bart') {
      clock = access(s.access, legsS, clock, 0, 'station');
      clock = bart(clock, 0) + bartEgress();
    } else {
      // --- to the Marina ---
      let toFerry = true;
      if (s.access === 'drive') {
        clock += legsM.drive.min + luck.traffic[0] * 0.3;
        pay(legsM.drive.miles * C.drive.perMile);
        leg('home', 'marina', 'car', 'am');
        if (clock > luck.lotFill) {
          d.lotFull = true; toFerry = false;
          say(clock, `Terminal lot and Marina Blvd full (filled up by ${fmt(luck.lotFill)}). Drive into SF instead.`, 'bad');
          clock = driveToSF(clock, 'marina'); carAt = 'sf';
        } else {
          pay(F.lot.fee); carAt = 'marina';
          say(clock, `Parked at the Marina: ${money(F.lot.fee)}.`);
          clock += F.parkMin + W(F.pierWalkMin);
        }
      } else {
        clock = access(s.access, legsM, clock, 0, 'marina');
        clock += (s.access === 'bike' || s.access === 'ebike') && !(luck.rain && profile.rainLyft) ? F.bikeToPierMin : W(F.pierWalkMin);
      }
      if (toFerry) {
        const boat = boats.find((b) => b >= clock);
        if (boat == null || luck.ferryCancel) {
          say(clock, luck.ferryCancel ? 'Storm: boats canceled. Over to BART.' : 'No more morning boats. Over to BART.', 'bad');
          clock = lyft(home.station.rescueLyft, clock, 'am', 'To BART: ', 'marina', 'station');
          clock = bart(clock, 0) + bartEgress();
        } else {
          if (boat > plannedBoat) say(clock, `Missed the ${fmt(plannedBoat)} boat. Next one ${fmt(boat)}.`, 'bad');
          else if (boat - clock > 15) say(clock, `Waiting ${Math.round(boat - clock)} min for the ${fmt(boat)} boat.`);
          pay(F.fare + ferryEgressFare());
          leg('marina', 'fb', 'ferry', 'am');
          Wt(boat - clock);
          clock = boat + x.ferryLeg + ferryEgress();
          leg('fb', 'dest', ferryEgressMode(), 'am');
        }
      }
    }
    const atWork = clock;
    d.late = Math.max(0, Math.round(atWork - x.target));
    if (d.late > 2) say(atWork, `At work ${fmt(atWork)}: ${d.late} min late.`, 'bad');
    else say(atWork, `At work ${fmt(atWork)}.`, 'good');
    d.amMin = atWork - leftHome;
    d.earlyMin = Math.max(0, x.target - atWork);   // there before work starts: still time the commute took

    // ================= EVENING =================
    let out = x.leaveWork;
    if (luck.leaveEarlyAt != null) { out = luck.leaveEarlyAt; say(out, `The school calls. You have to leave at ${fmt(out)}.`, 'bad'); }
    else if (luck.lateMeeting) { out += luck.lateMeeting; say(out, `Late meeting. You get out at ${fmt(out)}.`, 'bad'); }
    clock = out;

    const homeFromStation = () => {
      if (parkRide) {   // back to the car at the BART lot, then drive home
        leg('station', 'home', 'car', 'pm'); pay(parkRide.drive.miles * C.drive.perMile);
        return clock + W(2) + parkRide.drive.min + luck.traffic[1] * 0.3;
      }
      if (s.via === 'bart') return access(s.access, legsS, clock, 1, 'station');
      if (s.access === 'drive') return null;
      // ferry riders who fell back to BART: bike comes with you; bus/lyft riders use the station legs
      const kind = (s.access === 'bike' || s.access === 'ebike') ? s.access : (s.access === 'lyft' ? 'lyft' : 'transit');
      const legs = (kind === 'transit' && !transitChoice(legsS)) ? { ...legsS, walk: null, bus: null } : legsS;
      return access(kind === 'transit' && !transitChoice(legs) ? 'lyft' : kind, legs, clock, 1, 'station');
    };

    if (carAt === 'sf') {
      clock = driveHomeFromSF(clock);
    } else if (s.via === 'bart') {
      clock = bart(clock + bartEgress(), 1);
      clock = homeFromStation();
    } else if (s.via === 'tbus') {
      const tb = home.transbay, trips = tb.pm.map(([a, b]) => [T(a), T(b)]);
      const atSTC = clock + part(dest.fromSTC.min, dest.fromSTC.walk);
      const trip = trips.find((t) => t[0] >= atSTC);
      if (!trip || trip[0] - atSTC > C.transbay.maxWaitMin) {
        say(atSTC, trip ? `Next ${tb.line} isn't until ${fmt(trip[0])}. BART home instead.` : `No more ${tb.line} buses tonight. BART home instead.`, 'bad');
        clock = bart(clock + bartEgress(), 1);
        clock = homeFromStation();
      } else {
        const lateBy = Math.round(luck.busLate[1]);
        if (lateBy) say(trip[0], `The ${tb.line} is ${lateBy} min late.`, 'bad');
        else if (trip[0] - atSTC > 15) say(atSTC, `Wait ${Math.round(trip[0] - atSTC)} min for the ${fmt(trip[0])} ${tb.line}.`);
        Wt(trip[0] - atSTC + lateBy);
        pay(C.transbay.fare + dest.fromSTC.fare);
        leg('dest', 'stc', dest.fromSTC.mode || 'walk', 'pm'); leg('stc', 'tstop', 'bus', 'pm'); leg('tstop', 'home', 'walk', 'pm');
        clock = trip[1] + lateBy + W(tb.walk);
      }
    } else {
      const atFB = clock + ferryEgress();
      const boat = F.pmFromSF.map(T).find((b) => b >= atFB);
      if (boat == null || luck.ferryCancel || boat - atFB > F.maxWaitBeforeBart) {
        say(atFB, luck.ferryCancel ? 'Storm: boats canceled. BART home.' : boat == null ? 'No boats left tonight. BART home.'
                               : `Next boat isn't until ${fmt(boat)}. BART home instead.`, 'bad');
        clock = bart(clock + bartEgress(), 1);
        if (carAt === 'marina') {
          d.stranded = true;
          say(clock, 'Your car is still parked at the Marina. Go get it.', 'bad');
          clock = lyft(home.station.rescueLyft, clock, 'pm', 'Car rescue: ', 'station', 'marina');
          clock += W(F.pierWalkMin) + legsM.drive.min + luck.traffic[1] * 0.3;
          pay(legsM.drive.miles * C.drive.perMile);
          leg('marina', 'home', 'car', 'pm');
        } else {
          clock = homeFromStation();
        }
      } else {
        if (boat - atFB > 15) say(atFB, `Wait ${Math.round(boat - atFB)} min for the ${fmt(boat)} boat.`);
        pay(F.fare + ferryEgressFare());
        Wt(boat - atFB);
        leg('dest', 'fb', ferryEgressMode(), 'pm');
        leg('fb', 'marina', 'ferry', 'pm');
        clock = boat + x.ferryLeg;
        if (s.access === 'drive') {
          clock += W(F.pierWalkMin) + 2 + legsM.drive.min + luck.traffic[1] * 0.3;
          pay(legsM.drive.miles * C.drive.perMile);
          leg('marina', 'home', 'car', 'pm');
        } else {
          clock += (s.access === 'bike' || s.access === 'ebike') ? F.bikeToPierMin : W(F.pierWalkMin);
          clock = access(s.access, legsM, clock, 1, 'marina');
        }
      }
    }
    if (usedBike.v) pay(C.bikePerDay[s.access] || 0);
    d.pmMin = clock - out;
    say(clock, `Home at ${fmt(clock)}.`, 'good');
    d.totalMin = d.amMin + d.earlyMin + d.pmMin;
    d.leave = leftHome; d.atWork = atWork; d.out = out; d.home = clock;
    return d;
  }

  const median = (a) => { const s = a.slice().sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  function runStrategy(s, profile, luckDays) {
    const x = context(profile);
    const days = luckDays.map((l) => simDay(s, x, l));
    const sum = (k) => days.reduce((a, d) => a + (typeof d[k] === 'boolean' ? (d[k] ? 1 : 0) : d[k]), 0);
    const cost = sum('cost'), minutes = sum('totalMin');
    return {
      id: s.id, label: labelFor(s, profile), via: s.via, access: s.access, days,
      totals: {
        cost, minutes, hours: minutes / 60,
        timeCost: (minutes / 60) * (profile.vot || 0),
        combined: cost + (minutes / 60) * (profile.vot || 0),
        lateDays: days.filter((d) => d.late > 2).length,
        stranded: sum('stranded'), lotFull: sum('lotFull'), lyfts: sum('lyfts'), drove: sum('drove'),
        goodDay: Math.min(...days.map((d) => d.totalMin)), badDay: Math.max(...days.map((d) => d.totalMin)),
        walkMin: sum('walkMin'), waitMin: sum('waitMin'),
        homeTypical: median(days.map((d) => d.home)), homeLatest: Math.max(...days.map((d) => d.home)),
      },
    };
  }

  function strategies(profile) { return P().strategies.filter((s) => eligible(s, profile)); }

  function runAll(profile, seed) {
    const luck = drawLuck(profile, seed);
    return strategies(profile).map((s) => runStrategy(s, profile, luck));
  }

  // A "good day" preview with no bad luck at all, for the strategy cards.
  function preview(profile) {
    const calm = [{ runLate: 0, leaveEarlyAt: null, lateMeeting: 0, rain: false, lotFill: 24 * 60,
      bartWait: [5, 5], bartDelay: [0, 0], busLate: [0, 0], surge: [false, false], traffic: [7, 7], bridge: [0, 0] }];
    return strategies(profile).map((s) => {
      const r = runStrategy(s, profile, calm);
      return { id: s.id, label: r.label, min: r.days[0].totalMin / 2, cost: r.days[0].cost };
    });
  }

  window.PlaySim = { T, fmt, money, drawLuck, runAll, runStrategy, strategies, preview, eligible, labelFor };
})();
