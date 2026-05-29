"use client";

import * as errore from "errore";
import {
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  CircleStackIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Navii } from "@usenavii/react";
import Image from "next/image";
import {
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";

import AI_Prompt from "@/components/kokonutui/ai-prompt";
import AITextLoading from "@/components/kokonutui/ai-text-loading";
import GradientButton from "@/components/kokonutui/gradient-button";
import Loader from "@/components/kokonutui/loader";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  Finding,
  ReportGroups,
  ScanApiResponse,
  ScanReport,
  Severity,
} from "@/lib/types/scan";

class ClientFetchError extends errore.createTaggedError({
  name: "ClientFetchError",
  message: "Scan request failed",
}) {}

class ClientResponseParseError extends errore.createTaggedError({
  name: "ClientResponseParseError",
  message: "Scan response was not valid JSON",
}) {}

class ClientResponseShapeError extends errore.createTaggedError({
  name: "ClientResponseShapeError",
  message: "Scan response did not match the expected contract",
}) {}

class ClientIMessageResponseShapeError extends errore.createTaggedError({
  name: "ClientIMessageResponseShapeError",
  message: "iMessage response did not match the expected contract",
}) {}

class RunCacheReadError extends errore.createTaggedError({
  name: "RunCacheReadError",
  message: "Run cache could not be read",
}) {}

class RunCacheWriteError extends errore.createTaggedError({
  name: "RunCacheWriteError",
  message: "Run cache could not be saved",
}) {}

type ScanViewState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
    }
  | {
      status: "success";
      report: ScanReport;
    }
  | {
      status: "error";
      message: string;
    };

type EffortLevel = "Auto" | "Focused" | "Deep";

type RunRecord = {
  id: string;
  createdAt: string;
  prompt: string;
  repoLabel: string;
  status: "completed" | "failed";
  report: ScanReport | null;
  error: string | null;
};

type RunHistoryState = {
  activeRunId: string | null;
  runs: RunRecord[];
};

type RunHistorySnapshot = {
  history: RunHistoryState;
  error: string | null;
};

type ParsedPromptRequest = {
  githubUrl: string;
};

type IMessageTestApiResponse =
  | {
      ok: true;
      result: IMessageTestResult;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

type IMessageTestResult = {
  agentPhone: string | null;
  mode: "dedicated" | "shared_or_unknown";
  recipientPhone: string;
  status: "sent";
};

type IMessageTestState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
    }
  | {
      status: "success";
      result: IMessageTestResult;
    }
  | {
      status: "error";
      message: string;
    };

type WorkspaceCopy = {
  title: string;
  subtitle: string;
  items: string[];
};

const RUN_HISTORY_STORAGE_KEY = "synk.run-history.v2";
const RUN_HISTORY_CHANGE_EVENT = "synk-run-history-change";
const SIDEBAR_OPEN_TRACK = "20rem";
const SIDEBAR_CLOSED_TRACK = "5rem";
const SIDEBAR_CLOSE_LABEL_DELAY_MS = 120;
const SIDEBAR_OPEN_LABEL_DELAY_MS = 260;
const EMPTY_RUN_HISTORY: RunHistoryState = {
  activeRunId: null,
  runs: [],
};
const EMPTY_RUN_HISTORY_SNAPSHOT: RunHistorySnapshot = {
  history: EMPTY_RUN_HISTORY,
  error: null,
};

let cachedRunHistoryRaw: string | null | undefined = undefined;
let cachedRunHistorySnapshot: RunHistorySnapshot = EMPTY_RUN_HISTORY_SNAPSHOT;

export default function Home(): ReactElement {
  const runHistorySnapshot = useSyncExternalStore(
    subscribeRunHistory,
    getClientRunHistorySnapshot,
    getServerRunHistorySnapshot
  );
  const [scanStateOverride, setScanStateOverride] =
    useState<ScanViewState | null>(null);
  const [activeNavId, setActiveNavId] = useState("agent");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarContentHidden, setIsSidebarContentHidden] = useState(false);
  const [effort, setEffort] = useState<EffortLevel>("Auto");
  const sidebarTransitionTimeoutRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);

  const scanState: ScanViewState =
    scanStateOverride ||
    scanStateFromRunHistorySnapshot({ snapshot: runHistorySnapshot });
  const runs: RunRecord[] = runHistorySnapshot.history.runs;
  const activeRunId: string | null = runHistorySnapshot.history.activeRunId;
  const isLoading = scanState.status === "loading";

  async function runScan({ prompt }: { prompt: string }): Promise<void> {
    const request: ParsedPromptRequest = parsePromptRequest({ value: prompt });

    if (request.githubUrl.length === 0 || isLoading) {
      return;
    }

    setScanStateOverride({ status: "loading" });

    const response = await postScan({
      githubUrl: request.githubUrl,
    });

    if (errore.isError(response)) {
      const failedRun: RunRecord = createRunRecord({
        error: response.message,
        prompt,
        report: null,
        repoLabel: request.githubUrl,
        status: "failed",
      });

      const cachedHistory = appendRunToCachedHistory({
        run: failedRun,
      });
      const nextScanState: ScanViewState = errore.isError(cachedHistory)
        ? { status: "error", message: cachedHistory.message }
        : {
            status: "error",
            message: response.message,
          };

      setScanStateOverride(nextScanState);
      return;
    }

    if (!response.ok) {
      const failedRun: RunRecord = createRunRecord({
        error: response.error.message,
        prompt,
        report: null,
        repoLabel: request.githubUrl,
        status: "failed",
      });

      const cachedHistory = appendRunToCachedHistory({
        run: failedRun,
      });
      const nextScanState: ScanViewState = errore.isError(cachedHistory)
        ? { status: "error", message: cachedHistory.message }
        : {
            status: "error",
            message: response.error.message,
          };

      setScanStateOverride(nextScanState);
      return;
    }

    const completedRun: RunRecord = createRunRecord({
      error: null,
      prompt,
      report: response.report,
      repoLabel: `${response.report.repo.owner}/${response.report.repo.repo}`,
      status: "completed",
    });

    const cachedHistory = appendRunToCachedHistory({
      run: completedRun,
    });
    const nextScanState: ScanViewState = errore.isError(cachedHistory)
      ? { status: "error", message: cachedHistory.message }
      : {
          status: "success",
          report: response.report,
        };

    setScanStateOverride(nextScanState);
  }

  async function handlePromptSubmit(value: string): Promise<void> {
    const prompt: string = value.trim();

    if (prompt.length === 0 || isLoading) {
      return;
    }

    await runScan({ prompt });
  }

  function handleRunRecordClick({ run }: { run: RunRecord }): void {
    const cachedHistory = selectCachedRun({
      run,
    });

    if (errore.isError(cachedHistory)) {
      setScanStateOverride({
        status: "error",
        message: cachedHistory.message,
      });
      return;
    }

    setScanStateOverride(scanStateFromRun({ run }));
  }

  function handleSidebarToggle(): void {
    if (typeof sidebarTransitionTimeoutRef.current !== "undefined") {
      clearTimeout(sidebarTransitionTimeoutRef.current);
      sidebarTransitionTimeoutRef.current = undefined;
    }

    if (isSidebarCollapsed || isSidebarContentHidden) {
      setIsSidebarCollapsed(false);
      sidebarTransitionTimeoutRef.current = setTimeout(() => {
        setIsSidebarContentHidden(false);
        sidebarTransitionTimeoutRef.current = undefined;
      }, SIDEBAR_OPEN_LABEL_DELAY_MS);
      return;
    }

    setIsSidebarContentHidden(true);
    sidebarTransitionTimeoutRef.current = setTimeout(() => {
      setIsSidebarCollapsed(true);
      sidebarTransitionTimeoutRef.current = undefined;
    }, SIDEBAR_CLOSE_LABEL_DELAY_MS);
  }

  const shellGridTemplateColumns: string = isSidebarCollapsed
    ? `${SIDEBAR_CLOSED_TRACK} minmax(18rem, 38rem) minmax(18rem, 1fr)`
    : `${SIDEBAR_OPEN_TRACK} minmax(18rem, 38rem) minmax(18rem, 1fr)`;

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8fb] text-[#1f2430]">
      <div
        className="synk-resize-grid grid h-screen min-h-0"
        style={{ gridTemplateColumns: shellGridTemplateColumns }}
      >
        <AppSidebar
          activeNavId={activeNavId}
          isContentHidden={isSidebarContentHidden}
          isCollapsed={isSidebarCollapsed}
          onNavSelect={setActiveNavId}
          onToggle={handleSidebarToggle}
        />
        <AgentWorkspace
          activeRunId={activeRunId}
          activeNavId={activeNavId}
          effort={effort}
          isLoading={isLoading}
          onEffortChange={setEffort}
          onPromptSubmit={handlePromptSubmit}
          onRunRecordClick={handleRunRecordClick}
          runs={runs}
        />
        <OutputWorkspace scanState={scanState} />
      </div>
    </main>
  );
}

function LogoMark({ size }: { size: "lg" | "sm" }): ReactElement {
  const imageSize: number = size === "lg" ? 112 : 40;

  return (
    <Image
      alt="Synk logo"
      className={cn("shrink-0", size === "lg" ? "size-28" : "size-10")}
      height={imageSize}
      priority={size === "sm"}
      src="/brand-logo.svg"
      width={imageSize}
    />
  );
}

function AppSidebar({
  activeNavId,
  isContentHidden,
  isCollapsed,
  onNavSelect,
  onToggle,
}: {
  activeNavId: string;
  isContentHidden: boolean;
  isCollapsed: boolean;
  onNavSelect: (navId: string) => void;
  onToggle: () => void;
}): ReactElement {
  const navItems: Array<{
    id: string;
    icon: ReactElement;
    label: string;
  }> = [
    { id: "agent", icon: <CpuChipIcon className="size-5" />, label: "Agent" },
    {
      id: "workflows",
      icon: <WrenchScrewdriverIcon className="size-5" />,
      label: "Workflows",
    },
    {
      id: "imessage",
      icon: <ChatBubbleLeftRightIcon className="size-5" />,
      label: "iMessage",
    },
  ];
  return (
    <aside className="t-resize relative z-20 flex min-h-0 flex-col border-[#e5e7eb] border-r bg-[#fbfbfc]">
      <button
        aria-label={isContentHidden ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-6 -right-4 z-30 inline-flex size-8 items-center justify-center rounded-full border border-[#d8dce3] bg-white text-[#667085] shadow-[0_8px_20px_rgb(16_24_40/0.12)] transition-[background-color,color,box-shadow] duration-200 hover:bg-[#eef4ff] hover:text-[#2457ff] hover:shadow-[0_10px_24px_rgb(36_87_255/0.18)]"
        onClick={onToggle}
        title={isContentHidden ? "Expand sidebar" : "Collapse sidebar"}
        type="button"
      >
        {isContentHidden ? (
          <ChevronDoubleRightIcon className="size-4 transition-transform duration-300" />
        ) : (
          <ChevronDoubleLeftIcon className="size-4 transition-transform duration-300" />
        )}
      </button>
      <header
        className={cn(
          "flex h-20 shrink-0 items-center border-[#eaebef] border-b px-5",
          isCollapsed ? "justify-center" : "justify-start"
        )}
      >
        <div className="flex items-center gap-3">
          <LogoMark size="sm" />
          <span
            className={cn(
              "overflow-hidden whitespace-nowrap font-semibold text-[#1f2430] text-lg transition-[max-width,opacity,transform] duration-500 ease-out",
              isContentHidden
                ? "max-w-0 -translate-x-1 opacity-0"
                : "max-w-24 translate-x-0 opacity-100"
            )}
          >
            Synk
          </span>
        </div>
      </header>
      <nav className="flex min-h-0 grow flex-col overflow-y-auto p-5 transition-[padding] duration-500">
        <div
          className={cn(
            "flex flex-col gap-1",
            isCollapsed && "items-center"
          )}
        >
          {navItems.map((item) => {
            const isActive = activeNavId === item.id;

            return (
              <SidebarNavButton
                icon={item.icon}
                isActive={isActive}
                isContentHidden={isContentHidden}
                isCollapsed={isCollapsed}
                key={item.id}
                label={item.label}
                onClick={() => {
                  onNavSelect(item.id);
                }}
              />
            );
          })}
        </div>
      </nav>
      <SidebarAccountCard
        isCollapsed={isCollapsed}
        isContentHidden={isContentHidden}
      />
    </aside>
  );
}

function SidebarAccountCard({
  isContentHidden,
  isCollapsed,
}: {
  isContentHidden: boolean;
  isCollapsed: boolean;
}): ReactElement {
  const profileName = "Local workspace";
  const profileDetail = "Synk operator";
  const avatarSeed = "synk-local-workspace";

  return (
    <footer
      className={cn(
        "shrink-0 border-[#eaebef] border-t transition-[padding] duration-500",
        isCollapsed ? "flex justify-center p-4" : "p-5"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl transition-[background-color,border-color,box-shadow,padding] duration-500",
          isCollapsed
            ? "border border-transparent bg-transparent p-0 shadow-none"
            : "border border-[#e1e4ea] bg-white p-3 shadow-[0_10px_24px_rgb(16_24_40/0.06)]"
        )}
      >
        <Navii
          alt={profileName}
          animated
          className="size-11 shrink-0 rounded-full ring-2 ring-[#eef0f4] transition-[width,height] duration-300"
          mood="serious"
          seed={avatarSeed}
          size={44}
          title={profileName}
        />
        <div
          className={cn(
            "min-w-0 overflow-hidden transition-[max-width,opacity,transform] duration-500 ease-out",
            isContentHidden
              ? "max-w-0 -translate-x-1 opacity-0"
              : "max-w-44 translate-x-0 opacity-100"
          )}
        >
          <p className="truncate font-semibold text-[#202431] text-sm">
            {profileName}
          </p>
          <p className="truncate text-[#667085] text-xs">{profileDetail}</p>
        </div>
      </div>
    </footer>
  );
}

function SidebarNavButton({
  icon,
  isActive,
  isContentHidden,
  isCollapsed,
  label,
  onClick,
}: {
  icon: ReactElement;
  isActive: boolean;
  isContentHidden: boolean;
  isCollapsed: boolean;
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      aria-pressed={isActive}
      className={cn(
        "group flex h-11 w-full items-center gap-3 rounded-xl bg-transparent px-4 text-left text-[#4a5160] transition-[background-color,padding,width] duration-500",
        "hover:bg-[#eef0f4]",
        isCollapsed && "justify-center px-0",
        isCollapsed && isActive && "justify-center"
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span
        className={cn(
          "flex items-center justify-center transition-[color,transform] duration-200 group-hover:text-[#202431]",
          isActive ? "scale-110 text-[#2457ff]" : "text-[#667085]"
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform,color] duration-500 ease-out group-hover:text-[#202431]",
          isContentHidden
            ? "max-w-0 -translate-x-1 opacity-0"
            : "max-w-36 translate-x-0 opacity-100"
        )}
      >
        {label}
      </span>
    </button>
  );
}

function workspaceCopyFromNav({
  activeNavId,
}: {
  activeNavId: string;
}): WorkspaceCopy {
  if (activeNavId === "workflows") {
    return {
      title: "Workflows",
      subtitle:
        "Scheduled rescans, source-health jobs, and replay-safe scan runs.",
      items: [
        "Manual UI runs call the same scan engine used by future scheduled jobs.",
        "Each run is cached locally so the user can reopen previous reports.",
        "Runs stay retry-safe so failed workflow attempts can be replayed.",
      ],
    };
  }

  if (activeNavId === "imessage") {
    return {
      title: "iMessage",
      subtitle:
        "Spectrum channel surface for chatting with the same Synk agent outside the browser.",
      items: [],
    };
  }

  return {
    title: "Agent",
    subtitle:
      "Stack-aware vulnerability, advisory, deprecation, and release checks.",
    items: [
      "Paste a public GitHub repo URL or dictate it with the microphone.",
      "The agent reads manifests, plans evidence searches, and ranks findings.",
      "Every completed or failed run is cached locally for review.",
    ],
  };
}

function WorkspaceScopeList({ items }: { items: string[] }): ReactElement {
  return (
    <div className="grid gap-3 rounded-xl border border-[#e1e4ea] bg-[#f8f9fb] p-4">
      {items.map((item) => {
        return (
          <div className="flex items-start gap-3 text-[#4a5160] text-sm" key={item}>
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#2457ff]" />
            <span className="leading-6">{item}</span>
          </div>
        );
      })}
    </div>
  );
}

function IMessageSetupPanel({
  isLoading,
  onRecipientPhoneChange,
  onSendTest,
  recipientPhone,
  state,
}: {
  isLoading: boolean;
  onRecipientPhoneChange: (value: string) => void;
  onSendTest: () => Promise<void>;
  recipientPhone: string;
  state: IMessageTestState;
}): ReactElement {
  const resolvedAgentPhone: string =
    state.status === "success" && state.result.agentPhone
      ? state.result.agentPhone
      : "Returned after a real Spectrum test message when the channel exposes a dedicated sender";
  const resolvedMode: string =
    state.status === "success" && state.result.mode === "dedicated"
      ? "Dedicated sender"
      : "Unknown until test";

  return (
    <section className="grid gap-4 rounded-xl border border-[#e1e4ea] bg-white p-4 shadow-[0_12px_30px_rgb(16_24_40/0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-[#202431] text-xl">
            iMessage test
          </h2>
          <p className="text-[#667085] text-sm leading-6">
            Add your number, send a test DM, then check Messages for the Synk
            agent.
          </p>
        </div>
        <span className="rounded-md bg-[#eef4ff] px-2 py-1 font-medium text-[#2457ff] text-xs">
          Spectrum
        </span>
      </div>

      <div className="grid gap-3">
        <label
          className="font-medium text-[#4a5160] text-sm"
          htmlFor="imessage-recipient-phone"
        >
          Your number
        </label>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            className="h-11 rounded-xl border border-[#d8dce3] bg-white px-4 text-[#202431] outline-none focus:border-[#2457ff] focus:ring-3 focus:ring-[#2457ff]/20"
            id="imessage-recipient-phone"
            inputMode="tel"
            onChange={(event) => {
              onRecipientPhoneChange(event.target.value);
            }}
            placeholder="+233XXXXXXXXX"
            type="tel"
            value={recipientPhone}
          />
          <GradientButton
            aria-label="Send Spectrum iMessage test"
            className="h-11 rounded-xl px-4 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isLoading || recipientPhone.trim().length === 0}
            onClick={() => {
              void onSendTest();
            }}
            type="button"
            variant="blue"
          >
            <PaperAirplaneIcon aria-hidden="true" className="size-4 text-white" />
            <span className="font-semibold text-sm text-white">
              {isLoading ? "Sending" : "Send test"}
            </span>
          </GradientButton>
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-[#e1e4ea] bg-[#f8f9fb] p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-[#4a5160] text-sm">
            Agent number
          </span>
          <span className="text-[#667085] text-sm">{resolvedMode}</span>
        </div>
        <p className="break-words font-semibold text-[#202431] text-sm">
          {resolvedAgentPhone}
        </p>
      </div>

      {state.status === "success" ? (
        <p className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-[#166534] text-sm leading-6">
          Test sent to {state.result.recipientPhone}. The sender shown in your
          Messages app is the agent number for this channel.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-[#b91c1c] text-sm leading-6">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

function AgentWorkspace({
  activeRunId,
  activeNavId,
  effort,
  isLoading,
  onEffortChange,
  onPromptSubmit,
  onRunRecordClick,
  runs,
}: {
  activeRunId: string | null;
  activeNavId: string;
  effort: EffortLevel;
  isLoading: boolean;
  onEffortChange: (effort: EffortLevel) => void;
  onPromptSubmit: (value: string) => Promise<void>;
  onRunRecordClick: ({ run }: { run: RunRecord }) => void;
  runs: RunRecord[];
}): ReactElement {
  const [recipientPhone, setRecipientPhone] = useState("");
  const [iMessageTestState, setIMessageTestState] =
    useState<IMessageTestState>({ status: "idle" });

  const copy: WorkspaceCopy = workspaceCopyFromNav({ activeNavId });
  const isIMessageView: boolean = activeNavId === "imessage";
  const isIMessageTestLoading = iMessageTestState.status === "loading";

  async function handleIMessageTestSubmit(): Promise<void> {
    const normalizedPhone = normalizePhoneInput({ value: recipientPhone });

    if (normalizedPhone.length === 0 || isIMessageTestLoading) {
      return;
    }

    setIMessageTestState({ status: "loading" });

    const response = await postIMessageTest({
      recipientPhone: normalizedPhone,
    });

    if (errore.isError(response)) {
      setIMessageTestState({
        status: "error",
        message: response.message,
      });
      return;
    }

    if (!response.ok) {
      setIMessageTestState({
        status: "error",
        message: response.error.message,
      });
      return;
    }

    setRecipientPhone(response.result.recipientPhone);
    setIMessageTestState({
      status: "success",
      result: response.result,
    });
  }

  return (
    <section className="flex min-h-0 flex-col overflow-y-auto bg-white px-12 py-10">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-4xl text-[#202431]">
            {copy.title}
          </h1>
          <p className="text-[#667085] text-lg">
            {copy.subtitle}
          </p>
        </div>

        {isIMessageView ? (
          <IMessageSetupPanel
            isLoading={isIMessageTestLoading}
            onRecipientPhoneChange={setRecipientPhone}
            onSendTest={handleIMessageTestSubmit}
            recipientPhone={recipientPhone}
            state={iMessageTestState}
          />
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <label
                className="font-medium text-[#4a5160] text-sm"
                htmlFor="ai-input-15"
              >
                Query
              </label>
              <AI_Prompt
                className="w-full"
                disabled={isLoading}
                headerText="Query"
                onSubmit={onPromptSubmit}
                placeholder="Paste a GitHub repository URL and ask what can break or expose it"
              />
            </div>

            <div className="grid gap-4">
              <label
                className="font-medium text-[#202431] text-base"
                htmlFor="agent-effort"
              >
                Effort
              </label>
              <select
                className="h-12 rounded-xl border border-[#d8dce3] bg-white px-4 text-[#202431] outline-none focus:border-[#2457ff] focus:ring-3 focus:ring-[#2457ff]/20"
                id="agent-effort"
                onChange={(event) => {
                  onEffortChange(effortFromValue({ value: event.target.value }));
                }}
                value={effort}
              >
                <option value="Auto">Auto</option>
                <option value="Focused">Focused</option>
                <option value="Deep">Deep</option>
              </select>
            </div>
          </>
        )}

        {isIMessageView ? null : <WorkspaceScopeList items={copy.items} />}

        <PastRuns
          activeRunId={activeRunId}
          onRunRecordClick={onRunRecordClick}
          runs={runs}
        />
      </div>
    </section>
  );
}

function PastRuns({
  activeRunId,
  onRunRecordClick,
  runs,
}: {
  activeRunId: string | null;
  onRunRecordClick: ({ run }: { run: RunRecord }) => void;
  runs: RunRecord[];
}): ReactElement {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-semibold text-2xl text-[#202431]">Past Runs</h2>
      {runs.length === 0 ? (
        <div className="rounded-xl border border-[#e1e4ea] bg-[#f8f9fb] p-4 text-[#667085] text-sm">
          Runs appear here after the first repository scan.
        </div>
      ) : (
        <div className="flex max-h-[22rem] flex-col gap-2 overflow-y-auto pr-2">
          {runs.map((run) => {
            const isActive = activeRunId === run.id;

            return (
              <button
                aria-pressed={isActive}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] gap-4 rounded-lg p-4 text-left transition-colors",
                  isActive ? "bg-[#eef4ff]" : "hover:bg-[#f3f5f8]"
                )}
                key={run.id}
                onClick={() => {
                  onRunRecordClick({ run });
                }}
                type="button"
              >
                <span className="flex min-w-0 flex-col gap-2">
                  <span className="truncate font-semibold text-[#202431]">
                    {run.repoLabel}
                  </span>
                  <span className="text-[#667085] text-sm">{run.createdAt}</span>
                </span>
                <RunStatusBadge status={run.status} />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RunStatusBadge({
  status,
}: {
  status: RunRecord["status"];
}): ReactElement {
  return (
    <span
      className={cn(
        "h-fit rounded-md px-2 py-1 font-medium text-xs",
        status === "completed"
          ? "bg-[#dcfce7] text-[#15803d]"
          : "bg-[#fee2e2] text-[#b91c1c]"
      )}
    >
      {status}
    </span>
  );
}

function OutputWorkspace({ scanState }: { scanState: ScanViewState }): ReactElement {
  return (
    <section className="dark flex min-h-0 flex-col bg-[#151515] text-[#f5f5f5]">
      <header className="flex h-16 shrink-0 items-center border-[#282828] border-b px-6">
        <div className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#202020] px-4 font-semibold text-[#f5f5f5] text-sm">
          <CircleStackIcon className="size-4" />
          Runs
        </div>
      </header>
      <div className="min-h-0 grow overflow-y-auto p-6">
        <ScanResultPanel scanState={scanState} />
      </div>
    </section>
  );
}

function createRunRecord({
  error,
  prompt,
  report,
  repoLabel,
  status,
}: {
  error: string | null;
  prompt: string;
  report: ScanReport | null;
  repoLabel: string;
  status: RunRecord["status"];
}): RunRecord {
  return {
    createdAt: new Date().toLocaleString(undefined, {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
    }),
    error,
    id: `${status}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    prompt,
    report,
    repoLabel,
    status,
  };
}

function appendRunToCachedHistory({
  run,
}: {
  run: RunRecord;
}): RunCacheReadError | RunCacheWriteError | RunHistoryState {
  const history = readCachedRunHistory();

  if (errore.isError(history)) {
    return history;
  }

  return writeCachedRunHistory({
    history: {
      activeRunId: run.id,
      runs: [run].concat(history.runs),
    },
  });
}

function selectCachedRun({
  run,
}: {
  run: RunRecord;
}): RunCacheReadError | RunCacheWriteError | RunHistoryState {
  const history = readCachedRunHistory();

  if (errore.isError(history)) {
    return history;
  }

  return writeCachedRunHistory({
    history: {
      ...history,
      activeRunId: run.id,
    },
  });
}

function scanStateFromRunHistorySnapshot({
  snapshot,
}: {
  snapshot: RunHistorySnapshot;
}): ScanViewState {
  if (snapshot.error) {
    return {
      status: "error",
      message: snapshot.error,
    };
  }

  return scanStateFromRunHistory({ history: snapshot.history });
}

function subscribeRunHistory(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(RUN_HISTORY_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(RUN_HISTORY_CHANGE_EVENT, onStoreChange);
  };
}

function getServerRunHistorySnapshot(): RunHistorySnapshot {
  return EMPTY_RUN_HISTORY_SNAPSHOT;
}

function getClientRunHistorySnapshot(): RunHistorySnapshot {
  if (typeof window === "undefined") {
    return EMPTY_RUN_HISTORY_SNAPSHOT;
  }

  const cachedValue = errore.try({
    try: () => {
      return window.localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
    },
    catch: (cause) => {
      return new RunCacheReadError({ cause });
    },
  });

  if (errore.isError(cachedValue)) {
    return cacheRunHistorySnapshot({
      raw: null,
      snapshot: {
        history: EMPTY_RUN_HISTORY,
        error: cachedValue.message,
      },
    });
  }

  if (cachedValue === cachedRunHistoryRaw) {
    return cachedRunHistorySnapshot;
  }

  const history = readCachedRunHistory();

  if (errore.isError(history)) {
    return cacheRunHistorySnapshot({
      raw: cachedValue,
      snapshot: {
        history: EMPTY_RUN_HISTORY,
        error: history.message,
      },
    });
  }

  return cacheRunHistorySnapshot({
    raw: cachedValue,
    snapshot: {
      history,
      error: null,
    },
  });
}

function cacheRunHistorySnapshot({
  raw,
  snapshot,
}: {
  raw: string | null;
  snapshot: RunHistorySnapshot;
}): RunHistorySnapshot {
  cachedRunHistoryRaw = raw;
  cachedRunHistorySnapshot = snapshot;
  return cachedRunHistorySnapshot;
}

function scanStateFromRunHistory({
  history,
}: {
  history: RunHistoryState;
}): ScanViewState {
  const activeRun: RunRecord | undefined = history.runs.find((run) => {
    return run.id === history.activeRunId;
  });

  if (!activeRun) {
    return { status: "idle" };
  }

  return scanStateFromRun({ run: activeRun });
}

function scanStateFromRun({ run }: { run: RunRecord }): ScanViewState {
  if (run.status === "completed" && run.report) {
    return {
      report: run.report,
      status: "success",
    };
  }

  return {
    message: run.error || "Run failed without a returned error message.",
    status: "error",
  };
}

function readCachedRunHistory(): RunCacheReadError | RunHistoryState {
  if (typeof window === "undefined") {
    return {
      activeRunId: null,
      runs: [],
    };
  }

  const cachedValue = errore.try({
    try: () => {
      return window.localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
    },
    catch: (cause) => {
      return new RunCacheReadError({ cause });
    },
  });

  if (errore.isError(cachedValue)) {
    return cachedValue;
  }

  if (!cachedValue) {
    return {
      activeRunId: null,
      runs: [],
    };
  }

  const parsed = errore.try({
    try: () => {
      return JSON.parse(cachedValue) as unknown;
    },
    catch: (cause) => {
      return new RunCacheReadError({ cause });
    },
  });

  if (errore.isError(parsed)) {
    return parsed;
  }

  if (!isRunHistoryState(parsed)) {
    return new RunCacheReadError();
  }

  return normalizeRunHistory({ history: parsed });
}

function writeCachedRunHistory({
  history,
}: {
  history: RunHistoryState;
}): RunCacheWriteError | RunHistoryState {
  const normalizedHistory: RunHistoryState = normalizeRunHistory({ history });

  if (typeof window === "undefined") {
    return normalizedHistory;
  }

  const serialized = errore.try({
    try: () => {
      return JSON.stringify(normalizedHistory);
    },
    catch: (cause) => {
      return new RunCacheWriteError({ cause });
    },
  });

  if (errore.isError(serialized)) {
    return serialized;
  }

  const writeResult = errore.try({
    try: () => {
      window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, serialized);
    },
    catch: (cause) => {
      return new RunCacheWriteError({ cause });
    },
  });

  if (errore.isError(writeResult)) {
    return writeResult;
  }

  cacheRunHistorySnapshot({
    raw: serialized,
    snapshot: {
      history: normalizedHistory,
      error: null,
    },
  });
  window.dispatchEvent(new Event(RUN_HISTORY_CHANGE_EVENT));

  return normalizedHistory;
}

function normalizeRunHistory({
  history,
}: {
  history: RunHistoryState;
}): RunHistoryState {
  const activeRunExists: boolean = history.runs.some((run) => {
    return run.id === history.activeRunId;
  });

  if (activeRunExists) {
    return history;
  }

  return {
    activeRunId: history.runs[0]?.id || null,
    runs: history.runs,
  };
}

function effortFromValue({ value }: { value: string }): EffortLevel {
  if (value === "Focused" || value === "Deep") {
    return value;
  }

  return "Auto";
}

function parsePromptRequest({ value }: { value: string }): ParsedPromptRequest {
  const trimmedValue: string = value.trim();

  return {
    githubUrl: extractGithubUrl({ value: trimmedValue }),
  };
}

function extractGithubUrl({ value }: { value: string }): string {
  const fullUrlMatch: RegExpMatchArray | null = value.match(
    /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i
  );

  if (fullUrlMatch?.[0]) {
    return trimTrailingPunctuation({ value: fullUrlMatch[0] });
  }

  const shorthandMatch: RegExpMatchArray | null = value.match(
    /(?:^|\s)(github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i
  );

  if (shorthandMatch?.[1]) {
    const repositoryPath: string = trimTrailingPunctuation({
      value: shorthandMatch[1],
    });

    return `https://${repositoryPath}`;
  }

  return value;
}

function trimTrailingPunctuation({ value }: { value: string }): string {
  return value.replace(/[),.;\]]+$/g, "");
}

async function postScan({
  githubUrl,
}: {
  githubUrl: string;
}): Promise<
  ClientFetchError | ClientResponseParseError | ClientResponseShapeError | ScanApiResponse
> {
  const response = await errore.tryAsync({
    try: () => {
      return fetch("/api/scan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          githubUrl,
        }),
      });
    },
    catch: (cause) => {
      return new ClientFetchError({ cause });
    },
  });

  if (errore.isError(response)) {
    return response;
  }

  const bodyText = await errore.tryAsync({
    try: () => {
      return response.text();
    },
    catch: (cause) => {
      return new ClientResponseParseError({ cause });
    },
  });

  if (errore.isError(bodyText)) {
    return bodyText;
  }

  const parsed = errore.try({
    try: () => {
      return JSON.parse(bodyText) as unknown;
    },
    catch: (cause) => {
      return new ClientResponseParseError({ cause });
    },
  });

  if (errore.isError(parsed)) {
    return parsed;
  }

  if (!isScanApiResponse(parsed)) {
    return new ClientResponseShapeError();
  }

  return parsed;
}

async function postIMessageTest({
  recipientPhone,
}: {
  recipientPhone: string;
}): Promise<
  | ClientFetchError
  | ClientResponseParseError
  | ClientIMessageResponseShapeError
  | IMessageTestApiResponse
> {
  const response = await errore.tryAsync({
    try: () => {
      return fetch("/api/spectrum/imessage/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          recipientPhone,
        }),
      });
    },
    catch: (cause) => {
      return new ClientFetchError({ cause });
    },
  });

  if (errore.isError(response)) {
    return response;
  }

  const bodyText = await errore.tryAsync({
    try: () => {
      return response.text();
    },
    catch: (cause) => {
      return new ClientResponseParseError({ cause });
    },
  });

  if (errore.isError(bodyText)) {
    return bodyText;
  }

  const parsed = errore.try({
    try: () => {
      return JSON.parse(bodyText) as unknown;
    },
    catch: (cause) => {
      return new ClientResponseParseError({ cause });
    },
  });

  if (errore.isError(parsed)) {
    return parsed;
  }

  if (!isIMessageTestApiResponse(parsed)) {
    return new ClientIMessageResponseShapeError();
  }

  return parsed;
}

function normalizePhoneInput({ value }: { value: string }): string {
  return value.replace(/[^\d+]/g, "");
}

function ScanResultPanel({ scanState }: { scanState: ScanViewState }): ReactElement {
  if (scanState.status === "loading") {
    return <LoadingPanel />;
  }

  if (scanState.status === "error") {
    return <ErrorPanel message={scanState.message} />;
  }

  if (scanState.status === "success") {
    return <ReportPanel report={scanState.report} />;
  }

  return <IdlePanel />;
}

function IdlePanel(): ReactElement {
  return (
    <div className="flex min-h-0 grow flex-col items-center justify-center gap-8 px-6 text-center">
      <LogoMark size="lg" />
      <div className="flex flex-col gap-3">
        <p className="text-2xl font-semibold text-[#f1f1f1]">No runs yet</p>
        <p className="text-[#a6a6a6] text-base">
          Run a repository scan to see output here
        </p>
      </div>
    </div>
  );
}

function LoadingPanel(): ReactElement {
  return (
    <div className="flex min-h-[360px] flex-col gap-6 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
        <Loader
          className="p-0"
          size="sm"
          subtitle="Manifest data and deterministic risk queries are being ranked."
          title="Scanning repository"
        />
        <AITextLoading
          className="text-base font-semibold sm:text-lg"
          interval={1200}
          texts={[
            "Reading public manifests",
            "Extracting stack signals",
            "Building CVE evidence queries",
            "Preparing exploit-chatter links",
            "Ranking actionable risk",
          ]}
        />
      </div>
      <div className="grid gap-3">
        <AgentToolTrace />
      </div>
      <LoadingReportSkeleton />
    </div>
  );
}

function LoadingReportSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading report preview">
      <div className="grid gap-3 sm:grid-cols-3">
        <LoadingMetricSkeleton />
        <LoadingMetricSkeleton />
        <LoadingMetricSkeleton />
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28 bg-[#2b2b2b]" />
          <Skeleton className="h-3 w-44 bg-[#242424]" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-9 rounded-lg bg-[#242424]" />
          <Skeleton className="h-9 rounded-lg bg-[#242424]" />
          <Skeleton className="h-9 rounded-lg bg-[#242424]" />
          <Skeleton className="h-9 rounded-lg bg-[#242424]" />
        </div>
      </section>

      <div className="grid gap-4">
        <LoadingFindingSkeleton />
        <LoadingFindingSkeleton />
        <LoadingFindingSkeleton />
      </div>
    </div>
  );
}

function LoadingMetricSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <Skeleton className="h-3 w-24 bg-[#242424]" />
      <Skeleton className="h-8 w-14 bg-[#2b2b2b]" />
    </div>
  );
}

function LoadingFindingSkeleton(): ReactElement {
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex grow flex-col gap-2">
          <Skeleton className="h-4 w-3/4 bg-[#2b2b2b]" />
          <Skeleton className="h-3 w-1/2 bg-[#242424]" />
        </div>
        <Skeleton className="h-7 w-20 rounded-lg bg-[#242424]" />
      </div>
      <Skeleton className="h-3 w-full bg-[#242424]" />
      <Skeleton className="h-3 w-5/6 bg-[#242424]" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-7 w-24 rounded-lg bg-[#242424]" />
        <Skeleton className="h-7 w-28 rounded-lg bg-[#242424]" />
        <Skeleton className="h-7 w-20 rounded-lg bg-[#242424]" />
      </div>
    </article>
  );
}

function AgentToolTrace(): ReactElement {
  const toolCalls: Array<{
    name: string;
    description: string;
  }> = [
    {
      name: "GitHub manifest reader",
      description: "Reads package and ecosystem manifests from the public repo.",
    },
    {
      name: "Stack extractor",
      description: "Finds dependencies, frameworks, vendors, and versions.",
    },
    {
      name: "Evidence link planner",
      description:
        "Creates CVE, advisory, exploit, deprecation, and release-note evidence links.",
    },
    {
      name: "Risk sorter",
      description: "Ranks candidate checks by severity and stack exposure.",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <WrenchScrewdriverIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        Agent execution trace
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {toolCalls.map((toolCall) => {
          return (
            <div
              className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 text-sm"
              key={toolCall.name}
            >
              <span className="font-medium">{toolCall.name}</span>
              <p className="text-muted-foreground text-xs leading-5">
                {toolCall.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }): ReactElement {
  return (
    <div className="flex min-h-[360px] flex-col gap-4 rounded-lg border border-destructive/40 bg-card p-4">
      <div className="flex items-center gap-3">
        <ExclamationTriangleIcon
          aria-hidden="true"
          className="size-5 text-destructive"
        />
        <p className="text-sm font-medium">Scan failed</p>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  );
}

function ReportPanel({ report }: { report: ScanReport }): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3">
        <SummaryMetric
          label="Candidate checks"
          value={String(report.summary.totalFindings)}
        />
        <SummaryMetric
          label="High-priority checks"
          value={String(report.summary.critical + report.summary.high)}
        />
        <SummaryMetric label="Dependencies" value={String(report.stack.dependencies.length)} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Detected stack</p>
          <p className="text-sm text-muted-foreground">
            {report.repo.owner}/{report.repo.repo}
          </p>
        </div>
        <TokenList label="Languages" values={report.stack.languages} />
        <TokenList label="Frameworks" values={report.stack.frameworks} />
        <TokenList label="Package managers" values={report.stack.packageManagers} />
        <TokenList label="Vendors" values={report.stack.vendors} />
        <p className="text-sm leading-6 text-muted-foreground">
          {report.summary.topAction}
        </p>
      </section>

      <FindingGroups groups={report.groups} />
    </div>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function TokenList({
  label,
  values,
}: {
  label: string;
  values: string[];
}): ReactElement {
  const displayValues: string[] = values.length > 0 ? values : ["None detected"];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {displayValues.map((value) => {
          return (
            <span
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
              key={value}
            >
              {value}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FindingGroups({ groups }: { groups: ReportGroups }): ReactElement {
  const groupModels: Array<{
    title: string;
    description: string;
    findings: Finding[];
  }> = [
    {
      title: "Vulnerabilities",
      description: "CVEs and security advisories mapped to detected packages.",
      findings: groups.vulnerabilities,
    },
    {
      title: "Exploit chatter",
      description: "News and social searches for active attack signals.",
      findings: groups.exploitChatter,
    },
    {
      title: "Vendor deprecations",
      description: "Operational risks from end-of-life or removed support.",
      findings: groups.deprecations,
    },
    {
      title: "Breaking releases",
      description: "Release-note risks that may break APIs or runtime behavior.",
      findings: groups.breakingReleases,
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      {groupModels.map((group) => {
        return (
          <div
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
            key={group.title}
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{group.title}</p>
              <p className="text-sm text-muted-foreground">
                {group.description}
              </p>
            </div>
            {group.findings.length > 0 ? (
              <div className="grid gap-3">
                {group.findings.slice(0, 6).map((finding) => {
                  return <FindingItem finding={finding} key={finding.id} />;
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                No candidate checks matched this group. This is not a safety
                guarantee.
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

function FindingItem({ finding }: { finding: Finding }): ReactElement {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{finding.title}</p>
          <p className="text-xs text-muted-foreground">
            {finding.affectedDependency}
            {finding.installedVersion ? ` @ ${finding.installedVersion}` : ""}
            {" · "}
            {finding.matchLabel.replaceAll("_", " ")}
          </p>
        </div>
        <SeverityBadge severity={finding.severity} />
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        {finding.recommendedAction}
      </p>
      <div className="flex flex-wrap gap-2">
        {finding.evidence.map((evidence) => {
          return (
            <a
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              href={evidence.url}
              key={`${finding.id}:${evidence.url}`}
              rel="noreferrer"
              target="_blank"
            >
              {evidence.sourceName}
              <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-3" />
            </a>
          );
        })}
      </div>
    </article>
  );
}

function SeverityBadge({ severity }: { severity: Severity }): ReactElement {
  return (
    <span
      className={cn(
        "w-fit rounded-lg border px-2 py-1 text-xs font-medium",
        severityClass({ severity })
      )}
    >
      {severity}
    </span>
  );
}

function severityClass({ severity }: { severity: Severity }): string {
  if (severity === "critical" || severity === "high") {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }

  if (severity === "medium") {
    return "border-border bg-secondary text-secondary-foreground";
  }

  return "border-border bg-card text-muted-foreground";
}

function isRunHistoryState(value: unknown): value is RunHistoryState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.activeRunId === null || typeof value.activeRunId === "string") &&
    Array.isArray(value.runs) &&
    value.runs.every((run) => {
      return isRunRecord(run);
    })
  );
}

function isRunRecord(value: unknown): value is RunRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.prompt === "string" &&
    typeof value.repoLabel === "string" &&
    (value.status === "completed" || value.status === "failed") &&
    (value.report === null || isScanReport(value.report)) &&
    (value.error === null || typeof value.error === "string")
  );
}

function isScanApiResponse(value: unknown): value is ScanApiResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (value.ok === true) {
    return isScanReport(value.report);
  }

  if (value.ok === false) {
    return isRecord(value.error) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string";
  }

  return false;
}

function isIMessageTestApiResponse(
  value: unknown
): value is IMessageTestApiResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (value.ok === true) {
    return isIMessageTestResult(value.result);
  }

  if (value.ok === false) {
    return isRecord(value.error) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string";
  }

  return false;
}

function isIMessageTestResult(value: unknown): value is IMessageTestResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.agentPhone === null || typeof value.agentPhone === "string") &&
    (value.mode === "dedicated" || value.mode === "shared_or_unknown") &&
    typeof value.recipientPhone === "string" &&
    value.status === "sent"
  );
}

function isScanReport(value: unknown): value is ScanReport {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.scanId === "string" &&
    typeof value.scannedAt === "string" &&
    isGithubRepoRef(value.repo) &&
    isDetectedStack(value.stack) &&
    isReportSummary(value.summary) &&
    isReportGroups(value.groups)
  );
}

function isGithubRepoRef(value: unknown): value is ScanReport["repo"] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.owner === "string" &&
    typeof value.repo === "string" &&
    typeof value.branch === "string" &&
    typeof value.url === "string"
  );
}

function isDetectedStack(value: unknown): value is ScanReport["stack"] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isGithubRepoRef(value.repo) &&
    isManifestList(value.manifests) &&
    isStringArray(value.languages) &&
    isStringArray(value.frameworks) &&
    isStringArray(value.packageManagers) &&
    isStringArray(value.vendors) &&
    isDependencyList(value.dependencies)
  );
}

function isManifestList(value: unknown): value is ScanReport["stack"]["manifests"] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((manifest) => {
    if (!isRecord(manifest)) {
      return false;
    }

    return typeof manifest.path === "string" && typeof manifest.kind === "string";
  });
}

function isDependencyList(
  value: unknown
): value is ScanReport["stack"]["dependencies"] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((dependency) => {
    if (!isRecord(dependency)) {
      return false;
    }

    return (
      typeof dependency.name === "string" &&
      (dependency.version === null || typeof dependency.version === "string") &&
      typeof dependency.ecosystem === "string" &&
      typeof dependency.sourceFile === "string" &&
      typeof dependency.scope === "string"
    );
  });
}

function isReportSummary(value: unknown): value is ScanReport["summary"] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.totalFindings === "number" &&
    typeof value.critical === "number" &&
    typeof value.high === "number" &&
    typeof value.medium === "number" &&
    typeof value.low === "number" &&
    typeof value.info === "number" &&
    typeof value.topAction === "string"
  );
}

function isReportGroups(value: unknown): value is ReportGroups {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFindingList(value.vulnerabilities) &&
    isFindingList(value.exploitChatter) &&
    isFindingList(value.deprecations) &&
    isFindingList(value.breakingReleases)
  );
}

function isFindingList(value: unknown): value is Finding[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((finding) => {
    return isFinding(finding);
  });
}

function isFinding(value: unknown): value is Finding {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.affectedDependency === "string" &&
    (value.installedVersion === null ||
      typeof value.installedVersion === "string") &&
    isSeverityValue(value.severity) &&
    typeof value.confidence === "string" &&
    typeof value.matchLabel === "string" &&
    isEvidenceList(value.evidence) &&
    typeof value.recommendedAction === "string" &&
    typeof value.score === "number" &&
    typeof value.firstSeen === "string"
  );
}

function isEvidenceList(value: unknown): value is Finding["evidence"] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((evidence) => {
    if (!isRecord(evidence)) {
      return false;
    }

    return (
      typeof evidence.sourceName === "string" &&
      typeof evidence.sourceType === "string" &&
      typeof evidence.url === "string" &&
      typeof evidence.observedAt === "string" &&
      typeof evidence.summary === "string"
    );
  });
}

function isSeverityValue(value: unknown): value is Severity {
  return (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "info"
  );
}

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((item) => {
    return typeof item === "string";
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
