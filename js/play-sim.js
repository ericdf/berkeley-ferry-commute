'use strict';
// ============================================================================
// PLAY A MONTH — the simulation. Pure functions, no DOM, so it runs in node too:
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
      const surge = [r() < C.lyft.surgeP, r() < C.lyft.surgeP];
      const traffic = [uni(C.drive.trafficMin), uni(C.drive.trafficMin)];
      const bridge = [uni(C.drive.bridgeMessMin), uni(C.drive.bridgeMessMin)].map((v) => gate(C.drive.bridgeMessP, v));
      days.push({
        runLate: Math.round(runLate),
        leaveEarlyAt: earlyHit ? Math.round(earlyV / 5) * 5 : null,
        lateMeeting: !earlyHit && meetHit ? Math.round(meetV / 5) * 5 : 0,
        rain, lotFill, bartWait, bartDelay, busLate, surge, traffic, bridge,
      });
    }
    return days;
  }

  // ---------- helpers ----------
  const BUS_OFFSET = 7; // timetable: departures at :07 + k*headway (fixed, like a real schedule)
  const nextBus = (t, bus) => { const k = Math.ceil((t - BUS_OFFSET) / bus.headway); return BUS_OFFSET + k * bus.headway; };
  const lastBusBy = (t, bus) => { const k = Math.floor((t - BUS_OFFSET) / bus.headway); return BUS_OFFSET + k * bus.headway; };

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
      bartRide: home.station.rideCivic + dest.bartRideAdj,
      bartFare: home.station.fare[dest.fareKey],
      ferryLeg: C.ferry.boardMin + C.ferry.sailMin + C.ferry.dockMin };
  }

  function eligible(s, profile) {
    const C = P(), home = C.homes[profile.home], has = profile.has || {};
    const legs = s.via === 'ferry' ? home.toMarina : home.toStation;
    if (s.access === 'drive') return !!has.car && (s.via !== 'ferry' || !!home.toMarina.drive);
    if (s.access === 'bike') return !!has.bike && !!legs.bike;
    if (s.access === 'ebike') return !!has.ebike && !!legs.ebike;
    if (s.access === 'transit') return !!transitChoice(legs);
    if (s.access === 'lyft') return !!legs.lyft;
    return true;
  }

  function labelFor(s, profile) {
    if (s.access !== 'transit') return s.label;
    const home = P().homes[profile.home];
    const tc = transitChoice(s.via === 'ferry' ? home.toMarina : home.toStation);
    return s.label.replace('Bus', tc && tc.type === 'walk' ? 'Walk' : 'Bus');
  }

  // ---------- one day ----------
  function simDay(s, x, luck) {
    const { C, home, dest, profile } = x;
    const d = { ev: [], legs: [], cost: 0, late: 0, stranded: false, lotFull: false, lyfts: 0, drove: false };
    const say = (t, text, kind = 'info') => d.ev.push({ t, text, kind });
    const pay = (amt) => { d.cost += amt; };
    const leg = (from, to, mode, half) => d.legs.push({ from, to, mode, half });
    const usedBike = { v: false };

    const lyft = (L, clock, half, why, from, to) => {
      const surge = luck.surge[half === 'am' ? 0 : 1];
      const cost = L.cost * (surge ? C.lyft.surgeX : 1);
      const min = L.min + C.lyft.waitMin + (surge ? C.lyft.surgeWaitMin : 0);
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
        return clock + legs[kind][dir];
      }
      if (kind === 'lyft') return lyft(legs.lyft, clock, half, '', from, to);
      const tc = transitChoice(legs);
      if (tc.type === 'walk') { leg(from, to, 'walk', half); return clock + tc.min; }
      const bus = tc.bus;
      clock += C.bus.walkToStopMin;
      const dep = nextBus(clock, bus);
      if (dir && dep > T(C.bus.serviceEnds)) return lyft(legs.lyft, clock, half, `No ${bus.name} this late. `, from, to);
      if (dep - clock > (dir ? C.bus.pmMaxWaitMin : C.bus.maxWaitMin)) {
        return lyft(legs.lyft, clock, half, `Next ${bus.name} isn't until ${fmt(dep)}. `, from, to);
      }
      const lateBy = Math.round(luck.busLate[dir]);
      if (lateBy) say(dep, `The ${bus.name} is ${lateBy} min late.`, 'bad');
      pay(bus.fare); leg(from, to, 'bus', half);
      return dep + bus.ride + lateBy;
    };

    const bart = (clock, dir) => {
      const half = dir ? 'pm' : 'am';
      clock += C.bart.stationMin + luck.bartWait[dir];
      const delay = Math.round(luck.bartDelay[dir]);
      if (delay) say(clock, `BART delay: ${delay} min.`, 'bad');
      clock += x.bartRide + delay + C.bart.stationMin;
      pay(x.bartFare);
      leg(dir ? 'dest' : 'station', dir ? 'station' : 'dest', 'bart', half);
      return clock;
    };

    const driveToSF = (clock, fromMarina) => {
      const mins = fromMarina ? C.drive.marinaToSF.min : home.driveSF.min;
      const miles = fromMarina ? C.drive.marinaToSF.miles : home.driveSF.miles;
      clock += mins + dest.driveAdjMin + luck.traffic[0];
      if (luck.bridge[0]) { clock += luck.bridge[0]; say(clock, `Bay Bridge backup: +${Math.round(luck.bridge[0])} min.`, 'bad'); }
      pay(C.drive.toll + miles * C.drive.perMile + dest.garage);
      say(clock, `Toll ${money(C.drive.toll)}, garage ${money(dest.garage)}.`);
      leg(fromMarina ? 'marina' : 'home', 'dest', 'car', 'am');
      d.drove = true;
      return clock + C.drive.garageWalkMin;
    };
    const driveHomeFromSF = (clock) => {
      clock += C.drive.garageWalkMin + home.driveSF.min + dest.driveAdjMin + luck.traffic[1];
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
      while (i > 0 && boats[i] + x.ferryLeg + dest.ferryEgressMin > x.target) i--;
      i = Math.max(0, i - (s.early || 0));
      plannedBoat = boats[i];
      const atPier = plannedBoat - F.bufferMin;
      if (s.access === 'drive') plannedLeave = atPier - F.pierWalkMin - F.parkMin - legsM.drive.min - 7;
      else if (s.access === 'bike' || s.access === 'ebike') plannedLeave = atPier - F.bikeToPierMin - legsM[s.access][0];
      else if (s.access === 'lyft') plannedLeave = atPier - F.pierWalkMin - legsM.lyft.min - C.lyft.waitMin;
      else {
        const tc = transitChoice(legsM);
        if (tc.type === 'walk') plannedLeave = atPier - F.pierWalkMin - tc.min;
        else plannedLeave = lastBusBy(atPier - F.pierWalkMin - tc.bus.ride, tc.bus) - C.bus.walkToStopMin;
      }
    } else if (s.via === 'bart') {
      const atStation = x.target - (dest.bartWalkMin + 2 * C.bart.stationMin + x.bartRide + 5) - 5;
      if (s.access === 'bike' || s.access === 'ebike') plannedLeave = atStation - legsS[s.access][0];
      else if (s.access === 'lyft') plannedLeave = atStation - legsS.lyft.min - C.lyft.waitMin;
      else {
        const tc = transitChoice(legsS);
        if (tc.type === 'walk') plannedLeave = atStation - tc.min;
        else plannedLeave = lastBusBy(atStation - tc.bus.ride, tc.bus) - C.bus.walkToStopMin;
      }
    } else {
      plannedLeave = x.target - (home.driveSF.min + dest.driveAdjMin + 7 + C.drive.garageWalkMin) - 5;
    }
    plannedLeave = Math.round(plannedLeave);

    let clock = plannedLeave + luck.runLate;
    const leftHome = clock;
    if (luck.runLate) say(clock, `Out the door ${luck.runLate} min late.`, 'bad');
    else say(clock, `Leave home at ${fmt(clock)}.`);

    let carAt = null; // 'marina' | 'sf'

    if (s.via === 'car') {
      clock = driveToSF(clock, false); carAt = 'sf';
    } else if (s.via === 'bart') {
      clock = access(s.access, legsS, clock, 0, 'station');
      clock = bart(clock, 0) + dest.bartWalkMin;
    } else {
      // --- to the Marina ---
      let toFerry = true;
      if (s.access === 'drive') {
        clock += legsM.drive.min + luck.traffic[0] * 0.3;
        leg('home', 'marina', 'car', 'am');
        if (clock > luck.lotFill) {
          d.lotFull = true; toFerry = false;
          say(clock, `Terminal lot and Marina Blvd full (filled up by ${fmt(luck.lotFill)}). Drive into SF instead.`, 'bad');
          clock = driveToSF(clock, true); carAt = 'sf';
        } else {
          pay(F.lot.fee); carAt = 'marina';
          say(clock, `Parked at the Marina: ${money(F.lot.fee)}.`);
          clock += F.parkMin + F.pierWalkMin;
        }
      } else {
        clock = access(s.access, legsM, clock, 0, 'marina');
        clock += (s.access === 'bike' || s.access === 'ebike') && !(luck.rain && profile.rainLyft) ? F.bikeToPierMin : F.pierWalkMin;
      }
      if (toFerry) {
        const boat = boats.find((b) => b >= clock);
        if (boat == null) {
          say(clock, 'No more morning boats. Over to BART.', 'bad');
          clock = lyft(home.station.rescueLyft, clock, 'am', 'To BART: ', 'marina', 'station');
          clock = bart(clock, 0) + dest.bartWalkMin;
        } else {
          if (boat > plannedBoat) say(clock, `Missed the ${fmt(plannedBoat)} boat. Next one ${fmt(boat)}.`, 'bad');
          else if (boat - clock > 15) say(clock, `Waiting ${Math.round(boat - clock)} min for the ${fmt(boat)} boat.`);
          pay(F.fare + dest.ferryEgressFare);
          leg('marina', 'fb', 'ferry', 'am');
          clock = boat + x.ferryLeg + dest.ferryEgressMin;
          leg('fb', 'dest', dest.ferryEgressFare ? 'bart' : 'walk', 'am');
        }
      }
    }
    const atWork = clock;
    d.late = Math.max(0, Math.round(atWork - x.target));
    if (d.late > 2) say(atWork, `At work ${fmt(atWork)}: ${d.late} min late.`, 'bad');
    else say(atWork, `At work ${fmt(atWork)}.`, 'good');
    d.amMin = atWork - leftHome;

    // ================= EVENING =================
    let out = x.leaveWork;
    if (luck.leaveEarlyAt != null) { out = luck.leaveEarlyAt; say(out, `The school calls. You have to leave at ${fmt(out)}.`, 'bad'); }
    else if (luck.lateMeeting) { out += luck.lateMeeting; say(out, `Late meeting. You get out at ${fmt(out)}.`, 'bad'); }
    clock = out;

    const homeFromStation = () => {
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
      clock = bart(clock + dest.bartWalkMin, 1);
      clock = homeFromStation();
    } else {
      const atFB = clock + dest.ferryEgressMin;
      const boat = F.pmFromSF.map(T).find((b) => b >= atFB);
      if (boat == null || boat - atFB > F.maxWaitBeforeBart) {
        say(atFB, boat == null ? 'No boats left tonight. BART home.'
                               : `Next boat isn't until ${fmt(boat)}. BART home instead.`, 'bad');
        clock = bart(clock + dest.bartWalkMin, 1);
        if (carAt === 'marina') {
          d.stranded = true;
          say(clock, 'Your car is still parked at the Marina. Go get it.', 'bad');
          clock = lyft(home.station.rescueLyft, clock, 'pm', 'Car rescue: ', 'station', 'marina');
          clock += F.pierWalkMin + legsM.drive.min + luck.traffic[1] * 0.3;
          leg('marina', 'home', 'car', 'pm');
        } else {
          clock = homeFromStation();
        }
      } else {
        if (boat - atFB > 15) say(atFB, `Wait ${Math.round(boat - atFB)} min for the ${fmt(boat)} boat.`);
        pay(F.fare + dest.ferryEgressFare);
        leg('dest', 'fb', dest.ferryEgressFare ? 'bart' : 'walk', 'pm');
        leg('fb', 'marina', 'ferry', 'pm');
        clock = boat + x.ferryLeg;
        if (s.access === 'drive') {
          clock += F.pierWalkMin + 2 + legsM.drive.min + luck.traffic[1] * 0.3;
          leg('marina', 'home', 'car', 'pm');
        } else {
          clock += (s.access === 'bike' || s.access === 'ebike') ? F.bikeToPierMin : F.pierWalkMin;
          clock = access(s.access, legsM, clock, 1, 'marina');
        }
      }
    }
    if (usedBike.v) pay(C.bikePerDay[s.access] || 0);
    d.pmMin = clock - out;
    say(clock, `Home at ${fmt(clock)}.`, 'good');
    d.totalMin = d.amMin + d.pmMin;
    d.leave = leftHome; d.atWork = atWork; d.out = out; d.home = clock;
    return d;
  }

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
