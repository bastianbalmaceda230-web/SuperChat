// ═══════════════════════════════════════════════════════════════════════════════
//  chat.js  —  Socket.IO + Firebase (Superchat)
//  Funciona con o sin servidor Socket.IO (GitHub Pages = solo Firestore)
//  • DMs: mensajes privados entre usuarios
//  • Amigos: solicitudes, aceptar/rechazar, lista
// ═══════════════════════════════════════════════════════════════════════════════

// ── Detectar si Socket.IO está disponible ──────────────────────────────────────
const SOCKET_AVAILABLE = (typeof io !== 'undefined');
let socket = null;

if (SOCKET_AVAILABLE) {
  try {
    socket = io();
    console.log('[Chat] Socket.IO conectado');
  } catch (e) {
    console.warn('[Chat] Socket.IO no disponible, usando solo Firestore');
  }
} else {
  console.log('[Chat] Modo solo Firestore (GitHub Pages)');
}

const form = document.getElementById('form-container');
const input = document.getElementById('message-input');
const chatContainer = document.getElementById('chat-container');
const themeBtn = document.getElementById('theme-btn');
const iconMoon = document.getElementById('icon-moon');
const iconSun = document.getElementById('icon-sun');
const membersBtn = document.getElementById('members-btn');
const membersPanel = document.getElementById('members-panel');
const membersClose = document.getElementById('members-close');
const membersList = document.getElementById('members-list');
const membersCount = document.getElementById('members-count');
const attachBtn = document.getElementById('attach-btn');
const imageInput = document.getElementById('image-input');
const audioBtn = document.getElementById('audio-btn');
const iconMic = document.getElementById('icon-mic');
const iconStop = document.getElementById('icon-stop');
const recIndicator = document.getElementById('recording-indicator');
const recTimer = document.getElementById('rec-timer');
const recCancel = document.getElementById('rec-cancel');
const imgPreviewCtn = document.getElementById('image-preview-container');
const imgPreviewImg = document.getElementById('image-preview-img');
const imgPreviewRem = document.getElementById('image-preview-remove');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');
const logoutBtn = document.getElementById('logout-btn');
const notifBadge = document.getElementById('notif-badge');
const notifBtn = document.getElementById('notif-btn');
const notifPanel = document.getElementById('notif-panel');
const notifClose = document.getElementById('notif-close');
const notifList = document.getElementById('notif-list');
const friendsBtn = document.getElementById('friends-btn');
const friendsPanel = document.getElementById('friends-panel');
const friendsClose = document.getElementById('friends-close');
const friendsList = document.getElementById('friends-list');
const dmPanel = document.getElementById('dm-panel');
const dmClose = document.getElementById('dm-close');
const dmTitle = document.getElementById('dm-title');
const dmChatContainer = document.getElementById('dm-chat-container');
const dmForm = document.getElementById('dm-form-container');
const dmInput = document.getElementById('dm-message-input');

let miNombre = '';
let miUid = '';
let pendingImageBase64 = null;
let mediaRecorder = null;
let audioChunks = [];
let recInterval = null;
let recSeconds = 0;
let membersOpen = false;
let notifOpen = false;
let friendsOpen = false;
let dmOpen = false;
let currentSala = 'general';
let currentDmTarget = null;       // { uid, nombre }
let solicitudesPendientes = [];
let misAmigos = [];

// Exponer para firebase-chat.js (bridge)
window._superchatSocketId = socket ? (socket.id || '') : '';
if (socket) {
  socket.on('connect', () => { window._superchatSocketId = socket.id; });
}

// ─── TEMA ─────────────────────────────────────────────────────────────────────
function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    iconMoon.style.display = dark ? 'none' : '';
    iconSun.style.display = dark ? '' : 'none';
    localStorage.setItem('sc_theme', dark ? 'dark' : 'light');
}
(function initTheme() {
    const saved = localStorage.getItem('sc_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved ? saved === 'dark' : prefersDark);
})();
themeBtn.addEventListener('click', () =>
    applyTheme(document.documentElement.getAttribute('data-theme') !== 'dark')
);

// ─── PANEL MIEMBROS ───────────────────────────────────────────────────────────
function toggleMembers(open) {
    membersOpen = open;
    membersPanel.classList.toggle('open', open);
    // Cerrar otros paneles
    if (open) { toggleNotif(false); toggleFriends(false); toggleDm(false); }
}
membersBtn.addEventListener('click', () => toggleMembers(!membersOpen));
membersClose.addEventListener('click', () => toggleMembers(false));

// ─── PANEL NOTIFICACIONES (SOLICITUDES) ────────────────────────────────────────
function toggleNotif(open) {
    notifOpen = open;
    notifPanel.classList.toggle('open', open);
    if (open) { toggleMembers(false); toggleFriends(false); toggleDm(false); }
    if (open && window._fbOnSolicitudesReady) {
      // Re-renderizar notificaciones
      renderNotificaciones(solicitudesPendientes);
    }
}
if (notifBtn) notifBtn.addEventListener('click', () => toggleNotif(!notifOpen));
if (notifClose) notifClose.addEventListener('click', () => toggleNotif(false));

function renderNotificaciones(pendientes) {
    solicitudesPendientes = pendientes;
    if (!notifList) return;
    notifList.innerHTML = '';
    // Actualizar badge
    if (notifBadge) {
      notifBadge.textContent = pendientes.length;
      notifBadge.style.display = pendientes.length > 0 ? '' : 'none';
    }
    if (pendientes.length === 0) {
      notifList.innerHTML = '<li class="notif-empty">No hay solicitudes pendientes</li>';
      return;
    }
    pendientes.forEach(sol => {
      const li = document.createElement('li');
      li.classList.add('notif-item');
      const hue = [...sol.nombre].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
      li.innerHTML = `
        <span class="notif-avatar" style="background:hsl(${hue},65%,50%)">${sol.nombre.charAt(0).toUpperCase()}</span>
        <span class="notif-info">
          <strong>${sol.nombre}</strong>
          <span>quiere ser tu amigo</span>
        </span>
        <span class="notif-actions">
          <button class="notif-accept" title="Aceptar" data-uid="${sol.deUid}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button class="notif-reject" title="Rechazar" data-uid="${sol.deUid}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </span>`;
      li.querySelector('.notif-accept').addEventListener('click', () => {
        if (window._fbResponderSolicitud) window._fbResponderSolicitud(sol.deUid, true);
        showToast('Amistad', `Aceptaste a ${sol.nombre}`, 'sistema');
      });
      li.querySelector('.notif-reject').addEventListener('click', () => {
        if (window._fbResponderSolicitud) window._fbResponderSolicitud(sol.deUid, false);
        showToast('Amistad', `Rechazaste a ${sol.nombre}`, 'sistema');
      });
      notifList.appendChild(li);
    });
}

// Callback desde firebase-chat.js cuando hay cambios en solicitudes
window._fbOnSolicitudes = renderNotificaciones;
window._fbOnSolicitudesReady = true;

// ─── PANEL AMIGOS ─────────────────────────────────────────────────────────────
function toggleFriends(open) {
    friendsOpen = open;
    friendsPanel.classList.toggle('open', open);
    if (open) { toggleMembers(false); toggleNotif(false); toggleDm(false); }
    if (open && window._fbOnAmigosReady) {
      renderAmigos(misAmigos);
    }
}
if (friendsBtn) friendsBtn.addEventListener('click', () => toggleFriends(!friendsOpen));
if (friendsClose) friendsClose.addEventListener('click', () => toggleFriends(false));

function renderAmigos(amigos) {
    misAmigos = amigos;
    if (!friendsList) return;
    friendsList.innerHTML = '';
    if (amigos.length === 0) {
      friendsList.innerHTML = '<li class="notif-empty">No tienes amigos aún</li>';
      return;
    }
    amigos.forEach(amigo => {
      const li = document.createElement('li');
      li.classList.add('friend-item');
      const nombre = amigo.nombre || amigo.uid?.slice(0, 8) || 'Amigo';
      const hue = [...(amigo.uid || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
      li.innerHTML = `
        <span class="friend-avatar" style="background:hsl(${hue},65%,50%)">${nombre.charAt(0).toUpperCase()}</span>
        <span class="friend-name">${nombre}</span>
        <span class="friend-actions">
          <button class="friend-dm" title="Enviar mensaje" data-uid="${amigo.uid}" data-name="${nombre}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button class="friend-remove" title="Eliminar amigo" data-uid="${amigo.uid}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </span>`;
      li.querySelector('.friend-dm').addEventListener('click', () => {
        abrirDM({ uid: amigo.uid, username: nombre });
        toggleFriends(false);
      });
      li.querySelector('.friend-remove').addEventListener('click', () => {
        if (window._fbEliminarAmigo) {
          window._fbEliminarAmigo(amigo.uid);
          showToast('Amistad', `Eliminaste a ${nombre}`, 'sistema');
        }
      });
      friendsList.appendChild(li);
    });
}

window._fbOnAmigos = renderAmigos;
window._fbOnAmigosReady = true;

// ─── PANEL DM ─────────────────────────────────────────────────────────────────
function toggleDm(open) {
    dmOpen = open;
    dmPanel.classList.toggle('open', open);
    if (open) { toggleMembers(false); toggleNotif(false); toggleFriends(false); }
    if (!open) {
      // Cancelar suscripción Firestore DM
      if (window._fbCancelarSuscripcionDM) window._fbCancelarSuscripcionDM();
      currentDmTarget = null;
      dmChatContainer.innerHTML = '';
    }
}
if (dmClose) dmClose.addEventListener('click', () => toggleDm(false));

function abrirDM(target) {
    currentDmTarget = target;
    dmTitle.textContent = `Chat con ${target.username}`;
    dmChatContainer.innerHTML = '';
    toggleDm(true);

    // Suscribirse a mensajes DM via Firestore
    if (window._fbSuscribirDM) {
      window._fbSuscribirDM(target.uid, (msg) => {
        // Evitar duplicados con Socket.IO (se renderizan desde el listener de Socket.IO)
        if (SOCKET_AVAILABLE && msg._socketId && msg._socketId === window._superchatSocketId) return;
        renderDmMsg(msg);
      });
    }
}

function renderDmMsg(d) {
    const esMio = d.deUid === miUid;

    const div = document.createElement('div');
    div.classList.add('mensaje', 'dm-msg');
    if (esMio) div.classList.add('propio');

    if (!esMio) {
      const autor = document.createElement('span');
      autor.classList.add('autor');
      autor.textContent = d.de;
      div.appendChild(autor);
    }

    if (d.tipo === 'imagen') {
      const img = document.createElement('img');
      img.src = d.base64 || d.mensaje;
      img.classList.add('msg-image');
      img.addEventListener('click', () => openLightbox(d.base64 || d.mensaje));
      div.appendChild(img);
      if (d.caption) {
        const cap = document.createElement('span');
        cap.style.marginTop = '4px';
        cap.textContent = d.caption;
        div.appendChild(cap);
      }
    } else if (d.tipo === 'audio') {
      div.appendChild(crearAudioPlayer(d.base64 || d.mensaje));
    } else {
      const txt = document.createElement('span');
      txt.textContent = d.mensaje;
      div.appendChild(txt);
    }

    const hora = document.createElement('span');
    hora.classList.add('hora');
    hora.textContent = d.hora || '';
    div.appendChild(hora);

    dmChatContainer.appendChild(div);
    dmChatContainer.scrollTop = dmChatContainer.scrollHeight;
}

// Enviar mensaje DM
if (dmForm) {
  dmForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentDmTarget) return;
    const texto = dmInput.value.trim();
    if (!texto) return;

    // Enviar via Socket.IO
    if (socket) {
      socket.emit('dm-enviar', {
        paraUid: currentDmTarget.uid,
        mensaje: texto,
        tipo: 'texto'
      });
    }

    // Guardar en Firestore
    if (window._fbEnviarDM) {
      window._fbEnviarDM(currentDmTarget.uid, currentDmTarget.username, texto, 'texto');
    }

    dmInput.value = '';
  });
}

// ─── SONIDO ───────────────────────────────────────────────────────────────────
// ─── SONIDO ───────────────────────────────────────────────────────────────────
// Política de autoplay del navegador: el AudioContext debe crearse DENTRO de un
// gesto del usuario (click/tap). Por eso diferimos su creación hasta el primer click.
let _audioCtx = null;
let _audioAllowed = false;

function ensureAudioContext() {
    if (!_audioCtx) {
        try {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { return false; }
    }
    if (_audioCtx.state === 'suspended') {
        _audioCtx.resume();
    }
    if (_audioCtx.state === 'running') {
        _audioAllowed = true;
        return true;
    }
    return false;
}

function playSound(tipo = 'mensaje') {
    if (!_audioAllowed || !_audioCtx) return; // aún no hay gesto del usuario
    try {
        const ctx = _audioCtx;
        if (ctx.state !== 'running') return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        if (tipo === 'mensaje') {
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        } else {
            osc.frequency.setValueAtTime(520, ctx.currentTime);
            gain.gain.setValueAtTime(0.07, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        }
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    } catch (e) { }
}

// Exponer globalmente para firebase-chat.js (GitHub Pages)
window._superchatPlaySound = playSound;

// Crear y desbloquear AudioContext en el primer click del usuario (política autoplay)
document.addEventListener('click', () => {
    ensureAudioContext();
}, { capture: true, passive: true });
document.addEventListener('touchstart', () => {
    ensureAudioContext();
}, { capture: true, passive: true });

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(titulo, mensaje, tipo = 'mensaje') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.classList.add('toast', `toast-${tipo}`);
    const corto = mensaje.length > 55 ? mensaje.slice(0, 52) + '…' : mensaje;
    toast.innerHTML = `
        <span class="toast-icon">${tipo === 'mensaje'
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        }</span>
        <div class="toast-body"><strong>${titulo}</strong><span>${corto}</span></div>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 4000);
}

// ─── CONTADOR PESTAÑAS ────────────────────────────────────────────────────────
let mensajesNoLeidos = 0;
const tituloOriginal = document.title;
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { mensajesNoLeidos = 0; document.title = tituloOriginal; }
});

// ─── WELCOME ANIMATION ────────────────────────────────────────────────────────
function showWelcomeAnimation(nombre) {
    const overlay = document.getElementById('welcome-overlay');
    const avatar = document.getElementById('welcome-avatar');
    const nameEl = document.getElementById('welcome-name');
    if (!overlay || !avatar || !nameEl) return;

    const hue = [...nombre].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    avatar.style.background = `hsl(${hue}, 65%, 50%)`;
    avatar.textContent = nombre.charAt(0).toUpperCase();
    nameEl.textContent = nombre;

    overlay.style.display = 'flex';

    setTimeout(() => {
        overlay.classList.add('welcome-out');
        overlay.addEventListener('animationend', () => {
            overlay.remove();
        }, { once: true });
    }, 2600);
}

// ─── INICIO: ESPERAR NOMBRE Y UID DESDE FIREBASE ──────────────────────────────
const waitForName = setInterval(() => {
    if (window._superchatNombre) {
        miNombre = window._superchatNombre;
        miUid = window._superchatUid || '';
        clearInterval(waitForName);
        showWelcomeAnimation(miNombre);
        if (socket) {
          socket.emit('nuevoUsuario', miNombre, miUid);
        } else {
          // Modo GitHub Pages: usar presencia Firestore
          if (window._fbEntrarPresencia) {
            window._fbEntrarPresencia('general');
          }
          if (window._fbSuscribirPresencia) {
            window._fbSuscribirPresencia('general', renderMembers);
          }
          // Notificación toast en lugar de mensaje en el chat
          setTimeout(() => {
            showToast('Sala', `${miNombre} se unió al chat`, 'sistema');
          }, 800);
        }
        console.log('[Chat] Nombre cargado desde Firebase:', miNombre);
    }
}, 200);

// ─── LOGOUT ANIMATION ─────────────────────────────────────────────────────────
function showLogoutAnimation(nombre) {
    const overlay = document.getElementById('logout-overlay');
    const avatar = document.getElementById('logout-avatar');
    const nameEl = document.getElementById('logout-name');
    if (!overlay || !avatar || !nameEl) return;

    const hue = [...nombre].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    avatar.style.background = `hsl(${hue}, 65%, 50%)`;
    avatar.textContent = nombre.charAt(0).toUpperCase();
    nameEl.textContent = nombre;

    overlay.classList.add('logout-active');

    return new Promise(resolve => {
        setTimeout(() => {
            overlay.classList.remove('logout-active');
            resolve();
        }, 1800);
    });
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
logoutBtn.addEventListener('click', () => {
    const hue = [...miNombre].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

    Swal.fire({
        title: '¿Cerrar sesión?',
        html: `
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0">
                <div style="
                    width:72px;height:72px;border-radius:50%;
                    background:hsl(${hue},65%,50%);
                    color:#fff;display:flex;align-items:center;justify-content:center;
                    font-size:1.8rem;font-weight:600;
                    box-shadow:0 6px 24px hsla(${hue},65%,50%,0.35);
                    animation:swalAvatarBounce 0.6s cubic-bezier(0.16,1,0.3,1);
                ">${miNombre.charAt(0).toUpperCase()}</div>
                <div style="font-size:0.95rem;color:var(--text-secondary);line-height:1.5">
                    <strong style="color:var(--text)">${miNombre}</strong>,
                    ¿quieres salir del chat?
                </div>
            </div>
        `,
        icon: undefined,
        showCancelButton: true,
        confirmButtonText: 'Salir',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ff3b30',
        cancelButtonColor: '#6e6e73',
        reverseButtons: true,
        showClass: {
            popup: 'swal2-popup-in'
        },
        hideClass: {
            popup: 'swal2-popup-out'
        },
        customClass: {
            popup: 'swal2-logout-popup',
            confirmButton: 'swal2-btn-logout',
            cancelButton: 'swal2-btn-cancel'
        }
    }).then(result => {
        if (result.isConfirmed) {
            showLogoutAnimation(miNombre).then(() => {
                import('./firebase-config.js?v=5').then(({ signOut, auth }) => {
                    signOut(auth).then(() => {
                        window.location.href = 'login.html';
                    }).catch(err => {
                        console.error('[Logout] Error:', err);
                    });
                });
            });
        }
    });
});

// ─── ENVÍO (SALA) ─────────────────────────────────────────────────────────────
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = input.value.trim();

    if (pendingImageBase64) {
        if (socket) {
          socket.emit('mensaje-imagen', { base64: pendingImageBase64, caption: texto });
        }
        if (window._fbGuardarMensaje) {
            window._fbGuardarMensaje(currentSala, miNombre, pendingImageBase64, 'imagen', { caption: texto });
        }
        clearImagePreview();
        input.value = '';
        return;
    }

    if (texto) {
        if (socket) {
          socket.emit('mensaje-chat', texto);
        }
        if (window._fbGuardarMensaje) {
            window._fbGuardarMensaje(currentSala, miNombre, texto, 'texto');
        }
        input.value = '';
    }
});

// ─── RECIBIR MENSAJES (Socket.IO) ─────────────────────────────────────────────
if (socket) {
  socket.on('mensaje-chat', (data) => {
      // Clave única: usamos el ts del servidor como string (igual que Firestore usa seconds)
      // Firestore key será 'doc|<docId>', pero también registramos esta clave por si acaso
      const tsKey = data.ts ? Math.floor(data.ts / 1000) : '';
      const clave = data.usuario + '|' + data.mensaje.slice(0, 40) + '|' + tsKey;
      if (mensajeYaRenderizado(clave)) return;
      const div = crearBurbuja(data.usuario, data.hora);
      const p = document.createElement('span');
      p.textContent = data.mensaje;
      div.appendChild(p);
      appendMessage(div);
      notificar(data.usuario, data.mensaje);
  });

  socket.on('mensaje-imagen', (data) => {
      const div = crearBurbuja(data.usuario, data.hora);
      const img = document.createElement('img');
      img.src = data.base64;
      img.classList.add('msg-image');
      img.addEventListener('click', () => openLightbox(data.base64));
      div.appendChild(img);
      if (data.caption) {
          const cap = document.createElement('span');
          cap.style.marginTop = '4px';
          cap.textContent = data.caption;
          div.appendChild(cap);
      }
      appendMessage(div);
      notificar(data.usuario, data.caption || '📷 Imagen');
  });

  socket.on('mensaje-audio', (data) => {
      const div = crearBurbuja(data.usuario, data.hora);
      div.appendChild(crearAudioPlayer(data.base64));
      appendMessage(div);
      notificar(data.usuario, '🎤 Audio');
  });

  socket.on('mensaje-sistema', (msg) => {
      // Solo notificación toast, no ensucia el chat
      playSound('sistema');
      showToast('Sala', msg, 'sistema');
  });

  // ─── DM recibido via Socket.IO ───────────────────────────────────────────────
  socket.on('dm-recibir', (data) => {
      if (currentDmTarget && data.deUid === currentDmTarget.uid) {
        // Si el panel DM está abierto con este usuario, renderizar
        const div = document.createElement('div');
        div.classList.add('mensaje', 'dm-msg');
        const autor = document.createElement('span');
        autor.classList.add('autor');
        autor.textContent = data.de;
        div.appendChild(autor);
        const txt = document.createElement('span');
        txt.textContent = data.mensaje;
        div.appendChild(txt);
        const hora = document.createElement('span');
        hora.classList.add('hora');
        hora.textContent = data.hora;
        div.appendChild(hora);
        dmChatContainer.appendChild(div);
        dmChatContainer.scrollTop = dmChatContainer.scrollHeight;
      } else {
        // Notificar que hay un DM nuevo
        playSound('mensaje');
        showToast(data.de, data.mensaje, 'mensaje');
        if (document.hidden) {
          mensajesNoLeidos++;
          document.title = `(${mensajesNoLeidos}) ${tituloOriginal}`;
        }
      }
  });

  // DM propio (eco para que aparezca en nuestra UI)
  socket.on('dm-recibir-propio', (data) => {
      if (currentDmTarget && data.paraUid === currentDmTarget.uid) {
        const div = document.createElement('div');
        div.classList.add('mensaje', 'dm-msg', 'propio');
        const txt = document.createElement('span');
        txt.textContent = data.mensaje;
        div.appendChild(txt);
        const hora = document.createElement('span');
        hora.classList.add('hora');
        hora.textContent = data.hora;
        div.appendChild(hora);
        dmChatContainer.appendChild(div);
        dmChatContainer.scrollTop = dmChatContainer.scrollHeight;
      }
  });

  // Notificación de solicitud de amistad recibida
  socket.on('solicitud-recibida', (data) => {
      playSound('sistema');
      showToast('Solicitud de amistad', `${data.nombre} quiere ser tu amigo`, 'sistema');
      // Incrementar badge si no está ya en la lista
      if (notifBadge) {
        const current = parseInt(notifBadge.textContent) || 0;
        notifBadge.textContent = current + 1;
        notifBadge.style.display = '';
      }
  });
}

// ─── SET ANTI-DUPLICADOS ──────────────────────────────────────────────────────
// Evita que un mismo mensaje se renderice 2 veces (Socket.IO + Firestore)
window._mensajesRenderizados = new Set();

function mensajeYaRenderizado(clave) {
  if (window._mensajesRenderizados.has(clave)) return true;
  window._mensajesRenderizados.add(clave);
  // Limpiar entradas viejas cada 200 mensajes
  if (window._mensajesRenderizados.size > 500) {
    const arr = [...window._mensajesRenderizados];
    window._mensajesRenderizados = new Set(arr.slice(-200));
  }
  return false;
}

function limpiarDeduplicador() {
  window._mensajesRenderizados = new Set();
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function crearBurbuja(usuario, hora) {
    const div = document.createElement('div');
    div.classList.add('mensaje');
    if (usuario === miNombre) div.classList.add('propio');
    if (usuario !== miNombre) {
        const autorEl = document.createElement('span');
        autorEl.classList.add('autor');
        autorEl.textContent = usuario;
        div.appendChild(autorEl);
    }
    div._hora = hora;
    return div;
}

function appendMessage(div) {
    const horaEl = document.createElement('span');
    horaEl.classList.add('hora');
    horaEl.textContent = div._hora;
    div.appendChild(horaEl);
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function notificar(usuario, texto) {
    if (usuario !== miNombre) {
        playSound('mensaje');
        showToast(usuario, texto, 'mensaje');
        if (document.hidden) {
            mensajesNoLeidos++;
            document.title = `(${mensajesNoLeidos}) ${tituloOriginal}`;
        }
    }
}

// ─── SALAS ────────────────────────────────────────────────────────────────────

let salasFirestore = new Set();

function crearBotonSala(salaId, nombre, esCreador = false) {
    const btn = document.createElement('button');
    btn.classList.add('sala-btn');
    btn.dataset.sala = salaId;
    btn.textContent = nombre;

    if (esCreador) {
        const deleteSpan = document.createElement('span');
        deleteSpan.classList.add('sala-delete');
        deleteSpan.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        deleteSpan.title = 'Eliminar sala';
        deleteSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            confirmarEliminarSala(salaId, nombre);
        });
        btn.appendChild(deleteSpan);
    }

    btn.addEventListener('click', () => {
        const salaAnterior = currentSala;
        document.querySelectorAll('.sala-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSala = salaId;
        if (socket) {
            socket.emit('unirse-sala', currentSala);
        } else {
            // Modo GitHub Pages: actualizar presencia y enviar mensaje sistema
            if (window._fbCambiarPresenciaSala) {
                window._fbCambiarPresenciaSala(currentSala);
            }
            if (window._fbSuscribirPresencia) {
                window._fbSuscribirPresencia(currentSala, renderMembers);
            }
            if (miNombre) {
                showToast('Sala', `${miNombre} entró a #${currentSala}`, 'sistema');
            }
        }
        chatContainer.innerHTML = '';
        limpiarDeduplicador();  // Limpiar dedup al cambiar sala
        if (window._fbSuscribirSala) window._fbSuscribirSala(currentSala);
    });

    return btn;
}

function confirmarEliminarSala(salaId, nombre) {
    Swal.fire({
        title: `Eliminar #${nombre}`,
        text: '¿Estás seguro? Se eliminarán todos los mensajes de esta sala.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ff3b30',
        cancelButtonColor: '#6e6e73',
        reverseButtons: true,
        showClass: { popup: 'swal2-popup-in' },
        hideClass: { popup: 'swal2-popup-out' }
    }).then(result => {
        if (result.isConfirmed && window._fbEliminarSala) {
            window._fbEliminarSala(salaId).then(() => {
                if (currentSala === salaId) {
                    const btnGeneral = document.querySelector('.sala-btn[data-sala="general"]');
                    if (btnGeneral) btnGeneral.click();
                }
                showToast('Sala eliminada', `#${nombre}`, 'sistema');
            }).catch(err => {
                Swal.fire('Error', 'No se pudo eliminar la sala', 'error');
            });
        }
    });
}

document.querySelectorAll('.sala-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const salaAnterior = currentSala;
        document.querySelectorAll('.sala-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSala = btn.dataset.sala;
        if (socket) {
            socket.emit('unirse-sala', currentSala);
        } else {
            // Modo GitHub Pages: actualizar presencia y enviar mensaje sistema
            if (window._fbCambiarPresenciaSala) {
                window._fbCambiarPresenciaSala(currentSala);
            }
            if (window._fbSuscribirPresencia) {
                window._fbSuscribirPresencia(currentSala, renderMembers);
            }
            if (miNombre && salaAnterior !== currentSala) {
                showToast('Sala', `${miNombre} entró a #${currentSala}`, 'sistema');
            }
        }
        chatContainer.innerHTML = '';
        limpiarDeduplicador();  // Limpiar dedup al cambiar sala
        if (window._fbSuscribirSala) window._fbSuscribirSala(currentSala);
    });
});

document.getElementById('nueva-sala-btn').addEventListener('click', () => {
    Swal.fire({
        title: 'Nueva sala',
        input: 'text',
        inputLabel: 'Nombre de la sala',
        inputPlaceholder: 'ej: música, tecnología…',
        confirmButtonText: 'Crear',
        confirmButtonColor: '#007aff',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        inputValidator: v => {
            if (!v) return 'Escribe un nombre';
            if (v.length > 20) return 'Máximo 20 caracteres';
        }
    }).then(result => {
        if (!result.isConfirmed) return;
        const nombre = result.value.trim();
        const salaId = nombre.toLowerCase().replace(/\s+/g, '-');
        const existe = document.querySelector(`.sala-btn[data-sala="${salaId}"]`);
        if (existe) { existe.click(); return; }

        if (window._fbGuardarSala) {
            window._fbGuardarSala(nombre, salaId, miUid);
        }

        const btn = crearBotonSala(salaId, nombre, true);
        document.getElementById('nueva-sala-btn').parentElement.insertBefore(btn, document.getElementById('nueva-sala-btn'));
        btn.click();
    });
});

// ─── INICIAR SUSCRIPCIÓN A SALAS ──────────────────────────────────────────────
window._fbIniciarSalas = function () {
    if (window._fbSuscribirSalas) {
        window._fbSuscribirSalas(function (salas) {
            const nav = document.getElementById('nueva-sala-btn').parentElement;
            const salasFijas = window._fbSalasFijas || ['general', 'deportes', 'peliculas', 'videojuegos'];

            document.querySelectorAll('.sala-btn').forEach(btn => {
                const id = btn.dataset.sala;
                if (!salasFijas.includes(id)) {
                    const existeEnFirestore = salas.some(s => s.id === id);
                    if (!existeEnFirestore) {
                        btn.remove();
                    }
                }
            });

            salas.forEach(sala => {
                if (salasFijas.includes(sala.id)) return;
                const existe = document.querySelector(`.sala-btn[data-sala="${sala.id}"]`);
                if (!existe) {
                    const esCreador = (sala.creadorUid === miUid);
                    const btn = crearBotonSala(sala.id, sala.nombre, esCreador);
                    document.getElementById('nueva-sala-btn').parentElement.insertBefore(btn, document.getElementById('nueva-sala-btn'));
                } else {
                    const esCreador = (sala.creadorUid === miUid);
                    const deleteBtn = existe.querySelector('.sala-delete');
                    if (esCreador && !deleteBtn) {
                        const deleteSpan = document.createElement('span');
                        deleteSpan.classList.add('sala-delete');
                        deleteSpan.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
                        deleteSpan.title = 'Eliminar sala';
                        deleteSpan.addEventListener('click', (e) => {
                            e.stopPropagation();
                            confirmarEliminarSala(sala.id, sala.nombre);
                        });
                        existe.appendChild(deleteSpan);
                    } else if (!esCreador && deleteBtn) {
                        deleteBtn.remove();
                    }
                }
            });
        });
    }
};

// ─── RENDER MIEMBROS (CON ACCIONES DM Y AMIGO) ────────────────────────────────
function renderMembers(list) {
    membersList.innerHTML = '';
    membersCount.textContent = list.length;
    list.forEach(member => {
        const name = member.username || member;
        const uid = member.uid || '';
        const li = document.createElement('li');
        li.classList.add('member-item');
        const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
        const esYo = uid === miUid || name === miNombre;

        let accionesHtml = '';
        if (!esYo && uid) {
          accionesHtml = `
            <span class="member-actions">
              <button class="member-dm-btn" title="Mensaje privado" data-uid="${uid}" data-name="${name}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              <button class="member-friend-btn" title="Agregar amigo" data-uid="${uid}" data-name="${name}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="8.5" cy="7" r="4"/>
                  <line x1="20" y1="8" x2="20" y2="14"/>
                  <line x1="23" y1="11" x2="17" y2="11"/>
                </svg>
              </button>
            </span>`;
        }

        li.innerHTML = `
            <span class="member-avatar" style="background:hsl(${hue},65%,50%)">${name.charAt(0).toUpperCase()}</span>
            <span class="member-name">${name}${esYo ? ' (tú)' : ''}</span>
            ${accionesHtml}
            <span class="member-dot"></span>`;

        // Eventos para botones DM y amigo
        const dmBtn = li.querySelector('.member-dm-btn');
        const friendBtn = li.querySelector('.member-friend-btn');

        if (dmBtn) {
          dmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            abrirDM({ uid: dmBtn.dataset.uid, username: dmBtn.dataset.name });
            toggleMembers(false);
          });
        }
        if (friendBtn) {
          friendBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window._fbEnviarSolicitud) {
              window._fbEnviarSolicitud(friendBtn.dataset.uid, friendBtn.dataset.name, '');
              showToast('Solicitud enviada', `Solicitud enviada a ${friendBtn.dataset.name}`, 'sistema');
              friendBtn.disabled = true;
              friendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
              friendBtn.title = 'Solicitud enviada';
            }
          });
        }

        membersList.appendChild(li);
    });
}

function renderSoloMember(name) {
    membersList.innerHTML = '';
    membersCount.textContent = '1';
    const li = document.createElement('li');
    li.classList.add('member-item');
    const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    li.innerHTML = `
        <span class="member-avatar" style="background:hsl(${hue},65%,50%)">${name.charAt(0).toUpperCase()}</span>
        <span class="member-name">${name} (tú)</span>
        <span class="member-dot"></span>`;
    membersList.appendChild(li);
}

if (socket) {
  socket.on('miembros-sala', renderMembers);
}

// ─── ADJUNTAR IMAGEN ──────────────────────────────────────────────────────────
attachBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
        Swal.fire({ title: 'Imagen muy grande', text: 'Máximo 4 MB', icon: 'warning', confirmButtonColor: '#007aff' });
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        pendingImageBase64 = e.target.result;
        imgPreviewImg.src = pendingImageBase64;
        imgPreviewCtn.style.display = '';
        input.placeholder = 'Añade un pie de foto (opcional)…';
        input.focus();
    };
    reader.readAsDataURL(file);
    imageInput.value = '';
});

imgPreviewRem.addEventListener('click', clearImagePreview);

function clearImagePreview() {
    pendingImageBase64 = null;
    imgPreviewImg.src = '';
    imgPreviewCtn.style.display = 'none';
    input.placeholder = 'Escribe un mensaje…';
}

// ─── GRABAR AUDIO ─────────────────────────────────────────────────────────────
audioBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    } else {
        startRecording();
    }
});
recCancel.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        audioChunks = [];
        mediaRecorder.stop();
    }
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            stopRecordingUI();
            stream.getTracks().forEach(t => t.stop());
            if (!audioChunks.length) return;
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result;
                if (socket) {
                  socket.emit('mensaje-audio', { base64 });
                }
                if (window._fbGuardarMensaje) {
                    window._fbGuardarMensaje(currentSala, miNombre, base64, 'audio');
                }
            };
            reader.readAsDataURL(blob);
            audioChunks = [];
        };
        mediaRecorder.start();
        startRecordingUI();
    } catch (err) {
        Swal.fire({ title: 'Sin acceso al micrófono', text: 'Permite el acceso para enviar audios.', icon: 'error', confirmButtonColor: '#007aff' });
    }
}

function startRecordingUI() {
    audioBtn.classList.add('recording');
    iconMic.style.display = 'none';
    iconStop.style.display = '';
    recIndicator.style.display = 'flex';
    recSeconds = 0;
    recTimer.textContent = '0:00';
    recInterval = setInterval(() => {
        recSeconds++;
        const m = Math.floor(recSeconds / 60);
        const s = String(recSeconds % 60).padStart(2, '0');
        recTimer.textContent = `${m}:${s}`;
        if (recSeconds >= 120) mediaRecorder.stop();
    }, 1000);
}

function stopRecordingUI() {
    audioBtn.classList.remove('recording');
    iconMic.style.display = '';
    iconStop.style.display = 'none';
    recIndicator.style.display = 'none';
    clearInterval(recInterval);
}

// ─── REPRODUCTOR DE AUDIO PERSONALIZADO ───────────────────────────────────────
// Reemplaza el <audio controls> nativo por un player con waveform visual y boton play/pause
// Expuesto globalmente para que firebase-chat.js (ES module) tambien lo use
function crearAudioPlayer(src) {
  const container = document.createElement('div');
  container.classList.add('audio-player');

  // Audio oculto (solo para reproduccion)
  const audio = document.createElement('audio');
  audio.src = src;
  audio.preload = 'metadata';

  // Boton play/pause
  const btn = document.createElement('button');
  btn.classList.add('audio-play-btn');
  const svgPlay = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>';
  const svgPause = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  btn.innerHTML = svgPlay;
  btn.addEventListener('click', () => {
    if (audio.paused) {
      // Pausar cualquier otro audio reproduciendose
      document.querySelectorAll('.audio-player audio').forEach(a => {
        if (a !== audio && !a.paused) { a.pause(); a.currentTime = 0; }
      });
      audio.play();
      btn.innerHTML = svgPause;
      btn.classList.add('playing');
    } else {
      audio.pause();
      btn.innerHTML = svgPlay;
      btn.classList.remove('playing');
    }
  });

  // Waveform (10 barras)
  const waveform = document.createElement('div');
  waveform.classList.add('audio-waveform');
  const NUM_BARS = 10;
  for (let i = 0; i < NUM_BARS; i++) {
    const bar = document.createElement('span');
    // Alturas pseudo-aleatorias basadas en posicion (simulan una onda estatica)
    const heights = [14, 22, 18, 26, 20, 24, 16, 28, 12, 20];
    bar.style.height = heights[i] + 'px';
    waveform.appendChild(bar);
  }

  // Tiempo
  const time = document.createElement('span');
  time.classList.add('audio-time');
  time.textContent = '0:00';

  audio.addEventListener('loadedmetadata', () => {
    const dur = audio.duration || 0;
    time.textContent = formatAudioTime(dur);
  });

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = audio.currentTime / audio.duration;
    const bars = waveform.querySelectorAll('span');
    bars.forEach((bar, i) => {
      bar.classList.toggle('active', i / bars.length < pct);
    });
    time.textContent = formatAudioTime(audio.currentTime);
  });

  audio.addEventListener('ended', () => {
    btn.innerHTML = svgPlay;
    btn.classList.remove('playing');
    const bars = waveform.querySelectorAll('span');
    bars.forEach(b => b.classList.remove('active'));
    time.textContent = formatAudioTime(audio.duration || 0);
  });

  audio.addEventListener('pause', () => {
    btn.innerHTML = svgPlay;
    btn.classList.remove('playing');
  });

  container.appendChild(btn);
  container.appendChild(waveform);
  container.appendChild(time);
  container.appendChild(audio); // oculto, solo funcional

  return container;
}
// Exponer globalmente para firebase-chat.js (modulo ES en GitHub Pages)
window.crearAudioPlayer = crearAudioPlayer;

function formatAudioTime(seconds) {
  const s = Math.floor(seconds || 0);
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return m + ':' + sec;
}

// ─── LIGHTBOX ─────────────────────────────────────────────────────────────────
function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.add('open');
}
lightboxClose.addEventListener('click', () => lightbox.classList.remove('open'));
lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.classList.remove('open'); });

// ─── LIMPIEZA AL CERRAR (GitHub Pages: borrar doc de presencia) ────────────────
window.addEventListener('beforeunload', () => {
    if (!socket && window._fbSalirPresencia) {
        // Usar sendBeacon para asegurar que el doc se borra aunque la página se cierre
        if (miUid && navigator.sendBeacon) {
            // sendBeacon no soporta DELETE, así que usamos fetch con keepalive
            const firebaseConfig = { projectId: 'superchat-47a2d' };
            const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/presencia/${miUid}`;
            // No podemos hacer DELETE con keepalive fácilmente, así que el doc expirará por timeout (2 min sin heartbeat)
        }
        // La función salirPresencia intentará borrar el doc (mejor esfuerzo)
        window._fbSalirPresencia();
    }
});
