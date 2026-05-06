import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, FileText, Library, LogOut, Moon, PanelRight, Sun, User } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { buildWorkspaceAuthState, fingerprintWorkspaceAuthState, hasMeaningfulWorkspaceAuthState, normalizeWorkspaceAuthState } from '../../domain/authState';
import { getGoogleAuthNotice, parseGoogleAuthResult } from '../../domain/auth';
import { getUsageCopy } from '../../domain/aiActions';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { AccountDialog, AuthDialog } from './dialogs';
import { useSession } from '../hooks';

export function Shell({ children }: { children: ReactNode }) {
  const session = useSession();
  const usage = session.data?.usage;
  const authenticated = Boolean(session.data?.authenticated);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = useWorkspaceStore(
    useShallow((state) => ({
      markdown: state.markdown,
      selectedCvId: state.selectedCvId,
      editorMode: state.editorMode,
      rightPanel: state.rightPanel,
      suggestionsOpen: state.suggestionsOpen,
      design: state.design,
      aiArtifacts: state.aiArtifacts
    }))
  );
  const isWorkspaceRoute = !['/library', '/tracker'].includes(location.pathname);
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const savedTheme = window.localStorage.getItem('cv-studio-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return 'light';
  });
  const [banner, setBanner] = useState('');
  const syncTimerRef = useRef<number | null>(null);
  const lastSyncedFingerprintRef = useRef('');
  const syncInFlightRef = useRef(false);
  const remoteHydratedFingerprintRef = useRef('');
  const workspaceSnapshot = useMemo(() => buildWorkspaceAuthState(workspace), [workspace]);
  const workspaceFingerprint = useMemo(() => fingerprintWorkspaceAuthState(workspaceSnapshot), [workspaceSnapshot]);
  const remoteSnapshot = useMemo(() => normalizeWorkspaceAuthState(session.data?.state), [session.data?.state]);
  const remoteFingerprint = useMemo(() => fingerprintWorkspaceAuthState(remoteSnapshot), [remoteSnapshot]);
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      setAccountOpen(false);
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    window.localStorage.setItem('cv-studio-theme', theme);
  }, [theme]);

  useEffect(() => {
    const result = parseGoogleAuthResult(location.search);
    if (!result) return;

    setBanner(getGoogleAuthNotice(result));
    queryClient.invalidateQueries({ queryKey: ['session'] });
    navigate({ pathname: location.pathname }, { replace: true });

    const timer = window.setTimeout(() => setBanner(''), 6000);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search, navigate, queryClient]);

  useEffect(() => {
    if (!authenticated) {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }

      lastSyncedFingerprintRef.current = '';
      syncInFlightRef.current = false;
      remoteHydratedFingerprintRef.current = '';
      return;
    }

    if (remoteSnapshot && hasMeaningfulWorkspaceAuthState(remoteSnapshot) && !hasMeaningfulWorkspaceAuthState(workspaceSnapshot)) {
      if (remoteFingerprint && remoteHydratedFingerprintRef.current !== remoteFingerprint) {
        const store = useWorkspaceStore.getState();
        store.setMarkdown(remoteSnapshot.markdown);
        store.setSelectedCvId(remoteSnapshot.selectedCvId);
        store.setEditorMode(remoteSnapshot.editorMode);
        store.setRightPanel(remoteSnapshot.rightPanel);
        store.setSuggestionsOpen(remoteSnapshot.suggestionsOpen);
        store.setDesign(remoteSnapshot.design);
        store.setAiArtifacts(remoteSnapshot.aiArtifacts);

        remoteHydratedFingerprintRef.current = remoteFingerprint;
        lastSyncedFingerprintRef.current = remoteFingerprint;
      }

      return;
    }

    if (!hasMeaningfulWorkspaceAuthState(workspaceSnapshot)) {
      return;
    }

    if (workspaceFingerprint === lastSyncedFingerprintRef.current) {
      return;
    }

    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      if (!authenticated || syncInFlightRef.current) {
        return;
      }

      syncInFlightRef.current = true;
      void api.saveAuthState(workspaceSnapshot, workspaceSnapshot.updatedAt)
        .then(() => {
          lastSyncedFingerprintRef.current = workspaceFingerprint;
        })
        .catch(() => {
          // Keep the local state; the next successful refresh will retry the sync.
        })
        .finally(() => {
          syncInFlightRef.current = false;
        });
    }, 1200);

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [authenticated, remoteFingerprint, remoteSnapshot, workspaceFingerprint, workspaceSnapshot]);

  return (
    <div className="app-shell min-h-screen bg-mist pb-20 text-ink transition-colors dark:bg-slate-950 dark:text-slate-100 md:pb-0">
      <header className="app-topbar sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4">
          <NavLink to="/" className="flex items-center gap-3">
            <span className="app-logo-mark flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white">
              <img src="/favicon/apple-touch-icon.png" alt="" />
            </span>
            <span>
              <span className="app-logo-text block text-sm font-semibold leading-4">CV Studio</span>
              <span className="app-logo-subtitle block text-xs text-slate-500 dark:text-slate-400">quiet power for job search</span>
            </span>
          </NavLink>

          <nav className="ml-2 hidden items-center gap-1 rounded-lg border border-line bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900 md:flex">
            <TopLink to="/" icon={<PanelRight size={16} />} label="Editor" />
            <TopLink to="/library" icon={<Library size={16} />} label="CVs" />
            <TopLink to="/tracker" icon={<BriefcaseBusiness size={16} />} label="Tracker" />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:inline-flex">
              {getUsageCopy(usage)}
            </span>
            <button
              className="icon-button"
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="icon-button" type="button" onClick={() => setAccountOpen(true)} aria-label="Cuenta">
              <User size={18} />
            </button>
            {authenticated ? (
              <button className="button-secondary hidden sm:inline-flex" type="button" onClick={() => logout.mutate()}>
                <LogOut size={16} /> Salir
              </button>
            ) : (
              <button className="button-primary" type="button" onClick={() => setAuthOpen(true)}>
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      {banner ? (
        <div className={`mt-4 px-4 ${isWorkspaceRoute ? 'w-full' : 'mx-auto max-w-[1500px]'}`}>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
            <span>{banner}</span>
            <button className="text-xs font-semibold uppercase tracking-wide text-emerald-700" type="button" onClick={() => setBanner('')}>
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      <main className={isWorkspaceRoute ? 'w-full px-0 py-0' : 'mx-auto max-w-[1500px] px-4 py-4'}>{children}</main>
      <nav className="fixed bottom-3 left-3 right-3 z-30 grid grid-cols-3 rounded-xl border border-line bg-white/95 p-1 shadow-calm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:hidden">
        <MobileLink to="/" icon={<PanelRight size={17} />} label="Editor" />
        <MobileLink to="/library" icon={<Library size={17} />} label="CVs" />
        <MobileLink to="/tracker" icon={<BriefcaseBusiness size={17} />} label="Tracker" />
      </nav>
      {authOpen ? <AuthDialog onClose={() => setAuthOpen(false)} /> : null}
      {accountOpen ? <AccountDialog usage={usage} authenticated={authenticated} onClose={() => setAccountOpen(false)} onLogin={() => setAuthOpen(true)} /> : null}
    </div>
  );
}

function TopLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-white text-ink shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:bg-white hover:text-ink dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function MobileLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex min-h-11 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${
          isActive ? 'bg-slate-950 text-white dark:bg-cyan-400 dark:text-slate-950' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
