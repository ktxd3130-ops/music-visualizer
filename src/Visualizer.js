export class Visualizer {
  constructor(canvas, audioEngine, lyricManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audioEngine = audioEngine;
    this.lyricManager = lyricManager;
    
    this.mode = 'bars';
    this.animationFrameId = null;
    this.isRunning = false;
    
    this.faceParticles = [];
    this.sLow = 0;
    this.sMid = 0;
    this.sTotal = 0;

    this.loadFaceImage();
  }

  setMode(mode) { this.mode = mode; }

  // ═══════════════════════════════════════════════
  // HIGH-FIDELITY IMAGE-BASED PARTICLE SYSTEM
  // ═══════════════════════════════════════════════
  loadFaceImage() {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = '/hologram_face.png'; // High resolution beautiful holographic face

    img.onload = () => {
      // Determine resolution of the particle grid
      const cols = 160;
      const rows = 160;
      const tCanvas = document.createElement('canvas');
      tCanvas.width = cols;
      tCanvas.height = rows;
      const tCtx = tCanvas.getContext('2d', { willReadFrequently: true });
      
      tCtx.drawImage(img, 0, 0, cols, rows);
      const data = tCtx.getImageData(0, 0, cols, rows).data;
      
      this.faceParticles = [];
      
      // Iterate through pixels to create the 3D point cloud
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const idx = (y * cols + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          const brightness = Math.max(r, g, b) / 255.0; // Use max channel for brightness
          
          // Skip pure black background
          if (brightness < 0.08) continue;
          
          // Normalize coordinates -1 to 1
          const nx = x / cols;
          const ny = y / rows;
          
          // The face should bulge out where it's bright
          // Let's create a base sphere shape and add the image brightness as relief
          const dx = (nx - 0.5) * 2;
          const dy = (ny - 0.5) * 2;
          const distFromCenter = Math.sqrt(dx * dx + dy * dy);
          
          // Base Z curves back at the edges
          let baseZ = Math.cos(distFromCenter * Math.PI * 0.5) * 0.5;
          // Add brightness relief so features (nose, lips, brows) pop out
          baseZ += brightness * 0.3;
          
          // Region detection for mouth animation
          // The mouth typically sits roughly centered horizontally, in the lower third
          let region = 'face';
          
          if (nx > 0.44 && nx < 0.56) {
            if (ny > 0.650 && ny < 0.670) {
              region = 'upperLip';
            } else if (ny >= 0.670 && ny < 0.690) {
              region = 'lowerLip';
            } else if (ny >= 0.690 && ny < 0.82) {
              region = 'jaw';
            }
          }

          // Randomly skip some dark points inside the face to make it look like a particle cloud
          if (brightness < 0.4 && Math.random() > 0.6) continue;

          this.faceParticles.push({
            baseX: dx * 0.8,      // Scale X width
            baseY: dy * 0.85,     // Scale Y height
            baseZ: baseZ,
            r, g, b,              // Store exact pixel color
            alpha: brightness,    // Bright spots are more opaque
            nx, ny,               // Store normalized coordinates for organic distortion math
            region,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
      console.log(`Loaded high-fidelity holographic face: ${this.faceParticles.length} particles`);
    };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  loop() {
    if (!this.isRunning) return;
    this.draw();
    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }

  draw() {
    const { width, height } = this.canvas;
    this.ctx.fillStyle = '#020208'; // Deep space black/blue background
    this.ctx.fillRect(0, 0, width, height);
    if (!this.audioEngine.isInitialized) return;

    switch(this.mode) {
      case 'bars': this.drawBars(width, height); break;
      case 'waveform': this.drawWaveform(width, height); break;
      case 'circular': this.drawCircular(width, height); break;
      case 'face': this.drawFace(width, height); break;
      default: this.drawBars(width, height);
    }
  }

  // ═══ BARS ═══
  drawBars(width, height) {
    const d = this.audioEngine.getFrequencyData();
    if (!d) return;
    const n = Math.floor(d.length * 0.75);
    const bw = (width / n) * 2.5;
    let x = 0;
    for (let i = 0; i < n; i++) {
      const pct = d[i] / 255;
      const bh = height * pct * 0.8;
      const hue = i * (360 / n) + (performance.now() * 0.05);
      this.ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
      this.ctx.fillRect(x, height - bh, bw, bh);
      this.ctx.fillStyle = '#fff';
      this.ctx.shadowBlur = 20;
      this.ctx.fillRect(x, height - bh - 4, bw, 2);
      x += bw + 2;
    }
    this.ctx.shadowBlur = 0;
  }

  // ═══ WAVEFORM ═══
  drawWaveform(width, height) {
    const d = this.audioEngine.getTimeDomainData();
    if (!d) return;
    this.ctx.lineWidth = 4;
    const g = this.ctx.createLinearGradient(0, 0, width, 0);
    g.addColorStop(0, '#00FFFF'); g.addColorStop(0.5, '#8A2BE2'); g.addColorStop(1, '#FF00FF');
    this.ctx.strokeStyle = g;
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = '#8A2BE2';
    this.ctx.beginPath();
    const sw = width / d.length;
    let x = 0;
    for (let i = 0; i < d.length; i++) {
      const v = d[i] / 128.0;
      const y = v * height / 2;
      i === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
      x += sw;
    }
    this.ctx.lineTo(width, height / 2);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  // ═══ CIRCULAR ═══
  drawCircular(width, height) {
    const d = this.audioEngine.getFrequencyData();
    if (!d) return;
    const cx = width / 2, cy = height / 2;
    const vol = this.audioEngine.getVolume();
    const r = Math.min(width, height) / 4 + vol * 0.5;
    const bars = Math.floor(d.length * 0.4);
    for (let i = 0; i < bars; i++) {
      const ang = (Math.PI * 2 / bars) * i;
      const bh = (d[i] / 255) * (Math.min(width, height) / 3);
      const hue = (i * (360 / bars)) + (performance.now() * 0.05);
      this.ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
      this.ctx.lineWidth = 4; this.ctx.lineCap = 'round';
      this.ctx.shadowBlur = 10; this.ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
      this.ctx.beginPath();
      this.ctx.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      this.ctx.lineTo(cx + Math.cos(ang) * (r + bh), cy + Math.sin(ang) * (r + bh));
      this.ctx.stroke();
    }
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r - 10, 0, Math.PI * 2);
    this.ctx.fillStyle = `rgba(138, 43, 226, ${vol / 255 * 0.3})`;
    this.ctx.fill();
    this.ctx.lineWidth = 2; this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  // ═══════════════════════════════════════════════
  // HIGH-FIDELITY FACE RENDERER
  // ═══════════════════════════════════════════════
  drawFace(width, height) {
    const dataArray = this.audioEngine.getFrequencyData();
    if (!dataArray || this.faceParticles.length === 0) return;

    const cx = width / 2;
    const cy = height / 2;
    const t = performance.now() * 0.001;
    const scale = Math.min(width, height) * 0.45; // slightly larger scale

    // ═══ VOCAL ANALYSIS ═══
    const vb = this.audioEngine.getVocalBands();
    const GATE = 0.07;
    const gatedTotal = vb.total < GATE ? 0 : vb.total;
    const gatedLow = gatedTotal === 0 ? 0 : vb.low;
    const gatedMid = gatedTotal === 0 ? 0 : vb.mid;

    // Smooth with fast attack / slow release
    const lerp = (p, tgt) => p + (tgt - p) * (tgt > p ? 0.7 : 0.18);
    this.sLow = lerp(this.sLow, gatedLow);
    this.sMid = lerp(this.sMid, gatedMid);
    this.sTotal = lerp(this.sTotal, gatedTotal);

    // Bass for ambient glow
    let bass = 0;
    for (let i = 0; i < 8; i++) bass += dataArray[i];
    bass /= (8 * 255);

    // ═══ 3D HEAD ROTATION ═══
    const rotY = Math.sin(t * 0.3) * 0.15 + Math.sin(t * 0.7) * 0.05;
    const rotX = Math.sin(t * 0.45) * 0.06;
    const cosRY = Math.cos(rotY), sinRY = Math.sin(rotY);
    const cosRX = Math.cos(rotX), sinRX = Math.sin(rotX);

    // ═══ MOUTH ANIMATION VALUES ═══
    const mouthOpen = this.sLow * 0.15;  // Jaw drop
    const lipLift = this.sMid * 0.03;    // Upper lip lift

    // ═══ AMBIENT GLOW ═══
    const grd = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.5);
    grd.addColorStop(0, `rgba(0, 50, 150, ${0.1 + bass * 0.15})`);
    grd.addColorStop(0.5, `rgba(0, 20, 80, ${0.05 + bass * 0.08})`);
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = grd;
    this.ctx.fillRect(0, 0, width, height);

    // Project all particles
    const proj = [];
    for (let i = 0; i < this.faceParticles.length; i++) {
      const p = this.faceParticles[i];
      let px = p.baseX;
      let py = p.baseY;
      let pz = p.baseZ;

      // ─── ORGANIC AUDIO REACTIVE DISTORTIONS ───
      // Lips and face movement simulating skin tension and musculature
      
      const centerX = 0.50; // Horizontal center of the face
      const distX = Math.abs(p.nx - centerX);
      
      // 1. Primary Mouth (Lips separating)
      const mouthHFalloff = Math.max(0, 1.0 - Math.pow(distX / 0.06, 2));
      if (mouthHFalloff > 0) {
        if (p.ny >= 0.67 && p.ny < 0.85) {
          const vFalloff = Math.max(0, 1.0 - Math.pow((p.ny - 0.67) / 0.18, 1.5));
          py += mouthOpen * mouthHFalloff * vFalloff * 1.5; 
        } else if (p.ny >= 0.64 && p.ny < 0.67) {
          const vFalloff = Math.max(0, 1.0 - Math.pow((0.67 - p.ny) / 0.03, 1.5));
          py -= lipLift * mouthHFalloff * vFalloff * 1.5;
        }
      }

      // 2. Secondary Face / Cheek / Jaw movement
      // When the jaw drops to sing, it pulls the skin of the lower cheeks down and slightly inwards.
      const cheekHFalloff = Math.max(0, 1.0 - Math.pow(distX / 0.25, 2)); // Wide enough to cover cheeks
      
      if (cheekHFalloff > 0 && p.ny > 0.55) {
        // Hinge point is the cheekbones (ny ~ 0.55). Tension increases down towards the chin (ny ~ 0.85)
        const vFalloff = Math.min(1.0, (p.ny - 0.55) / 0.45); // Linear stretch down the face
        
        // Jaw dropping pulls everything down
        py += mouthOpen * cheekHFalloff * vFalloff * 0.7;
        
        // Singing pulls the cheeks slightly inwards, thinning the face
        if (p.nx < centerX) {
          px += mouthOpen * cheekHFalloff * vFalloff * 0.08;
        } else if (p.nx > centerX) {
          px -= mouthOpen * cheekHFalloff * vFalloff * 0.08;
        }
      }

      // Subtle breathing on whole face
      py += Math.sin(t * 1.5 + p.phase) * 0.005;

      // 3D rotation
      const rx = px * cosRY - pz * sinRY;
      const rz1 = px * sinRY + pz * cosRY;
      const ry = py * cosRX - rz1 * sinRX;
      const rz = py * sinRX + rz1 * cosRX;

      // Perspective projection
      const fov = 3.2;
      const depth = fov + rz;
      if (depth < 0.1) continue;
      const ps = fov / depth;

      const sx = cx + rx * scale * ps;
      const sy = cy + ry * scale * ps;

      proj.push({ sx, sy, depth: rz, ps, p });
    }

    // Sort back to front
    proj.sort((a, b) => a.depth - b.depth);

    // ═══ RENDER HIGH-FIDELITY PARTICLES ═══
    for (let i = 0; i < proj.length; i++) {
      const { sx, sy, ps, p } = proj[i];
      
      // Determine size based on original brightness and perspective
      let size = (1.0 + p.alpha * 2.5) * ps;
      
      // Depth fade (dim distant particles)
      let depthFade = Math.max(0.1, Math.min(1.0, (proj[i].depth + 1.0) / 2.0));
      
      // Increase opacity when there is bass (pulsing glow)
      let finalAlpha = (p.alpha * 0.7 + 0.3) * depthFade;
      if (bass > 0.4) finalAlpha += (bass - 0.4) * p.alpha;

      // We use the EXACT colors from the high-fidelity generated image!
      // This is what makes it look breathtakingly beautiful and photorealistic.
      // If the point is very bright, give it extra bloom.
      if (p.alpha > 0.8) {
        this.ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${finalAlpha})`;
        this.ctx.fillRect(sx - size/2, sy - size/2, size, size);
        
        // Bloom
        size *= 2.5;
        this.ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${finalAlpha * 0.3})`;
        this.ctx.fillRect(sx - size/2, sy - size/2, size, size);
      } else {
        this.ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${finalAlpha})`;
        this.ctx.fillRect(sx - size/2, sy - size/2, size, size);
      }
    }
  }
}
