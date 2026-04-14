"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useGenkitStream } from "@/hooks/useGenkitStream";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  const { user, loading, emailSent, sendMagicLink, handleMagicLinkCallback, signOut, getIdToken } = useAuth();
  const { streaming, response, sendMessage } = useGenkitStream();
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    handleMagicLinkCallback();
  }, []);

  useEffect(() => {
    if (user) {
      checkIfKeyExists();
    }
  }, [user]);

  const checkIfKeyExists = async () => {
    try {
      const token = await getIdToken();
      const res = await fetch("http://localhost:3400/flow/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ message: "test" }),
      });
      setKeySaved(res.ok);
    } catch {
      setKeySaved(false);
    }
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await sendMagicLink(email);
    } catch (err) {
      setError("Failed to send magic link. Please try again.");
    }
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("http://localhost:3400/api/key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ api_key: apiKey }),
      });

      if (!res.ok) {
        throw new Error("Failed to save API key");
      }

      setKeySaved(true);
      setApiKey("");
    } catch (err) {
      setError("Failed to save API key. Please try again.");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const token = await getIdToken();
      await sendMessage(message, token);
      setMessage("");
    } catch (err) {
      setError("Failed to send message. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    if (emailSent) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Check your email</CardTitle>
              <CardDescription className="text-zinc-400">
                We sent a magic link to {email}. Click the link to sign in.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Sign in with magic link</CardTitle>
            <CardDescription className="text-zinc-400">
              Enter your email to receive a sign-in link
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendMagicLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-200">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" className="w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-100">
                Send magic link
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!keySaved) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-zinc-100">API Key Settings</CardTitle>
                <CardDescription className="text-zinc-400">
                  Save your Gemini API key to start chatting
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-zinc-700 text-zinc-400">{user.email}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveKey} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey" className="text-zinc-200">Gemini API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza..."
                  required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-100">
                  Save API key
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={signOut}
                  className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                >
                  Sign out
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-zinc-100">LeadFlow Chat</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-zinc-700 text-zinc-400">{user.email}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setKeySaved(false)}
                  className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                >
                  Change key
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={signOut}
                  className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                >
                  Sign out
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <form onSubmit={handleSendMessage} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="message" className="text-zinc-200">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ask me anything..."
                  rows={4}
                  disabled={streaming}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button
                type="submit"
                disabled={streaming || !message.trim()}
                className="w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-100 disabled:opacity-50"
              >
                {streaming ? "Streaming..." : "Send"}
              </Button>
            </form>

            {response && (
              <>
                <Separator className="my-6 bg-zinc-800" />
                <div className="space-y-2">
                  <Label className="text-zinc-200">Response</Label>
                  <div className="bg-zinc-800 border border-zinc-700 rounded-md p-4 text-zinc-100 whitespace-pre-wrap">
                    {response}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
