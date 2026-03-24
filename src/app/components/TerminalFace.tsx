"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { useTerminalStore, TerminalState } from "@/stores/terminalStore";

// ============================================================
// TERMINAL FACE — Three.js avatar driven by terminal states
// IDLE: gentle breathing, ambient drift
// LISTENING: tightens, reacts to mic input
// THINKING: swirling glow, processing animation
// SPEAKING: lip-sync driven by TTS audio levels
// ERROR: scatter + color shift
// ============================================================

const PARTICLE_COUNT = 4000;

// Viseme morph target names (Ready Player Me / Oculus standard)
const VISEME_NAMES = [
  "viseme_sil", "viseme_PP", "viseme_FF", "viseme_TH", "viseme_DD",
  "viseme_kk", "viseme_CH", "viseme_SS", "viseme_nn", "viseme_RR",
  "viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U",
];

const EXPRESSION_NAMES = [
  "jawOpen", "mouthSmileLeft", "mouthSmileRight", "mouthFunnel",
  "mouthPucker", "eyeBlinkLeft", "eyeBlinkRight", "eyeWideLeft",
  "eyeWideRight", "browInnerUp", "browDownLeft", "browDownRight",
  "browOuterUpLeft", "browOuterUpRight", "cheekPuff",
];

// State-dependent color palettes
const STATE_COLORS: Record<TerminalState, {
  primary: THREE.Color;
  emissive: THREE.Color;
  particleColor: number;
  bloomStrength: number;
  lightIntensity: number;
}> = {
  idle: {
    primary: new THREE.Color(0.12, 0.25, 0.6),
    emissive: new THREE.Color(0.02, 0.04, 0.12),
    particleColor: 0x3366aa,
    bloomStrength: 0.6,
    lightIntensity: 2.0,
  },
  listening: {
    primary: new THREE.Color(0.15, 0.4, 0.7),
    emissive: new THREE.Color(0.03, 0.08, 0.18),
    particleColor: 0x44aaff,
    bloomStrength: 0.8,
    lightIntensity: 2.8,
  },
  thinking: {
    primary: new THREE.Color(0.3, 0.15, 0.6),
    emissive: new THREE.Color(0.06, 0.03, 0.15),
    particleColor: 0x8844ff,
    bloomStrength: 1.0,
    lightIntensity: 2.5,
  },
  speaking: {
    primary: new THREE.Color(0.2, 0.35, 0.65),
    emissive: new THREE.Color(0.04, 0.06, 0.15),
    particleColor: 0x5588dd,
    bloomStrength: 0.9,
    lightIntensity: 3.0,
  },
  error: {
    primary: new THREE.Color(0.5, 0.1, 0.1),
    emissive: new THREE.Color(0.1, 0.02, 0.02),
    particleColor: 0xff4444,
    bloomStrength: 1.2,
    lightIntensity: 2.0,
  },
};

export default function TerminalFace() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // =================== SCENE SETUP ===================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.035);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
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
    const keyLight = new THREE.DirectionalLight(0x6699ff, 2.5);
    keyLight.position.set(2, 3, 4);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x3355aa, 1.0);
    fillLight.position.set(-2, 1, 2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x00ccff, 2.0);
    rimLight.position.set(0, 1, -3);
    scene.add(rimLight);

    const ambient = new THREE.AmbientLight(0x112244, 0.5);
    scene.add(ambient);

    // =================== POST-PROCESSING ===================
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.6, 0.4, 0.3
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

    particleGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(particlePositions, 3)
    );
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
    let avatarMaterials: THREE.MeshStandardMaterial[] = [];
    const morphIndices: Record<string, number> = {};
    const currentMorphValues: Record<string, number> = {};
    const targetMorphValues: Record<string, number> = {};

    let beatSpring = 0;
    let beatVelocity = 0;
    let blinkTimer = 3 + Math.random() * 4;
    let blinkPhase = 0;
    let cameraAngle = 0;

    // Smooth state transition
    let currentColorState = { ...STATE_COLORS.idle };
    const targetColorState = { ...STATE_COLORS.idle };

    // =================== LOAD AVATAR ===================
    const loader = new GLTFLoader();

    loader.load("/avatar.glb", (gltf) => {
      const model = gltf.scene;

      model.traverse((child) => {
        if (child instanceof THREE.SkinnedMesh || child instanceof THREE.Mesh) {
          const mesh = child as THREE.SkinnedMesh;

          if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
            const dict = mesh.morphTargetDictionary;
            const targetCount = Object.keys(dict).length;

            if (!headMesh || targetCount > Object.keys(morphIndices).length) {
              headMesh = mesh;
              for (const name of [...VISEME_NAMES, ...EXPRESSION_NAMES]) {
                if (dict[name] !== undefined) {
                  morphIndices[name] = dict[name];
                  currentMorphValues[name] = 0;
                  targetMorphValues[name] = 0;
                }
              }
            }
          }

          if (mesh.material) {
            const newMat = new THREE.MeshStandardMaterial({
              color: STATE_COLORS.idle.primary.clone(),
              metalness: 0.3,
              roughness: 0.5,
              emissive: STATE_COLORS.idle.emissive.clone(),
              emissiveIntensity: 1.0,
              transparent: true,
              opacity: 0.92,
            });

            const origMat = mesh.material as THREE.MeshStandardMaterial;
            if (origMat.normalMap) {
              newMat.normalMap = origMat.normalMap;
              newMat.normalScale = origMat.normalScale;
            }

            mesh.material = newMat;
            avatarMaterials.push(newMat);
          }

          mesh.frustumCulled = false;
        }
      });

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
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;

      // Read terminal state
      const store = useTerminalStore.getState();
      const terminalState = store.state;
      const isAmbient = store.isAmbient;
      const inputLevel = store.inputAudioLevel;
      const outputLevel = store.outputAudioLevel;

      // The "audio level" the face responds to depends on state
      const audioLevel =
        terminalState === "listening"
          ? inputLevel
          : terminalState === "speaking"
          ? outputLevel
          : 0;

      // ---- State color transitions ----
      const targetColors = STATE_COLORS[terminalState] || STATE_COLORS.idle;
      const colorLerp = delta * 2; // smooth transition speed

      // Lerp material colors
      for (const mat of avatarMaterials) {
        mat.color.lerp(targetColors.primary, colorLerp);
        mat.emissive.lerp(targetColors.emissive, colorLerp);
      }

      // Lerp particle color
      particleMat.color.lerp(
        new THREE.Color(targetColors.particleColor),
        colorLerp
      );

      // Lerp bloom
      bloomPass.strength +=
        (targetColors.bloomStrength - bloomPass.strength) * colorLerp;

      // Lerp key light
      keyLight.intensity +=
        (targetColors.lightIntensity - keyLight.intensity) * colorLerp;

      // ---- Beat spring (used in speaking state) ----
      if (terminalState === "speaking" && audioLevel > 0.3) {
        beatVelocity += audioLevel * 0.3;
      }
      beatVelocity += (0 - beatSpring) * 6 * delta;
      beatVelocity *= 0.88;
      beatSpring += beatVelocity * delta * 50;
      beatSpring = Math.max(0, beatSpring);

      // ---- Blink ----
      blinkTimer -= delta;
      if (blinkTimer <= 0) {
        blinkPhase = 1.0;
        // Blink more frequently when listening (attentive)
        blinkTimer =
          terminalState === "listening"
            ? 1.5 + Math.random() * 3
            : 2.5 + Math.random() * 5;
      }
      if (blinkPhase > 0) blinkPhase -= delta * 8;

      // ---- Morph target updates ----
      if (headMesh && headMesh.morphTargetInfluences) {
        const inf = headMesh.morphTargetInfluences;

        // Reset viseme targets
        for (const name of VISEME_NAMES) {
          targetMorphValues[name] = 0;
        }

        // === STATE-SPECIFIC FACE BEHAVIOR ===

        if (terminalState === "idle" || terminalState === "error") {
          // Idle: slight mouth movement, relaxed
          targetMorphValues["viseme_sil"] = 1;
          targetMorphValues["jawOpen"] = 0;
          targetMorphValues["mouthSmileLeft"] =
            0.1 + Math.sin(elapsed * 0.2) * 0.05;
          targetMorphValues["mouthSmileRight"] =
            0.1 + Math.sin(elapsed * 0.2) * 0.05;

          // Ambient mode: even more relaxed
          if (isAmbient) {
            targetMorphValues["mouthSmileLeft"] = 0.05;
            targetMorphValues["mouthSmileRight"] = 0.05;
          }
        }

        if (terminalState === "listening") {
          // Listening: face tightens, reacts to mic input
          targetMorphValues["viseme_sil"] = 1 - inputLevel * 0.3;
          targetMorphValues["jawOpen"] = 0;
          targetMorphValues["eyeWideLeft"] = 0.1 + inputLevel * 0.2;
          targetMorphValues["eyeWideRight"] = 0.1 + inputLevel * 0.2;
          targetMorphValues["browInnerUp"] = 0.15 + inputLevel * 0.1;
          // Slight focus expression
          targetMorphValues["mouthPucker"] = 0.05 + inputLevel * 0.05;
        }

        if (terminalState === "thinking") {
          // Thinking: contemplative expression, subtle movement
          const thinkCycle = Math.sin(elapsed * 1.5);
          targetMorphValues["viseme_sil"] = 1;
          targetMorphValues["jawOpen"] = 0;
          targetMorphValues["browInnerUp"] = 0.2 + thinkCycle * 0.1;
          targetMorphValues["browDownLeft"] = 0.1 - thinkCycle * 0.05;
          targetMorphValues["browDownRight"] = 0.1 - thinkCycle * 0.05;
          targetMorphValues["mouthPucker"] = 0.1 + thinkCycle * 0.05;
          targetMorphValues["eyeWideLeft"] = 0;
          targetMorphValues["eyeWideRight"] = 0;
        }

        if (terminalState === "speaking") {
          // Speaking: lip-sync driven by audio output level
          const level = outputLevel;

          if (level > 0.05) {
            // Simplified frequency-based viseme approximation
            const phase = elapsed * 8; // Fast oscillation for speech variation
            const variation = Math.sin(phase) * 0.5 + 0.5;

            targetMorphValues["viseme_aa"] = level * 0.6 * variation;
            targetMorphValues["viseme_O"] = level * 0.4 * (1 - variation);
            targetMorphValues["viseme_E"] =
              level * 0.3 * Math.sin(phase * 1.3);
            targetMorphValues["viseme_I"] =
              level * 0.2 * Math.cos(phase * 0.7);
            targetMorphValues["viseme_SS"] =
              level * 0.2 * Math.abs(Math.sin(phase * 2.1));
            targetMorphValues["viseme_FF"] =
              level * 0.15 * Math.abs(Math.cos(phase * 1.7));
            targetMorphValues["viseme_sil"] = Math.max(
              0,
              1 - level * 2
            );
          } else {
            targetMorphValues["viseme_sil"] = 1;
          }

          // Jaw open proportional to volume
          targetMorphValues["jawOpen"] = Math.pow(level, 0.6) * 0.7;

          // Subtle smile while speaking
          targetMorphValues["mouthSmileLeft"] = 0.1 + beatSpring * 0.15;
          targetMorphValues["mouthSmileRight"] = 0.1 + beatSpring * 0.15;

          // Slight brow raise for emphasis
          targetMorphValues["browInnerUp"] = beatSpring * 0.2;
          targetMorphValues["browOuterUpLeft"] = level * 0.15;
          targetMorphValues["browOuterUpRight"] = level * 0.15;
        }

        // Blink (all states)
        const blinkVal = blinkPhase > 0 ? Math.sin(blinkPhase * Math.PI) : 0;
        targetMorphValues["eyeBlinkLeft"] = blinkVal;
        targetMorphValues["eyeBlinkRight"] = blinkVal;

        // ---- Smooth interpolation & apply ----
        for (const [name, idx] of Object.entries(morphIndices)) {
          const target = targetMorphValues[name] || 0;
          const current = currentMorphValues[name] || 0;
          const isViseme = name.startsWith("viseme_");
          const lerpSpeed = isViseme ? 18 : 10;
          currentMorphValues[name] =
            current + (target - current) * delta * lerpSpeed;
          inf[idx] = Math.max(0, Math.min(1, currentMorphValues[name]));
        }
      }

      // ---- Camera movement based on state ----
      const camSpeed =
        terminalState === "thinking"
          ? 0.3
          : terminalState === "speaking"
          ? 0.12
          : terminalState === "listening"
          ? 0.08
          : isAmbient
          ? 0.05
          : 0.1;

      cameraAngle += delta * camSpeed * (1 + audioLevel * 0.3);

      const camSwayX =
        terminalState === "thinking"
          ? Math.sin(cameraAngle * 0.6) * 0.06
          : Math.sin(cameraAngle * 0.4) * 0.03;
      const camSwayY =
        terminalState === "thinking"
          ? Math.sin(cameraAngle * 0.4) * 0.03
          : Math.sin(cameraAngle * 0.3) * 0.015;
      const camZoom = terminalState === "listening" ? -0.02 : 0;

      camera.position.x = camSwayX;
      camera.position.y = 1.58 + camSwayY;
      camera.position.z = 0.65 + camZoom - audioLevel * 0.02;
      camera.lookAt(0, 1.52, 0);

      // ---- Animate particles ----
      const posAttr = particleGeo.getAttribute(
        "position"
      ) as THREE.BufferAttribute;
      const particleSpeed =
        terminalState === "thinking"
          ? 2.5
          : terminalState === "speaking"
          ? 1.5
          : isAmbient
          ? 0.5
          : 1.0;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const phase = particlePhases[i];
        const speed = particleSpeeds[i] * particleSpeed;
        const ix = i * 3;

        const angle = elapsed * speed + phase;
        const radius = Math.sqrt(
          particlePositions[ix] * particlePositions[ix] +
            particlePositions[ix + 2] * particlePositions[ix + 2]
        );

        // Thinking: particles swirl tighter
        const radiusMod =
          terminalState === "thinking"
            ? 0.7 + Math.sin(elapsed * 0.5 + phase) * 0.2
            : 1.0;

        posAttr.array[ix] = Math.cos(angle) * radius * radiusMod;
        posAttr.array[ix + 1] =
          particlePositions[ix + 1] +
          Math.sin(elapsed * 0.1 + phase * 5) * 0.3;
        posAttr.array[ix + 2] =
          Math.sin(angle) * radius * 0.4 * radiusMod - 1;
      }
      posAttr.needsUpdate = true;

      // Particle opacity based on state + audio
      const baseOpacity = isAmbient ? 0.1 : 0.2;
      particleMat.opacity = baseOpacity + audioLevel * 0.3 + beatSpring * 0.1;

      // ---- Background color transition ----
      const bgTarget =
        terminalState === "thinking"
          ? new THREE.Color(0x0c080f)
          : terminalState === "error"
          ? new THREE.Color(0x120808)
          : new THREE.Color(0x0a0a0f);

      (scene.background as THREE.Color).lerp(bgTarget, delta * 2);
      scene.fog!.color.lerp(bgTarget, delta * 2);

      // ---- Render ----
      composer.render();
    }

    animate();

    // =================== RESIZE ===================
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
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: 0,
      }}
    />
  );
}
