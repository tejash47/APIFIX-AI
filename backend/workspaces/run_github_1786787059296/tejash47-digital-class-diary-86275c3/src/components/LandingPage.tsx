import React, { useState } from "react";
import { BookOpen, Award, Users, ChevronRight, HelpCircle, Mail, Phone, MapPin, Clock, Moon, Sun, ArrowRight, ShieldCheck, GraduationCap, Laptop } from "lucide-react";

interface LandingPageProps {
  onOpenAuth: (mode: "login" | "register", role: "student" | "teacher") => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export function LandingPage({ onOpenAuth, isDark, onToggleTheme }: LandingPageProps) {
  const [contactForm, setContactForm] = useState({ name: "", email: "", message: "", role: "Student" });

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`🎉 Message sent by ${contactForm.name}! Our admissions support team will respond to ${contactForm.email} within 24 hours.`);
    setContactForm({ name: "", email: "", message: "", role: "Student" });
  };

  return (
    <div className={`min-h-screen ${isDark ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"} transition-colors duration-200`}>
      {/* NAVIGATION HEADER */}
      <nav className={`fixed top-0 left-0 right-0 z-50 h-[72px] flex items-center justify-between px-6 md:px-12 border-b ${isDark ? "bg-slate-900/90 border-slate-800" : "bg-white/95 border-slate-200"} backdrop-blur-md transition-colors duration-200`}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center font-bold text-white shadow-md text-xl">
            📚
          </div>
          <span className="font-display font-extrabold text-lg md:text-xl tracking-tight bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
            Digital Class Diary
          </span>
        </div>
        
        <div className="hidden lg:flex items-center gap-8 text-sm font-semibold tracking-wide">
          <a href="#about" className={`${isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-indigo-600"} transition`}>About</a>
          <a href="#features" className={`${isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-indigo-600"} transition`}>Features</a>
          <a href="#how-it-works" className={`${isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-indigo-600"} transition`}>How It Works</a>
          <a href="#sdg4" className={`${isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-indigo-600"} transition`}>UN SDG 4</a>
          <a href="#contact" className={`${isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-indigo-600"} transition`}>Contact</a>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={onToggleTheme} 
            className={`p-2 rounded-lg border ${isDark ? "bg-slate-800 border-slate-700 hover:bg-slate-700" : "bg-slate-100 border-slate-200 hover:bg-slate-200"} transition-all`}
            title="Toggle theme"
          >
            {isDark ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-indigo-600" />}
          </button>
          <button 
            onClick={() => onOpenAuth("login", "student")}
            className={`hidden sm:inline-flex px-4 py-2 border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-xs font-bold tracking-widest rounded-lg transition-all uppercase`}
          >
            Sign In
          </button>
          <button 
            onClick={() => onOpenAuth("register", "student")}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 font-bold text-xs tracking-widest text-white rounded-lg transition-all shadow-md uppercase"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* HERO BANNER */}
      <section className="relative min-h-[95vh] flex items-center justify-center pt-24 pb-12 px-6 md:px-12 bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 overflow-hidden text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_45%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.15),transparent_40%)]" />
        
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center relative z-10">
          <div className="flex flex-col text-center lg:text-left">
            <div className="inline-flex self-center lg:self-start items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-6">
              <GraduationCap className="h-4 w-4" /> Multilingual AI-Powered Study Portal
            </div>
            
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl leading-[1.1] mb-6 tracking-tight">
              Smarter Classrooms. <span className="text-cyan-400">Zero Missed Opportunities.</span>
            </h1>
            
            <p className="text-slate-300 text-base sm:text-lg leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
              Eliminate information drop-offs. Connect teachers and students in a single workspace. Automatically generate lesson digests in English, Telugu, and Hindi. Never ask “What happened in class today?” again.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <button 
                onClick={() => onOpenAuth("register", "student")}
                className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-indigo-600 hover:bg-indigo-500 text-sm font-bold tracking-wider rounded-xl transition-all shadow-lg hover:-translate-y-0.5 group uppercase"
              >
                Join As Student <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => onOpenAuth("register", "teacher")}
                className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-bold tracking-wider rounded-xl transition-all uppercase"
              >
                Launch As Teacher
              </button>
            </div>
            
            <div className="flex justify-center lg:justify-start items-center gap-8 mt-12 text-slate-400 text-xs font-medium tracking-wide uppercase border-t border-slate-800 pt-8">
              <div><strong className="text-white text-lg block font-display mb-1">100%</strong> Empty State Standard</div>
              <div><strong className="text-white text-lg block font-display mb-1">UN SDG 4</strong> Goal Alignment</div>
              <div><strong className="text-white text-lg block font-display mb-1">3 Languages</strong> AI Summary</div>
            </div>
          </div>

          <div className="hidden lg:flex justify-center relative">
            <div className="w-[420px] h-[460px] bg-slate-800/40 border border-white/10 rounded-3xl p-6 relative overflow-hidden backdrop-blur-xl shadow-2xl">
              <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-500/10 blur-3xl rounded-full" />
              
              <div className="flex items-center gap-3 mb-6 pb-6 border-b border-white/5">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-sm">
                  DCD
                </div>
                <div>
                  <div className="font-display font-semibold text-sm">Mathematics • Class 11</div>
                  <div className="text-slate-400 text-xs font-medium">Flagship Lesson Timeline Feed</div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-indigo-500/20 rounded-2xl p-4 mb-4">
                <div className="flex justify-between text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-1">
                  <span>Topic Covered Today</span>
                  <span>June 2026</span>
                </div>
                <div className="font-semibold text-sm leading-tight text-white mb-2">Differential Calculus – Limits & Continuity</div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Understanding what values a function approaches. Evaluated standard forms and epsilon-delta notations.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3">
                  <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1">Homework</div>
                  <div className="text-xs font-semibold text-slate-200">Integrations Ex 2</div>
                </div>
                <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3">
                  <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-1">Doubt Status</div>
                  <div className="text-xs font-semibold text-slate-200">1 Reply Pending</div>
                </div>
              </div>

              <div className="bg-purple-950/30 border border-purple-500/20 rounded-2xl p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-sm">🤖</div>
                <div className="flex-1">
                  <div className="text-[10px] text-purple-400 font-extrabold uppercase tracking-wide">Multi-Lang AI Summaries</div>
                  <div className="text-xs text-slate-300">English, తెలుగు, हिंदी Ready</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MISSION & ABOUT SECTOR */}
      <section className={`py-20 px-6 md:px-12 border-b ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"}`} id="about">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-6 rounded-2xl border text-center ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
              <Laptop className="h-8 w-8 text-indigo-500 mx-auto mb-3" />
              <div className="font-display font-bold text-2xl mb-1 text-indigo-500">100%</div>
              <div className="text-xs text-slate-400 uppercase font-semibold">Digital Class Logs</div>
            </div>
            <div className={`p-6 rounded-2xl border text-center ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
              <BookOpen className="h-8 w-8 text-cyan-500 mx-auto mb-3" />
              <div className="font-display font-bold text-2xl mb-1 text-cyan-500">3 Lang</div>
              <div className="text-xs text-slate-400 uppercase font-semibold">AI Translations</div>
            </div>
            <div className={`p-6 rounded-2xl border text-center ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
              <GraduationCap className="h-8 w-8 text-amber-500 mx-auto mb-3" />
              <div className="font-display font-bold text-2xl mb-1 text-amber-500">No Mess</div>
              <div className="text-xs text-slate-400 uppercase font-semibold">Simple Connections</div>
            </div>
            <div className={`p-6 rounded-2xl border text-center ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
              <Users className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
              <div className="font-display font-bold text-2xl mb-1 text-emerald-500">Zero Demo</div>
              <div className="text-xs text-slate-400 uppercase font-semibold">Real Data Database</div>
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2">Our Mission Objective</span>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl mb-6 leading-tight">
              Digitizing Knowledge Transfer With Complete Integrity
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4">
              Digital Class Diary is standardizing the academic workflow. We provide a single classroom-centric timeline designed specifically to erase the communication issues encountered when students miss a lecture or lose assignments.
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-6">
              Our workflow requires no administrative overhead. Teachers generate unique secure Teacher Codes and spin up subject boards. Connected students receive notifications as soon as new study materials, announcements, or scheduled lessons become active.
            </p>
            <ul className="space-y-3 text-sm font-medium text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-3">
                <span className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs font-extrabold">✓</span>
                Real-time connection request approvals
              </li>
              <li className="flex items-center gap-3">
                <span className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs font-extrabold">✓</span>
                Academic Zweifel (Doubt) resolved straight by teachers
              </li>
              <li className="flex items-center gap-3">
                <span className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs font-extrabold">✓</span>
                Secure JWT hashing & cookie validation integrations
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* CORE FEATURES SECTION */}
      <section className={`py-20 px-6 md:px-12 border-b ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`} id="features">
        <div className="max-w-6xl mx-auto text-center mb-16">
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2 block">System Capabilities</span>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl mb-4 tracking-tight">Structured For Educational Excellence</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xl mx-auto">
            A cohesive collection of tools designed directly to minimize learning drop-offs and amplify teacher efficiency.
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            { title: "Timeline Hub", desc: "Our flagship 'What Happened Today' feed aggregates daily lessons, homework documents, and notices in a chronological stream.", icon: "📅", color: "text-indigo-500" },
            { title: "Multilingual AI summaries", desc: "Integrates with Gemini 3.5 Flash server-side. Auto-condenses complex lessons into English, Telugu, and Hindi bullet guides.", icon: "🤖", color: "text-purple-500" },
            { title: "Zweifel (Doubt) Resolver", desc: "Academic query boards. Students post questions within open doubt sessions and receive answers straight from their teachers.", icon: "❓", color: "text-cyan-500" },
            { title: "Future Date Scheduling", desc: "Create assignments, study notes, or announcements in advance and schedule them to auto-publish on a future date.", icon: "⏱️", color: "text-amber-500" },
            { title: "Study materials Repo", desc: "Teacher uploads PowerPoint slides, reference PDFs, images, or homework docs organized cleanly by subject chapter.", icon: "📁", color: "text-blue-500" },
            { title: "In-App Notification Alerts", desc: "Smart triggering of notification alerts whenever connection requests are approved, or lessons are released.", icon: "🔔", color: "text-emerald-500" }
          ].map((f, i) => (
            <div key={i} className={`p-8 rounded-2xl border ${isDark ? "bg-slate-950 border-slate-800 hover:border-indigo-500/50" : "bg-white border-slate-200 hover:border-indigo-600/50"} transition-all hover:-translate-y-1 shadow-sm`}>
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-display font-bold text-lg mb-2 text-slate-800 dark:text-white">{f.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className={`py-20 px-6 md:px-12 border-b ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"}`} id="how-it-works">
        <div className="max-w-6xl mx-auto text-center mb-16">
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2 block">The Workflow</span>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl mb-4">Five Simple Operational Steps</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            From classroom setup to interactive doubt resolving, setup takes less than two minutes.
          </p>
        </div>

        <div className="max-w-xl mx-auto flex flex-col gap-0 border-l border-indigo-600/20 pl-8 relative">
          {[
            { num: "1", title: "Teacher Code Deployment", desc: "Every registered teacher automatically receives a unique secure Code. No classroom access is granted to anyone without their approval." },
            { num: "2", title: "Join Connection Requests", desc: "Students enter the Teacher Code in their dashboard, view teacher credentials, and submit a Join connection request." },
            { num: "3", title: "Teacher Manual Approvals", desc: "Teachers accept or reject Connection entries inside their panel, locking up access strictly to verified students." },
            { num: "4", title: "Daily Board Uploads", desc: "Teachers publish homework documents, lesson text, or notes instantly or scheduled for future delivery." },
            { num: "5", title: "Zweifel Academic Q&A", desc: "Connected students access materials and clear up questions inside open doubt sessions, closing the learning gap securely." }
          ].map((s, i) => (
            <div key={i} className="relative pb-10 last:pb-0">
              <div className="absolute -left-12 top-0 h-8 w-8 rounded-full bg-indigo-600 text-white font-extrabold flex items-center justify-center text-sm shadow-md">
                {s.num}
              </div>
              <h3 className="font-display font-bold text-md mb-1 text-slate-800 dark:text-white">{s.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* REGIONAL UNITED NATIONS SDG 4 STATEMENT */}
      <section className="py-20 px-6 md:px-12 bg-indigo-950 text-white relative overflow-hidden" id="sdg4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.1),transparent_50%)]" />
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-12 items-center relative z-10">
          <div className="p-8 rounded-3xl bg-indigo-900/60 border border-white/10 flex flex-col justify-center items-center text-center lg:col-span-1 shadow-2xl">
            <GraduationCap className="h-14 w-14 text-cyan-400 mb-4" />
            <h3 className="font-display font-extrabold text-5xl mb-2 text-cyan-400">SDG 4</h3>
            <div className="text-xs uppercase font-extrabold tracking-widest text-slate-300">Sustainable Development Goal</div>
            <div className="text-sm font-semibold text-white mt-1">Quality Education for All</div>
          </div>
          
          <div className="lg:col-span-2 space-y-6">
            <span className="px-3 py-1 rounded bg-white/10 text-cyan-400 text-[10px] font-bold uppercase tracking-wider">United Nations Association</span>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl leading-tight">
              Promoting Inclusive and Equitable Quality Education
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              We align our technology with United Nations SDG target 4.4 and 4.a, focused on expanding youth digital literacy and upgrading educational structures to be inclusive. By incorporating Telugu and Hindi lesson summaries generated by AI, we tear down local linguistic boundaries so that regional language learners are never left behind.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold text-slate-300">
              <div className="p-4 rounded-xl bg-indigo-900/30 border border-white/5 flex items-start gap-3">
                <span className="text-cyan-400 text-lg">🌍</span>
                <div>
                  <h4 className="font-bold text-white mb-0.5">Reducing Class Dropouts</h4>
                  <p className="text-slate-400 text-[11px] font-normal leading-normal">Online archives keep absent students connected with lessons.</p>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-indigo-900/30 border border-white/5 flex items-start gap-3">
                <span className="text-cyan-400 text-lg">🗣️</span>
                <div>
                  <h4 className="font-bold text-white mb-0.5">Telugu & Hindi Translations</h4>
                  <p className="text-slate-400 text-[11px] font-normal leading-normal">Breaks educational barriers for vernacular medium learners.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT BANNER */}
      <section className={`py-20 px-6 md:px-12 ${isDark ? "bg-slate-900" : "bg-slate-50"}`} id="contact">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          <div className="flex flex-col justify-center">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2">Admissions & Support</span>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl mb-6">Let's Establish Smarter Classrooms</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-8">
              Whether you are an individual instructor or have a group of students, we are here to support your migration to the Digital Class Diary.
            </p>
            
            <div className="space-y-4 text-xs font-bold text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 rounded-xl flex items-center justify-center"><Mail className="h-5 w-5" /></div>
                <div>
                  <div className="text-slate-400 font-medium">Email Address</div>
                  <div className="text-sm font-semibold">support@digitalclassdiary.edu</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 rounded-xl flex items-center justify-center"><Phone className="h-5 w-5" /></div>
                <div>
                  <div className="text-slate-400 font-medium">Support Center Line</div>
                  <div className="text-sm font-semibold">+91 98765 43210</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 rounded-xl flex items-center justify-center"><MapPin className="h-5 w-5" /></div>
                <div>
                  <div className="text-slate-400 font-medium">Headquarters</div>
                  <div className="text-sm font-semibold">Tech Hub, Ramanthapur, Hyderabad, India</div>
                </div>
              </div>
            </div>
          </div>

          <div className={`p-8 rounded-3xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"} shadow-xl`}>
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <h3 className="font-display font-extrabold text-lg mb-2 text-slate-800 dark:text-white">Reach Out</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase font-extrabold text-slate-400 mb-1.5 block">Your Name</label>
                  <input 
                    type="text" 
                    required 
                    value={contactForm.name} 
                    onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                    className={`w-full p-3 rounded-lg border text-xs font-semibold ${isDark ? "bg-slate-900 border-slate-800 text-white focus:border-indigo-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-600"} outline-none`}
                    placeholder="John Doe" 
                  />
                </div>
                <div>
                  <label className="text-xs uppercase font-extrabold text-slate-400 mb-1.5 block">Your Email</label>
                  <input 
                    type="email" 
                    required 
                    value={contactForm.email} 
                    onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                    className={`w-full p-3 rounded-lg border text-xs font-semibold ${isDark ? "bg-slate-900 border-slate-800 text-white focus:border-indigo-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-600"} outline-none`}
                    placeholder="john@school.edu" 
                  />
                </div>
              </div>
              
              <div>
                <label className="text-xs uppercase font-extrabold text-slate-400 mb-1.5 block">Your Role</label>
                <select 
                  value={contactForm.role} 
                  onChange={e => setContactForm({ ...contactForm, role: e.target.value })}
                  className={`w-full p-3 rounded-lg border text-xs font-bold ${isDark ? "bg-slate-900 border-slate-800 text-white focus:border-indigo-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-600"} outline-none`}
                >
                  <option>Student</option>
                  <option>Teacher</option>
                  <option>Academic Administrator</option>
                </select>
              </div>

              <div>
                <label className="text-xs uppercase font-extrabold text-slate-400 mb-1.5 block">Message Description</label>
                <textarea 
                  required 
                  value={contactForm.message} 
                  onChange={e => setContactForm({ ...contactForm, message: e.target.value })}
                  rows={4}
                  className={`w-full p-3 rounded-lg border text-xs font-semibold ${isDark ? "bg-slate-900 border-slate-800 text-white focus:border-indigo-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-600"} outline-none`}
                  placeholder="Explain how DCD can support your academic organization layout..."
                />
              </div>

              <button 
                type="submit" 
                className="w-full py-4 text-xs font-extrabold tracking-widest uppercase text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-md"
              >
                Send Message Securely
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-950 text-slate-400 text-xs py-12 px-6 md:px-12 border-t border-slate-900">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <div className="space-y-4">
            <span className="font-display font-extrabold tracking-tight text-white text-md block">📚 Digital Class Diary</span>
            <p className="leading-relaxed">
              Standardizing classroom journals with secure connection gateways and multilingual study resources. Directly cooperating with targets under United Nations SDG 4.
            </p>
          </div>
          <div>
            <h4 className="font-extrabold tracking-wider uppercase text-white mb-4">Classroom Platform</h4>
            <ul className="space-y-2">
              <li><a href="#" className="hover:text-white transition">Product Features</a></li>
              <li><a href="#" className="hover:text-white transition">Core Live Timeline</a></li>
              <li><a href="#" className="hover:text-white transition">Zweifel Academic Q&A</a></li>
              <li><a href="#" className="hover:text-white transition">Future Scheduling</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-extrabold tracking-wider uppercase text-white mb-4">Admissions Resources</h4>
            <ul className="space-y-2">
              <li><a href="#" className="hover:text-white transition">System Dokumentation</a></li>
              <li><a href="#" className="hover:text-white transition">Security Hashing Rules</a></li>
              <li><a href="#" className="hover:text-white transition">Multilingual AI Schemas</a></li>
              <li><a href="#" className="hover:text-white transition">Admissions Center Helpline</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-extrabold tracking-wider uppercase text-white mb-4">Privacy & Integrity</h4>
            <ul className="space-y-2">
              <li><a href="#" className="hover:text-white transition">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white transition">Privacy Policy Statement</a></li>
              <li><a href="#" className="hover:text-white transition">MongoDB Cluster Configs</a></li>
              <li><a href="#" className="hover:text-white transition">Cookie Authentication Standard</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center border-t border-slate-900 pt-6">
          <p>© 2026 Digital Class Diary. Engineered with ❤️ for Quality Education Integrity.</p>
          <span className="font-bold text-slate-500 uppercase tracking-widest mt-2 sm:mt-0 text-[10px]">UN SDG 4 Partner</span>
        </div>
      </footer>
    </div>
  );
}
