// ═══════════════════════════════════════════════════════════════════════════════
//  firebase-chat.js  —  Integración Firebase + Socket.IO para Superchat
//  • Firebase Auth email/password → uid estable por usuario
//  • Firestore                   → historial de mensajes persistente por sala
//  • Socket.IO                   → tiempo real (opcional, funciona sin él)
//  • DMs                         → mensajes privados entre usuarios
//  • Amigos                      → solicitudes, aceptar/rechazar, lista
//  • Auto-borrado 24h            → mensajes viejos se eliminan automáticamente
// ═══════════════════════════════════════════════════════════════════════════════

import {
  db, auth,
  collection, addDoc, doc, deleteDoc, setDoc, getDoc,
  query, orderBy, limit, where, getDocs,
  onSnapshot, serverTimestamp,
  writeBatch,
  onAuthStateChanged
} from './firebase-config.js?v=6';

// ── Salas predeterminadas que no se pueden eliminar ───────────────────────────
const SALAS_FIJAS = ['general', 'deportes', 'peliculas', 'videojuegos'];

// ── Referencias a la UI ───────────────────────────────────────────────────────
const chatContainer = document.getElementById('chat-container');
const badge = document.getElementById('firebase-badge');

// ── Estado ────────────────────────────────────────────────────────────────────
let currentSala = 'general';
let firestoreUnsub = null;        // desuscribir listener anterior al cambiar sala
let firebaseReady = false;
let miNombreFirebase = '';        // se sincroniza con el nombre del usuario
let miUidFirebase = '';           // UID del usuario actual
let dmUnsub = null;               // listener de DM activo
let currentDmUid = null;          // UID del usuario con quien chateamos en DM
let solicitudesUnsub = null;      // listener de solicitudes de amistad
let amigosUnsub = null;           // listener de lista de amigos
let presenciaUnsub = null;        // listener de presencia por sala
let presenciaDocRef = null;       // referencia al doc de presencia del usuario actual

// ── Detectar si Socket.IO está disponible ─────────────────────────────────────
const SOCKET_AVAILABLE = (typeof io !== 'undefined') && window.io !== null;

// ── Auth loader ───────────────────────────────────────────────────────────────
function ocultarAuthLoader() {
  const loader = document.getElementById('auth-loader');
  if (loader) {
    loader.classList.add('auth-loader-hidden');
    loader.addEventListener('transitionend', () => {
      loader.remove();
    }, { once: true });
  }
}

// ── Auth guard: timeout de seguridad ──────────────────────────────────────────
let authTimeoutTriggered = false;
const AUTH_TIMEOUT = setTimeout(() => {
  if (!firebaseReady) {
    authTimeoutTriggered = true;
    console.warn('[Firebase] Timeout de autenticación. Redirigiendo al login...');
    ocultarAuthLoader();
    window.location.href = 'login.html';
  }
}, 6000);

// ── Autenticación con email/password ──────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (!authTimeoutTriggered) clearTimeout(AUTH_TIMEOUT);
    authTimeoutTriggered = true;

    firebaseReady = true;
    miUidFirebase = user.uid;
    if (badge) {
      badge.classList.add('fb-online');
      badge.title = 'Firebase conectado ✓';
    }
    console.log('[Firebase] Usuario autenticado:', user.email, 'UID:', user.uid);

    miNombreFirebase = user.displayName || user.email?.split('@')[0] || 'Usuario';
    window._superchatNombre = miNombreFirebase;
    window._superchatUid = user.uid;

    document.body.style.visibility = 'visible';
    ocultarAuthLoader();

    // Cargar historial de la sala inicial
    suscribirSala('general');

    // Iniciar suscripción a la lista de salas
    if (window._fbIniciarSalas) window._fbIniciarSalas();

    // Iniciar suscripción a solicitudes de amistad
    suscribirSolicitudes();

    // Iniciar suscripción a lista de amigos
    suscribirAmigos();

  } else {
    if (!authTimeoutTriggered) clearTimeout(AUTH_TIMEOUT);
    authTimeoutTriggered = true;
    console.log('[Firebase] No hay sesión activa. Redirigiendo al login...');
    ocultarAuthLoader();
    window.location.href = 'login.html';
  }
});

// ── Auto-borrado de mensajes viejos (>24h) ────────────────────────────────────
async function limpiarMensajesViejos(sala) {
  if (!firebaseReady) return;
  try {
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ref = collection(db, 'salas', sala, 'mensajes');
    const q = query(ref, where('ts', '<', hace24h), orderBy('ts', 'asc'), limit(100));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const batch = writeBatch(db);
      snapshot.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
      console.log(`[Firebase] ✓ ${snapshot.size} mensajes viejos eliminados de #${sala}`);
    }
  } catch (err) {
    console.error('[Firebase] Error al limpiar mensajes viejos:', err);
  }
}

// ── Suscripción a sala en Firestore ──────────────────────────────────────────
export function suscribirSala(sala) {
  if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
  currentSala = sala;

  limpiarHistorial();

  // Resetear deduplicador al cambiar de sala (evita bloqueos cruzados entre salas)
  if (window._mensajesRenderizados) window._mensajesRenderizados = new Set();

  // Ejecutar limpieza de mensajes viejos cada vez que se entra a una sala
  limpiarMensajesViejos(sala);

  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ref = collection(db, 'salas', sala, 'mensajes');
  const q = query(ref, where('ts', '>=', hace24h), orderBy('ts', 'asc'), limit(60));

  if (SOCKET_AVAILABLE) {
    // Con Socket.IO: solo cargar historial una vez (getDocs).
    // Los nuevos mensajes llegan por Socket.IO en tiempo real.
    getDocs(q).then(snapshot => {
      snapshot.forEach(docSnap => {
        renderFirestoreMsg(docSnap.data(), docSnap.id);
      });
    }).catch(err => {
      console.error('[Firestore] Error al cargar historial:', err);
    });
  } else {
    // Sin Socket.IO: usar onSnapshot para recibir mensajes en tiempo real via Firestore
    firestoreUnsub = onSnapshot(q, snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          renderFirestoreMsg(change.doc.data(), change.doc.id);
        }
      });
    }, err => {
      console.error('[Firestore] Error al escuchar sala:', err);
    });
  }
}

// ── Guardar mensaje en Firestore (sala pasada explícitamente) ────────────────
export async function guardarMensaje(sala, usuario, mensaje, tipo = 'texto', extra = {}) {
  if (!firebaseReady) {
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
function renderFirestoreMsg(d, docId) {
  // Anti-duplicados: usar el ID del documento Firestore como clave única
  const clave = docId
    ? 'doc|' + docId
    : d.usuario + '|' + (d.mensaje || '').slice(0, 40) + '|' + (d.ts ? (d.ts.seconds || d.ts) : '');
  if (window._mensajesRenderizados && window._mensajesRenderizados.has(clave)) return;
  if (window._mensajesRenderizados) window._mensajesRenderizados.add(clave);

  // Mensaje del sistema: se renderiza centrado, sin burbuja ni autor
  if (d.tipo === 'sistema') {
    const div = document.createElement('div');
    div.classList.add('mensaje', 'sistema');
    div.textContent = d.mensaje;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return;
  }

  const esMio = d.usuario === miNombreFirebase;
  const div = document.createElement('div');
  div.classList.add('mensaje', 'fb-msg');
  if (esMio) div.classList.add('propio');

  if (!esMio) {
    const autor = document.createElement('span');
    autor.classList.add('autor');
    autor.textContent = d.usuario;
    div.appendChild(autor);
  }

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
    div.appendChild(crearAudioPlayer(d.mensaje));
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

// ═══════════════════════════════════════════════════════════════════════════════
//  SALAS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Guardar sala en Firestore ─────────────────────────────────────────────────
export async function guardarSala(nombre, salaId, uidCreador) {
  if (!firebaseReady) {
    setTimeout(() => guardarSala(nombre, salaId, uidCreador), 1000);
    return;
  }
  try {
    await setDoc(doc(db, 'salas-lista', salaId), {
      id: salaId,
      nombre,
      creadorUid: uidCreador,
      creadoEn: serverTimestamp()
    });
    console.log(`[Firebase] ✓ Sala guardada: ${nombre} (${salaId})`);
  } catch (err) {
    console.error('[Firebase] Error al guardar sala:', err);
  }
}

// ── Eliminar sala de Firestore (y todos sus mensajes) ─────────────────────────
export async function eliminarSala(salaId) {
  if (!firebaseReady) return;
  try {
    // Primero eliminar todos los mensajes de la sala
    const mensajesRef = collection(db, 'salas', salaId, 'mensajes');
    const q = query(mensajesRef, limit(200));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const batch = writeBatch(db);
      snapshot.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
      console.log(`[Firebase] ✓ ${snapshot.size} mensajes eliminados de #${salaId}`);
    }

    // Luego eliminar el documento de la sala
    await deleteDoc(doc(db, 'salas-lista', salaId));
    console.log(`[Firebase] ✓ Sala eliminada: ${salaId}`);
  } catch (err) {
    console.error('[Firebase] Error al eliminar sala:', err);
    throw err;
  }
}

// ── Suscribirse a la lista de salas ───────────────────────────────────────────
let salasUnsub = null;

export function suscribirSalas(onSalasActualizadas) {
  if (salasUnsub) { salasUnsub(); salasUnsub = null; }

  const ref = collection(db, 'salas-lista');
  const q = query(ref, orderBy('creadoEn', 'asc'));

  salasUnsub = onSnapshot(q, snapshot => {
    const salas = [];
    snapshot.forEach(docSnap => {
      salas.push(docSnap.data());
    });
    if (onSalasActualizadas) onSalasActualizadas(salas);
  }, err => {
    console.error('[Firebase] Error al escuchar salas-lista:', err);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MENSAJES PRIVADOS (DM)
// ═══════════════════════════════════════════════════════════════════════════════

// Generar ID de DM único para dos usuarios (ordenado alfabéticamente)
function generarDmId(uid1, uid2) {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

// Suscribirse a los DMs con otro usuario
export function suscribirDM(otroUid, callback) {
  if (dmUnsub) { dmUnsub(); dmUnsub = null; }
  if (!miUidFirebase || !otroUid) return;

  currentDmUid = otroUid;
  const dmId = generarDmId(miUidFirebase, otroUid);
  const ref = collection(db, 'dms', dmId, 'mensajes');
  const q = query(ref, orderBy('ts', 'asc'), limit(80));

  if (SOCKET_AVAILABLE) {
    // Con Socket.IO: solo cargar historial una vez.
    // Los DMs nuevos llegan por Socket.IO en tiempo real.
    getDocs(q).then(snapshot => {
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        if (callback) {
          callback({
            de: d.de,
            deUid: d.deUid,
            para: d.para,
            paraUid: d.paraUid,
            mensaje: d.mensaje,
            tipo: d.tipo || 'texto',
            base64: d.base64 || '',
            caption: d.caption || '',
            ts: d.ts,
            hora: d.ts ? new Date(d.ts.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
          });
        }
      });
    }).catch(err => {
      console.error('[Firestore] Error al cargar historial DM:', err);
    });
  } else {
    // Sin Socket.IO: usar onSnapshot para recibir DMs en tiempo real via Firestore
    dmUnsub = onSnapshot(q, snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const d = change.doc.data();
          if (callback) {
            callback({
              de: d.de,
              deUid: d.deUid,
              para: d.para,
              paraUid: d.paraUid,
              mensaje: d.mensaje,
              tipo: d.tipo || 'texto',
              base64: d.base64 || '',
              caption: d.caption || '',
              ts: d.ts,
              hora: d.ts ? new Date(d.ts.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
            });
          }
        }
      });
    }, err => {
      console.error('[Firestore] Error al escuchar DM:', err);
    });
  }
}

// Cancelar suscripción DM
export function cancelarSuscripcionDM() {
  if (dmUnsub) { dmUnsub(); dmUnsub = null; }
  currentDmUid = null;
}

// Enviar mensaje privado (DM)
export async function enviarDM(paraUid, paraNombre, mensaje, tipo = 'texto', extra = {}) {
  if (!firebaseReady || !miUidFirebase) return;
  try {
    const dmId = generarDmId(miUidFirebase, paraUid);
    await addDoc(collection(db, 'dms', dmId, 'mensajes'), {
      de: miNombreFirebase,
      deUid: miUidFirebase,
      para: paraNombre,
      paraUid: paraUid,
      mensaje: mensaje.toString().slice(0, 1000),
      tipo,
      base64: extra.base64 || '',
      caption: extra.caption || '',
      ts: serverTimestamp(),
      _socketId: window._superchatSocketId || ''
    });
    console.log(`[Firebase] ✓ DM enviado a ${paraNombre}`);
  } catch (err) {
    console.error('[Firebase] Error al enviar DM:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AMIGOS Y SOLICITUDES
// ═══════════════════════════════════════════════════════════════════════════════

// Enviar solicitud de amistad
export async function enviarSolicitudAmistad(paraUid, paraNombre, paraEmail) {
  if (!firebaseReady || !miUidFirebase) return;
  try {
    await setDoc(doc(db, 'solicitudes', paraUid, 'pendientes', miUidFirebase), {
      deUid: miUidFirebase,
      nombre: miNombreFirebase,
      email: paraEmail || '',
      estado: 'pendiente',
      ts: serverTimestamp()
    });
    console.log(`[Firebase] ✓ Solicitud de amistad enviada a ${paraNombre}`);

    // Notificar via Socket.IO
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('solicitud-amistad', {
        paraUid: paraUid,
        email: paraEmail || ''
      });
    }
  } catch (err) {
    console.error('[Firebase] Error al enviar solicitud de amistad:', err);
  }
}

// Responder a solicitud de amistad (aceptar/rechazar)
export async function responderSolicitud(deUid, aceptar) {
  if (!firebaseReady || !miUidFirebase) return;
  try {
    const solicitudRef = doc(db, 'solicitudes', miUidFirebase, 'pendientes', deUid);
    if (aceptar) {
      // Leer el nombre del solicitante desde la solicitud
      let nombreSolicitante = '';
      try {
        const snap = await getDoc(solicitudRef);
        if (snap.exists()) {
          nombreSolicitante = snap.data().nombre || '';
        }
      } catch(e) { /* ignorar */ }

      // Agregar a lista de amigos de ambos usuarios
      const batch = writeBatch(db);

      batch.set(doc(db, 'amigos', miUidFirebase, 'lista', deUid), {
        uid: deUid,
        nombre: nombreSolicitante,
        desde: serverTimestamp()
      });

      batch.set(doc(db, 'amigos', deUid, 'lista', miUidFirebase), {
        uid: miUidFirebase,
        nombre: miNombreFirebase,
        desde: serverTimestamp()
      });

      // Eliminar solicitud
      batch.delete(solicitudRef);

      await batch.commit();
      console.log(`[Firebase] ✓ Amistad aceptada con ${deUid} (${nombreSolicitante})`);

      // Notificar via Socket.IO
      if (typeof socket !== 'undefined' && socket) {
        socket.emit('respuesta-amistad', {
          paraUid: deUid,
          aceptada: true,
          nombre: miNombreFirebase
        });
      }
    } else {
      // Solo eliminar solicitud
      await deleteDoc(solicitudRef);
      console.log(`[Firebase] ✓ Solicitud rechazada de ${deUid}`);

      if (typeof socket !== 'undefined' && socket) {
        socket.emit('respuesta-amistad', {
          paraUid: deUid,
          aceptada: false,
          nombre: miNombreFirebase
        });
      }
    }
  } catch (err) {
    console.error('[Firebase] Error al responder solicitud:', err);
  }
}

// Eliminar amigo
export async function eliminarAmigo(amigoUid) {
  if (!firebaseReady || !miUidFirebase) return;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'amigos', miUidFirebase, 'lista', amigoUid));
    batch.delete(doc(db, 'amigos', amigoUid, 'lista', miUidFirebase));
    await batch.commit();
    console.log(`[Firebase] ✓ Amigo eliminado: ${amigoUid}`);
  } catch (err) {
    console.error('[Firebase] Error al eliminar amigo:', err);
  }
}

// Suscribirse a solicitudes de amistad pendientes
export function suscribirSolicitudes() {
  if (!miUidFirebase) return;
  if (solicitudesUnsub) { solicitudesUnsub(); solicitudesUnsub = null; }

  const ref = collection(db, 'solicitudes', miUidFirebase, 'pendientes');
  const q = query(ref, orderBy('ts', 'desc'));

  solicitudesUnsub = onSnapshot(q, snapshot => {
    const pendientes = [];
    snapshot.forEach(docSnap => {
      pendientes.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Notificar a la UI
    if (window._fbOnSolicitudes) window._fbOnSolicitudes(pendientes);
  }, err => {
    console.error('[Firebase] Error al escuchar solicitudes:', err);
  });
}

// Suscribirse a lista de amigos
export function suscribirAmigos() {
  if (!miUidFirebase) return;
  if (amigosUnsub) { amigosUnsub(); amigosUnsub = null; }

  const ref = collection(db, 'amigos', miUidFirebase, 'lista');
  const q = query(ref, orderBy('desde', 'asc'));

  amigosUnsub = onSnapshot(q, snapshot => {
    const amigos = [];
    snapshot.forEach(docSnap => {
      amigos.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Notificar a la UI
    if (window._fbOnAmigos) window._fbOnAmigos(amigos);
  }, err => {
    console.error('[Firebase] Error al escuchar amigos:', err);
  });
}

// Obtener info de un usuario por UID (email desde Firestore)
export async function obtenerInfoUsuario(uid) {
  try {
    // Intentar obtener de la colección de usuarios (si existe)
    const userDoc = await getDocs(query(collection(db, 'usuarios'), where('uid', '==', uid), limit(1)));
    if (!userDoc.empty) {
      return userDoc.docs[0].data();
    }
    return null;
  } catch (err) {
    console.error('[Firebase] Error al obtener info usuario:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PRESENCIA (quién está en cada sala, sin depender de Socket.IO)
// ═══════════════════════════════════════════════════════════════════════════════

// Entrar a presencia: escribe un doc en presencia/{uid} con la sala actual
export async function entrarPresencia(sala) {
  if (!firebaseReady || !miUidFirebase) return;
  try {
    presenciaDocRef = doc(db, 'presencia', miUidFirebase);
    await setDoc(presenciaDocRef, {
      uid: miUidFirebase,
      username: miNombreFirebase,
      sala: sala,
      lastSeen: serverTimestamp()
    });
    console.log(`[Presencia] Entró a #${sala}`);
  } catch (err) {
    console.error('[Presencia] Error al entrar:', err);
  }
}

// Cambiar de sala en presencia
export async function cambiarPresenciaSala(sala) {
  if (!firebaseReady || !miUidFirebase) return;
  try {
    const ref = doc(db, 'presencia', miUidFirebase);
    await setDoc(ref, {
      uid: miUidFirebase,
      username: miNombreFirebase,
      sala: sala,
      lastSeen: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('[Presencia] Error al cambiar sala:', err);
  }
}

// Salir de presencia (al cerrar sesión o desconectar)
export async function salirPresencia() {
  if (presenciaUnsub) { presenciaUnsub(); presenciaUnsub = null; }
  if (!firebaseReady || !miUidFirebase) return;
  try {
    const ref = doc(db, 'presencia', miUidFirebase);
    await deleteDoc(ref);
    console.log('[Presencia] Salió');
  } catch (err) {
    console.error('[Presencia] Error al salir:', err);
  }
  presenciaDocRef = null;
}

// Suscribirse a cambios de presencia en una sala → callback(miembros[])
export function suscribirPresencia(sala, callback) {
  if (presenciaUnsub) { presenciaUnsub(); presenciaUnsub = null; }

  const ref = collection(db, 'presencia');
  // Limpiar docs viejos (>2 min sin heartbeat) y filtrar por sala
  const hace2min = new Date(Date.now() - 2 * 60 * 1000);

  presenciaUnsub = onSnapshot(ref, snapshot => {
    const miembros = [];
    const seen = new Set();
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      // Ignorar docs viejos (usuarios que cerraron sin limpiar)
      if (!d.lastSeen) return;
      const ts = d.lastSeen.toDate ? d.lastSeen.toDate() : new Date(d.lastSeen);
      if (ts < hace2min) return;
      // Solo miembros de esta sala
      if (d.sala !== sala) return;
      // Deduplicar por uid
      const key = d.uid || d.username;
      if (seen.has(key)) return;
      seen.add(key);
      miembros.push({ username: d.username, uid: d.uid || '' });
    });
    if (callback) callback(miembros);
  }, err => {
    console.error('[Presencia] Error al escuchar:', err);
  });

  // Heartbeat: actualizar lastSeen cada 30s
  const heartbeat = setInterval(() => {
    if (!firebaseReady || !miUidFirebase) { clearInterval(heartbeat); return; }
    const ref = doc(db, 'presencia', miUidFirebase);
    setDoc(ref, { lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
  }, 30000);

  // Guardar el intervalo para limpiarlo en salirPresencia
  presenciaUnsub._heartbeat = heartbeat;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MENSAJES DEL SISTEMA (join/leave) vía Firestore
// ═══════════════════════════════════════════════════════════════════════════════

// Enviar mensaje del sistema a una sala (se renderiza como burbuja "sistema")
export async function enviarMensajeSistema(sala, texto) {
  if (!firebaseReady) return;
  try {
    await addDoc(collection(db, 'salas', sala, 'mensajes'), {
      usuario: '',
      mensaje: texto,
      tipo: 'sistema',
      ts: serverTimestamp(),
      _socketId: ''
    });
  } catch (err) {
    console.error('[Sistema] Error al enviar mensaje del sistema:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORTAR A chat.js (bridge)
// ═══════════════════════════════════════════════════════════════════════════════
window._fbGuardarMensaje     = guardarMensaje;
window._fbSuscribirSala      = suscribirSala;
window._fbGuardarSala        = guardarSala;
window._fbEliminarSala       = eliminarSala;
window._fbSuscribirSalas     = suscribirSalas;
window._fbSalasFijas         = SALAS_FIJAS;

window._fbSuscribirDM        = suscribirDM;
window._fbCancelarSuscripcionDM = cancelarSuscripcionDM;
window._fbEnviarDM           = enviarDM;
window._fbEnviarSolicitud    = enviarSolicitudAmistad;
window._fbResponderSolicitud = responderSolicitud;
window._fbEliminarAmigo      = eliminarAmigo;
window._fbObtenerInfoUsuario = obtenerInfoUsuario;

// Presencia y sistema (GitHub Pages / sin Socket.IO)
window._fbEntrarPresencia       = entrarPresencia;
window._fbCambiarPresenciaSala  = cambiarPresenciaSala;
window._fbSalirPresencia        = salirPresencia;
window._fbSuscribirPresencia    = suscribirPresencia;
window._fbEnviarMensajeSistema  = enviarMensajeSistema;

console.log('[Firebase] firebase-chat.js v9 cargado (Presencia, Sistema, DMs, Amigos, Auto-borrado 24h)');
