import { create } from "zustand";

export type TerminalState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface TerminalStore {
  // State machine
  state: TerminalState;
  prevState: TerminalState;
  stateTime: number;
  setState: (state: TerminalState) => void;

  // Conversation
  messages: ConversationMessage[];
  addMessage: (msg: ConversationMessage) => void;
  clearMessages: () => void;

  // Transcript display
  currentTranscript: string; // Live STT transcript
  lastResponse: string; // Last Claude response
  setTranscript: (text: string) => void;
  setLastResponse: (text: string) => void;

  // Audio levels (for face reactivity)
  inputAudioLevel: number; // Mic level (listening state)
  outputAudioLevel: number; // TTS level (speaking state)
  setInputAudioLevel: (level: number) => void;
  setOutputAudioLevel: (level: number) => void;

  // Settings
  showTranscript: boolean;
  ttsVoice: string;
  claudeModel: string;
  alwaysOn: boolean;
  toggleTranscript: () => void;
  setTtsVoice: (voice: string) => void;
  setClaudeModel: (model: string) => void;
  setAlwaysOn: (on: boolean) => void;

  // Ambient mode
  isAmbient: boolean;
  ambientTimer: number;
  setAmbient: (ambient: boolean) => void;
  resetAmbientTimer: () => void;

  // Error
  errorMessage: string | null;
  setError: (msg: string | null) => void;
}

const MAX_MESSAGES = 40; // Rolling context window
const AMBIENT_TIMEOUT = 300; // 5 minutes of no interaction

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  // State machine
  state: "idle",
  prevState: "idle",
  stateTime: 0,
  setState: (newState) => {
    const current = get().state;
    if (newState === current) return;
    set({
      prevState: current,
      state: newState,
      stateTime: Date.now(),
      isAmbient: false,
    });
    // Reset ambient timer on any state change
    get().resetAmbientTimer();
  },

  // Conversation
  messages: [],
  addMessage: (msg) => {
    const messages = [...get().messages, msg];
    // Rolling window — keep last N messages
    if (messages.length > MAX_MESSAGES) {
      messages.splice(0, messages.length - MAX_MESSAGES);
    }
    set({ messages });
  },
  clearMessages: () => set({ messages: [], currentTranscript: "", lastResponse: "" }),

  // Transcript
  currentTranscript: "",
  lastResponse: "",
  setTranscript: (text) => set({ currentTranscript: text }),
  setLastResponse: (text) => set({ lastResponse: text }),

  // Audio levels
  inputAudioLevel: 0,
  outputAudioLevel: 0,
  setInputAudioLevel: (level) => set({ inputAudioLevel: level }),
  setOutputAudioLevel: (level) => set({ outputAudioLevel: level }),

  // Settings
  showTranscript: true,
  ttsVoice: "default",
  claudeModel: "claude-sonnet-4-20250514",
  alwaysOn: true,
  toggleTranscript: () => set({ showTranscript: !get().showTranscript }),
  setTtsVoice: (voice) => set({ ttsVoice: voice }),
  setClaudeModel: (model) => set({ claudeModel: model }),
  setAlwaysOn: (on) => set({ alwaysOn: on }),

  // Ambient mode
  isAmbient: false,
  ambientTimer: 0,
  setAmbient: (ambient) => set({ isAmbient: ambient }),
  resetAmbientTimer: () => set({ ambientTimer: Date.now() }),

  // Error
  errorMessage: null,
  setError: (msg) => set({ errorMessage: msg }),
}));
