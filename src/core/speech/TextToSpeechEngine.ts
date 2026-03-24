// ============================================================
// TEXT-TO-SPEECH ENGINE
// Supports Web Speech API (free) and OpenAI TTS (premium)
// Routes audio through AnalyserNode for face lip-sync
// ============================================================

export type TTSProvider = "web" | "openai";

export interface TTSCallbacks {
  onStart: () => void;
  onEnd: () => void;
  onError: (error: string) => void;
}

export class TextToSpeechEngine {
  private provider: TTSProvider = "web";
  private callbacks: TTSCallbacks | null = null;
  private isSpeaking = false;

  // Web Speech API
  private utterance: SpeechSynthesisUtterance | null = null;
  private selectedVoice: SpeechSynthesisVoice | null = null;

  // Audio analysis for lip sync (used with API-based TTS)
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;

  // Web Speech API simulation for lip sync
  private webSpeechSimLevel = 0;
  private webSpeechSimInterval: ReturnType<typeof setInterval> | null = null;

  init(callbacks: TTSCallbacks, provider: TTSProvider = "web"): void {
    this.callbacks = callbacks;
    this.provider = provider;
  }

  async speak(text: string, apiKey?: string): Promise<void> {
    this.stop(); // Stop any current speech

    if (this.provider === "openai" && apiKey) {
      await this.speakWithOpenAI(text, apiKey);
    } else {
      this.speakWithWebSpeech(text);
    }
  }

  stop(): void {
    this.isSpeaking = false;

    // Stop Web Speech
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Stop audio buffer playback
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // Already stopped
      }
      this.currentSource = null;
    }

    // Clear web speech simulation
    if (this.webSpeechSimInterval) {
      clearInterval(this.webSpeechSimInterval);
      this.webSpeechSimInterval = null;
    }
    this.webSpeechSimLevel = 0;
  }

  // Get current output audio level for face sync
  getOutputLevel(): number {
    // For API-based TTS, read from analyser
    if (this.analyser && this.isSpeaking) {
      const dataArray = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      return Math.min(1, Math.sqrt(sum / dataArray.length) * 5);
    }

    // For Web Speech API, return simulated level
    return this.webSpeechSimLevel;
  }

  getFrequencyData(): Float32Array {
    if (this.analyser && this.isSpeaking) {
      const data = new Float32Array(this.analyser.frequencyBinCount);
      this.analyser.getFloatFrequencyData(data);
      // Normalize from dB to 0-1
      const normalized = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) {
        normalized[i] = Math.max(0, (data[i] + 100) / 100);
      }
      return normalized;
    }
    return new Float32Array(256);
  }

  getAvailableVoices(): SpeechSynthesisVoice[] {
    if (typeof window === "undefined" || !window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  }

  setVoice(voiceName: string): void {
    const voices = this.getAvailableVoices();
    this.selectedVoice = voices.find((v) => v.name === voiceName) || null;
  }

  get speaking(): boolean {
    return this.isSpeaking;
  }

  // ---- Web Speech API ----

  private speakWithWebSpeech(text: string): void {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.rate = 1.0;
    this.utterance.pitch = 1.0;
    this.utterance.volume = 1.0;

    if (this.selectedVoice) {
      this.utterance.voice = this.selectedVoice;
    } else {
      // Try to find a good default voice
      const voices = this.getAvailableVoices();
      const preferred = voices.find(
        (v) =>
          v.name.includes("Samantha") ||
          v.name.includes("Daniel") ||
          v.name.includes("Google") ||
          v.name.includes("Microsoft")
      );
      if (preferred) this.utterance.voice = preferred;
    }

    this.utterance.onstart = () => {
      this.isSpeaking = true;
      this.callbacks?.onStart();
      this.startWebSpeechSimulation();
    };

    this.utterance.onend = () => {
      this.isSpeaking = false;
      this.stopWebSpeechSimulation();
      this.callbacks?.onEnd();
    };

    this.utterance.onerror = (event) => {
      this.isSpeaking = false;
      this.stopWebSpeechSimulation();
      if (event.error !== "canceled") {
        this.callbacks?.onError(event.error);
      }
    };

    window.speechSynthesis.speak(this.utterance);
  }

  // Simulate audio levels for Web Speech API (can't capture real audio)
  private startWebSpeechSimulation(): void {
    let phase = 0;
    this.webSpeechSimInterval = setInterval(() => {
      phase += 0.15;
      // Natural speech-like amplitude pattern
      this.webSpeechSimLevel =
        0.3 +
        Math.sin(phase * 2.3) * 0.15 +
        Math.sin(phase * 5.7) * 0.1 +
        Math.sin(phase * 11.3) * 0.05 +
        Math.random() * 0.1;
      this.webSpeechSimLevel = Math.max(0, Math.min(1, this.webSpeechSimLevel));
    }, 33); // ~30fps
  }

  private stopWebSpeechSimulation(): void {
    if (this.webSpeechSimInterval) {
      clearInterval(this.webSpeechSimInterval);
      this.webSpeechSimInterval = null;
    }
    this.webSpeechSimLevel = 0;
  }

  // ---- OpenAI TTS (premium path) ----

  private async speakWithOpenAI(text: string, apiKey: string): Promise<void> {
    try {
      // Call our API route which proxies to OpenAI
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, apiKey }),
      });

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      // Set up audio context for playback + analysis
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBuffer;

      // Route: source → analyser → speakers
      this.currentSource.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);

      this.isSpeaking = true;
      this.callbacks?.onStart();

      this.currentSource.onended = () => {
        this.isSpeaking = false;
        this.callbacks?.onEnd();
        this.audioContext?.close();
        this.audioContext = null;
        this.analyser = null;
      };

      this.currentSource.start();
    } catch (err) {
      this.isSpeaking = false;
      this.callbacks?.onError(
        err instanceof Error ? err.message : "TTS failed"
      );
    }
  }

  destroy(): void {
    this.stop();
    this.audioContext?.close();
    this.audioContext = null;
    this.analyser = null;
    this.callbacks = null;
  }
}
