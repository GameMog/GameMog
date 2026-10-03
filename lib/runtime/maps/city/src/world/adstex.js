// GameMog's own (not Spiderbench's): the city map's ad and storefront-sign atlases, drawn here at run time with
// invented copy, in the layouts the original's image atlases had (which carried art this map does not take):
//   ads   (adsTexture / adsGrid):   2048 x 2048; top half 8 x 8 landscape cells (2:1), bottom half 16 x 4 portrait (1:2)
//   signs (signsTexture / signsGrid): 1024 x 1024; 4 x 16 storefront signs (4:1)
// A world may give its own copy before the map is built (setAdCopy / setSignCopy: the city map's ads and shop
// names, e.g. an outbreak's notices); otherwise the defaults below.
import * as THREE from 'three';

const ADS = [
  ['THE EVENING LEDGER', 'THE CITY, EVERY NIGHT', '#101014', '#2A2A30', '#F4F1E8', '#D11F1F'],
  ['VERIDIAN', 'CLEAN POWER FOR FIVE BOROUGHS', '#0D3B2E', '#1F7A58', '#E9FFF4', '#9DF0C8'],
  ['HALCYON FUEL', 'ENERGY THAT MOVES THE CITY', '#F0B21A', '#E2721B', '#1B1B1B', '#FFFFFF'],
  ['NOVA LABS', 'THE FUTURE IS PERSONAL', '#1B2F6B', '#3D62C9', '#FFFFFF', '#FFCF33'],
  ['TWO-DOLLAR SLICE', 'A SLICE OF THE CITY', '#B3121A', '#E8343C', '#FFFFFF', '#FFE066'],
  ['BROADWAY NIGHTS', 'THE MUSICAL EVERYONE TALKS ABOUT', '#12121A', '#3B1D5A', '#F0E6FF', '#FF5EC4'],
  ['VISIT THE SHORE', 'SUMMER NEVER ENDS', '#0E5EA8', '#39A0E6', '#FFFFFF', '#FFFFFF'],
  ['PULSE FITNESS', 'OPEN 24 HOURS', '#111111', '#2E2E2E', '#C6FF3D', '#C6FF3D'],
  ['ORBIT MOBILE', 'UNLIMITED EVERYTHING', '#5A1FA8', '#9B4DFF', '#FFFFFF', '#FFD84D'],
  ['COLD BREW CO.', 'SLOW STEEPED, FAST CITY', '#2B1B12', '#5C3A24', '#F2E6D2', '#E8B062'],
  ['SKYLINE BANK', 'BANKING THAT NEVER SLEEPS', '#0B2440', '#1D4E89', '#FFFFFF', '#7FD1FF'],
  ['METRO RADIO 98', 'THE SOUND OF THE STREETS', '#E23B2E', '#FF7A4A', '#FFFFFF', '#1A1A1A'],
  ['GLACIER WATER', 'PURE. COLD. LOCAL.', '#DFF3FB', '#9FD6EE', '#0B3A55', '#0B3A55'],
  ['NIGHT MARKET', 'FRIDAYS ON THE PIER', '#1A0F2E', '#46205E', '#FFD27A', '#FF8A3D'],
  ['RIDGELINE AUTO', 'BUILT FOR EVERY STREET', '#202428', '#4A525C', '#FFFFFF', '#FF4A3D'],
  ['ATLAS AIRWAYS', 'THE WORLD, NONSTOP', '#F7F7F2', '#D8DEE6', '#0F2C5C', '#C8102E'],
];
const SIGNS = [
  ['DELI & GROCERY', '#1F6B36', '#F4EFC8'], ['PIZZA', '#B3191C', '#F2C14E'], ['CORNER PHARMACY', '#EEF1F4', '#B8202C'], ['BAGELS & CAFE', '#2A211C', '#D9AE6A'],
  ['CITY SAVINGS BANK', '#1B3F8C', '#FFFFFF'], ['NAILS & SPA', '#F1CFD8', '#5A1F3A'], ['WINE & LIQUOR', '#5E1424', '#F1E2C4'], ['HARDWARE', '#E3A21D', '#1A1A1A'],
  ['SUB SHOP', '#1D7A3A', '#F7E21C'], ['DINER', '#1E3A7A', '#F2C14E'], ['SHOES', '#0E0E0E', '#F4F4F4'], ['THAI KITCHEN', '#9A6A1E', '#2A1A0A'],
  ['DRY CLEANERS', '#3F8FC8', '#FFFFFF'], ['OPTICAL', '#EEF1F4', '#1A2A5A'], ['COFFEE', '#5A3A24', '#F2E6D2'], ['HALAL GYRO', '#C8321C', '#FFFFFF'],
  ['LAUNDROMAT', '#2C6E8F', '#FFFFFF'], ['BARBER', '#1A1A1A', '#E8E8E8'], ['FLOWERS', '#3C7A3A', '#FCE4EC'], ['BOOKS', '#4A2C1A', '#F2D9A6'],
  ['NOODLE BAR', '#A3241C', '#FFE9C2'], ['TACOS', '#F2A900', '#2A1A0A'], ['RAMEN', '#111111', '#FF5A3D'], ['BAKERY', '#F5E6CC', '#7A3E1C'],
  ['ELECTRONICS', '#0F1F3D', '#5FD3FF'], ['CELL REPAIR', '#E8E8E8', '#C8102E'], ['JEWELRY', '#0B0B0B', '#D9B44A'], ['TAILOR', '#3A3A40', '#F0E6D2'],
  ['SUSHI', '#F7F4EC', '#1A1A1A'], ['BURGERS', '#C8321C', '#FFD24A'], ['FRUIT & VEG', '#2F7A2F', '#FFFFFF'], ['NEWS & LOTTO', '#1D3F8C', '#FFE14D'],
  ['PAWN SHOP', '#2A2A2A', '#F2C14E'], ['TATTOO', '#0B0B0B', '#FF3D7F'], ['VINTAGE', '#6B2E5A', '#F7E1F0'], ['PET SUPPLY', '#3FA0C8', '#FFFFFF'],
  ['DUMPLINGS', '#B3191C', '#FFFFFF'], ['SMOOTHIES', '#FF8A3D', '#FFFFFF'], ['YOGA', '#E9E4F7', '#4A3A7A'], ['HOTEL', '#141414', '#E8D9A8'],
  ['KARAOKE', '#3B1D5A', '#FF5EC4'], ['BAR & GRILL', '#2A1A12', '#F2A93D'], ['CHECK CASHING', '#F2E94E', '#1A1A1A'], ['DENTIST', '#FFFFFF', '#1E6FA8'],
  ['PHOTO', '#E8E8E8', '#1A1A1A'], ['GYM', '#111111', '#C6FF3D'], ['DOLLAR STORE', '#2F7A2F', '#FFE14D'], ['MATTRESS', '#1E3A7A', '#FFFFFF'],
  ['PRINT & COPY', '#E8E8E8', '#C8102E'], ['LIQUOR', '#5E1424', '#FFFFFF'], ['FALAFEL', '#2F5A2A', '#F7E6B0'], ['PHO', '#1F5F4A', '#FFFFFF'],
  ['CHINESE FOOD', '#B3191C', '#FFD24A'], ['STEAKHOUSE', '#1A1A1A', '#C9A36A'], ['CANDY', '#FF8FC8', '#FFFFFF'], ['TOYS', '#2E6FD8', '#FFE14D'],
  ['MUSIC', '#111111', '#FFFFFF'], ['WATCHES', '#0B0B0B', '#E8E8E8'], ['BIKES', '#E3A21D', '#1A1A1A'], ['ICE CREAM', '#FCE4EC', '#C8326E'],
  ['DELI', '#7A1E1E', '#FFFFFF'], ['CAFE', '#3A2A20', '#F2E6D2'], ['GROCERY', '#2F7A2F', '#FFFFFF'], ['PIZZERIA', '#1F6B36', '#FFFFFF'],
];
let adCopy = ADS, signCopy = SIGNS;
export function setAdCopy(list) { if (Array.isArray(list) && list.length) { adCopy = list; adTex = null; adsG = null; } }
export function setSignCopy(list) { if (Array.isArray(list) && list.length) { signCopy = list; signTex = null; signsG = null; } }

function fit(g, text, max, size, weight, family) {
  let s = size; g.font = `${weight} ${s}px ${family}`;
  while (s > 8 && g.measureText(text).width > max) { s -= 2; g.font = `${weight} ${s}px ${family}`; }
  return s;
}
function drawAd(g, x, y, w, h, a, i, portrait) {
  const [t1, t2, bg0, bg1, fg, acc] = a;
  const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, bg0); gr.addColorStop(1, bg1);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  // a shape of the brand's own: a band, a ring or a block, varied by cell
  g.globalAlpha = 0.18; g.fillStyle = acc;
  if (i % 3 === 0) { g.beginPath(); g.arc(x + w * 0.82, y + h * 0.3, Math.min(w, h) * 0.32, 0, Math.PI * 2); g.fill(); }
  else if (i % 3 === 1) g.fillRect(x, y + h * 0.62, w, h * 0.12);
  else g.fillRect(x + w * 0.66, y, w * 0.34, h);
  g.globalAlpha = 1;
  const pad = w * 0.07, F = 'Impact, "Arial Black", Arial, sans-serif', F2 = '"Arial Black", Arial, sans-serif';
  g.fillStyle = fg; g.textBaseline = 'alphabetic';
  if (!portrait) {
    const s1 = fit(g, t1, w - 2 * pad, h * 0.36, 'bold', F); g.fillText(t1, x + pad, y + h * 0.48);
    g.fillStyle = acc; g.fillRect(x + pad, y + h * 0.56, w * 0.32, Math.max(2, h * 0.025));
    g.fillStyle = fg; fit(g, t2, w - 2 * pad, h * 0.12, 'bold', F2); g.fillText(t2, x + pad, y + h * 0.76); void s1;
  } else {
    const words = t1.split(' ');
    let yy = y + h * 0.2;
    for (const wd of words) { fit(g, wd, w - 2 * pad, w * 0.28, 'bold', F); g.fillText(wd, x + pad, yy); yy += w * 0.3; }
    g.fillStyle = acc; g.fillRect(x + pad, yy - w * 0.12, w * 0.4, Math.max(2, w * 0.03));
    g.fillStyle = fg; const lines = t2.split(' ').reduce((L, wd) => { const last = L[L.length - 1]; if (last && (last + ' ' + wd).length < 12) L[L.length - 1] = last + ' ' + wd; else L.push(wd); return L; }, []);
    for (const ln of lines) { fit(g, ln, w - 2 * pad, w * 0.11, 'bold', F2); g.fillText(ln, x + pad, yy + w * 0.08); yy += w * 0.13; }
  }
  // weather: panel seams and a grime fall-off at the bottom
  g.fillStyle = 'rgba(0,0,0,0.10)'; for (let k = 1; k < 4; k++) g.fillRect(x + (w / 4) * k, y, 1, h);
  const vg = g.createLinearGradient(x, y + h * 0.6, x, y + h); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,30,20,0.22)');
  g.fillStyle = vg; g.fillRect(x, y, w, h);
}
function drawSign(g, x, y, w, h, s) {
  const [t, bg, fg] = s;
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = Math.max(2, h * 0.05); g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const fam = t.length < 8 ? 'Georgia, "Times New Roman", serif' : '"Arial Black", Arial, sans-serif';
  fit(g, t, w * 0.86, h * 0.58, 'bold', fam);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillText(t, x + w / 2 + 2, y + h / 2 + 3);
  g.fillStyle = fg; g.fillText(t, x + w / 2, y + h / 2);
  g.textAlign = 'left';
}
function canvas(W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }

let adTex = null, adCanvas = null;
export function adsTexture() {
  if (!adTex) {
    const W = 2048, cv = adCanvas = canvas(W, W), g = cv.getContext('2d');
    for (let j = 0; j < 64; j++) drawAd(g, (j % 8) * 256, Math.floor(j / 8) * 128, 256, 128, adCopy[j % adCopy.length], j, false);
    for (let j = 0; j < 64; j++) drawAd(g, (j % 16) * 128, 1024 + Math.floor(j / 16) * 256, 128, 256, adCopy[(j + 5) % adCopy.length], j, true);
    adTex = new THREE.CanvasTexture(cv); adTex.colorSpace = THREE.SRGBColorSpace; adTex.anisotropy = 8;
  }
  return adTex;
}
// (as the original) a colour grid of an atlas: a W x H linear-RGB downsample, for the screens' and signs' light colours
function gridOf(img, W, H) {
  if (!img || typeof document === 'undefined') return null;
  const cv = canvas(W, H), cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, W, H);
  const d = cx.getImageData(0, 0, W, H).data, L = new Float32Array(256), out = new Float32Array(W * H * 3);
  for (let i = 0; i < 256; i++) { const v = i / 255; L[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  for (let i = 0, j = 0; i < W * H; i++, j += 4) { out[i * 3] = L[d[j]]; out[i * 3 + 1] = L[d[j + 1]]; out[i * 3 + 2] = L[d[j + 2]]; }
  return { W, H, d: out };
}
let adsG = null;
export function adsGrid() { adsTexture(); return adsG ??= Promise.resolve(gridOf(adCanvas, 256, 256)); }

let signTex = null, signCanvas = null, signsG = null;
export function signsTexture() {
  if (!signTex) {
    const W = 1024, cv = signCanvas = canvas(W, W), g = cv.getContext('2d');
    for (let j = 0; j < 64; j++) drawSign(g, (j % 4) * 256, Math.floor(j / 4) * 64, 256, 64, signCopy[j % signCopy.length]);
    signTex = new THREE.CanvasTexture(cv); signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 8;
  }
  return signTex;
}
export function signsGrid() { signsTexture(); return signsG ??= Promise.resolve(gridOf(signCanvas, 128, 256)); }
