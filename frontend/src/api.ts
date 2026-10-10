// Backend errors are shown as-is so the Actor sees why an action was rejected.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body as T
}

export const send = (method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown) =>
  api(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
