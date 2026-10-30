const Enrollment = require("../models/Enrollment");
const Course = require("../models/Course");

const enrollCourse = async (studentId, courseId, batchId = null) => {
  const course = await Course.findById(courseId);
  if (!course) throw new Error("Course not found");

  // Check if already enrolled
  let enrollment = await Enrollment.findOne({
    student: studentId,
    course: courseId,
  });

  if (enrollment) {
    throw new Error("Already enrolled in this course");
  }

  // Create new enrollment
  if (batchId && !course.batches.id(batchId)) {
    throw new Error("Batch does not belong to this course");
  }
  enrollment = await Enrollment.create({
    student: studentId,
    course: courseId,
    batchId,
    progress: { completedLessons: [], percent: 0 },
  });

  return enrollment;
};

const getMyEnrollments = async (studentId) => {
  return Enrollment.find({ student: studentId })
    .populate("course", "title instructorName price category tags")
    .sort({ createdAt: -1 });
};

const completeLesson = async (enrollId, lessonId, studentId) => {
  const enrollment = await Enrollment.findOne({ _id: enrollId, student: studentId });
  if (!enrollment) throw new Error("Enrollment not found");

  const course = await Course.findById(enrollment.course);
  if (!course) throw new Error("Course not found");
  const lessonIds = course.syllabus.flatMap((mod) => mod.lessons.map((lesson) => String(lesson._id)));
  if (!lessonIds.includes(String(lessonId))) throw new Error("Lesson does not belong to this course");

  // avoid duplicates
  const alreadyDone = enrollment.progress.completedLessons
    .map(String)
    .includes(String(lessonId));

  if (!alreadyDone) {
    enrollment.progress.completedLessons.push(lessonId);
  }

  // calculate percent
  const totalLessons = course.syllabus.reduce(
    (sum, mod) => sum + mod.lessons.length,
    0
  );

  enrollment.progress.completedLessons = [...new Set(enrollment.progress.completedLessons.map(String))]
    .filter((id) => lessonIds.includes(id));
  const completed = enrollment.progress.completedLessons.length;
  enrollment.progress.percent =
    totalLessons === 0 ? 0 : Math.round((completed / totalLessons) * 100);

  await enrollment.save();
  return enrollment;
};

module.exports = { enrollCourse, getMyEnrollments, completeLesson };
