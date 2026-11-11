// Mog City: the library's creatures in the city (W.creatures): fighters in the street fight (fighter.js: one of the
// fight's enemies, with its own body, blows and size) and wildlife (herd.js). Installed by wagmi/combat/index.js where a
// world wants them (?city=sf, or ?dev=creatures): New York's own game never loads them.
//   W.creatures.spawn(id, { at: { x, z }, yaw, height, name, boss, heavy, hold: { wake, leash }, stats: { hp, dmg, speed },
//     aggro }) -> a handle (below) for one creature. boss: true or { name, phases: [0.66, 0.33] } (the boss bar, its
//     phases); hold: its lair (it stays at `at` until Dan comes within `wake` m or hits it, then fights within `leash` m
//     of it); aggro (default true): it joins in when Dan is near (false: only when woken, hit or told: engage())
//   W.creatures.fight({ foes: [id | { id, count, height, name, heavy, stats }], boss: id | { id, name, height, phases,
//     stats, at }, at, hold, aggro }) -> a handle for the whole crew: the foes on a ring round `at` (sized by their size),
//     the boss at its middle
//   handle: { ready (a Promise: the fighters, once their kinds have loaded), fighters, boss, alive(), hp(), engage(),
//     on('ko' (one down: { foe, name, kind }) | 'allDown' | 'wake', cb) -> off(), remove() }
//   W.creatures.herd(id, { at, count = 4, radius = 10, height }) -> { ready, animals, remove() }: they graze, drift and
//     run from Dan (on foot, or in a car or on a horse, from further)
//   W.creatures.preload(ids) -> Promise (the kinds loaded and their pipelines compiled: no hitch at the first spawn)
//   W.creatures.list() (the live fighters) · clear() · CAP (how many fight at once) · kinds
// ?dev=creatures (with ?nointro): Dan on Sheep Meadow and W.creatures.dev's scenes: knights() (three knights and a
// centaur), ogre(), trex() (a boss), scorpion() (one in its lair), herd() (four horses), mech(), ape(); &scene=<name>
// starts one.
import * as THREE from 'three/webgpu';
import { loadCreature } from '../library/creature.js';
import { PROFILES, nameOf } from './profiles.js';
import { CreatureFighter } from './fighter.js';
import { createHerd } from './herd.js';
import { warm } from './voice.js';
import { hdist, yawTo, rnd, fwd } from '../combat/util.js';

const CAP = 8; // (creatures fighting at once, at most: the ninth waits for one of them to go)
const Q = new URLSearchParams(location.search);

export async function install(W, c) {
  const app = W.app, P = W.person;
  const low = () => { try { return /phone|low/.test(String(window.NYC?.quality?.tier || window.NYC?.quality || '')); } catch (e) { return false; } };
  const handles = new Set(), herds = new Set();
  // the kinds, loaded once each; their pipelines compiled up front (a fighter's dissolving copy and a herd's plain one)
  const kits = new Map();
  function kitOf(id) {
    if (kits.has(id)) return kits.get(id);
    const p = loadCreature(id, { low: low() }).then(async (kit) => {
      try {
        const probe = kit.make({}), mat = probe.mesh.material.clone(); mat.alphaHash = true;
        const twin = kit.make({}); twin.mesh.material = mat;
        for (const m of [probe, twin]) { m.object.position.copy(P.position).setY(P.position.y - 40); c.scene.add(m.object); }
        await app.renderer.compileAsync(probe.object, c.camera, c.scene); await app.renderer.compileAsync(twin.object, c.camera, c.scene);
        probe.dispose(); twin.dispose(); mat.dispose();
      } catch (err) { console.warn('[creatures] precompile', id, err); }
      return kit;
    });
    kits.set(id, p);
    return p;
  }
  const live = () => c.enemies.filter((e) => e.creature && e.alive);
  // a place on the ground near (x, z), clear of the walls and of what is placed already
  function placeNear(x, z, r, placed, gap) {
    for (let k = 0; k < 24; k++) {
      const a = rnd(0, Math.PI * 2), d = k ? rnd(0, r) + k * 0.2 : 0, q = new THREE.Vector3(x + Math.sin(a) * d, 0, z + Math.cos(a) * d);
      c.world.collide(q, gap * 0.5); q.y = c.world.ground(q.x, q.z);
      if (placed.every((o) => hdist(o, q) > gap)) return q;
    }
    const q = new THREE.Vector3(x + rnd(-r, r), 0, z + rnd(-r, r)); c.world.collide(q, 0.6); q.y = c.world.ground(q.x, q.z); return q;
  }
  function ahead(d) { const f = fwd(P.heading, new THREE.Vector3()); return { x: P.position.x + f.x * d, z: P.position.z + f.z * d }; }

  // ------------------------------------------------------------------ a crew of creatures (the fight's own crew, as spawnCrew makes)
  function makeCrew({ aggro = true } = {}) {
    const crew = { id: 'creatures' + (++crewSeq), enemies: [], aggro, awake: false, cleared: false, _cleared: [], creatures: true,
      alive() { return this.enemies.filter((e) => e.alive).length; },
      onCleared(cb) { if (this.cleared) cb(this); else this._cleared.push(cb); return this; },
      engage() { for (const e of this.enemies) if (e.alive) e.wake?.(); this.awake = true; return this; } };
    c.crews.push(crew);
    return crew;
  }
  let crewSeq = 0;
  // the handle a world holds: its fighters, their events, its removal
  function makeHandle(crew) {
    const ev = {}, h = {
      crew, fighters: [], boss: null, removed: false,
      alive() { return h.fighters.filter((f) => f.alive).length; },
      hp() { return h.fighters.reduce((n, f) => n + Math.max(0, f.hp), 0); },
      engage() { crew.engage(); return h; },
      on(name, cb) { (ev[name] || (ev[name] = [])).push(cb); return () => { ev[name] = (ev[name] || []).filter((x) => x !== cb); }; },
      emit(name, data) { for (const cb of ev[name] || []) { try { cb(data); } catch (err) { console.error('[creatures]', name, err); } } },
      remove() {
        if (h.removed) return; h.removed = true;
        for (const f of h.fighters) { c.onEnemyInterrupted(f); const i = c.enemies.indexOf(f); if (i >= 0) c.enemies.splice(i, 1); if (!f.disposed) f.dispose(); }
        const i = c.crews.indexOf(crew); if (i >= 0) c.crews.splice(i, 1);
        if (c.boss && h.fighters.includes(c.boss)) c.boss = null;
        handles.delete(h);
      },
    };
    crew.onCleared(() => h.emit('allDown', { handle: h }));
    handles.add(h);
    return h;
  }
  // one fighter into a crew (its kind loaded first)
  async function addFighter(h, id, o) {
    const Pf = PROFILES[id];
    if (!Pf) throw new Error(`no creature ${id}`);
    if (!Object.keys(Pf.blows).length) throw new Error(`${id} does not fight (wildlife: W.creatures.herd)`);
    const kit = await kitOf(id);
    if (h.removed) return null;
    if (live().length >= CAP) { console.warn(`[creatures] ${CAP} creatures fight at once at most: ${id} left out`); return null; }
    const pos = o.pos, yaw = o.yaw ?? yawTo(pos, P.position);
    const f = new CreatureFighter(c, kit, Pf, { pos, yaw, height: o.height, name: o.name, heavy: o.heavy, stats: o.stats || {}, boss: o.boss || null, hold: o.hold || null });
    // (a role's look over the creature (looks.js): SF 2040's Deacon Vale on the knight)
    if (o.look) try { (await import('./looks.js')).dressLook(f, o.look); } catch (e) { console.warn('[creatures] look', o.look, e.message); }
    f.crew = h.crew; h.crew.enemies.push(f); c.enemies.push(f); h.fighters.push(f); h.crew.cleared = false;
    if (f.boss) { h.boss = f; c.boss = f; }
    if (h.crew.awake && !o.hold) f.wake(true);
    c.nav?.want?.(pos.x, pos.z);
    return f;
  }

  // ------------------------------------------------------------------ the API
  function spawn(id, o = {}) {
    const at = o.at || ahead(10), crew = makeCrew({ aggro: !o.hold && o.aggro !== false }), h = makeHandle(crew);
    const pos = placeNear(at.x, at.z, 0, [], 1);
    warm(W);
    h.ready = addFighter(h, id, { ...o, pos, boss: o.boss ? (o.boss === true ? {} : o.boss) : null }).then((f) => { if (f) h.fighter = f; return h.fighters; })
      .catch((err) => { console.error('[creatures] spawn', id, err); return []; });
    return h;
  }
  function fight({ foes = [], boss = null, at = null, hold = null, aggro = true } = {}) {
    at = at || ahead(12);
    const crew = makeCrew({ aggro: !hold && aggro !== false }), h = makeHandle(crew);
    // (the list: ids or { id, count }; the boss at the middle, the rest on a ring round it sized by how big they are)
    const list = [];
    for (const x of foes) { const o = typeof x === 'string' ? { id: x } : x; for (let i = 0; i < Math.max(1, o.count | 0 || 1); i++) list.push(o); }
    const B = boss ? (typeof boss === 'string' ? { id: boss } : boss) : null;
    const placed = [], todo = [];
    if (B) { const bp = B.at || at, pos = placeNear(bp.x, bp.z, 0, placed, 1); placed.push(pos); todo.push({ ...B, pos, boss: { name: B.name, phases: B.phases } }); }
    const n = list.length;
    list.forEach((o, i) => {
      const Pf = PROFILES[o.id] || {}, size = (o.height || 2) / 1.8, gap = Math.max(1.4, (Pf.spacing || 1) * size);
      const a = (i / Math.max(1, n)) * Math.PI * 2 + rnd(-0.3, 0.3), r = (B ? 6 : n <= 1 ? 0 : 1.6 + 0.35 * n) + gap * 0.5;
      const pos = placeNear(at.x + Math.sin(a) * r, at.z + Math.cos(a) * r, 1.5, placed, gap); placed.push(pos);
      todo.push({ ...o, pos });
    });
    warm(W);
    h.ready = Promise.all(todo.map((o) => addFighter(h, o.id, { ...o, hold: o.hold || hold }).catch((err) => { console.error('[creatures] fight', o.id, err); return null; })))
      .then(() => h.fighters);
    return h;
  }
  function herd(id, { at = null, count = 4, radius = 10, height } = {}) {
    at = at || ahead(25);
    const Pf = PROFILES[id] || { name: nameOf(id), speed: 4, steps: [] };
    const hd = { animals: [], removed: false, herd: null, remove() { hd.removed = true; if (hd.herd) { hd.herd.dispose(); herds.delete(hd.herd); } } };
    hd.ready = kitOf(id).then((kit) => {
      if (hd.removed) return [];
      hd.herd = createHerd(c, kit, Pf, { at, count, radius, height }); hd.animals = hd.herd.animals; herds.add(hd.herd);
      return hd.animals;
    }).catch((err) => { console.error('[creatures] herd', id, err); return []; });
    return hd;
  }
  function clear() { for (const h of [...handles]) h.remove(); for (const hd of [...herds]) hd.dispose(); herds.clear(); c.boss = null; }

  // ------------------------------------------------------------------ every frame (the fight's frame, on its clock)
  c.tickers.push((dt, rdt) => {
    for (const hd of herds) hd.update(rdt);
    for (const h of handles) {
      // (a creature down for good: 'ko' once; a crew woken: 'wake' once)
      for (const f of h.fighters) if (f.out && !f.koSaid) { f.koSaid = true; h.emit('ko', { foe: f, name: f.name, kind: f.model }); }
      if (h.crew.awake && !h.woke) { h.woke = true; h.emit('wake', { handle: h }); }
      // (the fight's own clean-up took them away: gone from the handle too)
      if (h.fighters.length && h.fighters.every((f) => f.disposed)) h.remove();
    }
    // the boss bar's boss: the one alive and nearest, or the last one a moment after it falls
    if (c.boss && (c.boss.disposed || (c.boss.out && c.time - (c.boss.outAt ?? c.time) > 4))) c.boss = null;
    if (!c.boss) for (const e of c.enemies) if (e.boss && e.alive) { c.boss = e; break; }
  });

  const api = W.creatures = { spawn, fight, herd, clear, CAP, kinds: Object.keys(PROFILES),
    preload: (ids) => Promise.all((ids || Object.keys(PROFILES)).map((id) => kitOf(id).catch(() => null))),
    list: () => live(),
    profiles: PROFILES,
  };

  // ------------------------------------------------------------------ ?dev=creatures: the scenes, on Sheep Meadow
  if (Q.get('dev') === 'creatures') {
    const MEADOW = { x: -526, z: -1991 }; // (Central Park's Sheep Meadow, its middle)
    const at = (d, deg = 0) => { const a = P.heading + deg * Math.PI / 180; return { x: P.position.x + Math.sin(a) * d, z: P.position.z + Math.cos(a) * d }; };
    const fresh = () => { clear(); W.combat.clear(); W.combat.player.hp = W.combat.player.maxHp; };
    const dev = api.dev = {
      meadow() { const cm = app.controllerManager; if (cm.activeMode !== 'person') dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f' })); cm.teleportActiveTo(MEADOW.x, MEADOW.z, 0); },
      knights() { fresh(); return fight({ foes: [{ id: 'creature-knight', count: 3 }, 'creature-centaur'], at: at(9) }); },
      ogre() { fresh(); return fight({ foes: ['creature-ogre'], at: at(7) }); },
      trex() { fresh(); return fight({ boss: { id: 'creature-trex', name: 'The Matriarch' }, at: at(17) }); },
      scorpion() { fresh(); return spawn('creature-scorpion', { at: at(16), height: 2.8, name: 'Hollow Claw', hold: { wake: 8, leash: 22 } }); },
      herd() { for (const hd of [...herds]) hd.dispose(); herds.clear(); return herd('creature-horse', { at: at(28), count: 4, radius: 8 }); },
      mech() { fresh(); return fight({ foes: ['creature-mech'], at: at(10) }); },
      ape() { fresh(); return fight({ foes: ['creature-ape'], at: at(8) }); },
    };
    (async () => {
      while (!app.ready) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 400));
      dev.meadow();
      const s = Q.get('scene'); if (s && dev[s]) dev[s]();
    })();
  }
  console.log('[wagmi] creatures are in');
  return api;
}
