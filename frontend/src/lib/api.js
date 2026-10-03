export async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(body.error || "Error de API");
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function cn(...args) {
  return args.filter(Boolean).join(" ");
}
