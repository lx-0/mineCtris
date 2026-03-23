// Post-processing: bloom, cinematic color grading, and vignette.
// Depends on globals: isGameOver, lineClearInProgress, getMaxBlockHeight(),
//                     DANGER_ZONE_HEIGHT, THREE.ShaderPass, THREE.UnrealBloomPass

const BLOOM_STRENGTH  = 0.8;
const BLOOM_RADIUS    = 0.4;
const BLOOM_THRESHOLD = 0.75;

// Grade targets per game state.
// saturation : 0=grayscale, 1=normal, 2=oversaturated
// temperature: -1=cold/blue, 0=neutral, +1=warm/red
// brightness : 1=normal
// vignette   : corner-darkening strength
//              0.20 → 20% dark at extreme corners (subtle always-on)
//              0.50 → 50% dark at corners (danger tunnel-vision)
//              5.00 → iris close (game over)
const _GRADE_TARGET = {
  normal:    { saturation: 1.25, temperature:  0.08, brightness: 1.00, vignette: 0.20 },
  danger:    { saturation: 0.55, temperature:  0.30, brightness: 0.90, vignette: 0.50 },
  lineclear: { saturation: 1.90, temperature:  0.10, brightness: 1.25, vignette: 0.08 },
  gameover:  { saturation: 0.10, temperature: -0.50, brightness: 0.75, vignette: 5.00 },
  slowdown:  { saturation: 1.00, temperature: -0.45, brightness: 0.95, vignette: 0.38 },
};

const _LERP_NORMAL   = 2.5;  // fast transitions (normal / danger / lineclear)
const _LERP_GAMEOVER = 0.8;  // slow iris close on game over

// Currently interpolated values — start at normal
const _cur = { saturation: 1.25, temperature: 0.08, brightness: 1.00, vignette: 0.20 };

let _bloomPass      = null;
let _colorGradePass = null;
let _vignettePass   = null;
let _chromaticAberrationPass = null;

// Chromatic aberration decay state (updated each frame)
let _caStrength   = 0.0;
let _caDecayRate  = 0.0;

// ── Color Grade Shader ────────────────────────────────────────────────────────
// Applies saturation, temperature (warm/cool tint), and brightness.
const _ColorGradeShader = {
  uniforms: {
    tDiffuse:     { value: null },
    uSaturation:  { value: 1.25 },
    uTemperature: { value: 0.08 },
    uBrightness:  { value: 1.00 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uTemperature;
    uniform float uBrightness;
    varying vec2 vUv;

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // Brightness
      c *= uBrightness;

      // Saturation — luminance-preserving
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(lum), c, uSaturation);

      // Temperature: positive = warm (push R, pull B), negative = cool (push B, pull R)
      c.r += uTemperature * 0.12;
      c.b -= uTemperature * 0.12;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

// ── Chromatic Aberration Shader ───────────────────────────────────────────────
// Splits R/G/B channels horizontally by `strength` UV units.
// strength=0 → passthrough; hard landing spikes to 0.006, Tetris to 0.012.
const _ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;

    void main() {
      vec2 offset = vec2(strength, 0.0);
      gl_FragColor = vec4(
        texture2D(tDiffuse, vUv + offset).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - offset).b,
        1.0
      );
    }
  `,
};

// ── Vignette Shader ───────────────────────────────────────────────────────────
// uStrength controls darkening:
//   0.20 → subtle 20% corners  (always-on)
//   0.50 → 50% corners         (danger zone)
//   5.00 → iris close          (game over)
//
// Formula: dark = (dist² × 0.5) × uStrength
//   dist = 0 at center, ~1.41 at extreme corners (in UV×2 space)
//   At corner: dark = 1.0 × uStrength → uStrength=0.20 gives 20% darkening ✓
const _VignetteShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uStrength: { value: 0.20 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      // dist: 0=center, ~1.41=extreme corner
      float dist = length((vUv - 0.5) * 2.0);
      float dark = (dist * dist * 0.5) * uStrength;
      gl_FragColor = vec4(texel.rgb * clamp(1.0 - dark, 0.0, 1.0), texel.a);
    }
  `,
};

function _lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Add bloom, color grade, and vignette passes to the EffectComposer.
 * Call AFTER base passes (RenderPass, SSAOPass) have been added.
 */
function initBloomPasses(compsr) {
  // Bloom — gracefully skip if library not loaded
  if (typeof THREE.UnrealBloomPass !== 'undefined') {
    _bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD
    );
    compsr.addPass(_bloomPass);
  } else {
    console.warn('UnrealBloomPass not available — bloom disabled.');
  }

  _colorGradePass = new THREE.ShaderPass(_ColorGradeShader);
  compsr.addPass(_colorGradePass);

  _vignettePass = new THREE.ShaderPass(_VignetteShader);
  compsr.addPass(_vignettePass);

  // Chromatic aberration — final pass so it splits the fully-graded image
  _chromaticAberrationPass = new THREE.ShaderPass(_ChromaticAberrationShader);
  compsr.addPass(_chromaticAberrationPass);
}

/**
 * Interpolate color grade and vignette toward the current game-state target.
 * Call every frame from animate().
 */
function updatePostProcessing(delta) {
  if (!_colorGradePass || !_vignettePass) return;

  let key = 'normal';
  if (isGameOver) {
    key = 'gameover';
  } else if (lineClearInProgress) {
    key = 'lineclear';
  } else if (getMaxBlockHeight() >= DANGER_ZONE_HEIGHT) {
    key = 'danger';
  } else if (typeof slowDownActive !== 'undefined' && slowDownActive) {
    key = 'slowdown';
  }

  const tgt = _GRADE_TARGET[key];
  const spd = (key === 'gameover') ? _LERP_GAMEOVER : _LERP_NORMAL;
  const t   = Math.min(1.0, delta * spd);

  _cur.saturation  = _lerp(_cur.saturation,  tgt.saturation,  t);
  _cur.temperature = _lerp(_cur.temperature, tgt.temperature, t);
  _cur.brightness  = _lerp(_cur.brightness,  tgt.brightness,  t);
  _cur.vignette    = _lerp(_cur.vignette,    tgt.vignette,    t);

  _colorGradePass.uniforms.uSaturation.value  = _cur.saturation;
  _colorGradePass.uniforms.uTemperature.value = _cur.temperature;
  _colorGradePass.uniforms.uBrightness.value  = _cur.brightness;
  _vignettePass.uniforms.uStrength.value      = _cur.vignette;

  // Chromatic aberration: exponential decay each frame
  if (_chromaticAberrationPass && _caStrength > 0) {
    _caStrength = Math.max(0, _caStrength - delta * _caDecayRate);
    _chromaticAberrationPass.uniforms.strength.value = _caStrength;
  }
}

/**
 * Spike chromatic aberration strength then let it decay to 0.
 * @param {number} strength      Peak UV offset (e.g. 0.006 or 0.012)
 * @param {number} decayDuration Seconds to decay from peak to 0
 */
function triggerChromaticAberration(strength, decayDuration) {
  _caStrength  = strength;
  _caDecayRate = strength / decayDuration;
  if (_chromaticAberrationPass) {
    _chromaticAberrationPass.uniforms.strength.value = _caStrength;
  }
}

/** Snap grade values back to normal immediately (called on game reset). */
function resetPostProcessing() {
  const n = _GRADE_TARGET.normal;
  _cur.saturation  = n.saturation;
  _cur.temperature = n.temperature;
  _cur.brightness  = n.brightness;
  _cur.vignette    = n.vignette;
  if (_colorGradePass) {
    _colorGradePass.uniforms.uSaturation.value  = n.saturation;
    _colorGradePass.uniforms.uTemperature.value = n.temperature;
    _colorGradePass.uniforms.uBrightness.value  = n.brightness;
  }
  if (_vignettePass) {
    _vignettePass.uniforms.uStrength.value = n.vignette;
  }
  _caStrength = 0;
  _caDecayRate = 0;
  if (_chromaticAberrationPass) {
    _chromaticAberrationPass.uniforms.strength.value = 0;
  }
}

/** Update bloom render-target size on window resize. */
function resizePostProcessing(width, height) {
  if (_bloomPass) _bloomPass.setSize(width, height);
}

function initPostProcessing() {
  if (
    typeof THREE.EffectComposer === 'undefined' ||
    typeof THREE.SSAOPass === 'undefined'
  ) {
    console.warn("Post-processing scripts not loaded — skipping SSAO.");
    return;
  }

  composer = new THREE.EffectComposer(renderer);

  const renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(renderPass);

  const ssaoPass = new THREE.SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssaoPass.kernelRadius = 6;
  ssaoPass.minDistance  = 0.004;
  ssaoPass.maxDistance  = 0.08;
  composer.addPass(ssaoPass);

  // Bloom + color grade + vignette
  initBloomPasses(composer);
}
