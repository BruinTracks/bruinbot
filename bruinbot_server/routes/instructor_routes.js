import express from "express";
import { searchInstructors } from "../controllers/instructors_controller.js";

const router = express.Router();

router.get("/search", searchInstructors);

export default router;
