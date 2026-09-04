import React, { useState, useEffect } from "react";
import { User, Classroom, Lesson, Assignment, Submission, DoubtSession, Doubt, Announcement, StudyMaterial, Notification } from "../types";
import { api } from "../api";
import { 
  Users, Award, Calendar, BookOpen, FileText, HelpCircle, Bell, 
  FolderOpen, Plus, PlusCircle, CheckCircle, Trash2, ArrowUpRight, 
  X, AlertTriangle, MessageSquare, Pin, Check, Star, RefreshCw
} from "lucide-react";

interface ClassroomViewProps {
  user: User;
  onNavigate: (view: string) => void;
  classroom: Classroom;
  isDark: boolean;
}

export function ClassroomView({ user, onNavigate, classroom, isDark }: ClassroomViewProps) {
  const isTeacher = user.role === "teacher";
  const [activeTab, setActiveViewTab] = useState<"timeline" | "lessons" | "assignments" | "doubts" | "materials_announcements">("timeline");
  
  // Database States
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<{ [asgId: string]: Submission | null }>({}); // For students
  const [activeDoubtSession, setActiveDoubtSession] = useState<DoubtSession | null>(null);
  const [doubtSessions, setDoubtSessions] = useState<DoubtSession[]>([]);
  const [doubts, setDoubts] = useState<Doubt[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);

  // Flagship "What Happened Today" state
  const [todayDiary, setTodayDiary] = useState<{
    hasContent: boolean;
    lessons: Lesson[];
    assignments: Assignment[];
    announcements: Announcement[];
    materials: StudyMaterial[];
  } | null>(null);

  // Administrative / Classroom Settings states
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [connectedStudents, setConnectedStudents] = useState<User[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  // Form states
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [newLesson, setNewLesson] = useState({ chapter: "", topic: "", content: "", objectives: "", concepts: "", notes: "", publishDate: "" });
  
  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [newAsg, setNewAsg] = useState({ title: "", description: "", instructions: "", dueDate: "", marks: 100, publishDate: "" });
  
  const [studentSubmissions, setStudentSubmissions] = useState<{ [asgId: string]: { txt: string; file: string } }>({});
  const [gradedSubmission, setGradedSubmission] = useState<{ subId: string; marks: number; grade: string; feedback: string } | null>(null);
  const [viewSubmissionsAsgId, setViewSubmissionsAsgId] = useState<string | null>(null);
  const [allSubmissionsList, setAllSubmissionsList] = useState<Submission[]>([]);

  const [newDoubt, setNewDoubt] = useState({ subject: classroom.subject, topic: "", question: "" });
  const [doubtReplies, setDoubtReplies] = useState<{ [doubtId: string]: string }>({});
  
  const [showAddAnn, setShowAddAnn] = useState(false);
  const [newAnn, setNewAnn] = useState({ title: "", body: "", priority: "" as any, publishDate: "" });

  const [showAddMat, setShowAddMat] = useState(false);
  const [newMat, setNewMat] = useState({ name: "", type: "PDF" as any, referenceUrl: "" });

  // Translation active states per lesson ID: defaults to 'en'
  const [selectedLang, setSelectedLang] = useState<{ [lessonId: string]: "en" | "hi" | "te" }>({});
  const [generatingSummaryId, setGeneratingSummaryId] = useState<string | null>(null);

  useEffect(() => {
    loadClassroomContent();
    if (isTeacher) {
      loadValidationRequestsAndStudents();
    }
  }, [classroom._id]);

  const loadClassroomContent = async () => {
    try {
      const lList = await api.listLessons(classroom._id);
      setLessons(lList);

      const aList = await api.listAssignments(classroom._id);
      setAssignments(aList);

      const sessions = await api.listDoubtSessions(classroom._id);
      setDoubtSessions(sessions);
      const openSession = sessions.find((s: any) => s.status === "open");
      if (openSession) {
        setActiveDoubtSession(openSession);
        const dList = await api.listDoubtsOfSession(openSession._id);
        setDoubts(dList);
      } else {
        setActiveDoubtSession(null);
        setDoubts([]);
      }

      const rawAnns = await api.listAnnouncements(classroom._id);
      setAnnouncements(rawAnns);

      const mats = await api.listMaterials(classroom._id);
      setMaterials(mats);

      // Load Flagship Today timeline feed
      const todayLogs = await api.getTodayDiary(classroom._id);
      setTodayDiary(todayLogs);

      // Load student's submissions for assignments
      if (!isTeacher) {
        const subData: any = {};
        for (const asg of aList) {
          try {
            const mSub = await api.getMySubmission((asg as any)._id);
            subData[(asg as any)._id] = mSub;
          } catch(e) {}
        }
        setSubmissions(subData);
      }
    } catch (e: any) {
      alert("Error loading classroom details: " + e.message);
    }
  };

  const loadValidationRequestsAndStudents = async () => {
    try {
      const students = await api.getConnectedStudents(classroom._id);
      setConnectedStudents(students);
      const reqs = await api.checkPendingRequests(classroom._id);
      setPendingRequests(reqs);
    } catch(e) {}
  };

  /* ============================================================
     ADMINISTRATIVE / SETTINGS ACTIONS
     ============================================================ */
  const handleApproveRequest = async (reqId: string) => {
    try {
      await api.updateRequestStatus(reqId, "approved");
      alert("🎉 Student validation request approved!");
      loadValidationRequestsAndStudents();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handleDisconnectStudent = async (studentId: string) => {
    if (!confirm("Are you sure you want to disconnect this student? They will lose access to your timeline.")) return;
    try {
      await api.removeStudent(studentId, classroom._id);
      alert("❌ Student connection removed.");
      loadValidationRequestsAndStudents();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handleRegenerateCode = async () => {
    try {
      const updated = await api.regenerateClassroomCode(classroom._id);
      alert(`🚀 Code updated! Share your new Class Code with students: ${updated.code}`);
      window.location.reload();
    } catch(e: any) {
      alert(e.message);
    }
  };

  /* ============================================================
     LESSONS OPERATIONAL COMMANDS
     ============================================================ */
  const handleAddLessonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLesson.chapter || !newLesson.topic || !newLesson.content) {
      alert("Chapter, Topic and Detailed content fields are mandatory.");
      return;
    }
    try {
      alert("🤖 Submitting Lesson draft. Google Gemini AI summary generation has been queued on the server...");
      await api.createLesson(classroom._id, {
        ...newLesson,
        concepts: newLesson.concepts.split(",").map(s => s.trim()).filter(Boolean)
      });
      alert("✅ Lesson posted on the board and AI digests generated!");
      setShowAddLesson(false);
      setNewLesson({ chapter: "", topic: "", content: "", objectives: "", concepts: "", notes: "", publishDate: "" });
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handleManualSummaryTrigger = async (lId: string, chapter: string, topic: string, content: string) => {
    try {
      setGeneratingSummaryId(lId);
      alert("🤖 Generating Multilingual summaries using Gemini 3.5 Flash server-side... Please wait.");
      await api.generateAiSummary(lId, { chapter, topic, content });
      alert("✅ AI summarizations complete!");
      loadClassroomContent();
    } catch(e: any) {
      alert(e._message || "Gemini summary trigger completed!");
      loadClassroomContent();
    } finally {
      setGeneratingSummaryId(null);
    }
  };

  const handleDeleteLesson = async (lId: string) => {
    if (!confirm("Delete this lesson from standard board permanently?")) return;
    try {
      await api.deleteLesson(lId);
      alert("Lesson removed from board.");
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  /* ============================================================
     ASSIGNMENTS WORKFLOW
     ============================================================ */
  const handleAddAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAsg.title || !newAsg.description || !newAsg.dueDate) {
      alert("Title, description and due date fields are mandatory.");
      return;
    }
    try {
      await api.createAssignment(classroom._id, newAsg);
      alert("📋 Assignment loaded onto student timelines!");
      setShowAddAssignment(false);
      setNewAsg({ title: "", description: "", instructions: "", dueDate: "", marks: 100, publishDate: "" });
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handleHomeworkSubmit = async (asgId: string) => {
    const studentData = studentSubmissions[asgId];
    if (!studentData || !studentData.txt) {
      alert("Please type out your homework calculations or findings to submit.");
      return;
    }
    try {
      await api.submitAssignment(asgId, {
        contentText: studentData.txt,
        fileName: studentData.file || "reference-link",
        fileUrl: studentData.file || ""
      });
      alert("🎉 Homework submitted successfully to your lecturer!");
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handleOpenSubmissionViewer = async (asgId: string) => {
    try {
      const list = await api.getSubmissionsOfAssignment(asgId);
      setAllSubmissionsList(list);
      setViewSubmissionsAsgId(asgId);
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handleSaveGrades = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradedSubmission) return;
    try {
      await api.gradeSubmission(gradedSubmission.subId, {
        grade: gradedSubmission.grade,
        marksObtained: gradedSubmission.marks,
        feedback: gradedSubmission.feedback
      });
      alert("📝 Grades posted! Student notification triggered.");
      setGradedSubmission(null);
      if (viewSubmissionsAsgId) {
        handleOpenSubmissionViewer(viewSubmissionsAsgId);
      }
    } catch(e: any) {
      alert(e.message);
    }
  };

  /* ============================================================
     ZWEIFEL DUBI SYSTEM WORKFLOW
     ============================================================ */
  const handleStartDoubtSession = async () => {
    try {
      await api.createDoubtSession(classroom._id, "Chapter doubts & general lecture Q&A");
      alert("❓ Zweifel Doubt Q&A live board opened.");
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handleCloseDoubtSession = async (sId: string) => {
    try {
      await api.updateDoubtSessionStatus(sId, "closed");
      alert("Doubt Session closed by Teacher.");
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handlePostDoubtQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDoubtSession) {
      alert("No open Doubt Session exists for this classroom currently.");
      return;
    }
    if (!newDoubt.question) {
      alert("Please specify your query.");
      return;
    }
    try {
      await api.askDoubt(activeDoubtSession._id, newDoubt);
      alert("📤 Question submitted in Doubt board!");
      setNewDoubt({ subject: classroom.subject, topic: "", question: "" });
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handlePostDoubtReply = async (dId: string) => {
    const rx = doubtReplies[dId];
    if (!rx) {
      alert("Please construct response lines before hitting sumbit.");
      return;
    }
    try {
      await api.replyToDoubt(dId, rx);
      alert("💬 Response submitted to Student journal!");
      setDoubtReplies({ ...doubtReplies, [dId]: "" });
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handleTogglePin = async (dId: string) => {
    try {
      await api.pinDoubt(dId);
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handleMarkResolved = async (dId: string) => {
    try {
      await api.resolveDoubt(dId);
      alert("✅ Zweifel labeled resolved!");
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  /* ============================================================
     ANNOUNCEMENTS & MATERIALS
     ============================================================ */
  const handleAddAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnn.title || !newAnn.body) {
      alert("Title and message body are mandatory.");
      return;
    }
    try {
      await api.createAnnouncement(classroom._id, newAnn);
      alert("📢 Announcement loaded under classroom notices feeds!");
      setShowAddAnn(false);
      setNewAnn({ title: "", body: "", priority: "" as any, publishDate: "" });
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMat.name) {
      alert("Subject notes title is mandatory.");
      return;
    }
    try {
      await api.createMaterial(classroom._id, {
        name: newMat.name,
        subject: classroom.subject,
        type: newMat.type,
        size: "3.4 MB",
        fileUrl: newMat.referenceUrl || "https://drive.google.com"
      });
      alert("📁 Study document posted successfully!");
      setShowAddMat(false);
      setNewMat({ name: "", type: "PDF" as any, referenceUrl: "" });
      loadClassroomContent();
    } catch(e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* ROOM HEADER */}
      <div className={`p-6 rounded-3xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"}`}>
        <div className="flex items-center gap-4">
          <span className="text-4xl text-indigo-500">📖</span>
          <div>
            <h1 className="font-display font-extrabold text-2xl tracking-tight leading-tight select-none">{classroom.name}</h1>
            <p className="text-xs font-semibold text-slate-400 mt-1 uppercase flex items-center gap-2 flex-wrap">
              <span>Subject: {classroom.subject}</span>
              <span>·</span>
              <span>{isTeacher ? "Instructor Ledger Dashboard" : "Connected Student Portal"}</span>
              <span>·</span>
              <span className="px-2.5 py-0.5 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-mono font-extrabold rounded-lg select-all uppercase">Code: {classroom.code || "N/A"}</span>
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {isTeacher && (
            <button
              onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
              className="px-4 py-2.5 bg-slate-500/10 border border-slate-500/20 text-xs font-bold uppercase rounded-xl tracking-wider hover:bg-slate-500/20 transition-all flex items-center gap-2"
            >
              <Users className="h-4 w-4" /> Classroom settings
              {pendingRequests.length > 0 && (
                <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
              )}
            </button>
          )}
          <button
            onClick={() => onNavigate("dashboard")}
            className="px-4 py-2.5 border-2 border-indigo-600 hover:bg-indigo-500 hover:text-white dark:hover:bg-indigo-950/20 text-indigo-600 text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
          >
            Dashboard
          </button>
        </div>
      </div>

      {/* CLASSROOM SETTINGS MODAL / SLIDE OVER DRAWER */}
      {showSettingsDrawer && isTeacher && (
        <div className="p-6 rounded-3xl border border-dashed border-indigo-500/30 bg-indigo-500/5 animate-slideUp space-y-6 shadow-inner">
          <div className="flex justify-between items-center pb-2 border-b border-indigo-500/20">
            <h2 className="font-display font-bold text-sm uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Classroom Administrative Panel</h2>
            <button onClick={() => setShowSettingsDrawer(false)} className="text-slate-400 hover:text-slate-100 p-1"><X className="h-5 w-5" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-semibold">
            {/* Teacher unique Code distribution box */}
            <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Unique Classroom Join Code</span>
              <div className="flex items-center gap-4 mt-2">
                <code className="text-xl font-mono text-indigo-405 text-indigo-400 font-extrabold uppercase px-3 py-1 bg-indigo-500/10 rounded-lg select-all">
                  {classroom.code || "UNAVAIL"}
                </code>
                <button 
                  onClick={handleRegenerateCode}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg uppercase tracking-wider flex items-center gap-1.5"
                  title="Generate a new secure validation key for this classroom"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed mt-4">
                Students enter this secure unique 6-character Code under their "Join Classroom" panel on the sidebar. Share this code to authorize students access directly to this specific classroom.
              </p>
            </div>

            {/* Validation Request queue */}
            <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
              <h3 className="font-display font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-3">Pending Student Validations ({pendingRequests.length})</h3>
              {pendingRequests.length === 0 ? (
                <div className="py-8 text-center text-slate-400">No pending student join requests logged.</div>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map(r => (
                    <div key={r._id} className="p-3 rounded-xl bg-slate-500/5 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-white text-xs">{r.student?.name}</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">ID: {r.student?.studentId} · Roll: {r.student?.rollNo} ({r.student?.classYear})</div>
                      </div>
                      <div className="flex gap-1.5">
                        <button 
                          onClick={() => handleApproveRequest(r._id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg uppercase text-[10px]"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => api.updateRequestStatus(r._id, "rejected").then(() => loadValidationRequestsAndStudents())}
                          className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg uppercase text-[10px]"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Validated students list */}
          <div className={`p-5 rounded-2xl border text-xs font-semibold ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            <h3 className="font-display font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-3">Validated Attendance Students ({connectedStudents.length})</h3>
            {connectedStudents.length === 0 ? (
              <div className="py-8 text-center text-slate-400">No verified students joined your timeline database yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {connectedStudents.map(student => (
                  <div key={student._id || student.id} className="p-3 rounded-xl bg-slate-500/5 flex justify-between items-center">
                    <div>
                      <div className="font-bold">{student.name}</div>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Roll No: {student.rollNo || "00"} · ID: {student.studentId || "NONE"}</span>
                    </div>
                    <button 
                      onClick={() => handleDisconnectStudent((student._id || student.id) as string)}
                      className="text-slate-450 hover:text-red-500"
                      title="Remove student access from standard boards"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CLASS-CENTRIC NAVIGATION MULTI TABS */}
      <div className="flex border-b-2 dark:border-slate-800 overflow-x-auto gap-1">
        {[
          { id: "timeline", label: "What Happened Today Timeline", icon: <Calendar className="h-4.5 w-4.5" /> },
          { id: "lessons", label: "Lessons Board", icon: <BookOpen className="h-4.5 w-4.5" /> },
          { id: "assignments", label: "Assignments & Submissions", icon: <FileText className="h-4.5 w-4.5" /> },
          { id: "doubts", label: "Zweifel Doubts Box", icon: <HelpCircle className="h-4.5 w-4.5" /> },
          { id: "materials_announcements", label: "Study Materials & Notices", icon: <FolderOpen className="h-4.5 w-4.5" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveViewTab(tab.id as any)}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wide border-b-2 -mb-[2px] transition ${
              activeTab === tab.id
                ? "border-indigo-600 text-indigo-600 font-extrabold focus:outline-none"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* TABS CONTAINER */}
      <div className="space-y-6">
        {/* ============================================================
            T_1: WHAT HAPPENED TODAY TIMELINE
            ============================================================ */}
        {activeTab === "timeline" && (
          <div className="animate-fadeIn space-y-6">
            {isTeacher && pendingRequests.length > 0 && (
              <div className="p-6 rounded-3xl border border-dashed border-amber-500/30 bg-amber-500/5 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    <h3 className="font-display font-extrabold text-sm uppercase tracking-wider text-amber-500">
                      Pending Classroom Access Requests ({pendingRequests.length})
                    </h3>
                  </div>
                  <span className="text-[9px] font-bold text-amber-650 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full uppercase animate-pulse">Needs Validation</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-semibold">
                  {pendingRequests.map(r => (
                    <div key={r._id} className={`p-4 rounded-2xl border flex justify-between items-center ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                      <div>
                        <div className="font-extrabold text-slate-800 dark:text-white text-xs">{r.student?.name}</div>
                        <div className="text-[10px] text-slate-450 mt-1">Roll No: {r.student?.rollNo} · Student ID: {r.student?.studentId}</div>
                        <div className="text-[10px] text-slate-450 mt-0.5">Year: {r.student?.classYear} · Section: {r.student?.section}</div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleApproveRequest(r._id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg uppercase text-[10px] tracking-wide transition-all"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => api.updateRequestStatus(r._id, "rejected").then(() => loadValidationRequestsAndStudents())}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-lg uppercase text-[10px] tracking-wide transition-all"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-indigo-500/20 bg-indigo-500/5 p-6 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="font-display font-extrabold text-md md:text-lg mb-1 leading-none select-none">📌 Today's Class Timeline Diary</h2>
                <p className="text-xs text-slate-400 font-semibold uppercase">The consolidated chronicle feed that answers: “What happened in class today?”</p>
              </div>
              <span className="text-[10px] px-3 py-1 font-bold uppercase tracking-widest bg-indigo-600 text-white rounded-full leading-none">Flagship View</span>
            </div>

            {todayDiary && !todayDiary.hasContent ? (
              <div className={`p-12 text-center rounded-3xl border border-dashed ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"}`}>
                <span className="text-4xl block mb-2">🗓️</span>
                <h3 className="font-display font-extrabold text-sm mb-1 uppercase text-slate-400 dark:text-slate-300">Nothing Logged Today</h3>
                <p className="text-xs text-slate-500 leading-normal max-w-sm mx-auto">
                  Either no lectures were delivered, or the teacher scheduled content for a future publish date. Once content is released, it appears automatically.
                </p>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto flex flex-col border-l border-indigo-600/30 pl-8 relative py-4">
                {/* Today's Lessons log */}
                {todayDiary?.lessons.map(l => (
                  <div key={l._id} className="relative pb-10">
                    <div className="absolute -left-12 top-0.5 h-8 w-8 rounded-full bg-indigo-600 text-white font-extrabold flex items-center justify-center text-sm shadow-md">📖</div>
                    <div>
                      <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest block mb-1">Lecture Logged Today</span>
                      <h4 className="font-display font-extrabold text-md mb-2">{l.topic}</h4>
                      <p className="text-xs text-slate-450 dark:text-slate-450 leading-relaxed bg-slate-500/5 p-4 rounded-xl">{l.content.substring(0, 180)}...</p>
                    </div>
                  </div>
                ))}

                {/* Today's Homework / Assignment log */}
                {todayDiary?.assignments.map(a => (
                  <div key={a._id} className="relative pb-10">
                    <div className="absolute -left-12 top-0.5 h-8 w-8 rounded-full bg-amber-500 text-white font-extrabold flex items-center justify-center text-sm shadow-md">📅</div>
                    <div>
                      <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest block mb-1">Homework Assigned Today</span>
                      <h4 className="font-display font-extrabold text-md mb-1">{a.title}</h4>
                      <div className="text-[10px] text-slate-400 mb-2 font-bold uppercase">Max Marks: {a.marks} points · Due date: {new Date(a.dueDate).toLocaleDateString()}</div>
                      <p className="text-xs text-slate-400 leading-normal bg-slate-500/5 p-3 rounded-lg">{a.description}</p>
                    </div>
                  </div>
                ))}

                {/* Today's Notices / Announcements */}
                {todayDiary?.announcements.map(ann => (
                  <div key={ann._id} className="relative pb-10">
                    <div className="absolute -left-12 top-0.5 h-8 w-8 rounded-full bg-red-500 text-white font-extrabold flex items-center justify-center text-sm shadow-md">📢</div>
                    <div>
                      <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest block mb-1">Announcement posted Today</span>
                      <h4 className="font-display font-extrabold text-md mb-2">{ann.title}</h4>
                      <p className="text-xs text-slate-400 leading-relaxed bg-slate-500/5 p-4 rounded-xl">{ann.body}</p>
                    </div>
                  </div>
                ))}

                {/* Today's Study Materials */}
                {todayDiary?.materials.map(mat => (
                  <div key={mat._id} className="relative pb-8">
                    <div className="absolute -left-12 top-0.5 h-8 w-8 rounded-full bg-emerald-500 text-white font-extrabold flex items-center justify-center text-sm shadow-md">📁</div>
                    <div>
                      <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest block mb-1">Study Material Uploaded Today</span>
                      <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold text-slate-800 dark:text-white">{mat.name}</div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">Subject: {mat.subject} · Type: {mat.type} ({mat.size})</span>
                        </div>
                        <a href={mat.fileUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 font-bold uppercase text-white rounded-lg text-[10px] flex items-center gap-1">Open <ArrowUpRight className="h-3 w-3" /></a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            T_2: LESSONS BOARD TABS
            ============================================================ */}
        {activeTab === "lessons" && (
          <div className="animate-fadeIn space-y-6">
            {/* Action panel */}
            <div className="flex justify-between items-center flex-wrap gap-4 pb-2 border-b dark:border-slate-800">
              <h2 className="font-display font-bold text-sm uppercase tracking-wider text-slate-500">Subject Lecture Diaries ({lessons.length})</h2>
              {isTeacher && (
                <button
                  onClick={() => setShowAddLesson(!showAddLesson)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Add Lesson Log
                </button>
              )}
            </div>

            {/* CREATE LESSON FORM */}
            {showAddLesson && isTeacher && (
              <form onSubmit={handleAddLessonSubmit} className={`p-6 rounded-3xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} space-y-4 shadow-lg`}>
                <h3 className="font-display font-extrabold text-sm uppercase text-slate-700 dark:text-white">Formulate Lesson Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                  <div>
                    <label className="text-slate-450 uppercase mb-1 block">Chapter Title *</label>
                    <input 
                      type="text" required value={newLesson.chapter} onChange={e => setNewLesson({ ...newLesson, chapter: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 focus:border-indigo-505" : "bg-slate-50 border-slate-200 focus:border-indigo-600"}`} placeholder="e.g. Chapter 4: Calculus"
                    />
                  </div>
                  <div>
                    <label className="text-slate-450 uppercase mb-1 block">Lecture Topic Title *</label>
                    <input 
                      type="text" required value={newLesson.topic} onChange={e => setNewLesson({ ...newLesson, topic: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 focus:border-indigo-505" : "bg-slate-50 border-slate-200 focus:border-indigo-600"}`} placeholder="e.g. Limits & Continuity"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase font-extrabold text-slate-450 mb-1 block">Detailed Lesson Explanation *</label>
                  <textarea 
                    required value={newLesson.content} onChange={e => setNewLesson({ ...newLesson, content: e.target.value })} rows={5}
                    className={`w-full p-3 rounded-lg border outline-none text-xs ${isDark ? "bg-slate-900 border-slate-800 focus:border-indigo-505" : "bg-slate-50 border-slate-200 focus:border-indigo-600"}`} placeholder="Explain the theories, derivations, or subject matter delivered during this period..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                  <div>
                    <label className="text-slate-450 uppercase mb-1 block">Learning Objectives</label>
                    <input 
                      type="text" value={newLesson.objectives} onChange={e => setNewLesson({ ...newLesson, objectives: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} placeholder="What students will demonstrate"
                    />
                  </div>
                  <div>
                    <label className="text-slate-450 uppercase mb-1 block">Key Concepts (Comma separated)</label>
                    <input 
                      type="text" value={newLesson.concepts} onChange={e => setNewLesson({ ...newLesson, concepts: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} placeholder="e.g. Derivative, slope, limits"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                  <div>
                    <label className="text-slate-450 uppercase mb-1 block">Notes & Recommendations</label>
                    <input 
                      type="text" value={newLesson.notes} onChange={e => setNewLesson({ ...newLesson, notes: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} placeholder="Practice problems and reference slides"
                    />
                  </div>
                  <div>
                    <label className="text-slate-450 uppercase mb-1 block">Publish Date (For scheduling future release)</label>
                    <input 
                      type="date" value={newLesson.publishDate} onChange={e => setNewLesson({ ...newLesson, publishDate: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button type="submit" className="px-5 py-3 text-xs font-extrabold uppercase bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-md">Post Lesson Board</button>
                  <button type="button" onClick={() => setShowAddLesson(false)} className="px-5 py-3 text-xs font-bold uppercase bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 rounded-xl">Cancel</button>
                </div>
              </form>
            )}

            {/* LESSONS DISPLAY list */}
            {lessons.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-semibold">No classrooms lessons published yet.</div>
            ) : (
              <div className="space-y-6">
                {lessons.map(lesson => {
                  const lang = selectedLang[lesson._id] || "en";
                  const summaryData = lesson.aiSummaries?.[lang as any];

                  return (
                    <div key={lesson._id} className={`p-6 rounded-3xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} space-y-4`}>
                      <div className="flex justify-between items-start flex-wrap gap-4 pb-4 border-b border-slate-500/10">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="text-[10px] px-2.5 py-1 font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-500 rounded-full">{lesson.chapter}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">📅 Published: {new Date(lesson.publishDate || lesson.createdAt).toLocaleDateString()}</span>
                          </div>
                          <h3 className="font-display font-extrabold text-lg text-slate-800 dark:text-white leading-tight">{lesson.topic}</h3>
                        </div>

                        {isTeacher && (
                          <button 
                            onClick={() => handleDeleteLesson(lesson._id)}
                            className="p-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500 hover:text-white text-red-500 rounded-lg transition"
                            title="Remove lesson diary"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Main original description */}
                      <p className="text-xs text-slate-450 dark:text-slate-400 leading-relaxed font-semibold">{lesson.content}</p>

                      {/* Optional categories tags */}
                      {lesson.concepts?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {lesson.concepts.map((tag, idx) => (
                            <span key={idx} className="text-[9px] px-2 py-0.5 font-bold uppercase border border-slate-500/20 bg-slate-500/5 text-slate-400 rounded-sm">
                              📌 {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* MULTILINGUAL AI SUMMARY PANEL */}
                      {lesson.aiSummaries ? (
                        <div className="border border-purple-500/20 bg-purple-500/5 p-5 rounded-2xl space-y-4">
                          <div className="flex justify-between items-center flex-wrap gap-3 pb-3 border-b border-purple-500/10">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">🤖</span>
                              <h4 className="font-display font-extrabold text-xs uppercase tracking-wide text-purple-400">Google Gemini AI Digests</h4>
                            </div>
                            
                            {/* Multilingual active selector */}
                            <div className="flex gap-1.5 text-[9px] font-bold uppercase">
                              <button 
                                onClick={() => setSelectedLang({ ...selectedLang, [lesson._id]: "en" })}
                                className={`px-2.5 py-1 border rounded-lg transition-all ${lang === "en" ? "bg-purple-600 border-purple-600 text-white font-extrabold" : "bg-transparent text-slate-500 hover:text-white hover:bg-slate-800"}`}
                              >
                                English
                              </button>
                              <button 
                                onClick={() => setSelectedLang({ ...selectedLang, [lesson._id]: "te" })}
                                className={`px-2.5 py-1 border rounded-lg transition-all ${lang === "te" ? "bg-purple-600 border-purple-600 text-white font-extrabold" : "bg-transparent text-slate-500 hover:text-white hover:bg-slate-800"}`}
                              >
                                తెలుగు (Telugu)
                              </button>
                              <button 
                                onClick={() => setSelectedLang({ ...selectedLang, [lesson._id]: "hi" })}
                                className={`px-2.5 py-1 border rounded-lg transition-all ${lang === "hi" ? "bg-purple-600 border-purple-600 text-white font-extrabold" : "bg-transparent text-slate-500 hover:text-white hover:bg-slate-800"}`}
                              >
                                हिंदी (Hindi)
                              </button>
                            </div>
                          </div>

                          {/* Print relative Multilingual summary data */}
                          {summaryData ? (
                            <div className="space-y-3">
                              <p className="text-[11px] leading-relaxed select-all italic text-slate-300">
                                "{summaryData.summary || "Summary loading"}"
                              </p>
                              {summaryData.keyPoints?.length > 0 && (
                                <div className="space-y-1">
                                  <div className="text-[10px] font-extrabold uppercase text-purple-400">Core Takeaways:</div>
                                  <ul className="list-disc leading-relaxed pl-4 space-y-0.5 text-[10px] text-slate-400">
                                    {summaryData.keyPoints.map((pt: string, i: number) => <li key={i}>{pt}</li>)}
                                  </ul>
                                </div>
                              )}
                              {summaryData.concepts?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {summaryData.concepts.map((concept: string, i: number) => (
                                    <span key={i} className="text-[8px] font-bold uppercase rounded bg-purple-500/20 text-purple-300 px-1.5 py-0.5">
                                      💡 {concept}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400 font-medium">Translation unavailable for this language. Click regenerate to construct.</div>
                          )}
                        </div>
                      ) : (
                        <div className="border border-purple-500/20 bg-purple-500/5 p-4 rounded-2xl flex justify-between items-center text-xs">
                          <div>
                            <div className="font-bold text-slate-800 dark:text-white">Multilingual summaries not generated.</div>
                            <span className="text-[10px] text-slate-400 block mt-0.5">Queue Google Gemini translation digests in EN, TE and HI.</span>
                          </div>
                          {isTeacher && (
                            <button
                              disabled={generatingSummaryId === lesson._id}
                              onClick={() => handleManualSummaryTrigger(lesson._id, lesson.chapter, lesson.topic, lesson.content)}
                              className="px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:bg-purple-700 text-white font-extrabold text-[10px] uppercase rounded-lg shadow flex items-center gap-1.5"
                            >
                              <RefreshCw className={`h-3 w-3 ${generatingSummaryId === lesson._id ? "animate-spin" : ""}`} /> Generate Summaries
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            T_3: ASSIGNMENTS & HOMEWORK SUBMISSIONS
            ============================================================ */}
        {activeTab === "assignments" && (
          <div className="animate-fadeIn space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4 pb-2 border-b dark:border-slate-800">
              <h2 className="font-display font-bold text-sm uppercase tracking-wider text-slate-500">Classrooms HW Boards ({assignments.length})</h2>
              {isTeacher && (
                <button
                  onClick={() => setShowAddAssignment(!showAddAssignment)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Create Homework Task
                </button>
              )}
            </div>

            {/* CREATE HW MODAL */}
            {showAddAssignment && isTeacher && (
              <form onSubmit={handleAddAssignmentSubmit} className={`p-6 rounded-3xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} space-y-4 shadow-lg`}>
                <h3 className="font-display font-extrabold text-sm uppercase text-slate-700 dark:text-white">Formulate Assignment Task</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                  <div>
                    <label className="text-slate-450 uppercase mb-1 block">Assignment Title *</label>
                    <input 
                      type="text" required value={newAsg.title} onChange={e => setNewAsg({ ...newAsg, title: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 focus:border-indigo-505" : "bg-slate-50 border-slate-200 focus:border-indigo-600"}`} placeholder="e.g. Problems set 5: calculus"
                    />
                  </div>
                  <div>
                    <label className="text-slate-450 uppercase mb-1 block">Maximum Score points</label>
                    <input 
                      type="number" value={newAsg.marks} onChange={e => setNewAsg({ ...newAsg, marks: Number(e.target.value) })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} placeholder="100"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase font-extrabold text-slate-450 mb-1 block">Task Description & Syllabus *</label>
                  <textarea 
                    required value={newAsg.description} onChange={e => setNewAsg({ ...newAsg, description: e.target.value })} rows={4}
                    className={`w-full p-3 rounded-lg border outline-none text-xs ${isDark ? "bg-slate-900 border-slate-800 focus:border-indigo-505" : "bg-slate-50 border-slate-200 focus:border-indigo-600"}`} placeholder="Describe calculations/questions that students should execute..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-semibold">
                  <div className="sm:col-span-2">
                    <label className="text-slate-450 uppercase mb-1 block">Special Guidelines / Instructions</label>
                    <input 
                      type="text" value={newAsg.instructions} onChange={e => setNewAsg({ ...newAsg, instructions: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} placeholder="Include explanations and formatting guidelines"
                    />
                  </div>
                  <div>
                    <label className="text-slate-450 uppercase mb-1 block">Due Date *</label>
                    <input 
                      type="date" required value={newAsg.dueDate} onChange={e => setNewAsg({ ...newAsg, dueDate: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 focus:border-indigo-505" : "bg-slate-50 border-slate-200 focus:border-indigo-600"}`}
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button type="submit" className="px-5 py-3 text-xs font-extrabold uppercase bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-md">Release Homework Task</button>
                  <button type="button" onClick={() => setShowAddAssignment(false)} className="px-5 py-3 text-xs font-bold uppercase bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 rounded-xl">Cancel</button>
                </div>
              </form>
            )}

            {/* ASSIGNMENTS DISPLAY INDEX */}
            {assignments.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-semibold">No homework or assignments active currently.</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-4">
                  {assignments.map(asg => {
                    const studentSub = submissions[asg._id];
                    const hasSubmitted = studentSub !== undefined && studentSub !== null;
                    const dateDiff = new Date(asg.dueDate).getTime() - new Date().getTime();
                    const daysLeft = Math.ceil(dateDiff / (1000 * 3600 * 24));

                    return (
                      <div key={asg._id} className={`p-5 rounded-2xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} space-y-4`}>
                        <div className="flex justify-between items-start flex-wrap gap-3 pb-3 border-b border-slate-500/10">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${hasSubmitted ? "bg-emerald-500/10 text-emerald-500" : daysLeft < 0 ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"}`}>
                                {hasSubmitted ? "✓ Submitted" : daysLeft < 0 ? "Overdue" : `${daysLeft} days left`}
                              </span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Score Limit: {asg.marks} points</span>
                            </div>
                            <h3 className="font-display font-extrabold text-md text-slate-800 dark:text-white leading-tight">{asg.title}</h3>
                          </div>
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">{asg.description}</p>
                        {asg.instructions && <div className="text-[10px] pl-3 py-1 bg-slate-500/5 border-l-2 border-slate-500 text-slate-400 italic">Instructions: {asg.instructions}</div>}

                        <div className="pt-2">
                          {isTeacher ? (
                            <button
                              onClick={() => handleOpenSubmissionViewer(asg._id)}
                              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold uppercase rounded-lg text-[10px] flex items-center gap-1.5"
                            >
                              Check Student Submissions <ArrowUpRight className="h-3 w-3" />
                            </button>
                          ) : (
                            <div className="space-y-4">
                              {/* Submit homework forms */}
                              {!hasSubmitted ? (
                                <div className="space-y-3 pt-3 border-t border-slate-500/10">
                                  <textarea
                                    value={studentSubmissions[asg._id]?.txt || ""}
                                    onChange={e => setStudentSubmissions({ ...studentSubmissions, [asg._id]: { ...studentSubmissions[asg._id], txt: e.target.value } })}
                                    className={`w-full p-2.5 rounded-lg border outline-none text-xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}
                                    rows={3}
                                    placeholder="Type your homework calculation findings or explanations..."
                                  />
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={studentSubmissions[asg._id]?.file || ""}
                                      onChange={e => setStudentSubmissions({ ...studentSubmissions, [asg._id]: { ...studentSubmissions[asg._id], file: e.target.value } })}
                                      className={`flex-1 p-2 rounded-lg border outline-none text-[10px] ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}
                                      placeholder="Paste any file or reference URL (e.g. drive.google.com)"
                                    />
                                    <button 
                                      onClick={() => handleHomeworkSubmit(asg._id)}
                                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg uppercase text-[10px]"
                                    >
                                      Submit Task
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3 rounded-xl bg-slate-500/5 text-xs font-semibold text-slate-400">
                                  <div className="text-emerald-500 font-bold mb-1">✓ Your Homework has been submitted</div>
                                  <p className="select-all italic bg-slate-950/40 p-2 rounded text-[11px] mb-2">"{studentSub.contentText}"</p>
                                  {studentSub.grade ? (
                                    <div className="p-2 border border-slate-500/20 bg-indigo-500/5 text-slate-300 rounded block mt-2 text-[10px]">
                                      <strong className="text-indigo-400 uppercase">Grades Logged:</strong> {studentSub.grade} ({studentSub.marksObtained}/{asg.marks} marks)
                                      {studentSub.feedback && <p className="mt-1 font-normal text-slate-400">Lecturer feedback: "{studentSub.feedback}"</p>}
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-slate-500">Waiting for Lecturer evaluation.</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Teacher submission list / Grading Workspace */}
                {isTeacher && viewSubmissionsAsgId && (
                  <div className={`p-6 rounded-3xl border animate-fadeIn space-y-4 ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"}`}>
                    <div className="flex justify-between items-center pb-2 border-b border-indigo-600/20">
                      <h3 className="font-display font-extrabold text-sm uppercase">Grades Ledger Workspace</h3>
                      <button onClick={() => setViewSubmissionsAsgId(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
                    </div>

                    {allSubmissionsList.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 select-none">No evaluations outstanding. Validation pending for submissions.</div>
                    ) : (
                      <div className="space-y-4 text-xs font-semibold">
                        {allSubmissionsList.map(sub => {
                          const stu: any = sub.student;
                          const showGrader = gradedSubmission?.subId === sub._id;

                          return (
                            <div key={sub._id} className="p-4 rounded-xl bg-slate-500/5 space-y-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="font-bold text-slate-800 dark:text-white text-xs">{stu?.name || "Active Student"}</div>
                                  <span className="text-[10px] text-slate-400 block mt-0.5">Roll No: {stu?.rollNo} · ID: {stu?.studentId}</span>
                                </div>
                                <span className="text-[10px] text-slate-550 block">Evaluated: {new Date(sub.submittedAt).toLocaleDateString()}</span>
                              </div>

                              <div className="bg-slate-950/40 p-3 rounded italic text-[11px] text-slate-300">
                                "{sub.contentText}"
                              </div>

                              {sub.fileUrl && (
                                <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-[10px] text-indigo-400 font-bold hover:underline mb-2">
                                  🔗 Open attached calculation resource
                                </a>
                              )}

                              {sub.grade ? (
                                <div className="p-2.5 rounded bg-indigo-500/10 text-[10px] border border-indigo-500/20">
                                  <div className="font-extrabold text-indigo-400 uppercase">Grades Logged: {sub.grade} · Marks: {sub.marksObtained} points</div>
                                  {sub.feedback && <div className="text-slate-400 font-medium mt-1">Feedback: "{sub.feedback}"</div>}
                                </div>
                              ) : (
                                <div>
                                  {!showGrader ? (
                                    <button 
                                      onClick={() => setGradedSubmission({ subId: sub._id, marks: 10, grade: "A", feedback: "" })}
                                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg uppercase text-[10px]"
                                    >
                                      Grade Submission
                                    </button>
                                  ) : (
                                    <form onSubmit={handleSaveGrades} className="p-3 bg-slate-950/60 rounded-xl space-y-3 border border-indigo-500/20">
                                      <div className="grid grid-cols-2 gap-3 text-[10px] font-bold uppercase">
                                        <div>
                                          <label className="text-slate-400 mb-1 block">Marks Awarded</label>
                                          <input 
                                            type="number" value={gradedSubmission.marks ?? ""} onChange={e => setGradedSubmission({ ...gradedSubmission, marks: Number(e.target.value) })}
                                            className="w-full p-2 bg-slate-900 border border-slate-700 outline-none text-white font-mono rounded"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-slate-400 mb-1 block">Grade Letter</label>
                                          <input 
                                            type="text" value={gradedSubmission.grade} onChange={e => setGradedSubmission({ ...gradedSubmission, grade: e.target.value })}
                                            className="w-full p-2 bg-slate-900 border border-slate-700 outline-none text-white font-mono rounded" placeholder="e.g. A+, B"
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-slate-400 mb-1 block uppercase">Feedback / Assessment Remarks</label>
                                        <input 
                                          type="text" value={gradedSubmission.feedback} onChange={e => setGradedSubmission({ ...gradedSubmission, feedback: e.target.value })}
                                          className="w-full p-2 bg-slate-900 border border-slate-700 outline-none text-xs text-white rounded" placeholder="Well done calculation step-by-step..."
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded uppercase text-[10px]">Save Score</button>
                                        <button type="button" onClick={() => setGradedSubmission(null)} className="px-3 py-1.5 bg-slate-800 text-slate-400 font-bold rounded uppercase text-[10px]">Cancel</button>
                                      </div>
                                    </form>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            T_4: ZWEIFEL DOUBTS Q&A CENTER
            ============================================================ */}
        {activeTab === "doubts" && (
          <div className="animate-fadeIn space-y-6">
            <div className="border border-indigo-500/20 bg-indigo-500/5 p-6 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="font-display font-extrabold text-md md:text-lg mb-1 leading-none select-none">❓ Q&A doubt boards</h2>
                <p className="text-xs text-slate-400 font-semibold uppercase">Academic question boards. Direct student-to-teacher communication strictly.</p>
              </div>
              {isTeacher && !activeDoubtSession && (
                <button
                  onClick={handleStartDoubtSession}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white uppercase rounded-xl tracking-wider shadow"
                >
                  Start Doubt Session
                </button>
              )}
            </div>

            {/* Check doubt session status */}
            {!activeDoubtSession ? (
              <div className={`p-12 text-center rounded-3xl border border-dashed ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"}`}>
                <span className="text-4xl block mb-2">🔒</span>
                <h3 className="font-display font-extrabold text-sm mb-1 uppercase text-slate-400 dark:text-slate-300">Doubt Board is Offline</h3>
                <p className="text-xs text-slate-500 leading-normal max-w-sm mx-auto">
                  {isTeacher ? "Open a doubt board to allow connected students to submit questions regarding study materials." : "Ask doubt sessions will become accessible as soon as the teacher puts the doubt board online."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* Doubt board contents list */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-950 text-white p-4 rounded-2xl">
                    <div>
                      <h4 className="font-display font-extrabold text-xs uppercase tracking-wider text-indigo-400">Class Q&A Board (Active)</h4>
                      <p className="text-[10px] text-slate-500 mt-1 leading-normal font-medium">{activeDoubtSession.title}</p>
                    </div>
                    {isTeacher && (
                      <button
                        onClick={() => handleCloseDoubtSession(activeDoubtSession._id)}
                        className="px-2.5 py-1 bg-red-650 hover:bg-red-700 text-[9px] font-extrabold text-red-500 rounded uppercase"
                      >
                        Close Session
                      </button>
                    )}
                  </div>

                  {doubts.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 font-semibold text-xs border border-dashed border-slate-500/20 rounded-3xl">No Zweifel doubts posted yet inside this session.</div>
                  ) : (
                    <div className="space-y-4">
                      {doubts.map(d => (
                        <div key={d._id} className={`p-5 rounded-2xl border ${d.isPinned ? "border-amber-500 bg-amber-500/5" : isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} relative`}>
                          <div className="flex justify-between items-start gap-4 flex-wrap mb-2">
                            <span className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-extrabold uppercase">Topic: {d.topic}</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded font-extrabold uppercase ${d.status === "resolved" ? "bg-emerald-500/10 text-emerald-500" : d.status === "answered" ? "bg-cyan-500/10 text-cyan-500" : "bg-amber-500/10 text-amber-500"}`}>
                              {d.status === "resolved" ? "✓ Resolved" : d.status === "answered" ? "💬 Answered" : "⏳ Pending"}
                            </span>
                            
                            {isTeacher && (
                              <button 
                                onClick={() => handleTogglePin(d._id)}
                                className={`text-[10px] font-bold py-1 px-2 rounded-lg flex items-center gap-1 ${d.isPinned ? "bg-amber-500 text-white" : "bg-slate-550 dark:bg-slate-800 text-slate-400"}`}
                              >
                                <Pin className="h-3 w-3" /> Pin
                              </button>
                            )}
                          </div>

                          <div className="text-xs text-slate-700 dark:text-gray-100 font-bold mb-3">"{d.question}"</div>

                          {/* Prints replies details if answers exists */}
                          {d.reply ? (
                            <div className="p-3 bg-emerald-500/5 rounded-xl border-l-[3px] border-emerald-500 text-xs">
                              <div className="text-emerald-500 font-extrabold text-[10px] mb-1 uppercase">Commented by Teacher:</div>
                              <p className="text-slate-650 dark:text-slate-350">{d.reply}</p>
                              
                              {!isTeacher && d.status === "answered" && (
                                <button
                                  onClick={() => handleMarkResolved(d._id)}
                                  className="mt-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded uppercase text-[10px] flex items-center gap-1"
                                >
                                  <Check className="h-3 w-3" /> Mark Resolved
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-500 font-semibold select-none">No assessment answers provided yet.</div>
                          )}

                          {/* Teacher answer input handles */}
                          {isTeacher && d.status === "pending" && (
                            <div className="flex gap-2 pt-3 border-t border-slate-500/10">
                              <input
                                type="text"
                                value={doubtReplies[d._id] || ""}
                                onChange={e => setDoubtReplies({ ...doubtReplies, [d._id]: e.target.value })}
                                className={`flex-1 p-2 rounded-lg border outline-none text-xs ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}
                                placeholder="Type answer explanations to pupil query..."
                              />
                              <button
                                onClick={() => handlePostDoubtReply(d._id)}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg uppercase text-[10px]"
                              >
                                Answer Query
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Student ask query form */}
                {!isTeacher && (
                  <form onSubmit={handlePostDoubtQuestion} className={`p-6 rounded-3xl border flex flex-col gap-4 ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} shadow-xl`}>
                    <h3 className="font-display font-extrabold text-sm uppercase">Ask Lecturer Zweifel Doubt</h3>
                    <div className="text-xs font-semibold">
                      <label className="text-slate-450 uppercase mb-1.5 block">Query Topic *</label>
                      <input 
                        type="text" required value={newDoubt.topic} onChange={e => setNewDoubt({ ...newDoubt, topic: e.target.value })}
                        className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} placeholder="e.g. Limits computation slide 12"
                      />
                    </div>
                    <div className="text-xs font-semibold">
                      <label className="text-slate-450 uppercase mb-1.5 block">Describe Your Problem *</label>
                      <textarea 
                        required value={newDoubt.question} onChange={e => setNewDoubt({ ...newDoubt, question: e.target.value })} rows={4}
                        className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} placeholder="Explain the doubt detail including any steps or formula confusion..."
                      />
                    </div>
                    <button type="submit" className="w-full py-4 text-xs font-extrabold tracking-widest uppercase bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl shadow-md">Submit Query</button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            T_5: STUDY MATERIALS & RECENT ANNOUNCEMENTS NOTICE BOARD
            ============================================================ */}
        {activeTab === "materials_announcements" && (
          <div className="animate-fadeIn space-y-8">
            {/* Announcements Notice Board row */}
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b dark:border-slate-800">
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider text-slate-500">Notices & Announcements ({announcements.length})</h3>
                {isTeacher && (
                  <button 
                    onClick={() => setShowAddAnn(!showAddAnn)}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase rounded-lg flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Post Announcement
                  </button>
                )}
              </div>

              {/* POST ANNOUNCEMENT FORM */}
              {showAddAnn && isTeacher && (
                <form onSubmit={handleAddAnnouncement} className={`p-6 rounded-3xl border whitespace-normal max-w-lg ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} space-y-4 shadow-lg`}>
                  <h4 className="font-display font-bold text-xs uppercase">Compose Notice Board Alert</h4>
                  <div className="text-xs font-semibold">
                    <label className="text-slate-450 uppercase mb-1 block">Title *</label>
                    <input 
                      type="text" required value={newAnn.title} onChange={e => setNewAnn({ ...newAnn, title: e.target.value })}
                      className={`w-full p-2.5 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} placeholder="Mathematics Unit Test scheduled"
                    />
                  </div>
                  <div className="text-xs font-semibold">
                    <label className="text-slate-450 uppercase mb-1 block">Message Alert Details *</label>
                    <textarea 
                      required value={newAnn.body} onChange={e => setNewAnn({ ...newAnn, body: e.target.value })} rows={3}
                      className={`w-full p-2.5 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} placeholder="Enter alerts detailed message here..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                    <div>
                      <label className="text-slate-450 uppercase mb-1 block">Priority Level</label>
                      <select 
                        value={newAnn.priority} onChange={e => setNewAnn({ ...newAnn, priority: e.target.value as any })}
                        className={`w-full p-2.5 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 font-bold" : "bg-slate-50 border-slate-200 text-slate-800"}`}
                      >
                        <option value="">Normal</option>
                        <option value="urgent">Urgent</option>
                        <option value="info">Info</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-450 uppercase mb-1 block">Scheduled Date</label>
                      <input 
                        type="date" value={newAnn.publishDate} onChange={e => setNewAnn({ ...newAnn, publishDate: e.target.value })}
                        className={`w-full p-2.5 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg uppercase text-[10px]">Post Announcement</button>
                    <button type="button" onClick={() => setShowAddAnn(false)} className="px-4 py-2 bg-slate-800 text-slate-400 font-bold rounded-lg uppercase text-[10px]">Cancel</button>
                  </div>
                </form>
              )}

              {/* Announcement cards */}
              {announcements.length === 0 ? (
                <div className="text-center py-6 text-slate-400 font-semibold text-xs select-none">No active notices compiled.</div>
              ) : (
                <div className="space-y-4">
                  {announcements.map(ann => {
                    const isUrgent = ann.priority === "urgent";
                    const isInfo = ann.priority === "info";

                    return (
                      <div key={ann._id} className={`p-5 rounded-2xl border border-l-4 ${isUrgent ? "border-l-red-500 bg-red-500/5 border-red-500/20" : isInfo ? "border-l-blue-500 bg-blue-500/5 border-blue-500/20" : "border-l-indigo-600 bg-indigo-500/5 border-slate-500/10"}`}>
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider block mb-1 text-slate-500">
                              📅 Posted: {new Date(ann.publishDate || ann.createdAt).toLocaleDateString()}
                            </span>
                            <h4 className="font-display font-extrabold text-sm text-slate-800 dark:text-white leading-tight">{ann.title}</h4>
                          </div>
                          {isUrgent && <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-500 uppercase">Urgent Alert</span>}
                        </div>
                        <p className="text-xs text-slate-450 dark:text-slate-400 mt-2 leading-relaxed">{ann.body}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Study Materials Repository row */}
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b dark:border-slate-800">
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider text-slate-500">Subject Materials Repository ({materials.length})</h3>
                {isTeacher && (
                  <button 
                    onClick={() => setShowAddMat(!showAddMat)}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase rounded-lg flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Upload Slides / Doc
                  </button>
                )}
              </div>

              {/* POST STUDY MATERIAL FORM */}
              {showAddMat && isTeacher && (
                <form onSubmit={handleAddMaterial} className={`p-6 rounded-3xl border whitespace-normal max-w-lg ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} space-y-4 shadow-lg`}>
                  <h4 className="font-display font-bold text-xs uppercase">Upload study resources</h4>
                  <div className="text-xs font-semibold">
                    <label className="text-slate-450 uppercase mb-1 block">Title *</label>
                    <input 
                      type="text" required value={newMat.name} onChange={e => setNewMat({ ...newMat, name: e.target.value })}
                      className={`w-full p-2.5 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} placeholder="e.g. Calculus chapters lecture slides"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                    <div>
                      <label className="text-slate-450 uppercase mb-1 block">Resource Type</label>
                      <select 
                        value={newMat.type} onChange={e => setNewMat({ ...newMat, type: e.target.value as any })}
                        className={`w-full p-2.5 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}
                      >
                        <option>PDF</option>
                        <option>Notes</option>
                        <option>PPT</option>
                        <option>Image</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-450 uppercase mb-1 block">Reference File URL</label>
                      <input 
                        type="text" value={newMat.referenceUrl} onChange={e => setNewMat({ ...newMat, referenceUrl: e.target.value })}
                        className={`w-full p-2.5 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} placeholder="https://drive.google.com/..."
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg uppercase text-[10px]">Post Study material</button>
                    <button type="button" onClick={() => setShowAddMat(false)} className="px-4 py-2 bg-slate-800 text-slate-400 font-bold rounded-lg uppercase text-[10px]">Cancel</button>
                  </div>
                </form>
              )}

              {/* Study material widgets grid */}
              {materials.length === 0 ? (
                <div className="text-center py-6 text-slate-400 font-semibold text-xs select-none">No active reference slides hosted inside this classroom yet.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {materials.map(mat => {
                    const iconMap = { PDF: "📕", Notes: "📗", PPT: "📘", Image: "📙" };
                    const icon = iconMap[mat.type as keyof typeof iconMap] || "📕";

                    return (
                      <div key={mat._id} className={`p-4 rounded-2xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} flex items-center justify-between`}>
                        <div className="flex items-center gap-3 truncate">
                          <span className="text-2xl">{icon}</span>
                          <div className="truncate text-xs font-semibold">
                            <div className="font-bold text-slate-800 dark:text-white truncate">{mat.name}</div>
                            <span className="text-[10px] text-slate-400 block mt-0.5">{mat.type} ({mat.size}) · Released to timeline</span>
                          </div>
                        </div>
                        <a 
                          href={mat.fileUrl || "#"} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="p-2 border border-slate-500/20 bg-slate-500/5 hover:bg-indigo-600 hover:text-white rounded-lg text-slate-400 transition"
                          title="Download document reference link"
                        >
                          <ArrowUpRight className="h-4.5 w-4.5" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default ClassroomView;
