import os
import json
from typing import Dict, List, Optional, Tuple, Any
from dotenv import load_dotenv
import openai
from schedule_editor import ScheduleEditor, debug_print
import sys

# Load environment variables
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY not found in environment variables")
openai.api_key = OPENAI_API_KEY

# Sample initial schedule for testing - only earliest quarter has detailed info
SAMPLE_SCHEDULE = {
    "Fall 2024": {  # Earliest quarter has detailed info
        "COM SCI|31": {
            "lecture": {
                "id": 1,
                "section_code": "1A",
                "times": [{"days": "MW", "start": "10:00", "end": "11:50", "building": "MS", "room": "100"}],
                "instructors": ["Smallberg"]
            },
            "discussion": {
                "id": 2,
                "section_code": "1D",
                "times": [{"days": "F", "start": "10:00", "end": "11:50", "building": "MS", "room": "101"}],
                "instructors": ["TA1"]
            }
        },
        "MATH|31A": {
            "lecture": {
                "id": 3,
                "section_code": "1A",
                "times": [{"days": "TR", "start": "14:00", "end": "15:50", "building": "BH", "room": "200"}],
                "instructors": ["Math Prof"]
            }
        },
        "FILLER": "FILLER"
    },
    "Winter 2025": ["COM SCI|32", "MATH|31B", "FILM TV|33"],
    "Spring 2025": ["COM SCI|33", "FILM TV|4"]
}

# Sample transcript for testing
SAMPLE_TRANSCRIPT = {}

# Sample preferences for testing
SAMPLE_PREFERENCES = {
    "allow_warnings": True,
    "least_courses_per_term": 3,
    "max_courses_per_term": 4
}

def interpret_request(request: str, current_schedule: Dict) -> Dict[str, Any]:
    """Use OpenAI to interpret a natural language request into schedule operations."""
    debug_print(f"\n🔍 Interpreting request: {request}")
    
    # Create a prompt that describes the current schedule and the available operations
    system_prompt = """You are a schedule modification assistant. Given a schedule and a user request, determine what schedule operations to perform.
Note: Only the earliest quarter in the schedule has detailed course information with times and sections. Other quarters just have a list of course names.

Available operations and their EXACT required JSON format:

1. Move course:
{
    "type": "move",
    "course_id": "DEPT|NUMBER",  # e.g. "COM SCI|31"
    "from_term": "TERM",         # e.g. "Fall 2024"
    "to_term": "TERM"           # e.g. "Winter 2025"
}

2. Swap courses:
{
    "type": "swap",
    "course1_id": "DEPT|NUMBER", # e.g. "COM SCI|31"
    "term1": "TERM",            # e.g. "Fall 2024"
    "course2_id": "DEPT|NUMBER", # e.g. "COM SCI|32"
    "term2": "TERM"             # e.g. "Winter 2025"
}

3. Change section (only available for earliest quarter):
{
    "type": "change_section",
    "course_id": "DEPT|NUMBER",  # e.g. "COM SCI|31"
    "term": "TERM",             # e.g. "Fall 2024"
    "new_lecture_id": "ID",     # Optional, numeric ID
    "new_discussion_id": "ID"   # Optional, numeric ID
}

Your response MUST be a JSON object with EXACTLY this format:
{
    "operations": [
        {
            // One or more operations in the exact format shown above
            // NO nested "parameters" object
            // All fields must be at the top level of each operation
        }
    ],
    "explanation": "Clear explanation of what will be done",
    "feasible": true/false
}

Important:
- Always use the pipe character (|) in course IDs: "COM SCI|31" not "COM SCI 31"
- All operation parameters must be at the top level, not nested in a "parameters" object
- Terms must match exactly as shown in the schedule
- Department codes must match exactly as shown in the schedule
- Section changes are only possible in the earliest quarter
- For quarters after the earliest one, courses are just strings in a list"""
    
    schedule_context = f"Current Schedule:\n{json.dumps(current_schedule, indent=2)}"
    
    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"{schedule_context}\n\nUser Request: {request}"}
            ],
            response_format={"type": "json_object"}
        )
        
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"Error interpreting request: {e}")
        return {
            "feasible": False,
            "explanation": "Sorry, I encountered an error while interpreting your request.",
            "operations": []
        }

def execute_operations(editor: ScheduleEditor, operations: List[Dict]) -> Tuple[bool, str, Optional[Dict]]:
    """Execute a list of operations on the schedule."""
    success = True
    messages = []
    
    # Get earliest quarter to check if section changes are allowed
    earliest_quarter = min(editor.schedule.keys()) if editor.schedule else None
    
    for op in operations:
        try:
            if op["type"] == "move":
                op_success, message = editor.move_course(
                    course_id=op["course_id"],
                    from_term=op["from_term"],
                    to_term=op["to_term"]
                )
            elif op["type"] == "swap":
                op_success, message = editor.swap_courses(
                    course1_id=op["course1_id"],
                    term1=op["term1"],
                    course2_id=op["course2_id"],
                    term2=op["term2"]
                )
            elif op["type"] == "change_section":
                # Only allow section changes in earliest quarter
                if op["term"] != earliest_quarter:
                    op_success = False
                    message = f"Section changes are only allowed in the earliest quarter ({earliest_quarter})"
                else:
                    op_success, message = editor.change_section(
                        course_id=op["course_id"],
                        term=op["term"],
                        new_lecture_id=op.get("new_lecture_id"),
                        new_discussion_id=op.get("new_discussion_id")
                    )
            else:
                op_success = False
                message = f"Unknown operation type: {op['type']}"
            
            success = success and op_success
            messages.append(message)
            
            if not op_success:
                return False, "\n".join(messages), None
                
        except Exception as e:
            debug_print(f"Error executing operation: {e}")
            return False, "Error executing operation due to a data lookup failure.", None
    
    return success, "\n".join(messages), editor.schedule if success else None

def print_schedule(schedule: Dict):
    """Pretty print the schedule."""
    print("\n=== Current Schedule ===")
    earliest_quarter = min(schedule.keys()) if schedule else None
    
    for term, courses in schedule.items():
        print(f"\n{term}:")
        # For earliest quarter, print detailed info
        if term == earliest_quarter and isinstance(courses, dict):
            for course_id, sections in courses.items():
                if isinstance(sections, dict):  # Skip if it's a FILLER course
                    print(f"  {course_id}:")
                    if sections.get("lecture"):
                        lec = sections["lecture"]
                        times = ", ".join(f"{t['days']} {t['start']}-{t['end']}" for t in lec["times"])
                        print(f"    Lecture {lec['section_code']}: {times}")
                    if sections.get("discussion"):
                        disc = sections["discussion"]
                        times = ", ".join(f"{t['days']} {t['start']}-{t['end']}" for t in disc["times"])
                        print(f"    Discussion {disc['section_code']}: {times}")
                else:
                    print(f"  {course_id}")
        # For other quarters, just print course names
        else:
            if isinstance(courses, list):
                for course in courses:
                    print(f"  {course}")
            else:
                for course_id in courses:
                    print(f"  {course_id}")

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
    
    if operation['type'] == 'interpret':
        # First interpret the request
        interpretation = interpret_request(operation['question'], editor.schedule)
        
        if not interpretation['feasible']:
            result = {
                'success': False,
                'message': interpretation['explanation']
            }
        else:
            # Then execute the interpreted operations
            success, message, new_schedule = execute_operations(editor, interpretation['operations'])
            result = {
                'success': success,
                'message': f"{interpretation['explanation']}\n\n{message}",
                'schedule': new_schedule
            }
    elif operation['type'] == 'swap':
        success, message = editor.swap_courses(
            operation['course1_id'],
            operation['term1'],
            operation['course2_id'],
            operation['term2']
        )
        result = {
            'success': success,
            'message': message,
            'schedule': editor.schedule if success else None
        }
    elif operation['type'] == 'move':
        success, message = editor.move_course(
            operation['course_id'],
            operation['from_term'],
            operation['to_term']
        )
        result = {
            'success': success,
            'message': message,
            'schedule': editor.schedule if success else None
        }
    elif operation['type'] == 'change_section':
        success, message = editor.change_section(
            operation['course_id'],
            operation['term'],
            operation.get('new_lecture_id'),
            operation.get('new_discussion_id')
        )
        result = {
            'success': success,
            'message': message,
            'schedule': editor.schedule if success else None
        }
    else:
        result = {
            'success': False,
            'message': "Invalid operation type",
            'schedule': None
        }
    
    # Output result as JSON
    print(json.dumps(result))

if __name__ == "__main__":
    main() 
