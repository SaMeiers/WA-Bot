const fs = require('fs')
const path = require('path')

const LOG_DIR = path.join(__dirname, '..', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'errors.log')

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

function timestamp() {
    return new Date().toISOString()
}

function logInfo(msg) {
    console.log(`[${timestamp()}] ${msg}`)
}

function logError(context, err) {
    const detail = err?.stack || err?.message || String(err)
    console.error(`❌ [${timestamp()}] [${context}]`, err?.message || err)
    try {
        fs.appendFileSync(LOG_FILE, `[${timestamp()}] ${context} :: ${detail}\n`)
    } catch (_) {
        
    }
}

module.exports = { logInfo, logError }
