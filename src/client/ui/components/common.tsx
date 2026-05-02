import type { ReactNode } from 'react';
import { statusOrder } from '../../domain/tracker';

export function Segmented({ value, options, onChange }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
      {options.map((option) => (
        <button
          key={option.value}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${value === option.value ? 'bg-white text-ink shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-ink dark:text-slate-400 dark:hover:text-white'}`}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SideMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' | 'warn' }) {
  const toneClass = tone === 'good' ? 'text-emerald-700 dark:text-emerald-300' : tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-ink dark:text-slate-100';
  return (
    <div className="rounded-lg border border-line bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export function EmptyState({ title, copy, actionLabel, onAction }: { title: string; copy: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-line bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-950">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{copy}</p>
      {actionLabel && onAction ? (
        <button className="button-secondary mt-4" type="button" onClick={onAction}>{actionLabel}</button>
      ) : null}
    </div>
  );
}

export function LoadingCards() {
  return (
    <>
      {[1, 2, 3].map((item) => <div className="h-36 animate-pulse rounded-xl border border-line bg-slate-50 dark:border-slate-800 dark:bg-slate-950" key={item} />)}
    </>
  );
}

export function LoadingColumns() {
  return (
    <>
      {statusOrder.map((status) => <div className="h-96 min-w-56 animate-pulse rounded-lg border border-line bg-slate-50 dark:border-slate-800 dark:bg-slate-950" key={status} />)}
    </>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm dark:bg-slate-950/70" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-xl border border-line bg-white p-5 shadow-calm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">x</button>
        </div>
        {children}
      </div>
    </div>
  );
}
