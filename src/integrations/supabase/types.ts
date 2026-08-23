export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      contact_verifications: {
        Row: {
          contact_id: string
          fingerprint_hash: string
          id: string
          method: Database["public"]["Enums"]["verification_method"]
          verified_at: string
          verified_device_id: string
          verifier_user_id: string
        }
        Insert: {
          contact_id: string
          fingerprint_hash: string
          id?: string
          method: Database["public"]["Enums"]["verification_method"]
          verified_at?: string
          verified_device_id: string
          verifier_user_id: string
        }
        Update: {
          contact_id?: string
          fingerprint_hash?: string
          id?: string
          method?: Database["public"]["Enums"]["verification_method"]
          verified_at?: string
          verified_device_id?: string
          verifier_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_verifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_verifications_verified_device_id_fkey"
            columns: ["verified_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          contact_user_id: string
          created_at: string
          encrypted_alias: string | null
          id: string
          is_blocked: boolean
          owner_id: string
          updated_at: string
        }
        Insert: {
          contact_user_id: string
          created_at?: string
          encrypted_alias?: string | null
          id?: string
          is_blocked?: boolean
          owner_id: string
          updated_at?: string
        }
        Update: {
          contact_user_id?: string
          created_at?: string
          encrypted_alias?: string | null
          id?: string
          is_blocked?: boolean
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversation_members: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          joined_key_epoch: number
          removed_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          joined_key_epoch?: number
          removed_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          joined_key_epoch?: number
          removed_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          encrypted_metadata: string | null
          id: string
          key_epoch: number
          kind: Database["public"]["Enums"]["conversation_kind"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          encrypted_metadata?: string | null
          id?: string
          key_epoch?: number
          kind?: Database["public"]["Enums"]["conversation_kind"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          encrypted_metadata?: string | null
          id?: string
          key_epoch?: number
          kind?: Database["public"]["Enums"]["conversation_kind"]
          updated_at?: string
        }
        Relationships: []
      }
      device_prekeys: {
        Row: {
          consumed_at: string | null
          consumed_by_device: string | null
          created_at: string
          device_id: string
          id: string
          prekey_id: number
          public_key: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_by_device?: string | null
          created_at?: string
          device_id: string
          id?: string
          prekey_id: number
          public_key: string
        }
        Update: {
          consumed_at?: string | null
          consumed_by_device?: string | null
          created_at?: string
          device_id?: string
          id?: string
          prekey_id?: number
          public_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_prekeys_consumed_by_device_fkey"
            columns: ["consumed_by_device"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_prekeys_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          crypto_suite: string
          device_name: string
          id: string
          identity_public_key: string
          key_version: number
          last_seen_at: string
          platform: string
          revoked_at: string | null
          signed_prekey_id: number
          signed_prekey_public: string
          signed_prekey_signature: string
          status: Database["public"]["Enums"]["device_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          crypto_suite?: string
          device_name: string
          id?: string
          identity_public_key: string
          key_version?: number
          last_seen_at?: string
          platform?: string
          revoked_at?: string | null
          signed_prekey_id?: number
          signed_prekey_public: string
          signed_prekey_signature: string
          status?: Database["public"]["Enums"]["device_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          crypto_suite?: string
          device_name?: string
          id?: string
          identity_public_key?: string
          key_version?: number
          last_seen_at?: string
          platform?: string
          revoked_at?: string | null
          signed_prekey_id?: number
          signed_prekey_public?: string
          signed_prekey_signature?: string
          status?: Database["public"]["Enums"]["device_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      encrypted_attachments: {
        Row: {
          content_hash: string
          created_at: string
          encrypted_key_material: string
          id: string
          message_id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          encrypted_key_material: string
          id?: string
          message_id: string
          size_bytes?: number
          storage_path: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          encrypted_key_material?: string
          id?: string
          message_id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "encrypted_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_delivery: {
        Row: {
          id: string
          message_id: string
          recipient_device_id: string
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }
        Insert: {
          id?: string
          message_id: string
          recipient_device_id: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          recipient_device_id?: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_delivery_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_delivery_recipient_device_id_fkey"
            columns: ["recipient_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ciphertext: string
          conversation_id: string
          created_at: string
          encrypted_metadata: string | null
          envelope_version: number
          expires_at: string | null
          id: string
          key_epoch: number
          recipient_device_id: string
          sender_device_id: string
          sender_user_id: string
        }
        Insert: {
          ciphertext: string
          conversation_id: string
          created_at?: string
          encrypted_metadata?: string | null
          envelope_version?: number
          expires_at?: string | null
          id?: string
          key_epoch?: number
          recipient_device_id: string
          sender_device_id: string
          sender_user_id: string
        }
        Update: {
          ciphertext?: string
          conversation_id?: string
          created_at?: string
          encrypted_metadata?: string | null
          envelope_version?: number
          expires_at?: string | null
          id?: string
          key_epoch?: number
          recipient_device_id?: string
          sender_device_id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_device_id_fkey"
            columns: ["recipient_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_device_id_fkey"
            columns: ["sender_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          discoverable: boolean
          display_name: string | null
          handle: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discoverable?: boolean
          display_name?: string | null
          handle: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discoverable?: boolean
          display_name?: string | null
          handle?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_id: string
          id: string
          provider: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          provider: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          provider?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read_message: { Args: { _message_id: string }; Returns: boolean }
      is_conversation_admin: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      owns_device: { Args: { _device_id: string }; Returns: boolean }
    }
    Enums: {
      conversation_kind: "direct" | "group"
      delivery_status: "pending" | "sent" | "delivered" | "read" | "failed"
      device_status: "active" | "revoked"
      member_role: "member" | "admin"
      verification_method: "qr_scan" | "numeric_compare" | "manual"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      conversation_kind: ["direct", "group"],
      delivery_status: ["pending", "sent", "delivered", "read", "failed"],
      device_status: ["active", "revoked"],
      member_role: ["member", "admin"],
      verification_method: ["qr_scan", "numeric_compare", "manual"],
    },
  },
} as const
