import { useState } from "react";

interface AgentStreamState {
  status: string;
  step: number;
  totalSteps: number;
  output: string;
  loading: boolean;
  error: string | null;
}

export function useAgentStream(apiEndpoint: string) {
  const [state, setState] = useState<AgentStreamState>({
    status: "",
    step: 0,
    totalSteps: 0,
    output: "",
    loading: false,
    error: null,
  });

  const submit = async (topic: string) => {
    setState({
      status: "",
      step: 0,
      totalSteps: 0,
      output: "",
      loading: true,
      error: null,
    });

    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));

            if (data.type === "status") {
              setState((prev) => ({
                ...prev,
                status: data.status,
                step: data.step,
                totalSteps: data.total,
              }));
            } else if (data.type === "message") {
              setState((prev) => ({
                ...prev,
                output: prev.output + data.message,
              }));
            } else if (data.type === "done") {
              setState((prev) => ({ ...prev, loading: false }));
            }
          }
        }
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  };

  return {
    status: state.status,
    step: state.step,
    totalSteps: state.totalSteps,
    output: state.output,
    loading: state.loading,
    error: state.error,
    submit,
  };
}
