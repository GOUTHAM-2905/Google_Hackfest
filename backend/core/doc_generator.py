"""
Documentation generator — LangChain orchestration layer.
Loops through undocumented tables, calls Ollama, validates output,
and writes back to OpenMetadata.
"""
import logging
import re
import time
from typing import Optional

from integrations.openmetadata_client import OpenMetadataClient
from integrations.ollama_client import OllamaClient
from models.table import TableMetadata
from models.quality import TableQualityProfile
from models.documentation import GenerationResult
from prompts.doc_generation import doc_generation_prompt

logger = logging.getLogger(__name__)


def _format_schema_text(table: TableMetadata) -> str:
    lines = []
    for col in table.columns:
        flags = []
        if col.is_primary_key: flags.append("PRIMARY KEY")
        if col.is_foreign_key:  flags.append(f"FK → {col.foreign_key_ref}")
        if not col.is_nullable:  flags.append("NOT NULL")
        flag_str = f"  [{', '.join(flags)}]" if flags else ""
        lines.append(f"  - {col.name} ({col.data_type}){flag_str}")
    return "\n".join(lines)


def _format_fks(table: TableMetadata) -> str:
    fks = [(c.name, c.foreign_key_ref) for c in table.columns if c.is_foreign_key]
    if not fks:
        return "None"
    return "\n".join(f"  - {c} → {ref}" for c, ref in fks)


def _format_low_completeness(profile: Optional[TableQualityProfile]) -> str:
    if not profile:
        return "Profile not available"
    low = [c for c in profile.columns if c.completeness_pct < 80]
    if not low:
        return "None (all columns ≥ 80%)"
    return "\n".join(f"  - {c.column_name}: {c.completeness_pct}%" for c in low)


def _format_freshness_label(profile: Optional[TableQualityProfile]) -> str:
    if not profile or not profile.freshness_timestamp:
        return "Unknown (no timestamp column detected)"
    ts = profile.freshness_timestamp
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    if ts.tzinfo is None:
        from datetime import timezone as tz
        ts = ts.replace(tzinfo=tz.utc)
    delta_h = (now - ts).total_seconds() / 3600
    if delta_h < 1:       label = "Real-time (< 1 hour ago)"
    elif delta_h < 24:    label = "Fresh (< 24 hours ago)"
    elif delta_h < 168:   label = "Recent (< 7 days ago)"
    elif delta_h < 720:   label = "Stale (< 30 days ago)"
    else:                 label = "Very Stale (> 30 days ago)"
    return f"{label} — last updated {ts.strftime('%Y-%m-%d %H:%M UTC')}"


def _parse_llm_output(raw: str) -> tuple[str, str, dict[str, str]]:
    """Extract BUSINESS_SUMMARY, USAGE_RECOMMENDATIONS, and COLUMN_DESCRIPTIONS."""
    def extract_section(text: str, key: str, next_key: Optional[str] = None) -> str:
        pattern = re.compile(rf"{key}:\s*(.*?)(?={next_key}:|$)", re.DOTALL | re.IGNORECASE)
        m = pattern.search(text)
        return m.group(1).strip() if m else ""

    summary = extract_section(raw, "BUSINESS_SUMMARY", "COLUMN_DESCRIPTIONS")
    col_text = extract_section(raw, "COLUMN_DESCRIPTIONS", "USAGE_RECOMMENDATIONS")
    recommendations = extract_section(raw, "USAGE_RECOMMENDATIONS")

    descriptions = {}
    for line in col_text.split("\n"):
        if ":" in line:
            name, desc = line.split(":", 1)
            name = name.strip("- ").strip()
            descriptions[name] = desc.strip()

    return summary, recommendations, descriptions


def _validate_output(summary: str, recommendations: str, descriptions: dict) -> None:
    if len(summary.strip()) < 30:
        raise ValueError(f"Business summary too short ({len(summary)} chars)")
    if len(recommendations.strip()) < 20:
        raise ValueError(f"Usage recommendations too short ({len(recommendations)} chars)")
    if not descriptions:
        raise ValueError("No column descriptions found")


def generate_table_documentation(
    table: TableMetadata,
    profile: Optional[TableQualityProfile],
    ollama: OllamaClient,
    om_client: OpenMetadataClient,
    service_name: str,
    db_name: str = "db",
    schema_name: str = "main",
) -> GenerationResult:
    """Generate AI documentation for a single table and write it to OpenMetadata."""
    logger.info("Generating docs for table: %s", table.table_name)
    q_score = profile.aggregate_score if profile else 0.0
    grade   = profile.grade if profile else "?"
    comp    = profile.overall_completeness_pct if profile else 0.0
    key_uniq = (
        sum(c.distinctness_pct for c in profile.columns if c.column_name in
            {col.name for col in table.columns if col.is_primary_key or col.is_foreign_key})
        / max(1, sum(1 for col in table.columns if col.is_primary_key or col.is_foreign_key))
    ) if profile else 0.0
    row_count = profile.row_count if profile else "Unknown"

    prompt_text = doc_generation_prompt.format(
        table_name=table.table_name,
        schema_text=_format_schema_text(table),
        quality_score=q_score,
        grade=grade,
        completeness_pct=comp,
        uniqueness_pct=round(key_uniq, 1),
        freshness_label=_format_freshness_label(profile),
        row_count=row_count,
        low_completeness_cols=_format_low_completeness(profile),
        fk_relationships=_format_fks(table),
    )

    MAX_RETRIES = 3
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            raw = ollama.generate(prompt_text)
            summary, recommendations, col_descriptions = _parse_llm_output(raw)
            _validate_output(summary, recommendations, col_descriptions)
            break
        except Exception as e:
            logger.warning("Attempt %d/%d failed validation for %s: %s", attempt, MAX_RETRIES, table.table_name, e)
            if attempt == MAX_RETRIES:
                return GenerationResult(
                    table_name=table.table_name,
                    status="error",
                    error=str(e),
                )
            time.sleep(1)

    # Update table object in-place for immediate caching consistency
    for col in table.columns:
        if col.name in col_descriptions:
            col.ai_description = col_descriptions[col.name]

    # Write back to OpenMetadata
    try:
        fqn = table.fully_qualified_name
        # Find table ID
        om_table = om_client.get_table_by_name(fqn)
        if om_table:
            table_id = om_table["id"]
            combined_desc = f"{summary}\n\n**Usage Recommendations:** {recommendations}"
            om_client.patch_description(table_id, combined_desc)
            # Patch column descriptions
            for col_name, desc in col_descriptions.items():
                om_client.patch_column_description(table_id, col_name, desc)
            
            om_client.patch_extension(table_id, "usage_recommendations", recommendations)
            om_client.patch_extension(table_id, "business_summary", summary)
            om_client.patch_extension(table_id, "quality_score", str(q_score))
    except Exception as e:
        logger.warning("Could not write back to OpenMetadata for %s: %s", table.table_name, e)

    return GenerationResult(
        table_name=table.table_name,
        status="success",
        business_summary=summary,
        usage_recommendations=recommendations,
        quality_score=q_score,
    )
