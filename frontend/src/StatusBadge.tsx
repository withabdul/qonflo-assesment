import { STATUS_META, STATUS_ORDER, type Status } from './status'

export function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${m.badge}`}>
      {m.label}
    </span>
  )
}

// Four segments, filled up to the current Status, so progress reads at a glance.
export function StatusProgress({ status }: { status: Status }) {
  const at = STATUS_ORDER.indexOf(status)
  return (
    <div className="flex gap-1" role="img" aria-label={`Step ${at + 1} of ${STATUS_ORDER.length}`}>
      {STATUS_ORDER.map((s, i) => (
        <span key={s} className={`h-1.5 w-8 rounded-full ${i <= at ? STATUS_META[status].bar : 'bg-slate-200'}`} />
      ))}
    </div>
  )
}
