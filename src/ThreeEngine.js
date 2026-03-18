import * as THREE from 'three';

export class ThreeEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.audioEngine = null;
    this.isRunning = false;
    this.sLow = 0;
    this.sMid = 0;
    this.sTotal = 0;

    // SCENE
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020210, 0.04);

    const width = canvas.width || window.innerWidth;
    const height = canvas.height || window.innerHeight;

    // CAMERA
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(0, 0.5, 8);

    // RENDERER
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x020210, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // LIGHTING — dramatic cinematic lighting
    const ambient = new THREE.AmbientLight(0x223366, 0.4);
    this.scene.add(ambient);

    // Key light (cyan, stage right)
    const keyLight = new THREE.PointLight(0x00ddff, 3, 25);
    keyLight.position.set(4, 3, 5);
    this.scene.add(keyLight);

    // Fill light (purple, stage left)
    const fillLight = new THREE.PointLight(0x8844ff, 2, 20);
    fillLight.position.set(-4, -1, 3);
    this.scene.add(fillLight);

    // Rim light (white, behind)
    const rimLight = new THREE.PointLight(0xffffff, 1.5, 15);
    rimLight.position.set(0, 2, -5);
    this.scene.add(rimLight);

    // Under-chin accent
    const underLight = new THREE.PointLight(0x0066ff, 1, 10);
    underLight.position.set(0, -4, 2);
    this.scene.add(underLight);

    this.keyLight = keyLight;
    this.fillLight = fillLight;

    // BUILD THE FACE
    this.buildFace();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  setAudioEngine(audioEngine) {
    this.audioEngine = audioEngine;
  }

  // ═══════════════════════════════════════════
  // PROCEDURAL FACE CONSTRUCTION
  // ═══════════════════════════════════════════
  buildFace() {
    this.headGroup = new THREE.Group();

    // ── MATERIALS ──
    this.wireMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      emissive: 0x0044aa,
      emissiveIntensity: 0.4,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });

    this.solidMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a1a,
      roughness: 0.3,
      metalness: 0.9,
      transparent: true,
      opacity: 0.85,
    });

    this.glowMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.9,
    });

    this.lipMat = new THREE.MeshStandardMaterial({
      color: 0xff4488,
      emissive: 0xff2266,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8,
    });

    // ── 1. CRANIUM (elongated sphere, squished for skull shape) ──
    const craniumGeo = new THREE.SphereGeometry(2, 32, 24);
    this.cranium = new THREE.Mesh(craniumGeo, this.solidMat);
    this.craniumWire = new THREE.Mesh(craniumGeo, this.wireMat);
    this.cranium.scale.set(1, 1.25, 1.1); // Taller, slightly deeper
    this.craniumWire.scale.copy(this.cranium.scale);
    this.cranium.position.y = 1.0;
    this.craniumWire.position.y = 1.0;
    this.headGroup.add(this.cranium);
    this.headGroup.add(this.craniumWire);

    // ── 2. FACE PLATE (flattened ellipsoid for the front of the face) ──
    const faceGeo = new THREE.SphereGeometry(1.8, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const faceMesh = new THREE.Mesh(faceGeo, this.solidMat.clone());
    faceMesh.scale.set(1, 1.1, 0.7);
    faceMesh.position.set(0, 0.3, 0.4);
    this.headGroup.add(faceMesh);

    // ── 3. EYE SOCKETS (torus rings) ──
    const eyeSocketGeo = new THREE.TorusGeometry(0.32, 0.06, 12, 24);
    
    this.leftEye = new THREE.Mesh(eyeSocketGeo, this.glowMat);
    this.leftEye.position.set(-0.55, 1.15, 1.65);
    this.leftEye.rotation.y = 0.15;
    this.headGroup.add(this.leftEye);

    this.rightEye = new THREE.Mesh(eyeSocketGeo, this.glowMat);
    this.rightEye.position.set(0.55, 1.15, 1.65);
    this.rightEye.rotation.y = -0.15;
    this.headGroup.add(this.rightEye);

    // ── 3b. EYEBALL IRISES (small glowing spheres inside sockets) ──
    const irisGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const irisMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 2.0,
    });

    this.leftIris = new THREE.Mesh(irisGeo, irisMat);
    this.leftIris.position.set(-0.55, 1.15, 1.75);
    this.headGroup.add(this.leftIris);

    this.rightIris = new THREE.Mesh(irisGeo, irisMat.clone());
    this.rightIris.position.set(0.55, 1.15, 1.75);
    this.headGroup.add(this.rightIris);

    // ── 4. NOSE BRIDGE ──
    const noseGeo = new THREE.ConeGeometry(0.12, 0.8, 4);
    const noseMesh = new THREE.Mesh(noseGeo, this.wireMat);
    noseMesh.position.set(0, 0.65, 1.9);
    noseMesh.rotation.x = -0.15;
    this.headGroup.add(noseMesh);

    // Nose tip (small sphere)
    const noseTipGeo = new THREE.SphereGeometry(0.1, 12, 12);
    const noseTip = new THREE.Mesh(noseTipGeo, this.glowMat);
    noseTip.position.set(0, 0.3, 2.05);
    this.headGroup.add(noseTip);

    // ── 5. CHEEKBONES (subtle ridges) ──
    const cheekGeo = new THREE.SphereGeometry(0.35, 12, 8);
    const cheekMat = this.solidMat.clone();
    cheekMat.opacity = 0.5;

    const leftCheek = new THREE.Mesh(cheekGeo, cheekMat);
    leftCheek.position.set(-0.9, 0.7, 1.4);
    leftCheek.scale.set(1, 0.6, 0.7);
    this.headGroup.add(leftCheek);

    const rightCheek = new THREE.Mesh(cheekGeo, cheekMat);
    rightCheek.position.set(0.9, 0.7, 1.4);
    rightCheek.scale.set(1, 0.6, 0.7);
    this.headGroup.add(rightCheek);

    // ── 6. BROW RIDGE ──
    const browGeo = new THREE.TorusGeometry(0.85, 0.05, 8, 24, Math.PI);
    const browMesh = new THREE.Mesh(browGeo, this.glowMat);
    browMesh.position.set(0, 1.55, 1.5);
    browMesh.rotation.x = -0.3;
    browMesh.rotation.z = Math.PI; // flip upside down so it arcs over the eyes
    this.headGroup.add(browMesh);

    // ── 7. LIPS (upper and lower, as separate torus arcs) ──
    // JAW GROUP — everything below the lips hinges here
    this.jawGroup = new THREE.Group();
    this.jawGroup.position.set(0, 0.05, 1.2); // Hinge point at the back of the mouth

    // Upper lip (attached to cranium, NOT the jaw)
    const upperLipGeo = new THREE.TorusGeometry(0.28, 0.04, 8, 20, Math.PI);
    this.upperLip = new THREE.Mesh(upperLipGeo, this.lipMat);
    this.upperLip.position.set(0, 0.1, 1.72);
    this.upperLip.rotation.z = Math.PI; // Arc faces downward
    this.headGroup.add(this.upperLip);

    // Lower lip (attached to jaw group so it drops with the jaw)
    const lowerLipGeo = new THREE.TorusGeometry(0.26, 0.05, 8, 20, Math.PI);
    this.lowerLip = new THREE.Mesh(lowerLipGeo, this.lipMat.clone());
    this.lowerLip.position.set(0, -0.1, 0.55); // Relative to jaw hinge
    this.headGroup.add(this.lowerLip); // Initially in headGroup, we'll move with jawGroup

    // ── 8. CHIN (sphere) ──
    const chinGeo = new THREE.SphereGeometry(0.35, 12, 12);
    this.chinMesh = new THREE.Mesh(chinGeo, this.solidMat.clone());
    this.chinMesh.position.set(0, -0.55, 0.3);
    this.chinMesh.scale.set(1, 0.7, 0.8);
    this.jawGroup.add(this.chinMesh);

    // ── 9. LOWER JAW STRUCTURE ──
    const jawBoneGeo = new THREE.BoxGeometry(1.6, 0.3, 1.2);
    const jawBone = new THREE.Mesh(jawBoneGeo, this.solidMat.clone());
    jawBone.position.set(0, -0.25, 0.15);
    this.jawGroup.add(jawBone);

    const jawBoneWire = new THREE.Mesh(jawBoneGeo, this.wireMat.clone());
    jawBoneWire.position.copy(jawBone.position);
    this.jawGroup.add(jawBoneWire);

    this.headGroup.add(this.jawGroup);

    // ── 10. NECK ──
    const neckGeo = new THREE.CylinderGeometry(0.6, 0.5, 1.5, 16);
    const neckMesh = new THREE.Mesh(neckGeo, this.solidMat.clone());
    neckMesh.position.set(0, -1.5, 0);
    this.headGroup.add(neckMesh);

    const neckWire = new THREE.Mesh(neckGeo, this.wireMat.clone());
    neckWire.position.copy(neckMesh.position);
    this.headGroup.add(neckWire);

    // ── 11. DECORATIVE CIRCUIT LINES ──
    this.addCircuitLines();

    this.scene.add(this.headGroup);
  }

  addCircuitLines() {
    const lineMat = new THREE.LineBasicMaterial({ 
      color: 0x00ffff, 
      transparent: true, 
      opacity: 0.5 
    });

    // Vertical center line down the face
    const centerPoints = [
      new THREE.Vector3(0, 2.8, 1.2),
      new THREE.Vector3(0, 2.2, 1.8),
      new THREE.Vector3(0, 1.6, 2.0),
      new THREE.Vector3(0, 0.7, 2.1),
      new THREE.Vector3(0, 0.3, 2.0),
      new THREE.Vector3(0, -0.2, 1.7),
    ];
    const centerCurve = new THREE.CatmullRomCurve3(centerPoints);
    const centerLineGeo = new THREE.BufferGeometry().setFromPoints(centerCurve.getPoints(40));
    this.headGroup.add(new THREE.Line(centerLineGeo, lineMat));

    // Horizontal lines across forehead
    for (let i = 0; i < 3; i++) {
      const y = 1.8 + i * 0.25;
      const z = 1.5 - i * 0.15;
      const points = [];
      for (let j = 0; j <= 20; j++) {
        const t = (j / 20 - 0.5) * 2;
        const spread = 1.2 - i * 0.2;
        points.push(new THREE.Vector3(
          t * spread,
          y + Math.cos(t * Math.PI) * 0.05,
          z + Math.sqrt(1 - t * t * 0.5) * 0.3
        ));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(30));
      this.headGroup.add(new THREE.Line(geo, lineMat));
    }

    // Jaw contour lines
    const jawPoints = [
      new THREE.Vector3(-1.5, 0.3, 0.8),
      new THREE.Vector3(-1.2, -0.3, 1.2),
      new THREE.Vector3(-0.7, -0.6, 1.5),
      new THREE.Vector3(0, -0.7, 1.7),
      new THREE.Vector3(0.7, -0.6, 1.5),
      new THREE.Vector3(1.2, -0.3, 1.2),
      new THREE.Vector3(1.5, 0.3, 0.8),
    ];
    const jawCurve = new THREE.CatmullRomCurve3(jawPoints);
    const jawGeo = new THREE.BufferGeometry().setFromPoints(jawCurve.getPoints(40));
    this.headGroup.add(new THREE.Line(jawGeo, lineMat));
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

  loop() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this.loop());

    const t = performance.now() * 0.001;

    // ── AUDIO EXTRACTION ──
    let mouthOpen = 0;
    let bassEnergy = 0;
    let midEnergy = 0;

    if (this.audioEngine && this.audioEngine.isInitialized) {
      const data = this.audioEngine.getFrequencyData();
      if (data) {
        let bass = 0;
        for (let i = 0; i < 8; i++) bass += data[i];
        bassEnergy = bass / (8 * 255);
      }

      const vb = this.audioEngine.getVocalBands();
      const GATE = 0.06;
      const gatedTotal = vb.total < GATE ? 0 : vb.total;
      const gatedLow = gatedTotal === 0 ? 0 : vb.low;
      const gatedMid = gatedTotal === 0 ? 0 : vb.mid;

      // Smooth (fast attack, slow release)
      const lerp = (prev, target) => prev + (target - prev) * (target > prev ? 0.6 : 0.15);
      this.sLow = lerp(this.sLow, gatedLow);
      this.sMid = lerp(this.sMid, gatedMid);
      this.sTotal = lerp(this.sTotal, gatedTotal);

      mouthOpen = this.sLow;
      midEnergy = this.sMid;
    }

    // ── HEAD IDLE MOTION ──
    this.headGroup.rotation.y = Math.sin(t * 0.4) * 0.25 + Math.sin(t * 0.9) * 0.08;
    this.headGroup.rotation.x = Math.sin(t * 0.55) * 0.08;
    this.headGroup.position.y = Math.sin(t * 1.2) * 0.15;

    // ── JAW DROP (X-axis rotation on the hinge) ──
    const targetJaw = Math.min(mouthOpen * 3.0, 0.45); // Up to ~25 degrees
    const currentJaw = this.jawGroup.rotation.x;
    this.jawGroup.rotation.x = currentJaw + (targetJaw - currentJaw) * (targetJaw > currentJaw ? 0.5 : 0.15);

    // Move lower lip down with the jaw
    this.lowerLip.position.y = 0.1 - this.jawGroup.rotation.x * 0.8;
    this.lowerLip.position.z = 1.72 - this.jawGroup.rotation.x * 0.3;

    // ── EMISSIVE PULSE (bass drives glow intensity) ──
    const pulse = 0.3 + bassEnergy * 2.0;
    this.wireMat.emissiveIntensity = pulse;
    this.glowMat.emissiveIntensity = 0.8 + bassEnergy * 3.0;

    // ── EYE GLOW PULSE ──
    const eyePulse = 0.8 + Math.sin(t * 3) * 0.2 + bassEnergy * 1.5;
    this.leftIris.material.emissiveIntensity = eyePulse;
    this.rightIris.material.emissiveIntensity = eyePulse;

    // Slight eye drift
    const eyeLookX = Math.sin(t * 0.7) * 0.05;
    const eyeLookY = Math.sin(t * 1.1) * 0.03;
    this.leftIris.position.x = -0.55 + eyeLookX;
    this.leftIris.position.y = 1.15 + eyeLookY;
    this.rightIris.position.x = 0.55 + eyeLookX;
    this.rightIris.position.y = 1.15 + eyeLookY;

    // ── LIP COLOR SHIFT when singing ──
    const lipIntensity = 0.4 + midEnergy * 2.0;
    this.lipMat.emissiveIntensity = lipIntensity;

    // ── LIGHT ANIMATION ──
    this.keyLight.intensity = 2.5 + bassEnergy * 3;
    this.fillLight.intensity = 1.5 + bassEnergy * 2;

    this.renderer.render(this.scene, this.camera);
  }
}
