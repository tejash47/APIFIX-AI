export interface User {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  role: "teacher" | "student";
  avatar: string;
  bio?: string;
  specialization?: string;
  teacherCode?: string;
  classYear?: string;
  section?: string;
  rollNo?: string;
  studentId?: string;
  notificationPref?: {
    method: "In-App" | "Email" | "Both" | "Disabled";
    categories: string[];
  };
  createdAt?: string;
}

export interface Classroom {
  _id: string;
  name: string;
  subject: string;
  description: string;
  teacher: string | User;
  code?: string;
  createdAt: string;
}

export interface JoinRequest {
  _id: string;
  student: string | User;
  teacher: string | User;
  classroom?: string | Classroom;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface MultilingualSummary {
  en: { summary: string; keyPoints: string[]; concepts: string[] };
  hi: { summary: string; keyPoints: string[]; concepts: string[] };
  te: { summary: string; keyPoints: string[]; concepts: string[] };
}

export interface Lesson {
  _id: string;
  classroom: string;
  chapter: string;
  topic: string;
  content: string;
  objectives: string;
  concepts: string[];
  notes: string;
  publishDate: string;
  aiSummaries?: MultilingualSummary;
  createdAt: string;
}

export interface Assignment {
  _id: string;
  classroom: string;
  title: string;
  description: string;
  instructions?: string;
  dateAssigned: string;
  dueDate: string;
  marks: number;
  publishDate: string;
  createdAt: string;
}

export interface Submission {
  _id: string;
  assignment: string;
  student: string | User;
  contentText: string;
  fileName: string;
  fileUrl: string;
  submittedAt: string;
  grade?: string;
  marksObtained?: number;
  feedback?: string;
}

export interface Announcement {
  _id: string;
  classroom: string;
  title: string;
  body: string;
  priority: "" | "urgent" | "info";
  publishDate: string;
  createdAt: string;
}

export interface StudyMaterial {
  _id: string;
  classroom: string;
  name: string;
  subject: string;
  type: "PDF" | "Notes" | "PPT" | "Image";
  size: string;
  fileUrl: string;
  uploadedBy: string;
  createdAt: string;
}

export interface DoubtSession {
  _id: string;
  classroom: string;
  title: string;
  status: "open" | "closed";
  createdAt: string;
}

export interface Doubt {
  _id: string;
  doubtSession: string;
  student: string | User;
  subject: string;
  topic: string;
  question: string;
  isPinned: boolean;
  status: "pending" | "answered" | "resolved";
  reply: string;
  replyBy?: string | User;
  replyAt?: string;
  createdAt: string;
}

export interface Notification {
  _id: string;
  recipient: string;
  text: string;
  type: "join_request" | "join_approved" | "lesson" | "homework" | "assignment" | "announcement" | "doubt_reply";
  relatedId?: string;
  read: boolean;
  createdAt: string;
}
