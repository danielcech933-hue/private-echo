/**
 * CryptoProvider implementation on top of the platform WebCrypto API.
 *
 * Primitives (all standard, no custom constructions):
 *  - ECDSA P-256 / SHA-256  -> device identity signatures
 *  - ECDH  P-256            -> key agreement (signed pre-key, one-time pre-key, ephemeral)
 *  - HKDF  SHA-256          -> key derivation from agreed secrets
 *  - AES-256-GCM            -> authenticated encryption
 *
 * Limitation (documented, not hidden): this is a conservative interim suite.
 * It does not implement a Double Ratchet. See docs/CRYPTOGRAPHY.md.
 */
import { base64ToBytes, bytesToBase64, concatBytes, toBuffer, utf8ToBytes } from "@/lib/encoding";
import type { AeadCiphertext, CryptoProvider, CryptoSuiteId, KeyPairHandle } from "./types";

const SUITE: CryptoSuiteId = "webcrypto-p256-hkdf-aesgcm-v1";
const CURVE = "P-256";

function subtle(): SubtleCrypto {
  if (typeof globalThis.crypto?.subtle === "undefined") {
    throw new Error("WebCrypto is not available in this environment");
  }
  return globalThis.crypto.subtle;
}

async function toHandle(pair: CryptoKeyPair): Promise<KeyPairHandle> {
  const raw = await subtle().exportKey("raw", pair.publicKey);
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicKeyBase64: bytesToBase64(new Uint8Array(raw)),
  };
}

export class WebCryptoProvider implements CryptoProvider {
  readonly suite = SUITE;

  async generateSigningKeyPair(): Promise<KeyPairHandle> {
    const pair = (await subtle().generateKey({ name: "ECDSA", namedCurve: CURVE }, false, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    return toHandle(pair);
  }

  async generateAgreementKeyPair(): Promise<KeyPairHandle> {
    const pair = (await subtle().generateKey({ name: "ECDH", namedCurve: CURVE }, false, [
      "deriveBits",
    ])) as CryptoKeyPair;
    return toHandle(pair);
  }

  async sign(privateKey: CryptoKey, data: Uint8Array): Promise<string> {
    const sig = await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, toBuffer(data));
    return bytesToBase64(new Uint8Array(sig));
  }

  async verify(
    publicKeyBase64: string,
    signatureBase64: string,
    data: Uint8Array,
  ): Promise<boolean> {
    const key = await subtle().importKey(
      "raw",
      toBuffer(base64ToBytes(publicKeyBase64)),
      { name: "ECDSA", namedCurve: CURVE },
      false,
      ["verify"],
    );
    return subtle().verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      toBuffer(base64ToBytes(signatureBase64)),
      toBuffer(data),
    );
  }

  async agree(privateKey: CryptoKey, peerPublicKeyBase64: string): Promise<Uint8Array> {
    const peer = await subtle().importKey(
      "raw",
      toBuffer(base64ToBytes(peerPublicKeyBase64)),
      { name: "ECDH", namedCurve: CURVE },
      false,
      [],
    );
    const bits = await subtle().deriveBits({ name: "ECDH", public: peer }, privateKey, 256);
    return new Uint8Array(bits);
  }

  async deriveAeadKey(secrets: Uint8Array[], salt: Uint8Array, info: string): Promise<CryptoKey> {
    const material = await subtle().importKey("raw", toBuffer(concatBytes(...secrets)), "HKDF", false, [
      "deriveKey",
    ]);
    return subtle().deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: toBuffer(salt), info: toBuffer(utf8ToBytes(info)) },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async aeadEncrypt(
    key: CryptoKey,
    plaintext: Uint8Array,
    aad: Uint8Array,
  ): Promise<AeadCiphertext> {
    const nonce = this.randomBytes(12);
    const out = await subtle().encrypt(
      { name: "AES-GCM", iv: toBuffer(nonce), additionalData: toBuffer(aad), tagLength: 128 },
      key,
      toBuffer(plaintext),
    );
    return { ciphertext: bytesToBase64(new Uint8Array(out)), nonce: bytesToBase64(nonce) };
  }

  async aeadDecrypt(
    key: CryptoKey,
    payload: AeadCiphertext,
    aad: Uint8Array,
  ): Promise<Uint8Array> {
    const out = await subtle().decrypt(
      {
        name: "AES-GCM",
        iv: toBuffer(base64ToBytes(payload.nonce)),
        additionalData: toBuffer(aad),
        tagLength: 128,
      },
      key,
      toBuffer(base64ToBytes(payload.ciphertext)),
    );
    return new Uint8Array(out);
  }

  randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }

  async digest(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await subtle().digest("SHA-256", toBuffer(data)));
  }
}

export const cryptoProvider: CryptoProvider = new WebCryptoProvider();
