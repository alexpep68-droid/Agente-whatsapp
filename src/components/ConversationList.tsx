"use client";

import { useMemo, useState } from "react";
import { CHAT_LABELS, labelColor, parseLabels } from "./labels";
import { PIPELINE_STAGES, pipelineStageColor } from "./pipeline";
import type { Conversation, PipelineStage } from "./types";

const CLOSED_STAGES = new Set<PipelineStage>(["Cliente cerrado", "No es cliente"]);

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

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

function displayContactId(value: string) {
  const label = chatLabel(value);
  return value.includes("@lid") ? `ID WhatsApp ${label}` : `+${label}`;
}

function needsFollowUp(conversation: Conversation) {
  return conversation.last_message_role === "user" && !CLOSED_STAGES.has(conversation.pipeline_stage);
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
  const [filter, setFilter] = useState<"all" | "followup" | "favorites" | "groups">("all");
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [stageFilter, setStageFilter] = useState<PipelineStage | "">("");
  const followUpCount = useMemo(() => conversations.filter(needsFollowUp).length, [conversations]);
  const filtered = useMemo(() => {
    const searchTerm = normalizeSearch(search);
    let byMainFilter =
      filter === "followup"
        ? conversations.filter(needsFollowUp)
        : filter === "favorites"
        ? conversations.filter((conversation) => parseLabels(conversation.label).includes("Cliente potencial"))
        : filter === "groups"
          ? []
          : conversations;
    if (stageFilter) {
      byMainFilter = byMainFilter.filter((conversation) => conversation.pipeline_stage === stageFilter);
    }
    if (labelFilter) {
      byMainFilter = byMainFilter.filter((conversation) => parseLabels(conversation.label).includes(labelFilter));
    }
    if (searchTerm) {
      byMainFilter = byMainFilter.filter((conversation) => {
        const haystack = normalizeSearch(
          [
            conversation.name,
            chatLabel(conversation.phone),
            displayContactId(conversation.phone),
            conversation.phone,
            conversation.last_message_preview,
            conversation.pipeline_stage,
            conversation.mode,
            conversation.label,
          ]
            .filter(Boolean)
            .join(" "),
        );
        return haystack.includes(searchTerm);
      });
    }
    return byMainFilter;
  }, [conversations, filter, labelFilter, search, stageFilter]);

  const emptyText = useMemo(() => {
    if (search.trim()) return `No encontre chats que coincidan con "${search.trim()}".`;
    if (stageFilter) return `No hay chats en la etapa ${stageFilter}.`;
    if (labelFilter) return `No hay chats con la etiqueta ${labelFilter}.`;
    if (filter === "favorites") {
      return "Marca una conversacion como Cliente potencial para verla aqui.";
    }
    if (filter === "followup") {
      return "No hay clientes esperando respuesta. Buen momento para revisar cotizaciones o preparar seguimiento.";
    }
    return "Los grupos estan fuera del alcance de esta version inicial.";
  }, [filter, labelFilter, search, stageFilter]);

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 p-4">
        <h1 className="text-2xl font-bold text-emerald-700">WhatsApp</h1>
        <div className="relative mt-4">
          <input
            className="h-10 w-full rounded-full bg-zinc-100 px-4 pr-10 text-sm text-zinc-800 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-emerald-200"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, telefono o mensaje"
            type="search"
            value={search}
          />
          {search ? (
            <button
              aria-label="Limpiar busqueda"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-zinc-500 hover:bg-white hover:text-zinc-800"
              onClick={() => setSearch("")}
              type="button"
            >
              x
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
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
              filter === "followup" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-300"
            }`}
            onClick={() => setFilter("followup")}
            type="button"
          >
            Pendientes{followUpCount ? ` ${followUpCount}` : ""}
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
          const title = conversation.name || displayContactId(conversation.phone);
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
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-emerald-100 font-bold text-emerald-800">
                {conversation.avatar_url ? (
                  <img alt={title} className="h-full w-full object-cover" src={conversation.avatar_url} />
                ) : (
                  initials(title)
                )}
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
