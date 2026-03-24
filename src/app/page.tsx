"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import AudioControls from "./components/AudioControls";
import { useAudioStore } from "@/stores/audioStore";
import { useVisualStore } from "@/stores/visualStore";

const Visualizer = dynamic(() => import("./components/Visualizer"), {
  ssr: false,
});

const AIFace = dynamic(() => import("./components/AIFace"), {
  ssr: false,
});

export default function Home() {
  const rafRef = useRef<number>(0);
  const updateFeatures = useAudioStore((s) => s.updateFeatures);
  const isConnected = useAudioStore((s) => s.isConnected);
  const mode = useVisualStore((s) => s.mode);

  // Audio feature update loop — runs at display refresh rate
  useEffect(() => {
    if (!isConnected) return;

    const loop = () => {
      updateFeatures();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isConnected, updateFeatures]);

  return (
    <div className="fixed inset-0 bg-black">
      {mode === "face" ? <AIFace /> : <Visualizer />}
      <AudioControls />
    </div>
  );
}
