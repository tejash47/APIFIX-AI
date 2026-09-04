import React, { useState } from "react";
import { User, Classroom, Notification } from "../types";
import { 
  Home, BookOpen, FileText, FolderOpen, HelpCircle, Target, Bell, 
  MessageSquare, User as UserIcon, LogOut, Menu, X, Sun, Moon, 
  Search, ShieldAlert, Award
} from "lucide-react";

interface AppShellProps {
  user: User;
  onLogout: () => void;
  activeView: string;
  onNavigate: (view: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  notifications: Notification[];
  onMarkNotificationsRead: () => void;
  dbMode: string;
  dbStatus: string;
  classrooms: Classroom[];
  selectedClassroom: Classroom | null;
  onSelectClassroom: (c: Classroom | null) => void;
  children: React.ReactNode;
}

export function AppShell({
  user,
  onLogout,
  activeView,
  onNavigate,
  isDark,
  onToggleTheme,
  notifications,
  onMarkNotificationsRead,
  dbMode,
  dbStatus,
  classrooms,
  selectedClassroom,
  onSelectClassroom,
  children
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const unreadNotifs = notifications.filter(n => !n.read).length;

  const handleNavClick = (view: string) => {
    onNavigate(view);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const navItems = user.role === "teacher" 
    ? [
        { id: "dashboard", label: "Dashboard Hub", icon: <Home className="h-4 w-4" /> },
        { id: "classrooms", label: "My Classrooms", icon: <BookOpen className="h-4 w-4" /> },
        { id: "connections", label: "Student Validation", icon: <Award className="h-4 w-4" /> },
        { id: "profile", label: "My Profile Details", icon: <UserIcon className="h-4 w-4" /> }
      ]
    : [
        { id: "dashboard", label: "Dashboard Hub", icon: <Home className="h-4 w-4" /> },
        { id: "join", label: "Join Teacher Board", icon: <Award className="h-4 w-4" /> },
        { id: "classrooms", label: "My Classrooms", icon: <BookOpen className="h-4 w-4" /> },
        { id: "profile", label: "My Profile Details", icon: <UserIcon className="h-4 w-4" /> }
      ];

  return (
    <div className={`flex min-h-screen ${isDark ? "bg-slate-950 text-slate-100" : "bg-[#F1F3F5] text-slate-900"} transition-colors duration-200`}>
      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#1A1C1E] text-slate-300 flex flex-col transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Sidebar Header */}
        <div className="h-20 flex items-center gap-3 px-6 border-b border-slate-800 bg-[#1A1C1E]">
          <div className="h-8 w-8 rounded bg-indigo-505 bg-indigo-500 flex items-center justify-center font-bold text-white shadow text-sm select-none">
            D
          </div>
          <div>
            <div className="font-display font-bold text-lg text-white leading-none tracking-tight">
              Digital Diary
            </div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mt-1">
              {user.role} Workspace
            </span>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)} 
            className="lg:hidden p-1.5 rounded bg-slate-850 text-slate-400 hover:text-white ml-auto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Database Warning indicator as instructed */}
        <div className="px-4 py-2 border-b border-slate-800 bg-[#131517]/60">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${dbStatus === "Connected" ? "bg-emerald-500 animate-pulse" : "bg-amber-400"} flex-shrink-0`} />
            <div className="text-[10px] font-semibold text-slate-400 uppercase truncate">
              {dbMode}
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-bold tracking-wide transition-all ${
                activeView === item.id 
                  ? "bg-slate-800 text-white shadow-sm border border-slate-700/30" 
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
              }`}
            >
              <span className={activeView === item.id ? "text-white opacity-100" : "text-slate-400 opacity-70"}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}

          {/* Quick Classroom Shortcut section inside the sidebar to improve the UX */}
          {classrooms.length > 0 && (
            <div className="pt-6 space-y-1.5">
              <div className="text-[10px] uppercase font-extrabold text-indigo-400/60 px-3 tracking-widest mb-3">
                Approved Classrooms
              </div>
              {classrooms.map(c => (
                <button
                  key={c._id}
                  onClick={() => {
                    onSelectClassroom(c);
                    handleNavClick("classroom-details");
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-lg transition ${
                    selectedClassroom?._id === c._id && activeView === "classroom-details"
                      ? "bg-slate-900 text-white font-bold"
                      : "text-slate-400 hover:bg-slate-900/30 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px]">📖</span>
                    <span className="truncate">{c.name}</span>
                  </div>
                  <span className="text-slate-600 font-mono text-[9px]">{c.subject}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* User Footer profile drawer */}
        <div className="p-4 border-t border-slate-800 bg-[#131517] flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-indigo-505 bg-indigo-500 text-white font-bold flex items-center justify-center text-xs">
            {user.avatar || user.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold truncate text-white leading-tight">{user.name}</div>
            <span className="text-[9px] text-slate-500 font-semibold uppercase">{user.role} account</span>
          </div>
          <button 
            onClick={onLogout}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-900 transition-colors"
            title="Log out securely"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </aside>

      {/* BODY CONTEXT */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* TOPBAR */}
        <header className={`h-20 fixed top-0 right-0 left-0 lg:left-64 z-30 flex items-center justify-between px-6 border-b transition-colors duration-200 ${isDark ? "bg-slate-900/95 border-slate-800" : "bg-white/95 border-slate-200/80"} backdrop-blur-md`}>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(true)} 
              className="lg:hidden p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-400">
              <span>Workspace</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold capitalize select-none">
                {activeView.replace("-", " ")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Dark switch */}
            <button 
              onClick={onToggleTheme} 
              className={`p-2 rounded-lg border ${isDark ? "bg-slate-800 border-slate-700 text-amber-400" : "bg-slate-100 border-slate-200 text-slate-500"} hover:opacity-80 transition`}
            >
              {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>

            {/* Notification triggers */}
            <div className="relative">
              <button 
                onClick={() => setNotifPanelOpen(!notifPanelOpen)}
                className={`p-2 rounded-lg border relative ${isDark ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-600"} hover:opacity-80 transition`}
              >
                <Bell className="h-4.5 w-4.5" />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-red-500 text-white rounded-full text-[9px] font-extrabold flex items-center justify-center animate-bounce">
                    {unreadNotifs}
                  </span>
                )}
              </button>

              {/* Notification Popover Panel */}
              {notifPanelOpen && (
                <div className={`absolute right-0 top-11 w-80 rounded-xl border shadow-xl z-50 overflow-hidden ${isDark ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`}>
                  <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-slate-950 text-white">
                    <h4 className="font-display font-bold text-xs uppercase tracking-wide">Notifications Board</h4>
                    {unreadNotifs > 0 && (
                      <button 
                        onClick={() => {
                          onMarkNotificationsRead();
                          setNotifPanelOpen(false);
                        }}
                        className="text-[10px] font-extrabold uppercase text-cyan-400 hover:underline"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divided dark:divide-slate-800 text-xs">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 font-medium select-none">No notifications recorded yet</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n._id} className={`p-4 border-b last:border-0 dark:border-slate-800 flex items-start gap-3 hover:bg-slate-500/5 transition ${n.read ? "opacity-60" : "font-semibold bg-indigo-500/5"}`}>
                          <div className={`h-2.5 w-2.5 rounded-full mt-1.5 flex-shrink-0 ${n.read ? "bg-slate-600" : "bg-indigo-600 animate-pulse"}`} />
                          <div>
                            <div className="leading-snug text-slate-700 dark:text-slate-300">{n.text}</div>
                            <span className="text-[10px] text-slate-400 mt-1 block">Just now</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile badge links */}
            <div 
              onClick={() => handleNavClick("profile")}
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition py-1 px-2.5 rounded-lg bg-slate-500/5"
            >
              <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-xs select-none">
                {user.avatar || user.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold leading-tight">{user.name.split(" ")[0]}</div>
                <span className="text-[9px] text-slate-400 uppercase font-semibold">{user.role}</span>
              </div>
            </div>
          </div>
        </header>

        {/* CONTAINER CONTENT */}
        <main className="flex-1 pt-28 pb-12 px-6 md:px-8 max-w-6xl w-full mx-auto font-sans">
          {children}
        </main>
      </div>
    </div>
  );
}
export default AppShell;
