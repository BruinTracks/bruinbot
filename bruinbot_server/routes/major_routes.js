import express from "express";
import {
  getMajorsBySchool,
  getAllMajors,
} from "../controllers/majors_controller.js";

const router = express.Router();

router.get("/", getMajorsBySchool);
router.get("/all", getAllMajors);

export default router;
