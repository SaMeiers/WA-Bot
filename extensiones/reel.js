module.exports = {
    nombre: 'reel',
    descripcion: 'Convierte un video a formato Reel interactivo',
    
    ejecutar: async (ctx) => {
        const { sock, msg, from, downloadMediaMessage, logger, logError } = ctx

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
        const quoted = contextInfo?.quotedMessage

        if (!quoted?.videoMessage) {
            return await sock.sendMessage(from, { 
                text: '🎥 Responde a un *video* vertical con */reel*.' 
            }, { quoted: msg })
        }

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net'
            const isQuotedFromMe = (contextInfo.participant || from) === botJid

            const quotedKey = {
                remoteJid: from,
                id: contextInfo.stanzaId,
                participant: contextInfo.participant || undefined,
                fromMe: isQuotedFromMe
            }

            const buffer = await downloadMediaMessage(
                { key: quotedKey, message: quoted }, 'buffer', {},
                { logger, reuploadRequest: sock.updateMediaMessage }
            )
            
            await sock.sendMessage(from, { 
                video: buffer,
                caption: '📱 *Nuevo Reel*\n¡Mira este video interactivo!',
                footer: 'Powered by WA-BOT',
                jpegThumbnail: undefined,
                viewOnce: false, 
                buttons: [
                    {
                        buttonId: 'btn_like',
                        buttonText: { displayText: '❤️ Me gusta' },
                        type: 1
                    },
                    {
                        buttonId: 'btn_share',
                        buttonText: { displayText: '🔄 Compartir' },
                        type: 1
                    }
                ]
            }, { quoted: msg })
            
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })

        } catch (err) {
            logError('comando /reel', err)
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
        }
    }
}
