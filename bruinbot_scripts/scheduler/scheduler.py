import os
import re
import time
import json
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from itertools import combinations
from dotenv import load_dotenv
from supabase import create_client

# ───── CONFIGURATION ─────
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

# Core courses the student must complete
COURSES_TO_SCHEDULE = [
    "COM SCI|1", "COM SCI|31", "COM SCI|32", "COM SCI|33",
    "COM SCI|35L", "MATH|31A", "MATH|31B", "MATH|32A",
    "MATH|32B", "MATH|33A", "MATH|33B", "MATH|61",
    "PHYSICS|1A", "PHYSICS|1B", "PHYSICS|1C", "COM SCI|M51A",
    "PHYSICS|4AL", "COM SCI|111", "COM SCI|118", "COM SCI|131",
    "COM SCI|180", "COM SCI|181", "COM SCI|M151B", "COM SCI|M152A",
    "C&EE|110", "COM SCI|130"
]

# Transcript: completed courses with optional grades
TRANSCRIPT: Dict[str, Optional[str]] = {}

# Scheduling parameters
MAX_COURSES_PER_TERM      = 5
LEAST_COURSES_PER_TERM    = 3
FILLER_COURSE             = "FILLER"
ALLOW_WARNINGS            = True
ALLOW_PRIMARY_CONFLICTS   = True
ALLOW_SECONDARY_CONFLICTS = True

# Preferences for first-term scoring
# Users can rank preferences by setting this list in order of importance
PREF_PRIORITY = [
    'time', 'building', 'days', 'instructor'
]
PREF_EARLIEST    = datetime.strptime("09:00", "%H:%M").time()
PREF_LATEST      = datetime.strptime("10:00", "%H:%M").time()
PREF_NO_DAYS     = {"F"}
PREF_BUILDINGS   = {"MS", "SCI"}
PREF_INSTRUCTORS = set()

# Grade ordering
GRADE_ORDER = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F"]

# ───── HELPERS ─────
def safe_execute(req, retries: int = 3, backoff: float = 0.2):
    for attempt in range(retries):
        try:
            return req.execute()
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(backoff)


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


def meets_min_grade(obtained: str, required: str) -> bool:
    try:
        return GRADE_ORDER.index(obtained) <= GRADE_ORDER.index(required)
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


def quarter_prefixes(
    prereq_logic: Dict[str, List[Tuple[str, str, str, str]]],
    k: int,
    allow_warnings: bool
) -> List[List[str]]:
    nodes = set(prereq_logic.keys())
    for reqs in prereq_logic.values():
        for c, *_ in reqs:
            nodes.add(c)
    passed = {c for c, g in TRANSCRIPT.items() if g is not None and meets_min_grade(g, 'D-')}
    nodes -= passed

    indegree = {n: 0 for n in nodes}
    for course, reqs in prereq_logic.items():
        if course not in indegree:
            continue
        for rc, typ, _, sev in reqs:
            if rc in indegree and typ in ('prerequisite', 'corequisite') and (sev == 'R' or (sev == 'W' and not allow_warnings)):
                indegree[course] += 1

    available = sorted(n for n, d in indegree.items() if d == 0)
    if len(available) < k:
        return [available]
    return [list(c) for c in combinations(available, k)]


def build_schedule(
    start_y: int,
    start_q: str,
    end_y: int,
    end_q: str,
    allow_warnings: bool
) -> Tuple[Dict[str, object], Optional[str]]:
    terms = create_term_sequence(start_q, start_y, end_q, end_y)

    supa = create_client(SUPABASE_URL, SUPABASE_KEY)
    term_rows = safe_execute(supa.table("terms").select("term_name,id")).data
    db_map = {r['term_name']: r['id'] for r in term_rows}
    idx2db = [db_map.get(t) for t in terms]

    subs = safe_execute(supa.table("subjects").select("id,code,name")).data
    sub2id = {s['code']: s['id'] for s in subs}
    id2sub = {s['id']: s['code'] for s in subs}
    name2sub = {re.sub(r"\s*\(.*\)$", "", s['name']).strip().upper(): s['code'] for s in subs}

    passed = {c for c, g in TRANSCRIPT.items() if g is not None and meets_min_grade(g, 'D-')}
    required = set(COURSES_TO_SCHEDULE) - passed
    transcript = TRANSCRIPT.copy()

    def fetch_courses(keys: List[str]):
        pairs = [k.split("|", 1) for k in keys]
        ids, nums = zip(*[(sub2id[d], n) for d, n in pairs])
        return safe_execute(
            supa.table("courses")
                .select("id,subject_id,catalog_number,course_requisites")
                .in_("subject_id", list(ids))
                .in_("catalog_number", list(nums))
        ).data

    prereq_logic: Dict[str, List[Tuple[str, str, str, str]]] = {}
    queue = list(required)
    while queue:
        c = queue.pop(0)
        rows = fetch_courses([c])
        raw = rows[0].get("course_requisites") if rows else {}
        clauses = to_dnf(raw or {})
        best_clause, best_missing, min_miss = [], [], float('inf')
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
                ukey = f"{code}|{num.upper()}"
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

    all_courses = fetch_courses(list(required))
    cid2key = {c['id']: f"{id2sub[c['subject_id']]}|{c['catalog_number']}" for c in all_courses}
    secs = safe_execute(
        supa.table("sections").select(
            "id,course_id,term_id,section_code,is_primary,activity,"
            "enrollment_cap,enrollment_total,waitlist_cap,waitlist_total"
        ).in_("course_id", [c['id'] for c in all_courses])
    ).data
    mt = safe_execute(
        supa.table("meeting_times").select("section_id,days_of_week,start_time,end_time,building,room")
            .in_("section_id", [s['id'] for s in secs])
    ).data
    si = safe_execute(
        supa.table("section_instructors").select("section_id,instructor_id")
            .in_("section_id", [s['id'] for s in secs])
    ).data

    mt_map: Dict[int, List[Dict]] = {}
    for m in mt:
        m['start_time'] = datetime.strptime(m['start_time'], "%H:%M:%S").time()
        m['end_time'] = datetime.strptime(m['end_time'], "%H:%M:%S").time()
        mt_map.setdefault(m['section_id'], []).append(m)
    instr_ids = {r['instructor_id'] for r in si}
    instr_rows = safe_execute(
        supa.table("instructors").select("id,name").in_("id", list(instr_ids))
    ).data
    instr_map = {r['id']: r['name'] for r in instr_rows}
    si_map: Dict[int, List[str]] = {}
    for r in si:
        si_map.setdefault(r['section_id'], []).append(instr_map[r['instructor_id']])

    sections_by_course: Dict[str, List[Dict]] = {}
    for s in secs:
        key = cid2key[s['course_id']]
        if s['enrollment_total'] >= s['enrollment_cap'] and s['waitlist_total'] >= s['waitlist_cap']:
            continue
        s['times'] = mt_map.get(s['id'], [])
        s['instructors'] = si_map.get(s['id'], [])
        sections_by_course.setdefault(key, []).append(s)

    adj = {c: [] for c in required}
    indegree = {c: 0 for c in required}
    for c in required:
        for rc, typ, _, sev in prereq_logic.get(c, []):
            if rc in indegree and typ in ('prerequisite','corequisite') and (sev == 'R' or (sev == 'W' and not allow_warnings)):
                adj[rc].append(c)
                indegree[c] += 1

    remaining = set(required)
    R_rem = len(remaining)
    T_left = len(create_term_sequence(start_q, start_y, end_q, end_y))
    schedule: Dict[str, object] = {}

    pe, pl = PREF_EARLIEST, PREF_LATEST
    pnd, pb, pi = PREF_NO_DAYS, PREF_BUILDINGS, PREF_INSTRUCTORS

    weight_map = {pref: len(PREF_PRIORITY) - i for i, pref in enumerate(PREF_PRIORITY)}

    def score_and_select(prefix: List[str]) -> Tuple[int, Dict[str, Dict]]:
        total = 0
        sel: Dict[str, Dict] = {}
        for course in prefix:
            # select lecture
            best_sec, best_sc = None, -1
            for sec in sections_by_course.get(course, []):
                if sec['term_id'] != idx2db[0] or not sec['is_primary']: continue
                sc = 0
                for m in sec['times']:
                    if PREF_EARLIEST <= m['start_time'] <= PREF_LATEST:
                        sc += weight_map['time']
                    if PREF_EARLIEST <= m['end_time'] <= PREF_LATEST:
                        sc += weight_map['time']
                    if m['building'] in PREF_BUILDINGS:
                        sc += weight_map['building']
                    if set(m['days_of_week']).isdisjoint(PREF_NO_DAYS):
                        sc += weight_map['days']
                if any(instr in PREF_INSTRUCTORS for instr in sec['instructors']):
                    sc += weight_map['instructor']
                if sc > best_sc:
                    best_sc, best_sec = sc, sec
            # select discussion similarly using weight_map
            best_disc, best_dsc = None, -1
            if best_sec:
                lec_code = best_sec['section_code'].split('-')[0]
                for dsec in sections_by_course.get(course, []):
                    if dsec['term_id'] != idx2db[0] or dsec['is_primary']: continue
                    if not dsec['section_code'].startswith(lec_code): continue
                    dsc = 0
                    for m in dsec['times']:
                        if PREF_EARLIEST <= m['start_time'] <= PREF_LATEST:
                            dsc += weight_map['time']
                        if PREF_EARLIEST <= m['end_time'] <= PREF_LATEST:
                            dsc += weight_map['time']
                        if m['building'] in PREF_BUILDINGS:
                            dsc += weight_map['building']
                        if set(m['days_of_week']).isdisjoint(PREF_NO_DAYS):
                            dsc += weight_map['days']
                    if any(instr in PREF_INSTRUCTORS for instr in dsec['instructors']):
                        dsc += weight_map['instructor']
                    if dsc > best_dsc:
                        best_dsc, best_disc = dsc, dsec
            sel[course] = {'lecture': best_sec, 'discussion': best_disc}
            total += max(0, best_sc) + max(0, best_dsc)
        return total, sel

    terms = create_term_sequence(start_q,start_y,end_q,end_y)
    for term in terms:
        avail = sorted(c for c in remaining if indegree[c] == 0)
        base = R_rem // T_left
        extra = R_rem % T_left
        target = max(LEAST_COURSES_PER_TERM, min(base + (1 if extra > 0 else 0), MAX_COURSES_PER_TERM))

        if term == terms[0]:
            prefixes = quarter_prefixes(prereq_logic, target, allow_warnings)
            scored = [(*score_and_select(p), p) for p in prefixes]
            valid = []
            for sc, sel, p in scored:
                conflict = False
                lec_list = [sel[c]['lecture'] for c in p if sel[c]['lecture']]
                if not ALLOW_PRIMARY_CONFLICTS:
                    for i in range(len(lec_list)):
                        for j in range(i+1,len(lec_list)):
                            for m1 in lec_list[i]['times']:
                                for m2 in lec_list[j]['times']:
                                    if meetings_overlap(m1,m2):
                                        conflict = True
                if not conflict and not ALLOW_SECONDARY_CONFLICTS:
                    dis_list = [sel[c]['discussion'] for c in p if sel[c]['discussion']]
                    for i in range(len(dis_list)):
                        for j in range(i+1,len(dis_list)):
                            for m1 in dis_list[i]['times']:
                                for m2 in dis_list[j]['times']:
                                    if meetings_overlap(m1,m2):
                                        conflict = True
                    if not conflict:
                        for lec in lec_list:
                            for d in dis_list:
                                for m1 in lec['times']:
                                    for m2 in d['times']:
                                        if meetings_overlap(m1,m2):
                                            conflict = True
                if not conflict:
                    valid.append((sc, sel, p))
            candidates = valid if valid else scored
            best_score, best_sel, best_prefix = max(candidates, key=lambda x: x[0])
            schedule[term] = best_sel
            take = best_prefix
        else:
            take = avail[:target]
            schedule[term] = take

        for c in take:
            for succ in adj.get(c, []):
                indegree[succ] -= 1
            remaining.discard(c)
        R_rem = len(remaining)
        T_left -= 1

    # pad and trim
    for term in terms:
        ent = schedule[term]
        if isinstance(ent, list):
            while len(ent) < LEAST_COURSES_PER_TERM:
                ent.append(FILLER_COURSE)
        else:
            keys = list(ent.keys())
            while len(keys) < LEAST_COURSES_PER_TERM:
                keys.append(FILLER_COURSE)
                ent[FILLER_COURSE] = {'lecture': None, 'discussion': None}
            for extra in keys[MAX_COURSES_PER_TERM:]:
                ent.pop(extra, None)
            schedule[term] = {k: ent[k] for k in keys[:MAX_COURSES_PER_TERM]}

    scheduled_all = set()
    for term, ent in schedule.items():
        if isinstance(ent, dict):
            scheduled_all |= set(ent.keys())
        else:
            scheduled_all |= set(ent)
    unscheduled = set(COURSES_TO_SCHEDULE) - scheduled_all
    note = None
    if unscheduled:
        note = "Unable to schedule: " + ", ".join(sorted(unscheduled))

    return schedule, note


def format_schedule(schedule: Dict[str, object]) -> Dict[str, object]:
    out: Dict[str, object] = {}
    for term, ent in schedule.items():
        if isinstance(ent, dict):
            term_dict: Dict[str, object] = {}
            for course, info in ent.items():
                def clean(sec: Optional[Dict]) -> Optional[Dict]:
                    if not sec:
                        return None
                    slots: Dict[Tuple, set] = {}
                    for t in sec.get('times', []):
                        key = (t['start_time'], t['end_time'], t['building'], t['room'])
                        days = t['days_of_week']
                        slots.setdefault(key, set()).add(days)
                    times_list = []
                    for (st, en, bld, rm), days in slots.items():
                        days_s = ''.join(sorted(days))
                        times_list.append({
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
                        'times': times_list,
                        'instructors': sec.get('instructors', [])
                    }
                term_dict[course] = {
                    'lecture': clean(info.get('lecture')),
                    'discussion': clean(info.get('discussion'))
                }
            out[term] = term_dict
        else:
            out[term] = ent
    return out

if __name__ == "__main__":
    sched, note = build_schedule(
        start_y=2024, start_q="Fall",
        end_y=2026, end_q="Spring",
        allow_warnings=ALLOW_WARNINGS
    )
    result = {'schedule': format_schedule(sched)}
    if note:
        result['note'] = note
    print(json.dumps(result, default=str, indent=2))
