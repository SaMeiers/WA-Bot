module.exports = {
    nombre: 'md',
    descripcion: 'Envía un bloque de código interactivo usando RichMessage',
    
    ejecutar: async (ctx) => {
        const { sock, msg, from, args } = ctx

        if (args.length < 2) {
            return await sock.sendMessage(from, { 
                text: '⚠️ *Uso incorrecto:*\nDebes especificar el lenguaje y el código.\n\n*Ejemplo:*\n`/md javascript console.log("Hola mundo");`' 
            }, { quoted: msg })
        }

        const lenguaje = args[0]
        const codigo = args.slice(1).join(' ')

        await sock.sendMessage(from, { 
            disclaimerText: `Generado por WA-BOT`, 
            headerText: `## Código: ${lenguaje.toUpperCase()}`, 
            contentText: 'Haz clic en "Ver código" para expandir o copiar:', 
            code: codigo, 
            language: lenguaje, 
            footerText: 'Powered by WA-BOT Personal' 
        }, { quoted: msg })
    }
}
