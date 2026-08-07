import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
    nombre: 'help',
    descripcion: 'Muestra la lista de todos los comandos disponibles con su uso',

    ejecutar: async (ctx) => {
        const { sock, msg, from, logError } = ctx

        const extensionesDir = __dirname

        const archivos = fs.readdirSync(extensionesDir).filter(f => f.endsWith('.js') && f !== 'help.js')

        const comandos = []

        for (const archivo of archivos) {
            try {
                const cmdPath = path.join(extensionesDir, archivo)
                const moduleUrl = `${pathToFileURL(cmdPath).href}?update=${Date.now()}`
                const cmdModule = await import(moduleUrl)
                const cmd = cmdModule.default
                if (cmd.nombre && cmd.descripcion) {
                    comandos.push({
                        nombre: cmd.nombre,
                        descripcion: cmd.descripcion
                    })
                }
            } catch (err) {
                logError(`carga de extensión ${archivo}`, err)
            }
        }

        comandos.sort((a, b) => a.nombre.localeCompare(b.nombre))

        if (comandos.length === 0) {
            return await sock.sendMessage(from, { text: '⚠️ No se encontraron comandos disponibles.' }, { quoted: msg })
        }

        let texto = '📋 *Lista de comandos disponibles*\n\n'
        for (const cmd of comandos) {
            texto += `🔹 */${cmd.nombre}*\n   _${cmd.descripcion}_\n\n`
        }

        texto += '*Uso:* Responde a stickers, imágenes o videos con /s, /img, etc.\n'
        texto += '*Nota:* Solo usuarios autorizados pueden usar comandos.'

        await sock.sendMessage(from, { text: texto }, { quoted: msg })
    }
}
