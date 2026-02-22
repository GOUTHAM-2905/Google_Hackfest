import React from 'react';

interface Props { title: string; subtitle?: string; actions?: React.ReactNode; }

export default function Header({ title, subtitle, actions }: Props) {
    return (
        <header className="flex items-center justify-between px-8 py-5 border-b border-surface-600 bg-surface-800/50 backdrop-blur-sm sticky top-0 z-30">
            <div>
                <h1 className="text-lg font-semibold text-white">{title}</h1>
                {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
        </header>
    );
}
