/**
 * Cryptographic abstraction layer — interfaces only.
 *
 * Nothing in this file knows about React, Supabase or the UI.
 * The concrete provider is intentionally replaceable: the goal is to swap the
 * current WebCrypto implementation for an audited library / protocol
 * implementation (e.g. libsignal, MLS) without touching UI or data access code.
 */

/** Identifier of the cryptographic suite a device is registered with. */
export type CryptoSuiteId = "webcrypto-p256-hkdf-aesgcm-v1";

export interface PublicKeyMaterial {
  /** base64-encoded raw public key. */
  publicKey: string;
}

export interface KeyPairHandle {
  /** Never serialised, never sent to the server. */
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  /** base64 raw public key, safe to publish. */
  publicKeyBase64: string;
}

export interface AeadCiphertext {
  /** base64 */
  ciphertext: string;
  /** base64 nonce / IV */
  nonce: string;
}

/**
 * Low-level primitives. Implementations MUST use vetted primitives only —
 * no hand-rolled ciphers, no ECB, no static IVs.
 */
export interface CryptoProvider {
  readonly suite: CryptoSuiteId;

  /** Long-term signing identity of a single device. */
  generateSigningKeyPair(): Promise<KeyPairHandle>;
  /** Key-agreement key pair (signed pre-key / one-time pre-key / ephemeral). */
  generateAgreementKeyPair(): Promise<KeyPairHandle>;

  sign(privateKey: CryptoKey, data: Uint8Array): Promise<string>;
  verify(publicKeyBase64: string, signatureBase64: string, data: Uint8Array): Promise<boolean>;

  /** ECDH -> raw shared secret bytes. */
  agree(privateKey: CryptoKey, peerPublicKeyBase64: string): Promise<Uint8Array>;

  /** HKDF over one or more shared secrets -> AEAD key. */
  deriveAeadKey(secrets: Uint8Array[], salt: Uint8Array, info: string): Promise<CryptoKey>;

  aeadEncrypt(key: CryptoKey, plaintext: Uint8Array, aad: Uint8Array): Promise<AeadCiphertext>;
  aeadDecrypt(key: CryptoKey, payload: AeadCiphertext, aad: Uint8Array): Promise<Uint8Array>;

  randomBytes(length: number): Uint8Array;
  digest(data: Uint8Array): Promise<Uint8Array>;
}

/**
 * Device-local private key storage.
 * Implementations MUST keep private keys non-extractable where the platform
 * allows it and MUST NOT expose any serialisation of private key material.
 */
export interface KeyStore {
  putKeyPair(id: string, pair: KeyPairHandle): Promise<void>;
  getKeyPair(id: string): Promise<KeyPairHandle | null>;
  deleteKeyPair(id: string): Promise<void>;
  putValue(id: string, value: string): Promise<void>;
  getValue(id: string): Promise<string | null>;
  /** Local panic wipe: removes all device key material. */
  wipe(): Promise<void>;
}

export interface DeviceIdentity {
  deviceId: string;
  userId: string;
  suite: CryptoSuiteId;
  identityPublicKey: string;
  signedPrekeyId: number;
  signedPrekeyPublic: string;
  signedPrekeySignature: string;
  keyVersion: number;
}

/** Registration bundle published to the server (public material only). */
export interface DeviceRegistrationBundle {
  suite: CryptoSuiteId;
  identityPublicKey: string;
  signedPrekeyId: number;
  signedPrekeyPublic: string;
  signedPrekeySignature: string;
  keyVersion: number;
  oneTimePrekeys: Array<{ prekeyId: number; publicKey: string }>;
}

/** Owns this device's identity: creation, fingerprint, revocation state. */
export interface IdentityManager {
  hasLocalIdentity(): Promise<boolean>;
  createLocalIdentity(): Promise<DeviceRegistrationBundle>;
  getIdentityFingerprint(): Promise<string | null>;
  wipeLocalIdentity(): Promise<void>;
}

/** Owns pre-key lifecycle and key rotation. */
export interface KeyManager {
  rotateSignedPrekey(): Promise<{
    signedPrekeyId: number;
    signedPrekeyPublic: string;
    signedPrekeySignature: string;
    keyVersion: number;
  }>;
  generateOneTimePrekeys(count: number): Promise<Array<{ prekeyId: number; publicKey: string }>>;
  /** Private half of a published pre-key, for inbound handshakes. */
  getPrekeyPair(prekeyId: number): Promise<KeyPairHandle | null>;
  getSignedPrekeyPair(): Promise<KeyPairHandle | null>;
  getSigningKeyPair(): Promise<KeyPairHandle | null>;
}

/** Public key bundle of a remote device, as fetched from the directory. */
export interface RemoteDeviceBundle {
  deviceId: string;
  userId: string;
  suite: string;
  identityPublicKey: string;
  signedPrekeyId: number;
  signedPrekeyPublic: string;
  signedPrekeySignature: string;
  oneTimePrekey?: { prekeyId: number; publicKey: string } | undefined;
}

export interface SessionKeys {
  key: CryptoKey;
  /** base64 ephemeral public key that the recipient needs to derive the same key. */
  ephemeralPublicKey: string;
  salt: string;
  usedPrekeyId?: number | undefined;
}

/**
 * Establishes per-message / per-session key material.
 * The current implementation performs an ephemeral-ECDH handshake per message
 * (sender-side forward secrecy). A Double-Ratchet / MLS implementation can
 * replace it behind this same interface.
 */
export interface SessionManager {
  beginOutboundSession(remote: RemoteDeviceBundle): Promise<SessionKeys>;
  acceptInboundSession(header: MessageHeader): Promise<CryptoKey>;
}

export interface MessageHeader {
  suite: string;
  envelopeVersion: number;
  senderDeviceId: string;
  recipientDeviceId: string;
  senderIdentityKey: string;
  ephemeralPublicKey: string;
  salt: string;
  nonce: string;
  usedPrekeyId?: number | undefined;
  signature: string;
  /** Anti-replay: monotonic counter + random message id, both authenticated. */
  counter: number;
  messageId: string;
  sentAt: number;
}

export interface EncryptedEnvelope {
  header: MessageHeader;
  ciphertext: string;
}

export interface PlaintextMessage {
  body: string;
  sentAt: number;
}

export interface MessageEncryptor {
  encrypt(remote: RemoteDeviceBundle, message: PlaintextMessage): Promise<EncryptedEnvelope>;
}

export interface MessageDecryptor {
  decrypt(envelope: EncryptedEnvelope): Promise<PlaintextMessage>;
}
