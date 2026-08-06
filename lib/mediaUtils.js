const MIME_TO_EXT = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/quicktime': 'mov'
}

function extFromMimetype(mimetype = '') {
    if (MIME_TO_EXT[mimetype]) return MIME_TO_EXT[mimetype]
    if (mimetype.startsWith('image/')) return 'jpg'
    if (mimetype.startsWith('video/')) return 'mp4'
    return 'bin'
}

module.exports = { extFromMimetype }
