// Mog City: small shared helpers for the street fight (wagmi/combat/**).
import * as THREE from 'three/webgpu';

export const UP = new THREE.Vector3(0, 1, 0);
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export const angWrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const dampAngle = (a, b, rate, dt) => a + angWrap(b - a) * (1 - Math.exp(-rate * dt));
// yaw from one point to another (the city's heading: x += sin, z += cos)
export const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
export const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const fwd = (yaw, out = new THREE.Vector3()) => out.set(Math.sin(yaw), 0, Math.cos(yaw));
// the screen's right when looking along yaw
export const right = (yaw, out = new THREE.Vector3()) => out.set(-Math.cos(yaw), 0, Math.sin(yaw));
