/** Quality metric types */
export interface ColumnQuality {
    column_name: string;
    completeness_pct: number;
    distinctness_pct: number;
    null_count: number;
    distinct_count: number;
}

export interface TableQualityProfile {
    table_name: string;
    row_count: number;
    freshness_timestamp?: string;
    overall_completeness_pct: number;
    aggregate_score: number;
    grade: string;
    badge_color: 'green' | 'amber' | 'red' | 'critical';
    columns: ColumnQuality[];
    profiled_at: string;
}
