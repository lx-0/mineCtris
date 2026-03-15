// Block shader materials — per-face brightness, procedural surface texture, and specular.
// Requires: Three.js loaded first.

// Shared time uniform for animated lava — updated every frame by main.js.
const lavaUniforms = { uTime: { value: 0 } };

// Shared time uniform for animated ice — updated every frame by main.js.
const iceUniforms = { uTime: { value: 0 } };

const LAVA_COLOR_HEX = 0xff0000;
const ICE_COLOR_HEX  = 0x00ffff;

// PBR properties keyed by color hex integer.
// roughness/metalness drive specular character; noiseScale/noiseStrength drive texture.
const BLOCK_MAT_PROPS = {
  0x8b4513: { roughness: 0.92, metalness: 0.0, noiseScale: 7.0, noiseStrength: 0.14 }, // dirt
  0x808080: { roughness: 0.88, metalness: 0.0, noiseScale: 9.0, noiseStrength: 0.18 }, // stone — rough
  0xffff00: { roughness: 0.25, metalness: 0.75, noiseScale: 4.0, noiseStrength: 0.05 }, // gold — polished
  0x00ffff: { roughness: 0.08, metalness: 0.05, noiseScale: 12.0, noiseStrength: 0.09 }, // ice — crystalline
  0x008000: { roughness: 0.78, metalness: 0.0, noiseScale: 5.0, noiseStrength: 0.10 }, // green
  0xff0000: { roughness: 0.70, metalness: 0.0, noiseScale: 5.0, noiseStrength: 0.10 }, // red
  0x800080: { roughness: 0.65, metalness: 0.0, noiseScale: 5.0, noiseStrength: 0.10 }, // purple
};

/**
 * Add per-face brightness as vertex colors to a BoxGeometry.
 * Top face (+Y normal) = 1.0, sides = 0.75, bottom (-Y normal) = 0.5.
 * MeshStandardMaterial multiplies vertex colors by material.color, so the
 * base color is preserved while each face gets the correct ambient shading.
 */
function addFaceBrightnessColors(geometry) {
  const normals = geometry.attributes.normal;
  const count = normals.count;
  const colorsArr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const ny = normals.getY(i);
    let b;
    if (ny > 0.5) b = 1.0;       // top face — sky-lit
    else if (ny < -0.5) b = 0.5; // bottom face — occluded
    else b = 0.75;                // side faces — side-lit
    colorsArr[i * 3]     = b;
    colorsArr[i * 3 + 1] = b;
    colorsArr[i * 3 + 2] = b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));
}

/**
 * Create a MeshStandardMaterial for a block with:
 *   - per-face brightness via vertex colors
 *   - PBR roughness/metalness appropriate to the block type
 *   - subtle procedural surface noise injected via onBeforeCompile
 *
 * Compatible with mining.js: .color and .emissive properties work unchanged.
 */
function createBlockMaterial(color) {
  const threeColor = (color instanceof THREE.Color) ? color.clone() : new THREE.Color(color);
  const hexColor = threeColor.getHex();
  const props = BLOCK_MAT_PROPS[hexColor] || { roughness: 0.75, metalness: 0.0, noiseScale: 5.0, noiseStrength: 0.10 };

  const mat = new THREE.MeshStandardMaterial({
    color: threeColor,
    roughness: props.roughness,
    metalness: props.metalness,
    vertexColors: true,
  });

  const noiseScale = props.noiseScale;
  const noiseStrength = props.noiseStrength;

  if (hexColor === LAVA_COLOR_HEX) {
    // Animated lava: scrolling noise + pulsed emissive
    mat.onBeforeCompile = function(shader) {
      shader.uniforms.uTime = lavaUniforms.uTime;

      // Vertex shader: expose world position as a varying
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldPos;'
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );

      // Fragment shader: declare varying + uniforms + 2-D smooth noise helpers
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos;
uniform float uTime;
float lavaHash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float lavaNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(lavaHash2(i),                lavaHash2(i + vec2(1.0, 0.0)), u.x),
    mix(lavaHash2(i + vec2(0.0,1.0)),lavaHash2(i + vec2(1.0, 1.0)), u.x),
    u.y);
}`
      );

      // Override emissive with animated flowing lava color
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec2 uv1 = vWorldPos.xz * 3.0 + vec2(uTime * 0.3, uTime * 0.1);
  vec2 uv2 = vWorldPos.xz * 5.0 + vec2(-uTime * 0.2, uTime * 0.4);
  float n = clamp(lavaNoise(uv1) * 0.6 + lavaNoise(uv2) * 0.4, 0.0, 1.0);
  float pulse = 0.85 + 0.30 * sin(uTime * 4.4);
  totalEmissiveRadiance = mix(vec3(0.8, 0.2, 0.0), vec3(1.2, 0.5, 0.0), n) * pulse;
}`
      );
    };
  } else if (hexColor === ICE_COLOR_HEX) {
    // Ice: semi-transparent with Fresnel rim glow + animated caustic shimmer.
    mat.transparent = true;
    mat.opacity     = 0.82;
    mat.depthWrite  = false;

    mat.onBeforeCompile = function(shader) {
      shader.uniforms.uTime          = iceUniforms.uTime;
      shader.uniforms.uNoiseScale    = { value: noiseScale };
      shader.uniforms.uNoiseStrength = { value: noiseStrength };

      // Vertex shader: world position + view-space view direction
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vViewDir;'
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
      // mvPosition is available after project_vertex
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvViewDir = normalize(-mvPosition.xyz);'
      );

      // Fragment shader: declare varyings + uniforms + noise helpers
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos;
varying vec3 vViewDir;
uniform float uTime;
uniform float uNoiseScale;
uniform float uNoiseStrength;
float iceHash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float iceNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(iceHash2(i),                 iceHash2(i + vec2(1.0, 0.0)), u.x),
    mix(iceHash2(i + vec2(0.0, 1.0)),iceHash2(i + vec2(1.0, 1.0)), u.x),
    u.y);
}
float iceBlockNoise(vec3 p) {
  vec3 fp = floor(p);
  return fract(sin(dot(fp, vec3(127.1, 311.7, 74.7))) * 43758.5453) * 2.0 - 1.0;
}`
      );

      // Surface texture noise (same as default block path)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb += iceBlockNoise(vWorldPos * uNoiseScale) * uNoiseStrength;`
      );

      // Fresnel rim + caustic shimmer injected after emissive map
      // vViewDir and normal are both in view-space here.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  float fresnel = pow(1.0 - max(dot(normal, vViewDir), 0.0), 3.0);
  totalEmissiveRadiance += fresnel * vec3(0.3, 0.8, 1.0) * 0.6;
  vec2 uv1 = vWorldPos.xz * 4.0 + uTime * 0.05;
  vec2 uv2 = vWorldPos.xz * 4.0 + vec2(0.7, -0.3) + uTime * 0.05;
  float caustic = iceNoise(uv1) * 0.5 + iceNoise(uv2) * 0.5;
  diffuseColor.rgb += caustic * 0.08 * vec3(0.5, 0.9, 1.0);
}`
      );
    };

  } else {
    mat.onBeforeCompile = function(shader) {
      shader.uniforms.uNoiseScale    = { value: noiseScale };
      shader.uniforms.uNoiseStrength = { value: noiseStrength };

      // Vertex shader: expose world position as a varying
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldPos;'
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );

      // Fragment shader: declare varying + noise helper
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos;
uniform float uNoiseScale;
uniform float uNoiseStrength;
// Value noise on a 3-D lattice — smooth, marble-like variation
float blockNoise(vec3 p) {
  vec3 fp = floor(p);
  return fract(sin(dot(fp, vec3(127.1, 311.7, 74.7))) * 43758.5453) * 2.0 - 1.0;
}`
      );

      // Apply noise to diffuse color AFTER vertex-color brightness multiplication
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb += blockNoise(vWorldPos * uNoiseScale) * uNoiseStrength;`
      );
    };
  }

  return mat;
}
