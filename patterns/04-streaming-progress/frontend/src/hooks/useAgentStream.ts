/**
 * useAgentStream — consumes the SSE chunk taxonomy emitted by the Genkit
 * backend (see ../../../backend/src/main.py) and builds a UI-ready view model.
 *
 * The hook also exposes the error-UX layer described in the backend module:
 *
 *   - flowError  — the pipeline was terminated (e.g. search failed). The
 *                  UI should replace the Plan with an error card.
 *   - notices    — degraded-mode banners to render above the Plan.
 *   - Each SubflowNode and ToolCallView now carries an optional `error` with
 *     a structured payload (code, message, severity, recoverable, hint).
 *   - Artifacts track a trailing error for mid-stream cutoffs.
 */
import { useCallback, useState } from "react";

// Structured error payload ---------------------------------------------------

export type ErrorSeverity = "fatal" | "error" | "warning";

export interface StreamError {
  code: string;
  message: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  hint?: string;
}

export interface Notice {
  level: "warning" | "info";
  error: StreamError;
}

// Chunk wire types -----------------------------------------------------------

export type ChunkType =
  | "subflow"
  | "tool_call"
  | "tool_result"
  | "reasoning"
  | "artifact"
  | "notice"
  | "flow_error"
  | "done";

export interface SubflowChunk {
  type: "subflow";
  name: string;
  status: "started" | "done" | "error";
  label: string;
  parent?: string;
  error?: StreamError;
}

export interface ToolCallChunk {
  type: "tool_call";
  id: string;
  tool: string;
  input: Record<string, unknown>;
}

export interface ToolResultChunk {
  type: "tool_result";
  id: string;
  tool: string;
  preview?: string;
  output?: unknown;
  error?: StreamError;
}

export interface ReasoningChunk {
  type: "reasoning";
  content?: string;
  mode?: "append" | "replace";
  status?: "done";
  duration?: number;
}

export interface ArtifactChunk {
  type: "artifact";
  id: string;
  title: string;
  content?: string;
  mode?: "append" | "replace";
  error?: StreamError;
}

export interface NoticeChunk {
  type: "notice";
  level: "warning" | "info";
  error: StreamError;
}

export interface FlowErrorChunk {
  type: "flow_error";
  error: StreamError;
}

export interface DoneChunk {
  type: "done";
}

export type EventChunk =
  | SubflowChunk
  | ToolCallChunk
  | ToolResultChunk
  | ReasoningChunk
  | ArtifactChunk
  | NoticeChunk
  | FlowErrorChunk
  | DoneChunk;

// View model -----------------------------------------------------------------

/** Matches the AI Elements <Tool> state prop. */
export type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export interface ToolCallView {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: StreamError;
  state: ToolState;
}

export interface SubflowNode {
  name: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  error?: StreamError;
  toolCalls: ToolCallView[];
  children: SubflowNode[];
}

export interface AgentStreamState {
  roots: SubflowNode[];
  reasoning: string;
  reasoningDone: boolean;
  reasoningDuration: number;
  artifact: string;
  artifactTitle: string;
  artifactError?: StreamError;
  notices: Notice[];
  flowError?: StreamError;
  done: boolean;
  loading: boolean;
  /** Transport-level error, e.g. network/HTTP. Distinct from flowError which
   * comes from the backend. */
  transportError?: string;
}

const initialState: AgentStreamState = {
  roots: [],
  reasoning: "",
  reasoningDone: false,
  reasoningDuration: 0,
  artifact: "",
  artifactTitle: "",
  notices: [],
  done: false,
  loading: false,
};

// Tree helpers ---------------------------------------------------------------

function cloneState(s: AgentStreamState): AgentStreamState {
  return {
    ...s,
    roots: s.roots.map(cloneNode),
    notices: [...s.notices],
  };
}

function cloneNode(n: SubflowNode): SubflowNode {
  return {
    ...n,
    toolCalls: n.toolCalls.map((tc) => ({ ...tc })),
    children: n.children.map(cloneNode),
  };
}

function findNode(roots: SubflowNode[], name: string): SubflowNode | undefined {
  for (const r of roots) {
    if (r.name === name) return r;
    const found = findNode(r.children, name);
    if (found) return found;
  }
  return undefined;
}

/** Currently active leaf — the last active node on any path. Tool calls
 *  attach here. */
function findActiveLeaf(roots: SubflowNode[]): SubflowNode | undefined {
  let current: SubflowNode | undefined;
  const walk = (nodes: SubflowNode[]) => {
    for (const n of nodes) {
      if (n.status === "active") {
        current = n;
        walk(n.children);
      }
    }
  };
  walk(roots);
  return current;
}

function findToolCall(
  roots: SubflowNode[],
  id: string,
): ToolCallView | undefined {
  for (const r of roots) {
    const hit = r.toolCalls.find((t) => t.id === id);
    if (hit) return hit;
    const deeper = findToolCall(r.children, id);
    if (deeper) return deeper;
  }
  return undefined;
}

// Reducer --------------------------------------------------------------------

function applyChunk(
  prev: AgentStreamState,
  chunk: EventChunk,
): AgentStreamState {
  const next = cloneState(prev);

  switch (chunk.type) {
    case "subflow": {
      if (chunk.status === "started") {
        const node: SubflowNode = {
          name: chunk.name,
          label: chunk.label,
          status: "active",
          toolCalls: [],
          children: [],
        };
        if (chunk.parent) {
          const parent = findNode(next.roots, chunk.parent);
          if (parent) parent.children.push(node);
          else next.roots.push(node);
        } else {
          next.roots.push(node);
        }
      } else {
        const node = findNode(next.roots, chunk.name);
        if (node) {
          node.status = chunk.status === "error" ? "error" : "done";
          node.label = chunk.label;
          if (chunk.error) node.error = chunk.error;
        }
      }
      break;
    }

    case "tool_call": {
      const leaf = findActiveLeaf(next.roots);
      if (leaf) {
        leaf.toolCalls.push({
          id: chunk.id,
          tool: chunk.tool,
          input: chunk.input,
          state: "input-available",
        });
      }
      break;
    }

    case "tool_result": {
      const tc = findToolCall(next.roots, chunk.id);
      if (tc) {
        if (chunk.error) {
          tc.state = "output-error";
          tc.error = chunk.error;
        } else {
          tc.state = "output-available";
          tc.output = chunk.output ?? chunk.preview;
        }
      }
      break;
    }

    case "reasoning": {
      if (chunk.status === "done") {
        next.reasoningDone = true;
        next.reasoningDuration = chunk.duration ?? 0;
      } else if (chunk.content !== undefined) {
        if (chunk.mode === "replace") next.reasoning = chunk.content;
        else next.reasoning += chunk.content;
      }
      break;
    }

    case "artifact": {
      next.artifactTitle = chunk.title;
      if (chunk.error) {
        next.artifactError = chunk.error;
      } else if (chunk.content !== undefined) {
        if (chunk.mode === "replace") next.artifact = chunk.content;
        else next.artifact += chunk.content;
      }
      break;
    }

    case "notice": {
      next.notices.push({ level: chunk.level, error: chunk.error });
      break;
    }

    case "flow_error": {
      next.flowError = chunk.error;
      next.loading = false;
      next.done = true;
      break;
    }

    case "done": {
      next.done = true;
      next.loading = false;
      if (!next.reasoningDone && next.reasoning) next.reasoningDone = true;
      break;
    }
  }

  return next;
}

// Hook -----------------------------------------------------------------------

export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>(initialState);
  const [lastTarget, setLastTarget] = useState<string>("");

  const submit = useCallback(async (target: string) => {
    setLastTarget(target);
    setState({ ...initialState, loading: true });

    try {
      const response = await fetch("http://localhost:8000/flow/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("no response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload) as EventChunk;
            setState((prev) => applyChunk(prev, parsed));
          } catch (e) {
            console.error("Failed to parse chunk:", payload, e);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        loading: false,
        done: true,
        transportError: message,
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
    setLastTarget("");
  }, []);

  const retry = useCallback(() => {
    if (lastTarget) submit(lastTarget);
  }, [lastTarget, submit]);

  return { ...state, submit, reset, retry, lastTarget };
}
