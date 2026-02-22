/** Chat types */
export type ChatIntent = 'schema' | 'data' | 'general';

export interface ChatRequest {
    query: string;
    database_context?: string;
}

export interface ChatResponse {
    answer: string;
    tables_referenced: string[];
    intent: ChatIntent;
    suggested_sql?: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    tables_referenced?: string[];
    suggested_sql?: string;
    timestamp: Date;
}
