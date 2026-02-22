/** Table and column metadata types */
export interface ColumnMetadata {
    name: string;
    data_type: string;
    is_nullable: boolean;
    is_primary_key: boolean;
    is_foreign_key: boolean;
    foreign_key_ref?: string;
    ai_description?: string;
}

export interface TableMetadata {
    table_name: string;
    fully_qualified_name: string;
    columns: ColumnMetadata[];
    row_count?: number;
    business_summary?: string;
    usage_recommendations?: string;
    is_documented: boolean;
}
