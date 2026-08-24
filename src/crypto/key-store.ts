/**
 * Device-local key storage (IndexedDB).
 *
 * Private keys are stored as non-extractable `CryptoKey` objects. IndexedDB can
 * structured-clone a CryptoKey without exposing key bytes to application code.
 * Nothing from this module is uploaded.
 */
import type { KeyPairHandle, KeyStore } from "./types";

const DB_NAME = "secure-messenger-keystore";
const DB_VERSION = 1;
const KEYS_STORE = "key-pairs";
const VALUES_STORE = "values";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable: local key storage requires a browser"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEYS_STORE)) db.createObjectStore(KEYS_STORE);
      if (!db.objectStoreNames.contains(VALUES_STORE)) db.createObjectStore(VALUES_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open key store"));
  });
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(store, mode);
      const request = run(transaction.objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Key store operation failed"));
      transaction.onerror = () => reject(transaction.error ?? new Error("Key store transaction failed"));
    });
  } finally {
    db.close();
  }
}

interface StoredPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyBase64: string;
}

export class IndexedDbKeyStore implements KeyStore {
  async putKeyPair(id: string, pair: KeyPairHandle): Promise<void> {
    const record: StoredPair = {
      privateKey: pair.privateKey,
      publicKey: pair.publicKey,
      publicKeyBase64: pair.publicKeyBase64,
    };
    await tx<IDBValidKey>(KEYS_STORE, "readwrite", (s) => s.put(record, id));
  }

  async getKeyPair(id: string): Promise<KeyPairHandle | null> {
    const record = await tx<StoredPair | undefined>(KEYS_STORE, "readonly", (s) => s.get(id));
    return record ?? null;
  }

  async deleteKeyPair(id: string): Promise<void> {
    await tx<undefined>(KEYS_STORE, "readwrite", (s) => s.delete(id));
  }

  async putValue(id: string, value: string): Promise<void> {
    await tx<IDBValidKey>(VALUES_STORE, "readwrite", (s) => s.put(value, id));
  }

  async getValue(id: string): Promise<string | null> {
    const value = await tx<string | undefined>(VALUES_STORE, "readonly", (s) => s.get(id));
    return value ?? null;
  }

  /**
   * Atomically updates a value inside one IndexedDB read/write transaction.
   * This is required for monotonic counters and replay state so concurrent
   * tabs cannot observe and write the same previous value.
   */
  async updateValueAtomic<T>(
    id: string,
    updater: (current: string | null) => { value: string; result: T },
  ): Promise<T> {
    const db = await openDb();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(VALUES_STORE, "readwrite");
      const store = transaction.objectStore(VALUES_STORE);
      let result: T | undefined;
      let callbackError: unknown;

      const request = store.get(id);
      request.onsuccess = () => {
        try {
          const current = typeof request.result === "string" ? request.result : null;
          const next = updater(current);
          result = next.result;
          store.put(next.value, id);
        } catch (error) {
          callbackError = error;
          transaction.abort();
        }
      };

      request.onerror = () => {
        callbackError = request.error ?? new Error("Atomic key-store read failed");
        transaction.abort();
      };

      transaction.oncomplete = () => {
        db.close();
        if (callbackError) {
          reject(callbackError);
        } else if (result !== undefined) {
          resolve(result);
        } else {
          reject(new Error("Atomic key-store update produced no result"));
        }
      };

      transaction.onerror = () => {
        const error = callbackError ?? transaction.error ?? new Error("Atomic key-store transaction failed");
        db.close();
        reject(error);
      };

      transaction.onabort = () => {
        const error = callbackError ?? transaction.error ?? new Error("Atomic key-store transaction aborted");
        db.close();
        reject(error);
      };
    });
  }

  async wipe(): Promise<void> {
    await tx<undefined>(KEYS_STORE, "readwrite", (s) => s.clear());
    await tx<undefined>(VALUES_STORE, "readwrite", (s) => s.clear());
  }
}

export const keyStore: KeyStore = new IndexedDbKeyStore();

export const KEY_IDS = {
  identitySigning: "identity-signing",
  signedPrekey: "signed-prekey",
  oneTimePrekey: (prekeyId: number) => `one-time-prekey-${prekeyId}`,
} as const;

export const VALUE_IDS = {
  deviceId: "device-id",
  signedPrekeyId: "signed-prekey-id",
  keyVersion: "key-version",
  prekeyCounter: "prekey-counter",
  sendCounter: "send-counter",
  suite: "crypto-suite",
} as const;
