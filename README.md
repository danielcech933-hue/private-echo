# Ciphra

Privacy-first secure messenger foundation.

Ciphra is being built as a Threema-style privacy-focused messenger with client-side message encryption, device-local private keys and a ciphertext-only message store.

## Current status

The repository currently contains:

- device-local WebCrypto identities and pre-key storage;
- encrypted message envelopes stored as ciphertext plus authenticated metadata;
- Row Level Security on the messaging schema;
- authenticated device registration and revocation;
- safety-number fingerprints and contact-device verification records;
- replay protection with atomic local acceptance state;
- protected message, delivery and pre-key authorization boundaries;
- a Ciphra security model and cryptography documentation;
- CI configuration that runs TypeScript typecheck and the production build.

## Important security limitation

The current message/session construction is an interim per-message ephemeral-ECDH design. It is **not Signal Double Ratchet** and **not MLS**. It does not provide full post-compromise recovery or MLS group rekeying. The backend also still sees routing metadata such as device identifiers, membership and delivery timing.

The project must not be marketed as "military-grade", "unbreakable" or equivalent to an independently audited Signal/Threema implementation.

## Development

The app uses TanStack Start, React, TypeScript, Tailwind/shadcn UI and Supabase.

The security-sensitive implementation is deliberately split into:

- `src/crypto/` — cryptographic primitives and protocol abstraction;
- `src/security/` — replay and identity-related enforcement;
- `src/services/` — authenticated data access;
- `supabase/migrations/` — database schema and RLS changes;
- `docs/` — security, cryptography and data-model documentation.

## Verification before production

Before production use for sensitive communications, the cryptographic/session implementation, key lifecycle, RLS policies, browser storage, dependency supply chain and deployed infrastructure require independent security review and penetration testing.

GitHub Actions is configured to run:

```sh
npm ci
npx tsc --noEmit
npm run build
```
