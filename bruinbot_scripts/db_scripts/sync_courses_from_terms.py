import argparse
import csv
import os
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from dotenv import load_dotenv
from httpx import ReadTimeout, RemoteProtocolError
from supabase import Client, create_client

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CSV_DIR = PROJECT_ROOT / "bruinbot_server" / "courses"

for env_file in [
    PROJECT_ROOT / "bruinbot_server" / ".env",
    PROJECT_ROOT / "bruinbot_client" / ".env",
    Path(__file__).with_name(".env"),
]:
    if env_file.exists():
        load_dotenv(env_file, override=False)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY")

BATCH_SIZE = 500

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def safe_execute(req, retries: int = 4, backoff: float = 0.25):
    for i in range(retries):
        try:
            return req.execute()
        except (RemoteProtocolError, ReadTimeout):
            if i == retries - 1:
                raise
            time.sleep(backoff)


def fetch_all_rows(table_name: str, select_clause: str) -> List[dict]:
    rows = []
    page_size = 1000
    start = 0
    while True:
        resp = safe_execute(
            supabase.table(table_name).select(select_clause).range(start, start + page_size - 1)
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


def normalize_str(value: Optional[str]) -> str:
    return (value or "").strip()


def normalize_catalog_number(display_value: Optional[str], raw_value: Optional[str]) -> str:
    display = normalize_str(display_value).upper()
    if display:
        return display

    raw = normalize_str(raw_value).upper()
    if not raw:
        return ""

    # Fallback to internal code when display code is missing.
    trimmed = raw.lstrip("0")
    return trimmed or raw


def parse_int(value: Optional[str]) -> Optional[int]:
    text = normalize_str(value)
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def parse_time_24(value: Optional[str]) -> Optional[str]:
    text = normalize_str(value)
    if not text:
        return None
    try:
        return datetime.strptime(text, "%I:%M %p").strftime("%H:%M:%S")
    except ValueError:
        return None


def split_instructors(raw: Optional[str]) -> List[str]:
    return [part.strip() for part in (raw or "").split(";") if part.strip()]


def parse_block(text_block: str) -> dict:
    rows = []
    for line in text_block.strip().splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 5 or parts[0].lower().startswith("classname"):
            continue
        classname, minimum_grade, prerequisite_f, corequisite_f, sev = parts
        rows.append(
            {
                "classname": classname,
                "minimumgrade": minimum_grade,
                "prerequisite": prerequisite_f,
                "corequisite": corequisite_f,
                "rqs_sev": sev,
            }
        )
    return build_logic(rows)


def extract_pipe_rows_from_notes(notes: str) -> str:
    if not notes:
        return ""
    lines = []
    for raw_line in notes.splitlines():
        line = raw_line.strip()
        if line.count("|") >= 4:
            lines.append(line)
    return "\n".join(lines)


def build_logic(rows: List[dict]) -> dict:
    groups: List[List[dict]] = []
    current: List[dict] = []

    for row in rows:
        text = row["classname"].strip()
        m = re.search(r"(and|or)$", text, re.IGNORECASE)
        connector = m.group(1).lower() if m else None

        name = text.strip("() ")
        if connector:
            name = re.sub(rf"\b{connector}$", "", name, flags=re.IGNORECASE).strip()

        leaf = {
            "course": name,
            "min_grade": (row.get("minimumgrade") or "D-").strip() or "D-",
            "severity": (row.get("rqs_sev") or "R").strip() or "R",
            "relation": (
                "corequisite"
                if (row.get("corequisite") or "").strip().lower() == "yes"
                else "prerequisite"
            ),
        }

        current.append(leaf)
        if connector != "and":
            groups.append(current)
            current = []

    if current:
        groups.append(current)

    if not groups:
        return {}
    if len(groups) == 1:
        return {"and": groups[0]}
    return {"or": [{"and": grp} for grp in groups]}


def parse_requisites_with_fallback(raw_requisites: str, raw_notes: str) -> Tuple[dict, str]:
    req_text = normalize_str(raw_requisites)
    if req_text:
        parsed = parse_block(req_text)
        if parsed:
            return parsed, "requisites"

    note_rows = extract_pipe_rows_from_notes(raw_notes)
    if note_rows:
        parsed = parse_block(note_rows)
        if parsed:
            return parsed, "class_sect_notes"

    return {}, "none"


def load_csv_rows(csv_paths: List[Path]) -> List[dict]:
    rows: List[dict] = []
    for path in csv_paths:
        with path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                row["_source_csv"] = path.name
                rows.append(row)
    return rows


def get_default_csv_paths(csv_dir: Path) -> List[Path]:
    names = ["fall.csv", "winter.csv", "spring.csv"]
    paths = [csv_dir / name for name in names]
    missing = [str(p) for p in paths if not p.exists()]
    if missing:
        raise FileNotFoundError(f"Missing CSV files: {', '.join(missing)}")
    return paths


def sync(rows: List[dict], dry_run: bool = False):
    term_rows = fetch_all_rows("terms", "id,term_code")
    subject_rows = fetch_all_rows("subjects", "id,code")
    instructor_rows = fetch_all_rows("instructors", "id,name")
    course_rows = fetch_all_rows("courses", "id,subject_id,catalog_number,course_requisites")
    section_rows = fetch_all_rows("sections", "id,term_id,course_id,section_code")
    mt_rows = fetch_all_rows(
        "meeting_times",
        "section_id,days_of_week,start_time,end_time,building,room",
    )
    si_rows = fetch_all_rows("section_instructors", "section_id,instructor_id")

    term_ids: Dict[str, int] = {r["term_code"]: r["id"] for r in term_rows}
    subject_ids: Dict[str, int] = {r["code"]: r["id"] for r in subject_rows}
    instructor_ids: Dict[str, int] = {r["name"]: r["id"] for r in instructor_rows}

    course_ids: Dict[Tuple[int, str], int] = {}
    existing_course_reqs: Dict[int, dict] = {}
    for r in course_rows:
        key = (r["subject_id"], (r["catalog_number"] or "").strip().upper())
        course_ids[key] = r["id"]
        existing_course_reqs[r["id"]] = r.get("course_requisites") or {}

    section_ids: Dict[Tuple[int, int, str], int] = {}
    for r in section_rows:
        section_ids[(r["term_id"], r["course_id"], r["section_code"])] = r["id"]

    mt_existing: Set[Tuple[int, str, str, str, str, str]] = set()
    for r in mt_rows:
        mt_existing.add(
            (
                r["section_id"],
                normalize_str(r.get("days_of_week")),
                normalize_str(r.get("start_time")),
                normalize_str(r.get("end_time")),
                normalize_str(r.get("building")),
                normalize_str(r.get("room")),
            )
        )

    si_existing: Set[Tuple[int, int]] = {(r["section_id"], r["instructor_id"]) for r in si_rows}

    inserted = {
        "terms": 0,
        "subjects": 0,
        "courses": 0,
        "sections": 0,
        "meeting_times": 0,
        "instructors": 0,
        "section_instructors": 0,
        "course_requisites": 0,
    }
    skipped = {
        "malformed_rows": 0,
        "missing_keys": 0,
        "existing_terms": 0,
        "existing_subjects": 0,
        "existing_courses": 0,
        "existing_sections": 0,
        "existing_meeting_times": 0,
        "existing_section_instructors": 0,
        "empty_requisites": 0,
    }
    prereq_stats = {
        "parsed_from_requisites": 0,
        "parsed_from_class_sect_notes": 0,
        "failed_parse": 0,
        "missing_course_match": 0,
    }

    section_inserts: List[dict] = []
    pending_section_keys: Set[Tuple[int, int, str]] = set()

    def flush_section_inserts():
        nonlocal section_inserts
        if not section_inserts:
            return
        if dry_run:
            inserted["sections"] += len(section_inserts)
            section_inserts = []
            pending_section_keys.clear()
            return

        resp = safe_execute(
            supabase.table("sections").upsert(
                section_inserts,
                on_conflict="term_id,course_id,section_code",
                returning="representation",
            )
        )
        for rec in resp.data or []:
            section_ids[(rec["term_id"], rec["course_id"], rec["section_code"])] = rec["id"]
        inserted["sections"] += len(resp.data or [])
        section_inserts = []
        pending_section_keys.clear()

    # Aggregate one requisites source per course key.
    req_source_by_course: Dict[Tuple[int, str], Tuple[dict, str]] = {}

    for row in rows:
        term_code = normalize_str(row.get("term_cd"))
        term_name = normalize_str(row.get("term_name"))
        subj_code = normalize_str(row.get("subj_area_cd"))
        subj_name = normalize_str(row.get("subj_area_name"))
        catalog_number = normalize_catalog_number(
            row.get("disp_catlg_no"),
            row.get("crs_catlg_no"),
        )
        section_code = normalize_str(row.get("sect_no")) or normalize_str(row.get("disp_sect_no"))

        if not (term_code and subj_code and catalog_number and section_code):
            skipped["missing_keys"] += 1
            continue

        # Terms (insert missing)
        term_id = term_ids.get(term_code)
        if term_id is None:
            payload = {"term_code": term_code, "term_name": term_name or term_code}
            if dry_run:
                inserted["terms"] += 1
                term_id = -1
            else:
                out = safe_execute(
                    supabase.table("terms").upsert(
                        payload,
                        on_conflict="term_code",
                        returning="representation",
                    )
                )
                term_id = out.data[0]["id"]
            term_ids[term_code] = term_id
        else:
            skipped["existing_terms"] += 1

        # Subjects (insert missing)
        subject_id = subject_ids.get(subj_code)
        if subject_id is None:
            payload = {"code": subj_code, "name": subj_name or subj_code}
            if dry_run:
                inserted["subjects"] += 1
                subject_id = -1
            else:
                out = safe_execute(
                    supabase.table("subjects").upsert(
                        payload,
                        on_conflict="code",
                        returning="representation",
                    )
                )
                subject_id = out.data[0]["id"]
            subject_ids[subj_code] = subject_id
        else:
            skipped["existing_subjects"] += 1

        # Courses (insert missing)
        course_key = (subject_id, catalog_number)
        course_id = course_ids.get(course_key)
        if course_id is None:
            payload = {
                "subject_id": subject_id,
                "catalog_number": catalog_number,
                "title": normalize_str(row.get("crs_long_ttl")),
                "short_title": normalize_str(row.get("crs_short_ttl")),
            }
            if dry_run:
                inserted["courses"] += 1
                course_id = -1
                existing_course_reqs[course_id] = {}
            else:
                out = safe_execute(
                    supabase.table("courses").upsert(
                        payload,
                        on_conflict="subject_id,catalog_number",
                        returning="representation",
                    )
                )
                course_id = out.data[0]["id"]
                existing_course_reqs[course_id] = out.data[0].get("course_requisites") or {}
            course_ids[course_key] = course_id
        else:
            skipped["existing_courses"] += 1

        # Sections (insert missing)
        section_key = (term_id, course_id, section_code)
        if section_key not in section_ids and section_key not in pending_section_keys:
            section_payload = {
                "term_id": term_id,
                "course_id": course_id,
                "class_number": normalize_str(row.get("class_no")),
                "section_code": section_code,
                "is_primary": normalize_str(row.get("class_prim_act_fl")) == "Y",
                "activity": normalize_str(row.get("cls_act_typ_txt")) or normalize_str(row.get("cls_act_typ_cd")),
                "enrollment_cap": parse_int(row.get("enrl_cap_num")),
                "enrollment_total": parse_int(row.get("enrl_tot")),
                "waitlist_cap": parse_int(row.get("waitlist_cap_num")),
                "waitlist_total": parse_int(row.get("waitlist_tot")),
            }
            section_inserts.append(section_payload)
            pending_section_keys.add(section_key)
            if len(section_inserts) >= BATCH_SIZE:
                flush_section_inserts()
        else:
            skipped["existing_sections"] += 1

        # Meeting times (insert missing)
        st = parse_time_24(row.get("meet_strt_tm"))
        et = parse_time_24(row.get("meet_stop_tm"))
        if st and et:
            section_id = section_ids.get(section_key)
            if section_id is not None and section_id > 0:
                mt_key = (
                    section_id,
                    normalize_str(row.get("days_of_wk_cd")),
                    st,
                    et,
                    normalize_str(row.get("meet_bldg_cd")),
                    normalize_str(row.get("meet_room_cd")),
                )
                if mt_key not in mt_existing:
                    payload = {
                        "section_id": section_id,
                        "days_of_week": mt_key[1],
                        "start_time": st,
                        "end_time": et,
                        "building": mt_key[4],
                        "room": mt_key[5],
                    }
                    if dry_run:
                        inserted["meeting_times"] += 1
                    else:
                        safe_execute(supabase.table("meeting_times").insert(payload))
                        inserted["meeting_times"] += 1
                    mt_existing.add(mt_key)
                else:
                    skipped["existing_meeting_times"] += 1

        # Instructors and section_instructors (insert missing)
        section_id = section_ids.get(section_key)
        if section_id is not None and section_id > 0:
            for instructor_name in split_instructors(row.get("instructors")):
                instructor_id = instructor_ids.get(instructor_name)
                if instructor_id is None:
                    if dry_run:
                        inserted["instructors"] += 1
                        instructor_id = -1
                    else:
                        out = safe_execute(
                            supabase.table("instructors").upsert(
                                {"name": instructor_name},
                                on_conflict="name",
                                returning="representation",
                            )
                        )
                        instructor_id = out.data[0]["id"]
                        inserted["instructors"] += 1
                    instructor_ids[instructor_name] = instructor_id

                pair = (section_id, instructor_id)
                if pair not in si_existing and instructor_id > 0:
                    if dry_run:
                        inserted["section_instructors"] += 1
                    else:
                        safe_execute(
                            supabase.table("section_instructors").upsert(
                                {"section_id": section_id, "instructor_id": instructor_id},
                                on_conflict="section_id,instructor_id",
                            )
                        )
                        inserted["section_instructors"] += 1
                    si_existing.add(pair)
                else:
                    skipped["existing_section_instructors"] += 1

        # Capture prerequisite candidate for this course key.
        parsed_req, source = parse_requisites_with_fallback(
            normalize_str(row.get("requisites")),
            normalize_str(row.get("class_sect_notes")),
        )
        if source == "requisites":
            prereq_stats["parsed_from_requisites"] += 1
        elif source == "class_sect_notes":
            prereq_stats["parsed_from_class_sect_notes"] += 1
        else:
            skipped["empty_requisites"] += 1

        if source != "none" and parsed_req:
            # Prefer requisites over notes if both appear across rows.
            current = req_source_by_course.get(course_key)
            if current is None:
                req_source_by_course[course_key] = (parsed_req, source)
            else:
                _, current_source = current
                if current_source == "class_sect_notes" and source == "requisites":
                    req_source_by_course[course_key] = (parsed_req, source)

    flush_section_inserts()

    # Write course_requisites for matched courses.
    for course_key, (parsed_req, _) in req_source_by_course.items():
        course_id = course_ids.get(course_key)
        if not course_id or course_id < 0:
            prereq_stats["missing_course_match"] += 1
            continue

        existing = existing_course_reqs.get(course_id) or {}
        if existing == parsed_req:
            continue

        if dry_run:
            inserted["course_requisites"] += 1
        else:
            try:
                safe_execute(
                    supabase.table("courses").update({"course_requisites": parsed_req}).eq("id", course_id)
                )
                inserted["course_requisites"] += 1
            except Exception:
                prereq_stats["failed_parse"] += 1

    print("\nSync complete")
    print(f"Dry run: {dry_run}")
    print("Inserted/updated:", inserted)
    print("Skipped:", skipped)
    print("Prereq stats:", prereq_stats)


def verify(rows: List[dict], strict_verify: bool = False):
    term_rows = fetch_all_rows("terms", "id,term_code")
    subject_rows = fetch_all_rows("subjects", "id,code")
    course_rows = fetch_all_rows("courses", "id,subject_id,catalog_number,course_requisites")
    section_rows = fetch_all_rows("sections", "term_id,course_id,section_code,id")
    mt_rows = fetch_all_rows("meeting_times", "section_id")
    si_rows = fetch_all_rows("section_instructors", "section_id")

    term_ids = {r["term_code"]: r["id"] for r in term_rows}
    subject_ids = {r["code"]: r["id"] for r in subject_rows}

    course_keys_in_db: Set[Tuple[int, str]] = set()
    course_id_by_key: Dict[Tuple[int, str], int] = {}
    course_req_by_key: Dict[Tuple[int, str], dict] = {}
    for r in course_rows:
        key = (r["subject_id"], (r["catalog_number"] or "").strip().upper())
        course_keys_in_db.add(key)
        course_id_by_key[key] = r["id"]
        course_req_by_key[key] = r.get("course_requisites") or {}

    section_keys_in_db: Set[Tuple[int, int, str]] = set()
    section_id_by_key: Dict[Tuple[int, int, str], int] = {}
    for r in section_rows:
        key = (r["term_id"], r["course_id"], r["section_code"])
        section_keys_in_db.add(key)
        section_id_by_key[key] = r["id"]

    mt_section_ids = {r["section_id"] for r in mt_rows}
    si_section_ids = {r["section_id"] for r in si_rows}

    missing_courses = set()
    missing_sections = set()
    missing_meeting_times = set()
    missing_instructors = set()
    missing_requisites = set()
    skipped_rows = {
        "total": 0,
        "missing_term": 0,
        "missing_subject": 0,
        "missing_catalog": 0,
        "missing_section": 0,
        "samples": [],
    }

    for row in rows:
        term_code = normalize_str(row.get("term_cd"))
        subj_code = normalize_str(row.get("subj_area_cd"))
        catalog_number = normalize_catalog_number(
            row.get("disp_catlg_no"),
            row.get("crs_catlg_no"),
        )
        section_code = normalize_str(row.get("sect_no")) or normalize_str(row.get("disp_sect_no"))

        term_id = term_ids.get(term_code)
        subject_id = subject_ids.get(subj_code)
        if term_id is None or subject_id is None or not catalog_number or not section_code:
            skipped_rows["total"] += 1
            reasons = []
            if term_id is None:
                skipped_rows["missing_term"] += 1
                reasons.append("missing_term")
            if subject_id is None:
                skipped_rows["missing_subject"] += 1
                reasons.append("missing_subject")
            if not catalog_number:
                skipped_rows["missing_catalog"] += 1
                reasons.append("missing_catalog")
            if not section_code:
                skipped_rows["missing_section"] += 1
                reasons.append("missing_section")
            if len(skipped_rows["samples"]) < 10:
                skipped_rows["samples"].append(
                    {
                        "term": term_code,
                        "subject": subj_code,
                        "catalog": catalog_number,
                        "section": section_code,
                        "reasons": reasons,
                    }
                )
            continue

        ckey = (subject_id, catalog_number)
        if ckey not in course_keys_in_db:
            missing_courses.add((subj_code, catalog_number))
            continue

        course_id = course_id_by_key.get(ckey)
        if course_id is None:
            missing_courses.add((subj_code, catalog_number))
            continue

        skey = (term_id, course_id, section_code)
        if skey not in section_keys_in_db:
            missing_sections.add((term_code, subj_code, catalog_number, section_code))
            continue

        sid = section_id_by_key[skey]
        st = parse_time_24(row.get("meet_strt_tm"))
        et = parse_time_24(row.get("meet_stop_tm"))
        if st and et and sid not in mt_section_ids:
            missing_meeting_times.add((term_code, subj_code, catalog_number, section_code))

        if split_instructors(row.get("instructors")) and sid not in si_section_ids:
            missing_instructors.add((term_code, subj_code, catalog_number, section_code))

        parsed_req, source = parse_requisites_with_fallback(
            normalize_str(row.get("requisites")),
            normalize_str(row.get("class_sect_notes")),
        )
        if source != "none" and parsed_req:
            if not course_req_by_key.get(ckey):
                missing_requisites.add((subj_code, catalog_number))

    print("\nVerification report")
    print(f"Missing courses: {len(missing_courses)}")
    print(f"Missing sections: {len(missing_sections)}")
    print(f"Missing meeting_times links: {len(missing_meeting_times)}")
    print(f"Missing section_instructors links: {len(missing_instructors)}")
    print(f"Missing course_requisites for courses with requisite text: {len(missing_requisites)}")
    print(f"Skipped rows (not verifiable): {skipped_rows['total']}")

    if missing_courses:
        print("Sample missing courses:", sorted(list(missing_courses))[:20])
    if missing_sections:
        print("Sample missing sections:", sorted(list(missing_sections))[:20])
    if missing_requisites:
        print("Sample missing requisites:", sorted(list(missing_requisites))[:20])
    if skipped_rows["samples"]:
        print("Sample skipped rows:", skipped_rows["samples"])

    if strict_verify:
        has_failures = any(
            [
                missing_courses,
                missing_sections,
                missing_meeting_times,
                missing_instructors,
                missing_requisites,
                skipped_rows["total"] > 0,
            ]
        )
        if has_failures:
            raise SystemExit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Sync and verify term course CSVs into Supabase.")
    parser.add_argument(
        "--mode",
        choices=["sync", "verify"],
        default="sync",
        help="sync: insert missing records and update course_requisites; verify: check CSV coverage in DB",
    )
    parser.add_argument(
        "--csv-dir",
        default=str(DEFAULT_CSV_DIR),
        help="Directory containing fall.csv, winter.csv, spring.csv",
    )
    parser.add_argument(
        "--files",
        nargs="*",
        default=None,
        help="Optional explicit CSV file names (relative to csv-dir) or absolute paths",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="In sync mode, compute inserts/updates without writing",
    )
    parser.add_argument(
        "--strict-verify",
        action="store_true",
        help="In verify mode, exit with non-zero status when any missing/skipped rows are detected",
    )
    return parser.parse_args()


def resolve_csv_paths(csv_dir: Path, files: Optional[List[str]]) -> List[Path]:
    if not files:
        return get_default_csv_paths(csv_dir)

    paths = []
    for name in files:
        p = Path(name)
        if not p.is_absolute():
            p = csv_dir / name
        if not p.exists():
            raise FileNotFoundError(f"CSV file not found: {p}")
        paths.append(p)
    return paths


def main():
    args = parse_args()
    csv_dir = Path(args.csv_dir)
    csv_paths = resolve_csv_paths(csv_dir, args.files)
    rows = load_csv_rows(csv_paths)

    print("Input files:", [str(p) for p in csv_paths])
    print("Row count:", len(rows))
    print("Supabase host:", SUPABASE_URL)

    if args.mode == "sync":
        sync(rows, dry_run=args.dry_run)
    else:
        verify(rows, strict_verify=args.strict_verify)


if __name__ == "__main__":
    main()
