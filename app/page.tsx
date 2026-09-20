"use client";

import {
  ArrowRightIcon,
  MicrophoneIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { isRecord } from "@/lib/audit/errors";
import { useRef, useState } from "react";
import { SiteNav } from "@/components/site-nav";

const checkCards = [
  {
    number: "01",
    title: "Deployment and HTTPS",
    description:
      "Catch preview domains, failed routes, redirects, and mixed-content launch issues.",
  },
  {
    number: "02",
    title: "Search and page structure",
    description:
      "Check titles, descriptions, canonical URLs, headings, robots, sitemap, and image text.",
  },
  {
    number: "03",
    title: "Performance signals",
    description:
      "Measure bundle weight, blocking assets, document size, compression, and caching.",
  },
  {
    number: "04",
    title: "Supabase security",
    description:
      "Run read-only checks for exposed tables, storage listings, and browser-visible credentials.",
  },
  {
    number: "05",
    title: "Security and launch hygiene",
    description:
      "Look for missing browser headers, exposed files, source maps, mixed content, and analytics.",
  },
];

export default function HomePage() {
  const urlRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function submit(): Promise<void> {
    const url = urlRef.current?.value.trim() ?? "";

    if (!url) {
      setError("Enter the URL you want to rescue.");
      return;
    }

    setSubmitting(true);
    setError("");
    const response = await fetch("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, email }),
    });
    const parsed: unknown = await response.json();

    if (!response.ok || !isRecord(parsed) || typeof parsed.id !== "string") {
      const message =
        isRecord(parsed) && typeof parsed.error === "string"
          ? parsed.error
          : "We could not start that audit.";
      setError(message);
      setSubmitting(false);
      return;
    }

    window.location.assign(`/a/${parsed.id}`);
  }

  async function toggleRecording(): Promise<void> {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      setError("Voice input is not supported in this browser.");
      return;
    }

    const stream = await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .catch(() => null);

    if (stream === null) {
      setError("Microphone access was unavailable. You can still paste the URL.");
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunksRef.current = [...chunksRef.current, event.data];
      }
    };
    recorder.onstop = () => {
      stream.getTracks().map((track) => {
        track.stop();
        return track;
      });
      const formData = new FormData();
      formData.set(
        "audio",
        new Blob(chunksRef.current, { type: recorder.mimeType }),
        "url-dictation.webm",
      );
      void fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      })
        .then(async (response) => ({
          response,
          data: await response.json(),
        }))
        .then(({ response, data }: { response: Response; data: unknown }) => {
          if (!response.ok || !isRecord(data)) {
            setError("Voice transcription failed. You can still paste the URL.");
            return;
          }

          if (typeof data.transcript === "string" && urlRef.current) {
            urlRef.current.value = data.transcript;
          }

          if (
            isRecord(data.error) &&
            typeof data.error.message === "string"
          ) {
            setError(data.error.message);
          }
        })
        .catch(() => {
          setError("Voice transcription failed. You can still paste the URL.");
        });
      setRecording(false);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  return (
    <main>
      <section className="hero-shell">
        <SiteNav variant="dark" />
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pb-24 pt-20 text-center md:pt-28">
          <p className="mb-6 text-xs uppercase tracking-[0.2em] text-white/60">
            For Lovable, Bolt, v0 &amp; Cursor sites
          </p>
          <h1 className="max-w-4xl font-display text-5xl font-bold leading-[0.98] tracking-[-0.06em] text-white md:text-[77px]">
            Rescue your vibe-coded app before launch.
          </h1>
          <p className="mt-8 max-w-2xl font-display text-xl font-light leading-8 text-white/75 md:text-[22px]">
            A deterministic audit that finds the issues your builder could not —
            from exposed Supabase tables to broken SEO and slow pages.
          </p>
          <div className="mt-12 w-full max-w-2xl rounded-xl border border-hairline-cool bg-white p-2 text-left">
            <div className="flex flex-col gap-2 md:flex-row">
              <input
                ref={urlRef}
                className="h-12 min-w-0 grow rounded-lg border-0 px-4 text-base text-ink outline-none ring-0 placeholder:text-caption-muted"
                placeholder="https://your-site.com"
                aria-label="Site URL"
              />
              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-white transition hover:bg-secondary disabled:opacity-60"
                onClick={() => void submit()}
                disabled={submitting}
              >
                {submitting ? "Starting…" : "Audit my site"}
                <ArrowRightIcon className="size-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3 px-4 pb-2 pt-4 text-sm text-ink-muted md:flex-row md:items-center">
              <label className="flex grow items-center gap-2">
                Email for my results
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-w-0 grow border-b border-hairline-cool px-1 py-1 outline-none"
                  placeholder="optional"
                  type="email"
                />
              </label>
              <button
                className="inline-flex items-center gap-1 text-primary"
                onClick={() => void toggleRecording()}
              >
                <MicrophoneIcon className="size-4" />
                {recording ? "Stop listening" : "Dictate URL"}
              </button>
            </div>
          </div>
          {error ? (
            <p className="mt-4 text-sm text-red-200">{error}</p>
          ) : null}
          <p className="mt-5 flex items-center gap-2 text-xs text-white/50">
            <ShieldCheckIcon className="size-4" />
            Read-only checks. Your email is stored only with this audit.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-xs uppercase tracking-[0.18em] text-caption-muted">
          What we check
        </p>
        <h2 className="mt-4 max-w-2xl font-display text-4xl font-bold tracking-tight text-ink">
          A clear launch readout, not another vague AI score.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {checkCards.map((card) => (
            <article
              key={card.number}
              className="rounded-xl border border-hairline bg-surface-1 p-8"
            >
              <p className="font-display text-3xl font-bold text-tertiary">
                {card.number}
              </p>
              <h3 className="mt-6 font-display text-[21px] font-semibold text-ink">
                {card.title}
              </h3>
              <p className="mt-3 text-ink-muted">{card.description}</p>
            </article>
          ))}
        </div>
        <div className="mt-10 rounded-xl bg-surface-deep p-8 text-white">
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">
            Sample Fix Prompt
          </p>
          <pre className="mt-5 whitespace-pre-wrap text-sm leading-7 text-white/80">
            {`[BLOCKER] The profiles table is readable without a user session
Evidence: GET /rest/v1/profiles?select=*&limit=1 → HTTP 200
Fix: enable RLS and add an own-row SELECT policy.`}
          </pre>
        </div>
      </section>
      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-8 text-sm text-ink-muted">
          <span className="font-display font-semibold text-ink">Synk</span>
          <span>·</span>
          <span>read-only checks, no account</span>
        </div>
      </footer>
    </main>
  );
}
