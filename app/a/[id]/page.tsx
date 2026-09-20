"use client";

import { CheckCircleIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useState } from "react";

interface AuditStatusResponse {
  status: "queued" | "running" | "done" | "failed";
  currentStep: string;
}

export default function AuditStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [audit, setAudit] = useState<AuditStatusResponse | null>(null);
  useEffect(() => { void params.then(({ id: value }) => setId(value)); }, [params]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    const poll = async (): Promise<void> => {
      const response = await fetch(`/api/audits/${id}`, { cache: "no-store" });
      if (!active || !response.ok) return;
      const data = await response.json() as AuditStatusResponse;
      setAudit(data);
      if (data.status === "done") window.location.assign(`/r/${id}`);
    };
    void poll();
    const timer = setInterval(() => void poll(), 1800);
    return () => { active = false; clearInterval(timer); };
  }, [id]);
  return <main className="min-h-screen bg-white"><div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6"><Link href="/" className="font-display text-xl font-bold text-[#23263b]">Synk<span className="text-[#b75aff]">.</span></Link><div className="mt-16 border-l-2 border-[#003dff] pl-6"><p className="text-xs uppercase tracking-[0.18em] text-[#9698c3]">Audit in progress</p><h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-[#23263b]">We are looking under the hood.</h1><p className="mt-4 text-lg text-[#484c7a]">{audit?.currentStep ?? "Preparing your audit…"}</p><div className="mt-10 flex items-center gap-3 text-sm text-[#484c7a]"><span className="inline-flex size-8 items-center justify-center rounded-full bg-[#f2f2f2]"><CheckCircleIcon className="size-5 text-[#003dff]" /></span> Checks are read-only and safe to run.</div></div></div></main>;
}
