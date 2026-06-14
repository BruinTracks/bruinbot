import dotenv from "dotenv";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { OpenAI } from "openai";

dotenv.config(); 

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Fetch major requirements from Supabase
export async function getMajorRequirements(majorName) {
  try {
    const { data, error } = await supabase
      .from("majors")
      .select("json_data")
      .eq("major_name", majorName);

    if (error) {
      console.error(`Error fetching data for major ${majorName}:`, error);
      return null;
    }

    if (!data || data.length === 0) {
      console.error(`No data found for major: ${majorName}`);
      return null;
    }

    return data[0];
  } catch (e) {
    console.error(`Exception while fetching major ${majorName}:`, e);
    return null;
  }
}

// Turn sections into chunks
export async function chunkMajorRequirements(major, jsonData) {
  return jsonData.map((chunk) => ({
    section_major: major,
    section_data: chunk
  }));
}

// System prompt for GPT
const systemPrompt = `
### Prompt:
You are helping build a structured list of courses required for a Computer Science and Engineering BS major. This process happens incrementally, with requirements provided section by section.

Each time you receive a new section, extract and return only the new set of course IDs introduced in that section. These will later be appended to the overall course list.

### Example:
Only return a JSON object of the form:
{
  "courses": [
    "COMSCI 31",
    "COMSCI 32",
    "COMSCI 33",
    "MATH 31A",
    "Computer Science Elective",
    "Technical Breadth Elective"
  ]
}

### Important rules:
- Only return course IDs—no explanations, descriptions, or extra text.
- Course IDs must be exact—do not modify their format.
- If a course choice is given, pick one.
- If the section specifies **N electives without naming specific courses,insert N placeholders matching the category**:
  - "Computer Science Elective"
  - "Science and Technology Elective"
  - "Technical Breadth Elective"

### Ensure the response is strictly valid JSON. Return only the object with the new "courses" list from the section.
`;

// Extract course IDs from each section
async function extractCourses(chunks) {
  const allCourses = new Set();

  for (const section of chunks) {
    const sectionJson = JSON.stringify(section.section_data, null, 2);
    const userPrompt = `Here is the next section of the major requirements:\n\`\`\`json\n${sectionJson}\n\`\`\``;

    const tools = [
      {
        type: "function",
        function: {
          name: "extract_courses",
          description: "Extract course IDs from a section of major requirements",
          parameters: {
            type: "object",
            properties: {
              courses: {
                type: "array",
                items: {
                  type: "string"
                },
                description: "A list of course IDs or placeholders"
              }
            },
            required: ["courses"]
          }
        }
      }
    ];
    
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools,
        tool_choice: { type: "function", function: { name: "extract_courses" } },
        temperature: 0
      });
    
      const toolCall = completion.choices[0].message.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call returned from GPT.");
    
      const parsed = JSON.parse(toolCall.function.arguments);
      const courses = parsed.courses || [];
    
      courses.forEach((course) => allCourses.add(course));
      console.log(`Processed section for major: ${section.section_major}`);
    } catch (err) {
      console.error(
        `Error processing section for major "${section.section_major}":`,
        err.message
      );
    }

  const finalList = {
    courses: Array.from(allCourses)
  };

  console.log("\n🎓 Final Structured Course List:");
  console.log(JSON.stringify(finalList, null, 2));

  fs.writeFileSync("final_course_list.json", JSON.stringify(finalList, null, 2));
}

// Kickoff
(async (jsonData) => {
  if (jsonData) {
    const chunks = await chunkMajorRequirements("UserMajor", jsonData);
      await extractCourses(chunks);
  } else {
    console.error('No JSON data provided.');
  }
})();

// Example API endpoint usage
// const jsonData = { /* your json data */ };
// (async () => {
//   await (async (jsonData) => {
//     if (jsonData) {
//       const chunks = await chunkMajorRequirements("UserMajor", jsonData);
//       await extractCourses(chunks);
//     } else {
//       console.error('No JSON data provided.');
//     }
//   })(jsonData);
// })();