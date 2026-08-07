const webp = require('node-webpmux')

const PACK_NAME = process.env.STICKER_PACK || ''
const PACK_AUTHOR = process.env.STICKER_AUTHOR || ''

async function addExif(buffer) {
    const img = new webp.Image()
    await img.load(buffer)

    const json = {
        'sticker-pack-id': `wa-bot-${Date.now()}`,
        'sticker-pack-name': PACK_NAME,
        'sticker-pack-publisher': PACK_AUTHOR,
        emojis: ['🤖']
    }

    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
        0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ])
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8')
    const exif = Buffer.concat([exifAttr, jsonBuffer])
    exif.writeUIntLE(jsonBuffer.length, 14, 4)

    img.exif = exif
    return await img.save(null)
}

module.exports = { addExif }
