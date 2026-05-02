export type GoogleAuthResult = 'success' | 'error' | null;

export function getGoogleLoginUrl() {
  return '/auth/google';
}

export function parseGoogleAuthResult(search: string): GoogleAuthResult {
  const params = new URLSearchParams(search);
  const auth = params.get('auth');

  if (auth === 'google_success') return 'success';
  if (auth === 'google_error') return 'error';
  return null;
}

export function getGoogleAuthNotice(result: GoogleAuthResult) {
  if (result === 'success') return 'Sesión iniciada con Google';
  if (result === 'error') return 'No se pudo completar el acceso con Google';
  return '';
}
