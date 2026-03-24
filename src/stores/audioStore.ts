import { create } from "zustand";
import { AudioEngine, AudioFeatures } from "@/core/audio/AudioEngine";

interface AudioState {
  engine: AudioEngine;
  isConnected: boolean;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  features: AudioFeatures;
  connect: (deviceId?: string) => Promise<void>;
  disconnect: () => void;
  loadDevices: () => Promise<void>;
  updateFeatures: () => void;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  engine: new AudioEngine(),
  isConnected: false,
  devices: [],
  selectedDeviceId: null,
  features: {
    frequencyData: new Float32Array(1024),
    timeDomainData: new Float32Array(2048),
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
  },

  loadDevices: async () => {
    const { engine } = get();
    const devices = await engine.getDevices();
    const blackholeId = await engine.findBlackHole();
    set({ devices, selectedDeviceId: blackholeId });
  },

  connect: async (deviceId?: string) => {
    const { engine } = get();
    const id = deviceId ?? get().selectedDeviceId ?? undefined;
    await engine.connect(id);
    set({ isConnected: true, selectedDeviceId: id ?? null });
  },

  disconnect: () => {
    const { engine } = get();
    engine.disconnect();
    set({ isConnected: false });
  },

  updateFeatures: () => {
    const { engine } = get();
    const features = engine.getFeatures();
    set({ features });
  },
}));
