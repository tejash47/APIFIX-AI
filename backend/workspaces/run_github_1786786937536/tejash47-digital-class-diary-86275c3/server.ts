import express from "express";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createServer as createViteServer } from "vite";
import { connectDatabase, isConnectedToMongo } from "./server/db.js";
import { dbService } from "./server/dbService.js";
import { generateLessonSummary } from "./server/ai.ts";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET not configured");
}

app.use(express.json());

// Auth check middleware
async function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. Auth token required." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/* ============================================================
   AUTHENTICATION ROUTES
   ============================================================ */
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, role, specialization, classYear, section, rollNo, studentId } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Name, email, password, and role are required." });
  }

  try {
    const existing = await dbService.findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "Email already registered." });
    }

    if (role === "student") {
      if (!studentId || studentId.trim() === "") {
        return res.status(400).json({ error: "Student ID is required for student registration." });
      }
      const existingStudent = await dbService.findStudentByIdNumber(studentId);
      if (existingStudent) {
        return res.status(400).json({ error: "ID already in use" });
      }

      if (classYear && section && rollNo) {
        const studentWithSameRoll = await dbService.findStudentByRollNo(classYear, section, rollNo);
        if (studentWithSameRoll) {
          return res.status(400).json({ error: "Roll number already in use in this class year and section." });
        }
      }
    }

    const newUser = await dbService.createUser({
      name,
      email,
      password,
      role,
      specialization,
      classYear,
      section,
      rollNo,
      studentId
    });

    res.status(201).json({ message: "Registration successful. Please log in." });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Registration failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const user = await dbService.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign(
      { userId: user._id || user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _, ...safeUser } = (user.toObject ? user.toObject() : user);

    res.json({
      token,
      user: safeUser
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Login failed." });
  }
});

app.get("/api/auth/me", authMiddleware, async (req: any, res) => {
  try {
    const user = await dbService.findUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    // Print a quick notification to client header about server connection status
    const status = {
      user,
      dbMode: isConnectedToMongo ? "MongoDB Atlas" : "JSON Local File Fallback",
      dbStatus: isConnectedToMongo ? "Connected" : "In-Memory Fallback Mode"
    };
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch user state." });
  }
});

app.post("/api/auth/profile", authMiddleware, async (req: any, res) => {
  try {
    const updated = await dbService.updateProfile(req.userId, req.body);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update profile." });
  }
});

app.post("/api/auth/regenerate-code", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") {
    return res.status(403).json({ error: "Only teachers can regenerate teacher codes." });
  }
  try {
    const user = await dbService.findUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found." });
    const updated = await dbService.regenerateTeacherCode(req.userId, user.name);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to regenerate code." });
  }
});

/* ============================================================
   JOIN / CONNECTION ROUTES
   ============================================================ */
// Pre-check classroom code
app.get("/api/classrooms/code/:code", authMiddleware, async (req, res) => {
  try {
    const cls = await dbService.getClassroomByCode(req.params.code);
    if (!cls) {
      return res.status(404).json({ error: "There are no classrooms available with that code." });
    }
    res.json(cls);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Student sends request
app.post("/api/join/request", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "student") {
    return res.status(403).json({ error: "Only students can join classrooms." });
  }
  const { classroomId } = req.body;
  if (!classroomId) {
    return res.status(400).json({ error: "Classroom ID is required." });
  }
  try {
    const request = await dbService.createJoinRequest(req.userId, classroomId);
    res.status(201).json(request);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Pre-fetch specific classroom request state for student dashboard
app.get("/api/join/status/:classroomId", authMiddleware, async (req: any, res) => {
  try {
    const status = await dbService.getJoinRequestStatus(req.userId, req.params.classroomId);
    if (!status) {
      return res.json({ status: "none" });
    }
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Teacher view pending requests
app.get("/api/join/requests/pending", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") {
    return res.status(403).json({ error: "Only teachers can access requests." });
  }
  try {
    const { classroomId } = req.query;
    const list = await dbService.getPendingRequestsForTeacher(req.userId, classroomId as string);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Teacher approve/reject JoinRequest
app.put("/api/join/requests/:requestId", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") {
    return res.status(403).json({ error: "Unauthorized role." });
  }
  const { status } = req.body; // 'approved' or 'rejected'
  if (!status || !["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Status must be approved or rejected." });
  }
  try {
    const updated = await dbService.updateJoinRequestStatus(req.params.requestId, status, req.userId);
    if (!updated) {
      return res.status(404).json({ error: "Request not found or unauthorized." });
    }
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Teacher list approved students
app.get("/api/join/students", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") {
    return res.status(403).json({ error: "Teacher only." });
  }
  try {
    const { classroomId } = req.query;
    const list = await dbService.getConnectedStudents(req.userId, classroomId as string);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Teacher remove student
app.delete("/api/join/students/:studentId", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") {
    return res.status(403).json({ error: "Teacher only." });
  }
  try {
    const { classroomId } = req.query;
    const removed = await dbService.removeConnectedStudent(req.params.studentId, req.userId, classroomId as string);
    if (!removed) return res.status(404).json({ error: "Student not connected." });
    res.json({ message: "Student disconnected successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   CLASSROOM ROUTES
   ============================================================ */
app.post("/api/classrooms", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") {
    return res.status(403).json({ error: "Only teachers can create classrooms." });
  }
  const { name, subject, description } = req.body;
  if (!name || !subject) {
    return res.status(400).json({ error: "Classroom name and subject are required." });
  }
  try {
    const cls = await dbService.createClassroom(req.userId, name, subject, description || "");
    res.status(201).json(cls);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/classrooms", authMiddleware, async (req: any, res) => {
  try {
    if (req.userRole === "teacher") {
      const list = await dbService.getClassroomsByTeacher(req.userId);
      res.json(list);
    } else {
      const list = await dbService.getClassroomsByStudent(req.userId);
      res.json(list);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/classrooms/:classroomId", authMiddleware, async (req: any, res) => {
  try {
    const cls = await dbService.getClassroomById(req.params.classroomId);
    if (!cls) return res.status(404).json({ error: "Classroom not found." });
    res.json(cls);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/classrooms/:classroomId", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") {
    return res.status(403).json({ error: "Unauthorized." });
  }
  try {
    const deleted = await dbService.deleteClassroom(req.params.classroomId, req.userId);
    if (!deleted) return res.status(404).json({ error: "Classroom not found." });
    res.json({ message: "Classroom deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/classrooms/:classroomId/regenerate-code", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") {
    return res.status(403).json({ error: "Only teachers can regenerate classroom join codes." });
  }
  try {
    const cls = await dbService.regenerateClassroomCode(req.params.classroomId, req.userId);
    if (!cls) return res.status(404).json({ error: "Classroom not found." });
    res.json(cls);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   LESSONS ROUTES
   ============================================================ */
app.post("/api/classrooms/:classroomId/lessons", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Unauthorized." });
  const { chapter, topic, content, objectives, concepts, notes, publishDate } = req.body;
  if (!chapter || !topic || !content) {
    return res.status(400).json({ error: "Chapter, topic, and content are required." });
  }

  try {
    // Generate AI summaries immediately when creating the lesson on the server!
    console.log(`🤖 Invoking Gemini AI metadata summarize for topic: ${topic}`);
    const aiSummaries = await generateLessonSummary(chapter, topic, content);

    const lesson = await dbService.createLesson(req.params.classroomId, {
      chapter,
      topic,
      content,
      objectives,
      concepts,
      notes,
      publishDate: publishDate || new Date(),
      aiSummaries
    });

    // Notify connected students
    const cls = await dbService.getClassroomById(req.params.classroomId);
    if (cls) {
      const students = await dbService.getConnectedStudents(req.userId);
      for (const student of students) {
        const studentId = student._id || student.id;
        await dbService.createNotification(
          studentId.toString(),
          `📖 New Lesson added in ${cls.name}: "${topic}"`,
          "lesson",
          lesson._id?.toString() || (lesson as any).id
        );
      }
    }

    res.status(201).json(lesson);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/classrooms/:classroomId/lessons", authMiddleware, async (req: any, res) => {
  try {
    const isStudent = req.userRole === "student";
    const list = await dbService.getLessonsOfClassroom(req.params.classroomId, isStudent);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/lessons/:lessonId/ai-summary", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Teachers only." });
  const { chapter, topic, content } = req.body;
  try {
    const summaries = await generateLessonSummary(chapter, topic, content);
    const updated = await dbService.updateLessonAiSummary(req.params.lessonId, summaries);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/lessons/:lessonId", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Teachers only." });
  try {
    await dbService.deleteLesson(req.params.lessonId);
    res.json({ message: "Lesson deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   ASSIGNMENT ROUTES
   ============================================================ */
app.post("/api/classrooms/:classroomId/assignments", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Only teachers." });
  const { title, description, instructions, dateAssigned, dueDate, marks, publishDate } = req.body;
  if (!title || !description || !dueDate) {
    return res.status(400).json({ error: "Title, description, and due date are required." });
  }
  try {
    const asg = await dbService.createAssignment(req.params.classroomId, {
      title,
      description,
      instructions,
      dateAssigned,
      dueDate,
      marks,
      publishDate: publishDate || new Date()
    });

    // Notify connected students
    const cls = await dbService.getClassroomById(req.params.classroomId);
    if (cls) {
      const students = await dbService.getConnectedStudents(req.userId);
      for (const student of students) {
        const studentId = student._id || student.id;
        await dbService.createNotification(
          studentId.toString(),
          `📋 New Assignment posted in ${cls.name}: "${title}"`,
          "assignment",
          asg._id?.toString() || (asg as any).id
        );
      }
    }

    res.status(201).json(asg);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/classrooms/:classroomId/assignments", authMiddleware, async (req: any, res) => {
  try {
    const isStudent = req.userRole === "student";
    const list = await dbService.getAssignmentsOfClassroom(req.params.classroomId, isStudent);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Student submission
app.post("/api/assignments/:asgId/submit", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "student") return res.status(403).json({ error: "Only students submit." });
  const { contentText, fileName, fileUrl } = req.body;
  try {
    const sub = await dbService.submitAssignment(req.params.asgId, req.userId, contentText || "", fileName || "", fileUrl || "");
    res.status(201).json(sub);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Teacher views list of submissions
app.get("/api/assignments/:asgId/submissions", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Unauthorized role." });
  try {
    const list = await dbService.getSubmissionsOfAssignment(req.params.asgId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Student view their submission
app.get("/api/assignments/:asgId/mysubmission", authMiddleware, async (req: any, res) => {
  try {
    const list = await dbService.getSubmissionsOfStudent(req.userId);
    const sub = list.find((s: any) => s.assignment.toString() === req.params.asgId);
    res.json(sub || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Teacher grades submission
app.put("/api/submissions/:subId/grade", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Unauthorized." });
  const { grade, marksObtained, feedback } = req.body;
  try {
    const updated = await dbService.gradeSubmission(req.params.subId, grade, Number(marksObtained), feedback || "");
    if (!updated) return res.status(404).json({ error: "Submission not found." });
    
    // Notify the student
    const studentId = updated.student.toString();
    await dbService.createNotification(
      studentId,
      `💯 Your assignment was graded! Grade: ${grade}`,
      "assignment",
      updated.assignment.toString()
    );

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   ANNOUNCEMENTS ROUTES
   ============================================================ */
app.post("/api/classrooms/:classroomId/announcements", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Teachers only." });
  const { title, body, priority, publishDate } = req.body;
  if (!title || !body) return res.status(400).json({ error: "Title and body are required." });
  try {
    const ann = await dbService.createAnnouncement(req.params.classroomId, {
      title,
      body,
      priority,
      publishDate: publishDate || new Date()
    });

    // Notify connected students
    const cls = await dbService.getClassroomById(req.params.classroomId);
    if (cls) {
      const students = await dbService.getConnectedStudents(req.userId);
      for (const student of students) {
        const studentId = student._id || student.id;
        await dbService.createNotification(
          studentId.toString(),
          `📢 New Announcement in ${cls.name}: "${title}"`,
          "announcement",
          ann._id?.toString() || (ann as any).id
        );
      }
    }

    res.status(201).json(ann);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/classrooms/:classroomId/announcements", authMiddleware, async (req: any, res) => {
  try {
    const isStudent = req.userRole === "student";
    const list = await dbService.getAnnouncementsOfClassroom(req.params.classroomId, isStudent);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   STUDY MATERIAL ROUTES
   ============================================================ */
app.post("/api/classrooms/:classroomId/materials", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Teachers only." });
  const { name, subject, type, size, fileUrl } = req.body;
  if (!name || !subject || !type) return res.status(400).json({ error: "Name, subject, and type are required." });
  try {
    const mat = await dbService.createStudyMaterial(req.params.classroomId, {
      name, subject, type, size, fileUrl
    }, req.userId);

    // Notify connected students
    const cls = await dbService.getClassroomById(req.params.classroomId);
    if (cls) {
      const students = await dbService.getConnectedStudents(req.userId);
      for (const student of students) {
        const studentId = student._id || student.id;
        await dbService.createNotification(
          studentId.toString(),
          `📁 Note/Material added in ${cls.name}: "${name}"`,
          "lesson",
          mat._id?.toString() || (mat as any).id
        );
      }
    }

    res.status(201).json(mat);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/classrooms/:classroomId/materials", authMiddleware, async (req: any, res) => {
  try {
    const list = await dbService.getMaterialsOfClassroom(req.params.classroomId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   DOUBT SESSION ROUTES
   ============================================================ */
app.post("/api/classrooms/:classroomId/doubt-sessions", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Teachers only." });
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "Session title is required." });
  try {
    const session = await dbService.createDoubtSession(req.params.classroomId, title);

    // Notify students
    const cls = await dbService.getClassroomById(req.params.classroomId);
    if (cls) {
      const students = await dbService.getConnectedStudents(req.userId);
      for (const student of students) {
        const studentId = student._id || student.id;
        await dbService.createNotification(
          studentId.toString(),
          `❓ New Q&A Doubt Session opened in ${cls.name}: "${title}"`,
          "join_approved",
          session._id?.toString() || (session as any).id
        );
      }
    }

    res.status(201).json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/doubt-sessions/:sessionId", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Teachers only." });
  const { status } = req.body;
  if (!status || !["open", "closed"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  try {
    const updated = await dbService.updateDoubtSessionStatus(req.params.sessionId, status);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/classrooms/:classroomId/doubt-sessions", authMiddleware, async (req: any, res) => {
  try {
    const list = await dbService.getDoubtSessionsOfClassroom(req.params.classroomId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/doubt-sessions/:sessionId/doubts", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "student") return res.status(403).json({ error: "Students only." });
  const { subject, topic, question } = req.body;
  if (!subject || !topic || !question) return res.status(400).json({ error: "Subject, topic, and question text requested." });
  try {
    const doubt = await dbService.createDoubt(req.params.sessionId, req.userId, { subject, topic, question });
    res.status(201).json(doubt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/doubts/:doubtId/reply", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Teachers only." });
  const { replyText } = req.body;
  if (!replyText) return res.status(400).json({ error: "Reply text is required." });
  try {
    const doubt = await dbService.replyToDoubt(req.params.doubtId, replyText, req.userId);
    res.json(doubt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/doubts/:doubtId/pin", authMiddleware, async (req: any, res) => {
  if (req.userRole !== "teacher") return res.status(403).json({ error: "Teachers only." });
  try {
    const doubt = await dbService.toggleDoubtPinned(req.params.doubtId);
    res.json(doubt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/doubts/:doubtId/resolve", authMiddleware, async (req: any, res) => {
  try {
    const doubt = await dbService.updateDoubtStatus(req.params.doubtId, "resolved");
    res.json(doubt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/doubt-sessions/:sessionId/doubts", authMiddleware, async (req: any, res) => {
  try {
    const list = await dbService.getDoubtsOfSession(req.params.sessionId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/doubts/student", authMiddleware, async (req: any, res) => {
  try {
    const list = await dbService.getDoubtsByStudent(req.userId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   NOTIFICATION ROUTES
   ============================================================ */
app.get("/api/notifications", authMiddleware, async (req: any, res) => {
  try {
    const list = await dbService.getNotificationsOfUser(req.userId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/notifications/read-all", authMiddleware, async (req: any, res) => {
  try {
    await dbService.markNotificationsAllRead(req.userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   FLAGSHIP "WHAT HAPPENED TODAY" TIMELINE FEED
   ============================================================ */
app.get("/api/classrooms/:classroomId/today-diary", authMiddleware, async (req: any, res) => {
  try {
    const isStudent = req.userRole === "student";
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const lessonsList = await dbService.getLessonsOfClassroom(req.params.classroomId, isStudent);
    const asgList = await dbService.getAssignmentsOfClassroom(req.params.classroomId, isStudent);
    const rawAnnList = await dbService.getAnnouncementsOfClassroom(req.params.classroomId, isStudent);
    const matList = await dbService.getMaterialsOfClassroom(req.params.classroomId);

    // Direct filter for content published or created *today*
    const todayLessons = lessonsList.filter((l: any) => new Date(l.publishDate) >= startOfToday);
    const todayAssignments = asgList.filter((a: any) => new Date(a.dateAssigned) >= startOfToday || new Date(a.publishDate) >= startOfToday);
    const todayAnnouncements = rawAnnList.filter((a: any) => new Date(a.publishDate) >= startOfToday);
    const todayMaterials = matList.filter((m: any) => new Date(m.createdAt) >= startOfToday);

    const hasContent = todayLessons.length > 0 || todayAssignments.length > 0 || todayAnnouncements.length > 0 || todayMaterials.length > 0;

    res.json({
      date: startOfToday,
      hasContent,
      lessons: todayLessons,
      assignments: todayAssignments,
      announcements: todayAnnouncements,
      materials: todayMaterials
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/db-status", async (req, res) => {
  res.json({
    connected: isConnectedToMongo,
    type: isConnectedToMongo ? "MongoDB Atlas" : "Local JSON Fallback"
  });
});

app.get("/api/dashboard/stats", authMiddleware, async (req: any, res) => {
  try {
    const stats = await dbService.getDashboardStats(req.userRole, req.userId);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   VITE & STATIC ASSETS HANDLERS
   ============================================================ */
async function startBootstrap() {
  // Connect both DB & Dev Environment
  await connectDatabase();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌍 Digital Class Diary Server running on port ${PORT}`);
  });
}

startBootstrap().catch((err) => {
  console.error("💥 Critical bootstrap error:", err);
});
