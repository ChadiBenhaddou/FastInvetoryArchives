import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useT } from '../i18n';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
    primary: 'bg-amber-500 text-stone-950 active:bg-amber-400',
    secondary: 'bg-stone-800 text-stone-100 active:bg-stone-700',
    danger: 'bg-red-700 text-white active:bg-red-600',
    ghost: 'bg-transparent text-stone-300 active:bg-stone-800',
};

/** Large, thumb-friendly button (min 64 px high). */
export function BigButton({
    variant = 'primary',
    className = '',
    icon,
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: ReactNode }) {
    return (
        <button
            {...props}
            className={`flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl px-5 text-xl font-semibold disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
        >
            {icon}
            {children}
        </button>
    );
}

export function Screen({ title, onBack, children, footer }: { title: string; onBack?: () => void; children: ReactNode; footer?: ReactNode }) {
    const t = useT();
    return (
        <div className="flex h-full flex-col">
            <header className="flex items-center gap-3 border-b border-stone-800 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
                {onBack && (
                    <button onClick={onBack} aria-label={t('back')} className="-ms-2 rounded-full p-2 active:bg-stone-800">
                        <ArrowLeft className="size-7 rtl:rotate-180" />
                    </button>
                )}
                <h1 className="truncate text-xl font-bold">{title}</h1>
            </header>
            <main className="flex-1 space-y-4 overflow-y-auto p-4">{children}</main>
            {footer && <footer className="space-y-3 border-t border-stone-800 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">{footer}</footer>}
        </div>
    );
}

/** A box code is always displayed left-to-right, even in Arabic. */
export function Code({ code, className = '' }: { code: string; className?: string }) {
    return (
        <span dir="ltr" className={`font-mono font-bold tracking-wider ${className}`}>
            {code}
        </span>
    );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <section className={`rounded-2xl bg-stone-900 p-4 ${className}`}>{children}</section>;
}

/**
 * A labelled form field. Use `group` when the field contains buttons: a <label>
 * would forward every tap on its text or gaps to its first button.
 */
export function Field({ label, children, group = false }: { label: string; children: ReactNode; group?: boolean }) {
    const caption = <span className="block text-sm text-stone-400">{label}</span>;
    return group ? (
        <div role="group" aria-label={label} className="space-y-1">
            {caption}
            {children}
        </div>
    ) : (
        <label className="block space-y-1">
            {caption}
            {children}
        </label>
    );
}

export const inputClass =
    'w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-3 text-lg text-stone-100 focus:border-amber-500 focus:outline-none';

export function formatBytes(bytes: number): string {
    const units = ['o', 'Ko', 'Mo', 'Go'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`;
}
