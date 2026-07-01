"use client";

import { useEffect, useMemo, useState } from "react";
import { AccountSettingsModal } from "./AccountSettingsModal";
import { ConversationList } from "./ConversationList";
import { ConversationPanel } from "./ConversationPanel";
import { DashboardHeader } from "./DashboardHeader";
import { CHAT_LABELS } from "./labels";
import { PIPELINE_STAGES } from "./pipeline";
import { QRScreen } from "./QRScreen";
import type { Account, Conversation, ConversationMode, PipelineStage } from "./types";

interface Status {
  status: string;
  qrPng: string | null;
  phone: string | null;
}

function delayLabel(amount: string, unit: string) {
  const value = Math.max(1, Number(amount) || 1);
  if (unit === "minutes") return `${value} ${value === 1 ? "minuto" : "minutos"}`;
  return `${value} ${value === 1 ? "segundo" : "segundos"}`;
}

function scheduledLabel(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
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
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastDraft, setBroadcastDraft] = useState({
    label: "",
    pipelineStage: "",
    mode: "",
    message: "",
    sendPacing: "immediate",
    delayAmount: "1",
    delayUnit: "minutes",
    startAt: "",
  });
  const [broadcastError, setBroadcastError] = useState("");
  const [broadcastResult, setBroadcastResult] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

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

  async function sendBroadcast() {
    if (!activeId) return;
    const delayAmount = Math.max(0, Number(broadcastDraft.delayAmount) || 0);
    const delaySeconds =
      broadcastDraft.sendPacing === "paced"
        ? Math.min(24 * 60 * 60, Math.floor(delayAmount * (broadcastDraft.delayUnit === "minutes" ? 60 : 1)))
        : 0;
    const startAt = broadcastDraft.startAt ? Math.floor(new Date(broadcastDraft.startAt).getTime() / 1000) : 0;
    setBroadcastError("");
    setBroadcastResult("");
    if (broadcastDraft.sendPacing === "paced" && delaySeconds <= 0) {
      setBroadcastError("Indica un tiempo mayor a cero entre cada mensaje.");
      return;
    }
    if (broadcastDraft.startAt && !Number.isFinite(startAt)) {
      setBroadcastError("Selecciona una fecha y hora valida para iniciar.");
      return;
    }
    setSendingBroadcast(true);
    try {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: activeId,
          message: broadcastDraft.message,
          label: broadcastDraft.label || null,
          pipelineStage: (broadcastDraft.pipelineStage || null) as PipelineStage | null,
          mode: (broadcastDraft.mode || null) as ConversationMode | null,
          delaySeconds,
          startAt,
        }),
      });
      const json = (await res.json()) as { error?: string; matched?: number; enqueued?: number };
      if (!res.ok) {
        setBroadcastError(json.error || "No se pudo crear la transmision");
        return;
      }
      const pacingText =
        delaySeconds > 0
          ? ` Se enviaran uno por uno cada ${delayLabel(broadcastDraft.delayAmount, broadcastDraft.delayUnit)}.`
          : "";
      const startText = scheduledLabel(broadcastDraft.startAt);
      setBroadcastResult(
        `Lista: ${json.enqueued || 0} de ${json.matched || 0} clientes quedaron en cola.${startText ? ` Inicia: ${startText}.` : ""}${pacingText}`,
      );
      setBroadcastDraft((current) => ({ ...current, message: "" }));
      await loadConversations(activeId);
    } finally {
      setSendingBroadcast(false);
    }
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
        onBroadcast={() => {
          setBroadcastError("");
          setBroadcastResult("");
          setShowBroadcast(true);
        }}
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
      {showBroadcast && active ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-md bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-lg font-bold">Transmisión</h2>
                <p className="text-sm text-zinc-500">Envio masivo desde {active.name}, filtrado por clientes.</p>
              </div>
              <button className="h-10 rounded border border-zinc-300 px-4 text-sm font-semibold" onClick={() => setShowBroadcast(false)} type="button">
                Cerrar
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block text-sm font-semibold">
                  Etiqueta
                  <select
                    className="mt-1 h-11 w-full rounded border border-zinc-300 bg-white px-3 font-normal"
                    onChange={(event) => setBroadcastDraft((current) => ({ ...current, label: event.target.value }))}
                    value={broadcastDraft.label}
                  >
                    <option value="">Todas</option>
                    {CHAT_LABELS.map((label) => (
                      <option key={label.name} value={label.name}>
                        {label.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Embudo
                  <select
                    className="mt-1 h-11 w-full rounded border border-zinc-300 bg-white px-3 font-normal"
                    onChange={(event) => setBroadcastDraft((current) => ({ ...current, pipelineStage: event.target.value }))}
                    value={broadcastDraft.pipelineStage}
                  >
                    <option value="">Todos</option>
                    {PIPELINE_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Modo
                  <select
                    className="mt-1 h-11 w-full rounded border border-zinc-300 bg-white px-3 font-normal"
                    onChange={(event) => setBroadcastDraft((current) => ({ ...current, mode: event.target.value }))}
                    value={broadcastDraft.mode}
                  >
                    <option value="">IA y Humano</option>
                    <option value="AI">Solo IA</option>
                    <option value="HUMAN">Solo Humano</option>
                  </select>
                </label>
              </div>
              <label className="mt-4 block text-sm font-semibold">
                Mensaje
                <textarea
                  className="mt-1 min-h-44 w-full rounded border border-zinc-300 p-3 font-normal outline-none focus:border-emerald-500"
                  onChange={(event) => setBroadcastDraft((current) => ({ ...current, message: event.target.value }))}
                  placeholder="Escribe el mensaje que se enviara a los clientes filtrados."
                  value={broadcastDraft.message}
                />
              </label>
              <div className="mt-4 rounded border border-zinc-200 p-3">
                <p className="text-sm font-semibold">Forma de envio</p>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_120px_140px]">
                  <label className="block text-sm font-semibold">
                    Ritmo
                    <select
                      className="mt-1 h-11 w-full rounded border border-zinc-300 bg-white px-3 font-normal"
                      onChange={(event) => setBroadcastDraft((current) => ({ ...current, sendPacing: event.target.value }))}
                      value={broadcastDraft.sendPacing}
                    >
                      <option value="immediate">Lo antes posible</option>
                      <option value="paced">Uno por uno con pausa</option>
                    </select>
                  </label>
                  <label className="block text-sm font-semibold">
                    Diferencia
                    <input
                      className="mt-1 h-11 w-full rounded border border-zinc-300 px-3 font-normal disabled:bg-zinc-100 disabled:text-zinc-400"
                      disabled={broadcastDraft.sendPacing !== "paced"}
                      min="1"
                      onChange={(event) => setBroadcastDraft((current) => ({ ...current, delayAmount: event.target.value }))}
                      type="number"
                      value={broadcastDraft.delayAmount}
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Unidad
                    <select
                      className="mt-1 h-11 w-full rounded border border-zinc-300 bg-white px-3 font-normal disabled:bg-zinc-100 disabled:text-zinc-400"
                      disabled={broadcastDraft.sendPacing !== "paced"}
                      onChange={(event) => setBroadcastDraft((current) => ({ ...current, delayUnit: event.target.value }))}
                      value={broadcastDraft.delayUnit}
                    >
                      <option value="seconds">Segundos</option>
                      <option value="minutes">Minutos</option>
                    </select>
                  </label>
                </div>
                <label className="mt-3 block text-sm font-semibold">
                  Programar inicio
                  <input
                    className="mt-1 h-11 w-full rounded border border-zinc-300 px-3 font-normal"
                    onChange={(event) => setBroadcastDraft((current) => ({ ...current, startAt: event.target.value }))}
                    type="datetime-local"
                    value={broadcastDraft.startAt}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    Si lo dejas vacio, empieza en cuanto el bot tome la cola.
                  </span>
                </label>
              </div>
              <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Revisa bien el filtro antes de enviar. Los mensajes entran a la cola del bot y se mandan por WhatsApp segun el ritmo elegido.
              </div>
              {broadcastError ? <div className="mt-3 rounded bg-red-50 p-3 text-sm font-semibold text-red-700">{broadcastError}</div> : null}
              {broadcastResult ? <div className="mt-3 rounded bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{broadcastResult}</div> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 p-5">
              <button className="h-10 rounded border border-zinc-300 px-4 text-sm font-semibold" onClick={() => setShowBroadcast(false)} type="button">
                Cancelar
              </button>
              <button
                className="h-10 rounded bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={sendingBroadcast || !broadcastDraft.message.trim()}
                onClick={() => void sendBroadcast()}
                type="button"
              >
                {sendingBroadcast ? "Preparando..." : "Enviar transmisión"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
