# WA-Bot Personal

Bot personal de WhatsApp construido con [Baileys](https://github.com/itsliaaa/baileys). Sistema modular basado en extensiones, vinculación por código de pairing (sin QR), whitelist de usuarios y soporte para stickers, conversión de medios y mensajes enriquecidos.

> **Proyecto experimental / personal.** No está pensado para uso masivo ni como servicio público.

---

## Características

- Autenticación sin QR mediante **pairing code**
- Arquitectura **modular**: cada comando es un archivo `.js` independiente en `/extensiones`
- **Whitelist** de usuarios autorizados (solo el creador y quienes él apruebe pueden usar el bot)
- **Hot-reload** de extensiones sin reiniciar el proceso
- Reconexión automática ante caídas de red

---

## Requisitos

- [Node.js](https://nodejs.org/) v18 o superior
- [ffmpeg](https://ffmpeg.org/) (en el PATH del sistema)
- [ImageMagick](https://imagemagick.org/) v7+ — comando `magick` (en el PATH del sistema)

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
├── auth_info/            # Credenciales de sesión (ignorar en git)
└── extensiones/          # Comandos del bot
    ├── ping.js
    ├── s.js
    ├── img.js
    ├── reel.js
    ├── md.js
    └── allow.js
```

---

## Comandos disponibles

| Comando | Descripción | Uso |
|---|---|---|
| `/ping` | Verifica latencia del bot | `/ping` |
| `/s` | Convierte imagen o video (≤8s) a sticker | Responder a una imagen o video con `/s` |
| `/img` | Convierte sticker o imagen view-once a otro formato | Responder a un sticker con `/img [png\|jpg\|mp4\|gif\|webp]` |
| `/reel` | Reenvía un video como Reel interactivo con botones | Responder a un video con `/reel` |
| `/md` | Envía un bloque de código como RichMessage | `/md javascript console.log("hola")` |
| `/allow` | *(Solo creador)* Otorga o revoca permisos a un usuario | Responder al mensaje del usuario con `/allow` |

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
