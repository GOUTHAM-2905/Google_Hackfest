import React from 'react';

type Color = 'green' | 'amber' | 'red' | 'critical' | 'neutral';

interface Props {
    score: number;
    grade?: string;
    color?: Color;
    size?: 'sm' | 'md' | 'lg';
}

const colorMap: Record<Color, string> = {
    green: 'badge-green',
    amber: 'badge-amber',
    red: 'badge-red',
    critical: 'badge-critical',
    neutral: 'badge-neutral',
};

const labelMap: Record<Color, string> = {
    green: 'Excellent',
    amber: 'Acceptable',
    red: 'Poor',
    critical: 'Critical',
    neutral: 'Unknown',
};

const dotMap: Record<Color, string> = {
    green: 'bg-emerald-400',
    amber: 'bg-amber-400',
    red: 'bg-rose-400',
    critical: 'bg-red-400',
    neutral: 'bg-slate-500',
};

function resolveColor(score: number): Color {
    if (score >= 90) return 'green';
    if (score >= 70) return 'amber';
    if (score >= 50) return 'red';
    return 'critical';
}

export default function QualityBadge({ score, grade, color, size = 'md' }: Props) {
    const c = color ?? resolveColor(score);
    const sizeClass = size === 'lg' ? 'text-sm px-3 py-1' : size === 'sm' ? 'text-xs px-2 py-0.5' : '';
    return (
        <span className={`${colorMap[c]} ${sizeClass}`} data-testid="quality-badge">
            <span className={`w-1.5 h-1.5 rounded-full ${dotMap[c]}`} />
            {score.toFixed(1)}
            {grade && <span className="opacity-70">/{grade}</span>}
            <span className="hidden sm:inline opacity-70"> · {labelMap[c]}</span>
        </span>
    );
}
