const API_BASE = ""; // Relative paths route through Vite middleware automatically!

// Retrieve token from localStorage
export function getToken(): string | null {
  return localStorage.getItem("dcd_token");
}

// Set token in localStorage
export function setToken(token: string) {
  localStorage.setItem("dcd_token", token);
}

// Clear token from localStorage
export function clearToken() {
  localStorage.removeItem("dcd_token");
}

async function request(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "An error occurred with this request");
  }

  return data;
}

export const api = {
  /* ============================================================
     AUTH
     ============================================================ */
  async register(payload: any) {
    return request(`${API_BASE}/api/auth/register`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async login(payload: any) {
    const res = await request(`${API_BASE}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (res.token) {
      setToken(res.token);
    }
    return res;
  },

  async me() {
    return request(`${API_BASE}/api/auth/me`);
  },

  async updateProfile(payload: any) {
    return request(`${API_BASE}/api/auth/profile`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async regenerateCode() {
    return request(`${API_BASE}/api/auth/regenerate-code`, {
      method: "POST"
    });
  },

  /* ============================================================
     CONNECTIONS (JOIN WORKFLOW)
     ============================================================ */
  async searchTeacherByCode(code: string) {
    return request(`${API_BASE}/api/classrooms/code/${code}`);
  },

  async sendJoinRequest(classroomId: string) {
    return request(`${API_BASE}/api/join/request`, {
      method: "POST",
      body: JSON.stringify({ classroomId })
    });
  },

  async getJoinRequestStatus(classroomId: string) {
    return request(`${API_BASE}/api/join/status/${classroomId}`);
  },

  async checkPendingRequests(classroomId?: string) {
    const url = classroomId ? `${API_BASE}/api/join/requests/pending?classroomId=${classroomId}` : `${API_BASE}/api/join/requests/pending`;
    return request(url);
  },

  async updateRequestStatus(requestId: string, status: "approved" | "rejected") {
    return request(`${API_BASE}/api/join/requests/${requestId}`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
  },

  async getConnectedStudents(classroomId?: string) {
    const url = classroomId ? `${API_BASE}/api/join/students?classroomId=${classroomId}` : `${API_BASE}/api/join/students`;
    return request(url);
  },

  async removeStudent(studentId: string, classroomId?: string) {
    const url = classroomId ? `${API_BASE}/api/join/students/${studentId}?classroomId=${classroomId}` : `${API_BASE}/api/join/students/${studentId}`;
    return request(url, {
      method: "DELETE"
    });
  },

  /* ============================================================
     CLASSROOMS
     ============================================================ */
  async listClassrooms() {
    return request(`${API_BASE}/api/classrooms`);
  },

  async createClassroom(payload: any) {
    return request(`${API_BASE}/api/classrooms`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async getClassroomDetails(classroomId: string) {
    return request(`${API_BASE}/api/classrooms/${classroomId}`);
  },

  async deleteClassroom(classroomId: string) {
    return request(`${API_BASE}/api/classrooms/${classroomId}`, {
      method: "DELETE"
    });
  },

  async regenerateClassroomCode(classroomId: string) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/regenerate-code`, {
      method: "POST"
    });
  },

  /* ============================================================
     LESSONS
     ============================================================ */
  async listLessons(classroomId: string) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/lessons`);
  },

  async createLesson(classroomId: string, payload: any) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/lessons`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async deleteLesson(lessonId: string) {
    return request(`${API_BASE}/api/lessons/${lessonId}`, {
      method: "DELETE"
    });
  },

  async generateAiSummary(lessonId: string, payload: any) {
    return request(`${API_BASE}/api/lessons/${lessonId}/ai-summary`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  /* ============================================================
     ASSIGNMENTS & SUBMISSIONS
     ============================================================ */
  async listAssignments(classroomId: string) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/assignments`);
  },

  async createAssignment(classroomId: string, payload: any) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/assignments`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async submitAssignment(asgId: string, payload: any) {
    return request(`${API_BASE}/api/assignments/${asgId}/submit`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async getSubmissionsOfAssignment(asgId: string) {
    return request(`${API_BASE}/api/assignments/${asgId}/submissions`);
  },

  async getMySubmission(asgId: string) {
    return request(`${API_BASE}/api/assignments/${asgId}/mysubmission`);
  },

  async gradeSubmission(submissionId: string, payload: { grade: string; marksObtained: number; feedback: string }) {
    return request(`${API_BASE}/api/submissions/${submissionId}/grade`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },

  /* ============================================================
     ANNOUNCEMENTS
     ============================================================ */
  async listAnnouncements(classroomId: string) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/announcements`);
  },

  async createAnnouncement(classroomId: string, payload: any) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/announcements`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  /* ============================================================
     STUDY MATERIALS
     ============================================================ */
  async listMaterials(classroomId: string) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/materials`);
  },

  async createMaterial(classroomId: string, payload: any) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/materials`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  /* ============================================================
     DOUBT SYSTEM
     ============================================================ */
  async listDoubtSessions(classroomId: string) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/doubt-sessions`);
  },

  async createDoubtSession(classroomId: string, title: string) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/doubt-sessions`, {
      method: "POST",
      body: JSON.stringify({ title })
    });
  },

  async updateDoubtSessionStatus(sessionId: string, status: "open" | "closed") {
    return request(`${API_BASE}/api/doubt-sessions/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
  },

  async askDoubt(sessionId: string, payload: { subject: string; topic: string; question: string }) {
    return request(`${API_BASE}/api/doubt-sessions/${sessionId}/doubts`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async listDoubtsOfSession(sessionId: string) {
    return request(`${API_BASE}/api/doubt-sessions/${sessionId}/doubts`);
  },

  async listStudentDoubts() {
    return request(`${API_BASE}/api/doubts/student`);
  },

  async replyToDoubt(doubtId: string, replyText: string) {
    return request(`${API_BASE}/api/doubts/${doubtId}/reply`, {
      method: "PUT",
      body: JSON.stringify({ replyText })
    });
  },

  async pinDoubt(doubtId: string) {
    return request(`${API_BASE}/api/doubts/${doubtId}/pin`, {
      method: "PUT"
    });
  },

  async resolveDoubt(doubtId: string) {
    return request(`${API_BASE}/api/doubts/${doubtId}/resolve`, {
      method: "PUT"
    });
  },

  /* ============================================================
     NOTIFICATIONS
     ============================================================ */
  async listNotifications() {
    return request(`${API_BASE}/api/notifications`);
  },

  async readAllNotifications() {
    return request(`${API_BASE}/api/notifications/read-all`, {
      method: "POST"
    });
  },

  /* ============================================================
     FLAGSHIP TIMELINE FEATURE "WHAT HAPPENED TODAY"
     ============================================================ */
  async getTodayDiary(classroomId: string) {
    return request(`${API_BASE}/api/classrooms/${classroomId}/today-diary`);
  },

  async getDashboardStats() {
    return request(`${API_BASE}/api/dashboard/stats`);
  }
};
