import { useEffect, useState, type FormEvent } from 'react'
import { api, send } from './api'
import AuditLog from './AuditLog'
import { EmptyState, ErrorAlert } from './Notice'
import { STATUS_META, type Status } from './status'
import { StatusBadge, StatusProgress } from './StatusBadge'

type Task = { id: string; title: string; status: Status }

const NEXT_STATUS: Partial<Record<Status, Status>> = {
  to_do: 'pending',
  pending: 'in_progress',
  in_progress: 'done',
}

export default function App() {
  const [tab, setTab] = useState<'tasks' | 'audit'>('tasks')
  const [auditTaskId, setAuditTaskId] = useState('')
  const [actors, setActors] = useState<string[]>([])
  const [actor, setActor] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState('')

  const loadTasks = () => api<Task[]>('/api/tasks').then(setTasks)

  useEffect(() => {
    api<string[]>('/api/users')
      .then((u) => {
        setActors(u)
        setActor(u[0] ?? '')
      })
      .then(loadTasks)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true))
  }, [])

  // Runs one user action. A rejected change usually means the list is stale, so refresh without masking the error.
  async function act(request: () => Promise<unknown>, onDone?: () => void) {
    setError('')
    try {
      await request()
      onDone?.()
      await loadTasks()
    } catch (err) {
      setError((err as Error).message)
      await loadTasks().catch(() => {})
    }
  }

  const create = (e: FormEvent) => {
    e.preventDefault()
    return act(() => send('POST', '/api/tasks', { title, actor }), () => setTitle(''))
  }

  const advance = (id: string, status: Status) =>
    act(() => send('PUT', `/api/tasks/${id}/status`, { status, actor }))

  const remove = (id: string) => {
    setConfirmId('')
    return act(() => send('DELETE', `/api/tasks/${id}`, { actor }))
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Mini Task Manager</h1>
            <p className="text-sm text-slate-500">Every Status change is recorded: who, when, from what to what.</p>
          </div>
          <label className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
            <span className="text-slate-500">Acting as</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1 font-medium"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            >
              {actors.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <nav className="inline-flex rounded-lg bg-slate-200/70 p-1" aria-label="Sections">
          {(
            [
              ['tasks', 'Tasks'],
              ['audit', 'Audit Log'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={tab === key ? 'page' : undefined}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        {error && <ErrorAlert message={error} />}

        {tab === 'audit' && <AuditLog taskId={auditTaskId} onFilter={setAuditTaskId} />}

        {tab === 'tasks' && (
          <>
            <form onSubmit={create} className="flex gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <input
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                placeholder="What needs to be done?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <button
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                type="submit"
              >
                Add task
              </button>
            </form>

            {!loaded && <p className="text-sm text-slate-500">Loading tasks…</p>}
            {loaded && tasks.length === 0 && <EmptyState>No tasks yet. Add the first one above.</EmptyState>}

            <ul className="space-y-3">
              {tasks.map((t) => {
                const next = NEXT_STATUS[t.status]
                return (
                  <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <h2 className="break-words font-medium">{t.title}</h2>
                        <StatusProgress status={t.status} />
                      </div>
                      <StatusBadge status={t.status} />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <div className="flex items-center gap-2">
                        {next ? (
                          <button
                            type="button"
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                            onClick={() => advance(t.id, next)}
                          >
                            Move to {STATUS_META[next].label}
                          </button>
                        ) : (
                          <span className="text-sm text-emerald-700">Completed</span>
                        )}
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                          onClick={() => {
                            setAuditTaskId(t.id)
                            setTab('audit')
                          }}
                        >
                          Audit Log
                        </button>
                      </div>

                      {confirmId === t.id ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-slate-600">Delete this task?</span>
                          <button
                            type="button"
                            className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700"
                            onClick={() => remove(t.id)}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                            onClick={() => setConfirmId('')}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="rounded-lg px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                          onClick={() => setConfirmId(t.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </main>
    </div>
  )
}
