import "./env-loader";
import fs from "node:fs";
import path from "node:path";
import { consumeAccountRestarts, getAccountById, listAccounts, setAccountState } from "../src/lib/store";
import { startAccountBot, type BotHandle } from "../src/lib/baileys/client";

const handles = new Map<number, BotHandle>();
const reconnectTimers = new Map<number, NodeJS.Timeout>();

async function stopAccount(accountId: number, removeAuth = false) {
  const handle = handles.get(accountId);
  if (handle) {
    await handle.shutdown(removeAuth);
    handles.delete(accountId);
  }
  const timer = reconnectTimers.get(accountId);
  if (timer) clearTimeout(timer);
  reconnectTimers.delete(accountId);

  if (removeAuth) {
    const account = await getAccountById(accountId);
    if (account) {
      fs.rmSync(path.resolve(process.cwd(), "auth", account.slug), { recursive: true, force: true });
    }
    await setAccountState(accountId, { status: "disconnected", qr_string: null, phone: null });
  }
}

function scheduleReconnect(accountId: number, delayMs: number) {
  if (reconnectTimers.has(accountId)) return;
  const timer = setTimeout(() => {
    reconnectTimers.delete(accountId);
    void startAccount(accountId);
  }, delayMs);
  reconnectTimers.set(accountId, timer);
}

async function startAccount(accountId: number) {
  const account = await getAccountById(accountId);
  if (!account) return;
  await stopAccount(accountId);
  console.log(`[bot:${accountId}] iniciando cuenta ${account.name}`);
  const handle = await startAccountBot(account, scheduleReconnect);
  handles.set(accountId, handle);
}

async function main() {
  console.log("[bot] iniciando cuentas");
  for (const account of await listAccounts()) {
    await startAccount(account.id);
  }

  setInterval(() => {
    void (async () => {
    for (const accountId of await consumeAccountRestarts()) {
      void stopAccount(accountId, true).then(() => startAccount(accountId));
    }
    })().catch((err) => console.error("[bot] error revisando reinicios", err));
  }, 1000);
}

process.on("SIGINT", () => {
  Promise.all([...handles.keys()].map((id) => stopAccount(id))).finally(() => process.exit(0));
});

void main().catch((err) => {
  console.error("[bot] error fatal", err);
  process.exit(1);
});
