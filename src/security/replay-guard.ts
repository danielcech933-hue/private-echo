/**
 * Replay / reorder protection (receiving side).
 *
 * The message header carries a monotonic per-sender-device counter, a random
 * message id and a timestamp — all covered by the ECDSA signature and by the
 * AEAD additional data. This guard is the enforcement half:
 *
 *  - a message id that was already accepted is rejected (exact replay)
 *  - a counter <= the highest counter accepted from that device is rejected
 *  - a timestamp too far from local time is rejected (stale / future replay)
 *
 * State is device-local (IndexedDB) — the server is never trusted for this.
 */
import { keyStore } from "@/crypto/key-store";
import type { MessageHeader } from "@/crypto/types";

export const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;
const RECENT_IDS_KEPT = 256;

function counterKey(senderDeviceId: string): string {
  return `replay-counter-${senderDeviceId}`;
}

const RECENT_IDS_KEY = "replay-recent-message-ids";

export class ReplayRejectedError extends Error {}

async function recentIds(): Promise<string[]> {
  const raw = await keyStore.getValue(RECENT_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Throws `ReplayRejectedError` when the envelope must not be accepted.
 * On success, records the message so the same envelope cannot be accepted twice.
 */
export async function assertFreshEnvelope(
  header: Pick<MessageHeader, "senderDeviceId" | "counter" | "messageId" | "sentAt">,
  now: number = Date.now(),
): Promise<void> {
  if (Math.abs(now - header.sentAt) > MAX_CLOCK_SKEW_MS) {
    throw new ReplayRejectedError("Message timestamp is outside the accepted window");
  }

  const seen = await recentIds();
  if (seen.includes(header.messageId)) {
    throw new ReplayRejectedError("Message id was already accepted (replay)");
  }

  const raw = await keyStore.getValue(counterKey(header.senderDeviceId));
  const highest = raw ? Number.parseInt(raw, 10) : 0;
  if (header.counter <= highest) {
    throw new ReplayRejectedError("Message counter is not newer than the last accepted one");
  }

  await keyStore.putValue(counterKey(header.senderDeviceId), String(header.counter));
  await keyStore.putValue(
    RECENT_IDS_KEY,
    JSON.stringify([header.messageId, ...seen].slice(0, RECENT_IDS_KEPT)),
  );
}

/** Local panic wipe helper: replay state lives in the same store as the keys. */
export async function resetReplayState(): Promise<void> {
  await keyStore.putValue(RECENT_IDS_KEY, "[]");
}
