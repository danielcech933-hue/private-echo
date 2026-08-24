/**
 * Contact directory + verification records.
 *
 * Handles are the only public identifier — no phone-number or address-book
 * upload exists anywhere in this app.
 */
import { supabase } from "@/integrations/supabase/client";
import { fingerprintFor, fingerprintHash } from "@/crypto/identity-manager";

export interface DirectoryProfile {
  id: string;
  handle: string;
  displayName: string | null;
}

export interface ContactRow {
  id: string;
  contactUserId: string;
  handle: string;
  displayName: string | null;
  isBlocked: boolean;
  verifiedDevices: number;
}

export async function ensureProfile(handle: string, displayName?: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase
    .from("profiles")
    .insert({ id: userId, handle, display_name: displayName ?? null });
  if (error) throw error;
}

export async function getMyProfile(): Promise<DirectoryProfile | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, handle, display_name")
    .eq("id", userId)
    .maybeSingle();
  return data ? { id: data.id, handle: data.handle, displayName: data.display_name } : null;
}

export async function searchByHandle(handle: string): Promise<DirectoryProfile[]> {
  const query = handle.trim();
  if (query.length < 3) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, handle, display_name")
    .eq("discoverable", true)
    .ilike("handle", `%${query}%`)
    .limit(10);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
  }));
}

export async function listContacts(): Promise<ContactRow[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, contact_user_id, is_blocked, contact_verifications(id)")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  const ids = rows.map((row) => row.contact_user_id);
  const profiles = ids.length
    ? ((await supabase.from("profiles").select("id, handle, display_name").in("id", ids)).data ?? [])
    : [];

  return rows.map((row) => {
    const profile = profiles.find((item) => item.id === row.contact_user_id);
    return {
      id: row.id,
      contactUserId: row.contact_user_id,
      handle: profile?.handle ?? "unknown",
      displayName: profile?.display_name ?? null,
      isBlocked: row.is_blocked,
      verifiedDevices: (row.contact_verifications ?? []).length,
    };
  });
}

export async function addContact(contactUserId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const owner = auth.user?.id;
  if (!owner) throw new Error("Not signed in");
  if (owner === contactUserId) throw new Error("You cannot add yourself");

  const { error } = await supabase
    .from("contacts")
    .insert({ owner_id: owner, contact_user_id: contactUserId });
  if (error && error.code !== "23505") throw error;
}

export async function setContactBlocked(contactId: string, blocked: boolean): Promise<void> {
  const { error } = await supabase
    .from("contacts")
    .update({ is_blocked: blocked })
    .eq("id", contactId);
  if (error) throw error;
}

export interface ContactDeviceFingerprint {
  deviceId: string;
  deviceName: string;
  identityPublicKey: string;
  fingerprint: string;
  verified: boolean;
}

/** Fingerprints a contact's devices so the user can compare them out-of-band. */
export async function listContactDeviceFingerprints(
  contactId: string,
  contactUserId: string,
): Promise<ContactDeviceFingerprint[]> {
  const { data, error } = await supabase
    .from("devices")
    .select("id, device_name, identity_public_key")
    .eq("user_id", contactUserId)
    .eq("status", "active");
  if (error) throw error;

  const { data: verifications } = await supabase
    .from("contact_verifications")
    .select("verified_device_id")
    .eq("contact_id", contactId);
  const verifiedIds = new Set((verifications ?? []).map((row) => row.verified_device_id));

  return Promise.all(
    (data ?? []).map(async (device) => ({
      deviceId: device.id,
      deviceName: device.device_name,
      identityPublicKey: device.identity_public_key,
      fingerprint: await fingerprintFor(device.identity_public_key),
      verified: verifiedIds.has(device.id),
    })),
  );
}

/** Records a manual (out-of-band) verification of one contact device. */
export async function markDeviceVerified(
  contactId: string,
  device: ContactDeviceFingerprint,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const verifier = auth.user?.id;
  if (!verifier) throw new Error("Not signed in");

  const { error } = await supabase.from("contact_verifications").insert({
    contact_id: contactId,
    verifier_user_id: verifier,
    verified_device_id: device.deviceId,
    method: "numeric_compare",
    fingerprint_hash: await fingerprintHash(device.identityPublicKey),
  });
  if (error) throw error;
}
