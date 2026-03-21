import os
import re
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Prefer shared runtime envs first, then local fallback.
for env_file in [
    PROJECT_ROOT / "bruintracks_server" / ".env",
    PROJECT_ROOT / "bruintracks_client" / ".env",
    Path(__file__).with_name(".env"),
]:
    if env_file.exists():
        load_dotenv(env_file, override=False)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY")

SYNC_MODE = os.environ.get("ALL_COURSES_SYNC_MODE", "missing").strip().lower()
if SYNC_MODE not in {"missing", "refresh"}:
    raise RuntimeError("ALL_COURSES_SYNC_MODE must be 'missing' or 'refresh'")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

MAJOR_NAME_ALIASES = {
    "NursingBS": "NursingBSPrelicensure",
}


def normalize_major_name(major_name: str) -> str:
    return MAJOR_NAME_ALIASES.get(major_name, major_name)


def fetch_all_rows(table_name, select_clause):
    rows = []
    page_size = 1000
    start = 0

    while True:
        resp = (
            supabase
            .table(table_name)
            .select(select_clause)
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size

    return rows


def normalize_course(raw):
    text = str(raw or "").strip()
    if not text:
        return ""

    # Stored strings may look like "COM SCI 31 - Intro..."; keep the code portion.
    text = text.split(" - ", 1)[0].strip()
    text = re.sub(r"\s+", " ", text)
    return text


def extract_courses(node, out_set):
    if isinstance(node, dict):
        courses = node.get("courses")
        if isinstance(courses, list):
            for value in courses:
                course = normalize_course(value)
                if course:
                    out_set.add(course)

        # Recurse through known nested branches and any additional nested containers.
        for key in ("options", "tracks"):
            extract_courses(node.get(key), out_set)

        for value in node.values():
            if isinstance(value, (dict, list)):
                extract_courses(value, out_set)
        return

    if isinstance(node, list):
        for item in node:
            extract_courses(item, out_set)


def build_courses_from_requisites(json_data):
    courses = set()
    extract_courses(json_data, courses)
    return sorted(courses)


def main():
    major_req_rows = fetch_all_rows("major_requisites", "major_name,json_data")
    existing_all_rows = fetch_all_rows("all_courses", "major_name")

    existing_majors = {row.get("major_name") for row in existing_all_rows if row.get("major_name")}

    inserted = 0
    updated = 0
    skipped_existing = 0
    skipped_empty = 0

    for row in major_req_rows:
        major_name = normalize_major_name(row.get("major_name"))
        if not major_name:
            continue

        courses = build_courses_from_requisites(row.get("json_data"))
        if not courses:
            skipped_empty += 1
            continue

        payload = {"major_name": major_name, "courses": courses}

        if major_name in existing_majors:
            if SYNC_MODE == "refresh":
                (
                    supabase
                    .table("all_courses")
                    .update(payload)
                    .eq("major_name", major_name)
                    .execute()
                )
                updated += 1
            else:
                skipped_existing += 1
            continue

        (
            supabase
            .table("all_courses")
            .insert(payload)
            .execute()
        )
        inserted += 1

    print("Done syncing all_courses from major_requisites.")
    print(f"Mode: {SYNC_MODE}")
    print(f"Major requisites rows read: {len(major_req_rows)}")
    print(f"Inserted: {inserted}")
    print(f"Updated: {updated}")
    print(f"Skipped existing: {skipped_existing}")
    print(f"Skipped empty: {skipped_empty}")


if __name__ == "__main__":
    main()


