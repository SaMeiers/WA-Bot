import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
    nombre: 'allow',
    descripcion: 'Da o quita permisos para usar el bot. Uso: /allow (responde a un mensaje) | /allow all (modo libre) | /allow none (revocar todos)',

    ejecutar: async (ctx) => {
        const { sock, msg, from, args, isCreator } = ctx

        if (!isCreator) return

        const modePath = path.join(__dirname, '..', 'mode.json')
        let allMode = false
        if (fs.existsSync(modePath)) {
            try { allMode = JSON.parse(fs.readFileSync(modePath, 'utf8')).allMode === true } catch (e) {}
        }

        if (args.length === 1 && args[0] === 'all') {
            const modeData = { allMode: true }
            fs.writeFileSync(modePath, JSON.stringify(modeData, null, 2))
            return await sock.sendMessage(from, { text: '🌐 *Modo libre activado*\nAhora CUALQUIER usuario puede usar todos los comandos del bot.' }, { quoted: msg })
        }

        if (args.length === 1 && args[0] === 'none') {
            const modeData = { allMode: false }
            fs.writeFileSync(modePath, JSON.stringify(modeData, null, 2))
            const whitelistPath = path.join(__dirname, '..', 'whitelist.json')
            if (fs.existsSync(whitelistPath)) {
                fs.writeFileSync(whitelistPath, JSON.stringify([], null, 2))
            }
            return await sock.sendMessage(from, { text: '🔒 *Modo libre desactivado*\nLa lista de permisos se ha reseteado. Usa /allow respondiendo a un mensaje para autorizar usuarios manualmente.' }, { quoted: msg })
        }

        if (allMode) {
            return await sock.sendMessage(from, { text: '⚠️ *El modo libre está activo*\nDesactívalo con `/allow none` y luego agrega usuarios manualmente con `/allow` respondiendo a su mensaje.' }, { quoted: msg })
        }

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
        const quoted = contextInfo?.quotedMessage

        if (!quoted) {
            return await sock.sendMessage(from, {
                text: '⚠️ *Uso incorrecto:*\nResponde al mensaje de la persona que quieres autorizar/bloquear usando */allow*\nO usa */allow all* o */allow none*'
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
