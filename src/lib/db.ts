import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { DEFAULT_SYSTEM_PROMPT } from "./system-prompt";

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
  | "Cliente cerrado";

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
  last_message_at: number | null;
  created_at: number;
  last_message_preview?: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  media_url: string | null;
  media_type: string | null;
  remote_id: string | null;
  created_at: number;
}

export interface OutboxItem {
  id: number;
  account_id: number;
  conversation_id: number;
  phone: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  sent: number;
  created_at: number;
}

export interface QuickReply {
  id: number;
  account_id: number;
  title: string;
  text: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
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

export interface PaymentLink {
  id: number;
  account_id: number;
  conversation_id: number;
  preference_id: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  init_point: string;
  created_at: number;
  updated_at: number;
}

export const DEFAULT_QUICK_REPLIES = [
  {
    title: "Inicio",
    text: `¡Hola! 😊 Gracias por contactar a *Almalu Cocinas Integrales y Closets*.

¿En qué proyecto podemos ayudarte?

🔹 Cocina Integral
🔹 Closet
🔹 Centro de Entretenimiento
🔹 Mueble de Baño
🔹 Otro

📸 Envíanos una foto del espacio y las medidas aproximadas para cotizar sin compromiso.

📲 También puedes ver nuestro catálogo aquí:
https://puntoventa-kohl.vercel.app/store/biz_RCzB

✨ Diseños a la medida, materiales de calidad y acabados premium.`,
  },
  {
    title: "Cotización digital",
    text: `En Almalu, nos encanta hacerte la vida más fácil. 💻🔨

Para optimizar tu tiempo y darte una atención mucho más ágil, realizamos nuestra primera cotización de forma 100% digital y sin compromiso.

¿Cómo funciona?

1. Nos envías una foto del espacio y unas medidas aproximadas.
2. Te preparamos un presupuesto estimado adaptado a tu espacio.
3. Si la propuesta se ajusta a lo que buscas, agendamos una visita técnica para rectificar medidas exactas y definir materiales.

No te preocupes si las medidas no son exactas, son solo para el presupuesto inicial.`,
  },
  {
    title: "Calidad ALMALU",
    text: `✅ ¿Por qué elegir Almalu?

Trabajamos con materiales y procesos de calidad para garantizar muebles duraderos, funcionales y con excelentes acabados.

✔️ Materiales resistentes: Melamina, MDF, Alto Brillo, Ultra Mate y materiales HR resistentes a la humedad.
✔️ Cubiertas en Formica, Granito o Cuarzo, según tu proyecto y presupuesto.
✔️ Herrajes premium: bisagras y correderas de cierre suave reforzadas.
✔️ Diseño optimizado para aprovechar cada centímetro.
✔️ Acabados profesionales con corte preciso y tapacantos de PVC.`,
  },
  {
    title: "Ubicación",
    text: `¡Hola! Gracias por escribirnos.

Físicamente nos ubicamos en Playa del Carmen, lo cual nos permite tener una ubicación súper estratégica justo en medio. Por eso, cubrimos sin problema proyectos en Cancún, Tulum y alrededores. 📐🚛

Cuéntame, ¿dónde se ubica tu propiedad y qué tipo de mueble a medida estás buscando?`,
  },
  {
    title: "Comparar precios",
    text: `Al cotizar tu proyecto notarás que los precios varían mucho en el mercado.

En ALMALÚ no competimos solo con precio, sino con calidad real: usamos cortes con escuadradora, tapacantos de PVC de 1 mm termosellados a máquina, correderas reforzadas y bisagras con cierre suave para que tu mueble dure muchos años.

Antes de que tomes una decisión, me gustaría compartirte una guía gratuita en PDF con 10 preguntas clave sobre materiales, herrajes y acabados.

¿Te la puedo mandar por aquí?`,
  },
  {
    title: "Melamina",
    text: `En realidad, la mayoría de los problemas no son por la *melamina*, sino por la forma en que fue fabricado el mueble.

En Almalu utilizamos melamina de calidad con:
✅ Canto de PVC de 1 mm termofusionado en máquina.
✅ Cortes de alta precisión.
✅ Bisagras y correderas de cierre suave.
✅ Excelente sellado para evitar que la humedad afecte el mueble.

Muchas personas creen que "toda la melamina es igual", pero la diferencia está en los materiales y, sobre todo, en el proceso de fabricación.

Si me platicas qué fue lo que pasó con tu mueble anterior, con gusto te explico cómo evitamos ese tipo de problemas. 🙂`,
  },
];

let dbInstance: Database.Database | null = null;

function getDb() {
  if (dbInstance) return dbInstance;

  const dataDir = process.env.VERCEL
    ? path.join(os.tmpdir(), "agente-whatsapp-data")
    : path.resolve(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, "messages.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      phone TEXT,
      status TEXT CHECK(status IN ('disconnected','qr','connecting','connected'))
        NOT NULL DEFAULT 'disconnected',
      qr_string TEXT,
      ai_enabled INTEGER NOT NULL DEFAULT 1,
      ai_status TEXT CHECK(ai_status IN ('active','paused')) NOT NULL DEFAULT 'active',
      ai_error TEXT,
      system_prompt TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      name TEXT,
      mode TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
      label TEXT,
      pipeline_stage TEXT NOT NULL DEFAULT 'Nuevo cliente',
      last_message_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(account_id, phone)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT,
      media_type TEXT,
      remote_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv
      ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT,
      media_type TEXT,
      sent INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_pending
      ON outbox(sent, created_at);

    CREATE TABLE IF NOT EXISTS account_restart (
      account_id INTEGER PRIMARY KEY,
      requested_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS quick_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_quick_replies_account
      ON quick_replies(account_id, sort_order, id);

    CREATE TABLE IF NOT EXISTS customer_profiles (
      conversation_id INTEGER PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
      customer_name TEXT,
      project_type TEXT,
      city TEXT,
      budget TEXT,
      measurements TEXT,
      visit_date TEXT,
      notes TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS payment_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      preference_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'MXN',
      status TEXT NOT NULL DEFAULT 'pending',
      init_point TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_payment_links_conversation
      ON payment_links(conversation_id, created_at);
  `);

  const conversationColumns = db.prepare("PRAGMA table_info(conversations)").all() as { name: string }[];
  const conversationColumnNames = new Set(conversationColumns.map((column) => column.name));
  if (!conversationColumnNames.has("pipeline_stage")) {
    db.prepare("ALTER TABLE conversations ADD COLUMN pipeline_stage TEXT NOT NULL DEFAULT 'Nuevo cliente'").run();
  }

  const accountColumns = db.prepare("PRAGMA table_info(accounts)").all() as { name: string }[];
  const accountColumnNames = new Set(accountColumns.map((column) => column.name));
  if (!accountColumnNames.has("ai_status")) {
    db.prepare("ALTER TABLE accounts ADD COLUMN ai_status TEXT NOT NULL DEFAULT 'active'").run();
  }
  if (!accountColumnNames.has("ai_error")) {
    db.prepare("ALTER TABLE accounts ADD COLUMN ai_error TEXT").run();
  }

  const messageColumns = db.prepare("PRAGMA table_info(messages)").all() as { name: string }[];
  const messageColumnNames = new Set(messageColumns.map((column) => column.name));
  if (!messageColumnNames.has("media_url")) {
    db.prepare("ALTER TABLE messages ADD COLUMN media_url TEXT").run();
  }
  if (!messageColumnNames.has("media_type")) {
    db.prepare("ALTER TABLE messages ADD COLUMN media_type TEXT").run();
  }
  if (!messageColumnNames.has("remote_id")) {
    db.prepare("ALTER TABLE messages ADD COLUMN remote_id TEXT").run();
  }

  const outboxColumns = db.prepare("PRAGMA table_info(outbox)").all() as { name: string }[];
  const outboxColumnNames = new Set(outboxColumns.map((column) => column.name));
  if (!outboxColumnNames.has("media_url")) {
    db.prepare("ALTER TABLE outbox ADD COLUMN media_url TEXT").run();
  }
  if (!outboxColumnNames.has("media_type")) {
    db.prepare("ALTER TABLE outbox ADD COLUMN media_type TEXT").run();
  }

  const count = db.prepare("SELECT COUNT(*) AS total FROM accounts").get() as { total: number };
  if (count.total === 0) {
    const insert = db.prepare(`
      INSERT INTO accounts (name, slug, system_prompt)
      VALUES (?, ?, ?)
    `);
    insert.run("Almalu", "almalu", DEFAULT_SYSTEM_PROMPT);
    insert.run("Web Marketing Pro", "web-marketing-pro", DEFAULT_SYSTEM_PROMPT);
    insert.run("Negocio", "negocio", DEFAULT_SYSTEM_PROMPT);
  }

  const accounts = db.prepare("SELECT id FROM accounts ORDER BY id ASC").all() as { id: number }[];
  const countQuickReplies = db.prepare("SELECT COUNT(*) AS total FROM quick_replies WHERE account_id = ?");
  const insertQuickReply = db.prepare(`
    INSERT INTO quick_replies (account_id, title, text, sort_order)
    VALUES (?, ?, ?, ?)
  `);
  for (const account of accounts) {
    const existing = countQuickReplies.get(account.id) as { total: number };
    if (existing.total === 0) {
      DEFAULT_QUICK_REPLIES.forEach((reply, index) => {
        insertQuickReply.run(account.id, reply.title, reply.text, index);
      });
    }
  }

  dbInstance = db;
  return db;
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "cuenta";
}

export function listAccounts(): Account[] {
  return getDb().prepare("SELECT * FROM accounts ORDER BY id ASC").all() as Account[];
}

export function createAccount(name: string): Account {
  const db = getDb();
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (db.prepare("SELECT id FROM accounts WHERE slug = ?").get(slug)) {
    slug = `${base}-${n++}`;
  }
  const result = db
    .prepare("INSERT INTO accounts (name, slug, system_prompt) VALUES (?, ?, ?)")
    .run(name.trim(), slug, DEFAULT_SYSTEM_PROMPT);
  return getAccountById(Number(result.lastInsertRowid))!;
}

export function getAccountById(id: number): Account | null {
  return (getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Account | undefined) ?? null;
}

export function setAccountState(
  accountId: number,
  input: Partial<Pick<Account, "status" | "qr_string" | "phone">>,
) {
  const current = getAccountById(accountId);
  if (!current) return;
  getDb()
    .prepare(`
      UPDATE accounts
      SET status = ?, qr_string = ?, phone = ?, updated_at = unixepoch()
      WHERE id = ?
    `)
    .run(
      input.status ?? current.status,
      Object.prototype.hasOwnProperty.call(input, "qr_string") ? input.qr_string : current.qr_string,
      Object.prototype.hasOwnProperty.call(input, "phone") ? input.phone : current.phone,
      accountId,
    );
}

export function updateAccountSettings(accountId: number, input: { name?: string; system_prompt?: string; ai_enabled?: boolean }) {
  const current = getAccountById(accountId);
  if (!current) return null;
  const nextAiEnabled = typeof input.ai_enabled === "boolean" ? (input.ai_enabled ? 1 : 0) : current.ai_enabled;
  const shouldReactivateAi = nextAiEnabled === 1 && (input.ai_enabled === true || current.ai_status === "paused");
  getDb()
    .prepare(`
      UPDATE accounts
      SET name = ?, system_prompt = ?, ai_enabled = ?, ai_status = ?, ai_error = ?, updated_at = unixepoch()
      WHERE id = ?
    `)
    .run(
      input.name?.trim() || current.name,
      input.system_prompt?.trim() || current.system_prompt,
      nextAiEnabled,
      shouldReactivateAi ? "active" : current.ai_status,
      shouldReactivateAi ? null : current.ai_error,
      accountId,
    );
  return getAccountById(accountId);
}

export function pauseAccountAi(accountId: number, reason: string) {
  getDb()
    .prepare("UPDATE accounts SET ai_status = 'paused', ai_error = ?, updated_at = unixepoch() WHERE id = ?")
    .run(reason.slice(0, 500), accountId);
}

export function requestAccountRestart(accountId: number) {
  getDb()
    .prepare("INSERT OR REPLACE INTO account_restart (account_id, requested_at) VALUES (?, unixepoch())")
    .run(accountId);
}

export function consumeAccountRestarts(): number[] {
  const db = getDb();
  const rows = db.prepare("SELECT account_id FROM account_restart").all() as { account_id: number }[];
  db.prepare("DELETE FROM account_restart").run();
  return rows.map((row) => row.account_id);
}

export function getOrCreateConversation(accountId: number, phone: string, name?: string): Conversation {
  const db = getDb();
  const found = db
    .prepare("SELECT * FROM conversations WHERE account_id = ? AND phone = ?")
    .get(accountId, phone) as Conversation | undefined;
  if (found) {
    if (name && found.name !== name) {
      db.prepare("UPDATE conversations SET name = ? WHERE id = ?").run(name, found.id);
      return getConversationById(found.id)!;
    }
    return found;
  }
  const result = db
    .prepare("INSERT INTO conversations (account_id, phone, name) VALUES (?, ?, ?)")
    .run(accountId, phone, name ?? null);
  return getConversationById(Number(result.lastInsertRowid))!;
}

export function updateConversationName(accountId: number, phone: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) return;
  getDb()
    .prepare("UPDATE conversations SET name = ? WHERE account_id = ? AND phone = ?")
    .run(cleanName, accountId, phone);
}

export function getConversationById(id: number): Conversation | null {
  return (getDb().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Conversation | undefined) ?? null;
}

export function insertMessage(
  conversationId: number,
  role: MessageRole,
  content: string,
  media?: { url: string; type: string } | null,
  remoteId?: string | null,
) {
  const db = getDb();
  return db.transaction(() => {
    const result = db
      .prepare("INSERT INTO messages (conversation_id, role, content, media_url, media_type, remote_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(conversationId, role, content, media?.url ?? null, media?.type ?? null, remoteId ?? null);
    db.prepare("UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?").run(conversationId);
    return Number(result.lastInsertRowid);
  })();
}

export function deleteMessageByRemoteId(accountId: number, remoteId: string) {
  if (!remoteId.trim()) return;
  const db = getDb();
  db.transaction(() => {
    const row = db
      .prepare(
        `SELECT m.conversation_id
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.account_id = ? AND m.remote_id = ?
         LIMIT 1`,
      )
      .get(accountId, remoteId) as { conversation_id: number } | undefined;
    db.prepare(
      `DELETE FROM messages
       WHERE id IN (
         SELECT m.id
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.account_id = ? AND m.remote_id = ?
       )`,
    ).run(accountId, remoteId);
    if (row) {
      const latest = db
        .prepare("SELECT created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
        .get(row.conversation_id) as { created_at: number } | undefined;
      db.prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?").run(latest?.created_at ?? null, row.conversation_id);
    }
  })();
}

export function deleteMessages(conversationId: number, messageIds: number[]) {
  const ids = Array.from(new Set(messageIds.map(Number).filter(Number.isFinite)));
  if (ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  db.transaction(() => {
    db.prepare(`DELETE FROM messages WHERE conversation_id = ? AND id IN (${placeholders})`).run(conversationId, ...ids);
    const latest = db
      .prepare("SELECT created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
      .get(conversationId) as { created_at: number } | undefined;
    db.prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?").run(latest?.created_at ?? null, conversationId);
  })();
}

export function getMessages(conversationId: number, limit = 80): Message[] {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(conversationId, limit) as Message[];
  return rows.reverse();
}

export function getRecentHistory(conversationId: number, limit = 20): Message[] {
  return getMessages(conversationId, limit);
}

export function listConversations(accountId: number): Conversation[] {
  return getDb()
    .prepare(`
      SELECT c.*,
        (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1)
          AS last_message_preview
      FROM conversations c
      WHERE c.account_id = ?
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    `)
    .all(accountId) as Conversation[];
}

export function setMode(conversationId: number, mode: ConversationMode) {
  getDb().prepare("UPDATE conversations SET mode = ? WHERE id = ?").run(mode, conversationId);
}

export function setConversationLabel(conversationId: number, label: string | null) {
  getDb().prepare("UPDATE conversations SET label = ? WHERE id = ?").run(label, conversationId);
}

export function setPipelineStage(conversationId: number, stage: PipelineStage) {
  getDb().prepare("UPDATE conversations SET pipeline_stage = ? WHERE id = ?").run(stage, conversationId);
}

export function enqueueOutbox(
  accountId: number,
  conversationId: number,
  phone: string,
  content: string,
  media?: { url: string; type: string } | null,
) {
  getDb()
    .prepare("INSERT INTO outbox (account_id, conversation_id, phone, content, media_url, media_type) VALUES (?, ?, ?, ?, ?, ?)")
    .run(accountId, conversationId, phone, content, media?.url ?? null, media?.type ?? null);
}

export function getPendingOutbox(accountId: number, limit = 20): OutboxItem[] {
  return getDb()
    .prepare("SELECT * FROM outbox WHERE account_id = ? AND sent = 0 ORDER BY created_at ASC LIMIT ?")
    .all(accountId, limit) as OutboxItem[];
}

export function markOutboxSent(id: number) {
  getDb().prepare("UPDATE outbox SET sent = 1 WHERE id = ?").run(id);
}

export function createPaymentLink(input: {
  account_id: number;
  conversation_id: number;
  preference_id: string;
  title: string;
  amount: number;
  currency: string;
  init_point: string;
  status?: string;
}): PaymentLink {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO payment_links
        (account_id, conversation_id, preference_id, title, amount, currency, init_point, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.account_id,
      input.conversation_id,
      input.preference_id,
      input.title,
      input.amount,
      input.currency,
      input.init_point,
      input.status || "pending",
    );
  return db.prepare("SELECT * FROM payment_links WHERE id = ?").get(result.lastInsertRowid) as PaymentLink;
}

export function deleteConversation(id: number) {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
    db.prepare("DELETE FROM outbox WHERE conversation_id = ? AND sent = 0").run(id);
    db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  })();
}

export function listQuickReplies(accountId: number): QuickReply[] {
  return getDb()
    .prepare("SELECT * FROM quick_replies WHERE account_id = ? ORDER BY sort_order ASC, id ASC")
    .all(accountId) as QuickReply[];
}

export function createQuickReply(accountId: number, input: { title: string; text: string }) {
  const db = getDb();
  const nextOrder = (db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM quick_replies WHERE account_id = ?")
    .get(accountId) as { nextOrder: number }).nextOrder;
  const result = db
    .prepare("INSERT INTO quick_replies (account_id, title, text, sort_order) VALUES (?, ?, ?, ?)")
    .run(accountId, input.title.trim(), input.text.trim(), nextOrder);
  return db.prepare("SELECT * FROM quick_replies WHERE id = ?").get(result.lastInsertRowid) as QuickReply;
}

export function updateQuickReply(id: number, input: { title: string; text: string }) {
  getDb()
    .prepare("UPDATE quick_replies SET title = ?, text = ?, updated_at = unixepoch() WHERE id = ?")
    .run(input.title.trim(), input.text.trim(), id);
}

export function deleteQuickReply(id: number) {
  getDb().prepare("DELETE FROM quick_replies WHERE id = ?").run(id);
}

export function getCustomerProfile(conversationId: number): CustomerProfile {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM customer_profiles WHERE conversation_id = ?")
    .get(conversationId) as CustomerProfile | undefined;
  if (existing) return existing;
  db.prepare("INSERT INTO customer_profiles (conversation_id) VALUES (?)").run(conversationId);
  return db.prepare("SELECT * FROM customer_profiles WHERE conversation_id = ?").get(conversationId) as CustomerProfile;
}

export function updateCustomerProfile(
  conversationId: number,
  input: Partial<Omit<CustomerProfile, "conversation_id" | "updated_at">>,
) {
  getCustomerProfile(conversationId);
  getDb()
    .prepare(`
      UPDATE customer_profiles
      SET customer_name = ?,
          project_type = ?,
          city = ?,
          budget = ?,
          measurements = ?,
          visit_date = ?,
          notes = ?,
          updated_at = unixepoch()
      WHERE conversation_id = ?
    `)
    .run(
      input.customer_name?.trim() || null,
      input.project_type?.trim() || null,
      input.city?.trim() || null,
      input.budget?.trim() || null,
      input.measurements?.trim() || null,
      input.visit_date?.trim() || null,
      input.notes?.trim() || null,
      conversationId,
    );
  return getCustomerProfile(conversationId);
}
