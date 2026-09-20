"use client";

import { CheckCircleIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { isRecord } from "@/lib/audit/errors";
import type { AuditStep, AuditStatus, StepState } from "@/lib/audit/types";

interface AuditStatusResponse {
  status: AuditStatus;
  steps: AuditStep[];
}

function readStatus({ value }: { value: unknown }): AuditStatusResponse | null {
  if (!isRecord(value) || typeof value.status !== "string" || !Array.isArray(value.steps)) {
    return null;
  }

  const steps = value.steps
    .map((step) => readStep({ value: step }))
    .filter((step): step is AuditStep => step !== null);

  return {
    status: readAuditStatus({ value: value.status }),
    steps,
  };
}

function readAuditStatus({ value }: { value: string }): AuditStatus {
  if (value === "queued" || value === "running" || value === "done") {
    return value;
  }

  return "failed";
}

function readStep({ value }: { value: unknown }): AuditStep | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string") {
    return null;
  }

  const state = readStepState({ value: value.state });

  if (state === null) {
    return null;
  }

  return {
    id: value.id,
    label: value.label,
    state,
  };
}

function readStepState({ value }: { value: unknown }): StepState | null {
  if (
    value === "pending" ||
    value === "running" ||
    value === "done" ||
    value === "unavailable"
  ) {
    return value;
  }

  return null;
}

function stepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return <CheckCircleIcon className="size-5 text-primary" />;
  }

  return <ClockIcon className="size-5 text-caption-muted" />;
}

export default function AuditStatusPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [audit, setAudit] = useState<AuditStatusResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const poll = async (): Promise<void> => {
      const response = await fetch(`/api/audits/${id}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        return;
      }

      const parsed = readStatus({ value: await response.json() });

      if (parsed === null) {
        return;
      }

      setAudit(parsed);

      if (parsed.status === "done") {
        router.push(`/r/${id}`);
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1800);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [id, router]);

  return (
    <main className="min-h-screen bg-canvas">
      <SiteNav variant="light" />
      <div className="mx-auto flex max-w-2xl flex-col px-6 pb-20 pt-20">
        <p className="text-xs uppercase tracking-[0.18em] text-caption-muted">
          Audit in progress
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
          We are looking under the hood.
        </h1>
        <p className="mt-4 text-lg text-ink-muted">
          {audit?.steps.find((step) => step.state === "running")?.label ??
            "Preparing your audit…"}
        </p>
        <div className="mt-10 flex flex-col gap-3">
          {(audit?.steps ?? []).map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-xl border p-4 ${
                step.state === "running"
                  ? "border-primary bg-surface-1"
                  : "border-hairline"
              }`}
            >
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-surface-1">
                {stepIcon({ state: step.state })}
              </span>
              <span
                className={
                  step.state === "running"
                    ? "font-semibold text-ink"
                    : "text-ink-muted"
                }
              >
                {step.label}
              </span>
              <span className="ml-auto text-xs uppercase tracking-wider text-caption-muted">
                {step.state}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-8 flex items-center gap-2 text-sm text-ink-muted">
          <CheckCircleIcon className="size-5 text-primary" />
          Checks are read-only and safe to run.
        </p>
      </div>
    </main>
  );
}
