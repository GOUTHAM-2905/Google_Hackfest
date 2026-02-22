import React, { useEffect, useState } from 'react';
import { Settings, CheckCircle2, XCircle, RefreshCw, Trash2 } from 'lucide-react';
import { checkHealth, getConnections, deleteConnection } from '../api/connections';
import { useDatabaseContext } from '../context/DatabaseContext';
import Header from '../components/layout/Header';
import LoadingSpinner from '../components/shared/LoadingSpinner';

export default function SettingsView() {
    const { connections, removeConnection } = useDatabaseContext();
    const [health, setHealth] = useState<any>(null);
    const [healthLoading, setHealthLoading] = useState(false);

    const fetchHealth = async () => {
        setHealthLoading(true);
        try { setHealth(await checkHealth()); }
        catch { setHealth({ status: 'error' }); }
        finally { setHealthLoading(false); }
    };

    useEffect(() => { fetchHealth(); }, []);

    const StatusIcon = ({ up }: { up: boolean }) =>
        up ? <CheckCircle2 size={15} className="text-emerald-400" /> : <XCircle size={15} className="text-rose-400" />;

    return (
        <div className="flex flex-col h-full">
            <Header title="Settings" subtitle="System status and connection management"
                actions={<button className="btn-ghost" onClick={fetchHealth}><RefreshCw size={14} />Refresh</button>}
            />
            <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-2xl">
                {/* System Health */}
                <section>
                    <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">System Health</h2>
                    {healthLoading ? <LoadingSpinner size="sm" text="Checking services…" /> : (
                        <div className="space-y-2">
                            {health?.services && Object.entries(health.services).map(([svc, info]: [string, any]) => (
                                <div key={svc} className="card flex items-center gap-4 py-3">
                                    <StatusIcon up={info.status === 'up'} />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-white capitalize">{svc}</div>
                                        {info.url && <div className="text-xs text-slate-500">{info.url}</div>}
                                        {info.model && <div className="text-xs text-slate-500">Model: {info.model}</div>}
                                        {info.error && <div className="text-xs text-rose-400">{info.error}</div>}
                                    </div>
                                    <span className={`badge-${info.status === 'up' ? 'green' : 'red'}`}>{info.status}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Connections */}
                <section>
                    <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Saved Connections</h2>
                    {connections.length === 0 ? (
                        <div className="text-sm text-slate-500">No connections yet. Go to Dashboard to add one.</div>
                    ) : (
                        <div className="space-y-2">
                            {connections.map((c) => (
                                <div key={c.service_name} className="card flex items-center gap-4 py-3">
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-white">{c.service_name}</div>
                                        <div className="text-xs text-slate-400">{c.db_type} {c.host ? `· ${c.host}/${c.database}` : c.file_path ? `· ${c.file_path}` : ''}</div>
                                    </div>
                                    <button className="btn-danger py-1.5 px-2.5" onClick={async () => { await deleteConnection(c.service_name); removeConnection(c.service_name); }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Config info */}
                <section>
                    <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Configuration</h2>
                    <div className="card space-y-3 text-sm">
                        {[
                            ['API URL', import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'],
                            ['LLM Model', 'qwen2.5-coder:3b'],
                            ['Scoring Weights', 'Completeness 50% · Uniqueness 30% · Freshness 20%'],
                        ].map(([k, v]) => (
                            <div key={k} className="flex gap-4">
                                <span className="text-slate-400 w-36 shrink-0">{k}</span>
                                <span className="text-slate-200 font-mono text-xs">{v}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
