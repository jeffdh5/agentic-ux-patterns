"use client";

import { useState } from "react";

export function useGenkitStream() {
  const [streaming, setStreaming] = useState(false);
  const [response, setResponse] = useState("");

  const sendMessage = async (message: string, idToken: string | null) => {
    if (!idToken) {
      throw new Error("No authentication token");
    }

    setStreaming(true);
    setResponse("");

    try {
      const res = await fetch("http://localhost:3400/flow/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const reader = res.body?.getReader();
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
            const data = JSON.parse(line.slice(6));
            if (data.message) {
              setResponse((prev) => prev + data.message);
            }
          }
        }
      }
    } finally {
      setStreaming(false);
    }
  };

  return { streaming, response, sendMessage };
}
