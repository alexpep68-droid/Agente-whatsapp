# Puesta en linea

Arquitectura recomendada:

- Vercel: panel web.
- Supabase: base de datos y archivos.
- VPS: bot de WhatsApp corriendo 24/7.

## Supabase

Proyecto creado:

- Nombre: agente-whatsapp
- Ref: fvjcxezqtboikoikdrum
- Bucket de archivos: whatsapp-media

Tablas creadas:

- accounts
- conversations
- messages
- outbox
- account_restart
- quick_replies
- customer_profiles

Todas las tablas tienen RLS activado. Por ahora no tienen politicas publicas porque la app debe usar Supabase desde servidor con `SUPABASE_SERVICE_ROLE_KEY`.

## Variables necesarias

En Vercel y en la VPS configura:

```txt
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=whatsapp-media
APP_BASE_URL=
```

La `SUPABASE_SERVICE_ROLE_KEY` nunca debe ponerse con prefijo `NEXT_PUBLIC_`.

## VPS

La VPS debe ejecutar el bot con un proceso permanente, por ejemplo con PM2:

```bash
npm ci
npm run build
pm2 start npm --name agente-whatsapp-bot -- run start:bot
pm2 save
```

El panel web puede quedarse en Vercel. El bot en la VPS usara la misma base de Supabase para leer cuentas, guardar mensajes y enviar respuestas.
