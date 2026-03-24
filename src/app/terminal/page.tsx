"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const TerminalFace = dynamic(() => import("../components/TerminalFace"), {
  ssr: false,
});
const Terminal = dynamic(() => import("../components/Terminal"), {
  ssr: false,
});
const TerminalOverlay = dynamic(() => import("../components/TerminalOverlay"), {
  ssr: false,
});

// ============================================================
// ANTIGRAVITY TERMINAL — /terminal route
// Full-screen AI face with voice conversation
// No chrome, no UI — just the face, ready to talk
// ============================================================

export default function TerminalPage() {
  return (
    <div
      className="fixed inset-0"
      style={{
        background: "#0a0a0f",
        cursor: "none",
        userSelect: "none",
      }}
    >
      {/* Three.js face renderer */}
      <TerminalFace />

      {/* Conversation loop orchestrator (no UI) */}
      <Terminal />

      {/* Minimal overlay: status, transcript, settings */}
      <TerminalOverlay />

      {/* Back to visualizer */}
      <Link
        href="/"
        className="fixed top-4 left-4 z-50 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white/30 backdrop-blur-sm transition-all hover:text-white/80 hover:bg-black/60"
        style={{ cursor: "pointer" }}
      >
        ← Visualizer
      </Link>
    </div>
  );
}
