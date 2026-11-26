// Mog City story runner: a video call's plan, the pure part (no three.js, no DOM: tests/vcall.test.mjs). vcall.js plays it.
//   planCall(step, { name, hero })  a runner pack's vcall step -> { title, layout, end, time, people, items } or { error }
//        people: [{ who (the cast name; the hero's name for 'player'), office, label, sub, blur, muted, late, light, cam }]
//        items:  [{ line: { who, text, how, pre, post, overlap, cut, muted } } | { ev: { do, who, slide, secs } }]
//        A line said while its speaker is muted (an event, or `muted` on them from the start) is a muted line; a line
//        by someone not in the call (not joined yet, or dropped) is dropped from the plan with a warning (the gate
//        refuses those: this is a Mog's safety net).
//   layout(n, w, h, { mode, stage, top, bottom, gap })  the tiles' rects in css px: { tiles: [[x, y, w, h]], stage }
//        mode 'grid': the n tiles as big as they go at 16:9, in the columns that fit them best on this screen (a
//        phone held up stacks them), the last row centred; 'speaker': `stage` (a tile's index, or 'share') fills the
//        top, the rest in a strip under it
//   camOf(eyes, kind, { face })   a webcam on someone's eyes at [x, y, z] (facing +z): { pos, look, fov } (close | wide
//        | low), framed on the face: chin to crown face m (FACE, theirs: faceOf) a set share of the tile's height
//   faceOf(height)      a body's face, chin to crown (m), from its height
//   rtSize(w, h, dpr, max)   a picture's render target for a w x h css px rect at dpr: [pw, ph], its width at most max
export const OFFICE_LOOKS = ['exec', 'startup', 'backstage', 'boardroom', 'kitchen', 'study', 'van', 'greenroom', 'truck', 'diner', 'lot', 'green', 'car', 'house'];
export const CALL_EVENTS = ['mute', 'unmute', 'join', 'drop', 'freeze', 'unfreeze', 'share', 'unshare', 'blur', 'unblur', 'hand', 'wait'];
export const CAMS = ['close', 'wide', 'low'];
export const LIMITS = { people: [2, 6], items: 40, events: 24 };
const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);

export function planCall(d, { name = (x) => x, hero = 'player' } = {}) {
  if (!d || typeof d !== 'object') return { error: 'no call' };
  const who = (w) => (w === 'player' ? hero : typeof w === 'string' ? name(w) : null);
  const people = [], seen = new Set(), warn = [];
  for (const p of Array.isArray(d.people) ? d.people : []) {
    const w = who(p && p.who); if (!w || seen.has(w)) { warn.push(`person ${p && p.who}`); continue; }
    seen.add(w);
    people.push({ who: w, office: OFFICE_LOOKS.includes(p.office) ? p.office : 'exec', label: str(p.label, 24) || w, sub: str(p.sub, 32),
      blur: !!p.blur, muted: !!p.muted, late: !!p.late, light: ['day', 'golden', 'night'].includes(p.light) ? p.light : null, cam: CAMS.includes(p.cam) ? p.cam : 'close', isHero: w === hero });
    if (people.length >= LIMITS.people[1]) break;
  }
  if (people.length < LIMITS.people[0]) return { error: 'a call needs 2 people', warn };
  const state = new Map(people.map((p) => [p.who, { in: !p.late, muted: p.muted }]));
  const items = []; let events = 0;
  for (const it of (Array.isArray(d.lines) ? d.lines : []).slice(0, LIMITS.items)) {
    if (!it || typeof it !== 'object') continue;
    if (typeof it.do === 'string') {
      if (!CALL_EVENTS.includes(it.do) || ++events > LIMITS.events) { warn.push(`event ${it.do}`); continue; }
      if (it.do === 'wait') { items.push({ ev: { do: 'wait', secs: num(it.secs, 0.2, 4) ?? 1 } }); continue; }
      const w = who(it.who), S = state.get(w); if (!S) { warn.push(`event ${it.do} by ${it.who}`); continue; }
      if (it.do === 'mute') S.muted = true; if (it.do === 'unmute') S.muted = false;
      if (it.do === 'join') S.in = true; if (it.do === 'drop') S.in = false;
      const ev = { do: it.do, who: w };
      if (it.do === 'share') {
        const s = it.slide && typeof it.slide === 'object' ? it.slide : {};
        ev.slide = { title: str(s.title, 48) || '', lines: (Array.isArray(s.lines) ? s.lines : []).map((l) => str(l, 64)).filter(Boolean).slice(0, 4), big: str(s.big, 12) };
      }
      items.push({ ev });
      continue;
    }
    const w = who(it.who), text = str(it.text ?? it.line, 240), S = state.get(w);
    if (!w || !text || !S) { warn.push(`line by ${it.who}`); continue; }
    if (!S.in) { warn.push(`line by ${w}, not in the call`); continue; }
    const L = { who: w, text };
    for (const k of ['how', 'pre', 'post', 'pause']) if (it[k] != null) L[k] = it[k];
    if (it.overlap === true) L.overlap = true;
    const cut = num(it.cut, 0.3, 0.95); if (cut != null) L.cut = cut;
    if (it.muted === true || S.muted) L.muted = true;
    items.push({ line: L });
  }
  if (!items.some((i) => i.line)) return { error: 'a call with no line', warn };
  return { title: str(d.title, 40) || 'Meeting', layout: d.layout === 'speaker' ? 'speaker' : 'grid', end: d.end === 'drop' ? 'drop' : 'leave',
    time: ['day', 'golden', 'night'].includes(d.time) ? d.time : null, people, items, warn };
}

// the best grid for n 16:9 tiles in an area: the columns that make them biggest
export function gridOf(n, aw, ah, gap = 10, aspect = 16 / 9) {
  let best = null;
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c), tw = Math.min((aw - (c - 1) * gap) / c, ((ah - (r - 1) * gap) / r) * aspect);
    if (tw <= 0) continue;
    if (!best || tw > best.tw + 0.5) best = { c, r, tw, th: tw / aspect };
  }
  return best || { c: 1, r: n, tw: aw, th: aw / aspect };
}
export function layout(n, w, h, { mode = 'grid', stage = null, top = 56, bottom = 150, side = 16, gap = 10 } = {}) {
  const ax = side, ay = top, aw = Math.max(80, w - side * 2), ah = Math.max(60, h - top - bottom);
  const tiles = [];
  if (mode === 'speaker' && (stage === 'share' || (Number.isInteger(stage) && stage >= 0 && stage < n))) {
    const rest = [...Array(n).keys()].filter((i) => i !== stage), m = rest.length;
    const stripH = m ? Math.min(ah * 0.24, 170) : 0, sh = ah - stripH - (m ? gap : 0);
    const sw = Math.min(aw, sh * (16 / 9)), sx = ax + (aw - sw) / 2, shh = sw * (9 / 16);
    const st = [sx, ay + (sh - shh) / 2, sw, shh];
    const tw = Math.min((aw - (m - 1) * gap) / Math.max(1, m), stripH * (16 / 9)), th = tw * (9 / 16), x0 = ax + (aw - (m * tw + (m - 1) * gap)) / 2;
    for (let i = 0; i < n; i++) {
      if (i === stage) { tiles[i] = st; continue; }
      const k = rest.indexOf(i); tiles[i] = [x0 + k * (tw + gap), ay + sh + gap + (stripH - th) / 2, tw, th];
    }
    return { tiles: tiles.map((r) => r.map((v) => Math.round(v))), stage: st.map((v) => Math.round(v)) };
  }
  const g = gridOf(n, aw, ah, gap), totalH = g.r * g.th + (g.r - 1) * gap, y0 = ay + (ah - totalH) / 2;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / g.c), inRow = row === g.r - 1 ? n - row * g.c : g.c, col = i - row * g.c;
    const rowW = inRow * g.tw + (inRow - 1) * gap, x0 = ax + (aw - rowW) / 2;
    tiles.push([x0 + col * (g.tw + gap), y0 + row * (g.th + gap), g.tw, g.th].map((v) => Math.round(v)));
  }
  return { tiles, stage: null };
}
// a webcam on someone sat at their desk: on the screen's top edge in front of them, a touch off the middle (a laptop's
// lens is never quite centred). Every kind is head and shoulders at eye level (the cast critic, 20 Nov: 'low' looked up
// a nose from the knees and 'wide' left the face a quarter of the tile): the lens as far off as puts their face (chin to
// crown, `face` m: their own, faceOf) FRAME[kind].frac of the tile's height, their eyes EYES_UP of it over the middle
// (42% from the top), the lens DROP m under their eyes (a laptop's lid: a touch under, never up the nose), so the lens
// tilts no more than a few degrees. close: the face 36%; low: a laptop a little lower and nearer the knees, 33%;
// wide: down to the desk, 30%
export const FACE = 0.235;
export const FRAME = { close: { frac: 0.36, fov: 40, drop: 0.03 }, low: { frac: 0.33, fov: 42, drop: 0.1 }, wide: { frac: 0.3, fov: 46, drop: 0 } };
export const EYES_UP = 0.08;
// (crown and chin from the eyes, as a share of the face: the eyes sit a little over its middle)
export const CROWN = 0.47;
export function faceOf(height) {
  const h = Number.isFinite(height) && height > 0.8 && height < 2.6 ? height : 1.75;
  return Math.max(0.18, Math.min(0.3, h * 0.134));
}
// (charlook, a world's `look: 'cinematic'`: the same framing through a portrait lens, about 50 mm (a full frame's height
// seen through 26 degrees: 52 mm) for the close, from further back, so the nose and the brow are not pushed at the lens
// the way a laptop's wide lens pushes them; the lens a touch over the eyes' drop, never up the nose)
export const PORTRAIT = { close: { fov: 26, drop: 0.0 }, low: { fov: 28, drop: 0.06 }, wide: { fov: 32, drop: 0 } };
export function camOf(head, kind = 'close', { face = FACE, portrait = false } = {}) {
  const [x, y, z] = head, F = portrait ? { ...(FRAME[kind] || FRAME.close), ...(PORTRAIT[kind] || PORTRAIT.close) } : FRAME[kind] || FRAME.close;
  const fc = Number.isFinite(face) ? Math.max(0.16, Math.min(0.32, face)) : FACE;
  const H = fc / F.frac, d = H / (2 * Math.tan((F.fov * Math.PI) / 360));
  return { pos: [x + 0.035, y - F.drop, z + Math.sqrt(Math.max(0, d * d - F.drop * F.drop))], look: [x, y - EYES_UP * H, z], fov: F.fov };
}
// a webcam's aim on someone's eyes: their face's own (its landmarks, face.js eyes()) unless those are not where eyes can
// be, more than EYES_OFF m from their head bone; then the head bone's, EYES_HEAD m over it. Intern Two's landmarks put
// her eyes 18 cm over her head bone, over the top of her hair (her seated box's top was 1.28 m, her 'eyes' 1.30 m): her
// tile in DL-4's x1 call framed her far smaller and lower than Intern One (the RC playtest, B7)
//   eyesAim(eyes [x, y, z] | null, head [x, y, z]) -> [x, y, z]
export const EYES_OFF = 0.13, EYES_HEAD = 0.07;
export function eyesAim(eyes, head) {
  const ok = Array.isArray(eyes) && eyes.every(Number.isFinite) && Math.hypot(eyes[0] - head[0], eyes[1] - head[1], eyes[2] - head[2]) <= EYES_OFF;
  return ok ? eyes : [head[0], head[1] + EYES_HEAD, head[2]];
}
// a picture's render target: the rect's css px times the screen's dpr (at most 2), its width at most max px, at least 16
export function rtSize(w, h, dpr = 1, max = 1600) {
  const r = Math.max(0.5, Math.min(2, Number.isFinite(dpr) && dpr > 0 ? dpr : 1)), k = Math.min(1, max / Math.max(1, w * r));
  return [Math.max(16, Math.round(w * r * k)), Math.max(16, Math.round(h * r * k))];
}
// a tile's render target kept through a re-layout (someone joins, leaves, a screen share): its size in 64 px steps,
// grown when the tile needs more, let go smaller only when it needs under 60% of it. Every tile's target was made
// again at its new size the frame the grid reflowed, all of them drawn afresh in that frame: the GPU's long frame left
// the canvas on the old layout under the new labels and outlines (Jensen Heist's DL-4 x1 as Dex left: five pictures
// under '4 in call', 'Jensen' on Dex's van, ghost outlines; the RC playtest, B7)
//   rtKeep([w, h] now (0 none), [w, h] needed) -> [w, h]
export const RT_STEP = 64;
export function rtKeep(cur, need) {
  const q = (n) => Math.max(RT_STEP, Math.ceil(n / RT_STEP) * RT_STEP);
  const [cw, ch] = cur || [0, 0], [nw, nh] = need;
  const fits = cw >= nw && ch >= nh && nw >= cw * 0.6 && nh >= ch * 0.6;
  return fits ? [cw, ch] : [q(nw), q(nh)];
}
// a car-screen feed's place in clip space (vcall-draw.js drawFeed): its rect [x, y, w, h] in css px of a W x H canvas
// as the middle (cx, cy) and size (sx, sy) of a unit quad in normalized device coordinates (-1..1, y up). Clip space
// holds no lens: the picture is where its rect is from every camera (chase, in the cabin, a side view, one moved while
// the frame draws), at any field of view
export function feedClip([x, y, w, h], W, H) {
  W = Math.max(1, W); H = Math.max(1, H);
  return { cx: ((x + w / 2) / W) * 2 - 1, cy: 1 - ((y + h / 2) / H) * 2, sx: (w / W) * 2, sy: (h / H) * 2 };
}
// (charlook, a world's `look: 'cinematic'`) a close shot on a face brought to the face's eye level: a lens written above
// the head (the pack's `up` over the head's bone, a laptop's or a phone held high) looks down on the face, which deepens
// the sockets and grows the brow and the nose's shadow (CharacterPipeline's face-rescue pass2: at eye level the same
// face reads clearly softer). The lens's height held between the eyes and EYE_HIGH degrees above them, its look on the
// eyes (a touch under), its distance kept. Only a close shot on a person's head (within EYE_NEAR m, its look within
// EYE_LOOK m of the head and its lens within EYE_SPAN m of the head's height): a written low or high angle stays.
//   eyeLevel(lens [x,y,z], look [x,y,z], head [x,y,z]) -> { lens, look } (new arrays) or null (left as it is)
export const EYE_UP = 0.07, EYE_HIGH = 3, EYE_NEAR = 2.6, EYE_LOOK = 0.25, EYE_SPAN = 0.6;
export function eyeLevel(lens, look, head) {
  if (![lens, look, head].every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))) return null;
  const d = Math.hypot(lens[0] - look[0], lens[1] - look[1], lens[2] - look[2]);
  if (!(d > 0.2 && d < EYE_NEAR) || Math.hypot(look[0] - head[0], look[1] - head[1], look[2] - head[2]) > EYE_LOOK || Math.abs(lens[1] - head[1]) > EYE_SPAN) return null;
  const ey = head[1] + EYE_UP, h = Math.hypot(lens[0] - look[0], lens[2] - look[2]);
  const y = Math.min(ey + h * Math.tan((EYE_HIGH * Math.PI) / 180), Math.max(ey, lens[1]));
  return { lens: [lens[0], y, lens[2]], look: [look[0], ey - 0.01, look[2]] };
}
