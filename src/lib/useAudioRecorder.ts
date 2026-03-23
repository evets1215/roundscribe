"use client";

import { useState, useRef, useCallback } from "react";

export interface AudioRecorderState {
  isRecording: boolean;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  transcript: string | null;
  error: string | null;
}

// Minimal type shim for the Web Speech API (not in standard TS DOM lib)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  start(): void;
  stop(): void;
}
declare const webkitSpeechRecognition: new () => SpeechRecognitionInstance;
declare const SpeechRecognition: new () => SpeechRecognitionInstance;

function createSpeechRecognition(): SpeechRecognitionInstance | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as unknown as Record<string, unknown>).SpeechRecognition as
      | (new () => SpeechRecognitionInstance)
      | undefined ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition as
      | (new () => SpeechRecognitionInstance)
      | undefined;
  return Ctor ? new Ctor() : null;
}

export function useAudioRecorder() {
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    duration: 0,
    audioBlob: null,
    audioUrl: null,
    transcript: null,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef<string>("");

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      transcriptRef.current = "";

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setState((prev) => ({
          ...prev,
          isRecording: false,
          audioBlob: blob,
          audioUrl: url,
          transcript: transcriptRef.current || null,
        }));
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);

      // Start Web Speech API for real-time transcription
      const recognition = createSpeechRecognition();
      if (recognition) {
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = "en-US";
        recognition.onresult = (e: SpeechRecognitionEvent) => {
          for (let i = e.results.length - 1; i >= 0; i--) {
            if (e.results[i].isFinal) {
              transcriptRef.current += (transcriptRef.current ? " " : "") + e.results[i][0].transcript;
            }
          }
        };
        recognition.onerror = () => { /* non-fatal — fall back to MedASR */ };
        recognition.start();
        recognitionRef.current = recognition;
      }

      setState({ isRecording: true, duration: 0, audioBlob: null, audioUrl: null, transcript: null, error: null });

      timerRef.current = setInterval(() => {
        setState((prev) => ({ ...prev, duration: prev.duration + 1 }));
      }, 1000);
    } catch {
      setState((prev) => ({
        ...prev,
        error: "Microphone access denied. Please allow microphone permissions.",
      }));
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const toggle = useCallback(() => {
    if (state.isRecording) stop();
    else start();
  }, [state.isRecording, start, stop]);

  const clear = useCallback(() => {
    stop();
    transcriptRef.current = "";
    setState({ isRecording: false, duration: 0, audioBlob: null, audioUrl: null, transcript: null, error: null });
  }, [stop]);

  return { ...state, start, stop, toggle, clear };
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
