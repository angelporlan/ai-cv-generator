import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: api.getSession
  });
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la accion';
}
