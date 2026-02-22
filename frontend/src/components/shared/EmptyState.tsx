import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: Props) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-surface-700 flex items-center justify-center">
                <Icon size={28} className="text-slate-500" />
            </div>
            <div>
                <div className="text-base font-semibold text-slate-300">{title}</div>
                {description && <div className="text-sm text-slate-500 mt-1 max-w-sm">{description}</div>}
            </div>
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}
