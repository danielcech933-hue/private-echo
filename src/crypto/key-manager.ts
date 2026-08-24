/**
 * Pre-key lifecycle and key rotation. Only public halves are ever returned to
 * callers that talk to the network.
 */
import { utf8ToBytes } from "@/lib/encoding";
import { KEY_IDS, VALUE_IDS, keyStore } from "./key-store";
import { cryptoProvider } from "./webcrypto-provider";
import type { KeyManager, KeyPairHandle, KeyStore } from "./types";

async function readCounter(store: KeyStore, id: string): Promise<number> {
  const raw = await store.getValue(id);
  return raw ? Number.parseInt(raw, 10) : 0;
}

class LocalKeyManager implements KeyManager {
  constructor(private readonly store: KeyStore) {}

  async rotateSignedPrekey() {
    const signing = await this.store.getKeyPair(KEY_IDS.identitySigning);
    if (!signing) throw new Error("No device identity: run device setup first");

    const prekey = await cryptoProvider.generateAgreementKeyPair();
    const signedPrekeyId = (await readCounter(this.store, VALUE_IDS.signedPrekeyId)) + 1;
    const keyVersion = (await readCounter(this.store, VALUE_IDS.keyVersion)) + 1;

    const signature = await cryptoProvider.sign(
      signing.privateKey,
      utf8ToBytes(`${cryptoProvider.suite}:${signedPrekeyId}:${prekey.publicKeyBase64}`),
    );

    await this.store.putKeyPair(KEY_IDS.signedPrekey, prekey);
    await this.store.putValue(VALUE_IDS.signedPrekeyId, String(signedPrekeyId));
    await this.store.putValue(VALUE_IDS.keyVersion, String(keyVersion));

    return {
      signedPrekeyId,
      signedPrekeyPublic: prekey.publicKeyBase64,
      signedPrekeySignature: signature,
      keyVersion,
    };
  }

  async generateOneTimePrekeys(count: number) {
    let counter = await readCounter(this.store, VALUE_IDS.prekeyCounter);
    const published: Array<{ prekeyId: number; publicKey: string }> = [];

    for (let i = 0; i < count; i += 1) {
      counter += 1;
      const pair = await cryptoProvider.generateAgreementKeyPair();
      await this.store.putKeyPair(KEY_IDS.oneTimePrekey(counter), pair);
      published.push({ prekeyId: counter, publicKey: pair.publicKeyBase64 });
    }

    await this.store.putValue(VALUE_IDS.prekeyCounter, String(counter));
    return published;
  }

  async getPrekeyPair(prekeyId: number): Promise<KeyPairHandle | null> {
    return this.store.getKeyPair(KEY_IDS.oneTimePrekey(prekeyId));
  }

  async getSignedPrekeyPair(): Promise<KeyPairHandle | null> {
    return this.store.getKeyPair(KEY_IDS.signedPrekey);
  }

  async getSigningKeyPair(): Promise<KeyPairHandle | null> {
    return this.store.getKeyPair(KEY_IDS.identitySigning);
  }

  async nextSendCounter(): Promise<number> {
    return this.store.updateValueAtomic(VALUE_IDS.sendCounter, (current) => {
      const previous = current ? Number.parseInt(current, 10) : 0;
      if (!Number.isSafeInteger(previous) || previous < 0) {
        throw new Error("Invalid local send counter state");
      }
      const next = previous + 1;
      if (!Number.isSafeInteger(next)) throw new Error("Local send counter exhausted");
      return { value: String(next), result: next };
    });
  }
}

export const keyManager = new LocalKeyManager(keyStore);
