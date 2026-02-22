import React from 'react';
import { Loader2 } from 'lucide-react';

interface Props { text?: string; size?: 'sm' | 'md' | 'lg'; }

export default function LoadingSpinner({ text = 'Loading…', size = 'md' }: Props) {
    const s = size === 'lg' ? 32 : size === 'sm' ? 16 : 24;
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400 animate-fade-in">
            <Loader2 size={s} className="animate-spin text-brand-400" />
            {text && <span className="text-sm">{text}</span>}
        </div>
    );
}
