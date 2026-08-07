// WhatsApp a veces envuelve el contenido real dentro de otro mensaje "contenedor":
// view-once (la foto de un solo vistazo), o "calidad HD" que viaja como documento
// con caption. Esto desenvuelve todo eso hasta llegar al contenido real.
// (Coincide con la función interna getFutureProofMessage que usa Baileys.)
export function unwrap(message) {
    let current = message
    while (current) {
        const contenedor = current.viewOnceMessageV2 || current.viewOnceMessageV2Extension || current.viewOnceMessage || current.ephemeralMessage
        if (!contenedor?.message) break
        current = contenedor.message
    }
    return current
}

// Devuelve { type: 'image'|'video', media, caption } o null si no hay media reconocible.
// `media` es el objeto que ya trae mimetype/mediaKey/url — se puede pasar tal cual a downloadMediaMessage.
export function getMediaInfo(message) {
    const content = unwrap(message)
    if (!content) return null

    if (content.imageMessage) return { type: 'image', media: content.imageMessage, caption: content.imageMessage.caption || '' }
    if (content.videoMessage) return { type: 'video', media: content.videoMessage, caption: content.videoMessage.caption || '' }

    // fotos/videos en "calidad HD" viajan como documento con caption
    const doc = content.documentWithCaptionMessage?.message?.documentMessage
    if (doc?.mimetype?.startsWith('image/')) return { type: 'image', media: doc, caption: doc.caption || '' }
    if (doc?.mimetype?.startsWith('video/')) return { type: 'video', media: doc, caption: doc.caption || '' }

    return null
}

export function getTextContent(message) {
    const content = unwrap(message)
    if (!content) return ''
    return content.conversation || content.extendedTextMessage?.text || getMediaInfo(message)?.caption || ''
}
