-- ============================================================
-- Privacy-first secure messenger: core schema
-- Server stores CIPHERTEXT ONLY. No private keys, no plaintext.
-- ============================================================

CREATE TYPE public.device_status AS ENUM ('active', 'revoked');
CREATE TYPE public.conversation_kind AS ENUM ('direct', 'group');
CREATE TYPE public.member_role AS ENUM ('member', 'admin');
CREATE TYPE public.delivery_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE public.verification_method AS ENUM ('qr_scan', 'numeric_compare', 'manual');

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ------------------------------------------------------------
-- profiles (minimal identity metadata; no PII beyond handle)
-- ------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_]{3,32}$'),
  display_name TEXT,
  discoverable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- devices (public key material only)
-- ------------------------------------------------------------
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  identity_public_key TEXT NOT NULL,
  signed_prekey_public TEXT NOT NULL,
  signed_prekey_signature TEXT NOT NULL,
  signed_prekey_id INTEGER NOT NULL DEFAULT 1,
  key_version INTEGER NOT NULL DEFAULT 1,
  crypto_suite TEXT NOT NULL DEFAULT 'placeholder-v0',
  status public.device_status NOT NULL DEFAULT 'active',
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX devices_user_idx ON public.devices(user_id) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices_select_authenticated" ON public.devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "devices_insert_own" ON public.devices FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "devices_update_own" ON public.devices FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER devices_touch BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.owns_device(_device_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.devices d WHERE d.id = _device_id AND d.user_id = auth.uid());
$$;

-- ------------------------------------------------------------
-- device_prekeys (one-time prekeys, public part only)
-- ------------------------------------------------------------
CREATE TABLE public.device_prekeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  prekey_id INTEGER NOT NULL,
  public_key TEXT NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_by_device UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, prekey_id)
);
CREATE INDEX device_prekeys_available_idx ON public.device_prekeys(device_id) WHERE consumed_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_prekeys TO authenticated;
GRANT ALL ON public.device_prekeys TO service_role;
ALTER TABLE public.device_prekeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prekeys_select_authenticated" ON public.device_prekeys FOR SELECT TO authenticated USING (true);
CREATE POLICY "prekeys_insert_own_device" ON public.device_prekeys FOR INSERT TO authenticated WITH CHECK (public.owns_device(device_id));
CREATE POLICY "prekeys_delete_own_device" ON public.device_prekeys FOR DELETE TO authenticated USING (public.owns_device(device_id));
-- consuming a prekey: any authenticated device may mark an unconsumed key as used
CREATE POLICY "prekeys_consume" ON public.device_prekeys FOR UPDATE TO authenticated
  USING (consumed_at IS NULL OR public.owns_device(device_id))
  WITH CHECK (true);

-- ------------------------------------------------------------
-- contacts + verification
-- ------------------------------------------------------------
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_alias TEXT,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, contact_user_id),
  CHECK (owner_id <> contact_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_own" ON public.contacts FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER contacts_touch BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.contact_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  verifier_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verified_device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  method public.verification_method NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, verified_device_id, fingerprint_hash)
);
GRANT SELECT, INSERT, DELETE ON public.contact_verifications TO authenticated;
GRANT ALL ON public.contact_verifications TO service_role;
ALTER TABLE public.contact_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verifications_own" ON public.contact_verifications FOR ALL TO authenticated
  USING (verifier_user_id = auth.uid()) WITH CHECK (verifier_user_id = auth.uid());

-- ------------------------------------------------------------
-- conversations
-- ------------------------------------------------------------
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.conversation_kind NOT NULL DEFAULT 'direct',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_metadata TEXT,
  key_epoch INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER conversations_touch BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.member_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  joined_key_epoch INTEGER NOT NULL DEFAULT 1,
  UNIQUE (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON public.conversation_members(user_id) WHERE removed_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_members TO authenticated;
GRANT ALL ON public.conversation_members TO service_role;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_member(_conversation_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = _conversation_id
      AND m.user_id = auth.uid()
      AND m.removed_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_admin(_conversation_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = _conversation_id
      AND m.user_id = auth.uid()
      AND m.removed_at IS NULL
      AND m.role = 'admin'
  );
$$;

CREATE POLICY "conversations_select_members" ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id) OR created_by = auth.uid());
CREATE POLICY "conversations_insert_creator" ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "conversations_update_admin" ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_conversation_admin(id) OR created_by = auth.uid())
  WITH CHECK (public.is_conversation_admin(id) OR created_by = auth.uid());

CREATE POLICY "members_select_same_conversation" ON public.conversation_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_conversation_member(conversation_id));
CREATE POLICY "members_insert" ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_conversation_admin(conversation_id)
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
  );
CREATE POLICY "members_update_admin" ON public.conversation_members FOR UPDATE TO authenticated
  USING (public.is_conversation_admin(conversation_id) OR user_id = auth.uid())
  WITH CHECK (public.is_conversation_admin(conversation_id) OR user_id = auth.uid());
CREATE POLICY "members_delete_self_or_admin" ON public.conversation_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_conversation_admin(conversation_id));

-- ------------------------------------------------------------
-- messages: CIPHERTEXT ONLY (one row per recipient device)
-- ------------------------------------------------------------
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  recipient_device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  envelope_version INTEGER NOT NULL DEFAULT 1,
  ciphertext TEXT NOT NULL,
  encrypted_metadata TEXT,
  key_epoch INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX messages_conversation_idx ON public.messages(conversation_id, created_at DESC);
CREATE INDEX messages_recipient_idx ON public.messages(recipient_device_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_message(_message_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.devices d ON d.id = m.recipient_device_id
    WHERE m.id = _message_id AND (m.sender_user_id = auth.uid() OR d.user_id = auth.uid())
  );
$$;

CREATE POLICY "messages_select_endpoints" ON public.messages FOR SELECT TO authenticated
  USING (
    sender_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.devices d WHERE d.id = recipient_device_id AND d.user_id = auth.uid())
  );
CREATE POLICY "messages_insert_sender" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND public.owns_device(sender_device_id)
    AND public.is_conversation_member(conversation_id)
  );
CREATE POLICY "messages_delete_endpoints" ON public.messages FOR DELETE TO authenticated
  USING (
    sender_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.devices d WHERE d.id = recipient_device_id AND d.user_id = auth.uid())
  );

CREATE TABLE public.message_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  recipient_device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  status public.delivery_status NOT NULL DEFAULT 'pending',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, recipient_device_id)
);
GRANT SELECT, INSERT, UPDATE ON public.message_delivery TO authenticated;
GRANT ALL ON public.message_delivery TO service_role;
ALTER TABLE public.message_delivery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delivery_select_endpoints" ON public.message_delivery FOR SELECT TO authenticated
  USING (public.can_read_message(message_id));
CREATE POLICY "delivery_insert_endpoints" ON public.message_delivery FOR INSERT TO authenticated
  WITH CHECK (public.can_read_message(message_id));
CREATE POLICY "delivery_update_recipient" ON public.message_delivery FOR UPDATE TO authenticated
  USING (public.owns_device(recipient_device_id)) WITH CHECK (public.owns_device(recipient_device_id));
CREATE TRIGGER delivery_touch BEFORE UPDATE ON public.message_delivery FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- encrypted attachments
-- ------------------------------------------------------------
CREATE TABLE public.encrypted_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  encrypted_key_material TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.encrypted_attachments TO authenticated;
GRANT ALL ON public.encrypted_attachments TO service_role;
ALTER TABLE public.encrypted_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachments_select_endpoints" ON public.encrypted_attachments FOR SELECT TO authenticated
  USING (public.can_read_message(message_id));
CREATE POLICY "attachments_insert_sender" ON public.encrypted_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.sender_user_id = auth.uid()));
CREATE POLICY "attachments_delete_endpoints" ON public.encrypted_attachments FOR DELETE TO authenticated
  USING (public.can_read_message(message_id));

-- ------------------------------------------------------------
-- push tokens (owner-only)
-- ------------------------------------------------------------
CREATE TABLE public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_tokens_own" ON public.push_tokens FOR ALL TO authenticated
  USING (public.owns_device(device_id)) WITH CHECK (public.owns_device(device_id));
CREATE TRIGGER push_tokens_touch BEFORE UPDATE ON public.push_tokens FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- realtime
-- ------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_delivery;
