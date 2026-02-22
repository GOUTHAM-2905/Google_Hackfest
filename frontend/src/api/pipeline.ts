import { api } from './client';
import type { TableQualityProfile } from '../types/quality';

export const profileTable = (serviceName: string, tableName?: string): Promise<TableQualityProfile | { profiles: TableQualityProfile[] }> =>
    api.post('/api/profile', { service_name: serviceName, table_name: tableName }).then((r) => r.data);

export const generateDocs = (serviceName: string, tableName?: string) =>
    api.post('/api/generate', { service_name: serviceName, table_name: tableName }).then((r) => r.data);

export const exportTable = (serviceName: string, tableName: string, format: 'json' | 'markdown' | 'both' = 'json') =>
    api.get(`/api/export/${serviceName}/${tableName}`, { params: { format } }).then((r) => r.data);

export const getLineage = (serviceName: string) =>
    api.get(`/api/lineage/${serviceName}`).then((r) => r.data);

export const getAlerts = (serviceName: string) =>
    api.get(`/api/alerts/${serviceName}`).then((r) => r.data);

/** Lightweight change check — only runs COUNT(*) per table on the backend. */
export const checkChanges = (serviceName: string) =>
    api.get(`/api/changes/${serviceName}`).then((r) => r.data);

/** Execute SQL from chat and return chart-ready data. */
export const runPlot = (serviceName: string, sql: string, chartType = 'bar') =>
    api.post('/api/plot', { service_name: serviceName, sql, chart_type: chartType }).then((r) => r.data);
