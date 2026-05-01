import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api, type Usage } from '../../api/client';
import { canUseAi, shouldPromptUpgrade } from '../../domain/access';
import { aiActions, getAiAction, type AiActionId } from '../../domain/aiActions';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { getErrorMessage } from '../hooks';

export function AiPanel({ markdown, usage, authenticated, onApply, inline = false }: {
  markdown: string;
  usage?: Usage | null;
  authenticated: boolean;
  onApply: (markdown: string) => void;
  inline?: boolean;
}) {
  const [actionId, setActionId] = useState<AiActionId>('adapt');
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const action = getAiAction(actionId);
  const queryClient = useQueryClient();
  const addAiArtifact = useWorkspaceStore((state) => state.addAiArtifact);
  const mutation = useMutation({
    mutationFn: () => api.adaptCv({ markdown, action: actionId, jobDescription: input }),
    onSuccess: (payload) => {
      addAiArtifact({
        action: actionId,
        title: action.label,
        content: payload.markdown,
        model: payload.model
      });
      onApply(payload.markdown);
      queryClient.invalidateQueries({ queryKey: ['session'] });
      setMessage('Resultado aplicado al editor');
    },
    onError: (error) => setMessage(getErrorMessage(error))
  });
  const locked = !canUseAi(authenticated, usage);

  return (
    <div className={inline ? 'mt-4 space-y-4' : 'space-y-4'}>
      <div className="grid grid-cols-2 gap-2">
        {aiActions.map((item) => (
          <button
            className={`rounded-lg border px-3 py-2 text-left text-sm transition ${item.id === actionId ? 'border-brand bg-blue-50 text-brand' : 'border-line bg-white hover:border-slate-300'}`}
            type="button"
            key={item.id}
            onClick={() => setActionId(item.id)}
          >
            <span className="block font-semibold">{item.shortLabel}</span>
            <span className="block text-xs text-slate-500">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-line bg-white p-4">
        <p className="text-sm font-semibold">{action.label}</p>
        <p className="mt-1 text-sm leading-5 text-slate-600">{action.description}</p>
      </div>
      <label className="block">
        <span className="label">{action.inputLabel}</span>
        <textarea className="field mt-1 min-h-32" value={input} onChange={(event) => setInput(event.target.value)} placeholder={action.placeholder} />
      </label>
      {locked ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {!authenticated ? 'Entra para usar IA.' : shouldPromptUpgrade(authenticated, usage) ? 'Has agotado los usos gratis.' : 'IA no disponible.'}
        </div>
      ) : null}
      {message ? <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm text-slate-700">{message}</div> : null}
      <button className="button-primary w-full" type="button" disabled={locked || mutation.isPending || (action.requiresInput && !input.trim())} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
        Aplicar IA
      </button>
    </div>
  );
}
