"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAudioStore } from "@/stores/audioStore";

const RIBBON_SEGMENTS = 256;
const RIBBON_WIDTH = 0.3;

export default function WaveformRibbon() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  // Store waveform history for smooth trailing effect
  const waveHistory = useRef<Float32Array>(new Float32Array(RIBBON_SEGMENTS));
  const smoothWave = useRef<Float32Array>(new Float32Array(RIBBON_SEGMENTS));

  const { positions, uvs, indices } = useMemo(() => {
    // Create a ribbon strip (two vertices per segment — top and bottom)
    const positions = new Float32Array(RIBBON_SEGMENTS * 2 * 3);
    const uvs = new Float32Array(RIBBON_SEGMENTS * 2 * 2);
    const indices: number[] = [];

    for (let i = 0; i < RIBBON_SEGMENTS; i++) {
      const t = i / (RIBBON_SEGMENTS - 1);
      const angle = t * Math.PI * 4; // 2 full twists
      const x = (t - 0.5) * 12;

      // Top vertex
      positions[i * 6] = x;
      positions[i * 6 + 1] = 0;
      positions[i * 6 + 2] = 0;

      // Bottom vertex
      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = 0;
      positions[i * 6 + 5] = 0;

      // UVs
      uvs[i * 4] = t;
      uvs[i * 4 + 1] = 1;
      uvs[i * 4 + 2] = t;
      uvs[i * 4 + 3] = 0;

      // Triangles
      if (i < RIBBON_SEGMENTS - 1) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = (i + 1) * 2;
        const d = (i + 1) * 2 + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    return { positions, uvs, indices: new Uint16Array(indices) };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRms: { value: 0 },
      uBass: { value: 0 },
      uTreble: { value: 0 },
      uBeatIntensity: { value: 0 },
      uValence: { value: 0.5 },
      uEnergy: { value: 0 },
    }),
    []
  );

  const spring = useRef({ current: 0, velocity: 0 });

  useFrame((state, delta) => {
    const features = useAudioStore.getState().engine.getFeatures();

    if (features.isBeat) {
      spring.current.velocity += features.beatIntensity * 1.5;
    }
    spring.current.velocity += (0 - spring.current.current) * 3 * delta;
    spring.current.velocity *= 0.92;
    spring.current.current += spring.current.velocity;

    // Sample waveform data into ribbon segments
    const waveData = features.timeDomainData;
    const step = Math.floor(waveData.length / RIBBON_SEGMENTS);

    for (let i = 0; i < RIBBON_SEGMENTS; i++) {
      const sampleIndex = Math.min(i * step, waveData.length - 1);
      const raw = waveData[sampleIndex] || 0;
      // Smooth each point
      smoothWave.current[i] = smoothWave.current[i] * 0.7 + raw * 0.3;
    }

    // Update geometry positions
    if (geometryRef.current) {
      const posAttr = geometryRef.current.getAttribute("position") as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;
      const time = state.clock.elapsedTime;

      for (let i = 0; i < RIBBON_SEGMENTS; i++) {
        const t = i / (RIBBON_SEGMENTS - 1);
        const x = (t - 0.5) * 12;

        // Twist angle
        const twist = t * Math.PI * 2 + time * 0.3;

        // Wave height from audio
        const waveHeight = smoothWave.current[i] * 3 * (1 + features.rmsSmooth * 2);

        // Idle organic motion
        const idleWave = Math.sin(t * 6 + time * 0.5) * 0.3 +
          Math.sin(t * 10 + time * 0.8) * 0.15;

        const height = waveHeight + idleWave * (1 - features.rmsSmooth);

        // Ribbon width pulses with RMS
        const width = RIBBON_WIDTH * (1 + features.rmsSmooth * 1.5 + Math.max(0, spring.current.current) * 0.5);

        // 3D spiral path
        const pathY = Math.sin(t * Math.PI * 2 + time * 0.2) * 1.5;
        const pathZ = Math.cos(t * Math.PI * 2 + time * 0.2) * 1.5;

        // Top vertex
        posArray[i * 6] = x;
        posArray[i * 6 + 1] = pathY + height + Math.cos(twist) * width;
        posArray[i * 6 + 2] = pathZ + Math.sin(twist) * width;

        // Bottom vertex
        posArray[i * 6 + 3] = x;
        posArray[i * 6 + 4] = pathY + height - Math.cos(twist) * width;
        posArray[i * 6 + 5] = pathZ - Math.sin(twist) * width;
      }

      posAttr.needsUpdate = true;
    }

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uRms.value = features.rmsSmooth;
      materialRef.current.uniforms.uBass.value = features.bassSmooth;
      materialRef.current.uniforms.uTreble.value = features.trebleSmooth;
      materialRef.current.uniforms.uBeatIntensity.value = Math.max(0, spring.current.current);
      materialRef.current.uniforms.uValence.value = features.valence;
      materialRef.current.uniforms.uEnergy.value = features.energy;
    }
  });

  const ribbonVertexShader = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vUv = uv;
      vNormal = normalMatrix * normal;
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const ribbonFragmentShader = `
    uniform float uTime;
    uniform float uRms;
    uniform float uBass;
    uniform float uTreble;
    uniform float uBeatIntensity;
    uniform float uValence;
    uniform float uEnergy;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      // Color gradient along ribbon
      vec3 color1 = vec3(0.2, 0.5, 1.0);   // Blue
      vec3 color2 = vec3(0.8, 0.2, 0.9);   // Purple
      vec3 color3 = vec3(1.0, 0.4, 0.6);   // Pink

      // Shift palette with valence
      color1 = mix(color1, vec3(0.3, 0.8, 0.9), uValence);
      color3 = mix(color3, vec3(1.0, 0.8, 0.3), uValence);

      float t = vUv.x;
      vec3 color = mix(color1, color2, smoothstep(0.0, 0.5, t));
      color = mix(color, color3, smoothstep(0.5, 1.0, t));

      // Fresnel-like edge glow
      float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
      float fresnel = pow(1.0 - edge, 2.0);
      color += fresnel * 0.5;

      // Brightness
      float brightness = 0.6 + uRms * 0.4 + uBeatIntensity * 0.3;
      color *= brightness;

      // Pulsing glow
      color += 0.1 * sin(t * 20.0 + uTime * 2.0) * uEnergy;

      // Alpha: solid core, transparent edges
      float alpha = smoothstep(0.0, 0.3, edge) * (0.7 + uRms * 0.3);

      gl_FragColor = vec4(color, alpha);
    }
  `;

  return (
    <mesh ref={meshRef}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-uv"
          args={[uvs, 2]}
        />
        <bufferAttribute
          attach="index"
          args={[indices, 1]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={ribbonVertexShader}
        fragmentShader={ribbonFragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
