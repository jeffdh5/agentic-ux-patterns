import { useState, useCallback } from "react";

export type ChunkType =
  | "subflow"
  | "tool_call"
  | "tool_result"
  | "artifact"
  | "done";

export interface BaseChunk {
  type: ChunkType;
}

export interface SubflowChunk extends BaseChunk {
  type: "subflow";
  name: string;
  status: "started" | "done";
  label: string;
}

export interface ToolCallChunk extends BaseChunk {
  type: "tool_call";
  tool: string;
  input: Record<string, any>;
}

export interface ToolResultChunk extends BaseChunk {
  type: "tool_result";
  tool: string;
  preview: string;
}

export interface ArtifactChunk extends BaseChunk {
  type: "artifact";
  id: string;
  title: string;
  content: string;
  mode: "append" | "replace";
}

export interface DoneChunk extends BaseChunk {
  type: "done";
}

export type EventChunk =
  | SubflowChunk
  | ToolCallChunk
  | ToolResultChunk
  | ArtifactChunk
  | DoneChunk;

export interface AgentStreamState {
  events: EventChunk[];
  artifact: string;
  artifactTitle: string;
  activeSubflow: string | null;
  done: boolean;
  loading: boolean;
}

export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>({
    events: [],
    artifact: "",
    artifactTitle: "",
    activeSubflow: null,
    done: false,
    loading: false,
  });

  const submit = useCallback(async (target: string) => {
    setState({
      events: [],
      artifact: "",
      artifactTitle: "",
      activeSubflow: null,
      done: false,
      loading: true,
    });

    try {
      const response = await fetch("http://localhost:8000/flow/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data.trim()) {
              try {
                const chunk = JSON.parse(data) as EventChunk;

                setState((prev) => {
                  const newState = { ...prev };
                  newState.events = [...prev.events, chunk];

                  // Update active subflow
                  if (chunk.type === "subflow") {
                    if (chunk.status === "started") {
                      newState.activeSubflow = chunk.name;
                    } else if (chunk.status === "done") {
                      newState.activeSubflow = null;
                    }
                  }

                  // Handle artifact chunks
                  if (chunk.type === "artifact") {
                    newState.artifactTitle = chunk.title;
                    if (chunk.mode === "append") {
                      newState.artifact += chunk.content;
                    } else {
                      newState.artifact = chunk.content;
                    }
                  }

                  // Handle done
                  if (chunk.type === "done") {
                    newState.done = true;
                    newState.loading = false;
                  }

                  return newState;
                });
              } catch (e) {
                console.error("Failed to parse chunk:", data, e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Stream error:", error);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  return { ...state, submit };
}
