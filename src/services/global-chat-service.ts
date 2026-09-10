import { supabase } from "@/integrations/supabase/client";

export type GlobalChatMessage = {
  id: string;
  nickname: string;
  body: string;
  created_at: string;
};

const MAX_MESSAGES = 200;
const MAX_NICKNAME = 32;
const MAX_BODY = 2000;

const table = () => (supabase as any).from("global_chat_messages");

export async function loadGlobalChat(): Promise<GlobalChatMessage[]> {
  const { data, error } = await table()
    .select("id,nickname,body,created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES);

  if (error) throw error;
  return ([...(data ?? [])] as GlobalChatMessage[]).reverse();
}

export async function postGlobalMessage(nickname: string, body: string): Promise<GlobalChatMessage> {
  const cleanNickname = nickname.trim().slice(0, MAX_NICKNAME) || "Anonymous";
  const cleanBody = body.trim().slice(0, MAX_BODY);

  if (!cleanBody) throw new Error("Message cannot be empty.");
  if (cleanNickname.length > MAX_NICKNAME) throw new Error("Name is too long.");
  if (cleanBody.length > MAX_BODY) throw new Error("Message is too long.");

  const { data, error } = await table()
    .insert({ nickname: cleanNickname, body: cleanBody })
    .select("id,nickname,body,created_at")
    .single();

  if (error) throw error;
  return data as GlobalChatMessage;
}

export function subscribeToGlobalChat(onMessage: (message: GlobalChatMessage) => void) {
  const channel = supabase
    .channel("global-chat")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "global_chat_messages" },
      (payload) => onMessage(payload.new as GlobalChatMessage),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export const GLOBAL_CHAT_LIMITS = {
  maxNickname: MAX_NICKNAME,
  maxBody: MAX_BODY,
};
