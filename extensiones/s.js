const { exec } = require('child_process')
const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const os = require('os')
const execAsync = promisify(exec)
const { addExif } = require('../lib/stickerExif')
const { extFromMimetype } = require('../lib/mediaUtils')

const ANIMATED_MAX_BYTES = parseInt(process.env.STICKER_ANIMATED_MAX_BYTES || '1000000', 10)
const STATIC_MAX_BYTES = parseInt(process.env.STICKER_STATIC_MAX_BYTES || '300000', 10)
const MAX_VIDEO_SECONDS = parseInt(process.env.STICKER_MAX_SECONDS || '8', 10)

// intentos de codificación en orden: si el resultado pesa más del límite, se reintenta
// con menos calidad/fps en vez de mandar un sticker que WhatsApp puede rechazar
const VIDEO_ATTEMPTS = [
    { fps: 12, quality: 45 },
    { fps: 10, quality: 30 },
    { fps: 8, quality: 20 }
]

const IMAGE_ATTEMPTS = [
    { quality: 80 },
    { quality: 60 },
    { quality: 40 }
]

async function encodeVideoAttempt(input, output, fps, quality) {
    await execAsync(`ffmpeg -y -i "${input}" -vcodec libwebp -vf "fps=${fps},scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black" -lossless 0 -q:v ${quality} -loop 0 -preset default -an -t ${MAX_VIDEO_SECONDS} "${output}"`)
}

async function encodeImageAttempt(input, output, quality) {
    await execAsync(`ffmpeg -y -i "${input}" -vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -lossless 0 -q:v ${quality} -loop 0 -preset default -an "${output}"`)
}

async function mediaToSticker(buffer, isVideo, inputExt) {
    const tmp = os.tmpdir()
    const id = Date.now()
    const input = path.join(tmp, `wa_in_${id}.${inputExt}`)
    const output = path.join(tmp, `wa_out_${id}.webp`)

    fs.writeFileSync(input, buffer)

    try {
        const attempts = isVideo ? VIDEO_ATTEMPTS : IMAGE_ATTEMPTS
        const maxBytes = isVideo ? ANIMATED_MAX_BYTES : STATIC_MAX_BYTES
        let lastSize = Infinity

        for (const attempt of attempts) {
            if (isVideo) {
                await encodeVideoAttempt(input, output, attempt.fps, attempt.quality)
            } else {
                await encodeImageAttempt(input, output, attempt.quality)
            }
            lastSize = fs.statSync(output).size
            if (lastSize <= maxBytes) break
        }

        const rawSticker = fs.readFileSync(output)
        const finalSticker = await addExif(rawSticker)

        return { buffer: finalSticker, oversized: lastSize > maxBytes, sizeKb: Math.round(lastSize / 1024) }
    } finally {
        if (fs.existsSync(input)) fs.unlinkSync(input)
        if (fs.existsSync(output)) fs.unlinkSync(output)
    }
}

module.exports = {
    nombre: 's',
    descripcion: `Convierte imagen o video (máx ${MAX_VIDEO_SECONDS}s) a sticker, con nombre de pack/autor y tamaño optimizado`,

    ejecutar: async (ctx) => {
        const { sock, msg, from, downloadMediaMessage, logger, logError } = ctx

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
        const quoted = contextInfo?.quotedMessage

        const isVideo = quoted?.videoMessage != null
        const isImage = quoted?.imageMessage != null

        if (!isVideo && !isImage) {
            return await sock.sendMessage(from, { text: `🖼️ Responde a una *foto* o *video (máx ${MAX_VIDEO_SECONDS}s)* con */s* para obtener un sticker.` }, { quoted: msg })
        }

        if (isVideo) {
            const duracion = quoted.videoMessage.seconds
            if (duracion && duracion > MAX_VIDEO_SECONDS) {
                return await sock.sendMessage(from, {
                    text: `⏱️ Ese video dura ${duracion}s y el máximo es ${MAX_VIDEO_SECONDS}s. Recórtalo y vuelve a intentar (antes se cortaba en silencio, ahora te aviso).`
                }, { quoted: msg })
            }
        }

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net'
            const quotedKey = { remoteJid: from, id: contextInfo.stanzaId, participant: contextInfo.participant || undefined, fromMe: (contextInfo.participant || from) === botJid }

            const mimetype = (isVideo ? quoted.videoMessage.mimetype : quoted.imageMessage.mimetype) || ''
            const inputExt = extFromMimetype(mimetype)

            const buffer = await downloadMediaMessage({ key: quotedKey, message: quoted }, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })

            const { buffer: stickerBuf, oversized, sizeKb } = await mediaToSticker(buffer, isVideo, inputExt)

            await sock.sendMessage(from, { sticker: stickerBuf })

            if (oversized) {
                await sock.sendMessage(from, { text: `⚠️ El sticker quedó en ${sizeKb}KB, más pesado de lo ideal — en algunos teléfonos puede tardar en cargar.` })
            }

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })

        } catch (err) {
            logError('comando /s', err)
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
            await sock.sendMessage(from, { text: `❌ Error al crear el sticker: ${err.message}` }, { quoted: msg })
        }
    }
}
