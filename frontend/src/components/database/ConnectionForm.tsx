import React, { useState } from 'react';
import { Database, FolderOpen, X } from 'lucide-react';
import type { ConnectionRequest } from '../../types/connection';

interface Props {
    onSubmit: (req: ConnectionRequest) => Promise<void>;
    onCancel?: () => void;
    loading?: boolean;
}

export default function ConnectionForm({ onSubmit, onCancel, loading }: Props) {
    const [dbType, setDbType] = useState<'sqlite' | 'postgresql'>('sqlite');
    const [form, setForm] = useState({
        service_name: '', file_path: '', host: 'localhost',
        port: 5432, database: '', username: '', password: '',
    });
    const [error, setError] = useState('');

    const set = (k: string, v: string | number) => setForm((p) => ({ ...p, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!form.service_name.trim()) { setError('Service name is required'); return; }
        const req: ConnectionRequest = { db_type: dbType, service_name: form.service_name.trim() };
        if (dbType === 'sqlite') {
            if (!form.file_path.trim()) { setError('File path is required for SQLite'); return; }
            req.file_path = form.file_path.trim();
        } else {
            if (!form.host || !form.database || !form.username) { setError('Host, database, and username are required'); return; }
            req.host = form.host; req.port = form.port; req.database = form.database;
            req.username = form.username; req.password = form.password;
        }
        try { await onSubmit(req); }
        catch (err: any) { setError(err.message || 'Connection failed'); }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* DB Type toggle */}
            <div>
                <label className="label">Database Type</label>
                <div className="flex gap-2">
                    {(['sqlite', 'postgresql'] as const).map((t) => (
                        <button type="button" key={t}
                            onClick={() => setDbType(t)}
                            className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-all ${dbType === t
                                    ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                                    : 'bg-surface-700 border-surface-500 text-slate-400 hover:text-slate-200'
                                }`}
                        >
                            {t === 'sqlite' ? '🗂 SQLite' : '🐘 PostgreSQL'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Service name */}
            <div>
                <label className="label">Connection Name</label>
                <input className="input" placeholder="e.g. my_sales_db" value={form.service_name} onChange={(e) => set('service_name', e.target.value)} />
            </div>

            {/* SQLite fields */}
            {dbType === 'sqlite' && (
                <div>
                    <label className="label">File Path</label>
                    <div className="relative">
                        <FolderOpen size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input className="input pl-9" placeholder="/path/to/database.db" value={form.file_path} onChange={(e) => set('file_path', e.target.value)} />
                    </div>
                </div>
            )}

            {/* PostgreSQL fields */}
            {dbType === 'postgresql' && (
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label className="label">Host</label>
                            <input className="input" value={form.host} onChange={(e) => set('host', e.target.value)} />
                        </div>
                        <div>
                            <label className="label">Port</label>
                            <input className="input" type="number" value={form.port} onChange={(e) => set('port', parseInt(e.target.value))} />
                        </div>
                    </div>
                    <div>
                        <label className="label">Database</label>
                        <input className="input" placeholder="my_database" value={form.database} onChange={(e) => set('database', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Username</label>
                            <input className="input" value={form.username} onChange={(e) => set('username', e.target.value)} />
                        </div>
                        <div>
                            <label className="label">Password</label>
                            <input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400">
                    <X size={14} />{error}
                </div>
            )}

            <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                    <Database size={15} />
                    {loading ? 'Connecting…' : 'Connect & Ingest'}
                </button>
                {onCancel && (
                    <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
                )}
            </div>
        </form>
    );
}
