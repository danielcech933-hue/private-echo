# Ciphra Security Model

## Scope

Ciphra is a privacy-first messenger whose primary security goal is to keep message content unreadable to the backend. This document describes the security properties implemented by the current web stack and deliberately does not claim parity with mature protocols such as Signal or Threema.

## Trust boundaries

The browser is the cryptographic endpoint. Private identity, signed-pre-key and one-time-pre-key material is generated and retained locally. The backend is a routing, persistence and access-control service.

The server is trusted for availability and authorization decisions, but it is **not** trusted with plaintext message content.

## Message confidentiality

Messages are encrypted on the originating device before insertion into `messages`. The database schema stores ciphertext plus an authenticated envelope header rather than a plaintext message body.

The backend can still observe routing information such as account/device identifiers, conversation membership, timestamps and delivery state.

## Device identity binding

Every device has a separate cryptographic identity. Public identity material and pre-key material may be published to the backend. Private keys remain in device-local key storage.

On receipt, the client checks that the database sender device is active, that it belongs to the database sender account, that the envelope sender and recipient device IDs match the database route, that the envelope identity public key exactly matches the registered sender-device identity key, and that the crypto suite is supported and consistent.

This prevents an attacker from simply attaching a new self-generated signing key to an existing device ID and having the receiver accept it as that device.

A verified safety number should still be used for stronger protection against a malicious or compromised directory/server replacing the registered public identity key.

## Device lifecycle

A device can be revoked, after which it is excluded from active delivery and the local client wipes its device-local key material.

One-time pre-keys are claimed atomically on the backend only inside an active conversation. Direct client-side UPDATE access to the pre-key table is disabled. After a message using a one-time pre-key successfully authenticates and decrypts, the recipient removes the corresponding private pre-key locally.

## Authentication and authorization

Supabase Auth authenticates accounts. PostgreSQL Row Level Security restricts access to user-owned data, conversation membership, device ownership and message endpoints.

Important authorization relationships include:

- a sender must own the sender device;
- a message recipient device must belong to an active member of the conversation;
- delivery records must name the actual recipient device of the referenced message;
- contact verification records must belong to the owner of the contact and reference an active device belonging to that contact user;
- conversation members cannot self-promote by changing their own membership role.

The security model assumes that service-role credentials remain server-side and are never embedded in browser code.

## Safety numbers

A device identity public key is converted into a deterministic human-readable fingerprint. Contacts can compare fingerprints out-of-band and record a verification for a particular contact device.

A fingerprint comparison is an identity verification mechanism; it does not by itself prove that the surrounding operating system, browser or device is uncompromised.

## Replay protection

Message envelopes carry a sender-side counter and random message ID. The client first checks freshness without mutating local state. Only after successful authenticated decryption is replay state recorded in a single atomic IndexedDB transaction. This prevents corrupted ciphertext from burning a valid counter while preventing concurrent tabs from accepting the same message twice.

## Transport / browser hardening

The application server adds baseline HTTP security headers including `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.

These headers are defense-in-depth and are not a substitute for endpoint security or a complete Content Security Policy.

## What is not protected

Ciphra does not currently hide all metadata. The relay can learn that devices are communicating and can observe timing and delivery metadata.

A compromised endpoint can read plaintext while a message is being composed or displayed. End-to-end encryption cannot protect data after the endpoint itself is compromised.

## Important protocol limitation

The current message/session construction is **not a Double Ratchet implementation** and it is **not MLS**.

It uses per-message ephemeral ECDH with signed pre-key verification and optional one-time pre-keys. This provides fresh key material and sender-side forward secrecy, but it does **not** provide the full post-compromise recovery properties of a Double Ratchet.

Group messaging currently uses per-recipient-device fan-out and does **not** provide an MLS group ratchet or full group rekeying semantics.

Push notifications and metadata minimisation are also not solved to a Threema/Signal-equivalent level by this stack alone.

## Production status

This repository is a security-oriented engineering foundation, not a claim of independently audited cryptographic security. Before production use for sensitive communications, the crypto/session implementation, key lifecycle, RLS policies, client storage, dependency supply chain and deployed infrastructure should undergo independent security review and penetration testing.
