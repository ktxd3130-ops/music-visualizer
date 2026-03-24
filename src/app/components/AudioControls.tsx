"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAudioStore } from "@/stores/audioStore";
import { useVisualStore, VisualizationMode } from "@/stores/visualStore";

const MODES: { id: VisualizationMode; label: string; key: string }[] = [
  { id: "nebula", label: "Nebula", key: "1" },
  { id: "terrain", label: "Terrain", key: "2" },
  { id: "ribbon", label: "Ribbon", key: "3" },
  { id: "face", label: "Face", key: "4" },
];

export default function AudioControls() {
  const router = useRouter();
  const {
    isConnected,
    devices,
    selectedDeviceId,
    connect,
    disconnect,
    loadDevices,
    features,
  } = useAudioStore();

  const { mode, setMode } = useVisualStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
        } else {
          document.exitFullscreen();
        }
      }
      if (e.key === "h" || e.key === "H") {
        setShowControls((prev) => !prev);
      }
      // Mode switching with number keys
      if (e.key === "5") {
        router.push("/terminal");
        return;
      }
      const modeEntry = MODES.find((m) => m.key === e.key);
      if (modeEntry) {
        setMode(modeEntry.id);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [setMode]);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await loadDevices();
      await connect();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect audio"
      );
    } finally {
      setLoading(false);
    }
  }, [connect, loadDevices]);

  const handleDeviceChange = useCallback(
    async (deviceId: string) => {
      useAudioStore.setState({ selectedDeviceId: deviceId });
      if (isConnected) {
        try {
          await connect(deviceId);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to switch device"
          );
        }
      }
    },
    [connect, isConnected]
  );

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const bassLevel = Math.round(features.bassSmooth * 100);
  const midLevel = Math.round(features.midSmooth * 100);
  const trebleLevel = Math.round(features.trebleSmooth * 100);

  if (!showControls) {
    return (
      <button
        onClick={() => setShowControls(true)}
        className="fixed bottom-4 right-4 z-50 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white/40 backdrop-blur-sm transition-colors hover:text-white/80"
      >
        H
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur-xl">
        {error && (
          <div className="mb-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Mode selector */}
        <div className="mb-3 flex gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                mode === m.id
                  ? "bg-white/15 text-white shadow-lg shadow-white/5"
                  : "text-white/40 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              <span className="mr-1.5 text-xs text-white/20">{m.key}</span>
              {m.label}
            </button>
          ))}
          <button
            onClick={() => router.push("/terminal")}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/20 text-cyan-300 hover:from-cyan-500/30 hover:to-purple-500/30 hover:text-cyan-200"
          >
            <span className="mr-1.5 text-xs text-white/20">5</span>
            iMac AI
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Device selector */}
          <select
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors hover:bg-white/10"
            value={selectedDeviceId ?? ""}
            onChange={(e) => handleDeviceChange(e.target.value)}
          >
            <option value="">Default Microphone</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Audio Input ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>

          {/* Connect/Disconnect button */}
          <button
            onClick={isConnected ? disconnect : handleConnect}
            disabled={loading}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              isConnected
                ? "bg-white/10 text-white hover:bg-white/20"
                : "bg-white text-black hover:bg-white/90"
            } disabled:opacity-50`}
          >
            {loading ? "..." : isConnected ? "Stop" : "Start"}
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition-colors hover:bg-white/10"
            title="F"
          >
            {isFullscreen ? "Exit" : "Full"}
          </button>

          {/* Hide controls */}
          <button
            onClick={() => setShowControls(false)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            title="H to toggle"
          >
            Hide
          </button>
        </div>

        {/* Audio levels */}
        {isConnected && (
          <div className="mt-3 flex gap-2">
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs text-white/40">
                <span>Bass</span>
                <span>{bassLevel}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-75"
                  style={{ width: `${bassLevel}%` }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs text-white/40">
                <span>Mid</span>
                <span>{midLevel}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all duration-75"
                  style={{ width: `${midLevel}%` }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs text-white/40">
                <span>Treble</span>
                <span>{trebleLevel}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-pink-500 transition-all duration-75"
                  style={{ width: `${trebleLevel}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Shortcuts hint */}
        <div className="mt-2 text-center text-xs text-white/20">
          1-4 modes · 5 iMac AI · F fullscreen · H hide
        </div>
      </div>
    </div>
  );
}
