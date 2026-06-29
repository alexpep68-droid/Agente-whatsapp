export const CHAT_LABELS = [
  { name: "Nuevo cliente", color: "bg-sky-400" },
  { name: "Cliente potencial", color: "bg-indigo-400" },
  { name: "Cita", color: "bg-purple-500" },
  { name: "Próxima instalación", color: "bg-red-400" },
  { name: "Se envio cotización", color: "bg-sky-400" },
  { name: "Pendientes", color: "bg-amber-400" },
  { name: "Enviar Cotizacion", color: "bg-amber-400" },
  { name: "Clientes", color: "bg-amber-400" },
] as const;

export function parseLabels(value: string | null | undefined) {
  return (value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function serializeLabels(labels: string[]) {
  return labels.join("|");
}

export function labelColor(name: string) {
  return CHAT_LABELS.find((label) => label.name === name)?.color || "bg-zinc-400";
}
