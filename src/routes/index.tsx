import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GLOBAL_CHAT_LIMITS,
  loadGlobalChat,
  postGlobalMessage,
  subscribeToGlobalChat,
  type GlobalChatMessage,
} from "@/services/global-chat-service";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chat — Private Echo" },
      {
        name: "description",
        content: "A simple public chat room. Join instantly and start talking.",
      },
    ],
  }),
  component: GlobalChatPage,
});

const NICKNAME_STORAGE_KEY = "private-echo-chat-nickname";

function GlobalChatPage() {
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [nickname, setNickname] = useState(() => {
    if (typeof window === "undefined") return "Anonymous";
    return window.localStorage.getItem(NICKNAME_STORAGE_KEY) || "Anonymous";
  });
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadGlobalChat()
      .then(setMessages)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Unable to load chat");
      })
      .finally(() => setLoading(false));

    const unsubscribe = subscribeToGlobalChat((message) => {
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current;
        return [...current.slice(-(199)), message];
      });
    });

    setConnected(true);
    return () => {
      unsubscribe();
      setConnected(false);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NICKNAME_STORAGE_KEY, nickname.slice(0, GLOBAL_CHAT_LIMITS.maxNickname));
    }
  }, [nickname]);

  const messageCountLabel = useMemo(
    () => `${messages.length} ${messages.length === 1 ? "message" : "messages"}`,
    [messages.length],
  );

  async function send() {
    if (sending) return;

    const body = draft.trim();
    if (!body) return;

    setSending(true);
    try {
      const message = await postGlobalMessage(nickname, body);
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current;
        return [...current.slice(-(199)), message];
      });
      setDraft("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex h-screen min-h-[620px] flex-col bg-slate-950 text-slate-50">
      <header className="border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-950">
              <MessageCircle className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold sm:text-base">Public Chat</h1>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {connected ? <Wifi className="size-3.5 text-emerald-400" /> : <WifiOff className="size-3.5" />}
                <span>{connected ? "Connected" : "Connecting…"}</span>
                <span className="text-slate-600">•</span>
                <span>{messageCountLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={nickname}
              maxLength={GLOBAL_CHAT_LIMITS.maxNickname}
              aria-label="Your name"
              onChange={(event) => setNickname(event.target.value)}
              className="h-9 w-[150px] border-white/10 bg-white/5 text-sm text-white placeholder:text-slate-500"
              placeholder="Your name"
            />
          </div>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading chat…</div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div>
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <MessageCircle className="size-6 text-slate-300" />
                </div>
                <h2 className="mt-5 text-lg font-semibold">You are in the room.</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  There is one shared room. Anyone who opens this site can join and start chatting.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <article key={message.id} className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3">
                  <div className="mb-1 flex items-center justify-between gap-4">
                    <span className="truncate text-sm font-semibold text-white">{message.nickname}</span>
                    <time className="shrink-0 text-[11px] text-slate-500" dateTime={message.created_at}>
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{message.body}</p>
                </article>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-4 sm:px-6">
          <div className="flex items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-2">
            <Input
              value={draft}
              maxLength={GLOBAL_CHAT_LIMITS.maxBody}
              aria-label="Message"
              placeholder="Write a message…"
              disabled={sending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              className="h-11 border-0 bg-transparent text-sm text-white shadow-none focus-visible:ring-0 placeholder:text-slate-600"
            />
            <Button
              size="icon"
              className="size-11 shrink-0 rounded-xl bg-white text-slate-950 hover:bg-slate-200"
              disabled={sending || !draft.trim()}
              onClick={() => void send()}
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-600">
            One global room · anyone can join · messages are capped at {GLOBAL_CHAT_LIMITS.maxBody.toLocaleString()} characters
          </p>
        </div>
      </section>
    </main>
  );
}
