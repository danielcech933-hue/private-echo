/**
 * Device identity: created on-device, private half never leaves the device.
 */
import { bytesToBase64, utf8ToBytes } from "@/lib/encoding";
import { KEY_IDS, VALUE_IDS, keyStore } from "./key-store";
import { cryptoProvider } from "./webcrypto-provider";
import { keyManager } from "./key-manager";
import type { DeviceRegistrationBundle, IdentityManager, KeyStore } from "./types";

export const INITIAL_ONE_TIME_PREKEYS = 32;

class LocalIdentityManager implements IdentityManager {
  constructor(private readonly store: KeyStore) {}

  async hasLocalIdentity(): Promise<boolean> {
    return (await this.store.getKeyPair(KEY_IDS.identitySigning)) !== null;
  }

  async createLocalIdentity(): Promise<DeviceRegistrationBundle> {
    const signing = await cryptoProvider.generateSigningKeyPair();
    await this.store.putKeyPair(KEY_IDS.identitySigning, signing);
    await this.store.putValue(VALUE_IDS.suite, cryptoProvider.suite);
    await this.store.putValue(VALUE_IDS.keyVersion, "1");
    await this.store.putValue(VALUE_IDS.sendCounter, "0");

    const signedPrekey = await keyManager.rotateSignedPrekey();
    const oneTimePrekeys = await keyManager.generateOneTimePrekeys(INITIAL_ONE_TIME_PREKEYS);

    return {
      suite: cryptoProvider.suite,
      identityPublicKey: signing.publicKeyBase64,
      signedPrekeyId: signedPrekey.signedPrekeyId,
      signedPrekeyPublic: signedPrekey.signedPrekeyPublic,
      signedPrekeySignature: signedPrekey.signedPrekeySignature,
      keyVersion: signedPrekey.keyVersion,
      oneTimePrekeys,
    };
  }

  /**
   * Fingerprint = SHA-256 of the device identity public key, rendered as
   * grouped decimal digits ("safety number" style) for human comparison.
   */
  async getIdentityFingerprint(): Promise<string | null> {
    const signing = await this.store.getKeyPair(KEY_IDS.identitySigning);
    if (!signing) return null;
    return fingerprintFor(signing.publicKeyBase64);
  }

  async wipeLocalIdentity(): Promise<void> {
    await this.store.wipe();
  }
}

export async function fingerprintFor(identityPublicKeyBase64: string): Promise<string> {
  const digest = await cryptoProvider.digest(utf8ToBytes(identityPublicKeyBase64));
  const groups: string[] = [];
  for (let i = 0; i < 12; i += 2) {
    const value = ((digest[i] ?? 0) << 8) | (digest[i + 1] ?? 0);
    groups.push(value.toString().padStart(5, "0"));
  }
  return groups.join(" ");
}

export async function fingerprintHash(identityPublicKeyBase64: string): Promise<string> {
  return bytesToBase64(await cryptoProvider.digest(utf8ToBytes(identityPublicKeyBase64)));
}

export const identityManager: IdentityManager = new LocalIdentityManager(keyStore);
