import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as sqlite from "./db";
import { DEFAULT_QUICK_REPLIES, slugify, type Account, type Conversation, type ConversationMode, type CustomerProfile, type Message, type MessageRole, type OutboxItem, type PipelineStage, type QuickReply } from "./db";
import { DEFAULT_SYSTEM_PROMPT } from "./system-prompt";

type MediaInput = { url: string; type: string } | null;

let supabaseClient: SupabaseClient | null = null;
let seedPromise: Promise<void> | null = null;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function shouldUseSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function supabase() {
  if (!shouldUseSupabase()) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
}

function fail(error: unknown, fallback: string): never {
  if (error && typeof error === "object" && "message" in error) {
    throw new Error(String((error as { message: string }).message));
  }
  throw new Error(fallback);
}

function mapAccount(row: Record<string, unknown>): Account {
  return {
    ...(row as unknown as Account),
    ai_enabled: row.ai_enabled ? 1 : 0,
  };
}

function mapOutbox(row: Record<string, unknown>): OutboxItem {
  return {
    ...(row as unknown as OutboxItem),
    sent: row.sent ? 1 : 0,
  };
}

async function seedSupabase(client: SupabaseClient) {
  if (!seedPromise) {
    seedPromise = (async () => {
      const { data: accountRows, error: accountsError } = await client.from("accounts").select("id").limit(1);
      if (accountsError) fail(accountsError, "No se pudieron leer las cuentas");

      if (!accountRows?.length) {
        const { error } = await client.from("accounts").insert([
          { name: "Almalu", slug: "almalu", system_prompt: DEFAULT_SYSTEM_PROMPT },
          { name: "Web Marketing Pro", slug: "web-marketing-pro", system_prompt: DEFAULT_SYSTEM_PROMPT },
          { name: "Negocio", slug: "negocio", system_prompt: DEFAULT_SYSTEM_PROMPT },
        ]);
        if (error) fail(error, "No se pudieron crear las cuentas iniciales");
      }

      const { data: accounts, error: fullAccountsError } = await client.from("accounts").select("id").order("id");
      if (fullAccountsError) fail(fullAccountsError, "No se pudieron preparar las respuestas rapidas");

      for (const account of accounts || []) {
        const { data: replies, error: repliesError } = await client
          .from("quick_replies")
          .select("id")
          .eq("account_id", account.id)
          .limit(1);
        if (repliesError) fail(repliesError, "No se pudieron leer las respuestas rapidas");
        if (!replies?.length) {
          const rows = DEFAULT_QUICK_REPLIES.map((reply, index) => ({
            account_id: account.id,
            title: reply.title,
            text: reply.text,
            sort_order: index,
          }));
          const { error } = await client.from("quick_replies").insert(rows);
          if (error) fail(error, "No se pudieron crear las respuestas rapidas");
        }
      }
    })();
  }
  await seedPromise;
}

async function clientReady() {
  const client = supabase();
  if (!client) return null;
  await seedSupabase(client);
  return client;
}

export async function listAccounts(): Promise<Account[]> {
  const client = await clientReady();
  if (!client) return sqlite.listAccounts();
  const { data, error } = await client.from("accounts").select("*").order("id");
  if (error) fail(error, "No se pudieron leer las cuentas");
  return (data || []).map(mapAccount);
}

export async function createAccount(name: string): Promise<Account> {
  const client = await clientReady();
  if (!client) return sqlite.createAccount(name);

  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (true) {
    const { data, error } = await client.from("accounts").select("id").eq("slug", slug).maybeSingle();
    if (error) fail(error, "No se pudo validar el nombre de la cuenta");
    if (!data) break;
    slug = `${base}-${n++}`;
  }

  const { data, error } = await client
    .from("accounts")
    .insert({ name: name.trim(), slug, system_prompt: DEFAULT_SYSTEM_PROMPT })
    .select("*")
    .single();
  if (error) fail(error, "No se pudo crear la cuenta");
  return mapAccount(data);
}

export async function getAccountById(id: number): Promise<Account | null> {
  const client = await clientReady();
  if (!client) return sqlite.getAccountById(id);
  const { data, error } = await client.from("accounts").select("*").eq("id", id).maybeSingle();
  if (error) fail(error, "No se pudo leer la cuenta");
  return data ? mapAccount(data) : null;
}

export async function setAccountState(
  accountId: number,
  input: Partial<Pick<Account, "status" | "qr_string" | "phone">>,
) {
  const client = await clientReady();
  if (!client) return sqlite.setAccountState(accountId, input);
  const update: Record<string, unknown> = { updated_at: nowSeconds() };
  if (Object.prototype.hasOwnProperty.call(input, "status")) update.status = input.status;
  if (Object.prototype.hasOwnProperty.call(input, "qr_string")) update.qr_string = input.qr_string;
  if (Object.prototype.hasOwnProperty.call(input, "phone")) update.phone = input.phone;
  const { error } = await client.from("accounts").update(update).eq("id", accountId);
  if (error) fail(error, "No se pudo actualizar la cuenta");
}

export async function updateAccountSettings(
  accountId: number,
  input: { name?: string; system_prompt?: string; ai_enabled?: boolean },
): Promise<Account | null> {
  const client = await clientReady();
  if (!client) return sqlite.updateAccountSettings(accountId, input);

  const current = await getAccountById(accountId);
  if (!current) return null;
  const nextAiEnabled = typeof input.ai_enabled === "boolean" ? input.ai_enabled : Boolean(current.ai_enabled);
  const shouldReactivateAi = nextAiEnabled && (input.ai_enabled === true || current.ai_status === "paused");
  const { error } = await client
    .from("accounts")
    .update({
      name: input.name?.trim() || current.name,
      system_prompt: input.system_prompt?.trim() || current.system_prompt,
      ai_enabled: nextAiEnabled,
      ai_status: shouldReactivateAi ? "active" : current.ai_status,
      ai_error: shouldReactivateAi ? null : current.ai_error,
      updated_at: nowSeconds(),
    })
    .eq("id", accountId);
  if (error) fail(error, "No se pudieron guardar los ajustes");
  return getAccountById(accountId);
}

export async function pauseAccountAi(accountId: number, reason: string) {
  const client = await clientReady();
  if (!client) return sqlite.pauseAccountAi(accountId, reason);
  const { error } = await client
    .from("accounts")
    .update({ ai_status: "paused", ai_error: reason.slice(0, 500), updated_at: nowSeconds() })
    .eq("id", accountId);
  if (error) fail(error, "No se pudo pausar la IA");
}

export async function requestAccountRestart(accountId: number) {
  const client = await clientReady();
  if (!client) return sqlite.requestAccountRestart(accountId);
  const { error } = await client
    .from("account_restart")
    .upsert({ account_id: accountId, requested_at: nowSeconds() }, { onConflict: "account_id" });
  if (error) fail(error, "No se pudo solicitar el reinicio");
}

export async function consumeAccountRestarts(): Promise<number[]> {
  const client = await clientReady();
  if (!client) return sqlite.consumeAccountRestarts();
  const { data, error } = await client.from("account_restart").select("account_id");
  if (error) fail(error, "No se pudieron leer los reinicios");
  const { error: deleteError } = await client.from("account_restart").delete().gte("requested_at", 0);
  if (deleteError) fail(deleteError, "No se pudieron limpiar los reinicios");
  return (data || []).map((row) => Number(row.account_id));
}

export async function getOrCreateConversation(accountId: number, phone: string, name?: string): Promise<Conversation> {
  const client = await clientReady();
  if (!client) return sqlite.getOrCreateConversation(accountId, phone, name);
  const { data: found, error } = await client
    .from("conversations")
    .select("*")
    .eq("account_id", accountId)
    .eq("phone", phone)
    .maybeSingle();
  if (error) fail(error, "No se pudo leer la conversacion");
  if (found) {
    if (name && found.name !== name) {
      const { data, error: updateError } = await client
        .from("conversations")
        .update({ name })
        .eq("id", found.id)
        .select("*")
        .single();
      if (updateError) fail(updateError, "No se pudo actualizar el nombre del chat");
      return data as Conversation;
    }
    return found as Conversation;
  }

  const { data, error: insertError } = await client
    .from("conversations")
    .insert({ account_id: accountId, phone, name: name ?? null })
    .select("*")
    .single();
  if (insertError) {
    const { data: existing, error: refetchError } = await client
      .from("conversations")
      .select("*")
      .eq("account_id", accountId)
      .eq("phone", phone)
      .single();
    if (refetchError) fail(insertError, "No se pudo crear la conversacion");
    return existing as Conversation;
  }
  return data as Conversation;
}

export async function getConversationById(id: number): Promise<Conversation | null> {
  const client = await clientReady();
  if (!client) return sqlite.getConversationById(id);
  const { data, error } = await client.from("conversations").select("*").eq("id", id).maybeSingle();
  if (error) fail(error, "No se pudo leer la conversacion");
  return (data as Conversation | null) ?? null;
}

export async function insertMessage(
  conversationId: number,
  role: MessageRole,
  content: string,
  media?: MediaInput,
): Promise<number> {
  const client = await clientReady();
  if (!client) return sqlite.insertMessage(conversationId, role, content, media);
  const { data, error } = await client
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      media_url: media?.url ?? null,
      media_type: media?.type ?? null,
    })
    .select("id")
    .single();
  if (error) fail(error, "No se pudo guardar el mensaje");
  const { error: updateError } = await client
    .from("conversations")
    .update({ last_message_at: nowSeconds() })
    .eq("id", conversationId);
  if (updateError) fail(updateError, "No se pudo actualizar la conversacion");
  return Number(data.id);
}

export async function getMessages(conversationId: number, limit = 80): Promise<Message[]> {
  const client = await clientReady();
  if (!client) return sqlite.getMessages(conversationId, limit);
  const { data, error } = await client
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) fail(error, "No se pudieron leer los mensajes");
  return ((data || []) as Message[]).reverse();
}

export async function getRecentHistory(conversationId: number, limit = 20): Promise<Message[]> {
  return getMessages(conversationId, limit);
}

export async function listConversations(accountId: number): Promise<Conversation[]> {
  const client = await clientReady();
  if (!client) return sqlite.listConversations(accountId);
  const { data, error } = await client
    .from("conversations")
    .select("*")
    .eq("account_id", accountId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) fail(error, "No se pudieron leer los chats");

  const conversations = (data || []) as Conversation[];
  const ids = conversations.map((conversation) => conversation.id);
  if (!ids.length) return conversations;

  const { data: messages, error: messagesError } = await client
    .from("messages")
    .select("conversation_id, content, created_at, id")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (messagesError) fail(messagesError, "No se pudieron leer los previews");

  const previews = new Map<number, string>();
  for (const message of messages || []) {
    const conversationId = Number(message.conversation_id);
    if (!previews.has(conversationId)) previews.set(conversationId, String(message.content || ""));
  }

  return conversations.map((conversation) => ({
    ...conversation,
    last_message_preview: previews.get(conversation.id) ?? null,
  }));
}

export async function setMode(conversationId: number, mode: ConversationMode) {
  const client = await clientReady();
  if (!client) return sqlite.setMode(conversationId, mode);
  const { error } = await client.from("conversations").update({ mode }).eq("id", conversationId);
  if (error) fail(error, "No se pudo cambiar el modo");
}

export async function setConversationLabel(conversationId: number, label: string | null) {
  const client = await clientReady();
  if (!client) return sqlite.setConversationLabel(conversationId, label);
  const { error } = await client.from("conversations").update({ label }).eq("id", conversationId);
  if (error) fail(error, "No se pudo actualizar la etiqueta");
}

export async function setPipelineStage(conversationId: number, stage: PipelineStage) {
  const client = await clientReady();
  if (!client) return sqlite.setPipelineStage(conversationId, stage);
  const { error } = await client.from("conversations").update({ pipeline_stage: stage }).eq("id", conversationId);
  if (error) fail(error, "No se pudo actualizar el embudo");
}

export async function enqueueOutbox(
  accountId: number,
  conversationId: number,
  phone: string,
  content: string,
  media?: MediaInput,
) {
  const client = await clientReady();
  if (!client) return sqlite.enqueueOutbox(accountId, conversationId, phone, content, media);
  const { error } = await client.from("outbox").insert({
    account_id: accountId,
    conversation_id: conversationId,
    phone,
    content,
    media_url: media?.url ?? null,
    media_type: media?.type ?? null,
  });
  if (error) fail(error, "No se pudo preparar el envio");
}

export async function getPendingOutbox(accountId: number, limit = 20): Promise<OutboxItem[]> {
  const client = await clientReady();
  if (!client) return sqlite.getPendingOutbox(accountId, limit);
  const { data, error } = await client
    .from("outbox")
    .select("*")
    .eq("account_id", accountId)
    .eq("sent", false)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) fail(error, "No se pudo leer la bandeja de salida");
  return (data || []).map(mapOutbox);
}

export async function markOutboxSent(id: number) {
  const client = await clientReady();
  if (!client) return sqlite.markOutboxSent(id);
  const { error } = await client.from("outbox").update({ sent: true }).eq("id", id);
  if (error) fail(error, "No se pudo marcar el mensaje como enviado");
}

export async function deleteConversation(id: number) {
  const client = await clientReady();
  if (!client) return sqlite.deleteConversation(id);
  const { error } = await client.from("conversations").delete().eq("id", id);
  if (error) fail(error, "No se pudo borrar la conversacion");
}

export async function listQuickReplies(accountId: number): Promise<QuickReply[]> {
  const client = await clientReady();
  if (!client) return sqlite.listQuickReplies(accountId);
  const { data, error } = await client
    .from("quick_replies")
    .select("*")
    .eq("account_id", accountId)
    .order("sort_order")
    .order("id");
  if (error) fail(error, "No se pudieron leer las respuestas rapidas");
  return (data || []) as QuickReply[];
}

export async function createQuickReply(accountId: number, input: { title: string; text: string }): Promise<QuickReply> {
  const client = await clientReady();
  if (!client) return sqlite.createQuickReply(accountId, input);
  const { data: lastRows, error: orderError } = await client
    .from("quick_replies")
    .select("sort_order")
    .eq("account_id", accountId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (orderError) fail(orderError, "No se pudo ordenar la respuesta rapida");
  const sortOrder = (lastRows?.[0]?.sort_order ?? -1) + 1;
  const { data, error } = await client
    .from("quick_replies")
    .insert({ account_id: accountId, title: input.title.trim(), text: input.text.trim(), sort_order: sortOrder })
    .select("*")
    .single();
  if (error) fail(error, "No se pudo crear la respuesta rapida");
  return data as QuickReply;
}

export async function updateQuickReply(id: number, input: { title: string; text: string }) {
  const client = await clientReady();
  if (!client) return sqlite.updateQuickReply(id, input);
  const { error } = await client
    .from("quick_replies")
    .update({ title: input.title.trim(), text: input.text.trim(), updated_at: nowSeconds() })
    .eq("id", id);
  if (error) fail(error, "No se pudo actualizar la respuesta rapida");
}

export async function deleteQuickReply(id: number) {
  const client = await clientReady();
  if (!client) return sqlite.deleteQuickReply(id);
  const { error } = await client.from("quick_replies").delete().eq("id", id);
  if (error) fail(error, "No se pudo borrar la respuesta rapida");
}

export async function getCustomerProfile(conversationId: number): Promise<CustomerProfile> {
  const client = await clientReady();
  if (!client) return sqlite.getCustomerProfile(conversationId);
  const { data: existing, error } = await client
    .from("customer_profiles")
    .select("*")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) fail(error, "No se pudo leer la ficha del cliente");
  if (existing) return existing as CustomerProfile;
  const { data, error: insertError } = await client
    .from("customer_profiles")
    .insert({ conversation_id: conversationId })
    .select("*")
    .single();
  if (insertError) fail(insertError, "No se pudo crear la ficha del cliente");
  return data as CustomerProfile;
}

export async function updateCustomerProfile(
  conversationId: number,
  input: Partial<Omit<CustomerProfile, "conversation_id" | "updated_at">>,
): Promise<CustomerProfile> {
  const client = await clientReady();
  if (!client) return sqlite.updateCustomerProfile(conversationId, input);
  await getCustomerProfile(conversationId);
  const { error } = await client
    .from("customer_profiles")
    .update({
      customer_name: input.customer_name?.trim() || null,
      project_type: input.project_type?.trim() || null,
      city: input.city?.trim() || null,
      budget: input.budget?.trim() || null,
      measurements: input.measurements?.trim() || null,
      visit_date: input.visit_date?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: nowSeconds(),
    })
    .eq("conversation_id", conversationId);
  if (error) fail(error, "No se pudo guardar la ficha del cliente");
  return getCustomerProfile(conversationId);
}

export type { Account, Conversation, ConversationMode, CustomerProfile, Message, MessageRole, OutboxItem, PipelineStage, QuickReply };
