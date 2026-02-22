import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, BarChart2, PieChart, TrendingUp, Loader2, Play, CheckCircle2, XCircle, Clock, Table2, AlertTriangle } from 'lucide-react';
import { sendChatMessage } from '../api/chat';
import { runPlot } from '../api/pipeline';
import { useChatContext } from '../context/ChatContext';
import { useDatabaseContext } from '../context/DatabaseContext';
import type { ChatMessage } from '../types/chat';
import LoadingSpinner from '../components/shared/LoadingSpinner';

// ── Helpers ───────────────────────────────────────────────────────────────────
const PLOT_KEYWORDS = /\b(plot|chart|graph|visuali[sz]e|bar chart|pie chart|line chart|histogram|distribution)\b/i;
const CHART_TYPE_MAP: Record<string, string> = {
    pie: 'pie', 'pie chart': 'pie', donut: 'pie',
    line: 'line', 'line chart': 'line', trend: 'line',
    bar: 'bar', 'bar chart': 'bar', histogram: 'bar',
};

function detectChartType(q: string) {
    for (const [kw, t] of Object.entries(CHART_TYPE_MAP)) {
        if (q.toLowerCase().includes(kw)) return t;
    }
    return 'bar';
}
function isPlotRequest(q: string) { return PLOT_KEYWORDS.test(q); }
function shortLabel(s: string, max = 10) { return s.length > max ? s.slice(0, max - 1) + '…' : s; }

function extractSqlFromText(text: string): string | null {
    const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    if (fenced) {
        const sql = fenced[1].trim();
        if (/SELECT/i.test(sql)) return sql;
    }
    const idx = text.toUpperCase().indexOf('SELECT ');
    if (idx !== -1) {
        const candidate = text.slice(idx).split(/\n\n/)[0].trim();
        if (candidate.length > 15) return candidate;
    }
    return null;
}

// ── Inline SVG charts ─────────────────────────────────────────────────────────
function InlineBarChart({ rows, labelCol, valueCol }: { rows: any[]; labelCol: string; valueCol: string }) {
    const maxV = Math.max(...rows.map(r => parseFloat(r[valueCol] || 0)), 1);
    const N = rows.length, W = Math.max(360, N * 40), H = 130, PAD_L = 32, PAD_B = 50;
    const slotW = (W - PAD_L) / N, BAR_W = Math.min(28, slotW * 0.55);
    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#8b5cf6'];
    return (
        <div className="overflow-x-auto">
            <svg width={W} height={H + PAD_B} className="overflow-visible">
                {[0, 50, 100].map(v => <line key={v} x1={PAD_L} y1={H - (v / 100) * H} x2={W} y2={H - (v / 100) * H} stroke="#1e293b" strokeWidth="1" />)}
                {rows.map((r, i) => {
                    const v = parseFloat(r[valueCol] || 0), barH = Math.max(2, (v / maxV) * H);
                    const cx = PAD_L + i * slotW + slotW / 2, x = cx - BAR_W / 2, y = H - barH;
                    const lbl = v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0);
                    return (
                        <g key={i}>
                            <rect x={x} y={y} width={BAR_W} height={barH} rx="4" fill={COLORS[i % COLORS.length]} opacity="0.88" />
                            <text x={cx} y={y - 3} fill="#e2e8f0" fontSize="8" textAnchor="middle" fontWeight="600">{lbl}</text>
                            <text x={cx} y={H + 8} fill="#64748b" fontSize="8" textAnchor="end" transform={`rotate(-35, ${cx}, ${H + 8})`}>{shortLabel(String(r[labelCol]))}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

function InlinePieChart({ rows, labelCol, valueCol }: { rows: any[]; labelCol: string; valueCol: string }) {
    const total = rows.reduce((s, r) => s + parseFloat(r[valueCol] || 0), 0) || 1;
    const R = 60, cx = 72, cy = 72, IR = 30;
    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#8b5cf6', '#14b8a6', '#fb923c'];
    let sa = -Math.PI / 2;
    const slices = rows.slice(0, 8).map((r, i) => {
        const v = parseFloat(r[valueCol] || 0), angle = (v / total) * 2 * Math.PI, ea = sa + angle;
        const [x1, y1] = [cx + R * Math.cos(sa), cy + R * Math.sin(sa)];
        const [x2, y2] = [cx + R * Math.cos(ea), cy + R * Math.sin(ea)];
        const [xi1, yi1] = [cx + IR * Math.cos(sa), cy + IR * Math.sin(sa)];
        const [xi2, yi2] = [cx + IR * Math.cos(ea), cy + IR * Math.sin(ea)];
        const large = angle > Math.PI ? 1 : 0;
        const d = `M${xi1} ${yi1} L${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${xi2} ${yi2} A${IR} ${IR} 0 ${large} 0 ${xi1} ${yi1}Z`;
        const pct = Math.round((v / total) * 100), mid = sa + angle / 2;
        sa = ea;
        return { d, color: COLORS[i % COLORS.length], label: String(r[labelCol]), v, pct, mid };
    });
    return (
        <div className="flex items-center gap-4">
            <svg width={144} height={144} viewBox="0 0 144 144">
                {slices.map((s, i) => (
                    <g key={i}>
                        <path d={s.d} fill={s.color} opacity="0.88" stroke="#0f172a" strokeWidth="1.5" />
                        {s.pct > 8 && <text x={cx + (R + IR) / 2 * 0.85 * Math.cos(s.mid)} y={cy + (R + IR) / 2 * 0.85 * Math.sin(s.mid)}
                            fill="#fff" fontSize="8" textAnchor="middle" fontWeight="700">{s.pct}%</text>}
                    </g>
                ))}
                <text x={cx} y={cy + 6} fill="#f1f5f9" fontSize="11" textAnchor="middle" fontWeight="700">{total >= 1e3 ? `${(total / 1e3).toFixed(1)}K` : total.toFixed(0)}</text>
            </svg>
            <div className="space-y-1.5">
                {slices.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                        <span className="text-slate-300 font-mono">{shortLabel(s.label, 14)}</span>
                        <span className="text-slate-500 ml-1">{s.pct}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function InlineLineChart({ rows, labelCol, valueCol }: { rows: any[]; labelCol: string; valueCol: string }) {
    const vals = rows.map(r => parseFloat(r[valueCol] || 0)), maxV = Math.max(...vals, 1);
    const W = 380, H = 110, xStep = (W - 40) / Math.max(vals.length - 1, 1);
    const toXY = (v: number, i: number) => ({ x: 20 + i * xStep, y: H - (v / maxV) * (H - 16) });
    const pts = vals.map((v, i) => toXY(v, i));
    const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
    const areaD = `${lineD} L${pts[pts.length - 1].x} ${H} L${pts[0].x} ${H}Z`;
    return (
        <div className="overflow-x-auto">
            <svg width={W} height={H + 24} className="overflow-visible">
                <defs><linearGradient id="ig0" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" /></linearGradient></defs>
                <path d={areaD} fill="url(#ig0)" />
                <path d={lineD} fill="none" stroke="#6366f1" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#6366f1" stroke="#0f172a" strokeWidth="1.5" />)}
                {pts.map((p, i) => <text key={i} x={p.x} y={H + 16} fill="#64748b" fontSize="7.5" textAnchor="middle">{shortLabel(String(rows[i][labelCol]), 7)}</text>)}
            </svg>
        </div>
    );
}

function InlineChart({ plotData, chartType }: { plotData: any; chartType: string }) {
    const { rows, label_col, value_col } = plotData;
    if (!rows?.length || !label_col || !value_col) {
        return <div className="text-xs text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle size={11} />No numeric column found to chart. Try a query that returns a label + number.</div>;
    }
    if (chartType === 'pie') return <InlinePieChart rows={rows} labelCol={label_col} valueCol={value_col} />;
    if (chartType === 'line') return <InlineLineChart rows={rows} labelCol={label_col} valueCol={value_col} />;
    return <InlineBarChart rows={rows} labelCol={label_col} valueCol={value_col} />;
}

// ── Results table ─────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;
function ResultsTable({ data }: { data: any }) {
    const [page, setPage] = useState(0);
    const { columns, rows, row_count, total_rows, duration_ms, truncated } = data;
    const totalPages = Math.ceil(rows.length / PAGE_SIZE);
    const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return (
        <div className="mt-3">
            {/* Status bar */}
            <div className="flex items-center gap-3 text-xs mb-2">
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 size={11} /> {row_count} row{row_count !== 1 ? 's' : ''} returned
                </span>
                <span className="flex items-center gap-1 text-slate-400"><Clock size={10} />{duration_ms}ms</span>
                {truncated && (
                    <span className="flex items-center gap-1 text-amber-400"><AlertTriangle size={10} />Showing first 500 of {total_rows} rows</span>
                )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="text-xs w-full">
                    <thead>
                        <tr className="bg-slate-800/80 border-b border-slate-700">
                            {columns.map((c: string) => (
                                <th key={c} className="text-left px-3 py-2 text-slate-300 font-mono font-semibold whitespace-nowrap">{c}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {pageRows.map((row: any, i: number) => (
                            <tr key={i} className={`border-b border-slate-800 ${i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'} hover:bg-slate-800/60 transition-colors`}>
                                {columns.map((c: string) => (
                                    <td key={c} className="px-3 py-1.5 text-slate-300 font-mono whitespace-nowrap max-w-[180px] truncate" title={String(row[c] ?? '')}>
                                        {row[c] === null ? <span className="text-slate-600 italic">null</span> : String(row[c])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                        className="px-2.5 py-1 rounded-lg border border-slate-700 disabled:opacity-40 hover:border-slate-500 transition-colors">‹ Prev</button>
                    <span>Page {page + 1} / {totalPages}</span>
                    <button disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}
                        className="px-2.5 py-1 rounded-lg border border-slate-700 disabled:opacity-40 hover:border-slate-500 transition-colors">Next ›</button>
                </div>
            )}
        </div>
    );
}

// ── SQL Execution Block ───────────────────────────────────────────────────────
type ExecStatus = 'idle' | 'running' | 'success' | 'error';

function SqlExecutionBlock({
    sql, activeService, initialPlot, initialChartType, autoRun,
}: {
    sql: string; activeService: string | null;
    initialPlot?: any; initialChartType?: string; autoRun?: boolean;
}) {
    const [status, setStatus] = useState<ExecStatus>(initialPlot ? 'success' : 'idle');
    const [result, setResult] = useState<any>(initialPlot || null);
    const [error, setError] = useState<string | null>(null);
    const [chartType, setChartType] = useState(initialChartType || 'bar');
    const [showChart, setShowChart] = useState(!!initialPlot);

    // Auto-run on mount if requested
    useEffect(() => {
        if (autoRun && !initialPlot) runQuery('bar');
    }, []);

    const runQuery = async (ct = chartType) => {
        if (!activeService) return;
        setStatus('running');
        setError(null);
        setResult(null);
        try {
            const data = await runPlot(activeService, sql, ct);
            setResult(data);
            setStatus('success');
        } catch (e: any) {
            const msg = e?.response?.data?.detail || e?.message || 'Unknown error';
            setError(msg);
            setStatus('error');
        }
    };

    return (
        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 overflow-hidden">
            {/* SQL code area */}
            <div className="relative">
                <pre className="text-xs text-emerald-300 font-mono p-4 overflow-x-auto bg-slate-900/60 leading-relaxed whitespace-pre-wrap">{sql}</pre>

                {/* Run button overlay */}
                <div className="absolute top-2 right-2 flex items-center gap-2">
                    {status === 'idle' && activeService && (
                        <button onClick={() => runQuery()} title="Run query"
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors shadow-lg">
                            <Play size={11} fill="currentColor" /> Run
                        </button>
                    )}
                    {status === 'running' && (
                        <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300">
                            <Loader2 size={11} className="animate-spin" /> Running…
                        </span>
                    )}
                    {status === 'success' && (
                        <button onClick={() => { setStatus('idle'); setResult(null); setShowChart(false); }}
                            title="Re-run" className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-800/50 text-emerald-300 hover:bg-emerald-700/50 transition-colors">
                            <CheckCircle2 size={11} /> Re-run
                        </button>
                    )}
                    {status === 'error' && (
                        <button onClick={() => runQuery()}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-rose-900/60 text-rose-300 hover:bg-rose-800 transition-colors">
                            <Play size={11} fill="currentColor" /> Retry
                        </button>
                    )}
                </div>
            </div>

            {/* Status + results */}
            <div className="px-4 pb-4">
                {/* Running state */}
                {status === 'running' && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 animate-pulse">
                        <Loader2 size={12} className="animate-spin text-brand-400" />
                        <span>Executing query via SQLAlchemy…</span>
                    </div>
                )}

                {/* Error state */}
                {status === 'error' && error && (
                    <div className="mt-3 p-3 rounded-lg bg-rose-950/50 border border-rose-800/50 text-xs text-rose-300 font-mono whitespace-pre-wrap">
                        <div className="flex items-center gap-1.5 mb-1 text-rose-400 font-semibold not-italic">
                            <XCircle size={12} /> Query failed
                        </div>
                        {error}
                    </div>
                )}

                {/* Success: results table */}
                {status === 'success' && result && (
                    <>
                        <ResultsTable data={result} />

                        {/* Chart controls (only if there's a value column) */}
                        {result.value_col && result.rows.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-800">
                                {!showChart ? (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-slate-400 flex items-center gap-1"><BarChart2 size={11} />Visualise as:</span>
                                        {(['bar', 'pie', 'line'] as const).map(t => (
                                            <button key={t} onClick={() => { setChartType(t); setShowChart(true); }}
                                                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-slate-600 text-slate-400 hover:border-brand-500/60 hover:text-brand-300 transition-colors capitalize">
                                                {t === 'bar' && <BarChart2 size={10} />}
                                                {t === 'pie' && <PieChart size={10} />}
                                                {t === 'line' && <TrendingUp size={10} />}
                                                {t} chart
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex items-center gap-1 mb-3">
                                            {(['bar', 'pie', 'line'] as const).map(t => (
                                                <button key={t} onClick={() => setChartType(t)}
                                                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${chartType === t ? 'border-brand-500 text-brand-300 bg-brand-900/30' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                                                    {t === 'bar' && <BarChart2 size={10} />}
                                                    {t === 'pie' && <PieChart size={10} />}
                                                    {t === 'line' && <TrendingUp size={10} />}
                                                    {t}
                                                </button>
                                            ))}
                                            <button onClick={() => setShowChart(false)} className="ml-auto text-xs text-slate-500 hover:text-slate-300">Hide chart</button>
                                        </div>
                                        <InlineChart plotData={result} chartType={chartType} />
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* No service selected */}
                {!activeService && (
                    <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
                        <AlertTriangle size={11} />Select a database from the sidebar to run this query.
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Suggested queries ─────────────────────────────────────────────────────────
const SUGGESTED = [
    'What does the orders table contain?',
    'Show a bar chart of orders per customer',
    'Plot a pie chart of products by category',
    'Which table has the most rows?',
];

// ═══════════════════════════════════════════════════════════════════════════════
//  CHAT VIEW
// ═══════════════════════════════════════════════════════════════════════════════
interface ExtendedMessage extends ChatMessage {
    plotData?: any;
    chartType?: string;
    autoRan?: boolean;     // true = SQL was auto-executed on message arrival
}

export default function ChatView() {
    const { messages: rawMessages, isLoading, addMessage, setLoading } = useChatContext();
    const { activeService } = useDatabaseContext();
    const [query, setQuery] = useState('');
    const [localMessages, setLocalMessages] = useState<ExtendedMessage[]>([]);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLocalMessages(prev => {
            const prevMap = new Map(prev.map(m => [m.id, m]));
            return rawMessages.map(m => ({
                ...m,
                plotData: prevMap.get(m.id)?.plotData,
                chartType: prevMap.get(m.id)?.chartType,
                autoRan: prevMap.get(m.id)?.autoRan,
            }));
        });
    }, [rawMessages]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [localMessages]);

    const send = async (text: string) => {
        if (!text.trim() || isLoading) return;
        setQuery('');
        const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date() };
        addMessage(userMsg);
        setLoading(true);
        try {
            const res = await sendChatMessage({ query: text, database_context: activeService || undefined });
            const sql = res.suggested_sql || extractSqlFromText(res.answer || '');
            const wantsPlot = isPlotRequest(text);
            addMessage({
                id: crypto.randomUUID(), role: 'assistant',
                content: res.answer, tables_referenced: res.tables_referenced,
                suggested_sql: sql || undefined, timestamp: new Date(),
            });
            // mark the last message as autoRan so SqlExecutionBlock auto-fires
            if (wantsPlot && sql) {
                setLocalMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (!last) return prev;
                    return [...prev.slice(0, -1), { ...last, autoRan: true, chartType: detectChartType(text) }];
                });
            }
        } catch (err: any) {
            addMessage({ id: crypto.randomUUID(), role: 'assistant', content: `Error: ${err.message}`, timestamp: new Date() });
        } finally { setLoading(false); }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                {localMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
                            <Sparkles size={28} className="text-white" />
                        </div>
                        <div className="text-center">
                            <div className="text-xl font-bold text-white mb-1">Ask Turgon</div>
                            <div className="text-sm text-slate-400">Your intelligent data dictionary assistant</div>
                            <div className="text-xs text-slate-500 mt-1">SQL results run live via SQLAlchemy · Charts render inline</div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                            {SUGGESTED.map(s => (
                                <button key={s} onClick={() => send(s)}
                                    className="text-left text-sm text-slate-400 rounded-xl border border-surface-600 px-4 py-3 hover:border-brand-500/50 hover:text-slate-200 hover:bg-surface-700 transition-all">
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {localMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                        <div className={`max-w-2xl w-full rounded-2xl px-5 py-3.5 text-sm leading-relaxed ${msg.role === 'user'
                            ? 'bg-brand-600 text-white ml-auto max-w-xl'
                            : 'bg-surface-700 border border-surface-600 text-slate-200'}`}>

                            {/* Message text — strip fenced SQL blocks from display */}
                            <div className="whitespace-pre-wrap">
                                {msg.content?.replace(/```(?:sql)?\s*[\s\S]*?```/gi, '').trim()}
                            </div>

                            {/* Tables referenced */}
                            {msg.tables_referenced && msg.tables_referenced.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/10">
                                    <Table2 size={12} className="text-slate-500 mt-0.5" />
                                    {msg.tables_referenced.map(t => (
                                        <span key={t} className="badge-neutral">{t}</span>
                                    ))}
                                </div>
                            )}

                            {/* SQL execution block */}
                            {msg.suggested_sql && msg.role === 'assistant' && (
                                <SqlExecutionBlock
                                    key={`${msg.id}-sql`}
                                    sql={msg.suggested_sql}
                                    activeService={activeService}
                                    initialChartType={msg.chartType}
                                    autoRun={msg.autoRan}
                                />
                            )}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-surface-700 border border-surface-600 rounded-2xl px-5 py-4">
                            <LoadingSpinner text="Turgon is thinking…" size="sm" />
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            <div className="border-t border-surface-600 px-6 py-4">
                {activeService ? (
                    <div className="text-xs text-slate-500 mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Querying <span className="text-brand-400 font-medium">{activeService}</span>
                        <span className="text-slate-600">· SQL executes live via SQLAlchemy</span>
                    </div>
                ) : (
                    <div className="text-xs text-amber-500/80 mb-2 flex items-center gap-1.5">
                        <AlertTriangle size={11} />No database selected — connect one from the Dashboard first.
                    </div>
                )}
                <div className="flex gap-3">
                    <textarea
                        className="input flex-1 resize-none h-12 py-3 leading-tight"
                        placeholder='Ask about your data… or "show a bar chart of orders per customer"'
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(query); } }}
                        rows={1}
                    />
                    <button onClick={() => send(query)} className="btn-primary px-4" disabled={isLoading || !query.trim()}>
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
