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
      <div className="mb-4 grid grid-cols-2 rounded-lg border border-line bg-slate-50 p-1">
        <button className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'login' ? 'bg-white shadow-sm' : 'text-slate-600'}`} type="button" onClick={() => setMode('login')}>Entrar</button>
        <button className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'register' ? 'bg-white shadow-sm' : 'text-slate-600'}`} type="button" onClick={() => setMode('register')}>Crear cuenta</button>
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
        {mutation.error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{getErrorMessage(mutation.error)}</div> : null}
        <button className="button-primary w-full" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Lock size={16} />}
          {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
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
        <div className="rounded-lg border border-line bg-slate-50 p-4">
          <p className="eyebrow">Estado</p>
          <p className="mt-1 text-lg font-semibold">{authenticated ? usage?.billing?.isActive ? 'Plan Pro' : 'Plan gratis' : 'Sin sesion'}</p>
          <p className="mt-1 text-sm text-slate-600">{getUsageCopy(usage)}</p>
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
      {mutation.error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{getErrorMessage(mutation.error)}</div> : null}
      <button className="button-primary mt-4 w-full" type="button" disabled={!text.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
        Procesar perfil
      </button>
    </Modal>
  );
}
