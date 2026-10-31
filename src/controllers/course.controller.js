// controller for course-related routes

const jwt = require("jsonwebtoken");
const courseService = require("../services/course.service");
const connectDB = require("../config/db");
const Enrollment = require("../models/Enrollment");
const User = require("../models/User");

const getRequester = async (req) => {
  const header = req.headers.authorization;
  if (!header) return null;
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) return null;
    const user = await User.findById(decoded.id).select("role isBanned");
    if (!user || user.isBanned) return null;
    return { id: String(user._id), role: user.role };
  } catch {
    return null;
  }
};

const getCourses = async (req, res) => {
  try {
    // Ensure DB connection before processing request (for serverless)
    await connectDB();
    const data = await courseService.getCourses(req.query);
    const requester = await getRequester(req);
    const isAdmin = requester && requester.role === "admin";

    if (data && Array.isArray(data.courses)) {
      data.courses = data.courses.map((courseDoc) => {
        const course = courseDoc.toObject ? courseDoc.toObject() : JSON.parse(JSON.stringify(courseDoc));
        if (Array.isArray(course.syllabus)) {
          course.syllabus.forEach((mod) => {
            if (Array.isArray(mod.lessons)) {
              mod.lessons.forEach((lesson) => {
                if (Array.isArray(lesson.quiz) && !isAdmin) {
                  lesson.quiz = lesson.quiz.map(({ correctIndex, ...rest }) => rest);
                }
                if (!isAdmin) {
                  delete lesson.videoUrl;
                }
              });
            }
          });
        }
        return course;
      });
    }

    res.json(data);
  } catch (err) {
    console.error("Get courses error:", err.message);
    res.status(400).json({ message: err.message || "Failed to fetch courses" });
  }
};

const getCourseById = async (req, res) => {
  try {
    await connectDB();
    const courseDoc = await courseService.getCourseById(req.params.id);
    const requester = await getRequester(req);

    let isAuthorized = false;
    if (requester) {
      if (requester.role === "admin") {
        isAuthorized = true;
      } else {
        const enrollment = await Enrollment.findOne({
          student: requester.id,
          course: req.params.id,
        });
        if (enrollment) {
          isAuthorized = true;
        }
      }
    }

    const course = courseDoc.toObject ? courseDoc.toObject() : JSON.parse(JSON.stringify(courseDoc));

    if (Array.isArray(course.syllabus)) {
      course.syllabus.forEach((mod) => {
        if (Array.isArray(mod.lessons)) {
          mod.lessons.forEach((lesson) => {
            // Defect 2: Hide correctIndex from quiz before authorized submission
            if (Array.isArray(lesson.quiz) && (!requester || requester.role !== "admin")) {
              lesson.quiz = lesson.quiz.map(({ correctIndex, ...rest }) => rest);
            }
            // Defect 1: Hide videoUrl if not enrolled or admin
            if (!isAuthorized) {
              delete lesson.videoUrl;
            }
          });
        }
      });
    }

    res.json(course);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};

module.exports = { getCourses, getCourseById };
