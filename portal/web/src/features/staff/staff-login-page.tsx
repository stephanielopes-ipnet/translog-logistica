import { KeyRound, Loader2, Lock, LogIn, Sparkles, TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useDemoLogin, useLogin, useSession } from "@/api/session.ts";
import { Link } from "@/lib/use-location.tsx";
import { loginErrorMessage } from "./login-errors.ts";

/**
 * Login do colaborador (`/colaborador/entrar`). Depois de entrar, a guarda leva à página pedida
 * ou à Torre. "Entrar como demonstração" só aparece com a demonstração ligada na API.
 */
export function StaffLoginPage({ expired }: { expired: boolean }) {
  const session = useSession();
  const login = useLogin();
  const demo = useDemoLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [missing, setMissing] = useState(false);

  const error = login.error ?? demo.error;
  const busy = login.isPending || demo.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setMissing(true);
      return;
    }
    setMissing(false);
    demo.reset();
    login.mutate({ email: email.trim(), password });
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-14">
      <section className="mx-auto max-w-[420px] bg-surface border border-slate-300/90 rounded-lg shadow-sm overflow-hidden">
        <div className="h-[3px] flex">
          <div className="w-16 bg-accent" />
          <div className="flex-1 bg-primary" />
        </div>
        <div className="px-7 pt-6 pb-7">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-md bg-primary-50 text-primary grid place-items-center">
              <Lock aria-hidden="true" className="w-[18px] h-[18px]" />
            </span>
            <div>
              <p className="label-mono">Área do colaborador</p>
              <h1 className="text-lg font-semibold text-slate-900">
                Acesso restrito à equipe TransLog.
              </h1>
            </div>
          </div>

          {expired && (
            <p
              role="status"
              className="mt-5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-start gap-2"
            >
              <TriangleAlert aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0" />
              Sua sessão expirou. Entre novamente para continuar.
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
            <div>
              <label htmlFor="staffEmail" className="label-mono block mb-1.5">
                E-mail corporativo
              </label>
              <input
                id="staffEmail"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@translog.com"
                className="w-full h-10 rounded-md border border-slate-300 bg-slate-50/60 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
              />
            </div>
            <div>
              <label htmlFor="staffPassword" className="label-mono block mb-1.5">
                Senha
              </label>
              <input
                id="staffPassword"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full h-10 rounded-md border border-slate-300 bg-slate-50/60 px-3 text-sm text-slate-900 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
              />
            </div>

            {(missing || error) && (
              <p role="alert" className="text-sm font-medium text-red-700">
                {missing ? "Informe o e-mail e a senha." : loginErrorMessage(error)}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full h-10 rounded-md bg-primary text-white text-sm font-semibold shadow-sm hover:bg-primary-700 disabled:opacity-60 inline-flex items-center justify-center gap-2 transition"
            >
              {login.isPending ? (
                <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn aria-hidden="true" className="w-4 h-4" />
              )}
              Entrar
            </button>
          </form>

          {session.data?.demoAvailable && (
            <div className="mt-5 pt-5 border-t border-dashed border-slate-200">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  login.reset();
                  demo.mutate();
                }}
                className="w-full h-10 rounded-md border border-slate-300 bg-surface text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 inline-flex items-center justify-center gap-2 transition"
              >
                {demo.isPending ? (
                  <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles aria-hidden="true" className="w-4 h-4 text-accent-700" />
                )}
                Entrar como demonstração
              </button>
              <p className="mt-2 text-xs text-slate-500 text-center">
                Usuário de demonstração, para a apresentação do projeto.
              </p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3 text-xs">
            <p className="text-slate-400 flex items-center gap-1.5">
              <KeyRound aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />O acesso é criado pela
              equipe do portal.
            </p>
            <Link href="/" className="whitespace-nowrap text-slate-500 hover:text-primary rounded">
              Voltar ao site
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
