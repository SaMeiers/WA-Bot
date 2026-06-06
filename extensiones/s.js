const { exec } = require('child_process')
const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const os = require('os')
const execAsync = promisify(exec)

async function videoToSticker(buffer) {
    const tmp = os.tmpdir()
    const id = Date.now()
    const input = path.join(tmp, `wa_in_${id}.mp4`)
    const output = path.join(tmp, `wa_out_${id}.webp`)

    fs.writeFileSync(input, buffer)
    try {
        
        await execAsync(`ffmpeg -y -i "${input}" -vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512" -lossless 0 -q:v 40 -loop 0 -preset default -an -t 8 "${output}"`)
        return fs.readFileSync(output)
    } finally {
        if (fs.existsSync(input)) fs.unlinkSync(input)
        if (fs.existsSync(output)) fs.unlinkSync(output)
    }
}

async function imageToPng(buffer) {
    const tmp = os.tmpdir()
    const id = Date.now()
    const input = path.join(tmp, `img_in_${id}.jpg`)
    const output = path.join(tmp, `img_out_${id}.png`)

    fs.writeFileSync(input, buffer)
    try {

        await execAsync(`ffmpeg -y -i "${input}" -compression_level 6 -pred mixed "${output}"`)
        return fs.readFileSync(output)
    } finally {
        if (fs.existsSync(input)) fs.unlinkSync(input)
        if (fs.existsSync(output)) fs.unlinkSync(output)
    }
}

module.exports = {
    nombre: 's',
    descripcion: 'Convierte vídeo corto a sticker, o imagen a PNG (sin bordes blancos)',
    
    ejecutar: async (ctx) => {
        const { sock, msg, from, downloadMediaMessage, logger } = ctx

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
        const quoted = contextInfo?.quotedMessage

        const isVideo = quoted?.videoMessage != null
        const isImage = quoted?.imageMessage != null

        if (!isVideo && !isImage) {
            return await sock.sendMessage(from, { text: '🖼️ Responde a una *foto* (se enviará como PNG sin bordes) o *vídeo* (máx 8s, se enviará como sticker).' }, { quoted: msg })
        }

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net'
            const quotedKey = {
                remoteJid: from,
                id: contextInfo.stanzaId,
                participant: contextInfo.participant || undefined,
                fromMe: (contextInfo.participant || from) === botJid
            }

            const buffer = await downloadMediaMessage(
                { key: quotedKey, message: quoted },
                'buffer',
                {},
                { logger, reuploadRequest: sock.updateMediaMessage }
            )

            if (isVideo) {
                const stickerBuf = await videoToSticker(buffer)
                await sock.sendMessage(from, { sticker: stickerBuf })
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })
            } else if (isImage) {
                const pngBuffer = await imageToPng(buffer)
                await sock.sendMessage(from, { image: pngBuffer, caption: '🖼️ Imagen convertida a PNG (sin bordes blancos)' }, { quoted: msg })
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })
            }

        } catch (err) {
            console.error('Error en /s:', err.message)
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
            await sock.sendMessage(from, { text: `❌ Error: ${err.message}` })
        }
    }
}
