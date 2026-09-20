"use client";

import { ArrowRightIcon, MicrophoneIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRef, useState } from "react";

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
    if (!url) { setError("Enter the URL you want to rescue."); return; }
    setSubmitting(true); setError("");
    const response = await fetch("/api/audits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, email }) });
    const data = await response.json() as { id?: string; error?: string };
    if (!response.ok || !data.id) { setError(data.error ?? "We could not start that audit."); setSubmitting(false); return; }
    window.location.assign(`/a/${data.id}`);
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (stream === null) {
      setError("Microphone access was unavailable. You can still paste the URL.");
      return;
    }
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const formData = new FormData();
      formData.set("audio", new Blob(chunksRef.current, { type: recorder.mimeType }), "url-dictation.webm");
      void fetch("/api/transcribe", { method: "POST", body: formData })
        .then((response) => response.json() as Promise<{ transcript?: string; error?: { message?: string } }>)
        .then((data) => {
          if (data.transcript && urlRef.current) urlRef.current.value = data.transcript;
          if (data.error?.message) setError(data.error.message);
        })
        .catch(() => setError("Voice transcription failed. You can still paste the URL."));
      setRecording(false);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  return (
    <main>
      <section className="hero-shell">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl font-bold tracking-tight text-white">Synk<span className="text-[#b75aff]">.</span></Link>
          <span className="text-xs uppercase tracking-[0.18em] text-white/60">Vibe-Code Rescue Audit</span>
        </nav>
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pb-24 pt-20 text-center md:pt-28">
          <p className="mb-6 text-xs uppercase tracking-[0.2em] text-white/60">For Lovable, Bolt, v0 &amp; Cursor sites</p>
          <h1 className="font-display max-w-4xl text-5xl font-bold leading-[0.98] tracking-[-0.06em] text-white md:text-[77px]">Rescue your vibe-coded app before launch.</h1>
          <p className="mt-8 max-w-2xl font-display text-xl font-light leading-8 text-white/75 md:text-[22px]">A deterministic audit that finds the issues your builder could not — from exposed Supabase tables to broken SEO and slow pages.</p>
          <div className="mt-12 w-full max-w-2xl rounded-xl bg-white p-2 text-left shadow-2xl shadow-black/20">
            <div className="flex flex-col gap-2 md:flex-row">
              <input ref={urlRef} className="h-12 min-w-0 grow rounded-lg border-0 px-4 text-base text-[#23263b] outline-none ring-0 placeholder:text-[#9698c3]" placeholder="https://your-site.com" aria-label="Site URL" />
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#003dff] px-6 font-semibold text-white transition hover:bg-[#1e59ff] disabled:opacity-60" onClick={submit} disabled={submitting}>{submitting ? "Starting…" : "Audit my site"} <ArrowRightIcon className="size-4" /></button>
            </div>
            <div className="flex flex-col gap-3 px-4 pb-2 pt-4 text-sm text-[#484c7a] md:flex-row md:items-center">
              <label className="flex grow items-center gap-2">Email for my results <input value={email} onChange={(event) => setEmail(event.target.value)} className="min-w-0 grow border-b border-[#d6d6e7] px-1 py-1 outline-none" placeholder="optional" type="email" /></label>
              <button className="inline-flex items-center gap-1 text-[#003dff]" onClick={() => void toggleRecording()}><MicrophoneIcon className="size-4" /> {recording ? "Stop listening" : "Dictate URL"}</button>
            </div>
          </div>
          {error ? <p className="mt-4 text-sm text-[#ffb4ab]">{error}</p> : null}
          <p className="mt-5 flex items-center gap-2 text-xs text-white/50"><ShieldCheckIcon className="size-4" /> Read-only checks. Your email is stored only with this audit.</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
        {[["01", "See what is actually broken", "Plain-English findings across deployment, SEO, performance, security, and hygiene."], ["02", "Get a score you can trust", "Same findings in means the same score out. No black-box AI or vague advice."], ["03", "Fix it in your builder", "Copy a builder-aware prompt with exact requests, evidence, and safe SQL."]].map(([number, title, description]) => <article key={number} className="border-l border-[#e5e7eb] pl-5"><p className="font-display text-3xl font-bold text-[#b75aff]">{number}</p><h2 className="mt-5 font-display text-xl font-semibold text-[#23263b]">{title}</h2><p className="mt-3 text-[#484c7a]">{description}</p></article>)}
      </section>
    </main>
  );
}
