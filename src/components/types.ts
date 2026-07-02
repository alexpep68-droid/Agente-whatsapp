export type AccountStatus = "disconnected" | "qr" | "connecting" | "connected";
export type ConversationMode = "AI" | "HUMAN";
export type MessageRole = "user" | "assistant" | "human";
export type AiStatus = "active" | "paused";
export type PipelineStage =
  | "Nuevo cliente"
  | "Cliente potencial"
  | "Cotización enviada"
  | "Cita"
  | "Instalación"
  | "Cliente cerrado"
  | "No es cliente";

export interface Account {
  id: number;
  name: string;
  slug: string;
  phone: string | null;
  status: AccountStatus;
  qr_string: string | null;
  ai_enabled: number;
  ai_status: AiStatus;
  ai_error: string | null;
  system_prompt: string;
  created_at: number;
  updated_at: number;
}

export interface Conversation {
  id: number;
  account_id: number;
  phone: string;
  name: string | null;
  mode: ConversationMode;
  label: string | null;
  pipeline_stage: PipelineStage;
  avatar_url: string | null;
  last_message_at: number | null;
  created_at: number;
  last_message_preview?: string | null;
  last_message_role?: MessageRole | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  media_url: string | null;
  media_type: string | null;
  created_at: number;
}

export interface CustomerProfile {
  conversation_id: number;
  customer_name: string | null;
  project_type: string | null;
  city: string | null;
  budget: string | null;
  measurements: string | null;
  visit_date: string | null;
  notes: string | null;
  updated_at: number;
}

export interface Reminder {
  id: number;
  account_id: number;
  conversation_id: number;
  message: string;
  due_at: number;
  status: "pending" | "sent" | "cancelled";
  created_at: number;
  sent_at: number | null;
}
