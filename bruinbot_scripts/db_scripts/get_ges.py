from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
import time


from supabase import create_client, Client
from difflib import get_close_matches

# === Supabase setup ===
SUPABASE_URL = "https://mduxhtejjkchefnecjdf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kdXhodGVqamtjaGVmbmVjamRmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDU0ODU4NSwiZXhwIjoyMDU2MTI0NTg1fQ.E7MdjVp-bYYXiyVJ4BX2gcH3Y4sW6EN7Lhx1Hd7LbTk"


supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# === CONFIG ===
GE_URL = "https://sa.ucla.edu/ro/Public/SOC/Search/GECoursesMasterList"
FOUNDATION_TEXTS = [
    "Foundations of Arts and Humanities",
    "Foundations of Scientific Inquiry",
    "Foundations of Society and Culture"
]

# === MOCK subject lookup ===
#subject_id_map = {}
#def get_subject_id(subject_name):
#    if subject_name not in subject_id_map:
#        subject_id_map[subject_name] = len(subject_id_map) + 1
#    return subject_id_map[subject_name]

def get_subject_id(subject_name):
    # Cache subjects from Supabase
    if not hasattr(get_subject_id, "subject_cache"):
        print("🔄 Fetching subject names from Supabase...")
        response = supabase.table("subjects").select("id, name").execute()
        get_subject_id.subject_cache = response.data

    # Fuzzy match on subject names
    all_names = [row["name"] for row in get_subject_id.subject_cache]
    match = get_close_matches(subject_name, all_names, n=1, cutoff=0.5)
    if not match:
        raise ValueError(f"No fuzzy match found for subject: {subject_name}")

    matched_name = match[0]
    for row in get_subject_id.subject_cache:
        if row["name"] == matched_name:
            return row["id"]

    raise ValueError(f"Matched name '{matched_name}' not found in cache.")

# === Scroll helper ===
def scroll_to_bottom(driver):
    last_height = driver.execute_script("return document.body.scrollHeight")
    while True:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1.2)
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height

# === Parse from outer shadow DOM ===
def parse_and_print_courses(outer_shadow):
    wrapper = outer_shadow.find_element(By.CSS_SELECTOR, "#webComponentWrapper")
    html = wrapper.get_attribute("innerHTML")
    soup = BeautifulSoup(html, "html.parser")

    subjects = soup.find_all("span", class_="Head")
    for subject in subjects:
        subject_name = subject.get_text(strip=True)
        subject_id = get_subject_id(subject_name)

        table = subject.find_next("table")
        if not table:
            continue

        for row in table.find_all("tr"):
            cols = row.find_all("td")
            if len(cols) < 6:
                continue

            course_code = cols[0].get_text(strip=True)
            course_name = cols[1].get_text(strip=True)
            lab_demo = cols[2].get_text(strip=True).lower() == 'yes'
            writing_ii = cols[3].get_text(strip=True).lower() == 'yes'

            foundation_categories = cols[5].get_text(separator="|").split("|")
            for item in foundation_categories:
                if ':' not in item:
                    continue
                foundation, category = [s.strip() for s in item.split(":", 1)]

                course_data = {
                    "subject_name": subject_name,
                    "subject_id": subject_id,
                    "course_code": course_code,
                    "course_name": course_name,
                    "lab_demo": lab_demo,
                    "writing_ii": writing_ii,
                    "foundation": foundation,
                    "category": category
                }
                
                # === Insert course into Supabase ===
                supabase.table("general_education").insert(course_data).execute()

                print(course_data)

# === Main scraper ===
def scrape_ge_courses():
    options = Options()
    options.add_argument('--headless')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    driver = webdriver.Chrome(options=options)
    driver.set_window_size(1400, 1000)

    for foundation_text in FOUNDATION_TEXTS:
        driver.get(GE_URL)
        time.sleep(4)  # Let JS and Shadow DOMs load

        # Get outer shadow root
        outer_shadow = driver.find_element(By.CSS_SELECTOR, "ucla-sa-soc-app").shadow_root
        wrapper = outer_shadow.find_element(By.CSS_SELECTOR, "#webComponentWrapper")

        # Get <iwe-autocomplete> for foundation and its shadow root
        autocomplete = wrapper.find_element(By.CSS_SELECTOR, "iwe-autocomplete#select_soc_filter_geclasses_foundation")
        inner_shadow = autocomplete.shadow_root

        # Click input
        input_box = inner_shadow.find_element(By.CSS_SELECTOR, 'input[placeholder="Enter a Foundation (Required)"]')
        driver.execute_script("arguments[0].scrollIntoView(true);", input_box)
        input_box.click()
        time.sleep(1)

        # Select foundation option
        options_list = inner_shadow.find_elements(By.CSS_SELECTOR, 'div[role="option"]')
        match = [opt for opt in options_list if foundation_text in opt.text]
        if not match:
            raise Exception(f"❌ Could not find foundation option for: {foundation_text}")
        option = match[0]
        driver.execute_script("arguments[0].scrollIntoView(true);", option)
        option.click()
        time.sleep(1)

        # Click "Go" button
        go_button = wrapper.find_element(By.CSS_SELECTOR, "#btn_gecourses_go")
        driver.execute_script("arguments[0].scrollIntoView(true);", go_button)
        go_button.click()

        # Wait, scroll, and parse results
        time.sleep(6)
        scroll_to_bottom(driver)
        parse_and_print_courses(outer_shadow)

    driver.quit()

# === Run script ===
if __name__ == '__main__':
    scrape_ge_courses()

