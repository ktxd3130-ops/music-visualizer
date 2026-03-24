// ============================================================
// SPEECH RECOGNITION ENGINE
// Web Speech API wrapper with Voice Activity Detection
// Falls back gracefully if browser doesn't support it
// ============================================================

// Web Speech API type declarations for environments without lib.dom.d.ts speech types
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: ISpeechRecognitionEvent) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: ISpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface ISpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: ISpeechRecognitionResultList;
}

interface ISpeechRecognitionResultList {
  length: number;
  [index: number]: ISpeechRecognitionResult;
}

interface ISpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: ISpeechRecognitionAlternative;
}

interface ISpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface ISpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare global {
  interface Window {
    SpeechRecognition: { new (): ISpeechRecognition };
    webkitSpeechRecognition: { new (): ISpeechRecognition };
  }
}

export interface SpeechRecognitionCallbacks {
  onStart: () => void;
  onResult: (transcript: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (error: string) => void;
  onSilenceTimeout: () => void;
}

// Voice Activity Detection config
const VAD_CONFIG = {
  silenceThreshold: 0.01, // RMS below this = silence
  silenceTimeout: 1800, // ms of silence before we consider speech done
  minSpeechDuration: 300, // ms — ignore very short sounds
};

export class SpeechRecognitionEngine {
  private recognition: ISpeechRecognition | null = null;
  private isListening = false;
  private callbacks: SpeechRecognitionCallbacks | null = null;

  // Retry backoff for network errors
  private retryCount = 0;
  private maxRetries = 5;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  // VAD state
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private vadInterval: ReturnType<typeof setInterval> | null = null;
  private silenceStart: number = 0;
  private speechStart: number = 0;
  private isSpeaking = false;

  get supported(): boolean {
    return !!(
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)
    );
  }

  async init(callbacks: SpeechRecognitionCallbacks): Promise<boolean> {
    this.callbacks = callbacks;

    if (!this.supported) {
      console.warn("Web Speech API not supported in this browser");
      return false;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
    };

    this.recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        this.callbacks?.onResult(finalTranscript.trim(), true);
      } else if (interimTranscript) {
        this.callbacks?.onResult(interimTranscript.trim(), false);
      }
    };

    this.recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      // Expected during normal operation — ignore silently
      if (event.error === "no-speech" || event.error === "aborted") return;

      // Network/not-allowed errors: use backoff retry instead of spamming
      if (event.error === "network" || event.error === "not-allowed") {
        this.retryCount++;
        if (this.retryCount <= this.maxRetries) {
          console.warn(`STT ${event.error} — retry ${this.retryCount}/${this.maxRetries}`);
        }
        return;
      }

      this.callbacks?.onError(event.error);
    };

    this.recognition.onend = () => {
      // Auto-restart if we're supposed to be listening
      if (this.isListening) {
        // Backoff delay: 500ms, 1s, 2s, 4s, 8s
        const delay = Math.min(500 * Math.pow(2, this.retryCount), 8000);

        if (this.retryCount > this.maxRetries) {
          console.error("STT: max retries reached, stopping");
          this.callbacks?.onError("Speech recognition unavailable — check your network connection");
          this.isListening = false;
          return;
        }

        this.retryTimer = setTimeout(() => {
          try {
            this.recognition?.start();
            // Reset retry count on successful restart
            setTimeout(() => { this.retryCount = Math.max(0, this.retryCount - 1); }, 3000);
          } catch {
            // Already started, ignore
          }
        }, this.retryCount > 0 ? delay : 100);
      }
    };

    return true;
  }

  async startListening(): Promise<void> {
    if (!this.recognition) return;

    this.isListening = true;
    this.retryCount = 0;
    this.callbacks?.onStart();

    try {
      this.recognition.start();
    } catch {
      // Already started
    }

    // Start VAD for silence detection
    await this.startVAD();
  }

  stopListening(): void {
    this.isListening = false;
    this.retryCount = 0;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.stopVAD();

    try {
      this.recognition?.stop();
    } catch {
      // Already stopped
    }

    this.callbacks?.onEnd();
  }

  // ---- Voice Activity Detection ----

  private async startVAD(): Promise<void> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;

      const source = this.audioContext.createMediaStreamSource(this.micStream);
      source.connect(this.analyser);

      const dataArray = new Float32Array(this.analyser.fftSize);
      this.silenceStart = 0;
      this.isSpeaking = false;

      this.vadInterval = setInterval(() => {
        if (!this.analyser) return;

        this.analyser.getFloatTimeDomainData(dataArray);

        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        const now = Date.now();

        if (rms > VAD_CONFIG.silenceThreshold) {
          // Sound detected
          if (!this.isSpeaking) {
            this.isSpeaking = true;
            this.speechStart = now;
          }
          this.silenceStart = 0;
        } else {
          // Silence detected
          if (this.isSpeaking && this.silenceStart === 0) {
            this.silenceStart = now;
          }

          // Check if silence has lasted long enough
          if (
            this.isSpeaking &&
            this.silenceStart > 0 &&
            now - this.silenceStart > VAD_CONFIG.silenceTimeout
          ) {
            const speechDuration = this.silenceStart - this.speechStart;
            if (speechDuration > VAD_CONFIG.minSpeechDuration) {
              this.callbacks?.onSilenceTimeout();
            }
            this.isSpeaking = false;
            this.silenceStart = 0;
          }
        }
      }, 50); // Check every 50ms
    } catch (err) {
      console.error("VAD setup failed:", err);
    }
  }

  private stopVAD(): void {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    if (this.audioContext?.state !== "closed") {
      this.audioContext?.close();
    }
    this.audioContext = null;
    this.analyser = null;
  }

  // Get current mic RMS for face reactivity
  getMicLevel(): number {
    if (!this.analyser) return 0;
    const dataArray = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    return Math.min(1, Math.sqrt(sum / dataArray.length) * 5);
  }

  destroy(): void {
    this.stopListening();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.recognition = null;
    this.callbacks = null;
  }
}

