import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, KeyRound, ShieldCheck, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ciphra — end-to-end encrypted messenger" },
      {
        name: "description",
        content:
          "Ciphra is a privacy-first messenger: keys are generated on your device, the server only ever stores ciphertext.",
      },
      { property: "og:title", content: "Ciphra — end-to-end encrypted messenger" },
      {
        property: "og:description",
        content:
          "Device-generated keys, per-message forward secrecy, verifiable safety numbers. The server never sees plaintext.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const pillars = [
  {
    icon: KeyRound,
    title: "Keys never leave the device",
    body: "Identity and pre-keys are generated in the browser as non-extractable WebCrypto keys stored in IndexedDB. Only public halves are published.",
  },
  {
    icon: Lock,
    title: "Server stores ciphertext only",
    body: "Message rows hold an AES-GCM envelope plus a signed routing header. There is no column that could contain readable text.",
  },
  {
    icon: ShieldCheck,
    title: "Verifiable identities",
    body: "Every device has a safety number you can compare out-of-band. Verification is recorded per device, not per account.",
  },
  {
    icon: EyeOff,
    title: "Minimal metadata",
    body: "No phone numbers, no address-book upload. A handle you choose is the only public identifier.",
  },
];

function Landing() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-[0.3em] uppercase">
            <Lock className="size-4 text-primary" /> Ciphra
          </span>
          <Button asChild variant="secondary" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </header>

        <section className="mt-20 max-w-2xl">
          <h1 className="text-5xl leading-tight font-semibold tracking-tight">
            End-to-end encryption designed in from the first commit.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            This is the security foundation of a Threema-style messenger: a replaceable crypto
            abstraction layer, a device-identity model, and a database that is structurally unable to
            hold plaintext.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Create an account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/security">Read the security model</Link>
            </Button>
          </div>
        </section>

        <section className="mt-24 grid gap-6 sm:grid-cols-2">
          {pillars.map((pillar) => (
            <article
              key={pillar.title}
              className="rounded-xl border border-border bg-card p-6 text-card-foreground"
            >
              <pillar.icon className="size-5 text-primary" />
              <h2 className="mt-4 text-lg font-semibold">{pillar.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{pillar.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-16 rounded-xl border border-dashed border-border p-6">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Honest limitations</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              The current handshake is a per-message ephemeral ECDH against a signed pre-key — real
              sender-side forward secrecy, but not a Double Ratchet and no post-compromise recovery.
            </li>
            <li>
              Group messaging fans out per recipient device; there is no MLS-style group ratchet yet.
            </li>
            <li>
              Routing metadata (who talks to whom, when) is visible to the server, as in any
              non-mixnet messenger.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
