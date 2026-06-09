const fs = require('fs')
const path = require('path')

const rankPath = path.join(__dirname, '..', 'rank.json')
const partidasPath = path.join(__dirname, '..', 'partidas.json')

const timers = {}

function cargarPartidas() {
    if (fs.existsSync(partidasPath)) {
        try { return JSON.parse(fs.readFileSync(partidasPath, 'utf8')) } catch (e) { return {} }
    }
    return {}
}

function guardarPartidas(data) {
    fs.writeFileSync(partidasPath, JSON.stringify(data, null, 2))
}

function cargarRank() {
    if (fs.existsSync(rankPath)) {
        try { return JSON.parse(fs.readFileSync(rankPath, 'utf8')) } catch (e) { return { participantes: {} } }
    }
    return { participantes: {} }
}

function guardarRank(data) {
    fs.writeFileSync(rankPath, JSON.stringify(data, null, 2))
}

function registrarMuerte(jid, nombre) {
    const db = cargarRank()
    if (!db.participantes[jid]) db.participantes[jid] = { nombre, victorias: 0, muertes: 0 }
    db.participantes[jid].muertes += 1
    db.participantes[jid].nombre = nombre
    guardarRank(db)
}

function registrarVictoria(jid, nombre) {
    const db = cargarRank()
    if (!db.participantes[jid]) db.participantes[jid] = { nombre, victorias: 0, muertes: 0 }
    db.participantes[jid].victorias += 1
    db.participantes[jid].nombre = nombre
    guardarRank(db)
}

function generarTambor(ronda) {
    const balas = Math.min(ronda, 5)
    let tambor = Array(6).fill(0)
    for (let i = 0; i < balas; i++) tambor[i] = 1
    for (let i = tambor.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[tambor[i], tambor[j]] = [tambor[j], tambor[i]]
    }
    return tambor
}

function vivos(partida) {
    return partida.jugadores.filter(j => !j.muerto)
}

function limpiarTimers(from) {
    if (timers[from]) {
        clearTimeout(timers[from].lobby)
        clearTimeout(timers[from].turno)
        delete timers[from]
    }
}

function cerrarPartida(from) {
    limpiarTimers(from)
    const partidas = cargarPartidas()
    delete partidas[from]
    guardarPartidas(partidas)
}

module.exports = {
    nombre: 'ruleta',
    descripcion: 'Mortal minijuego de Ruleta Rusa. Uso: /ruleta [crear|join|leave|start|kick|dispararme|disparar|jugadores|rank]',

    ejecutar: async (ctx) => {
        const { sock, msg, from, args, sender, groupCache } = ctx

        if (!from.endsWith('@g.us')) {
            return await sock.sendMessage(from, { text: '❌ Este juego enfermo solo se puede jugar en grupos.' }, { quoted: msg })
        }

        const subCmd = args[0] ? args[0].toLowerCase() : ''
        const pushName = msg.pushName || 'Desconocido'
        const partidas = cargarPartidas()
        const partida = partidas[from]

        if (subCmd === 'rank') {
            const db = cargarRank()
            const top = Object.values(db.participantes)
                .sort((a, b) => b.victorias - a.victorias)
                .slice(0, 10)

            if (top.length === 0) return await sock.sendMessage(from, { text: '💀 Nadie ha sobrevivido lo suficiente para estar en el ranking.' }, { quoted: msg })

            let texto = '🏆 *TOP SOBREVIVIENTES — RULETA RUSA* 🏆\n\n'
            top.forEach((p, i) => {
                const ratio = p.muertes === 0 ? '∞' : (p.victorias / p.muertes).toFixed(2)
                texto += `#${i + 1} *${p.nombre}*\n   👑 ${p.victorias} victorias | 💀 ${p.muertes} muertes | 📊 Ratio: ${ratio}\n`
            })
            return await sock.sendMessage(from, { text: texto }, { quoted: msg })
        }

        if (subCmd === 'crear') {
            if (partida) return await sock.sendMessage(from, { text: '❌ Ya hay una sala activa en este grupo. Espera a que termine.' }, { quoted: msg })

            const nuevaPartida = {
                creador: sender,
                estado: 'LOBBY',
                ronda: 1,
                jugadores: [{ jid: sender, nombre: pushName, muerto: false }],
                votosKick: {},
                tambor: [],
                idxTambor: 0,
                idxTurno: 0
            }
            partidas[from] = nuevaPartida
            guardarPartidas(partidas)

            if (!timers[from]) timers[from] = {}
            clearTimeout(timers[from].lobby)
            timers[from].lobby = setTimeout(async () => {
                const p = cargarPartidas()
                if (p[from] && p[from].estado === 'LOBBY') {
                    await sock.sendMessage(from, { text: '⏳ La sala se cerró automáticamente por inactividad (5 minutos sin iniciar).' })
                    cerrarPartida(from)
                }
            }, 5 * 60 * 1000)

            const cachedMeta = groupCache?.get(from) || await sock.groupMetadata(from)
            const todosLosMiembros = cachedMeta.participants.map(p => p.id)

            const texto = `⚠️ *¡ATENCIÓN, ESCORIA DEL GRUPO!* ⚠️\nUn enfermo llamado *${pushName}* acaba de poner un revólver en la mesa.\n\nTienen *5 minutos* para usar */ruleta join* si tienen los huevos suficientes.\n\n👥 *Jugadores en la sala:*\n#1 ${pushName} *(El psicópata que organizó esto)*\n\n_Mínimo 2 jugadores para iniciar. Máximo 6._`

            return await sock.sendMessage(from, { text: texto, mentions: todosLosMiembros })
        }

        if (subCmd === 'join') {
            if (!partida) return await sock.sendMessage(from, { text: '❌ No hay ninguna sala creada. Usa */ruleta crear*' }, { quoted: msg })
            if (partida.estado !== 'LOBBY') return await sock.sendMessage(from, { text: '❌ La partida ya empezó. Demasiado tarde, cobarde.' }, { quoted: msg })
            if (partida.jugadores.find(j => j.jid === sender)) return await sock.sendMessage(from, { text: '❌ Ya estás en la mesa, ansioso.' }, { quoted: msg })
            if (partida.jugadores.length >= 6) return await sock.sendMessage(from, { text: '❌ La mesa está llena (6/6). Muy lento.' }, { quoted: msg })

            partida.jugadores.push({ jid: sender, nombre: pushName, muerto: false })
            guardarPartidas(partidas)

            const lista = partida.jugadores.map((j, i) => `#${i + 1} ${j.nombre}`).join('\n')
            const texto = `*${pushName}* se sentó en la mesa. Ya se huele el miedo.\n\n👥 *Sala actual (${partida.jugadores.length}/6):*\n${lista}`
            return await sock.sendMessage(from, { text: texto })
        }

        if (subCmd === 'leave') {
            if (!partida) return await sock.sendMessage(from, { text: '❌ No hay ninguna sala activa.' }, { quoted: msg })
            if (partida.estado !== 'LOBBY') return await sock.sendMessage(from, { text: '❌ No puedes salir con la partida en curso. O vives o mueres.' }, { quoted: msg })

            const enSala = partida.jugadores.find(j => j.jid === sender)
            if (!enSala) return await sock.sendMessage(from, { text: '❌ No estás en ninguna sala.' }, { quoted: msg })

            if (partida.creador === sender) {
                cerrarPartida(from)
                return await sock.sendMessage(from, { text: `😂 *Este pendejo se asustó y cerró el lobby.*\n_*${pushName}* huyó como una gallina antes de que empezara el juego._` })
            }

            partida.jugadores = partida.jugadores.filter(j => j.jid !== sender)
            guardarPartidas(partidas)

            const lista = partida.jugadores.map((j, i) => `#${i + 1} ${j.nombre}`).join('\n')
            return await sock.sendMessage(from, { text: `*${pushName}* se cagó y salió de la sala. 🐔\n\n👥 *Sala actual (${partida.jugadores.length}/6):*\n${lista || '_Vacía_'}` })
        }

        if (subCmd === 'jugadores') {
            if (!partida) return await sock.sendMessage(from, { text: '❌ No hay ninguna sala activa.' }, { quoted: msg })
            const lista = partida.jugadores.map((j, i) => `#${i + 1} ${j.nombre}${j.muerto ? ' 💀' : ' ✅'}`).join('\n')
            const estado = partida.estado === 'LOBBY' ? '🟡 Lobby' : '🔴 En juego'
            return await sock.sendMessage(from, { text: `🎰 *SALA ACTUAL* — ${estado}\n\n${lista}\n\nRonda: ${partida.ronda}` }, { quoted: msg })
        }

        if (subCmd === 'start') {
            if (!partida || partida.estado !== 'LOBBY') return await sock.sendMessage(from, { text: '❌ No hay sala de espera activa.' }, { quoted: msg })
            if (partida.creador !== sender) return await sock.sendMessage(from, { text: '❌ Solo el creador puede iniciar la partida.' }, { quoted: msg })
            if (partida.jugadores.length < 2) return await sock.sendMessage(from, { text: '❌ Necesitas al menos 2 personas para jugar. Busca quien se suicide contigo.' }, { quoted: msg })

            clearTimeout(timers[from]?.lobby)
            partida.estado = 'PLAYING'
            guardarPartidas(partidas)

            const lista = partida.jugadores.map((j, i) => `#${i + 1} ${j.nombre}`).join('\n')
            await sock.sendMessage(from, { text: `🚪 *¡SE CIERRAN LAS PUERTAS!* Nadie sale vivo de aquí a menos que gane.\n\n📋 *LISTA DE CARNE DE CAÑÓN:*\n${lista}\n\n_Fíjense bien en sus números. No se aceptan llantos después._` })

            iniciarRonda(from, sock)
            return
        }

        if (!partida || partida.estado !== 'PLAYING') {
            if (['dispararme', 'disparar', 'kick'].includes(subCmd)) {
                return await sock.sendMessage(from, { text: '❌ No hay ninguna partida en curso.' }, { quoted: msg })
            }
            return
        }

        if (subCmd === 'kick') {
            const index = parseInt(args[1]) - 1
            if (isNaN(index) || !partida.jugadores[index] || partida.jugadores[index].muerto) {
                return await sock.sendMessage(from, { text: '❌ Especifica el número de un jugador vivo. Ej: */ruleta kick 2*' }, { quoted: msg })
            }
            if (!partida.jugadores.find(j => j.jid === sender && !j.muerto)) {
                return await sock.sendMessage(from, { text: '❌ Los muertos no votan.' }, { quoted: msg })
            }

            const target = partida.jugadores[index]
            if (target.jid === sender) {
                return await sock.sendMessage(from, { text: '❌ No puedes votarte a ti mismo, imbécil.' }, { quoted: msg })
            }

            if (!partida.votosKick[target.jid]) partida.votosKick[target.jid] = []
            if (partida.votosKick[target.jid].includes(sender)) {
                return await sock.sendMessage(from, { text: `❌ Ya votaste contra *${target.nombre}*. Espera a que los demás se sumen.` }, { quoted: msg })
            }

            partida.votosKick[target.jid].push(sender)
            const vivosCount = vivos(partida).length
            const mayoria = Math.floor(vivosCount / 2) + 1

            if (partida.votosKick[target.jid].length >= mayoria) {
                target.muerto = true
                delete partida.votosKick[target.jid]
                guardarPartidas(partidas)
                await sock.sendMessage(from, { text: `👢 *${target.nombre}* fue expulsado democráticamente de la mesa. El pueblo habló.` })
                evaluarMuerte(from, sock)
            } else {
                guardarPartidas(partidas)
                await sock.sendMessage(from, { text: `🗳️ Voto registrado contra *${target.nombre}* (${partida.votosKick[target.jid].length}/${mayoria} necesarios para expulsarlo)` })
            }
            return
        }

        const jugadorActual = partida.jugadores[partida.idxTurno]
        if (['dispararme', 'disparar'].includes(subCmd) && jugadorActual.jid !== sender) {
            return await sock.sendMessage(from, { text: `❌ ¡Espera tu turno! Ahora le toca a *${jugadorActual.nombre}*.` }, { quoted: msg })
        }

        if (subCmd === 'dispararme') {
            ejecutarDisparo(from, sock, true)
        } else if (subCmd === 'disparar') {
            const index = parseInt(args[1]) - 1
            if (isNaN(index) || !partida.jugadores[index]) {
                return await sock.sendMessage(from, { text: '❌ Especifica el número de tu víctima. Ej: */ruleta disparar 2*' }, { quoted: msg })
            }
            if (index === partida.idxTurno) {
                return await sock.sendMessage(from, { text: '❌ Si quieres suicidarte usa */ruleta dispararme*' }, { quoted: msg })
            }
            const victima = partida.jugadores[index]
            if (victima.muerto) {
                return await sock.sendMessage(from, { text: '❌ Deja de dispararle al cadáver, ya está muerto.' }, { quoted: msg })
            }
            ejecutarDisparo(from, sock, false, victima)
        } else {
            await sock.sendMessage(from, { 
                text: '❓ *Comandos de /ruleta:*\n\n`/ruleta crear` — Abrir sala\n`/ruleta join` — Unirse\n`/ruleta leave` — Salir del lobby\n`/ruleta start` — Iniciar partida\n`/ruleta jugadores` — Ver lista\n`/ruleta dispararme` — Dispararte\n`/ruleta disparar [#]` — Disparar a alguien\n`/ruleta kick [#]` — Votar expulsar\n`/ruleta rank` — Ver ranking'
            }, { quoted: msg })
        }
    }
}

function iniciarRonda(from, sock) {
    const partidas = cargarPartidas()
    const partida = partidas[from]
    if (!partida) return

    partida.tambor = generarTambor(partida.ronda)
    partida.idxTambor = 0
    partida.votosKick = {}
    guardarPartidas(partidas)

    const balas = partida.tambor.filter(x => x === 1).length
    const vacios = 6 - balas
    const jugadorActual = partida.jugadores[partida.idxTurno]

    const peligro = balas >= 4 ? '🔴 *¡PELIGRO EXTREMO!*' : balas >= 3 ? '🟠 *Alto riesgo*' : '🟡 *Suerte del diablo*'

    const texto = `💀 *RONDA #${partida.ronda}* — ${peligro}\n_El tambor gira... clack, clack, clack..._\n\n🔫 Revólver .357 Magnum\n🔴 Balas: ${balas} | ⭕ Vacíos: ${vacios}\n\nLe toca al desgraciado de *${jugadorActual.nombre}*.\n⏳ *60 segundos* para actuar.\n\n• */ruleta dispararme* — Apúntate (si sobrevives, turno extra)\n• */ruleta disparar [#]* — Apúntale a otro`

    sock.sendMessage(from, { text: texto })
    iniciarTimerTurno(from, sock)
}

function iniciarTimerTurno(from, sock) {
    const partidas = cargarPartidas()
    const partida = partidas[from]
    if (!partida) return

    if (!timers[from]) timers[from] = {}
    clearTimeout(timers[from].turno)

    timers[from].turno = setTimeout(async () => {
        const p = cargarPartidas()
        if (!p[from] || p[from].estado !== 'PLAYING') return
        const jugadorActual = p[from].jugadores[p[from].idxTurno]
        await sock.sendMessage(from, { text: `⏰ *¡TIEMPO AGOTADO!* *${jugadorActual.nombre}* se quedó paralizado del miedo.\nEl bot le pone el arma en la sien y jala el gatillo...` })
        ejecutarDisparo(from, sock, true, null, true)
    }, 60 * 1000)
}

async function ejecutarDisparo(from, sock, esAutodisparo, victima = null, forzadoPorBot = false) {
    const partidas = cargarPartidas()
    const partida = partidas[from]
    if (!partida) return

    clearTimeout(timers[from]?.turno)

    const bala = partida.tambor[partida.idxTambor]
    const jActual = partida.jugadores[partida.idxTurno]

    partida.idxTambor++
    if (partida.idxTambor >= 6) {
        partida.tambor = generarTambor(partida.ronda)
        partida.idxTambor = 0
        await sock.sendMessage(from, { text: `🔄 _El tambor se vació y fue recargado automáticamente..._` })
    }

    if (esAutodisparo) {
        if (bala === 0) {
            guardarPartidas(partidas)
            await sock.sendMessage(from, { text: `*${jActual.nombre}* se pone el cañón en la sien, cierra los ojos y aprieta el gatillo...\n\n_...* CLICK *..._\n\n💨 ¡Vacío! Se salvó por centímetros. Como premio por los huevos de acero, *TIENE UN TURNO EXTRA*. ¿A quién quieres joder ahora?` })
            iniciarTimerTurno(from, sock)
        } else {
            jActual.muerto = true
            registrarMuerte(jActual.jid, jActual.nombre)
            guardarPartidas(partidas)
            await sock.sendMessage(from, { text: `*${jActual.nombre}* se apunta con mano temblorosa y aprieta el gatillo...\n\n_...* ¡BAM! *..._ 🩸💀\n\n_Sus sesos acaban de decorar el chat. Un imbécil menos en la mesa._\n*${jActual.nombre}* queda eliminado.` })
            evaluarMuerte(from, sock)
        }
    } else {
        if (bala === 0) {
            guardarPartidas(partidas)
            await sock.sendMessage(from, { text: `*${jActual.nombre}* le apunta directo a *${victima.nombre}* con una sonrisa enferma y jala el gatillo...\n\n_...* CLICK *..._\n\nNada. El arma está seca. *${victima.nombre}* se ríe en tu cara. Se pasa el arma...` })
            avanzarTurnoYNotificar(from, sock)
        } else {
            victima.muerto = true
            registrarMuerte(victima.jid, victima.nombre)
            guardarPartidas(partidas)
            await sock.sendMessage(from, { text: `*${jActual.nombre}* mira fijamente a *${victima.nombre}* y jala el gatillo sin dudar...\n\n_...* ¡BAM! *..._ 💥💀\n\nDisparo limpio. *${victima.nombre}* se va directo al infierno.\n_Que alguien limpie este chiquero._` })
            evaluarMuerte(from, sock)
        }
    }
}

function avanzarTurno(partida) {
    let intentos = 0
    do {
        partida.idxTurno = (partida.idxTurno + 1) % partida.jugadores.length
        intentos++
    } while (partida.jugadores[partida.idxTurno].muerto && intentos < partida.jugadores.length)
}

function avanzarTurnoYNotificar(from, sock) {
    const partidas = cargarPartidas()
    const partida = partidas[from]
    if (!partida) return

    avanzarTurno(partida)
    const jActual = partida.jugadores[partida.idxTurno]
    guardarPartidas(partidas)

    sock.sendMessage(from, { text: `🎯 Turno de *${jActual.nombre}*.\n⏳ 60 segundos. ¿Disparas a otro (*/ruleta disparar [#]*) o te juegas la vida (*/ruleta dispararme*)?` })
    iniciarTimerTurno(from, sock)
}

function evaluarMuerte(from, sock) {
    const partidas = cargarPartidas()
    const partida = partidas[from]
    if (!partida) return

    const vivosList = vivos(partida)

    if (vivosList.length === 1) {
        const ganador = vivosList[0]
        registrarVictoria(ganador.jid, ganador.nombre)
        limpiarTimers(from)
        delete partidas[from]
        guardarPartidas(partidas)
        sock.sendMessage(from, { text: `👑 *¡TENEMOS UN SOBREVIVIENTE!* 👑\n\nTodos están muertos menos *${ganador.nombre}*.\nEstás cubierto de sangre, pero sigues respirando. Eres el psicópata de la semana.\n\n🏆 Victoria registrada en */ruleta rank*. ¡Vayan a terapia!` })
    } else if (vivosList.length === 0) {
        limpiarTimers(from)
        delete partidas[from]
        guardarPartidas(partidas)
        sock.sendMessage(from, { text: `💀 *TODOS MUERTOS.* No hay ganador. Se supone que esto era una competencia, no un suicidio colectivo.` })
    } else {
        partida.ronda++
        if (partida.jugadores[partida.idxTurno]?.muerto) {
            avanzarTurno(partida)
        }
        guardarPartidas(partidas)

        const quedanStr = vivosList.map((j, i) => `#${i + 1} ${j.nombre}`).join(', ')
        sock.sendMessage(from, { text: `💀 Quedan *${vivosList.length}* jugadores vivos: ${quedanStr}\n_Preparando la siguiente ronda..._` })

        setTimeout(() => {
            const p = cargarPartidas()
            if (p[from]) iniciarRonda(from, sock)
        }, 4000)
    }
}
