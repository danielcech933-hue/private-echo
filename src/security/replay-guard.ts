/**
 * Replay / reorder protection for the receiving side.
 *
 * Freshness is checked without mutating state before decryption. The envelope
 * is only recorded atomically after successful authentication and decryption.
 */
import { keyStore } from "@/crypto/key-store";
import type { MessageHeader } from "@/crypto/types";

export const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;
const RECENT_IDS_KEPT = 256;

function replayStateKey(senderDeviceId: string): string {
  return `replay-state-${senderDeviceId}`;
}

interface ReplayState {
  highestCounter: number;
  recentIds: string[];
}

export class ReplayRejectedError extends Error {}

function parseState(current: string | null): ReplayState {
  if (!current) return { highestCounter: 0, recentIds: [] };
  try {
    const parsed = JSON.parse(current) as Partial<ReplayState>;
    return {
      highestCounter:
        Number.isSafeInteger(parsed.highestCounter) && parsed.highestCounter! >= 0
          ? parsed.highestCounter!
          : 0,
      recentIds: Array.isArray(parsed.recentIds)
        ? parsed.recentIds.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch {
    throw new ReplayRejectedError("Replay state is corrupt; refusing the envelope");
  }
}

function validateHeader(
  header: Pick<MessageHeader, "senderDeviceId" | "counter" | "messageId" | "sentAt">,
  now: number,
): void {
  if (!Number.isSafeInteger(header.counter) || header.counter <= 0) {
    throw new ReplayRejectedError("Message counter is invalid");
  }
  if (!header.messageId || header.messageId.length > 128) {
    throw new ReplayRejectedError("Message id is invalid");
  }
  if (Math.abs(now - header.sentAt) > MAX_CLOCK_SKEW_MS) {
    throw new ReplayRejectedError("Message timestamp is outside the accepted window");
  }
}

/** Checks local replay state without mutating it. */
export async function assertFreshEnvelope(
  header: Pick<MessageHeader, "senderDeviceId" | "counter" | "messageId" | "sentAt">,
  now: number = Date.now(),
): Promise<void> {
  validateHeader(header, now);
  const state = parseState(await keyStore.getValue(replayStateKey(header.senderDeviceId)));
  if (state.recentIds.includes(header.messageId)) {
    throw new ReplayRejectedError("Message id was already accepted (replay)");
  }
  if (header.counter <= state.highestCounter) {
    throw new ReplayRejectedError("Message counter is not newer than the last accepted one");
  }
}

/** Atomically records an envelope after it has been authenticated and decrypted. */
export async function recordAcceptedEnvelope(header: Pick<MessageHeader, "senderDeviceId" | "counter" | "messageId" | "sentAt">): Promise<void> {
  validateHeader(header, Date.now());

  await keyStore.updateValueAtomic(replayStateKey(header.senderDeviceId), (current) => {
    const state = parseState(current);
    if (state.recentIds.includes(header.messageId)) {
      throw new ReplayRejectedError("Message id was already accepted (replay)");
    }
    if (header.counter <= state.highestCounter) {
      throw new ReplayRejectedError("Message counter is not newer than the last accepted one");
    }

    const nextState: ReplayState = {
      highestCounter: header.counter,
      recentIds: [header.messageId, ...state.recentIds].slice(0, RECENT_IDS_KEPT),
    };
    return { value: JSON.stringify(nextState), result: undefined };
  });
}
