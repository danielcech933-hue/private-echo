import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Lock, ShieldCheck, ShieldQuestion, LogOut, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getLocalDevice, registerLocalDevice, type LocalDevice } from "@/services/device-service";
import {
  addContact,
  getMyProfile,
  listContactDeviceFingerprints,
  listContacts,
  markDeviceVerified,
  searchByHandle,
  type ContactDeviceFingerprint,
  type ContactRow,
  type DirectoryProfile,
} from "@/services/contact-service";
import {
  getOrCreateDirectConversation,
  loadMessages,
  sendMessage,
  subscribeToConversation,
  type DecryptedMessage,
} from "@/services/messaging-service";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Ciphra" },
      {
        name: "description",
        content: "Your encrypted conversations. Decryption happens on this device only.",
      },
      { property: "og:title", content: "Messages — Ciphra" },
      { property: "og:description", content: "Encrypted conversations, decrypted locally." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const navigate = useNavigate();
  const [device, setDevice] = useState<LocalDevice | null>(null);
  const [profile, setProfile] = useState<DirectoryProfile | null>(null);
  const [registering, setRegistering] = useState(false);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryProfile[]>([]);
  const [active, setActive] = useState<ContactRow | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [fingerprints, setFingerprints] = useState<ContactDeviceFingerprint[]>([]);

  const refreshContacts = useCallback(async () => {
    try {
      setContacts(await listContacts());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cannot load contacts");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setDevice(await getLocalDevice());
      setProfile(await getMyProfile());
      await refreshContacts();
    })();
  }, [refreshContacts]);

  const refreshMessages = useCallback(async () => {
    if (!conversationId || !device) return;
    try {
      setMessages(await loadMessages(conversationId, device.deviceId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cannot load messages");
    }
  }, [conversationId, device]);

  useEffect(() => {
    void refreshMessages();
    if (!conversationId) return;
    return subscribeToConversation(conversationId, () => void refreshMessages());
  }, [conversationId, refreshMessages]);

  async function setupDevice() {
    setRegistering(true);
    try {
      setDevice(await registerLocalDevice());
      toast.success("Device keys generated on this device");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Device setup failed");
    } finally {
      setRegistering(false);
    }
  }

  async function openContact(contact: ContactRow) {
    setActive(contact);
    setMessages([]);
    try {
      setConversationId(await getOrCreateDirectConversation(contact.contactUserId));
      setFingerprints(await listContactDeviceFingerprints(contact.id, contact.contactUserId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cannot open conversation");
    }
  }

  async function send() {
    if (!conversationId || !device || draft.trim().length === 0) return;
    const body = draft.trim();
    setDraft("");
    try {
      await sendMessage(conversationId, device.deviceId, body);
      await refreshMessages();
    } catch (error) {
      setDraft(body);
      toast.error(error instanceof Error ? error.message : "Send failed");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  if (!device) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground">
          <Lock className="size-5 text-primary" />
          <h1 className="mt-4 text-lg font-semibold">Set up this device</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ciphra generates an identity key and pre-keys locally. Only the public halves are
            published; the private keys stay non-extractable in this browser.
          </p>
          <Button className="mt-6 w-full" disabled={registering} onClick={() => void setupDevice()}>
            Generate device keys
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold tracking-[0.3em] uppercase">
              <Lock className="size-4 text-primary" /> Ciphra
            </span>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-4" />
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
            <p className="text-xs text-muted-foreground uppercase">Your handle</p>
            <p className="text-sm font-medium">{profile?.handle ?? "not set"}</p>
            <p className="mt-3 text-xs text-muted-foreground uppercase">This device safety number</p>
            <p className="font-mono text-xs break-all">{device.fingerprint}</p>
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Find a handle"
              value={query}
              onChange={async (event) => {
                const value = event.target.value;
                setQuery(value);
                try {
                  setResults(await searchByHandle(value));
                } catch {
                  setResults([]);
                }
              }}
            />
            {results.map((result) => (
              <button
                key={result.id}
                className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  void (async () => {
                    try {
                      await addContact(result.id);
                      setQuery("");
                      setResults([]);
                      await refreshContacts();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Cannot add contact");
                    }
                  })();
                }}
              >
                @{result.handle}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase">Contacts</p>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts yet.</p>
            ) : (
              contacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => void openContact(contact)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                    active?.id === contact.id ? "bg-accent" : "hover:bg-accent/60"
                  }`}
                >
                  <span>@{contact.handle}</span>
                  {contact.verifiedDevices > 0 ? (
                    <ShieldCheck className="size-4 text-primary" />
                  ) : (
                    <ShieldQuestion className="size-4 text-muted-foreground" />
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="flex min-h-[70vh] flex-col rounded-xl border border-border bg-card text-card-foreground">
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Pick a contact to start an encrypted conversation.
            </div>
          ) : (
            <>
              <header className="border-b border-border p-4">
                <h1 className="text-sm font-semibold">@{active.handle}</h1>
                <div className="mt-2 space-y-1">
                  {fingerprints.map((item) => (
                    <div key={item.deviceId} className="flex items-center gap-2 text-xs">
                      <span className="font-mono break-all text-muted-foreground">
                        {item.fingerprint}
                      </span>
                      {item.verified ? (
                        <span className="text-primary">verified</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void (async () => {
                              try {
                                await markDeviceVerified(active.id, item);
                                setFingerprints(
                                  await listContactDeviceFingerprints(
                                    active.id,
                                    active.contactUserId,
                                  ),
                                );
                                await refreshContacts();
                              } catch (error) {
                                toast.error(
                                  error instanceof Error ? error.message : "Verification failed",
                                );
                              }
                            })();
                          }}
                        >
                          Mark verified
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No envelopes addressed to this device yet.
                  </p>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className="rounded-lg border border-border px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        {new Date(message.sentAt).toLocaleTimeString()}
                      </p>
                      <p className={`text-sm ${message.failure ? "text-destructive" : ""}`}>
                        {message.body ?? message.failure}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <footer className="flex gap-2 border-t border-border p-4">
                <Input
                  value={draft}
                  placeholder="Encrypted before it leaves this device"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void send();
                  }}
                />
                <Button onClick={() => void send()} disabled={draft.trim().length === 0}>
                  <Send className="size-4" />
                </Button>
              </footer>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
