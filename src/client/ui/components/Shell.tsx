import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, FileText, Library, LogOut, PanelRight, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../../api/client';
import { getUsageCopy } from '../../domain/aiActions';
import { AccountDialog, AuthDialog } from './dialogs';
import { useSession } from '../hooks';

export function Shell({ children }: { children: ReactNode }) {
  const session = useSession();
  const usage = session.data?.usage;
  const authenticated = Boolean(session.data?.authenticated);
  const queryClient = useQueryClient();
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      setAccountOpen(false);
    }
  });

  return (
    <div className="min-h-screen bg-mist pb-20 text-ink md:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4">
          <NavLink to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white">
              <FileText size={19} />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-4">CV Studio Pro</span>
              <span className="block text-xs text-slate-500">quiet power for job search</span>
            </span>
          </NavLink>

          <nav className="ml-2 hidden items-center gap-1 rounded-lg border border-line bg-slate-50 p-1 md:flex">
            <TopLink to="/" icon={<PanelRight size={16} />} label="Editor" />
            <TopLink to="/library" icon={<Library size={16} />} label="CVs" />
            <TopLink to="/tracker" icon={<BriefcaseBusiness size={16} />} label="Tracker" />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-slate-600 sm:inline-flex">
              {getUsageCopy(usage)}
            </span>
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

      <main className="mx-auto max-w-[1500px] px-4 py-4">{children}</main>
      <nav className="fixed bottom-3 left-3 right-3 z-30 grid grid-cols-3 rounded-xl border border-line bg-white/95 p-1 shadow-calm backdrop-blur md:hidden">
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
          isActive ? 'bg-white text-ink shadow-sm' : 'text-slate-600 hover:bg-white hover:text-ink'
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
          isActive ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
