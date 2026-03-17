export class Visualizer {
  constructor(canvas, audioEngine, lyricManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audioEngine = audioEngine;
    this.lyricManager = lyricManager;
    
    this.mode = 'bars';
    this.animationFrameId = null;
    this.isRunning = false;
    
    // Build procedural face particles
    this.faceParticles = [];
    this.buildFace();
    
    // Smoothed mouth state
    this.sLow = 0;
    this.sMid = 0;
    this.sTotal = 0;

    this.colors = {
      primary: '#8A2BE2',
      secondary: '#00FFFF',
      accent: '#FF00FF'
    };
  }

  setMode(mode) { this.mode = mode; }

  // ═══════════════════════════════════════════════
  // PROCEDURAL FACE — built from pure math
  // No depth map, no scary voids, fully controllable
  // ═══════════════════════════════════════════════
  buildFace() {
    this.faceParticles = [];
    const N = 14000;
    
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      
      let x = Math.sin(phi) * Math.cos(theta);
      let y = Math.sin(phi) * Math.sin(theta);
      let z = Math.cos(phi);
      
      // Head shape: taller, narrower
      x *= 0.72;
      y *= 0.95;
      z *= 0.6;
      
      // Only front-facing
      if (z < -0.08) continue;
      
      // Chin taper
      if (y > 0.15) {
        const cf = 1 - (y - 0.15) * 0.4;
        x *= Math.max(0.35, cf);
      }
      
      // Brow ridge: push forward above eyes
      if (y < -0.12 && y > -0.25 && Math.abs(x) < 0.5) {
        z += 0.07 * (1 - Math.abs(y + 0.18) / 0.07);
      }
      
      // Forehead rounding
      if (y < -0.4) z += (y + 0.4) * -0.2;

      let region = 'face';
      
      // Eyes: deeper sockets
      const eyeY = -0.16;
      const eyeSp = 0.22;
      for (const side of [-1, 1]) {
        const ecx = side * eyeSp;
        const dx = (x - ecx) / 0.13;
        const dy = (y - eyeY) / 0.055;
        if (dx * dx + dy * dy < 1) {
          region = 'eye';
          z -= 0.12; // deeper indent
        }
      }
      
      // Nose: much more pronounced
      if (Math.abs(x) < 0.07 && y > -0.1 && y < 0.15) {
        const noseProfile = 1 - Math.abs(x) / 0.07;
        z += 0.14 * noseProfile;
        // Nose tip bulge
        if (y > 0.06 && y < 0.15) {
          z += 0.06 * Math.max(0, 1 - Math.abs(y - 0.1) / 0.05);
        }
      }
      // Nostrils: indent on sides of nose tip
      for (const side of [-1, 1]) {
        const ndx = (x - side * 0.05) / 0.03;
        const ndy = (y - 0.13) / 0.02;
        if (ndx * ndx + ndy * ndy < 1) {
          z -= 0.04;
        }
      }
      
      // Cheekbones: prominent
      if (Math.abs(x) > 0.28 && Math.abs(x) < 0.55 && y > -0.1 && y < 0.15) {
        z += 0.08 * (1 - Math.abs(y - 0.02) / 0.13);
      }
      
      // Upper lip (y 0.2 to 0.28)
      if (y > 0.2 && y < 0.28 && Math.abs(x) < 0.16) {
        region = 'upperLip';
        const bow = Math.cos(x * 14) * 0.015;
        z += 0.08 + bow;
      }
      
      // Lower lip (y 0.28 to 0.36)
      if (y > 0.28 && y < 0.36 && Math.abs(x) < 0.14) {
        region = 'lowerLip';
        z += 0.05;
      }
      
      // Jaw
      if (y > 0.36) region = 'jaw';
      
      // Under-eye area: slight bags for realism
      for (const side of [-1, 1]) {
        const ubx = (x - side * eyeSp) / 0.1;
        const uby = (y - (eyeY + 0.08)) / 0.03;
        if (ubx * ubx + uby * uby < 1) {
          z += 0.02;
        }
      }

      this.faceParticles.push({
        x, y, z,
        baseX: x, baseY: y, baseZ: z,
        region,
        drift: Math.random() * 0.003,
        phase: Math.random() * Math.PI * 2,
      });
    }
    
    console.log(`Procedural face: ${this.faceParticles.length} particles`);
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
    this.ctx.fillStyle = 'rgba(13, 14, 21, 0.2)';
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
  // 3D PROCEDURAL PARTICLE FACE
  // ═══════════════════════════════════════════════
  drawFace(width, height) {
    const dataArray = this.audioEngine.getFrequencyData();
    if (!dataArray) return;

    // Full clear — deep dark blue-black
    this.ctx.fillStyle = '#020208';
    this.ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const t = performance.now() * 0.001;
    const scale = Math.min(width, height) * 0.42;

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

    // Bass for glow only
    let bass = 0;
    for (let i = 0; i < 8; i++) bass += dataArray[i];
    bass /= (8 * 255);

    // ═══ 3D HEAD ROTATION ═══
    const rotY = Math.sin(t * 0.28) * 0.12 + Math.sin(t * 0.65) * 0.04;
    const rotX = Math.sin(t * 0.4) * 0.05;
    const cosRY = Math.cos(rotY), sinRY = Math.sin(rotY);
    const cosRX = Math.cos(rotX), sinRX = Math.sin(rotX);

    // ═══ MOUTH ANIMATION VALUES ═══
    const mouthOpen = this.sLow * 0.35; // How far jaw drops
    const mouthWide = this.sMid * 0.12;  // How wide lips stretch

    // Project all particles
    const proj = [];
    for (let i = 0; i < this.faceParticles.length; i++) {
      const p = this.faceParticles[i];
      let px = p.baseX;
      let py = p.baseY;
      let pz = p.baseZ;

      // ─── ANIMATE MOUTH ───
      if (p.region === 'lowerLip') {
        py += mouthOpen;         // drop down
        px *= (1 + mouthWide);   // stretch wider
      } else if (p.region === 'jaw') {
        py += mouthOpen * 0.7;   // jaw follows
      } else if (p.region === 'upperLip') {
        py -= mouthOpen * 0.08;  // upper lip lifts slightly
        px *= (1 + mouthWide * 0.5);
      }

      // Subtle breathing
      const breathe = Math.sin(t * 1.2 + p.phase) * 0.003;
      py += breathe;

      // 3D rotation
      const rx = px * cosRY - pz * sinRY;
      const rz1 = px * sinRY + pz * cosRY;
      const ry = py * cosRX - rz1 * sinRX;
      const rz = py * sinRX + rz1 * cosRX;

      // Perspective
      const fov = 2.8;
      const depth = fov + rz;
      if (depth < 0.2) continue;
      const ps = fov / depth;

      const sx = cx + rx * scale * ps;
      const sy = cy + ry * scale * ps;

      proj.push({ sx, sy, depth: rz, ps, region: p.region, idx: i });
    }

    // Sort back to front
    proj.sort((a, b) => a.depth - b.depth);

    // ═══ AMBIENT GLOW (bass-reactive) ═══
    const grd = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.6);
    grd.addColorStop(0, `rgba(30, 60, 200, ${0.08 + bass * 0.08})`);
    grd.addColorStop(0.5, `rgba(15, 30, 120, ${0.04 + bass * 0.04})`);
    grd.addColorStop(1, 'rgba(5, 10, 40, 0)');
    this.ctx.fillStyle = grd;
    this.ctx.fillRect(0, 0, width, height);

    // ═══ RENDER PARTICLES ═══
    for (let i = 0; i < proj.length; i++) {
      const p = proj[i];
      const size = Math.max(1.2, 3.5 * p.ps);

      // Color by region (all blue family, no scary contrast)
      let r, g, b, alpha;
      
      if (p.region === 'eye') {
        // Eyes: brighter, slightly cyan
        r = 100; g = 180; b = 255;
        alpha = 0.95;
      } else if (p.region === 'upperLip' || p.region === 'lowerLip') {
        // Lips: warm blue-violet
        r = 120; g = 130; b = 255;
        alpha = 0.85 + this.sTotal * 0.15;
      } else {
        // Face: core blue
        r = 50 + bass * 40;
        g = 100 + bass * 30;
        b = 230;
        alpha = 0.7 + bass * 0.2;
      }

      // Depth fade (further = dimmer)
      const df = Math.max(0.3, Math.min(1, (p.depth + 0.8) / 1.6));
      alpha *= df;

      if (size > 2) {
        const grad = this.ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, size * 1.8);
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(0.35, `rgba(${r},${g},${b},${alpha * 0.5})`);
        grad.addColorStop(1, `rgba(${r * 0.4},${g * 0.5},${b},0)`);
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(p.sx - size * 1.8, p.sy - size * 1.8, size * 3.6, size * 3.6);
      } else {
        this.ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        this.ctx.fillRect(p.sx - 1, p.sy - 1, 2, 2);
      }
    }

    // ═══ WIREFRAME FEATURE LINES ═══
    // These make the face immediately readable
    const proj3D = (px, py, pz) => {
      const rx = px * cosRY - pz * sinRY;
      const rz1 = px * sinRY + pz * cosRY;
      const ry = py * cosRX - rz1 * sinRX;
      const rz = py * sinRX + rz1 * cosRX;
      const d = 2.8 + rz;
      if (d < 0.2) return null;
      const ps = 2.8 / d;
      return [cx + rx * scale * ps, cy + ry * scale * ps, d];
    };

    const drawCurve = (pts, color, lw) => {
      const projected = pts.map(p => proj3D(p[0], p[1], p[2])).filter(p => p);
      if (projected.length < 2) return;
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = lw;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.shadowBlur = lw * 4;
      this.ctx.shadowColor = color;
      this.ctx.beginPath();
      this.ctx.moveTo(projected[0][0], projected[0][1]);
      for (let i = 1; i < projected.length; i++) {
        const xc = (projected[i][0] + projected[i-1][0]) / 2;
        const yc = (projected[i][1] + projected[i-1][1]) / 2;
        this.ctx.quadraticCurveTo(projected[i-1][0], projected[i-1][1], xc, yc);
      }
      this.ctx.lineTo(projected[projected.length-1][0], projected[projected.length-1][1]);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    };

    const lineColor = 'rgba(130, 180, 255, 0.4)';
    const lipColor = `rgba(150, 140, 255, ${0.4 + this.sTotal * 0.3})`;
    const eyeColor = 'rgba(140, 200, 255, 0.55)';

    // ── EYEBROWS ──
    const browLift = this.sTotal * 0.02;
    for (const side of [-1, 1]) {
      drawCurve([
        [side * 0.12, -0.26 - browLift, 0.45],
        [side * 0.22, -0.29 - browLift, 0.40],
        [side * 0.32, -0.26 - browLift, 0.30],
      ], lineColor, 1.8);
    }

    // ── EYES (almond outline) ──
    for (const side of [-1, 1]) {
      const eCx = side * 0.22;
      const eCy = -0.16;
      drawCurve([
        [eCx - side * 0.11, eCy, 0.38],
        [eCx - side * 0.04, eCy - 0.04, 0.42],
        [eCx + side * 0.03, eCy - 0.035, 0.42],
        [eCx + side * 0.11, eCy, 0.36],
      ], eyeColor, 1.5);
      drawCurve([
        [eCx - side * 0.11, eCy, 0.38],
        [eCx - side * 0.03, eCy + 0.02, 0.40],
        [eCx + side * 0.04, eCy + 0.018, 0.40],
        [eCx + side * 0.11, eCy, 0.36],
      ], eyeColor, 1);
    }

    // ── NOSE ──
    drawCurve([
      [0, -0.06, 0.55],
      [-0.005, 0.02, 0.65],
      [-0.01, 0.08, 0.7],
      [0, 0.12, 0.68],
    ], lineColor, 1.2);
    // Nose tip
    drawCurve([
      [-0.04, 0.13, 0.58],
      [0, 0.14, 0.68],
      [0.04, 0.13, 0.58],
    ], lineColor, 1);

    // ── UPPER LIP (with mouth animation) ──
    const ulY = 0.22 - mouthOpen * 0.08;
    const ulZ = 0.62;
    const lipW = 0.14 * (1 + mouthWide);
    drawCurve([
      [-lipW, ulY + 0.005, ulZ - 0.08],
      [-lipW * 0.55, ulY - 0.015, ulZ],
      [-0.012, ulY + 0.003, ulZ + 0.02],
      [0, ulY - 0.008, ulZ + 0.03],
      [0.012, ulY + 0.003, ulZ + 0.02],
      [lipW * 0.55, ulY - 0.015, ulZ],
      [lipW, ulY + 0.005, ulZ - 0.08],
    ], lipColor, 2);

    // ── LOWER LIP (drops with jaw) ──
    const llY = 0.3 + mouthOpen;
    const llZ = 0.56;
    drawCurve([
      [-lipW * 0.85, 0.26 + mouthOpen * 0.1, llZ - 0.06],
      [-lipW * 0.4, llY + 0.008, llZ],
      [0, llY + 0.015, llZ + 0.02],
      [lipW * 0.4, llY + 0.008, llZ],
      [lipW * 0.85, 0.26 + mouthOpen * 0.1, llZ - 0.06],
    ], lipColor, 1.8);

    // ═══ MOUTH GAP GLOW ═══
    if (mouthOpen > 0.02) {
      const mouthCenterY = cy + 0.27 * scale + mouthOpen * scale * 0.3;
      const openness = Math.min(1, mouthOpen * 4);
      const gapGlow = this.ctx.createRadialGradient(
        cx, mouthCenterY, 0, cx, mouthCenterY, mouthOpen * scale * 1.5
      );
      gapGlow.addColorStop(0, `rgba(20, 10, 60, ${openness * 0.6})`);
      gapGlow.addColorStop(0.5, `rgba(40, 30, 120, ${openness * 0.15})`);
      gapGlow.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.fillStyle = gapGlow;
      this.ctx.beginPath();
      this.ctx.ellipse(cx, mouthCenterY, lipW * scale * (1 + mouthWide), 
        mouthOpen * scale * 0.6, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // ═══ FLOATING DEBRIS ═══
    for (let i = 0; i < 120; i++) {
      const angle = (i / 120) * Math.PI * 2 + t * 0.06;
      const dist = scale * (1.3 + Math.sin(t * 0.3 + i * 0.2) * 0.4);
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist * 0.8;
      const fv = (dataArray[i % dataArray.length] || 0) / 255;
      const sz = 1 + fv * 2.5;
      this.ctx.fillStyle = `rgba(70, 130, 255, ${0.1 + fv * 0.35})`;
      this.ctx.fillRect(px - sz * 0.5, py - sz * 0.5, sz, sz);
    }

    // ═══ SCAN LINE ═══
    const scanY = cy - scale * 1.2 + ((t * 0.12) % 1) * scale * 2.6;
    this.ctx.strokeStyle = 'rgba(100, 160, 255, 0.06)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(cx - scale, scanY);
    this.ctx.lineTo(cx + scale, scanY);
    this.ctx.stroke();
  }
}
