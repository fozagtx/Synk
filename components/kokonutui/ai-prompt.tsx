"use client";

/**
 * @author: @kokonutui
 * @description: AI Prompt Input adapted for the Synk agent
 * @version: 1.0.0
 * @date: 2025-06-26
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import * as errore from "errore";
import {
  ArrowRightIcon,
  MicrophoneIcon,
  StopIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "motion/react";
import {
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactElement,
} from "react";

import GradientButton from "@/components/kokonutui/gradient-button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface AIPromptProps {
  className: string;
  disabled: boolean;
  headerText: string;
  onSubmit: (value: string) => Promise<void> | void;
  placeholder: string;
}

interface BrowserAudioWindow extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

interface VoiceRecordingSession {
  audioContext: AudioContext;
  processor: ScriptProcessorNode;
  sampleRate: number;
  silence: GainNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
}

interface TranscriptionApiSuccessResponse {
  ok: true;
  transcript: string;
}

interface TranscriptionApiFailureResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

type TranscriptionApiResponse =
  | TranscriptionApiFailureResponse
  | TranscriptionApiSuccessResponse;

class VoiceCaptureUnavailableError extends errore.createTaggedError({
  name: "VoiceCaptureUnavailableError",
  message: "Voice capture is unavailable: $reason",
}) {}

class VoiceCaptureStartError extends errore.createTaggedError({
  name: "VoiceCaptureStartError",
  message: "Voice capture could not start: $reason",
}) {}

class VoiceCaptureStopError extends errore.createTaggedError({
  name: "VoiceCaptureStopError",
  message: "Voice capture could not stop cleanly: $reason",
}) {}

class VoiceEncodingError extends errore.createTaggedError({
  name: "VoiceEncodingError",
  message: "Voice capture could not be encoded as WAV audio",
}) {}

class VoiceTranscriptionRequestError extends errore.createTaggedError({
  name: "VoiceTranscriptionRequestError",
  message: "Speechmatics transcription request failed: $reason",
}) {}

class VoiceTranscriptionResponseError extends errore.createTaggedError({
  name: "VoiceTranscriptionResponseError",
  message: "Speechmatics transcription returned HTTP $status: $body",
}) {}

class VoiceTranscriptionResponseShapeError extends errore.createTaggedError({
  name: "VoiceTranscriptionResponseShapeError",
  message: "Speechmatics transcription response did not match the UI contract",
}) {}

export default function AI_Prompt({
  className,
  disabled,
  headerText,
  onSubmit,
  placeholder,
}: AIPromptProps): ReactElement {
  const [value, setValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceSessionRef = useRef<VoiceRecordingSession | undefined>(undefined);
  const voiceChunksRef = useRef<Float32Array[]>([]);

  const adjustHeight = ({ reset }: { reset: boolean }): void => {
    adjustTextareaHeight({
      maxHeight: 300,
      minHeight: 88,
      reset,
      textarea: textareaRef.current,
    });
  };

  const submitPrompt = async (): Promise<void> => {
    const request: string = value.trim();

    if (request.length === 0 || disabled || isTranscribing) {
      return;
    }

    const releaseResult = await stopCurrentVoiceSession({
      chunksRef: voiceChunksRef,
      sessionRef: voiceSessionRef,
    });

    if (releaseResult instanceof Error) {
      setVoiceMessage(voiceUserMessage({ error: releaseResult }));
      setIsListening(false);
      return;
    }

    setIsListening(false);
    await onSubmit(request);
    setValue("");
    setVoiceMessage("");
    adjustHeight({ reset: true });
  };

  const toggleVoiceInput = async (): Promise<void> => {
    if (disabled || isTranscribing) {
      return;
    }

    if (isListening) {
      await finishVoiceInput({
        chunksRef: voiceChunksRef,
        onTranscript: (transcript) => {
          setValue((currentValue) => {
            return appendTranscript({
              currentValue,
              transcript,
            });
          });
          window.requestAnimationFrame(() => {
            adjustHeight({ reset: false });
          });
        },
        setIsListening,
        setIsTranscribing,
        setVoiceMessage,
        sessionRef: voiceSessionRef,
      });
      return;
    }

    const startResult = await startVoiceRecording({
      chunksRef: voiceChunksRef,
      sessionRef: voiceSessionRef,
    });

    if (startResult instanceof Error) {
      setVoiceMessage(voiceUserMessage({ error: startResult }));
      setIsListening(false);
      return;
    }

    setIsListening(true);
    setVoiceMessage(
      "Recording with the browser mic. Press Stop to transcribe with Speechmatics."
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt();
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="rounded-2xl border border-[#d3d6dd] bg-white p-4 shadow-[0_10px_30px_rgb(16_24_40/0.08)]">
        <div className="relative flex flex-col">
          <label className="sr-only" htmlFor="ai-input-15">
            {headerText}
          </label>
          <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
            <Textarea
              className={cn(
                "w-full resize-none rounded-none border-none bg-transparent px-0 py-0 text-[#202431] text-lg leading-7 shadow-none placeholder:text-[#98a2b3] focus-visible:ring-0 focus-visible:ring-offset-0",
                "min-h-28"
              )}
              disabled={disabled || isTranscribing}
              id="ai-input-15"
              onChange={(event) => {
                setValue(event.target.value);
                adjustHeight({ reset: false });
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              ref={textareaRef}
              value={value}
            />
          </div>

          <div className="flex min-h-16 items-center pt-4">
            <div className="flex w-full items-center justify-between gap-3">
              <AnimatePresence>
                {isTranscribing && <TranscribingIndicator />}
              </AnimatePresence>
              <span aria-hidden="true" className="min-w-0 grow" />
              <div className="flex shrink-0 items-center justify-end gap-2">
                <button
                  aria-label={
                    isListening ? "Stop voice recording" : "Start voice recording"
                  }
                  className={cn(
                    "inline-flex size-12 items-center justify-center rounded-full border border-[#d8dce3] text-[#667085] transition-colors",
                    "hover:border-[#aeb6c4] hover:bg-[#f6f7f9] hover:text-[#202431] focus-visible:ring-1 focus-visible:ring-[#2457ff] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-40",
                    isListening &&
                      "border-[#2457ff] bg-[#2457ff] text-white hover:bg-[#2457ff] hover:text-white"
                  )}
                  disabled={disabled || isTranscribing}
                  onClick={() => {
                    void toggleVoiceInput();
                  }}
                  type="button"
                >
                  {isListening ? (
                    <StopIcon className="size-5" />
                  ) : (
                    <MicrophoneIcon className="size-5" />
                  )}
                </button>
                <GradientButton
                  aria-label="Run agent scan"
                  className="h-12 rounded-xl px-5 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={
                    disabled || isTranscribing || value.trim().length === 0
                  }
                  onClick={() => {
                    void submitPrompt();
                  }}
                  type="button"
                  variant="blue"
                >
                  <span className="font-semibold text-sm text-white">
                    {disabled ? "Running" : "Run"}
                  </span>
                  <ArrowRightIcon
                    className={cn(
                      "size-4 text-white transition-opacity duration-200",
                      value.trim().length > 0 ? "opacity-100" : "opacity-30"
                    )}
                  />
                </GradientButton>
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {voiceMessage.length > 0 && (
            <motion.p
              animate={{ opacity: 1, y: 0 }}
              className="pt-3 text-[#667085] text-xs"
              exit={{ opacity: 0, y: -4 }}
              initial={{ opacity: 0, y: 4 }}
            >
              {voiceMessage}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

async function startVoiceRecording({
  chunksRef,
  sessionRef,
}: {
  chunksRef: MutableRefObject<Float32Array[]>;
  sessionRef: MutableRefObject<VoiceRecordingSession | undefined>;
}): Promise<
  VoiceCaptureStartError | VoiceCaptureUnavailableError | VoiceCaptureStopError | void
> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return new VoiceCaptureUnavailableError({
      reason: "this browser does not expose microphone recording",
    });
  }

  const stream = await navigator.mediaDevices
    .getUserMedia({ audio: true })
    .catch((cause) => {
      return new VoiceCaptureStartError({
        reason: "microphone permission was denied or unavailable",
        cause,
      });
    });

  if (stream instanceof Error) {
    return stream;
  }

  const session = createVoiceRecordingSession({ stream });

  if (session instanceof Error) {
    const stopResult = stopMediaStream({ stream });

    if (stopResult instanceof Error) {
      return stopResult;
    }

    return session;
  }

  const chunks: Float32Array[] = [];
  chunksRef.current = chunks;
  sessionRef.current = session;
  session.processor.onaudioprocess = (event) => {
    const input: Float32Array = event.inputBuffer.getChannelData(0);
    chunksRef.current = chunksRef.current.concat([new Float32Array(input)]);
  };
}

async function finishVoiceInput({
  chunksRef,
  onTranscript,
  setIsListening,
  setIsTranscribing,
  setVoiceMessage,
  sessionRef,
}: {
  chunksRef: MutableRefObject<Float32Array[]>;
  onTranscript: (transcript: string) => void;
  setIsListening: (isListening: boolean) => void;
  setIsTranscribing: (isTranscribing: boolean) => void;
  setVoiceMessage: (message: string) => void;
  sessionRef: MutableRefObject<VoiceRecordingSession | undefined>;
}): Promise<void> {
  const session = sessionRef.current;
  const chunks: Float32Array[] = chunksRef.current;
  sessionRef.current = undefined;
  chunksRef.current = [];
  setIsListening(false);

  if (!session) {
    setVoiceMessage("No active recording was found.");
    return;
  }

  setIsTranscribing(true);
  setVoiceMessage("");

  const releaseResult = await releaseVoiceSession({ session });

  if (releaseResult instanceof Error) {
    setIsTranscribing(false);
    setVoiceMessage(voiceUserMessage({ error: releaseResult }));
    return;
  }

  const audioBlob = createWavBlob({
    chunks,
    sampleRate: session.sampleRate,
  });

  if (audioBlob instanceof Error) {
    setIsTranscribing(false);
    setVoiceMessage(voiceUserMessage({ error: audioBlob }));
    return;
  }

  const transcript = await requestTranscription({ audioBlob });
  setIsTranscribing(false);

  if (transcript instanceof Error) {
    setVoiceMessage(voiceUserMessage({ error: transcript }));
    return;
  }

  onTranscript(transcript);
  setVoiceMessage("Speechmatics transcript added to the scan request.");
}

async function stopCurrentVoiceSession({
  chunksRef,
  sessionRef,
}: {
  chunksRef: MutableRefObject<Float32Array[]>;
  sessionRef: MutableRefObject<VoiceRecordingSession | undefined>;
}): Promise<VoiceCaptureStopError | void> {
  const session = sessionRef.current;
  sessionRef.current = undefined;
  chunksRef.current = [];

  if (!session) {
    return;
  }

  return releaseVoiceSession({ session });
}

function createVoiceRecordingSession({
  stream,
}: {
  stream: MediaStream;
}): VoiceCaptureStartError | VoiceCaptureUnavailableError | VoiceRecordingSession {
  const audioContext = createAudioContext();

  if (audioContext instanceof Error) {
    return audioContext;
  }

  const source = errore.try({
    try: () => {
      return audioContext.createMediaStreamSource(stream);
    },
    catch: (cause) => {
      return new VoiceCaptureStartError({
        reason: "the browser could not attach the microphone stream",
        cause,
      });
    },
  });

  if (source instanceof Error) {
    return source;
  }

  const processor = errore.try({
    try: () => {
      return audioContext.createScriptProcessor(4096, 1, 1);
    },
    catch: (cause) => {
      return new VoiceCaptureStartError({
        reason: "the browser could not create an audio processor",
        cause,
      });
    },
  });

  if (processor instanceof Error) {
    return processor;
  }

  const silence = audioContext.createGain();
  silence.gain.value = 0;

  const connection = errore.try({
    try: () => {
      source.connect(processor);
      processor.connect(silence);
      silence.connect(audioContext.destination);
    },
    catch: (cause) => {
      return new VoiceCaptureStartError({
        reason: "the browser could not connect the audio pipeline",
        cause,
      });
    },
  });

  if (connection instanceof Error) {
    return connection;
  }

  return {
    audioContext,
    processor,
    sampleRate: audioContext.sampleRate,
    silence,
    source,
    stream,
  };
}

function createAudioContext():
  | AudioContext
  | VoiceCaptureUnavailableError
  | VoiceCaptureStartError {
  const audioWindow: BrowserAudioWindow = window;
  const AudioContextConstructor =
    audioWindow.AudioContext || audioWindow.webkitAudioContext;

  if (!AudioContextConstructor) {
    return new VoiceCaptureUnavailableError({
      reason: "this browser does not expose the Web Audio API",
    });
  }

  return errore.try({
    try: () => {
      return new AudioContextConstructor();
    },
    catch: (cause) => {
      return new VoiceCaptureStartError({
        reason: "the browser refused to create an audio context",
        cause,
      });
    },
  });
}

async function releaseVoiceSession({
  session,
}: {
  session: VoiceRecordingSession;
}): Promise<VoiceCaptureStopError | void> {
  session.processor.onaudioprocess = null;

  const disconnectResult = errore.try({
    try: () => {
      session.source.disconnect();
      session.processor.disconnect();
      session.silence.disconnect();
    },
    catch: (cause) => {
      return new VoiceCaptureStopError({
        reason: "the browser could not disconnect the audio nodes",
        cause,
      });
    },
  });

  if (disconnectResult instanceof Error) {
    return disconnectResult;
  }

  const stopResult = stopMediaStream({ stream: session.stream });

  if (stopResult instanceof Error) {
    return stopResult;
  }

  const closeResult = await session.audioContext.close().catch((cause) => {
    return new VoiceCaptureStopError({
      reason: "the browser could not close the audio context",
      cause,
    });
  });

  if (closeResult instanceof Error) {
    return closeResult;
  }
}

function stopMediaStream({
  stream,
}: {
  stream: MediaStream;
}): VoiceCaptureStopError | void {
  const trackResults: Array<VoiceCaptureStopError | null> = stream
    .getTracks()
    .map((track) => {
      return errore.try({
        try: () => {
          track.stop();
          return null;
        },
        catch: (cause) => {
          return new VoiceCaptureStopError({
            reason: "the browser could not stop a microphone track",
            cause,
          });
        },
      });
    });

  const trackError = trackResults.find((result) => {
    return result instanceof Error;
  });

  if (trackError instanceof Error) {
    return trackError;
  }
}

function createWavBlob({
  chunks,
  sampleRate,
}: {
  chunks: Float32Array[];
  sampleRate: number;
}): Blob | VoiceEncodingError {
  const samples = mergeAudioChunks({ chunks });

  if (samples.length === 0) {
    return new VoiceEncodingError();
  }

  const wavBuffer = encodeWavAudioBuffer({
    samples,
    sampleRate,
  });

  return errore.try({
    try: () => {
      return new Blob([wavBuffer], { type: "audio/wav" });
    },
    catch: (cause) => {
      return new VoiceEncodingError({ cause });
    },
  });
}

function mergeAudioChunks({
  chunks,
}: {
  chunks: Float32Array[];
}): Float32Array {
  const totalLength: number = chunks.reduce((length, chunk) => {
    return length + chunk.length;
  }, 0);
  const samples = new Float32Array(totalLength);

  chunks.reduce((offset, chunk) => {
    samples.set(chunk, offset);
    return offset + chunk.length;
  }, 0);

  return samples;
}

function encodeWavAudioBuffer({
  samples,
  sampleRate,
}: {
  samples: Float32Array;
  sampleRate: number;
}): ArrayBuffer {
  const bytesPerSample = 2;
  const channelCount = 1;
  const dataByteLength: number = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  writeAsciiString({ offset: 0, value: "RIFF", view });
  view.setUint32(4, 36 + dataByteLength, true);
  writeAsciiString({ offset: 8, value: "WAVE", view });
  writeAsciiString({ offset: 12, value: "fmt ", view });
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAsciiString({ offset: 36, value: "data", view });
  view.setUint32(40, dataByteLength, true);

  const sampleIndexes: number[] = Array.from(
    { length: samples.length },
    (_value, index) => {
      return index;
    }
  );

  sampleIndexes.map((sampleIndex) => {
    view.setInt16(
      44 + sampleIndex * bytesPerSample,
      toPcm16Sample({ value: samples[sampleIndex] || 0 }),
      true
    );
    return null;
  });

  return buffer;
}

function writeAsciiString({
  offset,
  value,
  view,
}: {
  offset: number;
  value: string;
  view: DataView;
}): void {
  const characterIndexes: number[] = Array.from(
    { length: value.length },
    (_value, index) => {
      return index;
    }
  );

  characterIndexes.map((index) => {
    view.setUint8(offset + index, value.charCodeAt(index));
    return null;
  });
}

function toPcm16Sample({ value }: { value: number }): number {
  const clampedValue: number = Math.max(-1, Math.min(1, value));

  if (clampedValue < 0) {
    return clampedValue * 0x8000;
  }

  return clampedValue * 0x7fff;
}

async function requestTranscription({
  audioBlob,
}: {
  audioBlob: Blob;
}): Promise<
  | VoiceTranscriptionRequestError
  | VoiceTranscriptionResponseError
  | VoiceTranscriptionResponseShapeError
  | string
> {
  const formData = new FormData();
  formData.set("audio", audioBlob, "voice.wav");

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
  }).catch((cause) => {
    return new VoiceTranscriptionRequestError({
      reason: "network request failed",
      cause,
    });
  });

  if (response instanceof Error) {
    return response;
  }

  const bodyText = await response.text().catch((cause) => {
    return new VoiceTranscriptionRequestError({
      reason: "response body could not be read",
      cause,
    });
  });

  if (bodyText instanceof Error) {
    return bodyText;
  }

  const parsed = parseTranscriptionApiResponse({ bodyText });

  if (parsed instanceof Error) {
    return new VoiceTranscriptionResponseShapeError({ cause: parsed });
  }

  if (!response.ok || !parsed.ok) {
    const body: string = parsed.ok ? bodyText : parsed.error.message;

    return new VoiceTranscriptionResponseError({
      status: response.status,
      body,
    });
  }

  return parsed.transcript.trim();
}

function parseTranscriptionApiResponse({
  bodyText,
}: {
  bodyText: string;
}): TranscriptionApiResponse | VoiceTranscriptionResponseShapeError {
  const parsed = errore.try({
    try: () => {
      return JSON.parse(bodyText) as unknown;
    },
    catch: (cause) => {
      return new VoiceTranscriptionResponseShapeError({ cause });
    },
  });

  if (parsed instanceof Error) {
    return new VoiceTranscriptionResponseShapeError({ cause: parsed });
  }

  if (!isRecord(parsed) || typeof parsed.ok !== "boolean") {
    return new VoiceTranscriptionResponseShapeError();
  }

  if (parsed.ok === true && typeof parsed.transcript === "string") {
    return {
      ok: true,
      transcript: parsed.transcript,
    };
  }

  if (
    parsed.ok === false &&
    isRecord(parsed.error) &&
    typeof parsed.error.code === "string" &&
    typeof parsed.error.message === "string"
  ) {
    return {
      ok: false,
      error: {
        code: parsed.error.code,
        message: parsed.error.message,
      },
    };
  }

  return new VoiceTranscriptionResponseShapeError();
}

function appendTranscript({
  currentValue,
  transcript,
}: {
  currentValue: string;
  transcript: string;
}): string {
  if (currentValue.trim().length === 0) {
    return transcript;
  }

  return `${currentValue.trim()} ${transcript}`;
}

function TranscribingIndicator(): ReactElement {
  const barIndexes: number[] = [0, 1, 2, 3];

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="flex min-w-0 items-center gap-2 rounded-lg bg-background/70 px-3 py-2 text-muted-foreground text-xs"
      exit={{ opacity: 0, x: -8 }}
      initial={{ opacity: 0, x: -8 }}
    >
      <span aria-hidden="true" className="flex h-4 items-end gap-0.5">
        {barIndexes.map((index) => {
          return (
            <motion.span
              animate={{ height: [4, 14, 6, 10, 4] }}
              className="w-0.5 rounded-full bg-current"
              key={index}
              transition={{
                duration: 0.9,
                ease: "easeInOut",
                repeat: Number.POSITIVE_INFINITY,
                delay: index * 0.12,
              }}
            />
          );
        })}
      </span>
      <span className="truncate">Transcribing</span>
    </motion.div>
  );
}

function voiceUserMessage({ error }: { error: Error }): string {
  if (error instanceof VoiceCaptureStartError && isMicPermissionError({ error })) {
    return "Microphone permission is blocked by the browser. Allow microphone access, then press Speak again.";
  }

  return error.message;
}

function isMicPermissionError({ error }: { error: Error }): boolean {
  const cause = error.cause;

  return (
    cause instanceof DOMException &&
    (cause.name === "NotAllowedError" ||
      cause.name === "NotFoundError" ||
      cause.name === "NotReadableError" ||
      cause.name === "SecurityError")
  );
}

function adjustTextareaHeight({
  maxHeight,
  minHeight,
  reset,
  textarea,
}: {
  maxHeight: number;
  minHeight: number;
  reset: boolean;
  textarea: HTMLTextAreaElement | null;
}): void {
  if (!textarea) {
    return;
  }

  if (reset) {
    textarea.style.height = `${minHeight}px`;
    return;
  }

  textarea.style.height = `${minHeight}px`;
  textarea.style.height = `${Math.max(
    minHeight,
    Math.min(textarea.scrollHeight, maxHeight)
  )}px`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
