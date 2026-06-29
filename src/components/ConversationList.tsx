"use client";

import { useMemo, useState } from "react";
import { CHAT_LABELS, labelColor, parseLabels } from "./labels";
import { PIPELINE_STAGES, pipelineStageColor } from "./pipeline";
import type { Conversation, PipelineStage } from "./types";

function initials(value: string) {
  return value.trim().slice(0, 1).toUpperCase() || "?";
}

function relative(ts: number | null) {
  if (!ts) return "";
  const mins = Math.max(0, Math.floor((Date.now() - ts * 1000) / 60000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  return `${Math.floor(hrs / 24)} d`;
}

function chatLabel(value: string) {
  return value.replace("@s.whatsapp.net", "").replace("@lid", "");
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (conversation: Conversation) => void;
}) {
  const [filter, setFilter] = useState<"all" | "favorites" | "groups">("all");
  const [labelFilter, setLabelFilter] = useState("");
  const [stageFilter, setStageFilter] = useState<PipelineStage | "">("");
  const filtered = useMemo(() => {
    let byMainFilter =
      filter === "favorites"
        ? conversations.filter((conversation) => parseLabels(conversation.label).includes("Cliente potencial"))
        : filter === "groups"
          ? []
          : conversations;
    if (stageFilter) {
      byMainFilter = byMainFilter.filter((conversation) => conversation.pipeline_stage === stageFilter);
    }
    if (labelFilter) {
      return byMainFilter.filter((conversation) => parseLabels(conversation.label).includes(labelFilter));
    }
    return byMainFilter;
  }, [conversations, filter, labelFilter, stageFilter]);

  const emptyText = useMemo(() => {
    if (stageFilter) return `No hay chats en la etapa ${stageFilter}.`;
    if (labelFilter) return `No hay chats con la etiqueta ${labelFilter}.`;
    if (filter === "favorites") {
      return "Marca una conversacion como Cliente potencial para verla aqui.";
    }
    return "Los grupos estan fuera del alcance de esta version inicial.";
  }, [filter, labelFilter, stageFilter]);

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 p-4">
        <h1 className="text-2xl font-bold text-emerald-700">WhatsApp</h1>
        <div className="mt-4 rounded-full bg-zinc-100 px-4 py-2 text-sm text-zinc-500">Buscar un chat o iniciar uno nuevo</div>
        <div className="mt-3 flex gap-2">
          <button
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === "all" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-300"
            }`}
            onClick={() => setFilter("all")}
            type="button"
          >
            Todos
          </button>
          <button
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === "favorites" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-300"
            }`}
            onClick={() => setFilter("favorites")}
            type="button"
          >
            Favoritos
          </button>
          <button
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === "groups" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-300"
            }`}
            onClick={() => setFilter("groups")}
            type="button"
          >
            Grupos
          </button>
        </div>
        <select
          className="mt-3 h-10 w-full rounded-full border border-zinc-300 bg-white px-4 text-sm outline-none focus:border-emerald-500"
          onChange={(event) => setLabelFilter(event.target.value)}
          value={labelFilter}
        >
          <option value="">Todas las etiquetas</option>
          {CHAT_LABELS.map((label) => (
            <option key={label.name} value={label.name}>
              {label.name}
            </option>
          ))}
        </select>
        <select
          className="mt-2 h-10 w-full rounded-full border border-zinc-300 bg-white px-4 text-sm outline-none focus:border-emerald-500"
          onChange={(event) => setStageFilter(event.target.value as PipelineStage | "")}
          value={stageFilter}
        >
          <option value="">Todo el embudo</option>
          {PIPELINE_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="space-y-2 p-6 text-sm text-zinc-500">
            <p className="font-semibold text-zinc-700">Aun no hay chats guardados.</p>
            <p>Esta version empieza desde cero: no importa el historial anterior de WhatsApp.</p>
            <p>Envia un mensaje nuevo a este numero desde otro telefono y aparecera aqui.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="space-y-2 p-6 text-sm text-zinc-500">
            <p className="font-semibold text-zinc-700">Sin resultados en este filtro.</p>
            <p>{emptyText}</p>
          </div>
        ) : null}
        {filtered.map((conversation) => {
          const title = conversation.name || `+${chatLabel(conversation.phone)}`;
          const labels = parseLabels(conversation.label);
          return (
            <button
              key={conversation.id}
              className={`flex w-full gap-3 rounded-md p-3 text-left hover:bg-zinc-50 ${
                selectedId === conversation.id ? "bg-zinc-100" : ""
              }`}
              onClick={() => onSelect(conversation)}
              type="button"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-100 font-bold text-emerald-800">
                {initials(title)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-semibold">{title}</p>
                  <span className="text-xs text-zinc-500">{relative(conversation.last_message_at)}</span>
                </div>
                <p className="truncate text-sm text-zinc-500">{conversation.last_message_preview || "Sin mensajes"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[11px] ${conversation.mode === "AI" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {conversation.mode}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-[11px] ${pipelineStageColor(conversation.pipeline_stage)}`}>
                    {conversation.pipeline_stage}
                  </span>
                  {labels.map((label) => (
                    <span key={label} className="inline-flex max-w-28 items-center gap-1 truncate rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-800">
                      <span className={`h-2 w-3 shrink-0 rounded-sm ${labelColor(label)}`} />
                      <span className="truncate">{label}</span>
                    </span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
