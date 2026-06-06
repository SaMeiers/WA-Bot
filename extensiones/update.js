const { exec } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const fs = require('fs')
const execAsync = promisify(exec)

const ROOT = path.join(__dirname, '..')

const FILE_STATUS = {
    M: '📝 Modificado',
    A: '➕ Agregado',
    D: '🗑️ Eliminado',
    R: '🔄 Renombrado',
    C: '📋 Copiado',
}

module.exports = {
    nombre: 'update',
    descripcion: 'Actualiza el bot desde GitHub (solo creador)',

    ejecutar: async (ctx) => {
        const { sock, msg, from, isCreator } = ctx

        if (!isCreator) return

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

            const { stdout: headBefore } = await execAsync('git rev-parse HEAD', { cwd: ROOT })
            const prevHead = headBefore.trim()

            const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT })
            const branch = branchOut.trim()

            const { stdout: pullOut } = await execAsync(`git pull origin ${branch}`, { cwd: ROOT })

            if (pullOut.includes('Already up to date')) {
                await sock.sendMessage(from, {
                    text: '✅ *El bot ya está actualizado*\nNo hay cambios nuevos en el repositorio.'
                }, { quoted: msg })
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })
                return
            }

            const { stdout: logOut } = await execAsync(
                `git log ${prevHead}..HEAD --pretty=format:"%h|%s|%an|%cr"`,
                { cwd: ROOT }
            )
            const commits = logOut.trim().split('\n').filter(Boolean).map(line => {
                const [hash, subject, author, when] = line.split('|')
                return { hash, subject, author, when }
            })

            const { stdout: diffOut } = await execAsync(
                `git diff --name-status ${prevHead} HEAD`,
                { cwd: ROOT }
            )
            const changedFiles = diffOut.trim().split('\n').filter(Boolean).map(line => {
                const parts = line.split('\t')
                const rawStatus = parts[0][0]     
                const fileName = parts[parts.length - 1]
                const label = FILE_STATUS[rawStatus] || `❓ ${rawStatus}`
                return { label, fileName }
            })
            
            const { stdout: statOut } = await execAsync(
                `git diff --shortstat ${prevHead} HEAD`,
                { cwd: ROOT }
            )
            const stats = statOut.trim()
            
            const pkgChanged = changedFiles.some(f => f.fileName.includes('package.json'))
            if (pkgChanged) {
                await execAsync('npm install', { cwd: ROOT })
            }

            const commitLines = commits
                .map(c => `  • *[${c.hash}]* ${c.subject}\n    _${c.author} · ${c.when}_`)
                .join('\n')

            const fileLines = changedFiles
                .map(f => `  ${f.label}: \`${f.fileName}\``)
                .join('\n')

            let text = `🚀 *Bot actualizado exitosamente!*\n`
            text += `📌 Rama: \`${branch}\`\n`
            text += `📊 ${stats}\n`
            text += `\n📋 *Commits nuevos (${commits.length}):*\n${commitLines}\n`
            text += `\n📁 *Archivos afectados (${changedFiles.length}):*\n${fileLines}`

            if (pkgChanged) {
                text += `\n\n📦 _Se detectaron cambios en package.json — npm install ejecutado._`
            }

            text += `\n\n♻️ _Reiniciando bot en 3 segundos..._`

            await sock.sendMessage(from, { text }, { quoted: msg })
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })

            setTimeout(() => process.exit(0), 3000)

        } catch (err) {
            console.error('❌ Error en /update:', err.message)
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
            await sock.sendMessage(from, {
                text: `❌ *Error al actualizar:*\n\`\`\`${err.message}\`\`\``
            }, { quoted: msg })
        }
    }
}
