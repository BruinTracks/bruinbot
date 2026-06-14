import re
import pandas as pd
import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_ANON_KEY')  # or service role key for write access
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Parsing helpers
def parse_block(text_block: str) -> dict:
    """
    Convert a pipe-delimited block of prereq/coreq rows into a JSON-object
    with nested 'and'/'or' logic and per-leaf 'relation' enums.
    """
    rows = []
    for line in text_block.strip().splitlines():
        parts = [p.strip() for p in line.split('|')]
        if len(parts) != 5 or parts[0].lower().startswith('classname'):
            continue
        classname, mg, prereq_f, coreq_f, sev = parts
        rows.append({
            'classname':    classname,
            'minimumgrade': mg,
            'prerequisite': prereq_f,
            'corequisite':  coreq_f,
            'rqs_sev':      sev
        })
    return _build_logic(rows)


def _build_logic(rows: list) -> dict:
    """
    Internal: build grouped 'and'/'or' logic from parsed rows.
    """
    groups = []
    current = []
    for r in rows:
        text = r['classname'].strip()
        m = re.search(r"(and|or)$", text, re.IGNORECASE)
        connector = m.group(1).lower() if m else None
        # strip parentheses and connector
        name = text.strip('() ').rstrip(connector or '').strip()
        leaf = {
            'course':    name,
            'min_grade': r['minimumgrade'],
            'severity':  r['rqs_sev'],
            'relation':  'corequisite' if r['corequisite'].lower() == 'yes' else 'prerequisite'
        }
        current.append(leaf)
        # close group when not 'and'
        if connector != 'and':
            groups.append(current)
            current = []
    # any leftover
    if current:
        groups.append(current)
    # top-level logic
    if len(groups) == 1:
        return {'and': groups[0]}
    return {'or': [{'and': g} for g in groups]}


def main():
    # Read CSV of new requisites
    csv_path = "new_scripts/csv_data/ucla_courses2.csv"
    df = pd.read_csv(csv_path, usecols=["crs_long_ttl", "disp_catlg_no", "requisites"]),
    df = df[0]  # workaround for tuple

    for _, row in df.iterrows():
        title = row['crs_long_ttl']
        catalog = row['disp_catlg_no']
        raw_reqs = row['requisites']
        if not isinstance(raw_reqs, str) or not raw_reqs.strip():
            print(f"Empty requisites for {title} {catalog}")
            continue

        # fetch matching course id
        resp = (
            supabase
            .table('courses')
            .select('id')
            .eq('title', title)
            .eq('catalog_number', catalog)
            .limit(1)
            .execute()
        )
        data = resp.data
        if not data:
            print(f"No course found for {title} {catalog}")
            continue
        course_id = data[0]['id']

        # parse into JSON-compatible dict
        parsed = parse_block(raw_reqs)

        # update JSONB column with dict (supabase-py serializes automatically)
        up = (
            supabase
            .table('courses')
            .update({'course_requisites': parsed})
            .eq('id', course_id)
            .execute()
        )
        status = getattr(up, 'code', None)
        message = getattr(up, 'message', None)
        if status or message:
            print(f"Failed to update {course_id} ({title} {catalog}): HTTP status {status} {message}")
        else:
            print(f"Updated course {course_id} ({title} {catalog}) with requisites.")



if __name__ == "__main__":
    main()
