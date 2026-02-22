import { api } from './client';
import type { ConnectionRequest, ConnectionResponse, ConnectionListItem } from '../types/connection';

export const ingestConnection = (req: ConnectionRequest): Promise<ConnectionResponse> =>
    api.post('/api/ingest', req).then((r) => r.data);

export const getConnections = (): Promise<{ connections: ConnectionListItem[] }> =>
    api.get('/api/connections').then((r) => r.data);

export const deleteConnection = (serviceName: string): Promise<{ message: string }> =>
    api.delete(`/api/connections/${serviceName}`).then((r) => r.data);

export const checkHealth = () =>
    api.get('/api/health').then((r) => r.data);
