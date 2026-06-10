const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
    maxHttpBufferSize: 5e6  // 5 MB (para imágenes/audios en base64)
});

// Servir archivos estáticos desde la raíz (index.html, login.html)
// y también desde la carpeta public/ (css/, js/)
app.use(express.static(__dirname));
app.use('/public', express.static('public'));

// Redirigir la raíz a login.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/login.html');
});


// Emitir lista de miembros de una sala
function emitirMiembros(sala) {
    const sockets = [];
    io.sockets.sockets.forEach(s => {
        if (s.sala === sala && s.username) sockets.push(s.username);
    });
    io.to(sala).emit('miembros-sala', sockets);
}

io.on('connection', (socket) => {
    console.log(`Conectado: ${socket.id}`);

    // Registro de usuario
    socket.on('nuevoUsuario', (nombre) => {
        socket.username = nombre.trim().slice(0, 30);
        socket.sala = 'general';
        socket.join('general');
        io.to('general').emit('mensaje-sistema', `${socket.username} se unió al chat`);
        emitirMiembros('general');
    });

    // Cambio de sala
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

    // Mensaje de texto
    socket.on('mensaje-chat', (msg) => {
        if (!socket.username || !socket.sala) return;
        io.to(socket.sala).emit('mensaje-chat', {
            usuario: socket.username,
            mensaje: msg.toString().slice(0, 1000),
            hora: hora()
        });
    });

    // Mensaje con imagen (base64)
    socket.on('mensaje-imagen', (data) => {
        if (!socket.username || !socket.sala) return;
        io.to(socket.sala).emit('mensaje-imagen', {
            usuario: socket.username,
            base64:  data.base64,
            caption: (data.caption || '').slice(0, 200),
            hora:    hora()
        });
    });

    // Mensaje de audio (base64)
    socket.on('mensaje-audio', (data) => {
        if (!socket.username || !socket.sala) return;
        io.to(socket.sala).emit('mensaje-audio', {
            usuario: socket.username,
            base64:  data.base64,
            hora:    hora()
        });
    });

    // Desconexión
    socket.on('disconnect', () => {
        if (socket.username) {
            io.emit('mensaje-sistema', `${socket.username} salió del chat`);
            if (socket.sala) emitirMiembros(socket.sala);
        }
    });
});

function hora() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
