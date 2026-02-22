/** Connection types */
export type DbType = 'sqlite' | 'postgresql';

export interface ConnectionRequest {
    db_type: DbType;
    service_name: string;
    file_path?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
}

export interface ConnectionResponse {
    service_name: string;
    tables_ingested: number;
    duration_seconds: number;
    tables: string[];
}

export interface ConnectionListItem {
    service_name: string;
    db_type: DbType;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    file_path?: string;
    status: string;
}
