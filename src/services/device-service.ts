/**
 * Device registration / directory access.
 *
 * Only public key material crosses this boundary. Private keys stay in the
 * device-local key store and are never part of any payload built here.
 */
import { supabase } from "@/integrations/supabase/client";
import { identityManager } from "@/crypto/identity-manager";
import { keyManager } from "@/crypto/key-manager";
import { VALUE_IDS, keyStore } from "@/crypto/key-store";
import type { RemoteDeviceBundle } from "@/crypto/types";

export interface LocalDevice {
  deviceId: string;
  fingerprint: string;
}

type ClaimPrekeyResponse = {
  data: Array<{ prekey_id: number; public_key: string }> | null;
  error: Error | null;
};

type ClaimPrekeyRpc = {
  rpc: (
    name: "claim_one_time_prekey",
    args: {
      _device_id: string;
      _consumer_device_id: string;
      _conversation_id: string;
    },
  ) => Promise<ClaimPrekeyResponse>;
};

function defaultDeviceName(): string {
  if (typeof navigator === "undefined") return "Web device";
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android browser";
  if (/iPhone|iPad/i.test(ua)) return "iOS browser";
  if (/Mac/i.test(ua)) return "Mac browser";
  if (/Windows/i.test(ua)) return "Windows browser";
  return "Web device";
}

export async function getLocalDevice(): Promise<LocalDevice | null> {
  const deviceId = await keyStore.getValue(VALUE_IDS.deviceId);
  if (!deviceId) return null;
  if (!(await identityManager.hasLocalIdentity())) return null;

  const { data } = await supabase
    .from("devices")
    .select("id, status")
    .eq("id", deviceId)
    .maybeSingle();
  if (!data || data.status !== "active") return null;

  const fingerprint = await identityManager.getIdentityFingerprint();
  return fingerprint ? { deviceId, fingerprint } : null;
}

export async function registerLocalDevice(deviceName?: string): Promise<LocalDevice> {
  const existing = await getLocalDevice();
  if (existing) return existing;

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sign in before registering a device");

  const bundle = await identityManager.createLocalIdentity();

  const { data: device, error } = await supabase
    .from("devices")
    .insert({
      user_id: userId,
      device_name: deviceName?.trim() || defaultDeviceName(),
      platform: "web",
      identity_public_key: bundle.identityPublicKey,
      signed_prekey_public: bundle.signedPrekeyPublic,
      signed_prekey_signature: bundle.signedPrekeySignature,
      signed_prekey_id: bundle.signedPrekeyId,
      key_version: bundle.keyVersion,
      crypto_suite: bundle.suite,
    })
    .select("id")
    .single();
  if (error) throw error;

  try {
    await keyStore.putValue(VALUE_IDS.deviceId, device.id);
    await publishPrekeys(device.id, bundle.oneTimePrekeys);
  } catch (error) {
    await supabase
      .from("devices")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", device.id);
    await identityManager.wipeLocalIdentity();
    throw error;
  }

  const fingerprint = (await identityManager.getIdentityFingerprint()) ?? "";
  return { deviceId: device.id, fingerprint };
}

export async function publishPrekeys(
  deviceId: string,
  prekeys: Array<{ prekeyId: number; publicKey: string }>,
): Promise<void> {
  if (prekeys.length === 0) return;
  const { error } = await supabase.from("device_prekeys").insert(
    prekeys.map((prekey) => ({
      device_id: deviceId,
      prekey_id: prekey.prekeyId,
      public_key: prekey.publicKey,
    })),
  );
  if (error) throw error;
}

export async function replenishPrekeys(deviceId: string, minimum = 10, batch = 32): Promise<void> {
  const { count } = await supabase
    .from("device_prekeys")
    .select("id", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .is("consumed_at", null);
  if ((count ?? 0) >= minimum) return;
  await publishPrekeys(deviceId, await keyManager.generateOneTimePrekeys(batch));
}

export async function revokeLocalDevice(): Promise<void> {
  const deviceId = await keyStore.getValue(VALUE_IDS.deviceId);
  if (deviceId) {
    await supabase
      .from("devices")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", deviceId);
  }
  await identityManager.wipeLocalIdentity();
}

export async function fetchDeviceBundles(
  userIds: string[],
  conversationId: string,
): Promise<RemoteDeviceBundle[]> {
  if (userIds.length === 0) return [];

  const { data: membership, error: membershipError } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .is("removed_at", null);
  if (membershipError) throw membershipError;

  const memberIds = new Set((membership ?? []).map((member) => member.user_id));
  const eligibleUserIds = userIds.filter((userId) => memberIds.has(userId));
  if (eligibleUserIds.length === 0) return [];

  const { data, error } = await supabase
    .from("devices")
    .select(
      "id, user_id, crypto_suite, identity_public_key, signed_prekey_id, signed_prekey_public, signed_prekey_signature",
    )
    .in("user_id", eligibleUserIds)
    .eq("status", "active");
  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (device) => ({
      deviceId: device.id,
      userId: device.user_id,
      suite: device.crypto_suite,
      identityPublicKey: device.identity_public_key,
      signedPrekeyId: device.signed_prekey_id,
      signedPrekeyPublic: device.signed_prekey_public,
      signedPrekeySignature: device.signed_prekey_signature,
      oneTimePrekey: await claimOneTimePrekey(device.id, conversationId),
    })),
  );
}

async function claimOneTimePrekey(
  deviceId: string,
  conversationId: string,
): Promise<{ prekeyId: number; publicKey: string } | undefined> {
  const consumer = await keyStore.getValue(VALUE_IDS.deviceId);
  if (!consumer) throw new Error("Local device identity is missing");

  const { data, error } = await (supabase as unknown as ClaimPrekeyRpc).rpc(
    "claim_one_time_prekey",
    {
      _device_id: deviceId,
      _consumer_device_id: consumer,
      _conversation_id: conversationId,
    },
  );
  if (error) throw error;

  const row = data?.[0];
  return row ? { prekeyId: row.prekey_id, publicKey: row.public_key } : undefined;
}
