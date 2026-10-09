import { useEffect, useState } from 'react'

type Entry = {
  id: number
  actor: string
  action: 'create' | 'status_change' | 'delete'
  fromStatus: string | null
  toStatus: string
  createdAt: string
}

function sentence(e: Entry) {
  const at = new Date(e.createdAt).toLocaleString('id-ID')
  if (e.action === 'create') return `${e.actor} membuat Task pada ${at}`
  if (e.action === 'delete') return `${e.actor} menghapus Task pada ${at}`
  return `${e.actor} mengubah status dari ${e.fromStatus} ke ${e.toStatus} pada ${at}`
}

// `refresh` changes when the Task changes, so an open panel reloads its entries.
export default function AuditLog({ taskId, refresh }: { taskId: string; refresh: string }) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    fetch(`/api/tasks/${taskId}/audit-logs`)
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
        setEntries(body as Entry[])
        setError('')
      })
      .catch((e: Error) => setError(e.message))
  }, [open, taskId, refresh])

  return (
    <div className="basis-full text-sm">
      <button type="button" className="underline" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide history' : 'Show history'}
      </button>
      {open && (
        <ol className="mt-2 list-decimal pl-5 space-y-1">
          {error && <li className="text-red-800">{error}</li>}
          {entries.map((e) => (
            <li key={e.id}>{sentence(e)}</li>
          ))}
        </ol>
      )}
    </div>
  )
}
