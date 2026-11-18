import { ArrowRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/lib/use-location.tsx";

interface SimplePageProps {
  label: string;
  title: string;
  children?: ReactNode;
}

/** Cartão centralizado para páginas curtas (não encontrado, carregando, avisos). */
export function SimplePage({ label, title, children }: SimplePageProps) {
  return (
    <div className="mx-auto max-w-[1440px] px-6 py-12">
      <section className="mx-auto max-w-xl bg-surface border border-slate-300/90 rounded-lg shadow-sm px-8 py-10 text-center">
        <p className="label-mono">{label}</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">{title}</h1>
        {children && <div className="mt-3 text-sm text-slate-600 space-y-4">{children}</div>}
      </section>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <SimplePage label="Erro 404" title="Página não encontrada">
      <p>O endereço não existe ou mudou.</p>
      <PrimaryLink href="/">Ir para o Início</PrimaryLink>
    </SimplePage>
  );
}

/** Enquanto a sessão do colaborador é conferida (antes de mostrar ou redirecionar). */
export function CheckingSessionPage() {
  return (
    <div className="mx-auto max-w-[1440px] px-6 py-16 flex justify-center">
      <p role="status" className="inline-flex items-center gap-2 text-sm text-slate-500">
        <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin text-primary" />
        Conferindo o acesso…
      </p>
    </div>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="h-10 px-5 rounded-md bg-primary text-white text-sm font-semibold shadow-sm hover:bg-primary-700 inline-flex items-center gap-2 transition"
    >
      {children}
      <ArrowRight aria-hidden="true" className="w-4 h-4" />
    </Link>
  );
}
