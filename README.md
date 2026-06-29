# Agente WhatsApp

Panel CRM local para conectar varias cuentas de WhatsApp, atender conversaciones, alternar entre IA y humano, usar respuestas rapidas, etiquetas, ficha del cliente y embudo comercial.

## Arranque local

1. Copia `.env.example` a `.env.local`.
2. Agrega tu `OPENROUTER_API_KEY`.
3. Ajusta `OPENROUTER_MODEL` si quieres usar otro modelo.
4. Ejecuta:

```bash
npm run start:bot
npm run dev
```

Abre `http://localhost:3000`. Cada cuenta muestra su propio QR.

## Funciones actuales

- Multi-cuenta para varios numeros o negocios.
- Conexion por QR con WhatsApp.
- Bandeja de conversaciones por cuenta.
- Modo IA / Humano por chat.
- Prompt editable por cuenta.
- Modo seguro: si la IA llega a limite o falla, se pausa sin cerrar la app.
- Respuestas rapidas editables por cuenta.
- Envio y recepcion de imagenes.
- Enlaces clicables dentro de mensajes.
- Etiquetas por chat y filtros.
- Embudo comercial por etapa.
- Ficha del cliente con proyecto, ciudad, presupuesto, medidas, visita y notas.

## Multi-cuenta

Cada cuenta tiene una sesion independiente:

```txt
auth/almalu
auth/web-marketing-pro
auth/negocio
```

Las conversaciones, mensajes, etiquetas, fichas, respuestas rapidas y outbox viven en `data/messages.db`, separados por `account_id`.

## Personalizar la IA

Cada cuenta guarda su `system_prompt` en SQLite. Se edita desde la pantalla de ajustes de IA.

## Seguridad

Este dashboard no tiene autenticacion. Si lo expones en internet, primero protege la URL con basic auth, Cloudflare Access o una capa equivalente. Sin eso, cualquiera con el enlace podria leer chats y enviar mensajes desde tus numeros.

## Notas para despliegue

Para ponerlo en linea de forma estable se recomienda:

- Panel web en Vercel.
- Bot de WhatsApp en un servidor permanente como Railway, Render, Fly.io o VPS.
- Base de datos online como Supabase/Postgres o Neon.
- Almacenamiento de archivos en Supabase Storage, Cloudflare R2, S3 o Vercel Blob.

No subas `.env.local`, `auth/`, `data/` ni `public/uploads/`.
