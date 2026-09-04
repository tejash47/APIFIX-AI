import mongoose from "mongoose";
import fs from "fs";
import path from "path";

// Initialize environment variables manually if helpful in development
import dotenv from "dotenv";
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is required");
}

export let isConnectedToMongo = false;

// Initialize Database connection
export async function connectDatabase() {
  if (!MONGODB_URI) {
    console.warn("⚠️ MONGODB_URI environment variable is not defined. Falling back to local JSON database storage.");
    return false;
  }
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Quick 5-second timeout for graceful local fallback
    });
    isConnectedToMongo = true;
    console.log("🚀 Connected to MongoDB Atlas successfully.");
    return true;
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB Atlas. Falling back to local JSON database storage. Error:", error);
    isConnectedToMongo = false;
    return false;
  }
}

/* ============================================================
   MONGOOSE MODELS Definition
   ============================================================ */
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["teacher", "student"], required: true },
  avatar: { type: String, default: "" },
  bio: { type: String, default: "" },
  // Teacher profiles properties
  specialization: { type: String, default: "" },
  teacherCode: { type: String, default: "" }, // Unique automatically generated code
  // Student profiles properties
  classYear: { type: String, default: "" },
  section: { type: String, default: "" },
  rollNo: { type: String, default: "" },
  studentId: { type: String, default: "" },
  notificationPref: {
    method: { type: String, enum: ["In-App", "Email", "Both", "Disabled"], default: "In-App" },
    categories: { type: [String], default: ["join_request", "lesson", "homework", "assignment", "announcement", "doubt_reply"] }
  },
  createdAt: { type: Date, default: Date.now }
});

const ClassroomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subject: { type: String, required: true },
  description: { type: String, default: "" },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  code: { type: String, unique: true, required: true },
  createdAt: { type: Date, default: Date.now }
});

const JoinRequestSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const LessonSchema = new mongoose.Schema({
  classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
  chapter: { type: String, required: true },
  topic: { type: String, required: true },
  content: { type: String, required: true },
  objectives: { type: String, default: "" },
  concepts: { type: [String], default: [] },
  notes: { type: String, default: "" },
  publishDate: { type: Date, default: Date.now }, // Scheduled publishing
  aiSummaries: {
    en: { type: Map, of: mongoose.Schema.Types.Mixed },
    te: { type: Map, of: mongoose.Schema.Types.Mixed },
    hi: { type: Map, of: mongoose.Schema.Types.Mixed }
  },
  createdAt: { type: Date, default: Date.now }
});

const AssignmentSchema = new mongoose.Schema({
  classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  instructions: { type: String, default: "" },
  dateAssigned: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  marks: { type: Number, default: 100 },
  publishDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const SubmissionSchema = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  contentText: { type: String, default: "" },
  fileName: { type: String, default: "" },
  fileUrl: { type: String, default: "" },
  submittedAt: { type: Date, default: Date.now },
  grade: { type: String, default: "" },
  marksObtained: { type: Number },
  feedback: { type: String, default: "" }
});

const AnnouncementSchema = new mongoose.Schema({
  classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  priority: { type: String, default: "" }, // 'urgent', 'info', or ''
  publishDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const DoubtSessionSchema = new mongoose.Schema({
  classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
  title: { type: String, required: true },
  status: { type: String, enum: ["open", "closed"], default: "open" },
  createdAt: { type: Date, default: Date.now }
});

const DoubtSchema = new mongoose.Schema({
  doubtSession: { type: mongoose.Schema.Types.ObjectId, ref: "DoubtSession", required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  subject: { type: String, required: true },
  topic: { type: String, required: true },
  question: { type: String, required: true },
  isPinned: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "answered", "resolved"], default: "pending" },
  reply: { type: String, default: "" },
  replyBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  replyAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const NotificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true },
  type: { type: String, required: true }, // 'join_request', 'join_approved', 'new_lesson', 'new_homework', 'new_assignment', 'new_announcement', 'doubt_reply'
  relatedId: { type: String, default: "" },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const StudyMaterialSchema = new mongoose.Schema({
  classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
  name: { type: String, required: true },
  subject: { type: String, required: true },
  type: { type: String, enum: ["PDF", "Notes", "PPT", "Image"], required: true },
  size: { type: String, default: "0 MB" },
  fileUrl: { type: String, default: "" },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model("User", UserSchema);
export const Classroom = mongoose.model("Classroom", ClassroomSchema);
export const JoinRequest = mongoose.model("JoinRequest", JoinRequestSchema);
export const Lesson = mongoose.model("Lesson", LessonSchema);
export const Assignment = mongoose.model("Assignment", AssignmentSchema);
export const Submission = mongoose.model("Submission", SubmissionSchema);
export const Announcement = mongoose.model("Announcement", AnnouncementSchema);
export const DoubtSession = mongoose.model("DoubtSession", DoubtSessionSchema);
export const Doubt = mongoose.model("Doubt", DoubtSchema);
export const Notification = mongoose.model("Notification", NotificationSchema);
export const StudyMaterial = mongoose.model("StudyMaterial", StudyMaterialSchema);

/* ============================================================
   LOCAL JSON DB fallback storage structure
   ============================================================ */
const JSON_DB_FILE = path.join(process.cwd(), "local_db.json");

interface LocalData {
  users: any[];
  classrooms: any[];
  joinRequests: any[];
  lessons: any[];
  assignments: any[];
  submissions: any[];
  announcements: any[];
  doubtSessions: any[];
  doubts: any[];
  notifications: any[];
  studyMaterials: any[];
}

const defaultLocalData: LocalData = {
  users: [],
  classrooms: [],
  joinRequests: [],
  lessons: [],
  assignments: [],
  submissions: [],
  announcements: [],
  doubtSessions: [],
  doubts: [],
  notifications: [],
  studyMaterials: []
};

export const localDb = {
  read(): LocalData {
    try {
      if (!fs.existsSync(JSON_DB_FILE)) {
        fs.writeFileSync(JSON_DB_FILE, JSON.stringify(defaultLocalData, null, 2), "utf-8");
        return defaultLocalData;
      }
      const raw = fs.readFileSync(JSON_DB_FILE, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      console.error("Local JSON db read error:", e);
      return defaultLocalData;
    }
  },

  write(data: LocalData) {
    try {
      fs.writeFileSync(JSON_DB_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("Local JSON db write error:", e);
    }
  }
};
