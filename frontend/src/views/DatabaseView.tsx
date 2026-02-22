import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Database, ChevronRight, BarChart2, Sparkles,
    RefreshCw, Loader2, FileText, Download
} from 'lucide-react';
import { profileTable, generateDocs, exportTable, getLineage } from '../api/pipeline';
import { useDatabaseContext } from '../context/DatabaseContext';
import Header from '../components/layout/Header';
import EmptyState from '../components/shared/EmptyState';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TableSummary {
    name: string; service: string;
    score?: number; grade?: string; badge_color?: string;
    row_count?: number; summary?: string;
    profiled?: boolean; documented?: boolean;
}

interface LineageNode { id: string; label: string; row_count: number; service: string; }
interface LineageEdge { source: string; target: string; source_column: string; target_column: string; service: string; }

// ── Per-service colour palette ─────────────────────────────────────────────────
const PALETTE = [
    { border: '#6366f1', fill: '#1e1b4b', text: '#a5b4fc', dot: '#6366f1' },
    { border: '#10b981', fill: '#022c22', text: '#6ee7b7', dot: '#10b981' },
    { border: '#f59e0b', fill: '#451a03', text: '#fcd34d', dot: '#f59e0b' },
    { border: '#f43f5e', fill: '#1f0814', text: '#fda4af', dot: '#f43f5e' },
    { border: '#0ea5e9', fill: '#082030', text: '#7dd3fc', dot: '#0ea5e9' },
];

// ── Force-directed Schema Graph ───────────────────────────────────────────────
const CARD_W = 160, CARD_H = 60;
const REPEL = 18000, ATTRACT = 0.04, DAMPING = 0.82, ITERATIONS = 200;

function useForceLayout(nodes: LineageNode[], edges: LineageEdge[]) {
    const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

    useEffect(() => {
        if (!nodes.length) { setPositions({}); return; }

        const GAP = 220;
        const COLS = Math.ceil(Math.sqrt(nodes.length));
        // Initial positions: circular / grid seed
        const pos: Record<string, { x: number; y: number; vx: number; vy: number }> = {};
        nodes.forEach((n, i) => {
            const key = `${n.service}:${n.id}`;
            // Seed in a circle to avoid initial cluster
            const angle = (2 * Math.PI * i) / nodes.length;
            const r = GAP * Math.max(1, COLS / 2);
            pos[key] = {
                x: 400 + r * Math.cos(angle),
                y: 300 + r * Math.sin(angle),
                vx: 0, vy: 0,
            };
        });


        for (let iter = 0; iter < ITERATIONS; iter++) {
            const keys = Object.keys(pos);

            // Repulsion between all node pairs
            for (let a = 0; a < keys.length; a++) {
                for (let b = a + 1; b < keys.length; b++) {
                    const pa = pos[keys[a]], pb = pos[keys[b]];
                    const dx = pb.x - pa.x, dy = pb.y - pa.y;
                    const dist2 = Math.max(dx * dx + dy * dy, 1);
                    const dist = Math.sqrt(dist2);
                    const force = REPEL / dist2;
                    const fx = (dx / dist) * force, fy = (dy / dist) * force;
                    pa.vx -= fx; pa.vy -= fy;
                    pb.vx += fx; pb.vy += fy;
                }
            }

            // Attraction along edges
            edges.forEach(e => {
                const sk = `${e.service}:${e.source}`, tk = `${e.service}:${e.target}`;
                const ps = pos[sk], pt = pos[tk];
                if (!ps || !pt) return;
                const dx = pt.x - ps.x, dy = pt.y - ps.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const ideal = GAP * 1.6;
                const force = (dist - ideal) * ATTRACT;
                const fx = (dx / dist) * force, fy = (dy / dist) * force;
                ps.vx += fx; ps.vy += fy;
                pt.vx -= fx; pt.vy -= fy;
            });

            // Apply velocity + dampen
            keys.forEach(k => {
                const p = pos[k];
                p.x += p.vx; p.y += p.vy;
                p.vx *= DAMPING; p.vy *= DAMPING;
            });
        }

        // Normalise: shift so min x/y = PAD
        const PAD = 40;
        const minX = Math.min(...Object.values(pos).map(p => p.x));
        const minY = Math.min(...Object.values(pos).map(p => p.y));
        const result: Record<string, { x: number; y: number }> = {};
        Object.entries(pos).forEach(([k, p]) => {
            result[k] = { x: p.x - minX + PAD, y: p.y - minY + PAD };
        });
        setPositions(result);
    }, [nodes.length, edges.length]);

    return positions;
}

/** Pick best port so the arrow exits/enters the nearest edge of the card */
function edgePorts(sp: { x: number; y: number }, tp: { x: number; y: number }) {
    const sx = sp.x + CARD_W / 2, sy = sp.y + CARD_H / 2;
    const tx = tp.x + CARD_W / 2, ty = tp.y + CARD_H / 2;
    const dx = tx - sx, dy = ty - sy;

    let x1: number, y1: number, x2: number, y2: number;

    if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal dominant — exit left/right
        if (dx > 0) { x1 = sp.x + CARD_W; y1 = sp.y + CARD_H / 2; x2 = tp.x; y2 = tp.y + CARD_H / 2; }
        else { x1 = sp.x; y1 = sp.y + CARD_H / 2; x2 = tp.x + CARD_W; y2 = tp.y + CARD_H / 2; }
    } else {
        // Vertical dominant — exit top/bottom
        if (dy > 0) { x1 = sp.x + CARD_W / 2; y1 = sp.y + CARD_H; x2 = tp.x + CARD_W / 2; y2 = tp.y; }
        else { x1 = sp.x + CARD_W / 2; y1 = sp.y; x2 = tp.x + CARD_W / 2; y2 = tp.y + CARD_H; }
    }
    return { x1, y1, x2, y2 };
}

function SchemaGraph({
    nodes, edges, colorMap,
}: {
    nodes: LineageNode[];
    edges: LineageEdge[];
    colorMap: Record<string, typeof PALETTE[0]>;
}) {
    const positions = useForceLayout(nodes, edges);

    if (nodes.length === 0) return (
        <div className="text-slate-500 text-xs italic p-8 text-center">
            No tables loaded. Click <strong>Refresh All</strong> to load schema data.
        </div>
    );

    if (!Object.keys(positions).length) return (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center">
            <Loader2 size={16} className="animate-spin" /> Calculating layout…
        </div>
    );

    const PAD = 40;
    const minX = Math.min(...Object.values(positions).map(p => p.x));
    const minY = Math.min(...Object.values(positions).map(p => p.y));
    const maxX = Math.max(...Object.values(positions).map(p => p.x)) + CARD_W + PAD;
    const maxY = Math.max(...Object.values(positions).map(p => p.y)) + CARD_H + PAD;

    const width = Math.max(maxX - minX + PAD * 2, 860);
    const height = Math.max(maxY - minY + PAD * 2, 340);

    return (
        <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-4 relative" style={{ height: 600 }}>
            <svg
                viewBox={`${minX - PAD} ${minY - PAD} ${width} ${height}`}
                className="w-full h-full"
                preserveAspectRatio="xMidYMid meet"
            >
                <defs>
                    {/* Real FK arrow */}
                    <marker id="fkArrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                        <polygon points="0 0, 9 4.5, 0 9" fill="#818cf8" />
                    </marker>
                    {/* Inferred FK arrow (dimmer) */}
                    <marker id="fkArrowInferred" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                        <polygon points="0 0, 9 4.5, 0 9" fill="#475569" />
                    </marker>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* FK edges */}
                {edges.map((e, i) => {
                    const sk = `${e.service}:${e.source}`, tk = `${e.service}:${e.target}`;
                    const sp = positions[sk], tp = positions[tk];
                    if (!sp || !tp) return null;
                    const { x1, y1, x2, y2 } = edgePorts(sp, tp);
                    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                    const isInferred = (e as any).inferred === true;
                    return (
                        <g key={i}>
                            <path
                                d={`M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`}
                                stroke={isInferred ? '#475569' : '#818cf8'}
                                strokeWidth={isInferred ? 1.4 : 2}
                                strokeDasharray={isInferred ? '5,4' : undefined}
                                fill="none"
                                markerEnd={`url(#${isInferred ? 'fkArrowInferred' : 'fkArrow'})`}
                                opacity={isInferred ? 0.55 : 0.85}
                            />
                            {/* Edge label on hover area */}
                            <text x={mx} y={my - 5} fill={isInferred ? '#475569' : '#94a3b8'}
                                fontSize="8" textAnchor="middle" fontStyle={isInferred ? 'italic' : undefined}>
                                {e.source_column} → {e.target_column}{isInferred ? ' *' : ''}
                            </text>
                        </g>
                    );
                })}

                {/* Table node cards */}
                {nodes.map(n => {
                    const key = `${n.service}:${n.id}`;
                    const p = positions[key];
                    if (!p) return null;
                    const col = colorMap[n.service] || PALETTE[0];
                    const label = n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label;
                    return (
                        <g key={key} transform={`translate(${p.x},${p.y})`} className="cursor-pointer">
                            <rect width={CARD_W} height={CARD_H} rx="10"
                                fill={col.fill} stroke={col.border} strokeWidth="1.8"
                                filter="url(#glow)" opacity="0.4" />
                            <rect width={CARD_W} height={CARD_H} rx="10"
                                fill={col.fill} stroke={col.border} strokeWidth="1.8" />
                            <rect width={CARD_W} height={5} rx="10" fill={col.border} opacity="0.9" />
                            <text x={CARD_W / 2} y={27} fill={col.text}
                                fontSize="11" fontWeight="700" textAnchor="middle">{label}</text>
                            <text x={CARD_W / 2} y={44} fill="#64748b"
                                fontSize="8.5" textAnchor="middle">
                                {n.row_count.toLocaleString()} rows · {n.service}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {/* Legend */}
            <div className="flex items-center gap-5 mt-3 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                    <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#818cf8" strokeWidth="2" markerEnd="url(#fkArrow)" /></svg>
                    Real FK constraint
                </div>
                <div className="flex items-center gap-1.5">
                    <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#475569" strokeWidth="1.5" strokeDasharray="4,3" /></svg>
                    Inferred from column name *
                </div>
            </div>
        </div>
    );
}

// ── Main Database View ─────────────────────────────────────────────────────────
export default function DatabaseView() {
    const { connections, activeService, setActiveService } = useDatabaseContext();
    const [selected, setSelected] = useState<string>(activeService || connections[0]?.service_name || '');
    const [tab, setTab] = useState<'tables' | 'relations'>('tables');

    // Per-service state
    const [allLineage, setAllLineage] = useState<Record<string, { nodes: LineageNode[]; edges: LineageEdge[] }>>({});
    const [tables, setTables] = useState<TableSummary[]>([]);
    const [loadingLineage, setLoadingLineage] = useState<string | null>(null);
    const [generatingAll, setGeneratingAll] = useState(false);
    const [profilingAll, setProfilingAll] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

    // Build colour map: service name → palette entry
    const colorMap: Record<string, typeof PALETTE[0]> = {};
    connections.forEach((c, i) => { colorMap[c.service_name] = PALETTE[i % PALETTE.length]; });

    // Load lineage for all connections
    const loadAll = async () => {
        for (const c of connections) {
            setLoadingLineage(c.service_name);
            try {
                const data = await getLineage(c.service_name);
                const nodes: LineageNode[] = data.nodes.map((n: any) => ({ ...n, service: c.service_name }));
                const edges: LineageEdge[] = data.edges.map((e: any) => ({ ...e, service: c.service_name }));
                setAllLineage(prev => ({ ...prev, [c.service_name]: { nodes, edges } }));
            } catch { }
        }
        setLoadingLineage(null);
    };

    // Load lineage for selected service for tables tab
    const loadSelected = async (svc: string) => {
        setLoadingLineage(svc);
        try {
            const data = await getLineage(svc);
            const nodes: LineageNode[] = data.nodes.map((n: any) => ({ ...n, service: svc }));
            const edges: LineageEdge[] = data.edges.map((e: any) => ({ ...e, service: svc }));
            setAllLineage(prev => ({ ...prev, [svc]: { nodes, edges } }));
            setTables(nodes.map(n => ({ name: n.id, service: svc, row_count: n.row_count })));
        } catch { }
        setLoadingLineage(null);
    };

    useEffect(() => {
        if (selected) loadSelected(selected);
    }, [selected]);

    useEffect(() => {
        if (tab === 'relations' && connections.length > 0) loadAll();
    }, [tab]);

    const handleProfileAll = async () => {
        if (!selected) return;
        setProfilingAll(true);
        try {
            const res: any = await profileTable(selected);
            const profiles = res.profiles || [];
            setTables(prev => prev.map(t => {
                const p = profiles.find((x: any) => x.table_name === t.name);
                return p ? { ...t, score: p.aggregate_score, grade: p.grade, badge_color: p.badge_color, row_count: p.row_count, profiled: true } : t;
            }));
            showToast(`✅ Profiled ${profiles.length} tables`);
        } catch { showToast('❌ Profiling failed'); }
        setProfilingAll(false);
    };

    const handleGenerateAll = async () => {
        if (!selected) return;
        setGeneratingAll(true);
        try {
            const res: any = await generateDocs(selected);
            const results = res.results || [];
            setTables(prev => prev.map(t => {
                const r = results.find((x: any) => x.table_name === t.name);
                return r?.status === 'success' ? { ...t, summary: r.business_summary, documented: true } : t;
            }));
            showToast(`✅ Generated docs for ${res.tables_documented} tables`);
        } catch { showToast('❌ Doc generation failed — is Ollama running?'); }
        setGeneratingAll(false);
    };

    const handleExport = async (tableName: string, format: 'json' | 'markdown') => {
        try {
            const data = await exportTable(selected, tableName, format);
            const content = format === 'json' ? JSON.stringify(data, null, 2) : (data.markdown || JSON.stringify(data));
            const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${tableName}.${format === 'json' ? 'json' : 'md'}`;
            a.click(); URL.revokeObjectURL(url);
        } catch { showToast('❌ Export failed'); }
    };

    if (connections.length === 0) {
        return (
            <div className="flex flex-col h-full">
                <Header title="Databases" subtitle="Your connected data sources" />
                <div className="flex-1 flex items-center justify-center">
                    <EmptyState icon={Database} title="No databases connected" description="Go to Dashboard to add your first database connection." />
                </div>
            </div>
        );
    }

    // Combined all-connections graph data
    const combinedNodes = Object.values(allLineage).flatMap(l => l.nodes).filter(n => n.service === selected);
    const combinedEdges = Object.values(allLineage).flatMap(l => l.edges).filter(e => e.service === selected);

    const conn = connections.find(c => c.service_name === selected);

    return (
        <div className="flex flex-col h-full relative">
            {/* Toast */}
            {toast && (
                <div className="fixed top-4 right-4 z-50 bg-slate-800 border border-slate-600 text-white text-sm px-4 py-2 rounded-xl shadow-xl animate-slide-up">
                    {toast}
                </div>
            )}

            <Header
                title="Databases"
                subtitle={`${connections.length} connection${connections.length !== 1 ? 's' : ''}`}
                actions={
                    <div className="flex gap-2">
                        <button className="btn-secondary text-xs" onClick={handleProfileAll} disabled={profilingAll || !selected}>
                            {profilingAll ? <Loader2 size={12} className="animate-spin" /> : <BarChart2 size={12} />} Profile All
                        </button>
                        <button className="btn-primary text-xs" onClick={handleGenerateAll} disabled={generatingAll || !selected}>
                            {generatingAll ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Generate All Docs
                        </button>
                    </div>
                }
            />

            <div className="flex flex-1 overflow-hidden">
                {/* Left sidebar – connection switcher */}
                <div className="w-56 border-r border-slate-700 p-3 overflow-y-auto flex flex-col gap-1 shrink-0">
                    <div className="text-xs text-slate-500 uppercase tracking-wider px-2 mb-2">Connections</div>
                    {connections.map((c, i) => {
                        const col = PALETTE[i % PALETTE.length];
                        return (
                            <button
                                key={c.service_name}
                                onClick={() => { setSelected(c.service_name); setActiveService(c.service_name); }}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${selected === c.service_name ? 'bg-slate-800 text-white border border-slate-600' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                            >
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.border }} />
                                <span className="truncate font-medium">{c.service_name}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Main panel */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Connection info bar */}
                    {conn && (
                        <div className="mb-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center gap-3">
                            <span className="w-3 h-3 rounded-full shrink-0"
                                style={{ background: colorMap[conn.service_name]?.border || '#6366f1' }} />
                            <div className="flex-1">
                                <div className="text-sm font-semibold text-white">{conn.service_name}</div>
                                <div className="text-xs text-slate-400">{conn.db_type}{conn.host ? ` · ${conn.host} / ${conn.database}` : conn.file_path ? ` · ${conn.file_path}` : ''}</div>
                            </div>
                            <button onClick={() => loadSelected(selected)} className="btn-ghost text-xs" title="Refresh">
                                <RefreshCw size={12} className={loadingLineage === selected ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="flex gap-1 mb-5 border-b border-slate-700">
                        {(['tables', 'relations'] as const).map(t => (
                            <button key={t} onClick={() => setTab(t)}
                                className={`px-4 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${tab === t ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-500 hover:text-white'}`}>
                                {t === 'relations' ? '🔗 Schema Relations' : '📋 Tables'}
                            </button>
                        ))}
                    </div>

                    {/* Tables Tab */}
                    {tab === 'tables' && (
                        <div className="space-y-2">
                            {loadingLineage === selected && (
                                <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
                                    <Loader2 size={16} className="animate-spin" /> Loading tables…
                                </div>
                            )}
                            {tables.length === 0 && !loadingLineage && (
                                <div className="text-slate-500 text-sm italic text-center py-10">
                                    No tables yet. Click <strong>Profile All</strong> to load them.
                                </div>
                            )}
                            {tables.map(t => (
                                <div key={t.name} className="card-hover group">
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                                            <FileText size={14} className="text-slate-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Link to={`/database/${selected}/${t.name}`}
                                                    className="font-semibold text-white hover:text-brand-300 text-sm transition-colors">
                                                    {t.name}
                                                </Link>
                                                {t.grade && (
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${t.badge_color === 'green' ? 'bg-emerald-900/60 text-emerald-300' : t.badge_color === 'amber' ? 'bg-amber-900/60 text-amber-300' : 'bg-rose-900/60 text-rose-300'}`}>
                                                        Grade {t.grade} · {t.score?.toFixed(0)}
                                                    </span>
                                                )}
                                                {t.documented && <span className="text-xs bg-brand-900/60 text-brand-300 px-2 py-0.5 rounded-full">AI Docs ✓</span>}
                                            </div>
                                            {t.row_count !== undefined && <div className="text-xs text-slate-500 mt-0.5">{t.row_count.toLocaleString()} rows</div>}
                                            {t.summary && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed line-clamp-2">{t.summary}</p>}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleExport(t.name, 'json')} className="btn-ghost text-xs p-1.5" title="Export JSON"><Download size={12} /></button>
                                            <button onClick={() => handleExport(t.name, 'markdown')} className="btn-ghost text-xs p-1.5" title="Export Markdown"><FileText size={12} /></button>
                                            <Link to={`/database/${selected}/${t.name}`} className="btn-ghost text-xs p-1.5" title="View Details"><ChevronRight size={12} /></Link>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Schema Relations Tab – ALL connections combined */}
                    {tab === 'relations' && (
                        <div>
                            {/* Service legend */}
                            <div className="flex flex-wrap gap-3 mb-4">
                                {connections.map((c, i) => {
                                    const col = PALETTE[i % PALETTE.length];
                                    const svcData = allLineage[c.service_name];
                                    return (
                                        <div key={c.service_name} className="flex items-center gap-2 text-xs">
                                            <span className="w-3 h-3 rounded-sm" style={{ background: col.border }} />
                                            <span className="text-slate-300 font-medium">{c.service_name}</span>
                                            <span className="text-slate-500">{svcData ? `(${svcData.nodes.length} tables)` : '…'}</span>
                                        </div>
                                    );
                                })}
                                <button onClick={loadAll} className="btn-ghost text-xs ml-auto py-1 px-2">
                                    <RefreshCw size={11} className={loadingLineage ? 'animate-spin' : ''} /> Refresh All
                                </button>
                            </div>

                            {/* Combined Graph */}
                            {(loadingLineage && combinedNodes.length === 0) ? (
                                <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center">
                                    <Loader2 size={16} className="animate-spin" /> Building schema graph for {selected}…
                                </div>
                            ) : (
                                <SchemaGraph nodes={combinedNodes} edges={combinedEdges} colorMap={colorMap} />
                            )}

                            {/* FK relationship table */}
                            {combinedEdges.length > 0 && (
                                <div className="mt-5">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-semibold">Foreign Key Relationships</div>
                                    <div className="space-y-1">
                                        {combinedEdges.map((e, i) => (
                                            <div key={i} className="flex items-center gap-2 text-xs bg-slate-800/40 px-3 py-1.5 rounded-lg">
                                                <span className="w-2 h-2 rounded-full" style={{ background: colorMap[e.service]?.border }} />
                                                <span className="text-white font-medium">{e.source}</span>
                                                <span className="text-slate-500">·</span>
                                                <span className="text-brand-400">{e.source_column}</span>
                                                <span className="text-slate-400 font-bold">→</span>
                                                <span className="text-white font-medium">{e.target}</span>
                                                <span className="text-slate-500">·</span>
                                                <span className="text-brand-400">{e.target_column}</span>
                                                <span className="ml-auto text-slate-600 italic">{e.service}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
