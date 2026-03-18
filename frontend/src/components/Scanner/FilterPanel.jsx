import { useState } from 'react'
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

export function FilterPanel({ filters, onChange, onApply, fields }) {
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState(filters)

  const handleChange = (key, value) => setLocal((p) => ({ ...p, [key]: value }))

  const handleApply = () => {
    onChange(local)
    onApply?.(local)
    setOpen(false)
  }

  const handleReset = () => {
    const defaults = {}
    fields.forEach((f) => { defaults[f.key] = f.default })
    setLocal(defaults)
  }

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg-card border border-bg-border text-text-secondary text-sm font-medium active:bg-bg-hover"
      >
        <SlidersHorizontal size={14} />
        Filters
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div className={clsx(
        'fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary border-t border-bg-border rounded-t-2xl',
        'transition-transform duration-300 ease-out',
        open ? 'translate-y-0' : 'translate-y-full'
      )}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold text-text-primary">Filters</span>
          <button onClick={() => setOpen(false)} className="p-1 text-text-muted">
            <X size={18} />
          </button>
        </div>

        {/* Fields */}
        <div className="px-4 pb-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {fields.map((field) => (
            <FilterField
              key={field.key}
              field={field}
              value={local[field.key]}
              onChange={(v) => handleChange(field.key, v)}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-4 pb-6 pt-2 border-t border-bg-border">
          <button
            onClick={handleReset}
            className="flex-1 py-2.5 rounded-xl border border-bg-border text-text-secondary text-sm font-medium"
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            className="flex-2 flex-grow py-2.5 rounded-xl bg-accent-blue text-white text-sm font-bold"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  )
}

function FilterField({ field, value, onChange }) {
  if (field.type === 'number') {
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-text-secondary text-sm">{field.label}</label>
          <span className="text-accent-blue font-mono text-sm">{value}{field.suffix}</span>
        </div>
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-bg-border rounded-full appearance-none cursor-pointer accent-accent-blue"
        />
        <div className="flex justify-between text-text-muted text-xs mt-1">
          <span>{field.min}{field.suffix}</span>
          <span>{field.max}{field.suffix}</span>
        </div>
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div>
        <label className="text-text-secondary text-sm block mb-1.5">{field.label}</label>
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-bg-card border border-bg-border rounded-xl px-3 py-2.5 text-text-primary text-sm appearance-none focus:outline-none focus:border-accent-blue"
          >
            {field.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
      </div>
    )
  }

  return null
}
