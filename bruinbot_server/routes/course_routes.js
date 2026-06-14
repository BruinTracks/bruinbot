import express from "express";
import {
  getCourses,
  getCoursesByMajors,
  searchBuildings,
} from "../controllers/courses_controller.js";
import { getCoursesToSchedule } from "../controllers/scheduler_controller.js";
import { authenticateUser } from "../middleware/auth.js";

const router = express.Router();

// Routes
router.post("/get_courses", getCourses);
router.post("/by-majors", getCoursesByMajors);
router.get("/buildings/search", searchBuildings);
router.post("/get-courses-to-schedule", authenticateUser, getCoursesToSchedule);

export default router;
