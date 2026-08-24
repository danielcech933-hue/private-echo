# Ciphra Cryptography

## Current suite

The current browser implementation uses the platform WebCrypto API:

- ECDSA P-256 with SHA-256 for device identity signatures.
- ECDH P-256 for key agreement.
- HKDF-SHA-256 for deriving message AEAD keys.
- AES-256-GCM for authenticated encryption.
- Cryptographically secure randomness from `crypto.getRandomValues()`.

No custom cipher, custom hash or custom random-number generator is implemented.

## Device identity

Each device creates a signing identity key pair and an agreement-key hierarchy containing a signed pre-key and one-time pre-keys. Public material is registered with the server. Private key objects are retained in device-local key storage as non-extractable WebCrypto `CryptoKey` values where the platform supports it.

The signed pre-key is authenticated by the device identity key. A sender must verify that signature before using the signed pre-key for key agreement.

## Current message construction

For each outbound message, the sender creates a fresh ephemeral ECDH key pair. The sender derives shared secret material with the recipient signed pre-key and, when available, a one-time pre-key.

Conceptually:

```text
secret = ECDH(ephemeral, signed_prekey)
         || ECDH(ephemeral, one_time_prekey)
key = HKDF-SHA256(secret, random_salt, protocol_info)
ciphertext = AES-256-GCM(key, plaintext, authenticated_header)
```

The one-time pre-key is optional because a recipient may temporarily exhaust its published one-time pre-key pool.

The encrypted envelope authenticates routing and anti-replay fields using AES-GCM additional authenticated data and a signed header construction.

## Anti-replay

An envelope contains a random message ID and a monotonic sender counter. The client validates freshness and keeps local replay state before accepting the plaintext.

## Safety numbers

A deterministic fingerprint is derived from a device's identity public key. Users can compare this fingerprint through an independent channel. Verification is recorded for the specific contact device and fingerprint hash.

## Explicit protocol limitation

The current construction is **not the Signal Double Ratchet**.

There is no receiving-chain ratchet, sending-chain ratchet, skipped-message-key store, or post-compromise recovery mechanism equivalent to the Double Ratchet.

The current design provides fresh ephemeral-ECDH key material per message and therefore offers an interim sender-side forward-secrecy property, but it should not be described as full Double Ratchet security.

The current construction is also **not MLS**. Group conversations currently fan out ciphertext separately to recipient devices. There is no MLS epoch, tree-based group key schedule or standardised group rekeying protocol.

## Replacement strategy

The interfaces in `src/crypto/types.ts` deliberately separate cryptographic primitives from React and Supabase. The intended production path is to replace the interim session/message implementation with a thoroughly reviewed and independently audited protocol/library while preserving those higher-level boundaries.

Any future protocol implementation must define its own threat model, key lifecycle, identity-change semantics, device addition/removal semantics, offline message handling and downgrade protection before it is enabled as a production suite.
