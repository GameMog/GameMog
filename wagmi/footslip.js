// Mog City: foot slip, measured (H7). How far a foot that is down on the ground travels across it, in cm per second of
// it being down, and in cm per contact (one stance, heel strike to toe-off). A foot is down while its ankle is within
// DOWN of the lowest it has been lately (a floor that rises 3 cm/s, so a step up is followed); its travel is the
// ankle's, across the ground (x, z), between two frames it is down in. A body moved more than JUMP in a frame (a cut, a
// teleport) or carried faster than CARRIED m/s (in a car's seat) is not travel. It knows nothing of footlock.js: the same meter reads a body with its feet locked or not.
//   const S = createSlipMeter();  S.sample(key, ankle, groundY, rootPos, dt)  each frame, each foot;  S.report()
// Used by lab/feet.html and, in play, by the probe a check injects (W.feetSlip, ?slip=1: wagmi/storyrun/cast.js).
const DOWN = 0.025, JUMP = 0.6, CARRIED = 6.5;
export function createSlipMeter() {
  const T = new Map(), speeds = [];
  let downSecs = 0, travel = 0;
  const contacts = [], worst = [];
  const api = {
    sample(key, a, gy, rp, dt) {
      let s = T.get(key);
      if (!s) T.set(key, (s = { floor: null, down: false, px: 0, pz: 0, rx: rp.x, rz: rp.z, run: 0, runT: 0 }));
      const mv = Math.hypot(rp.x - s.rx, rp.z - s.rz), jumped = mv > JUMP || !(dt > 0) || dt > 0.25 || mv / dt > CARRIED;
      s.rx = rp.x; s.rz = rp.z;
      const h = a.y - gy;
      s.floor = s.floor == null || jumped ? h : Math.min(h, s.floor + dt * 0.03);
      const down = h - s.floor < DOWN;
      if (down && s.down && !jumped) {
        const d = Math.hypot(a.x - s.px, a.z - s.pz);
        downSecs += dt; travel += d; s.run += d; s.runT += dt; speeds.push(d / dt);
        if (speeds.length > 200000) speeds.splice(0, 100000);
      }
      if (!down && s.down && s.runT > 0.08) { contacts.push(s.run); if (s.run > 0.2 && worst.length < 40) worst.push([key, +(s.run * 100).toFixed(1), +s.runT.toFixed(2), +(globalThis.performance?.now?.() / 1000 || 0).toFixed(1)]); }
      if (!down || jumped) { s.run = 0; s.runT = 0; }
      s.down = down; s.px = a.x; s.pz = a.z;
    },
    report() {
      const sp = [...speeds].sort((x, y) => x - y), c = [...contacts].sort((x, y) => x - y), q = (arr, k) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(k * arr.length))] : 0);
      const r2 = (x) => Math.round(x * 100) / 100;
      return { downSecs: r2(downSecs), cmPerSec: downSecs ? r2((travel / downSecs) * 100) : 0, p50CmPerSec: r2(q(sp, 0.5) * 100), p95CmPerSec: r2(q(sp, 0.95) * 100),
        contacts: c.length, cmPerContact: c.length ? r2((c.reduce((x, y) => x + y, 0) / c.length) * 100) : 0, p95CmPerContact: r2(q(c, 0.95) * 100), worstContactCm: r2((c[c.length - 1] || 0) * 100), worst: worst.slice() };
    },
    reset() { T.clear(); speeds.length = 0; contacts.length = 0; worst.length = 0; downSecs = 0; travel = 0; },
  };
  return api;
}
