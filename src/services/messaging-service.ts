/**
 * Conversation + message access.
 *
 * The server only ever receives ciphertext and a routing header. Plaintext
 * exists solely inside this module's callers, in memory, on the device.
 */
import { supabase } from "@/integrations/supabase/client";
import { createMessageEncryptor, messageDecryptor } from "@/crypto/message-crypto";
import type { EncryptedEnvelope, MessageHeader } from "@/crypto/types";
import { assertFreshEnvelope, recordAcceptedEnvelope, ReplayRejectedError } from "@/security/replay-guard";
import { cryptoProvider } from "@/crypto/webcrypto-provider";
import { fetchDeviceBundles, replenishPrekeys } from "./device-service";

export interface ConversationSummary {
  id: string;
  kind: "direct" | "group";
  createdAt: string;
  memberUserIds: string[];
}

export interface DecryptedMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  sentAt: number;
  body: string | null;
  failure?: string;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, kind, created_at, conversation_members(user_id, removed_at)")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    memberUserIds: (row.conversation_members ?? [])
      .filter((member) => member.removed_at === null)
      .map((member) => member.user_id),
  }));
}

export async function getOrCreateDirectConversation(otherUserId: string): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error("Not signed in");

  const existing = await listConversations();
  const match = existing.find(
    (conversation) =>
      conversation.kind === "direct" &&
      conversation.memberUserIds.length === 2 &&
      conversation.memberUserIds.includes(me) &&
      conversation.memberUserIds.includes(otherUserId),
  );
  if (match) return match.id;

  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({ kind: "direct", created_by: me })
    .select("id")
    .single();
  if (error) throw error;

  const { error: memberError } = await supabase.from("conversation_members").insert([
    { conversation_id: conversation.id, user_id: me, role: "admin" },
    { conversation_id: conversation.id, user_id: otherUserId, role: "member" },
  ]);
  if (memberError) throw memberError;

  return conversation.id;
}

export async function sendMessage(
  conversationId: string,
  senderDeviceId: string,
  body: string,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error("Not signed in");
  if (!body.trim()) throw new Error("Message body cannot be empty");

  const { data: senderDevice, error: senderDeviceError } = await supabase
    .from("devices")
    .select("id, user_id, status, crypto_suite")
    .eq("id", senderDeviceId)
    .maybeSingle();
  if (senderDeviceError) throw senderDeviceError;
  if (!senderDevice || senderDevice.user_id !== me || senderDevice.status !== "active") {
    throw new Error("Sender device is invalid or revoked");
  }
  if (senderDevice.crypto_suite !== cryptoProvider.suite) {
    throw new Error(`Unsupported sender crypto suite: ${senderDevice.crypto_suite}`);
  }

  const { data: members, error: memberError } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .is("removed_at", null);
  if (memberError) throw memberError;

  const userIds = [...new Set((members ?? []).map((member) => member.user_id))];
  const bundles = await fetchDeviceBundles(userIds, conversationId);
  if (bundles.length === 0) throw new Error("No active recipient device has published keys yet");

  const encryptor = createMessageEncryptor(senderDeviceId);
  const sentAt = Date.now();

  const rows = await Promise.all(
    bundles.map(async (bundle) => {
      const envelope = await encryptor.encrypt(bundle, { body, sentAt });
      return {
        conversation_id: conversationId,
        sender_user_id: me,
        sender_device_id: senderDeviceId,
        recipient_device_id: bundle.deviceId,
        envelope_version: envelope.header.envelopeVersion,
        ciphertext: envelope.ciphertext,
        encrypted_metadata: JSON.stringify(envelope.header),
      };
    }),
  );

  const { data: inserted, error } = await supabase.from("messages").insert(rows).select("id");
  if (error) throw error;

  const { error: deliveryError } = await supabase.from("message_delivery").insert(
    (inserted ?? []).map((row, index) => ({
      message_id: row.id,
      recipient_device_id: rows[index]!.recipient_device_id,
      status: "sent" as const,
    })),
  );
  if (deliveryError) throw deliveryError;

  await replenishPrekeys(senderDeviceId);
}

export async function loadMessages(
  conversationId: string,
  localDeviceId: string,
): Promise<DecryptedMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_user_id, sender_device_id, recipient_device_id, ciphertext, encrypted_metadata, created_at",
    )
    .eq("conversation_id", conversationId)
    .eq("recipient_device_id", localDeviceId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const senderDeviceIds = [...new Set((data ?? []).map((row) => row.sender_device_id))];
  const { data: senderDevices, error: senderDevicesError } = senderDeviceIds.length
    ? await supabase
        .from("devices")
        .select("id, user_id, identity_public_key, status, crypto_suite")
        .in("id", senderDeviceIds)
    : { data: [], error: null };
  if (senderDevicesError) throw senderDevicesError;

  const deviceDirectory = new Map((senderDevices ?? []).map((device) => [device.id, device]));
  const results: DecryptedMessage[] = [];

  for (const row of data ?? []) {
    const base = {
      id: row.id,
      conversationId: row.conversation_id,
      senderUserId: row.sender_user_id,
      sentAt: new Date(row.created_at).getTime(),
    };

    try {
      const header = JSON.parse(row.encrypted_metadata ?? "null") as MessageHeader | null;
      if (!header) throw new Error("Envelope header is missing");

      const directoryDevice = deviceDirectory.get(row.sender_device_id);
      if (!directoryDevice || directoryDevice.status !== "active") {
        throw new Error("Sender device is not active");
      }
      if (directoryDevice.user_id !== row.sender_user_id) {
        throw new Error("Sender device/user binding is invalid");
      }
      if (header.senderDeviceId !== row.sender_device_id) {
        throw new Error("Envelope sender device does not match database routing");
      }
      if (header.recipientDeviceId !== localDeviceId || row.recipient_device_id !== localDeviceId) {
        throw new Error("Envelope recipient device does not match this device");
      }
      if (header.senderIdentityKey !== directoryDevice.identity_public_key) {
        throw new Error("Sender identity key does not match the registered device identity");
      }
      if (header.suite !== directoryDevice.crypto_suite || header.suite !== cryptoProvider.suite) {
        throw new Error("Sender crypto suite is unsupported or mismatched");
      }

      const envelope: EncryptedEnvelope = { header, ciphertext: row.ciphertext };
      await assertFreshEnvelope(header);
      const plaintext = await messageDecryptor.decrypt(envelope);
      await recordAcceptedEnvelope(header);
      results.push({ ...base, body: plaintext.body, sentAt: plaintext.sentAt });
    } catch (error) {
      results.push({
        ...base,
        body: null,
        failure:
          error instanceof ReplayRejectedError
            ? "Rejected by replay protection"
            : error instanceof Error
              ? error.message
              : "Cannot decrypt on this device",
      });
    }
  }
  return results;
}

export function subscribeToConversation(conversationId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`messages-${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
