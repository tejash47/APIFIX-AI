import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  isConnectedToMongo,
  localDb,
  User,
  Classroom,
  JoinRequest,
  Lesson,
  Assignment,
  Submission,
  Announcement,
  DoubtSession,
  Doubt,
  Notification,
  StudyMaterial
} from "./db.js";

// Helper to generate unique string IDs for the JSON database fallback
function generateId() {
  return new mongoose.Types.ObjectId().toString();
}

// Helper to generate a secure random 6-character Classroom Code (e.g., M8Y2P1)
export function generateClassroomCode(): string {
  const numAndChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let randomCode = "";
  for (let i = 0; i < 6; i++) {
    randomCode += numAndChars.charAt(Math.floor(Math.random() * numAndChars.length));
  }
  return randomCode;
}

export function generateTeacherCode(prefixName: string = "CODE"): string {
  return generateClassroomCode();
}

export const dbService = {
  /* ============================================================
     USER SECTOR
     ============================================================ */
  async createUser(data: any) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const avatarInitials = data.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();

    if (isConnectedToMongo) {
      let teacherCode = "";
      if (data.role === "teacher") {
        teacherCode = generateTeacherCode(data.name);
        // Ensure uniqueness
        let existing = await User.findOne({ teacherCode });
        while (existing) {
          teacherCode = generateTeacherCode(data.name);
          existing = await User.findOne({ teacherCode });
        }
      }

      const newUser = new User({
        name: data.name,
        email: data.email.toLowerCase(),
        password: passwordHash,
        role: data.role,
        avatar: avatarInitials,
        bio: data.bio || "",
        specialization: data.specialization || "",
        classYear: data.classYear || "",
        section: data.section || "",
        rollNo: data.rollNo || "",
        studentId: data.studentId || ""
      });

      if (data.role === "teacher") {
        newUser.teacherCode = teacherCode;
      }

      return await newUser.save();
    } else {
      const db = localDb.read();
      const existing = db.users.find(u => u.email === data.email.toLowerCase());
      if (existing) throw new Error("Email already registered");

      let teacherCode = "";
      if (data.role === "teacher") {
        teacherCode = generateTeacherCode(data.name);
        while (db.users.find(u => u.teacherCode === teacherCode)) {
          teacherCode = generateTeacherCode(data.name);
        }
      }

      const id = generateId();
      const newUser = {
        _id: id,
        id: id,
        name: data.name,
        email: data.email.toLowerCase(),
        password: passwordHash,
        role: data.role,
        avatar: avatarInitials,
        bio: data.bio || "",
        specialization: data.specialization || "",
        classYear: data.classYear || "",
        section: data.section || "",
        rollNo: data.rollNo || "",
        studentId: data.studentId || "",
        teacherCode,
        notificationPref: {
          method: "In-App",
          categories: ["join_request", "lesson", "homework", "assignment", "announcement", "doubt_reply"]
        },
        createdAt: new Date()
      };

      db.users.push(newUser);
      localDb.write(db);
      return newUser;
    }
  },

  async findUserByEmail(email: string) {
    if (isConnectedToMongo) {
      return await User.findOne({ email: email.toLowerCase() });
    } else {
      const db = localDb.read();
      return db.users.find(u => u.email === email.toLowerCase()) || null;
    }
  },

  async findStudentByIdNumber(studentId: string) {
    if (!studentId || studentId.trim() === "") return null;
    const cleanId = studentId.trim();
    if (isConnectedToMongo) {
      return await User.findOne({ role: "student", studentId: cleanId });
    } else {
      const db = localDb.read();
      return db.users.find(u => u.role === "student" && u.studentId && u.studentId.trim() === cleanId) || null;
    }
  },

  async findStudentByRollNo(classYear: string, section: string, rollNo: string) {
    if (!classYear || !section || !rollNo) return null;
    const cleanYear = classYear.trim();
    const cleanSection = section.trim();
    const cleanRoll = rollNo.trim();

    if (isConnectedToMongo) {
      const escapeRegex = (str: string) => str.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
      return await User.findOne({
        role: "student",
        classYear: { $regex: new RegExp(`^${escapeRegex(cleanYear)}$`, "i") },
        section: { $regex: new RegExp(`^${escapeRegex(cleanSection)}$`, "i") },
        rollNo: { $regex: new RegExp(`^${escapeRegex(cleanRoll)}$`, "i") }
      });
    } else {
      const db = localDb.read();
      return db.users.find(u => 
        u.role === "student" && 
        u.classYear && u.classYear.trim().toLowerCase() === cleanYear.toLowerCase() &&
        u.section && u.section.trim().toLowerCase() === cleanSection.toLowerCase() &&
        u.rollNo && u.rollNo.trim().toLowerCase() === cleanRoll.toLowerCase()
      ) || null;
    }
  },

  async findUserById(id: string) {
    if (isConnectedToMongo) {
      return await User.findById(id).select("-password");
    } else {
      const db = localDb.read();
      const user = db.users.find(u => u._id === id);
      if (!user) return null;
      const { password, ...safeUser } = user;
      return safeUser;
    }
  },

  async findUserByCode(code: string) {
    if (isConnectedToMongo) {
      return await User.findOne({ teacherCode: code.toUpperCase() }).select("-password");
    } else {
      const db = localDb.read();
      const user = db.users.find(u => u.teacherCode === code.toUpperCase());
      if (!user) return null;
      const { password, ...safeUser } = user;
      return safeUser;
    }
  },

  async updateProfile(id: string, updates: any) {
    if (isConnectedToMongo) {
      return await User.findByIdAndUpdate(id, { $set: updates }, { new: true }).select("-password");
    } else {
      const db = localDb.read();
      const idx = db.users.findIndex(u => u._id === id);
      if (idx === -1) return null;
      db.users[idx] = { ...db.users[idx], ...updates, updatedAt: new Date() };
      localDb.write(db);
      const { password, ...safeUser } = db.users[idx];
      return safeUser;
    }
  },

  async regenerateTeacherCode(teacherId: string, name: string) {
    const newCode = generateTeacherCode(name);
    if (isConnectedToMongo) {
      return await User.findByIdAndUpdate(teacherId, { $set: { teacherCode: newCode } }, { new: true }).select("-password");
    } else {
      const db = localDb.read();
      const idx = db.users.findIndex(u => u._id === teacherId);
      if (idx === -1) return null;
      db.users[idx].teacherCode = newCode;
      localDb.write(db);
      const { password, ...safeUser } = db.users[idx];
      return safeUser;
    }
  },

  /* ============================================================
     CLASSROOM SECTOR
     ============================================================ */
  async createClassroom(teacherId: string, name: string, subject: string, description: string) {
    if (isConnectedToMongo) {
      let code = generateClassroomCode();
      let existing = await Classroom.findOne({ code });
      while (existing) {
        code = generateClassroomCode();
        existing = await Classroom.findOne({ code });
      }

      const cls = new Classroom({
        name,
        subject,
        description,
        teacher: teacherId,
        code
      });
      return await cls.save();
    } else {
      const db = localDb.read();
      let code = generateClassroomCode();
      while (db.classrooms.some(c => c.code === code)) {
        code = generateClassroomCode();
      }

      const id = generateId();
      const cls = {
        _id: id,
        name,
        subject,
        description,
        teacher: teacherId,
        code,
        createdAt: new Date()
      };
      db.classrooms.push(cls);
      localDb.write(db);
      return cls;
    }
  },

  async getClassroomsByTeacher(teacherId: string) {
    if (isConnectedToMongo) {
      return await Classroom.find({ teacher: teacherId }).sort({ createdAt: -1 });
    } else {
      const db = localDb.read();
      return db.classrooms.filter(c => c.teacher === teacherId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  async getClassroomsByStudent(studentId: string) {
    if (isConnectedToMongo) {
      const requests = await JoinRequest.find({
        student: studentId,
        status: "approved"
      });
      
      const approvedClassrooms = requests.filter(r => r.classroom).map(r => r.classroom.toString());
      const approvedTeachers = requests.filter(r => !r.classroom).map(r => r.teacher.toString());

      return await Classroom.find({
        $or: [
          { _id: { $in: approvedClassrooms } },
          { teacher: { $in: approvedTeachers } }
        ]
      })
      .populate("teacher", "name specialization avatar")
      .sort({ createdAt: -1 });
    } else {
      const db = localDb.read();
      const requests = (db.joinRequests || [])
        .filter(r => r.student === studentId && r.status === "approved");

      const approvedClassrooms = requests.filter(r => r.classroom).map(r => r.classroom);
      const approvedTeachers = requests.filter(r => !r.classroom).map(r => r.teacher);

      return (db.classrooms || [])
        .filter(c => approvedClassrooms.includes(c._id) || approvedTeachers.includes(c.teacher))
        .map(c => ({
          ...c,
          teacher: (db.users || []).find(u => u._id === c.teacher)
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  async getClassroomById(id: string) {
    if (isConnectedToMongo) {
      return await Classroom.findById(id).populate("teacher", "name email specialization avatar");
    } else {
      const db = localDb.read();
      const cls = db.classrooms.find(c => c._id === id);
      if (!cls) return null;
      return {
        ...cls,
        teacher: db.users.find(u => u._id === cls.teacher)
      };
    }
  },

  async deleteClassroom(id: string, teacherId: string) {
    if (isConnectedToMongo) {
      return await Classroom.findOneAndDelete({ _id: id, teacher: teacherId });
    } else {
      const db = localDb.read();
      const idx = db.classrooms.findIndex(c => c._id === id && c.teacher === teacherId);
      if (idx === -1) return null;
      const removed = db.classrooms.splice(idx, 1)[0];
      localDb.write(db);
      return removed;
    }
  },

  async regenerateClassroomCode(classroomId: string, teacherId: string) {
    if (isConnectedToMongo) {
      let code = generateClassroomCode();
      let existing = await Classroom.findOne({ code });
      while (existing) {
        code = generateClassroomCode();
        existing = await Classroom.findOne({ code });
      }
      return await Classroom.findOneAndUpdate(
        { _id: classroomId, teacher: teacherId },
        { $set: { code } },
        { new: true }
      );
    } else {
      const db = localDb.read();
      const idx = db.classrooms.findIndex(c => c._id === classroomId && c.teacher === teacherId);
      if (idx === -1) return null;
      
      let code = generateClassroomCode();
      while (db.classrooms.some(c => c.code === code)) {
        code = generateClassroomCode();
      }
      db.classrooms[idx].code = code;
      localDb.write(db);
      return db.classrooms[idx];
    }
  },

  /* ============================================================
     JOIN REQUEST SECTOR
     ============================================================ */
  async createJoinRequest(studentId: string, classroomId: string) {
    if (isConnectedToMongo) {
      // Find classroom to get teacherId
      const cls = await Classroom.findById(classroomId);
      if (!cls) throw new Error("Classroom not found.");
      const teacherId = cls.teacher.toString();

      // Check for existing
      const existing = await JoinRequest.findOne({ student: studentId, classroom: classroomId });
      if (existing) return existing;

      const req = new JoinRequest({ student: studentId, teacher: teacherId, classroom: classroomId, status: "pending" });
      const saved = await req.save();

      // Create a notification for the teacher
      const student = await User.findById(studentId);
      await this.createNotification(teacherId, `New join request for class ${cls.name} from student: ${student?.name}`, "join_request", saved._id.toString());

      return saved;
    } else {
      const db = localDb.read();
      const cls = db.classrooms.find(c => c._id === classroomId);
      if (!cls) throw new Error("Classroom not found.");
      const teacherId = cls.teacher;

      const existing = db.joinRequests.find(r => r.student === studentId && r.classroom === classroomId);
      if (existing) return existing;

      const id = generateId();
      const req = {
        _id: id,
        student: studentId,
        teacher: teacherId,
        classroom: classroomId,
        status: "pending",
        createdAt: new Date()
      };
      db.joinRequests.push(req);
      localDb.write(db);

      const student = db.users.find(u => u._id === studentId);
      await this.createNotification(teacherId, `New join request for class ${cls.name} from student: ${student?.name}`, "join_request", id);

      return req;
    }
  },

  async getJoinRequestStatus(studentId: string, classroomId: string) {
    if (isConnectedToMongo) {
      return await JoinRequest.findOne({ student: studentId, classroom: classroomId });
    } else {
      const db = localDb.read();
      return db.joinRequests.find(r => r.student === studentId && r.classroom === classroomId) || null;
    }
  },

  async getPendingRequestsForTeacher(teacherId: string, classroomId?: string) {
    if (isConnectedToMongo) {
      const query: any = { teacher: teacherId, status: "pending" };
      if (classroomId) query.classroom = classroomId;
      return await JoinRequest.find(query)
        .populate("student", "name email rollNo classYear studentId avatar")
        .populate("classroom", "name subject code");
    } else {
      const db = localDb.read();
      return db.joinRequests
        .filter(r => r.teacher === teacherId && r.status === "pending" && (!classroomId || r.classroom === classroomId))
        .map(r => ({
          ...r,
          student: db.users.find(u => u._id === r.student),
          classroom: db.classrooms.find(c => c._id === r.classroom)
        }));
    }
  },

  async updateJoinRequestStatus(requestId: string, status: "approved" | "rejected", teacherId: string) {
    if (isConnectedToMongo) {
      const reqObj = await JoinRequest.findOneAndUpdate(
        { _id: requestId, teacher: teacherId },
        { $set: { status } },
        { new: true }
      );
      if (reqObj && status === "approved") {
        const cls = await Classroom.findById(reqObj.classroom);
        const className = cls ? cls.name : "classroom";
        await this.createNotification(
          reqObj.student.toString(),
          `Your join request to classroom "${className}" has been APPROVED!`,
          "join_approved",
          reqObj.classroom.toString()
        );
      }
      return reqObj;
    } else {
      const db = localDb.read();
      const idx = db.joinRequests.findIndex(r => r._id === requestId && r.teacher === teacherId);
      if (idx === -1) return null;
      db.joinRequests[idx].status = status;
      localDb.write(db);

      const reqObj = db.joinRequests[idx];
      if (status === "approved") {
        const cls = db.classrooms.find(c => c._id === reqObj.classroom);
        const className = cls ? cls.name : "classroom";
        await this.createNotification(
          reqObj.student,
          `Your join request to classroom "${className}" has been APPROVED!`,
          "join_approved",
          reqObj.classroom
        );
      }
      return reqObj;
    }
  },

  async getConnectedStudents(teacherId: string, classroomId?: string) {
    if (isConnectedToMongo) {
      const query: any = { teacher: teacherId, status: "approved" };
      if (classroomId) query.classroom = classroomId;
      const approvedIds = await JoinRequest.find(query).distinct("student");
      return await User.find({ _id: { $in: approvedIds } }).select("name email classYear section rollNo studentId avatar");
    } else {
      const db = localDb.read();
      const approvedIds = db.joinRequests
        .filter(r => r.teacher === teacherId && r.status === "approved" && (!classroomId || r.classroom === classroomId))
        .map(r => r.student);
      return db.users
        .filter(u => approvedIds.includes(u._id))
        .map(({ password, ...safeUser }) => safeUser);
    }
  },

  async removeConnectedStudent(studentId: string, teacherId: string, classroomId?: string) {
    if (isConnectedToMongo) {
      const query: any = { student: studentId, teacher: teacherId, status: "approved" };
      if (classroomId) query.classroom = classroomId;
      return await JoinRequest.findOneAndDelete(query);
    } else {
      const db = localDb.read();
      const idx = db.joinRequests.findIndex(r => r.student === studentId && r.teacher === teacherId && r.status === "approved" && (!classroomId || r.classroom === classroomId));
      if (idx === -1) return null;
      const removed = db.joinRequests.splice(idx, 1)[0];
      localDb.write(db);
      return removed;
    }
  },

  async getClassroomByCode(code: string) {
    const cleanCode = (code || "").toUpperCase().trim();
    if (isConnectedToMongo) {
      // 1. First search by direct classroom code
      const cls = await Classroom.findOne({ code: cleanCode }).populate("teacher", "name email specialization avatar");
      if (cls) return cls;

      // 2. Or search by teacher's unique teacherCode
      const teacher = await User.findOne({ role: "teacher", teacherCode: cleanCode });
      if (teacher) {
        // Find the first classroom created by this teacher
        const teacherCls = await Classroom.findOne({ teacher: teacher._id }).populate("teacher", "name email specialization avatar");
        if (teacherCls) return teacherCls;
      }
      return null;
    } else {
      const db = localDb.read();
      // 1. First search by direct classroom code
      const cls = (db.classrooms || []).find(c => c.code === cleanCode);
      if (cls) {
        return {
          ...cls,
          teacher: (db.users || []).find(u => u._id === cls.teacher)
        };
      }

      // 2. Or search by teacher's unique teacherCode
      const teacher = (db.users || []).find(u => u.role === "teacher" && u.teacherCode === cleanCode);
      if (teacher) {
        // Find the first classroom created by this teacher
        const teacherCls = (db.classrooms || []).find(c => c.teacher === teacher._id);
        if (teacherCls) {
          return {
            ...teacherCls,
            teacher
          };
        }
      }
      return null;
    }
  },

  /* ============================================================
     LESSON SECTOR
     ============================================================ */
  async createLesson(classroomId: string, data: any) {
    if (isConnectedToMongo) {
      const lesson = new Lesson({
        classroom: classroomId,
        chapter: data.chapter,
        topic: data.topic,
        content: data.content,
        objectives: data.objectives || "",
        concepts: data.concepts || [],
        notes: data.notes || "",
        publishDate: data.publishDate ? new Date(data.publishDate) : new Date(),
        aiSummaries: data.aiSummaries || null
      });
      const saved = await lesson.save();
      
      // Notify classroom students (lazy query inside service or route)
      return saved;
    } else {
      const db = localDb.read();
      const id = generateId();
      const lesson = {
        _id: id,
        classroom: classroomId,
        chapter: data.chapter,
        topic: data.topic,
        content: data.content,
        objectives: data.objectives || "",
        concepts: data.concepts || [],
        notes: data.notes || "",
        publishDate: data.publishDate ? new Date(data.publishDate) : new Date(),
        aiSummaries: data.aiSummaries || null,
        createdAt: new Date()
      };
      db.lessons.push(lesson);
      localDb.write(db);
      return lesson;
    }
  },

  async getLessonsOfClassroom(classroomId: string, isStudent: boolean = false) {
    const filter: any = { classroom: classroomId };
    if (isStudent) {
      // Students should only see lessons whose publish date is past or equal to now!
      filter.publishDate = { $lte: new Date() };
    }

    if (isConnectedToMongo) {
      return await Lesson.find(filter).sort({ publishDate: -1 });
    } else {
      const db = localDb.read();
      let res = db.lessons.filter(l => l.classroom === classroomId);
      if (isStudent) {
        const now = new Date().getTime();
        res = res.filter(l => new Date(l.publishDate).getTime() <= now);
      }
      return res.sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());
    }
  },

  async updateLessonAiSummary(lessonId: string, aiSummaries: any) {
    if (isConnectedToMongo) {
      return await Lesson.findByIdAndUpdate(lessonId, { $set: { aiSummaries } }, { new: true });
    } else {
      const db = localDb.read();
      const idx = db.lessons.findIndex(l => l._id === lessonId);
      if (idx === -1) return null;
      db.lessons[idx].aiSummaries = aiSummaries;
      localDb.write(db);
      return db.lessons[idx];
    }
  },

  async deleteLesson(lessonId: string) {
    if (isConnectedToMongo) {
      return await Lesson.findByIdAndDelete(lessonId);
    } else {
      const db = localDb.read();
      const idx = db.lessons.findIndex(l => l._id === lessonId);
      if (idx === -1) return null;
      const removed = db.lessons.splice(idx, 1)[0];
      localDb.write(db);
      return removed;
    }
  },

  /* ============================================================
     ASSIGNMENT & SUBMISSIONS SECTOR
     ============================================================ */
  async createAssignment(classroomId: string, data: any) {
    if (isConnectedToMongo) {
      const asg = new Assignment({
        classroom: classroomId,
        title: data.title,
        description: data.description,
        instructions: data.instructions || "",
        dateAssigned: data.dateAssigned ? new Date(data.dateAssigned) : new Date(),
        dueDate: new Date(data.dueDate),
        marks: data.marks || 100,
        publishDate: data.publishDate ? new Date(data.publishDate) : new Date()
      });
      return await asg.save();
    } else {
      const db = localDb.read();
      const id = generateId();
      const asg = {
        _id: id,
        classroom: classroomId,
        title: data.title,
        description: data.description,
        instructions: data.instructions || "",
        dateAssigned: data.dateAssigned ? new Date(data.dateAssigned) : new Date(),
        dueDate: new Date(data.dueDate),
        marks: Number(data.marks) || 100,
        publishDate: data.publishDate ? new Date(data.publishDate) : new Date(),
        createdAt: new Date()
      };
      db.assignments.push(asg);
      localDb.write(db);
      return asg;
    }
  },

  async getAssignmentsOfClassroom(classroomId: string, isStudent: boolean = false) {
    const filter: any = { classroom: classroomId };
    if (isStudent) {
      filter.publishDate = { $lte: new Date() };
    }

    if (isConnectedToMongo) {
      return await Assignment.find(filter).sort({ dueDate: 1 });
    } else {
      const db = localDb.read();
      let res = db.assignments.filter(a => a.classroom === classroomId);
      if (isStudent) {
        const now = new Date().getTime();
        res = res.filter(a => new Date(a.publishDate).getTime() <= now);
      }
      return res.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }
  },

  async submitAssignment(asgId: string, studentId: string, text: string, fileName: string, fileUrl: string) {
    if (isConnectedToMongo) {
      // Find if already submitted
      let sub = await Submission.findOne({ assignment: asgId, student: studentId });
      if (sub) {
        sub.contentText = text;
        sub.fileName = fileName;
        sub.fileUrl = fileUrl;
        sub.submittedAt = new Date();
        return await sub.save();
      } else {
        sub = new Submission({
          assignment: asgId,
          student: studentId,
          contentText: text,
          fileName,
          fileUrl
        });
        return await sub.save();
      }
    } else {
      const db = localDb.read();
      const idx = db.submissions.findIndex(s => s.assignment === asgId && s.student === studentId);
      if (idx !== -1) {
        db.submissions[idx].contentText = text;
        db.submissions[idx].fileName = fileName;
        db.submissions[idx].fileUrl = fileUrl;
        db.submissions[idx].submittedAt = new Date();
        localDb.write(db);
        return db.submissions[idx];
      } else {
        const id = generateId();
        const sub = {
          _id: id,
          assignment: asgId,
          student: studentId,
          contentText: text,
          fileName,
          fileUrl,
          grade: "",
          feedback: "",
          submittedAt: new Date()
        };
        db.submissions.push(sub);
        localDb.write(db);
        return sub;
      }
    }
  },

  async getSubmissionsOfAssignment(asgId: string) {
    if (isConnectedToMongo) {
      return await Submission.find({ assignment: asgId }).populate("student", "name rollNo studentId classYear avatar");
    } else {
      const db = localDb.read();
      return db.submissions
        .filter(s => s.assignment === asgId)
        .map(s => ({
          ...s,
          student: db.users.find(u => u._id === s.student)
        }));
    }
  },

  async getSubmissionsOfStudent(studentId: string) {
    if (isConnectedToMongo) {
      return await Submission.find({ student: studentId });
    } else {
      const db = localDb.read();
      return db.submissions.filter(s => s.student === studentId);
    }
  },

  async gradeSubmission(subId: string, grade: string, marksObtained: number, feedback: string) {
    if (isConnectedToMongo) {
      return await Submission.findByIdAndUpdate(subId, {
        $set: { grade, marksObtained, feedback }
      }, { new: true });
    } else {
      const db = localDb.read();
      const idx = db.submissions.findIndex(s => s._id === subId);
      if (idx === -1) return null;
      db.submissions[idx].grade = grade;
      db.submissions[idx].marksObtained = marksObtained;
      db.submissions[idx].feedback = feedback;
      localDb.write(db);
      return db.submissions[idx];
    }
  },

  /* ============================================================
     ANNOUNCEMENT SECTOR
     ============================================================ */
  async createAnnouncement(classroomId: string, data: any) {
    if (isConnectedToMongo) {
      const ann = new Announcement({
        classroom: classroomId,
        title: data.title,
        body: data.body,
        priority: data.priority || "",
        publishDate: data.publishDate ? new Date(data.publishDate) : new Date()
      });
      return await ann.save();
    } else {
      const db = localDb.read();
      const id = generateId();
      const ann = {
        _id: id,
        classroom: classroomId,
        title: data.title,
        body: data.body,
        priority: data.priority || "",
        publishDate: data.publishDate ? new Date(data.publishDate) : new Date(),
        createdAt: new Date()
      };
      db.announcements.push(ann);
      localDb.write(db);
      return ann;
    }
  },

  async getAnnouncementsOfClassroom(classroomId: string, isStudent: boolean = false) {
    const filter: any = { classroom: classroomId };
    if (isStudent) {
      filter.publishDate = { $lte: new Date() };
    }

    if (isConnectedToMongo) {
      return await Announcement.find(filter).sort({ publishDate: -1 });
    } else {
      const db = localDb.read();
      let res = db.announcements.filter(a => a.classroom === classroomId);
      if (isStudent) {
        const now = new Date().getTime();
        res = res.filter(a => new Date(a.publishDate).getTime() <= now);
      }
      return res.sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());
    }
  },

  /* ============================================================
     STUDY MATERIAL SECTOR
     ============================================================ */
  async createStudyMaterial(classroomId: string, data: any, teacherId: string) {
    if (isConnectedToMongo) {
      const mat = new StudyMaterial({
        classroom: classroomId,
        name: data.name,
        subject: data.subject,
        type: data.type,
        size: data.size || "1.0 MB",
        fileUrl: data.fileUrl || "",
        uploadedBy: teacherId
      });
      return await mat.save();
    } else {
      const db = localDb.read();
      const id = generateId();
      const mat = {
        _id: id,
        classroom: classroomId,
        name: data.name,
        subject: data.subject,
        type: data.type,
        size: data.size || "1.0 MB",
        fileUrl: data.fileUrl || "",
        uploadedBy: teacherId,
        createdAt: new Date()
      };
      db.studyMaterials.push(mat);
      localDb.write(db);
      return mat;
    }
  },

  async getMaterialsOfClassroom(classroomId: string) {
    if (isConnectedToMongo) {
      return await StudyMaterial.find({ classroom: classroomId }).sort({ createdAt: -1 });
    } else {
      const db = localDb.read();
      return db.studyMaterials.filter(m => m.classroom === classroomId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  /* ============================================================
     DOUBT SYSTEM SECTOR
     ============================================================ */
  async createDoubtSession(classroomId: string, title: string) {
    if (isConnectedToMongo) {
      const session = new DoubtSession({
        classroom: classroomId,
        title,
        status: "open"
      });
      return await session.save();
    } else {
      const db = localDb.read();
      const id = generateId();
      const session = {
        _id: id,
        classroom: classroomId,
        title,
        status: "open",
        createdAt: new Date()
      };
      db.doubtSessions.push(session);
      localDb.write(db);
      return session;
    }
  },

  async updateDoubtSessionStatus(sessionId: string, status: "open" | "closed") {
    if (isConnectedToMongo) {
      return await DoubtSession.findByIdAndUpdate(sessionId, { $set: { status } }, { new: true });
    } else {
      const db = localDb.read();
      const idx = db.doubtSessions.findIndex(s => s._id === sessionId);
      if (idx === -1) return null;
      db.doubtSessions[idx].status = status;
      localDb.write(db);
      return db.doubtSessions[idx];
    }
  },

  async getDoubtSessionsOfClassroom(classroomId: string) {
    if (isConnectedToMongo) {
      return await DoubtSession.find({ classroom: classroomId }).sort({ createdAt: -1 });
    } else {
      const db = localDb.read();
      return db.doubtSessions.filter(s => s.classroom === classroomId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  async createDoubt(sessionId: string, studentId: string, data: any) {
    if (isConnectedToMongo) {
      const doubt = new Doubt({
        doubtSession: sessionId,
        student: studentId,
        subject: data.subject,
        topic: data.topic,
        question: data.question,
        status: "pending"
      });
      return await doubt.save();
    } else {
      const db = localDb.read();
      const id = generateId();
      const doubt = {
        _id: id,
        doubtSession: sessionId,
        student: studentId,
        subject: data.subject,
        topic: data.topic,
        question: data.question,
        isPinned: false,
        status: "pending",
        reply: "",
        replyBy: null,
        replyAt: null,
        createdAt: new Date()
      };
      db.doubts.push(doubt);
      localDb.write(db);
      return doubt;
    }
  },

  async replyToDoubt(doubtId: string, replyText: string, teacherId: string) {
    if (isConnectedToMongo) {
      const doubt = await Doubt.findByIdAndUpdate(doubtId, {
        $set: {
          reply: replyText,
          replyBy: teacherId,
          replyAt: new Date(),
          status: "answered"
        }
      }, { new: true });
      if (doubt) {
        await this.createNotification(
          doubt.student.toString(),
          `Teacher replied to your doubt on topic: ${doubt.topic}`,
          "doubt_reply",
          doubtId
        );
      }
      return doubt;
    } else {
      const db = localDb.read();
      const idx = db.doubts.findIndex(d => d._id === doubtId);
      if (idx === -1) return null;
      db.doubts[idx].reply = replyText;
      db.doubts[idx].replyBy = teacherId;
      db.doubts[idx].replyAt = new Date();
      db.doubts[idx].status = "answered";
      localDb.write(db);

      const doubt = db.doubts[idx];
      await this.createNotification(
        doubt.student,
        `Teacher replied to your doubt on topic: ${doubt.topic}`,
        "doubt_reply",
        doubtId
      );
      return doubt;
    }
  },

  async toggleDoubtPinned(doubtId: string) {
    if (isConnectedToMongo) {
      const doubt = await Doubt.findById(doubtId);
      if (!doubt) return null;
      doubt.isPinned = !doubt.isPinned;
      return await doubt.save();
    } else {
      const db = localDb.read();
      const idx = db.doubts.findIndex(d => d._id === doubtId);
      if (idx === -1) return null;
      db.doubts[idx].isPinned = !db.doubts[idx].isPinned;
      localDb.write(db);
      return db.doubts[idx];
    }
  },

  async updateDoubtStatus(doubtId: string, status: "pending" | "answered" | "resolved") {
    if (isConnectedToMongo) {
      return await Doubt.findByIdAndUpdate(doubtId, { $set: { status } }, { new: true });
    } else {
      const db = localDb.read();
      const idx = db.doubts.findIndex(d => d._id === doubtId);
      if (idx === -1) return null;
      db.doubts[idx].status = status;
      localDb.write(db);
      return db.doubts[idx];
    }
  },

  async getDoubtsOfSession(sessionId: string) {
    if (isConnectedToMongo) {
      return await Doubt.find({ doubtSession: sessionId })
        .populate("student", "name rollNo studentId classYear avatar")
        .sort({ isPinned: -1, createdAt: 1 });
    } else {
      const db = localDb.read();
      return db.doubts
        .filter(d => d.doubtSession === sessionId)
        .map(d => ({
          ...d,
          student: db.users.find(u => u._id === d.student)
        }))
        .sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
    }
  },

  async getDoubtsByStudent(studentId: string) {
    if (isConnectedToMongo) {
      return await Doubt.find({ student: studentId }).sort({ createdAt: -1 });
    } else {
      const db = localDb.read();
      return db.doubts.filter(d => d.student === studentId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  /* ============================================================
     NOTIFICATION SECTOR
     ============================================================ */
  async createNotification(recipientId: string, text: string, type: string, relatedId: string = "") {
    if (isConnectedToMongo) {
      const notif = new Notification({
        recipient: recipientId,
        text,
        type,
        relatedId
      });
      return await notif.save();
    } else {
      const db = localDb.read();
      const id = generateId();
      const notif = {
        _id: id,
        recipient: recipientId,
        text,
        type,
        relatedId,
        read: false,
        createdAt: new Date()
      };
      db.notifications.push(notif);
      localDb.write(db);
      return notif;
    }
  },

  async getNotificationsOfUser(userId: string) {
    if (isConnectedToMongo) {
      return await Notification.find({ recipient: userId }).sort({ createdAt: -1 });
    } else {
      const db = localDb.read();
      return db.notifications
        .filter(n => n.recipient === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  async markNotificationsAllRead(userId: string) {
    if (isConnectedToMongo) {
      return await Notification.updateMany({ recipient: userId }, { $set: { read: true } });
    } else {
      const db = localDb.read();
      db.notifications.forEach(n => {
        if (n.recipient === userId) n.read = true;
      });
      localDb.write(db);
      return { modifiedCount: db.notifications.length };
    }
  },

  async getDashboardStats(role: string, userId: string) {
    if (role === "teacher") {
      let classroomsList: any[] = [];
      let pendingRequestsCount = 0;
      let unresolvedDoubtsCount = 0;
      let announcementsCount = 0;

      if (isConnectedToMongo) {
        classroomsList = await Classroom.find({ teacher: userId });
        const classIds = classroomsList.map(c => c._id);

        pendingRequestsCount = await JoinRequest.countDocuments({ teacher: userId, status: "pending" });

        const sessions = await DoubtSession.find({ classroom: { $in: classIds } });
        const sIds = sessions.map(s => s._id);
        unresolvedDoubtsCount = await Doubt.countDocuments({ doubtSession: { $in: sIds }, status: "pending" });

        announcementsCount = await Announcement.countDocuments({ classroom: { $in: classIds } });
      } else {
        const db = localDb.read();
        classroomsList = db.classrooms.filter(c => c.teacher === userId);
        const classIds = classroomsList.map(c => c._id);

        pendingRequestsCount = db.joinRequests.filter(r => r.teacher === userId && r.status === "pending").length;

        const sessionIds = db.doubtSessions.filter(s => classIds.includes(s.classroom)).map(s => s._id);
        unresolvedDoubtsCount = db.doubts.filter(d => sessionIds.includes(d.doubtSession) && d.status === "pending").length;

        announcementsCount = db.announcements.filter(a => classIds.includes(a.classroom)).length;
      }

      // Classroom resources for teacher chart (e.g. materials & lessons in each classroom)
      const classroomStats = [];
      for (const classroom of classroomsList) {
        let lessonCount = 0;
        let materialCount = 0;
        let assignmentCount = 0;
        const cIdStr = classroom._id.toString();

        if (isConnectedToMongo) {
          lessonCount = await Lesson.countDocuments({ classroom: classroom._id });
          materialCount = await StudyMaterial.countDocuments({ classroom: classroom._id });
          assignmentCount = await Assignment.countDocuments({ classroom: classroom._id });
        } else {
          const db = localDb.read();
          lessonCount = db.lessons.filter(l => l.classroom === cIdStr).length;
          materialCount = db.studyMaterials.filter(m => m.classroom === cIdStr).length;
          assignmentCount = db.assignments.filter(a => a.classroom === cIdStr).length;
        }

        classroomStats.push({
          classroomName: classroom.name,
          lessons: lessonCount,
          materials: materialCount,
          assignments: assignmentCount,
        });
      }

      return {
        role,
        classroomsCount: classroomsList.length,
        pendingRequestsCount,
        unresolvedDoubtsCount,
        announcementsCount,
        classroomStats
      };

    } else {
      // Student Stats
      let classroomsList: any[] = [];
      let pendingSubmissionsCount = 0;
      let submissionsCount = 0;
      let openDoubtsCount = 0;

      if (isConnectedToMongo) {
        // Enrolled classrooms
        const requests = await JoinRequest.find({
          student: userId,
          status: "approved"
        });
        const approvedClassrooms = requests.filter(r => r.classroom).map(r => r.classroom.toString());
        const approvedTeachers = requests.filter(r => !r.classroom).map(r => r.teacher.toString());

        classroomsList = await Classroom.find({
          $or: [
            { _id: { $in: approvedClassrooms } },
            { teacher: { $in: approvedTeachers } }
          ]
        });

        const classIds = classroomsList.map(c => c._id);

        // Submissions & Pending Submissions
        const studentSubmissions = await Submission.find({ student: userId });
        const submittedAsgIds = studentSubmissions.map(s => s.assignment.toString());

        const totalAssignments = await Assignment.find({ classroom: { $in: classIds } });
        
        submissionsCount = studentSubmissions.length;
        pendingSubmissionsCount = totalAssignments.filter(a => !submittedAsgIds.includes(a._id.toString())).length;

        openDoubtsCount = await Doubt.countDocuments({ student: userId, status: "pending" });
      } else {
        const db = localDb.read();
        const requests = (db.joinRequests || []).filter(r => r.student === userId && r.status === "approved");
        const approvedClassrooms = requests.filter(r => r.classroom).map(r => r.classroom);
        const approvedTeachers = requests.filter(r => !r.classroom).map(r => r.teacher);

        classroomsList = (db.classrooms || []).filter(c => approvedClassrooms.includes(c._id) || approvedTeachers.includes(c.teacher));
        const classIds = classroomsList.map(c => c._id);

        const studentSubmissions = (db.submissions || []).filter(s => s.student === userId);
        const submittedAsgIds = studentSubmissions.map(s => s.assignment);

        const totalAssignments = (db.assignments || []).filter(a => classIds.includes(a.classroom));

        submissionsCount = studentSubmissions.length;
        pendingSubmissionsCount = totalAssignments.filter(a => !submittedAsgIds.includes(a._id)).length;

        openDoubtsCount = (db.doubts || []).filter(d => d.student === userId && d.status === "pending").length;
      }

      // Classroom resources for student chart (e.g. lessons/materials per classroom)
      const classroomStats = [];
      const db = localDb.read();
      for (const classroom of classroomsList) {
        let lessonCount = 0;
        let materialCount = 0;
        let assignmentCount = 0;
        let hasSubmittedCount = 0;
        const cIdStr = classroom._id.toString();

        if (isConnectedToMongo) {
          lessonCount = await Lesson.countDocuments({ classroom: classroom._id });
          materialCount = await StudyMaterial.countDocuments({ classroom: classroom._id });
          assignmentCount = await Assignment.countDocuments({ classroom: classroom._id });
          
          const asgs = await Assignment.find({ classroom: classroom._id });
          const asgIds = asgs.map(a => a._id);
          hasSubmittedCount = await Submission.countDocuments({ student: userId, assignment: { $in: asgIds } });
        } else {
          lessonCount = db.lessons.filter(l => l.classroom === cIdStr).length;
          materialCount = db.studyMaterials.filter(m => m.classroom === cIdStr).length;
          assignmentCount = db.assignments.filter(a => a.classroom === cIdStr).length;

          const asgIds = db.assignments.filter(a => a.classroom === cIdStr).map(a => a._id);
          hasSubmittedCount = db.submissions.filter(s => s.student === userId && asgIds.includes(s.assignment)).length;
        }

        classroomStats.push({
          classroomName: classroom.name,
          lessons: lessonCount,
          materials: materialCount,
          assignments: assignmentCount,
          submitted: hasSubmittedCount,
        });
      }

      return {
        role,
        classroomsCount: classroomsList.length,
        pendingSubmissionsCount,
        submissionsCount,
        openDoubtsCount,
        classroomStats
      };
    }
  }
};
