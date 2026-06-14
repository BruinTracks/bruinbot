import express from "express";
import { getAllSchools } from "../controllers/schools_controller.js";

const router = express.Router();

router.get("/", getAllSchools);

export default router;
