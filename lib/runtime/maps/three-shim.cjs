// The runtime's three.js (r157, a global from the page) for map code written
// against a later three.js, with the few names r157 lacks.
const T = globalThis.THREE;
class Timer {
  constructor() { this._prev = 0; this._now = 0; this._delta = 0; }
  connect() { return this; }
  update(t) { const now = t !== undefined ? t : performance.now(); this._prev = this._now || now; this._now = now; this._delta = (this._now - this._prev) / 1000; return this; }
  getDelta() { return this._delta; }
  getElapsed() { return this._now / 1000; }
  dispose() {}
}
// renderer.compileAsync (r158): compile now, resolve at once
if (T.WebGLRenderer && !T.WebGLRenderer.prototype.compileAsync) {
  T.WebGLRenderer.prototype.compileAsync = function (scene, camera, targetScene) { this.compile(targetScene || scene, camera); return Promise.resolve(scene); };
}
// attribute.addUpdateRange / clearUpdateRanges (r159): r157 uploads one range (attribute.updateRange, reset by the
// renderer after each upload), so the ranges asked for become their union
if (T.BufferAttribute && !T.BufferAttribute.prototype.clearUpdateRanges) {
  T.BufferAttribute.prototype.clearUpdateRanges = function () { this.updateRange.offset = 0; this.updateRange.count = -1; };
  T.BufferAttribute.prototype.addUpdateRange = function (start, count) {
    const r = this.updateRange;
    if (r.count === -1) { r.offset = start; r.count = count; return; }
    const end = Math.max(r.offset + r.count, start + count); r.offset = Math.min(r.offset, start); r.count = end - r.offset;
  };
}
module.exports = Object.assign({}, T, {
  Timer,
  NeutralToneMapping: T.ACESFilmicToneMapping,
  AgXToneMapping: T.ACESFilmicToneMapping,
  AttachedBindMode: 'attached',
  DetachedBindMode: 'detached',
});
