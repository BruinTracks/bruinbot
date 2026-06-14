import express from "express";
import {
  validateQueryInput,
  processQuery,
} from "../controllers/query_controller.js";

const router = express.Router();

// POST /api/query
router.post("/", validateQueryInput, processQuery);

export default router;
