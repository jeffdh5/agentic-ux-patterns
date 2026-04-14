'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGenkitStream } from '@/hooks/useGenkitStream';

export default function Home() {
  const [question, setQuestion] = useState('');
  const { output, loading, error, submit } = useGenkitStream({
    api: 'http://localhost:8080/flow/chat',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim()) submit({ question });
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Genkit Chat</h1>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <Textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask anything..."
          rows={2}
          className="resize-none"
        />
        <Button type="submit" disabled={loading} className="self-end">
          {loading ? 'Thinking…' : 'Ask'}
        </Button>
      </form>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {output && (
        <Card>
          <CardContent className="pt-4">
            <ScrollArea className="h-96">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{output}</p>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
