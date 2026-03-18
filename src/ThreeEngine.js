import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class ThreeEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.audioEngine = null;
    this.isRunning = false;
    this.headMesh = null;
    this.morphDict = {};  // name -> index mapping for morph targets

    // Smoothed audio values
    this.sLow = 0;
    this.sMid = 0;
    this.sHigh = 0;
    this.sTotal = 0;

    const width = canvas.width || window.innerWidth;
    const height = canvas.height || window.innerHeight;

    // ═══ SCENE ═══
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020210);
    this.scene.fog = new THREE.FogExp2(0x020210, 0.08);

    // ═══ CAMERA ═══
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 50);
    this.camera.position.set(0, 1.6, 3.5); // Eye-level, close portrait framing

    // ═══ RENDERER ═══
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    // ═══ LIGHTING ═══
    // Ambient base
    this.scene.add(new THREE.AmbientLight(0x334466, 0.6));

    // Key (cyan, stage right)
    this.keyLight = new THREE.DirectionalLight(0x66ddff, 2.5);
    this.keyLight.position.set(3, 2, 4);
    this.scene.add(this.keyLight);

    // Fill (purple, stage left)
    this.fillLight = new THREE.DirectionalLight(0x9944ff, 1.5);
    this.fillLight.position.set(-3, -1, 3);
    this.scene.add(this.fillLight);

    // Rim (white, behind)
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
    rimLight.position.set(0, 1, -4);
    this.scene.add(rimLight);

    // Under-chin accent (cyan)
    const underLight = new THREE.PointLight(0x0088ff, 1.5, 8);
    underLight.position.set(0, -3, 2);
    this.scene.add(underLight);

    // ═══ LOAD THE REAL FACE MODEL ═══
    this.loadModel();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  setAudioEngine(audioEngine) {
    this.audioEngine = audioEngine;
  }

  loadModel() {
    const loader = new GLTFLoader();
    loader.load('/head.glb', (gltf) => {
      const model = gltf.scene;

      // Find ALL meshes with morph targets
      this.morphMeshes = [];
      let headCenter = null;

      model.traverse((child) => {
        if (child.isMesh) {
          if (child.morphTargetDictionary && Object.keys(child.morphTargetDictionary).length > 0) {
            this.morphMeshes.push(child);
            if (!this.headMesh || Object.keys(child.morphTargetDictionary).length > Object.keys(this.morphDict).length) {
              this.headMesh = child;
              this.morphDict = child.morphTargetDictionary;
            }
            console.log(`Morph mesh "${child.name}":`, Object.keys(child.morphTargetDictionary));
          }

          // Find the actual head mesh to compute its center
          const n = child.name.toLowerCase();
          if (n.includes('head') && !n.includes('headtop')) {
            const box = new THREE.Box3().setFromObject(child);
            headCenter = new THREE.Vector3();
            box.getCenter(headCenter);
            console.log('Head mesh bounds:', box.min, box.max, 'center:', headCenter);
          }
        }
      });

      // Add model to scene first so world transforms are available
      this.scene.add(model);
      this.model = model;

      // Now compute the world-space head center and frame the camera on it
      if (headCenter) {
        model.updateMatrixWorld(true);
        // Transform headCenter to world space
        const worldCenter = headCenter.clone();
        // Move model so the head center aligns with camera lookAt (0, 0, 0)
        model.position.set(-worldCenter.x, -worldCenter.y, -worldCenter.z);
        this.modelBaseY = model.position.y;
        
        // Camera looks at origin, which is now the head center
        this.camera.position.set(0, 0, 0.45); // Close portrait ~45cm away
        this.camera.lookAt(0, 0, 0);
      } else {
        // Fallback: just center roughly
        model.position.set(0, -1.7, 0);
        this.modelBaseY = -1.7;
        this.camera.position.set(0, 0, 0.5);
        this.camera.lookAt(0, 0, 0);
      }

      // Do an initial render so the user sees the face immediately
      this.renderer.render(this.scene, this.camera);

      console.log('Face model loaded with', this.morphMeshes.length, 'morph meshes');
      console.log('Primary morph targets:', Object.keys(this.morphDict));
    },
    undefined,
    (error) => {
      console.error('Error loading face model:', error);
    });
  }

  onWindowResize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.onWindowResize();
    this.loop();
  }

  stop() {
    this.isRunning = false;
    this.renderer.clear();
  }

  // ══════════════════════════════════════
  // HELPER: set morph target by name
  // ══════════════════════════════════════
  setMorph(name, value) {
    if (!this.morphMeshes) return;
    const clampedVal = Math.max(0, Math.min(1, value));
    for (const mesh of this.morphMeshes) {
      if (mesh.morphTargetDictionary && mesh.morphTargetDictionary[name] !== undefined) {
        const idx = mesh.morphTargetDictionary[name];
        mesh.morphTargetInfluences[idx] = clampedVal;
      }
    }
  }

  loop() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this.loop());

    const t = performance.now() * 0.001;

    // ═══ AUDIO EXTRACTION ═══
    let bassEnergy = 0;

    if (this.audioEngine && this.audioEngine.isInitialized) {
      const data = this.audioEngine.getFrequencyData();
      if (data) {
        let bass = 0;
        for (let i = 0; i < 8; i++) bass += data[i];
        bassEnergy = bass / (8 * 255);
      }

      const vb = this.audioEngine.getVocalBands();
      const GATE = 0.05;
      const gatedTotal = vb.total < GATE ? 0 : vb.total;
      const gatedLow = gatedTotal === 0 ? 0 : vb.low;
      const gatedMid = gatedTotal === 0 ? 0 : vb.mid;
      const gatedHigh = gatedTotal === 0 ? 0 : vb.high;

      // Smooth: fast attack, slow release
      const lerp = (prev, target) => prev + (target - prev) * (target > prev ? 0.55 : 0.12);
      this.sLow = lerp(this.sLow, gatedLow);
      this.sMid = lerp(this.sMid, gatedMid);
      this.sHigh = lerp(this.sHigh, gatedHigh);
      this.sTotal = lerp(this.sTotal, gatedTotal);
    }

    // ═══ HEAD IDLE MOTION ═══
    if (this.model) {
      const baseY = this.modelBaseY || 0;
      this.model.rotation.y = Math.sin(t * 0.4) * 0.15 + Math.sin(t * 0.9) * 0.05;
      this.model.rotation.x = Math.sin(t * 0.55) * 0.04;
      this.model.position.y = baseY + Math.sin(t * 1.2) * 0.02;
    }

    // ═══ MORPH TARGET LIP SYNC ═══
    if (this.headMesh) {
      // Jaw drop: driven by low vocal formants (fundamental frequency)
      this.setMorph('jawOpen', this.sLow * 1.8);

      // Mouth open: driven by total vocal energy
      this.setMorph('mouthOpen', this.sTotal * 1.5);

      // Mouth funnel (OOH shape): driven by mid frequencies
      this.setMorph('mouthFunnel', this.sMid * 0.8);

      // Mouth pucker: driven by high frequencies (sibilants)
      this.setMorph('mouthPucker', this.sHigh * 0.6);

      // Mouth stretch (wide AAH): driven by low energy
      this.setMorph('mouthStretchLeft', this.sLow * 0.5);
      this.setMorph('mouthStretchRight', this.sLow * 0.5);

      // Lips together / apart
      this.setMorph('mouthClose', Math.max(0, 0.3 - this.sTotal * 2));

      // Mouth smile during mid vocal
      this.setMorph('mouthSmileLeft', this.sMid * 0.4);
      this.setMorph('mouthSmileRight', this.sMid * 0.4);

      // Upper lip raise during high vocal
      this.setMorph('mouthUpperUpLeft', this.sHigh * 0.4);
      this.setMorph('mouthUpperUpRight', this.sHigh * 0.4);

      // Lower lip depression during open
      this.setMorph('mouthLowerDownLeft', this.sLow * 0.6);
      this.setMorph('mouthLowerDownRight', this.sLow * 0.6);

      // Subtle brow movement when singing intensely
      this.setMorph('browInnerUp', this.sTotal * 0.4);
      this.setMorph('browOuterUpLeft', this.sTotal * 0.2);
      this.setMorph('browOuterUpRight', this.sTotal * 0.2);

      // Cheek squint on intense passages
      this.setMorph('cheekSquintLeft', this.sMid * 0.3);
      this.setMorph('cheekSquintRight', this.sMid * 0.3);

      // Eyes narrow slightly when belting
      this.setMorph('eyeSquintLeft', this.sTotal * 0.3);
      this.setMorph('eyeSquintRight', this.sTotal * 0.3);

      // Subtle idle blinks
      const blinkCycle = Math.sin(t * 0.5) * 0.5 + 0.5;
      const blink = blinkCycle > 0.95 ? (blinkCycle - 0.95) * 20 : 0;
      this.setMorph('eyeBlinkLeft', blink);
      this.setMorph('eyeBlinkRight', blink);

      // Nose wrinkle on high energy
      this.setMorph('noseSneerLeft', this.sHigh * 0.3);
      this.setMorph('noseSneerRight', this.sHigh * 0.3);
    }

    // ═══ LIGHT PULSE ═══
    this.keyLight.intensity = 2.0 + bassEnergy * 3.0;
    this.fillLight.intensity = 1.2 + bassEnergy * 2.0;

    this.renderer.render(this.scene, this.camera);
  }
}
