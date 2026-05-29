"use client";

import * as errore from "errore";
import {
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon,
  BookmarkIcon,
  ChatBubbleLeftRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  CheckIcon,
  CircleStackIcon,
  ClipboardDocumentIcon,
  CpuChipIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Navii } from "@usenavii/react";
import Image from "next/image";
import dedent from "string-dedent";
import {
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import AI_Prompt from "@/components/kokonutui/ai-prompt";
import AITextLoading from "@/components/kokonutui/ai-text-loading";
import GradientButton from "@/components/kokonutui/gradient-button";
import Loader from "@/components/kokonutui/loader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  AdvisorChatApiResponse,
  AdvisorChatMessage,
  AdvisorFindingContext,
  AdvisorReportApiResponse,
  AdvisorRunContext,
} from "@/lib/types/advisor";
import type {
  Finding,
  ReportGroups,
  ScanApiResponse,
  ScanMemoryStatus,
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
  message: "Scan response did not match the expected shape",
}) {}

class ClientAdvisorFetchError extends errore.createTaggedError({
  name: "ClientAdvisorFetchError",
  message: "Advisor request failed",
}) {}

class ClientAdvisorResponseParseError extends errore.createTaggedError({
  name: "ClientAdvisorResponseParseError",
  message: "Advisor response was not valid JSON",
}) {}

class ClientAdvisorResponseShapeError extends errore.createTaggedError({
  name: "ClientAdvisorResponseShapeError",
  message: "Advisor response did not match the expected shape",
}) {}

class ClientClipboardUnavailableError extends errore.createTaggedError({
  name: "ClientClipboardUnavailableError",
  message: "Clipboard API is unavailable",
}) {}

class ClientClipboardWriteError extends errore.createTaggedError({
  name: "ClientClipboardWriteError",
  message: "Clipboard write failed",
}) {}

class RunCacheReadError extends errore.createTaggedError({
  name: "RunCacheReadError",
  message: "Run cache could not be read",
}) {}

class RunCacheWriteError extends errore.createTaggedError({
  name: "RunCacheWriteError",
  message: "Run cache could not be saved",
}) {}

class ReportBookmarkCacheReadError extends errore.createTaggedError({
  name: "ReportBookmarkCacheReadError",
  message: "Report bookmarks could not be read",
}) {}

class ReportBookmarkCacheWriteError extends errore.createTaggedError({
  name: "ReportBookmarkCacheWriteError",
  message: "Report bookmarks could not be saved",
}) {}

class LocalCacheClearError extends errore.createTaggedError({
  name: "LocalCacheClearError",
  message: "Local Synk cache could not be cleared",
}) {}

class ClientDownloadError extends errore.createTaggedError({
  name: "ClientDownloadError",
  message: "Report download failed",
}) {}

type NavId = "agent" | "fixes" | "advisor";

type ScanViewState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
    }
  | {
      status: "success";
      memory: ScanMemoryStatus | null;
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
  memory: ScanMemoryStatus | null;
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

type WorkspaceCopy = {
  title: string;
  subtitle: string;
  items: string[];
};

type WorkflowFixPattern = {
  id: string;
  title: string;
  severity: Severity;
  pattern: string;
  fixSteps: string[];
  prompt: string;
};

type CopyPromptState = "idle" | "copying" | "copied" | "error";

type AdvisorStatus = "idle" | "loading" | "error";

type AdvisorReportState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
    }
  | {
      bookmark: AdvisorReportBookmark;
      status: "saved";
    }
  | {
      message: string;
      status: "error";
    };

type AdvisorReportBookmark = {
  id: string;
  createdAt: string;
  markdown: string;
  repoLabel: string;
  sourceQuestion: string;
  title: string;
};

type AdvisorReportBookmarkState = {
  activeReportBookmarkId: string | null;
  reports: AdvisorReportBookmark[];
};

type AdvisorReportBookmarkSnapshot = {
  error: string | null;
  state: AdvisorReportBookmarkState;
};

type AdvisorParsedJson = {
  value: unknown;
};

const RUN_HISTORY_STORAGE_KEY = "synk.run-history.v2";
const RUN_HISTORY_CHANGE_EVENT = "synk-run-history-change";
const ADVISOR_REPORT_BOOKMARK_STORAGE_KEY = "synk.advisor-report-bookmarks.v1";
const ADVISOR_REPORT_BOOKMARK_CHANGE_EVENT =
  "synk-advisor-report-bookmark-change";
const SIDEBAR_OPEN_TRACK = "20rem";
const SIDEBAR_CLOSED_TRACK = "5rem";
const SIDEBAR_CLOSE_LABEL_DELAY_MS = 120;
const SIDEBAR_OPEN_LABEL_DELAY_MS = 260;
const RUNS_PANEL_OPEN_WIDTH_PX = 560;
const RUNS_PANEL_MIN_WIDTH_PX = 360;
const RUNS_PANEL_MAX_WIDTH_PX = 920;
const RUNS_PANEL_CLOSED_TRACK = "4.75rem";
const RUNS_PANEL_CLOSE_LABEL_DELAY_MS = 120;
const RUNS_PANEL_OPEN_LABEL_DELAY_MS = 240;
const EMPTY_RUN_HISTORY: RunHistoryState = {
  activeRunId: null,
  runs: [],
};
const EMPTY_RUN_HISTORY_SNAPSHOT: RunHistorySnapshot = {
  history: EMPTY_RUN_HISTORY,
  error: null,
};
const EMPTY_ADVISOR_REPORT_BOOKMARK_STATE: AdvisorReportBookmarkState = {
  activeReportBookmarkId: null,
  reports: [],
};
const EMPTY_ADVISOR_REPORT_BOOKMARK_SNAPSHOT: AdvisorReportBookmarkSnapshot = {
  error: null,
  state: EMPTY_ADVISOR_REPORT_BOOKMARK_STATE,
};

let cachedRunHistoryRaw: string | null | undefined = undefined;
let cachedRunHistorySnapshot: RunHistorySnapshot = EMPTY_RUN_HISTORY_SNAPSHOT;
let cachedAdvisorReportBookmarksRaw: string | null | undefined = undefined;
let cachedAdvisorReportBookmarksSnapshot: AdvisorReportBookmarkSnapshot =
  EMPTY_ADVISOR_REPORT_BOOKMARK_SNAPSHOT;

function clampRunsPanelWidth({ widthPx }: { widthPx: number }): number {
  return Math.min(
    RUNS_PANEL_MAX_WIDTH_PX,
    Math.max(RUNS_PANEL_MIN_WIDTH_PX, Math.round(widthPx))
  );
}

export default function Home(): ReactElement {
  const runHistorySnapshot = useSyncExternalStore(
    subscribeRunHistory,
    getClientRunHistorySnapshot,
    getServerRunHistorySnapshot
  );
  const advisorReportBookmarkSnapshot = useSyncExternalStore(
    subscribeAdvisorReportBookmarks,
    getClientAdvisorReportBookmarkSnapshot,
    getServerAdvisorReportBookmarkSnapshot
  );
  const [scanStateOverride, setScanStateOverride] =
    useState<ScanViewState | null>(null);
  const [activeNavId, setActiveNavId] = useState<NavId>("agent");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarContentHidden, setIsSidebarContentHidden] = useState(false);
  const [isRunsPanelCollapsed, setIsRunsPanelCollapsed] = useState(false);
  const [isRunsPanelContentHidden, setIsRunsPanelContentHidden] =
    useState(false);
  const [runsPanelWidthPx, setRunsPanelWidthPx] = useState(
    RUNS_PANEL_OPEN_WIDTH_PX
  );
  const [cacheResetVersion, setCacheResetVersion] = useState(0);
  const [effort, setEffort] = useState<EffortLevel>("Auto");
  const sidebarTransitionTimeoutRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const runsPanelTransitionTimeoutRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const runsPanelResizeDragRef = useRef<boolean>(false);

  const scanState: ScanViewState =
    scanStateOverride ||
    scanStateFromRunHistorySnapshot({ snapshot: runHistorySnapshot });
  const runs: RunRecord[] = runHistorySnapshot.history.runs;
  const activeRunId: string | null = runHistorySnapshot.history.activeRunId;
  const advisorReportBookmarks: AdvisorReportBookmark[] =
    advisorReportBookmarkSnapshot.state.reports;
  const activeAdvisorReportBookmark: AdvisorReportBookmark | null =
    advisorReportBookmarks.find((bookmark) => {
      return (
        bookmark.id ===
        advisorReportBookmarkSnapshot.state.activeReportBookmarkId
      );
    }) ?? null;
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
        memory: null,
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
        memory: null,
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
      memory: response.memory,
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
          memory: response.memory,
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

  function handleAdvisorReportBookmarkClick({
    bookmark,
  }: {
    bookmark: AdvisorReportBookmark;
  }): void {
    const cachedBookmarkState = selectCachedAdvisorReportBookmark({
      bookmark,
    });

    if (cachedBookmarkState instanceof Error) {
      setScanStateOverride({
        message: cachedBookmarkState.message,
        status: "error",
      });
      return;
    }

    setActiveNavId("advisor");
  }

  function handleAdvisorReportBookmarkCreate({
    bookmark,
  }: {
    bookmark: AdvisorReportBookmark;
  }):
    | AdvisorReportBookmarkState
    | ReportBookmarkCacheReadError
    | ReportBookmarkCacheWriteError {
    return appendAdvisorReportBookmarkToCache({
      bookmark,
    });
  }

  function handleClearCachedState(): void {
    const result = clearCachedClientState();

    if (result instanceof Error) {
      setScanStateOverride({
        message: result.message,
        status: "error",
      });
      return;
    }

    setScanStateOverride({ status: "idle" });
    setActiveNavId("agent");
    setEffort("Auto");
    setCacheResetVersion((version) => {
      return version + 1;
    });
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

  function handleRunsPanelToggle(): void {
    if (typeof runsPanelTransitionTimeoutRef.current !== "undefined") {
      clearTimeout(runsPanelTransitionTimeoutRef.current);
      runsPanelTransitionTimeoutRef.current = undefined;
    }

    if (isRunsPanelCollapsed || isRunsPanelContentHidden) {
      setIsRunsPanelCollapsed(false);
      runsPanelTransitionTimeoutRef.current = setTimeout(() => {
        setIsRunsPanelContentHidden(false);
        runsPanelTransitionTimeoutRef.current = undefined;
      }, RUNS_PANEL_OPEN_LABEL_DELAY_MS);
      return;
    }

    setIsRunsPanelContentHidden(true);
    runsPanelTransitionTimeoutRef.current = setTimeout(() => {
      setIsRunsPanelCollapsed(true);
      runsPanelTransitionTimeoutRef.current = undefined;
    }, RUNS_PANEL_CLOSE_LABEL_DELAY_MS);
  }

  function handleRunsPanelResizePointerDown(
    event: ReactPointerEvent<HTMLDivElement>
  ): void {
    if (isRunsPanelCollapsed) {
      return;
    }

    runsPanelResizeDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleRunsPanelResizePointerMove(
    event: ReactPointerEvent<HTMLDivElement>
  ): void {
    if (!runsPanelResizeDragRef.current || isRunsPanelCollapsed) {
      return;
    }

    const nextWidthPx: number = clampRunsPanelWidth({
      widthPx: window.innerWidth - event.clientX,
    });
    setRunsPanelWidthPx(nextWidthPx);
  }

  function handleRunsPanelResizePointerEnd(
    event: ReactPointerEvent<HTMLDivElement>
  ): void {
    runsPanelResizeDragRef.current = false;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const runsPanelTrack: string = isRunsPanelCollapsed
    ? RUNS_PANEL_CLOSED_TRACK
    : `${runsPanelWidthPx}px`;
  const shellGridTemplateColumns: string = isSidebarCollapsed
    ? `${SIDEBAR_CLOSED_TRACK} minmax(18rem, 1fr) ${runsPanelTrack}`
    : `${SIDEBAR_OPEN_TRACK} minmax(18rem, 1fr) ${runsPanelTrack}`;

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8fb] text-[#1f2430]">
      <div
        className="synk-resize-grid grid h-screen min-h-0"
        style={{ gridTemplateColumns: shellGridTemplateColumns }}
      >
        <AppSidebar
          activeNavId={activeNavId}
          activeReportBookmarkId={
            advisorReportBookmarkSnapshot.state.activeReportBookmarkId
          }
          advisorReportBookmarks={advisorReportBookmarks}
          isContentHidden={isSidebarContentHidden}
          isCollapsed={isSidebarCollapsed}
          onClearCachedState={handleClearCachedState}
          onReportBookmarkSelect={handleAdvisorReportBookmarkClick}
          onNavSelect={setActiveNavId}
          onToggle={handleSidebarToggle}
        />
        <AgentWorkspace
          activeRunId={activeRunId}
          activeNavId={activeNavId}
          effort={effort}
          isLoading={isLoading}
          activeReportBookmark={activeAdvisorReportBookmark}
          cacheResetVersion={cacheResetVersion}
          onAdvisorReportBookmarkCreate={handleAdvisorReportBookmarkCreate}
          onEffortChange={setEffort}
          onPromptSubmit={handlePromptSubmit}
          onRunRecordClick={handleRunRecordClick}
          runs={runs}
          scanState={scanState}
        />
        <OutputWorkspace
          isContentHidden={isRunsPanelContentHidden}
          isCollapsed={isRunsPanelCollapsed}
          onResizePointerDown={handleRunsPanelResizePointerDown}
          onResizePointerMove={handleRunsPanelResizePointerMove}
          onResizePointerUp={handleRunsPanelResizePointerEnd}
          onToggle={handleRunsPanelToggle}
          scanState={scanState}
        />
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
  activeReportBookmarkId,
  advisorReportBookmarks,
  isContentHidden,
  isCollapsed,
  onClearCachedState,
  onNavSelect,
  onReportBookmarkSelect,
  onToggle,
}: {
  activeNavId: NavId;
  activeReportBookmarkId: string | null;
  advisorReportBookmarks: AdvisorReportBookmark[];
  isContentHidden: boolean;
  isCollapsed: boolean;
  onClearCachedState: () => void;
  onNavSelect: (navId: NavId) => void;
  onReportBookmarkSelect: ({
    bookmark,
  }: {
    bookmark: AdvisorReportBookmark;
  }) => void;
  onToggle: () => void;
}): ReactElement {
  const navItems: Array<{
    id: NavId;
    icon: ReactElement;
    label: string;
  }> = [
    { id: "agent", icon: <CpuChipIcon className="size-5" />, label: "Agent" },
    {
      id: "fixes",
      icon: <WrenchScrewdriverIcon className="size-5" />,
      label: "Fixes",
    },
    {
      id: "advisor",
      icon: <ChatBubbleLeftRightIcon className="size-5" />,
      label: "Advisor",
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
        {!isCollapsed ? (
          <SidebarReportBookmarks
            activeReportBookmarkId={activeReportBookmarkId}
            bookmarks={advisorReportBookmarks}
            isContentHidden={isContentHidden}
            onSelect={onReportBookmarkSelect}
          />
        ) : null}
      </nav>
      <SidebarClearCacheAction
        isContentHidden={isContentHidden}
        isCollapsed={isCollapsed}
        onClearCachedState={onClearCachedState}
      />
      <SidebarAccountCard
        isCollapsed={isCollapsed}
        isContentHidden={isContentHidden}
      />
    </aside>
  );
}

function SidebarReportBookmarks({
  activeReportBookmarkId,
  bookmarks,
  isContentHidden,
  onSelect,
}: {
  activeReportBookmarkId: string | null;
  bookmarks: AdvisorReportBookmark[];
  isContentHidden: boolean;
  onSelect: ({ bookmark }: { bookmark: AdvisorReportBookmark }) => void;
}): ReactElement {
  return (
    <section
      className={cn(
        "pt-8 flex flex-col gap-3 overflow-hidden transition-[max-height,opacity,transform] duration-500",
        isContentHidden
          ? "max-h-0 -translate-x-1 opacity-0"
          : "max-h-80 translate-x-0 opacity-100"
      )}
    >
      <p className="px-4 font-medium text-[#8a93a3] text-xs uppercase tracking-normal">
        Reports
      </p>
      {bookmarks.length === 0 ? (
        <div className="rounded-xl border border-[#e1e4ea] bg-white px-4 py-3 text-[#667085] text-sm leading-6">
          No saved reports.
        </div>
      ) : (
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
          {bookmarks.map((bookmark) => {
          const isActive: boolean = activeReportBookmarkId === bookmark.id;

          return (
            <button
              aria-pressed={isActive}
              className="group grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl bg-transparent px-4 py-3 text-left text-[#4a5160] transition-colors duration-200 hover:bg-[#eef0f4]"
              key={bookmark.id}
              onClick={() => {
                onSelect({ bookmark });
              }}
              type="button"
            >
              <DocumentTextIcon
                aria-hidden="true"
                className={cn(
                  "pt-0.5 size-4 transition-colors",
                  isActive ? "text-[#2457ff]" : "text-[#98a2b3]"
                )}
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span
                  className={cn(
                    "truncate font-medium text-sm transition-colors",
                    isActive ? "text-[#2457ff]" : "text-[#202431]"
                  )}
                >
                  {bookmark.title}
                </span>
                <span className="truncate text-[#667085] text-xs">
                  {bookmark.repoLabel}
                </span>
              </span>
            </button>
          );
          })}
        </div>
      )}
    </section>
  );
}

function SidebarClearCacheAction({
  isContentHidden,
  isCollapsed,
  onClearCachedState,
}: {
  isContentHidden: boolean;
  isCollapsed: boolean;
  onClearCachedState: () => void;
}): ReactElement {
  return (
    <div
      className={cn(
        "shrink-0 px-5 pb-5 transition-[padding] duration-500",
        isCollapsed && "px-4"
      )}
    >
      <GradientButton
        aria-label="Clear all local Synk history and reports"
        className={cn(
          "h-10 bg-[#2457ff] font-semibold text-sm text-white",
          isCollapsed ? "size-10 px-0" : "w-full px-3"
        )}
        onClick={onClearCachedState}
        title="Clear local history and reports"
        type="button"
        variant="blue"
      >
        <TrashIcon aria-hidden="true" className="size-4 shrink-0 text-white" />
        {!isContentHidden ? <span className="text-white">Clear cache</span> : null}
      </GradientButton>
    </div>
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
        isCollapsed ? "flex flex-col items-center gap-3 p-4" : "flex flex-col gap-3 p-5"
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
  activeNavId: NavId;
}): WorkspaceCopy {
  if (activeNavId === "fixes") {
    return {
      title: "Fixes",
      subtitle:
        "Turn scan findings into paste-ready remediation prompts.",
      items: [
        "Pick a saved scan run.",
        "Review the detected fix pattern and recommended steps.",
        "Paste the generated prompt into any coding IDE.",
      ],
    };
  }

  if (activeNavId === "advisor") {
    return {
      title: "Advisor",
      subtitle:
        "Chat with prior high-risk findings and generate dev-team reports.",
      items: [
        "Ask how to handle CVEs, exploit chatter, deprecations, and releases.",
        "Use real saved scan findings as the Advisor memory.",
        "Generate a README report and save it into Reports.",
      ],
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

function WorkflowPromptPanel({
  report,
}: {
  report: ScanReport | null;
}): ReactElement {
  if (report === null) {
    return (
      <section className="grid gap-4 rounded-xl border border-[#e1e4ea] bg-[#f8f9fb] p-4">
        <h2 className="font-semibold text-[#202431] text-xl">
          No scan selected
        </h2>
        <p className="text-[#667085] text-sm leading-6">
          Run a repository scan or open a saved run. Fixes will turn its
          findings into fix patterns and paste-ready coding prompts.
        </p>
      </section>
    );
  }

  const patterns: WorkflowFixPattern[] = buildWorkflowFixPatterns({ report });

  if (patterns.length === 0) {
    return (
      <section className="grid gap-4 rounded-xl border border-[#e1e4ea] bg-[#f8f9fb] p-4">
        <h2 className="font-semibold text-[#202431] text-xl">
          No fix patterns
        </h2>
        <p className="text-[#667085] text-sm leading-6">
          The selected scan has no findings to convert into a coding prompt.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-2 rounded-xl border border-[#e1e4ea] bg-[#f8f9fb] p-4">
        <h2 className="font-semibold text-[#202431] text-xl">Fix patterns</h2>
        <p className="text-[#667085] text-sm leading-6">
          {report.repo.owner}/{report.repo.repo} has {patterns.length} generated
          prompt{patterns.length === 1 ? "" : "s"} from the active scan.
        </p>
      </div>

      {patterns.map((pattern) => {
        return <WorkflowFixPatternCard key={pattern.id} pattern={pattern} />;
      })}
    </section>
  );
}

function WorkflowFixPatternCard({
  pattern,
}: {
  pattern: WorkflowFixPattern;
}): ReactElement {
  const [copyState, setCopyState] = useState<CopyPromptState>("idle");
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const copyLabel: string = copyLabelFromState({ state: copyState });
  const iconState: "copy" | "copied" =
    copyState === "copied" ? "copied" : "copy";

  async function handleCopyPrompt(): Promise<void> {
    if (copyState === "copying") {
      return;
    }

    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }

    setCopyState("copying");

    const result = await copyWorkflowPrompt({ prompt: pattern.prompt });

    if (result instanceof Error) {
      setCopyState("error");
    } else {
      setCopyState("copied");
    }

    copyResetTimeoutRef.current = setTimeout(() => {
      setCopyState("idle");
    }, 1400);
  }

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-[#e1e4ea] bg-white p-4 shadow-[0_12px_30px_rgb(16_24_40/0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={pattern.severity} />
            <span className="rounded-md border border-[#e1e4ea] bg-[#f8f9fb] px-2 py-1 font-medium text-[#667085] text-xs">
              Pattern
            </span>
          </div>
          <h3 className="font-semibold text-[#202431] text-lg">
            {pattern.title}
          </h3>
          <p className="text-[#4a5160] text-sm leading-6">{pattern.pattern}</p>
        </div>
        <GradientButton
          aria-label={`Copy fix prompt for ${pattern.title}`}
          className="t-copy-button h-11 shrink-0 px-4"
          data-copy-state={copyState}
          disabled={copyState === "copying"}
          onClick={() => {
            void handleCopyPrompt();
          }}
          type="button"
          variant="blue"
        >
          <span className="t-icon-swap size-4" data-state={iconState}>
            <ClipboardDocumentIcon
              aria-hidden="true"
              className="t-icon size-4 text-white"
              data-icon="copy"
            />
            <CheckIcon
              aria-hidden="true"
              className="t-icon size-4 text-white"
              data-icon="copied"
            />
          </span>
          <span
            className="t-copy-label font-semibold text-sm text-white"
            data-copy-state={copyState}
          >
            {copyLabel}
          </span>
        </GradientButton>
      </div>

      <div className="grid gap-2">
        <p className="font-medium text-[#202431] text-sm">How to fix</p>
        <div className="grid gap-2">
          {pattern.fixSteps.map((step) => {
            return (
              <div className="flex items-start gap-3 text-[#4a5160] text-sm" key={step}>
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#2457ff]" />
                <span className="leading-6">{step}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <p className="font-medium text-[#202431] text-sm">
          Prompt for coding IDE
        </p>
        <Textarea
          className="h-64 min-h-64 resize-y overflow-y-auto bg-[#f8f9fb] font-mono text-[#202431] text-xs leading-5 [field-sizing:fixed]"
          readOnly
          value={pattern.prompt}
        />
      </div>
    </article>
  );
}

function copyLabelFromState({ state }: { state: CopyPromptState }): string {
  if (state === "copying") {
    return "Copying";
  }

  if (state === "copied") {
    return "Copied";
  }

  if (state === "error") {
    return "Copy failed";
  }

  return "Copy prompt";
}

async function copyWorkflowPrompt({
  prompt,
}: {
  prompt: string;
}): Promise<
  ClientClipboardUnavailableError | ClientClipboardWriteError | true
> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return new ClientClipboardUnavailableError();
  }

  return navigator.clipboard
    .writeText(prompt)
    .then(() => {
      return true as const;
    })
    .catch((cause) => {
      return new ClientClipboardWriteError({ cause });
    });
}

function buildWorkflowFixPatterns({
  report,
}: {
  report: ScanReport;
}): WorkflowFixPattern[] {
  return flattenReportFindings({ groups: report.groups })
    .slice()
    .sort((first, second) => {
      return second.score - first.score;
    })
    .slice(0, 3)
    .map((finding) => {
      return buildWorkflowFixPattern({ finding, report });
    });
}

function flattenReportFindings({ groups }: { groups: ReportGroups }): Finding[] {
  return [
    ...groups.vulnerabilities,
    ...groups.exploitChatter,
    ...groups.deprecations,
    ...groups.breakingReleases,
  ];
}

function buildWorkflowFixPattern({
  finding,
  report,
}: {
  finding: Finding;
  report: ScanReport;
}): WorkflowFixPattern {
  const fixSteps: string[] = buildWorkflowFixSteps({ finding, report });

  return {
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
    pattern: buildWorkflowPatternText({ finding }),
    fixSteps,
    prompt: buildWorkflowIdePrompt({ finding, fixSteps, report }),
  };
}

function buildWorkflowPatternText({ finding }: { finding: Finding }): string {
  const installedVersion: string = finding.installedVersion
    ? ` installed at ${finding.installedVersion}`
    : " with an unknown installed version";

  return `${findingTypeLabel({ type: finding.type })} affecting ${finding.affectedDependency}${installedVersion}. Confidence: ${finding.confidence}. Match: ${finding.matchLabel.replaceAll("_", " ")}.`;
}

function buildWorkflowFixSteps({
  finding,
  report,
}: {
  finding: Finding;
  report: ScanReport;
}): string[] {
  const repoLabel: string = `${report.repo.owner}/${report.repo.repo}`;

  return [
    `Inspect ${repoLabel} for ${finding.affectedDependency} usage and ownership.`,
    `Apply the recommended action: ${finding.recommendedAction}`,
    "Keep the change minimal and match the repository's existing style.",
    "Run the smallest relevant install, typecheck, test, and build commands.",
  ];
}

function buildWorkflowIdePrompt({
  finding,
  fixSteps,
  report,
}: {
  finding: Finding;
  fixSteps: string[];
  report: ScanReport;
}): string {
  const markdown = dedent;
  const repoLabel: string = `${report.repo.owner}/${report.repo.repo}`;
  const installedVersion: string = finding.installedVersion ?? "unknown";
  const evidenceLines: string = finding.evidence
    .slice(0, 4)
    .map((evidence) => {
      return `- ${evidence.sourceName}: ${evidence.url}`;
    })
    .join("\n");
  const fixStepLines: string = fixSteps
    .map((step, index) => {
      return `${index + 1}. ${step}`;
    })
    .join("\n");

  return markdown`
    You are working in the ${repoLabel} repository.

    Fix this Synk finding without changing unrelated behavior.

    Pattern:
    ${buildWorkflowPatternText({ finding })}

    Finding:
    - Title: ${finding.title}
    - Type: ${findingTypeLabel({ type: finding.type })}
    - Severity: ${finding.severity}
    - Affected dependency or vendor: ${finding.affectedDependency}
    - Installed version: ${installedVersion}
    - Confidence: ${finding.confidence}
    - Match label: ${finding.matchLabel.replaceAll("_", " ")}

    Recommended fix:
    ${finding.recommendedAction}

    Implementation plan:
    ${fixStepLines}

    Evidence:
    ${evidenceLines || "- No evidence URL was attached to this finding."}

    Constraints:
    - Inspect the repository before editing.
    - Prefer existing patterns and package manager commands.
    - Keep the change small and directly tied to this finding.
    - Do not invent package versions; read manifests and lockfiles first.
    - After editing, run the closest typecheck, test, lint, or build command available.
    - Summarize changed files and verification results at the end.
  `.trim();
}

function findingTypeLabel({ type }: { type: Finding["type"] }): string {
  if (type === "cve") {
    return "CVE exposure";
  }

  if (type === "security_advisory") {
    return "Security advisory";
  }

  if (type === "exploit_chatter") {
    return "Exploit chatter";
  }

  if (type === "vendor_deprecation") {
    return "Vendor deprecation";
  }

  return "Breaking release";
}

function buildAdvisorRunContextsFromRuns({
  runs,
}: {
  runs: RunRecord[];
}): AdvisorRunContext[] {
  return runs
    .filter((run) => {
      return run.status === "completed" && run.report !== null;
    })
    .slice(0, 6)
    .map((run) => {
      const report: ScanReport = run.report as ScanReport;
      const findings: AdvisorFindingContext[] = flattenReportFindings({
        groups: report.groups,
      })
        .slice()
        .sort((first, second) => {
          return second.score - first.score;
        })
        .filter((finding) => {
          return (
            finding.severity === "critical" ||
            finding.severity === "high" ||
            finding.type === "vendor_deprecation" ||
            finding.type === "breaking_release"
          );
        })
        .slice(0, 10)
        .map((finding) => {
          return {
            affectedDependency: finding.affectedDependency,
            confidence: finding.confidence,
            evidence: finding.evidence.slice(0, 4).map((evidence) => {
              return {
                sourceName: evidence.sourceName,
                summary: evidence.summary,
                url: evidence.url,
              };
            }),
            id: finding.id,
            installedVersion: finding.installedVersion,
            matchLabel: finding.matchLabel,
            recommendedAction: finding.recommendedAction,
            severity: finding.severity,
            title: finding.title,
            type: finding.type,
          };
        });

      return {
        createdAt: run.createdAt,
        findings,
        repoLabel: run.repoLabel,
        runId: run.id,
        scanId: report.scanId,
        scannedAt: report.scannedAt,
        stack: {
          dependencies: report.stack.dependencies.slice(0, 30).map((dependency) => {
            const version: string = dependency.version ?? "unknown";
            return `${dependency.name}@${version}`;
          }),
          frameworks: report.stack.frameworks,
          packageManagers: report.stack.packageManagers,
          vendors: report.stack.vendors,
        },
        summary: {
          critical: report.summary.critical,
          high: report.summary.high,
          info: report.summary.info,
          low: report.summary.low,
          medium: report.summary.medium,
          totalFindings: report.summary.totalFindings,
        },
        topAction: report.summary.topAction,
      };
    });
}

function countAdvisorHighRiskFindings({
  runs,
}: {
  runs: AdvisorRunContext[];
}): number {
  return runs
    .map((run) => {
      return run.findings.filter((finding) => {
        return finding.severity === "critical" || finding.severity === "high";
      }).length;
    })
    .reduce((total, count) => {
      return total + count;
    }, 0);
}

function lastUserAdvisorQuestion({
  messages,
}: {
  messages: AdvisorChatMessage[];
}): string {
  const lastUserMessage: AdvisorChatMessage | undefined = messages
    .slice()
    .reverse()
    .find((message) => {
      return message.role === "user";
    });

  return lastUserMessage?.content.trim() || "";
}

function createAdvisorReportBookmark({
  markdown,
  repoLabel,
  sourceQuestion,
  title,
}: {
  markdown: string;
  repoLabel: string;
  sourceQuestion: string;
  title: string;
}): AdvisorReportBookmark {
  return {
    createdAt: new Date().toLocaleString(undefined, {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
    }),
    id: `advisor-report-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    markdown,
    repoLabel,
    sourceQuestion,
    title,
  };
}

function downloadMarkdownReport({
  bookmark,
}: {
  bookmark: AdvisorReportBookmark;
}): ClientDownloadError | true {
  if (typeof window === "undefined") {
    return new ClientDownloadError();
  }

  const blob = new Blob([bookmark.markdown], {
    type: "text/markdown;charset=utf-8",
  });
  const objectUrl: string = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName: string = bookmark.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  link.href = objectUrl;
  link.download = `${safeName || "synk-risk-report"}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);

  return true;
}

function AgentWorkspace({
  activeReportBookmark,
  activeRunId,
  activeNavId,
  cacheResetVersion,
  effort,
  isLoading,
  onAdvisorReportBookmarkCreate,
  onEffortChange,
  onPromptSubmit,
  onRunRecordClick,
  runs,
  scanState,
}: {
  activeReportBookmark: AdvisorReportBookmark | null;
  activeRunId: string | null;
  activeNavId: NavId;
  cacheResetVersion: number;
  effort: EffortLevel;
  isLoading: boolean;
  onAdvisorReportBookmarkCreate: ({
    bookmark,
  }: {
    bookmark: AdvisorReportBookmark;
  }) =>
    | AdvisorReportBookmarkState
    | ReportBookmarkCacheReadError
    | ReportBookmarkCacheWriteError;
  onEffortChange: (effort: EffortLevel) => void;
  onPromptSubmit: (value: string) => Promise<void>;
  onRunRecordClick: ({ run }: { run: RunRecord }) => void;
  runs: RunRecord[];
  scanState: ScanViewState;
}): ReactElement {
  const copy: WorkspaceCopy = workspaceCopyFromNav({ activeNavId });
  const isFixesView: boolean = activeNavId === "fixes";
  const isAdvisorView: boolean = activeNavId === "advisor";
  const activeReport: ScanReport | null =
    scanState.status === "success" ? scanState.report : null;
  const completedRuns: RunRecord[] = runs.filter((run) => {
    return run.status === "completed" && run.report !== null;
  });

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

        {isAdvisorView ? (
          <AdvisorPanel
            activeReportBookmark={activeReportBookmark}
            completedRuns={completedRuns}
            key={cacheResetVersion}
            onReportBookmarkCreate={onAdvisorReportBookmarkCreate}
          />
        ) : isFixesView ? (
          <WorkflowPromptPanel report={activeReport} />
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
                submitAriaLabel="Run agent scan"
                submitLabel="Run"
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

            <WorkspaceScopeList items={copy.items} />
          </>
        )}

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
      <h2 className="font-semibold text-2xl text-[#202431]">Saved Runs</h2>
      {runs.length === 0 ? (
        <div className="rounded-xl border border-[#e1e4ea] bg-[#f8f9fb] p-4 text-[#667085] text-sm">
          Repository scans are saved locally in this browser.
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

function AdvisorPanel({
  activeReportBookmark,
  completedRuns,
  onReportBookmarkCreate,
}: {
  activeReportBookmark: AdvisorReportBookmark | null;
  completedRuns: RunRecord[];
  onReportBookmarkCreate: ({
    bookmark,
  }: {
    bookmark: AdvisorReportBookmark;
  }) =>
    | AdvisorReportBookmarkState
    | ReportBookmarkCacheReadError
    | ReportBookmarkCacheWriteError;
}): ReactElement {
  const [messages, setMessages] = useState<AdvisorChatMessage[]>([]);
  const [advisorStatus, setAdvisorStatus] = useState<AdvisorStatus>("idle");
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  const [reportState, setReportState] = useState<AdvisorReportState>({
    status: "idle",
  });

  const advisorRunContexts: AdvisorRunContext[] =
    buildAdvisorRunContextsFromRuns({ runs: completedRuns });
  const hasMemory: boolean = advisorRunContexts.length > 0;

  async function handleAdvisorSubmit(value: string): Promise<void> {
    const question: string = value.trim();

    if (question.length === 0 || advisorStatus === "loading") {
      return;
    }

    if (!hasMemory) {
      setAdvisorStatus("error");
      setAdvisorError("Run at least one scan before asking Advisor.");
      return;
    }

    const nextMessages: AdvisorChatMessage[] = messages.concat({
      content: question,
      role: "user",
    });

    setMessages(nextMessages);
    setAdvisorError(null);
    setAdvisorStatus("loading");

    const response = await postAdvisorChat({
      messages: nextMessages,
      question,
      runs: advisorRunContexts,
    });

    if (response instanceof Error) {
      setAdvisorStatus("error");
      setAdvisorError(response.message);
      return;
    }

    if (!response.ok) {
      setAdvisorStatus("error");
      setAdvisorError(response.error.message);
      return;
    }

    setMessages(
      nextMessages.concat({
        content: response.answer,
        role: "assistant",
      })
    );
    setAdvisorStatus("idle");
  }

  async function handleReportGenerate(): Promise<void> {
    if (reportState.status === "loading") {
      return;
    }

    if (!hasMemory) {
      setReportState({
        message: "Run at least one scan before generating a report.",
        status: "error",
      });
      return;
    }

    const sourceQuestion: string =
      lastUserAdvisorQuestion({ messages }) ||
      "Create a full dev-team report from prior Synk scan findings.";

    setReportState({ status: "loading" });

    const response = await postAdvisorReport({
      messages,
      question: sourceQuestion,
      runs: advisorRunContexts,
    });

    if (response instanceof Error) {
      setReportState({
        message: response.message,
        status: "error",
      });
      return;
    }

    if (!response.ok) {
      setReportState({
        message: response.error.message,
        status: "error",
      });
      return;
    }

    const bookmark: AdvisorReportBookmark = createAdvisorReportBookmark({
      markdown: response.reportMarkdown,
      repoLabel: advisorRunContexts[0]?.repoLabel || "Synk",
      sourceQuestion,
      title: response.reportTitle,
    });
    const saved = onReportBookmarkCreate({ bookmark });

    if (saved instanceof Error) {
      setReportState({
        message: saved.message,
        status: "error",
      });
      return;
    }

    const downloadResult = downloadMarkdownReport({ bookmark });

    if (downloadResult instanceof Error) {
      setReportState({
        message: downloadResult.message,
        status: "error",
      });
      return;
    }

    setReportState({
      bookmark,
      status: "saved",
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-4 rounded-xl border border-[#e1e4ea] bg-[#f8f9fb] p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#d8dce3] bg-white text-[#2457ff]">
            <ChatBubbleLeftRightIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-semibold text-[#202431] text-xl">
              Risk advisor
            </h2>
            <p className="text-[#667085] text-sm leading-6">
              Uses completed scan memory from this browser. Ask what to patch,
              what to avoid, and what to hand to engineers.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdvisorMetric
            label="Scans in memory"
            value={String(advisorRunContexts.length)}
          />
          <AdvisorMetric
            label="High risk"
            value={String(countAdvisorHighRiskFindings({ runs: advisorRunContexts }))}
          />
        </div>
      </div>

      <AdvisorMessages
        advisorError={advisorError}
        messages={messages}
        status={advisorStatus}
      />

      {activeReportBookmark ? (
        <AdvisorBookmarkedReportPreview bookmark={activeReportBookmark} />
      ) : null}

      <AI_Prompt
        className="w-full"
        disabled={advisorStatus === "loading"}
        headerText="Ask Advisor"
        onSubmit={handleAdvisorSubmit}
        placeholder="Ask how to handle the highest risks, safer alternatives, or deprecations"
        submitAriaLabel="Send advisor message"
        submitLabel="Send"
      />

      <AdvisorReportActions
        reportState={reportState}
        onGenerate={handleReportGenerate}
      />
    </section>
  );
}

function AdvisorMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[#e1e4ea] bg-white p-3">
      <p className="font-medium text-[#667085] text-xs uppercase tracking-normal">
        {label}
      </p>
      <p className="font-semibold text-[#202431] text-lg">{value}</p>
    </div>
  );
}

function AdvisorMessages({
  advisorError,
  messages,
  status,
}: {
  advisorError: string | null;
  messages: AdvisorChatMessage[];
  status: AdvisorStatus;
}): ReactElement {
  if (messages.length === 0 && status !== "loading" && !advisorError) {
    return (
      <div className="grid gap-3 rounded-xl border border-[#e1e4ea] bg-white p-4">
        <p className="font-semibold text-[#202431]">Start with the risk memory.</p>
        <p className="text-[#667085] text-sm leading-6">
          Ask “what should we fix first?”, “what alternatives reduce this
          exposure?”, or “make a dev-team report for the latest run.”
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto rounded-xl border border-[#e1e4ea] bg-white p-4">
      {messages.map((message, index) => {
        return (
          <AdvisorMessageBubble
            key={`${message.role}:${index}:${message.content.slice(0, 24)}`}
            message={message}
          />
        );
      })}
      {status === "loading" ? <AdvisorThinking /> : null}
      {advisorError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm leading-6">
          {advisorError}
        </p>
      ) : null}
    </div>
  );
}

function AdvisorMessageBubble({
  message,
}: {
  message: AdvisorChatMessage;
}): ReactElement {
  const isUser: boolean = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6",
          isUser
            ? "bg-[#2457ff] text-white"
            : "border border-[#e1e4ea] bg-[#f8f9fb] text-[#202431]"
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

function AdvisorThinking(): ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#e1e4ea] bg-[#f8f9fb] p-3">
      <Skeleton className="size-8 rounded-full bg-[#e6e9ef]" />
      <div className="flex grow flex-col gap-2">
        <Skeleton className="h-3 w-2/3 bg-[#e6e9ef]" />
        <Skeleton className="h-3 w-1/2 bg-[#e6e9ef]" />
      </div>
    </div>
  );
}

function AdvisorReportActions({
  onGenerate,
  reportState,
}: {
  onGenerate: () => Promise<void>;
  reportState: AdvisorReportState;
}): ReactElement {
  const isLoading: boolean = reportState.status === "loading";

  return (
    <div className="grid gap-3 rounded-xl border border-[#e1e4ea] bg-[#f8f9fb] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-[#202431]">Dev-team report</p>
          <p className="text-[#667085] text-sm leading-6">
            Generates a downloadable README and saves it under Reports.
          </p>
        </div>
        <GradientButton
          className="h-11 px-4"
          disabled={isLoading}
          onClick={() => {
            void onGenerate();
          }}
          type="button"
          variant="blue"
        >
          <DocumentTextIcon aria-hidden="true" className="size-4 text-white" />
          <span className="font-semibold text-sm text-white">
            {isLoading ? "Writing" : "Create report"}
          </span>
        </GradientButton>
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-3/4 bg-[#e6e9ef]" />
          <Skeleton className="h-3 w-1/2 bg-[#e6e9ef]" />
        </div>
      ) : null}
      {reportState.status === "saved" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
          <div className="flex items-center gap-2">
            <BookmarkIcon aria-hidden="true" className="size-4" />
            <p className="font-medium text-sm">Saved and downloaded</p>
          </div>
          <p className="text-sm leading-6">{reportState.bookmark.title}</p>
        </div>
      ) : null}
      {reportState.status === "error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm leading-6">
          {reportState.message}
        </p>
      ) : null}
    </div>
  );
}

function AdvisorBookmarkedReportPreview({
  bookmark,
}: {
  bookmark: AdvisorReportBookmark;
}): ReactElement {
  return (
    <div className="grid gap-3 rounded-xl border border-[#e1e4ea] bg-[#f8f9fb] p-3">
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-[#202431] text-sm">{bookmark.title}</p>
        <p className="text-[#667085] text-xs">{bookmark.createdAt}</p>
      </div>
      <Textarea
        className="h-48 min-h-48 resize-y overflow-y-auto bg-white font-mono text-[#202431] text-xs leading-5 [field-sizing:fixed]"
        readOnly
        value={bookmark.markdown}
      />
      <Button
        className="w-fit"
        onClick={() => {
          void downloadMarkdownReport({ bookmark });
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <ArrowDownTrayIcon aria-hidden="true" className="size-4" />
        Download README
      </Button>
    </div>
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

function OutputWorkspace({
  isContentHidden,
  isCollapsed,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onToggle,
  scanState,
}: {
  isContentHidden: boolean;
  isCollapsed: boolean;
  onResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onToggle: () => void;
  scanState: ScanViewState;
}): ReactElement {
  return (
    <section className="t-resize dark relative flex min-h-0 flex-col overflow-hidden border-[#282828] border-l bg-[#151515] text-[#f5f5f5]">
      {!isCollapsed ? (
        <div
          aria-label="Resize output panel"
          aria-orientation="vertical"
          className="absolute top-0 left-0 z-20 h-full w-2 cursor-col-resize touch-none bg-transparent transition-colors duration-200 hover:bg-[#2457ff]/30"
          onPointerCancel={onResizePointerUp}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          role="separator"
        />
      ) : null}
      <button
        aria-label={isContentHidden ? "Open output panel" : "Close output panel"}
        className="absolute top-6 -left-4 z-30 inline-flex size-8 items-center justify-center rounded-full border border-[#2f333a] bg-[#202020] text-[#b7bbc4] shadow-[0_8px_20px_rgb(0_0_0/0.24)] transition-[background-color,color,box-shadow] duration-200 hover:bg-[#2a2d33] hover:text-white hover:shadow-[0_10px_24px_rgb(0_0_0/0.32)]"
        onClick={onToggle}
        title={isContentHidden ? "Open output panel" : "Close output panel"}
        type="button"
      >
        {isContentHidden ? (
          <ChevronDoubleLeftIcon className="size-4 transition-transform duration-300" />
        ) : (
          <ChevronDoubleRightIcon className="size-4 transition-transform duration-300" />
        )}
      </button>
      <header
        className={cn(
          "flex h-16 shrink-0 items-center border-[#282828] border-b transition-[justify-content,padding] duration-500",
          isCollapsed ? "justify-center px-0" : "px-6"
        )}
      >
        <div
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#202020] font-semibold text-[#f5f5f5] text-sm transition-[width,padding] duration-500",
            isCollapsed ? "w-10 px-0" : "px-4"
          )}
        >
          <CircleStackIcon className="size-4" />
          {!isContentHidden ? <span>Output</span> : null}
        </div>
      </header>
      <div
        className={cn(
          "min-h-0 grow overflow-y-auto transition-[opacity,padding,transform] duration-500",
          isContentHidden
            ? "pointer-events-none p-0 opacity-0 translate-x-2"
            : "p-6 opacity-100 translate-x-0"
        )}
      >
        <ScanResultPanel scanState={scanState} />
      </div>
    </section>
  );
}

function createRunRecord({
  error,
  memory,
  prompt,
  report,
  repoLabel,
  status,
}: {
  error: string | null;
  memory: ScanMemoryStatus | null;
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
    memory,
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
      memory: run.memory,
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

function clearCachedClientState(): LocalCacheClearError | true {
  if (typeof window === "undefined") {
    return true;
  }

  const clearResult = errore.try({
    try: () => {
      window.localStorage.removeItem(RUN_HISTORY_STORAGE_KEY);
      window.localStorage.removeItem(ADVISOR_REPORT_BOOKMARK_STORAGE_KEY);
    },
    catch: (cause) => {
      return new LocalCacheClearError({ cause });
    },
  });

  if (clearResult instanceof Error) {
    return clearResult;
  }

  cacheRunHistorySnapshot({
    raw: null,
    snapshot: EMPTY_RUN_HISTORY_SNAPSHOT,
  });
  cacheAdvisorReportBookmarkSnapshot({
    raw: null,
    snapshot: EMPTY_ADVISOR_REPORT_BOOKMARK_SNAPSHOT,
  });
  window.dispatchEvent(new Event(RUN_HISTORY_CHANGE_EVENT));
  window.dispatchEvent(new Event(ADVISOR_REPORT_BOOKMARK_CHANGE_EVENT));

  return true;
}

function subscribeAdvisorReportBookmarks(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ADVISOR_REPORT_BOOKMARK_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(
      ADVISOR_REPORT_BOOKMARK_CHANGE_EVENT,
      onStoreChange
    );
  };
}

function getServerAdvisorReportBookmarkSnapshot(): AdvisorReportBookmarkSnapshot {
  return EMPTY_ADVISOR_REPORT_BOOKMARK_SNAPSHOT;
}

function getClientAdvisorReportBookmarkSnapshot(): AdvisorReportBookmarkSnapshot {
  if (typeof window === "undefined") {
    return EMPTY_ADVISOR_REPORT_BOOKMARK_SNAPSHOT;
  }

  const cachedValue = errore.try({
    try: () => {
      return window.localStorage.getItem(ADVISOR_REPORT_BOOKMARK_STORAGE_KEY);
    },
    catch: (cause) => {
      return new ReportBookmarkCacheReadError({ cause });
    },
  });

  if (cachedValue instanceof Error) {
    return cacheAdvisorReportBookmarkSnapshot({
      raw: null,
      snapshot: {
        error: cachedValue.message,
        state: EMPTY_ADVISOR_REPORT_BOOKMARK_STATE,
      },
    });
  }

  if (cachedValue === cachedAdvisorReportBookmarksRaw) {
    return cachedAdvisorReportBookmarksSnapshot;
  }

  const state = readCachedAdvisorReportBookmarks();

  if (state instanceof Error) {
    return cacheAdvisorReportBookmarkSnapshot({
      raw: cachedValue,
      snapshot: {
        error: state.message,
        state: EMPTY_ADVISOR_REPORT_BOOKMARK_STATE,
      },
    });
  }

  return cacheAdvisorReportBookmarkSnapshot({
    raw: cachedValue,
    snapshot: {
      error: null,
      state,
    },
  });
}

function cacheAdvisorReportBookmarkSnapshot({
  raw,
  snapshot,
}: {
  raw: string | null;
  snapshot: AdvisorReportBookmarkSnapshot;
}): AdvisorReportBookmarkSnapshot {
  cachedAdvisorReportBookmarksRaw = raw;
  cachedAdvisorReportBookmarksSnapshot = snapshot;
  return cachedAdvisorReportBookmarksSnapshot;
}

function appendAdvisorReportBookmarkToCache({
  bookmark,
}: {
  bookmark: AdvisorReportBookmark;
}):
  | AdvisorReportBookmarkState
  | ReportBookmarkCacheReadError
  | ReportBookmarkCacheWriteError {
  const state = readCachedAdvisorReportBookmarks();

  if (state instanceof Error) {
    return state;
  }

  return writeCachedAdvisorReportBookmarks({
    state: {
      activeReportBookmarkId: bookmark.id,
      reports: [bookmark].concat(state.reports),
    },
  });
}

function selectCachedAdvisorReportBookmark({
  bookmark,
}: {
  bookmark: AdvisorReportBookmark;
}):
  | AdvisorReportBookmarkState
  | ReportBookmarkCacheReadError
  | ReportBookmarkCacheWriteError {
  const state = readCachedAdvisorReportBookmarks();

  if (state instanceof Error) {
    return state;
  }

  return writeCachedAdvisorReportBookmarks({
    state: {
      ...state,
      activeReportBookmarkId: bookmark.id,
    },
  });
}

function readCachedAdvisorReportBookmarks():
  | AdvisorReportBookmarkState
  | ReportBookmarkCacheReadError {
  if (typeof window === "undefined") {
    return EMPTY_ADVISOR_REPORT_BOOKMARK_STATE;
  }

  const cachedValue = errore.try({
    try: () => {
      return window.localStorage.getItem(ADVISOR_REPORT_BOOKMARK_STORAGE_KEY);
    },
    catch: (cause) => {
      return new ReportBookmarkCacheReadError({ cause });
    },
  });

  if (cachedValue instanceof Error) {
    return cachedValue;
  }

  if (!cachedValue) {
    return EMPTY_ADVISOR_REPORT_BOOKMARK_STATE;
  }

  const parsed = errore.try({
    try: () => {
      return JSON.parse(cachedValue) as unknown;
    },
    catch: (cause) => {
      return new ReportBookmarkCacheReadError({ cause });
    },
  });

  if (parsed instanceof ReportBookmarkCacheReadError) {
    return parsed;
  }

  if (!isAdvisorReportBookmarkState(parsed)) {
    return new ReportBookmarkCacheReadError();
  }

  return normalizeAdvisorReportBookmarkState({ state: parsed });
}

function writeCachedAdvisorReportBookmarks({
  state,
}: {
  state: AdvisorReportBookmarkState;
}):
  | AdvisorReportBookmarkState
  | ReportBookmarkCacheWriteError {
  const normalizedState: AdvisorReportBookmarkState =
    normalizeAdvisorReportBookmarkState({ state });

  if (typeof window === "undefined") {
    return normalizedState;
  }

  const serialized = errore.try({
    try: () => {
      return JSON.stringify(normalizedState);
    },
    catch: (cause) => {
      return new ReportBookmarkCacheWriteError({ cause });
    },
  });

  if (serialized instanceof Error) {
    return serialized;
  }

  const writeResult = errore.try({
    try: () => {
      window.localStorage.setItem(
        ADVISOR_REPORT_BOOKMARK_STORAGE_KEY,
        serialized
      );
    },
    catch: (cause) => {
      return new ReportBookmarkCacheWriteError({ cause });
    },
  });

  if (writeResult instanceof Error) {
    return writeResult;
  }

  cacheAdvisorReportBookmarkSnapshot({
    raw: serialized,
    snapshot: {
      error: null,
      state: normalizedState,
    },
  });
  window.dispatchEvent(new Event(ADVISOR_REPORT_BOOKMARK_CHANGE_EVENT));

  return normalizedState;
}

function normalizeAdvisorReportBookmarkState({
  state,
}: {
  state: AdvisorReportBookmarkState;
}): AdvisorReportBookmarkState {
  const normalizedReports: AdvisorReportBookmark[] = state.reports.slice(0, 24);
  const activeReportExists: boolean = normalizedReports.some((report) => {
    return report.id === state.activeReportBookmarkId;
  });

  if (activeReportExists) {
    return {
      activeReportBookmarkId: state.activeReportBookmarkId,
      reports: normalizedReports,
    };
  }

  return {
    activeReportBookmarkId: normalizedReports[0]?.id || null,
    reports: normalizedReports,
  };
}

function normalizeRunHistory({
  history,
}: {
  history: RunHistoryState;
}): RunHistoryState {
  const normalizedRuns: RunRecord[] = history.runs.map((run) => {
    return normalizeRunRecord({ run });
  });
  const activeRunExists: boolean = history.runs.some((run) => {
    return run.id === history.activeRunId;
  });

  if (activeRunExists) {
    return {
      activeRunId: history.activeRunId,
      runs: normalizedRuns,
    };
  }

  return {
    activeRunId: normalizedRuns[0]?.id || null,
    runs: normalizedRuns,
  };
}

function normalizeRunRecord({ run }: { run: RunRecord }): RunRecord {
  return {
    ...run,
    memory: run.memory ?? null,
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

async function postAdvisorChat({
  messages,
  question,
  runs,
}: {
  messages: AdvisorChatMessage[];
  question: string;
  runs: AdvisorRunContext[];
}): Promise<
  | AdvisorChatApiResponse
  | ClientAdvisorFetchError
  | ClientAdvisorResponseParseError
  | ClientAdvisorResponseShapeError
> {
  const parsed = await postAdvisorJson({
    endpoint: "/api/advisor/chat",
    messages,
    question,
    runs,
  });

  if (isAdvisorClientRequestError(parsed)) {
    return parsed;
  }

  if (!isAdvisorChatApiResponse(parsed.value)) {
    return new ClientAdvisorResponseShapeError();
  }

  return parsed.value;
}

async function postAdvisorReport({
  messages,
  question,
  runs,
}: {
  messages: AdvisorChatMessage[];
  question: string;
  runs: AdvisorRunContext[];
}): Promise<
  | AdvisorReportApiResponse
  | ClientAdvisorFetchError
  | ClientAdvisorResponseParseError
  | ClientAdvisorResponseShapeError
> {
  const parsed = await postAdvisorJson({
    endpoint: "/api/advisor/report",
    messages,
    question,
    runs,
  });

  if (isAdvisorClientRequestError(parsed)) {
    return parsed;
  }

  if (!isAdvisorReportApiResponse(parsed.value)) {
    return new ClientAdvisorResponseShapeError();
  }

  return parsed.value;
}

async function postAdvisorJson({
  endpoint,
  messages,
  question,
  runs,
}: {
  endpoint: string;
  messages: AdvisorChatMessage[];
  question: string;
  runs: AdvisorRunContext[];
}): Promise<
  | ClientAdvisorFetchError
  | ClientAdvisorResponseParseError
  | AdvisorParsedJson
> {
  const response = await errore.tryAsync({
    try: () => {
      return fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages,
          question,
          runs,
        }),
      });
    },
    catch: (cause) => {
      return new ClientAdvisorFetchError({ cause });
    },
  });

  if (response instanceof Error) {
    return response;
  }

  const bodyText = await errore.tryAsync({
    try: () => {
      return response.text();
    },
    catch: (cause) => {
      return new ClientAdvisorResponseParseError({ cause });
    },
  });

  if (bodyText instanceof Error) {
    return bodyText;
  }

  const parsed = errore.try({
    try: () => {
      return JSON.parse(bodyText) as unknown;
    },
    catch: (cause) => {
      return new ClientAdvisorResponseParseError({ cause });
    },
  });

  if (parsed instanceof ClientAdvisorResponseParseError) {
    return parsed;
  }

  return { value: parsed };
}

function isAdvisorClientRequestError(
  value: unknown
): value is ClientAdvisorFetchError | ClientAdvisorResponseParseError {
  return (
    value instanceof ClientAdvisorFetchError ||
    value instanceof ClientAdvisorResponseParseError
  );
}

function ScanResultPanel({ scanState }: { scanState: ScanViewState }): ReactElement {
  if (scanState.status === "loading") {
    return <LoadingPanel />;
  }

  if (scanState.status === "error") {
    return <ErrorPanel message={scanState.message} />;
  }

  if (scanState.status === "success") {
    return <ReportPanel memory={scanState.memory} report={scanState.report} />;
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

function ReportPanel({
  memory,
  report,
}: {
  memory: ScanMemoryStatus | null;
  report: ScanReport;
}): ReactElement {
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

      <RunAgentTracePanel trace={report.agentTrace ?? []} />

      <MemoryStatusPanel memory={memory} />

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

function RunAgentTracePanel({
  trace,
}: {
  trace: NonNullable<ScanReport["agentTrace"]>;
}): ReactElement {
  if (trace.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <p className="font-medium text-sm">Agent tools</p>
        <p className="text-muted-foreground text-sm leading-6">
          This saved run was created before per-run tool tracing was captured.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <WrenchScrewdriverIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <p className="font-medium text-sm">Agent tools called</p>
      </div>
      <div className="grid gap-3">
        {trace.map((step) => {
          return (
            <div
              className="grid gap-2 rounded-lg border border-border bg-background p-3"
              key={`${step.name}:${step.detail}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-sm">{step.name}</p>
                <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-emerald-300 text-xs">
                  {step.status}
                </span>
              </div>
              <p className="text-muted-foreground text-xs leading-5">{step.detail}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MemoryStatusPanel({
  memory,
}: {
  memory: ScanMemoryStatus | null;
}): ReactElement {
  const title: string = memoryTitle({ memory });
  const detail: string = memoryDetail({ memory });
  const toneClass: string = memoryToneClass({ memory });

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border",
            toneClass
          )}
        >
          <CircleStackIcon aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium text-sm">{title}</p>
          <p className="break-words text-muted-foreground text-sm leading-6">
            {detail}
          </p>
        </div>
      </div>
    </section>
  );
}

function memoryTitle({
  memory,
}: {
  memory: ScanMemoryStatus | null;
}): string {
  if (memory === null) {
    return "Memory not captured";
  }

  if (memory.status === "remembered") {
    return "Memory saved";
  }

  if (memory.status === "not_configured") {
    return "Memory not configured";
  }

  return "Memory failed";
}

function memoryDetail({
  memory,
}: {
  memory: ScanMemoryStatus | null;
}): string {
  if (memory === null) {
    return "This saved run was created before the UI started storing Cognee memory status. Run the scan again to verify memory in the interface.";
  }

  if (memory.status === "remembered") {
    const entryLabel: string = memory.entryId ?? "entry id not returned";
    return `Cognee remembered this scan in ${memory.datasetName}. Entry: ${entryLabel}.`;
  }

  if (memory.status === "not_configured") {
    const missingEnv: string = memory.missingEnv.join(", ") || "Cognee service configuration";
    return `Synk could not write memory because this config is missing: ${missingEnv}.`;
  }

  return memory.message;
}

function memoryToneClass({
  memory,
}: {
  memory: ScanMemoryStatus | null;
}): string {
  if (memory?.status === "remembered") {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  }

  if (memory?.status === "failed") {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }

  return "border-border bg-background text-muted-foreground";
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
            <div
              className="flex max-w-full flex-col gap-2 rounded-lg border border-border bg-card p-3"
              key={`${finding.id}:${evidence.url}`}
            >
              <a
                className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                href={evidence.url}
                rel="noreferrer"
                target="_blank"
              >
                {evidence.sourceName}
                <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-3" />
              </a>
              <p className="max-w-[32rem] text-muted-foreground text-xs leading-5">
                {evidence.summary}
              </p>
            </div>
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
      (value.memory === null ||
        typeof value.memory === "undefined" ||
        isScanMemoryStatus(value.memory)) &&
      (value.error === null || typeof value.error === "string")
    );
  }

function isAdvisorReportBookmarkState(
  value: unknown
): value is AdvisorReportBookmarkState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.activeReportBookmarkId === null ||
      typeof value.activeReportBookmarkId === "string") &&
    Array.isArray(value.reports) &&
    value.reports.every((bookmark) => {
      return isAdvisorReportBookmark(bookmark);
    })
  );
}

function isAdvisorReportBookmark(
  value: unknown
): value is AdvisorReportBookmark {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.markdown === "string" &&
    typeof value.repoLabel === "string" &&
    typeof value.sourceQuestion === "string" &&
    typeof value.title === "string"
  );
}

function isScanApiResponse(value: unknown): value is ScanApiResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (value.ok === true) {
    return isScanReport(value.report) && isScanMemoryStatus(value.memory);
  }

  if (value.ok === false) {
    return isRecord(value.error) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string";
  }

  return false;
}

function isAdvisorChatApiResponse(
  value: unknown
): value is AdvisorChatApiResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (value.ok === true) {
    return typeof value.answer === "string";
  }

  return isAdvisorFailureResponse(value);
}

function isAdvisorReportApiResponse(
  value: unknown
): value is AdvisorReportApiResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (value.ok === true) {
    return (
      typeof value.reportMarkdown === "string" &&
      typeof value.reportTitle === "string"
    );
  }

  return isAdvisorFailureResponse(value);
}

function isAdvisorFailureResponse(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.ok === false &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string"
  );
}

function isScanMemoryStatus(value: unknown): value is ScanMemoryStatus {
  if (!isRecord(value)) {
    return false;
  }

  if (value.provider !== "cognee") {
    return false;
  }

  if (value.status === "remembered") {
    return (
      typeof value.datasetName === "string" &&
      (value.entryId === null || typeof value.entryId === "string")
    );
  }

  if (value.status === "not_configured") {
    return isStringArray(value.missingEnv);
  }

  if (value.status === "failed") {
    return typeof value.message === "string";
  }

  return false;
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
    isReportGroups(value.groups) &&
    (typeof value.agentTrace === "undefined" ||
      isAgentTraceStepList(value.agentTrace))
  );
}

function isAgentTraceStepList(
  value: unknown
): value is NonNullable<ScanReport["agentTrace"]> {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((step) => {
    if (!isRecord(step)) {
      return false;
    }

    return (
      typeof step.name === "string" &&
      (step.status === "completed" || step.status === "failed") &&
      typeof step.detail === "string"
    );
  });
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
