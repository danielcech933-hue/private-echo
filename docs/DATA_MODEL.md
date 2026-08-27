# Data model

| Table | Purpose | Notable columns |
| --- | --- | --- |
| `profiles` | public identity | `handle` (unique), `display_name`, `discoverable` |
| `devices` | per-device identity | `identity_public_key`, `signed_prekey_public`, `signed_prekey_signature`, `status` |
| `device_prekeys` | one-time pre-keys | `prekey_id`, `public_key`, `consumed_at`, `consumed_by_device` |
| `contacts` | owner-scoped contact list | `owner_id`, `contact_user_id`, `is_blocked` |
| `contact_verifications` | out-of-band verification | `verified_device_id`, `method`, `fingerprint_hash` |
| `conversations` | direct or group thread | `kind`, `created_by`, `updated_at` |
| `conversation_members` | membership | `role`, `removed_at` |
| `messages` | ciphertext envelopes | `ciphertext`, `encrypted_metadata`, `recipient_device_id` |
| `message_delivery` | per-device receipts | `status` (`sent`/`delivered`/`read`) |
| `encrypted_attachments` | blob references | encrypted key material, no plaintext name |
| `push_tokens` | notification routing | device-scoped |

Rules:

- No plaintext body column exists on `messages` — by design, not by convention.
- Every table has RLS enabled and explicit `GRANT`s; policies scope rows to the
  owner, to conversation members, or to the recipient device.
- Realtime is enabled for `messages` and `message_delivery`; subscribers still
  receive ciphertext only.
- One `messages` row per recipient device: N members with M devices produce
  sum(M) envelopes for a single logical message.
