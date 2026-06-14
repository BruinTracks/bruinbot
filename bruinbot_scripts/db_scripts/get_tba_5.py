import time
import ast
from openai import OpenAI

client = OpenAI(api_key="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")
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup

# ---------- CONFIG ---------- #
url = "https://www.seasoasa.ucla.edu/undergraduate-technical-breadth-area-tba/"
# ---------------------------- #

def scroll_column_to_bottom(driver, column):
    prev_height = 0
    while True:
        curr_height = driver.execute_script("return arguments[0].scrollHeight", column)
        driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", column)
        time.sleep(0.8)
        if curr_height == prev_height:
            break
        prev_height = curr_height

def scroll_and_expand_toggles(driver, column_class):
    column = driver.find_element(By.CLASS_NAME, column_class)
    driver.execute_script("arguments[0].scrollIntoView(true);", column)
    time.sleep(1)
    scroll_column_to_bottom(driver, column)
    toggles = column.find_elements(By.CLASS_NAME, "et_pb_toggle")
    for toggle in toggles:
        try:
            driver.execute_script("arguments[0].scrollIntoView(true);", toggle)
            ActionChains(driver).move_to_element(toggle).click().perform()
            time.sleep(0.2)
        except Exception as e:
            print(f"Could not click toggle: {e}")

def scrape_ucla_tech_breadths():
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    driver = webdriver.Chrome(options=chrome_options)
    driver.get(url)

    wait = WebDriverWait(driver, 10)
    wait.until(EC.presence_of_element_located((By.CLASS_NAME, "et_pb_section_3")))
    time.sleep(2)

    for col_class in ["et_pb_column_3", "et_pb_column_4"]:
        scroll_and_expand_toggles(driver, col_class)

    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()

    section = soup.find("div", class_="et_pb_section_3")
    tech_breadths = section.find_all("div", class_="et_pb_toggle")

    result = {}
    for tb in tech_breadths:
        title_el = tb.find("h2", class_="et_pb_toggle_title")
        content_el = tb.find("div", class_="et_pb_toggle_content")
        if title_el and content_el:
            title = title_el.get_text(strip=True)
            description = content_el.get_text(separator="\n", strip=True)
            result[title] = description

    return result

def extract_courses_from_description(title: str, description: str):
    formatted = f"{title}\n{'*' * len(title)}\n{description}"
    prompt = f"""You will be given a technical breadth description from UCLA. Your task is to extract and return all the courses that satisfy the technical breadth.

Each course should be formatted as:
"DEPARTMENT|COURSE_NUMBER"

Examples:
- "COM SCI 33" → "COM SCI|33"
- "CHEM 153A" → "CHEM|153A"

If a description includes a range, such as “COM SCI 102 through 187”, expand the range numerically and list each course in the format above. You do NOT need to check if the course actually exists.

The output must be a valid Python list of strings.

---

### Example 1

Premed
********
Designed for engineering undergraduates who are also truly pre-med or pre-health and planning to pursue graduate studies in the medical or health fields.
Required Courses (12 units):
select from
CHEM 30BL, CHEM 30C, CHEM 153A, CHEM 153L, LIFE SCI 7B, LIFESCI 7C , BIOSTATS 100A or STATS 100A.
Please read the SUBSET RESTRICTIONS before selecting an area and enrolling in courses.

**Expected Output:**
["CHEM|30BL", "CHEM|30C", "CHEM|153A", "CHEM|153L", "LIFE SCI|7B", "LIFESCI|7C", "BIOSTATS|100A", "STATS|100A"]

---

### Example 2

Computer Science
****************
Designed to provide students with the opportunity to gain working knowledge of a technical field other than his/her major.
Required Courses (12 units): select from
COM SCI 31, COM SCI 32, COM SCI 33, COM SCI 35L, MATH 61, COM SCI 102 through 187.
Please read the SUBSET RESTRICTIONS before selecting an area and enrolling in courses.

**Expected Output:**
["COM SCI|31", "COM SCI|32", "COM SCI|33", "COM SCI|35L", "MATH|61", "COM SCI|102", "COM SCI|103", ..., "COM SCI|187"]

---

Do NOT include anything extra before and after. You must output the list and ONLY the list itself, no extra words, explanation, or formatting other than what I specified. For example, do not try to format the text as code. Just give the raw list itself as a string and THAT'S IT.

Now, extract and list the courses for the following tech breadth description:

{formatted}
"""

    try:
        response = client.chat.completions.create(model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an assistant that extracts structured course information from unstructured catalog descriptions."},
            {"role": "user", "content": prompt}
        ],
        temperature=0)
        raw_output = response.choices[0].message.content.strip()
        return ast.literal_eval(raw_output)
    except Exception as e:
        print(f"Error parsing courses for '{title}': {e}")
        print(f"Raw response:\n{raw_output}")
        return []

# ---------- SUPABASE VALIDATION + UPLOAD ---------- #

from supabase import create_client, Client

SUPABASE_URL = "https://mduxhtejjkchefnecjdf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kdXhodGVqamtjaGVmbmVjamRmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDU0ODU4NSwiZXhwIjoyMDU2MTI0NTg1fQ.E7MdjVp-bYYXiyVJ4BX2gcH3Y4sW6EN7Lhx1Hd7LbTk"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

if __name__ == "__main__":
    print("Scraping UCLA tech breadths...")
    data = scrape_ucla_tech_breadths()
    print(f"Found {len(data)} tech breadths.\n")

    all_courses = {}
    for i, (title, desc) in enumerate(data.items(), 1):
        print(f"[{i}/{len(data)}] Processing: {title}")
        courses = extract_courses_from_description(title, desc)
        all_courses[title] = courses
        print(f"→ {courses}\n")

    print("\nValidating scraped courses using Supabase function...\n")

    final_results = {}

    for title, course_list in all_courses.items():
        print(f"\n=== {title} ===")
        validated = []

        for course in course_list:
            try:
                response = supabase.rpc("validate_course", {"scraped": course}).execute()
                match = response.data
                if match:
                    print(f"✔ MATCHED: {course} → {match}")
                    validated.append(match)
                else:
                    print(f"✘ NO MATCH: {course}")
            except Exception as e:
                print(f"⚠️ ERROR: {course} → {e}")

        final_results[title] = validated

    print("\n📤 Uploading validated tech breadth courses to Supabase...\n")

    for title, validated_courses in final_results.items():
        for full_code in validated_courses:
            try:
                dept, catalog = full_code.split("|")
                subject_resp = supabase.table("subjects").select("id").eq("code", dept).limit(1).execute()
                subject_id = subject_resp.data[0]["id"]
                response = (
                    supabase.table("courses")
                    .select("id", "catalog_number", "subjects(code)")
                    .eq("catalog_number", catalog)
                    .eq("subject_id", subject_id)
                    .limit(1)
                    .execute()
                )

                if not response.data:
                    print(f"⚠️ Could not find course ID for {full_code}")
                    continue

                course_id = response.data[0]["id"]

                insert_response = supabase.table("tech_breadth_courses").insert({
                    "course_id": course_id,
                    "tba_title": title
                }).execute()

                print(f"✅ Uploaded: {full_code} (response: {response}) → {title}")

            except Exception as e:
                print(f"❌ Failed to upload {full_code} → {title}: {e}")

