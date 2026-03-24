"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAudioStore } from "@/stores/audioStore";

const GRID_SIZE = 128;
const GRID_SPACING = 0.15;

const vertexShader = `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uRms;
  uniform float uBeatIntensity;
  uniform float uEnergy;
  uniform sampler2D uFrequencyData;

  varying float vHeight;
  varying float vFog;
  varying vec2 vUv;

  // Simplex noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Scroll terrain toward camera
    float scroll = uTime * 0.8;
    float zOffset = mod(pos.z + scroll, float(${GRID_SIZE}) * ${GRID_SPACING.toFixed(2)}) - float(${GRID_SIZE}) * ${GRID_SPACING.toFixed(2)} * 0.5;

    // Map x position to frequency bin (left = bass, right = treble)
    float freqIndex = (pos.x / (float(${GRID_SIZE}) * ${GRID_SPACING.toFixed(2)}) + 0.5);

    // Height from noise + audio
    float noiseHeight = snoise(vec3(pos.x * 0.3, zOffset * 0.3, uTime * 0.1)) * 1.5;
    float bassHeight = uBass * 2.0 * smoothstep(0.5, 0.0, freqIndex);
    float trebleHeight = uTreble * 1.5 * smoothstep(0.5, 1.0, freqIndex);
    float midHeight = uMid * 1.0 * (1.0 - abs(freqIndex - 0.5) * 2.0);

    float height = noiseHeight + bassHeight + trebleHeight + midHeight;

    // Beat impact — sharp peaks
    height += uBeatIntensity * snoise(vec3(pos.x * 2.0, zOffset * 2.0, uTime * 3.0)) * 2.0;

    // Idle animation
    height += sin(pos.x * 0.5 + uTime * 0.3) * cos(zOffset * 0.3 + uTime * 0.2) * 0.5;

    pos.y = height;
    pos.z = zOffset;

    vHeight = height;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vFog = smoothstep(2.0, 20.0, -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uValence;
  uniform float uRms;
  uniform float uBeatIntensity;

  varying float vHeight;
  varying float vFog;
  varying vec2 vUv;

  void main() {
    // Color based on height
    vec3 deepColor = vec3(0.05, 0.02, 0.15);    // Deep purple valleys
    vec3 midColor = vec3(0.1, 0.3, 0.6);         // Blue mid
    vec3 peakColor = vec3(0.5, 0.8, 1.0);        // Cyan peaks
    vec3 hotColor = vec3(1.0, 0.6, 0.9);          // Pink/white hot peaks

    float h = clamp(vHeight / 4.0, 0.0, 1.0);

    vec3 color = mix(deepColor, midColor, smoothstep(0.0, 0.3, h));
    color = mix(color, peakColor, smoothstep(0.3, 0.6, h));
    color = mix(color, hotColor, smoothstep(0.6, 1.0, h));

    // Warm shift with valence
    color = mix(color, color * vec3(1.2, 0.9, 0.7), uValence * 0.5);

    // Wireframe glow on edges
    float edgeGlow = 0.3 + uRms * 0.5;
    color *= edgeGlow + 0.7;

    // Beat flash
    color += uBeatIntensity * 0.3;

    // Fog fade to black
    color = mix(color, vec3(0.0), vFog);

    // Grid line glow
    vec2 grid = abs(fract(vUv * float(${GRID_SIZE}) * 0.25) - 0.5);
    float gridLine = smoothstep(0.02, 0.0, min(grid.x, grid.y));
    color += gridLine * 0.15 * (1.0 - vFog);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export default function TerrainFlow() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uRms: { value: 0 },
      uBeatIntensity: { value: 0 },
      uEnergy: { value: 0 },
      uValence: { value: 0.5 },
    }),
    []
  );

  const spring = useRef({ current: 0, velocity: 0 });

  useFrame((state, delta) => {
    const features = useAudioStore.getState().engine.getFeatures();

    if (features.isBeat) {
      spring.current.velocity += features.beatIntensity * 2;
    }
    spring.current.velocity += (0 - spring.current.current) * 4 * delta;
    spring.current.velocity *= 0.9;
    spring.current.current += spring.current.velocity;

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uBass.value = features.bassSmooth;
      materialRef.current.uniforms.uMid.value = features.midSmooth;
      materialRef.current.uniforms.uTreble.value = features.trebleSmooth;
      materialRef.current.uniforms.uRms.value = features.rmsSmooth;
      materialRef.current.uniforms.uBeatIntensity.value = Math.max(0, spring.current.current);
      materialRef.current.uniforms.uEnergy.value = features.energy;
      materialRef.current.uniforms.uValence.value = features.valence;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI * 0.35, 0, 0]} position={[0, -2, 0]}>
      <planeGeometry args={[GRID_SIZE * GRID_SPACING, GRID_SIZE * GRID_SPACING, GRID_SIZE, GRID_SIZE]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        wireframe
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
