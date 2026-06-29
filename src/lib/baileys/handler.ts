import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { downloadMediaMessage, type WASocket, type proto } from "@whiskeysockets/baileys";
import pino from "pino";
import {
  getAccountById,
  getConversationById,
  getOrCreateConversation,
  getPendingOutbox,
  getRecentHistory,
  insertMessage,
  markOutboxSent,
  pauseAccountAi,
} from "../store";
import { generateReply } from "../openrouter";
import { hasOnlineStorage, uploadMedia } from "../media-storage";

const botEchoes = new Map<string, number>();
const ECHO_TTL_MS = 5 * 60 * 1000;
const mediaLogger = pino({ level: "silent" });

function phoneFromJid(jid: string) {
  return jid;
}

function isSupportedChatJid(jid: string) {
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
}

function sendJidFromStoredPhone(phone: string) {
  return phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
}

function unwrapMessage(message: proto.IMessage | null | undefined): proto.IMessage | null | undefined {
  return (
    message?.ephemeralMessage?.message ||
    message?.viewOnceMessage?.message ||
    message?.viewOnceMessageV2?.message ||
    message?.documentWithCaptionMessage?.message ||
    message
  );
}

function textFromMessage(message: proto.IMessage | null | undefined) {
  const unwrapped = unwrapMessage(message);
  return (
    unwrapped?.conversation ||
    unwrapped?.extendedTextMessage?.text ||
    unwrapped?.imageMessage?.caption ||
    unwrapped?.videoMessage?.caption ||
    unwrapped?.documentMessage?.caption ||
    ""
  );
}

function mediaDescription(message: proto.IMessage | null | undefined) {
  const unwrapped = unwrapMessage(message);
  if (unwrapped?.imageMessage) return "[Imagen recibida]";
  if (unwrapped?.videoMessage) return "[Video recibido]";
  if (unwrapped?.documentMessage) return `[Documento recibido${unwrapped.documentMessage.fileName ? `: ${unwrapped.documentMessage.fileName}` : ""}]`;
  if (unwrapped?.audioMessage) return "[Audio recibido]";
  if (unwrapped?.stickerMessage) return "[Sticker recibido]";
  if (unwrapped?.albumMessage) return "[Album recibido]";
  if (unwrapped?.contactMessage || unwrapped?.contactsArrayMessage) return "[Contacto recibido]";
  if (unwrapped?.locationMessage || unwrapped?.liveLocationMessage) return "[Ubicacion recibida]";
  return "";
}

function mediaInfo(message: proto.IMessage | null | undefined) {
  const unwrapped = unwrapMessage(message);
  if (unwrapped?.imageMessage) return { type: "image", mime: unwrapped.imageMessage.mimetype || "image/jpeg" };
  if (unwrapped?.videoMessage) return { type: "video", mime: unwrapped.videoMessage.mimetype || "video/mp4" };
  if (unwrapped?.documentMessage) {
    return {
      type: "document",
      mime: unwrapped.documentMessage.mimetype || "application/octet-stream",
      fileName: unwrapped.documentMessage.fileName || undefined,
    };
  }
  if (unwrapped?.audioMessage) return { type: "audio", mime: unwrapped.audioMessage.mimetype || "audio/ogg" };
  if (unwrapped?.stickerMessage) return { type: "sticker", mime: unwrapped.stickerMessage.mimetype || "image/webp" };
  return null;
}

function extensionForMime(mime: string, fileName?: string) {
  const fileExt = fileName ? path.extname(fileName).replace(".", "") : "";
  const baseMime = mime.split(";")[0]?.trim().toLowerCase() || mime;
  if (fileExt) return fileExt.toLowerCase();
  if (baseMime.includes("jpeg")) return "jpg";
  if (baseMime.includes("png")) return "png";
  if (baseMime.includes("webp")) return "webp";
  if (baseMime.includes("gif")) return "gif";
  if (baseMime.includes("mp4")) return "mp4";
  if (baseMime.includes("mpeg")) return "mp3";
  if (baseMime.includes("ogg")) return "ogg";
  if (baseMime.includes("webm")) return "webm";
  if (baseMime.includes("pdf")) return "pdf";
  return "bin";
}

async function bufferFromMediaUrl(mediaUrl: string) {
  if (/^https?:\/\//.test(mediaUrl)) {
    const response = await fetch(mediaUrl);
    return Buffer.from(await response.arrayBuffer());
  }
  const filePath = path.resolve(process.cwd(), "public", mediaUrl.replace(/^\/+/, ""));
  return fs.readFileSync(filePath);
}

async function saveMediaAttachment(accountId: number, sock: WASocket, msg: proto.IWebMessageInfo) {
  const info = mediaInfo(msg.message);
  if (!info) return null;

  try {
    const buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      {
        logger: mediaLogger,
        reuploadRequest: sock.updateMediaMessage,
      },
    );
    const ext = extensionForMime(info.mime, info.fileName);
    const fileName = `${Date.now()}-${randomUUID()}.${ext}`;
    if (hasOnlineStorage()) {
      const url = await uploadMedia(`whatsapp/${accountId}/${fileName}`, buffer, info.mime);
      if (url) return { url, type: info.type };
    }

    const uploadDir = path.resolve(process.cwd(), "public", "uploads", "whatsapp", String(accountId));
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, fileName), buffer);
    return {
      url: `/uploads/whatsapp/${accountId}/${fileName}`,
      type: info.type,
    };
  } catch (err) {
    console.warn(`[bot:${accountId}] no se pudo descargar media`, err);
    return null;
  }
}

function messageType(message: proto.IMessage | null | undefined) {
  const unwrapped = unwrapMessage(message);
  return unwrapped ? Object.keys(unwrapped).find((key) => key !== "messageContextInfo") ?? "desconocido" : "vacio";
}

function echoKey(accountId: number, jid: string, text: string) {
  return `${accountId}:${jid}:${text.trim()}`;
}

function rememberBotEcho(accountId: number, jid: string, text: string) {
  const now = Date.now();
  for (const [key, expiresAt] of botEchoes) {
    if (expiresAt <= now) botEchoes.delete(key);
  }
  botEchoes.set(echoKey(accountId, jid, text), now + ECHO_TTL_MS);
}

function consumeBotEcho(accountId: number, jid: string, text: string) {
  const key = echoKey(accountId, jid, text);
  const expiresAt = botEchoes.get(key);
  if (!expiresAt) return false;
  botEchoes.delete(key);
  return expiresAt > Date.now();
}

export async function handleIncomingMessage(
  accountId: number,
  sock: WASocket,
  msg: proto.IWebMessageInfo,
  sourceType = "unknown",
) {
  const remoteJid = msg.key.remoteJid;
  const kind = messageType(msg.message);
  console.log(
    `[bot:${accountId}] evento mensaje type=${kind} fromMe=${msg.key.fromMe ? "si" : "no"} jid=${remoteJid ?? "sin-jid"}`,
  );
  if (!remoteJid || remoteJid.endsWith("@g.us") || !isSupportedChatJid(remoteJid)) {
    console.log(`[bot:${accountId}] mensaje ignorado por jid no soportado`);
    return;
  }

  const attachment = await saveMediaAttachment(accountId, sock, msg);
  const text = textFromMessage(msg.message) || mediaDescription(msg.message);
  if (!text.trim()) {
    console.log(`[bot:${accountId}] mensaje ignorado sin texto compatible`);
    return;
  }

  const phone = phoneFromJid(remoteJid);
  if (msg.key.fromMe && consumeBotEcho(accountId, remoteJid, text)) {
    console.log(`[bot:${accountId}] eco de IA ignorado ${phone}`);
    return;
  }

  const role = msg.key.fromMe ? "human" : "user";
  console.log(`[bot:${accountId}] <- Mensaje ${role} ${phone}: "${text.slice(0, 120)}"`);

  const convo = await getOrCreateConversation(accountId, phone, msg.pushName ?? undefined);
  await insertMessage(convo.id, role, text, attachment);

  if (msg.key.fromMe) return;
  if (sourceType !== "notify") {
    console.log(`[bot:${accountId}] mensaje guardado sin responder por tipo=${sourceType}`);
    return;
  }

  const account = await getAccountById(accountId);
  const fresh = await getConversationById(convo.id);
  if (!account || !account.ai_enabled || account.ai_status === "paused" || !fresh || fresh.mode !== "AI") return;

  const started = Date.now();
  const history = await getRecentHistory(convo.id, 20);
  console.log(`[bot:${accountId}] llamando LLM con ${history.length} mensajes...`);
  let reply: string;
  try {
    reply = await generateReply(account.system_prompt, history);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "IA pausada por error desconocido.";
    await pauseAccountAi(accountId, reason);
    console.warn(`[bot:${accountId}] ${reason}`);
    return;
  }
  console.log(`[bot:${accountId}] LLM respondio en ${Date.now() - started}ms`);

  await insertMessage(convo.id, "assistant", reply);
  rememberBotEcho(accountId, remoteJid, reply);
  await sock.sendMessage(remoteJid, { text: reply });
  console.log(`[bot:${accountId}] -> Enviado a ${phone}`);
}

export async function flushOutbox(accountId: number, sock: WASocket) {
  const pending = await getPendingOutbox(accountId, 20);
  for (const item of pending) {
    try {
      const jid = sendJidFromStoredPhone(item.phone);
      rememberBotEcho(accountId, jid, item.content);
      if (item.media_url && item.media_type === "image") {
        const caption = item.content === "[Imagen enviada]" ? undefined : item.content;
        rememberBotEcho(accountId, jid, caption || "[Imagen recibida]");
        await sock.sendMessage(jid, { image: await bufferFromMediaUrl(item.media_url), caption });
      } else if (item.media_url && item.media_type === "video") {
        const caption = item.content === "[Video enviado]" ? undefined : item.content;
        rememberBotEcho(accountId, jid, caption || "[Video recibido]");
        await sock.sendMessage(jid, { video: await bufferFromMediaUrl(item.media_url), caption });
      } else if (item.media_url && item.media_type === "audio") {
        await sock.sendMessage(jid, {
          audio: await bufferFromMediaUrl(item.media_url),
          mimetype: "audio/ogg; codecs=opus",
          ptt: false,
        });
      } else {
        await sock.sendMessage(jid, { text: item.content });
      }
      await markOutboxSent(item.id);
      console.log(`[bot:${accountId}] outbox enviado a ${item.phone}`);
    } catch (err) {
      console.warn(`[bot:${accountId}] no se pudo enviar outbox ${item.id}`, err);
    }
  }
}
