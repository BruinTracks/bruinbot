import os
import json
import sys
from typing import Dict, List, Optional, Set, Tuple
from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI

# Load environment variables
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

def to_dnf(node: Dict) -> List[List[Dict]]:
    """Convert prerequisite logic to disjunctive normal form"""
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

def get_dept_code_mapping(supabase) -> Dict[str, str]:
    """Get mapping of department names to their codes from subjects table"""
    subjects_query = supabase.table('subjects') \
        .select('name,code') \
        .execute()
    
    dept_mapping = {}
    for subject in subjects_query.data:
        # The name format is typically "Department Name (CODE)"
        # Extract just the department name part
        name = subject['name']
        if '(' in name:
            name = name.split('(')[0].strip()
        dept_mapping[name.upper()] = subject['code']
    
    return dept_mapping

def get_prerequisites(course_data: Dict, dept_mapping: Dict[str, str]) -> List[str]:
    """Extract prerequisites from course data and convert to proper course codes"""
    prereqs = []
    raw = course_data.get("course_requisites") or {}
    clauses = to_dnf(raw)
    
    # Get the clause with minimum prerequisites
    min_prereqs = []
    min_count = float('inf')
    
    for clause in clauses:
        current_prereqs = []
        for leaf in clause:
            if 'course' not in leaf:
                continue
            txt = leaf['course'].strip().rstrip(')')
            parts = txt.rsplit(' ', 1)
            if len(parts) != 2:
                continue
            dept_name, num = parts
            
            # Convert department name to code
            dept_name = dept_name.strip().upper()
            dept_code = dept_mapping.get(dept_name)
            if dept_code:
                current_prereqs.append(f"{dept_code}|{num}")
        
        if len(current_prereqs) < min_count:
            min_count = len(current_prereqs)
            min_prereqs = current_prereqs
    
    return min_prereqs

def get_tech_breadth_courses(tech_breadth_area: str, supabase) -> List[Tuple[str, List[str], str]]:
    """Get all courses, their prerequisites, and descriptions for a given technical breadth area"""
    # Get department name to code mapping first
    dept_mapping = get_dept_code_mapping(supabase)
    
    # Get course_ids from tech_breadth_courses
    tech_breadth_query = supabase.table('tech_breadth_courses') \
        .select('course_id') \
        .eq('tba_title', tech_breadth_area) \
        .execute()
    
    if not tech_breadth_query.data:
        return []
    
    course_ids = [item['course_id'] for item in tech_breadth_query.data]
    
    # Get course details including prerequisites
    courses_query = supabase.table('courses') \
        .select('id,subject_id,catalog_number,course_requisites') \
        .in_('id', course_ids) \
        .execute()
    
    if not courses_query.data:
        return []
    
    # Get descriptions for all courses
    descriptions_query = supabase.table('course_descriptions') \
        .select('course_id,description') \
        .in_('course_id', course_ids) \
        .execute()
    
    # Create mapping of course_id to description
    course_descriptions = {
        desc['course_id']: desc['description']
        for desc in descriptions_query.data
    }
    
    # Get subject codes
    subject_ids = list({course['subject_id'] for course in courses_query.data})
    subjects_query = supabase.table('subjects') \
        .select('id,code') \
        .in_('id', subject_ids) \
        .execute()
    
    subject_id_to_code = {subject['id']: subject['code'] for subject in subjects_query.data}
    
    # Format results with prerequisites and descriptions
    courses_with_prereqs = []
    for course in courses_query.data:
        if course['subject_id'] in subject_id_to_code:
            dept_code = subject_id_to_code[course['subject_id']]
            course_id = f"{dept_code}|{course['catalog_number']}"
            prereqs = get_prerequisites(course, dept_mapping)
            description = course_descriptions.get(course['id'], "No description available")
            courses_with_prereqs.append((course_id, prereqs, description))
    
    return sorted(courses_with_prereqs)

def get_course_number(course_id: str) -> int:
    """Extract numeric portion of course number, handling special cases like M51A -> 51"""
    try:
        # Split into dept and number
        _, number = course_id.split("|")
        # Remove any letter prefix (like M in M51A)
        number = ''.join(c for c in number if c.isdigit() or c == '.')
        # Convert to float to handle numbers like 100.1
        return float(number)
    except:
        return float('inf')

def find_optimal_tech_breadth_courses(
    transcript: Dict[str, Optional[str]],
    required_courses: List[str],
    tech_breadth_area: str,
    supabase
) -> Dict[str, List[Dict]]:
    """Find at least 3 tech breadth courses requiring minimal additional prerequisites"""
    # Get all potential tech breadth courses and their prerequisites
    all_courses = get_tech_breadth_courses(tech_breadth_area, supabase)
    
    # Create set of all courses we'll have completed
    completed_courses = set()
    # Add courses from transcript
    completed_courses.update(course for course, grade in transcript.items() if grade is not None)
    # Add courses we plan to take
    completed_courses.update(required_courses)
    
    # Calculate additional prerequisites needed for each course
    course_scores = []
    for course_id, prereqs, description in all_courses:
        # Skip if we're already taking this course
        if course_id in completed_courses or course_id in required_courses:
            continue
            
        # Calculate how many additional courses we'd need
        additional_courses = set(prereqs) - completed_courses
        
        course_scores.append({
            "course": course_id,
            "description": description,
            "additional_prereqs": len(additional_courses),
            "missing_prereqs": sorted(additional_courses)
        })
    
    # Sort only by number of prerequisites needed
    course_scores.sort(key=lambda x: x["additional_prereqs"])
    
    # Make sure we have at least 3 courses
    if len(course_scores) < 3:
        raise ValueError(f"Not enough valid technical breadth courses found in {tech_breadth_area}. Need at least 3 courses, found {len(course_scores)}.")
    
    return {
        "recommended": course_scores[:3],
        "additional": course_scores[3:]
    }

def get_beginner_friendly_courses(courses_data: Dict, tech_breadth_area: str) -> Dict:
    """Use GPT-4 to select the most beginner-friendly courses"""
    client = OpenAI(api_key=OPENAI_API_KEY)
    
    prompt = f"""You are a UCLA academic counselor helping students select technical breadth courses in {tech_breadth_area}.
Given a list of possible courses, select the 3 most beginner-friendly courses that would be most suitable for someone new to {tech_breadth_area}.

Consider:
1. Course descriptions and their complexity
2. Number of prerequisites needed
3. Course content accessibility to newcomers

Here are the available courses with their descriptions and prerequisites:
{json.dumps(courses_data, indent=2)}

Please respond with a JSON object in exactly the same format as the input, but only include the "recommended_courses" field with your chosen 3 courses.
Each course should keep its original structure (course, description, additional_prereqs, missing_prereqs).
Choose courses that balance prerequisites with beginner-friendly content.

Please avoid using probability courses in technical breadth courses (i.e. STATS 100A, MATH 170E, MATH 170A, C&EE 110, & ECE 131A). However, subsequent courses related to probability like STATS 100B, MATH 170S, MATH 171 etc. are acceptable. And other probability-adjacent classes like MATH 61 are also acceptable. We just want to avoid recommending those SPECIFIC courses I put in parentheses.
Also try to emphasize courses that are more accessible to newcomers. i.e. if the description uses big words (like bifurcation), then lean towards not recommending it if there are other easier options.
YOU MUST FOLLOW THE EXACT JSON FORMAT. e.g.

{{
  "tech_breadth_area": "Bioengineering",
  "recommended_courses": [
    {{
      "course": "BIOENGR|122",
      "description": "Description:Lecture, four hours; discussion, four hours; outside study, hour hours. Requisites: Mathematics 33A, Physics 1C, or consent of instructor. Introduction of principles and survey of technology and applications in field of biomedical imaging. Letter grading.Units:4.0",
      "additional_prereqs": 0,
      "missing_prereqs": []
    }},
    {{
      "course": "LIFESCI|7A",
      "description": "Description:Lecture, three hours; discussion, 75 minutes. Introduction to basic principles of cell structure and cell biology, biochemistry, and molecular biology. P/NP or letter grading.Units:5.0",
      "additional_prereqs": 0,
      "missing_prereqs": []
    }},
    {{
      "course": "CHEM|20A",
      "description": "Description:Lecture, three hours; discussion, one hour. Preparation: high school chemistry or equivalent background and three and one half years of high school mathematics. Recommended preparation: high school physics. Enforced corequisite: Mathematics 31A. First term of general chemistry. Survey of chemical processes, quantum chemistry, atomic and molecular structure and bonding, molecular spectroscopy. P/NP or letter grading.Units:4.0",
      "additional_prereqs": 0,
      "missing_prereqs": []
    }}
  ]
}}

"""

    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are a helpful UCLA academic counselor who specializes in technical breadth course selection."},
            {"role": "user", "content": prompt}
        ],
        temperature=0
    )
    
    return json.loads(response.choices[0].message.content)

def main():
    # Initialize Supabase client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Read input from stdin
    input_data = json.loads(sys.stdin.read())
    
    try:
        # Get initial course recommendations based on prerequisites
        results = find_optimal_tech_breadth_courses(
            input_data["transcript"],
            input_data["required_courses"],
            input_data["tech_breadth_area"],
            supabase
        )
        
        # Get GPT's beginner-friendly recommendations
        gpt_results = get_beginner_friendly_courses(results, input_data["tech_breadth_area"])
        
        # Extract just the course IDs into a list
        recommended_courses = [course["course"] for course in gpt_results["recommended_courses"]]
        
        # Output just the list of courses
        print(json.dumps(recommended_courses))
        
    except ValueError as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main() 