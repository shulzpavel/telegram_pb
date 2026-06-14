"""Pure helpers for monthly scope / buffer dashboards."""

from __future__ import annotations

import copy
import secrets
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from app.utils.jira_role_contributors import attribution_tier, person_bucket_key

IntakeStatus = Literal["ok", "warning", "stop"]
ScopeSectionKind = Literal["planned", "unplanned"]

ACTIVE_STATUS_CATEGORIES = frozenset({"new", "indeterminate"})


def month_start_iso(month: str) -> str:
    """Return ISO timestamp for the first instant of ``YYYY-MM`` (UTC)."""
    year, month_num = month.split("-", 1)
    start = datetime(int(year), int(month_num), 1, tzinfo=timezone.utc)
    return start.isoformat()


def _parse_created(created: Optional[str]) -> Optional[datetime]:
    if not created:
        return None
    normalized = created.replace("Z", "+00:00")
    if len(normalized) >= 5 and normalized[-5] in "+-" and normalized[-3] != ":":
        normalized = f"{normalized[:-2]}:{normalized[-2:]}"
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def is_scope_creep(created: Optional[str], month: str) -> bool:
    created_at = _parse_created(created)
    if created_at is None:
        return False
    start = _parse_created(month_start_iso(month))
    if start is None:
        return False
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return created_at >= start


def _story_points_value(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw) if raw > 0 else None
    return None


def _string_list(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw if item]


def normalize_scope_issue(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a Jira issue dict into the scope-board snapshot shape."""
    status = raw.get("status") if isinstance(raw.get("status"), dict) else {}
    issue_type = raw.get("issue_type") if isinstance(raw.get("issue_type"), dict) else {}
    sp = _story_points_value(raw.get("story_points"))
    return {
        "key": str(raw.get("key") or ""),
        "summary": str(raw.get("summary") or ""),
        "url": str(raw.get("url") or ""),
        "story_points": sp,
        "story_points_source": raw.get("story_points_source"),
        "story_points_plan": _story_points_value(raw.get("story_points_plan")),
        "story_points_fact": _story_points_value(raw.get("story_points_fact")),
        "story_points_dev": _story_points_value(raw.get("story_points_dev")),
        "story_points_test": _story_points_value(raw.get("story_points_test")),
        "story_points_front": _story_points_value(raw.get("story_points_front")),
        "story_points_back": _story_points_value(raw.get("story_points_back")),
        "story_points_qa": _story_points_value(raw.get("story_points_qa")),
        "story_point_estimate": _story_points_value(raw.get("story_point_estimate")),
        "estimated": sp is not None,
        "status": str(status.get("name") or raw.get("status_name") or ""),
        "status_category": str(status.get("category") or raw.get("status_category") or ""),
        "issue_type": str(issue_type.get("name") or raw.get("issue_type") or ""),
        "labels": [str(label) for label in (raw.get("labels") or []) if label],
        "created": raw.get("created"),
        "updated": raw.get("updated"),
        "status_changed_at": raw.get("status_changed_at"),
        "status_entered_at": raw.get("status_entered_at"),
        "epic_linked_at": raw.get("epic_linked_at"),
        "due_date": raw.get("due_date"),
        "resolution": str(raw.get("resolution") or ""),
        "resolution_date": raw.get("resolution_date"),
        "parent_key": raw.get("parent_key"),
        "epic_key": raw.get("epic_key") or raw.get("parent_key"),
        "priority": str(raw.get("priority") or ""),
        "assignee": str(raw.get("assignee") or ""),
        "developer": str(raw.get("developer") or raw.get("assignee") or ""),
        "developer_source": str(raw.get("developer_source") or "fallback"),
        "role_contributors": raw.get("role_contributors") if isinstance(raw.get("role_contributors"), dict) else {},
        "role_contributors_list": raw.get("role_contributors_list") if isinstance(raw.get("role_contributors_list"), list) else [],
        "role_workload_items": raw.get("role_workload_items") if isinstance(raw.get("role_workload_items"), list) else [],
        "role_evidence": raw.get("role_evidence") if isinstance(raw.get("role_evidence"), list) else [],
        "reporter": str(raw.get("reporter") or ""),
        "components": _string_list(raw.get("components")),
        "fix_versions": _string_list(raw.get("fix_versions")),
        "versions": _string_list(raw.get("versions")),
        "sprints": _string_list(raw.get("sprints")),
        "sprint": str(raw.get("sprint") or ""),
        "team": str(raw.get("team") or ""),
        "team_labels": _string_list(raw.get("team_labels")),
        "plan_status": str(raw.get("plan_status") or ""),
        "plan_change_reason": str(raw.get("plan_change_reason") or ""),
        "plan_change_reasons": _string_list(raw.get("plan_change_reasons") or raw.get("plan_change_reason")),
        "final_priority": str(raw.get("final_priority") or ""),
        "severity": str(raw.get("severity") or ""),
        "domain": str(raw.get("domain") or ""),
        "request_type": str(raw.get("request_type") or ""),
        "checklist_progress": raw.get("checklist_progress") if isinstance(raw.get("checklist_progress"), (int, float)) else None,
        "last_comment": str(raw.get("last_comment") or ""),
        "last_comment_author": str(raw.get("last_comment_author") or ""),
        "last_comment_at": raw.get("last_comment_at"),
    }


def _is_active_issue(issue: dict[str, Any]) -> bool:
    category = str(issue.get("status_category") or "").lower()
    if category:
        return category in ACTIVE_STATUS_CATEGORIES
    status = str(issue.get("status") or "").lower()
    return status not in {"done", "closed", "resolved", "cancelled", "canceled"}


def _sum_sp(issues: list[dict[str, Any]]) -> float:
    total = 0.0
    for issue in issues:
        sp = issue.get("story_points")
        if isinstance(sp, (int, float)) and sp > 0:
            total += float(sp)
    return total


def _status_breakdown(issues: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for issue in issues:
        label = str(issue.get("status") or "Unknown")
        counts[label] = counts.get(label, 0) + 1
    return counts


_UNASSIGNED_ASSIGNEE = "Не назначен"
_GITLAB_ROLE_SOURCES = {
    "gitlab_mr",
    "gitlab_commit",
    "subtask_gitlab_mr",
    "subtask_gitlab_commit",
    "gitlab_api_mr",
    "gitlab_api_commit",
    "subtask_gitlab_api_mr",
    "subtask_gitlab_api_commit",
}
_GITLAB_API_SOURCES = {"gitlab_api_mr", "gitlab_api_commit", "subtask_gitlab_api_mr", "subtask_gitlab_api_commit"}
_ESTIMATED_ROLE_SOURCES = {"changelog_dev", "testing_comment"}
_QA_ROLE_SOURCES = {"changelog", "current", "testing_comment"}
_TRUSTED_ROLE_SOURCES = {
    "front": _GITLAB_ROLE_SOURCES | _ESTIMATED_ROLE_SOURCES,
    "back": _GITLAB_ROLE_SOURCES | _ESTIMATED_ROLE_SOURCES,
    "qa": _QA_ROLE_SOURCES,
}
_UNATTRIBUTED_ROLE = "Не атрибутировано"
_FRONT_MARKERS = ("frontend", "front-end", "front", "ui", "web")
_BACK_MARKERS = ("backend", "back-end", "back", "api", "server")


def _developer_task_summary(issue: dict[str, Any]) -> dict[str, Any]:
    sp = issue.get("story_points")
    return {
        "key": str(issue.get("key") or ""),
        "summary": str(issue.get("summary") or ""),
        "url": str(issue.get("url") or ""),
        "story_points": float(sp) if isinstance(sp, (int, float)) else None,
        "status": str(issue.get("status") or ""),
        "assignee": str(issue.get("assignee") or ""),
        "developer_source": str(issue.get("developer_source") or ""),
    }


def _norm_role_name(payload: Any) -> str:
    if isinstance(payload, dict):
        return str(payload.get("name") or "").strip()
    return str(payload or "").strip()


def _role_source(payload: Any) -> str:
    if isinstance(payload, dict):
        return str(payload.get("source") or "").strip()
    return ""


def _trusted_role_name(issue: dict[str, Any], role: str) -> str:
    contributors = issue.get("role_contributors") if isinstance(issue.get("role_contributors"), dict) else {}
    payload = contributors.get(role)
    name = _norm_role_name(payload)
    source = _role_source(payload)
    if not name or source not in _TRUSTED_ROLE_SOURCES.get(role, set()):
        return ""
    return name


def _issue_marker_values(issue: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for field in ("labels", "components"):
        raw = issue.get(field)
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, dict):
                    values.extend(str(item.get(key) or "") for key in ("name", "value", "title"))
                else:
                    values.append(str(item or ""))
        elif raw:
            values.append(str(raw))
    return [value.strip().lower() for value in values if value and value.strip()]


def _issue_matches_engineering_role(issue: dict[str, Any], role: str) -> bool:
    markers = _FRONT_MARKERS if role == "front" else _BACK_MARKERS if role == "back" else ()
    if not markers:
        return False
    return any(any(marker in value for marker in markers) for value in _issue_marker_values(issue))


def _attributed_engineering_roles(issue: dict[str, Any]) -> list[str]:
    return [role for role in ("front", "back") if _trusted_role_name(issue, role)]


def _role_workload_items(issue: dict[str, Any], role: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in issue.get("role_workload_items") or []:
        if not isinstance(item, dict):
            continue
        if str(item.get("role") or "") != role:
            continue
        if _role_source(item) not in _GITLAB_ROLE_SOURCES:
            continue
        name = _norm_role_name(item)
        if name:
            rows.append(item)
    return rows


def _issue_has_role_attribution(issue: dict[str, Any], role: str) -> bool:
    if _role_workload_items(issue, role):
        return True
    return bool(_trusted_role_name(issue, role))


def _role_bucket_key(name: str) -> str:
    if name == _UNATTRIBUTED_ROLE:
        return name
    return person_bucket_key(name)


def _prefer_display_name(current: str, candidate: str) -> str:
    if not current or current == _UNATTRIBUTED_ROLE:
        return candidate
    if not candidate or candidate == _UNATTRIBUTED_ROLE:
        return current
    return candidate if len(candidate) > len(current) else current


def _issue_unresolved_reason(issue: dict[str, Any], role: str) -> str:
    for item in issue.get("role_evidence") or []:
        if not isinstance(item, dict):
            continue
        if str(item.get("role") or "") == role:
            reason = str(item.get("unresolved_reason") or "").strip()
            if reason:
                return reason
    return ""


def _role_source_is_gitlab_api(source: str) -> bool:
    return source in _GITLAB_API_SOURCES


def _role_attribution_tier(issue: dict[str, Any], role: str) -> str:
    if _role_workload_items(issue, role):
        return "confirmed"
    name = _trusted_role_name(issue, role)
    if name:
        contributors = issue.get("role_contributors") if isinstance(issue.get("role_contributors"), dict) else {}
        payload = contributors.get(role)
        return attribution_tier(_role_source(payload))
    if role in {"front", "back"} and _issue_matches_engineering_role(issue, role):
        return "unattributed"
    if role == "qa":
        return "unattributed"
    return "none"


def _parent_role_sp(issue: dict[str, Any], role: str) -> float:
    field_by_role = {
        "front": "story_points_front",
        "back": "story_points_back",
        "qa": "story_points_qa",
    }
    specific = issue.get(field_by_role.get(role, ""))
    if isinstance(specific, (int, float)) and specific > 0:
        return float(specific)
    if role == "qa":
        test_sp = issue.get("story_points_test")
        if isinstance(test_sp, (int, float)) and test_sp > 0:
            return float(test_sp)
    sp = issue.get("story_points")
    if isinstance(sp, (int, float)) and sp > 0:
        return float(sp)
    return 0.0


def _role_workload_slices(issue: dict[str, Any], role: str) -> list[tuple[str, dict[str, Any]]]:
    subtask_items = _role_workload_items(issue, role)
    if subtask_items:
        parent_sp = _parent_role_sp(issue, role)
        total = len(subtask_items)
        share = parent_sp / total if total and parent_sp > 0 else 0.0
        grouped: dict[str, dict[str, Any]] = {}
        for item in subtask_items:
            name = _norm_role_name(item)
            entry = grouped.setdefault(name, {"count": 0, "story_points": 0.0, "subtasks": []})
            entry["count"] += 1
            entry["story_points"] += share
            subtask_key = str(item.get("subtask_key") or "")
            if subtask_key:
                entry["subtasks"].append(subtask_key)
        return list(grouped.items())

    name = _trusted_role_name(issue, role)
    if name:
        return [(name, {"count": 1, "story_points": _role_sp(issue, role), "subtasks": []})]

    if role in {"front", "back"} and _issue_matches_engineering_role(issue, role):
        return [(_UNATTRIBUTED_ROLE, {"count": 1, "story_points": _parent_role_sp(issue, role), "subtasks": []})]
    return []


def _role_scope_matches(issue: dict[str, Any], role: str) -> bool:
    if _issue_has_role_attribution(issue, role):
        return True
    if role in {"front", "back"}:
        return _issue_matches_engineering_role(issue, role)
    return False


def _role_sp(issue: dict[str, Any], role: str) -> float:
    field_by_role = {
        "front": "story_points_front",
        "back": "story_points_back",
        "qa": "story_points_qa",
    }
    specific = issue.get(field_by_role.get(role, ""))
    if isinstance(specific, (int, float)) and specific > 0:
        return float(specific)

    if role == "qa":
        test_sp = issue.get("story_points_test")
        if isinstance(test_sp, (int, float)) and test_sp > 0:
            return float(test_sp)

    if not _role_scope_matches(issue, role):
        return 0.0

    if role in {"front", "back"}:
        sp = issue.get("story_points")
        if isinstance(sp, (int, float)) and sp > 0:
            return float(sp)
        return 0.0

    sp = issue.get("story_points")
    if isinstance(sp, (int, float)) and sp > 0:
        return float(sp)
    return 0.0


def _role_task_summary(issue: dict[str, Any], *, role: str = "", subtasks: Optional[list[str]] = None) -> dict[str, Any]:
    summary = _developer_task_summary(issue)
    summary["role_contributors_list"] = issue.get("role_contributors_list") or []
    summary["front"] = _trusted_role_name(issue, "front")
    summary["back"] = _trusted_role_name(issue, "back")
    summary["qa"] = _trusted_role_name(issue, "qa")
    unresolved = {
        role: _issue_unresolved_reason(issue, role)
        for role in ("front", "back", "qa")
        if _issue_unresolved_reason(issue, role)
    }
    if unresolved:
        summary["role_unresolved"] = unresolved
    if subtasks:
        summary["subtasks"] = subtasks
    if role:
        role_sp = _role_sp(issue, role)
        summary["story_points"] = role_sp if role_sp > 0 else summary.get("story_points")
    return summary


def _role_breakdown(issues: list[dict[str, Any]], role: str, *, max_items: int = 10) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for issue in issues:
        if role == "qa":
            name = _trusted_role_name(issue, role)
            if not name:
                continue
            slices = [(name, {"count": 1, "story_points": _role_sp(issue, role), "subtasks": []})]
        else:
            slices = _role_workload_slices(issue, role)
        for name, payload in slices:
            bucket_key = _role_bucket_key(name)
            entry = buckets.setdefault(
                bucket_key,
                {"developer": name, "story_points": 0.0, "count": 0, "issues": []},
            )
            entry["developer"] = _prefer_display_name(str(entry.get("developer") or ""), name)
            entry["count"] += int(payload.get("count") or 0)
            entry["story_points"] += float(payload.get("story_points") or 0)
            task_summary = _role_task_summary(
                issue,
                role=role,
                subtasks=payload.get("subtasks") if isinstance(payload.get("subtasks"), list) else None,
            )
            slice_sp = float(payload.get("story_points") or 0)
            if slice_sp > 0:
                task_summary["story_points"] = slice_sp
            entry["issues"].append(task_summary)

    rows = sorted(
        buckets.values(),
        key=lambda item: (-float(item["story_points"]), -int(item["count"]), str(item["developer"])),
    )
    for row in rows:
        row["issues"] = sorted(
            row["issues"],
            key=lambda task: (-(task.get("story_points") or 0), str(task.get("key") or "")),
        )

    if len(rows) <= max_items:
        return rows

    top = rows[: max_items - 1]
    rest = rows[max_items - 1 :]
    others = {
        "developer": "Прочие",
        "story_points": sum(float(row["story_points"]) for row in rest),
        "count": sum(int(row["count"]) for row in rest),
        "issues": [task for row in rest for task in row["issues"]],
    }
    return top + [others]


def _role_metrics(issues: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    return {
        "front": _role_breakdown(issues, "front"),
        "back": _role_breakdown(issues, "back"),
        "qa": _role_breakdown(issues, "qa"),
    }


def _role_coverage(issues: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    coverage: dict[str, dict[str, int]] = {}
    for role in ("front", "back", "qa"):
        total = (
            sum(1 for issue in issues if _role_scope_matches(issue, role))
            if role in {"front", "back"}
            else len(issues)
        )
        confirmed = estimated = unattributed = 0
        confirmed_gitlab = confirmed_jira_qa = 0
        unresolved_no_gitlab_link = unresolved_ambiguous_role = unresolved_no_qa_transition = 0
        for issue in issues:
            if role in {"front", "back"} and not _role_scope_matches(issue, role):
                continue
            tier = _role_attribution_tier(issue, role)
            contributors = issue.get("role_contributors") if isinstance(issue.get("role_contributors"), dict) else {}
            payload = contributors.get(role)
            source = _role_source(payload)
            if tier == "confirmed":
                confirmed += 1
                if role == "qa" and source in {"changelog", "current"}:
                    confirmed_jira_qa += 1
                elif role in {"front", "back"} and (
                    _role_source_is_gitlab_api(source)
                    or any(_role_source_is_gitlab_api(_role_source(item)) for item in (issue.get("role_workload_items") or []) if isinstance(item, dict))
                    or source in _GITLAB_ROLE_SOURCES
                ):
                    confirmed_gitlab += 1
            elif tier == "estimated":
                estimated += 1
            elif tier == "unattributed":
                unattributed += 1
                reason = _issue_unresolved_reason(issue, role)
                if reason == "unresolved_no_gitlab_link":
                    unresolved_no_gitlab_link += 1
                elif reason == "unresolved_ambiguous_role":
                    unresolved_ambiguous_role += 1
                elif reason == "unresolved_no_qa_transition":
                    unresolved_no_qa_transition += 1
                elif role == "qa":
                    unresolved_no_qa_transition += 1
                elif role in {"front", "back"}:
                    unresolved_no_gitlab_link += 1
        role_coverage = {
            "attributed": confirmed + estimated,
            "total": total,
            "confirmed": confirmed,
            "estimated": estimated,
            "unattributed": unattributed,
        }
        if role in {"front", "back"}:
            role_coverage["confirmed_gitlab"] = confirmed_gitlab
            role_coverage["unresolved_no_gitlab_link"] = unresolved_no_gitlab_link
            role_coverage["unresolved_ambiguous_role"] = unresolved_ambiguous_role
        if role == "qa":
            role_coverage["confirmed_jira_qa"] = confirmed_jira_qa
            role_coverage["unresolved_no_qa_transition"] = unresolved_no_qa_transition
        coverage[role] = role_coverage
    return coverage


def _developer_breakdown(issues: list[dict[str, Any]], *, max_items: int = 10) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for issue in issues:
        developer = str(issue.get("developer") or "").strip() or _UNASSIGNED_ASSIGNEE
        entry = buckets.setdefault(
            developer,
            {"developer": developer, "story_points": 0.0, "count": 0, "issues": []},
        )
        entry["count"] += 1
        sp = issue.get("story_points")
        if isinstance(sp, (int, float)) and sp > 0:
            entry["story_points"] += float(sp)
        entry["issues"].append(_role_task_summary(issue))

    rows = sorted(
        buckets.values(),
        key=lambda item: (-float(item["story_points"]), -int(item["count"]), str(item["developer"])),
    )
    for row in rows:
        row["issues"] = sorted(
            row["issues"],
            key=lambda task: (-(task.get("story_points") or 0), str(task.get("key") or "")),
        )

    if len(rows) <= max_items:
        return rows

    top = rows[: max_items - 1]
    rest = rows[max_items - 1 :]
    others = {
        "developer": "Прочие",
        "story_points": sum(float(row["story_points"]) for row in rest),
        "count": sum(int(row["count"]) for row in rest),
        "issues": [task for row in rest for task in row["issues"]],
    }
    return top + [others]


def _assignee_breakdown(issues: list[dict[str, Any]], *, max_items: int = 10) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for issue in issues:
        assignee = str(issue.get("assignee") or "").strip() or _UNASSIGNED_ASSIGNEE
        entry = buckets.setdefault(
            assignee,
            {"assignee": assignee, "story_points": 0.0, "count": 0},
        )
        entry["count"] += 1
        sp = issue.get("story_points")
        if isinstance(sp, (int, float)) and sp > 0:
            entry["story_points"] += float(sp)

    rows = sorted(
        buckets.values(),
        key=lambda item: (-float(item["story_points"]), -int(item["count"]), str(item["assignee"])),
    )
    if len(rows) <= max_items:
        return rows

    top = rows[: max_items - 1]
    rest = rows[max_items - 1 :]
    others = {
        "assignee": "Прочие",
        "story_points": sum(float(row["story_points"]) for row in rest),
        "count": sum(int(row["count"]) for row in rest),
    }
    return top + [others]


def _plan_status_counts(issues: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for issue in issues:
        label = str(issue.get("plan_status") or "").strip() or "Не указан"
        counts[label] = counts.get(label, 0) + 1
    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def _plan_change_reason_counts(issues: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for issue in issues:
        reasons = issue.get("plan_change_reasons")
        if not isinstance(reasons, list) or not reasons:
            single = str(issue.get("plan_change_reason") or "").strip()
            reasons = [single] if single else []
        for reason in reasons:
            label = str(reason or "").strip()
            if not label:
                continue
            counts[label] = counts.get(label, 0) + 1
    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


_PAUSE_STATUS_KEYWORDS = ("пауз", "pause", "on hold", "blocked")
_TEST_STATUS_KEYWORDS = ("тестир", "testing", " in test", "to test", "к тест")
_DONE_STATUS_NAMES = frozenset({"готово", "done", "closed", "resolved", "cancelled", "canceled", "won't do", "wont do"})


def _status_tokens(issue: dict[str, Any]) -> tuple[str, str]:
    status = str(issue.get("status") or "").lower().strip()
    category = str(issue.get("status_category") or "").lower()
    return status, category


def classify_scope_report_bucket(issue: dict[str, Any]) -> Literal["in_work", "in_test", "done", "open_questions"]:
    """Bucket an issue for the monthly scope status report."""
    status, category = _status_tokens(issue)
    if category == "done" or status in _DONE_STATUS_NAMES:
        return "done"
    if status == "пауза" or any(token in status for token in _PAUSE_STATUS_KEYWORDS):
        return "open_questions"
    if any(token in status for token in _TEST_STATUS_KEYWORDS):
        return "in_test"
    return "in_work"


_JIRA_PRIORITY_RANK = {
    "blocker": 0,
    "highest": 0,
    "critical": 1,
    "high": 2,
    "medium": 3,
    "low": 4,
    "lowest": 5,
    "minor": 5,
    "trivial": 6,
}


def jira_priority_rank(priority: Any) -> int:
    label = str(priority or "").strip().lower()
    if not label:
        return 99
    if label in _JIRA_PRIORITY_RANK:
        return _JIRA_PRIORITY_RANK[label]
    for token, rank in _JIRA_PRIORITY_RANK.items():
        if token in label:
            return rank
    return 50


def sort_issues_by_jira_priority(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        issues,
        key=lambda issue: (
            jira_priority_rank(issue.get("priority")),
            str(issue.get("key") or ""),
        ),
    )


def _status_entered_timestamp(issue: dict[str, Any]) -> float:
    for field in ("status_entered_at", "status_changed_at", "resolution_date", "updated"):
        value = issue.get(field)
        if not value:
            continue
        text = str(value).strip()
        if not text:
            continue
        try:
            normalized = text.replace("Z", "+00:00")
            return datetime.fromisoformat(normalized).timestamp()
        except ValueError:
            continue
    return 0.0


def sort_done_issues_by_recent_status(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        issues,
        key=lambda issue: (
            -_status_entered_timestamp(issue),
            jira_priority_rank(issue.get("priority")),
            str(issue.get("key") or ""),
        ),
    )


def sort_report_column_issues(column: str, issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if column == "done":
        return sort_done_issues_by_recent_status(issues)
    return sort_issues_by_jira_priority(issues)


def _build_epic_report_section(issues: list[dict[str, Any]], bucket_name: str) -> dict[str, Any]:
    section: dict[str, list[dict[str, Any]]] = {
        "in_work": [],
        "in_test": [],
        "done": [],
    }
    for issue in issues:
        bucket = classify_scope_report_bucket(issue)
        if bucket == "open_questions":
            continue
        section[bucket].append({**issue, "bucket": bucket_name})

    for key in section:
        section[key] = sort_report_column_issues(key, section[key])

    counts = {name: len(items) for name, items in section.items()}
    counts["total"] = counts["in_work"] + counts["in_test"] + counts["done"]
    return {**section, "counts": counts}


def merge_scope_issues(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge issue lists by key; later groups win (fresher supplemental fetch)."""
    by_key: dict[str, dict[str, Any]] = {}
    for group in groups:
        for issue in group:
            key = str(issue.get("key") or "")
            if key:
                by_key[key] = issue
    return list(by_key.values())


def pause_supplement_jql(base_jql: str) -> str:
    """JQL to fetch paused tasks for a Plan/Unplan query even if base JQL filters status."""
    base = base_jql.strip()
    if not base:
        return ""
    return (
        f'({base}) AND (status = "Пауза" OR status = "On Hold" OR status = "Pause" OR status = "Blocked")'
    )


def default_scope_sections() -> list[dict[str, Any]]:
    return [
        {"id": "plan", "name": "Plan", "jql": "", "kind": "planned", "order": 0},
        {"id": "unplan", "name": "Unplan", "jql": "", "kind": "unplanned", "order": 1},
    ]


def _normalize_scope_section_kind(raw: Any) -> ScopeSectionKind:
    value = str(raw or "").strip().lower()
    if value in {"planned", "plan"}:
        return "planned"
    return "unplanned"


def normalize_scope_section_config(raw: dict[str, Any], *, fallback_order: int = 0) -> dict[str, Any]:
    section_id = str(raw.get("id") or secrets.token_hex(4)).strip()
    name = str(raw.get("name") or "Секция").strip() or "Секция"
    return {
        "id": section_id,
        "name": name,
        "jql": str(raw.get("jql") or "").strip(),
        "kind": _normalize_scope_section_kind(raw.get("kind")),
        "order": int(raw.get("order") if raw.get("order") is not None else fallback_order),
    }


def normalize_scope_sections(
    raw_sections: Optional[list[dict[str, Any]]],
    *,
    plan_jql: str = "",
    unplan_jql: str = "",
) -> list[dict[str, Any]]:
    if raw_sections:
        normalized = [
            normalize_scope_section_config(section, fallback_order=index)
            for index, section in enumerate(raw_sections)
            if isinstance(section, dict)
        ]
        normalized.sort(key=lambda section: (section["order"], section["name"].lower(), section["id"]))
        for index, section in enumerate(normalized):
            section["order"] = index
        if normalized:
            return normalized

    plan = plan_jql.strip()
    unplan = unplan_jql.strip()
    if plan or unplan:
        sections = []
        if plan:
            sections.append({"id": "plan", "name": "Plan", "jql": plan, "kind": "planned", "order": 0})
        if unplan:
            sections.append({"id": "unplan", "name": "Unplan", "jql": unplan, "kind": "unplanned", "order": len(sections)})
        return sections
    return default_scope_sections()


def sync_legacy_jql_from_sections(sections: list[dict[str, Any]]) -> tuple[str, str]:
    planned = [section for section in sections if section.get("kind") == "planned"]
    unplanned = [section for section in sections if section.get("kind") == "unplanned"]
    plan_jql = str(planned[0].get("jql") or "") if planned else ""
    unplan_jql = str(unplanned[0].get("jql") or "") if unplanned else ""
    return plan_jql, unplan_jql


def derive_legacy_issue_lists(sections: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    plan_issues: list[dict[str, Any]] = []
    unplan_issues: list[dict[str, Any]] = []
    for section in sections:
        section_id = str(section.get("id") or "")
        section_name = str(section.get("name") or section_id)
        section_kind = _normalize_scope_section_kind(section.get("kind"))
        for issue in section.get("issues") or []:
            tagged = {
                **issue,
                "bucket": section_id,
                "section_id": section_id,
                "section_name": section_name,
                "section_kind": section_kind,
            }
            if section_kind == "planned":
                plan_issues.append(tagged)
            else:
                unplan_issues.append(tagged)
    return plan_issues, unplan_issues


def _empty_epic_report_section() -> dict[str, Any]:
    return {
        "in_work": [],
        "in_test": [],
        "done": [],
        "counts": {"in_work": 0, "in_test": 0, "done": 0, "total": 0},
    }


def _aggregate_report_sections(sections: list[dict[str, Any]], kind: ScopeSectionKind) -> dict[str, Any]:
    merged = _empty_epic_report_section()
    for section in sections:
        if section.get("kind") != kind:
            continue
        for key in ("in_work", "in_test", "done"):
            merged[key].extend(section.get(key) or [])
    for key in ("in_work", "in_test", "done"):
        merged[key] = sort_report_column_issues(key, merged[key])
    merged["counts"] = {
        "in_work": len(merged["in_work"]),
        "in_test": len(merged["in_test"]),
        "done": len(merged["done"]),
        "total": len(merged["in_work"]) + len(merged["in_test"]) + len(merged["done"]),
    }
    return merged


def compute_scope_report_from_sections(section_inputs: list[dict[str, Any]]) -> dict[str, Any]:
    """Build status report buckets for arbitrary configured sections."""
    sections_out: list[dict[str, Any]] = []
    open_questions: list[dict[str, Any]] = []

    for section in sorted(section_inputs, key=lambda item: (item.get("order", 0), str(item.get("name") or ""))):
        section_id = str(section.get("id") or "")
        section_name = str(section.get("name") or section_id)
        section_kind = _normalize_scope_section_kind(section.get("kind"))
        issues = section.get("issues") or []
        report = _build_epic_report_section(issues, section_id)
        sections_out.append(
            {
                "id": section_id,
                "name": section_name,
                "kind": section_kind,
                "order": int(section.get("order") or 0),
                **report,
            }
        )
        for issue in issues:
            if classify_scope_report_bucket(issue) != "open_questions":
                continue
            entry = {
                **issue,
                "bucket": section_id,
                "section_id": section_id,
                "section_name": section_name,
                "section_kind": section_kind,
            }
            entry["comment"] = str(issue.get("last_comment") or "")
            entry["comment_author"] = str(issue.get("last_comment_author") or "")
            entry["comment_at"] = issue.get("last_comment_at")
            open_questions.append(entry)

    open_questions.sort(
        key=lambda issue: (
            0 if issue.get("section_kind") == "planned" else 1,
            int(next((section.get("order", 99) for section in section_inputs if section.get("id") == issue.get("section_id")), 99)),
            jira_priority_rank(issue.get("priority")),
            str(issue.get("key") or ""),
        )
    )

    plan = _aggregate_report_sections(sections_out, "planned")
    unplan = _aggregate_report_sections(sections_out, "unplanned")
    aggregate_counts = {
        "in_work": plan["counts"]["in_work"] + unplan["counts"]["in_work"],
        "in_test": plan["counts"]["in_test"] + unplan["counts"]["in_test"],
        "done": plan["counts"]["done"] + unplan["counts"]["done"],
        "open_questions": len(open_questions),
    }

    return {
        "sections": sections_out,
        "plan": plan,
        "unplan": unplan,
        "open_questions": open_questions,
        "counts": aggregate_counts,
    }


def compute_scope_report(
    plan_issues: list[dict[str, Any]],
    unplan_issues: list[dict[str, Any]],
) -> dict[str, Any]:
    """Legacy wrapper for Plan/Unplan-only boards."""
    return compute_scope_report_from_sections(
        [
            {"id": "plan", "name": "Plan", "kind": "planned", "order": 0, "issues": plan_issues},
            {"id": "unplan", "name": "Unplan", "kind": "unplanned", "order": 1, "issues": unplan_issues},
        ]
    )


PriorityQueueKind = Literal["todo", "test"]

_PRIORITY_QUEUE_LABELS = {
    "todo": "Задачи к выполнению",
    "test": "Задачи к тестированию",
}

_QUEUE_MILESTONE_STATUS_TARGETS: dict[PriorityQueueKind, tuple[str, ...]] = {
    "todo": (
        "К выполнению",
        "Ready for Dev",
        "Ready for Development",
        "In Progress",
        "В работе",
        "To Do",
    ),
    "test": (
        "К тестированию",
        "Testing",
        "Тестирование",
        "In Test",
        "To Test",
        "QA",
    ),
}


def priority_queue_milestone_targets(kind: PriorityQueueKind) -> list[str]:
    return list(_QUEUE_MILESTONE_STATUS_TARGETS.get(kind, ()))


def priority_queue_label(kind: PriorityQueueKind) -> str:
    return _PRIORITY_QUEUE_LABELS[kind]


def _queue_issues_by_key(issues: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for issue in issues:
        key = str(issue.get("key") or "")
        if key:
            index[key] = issue
    return index


def _append_queue_history(history: list[dict[str, Any]], entry: dict[str, Any], *, limit: int = 100) -> list[dict[str, Any]]:
    next_history = [entry, *history]
    return next_history[:limit]


def _queue_issue_milestone_at(issue: dict[str, Any]) -> Optional[str]:
    value = issue.get("status_entered_at")
    return str(value) if value else None


def _scope_binding_milestone_at(issue: dict[str, Any]) -> Optional[str]:
    value = issue.get("epic_linked_at")
    return str(value) if value else None


def _rebuild_queue_appeared_history(
    issues: list[dict[str, Any]],
    history: list[dict[str, Any]],
    *,
    queue_label: str,
) -> list[dict[str, Any]]:
    """Rebuild appeared entries from Jira milestone dates on current queue issues."""
    preserved = [
        entry
        for entry in history
        if entry.get("type") not in {"appeared", "refresh"}
    ]
    appeared: list[dict[str, Any]] = []
    for issue in issues:
        key = str(issue.get("key") or "")
        milestone_at = _queue_issue_milestone_at(issue)
        if not key or not milestone_at:
            continue
        status_name = str(issue.get("status") or "")
        appeared.append(
            {
                "type": "appeared",
                "at": milestone_at,
                "by": "Jira",
                "issue_key": key,
                "status_name": status_name,
                "message": (
                    f"{queue_label}: {key} перешла в «{status_name}»"
                    if status_name
                    else f"{queue_label}: {key} изменила статус"
                ),
            }
        )
    appeared.sort(key=lambda entry: str(entry.get("at") or ""), reverse=True)
    return appeared + preserved


def merge_priority_queue(
    fetched_issues: list[dict[str, Any]],
    previous_queue: Optional[dict[str, Any]],
    *,
    queue_label: str,
    refreshed_at: str,
) -> dict[str, Any]:
    """Merge Jira fetch into a grooming queue while preserving manual order."""
    fresh_by_key = _queue_issues_by_key(fetched_issues)
    previous = previous_queue or {}
    previous_by_key = _queue_issues_by_key(previous.get("issues") or [])

    merged_by_key: dict[str, dict[str, Any]] = {}
    for key, issue in fresh_by_key.items():
        merged = {**issue}
        prev_issue = previous_by_key.get(key)
        if prev_issue:
            for field in ("grooming_comment", "grooming_comment_at", "grooming_comment_by"):
                if prev_issue.get(field):
                    merged[field] = prev_issue[field]
        merged_by_key[key] = merged

    previous_order = [str(key) for key in previous.get("order") or [] if str(key) in merged_by_key]
    new_keys = sorted(
        [key for key in merged_by_key if key not in previous_order],
        key=lambda key: (jira_priority_rank(merged_by_key[key].get("priority")), key),
    )
    order = previous_order + new_keys
    issues = [merged_by_key[key] for key in order]
    history = list(previous.get("history") or [])
    filter_seen_at = dict(previous.get("filter_seen_at") or {})

    for issue in issues:
        key = str(issue.get("key") or "")
        milestone_at = _queue_issue_milestone_at(issue)
        if key and milestone_at:
            filter_seen_at[key] = filter_seen_at.get(key) or milestone_at

    history = _rebuild_queue_appeared_history(issues, history, queue_label=queue_label)

    return {
        "order": order,
        "issues": issues,
        "history": history,
        "filter_seen_at": filter_seen_at,
    }


def _queue_order_keys(queue: dict[str, Any]) -> list[str]:
    order = queue.get("order")
    if isinstance(order, list) and order:
        return [str(key) for key in order if key]
    return [str(issue.get("key") or "") for issue in queue.get("issues") or [] if issue.get("key")]


def _detect_moved_key(previous_order: list[str], next_order: list[str]) -> tuple[Optional[str], Optional[int], Optional[int]]:
    if previous_order == next_order:
        return None, None, None
    prev_index = {key: index for index, key in enumerate(previous_order)}
    next_index = {key: index for index, key in enumerate(next_order)}
    moved_candidates: list[tuple[int, str, int, int]] = []
    for key in next_order:
        if key not in prev_index:
            continue
        from_index = prev_index[key]
        to_index = next_index[key]
        if from_index != to_index:
            moved_candidates.append((abs(from_index - to_index), key, from_index, to_index))
    if not moved_candidates:
        return None, None, None
    moved_candidates.sort(key=lambda item: (-item[0], item[1]))
    _, key, from_index, to_index = moved_candidates[0]
    return key, from_index, to_index


def apply_priority_queue_reorder(
    queue: dict[str, Any],
    *,
    order: list[str],
    comment: str,
    actor_name: str,
    changed_at: str,
    queue_label: str,
    moved_key: Optional[str] = None,
) -> dict[str, Any]:
    updated = copy.deepcopy(queue or {})
    current_order = _queue_order_keys(updated)
    normalized_order = [str(key).upper() for key in order if str(key).strip()]
    current_set = {key.upper() for key in current_order}
    next_set = set(normalized_order)
    if current_set != next_set or len(normalized_order) != len(current_order):
        raise ValueError("Order must include exactly the same issue keys as the current queue")

    by_key = _queue_issues_by_key(updated.get("issues") or [])
    by_key_upper = {str(key).upper(): issue for key, issue in by_key.items()}
    canonical_order: list[str] = []
    for key in normalized_order:
        issue = by_key_upper.get(key)
        if issue:
            canonical_order.append(str(issue.get("key") or key))
    moved_key_resolved, from_index, to_index = _detect_moved_key(current_order, canonical_order)
    if moved_key:
        explicit = moved_key.strip().upper()
        if explicit in {str(key).upper() for key in canonical_order}:
            moved_key_resolved = explicit
            from_index = current_order.index(next(key for key in current_order if str(key).upper() == explicit))
            to_index = canonical_order.index(next(key for key in canonical_order if str(key).upper() == explicit))
    if moved_key_resolved:
        lookup = by_key_upper.get(moved_key_resolved.upper()) or by_key.get(moved_key_resolved)
        if lookup:
            lookup["grooming_comment"] = comment
            lookup["grooming_comment_by"] = actor_name
            lookup["grooming_comment_at"] = changed_at

    message = f"{queue_label}: изменён порядок"
    if moved_key_resolved and from_index is not None and to_index is not None:
        message = f"{queue_label}: {moved_key_resolved} {from_index + 1} → {to_index + 1}"

    history = _append_queue_history(
        list(updated.get("history") or []),
        {
            "type": "reorder",
            "at": changed_at,
            "by": actor_name,
            "comment": comment,
            "issue_key": moved_key_resolved,
            "from_index": from_index,
            "to_index": to_index,
            "order": canonical_order,
            "message": message,
        },
    )
    updated["order"] = canonical_order
    updated["issues"] = [by_key_upper[str(key).upper()] for key in canonical_order if str(key).upper() in by_key_upper]
    updated["history"] = history
    return updated


def apply_priority_queue_comment(
    queue: dict[str, Any],
    *,
    issue_key: str,
    comment: str,
    actor_name: str,
    changed_at: str,
    queue_label: str,
) -> dict[str, Any]:
    updated = copy.deepcopy(queue or {})
    target = issue_key.upper()
    found = False
    for issue in updated.get("issues") or []:
        if str(issue.get("key") or "").upper() != target:
            continue
        issue["grooming_comment"] = comment
        issue["grooming_comment_by"] = actor_name
        issue["grooming_comment_at"] = changed_at
        found = True
        break
    if not found:
        raise ValueError("Issue not found in queue")

    history = _append_queue_history(
        list(updated.get("history") or []),
        {
            "type": "comment",
            "at": changed_at,
            "by": actor_name,
            "comment": comment,
            "issue_key": issue_key.upper(),
            "message": f"{queue_label}: комментарий к {issue_key.upper()}",
        },
    )
    updated["history"] = history
    return updated


def compute_scope_metrics_from_sections(
    capacity_sp: float,
    sections: list[dict[str, Any]],
    month: str,
) -> dict[str, Any]:
    """Compute buffer / intake metrics for configured scope sections."""
    capacity = max(0.0, float(capacity_sp))
    planned_issues: list[dict[str, Any]] = []
    unplanned_issues: list[dict[str, Any]] = []
    section_metrics: list[dict[str, Any]] = []

    for section in sorted(sections, key=lambda item: (item.get("order", 0), str(item.get("name") or ""))):
        section_id = str(section.get("id") or "")
        section_name = str(section.get("name") or section_id)
        section_kind = _normalize_scope_section_kind(section.get("kind"))
        issues = section.get("issues") or []
        tagged = [
            {
                **issue,
                "bucket": section_id,
                "section_id": section_id,
                "section_name": section_name,
                "section_kind": section_kind,
            }
            for issue in issues
        ]
        if section_kind == "planned":
            planned_issues.extend(tagged)
        else:
            unplanned_issues.extend(tagged)
        section_metrics.append(
            {
                "id": section_id,
                "name": section_name,
                "kind": section_kind,
                "order": int(section.get("order") or 0),
                "story_points": _sum_sp(issues),
                "count": len(issues),
                "by_status": _status_breakdown(issues),
            }
        )

    plan_sp = _sum_sp(planned_issues)
    unplan_sp = _sum_sp(unplanned_issues)
    buffer_sp = capacity - plan_sp - unplan_sp
    all_issues = planned_issues + unplanned_issues

    unestimated_tasks: list[dict[str, Any]] = []
    scope_creep_count = 0
    for issue in all_issues:
        bucket = issue.get("bucket")
        normalized = {k: v for k, v in issue.items() if k not in {"bucket", "section_id", "section_name", "section_kind"}}
        if not normalized.get("estimated"):
            if _is_active_issue(normalized):
                unestimated_tasks.append({**normalized, "bucket": bucket, "section_id": issue.get("section_id"), "section_name": issue.get("section_name"), "section_kind": issue.get("section_kind")})
        created = normalized.get("created")
        if is_scope_creep(str(created) if created else None, month):
            scope_creep_count += 1

    if buffer_sp <= 0 or unestimated_tasks:
        intake_status: IntakeStatus = "stop"
    elif capacity > 0 and buffer_sp <= capacity * 0.2:
        intake_status = "warning"
    else:
        intake_status = "ok"

    overfill_sp = max(0.0, plan_sp + unplan_sp - capacity)

    return {
        "capacity_sp": capacity,
        "plan_sp": plan_sp,
        "unplan_sp": unplan_sp,
        "buffer_sp": buffer_sp,
        "overfill_sp": overfill_sp,
        "intake_status": intake_status,
        "plan_count": len(planned_issues),
        "unplan_count": len(unplanned_issues),
        "unestimated_count": len(unestimated_tasks),
        "unestimated_tasks": unestimated_tasks,
        "scope_creep_count": scope_creep_count,
        "plan_by_status": _status_breakdown(planned_issues),
        "unplan_by_status": _status_breakdown(unplanned_issues),
        "plan_by_assignee": _assignee_breakdown(planned_issues),
        "unplan_by_assignee": _assignee_breakdown(unplanned_issues),
        "plan_by_developer": _developer_breakdown(planned_issues),
        "unplan_by_developer": _developer_breakdown(unplanned_issues),
        "plan_by_role": _role_metrics(planned_issues),
        "unplan_by_role": _role_metrics(unplanned_issues),
        "plan_role_coverage": _role_coverage(planned_issues),
        "unplan_role_coverage": _role_coverage(unplanned_issues),
        "plan_status_counts": _plan_status_counts(all_issues),
        "plan_change_reason_counts": _plan_change_reason_counts(all_issues),
        "sections": section_metrics,
        "section_count": len(section_metrics),
        "month": month,
        "month_start": month_start_iso(month),
    }


def compute_scope_metrics(
    capacity_sp: float,
    plan_issues: list[dict[str, Any]],
    unplan_issues: list[dict[str, Any]],
    month: str,
) -> dict[str, Any]:
    """Legacy wrapper for Plan/Unplan-only boards."""
    return compute_scope_metrics_from_sections(
        capacity_sp,
        [
            {"id": "plan", "name": "Plan", "kind": "planned", "order": 0, "issues": plan_issues},
            {"id": "unplan", "name": "Unplan", "kind": "unplanned", "order": 1, "issues": unplan_issues},
        ],
        month,
    )


def build_scope_snapshot(
    *,
    metrics: dict[str, Any],
    refreshed_at: str,
    previous_snapshot: Optional[dict[str, Any]] = None,
    sections: Optional[list[dict[str, Any]]] = None,
    plan_issues: Optional[list[dict[str, Any]]] = None,
    unplan_issues: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    resolved_sections = sections
    if resolved_sections is None:
        resolved_sections = [
            {"id": "plan", "name": "Plan", "kind": "planned", "order": 0, "issues": plan_issues or []},
            {"id": "unplan", "name": "Unplan", "kind": "unplanned", "order": 1, "issues": unplan_issues or []},
        ]
    legacy_plan, legacy_unplan = derive_legacy_issue_lists(resolved_sections)
    resolved_plan = plan_issues if plan_issues is not None else legacy_plan
    resolved_unplan = unplan_issues if unplan_issues is not None else legacy_unplan
    delta_pack = compute_scope_refresh_delta(
        previous_snapshot,
        resolved_plan,
        resolved_unplan,
        metrics,
        sections=resolved_sections,
    )
    snapshot_sections = [
        {
            "id": section.get("id"),
            "name": section.get("name"),
            "kind": section.get("kind"),
            "order": section.get("order"),
            "issues": section.get("issues") or [],
        }
        for section in resolved_sections
    ]
    entry = {
        "at": refreshed_at,
        "delta": delta_pack["delta"],
        "events": delta_pack["events"][:30],
        "metrics_summary": {
            "plan_sp": metrics["plan_sp"],
            "unplan_sp": metrics["unplan_sp"],
            "buffer_sp": metrics["buffer_sp"],
            "plan_count": metrics["plan_count"],
            "unplan_count": metrics["unplan_count"],
            "intake_status": metrics["intake_status"],
        },
    }
    refresh_log = [entry]
    if previous_snapshot:
        refresh_log.extend((previous_snapshot.get("refresh_log") or [])[:14])

    return {
        "sections": snapshot_sections,
        "plan_issues": resolved_plan,
        "unplan_issues": resolved_unplan,
        "metrics": metrics,
        "report": compute_scope_report_from_sections(resolved_sections),
        "refreshed_at": refreshed_at,
        "delta": delta_pack["delta"],
        "events": delta_pack["events"],
        "refresh_log": refresh_log,
    }


def _issues_by_key_from_sections(sections: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for section in sections:
        section_id = str(section.get("id") or "")
        for issue in section.get("issues") or []:
            key = str(issue.get("key") or "")
            if key:
                index[key] = {
                    **issue,
                    "bucket": section_id,
                    "section_id": section_id,
                    "section_name": section.get("name"),
                    "section_kind": section.get("kind"),
                }
    return index


def _issues_by_key(
    plan_issues: list[dict[str, Any]],
    unplan_issues: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for issue in plan_issues:
        key = str(issue.get("key") or "")
        if key:
            index[key] = {**issue, "bucket": "plan"}
    for issue in unplan_issues:
        key = str(issue.get("key") or "")
        if key:
            index[key] = {**issue, "bucket": "unplan"}
    return index


def _sp_label(sp: Any) -> str:
    if isinstance(sp, (int, float)) and sp > 0:
        rounded = round(float(sp) * 10) / 10
        text = str(int(rounded)) if rounded == int(rounded) else f"{rounded:.1f}"
        return f"{text} SP"
    return "без SP"


def _format_scope_event_date(iso: str) -> str:
    value = str(iso or "").strip()
    if not value:
        return ""
    try:
        from datetime import datetime

        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized).strftime("%d.%m.%y")
    except ValueError:
        return value[:10]


def compute_scope_refresh_delta(
    previous_snapshot: Optional[dict[str, Any]],
    plan_issues: list[dict[str, Any]],
    unplan_issues: list[dict[str, Any]],
    metrics: dict[str, Any],
    *,
    sections: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Compare against the previous snapshot and build human-readable change events."""
    if not previous_snapshot or not previous_snapshot.get("metrics"):
        return {
            "delta": None,
            "events": [
                {
                    "type": "baseline",
                    "message": (
                        f"Первый снимок: плановый {_sp_label(metrics['plan_sp'])}, "
                        f"внеплановый {_sp_label(metrics['unplan_sp'])}, "
                        f"буфер {_sp_label(metrics['buffer_sp'])}"
                    ),
                }
            ],
        }

    prev_metrics = previous_snapshot["metrics"]
    prev_sections = previous_snapshot.get("sections") or []
    if prev_sections:
        prev_keys = _issues_by_key_from_sections(prev_sections)
    else:
        prev_keys = _issues_by_key(
            previous_snapshot.get("plan_issues") or [],
            previous_snapshot.get("unplan_issues") or [],
        )
    if sections:
        curr_keys = _issues_by_key_from_sections(sections)
    else:
        curr_keys = _issues_by_key(plan_issues, unplan_issues)

    delta = {
        "plan_sp": round(float(metrics["plan_sp"]) - float(prev_metrics.get("plan_sp") or 0), 2),
        "unplan_sp": round(float(metrics["unplan_sp"]) - float(prev_metrics.get("unplan_sp") or 0), 2),
        "buffer_sp": round(float(metrics["buffer_sp"]) - float(prev_metrics.get("buffer_sp") or 0), 2),
        "plan_count": int(metrics["plan_count"]) - int(prev_metrics.get("plan_count") or 0),
        "unplan_count": int(metrics["unplan_count"]) - int(prev_metrics.get("unplan_count") or 0),
        "from": {
            "plan_sp": float(prev_metrics.get("plan_sp") or 0),
            "unplan_sp": float(prev_metrics.get("unplan_sp") or 0),
            "buffer_sp": float(prev_metrics.get("buffer_sp") or 0),
            "plan_count": int(prev_metrics.get("plan_count") or 0),
            "unplan_count": int(prev_metrics.get("unplan_count") or 0),
        },
        "to": {
            "plan_sp": float(metrics["plan_sp"]),
            "unplan_sp": float(metrics["unplan_sp"]),
            "buffer_sp": float(metrics["buffer_sp"]),
            "plan_count": int(metrics["plan_count"]),
            "unplan_count": int(metrics["unplan_count"]),
        },
    }

    events: list[dict[str, Any]] = []
    buf_from = float(prev_metrics.get("buffer_sp") or 0)
    buf_to = float(metrics["buffer_sp"])
    parts: list[str] = []
    if delta["plan_sp"]:
        parts.append(f"Плановый {delta['plan_sp']:+.0f} SP")
    if delta["unplan_sp"]:
        parts.append(f"Внеплановый {delta['unplan_sp']:+.0f} SP")
    if delta["plan_count"] or delta["unplan_count"]:
        parts.append(
            f"задач {prev_metrics.get('plan_count', 0)}+{prev_metrics.get('unplan_count', 0)}"
            f" → {metrics['plan_count']}+{metrics['unplan_count']}"
        )
    if parts or buf_from != buf_to:
        events.append(
            {
                "type": "summary",
                "message": f"Буфер {buf_from:.0f} → {buf_to:.0f} SP"
                + (f" ({', '.join(parts)})" if parts else ""),
                "buffer_from": buf_from,
                "buffer_to": buf_to,
            }
        )

    for key, issue in curr_keys.items():
        if key not in prev_keys:
            bound_at = _scope_binding_milestone_at(issue)
            events.append(
                {
                    "type": "added",
                    "key": key,
                    "bucket": issue.get("bucket"),
                    "story_points": issue.get("story_points"),
                    "summary": issue.get("summary", key),
                    "at": bound_at,
                    "message": (
                        f"+ {key} привязана {_format_scope_event_date(bound_at)} "
                        f"({issue.get('section_name') or issue.get('bucket')}): {_sp_label(issue.get('story_points'))}"
                        if bound_at
                        else f"+ {key} ({issue.get('section_name') or issue.get('bucket')}): {_sp_label(issue.get('story_points'))}"
                    ),
                }
            )

    for key, issue in prev_keys.items():
        if key not in curr_keys:
            events.append(
                {
                    "type": "removed",
                    "key": key,
                    "bucket": issue.get("bucket"),
                    "message": f"− {key} убрана из {issue.get('section_name') or issue.get('bucket')}",
                }
            )

    for key, issue in curr_keys.items():
        prev_issue = prev_keys.get(key)
        if not prev_issue:
            continue
        prev_sp = prev_issue.get("story_points")
        curr_sp = issue.get("story_points")
        if prev_sp != curr_sp:
            events.append(
                {
                    "type": "sp_changed",
                    "key": key,
                    "bucket": issue.get("bucket"),
                    "from_sp": prev_sp,
                    "to_sp": curr_sp,
                    "message": f"↔ {key}: {_sp_label(prev_sp)} → {_sp_label(curr_sp)}",
                }
            )

    if not events:
        events.append({"type": "unchanged", "message": "Без изменений с прошлого обновления"})

    return {"delta": delta, "events": events}
