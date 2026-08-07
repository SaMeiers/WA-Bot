import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const GIT_DIR = path.join(ROOT, '.git')

const FILE_STATUS = {
    M: '📝 Modificado',
    A: '➕ Agregado',
    D: '🗑️ Eliminado',
    R: '🔄 Renombrado',
    C: '📋 Copiado',
}

function clearGitLocks() {
    try {
        execSync(`find "${GIT_DIR}" -name "*.lock" -delete`)
    } catch (_) {}
}

export default {
    nombre: 'update',
    descripcion: 'Actualiza el bot desde GitHub (solo creador)',

    ejecutar: async (ctx) => {
        const { sock, msg, from, isCreator, logError } = ctx

        if (!isCreator) return

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

            clearGitLocks()

            const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT })
            const branch = branchOut.trim()

            await execAsync(`git fetch origin ${branch}`, { cwd: ROOT })

            const { stdout: logOut } = await execAsync(
                `git log HEAD..origin/${branch} --pretty=format:"%h|%s|%an|%cr"`,
                { cwd: ROOT }
            )

            if (!logOut.trim()) {
                await sock.sendMessage(from, {
                    text: '✅ *El bot ya está actualizado*\nNo hay cambios nuevos en el repositorio.'
                }, { quoted: msg })
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })
                return
            }

            const commits = logOut.trim().split('\n').filter(Boolean).map(line => {
                const [hash, subject, author, when] = line.split('|')
                return { hash, subject, author, when }
            })

            const { stdout: diffOut } = await execAsync(
                `git diff --name-status HEAD origin/${branch}`,
                { cwd: ROOT }
            )
            const changedFiles = diffOut.trim().split('\n').filter(Boolean).map(line => {
                const parts = line.split('\t')
                const rawStatus = parts[0][0]
                const fileName = parts[parts.length - 1]
                const label = FILE_STATUS[rawStatus] || `❓ ${rawStatus}`
                return { label, fileName, rawStatus }
            })

            const { stdout: statOut } = await execAsync(
                `git diff --shortstat HEAD origin/${branch}`,
                { cwd: ROOT }
            )
            const stats = statOut.trim()

            const commitLines = commits
                .map(c => `  • *[${c.hash}]* ${c.subject}\n    _${c.author} · ${c.when}_`)
                .join('\n')

            const fileLines = changedFiles
                .map(f => `  ${f.label}: \`${f.fileName}\``)
                .join('\n')

            const pkgWillChange = changedFiles.some(f => f.fileName.includes('package.json'))

            let text = `🚀 *Bot actualizado exitosamente!*\n`
            text += `📌 Rama: \`${branch}\`\n`
            text += `📊 ${stats}\n`
            text += `\n📋 *Commits (${commits.length}):*\n${commitLines}\n`
            text += `\n📁 *Archivos afectados (${changedFiles.length}):*\n${fileLines}`
            if (pkgWillChange) {
                text += `\n\n📦 _package.json cambia — se ejecutará npm install._`
            }
            text += `\n\n♻️ _Reiniciando..._`

            await sock.sendMessage(from, { text }, { quoted: msg })
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })

            await execAsync(`git reset --hard origin/${branch}`, { cwd: ROOT })

            if (pkgWillChange) {
                await execAsync('npm install', { cwd: ROOT })
            }

        } catch (err) {
            logError('comando /update', err)
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
            await sock.sendMessage(from, {
                text: `❌ *Error al actualizar:*\n\`\`\`${err.message}\`\`\``
            }, { quoted: msg })
        }
    }
}
