import os
import re
import json
from typing import Dict, List, Set, Optional, Any
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

# Print environment variables for debugging
print("Environment variables:")
print("SUPABASE_URL:", SUPABASE_URL)
print("SUPABASE_KEY:", SUPABASE_KEY)

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment")

try:
    # Initialize Supabase client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print("Error initializing Supabase client:", str(e))
    raise

# Get schedule and transcript from environment
schedule_json = os.getenv("SCHEDULE")
transcript_json = os.getenv("TRANSCRIPT")

if not schedule_json or not transcript_json:
    raise RuntimeError("Missing SCHEDULE or TRANSCRIPT in environment")

try:
    schedule = json.loads(schedule_json)
    transcript = json.loads(transcript_json)
except json.JSONDecodeError as e:
    raise RuntimeError(f"Failed to parse JSON from environment: {e}")

def to_dnf(node: Dict) -> List[List[Dict]]:
    """Convert a boolean expression tree to DNF (Disjunctive Normal Form)"""
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
    """Check if an obtained grade meets the minimum required grade"""
    GRADE_ORDER = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F"]
    try:
        return GRADE_ORDER.index(obtained) <= GRADE_ORDER.index(required)
    except ValueError:
        return False

def get_completed_courses(transcript: Dict[str, Optional[str]], schedule: Dict[str, Any]) -> Set[str]:
    """Get all completed courses from transcript and prior terms in schedule"""
    completed = {
        course for course, grade in transcript.items() 
        if grade and meets_min_grade(grade, 'D-')
    }
    
    # Add courses from completed terms in schedule
    terms = list(schedule.keys())
    
    # Find the first term with an elective
    current_term_idx = len(terms)  # Default to end if no electives found
    for i, term in enumerate(terms):
        term_courses = schedule[term]
        if isinstance(term_courses, dict):
            course_list = term_courses.keys()
        elif isinstance(term_courses, list):
            course_list = term_courses
        else:
            continue
            
        if any(course.endswith('Elective') for course in course_list):
            current_term_idx = i
            break
    
    # Add all courses from terms before the elective term
    for term in terms[:current_term_idx]:
        term_courses = schedule[term]
        if isinstance(term_courses, dict):
            completed.update(term_courses.keys())
        elif isinstance(term_courses, list):
            completed.update(term_courses)
    
    return completed

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
        return 100 <= num <= 199
    except ValueError:
        return False

def get_all_scheduled_courses(schedule: Dict[str, Any]) -> Set[str]:
    """Get all courses from the entire schedule, including future terms"""
    scheduled = set()
    for term_courses in schedule.values():
        if isinstance(term_courses, dict):
            scheduled.update(
                course for course in term_courses.keys()
                if not course.endswith('Elective')
            )
        elif isinstance(term_courses, list):
            scheduled.update(
                course for course in term_courses
                if not course.endswith('Elective')
            )
    return scheduled

def get_elective_options(schedule: Dict[str, Any], transcript: Dict[str, Optional[str]]) -> Dict[str, List[str]]:
    """
    Find valid options for each elective placeholder in the schedule.
    
    Args:
        schedule: Dictionary mapping terms to courses
        transcript: Dictionary mapping completed courses to grades
    
    Returns:
        Dictionary mapping elective placeholders to lists of valid course options
    """
    # Get subject mappings
    subs = supabase.table("subjects").select("id,code,name").execute().data
    sub2id = {s['code']: s['id'] for s in subs}
    id2sub = {s['id']: s['code'] for s in subs}
    name2sub = {re.sub(r"\s*\(.*\)$", "", s['name']).strip().upper(): s['code'] for s in subs}
    
    # Get completed and scheduled courses
    completed = get_completed_courses(transcript, schedule)
    scheduled = get_all_scheduled_courses(schedule)
    
    # Find terms with electives
    elective_options: Dict[str, List[str]] = {}
    
    for term, courses in schedule.items():
        if not isinstance(courses, dict):
            continue
            
        # Keep track of elective counts per subject in each term
        term_elective_counts: Dict[str, int] = {}
            
        for course in courses.keys():
            if not course.endswith('Elective'):
                continue
                
            # Extract subject from elective label
            subject_name = course.replace('Elective', '').strip()
            
            # Update counter for this subject in this term
            term_elective_counts[subject_name] = term_elective_counts.get(subject_name, 0) + 1
            
            # Create a unique key that includes the term and elective number
            elective_key = f"{term} - {course} #{term_elective_counts[subject_name]}"
            
            subject_code = None
            subject_id = None
            
            # Try direct match first
            if subject_name in sub2id:
                subject_code = subject_name
                subject_id = sub2id[subject_name]
            else:
                # Try fuzzy match against names
                for name, code in name2sub.items():
                    if subject_name.lower() in name.lower():
                        subject_code = code
                        subject_id = sub2id[code]
                        break
            
            if not subject_id:
                continue
                
            # Get all courses for this subject
            courses_response = supabase.table("courses").select(
                "id,catalog_number,title,course_requisites"
            ).eq("subject_id", subject_id).execute()
            
            valid_options = []
            for c in courses_response.data:
                course_key = f"{subject_code}|{c['catalog_number']}"
                
                # Skip if already completed or scheduled
                if course_key in completed or course_key in scheduled:
                    continue
                
                # Skip if lower division
                if not is_upper_division(c['catalog_number']):
                    continue
                    
                # Check prerequisites
                prereqs_met = True
                raw_reqs = c.get('course_requisites', {})
                if raw_reqs:
                    clauses = to_dnf(raw_reqs)
                    prereqs_met = False
                    
                    for clause in clauses:
                        clause_met = True
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
                            prereq_key = f"{code}|{num.upper()}"
                            
                            if leaf['relation'] in ('prerequisite', 'corequisite'):
                                min_grade = leaf.get('min_grade', 'D-')
                                severity = leaf.get('severity', 'R')
                                
                                if severity == 'R' or (severity == 'W' and not True):  # allow_warnings hardcoded to True
                                    # For prerequisites, we need:
                                    # 1. The course to be in completed courses
                                    # 2. If there's a grade requirement, it must be met
                                    if prereq_key not in completed:
                                        clause_met = False
                                        break
                                    if min_grade != 'D-':  # If there's a specific grade requirement
                                        grade = transcript.get(prereq_key)
                                        if grade is None or not meets_min_grade(grade, min_grade):
                                            clause_met = False
                                            break
                        
                        if clause_met:
                            prereqs_met = True
                            break
                
                if prereqs_met:
                    valid_options.append(f"{subject_code} {c['catalog_number']} - {c['title']}")
            
            elective_options[elective_key] = sorted(valid_options)
    
    return elective_options

def test_get_elective_options():
    """Test the elective options functionality with realistic test cases"""
    # Test case 1: CS elective after completing core requirements
    test_schedule = {
        "Fall 2023": {
            "COM SCI|31": {"lecture": None, "discussion": None},
            "MATH|31A": {"lecture": None, "discussion": None}
        },
        "Winter 2024": {
            "COM SCI|32": {"lecture": None, "discussion": None},
            "COM SCI|33": {"lecture": None, "discussion": None}
        },
        "Spring 2024": {
            "COM SCI|35L": {"lecture": None, "discussion": None},
            "COM SCI|118": {"lecture": None, "discussion": None}
        },
        "Fall 2024": {
            "COM SCI Elective": {"lecture": None, "discussion": None},
            "COM SCI Elective": {"lecture": None, "discussion": None}  # Added second elective for testing
        }
    }
    test_transcript = {
        "COM SCI|31": "A",
        "COM SCI|32": "A",
        "COM SCI|33": "B+",
        "COM SCI|35L": "A-",
        "COM SCI|118": "B+",
        "MATH|31A": "A",
        "MATH|31B": "A-",
        "MATH|32A": "B+"
    }
    
    print("\nTest Case 1: CS elective after completing core requirements")
    print("Schedule:", json.dumps(test_schedule, indent=2))
    print("Transcript:", json.dumps(test_transcript, indent=2))
    result = get_elective_options(test_schedule, test_transcript)
    print("Elective Options:", json.dumps(result, indent=2))
    
    # Test case 2: Multiple electives in different subjects with prerequisites
    test_schedule_2 = {
        "Fall 2023": {
            "COM SCI|31": {"lecture": None, "discussion": None},
            "MATH|31A": {"lecture": None, "discussion": None}
        },
        "Winter 2024": {
            "COM SCI|32": {"lecture": None, "discussion": None},
            "MATH|31B": {"lecture": None, "discussion": None}
        },
        "Spring 2024": {
            "COM SCI|33": {"lecture": None, "discussion": None},
            "MATH|32A": {"lecture": None, "discussion": None},
            "COM SCI|35L": {"lecture": None, "discussion": None}
        },
        "Summer 2024": {
            "COM SCI|111": {"lecture": None, "discussion": None},
            "MATH|170E": {"lecture": None, "discussion": None}
        },

        "Fall 2024": {
            "COM SCI|118": {"lecture": None, "discussion": None},
            "COM SCI Elective": {"lecture": None, "discussion": None},
            "MATH Elective": {"lecture": None, "discussion": None}
        }
    }
    test_transcript_2 = {
        "COM SCI|31": "A",
        "COM SCI|32": "A",
        "COM SCI|33": "B+",
        "COM SCI|35L": "A-",
        "MATH|31A": "A",
        "MATH|31B": "A-",
        "MATH|32A": "B+"
    }
    
    print("\nTest Case 2: Multiple electives with prerequisites")
    print("Schedule:", json.dumps(test_schedule_2, indent=2))
    print("Transcript:", json.dumps(test_transcript_2, indent=2))
    result_2 = get_elective_options(test_schedule_2, test_transcript_2)
    print("Elective Options:", json.dumps(result_2, indent=2))

if __name__ == "__main__":
    result = get_elective_options(schedule, transcript)
    print(json.dumps(result, indent=2)) 