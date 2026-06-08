const fs = require('fs')
const path = require('path')

const partidasActivas = {}

const rankPath = path.join(__dirname, '..', 'rank.json')

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

module.exports = {
    nombre: 'ruleta',
    descripcion: 'Mortal minijuego de Ruleta Rusa. Uso: /ruleta [crear|join|start|kick|dispararme|disparar|rank]',
    
    ejecutar: async (ctx) => {
        const { sock, msg, from, args, sender } = ctx

        if (!from.endsWith('@g.us')) {
            return await sock.sendMessage(from, { text: '❌ Este juego enfermo solo se puede jugar en grupos.' }, { quoted: msg })
        }

        const subCmd = args[0] ? args[0].toLowerCase() : ''
        const pushName = msg.pushName || 'Desconocido'

        if (subCmd === 'rank') {
            const db = cargarRank()
            const top = Object.values(db.participantes)
                .sort((a, b) => b.victorias - a.victorias)
                .slice(0, 10)
            
            if (top.length === 0) return await sock.sendMessage(from, { text: 'Nadie ha sobrevivido lo suficiente para estar en el ranking.' })

            let texto = '🏆 **TOP SOBREVIVIENTES - RULETA RUSA** 🏆\n\n'
            top.forEach((p, i) => {
                texto += `#${i + 1} *${p.nombre}* - 👑 ${p.victorias} victorias | 💀 ${p.muertes} muertes\n`
            })
            return await sock.sendMessage(from, { text: texto }, { quoted: msg })
        }

        let partida = partidasActivas[from]

        if (subCmd === 'crear') {
            if (partida) return await sock.sendMessage(from, { text: '❌ Ya hay una partida o sala de espera activa en este grupo.' }, { quoted: msg })

            partida = {
                creador: sender,
                estado: 'LOBBY',
                ronda: 1,
                jugadores: [{ jid: sender, nombre: pushName, muerto: false }],
                votosKick: {},
                tambor: [],
                idxTambor: 0,
                idxTurno: 0,
                timerLobby: null,
                timerTurno: null
            }
            partidasActivas[from] = partida

            partida.timerLobby = setTimeout(() => {
                if (partidasActivas[from] && partidasActivas[from].estado === 'LOBBY') {
                    delete partidasActivas[from]
                }
            }, 5 * 60 * 1000)

            const groupMetadata = await sock.groupMetadata(from)
            const todosLosMiembros = groupMetadata.participants.map(p => p.id)

            const texto = `⚠️ **¡ATENCIÓN, ESCORIA DEL GRUPO!** ⚠️\nUn enfermo llamado **${pushName}** acaba de poner un revólver en la mesa.\n\nTienen 5 minutos para usar */ruleta join* si tienen los huevos suficientes.\n\n**Jugadores actuales:**\n#1 ${pushName} *(El psicópata que organizó esto)*`

            return await sock.sendMessage(from, { text: texto, mentions: todosLosMiembros })
        }

        if (subCmd === 'join') {
            if (!partida) return await sock.sendMessage(from, { text: '❌ No hay ninguna partida creada. Usa */ruleta crear*' }, { quoted: msg })
            if (partida.estado !== 'LOBBY') return await sock.sendMessage(from, { text: '❌ La partida ya empezó. Demasiado tarde.' }, { quoted: msg })
            if (partida.jugadores.find(j => j.jid === sender)) return await sock.sendMessage(from, { text: '❌ Ya estás en la mesa, ansioso.' }, { quoted: msg })
            if (partida.jugadores.length >= 6) return await sock.sendMessage(from, { text: '❌ La mesa está llena (6/6).' }, { quoted: msg })

            partida.jugadores.push({ jid: sender, nombre: pushName, muerto: false })

            clearTimeout(partida.timerLobby)
            partida.timerLobby = setTimeout(() => {
                if (partidasActivas[from] && partidasActivas[from].estado === 'LOBBY') {
                    sock.sendMessage(from, { text: '⏳ La sala se cerró por inactividad del creador.' })
                    delete partidasActivas[from]
                }
            }, 2 * 60 * 1000)

            const texto = `**${pushName}** se sentó en la mesa. Ya huele a miedo en el grupo.\n*(Total: ${partida.jugadores.length}/6 jugadores)*`
            return await sock.sendMessage(from, { text: texto })
        }

        if (subCmd === 'start') {
            if (!partida || partida.estado !== 'LOBBY') return await sock.sendMessage(from, { text: '❌ No hay sala de espera.' }, { quoted: msg })
            if (partida.creador !== sender) return await sock.sendMessage(from, { text: '❌ Solo el creador de la sala puede iniciarla.' }, { quoted: msg })
            if (partida.jugadores.length < 2) return await sock.sendMessage(from, { text: '❌ Necesitas al menos 2 personas para jugar. Cobardes.' }, { quoted: msg })

            clearTimeout(partida.timerLobby)
            partida.estado = 'PLAYING'
            
            let lista = partida.jugadores.map((j, i) => `#${i + 1} ${j.nombre}`).join('\n')
            
            await sock.sendMessage(from, { text: `🚪 **¡SE CIERRAN LAS PUERTAS!** Nadie sale vivo de aquí a menos que gane.\nLas reglas son simples: lloren, recen, mueran.\n\n📋 **LISTA DE CARNE DE CAÑÓN:**\n${lista}\n\n*(Fíjense bien en sus números, no aceptaré lloros después).*` })

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
                return await sock.sendMessage(from, { text: '❌ Especifica el número de un jugador vivo (ej: /ruleta kick 2)' }, { quoted: msg })
            }
            if (!partida.jugadores.find(j => j.jid === sender && !j.muerto)) {
                return await sock.sendMessage(from, { text: '❌ Los muertos no votan.' }, { quoted: msg })
            }

            const target = partida.jugadores[index]
            if (!partida.votosKick[target.jid]) partida.votosKick[target.jid] = new Set()
            partida.votosKick[target.jid].add(sender)

            const vivosCount = vivos(partida).length
            const mayoria = Math.floor(vivosCount / 2) + 1

            if (partida.votosKick[target.jid].size >= mayoria) {
                target.muerto = true
                await sock.sendMessage(from, { text: `👢 **${target.nombre}** ha sido expulsado de la mesa por decisión democrática.` })
                evaluarMuerte(from, sock)
            } else {
                await sock.sendMessage(from, { text: `🗳️ Voto registrado contra ${target.nombre} (${partida.votosKick[target.jid].size}/${mayoria} necesarios)` })
            }
            return
        }

        const jugadorActual = partida.jugadores[partida.idxTurno]
        if (['dispararme', 'disparar'].includes(subCmd) && jugadorActual.jid !== sender) {
            return await sock.sendMessage(from, { text: `❌ ¡Espera tu turno! Le toca a ${jugadorActual.nombre}.` }, { quoted: msg })
        }

        if (subCmd === 'dispararme') {
            ejecutarDisparo(from, sock, true)
        }

        if (subCmd === 'disparar') {
            const index = parseInt(args[1]) - 1
            if (isNaN(index) || !partida.jugadores[index]) {
                return await sock.sendMessage(from, { text: '❌ Especifica el número de tu víctima (ej: /ruleta disparar 2)' }, { quoted: msg })
            }
            if (index === partida.idxTurno) {
                return await sock.sendMessage(from, { text: '❌ Si quieres suicidarte usa */ruleta dispararme*' }, { quoted: msg })
            }
            const victima = partida.jugadores[index]
            if (victima.muerto) {
                return await sock.sendMessage(from, { text: '❌ Deja de dispararle al cadáver, ya está muerto.' }, { quoted: msg })
            }

            ejecutarDisparo(from, sock, false, victima)
        }
    }
}

function iniciarRonda(from, sock) {
    const partida = partidasActivas[from]
    partida.tambor = generarTambor(partida.ronda)
    partida.idxTambor = 0
    partida.votosKick = {} 

    const balas = partida.tambor.filter(x => x === 1).length
    const vacios = 6 - balas
    const jugadorActual = partida.jugadores[partida.idxTurno]

    let texto = `💀 **RONDA #${partida.ronda}** 💀\nEl bot abre el tambor, mete las balas y lo hace girar... *Clack, clack, clack*\n\n🔫 Pistola: Revólver .357 Magnum\n🔴 Balas: ${balas}\n⭕ Cartuchos vacíos: ${vacios}\n\nEs el turno del desgraciado de **${jugadorActual.nombre}**.\n⏳ Tienes **60 segundos**. Usa */ruleta dispararme* (premio de turno extra si sobrevives) o */ruleta disparar [#]*. Si te acobardas, el bot disparará por ti.`

    sock.sendMessage(from, { text: texto })
    iniciarTimerTurno(from, sock)
}

function iniciarTimerTurno(from, sock) {
    const partida = partidasActivas[from]
    clearTimeout(partida.timerTurno)
    
    partida.timerTurno = setTimeout(async () => {
        if (!partidasActivas[from] || partidasActivas[from].estado !== 'PLAYING') return
        
        const jugadorActual = partida.jugadores[partida.idxTurno]
        await sock.sendMessage(from, { text: `⏰ ¡Tiempo agotado! **${jugadorActual.nombre}** se orinó en los pantalones y se quedó congelado del miedo.\nComo en este juego no aceptamos cobardes, el bot le arrebata el arma, se la pone en la sien y jala el gatillo por él...` })
        
        ejecutarDisparo(from, sock, true, null, true)
    }, 60 * 1000)
}

async function ejecutarDisparo(from, sock, esAutodisparo, victima = null, forzadoPorBot = false) {
    const partida = partidasActivas[from]
    clearTimeout(partida.timerTurno)

    const bala = partida.tambor[partida.idxTambor]
    const jActual = partida.jugadores[partida.idxTurno]

    partida.idxTambor++
    if (partida.idxTambor >= 6) {
        partida.tambor = generarTambor(partida.ronda)
        partida.idxTambor = 0
    }

    if (esAutodisparo) {
        if (bala === 0) {
            await sock.sendMessage(from, { text: `**${jActual.nombre}** se pone el cañón caliente en la garganta, cierra los ojos y aprieta el gatillo...\n... ¡*CLICK*! ...\n💨 ¡Se salvó! Solo salió aire. Como premio por tus huevos de acero, **TIENES UN TURNO EXTRA**. ¿A quién quieres joder ahora?` })
            iniciarTimerTurno(from, sock) 
        } else {
            jActual.muerto = true
            registrarMuerte(jActual.jid, jActual.nombre)
            await sock.sendMessage(from, { text: `**${jActual.nombre}** se apunta a la cabeza sudando frío y aprieta el gatillo...\n... ¡**BAM**! 🩸🧠 ...\nSus sesos acaban de decorar la pantalla de todos. Un idiota menos. ¡QUE ALGUIEN LIMPIE ESTE DESASTRE! **${jActual.nombre}** queda eliminado.` })
            evaluarMuerte(from, sock)
        }
    } else {
        if (bala === 0) {
            await sock.sendMessage(from, { text: `**${jActual.nombre}** le apunta directo al pecho a **${victima.nombre}** con una sonrisa enferma y jala el gatillo...\n... ¡*CLICK*! ...\nNada. El arma está seca. **${victima.nombre}** se ríe en tu puta cara. Pasamos el arma...` })
            avanzarTurnoYNotificar(from, sock)
        } else {
            victima.muerto = true
            registrarMuerte(victima.jid, victima.nombre)
            await sock.sendMessage(from, { text: `**${jActual.nombre}** mira fijamente a **${victima.nombre}** y aprieta el gatillo sin dudar...\n... ¡**BAM**! 💥💀 ...\nLe voló la cabeza de un tiro limpio. **${victima.nombre}** se va directo al infierno, no sirves ni para abono.` })
            evaluarMuerte(from, sock)
        }
    }
}

function avanzarTurno(partida) {
    do {
        partida.idxTurno = (partida.idxTurno + 1) % partida.jugadores.length
    } while (partida.jugadores[partida.idxTurno].muerto)
}

function avanzarTurnoYNotificar(from, sock) {
    const partida = partidasActivas[from]
    avanzarTurno(partida)
    
    const jActual = partida.jugadores[partida.idxTurno]
    sock.sendMessage(from, { text: `Es el turno de **${jActual.nombre}**.\n⏳ Tienes 60 segundos. ¿Disparas a otro o juegas a la suerte (/ruleta dispararme)?` })
    iniciarTimerTurno(from, sock)
}

function evaluarMuerte(from, sock) {
    const partida = partidasActivas[from]
    const vivosList = vivos(partida)

    if (vivosList.length === 1) {
        const ganador = vivosList[0]
        registrarVictoria(ganador.jid, ganador.nombre)
        sock.sendMessage(from, { text: `👑 **¡TENEMOS UN SOBREVIVIENTE!** 👑\nTodos están muertos menos **${ganador.nombre}**. Estás cubierto de sangre, pero sigues respirando. Eres oficialmente el psicópata de la semana.\nTu victoria ha sido guardada en el /ruleta rank. ¡Vayan a terapia!` })
        
        clearTimeout(partida.timerTurno)
        delete partidasActivas[from]
    } else {
        partida.ronda++
        sock.sendMessage(from, { text: `Quedan ${vivosList.length} jugadores vivos. ¡Avanzamos a la siguiente ronda!` })
        
        if (partida.jugadores[partida.idxTurno].muerto) {
            avanzarTurno(partida)
        }

        setTimeout(() => {
            if (partidasActivas[from]) iniciarRonda(from, sock)
        }, 3000)
    }
}
