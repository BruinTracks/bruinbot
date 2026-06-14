import os
import re
from typing import List, Optional, Tuple
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")  # or service role key for write access
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def extract_subject_name(elective_label: str) -> str:
    """Extract the subject name from an elective label (e.g. 'MATH Elective' -> 'MATH')"""
    return elective_label.replace("Elective", "").strip()

def get_match_score(subject_name: str, target_name: str) -> float:
    """
    Calculate a match score between subject name and target name.
    Returns a score between 0 and 1, where 1 is a perfect match.
    """
    subject_name = subject_name.lower()
    target_name = target_name.lower()
    
    # Exact match gets highest score
    if subject_name == target_name:
        return 1.0
    
    # If target is a word in subject (e.g. "MATH" in "APPLIED MATH"), high score
    subject_words = subject_name.split()
    if target_name in subject_words:
        return 0.9
    
    # If target starts with subject (e.g. "MATH" matches "MATHEMATICS"), good score
    if subject_name.startswith(target_name):
        return 0.8
    
    # If target contains subject or vice versa, lower score
    if target_name in subject_name or subject_name in target_name:
        return 0.5
    
    return 0.0

def fuzzy_find_subject_id(subject_name: str) -> tuple[int, str]:
    """Find the best matching subject ID and code for a given subject name"""
    response = supabase.table("subjects").select("*").execute()
    subjects = response.data

    best_match = None
    best_score = -1

    for subj in subjects:
        # Try matching against both the subject code and name
        code_score = get_match_score(subj["code"], subject_name)
        name_score = get_match_score(subj["name"], subject_name)
        score = max(code_score, name_score)
        
        if score > best_score:
            best_score = score
            best_match = subj

    if not best_match or best_score == 0:
        raise ValueError(f"No subject match found for '{subject_name}'")

    return best_match["id"], best_match["code"]

def is_upper_division(catalog_number: str) -> bool:
    """
    Determine if a course is upper division based on its catalog number.
    Upper division courses have 3 digits (100-299) in their number.
    Examples:
        - "3" -> False (one digit)
        - "16" -> False (two digits)
        - "M16" -> False (two digits with prefix)
        - "100" -> True (three digits)
        - "M116L" -> True (three digits with prefix/suffix)
    """
    # Remove any prefix (like 'M') and suffix (like 'L')
    number_part = re.sub(r'^[A-Z]*', '', catalog_number)  # Remove prefix
    number_part = re.sub(r'[A-Z]*$', '', number_part)     # Remove suffix
    
    # Try to convert to integer, if not possible return False
    try:
        num = int(number_part)
        # Upper division if number is between 100 and 299
        return 100 <= num <= 299
    except ValueError:
        return False

def fetch_courses_for_subject(subject_id: int, subject_code: str) -> List[str]:
    """Fetch all upper division courses for a given subject ID and format them with subject code"""
    response = supabase.table("courses").select("catalog_number,title").eq("subject_id", subject_id).execute()
    courses = response.data
    
    # Filter for upper division courses and format them
    return [
        f"{subject_code} {c['catalog_number']} - {c['title']}"
        for c in courses
        if is_upper_division(c['catalog_number'])
    ]

def get_courses_for_elective_label(elective_label: str) -> List[str]:
    """Get a list of all courses that could satisfy the given elective requirement"""
    subject_name = extract_subject_name(elective_label)
    subject_id, subject_code = fuzzy_find_subject_id(subject_name)
    return fetch_courses_for_subject(subject_id, subject_code)

if __name__ == "__main__":
    # Example usage
    elective_label = "Electrical and Computer Engineering Elective"
    try:
        course_list = get_courses_for_elective_label(elective_label)
        for course in course_list:
            print(course)
    except ValueError as e:
        print(e) 