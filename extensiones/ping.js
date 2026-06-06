module.exports = {
    nombre: 'ping',
    descripcion: 'Verifica la latencia del bot',
    
    ejecutar: async (ctx) => {
        const { sock, msg, from } = ctx
        
        const ms = Math.abs(Date.now() - (msg.messageTimestamp * 1000))
        await sock.sendMessage(from, { text: `🤖 Pong! _(${ms}ms)_` }, { quoted: msg })
    }
}
