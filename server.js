const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
    maxHttpBufferSize: 5e6  // 5 MB (para imágenes/audios en base64)
});

// Servir archivos estáticos (sin cache para desarrollo / Railway)
const staticOptions = {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
};
app.use(express.static(__dirname, staticOptions));
app.use('/public', express.static(__dirname + '/public', staticOptions));

// Redirigir la raíz a login.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/login.html');
});


// ─── Mapeo Socket.ID ↔ UID de Firebase ─────────────────────────────────────────
// Permite enrutar mensajes privados y notificaciones a usuarios específicos
const uidToSocketId = {};   // uid → socket.id
const socketIdToUid = {};   // socket.id → uid

// ─── Emitir lista de miembros de una sala ──────────────────────────────────────
function emitirMiembros(sala) {
    const seen = new Set();
    const sockets = [];
    io.sockets.sockets.forEach(s => {
        if (s.sala === sala && s.username) {
            // Deduplicar por uid (o por nombre si no hay uid)
            const key = s.uid || s.username;
            if (!seen.has(key)) {
                seen.add(key);
                sockets.push({
                    username: s.username,
                    uid: s.uid || ''
                });
            }
        }
    });
    io.to(sala).emit('miembros-sala', sockets);
}

io.on('connection', (socket) => {
    console.log(`Conectado: ${socket.id}`);

    // ── Registro de usuario ─────────────────────────────────────────────────────
    socket.on('nuevoUsuario', (nombre, uid) => {
        socket.username = nombre.trim().slice(0, 30);
        socket.uid = uid || '';
        socket.sala = 'general';
        socket.join('general');

        // Mapear UID ↔ Socket.ID para DMs
        if (socket.uid) {
            uidToSocketId[socket.uid] = socket.id;
            socketIdToUid[socket.id] = socket.uid;
        }

        io.to('general').emit('mensaje-sistema', `${socket.username} se unió al chat`);
        emitirMiembros('general');
    });

    // ── Cambio de sala ──────────────────────────────────────────────────────────
    socket.on('unirse-sala', (sala) => {
        const salaAnterior = socket.sala;
        if (salaAnterior) {
            socket.leave(salaAnterior);
            emitirMiembros(salaAnterior);
        }
        socket.sala = sala;
        socket.join(sala);
        io.to(sala).emit('mensaje-sistema', `${socket.username} entró a #${sala}`);
        emitirMiembros(sala);
    });

    // ── Mensaje de texto ────────────────────────────────────────────────────────
    socket.on('mensaje-chat', (msg) => {
        if (!socket.username || !socket.sala) return;
        io.to(socket.sala).emit('mensaje-chat', {
            usuario: socket.username,
            uid: socket.uid || '',
            mensaje: msg.toString().slice(0, 1000),
            hora: hora(),
            ts: Date.now()
        });
    });

    // ── Mensaje con imagen (base64) ─────────────────────────────────────────────
    socket.on('mensaje-imagen', (data) => {
        if (!socket.username || !socket.sala) return;
        io.to(socket.sala).emit('mensaje-imagen', {
            usuario: socket.username,
            uid: socket.uid || '',
            base64:  data.base64,
            caption: (data.caption || '').slice(0, 200),
            hora:    hora(),
            ts: Date.now()
        });
    });

    // ── Mensaje de audio (base64) ───────────────────────────────────────────────
    socket.on('mensaje-audio', (data) => {
        if (!socket.username || !socket.sala) return;
        io.to(socket.sala).emit('mensaje-audio', {
            usuario: socket.username,
            uid: socket.uid || '',
            base64:  data.base64,
            hora:    hora(),
            ts: Date.now()
        });
    });

    // ── DM: Mensaje privado ─────────────────────────────────────────────────────
    // data: { paraUid, mensaje, tipo, base64, caption }
    socket.on('dm-enviar', (data) => {
        if (!socket.username || !socket.uid) return;
        const targetSocketId = uidToSocketId[data.paraUid];
        if (targetSocketId) {
            io.to(targetSocketId).emit('dm-recibir', {
                de: socket.username,
                deUid: socket.uid,
                mensaje: (data.mensaje || '').toString().slice(0, 1000),
                tipo: data.tipo || 'texto',
                base64: data.base64 || '',
                caption: (data.caption || '').slice(0, 200),
                hora: hora(),
                ts: Date.now()
            });
        }
        // También enviar al remitente para que se vea en su UI
        socket.emit('dm-recibir-propio', {
            de: socket.username,
            deUid: socket.uid,
            paraUid: data.paraUid,
            mensaje: (data.mensaje || '').toString().slice(0, 1000),
            tipo: data.tipo || 'texto',
            base64: data.base64 || '',
            caption: (data.caption || '').slice(0, 200),
            hora: hora(),
            ts: Date.now()
        });
    });

    // ── Solicitud de amistad ────────────────────────────────────────────────────
    // data: { paraUid, nombre, email }
    socket.on('solicitud-amistad', (data) => {
        if (!socket.username || !socket.uid) return;
        const targetSocketId = uidToSocketId[data.paraUid];
        if (targetSocketId) {
            io.to(targetSocketId).emit('solicitud-recibida', {
                deUid: socket.uid,
                nombre: socket.username,
                email: data.email || '',
                ts: Date.now()
            });
        }
    });

    // ── Respuesta a solicitud de amistad ────────────────────────────────────────
    // data: { paraUid, aceptada, nombre }
    socket.on('respuesta-amistad', (data) => {
        if (!socket.username || !socket.uid) return;
        const targetSocketId = uidToSocketId[data.paraUid];
        if (targetSocketId) {
            io.to(targetSocketId).emit('amistad-actualizada', {
                deUid: socket.uid,
                aceptada: data.aceptada,
                nombre: socket.username
            });
        }
    });

    // ── Desconexión ─────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        if (socket.username) {
            io.emit('mensaje-sistema', `${socket.username} salió del chat`);
            if (socket.sala) emitirMiembros(socket.sala);
        }
        // Limpiar mapeo UID ↔ Socket.ID
        if (socket.uid) {
            delete uidToSocketId[socket.uid];
        }
        delete socketIdToUid[socket.id];
    });
});

function hora() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Superchat corriendo en puerto ${PORT} (Railway-ready)`));
