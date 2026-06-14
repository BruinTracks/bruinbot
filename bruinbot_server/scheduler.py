import os
import re
import time
import json
import sys
import csv
import ast
from datetime import datetime
from typing import Dict, List, Tuple, Optional, Set, Any
from itertools import combinations
from dotenv import load_dotenv
from supabase import create_client

# ───── CONFIGURATION ─────
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

# ───── DEFAULTS ─────
DEFAULT_COURSES_TO_SCHEDULE = [
    "COM SCI|1", "COM SCI|31", "COM SCI|32", "COM SCI|33",
    "COM SCI|35L", "MATH|31A", "MATH|31B", "MATH|32A",
    "MATH|32B", "MATH|33A", "MATH|33B", "MATH|61",
    "PHYSICS|1A", "PHYSICS|1B", "PHYSICS|1C", "COM SCI|M51A",
    "PHYSICS|4AL", "COM SCI|111", "COM SCI|118", "COM SCI|131",
    "COM SCI|180", "COM SCI|181", "COM SCI|M151B", "COM SCI|M152A",
    "C&EE|110", "COM SCI|130",
    # Add RESOLVE requirements
    "RESOLVE: Computer Science Elective #1",
    "RESOLVE: Computer Science Elective #2",
    "RESOLVE: Computer Science Elective #3",
    "RESOLVE: Technical Breadth #1",
    "RESOLVE: Technical Breadth #2",
    "RESOLVE: Technical Breadth #3"
]
COURSES_TO_SCHEDULE = DEFAULT_COURSES_TO_SCHEDULE.copy()

# Transcript of completed courses
TRANSCRIPT: Dict[str, Optional[str]] = {}

# Scheduling parameters
MAX_COURSES_PER_TERM      = 5
LEAST_COURSES_PER_TERM    = 3
FILLER_COURSE             = "FILLER"
ALLOW_WARNINGS            = True
ALLOW_PRIMARY_CONFLICTS   = True
ALLOW_SECONDARY_CONFLICTS = True

# Debug payload from last run, returned when explicitly requested.
LAST_UNSCHEDULED_DEBUG: Dict[str, Dict] = {}
GE_DISPLAY_BY_COURSE: Dict[str, str] = {}

# Preferences defaults (rankable)
PREF_PRIORITY    = ['time','building','days','instructor']
PREF_EARLIEST    = datetime.strptime("09:00","%H:%M").time()
PREF_LATEST      = datetime.strptime("10:00","%H:%M").time()
PREF_NO_DAYS     = {"F"}
PREF_BUILDINGS   = {"MS","SCI"}
PREF_INSTRUCTORS = set()

# Grade ordering
GRADE_ORDER = [
    "A+","A","A-","B+","B","B-",
    "C+","C","C-","D+","D","D-","F"
]

# ───── HELPERS ─────

def safe_execute(req, retries:int=3, backoff:float=0.2):
    for i in range(retries):
        try:
            return req.execute()
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(backoff)


def chunked(items: List, size: int = 200):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def fetch_in_paged(table_obj, select_clause: str, in_col: str, in_vals: List,
                   in_chunk_size: int = 300, page_size: int = 1000) -> List[Dict]:
    rows: List[Dict] = []
    for vals in chunked(in_vals, in_chunk_size):
        start = 0
        while True:
            req = (
                table_obj
                .select(select_clause)
                .in_(in_col, vals)
                .range(start, start + page_size - 1)
            )
            batch = safe_execute(req).data or []
            rows.extend(batch)
            if len(batch) < page_size:
                break
            start += page_size
    return rows


def normalize_catalog_number(num: str) -> str:
    txt = str(num or "").strip().upper()
    if not txt:
        return txt
    trimmed = txt.lstrip('0')
    return trimmed or txt


def normalize_course_key(key: str) -> str:
    if "|" not in key:
        return key
    dept, num = key.split("|", 1)
    return f"{dept}|{normalize_catalog_number(num)}"


def to_dnf(node: Dict) -> List[List[Dict]]:
    if 'and' in node:
        prods = to_dnf(node['and'][0])
        for child in node['and'][1:]:
            prods = [a + b for a in prods for b in to_dnf(child)]
        return prods
    if 'or' in node:
        res: List[List[Dict]] = []
        for child in node['or']:
            res.extend(to_dnf(child))
        return res
    return [[node]]


def meets_min_grade(obt: str, req: str) -> bool:
    try:
        return GRADE_ORDER.index(obt) <= GRADE_ORDER.index(req)
    except ValueError:
        return False


def meetings_overlap(m1: Dict, m2: Dict) -> bool:
    if not set(m1['days_of_week']).intersection(m2['days_of_week']):
        return False
    return not (m1['end_time'] <= m2['start_time'] or m2['end_time'] <= m1['start_time'])


def create_term_sequence(start_q: str, start_y: int, end_q: str, end_y: int) -> List[str]:
    seasons = ["Fall", "Winter", "Spring"]
    seq: List[str] = []
    idx = seasons.index(start_q)
    year = start_y
    while True:
        seq.append(f"{seasons[idx]} {year}")
        if seasons[idx] == end_q and year == end_y:
            break
        if seasons[idx] == "Fall":
            year += 1
        idx = (idx + 1) % len(seasons)
    return seq


def canonical_school_bucket(school: Optional[str]) -> str:
    value = (school or "").strip().lower()
    if value in {"arts & architecture", "music"}:
        return "arts_music"
    if value in {
        "letters & sciences",
        "education & information studies",
        "public affairs",
    }:
        return "ls_edu_public"
    if value == "engineering":
        return "engineering"
    if value == "nursing":
        return "nursing"
    if value in {"theater, film & television", "theater, film and television"}:
        return "tft"
    return "ls_edu_public"


def short_foundation_name(foundation: str) -> str:
    txt = canonical_foundation_name(foundation)
    txt = re.sub(r"^Foundations of\s+", "", txt, flags=re.IGNORECASE)
    return txt or "General Education"


def canonical_foundation_name(foundation: str) -> str:
    txt = str(foundation or "").strip()
    lowered = txt.lower()

    # Support both schema variants used in data sources.
    aliases = {
        "arts and humanities": "Foundations of Arts and Humanities",
        "foundations of arts and humanities": "Foundations of Arts and Humanities",
        "society and culture": "Foundations of Society and Culture",
        "foundations of society and culture": "Foundations of Society and Culture",
        "scientific inquiry": "Foundations of Scientific Inquiry",
        "foundations of scientific inquiry": "Foundations of Scientific Inquiry",
    }
    return aliases.get(lowered, txt)


def get_school_ge_rules(bucket: str) -> List[Dict[str, Any]]:
    # Matrix-driven approximation using course counts by school/foundation/category.
    # Hard constraints are encoded here; interest ranking happens during selection.
    common_ah = {
        "foundation": "Foundations of Arts and Humanities",
        "total": 3,
        "category_min": {
            "Literary and Cultural Analysis": 1,
            "Philosophical and Linguistic Analysis": 1,
            "Visual and Performance Arts Analysis and Practice": 1,
        },
    }
    common_sc = {
        "foundation": "Foundations of Society and Culture",
        "total": 3,
        "category_min": {
            "Historical Analysis": 1,
            "Social Analysis": 1,
        },
    }

    rules_by_bucket = {
        "arts_music": [
            common_ah,
            common_sc,
            {
                "foundation": "Foundations of Scientific Inquiry",
                "total": 2,
                "category_min": {},
                "max_per_category": {},
                "lab_min": 0,
            },
        ],
        "ls_edu_public": [
            common_ah,
            common_sc,
            {
                "foundation": "Foundations of Scientific Inquiry",
                "total": 4,
                "category_min": {
                    "Life Sciences": 2,
                    "Physical Sciences": 2,
                },
                "lab_min": 1,
            },
        ],
        "engineering": [
            {
                "foundation": "Foundations of Arts and Humanities",
                "total": 2,
                "category_min": {},
                "max_per_category": {
                    "Literary and Cultural Analysis": 1,
                    "Philosophical and Linguistic Analysis": 1,
                    "Visual and Performance Arts Analysis and Practice": 1,
                },
            },
            {
                "foundation": "Foundations of Society and Culture",
                "total": 2,
                "category_min": {
                    "Historical Analysis": 1,
                    "Social Analysis": 1,
                },
            },
            {
                "foundation": "Foundations of Scientific Inquiry",
                "total": 1,
                "category_min": {
                    "Life Sciences": 1,
                },
            },
        ],
        "nursing": [
            common_ah,
            common_sc,
            {
                "foundation": "Foundations of Scientific Inquiry",
                "total": 4,
                "category_min": {
                    "Life Sciences": 2,
                    "Physical Sciences": 2,
                },
            },
        ],
        "tft": [
            {
                "foundation": "Foundations of Arts and Humanities",
                "total": 5,
                "category_min": {},
                "max_per_category": {
                    "Literary and Cultural Analysis": 2,
                    "Philosophical and Linguistic Analysis": 2,
                    "Visual and Performance Arts Analysis and Practice": 2,
                },
            },
            common_sc,
            {
                "foundation": "Foundations of Scientific Inquiry",
                "total": 2,
                "category_min": {
                    "Life Sciences": 1,
                    "Physical Sciences": 1,
                },
            },
        ],
    }

    return rules_by_bucket.get(bucket, rules_by_bucket["ls_edu_public"])


def interest_score_for_ge(row: Dict[str, Any], interests: List[str]) -> int:
    if not interests:
        return 0
    blob = " ".join(
        [
            str(row.get("subject_name") or ""),
            str(row.get("course_name") or ""),
            str(row.get("category") or ""),
            str(row.get("foundation") or ""),
        ]
    ).lower()
    score = 0
    for interest in interests:
        txt = str(interest or "").strip().lower()
        if txt and txt in blob:
            score += 3
    if bool(row.get("writing_ii")):
        score += 1
    if bool(row.get("lab_demo")):
        score += 1
    return score


def pick_initial_ge_courses(
    supa,
    school: Optional[str],
    ge_interests: List[str],
    sub2id: Dict[str, int],
    id2sub: Dict[int, str],
    transcript: Dict[str, Optional[str]],
    existing_courses: List[str],
    term_ids: Set[int],
) -> Tuple[List[str], Dict[str, str]]:
    bucket = canonical_school_bucket(school)
    rules = get_school_ge_rules(bucket)

    ge_rows = []
    start = 0
    while True:
        batch = safe_execute(
            supa.table("general_education")
            .select(
                "subject_id,subject_name,course_code,course_name,foundation,category,lab_demo,writing_ii"
            )
            .range(start, start + 999)
        ).data or []
        ge_rows.extend(batch)
        if len(batch) < 1000:
            break
        start += 1000

    # Some environments do not have general_education seeded yet.
    # Fall back to the repo CSV so GE generation still works.
    if not ge_rows:
        ge_rows = load_ge_rows_from_csv(sub2id)

    if not ge_rows:
        return [], {}

    # Restrict to courses that have at least one section in the planning window.
    sec_rows = []
    sec_start = 0
    while True:
        batch = safe_execute(
            supa.table("sections")
            .select("course_id,term_id")
            .in_("term_id", list(term_ids) if term_ids else [-1])
            .range(sec_start, sec_start + 999)
        ).data or []
        sec_rows.extend(batch)
        if len(batch) < 1000:
            break
        sec_start += 1000
    schedulable_course_ids = {r["course_id"] for r in sec_rows}

    used = {
        normalize_course_key(c)
        for c in existing_courses
        if isinstance(c, str) and not c.startswith("RESOLVE:")
    }
    used |= {
        normalize_course_key(c)
        for c, g in transcript.items()
        if g and meets_min_grade(g, "D-")
    }

    chosen: List[str] = []
    ge_display_map: Dict[str, str] = {}

    def normalized_category(row: Dict[str, Any]) -> str:
        return str(row.get("category") or "").strip()

    def foundation_rows(foundation: str) -> List[Dict[str, Any]]:
        target = canonical_foundation_name(foundation)
        return [
            r
            for r in ge_rows
            if canonical_foundation_name(str(r.get("foundation") or "")).lower() == target.lower()
        ]

    def row_to_course_key(row: Dict[str, Any]) -> Optional[str]:
        subject_id = row.get("subject_id")
        if subject_id not in id2sub:
            return None
        code = id2sub[subject_id]
        num = normalize_catalog_number(str(row.get("course_code") or ""))
        if not num:
            return None
        key = f"{code}|{num}"
        if key in used:
            return None
        # Confirm course exists and has sections in planning window.
        row_match = safe_execute(
            supa.table("courses")
            .select("id")
            .eq("subject_id", subject_id)
            .eq("catalog_number", num)
            .limit(1)
        ).data or []
        if not row_match:
            return None
        if row_match[0]["id"] not in schedulable_course_ids:
            return None
        return key

    for rule in rules:
        foundation = rule["foundation"]
        total_needed = int(rule.get("total", 0))
        category_min = dict(rule.get("category_min", {}))
        max_per_category = dict(rule.get("max_per_category", {}))
        lab_min = int(rule.get("lab_min", 0))

        f_rows = foundation_rows(foundation)
        f_rows.sort(key=lambda r: interest_score_for_ge(r, ge_interests), reverse=True)

        selected_rows: List[Dict[str, Any]] = []
        category_counts: Dict[str, int] = {}
        subject_seen: Set[str] = set()

        def can_take(row: Dict[str, Any]) -> bool:
            category = normalized_category(row)
            if category in max_per_category and category_counts.get(category, 0) >= max_per_category[category]:
                return False
            subject_name = str(row.get("subject_name") or "").strip().lower()
            if subject_name and subject_name in subject_seen:
                return False
            return True

        def push_row(row: Dict[str, Any]) -> bool:
            key = row_to_course_key(row)
            if not key:
                return False
            short = short_foundation_name(foundation)
            display = f"{key.replace('|', ' ')} (GE - {short})"
            selected_rows.append(row)
            category = normalized_category(row)
            category_counts[category] = category_counts.get(category, 0) + 1
            subject_name = str(row.get("subject_name") or "").strip().lower()
            if subject_name:
                subject_seen.add(subject_name)
            used.add(key)
            chosen.append(key)
            ge_display_map[key] = display
            return True

        # 1) Fill category minimums first.
        for category, min_count in category_min.items():
            candidates = [
                r for r in f_rows if normalized_category(r).lower() == category.lower()
            ]
            needed = max(0, int(min_count))
            for row in candidates:
                if needed <= 0:
                    break
                if not can_take(row):
                    continue
                if push_row(row):
                    needed -= 1

        # 2) Enforce lab minimum for this foundation if requested.
        current_lab = sum(1 for r in selected_rows if bool(r.get("lab_demo")))
        if lab_min > current_lab:
            lab_candidates = [r for r in f_rows if bool(r.get("lab_demo"))]
            for row in lab_candidates:
                if current_lab >= lab_min:
                    break
                if row in selected_rows or not can_take(row):
                    continue
                if push_row(row):
                    current_lab += 1

        # 3) Fill remaining slots by interest score under max constraints.
        while len(selected_rows) < total_needed:
            added = False
            for row in f_rows:
                if row in selected_rows or not can_take(row):
                    continue
                if push_row(row):
                    added = True
                    break
            if not added:
                break

    return chosen, ge_display_map


def load_ge_rows_from_csv(sub2id: Dict[str, int]) -> List[Dict[str, Any]]:
    csv_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "bruinbot_scripts",
        "ge_courses",
        "ucla_ge_courses.csv",
    )
    if not os.path.exists(csv_path):
        return []

    foundation_map = {
        "Arts and Humanities": "Foundations of Arts and Humanities",
        "Society and Culture": "Foundations of Society and Culture",
        "Scientific Inquiry": "Foundations of Scientific Inquiry",
    }

    rows: List[Dict[str, Any]] = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for rec in reader:
            dept_code = str(rec.get("Department Code") or "").strip().upper()
            subject_id = sub2id.get(dept_code)
            if not subject_id:
                continue

            raw_foundations = str(rec.get("Foundation Categories") or "").strip()
            if not raw_foundations:
                continue

            try:
                foundation_entries = ast.literal_eval(raw_foundations)
            except Exception:
                continue

            if not isinstance(foundation_entries, list):
                continue

            writing_val = str(rec.get("Writing II") or "").strip().lower()
            writing_ii = writing_val in {"yes", "y", "true", "1"}
            course_code = str(rec.get("Catalog Number") or "").strip()
            course_name = str(rec.get("Course Title") or "").strip()
            subject_name = str(rec.get("Department") or "").strip()

            for entry in foundation_entries:
                text = str(entry or "").strip()
                if not text:
                    continue
                if ":" not in text:
                    continue
                group, category = [p.strip() for p in text.split(":", 1)]
                foundation = foundation_map.get(group)
                if not foundation:
                    continue

                rows.append(
                    {
                        "subject_id": subject_id,
                        "subject_name": subject_name,
                        "course_code": course_code,
                        "course_name": course_name,
                        "foundation": foundation,
                        "category": category,
                        "lab_demo": False,
                        "writing_ii": writing_ii,
                    }
                )

    return rows


def quarter_prefixes(prereq_logic: Dict[str, List[Tuple[str, str, str, str]]],
                     k: int, allow_warnings: bool) -> List[List[str]]:
    """Top-level helper used only when choosing the *very first* quarter.
    Unchanged – it still enumerates all prerequisite-satisfying sets of k courses
    that are currently available, *ignoring term offerings*. We filter by term
    availability later (see build_schedule).
    """
    nodes = set(prereq_logic.keys())
    for reqs in prereq_logic.values():
        for c, *_ in reqs:
            nodes.add(c)
    passed = {c for c, g in TRANSCRIPT.items() if g and meets_min_grade(g, 'D-')}
    nodes -= passed
    indegree = {n: 0 for n in nodes}
    for course, reqs in prereq_logic.items():
        if course not in indegree:
            continue
        for rc, typ, _, sev in reqs:
            # Corequisites can be taken concurrently and should not block ordering.
            if rc in indegree and typ == 'prerequisite' and (
                sev == 'R' or (sev == 'W' and not allow_warnings)):
                indegree[course] += 1
    avail = sorted(n for n, d in indegree.items() if d == 0)
    if len(avail) < k:
        return [avail]
    return [list(cmb) for cmb in combinations(avail, k)]

# ───── CORE SCHEDULER ─────

def build_schedule(start_y: int, start_q: str,
                   end_y: int, end_q: str,
                   allow_warnings: bool,
                   school: Optional[str],
                   ge_interests: List[str]) -> Tuple[Dict[str, object], Optional[str]]:
    global COURSES_TO_SCHEDULE
    global LAST_UNSCHEDULED_DEBUG
    global GE_DISPLAY_BY_COURSE
    
    # Separate RESOLVE requirements from regular courses and count them
    resolve_reqs = []
    resolve_counts = {}
    for course in COURSES_TO_SCHEDULE:
        if course.startswith("RESOLVE:"):
            # Extract the base requirement name by removing "RESOLVE: " and any trailing " #N"
            full_req_name = course[8:].strip()  # Skip "RESOLVE: "
            # Remove the trailing number if it exists
            base_req_name = re.sub(r' #\d+$', '', full_req_name)
            resolve_counts[base_req_name] = resolve_counts.get(base_req_name, 0) + 1
            resolve_reqs.append(base_req_name)  # Store without prefix and number
    regular_courses = [
        normalize_course_key(c)
        for c in COURSES_TO_SCHEDULE
        if not c.startswith("RESOLVE:")
    ]
    
    # First build schedule with regular courses
    original_courses = COURSES_TO_SCHEDULE[:]
    COURSES_TO_SCHEDULE = regular_courses

    # term labels & DB ids -----------------------------------------------------
    terms = create_term_sequence(start_q, start_y, end_q, end_y)

    supa = create_client(SUPABASE_URL, SUPABASE_KEY)

    term_rows = safe_execute(supa.table("terms").select("term_name,id")).data
    season_to_term_ids: Dict[str, Set[int]] = {}
    for row in term_rows:
        season = row['term_name'].split()[0]
        season_to_term_ids.setdefault(season, set()).add(row['id'])
    idx2db = [season_to_term_ids.get(lbl.split()[0], set()) for lbl in terms]

    # Track scheduling failures
    scheduling_failures = {}

    # subject mappings --------------------------------------------------------
    subs = safe_execute(supa.table("subjects").select("id,code,name")).data
    sub2id = {s['code']: s['id'] for s in subs}
    id2sub = {s['id']: s['code'] for s in subs}
    name2sub = {re.sub(r"\s*\(.*\)$", "", s['name']).strip().upper(): s['code'] for s in subs}

    # GE auto-selection (school + matrix + interests) ------------------------
    all_planning_term_ids: Set[int] = set().union(*idx2db) if idx2db else set()
    selected_ge_courses, ge_display_map = pick_initial_ge_courses(
        supa=supa,
        school=school,
        ge_interests=ge_interests,
        sub2id=sub2id,
        id2sub=id2sub,
        transcript=TRANSCRIPT,
        existing_courses=regular_courses,
        term_ids=all_planning_term_ids,
    )
    if selected_ge_courses:
        regular_courses.extend(selected_ge_courses)
    GE_DISPLAY_BY_COURSE = ge_display_map

    # remove passed courses ---------------------------------------------------
    passed = {
        normalize_course_key(c)
        for c, g in TRANSCRIPT.items()
        if g and meets_min_grade(g, 'D-')
    }
    required: Set[str] = set(COURSES_TO_SCHEDULE) - passed
    transcript = TRANSCRIPT.copy()

    # ───── 1. Fetch course rows ---------------------------------------------
    def fetch_courses(keys: List[str]):
        mapped_pairs: List[Tuple[int, str]] = []
        for key in keys:
            if "|" not in key:
                continue
            dept, num = key.split("|", 1)
            subj_id = sub2id.get(dept)
            if subj_id and num:
                mapped_pairs.append((subj_id, normalize_catalog_number(num)))

        if not mapped_pairs:
            return []

        by_subject: Dict[int, Set[str]] = {}
        for subj_id, num in mapped_pairs:
            by_subject.setdefault(subj_id, set()).add(num)

        rows = []
        for subj_id, nums in by_subject.items():
            nums_list = sorted(nums)
            for nums_chunk in chunked(nums_list, 150):
                start = 0
                while True:
                    part = safe_execute(
                        supa.table("courses")
                            .select("id,subject_id,catalog_number,course_requisites")
                            .eq("subject_id", subj_id)
                            .in_("catalog_number", nums_chunk)
                            .range(start, start + 999)
                    ).data or []
                    rows.extend(part)
                    if len(part) < 1000:
                        break
                    start += 1000

        return rows

    # ───── 2. Build prerequisite logic --------------------------------------
    prereq_logic: Dict[str, List[Tuple[str, str, str, str]]] = {}
    queue = list(required)
    while queue:
        c = queue.pop(0)
        rows = fetch_courses([c])
        raw = rows[0].get('course_requisites') if rows else {}
        clauses = to_dnf(raw or {})
        best_clause, best_missing = [], []
        min_miss = float('inf')
        for clause in clauses:
            parsed, missing = [], []
            for leaf in clause:
                if 'course' not in leaf:
                    continue
                txt = leaf['course'].strip().rstrip(')')
                parts = txt.rsplit(' ', 1)
                if len(parts) != 2:
                    continue
                dept, num = parts
                code = name2sub.get(dept.upper())
                if not code:
                    continue
                ukey = f"{code}|{normalize_catalog_number(num)}"
                parsed.append((ukey, leaf['relation'], leaf.get('min_grade', 'D-'), leaf.get('severity')))
                if not meets_min_grade(transcript.get(ukey, 'F'), leaf.get('min_grade', 'F')):
                    missing.append(ukey)
            if not missing:
                best_clause, best_missing = parsed, []
                break
            if len(missing) < min_miss:
                best_clause, best_missing, min_miss = parsed, missing, len(missing)
        prereq_logic[c] = best_clause
        for u in best_missing:
            if u not in required:
                required.add(u)
                queue.append(u)

    # ───── 3. Fetch sections + meetings -------------------------------------
    all_courses = fetch_courses(list(required))
    cid2key = {
        c['id']: f"{id2sub[c['subject_id']]}|{normalize_catalog_number(c['catalog_number'])}"
        for c in all_courses
    }
    fetched_course_keys = set(cid2key.values())

    # Ignore genuinely missing courses (not found in courses table) so they do not
    # block prerequisite chains or appear in unscheduled output.
    missing_from_db = {c for c in required if c not in fetched_course_keys}
    if missing_from_db:
        required -= missing_from_db

    all_course_ids = [c['id'] for c in all_courses]

    if all_course_ids:
        secs = fetch_in_paged(
            supa.table("sections"),
            "id,course_id,term_id,section_code,is_primary,activity," +
            "enrollment_cap,enrollment_total,waitlist_cap,waitlist_total",
            "course_id",
            all_course_ids,
            in_chunk_size=300,
            page_size=1000,
        )
    else:
        secs = []

    section_ids = [s['id'] for s in secs]
    if section_ids:
        mt = fetch_in_paged(
            supa.table("meeting_times"),
            "section_id,days_of_week,start_time,end_time,building,room",
            "section_id",
            section_ids,
            in_chunk_size=500,
            page_size=1000,
        )
        si = fetch_in_paged(
            supa.table("section_instructors"),
            "section_id,instructor_id",
            "section_id",
            section_ids,
            in_chunk_size=500,
            page_size=1000,
        )
    else:
        mt = []
        si = []

    # ───── 3a. Map meeting times & instructors ------------------------------
    mt_map, si_map = {}, {}
    for m in mt:
        m['start_time'] = datetime.strptime(m['start_time'], "%H:%M:%S").time()
        m['end_time'] = datetime.strptime(m['end_time'], "%H:%M:%S").time()
        mt_map.setdefault(m['section_id'], []).append(m)

    instr_ids = {r['instructor_id'] for r in si}
    if instr_ids:
        instr_rows = safe_execute(
            supa.table("instructors").select("id,name").in_("id", list(instr_ids))
        ).data
    else:
        instr_rows = []
    id2instr = {r['id']: r['name'] for r in instr_rows}
    for r in si:
        si_map.setdefault(r['section_id'], []).append(id2instr[r['instructor_id']])

    # ───── 3b. Group sections by course -------------------------------------
    sections_by_course: Dict[str, List[Dict]] = {}

    def is_section_full_capacity(sec: Dict) -> bool:
        return (
            sec['enrollment_total'] >= sec['enrollment_cap']
            and sec['waitlist_total'] >= sec['waitlist_cap']
        )

    for s in secs:
        key = cid2key[s['course_id']]
        s['is_full_capacity'] = is_section_full_capacity(s)
        s['times'] = mt_map.get(s['id'], [])
        s['instructors'] = si_map.get(s['id'], [])
        sections_by_course.setdefault(key, []).append(s)

    # ───── 3c. Pre-compute offering terms per course ------------------------
    offer_terms_by_course: Dict[str, Set[int]] = {}
    for c in required:
        sec_list = sections_by_course.get(c, [])
        offer_terms_by_course[c] = {sec['term_id'] for sec in sec_list}
        # Track courses with no sections
        if not sec_list:
            scheduling_failures[c] = "No available sections found"

    def section_allowed_in_term(sec: Dict, term_idx: int) -> bool:
        # Keep full-capacity sections schedulable overall, but never in the first shown term.
        if term_idx == 0 and sec.get('is_full_capacity'):
            return False
        return True

    def term_has_schedulable_section(course: str, term_db_ids: Set[int], term_idx: int) -> bool:
        if not term_db_ids:
            return False
        for sec in sections_by_course.get(course, []):
            if sec['term_id'] in term_db_ids and section_allowed_in_term(sec, term_idx):
                return True
        return False

    # Earliest term each course can be scheduled while respecting first-term full policy.
    eligible_term_indices_by_course: Dict[str, List[int]] = {}
    for course in required:
        eligible_indices = []
        for idx, db_ids in enumerate(idx2db):
            if not db_ids:
                continue
            if term_has_schedulable_section(course, db_ids, idx):
                eligible_indices.append(idx)
        eligible_term_indices_by_course[course] = eligible_indices

        if not eligible_indices and sections_by_course.get(course):
            first_term_sections = [
                sec for sec in sections_by_course[course] if sec['term_id'] in idx2db[0]
            ]
            if first_term_sections and all(sec.get('is_full_capacity') for sec in first_term_sections):
                scheduling_failures[course] = "Only full-capacity sections in first term; no later schedulable offering"
            else:
                scheduling_failures[course] = "No schedulable sections in planning window"

    # ───── 4. Build prereq DAG ---------------------------------------------
    adj = {c: [] for c in required}
    indegree = {c: 0 for c in required}
    for c, reqs in prereq_logic.items():
        if c not in indegree:
            continue
        for rc, typ, _, sev in reqs:
            # Corequisites can be co-scheduled; only prerequisites add DAG edges.
            if rc in indegree and typ == 'prerequisite' and (
                sev == 'R' or (sev == 'W' and not allow_warnings)):
                adj[rc].append(c)
                indegree[c] += 1
                # Track prerequisite dependencies
                if rc not in scheduling_failures:
                    scheduling_failures[rc] = f"Required as {typ} for {c}"

    remaining = set(required)
    R_rem = len(remaining)
    T_left = len(terms)
    schedule: Dict[str, object] = {}

    # ───── 4a. Preference weights ------------------------------------------
    weight_map = {p: len(PREF_PRIORITY) - i for i, p in enumerate(PREF_PRIORITY)}

    def downstream_count(course: str) -> int:
        seen = set()
        stack = list(adj.get(course, []))
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            stack.extend(adj.get(cur, []))
        return len(seen)

    downstream_counts = {c: downstream_count(c) for c in required}

    def score_section(sec: Dict) -> int:
        score = 0
        for m in sec['times']:
            if PREF_EARLIEST <= m['start_time'] <= PREF_LATEST:
                score += weight_map['time']
            if PREF_EARLIEST <= m['end_time'] <= PREF_LATEST:
                score += weight_map['time']
            if m['building'] in PREF_BUILDINGS:
                score += weight_map['building']
            if set(m['days_of_week']).isdisjoint(PREF_NO_DAYS):
                score += weight_map['days']
        if any(i in PREF_INSTRUCTORS for i in sec['instructors']):
            score += weight_map['instructor']
        return score

    def best_term_preference_score(course: str, term_db_ids: Set[int], term_idx: int) -> int:
        if not term_db_ids:
            return 0
        best = -1
        for sec in sections_by_course.get(course, []):
            if sec['term_id'] not in term_db_ids or not section_allowed_in_term(sec, term_idx):
                continue
            best = max(best, score_section(sec))
        return max(best, 0)

    # ───── 4b. Scoring helper for the *first* term -------------------------
    def score_and_select(prefix: List[str]) -> Tuple[int, Dict[str, Dict]]:
        total = 0
        sel = {}
        for course in prefix:
            best_sec, best_sec_sc = None, -1
            best_disc, best_disc_sc = None, -1

            for sec in sections_by_course.get(course, []):
                if sec['term_id'] not in idx2db[0]:
                    continue  # Not offered in the first term
                if not section_allowed_in_term(sec, 0):
                    continue

                sc = score_section(sec)

                if sec['is_primary']:
                    if sc > best_sec_sc:
                        best_sec_sc, best_sec = sc, sec
                else:
                    if sc > best_disc_sc:
                        best_disc_sc, best_disc = sc, sec

            # Skip courses that actually have *no* meeting in this term
            if not best_sec and not best_disc:
                scheduling_failures[course] = "No available sections in this term"
                continue

            sel[course] = {'lecture': best_sec, 'discussion': best_disc}
            total += max(0, best_sec_sc) + max(0, best_disc_sc)
        return total, sel

    # ───── 5. Assign term-by-term -----------------------------------------
    for t_idx, term in enumerate(terms):
        term_db_id = idx2db[t_idx]

        # Courses whose prereqs are met and can be scheduled this term (coverage first).
        avail = []
        for c in remaining:
            if indegree[c] != 0:
                continue
            eligible_indices = eligible_term_indices_by_course.get(c, [])
            if not eligible_indices:
                continue
            if t_idx < eligible_indices[0]:
                continue
            if not term_db_id or not term_has_schedulable_section(c, term_db_id, t_idx):
                continue
            avail.append(c)

        def avail_sort_key(course: str):
            eligible_indices = eligible_term_indices_by_course.get(course, [])
            remaining_terms = [idx for idx in eligible_indices if idx >= t_idx]
            scarcity = len(remaining_terms) if remaining_terms else 9999
            return (
                scarcity,
                -downstream_counts.get(course, 0),
                -best_term_preference_score(course, term_db_id, t_idx),
                course,
            )

        avail.sort(key=avail_sort_key)

        base = R_rem // T_left
        extra = R_rem % T_left
        target = max(
            LEAST_COURSES_PER_TERM,
            min(base + (1 if extra > 0 else 0), MAX_COURSES_PER_TERM)
        )

        if term == terms[0]:
            # Build prerequisite-compatible prefixes, then discard courses without offerings
            prefixes_raw = quarter_prefixes(prereq_logic, target, allow_warnings)
            prefixes = [
                [
                    c
                    for c in pref
                    if c in remaining
                    and indegree.get(c, 0) == 0
                    and bool(term_db_id.intersection(offer_terms_by_course.get(c, set())))
                    and term_has_schedulable_section(c, term_db_id, t_idx)
                ]
                for pref in prefixes_raw
            ]
            
            # Filter out prefixes that don't meet minimum course requirement
            prefixes = [p for p in prefixes if len(p) >= LEAST_COURSES_PER_TERM]
            
            if not prefixes:
                # If no valid prefixes found, try to find any combination of available courses
                prefixes = [avail[:target]]
                if not prefixes[0]:
                    for course in remaining:
                        if course not in scheduling_failures:
                            scheduling_failures[course] = "No valid schedule combinations found"
            
            scored = [
                (sc, sel, pf)
                for pf in prefixes
                for sc, sel in [score_and_select(pf)]
            ]

            # Filter out prefixes that ended up selecting no schedulable courses.
            scored = [tpl for tpl in scored if tpl[1]] or [scored[0]]

            # Conflict checks (identical to original)
            valid = []
            for sc, sel, pf in scored:
                conflict = False
                conflict_courses = set()

                if not ALLOW_PRIMARY_CONFLICTS:
                    lec_list = [sel[c]['lecture'] for c in pf if sel[c]['lecture']]
                    for i in range(len(lec_list)):
                        for j in range(i + 1, len(lec_list)):
                            for m1 in lec_list[i]['times']:
                                for m2 in lec_list[j]['times']:
                                    if meetings_overlap(m1, m2):
                                        conflict = True
                                        conflict_courses.add(pf[i])
                                        conflict_courses.add(pf[j])
                if not conflict and not ALLOW_SECONDARY_CONFLICTS:
                    dis_list = [sel[c]['discussion'] for c in pf if sel[c]['discussion']]
                    for i in range(len(dis_list)):
                        for j in range(i + 1, len(dis_list)):
                            for m1 in dis_list[i]['times']:
                                for m2 in dis_list[j]['times']:
                                    if meetings_overlap(m1, m2):
                                        conflict = True
                                        conflict_courses.add(pf[i])
                                        conflict_courses.add(pf[j])
                    lec_list = [sel[c]['lecture'] for c in pf if sel[c]['lecture']]
                    for lec in lec_list:
                        for d in dis_list:
                            for m1 in lec['times']:
                                for m2 in d['times']:
                                    if meetings_overlap(m1, m2):
                                        conflict = True
                                        conflict_courses.add(pf[i])
                                        conflict_courses.add(pf[j])
                if not conflict:
                    valid.append((sc, sel, pf))
                else:
                    for course in conflict_courses:
                        if course not in scheduling_failures:
                            scheduling_failures[course] = "Schedule conflicts with other courses"
            choices = valid or scored
            # First term only: prioritize student preferences first, then coverage.
            # Later terms keep unscheduled-first behavior via avail_sort_key.
            best_sc, best_sel, take = max(
                choices,
                key=lambda x: (
                    x[0],
                    len(x[1]),
                    sum(downstream_counts.get(c, 0) for c in x[1].keys()),
                ),
            )
            schedule[term] = best_sel
        else:
            take = avail[:target]
            schedule[term] = take

        # Update prereq DAG state -------------------------------------------
        for c in take:
            for nxt in adj.get(c, []):
                indegree[nxt] -= 1
            remaining.discard(c)
        R_rem = len(remaining)
        T_left -= 1

    # ───── 6. Pad / trim each term ----------------------------------------
    for term in terms:
        ent = schedule[term]
        if isinstance(ent, list):
            while len(ent) < LEAST_COURSES_PER_TERM:
                ent.append(FILLER_COURSE)
            schedule[term] = ent[:MAX_COURSES_PER_TERM]
        else:
            keys = list(ent.keys())
            while len(keys) < LEAST_COURSES_PER_TERM:
                keys.append(FILLER_COURSE)
                ent[FILLER_COURSE] = {'lecture': None, 'discussion': None}
            for extra in keys[MAX_COURSES_PER_TERM:]:
                ent.pop(extra, None)
            schedule[term] = {k: ent[k] for k in keys[:MAX_COURSES_PER_TERM]}

    # ───── 7. Compute note --------------------------------------------------
    scheduled_all = set()
    for ent in schedule.values():
        if isinstance(ent, dict):
            scheduled_all |= set(ent.keys())
        else:
            scheduled_all |= set(ent)
    unscheduled = set(COURSES_TO_SCHEDULE) - scheduled_all
    unscheduled -= passed  # remove previously passed courses
    unscheduled -= missing_from_db  # explicitly ignore courses absent from DB

    note = None
    debug_unscheduled: Dict[str, Dict] = {}
    if unscheduled:
        # Create detailed explanation for each unscheduled course
        explanations = []
        for course in sorted(unscheduled):
            reason = scheduling_failures.get(course)
            has_sections = bool(sections_by_course.get(course))

            # Guard against stale/overwritten diagnostics: if sections exist,
            # never report a no-sections reason.
            if reason == "No available sections found" and has_sections:
                reason = None

            if not reason:
                if not has_sections:
                    alias_keys = []
                    if "|" in course:
                        dept, num = course.split("|", 1)
                        target_num = normalize_catalog_number(num)
                        for key in sections_by_course.keys():
                            if "|" not in key:
                                continue
                            k_dept, k_num = key.split("|", 1)
                            if k_dept == dept and normalize_catalog_number(k_num) == target_num:
                                alias_keys.append(key)

                    if alias_keys:
                        reason = f"No available sections found for exact key; matching aliases in sections: {sorted(set(alias_keys))[:3]}"
                    else:
                        reason = "No available sections found"
                elif indegree.get(course, 0) > 0:
                    reason = "Blocked by prerequisite dependency chain"
                else:
                    reason = "Could not place within term capacity/preferences"

            debug_unscheduled[course] = {
                'reason': reason,
                'in_required_set': course in required,
                'fetched_course_row': course in offer_terms_by_course,
                'section_count': len(sections_by_course.get(course, [])),
                'offered_term_ids': sorted(list(offer_terms_by_course.get(course, set()))),
                'eligible_term_indices': list(eligible_term_indices_by_course.get(course, [])),
                'eligible_term_labels': [terms[i] for i in eligible_term_indices_by_course.get(course, [])],
                'ending_indegree': indegree.get(course, 0),
            }

            explanations.append(f"{course} ({reason})")
        note = "Unable to schedule: " + "; ".join(explanations)

    ge_unscheduled = sorted(c for c in unscheduled if c in GE_DISPLAY_BY_COURSE)

    LAST_UNSCHEDULED_DEBUG = debug_unscheduled

    # Restore original COURSES_TO_SCHEDULE
    COURSES_TO_SCHEDULE = original_courses
    
    # Now distribute RESOLVE requirements in sparse quarters
    # Initialize tracking of placed requirements
    placed_counts = {req: 0 for req in resolve_counts.keys()}
    unplaced_reqs = []
    
    # First, replace FILLER courses with electives where possible
    for term in terms:
        term_courses = schedule[term]
        if isinstance(term_courses, dict):
            # Find FILLER courses to replace
            filler_keys = [k for k, v in term_courses.items() if k == FILLER_COURSE]
            for filler in filler_keys:
                # Try to find an unplaced requirement
                for req_name in resolve_counts.keys():
                    if placed_counts[req_name] < resolve_counts[req_name]:
                        placed_count = placed_counts[req_name] + 1
                        term_courses[f"{req_name} #{placed_count}"] = {'lecture': None, 'discussion': None}
                        term_courses.pop(filler)
                        placed_counts[req_name] = placed_count
                        break
        elif isinstance(term_courses, list):
            # Replace FILLER courses in list
            while FILLER_COURSE in term_courses:
                idx = term_courses.index(FILLER_COURSE)
                replaced = False
                for req_name in resolve_counts.keys():
                    if placed_counts[req_name] < resolve_counts[req_name]:
                        placed_count = placed_counts[req_name] + 1
                        term_courses[idx] = f"{req_name} #{placed_count}"
                        placed_counts[req_name] = placed_count
                        replaced = True
                        break
                if not replaced:
                    break

    # Then, try to place remaining requirements, preferring later terms
    # Sort terms in reverse order (latest first)
    remaining_terms = sorted(terms, reverse=True)
    
    for term in remaining_terms:
        term_courses = schedule[term]
        if isinstance(term_courses, dict):
            current_count = len(term_courses)
            # Try to place requirements while respecting their counts
            for req_name in resolve_counts.keys():
                while (current_count < MAX_COURSES_PER_TERM and 
                       placed_counts[req_name] < resolve_counts[req_name]):
                    placed_count = placed_counts[req_name] + 1
                    term_courses[f"{req_name} #{placed_count}"] = {'lecture': None, 'discussion': None}
                    placed_counts[req_name] = placed_count
                    current_count += 1
        elif isinstance(term_courses, list):
            current_count = len(term_courses)
            # Try to place requirements while respecting their counts
            for req_name in resolve_counts.keys():
                while (current_count < MAX_COURSES_PER_TERM and 
                       placed_counts[req_name] < resolve_counts[req_name]):
                    placed_count = placed_counts[req_name] + 1
                    term_courses.append(f"{req_name} #{placed_count}")
                    placed_counts[req_name] = placed_count
                    current_count += 1

    # If we still have unplaced requirements, try one more pass from the beginning
    # but only for terms that have space and aren't just filled with electives
    if any(placed_counts[req] < resolve_counts[req] for req in resolve_counts):
        for term in terms:
            term_courses = schedule[term]
            if isinstance(term_courses, dict):
                # Count non-elective courses in this term
                non_elective_count = sum(1 for c in term_courses if not any(c.startswith(req) for req in resolve_counts))
                if non_elective_count > 0:  # Only add to terms that have some real courses
                    current_count = len(term_courses)
                    for req_name in resolve_counts.keys():
                        while (current_count < MAX_COURSES_PER_TERM and 
                               placed_counts[req_name] < resolve_counts[req_name]):
                            placed_count = placed_counts[req_name] + 1
                            term_courses[f"{req_name} #{placed_count}"] = {'lecture': None, 'discussion': None}
                            placed_counts[req_name] = placed_count
                            current_count += 1
            elif isinstance(term_courses, list):
                non_elective_count = sum(1 for c in term_courses if not any(c.startswith(req) for req in resolve_counts))
                if non_elective_count > 0:
                    current_count = len(term_courses)
                    for req_name in resolve_counts.keys():
                        while (current_count < MAX_COURSES_PER_TERM and 
                               placed_counts[req_name] < resolve_counts[req_name]):
                            placed_count = placed_counts[req_name] + 1
                            term_courses.append(f"{req_name} #{placed_count}")
                            placed_counts[req_name] = placed_count
                            current_count += 1

    # Update note if we couldn't schedule all RESOLVE requirements
    unplaced_reqs = []
    for req_name, count in resolve_counts.items():
        remaining = count - placed_counts[req_name]
        if remaining > 0:
            # Add the numbered versions to unplaced_reqs
            start_num = placed_counts[req_name] + 1
            for i in range(remaining):
                unplaced_reqs.append(f"{req_name} #{start_num + i}")

    if unplaced_reqs:
        if note:
            note += "; Also unable to schedule: " + ", ".join(sorted(unplaced_reqs))
        else:
            note = "Unable to schedule: " + ", ".join(sorted(unplaced_reqs))

    # Visibility fallback: keep unscheduled GE and unresolved electives visible
    # in the final term so users can still see outstanding requirements.
    if terms:
        final_term = terms[-1]
        term_courses = schedule.get(final_term)

        def append_if_missing(item: str):
            if isinstance(term_courses, dict):
                if item not in term_courses:
                    term_courses[item] = {'lecture': None, 'discussion': None}
            elif isinstance(term_courses, list):
                if item not in term_courses:
                    term_courses.append(item)

        for ge_course in ge_unscheduled:
            append_if_missing(ge_course)

        for elective_req in unplaced_reqs:
            append_if_missing(elective_req)

    return schedule, note

# ─────  Utility: format_schedule()  ─────

def format_schedule(schedule: Dict[str, object]) -> Dict[str, object]:
    global GE_DISPLAY_BY_COURSE

    def is_hidden_requirement_placeholder(course_key: str) -> bool:
        if not isinstance(course_key, str):
            return False

        normalized = course_key.strip()
        return bool(
            re.search(r'(?:^| )Elective #\d+$', normalized) or
            re.search(r'(?:^| )Technical Breadth #\d+$', normalized)
        )

    def display_course(course_key: str) -> str:
        return GE_DISPLAY_BY_COURSE.get(course_key, course_key)

    out = {}
    for term, ent in schedule.items():
        if isinstance(ent, dict):
            term_d = {}

            def clean(sec: Optional[Dict]) -> Optional[Dict]:
                if not sec:
                    return None
                slots = {}
                for t in sec.get('times', []):
                    key = (t['start_time'], t['end_time'], t['building'], t['room'])
                    slots.setdefault(key, set()).add(t['days_of_week'])
                times = []
                for (st, en, bld, rm), days in slots.items():
                    days_s = ''.join(sorted(days))
                    times.append({
                        'days': days_s,
                        'start': st.strftime('%H:%M') if hasattr(st, 'strftime') else str(st),
                        'end': en.strftime('%H:%M') if hasattr(en, 'strftime') else str(en),
                        'building': bld,
                        'room': rm
                    })
                return {
                    'id': sec.get('id'),
                    'section': sec.get('section_code'),
                    'activity': sec.get('activity'),
                    'enrollment_cap': sec.get('enrollment_cap'),
                    'enrollment_total': sec.get('enrollment_total'),
                    'waitlist_cap': sec.get('waitlist_cap'),
                    'waitlist_total': sec.get('waitlist_total'),
                    'times': times,
                    'instructors': sec.get('instructors', [])
                }

            for course, info in ent.items():
                if is_hidden_requirement_placeholder(course):
                    continue
                term_d[display_course(course)] = {
                    'lecture': clean(info.get('lecture')),
                    'discussion': clean(info.get('discussion'))
                }
            out[term] = term_d
        else:
            out[term] = [
                display_course(course)
                for course in ent
                if not is_hidden_requirement_placeholder(course)
            ]
    return out

# ─────  CLI entrypoint ─────
if __name__ == "__main__":
    inp = json.load(sys.stdin)

    # override defaults ------------------------------------------------------
    COURSES_TO_SCHEDULE = inp.get('courses_to_schedule', COURSES_TO_SCHEDULE)
    TRANSCRIPT = inp.get('transcript', {})
    prefs = inp.get('preferences', {})
    include_debug_unscheduled = bool(prefs.get('debug_unscheduled', False))
    ALLOW_WARNINGS = prefs.get('allow_warnings', ALLOW_WARNINGS)
    ALLOW_PRIMARY_CONFLICTS = prefs.get('allow_primary_conflicts', ALLOW_PRIMARY_CONFLICTS)
    ALLOW_SECONDARY_CONFLICTS = prefs.get('allow_secondary_conflicts', ALLOW_SECONDARY_CONFLICTS)
    PREF_PRIORITY = prefs.get('pref_priority', PREF_PRIORITY)
    pe = prefs.get('pref_earliest', PREF_EARLIEST.strftime('%H:%M'))
    PREF_EARLIEST = datetime.strptime(pe, '%H:%M').time()
    pl = prefs.get('pref_latest', PREF_LATEST.strftime('%H:%M'))
    PREF_LATEST = datetime.strptime(pl, '%H:%M').time()
    PREF_NO_DAYS = set(prefs.get('pref_no_days', list(PREF_NO_DAYS)))
    PREF_BUILDINGS = set(prefs.get('pref_buildings', list(PREF_BUILDINGS)))
    PREF_INSTRUCTORS = set(prefs.get('pref_instructors', list(PREF_INSTRUCTORS)))
    ge_interests = prefs.get('ge_interests', []) or []
    MAX_COURSES_PER_TERM = prefs.get('max_courses_per_term', MAX_COURSES_PER_TERM)
    LEAST_COURSES_PER_TERM = prefs.get('least_courses_per_term', LEAST_COURSES_PER_TERM)

    # run scheduler ----------------------------------------------------------
    sched, note = build_schedule(
        inp['start_year'], inp['start_quarter'],
        inp['end_year'], inp['end_quarter'],
        ALLOW_WARNINGS,
        inp.get('school'),
        ge_interests,
    )
    result = {'schedule': format_schedule(sched)}
    if note:
        result['note'] = note
    if include_debug_unscheduled:
        result['debug_unscheduled'] = LAST_UNSCHEDULED_DEBUG
    print(json.dumps(result, default=str, indent=2))
