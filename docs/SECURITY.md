# Ciphra Security Model

Ciphra is a privacy-first messenger whose primary security goal is to keep message content unreadable to the backend. This document describes the current web-stack security properties and deliberately does not claim parity with mature protocols such as Signal or Threema.

## Trust boundaries

The browser is the cryptographic endpoint. Private identity, signed-pre-key and one-time-pre-key material is generated and retained locally. The backend is a routing, persistence and access-control service. It is not trusted with plaintext message content.

## Message confidentiality

Messages are encrypted on the originating device before insertion into `messages`. The database stores ciphertext plus an authenticated envelope header rather than a plaintext message body. The backend can still observe routing metadata such as account/device identifiers, conversation membership, timestamps and delivery state.

## Device identity binding

Every device has a separate cryptographic identity. On receipt, the client checks that the database sender device is active, that it belongs to the database sender account, that envelope sender/recipient device IDs match the database route, that the envelope identity public key matches the registered sender-device identity key, and that the crypto suite matches the supported suite.

A verified safety number should still be used for stronger protection against a malicious or compromised directory replacing the registered public identity key.

## Device lifecycle

A device can be revoked, after which it is excluded from active delivery and local key material is wiped. One-time pre-keys are claimed atomically only inside an active conversation. Direct client-side UPDATE access to the pre-key table is disabled. After a message using a one-time pre-key successfully authenticates and decrypts, the recipient deletes the corresponding private pre-key locally.

## Authentication and authorization

Supabase Auth authenticates accounts. PostgreSQL Row Level Security restricts access to user-owned data, conversation membership, device ownership and message endpoints.

The sender must own the sender device. A message recipient device must belong to an active conversation member. Delivery rows must identify the actual recipient device of the referenced message. Contact verification records must belong to the contact owner and point to an active device belonging to that contact. Conversation members cannot self-promote by changing their own membership role.

Service-role credentials remain server-side and are never embedded in browser code.

## Safety numbers

A deterministic fingerprint is derived from a device identity public key. Contacts can compare it out-of-band and record verification for a specific contact device. This does not prove that the endpoint itself is uncompromised.

## Replay protection

Message envelopes contain a random message ID and a monotonic sender counter. The client checks freshness without mutating state, authenticates/decrypts the envelope, and only then records replay state in one atomic IndexedDB transaction. This avoids burning replay state on invalid ciphertext and prevents concurrent duplicate acceptance.

## Transport / browser hardening

The application server adds baseline HTTP security headers including `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`. These are defense-in-depth and are not a substitute for endpoint security or a complete Content Security Policy.

## What is not protected

Ciphra does not currently hide all metadata. The relay can learn that devices are communicating and can observe timing and delivery metadata. A compromised endpoint can read plaintext while a message is composed or displayed.

## Important protocol limitation

The current message/session construction is **not a Double Ratchet implementation** and it is **not MLS**. It uses per-message ephemeral ECDH with signed pre-key verification and optional one-time pre-keys, providing an interim sender-side forward-secrecy property but not full Double Ratchet post-compromise recovery.

Group messaging currently uses per-recipient-device fan-out and does not provide an MLS group ratchet or full group rekeying semantics. Push notifications and metadata minimisation are also not solved to a Threema/Signal-equivalent level by this stack alone.

## Production status

This repository is a security-oriented engineering foundation, not a claim of independently audited cryptographic security. Before production use for sensitive communications, the crypto/session implementation, key lifecycle, RLS policies, client storage, dependency supply chain and deployed infrastructure should undergo independent security review and penetration testing.
