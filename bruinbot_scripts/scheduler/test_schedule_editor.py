from schedule_editor import ScheduleEditor
import json

print("\n🔍 SCHEDULE EDITOR TEST SCRIPT")
print("==============================")

# Sample test data
print("\n1️⃣ Setting up test data...")
schedule = {
    "Fall 2024": {
        "COM SCI|31": {
            "lecture": {
                "id": "1",
                "section_code": "1A",
                "times": [
                    {"days": "MW", "start": "10:00", "end": "11:50", "building": "Boelter", "room": "3400"}
                ],
                "is_primary": True
            },
            "discussion": {
                "id": "2",
                "section_code": "1A1",
                "times": [
                    {"days": "F", "start": "10:00", "end": "11:50", "building": "Boelter", "room": "3400"}
                ],
                "is_primary": False
            }
        },
        "MATH|31A": {
            "lecture": {
                "id": "3",
                "section_code": "1B",
                "times": [
                    {"days": "TR", "start": "10:00", "end": "11:50", "building": "MS", "room": "4000"}
                ],
                "is_primary": True
            },
            "discussion": {
                "id": "4",
                "section_code": "1B1",
                "times": [
                    {"days": "F", "start": "12:00", "end": "13:50", "building": "MS", "room": "4000"}
                ],
                "is_primary": False
            }
        }
    },
    "Winter 2025": {
        "COM SCI|32": {
            "lecture": {
                "id": "5",
                "section_code": "1A",
                "times": [
                    {"days": "MW", "start": "14:00", "end": "15:50", "building": "Boelter", "room": "3400"}
                ],
                "is_primary": True
            }
        }
    }
}

transcript = {
    "COM SCI|1": "A",
    "MATH|31B": "B+"
}

preferences = {
    "allow_warnings": True,
    "allow_primary_conflicts": False,
    "allow_secondary_conflicts": False,
    "pref_earliest": "09:00",
    "pref_latest": "17:00",
    "pref_no_days": ["F"],
    "pref_buildings": ["MS"],
    "pref_instructors": []
}

# Initialize the editor
print("\n2️⃣ Creating Schedule Editor instance...")
editor = ScheduleEditor(schedule, transcript, preferences)

# Test 1: Validate current schedule (should pass)
print("\n3️⃣ TEST: Validating current Fall 2024 schedule")
print("Expected: Should pass (no conflicts)")
print("----------------------------------------")
is_valid = editor._validate_term_schedule(schedule["Fall 2024"])
print(f"Result: {'✅ Valid' if is_valid else '❌ Invalid'}")

# Test 2: Try to create a conflict
print("\n4️⃣ TEST: Attempting to create a conflicting schedule")
print("Expected: Should fail (MW 10:00-11:50 conflict)")
print("----------------------------------------")
conflicting_schedule = {
    "COM SCI|31": schedule["Fall 2024"]["COM SCI|31"],
    "COM SCI|32": {
        "lecture": {
            "id": "5",
            "section_code": "1C",
            "times": [
                {"days": "MW", "start": "10:00", "end": "11:50", "building": "Boelter", "room": "3400"}
            ],
            "is_primary": True
        }
    }
}
is_valid = editor._validate_term_schedule(conflicting_schedule)
print(f"Result: {'❌ Has conflicts (Expected)' if not is_valid else '⚠️ Unexpectedly valid'}")

# Test 3: Change section to non-conflicting time
print("\n5️⃣ TEST: Changing COM SCI 31 to a non-conflicting time")
print("Expected: Should succeed (moving to MW 14:00-15:50)")
print("----------------------------------------")
success, message = editor.change_section(
    course_id="COM SCI|31",
    term="Fall 2024",
    new_lecture_id="6"  # This would be a real section ID in production
)
print(f"Result: {'✅ Success' if success else '❌ Failed'}")
print(f"Message: {message}")

# Test 4: Try to move a course between terms
print("\n6️⃣ TEST: Moving COM SCI 31 from Fall 2024 to Winter 2025")
print("Expected: Should succeed (no conflicts in Winter 2025)")
print("----------------------------------------")
success, message = editor.move_course(
    course_id="COM SCI|31",
    from_term="Fall 2024",
    to_term="Winter 2025"
)
print(f"Result: {'✅ Success' if success else '❌ Failed'}")
print(f"Message: {message}")

# Test 5: Try to swap courses between terms
print("\n7️⃣ TEST: Swapping COM SCI 32 (Winter) with MATH 31A (Fall)")
print("Expected: Should succeed (no conflicts in either term)")
print("----------------------------------------")
success, message = editor.swap_courses(
    course1_id="MATH|31A",
    term1="Fall 2024",
    course2_id="COM SCI|32",
    term2="Winter 2025"
)
print(f"Result: {'✅ Success' if success else '❌ Failed'}")
print(f"Message: {message}")

print("\n8️⃣ Final Schedule:")
print("----------------------------------------")
print(json.dumps(editor.schedule, indent=2))

print("\n✨ Test script complete!") 