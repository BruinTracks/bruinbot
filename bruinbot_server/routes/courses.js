const express = require("express");
const router = express.Router();
const { getCoursesByMajors } = require("../controllers/courses_controller");

router.post("/by-majors", getCoursesByMajors);

module.exports = router;
