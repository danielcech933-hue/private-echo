# Cryptography layer

The layer is an abstraction, not a new protocol. Interfaces in
`src/crypto/types.ts` are the contract; the WebCrypto implementation is
replaceable (e.g. by libsignal or an MLS stack) without touching services or UI.

| Interface | Implementation | Responsibility |
| --- | --- | --- |
| `CryptoProvider` | `webcrypto-provider.ts` | primitives only |
| `KeyStore` | `key-store.ts` | IndexedDB, non-extractable keys |
| `IdentityManager` | `identity-manager.ts` | device identity, fingerprints |
| `KeyManager` | `key-manager.ts` | pre-key generation and rotation |
| `SessionManager` | `session-manager.ts` | per-message key agreement |
| `MessageEncryptor` / `MessageDecryptor` | `message-crypto.ts` | envelope build/parse |

## Primitives

- Identity signatures: ECDSA P-256 / SHA-256
- Key agreement: ECDH P-256 (ephemeral sender key vs signed pre-key, plus a
  one-time pre-key when one can be claimed)
- Key derivation: HKDF-SHA256
- Content encryption: AES-256-GCM, 96-bit random IV
- Header binding: the routing header is passed as AAD, so it cannot be swapped

## Envelope

```
{
  header: { envelopeVersion, senderDeviceId, recipientDeviceId, counter,
            sentAt, messageId, ephemeralPublicKey, prekeyId?, signature },
  ciphertext: base64(AES-GCM output)
}
```

The header is signed with the sender's identity key; verification precedes
decryption, and decryption precedes any UI rendering.

## Replacing the layer

Swap the module bound at the bottom of each crypto file. Services depend on the
interfaces (`encrypt(bundle, plaintext)` / `decrypt(envelope)`) only, so a
Double-Ratchet or MLS implementation is a drop-in with no schema change beyond
adding session-state storage.
