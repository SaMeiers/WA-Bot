const {
    default: makeWASocket,
    useMultiFileAuthState,
    downloadMediaMessage,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@sameiers/baileys')
const pino = require('pino')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const logger = pino({ level: 'silent' })

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
    })

    sock.ev.on('creds.update', saveCreds)

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            const numero = await pregunta('\n Ingresa tu número de WhatsApp (ej: 56912345678)\n➜ ')
            try {
                const code = await sock.requestPairingCode(numero)
                const fmt = code?.match(/.{1,4}/g)?.join('-') || code
                console.log(`\n Código de vinculación: ${fmt}`)
            } catch (error) {
                console.error('\n Error al solicitar el código:', error.message)
            }
        }, 3000)
    }

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'open') console.log(' Bot conectado y escuchando comandos!\n')
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode
            const retry = code !== DisconnectReason.loggedOut
            console.log(` Conexión cerrada (${code}). Reconectando...`)
            if (retry) setTimeout(startBot, 3000)
            else {
                console.log(' Sesión cerrada. Borra ./auth_info.')
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

            if (fs.existsSync(cmdPath)) {
                const whitelistPath = path.join(__dirname, 'whitelist.json')
                let whitelist = []

                if (fs.existsSync(whitelistPath)) {
                    try { whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8')) } catch (e) { }
                }

                const sender = fromMe
                    ? (sock.user.id.split(':')[0] + '@s.whatsapp.net')
                    : (msg.key.participant || msg.key.remoteJid)

                const isCreator = fromMe
                const isWhitelisted = whitelist.includes(sender)

                if (!isCreator && !isWhitelisted) {
                    continue
                }

                try {
                    delete require.cache[require.resolve(cmdPath)]
                    const extension = require(cmdPath)
                    await extension.ejecutar({ sock, msg, from, args, downloadMediaMessage, logger, sender, isCreator })
                } catch (err) {
                    console.error(`❌ Error al ejecutar extensión [${cmdName}]:`, err)
                    await sock.sendMessage(from, { text: `❌ Error en el comando: ${err.message}` })
                }
            }
        }
    })
}

startBot().catch(console.error)
