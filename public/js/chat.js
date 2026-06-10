// ═══════════════════════════════════════════════════════════════════════════════
//  chat.js  —  Socket.IO + Firebase (Superchat)
// ═══════════════════════════════════════════════════════════════════════════════
const socket = io();

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

let miNombre = '';
let pendingImageBase64 = null;
let mediaRecorder = null;
let audioChunks = [];
let recInterval = null;
let recSeconds = 0;
let membersOpen = false;
let currentSala = 'general';

// Exponer para firebase-chat.js (bridge)
window._superchatSocketId = socket.id || '';
socket.on('connect', () => { window._superchatSocketId = socket.id; });

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
}
membersBtn.addEventListener('click', () => toggleMembers(!membersOpen));
membersClose.addEventListener('click', () => toggleMembers(false));

function renderMembers(list) {
    membersList.innerHTML = '';
    membersCount.textContent = list.length;
    list.forEach(name => {
        const li = document.createElement('li');
        const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
        li.innerHTML = `
            <span class="member-avatar" style="background:hsl(${hue},65%,50%)">${name.charAt(0).toUpperCase()}</span>
            <span class="member-name">${name}</span>
            <span class="member-dot"></span>`;
        membersList.appendChild(li);
    });
}
socket.on('miembros-sala', renderMembers);

// ─── SONIDO ───────────────────────────────────────────────────────────────────
function playSound(tipo = 'mensaje') {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
        <span class="toast-icon">${tipo === 'mensaje' ? '💬' : 'ℹ️'}</span>
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

    // Generar color del avatar basado en el nombre
    const hue = [...nombre].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    avatar.style.background = `hsl(${hue}, 65%, 50%)`;
    avatar.textContent = nombre.charAt(0).toUpperCase();
    nameEl.textContent = nombre;

    overlay.style.display = 'flex';

    // Auto-destruir después de 2.6 segundos
    setTimeout(() => {
        overlay.classList.add('welcome-out');
        overlay.addEventListener('animationend', () => {
            overlay.remove();
        }, { once: true });
    }, 2600);
}

// ─── INICIO: ESPERAR NOMBRE DESDE FIREBASE ────────────────────────────────────
// El nombre ahora viene de Firebase Auth (displayName). Esperamos a que
// firebase-chat.js lo exponga en window._superchatNombre
const waitForName = setInterval(() => {
    if (window._superchatNombre) {
        miNombre = window._superchatNombre;
        clearInterval(waitForName);
        // Mostrar animación de bienvenida
        showWelcomeAnimation(miNombre);
        // Enviar nombre al servidor Socket.IO
        socket.emit('nuevoUsuario', miNombre);
        console.log('[Chat] Nombre cargado desde Firebase:', miNombre);
    }
}, 200);

// ─── LOGOUT ANIMATION ─────────────────────────────────────────────────────────
function showLogoutAnimation(nombre) {
    const overlay = document.getElementById('logout-overlay');
    const avatar = document.getElementById('logout-avatar');
    const nameEl = document.getElementById('logout-name');
    if (!overlay || !avatar || !nameEl) return;

    // Generar color del avatar basado en el nombre
    const hue = [...nombre].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    avatar.style.background = `hsl(${hue}, 65%, 50%)`;
    avatar.textContent = nombre.charAt(0).toUpperCase();
    nameEl.textContent = nombre;

    // Activar animación de entrada
    overlay.classList.add('logout-active');

    // Redirigir después de la animación
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
            // Mostrar animación de salida
            showLogoutAnimation(miNombre).then(() => {
                // Importar dinámicamente para hacer signOut
                import('./firebase-config.js?v=4').then(({ signOut, auth }) => {
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

// ─── ENVÍO ────────────────────────────────────────────────────────────────────
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = input.value.trim();

    if (pendingImageBase64) {
        socket.emit('mensaje-imagen', { base64: pendingImageBase64, caption: texto });
        // Guardar en Firestore — pasamos la sala actual explícitamente
        if (window._fbGuardarMensaje) {
            window._fbGuardarMensaje(currentSala, miNombre, pendingImageBase64, 'imagen', { caption: texto });
        }
        clearImagePreview();
        input.value = '';
        return;
    }

    if (texto) {
        socket.emit('mensaje-chat', texto);
        // Guardar en Firestore — pasamos la sala actual explícitamente
        if (window._fbGuardarMensaje) {
            window._fbGuardarMensaje(currentSala, miNombre, texto, 'texto');
        }
        input.value = '';
    }
});

// ─── RECIBIR MENSAJES ─────────────────────────────────────────────────────────
socket.on('mensaje-chat', (data) => {
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
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.classList.add('msg-audio');
    audio.src = data.base64;
    div.appendChild(audio);
    appendMessage(div);
    notificar(data.usuario, '🎤 Audio');
});

socket.on('mensaje-sistema', (msg) => {
    const div = document.createElement('div');
    div.classList.add('mensaje', 'sistema');
    div.textContent = msg;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    playSound('sistema');
    showToast('Sala', msg, 'sistema');
});

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
document.querySelectorAll('.sala-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sala-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSala = btn.dataset.sala;
        socket.emit('unirse-sala', currentSala);
        chatContainer.innerHTML = '';
        // Cambiar suscripción de Firebase
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

        const btn = document.createElement('button');
        btn.classList.add('sala-btn');
        btn.dataset.sala = salaId;
        btn.textContent = nombre;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sala-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSala = salaId;
            socket.emit('unirse-sala', salaId);
            chatContainer.innerHTML = '';
            if (window._fbSuscribirSala) window._fbSuscribirSala(salaId);
        });
        document.getElementById('nueva-sala-btn').parentElement.insertBefore(btn, document.getElementById('nueva-sala-btn'));
        btn.click();
    });
});

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
                socket.emit('mensaje-audio', { base64 });
                // Guardar en Firestore — pasamos la sala actual explícitamente
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

// ─── LIGHTBOX ─────────────────────────────────────────────────────────────────
function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.add('open');
}
lightboxClose.addEventListener('click', () => lightbox.classList.remove('open'));
lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.classList.remove('open'); });
