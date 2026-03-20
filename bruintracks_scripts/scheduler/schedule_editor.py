import os
import json
import sys
from typing import Dict, List, Set, Tuple, Optional
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

def debug_print(*args, **kwargs):
    """Print debug information to stderr."""
    print(*args, file=sys.stderr, **kwargs)

# ───── CONFIGURATION ─────
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

class ScheduleEditor:
    def __init__(self, schedule: Dict, transcript: Dict[str, str], preferences: Dict):
        debug_print("\n=== Initializing Schedule Editor ===")
        debug_print(f"Initial Schedule: {json.dumps(schedule, indent=2)}")
        debug_print(f"Transcript: {json.dumps(transcript, indent=2)}")
        debug_print(f"Preferences: {json.dumps(preferences, indent=2)}")
        debug_print("=====================================\n")
        
        self.schedule = schedule
        self.transcript = transcript
        self.preferences = preferences
        self.supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # Cache for course data
        self._course_cache = {}
        self._prereq_cache = {}
        self._subject_code_to_id = {}
        self._subject_name_to_code = {}
        self._load_subject_mappings()

    def _normalize_subject_name(self, name: str) -> str:
        """Normalize subject names for stable lookup from prerequisite text."""
        return " ".join((name or "").upper().strip().split())

    def _load_subject_mappings(self) -> None:
        """Load subject mappings once to avoid repeated network lookups."""
        rows = self.supabase.table("subjects").select("id,code,name").execute().data or []
        for row in rows:
            code = row.get("code")
            if not code:
                continue
            self._subject_code_to_id[code] = row.get("id")

            raw_name = row.get("name") or ""
            clean_name = self._normalize_subject_name(raw_name.split("(")[0])
            if clean_name:
                self._subject_name_to_code[clean_name] = code

            # Also map the code to itself so prerequisites written as codes resolve.
            self._subject_name_to_code[self._normalize_subject_name(code)] = code
        
    def _get_course_data(self, course_id: str) -> Optional[Dict]:
        """Fetch course data from Supabase or cache."""
        debug_print(f"\n🔍 Fetching data for course: {course_id}")
        
        # Special handling for FILLER courses and electives
        if course_id == "FILLER" or "Elective" in course_id:
            debug_print("✓ Skipping validation for FILLER/Elective course")
            return None
            
        if course_id in self._course_cache:
            debug_print("✓ Found in cache")
            return self._course_cache[course_id]
            
        try:
            subject_code, number = course_id.split('|')
            debug_print(f"Looking up: Subject={subject_code}, Number={number}")
            
            # Resolve subject ID from preloaded cache for reliability/speed.
            subject_id = self._subject_code_to_id.get(subject_code)
            if not subject_id:
                debug_print(f"❌ Subject {subject_code} not found in database")
                return None

            debug_print(f"Found subject ID: {subject_id}")
            
            # Only fetch fields needed for prerequisite validation.
            # Some rows can fail JSON serialization when selecting all columns.
            result = (
                self.supabase.table("courses")
                .select("id,subject_id,catalog_number,course_requisites")
                .eq("subject_id", subject_id)
                .eq("catalog_number", number)
                .execute()
            )
            
            if result.data:
                debug_print("✓ Found course data in database")
                self._course_cache[course_id] = result.data[0]
                return result.data[0]
            
            debug_print("❌ Course not found in database")
            return None
        except ValueError:
            debug_print(f"❌ Invalid course ID format: {course_id}")
            return None
        except Exception as e:
            debug_print(f"❌ Error fetching course data for {course_id}: {e}")
            return None

    def _get_prerequisites(self, course_id: str) -> List[List[Tuple[str, str, str, str]]]:
        """Get prerequisites for a course in DNF form."""
        debug_print(f"\n🔍 Looking up prerequisites for {course_id}")
        
        if course_id in self._prereq_cache:
            debug_print("✓ Found in prerequisite cache")
            return self._prereq_cache[course_id]
        
        course_data = self._get_course_data(course_id)
        debug_print(f"Course data: {json.dumps(course_data, indent=2)}")

        if not course_data:
            debug_print("❌ No course data found")
            self._prereq_cache[course_id] = []
            return []

        if not course_data.get("course_requisites"):
            debug_print("❌ No prerequisites defined in course data")
            self._prereq_cache[course_id] = []
            return []

        debug_print(f"Raw prerequisite data: {json.dumps(course_data['course_requisites'], indent=2)}")

        def to_dnf(node: Dict) -> List[List[Dict]]:
            if 'and' in node:
                prods = to_dnf(node['and'][0])
                for child in node['and'][1:]:
                    prods = [a + b for a in prods for b in to_dnf(child)]
                return prods
            if 'or' in node:
                res = []
                for child in node['or']:
                    res.extend(to_dnf(child))
                return res
            return [[node]]

        prereqs = []
        for clause in to_dnf(course_data["course_requisites"]):
            debug_print(f"\nProcessing prerequisite clause: {json.dumps(clause, indent=2)}")
            prereq_clause = []
            for req in clause:
                if 'course' not in req:
                    debug_print(f"Skipping non-course requirement: {json.dumps(req, indent=2)}")
                    continue

                course_parts = req['course'].strip().rsplit(' ', 1)
                if len(course_parts) != 2:
                    debug_print(f"Warning: Invalid course format in prerequisites: {req['course']}")
                    continue

                dept, num = course_parts
                dept_key = self._normalize_subject_name(dept)
                subject_code = self._subject_name_to_code.get(dept_key)
                if not subject_code:
                    debug_print(f"Warning: Could not find subject code for department: {dept}")
                    continue

                debug_print(f"Found subject code: {subject_code}")
                prereq_clause.append((
                    f"{subject_code}|{num}",
                    req.get('relation', 'prerequisite'),
                    req.get('min_grade', 'D-'),
                    req.get('severity', 'R')
                ))
                debug_print(f"Added prerequisite: {subject_code}|{num}")

            if prereq_clause:
                prereqs.append(prereq_clause)
                debug_print(f"Added clause: {prereq_clause}")

        self._prereq_cache[course_id] = prereqs
        debug_print(f"\nFinal prerequisites for {course_id}: {prereqs}")
        return prereqs

    def _meets_prerequisites(self, course_id: str, term: str) -> bool:
        """Check if prerequisites are met for a course in a given term."""
        debug_print(f"\n🔍 Checking prerequisites for {course_id} in term {term}")
        
        # Skip prerequisite check for FILLER courses and electives
        if course_id == "FILLER" or "Elective" in course_id:
            debug_print("✓ Skipping prerequisite check for FILLER/Elective course")
            return True
        
        prereqs = self._get_prerequisites(course_id)
        if not prereqs:
            debug_print("✓ No prerequisites found")
            return True
            
        # Get all courses taken before this term
        taken_courses = set(self.transcript.keys())
        debug_print(f"Courses from transcript: {taken_courses}")
        
        term_order = list(self.schedule.keys())
        current_term_idx = term_order.index(term)
        
        # Only look at courses from terms STRICTLY BEFORE the current term
        for prev_term_idx in range(current_term_idx):
            prev_term = term_order[prev_term_idx]
            debug_print(f"\nChecking courses from previous term: {prev_term}")
            if isinstance(self.schedule[prev_term], dict):
                # For dictionary format, add course IDs directly
                # Skip FILLER courses
                taken_courses.update(cid for cid in self.schedule[prev_term].keys() if cid != "FILLER")
            else:
                # For list format, add course IDs directly
                # Skip FILLER courses
                taken_courses.update(cid for cid in self.schedule[prev_term] if cid != "FILLER")
        
        debug_print(f"All courses taken before {term}: {taken_courses}")
                    
        # Check if any prerequisite clause is satisfied
        for clause in prereqs:
            debug_print(f"\nChecking prerequisite clause: {clause}")
            clause_satisfied = True
            for prereq, rel_type, min_grade, severity in clause:
                # Skip MATH 1 prerequisite check
                if prereq == "MATH|1":
                    debug_print(f"✓ Skipping MATH 1 prerequisite check")
                    continue
                    
                if severity == 'W' and self.preferences.get('allow_warnings', False):
                    debug_print(f"Skipping warning prerequisite {prereq} (warnings allowed)")
                    continue
                    
                # Check if prerequisite is in current term
                if isinstance(self.schedule[term], dict):
                    current_term_courses = set(cid for cid in self.schedule[term].keys() if cid != "FILLER")
                else:
                    current_term_courses = set(cid for cid in self.schedule[term] if cid != "FILLER")
                    
                # If prerequisite is in current term, it's not satisfied
                if prereq in current_term_courses:
                    debug_print(f"❌ Prerequisite {prereq} cannot be taken in the same term")
                    clause_satisfied = False
                    break
                    
                # Check if prerequisite was taken in earlier terms
                if prereq not in taken_courses:
                    debug_print(f"❌ Missing prerequisite: {prereq}")
                    clause_satisfied = False
                    break
                else:
                    debug_print(f"✓ Found prerequisite: {prereq}")
                
            if clause_satisfied:
                debug_print("✓ Prerequisites satisfied!")
                return True
                
        debug_print("❌ No prerequisite clauses satisfied")
        return False

    def _check_time_conflict(self, section1: Dict, section2: Dict) -> bool:
        """Check if two sections have time conflicts."""
        def meetings_overlap(m1: Dict, m2: Dict) -> bool:
            if not set(m1['days']).intersection(m2['days']):
                return False
            t1_start = datetime.strptime(m1['start'], '%H:%M').time()
            t1_end = datetime.strptime(m1['end'], '%H:%M').time()
            t2_start = datetime.strptime(m2['start'], '%H:%M').time()
            t2_end = datetime.strptime(m2['end'], '%H:%M').time()
            return not (t1_end <= t2_start or t2_end <= t1_start)

        for m1 in section1.get('times', []):
            for m2 in section2.get('times', []):
                if meetings_overlap(m1, m2):
                    return True
        return False

    def _validate_term_schedule(self, schedule: Dict) -> bool:
        """Validate a term's schedule for time conflicts."""
        debug_print("\n=== Validating Term Schedule ===")
        debug_print(f"Schedule to validate: {json.dumps(schedule, indent=2)}")
        
        # Extract all meeting times
        meetings = []
        for course_id, course_data in schedule.items():
            # Skip FILLER courses
            if course_id == "FILLER" or not isinstance(course_data, dict):
                continue
                
            # Add lecture meetings
            if 'lecture' in course_data and course_data['lecture']:
                for time in course_data['lecture'].get('times', []):
                    meetings.append({
                        'days': time['days'],
                        'start': time['start'],
                        'end': time['end'],
                        'course': course_data['lecture'].get('section_code', 'Unknown')
                    })
            
            # Add discussion meetings
            if 'discussion' in course_data and course_data['discussion']:
                for time in course_data['discussion'].get('times', []):
                    meetings.append({
                        'days': time['days'],
                        'start': time['start'],
                        'end': time['end'],
                        'course': course_data['discussion'].get('section_code', 'Unknown')
                    })
        
        debug_print(f"\nExtracted meetings: {json.dumps(meetings, indent=2)}")
        
        # Check for conflicts
        for i in range(len(meetings)):
            for j in range(i + 1, len(meetings)):
                m1, m2 = meetings[i], meetings[j]
                
                # Check if meetings share any days
                days1 = set(m1['days'])
                days2 = set(m2['days'])
                if not days1.intersection(days2):
                    continue
                
                # Check time overlap
                if m1['start'] < m2['end'] and m2['start'] < m1['end']:
                    debug_print(f"❌ Found conflict:")
                    debug_print(f"  Section 1: {m1['course']} ({m1['days']} {m1['start']}-{m1['end']})")
                    debug_print(f"  Section 2: {m2['course']} ({m2['days']} {m2['start']}-{m2['end']})")
                    return False
        
        debug_print("✓ No conflicts found")
        debug_print("=== Validation Complete ===\n")
        return True

    def _validate_prerequisites_for_term(self, term: str) -> Tuple[bool, Optional[str]]:
        """Check prerequisites for all courses in a term."""
        debug_print(f"\n🔍 Validating prerequisites for all courses in {term}")
        for course_id in self.schedule[term]:
            # Skip FILLER courses
            if course_id == "FILLER":
                continue
            if not self._meets_prerequisites(course_id, term):
                return False, f"Prerequisites not met for {course_id} in {term}"
        return True, None

    def _validate_prerequisites_after_term(self, start_term: str) -> Tuple[bool, Optional[str]]:
        """Check prerequisites for all courses in all terms, starting from the first quarter."""
        debug_print(f"\n🔍 Validating prerequisites for all terms")
        term_order = list(self.schedule.keys())
        
        # Always start from the first term
        for term_idx in range(len(term_order)):
            term = term_order[term_idx]
            debug_print(f"\n🔍 Checking all courses in {term}")
            if isinstance(self.schedule[term], dict):
                courses = [cid for cid in self.schedule[term].keys() if cid != "FILLER"]
            else:
                courses = [cid for cid in self.schedule[term] if cid != "FILLER"]
            
            for course_id in courses:
                if not self._meets_prerequisites(course_id, term):
                    return False, f"Prerequisites not met for {course_id} in {term}"
        return True, None

    def move_course(self, course_id: str, from_term: str, to_term: str) -> Tuple[bool, str]:
        """
        Attempt to move a course to a different term.
        Returns (success, message).
        """
        # Validate terms
        if from_term not in self.schedule or to_term not in self.schedule:
            return False, "Invalid terms specified"
            
        # Validate course exists in source term
        if isinstance(self.schedule[from_term], dict):
            if course_id not in self.schedule[from_term]:
                return False, "Course not found in specified term"
            course_data = self.schedule[from_term][course_id]
        else:  # List format
            if course_id not in self.schedule[from_term]:
                return False, "Course not found in specified term"
            course_data = course_id  # For list format, just store the course ID
        
        # Create temporary schedule to validate
        temp_schedule = {**self.schedule}
        
        # Handle source term
        if isinstance(self.schedule[from_term], dict):
            temp_schedule[from_term] = {**self.schedule[from_term]}
            del temp_schedule[from_term][course_id]
        else:  # List format
            temp_schedule[from_term] = [c for c in self.schedule[from_term] if c != course_id]
        
        # Handle destination term
        if isinstance(self.schedule[to_term], dict):
            temp_schedule[to_term] = {**self.schedule[to_term]}
            temp_schedule[to_term][course_id] = course_data
        else:  # List format
            temp_schedule[to_term] = [*self.schedule[to_term]]
            temp_schedule[to_term].append(course_id)
        
        # Store original schedule
        original_schedule = {**self.schedule}
        
        # Apply temporary changes to check prerequisites
        self.schedule = temp_schedule
        
        # Check prerequisites for all courses in and after both terms
        earliest_term = min(from_term, to_term)
        valid, message = self._validate_prerequisites_after_term(earliest_term)
        
        if not valid:
            # Restore original schedule
            self.schedule = original_schedule
            return False, message
            
        # Validate term schedule if destination is earliest quarter (has detailed info)
        if to_term == min(self.schedule.keys()) and isinstance(temp_schedule[to_term], dict):
            if not self._validate_term_schedule(temp_schedule[to_term]):
                # Restore original schedule
                self.schedule = original_schedule
                return False, "Time conflict in new term"
            
        # If all validations pass, keep the changes
        self.schedule = temp_schedule
        return True, "Move successful"

    def swap_courses(self, course1_id: str, term1: str, course2_id: str, term2: str) -> Tuple[bool, str]:
        """
        Attempt to swap two courses between terms.
        Returns (success, message).
        """
        # Validate terms exist
        if term1 not in self.schedule or term2 not in self.schedule:
            return False, "Invalid terms specified"
            
        # Validate courses exist in specified terms
        if course1_id not in self.schedule[term1] or course2_id not in self.schedule[term2]:
            return False, "Courses not found in specified terms"
            
        # Create temporary schedules to validate
        temp_schedule = {**self.schedule}
        temp_schedule[term1] = {**self.schedule[term1]}
        temp_schedule[term2] = {**self.schedule[term2]}
        
        # Swap courses in temporary schedule
        temp_schedule[term1][course2_id] = self.schedule[term2][course2_id]
        temp_schedule[term2][course1_id] = self.schedule[term1][course1_id]
        del temp_schedule[term1][course1_id]
        del temp_schedule[term2][course2_id]
        
        # Store original schedule
        original_schedule = {**self.schedule}
        
        # Apply temporary changes to check prerequisites
        self.schedule = temp_schedule
        
        # Check prerequisites for all courses in and after both terms
        earliest_term = min(term1, term2)
        valid, message = self._validate_prerequisites_after_term(earliest_term)
        
        if not valid:
            # Restore original schedule
            self.schedule = original_schedule
            return False, message
            
        # Validate both terms
        if not self._validate_term_schedule(temp_schedule[term1]):
            # Restore original schedule
            self.schedule = original_schedule
            return False, f"Time conflict in {term1} after swap"
        if not self._validate_term_schedule(temp_schedule[term2]):
            # Restore original schedule
            self.schedule = original_schedule
            return False, f"Time conflict in {term2} after swap"
            
        # If all validations pass, keep the changes
        return True, "Swap successful"

    def change_section(self, course_id: str, term: str, new_lecture_id: Optional[str] = None, new_discussion_id: Optional[str] = None) -> Tuple[bool, str]:
        """
        Attempt to change the section (lecture and/or discussion) for a course.
        Returns (success, message).
        """
        debug_print(f"\n=== Attempting Section Change ===")
        debug_print(f"Course: {course_id}")
        debug_print(f"Term: {term}")
        debug_print(f"New Lecture ID: {new_lecture_id}")
        debug_print(f"New Discussion ID: {new_discussion_id}")
        
        if term not in self.schedule or course_id not in self.schedule[term]:
            debug_print("❌ Course not found in specified term")
            return False, "Course not found in specified term"
            
        # Get current course data
        course_data = self.schedule[term][course_id]
        debug_print(f"\nCurrent course data: {json.dumps(course_data, indent=2)}")
        
        temp_course_data = {**course_data}
        
        # Fetch new section data from Supabase
        if new_lecture_id:
            debug_print(f"\nFetching new lecture data (ID: {new_lecture_id})")
            result = self.supabase.table("sections").select("*").eq("id", new_lecture_id).execute()
            if not result.data:
                debug_print("❌ Invalid lecture section ID")
                return False, "Invalid lecture section ID"
            temp_course_data['lecture'] = result.data[0]
            debug_print(f"New lecture data: {json.dumps(result.data[0], indent=2)}")
            
        if new_discussion_id:
            debug_print(f"\nFetching new discussion data (ID: {new_discussion_id})")
            result = self.supabase.table("sections").select("*").eq("id", new_discussion_id).execute()
            if not result.data:
                debug_print("❌ Invalid discussion section ID")
                return False, "Invalid discussion section ID"
            temp_course_data['discussion'] = result.data[0]
            debug_print(f"New discussion data: {json.dumps(result.data[0], indent=2)}")
            
        # Create temporary schedule to validate
        temp_schedule = {**self.schedule[term]}
        temp_schedule[course_id] = temp_course_data
        
        debug_print("\nValidating temporary schedule...")
        # Validate term
        if not self._validate_term_schedule(temp_schedule):
            debug_print("❌ Time conflict with new section(s)")
            return False, "Time conflict with new section(s)"
            
        # If validation passes, update the section
        debug_print("✓ Validation passed, updating schedule")
        self.schedule[term][course_id] = temp_course_data
        debug_print(f"\nUpdated course data: {json.dumps(self.schedule[term][course_id], indent=2)}")
        debug_print("=== Section Change Complete ===\n")
        return True, "Section change successful"

def main():
    # Read input from stdin
    input_data = json.loads(sys.stdin.read())
    
    editor = ScheduleEditor(
        schedule=input_data['schedule'],
        transcript=input_data['transcript'],
        preferences=input_data['preferences']
    )
    
    # Process requested operation
    operation = input_data['operation']
    if operation['type'] == 'swap':
        success, message = editor.swap_courses(
            operation['course1_id'],
            operation['term1'],
            operation['course2_id'],
            operation['term2']
        )
    elif operation['type'] == 'move':
        success, message = editor.move_course(
            operation['course_id'],
            operation['from_term'],
            operation['to_term']
        )
    elif operation['type'] == 'change_section':
        success, message = editor.change_section(
            operation['course_id'],
            operation['term'],
            operation.get('new_lecture_id'),
            operation.get('new_discussion_id')
        )
    else:
        success, message = False, "Invalid operation type"
    
    # Return result
    result = {
        'success': success,
        'message': message,
        'schedule': editor.schedule if success else None
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main() 