// ═══════════════════════════════════════════════════════════════════════════════
//  login.js  —  Autenticación con Firebase (email/password) para Superchat
// ═══════════════════════════════════════════════════════════════════════════════

import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from './firebase-config.js?v=4';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const regName = document.getElementById('reg-name');
const regEmail = document.getElementById('reg-email');
const regPassword = document.getElementById('reg-password');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const loginSubmit = document.getElementById('login-submit');
const registerSubmit = document.getElementById('register-submit');
const loginLoading = document.getElementById('login-loading');
const themeBtn = document.getElementById('theme-btn');
const iconMoon = document.getElementById('icon-moon');
const iconSun = document.getElementById('icon-sun');

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

// ─── SWITCH TABS ──────────────────────────────────────────────────────────────
function switchTab(tab) {
  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.style.display = '';
    registerForm.style.display = 'none';
    loginError.textContent = '';
    registerError.textContent = '';
  } else {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.style.display = '';
    loginForm.style.display = 'none';
    loginError.textContent = '';
    registerError.textContent = '';
  }
}

tabLogin.addEventListener('click', () => switchTab('login'));
tabRegister.addEventListener('click', () => switchTab('register'));

// ─── LOADING STATE ────────────────────────────────────────────────────────────
function setLoading(loading) {
  loginLoading.style.display = loading ? 'flex' : 'none';
  loginForm.querySelectorAll('input, button').forEach(el => el.disabled = loading);
  registerForm.querySelectorAll('input, button').forEach(el => el.disabled = loading);
}

// ─── HELPER: marcar campo como inválido ──────────────────────────────────────
function markInvalid(input, message) {
  const field = input.closest('.login-field');
  if (!field) return;
  field.classList.add('field-invalid');
  const existing = field.querySelector('.field-hint');
  if (existing) existing.remove();
  const hint = document.createElement('span');
  hint.className = 'field-hint';
  hint.textContent = message;
  field.appendChild(hint);
  input.focus();
  // Quitar la marca al empezar a escribir
  input.addEventListener('input', function onInput() {
    field.classList.remove('field-invalid');
    const h = field.querySelector('.field-hint');
    if (h) h.remove();
    input.removeEventListener('input', onInput);
  }, { once: true });
}

function clearAllMarks() {
  document.querySelectorAll('.field-invalid').forEach(el => el.classList.remove('field-invalid'));
  document.querySelectorAll('.field-hint').forEach(el => el.remove());
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAllMarks();
  loginError.textContent = '';
  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email && !password) {
    markInvalid(loginEmail, 'Introduce tu correo');
    markInvalid(loginPassword, 'Introduce tu contraseña');
    return;
  }
  if (!email) {
    markInvalid(loginEmail, 'Introduce tu correo');
    return;
  }
  if (!password) {
    markInvalid(loginPassword, 'Introduce tu contraseña');
    return;
  }

  setLoading(true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error('[Login] Error:', err.code);
    switch (err.code) {
      case 'auth/user-not-found':
        markInvalid(loginEmail, 'No hay cuenta con este correo');
        break;
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        markInvalid(loginPassword, 'Contraseña incorrecta');
        break;
      case 'auth/invalid-email':
        markInvalid(loginEmail, 'Correo electrónico inválido');
        break;
      case 'auth/too-many-requests':
        loginError.textContent = 'Demasiados intentos. Intenta más tarde.';
        break;
      default:
        loginError.textContent = 'Error al iniciar sesión. Verifica tus datos.';
    }
    setLoading(false);
  }
});

// ─── REGISTER ─────────────────────────────────────────────────────────────────
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAllMarks();
  registerError.textContent = '';
  const name = regName.value.trim();
  const email = regEmail.value.trim();
  const password = regPassword.value;

  if (!name && !email && !password) {
    markInvalid(regName, 'Elige un nombre de usuario');
    markInvalid(regEmail, 'Introduce tu correo');
    markInvalid(regPassword, 'Crea una contraseña');
    return;
  }
  if (!name) {
    markInvalid(regName, 'Elige un nombre de usuario');
    return;
  }
  if (!email) {
    markInvalid(regEmail, 'Introduce tu correo');
    return;
  }
  if (!password) {
    markInvalid(regPassword, 'Crea una contraseña');
    return;
  }

  if (name.length < 2 || name.length > 30) {
    markInvalid(regName, 'Entre 2 y 30 caracteres');
    return;
  }

  if (password.length < 6) {
    markInvalid(regPassword, 'Mínimo 6 caracteres');
    return;
  }

  setLoading(true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Guardar el nombre de usuario en el perfil de Firebase
    await cred.user.updateProfile({ displayName: name });
    // Redirigir al chat (onAuthStateChanged se encarga)
  } catch (err) {
    console.error('[Register] Error:', err.code);
    switch (err.code) {
      case 'auth/email-already-in-use':
        registerError.textContent = 'Este correo ya está registrado.';
        break;
      case 'auth/invalid-email':
        registerError.textContent = 'Correo electrónico inválido.';
        break;
      case 'auth/weak-password':
        registerError.textContent = 'La contraseña es muy débil.';
        break;
      default:
        registerError.textContent = 'Error al crear la cuenta. Intenta de nuevo.';
    }
    setLoading(false);
  }
});

// ─── AUTH STATE OBSERVER ──────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Usuario autenticado → redirigir al chat
    console.log('[Login] Usuario autenticado:', user.email);
    window.location.href = 'index.html';
  }
});

// ─── KEYBOARD: Enter en inputs cambia de tab ──────────────────────────────────
loginPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginForm.dispatchEvent(new Event('submit'));
});
regPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') registerForm.dispatchEvent(new Event('submit'));
});

// ─── MOUSE PARALLAX ──────────────────────────────────────────────────────────
(function initParallax() {
  const parallax = document.getElementById('login-bg-parallax');
  if (!parallax) return;

  // Collect all orb wrappers with their individual intensities
  const orbs = [];
  parallax.querySelectorAll('.orb-wrap').forEach((wrap) => {
    const intensity = parseFloat(wrap.dataset.intensity) || 1;
    orbs.push({ el: wrap, intensity, x: 0, y: 0 });
  });

  let targetX = 0, targetY = 0;
  let currentX = 0, currentY = 0;

  document.addEventListener('mousemove', (e) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    targetX = (e.clientX - cx) / cx;
    targetY = (e.clientY - cy) / cy;
  });

  function animate() {
    // Smooth interpolation (higher lerp = more fluid follow)
    currentX += (targetX - currentX) * 0.1;
    currentY += (targetY - currentY) * 0.1;

    // Move the whole parallax container
    const baseX = currentX * 35;
    const baseY = currentY * 35;
    parallax.style.transform = `translate(${baseX}px, ${baseY}px)`;

    // Move each orb individually via CSS custom properties for extra depth
    for (const orb of orbs) {
      orb.x += ((currentX * orb.intensity * 50) - orb.x) * 0.12;
      orb.y += ((currentY * orb.intensity * 50) - orb.y) * 0.12;
      orb.el.style.setProperty('--px', orb.x.toFixed(1) + 'px');
      orb.el.style.setProperty('--py', orb.y.toFixed(1) + 'px');
    }

    requestAnimationFrame(animate);
  }
  animate();
})();

// ─── CLICK RIPPLE / PARTICLE BURST ──────────────────────────────────────────
(function initClickEffect() {
  const bg = document.getElementById('login-bg');
  if (!bg) return;

  const colors = [
    'rgba(0, 122, 255, 0.6)',   // azul
    'rgba(52, 199, 89, 0.6)',   // verde
    'rgba(255, 45, 85, 0.5)',   // rojo
    'rgba(255, 149, 0, 0.5)',   // naranja
    'rgba(175, 82, 222, 0.5)',  // púrpura
    'rgba(90, 200, 250, 0.5)',  // celeste
    'rgba(255, 255, 255, 0.3)', // blanco
  ];

  function spawnEffect(x, y) {
    // ── Expanding ring ──
    const ring = document.createElement('div');
    ring.className = 'click-ring';
    ring.style.left = x + 'px';
    ring.style.top = y + 'px';
    ring.style.borderColor = colors[Math.floor(Math.random() * colors.length)];
    bg.appendChild(ring);
    setTimeout(() => ring.remove(), 800);

    // ── Particle burst ──
    const count = 14 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'click-particle';
      const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.4;
      const dist = 60 + Math.random() * 100;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const size = 4 + Math.random() * 8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.background = color;
      p.style.setProperty('--dx', dx + 'px');
      p.style.setProperty('--dy', dy + 'px');
      bg.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }
  }

  // Escuchar clicks en todo el documento, pero solo disparar el efecto
  // si el click fue directamente sobre el fondo o áreas no interactivas
  document.addEventListener('click', (e) => {
    // Ignorar clicks en inputs, botones, la tarjeta de login, el header, etc.
    const el = e.target;
    if (el.closest('#login-card') || el.closest('header') || el.closest('button') || el.closest('input')) return;
    spawnEffect(e.clientX, e.clientY);
  });
})();

console.log('[Login] login.js cargado correctamente');
