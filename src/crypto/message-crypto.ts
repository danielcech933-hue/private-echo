/**
 * Message encryption / decryption.
 *
 * The header is authenticated by AES-GCM AAD and by the sender device signature.
 * The receiving service separately binds the claimed sender identity key to the
 * device directory record before this module accepts the plaintext.
 */
import { bytesToUtf8, utf8ToBytes } from "@/lib/encoding";
import { cryptoProvider } from "./webcrypto-provider";
import { keyManager } from "./key-manager";
import { sessionManager } from "./session-manager";
import type {
  EncryptedEnvelope,
  MessageDecryptor,
  MessageEncryptor,
  MessageHeader,
  PlaintextMessage,
  RemoteDeviceBundle,
} from "./types";

export const ENVELOPE_VERSION = 1;

function headerToSignedBytes(header: Omit<MessageHeader, "signature">): Uint8Array {
  return utf8ToBytes(
    JSON.stringify({
      suite: header.suite,
      envelopeVersion: header.envelopeVersion,
      senderDeviceId: header.senderDeviceId,
      recipientDeviceId: header.recipientDeviceId,
      senderIdentityKey: header.senderIdentityKey,
      ephemeralPublicKey: header.ephemeralPublicKey,
      salt: header.salt,
      nonce: header.nonce,
      usedPrekeyId: header.usedPrekeyId ?? null,
      counter: header.counter,
      messageId: header.messageId,
      sentAt: header.sentAt,
    }),
  );
}

export function aadFor(header: Omit<MessageHeader, "signature" | "nonce">): Uint8Array {
  return utf8ToBytes(
    [
      header.suite,
      header.envelopeVersion,
      header.senderDeviceId,
      header.recipientDeviceId,
      header.senderIdentityKey,
      header.ephemeralPublicKey,
      header.salt,
      header.usedPrekeyId ?? "none",
      header.counter,
      header.messageId,
      header.sentAt,
    ].join("|"),
  );
}

class EnvelopeEncryptor implements MessageEncryptor {
  constructor(private readonly senderDeviceId: string) {}

  async encrypt(remote: RemoteDeviceBundle, message: PlaintextMessage): Promise<EncryptedEnvelope> {
    const signing = await keyManager.getSigningKeyPair();
    if (!signing) throw new Error("No device identity: run device setup first");

    const session = await sessionManager.beginOutboundSession(remote);
    const counter = await keyManager.nextSendCounter();
    const messageId = crypto.randomUUID();

    const base = {
      suite: cryptoProvider.suite,
      envelopeVersion: ENVELOPE_VERSION,
      senderDeviceId: this.senderDeviceId,
      recipientDeviceId: remote.deviceId,
      senderIdentityKey: signing.publicKeyBase64,
      ephemeralPublicKey: session.ephemeralPublicKey,
      salt: session.salt,
      usedPrekeyId: session.usedPrekeyId,
      counter,
      messageId,
      sentAt: message.sentAt,
    };

    const payload = await cryptoProvider.aeadEncrypt(
      session.key,
      utf8ToBytes(JSON.stringify({ body: message.body, sentAt: message.sentAt })),
      aadFor(base),
    );

    const unsigned = { ...base, nonce: payload.nonce };
    const signature = await cryptoProvider.sign(signing.privateKey, headerToSignedBytes(unsigned));

    return { header: { ...unsigned, signature }, ciphertext: payload.ciphertext };
  }
}

class EnvelopeDecryptor implements MessageDecryptor {
  async decrypt(envelope: EncryptedEnvelope): Promise<PlaintextMessage> {
    const { header, ciphertext } = envelope;

    if (header.envelopeVersion !== ENVELOPE_VERSION) {
      throw new Error(`Unsupported envelope version: ${header.envelopeVersion}`);
    }
    if (header.suite !== cryptoProvider.suite) {
      throw new Error(`Unsupported message crypto suite: ${header.suite}`);
    }

    const { signature, ...unsigned } = header;
    const signatureOk = await cryptoProvider.verify(
      header.senderIdentityKey,
      signature,
      headerToSignedBytes(unsigned),
    );
    if (!signatureOk) throw new Error("Envelope signature is invalid");

    const key = await sessionManager.acceptInboundSession(header);
    const plaintext = await cryptoProvider.aeadDecrypt(
      key,
      { ciphertext, nonce: header.nonce },
      aadFor(unsigned),
    );

    const parsed = JSON.parse(bytesToUtf8(plaintext)) as PlaintextMessage;
    if (typeof parsed.body !== "string" || typeof parsed.sentAt !== "number") {
      throw new Error("Decrypted message payload is malformed");
    }

    if (typeof header.usedPrekeyId === "number") {
      await keyManager.consumePrekey(header.usedPrekeyId);
    }

    return { body: parsed.body, sentAt: parsed.sentAt };
  }
}

export function createMessageEncryptor(senderDeviceId: string): MessageEncryptor {
  return new EnvelopeEncryptor(senderDeviceId);
}

export const messageDecryptor: MessageDecryptor = new EnvelopeDecryptor();
