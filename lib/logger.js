import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const LOG_DIR = path.join(__dirname, '..', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'errors.log')
const DEBUG_FILE = path.join(LOG_DIR, 'debug.log')

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

function timestamp() {
    return new Date().toISOString()
}

export function logInfo(msg) {
    console.log(`[${timestamp()}] ${msg}`)
}

export function logDebug(msg) {
    console.log(`🔍 [${timestamp()}] ${msg}`)
    try {
        fs.appendFileSync(DEBUG_FILE, `[${timestamp()}] ${msg}\n`)
    } catch (_) {
        // igual que con errors.log, no tumbamos el bot si no se puede escribir
    }
}

export function logError(context, err) {
    const detail = err?.stack || err?.message || String(err)
    console.error(`❌ [${timestamp()}] [${context}]`, err?.message || err)
    try {
        fs.appendFileSync(LOG_FILE, `[${timestamp()}] ${context} :: ${detail}\n`)
    } catch (_) {
        // si ni siquiera se puede escribir el log, no tumbamos el bot por eso
    }
}
