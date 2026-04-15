"use client";

import { useState } from "react";
import { useAgentStream } from "@/hooks/useAgentStream";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  CheckCircle2,
  Search,
  Sparkles,
  BarChart3,
  PenLine,
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

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">LeadFlow</h1>
          <p className="text-sm text-muted-foreground">
            {input}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Left Panel: Event Timeline */}
          <div className="col-span-1">
            <Card className="h-[calc(100vh-180px)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Agent Activity</CardTitle>
              </CardHeader>
              <Separator />
              <ScrollArea className="h-[calc(100vh-260px)]">
                <CardContent className="pt-4 space-y-3">
                  {events.map((event, idx) => (
                    <EventItem
                      key={idx}
                      event={event}
                      isActive={
                        event.type === "subflow" &&
                        event.status === "started" &&
                        activeSubflow === event.name
                      }
                    />
                  ))}
                  {loading && !done && events.length === 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Starting...</span>
                    </div>
                  )}
                </CardContent>
              </ScrollArea>
            </Card>
          </div>

          {/* Right Panel: Artifact */}
          <div className="col-span-2">
            <Card className="h-[calc(100vh-180px)]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {artifactTitle || "Outreach Drafts"}
                  </CardTitle>
                  {done && (
                    <Badge variant="outline" className="text-green-400 border-green-400">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Complete
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <Separator />
              <ScrollArea className="h-[calc(100vh-260px)]">
                <CardContent className="pt-4">
                  {artifact ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {artifact}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <div className="text-center">
                        <PenLine className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">
                          Artifact will appear here as it's generated...
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </ScrollArea>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventItem({ event, isActive }: { event: EventChunk; isActive: boolean }) {
  if (event.type === "subflow") {
    const subflow = event as SubflowChunk;
    const Icon = SUBFLOW_ICONS[subflow.name as keyof typeof SUBFLOW_ICONS] || Search;
    const isStarted = subflow.status === "started";
    const isDone = subflow.status === "done";

    return (
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {isStarted && isActive ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          ) : isDone ? (
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          ) : (
            <Icon className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium ${
              isDone ? "text-green-400" : isActive ? "text-blue-400" : ""
            }`}
          >
            {subflow.label}
          </p>
        </div>
      </div>
    );
  }

  if (event.type === "tool_call") {
    const toolCall = event as ToolCallChunk;
    return (
      <div className="flex items-start gap-3 pl-7">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{toolCall.tool}</span>
            {Object.keys(toolCall.input).length > 0 && (
              <span className="ml-1">
                ({Object.values(toolCall.input)[0]?.toString().slice(0, 30)}
                {Object.values(toolCall.input)[0]?.toString().length > 30 ? "..." : ""}
                )
              </span>
            )}
          </p>
        </div>
      </div>
    );
  }

  if (event.type === "tool_result") {
    const toolResult = event as ToolResultChunk;
    return (
      <div className="flex items-start gap-3 pl-7">
        <CheckCircle2 className="h-3 w-3 text-green-400 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{toolResult.preview}</p>
        </div>
      </div>
    );
  }

  return null;
}
