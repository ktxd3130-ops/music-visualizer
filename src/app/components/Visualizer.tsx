"use client";

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, ChromaticAberration, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import ParticleNebula from "./ParticleNebula";
import TerrainFlow from "./TerrainFlow";
import WaveformRibbon from "./WaveformRibbon";
import { useAudioStore } from "@/stores/audioStore";
import { useVisualStore } from "@/stores/visualStore";

function CameraRig() {
  const angle = useRef(0);

  useFrame((state, delta) => {
    const features = useAudioStore.getState().engine.getFeatures();
    const mode = useVisualStore.getState().mode;
    const camera = state.camera;

    angle.current += delta * 0.05 * (1 + features.energy * 0.5);

    if (mode === "terrain") {
      camera.position.x += (Math.sin(angle.current * 0.3) * 2 - camera.position.x) * delta * 0.3;
      camera.position.y += (3 + features.rmsSmooth * 1 - camera.position.y) * delta * 0.5;
      camera.position.z += (6 - camera.position.z) * delta * 0.3;
      camera.lookAt(0, 0, -5);
    } else if (mode === "ribbon") {
      const dist = 6 - features.rmsSmooth;
      camera.position.x += (Math.cos(angle.current * 0.5) * dist - camera.position.x) * delta * 0.5;
      camera.position.y += (Math.sin(angle.current * 0.3) * 2 - camera.position.y) * delta * 0.5;
      camera.position.z += (Math.sin(angle.current * 0.5) * dist - camera.position.z) * delta * 0.5;
      camera.lookAt(0, 0, 0);
    } else {
      // Nebula: slow wide orbit
      const distance = 8 - features.rmsSmooth * 2;
      const height = 2 + Math.sin(angle.current * 0.3) * 1.5;
      camera.position.x += (Math.cos(angle.current) * distance - camera.position.x) * delta * 0.5;
      camera.position.z += (Math.sin(angle.current) * distance - camera.position.z) * delta * 0.5;
      camera.position.y += (height - camera.position.y) * delta * 0.5;
      camera.lookAt(0, 0, 0);
    }

    // Subtle beat shake
    if (features.isBeat) {
      camera.position.y += (Math.random() - 0.5) * features.beatIntensity * 0.08;
    }
  });

  return null;
}

function PostProcessingEffects() {
  const offsetRef = useRef(new THREE.Vector2(0, 0));

  useFrame(() => {
    const features = useAudioStore.getState().engine.getFeatures();
    const caAmount = features.isBeat ? 0.003 * features.beatIntensity : 0.0005;
    offsetRef.current.set(caAmount, caAmount);
  });

  return (
    <EffectComposer>
      <Bloom
        intensity={1.5}
        luminanceThreshold={0.2}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={offsetRef.current}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette
        offset={0.3}
        darkness={0.7}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}

function ActiveVisualization() {
  const mode = useVisualStore((s) => s.mode);

  switch (mode) {
    case "terrain":
      return <TerrainFlow />;
    case "ribbon":
      return <WaveformRibbon />;
    case "nebula":
    default:
      return <ParticleNebula />;
  }
}

// R3F Canvas — used for nebula, terrain, ribbon modes only
// Face mode uses its own vanilla Three.js canvas (see AIFace.tsx)
export default function Visualizer() {
  return (
    <Canvas
      camera={{ position: [0, 2, 8], fov: 60, near: 0.1, far: 100 }}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      }}
      style={{ background: "#000" }}
      dpr={[1, 2]}
    >
      <color attach="background" args={["#000000"]} />
      <fog attach="fog" args={["#000000", 10, 25]} />
      <CameraRig />
      <ActiveVisualization />
      <PostProcessingEffects />
    </Canvas>
  );
}
