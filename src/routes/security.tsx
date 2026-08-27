import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security model — Ciphra" },
      {
        name: "description",
        content:
          "How Ciphra handles keys, envelopes, replay protection and device verification — including what it deliberately does not do yet.",
      },
      { property: "og:title", content: "Security model — Ciphra" },
      {
        property: "og:description",
        content: "Key handling, envelope format, replay protection and verification, documented honestly.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SecurityPage,
});

const sections = [
  {
    title: "Key material",
    items: [
      "Identity key: ECDSA P-256, non-extractable, created in the browser and stored in IndexedDB.",
      "Signed pre-key: ECDH P-256, signed by the identity key so recipients can attribute it to a device.",
      "One-time pre-keys: a pool of ECDH keys; only public halves are published, each claimed at most once.",
      "No private key, seed or passphrase is ever transmitted to the server.",
    ],
  },
  {
    title: "Message envelope",
    items: [
      "Per message: ephemeral ECDH against the recipient's signed pre-key (and a one-time pre-key when available).",
      "HKDF-SHA256 derives a fresh AES-256-GCM key; the routing header is bound as additional authenticated data.",
      "The database stores ciphertext plus the header only. There is no plaintext column anywhere in the schema.",
      "Group and multi-device delivery is sender-side fan-out: one envelope per recipient device.",
    ],
  },
  {
    title: "Replay and freshness",
    items: [
      "Each sending device keeps a monotonic counter; receivers reject regressions.",
      "Message ids are remembered locally for a bounded window and rejected on repeat.",
      "Envelopes outside the allowed clock-skew window are rejected before decryption.",
    ],
  },
  {
    title: "Identity verification",
    items: [
      "Every device exposes a numeric safety number derived from its identity public key.",
      "Verification is recorded per device, not per account, so a new device is unverified by default.",
    ],
  },
  {
    title: "Known limitations",
    items: [
      "The handshake is a per-message ephemeral ECDH, not a Double Ratchet: no post-compromise recovery.",
      "There is no MLS-style group ratchet; groups fan out per device.",
      "Routing metadata (who talks to whom and when) is visible to the server.",
      "Attachment encryption and push payload encryption are modelled in the schema but not yet implemented end to end.",
    ],
  },
];

function SecurityPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-[0.3em] uppercase">
            <Lock className="size-4 text-primary" /> Ciphra
          </Link>
          <Button asChild size="sm" variant="secondary">
            <Link to="/auth">Sign in</Link>
          </Button>
        </header>

        <h1 className="mt-16 text-4xl font-semibold tracking-tight">Security model</h1>
        <p className="mt-4 text-muted-foreground">
          This page mirrors the implementation in <code>src/crypto</code>, <code>src/security</code>{" "}
          and the database migrations. If something is not listed here, assume it is not implemented.
        </p>

        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-sm font-semibold tracking-wide uppercase">{section.title}</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {section.items.map((item) => (
                  <li key={item} className="border-l border-border pl-4">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
