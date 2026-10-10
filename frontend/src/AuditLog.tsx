import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { EmptyState, ErrorAlert } from './Notice'
import { type Status } from './status'
import { StatusBadge } from './StatusBadge'

type Entry = {
  id: number
  taskId: string
  taskTitle: string
  actor: string
  action: 'create' | 'status_change' | 'delete'
  fromStatus: Status | null
  toStatus: Status
  createdAt: string
}

const DOT: Record<Entry['action'], string> = {
  create: 'bg-emerald-500',
  status_change: 'bg-blue-500',
  delete: 'bg-red-500',
}

const formatTime = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function Sentence({ e }: { e: Entry }) {
  const who = <strong className="font-semibold">{e.actor}</strong>
  const task = <span className="font-medium">"{e.taskTitle}"</span>
  if (e.action === 'create') return <>{who} created Task {task}</>
  if (e.action === 'delete') return <>{who} deleted Task {task}</>
  return (
    <>
      {who} changed Task {task} status from{' '}
      {e.fromStatus && <StatusBadge status={e.fromStatus} />} to <StatusBadge status={e.toStatus} />
    </>
  )
}

// Lists every Audit Log, including those of deleted Tasks; the filter is client-side.
export default function AuditLog({ taskId, onFilter }: { taskId: string; onFilter: (id: string) => void }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Entry[]>('/api/audit-logs')
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true))
  }, [])

  const tasks = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of entries) seen.set(e.taskId, e.taskTitle)
    return [...seen]
  }, [entries])

  const shown = taskId ? entries.filter((e) => e.taskId === taskId) : entries

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {shown.length} {shown.length === 1 ? 'entry' : 'entries'}, oldest first. Entries can never be edited or deleted.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Task</span>
          <select
            className="max-w-56 rounded-lg border border-slate-300 bg-white px-2 py-1.5"
            value={taskId}
            onChange={(e) => onFilter(e.target.value)}
          >
            <option value="">All tasks</option>
            {tasks.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!loaded && <p className="text-sm text-slate-500">Loading Audit Log…</p>}
      {loaded && !error && shown.length === 0 && <EmptyState>No Audit Log entries yet.</EmptyState>}
      {error && <ErrorAlert message={error} />}

      <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
        {shown.map((e) => (
          <li key={e.id} className="relative rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
            <span className={`absolute -left-[31px] top-4 h-3 w-3 rounded-full ring-4 ring-slate-50 ${DOT[e.action]}`} />
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 leading-6">
              <Sentence e={e} />
            </p>
            <time className="mt-1 block text-xs text-slate-500" dateTime={e.createdAt}>
              {formatTime(e.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  )
}
