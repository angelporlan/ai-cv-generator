import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Loader2, Lock, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, type Usage } from '../../api/client';
import { getUsageCopy } from '../../domain/aiActions';
import { AiPanel } from './AiPanel';
import { Modal } from './common';
import { getErrorMessage } from '../hooks';

const authSchema = z.object({
  email: z.string().email('Introduce un email valido'),
  password: z.string().min(8, 'Minimo 8 caracteres')
});

type AuthForm = z.infer<typeof authSchema>;

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const queryClient = useQueryClient();
  const form = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '' }
  });
  const mutation = useMutation({
    mutationFn: (input: AuthForm) => mode === 'login' ? api.login(input.email, input.password) : api.register(input.email, input.password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      onClose();
    }
  });

  return (
    <Modal title="Acceso a tu espacio" onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 rounded-lg border border-line bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
        <button className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'login' ? 'bg-white shadow-sm dark:bg-slate-800' : 'text-slate-600 dark:text-slate-400'}`} type="button" onClick={() => setMode('login')}>Entrar</button>
        <button className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'register' ? 'bg-white shadow-sm dark:bg-slate-800' : 'text-slate-600 dark:text-slate-400'}`} type="button" onClick={() => setMode('register')}>Crear cuenta</button>
      </div>
      <form className="space-y-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
        <label className="block">
          <span className="label">Email</span>
          <input className="field mt-1" type="email" autoComplete="email" {...form.register('email')} />
          {form.formState.errors.email ? <span className="form-error">{form.formState.errors.email.message}</span> : null}
        </label>
        <label className="block">
          <span className="label">Contrasena</span>
          <input className="field mt-1" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} {...form.register('password')} />
          {form.formState.errors.password ? <span className="form-error">{form.formState.errors.password.message}</span> : null}
        </label>
        {mutation.error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{getErrorMessage(mutation.error)}</div> : null}
        <button className="button-primary w-full" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Lock size={16} />}
          {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
        <button className="button-secondary w-full" type="button" onClick={() => api.startGoogleLogin()}>
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.35 11.1h-9.18v2.98h5.3c-.23 1.31-.98 2.42-2.07 3.17v2.63h3.35c1.96-1.8 3.1-4.45 3.1-7.61 0-.75-.07-1.48-.2-2.17z" />
            <path d="M12.17 22c2.64 0 4.85-.87 6.47-2.36l-3.35-2.63c-.93.63-2.12 1-3.12 1-2.39 0-4.42-1.61-5.14-3.78H3.6v2.7C5.2 19.59 8.37 22 12.17 22z" />
            <path d="M7.03 14.23a5.94 5.94 0 0 1 0-4.46V7.07H3.6a10 10 0 0 0 0 8.89l3.43-1.73z" />
            <path d="M12.17 5.88c1.43 0 2.72.49 3.74 1.47l2.81-2.82C17.02 2.95 14.8 2 12.17 2 8.37 2 5.2 4.41 3.6 7.07l3.43 2.7c.72-2.17 2.75-3.89 5.14-3.89z" />
          </svg>
          Continuar con Google
        </button>
      </form>
    </Modal>
  );
}

export function AccountDialog({ usage, authenticated, onClose, onLogin }: {
  usage?: Usage | null;
  authenticated: boolean;
  onClose: () => void;
  onLogin: () => void;
}) {
  const checkout = useMutation({
    mutationFn: api.createCheckout,
    onSuccess: (payload) => { window.location.href = payload.url; }
  });
  const portal = useMutation({
    mutationFn: api.createBillingPortal,
    onSuccess: (payload) => { window.location.href = payload.url; }
  });

  return (
    <Modal title="Cuenta y plan" onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="eyebrow">Estado</p>
          <p className="mt-1 text-lg font-semibold">{authenticated ? usage?.billing?.isActive ? 'Plan Pro' : 'Plan gratis' : 'Sin sesion'}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{getUsageCopy(usage)}</p>
        </div>
        {!authenticated ? (
          <button className="button-primary w-full" type="button" onClick={() => { onClose(); onLogin(); }}>Entrar</button>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="button-primary" type="button" onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              <CreditCard size={16} /> Mejorar
            </button>
            <button className="button-secondary" type="button" onClick={() => portal.mutate()} disabled={portal.isPending}>
              Billing
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function AiDialog(props: { markdown: string; usage?: Usage | null; authenticated: boolean; onApply: (markdown: string) => void; onClose: () => void }) {
  return (
    <Modal title="Asistente de IA" onClose={props.onClose}>
      <AiPanel {...props} />
    </Modal>
  );
}

export function LinkedInDialog({ onApply, onClose }: { onApply: (markdown: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.importLinkedIn(text),
    onSuccess: (payload) => {
      onApply(payload.markdown);
      queryClient.invalidateQueries({ queryKey: ['session'] });
      onClose();
    }
  });

  return (
    <Modal title="Importar LinkedIn" onClose={onClose}>
      <label className="block">
        <span className="label">Texto del perfil</span>
        <textarea className="field mt-1 min-h-52" value={text} onChange={(event) => setText(event.target.value)} placeholder="Pega aqui el texto de tu perfil..." />
      </label>
      {mutation.error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{getErrorMessage(mutation.error)}</div> : null}
      <button className="button-primary mt-4 w-full" type="button" disabled={!text.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
        Procesar perfil
      </button>
    </Modal>
  );
}
