(function () {
  "use strict";

  const USERS_KEY = "admoney_usuarios";
  const LEGACY_USERS_KEY = "usuarios";
  const SESSION_KEY = "usuarioSesion";

  function randomHex(bytes = 16) {
    if (window.crypto && crypto.getRandomValues) {
      const arr = new Uint8Array(bytes);
      crypto.getRandomValues(arr);
      return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
    }
    return Array.from({ length: bytes * 2 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  }

  function fallbackHash(text) {
    let h1 = 0xdeadbeef ^ text.length;
    let h2 = 0x41c6ce57 ^ text.length;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
  }

  async function hashPassword(password, salt) {
    const value = `${salt}:${password}`;
    if (window.crypto?.subtle && window.TextEncoder) {
      try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
        const saltBytes = enc.encode(salt);
        const bits = await crypto.subtle.deriveBits(
          { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 120000 },
          key,
          256
        );
        return `pbkdf2:${Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, "0")).join("")}`;
      } catch (_) {}
    }
    return `fallback:${fallbackHash(value)}`;
  }

  function getUsers() {
    let users = [];
    try { users = JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch (_) {}
    if (!users.length) {
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_USERS_KEY)) || [];
        if (legacy.length) users = legacy.map(u => ({ ...u }));
      } catch (_) {}
    }
    return users;
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function publicUser(user) {
    return { id: user.id, nombre: user.nombre, correo: user.correo };
  }

  async function register(nombre, correo, password) {
    nombre = nombre.trim();
    correo = correo.trim().toLowerCase();
    if (!nombre || !correo || !password) throw new Error("Todos los campos son obligatorios.");
    if (!/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{6,}$/.test(password)) {
      throw new Error("La contraseña debe tener mínimo 6 caracteres, 1 mayúscula, 1 número y 1 carácter especial.");
    }
    const users = getUsers();
    if (users.some(u => String(u.correo).toLowerCase() === correo)) throw new Error("El correo electrónico ya está registrado.");
    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt);
    const user = { id: Date.now(), nombre, correo, salt, passwordHash, createdAt: new Date().toISOString() };
    users.push(user);
    saveUsers(users);
    return publicUser(user);
  }

  async function login(correo, password) {
    correo = correo.trim().toLowerCase();
    const users = getUsers();
    const user = users.find(u => String(u.correo).toLowerCase() === correo);
    if (!user) throw new Error("Correo o contraseña incorrectos.");

    let valid = false;
    if (user.passwordHash && user.salt) {
      valid = (await hashPassword(password, user.salt)) === user.passwordHash;
    } else if (typeof user.password === "string") {
      valid = user.password === password;
      if (valid) {
        user.salt = randomHex(16);
        user.passwordHash = await hashPassword(password, user.salt);
        delete user.password;
        saveUsers(users);
      }
    }
    if (!valid) throw new Error("Correo o contraseña incorrectos.");
    const session = publicUser(user);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function session() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (_) { return null; }
  }

  function logout() { sessionStorage.removeItem(SESSION_KEY); }

  function requireSession() {
    const current = session();
    if (!current) {
      window.location.replace("login.html");
      return null;
    }
    return current;
  }

  function redirectIfLogged() {
    if (session()) window.location.replace("dashboard.html");
  }

  window.AdMoneyAuth = { register, login, session, logout, requireSession, redirectIfLogged };
})();
