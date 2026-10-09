import { useEffect, useState, type FormEvent } from 'react'
import AuditLog from './AuditLog'

type Status = 'to_do' | 'pending' | 'in_progress' | 'done'
type Task = { id: string; title: string; status: Status }

const STATUS_STYLE: Record<Status, string> = {
  to_do: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
}

// Backend errors are shown as-is so the Actor sees why an action was rejected.
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body as T
}

export default function App() {
  const [actors, setActors] = useState<string[]>([])
  const [actor, setActor] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')

  const loadTasks = () => api<Task[]>('/api/tasks').then(setTasks)

  useEffect(() => {
    api<string[]>('/api/users')
      .then((u) => {
        setActors(u)
        setActor(u[0] ?? '')
      })
      .then(loadTasks)
      .catch((e: Error) => setError(e.message))
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, actor }),
      })
      setTitle('')
      await loadTasks()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function remove(id: string) {
    setError('')
    try {
      await api(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actor }),
      })
      await loadTasks()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mini Task Manager</h1>
        <label className="text-sm">
          Actor{' '}
          <select
            className="border rounded px-2 py-1"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          >
            {actors.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      </header>

      <form onSubmit={create} className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="rounded bg-black text-white px-4 py-2" type="submit">
          Create
        </button>
      </form>

      {error && <p role="alert" className="rounded bg-red-100 text-red-800 px-3 py-2">{error}</p>}

      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between border rounded px-3 py-2">
            <span>{t.title}</span>
            <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[t.status]}`}>{t.status}</span>
            <button type="button" className="text-sm text-red-700 underline" onClick={() => remove(t.id)}>
              Delete
            </button>
            <AuditLog taskId={t.id} refresh={t.status} />
          </li>
        ))}
      </ul>
    </main>
  )
}
