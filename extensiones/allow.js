const fs = require('fs')
const path = require('path')

module.exports = {
    nombre: 'allow',
    descripcion: 'Da o quita permisos para usar el bot',
    
    ejecutar: async (ctx) => {
        const { sock, msg, from, isCreator } = ctx
        
        if (!isCreator) return 

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
        const quoted = contextInfo?.quotedMessage

        if (!quoted) {
            return await sock.sendMessage(from, { 
                text: '⚠️ *Uso incorrecto:*\nDebes responder al mensaje de la persona que quieres autorizar/bloquear usando */allow*' 
            }, { quoted: msg })
        }

        const targetJid = contextInfo.participant || from

        const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net'
        if (targetJid === botJid) {
            return await sock.sendMessage(from, { text: '🤖 No necesitas darte permisos a ti mismo, tú eres el admin supremo.' }, { quoted: msg })
        }

        const whitelistPath = path.join(__dirname, '..', 'whitelist.json')
        let whitelist = []
        
        if (fs.existsSync(whitelistPath)) {
            try { whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8')) } catch (e) {}
        }

        if (whitelist.includes(targetJid)) {

            whitelist = whitelist.filter(jid => jid !== targetJid)
            fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 2))
            
            await sock.sendMessage(from, { 
                text: '🔴 *Permisos revocados*\nEste usuario ya no será escuchado por el bot.' 
            }, { quoted: msg })

        } else {

            whitelist.push(targetJid)
            fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 2))
            
            await sock.sendMessage(from, { 
                text: '🟢 *Usuario autorizado*\nAhora puede usar todos los comandos del bot.' 
            }, { quoted: msg })
        }
    }
}
