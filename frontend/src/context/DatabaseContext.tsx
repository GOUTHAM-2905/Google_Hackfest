/**
 * DatabaseContext — persists connections AND full credentials to localStorage.
 * On app load, saved connections are restored and auto-re-ingested so the
 * backend in-memory registry is always warm.
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { ConnectionListItem } from '../types/connection';
import { api } from '../api/client';

const STORAGE_KEY = 'turgon_connections_v2';
const CRED_KEY = 'turgon_credentials_v2';
const PROFILE_KEY = 'turgon_profiles_v2';

// ── Types ─────────────────────────────────────────────────────────────────────
/** Full stored credential including password (stored only in localStorage) */
export interface StoredConnection extends ConnectionListItem {
    port?: number;
    username?: string;
    password?: string;       // stored for auto-reconnect only
}

interface DatabaseContextValue {
    connections: StoredConnection[];
    activeService: string | null;
    profileCache: Record<string, any[]>;          // service → profile list
    setConnections: (c: StoredConnection[]) => void;
    setActiveService: (s: string | null) => void;
    addConnection: (c: StoredConnection) => void;
    removeConnection: (name: string) => void;
    updateProfileCache: (svc: string, profiles: any[]) => void;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadLS<T>(key: string, fallback: T): T {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
}
function saveLS(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function DatabaseProvider({ children }: { children: ReactNode }) {
    const [connections, setConnectionsRaw] = useState<StoredConnection[]>(() => loadLS(STORAGE_KEY, []));
    const [activeService, setActiveServiceRaw] = useState<string | null>(null);
    const [profileCache, setProfileCacheRaw] = useState<Record<string, any[]>>(() => loadLS(PROFILE_KEY, {}));

    // ── Persist to localStorage whenever state changes ────────────────────
    useEffect(() => { saveLS(STORAGE_KEY, connections); }, [connections]);
    useEffect(() => { saveLS(PROFILE_KEY, profileCache); }, [profileCache]);

    // ── Auto-reconnect on startup ─────────────────────────────────────────
    //  The FastAPI backend holds connections in memory — they're lost on restart.
    //  Re-ingest every saved connection silently when the app loads.
    useEffect(() => {
        const creds: Record<string, StoredConnection> = loadLS(CRED_KEY, {});
        connections.forEach(async (c) => {
            const cred = creds[c.service_name] || c;
            try {
                await api.post('/api/ingest', {
                    db_type: cred.db_type,
                    service_name: cred.service_name,
                    host: cred.host,
                    port: cred.port,
                    database: cred.database,
                    username: cred.username,
                    password: cred.password,
                    file_path: cred.file_path,
                });
            } catch {
                // Connection might already be registered; ignore 4xx errors
            }
        });
        // Only run on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── State setters ─────────────────────────────────────────────────────
    const setConnections = (c: StoredConnection[]) => setConnectionsRaw(c);
    const setActiveService = (s: string | null) => setActiveServiceRaw(s);

    const addConnection = (c: StoredConnection) => {
        setConnectionsRaw(prev => {
            const next = prev.find(x => x.service_name === c.service_name)
                ? prev.map(x => x.service_name === c.service_name ? { ...x, ...c } : x)
                : [...prev, c];
            return next;
        });
        // Persist full credentials (including password) separately
        const creds: Record<string, StoredConnection> = loadLS(CRED_KEY, {});
        creds[c.service_name] = c;
        saveLS(CRED_KEY, creds);
    };

    const removeConnection = (name: string) => {
        setConnectionsRaw(prev => prev.filter(c => c.service_name !== name));
        if (activeService === name) setActiveServiceRaw(null);
        // Remove credentials
        const creds: Record<string, StoredConnection> = loadLS(CRED_KEY, {});
        delete creds[name];
        saveLS(CRED_KEY, creds);
        // Remove cached profiles
        setProfileCacheRaw(prev => { const n = { ...prev }; delete n[name]; return n; });
    };

    const updateProfileCache = (svc: string, profiles: any[]) => {
        setProfileCacheRaw(prev => ({ ...prev, [svc]: profiles }));
    };

    return (
        <DatabaseContext.Provider value={{
            connections, activeService, profileCache,
            setConnections, setActiveService,
            addConnection, removeConnection, updateProfileCache,
        }}>
            {children}
        </DatabaseContext.Provider>
    );
}

export function useDatabaseContext() {
    const ctx = useContext(DatabaseContext);
    if (!ctx) throw new Error('useDatabaseContext must be used within DatabaseProvider');
    return ctx;
}
