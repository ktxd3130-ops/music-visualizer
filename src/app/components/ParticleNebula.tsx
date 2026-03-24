"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAudioStore } from "@/stores/audioStore";

const PARTICLE_COUNT = 80000;

const vertexShader = `
  attribute float aPhase;
  attribute float aSize;
  attribute vec3 aBasePosition;

  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uRms;
  uniform float uBeatIntensity;
  uniform float uEnergy;

  varying float vDistance;
  varying float vPhase;
  varying float vBrightness;

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
    vec3 pos = aBasePosition;
    float dist = length(pos);

    // Slow organic drift
    float driftSpeed = 0.15;
    vec3 drift = vec3(
      snoise(pos * 0.3 + uTime * driftSpeed),
      snoise(pos * 0.3 + uTime * driftSpeed + 100.0),
      snoise(pos * 0.3 + uTime * driftSpeed + 200.0)
    ) * 0.5;

    // Bass expansion — pushes particles outward
    float bassExpand = 1.0 + uBass * 0.8;

    // Treble shimmer — high frequency displacement
    float shimmer = snoise(pos * 2.0 + uTime * 2.0) * uTreble * 0.3;

    // Beat shockwave — ripples outward from center
    float beatWave = sin(dist * 3.0 - uTime * 8.0) * uBeatIntensity * 0.5;

    // RMS breathing — more dramatic at idle
    float idleBreath = sin(uTime * 0.4 + aPhase * 0.5) * 0.15 + sin(uTime * 0.7 + aPhase) * 0.08;
    float breathe = 1.0 + idleBreath * (1.0 - uRms) + uRms * 0.25;

    vec3 finalPos = pos * bassExpand * breathe + drift + normalize(pos) * (shimmer + beatWave);

    // Rotation
    float angle = uTime * 0.1 + uEnergy * 0.3;
    float cosA = cos(angle);
    float sinA = sin(angle);
    finalPos.xz = mat2(cosA, -sinA, sinA, cosA) * finalPos.xz;

    vec4 mvPos = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // Size: closer = bigger, louder = bigger
    float baseSize = aSize * (3.0 + uRms * 4.0 + uBeatIntensity * 3.0);
    gl_PointSize = baseSize * (400.0 / -mvPos.z);

    vDistance = dist / 5.0;
    vPhase = aPhase;
    vBrightness = 0.6 + uRms * 0.5 + uBeatIntensity * 0.5;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uValence;
  uniform float uEnergy;
  uniform float uBeatIntensity;

  varying float vDistance;
  varying float vPhase;
  varying float vBrightness;

  void main() {
    // Soft circle
    vec2 center = gl_PointCoord - 0.5;
    float d = length(center);
    if (d > 0.5) discard;

    float alpha = smoothstep(0.5, 0.1, d);

    // Color palette based on distance and valence
    // Warm palette (high valence): orange -> pink -> white
    vec3 warmInner = vec3(1.0, 0.9, 0.7);
    vec3 warmOuter = vec3(0.9, 0.3, 0.5);

    // Cool palette (low valence): cyan -> blue -> purple
    vec3 coolInner = vec3(0.6, 0.9, 1.0);
    vec3 coolOuter = vec3(0.3, 0.2, 0.8);

    vec3 inner = mix(coolInner, warmInner, uValence);
    vec3 outer = mix(coolOuter, warmOuter, uValence);

    vec3 color = mix(inner, outer, vDistance);

    // Brightness boost on beats
    color *= vBrightness + 0.3;

    // Subtle color shift over time
    color += 0.05 * sin(uTime * 0.3 + vPhase * 6.28);

    // Core glow (brighter in center)
    float glow = smoothstep(0.4, 0.0, d) * 0.5;
    color += glow;

    gl_FragColor = vec4(color, alpha * (0.6 + vBrightness * 0.4));
  }
`;

export default function ParticleNebula() {
  const meshRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const { positions, phases, sizes } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const phases = new Float32Array(PARTICLE_COUNT);
    const sizes = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Distribute in a sphere with density falloff
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.6) * 5; // Power curve for center density

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = 0.5 + Math.random() * 1.5;
    }

    return { positions, phases, sizes };
  }, []);

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

  // Spring physics for beat intensity
  const spring = useRef({ current: 0, velocity: 0 });

  useFrame((state, delta) => {
    const features = useAudioStore.getState().engine.getFeatures();

    // Update spring for beat
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
      materialRef.current.uniforms.uBeatIntensity.value = Math.max(
        0,
        spring.current.current
      );
      materialRef.current.uniforms.uEnergy.value = features.energy;
      materialRef.current.uniforms.uValence.value = features.valence;
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-aBasePosition"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-aPhase"
          args={[phases, 1]}
        />
        <bufferAttribute
          attach="attributes-aSize"
          args={[sizes, 1]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
