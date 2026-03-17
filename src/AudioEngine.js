export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.frequencyData = null;
    this.timeDomainData = null;
    this.isInitialized = false;
  }

  async initialize(deviceId) {
    if (this.isInitialized) {
      await this.stop();
    }

    try {
      // Create new AudioContext (must be after user gesture)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      const constraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Setup Analyser
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.6; // Snappier for vocal tracking

      // Connect source to analyser
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      
      // We do NOT connect analyser to destination to avoid feedback loops!
      
      // Arrays to hold data
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeDomainData = new Uint8Array(this.analyser.fftSize);
      
      this.isInitialized = true;
      return true;
    } catch (err) {
      console.error("Failed to initialize AudioEngine:", err);
      return false;
    }
  }

  getFrequencyData() {
    if (!this.isInitialized) return null;
    this.analyser.getByteFrequencyData(this.frequencyData);
    return this.frequencyData;
  }

  getTimeDomainData() {
    if (!this.isInitialized) return null;
    this.analyser.getByteTimeDomainData(this.timeDomainData);
    return this.timeDomainData;
  }
  
  // Calculate average volume for overall energy mapping (e.g., face mouth size)
  getVolume() {
    const data = this.getFrequencyData();
    if (!data) return 0;
    
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
       sum += data[i];
    }
    return sum / data.length; // 0 to 255
  }

  // Isolate VOCAL frequency energy into sub-bands + spectral centroid
  // With fftSize=2048 and sampleRate=44100: each bin ≈ 21.5Hz
  // Low-Vocal (500-900Hz)  ≈ bins 23-42  → jaw drop (height)
  //   ↑ starts at 500Hz to avoid bass drum harmonics bleeding in
  // Mid-Vocal (900-2.5kHz) ≈ bins 42-116 → lip width (stretch) 
  // Hi-Vocal  (2.5-4kHz)   ≈ bins 116-186 → lip tension/purse
  getVocalBands() {
    const data = this.getFrequencyData();
    if (!data) return { low: 0, mid: 0, high: 0, centroid: 0.5, total: 0 };
    
    // Low-vocal: 500-900Hz (bins 23-42) — avoids bass kick harmonics
    let lowSum = 0;
    for (let i = 23; i <= 42; i++) lowSum += data[i];
    const low = lowSum / (20 * 255);
    
    // Mid-vocal: 900-2500Hz (bins 42-116)
    let midSum = 0;
    for (let i = 42; i <= 116; i++) midSum += data[i];
    const mid = midSum / (75 * 255);
    
    // Hi-vocal: 2500-4000Hz (bins 116-186)
    let highSum = 0;
    for (let i = 116; i <= 186; i++) highSum += data[i];
    const high = highSum / (71 * 255);
    
    // Total vocal energy (all three combined)
    const total = (low + mid + high) / 3;
    
    // Spectral centroid across vocal range (bins 14-186)
    // Weighted average of bin index by amplitude
    let weightedSum = 0;
    let ampSum = 0;
    for (let i = 14; i <= 186; i++) {
      weightedSum += i * data[i];
      ampSum += data[i];
    }
    // Normalize to 0..1 (0 = low/dark vowels, 1 = bright/sibilant)
    const rawCentroid = ampSum > 0 ? (weightedSum / ampSum - 14) / (186 - 14) : 0.5;
    const centroid = Math.max(0, Math.min(1, rawCentroid));
    
    return { low, mid, high, centroid, total };
  }

  async stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.isInitialized = false;
  }
}
