# Superchat 💬

Chat en tiempo real con **Socket.IO** + **Firebase** (Auth + Firestore).  
Soporta salas temáticas, mensajes de texto, imágenes, audios, modo oscuro y más.

## ✨ Características

- 🔐 **Autenticación** con Firebase (email/contraseña)
- 💬 **Chat en tiempo real** con Socket.IO
- 🏷️ **Salas temáticas** (General, Deportes, Películas, Videojuegos + crear salas personalizadas)
- 📷 **Envío de imágenes** con vista previa y lightbox
- 🎤 **Grabación y envío de audios**
- 🌙 **Modo oscuro / claro** con persistencia
- 👥 **Panel de miembros** en vivo por sala
- 🔔 **Notificaciones toast** y sonidos
- 💾 **Historial persistente** en Firestore
- 🎨 **Interfaz moderna** estilo Apple

## 🚀 Tecnologías

| Frontend | Backend | Base de datos / Auth |
|----------|---------|----------------------|
| HTML5 + CSS3 | Node.js + Express | Firebase Auth |
| JavaScript (ES Modules) | Socket.IO | Cloud Firestore |
| SweetAlert2 | | |
| Emoji Button | | |

## 📦 Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/superchat.git
cd superchat

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor
npm start
```

El servidor se ejecutará en `http://localhost:3000`.

## 🔧 Configuración

El proyecto ya incluye una configuración de Firebase funcional.  
Si deseas usar tu propio proyecto Firebase, edita el archivo `public/js/firebase-config.js` con tus credenciales:

```js
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.firebasestorage.app",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};
```

### Reglas de Firestore

Para que el historial funcione, despliega estas reglas en Firestore:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /salas/{sala}/mensajes/{mensaje} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 📁 Estructura del proyecto

```
Superchat/
├── .gitignore
├── package.json
├── README.md
├── server.js              # Servidor Express + Socket.IO
├── public/
│   ├── index.html         # Página principal del chat
│   ├── login.html         # Página de inicio de sesión
│   ├── css/
│   │   └── style.css      # Estilos completos
│   └── js/
│       ├── chat.js        # Lógica del chat (Socket.IO)
│       ├── login.js       # Lógica de autenticación
│       ├── firebase-config.js  # Configuración de Firebase
│       └── firebase-chat.js    # Integración Firebase + Socket.IO
```

## 🖥️ Uso

1. Abre `http://localhost:3000` en tu navegador
2. Crea una cuenta o inicia sesión
3. ¡Empieza a chatear! Selecciona una sala o crea una nueva
4. Adjunta imágenes, graba audios, usa emojis 🎉

## 📄 Licencia

ISC
