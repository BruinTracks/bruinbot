import csv
from supabase import create_client, Client
from datetime import datetime
from dotenv import load_dotenv
import os
import time
from httpx import RemoteProtocolError, ReadTimeout

# ------- CONFIG -------
BATCH_SIZE = 100
CSV_PATH   = 'new_scripts/ucla_courses2.csv'

# ------- SETUP -------
load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_ANON_KEY")
supabase: Client = create_client(url, key)

# Helper to retry on transient HTTP2 hiccups
def safe_execute(req, retries=3, backoff=0.2):
    for i in range(retries):
        try:
            return req.execute()
        except (RemoteProtocolError, ReadTimeout):
            if i == retries - 1:
                raise
            time.sleep(backoff)

# ------- PRELOAD EXISTING ROWS INTO CACHES -------
# 1️⃣ Terms: term_code → id
term_ids = {}
res = safe_execute(supabase.table("terms").select("term_code,id"))
for row in res.data:
    term_ids[row["term_code"]] = row["id"]

# 2️⃣ Subjects: code → id
subject_ids = {}
res = safe_execute(supabase.table("subjects").select("code,id"))
for row in res.data:
    subject_ids[row["code"]] = row["id"]

# 3️⃣ Instructors: name → id
instructor_ids = {}
res = safe_execute(supabase.table("instructors").select("name,id"))
for row in res.data:
    instructor_ids[row["name"]] = row["id"]

# 4️⃣ Courses: (subject_id,catalog_number) → id
#    need to invert subject_ids to map subject_id → code
subj_id_to_code = {v: k for k, v in subject_ids.items()}
course_ids = {}
res = safe_execute(supabase.table("courses").select("subject_id,catalog_number,id"))
for row in res.data:
    subj_code = subj_id_to_code[row["subject_id"]]
    num       = row["catalog_number"].strip().upper()
    key       = f"{subj_code}|{num}"
    course_ids[key] = row["id"]

# 5️⃣ Sections: (term_id,course_id,section_code) → id
section_ids = {}
res = safe_execute(
    supabase.table("sections").select("term_id,course_id,section_code,id")
)
for row in res.data:
    key = (row["term_id"], row["course_id"], row["section_code"])
    section_ids[key] = row["id"]

# ------- PASS 1: TERMS, SUBJECTS, COURSES, SECTIONS -------
section_batch = []
pending_section_keys = set()

def flush_section_batch():
    global section_batch, pending_section_keys
    if not section_batch:
        return

    res = safe_execute(
    supabase
      .table("sections")
      .upsert(
        section_batch,
        on_conflict="term_id,course_id,section_code",
        returning="representation"
      )
)
    for rec in res.data:
        key = (rec["term_id"], rec["course_id"], rec["section_code"])
        section_ids[key] = rec["id"]

    section_batch = []
    pending_section_keys.clear()

with open(CSV_PATH, newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        # 1️⃣ Term
        tc = row["term_cd"].strip()
        tn = row["term_name"].strip()
        if tc not in term_ids:
            out = safe_execute(
                supabase
                  .table("terms")
                  .upsert({"term_code": tc, "term_name": tn},
                          on_conflict="term_code",
                          returning="representation")
            )
            term_ids[tc] = out.data[0]["id"]
        term_id = term_ids[tc]

        # 2️⃣ Subject
        sc = row["subj_area_cd"].strip()
        sn = row["subj_area_name"].strip()
        if sc not in subject_ids:
            out = safe_execute(
                supabase
                  .table("subjects")
                  .upsert({"code": sc, "name": sn},
                          on_conflict="code",
                          returning="representation")
            )
            subject_ids[sc] = out.data[0]["id"]
        subj_id = subject_ids[sc]

        # 3️⃣ Course
        cn = row["disp_catlg_no"].strip().upper()
        title = row["crs_long_ttl"].strip()
        short = row.get("crs_short_ttl","",
                         ).strip()
        course_key = f"{sc}|{cn}"
        if course_key not in course_ids:
            out = safe_execute(
                supabase
                  .table("courses")
                  .upsert(
                     {
                       "subject_id": subj_id,
                       "catalog_number": cn,
                       "title": title,
                       "short_title": short
                     },
                     on_conflict="subject_id,catalog_number",
                     returning="representation"
                  )
            )
            course_ids[course_key] = out.data[0]["id"]
        course_id = course_ids[course_key]

        # 4️⃣ Section (batch)
        class_no  = row["class_no"].strip()
        sect_code = row["sect_no"].strip()
        is_pri    = (row["class_prim_act_fl"] == "Y")
        activity  = row["cls_act_typ_txt"].strip()
        ecap      = int(row["enrl_cap_num"])   if row["enrl_cap_num"]   else None
        etot      = int(row["enrl_tot"])       if row["enrl_tot"]       else None
        wcap      = int(row["waitlist_cap_num"]) if row["waitlist_cap_num"] else None
        wtot      = int(row["waitlist_tot"])     if row["waitlist_tot"]     else None

        skey = (term_id, course_id, sect_code)
        if skey not in section_ids and skey not in pending_section_keys:
            section_batch.append({
                "term_id":       term_id,
                "course_id":     course_id,
                "class_number":  class_no,
                "section_code":  sect_code,
                "is_primary":    is_pri,
                "activity":      activity,
                "enrollment_cap":   ecap,
                "enrollment_total": etot,
                "waitlist_cap":     wcap,
                "waitlist_total":   wtot
            })
            pending_section_keys.add(skey)

        if len(section_batch) >= BATCH_SIZE:
            flush_section_batch()

    flush_section_batch()

# ------- PASS 2: MEETING TIMES & INSTRUCTORS -------
with open(CSV_PATH, newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        tc = row["term_cd"].strip()
        key_course = f"{row['subj_area_cd'].strip()}|{row['disp_catlg_no'].strip().upper()}"
        skey = (term_ids[tc], course_ids[key_course], row["sect_no"].strip())
        section_id = section_ids[skey]

        # Meeting times
        days = row["days_of_wk_cd"].strip()
        st, et = row["meet_strt_tm"].strip(), row["meet_stop_tm"].strip()
        if st:
            st24 = datetime.strptime(st, "%I:%M %p").strftime("%H:%M:%S")
            et24 = datetime.strptime(et, "%I:%M %p").strftime("%H:%M:%S")
            safe_execute(
                supabase.table("meeting_times").insert({
                    "section_id": section_id,
                    "days_of_week": days,
                    "start_time": st24,
                    "end_time": et24,
                    "building": row.get("meet_bldg_cd",""),
                    "room": row.get("meet_room_cd","")
                })
            )

        # Instructors
        instructors = row.get("instructors","")
        for name in [n.strip() for n in instructors.split(';') if n.strip()]:
            if name not in instructor_ids:
                out = safe_execute(
                    supabase
                      .table("instructors")
                      .upsert({"name": name}, on_conflict="name", returning="representation")
                )
                instructor_ids[name] = out.data[0]["id"]
            safe_execute(
                supabase
                  .table("section_instructors")
                  .upsert(
                      {"section_id": section_id, "instructor_id": instructor_ids[name]},
                      on_conflict="section_id,instructor_id"
                  )
            )
