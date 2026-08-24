/**
 * Replay / reorder protection (receiving side).
 *
 * Acceptance state is device-local in IndexedDB. The counter and recent-ID
 * record are updated atomically so concurrent tabs cannot both accept the same
 * envelope or advance the sender counter from the same previous value.
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

export async function assertFreshEnvelope(
  header: Pick<MessageHeader, "senderDeviceId" | "counter" | "messageId" | "sentAt">,
  now: number = Date.now(),
): Promise<void> {
  if (!Number.isSafeInteger(header.counter) || header.counter <= 0) {
    throw new ReplayRejectedError("Message counter is invalid");
  }

  if (!header.messageId || header.messageId.length > 128) {
    throw new ReplayRejectedError("Message id is invalid");
  }

  if (Math.abs(now - header.sentAt) > MAX_CLOCK_SKEW_MS) {
    throw new ReplayRejectedError("Message timestamp is outside the accepted window");
  }

  await keyStore.updateValueAtomic(replayStateKey(header.senderDeviceId), (current) => {
    let state: ReplayState = { highestCounter: 0, recentIds: [] };
    if (current) {
      try {
        const parsed = JSON.parse(current) as Partial<ReplayState>;
        if (Number.isSafeInteger(parsed.highestCounter) && parsed.highestCounter! >= 0) {
          state.highestCounter = parsed.highestCounter!;
        }
        if (Array.isArray(parsed.recentIds)) {
          state.recentIds = parsed.recentIds.filter((value): value is string => typeof value === "string");
        }
      } catch {
        throw new ReplayRejectedError("Replay state is corrupt; refusing the envelope");
      }
    }

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
