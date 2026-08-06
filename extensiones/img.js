const { exec } = require('child_process')
const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const os = require('os')
const execAsync = promisify(exec)
const { extFromMimetype } = require('../lib/mediaUtils')

async function stickerToMedia(buffer, targetFormat) {
    const tmp = os.tmpdir()
    const id = Date.now()
    const input = path.join(tmp, `in_${id}.webp`)
    const isAnimated = buffer.includes(Buffer.from('ANIM'))

    fs.writeFileSync(input, buffer)

    const imageFormats = ['png', 'jpg', 'jpeg', 'webp']
    const videoFormats = ['mp4', 'gif']

    try {
        if (isAnimated) {
            if (videoFormats.includes(targetFormat)) {
                const gifOutput = path.join(tmp, `out_${id}.gif`)
                const finalOutput = path.join(tmp, `out_${id}.${targetFormat}`)

                await execAsync(`magick "${input}" "${gifOutput}"`)
                if (targetFormat === 'gif') {
                    const result = fs.readFileSync(gifOutput)
                    if (fs.existsSync(gifOutput)) fs.unlinkSync(gifOutput)
                    return { buffer: result, type: 'image' }
                } else {
                    await execAsync(`ffmpeg -y -i "${gifOutput}" -c:v libx264 -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${finalOutput}"`)
                    const result = fs.readFileSync(finalOutput)
                    if (fs.existsSync(gifOutput)) fs.unlinkSync(gifOutput)
                    if (fs.existsSync(finalOutput)) fs.unlinkSync(finalOutput)
                    return { buffer: result, type: 'video' }
                }
            } else if (imageFormats.includes(targetFormat)) {
                const output = path.join(tmp, `out_${id}.${targetFormat}`)
                await execAsync(`magick "${input}[0]" "${output}"`)
                const result = fs.readFileSync(output)
                if (fs.existsSync(output)) fs.unlinkSync(output)
                return { buffer: result, type: 'image' }
            } else {
                throw new Error(`Formato no soportado para sticker animado: ${targetFormat}`)
            }
        } else {
            if (imageFormats.includes(targetFormat)) {
                const output = path.join(tmp, `out_${id}.${targetFormat}`)
                await execAsync(`magick "${input}" "${output}"`)
                const result = fs.readFileSync(output)
                if (fs.existsSync(output)) fs.unlinkSync(output)
                return { buffer: result, type: 'image' }
            } else if (targetFormat === 'mp4') {
                const pngOutput = path.join(tmp, `out_${id}.png`)
                const mp4Output = path.join(tmp, `out_${id}.mp4`)
                await execAsync(`magick "${input}" "${pngOutput}"`)
                await execAsync(`ffmpeg -y -loop 1 -i "${pngOutput}" -c:v libx264 -t 3 -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${mp4Output}"`)
                const result = fs.readFileSync(mp4Output)
                if (fs.existsSync(pngOutput)) fs.unlinkSync(pngOutput)
                if (fs.existsSync(mp4Output)) fs.unlinkSync(mp4Output)
                return { buffer: result, type: 'video' }
            } else {
                throw new Error(`Formato no soportado para sticker estático: ${targetFormat}`)
            }
        }
    } finally {
        if (fs.existsSync(input)) fs.unlinkSync(input)
    }
}

module.exports = {
    nombre: 'img',
    descripcion: 'Convierte sticker o imagen view-once a formato específico. Uso: /img [png|jpg|mp4|gif|webp]',

    ejecutar: async (ctx) => {
        const { sock, msg, from, args, downloadMediaMessage, logger, logError } = ctx

        let targetFormat = 'png'
        if (args.length > 0) {
            const fmt = args[0].toLowerCase()
            if (['png', 'jpg', 'jpeg', 'mp4', 'gif', 'webp'].includes(fmt)) {
                targetFormat = fmt === 'jpeg' ? 'jpg' : fmt
            } else {
                return await sock.sendMessage(from, { text: '❌ Formato no válido. Usa: png, jpg, mp4, gif o webp.' }, { quoted: msg })
            }
        }

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
        const quoted = contextInfo?.quotedMessage

        if (!quoted) {
            return await sock.sendMessage(from, { text: 'Responde a un sticker o imagen de ver-una-vez con */img [formato]*' }, { quoted: msg })
        }

        let mediaMsg = null
        let mediaType = ''

        if (quoted.stickerMessage) {
            mediaMsg = quoted.stickerMessage
            mediaType = 'sticker'
        } else if (quoted.viewOnceMessage?.message?.imageMessage || quoted.viewOnceMessageV2?.message?.imageMessage || quoted.viewOnceMessageV2Extension?.message?.imageMessage) {
            mediaMsg = quoted.viewOnceMessage?.message?.imageMessage || quoted.viewOnceMessageV2?.message?.imageMessage || quoted.viewOnceMessageV2Extension?.message?.imageMessage
            mediaType = 'image'
        } else if (quoted.viewOnceMessage?.message?.videoMessage || quoted.viewOnceMessageV2?.message?.videoMessage || quoted.viewOnceMessageV2Extension?.message?.videoMessage) {
            mediaMsg = quoted.viewOnceMessage?.message?.videoMessage || quoted.viewOnceMessageV2?.message?.videoMessage || quoted.viewOnceMessageV2Extension?.message?.videoMessage
            mediaType = 'video'
        } else if (quoted.imageMessage) {
            mediaMsg = quoted.imageMessage
            mediaType = 'image'
        } else if (quoted.videoMessage) {
            mediaMsg = quoted.videoMessage
            mediaType = 'video'
        } else {
            return await sock.sendMessage(from, { text: '❌ Solo respondiendo a *stickers*, *imágenes* o *videos de un solo uso*.' }, { quoted: msg })
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

            const buffer = await downloadMediaMessage({ key: quotedKey, message: quoted }, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })

            let finalBuffer
            let sendType

            if (mediaType === 'sticker') {
                const result = await stickerToMedia(buffer, targetFormat)
                finalBuffer = result.buffer
                sendType = result.type
            } else if (mediaType === 'video') {
                finalBuffer = buffer
                sendType = 'video'
            } else {
                finalBuffer = buffer
                sendType = 'image'
                const inputExt = extFromMimetype(mediaMsg.mimetype)
                if (targetFormat === 'mp4') {
                    const tmp = os.tmpdir()
                    const id = Date.now()
                    const input = path.join(tmp, `img_${id}.${inputExt}`)
                    const output = path.join(tmp, `img_${id}.mp4`)
                    fs.writeFileSync(input, buffer)
                    await execAsync(`ffmpeg -y -loop 1 -i "${input}" -c:v libx264 -t 3 -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${output}"`)
                    finalBuffer = fs.readFileSync(output)
                    sendType = 'video'
                    if (fs.existsSync(input)) fs.unlinkSync(input)
                    if (fs.existsSync(output)) fs.unlinkSync(output)
                } else if (targetFormat !== 'png' && targetFormat !== 'jpg') {
                    const tmp = os.tmpdir()
                    const id = Date.now()
                    const input = path.join(tmp, `img_${id}.${inputExt}`)
                    const output = path.join(tmp, `img_${id}.${targetFormat}`)
                    fs.writeFileSync(input, buffer)
                    await execAsync(`magick "${input}" "${output}"`)
                    finalBuffer = fs.readFileSync(output)
                    if (fs.existsSync(input)) fs.unlinkSync(input)
                    if (fs.existsSync(output)) fs.unlinkSync(output)
                }
            }

            const caption = mediaType === 'sticker'
                ? `🖼️ *Sticker convertido a ${targetFormat.toUpperCase()}*`
                : mediaType === 'video'
                ? `🎥 *Video recuperado en MP4*`
                : `📸 *Imagen recuperada a ${targetFormat.toUpperCase()}*`

            if (sendType === 'video') {
                await sock.sendMessage(from, { video: finalBuffer, caption }, { quoted: msg })
            } else {
                await sock.sendMessage(from, { image: finalBuffer, caption }, { quoted: msg })
            }

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })
        } catch (err) {
            logError('comando /img', err)
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
            await sock.sendMessage(from, { text: `❌ Error: ${err.message}` })
        }
    }
}
