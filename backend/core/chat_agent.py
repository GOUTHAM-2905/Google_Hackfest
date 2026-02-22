"""
Chat agent — intent classification and LangChain-based response synthesis.
Falls back to local schema reflection when OpenMetadata catalog is empty.
"""
import logging
from typing import Optional

from integrations.openmetadata_client import OpenMetadataClient
from integrations.ollama_client import OllamaClient
from prompts.doc_generation import intent_prompt, CHAT_SYSTEM_PROMPT, CHAT_USER_TEMPLATE
from models.chat import ChatResponse

logger = logging.getLogger(__name__)


# Keywords that always mean the user wants a chart/visualisation
_PLOT_KEYWORDS = {
    "plot", "chart", "graph", "visuali", "histogram",
    "bar chart", "pie chart", "line chart", "show me a bar", "show me a pie",
}


def _classify_intent(query: str, ollama: OllamaClient) -> str:
    """Returns 'schema', 'data', 'plot', or 'general'."""
    q_lower = query.lower()
    # Short-circuit: plot requests are always 'plot'
    if any(kw in q_lower for kw in _PLOT_KEYWORDS):
        return "plot"
    prompt = intent_prompt.format(query=query)
    raw = ollama.generate(prompt).lower().strip()
    if "schema" in raw:
        return "schema"
    elif "data" in raw:
        return "data"
    return "general"


def _build_context_from_om(
    query: str,
    om: OpenMetadataClient,
    database_context: Optional[str],
) -> tuple[str, list[str]]:
    """Search OpenMetadata for relevant tables."""
    try:
        results = om.search_tables(query, service_name=database_context)
    except Exception as e:
        logger.warning("OpenMetadata search failed: %s", e)
        return "", []

    if not results:
        return "", []

    referenced = []
    context_lines = []
    for item in results[:5]:
        name = item.get("name", "unknown")
        fqn  = item.get("fullyQualifiedName", name)
        desc = item.get("description") or "No description available."
        referenced.append(name)
        context_lines.append(f"TABLE: {name} ({fqn})\nDESCRIPTION: {desc}\n")
    return "\n".join(context_lines), referenced


def _build_context_from_local(
    service_name: Optional[str],
) -> tuple[str, list[str]]:
    """
    Fallback: build context from the in-memory connection registry using
    SQLAlchemy schema reflection so chat always has table/column information.
    """
    try:
        from api.ingest import _connection_registry
        from core.db_connector import reflect_schema

        if not _connection_registry:
            return "No databases have been connected yet.", []

        # If a specific service is requested, use it; otherwise use first available
        if service_name and service_name in _connection_registry:
            conn_req = _connection_registry[service_name]
        else:
            conn_req = next(iter(_connection_registry.values()))

        tables = reflect_schema(conn_req)
        referenced = [t.table_name for t in tables]
        lines = []
        for t in tables:
            col_summary = ", ".join(
                f"{c.name} ({c.data_type})" for c in t.columns[:8]
            )
            lines.append(
                f"TABLE: {t.table_name}\n"
                f"COLUMNS: {col_summary}\n"
                f"ROWS: {t.row_count or 'unknown'}\n"
            )
        return "\n".join(lines), referenced
    except Exception as e:
        logger.warning("Local schema fallback failed: %s", e)
        return "Schema information unavailable.", []


def _build_context(
    query: str,
    om: OpenMetadataClient,
    database_context: Optional[str],
) -> tuple[str, list[str]]:
    """Try OpenMetadata first; fall back to local schema reflection."""
    ctx, refs = _build_context_from_om(query, om, database_context)
    if ctx:
        return ctx, refs
    logger.info("OpenMetadata returned no results — using local schema fallback")
    return _build_context_from_local(database_context)


def _generate_sql_suggestion(query: str, context: str, ollama: OllamaClient) -> Optional[str]:
    """Generate a SQL query suggestion for data/plot queries."""
    prompt = f"""Based on these table descriptions:
{context}

Generate a valid SQL SELECT query to answer or visualise: "{query}"
Return ONLY the raw SQL with no markdown, no backticks, no explanation.
"""
    try:
        sql = ollama.generate(prompt).strip()
        # Strip markdown fences if the model added them
        for fence in ("```sql", "```SQL", "```"):
            if sql.startswith(fence):
                sql = sql[len(fence):]
        sql = sql.rstrip("`").strip()
        if "SELECT" in sql.upper():
            return sql
    except Exception as e:
        logger.warning("SQL generation failed: %s", e)
    return None


def _extract_sql_from_text(text: str) -> Optional[str]:
    """Extract the first SQL block from a markdown-formatted LLM answer."""
    import re
    # Match ```sql ... ``` or ``` ... ``` blocks
    pattern = re.compile(r"```(?:sql)?\s*([\s\S]*?)```", re.IGNORECASE)
    match = pattern.search(text)
    if match:
        sql = match.group(1).strip()
        if "SELECT" in sql.upper():
            return sql
    # Plain SELECT without fences (last resort)
    idx = text.upper().find("SELECT ")
    if idx != -1:
        candidate = text[idx:].split("\n\n")[0].strip()
        if len(candidate) > 15:
            return candidate
    return None


def handle_chat(
    query: str,
    database_context: Optional[str],
    om: OpenMetadataClient,
    ollama: OllamaClient,
) -> ChatResponse:
    """Main chat handler. Classifies intent, searches metadata, synthesizes answer."""
    intent = _classify_intent(query, ollama)
    logger.info("Chat intent: %s for query: %s", intent, query[:80])

    context_str, referenced = _build_context(query, om, database_context)

    system = CHAT_SYSTEM_PROMPT.format(context=context_str)
    user_msg = CHAT_USER_TEMPLATE.format(query=query)

    messages = [
        {"role": "system", "content": system},
        {"role": "user",   "content": user_msg},
    ]
    answer = ollama.chat(messages)

    suggested_sql: Optional[str] = None

    # Generate SQL for data or plot intents
    if intent in ("data", "plot"):
        suggested_sql = _generate_sql_suggestion(query, context_str, ollama)

    # Fallback: extract SQL that the model may have embedded in its answer text
    if not suggested_sql:
        suggested_sql = _extract_sql_from_text(answer)

    return ChatResponse(
        answer=answer,
        tables_referenced=referenced,
        intent=intent,
        suggested_sql=suggested_sql,
    )
