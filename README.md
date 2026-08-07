# WA-Bot Personal

Bot personal de WhatsApp construido con [Baileys](https://github.com/WhiskeySockets/Baileys) 7.0.0-rc14 (oficial, ESM). Sistema modular basado en extensiones, vinculación por código de pairing (sin QR), whitelist de usuarios y soporte para stickers y conversión de medios.

> ⚠️ La línea 6.7.x quedó descontinuada por los maintainers (el propio changelog de la 7.x incluye fixes de `fromMe` y de estabilidad de socket) — por eso este proyecto corre sobre la 7.x aunque todavía sea release candidate.

> **Proyecto experimental / personal.** No está pensado para uso masivo ni como servicio público.

---

## Características

- Autenticación sin QR mediante **pairing code**
- Arquitectura **modular**: cada comando es un archivo `.js` independiente en `/extensiones`
- **Whitelist** de usuarios autorizados (solo el creador y quienes él apruebe pueden usar el bot)
- **Hot-reload** de extensiones sin reiniciar el proceso
- Reconexión automática ante caídas de red
- Logs de errores persistentes en `./logs/errors.log` (además de consola)
- Stickers con nombre de pack/autor (EXIF) y reintento automático a menor calidad si pesan de más

---

## Requisitos

- [Node.js](https://nodejs.org/) **v20 o superior** (obligatorio — Baileys 7.x no arranca con versiones más viejas)
- [ffmpeg](https://ffmpeg.org/) (en el PATH del sistema)
- [ImageMagick](https://imagemagick.org/) v7+ — comando `magick` (en el PATH del sistema)

---

## Variables de entorno (opcionales)

Todas tienen un valor por defecto razonable; solo hace falta definirlas si querés cambiar el comportamiento.

| Variable | Default | Qué controla |
|---|---|---|
| `STICKER_PACK` | `WA-Bot Personal` | Nombre de pack que se ve en los stickers |
| `STICKER_AUTHOR` | `SaMeiers` | Autor que se ve en los stickers |
| `STICKER_MAX_SECONDS` | `8` | Duración máxima de video aceptada para `/s` |
| `STICKER_ANIMATED_MAX_BYTES` | `1000000` (1MB) | Límite de peso para stickers animados antes de reintentar con menor calidad |
| `STICKER_STATIC_MAX_BYTES` | `300000` (300KB) | Límite de peso para stickers estáticos |
| `BAILEYS_LOG_LEVEL` | `error` | Nivel de log interno de Baileys (`debug` para ver todo el tráfico) |

---

## Uso

```bash
# Producción
npm start

# Desarrollo (con nodemon)
npm run dev
```

Al iniciar por primera vez, se te pedirá tu número de WhatsApp en formato internacional (ej: `56912345678`). El bot generará un **código de vinculación** que debes ingresar en WhatsApp → *Dispositivos vinculados → Vincular con número de teléfono*.

La sesión se guarda en `./auth_info/` para reconexiones futuras.

---

## Estructura del proyecto

```
wa-bot-personal/
├── index.js              # Núcleo del bot
├── package.json
├── whitelist.json        # Usuarios autorizados (se genera automáticamente)
├── mode.json             # Modo libre on/off (se genera automáticamente)
├── auth_info/            # Credenciales de sesión (ignorar en git)
├── logs/                 # errors.log persistente (ignorar en git)
├── lib/                  # Utilidades compartidas
│   ├── logger.js         # Logging a consola + archivo
│   ├── mediaUtils.js     # Mapeo mimetype → extensión
│   └── stickerExif.js    # Inyección de EXIF (pack/autor) en stickers
└── extensiones/          # Comandos del bot
    ├── ping.js
    ├── s.js
    ├── img.js
    ├── reel.js
    ├── dl.js
    ├── update.js
    ├── help.js
    └── allow.js
```

---

## Comandos disponibles

| Comando | Descripción | Uso |
|---|---|---|
| `/ping` | Verifica latencia del bot | `/ping` |
| `/s` | Convierte imagen o video (≤8s, configurable) a sticker con nombre de pack/autor | Responder a una imagen o video con `/s` |
| `/img` | Convierte sticker o imagen view-once a otro formato | Responder a un sticker con `/img [png\|jpg\|mp4\|gif\|webp]` |
| `/reel` | Reenvía un video como Reel con botones (nota: WhatsApp dejó de renderizar botones interactivos en la mayoría de clientes) | Responder a un video con `/reel` |
| `/dl` | Descarga de YouTube, Instagram o TikTok (máx 45MB) | `/dl [mp3\|mp4] [url]` |
| `/allow` | *(Solo creador)* Otorga o revoca permisos a un usuario | Responder al mensaje del usuario con `/allow` |
| `/update` | *(Solo creador)* Actualiza el bot desde el repo de git | `/update` |
| `/help` | Lista todos los comandos disponibles | `/help` |

> El repo también trae `ruleta.js` (minijuego de ruleta rusa para grupos) — no está en esta tabla por ser opcional/de entretenimiento; usa `/help` en el bot para ver su uso completo.

---

## Sistema de permisos

El bot solo responde a dos tipos de usuarios:

- **Creador** — la cuenta vinculada al bot (tú). Acceso total.
- **Whitelisted** — usuarios añadidos mediante `/allow`. Pueden usar todos los comandos excepto `/allow`.

Cualquier otro mensaje es ignorado silenciosamente.

---

## Agregar comandos

Crea un archivo en `extensiones/` con esta estructura:

```js
module.exports = {
    nombre: 'micomando',
    descripcion: 'Descripción breve',

    ejecutar: async ({ sock, msg, from, args, isCreator, sender }) => {
        await sock.sendMessage(from, { text: '¡Hola!' }, { quoted: msg })
    }
}
```

El archivo se carga automáticamente al ejecutar `/micomando`. No hace falta reiniciar el bot.
