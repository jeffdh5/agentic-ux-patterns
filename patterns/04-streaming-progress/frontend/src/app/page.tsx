"use client";

import { useState } from "react";
import { useAgentStream } from "@/hooks/useAgentStream";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const STEPS = [
  "🔍 Searching for leads",
  "📊 Analyzing profiles",
  "✍️ Drafting outreach",
  "✅ Done",
];

export default function Home() {
  const [topic, setTopic] = useState("");
  const { status, step, totalSteps, output, loading, error, submit } = useAgentStream(
    "http://localhost:8000/flow/research"
  );

  const handleSubmit = () => {
    if (topic.trim()) {
      submit(topic);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold">LeadFlow Agent</h1>
          <p className="text-zinc-400">
            Multi-step research agent with live progress streaming
          </p>
        </div>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle>Find Leads</CardTitle>
            <CardDescription className="text-zinc-400">
              Enter a topic to research and find potential leads
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="e.g., B2B SaaS companies in healthcare"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
              className="bg-zinc-950 border-zinc-700 text-zinc-50 placeholder:text-zinc-500"
            />
            <Button
              onClick={handleSubmit}
              disabled={loading || !topic.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {loading ? "Running..." : "Find Leads"}
            </Button>
          </CardContent>
        </Card>

        {(loading || output) && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                {STEPS.map((stepLabel, idx) => {
                  const stepNumber = idx + 1;
                  const isCompleted = stepNumber < step;
                  const isCurrent = stepNumber === step;
                  const isPending = stepNumber > step;

                  return (
                    <div key={idx} className="flex items-center gap-3">
                      {isCompleted && (
                        <Badge className="bg-green-600 hover:bg-green-600 shrink-0">
                          ✓
                        </Badge>
                      )}
                      {isCurrent && (
                        <Badge className="bg-blue-600 hover:bg-blue-600 shrink-0 animate-pulse">
                          →
                        </Badge>
                      )}
                      {isPending && (
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 shrink-0">
                          ○
                        </Badge>
                      )}
                      <span
                        className={
                          isCompleted
                            ? "text-green-400"
                            : isCurrent
                            ? "text-blue-400 font-medium"
                            : "text-zinc-500"
                        }
                      >
                        {isCurrent && status ? status : stepLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              {output && (
                <>
                  <Separator className="bg-zinc-800" />
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-zinc-400">Output</h3>
                    <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
                      <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono">
                        {output}
                      </pre>
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="bg-red-950/50 border border-red-800 rounded-lg p-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
