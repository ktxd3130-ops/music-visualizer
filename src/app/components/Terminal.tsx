"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTerminalStore } from "@/stores/terminalStore";
import { SpeechRecognitionEngine } from "@/core/speech/SpeechRecognitionEngine";
import { TextToSpeechEngine } from "@/core/speech/TextToSpeechEngine";

// ============================================================
// TERMINAL ORCHESTRATOR
// Manages the full conversation loop:
// IDLE → LISTENING → THINKING → SPEAKING → IDLE
// ============================================================

const AMBIENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export default function Terminal() {
  const sttRef = useRef<SpeechRecognitionEngine | null>(null);
  const ttsRef = useRef<TextToSpeechEngine | null>(null);
  const micLevelRafRef = useRef<number>(0);
  const ttsLevelRafRef = useRef<number>(0);
  const ambientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const isProcessingRef = useRef(false);

  const {
    state,
    setState,
    addMessage,
    messages,
    setTranscript,
    setLastResponse,
    setInputAudioLevel,
    setOutputAudioLevel,
    setAmbient,
    alwaysOn,
    claudeModel,
    setError,
  } = useTerminalStore();

  // ---- Reset ambient timer ----
  const resetAmbientTimer = useCallback(() => {
    if (ambientTimerRef.current) {
      clearTimeout(ambientTimerRef.current);
    }
    useTerminalStore.getState().setAmbient(false);
    ambientTimerRef.current = setTimeout(() => {
      const currentState = useTerminalStore.getState().state;
      if (currentState === "idle") {
        useTerminalStore.getState().setAmbient(true);
      }
    }, AMBIENT_TIMEOUT_MS);
  }, []);

  // ---- Send to Claude API ----
  const sendToClaudeAPI = useCallback(
    async (userText: string) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      setState("thinking");
      addMessage({ role: "user", content: userText });

      try {
        const currentMessages = useTerminalStore.getState().messages;

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: currentMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            model: claudeModel,
            stream: false,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const data = await response.json();
        const assistantText = data.response;

        if (!assistantText) {
          throw new Error("Empty response from Claude");
        }

        addMessage({ role: "assistant", content: assistantText });
        setLastResponse(assistantText);

        // Speak the response
        if (ttsRef.current) {
          console.log("Speaking response:", assistantText.substring(0, 50) + "...");
          ttsRef.current.speak(assistantText);
        } else {
          console.error("TTS engine not initialized");
          setState("idle");
        }
      } catch (err) {
        console.error("Claude API error:", err);
        setError(err instanceof Error ? err.message : "Failed to get response");
        setState("error");

        // Recover from error after 3 seconds
        setTimeout(() => {
          setState("idle");
          setError(null);
          if (alwaysOn) {
            startListening();
          }
        }, 3000);
      } finally {
        isProcessingRef.current = false;
      }
    },
    [setState, addMessage, setLastResponse, claudeModel, alwaysOn, setError]
  );

  // ---- Start listening ----
  const startListening = useCallback(() => {
    if (!sttRef.current) return;
    finalTranscriptRef.current = "";
    setTranscript("");
    setState("listening");
    sttRef.current.startListening();
  }, [setState, setTranscript]);

  // ---- Mic level animation loop ----
  const startMicLevelLoop = useCallback(() => {
    const loop = () => {
      if (sttRef.current) {
        setInputAudioLevel(sttRef.current.getMicLevel());
      }
      micLevelRafRef.current = requestAnimationFrame(loop);
    };
    micLevelRafRef.current = requestAnimationFrame(loop);
  }, [setInputAudioLevel]);

  const stopMicLevelLoop = useCallback(() => {
    cancelAnimationFrame(micLevelRafRef.current);
    setInputAudioLevel(0);
  }, [setInputAudioLevel]);

  // ---- TTS level animation loop ----
  const startTTSLevelLoop = useCallback(() => {
    const loop = () => {
      if (ttsRef.current) {
        setOutputAudioLevel(ttsRef.current.getOutputLevel());
      }
      ttsLevelRafRef.current = requestAnimationFrame(loop);
    };
    ttsLevelRafRef.current = requestAnimationFrame(loop);
  }, [setOutputAudioLevel]);

  const stopTTSLevelLoop = useCallback(() => {
    cancelAnimationFrame(ttsLevelRafRef.current);
    setOutputAudioLevel(0);
  }, [setOutputAudioLevel]);

  // ---- Initialize engines ----
  useEffect(() => {
    // STT Engine
    const stt = new SpeechRecognitionEngine();
    sttRef.current = stt;

    stt.init({
      onStart: () => {
        startMicLevelLoop();
      },
      onResult: (transcript, isFinal) => {
        if (isFinal) {
          finalTranscriptRef.current += " " + transcript;
          finalTranscriptRef.current = finalTranscriptRef.current.trim();
          setTranscript(finalTranscriptRef.current);
        } else {
          setTranscript(
            (finalTranscriptRef.current + " " + transcript).trim()
          );
        }
      },
      onEnd: () => {
        stopMicLevelLoop();
      },
      onError: (error) => {
        console.error("STT error:", error);
      },
      onSilenceTimeout: () => {
        // User stopped speaking — process the transcript
        const transcript = finalTranscriptRef.current.trim();
        if (transcript.length > 0) {
          stt.stopListening();
          stopMicLevelLoop();

          // Check for voice commands
          const lower = transcript.toLowerCase();
          if (
            lower === "start over" ||
            lower === "new conversation" ||
            lower === "reset"
          ) {
            useTerminalStore.getState().clearMessages();
            setTranscript("");
            setLastResponse("");
            setState("idle");
            setTimeout(() => startListening(), 500);
            return;
          }

          sendToClaudeAPI(transcript);
        }
      },
    });

    // TTS Engine
    const tts = new TextToSpeechEngine();
    ttsRef.current = tts;

    tts.init(
      {
        onStart: () => {
          setState("speaking");
          startTTSLevelLoop();
        },
        onEnd: () => {
          stopTTSLevelLoop();
          setState("idle");
          resetAmbientTimer();

          // Resume listening after response
          if (useTerminalStore.getState().alwaysOn) {
            setTimeout(() => startListening(), 300);
          }
        },
        onError: (error) => {
          console.error("TTS error:", error);
          stopTTSLevelLoop();
          setState("idle");
          if (useTerminalStore.getState().alwaysOn) {
            setTimeout(() => startListening(), 500);
          }
        },
      },
      "web"
    );

    // Start in always-on mode
    resetAmbientTimer();

    // Auto-start listening after a brief delay
    const startTimer = setTimeout(() => {
      if (useTerminalStore.getState().alwaysOn) {
        startListening();
      }
    }, 1500);

    return () => {
      clearTimeout(startTimer);
      stt.destroy();
      tts.destroy();
      stopMicLevelLoop();
      stopTTSLevelLoop();
      if (ambientTimerRef.current) clearTimeout(ambientTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Space: toggle listening
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        const currentState = useTerminalStore.getState().state;
        if (currentState === "idle") {
          startListening();
        } else if (currentState === "listening") {
          // Force process what we have
          const transcript = finalTranscriptRef.current.trim();
          if (transcript.length > 0) {
            sttRef.current?.stopListening();
            stopMicLevelLoop();
            sendToClaudeAPI(transcript);
          }
        } else if (currentState === "speaking") {
          // Interrupt — stop TTS
          ttsRef.current?.stop();
          stopTTSLevelLoop();
          setState("idle");
          setTimeout(() => startListening(), 300);
        }
      }

      // Escape: stop everything, go idle
      if (e.key === "Escape") {
        ttsRef.current?.stop();
        sttRef.current?.stopListening();
        stopMicLevelLoop();
        stopTTSLevelLoop();
        setState("idle");
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    setState,
    startListening,
    sendToClaudeAPI,
    stopMicLevelLoop,
    stopTTSLevelLoop,
  ]);

  return null; // This is a logic-only component, no UI
}
