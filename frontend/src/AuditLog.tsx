import { useEffect, useMemo, useState } from 'react'
import { api } from './api'

type Entry = {
  id: number
  taskId: string
  taskTitle: string
  actor: string
  action: 'create' | 'status_change' | 'delete'
  fromStatus: string | null
  toStatus: string
  createdAt: string
}

function sentence(e: Entry) {
  const at = new Date(e.createdAt).toLocaleString('id-ID')
  if (e.action === 'create') return `${e.actor} membuat Task "${e.taskTitle}" pada ${at}`
  if (e.action === 'delete') return `${e.actor} menghapus Task "${e.taskTitle}" pada ${at}`
  return `${e.actor} mengubah Task "${e.taskTitle}" dari ${e.fromStatus} ke ${e.toStatus} pada ${at}`
}

// Lists every Audit Log, including those of deleted Tasks; the filter is client-side.
export default function AuditLog({ taskId, onFilter }: { taskId: string; onFilter: (id: string) => void }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api<Entry[]>('/api/audit-logs')
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
  }, [])

  const tasks = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of entries) seen.set(e.taskId, e.taskTitle)
    return [...seen]
  }, [entries])

  const shown = taskId ? entries.filter((e) => e.taskId === taskId) : entries

  return (
    <section className="space-y-3">
      <label className="text-sm">
        Task{' '}
        <select className="border rounded px-2 py-1" value={taskId} onChange={(e) => onFilter(e.target.value)}>
          <option value="">Semua Task</option>
          {tasks.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert" className="rounded bg-red-100 text-red-800 px-3 py-2">{error}</p>}
      {!error && shown.length === 0 && <p className="text-sm text-gray-600">Belum ada Audit Log.</p>}
      <ol className="list-decimal pl-5 space-y-1 text-sm">
        {shown.map((e) => (
          <li key={e.id}>{sentence(e)}</li>
        ))}
      </ol>
    </section>
  )
}
