"use client";

import { useState, useEffect, useCallback } from "react";
import { useTerminalStore, TerminalState } from "@/stores/terminalStore";

// ============================================================
// TERMINAL OVERLAY — Minimal UI floating over the face
// Status indicator, transcript, and hidden settings panel
// ============================================================

const STATE_LABELS: Record<TerminalState, string> = {
  idle: "ready",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  error: "error",
};

const STATE_COLORS: Record<TerminalState, string> = {
  idle: "rgba(255,255,255,0.15)",
  listening: "rgba(100, 220, 255, 0.5)",
  thinking: "rgba(180, 130, 255, 0.5)",
  speaking: "rgba(140, 200, 255, 0.5)",
  error: "rgba(255, 80, 80, 0.5)",
};

export default function TerminalOverlay() {
  const state = useTerminalStore((s) => s.state);
  const isAmbient = useTerminalStore((s) => s.isAmbient);
  const showTranscript = useTerminalStore((s) => s.showTranscript);
  const currentTranscript = useTerminalStore((s) => s.currentTranscript);
  const lastResponse = useTerminalStore((s) => s.lastResponse);
  const errorMessage = useTerminalStore((s) => s.errorMessage);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [pulseClass, setPulseClass] = useState("");

  // Pulse animation on state change
  useEffect(() => {
    setPulseClass("animate-pulse-once");
    const timer = setTimeout(() => setPulseClass(""), 600);
    return () => clearTimeout(timer);
  }, [state]);

  // Triple-click to open settings
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (clickCount >= 3) {
      setSettingsOpen((prev) => !prev);
      setClickCount(0);
    } else if (clickCount > 0) {
      timer = setTimeout(() => setClickCount(0), 500);
    }
    return () => clearTimeout(timer);
  }, [clickCount]);

  const handleClick = useCallback(() => {
    setClickCount((c) => c + 1);
  }, []);

  // Keyboard: Escape closes settings
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && settingsOpen) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [settingsOpen]);

  return (
    <>
      {/* Status indicator */}
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none"
        style={{
          opacity: isAmbient ? 0.05 : 1,
          transition: "opacity 2s ease",
        }}
      >
        <div
          className={`text-xs tracking-[3px] uppercase transition-colors duration-800 ${pulseClass}`}
          style={{ color: STATE_COLORS[state] }}
        >
          {state === "error" && errorMessage
            ? errorMessage
            : STATE_LABELS[state]}
        </div>
      </div>

      {/* Transcript */}
      {showTranscript && (
        <div
          className="fixed bottom-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none max-w-lg text-center"
          style={{
            opacity:
              currentTranscript || lastResponse
                ? isAmbient
                  ? 0.05
                  : 1
                : 0,
            transition: "opacity 0.5s ease",
          }}
        >
          {state === "listening" && currentTranscript && (
            <p className="text-sm text-cyan-300/40 mb-1 italic">
              {currentTranscript}
            </p>
          )}
          {state === "thinking" && currentTranscript && (
            <p className="text-sm text-purple-300/30">
              &ldquo;{currentTranscript}&rdquo;
            </p>
          )}
          {(state === "speaking" || state === "idle") && lastResponse && (
            <p className="text-sm text-white/20 leading-relaxed">
              {lastResponse.length > 200
                ? lastResponse.slice(0, 200) + "..."
                : lastResponse}
            </p>
          )}
        </div>
      )}

      {/* Listening indicator dot */}
      {state === "listening" && (
        <div className="fixed top-6 right-6 z-40 pointer-events-none">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        </div>
      )}

      {/* Thinking spinner */}
      {state === "thinking" && (
        <div className="fixed top-6 right-6 z-40 pointer-events-none">
          <div className="w-3 h-3 rounded-full border border-purple-400/50 border-t-purple-400 animate-spin" />
        </div>
      )}

      {/* Click target for triple-click settings */}
      <div
        className="fixed inset-0 z-30"
        onClick={handleClick}
        style={{ cursor: "none" }}
      />

      {/* Settings panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Keyboard hints — only show briefly on first load */}
      <KeyboardHints />
    </>
  );
}

// ---- Settings Panel ----
function SettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    showTranscript,
    toggleTranscript,
    claudeModel,
    setClaudeModel,
    alwaysOn,
    setAlwaysOn,
    clearMessages,
    messages,
  } = useTerminalStore();

  return (
    <div
      className="fixed top-0 right-0 h-full w-72 z-50 transition-transform duration-300 ease-out"
      style={{
        transform: open ? "translateX(0)" : "translateX(100%)",
        background: "rgba(10, 10, 15, 0.95)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        cursor: "default",
      }}
    >
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-[10px] tracking-[3px] uppercase text-white/30">
            Antigravity Terminal
          </h3>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 text-lg"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* Claude Model */}
          <div className="flex justify-between items-center py-2 border-b border-white/5">
            <label className="text-xs text-white/50">Model</label>
            <select
              value={claudeModel}
              onChange={(e) => setClaudeModel(e.target.value)}
              className="bg-white/5 border border-white/10 text-white/70 text-xs px-2 py-1 rounded"
            >
              <option value="claude-sonnet-4-20250514">
                Sonnet (fast)
              </option>
              <option value="claude-opus-4-0-20250115">
                Opus (deep)
              </option>
            </select>
          </div>

          {/* Show Transcript */}
          <div className="flex justify-between items-center py-2 border-b border-white/5">
            <label className="text-xs text-white/50">Show Transcript</label>
            <input
              type="checkbox"
              checked={showTranscript}
              onChange={toggleTranscript}
              className="accent-cyan-500"
            />
          </div>

          {/* Always-On Listening */}
          <div className="flex justify-between items-center py-2 border-b border-white/5">
            <label className="text-xs text-white/50">Always-On</label>
            <input
              type="checkbox"
              checked={alwaysOn}
              onChange={(e) => setAlwaysOn(e.target.checked)}
              className="accent-cyan-500"
            />
          </div>

          {/* Conversation info */}
          <div className="flex justify-between items-center py-2 border-b border-white/5">
            <label className="text-xs text-white/50">Messages</label>
            <span className="text-xs text-white/40">{messages.length}</span>
          </div>

          {/* Clear conversation */}
          <button
            onClick={() => {
              clearMessages();
              onClose();
            }}
            className="w-full mt-4 py-2 text-xs text-red-400/60 border border-red-400/20 rounded hover:bg-red-400/10 transition-colors"
          >
            Clear Conversation
          </button>
        </div>

        {/* Footer */}
        <div className="absolute bottom-6 left-6 right-6">
          <p className="text-[10px] text-white/15 text-center">
            Space: talk · Esc: stop · Triple-click: settings
          </p>
        </div>
      </div>
    </div>
  );
}

// ---- Keyboard Hints (auto-fade) ----
function KeyboardHints() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none"
      style={{
        opacity: visible ? 0.3 : 0,
        transition: "opacity 2s ease",
      }}
    >
      <p className="text-[10px] tracking-[2px] uppercase text-white/30">
        Space to talk · Esc to stop · Triple-click for settings
      </p>
    </div>
  );
}
