import sys
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.common.exceptions import NoSuchElementException, ElementClickInterceptedException
from bs4 import BeautifulSoup
from supabase import create_client, Client

# === Supabase Setup ===

SUPABASE_URL = "https://mduxhtejjkchefnecjdf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kdXhodGVqamtjaGVmbmVjamRmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDU0ODU4NSwiZXhwIjoyMDU2MTI0NTg1fQ.E7MdjVp-bYYXiyVJ4BX2gcH3Y4sW6EN7Lhx1Hd7LbTk"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

MAJOR_NAME_ALIASES = {
    "NursingBS": "NursingBSPrelicensure",
}


def normalize_major_name(major_name: str) -> str:
    return MAJOR_NAME_ALIASES.get(major_name, major_name)

# === Chrome Setup ===
options = Options()
options.add_argument('--headless')
options.add_argument('--disable-gpu')
driver = webdriver.Chrome(options=options)

schools = {
    "schools_arts_and_architecture": 1,
    "schools_college": 2,
    "schools_education_and_information_studies": 3,
    "schools_engineering": 4,
    "schools_music": 5,
    "schools_nursing": 6,
    "schools_public_affairs": 7,
    "schools_theater,_film_and_television": 8
}

if len(sys.argv) < 2 or sys.argv[1] not in schools:
    print("Bad argument")
    sys.exit(1)

school_permalink = sys.argv[1]
school_id = schools[school_permalink]
majors = []

try:
    driver.get("https://www.ucla.edu/academics/programs-and-majors")
    time.sleep(3)

    # Apply filters
    degree_major = driver.find_element(By.CSS_SELECTOR, "input#degrees_major")
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", degree_major)
    degree_major.click()

    escaped_id = school_permalink.replace(",", "\\,")
    school_checkbox = driver.find_element(By.CSS_SELECTOR, f"input#{escaped_id}")
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", school_checkbox)
    school_checkbox.click()
    time.sleep(2)

    # Click "Load More" until it's gone
    while True:
        try:
            load_more_btn = driver.find_element(By.CSS_SELECTOR, 'a.load.more')
            if load_more_btn.is_displayed():
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", load_more_btn)
                load_more_btn.click()
                time.sleep(2)
            else:
                break
        except (NoSuchElementException, ElementClickInterceptedException):
            break

    # Parse majors
    soup = BeautifulSoup(driver.page_source, "html.parser")
    for item in soup.select("li.row.show"):
        major_span = item.select_one("span.major-title")
        if not major_span:
            continue
        full_name = major_span.get_text(strip=True)
        major_name_base = full_name.replace(' ', '').replace('/', '').replace(',', '')

        # Look for BA and BS links inside the same <li>
        degree_links = item.select("div.degree a")
        for degree_link in degree_links:
            degree_type = degree_link.get_text(strip=True)
            if degree_type in ["BA", "BS"]:
                major_name = normalize_major_name(f"{major_name_base}{degree_type}")
                majors.append({"major_name": major_name, "full_name": full_name, "school": school_id})
                print(f"Found major: {major_name}")
                """
    soup = BeautifulSoup(driver.page_source, "html.parser")
    for item in soup.select("li.row.show"):
        major_span = item.select_one("span.major-title")
        if not major_span:
            continue
        full_name = major_span.get_text(strip=True)
        major_name = full_name.replace(' ', '').replace('/', '').replace(',', '')
        majors.append({"major_name": major_name, "full_name": full_name, "school": school_id})
        print(f"Found major: {major_name}")

"""
    # Insert into Supabase
    if majors:
        data, count = supabase.table("majors_2").insert(majors).execute()
        print(f"Inserted {len(majors)} majors for school ID {school_id}")

finally:
    driver.quit()

