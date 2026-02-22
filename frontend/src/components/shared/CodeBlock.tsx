import React from 'react';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface Props { code: string; language?: string; }

export default function CodeBlock({ code, language = 'sql' }: Props) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="relative group">
            <div className="flex items-center justify-between px-4 py-2 bg-surface-900 border border-surface-600 border-b-0 rounded-t-xl">
                <span className="text-xs text-slate-500 font-mono uppercase">{language}</span>
                <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                    {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <pre className="code-block rounded-t-none whitespace-pre-wrap">{code}</pre>
        </div>
    );
}
