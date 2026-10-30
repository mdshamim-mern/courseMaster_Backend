const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
if (!process.env.MONGODB_URI || !/coursemaster_assignment_test/.test(process.env.MONGODB_URI)) {
  throw new Error('Use a dedicated MongoDB database named coursemaster_assignment_test for these tests.');
}
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.ADMIN_REGISTRATION_KEY = crypto.randomBytes(24).toString('hex');
process.env.NODE_ENV = 'test';
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASSWORD;
const mongoose = require('mongoose');
const app = require('../app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Enrollment = require('../src/models/Enrollment');
const Submission = require('../src/models/AssignmentSubmission');
let server, base, student, admin, course, enrollment;
const email = crypto.randomUUID() + '@example.test';
const password = 'LocalTest123!';
async function api(route, method = 'GET', body, token) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  await connectDB();
  await Promise.all([User.init(), Enrollment.init()]);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
});
test('CourseMaster HTTP regression suite', async (t) => {
  await t.test('Registration defaults to student and ignores an injected role', async () => {
    const result = await api('/auth/register','POST',{name:'Test Student', email, password, role:'admin'});
    assert.equal(result.status,201); assert.equal(result.body.user.role,'student'); student=result.body;
  });
  await t.test('Correct hashed password logs in; incorrect password fails', async () => {
    const result=await api('/auth/login','POST',{email,password}); assert.equal(result.status,200); assert.ok(result.body.token);
    assert.equal((await api('/auth/login','POST',{email,password:'wrong123'})).status,400);
  });
  await t.test('Admin registration key is checked', async () => {
    assert.equal((await api('/auth/register','POST',{name:'Invalid Admin',email:crypto.randomUUID()+'@example.test',password,adminKey:'wrong'})).status,400);
    const result=await api('/auth/register','POST',{name:'Test Admin',email:crypto.randomUUID()+'@example.test',password,adminKey:process.env.ADMIN_REGISTRATION_KEY});
    assert.equal(result.status,201); assert.equal(result.body.user.role,'admin'); admin=result.body;
  });
  await t.test('Invalid token returns 401; student cannot use admin API', async () => {
    assert.equal((await api('/auth/me','GET',undefined,'invalid-token')).status,401);
    assert.equal((await api('/admin/courses','POST',{},student.token)).status,403);
  });
  await t.test('Validation response includes field errors', async () => {
    const result=await api('/auth/register','POST',{name:'A',email:'bad',password:'x'});
    assert.equal(result.status,400); assert.ok(Array.isArray(result.body.errors)); assert.ok(result.body.errors.length>=3);
  });
  await t.test('Admin creates a course with a real batch and lesson', async () => {
    const result=await api('/admin/courses','POST',{title:'Regression Course',description:'Isolated test course',instructorName:'Test Instructor',price:1234,batches:[{name:'First batch',startDate:'2026-11-01'}],syllabus:[{title:'Module 1',lessons:[{title:'Lesson 1',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',assignmentPrompt:'Explain the lesson',quiz:[{question:'Two plus two?',options:['3','4'],correctIndex:1}]}]}]},admin.token);
    assert.equal(result.status,201); course=result.body; assert.ok(course.batches[0]._id);
  });
  await t.test('First enrollment succeeds and duplicates fail', async () => {
    const result=await api('/enrollments/'+course._id,'POST',{batchId:course.batches[0]._id},student.token);
    assert.equal(result.status,201); assert.equal(result.body.batchId,course.batches[0]._id); enrollment=result.body;
    assert.equal((await api('/enrollments/'+course._id,'POST',{},student.token)).status,400);
  });
  await t.test('My enrollments returns an array containing the course', async () => {
    const result=await api('/enrollments/my','GET',undefined,student.token);
    assert.equal(result.status,200); assert.ok(Array.isArray(result.body)); assert.ok(result.body.some(e=>e.course._id===course._id));
  });
  await t.test('Invalid lessons are rejected; completion is persisted and idempotent', async () => {
    assert.equal((await api('/enrollments/'+enrollment._id+'/complete-lesson','PATCH',{lessonId:new mongoose.Types.ObjectId().toString()},student.token)).status,400);
    const body={lessonId:course.syllabus[0].lessons[0]._id};
    for(let i=0;i<2;i++) { const result=await api('/enrollments/'+enrollment._id+'/complete-lesson','PATCH',body,student.token); assert.equal(result.status,200); assert.equal(result.body.progress.percent,100); assert.equal(result.body.progress.completedLessons.length,1); }
    const saved=await Enrollment.findById(enrollment._id); assert.equal(saved.progress.percent,100);
  });
  await t.test('A student cannot modify another student enrollment', async () => {
    const other=await api('/auth/register','POST',{name:'Other Student',email:crypto.randomUUID()+'@example.test',password});
    const result=await api('/enrollments/'+enrollment._id+'/complete-lesson','PATCH',{lessonId:course.syllabus[0].lessons[0]._id},other.body.token);
    assert.equal(result.status,400); assert.match(result.body.message,/not found/i);
  });
  await t.test('Quiz percentage uses a 0–100 scale and retakes update stats', async () => {
    const body={courseId:course._id,lessonId:course.syllabus[0].lessons[0]._id,answers:[1]};
    const result=await api('/quizzes/submit','POST',body,student.token); assert.equal(result.status,200); assert.equal(result.body.percent,100);
    const retake=await api('/quizzes/submit','POST',{...body,answers:[0]},student.token); assert.equal(retake.body.percent,0);
    const stats=await api('/quizzes/stats?courseId='+course._id,'GET',undefined,student.token); assert.equal(stats.body.average,0); assert.equal(stats.body.totalQuizzes,1);
  });
  await t.test('Malformed, missing, or out-of-range quiz answers fail', async () => {
    for(const answers of [undefined,[],[99],[-1],['1'],[1,1]]) {
      assert.equal((await api('/quizzes/submit','POST',{courseId:course._id,lessonId:course.syllabus[0].lessons[0]._id,answers},student.token)).status,400);
    }
  });
  await t.test('Assignment validates course membership, answer, and link protocol', async () => {
    const body={courseId:course._id,lessonId:course.syllabus[0].lessons[0]._id,answerType:'text',answer:'A complete answer'};
    assert.equal((await api('/assignments/submit','POST',{...body,lessonId:new mongoose.Types.ObjectId().toString()},student.token)).status,400);
    assert.equal((await api('/assignments/submit','POST',{...body,answer:'   '},student.token)).status,400);
    assert.equal((await api('/assignments/submit','POST',{...body,answerType:'link',answer:'javascript:alert(1)'},student.token)).status,400);
    const result=await api('/assignments/submit','POST',body,student.token); assert.equal(result.status,201); enrollment.assignmentId=result.body._id;
  });
  await t.test('Admin assignment filtering uses course and forwards query', async () => {
    const result=await api('/admin/assignments?courseId='+course._id,'GET',undefined,admin.token); assert.equal(result.status,200); assert.equal(result.body.length,1);
    const empty=await api('/admin/assignments?courseId='+new mongoose.Types.ObjectId(),'GET',undefined,admin.token); assert.equal(empty.body.length,0);
  });
  await t.test('Invalid assignment grades and statuses are rejected', async () => {
    for(const grade of [-1,101,'90']) assert.equal((await api('/admin/assignments/'+enrollment.assignmentId+'/review','PATCH',{grade},admin.token)).status,400);
    assert.equal((await api('/admin/assignments/'+enrollment.assignmentId+'/review','PATCH',{status:'unknown'},admin.token)).status,400);
    const result=await api('/admin/assignments/'+enrollment.assignmentId+'/review','PATCH',{grade:85,status:'reviewed',reviewNotes:'Good answer'},admin.token); assert.equal(result.status,200); assert.equal(result.body.grade,85);
  });
  await t.test('Invalid course updates run schema validation', async () => {
    const result=await api('/admin/courses/'+course._id,'PATCH',{title:''},admin.token); assert.ok(result.status>=400);
    assert.equal((await Course.findById(course._id)).title,'Regression Course');
  });
  await t.test('Banned users cannot log in or use existing tokens', async () => {
    await User.findByIdAndUpdate(student.user.id,{isBanned:true});
    assert.equal((await api('/auth/login','POST',{email,password})).status,400);
    assert.equal((await api('/auth/me','GET',undefined,student.token)).status,403);
    await User.findByIdAndUpdate(student.user.id,{isBanned:false});
  });
  await t.test('Role changes immediately affect existing tokens', async () => {
    await User.findByIdAndUpdate(admin.user.id,{role:'student'});
    assert.equal((await api('/admin/assignments','GET',undefined,admin.token)).status,403);
  });
  await t.test('CORS preflight permits PATCH and DELETE', async () => {
    const response=await fetch(base+'/admin/courses/'+course._id,{method:'OPTIONS',headers:{Origin:'http://localhost:5173','Access-Control-Request-Method':'DELETE'}});
    assert.equal(response.status,204); assert.match(response.headers.get('access-control-allow-methods'),/DELETE/); assert.match(response.headers.get('access-control-allow-methods'),/PATCH/);
  });
});
