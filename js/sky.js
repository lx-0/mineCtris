// Dynamic sky, day/night lighting, and atmospheric fog.
// Requires: state.js (scene, skyMesh, skyStars, sunLight, hemisphereLight),
//           config.js (GAME_OVER_HEIGHT, DANGER_ZONE_HEIGHT),
//           gamestate.js (getMaxBlockHeight)

const SKY_CYCLE_DURATION = 600; // 10-minute full cycle in seconds

// Keyframes: t in [0,1] where 0/1=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk
// Colors as [r, g, b] 0-255
const _SKY_KEYS = [
  { t: 0.00, zen: [  0,   8,  32], hor: [ 16,  24,  64] }, // midnight
  { t: 0.25, zen: [ 96,  32,  96], hor: [255, 128,  48] }, // dawn
  { t: 0.50, zen: [ 26, 106, 255], hor: [135, 206, 235] }, // noon
  { t: 0.75, zen: [ 64,  16,  96], hor: [255,  96,  48] }, // dusk
  { t: 1.00, zen: [  0,   8,  32], hor: [ 16,  24,  64] }, // midnight (wrap)
];

const _LIGHT_KEYS = [
  { t: 0.00, sc: [ 32,  48, 128], si: 0.15, ac: [ 16,  16,  48], ai: 0.15 },
  { t: 0.25, sc: [255, 128,  48], si: 0.70, ac: [128,  96,  64], ai: 0.40 },
  { t: 0.50, sc: [255, 255, 240], si: 1.00, ac: [240, 240, 255], ai: 0.60 },
  { t: 0.75, sc: [255, 112,  32], si: 0.60, ac: [128,  80,  48], ai: 0.30 },
  { t: 1.00, sc: [ 32,  48, 128], si: 0.15, ac: [ 16,  16,  48], ai: 0.15 },
];

const _dangerFogColor = new THREE.Color(0x8b1a1a);

function _lerpArr(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function _keyframeAt(keys, phase) {
  for (let i = 0; i < keys.length - 1; i++) {
    if (phase >= keys[i].t && phase <= keys[i + 1].t) {
      const local = (phase - keys[i].t) / (keys[i + 1].t - keys[i].t);
      return { k0: keys[i], k1: keys[i + 1], local };
    }
  }
  return { k0: keys[keys.length - 2], k1: keys[keys.length - 1], local: 1 };
}

function _applySkyColors(zenArr, horArr) {
  const geo = skyMesh.geometry;
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const radius = 450;

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    // tGrad: 0 at equator/below, 1 at top pole — blend horizon → zenith
    const tGrad = Math.max(0, Math.min(1, y / radius));
    const c = _lerpArr(horArr, zenArr, tGrad);
    col.setXYZ(i, c[0] / 255, c[1] / 255, c[2] / 255);
  }
  col.needsUpdate = true;
}

/** Initialize sky dome, stars, and replace scene lights. Called once from init(). */
function initSky() {
  // ── Sky dome ──────────────────────────────────────────────────────────────
  const skyGeo = new THREE.SphereGeometry(450, 32, 16);
  const count = skyGeo.attributes.position.count;
  skyGeo.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(count * 3), 3)
  );
  const skyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.renderOrder = -1;
  scene.add(skyMesh);

  // ── Stars ─────────────────────────────────────────────────────────────────
  const starCount = 800;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    // Random point on upper hemisphere
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.random() * Math.PI * 0.48; // upper hemisphere only
    const r = 440;
    starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.2,
    fog: false,
    transparent: true,
    opacity: 0,
  });
  skyStars = new THREE.Points(starGeo, starMat);
  scene.add(skyStars);

  // ── Lights ────────────────────────────────────────────────────────────────
  // Hemisphere: sky color top, ground color bottom
  hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x55aa55, 0.5);
  scene.add(hemisphereLight);

  // Directional sun/moon light
  sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
  sunLight.position.set(50, 100, 75);
  sunLight.castShadow = true;
  scene.add(sunLight);

  // ── Fog ───────────────────────────────────────────────────────────────────
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.002);

  // Initial update
  updateSky(0);
}

/** Called every frame from animate(). elapsedSeconds = clock.getElapsedTime(). */
function updateSky(elapsedSeconds) {
  const phase = (elapsedSeconds % SKY_CYCLE_DURATION) / SKY_CYCLE_DURATION;

  // ── Sky dome colors ───────────────────────────────────────────────────────
  const skyKf = _keyframeAt(_SKY_KEYS, phase);
  const zenArr = _lerpArr(skyKf.k0.zen, skyKf.k1.zen, skyKf.local);
  const horArr = _lerpArr(skyKf.k0.hor, skyKf.k1.hor, skyKf.local);
  _applySkyColors(zenArr, horArr);

  // Keep scene.background in sync with horizon (fills any uncovered pixels)
  if (!scene.background) scene.background = new THREE.Color();
  scene.background.setRGB(horArr[0] / 255, horArr[1] / 255, horArr[2] / 255);

  // ── Lighting ──────────────────────────────────────────────────────────────
  const lkf = _keyframeAt(_LIGHT_KEYS, phase);
  const sc = _lerpArr(lkf.k0.sc, lkf.k1.sc, lkf.local);
  const ac = _lerpArr(lkf.k0.ac, lkf.k1.ac, lkf.local);
  const si = lkf.k0.si + (lkf.k1.si - lkf.k0.si) * lkf.local;
  const ai = lkf.k0.ai + (lkf.k1.ai - lkf.k0.ai) * lkf.local;

  if (sunLight) {
    sunLight.color.setRGB(sc[0] / 255, sc[1] / 255, sc[2] / 255);
    sunLight.intensity = si;
    // Sun arcs across the sky — positive Y = above horizon
    const sunAngle = phase * 2 * Math.PI - Math.PI * 0.5;
    sunLight.position.set(
      Math.cos(sunAngle) * 120,
      Math.sin(sunAngle) * 120,
      60
    );
  }

  if (hemisphereLight) {
    hemisphereLight.color.setRGB(ac[0] / 255, ac[1] / 255, ac[2] / 255);
    hemisphereLight.intensity = ai;
  }

  // ── Stars: fade in at dusk, fade out at dawn ──────────────────────────────
  if (skyStars) {
    let starOpacity = 0;
    if (phase < 0.15 || phase > 0.85) {
      starOpacity = 1.0;
    } else if (phase <= 0.25) {
      // Dawn: fade out from 0.15 → 0.25
      starOpacity = 1.0 - (phase - 0.15) / 0.10;
    } else if (phase >= 0.75) {
      // Dusk: fade in from 0.75 → 0.85
      starOpacity = (phase - 0.75) / 0.10;
    }
    skyStars.material.opacity = starOpacity;
    skyStars.visible = starOpacity > 0.01;
  }

  // ── Fog density tied to block stack height ────────────────────────────────
  if (scene.fog) {
    const maxH = getMaxBlockHeight();
    const heightFactor = Math.max(0, Math.min(1, maxH / GAME_OVER_HEIGHT));
    let fogDensity = 0.002 + heightFactor * 0.015;
    let fogColor = new THREE.Color(
      horArr[0] / 255,
      horArr[1] / 255,
      horArr[2] / 255
    );

    // Danger zone: reddish, thicker fog
    if (maxH >= DANGER_ZONE_HEIGHT) {
      const dangerFactor = Math.min(1, (maxH - DANGER_ZONE_HEIGHT) / 3);
      fogColor.lerp(_dangerFogColor, dangerFactor * 0.6);
      fogDensity = Math.max(fogDensity, 0.008 + dangerFactor * 0.012);
    }

    scene.fog.color.copy(fogColor);
    scene.fog.density = fogDensity;
  }
}
