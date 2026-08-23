REVOKE ALL ON FUNCTION public.owns_device(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_conversation_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_conversation_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_message(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.owns_device(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_message(UUID) TO authenticated, service_role;