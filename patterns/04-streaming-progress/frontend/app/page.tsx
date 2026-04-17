"use client";

/**
 * Streaming Progress — Genkit + AI Elements showcase.
 *
 * This page maps the SSE chunk taxonomy to AI Elements components:
 *
 *   subflow chunks       -> recursive <Task>
 *   tool_call/result     -> <Tool> + <ToolHeader> + <ToolInput>/<ToolOutput>
 *   reasoning chunks     -> <Reasoning>
 *   artifact chunks      -> <Artifact> + <MessageResponse> (Streamdown)
 *   top-level overview   -> <Queue> with Active / Completed / Failed sections
 *   notice chunks        -> dismissible warning banners above the Plan
 *   flow_error chunk     -> dedicated failure card that replaces the Plan
 *   artifact.error       -> inline red strip at the bottom of the Artifact
 */
import { useState } from "react";
import type { ToolUIPart } from "ai";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleIcon,
  CopyIcon,
  DownloadIcon,
  Loader2Icon,
  RotateCcwIcon,
  SparklesIcon,
  XCircleIcon,
} from "lucide-react";

import {
  useAgentStream,
  type Notice,
  type StreamError,
  type SubflowNode,
  type ToolCallView,
} from "@/hooks/useAgentStream";
import {
  Artifact,
  ArtifactActions,
  ArtifactAction,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Suggestion,
  Suggestions,
} from "@/components/ai-elements/suggestion";
import {
  Task,
  TaskContent,
  TaskTrigger,
} from "@/components/ai-elements/task";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";

const EXAMPLE_TARGETS = [
  "open-source vector database companies",
  "DevTools companies with 10-50 employees, YC or a16z backed",
  "climate tech Series A founders in Europe",
];

const FAILURE_DEMOS = [
  { label: "demo: search fails (fatal)", prompt: "fail:search: open-source vector DBs" },
  { label: "demo: one enrich fails", prompt: "fail:enrich_one: open-source vector DBs" },
  { label: "demo: scoring fails (degraded)", prompt: "fail:score: open-source vector DBs" },
  { label: "demo: draft cut off mid-stream", prompt: "fail:draft_mid: open-source vector DBs" },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const stream = useAgentStream();

  const hasStarted = stream.loading || stream.roots.length > 0 || !!stream.flowError;

  const handleSubmit = (message: PromptInputMessage) => {
    const target = message.text?.trim();
    if (!target) return;
    setSubmittedQuery(target);
    setQuery("");
    stream.submit(target);
  };

  const handleSuggestion = (suggestion: string) => {
    setSubmittedQuery(suggestion);
    setQuery("");
    stream.submit(suggestion);
  };

  const handleReset = () => {
    stream.reset();
    setSubmittedQuery("");
  };

  // Empty state: centered prompt + suggestions
  if (!hasStarted) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-6">
          <div className="space-y-2 text-center">
            <div className="inline-flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-widest">
              <SparklesIcon className="size-3" />
              Genkit + AI Elements
            </div>
            <h1 className="font-semibold text-3xl">LeadFlow</h1>
            <p className="text-muted-foreground text-sm">
              Describe a target customer. Watch a streaming Genkit flow
              research, enrich, score, and draft — rendered with AI Elements.
            </p>
          </div>

          <PromptInput
            className="rounded-2xl border shadow-sm"
            onSubmit={handleSubmit}
          >
            <PromptInputBody>
              <PromptInputTextarea
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., open-source vector database companies"
                value={query}
              />
              <PromptInputFooter className="justify-end p-2">
                <PromptInputSubmit
                  disabled={!query.trim()}
                  status={stream.loading ? "streaming" : undefined}
                />
              </PromptInputFooter>
            </PromptInputBody>
          </PromptInput>

          <Suggestions>
            {EXAMPLE_TARGETS.map((s) => (
              <Suggestion key={s} onClick={handleSuggestion} suggestion={s} />
            ))}
          </Suggestions>

          <div className="space-y-2 pt-4 text-center">
            <div className="text-muted-foreground text-xs uppercase tracking-widest">
              Error UX demos
            </div>
            <Suggestions>
              {FAILURE_DEMOS.map((d) => (
                <Suggestion
                  key={d.label}
                  onClick={() => handleSuggestion(d.prompt)}
                  suggestion={d.label}
                />
              ))}
            </Suggestions>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs uppercase tracking-widest">
            LeadFlow
          </div>
          <p className="truncate text-sm">{submittedQuery}</p>
        </div>
        <div className="flex items-center gap-2">
          {stream.done && (stream.flowError || stream.transportError) && (
            <Button
              onClick={stream.retry}
              size="sm"
              variant="outline"
            >
              <RotateCcwIcon className="mr-1.5 size-3.5" />
              Retry
            </Button>
          )}
          <Button onClick={handleReset} size="sm" variant="outline">
            New search
          </Button>
        </div>
      </header>

      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          <Message className="max-w-full" from="assistant">
            <MessageContent className="w-full max-w-full">
              <StepOverview roots={stream.roots} />

              {stream.reasoning && (
                <Reasoning
                  defaultOpen
                  duration={stream.reasoningDuration || undefined}
                  isStreaming={!stream.reasoningDone}
                >
                  <ReasoningTrigger />
                  <ReasoningContent>{stream.reasoning}</ReasoningContent>
                </Reasoning>
              )}

              {stream.notices.map((n, i) => (
                <NoticeBanner key={i} notice={n} />
              ))}

              {stream.flowError ? (
                <FlowErrorCard
                  error={stream.flowError}
                  onRetry={stream.retry}
                />
              ) : (
                <Plan defaultOpen isStreaming={!stream.done}>
                  <PlanHeader>
                    <div className="space-y-1">
                      <PlanTitle>Research plan</PlanTitle>
                      <PlanDescription>
                        {stream.done
                          ? stream.notices.length > 0
                            ? "Flow complete (degraded)"
                            : "Flow complete"
                          : "Streaming subflows, tool calls, and results"}
                      </PlanDescription>
                    </div>
                    <PlanAction>
                      <PlanTrigger />
                    </PlanAction>
                  </PlanHeader>
                  <PlanContent className="space-y-2">
                    {stream.roots.map((node) => (
                      <SubflowTask key={node.name} node={node} />
                    ))}
                    {stream.loading && stream.roots.length === 0 && (
                      <div className="flex items-center gap-2 py-2 text-muted-foreground text-sm">
                        <Loader2Icon className="size-4 animate-spin" />
                        Starting...
                      </div>
                    )}
                  </PlanContent>
                </Plan>
              )}

              {stream.artifact && (
                <Artifact>
                  <ArtifactHeader>
                    <div className="space-y-0.5">
                      <ArtifactTitle>
                        {stream.artifactTitle || "Outreach drafts"}
                      </ArtifactTitle>
                      <ArtifactDescription>
                        Streamed from{" "}
                        <code className="font-mono text-xs">
                          ai.generate_stream
                        </code>
                      </ArtifactDescription>
                    </div>
                    <ArtifactActions>
                      <ArtifactAction
                        icon={CopyIcon}
                        onClick={() =>
                          navigator.clipboard.writeText(stream.artifact)
                        }
                        tooltip="Copy markdown"
                      />
                      <ArtifactAction
                        icon={DownloadIcon}
                        onClick={() => downloadMarkdown(stream.artifact)}
                        tooltip="Download"
                      />
                    </ArtifactActions>
                  </ArtifactHeader>
                  <ArtifactContent>
                    <MessageResponse>{stream.artifact}</MessageResponse>
                    {stream.artifactError && (
                      <PartialArtifactStrip
                        error={stream.artifactError}
                        onRetry={stream.retry}
                      />
                    )}
                  </ArtifactContent>
                </Artifact>
              )}

              {stream.transportError && !stream.flowError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
                  <XCircleIcon className="mt-0.5 size-4 flex-none" />
                  <div>
                    <div className="font-medium">Connection error</div>
                    <div className="text-destructive/80">
                      {stream.transportError}
                    </div>
                  </div>
                </div>
              )}
            </MessageContent>
          </Message>
        </ConversationContent>
      </Conversation>
    </div>
  );
}

// Notice + error components --------------------------------------------------

function NoticeBanner({ notice }: { notice: Notice }) {
  const isWarn = notice.level === "warning";
  return (
    <div
      className={
        isWarn
          ? "flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          : "flex items-start gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-sm"
      }
    >
      <AlertTriangleIcon
        className={
          isWarn
            ? "mt-0.5 size-4 flex-none text-amber-500"
            : "mt-0.5 size-4 flex-none text-blue-500"
        }
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{notice.error.message}</div>
        {notice.error.hint && (
          <div className="text-muted-foreground">{notice.error.hint}</div>
        )}
      </div>
    </div>
  );
}

function FlowErrorCard({
  error,
  onRetry,
}: {
  error: StreamError;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-5">
      <div className="flex items-start gap-3">
        <XCircleIcon className="mt-0.5 size-5 flex-none text-destructive" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-medium text-destructive">
            The research flow couldn&rsquo;t continue
          </div>
          <div className="text-sm">{error.message}</div>
          {error.hint && (
            <div className="text-muted-foreground text-sm">{error.hint}</div>
          )}
          <div className="pt-1 font-mono text-muted-foreground text-xs">
            code: {error.code}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={onRetry} size="sm" variant="outline">
          <RotateCcwIcon className="mr-1.5 size-3.5" />
          Retry
        </Button>
      </div>
    </div>
  );
}

function PartialArtifactStrip({
  error,
  onRetry,
}: {
  error: StreamError;
  onRetry: () => void;
}) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <AlertTriangleIcon className="mt-0.5 size-4 flex-none text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-destructive">
          Partial response — stream was cut off
        </div>
        <div className="text-muted-foreground">{error.message}</div>
        {error.hint && (
          <div className="text-muted-foreground">{error.hint}</div>
        )}
      </div>
      <Button onClick={onRetry} size="sm" variant="ghost">
        <RotateCcwIcon className="mr-1.5 size-3.5" />
        Retry
      </Button>
    </div>
  );
}

// Step overview --------------------------------------------------------------

function StepOverview({ roots }: { roots: SubflowNode[] }) {
  const active = roots.filter((r) => r.status === "active");
  const completed = roots.filter((r) => r.status === "done");
  const failed = roots.filter((r) => r.status === "error");

  if (roots.length === 0) return null;

  return (
    <Queue>
      <QueueSection defaultOpen>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={active.length}
            icon={<Loader2Icon className="size-4 text-primary" />}
            label="In progress"
          />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {active.map((node) => (
              <QueueItem key={node.name}>
                <div className="flex items-center gap-2">
                  <QueueItemIndicator />
                  <QueueItemContent>{node.label}</QueueItemContent>
                </div>
              </QueueItem>
            ))}
            {active.length === 0 && (
              <QueueItem>
                <QueueItemContent>Nothing in progress</QueueItemContent>
              </QueueItem>
            )}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>

      {failed.length > 0 && (
        <QueueSection defaultOpen>
          <QueueSectionTrigger>
            <QueueSectionLabel
              count={failed.length}
              icon={<XCircleIcon className="size-4 text-destructive" />}
              label="Failed"
            />
          </QueueSectionTrigger>
          <QueueSectionContent>
            <QueueList>
              {failed.map((node) => (
                <QueueItem key={node.name}>
                  <div className="flex items-start gap-2">
                    <XCircleIcon className="mt-0.5 size-3.5 flex-none text-destructive" />
                    <QueueItemContent>
                      <div className="text-destructive">{node.label}</div>
                      {node.error?.message && (
                        <div className="text-muted-foreground text-xs">
                          {node.error.message}
                        </div>
                      )}
                    </QueueItemContent>
                  </div>
                </QueueItem>
              ))}
            </QueueList>
          </QueueSectionContent>
        </QueueSection>
      )}

      <QueueSection defaultOpen={false}>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={completed.length}
            icon={<CheckCircle2Icon className="size-4" />}
            label="Completed"
          />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {completed.map((node) => (
              <QueueItem key={node.name}>
                <div className="flex items-center gap-2">
                  <QueueItemIndicator completed />
                  <QueueItemContent completed>{node.label}</QueueItemContent>
                </div>
              </QueueItem>
            ))}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}

// Recursive subflow -> Task ---------------------------------------------------

function SubflowTask({ node }: { node: SubflowNode }) {
  // Keep active + errored subflows open so the user can see what's happening
  // without having to click through.
  const defaultOpen = node.status !== "done";
  const hasChildren = node.children.length > 0 || node.toolCalls.length > 0;

  return (
    <Task defaultOpen={defaultOpen}>
      <TaskTrigger title={node.label}>
        <div className="group flex w-full cursor-pointer items-center gap-2 text-sm transition-colors">
          <StatusIcon status={node.status} />
          <span
            className={
              node.status === "error"
                ? "text-destructive"
                : node.status === "active"
                  ? "text-foreground"
                  : node.status === "done"
                    ? "text-muted-foreground"
                    : "text-muted-foreground/70"
            }
          >
            {node.label}
          </span>
        </div>
      </TaskTrigger>
      {hasChildren && (
        <TaskContent>
          {node.error && !node.toolCalls.length && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive text-xs">
              {node.error.message}
              {node.error.hint && (
                <div className="text-muted-foreground">{node.error.hint}</div>
              )}
            </div>
          )}
          {node.toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} call={tc} />
          ))}
          {node.children.map((child) => (
            <SubflowTask key={child.name} node={child} />
          ))}
        </TaskContent>
      )}
    </Task>
  );
}

function StatusIcon({ status }: { status: SubflowNode["status"] }) {
  if (status === "pending")
    return <CircleIcon className="size-4 text-muted-foreground" />;
  if (status === "active")
    return <Loader2Icon className="size-4 animate-spin text-primary" />;
  if (status === "error")
    return <XCircleIcon className="size-4 text-destructive" />;
  return <CheckCircle2Icon className="size-4 text-emerald-500" />;
}

// Tool call -> Tool -----------------------------------------------------------

function ToolCallCard({ call }: { call: ToolCallView }) {
  const type = `tool-${call.tool}` as ToolUIPart["type"];
  const errorText = call.error
    ? call.error.hint
      ? `${call.error.message}\n\n${call.error.hint}`
      : call.error.message
    : undefined;

  return (
    <Tool defaultOpen={call.state !== "output-available"}>
      <ToolHeader state={call.state} type={type} />
      <ToolContent>
        <ToolInput input={call.input} />
        <ToolOutput
          errorText={errorText}
          output={call.output as ToolUIPart["output"]}
        />
      </ToolContent>
    </Tool>
  );
}

// Helpers ---------------------------------------------------------------------

function downloadMarkdown(content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "outreach-drafts.md";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
