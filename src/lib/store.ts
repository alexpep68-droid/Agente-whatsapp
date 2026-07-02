import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as sqlite from "./db";
import { DEFAULT_QUICK_REPLIES, slugify, type Account, type BroadcastResult, type Conversation, type ConversationMode, type CustomerProfile, type Message, type MessageRole, type OutboxItem, type PaymentLink, type PipelineStage, type QuickReply, type Reminder } from "./db";
import { DEFAULT_SYSTEM_PROMPT } from "./system-prompt";

type MediaInput = { url: string; type: string } | null;

let supabaseClient: SupabaseClient | null = null;
let seedPromise: Promise<void> | null = null;
let messageRemoteIdSupported: boolean | null = null;
let conversationAvatarSupported: boolean | null = null;
let conversationAliasesSupported: boolean | null = null;

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

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

function latestConversationTime(conversation: Conversation) {
  return conversation.last_message_at ?? conversation.created_at ?? 0;
}

function phonePriority(phone: string) {
  if (phone.includes("@s.whatsapp.net")) return 2;
  if (phone.includes("@lid")) return 1;
  return 0;
}

function pickCanonicalConversation(conversations: Conversation[]) {
  return [...conversations].sort((left, right) => {
    const leftPriority = phonePriority(left.phone);
    const rightPriority = phonePriority(right.phone);
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;
    return latestConversationTime(right) - latestConversationTime(left);
  })[0];
}

function pickCanonicalPhone(phones: string[]) {
  return [...phones].sort((left, right) => phonePriority(right) - phonePriority(left))[0];
}

function cleanAliases(aliases: string[]) {
  return Array.from(new Set(aliases.map((alias) => alias.trim()).filter(Boolean)));
}

function isMissingConversationAliases(error: { message?: string }) {
  return /conversation_aliases|schema cache|relation .* does not exist/i.test(error.message ?? "");
}

async function attachConversationAliases(client: SupabaseClient, accountId: number, conversationId: number, aliases: string[]) {
  if (conversationAliasesSupported === false) return;
  const clean = cleanAliases(aliases);
  if (!clean.length) return;

  const { error } = await client.from("conversation_aliases").upsert(
    clean.map((alias) => ({ account_id: accountId, conversation_id: conversationId, alias })),
    { onConflict: "account_id,alias" },
  );
  if (error) {
    if (isMissingConversationAliases(error)) {
      conversationAliasesSupported = false;
      return;
    }
    fail(error, "No se pudieron guardar los identificadores del contacto");
  }
  conversationAliasesSupported = true;
}

async function findConversationsByAliases(client: SupabaseClient, accountId: number, aliases: string[]) {
  const clean = cleanAliases(aliases);
  if (!clean.length) return [] as Conversation[];

  const conversationsById = new Map<number, Conversation>();
  const { data: phoneRows, error: phoneError } = await client
    .from("conversations")
    .select("*")
    .eq("account_id", accountId)
    .in("phone", clean);
  if (phoneError) fail(phoneError, "No se pudieron leer los chats");
  for (const row of (phoneRows || []) as Conversation[]) conversationsById.set(row.id, row);

  if (conversationAliasesSupported !== false) {
    const { data: aliasRows, error: aliasError } = await client
      .from("conversation_aliases")
      .select("conversation_id")
      .eq("account_id", accountId)
      .in("alias", clean);
    if (aliasError) {
      if (isMissingConversationAliases(aliasError)) {
        conversationAliasesSupported = false;
      } else {
        fail(aliasError, "No se pudieron leer los identificadores del contacto");
      }
    } else {
      conversationAliasesSupported = true;
      const ids = Array.from(new Set((aliasRows || []).map((row) => Number(row.conversation_id)).filter(Boolean)));
      if (ids.length) {
        const { data: aliasConversations, error: conversationsError } = await client
          .from("conversations")
          .select("*")
          .eq("account_id", accountId)
          .in("id", ids);
        if (conversationsError) fail(conversationsError, "No se pudieron leer los chats por identificador");
        for (const row of (aliasConversations || []) as Conversation[]) conversationsById.set(row.id, row);
      }
    }
  }

  return Array.from(conversationsById.values());
}

function coalesceText<T extends string | null>(primary: T, fallback: T) {
  return hasText(primary) ? primary : fallback;
}

async function mergeCustomerProfile(client: SupabaseClient, targetId: number, sourceId: number) {
  const { data: profiles, error } = await client
    .from("customer_profiles")
    .select("*")
    .in("conversation_id", [targetId, sourceId]);
  if (error) fail(error, "No se pudo leer la ficha del cliente");

  const target = (profiles || []).find((profile) => Number(profile.conversation_id) === targetId) as CustomerProfile | undefined;
  const source = (profiles || []).find((profile) => Number(profile.conversation_id) === sourceId) as CustomerProfile | undefined;
  if (!source) return;

  if (!target) {
    const { error: moveError } = await client
      .from("customer_profiles")
      .update({ conversation_id: targetId, updated_at: nowSeconds() })
      .eq("conversation_id", sourceId);
    if (moveError) fail(moveError, "No se pudo unir la ficha del cliente");
    return;
  }

  const { error: updateError } = await client
    .from("customer_profiles")
    .update({
      customer_name: coalesceText(target.customer_name, source.customer_name),
      project_type: coalesceText(target.project_type, source.project_type),
      city: coalesceText(target.city, source.city),
      budget: coalesceText(target.budget, source.budget),
      measurements: coalesceText(target.measurements, source.measurements),
      visit_date: coalesceText(target.visit_date, source.visit_date),
      notes: coalesceText(target.notes, source.notes),
      updated_at: nowSeconds(),
    })
    .eq("conversation_id", targetId);
  if (updateError) fail(updateError, "No se pudo actualizar la ficha del cliente");

  const { error: deleteError } = await client.from("customer_profiles").delete().eq("conversation_id", sourceId);
  if (deleteError) fail(deleteError, "No se pudo limpiar la ficha duplicada");
}

async function mergeConversationDuplicates(
  client: SupabaseClient,
  accountId: number,
  phones: string[],
  input: { name?: string | null; avatarUrl?: string | null },
) {
  const conversations = await findConversationsByAliases(client, accountId, phones);
  if (conversations.length <= 1) return;

  const target = pickCanonicalConversation(conversations);
  const sources = conversations.filter((conversation) => conversation.id !== target.id);
  const cleanName = input.name?.trim();
  const cleanAvatarUrl = input.avatarUrl?.trim();

  let mergedName = cleanName || target.name;
  let mergedAvatarUrl = cleanAvatarUrl || target.avatar_url;
  let mergedMode: ConversationMode = target.mode;
  let mergedLabel = target.label;
  let mergedStage: PipelineStage = target.pipeline_stage;
  let mergedLastMessageAt = target.last_message_at;

  for (const source of sources) {
    mergedName = mergedName || source.name;
    mergedAvatarUrl = mergedAvatarUrl || source.avatar_url;
    if (source.mode === "HUMAN") mergedMode = "HUMAN";
    mergedLabel = mergedLabel || source.label;
    if (mergedStage === "Nuevo cliente" && source.pipeline_stage !== "Nuevo cliente") {
      mergedStage = source.pipeline_stage;
    }
    if ((source.last_message_at ?? 0) > (mergedLastMessageAt ?? 0)) {
      mergedLastMessageAt = source.last_message_at;
    }

    await mergeCustomerProfile(client, target.id, source.id);

    const { error: messageError } = await client
      .from("messages")
      .update({ conversation_id: target.id })
      .eq("conversation_id", source.id);
    if (messageError) fail(messageError, "No se pudieron mover los mensajes del chat duplicado");

    const { error: outboxError } = await client
      .from("outbox")
      .update({ conversation_id: target.id, phone: target.phone })
      .eq("conversation_id", source.id);
    if (outboxError) fail(outboxError, "No se pudieron mover los envios pendientes del chat duplicado");

    if (conversationAliasesSupported !== false) {
      const { data: sourceAliases, error: sourceAliasesError } = await client
        .from("conversation_aliases")
        .select("alias")
        .eq("conversation_id", source.id);
      if (sourceAliasesError) {
        if (isMissingConversationAliases(sourceAliasesError)) conversationAliasesSupported = false;
        else fail(sourceAliasesError, "No se pudieron leer los identificadores duplicados");
      } else {
        await attachConversationAliases(
          client,
          accountId,
          target.id,
          (sourceAliases || []).map((row) => String(row.alias)),
        );
        const { error: aliasDeleteError } = await client.from("conversation_aliases").delete().eq("conversation_id", source.id);
        if (aliasDeleteError) fail(aliasDeleteError, "No se pudieron limpiar los identificadores duplicados");
      }
    }

    const { error: deleteError } = await client.from("conversations").delete().eq("id", source.id);
    if (deleteError) fail(deleteError, "No se pudo borrar el chat duplicado");
  }

  const update: Record<string, unknown> = {
    name: mergedName,
    mode: mergedMode,
    label: mergedLabel,
    pipeline_stage: mergedStage,
    last_message_at: mergedLastMessageAt,
  };
  if (conversationAvatarSupported !== false) update.avatar_url = mergedAvatarUrl;

  const { error: updateError } = await client.from("conversations").update(update).eq("id", target.id);
  if (updateError) {
    if (/avatar_url/i.test(updateError.message)) {
      conversationAvatarSupported = false;
      delete update.avatar_url;
      const { error: retryError } = await client.from("conversations").update(update).eq("id", target.id);
      if (retryError) fail(retryError, "No se pudo actualizar el chat unido");
      return;
    }
    fail(updateError, "No se pudo actualizar el chat unido");
  }
  await attachConversationAliases(client, accountId, target.id, phones);
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

export async function getOrCreateConversation(accountId: number, phone: string, name?: string, aliases: string[] = []): Promise<Conversation> {
  const phones = Array.from(new Set([phone, ...aliases].map((value) => value.trim()).filter(Boolean)));
  const client = await clientReady();
  if (!client) return sqlite.getOrCreateConversation(accountId, phone, name, phones);

  await mergeConversationDuplicates(client, accountId, phones, { name });

  const foundRows = await findConversationsByAliases(client, accountId, phones);
  const found = foundRows.length ? pickCanonicalConversation(foundRows) : null;
  if (found) {
    await attachConversationAliases(client, accountId, found.id, phones);
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

  const canonicalPhone = pickCanonicalPhone(phones) || phone;
  const { data, error: insertError } = await client
    .from("conversations")
    .insert({ account_id: accountId, phone: canonicalPhone, name: name ?? null })
    .select("*")
    .single();
  if (insertError) {
    const { data: existingRows, error: refetchError } = await client
      .from("conversations")
      .select("*")
      .eq("account_id", accountId)
      .in("phone", phones);
    if (refetchError) fail(insertError, "No se pudo crear la conversacion");
    const existing = existingRows?.length ? pickCanonicalConversation(existingRows as Conversation[]) : null;
    if (!existing) fail(insertError, "No se pudo crear la conversacion");
    await attachConversationAliases(client, accountId, existing.id, phones);
    return existing as Conversation;
  }
  await attachConversationAliases(client, accountId, Number(data.id), phones);
  return data as Conversation;
}

export async function getConversationById(id: number): Promise<Conversation | null> {
  const client = await clientReady();
  if (!client) return sqlite.getConversationById(id);
  const { data, error } = await client.from("conversations").select("*").eq("id", id).maybeSingle();
  if (error) fail(error, "No se pudo leer la conversacion");
  return (data as Conversation | null) ?? null;
}

export async function updateConversationName(accountId: number, phone: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) return;
  const client = await clientReady();
  if (!client) return sqlite.updateConversationName(accountId, phone, cleanName);
  const { error } = await client.from("conversations").update({ name: cleanName }).eq("account_id", accountId).eq("phone", phone);
  if (error) fail(error, "No se pudo actualizar el nombre del contacto");
}

export async function updateConversationAvatar(accountId: number, phone: string, avatarUrl: string) {
  const cleanAvatarUrl = avatarUrl.trim();
  if (!cleanAvatarUrl || conversationAvatarSupported === false) return;
  const client = await clientReady();
  if (!client) return sqlite.updateConversationAvatar(accountId, phone, cleanAvatarUrl);
  const { error } = await client
    .from("conversations")
    .update({ avatar_url: cleanAvatarUrl })
    .eq("account_id", accountId)
    .eq("phone", phone);
  if (error) {
    if (/avatar_url/i.test(error.message)) {
      conversationAvatarSupported = false;
      return;
    }
    fail(error, "No se pudo actualizar la foto del contacto");
  }
  conversationAvatarSupported = true;
}

export async function updateConversationContact(
  accountId: number,
  phones: string[],
  input: { name?: string | null; avatarUrl?: string | null },
) {
  const cleanPhones = Array.from(new Set(phones.map((phone) => phone.trim()).filter(Boolean)));
  if (!cleanPhones.length) return;

  const cleanName = input.name?.trim();
  const cleanAvatarUrl = input.avatarUrl?.trim();
  if (!cleanName && !cleanAvatarUrl) return;

  const client = await clientReady();
  if (!client) return sqlite.updateConversationContact(accountId, cleanPhones, { name: cleanName, avatarUrl: cleanAvatarUrl });
  await mergeConversationDuplicates(client, accountId, cleanPhones, { name: cleanName, avatarUrl: cleanAvatarUrl });
  const matchedConversations = await findConversationsByAliases(client, accountId, cleanPhones);
  if (matchedConversations.length) {
    await attachConversationAliases(client, accountId, pickCanonicalConversation(matchedConversations).id, cleanPhones);
  }

  const update: Record<string, unknown> = {};
  if (cleanName) update.name = cleanName;
  if (cleanAvatarUrl && conversationAvatarSupported !== false) update.avatar_url = cleanAvatarUrl;
  if (!Object.keys(update).length) return;

  const matchedIds = matchedConversations.map((conversation) => conversation.id);
  const updateQuery = client.from("conversations").update(update);
  const { error } = matchedIds.length
    ? await updateQuery.in("id", matchedIds)
    : await updateQuery.eq("account_id", accountId).in("phone", cleanPhones);
  if (error) {
    if (cleanAvatarUrl && /avatar_url/i.test(error.message)) {
      conversationAvatarSupported = false;
      if (cleanName) {
        const nameQuery = client.from("conversations").update({ name: cleanName });
        const { error: nameError } = matchedIds.length
          ? await nameQuery.in("id", matchedIds)
          : await nameQuery.eq("account_id", accountId).in("phone", cleanPhones);
        if (nameError) fail(nameError, "No se pudo actualizar el nombre del contacto");
      }
      return;
    }
    fail(error, "No se pudo actualizar el contacto");
  }
  if (cleanAvatarUrl) conversationAvatarSupported = true;
}

export async function insertMessage(
  conversationId: number,
  role: MessageRole,
  content: string,
  media?: MediaInput,
  remoteId?: string | null,
): Promise<number> {
  const client = await clientReady();
  if (!client) return sqlite.insertMessage(conversationId, role, content, media, remoteId);

  const row = {
    conversation_id: conversationId,
    role,
    content,
    media_url: media?.url ?? null,
    media_type: media?.type ?? null,
  } as Record<string, unknown>;
  if (remoteId && messageRemoteIdSupported !== false) row.remote_id = remoteId;

  let result = await client.from("messages").insert(row).select("id").single();
  if (result.error && remoteId && messageRemoteIdSupported !== false && /remote_id/i.test(result.error.message)) {
    messageRemoteIdSupported = false;
    delete row.remote_id;
    result = await client.from("messages").insert(row).select("id").single();
  } else if (!result.error && remoteId) {
    messageRemoteIdSupported = true;
  }

  const { data, error } = result;
  if (error) fail(error, "No se pudo guardar el mensaje");
  const { error: updateError } = await client
    .from("conversations")
    .update({ last_message_at: nowSeconds() })
    .eq("id", conversationId);
  if (updateError) fail(updateError, "No se pudo actualizar la conversacion");
  return Number(data.id);
}

export async function deleteMessageByRemoteId(accountId: number, remoteId: string) {
  const cleanRemoteId = remoteId.trim();
  if (!cleanRemoteId) return;
  const client = await clientReady();
  if (!client) return sqlite.deleteMessageByRemoteId(accountId, cleanRemoteId);

  const { data: conversations, error: conversationsError } = await client
    .from("conversations")
    .select("id")
    .eq("account_id", accountId);
  if (conversationsError) fail(conversationsError, "No se pudieron leer las conversaciones");
  const conversationIds = (conversations || []).map((row) => Number(row.id));
  if (!conversationIds.length) return;

  const { data: deleted, error } = await client
    .from("messages")
    .delete()
    .in("conversation_id", conversationIds)
    .eq("remote_id", cleanRemoteId)
    .select("conversation_id");
  if (error) {
    if (/remote_id/i.test(error.message)) {
      messageRemoteIdSupported = false;
      return;
    }
    fail(error, "No se pudo borrar el mensaje eliminado en WhatsApp");
  }
  messageRemoteIdSupported = true;

  const changedConversationIds = Array.from(new Set((deleted || []).map((row) => Number(row.conversation_id))));
  for (const conversationId of changedConversationIds) {
    const { data: latest, error: latestError } = await client
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) fail(latestError, "No se pudo actualizar la conversacion");
    const { error: updateError } = await client
      .from("conversations")
      .update({ last_message_at: latest?.created_at ?? null })
      .eq("id", conversationId);
    if (updateError) fail(updateError, "No se pudo actualizar la conversacion");
  }
}

export async function deleteMessages(conversationId: number, messageIds: number[]) {
  const ids = Array.from(new Set(messageIds.map(Number).filter(Number.isFinite)));
  if (ids.length === 0) return;
  const client = await clientReady();
  if (!client) return sqlite.deleteMessages(conversationId, ids);

  const { error } = await client.from("messages").delete().eq("conversation_id", conversationId).in("id", ids);
  if (error) fail(error, "No se pudieron borrar los mensajes seleccionados");

  const { data: latest, error: latestError } = await client
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) fail(latestError, "No se pudo actualizar la conversacion");

  const { error: updateError } = await client
    .from("conversations")
    .update({ last_message_at: latest?.created_at ?? null })
    .eq("id", conversationId);
  if (updateError) fail(updateError, "No se pudo actualizar la conversacion");
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
    .select("conversation_id, content, role, created_at, id")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (messagesError) fail(messagesError, "No se pudieron leer los previews");

  const previews = new Map<number, string>();
  const roles = new Map<number, MessageRole>();
  for (const message of messages || []) {
    const conversationId = Number(message.conversation_id);
    if (!previews.has(conversationId)) {
      previews.set(conversationId, String(message.content || ""));
      roles.set(conversationId, String(message.role || "") as MessageRole);
    }
  }

  return conversations.map((conversation) => ({
    ...conversation,
    last_message_preview: previews.get(conversation.id) ?? null,
    last_message_role: roles.get(conversation.id) ?? null,
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
    .lte("created_at", nowSeconds())
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

function conversationHasLabel(conversation: Conversation, label: string) {
  return (conversation.label || "")
    .split("|")
    .map((item) => item.trim())
    .includes(label);
}

export async function enqueueBroadcast(
  accountId: number,
  input: {
    message: string;
    label?: string | null;
    pipelineStage?: PipelineStage | null;
    mode?: ConversationMode | null;
    delaySeconds?: number | null;
    startAt?: number | null;
  },
): Promise<BroadcastResult> {
  const message = input.message.trim();
  if (!message) return { matched: 0, enqueued: 0 };
  const delaySeconds = Math.max(0, Math.min(24 * 60 * 60, Math.floor(input.delaySeconds || 0)));

  const client = await clientReady();
  if (!client) return sqlite.enqueueBroadcast(accountId, input);

  let conversations = await listConversations(accountId);
  conversations = conversations.filter((conversation) => {
    if (input.label && !conversationHasLabel(conversation, input.label)) return false;
    if (input.pipelineStage && conversation.pipeline_stage !== input.pipelineStage) return false;
    if (input.mode && conversation.mode !== input.mode) return false;
    return true;
  });

  if (!conversations.length) return { matched: 0, enqueued: 0 };

  const now = nowSeconds();
  const startAt = Math.max(now, Math.floor(input.startAt || 0));
  const messageRows = conversations.map((conversation) => ({
    conversation_id: conversation.id,
    role: "human",
    content: message,
    created_at: now,
  }));
  const outboxRows = conversations.map((conversation, index) => ({
    account_id: accountId,
    conversation_id: conversation.id,
    phone: conversation.phone,
    content: message,
    created_at: startAt + (delaySeconds ? index * delaySeconds : 0),
  }));
  const ids = conversations.map((conversation) => conversation.id);

  const { error: messageError } = await client.from("messages").insert(messageRows);
  if (messageError) fail(messageError, "No se pudo preparar la transmision");

  const { error: outboxError } = await client.from("outbox").insert(outboxRows);
  if (outboxError) fail(outboxError, "No se pudo poner en cola la transmision");

  const { error: updateError } = await client.from("conversations").update({ last_message_at: now }).in("id", ids);
  if (updateError) fail(updateError, "No se pudo actualizar la lista de chats");

  return { matched: conversations.length, enqueued: conversations.length };
}

export async function createReminder(accountId: number, conversationId: number, message: string, dueAt: number): Promise<Reminder> {
  const cleanMessage = message.trim();
  if (!cleanMessage) throw new Error("Mensaje vacio");
  const client = await clientReady();
  if (!client) return sqlite.createReminder(accountId, conversationId, cleanMessage, dueAt);

  const conversation = await getConversationById(conversationId);
  if (!conversation || conversation.account_id !== accountId) throw new Error("Conversacion no encontrada");

  const { data, error } = await client
    .from("reminders")
    .insert({ account_id: accountId, conversation_id: conversationId, message: cleanMessage, due_at: dueAt })
    .select("*")
    .single();
  if (error) fail(error, "No se pudo crear el recordatorio");
  return data as Reminder;
}

export async function listReminders(conversationId: number): Promise<Reminder[]> {
  const client = await clientReady();
  if (!client) return sqlite.listReminders(conversationId);
  const { data, error } = await client
    .from("reminders")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("due_at", { ascending: false })
    .limit(20);
  if (error) fail(error, "No se pudieron leer los recordatorios");
  return (data || []) as Reminder[];
}

export async function cancelReminder(id: number) {
  const client = await clientReady();
  if (!client) return sqlite.cancelReminder(id);
  const { error } = await client.from("reminders").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
  if (error) fail(error, "No se pudo cancelar el recordatorio");
}

export async function processDueReminders(accountId: number, now = nowSeconds(), limit = 10): Promise<number> {
  const client = await clientReady();
  if (!client) return sqlite.processDueReminders(accountId, now, limit);

  const { data, error } = await client
    .from("reminders")
    .select("*, conversations!inner(phone)")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .lte("due_at", now)
    .order("due_at", { ascending: true })
    .limit(limit);
  if (error) fail(error, "No se pudieron leer los recordatorios pendientes");

  const reminders = (data || []) as (Reminder & { conversations?: { phone?: string } })[];
  for (const reminder of reminders) {
    const phone = reminder.conversations?.phone;
    if (!phone) continue;
    await insertMessage(reminder.conversation_id, "human", reminder.message);
    await enqueueOutbox(reminder.account_id, reminder.conversation_id, phone, reminder.message);
    const { error: updateError } = await client
      .from("reminders")
      .update({ status: "sent", sent_at: now })
      .eq("id", reminder.id)
      .eq("status", "pending");
    if (updateError) fail(updateError, "No se pudo marcar el recordatorio como enviado");
  }

  return reminders.length;
}

export async function createPaymentLink(input: {
  account_id: number;
  conversation_id: number;
  preference_id: string;
  title: string;
  amount: number;
  currency: string;
  init_point: string;
  status?: string;
}): Promise<PaymentLink> {
  const client = await clientReady();
  if (!client) return sqlite.createPaymentLink(input);
  const { data, error } = await client
    .from("payment_links")
    .insert({
      account_id: input.account_id,
      conversation_id: input.conversation_id,
      preference_id: input.preference_id,
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      init_point: input.init_point,
      status: input.status || "pending",
    })
    .select("*")
    .single();
  if (error) fail(error, "No se pudo guardar el link de pago");
  return data as PaymentLink;
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

export type {
  Account,
  BroadcastResult,
  Conversation,
  ConversationMode,
  CustomerProfile,
  Message,
  MessageRole,
  OutboxItem,
  PaymentLink,
  PipelineStage,
  QuickReply,
  Reminder,
};
