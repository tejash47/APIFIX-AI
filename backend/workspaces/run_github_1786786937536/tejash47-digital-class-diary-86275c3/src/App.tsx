import React, { useState, useEffect } from "react";
import { User, Classroom, Notification } from "./types";
import { api, getToken, clearToken } from "./api";
import { LandingPage } from "./components/LandingPage";
import { AppShell } from "./components/AppShell";
import { DashboardView } from "./components/DashboardView";
import { ClassroomView } from "./components/ClassroomView";
import { BookOpen, Award, ShieldAlert, GraduationCap, X, PlusCircle, CheckCircle, Target, ChevronRight, Trash2 } from "lucide-react";

const ACADEMIC_CLASSES = [
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "Class 11",
  "Class 12",
  "B.Tech 1st Year",
  "B.Tech 2nd Year",
  "B.Tech 3rd Year",
  "B.Tech 4th Year"
];

const isClassBelow12 = (classYear: string) => {
  const below12Classes = [
    "Class 1", "Class 2", "Class 3", "Class 4", "Class 5",
    "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11"
  ];
  return below12Classes.includes(classYear);
};

export default function App() {
  const [isDark, setIsDark] = useState(false);
  
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Nav state
  const [activeView, setActiveView] = useState("dashboard");
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);

  // Overlay states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [selectedRole, setSelectedRole] = useState<"student" | "teacher">("student");

  // Dynamic system database indexes loaded from server
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [dashboardStats, setDashboardStats] = useState<any>(null);

  // Student join code workflow state
  const [joinCode, setJoinCode] = useState("");
  const [codeSearchResult, setCodeSearchResult] = useState<any | null>(null);
  const [joinRequestStatus, setJoinRequestStatus] = useState<string>("none");
  const [joinSearchError, setJoinSearchError] = useState("");

  // Local state stats for client indicator
  const [dbMode, setDbMode] = useState("Local File Storage");
  const [dbStatus, setDbStatus] = useState("Local");

  // AUTH MODAL FORM States
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "", email: "", password: "",
    bio: "", specialization: "",
    classYear: "B.Tech 1st Year", section: "A", rollNo: "", studentId: ""
  });

  // Profile Form States
  const [profileForm, setProfileForm] = useState({
    name: "", bio: "", specialization: "",
    classYear: "", section: "", rollNo: "", studentId: "",
    notifPref: "In-App" as any
  });

  // Classroom creation Form States
  const [showCreateClassroomModal, setShowCreateClassroomModal] = useState(false);
  const [newClassroomForm, setNewClassroomForm] = useState({ name: "", subject: "", description: "" });

  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.me();
      if (res.user) {
        setUser(res.user);
        setProfileForm({
          name: res.user.name,
          bio: res.user.bio || "",
          specialization: res.user.specialization || "",
          classYear: res.user.classYear || "",
          section: res.user.section || "",
          rollNo: res.user.rollNo || "",
          studentId: res.user.studentId || "",
          notifPref: res.user.notificationPref?.method || "In-App"
        });
        setDbMode(res.databaseMode || "Local File Storage");
        setDbStatus(res.databaseStatus || "Offline Fallback Enabled");
        
        // Fetch active accounts databases
        loadUserData(res.user);
      }
    } catch (e) {
      clearToken();
    } finally {
      setLoading(false);
    }
  };

  const loadUserData = async (currUser: User) => {
    try {
      const cList = await api.listClassrooms();
      setClassrooms(cList);

      const nList = await api.listNotifications();
      setNotifications(nList);

      if (currUser.role === "teacher") {
        const reqs = await api.checkPendingRequests();
        setPendingRequestsCount(reqs.length);
      }

      const stats = await api.getDashboardStats();
      setDashboardStats(stats);
    } catch(e) {}
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setActiveView("dashboard");
    setSelectedClassroom(null);
    alert("🔒 Logged out securely. Come back soon!");
  };

  /* ============================================================
     AUTH HANDLERS
     ============================================================ */
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      alert("Please fill in email and password lines.");
      return;
    }
    try {
      const res = await api.login({
        email: loginForm.email,
        password: loginForm.password,
        role: selectedRole
      });
      setUser(res.user);
      setProfileForm({
        name: res.user.name,
        bio: res.user.bio || "",
        specialization: res.user.specialization || "",
        classYear: res.user.classYear || "",
        section: res.user.section || "",
        rollNo: res.user.rollNo || "",
        studentId: res.user.studentId || "",
        notifPref: res.user.notificationPref?.method || "In-App"
      });
      setDbMode(res.databaseMode || "Local File Storage");
      setDbStatus(res.databaseStatus || "Connected");
      loadUserData(res.user);
      setShowAuthModal(false);
      setLoginForm({ email: "", password: "" });
      alert("🎉 Logged in successfully!");
    } catch(err: any) {
      alert(err.message || "Failed authentication checks.");
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedRole === "student" && !isClassBelow12(registerForm.classYear) && !registerForm.studentId.trim()) {
      alert("Registration ID is mandatory for Class 12 and B.Tech levels.");
      return;
    }

    const payload = selectedRole === "teacher" 
      ? {
          name: registerForm.name,
          email: registerForm.email,
          password: registerForm.password,
          role: "teacher" as const,
          bio: registerForm.bio,
          specialization: registerForm.specialization
        }
      : {
          name: registerForm.name,
          email: registerForm.email,
          password: registerForm.password,
          role: "student" as const,
          bio: registerForm.bio,
          classYear: registerForm.classYear,
          section: registerForm.section,
          rollNo: registerForm.rollNo,
          studentId: registerForm.studentId
        };

    try {
      await api.register(payload);
      // Automatically login after successful registration
      const loginRes = await api.login({
        email: registerForm.email,
        password: registerForm.password,
        role: selectedRole
      });
      setUser(loginRes.user);
      setDbMode(loginRes.databaseMode || "Local File Storage");
      setDbStatus(loginRes.databaseStatus || "Connected");
      loadUserData(loginRes.user);
      setShowAuthModal(false);
      alert("✅ Registration and validation complete! Welcome onboard!");
    } catch(err: any) {
      if (err.message && (err.message.includes("ID already in use") || err.message.includes("already registered with this Student ID"))) {
        alert("ID already in use");
      } else {
        alert(err.message || "Could not register account.");
      }
    }
  };

  /* ============================================================
     STUDENT CODE VALIDATIONS GATEWAY
     ============================================================ */
  const handleTeacherCodeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinSearchError("");
    try {
      const cls = await api.searchTeacherByCode(joinCode.trim().toUpperCase());
      setCodeSearchResult(cls);
      
      const stat = await api.getJoinRequestStatus(cls._id || cls.id);
      setJoinRequestStatus(stat ? stat.status : "none");
    } catch(err: any) {
      setCodeSearchResult(null);
      setJoinRequestStatus("none");
      setJoinSearchError("There are no classrooms available with that code.");
    }
  };

  const handleSendRequestSubmit = async (classroomId: string) => {
    try {
      await api.sendJoinRequest(classroomId);
      alert("📤 Authorization request dispatched successfully!");
      setJoinRequestStatus("pending");
      if (user) loadUserData(user);
    } catch(err: any) {
      alert(err.message);
    }
  };

  /* ============================================================
     CLASSROOM ADMINISTRATIVE HANDLERS
     ============================================================ */
  const handleCreateClassroomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassroomForm.name || !newClassroomForm.subject) {
      alert("Name and Subject fields are mandatory.");
      return;
    }
    try {
      await api.createClassroom(newClassroomForm);
      alert("📖 Standard classroom created successfully on the database!");
      setShowCreateClassroomModal(false);
      setNewClassroomForm({ name: "", subject: "", description: "" });
      if (user) loadUserData(user);
    } catch(err: any) {
      alert(err.message);
    }
  };

  const handleDeleteClassroom = async (classroomId: string) => {
    if (!confirm("This will permanently drop this classroom and delete all standard content blocks. Confirm deletion?")) return;
    try {
      await api.deleteClassroom(classroomId);
      alert("Classroom Deleted.");
      setSelectedClassroom(null);
      if (user) loadUserData(user);
    } catch(e: any) {
      alert(e.message);
    }
  };

  /* ============================================================
     PROFILE DETAILS UPDATE
     ============================================================ */
  const handleProfileUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user && user.role === "student" && !isClassBelow12(profileForm.classYear) && !profileForm.studentId.trim()) {
      alert("Registration ID is mandatory for Class 12 and B.Tech levels.");
      return;
    }
    try {
      await api.updateProfile(profileForm);
      alert("👤 Profile details updated with success!");
      checkAuthentication();
    } catch(err: any) {
      alert(err.message);
    }
  };

  const selectClassroom = (c: Classroom | null) => {
    setSelectedClassroom(c);
  };

  const handleRegenerateCode = async () => {
    try {
      const updated = await api.regenerateCode();
      if (user) {
        setUser({ ...user, teacherCode: updated.teacherCode });
      }
      alert(`🚀 Code updated! Share your new Teacher Code with students: ${updated.teacherCode}`);
    } catch(err: any) {
      alert(err.message || "Failed to regenerate teacher code.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center">
        <GraduationCap className="h-14 w-14 text-indigo-400 animate-bounce mb-4" />
        <div className="text-sm font-extrabold uppercase tracking-widest text-slate-500 animate-pulse">Initializing Portal Interfaces...</div>
      </div>
    );
  }

  // Handle Logged Out Guest users
  if (!user) {
    return (
      <div className={isDark ? "dark" : ""}>
        <LandingPage 
          onOpenAuth={(mode, role) => {
            setAuthMode(mode);
            setSelectedRole(role);
            setShowAuthModal(true);
          }}
          isDark={isDark}
          onToggleTheme={() => setIsDark(!isDark)}
        />

        {/* AUTH MODAL DIALOGS */}
        {showAuthModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
            <div className={`w-full max-w-md p-8 rounded-3xl border shadow-2xl relative ${isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
              <button 
                onClick={() => setShowAuthModal(false)}
                className="absolute top-6 right-6 text-slate-450 hover:opacity-80 transition p-1"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="text-center mb-6">
                <span className="text-3xl">📚</span>
                <h3 className="font-display font-extrabold text-xl mt-2 select-none">
                  {authMode === "login" ? "Sign In Portal" : "Join Platform"}
                </h3>
                <p className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider mt-1.5">
                  Accessing as <strong className="text-indigo-500">{selectedRole}</strong> ledger
                </p>
              </div>

              {/* Role Toggle selector inside modals */}
              <div className="grid grid-cols-2 gap-2 bg-slate-500/5 p-1 rounded-xl mb-6">
                <button
                  onClick={() => setSelectedRole("student")}
                  className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${selectedRole === "student" ? "bg-indigo-600 text-white" : "text-slate-455 hover:text-white"}`}
                >
                  Student
                </button>
                <button
                  onClick={() => setSelectedRole("teacher")}
                  className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${selectedRole === "teacher" ? "bg-indigo-600 text-white" : "text-slate-455 hover:text-white"}`}
                >
                  Teacher
                </button>
              </div>

              {authMode === "login" ? (
                /* LOGIN FORM */
                <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs font-semibold">
                  <div>
                    <label className="text-slate-400 uppercase mb-1.5 block">Email Address</label>
                    <input 
                      type="email" required value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-100 text-slate-900"}`} placeholder="your@school.edu"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 uppercase mb-1.5 block">Password Code</label>
                    <input 
                      type="password" required value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-100 text-slate-900"}`} placeholder="••••••••"
                    />
                  </div>
                  <button type="submit" className="w-full py-4 text-xs font-extrabold uppercase bg-indigo-600 hover:bg-indigo-750 text-white tracking-widest rounded-xl transition shadow-md">Authenticate</button>
                  <p className="text-center text-[10px] text-slate-400 font-semibold mt-4">
                    New to Class Diary?{" "}
                    <button type="button" onClick={() => setAuthMode("register")} className="text-indigo-500 hover:underline">Register Account</button>
                  </p>
                </form>
              ) : (
                /* REGISTRATION FORM */
                <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs font-semibold max-h-[440px] overflow-y-auto pr-1">
                  <div>
                    <label className="text-slate-400 uppercase mb-1.5 block">Full Legal Name</label>
                    <input 
                      type="text" required value={registerForm.name} onChange={e => setRegisterForm({ ...registerForm, name: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-100 text-slate-900"}`} placeholder="Mr. John Doe / S. Rao"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 uppercase mb-1.5 block">Email Address</label>
                    <input 
                      type="email" required value={registerForm.email} onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-100 text-slate-900"}`} placeholder="john@school.edu"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 uppercase mb-1.5 block">Password Security</label>
                    <input 
                      type="password" required value={registerForm.password} onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })}
                      className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-100 text-slate-900"}`} placeholder="••••••••"
                    />
                  </div>

                  {/* Teacher specific fields */}
                  {selectedRole === "teacher" ? (
                    <>
                      <div>
                        <label className="text-slate-400 uppercase mb-1.5 block">Department Specialization</label>
                        <input 
                          type="text" required value={registerForm.specialization} onChange={e => setRegisterForm({ ...registerForm, specialization: e.target.value })}
                          className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-55 border-slate-100"}`} placeholder="e.g. Mathematics Department, Physics Faculty"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 uppercase mb-1.5 block">Short Bio Details</label>
                        <input 
                          type="text" value={registerForm.bio} onChange={e => setRegisterForm({ ...registerForm, bio: e.target.value })}
                          className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-55 border-slate-100"}`} placeholder="Expertise, degrees and support schedules..."
                        />
                      </div>
                    </>
                  ) : (
                    /* Student specific fields */
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-slate-400 uppercase mb-1.5 block">Academic Year</label>
                          <select 
                            value={registerForm.classYear} onChange={e => setRegisterForm({ ...registerForm, classYear: e.target.value })}
                            className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-55 border-slate-100 text-slate-800"}`}
                          >
                            {ACADEMIC_CLASSES.map(cls => (
                              <option key={cls} value={cls}>{cls}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-400 uppercase mb-1.5 block">Section</label>
                          <input 
                            type="text" required value={registerForm.section} onChange={e => setRegisterForm({ ...registerForm, section: e.target.value })}
                            className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-55 border-slate-100"}`} placeholder="e.g. A, B"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-slate-400 uppercase mb-1.5 block">Student Roll No</label>
                          <input 
                            type="text" required value={registerForm.rollNo} onChange={e => setRegisterForm({ ...registerForm, rollNo: e.target.value })}
                            className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-55 border-slate-100"}`} placeholder="Roll e.g. 54"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 uppercase mb-1.5 block">
                            Registration ID {!isClassBelow12(registerForm.classYear) ? <span className="text-amber-500 font-bold">*</span> : <span className="text-slate-500 font-normal">(Optional)</span>}
                          </label>
                          <input 
                            type="text" required={!isClassBelow12(registerForm.classYear)} value={registerForm.studentId} onChange={e => setRegisterForm({ ...registerForm, studentId: e.target.value })}
                            className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-55 border-slate-100"}`} placeholder={!isClassBelow12(registerForm.classYear) ? "e.g. SEC-2026-03" : "Not mandatory"}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-slate-400 uppercase mb-1.5 block">Biography</label>
                        <input 
                          type="text" value={registerForm.bio} onChange={e => setRegisterForm({ ...registerForm, bio: e.target.value })}
                          className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-55 border-slate-100"}`} placeholder="Describe focus tracks and learning goals..."
                        />
                      </div>
                    </>
                  )}

                  <button type="submit" className="w-full py-4 text-xs font-extrabold uppercase bg-amber-500 hover:bg-amber-600 text-white tracking-widest rounded-xl transition shadow-md">Complete Registration</button>
                  <p className="text-center text-[10px] text-slate-400 font-semibold mt-4">
                    Already registered?{" "}
                    <button type="button" onClick={() => setAuthMode("login")} className="text-indigo-500 hover:underline">Sign In Instead</button>
                  </p>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Handle Logged In Authenticated dashboard experience
  return (
    <div className={isDark ? "dark" : ""}>
      <AppShell
        user={user}
        onLogout={handleLogout}
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
          if (view !== "classroom-details") {
            setSelectedClassroom(null);
          }
          if (view === "dashboard" && user) {
            api.getDashboardStats()
              .then(setDashboardStats)
              .catch(() => {});
          }
        }}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        notifications={notifications}
        onMarkNotificationsRead={() => api.readAllNotifications().then(() => loadUserData(user))}
        dbMode={dbMode}
        dbStatus={dbStatus}
        classrooms={classrooms}
        selectedClassroom={selectedClassroom}
        onSelectClassroom={selectClassroom}
      >
        {/* ============================================================
            SECTOR 1: DASHBOARD HUB
            ============================================================ */}
        {activeView === "dashboard" && (
          <DashboardView 
            user={user} 
            classrooms={classrooms} 
            notifications={notifications} 
            pendingRequestsCount={pendingRequestsCount}
            dashboardStats={dashboardStats}
            onNavigate={(view) => {
              setActiveView(view);
            }}
            onSelectClassroom={(c) => {
              setSelectedClassroom(c);
              setActiveView("classroom-details");
            }}
            isDark={isDark}
          />
        )}

        {/* ============================================================
            SECTOR 2: CLASSROOM DIRECTORY
            ============================================================ */}
        {activeView === "classrooms" && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center pb-2 border-b dark:border-slate-800 flex-wrap gap-4">
              <div>
                <h1 className="font-display font-extrabold text-xl leading-tight select-none">Classrooms Study Boards</h1>
                <p className="text-xs text-slate-400 font-semibold mt-0.5 uppercase">Deploy subject timelines for verified students</p>
              </div>
              {user.role === "teacher" && (
                <button 
                  onClick={() => setShowCreateClassroomModal(true)}
                  className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 font-bold uppercase tracking-wider text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-xl transition flex items-center gap-1.5"
                >
                  <PlusCircle className="h-4 w-4" /> Create Classroom
                </button>
              )}
            </div>

            {/* CLASSROOM INDEX GRID */}
            {classrooms.length === 0 ? (
              <div className="text-center py-16 text-slate-400 font-semibold text-xs border border-dashed border-slate-500/20 rounded-3xl max-w-lg mx-auto">
                <span className="text-4xl block mb-2">🎓</span>
                <p className="uppercase leading-normal">Your Classroom database index is currently empty.</p>
                {user.role === "teacher" ? <p className="text-[10px] text-slate-500 mt-1">Spin up study boards using the "Create Classroom" button.</p> : <p className="text-[10px] text-slate-500 mt-1">Use "Join Teacher Board" side menu option to connect with high-school instructors.</p>}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {classrooms.map(c => (
                  <div key={c._id} className={`p-6 rounded-2xl border transition-all hover:shadow-md flex flex-col justify-between ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-205"}`}>
                    <div>
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <div className="h-12 w-12 text-white bg-indigo-600 font-bold flex items-center justify-center rounded-xl text-sm leading-none shadow select-none">
                          {c.name.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-[10px] px-2.5 py-1 bg-slate-500/10 text-slate-400 rounded-full font-bold uppercase tracking-widest">{c.subject}</span>
                      </div>
                      <h3 className="font-display font-bold text-md mb-2">{c.name}</h3>
                      <p className="text-xs text-slate-400 leading-normal mb-4">{c.description || "Interactive diary logs for subject " + c.subject}</p>
                    </div>

                    <div className="border-t dark:border-slate-800 pt-4 mt-2 flex justify-between items-center">
                      <button
                        onClick={() => {
                          setSelectedClassroom(c);
                          setActiveView("classroom-details");
                        }}
                        className="px-3.5 py-2 hover:bg-indigo-600 hover:text-white border-2 border-indigo-600 text-indigo-600 font-extrabold uppercase text-[10px] tracking-widest rounded-lg transition"
                      >
                        Enter Room
                      </button>
                      
                      {user.role === "teacher" && (
                        <button 
                          onClick={() => handleDeleteClassroom(c._id)}
                          className="p-1.5 text-slate-450 hover:text-red-500"
                        >
                          <Trash2 className="h-4.5 w-4.5 text-slate-600 hover:text-red-500 cursor-pointer" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CREATE CLASSROOM INLINE MODAL */}
            {showCreateClassroomModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
                <div className={`w-full max-w-md p-8 rounded-3xl border shadow-xl relative ${isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
                  <button onClick={() => setShowCreateClassroomModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-white p-1"><X className="h-5 w-5" /></button>
                  <h3 className="font-display font-extrabold text-md mb-6 uppercase select-none">Assemble Study Board</h3>
                  
                  <form onSubmit={handleCreateClassroomSubmit} className="space-y-4 text-xs font-semibold">
                    <div>
                      <label className="text-slate-450 uppercase mb-1.5 block">Classroom Name *</label>
                      <input 
                        type="text" required value={newClassroomForm.name} onChange={e => setNewClassroomForm({ ...newClassroomForm, name: e.target.value })}
                        className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-100"}`} placeholder="e.g. Class 11 - Section B Mathematics"
                      />
                    </div>
                    <div>
                      <label className="text-slate-450 uppercase mb-1.5 block">Subject Department *</label>
                      <input 
                        type="text" required value={newClassroomForm.subject} onChange={e => setNewClassroomForm({ ...newClassroomForm, subject: e.target.value })}
                        className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-100"}`} placeholder="e.g. Mathematics, Calculus, DCD-A1"
                      />
                    </div>
                    <div>
                      <label className="text-slate-450 uppercase mb-1.5 block">Brief Description</label>
                      <input 
                        type="text" value={newClassroomForm.description} onChange={e => setNewClassroomForm({ ...newClassroomForm, description: e.target.value })}
                        className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-55"}`} placeholder="Study curriculum, lecture guidelines, reference books"
                      />
                    </div>
                    <button type="submit" className="w-full py-4 text-xs font-extrabold uppercase bg-indigo-650 hover:bg-indigo-750 text-indigo-400 bg-indigo-500/10 tracking-widest rounded-xl shadow-md">Establish Classroom Board</button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            SECTOR 3: MAIN DYNAMIC WORKSPACE ROUTE
            ============================================================ */}
        {activeView === "classroom-details" && selectedClassroom && (
          <ClassroomView 
            user={user} 
            classroom={selectedClassroom}
            onNavigate={(view) => {
              setActiveView(view);
            }} 
            isDark={isDark}
          />
        )}

        {/* ============================================================
            SECTOR 4: JOIN WORKFLOW GATEWAY
            ============================================================ */}
        {activeView === "join" && user.role === "student" && (
          <div className="space-y-6 animate-fadeIn max-w-2xl mx-auto">
            <div className="pb-2 border-b dark:border-slate-800">
              <h1 className="font-display font-extrabold text-xl leading-tight select-none">Join Classroom Timeline</h1>
              <p className="text-xs text-slate-400 font-semibold mt-0.5 uppercase">Request manual authorization using dynamic teacher verification codes</p>
            </div>

            {/* Validation search box */}
            <div className={`p-6 rounded-3xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} shadow`}>
              <form onSubmit={handleTeacherCodeSearch} className="flex gap-2 text-xs font-semibold">
                <input
                  type="text"
                  required
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                  className={`flex-1 p-3.5 rounded-lg border outline-none font-mono font-extrabold uppercase text-center text-sm ${isDark ? "bg-slate-900 border-slate-800 focus:border-indigo-505" : "bg-slate-50 border-slate-200 focus:border-indigo-600"}`}
                  placeholder="Paste teacher Code (e.g. tcr-xxxxxx)"
                />
                <button type="submit" className="px-5 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold uppercase rounded-lg">Query Code</button>
              </form>
            </div>

            {joinSearchError && (
              <div className="p-6 rounded-3xl border border-dashed border-red-400/30 bg-red-55/10 bg-red-500/5 text-center text-red-500 text-xs font-semibold animate-slideUp max-w-lg mx-auto">
                <span className="text-2xl block mb-1">⚠️</span>
                <p>{joinSearchError}</p>
              </div>
            )}

            {/* Results validation panel */}
            {codeSearchResult && (
              <div className={`p-6 rounded-3xl border animate-slideUp space-y-4 ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} shadow-xl`}>
                <div className="flex justify-between items-start pb-2 border-b dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">📖</span>
                    <div>
                      <h4 className="font-display font-bold text-slate-800 dark:text-white text-sm">{codeSearchResult.name}</h4>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Subject: {codeSearchResult.subject}</span>
                    </div>
                  </div>
                  {codeSearchResult.teacher && (
                    <span className="text-[10px] px-2 py-0.5 bg-slate-500/10 text-slate-400 uppercase font-bold tracking-widest rounded-full">
                      Teacher: {typeof codeSearchResult.teacher === "object" ? codeSearchResult.teacher.name : "Lecturer"}
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-500 leading-normal">
                  <strong className="text-slate-400">Classroom Syllabus/Description:</strong> {codeSearchResult.description || "No description provided."}
                </div>

                {/* Validation status checker action */}
                <div className="pt-2">
                  {joinRequestStatus === "approved" ? (
                    <div className="inline-flex items-center gap-2 p-3 bg-emerald-500/10 text-emerald-500 rounded-xl font-bold text-xs">
                      <CheckCircle className="h-5 w-5" /> Connection approved by Lecturer! Access active boards inside sections menus.
                    </div>
                  ) : joinRequestStatus === "pending" ? (
                    <div className="inline-flex items-center gap-2 p-3 bg-amber-500/10 text-amber-500 rounded-xl font-bold text-xs">
                      <ShieldAlert className="h-5 w-5 animate-pulse" /> Connection Request dispatch complete. Validation pending manually from Lecturer.
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSendRequestSubmit(codeSearchResult._id || codeSearchResult.id || "")}
                      className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold uppercase text-xs rounded-xl tracking-wider shadow"
                    >
                      Dispatch Request Connection
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            SECTOR 5: MANUAL REQUEST VALIDATIONS Queue FOR TEACHERS
            ============================================================ */}
        {activeView === "connections" && user.role === "teacher" && (
          <div className="space-y-6 animate-fadeIn max-w-2xl mx-auto">
            <div className="pb-2 border-b dark:border-slate-800">
              <h1 className="font-display font-extrabold text-xl leading-tight select-none">Student connection control</h1>
              <p className="text-xs text-slate-400 font-semibold mt-0.5 uppercase">Approve manual requests to access standard boards</p>
            </div>

            {/* Validation settings quick view */}
            <div className={`p-6 rounded-3xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} flex justify-between items-center`}>
              <div>
                <h4 className="font-display font-extrabold text-xs uppercase tracking-wide text-indigo-400">Unique Code distribution</h4>
                <code className="text-lg font-mono text-white text-indigo-400 font-extrabold block mt-1 uppercase bg-indigo-500/10 py-1 px-3.5 rounded-lg select-all w-fit">{user.teacherCode || "UNAVAIL"}</code>
              </div>
              <button
                onClick={handleRegenerateCode}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 font-bold uppercase text-[10px] tracking-widest text-white rounded-lg transition"
              >
                Regenerate Secure Key
              </button>
            </div>

            <div className={`p-6 rounded-3xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"}`}>
              <h3 className="font-display font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-4">Pending Student connection requests</h3>
              <div className="text-xs font-semibold">
                {pendingRequestsCount === 0 ? (
                  <p className="py-6 text-center text-slate-500">No validations pending. All student join actions handled.</p>
                ) : (
                  <p className="text-slate-400">Open Classroom settings overlay to review pending student requests and clear validation queues quickly!</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            SECTOR 6: PROFILE DETAILS WORKSPACE
            ============================================================ */}
        {activeView === "profile" && (
          <div className="space-y-6 animate-fadeIn max-w-2xl mx-auto">
            <div className="pb-2 border-b dark:border-slate-800">
              <h1 className="font-display font-extrabold text-xl leading-tight select-none">Profile Workspaces</h1>
              <p className="text-xs text-slate-400 font-semibold mt-0.5 uppercase">Modify legal documentation and notification alarms</p>
            </div>

            <div className={`p-8 rounded-3xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-202"} shadow-xl`}>
              <form onSubmit={handleProfileUpdateSubmit} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="text-slate-400 uppercase mb-1.5 block">Full Legal Name</label>
                  <input 
                    type="text" required value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                    className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-50 border-slate-100 text-slate-910"}`} placeholder="Mr. John Doe"
                  />
                </div>

                {user.role === "teacher" ? (
                  <>
                    <div>
                      <label className="text-slate-400 uppercase mb-1.5 block">Department / Specialization Title</label>
                      <input 
                        type="text" value={profileForm.specialization} onChange={e => setProfileForm({ ...profileForm, specialization: e.target.value })}
                        className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-50 border-slate-100"}`} placeholder="Mathematics faculty, CSE professor"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 uppercase mb-1.5 block">Bibliography Background</label>
                      <textarea 
                        value={profileForm.bio} onChange={e => setProfileForm({ ...profileForm, bio: e.target.value })} rows={3}
                        className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-50 border-slate-100"}`} placeholder="Specialization details..."
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 uppercase mb-1.5 block">Class Year</label>
                        <select 
                          value={profileForm.classYear} onChange={e => setProfileForm({ ...profileForm, classYear: e.target.value })}
                          className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-50 border-slate-100 text-slate-800"}`}
                        >
                          <option value="">Select Academic Year</option>
                          {ACADEMIC_CLASSES.map(cls => (
                            <option key={cls} value={cls}>{cls}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 uppercase mb-1.5 block">Section</label>
                        <input 
                          type="text" value={profileForm.section} onChange={e => setProfileForm({ ...profileForm, section: e.target.value })}
                          className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-50 border-slate-100"}`} placeholder="Section"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 font-semibold">
                      <div>
                        <label className="text-slate-400 uppercase mb-1.5 block">Student Roll No</label>
                        <input 
                          type="text" value={profileForm.rollNo} onChange={e => setProfileForm({ ...profileForm, rollNo: e.target.value })}
                          className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-50 border-slate-100"}`} placeholder="Roll No"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 uppercase mb-1.5 block">
                          Registration ID {!isClassBelow12(profileForm.classYear) ? <span className="text-amber-500 font-bold">*</span> : <span className="text-slate-500 font-normal">(Optional)</span>}
                        </label>
                        <input 
                          type="text" value={profileForm.studentId} onChange={e => setProfileForm({ ...profileForm, studentId: e.target.value })}
                          className={`w-full p-3 rounded-lg border outline-none ${isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-50 border-slate-100"}`} placeholder={!isClassBelow12(profileForm.classYear) ? "e.g. SEC-2026-03" : "Not mandatory"}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Notifications settings configuration */}
                <div className="pt-4 border-t dark:border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 block mb-2">Notification alert preferences</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {["In-App", "Email", "Both", "Disabled"].map(pref => (
                      <button
                        type="button" key={pref}
                        onClick={() => setProfileForm({ ...profileForm, notifPref: pref as any })}
                        className={`p-2 border text-center font-bold tracking-wide rounded-lg uppercase ${profileForm.notifPref === pref ? "bg-indigo-600 border-indigo-600 text-white" : "bg-transparent text-slate-500 hover:text-white"}`}
                      >
                        {pref}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed mt-2.5">
                    Configure alarms triggers whenever classroom lessons, homework docs, assignments scores or Zweifel duda feedback are logged.
                  </p>
                </div>

                <div className="pt-2">
                  <button type="submit" className="px-5 py-3 text-xs font-extrabold uppercase bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-md">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </AppShell>
    </div>
  );
}
