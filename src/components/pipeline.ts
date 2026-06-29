import type { PipelineStage } from "./types";

export const PIPELINE_STAGES: PipelineStage[] = [
  "Nuevo cliente",
  "Cliente potencial",
  "Cotización enviada",
  "Cita",
  "Instalación",
  "Cliente cerrado",
];

export function pipelineStageColor(stage: string) {
  if (stage === "Nuevo cliente") return "bg-sky-100 text-sky-800";
  if (stage === "Cliente potencial") return "bg-indigo-100 text-indigo-800";
  if (stage === "Cotización enviada") return "bg-amber-100 text-amber-800";
  if (stage === "Cita") return "bg-purple-100 text-purple-800";
  if (stage === "Instalación") return "bg-rose-100 text-rose-800";
  if (stage === "Cliente cerrado") return "bg-emerald-100 text-emerald-800";
  return "bg-zinc-100 text-zinc-800";
}
