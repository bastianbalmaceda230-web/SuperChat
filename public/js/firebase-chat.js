// ═══════════════════════════════════════════════════════════════════════════════
//  firebase-chat.js  —  Integración Firebase + Socket.IO para Superchat
//  • Firebase Auth email/password → uid estable por usuario
//  • Firestore                   → historial de mensajes persistente por sala
//  • Socket.IO                   → tiempo real (ya existente)
// ═══════════════════════════════════════════════════════════════════════════════

import {
  db, auth,
  collection, addDoc,
  query, orderBy, limit,
  onSnapshot, serverTimestamp,
  onAuthStateChanged
} from './firebase-config.js?v=4';

// ── Referencias a la UI ───────────────────────────────────────────────────────
const chatContainer = document.getElementById('chat-container');
const badge = document.getElementById('firebase-badge');

// ── Estado ────────────────────────────────────────────────────────────────────
let currentSala = 'general';
let firestoreUnsub = null;   // desuscribir listener anterior al cambiar sala
let firebaseReady = false;
let miNombreFirebase = '';     // se sincroniza con el nombre del usuario

// ── Autenticación con email/password ──────────────────────────────────────────
// Esperamos a que el usuario ya esté autenticado (viene de login.html)
onAuthStateChanged(auth, (user) => {
  if (user) {
    firebaseReady = true;
    badge.classList.add('fb-online');
    badge.title = 'Firebase conectado ✓';
    console.log('[Firebase] Usuario autenticado:', user.email, 'UID:', user.uid);

    // Usar displayName del perfil de Firebase, o el email como fallback
    miNombreFirebase = user.displayName || user.email?.split('@')[0] || 'Usuario';
    window._superchatNombre = miNombreFirebase;

    // Si el nombre aún no se ha establecido en chat.js, lo forzamos
    if (!window._superchatNombre) {
      window._superchatNombre = miNombreFirebase;
    }

    // Cargar historial de la sala inicial
    suscribirSala('general');
  } else {
    // No hay usuario autenticado → redirigir al login
    console.log('[Firebase] No hay sesión activa. Redirigiendo al login...');
    window.location.href = 'login.html';
  }
});

// ── Suscripción a sala en Firestore ──────────────────────────────────────────
export function suscribirSala(sala) {
  // Cancelar listener anterior
  if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
  currentSala = sala;

  // Limpiar mensajes de historial (los de Socket.IO se agregarán encima)
  limpiarHistorial();

  const ref = collection(db, 'salas', sala, 'mensajes');
  const q = query(ref, orderBy('ts', 'asc'), limit(60));

  firestoreUnsub = onSnapshot(q, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const d = change.doc.data();
        // Evitar duplicar mensajes del propio socket (llegan por ambas vías)
        if (d._socketId && d._socketId === window._superchatSocketId) return;
        renderFirestoreMsg(d);
      }
    });
  }, err => {
    console.error('[Firestore] Error al escuchar sala:', err);
  });
}

// ── Guardar mensaje en Firestore (sala pasada explícitamente) ────────────────
export async function guardarMensaje(sala, usuario, mensaje, tipo = 'texto', extra = {}) {
  if (!firebaseReady) {
    // Reintentar en 1s si Firebase aún no está listo
    setTimeout(() => guardarMensaje(sala, usuario, mensaje, tipo, extra), 1000);
    return;
  }
  try {
    await addDoc(collection(db, 'salas', sala, 'mensajes'), {
      usuario,
      mensaje,
      tipo,
      ts: serverTimestamp(),
      _socketId: window._superchatSocketId || '',
      ...extra
    });
    console.log(`[Firestore] ✓ Guardado en salas/${sala}/mensajes`);
  } catch (err) {
    console.error('[Firestore] Error al guardar mensaje:', err);
  }
}

// ── Renderizar mensaje de Firestore ───────────────────────────────────────────
function renderFirestoreMsg(d) {
  const esMio = d.usuario === miNombreFirebase;

  // No duplicar si ya existe un elemento con el mismo contenido reciente
  // (mensajes propios ya se renderizan via Socket.IO)
  if (esMio) return;

  const div = document.createElement('div');
  div.classList.add('mensaje', 'fb-msg');
  if (esMio) div.classList.add('propio');

  const autor = document.createElement('span');
  autor.classList.add('autor');
  autor.textContent = d.usuario;
  div.appendChild(autor);

  if (d.tipo === 'imagen') {
    const img = document.createElement('img');
    img.src = d.mensaje;
    img.classList.add('msg-image');
    img.addEventListener('click', () => openLightboxExternal(d.mensaje));
    div.appendChild(img);
    if (d.caption) {
      const cap = document.createElement('span');
      cap.style.marginTop = '4px';
      cap.textContent = d.caption;
      div.appendChild(cap);
    }
  } else if (d.tipo === 'audio') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.classList.add('msg-audio');
    audio.src = d.mensaje;
    div.appendChild(audio);
  } else {
    const txt = document.createElement('span');
    txt.textContent = d.mensaje;
    div.appendChild(txt);
  }

  const hora = document.createElement('span');
  hora.classList.add('hora');
  hora.textContent = d.ts
    ? new Date(d.ts.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  div.appendChild(hora);

  // Insertar en posición correcta (antes de mensajes en tiempo real)
  const msgs = chatContainer.querySelectorAll('.mensaje:not(.fb-msg):not(.sistema)');
  if (msgs.length > 0) {
    chatContainer.insertBefore(div, msgs[0]);
  } else {
    chatContainer.appendChild(div);
  }
}

function limpiarHistorial() {
  chatContainer.querySelectorAll('.fb-msg').forEach(el => el.remove());
}

// ── Lightbox (reutiliza la del DOM) ──────────────────────────────────────────
function openLightboxExternal(src) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  if (lb && img) { img.src = src; lb.classList.add('open'); }
}

// ── Exponer función a chat.js (window bridge) ─────────────────────────────────
window._fbGuardarMensaje = guardarMensaje;
window._fbSuscribirSala = suscribirSala;

console.log('[Firebase] firebase-chat.js cargado correctamente');
