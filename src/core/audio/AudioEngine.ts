export interface AudioFeatures {
  frequencyData: Float32Array;
  timeDomainData: Float32Array;
  bass: number;
  mid: number;
  treble: number;
  rms: number;
  spectralCentroid: number;
  isBeat: boolean;
  beatIntensity: number;
  bassSmooth: number;
  midSmooth: number;
  trebleSmooth: number;
  rmsSmooth: number;
  energy: number;
  valence: number;
}

const FFT_SIZE = 2048;
const SMOOTHING = 0.8;

// Frequency band ranges (bin indices for 44100Hz sample rate)
const BASS_END = Math.floor(250 / (44100 / FFT_SIZE));
const MID_END = Math.floor(4000 / (44100 / FFT_SIZE));

export class AudioEngine {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  private frequencyData: Float32Array<ArrayBuffer> = new Float32Array(FFT_SIZE / 2);
  private timeDomainData: Float32Array<ArrayBuffer> = new Float32Array(FFT_SIZE);

  // Smoothed values
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;
  private rmsSmooth = 0;

  // Beat detection state
  private prevEnergy = 0;
  private energyHistory: number[] = [];
  private beatCooldown = 0;

  // Spectral flux for beat detection
  private prevSpectrum: Float32Array<ArrayBuffer> = new Float32Array(FFT_SIZE / 2);

  async getDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }

  async findBlackHole(): Promise<string | null> {
    const devices = await this.getDevices();
    const blackhole = devices.find((d) =>
      d.label.toLowerCase().includes("blackhole")
    );
    return blackhole?.deviceId ?? null;
  }

  async connect(deviceId?: string): Promise<void> {
    this.disconnect();

    this.context = new AudioContext({ sampleRate: 44100 });
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = SMOOTHING;

    const constraints: MediaStreamConstraints = {
      audio: deviceId
        ? { deviceId: { exact: deviceId } }
        : true,
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.source = this.context.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);

    this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Float32Array(this.analyser.fftSize);
    this.prevSpectrum = new Float32Array(this.analyser.frequencyBinCount);
  }

  disconnect(): void {
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.context?.state !== "closed") {
      this.context?.close();
    }
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.bassSmooth = 0;
    this.midSmooth = 0;
    this.trebleSmooth = 0;
    this.rmsSmooth = 0;
  }

  getFeatures(): AudioFeatures {
    if (!this.analyser) {
      return this.emptyFeatures();
    }

    this.analyser.getFloatFrequencyData(this.frequencyData);
    this.analyser.getFloatTimeDomainData(this.timeDomainData);

    // Normalize frequency data from dB (-100 to 0) to 0-1
    const numBins = this.frequencyData.length;
    const normalized = new Float32Array(numBins);
    for (let i = 0; i < numBins; i++) {
      normalized[i] = Math.max(0, (this.frequencyData[i] + 100) / 100);
    }

    // Band energies
    const bass = this.bandEnergy(normalized, 0, BASS_END);
    const mid = this.bandEnergy(normalized, BASS_END, MID_END);
    const treble = this.bandEnergy(normalized, MID_END, numBins);

    // RMS from time domain
    let rmsSum = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      rmsSum += this.timeDomainData[i] * this.timeDomainData[i];
    }
    const rms = Math.min(1, Math.sqrt(rmsSum / this.timeDomainData.length) * 3);

    // Spectral centroid (brightness)
    let weightedSum = 0;
    let totalEnergy = 0;
    for (let i = 0; i < numBins; i++) {
      weightedSum += normalized[i] * i;
      totalEnergy += normalized[i];
    }
    const spectralCentroid =
      totalEnergy > 0
        ? (weightedSum / totalEnergy / numBins)
        : 0;

    // Smooth values
    this.bassSmooth = this.bassSmooth * 0.92 + bass * 0.08;
    this.midSmooth = this.midSmooth * 0.88 + mid * 0.12;
    this.trebleSmooth = this.trebleSmooth * 0.7 + treble * 0.3;
    this.rmsSmooth = this.rmsSmooth * 0.85 + rms * 0.15;

    // Beat detection via spectral flux
    let flux = 0;
    for (let i = 0; i < numBins; i++) {
      const diff = normalized[i] - this.prevSpectrum[i];
      if (diff > 0) flux += diff;
    }
    this.prevSpectrum.set(normalized);

    this.energyHistory.push(flux);
    if (this.energyHistory.length > 43) this.energyHistory.shift(); // ~0.7 seconds at 60fps

    const avgFlux =
      this.energyHistory.reduce((a, b) => a + b, 0) /
      this.energyHistory.length;

    this.beatCooldown = Math.max(0, this.beatCooldown - 1);
    const isBeat = flux > avgFlux * 1.5 && this.beatCooldown === 0 && flux > 0.3;
    const beatIntensity = isBeat ? Math.min(1, (flux - avgFlux) / avgFlux) : 0;

    if (isBeat) this.beatCooldown = 8; // ~130ms cooldown

    // Mood: energy and valence
    const energy = Math.min(1, this.rmsSmooth * 1.5 + bass * 0.5);
    const valence = spectralCentroid; // Brighter sound = higher valence

    this.prevEnergy = rms;

    return {
      frequencyData: normalized,
      timeDomainData: this.timeDomainData,
      bass,
      mid,
      treble,
      rms,
      spectralCentroid,
      isBeat,
      beatIntensity,
      bassSmooth: this.bassSmooth,
      midSmooth: this.midSmooth,
      trebleSmooth: this.trebleSmooth,
      rmsSmooth: this.rmsSmooth,
      energy,
      valence,
    };
  }

  private bandEnergy(data: Float32Array, start: number, end: number): number {
    let sum = 0;
    const count = end - start;
    for (let i = start; i < end && i < data.length; i++) {
      sum += data[i];
    }
    return count > 0 ? sum / count : 0;
  }

  private emptyFeatures(): AudioFeatures {
    return {
      frequencyData: new Float32Array(FFT_SIZE / 2),
      timeDomainData: new Float32Array(FFT_SIZE),
      bass: 0,
      mid: 0,
      treble: 0,
      rms: 0,
      spectralCentroid: 0,
      isBeat: false,
      beatIntensity: 0,
      bassSmooth: 0,
      midSmooth: 0,
      trebleSmooth: 0,
      rmsSmooth: 0,
      energy: 0,
      valence: 0,
    };
  }

  get isConnected(): boolean {
    return this.context !== null && this.analyser !== null;
  }
}
