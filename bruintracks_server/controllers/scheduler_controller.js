import { OpenAI } from "openai";
import dotenv from "dotenv";
import { spawn } from "child_process";
import path from "path";
dotenv.config();
import { fileURLToPath } from "url";
import supabase from "./supabase_client.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ESM __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// System prompt for GPT
const systemPrompt = `
You are helping build a structured list of courses required for a major. Your task is to analyze the major requirements and return a list of courses that need to be taken, taking into account courses the student has already completed.

### Input:
1. Major requirements in JSON format (including course descriptions and titles)
2. List of completed courses from the student's transcript

### Rules:
1. For courses with choices (e.g., "Select one from:"):
   - Read the descriptions and titles carefully
   - Select the most appropriate course based on:
     * The student's completed courses
     * The course descriptions and prerequisites
     * The logical progression of the major
   - Only include the selected course, not all options

2. For elective requirements with specific counts:
   - Do NOT come up with any course substitutions. Instead, assume every elective is 4 units. Add the elective title placeholder, proceeded by "RESOLVE:", to the list and then the number of the elective. For example, the Computer Science and Engineering requires 12 units of electives. Then we include "RESOLVE: Computer Science Elective #1", "RESOLVE: Computer Science Elective #2", "RESOLVE: Computer Science Elective #3". Even if it's just one particular elective, i.e. the Electrical and Computer Engineering Elective for Computer Science & Engineering, we'll still label it "RESOLVE: Electrical and Computer Engineering Elective #1". This does NOT apply to tech breadths.
   - Make the placeholder name as specific as possible. Never output a bare label like "RESOLVE: Elective #1" if the JSON gives any departmental, track, or category context.
   - If the local title is generic like "Electives", use nearby context from the parent heading/section/description to expand it, for example "RESOLVE: Civil Engineering Field Elective #1" or "RESOLVE: Linguistics Upper-Division Elective #1".

3. For technical breadth requirements, ignore them. We will handle them separately.

4. DO NOT include courses that the student has already completed

5. Include course IDs only, not descriptions

### Example Response Format:
{
  "courses": [
    "COMSCI 31",
    "COMSCI 32",
    "COMSCI 33",
    "MATH 31A",
    "COMSCI 180",
    "COMSCI 111"
  ]
}

### Important:
- Only return course IDs—no explanations or extra text
- Course IDs must be exact—do not modify their format
- Make intelligent selections based on course descriptions and student's background
- Consider prerequisites and course dependencies
- Select EXACTLY the number of courses specified in the requirements
- Do not under any circumstance include technical breadth courses or information in the list.
`;

// Add function to get tech breadth recommendations
async function getTechBreadthRecommendations(
  transcript,
  techBreadthArea,
  required_courses,
) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python3", [
      path.join(
        process.cwd(),
        "../bruintracks_scripts/scheduler/tech_breadth_optimizer.py",
      ),
    ]);

    let outputData = "";
    let errorData = "";

    pythonProcess.stdin.write(
      JSON.stringify({
        transcript: transcript,
        required_courses: required_courses,
        tech_breadth_area: techBreadthArea,
      }),
    );
    pythonProcess.stdin.end();

    pythonProcess.stdout.on("data", (data) => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      errorData += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("Tech breadth optimizer error:", errorData);
        reject(new Error(`Tech breadth optimizer failed with code ${code}`));
        return;
      }

      try {
        const recommendations = JSON.parse(outputData);
        resolve(recommendations);
        console.log("Tech breadth recommendations:", recommendations);
      } catch (error) {
        console.error("Failed to parse tech breadth optimizer output:", error);
        reject(error);
      }
    });
  });
}

export const getCoursesToSchedule = async (req, res) => {
  try {
    // Log form data first
    console.log("\n📝 FORM INPUT DATA:");
    console.log("Selected Majors:", req.body.selectedMajors);
    console.log("Graduation Year:", req.body.graduationYear);
    console.log("Graduation Quarter:", req.body.graduationQuarter);
    console.log("Transcript:", req.body.transcript);
    console.log("Preferences:", req.body.preferences);
    console.log("\nComplete Form Data:", req.body);

    // Log the complete request information
    console.log("\n🔍 REQUEST DETAILS:");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    console.log("Query:", req.query);
    console.log("Params:", req.params);
    console.log("\nForm Data Fields:", Object.keys(req.body));
    console.log(
      "Form Data Values:",
      Object.entries(req.body).map(([key, value]) => `${key}: ${typeof value}`),
    );

    const {
      jsonData,
      transcript,
      grad_year,
      grad_quarter,
      school,
      preferences,
    } = req.body;
    console.log("Destructured values:", {
      grad_year,
      grad_quarter,
      hasJsonData: !!jsonData,
      hasTranscript: !!transcript,
      school,
      hasPreferences: !!preferences,
    });

    // Format transcript into the expected format
    const formattedTranscript = {};
    if (Array.isArray(transcript)) {
      transcript.forEach((course) => {
        // Split on last space to separate number from subject
        const lastSpaceIndex = course.lastIndexOf(" ");
        if (lastSpaceIndex !== -1) {
          const subject = course.substring(0, lastSpaceIndex);
          const number = course.substring(lastSpaceIndex + 1);
          formattedTranscript[`${subject}|${number}`] = null;
        }
      });
    } else if (typeof transcript === "object") {
      Object.entries(transcript).forEach(([course, grade]) => {
        // Split on last space to separate number from subject
        const lastSpaceIndex = course.lastIndexOf(" ");
        if (lastSpaceIndex !== -1) {
          const subject = course.substring(0, lastSpaceIndex);
          const number = course.substring(lastSpaceIndex + 1);
          console.log("SUBJECT:", subject);
          console.log("NUMBER:", number);
          formattedTranscript[`${subject}|${number}`] = grade;
        }
      });
    }

    console.log("Formatted transcript:", formattedTranscript);

    // Handle nested array if present
    const requirements = Array.isArray(jsonData[0]) ? jsonData[0] : jsonData;

    if (!requirements || !Array.isArray(requirements)) {
      console.error("Invalid JSON data format:", requirements);
      return res.status(400).json({ error: "Invalid JSON data format" });
    }

    const allCourses = new Set();
    const gptPromises = [];

    // Determines whether a section (or nested subsection) has actionable requirement data.
    const hasRequirementContent = (node) => {
      if (!node || typeof node !== "object") return false;

      if (Array.isArray(node.courses) && node.courses.length > 0) {
        return true;
      }

      const nestedOptions = Array.isArray(node.options) ? node.options : [];
      const nestedTracks = Array.isArray(node.tracks) ? node.tracks : [];
      return [...nestedOptions, ...nestedTracks].some((child) =>
        hasRequirementContent(child),
      );
    };

    // Prefer options/tracks when present; otherwise fall back to whole section.
    const buildPreferredTargets = (section) => {
      const nestedOptions = Array.isArray(section.options)
        ? section.options
        : [];
      const nestedTracks = Array.isArray(section.tracks) ? section.tracks : [];
      const preferred = [...nestedOptions, ...nestedTracks].filter((node) =>
        hasRequirementContent(node),
      );

      if (preferred.length > 0) {
        return preferred.map((node, idx) => {
          const sectionCourses =
            Array.isArray(section.courses) && section.courses.length > 0
              ? { courses: section.courses }
              : {};

          return {
            title:
              node?.title ||
              node?.heading ||
              `${section?.title || "Untitled Section"} item #${idx + 1}`,
            payload: {
              title: section?.title,
              description: section?.description,
              ...sectionCourses,
              options: [node],
            },
          };
        });
      }

      return [
        {
          title: section?.title || "Untitled Section",
          payload: section,
        },
      ];
    };

    const queuePromptForTarget = (sectionTitle, targetTitle, payload) => {
      const sectionJson = JSON.stringify(payload, null, 2);
      const transcriptJson = JSON.stringify(formattedTranscript, null, 2);
      const userPrompt = `Here is the next section of the major requirements:\n\`\`\`json\n${sectionJson}\n\`\`\`\n\nAnd here are the courses the student has already completed:\n\`\`\`json\n${transcriptJson}\n\`\`\`\n\nPlease analyze the course descriptions and titles, and select the most appropriate courses based on the student's completed courses and the logical progression of the major. Pay special attention to the number of courses required for each section, especially for electives.`;
      console.log(
        `Sending prompt to GPT for section "${sectionTitle}" target "${targetTitle}"`,
      );

      const gptPromise = openai.chat.completions
        .create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0,
        })
        .then((completion) => {
          console.log("GPT Response:", JSON.stringify(completion, null, 2));

          const content = completion.choices[0].message.content;
          if (!content) {
            console.error("No content returned from GPT");
            return;
          }

          try {
            // Remove markdown code block formatting if present
            const jsonContent = content.replace(/```json\n|\n```/g, "").trim();
            console.log("Cleaned JSON content:", jsonContent);

            const parsed = JSON.parse(jsonContent);
            console.log("Parsed courses from GPT:", parsed);

            if (!parsed.courses || !Array.isArray(parsed.courses)) {
              console.error("Invalid courses format in GPT response:", parsed);
              return;
            }

            const courses = parsed.courses;
            console.log("Adding courses:", courses);

            courses.forEach((course) => {
              if (typeof course !== "string") return;

              if (course.includes("RESOLVE")) {
                allCourses.add(course);
              } else if (course.trim()) {
                // Handle multi-word subjects by splitting on the last space
                const lastSpaceIndex = course.trim().lastIndexOf(" ");
                if (lastSpaceIndex !== -1) {
                  const subject = course.substring(0, lastSpaceIndex);
                  const number = course.substring(lastSpaceIndex + 1);
                  const formattedCourse = `${subject}|${number}`;
                  // Only add if not in transcript
                  if (!formattedTranscript[formattedCourse]) {
                    allCourses.add(formattedCourse);
                  }
                }
              }
            });

            console.log(
              `Processed section "${sectionTitle}" target "${targetTitle}" successfully. Current courses:`,
              Array.from(allCourses),
            );
          } catch (parseError) {
            console.error("Error parsing GPT response:", parseError);
            console.error("Raw response:", content);
          }
        })
        .catch((err) => {
          console.error(
            `Error processing section "${sectionTitle}" target "${targetTitle}":`,
            err.message,
          );
        });

      gptPromises.push(gptPromise);
    };

    for (const section of requirements) {
      const sectionTitle = section?.title || "Untitled Section";
      console.log("\nProcessing section:", sectionTitle);

      if (!hasRequirementContent(section)) {
        console.log(
          "Skipping section without course/options content:",
          sectionTitle,
        );
        continue;
      }

      const targets = buildPreferredTargets(section);
      targets.forEach((target) => {
        queuePromptForTarget(sectionTitle, target.title, target.payload);
      });
    }

    // Wait for all GPT responses to complete
    await Promise.all(gptPromises);

    // Now get tech breadth recommendations with the current course list
    if (preferences?.tech_breadth) {
      try {
        console.log("\n🔍 Getting technical breadth recommendations...");
        console.log("Current required courses:", Array.from(allCourses));
        const techBreadthCourses = await getTechBreadthRecommendations(
          formattedTranscript,
          preferences.tech_breadth,
          Array.from(allCourses), // Pass the current course list
        );
        console.log("Technical breadth recommendations:", techBreadthCourses);

        // Add recommended courses to allCourses
        techBreadthCourses.forEach((courseId) => {
          if (!formattedTranscript[courseId]) {
            allCourses.add(courseId);
          }
        });
      } catch (error) {
        console.error("Error getting tech breadth recommendations:", error);
      }
    }

    // Get second major tech breadth recommendations if applicable
    if (preferences?.second_tech_breadth) {
      try {
        console.log(
          "\n🔍 Getting second major technical breadth recommendations...",
        );
        console.log("Current required courses:", Array.from(allCourses));
        const secondTechBreadthCourses = await getTechBreadthRecommendations(
          formattedTranscript,
          preferences.second_tech_breadth,
          Array.from(allCourses), // Pass the current course list
        );
        console.log(
          "Second major technical breadth recommendations:",
          secondTechBreadthCourses,
        );

        // Add recommended courses to allCourses
        secondTechBreadthCourses.forEach((courseId) => {
          if (!formattedTranscript[courseId]) {
            allCourses.add(courseId);
          }
        });
      } catch (error) {
        console.error(
          "Error getting second major tech breadth recommendations:",
          error,
        );
      }
    }

    const finalList = {
      start_year: 2024,
      start_quarter: "Spring",
      end_year: parseInt(grad_year),
      end_quarter: grad_quarter || "Spring",
      school: school || null,
      courses_to_schedule: Array.from(allCourses),
      transcript: formattedTranscript,
      preferences,
    };

    console.log(
      "\n🎓 Final Structured Course List:",
      JSON.stringify(finalList, null, 2),
    );

    if (finalList.courses_to_schedule.length === 0) {
      console.error(
        "No courses were selected. This might indicate an issue with the GPT response or data processing.",
      );
    }

    // Get current date for start year/quarter
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    // Determine current quarter based on month
    const getCurrentQuarter = (month) => {
      if (month >= 0 && month <= 2) return "Winter";
      if (month >= 3 && month <= 5) return "Spring";
      if (month >= 6 && month <= 8) return "Summer";
      return "Fall";
    };

    // Validate grad year
    if (!grad_year) {
      console.error("Graduation year is required");
      return res.status(400).json({ error: "Graduation year is required" });
    }

    // Construct scheduling request body
    const schedulingRequestBody = {
      start_year: currentYear,
      start_quarter: getCurrentQuarter(currentMonth),
      end_year: parseInt(grad_year),
      end_quarter: grad_quarter || "Spring",
      courses_to_schedule: Array.from(allCourses),
      transcript: formattedTranscript,
      preferences: {
        allow_warnings: preferences?.allow_warnings ?? false,
        allow_primary_conflicts: preferences?.allow_primary_conflicts ?? false,
        allow_secondary_conflicts:
          preferences?.allow_secondary_conflicts ?? false,
        pref_priority: preferences?.pref_priority ?? [
          "time",
          "building",
          "days",
          "instructor",
        ],
        pref_earliest: preferences?.pref_earliest ?? "09:00",
        pref_latest: preferences?.pref_latest ?? "17:00",
        pref_no_days: preferences?.pref_no_days ?? [],
        pref_buildings: preferences?.pref_buildings ?? [],
        pref_instructors: preferences?.pref_instructors ?? [],
        max_courses_per_term: preferences?.max_courses_per_term ?? 4,
        least_courses_per_term: preferences?.least_courses_per_term ?? 3,
        tech_breadth: preferences?.tech_breadth ?? null,
        second_tech_breadth: preferences?.second_tech_breadth ?? null,
        debug_unscheduled: preferences?.debug_unscheduled ?? true,
      },
    };

    console.log(
      "\n📅 Scheduling Request Body:",
      JSON.stringify(schedulingRequestBody, null, 2),
    );

    // Call scheduling controller
    try {
      // Try different localhost variations
      const endpoints = [
        "http://127.0.0.1:3000/api/schedule",
        "http://localhost:3000/api/schedule",
        "http://[::1]:3000/api/schedule",
      ];

      let schedulingResponse = null;
      let lastError = null;

      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          schedulingResponse = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: req.headers.authorization, // Pass through the auth token
            },
            body: JSON.stringify(schedulingRequestBody),
          });
          if (schedulingResponse.ok) break;
        } catch (error) {
          console.log(`Failed to connect to ${endpoint}:`, error.message);
          lastError = error;
        }
      }

      if (!schedulingResponse || !schedulingResponse.ok) {
        throw (
          lastError ||
          new Error(
            `Scheduling failed with status: ${schedulingResponse?.status}`,
          )
        );
      }

      const schedulingResult = await schedulingResponse.json();
      console.log(
        "\n📊 Scheduling Result:",
        JSON.stringify(schedulingResult, null, 2),
      );

      const scheduleNote = schedulingResult?.note;
      if (
        typeof scheduleNote === "string" &&
        scheduleNote.startsWith("Unable to schedule:")
      ) {
        console.log(`\n⚠️ ${scheduleNote}`);
      }

      // Return both the course list and scheduling result
      res.json({
        ...finalList,
        schedule: schedulingResult,
      });
    } catch (schedulingError) {
      console.error("Error in scheduling:", schedulingError);
      // Still return the course list even if scheduling fails
      res.status(500).json({ error: "Internal server error" });
    }
  } catch (error) {
    console.error("Error in getCoursesToSchedule:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
