const { exec } = require('child_process')
const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const os = require('os')
const execAsync = promisify(exec)

module.exports = {
    nombre: 'dl',
    descripcion: 'Descarga de YouTube, Instagram y TikTok. Uso: /dl [mp3|mp4] [url]',
    
    ejecutar: async (ctx) => {
        const { sock, msg, from, args, logError } = ctx

        if (args.length < 2) {
            return await sock.sendMessage(from, { 
                text: '⚠️ *Uso incorrecto:*\nDebes especificar el formato y el enlace.\n\n*Ejemplo:*\n`/dl mp4 https://youtube.com/...`\n`/dl mp3 https://tiktok.com/...`' 
            }, { quoted: msg })
        }

        const format = args[0].toLowerCase()
        const url = args[1]

        if (!['mp3', 'mp4'].includes(format)) {
            return await sock.sendMessage(from, { text: '❌ Solo soporto formatos *mp3* y *mp4*.' }, { quoted: msg })
        }

        const regexRedes = /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)/i
        if (!regexRedes.test(url)) {
            return await sock.sendMessage(from, { 
                text: '❌ Por ahora solo descargo de *YouTube, Instagram y TikTok*.' 
            }, { quoted: msg })
        }

        const tmp = os.tmpdir()
        const id = Date.now()
        const output = path.join(tmp, `dl_${id}.${format}`)

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

            let command = ''
            if (format === 'mp4') {
                command = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -S "vcodec:h264,res,acodec:m4a" --max-filesize 45M --merge-output-format mp4 -o "${output}" "${url}"`
            } else if (format === 'mp3') {
                command = `yt-dlp -x --audio-format mp3 --audio-quality 0 --max-filesize 45M -o "${output}" "${url}"`
            }

            await execAsync(command)

            if (!fs.existsSync(output)) {
                throw new Error('Archivo excedió el límite o el video es privado.')
            }

            const buffer = fs.readFileSync(output)

            let plataforma = '📱 Multimedia'
            if (url.includes('youtube') || url.includes('youtu.be')) plataforma = '🔴 YouTube'
            if (url.includes('instagram')) plataforma = '🟣 Instagram'
            if (url.includes('tiktok')) plataforma = '🎵 TikTok'

            if (format === 'mp4') {
                await sock.sendMessage(from, { 
                    video: buffer, 
                    caption: `${plataforma} | *Descarga completada* 🎬` 
                }, { quoted: msg })
            } else {
                await sock.sendMessage(from, { 
                    audio: buffer, 
                    mimetype: 'audio/mpeg',
                }, { quoted: msg })
            }

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })

        } catch (err) {
            logError('comando /dl', err)
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
            await sock.sendMessage(from, { 
                text: `❌ *Error al descargar:*\nPosibles causas:\n1. El video es privado.\n2. Pesa más de 45MB.\n3. Instagram bloqueó la petición anónima.` 
            }, { quoted: msg })
        } finally {
            
            if (fs.existsSync(output)) {
                fs.unlinkSync(output)
            }
        }
    }
}
