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

function defaultDeviceName(): string {
  if (typeof navigator === "undefined") return "Web device";
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android browser";
  if (/iPhone|iPad/i.test(ua)) return "iOS browser";
  if (/Mac/i.test(ua)) return "Mac browser";
  if (/Windows/i.test(ua)) return "Windows browser";
  return "Web device";
}

/** Returns the registered device for this browser, or null if setup is needed. */
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

/**
 * Creates the device identity locally and publishes only its public bundle.
 */
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

  await keyStore.putValue(VALUE_IDS.deviceId, device.id);
  await publishPrekeys(device.id, bundle.oneTimePrekeys);

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

/** Tops up the published one-time pre-keys when the pool runs low. */
export async function replenishPrekeys(deviceId: string, minimum = 10, batch = 32): Promise<void> {
  const { count } = await supabase
    .from("device_prekeys")
    .select("id", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .is("consumed_at", null);
  if ((count ?? 0) >= minimum) return;
  await publishPrekeys(deviceId, await keyManager.generateOneTimePrekeys(batch));
}

/** Marks this device revoked. Key material is wiped locally as well. */
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

/**
 * Fetches recipient device bundles and claims one one-time pre-key per device.
 * A missing one-time pre-key degrades to signed-pre-key-only agreement rather
 * than failing the send.
 */
export async function fetchDeviceBundles(userIds: string[]): Promise<RemoteDeviceBundle[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from("devices")
    .select(
      "id, user_id, crypto_suite, identity_public_key, signed_prekey_id, signed_prekey_public, signed_prekey_signature",
    )
    .in("user_id", userIds)
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
      oneTimePrekey: await claimOneTimePrekey(device.id),
    })),
  );
}

async function claimOneTimePrekey(
  deviceId: string,
): Promise<{ prekeyId: number; publicKey: string } | undefined> {
  const { data } = await supabase
    .from("device_prekeys")
    .select("id, prekey_id, public_key")
    .eq("device_id", deviceId)
    .is("consumed_at", null)
    .limit(1)
    .maybeSingle();
  if (!data) return undefined;

  const consumer = await keyStore.getValue(VALUE_IDS.deviceId);
  await supabase
    .from("device_prekeys")
    .update({ consumed_at: new Date().toISOString(), consumed_by_device: consumer })
    .eq("id", data.id)
    .is("consumed_at", null);

  return { prekeyId: data.prekey_id, publicKey: data.public_key };
}
