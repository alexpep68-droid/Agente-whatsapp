"use client";

import { useEffect, useState } from "react";
import type { Account } from "./types";

const ALMALU_PROMPT = `
Eres el asistente de WhatsApp de ALMALU, empresa de cocinas integrales, closets, centros de entretenimiento y muebles sobre medida.

Responde en espanol mexicano, con tono amable, cercano, profesional y vendedor. Escribe como una persona real de atencion al cliente por WhatsApp.
Puedes usar emojis de forma moderada cuando ayuden al tono de ALMALU.

Objetivo:
- Atender prospectos.
- Entender el proyecto.
- Pedir la informacion necesaria para cotizar.
- Pasar a una persona del equipo cuando el caso requiera revision.
- Educar al cliente sobre calidad, materiales y proceso sin sonar insistente.

Servicios principales:
- Cocinas integrales.
- Closets.
- Centros de entretenimiento.
- Muebles sobre medida.
- Carpinteria residencial a medida.
- Muebles de bano.

Siempre intenta obtener estos datos:
1. Nombre del cliente.
2. Tipo de proyecto.
3. Ubicacion o colonia.
4. Medidas aproximadas.
5. Fotos, video o referencia del espacio.
6. Fecha tentativa o nivel de urgencia.

Catalogo:
Si el cliente pide ejemplos, catalogo o modelos, comparte este enlace:
https://puntoventa-kohl.vercel.app/store/biz_RCzB

Proceso de cotizacion:
- Explica que la primera cotizacion es 100% digital y sin compromiso.
- Pide foto del espacio y medidas aproximadas.
- Aclara que las medidas no tienen que ser exactas; sirven para preparar un presupuesto estimado.
- Si la propuesta se ajusta a lo que busca el cliente, se agenda visita tecnica para rectificar medidas exactas y definir materiales.

Zona de servicio:
- ALMALU se ubica fisicamente en Playa del Carmen.
- Atiende proyectos en Playa del Carmen, Cancun, Tulum y alrededores.
- Si preguntan por ubicacion, responde que esa ubicacion es estrategica para cubrir la zona.

Argumentos de calidad:
- En ALMALU no competimos solo con precio, sino con calidad real.
- Trabajamos con melamina, MDF, Alto Brillo, Ultra Mate y materiales HR resistentes a la humedad.
- Cubiertas disponibles segun proyecto y presupuesto: Formica, Granito o Cuarzo.
- Usamos herrajes premium: bisagras y correderas reforzadas de cierre suave.
- Optimizamos cada centimetro para lograr almacenamiento, funcionalidad y estetica.
- Los cortes se realizan con precision y el tapacanto de PVC de 1 mm se coloca con maquinaria enchapadora.

Objecion sobre melamina:
Si el cliente dice que la melamina se infla, se despega o no dura, explica:
- La mayoria de los problemas no son por la melamina, sino por la forma en que fue fabricado el mueble.
- En ALMALU usamos melamina de calidad, canto de PVC de 1 mm termofusionado en maquina, cortes de alta precision, herrajes de cierre suave y buen sellado para reducir problemas de humedad.
- Invita al cliente a contar que paso con su mueble anterior para explicarle como se evita ese problema.

Cuando el cliente compara precios:
- Reconoce que los precios pueden variar mucho en el mercado.
- Explica que ALMALU se enfoca en calidad, durabilidad, herrajes, acabados y buen proceso de fabricacion.
- Ofrece compartir una guia breve con preguntas clave para comparar materiales, herrajes y acabados.
- Pregunta: "¿Te la puedo mandar por aqui?"

Reglas:
- No inventes precios.
- No prometas fechas de entrega o instalacion.
- No confirmes descuentos, garantias o condiciones especiales.
- No digas que una cotizacion ya fue enviada si no lo sabes.
- Si el cliente pide precio, explica que depende de medidas, materiales y diseno.
- Si el cliente esta molesto, pide disculpas y ofrece pasar el caso al equipo.
- Si preguntan por pagos, anticipos, cambios de cotizacion o quejas, deriva con un asesor humano.
- Si el cliente pide una cotizacion pendiente, no inventes estatus. Responde con empatia y di que lo revisara el equipo.

Formato:
- Respuestas breves, claras y naturales.
- Usa listas cortas cuando el cliente esta iniciando un proyecto.
- Haz una sola pregunta clara al final cuando falte informacion.
- Evita parrafos largos salvo que el cliente pida explicacion detallada.

Ejemplos de estilo:

Saludo inicial:
"¡Hola! 😊 Gracias por contactar a ALMALU Cocinas Integrales y Closets.

¿En que proyecto podemos ayudarte?
🔹 Cocina integral
🔹 Closet
🔹 Centro de entretenimiento
🔹 Mueble de bano
🔹 Otro

Para cotizar sin compromiso, puedes enviarnos una foto del espacio y medidas aproximadas."

Cotizacion digital:
"En ALMALU nos encanta hacerte la vida mas facil. 💻🔨
La primera cotizacion la realizamos de forma 100% digital y sin compromiso.

Solo necesitamos una foto del espacio y medidas aproximadas. No te preocupes si no son exactas; nos sirven para preparar un presupuesto estimado."

Ubicacion:
"Fisicamente estamos en Playa del Carmen, una ubicacion estrategica para atender proyectos en Cancun, Tulum y alrededores. 📐🚛

¿En que zona se ubica tu propiedad y que tipo de mueble a medida buscas?"
`.trim();

export function AccountSettingsModal({
  account,
  onClose,
  onSaved,
}: {
  account: Account;
  onClose: () => void;
  onSaved: (account: Account) => void;
}) {
  const [name, setName] = useState(account.name);
  const [enabled, setEnabled] = useState(Boolean(account.ai_enabled));
  const [prompt, setPrompt] = useState(account.system_prompt);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAlmaluAccount = /almal[uú]/i.test(account.name);

  useEffect(() => {
    setName(account.name);
    setEnabled(Boolean(account.ai_enabled));
    setPrompt(account.system_prompt);
    setEditingPrompt(false);
    setError(null);
  }, [account]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ai_enabled: enabled,
          system_prompt: prompt,
        }),
      });
      const json = (await res.json()) as { account?: Account; error?: string };
      if (!res.ok || !json.account) throw new Error(json.error || "No se pudo guardar");
      onSaved(json.account);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <section className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-md bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Ajustes de IA</h2>
            <p className="text-sm text-zinc-500">Configuracion para {account.name}</p>
          </div>
          <button className="rounded border border-zinc-300 px-3 py-1 text-sm font-semibold" onClick={onClose} type="button">
            Cerrar
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-[260px_1fr]">
            <aside className="space-y-4 text-sm text-zinc-600">
              <div className="rounded border border-zinc-200 p-4">
                <p className="font-semibold text-zinc-900">Como funciona</p>
                <p className="mt-2">
                  Este texto guia a la IA en mensajes nuevos de esta cuenta. Cada numero puede tener reglas diferentes.
                </p>
              </div>
              <div className="rounded border border-zinc-200 p-4">
                <p className="font-semibold text-zinc-900">Conviene incluir</p>
                <p className="mt-2">Servicios, tono, datos que debe pedir, limites y cuando pasar a humano.</p>
              </div>
            </aside>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label className="block">
                <span className="text-sm font-semibold text-zinc-700">Nombre de la cuenta</span>
                <input
                  className="mt-2 h-11 w-full rounded border border-zinc-300 px-3 outline-none focus:border-emerald-500"
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </label>

              <label className="flex items-center justify-between rounded border border-zinc-200 p-4">
                <span>
                  <span className="block text-sm font-semibold text-zinc-700">IA activa para esta cuenta</span>
                  <span className="block text-sm text-zinc-500">Si se apaga, ninguna conversacion contestara con IA.</span>
                  {account.ai_status === "paused" ? (
                    <span className="mt-2 block rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      IA pausada: {account.ai_error || "hubo un problema con el proveedor"}. Guarda los ajustes con la IA activa para reintentar.
                    </span>
                  ) : null}
                </span>
                <input
                  checked={enabled}
                  className="h-5 w-5 accent-emerald-600"
                  onChange={(event) => setEnabled(event.target.checked)}
                  type="checkbox"
                />
              </label>

              <label className="block">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-zinc-700">Prompt del negocio</span>
                  <div className="flex flex-wrap justify-end gap-2">
                    {isAlmaluAccount ? (
                      <button
                        className="rounded border border-emerald-200 px-3 py-1 text-sm font-semibold text-emerald-700"
                        onClick={() => {
                          setPrompt(ALMALU_PROMPT);
                          setEditingPrompt(true);
                        }}
                        type="button"
                      >
                        Usar plantilla ALMALU
                      </button>
                    ) : null}
                    <button
                      className="rounded border border-zinc-300 px-3 py-1 text-sm font-semibold text-zinc-700"
                      onClick={() => setEditingPrompt((value) => !value)}
                      type="button"
                    >
                      {editingPrompt ? "Vista previa" : "Configurar"}
                    </button>
                  </div>
                </div>
                {editingPrompt ? (
                  <textarea
                    className="mt-2 min-h-[420px] w-full resize-y rounded border border-zinc-300 p-3 text-sm leading-6 outline-none focus:border-emerald-500"
                    onChange={(event) => setPrompt(event.target.value)}
                    value={prompt}
                  />
                ) : (
                  <div className="mt-2 min-h-[220px] whitespace-pre-wrap rounded border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
                    {prompt || "Esta cuenta todavia no tiene un prompt configurado. Presiona Configurar para agregar sus reglas."}
                  </div>
                )}
              </label>

              {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

              <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
                <button className="h-10 rounded border border-zinc-300 px-4 text-sm font-semibold" onClick={onClose} type="button">
                  Cancelar
                </button>
                <button
                  className="h-10 rounded bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Guardando..." : "Guardar ajustes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
