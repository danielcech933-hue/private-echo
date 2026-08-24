/**
 * Cryptographic abstraction layer — interfaces only.
 *
 * Nothing in this file knows about React, Supabase or the UI.
 * The concrete provider is intentionally replaceable: the goal is to swap the
 * current WebCrypto implementation for an audited library / protocol
 * implementation without touching UI or data access code.
 */

export type CryptoSuiteId = "webcrypto-p256-hkdf-aesgcm-v1";

export interface PublicKeyMaterial {
  publicKey: string;
}

export interface KeyPairHandle {
  /** Never serialised, never sent to the server. */
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyBase64: string;
}

export interface AeadCiphertext {
  ciphertext: string;
  nonce: string;
}

export interface CryptoProvider {
  readonly suite: CryptoSuiteId;
  generateSigningKeyPair(): Promise<KeyPairHandle>;
  generateAgreementKeyPair(): Promise<KeyPairHandle>;
  sign(privateKey: CryptoKey, data: Uint8Array): Promise<string>;
  verify(publicKeyBase64: string, signatureBase64: string, data: Uint8Array): Promise<boolean>;
  agree(privateKey: CryptoKey, peerPublicKeyBase64: string): Promise<Uint8Array>;
  deriveAeadKey(secrets: Uint8Array[], salt: Uint8Array, info: string): Promise<CryptoKey>;
  aeadEncrypt(key: CryptoKey, plaintext: Uint8Array, aad: Uint8Array): Promise<AeadCiphertext>;
  aeadDecrypt(key: CryptoKey, payload: AeadCiphertext, aad: Uint8Array): Promise<Uint8Array>;
  randomBytes(length: number): Uint8Array;
  digest(data: Uint8Array): Promise<Uint8Array>;
}

export interface KeyStore {
  putKeyPair(id: string, pair: KeyPairHandle): Promise<void>;
  getKeyPair(id: string): Promise<KeyPairHandle | null>;
  deleteKeyPair(id: string): Promise<void>;
  putValue(id: string, value: string): Promise<void>;
  getValue(id: string): Promise<string | null>;
  /** Atomically transforms one value in a single IndexedDB transaction. */
  updateValueAtomic<T>(
    id: string,
    updater: (current: string | null) => { value: string; result: T },
  ): Promise<T>;
  /** Local panic wipe: removes all device key material and local state. */
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

export interface DeviceRegistrationBundle {
  suite: CryptoSuiteId;
  identityPublicKey: string;
  signedPrekeyId: number;
  signedPrekeyPublic: string;
  signedPrekeySignature: string;
  keyVersion: number;
  oneTimePrekeys: Array<{ prekeyId: number; publicKey: string }>;
}

export interface IdentityManager {
  hasLocalIdentity(): Promise<boolean>;
  createLocalIdentity(): Promise<DeviceRegistrationBundle>;
  getIdentityFingerprint(): Promise<string | null>;
  wipeLocalIdentity(): Promise<void>;
}

export interface KeyManager {
  rotateSignedPrekey(): Promise<{
    signedPrekeyId: number;
    signedPrekeyPublic: string;
    signedPrekeySignature: string;
    keyVersion: number;
  }>;
  generateOneTimePrekeys(count: number): Promise<Array<{ prekeyId: number; publicKey: string }>>;
  getPrekeyPair(prekeyId: number): Promise<KeyPairHandle | null>;
  getSignedPrekeyPair(): Promise<KeyPairHandle | null>;
  getSigningKeyPair(): Promise<KeyPairHandle | null>;
}

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
  ephemeralPublicKey: string;
  salt: string;
  usedPrekeyId?: number | undefined;
}

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
