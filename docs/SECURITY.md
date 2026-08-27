# Ciphra security architecture

## Trust boundaries

| Boundary | Sees |
| --- | --- |
| Browser (device) | plaintext, private keys (non-extractable), replay state |
| Postgres / Realtime | ciphertext, routing headers, public keys, membership metadata |
| Operator | same as the database — no plaintext, no private keys |

Private key material lives only in IndexedDB as non-extractable `CryptoKey`
objects (`src/crypto/key-store.ts`). Nothing in the codebase can serialise it.

## Data model guarantees

- `messages` has `ciphertext` and `encrypted_metadata` only; there is no
  plaintext body column, so a bug cannot leak text into the database.
- One row per recipient device (sender-side fan-out).
- RLS is enabled on every user table. Access is decided by
  `owns_device`, `is_conversation_member`, `is_conversation_admin` and
  `can_read_message` security-definer helpers; `EXECUTE` is revoked from
  `PUBLIC`/`anon`.
- `device_prekeys.consumed_at` makes one-time pre-key claiming single-use.

## Device identity

A device registers by generating its own identity key and publishing only the
public bundle (identity key, signed pre-key + signature, one-time pre-keys).
Revocation flips `devices.status` and wipes local key material.

Safety numbers are derived from the identity public key and verified per
device (`contact_verifications`), never per account.

## Replay protection

`src/security/replay-guard.ts` enforces, locally:

1. monotonic per-sender-device counters,
2. bounded message-id history,
3. a clock-skew window.

Rejected envelopes surface in the UI as "Rejected by replay protection" and are
never decrypted.

## Explicit non-goals (today)

- Not a Double Ratchet: no post-compromise recovery.
- No MLS group ratchet.
- Routing metadata is not hidden from the server.
- Attachments and push payload encryption are schema-level only so far.
