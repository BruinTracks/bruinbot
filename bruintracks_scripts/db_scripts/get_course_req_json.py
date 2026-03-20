import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from bs4 import BeautifulSoup
from supabase import create_client, Client

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Prefer the server .env used by the running app. Keep existing shell env vars unchanged.
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

TARGET_TABLE = os.environ.get("MAJOR_REQUISITES_TABLE", "major_requisites")
CATALOG_YEAR = os.environ.get("UCLA_CATALOG_YEAR", "2024")
FAILED_LOG_PATH = os.environ.get("FAILED_MAJORS_LOG", "failed_majors.json")
DUMP_DIR = os.environ.get("MAJOR_JSON_DUMP_DIR", "bruintracks_server/data/majors")
PRUNE_UNSUPPORTED_MAJORS = os.environ.get("PRUNE_UNSUPPORTED_MAJORS", "1") == "1"

UNSUPPORTED_MAJOR_NAMES = [
    "MaterialsScienceandEngineeringBS",
    "IndividualFieldofConcentration(College)BA",
    "IndividualFieldofConcentration(College)BS",
    "IndividualFieldofConcentration(Arts&Architecture)BA",
    "NursingBS",
    "IndividualFieldofConcentration(TheaterFilmandTelevision)BA",
]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def remove_empty(data):
    if isinstance(data, dict):
        out = {}
        for k, v in data.items():
            cleaned = remove_empty(v)
            if cleaned not in ("", [], {}, None):
                out[k] = cleaned
        return out
    if isinstance(data, list):
        out = []
        for i in data:
            cleaned = remove_empty(i)
            if cleaned not in ("", [], {}, None):
                out.append(cleaned)
        return out
    return data


def fetch_all_majors():
    rows = []
    page_size = 1000
    start = 0

    while True:
        resp = (
            supabase.table("majors")
            .select("id, major_name")
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size

    cleaned = []
    seen = set()
    for row in rows:
        major_id = row.get("id")
        major_name = row.get("major_name")
        if major_id is None or not major_name:
            continue
        if major_name in seen:
            continue
        seen.add(major_name)
        cleaned.append({"id": major_id, "major_name": major_name})

    return cleaned


def prune_unsupported_majors():
    majors_rows = (
        supabase
        .table("majors")
        .select("id")
        .in_("major_name", UNSUPPORTED_MAJOR_NAMES)
        .execute()
    ).data or []

    req_rows = (
        supabase
        .table(TARGET_TABLE)
        .select("id")
        .in_("major_name", UNSUPPORTED_MAJOR_NAMES)
        .execute()
    ).data or []

    if majors_rows:
        (
            supabase
            .table("majors")
            .delete()
            .in_("major_name", UNSUPPORTED_MAJOR_NAMES)
            .execute()
        )

    if req_rows:
        (
            supabase
            .table(TARGET_TABLE)
            .delete()
            .in_("major_name", UNSUPPORTED_MAJOR_NAMES)
            .execute()
        )

    print(
        "Pruned unsupported majors from DB: "
        f"majors={len(majors_rows)}, {TARGET_TABLE}={len(req_rows)}"
    )


def parse_structure_item(item):
    result = {}
    current_level = int(item.get("data-level", "0"))

    heading_container = item.find("div", class_="css-115ux54-CompactStructure--ItemHeadingContent")
    if heading_container:
        heading = heading_container.find(["h4", "h5", "h6"])
        result["title"] = heading.get_text(strip=True) if heading else ""
    else:
        result["title"] = ""

    container = item.find(
        lambda tag: tag.name == "div"
        and tag.get("class")
        and any("CollapsibleContainer" in cls for cls in tag.get("class"))
    )

    result["description"] = ""
    result["courses"] = []
    result["options"] = []

    if container:
        content = container.find("div", attrs={"aria-hidden": "false"})
        if content:
            desc_el = content.find("div", class_="css-l9pyj5-CompactStructure--ItemDescription")
            result["description"] = desc_el.get_text(strip=True) if desc_el else ""

            course_lists = content.find_all(
                "div", class_="css-79j3ig-CompactStructure--RelationshipsList", recursive=False
            )
            for course_list in course_lists:
                for a in course_list.find_all("a"):
                    span = a.find("span", class_="relationshipName")
                    text = span.get_text(strip=True) if span else a.get_text(strip=True)
                    parts = text.split(" - ")
                    code = parts[0].strip() if parts else ""
                    name = " - ".join(parts[1:]).strip() if len(parts) > 1 else ""
                    course_text = f"{code} - {name}" if name else code
                    result["courses"].append(course_text)

            for child in content.find_all("div", attrs={"data-level": True}, recursive=True):
                try:
                    child_level = int(child.get("data-level", "0"))
                except Exception:
                    child_level = 0
                if child_level == current_level + 1:
                    result["options"].append(parse_structure_item(child))

    if result["title"].strip().lower() == "tracks":
        for opt in result["options"]:
            if "title" in opt:
                opt["heading"] = opt.pop("title")
        result["tracks"] = result.pop("options")

    return result


def scrape_major(driver, wait, major_name):
    def expand_all_sections():
        try:
            button = wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//h3[contains(text(), 'Major Requirements')]/following::button")
                )
            )
            driver.execute_script("arguments[0].click();", button)
            time.sleep(1.5)
        except Exception:
            # Not fatal; some pages may already be expanded.
            pass

    website = f"https://catalog.registrar.ucla.edu/major/{CATALOG_YEAR}/{major_name}"
    driver.get(website)
    time.sleep(1.5)
    expand_all_sections()

    major_requirements_div = wait.until(
        EC.presence_of_element_located(
            (By.XPATH, "//div[@aria-label='Major Requirements accordions']")
        )
    )
    major_requirements_html = major_requirements_div.get_attribute("innerHTML")

    soup = BeautifulSoup(major_requirements_html, "html.parser")
    structure_container = soup.find("div", class_="css-18a61ju-CompactStructure--StructureContainer")

    sections = []
    if structure_container:
        for item in structure_container.find_all("div", attrs={"data-level": "1"}, recursive=False):
            sections.append(parse_structure_item(item))

    return remove_empty(sections)


def main():
    os.makedirs(DUMP_DIR, exist_ok=True)

    if PRUNE_UNSUPPORTED_MAJORS:
        prune_unsupported_majors()

    majors = fetch_all_majors()
    print(f"Total majors from majors table: {len(majors)}")

    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    wait = WebDriverWait(driver, 10)

    failed_majors = []
    success_count = 0

    try:
        for idx, major in enumerate(majors, 1):
            major_name = major["major_name"]
            major_id = major["id"]
            print(f"[{idx}/{len(majors)}] Processing {major_name} ...")

            try:
                sections = scrape_major(driver, wait, major_name)
                payload = {
                    "major_name": major_name,
                    "major_id": major_id,
                    "json_data": sections,
                }

                existing = (
                    supabase
                    .table(TARGET_TABLE)
                    .select("id")
                    .eq("major_id", major_id)
                    .limit(1)
                    .execute()
                ).data or []

                if existing:
                    (
                        supabase
                        .table(TARGET_TABLE)
                        .update(payload)
                        .eq("major_id", major_id)
                        .execute()
                    )
                else:
                    (
                        supabase
                        .table(TARGET_TABLE)
                        .insert(payload)
                        .execute()
                    )

                with open(os.path.join(DUMP_DIR, f"{major_name}.json"), "w") as f:
                    f.write(json.dumps(payload, indent=2))

                success_count += 1
            except Exception as err:
                # Continue processing other majors and log failed major names.
                failed_majors.append(major_name)
                print(f"FAILED: {major_name} ({err})")
                continue
    finally:
        driver.quit()

    print("\nDone.")
    print(f"Success: {success_count}")
    print(f"Failed: {len(failed_majors)}")

    if failed_majors:
        print("Failed major names:")
        for name in failed_majors:
            print(f"- {name}")

        with open(FAILED_LOG_PATH, "w") as f:
            json.dump({"failed_majors": failed_majors}, f, indent=2)


if __name__ == "__main__":
    main()



