import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

// ESM __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const handleScheduleEdit = async (req, res) => {
  const {
    question,
    scheduleData,
    transcript = {},
    preferences = {},
    school = null,
  } = req.body;

  console.log("\n=== Schedule Edit Request ===");
  console.log("Question:", question);
  console.log("Initial Schedule:", JSON.stringify(scheduleData, null, 2));
  console.log("Transcript:", JSON.stringify(transcript, null, 2));

  // Prepare input data for the Python script
  const inputData = {
    schedule: scheduleData,
    transcript: transcript, // Use transcript from request
    preferences: { allow_warnings: true, ...preferences },
    school,
    operation: {
      type: "interpret",
      question: question,
    },
  };

  // Path to the schedule assistant script
  const scriptPath = path.join(
    __dirname,
    "..",
    "..",
    "bruinbot_scripts",
    "scheduler",
    "schedule_assistant.py",
  );

  // Spawn Python process
  const py = spawn("python3", [scriptPath], {
    stdio: ["pipe", "pipe", "pipe"], // Enable stderr
  });

  let stdout = "";
  let stderr = "";

  // Write input data to Python process
  py.stdin.write(JSON.stringify(inputData));
  py.stdin.end();

  // Collect stdout
  py.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  // Collect stderr and log to console
  py.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    // Log debug output to console
    console.log("Schedule Assistant Debug:", chunk.toString());
  });

  // Handle process completion
  py.on("close", (code) => {
    if (code !== 0) {
      console.error("Schedule assistant error:", stderr);
      return res.status(500).json({
        success: false,
        message: "Failed to process your request. Please try again.",
      });
    }

    try {
      // Parse the result
      const result = JSON.parse(stdout);

      console.log("\n=== Schedule Edit Result ===");
      console.log("Success:", result.success);
      console.log("Message:", result.message);
      if (result.schedule) {
        console.log(
          "Updated Schedule:",
          JSON.stringify(result.schedule, null, 2),
        );
      }
      console.log("===========================\n");

      // Send only success and message to the client
      res.json({
        success: result.success,
        message: result.message,
        schedule: result.schedule, // Include updated schedule if available
      });
    } catch (err) {
      console.error("Failed to parse schedule assistant output:", err);
      res.status(500).json({
        success: false,
        message: "Failed to understand the response. Please try again.",
      });
    }
  });
};
