// Hand-built Jensen (Jensen Heist's hero: a parody of a public keynote persona; realistic features at the forge's
// defaults, no exaggeration): the hand passes applied, in order, to his forge base (base-forged.glb, never changed; made
// by forge-base.mjs from storykit/handbuilt/jensen/jensen.sheet.json: MakeHuman CC0 body at sheet age 63, a black tee and
// dark jeans, the forge library's tailored jacket cut short as a moto jacket over them (round 4), black dress shoes).
//   node scripts/handbuilt/jensen/build.mjs [out.glb] [--only=skin,jacket,...] [--skip=...]
// Shares the young hero's GLB tools and his eye, teeth and finger passes, the old boss's iris pass, John's skin and scalp
// passes (with his own landmarks); his own passes (age, hair, moto jacket, glasses) are in this folder and ../frames.mjs.
import fs from 'node:fs';
import { daylightSkinPass } from '../daylight.mjs';
import { read } from '../young-hero/glb.mjs';
import { eyesPass } from '../young-hero/look.mjs';
import { fingerPass } from '../young-hero/p2.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
import { scalpPass } from './scalp.mjs';
import { paintSkin } from './skin.mjs';
import { strandsPass, hairArea } from './strands.mjs';
import { ageShapePass, ageSkinPass, browAgePass, smoothFacePass, headSizePass, skinScatterPass, neckHolesPass } from './age.mjs';
import { teePass, jeansPass } from './wear.mjs';
import { bandCollarPass } from './collar.mjs';
import { motoPass, tailorPass, teeHemPass, teeShoulderPass, teeCrewPass, drapePass } from './moto.mjs';
import { bakeRest, addMorphs } from '../facekit.mjs';
import { hairSwoopPass, glassesBigPass, stylizeFacePass, skinGradePass, hairWhitePass, proportionPass, outfitPass, glassesFitPass, hairDomePass, grinTargets, chinPass, smileChinPass } from './caricature.mjs';
import { hairClumpsPass } from './clumps.mjs';
import { chestWeightsPass, slimSleevesPass, crispLeatherPass, leatherWearPass } from './jacket3.mjs';
import { teethForwardPass, innerLipPass, faceMirrorMapsPass, relaxMorphsPass } from './mouth.mjs';
import { symFacePass, foldSoftPass, lipTonePass, browSoftPass, rimPass } from './face4.mjs';
import { ageSculptPass, agePaintPass } from './age5.mjs';
import { R5 } from './round5.mjs';
import os from 'node:os';
const FACE = process.env.JH_FACE || new URL('../../../.scratch/jensen/face/', import.meta.url).pathname;
import { holeUvPass, sculptPass, mapsPass, mouthBagPass, teethRigidPass, skinTonePass } from './blender/face-pass.mjs';
import { keepOrder, stripOld, addParts, writeKept, flatFront, teeUnder, neckSkirt, ownClips, lensPanes, matteFront } from './blender/assemble.mjs';
const MORPHS = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', ...['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'].map((v) => 'viseme_' + v),
  'mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight', 'eyeSquintLeft', 'eyeSquintRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'mouthClose',
  'eyeWideLeft', 'eyeWideRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPucker', 'mouthFunnel'];
const DIR = new URL('../../../storykit/handbuilt/jensen/', import.meta.url).pathname, PARTS = process.env.JH_PARTS || DIR + 'parts/';
const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'jensen.glb';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
const on = (k) => (!only || only.includes(k)) && !skip.has(k);
const { doc, src } = await read(process.env.JH_BASE || DIR + 'base-forged.glb');
keepOrder(doc);
// (assembly, iteration 1: the dark root paint kept off the neck under the ears: there it showed as two saw-toothed dark
// shards on the side of the neck in profile; below the ear's lobe only the back of the head is painted)
const scalp2Low = (y, z) => (z < -0.035 ? 1 : Math.max(0, Math.min(1, (y - 1.588) / 0.012)));
const steps = [
  // (the warm grin, kept at rest: MakeHuman Faceunits 01 (CC0) smile, cheek and eye squint at a third, in the rest shape)
  // (likeness round 1: the rest grin lighter and the cheek squint under it mostly gone: it pushed the cheeks out and up
  // into the round, puffy face the owner flagged; his reference's resting face is a closed, pleasant half-smile)
  // (likeness round 2b, the owner: an alert, open face: the brows a little raised, the grin a touch more)
  // (likeness round 3, the critic and the owner: no resting grin (it read as a smirk, one corner up, a sour pout in close-up):
  // the mouth neutral and relaxed, the lips just parted; the eyes open and alert (no squint, a little wide), the brows a
  // little raised)
  // (Blender round, iteration 1 (blender/face): "grin B": less smirk, the lips parted as in his photo, the brows up a touch)
  // (Blender round, iteration 2 (blender/face): the alert, open face of his photo: the eyes ~15% more open, the brows 2-3 mm up)
  // (v3 face R12: the corners a touch up over sealed lips: the smile 0.04 -> 0.12; the sculpt assumes jawOpen 0.07 (at 0 the
  // lower teeth poke through the chin in PP))
  // (the caricature, the owner 19 Nov: a big, warm, open presenter grin (the upper teeth showing, the corners well up, the
  // cheeks lifted with it; no eye squint baked: the eyes stay as made) and lively brows (the outer brows up, the inner
  // ones almost level: no worried look))
  // (caricature round 2, the critic: the baked open grin fought the talk visemes and read as a smirk: the rest face is a
  // closed, warm slight smile with lively brows; the big open presenter grin is the smile morph (x1.5 below), which the
  // engine drives on warm lines)
  // (round 3, the owner: "a symmetric warm smile, no smirk": both corners at 0.3, the cheeks' lift at 0.15)
  // (round 4, the critic: the rest smile read pursed and flat: both corners ~2 mm higher (0.42), the cheeks' lift 0.2 so the
  // smile reaches the eyes, the inner brows up 0.15 for the presenter's energy; the lips closed at rest (no jaw drop))
  ['grin', () => bakeRest(doc, (JSON.parse(process.env.JH_GRIN || 'null') || R5.grin || [['jawOpen', 0.0], ['mouthSmileLeft', 0.5], ['mouthSmileRight', 0.5], ['cheekSquintLeft', 0.22], ['cheekSquintRight', 0.22], ['browInnerUp', 0.15], ['browOuterUpLeft', 0.5], ['browOuterUpRight', 0.5], ['eyeWideLeft', 0.12], ['eyeWideRight', 0.12]]).map(([n, w]) => [FACE + n + '.target', w]))],
  // (round 4: his age in the face's shape: MakeHuman's own targets, age.mjs)
  // (likeness round 1: the owner's reference is a lean, taut face: no jowls or heavy cheeks; age.mjs's lean set)
  // (likeness round 2: a broad face (wider cheekbones and temples, a squarer, shorter midface and forehead), the mouth's
  // corners level with a fuller upper lip, narrower hooded eyes, the brows lower and straighter, no bags)
  // (likeness round 3, the critic: the hand sculpt's kinks and the pointed chin gone: no diamond or inverted-triangle head,
  // no narrowed chin. An oval face, broad at the cheekbones (gently prominent), a smooth cheek to a firm, moderately wide,
  // slightly squared jaw and a rounded chin; a shorter forehead; eyes open (no lowered lid or fold); full lips; the nose
  // broad at its base, wide rounded wings and a soft wide tip, a little shorter, its bridge lower)
  // (round 4, the critic: "a soft, doughy, child-like face": gentle under-eye bags, firmer cheekbone and jaw planes, a little
  // less cheek fat; the upper lip thinner and flatter (it read as a puffy pad); the eyes' shape untouched)
  ['ageshape', () => ageShapePass(doc, { lean: 1, laugh: 0, laughIn: 0.25, bag: 0.4, bagH: 0.1, fold: 0.1, brow: 0.3, lipUp: 0.3, lipLow: 0, lipUpInc: 0, bones: 0.75, temple: 0.5, foreV: 0.7, vol: 0.55, fat: 0.25, cheekIn: 0.4, chinW: 0, chinH: 0.3, angUp: 0.7, neckW: 1.0, neckD: 0.6,
    extra: [['head/head-square', 0.45], ['head/head-oval', 0.3], ['chin/chin-width-incr', 0.45], ['chin/chin-bones-incr', 0.5], ['mouth/mouth-lowerlip-volume-incr', 0.35],
      ['nose/nose-nostrils-width-incr', 0.7], ['nose/nose-point-width-incr', 0.6], ['nose/nose-flaring-incr', 0.5], ['nose/nose-scale-vert-decr', 0.35], ['nose/nose-hump-decr', 0.4], ['nose/nose-scale-depth-decr', 0.25], ['nose/nose-width2-incr', 0.3]],
    ...JSON.parse(process.env.JH_SHAPE || '{}') })],
  // (likeness round 3: round 2b's hand sculpt (its kinks) gone; the face's broad planes ironed, age.mjs; the two small holes
  // in the neck's skin behind the ears closed (the dark spot))
  ['smooth', () => smoothFacePass(doc, JSON.parse(process.env.JH_SMOOTH || '{}'))],
  ['holes', () => neckHolesPass(doc)],
  // (Blender round, iteration 2: the hole fill's four triangles that joined different uv islands (the neck streak, and the
  // dark lines they stamped across the forehead in the bake) re-pointed or moved to a small patch, blender/face-pass.mjs)
  ['holeuv', () => holeUvPass(doc)],
  // (Blender round, iteration 1: the head re-sculpted on the same points (blender/face/sculpt.py, a MakeHuman-format target):
  // broader, forward cheekbones, wider temples, no jowls, a tapered lower jaw, the chin 6 mm shorter, a wider nose and mouth)
  // (v3, the owner 19 Nov: "jawline is NOT that lean, cut, more normal and rounded": the landmark-fit head with pass R2
  // (blender/face/v3): the jaw corner, jaw line and lower cheeks fuller, the cheekbone hollow mostly filled, a broader,
  // rounder chin; the same points in the same order)
  ['sculpt', () => sculptPass(doc, PARTS + 'face/head-sculpt.target')],
  // (caricature round 2: one clean symmetric form on the same points: mirrored, the lumps ironed, apple cheeks; caricature.mjs)
  ['stylize', () => stylizeFacePass(doc, JSON.parse(process.env.JH_STYLE || '{}'))],
  ['chin', () => chinPass(doc)],
  // (round 5, the owner: "he looks a bit young, he's 63"; the critic: still a soft, round 45-50, the stylize smooth had
  // ironed the age targets flat: the age's forms sculpted on the smoothed face itself (age5.mjs))
  ['agesculpt', () => ageSculptPass(doc, JSON.parse(process.env.JH_ASCULPT || '{}'))],
  // (clean-shaven; an older man's skin: the age detail up, lentigines and crow's feet; round 4: less orange)
  // (likeness round 2: smoother: fewer dots, less of the painted age texture)
  // (likeness round 3, the critic: warm light tan, toward olive, not peach-pink; almost no dots)
  ['skin', () => paintSkin(doc, { handTone: 0.9, dot: 0.04, age: 0.6, stubble: 0, mul: [0.8, 0.745, 0.6], ...JSON.parse(process.env.JH_SKIN || '{}') })],
  // (round 4: the creases, folds and age spots of a man of 63, painted and in the normal map; the tone less saturated)
  // (likeness round 1: a fit man around 60, not a very wrinkled one: the creases at a little over half depth, fewer spots,
  // the tone a warm light tan)
  // (likeness round 2: smooth, taut skin: the forehead's lines at about a fifth, the folds by the mouth and the marionette
  // lines at half, no dark under the lids, almost no spots; the tone an olive tan, less saturated, less orange)
  // (likeness round 3, the critic: no dark under the eyes (they showed through the lenses as smudges) and no spots; a
  // faint brow and smile-line definition, natural nose-to-mouth folds: a fit man of about 60, taut)
  ['age', () => ageSkinPass(doc, { depth: 0.42, spots: 0, desat: 0.18, cool: [0.93, 0.91, 0.8], fore: 0.3, frown: 0.15, folds: 0.6, mar: 0.25, trough: 0, jowl: 0.15, neckR: 0.3, ...JSON.parse(process.env.JH_AGE || '{}') })],
  // (likeness round 2: charcoal grey, denser)
  // (likeness round 3, the critic: the brows thicker, straighter and darker: a dark grey, full)
  // (Blender round, iteration 1: 'brows' replaced by the Blender part, assemble.mjs)
  // (the scalp under the cut painted as short silver hair, not dark)
  // (likeness round 1: silver-grey, not white: darker at the roots and over the ears)
  // (likeness round 2: the front hairline 1.7 cm lower; the roots a darker grey)
  // (likeness round 3, the owner: a lower, fuller silver hairline, further forward at the temples; the roots and sides a
  // medium grey)
  ['scalp', () => scalpPass(doc, { root: [70, 69, 68], tip: [128, 127, 125], grey: [88, 87, 86], area: (x, y, z, n) => hairArea(x, y, z, n, 0.047, 0.006) * scalp2Low(y, z) })],
  // (likeness round 2: new strand cards (strands.mjs) for the forge's cut: thick, tousled silver-grey hair lifted up and a
  // little forward off a lower front hairline, a full crown, the temples covered, short sides; no card tiles or wedges)
  // (likeness round 3, the critic: denser and softer: about twice the cards, narrower, finer strands with long alpha
  // tips and tapered card ends (no spiky shards), anisotropic highlights; the roots and sides a medium grey, silver tips;
  // a rounder front quiff, the crown lower, fuller, slightly fluffy sides over the ears (the ears clear))
  // (Blender round, iteration 1: 'strands' replaced by the Blender part, assemble.mjs)
  ['fingers', () => fingerPass(doc, { slim: 0.07 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc, { base: [70, 46, 32] })],
  // (round 4: the moto jacket is the forge library's tailored cut (forge-base.mjs), made black leather with its zips here)
  // (likeness round 1: the stand collar a real moto band, taller, close round the neck; before the paint, which places
  // the collar's snaps by where its points are)
  // (likeness round 3, the critic and the owner: the band collar as one continuous, softly curved band round the neck,
  // meeting near the front over a narrow V of the tee, its foot inside the jacket's neckline, a stitched top edge and a
  // snap tab with two snaps on his left at the throat's base (collar.mjs), in place of the library collar)
  // (Blender round, iteration 1: 'collar' replaced by the Blender part, assemble.mjs)
  // (likeness round 2b: the front hangs straight from the chest, no bust, moto.mjs)
  // (Blender round, iteration 1: 'drape' replaced by the Blender part, assemble.mjs)
  // (likeness round 3, the critic: a fitted moto cut, not a lumpy barrel: smoothed, the chest flatter, padded shoulder caps)
  // (Blender round, iteration 1: 'tailor' replaced by the Blender part, assemble.mjs)
  // (Blender round, iteration 1: 'jacket' replaced by the Blender part, assemble.mjs)
  ['tee', () => teePass(doc)],
  // (round 4: the tee's hem taken up under the short jacket)
  ['teehem', () => teeHemPass(doc)],
  // (likeness round 1: the tee cut away under the jacket's shoulders, where its edges came through as shards)
  ['teeshoulder', () => teeShoulderPass(doc)],
  ['jeans', () => jeansPass(doc)],
  // (likeness round 1, the owner: "glasses aren't right style": his are a thin metal semi-rimless (browline) frame, slim
  // rectangular lenses of shallow height under a thin dark gunmetal top bar, rimless below, thin wire temples)
  // (likeness round 2: wider lenses to the cheekbones' edge, set higher (the brows nearly on the bar), a thinner gunmetal
  // bar swept up at its outer ends, continuous wire temples and bridge, the rimless edge a faint clear line)
  // (likeness round 3, the critic and the owner: a thin gunmetal browline, the lenses wider and shallower (a slightly
  // rounder lower outer corner), the top bar a little darker and thicker and seated lower, on the nose: just over the
  // eyes, never across them, the eyes in the lens's upper middle; no painted glint streaks and a faint rimless edge, the
  // lens a real clear pane that catches the light (frames.mjs K.pane))
  // (Blender round, iteration 1: 'glasses' replaced by the Blender part, assemble.mjs)
  // (round 4: no extra saturation or warmth for him: the round-3 skin read orange and doll-like)
  ['scatter', () => skinScatterPass(doc, JSON.parse(process.env.JH_SCATTER || '{}'))],
  // (the caricature: the head 1.2 x for the body, the head bone's scale, now kept by writeKept (it was written back to 1 before))
  // (round 2, the owner: "he looks like a midget": adult proportions, the head as made; proportionPass sets the final 1.02)
  ['headsize', () => headSizePass(doc, +(process.env.JH_HEAD || 1.0))],
  ['daylight', () => daylightSkinPass(doc, { sat: 1.0, warm: [1.01, 0.995, 0.98], gain: 0.82 })],
  // (likeness round 2b: the tee's crew neck painted in the jacket's open collar, moto.mjs)
  // (Blender round, iteration 1: the face's own skin, MR and normal maps and the eyes (blender/face/bake.py, eyetex.py); the
  // scalp under the new hair repainted on them a darker root grey (the light paint showed through the cards as streaks);
  // the mouth's dark inside)
  ['facemaps', () => mapsPass(doc, PARTS + 'face/')],
  // (assembly, iteration 1: in the game's lights the bake read orange: less saturated, lifted to a warm light tan)
  ['skintone', () => skinTonePass(doc, JSON.parse(process.env.JH_TONE || '{}'))],
  // (caricature round 2, the owner: "skin too orange: lighter, natural, neutral, like the references"; the hands the face's tone)
  ['grade', () => skinGradePass(doc, { T: [213, 180, 156], ...JSON.parse(process.env.JH_GRADE || '{}') })],
  // (round 2, the owner's standing note "he reads younger than 63": soft creases of a fit man in his sixties painted back on
  // the graded map (the Blender face maps had replaced round 4's): the nose-to-mouth folds, crow's feet, a few forehead
  // lines, the marionette lines faint; no spots, no tone change)
  // (round 3, the critic: "still reads younger": the crow's feet and forehead a touch deeper, the nose-to-mouth folds as before)
  ['age2', () => ageSkinPass(doc, { depth: 0.7, spots: 0, desat: 0, cool: [1, 1, 1], fore: 0.3, frown: 0.16, folds: 0, mar: 0, trough: 0.15, jowl: 0.2, neckR: 0.3, ...JSON.parse(process.env.JH_AGE2 || '{}') })],
  // (caricature round 2: the scalp under the cards silver-white, no dark root band at the hairline)
  ['scalp2', () => scalpPass(doc, { root: [168, 170, 174], tip: [205, 207, 211], grey: [188, 190, 194], area: (x, y, z, n) => hairArea(x, y, z, n, 0.047, 0.006) * scalp2Low(y, z) })],
  // (round 3, the critic: the grin a one-sided sneer, no upper teeth, a pale inner-lip band: the face's normal and
  // roughness maps mirrored as its albedo is; the lips' inner faces a deep rose to dark red; the upper teeth up and
  // forward behind the lips, so the presenter grin shows them (mouth.mjs))
  ['facemirror', () => faceMirrorMapsPass(doc, JSON.parse(process.env.JH_FMIRROR || '{}'))],
  // (round 4, the critic: the folds hard jagged gouges, extra parallel lines, dark wedges at the lower lip's corners: the
  // maps eased there into one broad soft crease per side; the lips darker, toward the skin (face4.mjs))
  // (round 5: age2's own folds and marionette lines and foldsoft's crease off: age5.mjs places them on the measured face)
  ['foldsoft', () => foldSoftPass(doc, { crease: 0, ...JSON.parse(process.env.JH_FOLD || '{}') })],
  // (round 5: the lips' inner faces coloured out to the grin's corners and the mouth's dark inside wider: pale wedges
  // showed at the corners of the open grin; the skin's grade a touch less pink (more neutral warmth, not orange))
  ['innerlip', () => innerLipPass(doc, { half: 0.036, ...JSON.parse(process.env.JH_INLIP || '{}') })],
  ['liptone', () => lipTonePass(doc, JSON.parse(process.env.JH_LIPT || '{}'))],
  // (round 5: creases that read at a webcam tile's size, living skin variation and pores, the chin's lip-tone smear cleaned (age5.mjs))
  ['agepaint', () => agePaintPass(doc, { fore: 0.85, ...JSON.parse(process.env.JH_APAINT || '{}') })],
  ['teethfwd', () => teethForwardPass(doc, JSON.parse(process.env.JH_TEETHF || '{}'))],
  ['mouthbag', () => mouthBagPass(doc, { rx: 0.031, ...JSON.parse(process.env.JH_MOUTH || '{}') })],
  ['teecrew', () => teeCrewPass(doc)],
  // (the talking face, last: MakeHuman Faceunits 01 and Visemes 02 (CC0) as glTF morph targets, the names and the set
  // Mog City's face.js plays (FACE-CONTRACT: blinks, jaw, the 15 visemes, the grin and what rides it, brows, spares);
  // the lashes and brows ride the lids and brows, the lower teeth the jaw)
  // (caricature round 2: the smile morph 1.5 x, a strong open presenter grin at the engine's 0.45; the eye squint that rides
  // it at 0.4 (a mild lower-lid lift only, the eyes stay open))
  ['morphs', () => { const G = grinTargets(FACE, os.tmpdir() + '/jensen-grin', JSON.parse(process.env.JH_GRINT || '{}')); return addMorphs(doc, MORPHS.map((n) => [n, G[n] || FACE + n + '.target', /^mouthSmile/.test(n) ? 1.4 : /^eyeSquint/.test(n) ? 0.4 : 1])); }],
  ['smilechin', () => smileChinPass(doc)],
  // (round 3: no lower-lip triangle folds as the jaw opens; the corners' hole-fill points move with the lips, mouth.mjs)
  ['relax', () => relaxMorphsPass(doc, JSON.parse(process.env.JH_RELAX || '{}'))],
  // (Blender round, iteration 1: the lower teeth swing as one piece about the jaw's hinge in every target)
  ['teethrigid', () => teethRigidPass(doc, JSON.parse(process.env.JH_TEETH || '{}'))],
  // (round 4, the critic: the close-up grin a one-sided smirk: the relax pass and the corners' hole fills had left the smile
  // pair and jawOpen millimetres out of mirror; the rest shape and every face morph made exact mirror twins (face4.mjs))
  ['sym', () => symFacePass(doc, JSON.parse(process.env.JH_SYM || '{}'))],
  // (Blender round, iteration 1: the Blender parts (parts.mjs, assemble.mjs) in place of the round-3 hair, brows, glasses and
  // jacket: the leather moto jacket (cloth-draped, a full-length metal zip, a band collar with two snap tabs, quilted
  // shoulders), the groomed hair cards and card brows, the browline glasses)
  ['strip', () => stripOld(doc)],
  // (v3: the tousled groom (hair/v3, fitted on 12464129: fit-h12), the flat-front jacket v3b (fitted on round 3's body:
  // fit-r3, the torso the same in every head since), the r2 glasses (fitted on the 07:00 v3 face: fit-v3f1))
  // (v3 iteration 2: the salt-and-pepper groom (fit-h12), the semi-matte jacket v3c with slimmer sleeves (fit-r3), the r3
  // glasses refitted on the R12 face (fit-r12))
  ['parts', () => addParts(doc, PARTS)],
  // (the owner, 18 Nov: no humps: the jacket's front flat from the chest to the hem, the waist under it pulled in behind it)
  // (iteration 2: the jacket cut flat in Blender itself; here only the waist under its hem pulled in, as its sim saw it)
  ['flat', () => flatFront(doc, JSON.parse(process.env.JH_FLAT || '{}'))],
  // (round 3, the critic: the dark round dent on his right chest by the collar was front points riding the upper-arm bone
  // (pulled into the chest as the arms came down): the arm bones' shares faded out across the chest; the inflated upper
  // arms slimmed toward the arm's bone line; the shoulders' quilted ribs crisper and flatter (jacket3.mjs))
  ['chestweights', () => chestWeightsPass(doc, JSON.parse(process.env.JH_CHESTW || '{}'))],
  ['slimsleeves', () => slimSleevesPass(doc, JSON.parse(process.env.JH_SLEEVES || '{}'))],
  ['crisp', () => crispLeatherPass(doc, JSON.parse(process.env.JH_CRISP || '{}'))],
  // (v3 assembly: the front's shading normals turned straight ahead and the leather's coat calmer: in the game's bright
  // light the flat front's gentle arc still caught two highlights that read as mounds)
  // (v3c jacket: semi-matte leather made in its own textures and material (roughness 0.52-0.88, clearcoat 0.05 at 0.6,
  // specular 0.3, extras.look): only the front's normals straightened here, its roughness and coat left as made)
  // (the caricature, the owner 19 Nov: the big silver swoop lifted up and back off the scalp, the browline glasses a
  // little oversized with a thicker gunmetal bar (caricature.mjs); after the parts, before the waist and lens steps)
  // (round 2, the critic: not a tall front pompadour but a broad, soft, rounded dome swept up and BACK and a little to his
  // left: the front peak low, the volume at the crown, wide at the temples and full over the ears)
  ['swoop', () => hairSwoopPass(doc, { quiff: 0.01, top: 0.022, back: 0.026, side: 0.014, flowBack: 0.024, flowSide: 0.006, flatFront: 0.004, ...JSON.parse(process.env.JH_SWOOP || '{}') })],
  // (round 2: the front 1.12 x, the bar NOT thicker; then lowered under the brows, a fine dark rim, satin gunmetal)
  ['dome', () => hairDomePass(doc, JSON.parse(process.env.JH_DOME || '{}'))],
  // (round 3, the critic: "thin rimless half-rims": the browline bar 1.9 x thicker, grown upward off its lower edge so the
  // eyes stay clear; a darker gunmetal, the lower rims dark and opaque)
  ['bigglasses', () => glassesBigPass(doc, { big: 1.12, bar: 1.9, yBarC: 1.6305, col: null, ...JSON.parse(process.env.JH_GLASSES || '{}') })],
  ['glassesfit', () => glassesFitPass(doc, { rim: [0.05, 0.052, 0.058, 1], col: [0.1, 0.104, 0.112], metal: 0.8, rough: 0.38, ...JSON.parse(process.env.JH_GFIT || '{}') })],
  // (round 4, the critic: the lower rims so thin the glasses read as one floating bar: the rims 1.5 x, opaque gunmetal;
  // the brows soft clean shapes, not scratchy strands (face4.mjs))
  ['rims', () => rimPass(doc, { grow: 0.0015, ...JSON.parse(process.env.JH_RIMS || '{}') })],
  ['browsoft', () => browSoftPass(doc, { ...R5.brows, ...JSON.parse(process.env.JH_BROWS || '{}') })],
  // (round 2: the hair silver-white, the outfit all black with glossy leather and silver hardware, the caricature's proportions)
  ['hairwhite', () => hairWhitePass(doc, JSON.parse(process.env.JH_HAIRW || '{}'))],
  // (round 3, the owner: "hair and mouth need a bit more work"; the critic: a spiky brush of thin cards with paper-shred
  // edges and a hard grey band at the hairline): the cards and cap out, a stylized sculpt in: one smooth dome swept up and
  // back, full at the temples and over the ears, and a dozen smooth rounded clump shells on it (clumps.mjs)
  ['clumps', () => hairClumpsPass(doc, { ...R5.hair, ...JSON.parse(process.env.JH_CLUMPS || '{}') })],
  ['outfit', () => outfitPass(doc, JSON.parse(process.env.JH_OUTFIT || '{}'))],
  // (round 5, the critic: "too smooth, glossy and plasticky", grey smudges on the shoulders: grain, crease wear at the
  // elbows and pockets, a rougher leather under a thin soft coat, deeper quilting (jacket3.mjs))
  ['leatherwear', () => leatherWearPass(doc, JSON.parse(process.env.JH_LEATHER || '{}'))],
  ['proportion', () => proportionPass(doc, JSON.parse(process.env.JH_PROP || '{}'))],
  ['matte', () => matteFront(doc, { rough: 0, coat: 0.05, spec: 0.3, ...JSON.parse(process.env.JH_MATTE || '{}') })],
  // (iteration 2: the tee's flared hem out from under the flat front)
  ['teeunder', () => teeUnder(doc)],
  // (iteration 2: the neck's skin hung down into the lower collar: the forge's saw-tooth cut showed over it at the sides)
  ['skirt', () => neckSkirt(doc, JSON.parse(process.env.JH_SKIRT || '{}'))],
  // (iteration 2: the clear lens panes out: the engine's shadow from them greyed his eyes; the polished edges stay)
  ['lenses', () => lensPanes(doc, JSON.parse(process.env.JH_LENSES || '{}'))],
  // (iteration 2, the owner's posture notes: his idle, talk, phone, arms and seated clips stacked on the plumb line, his own)
  // (v3b, the owner: "chest and stomach should NOT protrude": the clips' spine zig-zag folded the torso belly-out, chest-in;
  // his six clips now turn the trunk as one piece, the seated lean capped at 8 degrees (blender/jacket posture2.py))
  ['posture', () => ownClips(doc, PARTS + 'clips-posture.glb')],
  // (iteration 1's 'comb' and 'hairlook' (assemble.mjs combBack, hairLook) gone: the iteration-2 groom lies up and back in
  // layers, its own cut (0.35) and colour made for the engine's strand shader)
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
const glb = await writeKept(doc, src, new Set([...(on('headsize') || on('proportion') ? ['head'] : []), ...(on('proportion') ? ['wrist_L', 'wrist_R'] : [])])); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
