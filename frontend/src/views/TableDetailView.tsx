import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Sparkles, Download, Table2, Layers, BarChart2, FileDown } from 'lucide-react';
import { profileTable, generateDocs, exportTable } from '../api/pipeline';
import { useDatabaseContext } from '../context/DatabaseContext';
import QualityBadge from '../components/shared/QualityBadge';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import CodeBlock from '../components/shared/CodeBlock';
import type { TableQualityProfile } from '../types/quality';

const TABS = ['Overview', 'Schema', 'Quality', 'Export'] as const;
type Tab = typeof TABS[number];

interface DocData { business_summary?: string; usage_recommendations?: string; quality_score?: number; columns?: any[]; }

export default function TableDetailView() {
    const { serviceName = '', tableName = '' } = useParams();
    const { profileCache, updateProfileCache } = useDatabaseContext();
    const [activeTab, setActiveTab] = useState<Tab>('Overview');
    const [profile, setProfile] = useState<TableQualityProfile | null>(null);
    const [docData, setDocData] = useState<DocData | null>(null);
    const [loading, setLoading] = useState('');
    const [exportData, setExportData] = useState<{ json?: any; markdown?: string } | null>(null);
    const [lastExportedFormat, setLastExportedFormat] = useState<'json' | 'markdown' | null>(null);

    // Auto-refresh export preview when switching to Export tab
    useEffect(() => {
        if (activeTab === 'Export' && !exportData && !loading) {
            runExport('json');
        }
    }, [activeTab]);

    // Auto-run profile on mount; use cached data if available
    useEffect(() => {
        const cached = profileCache[serviceName]?.find((p: any) => p.table_name === tableName);
        if (cached) {
            setProfile(cached as TableQualityProfile);
        } else {
            runProfile();
        }
    }, [serviceName, tableName]);

    const runProfile = async () => {
        setLoading('profiling');
        try {
            const p = await profileTable(serviceName, tableName) as TableQualityProfile;
            setProfile(p);
            // Merge into shared cache so Dashboard charts stay in sync
            const existing = profileCache[serviceName] || [];
            const merged = existing.filter((x: any) => x.table_name !== tableName);
            updateProfileCache(serviceName, [...merged, p]);
        }
        finally { setLoading(''); }
    };

    const runGenerate = async () => {
        setLoading('generating');
        try {
            const res = await generateDocs(serviceName, tableName);
            const result = res.results?.[0];
            if (result?.status === 'success') setDocData(result);
        } finally { setLoading(''); }
    };

    const runExport = async (format: 'json' | 'markdown') => {
        setLoading('exporting');
        try {
            const data = await exportTable(serviceName, tableName, format);
            if (format === 'json') setExportData({ json: data });
            else setExportData({ markdown: data });
            setLastExportedFormat(format);
        } finally { setLoading(''); }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-8 py-5 border-b border-surface-600">
                <Link to="/databases" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-3 transition-colors">
                    <ArrowLeft size={12} /> Back to Databases
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-white font-mono">{tableName}</h1>
                        <div className="text-xs text-slate-400 mt-1">{serviceName}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        {profile && <QualityBadge score={profile.aggregate_score} grade={profile.grade} size="lg" />}
                        <button className="btn-ghost" onClick={runProfile} disabled={!!loading}><RefreshCw size={14} />Profile</button>
                        <button className="btn-primary" onClick={runGenerate} disabled={!!loading}><Sparkles size={14} />Generate Docs</button>
                    </div>
                </div>
                {/* Tabs */}
                <div className="flex gap-1 mt-4">
                    {TABS.map((t) => (
                        <button key={t} onClick={() => setActiveTab(t)} className={activeTab === t ? 'tab-active' : 'tab-inactive'}>
                            {t === 'Overview' && <Layers size={13} />}{t === 'Schema' && <Table2 size={13} />}
                            {t === 'Quality' && <BarChart2 size={13} />}{t === 'Export' && <FileDown size={13} />}
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
                {loading && <LoadingSpinner text={`${loading}…`} />}
                {!loading && (
                    <>
                        {activeTab === 'Overview' && (
                            <div className="space-y-6 max-w-2xl animate-fade-in">
                                {docData?.business_summary ? (
                                    <>
                                        <div className="card">
                                            <div className="text-xs text-brand-400 uppercase tracking-wider mb-2 font-semibold">Business Summary</div>
                                            <p className="text-sm text-slate-200 leading-relaxed">{docData.business_summary}</p>
                                        </div>
                                        <div className="card">
                                            <div className="text-xs text-brand-400 uppercase tracking-wider mb-2 font-semibold">Usage Recommendations</div>
                                            <p className="text-sm text-slate-200 leading-relaxed">{docData.usage_recommendations}</p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="card text-center py-10">
                                        <Sparkles size={32} className="text-slate-600 mx-auto mb-3" />
                                        <div className="text-sm text-slate-400">No documentation yet.</div>
                                        <button className="btn-primary mt-4 mx-auto" onClick={runGenerate}><Sparkles size={14} />Generate Now</button>
                                    </div>
                                )}
                                {profile && (
                                    <div className="grid grid-cols-3 gap-4">
                                        {[
                                            { label: 'Completeness', value: `${profile.overall_completeness_pct}%` },
                                            { label: 'Row Count', value: profile.row_count.toLocaleString() },
                                            { label: 'Freshness', value: profile.freshness_timestamp ? new Date(profile.freshness_timestamp).toLocaleDateString() : 'Unknown' },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="card text-center">
                                                <div className="text-xl font-bold text-white">{value}</div>
                                                <div className="text-xs text-slate-400 mt-1">{label}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'Schema' && (
                            <div className="animate-fade-in">
                                <div className="text-sm text-slate-400 mb-4">Run Ingest to see schema details. Columns listed below are from profile data.</div>
                                {profile?.columns && (
                                    <div className="card overflow-hidden p-0">
                                        <table className="w-full text-sm">
                                            <thead className="bg-surface-700 border-b border-surface-600">
                                                <tr>{['Column', 'Completeness', 'Distinct Count', 'Null Count'].map(h => <th key={h} className="text-left px-4 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider">{h}</th>)}</tr>
                                            </thead>
                                            <tbody className="divide-y divide-surface-600">
                                                {profile.columns.map((c) => (
                                                    <tr key={c.column_name} className="hover:bg-surface-700/50 transition-colors">
                                                        <td className="px-4 py-3 font-mono text-slate-200">{c.column_name}</td>
                                                        <td className="px-4 py-3"><QualityBadge score={c.completeness_pct} size="sm" /></td>
                                                        <td className="px-4 py-3 text-slate-400">{c.distinct_count.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-slate-400">{c.null_count.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'Quality' && (
                            <div className="animate-fade-in">
                                {!profile ? (
                                    <div className="card text-center py-10">
                                        <div className="text-sm text-slate-400 mb-4">No quality data yet.</div>
                                        <button className="btn-primary mx-auto" onClick={runProfile}><RefreshCw size={14} />Run Profile</button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-4 gap-4">
                                            {[
                                                { label: 'Score', value: `${profile.aggregate_score}/100` },
                                                { label: 'Grade', value: profile.grade },
                                                { label: 'Rows', value: profile.row_count.toLocaleString() },
                                                { label: 'Completeness', value: `${profile.overall_completeness_pct}%` },
                                            ].map(({ label, value }) => (
                                                <div key={label} className="card text-center">
                                                    <div className="text-2xl font-bold text-white">{value}</div>
                                                    <div className="text-xs text-slate-400 mt-1">{label}</div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="card space-y-2">
                                            {profile.columns.map((c) => (
                                                <div key={c.column_name} className="flex items-center gap-4">
                                                    <div className="w-36 font-mono text-sm text-slate-300 truncate">{c.column_name}</div>
                                                    <div className="flex-1 h-2 bg-surface-600 rounded-full overflow-hidden">
                                                        <div className={`h-2 rounded-full transition-all ${c.completeness_pct >= 90 ? 'bg-emerald-400' : c.completeness_pct >= 70 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${c.completeness_pct}%` }} />
                                                    </div>
                                                    <div className="text-xs text-slate-400 w-12 text-right">{c.completeness_pct}%</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'Export' && (
                            <div className="space-y-4 animate-fade-in max-w-lg">
                                <div className="card">
                                    <h3 className="text-sm font-semibold text-white mb-3">Export Documentation</h3>
                                    <div className="space-y-3">
                                        <button className={`btn-ghost w-full justify-start gap-3 ${lastExportedFormat === 'json' ? 'ring-1 ring-brand-500 bg-brand-500/10' : ''}`} onClick={() => runExport('json')}>
                                            <FileDown size={15} className="text-brand-400" /> Export as JSON
                                        </button>
                                        <button className={`btn-ghost w-full justify-start gap-3 ${lastExportedFormat === 'markdown' ? 'ring-1 ring-emerald-500 bg-emerald-500/10' : ''}`} onClick={() => runExport('markdown')}>
                                            <FileDown size={15} className="text-emerald-400" /> Export as Markdown
                                        </button>
                                    </div>
                                </div>
                                {exportData?.json && <CodeBlock code={JSON.stringify(exportData.json, null, 2)} language="json" />}
                                {exportData?.markdown && <CodeBlock code={exportData.markdown} language="markdown" />}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
