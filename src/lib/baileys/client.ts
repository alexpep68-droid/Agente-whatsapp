import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcodeTerminal from "qrcode-terminal";
import { processDueReminders, setAccountState, type Account } from "../store";
import {
  flushOutbox,
  handleContactUpdate,
  handleIncomingMessage,
  handleMessageDelete,
  handleMessageUpdate,
  refreshKnownContacts,
} from "./handler";

export interface BotHandle {
  accountId: number;
  sock: WASocket;
  shutdown: (logout?: boolean) => Promise<void>;
}

const logger = pino({ level: "silent" });

function authDirFor(account: Account) {
  if (process.env.VERCEL) return path.join(os.tmpdir(), "agente-whatsapp-auth", account.slug);
  return path.resolve(process.cwd(), "auth", account.slug);
}

function phoneFromSocket(sock: WASocket) {
  const id = sock.user?.id || "";
  return id.split(":")[0]?.split("@")[0] || null;
}

export async function startAccountBot(account: Account, onReconnect: (accountId: number, delayMs: number) => void) {
  const accountId = account.id;
  fs.mkdirSync(authDirFor(account), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDirFor(account));

  let version: [number, number, number] | undefined;
  try {
    const fetched = await fetchLatestBaileysVersion();
    version = fetched.version;
  } catch (err) {
    console.warn(`[bot:${accountId}] No se pudo obtener la version reciente de Baileys`, err);
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  let connected = false;
  const outboxTimer = setInterval(() => {
    if (connected) void flushOutbox(accountId, sock);
  }, 2000);
  const reminderTimer = setInterval(() => {
    if (connected) {
      void processDueReminders(accountId).catch((err) => {
        console.error(`[bot:${accountId}] error procesando recordatorios`, err);
      });
    }
  }, 10000);

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("messages.upsert", (event) => {
    console.log(`[bot:${accountId}] messages.upsert type=${event.type} count=${event.messages.length}`);
    for (const message of event.messages) {
      void handleIncomingMessage(accountId, sock, message, event.type).catch((err) => {
        console.error(`[bot:${accountId}] error procesando mensaje`, err);
      });
    }
  });
  sock.ev.on("messages.update", (updates) => {
    for (const update of updates) {
      void handleMessageUpdate(accountId, update).catch((err) => {
        console.error(`[bot:${accountId}] error sincronizando actualizacion de mensaje`, err);
      });
    }
  });
  sock.ev.on("messages.delete", (event) => {
    if ("all" in event) return;
    for (const key of event.keys) {
      void handleMessageDelete(accountId, key).catch((err) => {
        console.error(`[bot:${accountId}] error sincronizando borrado de mensaje`, err);
      });
    }
  });
  sock.ev.on("contacts.upsert", (contacts) => {
    for (const contact of contacts) {
      void handleContactUpdate(accountId, contact, sock).catch((err) => {
        console.error(`[bot:${accountId}] error sincronizando contacto`, err);
      });
    }
  });
  sock.ev.on("contacts.update", (contacts) => {
    for (const contact of contacts) {
      void handleContactUpdate(accountId, contact, sock).catch((err) => {
        console.error(`[bot:${accountId}] error actualizando contacto`, err);
      });
    }
  });
  sock.ev.on("messaging-history.set", (event) => {
    console.log(
      `[bot:${accountId}] historial recibido chats=${event.chats.length} mensajes=${event.messages.length}`,
    );
    for (const contact of event.contacts) {
      void handleContactUpdate(accountId, contact, sock).catch((err) => {
        console.error(`[bot:${accountId}] error sincronizando contacto de historial`, err);
      });
    }
    for (const chat of event.chats) {
      void handleContactUpdate(accountId, chat, sock).catch((err) => {
        console.error(`[bot:${accountId}] error sincronizando nombre de chat`, err);
      });
    }
    for (const message of event.messages) {
      void handleIncomingMessage(accountId, sock, message, "history").catch((err) => {
        console.error(`[bot:${accountId}] error procesando historial`, err);
      });
    }
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      void setAccountState(accountId, { status: "qr", qr_string: qr, phone: null });
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === "connecting") {
      void setAccountState(accountId, { status: "connecting" });
    }

    if (connection === "open") {
      connected = true;
      void setAccountState(accountId, { status: "connected", qr_string: null, phone: phoneFromSocket(sock) });
      void refreshKnownContacts(accountId, sock).catch((err) => {
        console.error(`[bot:${accountId}] error refrescando contactos`, err);
      });
      console.log(`[bot:${accountId}] conectado`);
    }

    if (connection === "close") {
      connected = false;
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      console.warn(`[bot:${accountId}] conexion cerrada code=${code ?? "desconocido"}`);
      if (code === DisconnectReason.loggedOut) {
        void setAccountState(accountId, { status: "disconnected", qr_string: null, phone: null });
        return;
      }
      onReconnect(accountId, code === 440 ? 15000 : 5000);
    }
  });

  return {
    accountId,
    sock,
    shutdown: async (logout = false) => {
      clearInterval(outboxTimer);
      clearInterval(reminderTimer);
      if (logout) {
        try {
          await sock.logout();
        } catch {}
      }
      try {
        sock.end(undefined);
      } catch {}
    },
  } satisfies BotHandle;
}
