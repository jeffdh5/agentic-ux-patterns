import { useState, useCallback } from 'react';

interface UseGenkitStreamOptions {
  api: string;
}

interface UseGenkitStreamResult {
  output: string;
  loading: boolean;
  error: string | null;
  submit: (data: Record<string, unknown>) => Promise<void>;
}

export function useGenkitStream({ api }: UseGenkitStreamOptions): UseGenkitStreamResult {
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (data: Record<string, unknown>) => {
    setOutput('');
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ data }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (typeof parsed === 'object' && 'result' in parsed) continue; // final result, skip
            if (typeof parsed === 'object' && 'message' in parsed) {
              setOutput(prev => prev + parsed.message);
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stream error');
    } finally {
      setLoading(false);
    }
  }, [api]);

  return { output, loading, error, submit };
}
