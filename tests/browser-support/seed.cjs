const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const back = path.resolve(__dirname, "../..");
const req = createRequire(path.join(back, "package.json"));
const mongoose = req("mongoose");
const bcrypt = req("bcrypt");
const User = req("./src/models/User");
const Course = req("./src/models/Course");
(async () => {
  if (!process.env.MONGODB_URI || !new URL(process.env.MONGODB_URI).pathname.endsWith("_test") || !process.env.COURSEMASTER_BROWSER_FIXTURES) throw Error("Use a dedicated _test database and set COURSEMASTER_BROWSER_FIXTURES.");
  await mongoose.connect(process.env.MONGODB_URI);
  if (await Course.countDocuments()) throw Error("Use an empty isolated database so pagination fixtures are deterministic.");
  const student = await User.create({ name: "Browser Student", email: "browser.student." + Date.now() + "@example.test", passwordHash: await bcrypt.hash("BrowserTest123!", 10), role: "student" });
  const syllabus = [{ title: "Browser Module", lessons: [{ title: "Lesson One", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", assignmentPrompt: "Explain lesson one", quiz: [{ question: "Choose the correct number", options: ["One", "Two"], correctIndex: 1 }, { question: "Choose Alpha", options: ["Alpha", "Beta"], correctIndex: 0 }] }, { title: "Lesson Two", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", assignmentPrompt: "Explain lesson two", quiz: [{ question: "Choose the first option", options: ["First", "Second"], correctIndex: 0 }, { question: "Choose Alpha", options: ["Alpha", "Beta"], correctIndex: 0 }] }] }];
  const courses = [];
  for (let i = 1; i <= 10; i++) courses.push(await Course.create({ title: i === 1 ? "Browser Course One With A Long Title For Responsive Layout Testing" : "Browser Course " + String(i).padStart(2, "0"), description: "Isolated browser verification course", instructorName: "Test Instructor", price: 1234, category: "Development", tags: ["testing"], batches: [{ name: "First Browser Batch", startDate: "2026-11-01" }], syllabus }));
  fs.writeFileSync(process.env.COURSEMASTER_BROWSER_FIXTURES, JSON.stringify({ studentId: String(student._id), email: student.email, courseId: String(courses[0]._id), otherCourseId: String(courses[1]._id), batchId: String(courses[0].batches[0]._id), lessonIds: courses[0].syllabus[0].lessons.map((x) => String(x._id)) }, null, 2));
  console.log("Synthetic browser fixtures ready");
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
