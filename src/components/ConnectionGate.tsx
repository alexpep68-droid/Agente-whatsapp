"use client";

import { useEffect, useMemo, useState } from "react";
import { AccountSettingsModal } from "./AccountSettingsModal";
import { ConversationList } from "./ConversationList";
import { ConversationPanel } from "./ConversationPanel";
import { DashboardHeader } from "./DashboardHeader";
import { QRScreen } from "./QRScreen";
import type { Account, Conversation } from "./types";

interface Status {
  status: string;
  qrPng: string | null;
  phone: string | null;
}

export function ConnectionGate() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>({ status: "disconnected", qrPng: null, phone: null });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  const active = useMemo(() => accounts.find((account) => account.id === activeId) ?? null, [accounts, activeId]);

  async function loadAccounts() {
    const res = await fetch("/api/accounts");
    const json = (await res.json()) as { accounts: Account[] };
    setAccounts(json.accounts);
    setActiveId((current) => current ?? json.accounts[0]?.id ?? null);
  }

  async function loadConversations(accountId = activeId) {
    if (!accountId) return;
    const res = await fetch(`/api/conversations?accountId=${accountId}`);
    const json = (await res.json()) as { conversations: Conversation[] };
    setConversations(json.conversations);
    setSelected((current) => {
      if (!current) return json.conversations[0] ?? null;
      return json.conversations.find((conversation) => conversation.id === current.id) ?? json.conversations[0] ?? null;
    });
  }

  async function loadStatus(accountId = activeId) {
    if (!accountId) return;
    const res = await fetch(`/api/accounts/${accountId}/status`);
    const json = (await res.json()) as Status;
    setStatus(json);
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setSelected(null);
    void loadStatus(activeId);
    void loadConversations(activeId);
    const timer = setInterval(() => {
      void loadStatus(activeId);
      void loadConversations(activeId);
      void loadAccounts();
    }, 2000);
    return () => clearInterval(timer);
  }, [activeId]);

  async function addAccount() {
    const name = newAccountName.trim();
    if (!name) return;
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = (await res.json()) as { account: Account };
    setNewAccountName("");
    setShowAddAccount(false);
    await loadAccounts();
    setActiveId(json.account.id);
  }

  async function connect() {
    if (!activeId) return;
    await fetch(`/api/accounts/${activeId}/connect`, { method: "POST" });
    await loadStatus(activeId);
  }

  async function disconnect() {
    if (!activeId) return;
    await fetch(`/api/accounts/${activeId}/disconnect`, { method: "POST" });
    setShowDisconnectConfirm(false);
    await loadStatus(activeId);
  }

  function updateSavedAccount(saved: Account) {
    setAccounts((current) => current.map((account) => (account.id === saved.id ? saved : account)));
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <DashboardHeader
        accounts={accounts}
        activeId={activeId}
        onAdd={() => setShowAddAccount(true)}
        onDisconnect={() => setShowDisconnectConfirm(true)}
        onSelect={setActiveId}
        onSettings={() => setShowAccountSettings(true)}
      />
      {!active ? (
        <main className="grid flex-1 place-items-center">Cargando...</main>
      ) : status.status !== "connected" ? (
        <QRScreen account={active} qrPng={status.qrPng} status={status.status} onConnect={connect} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <ConversationList conversations={conversations} selectedId={selected?.id ?? null} onSelect={setSelected} />
          <ConversationPanel conversation={selected} onChanged={() => void loadConversations()} />
        </div>
      )}
      {showAddAccount ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <form
            className="w-full max-w-sm rounded-md bg-white p-5 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              void addAccount();
            }}
          >
            <h2 className="text-lg font-bold">Agregar cuenta</h2>
            <p className="mt-1 text-sm text-zinc-500">Crea un espacio separado para otro negocio o numero.</p>
            <input
              autoFocus
              className="mt-4 h-11 w-full rounded border border-zinc-300 px-3 outline-none focus:border-emerald-500"
              onChange={(event) => setNewAccountName(event.target.value)}
              placeholder="Ej. Marketing, Carpinteria..."
              value={newAccountName}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="h-10 rounded border border-zinc-300 px-4 text-sm font-semibold"
                onClick={() => {
                  setNewAccountName("");
                  setShowAddAccount(false);
                }}
                type="button"
              >
                Cancelar
              </button>
              <button className="h-10 rounded bg-emerald-600 px-4 text-sm font-semibold text-white" type="submit">
                Crear
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {showDisconnectConfirm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-md bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold">Desconectar cuenta</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Se borrara la sesion local de {active?.name}. Para volver a usarla tendras que escanear un QR nuevo.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="h-10 rounded border border-zinc-300 px-4 text-sm font-semibold"
                onClick={() => setShowDisconnectConfirm(false)}
                type="button"
              >
                Cancelar
              </button>
              <button className="h-10 rounded bg-red-600 px-4 text-sm font-semibold text-white" onClick={disconnect} type="button">
                Desconectar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showAccountSettings && active ? (
        <AccountSettingsModal
          account={active}
          onClose={() => setShowAccountSettings(false)}
          onSaved={updateSavedAccount}
        />
      ) : null}
    </div>
  );
}
