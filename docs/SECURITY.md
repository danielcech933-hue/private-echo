# Ciphra Security Model

## Scope

Ciphra is a privacy-first messenger whose primary security goal is to keep message content unreadable to the backend. This document describes the security properties implemented by the current web stack and deliberately does not claim parity with mature protocols such as Signal or Threema.

## Trust boundaries

The browser is the cryptographic endpoint. Private identity, signed-pre-key and one-time-pre-key material is generated and retained locally. The backend is a routing, persistence and access-control service.

The server is trusted for availability and authorization decisions, but it is **not** trusted with plaintext message content.

## Message confidentiality

Messages are encrypted on the originating device before insertion into `messages`. The database schema stores ciphertext plus an authenticated envelope header rather than a plaintext message body.

The backend can still observe routing information such as account/device identifiers, conversation membership, timestamps and delivery state.

## Device identity

Every device has a separate cryptographic identity. Public identity material and pre-key material may be published to the backend. Private keys remain in device-local key storage.

A device can be revoked, after which the client should wipe its local key material.

## Authentication and authorization

Supabase Auth authenticates accounts. PostgreSQL Row Level Security restricts access to user-owned data, conversation membership, device ownership and message endpoints.

The security model assumes that service-role credentials remain server-side and are never embedded in browser code.

## Safety numbers

A device identity public key is converted into a deterministic human-readable fingerprint. Contacts can compare fingerprints out-of-band and record a verification for a particular contact device.

A fingerprint comparison is an identity verification mechanism; it does not by itself prove that the surrounding operating system, browser or device is uncompromised.

## Replay protection

Message envelopes carry a sender-side counter and random message ID. The client keeps local replay state and rejects envelopes that are too old, duplicated or otherwise fail the replay policy.

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
