import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Fingerprint, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security — Ciphra" },
      {
        name: "description",
        content:
          "Ciphra security architecture, cryptographic model, device identity and explicit protocol limitations.",
      },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="size-4" /> Back
          </Link>
        </Button>

        <div className="mt-10 flex items-center gap-3">
          <ShieldCheck className="size-7 text-primary" />
          <div>
            <p className="text-xs font-semibold tracking-[0.3em] text-primary uppercase">Ciphra</p>
            <h1 className="text-3xl font-semibold tracking-tight">Security model</h1>
          </div>
        </div>

        <p className="mt-5 max-w-3xl text-muted-foreground">
          Ciphra is designed as a privacy-first messenger. Plaintext message content is encrypted
          on the originating device before it is sent to the backend. Private device keys stay in
          device-local storage and are not part of the server data model.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <SecurityCard
            icon={KeyRound}
            title="Device keys"
            body="Identity and pre-key material are generated locally with WebCrypto. The server receives public key material only."
          />
          <SecurityCard
            icon={Fingerprint}
            title="Safety numbers"
            body="Each device exposes a deterministic fingerprint that contacts can compare out-of-band before marking a device verified."
          />
          <SecurityCard
            icon={ShieldCheck}
            title="Ciphertext-only messages"
            body="Message rows contain ciphertext and an authenticated encrypted envelope header rather than plaintext message bodies."
          />
          <SecurityCard
            icon={TriangleAlert}
            title="Explicit limitations"
            body="The current protocol is not Signal Double Ratchet and not MLS. It provides per-message ephemeral-ECDH forward secrecy, but not post-compromise recovery or a group ratchet."
          />
        </div>

        <section className="mt-10 rounded-xl border border-border bg-card p-6 text-card-foreground">
          <h2 className="text-lg font-semibold">What the server can still observe</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Account and device identifiers required for routing and access control.</li>
            <li>Conversation membership and message delivery metadata.</li>
            <li>Timing and routing metadata associated with message delivery.</li>
          </ul>
          <p className="mt-5 text-sm text-muted-foreground">
            End-to-end encryption protects message content; it does not make a server-side relay
            invisible. Reducing metadata exposure requires additional protocol and infrastructure
            work beyond this first stack.
          </p>
        </section>
      </div>
    </main>
  );
}

function SecurityCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <Icon className="size-5 text-primary" />
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </article>
  );
}
