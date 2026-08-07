import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEBUG_FILE = path.join(__dirname, '..', 'logs', 'debug.log')
const ERROR_FILE = path.join(__dirname, '..', 'logs', 'errors.log')

export default {
    nombre: 'log',
    descripcion: '(Solo creador, temporal) Envía el archivo de debug/errores para diagnosticar bugs',

    ejecutar: async (ctx) => {
        const { sock, msg, from, args, isCreator, logError } = ctx

        if (!isCreator) {
            return await sock.sendMessage(from, { text: '⛔ Este comando es solo para el creador del bot.' }, { quoted: msg })
        }

        const cual = (args[0] || 'debug').toLowerCase()
        const targetFile = cual === 'errors' ? ERROR_FILE : DEBUG_FILE
        const nombreArchivo = cual === 'errors' ? 'errors.log' : 'debug.log'

        try {
            if (!fs.existsSync(targetFile) || fs.statSync(targetFile).size === 0) {
                return await sock.sendMessage(from, { text: `📄 ${nombreArchivo} está vacío (todavía no se registró nada).` }, { quoted: msg })
            }

            await sock.sendMessage(from, {
                document: fs.readFileSync(targetFile),
                fileName: nombreArchivo,
                mimetype: 'text/plain'
            }, { quoted: msg })

        } catch (err) {
            logError('comando /log', err)
            await sock.sendMessage(from, { text: `❌ Error al leer el log: ${err.message}` }, { quoted: msg })
        }
    }
}
