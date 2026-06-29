"use client";

import type { ConversationMode } from "./types";

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: ConversationMode;
  onChange: (mode: ConversationMode) => void;
}) {
  return (
    <div className="grid h-10 w-44 grid-cols-2 rounded border border-zinc-300 bg-white p-1">
      <button
        className={`rounded text-sm font-semibold ${mode === "AI" ? "bg-emerald-600 text-white" : "text-zinc-600"}`}
        onClick={() => onChange("AI")}
        type="button"
      >
        IA
      </button>
      <button
        className={`rounded text-sm font-semibold ${mode === "HUMAN" ? "bg-amber-500 text-white" : "text-zinc-600"}`}
        onClick={() => onChange("HUMAN")}
        type="button"
      >
        Humano
      </button>
    </div>
  );
}
