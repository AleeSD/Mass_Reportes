// Mutex en memoria por tipo+fecha: evita que el scheduler y "Procesar ahora"
// escriban el mismo .xlsx a la vez. Compartido por api.js, scheduler.js y cli.js.

const running = new Map();

export class LockedError extends Error {
  constructor(key) {
    super(`Ya hay un proceso en curso para ${key}`);
    this.name = "LockedError";
    this.status = 409;
  }
}

export function lockKey(tipo, fecha) {
  return `${tipo}:${fecha}`;
}

export function isLocked(tipo, fecha) {
  return running.has(lockKey(tipo, fecha));
}

/** Ejecuta fn con el bloqueo tipo+fecha; si ya está tomado lanza LockedError. */
export async function withLock(tipo, fecha, fn) {
  const key = lockKey(tipo, fecha);
  if (running.has(key)) throw new LockedError(key);
  const promise = (async () => fn())();
  running.set(key, promise);
  try {
    return await promise;
  } finally {
    running.delete(key);
  }
}

export function runningLocks() {
  return [...running.keys()];
}
