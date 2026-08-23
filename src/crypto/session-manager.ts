/**
 * Session establishment.
 *
 * Current implementation: per-message ephemeral-ECDH handshake against the
 * recipient's signed pre-key plus (when available) a one-time pre-key.
 *   secret = ECDH(ephemeral, signedPrekey) || ECDH(ephemeral, oneTimePrekey)
 *   key    = HKDF-SHA256(secret, salt, info)
 *
 * Properties: fresh key per message, sender-side forward secrecy, one-time
 * pre-key binding. NOT a Double Ratchet — there is no receiving-chain ratchet
 * and no post-compromise recovery yet. See docs/CRYPTOGRAPHY.md.
 */
import { base64ToBytes, bytesToBase64, utf8ToBytes } from "@/lib/encoding";
import { cryptoProvider } from "./webcrypto-provider";
import { keyManager } from "./key-manager";
import type { MessageHeader, RemoteDeviceBundle, SessionKeys, SessionManager } from "./types";

const HKDF_INFO = "secure-messenger/v1/message-key";

class EphemeralEcdhSessionManager implements SessionManager {
  async beginOutboundSession(remote: RemoteDeviceBundle): Promise<SessionKeys> {
    // MITM protection: the signed pre-key must be signed by the claimed device
    // identity key before it is used for any key agreement.
    const signatureOk = await cryptoProvider.verify(
      remote.identityPublicKey,
      remote.signedPrekeySignature,
      utf8ToBytes(`${remote.suite}:${remote.signedPrekeyId}:${remote.signedPrekeyPublic}`),
    );
    if (!signatureOk) {
      throw new Error("Pre-key signature verification failed — refusing to encrypt");
    }

    const ephemeral = await cryptoProvider.generateAgreementKeyPair();
    const secrets = [await cryptoProvider.agree(ephemeral.privateKey, remote.signedPrekeyPublic)];
    if (remote.oneTimePrekey) {
      secrets.push(
        await cryptoProvider.agree(ephemeral.privateKey, remote.oneTimePrekey.publicKey),
      );
    }

    const salt = cryptoProvider.randomBytes(32);
    const key = await cryptoProvider.deriveAeadKey(secrets, salt, HKDF_INFO);

    return {
      key,
      ephemeralPublicKey: ephemeral.publicKeyBase64,
      salt: bytesToBase64(salt),
      usedPrekeyId: remote.oneTimePrekey?.prekeyId,
    };
  }

  async acceptInboundSession(header: MessageHeader): Promise<CryptoKey> {
    const signedPrekey = await keyManager.getSignedPrekeyPair();
    if (!signedPrekey) throw new Error("This device has no signed pre-key material");

    const secrets = [
      await cryptoProvider.agree(signedPrekey.privateKey, header.ephemeralPublicKey),
    ];

    if (typeof header.usedPrekeyId === "number") {
      const oneTime = await keyManager.getPrekeyPair(header.usedPrekeyId);
      if (!oneTime) {
        throw new Error("Referenced one-time pre-key is not available on this device");
      }
      secrets.push(await cryptoProvider.agree(oneTime.privateKey, header.ephemeralPublicKey));
    }

    return cryptoProvider.deriveAeadKey(secrets, base64ToBytes(header.salt), HKDF_INFO);
  }
}

export const sessionManager: SessionManager = new EphemeralEcdhSessionManager();
