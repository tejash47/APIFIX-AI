import React from "react";
import { User, Classroom, Notification } from "../types";
import { BookOpen, Award, HelpCircle, FileText, Bell, Users, PlusCircle, Sparkles } from "lucide-react";

interface DashboardViewProps {
  user: User;
  classrooms: Classroom[];
  notifications: Notification[];
  pendingRequestsCount?: number;
  unresolvedDoubtsCount?: number;
  dashboardStats?: any;
  onNavigate: (view: string) => void;
  onSelectClassroom: (c: Classroom) => void;
  isDark: boolean;
}

export function DashboardView({
  user,
  classrooms,
  notifications,
  pendingRequestsCount = 0,
  unresolvedDoubtsCount = 0,
  dashboardStats,
  onNavigate,
  onSelectClassroom,
  isDark
}: DashboardViewProps) {
  const currentDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const isTeacher = user.role === "teacher";

  // Dynamic values parsed from db dashboard stats
  const stats = isTeacher
    ? [
        { 
          label: "My Classrooms", 
          value: (dashboardStats?.classroomsCount ?? classrooms.length).toString(), 
          desc: "Active lecture boards", 
          color: "text-indigo-500", 
          icon: <BookOpen className="h-5 w-5" /> 
        },
        { 
          label: "Pending Validations", 
          value: (dashboardStats?.pendingRequestsCount ?? pendingRequestsCount).toString(), 
          desc: "Student join requests", 
          color: "text-amber-500", 
          icon: <Award className="h-5 w-5" /> 
        },
        { 
          label: "Inbox Doubts", 
          value: (dashboardStats?.unresolvedDoubtsCount ?? 0).toString(), 
          desc: "Q&A doubt tickets", 
          color: "text-cyan-500", 
          icon: <HelpCircle className="h-5 w-5" /> 
        },
        { 
          label: "Announcements Released", 
          value: (dashboardStats?.announcementsCount ?? 0).toString(), 
          desc: "Covers all classrooms", 
          color: "text-emerald-500", 
          icon: <Bell className="h-5 w-5" /> 
        }
      ]
    : [
        { 
          label: "My Classrooms", 
          value: (dashboardStats?.classroomsCount ?? classrooms.length).toString(), 
          desc: "Joined lecturer feeds", 
          color: "text-indigo-500", 
          icon: <BookOpen className="h-5 w-5" /> 
        },
        { 
          label: "Pending Submissions", 
          value: (dashboardStats?.pendingSubmissionsCount ?? 0).toString(), 
          desc: "Assignments remaining", 
          color: "text-amber-500", 
          icon: <FileText className="h-5 w-5" /> 
        },
        { 
          label: "Submissions Made", 
          value: (dashboardStats?.submissionsCount ?? 0).toString(), 
          desc: "Works sent to teachers", 
          color: "text-emerald-500", 
          icon: <Users className="h-5 w-5" /> 
        },
        { 
          label: "Open Doubts", 
          value: (dashboardStats?.openDoubtsCount ?? 0).toString(), 
          desc: "Awaiting answer state", 
          color: "text-cyan-500", 
          icon: <HelpCircle className="h-5 w-5" /> 
        }
      ];

  const handleClassroomClick = (c: Classroom) => {
    onSelectClassroom(c);
    onNavigate("classroom-details");
  };

  // Generate dynamic bar charts from classrooms data
  const chartData = dashboardStats?.classroomStats || [];
  const hasChartData = chartData.length > 0 && chartData.some((c: any) => c.lessons > 0 || c.materials > 0 || c.assignments > 0);

  // Student specific submissions rates
  const submittedCount = dashboardStats?.submissionsCount || 0;
  const pendingCount = dashboardStats?.pendingSubmissionsCount || 0;
  const totalHomework = submittedCount + pendingCount;
  const submissionRate = totalHomework > 0 ? Math.round((submittedCount / totalHomework) * 100) : 0;
  const pendingRate = totalHomework > 0 ? Math.round((pendingCount / totalHomework) * 100) : 0;

  return (
    <div className="space-y-8 animate-fadeIn font-sans">
      {/* WELCOME SECTION */}
      <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b ${isDark ? "border-slate-800 pb-6" : "border-[#DBDFE2] pb-6"}`}>
        <div>
          <h1 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-slate-800 dark:text-white mb-1.5 select-none">
            Welcome back, {user.name.split(" ")[0]}! 👋
          </h1>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {currentDate} — Connected as {user.role === "teacher" ? `specialized ${user.specialization || "faculty"}` : `academic class ${user.classYear || "Standard"}`}
          </p>
        </div>
        <div>
          {isTeacher ? (
            <button 
              onClick={() => onNavigate("classrooms")}
              className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white uppercase tracking-wider rounded-lg transition-all shadow-sm shadow-indigo-500/10"
            >
              <PlusCircle className="h-4 w-4" /> Create Classroom
            </button>
          ) : (
            <button 
              onClick={() => onNavigate("join")}
              className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white uppercase tracking-wider rounded-lg transition-all shadow-sm shadow-indigo-500/10"
            >
              <Award className="h-4 w-4" /> Join Teacher Code
            </button>
          )}
        </div>
      </div>

      {/* STATS MATRIX */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, idx) => (
          <div key={idx} className={`p-6 rounded-lg border ${isDark ? "bg-[#1A1C1E] border-slate-800" : "bg-white border-[#DBDFE2]"} flex items-start gap-4 shadow-sm transition hover:shadow-md`}>
            <div className={`p-3 rounded-lg bg-slate-500/5 ${s.color}`}>
              {s.icon}
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-2">{s.label}</div>
              <div className="text-2xl font-display font-extrabold text-slate-800 dark:text-white mb-1">{s.value}</div>
              <div className="text-[10px] text-slate-400 font-semibold">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CHARTS GRAPHICS WITH REAL DATA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Dynamic Activity / Resource Share Chart */}
        <div className={`p-6 rounded-lg border ${isDark ? "bg-[#1A1C1E] border-slate-800" : "bg-white border-[#DBDFE2]"} flex flex-col justify-between h-72`}>
          <div className="flex justify-between items-center border-b dark:border-slate-800 pb-3">
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-500">📈 Classroom Resource Activity</h3>
            <span className="text-[10px] px-2.5 py-1 bg-emerald-500/10 text-emerald-500 rounded font-bold uppercase tracking-wider">Dynamic Status</span>
          </div>

          {!hasChartData ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <span className="text-2xl mb-1 text-slate-400">📊</span>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">No active modules released yet</p>
              <p className="text-[9px] text-slate-500 max-w-[240px] mt-1">Publish lessons, study resources, or home assignments inside your classrooms to display graph lines.</p>
            </div>
          ) : (
            <div className="flex-1 h-36 w-full flex items-end justify-around pt-4 pb-2">
              {chartData.map((item: any, idx: number) => {
                const totalLessons = item.lessons || 0;
                const totalAssignments = item.assignments || 0;
                const totalMaterials = item.materials || 0;
                const totalUnits = totalLessons + totalMaterials + totalAssignments;
                
                // Height between 10% and 100% depending on activity weight
                const heightPercentage = Math.min(100, Math.max(12, totalUnits * 8));

                return (
                  <div key={idx} className="flex flex-col items-center gap-2 group w-20">
                    <span className="text-[9px] font-extrabold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {totalUnits} units
                    </span>
                    <div className="w-5 bg-slate-500/10 rounded-full h-24 flex items-end">
                      <div 
                        className="w-full rounded transition-all duration-500 bg-indigo-500 group-hover:bg-indigo-650" 
                        style={{ height: `${heightPercentage}%` }} 
                      />
                    </div>
                    <span className="text-[9px] tracking-wide text-slate-500 font-bold uppercase truncate max-w-[70px]" title={item.classroomName}>
                      {item.classroomName}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dynamic Tasks / Submissions State card */}
        <div className={`p-6 rounded-lg border ${isDark ? "bg-[#1A1C1E] border-slate-800" : "bg-white border-[#DBDFE2]"} flex flex-col justify-between h-72`}>
          <div className="flex justify-between items-center border-b dark:border-slate-800 pb-3">
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-500">📋 Homework Timeline Completion</h3>
            <span className="text-[10px] px-2.5 py-1 bg-indigo-500/10 text-indigo-500 rounded font-bold uppercase tracking-wider">Verification status</span>
          </div>

          {user.role === "teacher" ? (
            <div className="flex-1 flex flex-col justify-center space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-lg">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Teacher Core Monitor</h4>
                  <p className="text-[10px] text-slate-500">Dynamic tracking checks pending submissions automatically.</p>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-500/5 text-slate-500 text-[11px] font-semibold text-center border border-dashed border-slate-500/10">
                You currently have <span className="text-indigo-500 font-bold">{(dashboardStats?.announcementsCount ?? 0)} Announcements</span> issued.
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center space-y-5">
              {totalHomework === 0 ? (
                <div className="text-center p-4">
                  <span className="text-2xl mb-1 text-slate-400 block">📝</span>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">No assignments released yet</p>
                  <p className="text-[9px] text-slate-500 max-w-[240px] mt-1 mx-auto">Your teachers haven't assigned any active homework tasks to your boards.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-700 dark:text-slate-300">Submitted Homework Tasks</span>
                      <span className="text-slate-500">{submittedCount}/{totalHomework} ({submissionRate}%)</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-500/10 overflow-hidden">
                      <div className="h-full rounded bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500" style={{ width: `${submissionRate}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-700 dark:text-slate-300">Outstanding Homework Tasks</span>
                      <span className="text-slate-500">{pendingCount}/{totalHomework} ({pendingRate}%)</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-500/10 overflow-hidden">
                      <div className="h-full rounded bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500" style={{ width: `${pendingRate}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RECENT FEED LIST MODULES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Classboards directory list */}
        <div className={`p-6 rounded-lg border ${isDark ? "bg-[#1A1C1E] border-slate-800" : "bg-white border-[#DBDFE2]"}`}>
          <div className="flex justify-between items-center mb-6 border-b dark:border-slate-800 pb-4">
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-white">Active Class Boards ({classrooms.length})</h3>
            <button 
              onClick={() => onNavigate("classrooms")}
              className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Configure Boards
            </button>
          </div>

          {classrooms.length === 0 ? (
            <div className="text-center py-12 px-6">
              <span className="text-2xl mb-2 block select-none">🎒</span>
              <p className="text-slate-400 text-xs font-semibold">Database currently empty.</p>
              <p className="text-slate-500 text-[10px] mt-1">Enter your teacher's join code or set up classrooms to populate your timeline feed.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {classrooms.slice(0, 4).map(c => (
                <div 
                  key={c._id}
                  onClick={() => handleClassroomClick(c)}
                  className={`p-4 rounded-lg border ${isDark ? "bg-slate-900 border-slate-800 hover:bg-slate-850" : "bg-[#F8F9FA] border-slate-100 hover:bg-white hover:border-[#DBDFE2] hover:shadow-sm"} flex items-center justify-between cursor-pointer transition`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="h-10 w-10 text-white bg-indigo-600 rounded flex items-center justify-center font-bold text-xs select-none">
                      {c.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-800 dark:text-white truncate">{c.name}</div>
                      <span className="text-[10px] text-slate-400 font-semibold truncate leading-none mt-1 block">{c.description || "Subject: " + c.subject}</span>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 bg-slate-500/10 text-slate-500 rounded font-bold uppercase tracking-wider">{c.subject}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* GENUINE USER TIMELINE UPDATE LOGS - NO FAKE ACTIVITIES */}
        <div className={`p-8 rounded-lg border ${isDark ? "bg-[#1A1C1E] border-slate-800" : "bg-white border-[#DBDFE2]"}`}>
          <div className="flex justify-between items-center mb-6 pb-6 border-b dark:border-slate-800 border-slate-100">
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-white">Recent Activities & Alerts</h3>
            <span className="px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-500 text-[10px] font-bold uppercase tracking-wider">Live Feed</span>
          </div>
          
          <div className="space-y-4">
            {notifications.length === 0 ? (
              <div className="text-center py-12 px-6">
                <span className="text-xl mb-1 block select-none">🔔</span>
                <p className="text-slate-400 text-xs font-semibold">No recent timeline logs.</p>
                <p className="text-slate-500 text-[9px] mt-1">Activities inside classrooms will show here in real-time.</p>
              </div>
            ) : (
              notifications.slice(0, 3).map((n, i) => {
                const formattedTime = new Date(n.createdAt).toLocaleDateString("en-IN", {
                  hour: "numeric",
                  minute: "numeric"
                });
                return (
                  <div key={i} className="flex gap-4 items-start text-xs leading-relaxed animate-fadeIn">
                    <span className="text-lg">📢</span>
                    <div>
                      <p className="text-indigo-500 font-extrabold text-[10px] uppercase tracking-wide">
                        {n.type.replace(/_/g, " ")}
                      </p>
                      <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs mt-0.5">{n.text}</div>
                      <div className="text-slate-400 text-[9px] font-medium block mt-1">{formattedTime}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default DashboardView;
