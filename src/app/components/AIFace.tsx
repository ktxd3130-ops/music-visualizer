"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { useAudioStore } from "@/stores/audioStore";

// ============================================================
// VANILLA THREE.JS AI FACE — Ready Player Me avatar
// Viseme-driven lip sync + audio-reactive expressions
// ============================================================

const PARTICLE_COUNT = 4000;

// Viseme morph target names (Ready Player Me / Oculus standard)
const VISEME_NAMES = [
  "viseme_sil", "viseme_PP", "viseme_FF", "viseme_TH", "viseme_DD",
  "viseme_kk", "viseme_CH", "viseme_SS", "viseme_nn", "viseme_RR",
  "viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U",
];

// Expression morph target names
const EXPRESSION_NAMES = [
  "jawOpen", "mouthSmileLeft", "mouthSmileRight", "mouthFunnel",
  "mouthPucker", "eyeBlinkLeft", "eyeBlinkRight", "eyeWideLeft",
  "eyeWideRight", "browInnerUp", "browDownLeft", "browDownRight",
  "browOuterUpLeft", "browOuterUpRight", "cheekPuff",
];

export default function AIFace() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // =================== SCENE SETUP ===================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.04);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    // Camera framing: head + upper shoulders of RPM avatar
    camera.position.set(0, 1.58, 0.65);
    camera.lookAt(0, 1.52, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // =================== LIGHTING ===================
    // Key light — cool blue
    const keyLight = new THREE.DirectionalLight(0x6699ff, 2.5);
    keyLight.position.set(2, 3, 4);
    scene.add(keyLight);

    // Fill light — softer blue
    const fillLight = new THREE.DirectionalLight(0x3355aa, 1.0);
    fillLight.position.set(-2, 1, 2);
    scene.add(fillLight);

    // Rim light — bright cyan from behind
    const rimLight = new THREE.DirectionalLight(0x00ccff, 2.0);
    rimLight.position.set(0, 1, -3);
    scene.add(rimLight);

    // Subtle ambient
    const ambient = new THREE.AmbientLight(0x112244, 0.5);
    scene.add(ambient);

    // =================== POST-PROCESSING ===================
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.8,   // strength
      0.4,   // radius
      0.3    // threshold
    );
    composer.addPass(bloomPass);

    // =================== AMBIENT PARTICLES ===================
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    const particleSpeeds = new Float32Array(PARTICLE_COUNT);
    const particlePhases = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.5 + Math.random() * 4;
      particlePositions[i * 3] = Math.cos(angle) * radius;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 5;
      particlePositions[i * 3 + 2] = Math.sin(angle) * radius * 0.4 - 1;
      particleSpeeds[i] = 0.02 + Math.random() * 0.04;
      particlePhases[i] = Math.random() * Math.PI * 2;
    }

    particleGeo.setAttribute("position", new THREE.Float32BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x4488ff,
      size: 0.015,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // =================== AVATAR STATE ===================
    let headMesh: THREE.SkinnedMesh | null = null;
    const morphIndices: Record<string, number> = {};
    const currentMorphValues: Record<string, number> = {};
    const targetMorphValues: Record<string, number> = {};

    // Animation state
    let beatSpring = 0;
    let beatVelocity = 0;
    let blinkTimer = 3 + Math.random() * 4;
    let blinkPhase = 0;
    let cameraAngle = 0;

    // Frequency band to viseme mapping weights
    // Maps 6 frequency bands to 15 visemes
    const bandToViseme = {
      // Low frequencies → jaw/open mouth shapes
      lowBass:  { viseme_aa: 0.6, viseme_O: 0.4 },
      bass:     { viseme_aa: 0.4, viseme_O: 0.5, viseme_U: 0.3 },
      // Low-mid → round/back mouth shapes
      lowMid:   { viseme_O: 0.5, viseme_U: 0.4, viseme_RR: 0.2 },
      // Mid → forward mouth shapes
      mid:      { viseme_E: 0.4, viseme_I: 0.3, viseme_nn: 0.3 },
      // High-mid → sibilant/fricative shapes
      highMid:  { viseme_SS: 0.5, viseme_CH: 0.3, viseme_FF: 0.2 },
      // High → thin/tight mouth shapes
      high:     { viseme_SS: 0.4, viseme_TH: 0.3, viseme_FF: 0.3 },
    };

    // =================== LOAD AVATAR ===================
    const loader = new GLTFLoader();

    loader.load("/avatar.glb", (gltf) => {
      const model = gltf.scene;

      // Find the head mesh with morph targets
      model.traverse((child) => {
        if (child instanceof THREE.SkinnedMesh || child instanceof THREE.Mesh) {
          const mesh = child as THREE.SkinnedMesh;

          if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
            const dict = mesh.morphTargetDictionary;
            const targetCount = Object.keys(dict).length;

            // Find the mesh with the most morph targets (the head)
            if (!headMesh || targetCount > Object.keys(morphIndices).length) {
              headMesh = mesh;

              // Map all viseme and expression targets
              for (const name of [...VISEME_NAMES, ...EXPRESSION_NAMES]) {
                if (dict[name] !== undefined) {
                  morphIndices[name] = dict[name];
                  currentMorphValues[name] = 0;
                  targetMorphValues[name] = 0;
                }
              }

              console.log(
                `Avatar loaded: ${targetCount} morph targets, ` +
                `${Object.keys(morphIndices).length} mapped (visemes + expressions)`
              );
              console.log("Available targets:", Object.keys(dict).join(", "));
            }
          }

          // Apply a blue-tinted material override for digital look
          if (mesh.material) {
            const origMat = mesh.material as THREE.MeshStandardMaterial;
            const newMat = new THREE.MeshStandardMaterial({
              color: new THREE.Color(0.15, 0.3, 0.7),
              metalness: 0.3,
              roughness: 0.5,
              emissive: new THREE.Color(0.02, 0.06, 0.15),
              emissiveIntensity: 1.0,
              transparent: true,
              opacity: 0.92,
            });

            // If original has a normal map, keep it
            if (origMat.normalMap) {
              newMat.normalMap = origMat.normalMap;
              newMat.normalScale = origMat.normalScale;
            }

            mesh.material = newMat;
          }

          mesh.frustumCulled = false;
        }
      });

      // RPM avatars: full-body, ~1.7m tall, head at ~y=1.5
      // Keep at origin, camera will frame the head
      model.position.set(0, 0, 0);
      model.scale.setScalar(1.0);

      scene.add(model);
    }, undefined, (err) => {
      console.error("Failed to load avatar:", err);
    });

    // =================== ANIMATION LOOP ===================
    const clock = new THREE.Clock();
    let animId = 0;

    function animate() {
      animId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05); // cap delta
      const elapsed = clock.elapsedTime;

      // Get audio features from the existing audio engine
      const features = useAudioStore.getState().engine.getFeatures();
      const { rmsSmooth, bassSmooth, midSmooth, trebleSmooth, isBeat, beatIntensity, energy, frequencyData } = features;

      // ---- Beat spring physics ----
      if (isBeat) beatVelocity += beatIntensity * 0.4;
      beatVelocity += (0 - beatSpring) * 6 * delta;
      beatVelocity *= 0.88;
      beatSpring += beatVelocity * delta * 50;
      beatSpring = Math.max(0, beatSpring);

      // ---- Blink ----
      blinkTimer -= delta;
      if (blinkTimer <= 0) {
        blinkPhase = 1.0;
        blinkTimer = 2.5 + Math.random() * 5;
      }
      if (blinkPhase > 0) blinkPhase -= delta * 8;

      // ---- Compute viseme targets from frequency data ----
      if (headMesh && headMesh.morphTargetInfluences) {
        const inf = headMesh.morphTargetInfluences;
        const numBins = frequencyData.length;

        // Reset all viseme targets
        for (const name of VISEME_NAMES) {
          targetMorphValues[name] = 0;
        }

        if (rmsSmooth > 0.02) {
          // Split frequency data into 6 bands
          const binCount = numBins;
          const bandSize = Math.floor(binCount / 6);

          const bands = [
            avgBand(frequencyData, 0, bandSize),                    // lowBass
            avgBand(frequencyData, bandSize, bandSize * 2),          // bass
            avgBand(frequencyData, bandSize * 2, bandSize * 3),      // lowMid
            avgBand(frequencyData, bandSize * 3, bandSize * 4),      // mid
            avgBand(frequencyData, bandSize * 4, bandSize * 5),      // highMid
            avgBand(frequencyData, bandSize * 5, binCount),          // high
          ];

          const bandNames = ["lowBass", "bass", "lowMid", "mid", "highMid", "high"] as const;

          // Map each band to its viseme contributions
          for (let b = 0; b < 6; b++) {
            const bandEnergy = bands[b];
            const mapping = bandToViseme[bandNames[b]];
            for (const [viseme, weight] of Object.entries(mapping)) {
              targetMorphValues[viseme] = Math.min(1,
                (targetMorphValues[viseme] || 0) + bandEnergy * weight * 2.5
              );
            }
          }

          // Scale all visemes by overall volume so quiet passages don't move the mouth
          const volumeScale = Math.pow(rmsSmooth, 0.5) * 2;
          for (const name of VISEME_NAMES) {
            targetMorphValues[name] *= Math.min(1, volumeScale);
          }

          // Silence viseme = inverse of all others
          const totalViseme = VISEME_NAMES.slice(1).reduce(
            (sum, n) => sum + (targetMorphValues[n] || 0), 0
          );
          targetMorphValues["viseme_sil"] = Math.max(0, 1 - totalViseme * 0.5);
        } else {
          targetMorphValues["viseme_sil"] = 1;
        }

        // ---- Expression targets ----
        // Jaw open — driven by RMS
        targetMorphValues["jawOpen"] = Math.pow(rmsSmooth, 0.6) * 0.8;

        // Smile on beats
        targetMorphValues["mouthSmileLeft"] = beatSpring * 0.35;
        targetMorphValues["mouthSmileRight"] = beatSpring * 0.35;

        // Funnel on mid energy
        targetMorphValues["mouthFunnel"] = midSmooth * 0.25;

        // Blink
        const blinkVal = blinkPhase > 0 ? Math.sin(blinkPhase * Math.PI) : 0;
        targetMorphValues["eyeBlinkLeft"] = blinkVal;
        targetMorphValues["eyeBlinkRight"] = blinkVal;

        // Wide eyes on loud hits
        targetMorphValues["eyeWideLeft"] = beatSpring * 0.4;
        targetMorphValues["eyeWideRight"] = beatSpring * 0.4;

        // Brow raise on beats
        targetMorphValues["browInnerUp"] = beatSpring * 0.3;
        targetMorphValues["browOuterUpLeft"] = rmsSmooth * 0.2;
        targetMorphValues["browOuterUpRight"] = rmsSmooth * 0.2;

        // Cheek puff on bass
        targetMorphValues["cheekPuff"] = bassSmooth * 0.15;

        // ---- Smooth interpolation & apply ----
        for (const [name, idx] of Object.entries(morphIndices)) {
          const target = targetMorphValues[name] || 0;
          const current = currentMorphValues[name] || 0;

          // Visemes interpolate faster for snappy lip sync
          const isViseme = name.startsWith("viseme_");
          const lerpSpeed = isViseme ? 18 : 10;

          currentMorphValues[name] = current + (target - current) * delta * lerpSpeed;
          inf[idx] = Math.max(0, Math.min(1, currentMorphValues[name]));
        }
      }

      // ---- Camera subtle movement around face ----
      cameraAngle += delta * 0.15 * (1 + energy * 0.3);
      camera.position.x = Math.sin(cameraAngle * 0.4) * 0.04;
      camera.position.y = 1.58 + Math.sin(cameraAngle * 0.3) * 0.02;
      camera.position.z = 0.65 - rmsSmooth * 0.03;
      camera.lookAt(0, 1.52, 0);

      // Beat shake
      if (isBeat) {
        camera.position.y += (Math.random() - 0.5) * beatIntensity * 0.01;
      }

      // ---- Animate particles ----
      const posAttr = particleGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const phase = particlePhases[i];
        const speed = particleSpeeds[i];
        const ix = i * 3;

        // Slow orbit
        const angle = elapsed * speed + phase;
        const radius = Math.sqrt(
          particlePositions[ix] * particlePositions[ix] +
          particlePositions[ix + 2] * particlePositions[ix + 2]
        );

        posAttr.array[ix] = Math.cos(angle) * radius;
        posAttr.array[ix + 1] = particlePositions[ix + 1] + Math.sin(elapsed * 0.1 + phase * 5) * 0.3;
        posAttr.array[ix + 2] = Math.sin(angle) * radius * 0.4 - 1;
      }
      posAttr.needsUpdate = true;

      // Particle brightness responds to audio
      particleMat.opacity = 0.2 + rmsSmooth * 0.3 + beatSpring * 0.1;

      // ---- Bloom reacts to audio ----
      bloomPass.strength = 0.6 + beatSpring * 0.4;

      // ---- Render ----
      composer.render();
    }

    animate();

    // =================== RESIZE HANDLER ===================
    function handleResize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    }
    window.addEventListener("resize", handleResize);

    // =================== CLEANUP ===================
    cleanupRef.current = () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      composer.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material.dispose();
            }
          }
        }
      });
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };

    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    />
  );
}

// =================== HELPERS ===================
function avgBand(data: Float32Array, start: number, end: number): number {
  let sum = 0;
  const count = Math.max(1, end - start);
  for (let i = start; i < end && i < data.length; i++) {
    sum += data[i];
  }
  return sum / count;
}
