    /* =================================================== the kart roster == */
    // Included into the kart kit (kart.js), and so only into a kart world's runtime: Meme Kart's eight racers, each a
    // character and a kart built in code (signed distance fields meshed by marching cubes, every colour region its own
    // mesh, expressions as morph targets), here once for every kart world, so a world (and a Mog of it) names a racer
    // instead of carrying its recipe. ctx.kart.racer(id, { jersey, paint, name, stats }) builds one (the bottom of this
    // file); kart.js drives it from the race.
    //
    // The eight, as the owner chose them (6 Oct): the stars Pepe, Doge, Shiba and Bike Tyson (a made-up face, no face
    // tattoo: as built), and four original rivals, Bull Run, Big Bear, The Whale and Moon Cat. Each was drawn up on its
    // own sheet with its own copies of the shared parts; here there is one marching-cubes kit (KR.EndoKit), one set of
    // helpers (KR.DogFinal.util), one kart kit (KR.DogKartKit, every kart's own hooks in it), one toon program and one
    // eye program (KR.mat), and the recipes otherwise exactly as drawn: built here, each racer is the same geometry, to
    // the byte, as on its sheet.
    //
    // Five more, drawn for Aspen GP (9 Oct), ride only the snow sled: White Whale, Lux, Lord Black Diamond, Whiteout One
    // and Whiteout Two (kartRosterAddons, after the library).
    //
    // The library is built the first time a world asks for a racer (kartRosterLib), not on every boot of a kart world.
    var KROSTER;   // (declared, never assigned at this line: see KRS below)
    function kartRosterLib() {
      if (KROSTER) return KROSTER;
      var KR = {};
      /* The roster's materials: ONE toon program for every racer and kart, ONE eye program for all eight pairs of eyes, and
       * the two transparent ones (Moon Cat's helmet, the Bubble Sub's glass and water). Each racer gets its own instances
       * (its jersey, its gaze), and every instance of a kind shares the one program, so each compiles once.
       *
       *   KR.mat.toon(THREE, { jersey, jersey0, rim, spec, fur })    program 'gm-kart-toon'
       *   KR.mat.eye(THREE, 'pepe' | 'dog' | 'cat')                  program 'gm-kart-eye'
       *   KR.mat.glass(THREE, { tint, rim })                         program 'gm-kart-glass' (the helmet)
       *   KR.mat.water(THREE)                                        program 'gm-kart-water' (the tub)
       */
      (function (root) {
        'use strict';

        /* ------------------------------------------------------------------ the gm-kart-toon material
         * kz = (roughness, warm-terminator weight, zone, ao). zone 0 plain, 1 palette slot (jersey), 2 glow (emissive),
         * 3 fur (wrapped band, warm self-fill so shadows never go grey/olive, a soft strand micro-normal that fades out
         * both close up and far away), 4 matte (mouth interior: no light-side kick, no specular). (Pepe's own toon was
         * the first three zones of it, drawn the same.)
         *
         * Lit as a toy on a kart game's track (the owner, 7 Oct: "a slight glow or outline aura on each character making
         * it have less depth"). Measured on To The Moon's dusk, the sun low and behind the racers in the chase camera, the
         * aura was three things, and none of them is here now:
         *   - a sky-blue fresnel rim, kRim (#CFE0FF) x (1 - N.V)^3 x 0.45, ADDED as light round every silhouette (0.15
         *     to 0.39 at the edge, where the camera-facing side, lit by the sky alone, is about 0.1): a pale outline on
         *     every head, body and tyre. Gone; what is left is a kick of the light's own colour times the surface's, only
         *     on the side the light is on and only in the last sliver of the edge (kKick), never a ring;
         *   - the back light's specular at grazing angles: GGX with N.V under 0.3 and the sun behind came to 1 to 3 (x 0.62),
         *     past the bloom's knee, so the edge of every fur and paint surface lit up in white beads that bloomed into a
         *     halo. The direct specular now fades out toward the silhouette (N.V 0.12 to 0.45) and is held under 0.9, and
         *     the environment's sheen at the edge is held down with it;
         *   - the bloom itself, whose soft knee starts at half the threshold (0.56 here), so a racer's lit orange or cream
         *     bled into the air round it. A racer is now kept out of the bloom: drawn into the race's picture, it marks
         *     its pixels (alpha 0, kMask, set per draw for the runtime's HDR target only) and the bloom passes over them;
         *     its glow zone (headlights, the firefly) still blooms.
         * In their place the form: a fill that follows the camera (kFill: from over the camera's left shoulder, the
         * colour of the world's own sky light, stronger the more the sun is behind the racer), so the side you see has a
         * light side and a shadow side even with the sun in your eyes; and the baked occlusion (kz.w) taken again over
         * the sky and that fill, so the creases, the seat and the wheel arches go dark the way a toy's do. */
        // a racer kept out of the bloom: drawn into the race's picture (the runtime's HDR target, which the kart kit
        // marks gmBloomMask), kMask is 1 and the shader writes alpha 0, which the bloom's first pass reads as "not
        // mine"; anywhere else (the start screen's portraits, a reflection) the alpha is the material's own
        function bloomMask(mat, U) {
          mat.onBeforeRender = (r) => { const t = r.getRenderTarget(); U.kMask.value = t && t.gmBloomMask ? 1 : 0; };
        }
        // (and a transparent one, glass or water, over it: in the race's picture it clears the alpha under it, so the
        // helmet's or the tub's bright edge is the racer's too; elsewhere it blends its alpha as before)
        function bloomMaskBlend(THREE, mat) {
          const a0 = [mat.blending, mat.blendSrcAlpha, mat.blendDstAlpha];
          mat.onBeforeRender = (r) => {
            const t = r.getRenderTarget(), on = !!(t && t.gmBloomMask);
            if (on) {
              if (mat.blending !== THREE.CustomBlending) { mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor; }
              mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.ZeroFactor;
            } else { mat.blending = a0[0]; mat.blendSrcAlpha = a0[1]; mat.blendDstAlpha = a0[2]; }
          };
        }

        function toon(THREE, o) {
          o = o || {};
          const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0, vertexColors: true, envMapIntensity: 0.32 });
          const U = {
            kRim: { value: new THREE.Color(o.rim || '#CFE0FF') }, kJersey: { value: new THREE.Color(o.jersey || '#2E62B8') }, kJersey0: { value: new THREE.Color(o.jersey0 || '#2E62B8') },
            kTerm: { value: new THREE.Color('#E0603A') }, kFlash: { value: 0 }, kSpec: { value: o.spec === undefined ? 0.62 : o.spec }, kFur: { value: o.fur === undefined ? 1 : o.fur },
            kFill: { value: o.fill === undefined ? 1 : o.fill }, kKick: { value: o.kick === undefined ? 0.35 : o.kick }, kAO: { value: o.ao === undefined ? 0.5 : o.ao }, kMask: { value: 0 },
          };
          mat.userData.uniforms = U;
          bloomMask(mat, U);
          mat.onBeforeCompile = (sh) => {
            Object.assign(sh.uniforms, U);
            sh.vertexShader = 'attribute vec4 kz; varying vec4 vKz; varying vec3 vObj;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vKz = kz; vObj = position;');
            const lights = THREE.ShaderChunk.lights_physical_pars_fragment
              .replace('vec3 irradiance = dotNL * directLight.color;',
                'float kFurW = step( 2.5, vKz.z ) * step( vKz.z, 3.5 );\n' +
                '\tfloat kRaw = dot( geometryNormal, directLight.direction );\n' +
                '\tfloat kBand = mix( smoothstep( 0.02, 0.30, dotNL ), smoothstep( -0.3, 0.45, kRaw ), kFurW );\n' +
                '\tvec3 kTint = mix( vec3( 1.0 ), kTerm * 1.6, 0.25 * vKz.y * 4.0 * kBand * ( 1.0 - kBand ) );\n' +
                '\tvec3 irradiance = ( 0.8 * kBand + 0.2 * dotNL ) * kTint * directLight.color;')
              .replace('reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );',
                'float kNVd = saturate( dot( geometryNormal, geometryViewDir ) ), kZ4 = 1.0 - step( 3.5, vKz.z );\n' +
                '\treflectedLight.directSpecular += kSpec * kZ4 * smoothstep( 0.12, 0.45, kNVd ) * min( irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material ), vec3( 0.9 ) );\n' +
                // the light-side kick: the light's colour on the surface's own, in the last sliver of the edge it lights
                '\treflectedLight.directDiffuse += kKick * kZ4 * pow( 1.0 - kNVd, 4.0 ) * smoothstep( 0.1, 0.6, dotNL ) * directLight.color * BRDF_Lambert( material.diffuseColor );');
            const noise = [
              'float kH( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }',
              'float kN( vec3 x ) { vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );',
              '  return mix( mix( mix( kH( i ), kH( i + vec3( 1, 0, 0 ) ), f.x ), mix( kH( i + vec3( 0, 1, 0 ) ), kH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),',
              '             mix( mix( kH( i + vec3( 0, 0, 1 ) ), kH( i + vec3( 1, 0, 1 ) ), f.x ), mix( kH( i + vec3( 0, 1, 1 ) ), kH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }',
            ].join('\n');
            sh.fragmentShader = 'uniform vec3 kRim; uniform vec3 kJersey; uniform vec3 kJersey0; uniform vec3 kTerm; uniform float kFlash; uniform float kSpec; uniform float kFur; uniform float kFill; uniform float kKick; uniform float kAO; uniform float kMask; varying vec4 vKz; varying vec3 vObj;\n' + noise + '\n' + sh.fragmentShader
              .replace('#include <lights_physical_pars_fragment>', lights)
              .replace('#include <color_fragment>', '#include <color_fragment>\n float kJz = step( 0.5, vKz.z ) * step( vKz.z, 1.5 );\n diffuseColor.rgb *= mix( vec3( 1.0 ), kJersey / max( kJersey0, vec3( 0.001 ) ), kJz );')
              .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = vKz.x;')
              .replace('#include <normal_fragment_maps>', [
                '#include <normal_fragment_maps>',
                'float kFz = step( 2.5, vKz.z ) * step( vKz.z, 3.5 ) * kFur;',
                'if ( kFz > 0.0 ) {',
                '  vec3 q = vObj * vec3( 190.0, 95.0, 190.0 );',
                '  float kFw = length( fwidth( q ) );',
                '  float kFade = smoothstep( 0.04, 0.22, kFw ) * ( 1.0 - smoothstep( 0.7, 1.5, kFw ) );',   // off close up (no lumps) and far (no shimmer)
                '  vec3 g = vec3( kN( q ) - kN( q + vec3( 3.1, 0.0, 0.0 ) ), kN( q + vec3( 0.0, 5.7, 0.0 ) ) - kN( q + vec3( 0.0, 1.3, 2.2 ) ), kN( q + vec3( 0.0, 0.0, 4.4 ) ) - kN( q + vec3( 1.7, 0.0, 0.0 ) ) );',
                '  normal = normalize( normal + 0.04 * kFz * kFade * g );',
                '  diffuseColor.rgb *= 0.985 + 0.03 * kN( q * 0.5 ) * kFade;',
                '}',
              ].join('\n'))
              .replace('#include <lights_fragment_maps>', [
                '#include <lights_fragment_maps>',
                // the camera's fill: from over its left shoulder (view space), the world's sky light's colour, more of it
                // the more the sun is behind the racer; the flat sky fill turned down by as much, so the total holds and
                // the side you see is shaped. Then the baked occlusion again, over the sky, the fill and the environment
                '#if defined( RE_IndirectDiffuse )',
                '{',
                '  vec3 kSky = ambientLightColor;',
                '  #if NUM_HEMI_LIGHTS > 0',
                '  kSky += hemisphereLights[ 0 ].skyColor;',
                '  #endif',
                '  float kBack = 0.0;',
                '  #if NUM_DIR_LIGHTS > 0',
                '  kBack = smoothstep( -0.15, 0.55, -directionalLights[ 0 ].direction.z );',
                '  #endif',
                '  float kW = saturate( ( dot( geometryNormal, normalize( vec3( -0.42, 0.55, 0.72 ) ) ) + 0.25 ) / 1.25 );',
                '  irradiance = irradiance * ( 1.0 - 0.4 * kFill ) + kSky * kFill * mix( 0.55, 1.25, kBack ) * kW * kW;',
                '  float kOcc = mix( 1.0, vKz.w, kAO );',
                '  irradiance *= kOcc; iblIrradiance *= kOcc;',
                // and its highlight: a soft sheen up on the camera's side of every round form (no colour of its own, under
                // 0.5: never a hot spot), the way a toy shows its shape
                '  vec3 kFD = normalize( vec3( -0.42, 0.55, 0.72 ) );',
                '  reflectedLight.directSpecular += kSpec * ( 1.0 - step( 3.5, vKz.z ) ) * kOcc * min( kSky * kFill * mix( 0.45, 0.9, kBack ) * saturate( dot( geometryNormal, kFD ) ) * BRDF_GGX( kFD, geometryViewDir, geometryNormal, material ), vec3( 0.5 ) );',
                '}',
                '#endif',
              ].join('\n'))
              .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectSpecular *= mix( 1.0, smoothstep( 0.05, 0.6, vKz.w ), step( 2.5, vKz.z ) * step( vKz.z, 3.5 ) ) * ( 1.0 - step( 3.5, vKz.z ) * 0.7 )' +
                ' * mix( 0.3, 1.0, smoothstep( 0.08, 0.4, saturate( dot( normal, normalize( vViewPosition ) ) ) ) );')
              .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3( kFlash );\n' +
                ' totalEmissiveRadiance += diffuseColor.rgb * 3.0 * step( 1.5, vKz.z ) * step( vKz.z, 2.5 );\n' +
                ' totalEmissiveRadiance += diffuseColor.rgb * 0.07 * step( 2.5, vKz.z ) * step( vKz.z, 3.5 );')   // fur: warm self-fill
              // out of the bloom (but the glow zone), in the race's picture only
              .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n gl_FragColor.a = mix( gl_FragColor.a, step( 1.5, vKz.z ) * step( vKz.z, 2.5 ), kMask );');
          };
          mat.customProgramCacheKey = () => 'gm-kart-toon';
          return mat;
        }

        /* ------------------------------------------------------------------ the gm-kart-eye material
         * aEye = (eye-local unit direction, side); uGazeL/R = the gaze. One program, three eyes, picked by uKind:
         *   0 'pepe': a near-black pupil in a very dark iris ring (the meme's black dots), two catchlights riding on the
         *     pupil, the contact shadow under the upper lid and a little over the lower (uLid, uLidL, uRoll);
         *   1 'dog' : warm off-white sclera, a brown iris (uIrisC) and near-black pupil, two catchlights fixed in eye space
         *     (bigger with uSpark), a contact shadow under the upper lid (the dogs, Bike Tyson, Bull Run, Big Bear, The Whale);
         *   2 'cat' : the dogs' eye with a SLIT pupil (uSlit = width / height), a turquoise iris warming to green-gold round
         *     the pupil (uIrisIn) with soft radial streaks, a dark limbal ring, and a third star sparkle with uSpark. */
        const EYE = {
          pepe: { kind: 0, roughness: 0.14, env: 0.5, pupil: 0.33 },
          dog: { kind: 1, roughness: 0.12, env: 0.55, pupil: 0.2, iris: 0.4, irisC: '#3B2214' },
          cat: { kind: 2, roughness: 0.1, env: 0.6, pupil: 0.36, iris: 0.8, irisC: '#14A8A6', irisIn: '#C9D84E', slit: 0.42 },
        };
        function eye(THREE, kind) {
          const E = EYE[kind] || EYE.dog;
          const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: E.roughness, metalness: 0, envMapIntensity: E.env });
          const U = {
            uGazeL: { value: new THREE.Vector3(0, 0, 1) }, uGazeR: { value: new THREE.Vector3(0, 0, 1) }, uKind: { value: E.kind },
            uLid: { value: 0 }, uLidL: { value: 1 }, uRoll: { value: 0 }, uPupil: { value: E.pupil }, uIris: { value: E.iris || 0.4 }, uSlit: { value: E.slit || 1 },
            uIrisC: { value: new THREE.Color(E.irisC || '#3B2214') }, uIrisIn: { value: new THREE.Color(E.irisIn || '#C9D84E') }, uSpark: { value: 0 }, kMask: { value: 0 },
          };
          mat.userData.uniforms = U;
          bloomMask(mat, U);   // (the catchlights are light, 1.25 to 1.3: kept out of the bloom with the racer)
          mat.onBeforeCompile = (sh) => {
            Object.assign(sh.uniforms, U);
            sh.vertexShader = 'attribute vec4 aEye; varying vec4 vEye;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vEye = aEye;');
            sh.fragmentShader = 'uniform vec3 uGazeL; uniform vec3 uGazeR; uniform float uKind; uniform float uLid; uniform float uLidL; uniform float uRoll; uniform float uPupil; uniform float uIris; uniform float uSlit; uniform vec3 uIrisC; uniform vec3 uIrisIn; uniform float uSpark; uniform float kMask; varying vec4 vEye;\n' + sh.fragmentShader
              .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n gl_FragColor.a *= 1.0 - kMask;')
              .replace('#include <color_fragment>', [
                '#include <color_fragment>',
                'vec3 eD = normalize( vEye.xyz ); vec3 eG = normalize( vEye.w > 0.0 ? uGazeL : uGazeR );',
                'vec3 eT = normalize( cross( vec3( 0.0, 1.0, 0.0 ), eG ) ); vec3 eB = cross( eG, eT );',
                'float eA = acos( clamp( dot( eD, eG ), -1.0, 1.0 ) );',
                'float eW = fwidth( eA ) * 1.1 + 0.003;',
                // (the slit's metric and its width out here, where the derivatives are defined for every kind)
                'float ePx = asin( clamp( dot( eD, eT ), -1.0, 1.0 ) ), ePy = asin( clamp( dot( eD, eB ), -1.0, 1.0 ) );',
                'float eP = length( vec2( ePx / max( uSlit, 0.05 ), ePy ) );',
                'float pW = fwidth( eP ) * 1.1 + 0.003;',
                'vec3 c; float eCatch, eSh, eGlow, eBase;',
                'if ( uKind < 0.5 ) {',
                '  vec3 scl = vec3( 0.92, 0.915, 0.88 ) * ( 1.0 - 0.2 * smoothstep( 0.7, 1.5, acos( clamp( eD.z, -1.0, 1.0 ) ) ) );',
                '  float pI = uPupil + 0.075;',
                '  c = mix( vec3( 0.03, 0.018, 0.012 ), scl, smoothstep( pI - eW, pI + eW, eA ) );',
                '  c = mix( vec3( 0.004 ), c, smoothstep( uPupil - eW, uPupil + eW, eA ) );',
                // catchlights: a big one up-left and a small one low-right of the pupil centre (the meme's two white dots)
                '  float c1 = smoothstep( cos( 0.085 ) - 0.0006, cos( 0.085 ) + 0.0006, dot( eD, normalize( eG - eT * 0.15 + eB * 0.14 ) ) );',
                '  float c2 = smoothstep( cos( 0.045 ) - 0.0004, cos( 0.045 ) + 0.0004, dot( eD, normalize( eG + eT * 0.13 - eB * 0.1 ) ) );',
                '  eCatch = max( c1, c2 ) * ( 1.0 - smoothstep( uPupil - 0.02, uPupil + 0.03, eA ) );',
                // contact shadow under the upper lid, a little over the lower
                '  float elev = asin( clamp( sin( -uRoll * vEye.w ) * eD.x + cos( -uRoll * vEye.w ) * eD.y, -1.0, 1.0 ) );',
                '  eSh = ( 1.0 - 0.55 * smoothstep( -uLid - 0.4, -uLid + 0.02, elev ) ) * ( 1.0 - 0.3 * smoothstep( -uLidL + 0.25, -uLidL - 0.02, elev ) );',
                '  eGlow = 1.25; eBase = 0.35;',
                '} else if ( uKind < 1.5 ) {',
                '  vec3 scl = vec3( 0.94, 0.92, 0.88 ) * ( 1.0 - 0.22 * smoothstep( 0.6, 1.4, acos( clamp( eD.z, -1.0, 1.0 ) ) ) );',
                '  vec3 iris = mix( uIrisC * 1.7, uIrisC * 0.6, smoothstep( uPupil, uIris, eA ) );',
                '  c = mix( iris, scl, smoothstep( uIris - eW, uIris + eW, eA ) );',
                '  c = mix( vec3( 0.006, 0.004, 0.003 ), c, smoothstep( uPupil - eW, uPupil + eW, eA ) );',
                '  c = mix( c, uIrisC * 0.35, smoothstep( uIris - 0.05, uIris, eA ) * ( 1.0 - smoothstep( uIris, uIris + eW, eA ) ) );',
                '  float r1 = 0.11 + 0.05 * uSpark, r2 = 0.055 + 0.03 * uSpark;',
                '  float c1 = smoothstep( cos( r1 ) - 0.0008, cos( r1 ) + 0.0008, dot( eD, normalize( eG - eT * 0.2 + eB * 0.2 ) ) );',
                '  float c2 = smoothstep( cos( r2 ) - 0.0005, cos( r2 ) + 0.0005, dot( eD, normalize( eG + eT * 0.2 - eB * 0.16 ) ) );',
                '  eCatch = max( c1, c2 ) * ( 1.0 - smoothstep( uIris - 0.02, uIris + 0.03, eA ) );',
                '  float elev = asin( clamp( eD.y, -1.0, 1.0 ) );',
                '  eSh = 1.0 - 0.5 * smoothstep( uLid - 0.45, uLid + 0.02, elev );',
                '  eGlow = 1.3; eBase = 0.4;',
                '} else {',
                '  vec3 scl = vec3( 0.95, 0.94, 0.92 ) * ( 1.0 - 0.22 * smoothstep( 0.6, 1.4, acos( clamp( eD.z, -1.0, 1.0 ) ) ) );',
                '  float eStreak = 0.92 + 0.08 * sin( atan( ePy, ePx ) * 17.0 );',
                '  vec3 iris = mix( uIrisIn * 1.15, uIrisC * 1.35, smoothstep( uPupil * 0.55, uIris * 0.62, eA ) ) * eStreak;',
                '  iris = mix( iris, uIrisC * 0.55, smoothstep( uIris * 0.62, uIris, eA ) );',
                '  c = mix( iris, scl, smoothstep( uIris - eW, uIris + eW, eA ) );',
                '  c = mix( c, uIrisC * 0.22, smoothstep( uIris - 0.07, uIris, eA ) * ( 1.0 - smoothstep( uIris, uIris + eW, eA ) ) );',
                '  c = mix( vec3( 0.012, 0.008, 0.02 ), c, smoothstep( uPupil - pW, uPupil + pW, eP ) );',
                '  float r1 = 0.13 + 0.06 * uSpark, r2 = 0.065 + 0.035 * uSpark;',
                '  float c1 = smoothstep( cos( r1 ) - 0.0008, cos( r1 ) + 0.0008, dot( eD, normalize( eG - eT * 0.24 + eB * 0.26 ) ) );',
                '  float c2 = smoothstep( cos( r2 ) - 0.0005, cos( r2 ) + 0.0005, dot( eD, normalize( eG + eT * 0.22 - eB * 0.2 ) ) );',
                '  vec3 sq = eD - normalize( eG + eT * 0.3 + eB * 0.12 ); float sx = abs( dot( sq, eT ) ), sy = abs( dot( sq, eB ) );',
                '  float c3 = uSpark * ( 1.0 - smoothstep( 0.0, 0.012, min( sx * 6.0 + sy, sy * 6.0 + sx ) - 0.05 ) );',
                '  eCatch = max( max( c1, c2 ), c3 ) * ( 1.0 - smoothstep( uIris - 0.02, uIris + 0.03, eA ) );',
                '  float elev = asin( clamp( eD.y, -1.0, 1.0 ) );',
                '  eSh = 1.0 - 0.5 * smoothstep( uLid - 0.45, uLid + 0.02, elev );',
                '  eGlow = 1.3; eBase = 0.4;',
                '}',
                'c *= eSh;',
                'diffuseColor.rgb = c;',
              ].join('\n'))
              .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3( eGlow ) * eCatch * ( eBase + ( 1.0 - eBase ) * eSh );');
          };
          mat.customProgramCacheKey = () => 'gm-kart-eye';
          return mat;
        }

        /* ------------------------------------------------------------------ the helmet glass (key gm-kart-glass)
         * Premultiplied blending (src ONE, dst 1 - alpha): the lit colour (specular + environment, the glass base colour is
         * near black) is ADDED, and the background is dimmed only by a fresnel alpha (clear in the middle, a bright rim). */
        function glass(THREE, o) {
          o = o || {};
          const mat = new THREE.MeshStandardMaterial({ color: o.tint || '#0c1018', roughness: 0.06, metalness: 0, envMapIntensity: 1.35, transparent: true, depthWrite: false });
          mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
          mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
          bloomMaskBlend(THREE, mat);
          const U = { gRim: { value: new THREE.Color(o.rim || '#BFD4FF') }, gA0: { value: 0.05 }, gA1: { value: 0.62 } };
          mat.userData.uniforms = U;
          mat.onBeforeCompile = (sh) => {
            Object.assign(sh.uniforms, U);
            sh.fragmentShader = 'uniform vec3 gRim; uniform float gA0; uniform float gA1;\n' + sh.fragmentShader
              .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float gNV = saturate( abs( dot( normalize( normal ), normalize( vViewPosition ) ) ) );\n float gF = pow( 1.0 - gNV, 2.6 );\n diffuseColor.a = mix( gA0, gA1, gF );\n totalEmissiveRadiance += gRim * gF * 0.35;')
              .replace('#include <opaque_fragment>', 'float gL = dot( outgoingLight, vec3( 0.3, 0.59, 0.11 ) );\n gl_FragColor = vec4( outgoingLight * mix( smoothstep( 0.06, 0.55, gL ), 1.0, gF ), diffuseColor.a );');
          };
          mat.customProgramCacheKey = () => 'gm-kart-glass';
          return mat;
        }

        /* ------------------------------------------------------------------ the tub's glass and water (key gm-kart-water)
         * Vertex colours with alpha (RGBA), a fresnel that thickens and brightens the edge. (It was keyed gm-kart-glass
         * too, as the helmet is: two different shaders under one key would share whichever compiled first.) */
        function water(THREE) {
          const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, transparent: true, depthWrite: false, roughness: 0.06, metalness: 0, envMapIntensity: 1.5 });
          bloomMaskBlend(THREE, mat);
          mat.onBeforeCompile = (sh) => {
            sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', [
              'float gF = pow( 1.0 - saturate( abs( dot( normalize( normal ), normalize( vViewPosition ) ) ) ), 3.0 );',
              'diffuseColor.a = mix( diffuseColor.a, 0.85, gF * 0.55 );',
              'outgoingLight += vec3( 0.85, 0.95, 1.0 ) * gF * 0.35;',
              '#include <opaque_fragment>',
            ].join('\n'));
          };
          mat.customProgramCacheKey = () => 'gm-kart-water';
          return mat;
        }

        root.mat = { toon, eye, glass, water, EYE };
      })(KR);

      /* The roster's marching cubes (one copy for all eight): the endo SDF -> marching cubes helpers, copied VERBATIM from lib/runtime/endo.js:197-292
       * (field / sampleF / polygonize and the TRI table live inside buildEndoHead there and are not exported).
       * Three edits, all marked: polygonize takes an AO step (endo hard-codes 0.0042 m, tuned for a 0.2 m skull;
       * Pepe is ~1 m), and colFn also receives the vertex normal and index. Runtime integration = export these
       * from endo.js (GameMogEndo.mc = { field, sampleF, polygonize }) and drop this file.
       * Generated by a script; do not hand-edit the copied block. */
      KR.EndoKit = (function () {
        const { abs, sqrt, min, max } = Math;
        const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
          // ---------------------------------------------------------------- marching cubes
          const TRI = (',083,019,183981,12a,08312a,92a029,2832a8a98,3b2,0b28b0,19023b,1b219b98b,3a1ba3,0a108a8ba,3903b9ba9,98aa8b,478,430734,019847,419471731,12a847,34730412a,92a902847,2a9297273794,8473b2,b47b24204,90184723b,47b94b9b2921,3a13ba784,1ba14b1047b4,47890b9bab03,47b4b99ba,954,954083,054150,854835315,12a954,30812a495,52a542402,2a5325354348,95423b,0b208b495,05401523b,21525828b485,a3ba13954,4950818a18ba,54050b5bab03,54858aa8b,978579,930953573,078017157,153357,978957a12,a12950530573,802825857a52,2a5253357,7957893b2,95797292027b,23b018178157,b21b17715,958857a13a3b,5705097b010aba0,ba0b03a50807570,ba57b5,a65,0835a6,9015a6,1831985a6,165261,165126308,965906026,598582526328,23ba65,b08b20a65,01923b5a6,5a61929b298b,63b653513,08b0b50515b6,3b6036065059,65969bb98,5a6478,43047365a,1905a6847,a65197173794,612651478,125526304347,847905065026,739794329596269,3b2784a65,5a647242027b,01947823b5a6,9219b294b7b45a6,8473b53515b6,51b5b610b7b404b,059065036b63847,65969b4797b9,a4964a,4a649a083,a01a60640,83181686461a,149124264,308129249264,024426,832824426,a49a64b23,08228b49a4a6,3b201606461a,64161a48121b8b1,964936913b63,8b1810b61914641,3b6360064,648b68,7a678a89a,0730a709a67a,a671a7178180,a67a71173,126168189867,269291679093739,780706602,732672,23ba68a89867,20727b09767a9a7,1801781a767a23b,b21b17a61671,896867916b63136,091b67,7807063b0b60,7b6,76b,308b76,019b76,819831b76,a126b7,12a3086b7,2902a96b7,6b72a3a83a98,723627,708760620,276237019,162186198876,a76a17137,a7617a187108,03707a0a96a7,76a7a88a9,684b86,36b306046,86b846901,946963931b36,6846b82a1,12a30b06b046,4b846b0292a9,a93a32943b36463,823842462,042462,190234246438,194142246,8138618466a1,a10a06604,4634386a3039a93,a946a4,49576b,083495b76,50154076b,b76834354315,954a1276b,6b712a083495,76b54a42a402,348354325a52b76,723762549,954086062687,362376150540,628687218485158,954a16176137,16a176107870954,40a4a503a6a737a,76a7a854a48a,6956b9b89,36b063056095,0b805b01556b,6b3635531,12a95b9b8b56,0b306b09656912a,b85b56805a52025,6b36352a3a53,589528562382,956960062,158180568382628,156216,13616a386569896,a10a06950560,03856a,a56,b5a75b,b5ab75830,5b75ab190,a75ab7981831,b12b71751,08312717572b,9759279022b7,75272b592328982,25a235375,820852875a25,9015a35373a2,982921872a25752,135375,087071175,903935537,987597,5845a8ab8,5045b05abb30,01984a8aba45,ab4a45b34941314,2512852b8458,04b0b345b2b151b,0250592b5458b85,9452b3,25a352345384,5a2524420,3a235a385458019,5a2524192942,845853351,045105,845853905035,945,4b749b9ab,0834979b79ab,1ab1b414074b,3143481a474bab4,4b79b492b912,9749b791b2b1083,b74b42240,b74b42834324,29a279237749,9a7974a27870207,37a3a274a1a040a,1a2874,491417713,491417081871,403743,487,9a8ab8,30939bb9a,01a0a88ab,31ab3a,12b1b99b8,30939b1292b9,02b80b,32b,23828aa89,9a2092,23828a0181a8,1a2,138918,091,038,')
            .split(',').map((s) => { const a = new Int8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = parseInt(s[i], 16); return a; });
          const EAX = [0, 1, 0, 1, 0, 1, 0, 1, 2, 2, 2, 2];
          const EOX = [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0], EOY = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1], EOZ = [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0];

          // sample an SDF on a grid, only near the surface (4^3 node blocks far from it are filled with the block value);
          // with `mirror` the field is symmetric in x and only x >= 0 is evaluated.
          function field(sdf, box, h, mirror) {
            let nx = Math.ceil((box[3] - box[0]) / h) + 1; if (mirror && !(nx & 1)) nx++;
            const ny = Math.ceil((box[4] - box[1]) / h) + 1, nz = Math.ceil((box[5] - box[2]) / h) + 1;
            const x0 = mirror ? -((nx - 1) / 2) * h : box[0], y0 = box[1], z0 = box[2], nxy = nx * ny;
            const F = new Float32Array(nxy * nz), B = 4, far = 7.5 * h, i0 = mirror ? (nx - 1) / 2 : 0;
            let evals = 0;
            for (let bk = 0; bk < nz; bk += B) {
              const ke = min(bk + B, nz);
              for (let bj = 0; bj < ny; bj += B) {
                const je = min(bj + B, ny);
                for (let bi = i0; bi < nx; bi += B) {
                  const ie = min(bi + B, nx);
                  const dc = sdf(x0 + (bi + 1.5) * h, y0 + (bj + 1.5) * h, z0 + (bk + 1.5) * h); evals++;
                  if (abs(dc) > far) { for (let k = bk; k < ke; k++) for (let j = bj; j < je; j++) { const row = nx * j + nxy * k; for (let i = bi; i < ie; i++) F[row + i] = dc; } }
                  else for (let k = bk; k < ke; k++) for (let j = bj; j < je; j++) { const row = nx * j + nxy * k; for (let i = bi; i < ie; i++) { F[row + i] = sdf(x0 + i * h, y0 + j * h, z0 + k * h); evals++; } }
                }
              }
            }
            if (mirror) for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const row = nx * j + nxy * k; for (let i = 0; i < i0; i++) F[row + i] = F[row + nx - 1 - i]; }
            return { F, nx, ny, nz, nxy, x0, y0, z0, h, evals };
          }
          function sampleF(G, x, y, z) {
            const { F, nx, nxy, h } = G;
            let fx = (x - G.x0) / h, fy = (y - G.y0) / h, fz = (z - G.z0) / h;
            fx = fx < 0 ? 0 : fx > G.nx - 1.001 ? G.nx - 1.001 : fx; fy = fy < 0 ? 0 : fy > G.ny - 1.001 ? G.ny - 1.001 : fy; fz = fz < 0 ? 0 : fz > G.nz - 1.001 ? G.nz - 1.001 : fz;
            const i = fx | 0, j = fy | 0, k = fz | 0, tx = fx - i, ty = fy - j, tz = fz - k, q = i + nx * j + nxy * k;
            const a = F[q] + (F[q + 1] - F[q]) * tx, b = F[q + nx] + (F[q + nx + 1] - F[q + nx]) * tx;
            const c = F[q + nxy] + (F[q + nxy + 1] - F[q + nxy]) * tx, d = F[q + nxy + nx] + (F[q + nxy + nx + 1] - F[q + nxy + nx]) * tx;
            const e = a + (b - a) * ty, f = c + (d - c) * ty; return e + (f - e) * tz;
          }
          // polygonize into an accumulator; colFn(x, y, z, ao) gives the vertex colour (number or [r,g,b])
          function polygonize(G, acc, colFn, keep, AOS) {
            AOS = AOS || 0.0042;
            const { F, nx, ny, nz, nxy, x0, y0, z0, h } = G;
            const VID = new Int32Array(nxy * nz * 3).fill(-1);
            const v0 = acc.n, i0 = acc.I.length, g1 = [0, 0, 0], g2 = [0, 0, 0], KC = [];
            const kv = (id) => { let s = KC[id - v0]; if (s === undefined) { const P = acc.P; s = KC[id - v0] = !!keep(P[3 * id], P[3 * id + 1], P[3 * id + 2]); } return s; };
            const gr = (q, i, j, k, o) => {
              o[0] = F[i < nx - 1 ? q + 1 : q] - F[i > 0 ? q - 1 : q];
              o[1] = F[j < ny - 1 ? q + nx : q] - F[j > 0 ? q - nx : q];
              o[2] = F[k < nz - 1 ? q + nxy : q] - F[k > 0 ? q - nxy : q];
            };
            const ev = (i, j, k, e) => {
              i += EOX[e]; j += EOY[e]; k += EOZ[e];
              const ax = EAX[e], q = i + nx * j + nxy * k, key = q * 3 + ax;
              let id = VID[key]; if (id >= 0) return id;
              const q2 = q + (ax === 0 ? 1 : ax === 1 ? nx : nxy), a = F[q], b = F[q2], t = a / (a - b);
              let x = x0 + i * h, y = y0 + j * h, z = z0 + k * h;
              if (ax === 0) x += t * h; else if (ax === 1) y += t * h; else z += t * h;
              gr(q, i, j, k, g1); gr(q2, i + (ax === 0 ? 1 : 0), j + (ax === 1 ? 1 : 0), k + (ax === 2 ? 1 : 0), g2);
              const gx = g1[0] + (g2[0] - g1[0]) * t, gy = g1[1] + (g2[1] - g1[1]) * t, gz = g1[2] + (g2[2] - g1[2]) * t, l = Math.hypot(gx, gy, gz) || 1;
              id = acc.v(x, y, z, gx / l, gy / l, gz / l, 1);
              VID[key] = id; return id;
            };
            for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) {
              const row = nx * j + nxy * k;
              for (let i = 0; i < nx - 1; i++) {
                const q = row + i, r = q + nxy;
                let c = 0;
                if (F[q] > 0) c |= 1; if (F[q + 1] > 0) c |= 2; if (F[q + 1 + nx] > 0) c |= 4; if (F[q + nx] > 0) c |= 8;
                if (F[r] > 0) c |= 16; if (F[r + 1] > 0) c |= 32; if (F[r + 1 + nx] > 0) c |= 64; if (F[r + nx] > 0) c |= 128;
                if (c === 0 || c === 255) continue;
                const T = TRI[c];
                for (let t = 0; t < T.length; t += 3) {
                  const a = ev(i, j, k, T[t]), b = ev(i, j, k, T[t + 1]), c2 = ev(i, j, k, T[t + 2]);
                  if (keep && !kv(a) && !kv(b) && !kv(c2)) continue;
                  acc.I.push(a, b, c2);
                }
              }
            }
            // orientation: make the signed volume positive
            const P = acc.P, I = acc.I; let vol = 0;
            for (let t = i0; t < I.length; t += 3) {
              const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
              vol += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
            }
            if (vol < 0) for (let t = i0; t < I.length; t += 3) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; }
            // ambient occlusion from the field, folded into the vertex colour
            for (let v = v0; v < acc.n; v++) {
              const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2], N = acc.N, nx_ = N[3 * v], ny_ = N[3 * v + 1], nz_ = N[3 * v + 2];
              let occ = 0;
              for (let s = 1; s <= 5; s++) { const hs = s * AOS; occ += max(0, 1 - sampleF(G, x + nx_ * hs, y + ny_ * hs, z + nz_ * hs) / hs) / s; }
              const ao = sat(1 - 0.62 * max(0, occ - 0.12));
              const c = colFn(x, y, z, ao, nx_, ny_, nz_, v);
              if (typeof c === 'number') { acc.C[3 * v] = c; acc.C[3 * v + 1] = c; acc.C[3 * v + 2] = c; }
              else { acc.C[3 * v] = c[0]; acc.C[3 * v + 1] = c[1]; acc.C[3 * v + 2] = c[2]; }
            }
          }

        // the endo accumulator, plus per-vertex extras (bone index, roughness, warm-terminator weight) for the kart rig
        class Acc {
          constructor() { this.P = []; this.N = []; this.C = []; this.I = []; this.K = []; this.B = []; this.n = 0; this.bone = 0; this.rough = 0.35; this.warm = 1; }
          v(x, y, z, nx, ny, nz, r, g, b) {
            this.P.push(x, y, z); this.N.push(nx, ny, nz);
            this.C.push(r, g === undefined ? r : g, b === undefined ? r : b);
            this.K.push(this.rough, this.warm); this.B.push(this.bone);
            return this.n++;
          }
        }
        return { field, sampleF, polygonize, Acc, TRI };
      })();

      /* Meme Kart: Doge and Shiba, FINAL (scratch recipe, 6 Oct 2026). Two original 3D dogs on ONE shared base.
       *
       *   DogFinal.doge (THREE, K, detail, opts) -> THREE.Group
       *   DogFinal.shiba(THREE, K, detail, opts) -> THREE.Group
       *     K      = the endo marching-cubes kit ({ field, polygonize }, endo-kit.js = endo.js:197-292)
       *     detail = 'desktop' | 'phone' | 'mid' | 'far'          (budgets 16k / 8k / 3k / 0.7k triangles)
       *     opts   = { toon: <shared gm-kart-toon material>, eyeMat: <this dog's gm-kart-eye-dog material> }
       *
       * Base = the judges' TOY winner (vinyl-collectible proportions, head ~55% of the seated height, geometry lines),
       * with CLASSIC's grafts: Doge's two-tone tan saddle over a cream mask, the longer Doge muzzle, goggles on the cap's
       * front brow clear of the ears, a smoother body. Fixes: soft cheek lobes (no cones), thick round ear tips, the
       * projection guard against MC shards, warm fur shadows, a real carved Shiba mouth (depth in profile), a painted far
       * LOD that keeps the face and the cap. One base SDF (dogSDF) + shape parameters; the dogs differ only by those
       * numbers, zone colours, the face and their accessories.
       *
       * Expressions = 4 morph targets each, made the plan's way: the head's MC vertices are re-projected onto the
       * expression's SDF (cheeks, jaw, the warped mouth carve), and the procedural face parts (mouth lines, mouth and
       * tongue decals, tongue, lip rim, brow dots, sweat drop) are rebuilt with the expression's numbers at the SAME
       * topology, so the delta is exact. Bone poses (lids, lower lids, happy arcs, squeeze chevrons, gaze, pupils, head
       * roll, ears) blend with the same weights.
       *   Doge : sideeye, nervous, hit, celebrate          (base = side-eye, closed nervous smile)
       *   Shiba: grin, happy, hit, celebrate               (base = open smile; race default = happy)
       *
       * Units metres, +Z forward, +Y up, origin = the seat contact under the pelvis. Hands at ten-and-two on DogFinal.WHEEL.
       * Draw calls: 2 (one SkinnedMesh in gm-kart-toon; one eye mesh in gm-kart-eye-dog). 'far' = 1 plain Mesh.
       * group.userData.racer (= .dog) = { set(weights), setExpression(name, instant), setGaze(x, y), look(x, y), blink(v),
       *   squash(k), kick(v), steer(v), update(dt, {accel, steer}), names, bones, mesh, stats }   (Pepe FINAL's API)
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, exp, atan2 } = Math;
        const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
        const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
        const lerp = (a, b, t) => a + (b - a) * t;
        const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
        const smin = (a, b, k) => { const h = sat(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
        const smax = (a, b, k) => -smin(-a, -b, k);
        const ell = (x, y, z, a, b, c) => {
          const X = x / a, Y = y / b, Z = z / c;
          const k0 = sqrt(X * X + Y * Y + Z * Z), k1 = sqrt(X * X / (a * a) + Y * Y / (b * b) + Z * Z / (c * c)) + 1e-9;
          return k0 * (k0 - 1) / k1;
        };
        const ell2 = (x, y, a, b) => { const X = x / a, Y = y / b, k0 = sqrt(X * X + Y * Y), k1 = sqrt(X * X / (a * a) + Y * Y / (b * b)) + 1e-9; return k0 * (k0 - 1) / k1; };
        const E6 = (x, y, z, e, g) => ell(x - e[0], y - e[1], z - e[2], e[3] + (g || 0), e[4] + (g || 0), e[5] + (g || 0));
        function cap(x, y, z, A, B, ra, rb) {
          const bx = B[0] - A[0], by = B[1] - A[1], bz = B[2] - A[2], px = x - A[0], py = y - A[1], pz = z - A[2];
          const t = sat((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz));
          return hypot(px - bx * t, py - by * t, pz - bz * t) - (ra + (rb - ra) * t);
        }
        const v3 = {
          add: (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k],
          sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
          scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
          norm: (a) => { const l = hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
          cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
          dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
          lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
        };
        const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

        /* ------------------------------------------------------------------ the steering wheel (kart builds its wheel here) */
        const WHEEL = { c: [0, 0.335, 0.43], r: 0.135, tilt: 0.5, grip: 0.5 };
        const WH = (() => {
          const W = WHEEL, up = [0, cos(W.tilt), sin(W.tilt)], nrm = [0, -sin(W.tilt), cos(W.tilt)];
          const a = W.grip, rad = v3.norm(v3.add([cos(a), 0, 0], up, sin(a)));
          return { up, nrm, rad, H: v3.add(W.c, rad, W.r) };
        })();

        /* ------------------------------------------------------------------ the shared base: shape parameters */
        const BASE = {
          cran: [0, 0.715, -0.02, 0.27, 0.258, 0.248],
          cheek: [0.13, 0.592, 0.035, 0.168, 0.15, 0.158], cheekK: 0.085,
          brow: [0.098, 0.775, 0.105, 0.1, 0.07, 0.1], browK: 0.04,
          muz: [0, 0.582, 0.165, 0.112, 0.082, 0.112], jaw: [0, 0.522, 0.13, 0.085, 0.048, 0.092], muzK: 0.05,
          nose: { y: 0.632, r: [0.052, 0.036, 0.034], dz: -0.014 },
          eye: { x: 0.112, y: 0.714, r: 0.06, prot: 0.03, fwd: 0.55 },
          ear: { b: [0.135, 0.875, -0.05], t: [0.225, 1.075, -0.075], rb: 0.088, rt: 0.03, th: 0.05, face: [0.45, 0.05, 1], k: 0.045 },
          lobes: [],
          torso: [0, 0.245, -0.05, 0.198, 0.25, 0.168], belly: [0, 0.165, 0.02, 0.188, 0.165, 0.168], ruff: [0, 0.39, 0.06, 0.15, 0.09, 0.08],
          S: [0.165, 0.395, -0.035], El: [0.255, 0.285, 0.13], armR: [0.07, 0.062, 0.056], paw: [0.06, 0.052, 0.064],
          Hp: [0.098, 0.085, 0.02], K: [0.135, 0.17, 0.225], F: [0.135, 0.065, 0.355], foot: [0.064, 0.05, 0.088],
          neck: [0, 0.47, -0.03],
          tail: { pts: [[0, 0.2, -0.19], [0, 0.27, -0.3], [0, 0.39, -0.35], [0, 0.48, -0.3], [0.02, 0.5, -0.2], [0.05, 0.45, -0.17], [0.07, 0.4, -0.21]], r0: 0.055, r1: 0.026, fluff: 0.018 },
        };
        const P = (o) => {
          const r = JSON.parse(JSON.stringify(BASE));
          for (const k in o) { if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && r[k] && typeof r[k] === 'object' && !Array.isArray(r[k])) Object.assign(r[k], o[k]); else r[k] = o[k]; }
          return r;
        };
        const DOGE = P({
          name: 'doge',
          cran: [0, 0.712, -0.02, 0.276, 0.256, 0.248],
          cheek: [0.135, 0.586, 0.03, 0.18, 0.155, 0.162], cheekK: 0.09,
          ear: { b: [0.145, 0.865, -0.06], t: [0.255, 1.03, -0.1], rb: 0.09, rt: 0.036, th: 0.062, face: [0.5, 0.1, 0.86], k: 0.045 },
          // soft jowl fluff (rounded lobes, never cones)
          lobes: [[0.245, 0.54, -0.01, 0.07, 0.068, 0.078, 0.05], [0.215, 0.488, 0.05, 0.06, 0.05, 0.06, 0.045]],
          eye: { x: 0.112, y: 0.718, r: 0.061, prot: 0.03, fwd: 0.6 },
          // CLASSIC's longer muzzle so Doge reads as a dog inside the big chibi head
          muz: [0, 0.584, 0.198, 0.12, 0.086, 0.142], jaw: [0, 0.522, 0.158, 0.09, 0.05, 0.108], muzK: 0.05,
          nose: { y: 0.64, r: [0.058, 0.04, 0.037], dz: -0.014 },
          tail: { pts: [[0, 0.2, -0.19], [0, 0.26, -0.29], [0, 0.35, -0.32], [0.01, 0.41, -0.27], [0.03, 0.4, -0.21], [0.05, 0.35, -0.21]], r0: 0.05, r1: 0.026, fluff: 0.016 },
          roll: 12 * PI / 180,
        });
        const SHIBA = P({
          name: 'shiba',
          cran: [0, 0.716, -0.025, 0.252, 0.256, 0.246],
          cheek: [0.118, 0.6, 0.04, 0.15, 0.135, 0.15], cheekK: 0.07,
          brow: [0.094, 0.772, 0.11, 0.095, 0.065, 0.1], browK: 0.035,
          muz: [0, 0.588, 0.19, 0.106, 0.08, 0.134], jaw: [0, 0.514, 0.178, 0.088, 0.052, 0.106], muzK: 0.045,
          nose: { y: 0.642, r: [0.056, 0.039, 0.036], dz: -0.014 },
          // a touch shorter than TOY (less fox), thick round tips
          ear: { b: [0.124, 0.875, -0.04], t: [0.188, 1.095, -0.045], rb: 0.1, rt: 0.036, th: 0.064, face: [0.32, 0.08, 1], k: 0.04 },
          // the white cheek ruff (urajiro) that makes it a Shiba, not a fox
          lobes: [[0.205, 0.515, 0.035, 0.08, 0.066, 0.074, 0.045], [0.235, 0.575, -0.02, 0.06, 0.06, 0.06, 0.04]],
          eye: { x: 0.106, y: 0.72, r: 0.056, prot: 0.016, fwd: 0.5 },
          torso: [0, 0.25, -0.05, 0.185, 0.25, 0.16], belly: [0, 0.165, 0.02, 0.175, 0.16, 0.16], ruff: [0, 0.385, 0.07, 0.14, 0.1, 0.08],
          roll: 0,
        });

        /* ------------------------------------------------------------------ expressions
         * Doge mouth: a closed wavy line (top), which can open into a painted mouth down to a bottom curve (open), with a
         * tongue patch. Shiba mouth: a carved cavity whose 2D outline is the neutral grin warped by (sx, sy, dy, bend). */
        const D2R = PI / 180;
        const DM = (o) => Object.assign({ w: 0.09, y: 0.548, curve: 0.01, tilt: -0.008, wob: 0.0035, open: 0, openW: 0.6, tongue: 0, flick: 0.006 }, o);
        const DOGE_EX = {
          neutral:   { mouth: DM({}), brow: [0.03, 0.01], sweat: 0, cheek: 0, gaze: [0.82, 0.04], lidU: 0.5, lidLo: -1.05, happy: 0, squeeze: 0, pupil: 0.19, iris: 0.4, spark: 0, roll: 12 * D2R, ear: 0 },
          sideeye:   { mouth: DM({ w: 0.086, curve: 0.002, tilt: -0.016, wob: 0.0015, flick: 0.011 }), brow: [0.058, -0.004], sweat: 0, cheek: 0, gaze: [0.95, 0.0], lidU: 0.3, lidLo: -0.8, happy: 0, squeeze: 0, pupil: 0.18, iris: 0.38, spark: 0, roll: 14 * D2R, ear: -0.1 },
          nervous:   { mouth: DM({ w: 0.1, curve: 0.022, tilt: -0.004, wob: 0.0068, flick: 0.008 }), brow: [0.045, 0.036], sweat: 1, cheek: 0.3, gaze: [0.72, 0.1], lidU: 0.68, lidLo: -1.05, happy: 0, squeeze: 0, pupil: 0.15, iris: 0.36, spark: 0, roll: 12 * D2R, ear: -0.2 },
          hit:       { mouth: DM({ w: 0.074, y: 0.546, curve: -0.012, tilt: 0, wob: 0.0065, open: 0.036, openW: 0.55, flick: 0 }), brow: [0.046, 0.046], sweat: 1.3, cheek: 0, gaze: [0.0, 0.06], lidU: 1.12, lidLo: -1.25, happy: 0, squeeze: 0, pupil: 0.1, iris: 0.27, spark: 0, roll: -6 * D2R, ear: -0.55 },
          celebrate: { mouth: DM({ w: 0.106, y: 0.556, curve: 0.042, tilt: 0, wob: 0.0, open: 0.062, openW: 0.8, tongue: 1, flick: 0 }), brow: [0.04, 0.04], sweat: 0, cheek: 1, gaze: [0, 0], lidU: 0.5, lidLo: -1.05, happy: 1, squeeze: 0, pupil: 0.19, iris: 0.4, spark: 0, roll: 16 * D2R, ear: 0.25 },
        };
        const SM = (o) => Object.assign({ sx: 1, sy: 1, dy: 0, bend: 0, jaw: [0, 0], tongue: 1, tOut: 0 }, o);
        const SHIBA_EX = {
          neutral:   { mouth: SM({}), cheek: 0, gaze: [0, 0.04], lidU: 0.62, lidLo: -0.3, happy: 0, squeeze: 0, pupil: 0.22, iris: 0.37, spark: 0, roll: 0, ear: 0 },
          grin:      { mouth: SM({ sx: 1.1, sy: 1.12, dy: -0.002, jaw: [-0.006, 0.004], tOut: 0.25 }), cheek: 0.9, gaze: [0, 0.04], lidU: 0.64, lidLo: -0.12, happy: 0, squeeze: 0, pupil: 0.23, iris: 0.42, spark: 0, roll: 4 * D2R, ear: 0.1 },
          happy:     { mouth: SM({ sx: 1.1, sy: 1.12, dy: -0.002, jaw: [-0.006, 0.004], tOut: 0.3 }), cheek: 1, gaze: [0, 0], lidU: 0.46, lidLo: -0.28, happy: 1, squeeze: 0, pupil: 0.22, iris: 0.37, spark: 0, roll: 6 * D2R, ear: 0.12 },
          hit:       { mouth: SM({ sx: 0.88, sy: 0.74, dy: -0.004, bend: -0.011, jaw: [0.004, -0.004], tongue: 0.55, tOut: -0.5 }), cheek: 0.5, gaze: [0, 0], lidU: 0.46, lidLo: -0.28, happy: 0, squeeze: 1, pupil: 0.22, iris: 0.37, spark: 0, roll: -10 * D2R, ear: -0.6 },
          celebrate: { mouth: SM({ sx: 1.16, sy: 1.3, dy: -0.008, jaw: [-0.016, 0.008], tongue: 1.1, tOut: 1 }), cheek: 1, gaze: [0, 0.22], lidU: 0.9, lidLo: -0.22, happy: 0, squeeze: 0, pupil: 0.27, iris: 0.47, spark: 1, roll: -6 * D2R, ear: 0.35 },
        };
        const EX_NAMES = { doge: ['sideeye', 'nervous', 'hit', 'celebrate'], shiba: ['grin', 'happy', 'hit', 'celebrate'] };

        // the Shiba's neutral open grin, in front view: inside an ellipse and below a smiling top line
        const MOUTH = { rx: 0.098, ry: 0.054, cy: 0.552, ty: 0.566, k: 2.0 };
        const mWarp = (M, x, y) => { const X = x * M.sx; return [X, MOUTH.cy + M.dy + (y - MOUTH.cy) * M.sy + M.bend * (X / MOUTH.rx) * (X / MOUTH.rx)]; };
        const mUnwarp = (M, X, Y) => { const x = X / M.sx; return [x, MOUTH.cy + (Y - MOUTH.cy - M.dy - M.bend * (X / MOUTH.rx) * (X / MOUTH.rx)) / M.sy]; };
        function mouth2D(x, y) {   // < 0 inside the neutral grin (approximate distance)
          const M = MOUTH, e = ell2(x, y - M.cy, M.rx, M.ry);
          const line = (y - (M.ty + M.k * x * x)) / sqrt(1 + 4 * M.k * M.k * x * x);
          return max(e, line);
        }
        function mouthOutline(n) {
          const M = MOUTH, inE = (x, y) => hypot(x / M.rx, (y - M.cy) / M.ry) <= 1, top = (x) => M.ty + M.k * x * x;
          let lo = 0, hi = M.rx; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (inE(m, top(m))) lo = m; else hi = m; }
          const xc = lo, a0 = Math.asin(clamp((top(xc) - M.cy) / M.ry, -1, 1)), pts = [];
          for (let i = 0; i < n; i++) { const x = -xc + 2 * xc * i / n; pts.push([x, top(x)]); }
          for (let i = 0; i < n; i++) { const a = a0 - (PI + 2 * a0) * i / n; pts.push([M.rx * cos(a), M.cy + M.ry * sin(a)]); }
          return pts;
        }

        /* ------------------------------------------------------------------ the SDF of one dog (with an expression) */
        function dogSDF(S, lod, E) {
          E = E || {};
          const ER = S.ear, EB = ER.b, ET = ER.t, EL = hypot(ET[0] - EB[0], ET[1] - EB[1], ET[2] - EB[2]);
          const ea = v3.norm(v3.sub(ET, EB)); let eu = v3.norm(ER.face); eu = v3.norm(v3.sub(eu, v3.scale(ea, v3.dot(eu, ea)))); const ew = v3.cross(ea, eu);
          const earLocal = (ax, y, z, o) => { const q0 = ax - EB[0], q1 = y - EB[1], q2 = z - EB[2]; o[0] = q0 * ew[0] + q1 * ew[1] + q2 * ew[2]; o[1] = q0 * ea[0] + q1 * ea[1] + q2 * ea[2]; o[2] = q0 * eu[0] + q1 * eu[1] + q2 * eu[2]; return o; };
          const eL = [0, 0, 0];
          // returns [outer, innerBowl, depth, t]
          const earParts = (ax, y, z) => {
            earLocal(ax, y, z, eL); const s = eL[0], t = eL[1], d = eL[2] + 0.028 * (t / EL) * (t / EL) * EL;
            const o2 = cap(s, t, 0, [0, 0, 0], [0, EL, 0], ER.rb, ER.rt);
            const th = ER.th * (1 - 0.45 * sat(t / EL));
            const outer = smax(o2, abs(d) - th, 0.02);                       // a rounded rim, thick to the tip
            const in2 = cap(s * 1.05, t, 0, [0, 0.16 * EL, 0], [0, 0.74 * EL, 0], ER.rb * 0.58, ER.rt * 0.4);
            const bowl = max(in2, -(d - th * 0.25));
            return [smax(outer, -bowl, 0.018), in2, d, t];
          };
          const cheekE = S.cheek.slice(), pf = E.cheek || 0;
          cheekE[1] += 0.012 * pf; cheekE[2] += 0.008 * pf; cheekE[3] *= 1 + 0.05 * pf; cheekE[4] *= 1 + 0.04 * pf;
          const jaw = S.jaw.slice(), JM = E.mouth && E.mouth.jaw ? E.mouth.jaw : [0, 0]; jaw[1] += JM[0]; jaw[2] += JM[1];
          const lobeF = (ax, y, z) => { let d = 1; for (const l of S.lobes) d = smin(d, ell(ax - l[0], y - l[1], z - l[2], l[3], l[4], l[5]), 0.02); return d; };
          const headCore = (x, y, z) => {
            const ax = abs(x);
            let d = E6(x, y, z, S.cran);
            d = smin(d, E6(ax, y, z, cheekE), S.cheekK);
            d = smin(d, E6(ax, y, z, S.brow), S.browK);
            if (S.lobes.length) d = smin(d, lobeF(ax, y, z), 0.04);
            const m = smin(E6(x, y, z, S.muz), E6(x, y, z, jaw), 0.035);
            d = smin(d, m, S.muzK);
            return d;
          };
          // the Shiba's carved mouth: the warped grin outline, extruded, intersected with a bag inside the muzzle
          const MW = E.mouth && E.mouth.sx !== undefined ? E.mouth : null;
          const carveOn = !!(lod.carve && MW);
          const carve = (x, y, z) => {
            const u = mUnwarp(MW, x, y), sc = min(MW.sx, MW.sy);
            const f2 = mouth2D(u[0], u[1]) * sc;
            const bag = ell(u[0], u[1] - (MOUTH.cy - 0.004), z - (0.21 + JM[1] * 0.5), MOUTH.rx * 1.08, MOUTH.ry * 1.5, 0.11);
            return smax(f2, bag, 0.006);
          };
          const headF = (x, y, z) => {
            let d = headCore(x, y, z);
            if (y > 0.78) d = smin(d, earParts(abs(x), y, z)[0], ER.k);
            if (carveOn && z > 0.1 && y < 0.64 && y > 0.4 && abs(x) < 0.16) d = smax(d, -carve(x, y, z), 0.008);
            return d;
          };
          const headNoEar = (x, y, z) => {
            let d = headCore(x, y, z);
            if (carveOn && z > 0.1 && y < 0.64 && y > 0.4 && abs(x) < 0.16) d = smax(d, -carve(x, y, z), 0.008);
            return d;
          };
          const H = WH.H, Wr = v3.add(H, v3.norm(v3.sub(S.El, H)), 0.06), pawC = v3.add(H, WH.nrm, -0.012);
          const torsoF = (x, y, z) => smin(smin(E6(x, y, z, S.torso), E6(x, y, z, S.belly), 0.06), E6(x, y, z, S.ruff), 0.05);
          const armF = (ax, y, z) => {
            let d = smin(cap(ax, y, z, S.S, S.El, S.armR[0], S.armR[1]), cap(ax, y, z, S.El, Wr, S.armR[1], S.armR[2]), 0.035);
            return smin(d, ell(ax - pawC[0], y - pawC[1], z - pawC[2], S.paw[0], S.paw[1], S.paw[2]), 0.035);
          };
          const legF = (ax, y, z) => {
            const d = smin(cap(ax, y, z, S.Hp, S.K, 0.088, 0.072), cap(ax, y, z, S.K, S.F, 0.068, 0.058), 0.035);
            return smin(d, ell(ax - S.F[0], y - S.F[1] + 0.012, z - S.F[2] - 0.035, S.foot[0], S.foot[1], S.foot[2]), 0.035);
          };
          const bodyF = (x, y, z) => { const ax = abs(x); return smin(smin(torsoF(x, y, z), armF(ax, y, z), 0.05), legF(ax, y, z), 0.045); };
          return { headF, headCore, headNoEar, earParts, carve, carveOn, bodyF, torsoF, armF, legF, pawC, Wr, ea, eu, ew, EL, lobeF };
        }

        /* ------------------------------------------------------------------ palettes (linear) */
        function palette(THREE, S) {
          const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
          const common = { nose: c('#16110F'), line: c('#3A2216'), white: c('#F4EFE6'), mouth: c('#4A1420'), mouthHi: c('#7A2A36'), tongue: c('#EE7486'), tongueDk: c('#C8506A'), teeth: c('#FBF6EE') };
          if (S.name === 'doge') return Object.assign(common, {
            base: c('#D9A55B'), baseDk: c('#C08A44'), mask: c('#F2DDB4'), maskHi: c('#F8EBD0'), inner: c('#F4D9B8'), paw: c('#F2DDB4'),
            lid: c('#D9A55B'), lidLo: c('#F2DDB4'), lidLine: c('#5A3820'), brow: c('#FAEFD9'),
            leather: c('#7A4A2A'), leatherDk: c('#4F2E19'), fleece: c('#FBF4E6'), brass: c('#D9AE4E'), lens: c('#3FA9B8'), strap: c('#5A3720'),
            sweat: c('#8FD3FF'), sweatHi: c('#E8F7FF'), scarf: c('#D7342F'), scarfDk: c('#9E2020'), stripe: c('#FBF4E6'),
          });
          return Object.assign(common, {
            base: c('#C9622A'), baseDk: c('#AE5021'), mask: c('#FBF3E6'), maskHi: c('#FFFFFF'), inner: c('#F6E6D6'), paw: c('#FBF3E6'),
            lid: c('#C9622A'), lidLo: c('#FBF3E6'), lidLine: c('#3A1A10'), brow: c('#FBF3E6'),
            band: c('#FF6FA3'), bandDk: c('#D84A80'), petal: c('#FFFFFF'), petalC: c('#FFC93C'),
          });
        }

        /* ------------------------------------------------------------------ the materials: the roster's one toon and one eye (KR.mat) */
        const toonMaterial = (THREE, o) => root.mat.toon(THREE, o);
        const eyeMaterial = (THREE) => root.mat.eye(THREE, 'dog');

        /* ------------------------------------------------------------------ the accumulator: P, N, C, K (vec4), skin (2 bones) */
        class Acc {
          constructor() { this.P = []; this.N = []; this.C = []; this.K = []; this.B = []; this.I = []; this.n = 0; this.k = [0.5, 1, 3, 1]; this.bone = 0; this.bw = null; }
          v(x, y, z, nx, ny, nz, r, g, b) {
            this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(r, g === undefined ? r : g, b === undefined ? r : b);
            this.K.push(this.k[0], this.k[1], this.k[2], this.k[3]);
            if (this.bw) { const w = this.bw(x, y, z); this.B.push(w[0], w[1], w[2]); } else this.B.push(this.bone, this.bone, 0);
            return this.n++;
          }
        }
        const grad = (f, x, y, z, e, o) => {
          const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
          o = o || [0, 0, 0]; o[0] = a - b - c + d; o[1] = -a - b + c + d; o[2] = -a + b - c + d;
          const l = hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l; return o;
        };
        function compactTail(acc, v0, t0) {
          const n = acc.n - v0, map = new Int32Array(n).fill(-1); let m = 0;
          for (let t = t0; t < acc.I.length; t++) { const k = acc.I[t] - v0; if (map[k] < 0) map[k] = m++; }
          if (m === n) return;
          const tmp = { P: acc.P.slice(3 * v0), N: acc.N.slice(3 * v0), C: acc.C.slice(3 * v0), K: acc.K.slice(4 * v0), B: acc.B.slice(3 * v0) };
          acc.P.length = acc.N.length = acc.C.length = acc.B.length = 3 * (v0 + m); acc.K.length = 4 * (v0 + m);
          for (let k = 0; k < n; k++) {
            const j = map[k]; if (j < 0) continue; const d = v0 + j;
            for (let q = 0; q < 3; q++) { acc.P[3 * d + q] = tmp.P[3 * k + q]; acc.N[3 * d + q] = tmp.N[3 * k + q]; acc.C[3 * d + q] = tmp.C[3 * k + q]; acc.B[3 * d + q] = tmp.B[3 * k + q]; }
            for (let q = 0; q < 4; q++) acc.K[4 * d + q] = tmp.K[4 * k + q];
          }
          for (let t = t0; t < acc.I.length; t++) acc.I[t] = v0 + map[acc.I[t] - v0];
          acc.n = v0 + m;
        }
        /* marching cubes one part, then pull every vertex onto the exact surface (GUARDED: a short step that keeps the
         * normal's side, and any triangle the pull flipped is put back) and take the analytic normal; colour last.
         * The guard is the fix for TOY's white shards on thin parts (arms, paws, jaw edge) at mid detail. */
        function mcPart(KIT, acc, sdf, box, h, mirror, colFn, keep, k, bone, guard) {
          guard = guard === undefined ? 0.35 : guard;
          const v0 = acc.n, t0 = acc.I.length;
          acc.k = k; acc.bone = bone; acc.bw = null;
          const Gd = KIT.field(sdf, box, h, mirror);
          KIT.polygonize(Gd, acc, () => 0, keep || null, 0.01);
          compactTail(acc, v0, t0);
          const P = acc.P, N = acc.N, e = h * 0.12, g = [0, 0, 0], g0 = [0, 0, 0];
          const O = P.slice(3 * v0, 3 * acc.n);
          for (let v = v0; v < acc.n; v++) {
            let x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
            grad(sdf, x, y, z, e, g0);
            for (let it = 0; it < 3; it++) { const d = sdf(x, y, z); if (abs(d) < 1e-5) break; grad(sdf, x, y, z, e, g); const s = clamp(d, -h * 0.3, h * 0.3); x -= g[0] * s; y -= g[1] * s; z -= g[2] * s; }
            grad(sdf, x, y, z, e, g);
            if (hypot(x - P[3 * v], y - P[3 * v + 1], z - P[3 * v + 2]) < h * (guard < 0 ? 0.6 : 0.45) && v3.dot(g, g0) > guard) { P[3 * v] = x; P[3 * v + 1] = y; P[3 * v + 2] = z; }
          }
          // flipped-triangle repair (two passes)
          const fn = [0, 0, 0];
          for (let pass = 0; pass < 2; pass++) {
            let bad = 0;
            for (let t = t0; t < acc.I.length; t += 3) {
              const a = acc.I[t], b = acc.I[t + 1], c = acc.I[t + 2];
              const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
              const wx = P[3 * c] - P[3 * a], wy = P[3 * c + 1] - P[3 * a + 1], wz = P[3 * c + 2] - P[3 * a + 2];
              fn[0] = uy * wz - uz * wy; fn[1] = uz * wx - ux * wz; fn[2] = ux * wy - uy * wx;
              const ox = O[3 * (b - v0)] - O[3 * (a - v0)], oy = O[3 * (b - v0) + 1] - O[3 * (a - v0) + 1], oz = O[3 * (b - v0) + 2] - O[3 * (a - v0) + 2];
              const qx = O[3 * (c - v0)] - O[3 * (a - v0)], qy = O[3 * (c - v0) + 1] - O[3 * (a - v0) + 1], qz = O[3 * (c - v0) + 2] - O[3 * (a - v0) + 2];
              const on = [oy * qz - oz * qy, oz * qx - ox * qz, ox * qy - oy * qx];
              if (fn[0] * on[0] + fn[1] * on[1] + fn[2] * on[2] < 0) {
                for (const w of [a, b, c]) for (let q = 0; q < 3; q++) P[3 * w + q] = O[3 * (w - v0) + q];
                bad++;
              }
            }
            if (!bad) break;
          }
          for (let v = v0; v < acc.n; v++) {
            grad(sdf, P[3 * v], P[3 * v + 1], P[3 * v + 2], e, g); N[3 * v] = g[0]; N[3 * v + 1] = g[1]; N[3 * v + 2] = g[2];
            const c = colFn(P[3 * v], P[3 * v + 1], P[3 * v + 2], g[0], g[1], g[2], v);
            acc.C[3 * v] = c[0]; acc.C[3 * v + 1] = c[1]; acc.C[3 * v + 2] = c[2];
          }
          return { v0, v1: acc.n, t0, t1: acc.I.length, evals: Gd.evals };
        }
        function addGeo(THREE, acc, geo, m, col, k, bone) {
          const pos = geo.attributes.position, nor = geo.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(m);
          const base = acc.n, v = new THREE.Vector3(), n = new THREE.Vector3(), flip = m.determinant() < 0;
          acc.k = k; if (typeof bone === 'function') acc.bw = bone; else { acc.bone = bone; acc.bw = null; }
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
            const c = typeof col === 'function' ? col(v.x, v.y, v.z, n.x, n.y, n.z, i) : col;
            v.applyMatrix4(m); n.applyMatrix3(nm).normalize();
            acc.v(v.x, v.y, v.z, n.x, n.y, n.z, c[0], c[1], c[2]);
          }
          acc.bw = null;
          const idx = geo.index, cnt = idx ? idx.count : pos.count;
          for (let i = 0; i < cnt; i += 3) {
            const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
            if (flip) acc.I.push(base + a, base + c, base + b); else acc.I.push(base + a, base + b, base + c);
          }
        }
        // a tube with varying elliptical section along a polyline (closed = a loop)
        function taperTube(THREE, pts, rx, ry, radial, upHint, capEnds, closed) {
          const n = pts.length, P = [], N = [], I = [], U = [];
          const tan = (i) => closed ? v3.norm(v3.sub(pts[(i + 1) % n], pts[(i - 1 + n) % n])) : v3.norm(v3.sub(pts[min(n - 1, i + 1)], pts[max(0, i - 1)]));
          for (let i = 0; i < n; i++) {
            const T = tan(i), hint = typeof upHint === 'function' ? upHint(i) : upHint, sd = v3.norm(v3.cross(T, hint)), up = v3.cross(sd, T);
            for (let j = 0; j < radial; j++) {
              const a = (j / radial) * PI * 2, ca = cos(a), sa = sin(a);
              P.push(...v3.add(v3.add(pts[i], sd, ca * rx[i]), up, sa * ry[i]));
              const kx = ca / max(rx[i], 1e-4), ky = sa / max(ry[i], 1e-4);
              N.push(...v3.norm([sd[0] * kx + up[0] * ky, sd[1] * kx + up[1] * ky, sd[2] * kx + up[2] * ky]));
              U.push(i / (n - 1), j / radial);
            }
          }
          const segs = closed ? n : n - 1;
          for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
            const i2 = (i + 1) % n;
            const a = i * radial + j, b = i * radial + (j + 1) % radial, c = i2 * radial + j, d = i2 * radial + (j + 1) % radial;
            I.push(a, c, b, b, c, d);
          }
          if (capEnds && !closed) {
            for (const [ring, dir] of [[0, -1], [n - 1, 1]]) {
              const T = tan(ring), ci = P.length / 3; P.push(...pts[ring]); N.push(T[0] * dir, T[1] * dir, T[2] * dir); U.push(ring / (n - 1), 0);
              for (let j = 0; j < radial; j++) { const a = ring * radial + j, b = ring * radial + (j + 1) % radial; if (dir > 0) I.push(a, b, ci); else I.push(b, a, ci); }
            }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
          return g;
        }
        // find the surface of f along a ray (march + bisection); returns the point or null
        function rayHit(f, o, d, t0, t1, N) {
          N = N || 64;
          const at = (t) => f(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
          let a = t0, fa = at(a);
          for (let i = 1; i <= N; i++) {
            const b = t0 + (t1 - t0) * i / N, fb = at(b);
            if ((fa > 0) !== (fb > 0)) {
              let lo = a, hi = b;
              for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2, fm = at(m); if ((fm > 0) === (fa > 0)) lo = m; else hi = m; }
              const t = (lo + hi) / 2; return [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
            }
            a = b; fa = fb;
          }
          return null;
        }
        // the face surface seen from the front at (x, y), lifted along the normal
        const faceAt = (f, x, y, lift, outN) => {
          const p = rayHit(f, [x, y, 0.42], [0, 0, -1], 0, 0.5, 40) || [x, y, 0.2], g = outN || [0, 0, 0];
          grad(f, p[0], p[1], p[2], 0.002, g); return v3.add(p, g, lift);
        };
        const onSurface = (f, pts, lift) => pts.map(([x, y]) => faceAt(f, x, y, lift));
        // a grid decal between two curves (rows x cols, fixed topology), conformed to the face
        function gridDecal(THREE, f, curveA, curveB, rows, lift, normalBias) {
          const cols = curveA.length, P = [], N = [], I = [], g = [0, 0, 0];
          for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) {
            const u = r / rows, x = lerp(curveA[c][0], curveB[c][0], u), y = lerp(curveA[c][1], curveB[c][1], u);
            const p = faceAt(f, x, y, typeof lift === 'function' ? lift(x, y, u, c / (cols - 1)) : lift, g);
            P.push(p[0], p[1], p[2]);
            const bn = v3.norm([g[0], g[1] + (normalBias || 0), g[2] + (normalBias || 0) * 1.6]); N.push(bn[0], bn[1], bn[2]);
          }
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) {
            const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
            I.push(a, b, d, b, e, d);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setIndex(I);
          return geo;
        }

        /* ------------------------------------------------------------------ LOD table */
        const LEVELS = {
          desktop: { ear: 0.0205, head: 0.027, body: 0.038, acc: 0.017, eye: [20, 11], lid: [14, 6], rim: [4, 20], tube: 6, extras: true, tail: [18, 9], seg: 1, carve: true, morph: true },
          phone:   { ear: 0.03, head: 0.0395, body: 0.056, acc: 0.025, eye: [14, 8], lid: [10, 4], rim: [3, 14], tube: 4, extras: true, tail: [12, 7], seg: 0.7, carve: true, morph: true },
          mid:     { ear: 0.057, head: 0.075, body: 0.104, acc: 0.05, eye: [9, 5], lid: [6, 3], rim: [3, 8], tube: 4, extras: false, tail: [7, 5], seg: 0.4, carve: false, morph: true },
          far:     { far: true },
        };

        /* ------------------------------------------------------------------ bones */
        const BONES = ['root', 'body', 'head', 'earL', 'earR', 'lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'sqL', 'sqR', 'tail0', 'tail1', 'tail2', 'chain0', 'chain1', 'chain2'];
        const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
        const PARENT = { body: 'root', head: 'body', earL: 'head', earR: 'head', lidL: 'head', lidR: 'head', lowL: 'head', lowR: 'head', arcL: 'head', arcR: 'head', sqL: 'head', sqR: 'head', tail0: 'body', tail1: 'tail0', tail2: 'tail1', chain0: 'body', chain1: 'chain0', chain2: 'chain1' };

        /* ------------------------------------------------------------------ build one dog */
        function build(S, THREE, KIT, detail, opts) {
          opts = opts || {};
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop;
          const C = palette(THREE, S);
          const toon = opts.toon || toonMaterial(THREE, opts);
          const isDoge = S.name === 'doge';
          const EXT = isDoge ? DOGE_EX : SHIBA_EX, E0 = EXT.neutral;
          const F = dogSDF(S, LV, E0);
          if (LV.far) return buildFar(THREE, S, F, C, toon, T0, now);
          const stats = { parts: {} };
          const acc = new Acc();
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const qFrom = (dir) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(v3.norm(dir)));
          const tpart = (name, t0) => { stats.parts[name] = (stats.parts[name] || 0) + (acc.I.length - t0) / 3; };
          const ALL = (x, y, z) => min(F.headF(x, y, z), F.bodyF(x, y, z));
          const aoAt = (x, y, z, nx, ny, nz, step) => {
            let occ = 0;
            for (let s = 1; s <= 4; s++) { const hs = s * step; occ += max(0, 1 - ALL(x + nx * hs, y + ny * hs, z + nz * hs) / hs) / s; }
            return sat(1 - 0.55 * max(0, occ - 0.12));
          };
          const aoStep = detail === 'mid' ? 0.03 : 0.018;
          // AO folded into the colour, tinted warm (never grey): the darkened colour keeps its own hue
          const shade = (c, ao, lo) => { const k = lo + (1 - lo) * ao; return [c[0] * k, c[1] * k * (0.97 + 0.03 * k), c[2] * k * (0.9 + 0.1 * k)]; };
          const kFur = [0.6, 1, 3, 1];
          let t = now(), t0;

          /* ---- eye placement: on the surface, protruding (toy), facing between forward and the surface normal */
          const g0 = [0, 0, 0];
          const eyeAt = (side) => {
            const p = rayHit(F.headCore, [side * S.eye.x, S.eye.y, 0.6], [0, 0, -1], 0, 0.8);
            grad(F.headCore, p[0], p[1], p[2], 0.002, g0);
            const dir = v3.norm(v3.lerp(g0, [side * 0.12, 0.02, 1], S.eye.fwd));
            return { c: v3.add(p, dir, -(S.eye.r - S.eye.prot)), dir };
          };
          const EYE = { L: eyeAt(1), R: eyeAt(-1) };
          const eyeQ = (side) => qFrom(side > 0 ? EYE.L.dir : EYE.R.dir);

          /* ---- zone colours on the head */
          const maskW = (x, y, z) => {   // 1 = cream/white
            const ax = abs(x);
            if (isDoge) {
              // CLASSIC's two-tone: cream muzzle, cheeks, jowls, chin and under the eyes; tan crown, brow, around the eyes, back
              const line = 0.676 - 0.22 * max(0, ax - 0.07) - 0.15 * max(0, -z);
              let m = sstep(0.008, -0.03, y - line) * sstep(-0.16, -0.02, z);
              const bridge = sstep(0.04, 0.018, ax) * sstep(0.612, 0.66, y) * sstep(0.1, 0.18, z);
              m = sat(m - bridge * 0.55);
              m = max(m, sstep(0.57, 0.5, y) * sstep(-0.08, 0.02, z));
              return m;
            }
            const below = sstep(0.0, -0.04, y - (0.664 - 0.35 * (ax - 0.08)) - 0.25 * min(0, z - 0.05));
            const bridge = sstep(0.05, 0.02, ax) * sstep(0.6, 0.66, y) * sstep(0.08, 0.16, z);
            let m = sat(below - bridge * 0.9);
            m = max(m, sstep(0.56, 0.5, y) * sstep(-0.04, 0.05, z));
            if (S.lobes.length) m = max(m, sstep(0.012, -0.004, F.lobeF(ax, y, z)) * sstep(0.62, 0.56, y));   // the white ruff
            return m;
          };
          const headCol = (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const ax = abs(x);
            let earIn = 0;
            if (y > 0.8) {   // inner ear: a soft colour gradient into the bowl (same zone as the fur: no zone seams)
              const ep = F.earParts(ax, y, z);
              if (ep[0] < 0.01) earIn = sstep(0.004, -0.014, ep[1]) * sstep(-S.ear.th * 0.45, S.ear.th * 0.1, ep[2]) * sstep(0.012, 0.0, ep[0]);
            }
            let c = mix3(C.base, C.baseDk, sstep(0.86, 1.02, y) * 0.3 + sstep(-0.1, -0.25, z) * 0.2);
            c = mix3(c, C.mask, maskW(x, y, z));
            if (earIn > 0) { c = mix3(c, C.inner, earIn * 0.9); acc.K[4 * v] = lerp(0.6, 0.85, earIn); }
            if (F.carveOn && z > 0.05 && y < 0.62 && y > 0.42) {                // the mouth cavity: dark inside the grin outline
              const u = mUnwarp(E0.mouth, x, y), f2 = mouth2D(u[0], u[1]), inside = max(sstep(0.001, -0.004, f2), sstep(-0.0015, -0.006, F.headCore(x, y, z)) * sstep(0.012, 0.004, f2));
              if (inside > 0) {
                const roof = sstep(MOUTH.cy - 0.01, MOUTH.ty, y);
                c = mix3(c, mix3(C.mouth, C.mouthHi, roof * 0.5), inside);
                acc.K[4 * v] = lerp(0.6, 0.85, inside); acc.K[4 * v + 3] = lerp(ao, 0.1, inside);
                return mix3(shade(c, ao, 0.72), c, inside);
              }
            }
            return shade(c, ao, 0.72);
          };

          /* ---- head (fur) */
          t0 = acc.I.length;
          // the head without its ears (drop what the ear fillets cover), then the ears + fillets on a finer grid
          const hd = mcPart(KIT, acc, F.headNoEar, [-0.38, 0.4, -0.32, 0.38, 1.0, 0.36], LV.head, true, headCol, (x, y, z) => y < 0.78 || F.headF(x, y, z) > -0.0025, kFur, BI.head);
          tpart('head', t0); t0 = acc.I.length;
          const er = mcPart(KIT, acc, F.headF, [-0.4, 0.76, -0.3, 0.4, 1.17, 0.16], LV.ear, true, headCol, (x, y, z) => F.headNoEar(x, y, z) > 0.0008, kFur, BI.head);
          tpart('ears', t0);
          // ear vertices ride the ear bones (they flick and pin back)
          {
            const ER = S.ear, EL = F.EL;
            for (let v = er.v0; v < er.v1; v++) {
              const x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2]; if (y < 0.8) continue;
              const ep = F.earParts(abs(x), y, z);
              if (ep[0] > F.headCore(x, y, z) - 0.002) continue;
              const w = sstep(0.04, 0.4, ep[3] / EL);
              if (w <= 0) continue;
              acc.B[3 * v] = BI.head; acc.B[3 * v + 1] = x > 0 ? BI.earL : BI.earR; acc.B[3 * v + 2] = w;
            }
            void ER;
          }

          /* ---- body (fur): torso, arms, legs; drop what hides inside the head */
          t0 = acc.I.length;
          const pawC = F.pawC;
          mcPart(KIT, acc, F.bodyF, [-0.36, -0.03, -0.26, 0.36, 0.52, 0.48], LV.body, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const ax = abs(x);
            let c = mix3(C.base, C.baseDk, sstep(0.0, -0.2, z) * 0.22);
            const tw = sstep(0.012, -0.006, F.torsoF(x, y, z) - min(F.armF(ax, y, z), F.legF(ax, y, z)));   // 1 = torso skin, 0 = arm/leg
            const chest = tw * (sstep(0.0, 0.08, z) * sstep(0.13, 0.05, ax) + sstep(0.03, 0.12, z) * sstep(0.47, 0.3, y) * sstep(0.18, 0.1, ax));
            const belly = isDoge ? tw * sstep(0.02, 0.1, z) * sstep(0.2, 0.12, ax) * sstep(0.32, 0.2, y) : 0;
            const paw = sstep(0.095, 0.055, hypot(ax - pawC[0], y - pawC[1], z - pawC[2]));
            const foot = sstep(0.105, 0.065, hypot(ax - S.F[0], y - S.F[1], z - S.F[2] - 0.035));
            c = mix3(c, C.mask, sat(chest + belly + paw + foot));
            return shade(c, ao, 0.7);
          }, (x, y, z) => F.headF(x, y, z) > -0.01, kFur, BI.body);
          tpart('body', t0);
          stats.sdfMs = Math.round(now() - t); t = now();

          /* ---- nose: a glossy rounded inverted triangle */
          t0 = acc.I.length;
          {
            const p = rayHit(F.headF, [0, S.nose.y, 0.6], [0, 0, -1], 0, 0.8);
            const g = new THREE.SphereGeometry(1, LV.lid[0], LV.lid[1] + 2);
            const pos = g.attributes.position;
            for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), w = 1 + 0.32 * min(0, y) - 0.06 * max(0, y); pos.setX(i, pos.getX(i) * w); pos.setZ(i, pos.getZ(i) * (1 - 0.18 * max(0, -y))); }
            g.computeVertexNormals();
            addGeo(THREE, acc, g, M4().compose(V(v3.add(p, [0, 0, S.nose.dz])), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 0)), V(S.nose.r)),
              (x, y, z, nx, ny) => mix3(C.nose, mul3(C.nose, 2.4), sstep(0.2, 0.9, ny) * 0.5), [0.2, 0, 0, 1], BI.head);
          }
          tpart('nose', t0);

          /* ---- the face: everything an expression changes (fixed topology; rebuilt per expression for the morphs) */
          const lineK = [0.5, 0, 0, 0.6], darkK = [0.7, 0, 4, 1];
          const nLine = max(8, Math.round(26 * LV.seg));
          function buildFace(A, E, FE) {
            const hf = FE.headF, core = FE.headCore;
            if (isDoge) {
              const M = E.mouth;
              const top = (s) => [s * M.w, M.y + M.curve * s * s + M.tilt * s + M.wob * sin(s * 9.5) + M.flick * max(0, s - 0.7) / 0.3];
              const bot = (s) => { const q = sat(1 - (s / max(0.05, M.openW)) ** 2); const p = top(s); return [p[0], p[1] - M.open * Math.pow(q, 0.6) - 0.0004]; };
              const S1 = [], S2 = [], S3 = [];
              for (let i = 0; i <= nLine; i++) { const s = -1 + 2 * i / nLine; S1.push(top(s)); S2.push(bot(s)); }
              // the open mouth (painted, matte), collapsed to the line when closed
              A.k = darkK;
              addGeo(THREE, A, gridDecal(THREE, hf, S1, S2, 3, 0.0018, 0.25), M4(), (x, y) => mix3(C.mouth, C.mouthHi, 0.3), darkK, BI.head);
              // the tongue patch on the lower half of the opening
              for (let i = 0; i <= nLine; i++) {
                const s = -1 + 2 * i / nLine, ts = s * 0.5 * M.openW, b = bot(ts), q = sat(1 - (s * s));
                S3.push([b[0], b[1] + 0.0008 + M.tongue * M.open * 0.55 * Math.pow(q, 0.7)]);
              }
              const S4 = S3.map((p, i) => { const s = -1 + 2 * i / nLine; return bot(s * 0.5 * M.openW); });
              addGeo(THREE, A, gridDecal(THREE, hf, S4, S3, 2, (x, y, u) => 0.0026 + 0.0035 * u * M.tongue, 0.25), M4(), (x, y, z, nx, ny) => mix3(C.tongue, C.tongueDk, 0.3), [0.4, 0.4, 0, 1], BI.head);
              // the line (upper lip) and a thinner lower-lip line that separates when the mouth opens
              const sp = onSurface(hf, S1, 0.0016), rr = sp.map((_, i) => 0.0088 * (0.45 + 0.55 * sin(PI * (0.06 + 0.88 * i / nLine))));
              addGeo(THREE, A, taperTube(THREE, sp, rr, rr, LV.tube, [0, 0, 1], true), M4(), C.line, lineK, BI.head);
              const sb = onSurface(hf, S2, 0.0012), rb = sb.map((_, i) => 0.0062 * (0.3 + 0.7 * sin(PI * (0.06 + 0.88 * i / nLine))));
              addGeo(THREE, A, taperTube(THREE, sb, rb, rb, max(4, LV.tube - 2), [0, 0, 1], true), M4(), C.line, lineK, BI.head);
              // raised brow dots (one higher: the skeptical side-eye)
              const dotG = new THREE.SphereGeometry(1, max(6, LV.lid[0] >> 1), max(4, LV.lid[1] >> 1));
              for (const [side, dy] of [[1, E.brow[0]], [-1, E.brow[1]]]) {
                const p = rayHit(hf, [side * 0.088, S.eye.y + 0.072 + dy, 0.6], [0, 0, -1], 0, 0.8, 40); grad(hf, p[0], p[1], p[2], 0.002, g0);
                addGeo(THREE, A, dotG, M4().compose(V(v3.add(p, g0, -0.004)), qFrom(g0).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * (0.35 + 2 * dy)))), V([0.03, 0.019, 0.012])),
                  (x, y, z, nx, ny) => mix3(C.brow, C.maskHi, sstep(0, 1, ny) * 0.5), [0.6, 1, 3, 1], BI.head);
              }
              // the nervous sweat drop on the temple (collapsed inside the head when off)
              if (LV.extras) {
                const p = rayHit(hf, [0.248, 0.728, 0.6], [0, 0, -1], 0, 0.8, 40) || [0.25, 0.75, 0.05]; grad(hf, p[0], p[1], p[2], 0.002, g0);
                const sw = E.sweat;
                const dg = new THREE.LatheGeometry([[0, -1], [0.55, -0.86], [0.82, -0.45], [0.66, 0.1], [0.3, 0.62], [0, 1.05]].map(([r, h]) => new THREE.Vector2(r * 0.028, h * 0.044)), max(6, LV.lid[0] >> 1));
                const at = sw > 0.01 ? v3.add(p, g0, 0.016 * min(1, sw) - 0.02 * (1 - min(1, sw))) : v3.add(p, g0, -0.03);
                addGeo(THREE, A, dg, M4().compose(V(v3.add(at, [0, -0.012 * max(0, sw - 1), 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.25)), V(v3.scale([1, 1, 0.75], max(0.002, sw)))),
                  (x, y, z, nx, ny) => mix3(C.sweat, C.sweatHi, sstep(0.0, 0.9, ny + nx * 0.3)), [0.05, 0, 0, 1], BI.head);
              }
            } else {
              const M = E.mouth, W = (p) => mWarp(M, p[0], p[1]);
              const nO = max(10, Math.round(20 * LV.seg));
              const out0 = mouthOutline(nO), out = out0.map(W);
              if (!F.carveOn) {
                // mid detail: a painted mouth (polar grid from the centre) + a tongue patch
                const cN = W([0, MOUTH.cy + 0.004]), ring = out.concat([out[0]]);
                addGeo(THREE, A, gridDecal(THREE, core, ring.map(() => cN), ring, 2, 0.004, 0.3), M4(), (x, y) => mix3(C.mouth, C.mouthHi, 0.3), darkK, BI.head);
                const tw = 0.05, tyTop = MOUTH.cy - 0.004, tyBot = MOUTH.cy - MOUTH.ry - 0.012, tq = [];
                for (let i = 0; i <= 8; i++) { const a = PI + PI * i / 8; tq.push(W([tw * cos(a), tyTop + (tyTop - tyBot) * 0.9 * sin(a)])); }
                const tc = tq.map(() => W([0, tyTop]));
                addGeo(THREE, A, gridDecal(THREE, core, tc, tq, 1, 0.0062, 0.3), M4(), C.tongue, [0.32, 0.5, 0, 1], BI.head);
              } else {
                // desktop / phone: a real tongue in the carved mouth, its tip resting over the lower lip
                const ts = M.tongue, tip = W([0, MOUTH.cy - MOUTH.ry * 0.62]);
                const zs = faceAt(core, tip[0], tip[1], 0)[2];
                const tg = new THREE.SphereGeometry(1, LV.lid[0] + 4, max(7, LV.lid[1] + 2));
                const pos = tg.attributes.position;
                for (let i = 0; i < pos.count; i++) {   // flatter on top, a centre groove, a rounder tip
                  const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                  pos.setXYZ(i, x * (1 + 0.15 * max(0, z)), y * (y > 0 ? 0.55 : 1) - 0.18 * max(0, y) * (1 - abs(x) * 2.5 > 0 ? (1 - abs(x) * 2.5) : 0), z);
                }
                tg.computeVertexNormals();
                const len = 0.06 * ts, cz = zs - len * 0.95 + 0.006 + 0.022 * M.tOut;
                addGeo(THREE, A, tg, M4().compose(V([0, tip[1] + 0.006 - 0.006 * M.tOut, cz]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32 + 0.25 * M.tOut, 0, 0)), V([0.046 * M.sx * (0.7 + 0.3 * ts), 0.022 * ts, len])),
                  (x, y, z, nx, ny) => mix3(C.tongueDk, C.tongue, sstep(-0.6, 0.6, ny) * 0.8 + 0.2), [0.32, 0.5, 0, 1], BI.head);
              }
              // the lip rim: a dark raised line on the mouth edge
              const ol = onSurface(core, out, -0.0015), lr = ol.map(() => LV.seg > 0.9 ? 0.0078 : 0.0095);
              addGeo(THREE, A, taperTube(THREE, ol, lr, lr, LV.tube, () => [0, 0, 1], false, true), M4(), C.lidLine, lineK, BI.head);
            }
          }
          t0 = acc.I.length;
          const fc0 = acc.n;
          buildFace(acc, E0, F);
          const fc1 = acc.n;
          tpart('face', t0);

          /* ---- eyelids (upper shell + dark rim, lower shell), happy arcs, squeeze chevrons */
          t0 = acc.I.length;
          const eyeR = S.eye.r, lidR = eyeR + 0.0045;
          const upG = new THREE.SphereGeometry(lidR, LV.lid[0], LV.lid[1], 0, PI * 2, 0, PI / 2);
          const loG = new THREE.SphereGeometry(lidR - 0.0016, LV.lid[0], max(3, LV.lid[1] - 2), 0, PI * 2, PI / 2, PI / 2);
          const rimG = new THREE.TorusGeometry(lidR - 0.002, 0.0055, LV.rim[0], LV.rim[1], PI).rotateX(PI / 2);
          const loRimG = new THREE.TorusGeometry(lidR - 0.0035, 0.0028, 3, max(8, LV.rim[1] >> 1), PI).rotateX(PI / 2);
          const nA = max(6, Math.round(12 * LV.seg)), tubeA = max(3, LV.tube - 2);
          const arcPts = []; for (let i = 0; i <= nA; i++) { const s = -1 + 2 * i / nA; arcPts.push(v3.scale(v3.norm([0.66 * s, -0.1 + 0.32 * (1 - s * s), 1]), lidR + 0.003)); }
          const arcR = arcPts.map((_, i) => 0.0088 * (0.4 + 0.6 * sin(PI * i / nA)));
          const arcG = taperTube(THREE, arcPts, arcR, arcR, tubeA, [0, 0, 1], true);
          for (const side of [1, -1]) {
            const sfx = side > 0 ? 'L' : 'R';
            // lid geometry lives in the eye frame; the bones carry that frame (bind pose below)
            addGeo(THREE, acc, upG, M4(), (x, y) => shade(mix3(C.lid, mul3(C.lid, 0.86), sstep(0, lidR, y) * 0.4), 1, 1), [0.5, 1, 3, 0.9], BI['lid' + sfx]);
            addGeo(THREE, acc, rimG, M4(), C.lidLine, [0.45, 0.3, 0, 0.7], BI['lid' + sfx]);
            addGeo(THREE, acc, loG, M4(), (x, y) => shade(C.lidLo, 0.92, 1), [0.55, 1, 3, 0.9], BI['low' + sfx]);
            if (LV.extras) addGeo(THREE, acc, loRimG, M4(), mix3(C.lidLine, C.lidLo, 0.45), [0.5, 0, 0, 1], BI['low' + sfx]);
            addGeo(THREE, acc, arcG, M4(), C.lidLine, [0.45, 0, 0, 1], BI['arc' + sfx]);
            // the squeeze chevron (> <): its point toward the nose
            const ch = [[side * 0.55, 0.42], [-side * 0.4, 0.02], [side * 0.55, -0.36]].map(([a, b]) => v3.scale(v3.norm([a, b, 1]), lidR + 0.003));
            const chP = new THREE.CatmullRomCurve3(ch.map((p) => V(p)), false, 'catmullrom', 0.1).getPoints(max(6, nA)).map((p) => [p.x, p.y, p.z]);
            const chR = chP.map((_, i) => 0.0085 * (0.5 + 0.5 * sin(PI * i / (chP.length - 1))));
            addGeo(THREE, acc, taperTube(THREE, chP, chR, chR, tubeA, [0, 0, 1], true), M4(), C.lidLine, [0.45, 0, 0, 1], BI['sq' + sfx]);
          }
          tpart('lids', t0);

          /* ---- accessories */
          t0 = acc.I.length;
          if (isDoge) {
            // leather aviator cap: the crown shell above a plane that dips toward the back, ear flaps, neat openings for the ears
            const cr = S.cran, CP = 0.765, plane = (x, y, z) => (CP + 0.5 * z) - y;
            const capF = (x, y, z) => smax(ell(x - cr[0], y - cr[1], z - cr[2], cr[3] + 0.019, cr[4] + 0.019, cr[5] + 0.019), plane(x, y, z), 0.012);
            mcPart(KIT, acc, capF, [-0.33, 0.54, -0.31, 0.33, 0.99, 0.28], LV.acc * 1.6, true, (x, y, z, nx, ny, nz, v) => {
              const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
              const seam = sstep(0.006, 0.0, abs(x)) * sstep(0.8, 0.86, y) * sstep(-0.2, 0.1, z);
              return shade(mix3(mix3(C.leather, mul3(C.leather, 1.35), sstep(0.3, 0.95, ny) * 0.5), C.leatherDk, seam * 0.5), max(ao, 0.6), 0.55);
            }, (x, y, z) => F.headF(x, y, z) > -0.002 || y > 0.86, [0.42, 0.3, 0, 1], BI.head, -0.3);
            // a fleece collar where each ear comes through the cap (hides the join; ears move a little inside it)
            for (const side of [1, -1]) {
              const ea = [side * F.ea[0], F.ea[1], F.ea[2]], ew = [side * F.ew[0], F.ew[1], F.ew[2]], eu = [side * F.eu[0], F.eu[1], F.eu[2]];
              const b0 = [side * S.ear.b[0], S.ear.b[1], S.ear.b[2]];
              let tc = 0; for (let k = 0; k < 40; k++) { const q = v3.add(b0, ea, k * 0.005); if (capF(q[0], q[1], q[2]) > 0) { tc = k * 0.005; break; } }
              const c0 = v3.add(b0, ea, tc - 0.006), ring = [], nC = max(8, Math.round(18 * LV.seg));
              for (let i = 0; i < nC; i++) { const a = (i / nC) * PI * 2; ring.push(v3.add(v3.add(c0, ew, cos(a) * (S.ear.rb * 0.98)), eu, sin(a) * (S.ear.th * 0.98 + 0.008))); }
              const rr = ring.map(() => 0.016);
              addGeo(THREE, acc, taperTube(THREE, ring, rr, rr, max(3, LV.tube - 2), () => ea, false, true), M4(), (x, y, z, nx, ny) => shade(C.fleece, 0.82 + 0.18 * sstep(-0.5, 0.8, ny), 1), [0.85, 1, 3, 1], side > 0 ? BI.earL : BI.earR);
            }
            // fleece trim roll along the cap edge
            const e2 = v3.norm([0, 0.5, 1]), c0 = [0, CP + 0.5 * -0.02, -0.02], rim = [];
            const nR = max(14, Math.round(32 * LV.seg));
            const outer = (x, y, z) => ell(x - cr[0], y - cr[1], z - cr[2], cr[3] + 0.019, cr[4] + 0.019, cr[5] + 0.019);
            for (let i = 0; i < nR; i++) { const a = (i / nR) * PI * 2, d = v3.add(v3.scale([1, 0, 0], sin(a)), e2, cos(a)); rim.push(rayHit(outer, c0, d, 0, 0.5) || c0); }
            const rr = rim.map(() => 0.017);
            addGeo(THREE, acc, taperTube(THREE, rim, rr, rr, LV.tube, (i) => v3.norm(v3.sub(rim[i], c0)), false, true), M4(), (x, y, z, nx, ny) => shade(C.fleece, 0.82 + 0.18 * sstep(-0.5, 0.8, ny), 1), [0.85, 1, 3, 1], BI.head);
            // goggles on the cap's FRONT brow, just above the fleece, clear of the ears (CLASSIC's layout)
            const gogC = [];
            for (const side of [1, -1]) {
              const p = rayHit(capF, [side * 0.05, 0.905, 0.6], [0, 0, -1], 0, 0.8); grad(capF, p[0], p[1], p[2], 0.002, g0);
              const q = qFrom(v3.lerp(g0, [0, 0.2, 1], 0.25));
              gogC.push(v3.add(p, g0, 0.009));
              addGeo(THREE, acc, new THREE.TorusGeometry(0.03, 0.0088, LV.rim[0], LV.rim[1]), M4().compose(V(v3.add(p, g0, 0.008)), q, V([1, 1, 1.3])), C.brass, [0.22, 0, 0, 1], BI.head);
              addGeo(THREE, acc, new THREE.SphereGeometry(0.031, LV.lid[0], 3, 0, PI * 2, 0, PI * 0.32).rotateX(PI / 2), M4().compose(V(v3.add(p, g0, -0.02)), q, V([1, 1, 1])),
                (x, y, z, nx, ny) => mix3(C.lens, mul3(C.lens, 2.2), sstep(0.2, 0.8, ny) * 0.6), [0.08, 0, 0, 1], BI.head);
            }
            if (LV.extras) {
            const bridge = onSurface(capF, [[-0.02, 0.909], [0, 0.912], [0.02, 0.909]], 0.011);
            addGeo(THREE, acc, taperTube(THREE, bridge, [0.0065, 0.0065, 0.0065], [0.0065, 0.0065, 0.0065], 4, [0, 0, 1], true), M4(), C.brass, [0.22, 0, 0, 1], BI.head);
            }
            // strap: from each goggle round the back of the cap, under the ears
            const strap = [], sc0 = [0, 0.8, -0.02];
            const nS = max(10, Math.round(30 * LV.seg));
            for (let i = 0; i <= nS; i++) {
              const a = -0.78 * PI + (1.56 * PI * i) / nS, d = v3.norm([-sin(a + PI), 0.3, -cos(a + PI)]);
              const p = rayHit(capF, sc0, d, 0, 0.5); if (p) strap.push(v3.add(p, v3.norm(v3.sub(p, sc0)), 0.005));
            }
            if (LV.extras && strap.length > 3) addGeo(THREE, acc, taperTube(THREE, strap, strap.map(() => 0.016), strap.map(() => 0.004), 4, (i) => v3.norm(v3.sub(strap[i], sc0)), true), M4(), C.strap, [0.5, 0, 0, 1], BI.head);
            // the scarf: a soft roll round the neck, then a tail that streams back on the chain bones
            const sc = new THREE.TorusGeometry(0.172, 0.056, LV.rim[0] + 2, max(12, LV.rim[1] + 2)).rotateX(PI / 2);
            addGeo(THREE, acc, sc, M4().compose(V([0, 0.465, -0.03]), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0)), V([1, 0.78, 0.94])),
              (x, y, z, nx, ny) => shade(mix3(C.scarf, C.scarfDk, sstep(0.3, -0.7, ny) * 0.6), 1, 1), [0.7, 1, 3, 1], BI.body);
            const knot = [0.14, 0.46, -0.12];
            addGeo(THREE, acc, new THREE.SphereGeometry(0.06, LV.lid[0], max(4, LV.lid[1] - 2)), M4().compose(V(knot), new THREE.Quaternion(), V([1, 0.85, 0.9])), C.scarf, [0.7, 1, 3, 1], BI.body);
            const tailPts = new THREE.CatmullRomCurve3([knot, [0.18, 0.43, -0.22], [0.23, 0.45, -0.34], [0.27, 0.49, -0.47], [0.27, 0.47, -0.62]].map((p) => V(p))).getPoints(max(8, Math.round(18 * LV.seg))).map((p) => [p.x, p.y, p.z]);
            const nT = tailPts.length - 1;
            const chainW = (x, y, z) => { const u = clamp((-z - 0.15) / 0.47, 0, 0.999) * 3; const i = Math.floor(u), f = u - i; return i >= 2 ? [BI.chain2, BI.chain2, 0] : [BI['chain' + i], BI['chain' + (i + 1)], f]; };
            addGeo(THREE, acc, taperTube(THREE, tailPts, tailPts.map(() => 0.011), tailPts.map((_, i) => 0.05 + 0.016 * i / nT), LV.tube, [1, 0, 0], true), M4(),
              (x, y, z, nx) => { const u = (-z - 0.15) / 0.47; const st = (u > 0.72 && u < 0.8) || (u > 0.86 && u < 0.93) ? 1 : 0; return mix3(mix3(C.scarf, C.scarfDk, 0.25 * sstep(0, -1, nx)), C.stripe, st); }, [0.7, 1, 3, 1], chainW);
          } else {
            // sakura headband: a band on the forehead (on a plane rising to the front), a knot and two long tails at the back
            const cr = S.cran, pn = hypot(1, 0.2);
            const bandF = (x, y, z) => smax(ell(x - cr[0], y - cr[1], z - cr[2], cr[3] + 0.013, cr[4] + 0.013, cr[5] + 0.013), abs((y - 0.795 - 0.2 * z) / pn) - 0.027, 0.006);
            {
              const np = v3.norm([0, 1, -0.2]), e2b = v3.norm([0, 0.2, 1]), c0 = [0, 0.795 + 0.2 * cr[2], cr[2]], loop = [];
              const nB = max(16, Math.round(56 * LV.seg));
              for (let i = 0; i < nB; i++) { const a = (i / nB) * PI * 2, d = v3.add(v3.scale([1, 0, 0], sin(a)), e2b, cos(a)); const p = rayHit(F.headCore, c0, d, 0, 0.5) || c0; loop.push(v3.add(p, d, 0.004)); }
              const bg = taperTube(THREE, loop, loop.map(() => 0.012), loop.map(() => 0.029), LV.tube + 2, np, false, true);
              addGeo(THREE, acc, bg, M4(), (x, y, z, nx, ny, nz) => { const up = nx * np[0] + ny * np[1] + nz * np[2]; return mix3(C.band, C.bandDk, sstep(0.5, 0.95, abs(up)) * 0.4); }, [0.62, 0.4, 0, 1], BI.head);
            }
            const pf = rayHit(bandF, [0, 0.84, 0.6], [0, 0, -1], 0, 0.8); grad(bandF, pf[0], pf[1], pf[2], 0.002, g0);
            const qf = qFrom(g0), petal = new THREE.SphereGeometry(1, 8, 4);
            for (let i = 0; i < 5; i++) {
              const a = (i / 5) * PI * 2 + PI / 2, off = new THREE.Vector3(cos(a) * 0.017, sin(a) * 0.017, 0.002).applyQuaternion(qf);
              addGeo(THREE, acc, petal, M4().compose(V(pf).add(off), qf.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a))), V([0.016, 0.011, 0.005])), C.petal, [0.45, 0, 0, 1], BI.head);
            }
            addGeo(THREE, acc, petal, M4().compose(V(v3.add(pf, g0, 0.005)), qf, V([0.007, 0.007, 0.004])), C.petalC, [0.4, 0, 0, 1], BI.head);
            const pk = rayHit(bandF, [0, 0.74, -0.6], [0, 0, 1], 0, 0.8) || [0, 0.74, -0.27];
            addGeo(THREE, acc, new THREE.SphereGeometry(0.032, LV.lid[0], LV.lid[1]), M4().compose(V(v3.add(pk, [0, 0, -0.012])), new THREE.Quaternion(), V([1.3, 0.95, 0.8])), C.band, [0.62, 0.4, 0, 1], BI.head);
            const chainW = (x, y, z) => { const u = clamp((-z - 0.28) / 0.26, 0, 0.999) * 3; const i = Math.floor(u), f = u - i; return i >= 2 ? [BI.chain2, BI.chain2, 0] : [BI['chain' + i], BI['chain' + (i + 1)], f]; };
            for (const side of [1, -1]) {
              const tp = new THREE.CatmullRomCurve3([v3.add(pk, [side * 0.015, -0.005, -0.02]), v3.add(pk, [side * 0.055, -0.04, -0.1]), v3.add(pk, [side * 0.08, -0.06, -0.2]), v3.add(pk, [side * 0.08, -0.05, -0.29])].map((p) => V(p)))
                .getPoints(max(5, Math.round(10 * LV.seg))).map((p) => [p.x, p.y, p.z]);
              const nT = tp.length - 1;
              addGeo(THREE, acc, taperTube(THREE, tp, tp.map(() => 0.006), tp.map((_, i) => 0.024 + 0.008 * i / nT), LV.tube, [1, 0, 0], true), M4(),
                (x, y, z, nx) => mix3(C.band, C.bandDk, 0.3 * sstep(0, -1, nx * side)), [0.62, 0.4, 0, 1], chainW);
            }
          }
          tpart('accessories', t0);

          /* ---- the curled tail (3 spring bones), fluffy section, pale underside */
          t0 = acc.I.length;
          const TL = S.tail, curve = new THREE.CatmullRomCurve3(TL.pts.map((p) => V(p)));
          const tN = LV.tail[0], tpts = curve.getPoints(tN).map((p) => [p.x, p.y, p.z]);
          const tr = tpts.map((_, i) => { const u = i / tN; return lerp(TL.r0, TL.r1, u) + TL.fluff * sin(PI * min(1, u * 1.4)); });
          const tg = taperTube(THREE, tpts, tr, tr.map((r) => r * 0.92), LV.tail[1], [1, 0, 0], true);
          {
            const uv = tg.attributes.uv, pos = tg.attributes.position, nor = tg.attributes.normal;
            acc.k = kFur; const base = acc.n;
            for (let i = 0; i < pos.count; i++) {
              const u = uv.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
              const inner = sstep(0.1, -0.6, ny * 0.6 + nz * -0.4 + 0.2) * 0.85;
              const c = mix3(C.base, C.mask, max(inner, sstep(isDoge ? 0.6 : 0.82, isDoge ? 0.95 : 0.98, u)));
              const uu = clamp(u, 0, 0.999) * 3, bi = Math.floor(uu), f = uu - bi;
              acc.bw = () => (bi >= 2 ? [BI.tail2, BI.tail2, 0] : [BI['tail' + bi], BI['tail' + (bi + 1)], f]);
              acc.v(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), ny, nz, ...shade(c, 0.86 + 0.14 * sstep(-0.5, 0.5, ny), 1));
            }
            acc.bw = null;
            for (let i = 0; i < tg.index.count; i++) acc.I.push(base + tg.index.getX(i));
          }
          tpart('tail', t0);
          stats.accMs = Math.round(now() - t); t = now();

          /* ---- geometry; lid/arc/chevron vertices are authored in the eye frame: bind them at the eye */
          const nv = acc.n;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
          for (let v = 0; v < nv; v++) { SI[4 * v] = acc.B[3 * v]; SI[4 * v + 1] = acc.B[3 * v + 1]; const f = acc.B[3 * v + 2]; SW[4 * v] = 1 - f; SW[4 * v + 1] = f; }
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
          // eye-frame parts: move them into place (the bones' bind pose = the eye frame)
          {
            const pa = geo.attributes.position, na = geo.attributes.normal, vv = new THREE.Vector3(), nn = new THREE.Vector3();
            const eyeBones = new Set(['lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'sqL', 'sqR'].map((n) => BI[n]));
            const qL = eyeQ(1), qR = eyeQ(-1);
            for (let v = 0; v < nv; v++) {
              const b = acc.B[3 * v]; if (!eyeBones.has(b)) continue;
              const side = BONES[b].endsWith('L') ? 1 : -1, E = side > 0 ? EYE.L : EYE.R, q = side > 0 ? qL : qR;
              vv.fromBufferAttribute(pa, v).applyQuaternion(q).add(V(E.c)); pa.setXYZ(v, vv.x, vv.y, vv.z);
              nn.fromBufferAttribute(na, v).applyQuaternion(q); na.setXYZ(v, nn.x, nn.y, nn.z);
            }
          }
          geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));

          /* ---- morph targets: head re-projected onto the expression SDF (mouth warp first), face rebuilt with E */
          const names = [];
          if (LV.morph && !(typeof window !== 'undefined' && window.KartDiag && window.KartDiag.nomorph)) {
            geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
            const g = [0, 0, 0];
            for (const name of EX_NAMES[S.name]) {
              const E = EXT[name], FE = dogSDF(S, LV, E), fE = FE.headF;
              const dP = new Float32Array(nv * 3), dN = new Float32Array(nv * 3);
              const changes = (E.cheek || 0) !== (E0.cheek || 0) || (!isDoge && JSON.stringify(E.mouth) !== JSON.stringify(E0.mouth));
              if (changes) for (let v = hd.v0; v < hd.v1; v++) {
                let x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
                if (z < -0.02 || y > 0.76 || y < 0.42) continue;
                const lvl = F.headF(x, y, z);
                if (!isDoge) {   // carry the mouth region by the outline warp (colours travel with it)
                  const w = sstep(0.11, 0.02, mouth2D(x, y)) * sstep(0.05, 0.12, z);
                  if (w > 0) { const q = mWarp(E.mouth, x, y); x += (q[0] - x) * w; y += (q[1] - y) * w; }
                }
                let d = fE(x, y, z) - lvl;
                if (abs(d) < 2e-5 && x === acc.P[3 * v] && y === acc.P[3 * v + 1]) continue;
                for (let it = 0; it < 4 && abs(d) > 1e-5; it++) { grad(fE, x, y, z, 0.0015, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; d = fE(x, y, z) - lvl; }
                grad(fE, x, y, z, 0.002, g);
                dP[3 * v] = x - acc.P[3 * v]; dP[3 * v + 1] = y - acc.P[3 * v + 1]; dP[3 * v + 2] = z - acc.P[3 * v + 2];
                dN[3 * v] = g[0] - acc.N[3 * v]; dN[3 * v + 1] = g[1] - acc.N[3 * v + 1]; dN[3 * v + 2] = g[2] - acc.N[3 * v + 2];
              }
              // morph flip guard: shrink the delta of any head triangle the expression would fold over (and cap the move)
              if (changes) {
                const Pp = acc.P, I = acc.I, tri = (a, b, c, k) => {
                  const ax = Pp[3 * a] + k * dP[3 * a], ay = Pp[3 * a + 1] + k * dP[3 * a + 1], az = Pp[3 * a + 2] + k * dP[3 * a + 2];
                  const ux = Pp[3 * b] + k * dP[3 * b] - ax, uy = Pp[3 * b + 1] + k * dP[3 * b + 1] - ay, uz = Pp[3 * b + 2] + k * dP[3 * b + 2] - az;
                  const wx = Pp[3 * c] + k * dP[3 * c] - ax, wy = Pp[3 * c + 1] + k * dP[3 * c + 1] - ay, wz = Pp[3 * c + 2] + k * dP[3 * c + 2] - az;
                  return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
                };
                for (let v = hd.v0; v < hd.v1; v++) { const l = hypot(dP[3 * v], dP[3 * v + 1], dP[3 * v + 2]); if (l > 0.035) for (let q = 0; q < 3; q++) { dP[3 * v + q] *= 0.035 / l; } }
                for (let pass = 0; pass < 6; pass++) {
                  let bad = 0;
                  for (let t = hd.t0; t < hd.t1; t += 3) {
                    const a = I[t], b = I[t + 1], c = I[t + 2], n0 = tri(a, b, c, 0), n1 = tri(a, b, c, 1);
                    const l0 = hypot(...n0), l1 = hypot(...n1);
                    if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0.2 * l0 * l1) { bad++; for (const w of [a, b, c]) for (let q = 0; q < 3; q++) { dP[3 * w + q] *= 0.5; dN[3 * w + q] *= 0.5; } }
                  }
                  if (!bad) break;
                }
              }
              const A = new Acc(); buildFace(A, E, FE);
              if (A.n !== fc1 - fc0) throw new Error('face topology changed for ' + name + ': ' + A.n + ' vs ' + (fc1 - fc0));
              for (let i = 0; i < A.n; i++) {
                const v = fc0 + i;
                for (let q = 0; q < 3; q++) { dP[3 * v + q] = A.P[3 * i + q] - acc.P[3 * v + q]; dN[3 * v + q] = A.N[3 * i + q] - acc.N[3 * v + q]; }
              }
              geo.morphAttributes.position.push(new THREE.Float32BufferAttribute(dP, 3));
              geo.morphAttributes.normal.push(new THREE.Float32BufferAttribute(dN, 3));
              names.push(name);
            }
            geo.morphTargetsRelative = true;
          }
          stats.morphMs = Math.round(now() - t);
          geo.computeBoundingSphere();

          /* ---- skeleton */
          const tailAt = (u) => { const p = curve.getPoint(u); return [p.x, p.y, p.z]; };
          const chainAt = isDoge ? [[0.14, 0.45, -0.15], [0.19, 0.44, -0.3], [0.245, 0.47, -0.46]] : [[0, 0.73, -0.29], [0, 0.71, -0.37], [0, 0.69, -0.46]];
          const earB = S.ear.b;
          const REST = {
            root: [0, 0, 0], body: [0, 0, 0], head: S.neck, earL: earB, earR: [-earB[0], earB[1], earB[2]],
            lidL: EYE.L.c, lidR: EYE.R.c, lowL: EYE.L.c, lowR: EYE.R.c, arcL: EYE.L.c, arcR: EYE.R.c, sqL: EYE.L.c, sqR: EYE.R.c,
            tail0: tailAt(0), tail1: tailAt(1 / 3), tail2: tailAt(2 / 3), chain0: chainAt[0], chain1: chainAt[1], chain2: chainAt[2],
          };
          const bones = {}, list = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; return b; });
          const LOCALQ = { lidL: eyeQ(1), lidR: eyeQ(-1), lowL: eyeQ(1), lowR: eyeQ(-1), arcL: eyeQ(1), arcR: eyeQ(-1), sqL: eyeQ(1), sqR: eyeQ(-1) };
          const worldQ = {};
          BONES.forEach((n) => {
            const p = PARENT[n]; if (!p) { worldQ[n] = new THREE.Quaternion(); return; }
            const w = REST[n], pw = REST[p], pq = worldQ[p];
            bones[n].position.copy(V(v3.sub(w, pw)).applyQuaternion(pq.clone().invert()));
            if (LOCALQ[n]) bones[n].quaternion.copy(pq.clone().invert().multiply(LOCALQ[n]));
            worldQ[n] = pq.clone().multiply(bones[n].quaternion);
            bones[p].add(bones[n]);
          });
          const mesh = new THREE.SkinnedMesh(geo, toon); mesh.name = S.name + '-skin';
          const group = new THREE.Group(); group.name = S.name + '-' + detail;
          group.add(bones.root); group.add(mesh);
          group.updateMatrixWorld(true);
          mesh.bind(new THREE.Skeleton(list));
          mesh.frustumCulled = false;
          if (names.length) { mesh.morphTargetDictionary = {}; names.forEach((k, i) => { mesh.morphTargetDictionary[k] = i; }); mesh.morphTargetInfluences = names.map(() => 0); }

          /* ---- eyeballs: one mesh on the head bone */
          const eyeG = new THREE.SphereGeometry(eyeR, LV.eye[0], LV.eye[1], 0, PI * 2, 0, PI * 0.6).rotateX(PI / 2);
          const EP = [], EN = [], EA = [], EI = [];
          const headInv = new THREE.Matrix4().compose(V(S.neck), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)).invert();
          for (const side of [1, -1]) {
            const E = side > 0 ? EYE.L : EYE.R;
            const m = M4().compose(V(E.c), eyeQ(side), new THREE.Vector3(1, 1, 1)).premultiply(headInv), nm = new THREE.Matrix3().getNormalMatrix(m);
            const p = eyeG.attributes.position, nr = eyeG.attributes.normal, b = EP.length / 3, v = new THREE.Vector3(), n = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
              v.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
              EA.push(n.x, n.y, n.z, side);
              v.applyMatrix4(m); n.applyMatrix3(nm).normalize();
              EP.push(v.x, v.y, v.z); EN.push(n.x, n.y, n.z);
            }
            for (let i = 0; i < eyeG.index.count; i++) EI.push(b + eyeG.index.getX(i));
          }
          const eg = new THREE.BufferGeometry();
          eg.setAttribute('position', new THREE.Float32BufferAttribute(EP, 3)); eg.setAttribute('normal', new THREE.Float32BufferAttribute(EN, 3));
          eg.setAttribute('aEye', new THREE.Float32BufferAttribute(EA, 4)); eg.setIndex(EI);
          const eyeMat = opts.eyeMat || eyeMaterial(THREE);
          const eyes = new THREE.Mesh(eg, eyeMat); eyes.name = S.name + '-eyes';
          bones.head.add(eyes);

          stats.parts.eyes = EI.length / 3;
          stats.tris = acc.I.length / 3 + EI.length / 3; stats.verts = nv; stats.ms = Math.round(now() - T0);
          stats.headShare = headShare(F, S);
          const api = rig(THREE, { S, bones, mesh, eyes, eyeMat, stats, names, EXT, toon, level: detail });
          group.userData.racer = group.userData.dog = api;
          group.userData.stats = stats;
          return group;
        }

        // head share of the seated height (chin to crown over seat to crown; ears excluded)
        function headShare(F, S) {
          const top = rayHit(F.headCore, [0, 1.3, S.cran[2]], [0, -1, 0], 0, 0.8, 96)[1];
          let chin = 1; for (let z = 0.0; z < 0.3; z += 0.01) { const p = rayHit(F.headCore, [0, 0.2, z], [0, 1, 0], 0, 0.6, 96); if (p) chin = min(chin, p[1]); }
          for (let x = 0; x < 0.3; x += 0.01) { const p = rayHit(F.headCore, [x, 0.2, 0.03], [0, 1, 0], 0, 0.6, 96); if (p) chin = min(chin, p[1]); }
          return { top: +top.toFixed(3), chin: +chin.toFixed(3), share: +((top - chin) / top).toFixed(3) };
        }

        /* ------------------------------------------------------------------ far LOD: snapped low-poly parts, the face painted
         * (Pepe FINAL's method): the head is a sphere whose vertices are moved along their rays onto the head SDF, so the
         * silhouette and the head size match the near LODs exactly; the cap, scarf, band, eyes and nose survive. */
        function buildFar(THREE, S, F, C, toon, T0, now) {
          const acc = new Acc(), M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const isDoge = S.name === 'doge', g = [0, 0, 0];
          const snap = (f, c, ws, hs, rmax, col, k, sc) => {
            const s = new THREE.SphereGeometry(1, ws, hs), p = s.attributes.position, n = s.attributes.normal;
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i) * (sc ? sc[0] : 1), p.getY(i) * (sc ? sc[1] : 1), p.getZ(i) * (sc ? sc[2] : 1)]);
              let lo = 0, hi = rmax;
              for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (f(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c, d, (lo + hi) / 2); p.setXYZ(i, q[0], q[1], q[2]);
              grad(f, q[0], q[1], q[2], 0.004, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            addGeo(THREE, acc, s, M4(), col, k, 0);
          };
          const kF = [0.6, 1, 0, 1], kP = [0.45, 0, 0, 1];
          const mask = (x, y, z) => {
            const ax = abs(x);
            if (isDoge) return sstep(0.01, -0.03, y - (0.676 - 0.22 * max(0, ax - 0.07))) * sstep(-0.14, 0.0, z) + sstep(0.57, 0.5, y) * sstep(-0.08, 0.02, z);
            return max(sstep(0.0, -0.04, y - (0.664 - 0.35 * (ax - 0.08))) * sstep(-0.06, 0.04, z), sstep(0.56, 0.5, y));
          };
          snap(F.headCore, [0, 0.68, 0.04], 11, 7, 0.5, (x, y, z) => mix3(C.base, C.mask, sat(mask(x, y, z))), kF);
          // ears: 4-sided cones on the ear axis
          for (const side of [1, -1]) {
            const b = [side * S.ear.b[0], S.ear.b[1] - 0.02, S.ear.b[2]], tp = [side * S.ear.t[0], S.ear.t[1], S.ear.t[2]], d = v3.sub(tp, b), L = hypot(...d);
            const cone = new THREE.ConeGeometry(S.ear.rb * 0.95, L, 4, 1, true).translate(0, L / 2, 0);
            addGeo(THREE, acc, cone, M4().compose(V(b), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PI / 4, 0))), V([1, 1, 0.55])), (x, y, z, nx, ny, nz) => (nz > 0.3 ? C.inner : C.base), kF, 0);
          }
          snap(F.torsoF, [0, 0.25, -0.02], 8, 6, 0.4, (x, y, z) => (z > 0.05 && abs(x) < 0.14 ? C.mask : C.base), kF);
          const cyl = (A, B, ra, rb, col, seg) => {
            const d = v3.sub(B, A), L = hypot(...d), c = new THREE.CylinderGeometry(rb, ra, L, seg || 5, 1, true);
            addGeo(THREE, acc, c, M4().compose(V(v3.add(A, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), V([1, 1, 1])), col, kF, 0);
          };
          for (const s of [1, -1]) {
            const X = (p) => [s * p[0], p[1], p[2]];
            cyl(X(S.S), X(S.El), 0.07, 0.062, C.base); cyl(X(S.El), X(F.Wr), 0.062, 0.056, C.base);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.06, 5, 3), M4().makeTranslation(...X(F.pawC)), C.mask, kF, 0);
            cyl(X(S.Hp), X(S.K), 0.088, 0.072, C.base); cyl(X(S.K), X(S.F), 0.068, 0.058, C.base);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.064, 5, 3), M4().compose(V(X([S.F[0], S.F[1], S.F[2] + 0.035])), new THREE.Quaternion(), V([1, 0.8, 1.35])), C.mask, kF, 0);
          }
          // the face, painted big enough to read at 45 m+: nose, eyes (Doge's side-glance white + pupil; Shiba's arcs as dark bars)
          const fz = (x, y) => faceAt(F.headCore, x, y, 0.004);
          addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 3), M4().compose(V(fz(0, S.nose.y)), new THREE.Quaternion(), V([0.055, 0.04, 0.035])), C.nose, kP, 0);
          for (const side of [1, -1]) {
            const p = fz(side * S.eye.x, S.eye.y);
            if (isDoge) {
              addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 3), M4().compose(V(p), new THREE.Quaternion(), V([0.05, 0.042, 0.022])), C.white, kP, 0);
              addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 2), M4().compose(V(v3.add(p, [0.02, 0.004, 0.014])), new THREE.Quaternion(), V([0.026, 0.028, 0.014])), C.nose, kP, 0);
            } else addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 2), M4().compose(V(v3.add(p, [0, 0.006, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)), V([0.045, 0.014, 0.014])), C.lidLine, kP, 0);
          }
          if (!isDoge) addGeo(THREE, acc, new THREE.SphereGeometry(1, 6, 3), M4().compose(V(fz(0, MOUTH.cy - 0.005)), new THREE.Quaternion(), V([0.075, 0.04, 0.02])), C.mouth, kP, 0);
          // tail: a short tube
          const TL = S.tail, tp = new THREE.CatmullRomCurve3(TL.pts.map((p) => V(p))).getPoints(5).map((p) => [p.x, p.y, p.z]);
          addGeo(THREE, acc, taperTube(THREE, tp, tp.map(() => TL.r0 * 0.9), tp.map(() => TL.r0 * 0.9), 4, [1, 0, 0], true), M4(), C.base, kF, 0);
          if (isDoge) {
            // the cap survives every level: a snapped dome + the goggles as two brass discs, and the scarf
            const cr = S.cran, capF = (x, y, z) => smax(ell(x - cr[0], y - cr[1], z - cr[2], cr[3] + 0.021, cr[4] + 0.021, cr[5] + 0.021), (0.765 + 0.5 * z) - y, 0.006);
            const s = new THREE.SphereGeometry(1, 10, 4, 0, PI * 2, 0, PI * 0.56), p = s.attributes.position, n = s.attributes.normal, gr = 0.021;
            for (let i = 0; i < p.count; i++) {
              let x = cr[0] + p.getX(i) * (cr[3] + gr), y = cr[1] + p.getY(i) * (cr[4] + gr), z = cr[2] + p.getZ(i) * (cr[5] + gr);
              y = max(y, 0.765 + 0.5 * z); p.setXYZ(i, x, y, z);
              const nn = v3.norm([p.getX(i) / (cr[3] * cr[3]) * 0 + (x - cr[0]) / (cr[3] * cr[3]), (y - cr[1]) / (cr[4] * cr[4]), (z - cr[2]) / (cr[5] * cr[5])]); n.setXYZ(i, nn[0], nn[1], nn[2]);
            }
            addGeo(THREE, acc, s, M4(), C.leather, [0.42, 0.3, 0, 1], 0);
            for (const side of [1, -1]) addGeo(THREE, acc, new THREE.CylinderGeometry(0.036, 0.036, 0.016, 6).rotateX(PI / 2), M4().compose(V(faceAt(capF, side * 0.05, 0.905, 0.006)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)), V([1, 1, 1])), C.brass, [0.22, 0, 0, 1], 0);
            addGeo(THREE, acc, new THREE.TorusGeometry(0.172, 0.05, 3, 8).rotateX(PI / 2), M4().makeTranslation(0, 0.465, -0.03), C.scarf, kF, 0);
            addGeo(THREE, acc, taperTube(THREE, [[0.14, 0.46, -0.12], [0.22, 0.45, -0.34], [0.27, 0.47, -0.6]], [0.011, 0.011, 0.011], [0.05, 0.058, 0.066], 3, [1, 0, 0], true), M4(), C.scarf, kF, 0);
          } else {
            const cr = S.cran, c0 = [0, 0.795 + 0.2 * cr[2], cr[2]], e2b = v3.norm([0, 0.2, 1]), loop = [];
            for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2, d = v3.add(v3.scale([1, 0, 0], sin(a)), e2b, cos(a)); loop.push(v3.add(rayHit(F.headCore, c0, d, 0, 0.5) || c0, d, 0.006)); }
            addGeo(THREE, acc, taperTube(THREE, loop, loop.map(() => 0.014), loop.map(() => 0.03), 3, v3.norm([0, 1, -0.2]), false, true), M4(), C.band, [0.62, 0.4, 0, 1], 0);
            const pk = [0, 0.74, -0.28];
            for (const side of [1, -1]) addGeo(THREE, acc, taperTube(THREE, [pk, v3.add(pk, [side * 0.06, -0.05, -0.14]), v3.add(pk, [side * 0.08, -0.05, -0.29])], [0.006, 0.006, 0.006], [0.024, 0.028, 0.032], 3, [1, 0, 0], true), M4(), C.band, [0.62, 0.4, 0, 1], 0);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          geo.setIndex(new THREE.Uint16BufferAttribute(acc.I, 1));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, toon); mesh.name = S.name + '-far';
          const group = new THREE.Group(); group.name = S.name + '-far'; group.add(mesh);
          // the far mesh keeps the head roll (Doge's 12 deg tilt) as a whole-body lean is wrong; tilt the head region instead
          if (S.roll) {
            const pa = geo.attributes.position, na = geo.attributes.normal, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.04, 0, S.roll)), vv = new THREE.Vector3(), nn = new THREE.Vector3(), nk = V(S.neck);
            for (let i = 0; i < pa.count; i++) {
              vv.fromBufferAttribute(pa, i); if (vv.y < 0.5) continue;
              vv.sub(nk).applyQuaternion(q).add(nk); pa.setXYZ(i, vv.x, vv.y, vv.z); nn.fromBufferAttribute(na, i).applyQuaternion(q); na.setXYZ(i, nn.x, nn.y, nn.z);
            }
          }
          const stats = { tris: acc.I.length / 3, verts: acc.n, ms: Math.round(now() - T0), parts: { far: acc.I.length / 3 } };
          const sq = { k: 1, v: 0 };
          const api = {
            level: 'far', mesh, stats, names: [], bones: null,
            set() { return api; }, setExpression() { return api; }, setGaze() { return api; }, look() { return api; }, blink() { return api; }, steer() { return api; },
            squash(k) { sq.k = k; mesh.scale.set(1 / sqrt(k), k, 1 / sqrt(k)); return api; }, kick(v) { sq.v += v; },
            update(dt) { const a = -220 * (sq.k - 1) - 14 * sq.v; sq.v += a * dt; sq.k += sq.v * dt; mesh.scale.set(1 / sqrt(sq.k), sq.k, 1 / sqrt(sq.k)); },
          };
          group.userData.racer = group.userData.dog = api;
          group.userData.stats = stats;
          return group;
        }

        /* ------------------------------------------------------------------ the live layer (Pepe FINAL's API) */
        function rig(THREE, o) {
          const { S, bones: B, eyeMat, stats, names, EXT } = o;
          const U = eyeMat.userData.uniforms;
          const rest = {}; for (const k in B) rest[k] = B[k].quaternion.clone();
          const isDoge = S.name === 'doge';
          U.uIrisC.value.set(isDoge ? '#3A2414' : '#2A160C');
          const N0 = EXT.neutral, NAMES = names.length ? names : EX_NAMES[S.name];
          const st = { w: {}, target: null, gaze: null, look: [0, 0], blink: 0, autoBlink: true, nextBlink: 2 + Math.random() * 3, blinkT: -1, sq: 1, sqV: 0, steer: 0 };
          NAMES.forEach((n) => { st.w[n] = 0; });
          const springs = ['tail0', 'tail1', 'tail2', 'chain0', 'chain1', 'chain2', 'earL', 'earR'].map((n) => ({ n, a: 0, v: 0, b: 0, bv: 0 }));
          const qx = new THREE.Quaternion(), e = new THREE.Euler();
          const blend = (key) => { let v = N0[key]; for (const k of NAMES) v += st.w[k] * (EXT[k][key] - N0[key]); return v; };
          function apply() {
            let gx = N0.gaze[0], gy = N0.gaze[1];
            for (const k of NAMES) { gx += st.w[k] * (EXT[k].gaze[0] - N0.gaze[0]); gy += st.w[k] * (EXT[k].gaze[1] - N0.gaze[1]); }
            if (st.gaze) { gx = st.gaze[0]; gy = st.gaze[1]; }
            gx += st.look[0]; gy += st.look[1];
            U.uGazeL.value.set(gx, gy, 1).normalize(); U.uGazeR.value.set(gx, gy, 1).normalize();
            U.uPupil.value = blend('pupil'); U.uIris.value = blend('iris'); U.uSpark.value = blend('spark');
            const happy = blend('happy'), squeeze = blend('squeeze'), shut = max(happy, squeeze);
            let lu = blend('lidU'), ll = blend('lidLo');
            lu = lerp(lu, -1.5, max(sstep(0.3, 0.7, shut), st.blink)); ll = lerp(ll, -0.62, sstep(0.3, 0.7, shut));
            U.uLid.value = lu;
            for (const s of ['L', 'R']) {
              B['lid' + s].quaternion.copy(rest['lid' + s]).multiply(qx.setFromEuler(e.set(-lu, 0, 0)));
              B['low' + s].quaternion.copy(rest['low' + s]).multiply(qx.setFromEuler(e.set(-ll, 0, 0)));
              B['arc' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, happy) * (1 - sstep(0.3, 0.7, squeeze))));
              B['sq' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, squeeze)));
            }
            if (o.mesh.morphTargetInfluences) NAMES.forEach((n, i) => { o.mesh.morphTargetInfluences[i] = st.w[n] || 0; });
            B.head.quaternion.copy(rest.head).multiply(qx.setFromEuler(e.set(0.04, st.steer * 0.25, blend('roll') - st.steer * 0.05)));
            B.body.rotation.set(0, 0, -st.steer * 0.05);
            B.root.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
            const ear = blend('ear');
            for (const s of springs) if (s.n[0] === 'e') {
              const side = s.n === 'earL' ? 1 : -1;
              B[s.n].quaternion.copy(rest[s.n]).multiply(qx.setFromEuler(e.set(s.a + ear * 0.6, s.b, -side * min(0, ear) * 0.5)));
            }
          }
          const api = {
            level: o.level, bones: B, mesh: o.mesh, names: NAMES, EXPR: EXT, stats,
            set(weights) { for (const k of NAMES) st.w[k] = weights && weights[k] ? weights[k] : 0; st.target = null; apply(); return api; },
            setExpression(name, instant) { st.target = name; if (instant) { for (const k of NAMES) st.w[k] = k === name ? 1 : 0; apply(); } return api; },
            setGaze(x, y) { st.gaze = x === null || x === undefined ? null : [x, y || 0]; apply(); return api; },
            look(x, y) { st.look[0] = x; st.look[1] = y; apply(); return api; },
            blink(v) { st.blink = v || 0; st.autoBlink = v === undefined; apply(); return api; },
            squash(k) { st.sq = k; apply(); return api; },
            kick(v) { st.sqV += v; },
            steer(v) { st.steer = v; apply(); return api; },
            // auto blinks every 2-5 s, eased expressions, squash spring (stiffness 220, damping 14), tail/scarf/band/ear springs
            update(dt, inp) {
              inp = inp || {};
              if (st.target !== null) { const k = 1 - exp(-dt * 12); for (const n of NAMES) st.w[n] += ((n === st.target ? 1 : 0) - st.w[n]) * k; }
              if (st.autoBlink && blend('happy') < 0.5 && blend('squeeze') < 0.5) {
                st.nextBlink -= dt;
                if (st.nextBlink <= 0 && st.blinkT < 0) { st.blinkT = 0; st.nextBlink = 2 + Math.random() * 3; }
                if (st.blinkT >= 0) { st.blinkT += dt; const u = st.blinkT / 0.16; st.blink = u < 0.4 ? u / 0.4 : max(0, 1 - (u - 0.4) / 0.6); if (u >= 1) { st.blinkT = -1; st.blink = 0; } }
              }
              const a = -220 * (st.sq - 1) - 14 * st.sqV; st.sqV += a * dt; st.sq += st.sqV * dt;
              const acc = inp.accel || 0, turn = inp.steer || 0;
              for (const s of springs) {
                const isEar = s.n[0] === 'e', k = isEar ? 260 : 120, d = isEar ? 14 : 9;
                const ta = (isEar ? -0.08 : 0.25) * acc, tb = (isEar ? 0.1 : -0.3) * turn;
                s.v += (k * (ta - s.a) - d * s.v) * dt; s.a += s.v * dt;
                s.bv += (k * (tb - s.b) - d * s.bv) * dt; s.b += s.bv * dt;
                if (!isEar) B[s.n].quaternion.copy(rest[s.n]).multiply(qx.setFromEuler(e.set(s.a, s.b, 0)));
              }
              apply();
            },
          };
          apply();
          return api;
        }

        const api = {
          doge: (THREE, K, detail, opts) => build(DOGE, THREE, K, detail, opts),
          shiba: (THREE, K, detail, opts) => build(SHIBA, THREE, K, detail, opts),
          toonMaterial, eyeMaterial, WHEEL, DOGE, SHIBA, LEVELS, EXPR: { doge: DOGE_EX, shiba: SHIBA_EX }, NAMES: EX_NAMES,
          util: { sat, clamp, lerp, sstep, smin, smax, ell, E6, cap, v3, mix3, mul3, grad, Acc, mcPart, addGeo, taperTube, rayHit, onSurface, compactTail, faceAt, gridDecal, WH },
        };
        root.DogFinal = api;
      })(KR);

      /* The kart kit: ONE builder for seven of the eight karts (all but Pepe's Swamp Skimmer, which is his own, and Bike
       * Tyson, whose body is the bike). Each kart hands it a design (body SDF, two-tone seam, palette, wheel layout,
       * details); the kit does the rest the same way for all: a marching-cubes body (the guarded projection), the waist strip,
       * the cockpit coaming, the seat, a steering wheel at the driver's hands, rounded tyres on hubs, and a snapped
       * low-poly FAR body that keeps the wheels attached. Units metres, +Z forward, origin on the ground between the axles.
       *
       *   DogKartKit.make(design, THREE, K, detail, opts) -> THREE.Group      detail 'desktop' | 'phone' | 'mid' | 'far'
       *   userData.kart = { seat, animate(dt, { speed, steer }), tris, ms, parts, wheels, steering, glass, extra(s) }
       *
       * The designs' own hooks, every one optional (a design that names none builds the dogs' karts exactly):
       *   hubK (the hub's finish), cock (a box { c, h, r }, or an SDF of the cockpit), seat, wheel (where the hands are),
       *   seatW, seatH, seatBack: false, coaming: false, farF, farC, farSeg, farSquash, paint(c, ...) (a last word on a
       *   body colour), paintAO, insideEdge, bodyScale (a number, or one a detail) and bodyScaleLo, wheelSeg (a number, or
       *   [segments, steps], one a detail), chunky (dual rear tyres, tread lugs, lug nuts: Big Bear's Sell-Off), tread (lugs
       *   a detail, or a function that adds its own), tyreK, capsNearOnly, customBody, customFar, glass(ctx) (one
       *   transparent mesh), extra(ctx, group, toMesh) or ctx.extra (meshes that move), animate(dt, o, extra).
       */
      (function (root) {
        'use strict';
        const { abs, min, max, hypot, sin, cos, PI } = Math;
        const LEVELS = {
          desktop: { body: 0.043, wheel: [20, 3], tube: 6, loop: 52, steer: [6, 30], detail: true, box: 3, petal: [8, 4] },
          phone:   { body: 0.064, wheel: [14, 2], tube: 5, loop: 32, steer: [5, 20], detail: true, box: 2, petal: [6, 3] },
          mid:     { body: 0.15, wheel: [8, 1], tube: 4, loop: 0, steer: [3, 6], detail: false, box: 1, petal: [0, 0] },
          far:     { far: true, wheel: [12, 1] },
        };
        const KSEAT = [0, 0.27, -0.14];
        const rbox = (x, y, z, c, h, r) => {
          const qx = abs(x - c[0]) - h[0] + r, qy = abs(y - c[1]) - h[1] + r, qz = abs(z - c[2]) - h[2] + r;
          return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, max(qy, qz)), 0) - r;
        };
        const cylX = (x, y, z, c, r, hw) => max(hypot(y - c[1], z - c[2]) - r, abs(x - c[0]) - hw);
        const KCOCK = { c: [0, 0.5, -0.1], h: [0.25, 0.22, 0.36], r: 0.1 };

        function make(design, THREE, KIT, detail, opts) {
          opts = opts || {};
          const D = root.DogFinal, U = D.util, { sstep, mix3, mul3, v3 } = U;
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop;
          // (a cockpit given as an SDF is the Bubble Sub's glass tub; as a box, the Sell-Off's bigger cab)
          const sdfCock = typeof design.cock === 'function', COCK = (!sdfCock && design.cock) || KCOCK, SEAT = design.seat || KSEAT;
          const toon = opts.toon || D.toonMaterial(THREE, opts);
          const col = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
          const C = {}; for (const k in design.palette) C[k] = col(design.palette[k]);
          const K = { paint: [design.gloss, 0, 0, design.paintAO || 1], rubber: [0.88, 0, 0, 1], chrome: [0.14, 0, 0, 1], seat: [0.6, 0.2, 0, 1], glow: [0.3, 0, 2, 1], matte: [0.7, 0, 0, 1] };
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const Q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
          const parts = {};
          const body = new U.Acc();
          let mark = 0;
          const done = (name) => { parts[name] = (parts[name] || 0) + (body.I.length - mark) / 3; mark = body.I.length; };
          const WHEELS = design.wheels;
          const inCock = sdfCock ? design.cock : ((x, y, z) => rbox(x, y, z, COCK.c, COCK.h, COCK.r));
          const outerF = design.bodyF;                                   // without the cockpit
          const bodyF = (x, y, z) => U.smax(outerF(x, y, z), -inCock(x, y, z), 0.03);
          const paintCol = (x, y, z, nx, ny, nz) => {
            const IE = (LV.detail && design.insideEdge) || [0.025, -0.02], inside = sdfCock && LV.far ? 0 : sstep(IE[0], IE[1], inCock(x, y, z));
            const lowW = sstep(0.006, -0.006, y - design.seamY(x, z));
            let c = mix3(mix3(C.top, C.topDk, sstep(0.2, -0.8, ny) * 0.45), mix3(C.low, C.lowDk, sstep(0.2, -0.8, ny) * 0.5), lowW);
            c = mix3(c, C.inside, inside);
            if (design.paint) c = design.paint(c, x, y, z, nx, ny, nz, C, U);
            return mul3(c, 0.88 + 0.12 * max(0, ny));
          };
          const ctx = { THREE, U, C, K, LV, body, M4, V, Q, done, bodyF, outerF, rbox, cylX, SEAT, onBody: null, extra: [], detail, KIT, design };
          ctx.onBody = (p, off) => {
            let [x, y, z] = p; const g = [0, 0, 0];
            for (let i = 0; i < 6; i++) { const d = bodyF(x, y, z); U.grad(bodyF, x, y, z, 0.003, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; }
            U.grad(bodyF, x, y, z, 0.003, g);
            return { p: [x + g[0] * off, y + g[1] * off, z + g[2] * off], n: g.slice() };
          };
          const bodyScale = typeof design.bodyScale === 'object' ? (design.bodyScale[detail] || 1) : ((LV.detail ? design.bodyScale : design.bodyScaleLo) || 1);

          if (LV.far && design.customFar) {
            design.customFar(ctx); done('body');
          } else if (LV.far) {
            /* ---- far: the body as a snapped sphere (no cockpit), wheels kept touching it */
            const FS = design.farSeg || [12, 7], s = new THREE.SphereGeometry(1, FS[0], FS[1]), p = s.attributes.position, n = s.attributes.normal, c0 = design.farC || [0, 0.3, 0], g = [0, 0, 0], farF = design.farF || outerF;
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i), p.getY(i) * (design.farSquash || 1), p.getZ(i)]);
              let lo = 0, hi = 1.4; for (let it = 0; it < 24; it++) { const m = (lo + hi) / 2; if (farF(c0[0] + d[0] * m, c0[1] + d[1] * m, c0[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c0, d, lo); p.setXYZ(i, q[0], q[1], q[2]); U.grad(farF, q[0], q[1], q[2], 0.01, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            U.addGeo(THREE, body, s, M4(), (x, y, z, nx, ny, nz) => paintCol(x, y, z, nx, ny, nz), K.paint, 0);
            // a dark cockpit patch + the seat back, so the driver sits IN something
            if (design.seatBack !== false) U.addGeo(THREE, body, new THREE.BoxGeometry(0.42, 0.3, 0.07), M4().compose(V([0, SEAT[1] + 0.12, SEAT[2] - 0.25]), Q(-0.22, 0, 0), V([1, 1, 1])), C.seat, K.seat, 0);
            // axles: the wheels stay visibly attached at every distance
            for (const front of [true, false]) {
              const ws = WHEELS.filter((w) => (w[1] > 0) === front), wx = abs(ws[0][0]), R = ws[0][2], wz = ws[0][1];
              U.addGeo(THREE, body, new THREE.BoxGeometry(2 * wx, 0.05, 0.05), M4().makeTranslation(0, R, wz), C.chromeDk, K.chrome, 0);
            }
            if (design.far) design.far(ctx);
            done('body');
          } else {
            if (design.customBody) design.customBody(ctx);
            else U.mcPart(KIT, body, bodyF, design.box, LV.body * bodyScale, true, paintCol, null, K.paint, 0);
            done('body');
            /* ---- the waist strip along the two-tone seam: hides the vertex-colour edge */
            if (LV.loop && design.strip) {
              const pts = [], ns = [];
              for (let i = 0; i < LV.loop; i++) {
                const a = (i / LV.loop) * PI * 2, dir = [sin(a), 0, cos(a)];
                let t = 1.4, y = design.seamY(0, 0.8 * cos(a));
                while (t > 0 && outerF(dir[0] * t, y, dir[2] * t) > 0) t -= 0.004;
                y = design.seamY(dir[0] * t, dir[2] * t);
                const q = ctx.onBody([dir[0] * t, y, dir[2] * t], 0.002);
                q.p[1] = y; pts.push(q.p); ns.push(q.n);
              }
              U.addGeo(THREE, body, U.taperTube(THREE, pts, pts.map(() => design.strip[0]), pts.map(() => design.strip[1]), LV.tube, (i) => ns[i], false, true), M4(), C.chrome, K.chrome, 0);
              done('strip');
            }
            /* ---- cockpit coaming roll */
            if (LV.loop && design.coaming !== false) {
              const pts = [], n = LV.loop >> 1, hx = COCK.h[0] - 0.01, z0 = COCK.c[2] - COCK.h[2] + 0.02, z1 = COCK.c[2] + COCK.h[2] - 0.02;
              for (let i = 0; i < n; i++) {
                const a = (i / n) * PI * 2, ca = cos(a), sa = sin(a);
                const x = hx * Math.sign(sa) * abs(sa) ** 0.3, z = (z0 + z1) / 2 + (z1 - z0) / 2 * Math.sign(ca) * abs(ca) ** 0.3;
                let y = 0.62; while (y > 0.1 && bodyF(x * 1.08, y, z + (z > 0 ? 0.02 : -0.02)) > 0) y -= 0.004;
                pts.push([x, y + 0.012, z]);
              }
              U.addGeo(THREE, body, U.taperTube(THREE, pts, pts.map(() => 0.026), pts.map(() => 0.02), LV.tube, [0, 1, 0], false, true), M4(), C.coaming, design.coamingK === 'chrome' ? K.chrome : K.seat, 0);
              done('coaming');
            }
            /* ---- seat */
            const rboxG = ctx.rboxG = (w, h, d, r, sg) => {
              const bs = sg ? min(sg, LV.box) : LV.box, g = new THREE.BoxGeometry(w, h, d, bs, bs, bs), p = g.attributes.position;
              for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i), z = p.getZ(i), hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
                const cx = max(-hx, min(hx, x)), cy = max(-hy, min(hy, y)), cz = max(-hz, min(hz, z));
                const nn = v3.norm([x - cx, y - cy, z - cz]);
                p.setXYZ(i, cx + nn[0] * r, cy + nn[1] * r, cz + nn[2] * r);
              }
              g.computeVertexNormals(); return g;
            };
            U.addGeo(THREE, body, rboxG(design.seatW || 0.46, 0.07, 0.42, 0.03), M4().makeTranslation(0, SEAT[1] - 0.035, SEAT[2] + 0.02), (x, y) => mix3(C.seat, C.seatHi, sstep(0, 0.03, y)), K.seat, 0);
            if (design.seatBack !== false) U.addGeo(THREE, body, rboxG((design.seatW || 0.46) + 0.02, design.seatH || 0.3, 0.07, 0.033), M4().compose(V([0, SEAT[1] + 0.1, SEAT[2] - 0.25]), Q(-0.22, 0, 0), V([1, 1, 1])), (x, y, z) => mix3(C.seat, C.seatHi, sstep(-0.02, 0.03, z) * 0.6), K.seat, 0);
            done('seat');
            design.details(ctx);
          }

          /* ---- steering wheel (its own mesh so it turns): rim, three spokes, hub; column into the dash */
          const W = design.wheel || D.WHEEL, wc = v3.add(SEAT, W.c);
          const steerAcc = new U.Acc();
          if (LV.steer) {
            U.addGeo(THREE, steerAcc, new THREE.TorusGeometry(W.r, 0.017, LV.steer[0], LV.steer[1]), M4(), C.rim, K.seat, 0);
            for (const a of [PI / 2 + PI, PI / 6, PI - PI / 6]) U.addGeo(THREE, steerAcc, new THREE.CylinderGeometry(0.009, 0.009, W.r, 5).translate(0, W.r / 2, 0), M4().compose(V([0, 0, 0.004]), Q(0, 0, a - PI / 2), V([1, 1, 1])), C.chromeDk, K.chrome, 0);
            U.addGeo(THREE, steerAcc, new THREE.CylinderGeometry(0.034, 0.04, 0.03, 14).rotateX(PI / 2), M4(), C.hubS, K.paint, 0);
            U.addGeo(THREE, body, U.taperTube(THREE, [wc, v3.add(wc, v3.norm([0, -0.5, 0.9]), 0.25)], [0.014, 0.016], [0.014, 0.016], 6, [1, 0, 0], false), M4(), C.chromeDk, K.chrome, 0);
            done('column');
          }
          parts.steering = steerAcc.I.length / 3;

          const toMesh = (acc, name) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3)); g.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
            g.setIndex(acc.n > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));
            g.computeBoundingSphere();
            const m = new THREE.Mesh(g, toon); m.name = name; return m;
          };
          const group = new THREE.Group(); group.name = design.name + '-' + detail;
          group.add(toMesh(body, 'kart-body'));
          // one transparent mesh (RGBA vertex colours) for glass and water, drawn after the opaque racer (the Bubble Sub)
          let glassMesh = null;
          if (design.glass) {
            const ga = design.glass(ctx);
            if (ga && ga.I.length) {
              const g = new THREE.BufferGeometry();
              g.setAttribute('position', new THREE.Float32BufferAttribute(ga.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(ga.N, 3));
              g.setAttribute('color', new THREE.Float32BufferAttribute(ga.C, 4)); g.setIndex(ga.I); g.computeBoundingSphere();
              glassMesh = new THREE.Mesh(g, opts.glassMat || design.glassMat(THREE)); glassMesh.name = 'kart-glass'; glassMesh.renderOrder = 2;
              group.add(glassMesh); parts.glass = ga.I.length / 3;
            }
          }
          const extra = design.extra ? design.extra(ctx, group, toMesh) : null;
          const steer = new THREE.Group(); steer.position.set(...wc); steer.quaternion.setFromEuler(new THREE.Euler(W.tilt, 0, 0));
          const steerSpin = toMesh(steerAcc, 'kart-steering'); steer.add(steerSpin); group.add(steer);
          if (!LV.steer) steer.visible = false;

          /* ---- wheels: rounded tyre (lathe) with an optional whitewall, hub disc + cap */
          const wseg = design.wheelSeg && design.wheelSeg[detail];
          const wheelGeo = design.chunky ? (R, Wd, dual) => {
            // the Sell-Off's: dual = two tyres side by side (a groove between); design.tread = chunky lugs on the crown
            const acc = new U.Acc(), [seg, st] = wseg || LV.wheel;
            if (LV.far) {
              U.addGeo(THREE, acc, new THREE.CylinderGeometry(R, R, Wd, seg, 1).rotateZ(PI / 2), M4(), (x, y, z, nx) => (abs(nx) > 0.5 && hypot(y, z) < R * 0.62 ? C.hub : C.tyre), K.rubber, 0);
              return acc;
            }
            const tyres = dual ? [[-Wd * 0.255, Wd * 0.47], [Wd * 0.255, Wd * 0.47]] : [[0, Wd]];
            for (const [ox, tw] of tyres) {
              const h = tw / 2, rr = min(0.055, h * 0.7), prof = [[R * 0.6, -h * 0.9]];
              for (let k = 0; k <= st; k++) { const a = -PI / 2 + (k / st) * (PI / 2); prof.push([R - rr + rr * cos(a), -h + rr + rr * sin(a)]); }
              for (let k = 0; k <= st; k++) { const a = (k / st) * (PI / 2); prof.push([R - rr + rr * cos(a), h - rr + rr * sin(a)]); }
              prof.push([R * 0.6, h * 0.9]);
              const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg).rotateZ(PI / 2);
              U.addGeo(THREE, acc, lathe, M4().makeTranslation(ox, 0, 0), C.tyre, K.rubber, 0);
              // tread lugs: chevron pairs of rounded blocks on the crown
              const n = design.tread && design.tread[detail];
              if (n) {
                const lug = new THREE.BoxGeometry(tw * 0.4, 0.022, R * 0.3, 1, 1, 1);
                for (let i = 0; i < n; i++) for (const sd of [-1, 1]) {
                  const a = (i + (sd > 0 ? 0.5 : 0)) / n * PI * 2;
                  const m = M4().makeRotationX(a).multiply(M4().makeTranslation(ox + sd * tw * 0.22, R - 0.006, 0)).multiply(M4().makeRotationY(sd * 0.35));
                  U.addGeo(THREE, acc, lug, m, C.tyre, K.rubber, 0);
                }
              }
            }
            const h = Wd / 2;
            for (const s of [1, -1]) {
              U.addGeo(THREE, acc, new THREE.CircleGeometry(R * 0.62, seg).rotateY(s * PI / 2), M4().makeTranslation(s * h * 0.86, 0, 0), (x, y, z) => (hypot(y, z) > R * 0.5 ? C.hub : mix3(C.hub, C.hubIn || C.top, 0.6)), K.paint, 0);
              U.addGeo(THREE, acc, new THREE.SphereGeometry(R * 0.24, seg >= 14 ? seg >> 1 : 5, seg >= 14 ? 4 : 2, 0, PI * 2, 0, PI / 2).rotateZ(-s * PI / 2), M4().makeTranslation(s * h * 0.86, 0, 0).multiply(M4().makeScale(0.5, 1, 1)), C.cap, K.chrome, 0);
              // lug nuts round the cap
              if (design.lugNuts && design.lugNuts[detail]) for (let i = 0; i < design.lugNuts[detail]; i++) {
                const a = i / design.lugNuts[detail] * PI * 2;
                U.addGeo(THREE, acc, new THREE.CylinderGeometry(0.013, 0.013, 0.02, 5, 1, true).rotateZ(PI / 2), M4().makeTranslation(s * h * 0.88, R * 0.36 * cos(a), R * 0.36 * sin(a)), C.chrome, K.chrome, 0);
              }
            }
            return acc;
          } : (R, Wd) => {
            const acc = new U.Acc(), st = Array.isArray(wseg) ? wseg[1] : LV.wheel[1], seg = (Array.isArray(wseg) ? wseg[0] : wseg) || LV.wheel[0], h = Wd / 2, rr = min(0.055, h * 0.7);
            if (LV.far) {
              U.addGeo(THREE, acc, new THREE.CylinderGeometry(R, R, Wd, seg, 1).rotateZ(PI / 2), M4(), (x, y, z, nx) => (abs(nx) > 0.5 && hypot(y, z) < R * 0.62 ? C.hub : C.tyre), K.rubber, 0);
              return acc;
            }
            const prof = [[R * 0.6, -h * 0.9]];
            for (let k = 0; k <= st; k++) { const a = -PI / 2 + (k / st) * (PI / 2); prof.push([R - rr + rr * cos(a), -h + rr + rr * sin(a)]); }
            for (let k = 0; k <= st; k++) { const a = (k / st) * (PI / 2); prof.push([R - rr + rr * cos(a), h - rr + rr * sin(a)]); }
            prof.push([R * 0.6, h * 0.9]);
            const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg).rotateZ(PI / 2);
            U.addGeo(THREE, acc, lathe, M4(), (x, y, z) => { const r = hypot(y, z); return design.whitewall && abs(x) > h * 0.6 && r > R * 0.66 && r < R * 0.82 ? C.wall : C.tyre; }, design.tyreK ? K[design.tyreK] || design.tyreK : K.rubber, 0);
            if (typeof design.tread === 'function') design.tread(ctx, acc, R, Wd);
            for (const s of [1, -1]) {
              U.addGeo(THREE, acc, new THREE.CircleGeometry(R * 0.62, seg).rotateY(s * PI / 2), M4().makeTranslation(s * h * 0.86, 0, 0), (x, y, z) => (hypot(y, z) > R * 0.5 ? C.hub : mix3(C.hub, C.top, 0.15)), design.hubK ? K[design.hubK] : K.paint, 0);
              if (LV.detail || !design.capsNearOnly) U.addGeo(THREE, acc, new THREE.SphereGeometry(R * 0.24, max(8, seg >> 1), 4, 0, PI * 2, 0, PI / 2).rotateZ(-s * PI / 2), M4().makeTranslation(s * h * 0.86, 0, 0).multiply(M4().makeScale(0.5, 1, 1)), C.cap, K.chrome, 0);
              if (design.rimRing && seg >= 18) U.addGeo(THREE, acc, new THREE.TorusGeometry(R * 0.62, 0.008, 3, seg).rotateY(PI / 2), M4().makeTranslation(s * h * 0.87, 0, 0), C.chrome, K.chrome, 0);
            }
            return acc;
          };
          const wheelAccs = {}, wheelMeshes = [];
          for (const [x, z, R, Wd, dual] of WHEELS) {
            const key = R + '_' + Wd + '_' + !!dual; if (!wheelAccs[key]) wheelAccs[key] = wheelGeo(R, Wd, dual);
            const pivot = new THREE.Group(); pivot.position.set(x, R, z);
            const m = toMesh(wheelAccs[key], 'kart-wheel'); pivot.add(m); group.add(pivot);
            wheelMeshes.push({ pivot, mesh: m, R, front: z > 0 });
          }
          const extras = ctx.extra.map((e) => {
            const pivot = new THREE.Group(); pivot.position.set(...e.pos); const tilt = new THREE.Group(); if (e.quat) tilt.quaternion.copy(e.quat);
            const m = toMesh(e.acc, e.name); tilt.add(m); pivot.add(tilt); group.add(pivot); return { pivot, tilt, mesh: m, name: e.name };
          });
          let tris = 0; group.traverse((o) => { if (o.isMesh && o.visible !== false && o.parent.visible !== false) tris += o.geometry.index.count / 3; });
          parts.wheels = wheelMeshes.reduce((a, w) => a + w.mesh.geometry.index.count / 3, 0);
          group.traverse((o) => { if (o.isMesh) { o.castShadow = o !== glassMesh; o.receiveShadow = o !== glassMesh; } });
          group.userData.kart = {
            seat: SEAT.slice(), level: detail, tris, ms: Math.round(now() - T0), parts, wheels: wheelMeshes, steering: steerSpin, glass: glassMesh, extra, extras,
            animate(dt, o) {
              const v = o.speed || 0, s = o.steer || 0;
              for (const w of wheelMeshes) { w.mesh.rotation.x += (v / w.R) * dt; if (w.front) w.pivot.rotation.y = s * 0.42; }
              steerSpin.rotation.z = -s * 1.4;
              if (design.animate) design.animate(dt, o, design.extra ? extra : extras);
            },
          };
          return group;
        }
        const api = { make, LEVELS, SEAT: KSEAT, COCK: KCOCK, rbox, cylX };
        // (the roster's karts were drawn up against copies of this kit under these names: one kit answers to all of them)
        root.DogKartKit = root.BearKartKit = root.WhaleKartKit = root.MoonKartKit = api;
      })(KR);

      /* Meme Kart: WOW WAGON, Doge's kart (scratch, 6 Oct 2026). An original retro roadster-kart, built in code.
       *
       *   WowWagon(THREE, K, detail, opts) -> THREE.Group      (needs dog.js + kart-kit.js; budgets 12k / 6k / 2k / 0.5k)
       *
       * A rounded 1950s tub in cream over red with four cream cycle-wing mudguards on chrome stays (wide enough that the
       * front wheels steer under them); a chrome waist strip on the two-tone seam; round
       * chrome-ringed headlamps in the fender noses; a grille mouth; a chrome bumper; twin chrome pipes; whitewall tyres on
       * red hubs; a cream steering wheel; a paw-print roundel on the bonnet. No borrowed kart design: the read is
       * "toy roadster", not "racing kart".
       */
      (function (root) {
        'use strict';
        const { abs, max, min, sin, cos, PI, hypot } = Math;
        function WowWagon(THREE, KIT, detail, opts) {
          const KK = root.DogKartKit, U = root.DogFinal.util, { sstep, smin, smax, ell, mix3, v3 } = U, { rbox, cylX } = KK;
          const WHEELS = [[0.58, 0.6, 0.16, 0.14], [-0.58, 0.6, 0.16, 0.14], [0.6, -0.55, 0.2, 0.19], [-0.6, -0.55, 0.2, 0.19]];
          const tubF = (x, y, z) => {
            const taper = 1 - 0.2 * sstep(0.15, 0.85, z) - 0.1 * sstep(-0.5, -0.85, z);
            const d = rbox(x / taper, y, z, [0, 0.29, 0.02], [0.33, 0.14, 0.8], 0.14) * taper;
            return smax(d, (y - (0.43 - 0.12 * sstep(0.25, 0.85, z) * sstep(0.25, 0.85, z))), 0.05);
          };
          const bodyF = (x, y, z) => tubF(x, y, z);
          const design = {
            name: 'wow-wagon', gloss: 0.32, whitewall: true, rimRing: false, strip: [0.008, 0.014], coamingK: 'seat',
            box: [-0.5, 0.05, -0.98, 0.5, 0.6, 1.0], farC: [0, 0.3, 0.0], wheels: WHEELS, bodyF,
            seamY: (x, z) => 0.285 + 0.02 * sstep(0.3, 0.8, z),
            palette: {
              top: '#F6E7C8', topDk: '#E2CBA2', low: '#D33A2C', lowDk: '#A42820', inside: '#8E2A22',
              chrome: '#E4E8EE', chromeDk: '#8C939C', lamp: '#FFF3C2', tail: '#FF4A3A', coaming: '#C8352A',
              seat: '#C8352A', seatHi: '#E2584A', tyre: '#1E1F23', wall: '#F4F0E6', hub: '#D33A2C', cap: '#E4E8EE',
              rim: '#F6E7C8', hubS: '#D33A2C', paw: '#D33A2C', roundel: '#F6E7C8', grille: '#2A2426',
            },
            // far: the four mudguards as plain arcs
            far(c) {
              const { THREE, U: u, C, K, body, M4 } = c;
              for (const [wx, wz, R, Wd] of WHEELS) {
                const front = wz > 0, rad = R + 0.05, a0 = front ? 0.12 * PI : 0.2 * PI, a1 = front ? 0.92 * PI : 0.86 * PI, pts = [];
                for (let i = 0; i <= 4; i++) { const a = a0 + (a1 - a0) * i / 4; pts.push([wx, R + rad * sin(a), wz + rad * cos(a)]); }
                const half = Wd / 2 + (front ? 0.06 : 0.03);
                u.addGeo(THREE, body, u.taperTube(THREE, pts, pts.map(() => 0.024), pts.map(() => half), 4, () => [1, 0, 0], false), M4(), C.top, K.paint, 0);
              }
            },
            details(c) {
              const { THREE, U: u, C, K, LV, body, M4, V, Q, done, onBody } = c;
              // headlamps in the fender noses: chrome ring + glowing lens; tail lamps on the rear fenders
              for (const s of [1, -1]) {
                const hl = onBody([s * 0.2, 0.36, 0.95], 0.0);
                const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(v3.norm(v3.lerp(hl.n, [0, 0, 1], 0.6))));
                u.addGeo(THREE, body, new THREE.TorusGeometry(0.05, 0.012, max(3, LV.tube - 2), LV.wheel[0]), M4().compose(V(hl.p), q, V([1, 1, 1])), C.chrome, K.chrome, 0);
                u.addGeo(THREE, body, new THREE.SphereGeometry(0.048, LV.wheel[0], 5, 0, PI * 2, 0, PI * 0.35).rotateX(PI / 2), M4().compose(V(v3.add(hl.p, hl.n, -0.028)), q, V([1, 1, 1])), C.lamp, K.glow, 0);
                const tl = onBody([s * 0.3, 0.33, -0.95], 0.0);
                u.addGeo(THREE, body, new THREE.SphereGeometry(0.03, LV.detail ? 12 : 6, LV.detail ? 6 : 3), M4().compose(V(tl.p), new THREE.Quaternion(), V([0.8, 1, 0.5])), C.tail, K.glow, 0);
              }
              // a grille mouth on the nose (dark, with three chrome bars)
              if (LV.detail) {
                const gp = onBody([0, 0.27, 0.95], 0.0), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(gp.n));
                u.addGeo(THREE, body, c.rboxG(0.24, 0.07, 0.02, 0.009), M4().compose(V(v3.add(gp.p, gp.n, -0.004)), q, V([1, 1, 1])), C.grille, K.matte, 0);
                for (const yy of [-0.018, 0, 0.018]) u.addGeo(THREE, body, c.rboxG(0.22, 0.007, 0.012, 0.003), M4().compose(V(v3.add(v3.add(gp.p, gp.n, 0.004), [0, yy, 0])), q, V([1, 1, 1])), C.chrome, K.chrome, 0);
              }
              // the chrome front bumper, curving round the nose
              const bp = []; const nb = LV.detail ? 16 : 8;
              for (let i = 0; i <= nb; i++) { const s = -1 + 2 * i / nb; bp.push([s * 0.38, 0.19, 0.93 - 0.09 * s * s]); }
              u.addGeo(THREE, body, u.taperTube(THREE, bp, bp.map(() => 0.024), bp.map(() => 0.024), LV.tube, [0, 1, 0], true), M4(), C.chrome, K.chrome, 0);
              for (const s of [1, -1]) u.addGeo(THREE, body, u.taperTube(THREE, [[s * 0.2, 0.19, 0.92], [s * 0.2, 0.21, 0.8]], [0.012, 0.012], [0.012, 0.012], 5, [0, 1, 0], false), M4(), C.chromeDk, K.chrome, 0);
              // twin chrome pipes out the back
              for (const s of [1, -1]) {
                const pp = [[s * 0.18, 0.2, -0.7], [s * 0.2, 0.18, -0.92], [s * 0.21, 0.19, -1.02]];
                u.addGeo(THREE, body, u.taperTube(THREE, pp, [0.03, 0.032, 0.036], [0.03, 0.032, 0.036], LV.tube, [0, 1, 0], false), M4(), C.chrome, K.chrome, 0);
                if (LV.detail) u.addGeo(THREE, body, new THREE.CircleGeometry(0.03, LV.tube).rotateY(PI), M4().makeTranslation(s * 0.21, 0.19, -1.02), C.tyre, K.rubber, 0);
              }
              // cycle-wing mudguards over every wheel (cream shell, darker underside), each on two chrome stays to the tub
              for (const [wx, wz, R, Wd] of WHEELS) {
                const hi = LV.loop > 40, sd = Math.sign(wx), front = wz > 0, gap = 0.05, rad = R + gap, n = hi ? 14 : LV.detail ? 9 : 5;
                const a0 = front ? 0.12 * PI : 0.2 * PI, a1 = front ? 0.92 * PI : 0.86 * PI, pts = [], hints = [];
                for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([wx, R + rad * sin(a), wz + rad * cos(a)]); hints.push([0, sin(a), cos(a)]); }
                const half = Wd / 2 + (front ? 0.06 : 0.03);
                const rx = pts.map((_, i) => half * (0.86 + 0.14 * sin(PI * i / n))), ry = pts.map((_, i) => 0.026 * (0.75 + 0.25 * sin(PI * i / n)));
                u.addGeo(THREE, body, u.taperTube(THREE, pts, ry, rx, hi ? 10 : LV.detail ? 6 : 4, (i) => [1, 0, 0], true), M4(), (x, y, z, nx, ny, nz) => {
                  const out = (ny * (y - R) + nz * (z - wz)) > 0 ? 1 : 0; return out ? C.top : C.topDk;
                }, K.paint, 0);
                // a red pinstripe along the crown of each wing
                if (hi) {
                  const ps = pts.map((p, i) => v3.add(p, hints[i], ry[i] - 0.001)), pr = ps.map((_, i) => 0.006 * (0.4 + 0.6 * sin(PI * i / n)));
                  u.addGeo(THREE, body, u.taperTube(THREE, ps, pr, pr, 4, (i) => hints[i], true), M4(), C.low, K.paint, 0);
                }
                for (const k of [0.5]) {
                  const a = a0 + (a1 - a0) * k, p = [wx - sd * (half - 0.02), R + rad * sin(a), wz + rad * cos(a)];
                  const q = onBody([sd * 0.3, min(0.4, p[1] - 0.05), p[2]], 0.0);
                  u.addGeo(THREE, body, u.taperTube(THREE, [p, v3.add(q.p, q.n, -0.01)], [0.015, 0.013], [0.015, 0.013], 6, [0, 1, 0], false), M4(), C.chromeDk, K.chrome, 0);
                }
              }
              // the paw-print roundel on the bonnet
              if (LV.detail) {
                const rc = onBody([0, 0.45, 0.58], 0.0), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(rc.n));
                u.addGeo(THREE, body, new THREE.CylinderGeometry(0.085, 0.085, 0.008, LV.wheel[0]).rotateX(PI / 2), M4().compose(V(v3.add(rc.p, rc.n, 0.002)), q, V([1, 1, 1])), C.roundel, K.paint, 0);
                u.addGeo(THREE, body, new THREE.TorusGeometry(0.085, 0.008, 4, LV.wheel[0]), M4().compose(V(v3.add(rc.p, rc.n, 0.004)), q, V([1, 1, 1])), C.chrome, K.chrome, 0);
                const blob = LV.loop > 40 ? new THREE.SphereGeometry(1, 10, 6) : new THREE.SphereGeometry(1, 6, 3);
                for (const [px, py, rx, ry] of [[0, -0.016, 0.034, 0.028], [-0.036, 0.022, 0.014, 0.017], [-0.013, 0.042, 0.013, 0.017], [0.013, 0.042, 0.013, 0.017], [0.036, 0.022, 0.014, 0.017]]) {
                  const off = new THREE.Vector3(px, py, 0.006).applyQuaternion(q);
                  u.addGeo(THREE, body, blob, M4().compose(V(rc.p).add(off), q, V([rx, ry, 0.005])), C.paw, K.paint, 0);
                }
              }
              done('details');
              void Q; void mix3; void hypot; void sin; void cos; void max; void min;
            },
          };
          return KK.make(design, THREE, KIT, detail, opts);
        }
        root.WowWagon = WowWagon;
      })(KR);

      /* Meme Kart: SAKURA DART, the Shiba's kart (scratch, 6 Oct 2026). An original low red-lacquer wedge, built in code.
       *
       *   SakuraDart(THREE, K, detail, opts) -> THREE.Group      (needs dog.js + kart-kit.js; budgets 12k / 6k / 2k / 0.5k)
       *
       * A low wedge in red lacquer over a black lower body with a gold pinstripe; side pods with air scoops; a front
       * splitter; a rear wing on two struts with gold end plates (the strongest 48 px silhouette separator in the roster);
       * a gold air hoop behind the seat; five-petal sakura blossoms on the pods and the nose; black tyres on gold rims.
       */
      (function (root) {
        'use strict';
        const { abs, sin, cos, PI } = Math;
        function SakuraDart(THREE, KIT, detail, opts) {
          const KK = root.DogKartKit, U = root.DogFinal.util, { sstep, smin, smax, mix3, v3 } = U, { rbox } = KK;
          const WHEELS = [[0.6, 0.62, 0.155, 0.15], [-0.6, 0.62, 0.155, 0.15], [0.62, -0.56, 0.19, 0.22], [-0.62, -0.56, 0.19, 0.22]];
          const bodyF = (x, y, z) => {
            let d = rbox(x, y, z, [0, 0.25, 0.0], [0.33, 0.13, 0.84], 0.07);
            d = smax(d, (y - (0.37 - 0.15 * sstep(-0.25, 0.85, z))) * 0.98, 0.03);
            let pod = rbox(abs(x), y, z, [0.37, 0.23, -0.06], [0.1, 0.075, 0.36], 0.06);
            pod = smax(pod, -rbox(abs(x), y, z, [0.37, 0.24, 0.32], [0.07, 0.04, 0.08], 0.02), 0.01);
            d = smin(d, pod, 0.04);
            return smin(d, rbox(x, y, z, [0, 0.13, 0.8], [0.42, 0.018, 0.1], 0.015), 0.02);
          };
          const design = {
            name: 'sakura-dart', gloss: 0.18, whitewall: false, rimRing: true, strip: [0.005, 0.008], coamingK: 'chrome',
            box: [-0.62, 0.05, -0.95, 0.62, 0.58, 0.98], farC: [0, 0.24, 0.0], wheels: WHEELS, bodyF,
            seamY: () => 0.215,
            palette: {
              top: '#C8202C', topDk: '#8E1620', low: '#1C1A1F', lowDk: '#0E0D10', inside: '#2A2228',
              chrome: '#E8C25A', chromeDk: '#9C7A2A', lamp: '#FFE9F2', tail: '#FF3E6A', coaming: '#9C7A2A',
              seat: '#1E1C22', seatHi: '#34303A', tyre: '#1B1B1F', wall: '#1B1B1F', hub: '#E8C25A', cap: '#C8202C',
              rim: '#1E1C22', hubS: '#E8C25A', petal: '#FFB7CF', petalDk: '#FF7FAA', petalC: '#FFE08A',
            },
            // far: the wing survives (it is the silhouette)
            far(c) {
              const { THREE, C, K, body, M4, V, Q, U: u } = c;
              u.addGeo(THREE, body, new THREE.BoxGeometry(1.0, 0.03, 0.2), M4().compose(V([0, 0.6, -0.86]), Q(0.12, 0, 0), V([1, 1, 1])), C.top, K.paint, 0);
              for (const s of [1, -1]) u.addGeo(THREE, body, new THREE.BoxGeometry(0.02, 0.36, 0.06), M4().compose(V([s * 0.2, 0.43, -0.82]), Q(0.15, 0, 0), V([1, 1, 1])), C.low, K.paint, 0);
            },
            details(c) {
              const { THREE, U: u, C, K, LV, body, M4, V, Q, done, onBody, rboxG } = c;
              u.addGeo(THREE, body, rboxG(1.0, 0.03, 0.2, 0.012), M4().compose(V([0, 0.6, -0.86]), Q(0.12, 0, 0), V([1, 1, 1])), (x, y) => (y > 0 ? C.top : C.low), K.paint, 0);
              for (const s of [1, -1]) {
                u.addGeo(THREE, body, rboxG(0.025, 0.18, 0.012, 0.004), M4().compose(V([s * 0.49, 0.6, -0.86]), new THREE.Quaternion(), V([1, 1, 1])), C.chrome, K.chrome, 0);
                u.addGeo(THREE, body, rboxG(0.02, 0.36, 0.06, 0.008), M4().compose(V([s * 0.2, 0.43, -0.82]), Q(0.15, 0, 0), V([1, 1, 1])), C.low, K.paint, 0);
                if (LV.detail) for (const [bz, bs] of [[0.05, 1], [-0.22, 0.7]]) {
                  const b = onBody([s * 0.47, 0.25, bz], 0.0);
                  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(b.n));
                  const petal = new THREE.SphereGeometry(1, LV.petal[0], LV.petal[1]);
                  for (let i = 0; i < 5; i++) {
                    const a = (i / 5) * PI * 2 + PI / 2, off = new THREE.Vector3(cos(a) * 0.026 * bs, sin(a) * 0.026 * bs, 0.003).applyQuaternion(q);
                    u.addGeo(THREE, body, petal, M4().compose(V(b.p).add(off), q.clone().multiply(Q(0, 0, a)), V([0.026 * bs, 0.017 * bs, 0.004])), (x) => mix3(C.petalDk, C.petal, sstep(-0.3, 0.8, x)), K.paint, 0);
                  }
                  u.addGeo(THREE, body, petal, M4().compose(V(v3.add(b.p, b.n, 0.005)), q, V([0.011 * bs, 0.011 * bs, 0.004])), C.petalC, K.paint, 0);
                }
                const tl = onBody([s * 0.24, 0.27, -0.95], 0.0);
                u.addGeo(THREE, body, rboxG(0.16, 0.025, 0.02, 0.008), M4().compose(V(tl.p), new THREE.Quaternion(), V([1, 1, 1])), C.tail, K.glow, 0);
                const hl = onBody([s * 0.2, 0.22, 0.95], 0.0);
                u.addGeo(THREE, body, rboxG(0.13, 0.025, 0.02, 0.008), M4().compose(V(hl.p), Q(-0.4, 0, 0), V([1, 1, 1])), C.lamp, K.glow, 0);
              }
              if (LV.detail) {
                const b = onBody([0, 0.3, 0.55], 0.0), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(b.n)), petal = new THREE.SphereGeometry(1, LV.petal[0], LV.petal[1]);
                for (let i = 0; i < 5; i++) {
                  const a = (i / 5) * PI * 2 + PI / 2, off = new THREE.Vector3(cos(a) * 0.04, sin(a) * 0.04, 0.003).applyQuaternion(q);
                  u.addGeo(THREE, body, petal, M4().compose(V(b.p).add(off), q.clone().multiply(Q(0, 0, a)), V([0.04, 0.027, 0.005])), (x) => mix3(C.petalDk, C.petal, sstep(-0.3, 0.8, x)), K.paint, 0);
                }
                u.addGeo(THREE, body, petal, M4().compose(V(v3.add(b.p, b.n, 0.006)), q, V([0.016, 0.016, 0.005])), C.petalC, K.paint, 0);
              }
              const hp = [], nh = LV.detail ? 12 : 6; for (let i = 0; i <= nh; i++) { const a = PI * i / nh; hp.push([cos(a) * 0.17, 0.42 + sin(a) * 0.17, -0.5]); }
              u.addGeo(THREE, body, u.taperTube(THREE, hp, hp.map(() => 0.022), hp.map(() => 0.022), LV.tube, [0, 0, 1], true), M4(), C.chrome, K.chrome, 0);
              done('details');
            },
          };
          return KK.make(design, THREE, KIT, detail, opts);
        }
        root.SakuraDart = SakuraDart;
      })(KR);

      /* Meme Kart: Pepe FINAL (scratch recipe, 6 Oct 2026). An original 3D frog in Pepe's recognisable style, built in code.
       *
       *   PepeFinal(THREE, K, detail, opts) -> THREE.Group
       *     K      = the endo marching-cubes kit ({ field, polygonize }, endo-kit.js = endo.js:197-292)
       *     detail = 'desktop' | 'phone' | 'mid' | 'far'      (budgets 14k / 7k / 2.5k / 0.6k triangles)
       *     opts   = { jersey: '#2E62B8', rim: '#CFE0FF', toon: <shared gm-kart-toon material> }
       *
       * Base = the judges' winner (EXPRESSIVE: pear head, wrap-around two-band lips, proud eye domes, drawn lid line),
       * rebuilt on TOY's construction: rigid vinyl-toy parts on bones, each colour region its own marching-cubes mesh
       * (so every paint line is a crisp geometric intersection, never a smeared vertex colour), every vertex pulled onto
       * the exact SDF surface with the analytic normal (a coarse, in-budget grid still shades smoothly), no decimation.
       *
       * Units metres, +Z forward (the face), +Y up, origin = seat contact under the pelvis. Seated pose with the hands at
       * ten-and-two on a steering wheel at G.wheel (the kart builds its wheel there).
       *
       * Draw calls: 2 (one SkinnedMesh in gm-kart-toon: skin, lips, jersey, trims, lids, tear, tongue, firefly; one Mesh
       * for both eyeballs on the head bone, iris/pupil/catchlights in the shader). 'far' = 1 plain Mesh.
       * Rig: 19 bones (root, body, head, armL/R, foreL/R, legL/R, eyeL/R, lidU/L x2, creaseL/R, tear, tongue).
       * Expressions = 4 morph targets (smug, feelsgood, sad, celebrate) by SDF re-projection + bone poses.
       *
       * group.userData.pepe = { set(weights), setExpression(name), setGaze(x, y), blink(v), squash(k), kick(v), steer(v),
       *                         update(dt), jersey(hex), bones, mesh, stats }
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, exp } = Math;
        const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
        const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
        const lerp = (a, b, t) => a + (b - a) * t;
        const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
        const smin = (a, b, k) => { const h = sat(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
        const smax = (a, b, k) => -smin(-a, -b, k);
        const ell = (x, y, z, a, b, c) => {
          const X = x / a, Y = y / b, Z = z / c;
          const k0 = sqrt(X * X + Y * Y + Z * Z), k1 = sqrt(X * X / (a * a) + Y * Y / (b * b) + Z * Z / (c * c)) + 1e-9;
          return k0 * (k0 - 1) / k1;
        };
        const E6 = (x, y, z, e) => ell(x - e[0], y - e[1], z - e[2], e[3], e[4], e[5]);
        function cap(x, y, z, A, B, ra, rb) {   // round cone A (ra) -> B (rb)
          const bx = B[0] - A[0], by = B[1] - A[1], bz = B[2] - A[2], px = x - A[0], py = y - A[1], pz = z - A[2];
          const t = sat((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz));
          return hypot(px - bx * t, py - by * t, pz - bz * t) - (ra + (rb - ra) * t);
        }
        const v3 = {
          add: (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k],
          sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
          norm: (a) => { const l = hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
          cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
          dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
        };

        /* ------------------------------------------------------------------ measurements (the +x = character's left side) */
        const G = {
          cran: [0, 0.69, -0.005, 0.306, 0.21, 0.252],       // the dome of the head
          muz: [0, 0.592, 0.05, 0.338, 0.156, 0.268],          // the wide lower face the lips ride on
          mound: [0.13, 0.868, 0.035, 0.114, 0.112, 0.104],    // skin cups behind each eye
          throat: [0, 0.49, -0.012, 0.175, 0.08, 0.152],       // seats the head in the collar
          eye: [0.132, 0.886, 0.106], eyeR: 0.107, eyeScale: [1.08, 1.0, 0.96], splay: 0.2, tilt: -0.16,
          neck: [0, 0.47, -0.012],
          torso: [0, 0.25, -0.035, 0.226, 0.272, 0.202], belly: [0, 0.19, 0.03, 0.206, 0.19, 0.2],
          S: [0.198, 0.405, -0.02], El: [0.282, 0.29, 0.15],
          Hp: [0.112, 0.1, 0.03], K: [0.163, 0.205, 0.262], A: [0.172, 0.112, 0.385], F: [0.172, 0.058, 0.448],
          wheel: { c: [0, 0.335, 0.425], r: 0.138, tilt: 0.5, grip: 0.52 },   // grip = hand angle on the rim (rad from 3 o'clock)
        };
        // the hands at ten-and-two: rim point, tangent, outward radial, wheel normal (pointing away from the driver)
        const WH = (() => {
          const W = G.wheel, up = [0, cos(W.tilt), sin(W.tilt)], nrm = [0, -sin(W.tilt), cos(W.tilt)];
          const a = W.grip, rad = v3.norm(v3.add([cos(a), 0, 0], up, sin(a)));
          const H = v3.add(W.c, rad, W.r), T = v3.norm(v3.add([-sin(a), 0, 0], up, cos(a)));
          return { up, nrm, rad, H, T };
        })();
        G.H = WH.H;
        G.Wr = v3.add(WH.H, v3.norm(v3.sub(G.El, WH.H)), 0.075);     // the wrist, on the line back to the elbow

        /* ------------------------------------------------------------------ lips (expressive's wrap-around band, prouder in profile) */
        const muzZ = (x, y) => { const m = G.muz, q = 1 - (x / m[3]) ** 2 - ((y - m[1]) / m[4]) ** 2; return m[2] + m[5] * sqrt(max(0.02, q)); };
        const NEUTRAL_LIP = { yM: 0.588, curv: 0.032, cL: 0.004, cR: 0.004, span: 0.278, upR: 0.033, loR: 0.0275, open: 0, pout: 0, cheek: [0, 0], droop: 0 };
        const L_ = (o) => Object.assign({}, NEUTRAL_LIP, o);
        const EXPR = {
          neutral:   { lip: NEUTRAL_LIP, lidU: -0.03, lidL: 0.95, roll: 0.05, gaze: [0.2, -0.2], tongue: 0, tear: 0, crease: 0 },
          // a lopsided smirk: the +x corner high into a puffed cheek, pressed lips, heavy lids, side-eye
          smug:      { lip: L_({ curv: 0.022, cL: -0.008, cR: 0.08, upR: 0.029, loR: 0.024, cheek: [0, 1], span: 0.282 }), lidU: 0.2, lidL: 0.82, roll: -0.04, gaze: [0.62, -0.1], tongue: 0, tear: 0, crease: 0 },
          // feels good: eyes shut into happy arcs, a wide U grin pushing the cheeks up
          feelsgood: { lip: L_({ curv: 0.09, cL: 0.026, cR: 0.026, span: 0.29, upR: 0.03, loR: 0.025, cheek: [1, 1] }), lidU: 1.32, lidL: 0.42, roll: 0, gaze: [0, -0.3], tongue: 0, tear: 0, crease: 1 },
          // sad (hit): corners down, lower lip pouting, lids tipped up at the inner corners, eyes up, a tear
          sad:       { lip: L_({ curv: -0.045, cL: -0.026, cR: -0.026, upR: 0.03, loR: 0.03, pout: 0.012, droop: 0.012 }), lidU: 0.1, lidL: 0.82, roll: 0.36, gaze: [0.05, 0.42], tongue: 0, tear: 1, crease: 0 },
          // celebrate: a wide grin, lips parted, eyes wide, the tongue snapping a firefly
          celebrate: { lip: L_({ curv: 0.075, cL: 0.018, cR: 0.018, span: 0.288, upR: 0.031, loR: 0.026, open: 0.014, cheek: [0.7, 0.7] }), lidU: -0.5, lidL: 1.1, roll: 0, gaze: [0.5, 0.35], tongue: 1, tear: 0, crease: 0 },
        };
        const EXPR_NAMES = ['smug', 'feelsgood', 'sad', 'celebrate'];

        function lipPt(L, which, t, out) {   // which: 0 upper, 1 lower, 2 mouth line
          const c = t > 0 ? L.cR : L.cL, t2 = t * t, base = L.yM + L.curv * t2 + c * t2 * t2 - L.droop * (1 - t2);
          const x = L.span * (which === 1 ? 0.93 : which === 2 ? 0.97 : 1) * t;
          let y, inset;
          if (which === 0) { y = base + 0.018 + L.open * 0.45; inset = 0.009; }
          else if (which === 1) { y = base - 0.027 - L.open * 0.55; inset = 0.016 - L.pout; }
          else { y = base - 0.005 - L.open * 0.05; inset = 0.022; }
          out[0] = x; out[1] = y; out[2] = (L.surf ? L.surf(x * 0.985, y) : muzZ(x * 0.985, clamp(y, G.muz[1] - 0.11, G.muz[1] + 0.11))) - inset;
          return out;
        }
        // the z of the expression's actual head surface (cheeks included) at (x, y): the lips ride on it, never sink under a cheek
        function surfFor(L) {
          return (x, y) => {
            let lo = -0.05, hi = 0.46;   // headF < 0 at lo (inside), > 0 at hi
            if (headF(x, y, lo, L) > 0) return muzZ(x, clamp(y, G.muz[1] - 0.11, G.muz[1] + 0.11));
            for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (headF(x, y, m, L) < 0) lo = m; else hi = m; }
            return (lo + hi) / 2;
          };
        }
        // a point on a lip polyline at t in [-1, 1]
        function polyAt(P, t, out) {
          const f = clamp((t + 1) / 2, 0, 1) * NSEG, i = Math.min(NSEG - 1, Math.floor(f)), u = f - i, a = 4 * i, b = a + 4;
          out[0] = P[a] + (P[b] - P[a]) * u; out[1] = P[a + 1] + (P[b + 1] - P[a + 1]) * u; out[2] = P[a + 2] + (P[b + 2] - P[a + 2]) * u;
          return out;
        }
        const NSEG = 16;
        function lipPolys(L) {
          const o = [0, 0, 0], polys = [];
          if (!L.surf) L = Object.assign({}, L, { surf: surfFor(L) });
          for (let w = 0; w < 3; w++) {
            const P = new Float64Array((NSEG + 1) * 4);
            for (let i = 0; i <= NSEG; i++) {
              const t = -1 + (2 * i) / NSEG; lipPt(L, w, t, o);
              const t4 = t * t * t * t;
              // blunt rounded tips (the meme's lip ends are round, not pointed)
              const r = w === 0 ? L.upR * (1 - 0.3 * t4) : w === 1 ? L.loR * (1 - 0.34 * t4) : 0.009 + L.open * 0.42 * (1 - 0.5 * t4);
              P[4 * i] = o[0]; P[4 * i + 1] = o[1]; P[4 * i + 2] = o[2]; P[4 * i + 3] = r;
            }
            polys.push(P);
          }
          return polys;
        }
        function tube(P, x, y, z, zk) {
          let best = 1e9;
          // the polyline is uniform in x: only the few segments near x can be nearest
          const x0 = P[0], x1 = P[4 * NSEG], c = Math.floor(((x - x0) / (x1 - x0)) * NSEG);
          const ia = c - 2 < 0 ? 0 : c - 2 > NSEG - 1 ? NSEG - 1 : c - 2, ib = c + 2 > NSEG - 1 ? NSEG - 1 : c + 2 < 0 ? 0 : c + 2;
          for (let i = ia; i <= ib; i++) {
            const a = 4 * i, b = a + 4;
            const bx = P[b] - P[a], by = P[b + 1] - P[a + 1], bz = (P[b + 2] - P[a + 2]) / zk;
            const px = x - P[a], py = y - P[a + 1], pz = (z - P[a + 2]) / zk;
            const t = sat((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz + 1e-12));
            const d = hypot(px - bx * t, py - by * t, pz - bz * t) - (P[a + 3] + (P[b + 3] - P[a + 3]) * t);
            if (d < best) best = d;
          }
          return best;
        }

        /* ------------------------------------------------------------------ the part fields */
        function headF(x, y, z, L) {
          const ax = abs(x);
          let d = smin(E6(ax, y, z, G.cran), E6(ax, y, z, G.muz), 0.085);
          d = smin(d, E6(ax, y, z, G.mound), 0.05);
          d = smin(d, E6(ax, y, z, G.throat), 0.07);
          const ck = x > 0 ? L.cheek[1] : L.cheek[0];
          if (ck > 0.001) d = smin(d, ell(ax - 0.21, y - 0.658 - 0.012 * ck, z - 0.172, 0.07 * ck + 0.001, 0.055 * ck + 0.001, 0.06 * ck + 0.001), 0.06);
          return d;
        }
        // lips: the band (upper + lower fused) and a recessed dark mouth core; out[0] band, out[1] core, out[2] mouth-line dist
        function lipField(L) {
          const [UP, LO, ML] = lipPolys(L);
          const O = [0, 0, 0];
          function parts(x, y, z) {
            if (abs(x) > 0.36 || y < 0.44 || y > 0.76 || z < 0.06) { O[0] = O[1] = O[2] = 0.06; return O; }
            O[0] = smin(tube(UP, x, y, z, 1.25), tube(LO, x, y, z, 1.2), 0.013);
            O[2] = tube(ML, x, y, z, 1.0);
            O[1] = O[2];
            return O;
          }
          const f = (x, y, z) => { parts(x, y, z); return min(O[0], O[1]); };
          f.parts = parts; f.polys = [UP, LO, ML];
          return f;
        }
        function torsoF(x, y, z) {
          const ax = abs(x);
          const d = smin(E6(ax, y, z, G.torso), E6(ax, y, z, G.belly), 0.07);
          return smax(d, -y - 0.002, 0.04);
        }
        // legs (+x side; the field is mirrored)
        const legSkinF = (ax, y, z) => smin(cap(ax, y, z, G.Hp, G.K, 0.102, 0.084), cap(ax, y, z, G.K, G.A, 0.075, 0.06), 0.035);
        function bootF(ax, y, z) {
          const F = G.F;
          let d = ell(ax - F[0], y - F[1], z - F[2], 0.086, 0.064, 0.12);
          d = smin(d, cap(ax, y, z, [G.A[0], G.A[1] - 0.005, G.A[2] - 0.01], [F[0], F[1] + 0.01, F[2] - 0.035], 0.068, 0.074), 0.03);   // the boot shaft
          d = smin(d, ell(ax - F[0], y - 0.05, z - F[2] - 0.06, 0.07, 0.05, 0.07), 0.03);                                                  // a round toe cap
          return smax(d, -y, 0.012);
        }
        const soleF = (ax, y, z) => smax(bootF(ax, y, z) - 0.006, y - 0.022, 0.004);
        // arms (+x side), seated with the fist on the wheel rim
        const ARM = (() => {
          const S = G.S, El = G.El, Wr = G.Wr, H = G.H, T = WH.T, R = WH.rad, N = WH.nrm;
          const dS = v3.norm(v3.sub(El, S)), S0 = v3.add(S, dS, -0.05);
          const dF = v3.norm(v3.sub(Wr, El)), El0 = v3.add(El, dF, -0.04);
          const fistA = v3.add(v3.add(H, T, -0.03), R, 0.004), fistB = v3.add(v3.add(H, T, 0.03), R, 0.004);
          const knuckles = [-1.5, -0.5, 0.5, 1.5].map((k) => v3.add(v3.add(v3.add(H, T, k * 0.019), R, 0.026), N, 0.026));
          const thumbA = v3.add(v3.add(H, N, -0.034), T, 0.0), thumbB = v3.add(v3.add(v3.add(H, N, -0.036), T, 0.05), R, -0.012);
          return { S0, El, El0, dS, dF, fistA, fistB, knuckles, thumbA, thumbB };
        })();
        const sleeveF = (ax, y, z) => cap(ax, y, z, ARM.S0, G.El, 0.074, 0.067);
        function foreF(ax, y, z) {
          let d = cap(ax, y, z, ARM.El0, G.Wr, 0.056, 0.046);
          const dh = hypot(ax - G.H[0], y - G.H[1], z - G.H[2]);
          if (dh < 0.14) {
            let f = cap(ax, y, z, ARM.fistA, ARM.fistB, 0.045, 0.043);
            for (const k of ARM.knuckles) f = smin(f, hypot(ax - k[0], y - k[1], z - k[2]) - 0.019, 0.012);
            f = smin(f, cap(ax, y, z, ARM.thumbA, ARM.thumbB, 0.019, 0.016), 0.012);
            d = smin(d, f, 0.03);
          } else d = min(d, dh - 0.08);
          return d;
        }
        const eyeBallF = (ax, y, z) => hypot((ax - G.eye[0]) / G.eyeScale[0], y - G.eye[1], (z - G.eye[2]) / G.eyeScale[2]) - G.eyeR;
        // the whole figure, for ambient occlusion
        function makeAll(lipF) {
          return (x, y, z) => {
            const ax = abs(x);
            let d = headF(x, y, z, NEUTRAL_LIP);
            if (d < 0.08 && y > 0.44 && z > 0.06) d = min(d, lipF(x, y, z));
            d = min(d, eyeBallF(ax, y, z) - 0.005);
            d = min(d, torsoF(x, y, z));
            if (y < 0.45) d = min(d, min(legSkinF(ax, y, z), bootF(ax, y, z)));
            if (y > 0.18) d = min(d, min(sleeveF(ax, y, z), foreF(ax, y, z)));
            return d;
          };
        }

        /* ------------------------------------------------------------------ palette */
        function palette(THREE, jersey) {
          const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
          return {
            skin: c('#4FA03A'), skinDk: c('#3D8A2E'), belly: c('#8CCB5E'), lips: c('#97482A'), lipHi: c('#AD5A36'), lipDk: c('#5A2516'),
            mouth: c('#2A0F0C'), jersey: c(jersey), jerseyDk: c('#22488C'), trim: c('#F4F1E8'), lidLine: c('#24561C'), lid: c('#4A9A37'),
            tongue: c('#E9788A'), tongueDk: c('#C9566A'), tear: c('#B8E4FF'), white: c('#EDEDE6'), pupil: c('#0B0807'),
            flyBody: c('#2B2218'), flyGlow: c('#E6FF5C'), wing: c('#E6F2FF'), palm: c('#7CBE55'),
          };
        }
        const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

        /* ------------------------------------------------------------------ the materials: the roster's one toon and one eye (KR.mat) */
        const toonMaterial = (THREE, o) => root.mat.toon(THREE, o);
        const eyeMaterial = (THREE) => root.mat.eye(THREE, 'pepe');

        /* ------------------------------------------------------------------ the accumulator: P, N, C, K (vec4), B (bone) */
        class Acc {
          constructor() { this.P = []; this.N = []; this.C = []; this.K = []; this.B = []; this.I = []; this.n = 0; this.k = [0.4, 1, 0, 1]; this.bone = 0; }
          v(x, y, z, nx, ny, nz, r, g, b) {
            this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(r, g === undefined ? r : g, b === undefined ? r : b);
            this.K.push(this.k[0], this.k[1], this.k[2], this.k[3]); this.B.push(this.bone);
            return this.n++;
          }
        }
        const grad = (f, x, y, z, e, o) => {
          const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
          o = o || [0, 0, 0]; o[0] = a - b - c + d; o[1] = -a - b + c + d; o[2] = -a + b - c + d;
          const l = hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l; return o;
        };
        // drop the vertices of the last part that no kept triangle uses (the buried halves of the lips, legs, sleeves)
        function compactTail(acc, v0, t0) {
          const n = acc.n - v0, map = new Int32Array(n).fill(-1); let m = 0;
          for (let t = t0; t < acc.I.length; t++) { const k = acc.I[t] - v0; if (map[k] < 0) map[k] = m++; }
          if (m === n) return;
          const P = acc.P, N = acc.N, C = acc.C, K = acc.K, B = acc.B;
          const tmp = { P: P.slice(3 * v0), N: N.slice(3 * v0), C: C.slice(3 * v0), K: K.slice(4 * v0), B: B.slice(v0) };
          P.length = N.length = C.length = 3 * (v0 + m); K.length = 4 * (v0 + m); B.length = v0 + m;
          for (let k = 0; k < n; k++) {
            const j = map[k]; if (j < 0) continue;
            const d = v0 + j;
            for (let q = 0; q < 3; q++) { P[3 * d + q] = tmp.P[3 * k + q]; N[3 * d + q] = tmp.N[3 * k + q]; C[3 * d + q] = tmp.C[3 * k + q]; }
            for (let q = 0; q < 4; q++) K[4 * d + q] = tmp.K[4 * k + q];
            B[d] = tmp.B[k];
          }
          for (let t = t0; t < acc.I.length; t++) acc.I[t] = v0 + map[acc.I[t] - v0];
          acc.n = v0 + m;
        }
        // marching cubes one part, then pull every vertex onto the exact surface and take the analytic normal
        function mcPart(KIT, acc, sdf, box, h, mirror, colFn, keep, k, bone) {
          const v0 = acc.n, t0 = acc.I.length;
          acc.k = k; acc.bone = bone;
          const Gd = KIT.field(sdf, box, h, mirror);
          KIT.polygonize(Gd, acc, (x, y, z, ao, nx, ny, nz, v) => colFn(x, y, z, nx, ny, nz, v), keep || null, 0.01);
          compactTail(acc, v0, t0);
          const P = acc.P, N = acc.N, e = h * 0.12, g = [0, 0, 0];
          for (let v = v0; v < acc.n; v++) {
            let x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
            for (let it = 0; it < 2; it++) { const d = sdf(x, y, z); if (abs(d) < 1e-5) break; grad(sdf, x, y, z, e, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; }
            if (hypot(x - P[3 * v], y - P[3 * v + 1], z - P[3 * v + 2]) < h * 0.6) { P[3 * v] = x; P[3 * v + 1] = y; P[3 * v + 2] = z; }
            grad(sdf, P[3 * v], P[3 * v + 1], P[3 * v + 2], e, g); N[3 * v] = g[0]; N[3 * v + 1] = g[1]; N[3 * v + 2] = g[2];
          }
          return { v0, v1: acc.n, t0, t1: acc.I.length, evals: Gd.evals };
        }
        // mirror a part in x (the right arm/leg from the left)
        function mirrorPart(acc, r, bone) {
          const off = acc.n - r.v0, t0 = acc.I.length;
          for (let v = r.v0; v < r.v1; v++) {
            acc.k = [acc.K[4 * v], acc.K[4 * v + 1], acc.K[4 * v + 2], acc.K[4 * v + 3]]; acc.bone = bone;
            acc.v(-acc.P[3 * v], acc.P[3 * v + 1], acc.P[3 * v + 2], -acc.N[3 * v], acc.N[3 * v + 1], acc.N[3 * v + 2], acc.C[3 * v], acc.C[3 * v + 1], acc.C[3 * v + 2]);
          }
          for (let t = r.t0; t < r.t1; t += 3) acc.I.push(acc.I[t] + off, acc.I[t + 2] + off, acc.I[t + 1] + off);
          return { v0: r.v0 + off, v1: acc.n, t0, t1: acc.I.length };
        }
        // a THREE geometry (local) into the accumulator through matrix m, flat colour or colour function, kz, bone
        function addGeo(THREE, acc, geo, m, col, k, bone) {
          const pos = geo.attributes.position, nor = geo.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(m);
          const base = acc.n, v = new THREE.Vector3(), n = new THREE.Vector3(), flip = m.determinant() < 0;
          acc.k = k; acc.bone = bone;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
            const c = typeof col === 'function' ? col(v.x, v.y, v.z, n.x, n.y, n.z) : col;
            v.applyMatrix4(m); n.applyMatrix3(nm).normalize();
            acc.v(v.x, v.y, v.z, n.x, n.y, n.z, c[0], c[1], c[2]);
          }
          const idx = geo.index, cnt = idx ? idx.count : pos.count;
          for (let i = 0; i < cnt; i += 3) {
            const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
            if (flip) acc.I.push(base + a, base + c, base + b); else acc.I.push(base + a, base + b, base + c);
          }
        }
        // a tube with varying radius along a polyline: rx (side) / ry (up) half-widths per point; `upHint` orients the section
        function taperTube(THREE, pts, rx, ry, radial, upHint, capEnds) {
          const n = pts.length, P = [], N = [], I = [];
          const tan = (i) => v3.norm(v3.sub(pts[min(n - 1, i + 1)], pts[max(0, i - 1)]));
          for (let i = 0; i < n; i++) {
            const T = tan(i), sd = v3.norm(v3.cross(T, upHint)), up = v3.cross(sd, T);
            for (let j = 0; j < radial; j++) {
              const a = (j / radial) * PI * 2, ca = cos(a), sa = sin(a);
              P.push(...v3.add(v3.add(pts[i], sd, ca * rx[i]), up, sa * ry[i]));
              const kx = ca / max(rx[i], 1e-4), ky = sa / max(ry[i], 1e-4);   // the ellipse's normal
              N.push(...v3.norm([sd[0] * kx + up[0] * ky, sd[1] * kx + up[1] * ky, sd[2] * kx + up[2] * ky]));
            }
          }
          for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
            const a = i * radial + j, b = i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
            I.push(a, c, b, b, c, d);
          }
          if (capEnds) {
            for (const [ring, dir] of [[0, -1], [n - 1, 1]]) {
              const T = tan(ring), ci = P.length / 3; P.push(...pts[ring]); N.push(T[0] * dir, T[1] * dir, T[2] * dir);
              for (let j = 0; j < radial; j++) { const a = ring * radial + j, b = ring * radial + (j + 1) % radial; if (dir > 0) I.push(a, b, ci); else I.push(b, a, ci); }
            }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
          return g;
        }

        /* ------------------------------------------------------------------ LOD table (cell sizes tuned to the budgets) */
        const LEVELS = {
          desktop: { head: 0.031, lip: 0.0128, torso: 0.042, sleeve: 0.042, fore: 0.029, leg: 0.037, boot: 0.031, eye: [22, 10], lid: [18, 6], rim: [4, 18], crease: [8, 5], collar: [5, 26], cuff: [4, 16], extras: true, lower: true, morph: true, number: 2, tongue: 8, fly: [8, 5], lineSeg: 24, lineRad: 4 },
          phone:   { head: 0.0455, lip: 0.0182, torso: 0.06, sleeve: 0.062, fore: 0.041, leg: 0.052, boot: 0.044, eye: [16, 7], lid: [12, 4], rim: [3, 12], crease: [6, 3], collar: [4, 18], cuff: [3, 12], extras: true, lower: true, morph: true, number: 1, tongue: 6, fly: [6, 4], lineSeg: 16, lineRad: 3 },
          mid:     { head: 0.074, lip: 0.03, torso: 0.1, sleeve: 0.09, fore: 0.065, leg: 0.085, boot: 0.075, eye: [10, 4], lid: [8, 3], rim: [3, 8], crease: [4, 3], collar: [3, 10], cuff: [3, 6], extras: false, lower: false, morph: true, number: 0, tongue: 0, fly: [4, 3], lineSeg: 6, lineRad: 3 },
          far:     { far: true },
        };

        /* ------------------------------------------------------------------ bones */
        const BONES = ['root', 'body', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'legR', 'eyeL', 'eyeR', 'lidUL', 'lidLL', 'lidUR', 'lidLR', 'creaseL', 'creaseR', 'tear', 'tongue'];
        const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
        const PARENT = { body: 'root', head: 'body', armL: 'body', foreL: 'armL', armR: 'body', foreR: 'armR', legL: 'body', legR: 'body', eyeL: 'head', eyeR: 'head', lidUL: 'eyeL', lidLL: 'eyeL', lidUR: 'eyeR', lidLR: 'eyeR', creaseL: 'eyeL', creaseR: 'eyeR', tear: 'head', tongue: 'head' };
        const mirrorP = (p) => [-p[0], p[1], p[2]];
        const TEAR_AT = [-0.205, 0.77, 0.0], TONGUE_AT = [0.0, 0.574, 0.25];

        /* ------------------------------------------------------------------ build */
        function PepeFinal(THREE, KIT, detail, opts) {
          opts = opts || {};
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop;
          const C = palette(THREE, '#2E62B8');
          const toon = opts.toon || toonMaterial(THREE, opts);
          if (opts.jersey) toon.userData.uniforms.kJersey.value.set(opts.jersey);
          if (LV.far) return buildFar(THREE, C, toon, T0, now);

          const stats = { parts: {} };
          const acc = new Acc();
          const lipN = lipField(NEUTRAL_LIP);
          const ALL = makeAll(lipN);
          const aoAt = (x, y, z, nx, ny, nz, step) => {
            let occ = 0;
            for (let s = 1; s <= 4; s++) { const hs = s * step; occ += max(0, 1 - ALL(x + nx * hs, y + ny * hs, z + nz * hs) / hs) / s; }
            return sat(1 - 0.6 * max(0, occ - 0.1));
          };
          const aoStep = detail === 'mid' ? 0.03 : 0.02;
          const shade = (c, ao, lo) => mul3(c, (lo === undefined ? 0.5 : lo) + (1 - (lo === undefined ? 0.5 : lo)) * ao);
          const tpart = (name, r) => { stats.parts[name] = (stats.parts[name] || 0) + (r.t1 - r.t0) / 3; };
          let t = now();

          /* ---- head (skin) */
          const fHead = (x, y, z) => headF(x, y, z, NEUTRAL_LIP);
          const hd = mcPart(KIT, acc, fHead, [-0.36, 0.4, -0.27, 0.36, 1.0, 0.345], LV.head, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const top = sstep(0.74, 0.98, y) * 0.5 + sstep(-0.05, -0.25, z) * 0.3;
            let c = mix3(C.skin, C.skinDk, top);
            c = mix3(c, C.belly, sstep(0.09, 0.2, z) * sstep(0.535, 0.47, y) * 0.9);     // pale under the chin
            return shade(c, ao, 0.42);
          }, null, [0.35, 1, 0, 1], BI.head);
          tpart('head', hd);

          /* ---- lips: their own finer mesh riding on the face (a crisp paint line), buried parts dropped */
          const lipCol = (L, f) => (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep * 0.6); acc.K[4 * v + 3] = ao;
            const O = f.parts(x, y, z);
            if (O[1] < O[0] - 0.001) { acc.K[4 * v] = 0.6; acc.K[4 * v + 1] = 0; return shade(C.mouth, ao, 0.7); }
            const ym = lipPt(L, 2, clamp(x / L.span, -1, 1), [0, 0, 0])[1];
            let c = mix3(C.lips, C.lipHi, sstep(0.3, 0.9, ny) * (y > ym ? 0.45 : 0.2));
            c = mix3(c, C.lipDk, sstep(-0.2, -0.8, ny) * 0.35);                           // the undersides fall into shadow
            const crease = sstep(0.026, 0.008, O[2]);                                      // (the line itself is its own tube, below)
            acc.K[4 * v + 3] = ao * (1 - crease);                                          // (no sky rim inside the crease)
            return shade(c, ao, 0.3);
          };
          const lp = mcPart(KIT, acc, lipN, [-0.33, 0.47, 0.1, 0.33, 0.72, 0.37], LV.lip, true, lipCol(NEUTRAL_LIP, lipN),
            (x, y, z) => fHead(x, y, z) > -0.007, [0.42, 0.35, 0, 1], BI.head);
          // the line where the lips meet: a thin dark tube laid in the crease (crisp at every LOD; it morphs with the lips)
          {
            const ML = lipN.polys[2], pts = [], rad = [], n = LV.lineSeg;
            for (let i = 0; i <= n; i++) {
              const t = -0.985 + 1.97 * i / n, q = polyAt(ML, t, [0, 0, 0]);
              let z = q[2]; for (let k = 0; k < 60 && lipN(q[0], q[1], z) < 0; k++) z += 0.002;
              let lo = z - 0.002, hi = z; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (lipN(q[0], q[1], m) < 0) lo = m; else hi = m; }
              pts.push([q[0], q[1], lo - 0.0012]); rad.push(0.0042 * (1 - 0.5 * t ** 8));
            }
            const t0l = acc.I.length;
            addGeo(THREE, acc, taperTube(THREE, pts, rad, rad, LV.lineRad, [0, 1, 0], true), new THREE.Matrix4(), C.mouth, [0.5, 0, 0, 0], BI.head);
            lp.v1 = acc.n; lp.t1 = acc.I.length;
          }
          tpart('lips', lp);

          /* ---- torso (jersey) */
          const tr = mcPart(KIT, acc, torsoF, [-0.27, -0.01, -0.26, 0.27, 0.56, 0.25], LV.torso, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            return shade(mix3(C.jersey, C.jerseyDk, sstep(0.16, 0.02, y) * 0.55), ao, 0.4);
          }, (x, y, z) => fHead(x, y, z) > -0.03, [0.72, 0, 1, 1], BI.body);
          tpart('torso', tr);

          /* ---- legs (skin), boots (jersey zone), soles (white): the left leg, then mirrored */
          const legKeep = (x, y, z) => torsoF(x, y, z) > -0.012 && bootF(abs(x), y, z) > -0.012;
          const lgs = mcPart(KIT, acc, (x, y, z) => legSkinF(x, y, z), [0.0, -0.01, -0.09, 0.3, 0.32, 0.47], LV.leg, false, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            return shade(mix3(C.skin, C.belly, sstep(0.1, -0.6, ny) * 0.55), ao, 0.42);
          }, legKeep, [0.35, 1, 0, 1], BI.legL);
          const bt = mcPart(KIT, acc, (x, y, z) => bootF(x, y, z), [0.06, -0.01, 0.28, 0.28, 0.18, 0.6], LV.boot, false, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            return shade(mix3(C.jersey, [0.12, 0.25, 0.75], sstep(0.3, 0.9, ny) * 0.25), ao, 0.45);
          }, null, [0.4, 0, 1, 1], BI.legL);
          tpart('legs', lgs); tpart('boots', bt);
          const so = null;
          for (const r of [lgs, bt, so]) if (r) tpart(r === lgs ? 'legs' : r === bt ? 'boots' : 'soles', mirrorPart(acc, r, BI.legR));

          /* ---- arms: sleeve (jersey) on the upper-arm bone, forearm + fist (skin) on the forearm bone; then mirrored */
          const sl = mcPart(KIT, acc, sleeveF, [0.08, 0.2, -0.13, 0.38, 0.5, 0.25], LV.sleeve, false, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            return shade(C.jersey, ao, 0.42);
          }, (x, y, z) => torsoF(x, y, z) > -0.012, [0.72, 0, 1, 1], BI.armL);
          const fa = mcPart(KIT, acc, foreF, [0.04, 0.22, 0.05, 0.36, 0.48, 0.55], LV.fore, false, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const palm = sstep(0.0, -0.6, v3.dot([nx, ny, nz], WH.nrm)) * sstep(0.1, 0.06, hypot(x - G.H[0], y - G.H[1], z - G.H[2]));
            return shade(mix3(C.skin, C.palm, palm * 0.7), ao, 0.42);
          }, (x, y, z) => sleeveF(x, y, z) > -0.012, [0.35, 1, 0, 1], BI.foreL);
          tpart('arms', sl); tpart('arms', fa);
          tpart('arms', mirrorPart(acc, sl, BI.armR)); tpart('arms', mirrorPart(acc, fa, BI.foreR));
          stats.sdfMs = Math.round(now() - t); t = now();

          /* ---- trims: white collar, sleeve cuffs, sock rings (clean geometry, not vertex paint) */
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const qFrom = (dir) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(v3.norm(dir)));
          let t0 = acc.I.length;
          const kTrim = [0.6, 0, 0, 1];
          addGeo(THREE, acc, new THREE.TorusGeometry(0.139, 0.026, LV.collar[0], LV.collar[1]).rotateX(PI / 2).scale(1, 0.85, 0.94), M4().makeTranslation(0, 0.462, -0.03), C.trim, kTrim, BI.body);
          const cuffAt = (side) => {
            const S = side > 0 ? ARM.S0 : mirrorP(ARM.S0), El = side > 0 ? G.El : mirrorP(G.El), d = v3.norm(v3.sub(El, S));
            return M4().compose(V(v3.add(El, d, -0.008)), qFrom(d), new THREE.Vector3(1, 1, 1));
          };
          const cuffG = new THREE.TorusGeometry(0.068, 0.0165, LV.cuff[0], LV.cuff[1]);
          addGeo(THREE, acc, cuffG, cuffAt(1), C.trim, kTrim, BI.armL); addGeo(THREE, acc, cuffG, cuffAt(-1), C.trim, kTrim, BI.armR);
          const sockAt = (side) => {
            const Kp = side > 0 ? G.K : mirrorP(G.K), Ap = side > 0 ? G.A : mirrorP(G.A), d = v3.norm(v3.sub(Ap, Kp));
            return M4().compose(V(v3.add(Ap, d, -0.012)), qFrom(d), new THREE.Vector3(1, 1, 1));
          };
          const sockG = new THREE.TorusGeometry(0.069, 0.017, LV.cuff[0], LV.cuff[1]);
          addGeo(THREE, acc, sockG, sockAt(1), C.trim, kTrim, BI.legL); addGeo(THREE, acc, sockG, sockAt(-1), C.trim, kTrim, BI.legR);
          stats.parts.trims = (acc.I.length - t0) / 3;

          /* ---- the jersey number on the back (a crisp shape conformed to the torso), white */
          if (LV.number) {
            t0 = acc.I.length;
            const sh = new THREE.Shape();   // a bold, round-cornered 7
            const pts = [[-0.062, 0.078], [0.064, 0.078], [0.066, 0.048], [0.004, -0.078], [-0.04, -0.078], [0.018, 0.044], [-0.062, 0.044]];
            sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
            let g = new THREE.ShapeGeometry(sh);
            for (let s = 0; s < LV.number; s++) g = subdivide(THREE, g);
            const pos = g.attributes.position, gr = [0, 0, 0];
            for (let i = 0; i < pos.count; i++) {
              // the shape's plane faces -z (the back): u -> -x so it reads correctly from behind
              let x = -pos.getX(i), y = 0.305 + pos.getY(i), z = -0.15;
              for (let it = 0; it < 4; it++) { const d = torsoF(x, y, z); grad(torsoF, x, y, z, 0.002, gr); x -= gr[0] * d; y -= gr[1] * d; z -= gr[2] * d; }
              grad(torsoF, x, y, z, 0.002, gr);
              pos.setXYZ(i, x + gr[0] * 0.0035, y + gr[1] * 0.0035, z + gr[2] * 0.0035);
              g.attributes.normal.setXYZ(i, gr[0], gr[1], gr[2]);
            }
            // ShapeGeometry winds toward +z; after the x flip it faces -z already
            addGeo(THREE, acc, g, M4(), C.trim, [0.6, 0, 0, 1], BI.body);
            stats.parts.number = (acc.I.length - t0) / 3;
          }

          /* ---- eyes: one mesh on the head bone; lids + happy creases on bones */
          t0 = acc.I.length;
          const eyeQ = (side) => new THREE.Quaternion().setFromEuler(new THREE.Euler(G.tilt, side * G.splay, 0, 'YXZ'));
          const eyeM = (side) => M4().compose(V([side * G.eye[0], G.eye[1], G.eye[2]]), eyeQ(side), V(G.eyeScale));
          const lidR = G.eyeR + 0.0078, lidT = 0.0115;
          const lidCol = (x, y) => mix3(C.lid, C.skinDk, sstep(0.0, lidR, y) * 0.45);
          const upG = new THREE.SphereGeometry(lidR, LV.lid[0], LV.lid[1], 0, PI * 2, 0, PI / 2);
          const upRim = new THREE.TorusGeometry(lidR - lidT * 0.45, lidT * 0.62, LV.rim[0], LV.rim[1]).rotateX(PI / 2);
          const loR = lidR * 0.982;
          const loG = LV.lower ? new THREE.SphereGeometry(loR, LV.lid[0], max(3, LV.lid[1] - 3), 0, PI * 2, PI / 2, PI / 2) : null;
          const loRim = LV.lower ? new THREE.TorusGeometry(loR - lidT * 0.3, lidT * 0.42, 3, max(8, LV.rim[1] - 4)).rotateX(PI / 2) : null;
          // the happy closed-eye arc (feels good): an upturned crescent on the closed lid
          const creasePts = [];
          const ncr = LV.crease[0] > 6 ? 12 : 8; for (let i = 0; i <= ncr; i++) { const s = -1 + 2 * i / ncr; const d = v3.norm([0.66 * s, -0.08 + 0.2 * (1 - s * s), 1]); creasePts.push(v3.add([0, 0, 0], d, lidR + 0.004)); }
          const crG = taperTube(THREE, creasePts, creasePts.map((_, i) => 0.0062 * (0.55 + 0.45 * sin(PI * i / ncr))), creasePts.map((_, i) => 0.0062 * (0.55 + 0.45 * sin(PI * i / ncr))), LV.crease[0] > 6 ? 5 : 4, [0, 0, 1], true);
          for (const side of [1, -1]) {
            const m = eyeM(side), sfx = side > 0 ? 'L' : 'R';
            addGeo(THREE, acc, upG, m, (x, y) => lidCol(x, y), [0.35, 1, 0, 0.9], BI['lidU' + sfx]);
            addGeo(THREE, acc, upRim, m, C.lidLine, [0.4, 0.5, 0, 0.8], BI['lidU' + sfx]);
            if (loG) { addGeo(THREE, acc, loG, m, C.lid, [0.35, 1, 0, 0.9], BI['lidL' + sfx]); addGeo(THREE, acc, loRim, m, mix3(C.lidLine, C.lid, 0.4), [0.4, 0.5, 0, 0.8], BI['lidL' + sfx]); }
            addGeo(THREE, acc, crG, m, C.lidLine, [0.45, 0, 0, 1], BI['crease' + sfx]);
          }
          stats.parts.lids = (acc.I.length - t0) / 3;

          /* ---- tear (sad) and tongue + firefly (celebrate) */
          t0 = acc.I.length;
          let tearPos = null;
          if (LV.extras) {
            // the tear sits on the cheek under the character's right eye
            let z = 0.4; while (z > 0 && headF(TEAR_AT[0], TEAR_AT[1], z, NEUTRAL_LIP) > 0.014) z -= 0.002;
            tearPos = [TEAR_AT[0], TEAR_AT[1], z];
            const tg = new THREE.LatheGeometry([[0, -1], [0.55, -0.86], [0.82, -0.45], [0.66, 0.1], [0.3, 0.62], [0, 1.05]].map(([r, h]) => new THREE.Vector2(r * 0.019, h * 0.03)), 10);
            addGeo(THREE, acc, tg, M4().makeTranslation(...tearPos), C.tear, [0.06, 0, 0, 1], BI.tear);
            // tongue: a flat, wide pink ribbon with a spoon tip, out of the mouth and up to the right
            const tp = [[0.0, 0.574, 0.25], [0.035, 0.57, 0.33], [0.095, 0.575, 0.385], [0.155, 0.6, 0.405], [0.2, 0.645, 0.395], [0.222, 0.69, 0.37]];
            const curve = new THREE.CatmullRomCurve3(tp.map((p) => V(p)));
            const n = 14, cp = curve.getPoints(n).map((p) => [p.x, p.y, p.z]);
            const wid = cp.map((_, i) => { const u = i / n; return (0.024 + 0.012 * sstep(0.5, 0.85, u)) * sqrt(max(0.06, 1 - sstep(0.9, 1.0, u) ** 2)); });
            const thk = cp.map((_, i) => { const u = i / n; return 0.0095 * sqrt(max(0.1, 1 - sstep(0.88, 1.0, u) ** 2)); });
            const tongueG = taperTube(THREE, cp, wid, thk, LV.tongue, [0, 1, 0.4], true);
            addGeo(THREE, acc, tongueG, M4(), (x, y, z, nx, ny) => mix3(C.tongueDk, C.tongue, sstep(-0.3, 0.6, ny)), [0.32, 0.5, 0, 1], BI.tongue);
            // the firefly just ahead of the tip: dark body, glowing abdomen (zone 2 = emissive), pale wings
            const fp = v3.add(tp[tp.length - 1], [0.02, 0.048, 0.01]);
            const sph = (r, ws, hs) => new THREE.SphereGeometry(r, LV.fly[0], LV.fly[1]);
            addGeo(THREE, acc, sph(1, 8, 6), M4().compose(V(fp), new THREE.Quaternion(), V([0.011, 0.011, 0.019])), C.flyBody, [0.4, 0, 0, 1], BI.tongue);
            addGeo(THREE, acc, sph(1, 8, 6), M4().compose(V(v3.add(fp, [0, -0.004, -0.022])), new THREE.Quaternion(), V([0.014, 0.013, 0.018])), C.flyGlow, [0.5, 0, 2, 1], BI.tongue);
            addGeo(THREE, acc, sph(1, 6, 4), M4().compose(V(v3.add(fp, [0, 0.002, 0.018])), new THREE.Quaternion(), V([0.008, 0.008, 0.008])), C.flyBody, [0.4, 0, 0, 1], BI.tongue);
            for (const s of [1, -1]) addGeo(THREE, acc, sph(1, 8, 4), M4().compose(V(v3.add(fp, [s * 0.016, 0.012, -0.004])), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, s * 0.5)), V([0.018, 0.0025, 0.011])), C.wing, [0.2, 0, 0, 1], BI.tongue);
          }
          stats.parts.extras = (acc.I.length - t0) / 3;

          /* ---- geometry */
          const nv = acc.n;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
          for (let v = 0; v < nv; v++) { SI[4 * v] = acc.B[v]; SW[4 * v] = 1; }
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
          geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));
          stats.buildMs = Math.round(now() - t);

          /* ---- morph targets: head (cheeks) and lips (warped along the new lip curves, then re-projected) */
          t = now();
          const names = [];
          if (LV.morph && !(typeof window !== 'undefined' && window.KartDiag && window.KartDiag.nomorph)) {
            geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
            const NL = NEUTRAL_LIP, uN = [0, 0, 0], lN = [0, 0, 0], uE = [0, 0, 0], lE = [0, 0, 0], g = [0, 0, 0];
            for (const name of EXPR_NAMES) {
              const EL = EXPR[name].lip, lipE = lipField(EL), fE = (x, y, z) => headF(x, y, z, EL);
              const dP = new Float32Array(nv * 3), dN = new Float32Array(nv * 3);
              // head: only the cheeks change
              if (EL.cheek[0] > 0 || EL.cheek[1] > 0) for (let v = hd.v0; v < hd.v1; v++) {
                let x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
                if (z < 0.02 || y > 0.8 || y < 0.5) continue;
                const lvl = fHead(x, y, z); let d = fE(x, y, z) - lvl;
                if (abs(d) < 2e-5) continue;
                for (let it = 0; it < 3 && abs(d) > 1e-5; it++) { grad(fE, x, y, z, 0.0015, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; d = fE(x, y, z) - lvl; }
                grad(fE, x, y, z, 0.002, g);
                dP[3 * v] = x - acc.P[3 * v]; dP[3 * v + 1] = y - acc.P[3 * v + 1]; dP[3 * v + 2] = z - acc.P[3 * v + 2];
                dN[3 * v] = g[0] - acc.N[3 * v]; dN[3 * v + 1] = g[1] - acc.N[3 * v + 1]; dN[3 * v + 2] = g[2] - acc.N[3 * v + 2];
              }
              // lips: carry each vertex by the neutral -> expression lip-curve warp, then onto the expression's lip SDF
              for (let v = lp.v0; v < lp.v1; v++) {
                let x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
                const tt = clamp(x / NL.span, -1, 1);
                polyAt(lipN.polys[0], tt, uN); polyAt(lipN.polys[1], tt, lN); polyAt(lipE.polys[0], tt, uE); polyAt(lipE.polys[1], tt, lE);
                const a = (y - lN[1]) / (uN[1] - lN[1] || 1e-6), b = sstep(-0.2, 1.2, a);
                const sx = EL.span / NL.span;
                const lvl = lipN(x, y, z);
                x = x * sx; y += lerp(lE[1] - lN[1], uE[1] - uN[1], b); z += lerp(lE[2] - lN[2], uE[2] - uN[2], b);
                let d = lipE(x, y, z) - lvl;
                for (let it = 0; it < 3 && abs(d) > 1e-5; it++) { grad(lipE, x, y, z, 0.0012, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; d = lipE(x, y, z) - lvl; }
                grad(lipE, x, y, z, 0.0015, g);
                dP[3 * v] = x - acc.P[3 * v]; dP[3 * v + 1] = y - acc.P[3 * v + 1]; dP[3 * v + 2] = z - acc.P[3 * v + 2];
                dN[3 * v] = g[0] - acc.N[3 * v]; dN[3 * v + 1] = g[1] - acc.N[3 * v + 1]; dN[3 * v + 2] = g[2] - acc.N[3 * v + 2];
              }
              geo.morphAttributes.position.push(new THREE.Float32BufferAttribute(dP, 3));
              geo.morphAttributes.normal.push(new THREE.Float32BufferAttribute(dN, 3));
              names.push(name);
            }
            geo.morphTargetsRelative = true;
          }
          stats.morphMs = Math.round(now() - t);
          geo.computeBoundingSphere();

          /* ---- skeleton */
          const REST = {
            root: [0, 0, 0], body: [0, 0, 0], head: G.neck, armL: G.S, foreL: G.El, armR: mirrorP(G.S), foreR: mirrorP(G.El), legL: G.Hp, legR: mirrorP(G.Hp),
            eyeL: [G.eye[0], G.eye[1], G.eye[2]], eyeR: mirrorP(G.eye), lidUL: null, lidLL: null, lidUR: null, lidLR: null, creaseL: null, creaseR: null,
            tear: tearPos || TEAR_AT, tongue: TONGUE_AT,
          };
          const bones = {}, list = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; return b; });
          const worldOf = (n) => (REST[n] ? REST[n] : REST[PARENT[n]]);
          BONES.forEach((n) => {
            if (!PARENT[n]) return;
            const p = PARENT[n];
            if (n === 'eyeL' || n === 'eyeR') {
              const side = n === 'eyeL' ? 1 : -1, w = REST[n], pp = worldOf(p);
              bones[n].position.set(w[0] - pp[0], w[1] - pp[1], w[2] - pp[2]);
              bones[n].quaternion.copy(eyeQ(side)); bones[n].scale.set(...G.eyeScale);
            } else if (!REST[n]) { /* lids + creases: identity under the eye bone */ }
            else { const w = REST[n], pp = worldOf(p); bones[n].position.set(w[0] - pp[0], w[1] - pp[1], w[2] - pp[2]); }
            bones[p].add(bones[n]);
          });
          const mesh = new THREE.SkinnedMesh(geo, toon); mesh.name = 'pepe-skin';
          const group = new THREE.Group(); group.name = 'pepe-' + detail;
          group.add(bones.root); group.add(mesh);
          group.updateMatrixWorld(true);
          mesh.bind(new THREE.Skeleton(list));
          mesh.frustumCulled = false;
          if (names.length) { mesh.morphTargetDictionary = {}; names.forEach((k, i) => { mesh.morphTargetDictionary[k] = i; }); mesh.morphTargetInfluences = names.map(() => 0); }

          /* ---- eyeballs: one mesh on the head bone (front caps; the backs sit in the mounds) */
          const eyeG = new THREE.SphereGeometry(G.eyeR, LV.eye[0], LV.eye[1], 0, PI * 2, 0, PI * 0.62).rotateX(PI / 2);
          const EP = [], EN = [], EA = [], EI = [];
          for (const side of [1, -1]) {
            const m = eyeM(side), nm = new THREE.Matrix3().getNormalMatrix(m), p = eyeG.attributes.position, nr = eyeG.attributes.normal, b = EP.length / 3;
            const v = new THREE.Vector3(), n = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
              v.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
              EA.push(n.x, n.y, n.z, side);
              v.applyMatrix4(m); n.applyMatrix3(nm).normalize();
              EP.push(v.x - G.neck[0], v.y - G.neck[1], v.z - G.neck[2]); EN.push(n.x, n.y, n.z);
            }
            for (let i = 0; i < eyeG.index.count; i++) EI.push(b + eyeG.index.getX(i));
          }
          const eg = new THREE.BufferGeometry();
          eg.setAttribute('position', new THREE.Float32BufferAttribute(EP, 3)); eg.setAttribute('normal', new THREE.Float32BufferAttribute(EN, 3));
          eg.setAttribute('aEye', new THREE.Float32BufferAttribute(EA, 4)); eg.setIndex(EI);
          const eyeMat = opts.eyeMat || eyeMaterial(THREE);
          const eyes = new THREE.Mesh(eg, eyeMat); eyes.name = 'pepe-eyes';
          bones.head.add(eyes);

          const tris = acc.I.length / 3 + EI.length / 3;
          stats.parts.eyes = EI.length / 3;
          stats.tris = tris; stats.ms = Math.round(now() - T0); stats.verts = nv;
          group.userData.pepe = rig(THREE, { level: detail, bones, mesh, eyeMat, names, stats, toon, eyeQ });
          group.userData.stats = stats;
          return group;
        }

        // midpoint subdivision of an indexed (or not) geometry: each triangle -> 4
        function subdivide(THREE, g) {
          const p = g.attributes.position, idx = g.index ? Array.from(g.index.array) : [...Array(p.count).keys()];
          const P = Array.from(p.array), I = [], mid = new Map();
          const m = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; let r = mid.get(k); if (r === undefined) { r = P.length / 3; P.push((P[3 * a] + P[3 * b]) / 2, (P[3 * a + 1] + P[3 * b + 1]) / 2, (P[3 * a + 2] + P[3 * b + 2]) / 2); mid.set(k, r); } return r; };
          for (let i = 0; i < idx.length; i += 3) {
            const a = idx[i], b = idx[i + 1], c = idx[i + 2], ab = m(a, b), bc = m(b, c), ca = m(c, a);
            I.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
          }
          const o = new THREE.BufferGeometry();
          o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
          o.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(P.length), 3));
          o.setIndex(I);
          return o;
        }

        /* ------------------------------------------------------------------ far: snapped primitives, one mesh, matte */
        function buildFar(THREE, C, toon, T0, now) {
          const acc = new Acc(), M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const g = [0, 0, 0];
          // a sphere whose vertices are moved along their rays onto an SDF (star-shaped parts), with analytic normals
          const snap = (f, c, ws, hs, rmax, col, k) => {
            const s = new THREE.SphereGeometry(1, ws, hs), p = s.attributes.position, n = s.attributes.normal;
            for (let i = 0; i < p.count; i++) {
              const d = [p.getX(i), p.getY(i), p.getZ(i)];
              let lo = 0, hi = rmax;
              for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (f(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c, d, (lo + hi) / 2); p.setXYZ(i, q[0], q[1], q[2]);
              grad(f, q[0], q[1], q[2], 0.004, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            addGeo(THREE, acc, s, M4(), col, k, 0);
          };
          const kSkin = [0.62, 1, 0, 1], kCloth = [0.85, 0, 1, 1];
          const fHead = (x, y, z) => headF(x, y, z, NEUTRAL_LIP);
          snap(fHead, [0, 0.66, 0.02], 10, 7, 0.5, (x, y, z) => (y < 0.53 && z > 0.12 ? C.belly : C.skin), kSkin);
          snap(torsoF, [0, 0.25, -0.02], 8, 5, 0.4, C.jersey, kCloth);
          // lips: two tapered tubes on the lip curves
          const [UP, LO] = lipPolys(NEUTRAL_LIP);
          for (const [P, k] of [[UP, 1.12], [LO, 1.12]]) {
            const pts = [], r = [];
            for (let i = 0; i <= NSEG; i += 4) { pts.push([P[4 * i], P[4 * i + 1], P[4 * i + 2]]); r.push(P[4 * i + 3] * k); }
            addGeo(THREE, acc, taperTube(THREE, pts, r, r, 4, [0, 1, 0], false), M4(), C.lips, [0.6, 0.3, 0, 1], 0);
          }
          // eyes: white balls with the heavy lid painted on the upper rows, black pupils low-outer
          const eyeQ = (side) => new THREE.Quaternion().setFromEuler(new THREE.Euler(G.tilt, side * G.splay, 0, 'YXZ'));
          for (const side of [1, -1]) {
            const m = M4().compose(V([side * G.eye[0], G.eye[1], G.eye[2]]), eyeQ(side), V(G.eyeScale));
            const eg = new THREE.SphereGeometry(G.eyeR * 1.0, 6, 4);
            addGeo(THREE, acc, eg, m, C.white, [0.45, 0, 0, 1], 0);
            const lidM = m.clone().multiply(M4().makeRotationX(-0.02));
            addGeo(THREE, acc, new THREE.SphereGeometry(G.eyeR * 1.1, 6, 2, 0, PI * 2, 0, PI / 2), lidM, C.skin, [0.62, 1, 0, 1], 0);
            const pd = v3.norm([side * 0.2, -0.22, 1]);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 3), M4().multiplyMatrices(m, M4().compose(V(v3.add([0, 0, 0], pd, G.eyeR * 0.95)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(pd)), V([0.042, 0.042, 0.016]))), C.pupil, [0.5, 0, 0, 1], 0);
          }
          // limbs: open cylinders + fists + boots
          const cyl = (A, B, ra, rb, col, k) => {
            const d = v3.sub(B, A), L = hypot(...d), c = new THREE.CylinderGeometry(rb, ra, L, 5, 1, true);
            addGeo(THREE, acc, c, M4().compose(V(v3.add(A, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), V([1, 1, 1])), col, k, 0);
          };
          for (const s of [1, -1]) {
            const X = (p) => [s * p[0], p[1], p[2]];
            cyl(X(G.S), X(G.El), 0.07, 0.064, C.jersey, kCloth);
            cyl(X(G.El), X(G.Wr), 0.054, 0.046, C.skin, kSkin);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.052, 5, 3), M4().makeTranslation(...X(G.H)), C.skin, kSkin, 0);
            cyl(X(G.Hp), X(G.K), 0.1, 0.084, C.skin, kSkin);
            cyl(X(G.K), X(G.A), 0.074, 0.062, C.skin, kSkin);
            const bf = (x, y, z) => bootF(abs(x), y, z);
            snap(bf, X([G.F[0], G.F[1] + 0.02, G.F[2]]), 6, 4, 0.2, C.jersey, kCloth);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          geo.setIndex(acc.I);
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, toon); mesh.name = 'pepe-far';
          const group = new THREE.Group(); group.name = 'pepe-far'; group.add(mesh);
          const stats = { tris: acc.I.length / 3, ms: Math.round(now() - T0), verts: acc.n };
          group.userData.stats = stats;
          const sq = { k: 1, v: 0 };
          group.userData.pepe = {
            level: 'far', mesh, stats, names: [], bones: null,
            set() { return this; }, setExpression() { return this; }, setGaze() { return this; }, blink() { return this; }, steer() { return this; },
            squash(k) { sq.k = k; mesh.scale.set(1 / sqrt(k), k, 1 / sqrt(k)); return this; }, kick(v) { sq.v += v; },
            update(dt) { const a = -220 * (sq.k - 1) - 14 * sq.v; sq.v += a * dt; sq.k += sq.v * dt; mesh.scale.set(1 / sqrt(sq.k), sq.k, 1 / sqrt(sq.k)); },
            jersey(hex) { toon.userData.uniforms.kJersey.value.set(hex); },
          };
          return group;
        }

        /* ------------------------------------------------------------------ the live layer */
        function rig(THREE, o) {
          const B = o.bones, U = o.eyeMat.userData.uniforms;
          const st = { w: { smug: 0, feelsgood: 0, sad: 0, celebrate: 0 }, target: null, gaze: null, look: [0, 0], blink: 0, autoBlink: true, nextBlink: 2 + Math.random() * 3, blinkT: -1, sq: 1, sqV: 0, steer: 0 };
          const qa = new THREE.Quaternion(), qe = new THREE.Euler(), tv = new THREE.Vector3(), qi = new THREE.Quaternion();
          const qL = o.eyeQ(1), qR = o.eyeQ(-1);
          const n0 = EXPR.neutral;
          function blend(key) { let v = n0[key]; for (const k of EXPR_NAMES) v += st.w[k] * (EXPR[k][key] - n0[key]); return v; }
          function apply() {
            let lu = blend('lidU'), ll = blend('lidL'), roll = blend('roll');
            const tng = blend('tongue'), tear = blend('tear'), crease = blend('crease');
            let gx = n0.gaze[0], gy = n0.gaze[1];
            for (const k of EXPR_NAMES) { gx += st.w[k] * (EXPR[k].gaze[0] - n0.gaze[0]); gy += st.w[k] * (EXPR[k].gaze[1] - n0.gaze[1]); }
            if (st.gaze) { gx = st.gaze[0]; gy = st.gaze[1]; }
            gx += st.look[0]; gy += st.look[1];
            const b = st.blink;
            lu = lerp(lu, max(lu, 1.08), b); ll = lerp(ll, min(ll, 0.62), b);
            if (o.mesh.morphTargetInfluences) o.names.forEach((n, i) => { o.mesh.morphTargetInfluences[i] = st.w[n] || 0; });
            for (const [sfx, side] of [['L', 1], ['R', -1]]) {
              const zr = -side * roll;
              B['lidU' + sfx].quaternion.setFromEuler(qe.set(lu, 0, zr, 'ZYX'));
              if (B['lidL' + sfx]) B['lidL' + sfx].quaternion.setFromEuler(qe.set(ll, 0, zr * 0.3, 'ZYX'));
              B['crease' + sfx].scale.setScalar(max(1e-4, sstep(0.55, 0.95, crease)));
              // the gaze in head space (x = the character's left), into this eye's frame
              tv.set((gx + side * 0.05) * 0.75, gy * 0.75, 1).normalize();
              qi.copy(side > 0 ? qL : qR).invert(); tv.applyQuaternion(qi);
              (side > 0 ? U.uGazeL : U.uGazeR).value.copy(tv);
            }
            U.uLid.value = lu; U.uLidL.value = ll; U.uRoll.value = -roll;
            U.uPupil.value = 0.33 + 0.03 * blend('tongue');
            B.tear.scale.setScalar(max(1e-4, tear));
            B.tongue.scale.setScalar(max(1e-4, tng));
            // steering: the arms swing about the wheel axis, the head leads
            B.armL.rotation.set(0, 0, st.steer * 0.22); B.armR.rotation.set(0, 0, st.steer * 0.22);
            B.foreL.rotation.set(-st.steer * 0.25, 0, 0); B.foreR.rotation.set(st.steer * 0.25, 0, 0);
            B.head.rotation.set(-0.04 * tng, st.steer * 0.25, -st.steer * 0.06);
            B.body.rotation.set(0, 0, -st.steer * 0.05);
            B.root.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
          }
          const api = {
            level: o.level, bones: B, mesh: o.mesh, names: o.names, EXPR, stats: o.stats,
            set(weights) { for (const k of EXPR_NAMES) st.w[k] = weights && weights[k] ? weights[k] : 0; st.target = null; apply(); return api; },
            setExpression(name, instant) { st.target = name; if (instant) { for (const k of EXPR_NAMES) st.w[k] = k === name ? 1 : 0; apply(); } return api; },
            setGaze(x, y) { st.gaze = x === null || x === undefined ? null : [x, y]; apply(); return api; },
            look(x, y) { st.look[0] = x; st.look[1] = y; apply(); return api; },
            blink(v) { st.blink = v; st.autoBlink = v === undefined; apply(); return api; },
            squash(k) { st.sq = k; apply(); return api; },
            kick(v) { st.sqV += v; },
            steer(v) { st.steer = v; apply(); return api; },
            // auto blinks every 2-5 s (0.16 s), eased expressions, squash spring (stiffness 220, damping 14)
            update(dt) {
              if (st.target !== null) { const k = 1 - exp(-dt * 12); for (const n of EXPR_NAMES) st.w[n] += ((n === st.target ? 1 : 0) - st.w[n]) * k; }
              if (st.autoBlink && st.w.feelsgood < 0.5) {
                st.nextBlink -= dt;
                if (st.nextBlink <= 0 && st.blinkT < 0) { st.blinkT = 0; st.nextBlink = 2 + Math.random() * 3; }
                if (st.blinkT >= 0) { st.blinkT += dt; const u = st.blinkT / 0.16; st.blink = u < 0.4 ? u / 0.4 : max(0, 1 - (u - 0.4) / 0.6); if (u >= 1) { st.blinkT = -1; st.blink = 0; } }
              }
              const a = -220 * (st.sq - 1) - 14 * st.sqV; st.sqV += a * dt; st.sq += st.sqV * dt;
              apply();
            },
            jersey(hex) { o.toon.userData.uniforms.kJersey.value.set(hex); },
          };
          apply();
          return api;
        }

        PepeFinal.LEVELS = LEVELS; PepeFinal.EXPR = EXPR; PepeFinal.G = G; PepeFinal.WH = WH;
        PepeFinal.toonMaterial = toonMaterial; PepeFinal.eyeMaterial = eyeMaterial;
        PepeFinal.Acc = Acc; PepeFinal.mcPart = mcPart; PepeFinal.addGeo = addGeo; PepeFinal.taperTube = taperTube; PepeFinal.mirrorPart = mirrorPart;
        PepeFinal.util = { smin, smax, ell, cap, sstep, sat, clamp, lerp, mix3, mul3, grad, v3, subdivide };
        root.PepeFinal = PepeFinal;
      })(KR);

      /* Meme Kart: the Swamp Skimmer, Pepe's kart (scratch recipe, 6 Oct 2026). Original design, built in code.
       *
       *   SwampSkimmer(THREE, K, detail, opts) -> THREE.Group
       *     K      = the endo marching-cubes kit (endo-kit.js); needs PepeFinal (pepe.js) for the shared helpers + material
       *     detail = 'desktop' | 'phone' | 'mid' | 'far'      (budgets 12k / 6k / 2k / 0.5k triangles)
       *     opts   = { toon: <shared gm-kart-toon material>, wheel: { c, r, tilt } in seat space (default: Pepe's) }
       *
       * A flat-bottomed swamp airboat on four chunky wheels: a cream scow hull with a lotus-pink gunwale stripe, an open
       * cockpit with a leather coaming roll and bucket seat, a big water-lily leaf draped over the nose as the bonnet
       * (purple-red rim, raised veins, the notch facing the driver, a pink lotus on the tip), and a brass-caged airboat fan
       * at the back that spins with speed (a soft blur disc fades in at high rpm). The fan sits low so the chase camera
       * still sees the driver's shoulders and jersey number over it.
       *
       * Units metres, +Z forward, origin on the ground between the axles. group.userData.kart = {
       *   seat: [x, y, z] (where the driver's origin goes), animate(dt, { speed, steer }), tris, ms, parts, wheels, fan }
       * Draw calls: 1 body mesh + 1 fan mesh + 1 blur disc + 4 wheels (instanced across karts in the runtime).
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, atan2 } = Math;

        const LEVELS = {
          desktop: { hull: 0.058, leaf: [7, 48], lotus: [6, 4], wheel: [20, 4], fan: [5, 28], prop: [8, 2], tube: 7, box: 3, stripe: 56, coam: 36, spokes: 8, ties: true, steer: [7, 34], pipes: 9, cone: 12 },
          phone:   { hull: 0.083, leaf: [5, 32], lotus: [5, 3], wheel: [14, 3], fan: [4, 20], prop: [6, 1], tube: 5, box: 2, stripe: 36, coam: 22, spokes: 6, ties: false, steer: [5, 22], pipes: 6, cone: 8 },
          mid:     { hull: 0.14, leaf: [3, 16], lotus: [0, 0], wheel: [8, 2], fan: [3, 14], prop: [3, 1], tube: 3, box: 1, stripe: 12, coam: 12, spokes: 4, ties: false, steer: [3, 12], pipes: 0, cone: 5 },
          far:     { hull: 0.23, leaf: [2, 8], lotus: [0, 0], wheel: [6, 1], fan: [3, 8], prop: [2, 1], tube: 3, box: 1, stripe: 0, coam: 0, spokes: 0, ties: false, steer: null, pipes: 0, cone: 4, far: true },
        };
        const SEAT = [0, 0.33, -0.18];
        const COCK = { c: [0, 0.43, -0.06], h: [0.31, 0.2, 0.46], r: 0.07 };
        const FAN = { c: [0, 0.43, -0.98], r: 0.285 };
        const WHEELS = [   // x, z, radius, width
          [0.6, 0.6, 0.17, 0.15], [-0.6, 0.6, 0.17, 0.15], [0.63, -0.56, 0.215, 0.22], [-0.63, -0.56, 0.215, 0.22],
        ];

        function SwampSkimmer(THREE, KIT, detail, opts) {
          opts = opts || {};
          const P = root.PepeFinal, U = P.util, { sstep, mix3, mul3, smin, smax, v3, sat } = U;
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop;
          const toon = opts.toon || P.toonMaterial(THREE, opts);
          const col = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
          const C = {
            hull: col('#F3EBD8'), hullDk: col('#D9CBAE'), inside: col('#B8A07E'), stripe: col('#F07A9E'), stripeDk: col('#D9577F'),
            leaf: col('#6CAE3D'), leafDk: col('#4C8A2D'), vein: col('#A3D46C'), leafRim: col('#9A3A5E'), leafUnder: col('#7A3550'),
            lotus: col('#F7A8C4'), lotusTip: col('#E2567F'), lotusCore: col('#FFD54A'),
            leather: col('#5B3A25'), leatherHi: col('#7A5133'), piping: col('#EFE3C8'), rubber: col('#1D1E22'), tread: col('#2A2B31'),
            hub: col('#5FAE3E'), brass: col('#D8A945'), brassDk: col('#9C7426'), wood: col('#B5793F'), woodDk: col('#8A5428'),
            steel: col('#9AA3AD'), engine: col('#3A3F47'), chrome: col('#D9DEE4'), grip: col('#2D2F33'),
          };
          const K = { paint: [0.3, 0, 0, 1], rubber: [0.88, 0, 0, 1], brass: [0.28, 0, 0, 1], leaf: [0.42, 0.4, 0, 1], wood: [0.45, 0, 0, 1], leather: [0.6, 0.2, 0, 1], metal: [0.25, 0, 0, 1] };
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const Q = (x, y, z, o) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o || 'XYZ'));
          const ONE = V([1, 1, 1]);
          const parts = {};
          const body = new P.Acc();
          let mark = 0;
          const done = (name, acc) => { acc = acc || body; parts[name] = (parts[name] || 0) + (acc.I.length - mark) / 3; mark = acc.I.length; };

          /* ---- hull: a rounded scow box, the bow swept up, an open cockpit carved out (marching cubes, mirrored) */
          const rbox = (x, y, z, c, h, r) => {
            const qx = abs(x - c[0]) - h[0] + r, qy = abs(y - c[1]) - h[1] + r, qz = abs(z - c[2]) - h[2] + r;
            return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, max(qy, qz)), 0) - r;
          };
          const deckY = (z) => 0.465 - 0.16 * max(0, z - 0.35) - 0.5 * max(0, z - 0.7) ** 2;
          function hullF(x, y, z) {
            let d = rbox(x, y, z, [0, 0.315, -0.02], [0.47, 0.155, 0.8], 0.1);
            d = smax(d, (0.75 * (z - 0.4) - (y - 0.16)) / 1.25, 0.06);         // the bow swept up (a scow nose)
            d = smax(d, (y - deckY(z)) * 0.95, 0.04);                          // the deck sloping down to the nose
            d = smax(d, -rbox(x, y, z, COCK.c, COCK.h, COCK.r), 0.025);          // the cockpit
            return d;
          }
          const inCock = (x, y, z) => rbox(x, y, z, COCK.c, COCK.h, COCK.r);
          P.mcPart(KIT, body, hullF, [-0.6, 0.1, -0.92, 0.6, 0.52, 0.88], LV.hull, true, (x, y, z, nx, ny, nz, v) => {
            const inside = sstep(0.02, -0.03, inCock(x, y, z));
            let c = mix3(C.hull, C.hullDk, sstep(0.0, -0.8, ny) * 0.6);
            c = mix3(c, C.inside, inside);
            return mul3(c, 0.9 + 0.1 * ny);
          }, null, K.paint, 0);
          done('hull');

          // project a point onto the hull and push it out a little (for the stripe and the coaming)
          const onHull = (p, off) => {
            let [x, y, z] = p; const g = [0, 0, 0];
            for (let i = 0; i < 6; i++) { const d = hullF(x, y, z); U.grad(hullF, x, y, z, 0.003, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; }
            U.grad(hullF, x, y, z, 0.003, g);
            return [x + g[0] * off, y + g[1] * off, z + g[2] * off];
          };
          /* ---- the lotus-pink gunwale stripe: a flat ribbon wrapped round the hull sides and bow */
          if (LV.stripe) {
            const pts = [];
            const n = LV.stripe;
            for (let i = 0; i <= n; i++) {
              // straight sides, a round bow: s runs -1 (left rear) .. 0 (bow) .. 1 (right rear)
              const s = -1 + 2 * i / n;
              let x, z;
              if (abs(s) < 0.62) { const k = abs(s) / 0.62; x = Math.sign(s) * 0.62 * sin(k * PI * 0.5); z = 0.8 - 0.18 * (1 - cos(k * PI * 0.5)); }
              else { const k = (abs(s) - 0.62) / 0.38; x = Math.sign(s) * 0.62; z = 0.62 - 1.4 * k; }
              const y = 0.385 + 0.06 * sstep(0.3, 0.8, z);
              pts.push(onHull([x, y, z], 0.004));
            }
            const g = P.taperTube(THREE, pts, pts.map(() => 0.004), pts.map(() => 0.028), 4, [1, 0, 0], false);
            // (the section's "up" follows the hull: re-orient each ring by the surface normal)
            const pos = g.attributes.position, nor = g.attributes.normal, gr = [0, 0, 0];
            for (let i = 0; i < pts.length; i++) {
              const p = pts[i]; U.grad(hullF, p[0], p[1], p[2], 0.003, gr);
              const T = v3.norm(v3.sub(pts[min(pts.length - 1, i + 1)], pts[max(0, i - 1)]));
              const up = v3.norm(v3.cross(T, gr));
              for (let j = 0; j < 4; j++) {
                const a = (j / 4) * PI * 2, ca = cos(a), sa = sin(a);
                const q = v3.add(v3.add(p, gr, ca * 0.004), up, sa * 0.028 * (up[1] < 0 ? -1 : 1));
                pos.setXYZ(i * 4 + j, q[0], q[1], q[2]);
                const nn = v3.norm(v3.add(v3.add([0, 0, 0], gr, ca / 0.004), up, sa / 0.028 * (up[1] < 0 ? -1 : 1)));
                nor.setXYZ(i * 4 + j, nn[0], nn[1], nn[2]);
              }
            }
            P.addGeo(THREE, body, g, M4(), C.stripe, K.paint, 0);
            done('stripe');
          }

          /* ---- the cockpit coaming roll (leather), following the deck */
          if (LV.coam) {
            const pts = [], n = LV.coam, hx = COCK.h[0] - 0.005, z0 = COCK.c[2] - COCK.h[2] + 0.01, z1 = COCK.c[2] + COCK.h[2] - 0.01, rr = 0.09;
            for (let i = 0; i <= n; i++) {
              const u = i / n, per = 2 * (2 * hx + (z1 - z0)), s = u * per;
              // a rounded rectangle walked by arc length (corners approximated by a superellipse)
              const a = (u * PI * 2) - PI / 2, ca = cos(a), sa = sin(a);
              const x = hx * Math.sign(ca) * abs(ca) ** 0.25, z = (z0 + z1) / 2 + (z1 - z0) / 2 * Math.sign(sa) * abs(sa) ** 0.25;
              pts.push([x, deckY(z) + 0.004, z]);
            }
            P.addGeo(THREE, body, P.taperTube(THREE, pts, pts.map(() => 0.03), pts.map(() => 0.024), LV.tube, [0, 1, 0], false), M4(), C.leather, K.leather, 0);
            done('coaming');
          }

          /* ---- seat: a padded bucket in brown leather with cream piping */
          const rboxG = (w, h, d, r, seg) => {
            const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal;
            const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
            for (let i = 0; i < p.count; i++) {
              const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
              const cx = max(-ix, min(ix, x)), cy = max(-iy, min(iy, y)), cz = max(-iz, min(iz, z));
              const dx = x - cx, dy = y - cy, dz = z - cz, l = hypot(dx, dy, dz) || 1;
              p.setXYZ(i, cx + dx / l * r, cy + dy / l * r, cz + dz / l * r); n.setXYZ(i, dx / l, dy / l, dz / l);
            }
            return g;
          };
          const seatY = SEAT[1];
          P.addGeo(THREE, body, rboxG(0.5, 0.08, 0.44, 0.035, LV.box), M4().makeTranslation(0, seatY - 0.04, SEAT[2] - 0.02), (x, y) => mix3(C.leather, C.leatherHi, sstep(0, 0.04, y)), K.leather, 0);
          P.addGeo(THREE, body, rboxG(0.54, 0.26, 0.075, 0.034, LV.box), M4().compose(V([0, seatY + 0.09, SEAT[2] - 0.29]), Q(-0.14, 0, 0), ONE), (x, y, z) => mix3(C.leather, C.leatherHi, sstep(-0.02, 0.03, z) * 0.6), K.leather, 0);
          if (LV.stripe) P.addGeo(THREE, body, new THREE.TorusGeometry(0.115, 0.012, 3, max(6, LV.stripe >> 1), PI).rotateZ(0), M4().compose(V([0, seatY + 0.105, SEAT[2] - 0.252]), Q(-0.14, 0, 0), V([2.05, 1, 1])), C.piping, K.leather, 0);
          done('seat');

          /* ---- steering: column, wheel (rim, three spokes, a lily hub) as its own sub-mesh so it can turn */
          const W = opts.wheel || (P.G && P.G.wheel) || { c: [0, 0.335, 0.425], r: 0.138, tilt: 0.5 };
          const wc = v3.add(SEAT, W.c), nrm = [0, -sin(W.tilt), cos(W.tilt)];
          if (LV.steer) {
            const end = v3.add(wc, nrm, 0.36);
            const d = v3.sub(end, wc), L = hypot(...d);
            P.addGeo(THREE, body, new THREE.CylinderGeometry(0.02, 0.026, L, LV.tube, 1, true), M4().compose(V(v3.add(wc, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), ONE), C.steel, K.metal, 0);
            done('column');
          }
          const wheelAcc = new P.Acc();
          if (LV.steer) {
            const mark0 = 0;
            P.addGeo(THREE, wheelAcc, new THREE.TorusGeometry(W.r, 0.017, LV.steer[0], LV.steer[1]), M4(), C.grip, K.rubber, 0);
            for (let k = 0; k < 3; k++) {
              const a = -PI / 2 + k * (2 * PI / 3), d = [cos(a), sin(a), 0];
              const A = v3.add([0, 0, 0], d, 0.03), B = v3.add([0, 0, 0], d, W.r - 0.01), L = hypot(...v3.sub(B, A));
              P.addGeo(THREE, wheelAcc, new THREE.CylinderGeometry(0.009, 0.012, L, max(3, LV.tube - 2), 1, true), M4().compose(V(v3.add(A, d, L / 2)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(d)), ONE), C.steel, K.metal, 0);
            }
            P.addGeo(THREE, wheelAcc, new THREE.CylinderGeometry(0.042, 0.046, 0.03, LV.cone, 1).rotateX(PI / 2), M4(), (x, y, z) => (z > 0.01 ? C.hub : C.steel), K.paint, 0);
            parts.steering = wheelAcc.I.length / 3 - mark0;
          }

          /* ---- the lily-leaf bonnet: a domed pad with raised veins, an up-turned purple-red rim, the notch toward the driver */
          {
            const [rings, sectors] = LV.leaf, R = 0.5, notch = 0.24, th = 0.014, LZ = 0.56;
            const nAng = sectors - (sectors % 4), under = LV.far ? 1 : Math.min(2, rings);
            const ringU = (i) => 1 - (1 - i / rings) ** 1.45;   // denser toward the rim
            const surf = (u, phi, vein, top) => {
              const r = max(u, 0.004) * R, x = sin(phi) * r, z = LZ - cos(phi) * r;
              // draped over the hull: follows the deck, droops over the sides and the bow, a slightly raised rim
              let y = deckY(min(z, 0.95)) + 0.03 + 0.035 * (1 - u * u) - 2.6 * max(0, abs(x) - 0.33) ** 2 - 0.9 * max(0, z - 0.95) + 0.016 * sstep(0.86, 1.0, u);
              y += top ? 0.005 * vein * sstep(0.05, 0.3, u) : -th * (1 - sstep(0.97, 1.0, u));
              return [x, y, z];
            };
            const Pp = [], Cc = [], Ii = [];
            const topIdx = (i, j) => i * (nAng + 1) + j, nTop = (rings + 1) * (nAng + 1);
            const botIdx = (i, j) => nTop + (i - (rings - under)) * (nAng + 1) + j;
            for (let i = 0; i <= rings; i++) for (let j = 0; j <= nAng; j++) {
              const u = ringU(i), phi = notch + (j / nAng) * (2 * PI - 2 * notch), vein = j % 4 === 0 && j > 0 && j < nAng ? 1 : 0;
              Pp.push(...surf(u, phi, vein, true));
              let c = mix3(C.leaf, C.leafDk, sstep(0.3, 1.0, u) * 0.45 + 0.25 * (1 - u));
              c = mix3(c, C.vein, vein * 0.8 * sstep(0.05, 0.3, u) * (1 - sstep(0.85, 0.97, u)));
              if (i === rings) c = rings > 3 ? C.leafRim : C.leafDk;
              Cc.push(...c);
            }
            for (let i = rings - under; i <= rings; i++) for (let j = 0; j <= nAng; j++) {
              const u = ringU(i), phi = notch + (j / nAng) * (2 * PI - 2 * notch);
              Pp.push(...surf(u, phi, 0, false)); Cc.push(...(i === rings && rings > 3 ? C.leafRim : C.leafUnder));
            }
            for (let i = 0; i < rings; i++) for (let j = 0; j < nAng; j++) {
              const a = topIdx(i, j), b = topIdx(i, j + 1), c = topIdx(i + 1, j), d = topIdx(i + 1, j + 1);
              Ii.push(a, c, b, b, c, d);
            }
            for (let i = rings - under; i < rings; i++) for (let j = 0; j < nAng; j++) {
              const a = botIdx(i, j), b = botIdx(i, j + 1), c = botIdx(i + 1, j), d = botIdx(i + 1, j + 1);
              Ii.push(a, b, c, b, d, c);
            }
            // the rim edge and the two notch edges (top to underside)
            for (let j = 0; j < nAng; j++) { const a = topIdx(rings, j), b = topIdx(rings, j + 1), c = botIdx(rings, j), d = botIdx(rings, j + 1); Ii.push(a, b, c, b, d, c); }
            for (let i = rings - under; i < rings; i++) for (const [j, flip] of [[0, true], [nAng, false]]) {
              const a = topIdx(i, j), b = topIdx(i + 1, j), c = botIdx(i, j), d = botIdx(i + 1, j);
              if (flip) Ii.push(a, b, c, b, d, c); else Ii.push(a, c, b, b, c, d);
            }
            for (let i = 0; i < Ii.length; i += 3) { const t = Ii[i + 1]; Ii[i + 1] = Ii[i + 2]; Ii[i + 2] = t; }   // (wound to face out)
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setIndex(Ii);
            g.computeVertexNormals();
            const cols = Cc;
            P.addGeo(THREE, body, g, M4(), (() => { let k = 0; return () => { const c = [cols[3 * k], cols[3 * k + 1], cols[3 * k + 2]]; k++; return c; }; })(), K.leaf, 0);
            done('leaf');
            // a pink lotus on the tip
            if (LV.lotus[0]) {
              const base = [0, deckY(0.95) + 0.05, 0.98], petal = new THREE.SphereGeometry(1, LV.lotus[0], LV.lotus[1]);
              for (let ring2 = 0; ring2 < 2; ring2++) for (let k = 0; k < 6; k++) {
                const a = (k / 6) * PI * 2 + ring2 * 0.5, tilt = ring2 ? 0.5 : 0.95;
                const q = Q(0, a, 0, 'YXZ').multiply(Q(-tilt, 0, 0));
                const m = M4().compose(V(base), q, ONE).multiply(M4().compose(V([0, 0.045, 0.0]), new THREE.Quaternion(), V([0.026, 0.05, 0.012])));
                P.addGeo(THREE, body, petal, m, (x, y) => mix3(C.lotus, C.lotusTip, sstep(0.2, 1.0, y)), K.paint, 0);
              }
              P.addGeo(THREE, body, new THREE.SphereGeometry(0.022, LV.lotus[0], LV.lotus[1]), M4().makeTranslation(base[0], base[1] + 0.03, base[2]), C.lotusCore, [0.5, 0, 0, 1], 0);
              done('lotus');
            }
          }

          /* ---- engine on the rear deck, two chrome exhausts */
          {
            P.addGeo(THREE, body, rboxG(0.34, 0.16, 0.22, 0.04, LV.box), M4().makeTranslation(0, 0.53, -0.7), C.engine, K.metal, 0);
            if (!LV.far) for (const s of [1, -1]) P.addGeo(THREE, body, rboxG(0.1, 0.07, 0.15, 0.025, LV.box), M4().compose(V([s * 0.15, 0.6, -0.7]), Q(0, 0, s * 0.5), ONE), C.brass, K.brass, 0);
            if (LV.pipes) for (const s of [1, -1]) {
              const pts = [[s * 0.17, 0.52, -0.62], [s * 0.25, 0.5, -0.64], [s * 0.3, 0.52, -0.74], [s * 0.32, 0.57, -0.84], [s * 0.33, 0.6, -0.88]];
              const curve = new THREE.CatmullRomCurve3(pts.map(V)), cp = curve.getPoints(LV.pipes).map((p) => [p.x, p.y, p.z]);
              P.addGeo(THREE, body, P.taperTube(THREE, cp, cp.map(() => 0.026), cp.map(() => 0.026), LV.tube, [0, 0, 1], false), M4(), C.chrome, K.metal, 0);
            }
            // the prop shaft
            P.addGeo(THREE, body, new THREE.CylinderGeometry(0.03, 0.03, 0.2, LV.tube, 1, true).rotateX(PI / 2), M4().makeTranslation(0, FAN.c[1], -0.86), C.steel, K.metal, 0);
            done('engine');
          }

          /* ---- the fan cage: brass rings, spokes and struts */
          {
            const [tr, ts] = LV.fan, Rc = FAN.r, c = FAN.c;
            const ring = (r, tube, z, segs) => P.addGeo(THREE, body, new THREE.TorusGeometry(r, tube, tr, segs || ts), M4().makeTranslation(c[0], c[1], c[2] + z), C.brass, K.brass, 0);
            ring(Rc, 0.022, 0.06); if (!LV.far) ring(Rc, 0.017, -0.07);
            if (LV.spokes >= 6) { ring(Rc * 0.66, 0.008, -0.075, max(10, ts - 8)); ring(Rc * 0.33, 0.008, -0.075, max(8, ts - 14)); }
            const nsp = LV.spokes;
            for (let k = 0; k < nsp; k++) {
              const a = (k / nsp) * PI * 2 + PI / 8, d = [cos(a), sin(a), 0], L = Rc - 0.03;
              P.addGeo(THREE, body, new THREE.CylinderGeometry(0.007, 0.007, L, 3, 1, true), M4().compose(V(v3.add(v3.add(c, [0, 0, -0.075]), d, 0.03 + L / 2)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(d)), ONE), C.brassDk, K.brass, 0);
            }
            // ties between the two rings, and struts down to the hull
            for (let k = 0; k < (LV.ties ? 8 : 0); k++) {
              const a = (k / 8) * PI * 2, p = v3.add(c, [cos(a) * Rc, sin(a) * Rc, -0.005]);
              P.addGeo(THREE, body, new THREE.CylinderGeometry(0.009, 0.009, 0.13, 3, 1, true).rotateX(PI / 2), M4().makeTranslation(...p), C.brassDk, K.brass, 0);
            }
            if (!LV.far) for (const s of [1, -1]) {
              const A = [s * 0.27, 0.43, -0.72], B = v3.add(c, [s * Rc * 0.72, -Rc * 0.69, 0.06]), d = v3.sub(B, A), L = hypot(...d);
              P.addGeo(THREE, body, new THREE.CylinderGeometry(0.016, 0.02, L, LV.tube, 1, true), M4().compose(V(v3.add(A, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), ONE), C.steel, K.metal, 0);
            }
            done('cage');
          }

          /* ---- axles */
          if (!LV.far) for (const [z, y] of [[0.6, 0.17], [-0.56, 0.215]]) P.addGeo(THREE, body, new THREE.CylinderGeometry(0.022, 0.022, 1.2, LV.tube, 1, true).rotateZ(PI / 2), M4().makeTranslation(0, y, z), C.steel, K.metal, 0);
          done('axles');

          /* ---- meshes */
          const toMesh = (acc, name, Mesh) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3)); g.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
            g.setIndex(acc.n > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));
            g.computeBoundingSphere();
            const m = new (Mesh || THREE.Mesh)(g, toon); m.name = name; return m;
          };
          const group = new THREE.Group(); group.name = 'swamp-skimmer-' + detail;
          group.add(toMesh(body, 'skimmer-body'));
          const steer = new THREE.Group(); steer.position.set(...wc); steer.quaternion.setFromEuler(new THREE.Euler(W.tilt, 0, 0));
          const steerSpin = toMesh(wheelAcc, 'skimmer-steering'); steer.add(steerSpin); group.add(steer);

          /* ---- the propeller: three varnished blades with lily-green tips, a hub; and a soft blur disc */
          const propAcc = new P.Acc();
          {
            const [segR, segC] = LV.prop, nB = 3;
            for (let b = 0; b < nB; b++) {
              const a0 = (b / nB) * PI * 2, Pp = [], Ii = [], Cc = [];
              const nr = segR, nc = segC + 1;
              for (let i = 0; i <= nr; i++) {
                const u = i / nr, r = 0.05 + u * (FAN.r - 0.075), chord = 0.1 * (1 - 0.45 * u) * sqrt(max(0.15, 1 - (u > 0.9 ? ((u - 0.9) / 0.1) ** 2 : 0))), twist = 0.65 - 0.4 * u;
                for (let side = 0; side < 2; side++) for (let j = 0; j <= nc; j++) {
                  const w = -1 + 2 * j / nc, t = 0.007 * (1 - w * w) + 0.0015;
                  const lx = w * chord / 2, lz = (side ? -1 : 1) * t;
                  const cx = lx * cos(twist) - lz * sin(twist), cz = lx * sin(twist) + lz * cos(twist);
                  const x = r * cos(a0) - cx * sin(a0), y = r * sin(a0) + cx * cos(a0);
                  Pp.push(x, y, cz);
                  Cc.push(...(u > 0.82 ? C.hub : mix3(C.wood, C.woodDk, abs(w) * 0.5)));
                }
              }
              const row = (nc + 1) * 2;
              for (let i = 0; i < nr; i++) for (let side = 0; side < 2; side++) for (let j = 0; j < nc; j++) {
                const a = i * row + side * (nc + 1) + j, b2 = a + 1, c = a + row, d = c + 1;
                if (side) Ii.push(a, b2, c, b2, d, c); else Ii.push(a, c, b2, b2, c, d);
              }
              for (let i = 0; i < nr; i++) for (const j of [0, nc]) { const a = i * row + j, b2 = a + (nc + 1), c = a + row, d = b2 + row; if (j) Ii.push(a, c, b2, b2, c, d); else Ii.push(a, b2, c, b2, d, c); }
              const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setIndex(Ii); g.computeVertexNormals();
              let k = 0; P.addGeo(THREE, propAcc, g, M4(), () => { const c = [Cc[3 * k], Cc[3 * k + 1], Cc[3 * k + 2]]; k++; return c; }, K.wood, 0);
            }
            P.addGeo(THREE, propAcc, new THREE.ConeGeometry(0.06, 0.12, LV.cone, 1).rotateX(-PI / 2), M4().makeTranslation(0, 0, 0.02), (x, y, z) => (z < -0.02 ? C.brass : C.lotusTip), K.paint, 0);
          }
          const fan = toMesh(propAcc, 'skimmer-fan'); fan.position.set(...FAN.c);
          group.add(fan);
          // (a flat disc: drawn once, not back then front, a draw call saved)
          const blurMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#C9A06A'), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
          const blur = new THREE.Mesh(new THREE.RingGeometry(0.06, FAN.r - 0.03, LV.fan[1], 1), blurMat); blur.name = 'skimmer-fan-blur';
          blur.position.set(FAN.c[0], FAN.c[1], FAN.c[2] + 0.005); blur.visible = false; group.add(blur);

          /* ---- wheels: a rounded tyre (lathe) with a green lily hubcap */
          const wheelMeshes = [];
          const wheelGeo = (R, Wd) => {
            const acc = new P.Acc(), [seg, st] = LV.wheel, h = Wd / 2, rr = min(0.06, h * 0.75);
            const prof = [];
            prof.push([R * 0.58, -h * 0.92]);
            for (let k = 0; k <= st; k++) { const a = -PI / 2 + (k / st) * (PI / 2); prof.push([R - rr + rr * cos(a), -h + rr + rr * sin(a)]); }
            for (let k = 0; k <= st; k++) { const a = (k / st) * (PI / 2); prof.push([R - rr + rr * cos(a), h - rr + rr * sin(a)]); }
            prof.push([R * 0.58, h * 0.92]);
            if (LV.far) { P.addGeo(THREE, acc, new THREE.CylinderGeometry(R, R, Wd, seg + 1, 1).rotateZ(PI / 2), M4(), C.rubber, K.rubber, 0); return acc; }
            const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg).rotateZ(PI / 2);
            P.addGeo(THREE, acc, lathe, M4(), (x, y, z) => (hypot(y, z) > R - 0.012 ? C.tread : C.rubber), K.rubber, 0);
            for (const s of [1, -1]) {
              const cap = new THREE.CircleGeometry(R * 0.6, seg).rotateY(s * PI / 2);
              P.addGeo(THREE, acc, cap, M4().makeTranslation(s * h * 0.86, 0, 0), C.hub, K.paint, 0);
              if (!LV.far) P.addGeo(THREE, acc, new THREE.ConeGeometry(R * 0.2, 0.035, max(5, seg >> 1), 1, true).rotateZ(-s * PI / 2), M4().makeTranslation(s * (h * 0.86 + 0.017), 0, 0), C.brass, K.brass, 0);
            }
            return acc;
          };
          const wheelAccs = {};
          for (const [x, z, R, Wd] of WHEELS) {
            const key = R + '_' + Wd; if (!wheelAccs[key]) wheelAccs[key] = wheelGeo(R, Wd);
            const pivot = new THREE.Group(); pivot.position.set(x, R, z);
            const m = toMesh(wheelAccs[key], 'skimmer-wheel'); m.geometry = m.geometry; pivot.add(m); group.add(pivot);
            wheelMeshes.push({ pivot, mesh: m, R, front: z > 0 });
          }

          let tris = 0; group.traverse((o) => { if (o.isMesh && o !== blur) tris += o.geometry.index.count / 3; });
          parts.fan = propAcc.I.length / 3;
          parts.wheels = wheelMeshes.reduce((a, w) => a + w.mesh.geometry.index.count / 3, 0);
          const state = { fanA: 0, rpm: 0 };
          group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          blur.castShadow = false;
          group.userData.kart = {
            seat: SEAT.slice(), level: detail, tris, ms: Math.round(now() - T0), parts, wheels: wheelMeshes, fan, blur, steering: steerSpin,
            // speed in m/s (+ forward), steer -1..1
            animate(dt, o) {
              const v = o.speed || 0, s = o.steer || 0;
              for (const w of wheelMeshes) { w.mesh.rotation.x += (v / w.R) * dt; if (w.front) w.pivot.rotation.y = s * 0.42; }
              steerSpin.rotation.z = -s * 1.4;
              state.rpm += ((6 + abs(v) * 2.6) - state.rpm) * (1 - Math.exp(-dt * 3));
              state.fanA += state.rpm * dt; fan.rotation.z = state.fanA;
              const k = sat((state.rpm - 30) / 40);
              blur.visible = k > 0.01; blurMat.opacity = 0.42 * k;
            },
          };
          return group;
        }

        SwampSkimmer.LEVELS = LEVELS; SwampSkimmer.SEAT = SEAT;
        root.SwampSkimmer = SwampSkimmer;
      })(KR);

      /* Meme Kart: BULL RUN + the STAMPEDE hot-rod (scratch, 6 Oct 2026). An ORIGINAL rival, built in code on the roster's
       * pipeline (SDF -> marching cubes, every colour region its own MC mesh, guarded projection, re-projected morphs).
       *
       *   BullRun.bull (THREE, K, detail, opts) -> THREE.Group      budgets 16k / 8k / 3k / 0.7k  (desktop/phone/mid/far)
       *   BullRun.kart (THREE, K, detail, opts) -> THREE.Group      budgets 12k / 6k / 2k / 0.5k
       *     K      = the endo marching-cubes kit (endo-kit.js); needs dog.js (DogFinal: shared gm-kart-toon material, eye
       *              material, util) and kart-kit.js (DogKartKit) loaded first.
       *     opts   = { toon: <the shared gm-kart-toon material>, eyeMat: <this racer's gm-kart-eye-dog instance> }
       *
       * The design (no sculpture copy, no team or brand marks): a muscular BLACK market bull with bronze-gold trim. A big
       * broad head (~55% of the seated height) with a heavy brow, a wide tan muzzle (its own mesh: a crisp paint line where
       * it meets the fur), a gold nose ring on a spring bone, big bronze-to-ivory-gold horns sweeping out and up (the
       * roster's widest silhouette), a black forelock curl, low sideways ears, amber eyes under heavy confident lids,
       * gold brows, a toothy confident grin. Body: hump, traps, pecs, delts and Popeye forearms; polished gold hooves for
       * hands and feet; gold wrist cuffs. A black tail with a gold band curls up beside the seat.
       *
       * Expressions = 4 morph targets (re-projection of the fur head + muzzle onto each expression SDF, face parts rebuilt
       * at the same topology) + bone poses:   grin (race default), charge (V brows, flared nostrils, steam), hit (wide eyes,
       * O mouth), celebrate (happy arcs, open laugh, tongue).
       *
       * Units metres, +Z forward, +Y up, origin = seat contact under the pelvis; hands at ten-and-two on DogFinal.WHEEL.
       * Draw calls: 2 (one SkinnedMesh in gm-kart-toon; one eye mesh). 'far' = 1 plain Mesh.
       * group.userData.racer = { set(weights), setExpression(name, instant), setGaze(x, y), look(x, y), blink(v), squash(k),
       *   kick(v), steer(v), update(dt, {accel, steer}), names, bones, mesh, stats }       (Pepe / dogs API)
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, exp } = Math;
        const DF = () => root.DogFinal;

        /* ------------------------------------------------------------------ measurements (+x = the bull's left) */
        const G = {
          cran: [0, 0.762, -0.045, 0.272, 0.232, 0.235],
          brow: [0.098, 0.838, 0.06, 0.122, 0.072, 0.122], browK: 0.05,
          cheek: [0.13, 0.665, 0.03, 0.152, 0.13, 0.15], cheekK: 0.07,
          poll: [0, 0.905, -0.07, 0.25, 0.07, 0.14],
          tuft: [[0, 0.962, 0.075, 0.075, 0.05, 0.07], [0.07, 0.948, 0.06, 0.052, 0.042, 0.055]],
          muz: { c: [0, 0.58, 0.14], h: [0.19, 0.105, 0.14], r: 0.088 },
          jaw: [0, 0.5, 0.12, 0.138, 0.056, 0.13],
          nost: { x: 0.088, y: 0.632, z: 0.29, r: [0.03, 0.02, 0.036] },
          eye: { x: 0.13, y: 0.776, r: 0.058, prot: 0.03, fwd: 0.5 },
          ear: { b: [0.2, 0.77, -0.085], t: [0.385, 0.72, -0.075], rb: 0.058, rt: 0.028, th: 0.032, face: [0.05, 0.3, 1], k: 0.03 },
          horn: { pts: [[0.15, 0.885, -0.07], [0.26, 0.92, -0.068], [0.37, 0.952, -0.052], [0.455, 1.0, -0.02], [0.505, 1.078, 0.02], [0.515, 1.155, 0.055]], r: [0.07, 0.066, 0.055, 0.042, 0.026, 0.006] },
          neck: [0, 0.48, -0.04],
          chest: [0, 0.32, -0.03, 0.222, 0.165, 0.165], waist: [0, 0.15, -0.01, 0.185, 0.15, 0.155],
          pec: [0.09, 0.336, 0.072, 0.104, 0.084, 0.07], trap: [0.12, 0.435, -0.07, 0.13, 0.065, 0.1],
          hump: [0, 0.428, -0.095, 0.17, 0.1, 0.11], delt: [0.238, 0.39, -0.03, 0.096, 0.094, 0.1],
          S: [0.238, 0.37, -0.03], El: [0.31, 0.25, 0.2], armR: [0.084, 0.074, 0.066],
          Hp: [0.11, 0.09, 0.02], K: [0.135, 0.185, 0.24], F: [0.105, 0.075, 0.36],   // ROSTER FIX: feet 4.5 cm inboard (the gold hooves poked through the kart nose flanks)
          tail: { pts: [[0.05, 0.1, -0.17], [0.2, 0.12, -0.25], [0.28, 0.2, -0.32], [0.3, 0.32, -0.35], [0.285, 0.41, -0.33]], r0: 0.024, r1: 0.016 },
        };
        const D2R = PI / 180;
        const MO = (o) => Object.assign({ w: 0.135, y: 0.532, curve: 0.034, tilt: 0.01, open: 0.046, openW: 0.86, tu: 0.52, tl: 0.38, tongue: 0 }, o);
        // brow = [[lift, ang] left, [lift, ang] right]; ang > 0 = inner end down (determined)
        const EX = {
          neutral:   { mouth: MO({}), brow: [[0.012, -0.15], [-0.002, 0.35]], cheek: 0.3, nost: 0, jaw: 0, steam: 0, crease: 0.6, gaze: [0.04, 0.0], lidU: 0.36, lidLo: -0.85, happy: 0, pupil: 0.2, iris: 0.42, spark: 0, roll: 3 * D2R, pitch: -0.03, ear: 0 },
          grin:      { mouth: MO({ w: 0.148, curve: 0.04, tilt: 0.013, open: 0.056, tu: 0.5, tl: 0.36 }), brow: [[0.018, -0.2], [0.004, 0.25]], cheek: 1, nost: 0.15, jaw: 0, steam: 0, crease: 1, gaze: [0.12, 0.03], lidU: 0.42, lidLo: -0.68, happy: 0, pupil: 0.2, iris: 0.42, spark: 0, roll: 5 * D2R, pitch: -0.05, ear: 0.1 },
          charge:    { mouth: MO({ w: 0.122, curve: -0.006, tilt: 0, open: 0.04, tu: 0.52, tl: 0.48 }), brow: [[-0.014, 0.95], [-0.014, 0.95]], cheek: 0.5, nost: 1, jaw: 0, steam: 1, crease: 0.25, gaze: [0, -0.04], lidU: 0.16, lidLo: -0.7, happy: 0, pupil: 0.15, iris: 0.36, spark: 0, roll: 0, pitch: 0.1, ear: -0.4 },
          hit:       { mouth: MO({ w: 0.082, y: 0.528, curve: -0.03, tilt: 0, open: 0.078, openW: 0.72, tu: 0.18, tl: 0.0, tongue: 0.7 }), brow: [[0.032, -0.75], [0.032, -0.75]], cheek: 0, nost: 0.4, jaw: 0.012, steam: 0, crease: 0, gaze: [0, 0.05], lidU: 1.12, lidLo: -1.22, happy: 0, pupil: 0.085, iris: 0.24, spark: 0, roll: -9 * D2R, pitch: 0.02, ear: -0.65 },
          celebrate: { mouth: MO({ w: 0.156, y: 0.534, curve: 0.05, open: 0.1, openW: 0.86, tu: 0.28, tl: 0.1, tongue: 1 }), brow: [[0.03, -0.3], [0.03, -0.3]], cheek: 1, nost: 0.3, jaw: 0.014, steam: 0, crease: 1, gaze: [0, 0.1], lidU: 0.45, lidLo: -0.7, happy: 1, pupil: 0.24, iris: 0.46, spark: 1, roll: 8 * D2R, pitch: -0.1, ear: 0.3 },
        };
        const NAMES = ['grin', 'charge', 'hit', 'celebrate'];

        const rbox = (x, y, z, c, h, r) => {
          const qx = abs(x - c[0]) - h[0] + r, qy = abs(y - c[1]) - h[1] + r, qz = abs(z - c[2]) - h[2] + r;
          return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, max(qy, qz)), 0) - r;
        };

        /* ------------------------------------------------------------------ the bull SDF (with an expression) */
        function bullSDF(E) {
          const { sat, sstep, smin, smax, ell, E6, cap, v3 } = DF().util;
          E = E || {};
          const ER = G.ear, EB = ER.b, ET = ER.t, EL = hypot(ET[0] - EB[0], ET[1] - EB[1], ET[2] - EB[2]);
          const ea = v3.norm(v3.sub(ET, EB)); let eu = v3.norm(ER.face); eu = v3.norm(v3.sub(eu, v3.scale(ea, v3.dot(eu, ea)))); const ew = v3.cross(ea, eu);
          const eL = [0, 0, 0];
          const earParts = (ax, y, z) => {
            const q0 = ax - EB[0], q1 = y - EB[1], q2 = z - EB[2];
            eL[0] = q0 * ew[0] + q1 * ew[1] + q2 * ew[2]; eL[1] = q0 * ea[0] + q1 * ea[1] + q2 * ea[2]; eL[2] = q0 * eu[0] + q1 * eu[1] + q2 * eu[2];
            const s = eL[0], t = eL[1], d = eL[2] + 0.03 * (t / EL) * (t / EL) * EL;
            const o2 = cap(s, t, 0, [0, 0, 0], [0, EL, 0], ER.rb, ER.rt);
            const th = ER.th * (1 - 0.4 * sat(t / EL));
            const outer = smax(o2, abs(d) - th, 0.016);
            const in2 = cap(s * 1.05, t, 0, [0, 0.2 * EL, 0], [0, 0.78 * EL, 0], ER.rb * 0.56, ER.rt * 0.4);
            const bowl = max(in2, -(d - th * 0.25));
            return [smax(outer, -bowl, 0.014), in2, d, t];
          };
          const pf = E.cheek || 0, cheekE = G.cheek.slice();
          cheekE[1] += 0.012 * pf; cheekE[2] += 0.006 * pf; cheekE[3] *= 1 + 0.045 * pf; cheekE[4] *= 1 + 0.04 * pf;
          const tuftF = (ax, y, z) => { let t = 1; for (const c of G.tuft) t = smin(t, E6(ax, y, z, c), 0.03); return t; };
          const cranF = (x, y, z) => {   // the skull without hair or ears (head-share measurement)
            const ax = abs(x);
            let d = E6(x, y, z, G.cran);
            d = smin(d, E6(ax, y, z, cheekE), G.cheekK);
            d = smin(d, E6(x, y, z, G.poll), 0.06);
            return smin(d, E6(ax, y, z, G.brow), G.browK);
          };
          const headCore = (x, y, z) => {
            let d = cranF(x, y, z);
            if (y > 0.84 && z > -0.06) d = smin(d, tuftF(abs(x), y, z), 0.035);
            return d;
          };
          const earZone = (ax, y, z) => ax > 0.15 && y > 0.62 && y < 0.9 && z < 0.08;
          const headF = (x, y, z) => {
            let d = headCore(x, y, z);
            const ax = abs(x);
            if (earZone(ax, y, z)) d = smin(d, earParts(ax, y, z)[0], ER.k);
            return d;
          };
          const nf = E.nost || 0, jw = E.jaw || 0, N = G.nost, ns = 1 + 0.32 * nf;
          const nostF = (ax, y, z) => ell(ax - N.x - 0.006 * nf, y - N.y, z - N.z, N.r[0] * ns, N.r[1] * ns, N.r[2]);
          const muzzleF = (x, y, z) => {
            const ax = abs(x);
            let d = rbox(x, y, z, G.muz.c, G.muz.h, G.muz.r);
            d = smin(d, E6(x, y + jw, z, G.jaw), 0.04);
            if (z > 0.2 && y > 0.58) d = smax(d, -nostF(ax, y, z), 0.016);
            return d;
          };
          const faceF = (x, y, z) => min(headCore(x, y, z), muzzleF(x, y, z));
          // body
          const H = WH().H, Wr = v3.add(H, v3.norm(v3.sub(G.El, H)), 0.06), pawC = v3.add(H, WH().nrm, -0.012);
          const bic = v3.add(v3.lerp(G.S, G.El, 0.45), [-0.004, 0.026, 0.024]), fore = v3.add(v3.lerp(G.El, Wr, 0.3), [0.012, 0.012, 0]);
          const torsoF = (x, y, z) => {
            const ax = abs(x);
            let d = smin(E6(x, y, z, G.chest), E6(x, y, z, G.waist), 0.07);
            d = smin(d, E6(ax, y, z, G.pec), 0.03);
            d = smin(d, E6(ax, y, z, G.trap), 0.05);
            d = smin(d, E6(x, y, z, G.hump), 0.05);
            return smin(d, E6(ax, y, z, G.delt), 0.04);
          };
          const armF = (ax, y, z) => {
            let d = smin(cap(ax, y, z, G.S, G.El, G.armR[0], G.armR[1]), cap(ax, y, z, G.El, Wr, G.armR[1], G.armR[2] * 0.9), 0.035);
            d = smin(d, ell(ax - bic[0], y - bic[1], z - bic[2], 0.072, 0.07, 0.078), 0.03);
            return smin(d, ell(ax - fore[0], y - fore[1], z - fore[2], 0.078, 0.07, 0.078), 0.03);
          };
          const legF = (ax, y, z) => smin(cap(ax, y, z, G.Hp, G.K, 0.106, 0.086), cap(ax, y, z, G.K, G.F, 0.08, 0.06), 0.035);
          const bodyF = (x, y, z) => { const ax = abs(x); return smin(smin(torsoF(x, y, z), armF(ax, y, z), 0.05), legF(ax, y, z), 0.045); };
          // gold hooves: hands (a mitt round the rim, cloven groove) and feet (flat sole, cloven front)
          const hoofHF = (x, y, z) => {
            const ax = abs(x), q = [ax - pawC[0], y - pawC[1], z - pawC[2]];
            let d = ell(q[0], q[1], q[2], 0.066, 0.06, 0.07);
            return smax(d, -max(abs(q[0] + 0.004) - 0.0045, -(q[1] + q[2] * 0.4 - 0.02)), 0.006);
          };
          const FC = [G.F[0], 0.062, G.F[2] + 0.04];
          const hoofFF = (x, y, z) => {
            const ax = abs(x);
            let d = ell(ax - FC[0], y - FC[1], z - FC[2], 0.076, 0.07, 0.09);
            d = smax(d, -(y - 0.0), 0.02);
            return smax(d, -max(abs(ax - FC[0]) - 0.005, -(z - FC[2] - 0.02)), 0.006);
          };
          // the racing vest: the torso inflated 13 mm, cut at a scoop neck (straps over the traps), armholes and a hem
          const vestTop = (ax, z) => 0.452 - 0.5 * max(0, z - 0.02) + 0.085 * sstep(0.065, 0.095, ax) * sstep(0.175, 0.145, ax);
          const armHole = (ax, y, z) => hypot(ax - 0.252, (y - 0.37) * 0.92, z + 0.02) - 0.118;
          const vestF = (x, y, z) => {
            const ax = abs(x);
            let d = torsoF(x, y, z) - 0.013;
            d = smax(d, y - vestTop(ax, z), 0.008);
            d = smax(d, 0.075 - y, 0.008);
            return smax(d, -armHole(ax, y, z), 0.01);
          };
          return { vestF, vestTop, armHole, headF, headCore, cranF, faceF, muzzleF, nostF, earParts, earZone, bodyF, torsoF, armF, legF, hoofHF, hoofFF, pawC, Wr, ea, eu, ew, EL, FC };
        }
        let _wh = null;
        function WH() {
          if (_wh) return _wh;
          const W = DF().WHEEL, { v3 } = DF().util, up = [0, cos(W.tilt), sin(W.tilt)], nrm = [0, -sin(W.tilt), cos(W.tilt)];
          const a = W.grip, rad = v3.norm(v3.add([cos(a), 0, 0], up, sin(a)));
          return (_wh = { up, nrm, rad, H: v3.add(W.c, rad, W.r) });
        }

        /* ------------------------------------------------------------------ palette (linear) */
        function palette(THREE) {
          const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
          return {
            fur: c('#383135'), furDk: c('#221E20'), furHi: c('#5A4E54'),
            vest: c('#E9A62C'), vestDk: c('#B87418'), vestHi: c('#FFD067'), trim: c('#17141A'), inner: c('#B07E62'),
            muz: c('#D8B08A'), muzHi: c('#EBCBA5'), muzDk: c('#B58A66'), nostril: c('#2A1614'),
            horn0: c('#9A6A26'), horn1: c('#DDB054'), horn2: c('#F6E5B4'),
            gold: c('#D7A43C'), goldHi: c('#F7D774'), goldDk: c('#9E7024'), ring: c('#FFC93C'),
            brow: c('#C99A44'), browHi: c('#E8C070'),
            lidLine: c('#120D0E'), arc: c('#E2B65E'),
            mouth: c('#4A1420'), mouthHi: c('#7A2A36'), teeth: c('#FBF6EE'), tongue: c('#EE7486'), tongueDk: c('#C8506A'), lip: c('#4A2A1E'),
            steam: c('#F4F6FA'), steamDk: c('#C9D2DE'),
          };
        }

        /* ------------------------------------------------------------------ LODs and bones */
        const LEVELS = {
          desktop: { ear: 0.0195, head: 0.0285, muz: 0.0205, body: 0.039, vest: 0.031, hoof: 0.023, eye: [20, 11], lid: [14, 6], rim: [4, 20], tube: 6, extras: true, horn: [14, 10], tail: [12, 6], seg: 1, morph: true },
          phone:   { ear: 0.028, head: 0.042, muz: 0.031, body: 0.06, vest: 0.05, hoof: 0.034, eye: [14, 8], lid: [10, 4], rim: [3, 14], tube: 4, extras: true, horn: [10, 7], tail: [8, 5], seg: 0.7, morph: true },
          mid:     { ear: 0.055, head: 0.077, muz: 0.062, body: 0.11, vest: 0.085, hoof: 0.065, eye: [9, 5], lid: [6, 3], rim: [3, 8], tube: 4, extras: false, horn: [6, 5], tail: [5, 4], seg: 0.4, morph: true },
          far:     { far: true },
        };
        const BONES = ['root', 'body', 'head', 'earL', 'earR', 'lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'tail0', 'tail1', 'tail2', 'ring'];
        const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
        const PARENT = { body: 'root', head: 'body', earL: 'head', earR: 'head', lidL: 'head', lidR: 'head', lowL: 'head', lowR: 'head', arcL: 'head', arcR: 'head', tail0: 'body', tail1: 'tail0', tail2: 'tail1', ring: 'head' };

        /* ------------------------------------------------------------------ build */
        function build(THREE, KIT, detail, opts) {
          opts = opts || {};
          const D = DF(), U = D.util, { sat, clamp, lerp, sstep, v3, mix3, mul3, grad, Acc, mcPart, addGeo, taperTube, rayHit } = U;
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop;
          const C = palette(THREE);
          const toon = opts.toon || D.toonMaterial(THREE, opts);
          const E0 = EX.neutral, F = bullSDF(E0);
          if (LV.far) return buildFar(THREE, F, C, toon, T0, now);
          const stats = { parts: {} };
          const acc = new Acc();
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const qFrom = (dir) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(v3.norm(dir)));
          const tpart = (name, t0) => { stats.parts[name] = (stats.parts[name] || 0) + (acc.I.length - t0) / 3; };
          const ALL = (x, y, z) => min(min(F.headF(x, y, z), F.muzzleF(x, y, z)), F.bodyF(x, y, z));
          const aoAt = (x, y, z, nx, ny, nz, step) => {
            let occ = 0;
            for (let s = 1; s <= 4; s++) { const hs = s * step; occ += max(0, 1 - ALL(x + nx * hs, y + ny * hs, z + nz * hs) / hs) / s; }
            return sat(1 - 0.55 * max(0, occ - 0.12));
          };
          const aoStep = detail === 'mid' ? 0.03 : 0.018;
          const shade = (c, ao, lo) => { const k = lo + (1 - lo) * ao; return [c[0] * k, c[1] * k * (0.97 + 0.03 * k), c[2] * k * (0.9 + 0.1 * k)]; };
          const kFur = [0.42, 1, 3, 1];
          const g0 = [0, 0, 0];
          // a face-surface helper (front ray), and a grid decal between two curves (fixed topology)
          const faceAt = (f, x, y, lift, outN) => { const p = rayHit(f, [x, y, 0.45], [0, 0, -1], 0, 0.55, 44) || [x, y, 0.2], g = outN || [0, 0, 0]; grad(f, p[0], p[1], p[2], 0.002, g); return v3.add(p, g, lift); };
          const onSurface = (f, pts, lift) => pts.map(([x, y]) => faceAt(f, x, y, lift));
          const gridDecal = (f, A, B, rows, lift, bias) => {
            const cols = A.length, P = [], N = [], I = [], g = [0, 0, 0];
            for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) {
              const u = r / rows, x = lerp(A[c][0], B[c][0], u), y = lerp(A[c][1], B[c][1], u);
              const p = faceAt(f, x, y, typeof lift === 'function' ? lift(x, y, u) : lift, g); P.push(p[0], p[1], p[2]);
              const bn = v3.norm([g[0], g[1] + (bias || 0), g[2] + (bias || 0) * 1.6]); N.push(bn[0], bn[1], bn[2]);
            }
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; I.push(a, d, b, b, d, e); }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setIndex(I);
            return geo;
          };
          let t = now(), t0;

          /* ---- eyes: on the skull under the brow ridge, protruding, facing between forward and the surface normal */
          const eyeAt = (side) => {
            const p = rayHit(F.headCore, [side * G.eye.x, G.eye.y, 0.6], [0, 0, -1], 0, 0.8);
            grad(F.headCore, p[0], p[1], p[2], 0.002, g0);
            const dir = v3.norm(v3.lerp(g0, [side * 0.14, 0.0, 1], G.eye.fwd));
            return { c: v3.add(p, dir, -(G.eye.r - G.eye.prot)), dir };
          };
          const EYE = { L: eyeAt(1), R: eyeAt(-1) };
          const eyeQ = (side) => qFrom(side > 0 ? EYE.L.dir : EYE.R.dir);

          /* ---- 1. fur head (no ears), then the ears on a finer grid */
          const headCol = (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const ax = abs(x);
            let c = mix3(C.fur, C.furHi, sstep(0.3, 1, ny) * 0.35 * sstep(0.84, 0.95, y));
            if (F.earZone(ax, y, z)) {
              const ep = F.earParts(ax, y, z);
              if (ep[0] < 0.01) { const w = sstep(0.004, -0.012, ep[1]) * sstep(-G.ear.th * 0.45, G.ear.th * 0.1, ep[2]) * sstep(0.012, 0.0, ep[0]); c = mix3(c, C.inner, w * 0.9); }
            }
            return shade(c, ao, 0.6);
          };
          t0 = acc.I.length;
          const hd = mcPart(KIT, acc, F.headCore, [-0.34, 0.4, -0.32, 0.34, 1.06, 0.3], LV.head, true, headCol,
            (x, y, z) => F.muzzleF(x, y, z) > -0.004 && (!F.earZone(abs(x), y, z) || F.headF(x, y, z) > -0.0025), kFur, BI.head);
          tpart('head', t0); t0 = acc.I.length;
          const er = mcPart(KIT, acc, F.headF, [-0.45, 0.62, -0.2, 0.45, 0.88, 0.06], LV.ear, true, headCol, (x, y, z) => F.earZone(abs(x), y, z) && F.headCore(x, y, z) > 0.0008, kFur, BI.head);
          tpart('ears', t0);
          for (let v = er.v0; v < er.v1; v++) {
            const x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
            const ep = F.earParts(abs(x), y, z);
            if (ep[0] > F.headCore(x, y, z) - 0.002) continue;
            const w = sstep(0.04, 0.4, ep[3] / F.EL); if (w <= 0) continue;
            acc.B[3 * v] = BI.head; acc.B[3 * v + 1] = x > 0 ? BI.earL : BI.earR; acc.B[3 * v + 2] = w;
          }

          /* ---- 2. the muzzle: its own mesh (tan), nostrils carved */
          t0 = acc.I.length;
          const muzCol = (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep * 0.7); acc.K[4 * v + 3] = ao;
            let c = mix3(C.muz, C.muzHi, sstep(0.2, 0.9, ny) * 0.6);
            c = mix3(c, C.muzDk, sstep(0.5, 0.47, y) * 0.5 + sstep(0.12, 0.0, z) * 0.4);
            c = mix3(c, C.muzDk, sstep(0.012, -0.004, F.nostF(abs(x), y, z)) * 0.6);
            return shade(c, ao, 0.55);
          };
          const mz = mcPart(KIT, acc, F.muzzleF, [-0.24, 0.4, -0.02, 0.24, 0.72, 0.32], LV.muz, true, muzCol, (x, y, z) => F.headCore(x, y, z) > -0.004, [0.42, 0.6, 0, 1], BI.head);
          tpart('muzzle', t0);

          /* ---- 3. body fur: torso, arms, legs (drop what the head and hooves hide) */
          t0 = acc.I.length;
          mcPart(KIT, acc, F.bodyF, [-0.44, -0.03, -0.3, 0.44, 0.56, 0.56], LV.body, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const c = mix3(C.fur, C.furHi, sstep(0.4, 1, ny) * 0.25);
            return shade(c, ao, 0.55);
          }, (x, y, z) => F.headF(x, y, z) > -0.01 && F.muzzleF(x, y, z) > -0.01 && F.vestF(x, y, z) > -0.003 && F.hoofHF(x, y, z) > -0.003 && F.hoofFF(x, y, z) > -0.003, kFur, BI.body);
          tpart('body', t0);
          /* ---- 3b. the gold racing vest (own mesh), black trim bands at the neck, armholes and hem */
          t0 = acc.I.length;
          mcPart(KIT, acc, F.vestF, [-0.36, 0.04, -0.3, 0.36, 0.56, 0.3], LV.vest, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const ax = abs(x), tb = LV.vest * 0.9 + 0.012;
            const trim = max(sstep(tb, tb - 0.004, F.vestTop(ax, z) - y), sstep(tb, tb - 0.004, y - 0.075), sstep(tb, tb - 0.004, F.armHole(ax, y, z)));
            let c = mix3(mix3(C.vest, C.vestHi, sstep(0.3, 1, ny) * 0.35), C.vestDk, sstep(0.0, -0.8, ny) * 0.4);
            c = mix3(c, C.trim, trim);
            return shade(c, ao, 0.62);
          }, (x, y, z) => F.headF(x, y, z) > -0.006, [0.55, 0.3, 0, 1], BI.body);
          // the back emblem: a black zigzag chart line rising to an arrowhead (original mark), laid on the vest
          {
            const backAt = (x, y, lift) => { const p = rayHit(F.vestF, [x, y, -0.55], [0, 0, 1], 0, 0.6, 40) || [x, y, -0.2]; grad(F.vestF, p[0], p[1], p[2], 0.002, g0); return { p: v3.add(p, g0, lift), n: g0.slice() }; };
            const strokes = [[[0.105, 0.15], [0.035, 0.235], [-0.005, 0.195], [-0.085, 0.3]], [[-0.085, 0.3], [-0.04, 0.305]], [[-0.085, 0.3], [-0.088, 0.255]]];
            for (const st of strokes) {
              const pts = [], ns = [];
              for (let i = 0; i < st.length - 1; i++) for (let k = 0; k < 3; k++) { const u = k / 3, q = backAt(lerp(st[i][0], st[i + 1][0], u), lerp(st[i][1], st[i + 1][1], u), 0.003); pts.push(q.p); ns.push(q.n); }
              const q = backAt(st[st.length - 1][0], st[st.length - 1][1], 0.003); pts.push(q.p); ns.push(q.n);
              addGeo(THREE, acc, taperTube(THREE, pts, pts.map(() => 0.016), pts.map(() => 0.0025), 4, (i) => ns[i], true), M4(), C.trim, [0.5, 0, 0, 1], BI.body);
            }
          }
          tpart('vest', t0);

          /* ---- 4. gold hooves (own meshes) */
          t0 = acc.I.length;
          const goldCol = (x, y, z, nx, ny) => mix3(mix3(C.gold, C.goldHi, sstep(0.1, 0.9, ny) * 0.7), C.goldDk, sstep(-0.2, -0.9, ny) * 0.5);
          mcPart(KIT, acc, F.hoofHF, [-0.22, 0.31, 0.36, 0.22, 0.48, 0.54], LV.hoof, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep * 0.6); acc.K[4 * v + 3] = ao; return shade(goldCol(x, y, z, nx, ny), ao, 0.6);
          }, (x, y, z) => F.armF(abs(x), y, z) > -0.003, [0.26, 0, 0, 1], BI.body);
          mcPart(KIT, acc, F.hoofFF, [-0.26, -0.03, 0.25, 0.26, 0.16, 0.52], LV.hoof * 1.3, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep * 0.6); acc.K[4 * v + 3] = ao; return shade(goldCol(x, y, z, nx, ny), ao, 0.6);
          }, (x, y, z) => F.legF(abs(x), y, z) > -0.003, [0.26, 0, 0, 1], BI.body);
          tpart('hooves', t0);
          stats.sdfMs = Math.round(now() - t); t = now();

          /* ---- 5. horns: tapered tubes, bronze root to ivory-gold tip, buried root = a crisp line on the fur */
          t0 = acc.I.length;
          {
            const HN = G.horn, curve = new THREE.CatmullRomCurve3(HN.pts.map((p) => V(p))), n = LV.horn[0];
            const pts = curve.getPoints(n).map((p) => [p.x, p.y, p.z]);
            const rr = pts.map((_, i) => { const u = (i / n) * (HN.r.length - 1), k = Math.min(HN.r.length - 2, Math.floor(u)); return lerp(HN.r[k], HN.r[k + 1], u - k); });
            for (const side of [1, -1]) {
              const P = pts.map((p) => [side * p[0], p[1], p[2]]);
              const tg = taperTube(THREE, P, rr, rr.map((r) => r * 0.94), LV.horn[1], [0, 0, 1], true);
              const uv = tg.attributes.uv;
              addGeo(THREE, acc, tg, M4(), (x, y, z, nx, ny, nz, i) => {
                const u = uv.getX(i);
                let c = mix3(mix3(C.horn0, C.horn1, sstep(0.05, 0.5, u)), C.horn2, sstep(0.55, 0.95, u));
                const band = LV.extras ? sstep(0.006, 0.0, abs(u - 0.2)) * 0.25 + sstep(0.006, 0.0, abs(u - 0.3)) * 0.18 : 0;
                return mul3(c, (0.86 + 0.18 * sstep(-0.3, 0.9, ny)) * (1 - band));
              }, [0.24, 0, 0, 1], BI.head);
            }
          }
          tpart('horns', t0);

          /* ---- nose ring (gold, on its spring bone) and wrist cuffs */
          t0 = acc.I.length;
          const septum = rayHit(F.muzzleF, [0, G.nost.y - 0.012, 0.6], [0, 0, -1], 0, 0.8) || [0, 0.63, 0.3];
          const ringC = v3.add(septum, [0, -0.026, 0.006]);
          addGeo(THREE, acc, new THREE.TorusGeometry(0.032, 0.0078, LV.rim[0], LV.rim[1]), M4().compose(V(ringC), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 0)), V([1, 1, 1])),
            (x, y, z, nx, ny) => mix3(C.ring, C.goldHi, sstep(0.2, 0.9, ny) * 0.5), [0.2, 0, 0, 1], BI.ring);
          for (const side of [1, -1]) {
            const H = WH().H, ax = v3.norm(v3.sub(G.El, H)), cc = v3.add(H, ax, 0.082);
            addGeo(THREE, acc, new THREE.TorusGeometry(0.066, 0.017, 3, max(8, LV.rim[1] - 4)), M4().compose(V([side * cc[0], cc[1], cc[2]]), qFrom([side * ax[0], ax[1], ax[2]]), V([1, 1, 1])),
              (x, y, z, nx, ny) => mix3(C.gold, C.goldHi, sstep(0.0, 0.9, ny) * 0.6), [0.24, 0, 0, 1], BI.body);
          }
          tpart('gold', t0);

          /* ---- the face: everything an expression changes (fixed topology; rebuilt per expression for the morphs) */
          const lineK = [0.5, 0, 0, 0.6], darkK = [0.7, 0, 4, 1];
          const nLine = max(8, Math.round(24 * LV.seg)), nBrow = max(5, Math.round(9 * LV.seg));
          function buildFace(A, E, FE) {
            const ff = FE.faceF, M = E.mouth;
            const top = (s) => [s * M.w, M.y + M.curve * s * s + M.tilt * s];
            const q = (s) => Math.pow(sat(1 - (s / max(0.05, M.openW)) ** 2), 0.6);
            const bot = (s) => { const p = top(s); return [p[0], p[1] - M.open * q(s) - 0.0004]; };
            const S1 = [], S2 = [], SU = [], SL = [];
            for (let i = 0; i <= nLine; i++) {
              const s = -1 + 2 * i / nLine, a = top(s), b = bot(s), h = a[1] - b[1];
              S1.push(a); S2.push(b); SU.push([a[0], a[1] - h * M.tu]); SL.push([b[0], b[1] + h * M.tl]);
            }
            A.k = darkK;
            addGeo(THREE, A, gridDecal(ff, S1, S2, 3, 0.0018, 0.2), M4(), mix3(C.mouth, C.mouthHi, 0.3), darkK, BI.head);
            addGeo(THREE, A, gridDecal(ff, S1, SU, 1, 0.0028, 0.2), M4(), (x, y, z, nx, ny) => mix3(C.teeth, mul3(C.teeth, 0.86), sstep(0.3, -0.5, ny)), [0.3, 0, 0, 1], BI.head);
            addGeo(THREE, A, gridDecal(ff, SL, S2, 1, 0.0028, 0.2), M4(), mul3(C.teeth, 0.92), [0.3, 0, 0, 1], BI.head);
            // tongue patch on the floor of the opening
            const S3 = [], S4 = [];
            for (let i = 0; i <= nLine; i++) {
              const s = -1 + 2 * i / nLine, ts = s * 0.55 * M.openW, b = bot(ts), qq = sat(1 - s * s);
              S4.push(b); S3.push([b[0], b[1] + 0.0008 + M.tongue * M.open * 0.5 * Math.pow(qq, 0.7)]);
            }
            addGeo(THREE, A, gridDecal(ff, S4, S3, 2, (x, y, u) => 0.0032 + 0.003 * u * M.tongue, 0.2), M4(), mix3(C.tongue, C.tongueDk, 0.25), [0.4, 0.4, 0, 1], BI.head);
            // the lip: an upper line (thick in the middle) and a thinner lower line
            const sp = onSurface(ff, S1, 0.0014), rr = sp.map((_, i) => 0.0072 * (0.5 + 0.5 * sin(PI * (0.05 + 0.9 * i / nLine))));
            addGeo(THREE, A, taperTube(THREE, sp, rr, rr, LV.tube, [0, 0, 1], true), M4(), C.lip, lineK, BI.head);
            const sb = onSurface(ff, S2, 0.0012), rb = sb.map((_, i) => 0.0058 * (0.35 + 0.65 * sin(PI * (0.05 + 0.9 * i / nLine))));
            addGeo(THREE, A, taperTube(THREE, sb, rb, rb, max(4, LV.tube - 2), [0, 0, 1], true), M4(), C.lip, lineK, BI.head);
            // nostrils: dark ovals in the carved dimples (they flare with E.nost)
            const nG = new THREE.SphereGeometry(1, max(6, LV.lid[0] - 4), max(3, LV.lid[1] - 2));
            for (const side of [1, -1]) {
              const ns = 1 + 0.3 * E.nost, p = faceAt(ff, side * (G.nost.x + 0.004 * E.nost), G.nost.y, 0.0005, g0);
              addGeo(THREE, A, nG, M4().compose(V(p), qFrom(v3.lerp(g0, [0, 0, 1], 0.3)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -side * 0.18))), V([0.03 * ns, 0.024 * ns, 0.007])),
                (x, y, z, nx, ny, nz) => mix3(C.nostril, mul3(C.nostril, 2.2), sstep(0.3, 0.9, nz) * 0.3), [0.6, 0, 4, 1], BI.head);
            }
            // brows: thick gold tufts on the brow ridge
            for (const [side, br] of [[1, E.brow[0]], [-1, E.brow[1]]]) {
              const pts = [], rx = [], ry = [];
              for (let i = 0; i <= nBrow; i++) {
                const u = i / nBrow, x = side * (0.045 + 0.15 * u);
                const y = G.eye.y + 0.078 + br[0] - br[1] * 0.03 * (1 - u) + br[1] * 0.012 * u + 0.012 * sin(PI * u);
                pts.push(faceAt(FE.headCore, x, y, 0.003));
                rx.push(0.019 * (0.45 + 0.55 * sin(PI * (0.12 + 0.76 * u))) * (1 + 0.25 * (1 - u))); ry.push(0.011);
              }
              addGeo(THREE, A, taperTube(THREE, pts, rx, ry, LV.tube, [0, 0.2, 1], true), M4(), (x, y, z, nx, ny) => mix3(C.brow, C.browHi, sstep(0.0, 0.8, ny) * 0.6), [0.5, 0.5, 0, 1], BI.head);
            }
            if (LV.extras) {
              // smile creases at the mouth corners
              for (const side of [1, -1]) {
                const cp = top(side), k = E.crease;
                const pts = onSurface(ff, [[cp[0] + side * 0.006, cp[1] + 0.02], [cp[0] + side * 0.017, cp[1] + 0.002], [cp[0] + side * 0.009, cp[1] - 0.016]], 0.001);
                const r = [0.0015 * k, 0.0045 * k, 0.0015 * k];
                addGeo(THREE, A, taperTube(THREE, pts, r, r, 4, [0, 0, 1], true), M4(), C.lip, lineK, BI.head);
              }
              // nostril steam (collapsed into the nostril when off)
              const blob = new THREE.SphereGeometry(1, LV.seg > 0.9 ? 11 : 8, LV.seg > 0.9 ? 7 : 5);
              for (const side of [1, -1]) {
                const st = E.steam, base = [side * G.nost.x, G.nost.y - 0.01, G.nost.z - 0.01];
                for (const [dx, dy, dz, r] of (LV.seg > 0.9 ? [[0.045, -0.02, 0.055, 0.032], [0.09, -0.036, 0.085, 0.04], [0.14, -0.05, 0.11, 0.05]] : [[0.05, -0.026, 0.065, 0.03], [0.115, -0.05, 0.11, 0.042]])) {
                  const p = v3.add(base, [side * dx * st, dy * st, dz * st]);
                  addGeo(THREE, A, blob, M4().compose(V(p), new THREE.Quaternion(), V([r * max(0.02, st), r * max(0.02, st), r * max(0.02, st)])),
                    (x, y, z, nx, ny) => mix3(C.steamDk, C.steam, sstep(-0.8, 0.3, ny)), [0.95, 0, 0, 1], BI.head);
                }
              }
            }
          }
          t0 = acc.I.length;
          const fc0 = acc.n;
          buildFace(acc, E0, F);
          const fc1 = acc.n;
          tpart('face', t0);

          /* ---- eyelids (upper shell + dark rim, lower shell), happy arcs (gold so they read on black fur) */
          t0 = acc.I.length;
          const eyeR = G.eye.r, lidR = eyeR + 0.0045;
          const upG = new THREE.SphereGeometry(lidR, LV.lid[0], LV.lid[1], 0, PI * 2, 0, PI / 2);
          const loG = new THREE.SphereGeometry(lidR - 0.0016, LV.lid[0], max(3, LV.lid[1] - 2), 0, PI * 2, PI / 2, PI / 2);
          const rimG = new THREE.TorusGeometry(lidR - 0.002, 0.0058, LV.rim[0], LV.rim[1], PI).rotateX(PI / 2);
          const nA = max(6, Math.round(12 * LV.seg)), tubeA = max(3, LV.tube - 2);
          const arcPts = []; for (let i = 0; i <= nA; i++) { const s = -1 + 2 * i / nA; arcPts.push(v3.scale(v3.norm([0.66 * s, -0.12 + 0.34 * (1 - s * s), 1]), lidR + 0.003)); }
          const arcR = arcPts.map((_, i) => 0.009 * (0.4 + 0.6 * sin(PI * i / nA)));
          const arcG = taperTube(THREE, arcPts, arcR, arcR, tubeA, [0, 0, 1], true);
          for (const side of [1, -1]) {
            const sfx = side > 0 ? 'L' : 'R';
            addGeo(THREE, acc, upG, M4(), (x, y) => mix3(C.fur, C.furHi, sstep(0, lidR, y) * 0.3), [0.45, 1, 3, 0.9], BI['lid' + sfx]);
            addGeo(THREE, acc, rimG, M4(), C.lidLine, [0.45, 0.3, 0, 0.7], BI['lid' + sfx]);
            addGeo(THREE, acc, loG, M4(), mul3(C.fur, 1.1), [0.5, 1, 3, 0.9], BI['low' + sfx]);
            addGeo(THREE, acc, arcG, M4(), C.arc, [0.4, 0, 0, 1], BI['arc' + sfx]);
          }
          tpart('lids', t0);

          /* ---- tail: black, gold band, black tuft; 3 spring bones */
          t0 = acc.I.length;
          const TL = G.tail, tcurve = new THREE.CatmullRomCurve3(TL.pts.map((p) => V(p)));
          {
            const tN = LV.tail[0], tpts = tcurve.getPoints(tN).map((p) => [p.x, p.y, p.z]);
            const tr = tpts.map((_, i) => lerp(TL.r0, TL.r1, i / tN));
            const tg = taperTube(THREE, tpts, tr, tr, LV.tail[1], [0, 0, 1], true);
            const uv = tg.attributes.uv, pos = tg.attributes.position, nor = tg.attributes.normal;
            acc.k = kFur; const base = acc.n;
            for (let i = 0; i < pos.count; i++) {
              const u = uv.getX(i), ny = nor.getY(i);
              const c = mix3(C.fur, C.gold, sstep(0.84, 0.86, u) * sstep(0.95, 0.93, u));
              const uu = clamp(u, 0, 0.999) * 3, bi = Math.floor(uu), f = uu - bi;
              acc.bw = () => (bi >= 2 ? [BI.tail2, BI.tail2, 0] : [BI['tail' + bi], BI['tail' + (bi + 1)], f]);
              acc.v(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), ny, nor.getZ(i), ...shade(c, 0.86 + 0.14 * sstep(-0.5, 0.5, ny), 1));
            }
            acc.bw = null;
            for (let i = 0; i < tg.index.count; i++) acc.I.push(base + tg.index.getX(i));
            const end = tpts[tN], dir = v3.norm(v3.sub(tpts[tN], tpts[tN - 1]));
            addGeo(THREE, acc, new THREE.SphereGeometry(1, LV.lid[0], LV.lid[1]).translate(0, 0, 0.6), M4().compose(V(end), qFrom(dir), V([0.036, 0.034, 0.062])),
              (x, y, z, nx, ny) => mul3(C.fur, 0.9 + 0.3 * sstep(-0.5, 0.8, ny)), kFur, BI.tail2);
          }
          tpart('tail', t0);
          stats.accMs = Math.round(now() - t); t = now();

          /* ---- geometry; lid/arc vertices are authored in the eye frame: bind them at the eye */
          const nv = acc.n;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
          for (let v = 0; v < nv; v++) { SI[4 * v] = acc.B[3 * v]; SI[4 * v + 1] = acc.B[3 * v + 1]; const f = acc.B[3 * v + 2]; SW[4 * v] = 1 - f; SW[4 * v + 1] = f; }
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
          {
            const pa = geo.attributes.position, na = geo.attributes.normal, vv = new THREE.Vector3(), nn = new THREE.Vector3();
            const eyeBones = new Set(['lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR'].map((n) => BI[n]));
            const qL = eyeQ(1), qR = eyeQ(-1);
            for (let v = 0; v < nv; v++) {
              const b = acc.B[3 * v]; if (!eyeBones.has(b)) continue;
              const side = BONES[b].endsWith('L') ? 1 : -1, E = side > 0 ? EYE.L : EYE.R, q = side > 0 ? qL : qR;
              vv.fromBufferAttribute(pa, v).applyQuaternion(q).add(V(E.c)); pa.setXYZ(v, vv.x, vv.y, vv.z);
              nn.fromBufferAttribute(na, v).applyQuaternion(q); na.setXYZ(v, nn.x, nn.y, nn.z);
            }
          }
          geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));

          /* ---- morph targets: fur head + muzzle re-projected onto the expression SDF, face rebuilt with E */
          const names = [];
          if (LV.morph && !(typeof window !== 'undefined' && window.KartDiag && window.KartDiag.nomorph)) {
            geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
            const g = [0, 0, 0];
            for (const name of NAMES) {
              const E = EX[name], FE = bullSDF(E);
              const dP = new Float32Array(nv * 3), dN = new Float32Array(nv * 3);
              const proj = (part, f0, fE, gate) => {
                for (let v = part.v0; v < part.v1; v++) {
                  let x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
                  if (!gate(x, y, z)) continue;
                  const lvl = f0(x, y, z);
                  let d = fE(x, y, z) - lvl;
                  if (abs(d) < 2e-5) continue;
                  for (let it = 0; it < 4 && abs(d) > 1e-5; it++) { grad(fE, x, y, z, 0.0015, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; d = fE(x, y, z) - lvl; }
                  grad(fE, x, y, z, 0.002, g);
                  dP[3 * v] = x - acc.P[3 * v]; dP[3 * v + 1] = y - acc.P[3 * v + 1]; dP[3 * v + 2] = z - acc.P[3 * v + 2];
                  dN[3 * v] = g[0] - acc.N[3 * v]; dN[3 * v + 1] = g[1] - acc.N[3 * v + 1]; dN[3 * v + 2] = g[2] - acc.N[3 * v + 2];
                }
                // flip guard: shrink the delta of any triangle the expression folds over (and cap the move)
                const Pp = acc.P, I = acc.I, tri = (a, b, c, k) => {
                  const ax = Pp[3 * a] + k * dP[3 * a], ay = Pp[3 * a + 1] + k * dP[3 * a + 1], az = Pp[3 * a + 2] + k * dP[3 * a + 2];
                  const ux = Pp[3 * b] + k * dP[3 * b] - ax, uy = Pp[3 * b + 1] + k * dP[3 * b + 1] - ay, uz = Pp[3 * b + 2] + k * dP[3 * b + 2] - az;
                  const wx = Pp[3 * c] + k * dP[3 * c] - ax, wy = Pp[3 * c + 1] + k * dP[3 * c + 1] - ay, wz = Pp[3 * c + 2] + k * dP[3 * c + 2] - az;
                  return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
                };
                for (let v = part.v0; v < part.v1; v++) { const l = hypot(dP[3 * v], dP[3 * v + 1], dP[3 * v + 2]); if (l > 0.03) for (let k = 0; k < 3; k++) dP[3 * v + k] *= 0.03 / l; }
                for (let pass = 0; pass < 6; pass++) {
                  let bad = 0;
                  for (let t2 = part.t0; t2 < part.t1; t2 += 3) {
                    const a = I[t2], b = I[t2 + 1], c = I[t2 + 2], n0 = tri(a, b, c, 0), n1 = tri(a, b, c, 1);
                    if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0.2 * hypot(...n0) * hypot(...n1)) { bad++; for (const w of [a, b, c]) for (let k = 0; k < 3; k++) { dP[3 * w + k] *= 0.5; dN[3 * w + k] *= 0.5; } }
                  }
                  if (!bad) break;
                }
              };
              if ((E.cheek || 0) !== (E0.cheek || 0)) proj(hd, F.headCore, FE.headCore, (x, y, z) => z > -0.02 && y < 0.76 && y > 0.5);
              if ((E.nost || 0) !== (E0.nost || 0) || (E.jaw || 0) !== (E0.jaw || 0)) proj(mz, F.muzzleF, FE.muzzleF, () => true);
              const A = new Acc(); buildFace(A, E, FE);
              if (A.n !== fc1 - fc0) throw new Error('face topology changed for ' + name + ': ' + A.n + ' vs ' + (fc1 - fc0));
              for (let i = 0; i < A.n; i++) {
                const v = fc0 + i;
                for (let k = 0; k < 3; k++) { dP[3 * v + k] = A.P[3 * i + k] - acc.P[3 * v + k]; dN[3 * v + k] = A.N[3 * i + k] - acc.N[3 * v + k]; }
              }
              geo.morphAttributes.position.push(new THREE.Float32BufferAttribute(dP, 3));
              geo.morphAttributes.normal.push(new THREE.Float32BufferAttribute(dN, 3));
              names.push(name);
            }
            geo.morphTargetsRelative = true;
          }
          stats.morphMs = Math.round(now() - t);
          geo.computeBoundingSphere();

          /* ---- skeleton */
          const tailAt = (u) => { const p = tcurve.getPoint(u); return [p.x, p.y, p.z]; };
          const earB = G.ear.b;
          const REST = {
            root: [0, 0, 0], body: [0, 0, 0], head: G.neck, earL: earB, earR: [-earB[0], earB[1], earB[2]],
            lidL: EYE.L.c, lidR: EYE.R.c, lowL: EYE.L.c, lowR: EYE.R.c, arcL: EYE.L.c, arcR: EYE.R.c,
            tail0: tailAt(0), tail1: tailAt(1 / 3), tail2: tailAt(2 / 3), ring: septum,
          };
          const bones = {}, list = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; return b; });
          const LOCALQ = { lidL: eyeQ(1), lidR: eyeQ(-1), lowL: eyeQ(1), lowR: eyeQ(-1), arcL: eyeQ(1), arcR: eyeQ(-1) };
          const worldQ = {};
          BONES.forEach((n) => {
            const p = PARENT[n]; if (!p) { worldQ[n] = new THREE.Quaternion(); return; }
            const w = REST[n], pw = REST[p], pq = worldQ[p];
            bones[n].position.copy(V(v3.sub(w, pw)).applyQuaternion(pq.clone().invert()));
            if (LOCALQ[n]) bones[n].quaternion.copy(pq.clone().invert().multiply(LOCALQ[n]));
            worldQ[n] = pq.clone().multiply(bones[n].quaternion);
            bones[p].add(bones[n]);
          });
          const mesh = new THREE.SkinnedMesh(geo, toon); mesh.name = 'bull-skin';
          const group = new THREE.Group(); group.name = 'bull-' + detail;
          group.add(bones.root); group.add(mesh);
          group.updateMatrixWorld(true);
          mesh.bind(new THREE.Skeleton(list));
          mesh.frustumCulled = false;
          if (names.length) { mesh.morphTargetDictionary = {}; names.forEach((k, i) => { mesh.morphTargetDictionary[k] = i; }); mesh.morphTargetInfluences = names.map(() => 0); }

          /* ---- eyeballs: one mesh on the head bone (iris/pupil/catchlights/gaze in the shader) */
          const eyeG = new THREE.SphereGeometry(eyeR, LV.eye[0], LV.eye[1], 0, PI * 2, 0, PI * 0.6).rotateX(PI / 2);
          const EP = [], EN = [], EA = [], EI = [];
          const headInv = new THREE.Matrix4().compose(V(G.neck), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)).invert();
          for (const side of [1, -1]) {
            const E = side > 0 ? EYE.L : EYE.R;
            const m = M4().compose(V(E.c), eyeQ(side), new THREE.Vector3(1, 1, 1)).premultiply(headInv), nm = new THREE.Matrix3().getNormalMatrix(m);
            const p = eyeG.attributes.position, nr = eyeG.attributes.normal, b = EP.length / 3, v = new THREE.Vector3(), n = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
              v.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
              EA.push(n.x, n.y, n.z, side);
              v.applyMatrix4(m); n.applyMatrix3(nm).normalize();
              EP.push(v.x, v.y, v.z); EN.push(n.x, n.y, n.z);
            }
            for (let i = 0; i < eyeG.index.count; i++) EI.push(b + eyeG.index.getX(i));
          }
          const eg = new THREE.BufferGeometry();
          eg.setAttribute('position', new THREE.Float32BufferAttribute(EP, 3)); eg.setAttribute('normal', new THREE.Float32BufferAttribute(EN, 3));
          eg.setAttribute('aEye', new THREE.Float32BufferAttribute(EA, 4)); eg.setIndex(EI);
          const eyeMat = opts.eyeMat || D.eyeMaterial(THREE);
          const eyes = new THREE.Mesh(eg, eyeMat); eyes.name = 'bull-eyes';
          bones.head.add(eyes);

          stats.parts.eyes = EI.length / 3;
          stats.tris = acc.I.length / 3 + EI.length / 3; stats.verts = nv; stats.ms = Math.round(now() - T0);
          stats.headShare = headShare(F);
          const api = rig(THREE, { bones, mesh, eyes, eyeMat, stats, names, level: detail });
          group.userData.racer = group.userData.bull = api;
          group.userData.stats = stats;
          return group;
        }

        // head share of the seated height: chin to crown (skull; horns, ears and forelock excluded) over seat to crown
        function headShare(F) {
          const { rayHit } = DF().util;
          const top = rayHit(F.cranF, [0, 1.3, G.cran[2]], [0, -1, 0], 0, 0.8, 96)[1];
          let chin = 1; for (let z = 0.0; z < 0.3; z += 0.01) { const p = rayHit(F.faceF, [0, 0.2, z], [0, 1, 0], 0, 0.6, 96); if (p) chin = min(chin, p[1]); }
          return { top: +top.toFixed(3), chin: +chin.toFixed(3), share: +((top - chin) / top).toFixed(3) };
        }

        /* ------------------------------------------------------------------ far LOD: snapped low-poly parts, face painted */
        function buildFar(THREE, F, C, toon, T0, now) {
          const U = DF().util, { v3, mix3, sstep, grad, Acc, addGeo, taperTube, rayHit } = U;
          const acc = new Acc(), M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]), g = [0, 0, 0];
          const snap = (f, c, ws, hs, rmax, col, k, sc) => {
            const s = new THREE.SphereGeometry(1, ws, hs), p = s.attributes.position, n = s.attributes.normal;
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i) * (sc ? sc[0] : 1), p.getY(i) * (sc ? sc[1] : 1), p.getZ(i) * (sc ? sc[2] : 1)]);
              let lo = 0, hi = rmax;
              for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (f(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c, d, (lo + hi) / 2); p.setXYZ(i, q[0], q[1], q[2]);
              grad(f, q[0], q[1], q[2], 0.004, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            addGeo(THREE, acc, s, M4(), col, k, 0);
          };
          const kF = [0.5, 1, 0, 1], kP = [0.4, 0, 0, 1], kG = [0.25, 0, 0, 1];
          snap(F.headCore, [0, 0.76, -0.03], 10, 6, 0.5, C.fur, kF);
          snap(F.muzzleF, G.muz.c, 8, 5, 0.4, (x, y, z, nx, ny) => mix3(C.muz, C.muzHi, sstep(0.2, 0.9, ny) * 0.5), kP);
          for (const side of [1, -1]) {
            // horns (the silhouette), ears, eyes, nostrils
            const hp = [G.horn.pts[0], G.horn.pts[2], G.horn.pts[4], G.horn.pts[5]].map((p) => [side * p[0], p[1], p[2]]);
            addGeo(THREE, acc, taperTube(THREE, hp, [0.068, 0.054, 0.028, 0.008], [0.068, 0.054, 0.028, 0.008], 4, [0, 0, 1], false), M4(), (x, y, z, nx, ny, nz, i) => (i < 8 ? C.horn1 : C.horn2), kG);
            const eb = [side * G.ear.b[0], G.ear.b[1], G.ear.b[2]], et = [side * G.ear.t[0], G.ear.t[1], G.ear.t[2]], d = v3.sub(et, eb), L = hypot(...d);
            addGeo(THREE, acc, new THREE.ConeGeometry(G.ear.rb * 0.9, L, 4, 1, true).translate(0, L / 2, 0), M4().compose(V(eb), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), V([1, 1, 0.5])), (x, y, z, nx, ny, nz) => (nz > 0.3 ? C.inner : C.fur), kF);
            const p = rayHit(F.headCore, [side * G.eye.x, G.eye.y, 0.6], [0, 0, -1], 0, 0.8) || [side * 0.13, 0.776, 0.16];
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 3), M4().compose(V(v3.add(p, [0, 0, 0.012])), new THREE.Quaternion(), V([0.05, 0.036, 0.026])), [0.9, 0.88, 0.84], kP);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 2), M4().compose(V(v3.add(p, [side * 0.004, 0.0, 0.032])), new THREE.Quaternion(), V([0.022, 0.024, 0.012])), C.nostril, kP);
            addGeo(THREE, acc, new THREE.BoxGeometry(0.11, 0.026, 0.02), M4().compose(V(v3.add(p, [side * 0.01, 0.07, 0.01])), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -side * 0.15)), V([1, 1, 1])), C.brow, kP);
          }
          // the grin: a white tooth bar under a dark lip
          const mp = rayHit(F.faceF, [0, 0.528, 0.6], [0, 0, -1], 0, 0.8) || [0, 0.53, 0.3];
          addGeo(THREE, acc, new THREE.SphereGeometry(1, 6, 3), M4().compose(V(v3.add(mp, [0, 0, -0.008])), new THREE.Quaternion(), V([0.13, 0.03, 0.02])), C.teeth, kP);
          addGeo(THREE, acc, new THREE.TorusGeometry(0.04, 0.009, 3, 8), M4().makeTranslation(0, 0.6, 0.31), C.ring, kG);
          snap(F.torsoF, [0, 0.3, -0.03], 8, 6, 0.4, (x, y, z) => (y < 0.44 && hypot(abs(x) - 0.25, y - 0.37) > 0.1 ? C.vest : C.fur), kF);
          const cyl = (A, B, ra, rb, col) => {
            const d = v3.sub(B, A), L = hypot(...d), c = new THREE.CylinderGeometry(rb, ra, L, 5, 1, true);
            addGeo(THREE, acc, c, M4().compose(V(v3.add(A, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), V([1, 1, 1])), col, kF);
          };
          for (const s of [1, -1]) {
            const X = (p) => [s * p[0], p[1], p[2]];
            cyl(X(G.S), X(G.El), 0.085, 0.075, C.fur); cyl(X(G.El), X(F.Wr), 0.078, 0.066, C.fur);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.064, 5, 3), M4().makeTranslation(...X(F.pawC)), C.gold, kG);
            cyl(X(G.Hp), X(G.K), 0.104, 0.086, C.fur); cyl(X(G.K), X(G.F), 0.08, 0.062, C.fur);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 3), M4().compose(V(X(F.FC)), new THREE.Quaternion(), V([0.076, 0.06, 0.09])), C.gold, kG);
          }
          const tp = new THREE.CatmullRomCurve3(G.tail.pts.map((p) => V(p))).getPoints(4).map((p) => [p.x, p.y, p.z]);
          addGeo(THREE, acc, taperTube(THREE, tp, tp.map(() => 0.022), tp.map(() => 0.022), 3, [0, 0, 1], true), M4(), C.fur, kF);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          geo.setIndex(new THREE.Uint16BufferAttribute(acc.I, 1));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, toon); mesh.name = 'bull-far';
          const group = new THREE.Group(); group.name = 'bull-far'; group.add(mesh);
          const stats = { tris: acc.I.length / 3, verts: acc.n, ms: Math.round(now() - T0), parts: { far: acc.I.length / 3 }, headShare: headShare(F) };
          const sq = { k: 1, v: 0 };
          const api = {
            level: 'far', mesh, stats, names: [], bones: null,
            set() { return api; }, setExpression() { return api; }, setGaze() { return api; }, look() { return api; }, blink() { return api; }, steer() { return api; },
            squash(k) { sq.k = k; mesh.scale.set(1 / sqrt(k), k, 1 / sqrt(k)); return api; }, kick(v) { sq.v += v; },
            update(dt) { const a = -220 * (sq.k - 1) - 14 * sq.v; sq.v += a * dt; sq.k += sq.v * dt; mesh.scale.set(1 / sqrt(sq.k), sq.k, 1 / sqrt(sq.k)); },
          };
          group.userData.racer = group.userData.bull = api;
          group.userData.stats = stats;
          return group;
        }

        /* ------------------------------------------------------------------ the live layer (Pepe / dogs API) */
        function rig(THREE, o) {
          const { sstep, lerp } = DF().util;
          const { bones: B, eyeMat, stats, names } = o;
          const Uu = eyeMat.userData.uniforms;
          const rest = {}; for (const k in B) rest[k] = B[k].quaternion.clone();
          Uu.uIrisC.value.set('#6E3A0E');
          const N0 = EX.neutral, NM = names.length ? names : NAMES;
          const st = { w: {}, target: null, gaze: null, look: [0, 0], blink: 0, autoBlink: true, nextBlink: 2 + Math.random() * 3, blinkT: -1, sq: 1, sqV: 0, steer: 0 };
          NM.forEach((n) => { st.w[n] = 0; });
          const springs = ['tail0', 'tail1', 'tail2', 'ring', 'earL', 'earR'].map((n) => ({ n, a: 0, v: 0, b: 0, bv: 0 }));
          const qx = new THREE.Quaternion(), e = new THREE.Euler();
          const blend = (key) => { let v = N0[key]; for (const k of NM) v += st.w[k] * (EX[k][key] - N0[key]); return v; };
          function apply() {
            let gx = N0.gaze[0], gy = N0.gaze[1];
            for (const k of NM) { gx += st.w[k] * (EX[k].gaze[0] - N0.gaze[0]); gy += st.w[k] * (EX[k].gaze[1] - N0.gaze[1]); }
            if (st.gaze) { gx = st.gaze[0]; gy = st.gaze[1]; }
            gx += st.look[0]; gy += st.look[1];
            Uu.uGazeL.value.set(gx, gy, 1).normalize(); Uu.uGazeR.value.set(gx, gy, 1).normalize();
            Uu.uPupil.value = blend('pupil'); Uu.uIris.value = blend('iris'); Uu.uSpark.value = blend('spark');
            const happy = blend('happy');
            let lu = blend('lidU'), ll = blend('lidLo');
            lu = lerp(lu, -1.5, max(sstep(0.3, 0.7, happy), st.blink)); ll = lerp(ll, -0.62, sstep(0.3, 0.7, happy));
            Uu.uLid.value = lu;
            for (const s of ['L', 'R']) {
              B['lid' + s].quaternion.copy(rest['lid' + s]).multiply(qx.setFromEuler(e.set(-lu, 0, 0)));
              B['low' + s].quaternion.copy(rest['low' + s]).multiply(qx.setFromEuler(e.set(-ll, 0, 0)));
              B['arc' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, happy)));
            }
            if (o.mesh.morphTargetInfluences) NM.forEach((n, i) => { o.mesh.morphTargetInfluences[i] = st.w[n] || 0; });
            B.head.quaternion.copy(rest.head).multiply(qx.setFromEuler(e.set(0.04 + blend('pitch'), st.steer * 0.25, blend('roll') - st.steer * 0.05)));
            B.body.rotation.set(0, 0, -st.steer * 0.05);
            B.root.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
            const ear = blend('ear');
            for (const s of springs) {
              if (s.n[0] === 'e') { const side = s.n === 'earL' ? 1 : -1; B[s.n].quaternion.copy(rest[s.n]).multiply(qx.setFromEuler(e.set(s.a, s.b, side * ear * 0.55))); }
            }
          }
          const api = {
            level: o.level, bones: B, mesh: o.mesh, names: NM, EXPR: EX, stats,
            set(weights) { for (const k of NM) st.w[k] = weights && weights[k] ? weights[k] : 0; st.target = null; apply(); return api; },
            setExpression(name, instant) { st.target = name; if (instant) { for (const k of NM) st.w[k] = k === name ? 1 : 0; apply(); } return api; },
            setGaze(x, y) { st.gaze = x === null || x === undefined ? null : [x, y || 0]; apply(); return api; },
            look(x, y) { st.look[0] = x; st.look[1] = y; apply(); return api; },
            blink(v) { st.blink = v || 0; st.autoBlink = v === undefined; apply(); return api; },
            squash(k) { st.sq = k; apply(); return api; },
            kick(v) { st.sqV += v; },
            steer(v) { st.steer = v; apply(); return api; },
            update(dt, inp) {
              inp = inp || {};
              if (st.target !== null) { const k = 1 - exp(-dt * 12); for (const n of NM) st.w[n] += ((n === st.target ? 1 : 0) - st.w[n]) * k; }
              if (st.autoBlink && blend('happy') < 0.5) {
                st.nextBlink -= dt;
                if (st.nextBlink <= 0 && st.blinkT < 0) { st.blinkT = 0; st.nextBlink = 2 + Math.random() * 3; }
                if (st.blinkT >= 0) { st.blinkT += dt; const u = st.blinkT / 0.16; st.blink = u < 0.4 ? u / 0.4 : max(0, 1 - (u - 0.4) / 0.6); if (u >= 1) { st.blinkT = -1; st.blink = 0; } }
              }
              const a = -220 * (st.sq - 1) - 14 * st.sqV; st.sqV += a * dt; st.sq += st.sqV * dt;
              const acc = inp.accel || 0, turn = inp.steer || 0;
              for (const s of springs) {
                const isEar = s.n[0] === 'e', isRing = s.n === 'ring', k = isEar ? 260 : isRing ? 180 : 120, d = isEar ? 14 : isRing ? 6 : 9;
                const ta = (isEar ? -0.08 : isRing ? 0.5 : 0.25) * acc, tb = (isEar ? 0.1 : isRing ? -0.4 : -0.3) * turn;
                s.v += (k * (ta - s.a) - d * s.v) * dt; s.a += s.v * dt;
                s.bv += (k * (tb - s.b) - d * s.bv) * dt; s.b += s.bv * dt;
                if (!isEar) B[s.n].quaternion.copy(rest[s.n]).multiply(qx.setFromEuler(isRing ? e.set(s.a, 0, s.b) : e.set(s.a, s.b, 0)));
              }
              apply();
            },
          };
          apply();
          return api;
        }

        /* ================================================================== STAMPEDE: the bull's hot-rod kart
         * Candy-teal over black, a LOT of chrome: an exposed engine with a blower and scoop on the nose, a classic upright
         * radiator grille, bullet headlamps, a dropped front axle on skinny wheels, fat rear slicks on chrome deep-dish rims,
         * side pipes that sweep back and rise into two tall exhaust STACKS behind the seat (the racer's back-view signature),
         * gold-to-red flames licking back along the flanks. Original hot-rod vocabulary; no marques, no numbers. */
        function Stampede(THREE, KIT, detail, opts) {
          const KK = root.DogKartKit, U = DF().util, { sstep, smin, smax, mix3, v3 } = U;
          const WHEELS = [[0.47, 0.8, 0.15, 0.1], [-0.47, 0.8, 0.15, 0.1], [0.6, -0.56, 0.255, 0.25], [-0.6, -0.56, 0.255, 0.25]];
          const bodyF = (x, y, z) => {
            const tub = rbox(x, y, z, [0, 0.32, -0.2], [0.3, 0.17, 0.4], 0.13);
            const nose = rbox(x, y, z, [0, 0.29, 0.56], [0.19, 0.125, 0.42], 0.1);
            return smin(tub, nose, 0.1);
          };
          const design = {
            name: 'stampede', gloss: 0.16, whitewall: false, rimRing: true, strip: [0.006, 0.01], coamingK: 'chrome', hubK: 'chrome',
            box: [-0.5, 0.08, -0.72, 0.5, 0.56, 1.06], farC: [0, 0.3, 0.05], wheels: WHEELS, bodyF,
            seamY: (x, z) => 0.272,
            palette: {
              top: '#0E9AA4', topDk: '#086870', low: '#17181C', lowDk: '#0B0C0E', inside: '#1A1A1E',
              chrome: '#D2D8E0', chromeDk: '#7C848E', lamp: '#FFF3C2', tail: '#B80F0A', coaming: '#D2D8E0',
              chSky: '#F6F9FC', chMid: '#A9B2BD', chGnd: '#3A4048', chLow: '#6E7782',
              seat: '#2B1F22', seatHi: '#4A3338', tyre: '#1C1D21', wall: '#1C1D21', hub: '#C3CAD3', cap: '#FFC93C',
              rim: '#1E1E22', hubS: '#FFC93C', engine: '#2A2C31', grille: '#14161A', flame0: '#FFD24A', flame1: '#FF8A1E', flame2: '#E2342A',
            },
            far(c) {
              const { THREE: T, U: u, C, K, body, M4 } = c;
              for (const s of [1, -1]) u.addGeo(T, body, u.taperTube(T, [[s * 0.37, 0.27, 0.1], [s * 0.37, 0.3, -0.38], [s * 0.37, 1.0, -0.47]], [0.04, 0.045, 0.055], [0.04, 0.045, 0.055], 4, [1, 0, 0], false), M4(), C.chrome, K.chrome, 0);
              u.addGeo(T, body, new T.BoxGeometry(0.22, 0.12, 0.34), M4().makeTranslation(0, 0.46, 0.62), C.engine, K.matte, 0);
              u.addGeo(T, body, new T.BoxGeometry(0.17, 0.12, 0.24), M4().makeTranslation(0, 0.6, 0.62), C.chromeDk, K.chrome, 0);
              u.addGeo(T, body, new T.BoxGeometry(0.28, 0.27, 0.05), M4().makeTranslation(0, 0.43, 0.99), (x, y, z, nx, ny, nz) => (nz > 0.5 ? C.grille : C.chromeDk), K.chrome, 0);
              for (const s of [1, -1]) u.addGeo(T, body, new T.BoxGeometry(0.06, 0.06, 0.06), M4().makeTranslation(s * 0.29, 0.47, 0.9), C.lamp, K.glow, 0);
            },
            details(c) {
              const { THREE: T, U: u, C, K, LV, body, M4, V, Q, done, onBody } = c;
              const rb = c.rboxG, hi = LV.loop > 40, tube = LV.tube, seg = LV.wheel[0];
              const P = (g, p, q, col, k) => u.addGeo(T, body, g, M4().compose(V(p), q || new T.Quaternion(), V([1, 1, 1])), col === C.chrome ? CH : col, k, 0);
              // toy chrome: a sky-to-ground horizon reflection baked into the colour (reads as metal under any light)
              const CH = (x, y, z, nx, ny) => (ny >= -0.04 ? mix3(C.chMid, C.chSky, sstep(-0.04, 0.7, ny)) : mix3(C.chGnd, C.chLow, sstep(-0.9, -0.12, ny)));
              /* engine on the nose: block, V rocker covers, blower, scoop, front pulley */
              P(rb(0.24, 0.12, 0.38, 0.03), [0, 0.46, 0.62], null, C.engine, K.matte);
              for (const s of [1, -1]) P(rb(0.075, 0.05, 0.34, 0.02), [s * 0.1, 0.52, 0.62], Q(0, 0, s * 0.55), C.chrome, K.chrome);
              P(rb(0.19, 0.1, 0.26, 0.035), [0, 0.58, 0.62], null, C.chrome, K.chrome);
              if (LV.detail) for (let i = 0; i < (hi ? 5 : 3); i++) P(new T.BoxGeometry(0.2, 0.012, 0.012), [0, 0.632, 0.53 + i * (hi ? 0.045 : 0.075)], null, C.chromeDk, K.chrome);
              P(rb(0.16, 0.08, 0.15, 0.03), [0, 0.665, 0.64], Q(-0.08, 0, 0), C.chrome, K.chrome);
              P(rb(0.12, 0.045, 0.02, 0.012), [0, 0.67, 0.72], Q(-0.08, 0, 0), C.grille, K.matte);
              P(new T.CylinderGeometry(0.05, 0.05, 0.03, seg).rotateX(PI / 2), [0, 0.47, 0.82], null, C.chrome, K.chrome);
              /* headers -> side pipes -> exhaust stacks */
              for (const s of [1, -1]) {
                const path = [[s * 0.25, 0.34, 0.56], [s * 0.33, 0.29, 0.4], [s * 0.36, 0.265, 0.15], [s * 0.37, 0.265, -0.22], [s * 0.375, 0.32, -0.4], [s * 0.375, 0.5, -0.45], [s * 0.37, 0.98, -0.5]];
                const cv = new T.CatmullRomCurve3(path.map((p) => V(p)), false, 'catmullrom', 0.3), n = hi ? 22 : LV.detail ? 14 : 8;
                const pts = cv.getPoints(n).map((p) => [p.x, p.y, p.z]), r = pts.map((_, i) => 0.032 + 0.016 * sstep(0.55, 0.85, i / n));
                u.addGeo(T, body, u.taperTube(T, pts, r, r, tube + 2, [1, 0, 0], false), M4(), CH, K.chrome, 0);
                // a flared, slash-cut top: a short cone, dark inside, a heat ring lower down
                const tp = pts[n], dirT = v3.norm(v3.sub(pts[n], pts[n - 1])), qT = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), V(dirT));
                P(new T.CylinderGeometry(0.062, 0.048, 0.07, seg, 1, true).translate(0, 0.035, 0), tp, qT, C.chrome, K.chrome);
                P(new T.CircleGeometry(0.058, seg).rotateX(-PI / 2).translate(0, 0.06, 0), tp, qT, C.grille, K.matte);
                if (LV.detail) P(new T.TorusGeometry(0.05, 0.008, 4, seg).rotateX(PI / 2), v3.add(tp, dirT, -0.32), qT, C.engine, K.matte);
                // headers: three short pipes from the block side into the collector
                if (LV.detail) for (let k = 0; k < 3; k++) {
                  const z0 = 0.52 + k * 0.08, hp = [[s * 0.12, 0.47, z0], [s * 0.2, 0.42, z0 - 0.02], [s * 0.26, 0.35, 0.56 - 0.03 * k], [s * 0.31, 0.31, 0.46]];
                  const hcv = new T.CatmullRomCurve3(hp.map((p) => V(p))).getPoints(hi ? 6 : 4).map((p) => [p.x, p.y, p.z]);
                  u.addGeo(T, body, u.taperTube(T, hcv, hcv.map(() => 0.016), hcv.map(() => 0.016), max(4, tube - 1), [1, 0, 0], false), M4(), CH, K.chrome, 0);
                }
              }
              /* radiator grille shell, dark core, chrome bars */
              const gq = Q(-0.12, 0, 0);
              P(rb(0.31, 0.3, 0.07, 0.05), [0, 0.43, 0.985], gq, C.chrome, K.chrome);
              P(rb(0.24, 0.23, 0.02, 0.035), [0, 0.43, 1.035], gq, C.grille, K.matte);
              if (LV.detail) for (let i = 0; i < (hi ? 7 : 4); i++) { const xs = -0.09 + i * (0.18 / ((hi ? 7 : 4) - 1)); P(new T.BoxGeometry(0.012, 0.21, 0.014), [xs, 0.43, 1.046], gq, C.chrome, K.chrome); }
              /* bullet headlamps on stalks */
              for (const s of [1, -1]) {
                const hp = [s * 0.29, 0.47, 0.9];
                u.addGeo(T, body, new T.SphereGeometry(0.06, hi ? 14 : 8, hi ? 7 : 4, 0, PI * 2, 0, PI), M4().compose(V(v3.add(hp, [0, 0, -0.03])), new T.Quaternion(), V([1, 1, 1.5])), CH, K.chrome, 0);
                P(new T.CircleGeometry(0.048, seg), v3.add(hp, [0, 0, 0.061]), null, C.lamp, K.glow);
                u.addGeo(T, body, u.taperTube(T, [v3.add(hp, [0, -0.04, -0.03]), [s * 0.26, 0.3, 0.84]], [0.013, 0.013], [0.013, 0.013], 5, [1, 0, 0], false), M4(), C.chromeDk, K.chrome, 0);
              }
              /* dropped front axle + radius rods; rear axle with a chrome diff */
              const fa = []; for (let i = 0; i <= 8; i++) { const s = -1 + 2 * i / 8; fa.push([s * 0.47, 0.15 - 0.035 * (1 - s * s), 0.8]); }
              u.addGeo(T, body, u.taperTube(T, fa, fa.map(() => 0.02), fa.map(() => 0.026), tube, [0, 0, 1], true), M4(), CH, K.chrome, 0);
              for (const s of [1, -1]) u.addGeo(T, body, u.taperTube(T, [[s * 0.4, 0.15, 0.8], [s * 0.17, 0.2, 0.4]], [0.012, 0.012], [0.012, 0.012], 5, [0, 1, 0], false), M4(), C.chromeDk, K.chrome, 0);
              u.addGeo(T, body, u.taperTube(T, [[-0.56, 0.255, -0.56], [0.56, 0.255, -0.56]], [0.034, 0.034], [0.034, 0.034], tube, [0, 1, 0], false), M4(), C.low, K.matte, 0);
              P(new T.SphereGeometry(0.085, hi ? 12 : 7, hi ? 6 : 4), [0, 0.24, -0.58], null, C.chrome, K.chrome);
              /* rear nerf bar and tail lamps */
              const nb = []; for (let i = 0; i <= (hi ? 12 : 6); i++) { const s = -1 + 2 * i / (hi ? 12 : 6); nb.push([s * 0.3, 0.27, -0.7 - 0.05 * (1 - s * s)]); }
              u.addGeo(T, body, u.taperTube(T, nb, nb.map(() => 0.02), nb.map(() => 0.02), tube, [0, 1, 0], true), M4(), CH, K.chrome, 0);
              for (const s of [1, -1]) {
                u.addGeo(T, body, u.taperTube(T, [[s * 0.26, 0.27, -0.71], [s * 0.24, 0.27, -0.6]], [0.012, 0.012], [0.012, 0.012], 5, [0, 1, 0], false), M4(), C.chromeDk, K.chrome, 0);
                const tl = onBody([s * 0.2, 0.38, -0.72], 0.0);
                u.addGeo(T, body, new T.SphereGeometry(0.035, LV.detail ? 12 : 6, LV.detail ? 6 : 3), M4().compose(V(tl.p), new T.Quaternion(), V([1, 0.8, 0.5])), C.tail, K.glow, 0);
              }
              /* flames: tapered tongues laid on the flanks, gold at the root to red at the tip */
              if (LV.detail) {
                const tongues = [[0.36, 1.08, 0.43, 0.014, 0.046], [0.335, 0.9, 0.33, -0.014, 0.038], [0.39, 0.74, 0.46, 0.016, 0.032], [0.32, 0.62, 0.31, -0.012, 0.028]];
                for (const s of [1, -1]) for (const [y0, len, yE, wob, wd] of tongues) {
                  const n = hi ? 9 : 6, pts = [], ns = [], rx = [], ry = [];
                  for (let i = 0; i <= n; i++) {
                    const u2 = i / n, z = 0.92 - len * u2, y = y0 + (yE - y0) * u2 + wob * sin(u2 * PI * 2.2);
                    const q = onBody([s * 0.4, y, z], 0.0025); pts.push(q.p); ns.push(q.n);
                    rx.push(wd * (u2 < 0.12 ? 0.5 + 4 * u2 : 1 - 0.95 * sstep(0.12, 1, u2) ** 0.8)); ry.push(0.0025);
                  }
                  u.addGeo(T, body, u.taperTube(T, pts, rx, ry, 4, (i) => ns[i], false), M4(), (x, y, z, nx, ny, nz, i) => {
                    const k = Math.floor(i / 4) / n; return mix3(mix3(C.flame0, C.flame1, sstep(0.1, 0.5, k)), C.flame2, sstep(0.55, 0.95, k));
                  }, K.paint, 0);
                }
              }
              done('details');
              void smax;
            },
          };
          return KK.make(design, THREE, KIT, detail, opts);
        }

        const api = { bull: build, kart: Stampede, EXPR: EX, NAMES, LEVELS, G };
        root.BullRun = api;
      })(KR);

      /* Meme Kart: BIG BEAR + the SELL-OFF (scratch recipe, 6 Oct 2026). An ORIGINAL rival: a grumpy, lovable market bear
       * in a heavy armoured dump-truck kart. Built in code on the roster's pipeline (SDF -> marching cubes, every vertex
       * pulled onto the exact surface with the analytic normal), on the dogs' shared helpers and gm-kart-toon material.
       *
       *   BigBear (THREE, K, detail, opts) -> THREE.Group      character (budgets 15k / 7.5k / 2.8k / 0.65k)
       *   SellOff (THREE, K, detail, opts) -> THREE.Group      kart      (budgets 12k / 6k / 2k / 0.5k)
       *     K      = the endo marching-cubes kit (endo-kit.js)
       *     detail = 'desktop' | 'phone' | 'mid' | 'far'
       *     opts   = { toon: <shared gm-kart-toon>, eyeMat: <this racer's gm-kart-eye-dog material> }
       *   Needs dog.js (DogFinal: util + toonMaterial + eyeMaterial) and this folder's kart-kit.js (BearKartKit).
       *
       * The bear: deep-brown fur, a tan muzzle that sits proud of the face (its own mesh: a crisp paint line), round ears
       * pushed through a ribbed crimson beanie with a cream pompom and a knitted falling-chart glyph on the cuff, heavy dark
       * brows, rosy blush discs, an underbite with two little lower fangs. Grumpy by default, but lovable (celebrate =
       * happy-arc eyes, puffed blush, a big reluctant grin). Every colour region is a separate mesh: fur head, ears,
       * inner ears, muzzle, beanie, pompom, body fur, belly patch.
       * Expressions = 4 morph targets (grumpy, growl, hit, celebrate) made the dogs' way: head fur re-projected onto the
       * expression SDF (cheeks), face parts (mouth, philtrum, fangs, brows, blush, tongue) rebuilt at a fixed topology;
       * bone poses (lids incl. their grumpy tilt, happy arcs, gaze, pupils, head roll, ears) blend with the same weights.
       *
       * Units metres, +Z forward, +Y up, origin = seat contact under the pelvis. Paws at ten-and-two on BigBear.WHEEL
       * (the kart builds its wheel there). Draw calls: 2 (SkinnedMesh in gm-kart-toon + one eye mesh). 'far' = 1 Mesh.
       * group.userData.racer (= .bear) = { set, setExpression, setGaze, look, blink, squash, kick, steer, update, names,
       *   bones, mesh, stats }   (the Pepe / dogs API)
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, exp, atan2 } = Math;
        const { sat, clamp, lerp, sstep, smin, smax, ell, E6, cap, v3, mix3 } = root.DogFinal.util;
        const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

        /* ------------------------------------------------------------------ the steering wheel (a bigger driver: higher, further) */
        const WHEEL = { c: [0, 0.37, 0.46], r: 0.15, tilt: 0.5, grip: 0.5 };
        const WH = (() => {
          const W = WHEEL, up = [0, cos(W.tilt), sin(W.tilt)], nrm = [0, -sin(W.tilt), cos(W.tilt)];
          const a = W.grip, rad = v3.norm(v3.add([cos(a), 0, 0], up, sin(a)));
          return { up, nrm, rad, H: v3.add(W.c, rad, W.r) };
        })();

        /* ------------------------------------------------------------------ shape */
        const S = {
          name: 'bear',
          cran: [0, 0.8, -0.02, 0.29, 0.275, 0.265],
          cheek: [0.152, 0.685, 0.015, 0.18, 0.16, 0.165], cheekK: 0.09,           // wide jowls: the bear's square face
          brow: [0.1, 0.878, 0.118, 0.118, 0.058, 0.1], browK: 0.045,              // a heavy brow shelf over small eyes
          muz: [0, 0.688, 0.19, 0.138, 0.1, 0.128], jaw: [0, 0.63, 0.155, 0.108, 0.056, 0.1], muzIn: 0.024,
          nose: { y: 0.748, r: [0.066, 0.043, 0.042], dz: -0.014 },
          eye: { x: 0.11, y: 0.81, r: 0.05, prot: 0.019, fwd: 0.55 },
          ear: { c: [0.205, 1.03, -0.07], r: [0.09, 0.088, 0.046], tilt: 0.52, yaw: 0.32 },
          beanie: { off: 0.026, edge: [0.878, 0.25], cuffH: 0.072, cuffOff: 0.05, ribs: 22, ribA: 0.0038 },
          torso: [0, 0.27, -0.06, 0.255, 0.29, 0.2], belly: [0, 0.185, 0.03, 0.25, 0.19, 0.21], chest: [0, 0.45, -0.05, 0.255, 0.11, 0.165],
          patch: [0, 0.245, 0.065, 0.165, 0.2, 0.185],
          Sh: [0.215, 0.44, -0.05], El: [0.315, 0.29, 0.14], armR: [0.092, 0.08, 0.072], paw: [0.078, 0.066, 0.084],
          Hp: [0.12, 0.1, 0.02], K: [0.17, 0.2, 0.25], F: [0.17, 0.08, 0.38], foot: [0.08, 0.062, 0.1],
          neck: [0, 0.54, -0.03],
        };
        const BN = S.beanie;
        const yEdge = (z) => BN.edge[0] + BN.edge[1] * z;
        const POM = { c: [0, S.cran[1] + S.cran[4] + BN.off + 0.065, S.cran[2] - 0.03], r: 0.098 };

        /* ------------------------------------------------------------------ expressions */
        const D2R = PI / 180;
        const BM = (o) => Object.assign({ w: 0.07, y: 0.655, curve: -0.012, wob: 0.0, open: 0, openW: 0.7, tongue: 0, fang: 0.7, fangU: 0 }, o);
        const EXT = {
          neutral:   { mouth: BM({}), brow: { dy: -0.004, ang: 0.3, dx: 0 }, cheek: 0, gaze: [0, 0.0], lidU: 0.36, lidLo: -0.92, lidT: 0.2, happy: 0, pupil: 0.24, iris: 0.46, spark: 0, roll: 0, ear: 0 },
          grumpy:    { mouth: BM({ w: 0.074, curve: -0.026, wob: 0.0016, fang: 1 }), brow: { dy: -0.016, ang: 0.6, dx: -0.01 }, cheek: 0.15, gaze: [0, -0.04], lidU: 0.1, lidLo: -0.72, lidT: 0.4, happy: 0, pupil: 0.25, iris: 0.47, spark: 0, roll: -3 * D2R, ear: -0.18 },
          growl:     { mouth: BM({ w: 0.084, y: 0.66, curve: -0.006, open: 0.058, openW: 0.9, tongue: 0.45, fang: 1.35, fangU: 1.1 }), brow: { dy: -0.022, ang: 0.75, dx: -0.012 }, cheek: 0.45, gaze: [0, 0.02], lidU: 0.0, lidLo: -0.62, lidT: 0.48, happy: 0, pupil: 0.2, iris: 0.42, spark: 0, roll: 0, ear: -0.45 },
          hit:       { mouth: BM({ w: 0.06, y: 0.652, curve: 0.01, wob: 0.0055, open: 0.034, openW: 0.55, fang: 0.35 }), brow: { dy: 0.03, ang: -0.5, dx: 0.004 }, cheek: 0, gaze: [0, 0.05], lidU: 1.15, lidLo: -1.2, lidT: -0.18, happy: 0, pupil: 0.11, iris: 0.3, spark: 0, roll: 8 * D2R, ear: -0.6 },
          celebrate: { mouth: BM({ w: 0.088, y: 0.662, curve: 0.034, open: 0.046, openW: 0.82, tongue: 1, fang: 0.6 }), brow: { dy: 0.02, ang: -0.08, dx: 0 }, cheek: 1, gaze: [0, 0], lidU: 0.5, lidLo: -1.0, lidT: 0, happy: 1, pupil: 0.24, iris: 0.46, spark: 0, roll: 6 * D2R, ear: 0.3 },
        };
        const NAMES = ['grumpy', 'growl', 'hit', 'celebrate'];

        /* ------------------------------------------------------------------ the SDF (with an expression) */
        function bearSDF(E, rib) {
          E = E || {};
          const cr = S.cran;
          const cheekE = S.cheek.slice(), pf = E.cheek || 0;
          cheekE[1] += 0.012 * pf; cheekE[2] += 0.01 * pf; cheekE[3] *= 1 + 0.05 * pf; cheekE[4] *= 1 + 0.05 * pf;
          const muzzleF = (x, y, z) => smin(E6(x, y, z, S.muz), E6(x, y, z, S.jaw), 0.035);
          const headCore = (x, y, z) => {
            const ax = abs(x);
            let d = E6(x, y, z, cr);
            d = smin(d, E6(ax, y, z, cheekE), S.cheekK);
            d = smin(d, E6(ax, y, z, S.brow), S.browK);
            return d;
          };
          const furHead = (x, y, z) => smin(headCore(x, y, z), muzzleF(x, y, z) + S.muzIn, 0.06);
          const faceF = (x, y, z) => min(furHead(x, y, z), muzzleF(x, y, z));
          // ears: a round disc with a front bowl, leaning out; the tan inner ear is its own disc in the bowl
          const EA = S.ear, eUp = v3.norm([sin(EA.tilt), cos(EA.tilt), 0]);
          let eFw = [sin(EA.yaw), 0, cos(EA.yaw)]; eFw = v3.norm(v3.sub(eFw, v3.scale(eUp, v3.dot(eFw, eUp)))); const eSd = v3.cross(eUp, eFw);
          const eL = (ax, y, z, o) => { const q0 = ax - EA.c[0], q1 = y - EA.c[1], q2 = z - EA.c[2]; o[0] = q0 * eSd[0] + q1 * eSd[1] + q2 * eSd[2]; o[1] = q0 * eUp[0] + q1 * eUp[1] + q2 * eUp[2]; o[2] = q0 * eFw[0] + q1 * eFw[1] + q2 * eFw[2]; return o; };
          const tmp = [0, 0, 0];
          const earF = (x, y, z) => {
            eL(abs(x), y, z, tmp);
            const o = ell(tmp[0], tmp[1], tmp[2], EA.r[0], EA.r[1], EA.r[2]);
            const bowl = ell(tmp[0], tmp[1] - 0.006, tmp[2] - 0.032, EA.r[0] * 0.7, EA.r[1] * 0.68, 0.034);
            return smax(o, -bowl, 0.012);
          };
          const innerEarF = (x, y, z) => { eL(abs(x), y, z, tmp); return ell(tmp[0], tmp[1] - 0.006, tmp[2] - 0.004, EA.r[0] * 0.7, EA.r[1] * 0.68, 0.024); };
          // beanie: a ribbed crown shell above the edge plane (low at the back), plus a thick ribbed cuff
          const ribA = rib ? BN.ribA : 0;
          const crOff = (x, y, z, o) => ell(x - cr[0], y - cr[1], z - cr[2], cr[3] + o, cr[4] + o, cr[5] + o);
          const ribF = (x, z) => (ribA ? cos(BN.ribs * atan2(x, z)) : 0);
          const crownF = (x, y, z) => smax(crOff(x, y, z, BN.off) - ribA * ribF(x, z) * sstep(1.12, 0.98, y), yEdge(z) + 0.03 - y, 0.012);
          const cuffF = (x, y, z) => smax(crOff(x, y, z, BN.cuffOff) - 1.5 * ribA * ribF(x, z), abs(y - (yEdge(z) + BN.cuffH / 2)) - BN.cuffH / 2, 0.02);
          const beanieF = (x, y, z) => min(crownF(x, y, z), cuffF(x, y, z));
          const pomF = (x, y, z) => hypot(x - POM.c[0], y - POM.c[1], z - POM.c[2]) - POM.r - (rib ? 0.006 * cos(52 * x) * sin(50 * y) * cos(47 * z) : 0);
          // body
          const H = WH.H, Wr = v3.add(H, v3.norm(v3.sub(S.El, H)), 0.065), pawC = v3.add(H, WH.nrm, -0.014);
          const torsoF = (x, y, z) => smin(smin(E6(x, y, z, S.torso), E6(x, y, z, S.belly), 0.07), E6(x, y, z, S.chest), 0.07);
          const armF = (ax, y, z) => {
            const d = smin(cap(ax, y, z, S.Sh, S.El, S.armR[0], S.armR[1]), cap(ax, y, z, S.El, Wr, S.armR[1], S.armR[2]), 0.04);
            return smin(d, ell(ax - pawC[0], y - pawC[1], z - pawC[2], S.paw[0], S.paw[1], S.paw[2]), 0.04);
          };
          const legF = (ax, y, z) => {
            const d = smin(cap(ax, y, z, S.Hp, S.K, 0.1, 0.085), cap(ax, y, z, S.K, S.F, 0.08, 0.068), 0.04);
            return smin(d, ell(ax - S.F[0], y - S.F[1] + 0.012, z - S.F[2] - 0.04, S.foot[0], S.foot[1], S.foot[2]), 0.04);
          };
          const bodyF = (x, y, z) => { const ax = abs(x); return smin(smin(torsoF(x, y, z), armF(ax, y, z), 0.055), legF(ax, y, z), 0.05); };
          const patchF = (x, y, z) => E6(x, y, z, S.patch);
          return { headCore, furHead, faceF, muzzleF, earF, innerEarF, crownF, cuffF, beanieF, pomF, torsoF, armF, legF, bodyF, patchF, pawC, Wr, eUp, eFw, eSd };
        }

        /* ------------------------------------------------------------------ palette (linear) */
        function palette(THREE) {
          const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
          return {
            fur: c('#5E3B22'), furDk: c('#472B18'), tan: c('#C99A66'), tanHi: c('#DDB585'), inner: c('#D7A273'),
            nose: c('#18100B'), line: c('#2A160D'), brow: c('#2A1810'), blush: c('#E4475A'), blushHi: c('#F27484'),
            beanie: c('#B81F2E'), beanieDk: c('#8A1420'), pom: c('#F4E8D2'), chart: c('#F6EBD3'),
            tooth: c('#FFF7E8'), mouth: c('#3E1218'), mouthHi: c('#6A2430'), tongue: c('#E46A7C'), tongueDk: c('#BF4C62'),
            lid: c('#5E3B22'), lidLo: c('#6A4429'), lidLine: c('#22130A'), claw: c('#EFE2CB'), white: c('#F4EFE6'),
          };
        }

        /* ------------------------------------------------------------------ LOD table */
        const LEVELS = {
          desktop: { head: 0.0295, ear: 0.019, muz: 0.02, body: 0.043, patch: 0.032, beanie: 0.0235, pom: 0.017, eye: [20, 11], lid: [14, 6], rim: [4, 20], tube: 6, extras: true, seg: 1, morph: true, rib: true },
          phone:   { head: 0.043, ear: 0.028, muz: 0.03, body: 0.064, patch: 0.05, beanie: 0.036, pom: 0.027, eye: [14, 8], lid: [10, 4], rim: [3, 14], tube: 4, extras: true, seg: 0.7, morph: true, rib: false },
          mid:     { head: 0.082, ear: 0.05, muz: 0.06, body: 0.12, patch: 0.1, beanie: 0.075, pom: 0.055, eye: [9, 5], lid: [6, 3], rim: [3, 8], tube: 3, extras: false, seg: 0.4, morph: true, rib: false },
          far:     { far: true },
        };

        /* ------------------------------------------------------------------ bones */
        const BONES = ['root', 'body', 'head', 'earL', 'earR', 'lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'pom'];
        const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
        const PARENT = { body: 'root', head: 'body', earL: 'head', earR: 'head', lidL: 'head', lidR: 'head', lowL: 'head', lowR: 'head', arcL: 'head', arcR: 'head', pom: 'head' };

        /* ------------------------------------------------------------------ face helpers (front rays start further out: the snout) */
        function makeFaceHelpers(U) {
          const faceAt = (f, x, y, lift, outN) => {
            const p = U.rayHit(f, [x, y, 0.6], [0, 0, -1], 0, 0.7, 48) || [x, y, 0.2], g = outN || [0, 0, 0];
            U.grad(f, p[0], p[1], p[2], 0.002, g); return v3.add(p, g, lift);
          };
          const onSurface = (f, pts, lift) => pts.map(([x, y]) => faceAt(f, x, y, lift));
          function gridDecal(THREE, f, curveA, curveB, rows, lift, normalBias) {
            const cols = curveA.length, P = [], N = [], I = [], g = [0, 0, 0];
            for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) {
              const u = r / rows, x = lerp(curveA[c][0], curveB[c][0], u), y = lerp(curveA[c][1], curveB[c][1], u);
              const p = faceAt(f, x, y, typeof lift === 'function' ? lift(x, y, u, c / (cols - 1)) : lift, g);
              P.push(p[0], p[1], p[2]);
              const bn = v3.norm([g[0], g[1] + (normalBias || 0), g[2] + (normalBias || 0) * 1.6]); N.push(bn[0], bn[1], bn[2]);
            }
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; I.push(a, b, d, b, e, d); }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setIndex(I);
            return geo;
          }
          return { faceAt, onSurface, gridDecal };
        }

        /* ------------------------------------------------------------------ build the bear */
        function BigBear(THREE, KIT, detail, opts) {
          opts = opts || {};
          const D = root.DogFinal, U = D.util, { Acc, mcPart, addGeo, taperTube, rayHit, grad } = U;
          const { faceAt, onSurface, gridDecal } = makeFaceHelpers(U);
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop;
          const C = palette(THREE);
          const toon = opts.toon || D.toonMaterial(THREE, opts);
          const E0 = EXT.neutral;
          const F = bearSDF(E0, LV.rib);
          if (LV.far) return buildFar(THREE, U, F, C, toon, T0, now, faceAt);
          const stats = { parts: {} };
          const acc = new Acc();
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const qFrom = (dir) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(v3.norm(dir)));
          const tpart = (name, t0) => { stats.parts[name] = (stats.parts[name] || 0) + (acc.I.length - t0) / 3; };
          const ALL = (x, y, z) => min(min(F.faceF(x, y, z), F.bodyF(x, y, z)), min(F.beanieF(x, y, z), F.earF(x, y, z)));
          const aoAt = (x, y, z, nx, ny, nz, step) => {
            let occ = 0;
            for (let s = 1; s <= 4; s++) { const hs = s * step; occ += max(0, 1 - ALL(x + nx * hs, y + ny * hs, z + nz * hs) / hs) / s; }
            return sat(1 - 0.55 * max(0, occ - 0.12));
          };
          const aoStep = detail === 'mid' ? 0.03 : 0.018;
          const shade = (c, ao, lo) => { const k = lo + (1 - lo) * ao; return [c[0] * k, c[1] * k * (0.97 + 0.03 * k), c[2] * k * (0.9 + 0.1 * k)]; };
          const kFur = [0.62, 1, 3, 1], kKnit = [0.82, 0.6, 3, 1];
          const colAO = (base, lo, extra) => (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            let c = typeof base === 'function' ? base(x, y, z, nx, ny, nz) : base;
            if (extra) c = extra(c, x, y, z, nx, ny, nz);
            return shade(c, ao, lo);
          };
          let t = now(), t0;

          /* ---- eyes: on the face, set under the brow shelf */
          const g0 = [0, 0, 0];
          const eyeAt = (side) => {
            const p = rayHit(F.headCore, [side * S.eye.x, S.eye.y, 0.6], [0, 0, -1], 0, 0.8);
            grad(F.headCore, p[0], p[1], p[2], 0.002, g0);
            const dir = v3.norm(v3.lerp(g0, [side * 0.1, 0.0, 1], S.eye.fwd));
            return { c: v3.add(p, dir, -(S.eye.r - S.eye.prot)), dir };
          };
          const EYE = { L: eyeAt(1), R: eyeAt(-1) };
          const eyeQ = (side) => qFrom(side > 0 ? EYE.L.dir : EYE.R.dir);

          /* ---- head fur (no muzzle under it, no crown under the beanie) */
          t0 = acc.I.length;
          const furCol = (x, y, z, nx, ny, nz) => mix3(C.fur, C.furDk, sstep(-0.05, -0.25, z) * 0.35 + sstep(0.2, -0.7, ny) * 0.25);
          const hd = mcPart(KIT, acc, F.furHead, [-0.4, 0.46, -0.33, 0.4, 1.1, 0.36], LV.head, true, colAO(furCol, 0.7),
            (x, y, z) => F.muzzleF(x, y, z) > -0.002 && (F.beanieF(x, y, z) > -0.004), kFur, BI.head);
          tpart('head', t0); t0 = acc.I.length;
          /* ---- muzzle (tan, its own mesh: the fur meets it in a clean line) */
          mcPart(KIT, acc, F.muzzleF, [-0.17, 0.55, 0.0, 0.17, 0.8, 0.34], LV.muz, true,
            colAO((x, y, z, nx, ny) => mix3(C.tan, C.tanHi, sstep(0.0, 0.8, ny) * 0.35), 0.72), (x, y, z) => F.furHead(x, y, z) > -0.002, kFur, BI.head);
          tpart('muzzle', t0); t0 = acc.I.length;
          /* ---- ears + inner ears (ride the ear bones) */
          const er = mcPart(KIT, acc, F.earF, [-0.33, 0.9, -0.17, 0.33, 1.15, 0.05], LV.ear, true, colAO(furCol, 0.72),
            (x, y, z) => F.beanieF(x, y, z) > -0.002 && F.innerEarF(x, y, z) > -0.001, kFur, BI.head);
          const ei = mcPart(KIT, acc, F.innerEarF, [-0.33, 0.9, -0.17, 0.33, 1.15, 0.05], LV.ear, true, colAO(C.inner, 0.75),
            (x, y, z) => F.earF(x, y, z) > -0.0015 && F.beanieF(x, y, z) > -0.002, [0.75, 1, 3, 1], BI.head);
          for (const part of [er, ei]) for (let v = part.v0; v < part.v1; v++) {
            const x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
            const w = sstep(-0.04, 0.03, (x > 0 ? 1 : -1) * 0 + v3.dot(v3.sub([abs(x), y, z], S.ear.c), F.eUp));
            acc.B[3 * v] = BI.head; acc.B[3 * v + 1] = x > 0 ? BI.earL : BI.earR; acc.B[3 * v + 2] = w;
          }
          tpart('ears', t0); t0 = acc.I.length;
          /* ---- beanie (crimson knit) + pompom (cream) */
          mcPart(KIT, acc, F.beanieF, [-0.37, 0.72, -0.35, 0.37, 1.13, 0.33], LV.beanie, true,
            colAO((x, y, z, nx, ny) => mix3(C.beanie, C.beanieDk, sstep(0.3, -0.6, ny) * 0.4), 0.6),
            (x, y, z) => F.earF(x, y, z) > -0.002 && F.pomF(x, y, z) > -0.002, kKnit, BI.head);
          tpart('beanie', t0); t0 = acc.I.length;
          const pm = mcPart(KIT, acc, F.pomF, [-0.1, POM.c[1] - 0.1, POM.c[2] - 0.1, 0.1, POM.c[1] + 0.1, POM.c[2] + 0.1], LV.pom, true,
            colAO(C.pom, 0.68), (x, y, z) => F.beanieF(x, y, z) > -0.002, [0.9, 0.6, 3, 1], BI.head);
          for (let v = pm.v0; v < pm.v1; v++) { const w = sstep(POM.c[1] - 0.07, POM.c[1] + 0.02, acc.P[3 * v + 1]); acc.B[3 * v] = BI.head; acc.B[3 * v + 1] = BI.pom; acc.B[3 * v + 2] = w; }
          tpart('pompom', t0); t0 = acc.I.length;
          /* ---- body fur + tan belly patch */
          const pawC = F.pawC;
          mcPart(KIT, acc, F.bodyF, [-0.42, -0.03, -0.29, 0.42, 0.6, 0.52], LV.body, true, colAO((x, y, z, nx, ny) => {
            const ax = abs(x);
            let c = mix3(C.fur, C.furDk, sstep(0.0, -0.22, z) * 0.3 + sstep(0.1, -0.8, ny) * 0.2);
            const paw = sstep(0.1, 0.06, hypot(ax - pawC[0], y - pawC[1], z - pawC[2]));
            return mix3(c, mul3(C.fur, 0.86), paw);
          }, 0.68), (x, y, z) => F.furHead(x, y, z) > -0.012 && F.patchF(x, y, z) > -0.002, kFur, BI.body);
          tpart('body', t0); t0 = acc.I.length;
          mcPart(KIT, acc, F.patchF, [-0.2, 0.03, -0.1, 0.2, 0.48, 0.28], LV.patch, true, colAO((x, y, z, nx, ny) => mix3(C.tan, C.tanHi, sstep(-0.2, 0.8, ny) * 0.25), 0.66),
            (x, y, z) => F.bodyF(x, y, z) > -0.002, kFur, BI.body);
          tpart('patch', t0); t0 = acc.I.length;
          // claws: three cream nubs on each paw's top
          if (LV.extras) {
            const cg = new THREE.SphereGeometry(1, 6, 4);
            for (const side of [1, -1]) for (let k = 0; k < 3; k++) {
              const pc = [side * pawC[0], pawC[1], pawC[2]];
              const off = v3.add(v3.add(WH.nrm, WH.up, 0.0), [side * (-0.03 + 0.03 * k) * 0.9, 0, 0]);
              const dir = v3.norm([side * (-0.35 + 0.35 * k) * 0.3, 0.55, 1]);
              const o = [pc[0] + side * (-0.028 + 0.028 * k), pc[1] + 0.03, pc[2]];
              const p = rayHit(F.bodyF, v3.add(o, dir, 0.2), v3.scale(dir, -1), 0, 0.25) || o;
              addGeo(THREE, acc, cg, M4().compose(V(v3.add(p, dir, -0.004)), qFrom(dir), V([0.012, 0.01, 0.018])), C.claw, [0.35, 0, 0, 1], BI.body);
              void off;
            }
          }
          tpart('claws', t0);
          stats.sdfMs = Math.round(now() - t); t = now();

          /* ---- nose: a big glossy rounded triangle on the snout */
          t0 = acc.I.length;
          let noseP;
          {
            const p = rayHit(F.faceF, [0, S.nose.y, 0.6], [0, 0, -1], 0, 0.8); noseP = p;
            const g = new THREE.SphereGeometry(1, LV.lid[0], LV.lid[1] + 2), pos = g.attributes.position;
            for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), w = 1 + 0.34 * min(0, y) - 0.06 * max(0, y); pos.setX(i, pos.getX(i) * w); pos.setZ(i, pos.getZ(i) * (1 - 0.18 * max(0, -y))); }
            g.computeVertexNormals();
            addGeo(THREE, acc, g, M4().compose(V(v3.add(p, [0, 0, S.nose.dz])), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)), V(S.nose.r)),
              (x, y, z, nx, ny) => mix3(C.nose, mul3(C.nose, 2.6), sstep(0.2, 0.9, ny) * 0.5), [0.2, 0, 0, 1], BI.head);
          }
          tpart('nose', t0);
          const noseBot = noseP[1] - S.nose.r[1] * 0.9;

          /* ---- the face: everything an expression changes (fixed topology; rebuilt per expression for the morphs) */
          const lineK = [0.5, 0, 0, 0.6], darkK = [0.7, 0, 4, 1];
          const nLine = max(8, Math.round(22 * LV.seg));
          const toothG = new THREE.ConeGeometry(0.0115, 0.024, max(5, LV.lid[0] >> 1), 1).translate(0, 0.012, 0);
          const browG = new THREE.SphereGeometry(1, max(8, LV.lid[0]), max(5, LV.lid[1]));
          const blushG = new THREE.SphereGeometry(1, max(10, LV.lid[0] + 2), max(5, LV.lid[1]));
          function buildFace(A, E, FE) {
            const hf = FE.faceF, fur = FE.furHead, M = E.mouth, g = [0, 0, 0];
            const top = (s) => [s * M.w, M.y + M.curve * s * s + M.wob * sin(s * 9.5)];
            const bot = (s) => { const q = sat(1 - (s / max(0.05, M.openW)) ** 2); const p = top(s); return [p[0], p[1] - M.open * Math.pow(q, 0.6) - 0.0004]; };
            const S1 = [], S2 = [], S3 = [];
            for (let i = 0; i <= nLine; i++) { const s = -1 + 2 * i / nLine; S1.push(top(s)); S2.push(bot(s)); }
            addGeo(THREE, A, gridDecal(THREE, hf, S1, S2, 3, 0.0018, 0.25), M4(), mix3(C.mouth, C.mouthHi, 0.3), darkK, BI.head);
            for (let i = 0; i <= nLine; i++) { const s = -1 + 2 * i / nLine, b = bot(s * 0.5 * M.openW), q = sat(1 - s * s); S3.push([b[0], b[1] + 0.0008 + M.tongue * M.open * 0.5 * Math.pow(q, 0.7)]); }
            const S4 = S3.map((p, i) => { const s = -1 + 2 * i / nLine; return bot(s * 0.5 * M.openW); });
            addGeo(THREE, A, gridDecal(THREE, hf, S4, S3, 2, (x, y, u) => 0.0026 + 0.0035 * u * M.tongue, 0.25), M4(), mix3(C.tongue, C.tongueDk, 0.3), [0.4, 0.4, 0, 1], BI.head);
            // upper lip line + lower lip line
            const sp = onSurface(hf, S1, 0.0016), rr = sp.map((_, i) => 0.0085 * (0.45 + 0.55 * sin(PI * (0.06 + 0.88 * i / nLine))));
            addGeo(THREE, A, taperTube(THREE, sp, rr, rr, LV.tube, [0, 0, 1], true), M4(), C.line, lineK, BI.head);
            const sb = onSurface(hf, S2, 0.0012), rb = sb.map((_, i) => 0.006 * (0.3 + 0.7 * sin(PI * (0.06 + 0.88 * i / nLine))));
            addGeo(THREE, A, taperTube(THREE, sb, rb, rb, max(4, LV.tube - 2), [0, 0, 1], true), M4(), C.line, lineK, BI.head);
            // philtrum: nose to the middle of the lip
            const ph = onSurface(hf, [[0, noseBot], [0, lerp(noseBot, top(0)[1], 0.5)], [0, top(0)[1] + 0.001]], 0.0014);
            addGeo(THREE, A, taperTube(THREE, ph, [0.0075, 0.0068, 0.0062], [0.0075, 0.0068, 0.0062], max(4, LV.tube - 2), [0, 0, 1], true), M4(), C.line, lineK, BI.head);
            // fangs: two little lower ones (the grumpy underbite) and two upper ones that only show in the growl
            for (const [s, up, k] of [[-0.46, 1, M.fang], [0.46, 1, M.fang], [-0.56, -1, M.fangU], [0.56, -1, M.fangU]]) {
              const p2 = up > 0 ? bot(s) : top(s), p = faceAt(hf, p2[0], p2[1], -0.002, g);
              const dir = v3.norm(v3.lerp([0, up, 0], g, 0.3)), kk = max(0.04, k);
              addGeo(THREE, A, toothG, M4().compose(V(p), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(dir)), V([min(1, 0.5 + 0.5 * kk), kk, min(1, 0.5 + 0.5 * kk) * 0.8])),
                (x, y, z, nx, ny) => mix3(C.tooth, mul3(C.tooth, 0.85), sstep(0.3, -0.6, ny) * 0.5), [0.3, 0, 0, 1], BI.head);
            }
            // heavy dark brows on the shelf (inner ends low when grumpy, high when worried)
            for (const side of [1, -1]) {
              const p = rayHit(fur, [side * (0.104 + E.brow.dx), S.eye.y + 0.078 + E.brow.dy, 0.6], [0, 0, -1], 0, 0.8, 40); grad(fur, p[0], p[1], p[2], 0.002, g);
              addGeo(THREE, A, browG, M4().compose(V(v3.add(p, g, -0.002)), qFrom(g).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * E.brow.ang))), V([0.062, 0.02, 0.016])),
                (x, y, z, nx, ny) => mix3(C.brow, mul3(C.brow, 1.8), sstep(0, 1, ny) * 0.5), [0.75, 1, 3, 1], BI.head);
            }
            // rosy blush discs on the jowls (puff up with the cheeks)
            for (const side of [1, -1]) {
              const cp = 0.01 * (E.cheek || 0);
              const p = rayHit(fur, [side * 0.182, 0.718 + cp, 0.6], [0, 0, -1], 0, 0.8, 40) || [side * 0.18, 0.72, 0.18]; grad(fur, p[0], p[1], p[2], 0.002, g);
              const sc = 1 + 0.15 * (E.cheek || 0);
              addGeo(THREE, A, blushG, M4().compose(V(v3.add(p, g, -0.006)), qFrom(g).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 0.25))), V([0.05 * sc, 0.034 * sc, 0.011])),
                (x, y, z, nx, ny) => mix3(C.blush, C.blushHi, sstep(0.3, 1, ny) * 0.5), [0.55, 1, 3, 1], BI.head);
            }
          }
          t0 = acc.I.length;
          const fc0 = acc.n;
          buildFace(acc, E0, F);
          const fc1 = acc.n;
          tpart('face', t0);

          /* ---- eyelids (upper shell + dark rim, lower shell) and happy arcs: authored in the eye frame */
          t0 = acc.I.length;
          const eyeR = S.eye.r, lidR = eyeR + 0.0045;
          const upG = new THREE.SphereGeometry(lidR, LV.lid[0], LV.lid[1], 0, PI * 2, 0, PI / 2);
          const loG = new THREE.SphereGeometry(lidR - 0.0016, LV.lid[0], max(3, LV.lid[1] - 2), 0, PI * 2, PI / 2, PI / 2);
          const rimG = new THREE.TorusGeometry(lidR - 0.002, 0.0062, LV.rim[0], LV.rim[1], PI).rotateX(PI / 2);
          const nA = max(6, Math.round(12 * LV.seg)), tubeA = max(3, LV.tube - 2);
          const arcPts = []; for (let i = 0; i <= nA; i++) { const s = -1 + 2 * i / nA; arcPts.push(v3.scale(v3.norm([0.66 * s, -0.1 + 0.34 * (1 - s * s), 1]), lidR + 0.003)); }
          const arcR = arcPts.map((_, i) => 0.0092 * (0.4 + 0.6 * sin(PI * i / nA)));
          const arcG = taperTube(THREE, arcPts, arcR, arcR, tubeA, [0, 0, 1], true);
          for (const side of [1, -1]) {
            const sfx = side > 0 ? 'L' : 'R';
            addGeo(THREE, acc, upG, M4(), (x, y) => shade(mix3(C.lid, mul3(C.lid, 0.84), sstep(0, lidR, y) * 0.4), 1, 1), [0.6, 1, 3, 0.9], BI['lid' + sfx]);
            addGeo(THREE, acc, rimG, M4(), C.lidLine, [0.45, 0.3, 0, 0.7], BI['lid' + sfx]);
            addGeo(THREE, acc, loG, M4(), (x, y) => shade(C.lidLo, 0.92, 1), [0.6, 1, 3, 0.9], BI['low' + sfx]);
            addGeo(THREE, acc, arcG, M4(), C.lidLine, [0.45, 0, 0, 1], BI['arc' + sfx]);
          }
          tpart('lids', t0); t0 = acc.I.length;

          /* ---- the knitted falling-chart glyph on the cuff front (cream zigzag + arrow head) */
          if (LV.seg > 0.5) {
            const cy = yEdge(0.24) + BN.cuffH / 2;
            const pts2 = [[-0.07, cy + 0.02], [-0.04, cy + 0.0], [-0.018, cy + 0.009], [0.028, cy - 0.016]];
            const sp = onSurface(F.cuffF, pts2, 0.004);
            for (let i = 0; i < 3; i++) { const sg = [sp[i], sp[i + 1]]; addGeo(THREE, acc, taperTube(THREE, sg, [0.0095, 0.0095], [0.0095, 0.0095], LV.tube, [0, 0, 1], true), M4(), C.chart, kKnit, BI.head); }   // ROSTER FIX: bolder stroke (thin, it read as a crack in the knit at race size)
            // a flat arrowhead (an extruded triangle) at the end, pointing down the trend
            const tip = faceAt(F.cuffF, 0.05, cy - 0.028, 0.004, g0), n = g0.slice(), d = v3.norm(v3.sub(tip, sp[3])), sd = v3.norm(v3.cross(n, d));
            const ah = new THREE.BufferGeometry(), b0 = v3.add(tip, d, -0.04), A1 = v3.add(b0, sd, 0.025), A2 = v3.add(b0, sd, -0.025), up = (p, k) => v3.add(p, n, k);
            const P = [...tip, ...A1, ...A2, ...up(tip, 0.006), ...up(A1, 0.006), ...up(A2, 0.006)];
            ah.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); ah.setIndex([3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5]); ah.computeVertexNormals();
            addGeo(THREE, acc, ah, M4(), C.chart, kKnit, BI.head);
          }
          tpart('glyph', t0);
          stats.accMs = Math.round(now() - t); t = now();

          /* ---- geometry + skin; eye-frame parts bound at the eye */
          const nv = acc.n;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
          for (let v = 0; v < nv; v++) { SI[4 * v] = acc.B[3 * v]; SI[4 * v + 1] = acc.B[3 * v + 1]; const f = acc.B[3 * v + 2]; SW[4 * v] = 1 - f; SW[4 * v + 1] = f; }
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
          {
            const pa = geo.attributes.position, na = geo.attributes.normal, vv = new THREE.Vector3(), nn = new THREE.Vector3();
            const eyeBones = new Set(['lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR'].map((n) => BI[n]));
            const qL = eyeQ(1), qR = eyeQ(-1);
            for (let v = 0; v < nv; v++) {
              const b = acc.B[3 * v]; if (!eyeBones.has(b)) continue;
              const side = BONES[b].endsWith('L') ? 1 : -1, E = side > 0 ? EYE.L : EYE.R, q = side > 0 ? qL : qR;
              vv.fromBufferAttribute(pa, v).applyQuaternion(q).add(V(E.c)); pa.setXYZ(v, vv.x, vv.y, vv.z);
              nn.fromBufferAttribute(na, v).applyQuaternion(q); na.setXYZ(v, nn.x, nn.y, nn.z);
            }
          }
          geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));

          /* ---- morph targets: head fur re-projected onto the expression SDF (cheeks), face rebuilt with E */
          const names = [];
          if (LV.morph && !(typeof window !== 'undefined' && window.KartDiag && window.KartDiag.nomorph)) {
            geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
            const g = [0, 0, 0];
            for (const name of NAMES) {
              const E = EXT[name], FE = bearSDF(E, LV.rib), fE = FE.furHead;
              const dP = new Float32Array(nv * 3), dN = new Float32Array(nv * 3);
              if ((E.cheek || 0) !== (E0.cheek || 0)) {
                for (let v = hd.v0; v < hd.v1; v++) {
                  let x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
                  if (z < -0.06 || y > 0.86 || y < 0.46) continue;
                  const lvl = F.furHead(x, y, z);
                  let d = fE(x, y, z) - lvl;
                  if (abs(d) < 2e-5) continue;
                  for (let it = 0; it < 4 && abs(d) > 1e-5; it++) { grad(fE, x, y, z, 0.0015, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; d = fE(x, y, z) - lvl; }
                  grad(fE, x, y, z, 0.002, g);
                  dP[3 * v] = x - acc.P[3 * v]; dP[3 * v + 1] = y - acc.P[3 * v + 1]; dP[3 * v + 2] = z - acc.P[3 * v + 2];
                  dN[3 * v] = g[0] - acc.N[3 * v]; dN[3 * v + 1] = g[1] - acc.N[3 * v + 1]; dN[3 * v + 2] = g[2] - acc.N[3 * v + 2];
                }
              }
              const A = new Acc(); buildFace(A, E, FE);
              if (A.n !== fc1 - fc0) throw new Error('face topology changed for ' + name + ': ' + A.n + ' vs ' + (fc1 - fc0));
              for (let i = 0; i < A.n; i++) { const v = fc0 + i; for (let q = 0; q < 3; q++) { dP[3 * v + q] = A.P[3 * i + q] - acc.P[3 * v + q]; dN[3 * v + q] = A.N[3 * i + q] - acc.N[3 * v + q]; } }
              geo.morphAttributes.position.push(new THREE.Float32BufferAttribute(dP, 3));
              geo.morphAttributes.normal.push(new THREE.Float32BufferAttribute(dN, 3));
              names.push(name);
            }
            geo.morphTargetsRelative = true;
          }
          stats.morphMs = Math.round(now() - t);
          geo.computeBoundingSphere();

          /* ---- skeleton */
          const REST = {
            root: [0, 0, 0], body: [0, 0, 0], head: S.neck, earL: S.ear.c, earR: [-S.ear.c[0], S.ear.c[1], S.ear.c[2]],
            lidL: EYE.L.c, lidR: EYE.R.c, lowL: EYE.L.c, lowR: EYE.R.c, arcL: EYE.L.c, arcR: EYE.R.c, pom: [POM.c[0], POM.c[1] - 0.06, POM.c[2]],
          };
          const bones = {}, list = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; return b; });
          const LOCALQ = { lidL: eyeQ(1), lidR: eyeQ(-1), lowL: eyeQ(1), lowR: eyeQ(-1), arcL: eyeQ(1), arcR: eyeQ(-1) };
          const worldQ = {};
          BONES.forEach((n) => {
            const p = PARENT[n]; if (!p) { worldQ[n] = new THREE.Quaternion(); return; }
            const w = REST[n], pw = REST[p], pq = worldQ[p];
            bones[n].position.copy(V(v3.sub(w, pw)).applyQuaternion(pq.clone().invert()));
            if (LOCALQ[n]) bones[n].quaternion.copy(pq.clone().invert().multiply(LOCALQ[n]));
            worldQ[n] = pq.clone().multiply(bones[n].quaternion);
            bones[p].add(bones[n]);
          });
          const mesh = new THREE.SkinnedMesh(geo, toon); mesh.name = 'bear-skin';
          const group = new THREE.Group(); group.name = 'bear-' + detail;
          group.add(bones.root); group.add(mesh);
          group.updateMatrixWorld(true);
          mesh.bind(new THREE.Skeleton(list));
          mesh.frustumCulled = false;
          if (names.length) { mesh.morphTargetDictionary = {}; names.forEach((k, i) => { mesh.morphTargetDictionary[k] = i; }); mesh.morphTargetInfluences = names.map(() => 0); }

          /* ---- eyeballs: one mesh on the head bone (iris / pupil / catchlights in the shader) */
          const eyeG = new THREE.SphereGeometry(eyeR, LV.eye[0], LV.eye[1], 0, PI * 2, 0, PI * 0.6).rotateX(PI / 2);
          const EP = [], EN = [], EAt = [], EI = [];
          const headInv = new THREE.Matrix4().compose(V(S.neck), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)).invert();
          for (const side of [1, -1]) {
            const E = side > 0 ? EYE.L : EYE.R;
            const m = M4().compose(V(E.c), eyeQ(side), new THREE.Vector3(1, 1, 1)).premultiply(headInv), nm = new THREE.Matrix3().getNormalMatrix(m);
            const p = eyeG.attributes.position, nr = eyeG.attributes.normal, b = EP.length / 3, v = new THREE.Vector3(), n = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
              v.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
              EAt.push(n.x, n.y, n.z, side);
              v.applyMatrix4(m); n.applyMatrix3(nm).normalize();
              EP.push(v.x, v.y, v.z); EN.push(n.x, n.y, n.z);
            }
            for (let i = 0; i < eyeG.index.count; i++) EI.push(b + eyeG.index.getX(i));
          }
          const eg = new THREE.BufferGeometry();
          eg.setAttribute('position', new THREE.Float32BufferAttribute(EP, 3)); eg.setAttribute('normal', new THREE.Float32BufferAttribute(EN, 3));
          eg.setAttribute('aEye', new THREE.Float32BufferAttribute(EAt, 4)); eg.setIndex(EI);
          const eyeMat = opts.eyeMat || D.eyeMaterial(THREE);
          const eyes = new THREE.Mesh(eg, eyeMat); eyes.name = 'bear-eyes';
          bones.head.add(eyes);

          stats.parts.eyes = EI.length / 3;
          stats.tris = acc.I.length / 3 + EI.length / 3; stats.verts = nv; stats.ms = Math.round(now() - T0);
          stats.headShare = headShare(F, U);
          const api = rig(THREE, { bones, mesh, eyes, eyeMat, stats, names, level: detail });
          group.userData.racer = group.userData.bear = api;
          group.userData.stats = stats;
          return group;
        }

        // head share of the seated height: chin to crown over seat to crown (ears and pompom excluded; with and without the beanie)
        function headShare(F, U) {
          const top = U.rayHit(F.headCore, [0, 1.4, S.cran[2]], [0, -1, 0], 0, 0.9, 120)[1];
          const topB = U.rayHit(F.beanieF, [0, 1.4, S.cran[2]], [0, -1, 0], 0, 0.9, 120)[1];
          let chin = 1;
          for (let x = 0; x < 0.32; x += 0.01) for (let z = -0.05; z < 0.3; z += 0.02) { const p = U.rayHit(F.faceF, [x, 0.3, z], [0, 1, 0], 0, 0.6, 96); if (p) chin = min(chin, p[1]); }
          return { top: +top.toFixed(3), topBeanie: +topB.toFixed(3), chin: +chin.toFixed(3), share: +((top - chin) / top).toFixed(3), shareBeanie: +((topB - chin) / topB).toFixed(3) };
        }

        /* ------------------------------------------------------------------ far LOD: snapped low-poly parts, the face painted */
        function buildFar(THREE, U, F, C, toon, T0, now, faceAt) {
          const { Acc, addGeo, taperTube, grad } = U;
          const acc = new Acc(), M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]), g = [0, 0, 0];
          const snap = (f, c, ws, hs, rmax, col, k, sc) => {
            const s = new THREE.SphereGeometry(1, ws, hs), p = s.attributes.position, n = s.attributes.normal;
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i) * (sc ? sc[0] : 1), p.getY(i) * (sc ? sc[1] : 1), p.getZ(i) * (sc ? sc[2] : 1)]);
              let lo = 0, hi = rmax;
              for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (f(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c, d, (lo + hi) / 2); p.setXYZ(i, q[0], q[1], q[2]);
              grad(f, q[0], q[1], q[2], 0.004, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            addGeo(THREE, acc, s, M4(), col, k, 0);
          };
          const kF = [0.62, 1, 0, 1], kP = [0.45, 0, 0, 1];
          // head + beanie in one snapped sphere: crimson above the edge, tan on the snout, brown fur elsewhere
          const headAll = (x, y, z) => min(F.furHead(x, y, z), F.muzzleF(x, y, z));
          snap(headAll, [0, 0.76, 0.03], 11, 7, 0.55, (x, y, z) => (F.muzzleF(x, y, z) < 0.01 && z > 0.12 ? C.tan : C.fur), kF);
          // the beanie as its own dome (a clean red edge even at 0.6k), clamped to the brim line
          {
            const cr = S.cran, o = BN.off + 0.012, b = new THREE.SphereGeometry(1, 10, 4, 0, PI * 2, 0, PI * 0.62), p = b.attributes.position, n = b.attributes.normal;
            for (let i = 0; i < p.count; i++) {
              const x = cr[0] + p.getX(i) * (cr[3] + o), z = cr[2] + p.getZ(i) * (cr[5] + o); let y = cr[1] + p.getY(i) * (cr[4] + o);
              y = max(y, yEdge(z)); p.setXYZ(i, x, y, z);
              const nn = v3.norm([(x - cr[0]) / (cr[3] * cr[3]), (y - cr[1]) / (cr[4] * cr[4]), (z - cr[2]) / (cr[5] * cr[5])]); n.setXYZ(i, nn[0], nn[1], nn[2]);
            }
            addGeo(THREE, acc, b, M4(), C.beanie, [0.82, 0.6, 0, 1], 0);
          }
          addGeo(THREE, acc, new THREE.SphereGeometry(POM.r, 6, 4), M4().makeTranslation(...POM.c), C.pom, kF, 0);
          for (const side of [1, -1]) {
            const c = [side * S.ear.c[0], S.ear.c[1], S.ear.c[2]];
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 6, 4), M4().compose(V(c), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side * S.ear.yaw, -side * S.ear.tilt)), V(S.ear.r)), (x, y, z, nx, ny, nz) => (nz > 0.5 ? C.inner : C.fur), kF, 0);
          }
          snap(F.torsoF, [0, 0.27, -0.03], 8, 6, 0.45, (x, y, z) => (z > 0.12 && abs(x) < 0.13 && y < 0.42 ? C.tan : C.fur), kF);
          const cyl = (A, B, ra, rb, col, seg) => {
            const d = v3.sub(B, A), L = hypot(...d), c = new THREE.CylinderGeometry(rb, ra, L, seg || 5, 1, true);
            addGeo(THREE, acc, c, M4().compose(V(v3.add(A, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), V([1, 1, 1])), col, kF, 0);
          };
          for (const s of [1, -1]) {
            const X = (p) => [s * p[0], p[1], p[2]];
            cyl(X(S.Sh), X(S.El), 0.092, 0.08, C.fur); cyl(X(S.El), X(F.Wr), 0.08, 0.072, C.fur);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.078, 5, 3), M4().makeTranslation(...X(F.pawC)), C.fur, kF, 0);
            cyl(X(S.Hp), X(S.K), 0.1, 0.085, C.fur); cyl(X(S.K), X(S.F), 0.08, 0.068, C.fur);
          }
          // the face, painted big enough to read at 45 m+: nose, small eyes under dark angled brows, blush
          const fz = (x, y, l) => faceAt(F.faceF, x, y, l === undefined ? 0.004 : l);
          addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 3), M4().compose(V(fz(0, S.nose.y)), new THREE.Quaternion(), V([0.066, 0.046, 0.04])), C.nose, kP, 0);
          for (const side of [1, -1]) {
            const p = fz(side * S.eye.x, S.eye.y);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 3), M4().compose(V(p), new THREE.Quaternion(), V([0.042, 0.03, 0.02])), C.white, kP, 0);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 2), M4().compose(V(v3.add(p, [0, -0.004, 0.012])), new THREE.Quaternion(), V([0.024, 0.024, 0.014])), C.nose, kP, 0);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 2), M4().compose(V(fz(side * 0.104, S.eye.y + 0.07, 0.006)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 0.5)), V([0.066, 0.022, 0.02])), C.brow, kP, 0);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 2), M4().compose(V(faceAt(F.furHead, side * 0.182, 0.718, 0.002)), new THREE.Quaternion(), V([0.05, 0.034, 0.014])), C.blush, kP, 0);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          geo.setIndex(new THREE.Uint16BufferAttribute(acc.I, 1));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, toon); mesh.name = 'bear-far';
          const group = new THREE.Group(); group.name = 'bear-far'; group.add(mesh);
          const stats = { tris: acc.I.length / 3, verts: acc.n, ms: Math.round(now() - T0), parts: { far: acc.I.length / 3 }, headShare: headShare(F, U) };
          const sq = { k: 1, v: 0 };
          const api = {
            level: 'far', mesh, stats, names: [], bones: null,
            set() { return api; }, setExpression() { return api; }, setGaze() { return api; }, look() { return api; }, blink() { return api; }, steer() { return api; },
            squash(k) { sq.k = k; mesh.scale.set(1 / sqrt(k), k, 1 / sqrt(k)); return api; }, kick(v) { sq.v += v; },
            update(dt) { const a = -220 * (sq.k - 1) - 14 * sq.v; sq.v += a * dt; sq.k += sq.v * dt; mesh.scale.set(1 / sqrt(sq.k), sq.k, 1 / sqrt(sq.k)); },
          };
          group.userData.racer = group.userData.bear = api;
          group.userData.stats = stats;
          return group;
        }

        /* ------------------------------------------------------------------ the live layer (the Pepe / dogs API) */
        function rig(THREE, o) {
          const { bones: B, eyeMat, stats, names } = o;
          const U = eyeMat.userData.uniforms;
          const rest = {}; for (const k in B) rest[k] = B[k].quaternion.clone();
          U.uIrisC.value.set('#4A2810');
          const N0 = EXT.neutral, NM = names.length ? names : NAMES;
          const st = { w: {}, target: null, gaze: null, look: [0, 0], blink: 0, autoBlink: true, nextBlink: 2 + Math.random() * 3, blinkT: -1, sq: 1, sqV: 0, steer: 0 };
          NM.forEach((n) => { st.w[n] = 0; });
          const springs = ['pom', 'earL', 'earR'].map((n) => ({ n, a: 0, v: 0, b: 0, bv: 0 }));
          const qx = new THREE.Quaternion(), qz = new THREE.Quaternion(), e = new THREE.Euler();
          const blend = (key) => { let v = N0[key]; for (const k of NM) v += st.w[k] * (EXT[k][key] - N0[key]); return v; };
          function apply() {
            let gx = N0.gaze[0], gy = N0.gaze[1];
            for (const k of NM) { gx += st.w[k] * (EXT[k].gaze[0] - N0.gaze[0]); gy += st.w[k] * (EXT[k].gaze[1] - N0.gaze[1]); }
            if (st.gaze) { gx = st.gaze[0]; gy = st.gaze[1]; }
            gx += st.look[0]; gy += st.look[1];
            U.uGazeL.value.set(gx, gy, 1).normalize(); U.uGazeR.value.set(gx, gy, 1).normalize();
            U.uPupil.value = blend('pupil'); U.uIris.value = blend('iris'); U.uSpark.value = blend('spark');
            const happy = blend('happy');
            let lu = blend('lidU'), ll = blend('lidLo'), tilt = blend('lidT');
            const shut = max(sstep(0.3, 0.7, happy), st.blink);
            lu = lerp(lu, -1.5, shut); ll = lerp(ll, -0.62, sstep(0.3, 0.7, happy)); tilt = lerp(tilt, 0, shut);
            U.uLid.value = lu;
            for (const s of ['L', 'R']) {
              const side = s === 'L' ? 1 : -1;
              B['lid' + s].quaternion.copy(rest['lid' + s]).multiply(qz.setFromEuler(e.set(0, 0, side * tilt))).multiply(qx.setFromEuler(e.set(-lu, 0, 0)));
              B['low' + s].quaternion.copy(rest['low' + s]).multiply(qx.setFromEuler(e.set(-ll, 0, 0)));
              B['arc' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, happy)));
            }
            if (o.mesh.morphTargetInfluences) NM.forEach((n, i) => { o.mesh.morphTargetInfluences[i] = st.w[n] || 0; });
            B.head.quaternion.copy(rest.head).multiply(qx.setFromEuler(e.set(0.03, st.steer * 0.25, blend('roll') - st.steer * 0.05)));
            B.body.rotation.set(0, 0, -st.steer * 0.05);
            B.root.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
            const ear = blend('ear');
            for (const sp of springs) {
              if (sp.n === 'pom') { B.pom.quaternion.copy(rest.pom).multiply(qx.setFromEuler(e.set(sp.a, 0, sp.b))); continue; }
              const side = sp.n === 'earL' ? 1 : -1;
              B[sp.n].quaternion.copy(rest[sp.n]).multiply(qx.setFromEuler(e.set(sp.a - min(0, ear) * 0.5, sp.b, -side * ear * 0.35)));
            }
          }
          const api = {
            level: o.level, bones: B, mesh: o.mesh, names: NM, EXPR: EXT, stats,
            set(weights) { for (const k of NM) st.w[k] = weights && weights[k] ? weights[k] : 0; st.target = null; apply(); return api; },
            setExpression(name, instant) { st.target = name; if (instant) { for (const k of NM) st.w[k] = k === name ? 1 : 0; apply(); } return api; },
            setGaze(x, y) { st.gaze = x === null || x === undefined ? null : [x, y || 0]; apply(); return api; },
            look(x, y) { st.look[0] = x; st.look[1] = y; apply(); return api; },
            blink(v) { st.blink = v || 0; st.autoBlink = v === undefined; apply(); return api; },
            squash(k) { st.sq = k; apply(); return api; },
            kick(v) { st.sqV += v; },
            steer(v) { st.steer = v; apply(); return api; },
            // auto blinks every 2-5 s, eased expressions, squash spring (stiffness 220, damping 14), pompom + ear springs
            update(dt, inp) {
              inp = inp || {};
              if (st.target !== null) { const k = 1 - exp(-dt * 12); for (const n of NM) st.w[n] += ((n === st.target ? 1 : 0) - st.w[n]) * k; }
              if (st.autoBlink && blend('happy') < 0.5) {
                st.nextBlink -= dt;
                if (st.nextBlink <= 0 && st.blinkT < 0) { st.blinkT = 0; st.nextBlink = 2 + Math.random() * 3; }
                if (st.blinkT >= 0) { st.blinkT += dt; const u = st.blinkT / 0.16; st.blink = u < 0.4 ? u / 0.4 : max(0, 1 - (u - 0.4) / 0.6); if (u >= 1) { st.blinkT = -1; st.blink = 0; } }
              }
              const a = -220 * (st.sq - 1) - 14 * st.sqV; st.sqV += a * dt; st.sq += st.sqV * dt;
              const ac = inp.accel || 0, turn = inp.steer || 0;
              for (const sp of springs) {
                const isEar = sp.n[0] === 'e', k = isEar ? 260 : 140, d = isEar ? 14 : 8;
                const ta = (isEar ? -0.08 : -0.35) * ac, tb = (isEar ? 0.1 : 0.4) * turn;
                sp.v += (k * (ta - sp.a) - d * sp.v) * dt; sp.a += sp.v * dt;
                sp.bv += (k * (tb - sp.b) - d * sp.bv) * dt; sp.b += sp.bv * dt;
              }
              apply();
            },
          };
          apply();
          return api;
        }

        /* ==================================================================== THE SELL-OFF: Big Bear's kart
         * An armoured dump-truck kart: a heavy amber-yellow body over a gunmetal chassis, a raised tipper bed behind the
         * driver (ribbed sides, a load of boulders, a hazard-striped tailgate), DUAL rear wheels with chunky tread lugs,
         * twin chrome exhaust stacks, a black bull bar with caged lamps, riveted steel side armour, mud flaps. */
        function SellOff(THREE, KIT, detail, opts) {
          const KK = root.BearKartKit, U = root.DogFinal.util, { rbox } = KK;
          const WHEELS = [[0.6, 0.66, 0.205, 0.21, false], [-0.6, 0.66, 0.205, 0.21, false], [0.64, -0.62, 0.25, 0.33, true], [-0.64, -0.62, 0.25, 0.33, true]];
          const COCK = { c: [0, 0.54, -0.1], h: [0.31, 0.25, 0.37], r: 0.1 };
          const BED = { c: [0, 0.68, -0.79], h: [0.62, 0.145, 0.36], wall: 0.05 };
          const chassisF = (x, y, z) => rbox(x, y, z, [0, 0.31, -0.09], [0.39, 0.14, 0.99], 0.07);
          // marching cubes only for the rounded tub + blunt nose; the bed and fenders are crisp rounded-plate geometry
          const hoodF = (x, y, z) => smax(rbox(x, y, z, [0, 0.46, 0.57], [0.41, 0.18, 0.33], 0.07), y - (0.64 - 0.07 * sstep(0.66, 0.92, z)), 0.05);
          const tubF = (x, y, z) => rbox(x, y, z, [0, 0.43, -0.08], [0.43, 0.15, 0.42], 0.07);
          const rampF = (x, y, z) => rbox(x, y, z, [0, 0.49, -0.78], [0.3, 0.07, 0.3], 0.04);
          const bodyF = (x, y, z) => smin(smin(chassisF(x, y, z), smin(hoodF(x, y, z), tubF(x, y, z), 0.05), 0.05), rampF(x, y, z), 0.03);
          const bedOut = (x, y, z) => rbox(x, y, z, BED.c, BED.h, 0.045);
          const farF = (x, y, z) => smin(chassisF(x, y, z), smin(hoodF(x, y, z), tubF(x, y, z), 0.04), 0.04);
          const seam = (x, z) => 0.37 + 0.0 * z;
          const design = {
            name: 'sell-off', chunky: true, gloss: 0.4, whitewall: false, rimRing: false, strip: [0.012, 0.016], coamingK: 'seat', tread: { desktop: 7, phone: 6 }, lugNuts: { desktop: 5 },
            bodyScale: { desktop: 1.22, phone: 1.32, mid: 1.05 }, wheelSeg: { desktop: [18, 2], phone: [12, 1] },
            cock: COCK, seat: [0, 0.27, -0.14], wheel: WHEEL, seatW: 0.56, seatH: 0.34,
            box: [-0.5, 0.08, -1.12, 0.5, 0.68, 0.98], farC: [0, 0.42, -0.1], farF, wheels: WHEELS, bodyF,
            seamY: seam,
            palette: {
              top: '#F2A51C', topDk: '#D4860F', low: '#3A3F47', lowDk: '#272B31', inside: '#2E3238', bedIn: '#5B6068',
              chrome: '#E4E8EE', chromeDk: '#8C939C', lamp: '#FFF1BE', tail: '#FF3B30', coaming: '#1F2226',
              seat: '#2B2F35', seatHi: '#454B53', tyre: '#1C1D21', wall: '#1C1D21', hub: '#F2A51C', hubIn: '#3A3F47', cap: '#C9CED6',
              rim: '#1F2226', hubS: '#F2A51C', black: '#16171A', steel: '#8A929C', steelDk: '#5E656E', rock: '#77716B', rockDk: '#4F4B47', stripe: '#F2C21C',
            },
            // bed interior in worn steel; the chassis below the seam in gunmetal
            paint(c, x, y, z, nx, ny, nz, C) {
              return c;
            },
            far(c) {
              const { THREE: T, U: u, C, K, body, M4: m4 } = c;
              for (const s of [1, -1]) u.addGeo(T, body, new T.CylinderGeometry(0.036, 0.036, 0.6, 5, 1, true), m4().makeTranslation(s * 0.46, 0.75, -0.42), C.chrome, K.chrome, 0);
              u.addGeo(T, body, new T.BoxGeometry(1.24, 0.29, 0.72), m4().makeTranslation(0, 0.68, -0.79), C.top, K.paint, 0);
              u.addGeo(T, body, new T.BoxGeometry(1.0, 0.1, 0.02), m4().makeTranslation(0, 0.66, -1.15), C.stripe, K.paint, 0);
              u.addGeo(T, body, new T.BoxGeometry(0.9, 0.06, 0.06), m4().makeTranslation(0, 0.36, 1.04), C.black, K.paint, 0);
            },
            details(c) {
              const { THREE: T, U: u, C, K, LV, body, M4: m4, V, Q, done, onBody } = c;
              const hi = LV.loop > 40;
              // hazard chevrons: crisp flat-coloured polygons (each stripe its own vertices) clipped to a plate
              const stripePlate = (w, h, n, slope) => {
                const P = [], N = [], I = [], Cc = [], pw = (w + h * abs(slope)) / n;
                const clip = (poly, a, b, cc) => { const out = []; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], fp = a * p[0] + b * p[1] - cc, fq = a * q[0] + b * q[1] - cc; if (fp <= 0) out.push(p); if ((fp < 0) !== (fq < 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return out; };
                for (let k = -1; k <= n + 1; k++) {
                  let poly = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
                  const u0 = -w / 2 - h * abs(slope) + k * pw;
                  poly = clip(poly, -1, slope, -u0); poly = clip(poly, 1, -slope, u0 + pw);
                  if (poly.length < 3) continue;
                  const base = P.length / 3, col = (k & 1) ? C.black : C.stripe;
                  for (const p of poly) { P.push(p[0], p[1], 0); N.push(0, 0, 1); Cc.push(col); }
                  for (let i = 1; i < poly.length - 1; i++) I.push(base, base + i, base + i + 1);
                }
                return { P, N, I, Cc };
              };
              const addPlate = (pl, m) => {
                const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pl.P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(pl.N, 3)); g.setIndex(pl.I);
                u.addGeo(T, body, g, m, (x, y, z, nx, ny, nz, i) => pl.Cc[i], K.paint, 0);
              };
              // front bumper: a heavy black beam with a hazard face
              u.addGeo(T, body, c.rboxG(0.98, 0.12, 0.13, 0.03, 2), m4().makeTranslation(0, 0.26, 0.99), C.black, K.matte, 0);
              if (LV.detail) addPlate(stripePlate(0.86, 0.075, 9, 0.9), m4().makeTranslation(0, 0.26, 1.057));
              // bull bar: a black tube frame in front of the grille
              const bb = [[-0.44, 0.3, 1.05], [-0.44, 0.56, 1.03], [-0.3, 0.64, 1.01], [0.3, 0.64, 1.01], [0.44, 0.56, 1.03], [0.44, 0.3, 1.05]];
              const bbp = new T.CatmullRomCurve3(bb.map((p) => V(p)), false, 'catmullrom', 0.2).getPoints(hi ? 20 : LV.detail ? 12 : 6).map((p) => [p.x, p.y, p.z]);
              u.addGeo(T, body, u.taperTube(T, bbp, bbp.map(() => 0.026), bbp.map(() => 0.026), LV.tube, [0, 0, 1], true), m4(), C.black, K.chrome, 0);
              for (const s of [-0.16, 0.16]) u.addGeo(T, body, u.taperTube(T, [[s, 0.31, 1.05], [s, 0.62, 1.02]], [0.02, 0.02], [0.02, 0.02], LV.tube, [0, 0, 1], true), m4(), C.black, K.chrome, 0);
              u.addGeo(T, body, u.taperTube(T, [[-0.44, 0.46, 1.045], [0.44, 0.46, 1.045]], [0.018, 0.018], [0.018, 0.018], LV.tube, [0, 1, 0], true), m4(), C.black, K.chrome, 0);
              // grille: a dark recess with vertical chrome bars
              const gp = onBody([0, 0.44, 0.95], 0.0);
              u.addGeo(T, body, c.rboxG(0.34, 0.15, 0.03, 0.012, 1), m4().makeTranslation(gp.p[0], gp.p[1], gp.p[2] - 0.004), C.black, K.matte, 0);
              if (LV.detail) for (let i = 0; i < 6; i++) u.addGeo(T, body, c.rboxG(0.018, 0.13, 0.02, 0.006, 1), m4().makeTranslation(-0.135 + i * 0.054, gp.p[1], gp.p[2] + 0.01), C.chrome, K.chrome, 0);
              // caged square lamps on the nose corners
              for (const s of [1, -1]) {
                const lp = onBody([s * 0.31, 0.48, 0.95], 0.0);
                u.addGeo(T, body, c.rboxG(0.11, 0.09, 0.03, 0.012, 1), m4().makeTranslation(lp.p[0], lp.p[1], lp.p[2] + 0.004), C.black, K.matte, 0);
                u.addGeo(T, body, c.rboxG(0.085, 0.066, 0.02, 0.01, 1), m4().makeTranslation(lp.p[0], lp.p[1], lp.p[2] + 0.016), C.lamp, K.glow, 0);
                if (LV.detail) for (const dx of [-0.022, 0.022]) u.addGeo(T, body, u.taperTube(T, [[lp.p[0] + dx, lp.p[1] - 0.045, lp.p[2] + 0.03], [lp.p[0] + dx, lp.p[1] + 0.045, lp.p[2] + 0.03]], [0.005, 0.005], [0.005, 0.005], 4, [0, 0, 1], false), m4(), C.black, K.chrome, 0);
              }
              // twin chrome exhaust stacks behind the cab, with rain caps
              for (const s of [1, -1]) {
                const x0 = s * 0.47, z0 = -0.41;
                u.addGeo(T, body, new T.CylinderGeometry(0.038, 0.042, 0.56, hi ? 14 : LV.detail ? 10 : 6, 1, true), m4().makeTranslation(x0, 0.76, z0), C.chrome, K.chrome, 0);
                u.addGeo(T, body, new T.CylinderGeometry(0.044, 0.044, 0.05, hi ? 14 : LV.detail ? 10 : 6, 1, false), m4().makeTranslation(x0, 0.5, z0), C.black, K.matte, 0);
                if (LV.detail) u.addGeo(T, body, new T.CylinderGeometry(0.046, 0.046, 0.008, 12, 1, false), m4().compose(V([x0, 1.05, z0 - 0.01]), Q(-0.5, 0, 0), V([1, 1, 1])), C.chromeDk, K.chrome, 0);
                // a clamp to the bed's front wall
                u.addGeo(T, body, c.rboxG(0.03, 0.03, 0.06, 0.008, 1), m4().makeTranslation(x0, 0.72, z0 - 0.045), C.black, K.matte, 0);
              }
              // riveted steel armour plates on the tub sides
              for (const s of [1, -1]) {
                u.addGeo(T, body, c.rboxG(0.03, 0.17, 0.62, 0.012, 2), m4().makeTranslation(s * 0.445, 0.4, -0.06), (x, y) => mix3(C.steel, C.steelDk, sstep(0.45, 0.32, y) * 0.5), [0.35, 0, 0, 1], 0);
                if (hi) {
                  const rv = new T.SphereGeometry(0.011, 5, 2, 0, PI * 2, 0, PI / 2).rotateZ(-s * PI / 2);
                  for (const z of [-0.33, -0.11, 0.11, 0.21]) for (const y of [0.34, 0.46]) u.addGeo(T, body, rv, m4().makeTranslation(s * 0.461, y, z), C.steelDk, [0.3, 0, 0, 1], 0);
                }
              }
              // the tipper bed: floor, two sides, headboard and tailgate as rounded plates (yellow outside, worn steel inside)
              {
                const [bx, by, bz] = BED.c, [hx, hy, hz] = BED.h, w = BED.wall, sg = LV.detail ? 2 : 1;
                const inOut = (inside) => (x, y, z, nx, ny, nz) => (inside(nx, ny, nz) ? mix3(C.bedIn, mul3(C.bedIn, 0.8), sstep(0.5, -0.5, ny) * 0.4) : mix3(C.top, C.topDk, sstep(0.2, -0.8, ny) * 0.5));
                u.addGeo(T, body, c.rboxG(2 * hx, w, 2 * hz, 0.02, sg), m4().makeTranslation(bx, by - hy + w / 2, bz), inOut((nx, ny) => ny > 0.5), K.paint, 0);
                for (const s of [1, -1]) u.addGeo(T, body, c.rboxG(w, 2 * hy, 2 * hz, 0.02, sg), m4().makeTranslation(s * (hx - w / 2), by, bz), inOut((nx) => nx * s < -0.5), K.paint, 0);
                u.addGeo(T, body, c.rboxG(2 * hx, 2 * hy + 0.06, w, 0.02, sg), m4().makeTranslation(bx, by + 0.03, bz + hz - w / 2), inOut((nx, ny, nz) => nz < -0.5), K.paint, 0);
                u.addGeo(T, body, c.rboxG(2 * hx, 2 * hy, w, 0.02, sg), m4().makeTranslation(bx, by, bz - hz + w / 2), inOut((nx, ny, nz) => nz > 0.5), K.paint, 0);
                // top rails: a rolled lip round the bed
                const rl = [[-hx + 0.02, by + hy, bz + hz], [-hx + 0.02, by + hy, bz - hz], [hx - 0.02, by + hy, bz - hz], [hx - 0.02, by + hy, bz + hz]];
                if (LV.detail) for (let i = 0; i < 3; i++) u.addGeo(T, body, u.taperTube(T, [rl[i], rl[i + 1]], [0.022, 0.022], [0.022, 0.022], LV.tube, [0, 1, 0], true), m4(), C.topDk, K.paint, 0);
              }
              // front fenders: squared truck arches over the front wheels (the wheels steer under them)
              for (const s of [1, -1]) {
                const [wx, wz, R] = WHEELS[0], rad = R + 0.06, n = hi ? 12 : LV.detail ? 8 : 4, pts = [], hints = [];
                for (let i = 0; i <= n; i++) { const a = 0.08 * PI + 0.84 * PI * i / n; pts.push([s * wx, R + rad * sin(a), wz + rad * cos(a)]); hints.push([0, sin(a), cos(a)]); }
                u.addGeo(T, body, u.taperTube(T, pts, pts.map(() => 0.022), pts.map(() => 0.15), 4, () => [1, 0, 0], true), m4().multiply(m4().makeRotationX(0)),
                  (x, y, z, nx, ny, nz) => mix3(C.top, C.topDk, sstep(0.2, -0.8, ny) * 0.6), K.paint, 0);
                void hints;
              }
              // riveted armour plate on the bonnet
              {
                const hp = onBody([0, 0.7, 0.56], 0.0), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), V(hp.n));
                u.addGeo(T, body, c.rboxG(0.46, 0.03, 0.42, 0.012, LV.detail ? 2 : 1), m4().compose(V(hp.p), q, V([1, 1, 1])), (x, y) => mix3(C.steel, C.steelDk, sstep(0.0, -0.015, y) * 0.6), [0.35, 0, 0, 1], 0);
                if (hi) { const rv = new T.SphereGeometry(0.011, 5, 2, 0, PI * 2, 0, PI / 2); for (const dx of [-0.2, 0, 0.2]) for (const dz of [-0.18, 0.18]) u.addGeo(T, body, rv, m4().compose(V(hp.p), q, V([1, 1, 1])).multiply(m4().makeTranslation(dx, 0.015, dz)), C.steelDk, [0.3, 0, 0, 1], 0); }
              }
              // the tipper bed: vertical ribs on its sides, a top rail, a hazard tailgate, tail lamps, hinge pins
              if (LV.detail) for (const s of [1, -1]) for (const z of [-0.56, -0.79, -1.02]) u.addGeo(T, body, c.rboxG(0.03, 0.26, 0.04, 0.01, 1), m4().makeTranslation(s * 0.63, 0.68, z), C.topDk, K.paint, 0);
              if (LV.detail) addPlate(stripePlate(1.0, 0.13, 10, 0.9), m4().makeRotationY(PI).premultiply(m4().makeTranslation(0, 0.69, -1.162)));
              for (const s of [1, -1]) u.addGeo(T, body, c.rboxG(0.1, 0.05, 0.02, 0.01, 1), m4().makeTranslation(s * 0.5, 0.585, -1.16), C.tail, K.glow, 0);
              // boulders: the load (also the item it dumps)
              const rocks = [[0.22, 0.8, -0.74, 0.13], [-0.2, 0.8, -0.88, 0.14], [0.02, 0.85, -0.97, 0.12], [-0.3, 0.79, -0.62, 0.1], [0.36, 0.79, -1.0, 0.1], [0.05, 0.8, -0.63, 0.09]];
              const rockG = hi ? new T.SphereGeometry(1, 8, 6) : LV.detail ? new T.SphereGeometry(1, 6, 4) : new T.SphereGeometry(1, 5, 3), rp = rockG.attributes.position;
              for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), k = 1 + 0.1 * sin(5.1 * x + 2) * cos(4.3 * y - 1) + 0.07 * sin(6.7 * z) - 0.12 * max(0, abs(x) - 0.6); rp.setXYZ(i, x * k, y * k * 0.78, z * k); }
              rockG.computeVertexNormals();
              for (const [x, y, z, r] of (LV.detail ? rocks : rocks.slice(0, 3))) u.addGeo(T, body, rockG, m4().compose(V([x, y, z]), Q(x * 3, z * 5, y), V([r, r, r])), (px, py, pz, nx, ny) => mix3(C.rockDk, C.rock, sstep(-0.5, 0.8, ny)), [0.85, 0, 0, 1], 0);
              // mud flaps behind the dual rear wheels
              for (const s of [1, -1]) u.addGeo(T, body, c.rboxG(0.3, 0.26, 0.02, 0.008, 1), m4().makeTranslation(s * 0.64, 0.26, -0.93), C.black, K.rubber, 0);
              // front fenders: a darker underside lip
              done('details');
              void Q;
            },
          };
          return KK.make(design, THREE, KIT, detail, opts);
        }

        const api = { BigBear, SellOff, WHEEL, S, EXPR: EXT, NAMES, LEVELS, bearSDF };
        root.BigBear = BigBear; root.SellOff = SellOff; root.BigBearKit = api;
      })(KR);

      /* Meme Kart roster: THE WHALE + BUBBLE SUB (scratch, 6 Oct 2026). An ORIGINAL rival, built in code.
       *
       *   WhaleFinal(THREE, K, detail, opts) -> THREE.Group          (character; budgets 14-16k / 7-8k / 2.5-3k / 0.6-0.7k)
       *   BubbleSub (THREE, K, detail, opts) -> THREE.Group          (kart;      budgets 12k / 6k / 2k / 0.5k)
       *     K      = the endo marching-cubes kit (endo-kit.js, copied from dogs/final)
       *     detail = 'desktop' | 'phone' | 'mid' | 'far'
       *     opts   = { toon: <shared gm-kart-toon>, eyeMat: <this racer's gm-kart-eye-dog>, glassMat: <gm-kart-glass> }
       * Needs dogs/final/dog.js (DogFinal.util, toonMaterial, eyeMaterial, WHEEL) and roster/whale/kart-kit.js (WhaleKartKit).
       *
       * The whale: a small, chubby cerulean whale, one smooth blob with no neck (head ~55% of the seated height), a pale
       * pleated throat and belly (its own marching-cubes shell, so the paint line is a clean raised edge), a long smug
       * smile with a curled corner, heavy-lidded eyes (separate spheres, shader iris/pupil, 2 catchlights, gaze), little
       * brows and blush, stubby flippers on the wheel, a tail that rises out of the water with a notched fluke, and a
       * water spout from the blowhole (on its own bone: it gushes on celebrate and sputters on hit).
       * Expressions (morph targets + bone poses): smug (race default), puff (cheeks blown, pursed o, eyes squeezed, big
       * spout: the boost face), hit, celebrate.
       *
       * The kart: BUBBLE SUB, a round marigold-and-teal toy submarine on wheels; the cockpit is a glass tub of water (the
       * whale sits in it to the chest), brass rims, portholes, a nose searchlight, a periscope, a rudder fin and tail
       * planes, and a brass three-blade propeller that spins with speed. Glass + water = ONE transparent mesh.
       *
       * Units metres, +Z forward, +Y up. Whale origin = seat contact; kart origin = ground between the axles.
       * Draw calls: whale 2 (SkinnedMesh in gm-kart-toon + eye mesh), far 1; kart body + steering + glass + prop + 4 wheels.
       * group.userData.racer = { set, setExpression, setGaze, look, blink, squash, kick, steer, update, names, bones, mesh, stats }
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, exp, atan2 } = Math;
        const DF = root.DogFinal, U = DF.util;
        const { sat, clamp, lerp, sstep, smin, smax, ell, E6, cap, v3, mix3, mul3, grad, Acc, mcPart, addGeo, taperTube, rayHit } = U;
        const ell2 = (x, y, a, b) => { const X = x / a, Y = y / b, k0 = sqrt(X * X + Y * Y), k1 = sqrt(X * X / (a * a) + Y * Y / (b * b)) + 1e-9; return k0 * (k0 - 1) / k1; };

        /* ------------------------------------------------------------------ hands on the shared wheel */
        const WHEEL = DF.WHEEL;
        const WH = (() => {
          const W = WHEEL, up = [0, cos(W.tilt), sin(W.tilt)], nrm = [0, -sin(W.tilt), cos(W.tilt)];
          const a = W.grip, rad = v3.norm(v3.add([cos(a), 0, 0], up, sin(a)));
          return { up, nrm, rad, H: v3.add(W.c, rad, W.r) };
        })();

        /* ------------------------------------------------------------------ shape */
        const S = {
          name: 'whale',
          cran: [0, 0.715, -0.02, 0.292, 0.262, 0.29],
          snout: [0, 0.648, 0.085, 0.252, 0.178, 0.228], snoutK: 0.06,
          cheek: [0.125, 0.605, 0.05, 0.19, 0.158, 0.2], cheekK: 0.08,
          chin: [0, 0.54, 0.06, 0.228, 0.095, 0.216], chinK: 0.05,
          eye: { x: 0.158, y: 0.69, r: 0.05, prot: 0.024, fwd: 0.5 },
          torso: [0, 0.25, -0.05, 0.252, 0.262, 0.222], belly: [0, 0.19, 0.02, 0.242, 0.19, 0.212], neckK: 0.1,
          fin: { A: [0.205, 0.355, 0.0], B: [0.255, 0.35, 0.215], n: v3.norm([0.4, 1, -0.05]) },
          tail: { pts: [[0, 0.15, -0.2], [0, 0.13, -0.34], [0, 0.2, -0.46], [0, 0.33, -0.51], [0, 0.46, -0.5]], r: [0.12, 0.092, 0.072, 0.056, 0.046] },
          fluke: { o: [0, 0.46, -0.5], pitch: 0.35 },
          neck: [0, 0.47, -0.02],
          water: 0.29,                   // the waterline in the tub, in seat coordinates
        };
        const SHELL = 0.0095;           // the pale belly shell rides this far above the blue skin
        const FL = (() => { const b = S.fluke.pitch; return { v: [0, cos(b), -sin(b)], w: [0, sin(b), cos(b)] }; })();
        const pawC = v3.add(WH.H, WH.nrm, -0.012);
        const Wr = v3.add(WH.H, v3.norm(v3.sub(S.fin.B, WH.H)), 0.055);

        /* ------------------------------------------------------------------ expressions */
        const D2R = PI / 180;
        const MO = (o) => Object.assign({ w: 0.2, y: 0.585, curve: 0.036, tilt: 0, wob: 0, flick: 0, curl: 0.012, open: 0, openW: 0.7, tongue: 0 }, o);
        const EX = {
          neutral:   { mouth: MO({}), brow: [0, 0], browT: [0, 0], cheek: 0, jaw: 0, blush: 1, sweat: 0, gaze: [0, 0.02], lidU: 0.45, lidLo: -1.0, happy: 0, squeeze: 0, pupil: 0.2, iris: 0.42, spark: 0, roll: 0, spout: 1 },
          smug:      { mouth: MO({ curve: 0.03, tilt: 0.012, flick: 0.02, curl: 0.016 }), brow: [0.024, -0.006], browT: [0.25, -0.15], cheek: 0.3, jaw: 0, blush: 1, sweat: 0, gaze: [0.34, -0.02], lidU: 0.1, lidLo: -0.85, happy: 0, squeeze: 0, pupil: 0.19, iris: 0.41, spark: 0, roll: 6 * D2R, spout: 1 },
          puff:      { mouth: MO({ w: 0.05, y: 0.578, curve: 0.0, curl: 0, open: 0.03, openW: 1.0 }), brow: [0.012, 0.012], browT: [-0.2, -0.2], cheek: 1, jaw: 0.3, blush: 1.4, sweat: 0, gaze: [0, 0], lidU: 0.45, lidLo: -1.0, happy: 0, squeeze: 1, pupil: 0.2, iris: 0.42, spark: 0, roll: 0, spout: 1.45 },
          hit:       { mouth: MO({ w: 0.12, y: 0.574, curve: -0.026, wob: 0.006, curl: -0.008, open: 0.034, openW: 0.55 }), brow: [0.03, 0.03], browT: [-0.35, -0.35], cheek: 0, jaw: 0.4, blush: 0.6, sweat: 1, gaze: [0, 0.06], lidU: 1.1, lidLo: -1.2, happy: 0, squeeze: 0, pupil: 0.1, iris: 0.28, spark: 0, roll: -7 * D2R, spout: 0.32 },
          celebrate: { mouth: MO({ w: 0.21, y: 0.59, curve: 0.05, curl: 0.02, open: 0.085, openW: 0.82, tongue: 1 }), brow: [0.026, 0.026], browT: [0.1, 0.1], cheek: 0.6, jaw: 0.6, blush: 1.3, sweat: 0, gaze: [0, 0], lidU: 0.5, lidLo: -1.0, happy: 1, squeeze: 0, pupil: 0.2, iris: 0.42, spark: 1, roll: 8 * D2R, spout: 1.75 },
        };
        const NAMES = ['smug', 'puff', 'hit', 'celebrate'];
        const M0 = EX.neutral.mouth;
        // the belly paint region (fixed: it does not move with expressions). < 0 = pale.
        const topY = (ax) => M0.y - 0.016 + M0.curve * min(1, ax / M0.w) ** 2;
        const G = (x, y, z) => {
          const ax = abs(x), th = atan2(ax, z + 0.02);
          const lim = 0.9 + 0.32 * sstep(0.42, 0.6, y);
          return smax((th - lim) * 0.26, y - topY(ax), 0.05);   // rounded corners at the jaw
        };

        /* ------------------------------------------------------------------ SDF (with an expression) */
        function paddle(ax, y, z, A, B, thA, thB, wA, wB, n) {
          const bx = B[0] - A[0], by = B[1] - A[1], bz = B[2] - A[2], px = ax - A[0], py = y - A[1], pz = z - A[2];
          const t = sat((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz));
          const ox = px - bx * t, oy = py - by * t, oz = pz - bz * t, on = ox * n[0] + oy * n[1] + oz * n[2];
          return ell2(on, hypot(ox - on * n[0], oy - on * n[1], oz - on * n[2]), lerp(thA, thB, t), lerp(wA, wB, t));
        }
        function whaleSDF(E) {
          E = E || {};
          const pf = E.cheek || 0, jw = E.jaw || 0;
          const ch = S.cheek.slice(); ch[0] += 0.016 * pf; ch[1] += 0.006 * pf; ch[2] += 0.012 * pf; ch[3] *= 1 + 0.14 * pf; ch[4] *= 1 + 0.11 * pf; ch[5] *= 1 + 0.06 * pf;
          const chin = S.chin.slice(); chin[1] -= 0.012 * jw; chin[4] *= 1 + 0.12 * jw;
          const headCore = (x, y, z) => {
            let d = E6(x, y, z, S.cran);
            d = smin(d, E6(x, y, z, S.snout), S.snoutK);
            d = smin(d, E6(abs(x), y, z, ch), S.cheekK);
            return smin(d, E6(x, y, z, chin), S.chinK);
          };
          const torsoF = (x, y, z) => smin(E6(x, y, z, S.torso), E6(x, y, z, S.belly), 0.06);
          const headTorso = (x, y, z) => smin(headCore(x, y, z), torsoF(x, y, z), S.neckK);
          const finF = (ax, y, z) => {
            const F = S.fin;
            let d = smin(paddle(ax, y, z, F.A, F.B, 0.05, 0.04, 0.09, 0.07, F.n), paddle(ax, y, z, F.B, Wr, 0.04, 0.034, 0.07, 0.058, F.n), 0.03);
            return smin(d, ell(ax - pawC[0], y - pawC[1], z - pawC[2], 0.052, 0.04, 0.06), 0.03);
          };
          const T = S.tail;
          const tailF = (x, y, z) => {
            if (z > -0.08) return 1;
            let d = 1; for (let i = 0; i < T.pts.length - 1; i++) d = smin(d, cap(x, y, z, T.pts[i], T.pts[i + 1], T.r[i], T.r[i + 1]), 0.03);
            return d;
          };
          const bodyAll = (x, y, z) => smin(smin(headTorso(x, y, z), finF(abs(x), y, z), 0.045), tailF(x, y, z), 0.06);
          const shellF = (x, y, z) => smax(headTorso(x, y, z) - SHELL, G(x, y, z), 0.016);   // a soft ramp: the visible edge is where it dives under the skin
          return { headCore, torsoF, headTorso, finF, tailF, bodyAll, shellF };
        }
        // the fluke in its own frame: two swept lobes, a soft notch, a rounded edge that thins to the tips
        const flukeF = (x, y, z) => {
          const o = S.fluke.o, py = y - o[1], pz = z - o[2];
          const Uu = abs(x - o[0]), Vv = py * FL.v[1] + pz * FL.v[2], W = py * FL.w[1] + pz * FL.w[2];
          const cr = cos(0.36), sr = sin(0.36), lx = Uu - 0.17, ly = Vv - 0.08;
          let d2 = ell2(lx * cr + ly * sr, -lx * sr + ly * cr, 0.19, 0.08);
          d2 = smin(d2, ell2(Uu, Vv - 0.02, 0.075, 0.065), 0.04);
          d2 = smax(d2, -(hypot(Uu, Vv - 0.135) - 0.045), 0.02);
          const th = 0.026 * (1 - 0.45 * sat(Uu / 0.34)), r = 0.012, a = d2 + r, b = abs(W) - th + r;
          return hypot(max(a, 0), max(b, 0)) + min(max(a, b), 0) - r;
        };

        /* ------------------------------------------------------------------ palette (linear) */
        function palette(THREE) {
          const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
          return {
            blue: c('#3F88E2'), blueDk: c('#2A5FB4'), blueHi: c('#6FAEF2'), belly: c('#EEF5FB'), bellyDk: c('#CFE0EF'), pleat: c('#B4CBE2'),
            line: c('#1A2B4C'), mouth: c('#3A1432'), mouthHi: c('#6E2442'), tongue: c('#F07C93'), tongueDk: c('#CC5672'),
            blush: c('#FF93B4'), brow: c('#1F3E73'), lid: c('#3A80DA'), lidLo: c('#E4EFF9'), lidLine: c('#1A2B4C'),
            spout: c('#8AD8F6'), spoutHi: c('#E9FAFF'), spoutDk: c('#56B6E6'), hole: c('#1E3F78'), sweat: c('#8FD3FF'), sweatHi: c('#E8F7FF'), white: c('#F4F7FA'),
          };
        }
        // AO folded into the colour, kept cool (blue stays blue, never muddy)
        const shade = (c, ao, lo) => { const k = lo + (1 - lo) * ao; return [c[0] * k * (0.9 + 0.1 * k), c[1] * k * (0.95 + 0.05 * k), c[2] * k]; };

        /* ------------------------------------------------------------------ face helpers (dog.js's faceAt / gridDecal, local) */
        const faceAt = (f, x, y, lift, outN) => {
          const p = rayHit(f, [x, y, 0.5], [0, 0, -1], 0, 0.62, 48) || [x, y, 0.2], g = outN || [0, 0, 0];
          grad(f, p[0], p[1], p[2], 0.002, g); return v3.add(p, g, lift);
        };
        const onSurface = (f, pts, lift) => pts.map(([x, y]) => faceAt(f, x, y, lift));
        function gridDecal(THREE, f, A, B, rows, lift, nb) {
          const cols = A.length, P = [], N = [], I = [], g = [0, 0, 0];
          for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) {
            const u = r / rows, x = lerp(A[c][0], B[c][0], u), y = lerp(A[c][1], B[c][1], u);
            const p = faceAt(f, x, y, typeof lift === 'function' ? lift(x, y, u) : lift, g);
            P.push(p[0], p[1], p[2]); const bn = v3.norm([g[0], g[1] + (nb || 0), g[2] + (nb || 0) * 1.6]); N.push(bn[0], bn[1], bn[2]);
          }
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; I.push(a, b, d, b, e, d); }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setIndex(I);
          return geo;
        }

        /* ------------------------------------------------------------------ LODs, bones */
        const LEVELS = {
          desktop: { main: 0.0325, fluke: 0.019, eye: [20, 11], lid: [14, 6], rim: [4, 20], tube: 6, extras: true, seg: 1, morph: true, spout: [12, 7, 5], pleats: 7 },
          phone:   { main: 0.047, fluke: 0.027, eye: [14, 8], lid: [10, 4], rim: [3, 14], tube: 4, extras: true, seg: 0.7, morph: true, spout: [9, 5, 5], pleats: 5 },
          mid:     { main: 0.086, fluke: 0, eye: [9, 5], lid: [6, 3], rim: [3, 8], tube: 4, extras: false, seg: 0.4, morph: true, spout: [6, 3, 4], pleats: 3 },
          far:     { far: true },
        };
        const BONES = ['root', 'body', 'head', 'lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'sqL', 'sqR', 'tail0', 'tail1', 'tail2', 'spout'];
        const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
        const PARENT = { body: 'root', head: 'body', lidL: 'head', lidR: 'head', lowL: 'head', lowR: 'head', arcL: 'head', arcR: 'head', sqL: 'head', sqR: 'head', tail0: 'body', tail1: 'tail0', tail2: 'tail1', spout: 'head' };
        const headW = (x, y, z) => { const w = sstep(0.43, 0.6, y); return [BI.body, BI.head, w]; };
        // nearest parameter (0..1) along the tail polyline
        function tailU(x, y, z) {
          const P = S.tail.pts; let best = 1e9, bu = 0, L = 0; const seg = [];
          for (let i = 0; i < P.length - 1; i++) { const l = hypot(...v3.sub(P[i + 1], P[i])); seg.push(l); L += l; }
          let acc = 0;
          for (let i = 0; i < P.length - 1; i++) {
            const A = P[i], B = P[i + 1], b = v3.sub(B, A), t = sat(v3.dot(v3.sub([x, y, z], A), b) / v3.dot(b, b));
            const d = hypot(...v3.sub([x, y, z], v3.add(A, b, t))); if (d < best) { best = d; bu = (acc + t * seg[i]) / L; }
            acc += seg[i];
          }
          return bu;
        }
        const tailW = (u) => { if (u < 0.22) return [BI.body, BI.tail0, u / 0.22]; const uu = clamp((u - 0.22) / 0.78, 0, 0.999) * 2, i = Math.floor(uu); return [BI['tail' + i], BI['tail' + (i + 1)], uu - i]; };
        const SPOUT_AT0 = (() => { const F = whaleSDF(EX.neutral); return rayHit(F.headCore, [0, 1.3, -0.075], [0, -1, 0], 0, 0.6, 96); })();

        const SPOUT_AT = SPOUT_AT0;
        /* ------------------------------------------------------------------ the spout (bone-local: origin at the blowhole) */
        function spoutGeo(THREE, acc, C, LV, bone, at) {
          const [seg, rows, arms] = LV.spout, M = new THREE.Matrix4().makeTranslation(at[0], at[1] - 0.006, at[2]);
          const k = [0.08, 0, 0, 1];
          const col = (x, y, z, nx, ny) => { const h = sat((y - at[1]) / 0.22); return mix3(mix3(C.spoutDk, C.spout, sstep(0.0, 0.35, h)), C.spoutHi, sstep(0.45, 1.0, h) * 0.8 + sstep(0.3, 0.95, ny) * 0.25); };
          const prof = [[0, -0.012], [0.048, -0.006], [0.042, 0.03], [0.033, 0.085], [0.038, 0.125], [0.058, 0.158], [0.048, 0.186], [0, 0.2]];
          const lp = []; for (let i = 0; i < prof.length - 1; i++) for (let r = 0; r < (i === 2 || i === 4 ? rows - 3 : 1) + 1; r++) { const t = r / ((i === 2 || i === 4 ? rows - 3 : 1) + 1); lp.push([lerp(prof[i][0], prof[i + 1][0], t), lerp(prof[i][1], prof[i + 1][1], t)]); }
          lp.push(prof[prof.length - 1]);
          addGeo(THREE, acc, new THREE.LatheGeometry(lp.map(([r, y]) => new THREE.Vector2(r, y)), seg), M, (x, y, z, nx, ny) => col(x + at[0], y + at[1], z + at[2], nx, ny), k, bone);
          // the crown: arms arcing out and down, each ending in a drop
          const drop = new THREE.SphereGeometry(1, max(5, seg >> 1), max(3, rows - 1));
          for (let i = 0; i < arms; i++) {
            const a = (i / arms) * PI * 2 + 0.35, ca = cos(a), sa = sin(a), rr = i % 2 ? 0.92 : 1.05;
            const pts = [[0, 0.168, 0], [ca * 0.075 * rr, 0.218, sa * 0.075 * rr], [ca * 0.13 * rr, 0.19, sa * 0.13 * rr], [ca * 0.16 * rr, 0.13, sa * 0.16 * rr]];
            const n = pts.length, R = [0.036, 0.031, 0.024, 0.017];
            addGeo(THREE, acc, taperTube(THREE, pts, R, R, max(4, seg >> 1), [0, 1, 0], true), M, (x, y, z, nx, ny) => col(x + at[0], y + at[1], z + at[2], nx, ny), k, bone);
            addGeo(THREE, acc, drop, M.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(ca * 0.165 * rr, 0.104, sa * 0.165 * rr), new THREE.Quaternion(), new THREE.Vector3(0.025, 0.034, 0.025))), (x, y, z, nx, ny) => mix3(C.spout, C.spoutHi, sstep(0, 1, ny) * 0.7), k, bone);
            void n;
          }
          if (LV.extras) for (const [x, y, z, r] of [[0.03, 0.268, 0.014, 0.018], [-0.036, 0.25, -0.02, 0.014], [0.0, 0.298, -0.03, 0.011]])
            addGeo(THREE, acc, drop, M.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, r * 1.15, r))), (x2, y2, z2, nx, ny) => mix3(C.spout, C.spoutHi, sstep(-0.2, 1, ny)), k, bone);
        }

        /* ------------------------------------------------------------------ build */
        function WhaleFinal(THREE, KIT, detail, opts) {
          opts = opts || {};
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop;
          const C = palette(THREE);
          const toon = opts.toon || DF.toonMaterial(THREE, opts);
          const E0 = EX.neutral, F = whaleSDF(E0);
          if (LV.far) return buildFar(THREE, F, C, toon, T0, now);
          const stats = { parts: {} };
          const acc = new Acc();
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const qFrom = (dir) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(v3.norm(dir)));
          const tpart = (name, t0) => { stats.parts[name] = (stats.parts[name] || 0) + (acc.I.length - t0) / 3; };
          const aoAt = (x, y, z, nx, ny, nz, step) => {
            let occ = 0;
            for (let s = 1; s <= 4; s++) { const hs = s * step; occ += max(0, 1 - F.bodyAll(x + nx * hs, y + ny * hs, z + nz * hs) / hs) / s; }
            return sat(1 - 0.55 * max(0, occ - 0.12));
          };
          const aoStep = detail === 'mid' ? 0.03 : 0.018;
          const kSkin = [0.34, 0.45, 0, 1];
          let t = now(), t0;

          /* ---- eyes: on the surface, a little proud, facing between forward and the normal */
          const g0 = [0, 0, 0];
          const eyeAt = (side) => {
            const p = rayHit(F.headCore, [side * S.eye.x, S.eye.y, 0.6], [0, 0, -1], 0, 0.8);
            grad(F.headCore, p[0], p[1], p[2], 0.002, g0);
            const dir = v3.norm(v3.lerp(g0, [side * 0.1, 0.03, 1], S.eye.fwd));
            return { c: v3.add(p, dir, -(S.eye.r - S.eye.prot)), dir };
          };
          const EYE = { L: eyeAt(1), R: eyeAt(-1) };
          const eyeQ = (side) => qFrom(side > 0 ? EYE.L.dir : EYE.R.dir);

          /* ---- the blue skin: head + body + flippers + tail stock, one smooth surface */
          t0 = acc.I.length;
          const main = mcPart(KIT, acc, F.bodyAll, [-0.4, -0.04, -0.62, 0.4, 1.02, 0.54], LV.main, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            let c = mix3(C.blue, C.blueDk, sstep(0.15, 0.95, ny) * 0.3 + sstep(-0.1, -0.4, z) * 0.22);
            c = mix3(c, C.blueHi, sstep(0.0, -0.7, ny) * 0.3);
            const fin = sstep(0.012, -0.004, F.finF(abs(x), y, z) - F.headTorso(x, y, z));
            c = mix3(c, C.blueHi, fin * sstep(-0.2, -0.8, ny) * 0.6);                  // pale flipper undersides
            return shade(c, ao, 0.7);
          }, (x, y, z) => G(x, y, z) > -0.05 || F.finF(abs(x), y, z) < F.headTorso(x, y, z) + 0.01 || F.tailF(x, y, z) < F.headTorso(x, y, z) + 0.01, kSkin, BI.body);
          for (let v = main.v0; v < main.v1; v++) {
            const x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
            let w = headW(x, y, z);
            if (z < -0.12) { const tf = F.tailF(x, y, z), ht = F.headTorso(x, y, z); if (tf < ht + 0.03) { const u = tailU(x, y, z), tw = tailW(u), k = sstep(0.03, -0.01, tf - ht); w = k >= 1 ? tw : (u < 0.22 ? [BI.body, BI.tail0, tw[2] * k] : tw); } }
            acc.B[3 * v] = w[0]; acc.B[3 * v + 1] = w[1]; acc.B[3 * v + 2] = w[2];
          }
          tpart('skin', t0);

          /* ---- the pale belly + throat: its own shell (clean raised paint edge) */
          t0 = acc.I.length;
          const shell = mcPart(KIT, acc, F.shellF, [-0.36, -0.04, -0.06, 0.36, 0.7, 0.4], LV.main, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const c = mix3(C.belly, C.bellyDk, sstep(0.1, -0.7, ny) * 0.5 + sstep(-0.03, 0.0, G(x, y, z)) * 0.15);
            return shade(c, ao, 0.74);
          }, null, [0.4, 0.35, 0, 1], BI.body);
          for (let v = shell.v0; v < shell.v1; v++) { const w = headW(acc.P[3 * v], acc.P[3 * v + 1], acc.P[3 * v + 2]); acc.B[3 * v] = w[0]; acc.B[3 * v + 1] = w[1]; acc.B[3 * v + 2] = w[2]; }
          tpart('belly', t0);
          stats.sdfMs = Math.round(now() - t); t = now();

          /* ---- the fluke (finer grid; mid = two flattened lobes) */
          t0 = acc.I.length;
          if (LV.fluke) {
            mcPart(KIT, acc, flukeF, [-0.4, 0.38, -0.72, 0.4, 0.8, -0.38], LV.fluke, true, (x, y, z, nx, ny, nz) => {
              const o = S.fluke.o, under = sstep(0.2, -0.5, nx * 0 + ny * FL.w[1] + nz * FL.w[2]);
              const tip = sstep(0.18, 0.31, abs(x));
              return shade(mix3(mix3(C.blue, C.blueDk, 0.25 + 0.2 * tip), C.blueHi, under * 0.6), 0.92 + 0.08 * sstep(0.3, 1, abs(ny)), 1); void o;
            }, (x, y, z) => F.tailF(x, y, z) > -0.004, kSkin, BI.tail2);
          } else {
            const lobe = new THREE.SphereGeometry(1, 8, 4), o = S.fluke.o;
            for (const s of [1, -1]) {
              const ang = 0.36, cx = 0.2, along = 0.08;
              const pc = v3.add(v3.add(o, [s * cx, 0, 0]), FL.v, along + 0.03);
              const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V([1, 0, 0]), V(FL.v), V(FL.w))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * ang)));
              addGeo(THREE, acc, lobe, M4().compose(V(pc), q, V([0.19, 0.076, 0.026])), (x, y, z, nx, ny, nz) => (ny * FL.w[1] + nz * FL.w[2] < -0.2 ? C.blueHi : C.blue), kSkin, BI.tail2);
            }
          }
          tpart('fluke', t0);

          /* ---- the face: everything an expression changes (fixed topology; rebuilt per expression) */
          const lineK = [0.45, 0, 0, 0.6], darkK = [0.7, 0, 4, 1];
          const nLine = max(10, Math.round(22 * LV.seg));
          function buildFace(A, E, FE) {
            const hf = (x, y, z) => min(FE.headCore(x, y, z), FE.shellF(x, y, z)), ht = FE.headTorso, M = E.mouth;
            const top = (s) => [s * M.w, M.y + M.curve * s * s + M.tilt * s + M.wob * sin(s * 11) + M.flick * max(0, s - 0.7) / 0.3 + M.curl * (max(0, abs(s) - 0.72) / 0.28) ** 2];
            const bot = (s) => { const q = sat(1 - (s / max(0.05, M.openW)) ** 2), p = top(s); return [p[0], p[1] - M.open * Math.pow(q, 0.6) - 0.0004]; };
            const S1 = [], S2 = [], S3 = [], S4 = [];
            for (let i = 0; i <= nLine; i++) { const s = -1 + 2 * i / nLine; S1.push(top(s)); S2.push(bot(s)); }
            addGeo(THREE, A, gridDecal(THREE, hf, S1, S2, 3, 0.0018, 0.25), M4(), mix3(C.mouth, C.mouthHi, 0.3), darkK, BI.head);
            for (let i = 0; i <= nLine; i++) {
              const s = -1 + 2 * i / nLine, b = bot(s * 0.55 * M.openW), q = sat(1 - s * s);
              S4.push(b); S3.push([b[0], b[1] + 0.0008 + M.tongue * M.open * 0.5 * Math.pow(q, 0.7)]);
            }
            addGeo(THREE, A, gridDecal(THREE, hf, S4, S3, 2, (x, y, u) => 0.0026 + 0.0035 * u * M.tongue, 0.25), M4(), mix3(C.tongue, C.tongueDk, 0.25), [0.4, 0.4, 0, 1], BI.head);
            const sp = onSurface(hf, S1, 0.0016), rr = sp.map((_, i) => 0.0092 * (0.4 + 0.6 * sin(PI * (0.05 + 0.9 * i / nLine))));
            addGeo(THREE, A, taperTube(THREE, sp, rr, rr, LV.tube, [0, 0, 1], true), M4(), C.line, lineK, BI.head);
            const sb = onSurface(hf, S2, 0.0012), rb = sb.map((_, i) => 0.0062 * (0.3 + 0.7 * sin(PI * (0.06 + 0.88 * i / nLine))));
            addGeo(THREE, A, taperTube(THREE, sb, rb, rb, max(4, LV.tube - 2), [0, 0, 1], true), M4(), C.line, lineK, BI.head);
            // brows: short arcs over the eyes (one cocked for the smug face)
            const nb = max(4, Math.round(7 * LV.seg));
            for (const [side, i] of [[1, 0], [-1, 1]]) {
              const bp = [];
              for (let j = 0; j <= nb; j++) { const s = -1 + 2 * j / nb, tilt = E.browT[i]; bp.push([side * (S.eye.x + 0.004 + s * 0.036), S.eye.y + 0.07 + E.brow[i] + 0.008 * (1 - s * s) - tilt * 0.03 * s * side]); }
              const pp = onSurface(hf, bp, 0.004), pr = pp.map((_, j) => 0.0085 * (0.45 + 0.55 * sin(PI * (0.08 + 0.84 * j / nb))));
              addGeo(THREE, A, taperTube(THREE, pp, pr, pr, max(4, LV.tube - 1), [0, 0, 1], true), M4(), C.brow, lineK, BI.head);
            }
            // blush on the cheeks
            const bl = new THREE.SphereGeometry(1, max(8, LV.lid[0]), max(4, LV.lid[1] - 1));
            for (const side of [1, -1]) {
              const p = rayHit(hf, [side * 0.205, 0.628, 0.6], [0, 0, -1], 0, 0.8, 40) || [side * 0.2, 0.62, 0.2]; grad(hf, p[0], p[1], p[2], 0.002, g0);
              const k = E.blush;
              addGeo(THREE, A, bl, M4().compose(V(v3.add(p, g0, -0.001)), qFrom(g0), V([0.036 * k, 0.021 * k, 0.004])), C.blush, [0.55, 0, 0, 1], BI.head);
            }
            // the paint seam: a thin pale piping traced where the belly shell meets the skin (hides the MC edge, like the
            // dogs' karts' waist strip); traced on the expression's surface so it follows the cheeks
            {
              const nS = max(18, Math.round(56 * LV.seg)), pts = [], gg = [0, 0, 0], gs = [0, 0, 0];
              const thB = 1.0, yB = 0.16, yT = 0.58, L1 = yT - yB, L2 = 2 * thB * 0.24, Ltot = 2 * L1 + L2;
              for (let i = 0; i <= nS; i++) {
                const d = (i / nS) * Ltot; let th, y;
                if (d < L1) { th = -thB; y = yB + d; } else if (d < L1 + L2) { th = -thB + 2 * thB * (d - L1) / L2; y = yT; } else { th = thB; y = yT - (d - L1 - L2); }
                const dir = [sin(th), 0, cos(th)];
                let p = rayHit(ht, [dir[0] * 0.6, y, -0.02 + dir[2] * 0.6], [-dir[0], 0, -dir[2]], 0, 0.6, 48) || [dir[0] * 0.25, y, dir[2] * 0.25];
                for (let it = 0; it < 8; it++) {   // alternate: onto the shell's dive line along the surface, then back onto the skin
                  const e = G(p[0], p[1], p[2]) + 0.004; grad(G, p[0], p[1], p[2], 0.002, gs); grad(ht, p[0], p[1], p[2], 0.002, gg);
                  const dt = v3.dot(gs, gg), tg = v3.norm(v3.sub(gs, v3.scale(gg, dt))); p = v3.add(p, tg, -clamp(e / max(0.2, v3.dot(gs, tg)), -0.03, 0.03));
                  const f = ht(p[0], p[1], p[2]); grad(ht, p[0], p[1], p[2], 0.002, gg); p = v3.add(p, gg, -f);
                }
                grad(ht, p[0], p[1], p[2], 0.002, gg); pts.push(v3.add(p, gg, SHELL * 0.6));
              }
              const pr = pts.map((_, i) => 0.0088 * (i < 2 || i > nS - 2 ? 0.6 : 1));
              addGeo(THREE, A, taperTube(THREE, pts, pr, pr, max(4, LV.tube - 1), (i) => { const q = pts[i]; return v3.norm([q[0], 0, q[2] + 0.02]); }, true), M4(), (x, y, z, nx, ny) => shade(mix3(C.belly, C.bellyDk, sstep(0.3, -0.6, ny) * 0.5), 0.95, 1), [0.4, 0.35, 0, 1], headW);
            }
            // throat pleats: thin raised grooves on the pale shell, converging down the chest
            const np = LV.pleats, nP = max(5, Math.round(9 * LV.seg));
            for (let i = 0; i < np; i++) {
              const x0 = (-1 + 2 * (i + 0.5) / np) * 0.13, pts = [];
              for (let j = 0; j <= nP; j++) { const u = j / nP, x = x0 * (1 - 0.3 * u); pts.push([x, lerp(topY(abs(x0)) - 0.034, 0.4, u)]); }
              const pp = onSurface(ht, pts, SHELL + 0.0008), pr = pp.map((_, j) => 0.0048 * (0.3 + 0.7 * sin(PI * (0.04 + 0.92 * j / nP))));
              addGeo(THREE, A, taperTube(THREE, pp, pr, pr, max(3, LV.tube - 2), [0, 0, 1], true), M4(), C.pleat, [0.5, 0.35, 0, 0.85], headW);
            }
            // the sweat drop on the temple (inside the head when off)
            if (LV.extras) {
              const p = rayHit(hf, [0.262, 0.752, 0.6], [0, 0, -1], 0, 0.8, 40) || [0.26, 0.75, 0.05]; grad(hf, p[0], p[1], p[2], 0.002, g0);
              const sw = E.sweat;
              const dg = new THREE.LatheGeometry([[0, -1], [0.55, -0.86], [0.82, -0.45], [0.66, 0.1], [0.3, 0.62], [0, 1.05]].map(([r, h]) => new THREE.Vector2(r * 0.026, h * 0.04)), max(6, LV.lid[0] >> 1));
              const at = sw > 0.01 ? v3.add(p, g0, 0.015 * min(1, sw)) : v3.add(p, g0, -0.03);
              addGeo(THREE, A, dg, M4().compose(V(at), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.25)), V(v3.scale([1, 1, 0.75], max(0.002, sw)))),
                (x, y, z, nx, ny) => mix3(C.sweat, C.sweatHi, sstep(0.0, 0.9, ny + nx * 0.3)), [0.05, 0, 0, 1], BI.head);
            }
          }
          t0 = acc.I.length;
          const fc0 = acc.n;
          buildFace(acc, E0, F);
          const fc1 = acc.n;
          tpart('face', t0);

          /* ---- blowhole ring + the spout */
          t0 = acc.I.length;
          {
            grad(F.headCore, SPOUT_AT[0], SPOUT_AT[1], SPOUT_AT[2], 0.002, g0);
            addGeo(THREE, acc, new THREE.TorusGeometry(0.034, 0.009, max(3, LV.tube - 2), max(10, LV.spout[0])).rotateX(PI / 2), M4().compose(V(v3.add(SPOUT_AT, g0, 0.001)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(g0)), V([1.15, 1, 0.85])), C.hole, [0.5, 0, 0, 1], BI.head);
            spoutGeo(THREE, acc, C, LV, BI.spout, SPOUT_AT);
          }
          tpart('spout', t0);

          /* ---- eyelids (upper shell + dark rim, lower shell), happy arcs, squeeze chevrons (dog.js recipe) */
          t0 = acc.I.length;
          const eyeR = S.eye.r, lidR = eyeR + 0.0045;
          const upG = new THREE.SphereGeometry(lidR, LV.lid[0], LV.lid[1], 0, PI * 2, 0, PI / 2);
          const loG = new THREE.SphereGeometry(lidR - 0.0016, LV.lid[0], max(3, LV.lid[1] - 2), 0, PI * 2, PI / 2, PI / 2);
          const rimG = new THREE.TorusGeometry(lidR - 0.002, 0.0058, LV.rim[0], LV.rim[1], PI).rotateX(PI / 2);
          const loRimG = new THREE.TorusGeometry(lidR - 0.0035, 0.0028, 3, max(8, LV.rim[1] >> 1), PI).rotateX(PI / 2);
          const nA = max(6, Math.round(12 * LV.seg)), tubeA = max(3, LV.tube - 2);
          const arcPts = []; for (let i = 0; i <= nA; i++) { const s = -1 + 2 * i / nA; arcPts.push(v3.scale(v3.norm([0.66 * s, -0.1 + 0.32 * (1 - s * s), 1]), lidR + 0.003)); }
          const arcR = arcPts.map((_, i) => 0.0085 * (0.4 + 0.6 * sin(PI * i / nA)));
          const arcG = taperTube(THREE, arcPts, arcR, arcR, tubeA, [0, 0, 1], true);
          for (const side of [1, -1]) {
            const sfx = side > 0 ? 'L' : 'R';
            addGeo(THREE, acc, upG, M4(), (x, y) => shade(mix3(C.lid, mul3(C.lid, 0.84), sstep(0, lidR, y) * 0.4), 1, 1), [0.36, 0.45, 0, 0.9], BI['lid' + sfx]);
            addGeo(THREE, acc, rimG, M4(), C.lidLine, [0.45, 0.3, 0, 0.7], BI['lid' + sfx]);
            addGeo(THREE, acc, loG, M4(), shade(C.lidLo, 0.92, 1), [0.45, 0.35, 0, 0.9], BI['low' + sfx]);
            if (LV.extras) addGeo(THREE, acc, loRimG, M4(), mix3(C.lidLine, C.lidLo, 0.5), [0.5, 0, 0, 1], BI['low' + sfx]);
            addGeo(THREE, acc, arcG, M4(), C.lidLine, [0.45, 0, 0, 1], BI['arc' + sfx]);
            const ch = [[side * 0.55, 0.42], [-side * 0.4, 0.02], [side * 0.55, -0.36]].map(([a, b]) => v3.scale(v3.norm([a, b, 1]), lidR + 0.003));
            const chP = new THREE.CatmullRomCurve3(ch.map((p) => V(p)), false, 'catmullrom', 0.1).getPoints(max(6, nA)).map((p) => [p.x, p.y, p.z]);
            const chR = chP.map((_, i) => 0.0082 * (0.5 + 0.5 * sin(PI * i / (chP.length - 1))));
            addGeo(THREE, acc, taperTube(THREE, chP, chR, chR, tubeA, [0, 0, 1], true), M4(), C.lidLine, [0.45, 0, 0, 1], BI['sq' + sfx]);
          }
          tpart('lids', t0);
          stats.accMs = Math.round(now() - t); t = now();

          /* ---- geometry; eye-frame parts bound at the eye */
          const nv = acc.n, geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
          for (let v = 0; v < nv; v++) { SI[4 * v] = acc.B[3 * v]; SI[4 * v + 1] = acc.B[3 * v + 1]; const f = acc.B[3 * v + 2]; SW[4 * v] = 1 - f; SW[4 * v + 1] = f; }
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
          {
            const pa = geo.attributes.position, na = geo.attributes.normal, vv = new THREE.Vector3(), nn = new THREE.Vector3();
            const eyeBones = new Set(['lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'sqL', 'sqR'].map((n) => BI[n]));
            const qL = eyeQ(1), qR = eyeQ(-1);
            for (let v = 0; v < nv; v++) {
              const b = acc.B[3 * v]; if (!eyeBones.has(b)) continue;
              const side = BONES[b].endsWith('L') ? 1 : -1, E = side > 0 ? EYE.L : EYE.R, q = side > 0 ? qL : qR;
              vv.fromBufferAttribute(pa, v).applyQuaternion(q).add(V(E.c)); pa.setXYZ(v, vv.x, vv.y, vv.z);
              nn.fromBufferAttribute(na, v).applyQuaternion(q); na.setXYZ(v, nn.x, nn.y, nn.z);
            }
          }
          geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));

          /* ---- morph targets: skin + shell re-projected onto the expression SDF (cheeks, jaw); face rebuilt with E */
          const names = [];
          if (LV.morph && !(typeof window !== 'undefined' && window.KartDiag && window.KartDiag.nomorph)) {
            geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
            const g = [0, 0, 0];
            for (const name of NAMES) {
              const E = EX[name], FE = whaleSDF(E);
              const dP = new Float32Array(nv * 3), dN = new Float32Array(nv * 3);
              const changes = (E.cheek || 0) !== (E0.cheek || 0) || (E.jaw || 0) !== (E0.jaw || 0);
              const ranges = [[main, F.bodyAll, FE.bodyAll], [shell, F.shellF, FE.shellF]];
              if (changes) for (const [R, f0, fE] of ranges) for (let v = R.v0; v < R.v1; v++) {
                let x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
                if (z < -0.04 || y > 0.8 || y < 0.4) continue;
                // ROSTER FIX: blue skin lying under the pale shell follows the SHELL's morph (keeps its depth under it), so the
                // puffed cheek can no longer push a blue sliver out past the belly edge
                const under = R === main && G(x, y, z) < 0.012, f0v = under ? F.shellF : f0, fEv = under ? FE.shellF : fE;
                const lvl = f0v(x, y, z);
                let d = fEv(x, y, z) - lvl; if (abs(d) < 2e-5) continue;
                for (let it = 0; it < 4 && abs(d) > 1e-5; it++) { grad(fEv, x, y, z, 0.0015, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; d = fEv(x, y, z) - lvl; }
                grad(fE, x, y, z, 0.002, g);
                dP[3 * v] = x - acc.P[3 * v]; dP[3 * v + 1] = y - acc.P[3 * v + 1]; dP[3 * v + 2] = z - acc.P[3 * v + 2];
                dN[3 * v] = g[0] - acc.N[3 * v]; dN[3 * v + 1] = g[1] - acc.N[3 * v + 1]; dN[3 * v + 2] = g[2] - acc.N[3 * v + 2];
              }
              if (changes) for (const [R] of ranges) {   // flip guard (dog.js)
                const Pp = acc.P, I = acc.I, tri = (a, b, c, k) => {
                  const ax = Pp[3 * a] + k * dP[3 * a], ay = Pp[3 * a + 1] + k * dP[3 * a + 1], az = Pp[3 * a + 2] + k * dP[3 * a + 2];
                  const ux = Pp[3 * b] + k * dP[3 * b] - ax, uy = Pp[3 * b + 1] + k * dP[3 * b + 1] - ay, uz = Pp[3 * b + 2] + k * dP[3 * b + 2] - az;
                  const wx = Pp[3 * c] + k * dP[3 * c] - ax, wy = Pp[3 * c + 1] + k * dP[3 * c + 1] - ay, wz = Pp[3 * c + 2] + k * dP[3 * c + 2] - az;
                  return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
                };
                for (let v = R.v0; v < R.v1; v++) { const l = hypot(dP[3 * v], dP[3 * v + 1], dP[3 * v + 2]); if (l > 0.035) for (let q = 0; q < 3; q++) dP[3 * v + q] *= 0.035 / l; }
                for (let pass = 0; pass < 6; pass++) {
                  let bad = 0;
                  for (let tt = R.t0; tt < R.t1; tt += 3) {
                    const a = I[tt], b = I[tt + 1], c = I[tt + 2], n0 = tri(a, b, c, 0), n1 = tri(a, b, c, 1), l0 = hypot(...n0), l1 = hypot(...n1);
                    if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0.2 * l0 * l1) { bad++; for (const w of [a, b, c]) for (let q = 0; q < 3; q++) { dP[3 * w + q] *= 0.5; dN[3 * w + q] *= 0.5; } }
                  }
                  if (!bad) break;
                }
              }
              const A = new Acc(); buildFace(A, E, FE);
              if (A.n !== fc1 - fc0) throw new Error('face topology changed for ' + name + ': ' + A.n + ' vs ' + (fc1 - fc0));
              for (let i = 0; i < A.n; i++) { const v = fc0 + i; for (let q = 0; q < 3; q++) { dP[3 * v + q] = A.P[3 * i + q] - acc.P[3 * v + q]; dN[3 * v + q] = A.N[3 * i + q] - acc.N[3 * v + q]; } }
              geo.morphAttributes.position.push(new THREE.Float32BufferAttribute(dP, 3));
              geo.morphAttributes.normal.push(new THREE.Float32BufferAttribute(dN, 3));
              names.push(name);
            }
            geo.morphTargetsRelative = true;
          }
          stats.morphMs = Math.round(now() - t);
          geo.computeBoundingSphere();

          /* ---- skeleton */
          const TP = S.tail.pts;
          const REST = {
            root: [0, 0, 0], body: [0, 0, 0], head: S.neck,
            lidL: EYE.L.c, lidR: EYE.R.c, lowL: EYE.L.c, lowR: EYE.R.c, arcL: EYE.L.c, arcR: EYE.R.c, sqL: EYE.L.c, sqR: EYE.R.c,
            tail0: TP[1], tail1: TP[2], tail2: TP[4], spout: SPOUT_AT,
          };
          const bones = {}, list = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; return b; });
          const LOCALQ = { lidL: eyeQ(1), lidR: eyeQ(-1), lowL: eyeQ(1), lowR: eyeQ(-1), arcL: eyeQ(1), arcR: eyeQ(-1), sqL: eyeQ(1), sqR: eyeQ(-1) };
          const worldQ = {};
          BONES.forEach((n) => {
            const p = PARENT[n]; if (!p) { worldQ[n] = new THREE.Quaternion(); return; }
            const w = REST[n], pw = REST[p], pq = worldQ[p];
            bones[n].position.copy(V(v3.sub(w, pw)).applyQuaternion(pq.clone().invert()));
            if (LOCALQ[n]) bones[n].quaternion.copy(pq.clone().invert().multiply(LOCALQ[n]));
            worldQ[n] = pq.clone().multiply(bones[n].quaternion);
            bones[p].add(bones[n]);
          });
          const mesh = new THREE.SkinnedMesh(geo, toon); mesh.name = 'whale-skin';
          const group = new THREE.Group(); group.name = 'whale-' + detail;
          group.add(bones.root); group.add(mesh);
          group.updateMatrixWorld(true);
          mesh.bind(new THREE.Skeleton(list));
          mesh.frustumCulled = false;
          if (names.length) { mesh.morphTargetDictionary = {}; names.forEach((k, i) => { mesh.morphTargetDictionary[k] = i; }); mesh.morphTargetInfluences = names.map(() => 0); }

          /* ---- eyeballs: one mesh on the head bone */
          const eyeG = new THREE.SphereGeometry(eyeR, LV.eye[0], LV.eye[1], 0, PI * 2, 0, PI * 0.6).rotateX(PI / 2);
          const EP = [], EN = [], EA = [], EI = [];
          const headInv = new THREE.Matrix4().compose(V(S.neck), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)).invert();
          for (const side of [1, -1]) {
            const E = side > 0 ? EYE.L : EYE.R;
            const m = M4().compose(V(E.c), eyeQ(side), new THREE.Vector3(1, 1, 1)).premultiply(headInv), nm = new THREE.Matrix3().getNormalMatrix(m);
            const p = eyeG.attributes.position, nr = eyeG.attributes.normal, b = EP.length / 3, vv = new THREE.Vector3(), n = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
              vv.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
              EA.push(n.x, n.y, n.z, side);
              vv.applyMatrix4(m); n.applyMatrix3(nm).normalize();
              EP.push(vv.x, vv.y, vv.z); EN.push(n.x, n.y, n.z);
            }
            for (let i = 0; i < eyeG.index.count; i++) EI.push(b + eyeG.index.getX(i));
          }
          const eg = new THREE.BufferGeometry();
          eg.setAttribute('position', new THREE.Float32BufferAttribute(EP, 3)); eg.setAttribute('normal', new THREE.Float32BufferAttribute(EN, 3));
          eg.setAttribute('aEye', new THREE.Float32BufferAttribute(EA, 4)); eg.setIndex(EI);
          const eyeMat = opts.eyeMat || DF.eyeMaterial(THREE);
          const eyes = new THREE.Mesh(eg, eyeMat); eyes.name = 'whale-eyes';
          bones.head.add(eyes);

          stats.parts.eyes = EI.length / 3;
          stats.tris = acc.I.length / 3 + EI.length / 3; stats.verts = nv; stats.ms = Math.round(now() - T0);
          stats.headShare = headShare(F);
          const api = rig(THREE, { bones, mesh, eyeMat, stats, names, level: detail });
          group.userData.racer = api;
          group.userData.stats = stats;
          return group;
        }

        // head share of the seated height (chin to crown over seat to crown; spout excluded)
        function headShare(F) {
          const top = rayHit(F.headCore, [0, 1.3, S.cran[2]], [0, -1, 0], 0, 0.8, 96)[1];
          let chin = 1; for (let z = 0.0; z < 0.3; z += 0.01) { const p = rayHit(F.headCore, [0, 0.2, z], [0, 1, 0], 0, 0.6, 96); if (p) chin = min(chin, p[1]); }
          for (let x = 0; x < 0.3; x += 0.01) { const p = rayHit(F.headCore, [x, 0.2, 0.03], [0, 1, 0], 0, 0.6, 96); if (p) chin = min(chin, p[1]); }
          return { top: +top.toFixed(3), chin: +chin.toFixed(3), share: +((top - chin) / top).toFixed(3) };
        }

        /* ------------------------------------------------------------------ far: snapped low-poly parts, the face painted */
        function buildFar(THREE, F, C, toon, T0, now) {
          const acc = new Acc(), M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]), g = [0, 0, 0];
          const snap = (f, c, ws, hs, rmax, col, k) => {
            const s = new THREE.SphereGeometry(1, ws, hs), p = s.attributes.position, n = s.attributes.normal;
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i), p.getY(i), p.getZ(i)]);
              let lo = 0, hi = rmax;
              for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (f(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c, d, (lo + hi) / 2); p.setXYZ(i, q[0], q[1], q[2]); grad(f, q[0], q[1], q[2], 0.004, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            addGeo(THREE, acc, s, M4(), col, k, 0);
          };
          const kS = [0.36, 0.4, 0, 1], kP = [0.45, 0, 0, 1];
          const paint = (x, y, z, nx, ny) => (G(x, y, z) < 0 ? C.belly : mix3(C.blue, C.blueDk, sstep(0.3, 0.95, ny) * 0.3));
          snap(F.headTorso, [0, 0.62, 0.0], 12, 9, 0.7, paint, kS);
          // flippers, tail, fluke, spout
          const cyl = (A, B, ra, rb, col, seg) => {
            const d = v3.sub(B, A), L = hypot(...d), c = new THREE.CylinderGeometry(rb, ra, L, seg || 5, 1, true);
            addGeo(THREE, acc, c, M4().compose(V(v3.add(A, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), V([1, 1, 1])), col, kS, 0);
          };
          for (const s of [1, -1]) { const X = (p) => [s * p[0], p[1], p[2]]; cyl(X(S.fin.A), X(S.fin.B), 0.065, 0.055, C.blue, 4); cyl(X(S.fin.B), X(pawC), 0.055, 0.05, C.blue, 4); }
          const TP = S.tail.pts;
          addGeo(THREE, acc, taperTube(THREE, TP.slice(1), S.tail.r.slice(1).map((r) => r * 0.9), S.tail.r.slice(1).map((r) => r * 0.9), 4, [1, 0, 0], false), M4(), C.blue, kS, 0);
          const o = S.fluke.o, lobe = new THREE.SphereGeometry(1, 6, 3);
          for (const s of [1, -1]) {
            const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V([1, 0, 0]), V(FL.v), V(FL.w))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * 0.36)));
            addGeo(THREE, acc, lobe, M4().compose(V(v3.add(v3.add(o, [s * 0.2, 0, 0]), FL.v, 0.11)), q, V([0.19, 0.076, 0.028])), C.blue, kS, 0);
          }
          const sp = SPOUT_AT;
          addGeo(THREE, acc, new THREE.CylinderGeometry(0.04, 0.03, 0.17, 5, 1, true), M4().makeTranslation(sp[0], sp[1] + 0.08, sp[2]), C.spout, [0.1, 0, 0, 1], 0);
          addGeo(THREE, acc, new THREE.SphereGeometry(1, 6, 3), M4().compose(V([sp[0], sp[1] + 0.18, sp[2]]), new THREE.Quaternion(), V([0.13, 0.06, 0.13])), (x, y, z, nx, ny) => mix3(C.spout, C.spoutHi, sstep(-0.2, 0.8, ny)), [0.1, 0, 0, 1], 0);
          // the face: eyes (white + pupil under a heavy lid line), the smile bar
          const fz = (x, y) => faceAt(F.headCore, x, y, 0.004);
          for (const side of [1, -1]) {
            const p = fz(side * S.eye.x, S.eye.y);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 3), M4().compose(V(p), new THREE.Quaternion(), V([0.046, 0.04, 0.02])), C.white, kP, 0);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 2), M4().compose(V(v3.add(p, [side * 0.004, -0.008, 0.014])), new THREE.Quaternion(), V([0.024, 0.024, 0.012])), C.line, kP, 0);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 2), M4().compose(V(v3.add(p, [0, 0.022, 0.01])), new THREE.Quaternion(), V([0.052, 0.02, 0.018])), C.blueDk, kP, 0);
          }
          const ml = []; for (let i = 0; i <= 5; i++) { const s = -1 + 2 * i / 5; ml.push(fz(s * 0.19, M0.y + M0.curve * s * s)); }
          addGeo(THREE, acc, taperTube(THREE, ml, ml.map(() => 0.011), ml.map(() => 0.011), 3, [0, 0, 1], false), M4(), C.line, kP, 0);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          geo.setIndex(new THREE.Uint16BufferAttribute(acc.I, 1));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, toon); mesh.name = 'whale-far';
          const group = new THREE.Group(); group.name = 'whale-far'; group.add(mesh);
          const stats = { tris: acc.I.length / 3, verts: acc.n, ms: Math.round(now() - T0), parts: { far: acc.I.length / 3 }, headShare: headShare(F) };
          const sq = { k: 1, v: 0 };
          const api = {
            level: 'far', mesh, stats, names: [], bones: null,
            set() { return api; }, setExpression() { return api; }, setGaze() { return api; }, look() { return api; }, blink() { return api; }, steer() { return api; },
            squash(k) { sq.k = k; mesh.scale.set(1 / sqrt(k), k, 1 / sqrt(k)); return api; }, kick(v) { sq.v += v; },
            update(dt) { const a = -220 * (sq.k - 1) - 14 * sq.v; sq.v += a * dt; sq.k += sq.v * dt; mesh.scale.set(1 / sqrt(sq.k), sq.k, 1 / sqrt(sq.k)); },
          };
          group.userData.racer = api; group.userData.stats = stats;
          return group;
        }

        /* ------------------------------------------------------------------ the live layer (Pepe FINAL / dogs API) */
        function rig(THREE, o) {
          const { bones: B, eyeMat, stats, names } = o;
          const Un = eyeMat.userData.uniforms;
          Un.uIrisC.value.set('#1E2C52');
          const rest = {}; for (const k in B) rest[k] = B[k].quaternion.clone();
          const N0 = EX.neutral, NM = names.length ? names : NAMES;
          const st = { w: {}, target: null, gaze: null, look: [0, 0], blink: 0, autoBlink: true, nextBlink: 2 + Math.random() * 3, blinkT: -1, sq: 1, sqV: 0, steer: 0, t: 0 };
          NM.forEach((n) => { st.w[n] = 0; });
          const springs = ['tail0', 'tail1', 'tail2', 'spout'].map((n) => ({ n, a: 0, v: 0, b: 0, bv: 0 }));
          const qx = new THREE.Quaternion(), e = new THREE.Euler();
          const blend = (key) => { let v = N0[key]; for (const k of NM) v += st.w[k] * (EX[k][key] - N0[key]); return v; };
          function apply() {
            let gx = N0.gaze[0], gy = N0.gaze[1];
            for (const k of NM) { gx += st.w[k] * (EX[k].gaze[0] - N0.gaze[0]); gy += st.w[k] * (EX[k].gaze[1] - N0.gaze[1]); }
            if (st.gaze) { gx = st.gaze[0]; gy = st.gaze[1]; }
            gx += st.look[0]; gy += st.look[1];
            Un.uGazeL.value.set(gx, gy, 1).normalize(); Un.uGazeR.value.set(gx, gy, 1).normalize();
            Un.uPupil.value = blend('pupil'); Un.uIris.value = blend('iris'); Un.uSpark.value = blend('spark');
            const happy = blend('happy'), squeeze = blend('squeeze'), shut = max(happy, squeeze);
            let lu = blend('lidU'), ll = blend('lidLo');
            lu = lerp(lu, -1.5, max(sstep(0.3, 0.7, shut), st.blink)); ll = lerp(ll, -0.62, sstep(0.3, 0.7, shut));
            Un.uLid.value = lu;
            for (const s of ['L', 'R']) {
              B['lid' + s].quaternion.copy(rest['lid' + s]).multiply(qx.setFromEuler(e.set(-lu, 0, 0)));
              B['low' + s].quaternion.copy(rest['low' + s]).multiply(qx.setFromEuler(e.set(-ll, 0, 0)));
              B['arc' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, happy) * (1 - sstep(0.3, 0.7, squeeze))));
              B['sq' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, squeeze)));
            }
            if (o.mesh.morphTargetInfluences) NM.forEach((n, i) => { o.mesh.morphTargetInfluences[i] = st.w[n] || 0; });
            B.head.quaternion.copy(rest.head).multiply(qx.setFromEuler(e.set(0.02, st.steer * 0.16, blend('roll') - st.steer * 0.05)));
            B.body.rotation.set(0, 0, -st.steer * 0.05);
            B.root.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
            // the spout: height by expression, a living pulse, drooping when it sputters
            const sv = blend('spout'), pulse = 1 + 0.05 * sin(st.t * 9) + 0.03 * sin(st.t * 23);
            const sp = springs[3];
            B.spout.scale.set(0.4 + 0.6 * min(sv, 1.2), max(0.05, sv * pulse), 0.4 + 0.6 * min(sv, 1.2));
            B.spout.quaternion.copy(rest.spout).multiply(qx.setFromEuler(e.set(sp.a - 0.25 * sstep(0.6, 0.2, sv), 0, sp.b)));
          }
          const api = {
            level: o.level, bones: B, mesh: o.mesh, names: NM, EXPR: EX, stats,
            set(weights) { for (const k of NM) st.w[k] = weights && weights[k] ? weights[k] : 0; st.target = null; apply(); return api; },
            setExpression(name, instant) { st.target = name; if (instant) { for (const k of NM) st.w[k] = k === name ? 1 : 0; apply(); } return api; },
            setGaze(x, y) { st.gaze = x === null || x === undefined ? null : [x, y || 0]; apply(); return api; },
            look(x, y) { st.look[0] = x; st.look[1] = y; apply(); return api; },
            blink(v) { st.blink = v || 0; st.autoBlink = v === undefined; apply(); return api; },
            squash(k) { st.sq = k; apply(); return api; },
            kick(v) { st.sqV += v; },
            steer(v) { st.steer = v; apply(); return api; },
            // auto blinks every 2-5 s, eased expressions, squash spring (220 / 14), tail + spout springs
            update(dt, inp) {
              inp = inp || {}; st.t += dt;
              if (st.target !== null) { const k = 1 - exp(-dt * 12); for (const n of NM) st.w[n] += ((n === st.target ? 1 : 0) - st.w[n]) * k; }
              if (st.autoBlink && blend('happy') < 0.5 && blend('squeeze') < 0.5) {
                st.nextBlink -= dt;
                if (st.nextBlink <= 0 && st.blinkT < 0) { st.blinkT = 0; st.nextBlink = 2 + Math.random() * 3; }
                if (st.blinkT >= 0) { st.blinkT += dt; const u = st.blinkT / 0.16; st.blink = u < 0.4 ? u / 0.4 : max(0, 1 - (u - 0.4) / 0.6); if (u >= 1) { st.blinkT = -1; st.blink = 0; } }
              }
              const a = -220 * (st.sq - 1) - 14 * st.sqV; st.sqV += a * dt; st.sq += st.sqV * dt;
              const accl = inp.accel || 0, turn = inp.steer || 0;
              for (const s of springs) {
                const isSp = s.n === 'spout', k = isSp ? 160 : 110, d = isSp ? 10 : 8;
                const ta = (isSp ? -0.35 : 0.18) * accl, tb = (isSp ? 0.3 : -0.32) * turn;
                s.v += (k * (ta - s.a) - d * s.v) * dt; s.a += s.v * dt;
                s.bv += (k * (tb - s.b) - d * s.bv) * dt; s.b += s.bv * dt;
                if (!isSp) B[s.n].quaternion.copy(rest[s.n]).multiply(qx.setFromEuler(e.set(s.a, s.b, 0)));
              }
              apply();
            },
          };
          apply();
          return api;
        }

        /* ================================================================== BUBBLE SUB (the kart) */
        // (the tub's glass and water: KR.mat.water)
        const glassMaterial = (THREE) => root.mat.water(THREE);
        const TUB = { zc: -0.16, rx: 0.375, rz: 0.56, y0: 0.38, y1: 0.7, bulge: 0.05 };
        const tubR = (y) => 1 + TUB.bulge * sin(PI * sat((y - TUB.y0) / (TUB.y1 - TUB.y0)));
        function BubbleSub(THREE, KIT, detail, opts) {
          opts = opts || {};
          const KK = root.WhaleKartKit, { rbox } = KK;
          const SEATY = KK.SEAT[1], YW = SEATY + S.water;     // the waterline in kart coordinates
          const WHEELS = [[0.6, 0.64, 0.16, 0.15], [-0.6, 0.64, 0.16, 0.15], [0.63, -0.56, 0.2, 0.2], [-0.63, -0.56, 0.2, 0.2]];
          const hullF = (x, y, z) => {
            const s = 1 - 0.48 * sstep(-0.55, -1.08, z) - 0.1 * sstep(0.5, 1.0, z);
            return rbox(x / s, 0.3 + (y - 0.3) / s, z, [0, 0.3, -0.05], [0.4, 0.21, 0.99], 0.2) * s;
          };
          const cock = (x, y, z) => smax(ell2(x, z - TUB.zc, TUB.rx - 0.02, TUB.rz - 0.02), 0.235 - y, 0.02);
          const design = {
            name: 'bubble-sub', insideEdge: [0.03, 0.0], bodyScale: 1.3, bodyScaleLo: 0.9, farSeg: [10, 8], farSquash: 0.4, wheelSeg: { desktop: 16, phone: 11, mid: 6 }, gloss: detail === 'mid' || detail === 'far' ? 0.6 : 0.26, paintAO: detail === 'far' ? 0.25 : detail === 'mid' ? 0.6 : 1, whitewall: false, rimRing: true, strip: [0.008, 0.016], coaming: false, seatBack: false, cock,
            box: [-0.45, 0.04, -1.1, 0.45, 0.56, 1.0], farC: [0, 0.3, -0.05], wheels: WHEELS, bodyF: hullF,
            seamY: () => (detail === 'mid' ? 0.31 : 0.3),   // coarse LODs: keep the teal from washing into the yellow
            palette: {
              top: '#FFC23A', topDk: '#EBA21E', low: '#1E6F8E', lowDk: '#145067', inside: '#0B4F78',
              chrome: '#E0B458', chromeDk: '#8F6E31', lamp: '#FFF4CC', tail: '#FF5A4A', coaming: '#8F6E31',
              seat: '#1E6F8E', seatHi: '#2E8BAD', tyre: '#1D1F24', wall: '#1D1F24', hub: '#1E6F8E', cap: '#E0B458',
              rim: '#FFC23A', hubS: '#1E6F8E', port: '#0F2E4A', portHi: '#3E7FB0', fin: '#1E6F8E', foam: '#F2FBFF', red: '#FF4B4B', green: '#36E08A',
            },
            glassMat: glassMaterial,
            cockpit: TUB,
            far(c) {
              const { THREE: T, U: u, C, K, body, M4: m4, V } = c;
              const ring = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; ring.push([TUB.rx * tubR(TUB.y1) * sin(a), TUB.y1, TUB.zc + TUB.rz * tubR(TUB.y1) * cos(a)]); }
              u.addGeo(T, body, u.taperTube(T, ring, ring.map(() => 0.025), ring.map(() => 0.025), 3, [0, 1, 0], false, true), m4(), C.chrome, K.chrome, 0);
              u.addGeo(T, body, new T.BoxGeometry(0.03, 0.2, 0.18), m4().compose(V([0, 0.5, -0.9]), new T.Quaternion().setFromEuler(new T.Euler(0.3, 0, 0)), V([1, 1, 1])), C.fin, K.paint, 0);
              u.addGeo(T, body, new T.CylinderGeometry(0.14, 0.14, 0.02, 8).rotateX(PI / 2), m4().makeTranslation(0, 0.3, -1.08), C.chrome, K.chrome, 0);
            },
            details(c) {
              const { THREE: T, U: u, C, K, LV, body, M4: m4, V, done, onBody, rboxG } = c;
              const hi = LV.loop > 40;
              // brass rim on the tub lip, and a brass collar where the glass meets the hull
              const nR = hi ? 36 : LV.detail ? 24 : 12, rim = [], base = [], tb = hi ? 5 : LV.tube;
              for (let i = 0; i < nR; i++) {
                const a = (i / nR) * PI * 2, sa = sin(a), ca = cos(a);
                rim.push([TUB.rx * tubR(TUB.y1) * sa, TUB.y1, TUB.zc + TUB.rz * tubR(TUB.y1) * ca]);
                let y = TUB.y1; while (y > 0.25) { const r = tubR(y); if (hullF(TUB.rx * r * sa, y, TUB.zc + TUB.rz * r * ca) < 0) break; y -= 0.004; }
                const r = tubR(y); base.push([TUB.rx * r * sa, y + 0.008, TUB.zc + TUB.rz * r * ca]);
              }
              u.addGeo(T, body, u.taperTube(T, rim, rim.map(() => 0.022), rim.map(() => 0.019), tb, [0, 1, 0], false, true), m4(), C.chrome, K.chrome, 0);
              if (LV.detail) u.addGeo(T, body, u.taperTube(T, base, base.map(() => 0.026), base.map(() => 0.022), tb, [0, 1, 0], false, true), m4(), C.chrome, K.chrome, 0);
              done('tub');
              // foam where the water meets the whale (the whale's body at the waterline)
              if (LV.detail) {
                const F = whaleSDF(EX.neutral), seat = KK.SEAT, nF = hi ? 40 : 24, fm = [];
                for (let i = 0; i < nF; i++) {
                  const a = (i / nF) * PI * 2, d = [sin(a), 0, cos(a)];
                  let t = 0.02; while (t < 0.5 && F.bodyAll(d[0] * t, S.water, -0.03 + d[2] * t) < 0) t += 0.004;
                  fm.push([d[0] * (t + 0.004), YW + 0.004, seat[2] - 0.03 + d[2] * (t + 0.004)]);
                }
                u.addGeo(T, body, u.taperTube(T, fm, fm.map(() => 0.018), fm.map(() => 0.008), max(4, LV.tube - 1), [0, 1, 0], false, true), m4(), (x, y, z, nx, ny) => mix3(C.foam, C.portHi, sstep(0.2, -0.8, ny) * 0.4), [0.2, 0, 0, 1], 0);
                done('foam');
              }
              // portholes: brass ring + dark glass dome, two a side
              for (const s of [1, -1]) for (const zz of (LV.detail ? [0.24, -0.12] : [])) {
                const ph = onBody([s * 0.4, 0.33, zz], 0.0), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), V(ph.n));
                u.addGeo(T, body, new T.TorusGeometry(0.058, 0.014, max(3, LV.tube - 2), hi ? LV.wheel[0] : 10), m4().compose(V(u.v3.add(ph.p, ph.n, 0.004)), q, V([1, 1, 1])), C.chrome, K.chrome, 0);
                u.addGeo(T, body, new T.SphereGeometry(0.056, hi ? LV.wheel[0] : 10, 3, 0, PI * 2, 0, PI * 0.3).rotateX(PI / 2), m4().compose(V(u.v3.add(ph.p, ph.n, -0.03)), q, V([1, 1, 1])), (x, y, z, nx, ny) => mix3(C.port, C.portHi, sstep(0.0, 0.9, ny) * 0.8), [0.05, 0, 0, 1], 0);
                if (false) for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2, off = new T.Vector3(cos(a) * 0.058, sin(a) * 0.058, 0.016).applyQuaternion(q); u.addGeo(T, body, new T.SphereGeometry(0.008, 5, 3), m4().makeTranslation(ph.p[0] + off.x, ph.p[1] + off.y, ph.p[2] + off.z), C.chromeDk, K.chrome, 0); }
              }
              // the nose searchlight + port/starboard lamps
              {
                const hl = onBody([0, 0.33, 1.0], 0.0), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), V(hl.n));
                u.addGeo(T, body, new T.TorusGeometry(0.078, 0.017, max(3, LV.tube - 2), LV.wheel[0]), m4().compose(V(hl.p), q, V([1, 1, 1])), C.chrome, K.chrome, 0);
                u.addGeo(T, body, new T.SphereGeometry(0.075, LV.wheel[0], 4, 0, PI * 2, 0, PI * 0.35).rotateX(PI / 2), m4().compose(V(u.v3.add(hl.p, hl.n, -0.04)), q, V([1, 1, 1])), C.lamp, K.glow, 0);
                if (LV.detail) for (const s of [1, -1]) { const nl = onBody([s * 0.33, 0.43, 0.78], 0.0); u.addGeo(T, body, new T.SphereGeometry(0.024, LV.detail ? 10 : 6, LV.detail ? 6 : 3), m4().makeTranslation(...u.v3.add(nl.p, nl.n, 0.008)), s > 0 ? C.green : C.red, K.glow, 0); }
              }
              // axle stubs out to the wheels
              for (const [wx, wz, R] of WHEELS) {
                const sd = Math.sign(wx), a0 = onBody([sd * 0.35, R, wz], 0.0).p;
                u.addGeo(T, body, u.taperTube(T, [u.v3.add(a0, [-sd * 0.03, 0, 0]), [wx - sd * 0.06, R, wz]], [0.026, 0.02], [0.026, 0.02], LV.tube, [0, 1, 0], false), m4(), C.chromeDk, K.chrome, 0);
              }
              // periscope (front right), rudder fin + tail planes
              {
                const PX = -0.24, PZ = -0.8, b0 = onBody([PX, 0.5, PZ], 0.0).p, top = [PX, 0.84, PZ];
                u.addGeo(T, body, u.taperTube(T, [u.v3.add(b0, [0, -0.02, 0]), top], [0.022, 0.02], [0.022, 0.02], LV.tube + 2, [1, 0, 0], false), m4(), C.chromeDk, K.chrome, 0);
                u.addGeo(T, body, u.taperTube(T, [[PX, b0[1] - 0.01, PZ], [PX, b0[1] + 0.035, PZ]], [0.036, 0.034], [0.036, 0.034], LV.tube + 2, [1, 0, 0], true), m4(), C.chrome, K.chrome, 0);
                u.addGeo(T, body, rboxG(0.07, 0.07, 0.13, 0.02), m4().makeTranslation(PX, 0.87, PZ + 0.03), C.low, K.paint, 0);
                u.addGeo(T, body, new T.CircleGeometry(0.026, LV.tube + 4), m4().makeTranslation(PX, 0.87, PZ + 0.096), C.port, [0.05, 0, 0, 1], 0);
                const rq = new T.Quaternion().setFromEuler(new T.Euler(0.42, 0, 0));
                u.addGeo(T, body, rboxG(0.032, 0.24, 0.2, 0.014), m4().compose(V([0, 0.5, -0.9]), rq, V([1, 1, 1])), (x, y) => (y > 0.07 ? C.top : C.fin), K.paint, 0);
                for (const s of [1, -1]) u.addGeo(T, body, rboxG(0.2, 0.028, 0.14, 0.012), m4().compose(V([s * 0.22, 0.3, -0.92]), new T.Quaternion().setFromEuler(new T.Euler(0, s * -0.25, 0)), V([1, 1, 1])), (x) => (abs(x) > 0.07 ? C.top : C.fin), K.paint, 0);
              }
              // a rivet line just above the seam
              if (hi) {
                const rv = new T.SphereGeometry(0.008, 5, 3);
                for (let i = 0; i < 16; i++) {
                  const a = (i / 16) * PI * 2; let tt = 1.4; const dir = [sin(a), 0, cos(a)];
                  while (tt > 0 && hullF(dir[0] * tt, 0.335, dir[2] * tt) > 0) tt -= 0.004;
                  if (cock(dir[0] * tt, 0.5, dir[2] * tt) < 0.05) continue;
                  const q2 = onBody([dir[0] * tt, 0.335, dir[2] * tt], 0.003);
                  u.addGeo(T, body, rv, m4().makeTranslation(...q2.p), C.chrome, K.chrome, 0);
                }
              }
              done('details');
            },
            // ONE transparent mesh: the water surface first, then the glass wall (water-tinted below the waterline)
            glass(c) {
              const LV = c.LV, seg = LV.far ? 10 : LV.loop > 40 ? 40 : LV.detail ? 24 : 14;
              const A = { P: [], N: [], C: [], I: [] }; let n = 0;
              const vtx = (p, nn, col) => { A.P.push(...p); A.N.push(...nn); A.C.push(...col); return n++; };
              // water surface (ellipse, two rings + centre) at the waterline
              const wc = vtx([0, YW, TUB.zc], [0, 1, 0], [0.42, 0.78, 0.92, 0.5]);
              const rings = LV.far ? [0.97] : [0.6, 0.97], ws = [];
              for (const k of rings) { const ring = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * PI * 2, r = tubR(YW) * k; ring.push(vtx([TUB.rx * r * sin(a), YW, TUB.zc + TUB.rz * r * cos(a)], [0, 1, 0], k > 0.9 ? [0.72, 0.92, 1.0, 0.72] : [0.5, 0.82, 0.95, 0.55])); } ws.push(ring); }
              for (let i = 0; i < seg; i++) A.I.push(wc, ws[0][i], ws[0][(i + 1) % seg]);
              for (let r = 0; r < ws.length - 1; r++) for (let i = 0; i < seg; i++) { const a = ws[r][i], b = ws[r][(i + 1) % seg], d = ws[r + 1][i], e = ws[r + 1][(i + 1) % seg]; A.I.push(a, d, b, b, d, e); }
              // the wall
              const H = !LV.detail ? [[TUB.y0, 'w'], [YW, 'm'], [TUB.y1, 'g']]
                : [[TUB.y0, 'w'], [YW - 0.03, 'w'], [YW - 0.004, 'w'], [YW, 'm'], [YW + 0.006, 'g'], [lerp(YW, TUB.y1, 0.5), 'g'], [TUB.y1 - 0.02, 'r'], [TUB.y1, 'r']];
              const colOf = { w: [0.2, 0.62, 0.86, 0.55], m: [0.88, 0.97, 1.0, 0.8], g: [0.86, 0.93, 1.0, 0.1], r: [0.9, 0.96, 1.0, 0.22] };
              const rows = [];
              for (const [y, k] of H) {
                const r = tubR(y), dr = TUB.bulge * PI / (TUB.y1 - TUB.y0) * cos(PI * sat((y - TUB.y0) / (TUB.y1 - TUB.y0))), row = [];
                for (let i = 0; i < seg; i++) {
                  const a = (i / seg) * PI * 2, sa = sin(a), ca = cos(a);
                  const nx = sa / TUB.rx, nz = ca / TUB.rz, l = hypot(nx, nz), nn = v3.norm([nx / l, -dr * 0.35, nz / l]);
                  row.push(vtx([TUB.rx * r * sa, y, TUB.zc + TUB.rz * r * ca], nn, colOf[k]));
                }
                rows.push(row);
              }
              for (let r = 0; r < rows.length - 1; r++) for (let i = 0; i < seg; i++) { const a = rows[r][i], b = rows[r][(i + 1) % seg], d = rows[r + 1][i], e = rows[r + 1][(i + 1) % seg]; A.I.push(a, b, d, b, e, d); }
              return A;
            },
            // the propeller: its own mesh so it spins (brass blades, teal hub)
            extra(c, group, toMesh) {
              const { THREE: T, U: u, C, K, LV, M4: m4, V } = c;
              if (LV.far) return null;
              const pa = new u.Acc(), nb = 3, bl = new T.SphereGeometry(1, LV.detail ? 10 : 6, LV.detail ? 6 : 3);
              for (let i = 0; i < nb; i++) {
                const a = (i / nb) * PI * 2, q = new T.Quaternion().setFromEuler(new T.Euler(0, 0, a)).multiply(new T.Quaternion().setFromEuler(new T.Euler(0, 0.55, 0)));
                u.addGeo(T, pa, bl, m4().compose(new T.Vector3(cos(a + PI / 2) * 0.075, sin(a + PI / 2) * 0.075, 0), new T.Quaternion().setFromEuler(new T.Euler(0, 0, a)).multiply(new T.Quaternion().setFromEuler(new T.Euler(0.5, 0, 0))), V([0.04, 0.078, 0.008])), C.chrome, K.chrome, 0);
                void q;
              }
              u.addGeo(T, pa, new T.ConeGeometry(0.038, 0.09, LV.detail ? 12 : 6).rotateX(-PI / 2), m4().makeTranslation(0, 0, -0.035), C.low, K.paint, 0);
              u.addGeo(T, pa, new T.CylinderGeometry(0.03, 0.036, 0.05, LV.detail ? 12 : 6).rotateX(PI / 2), m4().makeTranslation(0, 0, 0.02), C.chromeDk, K.chrome, 0);
              const piv = new T.Group(); piv.position.set(0, 0.3, -1.075);
              const m = toMesh(pa, 'kart-prop'); piv.add(m); group.add(piv);
              return { prop: m };
            },
            animate(dt, o, extra) { if (extra && extra.prop) extra.prop.rotation.z += (2 + (o.speed || 0) * 2.2) * dt; },
          };
          return KK.make(design, THREE, KIT, detail, opts);
        }

        const api = WhaleFinal;
        api.BubbleSub = BubbleSub; api.glassMaterial = glassMaterial; api.EXPR = EX; api.NAMES = NAMES; api.LEVELS = LEVELS; api.SHAPE = S;
        root.WhaleFinal = api; root.BubbleSub = BubbleSub;
      })(KR);

      /* Meme Kart: MOON CAT + CRATER HOPPER (roster rival, scratch, 6 Oct 2026). An ORIGINAL cat astronaut, built in code.
       *
       *   MoonCat.cat (THREE, K, detail, opts) -> THREE.Group      (budgets 14-16k / 7-8k / 2.5-3k / 0.6-0.7k triangles)
       *   MoonCat.kart(THREE, K, detail, opts) -> THREE.Group      (CRATER HOPPER, budgets 12k / 6k / 2k / 0.5k; needs kart-kit.js)
       *     K      = the endo marching-cubes kit (endo-kit.js, a verbatim copy of dogs/final/endo-kit.js)
       *     detail = 'desktop' | 'phone' | 'mid' | 'far'
       *     opts   = { toon: <shared gm-kart-toon>, eyeMat: <gm-kart-eye-cat>, glassMat: <gm-kart-glass> }
       *
       * Design: a lilac "space tabby" (three forehead stripes, ringed tail) with a cream muzzle, big turquoise slit-pupil eyes
       * and pink ear bowls, in a white suit with gold trims, moon boots and blue-grey gloves, inside a ROUND GLASS BUBBLE
       * helmet on a gold collar ring. The bubble is the 48 px read (no other racer is a perfect circle); the head turns with
       * it. Not Nyan / Grumpy / Pop cat / Luna: no pop-tart, no frown, no O-mouth, no black fur, no forehead crescent.
       *
       * Construction = the stars' recipe: SDF -> marching cubes, every vertex pulled onto the exact surface with the analytic
       * normal; each colour region its own MC mesh (fur head, ears, cream muzzle, white suit, gloves, boots) so paint lines are
       * geometric intersections; trims are clean tori; eyes are separate spheres (iris, SLIT pupil, 2 catchlights, gaze in
       * the shader); lids/arcs are shells on bones; 4 expressions = morph targets (head re-projected onto the expression SDF
       * + the face parts rebuilt at fixed topology): focus, starry, hit (hiss with fangs), celebrate (blep + happy arcs).
       *
       * Helpers + gm-kart-toon below are VERBATIM copies of dogs/final/dog.js (the roster shares one program key). New
       * programs: gm-kart-eye-cat (slit pupils) and gm-kart-glass (premultiplied fresnel glass, the helmet only).
       * Draw calls: 3 (toon SkinnedMesh, eyes, helmet glass). 'far' = 2 (toon Mesh + glass).
       * group.userData.racer = { set, setExpression, setGaze, look, blink, squash, kick, steer, update, names, bones, mesh, stats }
       * Units metres, +Z forward, +Y up, origin = the seat contact under the pelvis. Hands at ten-and-two on WHEEL.
       * The glass must not cast shadows (it would black out the face): racer.glass.castShadow = false (userData.noShadow).
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, exp, atan2 } = Math;
        const DU = root.DogFinal.util;
        const { sat, clamp, lerp, sstep, smin, smax, ell, E6, cap, v3, mix3, mul3, grad, Acc, compactTail, mcPart, addGeo, taperTube, rayHit, faceAt, onSurface, gridDecal } = DU;
        const ell2 = (x, y, a, b) => { const X = x / a, Y = y / b, k0 = sqrt(X * X + Y * Y), k1 = sqrt(X * X / (a * a) + Y * Y / (b * b)) + 1e-9; return k0 * (k0 - 1) / k1; };

        /* ------------------------------------------------------------------ the steering wheel (kart builds its wheel here) */
        const WHEEL = { c: [0, 0.335, 0.43], r: 0.135, tilt: 0.5, grip: 0.5 };
        const WH = (() => {
          const W = WHEEL, up = [0, cos(W.tilt), sin(W.tilt)], nrm = [0, -sin(W.tilt), cos(W.tilt)];
          const a = W.grip, rad = v3.norm(v3.add([cos(a), 0, 0], up, sin(a)));
          return { up, nrm, rad, H: v3.add(W.c, rad, W.r) };
        })();

        // (the toon, the accumulator, the marching-cubes part, the tubes and the face helpers: the dogs', above)
        const toonMaterial = (THREE, o) => root.mat.toon(THREE, o);

        /* ================================================================== MOON CAT (new code from here) */
        // orientation guard: an MC part whose kept shell is open can come out inside-out (the signed-volume test in
        // polygonize sees an open surface); flip the part's triangles when they disagree with the analytic normals
        function orientPart(acc, r) {
          const P = acc.P, N = acc.N, I = acc.I; let dot = 0;
          for (let t = r.t0; t < r.t1; t += 3) {
            const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
            dot += (uy * wz - uz * wy) * (N[a] + N[b] + N[c]) + (uz * wx - ux * wz) * (N[a + 1] + N[b + 1] + N[c + 1]) + (ux * wy - uy * wx) * (N[a + 2] + N[b + 2] + N[c + 2]);
          }
          if (dot < 0) for (let t = r.t0; t < r.t1; t += 3) { const q = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = q; }
          return r;
        }
        const mcPartO = (...a) => orientPart(a[1], mcPart(...a));
        const D2R = PI / 180;
        // value noise in [-1, 1] (the kart's crinkled gold foil)
        const hash3 = (i, j, k) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
        function vnoise(x, y, z) {
          const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
          let fx = x - i, fy = y - j, fz = z - k; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
          const a = lerp(hash3(i, j, k), hash3(i + 1, j, k), fx), b = lerp(hash3(i, j + 1, k), hash3(i + 1, j + 1, k), fx);
          const c = lerp(hash3(i, j, k + 1), hash3(i + 1, j, k + 1), fx), d = lerp(hash3(i, j + 1, k + 1), hash3(i + 1, j + 1, k + 1), fx);
          return lerp(lerp(a, b, fy), lerp(c, d, fy), fz) * 2 - 1;
        }

        /* ------------------------------------------------------------------ shape parameters */
        const CAT = {
          name: 'mooncat',
          cran: [0, 0.728, -0.012, 0.262, 0.248, 0.236],
          cheek: [0.128, 0.622, 0.03, 0.162, 0.122, 0.148], cheekK: 0.075,
          brow: [0.092, 0.79, 0.098, 0.098, 0.062, 0.1], browK: 0.04,
          // cheek fluff: rounded lobes swept down and back (the cartoon-cat jowl), never cones
          tufts: [[0.252, 0.585, -0.02, 0.062, 0.048, 0.06], [0.232, 0.538, 0.02, 0.05, 0.04, 0.05]],
          pad: [0.032, 0.598, 0.196, 0.04, 0.032, 0.038], chin: [0, 0.558, 0.174, 0.036, 0.027, 0.036],
          nose: { y: 0.632, r: [0.027, 0.018, 0.016] },
          eye: { x: 0.11, y: 0.706, r: 0.073, prot: 0.032, fwd: 0.52, tilt: -0.07 },
          ear: { b: [0.15, 0.868, -0.03], t: [0.22, 1.056, -0.058], rb: 0.1, rt: 0.02, th: 0.042, face: [0.42, 0.06, 1], k: 0.04 },
          neck: [0, 0.47, -0.03],
          helmet: { c: [0, 0.775, -0.01], r: 0.4, cut: 0.44 },
          // body = the dogs' seated base (hands at ten-and-two on WHEEL), suited up a size
          torso: [0, 0.245, -0.05, 0.205, 0.255, 0.172], belly: [0, 0.165, 0.02, 0.195, 0.168, 0.172],
          S: [0.168, 0.395, -0.035], El: [0.262, 0.285, 0.128], armR: [0.078, 0.07, 0.064], paw: [0.062, 0.054, 0.066],
          Hp: [0.1, 0.085, 0.02], K: [0.137, 0.17, 0.225], F: [0.137, 0.065, 0.355], foot: [0.076, 0.062, 0.104],
          tail: { pts: [[0.1, 0.15, -0.15], [0.21, 0.13, -0.2], [0.3, 0.18, -0.26], [0.33, 0.3, -0.31], [0.31, 0.42, -0.31], [0.255, 0.48, -0.28], [0.215, 0.445, -0.25]], r0: 0.04, r1: 0.03, fluff: 0.007 },
        };

        /* ------------------------------------------------------------------ expressions
         * The mouth is the cat ":3": a short philtrum from the nose and a "w" line under the whisker pads, which can open
         * into a painted mouth (fangs and a tongue patch inside) or let a 3D tongue tip out (the blep). Fixed topology. */
        const CX = (o) => Object.assign({ y: 0.574, w: 0.054, h: 0.013, curl: 0.005, smirk: 0, open: 0, openW: 0.62, fang: 0, tongue: 0, tongueIn: 0 }, o);
        const EXPR = {
          neutral:   { mouth: CX({}), cheek: 0, blush: 0, gaze: [0, 0.02], lidU: 0.95, lidLo: -0.8, happy: 0, pupil: 0.36, slit: 0.42, iris: 0.8, spark: 0, roll: 0, ear: 0 },
          focus:     { mouth: CX({ h: 0.009, smirk: 0.011, curl: 0.002 }), cheek: 0.25, blush: 0, gaze: [0, 0], lidU: 0.46, lidLo: -0.2, happy: 0, pupil: 0.42, slit: 0.13, iris: 0.8, spark: 0, roll: -3 * D2R, ear: 0.3 },
          starry:    { mouth: CX({ open: 0.02, openW: 0.42, h: 0.012, tongueIn: 0.7 }), cheek: 0.7, blush: 1, gaze: [0, 0.16], lidU: 1.05, lidLo: -0.88, happy: 0, pupil: 0.6, slit: 1, iris: 0.82, spark: 1, roll: 7 * D2R, ear: 0.35 },
          hit:       { mouth: CX({ w: 0.06, h: 0.004, curl: 0.013, open: 0.05, openW: 0.84, fang: 1, tongueIn: 1 }), cheek: 0.5, blush: 0, gaze: [0, 0.02], lidU: 1.15, lidLo: -0.98, happy: 0, pupil: 0.12, slit: 1, iris: 0.7, spark: 0, roll: -8 * D2R, ear: -0.9 },
          celebrate: { mouth: CX({ open: 0.006, openW: 0.3, tongue: 1 }), cheek: 1, blush: 1, gaze: [0, 0], lidU: 0.6, lidLo: -0.5, happy: 1, pupil: 0.36, slit: 0.42, iris: 0.8, spark: 0, roll: 10 * D2R, ear: 0.15 },
        };
        const NAMES = ['focus', 'starry', 'hit', 'celebrate'];

        /* ------------------------------------------------------------------ the SDF of the cat (with an expression) */
        function catSDF(S, lod, E) {
          E = E || {};
          const ER = S.ear, EB = ER.b, ET = ER.t, EL = hypot(ET[0] - EB[0], ET[1] - EB[1], ET[2] - EB[2]);
          const ea = v3.norm(v3.sub(ET, EB)); let eu = v3.norm(ER.face); eu = v3.norm(v3.sub(eu, v3.scale(ea, v3.dot(eu, ea)))); const ew = v3.cross(ea, eu);
          const eL = [0, 0, 0];
          const earLocal = (ax, y, z, o) => { const q0 = ax - EB[0], q1 = y - EB[1], q2 = z - EB[2]; o[0] = q0 * ew[0] + q1 * ew[1] + q2 * ew[2]; o[1] = q0 * ea[0] + q1 * ea[1] + q2 * ea[2]; o[2] = q0 * eu[0] + q1 * eu[1] + q2 * eu[2]; return o; };
          // a cat ear: a wide-based round cone to a sharp tip, flattened and cupped; returns [outer, innerBowl, depth, t]
          const earParts = (ax, y, z) => {
            earLocal(ax, y, z, eL); const s = eL[0], t = eL[1], d = eL[2] + 0.024 * (t / EL) * (t / EL) * EL;
            const o2 = cap(s, t, 0, [0, 0, 0], [0, EL, 0], ER.rb, ER.rt);
            const th = ER.th * (1 - 0.5 * sat(t / EL));
            const outer = smax(o2, abs(d) - th, 0.014);
            const in2 = cap(s * 1.04, t, 0, [0, 0.14 * EL, 0], [0, 0.8 * EL, 0], ER.rb * 0.62, ER.rt * 0.45);
            const bowl = max(in2, -(d - th * 0.2));
            return [smax(outer, -bowl, 0.012), in2, d, t];
          };
          const cheekE = S.cheek.slice(), pf = E.cheek || 0;
          cheekE[1] += 0.01 * pf; cheekE[2] += 0.006 * pf; cheekE[3] *= 1 + 0.05 * pf; cheekE[4] *= 1 + 0.05 * pf;
          const tuftF = (ax, y, z) => { let d = 1; for (const l of S.tufts) d = smin(d, ell(ax - l[0], y - l[1], z - l[2], l[3], l[4], l[5]), 0.02); return d; };
          const headCore = (x, y, z) => {
            const ax = abs(x);
            let d = E6(x, y, z, S.cran);
            d = smin(d, E6(ax, y, z, cheekE), S.cheekK);
            d = smin(d, E6(ax, y, z, S.brow), S.browK);
            return smin(d, tuftF(ax, y, z), 0.035);
          };
          const muzF = (x, y, z) => smin(E6(abs(x), y, z, S.pad), E6(x, y, z, S.chin), 0.022);
          const faceF = (x, y, z) => smin(headCore(x, y, z), muzF(x, y, z), 0.008);
          const headF = (x, y, z) => { let d = headCore(x, y, z); if (y > 0.79) d = smin(d, earParts(abs(x), y, z)[0], ER.k); return d; };
          const H = WH.H, Wr = v3.add(H, v3.norm(v3.sub(S.El, H)), 0.06), pawC = v3.add(H, WH.nrm, -0.012);
          const Wc = v3.lerp(S.El, Wr, 0.62), Gc = v3.lerp(S.El, Wr, 0.5);       // suit sleeve end, glove gauntlet start
          const Ak = v3.lerp(S.K, S.F, 0.6), Bc = v3.lerp(S.K, S.F, 0.46);       // suit trouser end, boot top
          const torsoF = (x, y, z) => smin(E6(x, y, z, S.torso), E6(x, y, z, S.belly), 0.06);
          const armF = (ax, y, z) => smin(cap(ax, y, z, S.S, S.El, S.armR[0], S.armR[1]), cap(ax, y, z, S.El, Wc, S.armR[1], S.armR[2]), 0.035);
          const legF = (ax, y, z) => smin(cap(ax, y, z, S.Hp, S.K, 0.096, 0.084), cap(ax, y, z, S.K, Ak, 0.084, 0.076), 0.035);
          const gloveF = (ax, y, z) => smin(cap(ax, y, z, Gc, Wr, 0.074, 0.058), ell(ax - pawC[0], y - pawC[1], z - pawC[2], S.paw[0], S.paw[1], S.paw[2]), 0.03);
          const bootF = (ax, y, z) => smin(cap(ax, y, z, Bc, S.F, 0.092, 0.084), ell(ax - S.F[0], y - S.F[1] + 0.004, z - S.F[2] - 0.042, S.foot[0], S.foot[1], S.foot[2]), 0.04);
          const suitF = (x, y, z) => { const ax = abs(x); return smin(smin(torsoF(x, y, z), armF(ax, y, z), 0.05), legF(ax, y, z), 0.045); };
          return { headF, headCore, muzF, faceF, earParts, tuftF, suitF, torsoF, armF, legF, gloveF, bootF, pawC, Wr, Wc, Gc, Ak, Bc, ea, eu, ew, EL };
        }

        /* ------------------------------------------------------------------ palette (linear) */
        function palette(THREE) {
          const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
          return {
            fur: c('#A592DC'), furDk: c('#8775C6'), furHi: c('#C4B8EE'), stripe: c('#6E5AAE'), cream: c('#FFF3E6'), creamDk: c('#EAD8CC'),
            inner: c('#F5A2B8'), nose: c('#EE7598'), line: c('#35264C'), lidLine: c('#2E2244'),
            mouth: c('#4A1730'), mouthHi: c('#7A2A45'), tongue: c('#F27C98'), tongueDk: c('#CC5878'), fang: c('#FFFDF8'), blush: c('#F79AB8'), whisker: c('#FBF8FF'),
            suit: c('#F1F2F5'), suitDk: c('#C5CAD8'), rib: c('#D6DAE4'), glove: c('#AEB8D2'), gloveDk: c('#8792B2'), boot: c('#E2E5EC'), sole: c('#4A4E5E'),
            gold: c('#E9B84A'), goldDk: c('#A8772A'), panel: c('#454A62'), red: c('#FF4D5E'), teal: c('#3FD9CC'), amber: c('#FFC93C'), patch: c('#26326A'),
          };
        }

        /* ------------------------------------------------------------------ the cat's eye (KR.mat.eye 'cat': a slit pupil) and the helmet (KR.mat.glass) */
        const eyeMaterial = (THREE) => root.mat.eye(THREE, 'cat');
        const glassMaterial = (THREE, o) => root.mat.glass(THREE, o);

        /* ------------------------------------------------------------------ LOD table */
        const LEVELS = {
          desktop: { ear: 0.021, head: 0.028, muz: 0.011, body: 0.04, acc: 0.019, eye: [20, 11], lid: [16, 6], rim: [4, 22], ring: [4, 16], tube: 6, extras: true, ribs: true, patch: true, tail: [20, 8], seg: 1, morph: true, helm: [32, 18], whisk: 3 },
          phone:   { ear: 0.029, head: 0.04, muz: 0.017, body: 0.058, acc: 0.028, eye: [14, 8], lid: [11, 4], rim: [3, 14], ring: [3, 12], tube: 4, extras: true, ribs: false, patch: false, tail: [12, 6], seg: 0.7, morph: true, helm: [24, 13], whisk: 2 },
          mid:     { ear: 0.055, head: 0.072, muz: 0.032, body: 0.1, acc: 0.05, eye: [10, 5], lid: [7, 3], rim: [3, 8], ring: [3, 8], tube: 4, extras: false, ribs: false, patch: false, tail: [7, 4], seg: 0.4, morph: true, helm: [14, 8], whisk: 0 },
          far:     { far: true },
        };

        /* ------------------------------------------------------------------ bones */
        const BONES = ['root', 'body', 'head', 'earL', 'earR', 'lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'tail0', 'tail1', 'tail2'];
        const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
        const PARENT = { body: 'root', head: 'body', earL: 'head', earR: 'head', lidL: 'head', lidR: 'head', lowL: 'head', lowR: 'head', arcL: 'head', arcR: 'head', tail0: 'body', tail1: 'tail0', tail2: 'tail1' };

        /* ------------------------------------------------------------------ build the cat */
        function build(THREE, KIT, detail, opts) {
          opts = opts || {};
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const S = CAT, LV = LEVELS[detail] || LEVELS.desktop, C = palette(THREE);
          const toon = opts.toon || toonMaterial(THREE, opts);
          const glassMat = opts.glassMat || glassMaterial(THREE);
          const E0 = EXPR.neutral, F = catSDF(S, LV, E0);
          if (LV.far) return buildFar(THREE, S, F, C, toon, glassMat, T0, now);
          const stats = { parts: {} };
          const acc = new Acc();
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const qFrom = (dir) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(v3.norm(dir)));
          const tpart = (name, t0) => { stats.parts[name] = (stats.parts[name] || 0) + (acc.I.length - t0) / 3; };
          const ALL = (x, y, z) => min(min(F.headF(x, y, z), F.muzF(x, y, z)), F.suitF(x, y, z));
          const aoAt = (x, y, z, nx, ny, nz, step) => {
            let occ = 0;
            for (let s = 1; s <= 4; s++) { const hs = s * step; occ += max(0, 1 - ALL(x + nx * hs, y + ny * hs, z + nz * hs) / hs) / s; }
            return sat(1 - 0.55 * max(0, occ - 0.12));
          };
          const aoStep = detail === 'mid' ? 0.03 : 0.018;
          const shade = (c, ao, lo) => { const k = lo + (1 - lo) * ao; return [c[0] * k, c[1] * k * (0.97 + 0.03 * k), c[2] * k * (0.92 + 0.08 * k)]; };
          const kFur = [0.6, 1, 3, 1], kSuit = [0.58, 0.25, 0, 1], kGold = [0.24, 0, 0, 1], kGlove = [0.66, 0.2, 0, 1];
          let t = now(), t0;

          /* ---- eye placement: on the surface, protruding, facing between forward and the surface normal */
          const g0 = [0, 0, 0];
          const eyeAt = (side) => {
            const p = rayHit(F.headCore, [side * S.eye.x, S.eye.y, 0.6], [0, 0, -1], 0, 0.8);
            grad(F.headCore, p[0], p[1], p[2], 0.002, g0);
            const dir = v3.norm(v3.lerp(g0, [side * 0.1, 0.02, 1], S.eye.fwd));
            return { c: v3.add(p, dir, -(S.eye.r - S.eye.prot)), dir };
          };
          const EYE = { L: eyeAt(1), R: eyeAt(-1) };
          const eyeQ = (side) => qFrom(side > 0 ? EYE.L.dir : EYE.R.dir);
          // the lid frame is rolled so each lid line lifts toward the outer corner (the almond cat eye)
          const lidQ = (side) => eyeQ(side).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * S.eye.tilt)));

          /* ---- head (fur) + ears */
          const headCol = (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const ax = abs(x);
            let earIn = 0;
            if (y > 0.8) {
              const ep = F.earParts(ax, y, z);
              if (ep[0] < 0.01) earIn = sstep(0.004, -0.012, ep[1]) * sstep(-S.ear.th * 0.45, S.ear.th * 0.1, ep[2]) * sstep(0.012, 0.0, ep[0]);
            }
            let c = mix3(C.fur, C.furDk, sstep(0.88, 1.0, y) * 0.25 + sstep(-0.1, -0.26, z) * 0.3);
            c = mix3(c, C.furHi, sstep(0.6, 0.5, y) * sstep(-0.06, 0.08, z) * 0.75);      // pale under the jaw
            c = mix3(c, C.furHi, sat(sstep(0.012, -0.004, F.tuftF(ax, y, z)) * 0.55));        // light tips on the cheek fluff
            if (earIn > 0) { c = mix3(c, C.inner, earIn * 0.92); acc.K[4 * v] = lerp(0.6, 0.8, earIn); }
            return shade(c, ao, 0.72);
          };
          t0 = acc.I.length;
          const headNoEar = F.headCore;
          const hd = mcPartO(KIT, acc, headNoEar, [-0.38, 0.42, -0.3, 0.38, 1.0, 0.3], LV.head, true, headCol, (x, y, z) => y < 0.79 || F.headF(x, y, z) > -0.0025, kFur, BI.head);
          tpart('head', t0); t0 = acc.I.length;
          const er = mcPartO(KIT, acc, F.headF, [-0.36, 0.77, -0.24, 0.36, 1.08, 0.12], LV.ear, true, headCol, (x, y, z) => headNoEar(x, y, z) > 0.0008, kFur, BI.head);
          tpart('ears', t0);
          for (let v = er.v0; v < er.v1; v++) {
            const x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2]; if (y < 0.8) continue;
            const ep = F.earParts(abs(x), y, z);
            if (ep[0] > headNoEar(x, y, z) - 0.002) continue;
            const w = sstep(0.04, 0.4, ep[3] / F.EL); if (w <= 0) continue;
            acc.B[3 * v] = BI.head; acc.B[3 * v + 1] = x > 0 ? BI.earL : BI.earR; acc.B[3 * v + 2] = w;
          }

          /* ---- the cream muzzle: its own finer mesh (crisp paint line where it meets the fur) */
          t0 = acc.I.length;
          mcPartO(KIT, acc, F.muzF, [-0.11, 0.5, 0.1, 0.11, 0.66, 0.3], LV.muz, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep * 0.7); acc.K[4 * v + 3] = ao;
            return shade(mix3(C.cream, C.creamDk, sstep(0.2, -0.7, ny) * 0.5), ao, 0.75);
          }, (x, y, z) => headNoEar(x, y, z) > -0.003, [0.62, 1, 3, 1], BI.head);
          tpart('muzzle', t0);

          /* ---- suit (white): torso, sleeves, trousers; drop what hides inside the head */
          t0 = acc.I.length;
          mcPartO(KIT, acc, F.suitF, [-0.4, -0.03, -0.27, 0.4, 0.52, 0.42], LV.body, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            return shade(mix3(C.suit, C.suitDk, sstep(0.1, -0.8, ny) * 0.35 + sstep(-0.05, -0.22, z) * 0.15), ao, 0.62);
          }, (x, y, z) => F.headF(x, y, z) > -0.01 && F.gloveF(abs(x), y, z) > -0.006 && F.bootF(abs(x), y, z) > -0.006, kSuit, BI.body);
          tpart('suit', t0); t0 = acc.I.length;
          // gloves (blue-grey gauntlets over the sleeve ends)
          mcPartO(KIT, acc, (x, y, z) => F.gloveF(abs(x), y, z), [-0.36, 0.22, 0.0, 0.36, 0.62, 0.62], LV.acc * 1.3, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep * 0.7); acc.K[4 * v + 3] = ao;
            return shade(mix3(C.glove, C.gloveDk, sstep(0.2, -0.7, ny) * 0.4), ao, 0.6);
          }, (x, y, z) => F.suitF(x, y, z) > -0.006, kGlove, BI.body);
          tpart('gloves', t0); t0 = acc.I.length;
          // moon boots (white, a dark tread sole band)
          mcPartO(KIT, acc, (x, y, z) => F.bootF(abs(x), y, z), [-0.3, -0.04, 0.08, 0.3, 0.26, 0.56], LV.acc * 1.45, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep * 0.7); acc.K[4 * v + 3] = ao;
            const sole = sstep(0.026, 0.016, y + 0.002 * sin(z * 140));
            return shade(mix3(mix3(C.boot, C.suitDk, sstep(0.2, -0.7, ny) * 0.3), C.sole, sole), ao, 0.6);
          }, (x, y, z) => F.suitF(x, y, z) > -0.006, kSuit, BI.body);
          tpart('boots', t0);
          stats.sdfMs = Math.round(now() - t); t = now();

          /* ---- nose: a small glossy rounded inverted triangle */
          t0 = acc.I.length;
          {
            const p = rayHit(F.faceF, [0, S.nose.y, 0.6], [0, 0, -1], 0, 0.8);
            const g = new THREE.SphereGeometry(1, LV.lid[0], LV.lid[1] + 2), pos = g.attributes.position;
            for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), w = 1 + 0.4 * min(0, y) - 0.05 * max(0, y); pos.setX(i, pos.getX(i) * w); pos.setZ(i, pos.getZ(i) * (1 - 0.2 * max(0, -y))); }
            g.computeVertexNormals();
            addGeo(THREE, acc, g, M4().compose(V(v3.add(p, [0, 0, -0.006])), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)), V(S.nose.r)),
              (x, y, z, nx, ny) => mix3(C.nose, mix3(C.nose, [1, 1, 1], 0.45), sstep(0.3, 0.95, ny) * 0.6), [0.25, 0, 0, 1], BI.head);
          }
          tpart('nose', t0);

          /* ---- the face: everything an expression changes (fixed topology; rebuilt per expression for the morphs) */
          const lineK = [0.5, 0, 0, 0.6], darkK = [0.7, 0, 4, 1];
          const nLine = max(10, Math.round(24 * LV.seg));
          const noseBot = S.nose.y - S.nose.r[1] * 0.9;
          function buildFace(A, E, FE) {
            const hf = FE.faceF, core = FE.headCore, M = E.mouth;
            const top = (s) => { const u = min(1, abs(s)); return [s * M.w, M.y - M.h * sin(PI * u) + M.curl * u * u * u + M.smirk * max(0, s) * u]; };
            const bot = (s) => { const q = sat(1 - (s / max(0.05, M.openW)) ** 2); const p = top(s); return [p[0], p[1] - M.open * Math.pow(q, 0.6) - 0.0004]; };
            const S1 = [], S2 = [];
            for (let i = 0; i <= nLine; i++) { const s = -1 + 2 * i / nLine; S1.push(top(s)); S2.push(bot(s)); }
            // the open mouth (painted, matte), collapsed onto the line when closed
            addGeo(THREE, A, gridDecal(THREE, hf, S2, S1, 3, 0.0018, 0.25), M4(), mix3(C.mouth, C.mouthHi, 0.3), darkK, BI.head);
            // the tongue patch inside the lower mouth
            const S3 = [], S4 = [];
            for (let i = 0; i <= nLine; i++) {
              const s = -1 + 2 * i / nLine, ts = s * 0.5 * M.openW, b = bot(ts), q = sat(1 - s * s);
              S4.push(b); S3.push([b[0], b[1] + 0.0008 + M.tongueIn * M.open * 0.5 * Math.pow(q, 0.7)]);
            }
            addGeo(THREE, A, gridDecal(THREE, hf, S4, S3, 2, (x, y, u) => 0.0026 + 0.002 * u * M.tongueIn, 0.25), M4(), mix3(C.tongue, C.tongueDk, 0.3), [0.4, 0.4, 0, 1], BI.head);
            // the "w" line and a thinner lower line that separates when the mouth opens
            const sp = onSurface(hf, S1, 0.0016), rr = sp.map((_, i) => 0.0064 * (0.45 + 0.55 * sin(PI * (0.06 + 0.88 * i / nLine))));
            addGeo(THREE, A, taperTube(THREE, sp, rr, rr, LV.tube, [0, 0, 1], true), M4(), C.line, lineK, BI.head);
            const sb = onSurface(hf, S2, 0.0012), rb = sb.map((_, i) => 0.0046 * (0.3 + 0.7 * sin(PI * (0.06 + 0.88 * i / nLine))));
            addGeo(THREE, A, taperTube(THREE, sb, rb, rb, max(4, LV.tube - 2), [0, 0, 1], true), M4(), C.line, lineK, BI.head);
            // the philtrum: nose to the middle of the "w"
            const ph = onSurface(hf, [[0, noseBot], [0, (noseBot + top(0)[1]) / 2], [0, top(0)[1] + 0.002]], 0.0014);
            addGeo(THREE, A, taperTube(THREE, ph, [0.0042, 0.0045, 0.0045], [0.0042, 0.0045, 0.0045], max(4, LV.tube - 2), [0, 0, 1], true), M4(), C.line, lineK, BI.head);
            // fangs: two small cones under the upper line (buried and tiny when closed)
            const fangG = new THREE.ConeGeometry(1, 1, max(5, LV.tube), 1).rotateX(PI).translate(0, -0.5, 0);
            for (const s of [-0.42, 0.42]) {
              const p = top(s), sf = M.fang, at = faceAt(hf, p[0], p[1] - 0.002, sf > 0.01 ? 0.003 : -0.006);
              addGeo(THREE, A, fangG, M4().compose(V(at), new THREE.Quaternion(), V([0.0075 * sf + 2e-4, 0.021 * sf + 2e-4, 0.0065 * sf + 2e-4])), (x, y, z, nx, ny) => mix3(C.fang, C.creamDk, sstep(0.3, -0.9, ny) * 0.3), [0.3, 0, 0, 1], BI.head);
            }
            // the blep: a rounded tongue tip out of the middle of the mouth
            {
              const tg = new THREE.SphereGeometry(1, LV.lid[0] - 2, max(5, LV.lid[1])), b = bot(0), tt = M.tongue;
              const at = faceAt(hf, 0, b[1] + 0.003, tt > 0.01 ? 0.004 : -0.012);
              addGeo(THREE, A, tg, M4().compose(V(v3.add(at, [0, -0.008 * tt, 0.004 * tt])), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, 0, 0)), V([0.019 * tt + 3e-4, 0.0085 * tt + 3e-4, 0.017 * tt + 3e-4])),
                (x, y, z, nx, ny) => mix3(C.tongueDk, C.tongue, sstep(-0.6, 0.6, ny) * 0.8 + 0.2), [0.32, 0.5, 0, 1], BI.head);
            }
            // blush ovals on the cheeks (collapsed when off)
            if (LV.extras) for (const side of [1, -1]) {
              const cx = side * 0.162, cy = 0.632, ring = [], ctr = [], nB = 10, bl = E.blush;
              for (let i = 0; i <= nB; i++) { const a = -(i / nB) * PI * 2; ring.push([cx + cos(a) * 0.04 * bl + 1e-4, cy + sin(a) * 0.022 * bl]); ctr.push([cx, cy]); }
              addGeo(THREE, A, gridDecal(THREE, core, ctr, ring, 1, 0.0028, 0.2), M4(), C.blush, [0.62, 0.6, 0, 1], BI.head);
            }
          }
          t0 = acc.I.length;
          const fc0 = acc.n;
          buildFace(acc, E0, F);
          const fc1 = acc.n;
          tpart('face', t0);

          /* ---- static face details: whiskers, forehead tabby stripes */
          t0 = acc.I.length;
          for (let i = 0; i < LV.whisk; i++) for (const side of [1, -1]) {
            const dy = [0.012, -0.002, -0.016][i] + (LV.whisk === 2 ? 0.004 : 0);
            const p = faceAt(F.muzF, side * 0.058, 0.6 + dy * 0.6, -0.003);
            const pts = [p, v3.add(p, [side * 0.06, dy * 0.8 + 0.006, -0.012]), v3.add(p, [side * 0.12, dy * 2.0 + 0.004, -0.035])];
            const r = [0.0026, 0.0019, 0.0009];
            addGeo(THREE, acc, taperTube(THREE, pts, r, r, LV.tube > 4 ? 4 : 3, [0, 1, 0], true), M4(), C.whisker, [0.4, 0, 0, 1], BI.head);
          }
          if (LV.extras) {
            for (const [x0, ya, yb, wd, sl] of [[0, 0.808, 0.965, 0.021, 0], [0.052, 0.81, 0.93, 0.017, 0.018], [-0.052, 0.81, 0.93, 0.017, -0.018]]) {
              const A1 = [], B1 = [], nS = max(5, Math.round(9 * LV.seg));
              for (let i = 0; i <= nS; i++) { const u = i / nS, y = lerp(ya, yb, u), w = wd * (0.15 + 0.85 * Math.pow(u, 0.6)) * (1 - 0.35 * u * u) / 2, x = x0 + sl * u; A1.push([x - w, y]); B1.push([x + w, y]); }
              addGeo(THREE, acc, gridDecal(THREE, F.headCore, B1, A1, 1, 0.0018, 0), M4(), C.stripe, [0.6, 1, 3, 1], BI.head);
            }
          }
          tpart('whiskers+stripes', t0);

          /* ---- eyelids (upper shell + dark rim, lower shell), happy arcs: authored in the lid frame */
          t0 = acc.I.length;
          const eyeR = S.eye.r, lidR = eyeR + 0.0045;
          const upG = new THREE.SphereGeometry(lidR, LV.lid[0], LV.lid[1], 0, PI * 2, 0, PI / 2);
          const loG = new THREE.SphereGeometry(lidR - 0.0016, LV.lid[0], max(3, LV.lid[1] - 2), 0, PI * 2, PI / 2, PI / 2);
          const rimG = new THREE.TorusGeometry(lidR - 0.002, 0.0052, LV.rim[0], LV.rim[1], PI).rotateX(PI / 2);
          const loRimG = new THREE.TorusGeometry(lidR - 0.0035, 0.0032, 3, max(8, LV.rim[1] >> 1), PI).rotateX(PI / 2);
          const nA = max(6, Math.round(12 * LV.seg)), tubeA = max(3, LV.tube - 2);
          const arcPts = []; for (let i = 0; i <= nA; i++) { const s = -1 + 2 * i / nA; arcPts.push(v3.scale(v3.norm([0.68 * s, -0.12 + 0.34 * (1 - s * s), 1]), lidR + 0.003)); }
          const arcR = arcPts.map((_, i) => 0.0095 * (0.4 + 0.6 * sin(PI * i / nA)));
          const arcG = taperTube(THREE, arcPts, arcR, arcR, tubeA, [0, 0, 1], true);
          for (const side of [1, -1]) {
            const sfx = side > 0 ? 'L' : 'R';
            addGeo(THREE, acc, upG, M4(), (x, y) => shade(mix3(C.fur, mul3(C.fur, 0.86), sstep(0, lidR, y) * 0.4), 1, 1), [0.5, 1, 3, 0.9], BI['lid' + sfx]);
            addGeo(THREE, acc, rimG, M4(), C.lidLine, [0.45, 0.3, 0, 0.7], BI['lid' + sfx]);
            addGeo(THREE, acc, loG, M4(), (x, y) => shade(C.furHi, 0.92, 1), [0.55, 1, 3, 0.9], BI['low' + sfx]);
            if (LV.extras) addGeo(THREE, acc, loRimG, M4(), mix3(C.lidLine, C.fur, 0.35), [0.5, 0, 0, 1], BI['low' + sfx]);
            addGeo(THREE, acc, arcG, M4(), C.lidLine, [0.45, 0, 0, 1], BI['arc' + sfx]);
          }
          tpart('lids', t0);

          /* ---- suit trims: gold helmet collar, glove + boot rings, accordion joints, chest panel, shoulder patch, tail sleeve */
          t0 = acc.I.length;
          const HL = S.helmet, cutR = sqrt(HL.r * HL.r - (HL.cut - HL.c[1]) ** 2);
          addGeo(THREE, acc, new THREE.TorusGeometry(cutR + 0.004, 0.03, LV.rim[0] + 1, max(16, LV.rim[1] + 10)).rotateX(PI / 2).scale(1, 0.8, 1), M4().makeTranslation(HL.c[0], HL.cut - 0.006, HL.c[2]),
            (x, y, z, nx, ny) => mix3(C.goldDk, C.gold, sstep(-0.6, 0.6, ny) * 0.8 + 0.2), kGold, BI.body);
          // a soft white neck seal under the collar (closes the suit inside the bubble)
          addGeo(THREE, acc, new THREE.CylinderGeometry(cutR - 0.01, cutR + 0.004, 0.05, max(12, LV.rim[1]), 1, true), M4().makeTranslation(HL.c[0], HL.cut - 0.04, HL.c[2]), C.suitDk, kSuit, BI.body);
          const ringAt = (A, B, k, r, tube, col, kk, thin) => {
            for (const s of [1, -1]) {
              const a = [s * A[0], A[1], A[2]], b = [s * B[0], B[1], B[2]], d = v3.norm(v3.sub(b, a));
              addGeo(THREE, acc, new THREE.TorusGeometry(r, tube, thin ? 3 : LV.ring[0], thin ? 14 : LV.ring[1]), M4().compose(V(v3.lerp(a, b, k)), qFrom(d), V([1, 1, 1])), col, kk, BI.body);
            }
          };
          ringAt(F.Gc, F.Wr, 0.02, 0.071, 0.011, C.gold, kGold);                                 // glove cuffs
          ringAt(F.Bc, S.F, 0.04, 0.09, 0.012, C.gold, kGold);                                  // boot tops
          if (LV.extras) {
            if (LV.ribs) {
              ringAt(S.S, S.El, 0.86, S.armR[1] + 0.002, 0.009, C.rib, kSuit, 1);                // accordion elbows
              ringAt(S.El, F.Wc, 0.16, S.armR[1] - 0.001, 0.009, C.rib, kSuit, 1);
              ringAt(S.Hp, S.K, 0.84, 0.087, 0.01, C.rib, kSuit, 1);                             // and knees
            }
            // chest control box: three lit buttons
            const cp = rayHit(F.suitF, [0, 0.335, 0.6], [0, 0, -1], 0, 0.8) || [0, 0.335, 0.11];
            grad(F.suitF, cp[0], cp[1], cp[2], 0.003, g0);
            const cq = qFrom(g0);
            const bx = new THREE.BoxGeometry(0.15, 0.075, 0.034, 2, 1, 1), bp = bx.attributes.position;
            for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i); const k = 1 - 0.25 * (z > 0 ? 1 : 0); bp.setXYZ(i, x * (z > 0 ? 0.94 : 1), y * k + (z > 0 ? 0 : 0), z); }
            bx.computeVertexNormals();
            addGeo(THREE, acc, bx, M4().compose(V(v3.add(cp, g0, 0.006)), cq, V([1, 1, 1])), (x, y, z, nx, ny, nz) => (nz > 0.5 ? C.panel : mix3(C.panel, C.suitDk, 0.4)), [0.4, 0, 0, 1], BI.body);
            [C.red, C.teal, C.amber].forEach((bc, i) => {
              const off = new THREE.Vector3((i - 1) * 0.042, 0.004, 0.02).applyQuaternion(cq);
              addGeo(THREE, acc, new THREE.SphereGeometry(0.011, 8, 4, 0, PI * 2, 0, PI / 2).rotateX(PI / 2), M4().compose(V(v3.add(cp, g0, 0.006)).add(off), cq, V([1, 1, 0.7])), bc, [0.3, 0, 2, 1], BI.body);
            });
            // shoulder patch on the left upper arm: a navy disc, gold rim, a cream paw print
            if (LV.patch) {
            const sa = v3.lerp(S.S, S.El, 0.38), pr = [sa[0] + 0.2, sa[1] + 0.03, sa[2]];
            const ph = rayHit((x, y, z) => F.armF(abs(x), y, z), pr, v3.norm(v3.sub(sa, pr)), 0, 0.3) || sa;
            grad((x, y, z) => F.armF(abs(x), y, z), ph[0], ph[1], ph[2], 0.003, g0);
            const pq = qFrom(g0), pc = v3.add(ph, g0, 0.003);
            addGeo(THREE, acc, new THREE.CylinderGeometry(0.036, 0.036, 0.006, 16).rotateX(PI / 2), M4().compose(V(pc), pq, V([1, 1, 1])), C.patch, [0.6, 0, 0, 1], BI.body);
            addGeo(THREE, acc, new THREE.TorusGeometry(0.036, 0.0045, 3, 16), M4().compose(V(pc), pq, V([1, 1, 1])), C.gold, kGold, BI.body);
            const blob = new THREE.SphereGeometry(1, 6, 3);
            for (const [px, py, rx, ry] of [[0, -0.007, 0.012, 0.01], [-0.013, 0.008, 0.005, 0.006], [-0.004, 0.015, 0.005, 0.006], [0.005, 0.015, 0.005, 0.006], [0.014, 0.008, 0.005, 0.006]]) {
              const off = new THREE.Vector3(px, py, 0.003).applyQuaternion(pq);
              addGeo(THREE, acc, blob, M4().compose(V(pc).add(off), pq, V([rx, ry, 0.002])), C.cream, [0.6, 0, 0, 1], BI.body);
            }
            }
          }
          tpart('trims', t0);

          /* ---- the tail: out of a gold sleeve at the hip, up beside the seat back in a question mark; tabby rings */
          t0 = acc.I.length;
          const TL = S.tail, curve = new THREE.CatmullRomCurve3(TL.pts.map((p) => V(p)));
          const tN = LV.tail[0], tpts = curve.getPoints(tN).map((p) => [p.x, p.y, p.z]);
          const tr = tpts.map((_, i) => { const u = i / tN; return lerp(TL.r0, TL.r1, u) + TL.fluff * sin(PI * min(1, u * 1.3)) - 0.02 * sstep(0.88, 1, u); });
          const tg = taperTube(THREE, tpts, tr, tr, LV.tail[1], [1, 0, 0], true);
          {
            const uv = tg.attributes.uv, pos = tg.attributes.position, nor = tg.attributes.normal;
            acc.k = kFur; const base = acc.n;
            for (let i = 0; i < pos.count; i++) {
              const u = uv.getX(i), ny = nor.getY(i);
              const ring = LV.extras ? sstep(0.35, 0.6, sin(u * PI * 9 - 1.2)) * sstep(0.25, 0.35, u) : 0;
              const c = mix3(mix3(C.fur, C.stripe, ring * 0.85), C.furDk, sstep(0.86, 0.97, u) * 0.7);
              const uu = clamp(u, 0, 0.999) * 3, bi = Math.floor(uu), f = uu - bi;
              acc.bw = () => (bi >= 2 ? [BI.tail2, BI.tail2, 0] : [BI['tail' + bi], BI['tail' + (bi + 1)], f]);
              acc.v(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), ny, nor.getZ(i), ...shade(c, 0.86 + 0.14 * sstep(-0.5, 0.5, ny), 1));
            }
            acc.bw = null;
            for (let i = 0; i < tg.index.count; i++) acc.I.push(base + tg.index.getX(i));
            const d0 = v3.norm(v3.sub(tpts[1], tpts[0]));
            addGeo(THREE, acc, new THREE.TorusGeometry(TL.r0 + 0.006, 0.011, LV.rim[0], max(10, LV.rim[1] >> 1)), M4().compose(V(v3.add(tpts[0], d0, 0.012)), qFrom(d0), V([1, 1, 1])), C.gold, kGold, BI.body);
          }
          tpart('tail', t0);
          stats.accMs = Math.round(now() - t); t = now();

          /* ---- geometry; lid/arc vertices are authored in the lid frame: bind them at the eye */
          const nv = acc.n;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
          for (let v = 0; v < nv; v++) { SI[4 * v] = acc.B[3 * v]; SI[4 * v + 1] = acc.B[3 * v + 1]; const f = acc.B[3 * v + 2]; SW[4 * v] = 1 - f; SW[4 * v + 1] = f; }
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
          {
            const pa = geo.attributes.position, na = geo.attributes.normal, vv = new THREE.Vector3(), nn = new THREE.Vector3();
            const eyeBones = new Set(['lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR'].map((n) => BI[n]));
            const qL = lidQ(1), qR = lidQ(-1);
            for (let v = 0; v < nv; v++) {
              const b = acc.B[3 * v]; if (!eyeBones.has(b)) continue;
              const side = BONES[b].endsWith('L') ? 1 : -1, E = side > 0 ? EYE.L : EYE.R, q = side > 0 ? qL : qR;
              vv.fromBufferAttribute(pa, v).applyQuaternion(q).add(V(E.c)); pa.setXYZ(v, vv.x, vv.y, vv.z);
              nn.fromBufferAttribute(na, v).applyQuaternion(q); na.setXYZ(v, nn.x, nn.y, nn.z);
            }
          }
          geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));

          /* ---- morph targets: head re-projected onto the expression SDF (cheeks), face rebuilt with E */
          const names = [];
          if (LV.morph && !(typeof window !== 'undefined' && window.KartDiag && window.KartDiag.nomorph)) {
            geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
            const g = [0, 0, 0];
            for (const name of NAMES) {
              const E = EXPR[name], FE = catSDF(S, LV, E), fE = FE.headCore;
              const dP = new Float32Array(nv * 3), dN = new Float32Array(nv * 3);
              if ((E.cheek || 0) !== (E0.cheek || 0)) {
                for (let v = hd.v0; v < hd.v1; v++) {
                  let x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
                  if (z < -0.06 || y > 0.76 || y < 0.44) continue;
                  const lvl = headNoEar(x, y, z);
                  let d = fE(x, y, z) - lvl;
                  if (abs(d) < 2e-5) continue;
                  for (let it = 0; it < 4 && abs(d) > 1e-5; it++) { grad(fE, x, y, z, 0.0015, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; d = fE(x, y, z) - lvl; }
                  grad(fE, x, y, z, 0.002, g);
                  dP[3 * v] = x - acc.P[3 * v]; dP[3 * v + 1] = y - acc.P[3 * v + 1]; dP[3 * v + 2] = z - acc.P[3 * v + 2];
                  dN[3 * v] = g[0] - acc.N[3 * v]; dN[3 * v + 1] = g[1] - acc.N[3 * v + 1]; dN[3 * v + 2] = g[2] - acc.N[3 * v + 2];
                }
              }
              const A = new Acc(); buildFace(A, E, FE);
              if (A.n !== fc1 - fc0) throw new Error('face topology changed for ' + name + ': ' + A.n + ' vs ' + (fc1 - fc0));
              for (let i = 0; i < A.n; i++) {
                const v = fc0 + i;
                for (let q = 0; q < 3; q++) { dP[3 * v + q] = A.P[3 * i + q] - acc.P[3 * v + q]; dN[3 * v + q] = A.N[3 * i + q] - acc.N[3 * v + q]; }
              }
              geo.morphAttributes.position.push(new THREE.Float32BufferAttribute(dP, 3));
              geo.morphAttributes.normal.push(new THREE.Float32BufferAttribute(dN, 3));
              names.push(name);
            }
            geo.morphTargetsRelative = true;
          }
          stats.morphMs = Math.round(now() - t);
          geo.computeBoundingSphere();

          /* ---- skeleton */
          const tailAt = (u) => { const p = curve.getPoint(u); return [p.x, p.y, p.z]; };
          const earB = S.ear.b;
          const REST = {
            root: [0, 0, 0], body: [0, 0, 0], head: S.neck, earL: earB, earR: [-earB[0], earB[1], earB[2]],
            lidL: EYE.L.c, lidR: EYE.R.c, lowL: EYE.L.c, lowR: EYE.R.c, arcL: EYE.L.c, arcR: EYE.R.c,
            tail0: tailAt(0), tail1: tailAt(1 / 3), tail2: tailAt(2 / 3),
          };
          const bones = {}, list = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; return b; });
          const LOCALQ = { lidL: lidQ(1), lidR: lidQ(-1), lowL: lidQ(1), lowR: lidQ(-1), arcL: lidQ(1), arcR: lidQ(-1) };
          const worldQ = {};
          BONES.forEach((n) => {
            const p = PARENT[n]; if (!p) { worldQ[n] = new THREE.Quaternion(); return; }
            const w = REST[n], pw = REST[p], pq = worldQ[p];
            bones[n].position.copy(V(v3.sub(w, pw)).applyQuaternion(pq.clone().invert()));
            if (LOCALQ[n]) bones[n].quaternion.copy(pq.clone().invert().multiply(LOCALQ[n]));
            worldQ[n] = pq.clone().multiply(bones[n].quaternion);
            bones[p].add(bones[n]);
          });
          const mesh = new THREE.SkinnedMesh(geo, toon); mesh.name = 'mooncat-skin';
          const group = new THREE.Group(); group.name = 'mooncat-' + detail;
          group.add(bones.root); group.add(mesh);
          group.updateMatrixWorld(true);
          mesh.bind(new THREE.Skeleton(list));
          mesh.frustumCulled = false;
          if (names.length) { mesh.morphTargetDictionary = {}; names.forEach((k, i) => { mesh.morphTargetDictionary[k] = i; }); mesh.morphTargetInfluences = names.map(() => 0); }

          /* ---- eyeballs: one mesh on the head bone */
          const eyeG = new THREE.SphereGeometry(eyeR, LV.eye[0], LV.eye[1], 0, PI * 2, 0, PI * 0.6).rotateX(PI / 2);
          const EP = [], EN = [], EA = [], EI = [];
          const headInv = new THREE.Matrix4().compose(V(S.neck), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)).invert();
          for (const side of [1, -1]) {
            const E = side > 0 ? EYE.L : EYE.R;
            const m = M4().compose(V(E.c), eyeQ(side), new THREE.Vector3(1, 1, 1)).premultiply(headInv), nm = new THREE.Matrix3().getNormalMatrix(m);
            const p = eyeG.attributes.position, nr = eyeG.attributes.normal, b = EP.length / 3, v = new THREE.Vector3(), n = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
              v.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
              EA.push(n.x, n.y, n.z, side);
              v.applyMatrix4(m); n.applyMatrix3(nm).normalize();
              EP.push(v.x, v.y, v.z); EN.push(n.x, n.y, n.z);
            }
            for (let i = 0; i < eyeG.index.count; i++) EI.push(b + eyeG.index.getX(i));
          }
          const eg = new THREE.BufferGeometry();
          eg.setAttribute('position', new THREE.Float32BufferAttribute(EP, 3)); eg.setAttribute('normal', new THREE.Float32BufferAttribute(EN, 3));
          eg.setAttribute('aEye', new THREE.Float32BufferAttribute(EA, 4)); eg.setIndex(EI);
          const eyeMat = opts.eyeMat || eyeMaterial(THREE);
          const eyes = new THREE.Mesh(eg, eyeMat); eyes.name = 'mooncat-eyes';
          bones.head.add(eyes);

          /* ---- the bubble helmet: a cut sphere of glass on the head bone (drawn last; never casts a shadow) */
          const cutT = Math.acos((HL.cut - HL.c[1]) / HL.r);
          const hg = new THREE.SphereGeometry(HL.r, LV.helm[0], LV.helm[1], 0, PI * 2, 0, cutT).translate(HL.c[0] - S.neck[0], HL.c[1] - S.neck[1], HL.c[2] - S.neck[2]);
          const glass = new THREE.Mesh(hg, glassMat); glass.name = 'mooncat-glass'; glass.renderOrder = 10; glass.castShadow = false; glass.receiveShadow = false; glass.userData.noShadow = true;
          bones.head.add(glass);

          // forward in each eye's frame: the gaze offsets are added to it so a zero gaze looks straight ahead (not splayed)
          const conv = { L: new THREE.Vector3(0, 0, 1).applyQuaternion(eyeQ(1).invert()), R: new THREE.Vector3(0, 0, 1).applyQuaternion(eyeQ(-1).invert()) };
          stats.parts.eyes = EI.length / 3; stats.parts.glass = hg.index.count / 3;
          stats.tris = acc.I.length / 3 + EI.length / 3 + hg.index.count / 3; stats.verts = nv; stats.ms = Math.round(now() - T0);
          stats.headShare = headShare(F, S);
          const api = rig(THREE, { S, bones, mesh, eyes, eyeMat, glass, stats, names, conv, level: detail });
          group.userData.racer = api;
          group.userData.stats = stats;
          return group;
        }

        // head share of the seated height (chin to crown over seat to crown; ears excluded), and with the bubble
        function headShare(F, S) {
          const top = rayHit(F.headCore, [0, 1.3, S.cran[2]], [0, -1, 0], 0, 0.8, 96)[1];
          let chin = 1; for (let z = 0.0; z < 0.3; z += 0.01) { const p = rayHit(F.faceF, [0, 0.2, z], [0, 1, 0], 0, 0.6, 96); if (p) chin = min(chin, p[1]); }
          const HL = S.helmet, btop = HL.c[1] + HL.r;
          return { top: +top.toFixed(3), chin: +chin.toFixed(3), share: +((top - chin) / top).toFixed(3), bubbleTop: +btop.toFixed(3), bubbleShare: +((btop - HL.cut) / btop).toFixed(3) };
        }

        /* ------------------------------------------------------------------ far LOD: snapped low-poly parts, the face painted */
        function buildFar(THREE, S, F, C, toon, glassMat, T0, now) {
          const acc = new Acc(), M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]), g = [0, 0, 0];
          const snap = (f, c, ws, hs, rmax, col, k) => {
            const s = new THREE.SphereGeometry(1, ws, hs), p = s.attributes.position, n = s.attributes.normal;
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i), p.getY(i), p.getZ(i)]);
              let lo = 0, hi = rmax;
              for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (f(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c, d, (lo + hi) / 2); p.setXYZ(i, q[0], q[1], q[2]);
              grad(f, q[0], q[1], q[2], 0.004, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            addGeo(THREE, acc, s, M4(), col, k, 0);
          };
          const kF = [0.6, 1, 0, 1], kP = [0.45, 0, 0, 1], kS = [0.58, 0.25, 0, 1], kG = [0.24, 0, 0, 1];
          snap(F.faceF, [0, 0.7, 0.02], 11, 7, 0.5, (x, y, z) => (y < 0.625 && z > 0.12 && abs(x) < 0.085 ? C.cream : C.fur), kF);
          for (const side of [1, -1]) {
            const b = [side * S.ear.b[0], S.ear.b[1] - 0.02, S.ear.b[2]], tp = [side * S.ear.t[0], S.ear.t[1], S.ear.t[2]], d = v3.sub(tp, b), L = hypot(...d);
            const cone = new THREE.ConeGeometry(S.ear.rb * 0.95, L, 4, 1, true).translate(0, L / 2, 0);
            addGeo(THREE, acc, cone, M4().compose(V(b), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PI / 4, 0))), V([1, 1, 0.5])), (x, y, z, nx, ny, nz) => (nz > 0.3 ? C.inner : C.fur), kF, 0);
          }
          snap(F.torsoF, [0, 0.25, -0.02], 8, 5, 0.4, C.suit, kS);
          const cyl = (A, B, ra, rb, col, k) => {
            const d = v3.sub(B, A), L = hypot(...d), c = new THREE.CylinderGeometry(rb, ra, L, 5, 1, true);
            addGeo(THREE, acc, c, M4().compose(V(v3.add(A, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), V([1, 1, 1])), col, k, 0);
          };
          for (const s of [1, -1]) {
            const X = (p) => [s * p[0], p[1], p[2]];
            cyl(X(S.S), X(S.El), 0.078, 0.07, C.suit, kS); cyl(X(S.El), X(F.Wr), 0.07, 0.064, C.suit, kS);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.066, 5, 3), M4().makeTranslation(...X(F.pawC)), C.glove, kS, 0);
            cyl(X(S.Hp), X(S.K), 0.096, 0.084, C.suit, kS); cyl(X(S.K), X(S.F), 0.084, 0.08, C.suit, kS);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.08, 5, 3), M4().compose(V(X([S.F[0], S.F[1], S.F[2] + 0.04])), new THREE.Quaternion(), V([1, 0.85, 1.35])), C.boot, kS, 0);
          }
          // the face, painted big enough to read at 45 m+: turquoise eyes with a dark slit, pink nose
          const fz = (x, y, l) => faceAt(F.faceF, x, y, l === undefined ? 0.004 : l);
          for (const side of [1, -1]) {
            const p = fz(side * S.eye.x, S.eye.y, 0.006);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 6, 3), M4().compose(V(p), new THREE.Quaternion(), V([0.06, 0.06, 0.024])), [0.08, 0.5, 0.48], kP, 0);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 2), M4().compose(V(v3.add(p, [0, 0.002, 0.016])), new THREE.Quaternion(), V([0.014, 0.04, 0.012])), [0.01, 0.01, 0.02], kP, 0);
          }
          addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 2), M4().compose(V(fz(0, S.nose.y)), new THREE.Quaternion(), V([0.03, 0.022, 0.02])), C.nose, kP, 0);
          addGeo(THREE, acc, new THREE.TorusGeometry(sqrt(S.helmet.r ** 2 - (S.helmet.cut - S.helmet.c[1]) ** 2), 0.03, 3, 10).rotateX(PI / 2), M4().makeTranslation(0, S.helmet.cut - 0.006, S.helmet.c[2]), C.gold, kG, 0);
          const TL = S.tail, tp = new THREE.CatmullRomCurve3(TL.pts.map((p) => V(p))).getPoints(6).map((p) => [p.x, p.y, p.z]);
          addGeo(THREE, acc, taperTube(THREE, tp, tp.map(() => TL.r0), tp.map(() => TL.r0), 4, [1, 0, 0], true), M4(), C.fur, kF, 0);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          geo.setIndex(new THREE.Uint16BufferAttribute(acc.I, 1));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, toon); mesh.name = 'mooncat-far';
          const HL = S.helmet, hg = new THREE.SphereGeometry(HL.r, 10, 6, 0, PI * 2, 0, Math.acos((HL.cut - HL.c[1]) / HL.r)).translate(...HL.c);
          const glass = new THREE.Mesh(hg, glassMat); glass.name = 'mooncat-far-glass'; glass.renderOrder = 10; glass.castShadow = false; glass.userData.noShadow = true;
          const group = new THREE.Group(); group.name = 'mooncat-far'; group.add(mesh); mesh.add(glass);
          const stats = { tris: acc.I.length / 3 + hg.index.count / 3, verts: acc.n, ms: Math.round(now() - T0), parts: { far: acc.I.length / 3, glass: hg.index.count / 3 } };
          const sq = { k: 1, v: 0 };
          const api = {
            level: 'far', mesh, glass, stats, names: [], bones: null,
            set() { return api; }, setExpression() { return api; }, setGaze() { return api; }, look() { return api; }, blink() { return api; }, steer() { return api; },
            squash(k) { sq.k = k; mesh.scale.set(1 / sqrt(k), k, 1 / sqrt(k)); return api; }, kick(v) { sq.v += v; },
            update(dt) { const a = -220 * (sq.k - 1) - 14 * sq.v; sq.v += a * dt; sq.k += sq.v * dt; mesh.scale.set(1 / sqrt(sq.k), sq.k, 1 / sqrt(sq.k)); },
          };
          group.userData.racer = api;
          group.userData.stats = stats;
          return group;
        }

        /* ------------------------------------------------------------------ the live layer (the stars' API) */
        function rig(THREE, o) {
          const { bones: B, eyeMat, stats, names, conv } = o;
          const U = eyeMat.userData.uniforms;
          const rest = {}; for (const k in B) rest[k] = B[k].quaternion.clone();
          const N0 = EXPR.neutral, NN = names.length ? names : NAMES;
          const st = { w: {}, target: null, gaze: null, look: [0, 0], blink: 0, autoBlink: true, nextBlink: 2 + Math.random() * 3, blinkT: -1, sq: 1, sqV: 0, steer: 0 };
          NN.forEach((n) => { st.w[n] = 0; });
          const springs = ['tail0', 'tail1', 'tail2', 'earL', 'earR'].map((n) => ({ n, a: 0, v: 0, b: 0, bv: 0 }));
          const qx = new THREE.Quaternion(), e = new THREE.Euler();
          const blend = (key) => { let v = N0[key]; for (const k of NN) v += st.w[k] * (EXPR[k][key] - N0[key]); return v; };
          function apply() {
            let gx = N0.gaze[0], gy = N0.gaze[1];
            for (const k of NN) { gx += st.w[k] * (EXPR[k].gaze[0] - N0.gaze[0]); gy += st.w[k] * (EXPR[k].gaze[1] - N0.gaze[1]); }
            if (st.gaze) { gx = st.gaze[0]; gy = st.gaze[1]; }
            gx += st.look[0]; gy += st.look[1];
            U.uGazeL.value.set(conv.L.x / conv.L.z + gx, conv.L.y / conv.L.z + gy, 1).normalize();
            U.uGazeR.value.set(conv.R.x / conv.R.z + gx, conv.R.y / conv.R.z + gy, 1).normalize();
            U.uPupil.value = blend('pupil'); U.uIris.value = blend('iris'); U.uSpark.value = blend('spark'); U.uSlit.value = blend('slit');
            const happy = blend('happy');
            let lu = blend('lidU'), ll = blend('lidLo');
            lu = lerp(lu, -1.5, max(sstep(0.3, 0.7, happy), st.blink)); ll = lerp(ll, -0.62, sstep(0.3, 0.7, happy));
            U.uLid.value = lu;
            for (const s of ['L', 'R']) {
              B['lid' + s].quaternion.copy(rest['lid' + s]).multiply(qx.setFromEuler(e.set(-lu, 0, 0)));
              B['low' + s].quaternion.copy(rest['low' + s]).multiply(qx.setFromEuler(e.set(-ll, 0, 0)));
              B['arc' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, happy)));
            }
            if (o.mesh.morphTargetInfluences) NN.forEach((n, i) => { o.mesh.morphTargetInfluences[i] = st.w[n] || 0; });
            B.head.quaternion.copy(rest.head).multiply(qx.setFromEuler(e.set(0.03, st.steer * 0.22, blend('roll') - st.steer * 0.05)));
            B.body.rotation.set(0, 0, -st.steer * 0.05);
            B.root.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
            const ear = blend('ear');
            for (const s of springs) if (s.n[0] === 'e') {
              const side = s.n === 'earL' ? 1 : -1;
              // + = pricked forward, - = flattened back and out ("airplane ears"), kept inside the bubble
              B[s.n].quaternion.copy(rest[s.n]).multiply(qx.setFromEuler(e.set(s.a + ear * 0.45, s.b * side, side * min(0, ear) * 0.22)));
            }
          }
          const api = {
            level: o.level, bones: B, mesh: o.mesh, glass: o.glass, names: NN, EXPR, stats,
            set(weights) { for (const k of NN) st.w[k] = weights && weights[k] ? weights[k] : 0; st.target = null; apply(); return api; },
            setExpression(name, instant) { st.target = name; if (instant) { for (const k of NN) st.w[k] = k === name ? 1 : 0; apply(); } return api; },
            setGaze(x, y) { st.gaze = x === null || x === undefined ? null : [x, y || 0]; apply(); return api; },
            look(x, y) { st.look[0] = x; st.look[1] = y; apply(); return api; },
            blink(v) { st.blink = v || 0; st.autoBlink = v === undefined; apply(); return api; },
            squash(k) { st.sq = k; apply(); return api; },
            kick(v) { st.sqV += v; },
            steer(v) { st.steer = v; apply(); return api; },
            // auto blinks every 2-5 s, eased expressions, squash spring (stiffness 220, damping 14), tail + ear springs
            update(dt, inp) {
              inp = inp || {};
              if (st.target !== null) { const k = 1 - exp(-dt * 12); for (const n of NN) st.w[n] += ((n === st.target ? 1 : 0) - st.w[n]) * k; }
              if (st.autoBlink && blend('happy') < 0.5) {
                st.nextBlink -= dt;
                if (st.nextBlink <= 0 && st.blinkT < 0) { st.blinkT = 0; st.nextBlink = 2 + Math.random() * 3; }
                if (st.blinkT >= 0) { st.blinkT += dt; const u = st.blinkT / 0.16; st.blink = u < 0.4 ? u / 0.4 : max(0, 1 - (u - 0.4) / 0.6); if (u >= 1) { st.blinkT = -1; st.blink = 0; } }
              }
              const a = -220 * (st.sq - 1) - 14 * st.sqV; st.sqV += a * dt; st.sq += st.sqV * dt;
              const acc = inp.accel || 0, turn = inp.steer || 0;
              for (const s of springs) {
                const isEar = s.n[0] === 'e', k = isEar ? 260 : 110, d = isEar ? 14 : 8;
                const ta = (isEar ? -0.08 : 0.22) * acc, tb = (isEar ? 0.1 : -0.3) * turn;
                s.v += (k * (ta - s.a) - d * s.v) * dt; s.a += s.v * dt;
                s.bv += (k * (tb - s.b) - d * s.bv) * dt; s.b += s.bv * dt;
                if (!isEar) B[s.n].quaternion.copy(rest[s.n]).multiply(qx.setFromEuler(e.set(s.a * 0.6, s.b, s.a * 0.4)));
              }
              apply();
            },
          };
          apply();
          return api;
        }

        /* ================================================================== CRATER HOPPER (Moon Cat's kart)
         * An original lunar-rover kart: a flat silver deck, three boxes wrapped in CRINKLED GOLD FOIL (a nose box, two side
         * pods, a rear box) as their own marching-cubes mesh (the crinkle is real geometry + analytic normals), white flat
         * fenders on silver A-arms, silver mesh tyres with dark chevron treads, two oxygen tanks across the back, a whip
         * antenna with a lilac pennant on the right, and a white dish antenna on a mast at the rear LEFT (its own small mesh;
         * it pans while racing). The asymmetric dish + pennant are the kart's 48 px separators. */
        function CraterHopper(THREE, KIT, detail, opts) {
          const KK = root.MoonKartKit, { rbox } = KK;
          const WHEELS = [[0.61, 0.6, 0.19, 0.17], [-0.61, 0.6, 0.19, 0.17], [0.61, -0.58, 0.19, 0.17], [-0.61, -0.58, 0.19, 0.17]];
          const DECK = { c: [0, 0.2, 0.0], h: [0.38, 0.045, 0.83] };
          const BOX = [
            { c: [0, 0.37, 0.64], h: [0.3, 0.135, 0.2], r: 0.06 },          // nose box (the dash)
            { c: [0.36, 0.31, -0.07], h: [0.085, 0.08, 0.3], r: 0.045 },    // side pods (mirrored)
            { c: [0, 0.37, -0.66], h: [0.26, 0.135, 0.17], r: 0.06 },       // rear box
          ];
          const deckF = (x, y, z) => rbox(x, y, z, DECK.c, DECK.h, 0.035);
          const boxF = (x, y, z) => min(min(rbox(x, y, z, BOX[0].c, BOX[0].h, BOX[0].r), rbox(abs(x), y, z, BOX[1].c, BOX[1].h, BOX[1].r)), rbox(x, y, z, BOX[2].c, BOX[2].h, BOX[2].r));
          const bodyF = (x, y, z) => min(deckF(x, y, z), boxF(x, y, z));
          const amp = { desktop: 0.0036, phone: 0.003, mid: 0, far: 0 }[detail] || 0;
          const ridge = (x, y, z) => 1 - 2 * abs(vnoise(x, y, z));
          const foilF = amp ? (x, y, z) => boxF(x, y, z) + amp * (0.8 * ridge(x * 9 + 1.3, y * 9, z * 9) + 0.5 * ridge(x * 19, y * 19 + 4.1, z * 19)) + 0.0016 * vnoise(x * 150, y * 150, z * 150) : boxF;
          const MAST = { b: [-0.2, 0.5, -0.72], t: [-0.25, 0.86, -0.77] }, DISH = { r: 0.2, f: 0.14, dir: v3.norm([-0.42, 0.72, -0.55]) };
          const WHIP = { b: [0.22, 0.5, -0.79], t: [0.25, 1.32, -0.84] };
          const pal = {
            top: '#E9B84A', topDk: '#B9862A', low: '#C9CED8', lowDk: '#8E95A3', inside: '#3A3E4C',
            chrome: '#DDE2EA', chromeDk: '#8C939F', lamp: '#D8F6FF', tail: '#FF4D5E', coaming: '#8C939F',
            seat: '#5E4CA8', seatHi: '#806CCB', tyre: '#B3B9C4', wall: '#B3B9C4', hub: '#3A3E4C', cap: '#E9B84A',
            rim: '#3A3E4C', hubS: '#E9B84A', foil: '#E6AE38', foilHi: '#FFE38E', foilDk: '#9C6A1A', fender: '#F1F2F5', fenderDk: '#B9BFCB',
            tread: '#5D6270', dish: '#F3F4F7', dishIn: '#DADEE6', flag: '#9C7CF0', flagDk: '#6E52C8',
          };
          const design = {
            name: 'crater-hopper', capsNearOnly: true, gloss: 0.3, whitewall: false, rimRing: false, strip: null, coaming: false, coamingK: 'chrome', tyreK: [0.5, 0, 0, 1],
            box: [-0.5, 0.1, -0.88, 0.5, 0.55, 0.9], farC: [0, 0.28, 0.0], wheels: WHEELS, bodyF,
            seamY: () => 0.255, palette: pal,
            customBody(c) {
              const { THREE, U: u, C, LV, body, M4, KIT } = c;
              // the silver deck (a rounded box, crisp at every LOD) and its side rails
              u.addGeo(THREE, body, rboxGeo(THREE, 0.76, 0.09, 1.66, 0.035, LV.box), M4().makeTranslation(...DECK.c), (x, y, z, nx, ny) => mix3(C.low, C.lowDk, sstep(0.3, -0.7, ny) * 0.8), [0.38, 0, 0, 1], 0);
              // the gold foil boxes: one marching-cubes mesh (crinkled at near LODs), buried bits dropped
              const fh = { desktop: 0.036, phone: 0.055, mid: 0.11 }[c.detail];
              orientPart(body, u.mcPart(KIT, body, foilF, [-0.5, 0.15, -0.88, 0.5, 0.56, 0.9], fh, true, (x, y, z, nx, ny, nz) => {
                const n = vnoise(x * 60 + 7.7, y * 60, z * 60), r = ridge(x * 9 + 1.3, y * 9, z * 9);
                let col = mix3(C.foil, C.foilHi, sstep(0.1, 0.8, n) * 0.7);
                col = mix3(col, C.foilDk, max(sstep(-0.2, -0.8, n) * 0.6, sstep(0.55, 0.95, r) * 0.35));
                return mul3(col, 0.82 + 0.18 * max(0, ny));
              }, (x, y, z) => deckF(x, y, z) > -0.004, [0.11, 0, 0, 1], 0, -0.4));
            },
            customFar(c) {
              const { THREE, U: u, C, body, M4, V, Q } = c;
              u.addGeo(THREE, body, new THREE.BoxGeometry(0.76, 0.09, 1.66), M4().makeTranslation(...DECK.c), C.low, [0.38, 0, 0, 1], 0);
              for (const [b, s] of [[BOX[0], 1], [BOX[1], 1], [BOX[1], -1], [BOX[2], 1]]) u.addGeo(THREE, body, new THREE.BoxGeometry(b.h[0] * 2, b.h[1] * 2, b.h[2] * 2), M4().makeTranslation(s * b.c[0], b.c[1], b.c[2]), C.foil, [0.2, 0, 0, 1], 0);
              u.addGeo(THREE, body, new THREE.BoxGeometry(0.42, 0.3, 0.07), M4().compose(V([0, 0.39, -0.39]), Q(-0.22, 0, 0), V([1, 1, 1])), C.seat, [0.6, 0.2, 0, 1], 0);
              for (const front of [true, false]) { const w = WHEELS.find((q) => (q[1] > 0) === front); u.addGeo(THREE, body, new THREE.BoxGeometry(2 * abs(w[0]), 0.04, 0.04), M4().makeTranslation(0, w[2], w[1]), C.chromeDk, [0.14, 0, 0, 1], 0); }
              for (const [wx, wz, R, Wd] of WHEELS) {
                const pts = []; for (let i = 0; i <= 3; i++) { const a = 0.15 * PI + 0.7 * PI * i / 3; pts.push([wx, R + (R + 0.05) * sin(a), wz + (R + 0.05) * cos(a)]); }
                u.addGeo(THREE, body, u.taperTube(THREE, pts, pts.map(() => 0.012), pts.map(() => Wd / 2 + 0.04), 3, () => [1, 0, 0], false), M4(), C.fender, [0.4, 0, 0, 1], 0);
              }
              u.addGeo(THREE, body, u.taperTube(THREE, [MAST.b, MAST.t], [0.02, 0.016], [0.02, 0.016], 3, [1, 0, 0], false), M4(), C.chromeDk, [0.14, 0, 0, 1], 0);
              const dq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), V(DISH.dir));
              u.addGeo(THREE, body, new THREE.ConeGeometry(DISH.r, 0.08, 8, 1, false), M4().compose(V(v3.add(MAST.t, DISH.dir, 0.05)), dq, V([1, 1, 1])), C.dish, [0.4, 0, 0, 1], 0);
              u.addGeo(THREE, body, u.taperTube(THREE, [WHIP.b, WHIP.t], [0.012, 0.008], [0.012, 0.008], 3, [1, 0, 0], false), M4(), C.chromeDk, [0.14, 0, 0, 1], 0);
              u.addGeo(THREE, body, flagGeo(THREE, 1), M4(), C.flag, [0.6, 0, 0, 1], 0);
            },
            // dark chevron treads on the silver mesh tyres (desktop: V chevrons, phone: bars, mid/far: none)
            tread(c, acc, R, Wd) {
              const { THREE, U: u, C, LV, M4, V, Q } = c;
              const n = LV.loop > 40 ? 12 : LV.detail ? 9 : 0; if (!n) return;
              const vshape = LV.loop > 40;
              for (let i = 0; i < n; i++) {
                const a = (i / n) * PI * 2, p = (x) => [x, R * cos(a), R * sin(a)];
                if (vshape) for (const s of [1, -1]) u.addGeo(THREE, acc, new THREE.BoxGeometry(Wd * 0.5, 0.012, 0.022), M4().compose(V(p(s * Wd * 0.22)), Q(a, 0, 0).multiply(Q(0, s * 0.45, 0)), V([1, 1, 1])), C.tread, [0.45, 0, 0, 1], 0);
                else u.addGeo(THREE, acc, new THREE.BoxGeometry(Wd * 0.86, 0.01, 0.022), M4().compose(V(p(0)), Q(a, 0, 0), V([1, 1, 1])), C.tread, [0.45, 0, 0, 1], 0);
              }
            },
            details(c) {
              const { THREE, U: u, C, K, LV, body, M4, V, Q, done, onBody } = c;
              const tube = (pts, r0, r1, col, k, rad) => u.addGeo(THREE, body, u.taperTube(THREE, pts, pts.map((_, i) => lerp(r0, r1, i / (pts.length - 1))), pts.map((_, i) => lerp(r0, r1, i / (pts.length - 1))), rad || LV.tube, [0, 1, 0], true), M4(), col, k, 0);
              // A-arms from the deck to every hub, a kingpin at each wheel
              for (const [wx, wz, R] of WHEELS) {
                const sd = Math.sign(wx), hub = [wx - sd * 0.1, R, wz];
                for (const dz of [-0.12, 0.12]) tube([[sd * 0.37, 0.19, wz + dz], hub], 0.016, 0.014, C.chromeDk, K.chrome);
                if (LV.detail) tube([[wx - sd * 0.1, R - 0.05, wz], [wx - sd * 0.1, R + 0.05, wz]], 0.022, 0.022, C.chrome, K.chrome);
              }
              // the deck's frame rails
              if (LV.detail) for (const s of [1, -1]) tube([[s * 0.385, 0.255, -0.8], [s * 0.385, 0.255, 0.8]], 0.013, 0.013, C.chrome, K.chrome, 5);
              // flat white fenders over every wheel on two stays (wide enough for the steering front wheels)
              for (const [wx, wz, R, Wd] of WHEELS) {
                const hi = LV.loop > 40, sd = Math.sign(wx), front = wz > 0, rad = R + 0.055, n = hi ? 10 : LV.detail ? 7 : 4;
                const a0 = 0.1 * PI, a1 = 0.9 * PI, pts = [];
                for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([wx, R + rad * sin(a), wz + rad * cos(a)]); }
                const half = Wd / 2 + (front ? 0.06 : 0.035);
                u.addGeo(THREE, body, u.taperTube(THREE, pts, pts.map(() => 0.012), pts.map(() => half), hi ? 8 : 4, () => [1, 0, 0], true), M4(), (x, y, z, nx, ny, nz) => ((ny * (y - R) + nz * (z - wz)) > 0 ? C.fender : C.fenderDk), [0.36, 0, 0, 1], 0);
                if (hi) { const ps = pts.map((p) => [p[0] - sd * half, p[1], p[2]]); tube(ps, 0.008, 0.008, C.top, K.paint, 4); }
                const pm = pts[n >> 1], q = [sd * 0.38, 0.24, wz];
                tube([[wx - sd * (half - 0.02), pm[1] - 0.01, pm[2]], q], 0.012, 0.012, C.chromeDk, K.chrome, 5);
              }
              // headlamps on the nose box, a front bumper bar, tail lamps
              for (const s of [1, -1]) {
                const hl = onBody([s * 0.17, 0.4, 0.86], 0.0), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(v3.norm(v3.lerp(hl.n, [0, 0, 1], 0.7))));
                u.addGeo(THREE, body, new THREE.TorusGeometry(0.052, 0.012, max(3, LV.tube - 2), LV.wheel[0]), M4().compose(V(v3.add(hl.p, [0, 0, 0.006])), q, V([1, 1, 1])), C.chrome, K.chrome, 0);
                u.addGeo(THREE, body, new THREE.SphereGeometry(0.05, LV.wheel[0], 5, 0, PI * 2, 0, PI * 0.35).rotateX(PI / 2), M4().compose(V(v3.add(hl.p, [0, 0, -0.024])), q, V([1, 1, 1])), C.lamp, K.glow, 0);
                const tl = onBody([s * 0.17, 0.4, -0.85], 0.0);
                u.addGeo(THREE, body, new THREE.SphereGeometry(0.03, LV.detail ? 10 : 6, LV.detail ? 5 : 3), M4().compose(V(tl.p), new THREE.Quaternion(), V([1, 0.7, 0.45])), C.tail, K.glow, 0);
              }
              const bp = []; const nb = LV.detail ? 12 : 6;
              for (let i = 0; i <= nb; i++) { const s = -1 + 2 * i / nb; bp.push([s * 0.36, 0.2, 0.9 - 0.05 * s * s]); }
              tube(bp, 0.02, 0.02, C.chrome, K.chrome);
              // a little camera on the dash (left) - a rounded box + lens
              if (LV.detail) {
                const cp = onBody([0.17, 0.52, 0.62], 0.0);
                u.addGeo(THREE, body, c.rboxG(0.07, 0.055, 0.09, 0.012), M4().makeTranslation(cp.p[0], cp.p[1] + 0.03, cp.p[2]), C.chrome, K.chrome, 0);
                u.addGeo(THREE, body, new THREE.CylinderGeometry(0.018, 0.022, 0.03, 10).rotateX(PI / 2), M4().makeTranslation(cp.p[0], cp.p[1] + 0.03, cp.p[2] + 0.058), C.inside, K.matte, 0);
              }
              // two oxygen tanks across the top of the rear box, gold end caps, a strap
              for (const tz of [-0.6, -0.74]) {
                const y = BOX[2].c[1] + BOX[2].h[1] + 0.056, L = 0.24;
                u.addGeo(THREE, body, new THREE.CapsuleGeometry(0.058, 2 * L, LV.detail ? 3 : 1, LV.loop > 40 ? 14 : LV.detail ? 10 : 6).rotateZ(PI / 2), M4().makeTranslation(0, y, tz), (x) => (abs(x) > L - 0.01 ? C.top : C.chrome), K.chrome, 0);
                if (LV.detail) u.addGeo(THREE, body, new THREE.TorusGeometry(0.06, 0.008, 3, LV.wheel[0]).rotateY(PI / 2), M4().makeTranslation(0, y, tz), C.inside, K.matte, 0);
              }
              // the dish mast (left) and the whip antenna with its pennant (right)
              tube([MAST.b, MAST.t], 0.022, 0.017, C.chromeDk, K.chrome);
              tube([WHIP.b, v3.lerp(WHIP.b, WHIP.t, 0.5), WHIP.t], 0.011, 0.006, C.chromeDk, K.chrome, 4);
              u.addGeo(THREE, body, new THREE.SphereGeometry(0.016, 6, 4), M4().makeTranslation(...WHIP.t), C.top, K.chrome, 0);
              u.addGeo(THREE, body, flagGeo(THREE, LV.detail ? 4 : 2), M4(), (x, y, z, nx) => (nx > 0 ? C.flag : C.flagDk), [0.6, 0, 0, 1], 0);
              // the dish: its own small mesh so it can pan (pivot = mast top, tilted to face up-back-left)
              {
                const da = new u.Acc(), seg = LV.loop > 40 ? 22 : LV.detail ? 14 : 8, rows = LV.loop > 40 ? 4 : LV.detail ? 3 : 1, R = DISH.r, f = DISH.f, th = 0.014;
                const prof = [];
                for (let i = 0; i <= rows; i++) { const r = R * i / rows; prof.push([max(r, 0.001), r * r / (4 * f)]); }
                prof.push([R + 0.012, R * R / (4 * f) + 0.004]);
                for (let i = rows; i >= 0; i--) { const r = R * i / rows; prof.push([max(r, 0.001), r * r / (4 * f) - th]); }
                const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
                u.addGeo(THREE, da, lathe, M4(), (x, y, z, nx, ny) => (ny > 0 ? mix3(C.dish, C.dishIn, sstep(0.2, 0.9, hypot(x, z) / R) * 0.5) : C.dish), [0.4, 0, 0, 0.55], 0);   // ROSTER FIX: the back shell faces away from the key; in fenderDk it read as a black disc beside the helmet (white + low AO weight = less rim, reads as the dish)
                // feed horn on three struts at the focus
                for (let k = 0; k < 3; k++) { const a = k * PI * 2 / 3 + 0.4; u.addGeo(THREE, da, u.taperTube(THREE, [[R * 0.92 * cos(a), R * R * 0.85 / (4 * f), R * 0.92 * sin(a)], [0, f - 0.012, 0]], [0.005, 0.004], [0.005, 0.004], 4, [0, 1, 0], false), M4(), C.chromeDk, K.chrome, 0); }
                u.addGeo(THREE, da, new THREE.ConeGeometry(0.022, 0.05, max(6, seg >> 2)).rotateX(PI), M4().makeTranslation(0, f, 0), C.top, K.chrome, 0);
                u.addGeo(THREE, da, new THREE.CylinderGeometry(0.03, 0.03, 0.03, max(6, seg >> 2)), M4().makeTranslation(0, -0.015, 0), C.chromeDk, K.chrome, 0);
                c.extra.push({ acc: da, name: 'kart-dish', pos: MAST.t, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(DISH.dir)) });
              }
              done('details');
              void Q;
            },
            animate(dt, o, extras) {
              const d = extras.find((e) => e.name === 'kart-dish'); if (!d) return;
              d.t = (d.t || 0) + dt * (0.6 + 0.25 * min(1, abs(o.speed || 0) / 20));
              d.pivot.rotation.y = 0.55 * sin(d.t);
            },
          };
          // a triangular pennant just under the whip tip, flying back, with a little thickness (two faces + edge)
          function flagGeo(THREE, n) {
            const top = v3.lerp(WHIP.b, WHIP.t, 0.97), bot = v3.lerp(WHIP.b, WHIP.t, 0.8), tip = v3.add(v3.lerp(top, bot, 0.45), [0.01, -0.02, -0.24]);
            const P = [], I = [];
            for (let i = 0; i <= n; i++) for (const s of [0, 1]) {
              const u = i / n, a = v3.lerp(top, tip, u), b = v3.lerp(bot, tip, u), w = 0.012 * sin(u * PI * 1.5);
              P.push(a[0] + w + (s ? 0.004 : -0.004), a[1], a[2], b[0] + w + (s ? 0.004 : -0.004), b[1], b[2]);
            }
            for (let i = 0; i < n; i++) {
              const q = (k, s) => (k * 2 + s) * 2;
              for (const s of [0, 1]) { const a = q(i, s), b = q(i + 1, s); if (s) I.push(a, a + 1, b, b, a + 1, b + 1); else I.push(a, b, a + 1, b, b + 1, a + 1); }
              I.push(q(i, 0), q(i, 1), q(i + 1, 0), q(i + 1, 0), q(i, 1), q(i + 1, 1));
              I.push(q(i, 0) + 1, q(i + 1, 0) + 1, q(i, 1) + 1, q(i + 1, 0) + 1, q(i + 1, 1) + 1, q(i, 1) + 1);
            }
            const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
            return g;
          }
          function rboxGeo(THREE, w, h, d, r, seg) {   // the kit's rounded box (ctx.rboxG is only made after the body)
            const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position;
            for (let i = 0; i < p.count; i++) {
              const x = p.getX(i), y = p.getY(i), z = p.getZ(i), hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
              const cx = max(-hx, min(hx, x)), cy = max(-hy, min(hy, y)), cz = max(-hz, min(hz, z)), nn = v3.norm([x - cx, y - cy, z - cz]);
              p.setXYZ(i, cx + nn[0] * r, cy + nn[1] * r, cz + nn[2] * r);
            }
            g.computeVertexNormals(); return g;
          }
          return KK.make(design, THREE, KIT, detail, opts);
        }

        const api = {
          cat: (THREE, K, detail, opts) => build(THREE, K, detail, opts),
          kart: (THREE, K, detail, opts) => CraterHopper(THREE, K, detail, opts),
          toonMaterial, eyeMaterial, glassMaterial, WHEEL, CAT, LEVELS, EXPR, NAMES,
          util: { sat, clamp, lerp, sstep, smin, smax, ell, E6, cap, v3, mix3, mul3, grad, Acc, mcPart, addGeo, taperTube, rayHit, onSurface, compactTail, vnoise },
        };
        root.MoonCat = api;
      })(KR);

      /* Meme Kart: BIKE TYSON FINAL (scratch, 6 Oct 2026). An original cartoon heavyweight whose body IS the bike.
       * Built from variant B ("toy": the attachment's posture, flat bar across the skull, boxing gloves with thumbs) with
       * variant A's grafts: thin waxed handlebar moustache + matte lip line, the dazed hit (crossed eyes, wobbly brows,
       * drooping moustache, wavy mouth, three spinning gold stars), the laughing closed-eye celebrate, V-brow determined,
       * hem bands on the trunks, gold wheel rims. Plus the judge's must-fixes (matte face hair, bold arm ink, ear cavity,
       * scale 0.91 into the roster's height band, phone <= 13k, round far wheels with attached gloves).
       *
       *   BikeTyson(THREE, K, detail, opts) -> THREE.Group
       *     K      = the endo marching-cubes kit ({ field, polygonize }, endo-kit.js = endo.js:197-292)
       *     detail = 'desktop' | 'phone' | 'mid' | 'far'            (budgets 26k / 13k / 5k / 1.2k: rider + vehicle)
       *     opts   = { toon: <shared gm-kart-toon material>, eyeMat: <a gm-kart-eye-dog material> }
       *   Needs DogFinal (dogs/final/dog.js) for the shared helpers and BOTH shared materials (one program each, roster-wide).
       *
       * Anatomy (owner's joke, made-up face): head at the handlebars (chrome bar clamped behind the skull, grips at the
       * temples), arms are the front fork, the red gloves are the front hub caps and the wheel spins inside his grip, spine
       * = top tube, saddle on the lower back on a short post, thighs = stays, boots on cranks at the rear hub (direct drive).
       * Face: bald egg-dome head, round button nose, thin waxed handlebar moustache, arched brows, round ears, soft round
       * chin. No face marks of any kind. Gear + chain tattoo on the arms only.
       *
       * Colour regions are separate marching-cubes meshes (skin, gloves, gold cuffs, gold trunks, red waistband, white
       * boots, saddle), so every paint line is a real edge. Eyes = separate spheres (shader iris/pupil, 2 catchlights,
       * gaze). Expressions = 4 morph targets (determined, hit, boost, celebrate): the head's MC vertices re-projected onto
       * the expression SDF (jaw, cheeks) + brows, moustache, mouth, teeth and lips rebuilt at the SAME topology; bone
       * layers on top (lids, happy arcs, crossed gaze, dizzy stars, head bob, fork shimmy, wheelie, punch, weave).
       *
       * Units metres (modelled at 1.0 then scaled by SCALE = 0.91 on a holder group), +Z forward, +Y up, origin on the ground
       * between the axles; wheelbase 1.11 m, length 1.73 m, crown 1.40 m after scaling.
       * Draw calls: skinned body, eyes, front wheel, rear wheel, crank (5). 'far' = 1 mesh + 2 wheels.
       * group.userData.racer = { set(weights), setExpression(name, instant), setGaze(x, y), look(x, y), blink(v), squash(k),
       *   kick(v), steer(v), pose({crank, lean, wheelie, punch, weave, shimmy, bob, t}), update(dt, {speed, steer, drift}),
       *   names, bones, mesh, stats }
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, exp } = Math;

        /* ------------------------------------------------------------------ the frame: one set of numbers */
        const R = 0.34, TY = 0.072;                       // wheel outer radius, tyre section radius (fat toy tyre)
        const HUBF = [0, R, 0.6], HUBR = [0, R, -0.62];
        const CRANK = 0.11, PEDX = 0.245, ANK = [0, 0.074, -0.03];
        const HC = [0, 1.215, 0.5];                        // head centre
        const SH = [0.29, 0.97, 0.38], EL = [0.315, 0.76, 0.47], WR = [0.22, 0.55, 0.585];
        const GLV = [0.165, R, 0.6];                       // glove centre (on the front hub)
        const HIP = [0.15, 0.845, -0.4], LT = 0.32, LSH = 0.32, POLE = [0, -0.25, 1];
        const FORK = [0, 0.98, 0.4];                       // the steering pivot (the chest)
        const NECKB = [0, 1.035, 0.43];                    // head bone pivot
        const CUFF = [[0.2, 0.468, 0.597], [0.23, 0.568, 0.584]];
        const SEAT = [0, 1.118, -0.36];
        const SCALE = 0.91;                                // the whole racer, so his crown sits in the roster's height band
        const STARC = [0, 1.66, 0.47];                     // dizzy-star ring centre (above the dome)

        function makeHelpers(U) {
          const { sat, clamp, sstep, smin, smax, ell, cap, v3 } = U;
          const steerAx = v3.norm(v3.sub(FORK, HUBF));
          // two-bone IK in the leg plane: knee bends toward the pole (forward and down)
          const ik = (H, T, a, b, pole) => {
            const dv = v3.sub(T, H); let d = hypot(dv[0], dv[1], dv[2]);
            const u = v3.scale(dv, 1 / (d || 1)); d = clamp(d, abs(a - b) + 1e-3, a + b - 1e-3);
            const pp = v3.norm(v3.sub(pole, v3.scale(u, v3.dot(pole, u))));
            const ca = (a * a + d * d - b * b) / (2 * a * d), sa = sqrt(max(0, 1 - ca * ca));
            const K = v3.add(v3.add(H, u, a * ca), pp, a * sa);
            return { K, A: v3.add(H, u, d) };
          };
          const pedal = (th, side) => [side * PEDX, HUBR[1] - CRANK * sin(th), HUBR[2] + CRANK * cos(th)];
          const legAt = (th, side) => { const H = [side * HIP[0], HIP[1], HIP[2]]; return Object.assign({ H, P: pedal(th, side) }, ik(H, v3.add(pedal(th, side), ANK), LT, LSH, POLE)); };
          const REST = legAt(0, 1);                       // the MC rest pose: both cranks forward (symmetric)
          const KN = REST.K, AN = REST.A;
          const shinDir = v3.norm(v3.sub(AN, KN)), thighDir = v3.norm(v3.sub(KN, HIP));
          const CALF = v3.add(v3.add(KN, shinDir, 0.11), v3.norm(v3.sub(v3.scale(POLE, -1), v3.scale(shinDir, v3.dot(v3.scale(POLE, -1), shinDir)))), 0.03);
          const BIC = v3.add(v3.lerp(SH, EL, 0.45), [0.005, 0, 0.035]);
          const capCyl = (x, y, z, A, B, r, rr) => {
            const bx = B[0] - A[0], by = B[1] - A[1], bz = B[2] - A[2], L = hypot(bx, by, bz), ux = bx / L, uy = by / L, uz = bz / L;
            const px = x - A[0], py = y - A[1], pz = z - A[2], t = px * ux + py * uy + pz * uz;
            const rad = hypot(px - ux * t, py - uy * t, pz - uz * t);
            const dx = rad - r + rr, dy = abs(t - L / 2) - L / 2 + rr;
            return min(max(dx, dy), 0) + hypot(max(dx, 0), max(dy, 0)) - rr;
          };
          const zW = (y) => -0.17 - 0.06 * (y - 0.9);

          // the SDF set for one expression (E only moves the jaw and the cheeks)
          function makeF(E) {
            const jaw = E.jaw || 0, ch = E.cheek || 0;
            const headF = (x, y, z) => {
              const ax = abs(x);
              let d = ell(x, y - 1.265, z - 0.495, 0.258, 0.275, 0.252);                                        // egg dome
              d = smin(d, ell(x, y - (1.105 - jaw * 0.5), z - 0.535, 0.185, 0.155 + jaw * 0.5, 0.19), 0.07);  // jaw
              d = smin(d, ell(ax - 0.112, y - (1.152 + ch * 0.012), z - 0.6, 0.086 + ch * 0.008, 0.075 + ch * 0.006, 0.08), 0.05);  // cheeks
              d = smin(d, ell(x, y - (0.998 - jaw), z - 0.6, 0.075, 0.05, 0.06), 0.04);                        // soft round chin
              d = smin(d, ell(x, y - 1.19, z - 0.733, 0.043, 0.038, 0.035), 0.014);                             // button nose
              let ear = ell(ax - 0.256, y - 1.2, z - 0.49, 0.034, 0.072, 0.056);
              ear = smax(ear, -ell(ax - 0.304, y - 1.2, z - 0.497, 0.01, 0.03, 0.018), 0.012);   // barely a dimple: a cupped ear read as a dark hole / spiral from the side
              return smin(d, ear, 0.022);
            };
            const neckF = (x, y, z) => cap(x, y, z, [0, 1.03, 0.42], [0, 0.97, 0.3], 0.14, 0.15);
            const torsoF = (x, y, z) => {
              const ax = abs(x);
              let d = ell(x, y - 1.02, z - 0.27, 0.27, 0.12, 0.16);                     // traps
              d = smin(d, ell(x, y - 0.89, z - 0.32, 0.27, 0.18, 0.2), 0.07);           // chest
              d = smin(d, ell(x, y - 0.86, z + 0.04, 0.235, 0.18, 0.34), 0.08);         // belly / back
              d = smin(d, ell(x, y - 0.87, z + 0.4, 0.22, 0.155, 0.17), 0.07);          // hips
              d = smin(d, ell(ax - 0.09, y - 0.885, z + 0.47, 0.12, 0.13, 0.11), 0.05); // glutes
              d = smin(d, ell(ax - 0.275, y - 0.99, z - 0.37, 0.12, 0.115, 0.12), 0.06); // delts
              return d;
            };
            const armUF = (ax, y, z) => smin(cap(ax, y, z, SH, EL, 0.095, 0.08), ell(ax - BIC[0], y - BIC[1], z - BIC[2], 0.078, 0.09, 0.078), 0.03);
            const armFF = (ax, y, z) => cap(ax, y, z, EL, WR, 0.08, 0.105);
            const thighF = (ax, y, z) => cap(ax, y, z, HIP, KN, 0.105, 0.082);
            const shinF = (ax, y, z) => smin(cap(ax, y, z, KN, AN, 0.08, 0.056), ell(ax - CALF[0], y - CALF[1], z - CALF[2], 0.06, 0.085, 0.06), 0.03);
            const limbF = (ax, y, z) => min(smin(armUF(ax, y, z), armFF(ax, y, z), 0.035), smin(thighF(ax, y, z), shinF(ax, y, z), 0.03));
            const bodyF = (x, y, z) => { const ax = abs(x); return smin(smin(torsoF(x, y, z), smin(armUF(ax, y, z), armFF(ax, y, z), 0.035), 0.05), smin(thighF(ax, y, z), shinF(ax, y, z), 0.03), 0.045); };
            const skinF = (x, y, z) => smin(smin(headF(x, y, z), neckF(x, y, z), 0.05), bodyF(x, y, z), 0.05);
            const gloveF = (x, y, z) => {
              const ax = abs(x);
              let d = ell(ax - GLV[0], y - GLV[1], z - GLV[2], 0.115, 0.14, 0.152);
              d = smin(d, cap(ax, y, z, [0.218, 0.43, 0.68], [0.128, 0.443, 0.745], 0.052, 0.045), 0.03);   // thumb
              d = smin(d, cap(ax, y, z, [0.195, 0.42, 0.6], [0.21, 0.5, 0.594], 0.094, 0.094), 0.04);        // wrist root
              return d;
            };
            const cuffF = (x, y, z) => capCyl(abs(x), y, z, CUFF[0], CUFF[1], 0.112, 0.026);
            const thighS = (ax, y, z) => (ax - HIP[0]) * thighDir[0] + (y - HIP[1]) * thighDir[1] + (z - HIP[2]) * thighDir[2];
            const trunkR = (x, y, z) => max(z - zW(y), thighS(abs(x), y, z) - 0.13);
            const trunksF = (x, y, z) => smax(bodyF(x, y, z) - 0.016, trunkR(x, y, z), 0.006);
            const bandF = (x, y, z) => smax(bodyF(x, y, z) - 0.024, abs(z - zW(y) + 0.004) - 0.034, 0.006);
            const bootF = (x, y, z) => {
              const ax = abs(x);
              let d = ell(ax - AN[0], y - (AN[1] - 0.032), z - (AN[2] + 0.05), 0.07, 0.054, 0.122);
              d = smin(d, cap(ax, y, z, v3.add(AN, [0, -0.02, 0]), v3.add(AN, v3.scale(shinDir, -0.13)), 0.075, 0.07), 0.04);
              return smax(d, (AN[1] - 0.072) - y, 0.012);
            };
            const saddleF = (x, y, z) => smin(ell(x, y - SEAT[1], z - SEAT[2], 0.105, 0.036, 0.11), cap(x, y, z, [0, SEAT[1], -0.32], [0, SEAT[1] - 0.006, -0.18], 0.042, 0.026), 0.04);
            return { headF, neckF, torsoF, armUF, armFF, thighF, shinF, limbF, bodyF, skinF, gloveF, cuffF, trunksF, bandF, bootF, saddleF, trunkR };
          }
          return { steerAx, ik, pedal, legAt, REST, KN, AN, shinDir, thighDir, BIC, makeF, zW, capCyl };
        }

        /* ------------------------------------------------------------------ expressions (base = confident neutral) */
        // must = moustache [dy, tips up, droop]; bwob = wobbly brows; happy = closed laughing eyes (arcs); stars = dizzy ring
        const X = (o) => Object.assign({
          jaw: 0, cheek: 0.3, brow: { y: 0, arch: 0.012, tilt: -0.004 }, bwob: 0, must: [0, 0.3, 0],
          mouth: { w: 0.066, dy: 0, smile: 0.008, skew: 0, open: 0, guard: 0, wob: 0 },
          lidU: 0.62, lidLo: -1.0, gaze: [0, 0.02], gazeX: 0, pupil: 0.2, iris: 0.42, spark: 0, pitch: 0, roll: 0, happy: 0, stars: 0,
        }, o);
        const EXPR = {
          neutral: X({}),
          determined: X({ cheek: 0.15, brow: { y: -0.02, arch: 0.0, tilt: 0.062 }, must: [-0.004, 0, 0.1], mouth: { w: 0.06, dy: 0.002, smile: -0.006, skew: 0.014, open: 0.0, guard: 0, wob: 0 },
            lidU: 0.12, lidLo: -0.8, gaze: [0, -0.02], pupil: 0.22, iris: 0.42, pitch: 0.08 }),
          hit: X({ jaw: 0.02, cheek: 0, brow: { y: 0.03, arch: 0.03, tilt: -0.02 }, bwob: 1, must: [-0.004, 0, 1], mouth: { w: 0.056, dy: -0.004, smile: -0.01, skew: 0, open: 0.032, guard: 0, wob: 0.0035 },
            lidU: 0.7, lidLo: -1.05, gaze: [0, 0.05], gazeX: 0.42, pupil: 0.18, iris: 0.4, roll: 0.14, stars: 1 }),   // normal-size eyes: the crossed gaze + stars carry the daze
          boost: X({ jaw: 0.01, cheek: 1, brow: { y: 0.01, arch: 0.018, tilt: 0.016 }, must: [0.012, 1, 0], mouth: { w: 0.086, dy: 0.002, smile: 0.034, skew: 0.004, open: 0.034, guard: 1, wob: 0 },
            lidU: 0.26, lidLo: -0.66, gaze: [0.28, 0.0], pupil: 0.22, iris: 0.42, spark: 0.4, roll: -0.08 }),
          celebrate: X({ jaw: 0.04, cheek: 1, brow: { y: 0.034, arch: 0.026, tilt: -0.012 }, must: [0.016, 1.2, 0], mouth: { w: 0.084, dy: 0, smile: 0.03, skew: 0, open: 0.074, guard: 0.55, wob: 0 },
            lidU: 0.85, lidLo: -1.12, gaze: [-0.1, 0.32], pupil: 0.24, iris: 0.46, spark: 1, pitch: -0.12, happy: 1 }),
        };
        const NAMES = ['determined', 'hit', 'boost', 'celebrate'];

        const LEVELS = {
          desktop: { skin: 0.0305, glove: 0.027, cuff: 0.031, trunk: 0.03, boot: 0.026, sad: 0.024, eye: [20, 11], lid: [16, 6], tube: 7, brow: 10, st: 14, mc: 15, mr: 3, wheel: [8, 36], rim: [6, 36], spokes: 5, bar: 10, tat: true, chain: 12, gear: 20, hem: 24, star: true, morph: true },
          phone:   { skin: 0.045, glove: 0.039, cuff: 0.042, trunk: 0.043, boot: 0.037, sad: 0.035, eye: [14, 8], lid: [10, 4], tube: 5, brow: 7, st: 10, mc: 11, mr: 2, wheel: [6, 24], rim: [4, 24], spokes: 5, bar: 7, tat: true, chain: 0, gear: 12, hem: 18, star: true, morph: true },
          mid:     { skin: 0.077, glove: 0.064, cuff: 0.066, trunk: 0.072, boot: 0.062, sad: 0.058, eye: [9, 5], lid: [6, 3], tube: 4, brow: 5, st: 7, mc: 7, mr: 1, wheel: [5, 14], rim: [3, 14], spokes: 0, bar: 4, tat: false, chain: 0, gear: 0, hem: 10, star: false, morph: true },
          far:     { far: true },
        };

        const BONES = ['root', 'body', 'fork', 'head', 'lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'armUL', 'armFL', 'handL', 'armUR', 'armFR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
        const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
        const PARENT = { body: 'root', fork: 'body', head: 'fork', lidL: 'head', lidR: 'head', lowL: 'head', lowR: 'head', arcL: 'head', arcR: 'head', armUL: 'fork', armFL: 'armUL', handL: 'armFL', armUR: 'fork', armFR: 'armUR', handR: 'armFR', thighL: 'body', shinL: 'thighL', footL: 'shinL', thighR: 'body', shinR: 'thighR', footR: 'shinR' };

        function palette(THREE) {
          const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
          return {
            // lips: a natural deep brown-mauve just darker + a touch cooler than the skin, matte (never red / pink)
            skin: c('#8A5236'), skinHi: c('#A3623F'), skinDk: c('#633626'), blush: c('#9A4A3A'), lip: c('#5A3426'), arc: c('#5A2C20'),
            glove: c('#D7263D'), gloveHi: c('#F04A5C'), gloveDk: c('#A61A2E'), gold: c('#FFC93C'), goldDk: c('#D99A1E'),
            trunk: c('#FFC93C'), trunkDk: c('#E0A428'), band: c('#D7263D'), boot: c('#F4F0E8'), bootDk: c('#D9D2C6'), sole: c('#D7263D'),
            chrome: c('#DDE3EA'), chromeDk: c('#9AA3AE'), tyre: c('#1E1D24'), tyreHi: c('#34333C'), grip: c('#24222A'), saddle: c('#2A2327'), saddleHi: c('#4A3E44'),
            // mouth: dark warm interior, a dark-pink tongue only at the bottom of an open mouth, warm off-white teeth
            hair: c('#24150F'), hairHi: c('#4A2E20'), mouth: c('#3A1A16'), tongue: c('#6E343A'), teeth: c('#F4EFE6'), teethDk: c('#DCD3C5'),
            ink: c('#1A1726'), white: c('#F4EFE6'), star: c('#FFD54A'),
          };
        }

        /* ------------------------------------------------------------------ build */
        function build(THREE, KIT, detail, opts) {
          opts = opts || {};
          const D = root.DogFinal; if (!D) throw new Error('BikeTyson needs DogFinal (dog.js) for the shared helpers and materials');
          const U = D.util, { sat, clamp, lerp, sstep, smin, smax, ell, cap, v3, mix3, mul3, grad, Acc, mcPart, addGeo, taperTube, rayHit } = U;
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop;
          const H = makeHelpers(U), C = palette(THREE);
          const toon = opts.toon || D.toonMaterial(THREE, {});
          const F = H.makeF(EXPR.neutral);
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const K = { skin: [0.45, 1, 0, 1], glove: [0.3, 0.35, 0, 1], gold: [0.26, 0.15, 0, 1], satin: [0.42, 0.3, 0, 1], chrome: [0.13, 0, 0, 1], rubber: [0.86, 0, 0, 1], saddle: [0.55, 0.2, 0, 1], hair: [0.62, 0, 4, 1], line: [0.75, 0, 4, 0.8], mouth: [0.7, 0, 4, 1], ink: [0.7, 0, 4, 1], star: [0.3, 0.2, 0, 1], boot: [0.4, 0.3, 0, 1] };
          const stats = { parts: {}, level: detail };
          if (LV.far) return buildFar(THREE, H, F, C, K, toon, U, T0, now, stats);

          const acc = new Acc();
          let mark = 0;
          const done = (name) => { stats.parts[name] = (stats.parts[name] || 0) + (acc.I.length - mark) / 3; mark = acc.I.length; };
          const ALL = (x, y, z) => min(min(F.skinF(x, y, z), F.gloveF(x, y, z)), min(F.trunksF(x, y, z), F.saddleF(x, y, z)));
          const aoStep = detail === 'mid' ? 0.035 : 0.02;
          const aoAt = (x, y, z, nx, ny, nz) => {
            let occ = 0;
            for (let s = 1; s <= 4; s++) { const hs = s * aoStep; occ += max(0, 1 - ALL(x + nx * hs, y + ny * hs, z + nz * hs) / hs) / s; }
            return sat(1 - 0.55 * max(0, occ - 0.12));
          };
          const shade = (c, ao, lo) => { const k = lo + (1 - lo) * ao; return [c[0] * k, c[1] * k * (0.97 + 0.03 * k), c[2] * k * (0.9 + 0.1 * k)]; };
          const setAO = (r) => { for (let v = r.v0; v < r.v1; v++) { const ao = aoAt(acc.P[3 * v], acc.P[3 * v + 1], acc.P[3 * v + 2], acc.N[3 * v], acc.N[3 * v + 1], acc.N[3 * v + 2]); acc.K[4 * v + 3] = ao; const k = 0.55 + 0.45 * ao; acc.C[3 * v] *= k; acc.C[3 * v + 1] *= k * (0.97 + 0.03 * k); acc.C[3 * v + 2] *= k * (0.9 + 0.1 * k); } };

          /* ---- skin weights: nearest two body parts, blended over 5 cm */
          const skinBW = (x, y, z) => {
            const ax = abs(x), sd = x >= 0 ? 'L' : 'R';
            const c = [
              [F.headF(x, y, z), BI.head], [F.neckF(x, y, z) + 0.01, BI.head], [F.torsoF(x, y, z), BI.body],
              [F.armUF(ax, y, z), BI['armU' + sd]], [F.armFF(ax, y, z), BI['armF' + sd]], [F.thighF(ax, y, z), BI['thigh' + sd]], [F.shinF(ax, y, z), BI['shin' + sd]],
            ];
            c.sort((a, b) => a[0] - b[0]);
            let j = 1; while (j < c.length && c[j][1] === c[0][1]) j++;
            if (j >= c.length) return [c[0][1], c[0][1], 0];
            const f = 0.5 * sat(1 - (c[j][0] - c[0][0]) / 0.05);
            return [c[0][1], c[j][1], f];
          };
          const setBW = (r, fn) => { for (let v = r.v0; v < r.v1; v++) { const w = fn(acc.P[3 * v], acc.P[3 * v + 1], acc.P[3 * v + 2]); acc.B[3 * v] = w[0]; acc.B[3 * v + 1] = w[1]; acc.B[3 * v + 2] = w[2]; } };
          const handBW = (x) => [x >= 0 ? BI.handL : BI.handR, 0, 0];
          const bootBW = (x, y, z) => { const sd = x >= 0 ? 'L' : 'R', f = sstep(H.AN[1] + 0.0, H.AN[1] + 0.06, y); return [BI['foot' + sd], BI['shin' + sd], f]; };

          /* ---- skin (head + body, one smooth surface), with the hidden parts under gloves/trunks/boots culled */
          const skinCol = (x, y, z, nx, ny, nz) => {
            let c = mix3(C.skinDk, C.skin, sstep(-0.8, 0.1, ny));
            c = mix3(c, C.skinHi, sstep(0.3, 1, ny) * 0.55);
            const ax = abs(x);
            const blush = sat(1 - hypot((ax - 0.13) / 0.06, (y - 1.17) / 0.04)) * sstep(0.55, 0.62, z);
            c = mix3(c, C.blush, blush * 0.5);
            // inner ear: a soft warm patch painted in (instead of a deep cavity)
            if (ax > 0.24) c = mix3(c, C.blush, 0.45 * sat(1 - hypot((y - 1.2) / 0.04, (z - 0.497) / 0.028)) * sstep(0.27, 0.285, ax));
            return c;
          };
          const keepSkin = (x, y, z) => F.trunksF(x, y, z) > -0.004 && F.gloveF(x, y, z) > -0.006 && F.cuffF(x, y, z) > -0.006 && F.bootF(x, y, z) > -0.006;
          let t = now();
          const skinR = mcPart(KIT, acc, F.skinF, [-0.43, 0.22, -0.68, 0.43, 1.56, 0.83], LV.skin, true, skinCol, keepSkin, K.skin, BI.body);
          setBW(skinR, skinBW); setAO(skinR); done('skin');
          stats.skinMs = Math.round(now() - t);
          const headV = []; for (let v = skinR.v0; v < skinR.v1; v++) if (acc.B[3 * v] === BI.head && acc.P[3 * v + 1] > 0.92) headV.push(v);

          /* ---- gloves (red) + gold cuffs, rigid on the hands */
          const gloveCol = (x, y, z, nx, ny, nz) => mix3(mix3(C.gloveDk, C.glove, sstep(-0.7, 0.2, ny)), C.gloveHi, sstep(0.4, 1, ny) * 0.35);
          const gR = mcPart(KIT, acc, F.gloveF, [-0.32, 0.16, 0.4, 0.32, 0.64, 0.82], LV.glove, true, gloveCol, (x, y, z) => F.cuffF(x, y, z) > -0.006, K.glove, 0);
          setBW(gR, handBW); setAO(gR); done('gloves');
          const cR = mcPart(KIT, acc, F.cuffF, [-0.38, 0.38, 0.45, 0.38, 0.68, 0.74], LV.cuff, true, (x, y, z, nx, ny) => mix3(C.goldDk, C.gold, sstep(-0.6, 0.3, ny)), null, K.gold, 0);
          setBW(cR, handBW); setAO(cR); done('cuffs');

          /* ---- gold trunks + red waistband */
          const tR = mcPart(KIT, acc, F.trunksF, [-0.32, 0.6, -0.68, 0.32, 1.08, -0.08], LV.trunk, true, (x, y, z, nx, ny) => {
            let c = mix3(C.trunkDk, C.trunk, sstep(-0.6, 0.3, ny));
            return c;
          }, (x, y, z) => F.bandF(x, y, z) > -0.004, K.satin, 0);
          setBW(tR, skinBW); setAO(tR); done('trunks');
          const bR = mcPart(KIT, acc, F.bandF, [-0.3, 0.62, -0.32, 0.3, 1.1, 0.0], LV.trunk, true, (x, y, z, nx, ny) => mix3(C.gloveDk, C.band, sstep(-0.6, 0.3, ny)), null, K.glove, 0);
          setBW(bR, skinBW); setAO(bR); done('band');
          // hem bands: a red rolled hem round each trunk leg opening (hides the marching-cubes cut, echoes the waistband)
          {
            const d = H.thighDir, e1 = v3.norm(v3.cross(d, [1, 0, 0])), e2 = v3.cross(d, e1), n = LV.hem;
            for (const s of [1, -1]) {
              const X = (p) => [s * p[0], p[1], p[2]];
              const c = v3.add(HIP, d, 0.125), ring = [], nr = [];
              for (let i = 0; i < n; i++) {
                const a = (i / n) * PI * 2, dir = v3.add(v3.scale(e1, cos(a)), e2, sin(a));
                const h = rayHit(F.trunksF, c, dir, 0, 0.17, 24);
                const r = h ? hypot(...v3.sub(h, c)) : 0.112;
                ring.push(X(v3.add(c, dir, min(r, 0.135) + 0.002))); nr.push(X(dir));
              }
              if (s < 0) { ring.reverse(); nr.reverse(); }
              const rr = ring.map(() => 0.017), rz = ring.map(() => 0.012);
              addGeo(THREE, acc, taperTube(THREE, ring, rz, rr, max(3, min(4, LV.tube - 1)), (i) => X(d), false, true), M4(),
                (x, y, z, nx, ny) => mix3(C.gloveDk, C.band, sstep(-0.6, 0.4, ny)), K.glove, skinBW);
            }
            done('hem');
          }

          /* ---- white boxing boots with red soles, on the pedals */
          const btR = mcPart(KIT, acc, F.bootF, [-0.36, 0.22, -0.72, 0.36, 0.62, -0.32], LV.boot, true, (x, y, z, nx, ny) => {
            const c = mix3(C.bootDk, C.boot, sstep(-0.6, 0.3, ny));
            return mix3(c, C.sole, sstep(H.AN[1] - 0.05, H.AN[1] - 0.056, y));
          }, null, K.boot, 0);
          setBW(btR, bootBW); setAO(btR); done('boots');
          // pedals under the boots (on the foot bones: they stay level, the crank arms meet them at the axle)
          for (const s of [1, -1]) {
            const pp = v3.sub(H.AN, ANK);
            const bw = () => [s > 0 ? BI.footL : BI.footR, 0, 0];
            addGeo(THREE, acc, new THREE.BoxGeometry(0.11, 0.022, 0.09), M4().makeTranslation(s * pp[0], pp[1], pp[2]), C.grip, K.rubber, bw);
            addGeo(THREE, acc, new THREE.BoxGeometry(0.114, 0.008, 0.094), M4().makeTranslation(s * pp[0], pp[1] + 0.008, pp[2]), C.gold, K.gold, bw);
          }
          done('pedals');

          /* ---- saddle on the lower back + chrome post */
          const sR = mcPart(KIT, acc, F.saddleF, [-0.14, 1.04, -0.52, 0.14, 1.2, -0.12], LV.sad, true, (x, y, z, nx, ny) => mix3(C.saddle, C.saddleHi, sstep(0.5, 1, ny) * 0.5), null, K.saddle, BI.body);
          setAO(sR);
          addGeo(THREE, acc, new THREE.CylinderGeometry(0.022, 0.024, 0.12, max(6, LV.bar), 1), M4().makeTranslation(0, 1.04, SEAT[2] + 0.01), C.chrome, K.chrome, BI.body);
          done('saddle');

          /* ---- handlebars: clamped behind the skull, grips at the temples, brake levers, gold bar-end caps */
          {
            const pts = [];
            const half = [[0.465, 1.352, 0.575], [0.41, 1.35, 0.545], [0.36, 1.347, 0.49], [0.31, 1.343, 0.4], [0.245, 1.338, 0.31], [0.13, 1.333, 0.222], [0, 1.33, 0.2]];
            for (let i = 0; i < half.length; i++) pts.push([-half[i][0], half[i][1], half[i][2]]);
            for (let i = half.length - 2; i >= 0; i--) pts.push(half[i]);
            const curve = new THREE.CatmullRomCurve3(pts.map(V)), n = LV.bar * 3, sp = [];
            for (let i = 0; i <= n; i++) { const p = curve.getPoint(0.05 + 0.9 * i / n); sp.push([p.x, p.y, p.z]); }
            addGeo(THREE, acc, taperTube(THREE, sp, sp.map(() => 0.021), sp.map(() => 0.021), max(6, LV.bar), [0, 1, 0], true), M4(), C.chrome, K.chrome, BI.head);
            for (const s of [1, -1]) {
              const a = [s * 0.37, 1.348, 0.522], b = [s * 0.48, 1.353, 0.582];
              addGeo(THREE, acc, taperTube(THREE, [a, b], [0.032, 0.032], [0.032, 0.032], max(8, LV.bar), [0, 1, 0], true), M4(), C.grip, K.rubber, BI.head);
              addGeo(THREE, acc, new THREE.SphereGeometry(0.03, max(8, LV.bar), max(4, LV.bar >> 1)), M4().compose(V(v3.add(b, v3.norm(v3.sub(b, a)), 0.006)), new THREE.Quaternion(), V([1, 1, 1])), C.gold, K.gold, BI.head);
              if (LV.rim[0]) addGeo(THREE, acc, taperTube(THREE, [[s * 0.34, 1.36, 0.47], [s * 0.38, 1.335, 0.56], [s * 0.43, 1.31, 0.625]], [0.009, 0.008, 0.007], [0.012, 0.011, 0.009], 5, [0, 1, 0], true), M4(), C.chrome, K.chrome, BI.head);
            }
            const st = [[0, 1.33, 0.2], [0, 1.25, 0.18], [0, 1.16, 0.2], [0, 1.09, 0.24]];
            addGeo(THREE, acc, taperTube(THREE, st, [0.024, 0.024, 0.026, 0.03], [0.024, 0.024, 0.026, 0.03], max(6, LV.bar), [1, 0, 0], false), M4(), C.chrome, K.chrome, BI.head);
            addGeo(THREE, acc, new THREE.CylinderGeometry(0.036, 0.036, 0.09, max(8, LV.bar), 1).rotateZ(PI / 2), M4().makeTranslation(0, 1.33, 0.2), C.gold, K.gold, BI.head);
          }
          done('handlebar');

          /* ---- tattoos (arms only): a gear on the outer upper arm, a chain wrapping the forearm. Ink lies on the skin. */
          const onSkin = (p, lift) => {
            let [x, y, z] = p; const g = [0, 0, 0];
            for (let i = 0; i < 6; i++) { const d = F.skinF(x, y, z); grad(F.skinF, x, y, z, 0.003, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; }
            grad(F.skinF, x, y, z, 0.003, g); return { p: [x + g[0] * lift, y + g[1] * lift, z + g[2] * lift], n: g.slice() };
          };
          if (LV.tat) {
            // BOLD ink (the B round read as specks): one big gear on the outer upper arm; on desktop a chain band round
            // the forearm (interlocking links, face-on ovals + edge-on bars). Matte ink on the skin, skinned with the arm.
            const R3 = 3;
            for (const s of [1, -1]) {
              const ink = (pts, w, closed) => { const q = pts.map((p) => onSkin(p, 0.0018)); addGeo(THREE, acc, taperTube(THREE, q.map((o) => o.p), q.map(() => w), q.map(() => 0.0014), R3, (i) => q[i].n, !closed, closed), M4(), C.ink, K.ink, skinBW); };
              const c0 = onSkin([s * (lerp(SH[0], EL[0], 0.45) + 0.1), lerp(SH[1], EL[1], 0.45), lerp(SH[2], EL[2], 0.45) - 0.012], 0);
              const a = v3.norm(v3.sub(EL, SH)), ax = [s * a[0], a[1], a[2]], b = v3.norm(v3.cross(c0.n, ax)), a2 = v3.cross(b, c0.n);
              const ring = (r, n) => { const P = []; for (let i = 0; i < n; i++) { const t = (i / n) * PI * 2; P.push(v3.add(v3.add(c0.p, a2, cos(t) * r), b, sin(t) * r)); } return P; };
              ink(ring(0.033, LV.gear), 0.0075, true); ink(ring(0.011, max(8, LV.gear >> 1)), 0.0055, true);
              for (let i = 0; i < 8; i++) { const t = (i / 8) * PI * 2, d = v3.add(v3.scale(a2, cos(t)), b, sin(t)); ink([v3.add(c0.p, d, 0.037), v3.add(c0.p, d, 0.05)], 0.011, false); }
              if (LV.chain) {
                const fa = v3.norm(v3.sub(WR, EL)), fA = [s * fa[0], fa[1], fa[2]], ctr = v3.lerp([s * EL[0], EL[1], EL[2]], [s * WR[0], WR[1], WR[2]], 0.42);
                const u0 = v3.norm(v3.cross(fA, [0, 0, 1])), u1 = v3.cross(fA, u0);
                for (let i = 0; i < LV.chain; i++) {
                  const th = (i / LV.chain) * PI * 2, q = onSkin(v3.add(v3.add(ctr, u0, cos(th) * 0.13), u1, sin(th) * 0.13), 0);
                  const tg = v3.norm(v3.cross(q.n, fA)), bn = fA;
                  if (i % 2 === 0) { const P = []; for (let k = 0; k < 8; k++) { const t2 = (k / 8) * PI * 2; P.push(v3.add(v3.add(q.p, tg, cos(t2) * 0.0175), bn, sin(t2) * 0.0105)); } ink(P, 0.0042, true); }
                  else ink([v3.add(q.p, tg, -0.016), v3.add(q.p, tg, 0.016)], 0.0058, false);
                }
              }
            }
            done('tattoos');
          }

          /* ---- eyes (placement), lids */
          const g0 = [0, 0, 0], eyeR = 0.061;
          const eyeAt = (side) => {
            const p = rayHit(F.headF, [side * 0.09, 1.258, 1.2], [0, 0, -1], 0, 0.8);
            grad(F.headF, p[0], p[1], p[2], 0.002, g0);
            const dir = v3.norm(v3.lerp(g0, [side * 0.1, 0.03, 1], 0.6));
            return { c: v3.add(p, dir, -(eyeR - 0.031)), dir };
          };
          const EYE = { L: eyeAt(1), R: eyeAt(-1) };
          const qFrom = (dir) => {
            // eye frame: +Z = gaze direction, +Y close to world up (so lids rotate about a level axis)
            const z = v3.norm(dir), xx = v3.norm(v3.cross([0, 1, 0], z)), y = v3.cross(z, xx);
            return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(xx), V(y), V(z)));
          };
          const eyeQ = (side) => qFrom(side > 0 ? EYE.L.dir : EYE.R.dir);
          {
            const lidR = eyeR + 0.0045;
            const upG = new THREE.SphereGeometry(lidR, LV.lid[0], LV.lid[1], 0, PI * 2, 0, PI / 2);
            const loG = new THREE.SphereGeometry(lidR - 0.0015, LV.lid[0], max(3, LV.lid[1] - 2), 0, PI * 2, PI / 2, PI / 2);
            const rimG = new THREE.TorusGeometry(lidR - 0.001, 0.0048, 4, LV.lid[0] + 4, PI).rotateX(PI / 2);
            // happy arcs (closed laughing eyes, variant A's): a dark crescent on the shut lid, scaled in by its bone
            const nA = max(6, LV.lid[0] >> 1), arcPts = [];
            for (let i = 0; i <= nA; i++) { const u = -1 + 2 * i / nA; arcPts.push(v3.scale(v3.norm([0.66 * u, -0.1 + 0.36 * (1 - u * u), 1]), lidR + 0.003)); }
            const arcRr = arcPts.map((_, i) => 0.0105 * (0.4 + 0.6 * sin(PI * i / nA)));
            const arcG = taperTube(THREE, arcPts, arcRr, arcRr, 4, [0, 0, 1], true);
            for (const side of [1, -1]) {
              const sfx = side > 0 ? 'L' : 'R', E = side > 0 ? EYE.L : EYE.R, m = M4().compose(V(E.c), eyeQ(side), V([1, 1, 1]));
              addGeo(THREE, acc, upG, m, (x, y) => mix3(mix3(C.skinDk, C.skin, 0.55), C.skin, sstep(0, lidR * 0.7, y)), [0.5, 1, 0, 0.72], BI['lid' + sfx]);   // same tone as the face (a lighter lid read as goggles when shut)
              addGeo(THREE, acc, rimG, m, C.skinDk, [0.5, 0.4, 0, 0.7], BI['lid' + sfx]);
              addGeo(THREE, acc, loG, m, (x, y) => shade(C.skin, 0.92, 1), K.skin, BI['low' + sfx]);
              addGeo(THREE, acc, arcG, m, C.arc, K.line, BI['arc' + sfx]);
            }
          }
          done('lids');

          /* ---- the face parts an expression changes (fixed topology) */
          const faceAt = (f, x, y, lift, g) => {
            const p = rayHit(f, [x, y, 1.2], [0, 0, -1], 0, 0.8, 48) || [x, y, 0.7];
            grad(f, p[0], p[1], p[2], 0.002, g); return v3.add(p, g, lift);
          };
          function buildFace(A, E, FE) {
            const hf = FE.headF, g = [0, 0, 0];
            const tube = (pts2, rx, ry, col, k, capEnds, lift) => {
              const P = [], N = [];
              for (let i = 0; i < pts2.length; i++) { const p = faceAt(hf, pts2[i][0], pts2[i][1], (lift || 0.6) * ry[i], g); P.push(p); N.push(g.slice()); }
              addGeo(THREE, A, taperTube(THREE, P, rx, ry, LV.tube, (i) => N[i], capEnds), M4(), col, k, BI.head);
            };
            // brows: thick arcs, inner end lower when determined
            for (const s of [1, -1]) {
              const n = LV.brow, P = [], rx = [], ry = [];
              for (let i = 0; i < n; i++) {
                const u = i / (n - 1);
                P.push([s * (0.03 + 0.13 * u), 1.322 + E.brow.y + E.brow.arch * 4 * u * (1 - u) + E.brow.tilt * (u - 0.5) + E.bwob * 0.008 * sin(u * PI * 3 + (s > 0 ? 0 : 1.2))]);
                const w = 0.6 + 0.4 * sin(PI * (0.12 + 0.76 * u)) - 0.25 * u; rx.push(0.0158 * w); ry.push(0.008 * w);
              }
              tube(P, rx, ry, (x, y, z, nx, ny) => mix3(C.hair, C.hairHi, sstep(0.3, 1, ny) * 0.4), K.hair, true);
            }
            // the handlebar moustache (variant A's): two thin waxed strokes from the philtrum, tips curling up (droop when
            // dazed). Matte zone so the rim light leaves no seam; the mouth stays visible below it.
            {
              const mu = E.must, my = 1.128 + mu[0], up = mu[1], dr = mu[2], nM = LV.st;
              const c2 = [[-0.01, my + 0.007], [0.034, my + 0.004], [0.068, my - 0.006 - 0.01 * dr], [0.098, my - 0.008 - 0.024 * dr + 0.004 * up], [0.121, my + 0.002 - 0.036 * dr + 0.011 * up], [0.13, my + 0.02 - 0.036 * dr + 0.014 * up], [0.121, my + 0.031 - 0.032 * dr + 0.014 * up]];
              const R0 = [0.015, 0.02, 0.018, 0.0135, 0.0095, 0.007, 0.005];
              for (const side of [1, -1]) {
                const pts = c2.map(([x, y], i) => faceAt(hf, side * x, y, R0[i] * 0.5, g));
                const sp = new THREE.CatmullRomCurve3(pts.map(V), false, 'catmullrom', 0.5).getPoints(nM).map((q) => [q.x, q.y, q.z]);
                const rr = sp.map((_, i) => { const u = i / nM * 6, k = Math.floor(min(5.999, u)); return lerp(R0[k], R0[k + 1], u - k); });
                addGeo(THREE, A, taperTube(THREE, sp, rr, rr.map((r) => r * 0.62), LV.tube, [0, 0, 1], true), M4(), (x, y, z, nx, ny) => mix3(C.hair, C.hairHi, sstep(0.2, 0.9, ny) * 0.55), K.hair, BI.head);
              }
            }
            // the mouth: interior decal + upper-teeth decal + lower lip, all on the face surface
            {
              const M = E.mouth, n = LV.mc, top = [], bot = [], grd = [];
              for (let i = 0; i < n; i++) {
                const xn = -1 + 2 * i / (n - 1), x = xn * M.w, sk = M.skew * xn;
                const ty = 1.074 + M.dy + M.smile * xn * xn + sk + M.wob * sin(xn * 7.5);
                const q = Math.pow(sat(1 - xn * xn), 0.6);
                top.push([x, ty]); bot.push([x * (1 - 0.08 * M.open / 0.07), ty - M.open * q - 0.0016]);
                grd.push([x * 0.94, ty - (0.003 + min(M.open * 0.62, 0.03)) * M.guard * Math.pow(sat(1 - xn * xn), 0.4)]);
              }
              const grid = (cA, cB, rows, lift, col, k) => {
                const P = [], N = [], I = [], cols = cA.length;
                for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) {
                  const u = r / rows, x = lerp(cA[c][0], cB[c][0], u), y = lerp(cA[c][1], cB[c][1], u);
                  const p = faceAt(hf, x, y, lift, g); P.push(p[0], p[1], p[2]); N.push(g[0], g[1], g[2]);
                }
                for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; I.push(a, d, b, b, d, e); }
                const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setIndex(I);
                addGeo(THREE, A, geo, M4(), col, k, BI.head);
              };
              // interior colour by grid ROW (vertex colours come from the closed neutral mouth, so a y test tinted it all):
              // dark warm everywhere, a dark-pink tongue only on the bottom rows' centre (hidden while the mouth is shut)
              grid(top, bot, LV.mr, 0.0022, (x, y, z, nx, ny, nz, i) => { const u = Math.floor(i / n) / LV.mr, xn = -1 + 2 * (i % n) / (n - 1); return mix3(C.mouth, C.tongue, 0.75 * sstep(0.6, 1, u) * sat(1 - abs(xn) / 0.7)); }, K.mouth);
              // the upper teeth (the 'guard' amount = how much they show): warm off-white, faint tooth separations
              grid(top, grd, 1, -0.004 + 0.0074 * min(1, M.guard * 4), (x, y) => mix3(C.teethDk, C.teeth, 0.6 + 0.4 * cos(x * 160) ** 2), [0.42, 0, 0, 1]);
              const lp = bot.map((p, i) => [p[0], p[1] - 0.004 - 0.003 * Math.pow(sat(1 - (2 * i / (n - 1) - 1) ** 2), 0.5)]);
              tube(lp.slice(1, n - 1), lp.slice(1, n - 1).map((p, i, a) => 0.0068 * (0.45 + 0.55 * sin(PI * (i + 0.5) / a.length))), lp.slice(1, n - 1).map((p, i, a) => 0.0058 * (0.45 + 0.55 * sin(PI * (i + 0.5) / a.length))), mix3(C.lip, C.skinDk, 0.35), K.line, true, 0.3);
              // the upper lip line (matte): the mouth reads even when closed (neutral / determined smirk)
              const tl = top.map((p) => [p[0], p[1] + 0.001]);
              tube(tl, tl.map((p, i) => 0.0046 * (0.5 + 0.5 * sin(PI * i / (n - 1)))), tl.map((p, i) => 0.0036 * (0.5 + 0.5 * sin(PI * i / (n - 1)))), C.lip, K.line, true, 0.4);
            }
          }
          const fc0 = acc.n;
          buildFace(acc, EXPR.neutral, F);
          const fc1 = acc.n; done('face');
          stats.accMs = Math.round(now() - t);

          /* ---- geometry + skin */
          const nv = acc.n;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
          for (let v = 0; v < nv; v++) { SI[4 * v] = acc.B[3 * v]; SI[4 * v + 1] = acc.B[3 * v + 1]; const f = acc.B[3 * v + 2]; SW[4 * v] = 1 - f; SW[4 * v + 1] = f; }
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
          geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));

          /* ---- morph targets */
          t = now();
          const names = [];
          if (LV.morph && !(typeof window !== 'undefined' && window.KartDiag && window.KartDiag.nomorph)) {
            geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
            const g = [0, 0, 0], f0 = F.skinF;
            for (const name of NAMES) {
              const E = EXPR[name], FE = H.makeF(E), fE = FE.skinF;
              const dP = new Float32Array(nv * 3), dN = new Float32Array(nv * 3);
              if (E.jaw !== EXPR.neutral.jaw || E.cheek !== EXPR.neutral.cheek) for (const v of headV) {
                let x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
                if (y > 1.3 || z < 0.38) continue;
                const lvl = f0(x, y, z); let d = fE(x, y, z) - lvl;
                if (abs(d) < 2e-5) continue;
                for (let it = 0; it < 4 && abs(d) > 1e-5; it++) { grad(fE, x, y, z, 0.0015, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; d = fE(x, y, z) - lvl; }
                grad(fE, x, y, z, 0.002, g);
                let ddx = x - acc.P[3 * v], ddy = y - acc.P[3 * v + 1], ddz = z - acc.P[3 * v + 2]; const l = hypot(ddx, ddy, ddz);
                if (l > 0.05) { ddx *= 0.05 / l; ddy *= 0.05 / l; ddz *= 0.05 / l; }
                dP[3 * v] = ddx; dP[3 * v + 1] = ddy; dP[3 * v + 2] = ddz;
                dN[3 * v] = g[0] - acc.N[3 * v]; dN[3 * v + 1] = g[1] - acc.N[3 * v + 1]; dN[3 * v + 2] = g[2] - acc.N[3 * v + 2];
              }
              const A = new Acc(); buildFace(A, E, FE);
              if (A.n !== fc1 - fc0) throw new Error('face topology changed for ' + name);
              for (let i = 0; i < A.n; i++) { const v = fc0 + i; for (let q = 0; q < 3; q++) { dP[3 * v + q] = A.P[3 * i + q] - acc.P[3 * v + q]; dN[3 * v + q] = A.N[3 * i + q] - acc.N[3 * v + q]; } }
              geo.morphAttributes.position.push(new THREE.Float32BufferAttribute(dP, 3));
              geo.morphAttributes.normal.push(new THREE.Float32BufferAttribute(dN, 3));
              names.push(name);
            }
            geo.morphTargetsRelative = true;
          }
          stats.morphMs = Math.round(now() - t);
          geo.computeBoundingSphere();

          /* ---- skeleton (rest = world-aligned, except the lid bones which carry the eye frames) */
          const REST = {
            root: [0, 0, 0], body: [0, 0.88, 0], fork: FORK, head: NECKB, lidL: EYE.L.c, lidR: EYE.R.c, lowL: EYE.L.c, lowR: EYE.R.c, arcL: EYE.L.c, arcR: EYE.R.c,
            armUL: SH, armFL: EL, handL: WR, armUR: [-SH[0], SH[1], SH[2]], armFR: [-EL[0], EL[1], EL[2]], handR: [-WR[0], WR[1], WR[2]],
            thighL: HIP, shinL: H.KN, footL: H.AN, thighR: [-HIP[0], HIP[1], HIP[2]], shinR: [-H.KN[0], H.KN[1], H.KN[2]], footR: [-H.AN[0], H.AN[1], H.AN[2]],
          };
          const LOCALQ = { lidL: eyeQ(1), lidR: eyeQ(-1), lowL: eyeQ(1), lowR: eyeQ(-1), arcL: eyeQ(1), arcR: eyeQ(-1) };
          const bones = {}, list = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; return b; });
          const worldQ = {};
          BONES.forEach((n) => {
            const p = PARENT[n]; if (!p) { worldQ[n] = new THREE.Quaternion(); return; }
            const pq = worldQ[p];
            bones[n].position.copy(V(v3.sub(REST[n], REST[p])).applyQuaternion(pq.clone().invert()));
            if (LOCALQ[n]) bones[n].quaternion.copy(pq.clone().invert().multiply(LOCALQ[n]));
            worldQ[n] = pq.clone().multiply(bones[n].quaternion);
            bones[p].add(bones[n]);
          });
          const mesh = new THREE.SkinnedMesh(geo, toon); mesh.name = 'bike-skin';
          const group = new THREE.Group(); group.name = 'bike-tyson-' + detail;
          const holder = new THREE.Group(); holder.name = 'bike-scale'; holder.scale.setScalar(SCALE); group.add(holder);
          const rig = new THREE.Group(); rig.name = 'bike-rig'; holder.add(rig);
          rig.add(bones.root); rig.add(mesh);
          group.updateMatrixWorld(true);
          mesh.bind(new THREE.Skeleton(list));
          mesh.frustumCulled = false;
          if (names.length) { mesh.morphTargetDictionary = {}; names.forEach((k, i) => { mesh.morphTargetDictionary[k] = i; }); mesh.morphTargetInfluences = names.map(() => 0); }

          /* ---- eyeballs on the head bone */
          const eyeG = new THREE.SphereGeometry(eyeR, LV.eye[0], LV.eye[1], 0, PI * 2, 0, PI * 0.62).rotateX(PI / 2);
          const EP = [], EN = [], EA = [], EI = [];
          const headInv = new THREE.Matrix4().makeTranslation(NECKB[0], NECKB[1], NECKB[2]).invert();
          for (const side of [1, -1]) {
            const E = side > 0 ? EYE.L : EYE.R;
            const m = M4().compose(V(E.c), eyeQ(side), new THREE.Vector3(1, 1, 1)).premultiply(headInv), nm = new THREE.Matrix3().getNormalMatrix(m);
            const p = eyeG.attributes.position, nr = eyeG.attributes.normal, b = EP.length / 3, vv = new THREE.Vector3(), nn = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
              vv.fromBufferAttribute(p, i); nn.fromBufferAttribute(nr, i);
              EA.push(nn.x, nn.y, nn.z, side);
              vv.applyMatrix4(m); nn.applyMatrix3(nm).normalize();
              EP.push(vv.x, vv.y, vv.z); EN.push(nn.x, nn.y, nn.z);
            }
            for (let i = 0; i < eyeG.index.count; i++) EI.push(b + eyeG.index.getX(i));
          }
          const eg = new THREE.BufferGeometry();
          eg.setAttribute('position', new THREE.Float32BufferAttribute(EP, 3)); eg.setAttribute('normal', new THREE.Float32BufferAttribute(EN, 3));
          eg.setAttribute('aEye', new THREE.Float32BufferAttribute(EA, 4)); eg.setIndex(EI);
          const eyeMat = opts.eyeMat || D.eyeMaterial(THREE);
          const eyes = new THREE.Mesh(eg, eyeMat); eyes.name = 'bike-eyes';
          bones.head.add(eyes);
          stats.parts.eyes = EI.length / 3;

          /* ---- wheels (front on the fork, inside the gloves; rear on the frame) and the crank */
          const wheelAcc = wheelGeo(THREE, U, LV, C, K);
          const toMesh = (A, name) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(A.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.N, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(A.C, 3)); g.setAttribute('kz', new THREE.Float32BufferAttribute(A.K, 4));
            g.setIndex(A.n > 65535 ? new THREE.Uint32BufferAttribute(A.I, 1) : new THREE.Uint16BufferAttribute(A.I, 1)); g.computeBoundingSphere();
            const m = new THREE.Mesh(g, toon); m.name = name; m.castShadow = m.receiveShadow = true; return m;
          };
          const wheelF = toMesh(wheelAcc, 'bike-wheel-front'), wheelRm = new THREE.Mesh(wheelF.geometry, toon); wheelRm.name = 'bike-wheel-rear'; wheelRm.castShadow = wheelRm.receiveShadow = true;
          wheelF.position.copy(V(v3.sub(HUBF, FORK))); bones.fork.add(wheelF);
          wheelRm.position.copy(V(v3.sub(HUBR, REST.body))); bones.body.add(wheelRm);
          const crank = toMesh(crankGeo(THREE, U, LV, C, K), 'bike-crank');
          crank.position.copy(V(v3.sub(HUBR, REST.body))); bones.body.add(crank);
          stats.parts.wheels = 2 * wheelAcc.I.length / 3; stats.parts.crank = crank.geometry.index.count / 3;

          /* ---- dizzy stars (hit, variant A's): three gold stars spinning above the dome. Their own small mesh on the head
           * bone so they cast NO shadow (a star shadow on the bald dome read as a head mark); visible only while dazed. */
          let starMesh = null;
          if (LV.star) {
            const SA = new Acc();
            const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = PI / 2 + i * PI / 5, r = i % 2 ? 0.021 : 0.047; if (i) sh.lineTo(r * cos(a), r * sin(a)); else sh.moveTo(r * cos(a), r * sin(a)); }
            const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: detail === 'desktop', bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 }).translate(0, 0, -0.009);
            for (let i = 0; i < 3; i++) {
              const a = (i / 3) * PI * 2 + PI / 2;
              addGeo(THREE, SA, sg, M4().compose(V([cos(a) * 0.25, 0.025 * sin(a * 2), sin(a) * 0.22]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + PI / 2, 0.2)), V([1, 1, 1])),
                (x, y, z, nx, ny, nz) => mix3(C.goldDk, C.star, sstep(-0.3, 0.6, nz + 0.3 * ny)), K.star, 0);
            }
            starMesh = toMesh(SA, 'bike-stars'); starMesh.castShadow = starMesh.receiveShadow = false; starMesh.userData.noShadow = true;
            starMesh.position.copy(V(v3.sub(STARC, NECKB))); starMesh.visible = false; bones.head.add(starMesh);
            stats.parts.stars = SA.I.length / 3;
          }

          stats.tris = acc.I.length / 3 + EI.length / 3 + stats.parts.wheels + stats.parts.crank + (stats.parts.stars || 0);   // stars only draw while dazed
          stats.verts = nv; stats.ms = Math.round(now() - T0);
          stats.headShare = headShare(F, rayHit);
          group.traverse((o) => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; } });
          const api = rigApi(THREE, U, H, { bones, mesh, eyes, eyeMat, stats, names, rig, group, wheelF, wheelR: wheelRm, crank, starMesh, level: detail });
          group.userData.racer = api; group.userData.stats = stats;
          return group;
        }

        // head share: chin to crown over hub line to crown
        function headShare(F, rayHit) {
          const top = rayHit(F.headF, [0, 1.8, 0.5], [0, -1, 0], 0, 0.8, 128)[1];
          let chin = 2; for (let z = 0.45; z < 0.75; z += 0.01) { const p = rayHit(F.headF, [0, 0.7, z], [0, 1, 0], 0, 0.6, 128); if (p) chin = min(chin, p[1]); }
          return { top: +top.toFixed(3), chin: +chin.toFixed(3), share: +((top - chin) / (top - R)).toFixed(3), shareGround: +((top - chin) / top).toFixed(3) };
        }

        /* ------------------------------------------------------------------ the wheel: fat tyre, chrome rim, gold spokes + hub */
        function wheelGeo(THREE, U, LV, C, K) {
          const { Acc, addGeo, mix3, sstep, v3 } = U, A = new Acc(), M4 = () => new THREE.Matrix4();
          const [tseg, rseg] = LV.wheel;
          // tyre: torus with the axle on X; a fine gold pinstripe on each sidewall
          const tor = new THREE.TorusGeometry(R - TY, TY, tseg, rseg).rotateY(PI / 2);
          addGeo(THREE, A, tor, M4(), (x, y, z, nx, ny, nz) => {
            const r = Math.hypot(y, z), side = Math.abs(nx);
            return mix3(C.tyre, C.tyreHi, sstep(0.6, 1, side) * 0.5 * sstep(R - TY - 0.02, R - TY + 0.03, r));
          }, K.rubber, 0);
          // variant A's wheel read: a fat GOLD rim band inside the black tyre, a recessed dark well, chunky chrome spokes
          const rimR = R - 2 * TY + 0.004;
          addGeo(THREE, A, new THREE.TorusGeometry(rimR, 0.024, LV.rim[0], LV.rim[1]).rotateY(PI / 2), M4().makeScale(1.75, 1, 1), (x, y, z, nx, ny) => mix3(C.goldDk, C.gold, sstep(-0.5, 0.9, ny) * 0.7 + 0.3), K.gold, 0);
          for (const s of [1, -1]) addGeo(THREE, A, new THREE.CircleGeometry(rimR - 0.006, LV.rim[1]).rotateY(s * PI / 2), M4().makeTranslation(s * 0.012, 0, 0), C.tyre, K.rubber, 0);
          for (let i = 0; i < LV.spokes; i++) {
            const a = (i / LV.spokes) * PI * 2;
            addGeo(THREE, A, new THREE.CylinderGeometry(0.014, 0.019, rimR - 0.03, 6, 1).translate(0, 0.03 + (rimR - 0.03) / 2, 0), M4().makeRotationX(a).multiply(M4().makeScale(1.5, 1, 1)), (x, y, z, nx, ny) => mix3(C.chromeDk, C.chrome, sstep(-0.6, 0.9, nx * 0.3 + ny)), K.chrome, 0);
          }
          addGeo(THREE, A, new THREE.CylinderGeometry(0.044, 0.044, 0.1, max(8, LV.rim[1] >> 2), 1).rotateZ(PI / 2), M4(), C.chrome, K.chrome, 0);
          addGeo(THREE, A, new THREE.CylinderGeometry(0.016, 0.016, 0.36, 6, 1).rotateZ(PI / 2), M4(), C.chromeDk, K.chrome, 0);   // axle into the gloves
          return A;
        }
        /* ------------------------------------------------------------------ the crank: gold chainring (right side), chrome arms, pedal axles */
        function crankGeo(THREE, U, LV, C, K) {
          const { Acc, addGeo } = U, A = new Acc(), M4 = () => new THREE.Matrix4();
          if (LV.gear) {
            const sh = new THREE.Shape(), n = 16, r0 = 0.118, r1 = 0.136;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * PI * 2, w = (PI * 2 / n);
              const pts = [[r0, a], [r1, a + w * 0.2], [r1, a + w * 0.45], [r0, a + w * 0.65]];
              pts.forEach(([r, b], k) => { const x = r * cos(b), y = r * sin(b); if (i === 0 && k === 0) sh.moveTo(x, y); else sh.lineTo(x, y); });
            }
            const hole = new THREE.Path(); hole.absarc(0, 0, 0.07, 0, PI * 2, true); sh.holes.push(hole);
            const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false, curveSegments: 6 }).rotateY(PI / 2);
            addGeo(THREE, A, g, M4().makeTranslation(0.088, 0, 0), C.gold, K.gold, 0);
            for (let i = 0; i < 5; i++) addGeo(THREE, A, new THREE.BoxGeometry(0.012, 0.016, 0.085).translate(0, 0, 0.065), M4().makeTranslation(0.094, 0, 0).multiply(M4().makeRotationX((i / 5) * PI * 2)), C.gold, K.gold, 0);
          }
          for (const s of [1, -1]) {
            // crank arm: pedal end at angle 0 (forward) for +x, PI for -x; the pedal axle sticks out to the boot
            const ang = s > 0 ? 0 : PI, len = CRANK;
            const arm = new THREE.BoxGeometry(0.02, 0.032, len + 0.03, 1, 1, 1).translate(0, 0, len / 2);
            addGeo(THREE, A, arm, M4().makeTranslation(s * 0.125, 0, 0).multiply(M4().makeRotationX(-ang)), C.chrome, K.chrome, 0);
            const ax = new THREE.CylinderGeometry(0.01, 0.01, PEDX - 0.12, 6, 1).rotateZ(PI / 2);
            addGeo(THREE, A, ax, M4().makeRotationX(-ang).multiply(M4().makeTranslation(s * (0.125 + (PEDX - 0.12) / 2), 0, len)), C.chromeDk, K.chrome, 0);
          }
          addGeo(THREE, A, new THREE.CylinderGeometry(0.03, 0.03, 0.27, 10, 1).rotateZ(PI / 2), M4(), C.chromeDk, K.chrome, 0);
          return A;
        }

        /* ------------------------------------------------------------------ far LOD: snapped low-poly parts in one mesh + 2 wheels */
        function buildFar(THREE, H, F, C, K, toon, U, T0, now, stats) {
          const { Acc, addGeo, mix3, sstep, v3, grad } = U, A = new Acc(), M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const snap = (f, c, ws, hs, rmax, col, k) => {
            const s = new THREE.SphereGeometry(1, ws, hs), p = s.attributes.position, n = s.attributes.normal, g = [0, 0, 0];
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i), p.getY(i), p.getZ(i)]);
              let lo = 0, hi = rmax; for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (f(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c, d, lo); p.setXYZ(i, q[0], q[1], q[2]); grad(f, q[0], q[1], q[2], 0.01, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            addGeo(THREE, A, s, M4(), col, k, 0);
          };
          const cyl = (a, b, ra, rb, col, k, seg) => {
            const d = v3.sub(b, a), L = Math.hypot(d[0], d[1], d[2]);
            const g = new THREE.CylinderGeometry(rb, ra, L, seg || 6, 1, false).translate(0, L / 2, 0);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.scale(d, 1 / L)));
            addGeo(THREE, A, g, M4().compose(V(a), q, V([1, 1, 1])), col, k, 0);
          };
          const headCol = (x, y, z, nx, ny, nz) => {
            const ax = Math.abs(x);
            let c = mix3(C.skinDk, C.skin, sstep(-0.8, 0.2, ny));
            if (z > 0.6 && y > 1.1 && y < 1.15 && ax < 0.15) c = C.hair;                    // moustache band
            return c;
          };
          snap(F.headF, [0, 1.2, 0.5], 12, 8, 0.5, headCol, K.skin);
          snap((x, y, z) => F.torsoF(x, y, z), [0, 0.9, -0.02], 11, 7, 0.8, (x, y, z, nx, ny) => (F.trunkR(x, y, z) < 0 ? mix3(C.trunkDk, C.trunk, sstep(-0.5, 0.3, ny)) : mix3(C.skinDk, C.skin, sstep(-0.8, 0.2, ny))), K.skin);
          for (const s of [1, -1]) {
            const X = (p) => [s * p[0], p[1], p[2]];
            cyl(X(SH), X(EL), 0.085, 0.072, C.skin, K.skin, 6);
            cyl(X(EL), X(WR), 0.072, 0.094, C.skin, K.skin, 6);
            // the glove hangs off the forearm (the B far glove floated): cuff + glove overlap the wrist, thumb up front
            cyl(X(v3.lerp(WR, GLV, 0.1)), X(v3.lerp(WR, GLV, 0.42)), 0.1, 0.104, C.gold, K.gold, 6);
            addGeo(THREE, A, new THREE.SphereGeometry(1, 7, 5), M4().compose(V(X(v3.add(GLV, [0.005, 0.03, 0]))), new THREE.Quaternion(), V([0.115, 0.15, 0.15])), C.glove, K.glove, 0);
            cyl(X(HIP), X(H.KN), 0.1, 0.082, C.skin, K.skin, 6);
            cyl(X(H.KN), X(H.AN), 0.08, 0.06, C.skin, K.skin, 6);
            addGeo(THREE, A, new THREE.SphereGeometry(1, 6, 4), M4().compose(V(X(v3.add(H.AN, [0, -0.03, 0.05]))), new THREE.Quaternion(), V([0.075, 0.06, 0.125])), C.boot, K.boot, 0);
            // eyes (white + pupil) and grips
            addGeo(THREE, A, new THREE.SphereGeometry(0.056, 6, 4), M4().makeTranslation(s * 0.09, 1.258, 0.695), C.white, K.gold, 0);
            addGeo(THREE, A, new THREE.SphereGeometry(0.02, 4, 3), M4().makeTranslation(s * 0.09, 1.252, 0.748), C.hair, K.gold, 0);
            cyl([s * 0.36, 1.348, 0.522], [s * 0.47, 1.353, 0.582], 0.032, 0.032, C.grip, K.rubber, 5);
            cyl([s * 0.13, 1.333, 0.245], [s * 0.36, 1.348, 0.522], 0.022, 0.022, C.chrome, K.chrome, 4);
          }
          cyl([-0.13, 1.333, 0.245], [0.13, 1.333, 0.245], 0.022, 0.022, C.chrome, K.chrome, 4);
          cyl([0, 1.09, 0.25], [0, 1.333, 0.235], 0.026, 0.026, C.chrome, K.chrome, 4);
          addGeo(THREE, A, new THREE.SphereGeometry(1, 7, 4), M4().compose(V([0, SEAT[1] - 0.005, SEAT[2]]), new THREE.Quaternion(), V([0.105, 0.04, 0.125])), C.saddle, K.saddle, 0);
          cyl([0, 0.96, SEAT[2] + 0.01], [0, SEAT[1] - 0.02, SEAT[2] + 0.01], 0.022, 0.022, C.chrome, K.chrome, 4);
          // wheels: a tyre cylinder with gold hub faces + an axle so they stay attached
          const W = new Acc();
          // round wheels (B's far wheels were octagon slabs): a lathed, rounded tyre + a gold rim face on each side
          const prof = [[R - 2 * TY, -TY * 0.7], [R - TY * 0.5, -TY], [R, 0], [R - TY * 0.5, TY], [R - 2 * TY, TY * 0.7]];
          addGeo(THREE, W, new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 12).rotateZ(PI / 2), M4(), C.tyre, K.rubber, 0);
          for (const s of [1, -1]) addGeo(THREE, W, new THREE.CircleGeometry(R - 2 * TY + 0.004, 12).rotateY(s * PI / 2), M4().makeTranslation(s * TY * 0.6, 0, 0), (x, y, z) => (Math.hypot(y, z) > R - 2 * TY - 0.04 ? C.gold : C.tyre), K.gold, 0);
          const toMesh = (acc, name) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3)); g.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
            g.setIndex(new THREE.Uint16BufferAttribute(acc.I, 1)); g.computeBoundingSphere();
            const m = new THREE.Mesh(g, toon); m.name = name; m.castShadow = m.receiveShadow = true; return m;
          };
          const group = new THREE.Group(); group.name = 'bike-tyson-far';
          const holder = new THREE.Group(); holder.name = 'bike-scale'; holder.scale.setScalar(SCALE); group.add(holder);
          const rig = new THREE.Group(); rig.name = 'bike-rig'; holder.add(rig);
          const body = toMesh(A, 'bike-far'); rig.add(body);
          const wf = toMesh(W, 'bike-far-wheel'), wr = new THREE.Mesh(wf.geometry, toon);
          wf.position.set(...HUBF); wr.position.set(...HUBR); rig.add(wf, wr);
          stats.tris = A.I.length / 3 + 2 * W.I.length / 3; stats.parts = { body: A.I.length / 3, wheels: 2 * W.I.length / 3 }; stats.ms = Math.round(now() - T0);
          stats.headShare = headShare(F, U.rayHit);
          const st = { wheel: 0, lean: 0, leanV: 0, wheelie: 0, sq: 1 };
          const place = () => {
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-st.wheelie, 0, -st.lean, 'ZXY'));
            const pc = new THREE.Vector3(0, 0, HUBR[2]); rig.quaternion.copy(q); rig.position.copy(pc.clone().sub(pc.clone().applyQuaternion(q)));
            rig.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
          };
          const api = {
            level: 'far', names: NAMES, EXPR, stats, mesh: body,
            set() { return api; }, setExpression() { return api; }, setGaze() { return api; }, look() { return api; }, blink() { return api; },
            squash(k) { st.sq = k; place(); return api; }, kick() {}, steer() { return api; },
            pose(o) { o = o || {}; st.lean = o.lean || 0; st.wheelie = o.wheelie || 0; place(); return api; },
            update(dt, inp) {
              inp = inp || {}; const v = inp.speed || 0;
              st.wheel += (v / (R * SCALE)) * dt; wf.rotation.x = wr.rotation.x = st.wheel;
              const tgt = (inp.steer || 0) * (inp.drift ? 35 : 30) * PI / 180 * Math.min(1, v / 15);
              st.leanV += (60 * (tgt - st.lean) - 11 * st.leanV) * dt; st.lean += st.leanV * dt; place();
            },
          };
          group.userData.racer = api; group.userData.stats = stats;
          return group;
        }

        /* ------------------------------------------------------------------ the live layer (Pepe FINAL's API + bike poses) */
        function rigApi(THREE, U, H, o) {
          const { sat, sstep, lerp, v3 } = U;
          const { bones: B, eyeMat, stats, names, rig } = o;
          const UU = eyeMat.userData.uniforms;
          const rest = {}; for (const k in B) rest[k] = B[k].quaternion.clone();
          const restP = {}; for (const k in B) restP[k] = B[k].position.clone();
          const eyesP = o.eyes.position.clone(), sinkDir = new THREE.Vector3(0, 0.05, 1).normalize();
          const lidZ = {}; for (const k of ['lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR']) lidZ[k] = new THREE.Vector3(0, 0, 1).applyQuaternion(rest[k]);
          const N0 = EXPR.neutral;
          const st = { w: {}, target: null, gaze: null, look: [0, 0], blink: 0, autoBlink: true, nextBlink: 2 + Math.random() * 3, blinkT: -1, sq: 1, sqV: 0, steer: 0,
            wheel: 0, crank: 0, lean: 0, leanV: 0, wheelie: 0, punch: 0, weave: 0, weaveAmt: 0, shimmy: 0, bob: 0, t: 0, hitT: 9, celT: 9, manual: null };
          NAMES.forEach((n) => { st.w[n] = 0; });
          const q1 = new THREE.Quaternion(), e = new THREE.Euler(), vv = new THREE.Vector3();
          const blend = (key) => { let v = N0[key]; for (const k of NAMES) v += st.w[k] * (EXPR[k][key] - N0[key]); return v; };
          const blendG = () => { let gx = N0.gaze[0], gy = N0.gaze[1], cx = 0; for (const k of NAMES) { gx += st.w[k] * (EXPR[k].gaze[0] - N0.gaze[0]); gy += st.w[k] * (EXPR[k].gaze[1] - N0.gaze[1]); cx += st.w[k] * EXPR[k].gazeX; } return [gx, gy, cx]; };
          const steerAx = new THREE.Vector3(...H.steerAx);
          const Vv = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          // rest directions for the limbs
          const dirRest = {
            thigh: Vv(v3.norm(v3.sub(H.KN, HIP))), shin: Vv(v3.norm(v3.sub(H.AN, H.KN))),
            armU: Vv(v3.norm(v3.sub(EL, SH))), armF: Vv(v3.norm(v3.sub(WR, EL))),
          };
          const mirror = (v, s) => new THREE.Vector3(v.x * s, v.y, v.z);
          const fromTo = (a, b) => new THREE.Quaternion().setFromUnitVectors(a, b.clone().normalize());
          function legs() {
            for (const s of [1, -1]) {
              const sd = s > 0 ? 'L' : 'R', th = st.crank + (s > 0 ? 0 : PI);
              const L = H.legAt(th, s);
              const tq = fromTo(mirror(dirRest.thigh, s), Vv(v3.sub(L.K, L.H)));
              const sw = fromTo(mirror(dirRest.shin, s), Vv(v3.sub(L.A, L.K)));
              B['thigh' + sd].quaternion.copy(tq);
              B['shin' + sd].quaternion.copy(tq.clone().invert().multiply(sw));
              B['foot' + sd].quaternion.copy(sw.clone().invert());
            }
          }
          function arms() {
            // rest: both gloves on the hub. punch: the RIGHT glove (-x) lets go and punches the sky
            const p = st.punch;
            B.armUL.quaternion.copy(rest.armUL); B.armFL.quaternion.copy(rest.armFL); B.handL.quaternion.copy(rest.handL);
            if (p <= 0) { B.armUR.quaternion.copy(rest.armUR); B.armFR.quaternion.copy(rest.armFR); B.handR.quaternion.copy(rest.handR); return; }
            const up = new THREE.Vector3(-0.18, 1, 0.42).normalize(), fwd = new THREE.Vector3(-0.12, 0.25, 1).normalize();
            const uDir = mirror(dirRest.armU, -1), fDir = mirror(dirRest.armF, -1);
            const uq = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), fromTo(uDir, fwd.clone().lerp(up, 0.35).normalize()), sstep(0, 0.7, p));
            const fw = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), fromTo(fDir, up), sstep(0.1, 1, p));
            B.armUR.quaternion.copy(uq);
            B.armFR.quaternion.copy(uq.clone().invert().multiply(fw));
            B.handR.quaternion.copy(new THREE.Quaternion());
          }
          function apply() {
            // eyes
            let [gx, gy, cx] = blendG();
            if (st.gaze) { gx = st.gaze[0]; gy = st.gaze[1]; cx = 0; }
            gx += st.look[0]; gy += st.look[1];
            UU.uGazeL.value.set(gx - cx, gy + cx * 0.25, 1).normalize(); UU.uGazeR.value.set(gx + cx, gy - cx * 0.15, 1).normalize();
            UU.uPupil.value = blend('pupil'); UU.uIris.value = blend('iris'); UU.uSpark.value = blend('spark');
            const happy = blend('happy'), shut = sstep(0.3, 0.7, happy);
            let lu = blend('lidU'), ll = blend('lidLo');
            lu = lerp(lu, -1.5, max(shut, st.blink)); ll = lerp(ll, -0.62, shut);
            UU.uLid.value = lu;
            // laughing shut eyes sink 2 cm into the head (eyeball + lids together) so the closed lids don't read as goggles
            const sink = 0.02 * shut;
            o.eyes.position.copy(eyesP).addScaledVector(sinkDir, -sink);
            for (const k in lidZ) B[k].position.copy(restP[k]).addScaledVector(lidZ[k], -sink);
            for (const s of ['L', 'R']) {
              B['lid' + s].quaternion.copy(rest['lid' + s]).multiply(q1.setFromEuler(e.set(-lu, 0, 0)));
              B['low' + s].quaternion.copy(rest['low' + s]).multiply(q1.setFromEuler(e.set(-ll, 0, 0)));
              B['arc' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, happy)));
            }
            const stars = blend('stars');
            if (o.starMesh) { o.starMesh.visible = stars > 0.2; o.starMesh.scale.setScalar(max(1e-4, sstep(0.2, 0.8, stars))); o.starMesh.rotation.set(0, st.t * 3.2, 0); }
            if (o.mesh.morphTargetInfluences) NAMES.forEach((n, i) => { o.mesh.morphTargetInfluences[i] = st.w[n] || 0; });
            // head: expression pitch/roll + dazed bob + weave lead
            B.head.quaternion.copy(rest.head).multiply(q1.setFromEuler(e.set(blend('pitch') + st.bob * 0.6, st.steer * 0.18 + st.weave * 0.1, blend('roll') + st.bob + st.weave * 0.22)));
            // fork: steering about the raked axis + hit shimmy
            B.fork.quaternion.setFromAxisAngle(steerAx, st.steer * 0.32 + st.shimmy);
            // body: the boxer's dip-and-weave (roll + dip)
            B.body.quaternion.setFromEuler(e.set(st.weaveAmt * 0.05 * abs(st.weave), 0, -st.weave * 0.16));
            B.body.position.set(0, 0.88 - st.weaveAmt * 0.04 * abs(st.weave), 0);
            legs(); arms();
            o.crank.rotation.x = st.crank; o.wheelF.rotation.x = st.wheel; o.wheelR.rotation.x = st.wheel;
            // rig: lean (about the ground line) and wheelie (about the rear contact patch)
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-st.wheelie, 0, -st.lean, 'ZXY'));
            const pc = new THREE.Vector3(0, 0, HUBR[2] - 0.0);
            rig.quaternion.copy(q); rig.position.copy(pc.clone().sub(pc.clone().applyQuaternion(q)));
            rig.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
          }
          const api = {
            level: o.level, bones: B, mesh: o.mesh, names: NAMES, EXPR, stats,
            set(weights) { for (const k of NAMES) st.w[k] = weights && weights[k] ? weights[k] : 0; st.target = null; apply(); return api; },
            setExpression(name, instant) {
              st.target = name;
              if (name === 'hit') st.hitT = 0; if (name === 'celebrate') st.celT = 0;
              if (instant) { for (const k of NAMES) st.w[k] = k === name ? 1 : 0; apply(); }
              return api;
            },
            setGaze(x, y) { st.gaze = x === null || x === undefined ? null : [x, y || 0]; apply(); return api; },
            look(x, y) { st.look[0] = x; st.look[1] = y; apply(); return api; },
            blink(v) { st.blink = v || 0; st.autoBlink = v === undefined; apply(); return api; },
            squash(k) { st.sq = k; apply(); return api; },
            kick(v) { st.sqV += v; },
            steer(v) { st.steer = v; apply(); return api; },
            // a static pose for stills: crank (rad), lean (rad, + = his left), wheelie (rad), punch 0-1, weave -1..1, shimmy (rad), bob (rad)
            pose(p) {
              p = p || {};
              st.crank = p.crank || 0; st.lean = p.lean || 0; st.wheelie = p.wheelie || 0; st.punch = p.punch || 0;
              st.weave = p.weave || 0; st.weaveAmt = p.weave ? 1 : 0; st.shimmy = p.shimmy || 0; st.bob = p.bob || 0; st.wheel = p.wheel || 0; st.t = p.t || 0;
              apply(); return api;
            },
            // speed m/s, steer -1..1 (+ = left), drift bool. Pedals at wheel rpm / 2.5, motorbike lean (30 deg, 35 in a drift),
            // hit = 8 Hz fork shimmy decaying over 0.6 s + dazed bob, boost = dip-and-weave, celebrate = wheelie + sky punch.
            update(dt, inp) {
              inp = inp || {}; const v = inp.speed || 0; st.t += dt;
              if (st.target !== null) { const k = 1 - exp(-dt * 12); for (const n of NAMES) st.w[n] += ((n === st.target ? 1 : 0) - st.w[n]) * k; }
              if (st.autoBlink && st.w.boost < 0.5 && st.w.celebrate < 0.5) {
                st.nextBlink -= dt;
                if (st.nextBlink <= 0 && st.blinkT < 0) { st.blinkT = 0; st.nextBlink = 2 + Math.random() * 3; }
                if (st.blinkT >= 0) { st.blinkT += dt; const u = st.blinkT / 0.16; st.blink = u < 0.4 ? u / 0.4 : max(0, 1 - (u - 0.4) / 0.6); if (u >= 1) { st.blinkT = -1; st.blink = 0; } }
              }
              st.wheel += (v / (R * SCALE)) * dt; st.crank += (v / (R * SCALE) / 2.5) * dt;
              st.steer += ((inp.steer || 0) - st.steer) * (1 - exp(-dt * 10));
              const tgt = (inp.steer || 0) * (inp.drift ? 35 : 30) * PI / 180 * min(1, (v * v) / 120);
              st.leanV += (60 * (tgt - st.lean) - 11 * st.leanV) * dt; st.lean += st.leanV * dt;
              st.hitT += dt; st.celT += dt;
              st.shimmy = st.hitT < 0.6 ? 0.16 * sin(2 * PI * 8 * st.hitT) * (1 - st.hitT / 0.6) ** 2 : 0;
              st.bob = st.w.hit * 0.09 * sin(st.t * 2 * PI * 1.6);
              st.weaveAmt = st.w.boost; st.weave = st.weaveAmt * sin(st.t * 2 * PI * 1.8);
              const c = st.celT;
              st.wheelie = c < 1.2 ? 0.42 * sstep(0, 0.25, c) * (1 - sstep(0.95, 1.2, c)) : 0;
              st.punch = c < 1.2 ? sstep(0.08, 0.3, c) * (1 - sstep(0.9, 1.15, c)) * (0.8 + 0.2 * sin(c * 2 * PI * 3)) : 0;
              const a = -220 * (st.sq - 1) - 14 * st.sqV; st.sqV += a * dt; st.sq += st.sqV * dt;
              apply();
            },
          };
          apply();
          return api;
        }

        const api = (THREE, K, detail, opts) => build(THREE, K, detail, opts);
        api.EXPR = EXPR; api.NAMES = NAMES; api.LEVELS = LEVELS; api.FRAME = { R, TY, HUBF, HUBR, HC, CRANK, PEDX };
        root.BikeTyson = api;
      })(KR);

      /* Aspen GP: the SNOW SLED (9 Oct 2026), the ride any racer can take instead of its own kart
       * (ctx.kart.racer(id, { ride: 'sled', paint, accent, number })). An original sport snowmobile, built in code like
       * the karts: a low cowl over the rider's legs (the racers keep their kart pose, knees up, feet forward, all of it
       * forward of the seat inside the cowl), a smoked windscreen, a SHORT yoke handlebar whose grips run through the
       * rider's own hands (the hands stay where every kart's wheel puts them: no arm is re-posed), a seat on the tunnel,
       * two skis on spindles that steer, a rubber track under the tunnel whose cleats run round it with the speed, a
       * snow flap, a tail light, twin headlamps, and the racer's paint: body, accent (stripe, skis, number roundel) and a
       * race number on both flanks.
       *
       *   SnowSled(THREE, KIT, detail, o) -> THREE.Group       detail 'desktop' | 'phone' | 'mid' | 'far'
       *     o = { toon, glassMat, paint, accent, number, hands: { H: [x, y, z], T: [x, y, z] } }   (the right hand, x > 0,
       *     and the rim's tangent through it, in the sled's frame; mirrored for the left)
       *   userData.kart = { seat, level, tris, ms, parts, sled: true, emit, animate(dt, { speed, steer }), skis, glass }
       *
       * Units metres, +Z forward, +X the rider's left, origin on the ground under the middle. Budgets as the karts': about
       * 11k / 5.5k / 2k (one draw) / 0.3k tris, and a windscreen (the helmet's glass program) near only.
       */
      (function (root) {
        'use strict';
        const { abs, min, max, sin, cos, PI, hypot, sqrt } = Math;
        const LEVELS = {
          desktop: { body: 0.04, tube: 8, seg: 18, belt: 8, beltN: 14, lugs: 30, ski: 16, grid: [10, 4], digits: true, bogie: true, detail: 2 },
          phone:   { body: 0.058, tube: 6, seg: 12, belt: 6, beltN: 8, lugs: 22, ski: 10, grid: [6, 2], digits: true, bogie: false, detail: 1 },
          mid:     { body: 0.13, tube: 4, seg: 6, belt: 4, beltN: 3, lugs: 0, ski: 5, grid: [3, 1], digits: false, bogie: false, detail: 0 },
          far:     { far: true, tube: 3, seg: 5, belt: 4, beltN: 2, lugs: 0, ski: 3, grid: [2, 1], digits: false, bogie: false, detail: 0 },
        };
        // where the rider's origin goes (the seat contact under the pelvis); the skis' spindles; the track's loop
        // (v2, 9 Oct: the owner's "wider base, beefed up": the ski stance 0.88 -> 1.22 m, the tunnel and the track 37%
        // wider, running boards out to 0.58, the cowl's skirts flared; the sled is 1.38 m across the skis, the sim's
        // kart 1.3, a Meme Kart about 1.5. The cowl's top, the seat height and the bar are where they were: every rider fits)
        const SEAT = [0, 0.4, -0.26];
        const SKI_X = 0.61, SKI_Z = 0.6, SKI = { w: 0.085, t: 0.019, z0: -0.48, len: 1.04 };
        const IDL = { z: -0.93, y: 0.131, r: 0.119 }, DRV = { z: 0.02, y: 0.165, r: 0.095 }, BELT = { w: 0.26, t: 0.013 };
        const TUN = 0.335, BOARD = { x: 0.44, w: 0.14, y: 0.215, z0: -0.82, z1: -0.06 };
        // the item mounts and the snow's emitters, the sled's own (kart-items.js takes the rider's eyes from the rider)
        const MOUNT = { pump: [0.45, 0.26, -0.62, 0.95], hose: [-0.24, 0.1, 0.22], rear: [[0.23, -0.98], [-0.23, -0.98]], rocket: [0, 0.6, -0.96, 0.72, 0.44], dome: [0, 0.66, -0.06, 1.24, 1.0, 1.56] };
        const EMIT = { track: [0, 0.05, -1.08], rear: [[0.23, -1.0], [-0.23, -1.0]], skis: [[SKI_X, 0.03, SKI_Z + 0.5], [-SKI_X, 0.03, SKI_Z + 0.5]] };
        // the track's loop in (z, y), in the direction it runs when the sled goes forward: the bottom run backward, up
        // round the idler at the back, the top run forward under the tunnel, down round the drive sprocket in front
        function beltPath(n) {
          const P = [];
          P.push([-0.08, 0.012]);
          for (let i = 1; i <= 2; i++) P.push([-0.08 + (IDL.z + 0.08) * i / 2, 0.012]);
          for (let i = 1; i <= n; i++) { const a = 1.5 * PI - PI * i / n; P.push([IDL.z + IDL.r * cos(a), IDL.y + IDL.r * sin(a)]); }
          for (let i = 1; i <= 2; i++) P.push([IDL.z + (DRV.z - IDL.z) * i / 2, IDL.y + IDL.r + (DRV.y + DRV.r - IDL.y - IDL.r) * i / 2]);
          for (let i = 1; i <= n; i++) { const a = PI / 2 - (5 * PI / 6) * i / n; P.push([DRV.z + DRV.r * cos(a), DRV.y + DRV.r * sin(a)]); }
          return P;   // closed: the last point runs back to the first
        }

        function SnowSled(THREE, KIT, detail, o) {
          o = o || {};
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now(), T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop, U = root.DogFinal.util, { sstep, smin, smax, mix3, v3 } = U, { rbox } = root.DogKartKit;
          const toon = o.toon || root.mat.toon(THREE, {});
          const col = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
          const C = {
            paint: col(o.paint || '#D33A2C'), accent: col(o.accent || '#F4F1EA'), low: col('#2B2E35'), lowDk: col('#1B1D22'), deck: col('#33363E'),
            seat: col('#22232A'), seatHi: col('#3A3B44'), chrome: col('#D9DEE4'), chromeDk: col('#7E8690'), rubber: col('#1C1D21'), cleat: col('#2A2B30'),
            lamp: col('#FFF4D6'), tail: col('#FF3B30'), screen: col('#2C3A4E'), screenHi: col('#6C7F99'), white: col('#F7F7F4'), ink: col('#16171B'), arm: col('#3B4048'),
          };
          C.paintDk = mix3(C.paint, [0, 0, 0], 0.28); C.accentDk = mix3(C.accent, [0, 0, 0], 0.25);
          const K = { paint: [0.3, 0, 0, 1], rubber: [0.88, 0, 0, 1], chrome: [0.14, 0, 0, 1], seat: [0.6, 0.2, 0, 1], glow: [0.3, 0, 2, 1], matte: [0.7, 0, 0, 1] };
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const Qe = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
          const parts = {}, body = new U.Acc();
          let mark = 0;
          const done = (name) => { parts[name] = (parts[name] || 0) + (body.I.length - mark) / 3; mark = body.I.length; };

          /* ---- the body: cowl (over the legs, its back wall leaning toward the seat; its skirts flared out over the
           * front suspension), a broad nose pan, the tunnel deck (the boards and the tunnel's flanks: plates, below) */
          const hoodF = (x, y, z) => {
            const tw = (1 - 0.3 * sstep(0.3, 1.0, z)) * (1 + 0.38 * sstep(0.47, 0.22, y));
            let d = rbox(x / tw, y, z, [0, 0.45, 0.32], [0.31, 0.24, 0.5], 0.12) * tw;
            d = smax(d, y - (0.705 - 0.04 * sstep(-0.1, 0.35, z) - 0.33 * sstep(0.36, 1.0, z)), 0.07);
            d = smax(d, (-0.165 + (y - 0.45) * 0.56 - z) * 0.87, 0.04);
            return d;
          };
          const noseF = (x, y, z) => { const tw = 1 - 0.25 * sstep(0.55, 1.1, z); return rbox(x / tw, y, z, [0, 0.27, 0.65], [0.34, 0.1, 0.45], 0.09) * tw; };
          const deckF = (x, y, z) => rbox(x, y, z, [0, 0.31, -0.5], [TUN, 0.032, 0.58], 0.03);
          const bodyF = (x, y, z) => smin(smin(hoodF(x, y, z), noseF(x, y, z), 0.07), deckF(x, y, z), 0.04);
          const seamY = (z) => 0.36 - 0.05 * sstep(0.5, 1.0, z);
          const paintCol = (x, y, z, nx, ny) => {
            let c;
            const deck = deckF(x, y, z) < 0.012 && hoodF(x, y, z) > 0.01 && z < -0.12;
            // (the tunnel's flanks and tail in the paint, its top dark: the chase camera sees the sled from behind)
            if (deck) c = ny > 0.55 ? C.deck : ny < -0.4 ? C.lowDk : mix3(C.paint, C.paintDk, sstep(0.3, -0.4, ny) * 0.5);
            else if (y < seamY(z)) c = mix3(C.low, C.lowDk, sstep(0.2, -0.8, ny) * 0.6);
            else {
              c = mix3(C.paint, C.paintDk, sstep(0.2, -0.8, ny) * 0.45);
              // the accent: a stripe over the cowl's crown and down the nose, and a flash along each flank
              const stripe = sstep(0.125, 0.1, abs(x)) * sstep(0.3, 0.6, ny) * sstep(-0.05, 0.05, z);
              const flash = sstep(0.034, 0.018, abs(y - (0.41 + 0.07 * sstep(0.7, -0.1, z)))) * sstep(0.2, 0.0, abs(ny)) * sstep(-0.1, 0.05, z);
              c = mix3(c, C.accent, max(stripe, flash));
            }
            return U.mul3(c, 0.88 + 0.12 * max(0, ny));
          };
          const onBody = (p, off, F) => {
            F = F || bodyF; let [x, y, z] = p; const g = [0, 0, 0];
            for (let i = 0; i < 8; i++) { const d = F(x, y, z); U.grad(F, x, y, z, 0.003, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; }
            U.grad(F, x, y, z, 0.003, g);
            return { p: [x + g[0] * off, y + g[1] * off, z + g[2] * off], n: g.slice() };
          };
          const rboxG = (w, h, d, r, bs) => {
            const g = new THREE.BoxGeometry(w, h, d, bs, bs, bs), p = g.attributes.position;
            for (let i = 0; i < p.count; i++) {
              const x = p.getX(i), y = p.getY(i), z = p.getZ(i), hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
              const cx = max(-hx, min(hx, x)), cy = max(-hy, min(hy, y)), cz = max(-hz, min(hz, z)), nn = v3.norm([x - cx, y - cy, z - cz]);
              p.setXYZ(i, cx + nn[0] * r, cy + nn[1] * r, cz + nn[2] * r);
            }
            g.computeVertexNormals(); return g;
          };
          const tube = (acc, pts, r, c, k, caps, radial) => U.addGeo(THREE, acc, U.taperTube(THREE, pts, pts.map(() => r), pts.map(() => r), radial || LV.tube, [0, 1, 0], !!caps), M4(), c, k, 0);

          if (LV.far) {
            /* ---- far: the body as a snapped sphere, the skis, the track and the screen as blocks */
            const s = new THREE.SphereGeometry(1, 12, 7), p = s.attributes.position, n = s.attributes.normal, c0 = [0, 0.38, -0.12], g = [0, 0, 0];
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i) * 0.66, p.getY(i) * 0.45, p.getZ(i) * 1.2]);
              let lo = 0, hi = 1.6; for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (bodyF(c0[0] + d[0] * m, c0[1] + d[1] * m, c0[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c0, d, lo); p.setXYZ(i, q[0], q[1], q[2]); U.grad(bodyF, q[0], q[1], q[2], 0.01, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            U.addGeo(THREE, body, s, M4(), (x, y, z, nx, ny, nz) => paintCol(x, y, z, nx, ny, nz), K.paint, 0);
            U.addGeo(THREE, body, new THREE.BoxGeometry(BELT.w * 2, 0.25, 1.02), M4().makeTranslation(0, 0.135, -0.47), C.rubber, K.rubber, 0);
            for (const sd of [1, -1]) {
              U.addGeo(THREE, body, new THREE.BoxGeometry(SKI.w * 2, 0.045, 0.98), M4().makeTranslation(sd * SKI_X, 0.03, SKI_Z + 0.02), C.accent, K.paint, 0);
              U.addGeo(THREE, body, new THREE.BoxGeometry(BOARD.w * 2, 0.05, BOARD.z1 - BOARD.z0), M4().makeTranslation(sd * BOARD.x, BOARD.y, (BOARD.z0 + BOARD.z1) / 2), C.lowDk, K.matte, 0);
              U.addGeo(THREE, body, new THREE.BoxGeometry(SKI_X - 0.26, 0.05, 0.16), M4().makeTranslation(sd * (SKI_X + 0.26) / 2, 0.22, SKI_Z), C.ink, K.matte, 0);
            }
            U.addGeo(THREE, body, new THREE.BoxGeometry(0.5, 0.28, 0.03), M4().compose(V([0, 0.82, 0.38]), Qe(-0.5, 0, 0), V([1, 1, 1])), C.screen, K.chrome, 0);
            U.addGeo(THREE, body, new THREE.BoxGeometry(0.38, 0.06, 0.5), M4().makeTranslation(0, SEAT[1] - 0.03, -0.42), C.seat, K.seat, 0);
            done('body');
          } else {
            U.mcPart(KIT, body, bodyF, [-0.48, 0.15, -1.1, 0.48, 0.74, 1.13], LV.body, true, paintCol, null, K.paint, 0);
            done('body');
            /* ---- the seat on the tunnel: a cushion, a little hump at the back, accent piping */
            U.addGeo(THREE, body, rboxG(0.42, 0.07, 0.84, 0.03, LV.detail + 1), M4().makeTranslation(0, SEAT[1] - 0.034, -0.52), (x, y) => mix3(C.seat, C.seatHi, sstep(0, 0.03, y)), K.seat, 0);
            U.addGeo(THREE, body, rboxG(0.41, 0.1, 0.3, 0.045, LV.detail + 1), M4().compose(V([0, SEAT[1] + 0.02, -0.8]), Qe(-0.06, 0, 0), V([1, 1, 1])), (x, y) => mix3(C.seat, C.seatHi, sstep(0.0, 0.045, y)), K.seat, 0);
            if (LV.detail) for (const sd of [1, -1]) tube(body, [[sd * 0.212, SEAT[1] - 0.012, -0.1], [sd * 0.212, SEAT[1] - 0.012, -0.93]], 0.008, C.accent, K.paint, true, 4);
            done('seat');
            /* ---- the tunnel's flanks (in the paint, an accent pin line) down to the running boards: broad plates, their
             * outer edges kicked up and out in the accent (the width the chase camera reads) */
            for (const sd of [1, -1]) {
              U.addGeo(THREE, body, rboxG(0.03, 0.13, 1.0, 0.012, LV.detail + 1), M4().makeTranslation(sd * (TUN - 0.013), 0.262, -0.55),
                (x, y, z, nx, ny) => (nx * sd > 0.3 ? (abs(y - 0.03) < 0.011 ? C.accent : mix3(C.paint, C.paintDk, 0.2)) : C.lowDk), K.paint, 0);
              const bl = BOARD.z1 - BOARD.z0, bz = (BOARD.z0 + BOARD.z1) / 2;
              U.addGeo(THREE, body, rboxG(BOARD.w * 2, 0.04, bl, 0.014, LV.detail + 1), M4().makeTranslation(sd * BOARD.x, BOARD.y, bz),
                (x, y, z, nx, ny) => (ny > 0.6 ? mix3(mix3(C.deck, C.paintDk, 0.3), C.chromeDk, 0.1 + (LV.detail > 1 && abs(((z + 0.4) * 9) % 1 - 0.5) < 0.12 ? 0.25 : 0)) : C.lowDk), K.matte, 0);
              U.addGeo(THREE, body, rboxG(0.014, 0.075, bl - 0.04, 0.006, 1), M4().compose(V([sd * (BOARD.x + BOARD.w - 0.004), BOARD.y + 0.03, bz]), Qe(0, 0, -sd * 0.38), V([1, 1, 1])),
                (x, y, z, nx) => (nx * sd > 0 ? C.accent : C.ink), K.paint, 0);
            }
            done('boards');
            /* ---- the windscreen's frame (the glass itself is its own mesh, below) */
            const scr = (u, v) => [u * (0.27 - 0.06 * v), 0.625 + 0.3 * v - 0.025 * u * u, 0.43 - 0.13 * v - 0.08 * u * u * (1 - 0.3 * v)];
            const fr = []; for (let i = 0; i <= 8; i++) fr.push(scr(-1 + 2 * i / 8, 1));
            tube(body, fr, 0.008, C.ink, K.matte, true, max(3, LV.tube - 2));
            for (const sd of [1, -1]) { const e = []; for (let i = 0; i <= 3; i++) e.push(scr(sd, i / 3)); tube(body, e, 0.008, C.ink, K.matte, true, max(3, LV.tube - 2)); }
            done('screenFrame');
            /* ---- the handlebar's post up from the cowl (the bar: below) */
            tube(body, [[0, 0.6, 0.1], [0, 0.71, 0.155]], 0.024, C.chromeDk, K.chrome, false);
            done('post');
            /* ---- the front suspension, long and out in the open: upper and lower A-arms from each ski's knuckle back into
             * the nose under the flared skirts, a shock with an accent coil from the lower arm up into the cowl's flank */
            for (const sd of [1, -1]) {
              const kx = sd * (SKI_X - 0.035), top = [kx, 0.275, SKI_Z], bot = [kx, 0.15, SKI_Z], ix = sd * 0.25;
              tube(body, [top, [ix, 0.33, SKI_Z - 0.17]], 0.019, C.arm, K.chrome, false);
              tube(body, [top, [ix, 0.33, SKI_Z + 0.15]], 0.019, C.arm, K.chrome, false);
              tube(body, [bot, [ix, 0.21, SKI_Z - 0.15]], 0.018, C.arm, K.chrome, false);
              tube(body, [bot, [ix, 0.21, SKI_Z + 0.13]], 0.018, C.arm, K.chrome, false);
              const a = [sd * (SKI_X - 0.1), 0.17, SKI_Z - 0.03], b = [sd * 0.275, 0.5, SKI_Z - 0.1], m = v3.lerp(a, b, 0.55);
              if (!LV.detail) tube(body, [a, b], 0.026, C.accent, K.paint, false);
              else {
                // the shock: its body, a chrome shaft, an accent coil round both
                tube(body, [a, m], 0.025, C.ink, K.matte, true);
                tube(body, [m, b], 0.013, C.chrome, K.chrome, false);
                const coil = [], turns = LV.detail > 1 ? 7 : 5, nC = turns * (LV.detail > 1 ? 8 : 5), ax = v3.norm(v3.sub(b, a)), sx = v3.norm(v3.cross(ax, [0, 0, 1])), sy = v3.cross(sx, ax);
                for (let i = 0; i <= nC; i++) { const t = 0.12 + 0.74 * i / nC, an = (i / nC) * turns * PI * 2; coil.push(v3.add(v3.add(v3.lerp(a, b, t), sx, 0.041 * cos(an)), sy, 0.041 * sin(an))); }
                U.addGeo(THREE, body, U.taperTube(THREE, coil, coil.map(() => 0.009), coil.map(() => 0.009), 4, (i) => ax, false), M4(), C.accent, K.paint, 0);
              }
            }
            done('suspension');
            /* ---- the front bumper: a heavy hoop round the nose */
            {
              const hp = [[0.25, 0.27, 0.84], [0.33, 0.255, 0.96], [0.315, 0.24, 1.065], [0.2, 0.232, 1.122], [0, 0.228, 1.138]];
              const loop = hp.concat(hp.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z]));
              tube(body, loop, 0.024, C.arm, K.chrome, true);
            }
            done('bumper');
            /* ---- lamps: twin headlamps in the nose, a tail light across the back of the tunnel */
            for (const sd of [1, -1]) {
              const hl = onBody([sd * 0.12, 0.4, 0.96], 0), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(hl.n));
              U.addGeo(THREE, body, new THREE.SphereGeometry(0.055, LV.seg, max(3, LV.seg >> 2), 0, PI * 2, 0, PI * 0.38).rotateX(PI / 2), M4().compose(V(v3.add(hl.p, hl.n, -0.03)), q, V([1.25, 0.8, 1])), C.lamp, K.glow, 0);
              if (LV.detail) U.addGeo(THREE, body, new THREE.TorusGeometry(0.055, 0.009, 4, LV.seg), M4().compose(V(v3.add(hl.p, hl.n, 0.0)), q, V([1.25, 0.8, 1])), C.ink, K.matte, 0);
            }
            U.addGeo(THREE, body, rboxG(0.46, 0.035, 0.02, 0.008, 1), M4().makeTranslation(0, 0.3, -1.085), C.tail, K.glow, 0);
            done('lamps');
            /* ---- the back: a chrome grab bar round the tail, the snow flap (in the paint, an accent band: the racer, from the chase camera) */
            const gb = [[0.3, 0.33, -0.86], [0.3, 0.38, -1.06], [0.21, 0.39, -1.12], [-0.21, 0.39, -1.12], [-0.3, 0.38, -1.06], [-0.3, 0.33, -0.86]];
            tube(body, gb, 0.016, C.chrome, K.chrome, true);
            U.addGeo(THREE, body, rboxG(0.5, 0.13, 0.012, 0.006, 1), M4().compose(V([0, 0.15, -1.1]), Qe(0.2, 0, 0), V([1, 1, 1])), (x, y) => (abs(y) < 0.018 ? C.accent : C.paint), K.paint, 0);
            done('tail');
            /* ---- the race number on both flanks: a white roundel ringed in the accent, the digits in ink */
            if (LV.digits) {
              const num = String(o.number === undefined || o.number === null ? '' : o.number).replace(/[^0-9]/g, '').slice(0, 2);
              for (const sd of [1, -1]) {
                const rc = onBody([sd * 0.4, 0.515, 0.06], 0.005, hoodF), n = rc.n, q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(n));
                U.addGeo(THREE, body, new THREE.CircleGeometry(0.085, LV.seg), M4().compose(V(rc.p), q, V([1, 1, 1])), C.white, K.paint, 0);
                U.addGeo(THREE, body, new THREE.TorusGeometry(0.085, 0.01, 3, LV.seg), M4().compose(V(rc.p), q, V([1, 1, 1])), C.accent, K.paint, 0);
                if (num) {
                  // seven segments a digit, read the right way round on each flank
                  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
                  // (across: toward the nose on the right flank, the tail on the left, as a reader facing it sees it)
                  const ex = new THREE.Vector3(0, 0, sd > 0 ? -1 : 1).projectOnPlane(V(n)).normalize(), ey = V(n).clone().cross(ex).normalize();
                  // (two digits a little narrower, a clear space between them, and a 1 in the middle of its place, not at its
                  // right: 11 read as one block and 12 as an E, 9 Oct)
                  const n0 = num.length, W = n0 > 1 ? 0.03 : 0.034, H = n0 > 1 ? 0.064 : 0.06, T = 0.011, gap = 0.058;
                  for (let di = 0; di < n0; di++) {
                    const cx = (di - (n0 - 1) / 2) * gap - (num[di] === '1' ? W / 2 : 0);
                    const segs = { a: [0, H / 2, 1], g: [0, 0, 1], d: [0, -H / 2, 1], f: [-W / 2, H / 4, 0], b: [W / 2, H / 4, 0], e: [-W / 2, -H / 4, 0], c: [W / 2, -H / 4, 0] };
                    for (const k of SEG[num[di]]) {
                      const [sx0, sy0, hor] = segs[k], pc = V(rc.p).addScaledVector(ex, cx + sx0).addScaledVector(ey, sy0).addScaledVector(V(n), 0.002);
                      const m = new THREE.Matrix4().makeBasis(ex, ey, V(n)).setPosition(pc);
                      U.addGeo(THREE, body, new THREE.PlaneGeometry(hor ? W + T : T, hor ? T : H / 2 + T), m, C.ink, K.matte, 0);
                    }
                  }
                }
              }
              done('number');
            }
          }

          /* ---- the track: the belt (one loop), its wheels; the cleats are their own mesh, run round the loop */
          const bp = beltPath(LV.beltN).map(([z, y]) => [0, y, z]);
          if (!LV.far) {
            U.addGeo(THREE, body, U.taperTube(THREE, bp, bp.map(() => BELT.t), bp.map(() => BELT.w), LV.belt, [1, 0, 0], false, true), M4(), C.rubber, K.rubber, 0);
            done('belt');
          }
          const wheels = [];
          // (one accumulator into another, moved by [x, y, z]: colours and finishes kept)
          const append = (dst, src, off) => {
            const b = dst.n;
            for (let i = 0; i < src.n; i++) {
              dst.P.push(src.P[i * 3] + off[0], src.P[i * 3 + 1] + off[1], src.P[i * 3 + 2] + off[2]); dst.N.push(src.N[i * 3], src.N[i * 3 + 1], src.N[i * 3 + 2]);
              dst.C.push(src.C[i * 3], src.C[i * 3 + 1], src.C[i * 3 + 2]); dst.K.push(src.K[i * 4], src.K[i * 4 + 1], src.K[i * 4 + 2], src.K[i * 4 + 3]); dst.B.push(0, 0, 0);
            }
            for (const i of src.I) dst.I.push(b + i);
            dst.n += src.n;
          };
          if (!LV.far && LV.detail) {
            // the idler at the back and the drive sprocket in front, a disc a side inside the belt with five holes' worth of
            // spokes (they show it turning); bogies along the bottom run (desktop)
            const disc = (R) => {
              const a = new U.Acc();
              for (const sd of [1, -1]) {
                U.addGeo(THREE, a, new THREE.CylinderGeometry(R, R, 0.04, LV.seg, 1).rotateZ(PI / 2), M4().makeTranslation(sd * 0.21, 0, 0), C.chromeDk, K.chrome, 0);
                for (let i = 0; i < 5; i++) { const an = i / 5 * PI * 2; U.addGeo(THREE, a, new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.044, 6).rotateZ(PI / 2), M4().makeTranslation(sd * 0.213, R * 0.55 * cos(an), R * 0.55 * sin(an)), C.ink, K.matte, 0); }
              }
              return a;
            };
            // (they turn on the desktop level only; the phone's are part of the body, as the bogies always are)
            for (const [z, y, R] of [[IDL.z, IDL.y, IDL.r - BELT.t * 1.2], [DRV.z, DRV.y, DRV.r - BELT.t * 1.2]]) {
              if (LV.detail > 1) wheels.push({ z, y, R, acc: disc(R) });
              else append(body, disc(R), [0, y, z]);
            }
            if (LV.bogie) for (const z of [-0.36, -0.64]) append(body, disc(0.05), [0, 0.075, z]);
            done('trackWheels');
          }

          const toMesh = (acc, name) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3)); g.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
            g.setIndex(acc.n > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));
            g.computeBoundingSphere();
            const m = new THREE.Mesh(g, toon); m.name = name; return m;
          };
          const group = new THREE.Group(); group.name = 'snow-sled-' + detail;

          /* ---- the skis, each on its spindle (a pivot that steers): the blade with its curled tip, a keel, the spindle */
          const skiAcc = new U.Acc(), sp = [];
          const nS = LV.ski;
          for (let i = 0; i <= nS; i++) {
            const t = i / nS, z = SKI.z0 + SKI.len * t, up = sstep(0.62, 1, t);
            sp.push([0, SKI.t + 0.006 + 0.18 * up * up + 0.02 * sstep(0.0, 0.08, 0.08 - t), z - 0.06 * up * up * up]);
          }
          U.addGeo(THREE, skiAcc, U.taperTube(THREE, sp, sp.map((_, i) => SKI.w * (1 - 0.22 * sstep(0.85, 1, i / nS))), sp.map(() => SKI.t), max(4, LV.tube), [0, 1, 0], true), M4(), (x, y, z, nx, ny) => (ny > -0.4 ? C.accent : C.ink), K.paint, 0);
          if (!LV.far) {
            tube(skiAcc, [[0, 0.004, SKI.z0 + 0.06], [0, 0.004, 0.28]], 0.009, C.chrome, K.chrome, true, 4);
            tube(skiAcc, [[0, 0.03, 0.0], [0, 0.325, 0.0]], 0.026, C.chromeDk, K.chrome, true);   // (tall: the arms stay on it as the ski hangs or tucks)
            if (LV.detail) {
              // a raised rib down the ski's back, the saddle the spindle sits in, the knuckle the arms meet
              U.addGeo(THREE, skiAcc, rboxG(0.04, 0.04, 0.66, 0.012, 1), M4().makeTranslation(0, SKI.t + 0.022, -0.07), C.accentDk, K.paint, 0);
              U.addGeo(THREE, skiAcc, rboxG(0.075, 0.06, 0.17, 0.014, 1), M4().makeTranslation(0, 0.055, 0.0), C.ink, K.matte, 0);
              U.addGeo(THREE, skiAcc, rboxG(0.06, 0.16, 0.065, 0.015, 1), M4().makeTranslation(0, 0.215, 0.0), C.arm, K.chrome, 0);
            }
          }
          const skis = [];
          if (!LV.far) for (const sd of [1, -1]) {
            const pivot = new THREE.Group(); pivot.position.set(sd * SKI_X, 0, SKI_Z); pivot.rotation.order = 'YXZ';
            const m = toMesh(skiAcc, 'sled-ski'); pivot.add(m); group.add(pivot); skis.push(pivot);
          }

          /* ---- the handlebar: a short yoke whose grips run through the rider's hands */
          // (static, in the body's draw: the grips must stay in the hands, and a draw a racer is worth more than a twitch)
          const bar = { position: { x: 0, y: 0.71, z: 0.155 } };
          if (!LV.far) {
            const hA = o.hands && o.hands.H ? o.hands.H : [0.1185, 0.792, 0.201], hT = v3.norm(o.hands && o.hands.T ? o.hands.T : [-0.479, 0.77, 0.421]);
            const barAcc = new U.Acc(), rel = (p) => [p[0] - bar.position.x, p[1] - bar.position.y, p[2] - bar.position.z];
            for (const sd of [1, -1]) {
              const H = [sd * abs(hA[0]), hA[1], hA[2]], T = [sd > 0 ? hT[0] : -hT[0], hT[1], hT[2]];
              const g0 = v3.add(H, T, -0.06), g1 = v3.add(H, T, 0.05), elbow = [sd * (abs(g0[0]) + 0.035), g0[1] - 0.03, g0[2] - 0.01];
              // the bar: from the clamp out and up to the grip's foot
              tube(barAcc, [rel([0, 0.71, 0.155]), rel([sd * 0.06, 0.712, 0.158]), rel(elbow), rel(g0)], 0.016, C.chromeDk, K.chrome, false);
              // the grip (rubber), an accent bar-end
              tube(barAcc, [rel(g0), rel(g1)], 0.021, C.rubber, K.rubber, true);
              tube(barAcc, [rel(g1), rel(v3.add(g1, T, 0.014))], 0.024, C.accent, K.paint, true);
            }
            U.addGeo(THREE, barAcc, rboxG(0.08, 0.04, 0.05, 0.012, 1), M4().makeTranslation(0, 0.005, 0.0), C.ink, K.matte, 0);
            append(body, barAcc, [bar.position.x, bar.position.y, bar.position.z]); done('bar');
          }

          group.add(toMesh(body, 'sled-body'));

          /* ---- the track's wheels (spinning), the cleats */
          const wheelMeshes = wheels.map((w) => { const pv = new THREE.Group(); pv.position.set(0, w.y, w.z); const m = toMesh(w.acc, 'sled-wheel'); pv.add(m); group.add(pv); return { pivot: pv, mesh: m, R: w.R }; });
          let lugs = null;
          if (LV.lugs) {
            // the loop's arc length, and a cleat (a rounded bar across the belt) at every station; placed again each
            // frame the sled moves, a step further round
            const L = [0]; for (let i = 1; i <= bp.length; i++) { const a = bp[i - 1], b = bp[i % bp.length]; L.push(L[i - 1] + hypot(b[1] - a[1], b[2] - a[2])); }
            const len = L[bp.length], n = LV.lugs, gap = len / n;
            const geo = new THREE.BufferGeometry(), P = new Float32Array(n * 8 * 3), N = new Float32Array(n * 8 * 3), Cc = new Float32Array(n * 8 * 3), Kz = new Float32Array(n * 8 * 4), I = [];
            for (let i = 0; i < n * 8; i++) { Cc.set(C.cleat, i * 3); Kz.set(K.rubber, i * 4); }
            const F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
            for (let l = 0; l < n; l++) for (const f of F) { const b = l * 8; I.push(b + f[0], b + f[1], b + f[2], b + f[0], b + f[2], b + f[3]); }
            geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); geo.setAttribute('kz', new THREE.BufferAttribute(Kz, 4)); geo.setIndex(I);
            const at = (s) => {
              s = ((s % len) + len) % len;
              let i = 1; while (i < L.length - 1 && L[i] < s) i++;
              const a = bp[i - 1], b = bp[i % bp.length], t = (s - L[i - 1]) / (L[i] - L[i - 1] || 1), ty = (b[1] - a[1]) / (L[i] - L[i - 1] || 1), tz = (b[2] - a[2]) / (L[i] - L[i - 1] || 1);
              return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, ty, tz];
            };
            const place = (phase) => {
              const hx = BELT.w * 0.92, ht = 0.011, hl = 0.016;
              for (let l = 0; l < n; l++) {
                const [y, z, ty, tz] = at(l * gap + phase), ny = tz, nz = -ty, cy = y + ny * (BELT.t + ht * 0.6), cz = z + nz * (BELT.t + ht * 0.6);
                for (let v = 0; v < 8; v++) {
                  const sx = v & 1 ? 1 : -1, sn = v & 2 ? 1 : -1, st = v & 4 ? 1 : -1, o3 = (l * 8 + v) * 3;
                  P[o3] = sx * hx; P[o3 + 1] = cy + ny * sn * ht + ty * st * hl; P[o3 + 2] = cz + nz * sn * ht + tz * st * hl;
                  const k = 1 / sqrt(0.2 + 1 + 0.5); N[o3] = sx * 0.45 * k; N[o3 + 1] = (ny * sn + ty * st * 0.7) * k; N[o3 + 2] = (nz * sn + tz * st * 0.7) * k;
                }
              }
              geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
            };
            place(0); geo.computeBoundingSphere();
            const m = new THREE.Mesh(geo, toon); m.name = 'sled-cleats'; group.add(m);
            lugs = { mesh: m, place, gap, phase: 0 };
          }

          /* ---- the windscreen: smoked glass (the helmet's program), two faces so it is glass from either side; at the
           * middle level a tinted toon pane in the one draw */
          let glass = null;
          {
            const scr = (u, v) => [u * (0.27 - 0.06 * v), 0.625 + 0.3 * v - 0.025 * u * u, 0.43 - 0.13 * v - 0.08 * u * u * (1 - 0.3 * v)];
            const [gu, gv] = LV.grid, Pp = [], Nn = [], Ii = [], nrm = (u, v) => { const e = 0.01, a = scr(u + e, v), b = scr(u - e, v), c = scr(u, v + e), d = scr(u, v - e); return v3.norm(v3.cross(v3.sub(c, d), v3.sub(a, b))); };
            for (const side of [1, -1]) {
              const b0 = Pp.length / 3;
              for (let j = 0; j <= gv; j++) for (let i = 0; i <= gu; i++) {
                const u = -1 + 2 * i / gu, v = j / gv, p = scr(u, v), nn = nrm(u, v);
                Pp.push(...v3.add(p, nn, side * 0.004)); Nn.push(...v3.scale(nn, side));
              }
              for (let j = 0; j < gv; j++) for (let i = 0; i < gu; i++) {
                const a = b0 + j * (gu + 1) + i, b = a + 1, c = a + gu + 1, d = c + 1;
                if (side > 0) Ii.push(a, b, d, a, d, c); else Ii.push(a, d, b, a, c, d);
              }
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setIndex(Ii);
            if (detail === 'desktop' || detail === 'phone') {
              glass = new THREE.Mesh(g, o.glassMat || root.mat.glass(THREE)); glass.name = 'sled-glass'; glass.renderOrder = 2;
              glass.castShadow = false; glass.receiveShadow = false; glass.userData.noShadow = true; group.add(glass);
            } else if (!LV.far) {
              const a = new U.Acc(); U.addGeo(THREE, a, g, M4(), (x, y) => mix3(C.screen, C.screenHi, sstep(0.75, 0.98, y) * 0.6), K.chrome, 0);
              group.add(toMesh(a, 'sled-screen'));
            }
          }

          let tris = 0; group.traverse((m) => { if (m.isMesh) tris += m.geometry.index.count / 3; });
          const sus = { x: 0, v: 0 };
          parts.skis = skiAcc.I.length / 3 * 2; parts.cleats = lugs ? lugs.mesh.geometry.index.count / 3 : 0; parts.glass = glass ? glass.geometry.index.count / 3 : 0;
          group.traverse((m) => { if (m.isMesh) { m.castShadow = m !== glass; m.receiveShadow = m !== glass; } });
          group.userData.kart = {
            seat: SEAT.slice(), level: detail, tris, ms: Math.round(now() - T0), parts, sled: true, skis, glass, cleats: lugs ? lugs.mesh : null,
            emit: JSON.parse(JSON.stringify(EMIT)), mount: JSON.parse(JSON.stringify(MOUNT)),
            // speed in m/s (+ forward), steer -1..1 (+ left): the skis steer as the karts' front wheels do, the track's
            // wheels and cleats run with the speed (the bar stays still: its grips are in the hands). air (flying off a
            // ramp or a crest) and land (the frame it touches down): the front suspension hangs the skis 6 cm, tips
            // down, in the air; on landing they slap flat and their tips kick up and settle (a damped spring; the
            // roster's drive() passes air and land for a sled only)
            animate(dt, a) {
              const v = a.speed || 0, s = a.steer || 0;
              if (a.land) { sus.x = 0.35 + 0.75 * max(0, -sus.x); sus.v = 0; }
              if (dt > 0 && (a.air || sus.x || sus.v)) {
                const k = min(dt, 0.05); sus.v += (110 * ((a.air ? -1 : 0) - sus.x) - 13 * sus.v) * k; sus.x = max(-1.2, min(1.5, sus.x + sus.v * k));
                if (!a.air && abs(sus.x) < 1e-3 && abs(sus.v) < 1e-2) sus.x = sus.v = 0;
              }
              const ext = max(0, -sus.x), cmp = max(0, sus.x);
              for (const p of skis) { p.rotation.y = s * 0.42; p.position.y = -0.06 * ext; p.rotation.x = 0.14 * ext - 0.05 * cmp; }
              for (const w of wheelMeshes) w.mesh.rotation.x += (v / w.R) * dt;
              if (lugs && v && dt > 0 && lugs.mesh.visible !== false) { lugs.phase = (lugs.phase + v * dt) % lugs.gap; lugs.place(lugs.phase); }
            },
          };
          return group;
        }
        root.SnowSled = SnowSled;
        root.SLED = { SEAT, LEVELS, SKI_X, SKI_Z, MOUNT, EMIT };
      })(KR);

      /* ================================================================== the eight, as racers
       * KR.RACERS: who each is (name, colour, handling), its faces for the race's moments, and where a Mog's colours go;
       * KR.build(id, level, M): one of its levels of detail, the character in its kart (the lineup's composition: the
       * driver's origin on the kart's seat), the eyes kept out of the shadow pass, the far level (and the middle level's
       * kart) merged into one draw a material. M = the racer's own materials { toon, eye, glass, water }. */
      (function (root) {
        'use strict';
        const { abs, min, max, exp } = Math;
        const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
        const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
        // the handling (each about 1: top 0.95-1.05, accel 0.85-1.2, handling 0.9-1.1, mass 0.8-1.4, drift 0.9-1.15): the
        // light ones quick off the line and nimble, the heavies a touch faster flat out and hard to shove, the drifters
        // charging sooner; never more than 1.5% apart at the top, so a race stays a race (the rivals' own pace, 0.94 to 1,
        // is the bigger difference)
        const ALL = {};
        // faces: race (the default), drift (a tier charging), boost, hit, sad (spun out, beaten), celebrate (the podium)
        const F = (race, drift, boost, hit, sad, celebrate) => ({ race, drift, boost, hit, sad, celebrate });
        const RACERS = {
          pepe: { name: 'Pepe', color: '#4FA03A', stats: ALL, eye: 'pepe', jersey: 'zone', paint: '#F07A9E',
            face: F({}, { smug: 1 }, { feelsgood: 1 }, { sad: 1 }, { sad: 1 }, { celebrate: 1 }) },
          doge: { name: 'Doge', color: '#E8B04F', stats: { top: 0.985, accel: 1.12, handling: 1.05, mass: 0.88 }, eye: 'dog', jersey: '#D7342F', paint: '#D33A2C',
            face: F({ nervous: 0.55 }, { sideeye: 1 }, { celebrate: 0.7 }, { hit: 1 }, { nervous: 1 }, { celebrate: 1 }) },
          shiba: { name: 'Shiba', color: '#E0612B', stats: { top: 0.99, accel: 1.05, handling: 1.03, mass: 0.92, drift: 1.1 }, eye: 'dog', jersey: '#FF6FA3', paint: '#C8202C',
            face: F({ happy: 1 }, { grin: 1 }, { celebrate: 0.7 }, { hit: 1 }, { hit: 0.55 }, { celebrate: 1 }) },
          bike: { name: 'Bike Tyson', color: '#D7263D', stats: { top: 0.985, accel: 1.15, handling: 1.06, mass: 0.82 }, eye: 'dog', jersey: '#FFC93C', paint: '#D7263D', bike: true,
            face: F({ determined: 1 }, { determined: 1 }, { boost: 1 }, { hit: 1 }, { hit: 0.5 }, { celebrate: 1 }) },
          bull: { name: 'Bull Run', color: '#0E9AA4', stats: { top: 1.015, accel: 0.92, handling: 0.96, mass: 1.25, drift: 0.95 }, eye: 'dog', jersey: '#E9A62C', paint: '#0E9AA4',
            face: F({ grin: 1 }, { charge: 1 }, { charge: 1 }, { hit: 1 }, { hit: 0.5 }, { celebrate: 1 }) },
          bear: { name: 'Big Bear', color: '#7A4A2A', stats: { top: 1.015, accel: 0.9, handling: 0.95, mass: 1.35, drift: 0.93 }, eye: 'dog', jersey: '#B81F2E', paint: '#F2A51C',
            face: F({ grumpy: 1 }, { growl: 1 }, { growl: 0.7 }, { hit: 1 }, { grumpy: 1, hit: 0.3 }, { celebrate: 1 }) },
          whale: { name: 'The Whale', color: '#3F88E2', stats: { top: 1.01, accel: 0.92, handling: 0.96, mass: 1.3 }, eye: 'dog', jersey: '#3F88E2', paint: '#FFC23A',
            face: F({ smug: 1 }, { smug: 1 }, { puff: 1 }, { hit: 1 }, { hit: 0.5 }, { celebrate: 1 }) },
          mooncat: { name: 'Moon Cat', color: '#A592DC', stats: { top: 0.99, accel: 1.05, handling: 1.04, mass: 0.88, drift: 1.12 }, eye: 'cat', jersey: '#A592DC', paint: '#E9B84A',
            face: F({}, { focus: 1 }, { starry: 1 }, { hit: 1 }, { hit: 0.5 }, { celebrate: 1 }) },
        };
        const IDS = ['pepe', 'doge', 'shiba', 'bike', 'bull', 'bear', 'whale', 'mooncat'];
        const now = () => (typeof performance !== 'undefined' ? performance : Date).now();

        /* ---- the snow sled as a ride (Aspen GP, 9 Oct): any racer but Bike Tyson (his body is his bike) sits on
         * root.SnowSled instead of its own kart when asked ({ ride: 'sled' }), or always when it has no kart of its own (a
         * racer added for a world, below). Each rider's fit on the sled's seat: { y, z } moves its origin, s scales it
         * (its hands come along: the sled's grips are built through them, from the hands' wheel, HANDS). As they come, no
         * racer rides it: nothing here is used unless a world asks. */
        const SLED_FIT = {
          pepe: { y: 0, z: 0, s: 1 }, doge: { y: 0, z: 0, s: 1 }, shiba: { y: 0, z: 0, s: 1 }, bull: { y: -0.02, z: -0.02, s: 0.96 },
          bear: { y: -0.03, z: -0.04, s: 0.93 }, whale: { y: -0.02, z: -0.03, s: 0.95 }, mooncat: { y: 0, z: -0.01, s: 0.98 },
        };
        // where each one's hands are: the wheel its kart builds under them (kart-roster's DogFinal.WHEEL for most; Pepe's
        // and Big Bear's own)
        const HANDS = { pepe: { c: [0, 0.335, 0.425], r: 0.138, tilt: 0.5, grip: 0.52 }, bear: { c: [0, 0.37, 0.46], r: 0.15, tilt: 0.5, grip: 0.5 } };
        // the seat on its own kart (Laser Eyes' mounts were measured on the karts: kart-items.js takes the eyes from them)
        const KART_SEAT = { pepe: [0, 0.33, -0.18] };
        // the sled's own paint for each, as they come (body, accent, race number); a world's { paint, accent, number } wins
        const SLED_PAINT = {
          pepe: ['#2F9E44', '#F5E663', 1], doge: ['#D33A2C', '#F6E7C8', 2], shiba: ['#C8202C', '#FFFFFF', 3], bull: ['#0E9AA4', '#E9A62C', 5],
          bear: ['#F2A51C', '#2A1A12', 6], whale: ['#3F88E2', '#FFC23A', 7], mooncat: ['#5B4BA8', '#E9B84A', 8],
        };
        const ADD = {};
        const say = (m) => { if (typeof warn === 'function') warn(m); else if (typeof console !== 'undefined') console.warn(m); };
        function rideOf(id, o) {
          const want = (o && o.ride) || (ADD[id] && !ADD[id].kart ? 'sled' : null);
          if (!want) return null;
          if (want !== 'sled') { say('ctx.kart.racer: there is no ride "' + want + '" (the one is \'sled\'); ' + ((RACERS[id] || {}).name || id) + ' keeps its own.'); return ADD[id] && !ADD[id].kart ? 'sled' : null; }
          if (id === 'bike') { say('ctx.kart.racer: Bike Tyson is his own bike; he does not ride the sled.'); return null; }
          return 'sled';
        }
        const handsOf = (id) => { const W = (ADD[id] && ADD[id].wheel) || HANDS[id] || root.DogFinal.WHEEL, a = W.grip, ct = Math.cos(W.tilt), st = Math.sin(W.tilt);
          const rad = [Math.cos(a), ct * Math.sin(a), st * Math.sin(a)];
          return { H: [W.c[0] + rad[0] * W.r, W.c[1] + rad[1] * W.r, W.c[2] + rad[2] * W.r], T: [-Math.sin(a), ct * Math.cos(a), st * Math.cos(a)] }; };
        // the rider's place on the sled: its origin (seat), its scale, its eyes (the character's frame, if it gave them)
        function sledFit(id) {
          if (!RACERS[id] || id === 'bike') return null;
          const f = (ADD[id] && ADD[id].sled) || SLED_FIT[id] || { y: 0, z: 0, s: 1 }, S0 = root.SLED.SEAT;
          return { seat: [S0[0], S0[1] + (f.y || 0), S0[2] + (f.z || 0)], s: f.s || 1, eyes: ADD[id] && ADD[id].eyes ? ADD[id].eyes.slice() : null, kartSeat: (KART_SEAT[id] || [0, 0.27, -0.14]).slice() };
        }

        /* ---- a racer a world adds (stage 2: Aspen GP's own, in an add-on file of its own that defines
         * kartRosterAddons(add, KR), called once when this library is first built). add(id, def): id is letters only
         * (ctx.kart.racer strips the rest); def = { name, color, stats, eye ('dog' | 'cat' | 'pepe'), jersey, paint,
         * accent, number, face: { race, drift, boost, hit, sad, celebrate } (weights by the face's own names),
         * char(THREE, KIT, level, { toon, eyeMat, glassMat, accent, def }) -> a group whose userData.racer is the dogs'
         * API, wheel (where its hands are: DogFinal.WHEEL's shape), eyes ([x, y, z], the character's frame: Laser Eyes),
         * sled: { y, z, s } (its fit), kart (optional: (THREE, KIT, level, { toon, glassMat, water }) -> a kart as the
         * kit's; without one it always rides the sled), persona } or { base: 'otherid', ...what differs } (the same body,
         * its own name, colours and number). A bad def is skipped with a warning; it never stops the race. */
        function add(id, d) {
          try {
            id = String(id || '').toLowerCase();
            if (!/^[a-z]{2,24}$/.test(id)) { say('kartRosterAddons: "' + id + '" is not a racer id (2-24 letters, a-z).'); return false; }
            if (RACERS[id] && !ADD[id]) { say('kartRosterAddons: "' + id + '" is one of the roster\'s own.'); return false; }
            d = d || {};
            if (d.base) { const b = ADD[d.base]; if (!b) { say('kartRosterAddons: ' + id + '\'s base "' + d.base + '" is not added (add it first).'); return false; } d = Object.assign({}, b.def, d); delete d.base; }
            if (typeof d.char !== 'function') { say('kartRosterAddons: ' + id + ' has no char(THREE, KIT, level, o) builder.'); return false; }
            const hex = (h, f) => (typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? h : f);
            const color = hex(d.color, '#888888'), fc = d.face || {}, f0 = fc.race || {};
            RACERS[id] = { name: typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 24) : id, color, stats: d.stats && typeof d.stats === 'object' ? d.stats : ALL,
              eye: ['dog', 'cat', 'pepe'].indexOf(d.eye) >= 0 ? d.eye : 'dog', jersey: d.jersey === 'zone' ? 'zone' : hex(d.jersey, color), paint: hex(d.paint, color),
              face: F(f0, fc.drift || f0, fc.boost || f0, fc.hit || f0, fc.sad || fc.hit || f0, fc.celebrate || f0), added: true };
            ADD[id] = { def: d, char: d.char, kart: typeof d.kart === 'function' ? d.kart : null, wheel: d.wheel && d.wheel.c ? d.wheel : null,
              eyes: Array.isArray(d.eyes) && d.eyes.length === 3 ? d.eyes.slice() : null, sled: d.sled && typeof d.sled === 'object' ? d.sled : null,
              accent: hex(d.accent, null), number: d.number === undefined ? null : d.number, persona: typeof d.persona === 'string' ? d.persona : null };
            if (IDS.indexOf(id) < 0) IDS.push(id);
            return true;
          } catch (e) { say('kartRosterAddons: ' + id + ' was skipped (' + (e && e.message) + ').'); return false; }
        }

        /* ---- a Mog's colours: every vertex colour near the racer's own (its hue, a fair saturation, within a band of its
         * lightness, so the shading and the ambient occlusion baked in come along) turned to the new one; the rest kept */
        function recolor(THREE, meshes, from, to, done) {
          const a = new THREE.Color(from), b = new THREE.Color(to), A = {}, B = {}, H = {}, c = new THREE.Color();
          a.getHSL(A, THREE.SRGBColorSpace); b.getHSL(B, THREE.SRGBColorSpace);
          for (const m of meshes) {
            const col = m.geometry && m.geometry.attributes.color;
            if (!col || done.has(col)) continue;
            done.add(col);
            const n = col.itemSize;
            for (let i = 0; i < col.count; i++) {
              c.setRGB(col.array[i * n], col.array[i * n + 1], col.array[i * n + 2]); c.getHSL(H, THREE.SRGBColorSpace);
              let dh = abs(H.h - A.h); dh = min(dh, 1 - dh) * 360;
              const lr = H.l / max(0.02, A.l);
              const w = (1 - sstep(10, 24, dh)) * sstep(0.45, 0.75, H.s / max(0.05, A.s)) * sstep(0.22, 0.4, lr) * (1 - sstep(1.2, 1.45, lr));
              if (w <= 0.001) continue;
              let h = H.h + (B.h - A.h); h -= Math.floor(h);
              c.setHSL(h, sat(H.s * B.s / max(0.05, A.s)), sat(H.l * B.l / max(0.02, A.l)), THREE.SRGBColorSpace);
              const o = i * n;
              col.array[o] += (c.r - col.array[o]) * w; col.array[o + 1] += (c.g - col.array[o + 1]) * w; col.array[o + 2] += (c.b - col.array[o + 2]) * w;
            }
            col.needsUpdate = true;
          }
        }

        /* ---- static meshes of one material merged into one (the far level, and the middle level's kart) */
        const NEED = ['position', 'normal', 'color', 'kz'];
        function merge(THREE, root0, pick) {
          root0.updateMatrixWorld(true);
          const inv = new THREE.Matrix4().copy(root0.matrixWorld).invert(), byMat = new Map();
          root0.traverse((o) => {
            if (!o.isMesh || o.isSkinnedMesh || !pick(o)) return;
            for (let p = o; p && p !== root0; p = p.parent) if (!p.visible) return;
            const g = o.geometry; if (NEED.some((k) => !g.attributes[k]) || g.attributes.color.itemSize !== 3 || o.material.transparent) return;
            if (!byMat.has(o.material)) byMat.set(o.material, []);
            byMat.get(o.material).push(o);
          });
          const out = [];
          for (const [mat, list] of byMat) {
            if (list.length < 2) continue;
            let nv = 0, ni = 0; for (const o of list) { nv += o.geometry.attributes.position.count; ni += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; }
            const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), Kz = new Float32Array(nv * 4), I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
            const m4 = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
            let vo = 0, io = 0;
            for (const o of list) {
              const g = o.geometry, gp = g.attributes.position, gn = g.attributes.normal, gc = g.attributes.color, gk = g.attributes.kz, cnt = gp.count;
              m4.multiplyMatrices(inv, o.matrixWorld); nm.getNormalMatrix(m4);
              for (let i = 0; i < cnt; i++) {
                v.fromBufferAttribute(gp, i).applyMatrix4(m4); P[(vo + i) * 3] = v.x; P[(vo + i) * 3 + 1] = v.y; P[(vo + i) * 3 + 2] = v.z;
                v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize(); N[(vo + i) * 3] = v.x; N[(vo + i) * 3 + 1] = v.y; N[(vo + i) * 3 + 2] = v.z;
                C[(vo + i) * 3] = gc.getX(i); C[(vo + i) * 3 + 1] = gc.getY(i); C[(vo + i) * 3 + 2] = gc.getZ(i);
                Kz[(vo + i) * 4] = gk.getX(i); Kz[(vo + i) * 4 + 1] = gk.getY(i); Kz[(vo + i) * 4 + 2] = gk.getZ(i); Kz[(vo + i) * 4 + 3] = gk.getW(i);
              }
              if (g.index) for (let i = 0; i < g.index.count; i++) I[io++] = g.index.getX(i) + vo; else for (let i = 0; i < cnt; i++) I[io++] = vo + i;
              vo += cnt;
            }
            for (const o of list) o.parent.remove(o);
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
            g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setAttribute('kz', new THREE.BufferAttribute(Kz, 4)); g.setIndex(new THREE.BufferAttribute(I, 1));
            g.computeBoundingSphere();
            const mm = new THREE.Mesh(g, mat); mm.name = 'merged'; mm.castShadow = mm.receiveShadow = true;
            root0.add(mm); out.push(mm);
          }
          return out;
        }

        // a racer's toon for one kind of mesh (skinned, with so many shapes): one per kind, shared by its levels; and the
        // field's depth materials, one per kind
        const DEPTH = {};
        function toonTwin(M, kind) {
          const T = M.twins || (M.twins = {});
          if (T[kind]) return T[kind];
          const a = M.toon, b = a.clone();
          b.onBeforeCompile = a.onBeforeCompile; b.customProgramCacheKey = a.customProgramCacheKey; b.onBeforeRender = a.onBeforeRender; b.userData = a.userData;
          return (T[kind] = b);
        }

        /* ---- one level of detail of one racer */
        // level: 'desktop' | 'phone' | 'mid' | 'far'; o: { jersey, paint } (hex, or none: as on the sheet)
        function build(THREE, id, level, M, o) {
          o = o || {};
          const T0 = now(), KIT = root.EndoKit, R = RACERS[id];
          // (on the sled, its own kart is never built: own() is null)
          const ride = rideOf(id, o), own = (f) => (ride ? null : f());
          let ch, kt = null;
          if (id === 'bike') ch = root.BikeTyson(THREE, KIT, level, { toon: M.toon, eyeMat: M.eye });
          else if (id === 'pepe') { ch = root.PepeFinal(THREE, KIT, level, { toon: M.toon, eyeMat: M.eye }); kt = own(() => root.SwampSkimmer(THREE, KIT, level, { toon: M.toon })); }
          else if (id === 'doge' || id === 'shiba') { ch = root.DogFinal[id](THREE, KIT, level, { toon: M.toon, eyeMat: M.eye }); kt = own(() => (id === 'doge' ? root.WowWagon : root.SakuraDart)(THREE, KIT, level, { toon: M.toon })); }
          else if (id === 'bull') { ch = root.BullRun.bull(THREE, KIT, level, { toon: M.toon, eyeMat: M.eye }); kt = own(() => root.BullRun.kart(THREE, KIT, level, { toon: M.toon })); }
          else if (id === 'bear') { ch = root.BigBear(THREE, KIT, level, { toon: M.toon, eyeMat: M.eye }); kt = own(() => root.SellOff(THREE, KIT, level, { toon: M.toon })); }
          else if (id === 'whale') { ch = root.WhaleFinal(THREE, KIT, level, { toon: M.toon, eyeMat: M.eye }); kt = own(() => root.BubbleSub(THREE, KIT, level, { toon: M.toon, glassMat: M.water })); }
          else if (ADD[id]) { const A = ADD[id]; ch = A.char(THREE, KIT, level, { toon: M.toon, eyeMat: M.eye, glassMat: M.glass, accent: A.accent, def: A.def }); kt = own(() => A.kart(THREE, KIT, level, { toon: M.toon, glassMat: M.glass, water: M.water })); }
          else { ch = root.MoonCat.cat(THREE, KIT, level, { toon: M.toon, glassMat: M.glass, eyeMat: M.eye }); kt = own(() => root.MoonCat.kart(THREE, KIT, level, { toon: M.toon })); }
          // the sled: painted as asked (or as the racer's sled is), its grips through this rider's hands
          let fit = null;
          if (ride) {
            fit = sledFit(id);
            const P0 = SLED_PAINT[id] || [R.paint, (ADD[id] && ADD[id].accent) || '#F4F1EA', ADD[id] ? ADD[id].number : null], h = handsOf(id);
            const num = o.number !== undefined && o.number !== null ? o.number : P0[2];
            kt = root.SnowSled(THREE, KIT, level, { toon: M.toon, glassMat: M.glass, paint: o.paint || P0[0], accent: o.accent || P0[1], number: num,
              hands: { H: [fit.seat[0] + fit.s * h.H[0], fit.seat[1] + fit.s * h.H[1], fit.seat[2] + fit.s * h.H[2]], T: h.T } });
          }
          const api = id === 'pepe' ? ch.userData.pepe : ch.userData.racer;
          // the rest pose, as on the sheets
          api.set(R.face.race); api.setGaze(null, 0); api.steer(0);
          if (id === 'bike') api.pose({ crank: 0.7 }); else kt.userData.kart.animate(0, { speed: 0, steer: 0 });
          const g = new THREE.Group(); g.name = 'racer-' + id + '-' + level;
          // (the driver's seat: the body rolls and bounces in it, the kart under it does not)
          const seat = new THREE.Group(); seat.name = 'seat';
          if (kt) { g.add(kt); seat.position.set(kt.userData.kart.seat[0], kt.userData.kart.seat[1], kt.userData.kart.seat[2]); }
          if (fit) { seat.position.set(fit.seat[0], fit.seat[1], fit.seat[2]); seat.scale.setScalar(fit.s); }
          seat.add(ch); g.add(seat);
          // a Mog's colours
          const done = new Set(), charM = [], kartM = [];
          ch.traverse((m) => { if (m.isMesh && m.material === M.toon) charM.push(m); });
          if (kt) kt.traverse((m) => { if (m.isMesh && m.material === M.toon) kartM.push(m); });
          if (o.jersey && R.jersey !== 'zone') recolor(THREE, charM, R.jersey, o.jersey, done);
          if (o.paint && !ride) recolor(THREE, kt ? kartM : charM, R.paint, o.paint, done);
          // far: one draw for the toon (character, kart and wheels); the middle level's kart: one draw (its wheels still)
          const far = level === 'far', mid = level === 'mid';
          if (far) merge(THREE, g, (m) => m.material === M.toon);
          else if (mid && kt) merge(THREE, kt, (m) => m.material === M.toon);
          // shadows: the eyes are inside the head and the glass is clear, so neither is drawn into the shadow map
          g.traverse((m) => {
            if (!m.isMesh) return;
            const clear = !!(m.material && m.material.transparent) || m.userData.noShadow;
            m.castShadow = !clear && m.material !== M.eye; m.receiveShadow = !clear;
            m.userData.gmNoShadow = !m.castShadow;
          });
          // (the body's skin, skinned and carrying the face's shapes, drawn with a twin of the toon: the same uniforms,
          // hooks and key, a program of its own; sharing one with the kart, three.js looked the program up again at every
          // draw that went from one to the other, twice a frame for each racer, 7 Oct, the stutter probe: 6.6 MB/s of the
          // race's garbage, and the phone's dropped frames were its collections)
          // (and into the shadow map with a depth material of its kind's, for the same reason: the renderer's one depth
          // material changed program at every racer's body and back, more than the toon had)
          g.traverse((m) => {
            if (!m.isMesh || !(m.isSkinnedMesh || m.morphTargetInfluences)) return;
            const kind = (m.isSkinnedMesh ? 's' : '') + (m.morphTargetInfluences ? m.morphTargetInfluences.length : 0);
            if (m.material === M.toon) m.material = toonTwin(M, kind);
            if (!m.customDepthMaterial) m.customDepthMaterial = DEPTH[kind] || (DEPTH[kind] = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
          });
          let tris = 0, draws = 0, bad = 0;
          g.traverse((m) => {
            if (!m.isMesh) return;
            for (let p = m; p && p !== g; p = p.parent) if (!p.visible) return;
            draws++; tris += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
            const a = m.geometry.attributes.position.array; for (let i = 0; i < a.length; i++) if (!(a[i] === a[i]) || !isFinite(a[i])) { bad++; break; }
          });
          const out = { id, level, group: g, seat, char: ch, api, kart: kt ? kt.userData.kart : null, ms: Math.round(now() - T0), tris, draws, nan: bad };
          if (ride) { out.ride = ride; out.emit = kt.userData.kart.emit; }
          return out;
        }

        /* ---- the racer's faces and body, from the race: one frame of it (st: what the driver remembers) */
        // s: kart.js's { speed, steer (+ right), drift (-1, 0, 1), tier, boost, air, hop, land, hit, spun, back, gaze, celebrate, sad }
        function drive(L, R, st, dt, s) {
          const api = L.api, F0 = R.face;
          // the face: the strongest of the moment's reasons, eased in (12 a second, as the sheets' expressions ease)
          const mood = s.celebrate ? 'celebrate' : s.hit ? 'hit' : s.sad ? 'sad' : s.boost ? 'boost' : s.drift && s.tier > 0 ? 'drift' : 'race';
          const want = F0[mood], W = st.W, k = 1 - exp(-dt * 12);
          for (const n of api.names || []) W[n] = (W[n] || 0) + ((want[n] || 0) - (W[n] || 0)) * k;
          api.set(W);
          const lsteer = -(s.steer || 0);                           // (the sheets: + steers left)
          if (R.bike) {
            // (his hit shimmy and his wheelie with the sky punch start on the moment)
            if (s.hitNow) { api.setExpression('hit'); api.set(W); }
            if (s.cheerNow) { api.setExpression('celebrate'); api.set(W); }
            api.update(dt, { speed: s.speed, steer: lsteer, drift: !!s.drift });
          } else {
            api.steer(lsteer);
            // (and the kart's speed, m/s: Lord Black Diamond's cape streams from it; the eight read only accel and steer)
            api.update(dt, { accel: st.acc, steer: lsteer, speed: s.speed });
            if (L.kart) L.kart.animate(dt, L.kart.sled ? { speed: s.speed, steer: lsteer, air: s.air, land: s.landNow } : { speed: s.speed, steer: lsteer });
          }
          // hop: up out of the seat and squashed on landing; a boost stretches
          if (s.hopNow) api.kick(2.2);
          if (s.landNow) api.kick(-2.6);
          if (s.boostNow) api.kick(1.4);
          if (s.cheerNow && !R.bike) api.kick(2.4);
          // the head: it leads the turn, looks at the nearest rival (eyes first), back over the shoulder on C, and shakes
          // when hit
          const head = api.bones && api.bones.head, gz = s.gaze;
          st.look = st.look + ((s.back ? 1 : 0) - st.look) * (1 - exp(-dt * 9));
          const gx = gz ? gz[0] : 0, gy = gz ? gz[1] : 0;
          st.gx += (gx - st.gx) * (1 - exp(-dt * 6)); st.gy += (gy - st.gy) * (1 - exp(-dt * 6));
          if (st.look > 0.02) api.setGaze(0.9 * st.look + st.gx * (1 - st.look), 0.05);
          else if (gz) api.setGaze(st.gx, st.gy); else api.setGaze(null, 0);
          st.shake = max(0, st.shake - dt);
          if (head) {
            const yaw = st.look * 1.05 + st.gx * 0.35 * (1 - st.look), sh = st.shake > 0 ? Math.sin(st.shake * 70) * 0.16 * st.shake / 0.6 : 0;
            if (yaw || sh) { st.q.setFromEuler(st.e.set(0, yaw + sh, sh * 0.6)); head.quaternion.multiply(st.q); }
          }
          // the body rolls into a drift and the turn (the seat, under the driver), and bounces on the podium
          const roll = (s.drift || 0) * 0.13 + (s.steer || 0) * 0.05;
          st.roll += (roll - st.roll) * (1 - exp(-dt * 8));
          if (!R.bike) L.seat.rotation.z = st.roll;
        }

        root.RACERS = RACERS; root.IDS = IDS; root.build = build; root.drive = drive; root.recolor = recolor; root.merge = merge;
        root.add = add; root.ADDED = ADD; root.rideOf = rideOf; root.sledFit = sledFit; root.handsOf = handsOf;
      })(KR);

      KROSTER = KR;
      // the racers added to the eight (Aspen GP's five, 9 Oct): kartRosterAddons(add, KR), below this function
      if (typeof kartRosterAddons === 'function') { try { kartRosterAddons(KR.add, KR); } catch (e) { if (typeof warn === 'function') warn('kartRosterAddons: ' + (e && e.message)); } }
      return KR;
    }

    /* ============================================================ Aspen GP's five == */
    // Five more racers (9 Oct), drawn for Aspen GP, here for every kart world as the eight are (a world, or a Mog of
    // one, names them; Meme Kart names none of them, and its racers, karts and races are exactly as they were): White
    // Whale, Lux, Lord Black Diamond, and Whiteout One and Two. None has a kart of its own: each always rides the snow
    // sled (KR.SnowSled). kartRosterLib calls this once, when the library is first built, with add(id, def) (the racers
    // module: ids letters only, a base copied before its copy). ASPEN is each one's race: its handling (about 1, as the
    // eight's: White Whale the heavy, Lux light and nimble, Lord Black Diamond heavy and fast, the Whiteouts all-rounders),
    // its road manner (kart.js PERSONAS), its faces (weights of its own expressions: race, drift, boost, hit, sad,
    // celebrate) and its sled as it comes (body, trim, race number; a world's { paint, accent, number } wins). One line
    // each: scripts/kart-score/sim.mjs reads the handling and the manner there. The recipes follow, as drawn on their
    // sheets (signed distance fields meshed by marching cubes, every colour region its own mesh, one toon, expressions as
    // morph targets or bone poses, four levels of detail; no textures, no downloads).
    function kartRosterAddons(add, KR) {
      var ASPEN = {
        whitewhale: { name: 'White Whale', stats: { top: 1.01, accel: 0.91, handling: 0.95, mass: 1.34, drift: 0.95 }, persona: 'bully', color: '#1FB5C9', jersey: '#1FB5C9', paint: '#1B3A6B', accent: '#EEF3F8', number: 7,
          face: { race: { grin: 1 }, drift: { grin: 0.4, blow: 0.6 }, boost: { blow: 1 }, hit: { hit: 1 }, sad: { hit: 0.55 }, celebrate: { celebrate: 1 } } },
        lux: { name: 'Lux', stats: { top: 0.985, accel: 1.1, handling: 1.06, mass: 0.86, drift: 1.1 }, persona: 'risky', color: '#E8B830', jersey: '#E8B830', paint: '#1E2129', accent: '#E8B830', number: 3,
          face: { race: { smug: 1 }, drift: { focus: 1 }, boost: { celebrate: 0.7 }, hit: { hit: 1 }, sad: { hit: 0.5 }, celebrate: { celebrate: 1 } } },
        lordblackdiamond: { name: 'Lord Black Diamond', stats: { top: 1.015, accel: 0.9, handling: 0.96, mass: 1.28, drift: 0.97 }, persona: 'block', color: '#FF2E3A', jersey: '#FF2E3A', paint: '#16171C', accent: '#FF2E3A', number: 6,
          face: { race: { menace: 1 }, drift: { charge: 1 }, boost: { charge: 1 }, hit: { hit: 1 }, sad: { hit: 0.6 }, celebrate: { celebrate: 1 } } },
        whiteoutone: { name: 'Whiteout One', stats: { top: 1.005, accel: 1.02, handling: 0.99, mass: 1.08 }, persona: 'ram', color: '#FF6A1A', jersey: '#FF6A1A', suit: '#FF6A1A', paint: '#FF6A1A', accent: '#1B1E24', number: 4,
          face: { race: {}, drift: { focus: 1 }, boost: { happy: 0.55, focus: 0.45 }, hit: { hit: 1 }, sad: { sad: 1 }, celebrate: { happy: 1 } } },
        whiteouttwo: { name: 'Whiteout Two', stats: { top: 1, accel: 1, handling: 1.02, mass: 1.02, drift: 1.06 }, persona: 'draft', color: '#18B8A8', jersey: '#18B8A8', suit: '#18B8A8', paint: '#18B8A8', accent: '#1B1E24', number: 5,
          face: { race: {}, drift: { focus: 1 }, boost: { happy: 0.55, focus: 0.45 }, hit: { hit: 1 }, sad: { sad: 1 }, celebrate: { happy: 1 } } },
      };
      /* Aspen GP racer: WHITE WHALE (9 Oct 2026). An ORIGINAL racer, built in code, for the sled.
       *
       *   WhiteWhale(THREE, K, detail, opts) -> THREE.Group   (the character only; the sled is the snowmobile's)
       *     K      = the endo marching-cubes kit (KR.EndoKit)
       *     detail = 'desktop' | 'phone' | 'mid' | 'far'
       *     opts   = { toon: <the racer's gm-kart-toon>, eyeMat: <its gm-kart-eye ('dog')>,
       *                jersey: '#1FB5C9' (the scarf: any hex, its knit shading and the navy end stripes follow),
       *                grip: [x, y, z] (the LEFT hand's grip point, seat frame, +x = the rider's left; the right is mirrored;
       *                      default the roster's wheel grip, DogFinal.WHEEL at ten-and-two = [0.1185, 0.3918, 0.4609]) }
       * Needs root.DogFinal (util, WHEEL, toonMaterial, eyeMaterial), as every roster recipe does. Same shape as a roster body:
       * group.userData.racer = { set, setExpression, setGaze, look, blink, squash, kick, steer, update, names, bones, mesh, stats,
       * EXPR, level }, group.userData.stats = { tris, verts, ms, parts, headShare, eye }.
       *
       * The whale: a cheerful cartoon old bull sperm whale sat up on its tail like a rider. One smooth skin (the big blunt
       * box head with its domed brow, the body, the paddle flippers out to the grips, the tail stock lying back along the
       * seat with knuckles on top), the narrow lower jaw slung under the head as its own part on a jaw bone (it drops open
       * to show a row of teeth and a pink tongue), broad notched flukes standing up behind the sled, a forward-left spout.
       * Off-white going cool blue-grey underneath and low down, darker blue-grey wrinkle lines round the back and the tail,
       * pale rake scars and sucker rings on the head, a dark grin along the jaw seam, small eyes low on the head's front
       * corners under thick brows, and a teal knitted scarf (the jersey) whose two tails stream back over the tail on two
       * spring bones. Original design: no armour, no helmet, no coin.
       *
       * Expressions (face tubes as morph targets + bone poses): grin (the race face), blow (the boost: eyes squeezed, big
       * spout), hit (jaw dropped, brows up, sweat), celebrate (happy arcs, jaw wide, tongue, big spout).
       * Units metres, +Z forward, +Y up, origin = seat contact (the roster mounts it on the kart's seat point).
       * Draw calls: 2 (one SkinnedMesh in gm-kart-toon + the eye mesh on the head bone); far = 1 plain Mesh.
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, exp, atan2, floor, pow } = Math;
        // the roster's helpers (KR.DogFinal.util), taken on first use (init): this file can be evaluated before the roster
        // library exists (a global script, a world's add-on text) or on the library itself (an IIFE on KR, as the roster's
        // recipes are)
        let DF, U, sat, clamp, lerp, sstep, smin, smax, ell, E6, cap, v3, mix3, mul3, grad, Acc, mcPart, addGeo, taperTube, rayHit;
        let GRIP0, KN, SPOUT_AT, SPOUT_DIR, KNOT, SC_TAILS;
        const ell2 = (x, y, a, b) => { const X = x / a, Y = y / b, k0 = sqrt(X * X + Y * Y), k1 = sqrt(X * X / (a * a) + Y * Y / (b * b)) + 1e-9; return k0 * (k0 - 1) / k1; };
        const rbx = (x, y, z, c, b, r) => { const qx = abs(x - c[0]) - b[0] + r, qy = abs(y - c[1]) - b[1] + r, qz = abs(z - c[2]) - b[2] + r; return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, max(qy, qz)), 0) - r; };

        /* ------------------------------------------------------------------ the grip (hands on the shared wheel's grips) */
        const gripOf = (W) => { const up = [0, cos(W.tilt), sin(W.tilt)], a = W.grip, rad = v3.norm(v3.add([cos(a), 0, 0], up, sin(a))); return v3.add(W.c, rad, W.r); };

        /* ------------------------------------------------------------------ shape */
        const S = {
          head: { c: [0, 0.688, 0.06], b: [0.2, 0.2, 0.275], r: 0.125 },             // the box: front z 0.335, top 0.888, bottom 0.488
          jaw: { A: [0, 0.472, -0.04], B: [0, 0.46, 0.298], ra: 0.064, rb: 0.047, sq: 1.15, hinge: [0, 0.474, -0.03] },
          torso: [0, 0.25, -0.06, 0.25, 0.27, 0.23], belly: [0, 0.18, 0.0, 0.24, 0.18, 0.21], neckK: 0.09,
          eye: { y: 0.622, z: 0.262, r: 0.041, prot: 0.022, fwd: 0.5 },
          fin: { A: [0.2, 0.33, 0.0], B: [0.245, 0.335, 0.2], n: null },   // (n = the paddle's normal, set by init)
          tail: { pts: [[0, 0.14, -0.18], [0, 0.12, -0.36], [0, 0.16, -0.52], [0, 0.28, -0.63], [0, 0.42, -0.68]], r: [0.125, 0.095, 0.075, 0.058, 0.047] },
          fluke: { o: [0, 0.42, -0.69], pitch: 0.42, k: 1.15 },
          neck: [0, 0.47, -0.02],
        };
        const FL = (() => { const b = S.fluke.pitch; return { v: [0, cos(b), -sin(b)], w: [0, sin(b), cos(b)] }; })();
        const J = S.jaw;

        /* ------------------------------------------------------------------ expressions */
        const D2R = PI / 180;
        // mouth: curl = how far the grin's corners turn up (- down), side = one corner more (+ the left), wob = a wobble
        const MO = (o) => Object.assign({ curl: 0.04, side: 0, wob: 0, low: 0 }, o);
        const EX = {
          neutral:   { mouth: MO({}), brow: [0, 0], browT: [0, 0], jaw: 0, blush: 1, sweat: 0, gaze: [0, 0.02], lidU: 0.4, lidLo: -1.0, happy: 0, squeeze: 0, pupil: 0.22, iris: 0.44, spark: 0, roll: 0, spout: 1 },
          grin:      { mouth: MO({ curl: 0.08, side: 0.012 }), brow: [0.016, 0.008], browT: [0.15, -0.05], jaw: 0, blush: 1.2, sweat: 0, gaze: [0.15, 0.02], lidU: 0.62, lidLo: -0.72, happy: 0, squeeze: 0, pupil: 0.22, iris: 0.44, spark: 0.6, roll: 4 * D2R, spout: 1 },
          blow:      { mouth: MO({ curl: 0.005, low: 0.004 }), brow: [-0.012, -0.012], browT: [-0.35, -0.35], jaw: 0, blush: 1.4, sweat: 0, gaze: [0, 0], lidU: 0.45, lidLo: -1.0, happy: 0, squeeze: 1, pupil: 0.2, iris: 0.42, spark: 0, roll: 0, spout: 1.55 },
          hit:       { mouth: MO({ curl: -0.035, wob: 0.006, low: 0.006 }), brow: [0.03, 0.03], browT: [-0.4, -0.4], jaw: 0.2, blush: 0.6, sweat: 1, gaze: [0, 0.06], lidU: 1.1, lidLo: -1.2, happy: 0, squeeze: 0, pupil: 0.1, iris: 0.3, spark: 0, roll: -7 * D2R, spout: 0.32 },
          celebrate: { mouth: MO({ curl: 0.09 }), brow: [0.026, 0.026], browT: [0.1, 0.1], jaw: 0.34, blush: 1.3, sweat: 0, gaze: [0, 0], lidU: 0.5, lidLo: -1.0, happy: 1, squeeze: 0, pupil: 0.2, iris: 0.44, spark: 1, roll: 8 * D2R, spout: 1.8 },
        };
        const NAMES = ['grin', 'blow', 'hit', 'celebrate'];

        /* ------------------------------------------------------------------ SDF (the grip moves the flippers) */
        function paddle(ax, y, z, A, B, thA, thB, wA, wB, n) {
          const bx = B[0] - A[0], by = B[1] - A[1], bz = B[2] - A[2], px = ax - A[0], py = y - A[1], pz = z - A[2];
          const t = sat((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz));
          const ox = px - bx * t, oy = py - by * t, oz = pz - bz * t, on = ox * n[0] + oy * n[1] + oz * n[2];
          return ell2(on, hypot(ox - on * n[0], oy - on * n[1], oz - on * n[2]), lerp(thA, thB, t), lerp(wA, wB, t));
        }
        // the head: a rounded block, a little narrower toward the jaw, its brow rolled forward and domed (WHALE DUMP's head)
        const headF = (x, y, z) => {
          const ax = abs(x), h = S.head;
          let d = rbx(ax * (1 + 0.2 * sstep(0.66, 0.47, y)), y, z - 0.014 * sstep(0.76, 0.86, y), h.c, h.b, h.r);
          d -= 0.022 * sat(1 - (ax * ax + (y - 0.7) * (y - 0.7)) / 0.045) * sstep(0.09, 0.34, z);
          return d;
        };
        const torsoF = (x, y, z) => smin(E6(x, y, z, S.torso), E6(x, y, z, S.belly), 0.06);
        const headTorso = (x, y, z) => smin(headF(x, y, z), torsoF(x, y, z), S.neckK);
        const TP = S.tail.pts;
        const tailF = (x, y, z) => {
          if (z > -0.06) return 1;
          let d = 1; for (let i = 0; i < TP.length - 1; i++) d = smin(d, cap(x, y, z, TP[i], TP[i + 1], S.tail.r[i], S.tail.r[i + 1]), 0.03);
          for (const k of KN) d = smin(d, ell(x - k[0], y - k[1], z - k[2], k[3] * 0.75, k[3] * 0.55, k[3]), 0.025);
          return d;
        };
        const flukeD2 = (Uu, Vv) => {
          const cr = cos(0.36), sr = sin(0.36), lx = Uu - 0.17, ly = Vv - 0.08;
          let d2 = ell2(lx * cr + ly * sr, -lx * sr + ly * cr, 0.19, 0.08);
          d2 = smin(d2, ell2(Uu, Vv - 0.02, 0.075, 0.065), 0.04);
          return smax(d2, -(hypot(Uu, Vv - 0.135) - 0.045), 0.02);
        };
        const flukeEdge = (x, y, z) => { const o = S.fluke.o, K = S.fluke.k, py = (y - o[1]) / K, pz = (z - o[2]) / K; return flukeD2(abs(x - o[0]) / K, py * FL.v[1] + pz * FL.v[2]) * K; };
        const flukeF = (x, y, z) => {
          const o = S.fluke.o, K = S.fluke.k, py = (y - o[1]) / K, pz = (z - o[2]) / K;
          const Uu = abs(x - o[0]) / K, Vv = py * FL.v[1] + pz * FL.v[2], W = py * FL.w[1] + pz * FL.w[2];
          const d2 = flukeD2(Uu, Vv);
          const th = 0.026 * (1 - 0.45 * sat(Uu / 0.34)), r = 0.012, a = d2 + r, b = abs(W) - th + r;
          return (hypot(max(a, 0), max(b, 0)) + min(max(a, b), 0) - r) * K;
        };
        const jawF = (x, y, z) => cap(abs(x) * J.sq, y, z, J.A, J.B, J.ra, J.rb);
        const SH = {};
        function shape(H) {
          const key = H.map((v) => v.toFixed(4)).join(',');
          if (SH[key]) return SH[key];
          const pawC = v3.add(H, [0, 0, 0], 0);   // the flipper tip closes round the grip
          const Wr = v3.add(H, v3.norm(v3.sub(S.fin.B, H)), 0.06);
          const finF = (ax, y, z) => {
            const F = S.fin;
            const d = smin(paddle(ax, y, z, F.A, F.B, 0.05, 0.04, 0.09, 0.07, F.n), paddle(ax, y, z, F.B, Wr, 0.04, 0.034, 0.07, 0.058, F.n), 0.03);
            return smin(d, ell(ax - pawC[0], y - pawC[1], z - pawC[2], 0.05, 0.042, 0.062), 0.03);
          };
          const bodyAll = (x, y, z) => smin(smin(headTorso(x, y, z), finF(abs(x), y, z), 0.045), tailF(x, y, z), 0.06);
          return (SH[key] = { H, pawC, Wr, finF, bodyAll });
        }

        /* ------------------------------------------------------------------ palette (linear) */
        function palette(THREE, jersey) {
          const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
          const sc = c(jersey || '#1FB5C9');
          return {
            white: c('#EEF4FB'), shade: c('#AEBFDB'), deep: c('#7587AE'), low: c('#9FB2D3'), wrinkle: c('#7E90B6'), scar: c('#B4C2D9'), ring: c('#B2C0D6'),
            line: c('#1D2440'), mouth: c('#33122A'), mouthHi: c('#5E2140'), tongue: c('#EE7F98'), tongueDk: c('#C85A74'), tooth: c('#FFFBF0'),
            blush: c('#F7A3BB'), brow: c('#56688F'), lid: c('#DCE5F2'), lidLo: c('#E9EFF8'), lidLine: c('#1D2440'),
            spout: c('#8AD8F6'), spoutHi: c('#E9FAFF'), spoutDk: c('#56B6E6'), hole: c('#55678C'), sweat: c('#8FD3FF'), sweatHi: c('#E8F7FF'), eyeW: c('#F4F7FA'),
            scarf: sc, scarfDk: mul3(sc, 0.58), scarfHi: mix3(sc, [1, 1, 1], 0.18), stripe: c('#123153'),
            frame: c('#18233F'), lens: c('#5B7CF0'), lensHi: c('#BFE3FF'), lensLo: c('#7A3FC8'),
          };
        }
        const shade = (c, ao, lo) => { const k = lo + (1 - lo) * ao; return [c[0] * k * (0.9 + 0.1 * k), c[1] * k * (0.95 + 0.05 * k), c[2] * k]; };

        /* ------------------------------------------------------------------ LODs, bones */
        const LEVELS = {
          desktop: { main: 0.036, jaw: 0.02, fluke: 0.024, eye: [20, 11], lid: [14, 6], rim: [4, 20], tube: 6, extras: true, seg: 1, morph: true, spout: [10, 6, 5], wr: [5, 3], teeth: 6, scarf: [40, 8], strap: [36, 6], scars: true, rings: true },
          phone:   { main: 0.05, jaw: 0.03, fluke: 0.031, eye: [14, 8], lid: [10, 4], rim: [3, 14], tube: 4, extras: true, seg: 0.7, morph: true, spout: [9, 5, 5], wr: [3, 2], teeth: 4, scarf: [28, 6], strap: [26, 4], scars: true, rings: false },
          mid:     { main: 0.086, jaw: 0, fluke: 0, eye: [9, 5], lid: [6, 3], rim: [3, 8], tube: 4, extras: false, seg: 0.4, morph: true, spout: [6, 3, 4], wr: [0, 0], teeth: 0, scarf: [16, 4], strap: [14, 4], scars: false, rings: false },
          far:     { far: true },
        };
        const BONES = ['root', 'body', 'head', 'jaw', 'lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'sqL', 'sqR', 'tail0', 'tail1', 'tail2', 'spout', 'sc0', 'sc1'];
        const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
        const PARENT = { body: 'root', head: 'body', jaw: 'head', lidL: 'head', lidR: 'head', lowL: 'head', lowR: 'head', arcL: 'head', arcR: 'head', sqL: 'head', sqR: 'head', tail0: 'body', tail1: 'tail0', tail2: 'tail1', spout: 'head', sc0: 'body', sc1: 'sc0' };
        const headW = (x, y, z) => [BI.body, BI.head, sstep(0.42, 0.56, y)];
        function tailU(x, y, z) {
          let best = 1e9, bu = 0, L = 0; const seg = [];
          for (let i = 0; i < TP.length - 1; i++) { const l = hypot(...v3.sub(TP[i + 1], TP[i])); seg.push(l); L += l; }
          let a = 0;
          for (let i = 0; i < TP.length - 1; i++) {
            const A = TP[i], b = v3.sub(TP[i + 1], A), t = sat(v3.dot(v3.sub([x, y, z], A), b) / v3.dot(b, b));
            const d = hypot(...v3.sub([x, y, z], v3.add(A, b, t))); if (d < best) { best = d; bu = (a + t * seg[i]) / L; }
            a += seg[i];
          }
          return bu;
        }
        const tailW = (u) => { if (u < 0.22) return [BI.body, BI.tail0, u / 0.22]; const uu = clamp((u - 0.22) / 0.78, 0, 0.999) * 2, i = floor(uu); return [BI['tail' + i], BI['tail' + (i + 1)], uu - i]; };
        // the scarf: a loop round the waist under the jaw (lower in front), the knot back-left, two tails
        const SCARF = { y: 0.41, dip: 0.048, axis: [0, 0, -0.03], knotA: PI - 0.62, lift: 0.028, rx: 0.05, ry: 0.03 };
        // the goggles: pushed up on the brow, the strap round the head (higher in front); the lens a blue-violet mirror
        const STRAP = { y: 0.775, rise: 0.03, axis: [0, 0, 0.06], lift: 0.007, rx: 0.042, ry: 0.011, gog: 0.6, lens: 0.53 };
        const strapAt = (th) => {
          const y = STRAP.y + STRAP.rise * cos(th), d = [sin(th), 0, cos(th)], o = [0, y, STRAP.axis[2]];
          const p = rayHit(headF, o, d, 0, 0.5, 64) || v3.add(o, d, 0.25), g = grad(headF, p[0], p[1], p[2], 0.002, [0, 0, 0]);
          return { p, n: g, out: d };
        };
        const scarfAt = (th) => {
          const y = SCARF.y - SCARF.dip * cos(th), d = [sin(th), 0, cos(th)], o = [SCARF.axis[0], y, SCARF.axis[2]];
          const p = rayHit(headTorso, o, d, 0, 0.55, 64) || v3.add(o, d, 0.22);
          return { p, out: d };
        };
        const SC1_AT = [0.22, 0.34, -0.43];
        function init(R) {
          if (DF) return;
          DF = R && R.DogFinal;
          if (!DF || !DF.util) throw new Error('WhiteWhale needs the kart roster library (DogFinal): build it through the roster, or pass opts.kr');
          U = DF.util;
          ({ sat, clamp, lerp, sstep, smin, smax, ell, E6, cap, v3, mix3, mul3, grad, Acc, mcPart, addGeo, taperTube, rayHit } = U);
          S.fin.n = v3.norm([0.4, 1, -0.05]);
          GRIP0 = gripOf(DF.WHEEL);
          // knuckles along the top of the tail stock (parameter along the polyline, height above the axis)
          KN = [[1, 0.55, 0.06], [2, 0.15, 0.05], [2, 0.6, 0.042]].map(([i, t, r]) => { const p = v3.lerp(TP[i], TP[i + 1], t), tr = lerp(S.tail.r[i], S.tail.r[i + 1], t); return [p[0], p[1] + tr * 0.78, p[2], r]; });
          // the blowhole: up front on the left of the brow (a sperm whale's), the spout leaning forward and out
          SPOUT_AT = rayHit(headF, [0.085, 1.3, 0.19], [0, -1, 0], 0, 0.6, 96);
          SPOUT_DIR = v3.norm([0.28, 1, 0.62]);
          // the scarf's knot (back left) and its two tails, streaming back over the tail
          KNOT = (() => { const s = scarfAt(SCARF.knotA); return v3.add(s.p, s.out, SCARF.lift + 0.012); })();
          SC_TAILS = [
            [KNOT, [0.2, 0.37, -0.3], [0.255, 0.355, -0.45], [0.31, 0.35, -0.6], [0.36, 0.37, -0.74]],
            [KNOT, [0.16, 0.34, -0.29], [0.19, 0.3, -0.43], [0.24, 0.27, -0.56], [0.29, 0.26, -0.68]],
          ];
          api.GRIP = GRIP0;
        }

        /* ------------------------------------------------------------------ build */
        function WhiteWhale(THREE, KIT, detail, opts) {
          opts = opts || {};
          init(opts.kr || root);
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop;
          const C = palette(THREE, opts.jersey);
          const toon = opts.toon || DF.toonMaterial(THREE, opts);
          const SHP = shape(Array.isArray(opts.grip) && opts.grip.length === 3 ? opts.grip.map(Number) : GRIP0);
          if (LV.far) return buildFar(THREE, SHP, C, toon, T0, now);
          const stats = { parts: {} };
          const acc = new Acc();
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const qFrom = (dir) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(v3.norm(dir)));
          const tpart = (name, t0) => { stats.parts[name] = (stats.parts[name] || 0) + (acc.I.length - t0) / 3; };
          const BA = SHP.bodyAll;
          const aoAt = (x, y, z, nx, ny, nz, step) => {
            let occ = 0;
            for (let s = 1; s <= 4; s++) { const hs = s * step; occ += max(0, 1 - min(BA(x + nx * hs, y + ny * hs, z + nz * hs), jawF(x + nx * hs, y + ny * hs, z + nz * hs)) / hs) / s; }
            return sat(1 - 0.55 * max(0, occ - 0.12));
          };
          const aoStep = detail === 'mid' ? 0.03 : 0.018;
          const kSkin = [0.4, 0, 0, 1], lineK = [0.45, 0, 0, 0.6];
          const g0 = [0, 0, 0];
          // a point on a surface, lifted along its normal (projected from nearby, a few Newton steps)
          const onF = (f, p, lift) => { let [x, y, z] = p; for (let i = 0; i < 8; i++) { const d = f(x, y, z); grad(f, x, y, z, 0.002, g0); x -= g0[0] * d; y -= g0[1] * d; z -= g0[2] * d; } grad(f, x, y, z, 0.002, g0); return [x + g0[0] * lift, y + g0[1] * lift, z + g0[2] * lift]; };
          const tube = (pts, r, col, k, bone, radial) => { const R = pts.map((_, i) => r * (0.4 + 0.6 * sin(PI * (0.06 + 0.88 * i / max(1, pts.length - 1))))); addGeo(THREE, acc, taperTube(THREE, pts, R, R, radial || LV.tube, [0, 1, 0], true), M4(), col, k, bone); };
          let t = now(), t0;

          /* ---- eyes: small, low on the head's front corners, a little proud, facing between forward and the side */
          const eyeAt = (side) => {
            const p = rayHit(headF, [side * 0.6, S.eye.y, S.eye.z], [-side, 0, 0], 0, 0.6, 64);
            grad(headF, p[0], p[1], p[2], 0.002, g0);
            const dir = v3.norm(v3.lerp(g0, [side * 0.35, 0.04, 1], S.eye.fwd));
            return { c: v3.add(p, dir, -(S.eye.r - S.eye.prot)), dir };
          };
          const EYE = { L: eyeAt(1), R: eyeAt(-1) };
          const eyeQ = (side) => qFrom(side > 0 ? EYE.L.dir : EYE.R.dir);

          /* ---- the skin: head + body + flippers + tail stock, one smooth surface (white over cool blue-grey) */
          t0 = acc.I.length;
          const corr = (x, y, z) => sstep(-0.02, -0.16, z) * (0.5 + 0.5 * sin(y * 70 + sin(x * 22) * 1.3 + z * 9));   // the corrugated back (soft, under the lines)
          const main = mcPart(KIT, acc, BA, [-0.42, -0.04, -0.82, 0.42, 0.96, 0.6], LV.main, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            let c = mix3(C.shade, C.white, sstep(-0.7, 0.4, ny));
            c = mix3(c, C.low, 0.45 * sstep(0.34, 0.06, y));                                  // greyer low down: it reads on snow
            if (LV.extras) c = mix3(c, C.wrinkle, 0.16 * corr(x, y, z));
            const fin = sstep(0.012, -0.004, SHP.finF(abs(x), y, z) - headTorso(x, y, z));
            c = mix3(c, C.shade, fin * sstep(-0.1, -0.8, ny) * 0.5);                           // flipper undersides
            // the mouth: dark under the head's front, above the jaw (seen when the jaw drops)
            const m = sstep(-0.72, -0.9, ny) * sstep(0.085, 0.06, abs(x)) * sstep(0.06, 0.11, z) * sstep(0.45, 0.47, y);
            c = mix3(c, mix3(C.mouth, C.mouthHi, sstep(0.3, 0.1, z) * 0.4), m);
            return shade(c, ao, 0.66);
          }, null, kSkin, BI.body);
          for (let v = main.v0; v < main.v1; v++) {
            const x = acc.P[3 * v], y = acc.P[3 * v + 1], z = acc.P[3 * v + 2];
            let w = headW(x, y, z);
            if (z < -0.12) { const tf = tailF(x, y, z), ht = headTorso(x, y, z); if (tf < ht + 0.03) { const u = tailU(x, y, z), tw = tailW(u), k = sstep(0.03, -0.01, tf - ht); w = k >= 1 ? tw : (u < 0.22 ? [BI.body, BI.tail0, tw[2] * k] : tw); } }
            acc.B[3 * v] = w[0]; acc.B[3 * v + 1] = w[1]; acc.B[3 * v + 2] = w[2];
          }
          tpart('skin', t0);
          stats.sdfMs = Math.round(now() - t); t = now();

          /* ---- the lower jaw: its own part on the jaw bone (narrow, slung under the head), teeth and tongue on top */
          t0 = acc.I.length;
          const jawCol = (x, y, z, ny) => mix3(mix3(C.low, C.white, sstep(-0.6, 0.6, ny)), C.white, 0.25 * sstep(0.1, 0.3, z));
          if (LV.jaw) {
            mcPart(KIT, acc, jawF, [-0.1, 0.36, -0.02, 0.1, 0.55, 0.38], LV.jaw, true, (x, y, z, nx, ny, nz, v) => {
              const ao = aoAt(x, y, z, nx, ny, nz, 0.012); acc.K[4 * v + 3] = ao;
              let c = jawCol(x, y, z, ny);
              c = mix3(c, C.mouth, sstep(0.55, 0.85, ny) * sstep(0.02, 0.06, z) * 0.85);          // the gum line on top, dark
              return shade(c, ao, 0.7);
            }, (x, y, z) => z > 0.02, kSkin, BI.jaw);
          } else {
            const pts = [J.A, v3.lerp(J.A, J.B, 0.5), J.B, v3.add(J.B, [0, 0, 0.03])], R = [J.ra, (J.ra + J.rb) / 2, J.rb, J.rb * 0.5];
            addGeo(THREE, acc, taperTube(THREE, pts, R.map((r) => r / J.sq), R, 6, [0, 1, 0], true), M4(), (x, y, z, nx, ny) => shade(jawCol(x, y, z, ny), 0.9, 1), kSkin, BI.jaw);
          }
          if (LV.teeth) {
            const tg = new THREE.ConeGeometry(0.0105, 0.032, 5, 1); tg.translate(0, 0.012, 0);
            for (const sd of [1, -1]) for (let i = 0; i < LV.teeth; i++) {
              const u = lerp(0.42, 0.8, i / (LV.teeth - 1)), c = v3.lerp(J.A, J.B, u), r = lerp(J.ra, J.rb, u);
              addGeo(THREE, acc, tg, M4().compose(V([sd * r / J.sq * 0.55, c[1] + r * 0.72, c[2]]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, -sd * 0.18)), V([1, 1, 1])),
                (x, y, z, nx, ny) => mix3(mul3(C.tooth, 0.86), C.tooth, sstep(-0.3, 0.6, ny)), [0.25, 0, 0, 1], BI.jaw);
            }
            const tq = new THREE.SphereGeometry(1, 10, 6), tc = v3.lerp(J.A, J.B, 0.62), tr = lerp(J.ra, J.rb, 0.62);
            addGeo(THREE, acc, tq, M4().compose(V([0, tc[1] + tr * 0.62, tc[2]]), new THREE.Quaternion(), V([0.026, 0.012, 0.1])), (x, y, z, nx, ny) => mix3(C.tongueDk, C.tongue, sstep(-0.3, 0.8, ny)), [0.4, 0.4, 4, 1], BI.jaw);
          }
          tpart('jaw', t0);

          /* ---- the flukes (finer grid; mid = two flattened lobes): stood up behind the sled */
          t0 = acc.I.length;
          const flukeCol = (ny, nz, x, e) => { const under = sstep(0.2, -0.5, ny * FL.w[1] + nz * FL.w[2]), tip = sstep(0.18, 0.36, abs(x)); return mix3(mix3(mix3(C.white, C.shade, 0.15 + 0.35 * tip), mix3(C.low, C.deep, 0.3), under * 0.85), C.deep, 0.75 * (e || 0)); };
          if (LV.fluke) {
            mcPart(KIT, acc, flukeF, [-0.48, 0.3, -0.98, 0.48, 0.92, -0.5], LV.fluke, true, (x, y, z, nx, ny, nz) => shade(flukeCol(ny, nz, x, sstep(-0.032, -0.006, flukeEdge(x, y, z)) * sstep(0.45, 0.52, y)), 0.92 + 0.08 * sstep(0.3, 1, abs(ny)), 1),
              (x, y, z) => tailF(x, y, z) > -0.004, kSkin, BI.tail2);
          } else {
            const lobe = new THREE.SphereGeometry(1, 8, 4), o = S.fluke.o, K = S.fluke.k;
            for (const s of [1, -1]) {
              const pc = v3.add(v3.add(o, [s * 0.2 * K, 0, 0]), FL.v, 0.11 * K);
              const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V([1, 0, 0]), V(FL.v), V(FL.w))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * 0.36)));
              addGeo(THREE, acc, lobe, M4().compose(V(pc), q, V([0.19 * K, 0.076 * K, 0.026])), (x, y, z, nx, ny, nz) => shade(flukeCol(ny, nz, s * 0.3), 1, 1), kSkin, BI.tail2);
            }
          }
          tpart('fluke', t0);

          /* ---- wrinkle lines round the back and over the tail stock, scars and sucker rings on the head */
          t0 = acc.I.length;
          if (LV.wr[0]) {
            const nb = LV.wr[0], np = max(8, Math.round(16 * LV.seg));
            for (let k = 0; k < nb; k++) {
              const yk = lerp(0.17, 0.4, nb > 1 ? k / (nb - 1) : 0.5), pts = [];
              for (let j = 0; j <= np; j++) {
                const th = lerp(PI * 0.6, PI * 1.4, j / np), d = [sin(th), 0, cos(th)], y = yk + 0.013 * sin(th * 6 + k * 1.7);
                const p = rayHit(headTorso, [0, y, -0.06], d, 0, 0.5, 48); if (!p) continue;
                grad(headTorso, p[0], p[1], p[2], 0.002, g0); pts.push(v3.add(p, g0, 0.002));
              }
              if (pts.length > 3) tube(pts, 0.0068, C.wrinkle, lineK, BI.body, max(3, LV.tube - 2));
            }
            // folds across the top of the tail stock
            for (let k = 0; k < LV.wr[1]; k++) {
              const u = lerp(0.3, 0.62, LV.wr[1] > 1 ? k / (LV.wr[1] - 1) : 0.5), seg = u * (TP.length - 1), i = min(TP.length - 2, floor(seg)), f = seg - i;
              const c = v3.lerp(TP[i], TP[i + 1], f), T = v3.norm(v3.sub(TP[i + 1], TP[i])), side = [1, 0, 0], up = v3.norm(v3.cross(side, T)), pts = [];
              for (let j = 0; j <= 8; j++) {
                const ph = lerp(-1.25, 1.25, j / 8), d = v3.norm(v3.add(v3.scale(up, cos(ph)), side, sin(ph)));
                const p = rayHit(tailF, v3.add(c, T, 0.012 * sin(ph * 3)), d, 0, 0.3, 32); if (!p) continue;
                grad(tailF, p[0], p[1], p[2], 0.002, g0); pts.push(v3.add(p, g0, 0.002));
              }
              if (pts.length > 3) tube(pts, 0.0062, C.wrinkle, lineK, (x, y, z) => tailW(tailU(x, y, z)), max(3, LV.tube - 2));
            }
          }
          if (LV.scars) {
            // WHALE DUMP's rakes, moved onto this head (the item's head sits 0.665 lower and 0.26 further forward)
            const SC = [
              [[0.06, 0.2, 0.52], [0.12, 0.22, 0.4], [0.17, 0.2, 0.3]], [[0.03, 0.22, 0.47], [0.09, 0.24, 0.36], [0.13, 0.23, 0.27]],
              [[-0.2, 0.12, 0.5], [-0.21, 0.06, 0.4], [-0.21, -0.02, 0.33]], [[-0.08, 0.22, 0.24], [-0.13, 0.2, 0.13]],
            ].map((s) => s.map(([x, y, z]) => [x, y + 0.668, z - 0.26]));
            for (const s of SC) {
              const pts = [];
              for (let k = 0; k <= 6; k++) { const u = (k / 6) * (s.length - 1), i = min(s.length - 2, floor(u)), f = u - i; pts.push(onF(headF, v3.lerp(s[i], s[i + 1], f), 0.0025)); }
              tube(pts, 0.0058, C.scar, [0.5, 0, 0, 1], headW, max(3, LV.tube - 2));
            }
            if (LV.rings) for (const [x, y, z, r] of [[0.2, 0.8, 0.06, 0.016], [0.2, 0.76, 0.0, 0.012], [-0.12, 0.875, 0.3, 0.014], [-0.2, 0.77, 0.28, 0.013]]) {
              const p = onF(headF, [x, y, z], 0.001); grad(headF, p[0], p[1], p[2], 0.002, g0);
              addGeo(THREE, acc, new THREE.TorusGeometry(r, 0.0035, 3, 10), M4().compose(V(p), qFrom(g0), V([1, 1, 1])), C.ring, [0.5, 0, 0, 1], headW);
            }
          }
          tpart('lines', t0);

          /* ---- the scarf: a knitted roll round the waist, the knot, two tails streaming back on the scarf's spring bones */
          t0 = acc.I.length;
          {
            const [nL, nR] = LV.scarf, pts = [], outs = [];
            for (let i = 0; i < nL; i++) { const th = (i / nL) * PI * 2, s = scarfAt(th); pts.push(v3.add(s.p, s.out, SCARF.lift)); outs.push(s.out); }
            const rib = (x, z) => 0.5 + 0.5 * sin(atan2(x, z - SCARF.axis[2]) * 30);
            addGeo(THREE, acc, taperTube(THREE, pts, pts.map(() => SCARF.rx), pts.map(() => SCARF.ry), nR, (i) => outs[i], false, true), M4(),
              (x, y, z, nx, ny) => mix3(mix3(C.scarf, C.scarfDk, 0.42 * sstep(0.2, -0.8, ny) + 0.22 * rib(x, z)), C.scarfHi, 0.3 * sstep(0.3, 0.9, ny)), [0.75, 0, 0, 1], BI.body);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.05, max(8, nR + 2), max(5, nR - 1)), M4().compose(V(KNOT), new THREE.Quaternion(), V([1, 0.85, 0.95])),
              (x, y, z, nx, ny) => mix3(C.scarf, C.scarfDk, 0.4 * sstep(0.2, -0.8, ny)), [0.75, 0, 0, 1], BI.body);
            const z0 = -KNOT[2], zL = 0.42;
            const chainW = (x, y, z) => { const u = clamp((-z - z0) / zL, 0, 1); return u < 0.5 ? [BI.sc0, BI.sc1, u * 2 * 0.6] : [BI.sc0, BI.sc1, 0.6 + (u - 0.5) * 0.8]; };
            for (const T of SC_TAILS) {
              const P = new THREE.CatmullRomCurve3(T.map((p) => V(p))).getPoints(max(6, Math.round(14 * LV.seg))).map((p) => [p.x, p.y, p.z]), n = P.length - 1;
              addGeo(THREE, acc, taperTube(THREE, P, P.map((_, i) => 0.036 + 0.03 * i / n), P.map(() => 0.01), max(4, nR - 2), [0, 1, 0], true), M4(),
                (x, y, z, nx, ny) => { const u = (-z - z0) / (0.7 - z0); const st = (u > 0.72 && u < 0.8) || (u > 0.87 && u < 0.94) ? 1 : 0; return mix3(mix3(C.scarf, C.scarfDk, 0.3 * sstep(0.2, -0.9, ny)), C.stripe, st); },
                [0.75, 0, 0, 1], chainW);
            }
          }
          tpart('scarf', t0);

          /* ---- the goggles: the strap round the head (the jersey's colour: it is what the chase cam sees), a navy frame and a
           * blue-violet mirror lens pushed up on the brow, following the head's curve */
          t0 = acc.I.length;
          {
            const [nS, nR] = LV.strap, pts = [], nrm = [];
            for (let i = 0; i < nS; i++) { const s = strapAt((i / nS) * PI * 2); pts.push(v3.add(s.p, s.n, STRAP.lift)); nrm.push(s.n); }
            addGeo(THREE, acc, taperTube(THREE, pts, pts.map(() => STRAP.rx * 0.66), pts.map(() => STRAP.ry), nR, (i) => nrm[i], false, true), M4(),
              (x, y, z, nx, ny) => mix3(mix3(C.scarf, C.scarfDk, 0.35 * sstep(0.2, -0.8, ny)), C.stripe, sstep(0.016, 0.02, abs(y - (STRAP.y + STRAP.rise * cos(atan2(x, z - STRAP.axis[2])))))), [0.6, 0, 0, 1], BI.head);
            const arc = (A, lift, n) => { const P = [], N = []; for (let i = 0; i <= n; i++) { const s = strapAt(lerp(-A, A, i / n)); P.push(v3.add(s.p, s.n, lift)); N.push(s.n); } return { P, N }; };
            const nG = max(6, Math.round(16 * LV.seg)), fr = arc(STRAP.gog, STRAP.lift + 0.012, nG), le = arc(STRAP.lens, STRAP.lift + 0.026, nG);
            const end = (i, n) => 0.55 + 0.45 * sstep(0, 0.18, min(i, n - i) / n);
            addGeo(THREE, acc, taperTube(THREE, fr.P, fr.P.map((_, i) => STRAP.rx * 1.1 * end(i, nG)), fr.P.map(() => 0.02), nR, (i) => fr.N[i], true), M4(),
              (x, y, z, nx, ny) => mix3(C.frame, mul3(C.frame, 1.8), 0.4 * sstep(0.2, 0.9, ny)), [0.3, 0, 0, 1], BI.head);
            addGeo(THREE, acc, taperTube(THREE, le.P, le.P.map((_, i) => STRAP.rx * 0.8 * end(i, nG)), le.P.map(() => 0.009), nR, (i) => le.N[i], true), M4(),
              (x, y, z, nx, ny) => { const k = sstep(0.83, 0.765, y); return mix3(mix3(C.lensHi, C.lens, sstep(0, 0.5, k)), C.lensLo, sstep(0.5, 1, k)); }, [0.1, 0, 0, 1], BI.head);
          }
          tpart('goggles', t0);

          /* ---- the face: what an expression changes (fixed topology; rebuilt per expression) */
          const nLine = max(10, Math.round(20 * LV.seg));
          const sideHit = (side, y, z) => rayHit(headF, [side * 0.6, y, z], [-side, 0, 0], 0, 0.6, 48) || [side * 0.2, y, z];
          function buildFace(A, E) {
            const M = E.mouth;
            // the grin: round the head's front-bottom edge from the middle, back along the jaw seam, curling up at the corner
            for (const sd of [1, -1]) {
              const pts = [];
              for (let k = 0; k <= nLine; k++) {
                const u = k / nLine, th = lerp(0.1, 1.04, u), d = [sd * sin(th), 0, cos(th)];
                const curl = (M.curl + M.side * sd) * pow(sstep(0.55, 1, u), 1.5);
                const y = 0.508 - M.low * sstep(0, 0.6, u) + curl + M.wob * sin(u * 23);
                const p = rayHit(headF, [d[0] * 0.6, y, 0.07 + d[2] * 0.6], [-d[0], 0, -d[2]], 0, 0.6, 48) || [d[0] * 0.2, y, 0.07 + d[2] * 0.26];
                grad(headF, p[0], p[1], p[2], 0.002, g0); pts.push(v3.add(p, g0, 0.004));
              }
              const R = pts.map((_, i) => 0.0095 * (0.45 + 0.55 * sin(PI * (0.04 + 0.92 * i / nLine))));
              addGeo(THREE, A, taperTube(THREE, pts, R, R, LV.tube, [0, 1, 0], true), M4(), C.line, lineK, BI.head);
            }
            // brows: thick short arcs over the eyes (one cocked in the grin)
            const nb = max(4, Math.round(7 * LV.seg));
            for (const [side, i] of [[1, 0], [-1, 1]]) {
              const bp = [];
              for (let j = 0; j <= nb; j++) {
                const s = -1 + 2 * j / nb, y = S.eye.y + 0.072 + E.brow[i] + 0.01 * (1 - s * s) - E.browT[i] * 0.03 * s;
                const p = sideHit(side, y, S.eye.z - 0.012 + s * 0.042); grad(headF, p[0], p[1], p[2], 0.002, g0); bp.push(v3.add(p, g0, 0.005));
              }
              const pr = bp.map((_, j) => 0.0105 * (0.45 + 0.55 * sin(PI * (0.08 + 0.84 * j / nb))));
              addGeo(THREE, A, taperTube(THREE, bp, pr, pr, max(4, LV.tube - 1), [0, 1, 0], true), M4(), C.brow, lineK, BI.head);
            }
            // blush behind and under the eye
            const bl = new THREE.SphereGeometry(1, max(8, LV.lid[0]), max(4, LV.lid[1] - 1));
            for (const side of [1, -1]) {
              const p = sideHit(side, 0.565, 0.2); grad(headF, p[0], p[1], p[2], 0.002, g0);
              const k = E.blush;
              addGeo(THREE, A, bl, M4().compose(V(v3.add(p, g0, -0.001)), qFrom(g0), V([0.04 * k, 0.022 * k, 0.004])), C.blush, [0.55, 0, 0, 1], BI.head);
            }
            // the sweat drop on the temple (inside the head when off)
            if (LV.extras) {
              const p = sideHit(1, 0.8, 0.1); grad(headF, p[0], p[1], p[2], 0.002, g0);
              const sw = E.sweat;
              const dg = new THREE.LatheGeometry([[0, -1], [0.55, -0.86], [0.82, -0.45], [0.66, 0.1], [0.3, 0.62], [0, 1.05]].map(([r, h]) => new THREE.Vector2(r * 0.028, h * 0.043)), max(6, LV.lid[0] >> 1));
              const at = sw > 0.01 ? v3.add(p, g0, 0.016 * min(1, sw)) : v3.add(p, g0, -0.035);
              addGeo(THREE, A, dg, M4().compose(V(at), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.25)), V(v3.scale([1, 1, 0.75], max(0.002, sw)))),
                (x, y, z, nx, ny) => mix3(C.sweat, C.sweatHi, sstep(0.0, 0.9, ny + nx * 0.3)), [0.05, 0, 0, 1], BI.head);
            }
          }
          t0 = acc.I.length;
          const fc0 = acc.n;
          buildFace(acc, EX.neutral);
          const fc1 = acc.n;
          tpart('face', t0);

          /* ---- the blowhole and the spout (leaning forward and out, on its own bone) */
          t0 = acc.I.length;
          const SQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(SPOUT_DIR));
          {
            grad(headF, SPOUT_AT[0], SPOUT_AT[1], SPOUT_AT[2], 0.002, g0);
            addGeo(THREE, acc, new THREE.TorusGeometry(0.032, 0.009, max(3, LV.tube - 2), max(10, LV.spout[0])).rotateX(PI / 2), M4().compose(V(v3.add(SPOUT_AT, g0, 0.001)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(g0)), V([1.25, 1, 0.8])), C.hole, [0.5, 0, 0, 1], BI.head);
            const [seg, rows, arms] = LV.spout, M = M4().compose(V(v3.add(SPOUT_AT, [0, -0.006, 0])), SQ, V([1, 1, 1])), k = [0.08, 0, 0, 1];
            const col = (y, ny) => { const h = sat(y / 0.22); return mix3(mix3(C.spoutDk, C.spout, sstep(0.0, 0.35, h)), C.spoutHi, sstep(0.45, 1.0, h) * 0.8 + sstep(0.3, 0.95, ny) * 0.25); };
            const prof = [[0, -0.012], [0.046, -0.006], [0.04, 0.03], [0.032, 0.085], [0.038, 0.125], [0.058, 0.158], [0.048, 0.186], [0, 0.2]];
            const lp = []; for (let i = 0; i < prof.length - 1; i++) { const nn = (i === 2 || i === 4 ? rows - 3 : 1) + 1; for (let r = 0; r < nn; r++) { const tt = r / nn; lp.push([lerp(prof[i][0], prof[i + 1][0], tt), lerp(prof[i][1], prof[i + 1][1], tt)]); } }
            lp.push(prof[prof.length - 1]);
            addGeo(THREE, acc, new THREE.LatheGeometry(lp.map(([r, y]) => new THREE.Vector2(r, y)), seg), M, (x, y, z, nx, ny) => col(y, ny), k, BI.spout);
            const drop = new THREE.SphereGeometry(1, max(5, seg >> 1), max(3, rows - 1));
            for (let i = 0; i < arms; i++) {
              const a = (i / arms) * PI * 2 + 0.35, ca = cos(a), sa = sin(a), rr = i % 2 ? 0.92 : 1.05;
              const pts = [[0, 0.168, 0], [ca * 0.075 * rr, 0.218, sa * 0.075 * rr], [ca * 0.13 * rr, 0.19, sa * 0.13 * rr], [ca * 0.16 * rr, 0.13, sa * 0.16 * rr]], R = [0.036, 0.031, 0.024, 0.017];
              addGeo(THREE, acc, taperTube(THREE, pts, R, R, max(4, seg >> 1), [0, 1, 0], true), M, (x, y, z, nx, ny) => col(y, ny), k, BI.spout);
              addGeo(THREE, acc, drop, M.clone().multiply(M4().compose(V([ca * 0.165 * rr, 0.104, sa * 0.165 * rr]), new THREE.Quaternion(), V([0.025, 0.034, 0.025]))), (x, y, z, nx, ny) => mix3(C.spout, C.spoutHi, sstep(0, 1, ny) * 0.7), k, BI.spout);
            }
          }
          tpart('spout', t0);

          /* ---- eyelids (upper shell + dark rim, lower shell), happy arcs, squeeze chevrons (the roster's recipe) */
          t0 = acc.I.length;
          const eyeR = S.eye.r, lidR = eyeR + 0.0045;
          const upG = new THREE.SphereGeometry(lidR, LV.lid[0], LV.lid[1], 0, PI * 2, 0, PI / 2);
          const loG = new THREE.SphereGeometry(lidR - 0.0016, LV.lid[0], max(3, LV.lid[1] - 2), 0, PI * 2, PI / 2, PI / 2);
          const rimG = new THREE.TorusGeometry(lidR - 0.002, 0.0058, LV.rim[0], LV.rim[1], PI).rotateX(PI / 2);
          const loRimG = new THREE.TorusGeometry(lidR - 0.0035, 0.0028, 3, max(8, LV.rim[1] >> 1), PI).rotateX(PI / 2);
          const nA = max(6, Math.round(12 * LV.seg)), tubeA = max(3, LV.tube - 2);
          const arcPts = []; for (let i = 0; i <= nA; i++) { const s = -1 + 2 * i / nA; arcPts.push(v3.scale(v3.norm([0.66 * s, -0.1 + 0.32 * (1 - s * s), 1]), lidR + 0.003)); }
          const arcR = arcPts.map((_, i) => 0.0085 * (0.4 + 0.6 * sin(PI * i / nA)));
          const arcG = taperTube(THREE, arcPts, arcR, arcR, tubeA, [0, 0, 1], true);
          for (const side of [1, -1]) {
            const sfx = side > 0 ? 'L' : 'R';
            addGeo(THREE, acc, upG, M4(), (x, y) => shade(mix3(C.lid, mul3(C.lid, 0.84), sstep(0, lidR, y) * 0.4), 1, 1), [0.36, 0, 0, 0.9], BI['lid' + sfx]);
            addGeo(THREE, acc, rimG, M4(), C.lidLine, [0.45, 0, 0, 0.7], BI['lid' + sfx]);
            addGeo(THREE, acc, loG, M4(), shade(C.lidLo, 0.92, 1), [0.45, 0, 0, 0.9], BI['low' + sfx]);
            if (LV.extras) addGeo(THREE, acc, loRimG, M4(), mix3(C.lidLine, C.lidLo, 0.5), [0.5, 0, 0, 1], BI['low' + sfx]);
            addGeo(THREE, acc, arcG, M4(), C.lidLine, [0.45, 0, 0, 1], BI['arc' + sfx]);
            const ch = [[side * 0.55, 0.42], [-side * 0.4, 0.02], [side * 0.55, -0.36]].map(([a, b]) => v3.scale(v3.norm([a, b, 1]), lidR + 0.003));
            const chP = new THREE.CatmullRomCurve3(ch.map((p) => V(p)), false, 'catmullrom', 0.1).getPoints(max(6, nA)).map((p) => [p.x, p.y, p.z]);
            const chR = chP.map((_, i) => 0.0082 * (0.5 + 0.5 * sin(PI * i / (chP.length - 1))));
            addGeo(THREE, acc, taperTube(THREE, chP, chR, chR, tubeA, [0, 0, 1], true), M4(), C.lidLine, [0.45, 0, 0, 1], BI['sq' + sfx]);
          }
          tpart('lids', t0);
          stats.accMs = Math.round(now() - t); t = now();

          /* ---- geometry; eye-frame parts bound at the eye */
          const nv = acc.n, geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
          for (let v = 0; v < nv; v++) { SI[4 * v] = acc.B[3 * v]; SI[4 * v + 1] = acc.B[3 * v + 1]; const f = acc.B[3 * v + 2]; SW[4 * v] = 1 - f; SW[4 * v + 1] = f; }
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
          {
            const pa = geo.attributes.position, na = geo.attributes.normal, vv = new THREE.Vector3(), nn = new THREE.Vector3();
            const eyeBones = new Set(['lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'sqL', 'sqR'].map((n) => BI[n]));
            const qL = eyeQ(1), qR = eyeQ(-1);
            for (let v = 0; v < nv; v++) {
              const b = acc.B[3 * v]; if (!eyeBones.has(b)) continue;
              const side = BONES[b].endsWith('L') ? 1 : -1, E = side > 0 ? EYE.L : EYE.R, q = side > 0 ? qL : qR;
              vv.fromBufferAttribute(pa, v).applyQuaternion(q).add(V(E.c)); pa.setXYZ(v, vv.x, vv.y, vv.z);
              nn.fromBufferAttribute(na, v).applyQuaternion(q); na.setXYZ(v, nn.x, nn.y, nn.z);
            }
          }
          geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));

          /* ---- morph targets: the face rebuilt with each expression (the jaw, lids and spout are bones) */
          const names = [];
          if (LV.morph) {
            geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
            for (const name of NAMES) {
              const dP = new Float32Array(nv * 3), dN = new Float32Array(nv * 3);
              const A = new Acc(); buildFace(A, EX[name]);
              if (A.n !== fc1 - fc0) throw new Error('face topology changed for ' + name + ': ' + A.n + ' vs ' + (fc1 - fc0));
              for (let i = 0; i < A.n; i++) { const v = fc0 + i; for (let q = 0; q < 3; q++) { dP[3 * v + q] = A.P[3 * i + q] - acc.P[3 * v + q]; dN[3 * v + q] = A.N[3 * i + q] - acc.N[3 * v + q]; } }
              geo.morphAttributes.position.push(new THREE.Float32BufferAttribute(dP, 3));
              geo.morphAttributes.normal.push(new THREE.Float32BufferAttribute(dN, 3));
              names.push(name);
            }
            geo.morphTargetsRelative = true;
          }
          stats.morphMs = Math.round(now() - t);
          geo.computeBoundingSphere();

          /* ---- skeleton */
          const REST = {
            root: [0, 0, 0], body: [0, 0, 0], head: S.neck, jaw: J.hinge,
            lidL: EYE.L.c, lidR: EYE.R.c, lowL: EYE.L.c, lowR: EYE.R.c, arcL: EYE.L.c, arcR: EYE.R.c, sqL: EYE.L.c, sqR: EYE.R.c,
            tail0: TP[1], tail1: TP[2], tail2: TP[4], spout: SPOUT_AT, sc0: KNOT, sc1: SC1_AT,
          };
          const bones = {}, list = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; return b; });
          const LOCALQ = { lidL: eyeQ(1), lidR: eyeQ(-1), lowL: eyeQ(1), lowR: eyeQ(-1), arcL: eyeQ(1), arcR: eyeQ(-1), sqL: eyeQ(1), sqR: eyeQ(-1), spout: SQ };
          const worldQ = {};
          BONES.forEach((n) => {
            const p = PARENT[n]; if (!p) { worldQ[n] = new THREE.Quaternion(); return; }
            const w = REST[n], pw = REST[p], pq = worldQ[p];
            bones[n].position.copy(V(v3.sub(w, pw)).applyQuaternion(pq.clone().invert()));
            if (LOCALQ[n]) bones[n].quaternion.copy(pq.clone().invert().multiply(LOCALQ[n]));
            worldQ[n] = pq.clone().multiply(bones[n].quaternion);
            bones[p].add(bones[n]);
          });
          const mesh = new THREE.SkinnedMesh(geo, toon); mesh.name = 'whitewhale-skin';
          const group = new THREE.Group(); group.name = 'whitewhale-' + detail;
          group.add(bones.root); group.add(mesh);
          group.updateMatrixWorld(true);
          mesh.bind(new THREE.Skeleton(list));
          mesh.frustumCulled = false;
          if (names.length) { mesh.morphTargetDictionary = {}; names.forEach((k, i) => { mesh.morphTargetDictionary[k] = i; }); mesh.morphTargetInfluences = names.map(() => 0); }

          /* ---- eyeballs: one mesh on the head bone */
          const eyeG = new THREE.SphereGeometry(eyeR, LV.eye[0], LV.eye[1], 0, PI * 2, 0, PI * 0.6).rotateX(PI / 2);
          const EP = [], EN = [], EA = [], EI = [];
          const headInv = new THREE.Matrix4().compose(V(S.neck), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)).invert();
          for (const side of [1, -1]) {
            const E = side > 0 ? EYE.L : EYE.R;
            const m = M4().compose(V(E.c), eyeQ(side), new THREE.Vector3(1, 1, 1)).premultiply(headInv), nm = new THREE.Matrix3().getNormalMatrix(m);
            const p = eyeG.attributes.position, nr = eyeG.attributes.normal, b = EP.length / 3, vv = new THREE.Vector3(), n = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
              vv.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
              EA.push(n.x, n.y, n.z, side);
              vv.applyMatrix4(m); n.applyMatrix3(nm).normalize();
              EP.push(vv.x, vv.y, vv.z); EN.push(n.x, n.y, n.z);
            }
            for (let i = 0; i < eyeG.index.count; i++) EI.push(b + eyeG.index.getX(i));
          }
          const eg = new THREE.BufferGeometry();
          eg.setAttribute('position', new THREE.Float32BufferAttribute(EP, 3)); eg.setAttribute('normal', new THREE.Float32BufferAttribute(EN, 3));
          eg.setAttribute('aEye', new THREE.Float32BufferAttribute(EA, 4)); eg.setIndex(EI);
          const eyeMat = opts.eyeMat || DF.eyeMaterial(THREE);
          const eyes = new THREE.Mesh(eg, eyeMat); eyes.name = 'whitewhale-eyes';
          bones.head.add(eyes);

          stats.parts.eyes = EI.length / 3;
          stats.tris = acc.I.length / 3 + EI.length / 3; stats.verts = nv; stats.ms = Math.round(now() - T0);
          stats.headShare = headShare();
          stats.eye = { L: EYE.L.c.map((v) => +v.toFixed(3)), R: EYE.R.c.map((v) => +v.toFixed(3)), r: eyeR };
          const api = rig(THREE, { bones, mesh, eyeMat, stats, names, level: detail });
          group.userData.racer = api;
          group.userData.stats = stats;
          return group;
        }

        // head share of the seated height (chin = the jaw's underside, crown = the top of the box; spout excluded)
        function headShare() {
          const top = rayHit(headF, [0, 1.3, 0.06], [0, -1, 0], 0, 0.8, 96)[1];
          const chin = (rayHit(jawF, [0, 0.2, 0.2], [0, 1, 0], 0, 0.5, 96) || [0, 0.4, 0])[1];
          return { top: +top.toFixed(3), chin: +chin.toFixed(3), share: +((top - chin) / top).toFixed(3) };
        }

        /* ------------------------------------------------------------------ far: snapped low-poly parts, the face painted */
        function buildFar(THREE, SHP, C, toon, T0, now) {
          const acc = new Acc(), M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]), g = [0, 0, 0];
          const kS = [0.4, 0, 0, 1], kP = [0.45, 0, 0, 1], kSc = [0.75, 0, 0, 1];
          const snap = (f, c, ws, hs, rmax, col, k) => {
            const s = new THREE.SphereGeometry(1, ws, hs), p = s.attributes.position, n = s.attributes.normal;
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i), p.getY(i), p.getZ(i)]);
              let lo = 0, hi = rmax;
              for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (f(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c, d, (lo + hi) / 2); p.setXYZ(i, q[0], q[1], q[2]); grad(f, q[0], q[1], q[2], 0.004, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            addGeo(THREE, acc, s, M4(), col, k, 0);
          };
          snap(headTorso, [0, 0.5, -0.02], 12, 10, 0.8, (x, y, z, nx, ny) => mix3(mix3(C.shade, C.white, sstep(-0.6, 0.4, ny)), C.low, 0.45 * sstep(0.34, 0.06, y)), kS);
          const cyl = (A, B, ra, rb, col, seg, k) => {
            const d = v3.sub(B, A), L = hypot(...d), c = new THREE.CylinderGeometry(rb, ra, L, seg || 5, 1, true);
            addGeo(THREE, acc, c, M4().compose(V(v3.add(A, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), V([1, 1, 1])), col, k || kS, 0);
          };
          for (const s of [1, -1]) { const X = (p) => [s * p[0], p[1], p[2]]; cyl(X(S.fin.A), X(S.fin.B), 0.06, 0.05, C.white, 4); cyl(X(S.fin.B), X(SHP.pawC), 0.05, 0.045, C.white, 4); }
          cyl(J.A, J.B, J.ra * 0.9, J.rb * 0.9, C.low, 5);
          addGeo(THREE, acc, taperTube(THREE, TP.slice(1), S.tail.r.slice(1).map((r) => r * 0.9), S.tail.r.slice(1).map((r) => r * 0.9), 4, [1, 0, 0], false), M4(), C.white, kS, 0);
          const o = S.fluke.o, K = S.fluke.k, lobe = new THREE.SphereGeometry(1, 6, 3);
          for (const s of [1, -1]) {
            const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V([1, 0, 0]), V(FL.v), V(FL.w))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * 0.36)));
            addGeo(THREE, acc, lobe, M4().compose(V(v3.add(v3.add(o, [s * 0.2 * K, 0, 0]), FL.v, 0.11 * K)), q, V([0.19 * K, 0.076 * K, 0.03])), (x, y, z, nx, ny, nz) => (ny * FL.w[1] + nz * FL.w[2] < -0.2 ? mix3(C.low, C.deep, 0.3) : C.white), kS, 0);
          }
          // the scarf survives every level: a ring and its two tails
          {
            const pts = []; for (let i = 0; i < 8; i++) { const th = (i / 8) * PI * 2, s = scarfAt(th); pts.push(v3.add(s.p, s.out, SCARF.lift)); }
            addGeo(THREE, acc, taperTube(THREE, pts, pts.map(() => SCARF.rx), pts.map(() => SCARF.ry + 0.004), 3, (i) => { const th = (i / 8) * PI * 2; return [sin(th), 0, cos(th)]; }, false, true), M4(), C.scarf, kSc, 0);
            for (const T of SC_TAILS) addGeo(THREE, acc, taperTube(THREE, [T[0], T[2], T[4]], [0.035, 0.045, 0.055], [0.012, 0.012, 0.012], 3, [0, 1, 0], false), M4(), C.scarf, kSc, 0);
          }
          {
            const pts = []; for (let i = 0; i < 8; i++) { const s = strapAt((i / 8) * PI * 2); pts.push(v3.add(s.p, s.n, STRAP.lift)); }
            addGeo(THREE, acc, taperTube(THREE, pts, pts.map(() => STRAP.rx * 0.7), pts.map(() => 0.014), 3, (i) => { const th = (i / 8) * PI * 2; return [sin(th), 0, cos(th)]; }, false, true), M4(), C.scarf, kSc, 0);
            const lp = []; for (let i = 0; i <= 4; i++) { const s = strapAt(lerp(-STRAP.lens, STRAP.lens, i / 4)); lp.push(v3.add(s.p, s.n, STRAP.lift + 0.02)); }
            addGeo(THREE, acc, taperTube(THREE, lp, lp.map(() => STRAP.rx * 0.9), lp.map(() => 0.016), 3, [0, 1, 0], false), M4(), C.lens, kP, 0);
          }
          const sp = SPOUT_AT, sd = SPOUT_DIR;
          addGeo(THREE, acc, new THREE.CylinderGeometry(0.04, 0.03, 0.17, 5, 1, true), M4().compose(V(v3.add(sp, sd, 0.08)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(sd)), V([1, 1, 1])), C.spout, [0.1, 0, 0, 1], 0);
          addGeo(THREE, acc, new THREE.SphereGeometry(1, 6, 3), M4().compose(V(v3.add(sp, sd, 0.18)), new THREE.Quaternion(), V([0.13, 0.06, 0.13])), (x, y, z, nx, ny) => mix3(C.spout, C.spoutHi, sstep(-0.2, 0.8, ny)), [0.1, 0, 0, 1], 0);
          // the face: eyes, brows, the grin
          for (const side of [1, -1]) {
            const p = rayHit(headF, [side * 0.6, S.eye.y, S.eye.z], [-side, 0, 0], 0, 0.6, 48) || [side * 0.19, S.eye.y, S.eye.z];
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 3), M4().compose(V(p), new THREE.Quaternion(), V([0.034, 0.04, 0.04])), C.eyeW, kP, 0);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 2), M4().compose(V(v3.add(p, [side * 0.014, -0.004, 0.008])), new THREE.Quaternion(), V([0.016, 0.022, 0.022])), C.line, kP, 0);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 2), M4().compose(V(v3.add(p, [side * 0.004, 0.07, -0.01])), new THREE.Quaternion(), V([0.024, 0.014, 0.05])), C.brow, kP, 0);
          }
          const ml = []; for (let i = 0; i <= 6; i++) { const th = lerp(-1.04, 1.04, i / 6), d = [sin(th), 0, cos(th)], y = 0.508 + 0.05 * pow(sstep(0.55, 1, abs(th) / 1.04), 1.5); const p = rayHit(headF, [d[0] * 0.6, y, 0.07 + d[2] * 0.6], [-d[0], 0, -d[2]], 0, 0.6, 48); if (p) ml.push(v3.add(p, d, 0.004)); }
          addGeo(THREE, acc, taperTube(THREE, ml, ml.map(() => 0.012), ml.map(() => 0.012), 3, [0, 1, 0], false), M4(), C.line, kP, 0);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          geo.setIndex(new THREE.Uint16BufferAttribute(acc.I, 1));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, toon); mesh.name = 'whitewhale-far';
          const group = new THREE.Group(); group.name = 'whitewhale-far'; group.add(mesh);
          const stats = { tris: acc.I.length / 3, verts: acc.n, ms: Math.round(now() - T0), parts: { far: acc.I.length / 3 }, headShare: headShare() };
          const sq = { k: 1, v: 0 };
          const api = {
            level: 'far', mesh, stats, names: [], bones: null, EXPR: EX,
            set() { return api; }, setExpression() { return api; }, setGaze() { return api; }, look() { return api; }, blink() { return api; }, steer() { return api; },
            squash(k) { sq.k = k; mesh.scale.set(1 / sqrt(k), k, 1 / sqrt(k)); return api; }, kick(v) { sq.v += v; },
            update(dt) { const a = -220 * (sq.k - 1) - 14 * sq.v; sq.v += a * dt; sq.k += sq.v * dt; mesh.scale.set(1 / sqrt(sq.k), sq.k, 1 / sqrt(sq.k)); },
          };
          group.userData.racer = api; group.userData.stats = stats;
          return group;
        }

        /* ------------------------------------------------------------------ the live layer (the roster's racer API) */
        function rig(THREE, o) {
          const { bones: B, eyeMat, stats, names } = o;
          const Un = eyeMat.userData.uniforms;
          if (Un && Un.uIrisC) Un.uIrisC.value.set('#1E2C52');
          const rest = {}; for (const k in B) rest[k] = B[k].quaternion.clone();
          const N0 = EX.neutral, NM = names.length ? names : NAMES;
          const st = { w: {}, target: null, gaze: null, look: [0, 0], blink: 0, autoBlink: true, nextBlink: 2 + Math.random() * 3, blinkT: -1, sq: 1, sqV: 0, steer: 0, t: 0 };
          NM.forEach((n) => { st.w[n] = 0; });
          const springs = ['tail0', 'tail1', 'tail2', 'spout', 'sc0', 'sc1'].map((n, i) => ({ n, a: 0, v: 0, b: 0, bv: 0, ph: i * 1.7 }));
          const qx = new THREE.Quaternion(), e = new THREE.Euler();
          const blend = (key) => { let v = N0[key]; for (const k of NM) v += st.w[k] * (EX[k][key] - N0[key]); return v; };
          function apply() {
            let gx = N0.gaze[0], gy = N0.gaze[1];
            for (const k of NM) { gx += st.w[k] * (EX[k].gaze[0] - N0.gaze[0]); gy += st.w[k] * (EX[k].gaze[1] - N0.gaze[1]); }
            if (st.gaze) { gx = st.gaze[0]; gy = st.gaze[1]; }
            gx += st.look[0]; gy += st.look[1];
            if (Un) {
              Un.uGazeL.value.set(gx, gy, 1).normalize(); Un.uGazeR.value.set(gx, gy, 1).normalize();
              Un.uPupil.value = blend('pupil'); Un.uIris.value = blend('iris'); Un.uSpark.value = blend('spark');
            }
            const happy = blend('happy'), squeeze = blend('squeeze'), shut = max(happy, squeeze);
            let lu = blend('lidU'), ll = blend('lidLo');
            lu = lerp(lu, -1.5, max(sstep(0.3, 0.7, shut), st.blink)); ll = lerp(ll, -0.62, sstep(0.3, 0.7, shut));
            if (Un && Un.uLid) Un.uLid.value = lu;
            for (const s of ['L', 'R']) {
              B['lid' + s].quaternion.copy(rest['lid' + s]).multiply(qx.setFromEuler(e.set(-lu, 0, 0)));
              B['low' + s].quaternion.copy(rest['low' + s]).multiply(qx.setFromEuler(e.set(-ll, 0, 0)));
              B['arc' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, happy) * (1 - sstep(0.3, 0.7, squeeze))));
              B['sq' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, squeeze)));
            }
            if (o.mesh.morphTargetInfluences) NM.forEach((n, i) => { o.mesh.morphTargetInfluences[i] = st.w[n] || 0; });
            B.head.quaternion.copy(rest.head).multiply(qx.setFromEuler(e.set(0.02, st.steer * 0.16, blend('roll') - st.steer * 0.05)));
            B.jaw.quaternion.copy(rest.jaw).multiply(qx.setFromEuler(e.set(max(0, blend('jaw')), 0, 0)));
            B.body.rotation.set(0, 0, -st.steer * 0.05);
            B.root.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
            const sv = blend('spout'), pulse = 1 + 0.05 * sin(st.t * 9) + 0.03 * sin(st.t * 23), sp = springs[3];
            B.spout.scale.set(0.4 + 0.6 * min(sv, 1.2), max(0.05, sv * pulse), 0.4 + 0.6 * min(sv, 1.2));
            B.spout.quaternion.copy(rest.spout).multiply(qx.setFromEuler(e.set(sp.a - 0.25 * sstep(0.6, 0.2, sv), 0, sp.b)));
          }
          const api = {
            level: o.level, bones: B, mesh: o.mesh, names: NM, EXPR: EX, stats,
            set(weights) { for (const k of NM) st.w[k] = weights && weights[k] ? weights[k] : 0; st.target = null; apply(); return api; },
            setExpression(name, instant) { st.target = name; if (instant) { for (const k of NM) st.w[k] = k === name ? 1 : 0; apply(); } return api; },
            setGaze(x, y) { st.gaze = x === null || x === undefined ? null : [x, y || 0]; apply(); return api; },
            look(x, y) { st.look[0] = x; st.look[1] = y; apply(); return api; },
            blink(v) { st.blink = v || 0; st.autoBlink = v === undefined; apply(); return api; },
            squash(k) { st.sq = k; apply(); return api; },
            kick(v) { st.sqV += v; },
            steer(v) { st.steer = v; apply(); return api; },
            // auto blinks every 2-5 s, eased expressions, squash spring (220 / 14), tail, spout and scarf springs (the scarf
            // lifts with the pace, swings out of the turns and flutters)
            update(dt, inp) {
              inp = inp || {}; st.t += dt;
              if (st.target !== null) { const k = 1 - exp(-dt * 12); for (const n of NM) st.w[n] += ((n === st.target ? 1 : 0) - st.w[n]) * k; }
              if (st.autoBlink && blend('happy') < 0.5 && blend('squeeze') < 0.5) {
                st.nextBlink -= dt;
                if (st.nextBlink <= 0 && st.blinkT < 0) { st.blinkT = 0; st.nextBlink = 2 + Math.random() * 3; }
                if (st.blinkT >= 0) { st.blinkT += dt; const u = st.blinkT / 0.16; st.blink = u < 0.4 ? u / 0.4 : max(0, 1 - (u - 0.4) / 0.6); if (u >= 1) { st.blinkT = -1; st.blink = 0; } }
              }
              const a = -220 * (st.sq - 1) - 14 * st.sqV; st.sqV += a * dt; st.sq += st.sqV * dt;
              const accl = inp.accel || 0, turn = inp.steer || 0;
              for (const s of springs) {
                const isSp = s.n === 'spout', isSc = s.n[0] === 's' && s.n[1] === 'c', k = isSp ? 160 : isSc ? 120 : 110, d = isSp ? 10 : isSc ? 9 : 8;
                const ta = (isSp ? -0.35 : isSc ? 0.3 : 0.18) * accl + (isSc ? 0.07 * sin(st.t * 13 + s.ph) : 0), tb = (isSp ? 0.3 : isSc ? -0.35 : -0.32) * turn + (isSc ? 0.06 * sin(st.t * 9.5 + s.ph) : 0);
                s.v += (k * (ta - s.a) - d * s.v) * dt; s.a += s.v * dt;
                s.bv += (k * (tb - s.b) - d * s.bv) * dt; s.b += s.bv * dt;
                if (!isSp) B[s.n].quaternion.copy(rest[s.n]).multiply(qx.setFromEuler(e.set(s.a, s.b, 0)));
              }
              apply();
            },
          };
          apply();
          return api;
        }

        const api = (THREE, K, detail, opts) => WhiteWhale(THREE, K, detail, opts);
        api.EXPR = EX; api.NAMES = NAMES; api.LEVELS = LEVELS; api.S = S; api.init = init;
        // the roster entry (kartRosterAddons): add('whitewhale', KR.WhiteWhale.def(KR)). The faces: race = the grin,
        // a drift charging = a focused squint, the boost = the blow (big spout), hit / sad = the jaw dropped, the podium =
        // celebrate. A heavy, as The Whale is. jersey = the scarf and the goggle strap (a Mog's colour turns both).
        api.def = (KR) => (init(KR || root), {
          name: 'White Whale', color: '#1FB5C9', stats: { top: 1.01, accel: 0.93, handling: 0.97, mass: 1.3 }, eye: 'dog',
          jersey: '#1FB5C9', paint: '#1B3A6B',
          face: { race: { grin: 1 }, drift: { grin: 0.4, blow: 0.6 }, boost: { blow: 1 }, hit: { hit: 1 }, sad: { hit: 0.55 }, celebrate: { celebrate: 1 } },
          char: (THREE, KIT, level, o) => WhiteWhale(THREE, KIT, level, { toon: o.toon, eyeMat: o.eyeMat, kr: KR || root }),
          wheel: DF.WHEEL, eyes: [0.173, 0.624, 0.248], sled: { y: 0, z: 0, s: 1 },
          accent: '#1FB5C9', ride: 'sled',
        });
        root.WhiteWhale = api;
        if (root.DogFinal) init(root);   // (evaluated on the library, or after it: ready now)
      })(KR);

      /* Aspen GP racer: LUX (9 Oct 2026). An ORIGINAL racer, built in code: a luxury apres-ski penguin.
       *
       *   LuxPenguin(THREE, K, detail, opts) -> THREE.Group      (character; budgets ~15k / ~7.5k / ~2.9k / ~0.65k tris)
       *     K      = the roster's marching-cubes kit (KR.EndoKit)
       *     detail = 'desktop' | 'phone' | 'mid' | 'far'
       *     opts   = { toon: <the racer's gm-kart-toon>, eyeMat: <its gm-kart-eye (dog kind)>,
       *                jersey: '#E8B830' (the puffer vest), accent: '#E8B830' (goggle lens, chain), beanie: '#8C1D3A' }
       * Needs the roster's DogFinal (KR.DogFinal: util, toonMaterial, eyeMaterial, WHEEL), as every racer after the dogs does.
       *
       * The penguin: a chunky toy penguin, one smooth black body with no real neck, a white heart-shaped face mask and a
       * white belly (their own marching-cubes shell, so the paint line is a clean raised edge), big friendly eyes (separate
       * spheres, shader iris/pupil, gaze), a short orange-red beak (the lower half on its own jaw bone, so it opens), orange
       * feet, black flippers with pale undersides wrapped round the standard grip anchor (DogFinal.WHEEL, the hands of every
       * racer). Dressed for the lodge: an open-front quilted gold puffer vest (the jersey), a fluffy ivory fur collar, a
       * burgundy knit beanie with an ivory pom-pom (its own spring bone), gold mirrored ski goggles pushed up on the beanie's
       * cuff, and a tiny gold chain with a medallion on the belly. Every colour region is its own marching-cubes mesh.
       * Expressions (morph targets for the face decals + bone poses): smug (race default), focus (drift), hit, celebrate.
       *
       * Units metres, +Z forward, +Y up. Origin = seat contact (as every roster body: the kart's seat point goes here).
       * Draw calls: 2 (one SkinnedMesh in gm-kart-toon + the eye mesh), far 1.
       * group.userData.racer = { set, setExpression, setGaze, look, blink, squash, kick, steer, update, names, bones, mesh, stats }
       * group.userData.lux = { eye: [x, y, z] (Laser Eyes origin, seat space, between the eyes on the eye surface), grip: [x, y, z] }
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, exp, atan2 } = Math;
        const DF = root.DogFinal, U = DF.util;
        const { sat, clamp, lerp, sstep, smin, smax, ell, E6, cap, v3, mix3, mul3, grad, Acc, mcPart, addGeo, taperTube, rayHit } = U;
        const ell2 = (x, y, a, b) => { const X = x / a, Y = y / b, k0 = sqrt(X * X + Y * Y), k1 = sqrt(X * X / (a * a) + Y * Y / (b * b)) + 1e-9; return k0 * (k0 - 1) / k1; };

        /* ------------------------------------------------------------------ hands (flipper tips) on the shared grip */
        const WHEEL = DF.WHEEL;
        const WH = (() => {
          const W = WHEEL, up = [0, cos(W.tilt), sin(W.tilt)], nrm = [0, -sin(W.tilt), cos(W.tilt)];
          const a = W.grip, rad = v3.norm(v3.add([cos(a), 0, 0], up, sin(a)));
          return { up, nrm, rad, H: v3.add(W.c, rad, W.r) };
        })();

        /* ------------------------------------------------------------------ shape */
        const S = {
          cran: [0, 0.72, -0.015, 0.262, 0.245, 0.25],
          cheek: [0.112, 0.645, 0.045, 0.165, 0.14, 0.17], cheekK: 0.08,
          chin: [0, 0.578, 0.05, 0.19, 0.09, 0.18], chinK: 0.06,
          torso: [0, 0.3, -0.045, 0.245, 0.27, 0.215], belly: [0, 0.175, 0.0, 0.252, 0.175, 0.222], neckK: 0.1,
          eye: { x: 0.094, y: 0.716, r: 0.054, prot: 0.024, fwd: 0.5 },
          fin: { A: [0.2, 0.385, -0.01], B: [0.255, 0.36, 0.2], n: v3.norm([0.45, 1, -0.05]) },
          tail: [0, 0.07, -0.215, 0.06, 0.032, 0.06],
          neck: [0, 0.47, -0.02],
          collar: { y: 0.47, R: 0.19, sx: 1.06, z: -0.035, r: 0.066 },
          hat: { front: 0.852, back: 0.79, off: 0.024, cuff: 0.058, cuffOff: 0.015 },
          pom: [0, 1.072, -0.05], pomR: 0.068, crown: [0, 0.9, -0.035, 0.208, 0.135, 0.208],
          beak: { y: 0.624 },
          vest: { y0: 0.07, y1: 0.47, th: 0.026, quilt: 0.01, period: 0.1, open0: 0.07, open1: 0.112 },
          gog: { y: 0.884, hw: 0.142, hh: 0.044, r: 0.032 },
        };
        const SHELL = 0.0095;           // the white mask/belly shell rides this far above the black skin
        const pawC = v3.add(WH.H, WH.nrm, -0.012);
        const Wr = v3.add(WH.H, v3.norm(v3.sub(S.fin.B, WH.H)), 0.055);

        /* ------------------------------------------------------------------ the white regions (< 0 = white): face mask + belly */
        const G = (x, y, z) => {
          const ax = abs(x);
          const face = min(hypot(ax - 0.088, (y - 0.716) * 0.92) - 0.12, ell2(x, y - 0.6, 0.168, 0.105));
          const fg = max(face, (0.02 - z) * 1.5);
          const bel = max(ell2(x, y - 0.265, 0.19, 0.27), -z);
          return min(fg, bel);
        };
        // the vest: the torso inflated, quilted in horizontal channels, clipped to its band and its open front
        const V = S.vest;
        const quiltQ = (y) => 0.5 + 0.5 * cos(2 * PI * (y - V.y0) / V.period);          // 1 = a puffed channel, 0 = a seam
        const vestReg = (x, y, z) => {
          const w = lerp(V.open0, V.open1, sat((y - V.y0) / (V.y1 - V.y0)));
          return max(V.y0 - y, y - V.y1, min(w - abs(x), z + 0.01));
        };
        const brimY = (z) => lerp(S.hat.back, S.hat.front, sstep(-0.25, 0.25, z));

        /* ------------------------------------------------------------------ SDF */
        function paddle(ax, y, z, A, B, thA, thB, wA, wB, n) {
          const bx = B[0] - A[0], by = B[1] - A[1], bz = B[2] - A[2], px = ax - A[0], py = y - A[1], pz = z - A[2];
          const t = sat((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz));
          const ox = px - bx * t, oy = py - by * t, oz = pz - bz * t, on = ox * n[0] + oy * n[1] + oz * n[2];
          return ell2(on, hypot(ox - on * n[0], oy - on * n[1], oz - on * n[2]), lerp(thA, thB, t), lerp(wA, wB, t));
        }
        const headCore = (x, y, z) => {
          let d = E6(x, y, z, S.cran);
          d = smin(d, E6(abs(x), y, z, S.cheek), S.cheekK);
          return smin(d, E6(x, y, z, S.chin), S.chinK);
        };
        const torsoF = (x, y, z) => smin(E6(x, y, z, S.torso), E6(x, y, z, S.belly), 0.07);
        const headTorso = (x, y, z) => smin(headCore(x, y, z), torsoF(x, y, z), S.neckK);
        const finF = (ax, y, z) => {
          const F = S.fin;
          const d = smin(paddle(ax, y, z, F.A, F.B, 0.048, 0.038, 0.088, 0.07, F.n), paddle(ax, y, z, F.B, Wr, 0.038, 0.032, 0.07, 0.056, F.n), 0.03);
          return smin(d, ell(ax - pawC[0], y - pawC[1], z - pawC[2], 0.05, 0.038, 0.058), 0.03);
        };
        const tailF = (x, y, z) => E6(x, y, z, S.tail);
        const bodyAll = (x, y, z) => smin(smin(headTorso(x, y, z), finF(abs(x), y, z), 0.045), tailF(x, y, z), 0.05);
        const shellF = (x, y, z) => smax(headTorso(x, y, z) - SHELL, G(x, y, z), 0.014);
        const vestF = (x, y, z) => smax(torsoF(x, y, z) - V.th - V.quilt * quiltQ(y), vestReg(x, y, z), 0.012);
        const hatOff = (y, z) => S.hat.off + S.hat.cuffOff * sstep(brimY(z) + S.hat.cuff + 0.008, brimY(z) + S.hat.cuff - 0.008, y);
        // the beanie's own crown: the head, risen to a knit dome (a flat head-hugging cap read as a beret from behind)
        const hatCore = (x, y, z) => (y > 0.76 ? smin(headCore(x, y, z), E6(x, y, z, S.crown), 0.07) : headCore(x, y, z));
        const hatF = (x, y, z) => smax(hatCore(x, y, z) - hatOff(y, z), brimY(z) - y, 0.008);
        const collarF = (x, y, z) => {
          const C = S.collar, cx = x / C.sx, cz = z - C.z, th = atan2(abs(x), cz);
          const yc = C.y - 0.022 * sstep(1.4, 0, th);                                      // dips at the front, onto the chest
          const r = C.r * (1 + 0.09 * cos(9 * th)) + 0.0055 * cos(x * 57) * sin(y * 61 + 0.7) * cos(z * 53);
          return hypot(hypot(cx, cz) - C.R, (y - yc) * 1.12) - r;
        };
        const pomF = (x, y, z) => {
          const P = S.pom;
          return hypot(x - P[0], y - P[1], z - P[2]) - S.pomR - 0.0075 * cos(x * 83) * sin(y * 77 + 1.1) * cos(z * 71 + 0.4);
        };
        // the goggles stand on the cuff's outer level (a smooth surface: the fold of the cuff is under them)
        const gogBase = (x, y, z) => hatCore(x, y, z) - S.hat.off - S.hat.cuffOff;      // the cuff's outer level, smooth
        // the beak: an upper half and a lower half meeting along a gape that turns up at the corners
        const BZ = (() => { const p = rayHit(headCore, [0, S.beak.y, 0.6], [0, 0, -1], 0, 0.8, 96); return p ? p[2] : 0.24; })();
        const BY = S.beak.y;
        const gape = (x) => BY - 0.004 + 1.6 * x * x;
        const beakUp = (x, y, z) => {
          const d = smin(ell(x, y - (BY + 0.01), z - (BZ + 0.022), 0.062, 0.038, 0.064), cap(x, y, z, [0, BY + 0.006, BZ + 0.05], [0, BY - 0.008, BZ + 0.104], 0.028, 0.009), 0.032);
          return smax(d, gape(x) - y, 0.005);
        };
        const JAW = [0, BY - 0.004, BZ - 0.012];        // the lower beak's hinge
        const beakLo = (x, y, z) => {
          const d = smin(ell(x, y - (BY - 0.014), z - (BZ + 0.02), 0.052, 0.026, 0.058), cap(x, y, z, [0, BY - 0.012, BZ + 0.04], [0, BY - 0.01, BZ + 0.088], 0.02, 0.008), 0.026);
          return smax(d, y - (gape(x) - 0.0015), 0.004);
        };
        const mouthIn = (x, y, z) => ell(x, y - (BY - 0.006), z - (BZ + 0.004), 0.05, 0.024, 0.045);
        const feetF = (x, y, z) => {
          const ax = abs(x);
          let d = ell(ax - 0.1, y - 0.034, z - 0.17, 0.06, 0.03, 0.08);
          d = smin(d, ell(ax - 0.07, y - 0.03, z - 0.235, 0.028, 0.024, 0.04), 0.02);
          d = smin(d, ell(ax - 0.1, y - 0.03, z - 0.25, 0.028, 0.024, 0.042), 0.02);
          return smin(d, ell(ax - 0.132, y - 0.03, z - 0.235, 0.028, 0.024, 0.04), 0.02);
        };
        // everything, for the occlusion
        const allF = (x, y, z) => min(min(bodyAll(x, y, z), vestF(x, y, z)), min(collarF(x, y, z), y > 0.75 ? hatF(x, y, z) : 1));
        const hidden = (x, y, z) => vestF(x, y, z) < -0.016 || collarF(x, y, z) < -0.012 || (y > 0.76 && hatF(x, y, z) < -0.014);

        /* ------------------------------------------------------------------ expressions */
        const D2R = PI / 180;
        // brow: [L, R] raise; browT: [L, R] tilt (+ = inner end up, worried; - = inner end down, focused); smile: [L, R] the
        // beak corners' curl (+ up, - down); jaw: the lower beak open (0..1)
        const EX = {
          neutral:   { brow: [0, 0], browT: [0, 0], blush: 1, sweat: 0, gaze: [0, 0.02], lidU: 0.42, lidLo: -1.0, happy: 0, squeeze: 0, pupil: 0.2, iris: 0.42, spark: 0, roll: 0, jaw: 0, smile: [0.55, 0.55] },
          smug:      { brow: [0.022, -0.004], browT: [-0.15, 0.25], blush: 1, sweat: 0, gaze: [0.32, -0.02], lidU: 0.1, lidLo: -0.85, happy: 0, squeeze: 0, pupil: 0.19, iris: 0.41, spark: 0, roll: 6 * D2R, jaw: 0, smile: [1.1, 0.25] },
          focus:     { brow: [-0.008, -0.008], browT: [-0.55, -0.55], blush: 0.7, sweat: 0, gaze: [0, -0.02], lidU: 0.2, lidLo: -0.7, happy: 0, squeeze: 0, pupil: 0.16, iris: 0.37, spark: 0, roll: 0, jaw: 0.05, smile: [0.15, 0.15] },
          hit:       { brow: [0.018, 0.018], browT: [0.5, 0.5], blush: 0.5, sweat: 1, gaze: [0, 0.06], lidU: 1.1, lidLo: -1.2, happy: 0, squeeze: 0, pupil: 0.1, iris: 0.28, spark: 0, roll: -7 * D2R, jaw: 0.5, smile: [-1, -1] },
          celebrate: { brow: [0.026, 0.026], browT: [0.12, 0.12], blush: 1.35, sweat: 0, gaze: [0, 0], lidU: 0.5, lidLo: -1.0, happy: 1, squeeze: 0, pupil: 0.2, iris: 0.42, spark: 1, roll: 8 * D2R, jaw: 0.8, smile: [1.25, 1.25] },
        };
        const NAMES = ['smug', 'focus', 'hit', 'celebrate'];

        /* ------------------------------------------------------------------ palette (linear) */
        function palette(THREE, o) {
          const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
          const vest = c(o.jersey || '#E8B830'), gold = c(o.accent || '#E8B830'), hat = c(o.beanie || '#8C1D3A');
          return {
            black: c('#20242E'), blackHi: c('#4A5468'), blackDk: c('#111319'), white: c('#F7F8FA'), whiteDk: c('#D9DEE6'),
            vest, vestDk: mul3(vest, 0.62), vestHi: mix3(vest, [1, 1, 1], 0.18),
            gold, goldHi: mix3(gold, c('#FFF6D2'), 0.75), goldDk: mul3(c('#8A5A10'), 1), goldMid: mix3(gold, c('#B7741A'), 0.4),
            fur: c('#F1EADB'), furDk: c('#D6CBB6'), hat, hatDk: mul3(hat, 0.7), strap: c('#1E2028'), frame: c('#15161B'),
            beak: c('#EE6A1F'), beakDk: c('#C24A12'), beakHi: c('#FF9A4E'), feet: c('#EC6420'),
            line: c('#14161D'), mouth: c('#3A1432'), blush: c('#FF93B4'), brow: c('#1A1C24'),
            lid: c('#F2F4F7'), lidLo: c('#E8EBF0'), lidLine: c('#14161D'), sweat: c('#8FD3FF'), sweatHi: c('#E8F7FF'), pupil: c('#14161D'),
          };
        }
        const shade = (c, ao, lo) => { const k = lo + (1 - lo) * ao; return [c[0] * k * (0.92 + 0.08 * k), c[1] * k * (0.95 + 0.05 * k), c[2] * k]; };

        /* ------------------------------------------------------------------ face helpers (the whale's) */
        const faceAt = (f, x, y, lift, outN) => {
          const p = rayHit(f, [x, y, 0.6], [0, 0, -1], 0, 0.72, 56) || [x, y, 0.2], g = outN || [0, 0, 0];
          grad(f, p[0], p[1], p[2], 0.002, g); return v3.add(p, g, lift);
        };
        const onSurface = (f, pts, lift) => pts.map(([x, y]) => faceAt(f, x, y, lift));

        /* ------------------------------------------------------------------ LODs, bones */
        const LEVELS = {
          desktop: { main: 0.034, vest: 0.03, collar: 0.026, hat: 0.0285, pom: 0.019, beak: 0.0158, feet: 0.03, eye: [20, 11], lid: [14, 6], rim: [4, 20], tube: 6, extras: true, seg: 1, morph: true, chain: 18 },
          phone:   { main: 0.048, vest: 0.044, collar: 0.036, hat: 0.042, pom: 0.026, beak: 0.019, feet: 0.042, eye: [14, 8], lid: [10, 4], rim: [3, 14], tube: 4, extras: true, seg: 0.7, morph: true, chain: 14 },
          mid:     { main: 0.084, vest: 0.075, collar: 0.06, hat: 0.068, pom: 0.05, beak: 0.034, feet: 0.07, eye: [9, 5], lid: [6, 3], rim: [3, 8], tube: 4, extras: false, seg: 0.4, morph: true, chain: 0 },
          far:     { far: true },
        };
        const BONES = ['root', 'body', 'head', 'jaw', 'pom', 'lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'sqL', 'sqR'];
        const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
        const PARENT = { body: 'root', head: 'body', jaw: 'head', pom: 'head', lidL: 'head', lidR: 'head', lowL: 'head', lowR: 'head', arcL: 'head', arcR: 'head', sqL: 'head', sqR: 'head' };
        const headW = (x, y, z) => { const w = sstep(0.43, 0.6, y); return [BI.body, BI.head, w]; };
        const POM_AT = [S.pom[0], S.pom[1] - S.pomR * 0.8, S.pom[2]];

        /* ------------------------------------------------------------------ build */
        function LuxPenguin(THREE, KIT, detail, opts) {
          opts = opts || {};
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop;
          const C = palette(THREE, opts);
          const toon = opts.toon || DF.toonMaterial(THREE, opts);
          if (LV.far) return buildFar(THREE, C, toon, T0, now);
          const stats = { parts: {} };
          const acc = new Acc();
          const M4 = () => new THREE.Matrix4(), Vv = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const qFrom = (dir) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), Vv(v3.norm(dir)));
          const tpart = (name, t0) => { stats.parts[name] = (stats.parts[name] || 0) + (acc.I.length - t0) / 3; };
          const aoAt = (x, y, z, nx, ny, nz, step) => {
            let occ = 0;
            for (let s = 1; s <= 4; s++) { const hs = s * step; occ += max(0, 1 - allF(x + nx * hs, y + ny * hs, z + nz * hs) / hs) / s; }
            return sat(1 - 0.55 * max(0, occ - 0.12));
          };
          const aoStep = detail === 'mid' ? 0.03 : 0.018;
          const kSkin = [0.36, 0.45, 0, 1], kWhite = [0.42, 0.35, 0, 1], kFur = [0.62, 0.5, 3, 1], kVest = [0.3, 0.4, 0, 1];
          const setW = (R, fn) => { for (let v = R.v0; v < R.v1; v++) { const w = fn(acc.P[3 * v], acc.P[3 * v + 1], acc.P[3 * v + 2]); acc.B[3 * v] = w[0]; acc.B[3 * v + 1] = w[1]; acc.B[3 * v + 2] = w[2]; } };
          let t = now(), t0;

          /* ---- eyes: on the surface, a little proud, facing between forward and the normal */
          const g0 = [0, 0, 0];
          const eyeAt = (side) => {
            const p = rayHit(headCore, [side * S.eye.x, S.eye.y, 0.6], [0, 0, -1], 0, 0.8);
            grad(headCore, p[0], p[1], p[2], 0.002, g0);
            const dir = v3.norm(v3.lerp(g0, [side * 0.1, 0.03, 1], S.eye.fwd));
            return { c: v3.add(p, dir, -(S.eye.r - S.eye.prot)), dir };
          };
          const EYE = { L: eyeAt(1), R: eyeAt(-1) };
          const eyeQ = (side) => qFrom(side > 0 ? EYE.L.dir : EYE.R.dir);

          /* ---- the black skin: head + body + flippers + tail, one smooth surface (dropped where the white, the vest, the
           * collar or the beanie covers it) */
          t0 = acc.I.length;
          const main = mcPart(KIT, acc, bodyAll, [-0.4, -0.04, -0.36, 0.4, 0.99, 0.56], LV.main, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            let c = mix3(C.black, C.blackHi, sstep(0.2, 0.95, ny) * 0.35);
            const fin = sstep(0.012, -0.004, finF(abs(x), y, z) - headTorso(x, y, z));
            c = mix3(c, C.whiteDk, fin * sstep(-0.25, -0.8, ny) * 0.75);                 // pale flipper undersides
            return shade(c, ao, 0.72);
          }, (x, y, z) => !hidden(x, y, z) && (G(x, y, z) > -0.04 || finF(abs(x), y, z) < headTorso(x, y, z) + 0.01 || tailF(x, y, z) < headTorso(x, y, z) + 0.01), kSkin, BI.body);
          setW(main, headW);
          tpart('skin', t0);

          /* ---- the white face mask + belly: its own shell (clean raised paint edge) */
          t0 = acc.I.length;
          const shell = mcPart(KIT, acc, shellF, [-0.33, -0.04, -0.02, 0.33, 0.88, 0.4], LV.main, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            return shade(mix3(C.white, C.whiteDk, sstep(0.1, -0.7, ny) * 0.45 + sstep(-0.03, 0.0, G(x, y, z)) * 0.2), ao, 0.76);
          }, (x, y, z) => !hidden(x, y, z), kWhite, BI.body);
          setW(shell, headW);
          tpart('white', t0);
          stats.sdfMs = Math.round(now() - t); t = now();

          /* ---- the quilted puffer vest (the jersey) */
          t0 = acc.I.length;
          const vest = mcPart(KIT, acc, vestF, [-0.32, 0.03, -0.32, 0.32, 0.52, 0.3], LV.vest, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const q = quiltQ(y);
            let c = mix3(C.vestDk, C.vest, 0.45 + 0.55 * sstep(0.0, 0.7, q));
            c = mix3(c, C.vestHi, sstep(0.3, 0.95, ny) * 0.4 * q);
            return shade(c, ao, 0.7);
          }, (x, y, z) => torsoF(x, y, z) > -0.012, kVest, BI.body);
          tpart('vest', t0);

          /* ---- the fur collar (fur zone) */
          t0 = acc.I.length;
          const collar = mcPart(KIT, acc, collarF, [-0.33, 0.33, -0.33, 0.33, 0.6, 0.26], LV.collar, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            return shade(mix3(C.fur, C.furDk, sstep(0.1, -0.8, ny) * 0.55), ao, 0.72);
          }, (x, y, z) => headTorso(x, y, z) > -0.012, kFur, BI.body);
          tpart('collar', t0);

          /* ---- the beanie, its pom-pom (own bone), the goggles and the strap */
          t0 = acc.I.length;
          const hat = mcPart(KIT, acc, hatF, [-0.32, 0.76, -0.33, 0.32, 1.07, 0.3], LV.hat, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const cuff = sstep(brimY(z) + S.hat.cuff + 0.006, brimY(z) + S.hat.cuff - 0.006, y);
            return shade(mix3(mix3(C.hat, C.hatDk, cuff * 0.28), mix3(C.hat, [1, 1, 1], 0.12), sstep(0.4, 1, ny) * 0.5), ao, 0.7);
          }, (x, y, z) => headCore(x, y, z) > -0.012, [0.7, 0.4, 3, 1], BI.head);
          tpart('beanie', t0);
          t0 = acc.I.length;
          const pom = mcPart(KIT, acc, pomF, [-0.1, S.pom[1] - 0.1, S.pom[2] - 0.1, 0.1, S.pom[1] + 0.1, S.pom[2] + 0.1], LV.pom, true, (x, y, z, nx, ny) => shade(mix3(C.fur, C.furDk, sstep(0.2, -0.8, ny) * 0.5), 1, 1), (x, y, z) => hatF(x, y, z) > -0.01, kFur, BI.pom);
          void pom;
          tpart('pom', t0);
          t0 = acc.I.length;
          {
            // the lens: a squircle patch standing on the cuff's outer surface (rings round its centre, so the mirror's
            // horizon line is clean), and the frame: a tube round its rim
            const g = S.gog, n = max(14, Math.round(28 * LV.seg)), nr = max(2, Math.round(4 * LV.seg)), gg = [0, 0, 0];
            const onBase = (x, y, lift) => { const p = rayHit(gogBase, [x, y, 0.6], [0, 0, -1], 0, 0.7, 56) || [x, y, 0.25]; grad(gogBase, p[0], p[1], p[2], 0.002, gg); return [v3.add(p, gg, lift), gg.slice()]; };
            const rim = (t, k) => {
              const ct = cos(t), st2 = sin(t), e = 2 / 5;
              const x = (g.hw - k) * Math.sign(ct) * abs(ct) ** e, y = (g.hh - k) * Math.sign(st2) * abs(st2) ** e;
              return [x, g.y + y + (st2 < 0 ? 0.026 * max(0, 1 - (x / 0.045) ** 2) : 0)];
            };
            const P = [], N = [], I = [];
            { const [p, nn] = onBase(0, g.y, 0.021); P.push(...p); N.push(...nn); }
            for (let r = 1; r <= nr; r++) for (let i = 0; i < n; i++) {
              const t = 2 * PI * i / n, o = rim(t, 0.011), k = r / nr;
              const [p, nn] = onBase(o[0] * k, g.y + (o[1] - g.y) * k, 0.021 - 0.002 * k * k); P.push(...p); N.push(...nn);
            }
            for (let i = 0; i < n; i++) { const a = 1 + i, b = 1 + (i + 1) % n; I.push(0, a, b); }
            for (let r = 1; r < nr; r++) for (let i = 0; i < n; i++) {
              const a = 1 + (r - 1) * n + i, b = 1 + (r - 1) * n + (i + 1) % n, c = a + n, d = b + n;
              I.push(a, c, b, b, c, d);
            }
            const lens = new THREE.BufferGeometry();
            lens.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); lens.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); lens.setIndex(I);
            addGeo(THREE, acc, lens, M4(), (x, y, z, nx, ny) => {
              // a mirror: the bright sky above the horizon line, the sunlit gold below it, a glint across
              const yy = (y - g.y) / g.hh + ny * 0.3;
              let c = yy > 0.0 ? mix3(C.gold, C.goldHi, sstep(0.0, 0.9, yy)) : mix3(C.goldDk, C.goldMid, sstep(-1.1, -0.1, yy) * 0.8);
              c = mix3(c, mul3(C.goldDk, 0.6), sstep(0.14, 0.0, abs(yy + 0.02)) * 0.7);
              return mix3(c, [1, 1, 1], 0.75 * sstep(0.12, 0.0, abs(yy - 0.45 + 2.6 * x)));
            }, [0.12, 0, 0, 1], BI.head);
            const fr = []; for (let i = 0; i < n; i++) { const o = rim(2 * PI * i / n, 0.006); fr.push(onBase(o[0], o[1], 0.016)[0]); }
            const rx = fr.map(() => 0.0085), ry = fr.map(() => 0.013);
            addGeo(THREE, acc, taperTube(THREE, fr, rx, ry, max(4, LV.tube), (i) => onBase(fr[i][0], fr[i][1], 0)[1], false, true), M4(), (x, y, z, nx, ny) => mix3(C.frame, C.blackHi, sstep(0.3, 1, ny) * 0.5), [0.3, 0.2, 0, 1], BI.head);
          }
          tpart('goggles', t0);
          // the strap: a flat band round the beanie, from one side of the frame to the other
          if (LV.extras) {
            t0 = acc.I.length;
            const n = max(12, Math.round(26 * LV.seg)), pts = [], a0 = 0.5, gg = [0, 0, 0];
            for (let i = 0; i <= n; i++) {
              const a = a0 + (2 * PI - 2 * a0) * i / n, d = [sin(a), 0, cos(a)], y = brimY(d[2] * 0.3) + 0.034;
              const p = rayHit(hatF, [d[0] * 0.5, y, -0.015 + d[2] * 0.5], [-d[0], 0, -d[2]], 0, 0.5, 48) || [d[0] * 0.28, y, d[2] * 0.28];
              grad(hatF, p[0], p[1], p[2], 0.002, gg); pts.push(v3.add(p, gg, 0.004));
            }
            const rx = pts.map(() => 0.0055), ry = pts.map(() => 0.018);
            addGeo(THREE, acc, taperTube(THREE, pts, rx, ry, LV.tube, [0, 1, 0], true), M4(), (x, y, z, nx, ny) => mix3(C.strap, C.blackHi, sstep(0.3, 1, ny) * 0.4), [0.45, 0.3, 0, 0.9], BI.head);
            tpart('strap', t0);
          }

          /* ---- the beak (upper on the head, lower on the jaw), the mouth behind it, the feet */
          t0 = acc.I.length;
          const bcol = (x, y, z, nx, ny) => mix3(mix3(C.beak, C.beakDk, sstep(0.2, -0.7, ny) * 0.5), C.beakHi, sstep(0.4, 1, ny) * 0.35);
          mcPart(KIT, acc, beakUp, [-0.08, BY - 0.04, BZ - 0.06, 0.08, BY + 0.06, BZ + 0.13], LV.beak, true, bcol, (x, y, z) => headCore(x, y, z) > -0.008, [0.32, 0.4, 0, 1], BI.head);
          mcPart(KIT, acc, beakLo, [-0.07, BY - 0.05, BZ - 0.05, 0.07, BY + 0.02, BZ + 0.11], LV.beak, true, bcol, (x, y, z) => headCore(x, y, z) > -0.008, [0.36, 0.4, 0, 1], BI.jaw);
          mcPart(KIT, acc, mouthIn, [-0.06, BY - 0.04, BZ - 0.05, 0.06, BY + 0.03, BZ + 0.06], max(LV.beak, 0.014), true, () => C.mouth, (x, y, z) => headCore(x, y, z) > -0.012 && beakUp(x, y, z) > 0 && beakLo(x, y, z) > 0, [0.7, 0, 4, 1], BI.head);
          tpart('beak', t0);
          t0 = acc.I.length;
          mcPart(KIT, acc, feetF, [-0.2, -0.01, 0.07, 0.2, 0.08, 0.31], LV.feet, true, (x, y, z, nx, ny) => mix3(C.feet, C.beakDk, sstep(0.2, -0.6, ny) * 0.4), (x, y, z) => bodyAll(x, y, z) > -0.008, [0.4, 0.4, 0, 1], BI.body);
          tpart('feet', t0);

          /* ---- the gold chain + medallion on the belly (desktop/phone) */
          if (LV.chain) {
            t0 = acc.I.length;
            const n = LV.chain, pts = [], gg = [0, 0, 0];
            for (let i = 0; i <= n; i++) {
              const s = -1 + 2 * i / n, x = s * 0.1, y = 0.36 + 0.072 * s * s;
              const p = rayHit(headTorso, [x, y, 0.6], [0, 0, -1], 0, 0.7, 56) || [x, y, 0.2]; grad(headTorso, p[0], p[1], p[2], 0.002, gg);
              pts.push(v3.add(p, gg, SHELL + 0.005));
            }
            const r = pts.map((_, i) => (i % 2 ? 0.0042 : 0.0058));
            addGeo(THREE, acc, taperTube(THREE, pts, r, r, 4, [0, 0, 1], true), M4(), (x, y, z, nx, ny, nz) => mix3(C.goldMid, C.goldHi, sstep(-0.2, 0.9, ny + nz * 0.3)), [0.16, 0.2, 0, 1], BI.body);
            const pm = rayHit(headTorso, [0, 0.338, 0.6], [0, 0, -1], 0, 0.7, 56); grad(headTorso, pm[0], pm[1], pm[2], 0.002, gg);
            const disc = new THREE.CylinderGeometry(0.03, 0.03, 0.009, max(10, Math.round(18 * LV.seg)), 1).rotateX(PI / 2);
            addGeo(THREE, acc, disc, M4().compose(Vv(v3.add(pm, gg, SHELL + 0.009)), qFrom(gg), Vv([1, 1, 1])), (x, y, z, nx, ny, nz) => (nz > 0.5 ? mix3(C.gold, C.goldHi, sstep(-0.02, 0.03, y + x * 0.5)) : C.goldMid), [0.14, 0.2, 0, 1], BI.body);
            const ring = new THREE.TorusGeometry(0.03, 0.0045, 4, max(10, Math.round(18 * LV.seg)));
            addGeo(THREE, acc, ring, M4().compose(Vv(v3.add(pm, gg, SHELL + 0.013)), qFrom(gg), Vv([1, 1, 1])), C.goldHi, [0.14, 0.2, 0, 1], BI.body);
            tpart('chain', t0);
          }

          /* ---- the face: everything an expression changes (fixed topology; rebuilt per expression) */
          const lineK = [0.45, 0, 0, 0.6];
          const nB = max(4, Math.round(7 * LV.seg)), nS = max(4, Math.round(6 * LV.seg));
          const hf = (x, y, z) => min(headCore(x, y, z), shellF(x, y, z));
          function buildFace(A, E) {
            // brows: short arcs over the eyes, on the white mask (side-aware: s = -1 inner, +1 outer)
            for (const [side, i] of [[1, 0], [-1, 1]]) {
              const bp = [];
              for (let j = 0; j <= nB; j++) {
                const s = -1 + 2 * j / nB;
                bp.push([side * (S.eye.x + 0.004 + s * 0.034), S.eye.y + 0.072 + E.brow[i] + 0.008 * (1 - s * s) - E.browT[i] * 0.026 * s]);
              }
              const pp = onSurface(hf, bp, 0.004), pr = pp.map((_, j) => 0.0088 * (0.45 + 0.55 * sin(PI * (0.08 + 0.84 * j / nB))));
              addGeo(THREE, A, taperTube(THREE, pp, pr, pr, max(4, LV.tube - 1), [0, 0, 1], true), M4(), C.brow, lineK, BI.head);
            }
            // the beak corners: a little curl on each cheek (up = a smile, down = a frown)
            for (const [side, i] of [[1, 0], [-1, 1]]) {
              const sp = [];
              for (let j = 0; j <= nS; j++) {
                const u = j / nS, x = side * (0.058 + 0.034 * u), k = E.smile[i];
                sp.push([x, gape(0.058) + 0.004 + k * 0.022 * u * u - (k < 0 ? 0.004 * u : 0)]);
              }
              const pp = onSurface(hf, sp, 0.003), pr = pp.map((_, j) => 0.0062 * (0.35 + 0.65 * sin(PI * (0.1 + 0.8 * j / nS))));
              addGeo(THREE, A, taperTube(THREE, pp, pr, pr, max(3, LV.tube - 2), [0, 0, 1], true), M4(), C.line, lineK, BI.head);
            }
            // blush on the cheeks
            const bl = new THREE.SphereGeometry(1, max(8, LV.lid[0]), max(4, LV.lid[1] - 1));
            for (const side of [1, -1]) {
              const p = rayHit(hf, [side * 0.162, 0.63, 0.6], [0, 0, -1], 0, 0.8, 48) || [side * 0.16, 0.63, 0.2]; grad(hf, p[0], p[1], p[2], 0.002, g0);
              const k = E.blush;
              addGeo(THREE, A, bl, M4().compose(Vv(v3.add(p, g0, -0.001)), qFrom(g0), Vv([0.034 * k, 0.02 * k, 0.004])), C.blush, [0.55, 0, 0, 1], BI.head);
            }
            // the sweat drop on the temple (inside the head when off)
            if (LV.extras) {
              const p = rayHit(hf, [0.236, 0.75, 0.6], [0, 0, -1], 0, 0.8, 48) || [0.23, 0.75, 0.05]; grad(hf, p[0], p[1], p[2], 0.002, g0);
              const sw = E.sweat;
              const dg = new THREE.LatheGeometry([[0, -1], [0.55, -0.86], [0.82, -0.45], [0.66, 0.1], [0.3, 0.62], [0, 1.05]].map(([r, h]) => new THREE.Vector2(r * 0.026, h * 0.04)), max(6, LV.lid[0] >> 1));
              const at = sw > 0.01 ? v3.add(p, g0, 0.015 * min(1, sw)) : v3.add(p, g0, -0.03);
              addGeo(THREE, A, dg, M4().compose(Vv(at), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.25)), Vv(v3.scale([1, 1, 0.75], max(0.002, sw)))),
                (x, y, z, nx, ny) => mix3(C.sweat, C.sweatHi, sstep(0.0, 0.9, ny + nx * 0.3)), [0.05, 0, 0, 1], BI.head);
            }
          }
          t0 = acc.I.length;
          const E0 = EX.neutral, fc0 = acc.n;
          buildFace(acc, E0);
          const fc1 = acc.n;
          tpart('face', t0);

          /* ---- eyelids (upper shell + dark rim, lower shell), happy arcs, squeeze chevrons (the whale's recipe) */
          t0 = acc.I.length;
          const eyeR = S.eye.r, lidR = eyeR + 0.0045;
          const upG = new THREE.SphereGeometry(lidR, LV.lid[0], LV.lid[1], 0, PI * 2, 0, PI / 2);
          const loG = new THREE.SphereGeometry(lidR - 0.0016, LV.lid[0], max(3, LV.lid[1] - 2), 0, PI * 2, PI / 2, PI / 2);
          const rimG = new THREE.TorusGeometry(lidR - 0.002, 0.0058, LV.rim[0], LV.rim[1], PI).rotateX(PI / 2);
          const loRimG = new THREE.TorusGeometry(lidR - 0.0035, 0.0028, 3, max(8, LV.rim[1] >> 1), PI).rotateX(PI / 2);
          const nA = max(6, Math.round(12 * LV.seg)), tubeA = max(3, LV.tube - 2);
          const arcPts = []; for (let i = 0; i <= nA; i++) { const s = -1 + 2 * i / nA; arcPts.push(v3.scale(v3.norm([0.66 * s, -0.1 + 0.32 * (1 - s * s), 1]), lidR + 0.003)); }
          const arcR = arcPts.map((_, i) => 0.0085 * (0.4 + 0.6 * sin(PI * i / nA)));
          const arcG = taperTube(THREE, arcPts, arcR, arcR, tubeA, [0, 0, 1], true);
          for (const side of [1, -1]) {
            const sfx = side > 0 ? 'L' : 'R';
            addGeo(THREE, acc, upG, M4(), (x, y) => shade(mix3(C.lid, mul3(C.lid, 0.86), sstep(0, lidR, y) * 0.4), 1, 1), [0.36, 0.45, 0, 0.9], BI['lid' + sfx]);
            addGeo(THREE, acc, rimG, M4(), C.lidLine, [0.45, 0.3, 0, 0.7], BI['lid' + sfx]);
            addGeo(THREE, acc, loG, M4(), shade(C.lidLo, 0.92, 1), [0.45, 0.35, 0, 0.9], BI['low' + sfx]);
            if (LV.extras) addGeo(THREE, acc, loRimG, M4(), mix3(C.lidLine, C.lidLo, 0.5), [0.5, 0, 0, 1], BI['low' + sfx]);
            addGeo(THREE, acc, arcG, M4(), C.lidLine, [0.45, 0, 0, 1], BI['arc' + sfx]);
            const ch = [[side * 0.55, 0.42], [-side * 0.4, 0.02], [side * 0.55, -0.36]].map(([a, b]) => v3.scale(v3.norm([a, b, 1]), lidR + 0.003));
            const chP = new THREE.CatmullRomCurve3(ch.map((p) => Vv(p)), false, 'catmullrom', 0.1).getPoints(max(6, nA)).map((p) => [p.x, p.y, p.z]);
            const chR = chP.map((_, i) => 0.0082 * (0.5 + 0.5 * sin(PI * i / (chP.length - 1))));
            addGeo(THREE, acc, taperTube(THREE, chP, chR, chR, tubeA, [0, 0, 1], true), M4(), C.lidLine, [0.45, 0, 0, 1], BI['sq' + sfx]);
          }
          tpart('lids', t0);
          stats.accMs = Math.round(now() - t); t = now();

          /* ---- geometry; eye-frame parts bound at the eye */
          const nv = acc.n, geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
          for (let v = 0; v < nv; v++) { SI[4 * v] = acc.B[3 * v]; SI[4 * v + 1] = acc.B[3 * v + 1]; const f = acc.B[3 * v + 2]; SW[4 * v] = 1 - f; SW[4 * v + 1] = f; }
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
          {
            const pa = geo.attributes.position, na = geo.attributes.normal, vv = new THREE.Vector3(), nn = new THREE.Vector3();
            const eyeBones = new Set(['lidL', 'lidR', 'lowL', 'lowR', 'arcL', 'arcR', 'sqL', 'sqR'].map((n) => BI[n]));
            const qL = eyeQ(1), qR = eyeQ(-1);
            for (let v = 0; v < nv; v++) {
              const b = acc.B[3 * v]; if (!eyeBones.has(b)) continue;
              const side = BONES[b].endsWith('L') ? 1 : -1, E = side > 0 ? EYE.L : EYE.R, q = side > 0 ? qL : qR;
              vv.fromBufferAttribute(pa, v).applyQuaternion(q).add(Vv(E.c)); pa.setXYZ(v, vv.x, vv.y, vv.z);
              nn.fromBufferAttribute(na, v).applyQuaternion(q); na.setXYZ(v, nn.x, nn.y, nn.z);
            }
          }
          geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));

          /* ---- morph targets: the face rebuilt with each expression (the body's shape does not change: cheap) */
          const names = [];
          if (LV.morph && !(typeof window !== 'undefined' && window.KartDiag && window.KartDiag.nomorph)) {
            geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
            for (const name of NAMES) {
              const dP = new Float32Array(nv * 3), dN = new Float32Array(nv * 3);
              const A = new Acc(); buildFace(A, EX[name]);
              if (A.n !== fc1 - fc0) throw new Error('lux: face topology changed for ' + name + ': ' + A.n + ' vs ' + (fc1 - fc0));
              for (let i = 0; i < A.n; i++) { const v = fc0 + i; for (let q = 0; q < 3; q++) { dP[3 * v + q] = A.P[3 * i + q] - acc.P[3 * v + q]; dN[3 * v + q] = A.N[3 * i + q] - acc.N[3 * v + q]; } }
              geo.morphAttributes.position.push(new THREE.Float32BufferAttribute(dP, 3));
              geo.morphAttributes.normal.push(new THREE.Float32BufferAttribute(dN, 3));
              names.push(name);
            }
            geo.morphTargetsRelative = true;
          }
          stats.morphMs = Math.round(now() - t);
          geo.computeBoundingSphere();

          /* ---- skeleton */
          const REST = {
            root: [0, 0, 0], body: [0, 0, 0], head: S.neck, jaw: JAW, pom: POM_AT,
            lidL: EYE.L.c, lidR: EYE.R.c, lowL: EYE.L.c, lowR: EYE.R.c, arcL: EYE.L.c, arcR: EYE.R.c, sqL: EYE.L.c, sqR: EYE.R.c,
          };
          const bones = {}, list = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; return b; });
          const LOCALQ = { lidL: eyeQ(1), lidR: eyeQ(-1), lowL: eyeQ(1), lowR: eyeQ(-1), arcL: eyeQ(1), arcR: eyeQ(-1), sqL: eyeQ(1), sqR: eyeQ(-1) };
          const worldQ = {};
          BONES.forEach((n) => {
            const p = PARENT[n]; if (!p) { worldQ[n] = new THREE.Quaternion(); return; }
            const w = REST[n], pw = REST[p], pq = worldQ[p];
            bones[n].position.copy(Vv(v3.sub(w, pw)).applyQuaternion(pq.clone().invert()));
            if (LOCALQ[n]) bones[n].quaternion.copy(pq.clone().invert().multiply(LOCALQ[n]));
            worldQ[n] = pq.clone().multiply(bones[n].quaternion);
            bones[p].add(bones[n]);
          });
          const mesh = new THREE.SkinnedMesh(geo, toon); mesh.name = 'lux-skin';
          const group = new THREE.Group(); group.name = 'lux-' + detail;
          group.add(bones.root); group.add(mesh);
          group.updateMatrixWorld(true);
          mesh.bind(new THREE.Skeleton(list));
          mesh.frustumCulled = false;
          if (names.length) { mesh.morphTargetDictionary = {}; names.forEach((k, i) => { mesh.morphTargetDictionary[k] = i; }); mesh.morphTargetInfluences = names.map(() => 0); }

          /* ---- eyeballs: one mesh on the head bone */
          const eyeG = new THREE.SphereGeometry(eyeR, LV.eye[0], LV.eye[1], 0, PI * 2, 0, PI * 0.6).rotateX(PI / 2);
          const EP = [], EN = [], EA = [], EI = [];
          const headInv = new THREE.Matrix4().compose(Vv(S.neck), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)).invert();
          for (const side of [1, -1]) {
            const E = side > 0 ? EYE.L : EYE.R;
            const m = M4().compose(Vv(E.c), eyeQ(side), new THREE.Vector3(1, 1, 1)).premultiply(headInv), nm = new THREE.Matrix3().getNormalMatrix(m);
            const p = eyeG.attributes.position, nr = eyeG.attributes.normal, b = EP.length / 3, vv = new THREE.Vector3(), n = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
              vv.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
              EA.push(n.x, n.y, n.z, side);
              vv.applyMatrix4(m); n.applyMatrix3(nm).normalize();
              EP.push(vv.x, vv.y, vv.z); EN.push(n.x, n.y, n.z);
            }
            for (let i = 0; i < eyeG.index.count; i++) EI.push(b + eyeG.index.getX(i));
          }
          const eg = new THREE.BufferGeometry();
          eg.setAttribute('position', new THREE.Float32BufferAttribute(EP, 3)); eg.setAttribute('normal', new THREE.Float32BufferAttribute(EN, 3));
          eg.setAttribute('aEye', new THREE.Float32BufferAttribute(EA, 4)); eg.setIndex(EI);
          const eyeMat = opts.eyeMat || DF.eyeMaterial(THREE);
          const eyes = new THREE.Mesh(eg, eyeMat); eyes.name = 'lux-eyes';
          bones.head.add(eyes);

          stats.parts.eyes = EI.length / 3;
          stats.tris = acc.I.length / 3 + EI.length / 3; stats.verts = nv; stats.ms = Math.round(now() - T0);
          const api = rig(THREE, { bones, mesh, eyeMat, stats, names, level: detail });
          group.userData.racer = api;
          group.userData.stats = stats;
          group.userData.lux = anchors(EYE);
          return group;
        }

        // the anchors a kart world wants: Laser Eyes' origin (between the eyes, on their front surface) and the grip
        function anchors(EYE) {
          const E = EYE || { L: { c: [S.eye.x, S.eye.y, 0.2] }, R: { c: [-S.eye.x, S.eye.y, 0.2] } };
          const mid = v3.scale(v3.add(E.L.c, E.R.c), 0.5);
          return { eye: [0, +(mid[1]).toFixed(3), +(mid[2] + S.eye.r).toFixed(3)], eyeL: E.L.c.map((v) => +v.toFixed(3)), eyeR: E.R.c.map((v) => +v.toFixed(3)), grip: WH.H.map((v) => +v.toFixed(3)) };
        }

        /* ------------------------------------------------------------------ far: snapped low-poly parts, the face painted */
        function buildFar(THREE, C, toon, T0, now) {
          const acc = new Acc(), M4 = () => new THREE.Matrix4(), Vv = (a) => new THREE.Vector3(a[0], a[1], a[2]), g = [0, 0, 0];
          const snap = (f, c, ws, hs, rmax, col, k) => {
            const s = new THREE.SphereGeometry(1, ws, hs), p = s.attributes.position, n = s.attributes.normal;
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i), p.getY(i), p.getZ(i)]);
              let lo = 0, hi = rmax;
              for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (f(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c, d, (lo + hi) / 2); p.setXYZ(i, q[0], q[1], q[2]); grad(f, q[0], q[1], q[2], 0.004, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            addGeo(THREE, acc, s, M4(), col, k, 0);
          };
          const kS = [0.36, 0.4, 0, 1], kP = [0.45, 0, 0, 1];
          // the body (head + torso + vest + beanie) as one snapped sphere, painted by region
          const outer = (x, y, z) => min(min(headTorso(x, y, z), vestF(x, y, z)), y > 0.76 ? hatF(x, y, z) : 1);
          const paint = (x, y, z) => {
            if (y > 0.77 && y > brimY(z) - 0.004) return C.hat;
            if (vestReg(x, y, z) < 0.004) return C.vest;
            return G(x, y, z) < 0 ? C.white : C.black;
          };
          snap(outer, [0, 0.52, -0.02], 14, 11, 0.8, paint, kS);
          // the collar
          addGeo(THREE, acc, new THREE.TorusGeometry(S.collar.R, S.collar.r, 4, 10).rotateX(PI / 2), M4().compose(Vv([0, S.collar.y - 0.01, S.collar.z]), new THREE.Quaternion(), Vv([S.collar.sx, 1, 1])), C.fur, [0.62, 0.5, 3, 1], 0);
          // the pom
          addGeo(THREE, acc, new THREE.SphereGeometry(S.pomR, 6, 4), M4().makeTranslation(S.pom[0], S.pom[1], S.pom[2]), C.fur, [0.62, 0.5, 3, 1], 0);
          // flippers
          const cyl = (A, B, ra, rb, col, seg) => {
            const d = v3.sub(B, A), L = hypot(...d), c = new THREE.CylinderGeometry(rb, ra, L, seg || 5, 1, true);
            addGeo(THREE, acc, c, M4().compose(Vv(v3.add(A, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Vv(v3.norm(d))), Vv([1, 1, 1])), col, kS, 0);
          };
          for (const s of [1, -1]) { const X = (p) => [s * p[0], p[1], p[2]]; cyl(X(S.fin.A), X(S.fin.B), 0.06, 0.05, C.black, 4); cyl(X(S.fin.B), X(pawC), 0.05, 0.045, C.black, 4); }
          // the beak, the feet
          addGeo(THREE, acc, new THREE.ConeGeometry(0.05, 0.11, 6, 1).rotateX(PI / 2), M4().makeTranslation(0, BY, BZ + 0.05), C.beak, kS, 0);
          for (const s of [1, -1]) addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 3), M4().compose(Vv([s * 0.1, 0.035, 0.2]), new THREE.Quaternion(), Vv([0.07, 0.03, 0.09])), C.feet, kS, 0);
          // the goggles: a gold bar on the cuff
          const gp = faceAt(hatF, 0, S.gog.y, 0.012);
          addGeo(THREE, acc, new THREE.BoxGeometry(S.gog.hw * 2, S.gog.hh * 2, 0.03), M4().compose(Vv(gp), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)), Vv([1, 1, 1])), C.gold, [0.1, 0, 0, 1], 0);
          // the face: eyes (white + pupil under a lid line)
          const fz = (x, y) => faceAt(headCore, x, y, 0.004);
          for (const side of [1, -1]) {
            const p = fz(side * S.eye.x, S.eye.y);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 3), M4().compose(Vv(p), new THREE.Quaternion(), Vv([0.05, 0.05, 0.02])), C.white, kP, 0);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 4, 2), M4().compose(Vv(v3.add(p, [side * 0.004, -0.006, 0.014])), new THREE.Quaternion(), Vv([0.026, 0.028, 0.012])), C.pupil, kP, 0);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          geo.setIndex(new THREE.Uint16BufferAttribute(acc.I, 1));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, toon); mesh.name = 'lux-far';
          const group = new THREE.Group(); group.name = 'lux-far'; group.add(mesh);
          const stats = { tris: acc.I.length / 3, verts: acc.n, ms: Math.round(now() - T0), parts: { far: acc.I.length / 3 } };
          const sq = { k: 1, v: 0 };
          const api = {
            level: 'far', mesh, stats, names: [], bones: null,
            set() { return api; }, setExpression() { return api; }, setGaze() { return api; }, look() { return api; }, blink() { return api; }, steer() { return api; },
            squash(k) { sq.k = k; mesh.scale.set(1 / sqrt(k), k, 1 / sqrt(k)); return api; }, kick(v) { sq.v += v; },
            update(dt) { const a = -220 * (sq.k - 1) - 14 * sq.v; sq.v += a * dt; sq.k += sq.v * dt; mesh.scale.set(1 / sqrt(sq.k), sq.k, 1 / sqrt(sq.k)); },
          };
          group.userData.racer = api; group.userData.stats = stats; group.userData.lux = anchors(null);
          return group;
        }

        /* ------------------------------------------------------------------ the live layer (the whale's API) */
        function rig(THREE, o) {
          const { bones: B, eyeMat, stats, names } = o;
          const Un = eyeMat.userData.uniforms;
          Un.uIrisC.value.set('#2D5AA0');
          const rest = {}; for (const k in B) rest[k] = B[k].quaternion.clone();
          const N0 = EX.neutral, NM = names.length ? names : NAMES;
          const st = { w: {}, target: null, gaze: null, look: [0, 0], blink: 0, autoBlink: true, nextBlink: 2 + Math.random() * 3, blinkT: -1, sq: 1, sqV: 0, steer: 0, t: 0 };
          NM.forEach((n) => { st.w[n] = 0; });
          const pomS = { a: 0, v: 0, b: 0, bv: 0 };
          const qx = new THREE.Quaternion(), e = new THREE.Euler();
          const blend = (key) => { let v = N0[key]; for (const k of NM) v += st.w[k] * (EX[k][key] - N0[key]); return v; };
          function apply() {
            let gx = N0.gaze[0], gy = N0.gaze[1];
            for (const k of NM) { gx += st.w[k] * (EX[k].gaze[0] - N0.gaze[0]); gy += st.w[k] * (EX[k].gaze[1] - N0.gaze[1]); }
            if (st.gaze) { gx = st.gaze[0]; gy = st.gaze[1]; }
            gx += st.look[0]; gy += st.look[1];
            Un.uGazeL.value.set(gx, gy, 1).normalize(); Un.uGazeR.value.set(gx, gy, 1).normalize();
            Un.uPupil.value = blend('pupil'); Un.uIris.value = blend('iris'); Un.uSpark.value = blend('spark');
            const happy = blend('happy'), squeeze = blend('squeeze'), shut = max(happy, squeeze);
            let lu = blend('lidU'), ll = blend('lidLo');
            lu = lerp(lu, -1.5, max(sstep(0.3, 0.7, shut), st.blink)); ll = lerp(ll, -0.62, sstep(0.3, 0.7, shut));
            Un.uLid.value = lu;
            for (const s of ['L', 'R']) {
              B['lid' + s].quaternion.copy(rest['lid' + s]).multiply(qx.setFromEuler(e.set(-lu, 0, 0)));
              B['low' + s].quaternion.copy(rest['low' + s]).multiply(qx.setFromEuler(e.set(-ll, 0, 0)));
              B['arc' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, happy) * (1 - sstep(0.3, 0.7, squeeze))));
              B['sq' + s].scale.setScalar(max(1e-4, sstep(0.45, 0.85, squeeze)));
            }
            if (o.mesh.morphTargetInfluences) NM.forEach((n, i) => { o.mesh.morphTargetInfluences[i] = st.w[n] || 0; });
            B.head.quaternion.copy(rest.head).multiply(qx.setFromEuler(e.set(0.02, st.steer * 0.16, blend('roll') - st.steer * 0.05)));
            B.jaw.quaternion.copy(rest.jaw).multiply(qx.setFromEuler(e.set(0.55 * max(0, blend('jaw')), 0, 0)));
            B.pom.quaternion.copy(rest.pom).multiply(qx.setFromEuler(e.set(pomS.a, 0, pomS.b)));
            B.body.rotation.set(0, 0, -st.steer * 0.05);
            B.root.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
          }
          const api = {
            level: o.level, bones: B, mesh: o.mesh, names: NM, EXPR: EX, stats,
            set(weights) { for (const k of NM) st.w[k] = weights && weights[k] ? weights[k] : 0; st.target = null; apply(); return api; },
            setExpression(name, instant) { st.target = name; if (instant) { for (const k of NM) st.w[k] = k === name ? 1 : 0; apply(); } return api; },
            setGaze(x, y) { st.gaze = x === null || x === undefined ? null : [x, y || 0]; apply(); return api; },
            look(x, y) { st.look[0] = x; st.look[1] = y; apply(); return api; },
            blink(v) { st.blink = v || 0; st.autoBlink = v === undefined; apply(); return api; },
            squash(k) { st.sq = k; apply(); return api; },
            kick(v) { st.sqV += v; },
            steer(v) { st.steer = v; apply(); return api; },
            // auto blinks every 2-5 s, eased expressions, squash spring (220 / 14), the pom-pom's spring (it lags the speed, swings out of a turn)
            update(dt, inp) {
              inp = inp || {}; st.t += dt;
              if (st.target !== null) { const k = 1 - exp(-dt * 12); for (const n of NM) st.w[n] += ((n === st.target ? 1 : 0) - st.w[n]) * k; }
              if (st.autoBlink && blend('happy') < 0.5 && blend('squeeze') < 0.5) {
                st.nextBlink -= dt;
                if (st.nextBlink <= 0 && st.blinkT < 0) { st.blinkT = 0; st.nextBlink = 2 + Math.random() * 3; }
                if (st.blinkT >= 0) { st.blinkT += dt; const u = st.blinkT / 0.16; st.blink = u < 0.4 ? u / 0.4 : max(0, 1 - (u - 0.4) / 0.6); if (u >= 1) { st.blinkT = -1; st.blink = 0; } }
              }
              const a = -220 * (st.sq - 1) - 14 * st.sqV; st.sqV += a * dt; st.sq += st.sqV * dt;
              const accl = inp.accel || 0, turn = inp.steer || 0, k = 90, d = 7;
              const ta = -0.3 * accl + 0.6 * st.sqV * 0.05, tb = 0.4 * turn;
              pomS.v += (k * (ta - pomS.a) - d * pomS.v) * dt; pomS.a += pomS.v * dt;
              pomS.bv += (k * (tb - pomS.b) - d * pomS.bv) * dt; pomS.b += pomS.bv * dt;
              apply();
            },
          };
          apply();
          return api;
        }

        LuxPenguin.EXPR = EX; LuxPenguin.NAMES = NAMES; LuxPenguin.LEVELS = LEVELS; LuxPenguin.S = S; LuxPenguin.anchors = () => anchors(null);
        root.LuxPenguin = LuxPenguin;
      })(KR);

      /* Aspen GP racer: LORD BLACK DIAMOND (9 Oct 2026). An ORIGINAL caped dark-lord look-alike, built in code
       * on the roster's pipeline (SDF -> marching cubes, every colour region its own MC mesh, guarded projection, one toon).
       *
       *   LordBlackDiamond(THREE, K, detail, opts) -> THREE.Group      budgets ~14k / 7k / 2.6k / 0.8k (desktop/phone/mid/far)
       *     K      = the endo marching-cubes kit (KR.EndoKit); needs DogFinal (util, WHEEL, toonMaterial) loaded first.
       *     opts   = { toon: <the shared gm-kart-toon material>,
       *                accent: '#FF2E3A'  the thin red lights (brow bars, chest lines, helmet tail-light, clasps, buckle),
       *                lining: '#9A1422'  the inside of the cape (shows when it streams),
       *                jersey: alias of accent (the roster's Mog recolour slot),
       *                capeLift: 0.9  how far the cape swings back at top speed on top of its rest (rad; 0.6 = steeper, shows
       *                               its back to a high chase camera; 1.1 = flatter, more dramatic from the side) }
       *
       * The design (no film or brand marks): a glossy black DOME helmet with a flared neck guard that sweeps forward into
       * cheek guards, a straight visor brow (no centre dip); an ORIGINAL gunmetal faceplate: chiselled V front, two slanted
       * black glass lenses under thin red light bars (the expressions), a plain tapered chin (no grille, no breathing mask);
       * glossy black pauldrons, chest shield with the BLACK DIAMOND ski-run sign (a black diamond on a white square) and two
       * red light lines; a graphite belt with one plain silver buckle (no control box); black leather gauntlets on the grips;
       * glossy black boots. A long black cape with a crimson lining, a second ski sign across its back (the chase-cam read),
       * red clasp studs at the collar. The same sign is on the helmet's brow.
       *
       * Units metres, +Z forward, +Y up, origin = the seat contact under the pelvis; hands on the roster's standard grip
       * (DogFinal.WHEEL ten-and-two).  Draw calls: 1 (one SkinnedMesh in gm-kart-toon; the lenses are toon too, no eye
       * mesh). 'far' = 1 plain Mesh (the cape static, mid-stream).
       * Rig: 10 bones (root, body, head, browL, browR, cape0..cape3). Expressions = bone poses only (no morphs):
       *   menace (race default), charge, hit, celebrate.
       * The cape: 4 chain bones; it streams back and flutters with speed:
       *   api.update(dt, { accel, steer, speed })   (speed in m/s; or)   api.cape(speed, dt) to feed the speed alone.
       * group.userData.racer = { set(weights), setExpression(name, instant), setGaze(x, y), look(x, y), blink(v), squash(k),
       *   kick(v), steer(v), update(dt, {accel, steer, speed}), cape(speed, dt), names, bones, mesh, stats,
       *   eyes: [[x, y, z] left, [x, y, z] right] (lens centres, body space: the Laser Eyes mount) }
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, exp, floor } = Math;
        const DF = () => root.DogFinal;

        /* ------------------------------------------------------------------ measurements (+x = his left) */
        const G = {
          dome: [0, 0.75, -0.035, 0.236, 0.232, 0.246],
          bell: { y0: 0.455, y1: 0.76, r0: [0.335, 0.345], r1: [0.212, 0.222], zc: -0.06 },
          brow: { y: 0.705, k: 0.035, w: 0.168 },
          face: [0, 0.628, 0.055, 0.176, 0.152, 0.172], faceZ: 0.236, faceV: 0.34,
          lens: { x: 0.074, y: 0.652, a: 0.3, r: [0.056, 0.022] },
          neck: [0, 0.47, -0.04],
          chest: [0, 0.28, -0.045, 0.19, 0.205, 0.152], waist: [0, 0.14, -0.015, 0.172, 0.13, 0.148],
          paul: [0.19, 0.418, -0.045, 0.108, 0.078, 0.112],
          S: [0.19, 0.39, -0.045], El: [0.262, 0.27, 0.15], armR: [0.066, 0.058, 0.05],
          Hp: [0.1, 0.085, 0.02], K: [0.134, 0.18, 0.225], F: [0.134, 0.07, 0.36],   // (inside the sled's fit box: |x| <= 0.22)
          belt: { y: 0.162, h: 0.03 },
          cape: { top: 0.448, zb: -0.17, w0: 0.215, w1: 0.4, L: 0.53, tilt: 0.24 },
        };
        // expressions (bone poses): brow = [lift (m), angle (rad, + = inner end down: menace)], pitch / roll of the head
        const EX = {
          neutral:   { brow: [0.0, 0.12], len: 1, pitch: 0, roll: 0, flash: 0 },
          menace:    { brow: [-0.004, 0.36], len: 1.05, pitch: 0.07, roll: 0.03, flash: 0 },
          charge:    { brow: [-0.006, 0.5], len: 1.25, pitch: 0.12, roll: 0, flash: 0 },
          hit:       { brow: [0.012, -0.42], len: 0.8, pitch: -0.08, roll: -0.16, flash: 0 },
          celebrate: { brow: [0.01, -0.12], len: 1.2, pitch: -0.2, roll: 0.1, flash: 0 },
        };
        const NAMES = ['menace', 'charge', 'hit', 'celebrate'];

        let _wh = null;
        function WH() {
          if (_wh) return _wh;
          const W = DF().WHEEL, { v3 } = DF().util, up = [0, cos(W.tilt), sin(W.tilt)], nrm = [0, -sin(W.tilt), cos(W.tilt)];
          const a = W.grip, rad = v3.norm(v3.add([cos(a), 0, 0], up, sin(a)));
          return (_wh = { up, nrm, rad, H: v3.add(W.c, rad, W.r) });
        }

        /* ------------------------------------------------------------------ the SDFs */
        function lbdSDF() {
          const { sat, sstep, smin, smax, ell, E6, cap, v3 } = DF().util;
          const ell2 = (x, y, a, b) => { const X = x / a, Y = y / b, k0 = sqrt(X * X + Y * Y), k1 = sqrt(X * X / (a * a) + Y * Y / (b * b)) + 1e-9; return k0 * (k0 - 1) / k1; };
          const B = G.bell, BR = G.brow;
          const browY = (ax) => BR.y + 0.035 * (ax / BR.w) * (ax / BR.w);
          // the faceplate: a chiselled mask, a V front (two planes meeting at the centre crease), the chin tapering
          const faceRaw = (x, y, z) => {
            const ax = abs(x);
            let d = E6(x, y, z, G.face);
            d = smax(d, (z - G.faceZ) + G.faceV * ax, 0.03);
            d = smax(d, ax - (0.118 + 0.42 * max(0, y - 0.5)), 0.03);
            return d;
          };
          const lens2D = (ax, y) => {
            const L = G.lens, dx = ax - L.x, dy = y - L.y, c = cos(L.a), s = sin(L.a);
            const u = dx * c + dy * s, w = -dx * s + dy * c;
            return smax(ell2(u, w, L.r[0], L.r[1] * (1 - 0.35 * sat(-u / L.r[0]))), -(w + L.r[1] * 0.8), 0.006);   // a flat-bottomed slanted lens
          };
          const faceF = faceRaw;
          const lensF = (x, y, z) => smax(lens2D(abs(x), y), abs(faceRaw(x, y, z) + 0.002) - 0.006, 0.003);   // a raised glass lens, 4 mm proud of the plate
          // the helmet: dome + the flared bell (neck guard sweeping forward into cheek guards), the face cavity cut
          const bellF = (x, y, z) => {
            const t = sat((B.y1 - y) / (B.y1 - B.y0)), k = t * t * (0.45 + 0.55 * t);
            const rx = B.r1[0] + (B.r0[0] - B.r1[0]) * k, rz = B.r1[1] + (B.r0[1] - B.r1[1]) * k;
            let d = ell2(x, z - B.zc, rx, rz);
            d = smax(d, B.y0 - y, 0.012); d = smax(d, y - B.y1, 0.03);
            return smax(d, cutD(x, y, z), 0.03);
          };
          const cutD = (x, y, z) => z - (0.015 + 0.95 * max(0, abs(x) - 0.135) - 0.25 * max(0, y - 0.62));   // the cheek guards' front cut
          const cavF = (x, y, z) => smax(smax(abs(x) - (BR.w + 0.004), y - browY(abs(x)), 0.02), 0.0 - z, 0.02);
          const helmetRaw = (x, y, z) => smin(E6(x, y, z, G.dome), bellF(x, y, z), 0.05);   // (a clean dome: no crest, it notched at phone grids)
          const helmetF = (x, y, z) => smax(helmetRaw(x, y, z), -cavF(x, y, z), 0.01);
          // body
          const H = WH().H, Wr = v3.add(H, v3.norm(v3.sub(G.El, H)), 0.07), pawC = v3.add(H, WH().nrm, -0.012);
          const torsoF = (x, y, z) => smin(E6(x, y, z, G.chest), E6(x, y, z, G.waist), 0.07);
          const neckF = (x, y, z) => cap(x, y, z, [0, 0.36, -0.045], [0, 0.6, -0.04], 0.085, 0.08);
          const armF = (ax, y, z) => smin(cap(ax, y, z, G.S, G.El, G.armR[0], G.armR[1]), cap(ax, y, z, G.El, Wr, G.armR[1], G.armR[2]), 0.03);
          const legF = (ax, y, z) => smin(cap(ax, y, z, G.Hp, G.K, 0.1, 0.078), cap(ax, y, z, G.K, G.F, 0.074, 0.06), 0.035);
          const bodyF = (x, y, z) => { const ax = abs(x); return smin(smin(smin(torsoF(x, y, z), neckF(x, y, z), 0.04), armF(ax, y, z), 0.045), legF(ax, y, z), 0.045); };
          const paulF = (x, y, z) => { const ax = abs(x), p = G.paul; let d = E6(ax, y, z, p); return smax(d, -(y - p[1] + 0.035 + 0.25 * (ax - p[0])), 0.012); };
          // the chest shield: the torso grown 13 mm, cut to a shield (round shoulders, a point at the navel), front only
          const shield2D = (ax, y) => smax(ax - (0.165 - 0.62 * max(0, 0.27 - y)), max(y - 0.395, 0.165 - y), 0.02);
          const plateF = (x, y, z) => smax(smax(torsoF(x, y, z) - 0.013, shield2D(abs(x), y), 0.006), -z - 0.01, 0.01);
          const beltF = (x, y, z) => smax(torsoF(x, y, z) - 0.012, abs(y - G.belt.y) - G.belt.h, 0.006);
          // black leather gauntlets: a mitt round the grip and a flared cuff back along the forearm
          const gloveF = (x, y, z) => {
            const ax = abs(x), q = [ax - pawC[0], y - pawC[1], z - pawC[2]];
            const d = ell(q[0], q[1], q[2], 0.058, 0.054, 0.064);
            const ca = v3.add(Wr, v3.norm(v3.sub(G.El, Wr)), 0.075);
            return smin(d, cap(ax, y, z, Wr, ca, 0.052, 0.068), 0.025);
          };
          const bootF = (x, y, z) => {
            const ax = abs(x), sh = v3.lerp(G.K, G.F, 0.38);
            let d = smin(ell(ax - G.F[0], y - G.F[1], z - G.F[2] - 0.02, 0.066, 0.064, 0.098), cap(ax, y, z, sh, G.F, 0.07, 0.066), 0.03);
            return smax(d, -(y - 0.008), 0.01);
          };
          return { cutD, faceRaw, faceF, lensF, lens2D, helmetF, helmetRaw, bellF, cavF, browY, torsoF, bodyF, armF, legF, paulF, plateF, shield2D, beltF, gloveF, bootF, pawC, Wr, ell2 };
        }

        /* ------------------------------------------------------------------ palette (linear) */
        function palette(THREE, o) {
          const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
          return {
            helm: c('#0E0F13'), helmHi: c('#2A2E36'), face: c('#4A505A'), faceHi: c('#6D7480'), faceDk: c('#2A2D33'),
            lens: c('#07080A'), lensRed: c('#3A070C'),
            suit: c('#2A2D35'), suitHi: c('#3A3E48'), armour: c('#121317'), armourHi: c('#30343C'),
            belt: c('#2E3138'), silver: c('#B9C0C9'), silverHi: c('#E8ECF0'),
            leather: c('#1A1716'), leatherHi: c('#3A3230'),
            cape: c('#121216'), capeHi: c('#26262E'), lining: c(o.lining || '#9A1422'), liningDk: c('#5A0A14'),
            white: c('#F4F6F8'), diamond: c('#0B0C0E'), accent: c(o.accent || o.jersey || '#FF2E3A').map((a) => a * 0.42),   // (glow = 3x: kept under the tone curve's knee, so it stays red)
          };
        }

        /* ------------------------------------------------------------------ LODs and bones */
        const LEVELS = {
          desktop: { helm: 0.0285, face: 0.016, lensG: [5, 24], body: 0.04, paul: 0.028, plate: 0.025, glove: 0.021, boot: 0.031, cape: [16, 12], tube: 4, seg: 1, sign: 2 },
          phone:   { helm: 0.04, face: 0.024, lensG: [3, 16], body: 0.058, paul: 0.038, plate: 0.034, glove: 0.029, boot: 0.042, cape: [11, 8], tube: 4, seg: 0.7, sign: 1 },
          mid:     { helm: 0.07, face: 0.045, lensG: [1, 8], body: 0.1, paul: 0.065, plate: 0.06, glove: 0.055, boot: 0.07, cape: [7, 5], tube: 3, seg: 0.4, sign: 1 },
          far:     { far: true, cape: [5, 3], tube: 3 },
        };
        const BONES = ['root', 'body', 'head', 'browL', 'browR', 'cape0', 'cape1', 'cape2', 'cape3'];
        const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
        const PARENT = { body: 'root', head: 'body', browL: 'head', browR: 'head', cape0: 'body', cape1: 'cape0', cape2: 'cape1', cape3: 'cape2' };

        /* ------------------------------------------------------------------ the cape (a parametric sheet, two layers + hem) */
        // u in [-1, 1] across (+ = his left), v in [0, 1] down from the collar. The rest pose hangs down the back.
        function capeAt(u, v) {
          const C = G.cape, dy = -cos(C.tilt), dz = -sin(C.tilt);
          const w = C.w0 + (C.w1 - C.w0) * v;
          const wrap = (1 - 0.3 * v) * 0.15 * u * u;                // the top wraps round the shoulders; the hem keeps a curve (volume when it streams)
          const fold = 0.016 * v * sin(u * PI * 2.5 + 0.6) * (0.4 + 0.6 * v);   // soft folds, deepest at the hem
          return [w * u, C.top - 0.02 * u * u + dy * C.L * v, C.zb + wrap + dz * C.L * v - fold];
        }
        function capeNormal(u, v) {   // outward (away from the body)
          const { v3 } = DF().util, e = 1e-3;
          const du = v3.sub(capeAt(u + e, v), capeAt(u - e, v)), dv = v3.sub(capeAt(u, v + e), capeAt(u, v - e));
          let n = v3.norm(v3.cross(du, dv));
          if (n[2] > 0) n = v3.scale(n, -1);
          return n;
        }
        const CAPE_V = [0, 1 / 3, 2 / 3, 1];
        // skin: rigid segments blended 50/50 at each joint
        function capeSkin(v) {
          const s = min(2.999, v * 3), k = floor(s), l = s - k;
          if (l >= 0.5) return [BI['cape' + k], BI['cape' + (k + 1)], 0.5 * sstep0(0.5, 1, l)];
          if (k > 0) return [BI['cape' + k], BI['cape' + (k - 1)], 0.5 * sstep0(0.5, 0, l)];
          return [BI.cape0, BI.cape0, 0];
        }
        function sstep0(a, b, x) { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

        function buildCape(THREE, acc, C, LV, skinned, kOut, kIn) {
          const { v3, mix3, sstep } = DF().util;
          const [nu, nv] = LV.cape, T = 0.007;
          const push = (p, n, col, k, sk) => {
            acc.k = k; acc.bone = 0; acc.bw = null;
            const i = acc.v(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
            if (skinned) { acc.B[3 * i] = sk[0]; acc.B[3 * i + 1] = sk[1]; acc.B[3 * i + 2] = sk[2]; }
            return i;
          };
          const t0 = acc.I.length;
          for (const side of [1, -1]) {   // 1 = outer (black), -1 = inner (the lining)
            const base = acc.n;
            for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
              const u = -1 + 2 * i / nu, v = j / nv, p = capeAt(u, v), n = capeNormal(u, v);
              const q = v3.add(p, n, side * T * 0.5), nn = side > 0 ? n : v3.scale(n, -1);
              const edge = sstep(0.82, 1, abs(u)) + sstep(0.9, 1, v);
              const col = side > 0 ? mix3(mix3(C.cape, C.capeHi, sstep(-0.2, -0.9, n[2]) * 0.4), C.capeHi, edge * 0.3)
                : mix3(C.lining, C.liningDk, 0.35 * (1 - v) + 0.3 * sstep(0.5, 1, abs(u)));
              push(q, nn, col, side > 0 ? kOut : kIn, capeSkin(v));
            }
            const W = nu + 1;
            for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
              const a = base + j * W + i, b = a + 1, c = a + W, d = c + 1;
              // outward-facing winding on the outer layer, the reverse on the lining
              if (side > 0) acc.I.push(a, b, c, b, d, c); else acc.I.push(a, c, b, b, c, d);
            }
          }
          // fix the winding once from the geometry (the outer layer must face its normal)
          {
            const P = acc.P, N = acc.N, I = acc.I;
            let dot = 0;
            for (let t = t0; t < t0 + min(60, I.length - t0); t += 3) {
              const a = I[t], b = I[t + 1], c = I[t + 2];
              const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
              const wx = P[3 * c] - P[3 * a], wy = P[3 * c + 1] - P[3 * a + 1], wz = P[3 * c + 2] - P[3 * a + 2];
              dot += (uy * wz - uz * wy) * N[3 * a] + (uz * wx - ux * wz) * N[3 * a + 1] + (ux * wy - uy * wx) * N[3 * a + 2];
            }
            if (dot < 0) for (let t = t0; t < I.length; t += 3) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; }
          }
          // the hem: a black rolled edge round the sides and the bottom (closes the gap between the layers)
          const hem = (pts, vs) => {
            const r = T * 0.75 + 0.002, R = LV.tube;
            const tg = taper(THREE, pts, r, R);
            const pos = tg.attributes.position, nor = tg.attributes.normal, bse = acc.n;
            for (let i = 0; i < pos.count; i++) {
              const ring = floor(i / R), vv = vs[min(vs.length - 1, ring)];
              push([pos.getX(i), pos.getY(i), pos.getZ(i)], [nor.getX(i), nor.getY(i), nor.getZ(i)], C.cape, kOut, capeSkin(vv));
            }
            for (let i = 0; i < tg.index.count; i++) acc.I.push(bse + tg.index.getX(i));
          };
          const outline = [], vs = [];
          for (let j = 0; j <= nv; j++) { outline.push(capeAt(1, j / nv)); vs.push(j / nv); }
          for (let i = nu - 1; i >= 0; i--) { outline.push(capeAt(-1 + 2 * i / nu, 1)); vs.push(1); }
          for (let j = nv - 1; j >= 0; j--) { outline.push(capeAt(-1, j / nv)); vs.push(j / nv); }
          hem(outline, vs);
          return { t0, t1: acc.I.length };
        }
        // a plain round tube along a polyline (no caps)
        function taper(THREE, pts, r, R) {
          const { v3 } = DF().util, P = [], N = [], I = [], n = pts.length;
          for (let i = 0; i < n; i++) {
            const T = v3.norm(v3.sub(pts[min(n - 1, i + 1)], pts[max(0, i - 1)]));
            const hint = abs(T[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0], sd = v3.norm(v3.cross(T, hint)), up = v3.cross(sd, T);
            for (let j = 0; j < R; j++) {
              const a = j / R * PI * 2, d = v3.add(v3.scale(sd, cos(a)), up, sin(a));
              P.push(pts[i][0] + d[0] * r, pts[i][1] + d[1] * r, pts[i][2] + d[2] * r); N.push(d[0], d[1], d[2]);
            }
          }
          for (let i = 0; i < n - 1; i++) for (let j = 0; j < R; j++) { const a = i * R + j, b = i * R + (j + 1) % R, c = a + R, d = b + R; I.push(a, c, b, b, c, d); }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
          return g;
        }

        /* ---- the ski sign: a white square, a black diamond on it, laid flat on a surface point (p, n, up) */
        function sign(THREE, acc, C, p, n, up, size, bone, segs) {
          const { v3 } = DF().util;
          const nn = v3.norm(n), side = v3.norm(v3.cross(up, nn)), uu = v3.cross(nn, side);
          const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(...side), new THREE.Vector3(...uu), new THREE.Vector3(...nn)).setPosition(p[0], p[1], p[2]);
          const sq = new THREE.BoxGeometry(size, size, 0.006, segs, segs, 1).translate(0, 0, -0.001);
          const kW = [0.45, 0, 0, 1], kD = [0.2, 0, 0, 1];
          DF().util.addGeo(THREE, acc, sq, M, C.white, kW, bone);
          const dm = new THREE.BoxGeometry(size * 0.5, size * 0.5, 0.004).rotateZ(PI / 4).translate(0, 0, 0.0025);
          DF().util.addGeo(THREE, acc, dm, M, C.diamond, kD, bone);
        }

        /* ------------------------------------------------------------------ build */
        function LordBlackDiamond(THREE, KIT, detail, opts) {
          opts = opts || {};
          const D = DF(), U = D.util, { sat, lerp, sstep, v3, mix3, grad, Acc, mcPart, addGeo, rayHit } = U;
          const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop;
          const C = palette(THREE, opts);
          const toon = opts.toon || D.toonMaterial(THREE, opts);
          const F = lbdSDF();
          if (LV.far) return buildFar(THREE, F, C, toon, T0, now, LV);
          const stats = { parts: {} };
          const acc = new Acc();
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const tpart = (name, t0) => { stats.parts[name] = (stats.parts[name] || 0) + (acc.I.length - t0) / 3; };
          const ALL = (x, y, z) => min(min(F.helmetF(x, y, z), F.faceRaw(x, y, z)), F.bodyF(x, y, z));
          const aoAt = (x, y, z, nx, ny, nz, step) => {
            let occ = 0;
            for (let s = 1; s <= 4; s++) { const hs = s * step; occ += max(0, 1 - ALL(x + nx * hs, y + ny * hs, z + nz * hs) / hs) / s; }
            return sat(1 - 0.55 * max(0, occ - 0.12));
          };
          const aoStep = detail === 'mid' ? 0.03 : 0.018;
          const shade = (c, ao, lo) => { const k = lo + (1 - lo) * ao; return [c[0] * k, c[1] * k, c[2] * k]; };
          const g0 = [0, 0, 0];
          const kGloss = [0.16, 0.25, 0, 1], kArm = [0.24, 0.3, 0, 1], kSuit = [0.55, 0.6, 0, 1], kFace = [0.3, 0.4, 0, 1], kLens = [0.06, 0, 0, 1];
          const kLeather = [0.36, 0.7, 0, 1], kGlow = [0.3, 0, 2, 1], kSilver = [0.2, 0, 0, 1], kCape = [0.62, 0.5, 0, 1], kLining = [0.5, 0.8, 0, 1];
          let t0;
          const surf = (f, o, d) => { const p = rayHit(f, o, d, 0, 0.8, 64); if (!p) return null; grad(f, p[0], p[1], p[2], 0.002, g0); return { p, n: g0.slice() }; };
          const glowLine = (f, pts2, from, lift, r, bone, col) => {   // a red light line laid on a surface (points projected along `from`)
            const P = [];
            for (const q of pts2) { const h = surf(f, [q[0] - from[0] * 0.5, q[1] - from[1] * 0.5, q[2] - from[2] * 0.5], from); if (h) P.push(v3.add(h.p, h.n, lift)); }
            if (P.length < 2) return;
            const tg = taper(THREE, P, r, LV.tube);
            addGeo(THREE, acc, tg, M4(), col || C.accent, col ? kSilver : kGlow, bone);
          };

          /* ---- 1. the helmet: glossy black (the cavity's edge = a crisp brow line over the faceplate) */
          t0 = acc.I.length;
          mcPart(KIT, acc, F.helmetF, [-0.34, 0.44, -0.4, 0.34, 1.02, 0.28], LV.helm, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            const c = mix3(C.helm, C.helmHi, sstep(0.55, 1, ny) * 0.25);
            const edge = max(sstep(-0.03, -0.004, -F.cavF(x, y, z)) * sstep(-0.05, 0.05, z), sstep(0.5, 0.465, y), sstep(-0.035, -0.006, F.cutD(x, y, z)) * sstep(0.74, 0.7, y));
            acc.K[4 * v] = lerp(kGloss[0], 0.62, edge);
            return shade(mix3(c, C.helm, edge), ao, 0.7);
          }, (x, y, z) => F.faceRaw(x, y, z) > -0.004, kGloss, BI.head);
          tpart('helmet', t0);
          /* ---- 2. the faceplate (gunmetal), the lens recesses carved; then the lenses (black glass) */
          t0 = acc.I.length;
          mcPart(KIT, acc, F.faceF, [-0.22, 0.44, -0.05, 0.22, 0.75, 0.27], LV.face, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep * 0.7); acc.K[4 * v + 3] = ao;
            let c = mix3(C.face, C.faceHi, sstep(0.2, 0.9, ny) * 0.35 + sstep(0.012, 0.0, abs(x)) * 0.25);
            c = mix3(c, C.faceDk, sstep(0.56, 0.48, y) * 0.5);
            return shade(c, ao, 0.5);
          }, (x, y, z) => F.helmetF(x, y, z) > -0.003 && F.bodyF(x, y, z) > -0.004, kFace, BI.head);
          tpart('face', t0); t0 = acc.I.length;
          // the lenses: a domed glass pillow laid on the plate (a polar grid projected onto it: smooth rims, no MC sparkle)
          for (const side of [1, -1]) {
            const L = G.lens, ca = cos(L.a), sa = sin(L.a), nr = LV.lensG[0], ns = LV.lensG[1], base = acc.n, gg = [0, 0, 0];
            acc.k = kLens; acc.bone = BI.head; acc.bw = null;
            const vert = (r, a) => {
              let u = r * cos(a) * L.r[0], w = r * sin(a) * L.r[1] * (1 - 0.35 * sat(-cos(a) * r));
              w = max(w, -0.8 * L.r[1] * r);                                    // the flat lower edge
              const dx = u * ca - w * sa, dy = u * sa + w * ca, x = side * (L.x + dx), y = L.y + dy;
              const p = rayHit(F.faceRaw, [x, y, 0.4], [0, 0, -1], 0, 0.5, 40) || [x, y, 0.2];
              grad(F.faceRaw, p[0], p[1], p[2], 0.002, gg);
              const r4 = r * r * r * r, lift = 0.0006 + 0.0042 * (1 - r4);
              const rad = v3.norm([side * dx, dy, 0]), n = v3.norm(v3.add(gg, rad, 0.9 * r * r * r));
              const q = v3.add(p, gg, lift), c = mix3(C.lens, C.lensRed, sstep(0.0, -L.r[1], w) * 0.8);
              acc.v(q[0], q[1], q[2], n[0], n[1], n[2], c[0], c[1], c[2]);
            };
            vert(0, 0);
            for (let j = 1; j <= nr; j++) for (let i = 0; i < ns; i++) vert(j / nr, (i / ns) * PI * 2);
            const at = (j, i) => (j === 0 ? base : base + 1 + (j - 1) * ns + (i % ns));
            const t1 = acc.I.length;
            for (let i = 0; i < ns; i++) acc.I.push(at(0, 0), at(1, i), at(1, i + 1));
            for (let j = 1; j < nr; j++) for (let i = 0; i < ns; i++) acc.I.push(at(j, i), at(j + 1, i), at(j, i + 1), at(j, i + 1), at(j + 1, i), at(j + 1, i + 1));
            // face out (+z): flip the winding if the first triangle faces in
            const P = acc.P, I = acc.I, a = I[t1], b = I[t1 + 1], c = I[t1 + 2];
            const nz = (P[3 * b] - P[3 * a]) * (P[3 * c + 1] - P[3 * a + 1]) - (P[3 * b + 1] - P[3 * a + 1]) * (P[3 * c] - P[3 * a]);
            if (nz < 0) for (let t = t1; t < I.length; t += 3) { const s2 = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s2; }
          }
          tpart('lenses', t0);

          /* ---- 3. the suit: torso, neck, arms, legs (dark graphite, matte) */
          t0 = acc.I.length;
          mcPart(KIT, acc, F.bodyF, [-0.4, -0.03, -0.26, 0.4, 0.62, 0.5], LV.body, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            return shade(mix3(C.suit, C.suitHi, sstep(0.4, 1, ny) * 0.3), ao, 0.55);
          }, (x, y, z) => F.helmetF(x, y, z) > -0.006 && F.faceRaw(x, y, z) > -0.006 && F.plateF(x, y, z) > -0.003 && F.beltF(x, y, z) > -0.003
            && F.gloveF(x, y, z) > -0.003 && F.bootF(x, y, z) > -0.003 && F.paulF(x, y, z) > -0.004, kSuit, BI.body);
          tpart('suit', t0);
          /* ---- 4. armour: pauldrons, the chest shield, the belt, the boots (glossy black); the gauntlets (leather) */
          t0 = acc.I.length;
          const armourCol = (lo) => (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao;
            return shade(mix3(C.armour, C.armourHi, sstep(0.3, 1, ny) * 0.3), ao, lo);
          };
          mcPart(KIT, acc, F.paulF, [-0.32, 0.32, -0.17, 0.32, 0.51, 0.08], LV.paul, true, armourCol(0.6), (x, y, z) => F.helmetF(x, y, z) > -0.004, kArm, BI.body);
          mcPart(KIT, acc, F.plateF, [-0.2, 0.15, -0.03, 0.2, 0.42, 0.14], LV.plate, true, armourCol(0.6), (x, y, z) => F.helmetF(x, y, z) > -0.004 && F.faceRaw(x, y, z) > -0.004, kArm, BI.body);
          mcPart(KIT, acc, F.beltF, [-0.2, 0.12, -0.2, 0.2, 0.2, 0.15], LV.plate, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep); acc.K[4 * v + 3] = ao; return shade(C.belt, ao, 0.55);
          }, null, kSuit, BI.body);
          mcPart(KIT, acc, F.bootF, [-0.24, -0.01, 0.17, 0.24, 0.17, 0.5], LV.boot, true, armourCol(0.6), (x, y, z) => F.legF(abs(x), y, z) > -0.003 || y < 0.02, kArm, BI.body);
          tpart('armour', t0); t0 = acc.I.length;
          mcPart(KIT, acc, F.gloveF, [-0.22, 0.3, 0.26, 0.22, 0.5, 0.56], LV.glove, true, (x, y, z, nx, ny, nz, v) => {
            const ao = aoAt(x, y, z, nx, ny, nz, aoStep * 0.6); acc.K[4 * v + 3] = ao;
            return shade(mix3(C.leather, C.leatherHi, sstep(0.2, 1, ny) * 0.5), ao, 0.6);
          }, (x, y, z) => F.armF(abs(x), y, z) > -0.003, kLeather, BI.body);
          tpart('gloves', t0);

          /* ---- 5. the signs: helmet brow, chest shield, (the cape's back below) */
          t0 = acc.I.length;
          {
            const hb = surf(F.helmetF, [0, 0.815, 0.6], [0, -0.12, -1].map((a, i, A) => a / hypot(...A)));
            if (hb) sign(THREE, acc, C, v3.add(hb.p, hb.n, 0.0015), hb.n, [0, 1, 0], 0.074, BI.head, LV.sign);
            const cb = surf(F.plateF, [0, 0.338, 0.5], [0, 0, -1]);
            if (cb) sign(THREE, acc, C, v3.add(cb.p, cb.n, 0.0015), cb.n, [0, 1, 0], 0.084, BI.body, LV.sign);
          }
          tpart('signs', t0);

          /* ---- 6. the red lights (glow): brow bars (on their bones), chest lines, the helmet's tail-light arc, collar clasps,
           * the buckle (silver plate, one red dot) */
          t0 = acc.I.length;
          const browBar = [];
          for (const side of [1, -1]) {
            const L = G.lens, ca = cos(L.a), sa = sin(L.a), cx = L.x, cy = L.y + L.r[1] + 0.017;
            const pts = []; const n = max(3, Math.round(5 * LV.seg));
            for (let i = 0; i <= n; i++) { const u = -1 + 2 * i / n; pts.push([side * (cx + u * 0.06 * ca), cy + u * 0.06 * sa, 0.3]); }
            const c0 = acc.I.length;
            glowLine(F.faceRaw, pts, [0, 0, -1], 0.005, 0.0078, side > 0 ? BI.browL : BI.browR);
            browBar.push({ side, c: [side * cx, cy, 0], t0: c0, t1: acc.I.length });
          }
          // the faceplate's silver centre crest (brow to chin, down the V) and the dark jaw seam across the chin
          {
            const pts = []; for (let i = 0; i <= 6; i++) pts.push([0, lerp(0.7, 0.5, i / 6), 0.4]);
            glowLine(F.faceRaw, pts, [0, 0, -1], 0.002, 0.0048, BI.head, C.silver);
            // the chin plate's seams: from under each lens converging on the chin (stern, never a smile)
            for (const side of [1, -1]) {
              const seam = []; for (let i = 0; i <= 4; i++) { const u = i / 4; seam.push([side * lerp(0.128, 0.052, u), lerp(0.618, 0.505, u), 0.4]); }
              glowLine(F.faceRaw, seam, [0, 0, -1], 0.0005, 0.0042, BI.head, C.faceDk);
            }
          }
          // chest: two slanted lines under the sign, following the shield's point
          for (const side of [1, -1]) {
            const pts = []; for (let i = 0; i <= 4; i++) { const u = i / 4; pts.push([side * lerp(0.13, 0.035, u), lerp(0.285, 0.205, u), 0.5]); }
            glowLine(F.plateF, pts, [0, 0, -1], 0.003, 0.0055, BI.body);
          }
          // helmet: the tail-light arc round the back of the neck guard (the chase-cam's red)
          {
            const pts = [], n = max(6, Math.round(14 * LV.seg));
            for (let i = 0; i <= n; i++) { const a = PI * (0.18 + 0.64 * i / n); pts.push([cos(a) * 0.6, 0.545, -0.055 - sin(a) * 0.6]); }
            const P = [];
            for (const q of pts) { const h = surf(F.helmetF, q, v3.norm([-q[0], 0, -0.055 - q[2]])); if (h) P.push(v3.add(h.p, h.n, 0.003)); }
            if (P.length > 1) addGeo(THREE, acc, taper(THREE, P, 0.0065, LV.tube), M4(), C.accent, kGlow, BI.head);
          }
          // the pauldrons' lower rims and the gauntlet cuffs (seen from the chase camera on both sides)
          for (const side of [1, -1]) {
            const p = G.paul, P = [], n = max(6, Math.round(12 * LV.seg));
            for (let i = 0; i <= n; i++) {
              const th = -0.9 + (PI + 1.5) * i / n, ax = p[0] + 0.1 * cos(th), y = p[1] - 0.035 - 0.25 * (ax - p[0]) + 0.014;
              const o = [side * (p[0] + 0.3 * cos(th)), y, p[2] + 0.3 * sin(th)], d = v3.norm([side * p[0] - o[0], 0, p[2] - o[2]]);
              const h = surf(F.paulF, o, d); if (h) P.push(v3.add(h.p, h.n, 0.003));
            }
            if (P.length > 1) addGeo(THREE, acc, taper(THREE, P, 0.0058, LV.tube), M4(), C.accent, kGlow, BI.body);
            const ax = v3.norm(v3.sub(G.El, F.Wr)), ca = v3.add(F.Wr, ax, 0.062);
            addGeo(THREE, acc, new THREE.TorusGeometry(0.064, 0.0052, LV.tube, max(10, Math.round(18 * LV.seg))),
              M4().compose(V([side * ca[0], ca[1], ca[2]]), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V([side * ax[0], ax[1], ax[2]])), new THREE.Vector3(1, 1, 1)), C.accent, kGlow, BI.body);
          }
          // the collar clasps (red studs where the cape meets the shoulders), the buckle
          for (const side of [1, -1]) {
            const p = capeAt(side * 0.93, 0.02);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.019, 8 * LV.seg + 2 | 0, LV.seg > 0.5 ? 5 : 3), M4().makeTranslation(p[0], p[1] + 0.01, p[2] + 0.012), C.accent, kGlow, BI.body);
            if (LV.seg > 0.5) addGeo(THREE, acc, new THREE.TorusGeometry(0.022, 0.006, 4, 10), M4().makeTranslation(p[0], p[1] + 0.01, p[2] + 0.012), C.silver, kSilver, BI.body);
          }
          {
            const b = surf(F.beltF, [0, G.belt.y, 0.5], [0, 0, -1]);
            if (b) {
              const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)).setPosition(b.p[0], b.p[1], b.p[2] + 0.004);
              addGeo(THREE, acc, new THREE.BoxGeometry(0.075, 0.052, 0.012), M, C.silver, kSilver, BI.body);
              addGeo(THREE, acc, new THREE.BoxGeometry(0.03, 0.012, 0.006).translate(0, 0, 0.008), M, C.accent, kGlow, BI.body);
            }
          }
          tpart('lights', t0);

          /* ---- 7. the cape (skinned to its chain) and the sign across its back */
          t0 = acc.I.length;
          buildCape(THREE, acc, C, LV, true, kCape, kLining);
          {
            // the back sign, laid on the outer layer at (u 0, v 0.36), skinned like the cape there
            const v = 0.36, p = capeAt(0, v), n = capeNormal(0, v), dv = v3.norm(v3.sub(capeAt(0, v - 0.01), capeAt(0, v + 0.01)));
            const a0 = acc.n;
            sign(THREE, acc, C, v3.add(p, n, 0.0062), n, dv, 0.15, BI.cape1, LV.sign + 1);
            for (let i = a0; i < acc.n; i++) {
              // nearest v from the height along the cape's axis
              const y = acc.P[3 * i + 1], vv = sat((G.cape.top - y) / (G.cape.L * cos(G.cape.tilt))), sk = capeSkin(vv);
              acc.B[3 * i] = sk[0]; acc.B[3 * i + 1] = sk[1]; acc.B[3 * i + 2] = sk[2];
            }
          }
          tpart('cape', t0);

          /* ---- the geometry, skin */
          const nv = acc.n;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
          for (let v = 0; v < nv; v++) { SI[4 * v] = acc.B[3 * v]; SI[4 * v + 1] = acc.B[3 * v + 1]; const f = acc.B[3 * v + 2]; SW[4 * v] = 1 - f; SW[4 * v + 1] = f; }
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
          geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));
          geo.computeBoundingSphere();

          /* ---- skeleton */
          const browC = (s) => browBar.find((b) => b.side === s);
          const zOn = (x, y) => { const h = surf(F.faceRaw, [x, y, 0.4], [0, 0, -1]); return h ? h.p[2] : 0.2; };
          const bl = browC(1).c, br = browC(-1).c;
          const REST = {
            root: [0, 0, 0], body: [0, 0, 0], head: G.neck,
            browL: [bl[0], bl[1], zOn(bl[0], bl[1])], browR: [br[0], br[1], zOn(br[0], br[1])],
            cape0: capeAt(0, CAPE_V[0]), cape1: capeAt(0, CAPE_V[1]), cape2: capeAt(0, CAPE_V[2]), cape3: capeAt(0, CAPE_V[3]),
          };
          const bones = {}, list = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; return b; });
          BONES.forEach((n) => { const p = PARENT[n]; if (!p) return; bones[n].position.copy(V(v3.sub(REST[n], REST[p]))); bones[p].add(bones[n]); });
          const mesh = new THREE.SkinnedMesh(geo, toon); mesh.name = 'lbd-skin';
          const group = new THREE.Group(); group.name = 'lbd-' + detail;
          group.add(bones.root); group.add(mesh);
          group.updateMatrixWorld(true);
          mesh.bind(new THREE.Skeleton(list));
          mesh.frustumCulled = false;

          // the lens centres (the Laser Eyes mount), body space at rest
          const eyes = [1, -1].map((s) => { const x = s * G.lens.x, y = G.lens.y, h = surf(F.faceRaw, [x, y, 0.4], [0, 0, -1]); return h ? v3.add(h.p, h.n, 0.0048).map((a) => +a.toFixed(4)) : [x, y, 0.21]; });
          stats.tris = acc.I.length / 3; stats.verts = nv; stats.ms = Math.round(now() - T0); stats.draws = 1;
          stats.eyes = eyes;
          const api = rig(THREE, { bones, mesh, stats, level: detail, toon, rest: REST, capeLift: opts.capeLift });
          api.eyes = eyes;
          group.userData.racer = group.userData.lbd = api;
          group.userData.stats = stats;
          return group;
        }

        /* ------------------------------------------------------------------ far LOD: snapped low-poly parts, one mesh */
        function buildFar(THREE, F, C, toon, T0, now, LV) {
          const U = DF().util, { v3, mix3, sstep, grad, Acc, addGeo } = U;
          const acc = new Acc(), M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]), g = [0, 0, 0];
          const snap = (f, c, ws, hs, rmax, col, k, sc) => {
            const s = new THREE.SphereGeometry(1, ws, hs), p = s.attributes.position, n = s.attributes.normal;
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i) * (sc ? sc[0] : 1), p.getY(i) * (sc ? sc[1] : 1), p.getZ(i) * (sc ? sc[2] : 1)]);
              let lo = 0, hi = rmax;
              for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (f(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c, d, (lo + hi) / 2); p.setXYZ(i, q[0], q[1], q[2]);
              grad(f, q[0], q[1], q[2], 0.004, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            addGeo(THREE, acc, s, M4(), col, k, 0);
          };
          const kG = [0.18, 0.2, 0, 1], kS = [0.55, 0.5, 0, 1], kGl = [0.3, 0, 2, 1];
          snap(F.helmetRaw, [0, 0.66, -0.05], 10, 7, 0.5, (x, y, z, nx, ny) => mix3(C.helm, C.helmHi, sstep(0.5, 1, ny) * 0.3), kG);
          snap(F.faceRaw, [0, 0.62, 0.07], 6, 4, 0.3, C.face, [0.3, 0.4, 0, 1]);
          snap(F.torsoF, [0, 0.27, -0.04], 8, 5, 0.4, (x, y, z) => (z > 0.02 && y > 0.17 && y < 0.4 ? C.armour : C.suit), kS);
          const cyl = (A, B, ra, rb, col, k) => {
            const d = v3.sub(B, A), L = hypot(...d), c = new THREE.CylinderGeometry(rb, ra, L, 5, 1, true);
            addGeo(THREE, acc, c, M4().compose(V(v3.add(A, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), V([1, 1, 1])), col, k || kS);
          };
          for (const s of [1, -1]) {
            const X = (p) => [s * p[0], p[1], p[2]];
            cyl(X(G.S), X(G.El), 0.066, 0.058, C.suit); cyl(X(G.El), X(F.Wr), 0.058, 0.052, C.suit);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.06, 5, 3), M4().makeTranslation(...X(F.pawC)), C.leather, [0.36, 0.7, 0, 1]);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 6, 4), M4().compose(V(X(G.paul)), new THREE.Quaternion(), V([0.105, 0.07, 0.11])), C.armour, kG);
            cyl(X(G.Hp), X(G.K), 0.098, 0.078, C.suit); cyl(X(G.K), X(G.F), 0.072, 0.064, C.armour, kG);
            addGeo(THREE, acc, new THREE.SphereGeometry(1, 5, 3), M4().compose(V(v3.add(X(G.F), [0, 0, 0.02])), new THREE.Quaternion(), V([0.066, 0.06, 0.095])), C.armour, kG);
            // the lens + its red bar
            addGeo(THREE, acc, new THREE.BoxGeometry(0.1, 0.022, 0.012), M4().compose(V([s * G.lens.x, G.lens.y + 0.03, 0.215 - 0.3 * G.lens.x]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s * 0.33, s * 0.3)), V([1, 1, 1])), C.accent, kGl);
          }
          // the chest sign, the helmet tail-light (a red band), the cape (static, mid-stream)
          addGeo(THREE, acc, new THREE.BoxGeometry(0.09, 0.09, 0.01), M4().makeTranslation(0, 0.315, 0.115), C.white, [0.45, 0, 0, 1]);
          addGeo(THREE, acc, new THREE.BoxGeometry(0.045, 0.045, 0.01).rotateZ(PI / 4), M4().makeTranslation(0, 0.315, 0.122), C.diamond, [0.2, 0, 0, 1]);
          addGeo(THREE, acc, new THREE.TorusGeometry(0.29, 0.012, 3, 12, PI * 0.9).rotateX(PI / 2).rotateY(PI * 0.55), M4().makeTranslation(0, 0.545, -0.055), C.accent, kGl);
          const capeAcc = new Acc();
          buildCape(THREE, capeAcc, C, LV, false, [0.62, 0.5, 0, 1], [0.5, 0.8, 0, 1]);
          {
            const cg = new THREE.BufferGeometry();
            cg.setAttribute('position', new THREE.Float32BufferAttribute(capeAcc.P, 3)); cg.setAttribute('normal', new THREE.Float32BufferAttribute(capeAcc.N, 3)); cg.setIndex(capeAcc.I);
            const cc = capeAcc.C, pv = G.cape;
            // swing it back 0.7 rad round the collar (mid-stream)
            const piv = V(capeAt(0, 0)), m = M4().makeTranslation(piv.x, piv.y, piv.z).multiply(M4().makeRotationX(0.7)).multiply(M4().makeTranslation(-piv.x, -piv.y, -piv.z));
            addGeo(THREE, acc, cg, m, (x, y, z, nx, ny, nz, i) => [cc[3 * i], cc[3 * i + 1], cc[3 * i + 2]], [0.6, 0.5, 0, 1]);
            void pv;
          }
          {
            const v = 0.36, p = capeAt(0, v), n = capeNormal(0, v), piv = V(capeAt(0, 0));
            const m = M4().makeTranslation(piv.x, piv.y, piv.z).multiply(M4().makeRotationX(0.7)).multiply(M4().makeTranslation(-piv.x, -piv.y, -piv.z));
            const pp = V(v3.add(p, n, 0.006)).applyMatrix4(m), nn = V(n).applyMatrix3(new THREE.Matrix3().getNormalMatrix(m)).normalize();
            sign(THREE, acc, C, [pp.x, pp.y, pp.z], [nn.x, nn.y, nn.z], [0, 1, 0], 0.15, 0, 1);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          geo.setIndex(new THREE.Uint16BufferAttribute(acc.I, 1));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, toon); mesh.name = 'lbd-far';
          const group = new THREE.Group(); group.name = 'lbd-far'; group.add(mesh);
          const eyes = [[0.0758, 0.6525, 0.2062], [-0.0758, 0.6525, 0.2062]];   // (the near levels' lens centres)
          const stats = { tris: acc.I.length / 3, verts: acc.n, ms: Math.round(now() - T0), parts: { far: acc.I.length / 3 }, draws: 1, eyes };
          const sq = { k: 1, v: 0 };
          const api = {
            level: 'far', mesh, stats, names: [], bones: null, eyes,
            set() { return api; }, setExpression() { return api; }, setGaze() { return api; }, look() { return api; }, blink() { return api; }, steer() { return api; }, cape() { return api; },
            squash(k) { sq.k = k; mesh.scale.set(1 / sqrt(k), k, 1 / sqrt(k)); return api; }, kick(v) { sq.v += v; },
            update(dt) { const a = -220 * (sq.k - 1) - 14 * sq.v; sq.v += a * dt; sq.k += sq.v * dt; mesh.scale.set(1 / sqrt(sq.k), sq.k, 1 / sqrt(sq.k)); },
          };
          group.userData.racer = group.userData.lbd = api;
          group.userData.stats = stats;
          return group;
        }

        /* ------------------------------------------------------------------ the live layer (the roster's API) + the cape */
        function rig(THREE, o) {
          const { bones: B, stats } = o, capeLift = o.capeLift === undefined ? 0.9 : o.capeLift;
          const rest = {}; for (const k in B) rest[k] = { q: new THREE.Quaternion().copy(B[k].quaternion), p: new THREE.Vector3().copy(B[k].position) };
          const N0 = EX.neutral, NM = NAMES;
          const st = { w: {}, target: null, sq: 1, sqV: 0, steer: 0, look: [0, 0], gaze: null,
            speed: 0, fed: false, acc: 0, turn: 0, lift: 0.45, liftV: 0, sway: 0, swayV: 0, ph: 0, flash: 0 };
          NM.forEach((n) => { st.w[n] = 0; });
          const qx = new THREE.Quaternion(), e = new THREE.Euler();
          const blend = (key, i) => { let v = i === undefined ? N0[key] : N0[key][i]; for (const k of NM) v += st.w[k] * ((i === undefined ? EX[k][key] : EX[k][key][i]) - (i === undefined ? N0[key] : N0[key][i])); return v; };
          function applyFace() {
            const lift = blend('brow', 0), ang = blend('brow', 1), len = blend('len');
            for (const s of ['L', 'R']) {
              const side = s === 'L' ? 1 : -1, b = B['brow' + s];
              b.position.copy(rest['brow' + s].p); b.position.y += lift;
              b.quaternion.copy(rest['brow' + s].q).multiply(qx.setFromEuler(e.set(0, 0, -side * ang)));
              b.scale.set(len, 1, 1);
            }
            // (no eyeballs: the gaze is the race's head yaw in drive(); look() is for sheets)
            const gx = st.look[0], gy = st.look[1];
            B.head.quaternion.copy(rest.head.q).multiply(qx.setFromEuler(e.set(blend('pitch') - gy * 0.2, st.steer * 0.25 + gx * 0.3, blend('roll') - st.steer * 0.05)));
            B.body.rotation.set(0, 0, -st.steer * 0.05);
            B.root.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
          }
          // the cape: the collar bone swings it back with speed (a spring), the chain shares the lift and carries a travelling
          // flutter (faster and bigger with speed), the whole cape sways out of the turn; at rest it hangs and barely breathes
          function applyCape() {
            const s = st.lift, a = 0.04 + 0.26 * sat01(st.speed / 30), ph = st.ph;
            const shares = [0.6, 0.2, 0.05, 0];
            for (let i = 0; i < 4; i++) {
              const b = B['cape' + i], fl = a * [0.15, 0.6, 1.0, 1.3][i] * sin(ph - 1.15 * i);
              const yaw = i === 0 ? st.sway * 0.45 : 0, roll = i === 0 ? -st.sway * 0.25 : 0.06 * sin(ph * 0.7 - i) * a;
              b.quaternion.copy(rest['cape' + i].q).multiply(qx.setFromEuler(e.set(s * shares[i] + fl, yaw, roll)));
            }
          }
          const sat01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
          function stepCape(dt) {
            dt = Math.min(dt, 0.05);
            const k = sat01(st.speed / 30);
            const want = 0.45 + capeLift * Math.pow(k, 0.75) + 0.08 * st.acc * k;   // resting on the seat behind at 0 (~30 deg); the collar ~60 deg, the hem ~80 deg back at 30 m/s
            st.liftV += (60 * (want - st.lift) - 9 * st.liftV) * dt; st.lift += st.liftV * dt;
            st.lift = Math.max(0.2, Math.min(1.55, st.lift));
            st.swayV += (45 * (-st.turn * 0.6 * (0.3 + 0.7 * k) - st.sway) - 7 * st.swayV) * dt; st.sway += st.swayV * dt;
            st.ph += dt * (2.2 + 15 * k);
          }
          const api = {
            level: o.level, bones: B, mesh: o.mesh, names: NM, EXPR: EX, stats,
            set(weights) { for (const k of NM) st.w[k] = weights && weights[k] ? weights[k] : 0; st.target = null; applyFace(); return api; },
            setExpression(name, instant) { st.target = name; if (instant) { for (const k of NM) st.w[k] = k === name ? 1 : 0; applyFace(); } return api; },
            setGaze(x, y) { st.gaze = x === null || x === undefined ? null : [x, y || 0]; applyFace(); return api; },
            look(x, y) { st.look[0] = x; st.look[1] = y; applyFace(); return api; },
            blink() { return api; },
            squash(k) { st.sq = k; applyFace(); return api; },
            kick(v) { st.sqV += v; },
            steer(v) { st.steer = v; applyFace(); return api; },
            // feed the kart's speed (m/s) alone; dt advances the cape
            cape(speed, dt) { st.speed = Math.abs(speed || 0); st.fed = true; if (dt) { stepCape(dt); applyCape(); } return api; },
            // pose the cape directly (sheets): lift (rad back), phase
            capePose(lift, phase, speed) { st.lift = lift; st.liftV = 0; st.ph = phase || 0; if (speed !== undefined) st.speed = speed; applyCape(); return api; },
            update(dt, inp) {
              inp = inp || {};
              st.acc = inp.accel || 0; st.turn = inp.steer || 0;
              if (inp.speed !== undefined) { st.speed = Math.abs(inp.speed); st.fed = true; }
              // (never fed a speed: the roster's accel is (dv/dt) / 12, so integrate it back to a speed, clamped)
              else if (!st.fed) st.speed = Math.max(0, Math.min(32, st.speed + st.acc * 12 * dt));
              if (st.target !== null) { const k = 1 - exp(-dt * 12); for (const n of NM) st.w[n] += ((n === st.target ? 1 : 0) - st.w[n]) * k; }
              const a = -220 * (st.sq - 1) - 14 * st.sqV; st.sqV += a * dt; st.sq += st.sqV * dt;
              stepCape(dt);
              applyFace(); applyCape();
            },
          };
          applyFace(); applyCape();
          return api;
        }

        LordBlackDiamond.LEVELS = LEVELS; LordBlackDiamond.EXPR = EX; LordBlackDiamond.NAMES = NAMES; LordBlackDiamond.G = G; LordBlackDiamond.capeAt = capeAt;
        root.LordBlackDiamond = LordBlackDiamond;
      })(KR);

      /* Aspen GP racers: WHITEOUT ONE + WHITEOUT TWO (9 Oct 2026). Two ORIGINAL white-armoured ski
       * racers, one builder, built in code the stars' way (SDF -> marching cubes, every colour region its own mesh).
       *
       *   Whiteout(THREE, K, detail, opts) -> THREE.Group      (budgets ~13-15k / 6.5-7.5k / 2.5-3k / 0.6-0.7k triangles)
       *     K      = the roster's marching-cubes kit (KR.EndoKit)
       *     detail = 'desktop' | 'phone' | 'mid' | 'far'
       *     opts   = { toon: <the racer's gm-kart-toon>,
       *                accent: '#FF6A1A' (Whiteout One, the default) | '#18B8A8' (Whiteout Two) | any hex,
       *                hud: true    (the visor's two lit eye-dashes, the expressions; false = a blank visor),
       *                pack: true   (the avalanche pack on the back; false if the sled's seat has a high back),
       *                grip: [x, y, z]  (where the hands hold, character frame; default the roster's WHEEL grip,
       *                                  DogFinal.util.WH.H; the elbows follow by two-bone IK) }
       *   Whiteout.ACCENT = { one: '#FF6A1A', two: '#18B8A8' }; Whiteout.FACE = the faces for RACERS (F(race, drift, ...)).
       *
       * Design (original): a rounded white ski-race helmet (an egg dome and a smooth jaw guard, no brow ridge) with ONE
       * dark wraparound GOGGLE visor (a mirror lens, tinted the accent along its top edge, a nose-bridge notch, two painted
       * sky streaks) whose strap runs round the back of the helmet in the accent colour; an accent crown stripe; grey ear
       * pads with accent rings. Segmented white plates over a black undersuit: a chest plate with a chevron lower edge and
       * a snowflake emblem, an ab plate, a back plate, round shoulder caps with accent bands, forearm bracers, thigh plates,
       * knee caps, shin guards with accent bands; black gloves, dark boots, a grey belt with an accent buckle; an accent
       * avalanche pack on the back with a white snowflake (the chase camera's read: a white helmet with a coloured band,
       * coloured shoulders and a coloured pack over black). Nothing from any film helmet: no frown grille, no teardrop
       * stripes, no tube vents, no separate eye lenses.
       *
       * The face: two short lit dashes behind the visor (the glow zone, the accent washed toward white), the expressions
       * as morph targets at fixed topology: focus (slanted in, the drift), happy (arcs, the boost and the podium), hit (X X),
       * sad (drooped). The head pitches and rolls with each; the dashes follow the gaze and blink (the hud bone).
       *
       * Units metres, +Z forward, +Y up, origin = the seat contact under the pelvis (the roster's frame). Hands on the grip.
       * Draw calls: 1 (one SkinnedMesh in gm-kart-toon). 'far' = 1 plain Mesh. No eye material, no glass.
       * group.userData.racer = { set, setExpression, setGaze, look, blink, squash, kick, steer, update, names, bones, mesh,
       *   stats, eyes }   (the stars' API; eyes = the two dash centres on the visor, character frame, for Laser Eyes)
       */
      (function (root) {
        'use strict';
        const { abs, sqrt, min, max, hypot, sin, cos, PI, exp, atan2 } = Math;
        const DU = root.DogFinal.util;
        const { sat, clamp, lerp, sstep, smin, smax, ell, E6, cap, v3, mix3, mul3, grad, Acc, mcPart, addGeo, taperTube, rayHit, faceAt } = DU;
        const D2R = PI / 180;
        const now = () => (typeof performance !== 'undefined' ? performance : Date).now();

        // orientation guard (Moon Cat's): an MC part whose kept shell is open can come out inside-out
        function orientPart(acc, r) {
          const P = acc.P, N = acc.N, I = acc.I; let dot = 0;
          for (let t = r.t0; t < r.t1; t += 3) {
            const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
            dot += (uy * wz - uz * wy) * (N[a] + N[b] + N[c]) + (uz * wx - ux * wz) * (N[a + 1] + N[b + 1] + N[c + 1]) + (ux * wy - uy * wx) * (N[a + 2] + N[b + 2] + N[c + 2]);
          }
          if (dot < 0) for (let t = r.t0; t < r.t1; t += 3) { const q = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = q; }
          return r;
        }
        const mcPartO = (...a) => orientPart(a[1], mcPart(...a));

        /* ------------------------------------------------------------------ shape parameters */
        const ACCENT = { one: '#FF6A1A', two: '#18B8A8' };
        const TR = {
          helm: { c: [0, 0.738, -0.012], r: [0.262, 0.27, 0.284], cut: 0.468 },
          chin: [0, 0.585, 0.07, 0.205, 0.135, 0.2],
          // the goggle visor: centre height, half heights at the front and at the ends, how proud, the half wrap (rad), the nose notch
          visor: { y: 0.712, h0: 0.066, h1: 0.042, th: 0.013, ang: 1.4, notch: 0.026 },
          strap: { h: 0.03, th: 0.007 },
          ridge: { w: 0.03, th: 0.008 },
          ear: { c: [0.262, 0.7, -0.035], r: 0.066, t: 0.022 },
          neck: [0, 0.47, -0.03],
          torso: [0, 0.248, -0.05, 0.198, 0.25, 0.165], belly: [0, 0.165, 0.02, 0.19, 0.165, 0.168],
          S: [0.17, 0.398, -0.038], El: [0.262, 0.285, 0.128], armR: [0.066, 0.06, 0.054], glove: [0.06, 0.054, 0.066],
          Hp: [0.1, 0.085, 0.02], K: [0.125, 0.17, 0.225], F: [0.125, 0.065, 0.35], legR: [0.088, 0.077, 0.07], foot: [0.07, 0.058, 0.092],
          pack: { c: [0, 0.315, -0.235], h: [0.118, 0.112, 0.05], r: 0.034 },
          hud: { x: 0.082 },
        };

        // the anatomy with the hands on the grip: the wrist a glove's length back from the palm, the elbow by two-bone IK
        // with the sheet's elbow as the pole (the default grip gives the sheet's elbow exactly)
        function anatomy(opts) {
          const G = JSON.parse(JSON.stringify(TR)), WH = DU.WH;
          const H0 = WH.H, H = Array.isArray(opts.grip) && opts.grip.length === 3 ? opts.grip.slice() : H0.slice();
          const palm = (h) => v3.add(h, WH.nrm, -0.012);
          const wrist = (pc, el) => v3.add(pc, v3.norm(v3.sub(el, pc)), 0.06);
          const pc0 = palm(H0), Wr0 = wrist(pc0, TR.El), L1 = hypot(...v3.sub(TR.El, TR.S)), L2 = hypot(...v3.sub(Wr0, TR.El));
          G.pawC = palm(H);
          let El = TR.El, Wr = wrist(G.pawC, El);
          for (let it = 0; it < 3; it++) {
            const d = v3.sub(Wr, TR.S), D = hypot(...d), u = v3.norm(d), k = D > L1 + L2 ? D / (L1 + L2) : 1;
            const l1 = L1 * k, l2 = L2 * k, a = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = sqrt(max(0, l1 * l1 - a * a));
            const pol = v3.sub(v3.sub(TR.El, TR.S), v3.scale(u, v3.dot(v3.sub(TR.El, TR.S), u)));
            El = v3.add(v3.add(TR.S, u, a), v3.norm(pol), h);
            Wr = wrist(G.pawC, El);
          }
          G.El = El; G.Wr = Wr; G.H = H;
          G.Wc = v3.lerp(El, Wr, 0.62); G.Gc = v3.lerp(El, Wr, 0.5);
          G.Ak = v3.lerp(G.K, G.F, 0.6); G.Bc = v3.lerp(G.K, G.F, 0.46);
          return G;
        }

        /* ------------------------------------------------------------------ the SDFs */
        const tParam = (p, A, B) => { const b = v3.sub(B, A); return sat(v3.dot(v3.sub(p, A), b) / v3.dot(b, b)); };
        function suitSDF(G) {
          const H = G.helm, V = G.visor;
          const helmE = [H.c[0], H.c[1], H.c[2], H.r[0], H.r[1], H.r[2]];
          const helmF = (x, y, z) => smax(smin(E6(x, y, z, helmE), E6(x, y, z, G.chin), 0.05), H.cut - y, 0.035);
          const theta = (x, z) => atan2(x, z - H.c[2]);
          // the goggle band in (azimuth, height): narrower toward the ends, the nose-bridge notch at the bottom middle
          const visEdges = (th) => { const a = min(1.2, abs(th) / V.ang), hh = lerp(V.h0, V.h1, a * a); return [V.y - hh + V.notch * exp(-(th / 0.2) * (th / 0.2)), V.y + hh]; };
          const visReg = (x, y, z) => { const th = theta(x, z), e = visEdges(th); return max(max(e[0] - y, y - e[1]), (abs(th) - V.ang) * 0.27); };
          const visorF = (x, y, z) => smax(helmF(x, y, z) - V.th, visReg(x, y, z), 0.006);
          const visSurf = (x, y, z) => helmF(x, y, z) - V.th;
          const strapReg = (x, y, z) => max(abs(y - V.y) - G.strap.h, (V.ang - 0.1 - abs(theta(x, z))) * 0.27);
          const strapF = (x, y, z) => smax(helmF(x, y, z) - G.strap.th, strapReg(x, y, z), 0.004);
          const ridgeReg = (x, y, z) => max(abs(x) - G.ridge.w, (V.y + V.h0 + 0.024) - y);
          const ridgeF = (x, y, z) => smax(helmF(x, y, z) - G.ridge.th, ridgeReg(x, y, z), 0.004);
          const E = G.ear;
          const earF = (ax, y, z) => smax(hypot(y - E.c[1], z - E.c[2]) - E.r, abs(ax - E.c[0]) - E.t, 0.014);
          // the body (the black undersuit)
          const torsoF = (x, y, z) => smin(E6(x, y, z, G.torso), E6(x, y, z, G.belly), 0.06);
          const neckF = (x, y, z) => cap(x, y, z, [0, 0.4, -0.035], [0, 0.56, -0.03], 0.078, 0.07);
          const armF = (ax, y, z) => smin(cap(ax, y, z, G.S, G.El, G.armR[0], G.armR[1]), cap(ax, y, z, G.El, G.Wc, G.armR[1], G.armR[2]), 0.035);
          const legF = (ax, y, z) => smin(cap(ax, y, z, G.Hp, G.K, G.legR[0], G.legR[1]), cap(ax, y, z, G.K, G.Ak, G.legR[1], G.legR[2]), 0.035);
          const suitF = (x, y, z) => { const ax = abs(x); return smin(smin(smin(torsoF(x, y, z), neckF(x, y, z), 0.04), armF(ax, y, z), 0.05), legF(ax, y, z), 0.045); };
          const gloveF = (ax, y, z) => smin(cap(ax, y, z, G.Gc, G.Wr, 0.067, 0.056), ell(ax - G.pawC[0], y - G.pawC[1], z - G.pawC[2], G.glove[0], G.glove[1], G.glove[2]), 0.03);
          const bootF = (ax, y, z) => smin(cap(ax, y, z, G.Bc, G.F, 0.09, 0.084), ell(ax - G.F[0], y - G.F[1] + 0.004, z - G.F[2] - 0.03, G.foot[0], G.foot[1], G.foot[2]), 0.04);
          // the plates (each = the body grown a little, cut to its region): white, and the accent bands
          const chestLo = (ax) => 0.305 + 0.06 * min(1, ax / 0.16);          // the chevron lower edge, its point at the sternum
          const chestF = (x, y, z) => { const ax = abs(x); return smax(torsoF(x, y, z) - 0.018, max(max(chestLo(ax) - y, y - 0.478), max(ax - 0.17, -0.03 - z)), 0.02); };
          const absF = (x, y, z) => { const ax = abs(x); return smax(torsoF(x, y, z) - 0.014, max(max(0.178 - y, y - (chestLo(ax) - 0.032)), max(ax - 0.122, 0.0 - z)), 0.016); };
          const backF = (x, y, z) => { const ax = abs(x); return smax(torsoF(x, y, z) - 0.018, max(max(0.2 - y, y - 0.468), max(ax - 0.158, z + 0.135)), 0.02); };
          const PD = [G.S[0] + 0.03, G.S[1] + 0.012, G.S[2], 0.1, 0.09, 0.108];
          const pauldBase = (ax, y, z) => smax(E6(ax, y, z, PD), (G.S[1] - 0.062) - y, 0.012);
          const pauldBandR = (y) => abs(y - (G.S[1] - 0.045)) - 0.017;
          const BR = [v3.lerp(G.El, G.Wr, 0.1), v3.lerp(G.El, G.Wr, 0.53)];
          const bracerF = (ax, y, z) => cap(ax, y, z, BR[0], BR[1], G.armR[1] + 0.017, G.armR[1] * 0.4 + G.armR[2] * 0.6 + 0.016);
          const TH = [v3.lerp(G.Hp, G.K, 0.3), v3.lerp(G.Hp, G.K, 0.84)];
          const thighF = (ax, y, z) => cap(ax, y, z, TH[0], TH[1], lerp(G.legR[0], G.legR[1], 0.3) + 0.016, lerp(G.legR[0], G.legR[1], 0.84) + 0.016);
          const kneeF = (ax, y, z) => ell(ax - G.K[0], y - G.K[1] - 0.014, z - G.K[2] - 0.026, 0.074, 0.068, 0.064);
          const SH = [v3.lerp(G.K, G.F, 0.14), v3.lerp(G.K, G.F, 0.44)];
          const shinBase = (ax, y, z) => cap(ax, y, z, SH[0], SH[1], lerp(G.legR[1], G.legR[2], 0.2) + 0.017, lerp(G.legR[1], G.legR[2], 0.7) + 0.016);
          const shinBandR = (ax, y, z) => abs(tParam([ax, y, z], SH[0], SH[1]) - 0.36) - 0.13;
          // the white plates, and the bands (cut crisp out of the same shells, a hair prouder)
          const plateW = (x, y, z) => {
            const ax = abs(x);
            let d = min(min(chestF(x, y, z), absF(x, y, z)), backF(x, y, z));
            d = min(d, max(pauldBase(ax, y, z), -pauldBandR(y)));
            d = min(d, min(bracerF(ax, y, z), min(thighF(ax, y, z), kneeF(ax, y, z))));
            return min(d, max(shinBase(ax, y, z), -shinBandR(ax, y, z)));
          };
          const bandF = (x, y, z) => { const ax = abs(x); return min(max(pauldBase(ax, y, z) - 0.003, pauldBandR(y)), max(shinBase(ax, y, z) - 0.003, shinBandR(ax, y, z))); };
          const platesAll = (x, y, z) => min(plateW(x, y, z), bandF(x, y, z));
          const beltF = (x, y, z) => smax(torsoF(x, y, z) - 0.012, abs(y - 0.122) - 0.024, 0.008);
          const P = G.pack;
          const packF = (x, y, z) => { const qx = abs(x - P.c[0]) - P.h[0] + P.r, qy = abs(y - P.c[1]) - P.h[1] + P.r, qz = abs(z - P.c[2]) - P.h[2] + P.r; return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, max(qy, qz)), 0) - P.r; };
          return { helmF, theta, visEdges, visReg, visorF, visSurf, strapF, strapReg, ridgeF, ridgeReg, earF, torsoF, suitF, armF, legF, gloveF, bootF, chestF, absF, backF, plateW, bandF, platesAll, beltF, packF, chestLo };
        }

        /* ------------------------------------------------------------------ palette (linear) */
        function palette(THREE, accent) {
          const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
          const a = c(accent);
          return {
            white: c('#EEF1F5'), whiteDk: c('#BFC8D6'), whiteHi: c('#FFFFFF'),
            suit: c('#23262D'), suitDk: c('#15171C'), suitHi: c('#3A3F49'),
            grey: c('#7C8592'), greyDk: c('#4A515C'), steel: c('#A9B1BD'),
            glove: c('#1E2127'), gloveHi: c('#383D47'), boot: c('#2C3038'), sole: c('#121418'),
            visor: c('#0B1017'), visorUp: c('#1B2738'), streak: c('#9FB4CC'),
            accent: a, accentDk: mul3(a, 0.62), accentHi: mix3(a, [1, 1, 1], 0.25),
            hud: mul3(mix3(a, [1, 1, 1], 0.3), 0.36), vent: c('#3A4048'),
          };
        }

        /* ------------------------------------------------------------------ expressions (the visor dashes + the head)
         * A dash: centre (x, y + dy), half width w, arc (+ = a happy arch), tilt (+ = the inner end lower), xB (0..1 =
         * the second stroke, crossing the first: the hit's X), r = the dash's radius. pitch + = nod down, roll + = tilt left. */
        const DX = (o) => Object.assign({ w: 0.033, arc: 0, tilt: 0, xB: 0, dy: 0, r: 0.0088 }, o);
        const EXPR = {
          neutral: { hud: DX({}), pitch: 0, roll: 0, lean: 0 },
          focus:   { hud: DX({ w: 0.031, arc: -0.004, tilt: 0.012, r: 0.0082 }), pitch: 0.1, roll: -3 * D2R, lean: 0.06 },
          happy:   { hud: DX({ w: 0.03, arc: 0.022, dy: -0.004, r: 0.0084 }), pitch: -0.14, roll: 8 * D2R, lean: -0.04 },
          hit:     { hud: DX({ w: 0.024, tilt: 0.026, xB: 1, r: 0.0072 }), pitch: -0.12, roll: -10 * D2R, lean: -0.05 },
          sad:     { hud: DX({ w: 0.03, arc: -0.013, tilt: -0.011, dy: -0.006, r: 0.0078 }), pitch: 0.22, roll: 6 * D2R, lean: 0.08 },
        };
        const NAMES = ['focus', 'happy', 'hit', 'sad'];
        // for KR.RACERS: F(race, drift, boost, hit, sad, celebrate)
        const FACE = { race: {}, drift: { focus: 1 }, boost: { happy: 0.55, focus: 0.45 }, hit: { hit: 1 }, sad: { sad: 1 }, celebrate: { happy: 1 } };

        /* ------------------------------------------------------------------ LOD table */
        const LEVELS = {
          desktop: { helm: 0.027, vis: 0.015, trim: 0.016, ear: 0.016, body: 0.045, plate: 0.027, band: 0.018, acc: 0.024, tube: 6, hud: 11, ring: [4, 22], box: 3, extras: true, flake: 2, morph: true, paint: false },
          phone:   { helm: 0.038, vis: 0.021, trim: 0.024, ear: 0.022, body: 0.064, plate: 0.039, band: 0.025, acc: 0.034, tube: 4, hud: 8, ring: [3, 14], box: 2, extras: true, flake: 1, morph: true, paint: false },
          mid:     { helm: 0.062, vis: 0.03, body: 0.064, acc: 0.06, tube: 4, hud: 5, ring: [3, 10], box: 1, extras: false, flake: 0, morph: true, paint: true },
          far:     { far: true },
        };

        /* ------------------------------------------------------------------ bones */
        const BONES = ['root', 'body', 'head', 'hud'];
        const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
        const PARENT = { body: 'root', head: 'body', hud: 'head' };

        // a rounded box (the pack, the buckle): w h d, corner radius r
        function rboxGeo(THREE, w, h, d, r, seg) {
          const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i), hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
            const cx = max(-hx, min(hx, x)), cy = max(-hy, min(hy, y)), cz = max(-hz, min(hz, z)), nn = v3.norm([x - cx, y - cy, z - cz]);
            p.setXYZ(i, cx + nn[0] * r, cy + nn[1] * r, cz + nn[2] * r);
          }
          g.computeVertexNormals(); return g;
        }
        // a snowflake: three bars through the centre (0, 60, 120 deg) and, with branches, a V on each of the six arms;
        // laid flat on a surface at c (normal n, up u), s = the arm's length
        function snowflake(THREE, acc, c, n, u, s, col, k, bone, branches) {
          const N = new THREE.Vector3(...v3.norm(n)), U0 = new THREE.Vector3(...u), T = new THREE.Vector3().crossVectors(U0, N).normalize(), Up = new THREE.Vector3().crossVectors(N, T);
          const basis = new THREE.Matrix4().makeBasis(T, Up, N).setPosition(c[0], c[1], c[2]);
          const bar = (len, wd, ox, oy, ang) => {
            const g = new THREE.BoxGeometry(wd, len, 0.005);
            const m = new THREE.Matrix4().makeTranslation(ox, oy, 0.0025).multiply(new THREE.Matrix4().makeRotationZ(ang));
            addGeo(THREE, acc, g, new THREE.Matrix4().copy(basis).multiply(m), col, k, bone);
          };
          for (let i = 0; i < 3; i++) bar(2 * s, s * 0.2, 0, 0, i * PI / 3);
          if (branches) for (let i = 0; i < 6; i++) {
            const a = i * PI / 3 + PI / 2, ax = cos(a), ay = sin(a), at = 0.58 * s;
            for (const sd of [-1, 1]) {
              const b = a + sd * 0.75, L = 0.36 * s;
              bar(L, s * 0.15, ax * at + cos(b) * L / 2, ay * at + sin(b) * L / 2, b - PI / 2);
            }
          }
        }

        /* ------------------------------------------------------------------ build the racer */
        function build(THREE, KIT, detail, opts) {
          opts = opts || {};
          const T0 = now();
          const LV = LEVELS[detail] || LEVELS.desktop, G = anatomy(opts), F = suitSDF(G);
          const C = palette(THREE, opts.accent || ACCENT.one), hudOn = opts.hud !== false, packOn = opts.pack !== false;
          const toon = opts.toon || root.mat.toon(THREE, {});
          if (LV.far) return buildFar(THREE, G, F, C, toon, T0, { hud: hudOn, pack: packOn });
          const stats = { parts: {} };
          const acc = new Acc();
          const M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
          const qFrom = (dir) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(v3.norm(dir)));
          const tpart = (name, t0) => { stats.parts[name] = (stats.parts[name] || 0) + (acc.I.length - t0) / 3; };
          const ALL = (x, y, z) => min(min(F.helmF(x, y, z), F.suitF(x, y, z)), F.platesAll(x, y, z));
          const aoStep = detail === 'mid' ? 0.03 : 0.018;
          const aoAt = (x, y, z, nx, ny, nz) => {
            let occ = 0;
            for (let s = 1; s <= 4; s++) { const hs = s * aoStep; occ += max(0, 1 - ALL(x + nx * hs, y + ny * hs, z + nz * hs) / hs) / s; }
            return sat(1 - 0.55 * max(0, occ - 0.12));
          };
          const shade = (c, ao, lo) => { const k = lo + (1 - lo) * ao; return [c[0] * k, c[1] * k * (0.98 + 0.02 * k), c[2] * k * (0.95 + 0.05 * k)]; };
          // white plastic: cool in the shadow side, never pure white (the snow is)
          const whiteCol = (ny, nz) => mix3(C.white, C.whiteDk, sstep(0.25, -0.8, ny) * 0.55 + sstep(0.1, -0.7, nz) * 0.12);
          const kWhite = [0.3, 0.25, 0, 1], kSuit = [0.72, 0.15, 0, 1], kVis = [0.06, 0, 0, 1], kAcc = [0.36, 0.3, 0, 1], kGrey = [0.5, 0.1, 0, 1], kGlow = [0.3, 0, 2, 1];
          const col = (fn) => (x, y, z, nx, ny, nz, v) => { const ao = aoAt(x, y, z, nx, ny, nz); acc.K[4 * v + 3] = ao; return fn(x, y, z, nx, ny, nz, ao); };
          let t = now(), t0;
          // a point on the helmet (lifted along its normal) seen from its axis at height y and azimuth th (0 = front, + = +X),
          // or from its centre at elevation psi (0 = front, PI / 2 = the crown, PI = the back)
          const HC = G.helm.c, gH = [0, 0, 0];
          const onHelm = (o, d, lift) => { const p = rayHit(F.helmF, o, d, 0, 0.5, 48) || v3.add(o, d, 0.27); grad(F.helmF, p[0], p[1], p[2], 0.002, gH); return { p: v3.add(p, gH, lift), n: gH.slice() }; };
          const helmAz = (th, y, lift) => onHelm([0, y, HC[2]], [sin(th), 0, cos(th)], lift);
          const helmEl = (psi, lift) => onHelm(HC, [0, sin(psi), cos(psi)], lift);

          /* ---- the helmet (white; in the paint level the strap, the stripe and the ear pads painted on it) */
          t0 = acc.I.length;
          const helmKeep = LV.paint ? null : (x, y, z) => F.visorF(x, y, z) > -0.0015 && F.strapF(x, y, z) > -0.0015 && F.earF(abs(x), y, z) > -0.0015;
          mcPartO(KIT, acc, F.helmF, [-0.3, 0.42, -0.33, 0.3, 1.04, 0.32], LV.helm, true, col((x, y, z, nx, ny, nz, ao) => {
            let c = whiteCol(ny, nz);
            if (LV.paint) {
              const s = sstep(0.004, -0.004, F.strapReg(x, y, z));
              c = mix3(c, C.accent, s);
              c = mix3(c, C.grey, sstep(0.006, -0.006, F.earF(abs(x), y, z) - 0.01));
            }
            return shade(c, ao, 0.66);
          }), helmKeep, kWhite, BI.head);
          tpart('helmet', t0); t0 = acc.I.length;

          /* ---- the goggle visor: a dark mirror, the accent along its top, two sky streaks (painted: they read in any light) */
          const visCol = col((x, y, z, nx, ny, nz, ao) => {
            const th = F.theta(x, z), e = F.visEdges(th), v = clamp(((y - e[0]) / max(0.01, e[1] - e[0])) * 2 - 1, -1, 1);
            let c = mix3(C.visor, C.visorUp, sstep(-0.9, 0.9, v));
            c = mix3(c, mix3(C.accentDk, C.accent, 0.8), 0.6 * sstep(0.5, 0.97, v));
            const sk = (th0, w) => { const q = ((th - th0) * 0.75 + (v - 0.15) * 0.35) / w; return exp(-q * q); };
            c = mix3(c, C.streak, (0.42 * sk(-0.56, 0.035) + 0.26 * sk(-0.42, 0.018)) * sstep(-0.5, 0.1, v));
            return shade(c, ao, 0.85);
          });
          mcPartO(KIT, acc, F.visorF, [-0.3, 0.6, -0.2, 0.3, 0.82, 0.32], LV.vis, true, visCol, (x, y, z) => F.helmF(x, y, z) > -0.003, kVis, BI.head);
          tpart('visor', t0); t0 = acc.I.length;
          if (!LV.paint) {
            /* ---- the goggle strap round the back + the crown stripe (accent), the ear pads (grey) */
            const accCol = col((x, y, z, nx, ny, nz, ao) => shade(mix3(C.accent, C.accentDk, sstep(0.2, -0.8, ny) * 0.45), ao, 0.7));
            mcPartO(KIT, acc, F.strapF, [-0.3, 0.66, -0.32, 0.3, 0.77, 0.12], LV.trim, true, accCol, (x, y, z) => F.helmF(x, y, z) > -0.002 && F.earF(abs(x), y, z) > -0.002, kAcc, BI.head);
            tpart('strap', t0); t0 = acc.I.length;
            mcPartO(KIT, acc, (x, y, z) => F.earF(abs(x), y, z), [-0.3, 0.62, -0.12, 0.3, 0.78, 0.04], LV.ear, true, col((x, y, z, nx, ny, nz, ao) => {
              const r = hypot(y - G.ear.c[1], z - G.ear.c[2]) / G.ear.r;
              return shade(mix3(mix3(C.grey, C.greyDk, sstep(0.2, -0.8, ny) * 0.4), C.steel, sstep(0.45, 0.3, r) * 0.5), ao, 0.7);
            }), (x, y, z) => F.helmF(x, y, z) > -0.002, kGrey, BI.head);
            for (const s of [1, -1]) addGeo(THREE, acc, new THREE.TorusGeometry(G.ear.r - 0.004, 0.0075, LV.ring[0], LV.ring[1]).rotateY(PI / 2), M4().makeTranslation(s * (G.ear.c[0] + G.ear.t - 0.002), G.ear.c[1], G.ear.c[2]), C.accent, kAcc, BI.head);
            tpart('ears', t0); t0 = acc.I.length;
            // the jaw guard's breather: a short grey pill, level (never a frown)
            const vp = [-0.03, 0, 0.03].map((x) => faceAt(F.helmF, x, 0.565, 0.002));
            const vr = [0.0075, 0.0085, 0.0075];
            addGeo(THREE, acc, taperTube(THREE, vp, vr, vr, LV.tube, [0, 1, 0], true), M4(), C.vent, kGrey, BI.head);
            tpart('vent', t0); t0 = acc.I.length;
            // the jaw guard's seams: from under each ear pad, down and forward to the chin (a helmet, not a face)
            for (const s of [1, -1]) {
              const q = [[1.5, 0.628], [1.3, 0.598], [1.05, 0.56], [0.8, 0.522], [0.6, 0.494]].map(([th, y]) => helmAz(s * th, y, 0.0012).p);
              const rr = q.map((_, i) => 0.0042 * (i === q.length - 1 ? 0.4 : 1));
              addGeo(THREE, acc, taperTube(THREE, q, rr, rr, max(4, LV.tube - 2), [0, 1, 0], true), M4(), C.greyDk, kGrey, BI.head);
            }
            tpart('seams', t0);
          }
          // the crown stripe: a flat band laid over the helmet, front (just over the visor) to back (just over the strap);
          // a tube of flat section, crisp at every level (marching cubes left its edges wavy, painting smears it)
          {
            t0 = acc.I.length;
            const n = LV.paint ? 10 : LV.extras && LV.tube > 4 ? 22 : 14, pts = [], nn = [];
            for (let i = 0; i <= n; i++) { const h = helmEl(lerp(0.24, PI - 0.12, i / n), 0.0018); pts.push(h.p); nn.push(h.n); }
            const rx = pts.map((_, i) => G.ridge.w * (1 - 0.25 * sstep(0.85, 1, i / n) - 0.15 * sstep(0.12, 0, i / n))), ry = pts.map(() => 0.0048);
            addGeo(THREE, acc, taperTube(THREE, pts, rx, ry, LV.paint ? 4 : 8, (i) => nn[i], true), M4(), (x, y, z, nx, ny, nz) => mix3(C.accent, C.accentHi, sstep(0.5, 1, ny) * 0.4), kAcc, BI.head);
            tpart('stripe', t0);
          }
          stats.headMs = Math.round(now() - t); t = now();

          /* ---- the body */
          t0 = acc.I.length;
          if (LV.paint) {
            // one surface: the undersuit, gloves and boots grown to the plates, the plates painted on it
            const bodyU = (x, y, z) => { const ax = abs(x); return min(min(F.suitF(x, y, z) - 0.008, min(F.gloveF(ax, y, z), F.bootF(ax, y, z))), F.platesAll(x, y, z)); };
            mcPartO(KIT, acc, bodyU, [-0.42, -0.04, -0.3, 0.42, 0.62, 0.62], LV.body, true, col((x, y, z, nx, ny, nz, ao) => {
              const ax = abs(x);
              let c = mix3(C.suit, C.suitDk, sstep(0.1, -0.8, ny) * 0.4);
              const gb = min(F.gloveF(ax, y, z), F.bootF(ax, y, z));
              c = mix3(c, C.glove, sstep(0.01, -0.01, gb));
              c = mix3(c, whiteCol(ny, nz), sstep(0.012, -0.004, F.plateW(x, y, z)));
              if (y > 0.28) c = mix3(c, C.accent, sstep(0.012, -0.004, F.bandF(x, y, z)));
              return shade(c, ao, 0.62);
            }), (x, y, z) => F.helmF(x, y, z) > -0.01, kSuit, BI.body);
            tpart('body', t0); t0 = acc.I.length;
          } else {
            // the undersuit (black): what the plates, gloves and boots cover is dropped
            mcPartO(KIT, acc, F.suitF, [-0.42, -0.04, -0.3, 0.42, 0.6, 0.45], LV.body, true, col((x, y, z, nx, ny, nz, ao) =>
              shade(mix3(mix3(C.suit, C.suitDk, sstep(0.1, -0.8, ny) * 0.45), C.suitHi, sstep(0.5, 0.95, ny) * 0.4), ao, 0.6)),
            (x, y, z) => { const ax = abs(x); return F.helmF(x, y, z) > -0.01 && F.platesAll(x, y, z) > -0.004 && F.gloveF(ax, y, z) > -0.006 && F.bootF(ax, y, z) > -0.006 && F.beltF(x, y, z) > -0.004; }, kSuit, BI.body);
            tpart('suit', t0); t0 = acc.I.length;
            // the white plates
            mcPartO(KIT, acc, F.plateW, [-0.42, -0.02, -0.3, 0.42, 0.52, 0.5], LV.plate, true, col((x, y, z, nx, ny, nz, ao) => shade(whiteCol(ny, nz), ao, 0.6)),
              (x, y, z) => F.suitF(x, y, z) > -0.005, kWhite, BI.body);
            tpart('plates', t0); t0 = acc.I.length;
            // the accent bands (shoulder caps, shins)
            mcPartO(KIT, acc, F.bandF, [-0.4, 0.08, -0.2, 0.4, 0.4, 0.4], LV.band, true, col((x, y, z, nx, ny, nz, ao) => shade(mix3(C.accent, C.accentDk, sstep(0.2, -0.8, ny) * 0.45), ao, 0.65)),
              (x, y, z) => F.suitF(x, y, z) > -0.005, kAcc, BI.body);
            tpart('bands', t0); t0 = acc.I.length;
            // gloves, boots, belt
            mcPartO(KIT, acc, (x, y, z) => F.gloveF(abs(x), y, z), [-0.36, 0.24, 0.0, 0.36, 0.6, 0.6], LV.acc * 1.25, true, col((x, y, z, nx, ny, nz, ao) => shade(mix3(C.glove, C.gloveHi, sstep(0.3, 0.95, ny) * 0.5), ao, 0.6)),
              (x, y, z) => F.suitF(x, y, z) > -0.006 && F.plateW(x, y, z) > -0.004, [0.6, 0.15, 0, 1], BI.body);
            mcPartO(KIT, acc, (x, y, z) => F.bootF(abs(x), y, z), [-0.3, -0.04, 0.08, 0.3, 0.26, 0.56], LV.acc * 1.7, true, col((x, y, z, nx, ny, nz, ao) => {
              const sole = sstep(0.028, 0.018, y);
              return shade(mix3(mix3(C.boot, C.suitHi, sstep(0.3, 0.95, ny) * 0.35), C.sole, sole), ao, 0.6);
            }), (x, y, z) => F.suitF(x, y, z) > -0.006 && F.plateW(x, y, z) > -0.004, kGrey, BI.body);
            mcPartO(KIT, acc, F.beltF, [-0.32, 0.07, -0.3, 0.32, 0.18, 0.3], LV.acc, true, col((x, y, z, nx, ny, nz, ao) => shade(C.greyDk, ao, 0.6)),
              (x, y, z) => F.suitF(x, y, z) > -0.004, kGrey, BI.body);
            tpart('gloves+boots+belt', t0); t0 = acc.I.length;
          }
          stats.bodyMs = Math.round(now() - t); t = now();

          /* ---- the pack, the buckle, the snowflakes */
          const g0 = [0, 0, 0];
          if (packOn) {
            const P = G.pack;
            addGeo(THREE, acc, rboxGeo(THREE, 2 * P.h[0], 2 * P.h[1], 2 * P.h[2], P.r, LV.box), M4().makeTranslation(...P.c), (x, y, z, nx, ny, nz) => mix3(C.accent, C.accentDk, sstep(0.3, -0.9, ny) * 0.5 + sstep(-0.2, 0.9, nz) * 0.35), kAcc, BI.body);
            // its lid seam and two grey straps over the shoulders' back
            if (LV.extras) {
              addGeo(THREE, acc, new THREE.BoxGeometry(2 * P.h[0] + 0.004, 0.012, 2 * P.h[2] + 0.004), M4().makeTranslation(P.c[0], P.c[1] + P.h[1] * 0.45, P.c[2]), C.accentDk, kAcc, BI.body);
              for (const s of [1, -1]) addGeo(THREE, acc, new THREE.BoxGeometry(0.03, 0.08, 0.02), M4().makeTranslation(s * 0.07, P.c[1] + P.h[1] + 0.03, P.c[2] + 0.04).multiply(M4().makeRotationX(-0.5)), C.greyDk, kGrey, BI.body);
            }
            if (LV.flake) snowflake(THREE, acc, [P.c[0], P.c[1] - 0.012, P.c[2] - P.h[2] - 0.0005], [0, 0, -1], [0, 1, 0], 0.062, C.white, kWhite, BI.body, LV.flake > 1);
            tpart('pack', t0); t0 = acc.I.length;
          }
          if (LV.flake) {
            // the chest emblem
            const cp = rayHit(F.chestF, [0, 0.405, 0.6], [0, 0, -1], 0, 0.8) || [0, 0.405, 0.12];
            grad(F.chestF, cp[0], cp[1], cp[2], 0.003, g0);
            snowflake(THREE, acc, v3.add(cp, g0, -0.001), g0, [0, 1, 0], 0.048, C.accent, kAcc, BI.body, LV.flake > 1);
            // the buckle
            const bp = rayHit(F.beltF, [0, 0.122, 0.6], [0, 0, -1], 0, 0.8) || [0, 0.122, 0.2];
            grad(F.beltF, bp[0], bp[1], bp[2], 0.003, g0);
            addGeo(THREE, acc, rboxGeo(THREE, 0.07, 0.044, 0.016, 0.006, 1), M4().compose(V(v3.add(bp, g0, 0.004)), qFrom(g0), V([1, 1, 1])), C.accent, kAcc, BI.body);
            tpart('emblems', t0); t0 = acc.I.length;
          }

          /* ---- the face: the two dashes behind the visor (fixed topology; rebuilt per expression for the morphs) */
          const nH = LV.hud, HX = G.hud.x;
          const dashPts = (E, s, j) => {
            const h = E.hud, pts = [], rr = [];
            for (let i = 0; i < nH; i++) {
              const u = -1 + 2 * i / (nH - 1), tl = (j ? -1 : 1) * h.tilt * u * s;
              const x = s * HX + u * h.w, y = G.visor.y + h.dy + h.arc * (1 - u * u) - h.arc * 0.4 + tl;
              pts.push(faceAt(F.visSurf, x, y, 0.0032));
              rr.push((j ? h.xB * h.r + 2e-4 : h.r) * (0.6 + 0.4 * sin(PI * (0.08 + 0.84 * i / (nH - 1)))));
            }
            return [pts, rr];
          };
          function buildFace(A, E) {
            if (!hudOn) return;
            for (const s of [1, -1]) for (const j of [0, 1]) {
              const [pts, rr] = dashPts(E, s, j);
              addGeo(THREE, A, taperTube(THREE, pts, rr, rr, max(4, LV.tube - 1), [0, 0, 1], true), M4(), C.hud, kGlow, BI.hud);
            }
          }
          const E0 = EXPR.neutral, fc0 = acc.n;
          buildFace(acc, E0);
          const fc1 = acc.n;
          tpart('face', t0);
          const eyes = [1, -1].map((s) => faceAt(F.visSurf, s * HX, G.visor.y, 0.004).map((q) => +q.toFixed(3)));
          stats.accMs = Math.round(now() - t); t = now();

          /* ---- geometry + skin */
          const nv = acc.n;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
          for (let v = 0; v < nv; v++) { SI[4 * v] = acc.B[3 * v]; SI[4 * v + 1] = acc.B[3 * v + 1]; const f = acc.B[3 * v + 2]; SW[4 * v] = 1 - f; SW[4 * v + 1] = f; }
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
          geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1));

          /* ---- morph targets: the dashes rebuilt with each expression */
          const names = [];
          if (hudOn && LV.morph && !(typeof window !== 'undefined' && window.KartDiag && window.KartDiag.nomorph)) {
            geo.morphAttributes.position = []; geo.morphAttributes.normal = [];
            for (const name of NAMES) {
              const A = new Acc(); buildFace(A, EXPR[name]);
              if (A.n !== fc1 - fc0) throw new Error('whiteout: face topology changed for ' + name + ': ' + A.n + ' vs ' + (fc1 - fc0));
              const dP = new Float32Array(nv * 3), dN = new Float32Array(nv * 3);
              for (let i = 0; i < A.n; i++) {
                const v = fc0 + i;
                for (let q = 0; q < 3; q++) { dP[3 * v + q] = A.P[3 * i + q] - acc.P[3 * v + q]; dN[3 * v + q] = A.N[3 * i + q] - acc.N[3 * v + q]; }
              }
              geo.morphAttributes.position.push(new THREE.Float32BufferAttribute(dP, 3));
              geo.morphAttributes.normal.push(new THREE.Float32BufferAttribute(dN, 3));
              names.push(name);
            }
            geo.morphTargetsRelative = true;
          }
          stats.morphMs = Math.round(now() - t);
          geo.computeBoundingSphere();

          /* ---- skeleton */
          const REST = { root: [0, 0, 0], body: [0, 0, 0], head: G.neck, hud: [0, G.visor.y, G.helm.c[2]] };
          const bones = {}, list = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; return b; });
          BONES.forEach((n) => { const p = PARENT[n]; if (!p) return; bones[n].position.copy(V(v3.sub(REST[n], REST[p]))); bones[p].add(bones[n]); });
          const mesh = new THREE.SkinnedMesh(geo, toon); mesh.name = 'whiteout-skin';
          const group = new THREE.Group(); group.name = 'whiteout-' + detail;
          group.add(bones.root); group.add(mesh);
          group.updateMatrixWorld(true);
          mesh.bind(new THREE.Skeleton(list));
          mesh.frustumCulled = false;
          if (names.length) { mesh.morphTargetDictionary = {}; names.forEach((k, i) => { mesh.morphTargetDictionary[k] = i; }); mesh.morphTargetInfluences = names.map(() => 0); }

          stats.tris = acc.I.length / 3; stats.verts = nv; stats.ms = Math.round(now() - T0);
          stats.grip = G.H.map((q) => +q.toFixed(3)); stats.elbow = G.El.map((q) => +q.toFixed(3));
          const api = rig(THREE, { bones, mesh, stats, names, level: detail, eyes });
          group.userData.racer = api;
          group.userData.stats = stats;
          return group;
        }

        /* ------------------------------------------------------------------ far LOD: snapped low-poly parts in one mesh */
        function buildFar(THREE, G, F, C, toon, T0, o) {
          const acc = new Acc(), M4 = () => new THREE.Matrix4(), V = (a) => new THREE.Vector3(a[0], a[1], a[2]), g = [0, 0, 0];
          // a sphere (or a band of one: phi/theta ranges) snapped onto f along rays from c
          const snap = (f, c, ws, hs, rmax, col, k, ph) => {
            const s = ph ? new THREE.SphereGeometry(1, ws, hs, ph[0], ph[1], ph[2], ph[3]) : new THREE.SphereGeometry(1, ws, hs), p = s.attributes.position, n = s.attributes.normal;
            for (let i = 0; i < p.count; i++) {
              const d = v3.norm([p.getX(i), p.getY(i), p.getZ(i)]);
              let lo = 0, hi = rmax;
              for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (f(c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m) < 0) lo = m; else hi = m; }
              const q = v3.add(c, d, (lo + hi) / 2); p.setXYZ(i, q[0], q[1], q[2]);
              grad(f, q[0], q[1], q[2], 0.004, g); n.setXYZ(i, g[0], g[1], g[2]);
            }
            addGeo(THREE, acc, s, M4(), col, k, 0);
          };
          const kW = [0.3, 0.25, 0, 1], kS = [0.72, 0.15, 0, 1], kV = [0.06, 0, 0, 1], kA = [0.36, 0.3, 0, 1];
          const HC = G.helm.c, wcol = (x, y, z, nx, ny) => mix3(C.white, C.whiteDk, sstep(0.25, -0.8, ny) * 0.5);
          snap(F.helmF, [0, 0.7, 0.0], 12, 8, 0.5, wcol, kW);
          // the visor and the strap: bands of a sphere snapped onto the helmet (three.js: x = -cos(phi) sin(theta), z = sin(phi)
          // sin(theta), y = cos(theta); so azimuth az from +Z toward +X is phi = PI / 2 + az, height y is theta = acos((y - c) / r))
          const VA = G.visor.ang, thAt = (y) => Math.acos(clamp((y - HC[1]) / 0.27, -1, 1));
          const vt0 = thAt(G.visor.y + G.visor.h0 * 0.85), vt1 = thAt(G.visor.y - G.visor.h0 * 0.8);
          snap((x, y, z) => F.helmF(x, y, z) - G.visor.th, HC, 10, 2, 0.5, (x, y) => mix3(C.visor, mix3(C.accentDk, C.accent, 0.4), 0.55 * sstep(G.visor.y + 0.01, G.visor.y + 0.05, y)), kV, [PI / 2 - VA, 2 * VA, vt0, vt1 - vt0]);
          const st0 = thAt(G.visor.y + G.strap.h), st1 = thAt(G.visor.y - G.strap.h);
          snap((x, y, z) => F.helmF(x, y, z) - G.strap.th, HC, 8, 1, 0.5, C.accent, kA, [PI / 2 + VA - 0.1, 2 * (PI - VA) + 0.2, st0, st1 - st0]);
          // the crown stripe (the chase camera's read from behind): a flat 3-sided tube over the dome
          {
            const pts = [], nn = [];
            for (let i = 0; i <= 5; i++) { const a = lerp(0.24, PI - 0.12, i / 5), d = [0, sin(a), cos(a)], p = rayHit(F.helmF, HC, d, 0, 0.5, 32) || v3.add(HC, d, 0.27); grad(F.helmF, p[0], p[1], p[2], 0.003, g); pts.push(v3.add(p, g, 0.002)); nn.push(g.slice()); }
            addGeo(THREE, acc, taperTube(THREE, pts, pts.map(() => G.ridge.w), pts.map(() => 0.006), 3, (i) => nn[i], false), M4(), C.accent, kA, 0);
          }
          // the torso: white plates painted over black
          snap(F.torsoF, [0, 0.25, -0.03], 8, 6, 0.4, (x, y, z) => (y > 0.19 && y < 0.48 && abs(x) < 0.17 ? (z > -0.02 || z < -0.15 ? C.white : C.suit) : C.suit), kW);
          const cyl = (A, B, ra, rb, c, k, seg) => {
            const d = v3.sub(B, A), L = hypot(...d), cy = new THREE.CylinderGeometry(rb, ra, L, seg || 5, 1, true);
            addGeo(THREE, acc, cy, M4().compose(V(v3.add(A, d, 0.5)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(v3.norm(d))), V([1, 1, 1])), c, k, 0);
          };
          for (const s of [1, -1]) {
            const X = (p) => [s * p[0], p[1], p[2]];
            cyl(X(G.S), X(G.El), 0.066, 0.06, C.suit, kS); cyl(X(G.El), X(G.Wr), 0.075, 0.068, C.white, kW);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.1, 6, 3, 0, PI * 2, 0, PI * 0.62), M4().makeTranslation(...X([G.S[0] + 0.03, G.S[1] + 0.012, G.S[2]])), (x, y) => (y < -0.02 ? C.accent : C.white), kW, 0);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.064, 5, 3), M4().makeTranslation(...X(G.pawC)), C.glove, kS, 0);
            cyl(X(G.Hp), X(G.K), 0.104, 0.094, C.white, kW); cyl(X(G.K), X(G.F), 0.094, 0.088, C.white, kW);
            addGeo(THREE, acc, new THREE.SphereGeometry(0.08, 5, 3), M4().compose(V(X([G.F[0], G.F[1], G.F[2] + 0.04])), new THREE.Quaternion(), V([1, 0.85, 1.35])), C.boot, kS, 0);
          }
          if (o.pack) addGeo(THREE, acc, new THREE.BoxGeometry(2 * G.pack.h[0], 2 * G.pack.h[1], 2 * G.pack.h[2]), M4().makeTranslation(...G.pack.c), C.accent, kA, 0);
          if (o.hud) for (const s of [1, -1]) {
            const p = faceAt(F.visSurf, s * G.hud.x, G.visor.y, 0.003);
            addGeo(THREE, acc, new THREE.BoxGeometry(0.06, 0.016, 0.006), M4().makeTranslation(...p), C.hud, [0.3, 0, 2, 1], 0);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.C, 3));
          geo.setAttribute('kz', new THREE.Float32BufferAttribute(acc.K, 4));
          geo.setIndex(new THREE.Uint16BufferAttribute(acc.I, 1));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, toon); mesh.name = 'whiteout-far';
          const group = new THREE.Group(); group.name = 'whiteout-far'; group.add(mesh);
          const stats = { tris: acc.I.length / 3, verts: acc.n, ms: Math.round(now() - T0), parts: { far: acc.I.length / 3 } };
          const sq = { k: 1, v: 0 };
          const api = {
            level: 'far', mesh, stats, names: [], bones: null, eyes: [1, -1].map((s) => faceAt(F.visSurf, s * G.hud.x, G.visor.y, 0.004)),
            set() { return api; }, setExpression() { return api; }, setGaze() { return api; }, look() { return api; }, blink() { return api; }, steer() { return api; },
            squash(k) { sq.k = k; mesh.scale.set(1 / sqrt(k), k, 1 / sqrt(k)); return api; }, kick(v) { sq.v += v; },
            update(dt) { const a = -220 * (sq.k - 1) - 14 * sq.v; sq.v += a * dt; sq.k += sq.v * dt; mesh.scale.set(1 / sqrt(sq.k), sq.k, 1 / sqrt(sq.k)); },
          };
          group.userData.racer = api;
          group.userData.stats = stats;
          return group;
        }

        /* ------------------------------------------------------------------ the live layer (the stars' API) */
        function rig(THREE, o) {
          const { bones: B, stats, names } = o;
          const rest = {}; for (const k in B) rest[k] = new THREE.Quaternion().copy(B[k].quaternion);
          const N0 = EXPR.neutral, NN = names.length ? names : NAMES;
          const st = { w: {}, target: null, gaze: null, look: [0, 0], blink: 0, autoBlink: true, nextBlink: 2 + Math.random() * 3, blinkT: -1, sq: 1, sqV: 0, steer: 0 };
          NN.forEach((n) => { st.w[n] = 0; });
          const qx = new THREE.Quaternion(), e = new THREE.Euler();
          const blend = (key) => { let v = N0[key]; for (const k of NN) v += st.w[k] * (EXPR[k][key] - N0[key]); return v; };
          function apply() {
            if (o.mesh.morphTargetInfluences) NN.forEach((n, i) => { o.mesh.morphTargetInfluences[i] = st.w[n] || 0; });
            B.head.quaternion.copy(rest.head).multiply(qx.setFromEuler(e.set(blend('pitch'), st.steer * 0.22, blend('roll') - st.steer * 0.05)));
            // the dashes look where the gaze is (round the visor) and blink (flattened onto their line)
            const gx = (st.gaze ? st.gaze[0] : 0) + st.look[0], gy = (st.gaze ? st.gaze[1] : 0) + st.look[1];
            B.hud.quaternion.copy(rest.hud).multiply(qx.setFromEuler(e.set(-clamp(gy, -1, 1) * 0.06, clamp(gx, -1, 1) * 0.1, 0)));
            B.hud.scale.set(1, max(0.08, 1 - st.blink * 0.92), 1);
            B.body.rotation.set(blend('lean'), 0, -st.steer * 0.05);
            B.root.scale.set(1 / sqrt(st.sq), st.sq, 1 / sqrt(st.sq));
          }
          const api = {
            level: o.level, bones: B, mesh: o.mesh, names: NN, EXPR, stats, eyes: o.eyes,
            set(weights) { for (const k of NN) st.w[k] = weights && weights[k] ? weights[k] : 0; st.target = null; apply(); return api; },
            setExpression(name, instant) { st.target = name; if (instant) { for (const k of NN) st.w[k] = k === name ? 1 : 0; apply(); } return api; },
            setGaze(x, y) { st.gaze = x === null || x === undefined ? null : [x, y || 0]; apply(); return api; },
            look(x, y) { st.look[0] = x; st.look[1] = y; apply(); return api; },
            blink(v) { st.blink = v || 0; st.autoBlink = v === undefined; apply(); return api; },
            squash(k) { st.sq = k; apply(); return api; },
            kick(v) { st.sqV += v; },
            steer(v) { st.steer = v; apply(); return api; },
            // auto blinks every 2-5 s (not while hit), eased expressions, squash spring (stiffness 220, damping 14)
            update(dt, inp) {
              if (st.target !== null) { const k = 1 - exp(-dt * 12); for (const n of NN) st.w[n] += ((n === st.target ? 1 : 0) - st.w[n]) * k; }
              if (st.autoBlink && (st.w.hit || 0) < 0.5) {
                st.nextBlink -= dt;
                if (st.nextBlink <= 0 && st.blinkT < 0) { st.blinkT = 0; st.nextBlink = 2 + Math.random() * 3; }
                if (st.blinkT >= 0) { st.blinkT += dt; const u = st.blinkT / 0.16; st.blink = u < 0.4 ? u / 0.4 : max(0, 1 - (u - 0.4) / 0.6); if (u >= 1) { st.blinkT = -1; st.blink = 0; } }
              }
              const a = -220 * (st.sq - 1) - 14 * st.sqV; st.sqV += a * dt; st.sq += st.sqV * dt;
              apply();
            },
          };
          apply();
          return api;
        }

        const api = (THREE, K, detail, opts) => build(THREE, K, detail, opts);
        // the two as added racers (kartRosterAddons): for (const [id, d] of KR.Whiteout.defs(KR)) add(id, d). Ids letters only.
        // The armour's accent is def.suit (the owner's: One orange, Two teal); def.paint / def.accent paint the sled (its
        // body in the suit's colour, dark trim), so a world can repaint the sled without touching the armour.
        api.defs = (KR) => {
          const char = (THREE, KIT, level, o) => api(THREE, KIT, level, { toon: o.toon, accent: (o.def && o.def.suit) || o.accent || ACCENT.one });
          const one = { name: 'Whiteout One', color: ACCENT.one, eye: 'dog', jersey: ACCENT.one, paint: ACCENT.one, accent: '#1B1E24', suit: ACCENT.one, number: 11,
            stats: { top: 1.005, accel: 1.02, handling: 0.99, mass: 1.08 }, face: FACE, char, wheel: KR.DogFinal.WHEEL, eyes: [0.083, 0.712, 0.274], sled: { y: 0, z: 0, s: 1 },
            persona: 'a white-armoured ski racer with orange bands and a goggle visor' };
          const two = { base: 'whiteoutone', name: 'Whiteout Two', color: ACCENT.two, jersey: ACCENT.two, paint: ACCENT.two, suit: ACCENT.two, number: 12,
            stats: { top: 1, accel: 1, handling: 1.02, mass: 1.02, drift: 1.06 }, persona: 'a white-armoured ski racer with teal bands and a goggle visor' };
          return [['whiteoutone', one], ['whiteouttwo', two]];
        };
        api.ACCENT = ACCENT; api.FACE = FACE; api.EXPR = EXPR; api.NAMES = NAMES; api.LEVELS = LEVELS; api.TR = TR; api.anatomy = anatomy; api.sdf = suitSDF;
        root.Whiteout = api;
      })(KR);
      // the five, registered: each recipe's own def (its body, hands, eyes, fit on the sled) under ASPEN's race
      var as = function (id, d) { return Object.assign({}, d, ASPEN[id]); };
      add('whitewhale', as('whitewhale', KR.WhiteWhale.def(KR)));
      add('lux', as('lux', { eye: 'dog', char: function (THREE, KIT, level, o) { return KR.LuxPenguin(THREE, KIT, level, { toon: o.toon, eyeMat: o.eyeMat }); },
        wheel: KR.DogFinal.WHEEL, eyes: [0.09, 0.713, 0.2], sled: { y: 0, z: 0, s: 1 }, ride: 'sled' }));
      // (no eyeballs: its lenses are the toon's; eye is any kind, unused)
      add('lordblackdiamond', as('lordblackdiamond', { eye: 'dog', char: function (THREE, KIT, level, o) { return KR.LordBlackDiamond(THREE, KIT, level, { toon: o.toon }); },
        wheel: KR.DogFinal.WHEEL, eyes: [0.0758, 0.6525, 0.2062], sled: { y: 0, z: 0, s: 1 }, ride: 'sled' }));
      // (one body, two suits: Two is a copy of One, its armour's accent its def's suit)
      KR.Whiteout.defs(KR).forEach(function (p) { add(p[0], as(p[0], p[1])); });
    }

    /* ---------------------------------------------- ctx.kart.racer(id, o) -- */
    // One of the eight as a racer, in the shape player() and rival() return ({ object, name, color, stats, animate }),
    // built facing +Z on y = 0. o: { jersey, paint (hex: the racer's own colours turned to these), name, stats, ride,
    // accent, number }. ride: 'sled' puts it on the snow sled (KR.SnowSled) instead of its own kart (any racer but Bike
    // Tyson), painted paint (the body), accent (stripe, skis, number roundel) and number (0-99 on both flanks); its entry
    // then carries ride and emit (the sled's snow emitters, its own frame: { track, rear, skis }). Each
    // racer is drawn at three levels of detail, which the race picks by distance (kartWorld): near (the sheet's desktop
    // level, or its phone level at 'low' quality), mid and far. The far is built at once (a couple of milliseconds); the
    // mid and the near when the race first wants them, or before, a level at a time between frames (kartRosterPump).
    // (declared, never assigned here: this text sits below boot()'s call of player() and rival(), so its state is made
    // on first use, KRS, and its constants are a function's)
    var KRS;
    // (the eight, then Aspen GP's five, kartRosterAddons: listed before the library is built, so a world can ask)
    function kartIds() { return ['pepe', 'doge', 'shiba', 'bike', 'bull', 'bear', 'whale', 'mooncat', 'whitewhale', 'lux', 'lordblackdiamond', 'whiteoutone', 'whiteouttwo']; }
    function kartRosterState() { return KRS || (KRS = { queue: [], builds: [], shared: null }); }
    function kartRacer(id, o) {
      var L = kartRosterLib(), S = kartRosterState();
      o = o || {};
      id = String(id || '').toLowerCase().replace(/[^a-z]/g, '');
      if (id === 'biketyson') id = 'bike'; else if (id === 'bigbear') id = 'bear'; else if (id === 'thewhale') id = 'whale'; else if (id === 'bullrun') id = 'bull';
      if (!L.RACERS[id]) { warn('ctx.kart.racer: there is no racer "' + id + '" (the racers are ' + L.IDS.join(', ') + '); Pepe stands in.'); id = 'pepe'; }
      var R = L.RACERS[id], jersey = isHex(o.jersey) ? o.jersey : null, paint = isHex(o.paint) ? o.paint : null;
      // (the sled: only when asked, or for a world's own racer that has no kart; Meme Kart asks for neither)
      var ride = L.rideOf(id, o), BO = { jersey: jersey, paint: paint };
      if (ride) {
        var num = typeof o.number === 'number' && isFinite(o.number) ? Math.max(0, Math.min(99, Math.round(o.number))) : typeof o.number === 'string' && /^[0-9]{1,2}$/.test(o.number) ? o.number : undefined;
        BO = { jersey: jersey, paint: paint, ride: ride, accent: isHex(o.accent) ? o.accent : null, number: num };
        (S.ride || (S.ride = {}))[id] = ride;
      }
      // (the transparent ones have nothing of a racer's own in them: one each for the whole field)
      if (!S.shared) S.shared = { glass: L.mat.glass(THREE), water: L.mat.water(THREE) };
      var M = { toon: L.mat.toon(THREE, R.jersey === 'zone' && jersey ? { jersey: jersey } : {}), eye: L.mat.eye(THREE, R.eye), glass: S.shared.glass, water: S.shared.water };
      var g = new THREE.Group(); g.name = 'racer-' + id;
      var H = { id: id, levels: {}, cur: null, near: quality === 'low' ? 'phone' : 'desktop', onBuilt: null, M: M,
        st: { W: {}, look: 0, gx: 0, gy: 0, shake: 0, roll: 0, acc: 0, q: new THREE.Quaternion(), e: new THREE.Euler() },
        prev: { hop: false, air: false, boost: 0, hit: false, cheer: false }, sadT: 0, cheerT: 0, lastV: 0, lean: 0, leanV: 0 };
      H.build = function (lv) {
        if (lv === 'near') lv = H.near;
        // (?kdiag=lowlod: the far level, whatever is asked for)
        if (KDIAG.lowlod) lv = 'far';
        if (H.levels[lv]) return H.levels[lv];
        kartStep('racer ' + id + ' ' + lv + ': building');
        var b = L.build(THREE, id, lv, M, BO);
        kartStep('racer ' + id + ' ' + lv + ': built ' + b.tris + ' tris');
        b.group.visible = false; g.add(b.group); H.levels[lv] = b;
        S.builds.push({ id: id, level: lv, ms: b.ms, tris: b.tris, draws: b.draws, nan: b.nan });
        if (H.onBuilt) H.onBuilt(b);
        return b;
      };
      // (asked for, later: the near level, between frames)
      H.queue = function (lv) { if (lv === 'near') lv = H.near; if (KDIAG.lowlod) lv = 'far'; if (!H.levels[lv] && !S.queue.some(function (q) { return q.H === H && q.lv === lv; })) S.queue.push({ H: H, lv: lv }); };
      if (ride) { H.ride = ride; H.emit = L.SLED.EMIT; }
      H.build('far'); H.queue('mid');
      // its contact shadow (one of the field's, kartContact): a soft dark oval under the kart, the size of its far
      // level's footprint, so it sits ON the road whatever the sun is doing (low and behind, the sun's own shadow
      // falls toward the camera and leaves the kart standing on nothing)
      var fb = new THREE.Box3().setFromObject(H.levels.far.group), fs = fb.getSize(new THREE.Vector3()), fc = fb.getCenter(new THREE.Vector3());
      H.contact = { n: S.contactN = (S.contactN || 0) + 1, a: 0, w: Math.max(0.7, fs.x * 1.05), l: Math.max(1.2, fs.z * 0.98), cx: fc.x, cz: fc.z };
      // the level shown: built now if it must be (urgent), else the nearest one built while it is made (the middle level
      // for the near, the far for the middle)
      H.show = function (detail, urgent) {
        var lv = KDIAG.lowlod ? 'far' : detail === 'near' ? H.near : detail === 'far' ? 'far' : 'mid';
        H.wanting = false;
        if (!H.levels[lv]) {
          if (urgent) H.build(lv);
          else { H.queue(lv); H.wanting = true; lv = lv === H.near && H.levels.mid ? 'mid' : 'far'; }
        }
        var b = H.levels[lv];
        if (H.cur !== b) {
          if (H.cur) H.cur.group.visible = false;
          b.group.visible = true; H.cur = b;
          // (whatever the runtime set on the racer's meshes, the eyes and the glass stay out of the shadow pass)
          b.group.traverse(function (m) { if (m.isMesh) m.castShadow = !m.userData.gmNoShadow; });
          b.api.set(H.st.W);
        }
        return b;
      };
      H.fixShadows = function () { for (var lv in H.levels) H.levels[lv].group.traverse(function (m) { if (m.isMesh) m.castShadow = !m.userData.gmNoShadow; }); };
      H.show('far');
      g.userData.kartRacer = { id: id, stats: o.stats && typeof o.stats === 'object' ? o.stats : R.stats, H: H };
      // (an added racer's road manner, its def's: kart.js takes it over the roster's by id; the eight have none here)
      if (L.ADDED[id] && L.ADDED[id].persona) g.userData.kartRacer.persona = L.ADDED[id].persona;
      if (ride) { g.userData.kartRacer.ride = ride; g.userData.kartRacer.emit = L.SLED.EMIT; }
      var E = {
        object: g, name: typeof o.name === 'string' && o.name.trim() ? o.name : R.name, color: paint || R.color, racer: id, kartRacer: H,
        stats: o.stats && typeof o.stats === 'object' ? o.stats : R.stats,
        // s: kartWorld's { speed, steer, drift, tier, boost, air, hop, trick, hit, spun, place, finished, roll, detail,
        // urgent, back, gaze, celebrate, sad, lean }
        animate: function (t, dt, s) {
          var b = H.show(s.detail || 'mid', s.urgent), P = H.prev;
          kartContact(g, H.contact, s, dt);
          var hop = !!s.hop, air = !!s.air, hit = !!s.hit, cheer = !!s.celebrate;
          if (hit || s.spun) H.sadT = 1.2; else H.sadT = Math.max(0, H.sadT - dt);
          if (cheer) H.cheerT -= dt; else H.cheerT = 0;
          var d = {
            speed: s.speed || 0, steer: s.steer || 0, drift: s.drift || 0, tier: s.tier || 0, boost: s.boost, gaze: s.gaze || null, back: !!s.back, air: air,
            hit: hit || !!s.spun, sad: !cheer && (H.sadT > 0 || !!s.sad), celebrate: cheer,
            hopNow: hop && !P.hop, landNow: (P.air || P.hop) && !air && !hop, boostNow: s.boost > 0 && !(P.boost > 0), hitNow: hit && !P.hit, cheerNow: cheer && H.cheerT <= 0,
          };
          if (d.cheerNow) H.cheerT = 2.4;
          if (d.hitNow) H.st.shake = 0.6;
          P.hop = hop; P.air = air; P.boost = s.boost; P.hit = hit;
          if (dt > 0) { H.st.acc = Math.max(-1, Math.min(1, ((s.speed || 0) - H.lastV) / dt / 12)); H.lastV = s.speed || 0; }
          if (b.level === 'far') return;
          L.drive(b, R, H.st, dt, d);
          // (Bike Tyson leans his own rig up close; further off, his whole bike leans, at the same 30 degrees, 35 drifting)
          if (R.bike && b.level === 'mid' && dt > 0) {
            var tgt = -(s.steer || 0) * (s.drift ? 35 : 30) * Math.PI / 180 * Math.min(1, (s.speed || 0) * (s.speed || 0) / 120);
            H.leanV += (60 * (tgt - H.lean) - 11 * H.leanV) * dt; H.lean += H.leanV * dt;
            b.group.rotation.z = -H.lean;
          }
        },
      };
      if (ride) { E.ride = ride; E.emit = L.SLED.EMIT; }
      return E;
    }
    // the field's contact shadows: ONE instanced mesh for every racer (one draw call), each a soft oval just over the
    // road under its kart, as dark as a toy's on a table (0.62 at the middle), gone while the kart is in the air or
    // tipped over by a hit, and faded out by 40 to 90 m from the camera (it has no fog, and is not wanted that far)
    function kartContact(g, C, s, dt) {
      var S = kartRosterState(), B = S.contact;
      if (!B) {
        var geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), fade = new THREE.InstancedBufferAttribute(new Float32Array(16), 1);
        geo.setAttribute('aFade', fade);
        var mat = new THREE.ShaderMaterial({
          vertexShader: 'attribute float aFade; varying vec2 vQ; varying float vA;\nvoid main() { vQ = uv * 2.0 - 1.0; vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4( position, 1.0 ); vA = aFade * ( 1.0 - smoothstep( 40.0, 90.0, -mv.z ) ); gl_Position = projectionMatrix * mv; }',
          fragmentShader: 'varying vec2 vQ; varying float vA;\nvoid main() { float r = length( vQ ); float a = 1.0 - smoothstep( 0.2, 1.0, r ); gl_FragColor = vec4( 0.0, 0.0, 0.0, 0.62 * a * a * vA ); }',
          transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
        });
        var mesh = new THREE.InstancedMesh(geo, mat, 16);
        mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.userData.gmKart = true; mesh.userData.gmNoShadow = true; mesh.name = 'racer-contact';
        for (var i = 0; i < 16; i++) mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
        B = S.contact = { mesh: mesh, fade: fade, m: new THREE.Matrix4(), l: new THREE.Matrix4(), up: new THREE.Vector3() };
      }
      if (C.n > 16) return;
      if (!B.mesh.parent) { var root = g; while (root.parent) root = root.parent; if (root.isScene) root.add(B.mesh); else return; }
      g.updateWorldMatrix(true, false);
      var shown = true; for (var p = g; p; p = p.parent) if (!p.visible) { shown = false; break; }
      var up = B.up.set(0, 1, 0).transformDirection(g.matrixWorld).y;
      var want = shown && !s.air && !s.hop ? Math.max(0, Math.min(1, (up - 0.7) / 0.25)) : 0;
      C.a += (want - C.a) * (1 - Math.exp(-(dt || 0) * (want > C.a ? 10 : 18)));
      if (!(dt > 0)) C.a = want;
      B.l.makeScale(C.w, 1, C.l).setPosition(C.cx, 0.035, C.cz);
      B.mesh.setMatrixAt(C.n - 1, B.m.multiplyMatrices(g.matrixWorld, B.l));
      B.fade.array[C.n - 1] = C.a;
      B.mesh.instanceMatrix.needsUpdate = true; B.fade.needsUpdate = true;
    }
    // near levels asked for: built between frames, at least one a call, until `ms` is spent
    function kartRosterPump(ms) {
      var Q = kartRosterState().queue, t0 = performance.now(), n = 0;
      // (one a racer is waiting for first, then the middle levels, then the near)
      Q.sort(function (a, b) { return (b.H.wanting ? 2 : 0) + (b.lv === 'mid' ? 1 : 0) - (a.H.wanting ? 2 : 0) - (a.lv === 'mid' ? 1 : 0); });
      while (Q.length && (n === 0 || performance.now() - t0 < ms)) { var q = Q.shift(); q.H.build(q.lv); n++; }
      return n;
    }

