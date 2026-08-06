const {
    default: makeWASocket,
    useMultiFileAuthState,
    downloadMediaMessage,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { logInfo, logError } = require('./lib/logger')

const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'error' })

process.on('uncaughtException', (err) => logError('uncaughtException', err))
process.on('unhandledRejection', (reason) => logError('unhandledRejection', reason))

const groupCache = new Map()
const GROUP_CACHE_TTL = 5 * 60 * 1000

function cacheSet(jid, metadata) {
    groupCache.set(jid, { data: metadata, ts: Date.now() })
}

function cacheGet(jid) {
    const entry = groupCache.get(jid)
    if (!entry) return undefined
    if (Date.now() - entry.ts > GROUP_CACHE_TTL) {
        groupCache.delete(jid)
        return undefined
    }
    return entry.data
}

function pregunta(texto) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise(res => rl.question(texto, ans => { rl.close(); res(ans.trim()) }))
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: state,
        logger,
        markOnlineOnConnect: false,
        browser: Browsers.ubuntu('Chrome'),
        cachedGroupMetadata: async (jid) => cacheGet(jid)
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('groups.update', async ([event]) => {
        try {
            const metadata = await sock.groupMetadata(event.id)
            cacheSet(event.id, metadata)
        } catch (e) {}
    })

    sock.ev.on('group-participants.update', async (event) => {
        try {
            const metadata = await sock.groupMetadata(event.id)
            cacheSet(event.id, metadata)
        } catch (e) {}
    })

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            const numero = await pregunta('\n Ingresa tu número de WhatsApp (ej: 56912345678)\n➜ ')
            try {
                const code = await sock.requestPairingCode(numero)
                const fmt = code?.match(/.{1,4}/g)?.join('-') || code
                console.log(`\n Código de vinculación: ${fmt}`)
            } catch (error) {
                logError('requestPairingCode', error)
            }
        }, 3000)
    }

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'open') logInfo('✅ Bot conectado y escuchando comandos!')
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode
            const retry = code !== DisconnectReason.loggedOut
            if (lastDisconnect?.error) logError('connection.close', lastDisconnect.error)
            logInfo(`🔌 Conexión cerrada (${code}). ${retry ? 'Reconectando...' : 'Sesión cerrada.'}`)
            if (retry) setTimeout(startBot, 3000)
            else {
                logInfo('Sesión cerrada. Borra ./auth_info.')
                process.exit(0)
            }
        }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return

        for (const msg of messages) {
            if (!msg.message) continue
            const from = msg.key.remoteJid
            const fromMe = msg.key.fromMe

            const rawText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim()
            if (!rawText.startsWith('/')) continue

            const args = rawText.slice(1).trim().split(/ +/)
            const cmdName = args.shift().toLowerCase()

            const cmdPath = path.join(__dirname, 'extensiones', `${cmdName}.js`)
            if (!fs.existsSync(cmdPath)) continue

            const whitelistPath = path.join(__dirname, 'whitelist.json')
            let whitelist = []
            if (fs.existsSync(whitelistPath)) {
                try { whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8')) } catch (e) {}
            }

            const sender = fromMe
                ? (sock.user.id.split(':')[0] + '@s.whatsapp.net')
                : (msg.key.participant || msg.key.remoteJid)

            const isCreator = fromMe
            const isWhitelisted = whitelist.includes(sender)

            if (!isCreator && !isWhitelisted) continue

            if (from.endsWith('@g.us') && !cacheGet(from)) {
                sock.groupMetadata(from).then(meta => cacheSet(from, meta)).catch(() => {})
            }

            try {
                delete require.cache[require.resolve(cmdPath)]
                const extension = require(cmdPath)
                await extension.ejecutar({ sock, msg, from, args, downloadMediaMessage, logger, logError, sender, isCreator, groupCache: { get: cacheGet, set: cacheSet } })
            } catch (err) {
                logError(`comando /${cmdName} (${sender})`, err)
                await sock.sendMessage(from, { text: `❌ Error en el comando: ${err.message}` })
            }
        }
    })
}

startBot().catch((err) => logError('startBot', err))
