export type Status = 'to_do' | 'pending' | 'in_progress' | 'done'

export const STATUS_ORDER: Status[] = ['to_do', 'pending', 'in_progress', 'done']

export const STATUS_META: Record<Status, { label: string; badge: string; bar: string }> = {
  to_do: { label: 'To do', badge: 'bg-slate-100 text-slate-700 ring-slate-300', bar: 'bg-slate-400' },
  pending: { label: 'Pending', badge: 'bg-amber-50 text-amber-800 ring-amber-300', bar: 'bg-amber-400' },
  in_progress: { label: 'In progress', badge: 'bg-blue-50 text-blue-800 ring-blue-300', bar: 'bg-blue-500' },
  done: { label: 'Done', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-300', bar: 'bg-emerald-500' },
}
