import re
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

# === CONFIG ===
SUPABASE_URL = "https://mduxhtejjkchefnecjdf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kdXhodGVqamtjaGVmbmVjamRmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDU0ODU4NSwiZXhwIjoyMDU2MTI0NTg1fQ.E7MdjVp-bYYXiyVJ4BX2gcH3Y4sW6EN7Lhx1Hd7LbTk"
MAX_WORKERS = 10
RETRY_DELAY = 2  # seconds between retry attempts

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def subject_to_slug(code: str):
    return code.lower().replace("&", "-").replace(" ", "-")

def build_bruinwalk_url(subject_code: str, catalog_number: str):
    subject_slug = subject_to_slug(subject_code)
    catalog_clean = re.sub(r'\s+', '', catalog_number.lower())
    return f"https://www.bruinwalk.com/classes/{subject_slug}-{catalog_clean}/"

def fetch_all_courses():
    page_size = 1000
    offset = 0
    all_courses = []

    while True:
        resp = supabase.table("courses").select("id, catalog_number, subject_id, subjects ( code )")\
            .range(offset, offset + page_size - 1).execute()
        batch = resp.data
        if not batch:
            break
        all_courses.extend(batch)
        offset += page_size

    return all_courses

def scrape_and_insert(course, is_retry=False):
    course_id = course["id"]
    catalog_number = course["catalog_number"]
    subject_code = course["subjects"]["code"]
    url = build_bruinwalk_url(subject_code, catalog_number)

    try:
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        soup = BeautifulSoup(response.text, "html.parser")
        desc_div = soup.find("div", class_="description content-row")

        if not desc_div:
            return False, f"❌ {subject_code} {catalog_number}: no description"

        bold_tag = desc_div.find("strong")
        if bold_tag:
            bold_tag.decompose()

        description = desc_div.get_text(strip=True)

        supabase.table("course_descriptions").insert({
            "course_id": course_id,
            "description": description
        }).execute()

        prefix = "🔁 RETRIED" if is_retry else "✅"
        return True, f"{prefix} {subject_code} {catalog_number}: inserted"

    except Exception as e:
        return False, f"❌ {subject_code} {catalog_number}: {e}"

def run_scrape(courses, is_retry=False):
    failed = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(scrape_and_insert, course, is_retry): course for course in courses}
        for future in as_completed(futures):
            success, message = future.result()
            print(message)
            if not success:
                failed.append(futures[future])
    return failed

def main():
    all_courses = fetch_all_courses()
    print(f"Fetched {len(all_courses)} courses.")

    failed_courses = run_scrape(all_courses)

    if failed_courses:
        print(f"\n--- Retrying {len(failed_courses)} failed courses ---\n")
        time.sleep(RETRY_DELAY)
        final_failures = run_scrape(failed_courses, is_retry=True)

        if final_failures:
            print(f"\n⚠️ {len(final_failures)} courses failed after retry:")
            for course in final_failures:
                print(f" - {course['subjects']['code']} {course['catalog_number']}")
        else:
            print("\n✅ All courses succeeded after retry.")
    else:
        print("\n✅ All courses processed successfully.")

if __name__ == "__main__":
    main()

