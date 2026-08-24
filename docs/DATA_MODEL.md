# Ciphra Data Model

The backend is intentionally structured around public identity material, routing metadata and ciphertext. It must not contain plaintext message bodies or private cryptographic keys.

## Core tables

### `profiles`

Minimal account profile information:

- `id` — authenticated user ID.
- `handle` — public identifier selected by the user.
- `display_name` — optional display label.
- `discoverable` — whether the profile can be found by handle.
- timestamps.

The model does not require a phone number or uploaded address book.

### `devices`

One row per registered device:

- device ID and owning user ID.
- device name and platform.
- public identity signing key.
- public signed pre-key.
- signed pre-key signature.
- signed pre-key ID and key version.
- cryptographic suite identifier.
- active/revoked state and timestamps.

**Private keys are not stored here.**

### `device_prekeys`

Published one-time pre-key public material:

- device ID.
- pre-key ID.
- public key.
- consumption timestamp and optional consuming device.

The private half remains local to the recipient device.

### `contacts`

Per-owner contact relationship:

- owner user ID.
- contact user ID.
- optional encrypted alias.
- blocked flag.
- timestamps.

### `contact_verifications`

Manual verification record for a contact device:

- contact ID.
- verifier user ID.
- verified device ID.
- verification method.
- fingerprint hash.
- verification timestamp.

### `conversations`

Conversation routing and lifecycle data:

- conversation ID.
- direct/group kind.
- creator.
- optional encrypted metadata.
- key epoch.
- timestamps.

### `conversation_members`

Conversation membership and role:

- conversation ID.
- user ID.
- member/admin role.
- join/remove timestamps.
- joined key epoch.

### `messages`

One ciphertext envelope per recipient device:

- conversation ID.
- sender user/device IDs.
- recipient device ID.
- envelope version.
- `ciphertext`.
- `encrypted_metadata` containing the authenticated envelope header.
- key epoch.
- timestamps and optional expiration.

There is intentionally **no plaintext message body column**.

### `message_delivery`

Delivery state for a message/device pair:

- message ID.
- recipient device.
- `pending`, `sent`, `delivered`, `read` or `failed`.
- update timestamp.

### `encrypted_attachments`

Attachment metadata and ciphertext storage references. Plain file content must be encrypted on the originating device before it reaches remote storage.

### `push_tokens`

Device push-delivery tokens. Push infrastructure must not receive plaintext message bodies. Notification design should prefer opaque event identifiers and let the client fetch ciphertext.

## Row Level Security

RLS is enabled on application tables. Important ownership concepts include:

- a user may modify their own profile and devices.
- contact records are owned by the contact owner.
- conversation visibility depends on active membership.
- messages are readable by the sender or the owner of the targeted recipient device.
- message insertion requires an authenticated sender who owns the sender device and belongs to the conversation.

Security-definer helper functions are used for membership and device ownership checks. These helpers must not be exposed to anonymous clients.

## Metadata boundary

E2E encryption prevents the backend from reading plaintext content, but the relational model still contains routing metadata required for delivery. The current system therefore does **not** claim metadata hiding, sender anonymity, mixnet protection, or sealed-sender semantics.

## Group keying limitation

`conversations.key_epoch` and `conversation_members.joined_key_epoch` reserve space for future group key lifecycle work. They are not an MLS implementation. Current group delivery is recipient-device fan-out and does not provide MLS tree-based group rekeying.
