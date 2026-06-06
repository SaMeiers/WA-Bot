const { exec } = require('child_process')
const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const os = require('os')
const execAsync = promisify(exec)

async function mediaToSticker(buffer, isVideo) {
    const tmp = os.tmpdir()
    const id = Date.now()
    const inputExt = isVideo ? 'mp4' : 'jpg'
    const input = path.join(tmp, `wa_in_${id}.${inputExt}`)
    const output = path.join(tmp, `wa_out_${id}.webp`)

    fs.writeFileSync(input, buffer)
    try {
        if (isVideo) {
            await execAsync(`ffmpeg -y -i "${input}" -vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=12,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0.0" -lossless 0 -q:v 40 -loop 0 -preset default -an -t 8 "${output}"`)
        } else {
            await execAsync(`ffmpeg -y -i "${input}" -vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0.0" -lossless 0 -q:v 50 -loop 0 -preset default -an "${output}"`)
        }
        return fs.readFileSync(output)
    } finally {
        if (fs.existsSync(input)) fs.unlinkSync(input)
        if (fs.existsSync(output)) fs.unlinkSync(output)
    }
}

module.exports = {
    nombre: 's',
    descripcion: 'Convierte imagen o video corto a sticker',
    
    ejecutar: async (ctx) => {
        const { sock, msg, from, downloadMediaMessage, logger } = ctx

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
        const quoted = contextInfo?.quotedMessage

        const isVideo = quoted?.videoMessage != null
        const isImage = quoted?.imageMessage != null

        if (!isVideo && !isImage) {
            return await sock.sendMessage(from, { text: '🖼️ Responde a una *foto* o *video (máx 8s)* con */s*.' }, { quoted: msg })
        }

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net'
            const quotedKey = { remoteJid: from, id: contextInfo.stanzaId, participant: contextInfo.participant || undefined, fromMe: (contextInfo.participant || from) === botJid }

            const buffer = await downloadMediaMessage({ key: quotedKey, message: quoted }, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })
            
            const stickerBuf = await mediaToSticker(buffer, isVideo)

            await sock.sendMessage(from, { sticker: stickerBuf })
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })

        } catch (err) {
            console.error('Error en /s:', err.message)
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
            
            if (err.message.includes('empty media key')) {
                await sock.sendMessage(from, { text: '❌' })
            } else {
                await sock.sendMessage(from, { text: '❌' })
            }
        }
    }
}
