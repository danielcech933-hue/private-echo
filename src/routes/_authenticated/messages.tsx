import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, LogOut, MessageSquare, Plus, Search, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  addContact,
  listContactDeviceFingerprints,
  listContacts,
  searchByHandle,
  type ContactDeviceFingerprint,
  type ContactRow,
  type DirectoryProfile,
} from "@/services/contact-service";
import { getLocalDevice, registerLocalDevice, type LocalDevice } from "@/services/device-service";
import {
  getOrCreateDirectConversation,
  listConversations,
  loadMessages,
  sendMessage,
  subscribeToConversation,
  type ConversationSummary,
  type DecryptedMessage,
} from "@/services/messaging-service";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Ciphra" },
      {
        name: "description",
        content: "Private messaging with device-local encryption keys.",
      },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const [device, setDevice] = useState<LocalDevice | null>(null);
  const [loadingDevice, setLoadingDevice] = useState(true);

  useEffect(() => {
    void getLocalDevice()
      .then(setDevice)
      .catch((error) => toast.error(error instanceof Error ? error.message : "Device setup failed"))
      .finally(() => setLoadingDevice(false));
  }, []);

  if (loadingDevice) {
    return <CenteredMessage text="Checking this device…" />;
  }

  if (!device) {
    return <DeviceSetup onComplete={setDevice} />;
  }

  return <Messenger device={device} />;
}

function DeviceSetup({ onComplete }: { onComplete: (device: LocalDevice) => void }) {
  const [deviceName, setDeviceName] = useState("");
  const [busy, setBusy] = useState(false);

  async function setup() {
    setBusy(true);
    try {
      const local = await registerLocalDevice(deviceName);
      onComplete(local);
      toast.success("This device is now registered");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Device setup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-card-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-border p-2">
            <KeyRound className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-[0.28em] text-primary uppercase">Ciphra</p>
            <h1 className="text-2xl font-semibold">Secure this device</h1>
          </div>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Your device identity and private keys are generated locally. Only public key material is
          registered with the backend.
        </p>
        <div className="mt-6 space-y-3">
          <Input
            value={deviceName}
            placeholder="Device name (optional)"
            onChange={(event) => setDeviceName(event.target.value)}
          />
          <Button className="w-full" disabled={busy} onClick={() => void setup()}>
            {busy ? "Generating keys…" : "Generate device identity"}
          </Button>
        </div>
      </div>
    </main>
  );
}

function Messenger({ device }: { device: LocalDevice }) {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<DirectoryProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [fingerprints, setFingerprints] = useState<ContactDeviceFingerprint[]>([]);
  const [verificationContact, setVerificationContact] = useState<ContactRow | null>(null);
  const [me, setMe] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  useEffect(() => {
    void refreshSidebar();
    void supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    const refreshMessages = async () => {
      try {
        const next = await loadMessages(selectedConversationId, device.deviceId);
        if (!cancelled) setMessages(next);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load messages");
      }
    };

    void refreshMessages();
    const unsubscribe = subscribeToConversation(selectedConversationId, () => void refreshMessages());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [device.deviceId, selectedConversationId]);

  async function refreshSidebar() {
    try {
      const [contactRows, conversationRows] = await Promise.all([listContacts(), listConversations()]);
      setContacts(contactRows);
      setConversations(conversationRows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load messenger data");
    }
  }

  async function searchDirectory() {
    if (search.trim().length < 3) {
      setResults([]);
      return;
    }
    try {
      setResults(await searchByHandle(search));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Directory search failed");
    }
  }

  async function addAndOpen(profile: DirectoryProfile) {
    try {
      await addContact(profile.id);
      const conversationId = await getOrCreateDirectConversation(profile.id);
      setSelectedConversationId(conversationId);
      setResults([]);
      setSearch("");
      await refreshSidebar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open conversation");
    }
  }

  async function openContact(contact: ContactRow) {
    try {
      const conversationId = await getOrCreateDirectConversation(contact.contactUserId);
      setSelectedConversationId(conversationId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open conversation");
    }
  }

  async function openVerification(contact: ContactRow) {
    try {
      const next = await listContactDeviceFingerprints(contact.id, contact.contactUserId);
      setFingerprints(next);
      setVerificationContact(contact);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load safety numbers");
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || !selectedConversationId) return;

    setBusy(true);
    try {
      await sendMessage(selectedConversationId, device.deviceId, body);
      setDraft("");
      const next = await loadMessages(selectedConversationId, device.deviceId);
      setMessages(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send message");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const conversationTitle = selectedConversation
    ? selectedConversation.memberUserIds.filter((userId) => userId !== me).join(", ") || "Conversation"
    : "Select a conversation";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className="w-full border-b border-border bg-card p-5 text-card-foreground lg:w-[340px] lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.28em] text-primary uppercase">Ciphra</p>
              <h1 className="text-xl font-semibold">Private Echo</h1>
            </div>
            <Button variant="ghost" size="icon" onClick={() => void signOut()} title="Sign out">
              <LogOut className="size-4" />
            </Button>
          </div>

          <div className="mt-5 rounded-lg border border-border p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4 text-primary" /> Device protected
            </div>
            <p className="mt-1 break-all text-xs text-muted-foreground">{device.fingerprint}</p>
            <Button asChild variant="ghost" size="sm" className="mt-2 px-0">
              <Link to="/security">Security model</Link>
            </Button>
          </div>

          <div className="mt-6">
            <div className="flex gap-2">
              <Input
                value={search}
                placeholder="Find a handle"
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchDirectory();
                }}
              />
              <Button variant="outline" size="icon" onClick={() => void searchDirectory()}>
                <Search className="size-4" />
              </Button>
            </div>
            {results.length > 0 && (
              <div className="mt-2 rounded-lg border border-border bg-background p-2">
                {results.map((profile) => (
                  <button
                    key={profile.id}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-accent"
                    onClick={() => void addAndOpen(profile)}
                  >
                    <span>
                      <span className="block font-medium">@{profile.handle}</span>
                      <span className="text-xs text-muted-foreground">{profile.displayName ?? profile.id}</span>
                    </span>
                    <Plus className="size-4" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Contacts</h2>
              <span className="text-xs text-muted-foreground">{contacts.length}</span>
            </div>
            <div className="space-y-1">
              {contacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-1">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
                    onClick={() => void openContact(contact)}
                  >
                    <MessageSquare className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 truncate">@{contact.handle}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Safety numbers"
                    onClick={() => void openVerification(contact)}
                  >
                    <ShieldCheck className="size-4" />
                  </Button>
                </div>
              ))}
              {contacts.length === 0 && (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Add a contact by searching for their handle.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Conversations</h2>
            <div className="space-y-1">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${selectedConversationId === conversation.id ? "bg-accent" : "hover:bg-accent"}`}
                  onClick={() => setSelectedConversationId(conversation.id)}
                >
                  <span className="block truncate font-medium">
                    {conversation.memberUserIds.filter((userId) => userId !== me).join(", ") || "Conversation"}
                  </span>
                  <span className="text-xs text-muted-foreground">{conversation.kind}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-[70vh] flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <p className="text-xs text-muted-foreground">End-to-end encrypted</p>
              <h2 className="font-semibold">{conversationTitle}</h2>
            </div>
            {selectedConversationId && <Check className="size-4 text-primary" />}
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-6">
            {messages.map((message) => {
              const mine = message.senderUserId === me;
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground border border-border"}`}
                  >
                    {message.body ?? (
                      <span className="text-xs opacity-80">Message could not be decrypted on this device.</span>
                    )}
                  </div>
                </div>
              );
            })}
            {!selectedConversationId && (
              <div className="flex h-full min-h-64 items-center justify-center text-sm text-muted-foreground">
                Choose a contact or create a conversation from the left side.
              </div>
            )}
          </div>

          <div className="border-t border-border p-4">
            <div className="mx-auto flex max-w-4xl gap-2">
              <Input
                value={draft}
                placeholder={selectedConversationId ? "Write an encrypted message…" : "Select a conversation"}
                disabled={!selectedConversationId || busy}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <Button
                size="icon"
                disabled={!selectedConversationId || !draft.trim() || busy}
                onClick={() => void send()}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>

      {verificationContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Safety numbers</p>
                <h2 className="text-xl font-semibold">@{verificationContact.handle}</h2>
              </div>
              <Button variant="ghost" onClick={() => setVerificationContact(null)}>
                Close
              </Button>
            </div>
            <div className="mt-5 space-y-4">
              {fingerprints.map((fingerprint) => (
                <div key={fingerprint.deviceId} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{fingerprint.deviceName}</p>
                      <p className="text-xs text-muted-foreground">
                        {fingerprint.verified ? "Verified" : "Not yet verified"}
                      </p>
                    </div>
                    <ShieldCheck className={`size-5 ${fingerprint.verified ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <p className="mt-3 break-all font-mono text-xs leading-5">{fingerprint.fingerprint}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void navigator.clipboard?.writeText(fingerprint.fingerprint).then(() => toast.success("Safety number copied"))}
                  >
                    <Copy className="size-3" /> Copy
                  </Button>
                </div>
              ))}
              {fingerprints.length === 0 && (
                <p className="text-sm text-muted-foreground">This contact has no active devices yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      {text}
    </main>
  );
}
