(function () {
// Scene-linear color grading and lens bloom, composed in the existing final render pass.
const { THREE } = window.NYC;
const { Fn, uniform, float, vec2, vec3, vec4, dot, mix, min, max, pow, smoothstep, length, screenUV, screenSize, If, normalize, exp, acos, clamp, sin, abs, time } = window.NYC.TSL;
const { bloom } = window.NYC.PostFX;

// Exposure and white balance belong to the camera, independently of the physical lighting presets.
// Keep exposure restrained for ACES; stronger bloom stays selective so midtones retain their contrast.
const LOOKS = {
  golden:   { exposure: 1.04, contrast: 1.12, saturation: 1.08, balance: [1.045, 1.00, 0.955], bloom: 0.24, threshold: 1.20 },
  midday:   { exposure: 1.00, contrast: 1.10, saturation: 1.06, balance: [1.015, 1.00, 0.985], bloom: 0.18, threshold: 1.35 },
  twilight: { exposure: 1.06, contrast: 1.10, saturation: 1.08, balance: [1.025, 0.995, 1.015], bloom: 0.28, threshold: 1.05 },
  midnight: { exposure: 1.04, contrast: 1.08, saturation: 1.06, balance: [0.985, 1.00, 1.035], bloom: 0.30, threshold: 1.00 }
};
// (wagmi/apocalypse adds SF 2040's looks here, by its lighting presets' ids; a look's vignette defaults to the lens's own)
window.NYC.GRADE_LOOKS = LOOKS;
// (SF 2040, wagmi/apocalypse/fx.js: a crater's light on the horizon, laid over the frame after the haze, so the city's
// aerial fog does not wash it to cream: at: its centre (x, y, z) and strength (w, 0 off); r its radius, m. Shared by
// every grade built, the SSR toggle's rebuild too)
const CRATER = window.NYC.CRATER_GLOW = { at: uniform(new THREE.Vector4(0, 0, 0, 0)), r: uniform(650) };

function createPostProcessing(renderer, sceneColor, reflections, depth, camera, lighting) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Exposure is applied before bloom so its threshold follows the image's exposed brightness.
  // RenderPipeline performs ACES and the output color-space conversion exactly once, after this graph.
  renderer.toneMappingExposure = 1.0;

  const exposure = uniform(1.0);
  const contrast = uniform(1.0);
  const saturation = uniform(1.0);
  const balance = uniform(new THREE.Vector3(1, 1, 1));
  const vignetteAmount = uniform(0.12);
  // (SF 2040: greens dried toward olive and straw, 0 none .. 1)
  const dryGreens = uniform(0);
  // (and the deepest shadows lifted a little toward a warm haze, so a street in shade stays readable: 0 none)
  const shadowLift = uniform(0);
  const fogEnabled = uniform(1);
  const inverseProjection = uniform(camera.projectionMatrixInverse);
  const cameraWorld = uniform(camera.matrixWorld);
  // WebGPU clip depth is [0,1], reversed Z clears to zero, and texture V runs downwards.
  // The camera inverse already includes reversed Z. Resolved depth makes fog
  // independent of material count/overdraw. The sky keeps its physical shader above the marine horizon.
  const fogged = Fn(() => {
    const color = sceneColor.rgb.add(reflections.rgb).toVar();
    If(fogEnabled.greaterThan(0.5), () => {
      const clip = vec4(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y.mul(2)), depth.r, 1);
      const view = inverseProjection.mul(clip).toVar();
      const world = cameraWorld.mul(vec4(view.xyz.div(view.w), 1)).xyz;
      const eye = cameraWorld.mul(vec4(0, 0, 0, 1)).xyz;
      // Surface fog uses the resolved opaque depth; the sky only receives horizon haze.
      If(depth.r.greaterThan(0), () => {
        const atmosphere = lighting.createAerialFogNode(world, eye);
        color.assign(mix(color, atmosphere.color, atmosphere.amount));
      }).Else(() => {
        const elevation = normalize(world.sub(eye)).y;
        const horizon = float(1).sub(smoothstep(0.02, 0.3, elevation));
        const marineColor = vec3(0.7, 0.76, 0.8).mul(float(1).sub(lighting.uNightFactor.mul(0.93)));
        color.assign(mix(color, marineColor, lighting.uMarine.mul(horizon).mul(0.95)));
      });
    });
    return color;
  })();
  // the crater's light: toward it on the horizon, on whatever stands beyond most of the way to it (the sky, the far
  // hills: a building or a ridge nearer stays in front of it), a deep red glow rising off it and its rim a molten band
  // (x: the glow, y: the band)
  const craterLight = Fn(() => {
    const out = vec2(0, 0).toVar();
    If(CRATER.at.w.greaterThan(0.001), () => {
      const eye = cameraWorld.mul(vec4(0, 0, 0, 1)).xyz;
      const vh = inverseProjection.mul(vec4(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y.mul(2)), 0.5, 1));
      const dir = normalize(cameraWorld.mul(vec4(vh.xyz.div(vh.w), 1)).xyz.sub(eye));
      const c = CRATER.at.xyz.sub(eye), cd = max(length(c.xz), 1.0);
      const ang = acos(clamp(dot(normalize(dir.xz), c.xz.div(cd)), -1, 1));
      const w = CRATER.r.mul(1.7).div(cd);
      const el = dir.y.div(max(length(dir.xz), 0.001)), hb = c.y.div(cd);
      // (the depth's own distance: the sky is beyond everything)
      const clip = vec4(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y.mul(2)), depth.r, 1);
      const view = inverseProjection.mul(clip);
      const far = depth.r.greaterThan(0).select(smoothstep(cd.mul(0.62), cd.mul(0.85), length(view.xyz.div(view.w))), float(1));
      const across = exp(ang.div(w).pow(2).mul(-1.6));
      const up = max(el.sub(hb), 0.0);
      const glow = across.mul(exp(up.div(float(560).div(cd)).negate())).mul(far);
      // (the rim: from its foot to 120 m up, across its width, flickering along it)
      const rimTop = c.y.add(120).div(cd), rimIn = smoothstep(w.mul(0.5), w.mul(0.38), ang);
      const fl = sin(ang.mul(cd).mul(0.045).add(time.mul(1.7))).mul(sin(ang.mul(cd).mul(0.017).sub(time.mul(0.9)))).mul(0.3).add(0.75);
      const band = smoothstep(rimTop, rimTop.sub(float(70).div(cd)), el).mul(smoothstep(hb.sub(float(30).div(cd)), hb.add(float(20).div(cd)), el)).mul(rimIn).mul(fl).mul(far);
      out.assign(vec2(glow, band).mul(CRATER.at.w));
    });
    return out;
  })();
  const exposed = max(fogged, vec3(0)).mul(exposure).mul(balance);

  // Limit only bloom's peak radiance, scaling RGB together to retain neon and lamp colors.
  // The original HDR image keeps its full range for the tone mapper's highlight shoulder.
  const peak = max(max(exposed.r, exposed.g), exposed.b);
  const bloomInput = vec4(exposed.mul(float(8.0).div(max(peak, 8.0))), 1.0);
  const bloomPass = bloom(bloomInput, 0.24, 0.40, 1.20);
  bloomPass.smoothWidth.value = 0.30;
  bloomPass.setResolutionScale(0.5);

  const outputNode = Fn(() => {
    const color = exposed.add(bloomPass.rgb).toVar();
    If(dryGreens.greaterThan(0.001), () => {
      // how much greener than its red and blue a colour is; that much of it turned toward straw
      const rb = max(color.r, color.b), excess = max(color.g.sub(rb), 0.0);
      const k = smoothstep(0.0, 0.12, excess.div(max(color.g, 0.0001))).mul(dryGreens);
      const straw = vec3(color.g.mul(0.92), color.g.mul(0.8), color.g.mul(0.55));
      color.assign(mix(color, straw, k));
    });
    const luma = dot(color, vec3(0.2126, 0.7152, 0.0722)).toVar();
    If(shadowLift.greaterThan(0.0001), () => {
      color.addAssign(vec3(1.0, 0.8, 0.62).mul(shadowLift).mul(float(1).sub(smoothstep(0.0, 0.12, luma))));
      luma.assign(dot(color, vec3(0.2126, 0.7152, 0.0722)));
    });

    // Gentle cool shadow / warm highlight separation; multiply rather than lifting the black level.
    const shadows = mix(vec3(0.965, 1.005, 1.045), vec3(1), smoothstep(0.02, 0.60, luma));
    const highlights = mix(vec3(1), vec3(1.035, 1.005, 0.965), smoothstep(0.60, 3.0, luma));
    color.mulAssign(shadows.mul(highlights));

    // Contrast pivots around middle gray and scales RGB together, avoiding per-channel gamma shifts.
    color.mulAssign(pow(max(luma, 0.0001).div(0.18), contrast.sub(1.0)));
    const gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
    const chroma = max(max(color.r, color.g), color.b).sub(min(min(color.r, color.g), color.b));
    const vibrance = float(0.10).mul(float(1).sub(chroma.div(max(max(max(color.r, color.g), color.b), 0.0001))));
    color.assign(max(mix(vec3(gray), color, saturation.add(vibrance)), vec3(0)));
    // (the crater's light over the grade, so it keeps its red: a deep red glow laid over, the rim's molten orange added)
    If(CRATER.at.w.greaterThan(0.001), () => {
      color.assign(mix(color, vec3(1.1, 0.07, 0.015), craterLight.x.mul(0.88)));
      color.addAssign(vec3(1.5, 0.26, 0.02).mul(craterLight.y));
    });

    // Normalize by the corner radius so the lens falloff remains subtle in portrait and landscape.
    const aspect = screenSize.x.div(screenSize.y);
    const radius = length(screenUV.sub(0.5).mul(vec2(aspect, 1))).div(length(vec2(aspect, 1).mul(0.5)));
    const vignette = float(1).sub(smoothstep(0.35, 1.0, radius).mul(vignetteAmount));
    return vec4(color.mul(vignette), 1.0);
  })();

  function applyPreset(id) {
    const look = LOOKS[id] || LOOKS.golden;
    exposure.value = look.exposure;
    contrast.value = look.contrast;
    saturation.value = look.saturation;
    balance.value.set(...look.balance);
    bloomPass.strength.value = look.bloom;
    bloomPass.threshold.value = look.threshold;
    vignetteAmount.value = look.vignette ?? 0.12;
    dryGreens.value = look.dryGreens ?? 0;
    shadowLift.value = look.shadowLift ?? 0;
  }

  applyPreset('golden');
  return { outputNode, fogEnabled, bloomPass, applyPreset, exposure, contrast, saturation, balance };
}

Object.assign(window.NYC, { createPostProcessing });
})();
