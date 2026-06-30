"use client";

import type { Account } from "./types";

export function DashboardHeader({
  accounts,
  activeId,
  onSelect,
  onAdd,
  onBroadcast,
  onSettings,
  onDisconnect,
}: {
  accounts: Account[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onBroadcast: () => void;
  onSettings: () => void;
  onDisconnect: () => void;
}) {
  const active = accounts.find((account) => account.id === activeId);
  const aiLabel = !active?.ai_enabled ? "IA apagada" : active.ai_status === "paused" ? "IA pausada" : "IA activa";
  const aiClass =
    !active?.ai_enabled || active?.ai_status === "paused"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <header className="flex h-12 items-center justify-between bg-emerald-700 px-2 text-white">
      <div className="flex h-full items-end gap-1">
        {accounts.map((account) => (
          <button
            key={account.id}
            className={`h-9 min-w-28 rounded-t border border-emerald-900 px-3 text-left text-sm ${
              account.id === activeId ? "bg-white text-zinc-900" : "bg-emerald-600 text-white"
            }`}
            onClick={() => onSelect(account.id)}
            type="button"
          >
            {account.name}
          </button>
        ))}
        <button className="mb-1 h-8 rounded border border-white/40 px-3 text-sm" onClick={onAdd} type="button">
          Agregar
        </button>
      </div>
      <div className="flex items-center gap-4 pr-2 text-sm">
        <span>{active?.phone ? `+${active.phone}` : active?.status || "sin cuenta"}</span>
        <span className={`rounded-full border px-3 py-1 font-semibold ${aiClass}`} title={active?.ai_error || aiLabel}>
          {aiLabel}
        </span>
        <button className="rounded border border-white/40 px-3 py-1" onClick={onBroadcast} type="button">
          Transmisión
        </button>
        <button className="rounded border border-white/40 px-3 py-1" onClick={onSettings} type="button">
          Ajustes IA
        </button>
        <button className="rounded border border-white/40 px-3 py-1" onClick={onDisconnect} type="button">
          Desconectar
        </button>
        <span>v0.1</span>
      </div>
    </header>
  );
}
