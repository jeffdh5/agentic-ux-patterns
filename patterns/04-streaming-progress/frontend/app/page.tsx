"use client";

import { useState } from "react";
import { useAgentStream } from "@/hooks/useAgentStream";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  CheckCircle2,
  Search,
  Sparkles,
  BarChart3,
  PenLine,
  ChevronDown,
  ChevronRight,
  Circle,
  ArrowRight,
} from "lucide-react";
import type {
  EventChunk,
  SubflowChunk,
  ToolCallChunk,
  ToolResultChunk,
} from "@/hooks/useAgentStream";

const SUBFLOW_ICONS = {
  search_leads: Search,
  enrich_profiles: Sparkles,
  score_leads: BarChart3,
  draft_outreach: PenLine,
};

interface SubflowGroup {
  name: string;
  label: string;
  status: "pending" | "active" | "done";
  events: EventChunk[];
}

export default function Home() {
  const [input, setInput] = useState("");
  const { events, artifact, artifactTitle, activeSubflow, done, loading, submit } =
    useAgentStream();

  const handleSubmit = () => {
    if (input.trim()) {
      submit(input.trim());
    }
  };

  const isRunning = loading || (events.length > 0 && !done);

  // Input state - centered, minimal
  if (!isRunning && events.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-2xl">LeadFlow</CardTitle>
            <p className="text-sm text-muted-foreground">
              Find and qualify leads with AI-powered research
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Target Customer Description
              </label>
              <Textarea
                placeholder="e.g., B2B SaaS founders in Chicago who raised Series A in 2024"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) {
                    handleSubmit();
                  }
                }}
                className="min-h-[120px] resize-none"
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="w-full"
              size="lg"
            >
              <Search className="mr-2 h-4 w-4" />
              Find Leads
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group events by subflow
  const subflowGroups = groupEventsBySubflow(events, activeSubflow);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">LeadFlow</h1>
          <p className="text-sm text-muted-foreground">{input}</p>
        </div>

        {/* Single column layout */}
        <div className="space-y-6">
          {/* Progress Section */}
          <div className="space-y-2">
            {subflowGroups.map((group, idx) => (
              <SubflowRow key={idx} group={group} />
            ))}
            {loading && !done && events.length === 0 && (
              <div className="flex items-center gap-2 text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Starting...</span>
              </div>
            )}
          </div>

          {/* Separator between progress and artifact */}
          {artifact && <Separator className="my-6" />}

          {/* Artifact Section */}
          {artifact && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                {artifactTitle || "Outreach Drafts"}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {artifact}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SubflowRow({ group }: { group: SubflowGroup }) {
  const [expanded, setExpanded] = useState(group.status === "active");

  // Auto-expand active subflows
  if (group.status === "active" && !expanded) {
    setExpanded(true);
  }

  // Auto-collapse done subflows (unless manually expanded)
  const hasChildEvents = group.events.length > 0;
  const Icon = SUBFLOW_ICONS[group.name as keyof typeof SUBFLOW_ICONS] || Search;

  return (
    <div className="space-y-1">
      {/* Subflow header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 py-2 w-full hover:bg-muted/50 rounded px-2 -mx-2 transition-colors"
        disabled={!hasChildEvents}
      >
        {/* Status icon */}
        <div className="flex-shrink-0">
          {group.status === "pending" && (
            <Circle className="h-4 w-4 text-muted-foreground" />
          )}
          {group.status === "active" && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          )}
          {group.status === "done" && (
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          )}
        </div>

        {/* Label */}
        <div
          className={`flex-1 text-left text-sm ${
            group.status === "done"
              ? "text-green-400"
              : group.status === "active"
              ? "text-blue-400"
              : "text-muted-foreground"
          }`}
        >
          {group.label}
        </div>

        {/* Expand/collapse chevron */}
        {hasChildEvents && (
          <div className="flex-shrink-0">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        )}
      </button>

      {/* Child events (tool calls and results) */}
      {expanded && hasChildEvents && (
        <div className="pl-6 space-y-1">
          {group.events.map((event, idx) => (
            <ChildEvent key={idx} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChildEvent({ event }: { event: EventChunk }) {
  if (event.type === "tool_call") {
    const toolCall = event as ToolCallChunk;
    return (
      <div className="flex items-start gap-2 py-1">
        <ArrowRight className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{toolCall.tool}</span>
          {Object.keys(toolCall.input).length > 0 && (
            <span className="ml-1">
              : {Object.values(toolCall.input)[0]?.toString().slice(0, 40)}
              {Object.values(toolCall.input)[0]?.toString().length > 40 ? "..." : ""}
            </span>
          )}
        </p>
      </div>
    );
  }

  if (event.type === "tool_result") {
    const toolResult = event as ToolResultChunk;
    return (
      <div className="flex items-start gap-2 py-1">
        <CheckCircle2 className="h-3 w-3 text-green-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-green-400/80">{toolResult.preview}</p>
      </div>
    );
  }

  return null;
}

function groupEventsBySubflow(
  events: EventChunk[],
  activeSubflow: string | null
): SubflowGroup[] {
  const groups: SubflowGroup[] = [];
  let currentGroup: SubflowGroup | null = null;

  for (const event of events) {
    if (event.type === "subflow") {
      const subflow = event as SubflowChunk;

      if (subflow.status === "started") {
        // Start a new group
        currentGroup = {
          name: subflow.name,
          label: subflow.label,
          status: activeSubflow === subflow.name ? "active" : "done",
          events: [],
        };
        groups.push(currentGroup);
      } else if (subflow.status === "done" && currentGroup) {
        // Mark the current group as done
        currentGroup.status = "done";
        currentGroup = null;
      }
    } else if (currentGroup && (event.type === "tool_call" || event.type === "tool_result")) {
      // Add child events to the current group
      currentGroup.events.push(event);
    }
  }

  return groups;
}
