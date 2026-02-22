import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Database, Trash2, Sparkles, BarChart2, RefreshCw, Loader2, TrendingUp, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { ingestConnection, deleteConnection, checkHealth } from '../api/connections';
import { profileTable, generateDocs, getAlerts, checkChanges } from '../api/pipeline';
import { useDatabaseContext } from '../context/DatabaseContext';
import ConnectionForm from '../components/database/ConnectionForm';
import Header from '../components/layout/Header';
import EmptyState from '../components/shared/EmptyState';
import type { ConnectionRequest } from '../types/connection';

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const CHANGE_CHECK_INTERVAL_MS = 60_000; // check every 60s — only COUNT(*), ultra-lightweight

function shortLabel(s: string, max = 12) { return s.length > max ? s.slice(0, max - 1) + '…' : s; }
function fmtTime(d: Date) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Chart sub-components ────────────────────────────────────────────────────

function Empty() {
    return <div className="text-xs text-slate-500 italic py-6 text-center">No data yet — profile a database first.</div>;
}

function ChartTitle({ title, description }: { title: string; description: string }) {
    return (
        <div className="mb-4">
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{title}</div>
            <div className="text-xs text-slate-500 mt-0.5 italic">{description}</div>
        </div>
    );
}

// ── Vertical Bar Chart ────────────────────────────────────────────────────────
function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
    if (!data.length) return <Empty />;
    const maxV = Math.max(...data.map(d => d.value), 1);
    const N = data.length;
    const W = Math.max(540, N * 42), H = 160, PAD_L = 36, PAD_B = 58;
    const slotW = (W - PAD_L) / N;
    const BAR_W = Math.min(34, slotW * 0.55);
    return (
        <div className="overflow-x-auto">
            <svg width={W} height={H + PAD_B} className="overflow-visible">
                {[0, 25, 50, 75, 100].map(v => {
                    const y = H - (v / 100) * H;
                    return (
                        <g key={v}>
                            <line x1={PAD_L} y1={y} x2={W} y2={y} stroke="#1e293b" strokeWidth="1" />
                            <text x={PAD_L - 5} y={y + 4} fill="#475569" fontSize="8" textAnchor="end">{v}</text>
                        </g>
                    );
                })}
                {data.map((d, i) => {
                    const barH = Math.max(2, (d.value / maxV) * H);
                    const cx = PAD_L + i * slotW + slotW / 2;
                    const x = cx - BAR_W / 2, y = H - barH;
                    return (
                        <g key={i}>
                            <rect x={x} y={y} width={BAR_W} height={barH} rx="4" fill={d.color} opacity="0.88" />
                            <text x={cx} y={y - 4} fill="#e2e8f0" fontSize="8.5" textAnchor="middle" fontWeight="600">{d.value.toFixed(0)}</text>
                            <text x={cx} y={H + 8} fill="#64748b" fontSize="9" textAnchor="end"
                                transform={`rotate(-40, ${cx}, ${H + 8})`}>{shortLabel(d.label)}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ── Pie / Donut Chart ─────────────────────────────────────────────────────────
function PieChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
    if (!slices.length) return <Empty />;
    const total = slices.reduce((s, d) => s + d.value, 0) || 1;
    const R = 68, cx = 88, cy = 88, IR = 38;
    let sa = -Math.PI / 2;
    const paths = slices.map(s => {
        const angle = (s.value / total) * 2 * Math.PI;
        const ea = sa + angle;
        const [x1, y1] = [cx + R * Math.cos(sa), cy + R * Math.sin(sa)];
        const [x2, y2] = [cx + R * Math.cos(ea), cy + R * Math.sin(ea)];
        const [xi1, yi1] = [cx + IR * Math.cos(sa), cy + IR * Math.sin(sa)];
        const [xi2, yi2] = [cx + IR * Math.cos(ea), cy + IR * Math.sin(ea)];
        const large = angle > Math.PI ? 1 : 0;
        const d = `M${xi1} ${yi1} L${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${xi2} ${yi2} A${IR} ${IR} 0 ${large} 0 ${xi1} ${yi1}Z`;
        const mid = sa + angle / 2;
        sa = ea;
        return { d, color: s.color, label: s.label, value: s.value, pct: Math.round((s.value / total) * 100), mid };
    });
    return (
        <svg width="100%" viewBox="0 0 230 200" className="overflow-visible">
            {paths.map((p, i) => (
                <g key={i}>
                    <path d={p.d} fill={p.color} opacity="0.88" stroke="#0f172a" strokeWidth="2" />
                    {p.pct > 8 && (
                        <text x={cx + (R + IR) / 2 * 0.9 * Math.cos(p.mid)} y={cy + (R + IR) / 2 * 0.9 * Math.sin(p.mid)}
                            fill="#fff" fontSize="9" textAnchor="middle" fontWeight="700">{p.pct}%</text>
                    )}
                </g>
            ))}
            <text x={cx} y={cy - 4} fill="#94a3b8" fontSize="8.5" textAnchor="middle">Tables</text>
            <text x={cx} y={cy + 11} fill="#f1f5f9" fontSize="15" textAnchor="middle" fontWeight="700">{total}</text>
            {paths.map((p, i) => (
                <g key={i} transform={`translate(176, ${12 + i * 18})`}>
                    <rect width="10" height="10" rx="2" fill={p.color} />
                    <text x={14} y={9} fill="#94a3b8" fontSize="8.5">{shortLabel(p.label, 10)} · {p.value}</text>
                </g>
            ))}
        </svg>
    );
}

// ── Line + Area Chart ─────────────────────────────────────────────────────────
function LineChart({ series }: { series: { label: string; points: number[]; color: string }[] }) {
    const allPts = series.flatMap(s => s.points);
    if (!allPts.length) return <Empty />;
    const maxV = Math.max(...allPts, 1);
    const W = 540, H = 130;
    const nPts = Math.max(...series.map(s => s.points.length), 2);
    const xStep = (W - 50) / Math.max(nPts - 1, 1);
    const toXY = (v: number, i: number) => ({ x: 30 + i * xStep, y: H - (v / maxV) * (H - 16) });
    return (
        <div className="overflow-x-auto">
            <svg width={W} height={H + 38} className="overflow-visible">
                <defs>
                    {series.map((s, si) => (
                        <linearGradient key={si} id={`ag${si}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={s.color} stopOpacity="0.3" />
                            <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
                        </linearGradient>
                    ))}
                </defs>
                {[25, 50, 75, 100].map(v => (
                    <line key={v} x1={30} y1={H - (v / 100) * (H - 16)} x2={W} y2={H - (v / 100) * (H - 16)} stroke="#1e293b" strokeWidth="1" />
                ))}
                {series.map((s, si) => {
                    const pts = s.points.map((v, i) => toXY(v, i));
                    const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
                    const areaD = `${lineD} L${pts[pts.length - 1].x} ${H} L${pts[0].x} ${H}Z`;
                    return (
                        <g key={si}>
                            <path d={areaD} fill={`url(#ag${si})`} />
                            <path d={lineD} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={s.color} stroke="#0f172a" strokeWidth="1.5" />)}
                        </g>
                    );
                })}
                {series.map((s, i) => (
                    <g key={i} transform={`translate(${34 + i * 130}, ${H + 18})`}>
                        <line x1="0" y1="5" x2="16" y2="5" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" />
                        <text x={20} y={9} fill="#94a3b8" fontSize="9">{shortLabel(s.label, 14)}</text>
                    </g>
                ))}
            </svg>
        </div>
    );
}

// ── Horizontal Bar Chart ──────────────────────────────────────────────────────
function HorizontalBar({ data }: { data: { label: string; value: number; color: string }[] }) {
    if (!data.length) return <Empty />;
    const maxV = Math.max(...data.map(d => d.value), 1);
    const ROW_H = 24, W = 540, LABEL_W = 120;
    const H = data.length * ROW_H;
    return (
        <div className="overflow-x-auto">
            <svg width={W} height={H + 10} className="overflow-visible">
                {data.map((d, i) => {
                    const barW = Math.max(2, (d.value / maxV) * (W - LABEL_W - 52));
                    const y = i * ROW_H + 5;
                    return (
                        <g key={i}>
                            <text x={LABEL_W - 6} y={y + 13} fill="#94a3b8" fontSize="9" textAnchor="end" fontFamily="monospace">
                                {shortLabel(d.label, 14)}
                            </text>
                            <rect x={LABEL_W} y={y} width={W - LABEL_W - 52} height={16} rx="4" fill="#1e293b" />
                            <rect x={LABEL_W} y={y} width={barW} height={16} rx="4" fill={d.color} opacity="0.88" />
                            <text x={LABEL_W + barW + 6} y={y + 12} fill="#94a3b8" fontSize="8.5">{d.value.toFixed(0)}%</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ── Gauge Chart ───────────────────────────────────────────────────────────────
function GaugeChart({ value, label, color }: { value: number; label: string; color: string }) {
    const R = 50, cx = 68, cy = 68;
    const angle = (Math.min(value, 100) / 100) * Math.PI;
    const endX = cx + R * Math.cos(Math.PI - angle), endY = cy - R * Math.sin(Math.PI - angle);
    const large = angle > Math.PI ? 1 : 0;
    return (
        <svg width={136} height={90} viewBox="0 0 136 90">
            <path d={`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />
            <path d={`M${cx - R} ${cy} A${R} ${R} 0 ${large} 1 ${endX} ${endY}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
            <line x1={cx} y1={cy} x2={endX} y2={endY} stroke="#f1f5f9" strokeWidth="2" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="4" fill="#f1f5f9" />
            <text x={cx} y={cy + 18} fill="#f1f5f9" fontSize="15" fontWeight="700" textAnchor="middle">{value.toFixed(0)}</text>
            <text x={cx} y={cy + 32} fill="#64748b" fontSize="8.5" textAnchor="middle">{label}</text>
        </svg>
    );
}

// ── Row Count Volume Bars ─────────────────────────────────────────────────────
function RowCountChart({ data }: { data: { label: string; value: number }[] }) {
    if (!data.length) return <Empty />;
    const maxV = Math.max(...data.map(d => d.value), 1);
    const N = data.length;
    const W = Math.max(540, N * 44), H = 150, PAD_L = 36, PAD_B = 58;
    const slotW = (W - PAD_L) / N;
    const BAR_W = Math.min(34, slotW * 0.55);
    const GRAD = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'];
    return (
        <div className="overflow-x-auto">
            <svg width={W} height={H + PAD_B} className="overflow-visible">
                <defs>
                    {data.map((_, i) => (
                        <linearGradient key={i} id={`rcg${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={GRAD[i % GRAD.length]} stopOpacity="0.95" />
                            <stop offset="100%" stopColor={GRAD[i % GRAD.length]} stopOpacity="0.35" />
                        </linearGradient>
                    ))}
                </defs>
                {[0, 25, 50, 75, 100].map(v => (
                    <line key={v} x1={PAD_L} y1={H - (v / 100) * H} x2={W} y2={H - (v / 100) * H} stroke="#1e293b" strokeWidth="1" />
                ))}
                {data.map((d, i) => {
                    const barH = Math.max(2, (d.value / maxV) * H);
                    const cx = PAD_L + i * slotW + slotW / 2;
                    const x = cx - BAR_W / 2, y = H - barH;
                    const lbl = d.value >= 1e6 ? `${(d.value / 1e6).toFixed(1)}M` : d.value >= 1e3 ? `${(d.value / 1e3).toFixed(1)}K` : `${d.value}`;
                    return (
                        <g key={i}>
                            <rect x={x} y={y} width={BAR_W} height={barH} rx="5" fill={`url(#rcg${i})`} />
                            <text x={cx} y={y - 4} fill="#e2e8f0" fontSize="8.5" textAnchor="middle" fontWeight="600">{lbl}</text>
                            <text x={cx} y={H + 8} fill="#64748b" fontSize="9" textAnchor="end"
                                transform={`rotate(-40, ${cx}, ${H + 8})`}>{shortLabel(d.label)}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
export default function DashboardView() {
    const { connections, addConnection, removeConnection, profileCache, updateProfileCache, setActiveService } = useDatabaseContext();
    const [showForm, setShowForm] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [health, setHealth] = useState<any>(null);
    const [loadingProfile, setLoadingProfile] = useState<string | null>(null);
    const [generatingAll, setGeneratingAll] = useState<string | null>(null);
    const [trendData, setTrendData] = useState<Record<string, number[]>>({});
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [changeAlert, setChangeAlert] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [selectedDb, setSelectedDb] = useState<string>('all');  // ← NEW
    const prevScoresRef = useRef<Record<string, number>>({});  // table_name → avg_score snapshot

    useEffect(() => { checkHealth().then(setHealth).catch(() => { }); }, []);

    // ── Core profile loader ───────────────────────────────────────────────────
    const loadProfiles = useCallback(async (svc: string, silent = false) => {
        if (!silent) setLoadingProfile(svc);
        try {
            const res: any = await profileTable(svc);
            const profiles: any[] = res.profiles || [];

            // Detect changes vs previous snapshot
            const changes: string[] = [];
            profiles.forEach(p => {
                const prev = prevScoresRef.current[`${svc}:${p.table_name}`];
                if (prev !== undefined && Math.abs(prev - p.aggregate_score) >= 1) {
                    changes.push(`${p.table_name} ${prev > p.aggregate_score ? '↓' : '↑'} ${p.aggregate_score.toFixed(0)}`);
                }
                prevScoresRef.current[`${svc}:${p.table_name}`] = p.aggregate_score;
            });

            updateProfileCache(svc, profiles);
            setLastUpdated(new Date());
            if (changes.length) {
                setChangeAlert(`Changes in ${svc}: ${changes.slice(0, 3).join(', ')}${changes.length > 3 ? ` +${changes.length - 3} more` : ''}`);
                setTimeout(() => setChangeAlert(null), 8000);
            }

            // Trend data
            try {
                const alerts: any = await getAlerts(svc);
                if (alerts?.trends) {
                    const scores = Object.values(alerts.trends as Record<string, any[]>)
                        .flatMap((t: any[]) => t.map((r: any) => r.score));
                    setTrendData(prev => ({ ...prev, [svc]: scores.slice(-10) }));
                }
            } catch { }
        } catch { }
        if (!silent) setLoadingProfile(null);
    }, [updateProfileCache]);

    // ── Stable service key: string of service names, prevents unnecessary re-runs ──
    const serviceKey = connections.map(c => c.service_name).join(',');

    // ── Auto-profile new connections ──────────────────────────────────────────
    useEffect(() => {
        connections.forEach(c => { if (!profileCache[c.service_name]) loadProfiles(c.service_name); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serviceKey]);   // Only re-run when set of services changes, not on every render

    // ── Background change detection (every 60 s, lightweight COUNT(*) only) ────
    useEffect(() => {
        if (!connections.length) return;
        const id = setInterval(async () => {
            for (const c of connections) {
                try {
                    const result: any = await checkChanges(c.service_name);
                    if (result.has_changes) {
                        setIsPolling(true);
                        try {
                            await loadProfiles(c.service_name, true /* silent */);
                        } finally {
                            setIsPolling(false);   // ALWAYS clears, even on error
                        }
                    }
                } catch { /* ignore network errors */ }
            }
        }, CHANGE_CHECK_INTERVAL_MS);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serviceKey, loadProfiles]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleConnect = async (req: ConnectionRequest) => {
        setFormLoading(true);
        try {
            const res = await ingestConnection(req);
            addConnection({
                service_name: res.service_name, db_type: req.db_type, status: 'connected',
                host: req.host, port: req.port, database: req.database,
                file_path: req.file_path, username: req.username, password: req.password,
            });
            setShowForm(false);
        } finally { setFormLoading(false); }
    };

    const handleDelete = async (name: string) => {
        await deleteConnection(name);
        removeConnection(name);
    };

    // ── Aggregated stats (filtered by selectedDb) ─────────────────────────────
    const allProfiles = selectedDb === 'all'
        ? Object.values(profileCache).flat()
        : (profileCache[selectedDb] || []);
    const totalTables = allProfiles.length;
    const totalRows = allProfiles.reduce((s, p) => s + (p.row_count || 0), 0);
    const avgScore = totalTables ? allProfiles.reduce((s, p) => s + p.aggregate_score, 0) / totalTables : 0;
    const avgComp = totalTables ? allProfiles.reduce((s, p) => s + p.overall_completeness_pct, 0) / totalTables : 0;
    const gradeCount: Record<string, number> = {};
    allProfiles.forEach(p => { gradeCount[p.grade] = (gradeCount[p.grade] || 0) + 1; });

    const GRADE_COLORS: Record<string, string> = { A: '#10b981', B: '#6366f1', C: '#f59e0b', D: '#f97316', F: '#ef4444' };
    const scoreColor = avgScore >= 80 ? '#10b981' : avgScore >= 60 ? '#f59e0b' : '#ef4444';
    const compColor = avgComp >= 80 ? '#6366f1' : avgComp >= 60 ? '#f59e0b' : '#ef4444';

    const barData = allProfiles.slice(0, 20).map(p => ({
        label: p.table_name, value: p.aggregate_score,
        color: p.aggregate_score >= 80 ? '#10b981' : p.aggregate_score >= 60 ? '#f59e0b' : '#ef4444',
    }));
    const pieData = Object.entries(gradeCount).map(([g, n]) => ({ label: `Grade ${g}`, value: n as number, color: GRADE_COLORS[g] }));
    const completenessData = [...allProfiles].sort((a, b) => a.overall_completeness_pct - b.overall_completeness_pct).map(p => ({
        label: p.table_name, value: p.overall_completeness_pct,
        color: p.overall_completeness_pct >= 90 ? '#10b981' : p.overall_completeness_pct >= 70 ? '#f59e0b' : '#ef4444',
    }));
    const rowCountData = [...allProfiles].sort((a, b) => b.row_count - a.row_count).slice(0, 15).map(p => ({
        label: p.table_name, value: p.row_count || 0,
    }));
    const trendSeries = (() => {
        const entries = selectedDb === 'all'
            ? Object.entries(trendData)
            : Object.entries(trendData).filter(([svc]) => svc === selectedDb);
        const series = entries.map(([svc, pts], i) => ({
            label: svc, points: pts, color: ['#6366f1', '#10b981', '#f59e0b', '#f43f5e'][i % 4],
        }));
        if (!series.length && allProfiles.length) {
            series.push({ label: 'Quality Score', points: allProfiles.map(p => p.aggregate_score).slice(0, 12), color: '#6366f1' });
        }
        return series;
    })();

    const ollamaUp = health?.services?.ollama?.status === 'up';
    const omUp = health?.services?.openmetadata?.status === 'up';

    return (
        <div className="flex flex-col h-full">
            <Header
                title="Dashboard"
                subtitle="Data quality analytics & intelligence"
                actions={
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* ── Database filter selector ───────────────────── */}
                        <div className="flex items-center gap-1 bg-slate-800/60 border border-slate-700 rounded-xl p-1">
                            <button
                                onClick={() => setSelectedDb('all')}
                                className={`text-xs px-3 py-1 rounded-lg transition-colors font-medium ${selectedDb === 'all' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
                                    }`}>
                                All
                            </button>
                            {connections.map((c, i) => {
                                const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9'];
                                const col = COLORS[i % COLORS.length];
                                return (
                                    <button key={c.service_name}
                                        onClick={() => { setSelectedDb(c.service_name); setActiveService(c.service_name); }}
                                        className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg transition-colors font-medium ${selectedDb === c.service_name ? 'text-white' : 'text-slate-400 hover:text-white'
                                            }`}
                                        style={selectedDb === c.service_name ? { background: col + '33', color: col, border: `1px solid ${col}60` } : {}}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col }} />
                                        {c.service_name}
                                    </button>
                                );
                            })}
                        </div>

                        {/* ── Last Updated + Polling indicator ───────────── */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/60 border border-slate-700 px-3 py-1.5 rounded-lg">
                            {isPolling
                                ? <Loader2 size={11} className="animate-spin text-brand-400" />
                                : <Clock size={11} className="text-slate-500" />}
                            <span>
                                {lastUpdated
                                    ? <>Last updated <strong className="text-slate-200">{fmtTime(lastUpdated)}</strong></>
                                    : <span className="text-slate-500">Not yet profiled</span>}
                            </span>
                            {isPolling && <span className="text-brand-400 font-medium">· syncing</span>}
                        </div>
                        <button className="btn-primary" onClick={() => setShowForm(true)} id="add-database-btn">
                            <Plus size={15} /> Add Database
                        </button>
                    </div>
                }
            />

            {/* ── Change alert banner ───────────────────────────────────── */}
            {changeAlert && (
                <div className="mx-8 mt-4 p-3 rounded-xl bg-amber-900/40 border border-amber-600/50 flex items-center gap-3 text-xs text-amber-200 animate-slide-up">
                    <AlertCircle size={14} className="text-amber-400 shrink-0" />
                    <span className="font-medium">Database change detected:</span>
                    <span>{changeAlert}</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-8 space-y-8">

                {/* Health */}
                <div className="grid grid-cols-2 gap-4">
                    {[
                        { label: 'Ollama LLM', up: ollamaUp, detail: health?.services?.ollama?.model || 'qwen2.5-coder:3b' },
                        { label: 'OpenMetadata', up: omUp, detail: 'Metadata catalog' },
                    ].map(({ label, up, detail }) => (
                        <div key={label} className="card flex items-center gap-4">
                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${up ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : 'bg-rose-400'}`} />
                            <div className="flex-1">
                                <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
                                <div className="text-sm font-medium text-white">{up ? 'Online' : 'Offline'}</div>
                            </div>
                            <div className="text-xs text-slate-500">{detail}</div>
                        </div>
                    ))}
                </div>

                {/* KPI tiles */}
                <div className="grid grid-cols-4 gap-4">
                    {[
                        { label: 'Connections', value: connections.length, color: '#6366f1', icon: Database },
                        { label: 'Tables Profiled', value: totalTables, color: '#0ea5e9', icon: BarChart2 },
                        { label: 'Total Rows', value: totalRows >= 1e6 ? `${(totalRows / 1e6).toFixed(1)}M` : totalRows >= 1e3 ? `${(totalRows / 1e3).toFixed(1)}K` : totalRows, color: '#10b981', icon: TrendingUp },
                        { label: 'Avg Quality Score', value: avgScore ? `${avgScore.toFixed(0)}/100` : '—', color: scoreColor, icon: CheckCircle },
                    ].map(({ label, value, color, icon: Icon }) => (
                        <div key={label} className="card text-center">
                            <Icon size={20} className="mx-auto mb-2" style={{ color }} />
                            <div className="text-2xl font-bold text-white">{value}</div>
                            <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">{label}</div>
                        </div>
                    ))}
                </div>

                {totalTables > 0 && (<>

                    {/* Row 1: Gauges + Pie + AI Summary */}
                    <div className="grid grid-cols-3 gap-6">
                        <div className="card">
                            <ChartTitle
                                title="Quality Gauges"
                                description="Needle gauges showing average data quality score and column completeness across all connected tables." />
                            <div className="flex flex-wrap gap-2 justify-center">
                                <GaugeChart value={avgScore} label="Avg Quality" color={scoreColor} />
                                <GaugeChart value={avgComp} label="Completeness" color={compColor} />
                            </div>
                        </div>

                        <div className="card">
                            <ChartTitle
                                title="Grade Distribution (Pie Chart)"
                                description="Donut chart showing how many tables fall into each quality grade (A = excellent, F = critical). Hover a slice to see its count." />
                            <PieChart slices={pieData} />
                        </div>

                        <div className="card flex flex-col">
                            <div className="flex items-center gap-2 mb-1">
                                <Sparkles size={13} className="text-brand-400" />
                                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">AI Overview</span>
                            </div>
                            <p className="text-xs text-slate-500 italic mb-3">Auto-generated plain-English summary of your connected databases and their data health.</p>
                            <p className="text-xs text-slate-300 leading-relaxed flex-1">
                                <span className="text-white font-semibold">{connections.length}</span> DB{connections.length !== 1 ? 's' : ''} connected ·{' '}
                                <span className="text-white font-semibold">{totalTables}</span> tables ·{' '}
                                <span className="text-white font-semibold">{totalRows.toLocaleString()}</span> rows.{' '}
                                Overall quality is{' '}
                                <span style={{ color: scoreColor }} className="font-semibold">
                                    {avgScore >= 80 ? 'excellent' : avgScore >= 60 ? 'acceptable' : 'needs attention'}
                                </span>{' '}at <span className="text-white font-semibold">{avgScore.toFixed(1)}/100</span>.
                                Avg completeness: <span className="text-white font-semibold">{avgComp.toFixed(1)}%</span>.
                            </p>
                            <div className="mt-3 pt-3 border-t border-slate-700 grid grid-cols-2 gap-2 text-xs">
                                {pieData.map(p => (
                                    <div key={p.label} className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
                                        <span className="text-slate-400">{p.label}</span>
                                        <span className="text-white font-medium ml-auto">{p.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Vertical Bar */}
                    <div className="card">
                        <ChartTitle
                            title="Quality Score per Table (Bar Chart)"
                            description="Each bar represents one table's data quality score (0–100). Green = good, amber = acceptable, red = poor. Taller bars mean healthier data." />
                        <BarChart data={barData} />
                    </div>

                    {/* Line Chart */}
                    <div className="card">
                        <ChartTitle
                            title="Score Trend (Line Chart)"
                            description="Quality score plotted across tables in profiling order. Rising lines indicate improving data health; dips highlight tables that need attention." />
                        <LineChart series={trendSeries} />
                    </div>

                    {/* Horizontal Completeness */}
                    <div className="card">
                        <ChartTitle
                            title="Completeness by Table (Horizontal Bar)"
                            description="Shows what percentage of values are non-null for each table. Sorted worst-first so you can quickly identify tables with missing data." />
                        <div className="max-h-72 overflow-y-auto pr-1">
                            <HorizontalBar data={completenessData} />
                        </div>
                    </div>

                    {/* Row Count */}
                    <div className="card">
                        <ChartTitle
                            title="Row Count by Table (Volume Chart)"
                            description="Compares the number of rows across tables using gradient bars. Tallest bars hold the most data. Useful for spotting unexpectedly small or large tables." />
                        <RowCountChart data={rowCountData} />
                    </div>
                </>)}

                {/* Connections */}
                <div>
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Connected Databases</h3>
                    {connections.length === 0 ? (
                        <EmptyState icon={Database} title="No databases connected"
                            description="Add a database to start generating AI-powered documentation."
                            action={<button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={14} />Add Database</button>} />
                    ) : (
                        <div className="space-y-3">
                            {connections.map(c => {
                                const profiles = profileCache[c.service_name] || [];
                                const isLoading = loadingProfile === c.service_name;
                                const isGenerating = generatingAll === c.service_name;
                                const svcAvg = profiles.length ? profiles.reduce((s, p) => s + p.aggregate_score, 0) / profiles.length : null;
                                return (
                                    <div key={c.service_name} className="card">
                                        <div className="flex items-center gap-4">
                                            <Database size={18} className="text-brand-400 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-white">{c.service_name}</div>
                                                <div className="text-xs text-slate-400 mt-0.5">
                                                    {c.db_type}{c.host ? ` · ${c.host}:${c.port || ''}/${c.database}` : c.file_path || ''}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {svcAvg !== null && (
                                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${svcAvg >= 80 ? 'bg-emerald-900/60 text-emerald-300' : svcAvg >= 60 ? 'bg-amber-900/60 text-amber-300' : 'bg-rose-900/60 text-rose-300'}`}>
                                                        {svcAvg.toFixed(0)}/100
                                                    </span>
                                                )}
                                                <button onClick={() => loadProfiles(c.service_name)} className="btn-ghost text-xs py-1 px-2" disabled={isLoading}>
                                                    {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
                                                </button>
                                                <button onClick={() => { setGeneratingAll(c.service_name); generateDocs(c.service_name).finally(() => setGeneratingAll(null)); }} className="btn-primary text-xs py-1 px-2" disabled={isGenerating}>
                                                    {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Docs
                                                </button>
                                                <button onClick={() => handleDelete(c.service_name)} className="btn-danger p-2"><Trash2 size={13} /></button>
                                            </div>
                                        </div>
                                        {profiles.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-slate-700 flex items-center gap-3 text-xs text-slate-500">
                                                <span>{profiles.length} tables · {profiles.reduce((s, p) => s + (p.row_count || 0), 0).toLocaleString()} rows · avg {svcAvg?.toFixed(0)}/100</span>
                                                <span className="ml-auto text-emerald-500">● Live (auto-refresh 30s)</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {showForm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-md animate-slide-up">
                        <h2 className="text-base font-semibold text-white mb-4">Add Database Connection</h2>
                        <ConnectionForm onSubmit={handleConnect} onCancel={() => setShowForm(false)} loading={formLoading} />
                    </div>
                </div>
            )}
        </div>
    );
}
