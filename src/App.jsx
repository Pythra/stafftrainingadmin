import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { useAdminAuth } from "./AdminAuthContext.jsx";

// Parse pasted module content: blocks separated by blank lines; first line of each block = heading, rest = text.
// First block goes to body; subsequent blocks become sections.
function parseModuleContent(text) {
  const blocks = (text || "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return { body: "", sections: [] };
  const body = blocks[0];
  const sections = blocks.slice(1).map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] || "";
    const rest = lines.slice(1).join("\n").trim();
    const useFirstAsHeading = firstLine.length <= 120;
    return {
      heading: useFirstAsHeading ? firstLine : "",
      text: useFirstAsHeading ? rest : block,
    };
  });
  return { body, sections };
}

// Parse pasted quiz: "1. Question?" / "A. opt" / "B. opt" / "Answer: B"
function parseQuiz(text) {
  const questions = [];
  const lines = (text || "").split("\n").map((l) => l.trim());
  let current = null;
  const optionOrder = ["A", "B", "C", "D", "E", "F"];

  lines.forEach((line) => {
    if (/^\d+\./.test(line)) {
      if (current) questions.push(current);
      current = {
        question: line.replace(/^\d+\.\s*/, "").trim(),
        options: {},
        answer: "",
      };
    } else if (/^[A-Z]\./.test(line)) {
      const key = line[0];
      const value = line.slice(2).trim();
      if (current) current.options[key] = value;
    } else if (/^Answer:\s*/i.test(line)) {
      if (current) current.answer = line.replace(/^Answer:\s*/i, "").trim().toUpperCase();
    }
  });
  if (current) questions.push(current);

  return questions.map((q, i) => {
    const opts = optionOrder.filter((k) => q.options[k] != null).map((k) => q.options[k]);
    const letter = (q.answer || "A")[0];
    const correctIndex = optionOrder.indexOf(letter);
    const idx = correctIndex >= 0 && correctIndex < opts.length ? correctIndex : 0;
    return {
      questionNo: i + 1,
      question: q.question,
      options: opts.length >= 2 ? opts : [...opts, "", ""].slice(0, 4),
      correctIndex: idx,
    };
  });
}

function formatDate(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString();
}

function formatRelativeTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  const sec = Math.floor((now - date) / 1000);
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 52) return `${w}w`;
  const y = Math.floor(w / 52);
  return `${y}y`;
}

function getCourseCount(member, keys = []) {
  for (const key of keys) {
    const value = member?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.length;
  }
  return 0;
}

function getFirstValue(source, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function getActivityItems(member, type, payload) {
  const sources = [
    payload?.activity,
    payload?.activities,
    payload?.staffActivity,
    payload?.details,
    member?.activity,
    member?.activities,
    member?.staffActivity,
  ].filter(Boolean);

  const preferredKeys =
    type === "passed"
      ? ["passedSubjects", "subjectsPassed", "passed", "passedActivities", "subjectPassHistory"]
      : ["failedSubjects", "subjectsFailed", "failed", "failedActivities", "subjectFailHistory"];

  const candidates = [];
  for (const source of sources) {
    if (Array.isArray(source)) candidates.push(...source);
    if (typeof source === "object") {
      for (const key of preferredKeys) {
        if (Array.isArray(source[key])) candidates.push(...source[key]);
      }
    }
  }

  return candidates
    .map((entry, index) => {
      const subject =
        getFirstValue(entry, ["subjectName", "subject", "name", "courseName", "title"]) || `Subject ${index + 1}`;
      const testWrittenOn = formatDate(
        getFirstValue(entry, ["testWrittenAt", "attemptedAt", "writtenAt", "createdAt", "date"])
      );
      const modulesCompleted = getCourseCount(entry, [
        "modulesCompleted",
        "completedModules",
        "moduleCompletions",
        "completedModuleCount",
      ]);
      return { subject, testWrittenOn, modulesCompleted };
    })
    .filter((item) => item.subject);
}

function getActionActor(action) {
  return (
    action?.performedByName ||
    action?.performedByEmail ||
    action?.performedByAdminId ||
    action?.performedBy ||
    action?.actorName ||
    action?.actor ||
    action?.userName ||
    action?.user ||
    action?.adminName ||
    action?.admin ||
    "Unknown admin"
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "admins", label: "Admins", icon: "users", superAdminOnly: true },
  { id: "courses", label: "Courses", icon: "book" },
  { id: "quiz", label: "Tests", icon: "help" },
  { id: "progress", label: "Progress Report", icon: "report" },
  { id: "staff", label: "Staff", icon: "userplus" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "account", label: "Account", icon: "profile" },
];

function Icon({ name, active }) {
  const color = active ? "#fff" : "#121212";
  const size = 24;
  const icons = {
    dashboard: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
    users: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    book: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M8 7h8" />
        <path d="M8 11h8" />
      </svg>
    ),
    help: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
    ),
    report: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <rect x="7" y="12" width="3" height="6" rx="1" />
        <rect x="12" y="9" width="3" height="9" rx="1" />
        <rect x="17" y="6" width="3" height="12" rx="1" />
      </svg>
    ),
    userplus: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <line x1="20" y1="8" x2="20" y2="14" />
        <line x1="23" y1="11" x2="17" y2="11" />
      </svg>
    ),
    bell: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    profile: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M6.168 18.849A4 4 0 0 1 10 16h4a4 4 0 0 1 3.834 2.855" />
      </svg>
    ),
    logout: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    ),
  };
  return <span className="tab-icon">{icons[name] || icons.dashboard}</span>;
}

const permissionOptions = [
  "manage_subadmins",
  "manage_courses",
  "manage_quizzes",
  "manage_staff",
  "manage_settings",
];

const DEFAULT_STAFF_ROLES = [
  "HR Department",
  "Finance Department",
  "Treasury Management",
  "Operations",
  "Sales",
  "Marketing",
  "IT Support",
  "Procurement",
  "Legal",
  "Customer Service",
];

const ACTION_LOGS_PAGE_SIZE = 6;

function App() {
  const { api, logout, admin, isSuperAdmin } = useAdminAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [actionLogs, setActionLogs] = useState([]);
  const [actionLogsPage, setActionLogsPage] = useState(1);
  const [actionLogsTotalPages, setActionLogsTotalPages] = useState(0);
  const [actionLogsLoading, setActionLogsLoading] = useState(false);

  function logAction(message) {
    api("/api/admin/action-logs", {
      method: "POST",
      body: JSON.stringify({ message }),
    }).catch(() => {});
  }

  async function loadActionLogs(page = 1) {
    setActionLogsLoading(true);
    try {
      const data = await api(`/api/admin/action-logs?page=${page}&limit=${ACTION_LOGS_PAGE_SIZE}`);
      setActionLogs(data.actions || []);
      setActionLogsPage(data.page ?? 1);
      setActionLogsTotalPages(data.totalPages ?? 0);
    } catch (err) {
      setActionLogs([]);
    } finally {
      setActionLogsLoading(false);
    }
  }

  const [courses, setCourses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [subadmins, setSubadmins] = useState([]);
  const [policy, setPolicy] = useState({ passMarkPercent: 70, maxFailAttempts: 3, timeLimitMinutes: 25 });
  const [policyEditField, setPolicyEditField] = useState(null);
  const [policyEditValue, setPolicyEditValue] = useState("");
  const [selectedCourseCode, setSelectedCourseCode] = useState("");
  const [courseStructure, setCourseStructure] = useState({ subjects: [] });
  const [selectedModuleKeyForQuiz, setSelectedModuleKeyForQuiz] = useState("");
  const [moduleQuizPassMark, setModuleQuizPassMark] = useState(70);
  const [moduleQuizTimeLimit, setModuleQuizTimeLimit] = useState(25);
  const [moduleQuizPolicyEditField, setModuleQuizPolicyEditField] = useState(null);
  const [moduleQuizPolicyEditValue, setModuleQuizPolicyEditValue] = useState("");
  const [quizQuestions, setQuizQuestions] = useState([]);

  const [courseForm, setCourseForm] = useState({ code: "", name: "" });
  const [subjectForm, setSubjectForm] = useState({ name: "", order: 1 });
  const [moduleForm, setModuleForm] = useState({
    subjectKey: "",
    moduleKey: "",
    title: "",
    body: "",
    order: 1,
    sections: [{ heading: "", text: "" }],
  });
  const [subadminForm, setSubadminForm] = useState({
    fullName: "",
    email: "",
    role: "manager",
    permissions: ["manage_courses"],
    isActive: true,
  });
  const [showCreateSubadminForm, setShowCreateSubadminForm] = useState(false);
  const [showCreateStaffForm, setShowCreateStaffForm] = useState(false);
  const [staffForm, setStaffForm] = useState({
    fullName: "",
    staffId: "",
    role: DEFAULT_STAFF_ROLES[0],
    assignedCourseCodes: [],
  });
  const [staffRoles, setStaffRoles] = useState(DEFAULT_STAFF_ROLES);
  const [newStaffRole, setNewStaffRole] = useState("");
  const [modulePasteText, setModulePasteText] = useState("");
  const [quizPasteText, setQuizPasteText] = useState("");
  const [coursesViewMode, setCoursesViewMode] = useState("list"); // "list" | "detail" | "create"
  const [selectedCourseForDetail, setSelectedCourseForDetail] = useState(null); // { code, name }
  const [selectedSubjectKey, setSelectedSubjectKey] = useState(null);
  const [selectedSubjectForDetail, setSelectedSubjectForDetail] = useState(null); // { key, name } when viewing module list
  const [courseToDelete, setCourseToDelete] = useState(null); // { code, name } when delete modal is open
  const [deleteCourseCodeInput, setDeleteCourseCodeInput] = useState("");
  const [deleteCourseCodeError, setDeleteCourseCodeError] = useState("");
  const [courseToEdit, setCourseToEdit] = useState(null); // { code, name } when edit modal is open
  const [editCourseName, setEditCourseName] = useState("");
  const [editCourseCode, setEditCourseCode] = useState("");
  const [editCourseError, setEditCourseError] = useState("");
  const [addCourseModalOpen, setAddCourseModalOpen] = useState(false);
  const [addCourseCode, setAddCourseCode] = useState("");
  const [addCourseName, setAddCourseName] = useState("");
  const [addCourseError, setAddCourseError] = useState("");
  const [addSubjectModalOpen, setAddSubjectModalOpen] = useState(false);
  const [addSubjectName, setAddSubjectName] = useState("");
  const [addSubjectError, setAddSubjectError] = useState("");
  const [subjectToEdit, setSubjectToEdit] = useState(null);
  const [editSubjectName, setEditSubjectName] = useState("");
  const [editSubjectError, setEditSubjectError] = useState("");
  const [subjectToDelete, setSubjectToDelete] = useState(null);
  const [moduleToEdit, setModuleToEdit] = useState(null);
  const [showModuleEditor, setShowModuleEditor] = useState(false);
  const [editingModuleKey, setEditingModuleKey] = useState(null);
  const [moduleEditorTitle, setModuleEditorTitle] = useState("");
  const [moduleEditorBodyHtml, setModuleEditorBodyHtml] = useState("");
  const moduleEditorContentRef = useRef(null);
  const [editModuleTitle, setEditModuleTitle] = useState("");
  const [editModuleError, setEditModuleError] = useState("");
  const [moduleToDelete, setModuleToDelete] = useState(null);
  const [staffToEdit, setStaffToEdit] = useState(null);
  const [editStaffForm, setEditStaffForm] = useState({
    fullName: "",
    staffId: "",
    email: "",
    role: DEFAULT_STAFF_ROLES[0],
    assignedCourseCodes: [],
  });
  const [editStaffError, setEditStaffError] = useState("");
  const [staffToDelete, setStaffToDelete] = useState(null);
  const [staffToAssignCourses, setStaffToAssignCourses] = useState(null);
  const [assignCoursesSelectedCodes, setAssignCoursesSelectedCodes] = useState([]);
  const [assignCoursesError, setAssignCoursesError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [staffActivityView, setStaffActivityView] = useState({
    memberId: null,
    type: "passed",
    loading: false,
    error: "",
    items: [],
  });
  const [notifications, setNotifications] = useState([]);
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [selectedStaffForDetail, setSelectedStaffForDetail] = useState(null);
  const [selectedStaffRole, setSelectedStaffRole] = useState("");
  const [staffDetailProgress, setStaffDetailProgress] = useState(null);
  const [busyAction, setBusyAction] = useState(null); // 'deleteStaff' | 'createStaff' | 'createCourse' | 'createSubadmin' | 'saveQuestions' | 'resetAttempts' | etc.
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [quizModuleOptions, setQuizModuleOptions] = useState([]);
  const [quizModulesLoading, setQuizModulesLoading] = useState(false);
  const [progressReportLoading, setProgressReportLoading] = useState(false);
  const [progressReportError, setProgressReportError] = useState("");
  const [progressReportView, setProgressReportView] = useState("certified");
  const [progressReportData, setProgressReportData] = useState({
    passed: [],
    failed: [],
    certified: [],
    outstanding: [],
  });

  const visibleTabs = useMemo(
    () => tabs.filter((tab) => !tab.superAdminOnly || isSuperAdmin),
    [isSuperAdmin]
  );

  async function loadCourses() {
    const data = await api("/api/admin/courses");
    setCourses(data.courses || []);
    if (!selectedCourseCode && data.courses?.length) {
      setSelectedCourseCode(data.courses[0].code);
    }
  }

  async function loadStaff() {
    const data = await api("/api/admin/staff");
    setStaff(data.staff || []);
  }

  async function loadSubadmins() {
    const data = await api("/api/admin/subadmins");
    setSubadmins(data.subadmins || []);
  }

  async function loadPolicy() {
    const data = await api("/api/admin/settings/quiz-policy");
    if (data.policy) setPolicy((prev) => ({ passMarkPercent: 70, maxFailAttempts: 3, timeLimitMinutes: 25, ...prev, ...data.policy }));
  }

  async function loadNotifications() {
    try {
      const data = await api("/api/admin/notifications");
      setNotifications(data.notifications || []);
      setNotificationsUnreadCount(data.unreadCount ?? 0);
    } catch (err) {
      logAction(err.message);
    }
  }

  async function loadStaffDetailProgress(staffId) {
    if (!staffId) return;
    try {
      const data = await api(`/api/admin/staff/${encodeURIComponent(staffId)}/progress`);
      setStaffDetailProgress(data);
    } catch (err) {
      logAction(err.message);
      setStaffDetailProgress(null);
    }
  }

  async function handleResetAttempts(staffId, moduleKey) {
    setBusyAction("resetAttempts");
    try {
      await api("/api/admin/staff/reset-attempts", {
        method: "POST",
        body: JSON.stringify({ staffId, moduleKey }),
      });
      await loadNotifications();
      await loadStaff();
      if (selectedStaffForDetail && selectedStaffForDetail.staffId === staffId) {
        await loadStaffDetailProgress(staffId);
      }
      logAction("Quiz attempts reset. Staff can retry the test.");
    } catch (err) {
      logAction(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleMarkNotificationRead(id, read) {
    try {
      await api(`/api/admin/notifications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ read }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read } : n))
      );
      if (read) setNotificationsUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      logAction(err.message);
    }
  }

  async function handleMarkAllNotificationsRead() {
    try {
      await api("/api/admin/notifications/mark-all-read", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setNotificationsUnreadCount(0);
      logAction("All notifications marked as read.");
    } catch (err) {
      logAction(err.message);
    }
  }

  async function loadStructure(courseCode) {
    if (!courseCode) return;
    const data = await api(`/api/admin/courses/${courseCode}/structure`);
    setCourseStructure(data);
  }

  async function loadQuiz(moduleKey) {
    if (!moduleKey) return;
    const data = await api(`/api/admin/modules/${moduleKey}/questions`);
    setQuizQuestions(data.questions || []);
    setModuleQuizPassMark(data.passMarkPercent ?? 70);
    setModuleQuizTimeLimit(data.timeLimitMinutes ?? 25);
  }

  async function loadAllModulesForQuiz() {
    if (!Array.isArray(courses) || courses.length === 0) {
      setQuizModuleOptions([]);
      return;
    }
    setQuizModulesLoading(true);
    try {
      const structures = await Promise.all(
        courses.map(async (course) => {
          const data = await api(`/api/admin/courses/${encodeURIComponent(course.code)}/structure`);
          return { course, subjects: data.subjects || [] };
        })
      );

      const modules = [];
      for (const entry of structures) {
        const courseName = entry.course?.name || entry.course?.code || "";
        for (const subject of entry.subjects || []) {
          for (const moduleItem of subject.modules || []) {
            modules.push({
              ...moduleItem,
              subjectName: subject.name,
              courseCode: entry.course?.code || "",
              courseName,
            });
          }
        }
      }

      setQuizModuleOptions(modules);
    } finally {
      setQuizModulesLoading(false);
    }
  }

  function parseCertificationGrade(text) {
    const msg = String(text || "").toLowerCase();
    if (msg.includes("distinction")) return "Distinction";
    if (msg.includes("merit")) return "Merit";
    if (msg.includes("pass")) return "Pass";
    return "Certified";
  }

  async function loadProgressReport() {
    setProgressReportLoading(true);
    setProgressReportError("");
    try {
      const [notificationsData, staffData] = await Promise.all([
        api("/api/admin/notifications?limit=200"),
        api("/api/admin/staff"),
      ]);
      const notifications = notificationsData.notifications || [];
      const staffRows = staffData.staff || [];

      const passed = notifications
        .filter((n) => n.type === "quiz_passed")
        .map((n) => ({
          id: n.id,
          staffName: n.staffName || "Staff",
          staffId: n.staffId || "—",
          courseName: n.courseName || n.courseCode || "—",
          moduleTitle: n.moduleTitle || "—",
          score: n.metadata?.scorePercent ?? null,
          time: n.createdAt,
          message: n.message || "",
        }));

      const failed = notifications
        .filter((n) => n.type === "quiz_locked")
        .map((n) => ({
          id: n.id,
          staffName: n.staffName || "Staff",
          staffId: n.staffId || "—",
          courseName: n.courseName || n.courseCode || "—",
          moduleTitle: n.moduleTitle || "—",
          failStreak: n.metadata?.failStreak ?? null,
          attempts: n.metadata?.attempts ?? null,
          time: n.createdAt,
          message: n.message || "",
        }));

      const certified = notifications
        .filter((n) => n.type === "course_certified")
        .map((n) => ({
          id: n.id,
          staffName: n.staffName || "Staff",
          staffId: n.staffId || "—",
          courseName: n.courseName || n.courseCode || "—",
          grade: parseCertificationGrade(n.message),
          averageScore: n.metadata?.courseAverageScore ?? null,
          time: n.createdAt,
          message: n.message || "",
        }));

      const progressList = await Promise.all(
        staffRows.map(async (member) => {
          try {
            const payload = await api(`/api/admin/staff/${encodeURIComponent(member.staffId)}/progress`);
            return payload;
          } catch (_) {
            return null;
          }
        })
      );

      const outstanding = progressList
        .filter(Boolean)
        .map((payload) => {
          const assigned = payload.assignedCourses || [];
          const pendingCourses = assigned.filter((c) => c.status !== "completed");
          const completedCount = assigned.length - pendingCourses.length;
          return {
            staffName: payload.staff?.fullName || "Staff",
            staffId: payload.staff?.staffId || "—",
            email: payload.staff?.email || "",
            totalAssigned: assigned.length,
            completedCount,
            pendingCount: pendingCourses.length,
            pendingCourses: pendingCourses.map((c) => ({
              code: c.code,
              name: c.name || c.code,
              status: c.status || "not_started",
            })),
          };
        })
        .filter((item) => item.pendingCount > 0);

      setProgressReportData({ passed, failed, certified, outstanding });
    } catch (error) {
      setProgressReportError(error.message || "Failed to load progress report.");
      setProgressReportData({ passed: [], failed: [], certified: [], outstanding: [] });
    } finally {
      setProgressReportLoading(false);
    }
  }

  async function saveModuleQuizPolicy(field, value) {
    if (!selectedModuleKeyForQuiz) return;
    const num = Number(value);
    if (field === "passMarkPercent" && (!Number.isFinite(num) || num < 1 || num > 100)) return;
    if (field === "timeLimitMinutes" && (!Number.isFinite(num) || num < 1 || num > 120)) return;
    setBusyAction("saveModuleQuizPolicy");
    try {
      const payload = field === "passMarkPercent"
        ? { passMarkPercent: num }
        : { timeLimitMinutes: Math.round(num) };
      await api(`/api/admin/modules/${encodeURIComponent(selectedModuleKeyForQuiz)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (field === "passMarkPercent") setModuleQuizPassMark(num);
      else setModuleQuizTimeLimit(Math.round(num));
      logAction("Module quiz settings saved.");
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
    setModuleQuizPolicyEditField(null);
    setModuleQuizPolicyEditValue("");
  }

  async function refreshAll() {
    try {
      const loaders = [loadCourses(), loadStaff()];
      if (isSuperAdmin) loaders.push(loadSubadmins());
      await Promise.all(loaders);
      setInitialLoadDone(true);
      // Load policy and notifications in background so they're ready when user switches tabs
      loadPolicy().catch((e) => logAction(e.message));
      loadNotifications();
    } catch (error) {
      logAction(error.message);
      setInitialLoadDone(true);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "admins" && !isSuperAdmin) {
      setActiveTab("dashboard");
    }
  }, [activeTab, isSuperAdmin]);

  useEffect(() => {
    if (!showModuleEditor) return;
    const id = requestAnimationFrame(() => {
      if (moduleEditorContentRef.current) {
        moduleEditorContentRef.current.innerHTML = moduleEditorBodyHtml;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [showModuleEditor, moduleEditorBodyHtml]);

  useEffect(() => {
    if (selectedCourseCode) {
      loadStructure(selectedCourseCode).catch((error) => logAction(error.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseCode]);

  useEffect(() => {
    if (activeTab === "notifications") loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "dashboard") loadActionLogs(actionLogsPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, actionLogsPage]);

  useEffect(() => {
    if (selectedStaffForDetail?.staffId) {
      loadStaffDetailProgress(selectedStaffForDetail.staffId);
    } else {
      setStaffDetailProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStaffForDetail?.staffId]);

  useEffect(() => {
    if (activeTab === "quiz") {
      loadAllModulesForQuiz().catch((error) => logAction(error.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, courses]);

  useEffect(() => {
    if (activeTab === "progress") {
      loadProgressReport().catch((error) => {
        setProgressReportError(error.message || "Failed to load progress report.");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  function openAddCourseModal() {
    setAddCourseModalOpen(true);
    setAddCourseCode("");
    setAddCourseName("");
    setAddCourseError("");
  }

  function closeAddCourseModal() {
    setAddCourseModalOpen(false);
    setAddCourseCode("");
    setAddCourseName("");
    setAddCourseError("");
  }

  function openAddSubjectModal() {
    setAddSubjectModalOpen(true);
    setAddSubjectName("");
    setAddSubjectError("");
  }

  function closeAddSubjectModal() {
    setAddSubjectModalOpen(false);
    setAddSubjectName("");
    setAddSubjectError("");
  }

  async function handleSubmitAddSubject(e) {
    e?.preventDefault?.();
    const name = addSubjectName.trim();
    if (!name) {
      setAddSubjectError("Subject name is required.");
      return;
    }
    if (!selectedCourseForDetail?.code) return;
    setAddSubjectError("");
    setBusyAction("createSubject");
    try {
      await api("/api/admin/subjects", {
        method: "POST",
        body: JSON.stringify({
          courseCode: selectedCourseForDetail.code,
          name,
          order: 1,
        }),
      });
      closeAddSubjectModal();
      await loadStructure(selectedCourseForDetail.code);
      logAction("Subject created.");
    } catch (error) {
      setAddSubjectError(error.message || "Failed to create subject.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitAddCourse(e) {
    e?.preventDefault?.();
    const code = addCourseCode.trim().toUpperCase();
    const name = addCourseName.trim();
    if (!code) {
      setAddCourseError("Course code is required.");
      return;
    }
    if (!name) {
      setAddCourseError("Course name is required.");
      return;
    }
    setAddCourseError("");
    setBusyAction("createCourse");
    try {
      await api("/api/admin/courses", {
        method: "POST",
        body: JSON.stringify({ code, name }),
      });
      await loadCourses();
      setCoursesViewMode("list");
      closeAddCourseModal();
      logAction("Course created.");
    } catch (error) {
      setAddCourseError(error.message || "Failed to create course.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateCourse(e) {
    e.preventDefault();
    setBusyAction("createCourse");
    try {
      await api("/api/admin/courses", {
        method: "POST",
        body: JSON.stringify(courseForm),
      });
      setCourseForm({ code: "", name: "" });
      await loadCourses();
      logAction("Course created.");
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateSubject(e) {
    e.preventDefault();
    if (!selectedCourseCode) {
      logAction("Select a course first.");
      return;
    }
    setBusyAction("createSubject");
    try {
      await api("/api/admin/subjects", {
        method: "POST",
        body: JSON.stringify({
          courseCode: selectedCourseCode,
          name: subjectForm.name,
          order: Number(subjectForm.order),
        }),
      });
      setSubjectForm({ name: "", order: 1 });
      await loadStructure(selectedCourseCode);
      logAction("Subject created.");
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  function handleParseModuleContent() {
    try {
      const { body, sections } = parseModuleContent(modulePasteText);
      setModuleForm((prev) => ({
        ...prev,
        body,
        sections:
          sections.length > 0
            ? sections
            : [{ heading: "", text: "" }],
      }));
      setModulePasteText("");
      logAction("Content parsed. Review body and sections below, then save.");
    } catch (err) {
      logAction(err.message || "Parse failed.");
    }
  }

  function handleParseQuiz() {
    try {
      const parsed = parseQuiz(quizPasteText);
      if (parsed.length === 0) {
        logAction("No questions parsed. Use format: 1. Question? A. opt B. opt Answer: B");
        return;
      }
      setQuizQuestions(parsed);
      setQuizPasteText("");
      logAction(`Parsed ${parsed.length} question(s). Review and save.`);
    } catch (err) {
      logAction(err.message || "Parse failed.");
    }
  }

  async function handleCreateModule(e) {
    e.preventDefault();
    if (!moduleForm.subjectKey) {
      logAction("Select a subject first.");
      return;
    }
    setBusyAction("createModule");
    try {
      await api("/api/admin/modules", {
        method: "POST",
        body: JSON.stringify({
          subjectKey: moduleForm.subjectKey,
          title: moduleForm.title,
          body: moduleForm.body,
          order: Number(moduleForm.order),
          sections: moduleForm.sections.filter((s) => s.heading && s.text),
        }),
      });
      setModuleForm({
        ...moduleForm,
        title: "",
        body: "",
        order: 1,
        sections: [{ heading: "", text: "" }],
      });
      await loadStructure(selectedCourseCode);
      logAction("Module created.");
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  function openModuleEditor() {
    setEditingModuleKey(null);
    setModuleEditorTitle("");
    setModuleEditorBodyHtml("");
    setShowModuleEditor(true);
  }

  async function openModuleEditorForEdit(moduleKey) {
    setBusyAction("loadModule");
    try {
      const data = await api(`/api/admin/modules/${encodeURIComponent(moduleKey)}`);
      setModuleEditorTitle(data.module?.title || "");
      setModuleEditorBodyHtml(data.module?.body || "");
      setEditingModuleKey(moduleKey);
      setShowModuleEditor(true);
    } catch (error) {
      logAction(error.message || "Failed to load module.");
    } finally {
      setBusyAction(null);
    }
  }

  function closeModuleEditor() {
    setShowModuleEditor(false);
    setEditingModuleKey(null);
    setModuleEditorTitle("");
    setModuleEditorBodyHtml("");
  }

  async function handleSaveModuleFromEditor(e) {
    e.preventDefault();
    const title = moduleEditorTitle.trim();
    if (!title) {
      logAction("Module title is required.");
      return;
    }
    const bodyHtml = moduleEditorContentRef.current?.innerHTML?.trim() || "";
    setBusyAction("createModule");
    try {
      if (editingModuleKey) {
        await api(`/api/admin/modules/${encodeURIComponent(editingModuleKey)}`, {
          method: "PUT",
          body: JSON.stringify({ title, body: bodyHtml }),
        });
        await loadStructure(selectedCourseCode);
        logAction("Module updated.");
      } else {
        if (!selectedSubjectForDetail?.key) return;
        await api("/api/admin/modules", {
          method: "POST",
          body: JSON.stringify({
            subjectKey: selectedSubjectForDetail.key,
            title,
            body: bodyHtml,
            order: 1,
            sections: [],
          }),
        });
        await loadStructure(selectedCourseCode);
        logAction("Module created.");
      }
      closeModuleEditor();
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  function openEditCourseModal(course) {
    setCourseToEdit({ code: course.code, name: course.name || course.code });
    setEditCourseName(course.name || course.code || "");
    setEditCourseCode(course.code || "");
    setEditCourseError("");
  }

  function closeEditCourseModal() {
    setCourseToEdit(null);
    setEditCourseName("");
    setEditCourseCode("");
    setEditCourseError("");
  }

  async function handleConfirmEditCourse() {
    if (!courseToEdit) return;
    const name = editCourseName.trim();
    const code = editCourseCode.trim().toUpperCase();
    if (!name) {
      setEditCourseError("Course name is required.");
      return;
    }
    if (!code) {
      setEditCourseError("Course code is required.");
      return;
    }
    setEditCourseError("");
    setBusyAction("editCourse");
    try {
      await api(`/api/admin/courses/${encodeURIComponent(courseToEdit.code)}`, {
        method: "PATCH",
        body: JSON.stringify({ name, code }),
      });
      await loadCourses();
      if (selectedCourseForDetail?.code === courseToEdit.code) {
        setSelectedCourseForDetail({ code: code, name });
        setSelectedCourseCode(code);
        if (code !== courseToEdit.code) {
          await loadStructure(code).catch(() => {});
        }
      }
      logAction("Course updated.");
      closeEditCourseModal();
    } catch (error) {
      setEditCourseError(error.message || "Failed to update course.");
    } finally {
      setBusyAction(null);
    }
  }

  function openDeleteCourseModal(course) {
    setCourseToDelete({ code: course.code, name: course.name || course.code });
    setDeleteCourseCodeInput("");
    setDeleteCourseCodeError("");
  }

  function closeDeleteCourseModal() {
    setCourseToDelete(null);
    setDeleteCourseCodeInput("");
    setDeleteCourseCodeError("");
  }

  async function handleConfirmDeleteCourse() {
    if (!courseToDelete) return;
    const entered = deleteCourseCodeInput.trim().toUpperCase();
    const expected = String(courseToDelete.code || "").trim().toUpperCase();
    if (entered !== expected) {
      setDeleteCourseCodeError("Course code does not match. Enter the correct code to delete.");
      return;
    }
    setDeleteCourseCodeError("");
    setBusyAction("deleteCourse");
    try {
      await api(`/api/admin/courses/${encodeURIComponent(courseToDelete.code)}`, { method: "DELETE" });
      const wasViewingThis = selectedCourseForDetail?.code === courseToDelete.code;
      await loadCourses();
      if (wasViewingThis) {
        setCoursesViewMode("list");
        setSelectedCourseForDetail(null);
        setSelectedCourseCode("");
        setSelectedSubjectKey(null);
      }
      logAction("Course deleted.");
      closeDeleteCourseModal();
    } catch (error) {
      setDeleteCourseCodeError(error.message || "Failed to delete course.");
    } finally {
      setBusyAction(null);
    }
  }

  function openEditSubjectModal(subject) {
    setSubjectToEdit(subject);
    setEditSubjectName(subject?.name || "");
    setEditSubjectError("");
  }
  function closeEditSubjectModal() {
    setSubjectToEdit(null);
    setEditSubjectName("");
    setEditSubjectError("");
  }
  async function handleConfirmEditSubject(e) {
    e?.preventDefault?.();
    if (!subjectToEdit) return;
    const name = editSubjectName.trim();
    if (!name) {
      setEditSubjectError("Name cannot be empty.");
      return;
    }
    setEditSubjectError("");
    setBusyAction("editSubject");
    try {
      await api(`/api/admin/subjects/${encodeURIComponent(subjectToEdit.key)}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      await loadStructure(selectedCourseCode);
      logAction("Subject updated.");
      closeEditSubjectModal();
    } catch (error) {
      setEditSubjectError(error.message || "Failed to update subject.");
    } finally {
      setBusyAction(null);
    }
  }

  function openDeleteSubjectModal(subject) {
    setSubjectToDelete(subject);
  }
  function closeDeleteSubjectModal() {
    setSubjectToDelete(null);
  }
  async function handleConfirmDeleteSubject(e) {
    e?.preventDefault?.();
    if (!subjectToDelete) return;
    setBusyAction("deleteSubject");
    try {
      await api(`/api/admin/subjects/${encodeURIComponent(subjectToDelete.key)}`, { method: "DELETE" });
      await loadStructure(selectedCourseCode);
      logAction("Subject deleted.");
      closeDeleteSubjectModal();
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  function openEditModuleModal(moduleItem) {
    setModuleToEdit(moduleItem);
    setEditModuleTitle(moduleItem?.title || "");
    setEditModuleError("");
  }
  function closeEditModuleModal() {
    setModuleToEdit(null);
    setEditModuleTitle("");
    setEditModuleError("");
  }
  async function handleConfirmEditModule(e) {
    e?.preventDefault?.();
    if (!moduleToEdit) return;
    const title = editModuleTitle.trim();
    if (!title) {
      setEditModuleError("Title cannot be empty.");
      return;
    }
    setEditModuleError("");
    setBusyAction("editModule");
    try {
      await api(`/api/admin/modules/${encodeURIComponent(moduleToEdit.key)}`, {
        method: "PUT",
        body: JSON.stringify({ title }),
      });
      await loadStructure(selectedCourseCode);
      logAction("Module updated.");
      closeEditModuleModal();
    } catch (error) {
      setEditModuleError(error.message || "Failed to update module.");
    } finally {
      setBusyAction(null);
    }
  }

  function openDeleteModuleModal(moduleKey, moduleTitle) {
    setModuleToDelete({ key: moduleKey, title: moduleTitle });
  }
  function closeDeleteModuleModal() {
    setModuleToDelete(null);
  }
  async function handleConfirmDeleteModule(e) {
    e?.preventDefault?.();
    if (!moduleToDelete) return;
    setBusyAction("deleteModule");
    try {
      await api(`/api/admin/modules/${encodeURIComponent(moduleToDelete.key)}`, { method: "DELETE" });
      await loadStructure(selectedCourseCode);
      logAction("Module deleted.");
      closeDeleteModuleModal();
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  function openEditStaffModal(member) {
    setStaffToEdit(member);
    setEditStaffForm({
      fullName: member?.fullName || "",
      staffId: member?.staffId || "",
      email: member?.email || "",
      role: member?.role || member?.department || staffRoles[0] || DEFAULT_STAFF_ROLES[0],
      assignedCourseCodes: Array.isArray(member?.assignedCourseCodes)
        ? [...member.assignedCourseCodes]
        : [],
    });
    setEditStaffError("");
  }
  function closeEditStaffModal() {
    setStaffToEdit(null);
    setEditStaffForm({
      fullName: "",
      staffId: "",
      email: "",
      role: DEFAULT_STAFF_ROLES[0],
      assignedCourseCodes: [],
    });
    setEditStaffError("");
  }
  async function handleConfirmEditStaff(e) {
    e?.preventDefault?.();
    if (!staffToEdit) return;
    const fullName = editStaffForm.fullName.trim();
    const staffId = editStaffForm.staffId.trim();
    const email = editStaffForm.email.trim();
    const role = String(editStaffForm.role || "").trim();
    if (!fullName) {
      setEditStaffError("Full name cannot be empty.");
      return;
    }
    if (!staffId) {
      setEditStaffError("Staff ID cannot be empty.");
      return;
    }
    if (!role) {
      setEditStaffError("Please select a role.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEditStaffError("Enter a valid email address.");
      return;
    }
    setEditStaffError("");
    setBusyAction("editStaff");
    try {
      await api(`/api/admin/staff/${staffToEdit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName,
          staffId,
          email,
          role,
          department: role,
          assignedCourseCodes: editStaffForm.assignedCourseCodes,
        }),
      });
      await loadStaff();
      if (
        selectedStaffForDetail &&
        (selectedStaffForDetail.id === staffToEdit.id ||
          selectedStaffForDetail.staffId === staffToEdit.staffId)
      ) {
        await loadStaffDetailProgress(staffToEdit.id || staffToEdit.staffId);
      }
      logAction("Staff updated.");
      closeEditStaffModal();
    } catch (error) {
      setEditStaffError(error.message || "Failed to update staff.");
    } finally {
      setBusyAction(null);
    }
  }

  function openDeleteStaffModal(member) {
    setStaffToDelete(member);
  }
  function closeDeleteStaffModal() {
    setStaffToDelete(null);
  }
  async function handleConfirmDeleteStaff(e) {
    e?.preventDefault?.();
    if (!staffToDelete) return;
    const memberId = staffToDelete;
    const idCandidates = [memberId?.id, memberId?._id, memberId?.staffId, memberId]
      .map((value) => (value == null ? "" : String(value).trim()))
      .filter(Boolean);
    if (idCandidates.length === 0) {
      logAction("Unable to delete: missing staff identifier.");
      return;
    }
    setBusyAction("deleteStaff");
    try {
      const deleteAttempts = idCandidates.map((id) => ({
        path: `/api/admin/staff/${encodeURIComponent(id)}`,
        options: { method: "DELETE" },
      }));
      for (const { path, options } of deleteAttempts) {
        await api(path, options);
      }
      await loadStaff();
      if (selectedStaffForDetail && idCandidates.includes(String(selectedStaffForDetail.id ?? selectedStaffForDetail.staffId ?? ""))) {
        setSelectedStaffForDetail(null);
        setStaffDetailProgress(null);
      }
      logAction("Staff deleted.");
      closeDeleteStaffModal();
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  function openAssignCoursesModal(member, initialCodes) {
    setStaffToAssignCourses(member);
    setAssignCoursesSelectedCodes(initialCodes ?? member?.assignedCourseCodes ?? []);
    setAssignCoursesError("");
  }
  function closeAssignCoursesModal() {
    setStaffToAssignCourses(null);
    setAssignCoursesSelectedCodes([]);
    setAssignCoursesError("");
  }
  async function handleConfirmAssignCourses(e) {
    e?.preventDefault?.();
    if (!staffToAssignCourses) return;
    setBusyAction("assignCourses");
    setAssignCoursesError("");
    try {
      await api(`/api/admin/staff/${staffToAssignCourses.id}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedCourseCodes: assignCoursesSelectedCodes }),
      });
      await loadStaff();
      if (selectedStaffForDetail && (selectedStaffForDetail.id === staffToAssignCourses.id || selectedStaffForDetail.staffId === staffToAssignCourses.staffId)) {
        await loadStaffDetailProgress(selectedStaffForDetail.staffId);
      }
      logAction("Staff courses updated.");
      closeAssignCoursesModal();
    } catch (error) {
      setAssignCoursesError(error.message || "Failed to update courses.");
    } finally {
      setBusyAction(null);
    }
  }

  async function savePolicyPayload(payload) {
    try {
      await api("/api/admin/settings/quiz-policy", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setPolicy((prev) => ({ ...prev, ...payload }));
      logAction("Quiz policy saved.");
    } catch (error) {
      logAction(error.message);
    }
  }

  function handleSavePolicy(e) {
    e.preventDefault();
    savePolicyPayload({
      passMarkPercent: Number(policy.passMarkPercent),
      maxFailAttempts: Number(policy.maxFailAttempts),
      timeLimitMinutes: Number(policy.timeLimitMinutes),
    });
  }

  function handlePolicyInlineSave(field, value) {
    const num = Number(value);
    if (field === "passMarkPercent" && Number.isFinite(num) && num >= 1 && num <= 100) {
      savePolicyPayload({ passMarkPercent: num });
    }
    if (field === "timeLimitMinutes" && Number.isFinite(num) && num >= 1 && num <= 120) {
      savePolicyPayload({ timeLimitMinutes: num });
    }
    setPolicyEditField(null);
    setPolicyEditValue("");
  }

  async function handleSaveQuestions(e) {
    e.preventDefault();
    if (!selectedModuleKeyForQuiz) {
      logAction("Select a module for quiz questions.");
      return;
    }
    setBusyAction("saveQuestions");
    try {
      await api(`/api/admin/modules/${selectedModuleKeyForQuiz}/questions`, {
        method: "POST",
        body: JSON.stringify({ questions: quizQuestions }),
      });
      logAction("Quiz questions saved.");
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateStaff(e) {
    e.preventDefault();
    const role = String(staffForm.role || "").trim();
    if (!role) {
      logAction("Please select a staff role.");
      return;
    }
    setBusyAction("createStaff");
    try {
      await api("/api/admin/staff", {
        method: "POST",
        body: JSON.stringify({
          fullName: staffForm.fullName,
          staffId: staffForm.staffId,
          role,
          department: role,
          assignedCourseCodes: staffForm.assignedCourseCodes,
        }),
      });
      setStaffForm({
        fullName: "",
        staffId: "",
        role: staffRoles[0] || DEFAULT_STAFF_ROLES[0],
        assignedCourseCodes: [],
      });
      setShowCreateStaffForm(false);
      await loadStaff();
      logAction("Staff created. They can sign up in the app to receive their password.");
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  function handleAddStaffRole() {
    const normalized = newStaffRole.trim();
    if (!normalized) return;
    const exists = staffRoles.some(
      (role) => role.toLowerCase() === normalized.toLowerCase()
    );
    if (exists) {
      setStaffForm((prev) => ({ ...prev, role: normalized }));
      setNewStaffRole("");
      return;
    }
    setStaffRoles((prev) => [...prev, normalized]);
    setStaffForm((prev) => ({ ...prev, role: normalized }));
    setNewStaffRole("");
  }

  function handleAssignCourses(member) {
    const isDetailView = staffDetailProgress?.staff && (staffDetailProgress.staff.id === member.id || staffDetailProgress.staff.staffId === member.staffId);
    const initialCodes = isDetailView && staffDetailProgress?.assignedCourses?.length
      ? staffDetailProgress.assignedCourses.map((c) => c.code)
      : (member?.assignedCourseCodes ?? []);
    openAssignCoursesModal(member, initialCodes);
  }

  function handleEditStaff(member) {
    openEditStaffModal(member);
  }

  function handleDeleteStaff(memberId) {
    openDeleteStaffModal(memberId);
  }

  async function handleViewStaffActivity(member, type) {
    if (staffActivityView.memberId === member.id && staffActivityView.type === type) {
      setStaffActivityView({
        memberId: null,
        type: "passed",
        loading: false,
        error: "",
        items: [],
      });
      return;
    }

    setStaffActivityView({
      memberId: member.id,
      type,
      loading: true,
      error: "",
      items: [],
    });

    let payload = null;
    try {
      payload = await api(`/api/admin/staff/${member.id}/activity?status=${type}`);
    } catch (_) {
      try {
        payload = await api(`/api/admin/staff/${member.id}/activity`);
      } catch {
        payload = null;
      }
    }

    const items = getActivityItems(member, type, payload);
    setStaffActivityView({
      memberId: member.id,
      type,
      loading: false,
      error: items.length === 0 ? "No activity details available yet for this staff." : "",
      items,
    });
  }

  async function handleCreateSubadmin(e) {
    e.preventDefault();
    setBusyAction("createSubadmin");
    try {
      await api("/api/admin/subadmins", {
        method: "POST",
        body: JSON.stringify(subadminForm),
      });
      setSubadminForm({
        fullName: "",
        email: "",
        role: "manager",
        permissions: ["manage_courses"],
        isActive: true,
      });
      setShowCreateSubadminForm(false);
      await loadSubadmins();
      logAction("Subadmin created. Login credentials were emailed.");
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleSubadmin(subadminId, isActive) {
    try {
      await api(`/api/admin/subadmins/${subadminId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !isActive }),
      });
      await loadSubadmins();
      logAction("Subadmin updated.");
    } catch (error) {
      logAction(error.message);
    }
  }

  async function resetSubadminPassword(subadminId) {
    if (!window.confirm("Reset this subadmin's password? A new password will be emailed to them.")) {
      return;
    }
    setBusyAction(`resetPwd-${subadminId}`);
    try {
      const data = await api(`/api/admin/subadmins/${subadminId}/reset-password`, {
        method: "POST",
      });
      logAction(data.message || "Subadmin password reset.");
    } catch (error) {
      logAction(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordMessage("");
    setPasswordError("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters");
      return;
    }
    setBusyAction("changePassword");
    try {
      const data = await api("/api/admin/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordMessage(data.message || "Password updated");
      logAction("Admin password changed.");
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  const headerTitle =
    activeTab === "dashboard"
      ? "Admin Dashboard"
      : activeTab === "admins"
        ? "Admins"
        : activeTab === "courses"
          ? "Courses"
          : activeTab === "quiz"
            ? "Tests"
            : activeTab === "progress"
              ? "Progress Report"
            : activeTab === "staff"
              ? "Staff"
              : activeTab === "notifications"
                ? "Notifications"
                : activeTab === "account"
                  ? "Account"
                  : "Admin Dashboard";

  function handleSidebarTabClick(tabId) {
    setActiveTab(tabId);
    if (tabId === "dashboard") setActionLogsPage(1);
    setSidebarOpen(false);
    // Reload datasets so each menu click refreshes content.
    refreshAll().catch((error) => logAction(error.message));
  }

  const staffCategoryStats = useMemo(() => {
    const roleCounts = {};

    for (const member of staff) {
      const role = String(member?.role || member?.position || "Unspecified");
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    }

    return Object.entries(roleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([role, count]) => `${role}: ${count}`);
  }, [staff]);

  const staffByRole = useMemo(() => {
    const grouped = new Map();
    for (const member of staff) {
      const roleName = String(member?.role || member?.department || "Unspecified").trim() || "Unspecified";
      if (!grouped.has(roleName)) grouped.set(roleName, []);
      grouped.get(roleName).push(member);
    }
    return [...grouped.entries()]
      .map(([role, members]) => ({ role, members }))
      .sort((a, b) => b.members.length - a.members.length || a.role.localeCompare(b.role));
  }, [staff]);

  useEffect(() => {
    if (activeTab !== "staff") return;
    if (staffByRole.length === 0) {
      if (selectedStaffRole) setSelectedStaffRole("");
      return;
    }
    const stillExists = staffByRole.some((entry) => entry.role === selectedStaffRole);
    if (!selectedStaffRole || !stillExists) {
      setSelectedStaffRole(staffByRole[0].role);
    }
  }, [activeTab, selectedStaffRole, staffByRole]);

  const progressCardCounts = useMemo(() => {
    const certifiedUnique = new Set(progressReportData.certified.map((item) => item.staffId)).size;
    return {
      failed: progressReportData.failed.length,
      passed: progressReportData.passed.length,
      certifications: certifiedUnique,
      outstanding: progressReportData.outstanding.length,
    };
  }, [progressReportData]);

  const filteredNotifications = useMemo(() => {
    const base = [...notifications].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    if (notificationFilter === "all") return base;
    if (notificationFilter === "passed") return base.filter((n) => n.type === "quiz_passed");
    if (notificationFilter === "failed") return base.filter((n) => n.type === "quiz_locked");
    if (notificationFilter === "certified") return base.filter((n) => n.type === "course_certified");
    if (notificationFilter === "unread") return base.filter((n) => !n.read);
    return base;
  }, [notifications, notificationFilter]);

  if (!initialLoadDone) {
    return (
      <div className="app-initial-load" aria-live="polite">
        <div className="app-initial-load-spinner" aria-hidden="true" />
        <p className="app-initial-load-text">Loading…</p>
      </div>
    );
  }

  return (
    <div className={`layout qiimeet-style ${sidebarOpen ? "sidebar-open" : ""}`}>
      <button
        type="button"
        className="hamburger-btn"
        onClick={() => setSidebarOpen((o) => !o)}
        aria-label="Toggle menu"
      >
        <span className="hamburger-line" />
        <span className="hamburger-line" />
        <span className="hamburger-line" />
      </button>
      <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      <aside className="sidebar">
        <div className="brand brand-crunchies">
          <img src="/crunches_logo.png" alt="Crunchies" className="brand-logo-img" />
          <div className="brand-text">
            <h1>Crunchies Admin</h1>
            <p>Training Control Center</p>
          </div>
        </div>
        <nav className="sidebar-nav">
          <ul>
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    className={`tab-btn ${isActive ? "active" : ""}`}
                    onClick={() => handleSidebarTabClick(tab.id)}
                  >
                    <Icon name={tab.icon} active={isActive} />
                    <span>{tab.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="sidebar-logout">
            <button type="button" className="tab-btn tab-btn-logout" onClick={logout}>
              <Icon name="logout" active={false} />
              <span>Log out</span>
            </button>
          </div>
        </nav>
      </aside>

      <div className="main-wrap">
        {activeTab !== "staff" && (
          <header className="dashboard-header">
            <h1 className="header-title">{headerTitle}</h1>
            <button
              type="button"
              className="header-bell-btn"
              onClick={() => setActiveTab("notifications")}
              aria-label="Notifications"
              title="Notifications"
            >
              <Icon name="bell" active={false} />
              {notificationsUnreadCount > 0 && (
                <span className="header-bell-badge">{notificationsUnreadCount > 99 ? "99+" : notificationsUnreadCount}</span>
              )}
            </button>
          </header>
        )}
        <main className="content">
        {activeTab === "dashboard" && (
          <>
            <section className="grid stats stats-bar">
              <Stat title="Courses" value={courses.length} />
              <Stat title="Subadmins" value={subadmins.length} />
              <Stat title="Staff" value={staff.length} details={staffCategoryStats} />
            </section>
            <section className="card recent-actions">
              <h2 className="recent-actions-title">Recent actions</h2>
              {actionLogsLoading ? (
                <p className="recent-actions-empty">Loading…</p>
              ) : actionLogs.length === 0 ? (
                <p className="recent-actions-empty">No recent actions.</p>
              ) : (
                <>
                  <ul className="recent-actions-list">
                    {actionLogs.map((action) => (
                      <li key={action.id} className="recent-actions-item">
                        <span className="recent-actions-time">{action.time}</span>
                        <span className="recent-actions-message">{action.message}</span>
                        <span className="recent-actions-actor">By: {getActionActor(action)}</span>
                      </li>
                    ))}
                  </ul>
                  {actionLogsTotalPages > 1 && (
                    <div className="recent-actions-pagination">
                      <button
                        type="button"
                        className="ghost"
                        disabled={actionLogsPage <= 1}
                        onClick={() => setActionLogsPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </button>
                      <span className="recent-actions-page-num">
                        Page {actionLogsPage} of {actionLogsTotalPages}
                      </span>
                      <button
                        type="button"
                        className="ghost"
                        disabled={actionLogsPage >= actionLogsTotalPages}
                        onClick={() => setActionLogsPage((p) => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {activeTab === "account" && (
          <section className="tab-page">
            <div className="tab-page-header">
              <h2 className="tab-page-title">Account</h2>
            </div>
            <div className="card form account-card">
              <p>
                Signed in as <strong>{admin?.fullName || "Admin"}</strong> ({admin?.email})
                {isSuperAdmin ? " — Super admin" : ""}
              </p>
              {isSuperAdmin ? (
                <form onSubmit={handleChangePassword}>
                  <h3>Change password</h3>
                  <input
                    type="password"
                    placeholder="Current password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                    }
                    autoComplete="current-password"
                    required
                  />
                  <input
                    type="password"
                    placeholder="New password"
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                    }
                    autoComplete="new-password"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                    }
                    autoComplete="new-password"
                    required
                  />
                  {passwordError ? <p className="form-error">{passwordError}</p> : null}
                  {passwordMessage ? <p className="form-success">{passwordMessage}</p> : null}
                  <button type="submit" disabled={busyAction === "changePassword"}>
                    {busyAction === "changePassword" ? "Saving…" : "Update password"}
                  </button>
                </form>
              ) : (
                <p className="account-password-note">
                  Password changes are managed by a super admin. Contact them if you need a new
                  password.
                </p>
              )}
            </div>
          </section>
        )}

        {activeTab === "admins" && isSuperAdmin && (
          <section className="tab-page">
            <div className="tab-page-header">
              <h2 className="tab-page-title">Subadmins</h2>
              <button
                type="button"
                className="btn-create-course"
                onClick={() => setShowCreateSubadminForm((v) => !v)}
              >
                {showCreateSubadminForm ? "Hide Form" : "+ Create Subadmin"}
              </button>
            </div>
            <div className="grid split">
              {showCreateSubadminForm && (
                <form id="admins-form" className="card form" onSubmit={handleCreateSubadmin}>
                  <h2>Create Subadmin</h2>
                  <p className="form-hint">
                    A temporary password will be emailed to the address below for first sign-in.
                  </p>
                  <input
                    placeholder="Full name"
                    value={subadminForm.fullName}
                    onChange={(e) => setSubadminForm({ ...subadminForm, fullName: e.target.value })}
                  />
                  <input
                    placeholder="Email"
                    value={subadminForm.email}
                    onChange={(e) => setSubadminForm({ ...subadminForm, email: e.target.value })}
                  />
                  <input
                    placeholder="Role"
                    value={subadminForm.role}
                    onChange={(e) => setSubadminForm({ ...subadminForm, role: e.target.value })}
                  />
                  <div className="chip-grid">
                    {permissionOptions.map((permission) => (
                      <label key={permission} className="chip">
                        <input
                          type="checkbox"
                          checked={subadminForm.permissions.includes(permission)}
                          onChange={(e) => {
                            const permissions = e.target.checked
                              ? [...subadminForm.permissions, permission]
                              : subadminForm.permissions.filter((item) => item !== permission);
                            setSubadminForm({ ...subadminForm, permissions });
                          }}
                        />
                        {permission}
                      </label>
                    ))}
                  </div>
                  <button type="submit" disabled={busyAction === "createSubadmin"}>
                    {busyAction === "createSubadmin" ? <><span className="btn-spinner" aria-hidden="true" />Loading…</> : "Submit"}
                  </button>
                </form>
              )}

              <div className="card">
                <h2>Subadmins</h2>
                <div className="list">
                  {subadmins.length === 0 ? (
                    <p className="list-empty">No subadmins yet. Create one above.</p>
                  ) : (
                    subadmins.map((admin) => (
                      <div key={admin.id} className="list-item">
                        <div>
                          <strong>{admin.fullName}</strong>
                          <p>{admin.email}</p>
                          <small>{admin.permissions.join(", ")}</small>
                        </div>
                        <div className="list-item-actions">
                          <button type="button" onClick={() => toggleSubadmin(admin.id, admin.isActive)}>
                            {admin.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            disabled={busyAction === `resetPwd-${admin.id}`}
                            onClick={() => resetSubadminPassword(admin.id)}
                          >
                            {busyAction === `resetPwd-${admin.id}` ? "Resetting…" : "Reset password"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "courses" && coursesViewMode === "list" && (
          <section className="courses-list-view">
            <div className="courses-list-header">
              <h2 className="courses-list-title">All Courses</h2>
              <button
                type="button"
                className="btn-create-course"
                onClick={openAddCourseModal}
              >
                Add Course
              </button>
            </div>
            <div className="course-cards">
              {courses.length === 0 ? (
                <div className="course-cards-empty">
                  <p>No courses yet. Create your first course to get started.</p>
                  <button
                    type="button"
                    className="btn-create-course"
                    onClick={openAddCourseModal}
                  >
                    Add Course
                  </button>
                </div>
              ) : (
                courses.map((course) => (
                  <div key={course.code} className="course-card course-card-with-delete">
                    <div className="course-card-top-actions">
                      <button
                        type="button"
                        className="course-card-edit-icon"
                        onClick={(e) => { e.stopPropagation(); openEditCourseModal(course); }}
                        disabled={busyAction != null}
                        title="Edit course"
                        aria-label="Edit course"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="course-card-delete-icon"
                        onClick={(e) => { e.stopPropagation(); openDeleteCourseModal(course); }}
                        disabled={busyAction != null}
                        title="Delete course"
                        aria-label="Delete course"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                    <div className="course-card-body">
                      <span className="course-card-code">{course.code}</span>
                      <h3 className="course-card-name">{course.name || course.code}</h3>
                      <p className="course-card-meta">{course.moduleCount ?? 0} module{(course.moduleCount ?? 0) !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="course-card-actions">
                      <button
                        type="button"
                        className="course-card-btn"
                        onClick={async () => {
                          setSelectedCourseForDetail({ code: course.code, name: course.name || course.code });
                          setSelectedCourseCode(course.code);
                          setSelectedSubjectKey(null);
                          setCoursesViewMode("detail");
                          await loadStructure(course.code).catch((e) => logAction(e.message));
                        }}
                      >
                        View &amp; Edit
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "courses" && coursesViewMode === "detail" && selectedCourseForDetail && (
          <section className="course-detail-view">
            {!selectedSubjectForDetail && (
            <div className="card course-detail-box">
              <div className="course-detail-header">
                <div className="page-header-with-back">
                  <button
                    type="button"
                    className="page-header-back-btn"
                    onClick={() => {
                      setCoursesViewMode("list");
                      setSelectedCourseForDetail(null);
                      setSelectedSubjectKey(null);
                      setSelectedSubjectForDetail(null);
                    }}
                    title="Back to courses"
                    aria-label="Back to courses"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <div>
                    <h2 className="course-detail-title">{selectedCourseForDetail.name}</h2>
                    <span className="course-detail-code">Code: {selectedCourseForDetail.code}</span>
                  </div>
                </div>
                <div className="course-detail-header-actions">
                  <button
                    type="button"
                    className="btn-add-subject"
                    onClick={openAddSubjectModal}
                    disabled={busyAction != null}
                  >
                    Add subject
                  </button>
                  <button
                    type="button"
                    className="course-card-edit-icon course-detail-delete-btn"
                    onClick={() => openEditCourseModal(selectedCourseForDetail)}
                    disabled={busyAction != null}
                    title="Edit course"
                    aria-label="Edit course"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="course-card-delete-icon course-detail-delete-btn"
                    onClick={() => openDeleteCourseModal(selectedCourseForDetail)}
                    disabled={busyAction != null}
                    title="Delete course"
                    aria-label="Delete course"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="course-detail-structure">
              <h3 className="course-detail-structure-subjects-label">Subjects</h3>
              <div className="course-cards subject-cards">
                {(!courseStructure.subjects || courseStructure.subjects.length === 0) ? (
                  <p className="structure-empty">No subjects yet. Add one below.</p>
                ) : (
                  (courseStructure.subjects || []).map((subject) => (
                    <div key={subject.key} className="course-card subject-card course-card-with-delete">
                      <div className="course-card-top-actions">
                        <button
                          type="button"
                          className="course-card-edit-icon"
                          onClick={(e) => { e.stopPropagation(); openEditSubjectModal(subject); }}
                          disabled={busyAction != null}
                          title="Edit subject"
                          aria-label="Edit subject"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="course-card-delete-icon"
                          onClick={(e) => { e.stopPropagation(); openDeleteSubjectModal(subject); }}
                          disabled={busyAction != null}
                          title="Delete subject"
                          aria-label="Delete subject"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </div>
                      <div className="course-card-body">
                        <span className="course-card-code">{subject.key}</span>
                        <h3 className="course-card-name">{subject.name}</h3>
                        <p className="course-card-meta">{(subject.modules || []).length} module{(subject.modules || []).length !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="course-card-actions subject-card-actions">
                        <button
                          type="button"
                          className="course-card-btn"
                          onClick={() => {
                            setSelectedSubjectForDetail({ key: subject.key, name: subject.name });
                            setModuleForm((prev) => ({ ...prev, subjectKey: subject.key }));
                          }}
                        >
                          View &amp; Edit
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              </div>
            </div>
            )}

            {selectedSubjectForDetail && showModuleEditor && (
              <div className="card course-detail-box" style={{ marginTop: "0" }}>
                <div className="course-detail-header">
                  <div className="page-header-with-back">
                    <button
                      type="button"
                      className="page-header-back-btn"
                      onClick={closeModuleEditor}
                      title="Back to modules"
                      aria-label="Back to modules"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <div>
                      <h2 className="course-detail-title">{editingModuleKey ? "Edit module" : "Create module"}</h2>
                      <span className="course-detail-code">Subject: {selectedSubjectForDetail.name}</span>
                    </div>
                  </div>
                </div>
                <form className="card form module-editor-form" onSubmit={handleSaveModuleFromEditor}>
                  <label className="module-editor-label">Module title</label>
                  <input
                    className="module-editor-title-input"
                    placeholder="Module title"
                    value={moduleEditorTitle}
                    onChange={(e) => setModuleEditorTitle(e.target.value)}
                  />
                  <label className="module-editor-label">Content</label>
                  <div
                    ref={moduleEditorContentRef}
                    className="module-editor-content"
                    contentEditable
                    suppressContentEditableWarning
                    data-placeholder="Type your module content here…"
                  />
                  <button type="submit" className="btn-add-subject" disabled={busyAction === "createModule"} style={{ marginTop: "16px" }}>
                    {busyAction === "createModule" ? <><span className="btn-spinner" aria-hidden="true" />Saving…</> : (editingModuleKey ? "Update module" : "Save module")}
                  </button>
                </form>
              </div>
            )}

            {selectedSubjectForDetail && !showModuleEditor && (() => {
              const subject = (courseStructure.subjects || []).find((s) => s.key === selectedSubjectForDetail.key);
              const modules = subject ? (subject.modules || []) : [];
              return (
                <div className="card course-detail-box subject-detail-box" style={{ marginTop: "0" }}>
                  <div className="course-detail-header subject-detail-header">
                    <div className="page-header-with-back">
                      <button
                        type="button"
                        className="page-header-back-btn subject-detail-back-btn"
                        onClick={() => setSelectedSubjectForDetail(null)}
                        title="Back to subjects"
                        aria-label="Back to subjects"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                      </button>
                      <div>
                        <h2 className="course-detail-title">{selectedSubjectForDetail.name}</h2>
                        <span className="course-detail-code">Subject: {selectedSubjectForDetail.key}</span>
                      </div>
                    </div>
                    <div className="course-detail-header-actions subject-detail-header-actions">
                      <button
                        type="button"
                        className="btn-add-subject"
                        onClick={openModuleEditor}
                        disabled={busyAction != null}
                      >
                        Add modules
                      </button>
                      <button
                        type="button"
                        className="course-card-edit-icon course-detail-delete-btn"
                        onClick={() => subject && openEditSubjectModal(subject)}
                        disabled={busyAction != null}
                        title="Edit subject"
                        aria-label="Edit subject"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="course-card-delete-icon course-detail-delete-btn"
                        onClick={() => subject && openDeleteSubjectModal(subject)}
                        disabled={busyAction != null}
                        title="Delete subject"
                        aria-label="Delete subject"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="course-detail-structure">
                    <h3 className="course-detail-structure-subjects-label">Modules</h3>
                    <div className="course-cards subject-cards">
                      {modules.length === 0 ? (
                        <p className="structure-empty">No modules yet.</p>
                      ) : (
                        modules.map((moduleItem, moduleIndex) => (
                          <div key={moduleItem.key} className="course-card subject-card course-card-with-delete">
                            <div className="course-card-top-actions">
                              <button
                                type="button"
                                className="course-card-edit-icon"
                                onClick={(e) => { e.stopPropagation(); openModuleEditorForEdit(moduleItem.key); }}
                                disabled={busyAction != null}
                                title="Edit module"
                                aria-label="Edit module"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="course-card-delete-icon"
                                onClick={(e) => { e.stopPropagation(); openDeleteModuleModal(moduleItem.key, moduleItem.title); }}
                                disabled={busyAction != null}
                                title="Delete module"
                                aria-label="Delete module"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <line x1="10" y1="11" x2="10" y2="17" />
                                  <line x1="14" y1="11" x2="14" y2="17" />
                                </svg>
                              </button>
                            </div>
                            <div className="course-card-body course-card-body-with-index">
                              <span className="module-index-badge" title={`Module ${moduleIndex + 1}`}>{moduleIndex + 1}</span>
                              <div className="course-card-body-inner">
                                <span className="course-card-code">{moduleItem.key}</span>
                                <h3 className="course-card-name">{moduleItem.title}</h3>
                                <p className="course-card-meta">Module</p>
                              </div>
                            </div>
                            <div className="course-card-actions subject-card-actions">
                              <button
                                type="button"
                                className="course-card-btn"
                                onClick={() => {
                                  setActiveTab("quiz");
                                  setSelectedModuleKeyForQuiz(moduleItem.key);
                                  loadQuiz(moduleItem.key).catch((error) => logAction(error.message));
                                }}
                              >
                                Edit Quiz
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>
        )}

        {activeTab === "courses" && coursesViewMode === "create" && (
          <section className="course-create-view">
            <div className="page-header-with-back card course-detail-box" style={{ marginBottom: "24px" }}>
              <button
                type="button"
                className="page-header-back-btn"
                onClick={() => setCoursesViewMode("list")}
                title="Back to courses"
                aria-label="Back to courses"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              </button>
              <h2 className="course-detail-title" style={{ margin: 0 }}>Create course</h2>
            </div>
            <div className="grid triple">
              <form className="card form" onSubmit={handleCreateCourse}>
                <input
                  placeholder="Code e.g 125 (up to 3 digits)"
                  value={courseForm.code}
                  onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })}
                />
                <input
                  placeholder="Course name"
                  value={courseForm.name}
                  onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })}
                />
                <button type="submit" disabled={busyAction === "createCourse"}>
                  {busyAction === "createCourse" ? <><span className="btn-spinner" aria-hidden="true" />Loading…</> : "Create Course"}
                </button>
              </form>

              <form className="card form" onSubmit={handleCreateSubject}>
                <h2>Create Subject</h2>
                <select
                  value={selectedCourseCode}
                  onChange={(e) => setSelectedCourseCode(e.target.value)}
                >
                  <option value="">Select course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.code}>
                      {course.code} - {course.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Subject name"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Order"
                  value={subjectForm.order}
                  onChange={(e) => setSubjectForm({ ...subjectForm, order: e.target.value })}
                />
                <button type="submit" disabled={!selectedCourseCode || busyAction === "createSubject"}>
                  {busyAction === "createSubject" ? <><span className="btn-spinner" aria-hidden="true" />Loading…</> : "Create Subject"}
                </button>
              </form>

              <form className="card form" onSubmit={handleCreateModule}>
                <h2>Create Module</h2>
                <select
                  value={moduleForm.subjectKey}
                  onChange={(e) => setModuleForm({ ...moduleForm, subjectKey: e.target.value })}
                >
                  <option value="">Select subject</option>
                  {(courseStructure.subjects || []).map((subject) => (
                    <option key={subject.key} value={subject.key}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Module title"
                  value={moduleForm.title}
                  onChange={(e) => setModuleForm({ ...moduleForm, title: e.target.value })}
                />
                <div className="paste-block">
                  <label>Paste content (blank lines separate blocks)</label>
                  <textarea
                    className="paste-textarea"
                    placeholder="Paste your module content here…"
                    value={modulePasteText}
                    onChange={(e) => setModulePasteText(e.target.value)}
                    rows={4}
                  />
                  <button type="button" className="ghost" onClick={handleParseModuleContent}>
                    Parse into body &amp; sections
                  </button>
                </div>
                <textarea
                  placeholder="Main writeup text"
                  value={moduleForm.body}
                  onChange={(e) => setModuleForm({ ...moduleForm, body: e.target.value })}
                />
                {moduleForm.sections.map((section, index) => (
                  <div key={index} className="section-row">
                    <input
                      placeholder="Subheading"
                      value={section.heading}
                      onChange={(e) => {
                        const sections = [...moduleForm.sections];
                        sections[index] = { ...sections[index], heading: e.target.value };
                        setModuleForm({ ...moduleForm, sections });
                      }}
                    />
                    <textarea
                      placeholder="Text under subheading"
                      value={section.text}
                      onChange={(e) => {
                        const sections = [...moduleForm.sections];
                        sections[index] = { ...sections[index], text: e.target.value };
                        setModuleForm({ ...moduleForm, sections });
                      }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    setModuleForm({
                      ...moduleForm,
                      sections: [...moduleForm.sections, { heading: "", text: "" }],
                    })
                  }
                >
                  Add Subheading Section
                </button>
                <button type="submit" disabled={!moduleForm.subjectKey || busyAction === "createModule"}>
                  {busyAction === "createModule" ? <><span className="btn-spinner" aria-hidden="true" />Loading…</> : "Create Module"}
                </button>
              </form>

              <div className="card triple-span">
                <h2>Subjects</h2>
                <div className="structure">
                  {(courseStructure.subjects || []).map((subject, index) => (
                    <div key={subject.key} className="subject-block">
                      <h3>{index + 1}. {subject.name}</h3>
                      <ul>
                        {(subject.modules || []).map((moduleItem) => (
                          <li key={moduleItem.key}>
                            <span>{moduleItem.title}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("quiz");
                                setSelectedModuleKeyForQuiz(moduleItem.key);
                                loadQuiz(moduleItem.key).catch((error) =>
                                  logAction(error.message)
                                );
                              }}
                            >
                              Edit Quiz
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "quiz" && (
          <section className="tab-page">
            <div className="tab-page-header">
              <h2 className="tab-page-title">Tests</h2>
            </div>
            <div className="grid split">
            <form className="card form" onSubmit={handleSaveQuestions}>
              <h2>Module Quiz Builder</h2>
              <select
                disabled={quizModulesLoading}
                value={selectedModuleKeyForQuiz}
                onChange={(e) => {
                  const key = e.target.value;
                  setSelectedModuleKeyForQuiz(key);
                  if (key) loadQuiz(key).catch((error) => logAction(error.message));
                  else { setModuleQuizPassMark(70); setModuleQuizTimeLimit(25); setQuizQuestions([]); }
                }}
              >
                <option value="">
                  {quizModulesLoading ? "Loading modules..." : "Select module"}
                </option>
                {quizModuleOptions.map((moduleItem) => (
                  <option key={moduleItem.key} value={moduleItem.key}>
                    {moduleItem.courseName} - {moduleItem.subjectName} - {moduleItem.title}
                  </option>
                ))}
              </select>

              <div className="quiz-policy-inline quiz-policy-below-select">
                <span className="quiz-policy-label">Pass mark:</span>
                {moduleQuizPolicyEditField === "passMarkPercent" ? (
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="quiz-policy-inline-input"
                    value={moduleQuizPolicyEditValue}
                    onChange={(e) => setModuleQuizPolicyEditValue(e.target.value)}
                    onBlur={(e) => saveModuleQuizPolicy("passMarkPercent", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveModuleQuizPolicy("passMarkPercent", e.target.value);
                      }
                      if (e.key === "Escape") { setModuleQuizPolicyEditField(null); setModuleQuizPolicyEditValue(""); }
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="quiz-policy-inline-value"
                    onClick={() => {
                      setModuleQuizPolicyEditField("passMarkPercent");
                      setModuleQuizPolicyEditValue(String(moduleQuizPassMark));
                    }}
                    disabled={!selectedModuleKeyForQuiz || busyAction != null}
                  >
                    {moduleQuizPassMark}%
                  </button>
                )}
                <span className="quiz-policy-sep">·</span>
                <span className="quiz-policy-label">Time:</span>
                {moduleQuizPolicyEditField === "timeLimitMinutes" ? (
                  <input
                    type="number"
                    min="1"
                    max="120"
                    className="quiz-policy-inline-input"
                    value={moduleQuizPolicyEditValue}
                    onChange={(e) => setModuleQuizPolicyEditValue(e.target.value)}
                    onBlur={(e) => saveModuleQuizPolicy("timeLimitMinutes", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveModuleQuizPolicy("timeLimitMinutes", e.target.value);
                      }
                      if (e.key === "Escape") { setModuleQuizPolicyEditField(null); setModuleQuizPolicyEditValue(""); }
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="quiz-policy-inline-value"
                    onClick={() => {
                      setModuleQuizPolicyEditField("timeLimitMinutes");
                      setModuleQuizPolicyEditValue(String(moduleQuizTimeLimit));
                    }}
                    disabled={!selectedModuleKeyForQuiz || busyAction != null}
                  >
                    {moduleQuizTimeLimit} min
                  </button>
                )}
              </div>

              <div className="paste-block">
                <label>Paste questions (format: 1. Question? A. opt B. opt C. opt D. opt Answer: B)</label>
                <textarea
                  className="paste-textarea"
                  placeholder={'1. What is 2 + 2?\nA. 3\nB. 4\nC. 5\nD. 8\nAnswer: B\n\n2. Capital of France?\nA. London\nB. Paris\n...'}
                  value={quizPasteText}
                  onChange={(e) => setQuizPasteText(e.target.value)}
                  rows={6}
                />
                <button type="button" className="ghost" onClick={handleParseQuiz}>
                  Parse into questions
                </button>
              </div>

              {(quizQuestions || []).map((question, index) => (
                <div key={question.id || index} className="question-card">
                  <input
                    placeholder={`Question ${index + 1}`}
                    value={question.question}
                    onChange={(e) => {
                      const next = [...quizQuestions];
                      next[index] = { ...next[index], question: e.target.value };
                      setQuizQuestions(next);
                    }}
                  />
                  {[0, 1, 2, 3].map((optionIndex) => (
                    <input
                      key={optionIndex}
                      placeholder={`Option ${optionIndex + 1}`}
                      value={question.options?.[optionIndex] || ""}
                      onChange={(e) => {
                        const next = [...quizQuestions];
                        const options = [...(next[index].options || [])];
                        options[optionIndex] = e.target.value;
                        next[index] = { ...next[index], options };
                        setQuizQuestions(next);
                      }}
                    />
                  ))}
                  <label>
                    Correct option index (0-3)
                    <input
                      type="number"
                      min="0"
                      max="3"
                      value={question.correctIndex}
                      onChange={(e) => {
                        const next = [...quizQuestions];
                        next[index] = { ...next[index], correctIndex: Number(e.target.value) };
                        setQuizQuestions(next);
                      }}
                    />
                  </label>
                </div>
              ))}

              <button
                type="button"
                className="ghost"
                onClick={() =>
                  setQuizQuestions([
                    ...quizQuestions,
                    {
                      questionNo: quizQuestions.length + 1,
                      question: "",
                      options: ["", "", "", ""],
                      correctIndex: 0,
                    },
                  ])
                }
              >
                Add Question
              </button>
              <button type="submit" disabled={busyAction === "saveQuestions"}>
                {busyAction === "saveQuestions" ? <><span className="btn-spinner" aria-hidden="true" />Loading…</> : "Save Questions"}
              </button>
            </form>
            </div>
          </section>
        )}

        {activeTab === "staff" && (
          <section className="tab-page">
            <div className="tab-page-header">
              <h2 className="tab-page-title">Staff</h2>
              <button
                type="button"
                className="btn-create-course"
                onClick={() => setShowCreateStaffForm((v) => !v)}
              >
                Add staff
              </button>
            </div>
            {showCreateStaffForm && (
              <div id="staff-create-form" className="card form staff-create-form">
                <h2>Create Staff</h2>
                <form onSubmit={handleCreateStaff} className="staff-create-form-inner">
                  <div className="form-field">
                    <input
                      placeholder="Full name"
                      value={staffForm.fullName}
                      onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <input
                      placeholder="Staff ID"
                      value={staffForm.staffId}
                      onChange={(e) => setStaffForm({ ...staffForm, staffId: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <span className="field-label">Role</span>
                    <select
                      value={staffForm.role}
                      onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                      required
                    >
                      {staffRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <span className="field-label">Add role</span>
                    <div className="staff-add-role-row">
                      <input
                        placeholder="e.g. Treasury Management"
                        value={newStaffRole}
                        onChange={(e) => setNewStaffRole(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddStaffRole();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="ghost"
                        onClick={handleAddStaffRole}
                      >
                        Add role
                      </button>
                    </div>
                  </div>
                  <div className="form-field">
                    <span className="field-label">Assign courses</span>
                    <div className="course-choice-grid">
                      {courses.map((course) => {
                        const selected = staffForm.assignedCourseCodes.includes(course.code);
                        return (
                          <button
                            key={course.code}
                            type="button"
                            className={`course-choice-box ${selected ? "selected" : ""}`}
                            onClick={() => {
                              const nextCodes = selected
                                ? staffForm.assignedCourseCodes.filter((c) => c !== course.code)
                                : [...staffForm.assignedCourseCodes, course.code];
                              setStaffForm({ ...staffForm, assignedCourseCodes: nextCodes });
                            }}
                          >
                            <span className="course-choice-code">{course.code}</span>
                            <span className="course-choice-name">{course.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button type="submit" disabled={busyAction === "createStaff"}>
                  {busyAction === "createStaff" ? <><span className="btn-spinner" aria-hidden="true" />Loading…</> : "Create Staff"}
                </button>
                </form>
              </div>
            )}
            {selectedStaffForDetail ? (
              <div className="card staff-detail-card">
                {staffDetailProgress ? (
                  <>
                    <div className="staff-detail-header page-header-with-back">
                      <button
                        type="button"
                        className="page-header-back-btn"
                        onClick={() => setSelectedStaffForDetail(null)}
                        title="Back to Staff"
                        aria-label="Back to Staff"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                      </button>
                      <div>
                        <h2>{staffDetailProgress.staff.fullName}</h2>
                        <p className="staff-detail-meta">ID: {staffDetailProgress.staff.staffId}</p>
                        <p className="staff-detail-meta">Email: {staffDetailProgress.staff.email || "—"}</p>
                      </div>
                    </div>
                    <div className="staff-detail-section">
                      <h3>Assigned courses</h3>
                      {(!staffDetailProgress.assignedCourses || staffDetailProgress.assignedCourses.length === 0) ? (
                        <p className="staff-detail-meta">No courses assigned.</p>
                      ) : (
                        <ul className="staff-detail-courses-list">
                          {staffDetailProgress.assignedCourses.map((c) => (
                            <li key={c.code} className="staff-detail-course-item">
                              <span className="staff-detail-course-name">{c.name}</span>
                              {c.status === "in_progress" && <span className="badge badge--in_progress">In progress</span>}
                              {c.status === "completed" && <span className="badge badge--completed">Completed</span>}
                              {c.status === "not_started" && <span className="staff-detail-course-not-started">Not started</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {(() => {
                      const inProgressCourse = (staffDetailProgress.assignedCourses || []).find((c) => c.status === "in_progress");
                      const inProgressProgress = inProgressCourse && (staffDetailProgress.progress || []).filter((row) => row.course_code === inProgressCourse.code);
                      return inProgressCourse && inProgressProgress && inProgressProgress.length > 0 ? (
                        <div className="staff-detail-section">
                          <h3>In progress: {inProgressCourse.name}</h3>
                          <p className="staff-detail-section-desc">Modules with test attempts, scores and attempts.</p>
                          <div className="staff-detail-progress-table-wrap">
                            <table className="staff-detail-progress-table">
                              <thead>
                                <tr>
                                  <th>Module</th>
                                  <th>Status</th>
                                  <th>Attempts</th>
                                  <th>Score</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {inProgressProgress.map((row) => (
                                  <tr key={row.module_key} className={`status--${row.status}`}>
                                    <td><strong>{row.title}</strong></td>
                                    <td><span className={`badge badge--${row.status}`}>{row.status}</span></td>
                                    <td>{row.attempts}</td>
                                    <td>{row.last_score_percent != null ? `${row.last_score_percent}%` : "—"}</td>
                                    <td>
                                      <button
                                        type="button"
                                        className="ghost"
                                        onClick={() => handleResetAttempts(selectedStaffForDetail.staffId, row.module_key)}
                                        disabled={busyAction === "resetAttempts"}
                                        title="Reset attempts for this module (gives 3 more attempts)"
                                      >
                                        {busyAction === "resetAttempts" ? <><span className="btn-spinner" aria-hidden="true" />Loading…</> : "Reset"}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null;
                    })()}
                    <div className="staff-detail-actions">
                      <button type="button" className="ghost" onClick={() => handleEditStaff(selectedStaffForDetail)}>Edit</button>
                      <button type="button" className="ghost" onClick={() => handleAssignCourses(selectedStaffForDetail)}>Assign Courses</button>
                      <button type="button" onClick={() => handleResetAttempts(selectedStaffForDetail.staffId, null)} disabled={busyAction === "resetAttempts"}>
                        {busyAction === "resetAttempts" ? <><span className="btn-spinner" aria-hidden="true" />Loading…</> : "Reset all attempts"}
                      </button>
                      <button type="button" onClick={() => handleDeleteStaff(selectedStaffForDetail)} disabled={busyAction === "deleteStaff"}>
                        {busyAction === "deleteStaff" ? <><span className="btn-spinner" aria-hidden="true" />Loading…</> : "Delete"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="page-header-with-back" style={{ marginBottom: "1rem" }}>
                    <button
                      type="button"
                      className="page-header-back-btn"
                      onClick={() => setSelectedStaffForDetail(null)}
                      title="Back to Staff"
                      aria-label="Back to Staff"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <p className="list-empty" style={{ margin: 0 }}>Loading staff details…</p>
                  </div>
                )}
              </div>
            ) : (
            <div className="card">
              <h2>All Staff</h2>
              {staff.length === 0 ? (
                <p className="list-empty">No staff found.</p>
              ) : (
                <>
                  <div className="staff-role-groups">
                    {staffByRole.map((entry) => (
                      <button
                        key={entry.role}
                        type="button"
                        className={`staff-role-card ${selectedStaffRole === entry.role ? "active" : ""}`}
                        onClick={() => setSelectedStaffRole(entry.role)}
                      >
                        <span className="staff-role-card-name">{entry.role}</span>
                        <span className="staff-role-card-count">{entry.members.length} staff</span>
                      </button>
                    ))}
                  </div>
                  <div className="course-cards">
                    {(staffByRole.find((entry) => entry.role === selectedStaffRole)?.members || []).map((member) => (
                      <div key={member.id} className="course-card staff-card">
                        <span className="staff-card-time">{formatRelativeTime(member.createdAt || member.createdOn || member.created_on)}</span>
                        <div className="course-card-body staff-card-body">
                          <span className="staff-card-avatar" aria-hidden="true">
                            <Icon name="profile" active={false} />
                          </span>
                          <div className="staff-card-info">
                            <h3 className="course-card-name">{member.fullName}</h3>
                            <span className="course-card-code">{member.staffId || "N/A"}</span>
                            <p className="staff-card-role">{member.role || "Staff"}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="course-card-btn"
                          onClick={() => setSelectedStaffForDetail(member)}
                        >
                          View
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            )}
          </section>
        )}

        {activeTab === "progress" && (
          <section className="tab-page">
            <div className="tab-page-header">
              <h2 className="tab-page-title">Progress Report</h2>
              <button type="button" className="ghost" onClick={() => loadProgressReport().catch((error) => setProgressReportError(error.message))}>
                Refresh
              </button>
            </div>

            <section className="grid stats stats-bar progress-report-stats">
              <button
                type="button"
                className={`stat-card progress-stat-card ${progressReportView === "failed" ? "active" : ""}`}
                onClick={() => setProgressReportView("failed")}
              >
                <p>Failed Tests</p>
                <h3>{progressCardCounts.failed}</h3>
                <div className="stat-details"><small>Locked after max attempts</small></div>
              </button>
              <button
                type="button"
                className={`stat-card progress-stat-card ${progressReportView === "passed" ? "active" : ""}`}
                onClick={() => setProgressReportView("passed")}
              >
                <p>Passed Tests</p>
                <h3>{progressCardCounts.passed}</h3>
                <div className="stat-details"><small>Quiz pass events</small></div>
              </button>
              <button
                type="button"
                className={`stat-card progress-stat-card ${progressReportView === "certified" ? "active" : ""}`}
                onClick={() => setProgressReportView("certified")}
              >
                <p>Certifications</p>
                <h3>{progressCardCounts.certifications}</h3>
                <div className="stat-details"><small>Unique staff certified</small></div>
              </button>
              <button
                type="button"
                className={`stat-card progress-stat-card ${progressReportView === "outstanding" ? "active" : ""}`}
                onClick={() => setProgressReportView("outstanding")}
              >
                <p>Outstanding Courses</p>
                <h3>{progressCardCounts.outstanding}</h3>
                <div className="stat-details"><small>Staff with pending courses</small></div>
              </button>
            </section>

            <div className="card progress-report-card">
              {progressReportLoading ? (
                <p className="list-empty">Loading report…</p>
              ) : progressReportError ? (
                <p className="edit-course-modal-error" role="alert">{progressReportError}</p>
              ) : progressReportView === "certified" ? (
                progressReportData.certified.length === 0 ? (
                  <p className="list-empty">No certification records yet.</p>
                ) : (
                  <div className="staff-detail-progress-table-wrap">
                    <table className="staff-detail-progress-table">
                      <thead>
                        <tr>
                          <th>Staff</th>
                          <th>Staff ID</th>
                          <th>Course</th>
                          <th>Grade</th>
                          <th>Average</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progressReportData.certified.map((row) => (
                          <tr key={row.id}>
                            <td><strong>{row.staffName}</strong></td>
                            <td>{row.staffId}</td>
                            <td>{row.courseName}</td>
                            <td><span className="badge badge--completed">{row.grade}</span></td>
                            <td>{row.averageScore != null ? `${Math.round(row.averageScore)}%` : "—"}</td>
                            <td>{formatDateTime(row.time)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : progressReportView === "passed" ? (
                progressReportData.passed.length === 0 ? (
                  <p className="list-empty">No passed test records yet.</p>
                ) : (
                  <div className="staff-detail-progress-table-wrap">
                    <table className="staff-detail-progress-table">
                      <thead>
                        <tr>
                          <th>Staff</th>
                          <th>Staff ID</th>
                          <th>Course</th>
                          <th>Module</th>
                          <th>Score</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progressReportData.passed.map((row) => (
                          <tr key={row.id}>
                            <td><strong>{row.staffName}</strong></td>
                            <td>{row.staffId}</td>
                            <td>{row.courseName}</td>
                            <td>{row.moduleTitle}</td>
                            <td>{row.score != null ? `${Math.round(row.score)}%` : "—"}</td>
                            <td>{formatDateTime(row.time)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : progressReportView === "failed" ? (
                progressReportData.failed.length === 0 ? (
                  <p className="list-empty">No failed test records yet.</p>
                ) : (
                  <div className="staff-detail-progress-table-wrap">
                    <table className="staff-detail-progress-table">
                      <thead>
                        <tr>
                          <th>Staff</th>
                          <th>Staff ID</th>
                          <th>Course</th>
                          <th>Module</th>
                          <th>Attempts</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progressReportData.failed.map((row) => (
                          <tr key={row.id}>
                            <td><strong>{row.staffName}</strong></td>
                            <td>{row.staffId}</td>
                            <td>{row.courseName}</td>
                            <td>{row.moduleTitle}</td>
                            <td>{row.attempts ?? row.failStreak ?? "—"}</td>
                            <td>{formatDateTime(row.time)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                progressReportData.outstanding.length === 0 ? (
                  <p className="list-empty">No outstanding courses. Great progress!</p>
                ) : (
                  <div className="staff-detail-progress-table-wrap">
                    <table className="staff-detail-progress-table">
                      <thead>
                        <tr>
                          <th>Staff</th>
                          <th>Staff ID</th>
                          <th>Outstanding Courses</th>
                          <th>Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progressReportData.outstanding.map((row) => (
                          <tr key={`${row.staffId}-${row.staffName}`}>
                            <td><strong>{row.staffName}</strong></td>
                            <td>{row.staffId}</td>
                            <td>
                              {(row.pendingCourses || []).map((c) => `${c.name} (${c.status.replace("_", " ")})`).join(", ")}
                            </td>
                            <td>{row.completedCount}/{row.totalAssigned} completed</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {activeTab === "notifications" && (
          <section className="tab-page">
            <div className="tab-page-header">
              <h2 className="tab-page-title">Notifications</h2>
              <div className="notifications-toolbar">
                <label className="notifications-filter-label">
                  Show:
                  <select
                    value={notificationFilter}
                    onChange={(e) => setNotificationFilter(e.target.value)}
                    className="notifications-filter-select"
                  >
                    <option value="all">All</option>
                    <option value="failed">Failed only</option>
                    <option value="passed">Passed only</option>
                    <option value="certified">Certified only</option>
                    <option value="unread">Unread only</option>
                  </select>
                </label>
                {notifications.length > 0 && (
                  <button type="button" className="ghost" onClick={handleMarkAllNotificationsRead}>
                    Mark all as read
                  </button>
                )}
              </div>
            </div>
            <div className="card">
              {filteredNotifications.length === 0 ? (
                <p className="list-empty">No notifications yet.</p>
              ) : (
                <ul className="notifications-list">
                  {filteredNotifications.map((n) => (
                    <li
                      key={n.id}
                      className={`notifications-item ${n.read ? "read" : "unread"}`}
                    >
                      <div className="notifications-item-main">
                        <span className={`notifications-type notifications-type--${n.type}`}>
                          {n.type === "quiz_passed" && "Passed"}
                          {n.type === "quiz_locked" && "Failed 3×"}
                          {n.type === "course_certified" && "Certified"}
                        </span>
                        <p className="notifications-message">{n.message}</p>
                        <small className="notifications-meta">
                          {formatRelativeTime(n.createdAt)}
                          {!n.read && (
                            <button
                              type="button"
                              className="notifications-mark-read"
                              onClick={() => handleMarkNotificationRead(n.id, true)}
                            >
                              Mark read
                            </button>
                          )}
                        </small>
                        {n.type === "quiz_locked" && n.metadata?.moduleKey && (
                          <div className="notifications-actions">
                            <button
                              type="button"
                              className="btn-create-course"
                              onClick={() => handleResetAttempts(n.staffId, n.metadata.moduleKey)}
                              disabled={busyAction === "resetAttempts"}
                            >
                              {busyAction === "resetAttempts" ? <><span className="btn-spinner" aria-hidden="true" />Loading…</> : "Reset — allow retry"}
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {addSubjectModalOpen && selectedCourseForDetail && (
          <div className="add-course-modal-overlay" onClick={closeAddSubjectModal}>
            <div className="add-course-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="add-course-modal-title">Add subject</h3>
              <label className="add-course-modal-label">Subject name</label>
              <input
                type="text"
                className="add-course-modal-input"
                placeholder="e.g. Food Safety Basics"
                value={addSubjectName}
                onChange={(e) => {
                  setAddSubjectName(e.target.value);
                  setAddSubjectError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSubmitAddSubject()}
                autoFocus
                autoComplete="off"
              />
              {addSubjectError && (
                <p className="add-course-modal-error" role="alert">{addSubjectError}</p>
              )}
              <div className="add-course-modal-actions">
                <button type="button" className="btn-edit-ghost" onClick={closeAddSubjectModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="add-course-modal-create-btn"
                  onClick={handleSubmitAddSubject}
                  disabled={busyAction === "createSubject"}
                >
                  {busyAction === "createSubject" ? <><span className="btn-spinner" aria-hidden="true" />Creating…</> : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}

        {addCourseModalOpen && (
          <div className="add-course-modal-overlay" onClick={closeAddCourseModal}>
            <div className="add-course-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="add-course-modal-title">Add course</h3>
              <label className="add-course-modal-label">Course code</label>
              <input
                type="text"
                className="add-course-modal-input"
                placeholder="e.g. 100"
                value={addCourseCode}
                onChange={(e) => {
                  setAddCourseCode(e.target.value.toUpperCase());
                  setAddCourseError("");
                }}
                autoFocus
                autoComplete="off"
              />
              <label className="add-course-modal-label">Course name</label>
              <input
                type="text"
                className="add-course-modal-input"
                placeholder="e.g. Food Safety"
                value={addCourseName}
                onChange={(e) => {
                  setAddCourseName(e.target.value);
                  setAddCourseError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSubmitAddCourse()}
                autoComplete="off"
              />
              {addCourseError && (
                <p className="add-course-modal-error" role="alert">{addCourseError}</p>
              )}
              <div className="add-course-modal-actions">
                <button type="button" className="btn-edit-ghost" onClick={closeAddCourseModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="add-course-modal-create-btn"
                  onClick={handleSubmitAddCourse}
                  disabled={busyAction === "createCourse"}
                >
                  {busyAction === "createCourse" ? <><span className="btn-spinner" aria-hidden="true" />Creating…</> : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}

        {courseToEdit && (
          <div className="edit-course-modal-overlay" onClick={closeEditCourseModal}>
            <div className="edit-course-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="edit-course-modal-title">Edit course</h3>
              <label className="edit-course-modal-label">Course name</label>
              <input
                type="text"
                className="edit-course-modal-input"
                placeholder="Course name"
                value={editCourseName}
                onChange={(e) => {
                  setEditCourseName(e.target.value);
                  setEditCourseError("");
                }}
                autoFocus
                autoComplete="off"
              />
              <label className="edit-course-modal-label">Course code</label>
              <input
                type="text"
                className="edit-course-modal-input"
                placeholder="Course code"
                value={editCourseCode}
                onChange={(e) => {
                  setEditCourseCode(e.target.value.toUpperCase());
                  setEditCourseError("");
                }}
                autoComplete="off"
              />
              {editCourseError && (
                <p className="edit-course-modal-error" role="alert">{editCourseError}</p>
              )}
              <div className="edit-course-modal-actions">
                <button type="button" className="btn-edit-ghost" onClick={closeEditCourseModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="edit-course-modal-save-btn"
                  onClick={handleConfirmEditCourse}
                  disabled={busyAction === "editCourse"}
                >
                  {busyAction === "editCourse" ? <><span className="btn-spinner" aria-hidden="true" />Saving…</> : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {courseToDelete && (
          <div className="delete-course-modal-overlay" onClick={closeDeleteCourseModal}>
            <div className="delete-course-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="delete-course-modal-title">Delete course</h3>
              <p className="delete-course-modal-desc">
                To delete <strong>{courseToDelete.name}</strong> (code: {courseToDelete.code}), enter the course code below.
              </p>
              <input
                type="text"
                className="delete-course-modal-input"
                placeholder="Enter course code"
                value={deleteCourseCodeInput}
                onChange={(e) => {
                  setDeleteCourseCodeInput(e.target.value);
                  setDeleteCourseCodeError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleConfirmDeleteCourse()}
                autoFocus
                autoComplete="off"
              />
              {deleteCourseCodeError && (
                <p className="delete-course-modal-error" role="alert">{deleteCourseCodeError}</p>
              )}
              <div className="delete-course-modal-actions">
                <button type="button" className="btn-edit-ghost" onClick={closeDeleteCourseModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="delete-course-modal-delete-btn"
                  onClick={handleConfirmDeleteCourse}
                  disabled={busyAction === "deleteCourse"}
                >
                  {busyAction === "deleteCourse" ? <><span className="btn-spinner" aria-hidden="true" />Deleting…</> : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {subjectToEdit && (
          <div className="edit-course-modal-overlay" onClick={closeEditSubjectModal}>
            <div className="edit-course-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="edit-course-modal-title">Edit subject</h3>
              <label className="edit-course-modal-label">Subject name</label>
              <input
                type="text"
                className="edit-course-modal-input"
                placeholder="Subject name"
                value={editSubjectName}
                onChange={(e) => {
                  setEditSubjectName(e.target.value);
                  setEditSubjectError("");
                }}
                autoFocus
                autoComplete="off"
              />
              {editSubjectError && (
                <p className="edit-course-modal-error" role="alert">{editSubjectError}</p>
              )}
              <div className="edit-course-modal-actions">
                <button type="button" className="btn-edit-ghost" onClick={closeEditSubjectModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="edit-course-modal-save-btn"
                  onClick={handleConfirmEditSubject}
                  disabled={busyAction === "editSubject"}
                >
                  {busyAction === "editSubject" ? <><span className="btn-spinner" aria-hidden="true" />Saving…</> : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {subjectToDelete && (
          <div className="delete-course-modal-overlay" onClick={closeDeleteSubjectModal}>
            <div className="delete-course-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="delete-course-modal-title">Delete subject</h3>
              <p className="delete-course-modal-desc">
                Delete <strong>{subjectToDelete.name}</strong> and all its modules? This cannot be undone.
              </p>
              <div className="delete-course-modal-actions">
                <button type="button" className="btn-edit-ghost" onClick={closeDeleteSubjectModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="delete-course-modal-delete-btn"
                  onClick={handleConfirmDeleteSubject}
                  disabled={busyAction === "deleteSubject"}
                >
                  {busyAction === "deleteSubject" ? <><span className="btn-spinner" aria-hidden="true" />Deleting…</> : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {moduleToEdit && (
          <div className="edit-course-modal-overlay" onClick={closeEditModuleModal}>
            <div className="edit-course-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="edit-course-modal-title">Edit module</h3>
              <label className="edit-course-modal-label">Module title</label>
              <input
                type="text"
                className="edit-course-modal-input"
                placeholder="Module title"
                value={editModuleTitle}
                onChange={(e) => {
                  setEditModuleTitle(e.target.value);
                  setEditModuleError("");
                }}
                autoFocus
                autoComplete="off"
              />
              {editModuleError && (
                <p className="edit-course-modal-error" role="alert">{editModuleError}</p>
              )}
              <div className="edit-course-modal-actions">
                <button type="button" className="btn-edit-ghost" onClick={closeEditModuleModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="edit-course-modal-save-btn"
                  onClick={handleConfirmEditModule}
                  disabled={busyAction === "editModule"}
                >
                  {busyAction === "editModule" ? <><span className="btn-spinner" aria-hidden="true" />Saving…</> : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {moduleToDelete && (
          <div className="delete-course-modal-overlay" onClick={closeDeleteModuleModal}>
            <div className="delete-course-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="delete-course-modal-title">Delete module</h3>
              <p className="delete-course-modal-desc">
                Delete module <strong>{moduleToDelete.title || moduleToDelete.key}</strong>? Quiz and progress data will be removed. This cannot be undone.
              </p>
              <div className="delete-course-modal-actions">
                <button type="button" className="btn-edit-ghost" onClick={closeDeleteModuleModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="delete-course-modal-delete-btn"
                  onClick={handleConfirmDeleteModule}
                  disabled={busyAction === "deleteModule"}
                >
                  {busyAction === "deleteModule" ? <><span className="btn-spinner" aria-hidden="true" />Deleting…</> : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {staffToEdit && (
          <div className="edit-course-modal-overlay" onClick={closeEditStaffModal}>
            <div
              className="edit-course-modal edit-staff-modal assign-courses-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="edit-course-modal-title">Edit staff</h3>
              <form onSubmit={handleConfirmEditStaff}>
              <label className="edit-course-modal-label" htmlFor="edit-staff-full-name">Full name</label>
              <input
                id="edit-staff-full-name"
                type="text"
                className="edit-course-modal-input"
                placeholder="Full name"
                value={editStaffForm.fullName}
                onChange={(e) => {
                  setEditStaffForm((prev) => ({ ...prev, fullName: e.target.value }));
                  setEditStaffError("");
                }}
                autoFocus
                autoComplete="name"
                required
              />
              <label className="edit-course-modal-label" htmlFor="edit-staff-id">Staff ID</label>
              <input
                id="edit-staff-id"
                type="text"
                className="edit-course-modal-input"
                placeholder="Staff ID"
                value={editStaffForm.staffId}
                onChange={(e) => {
                  setEditStaffForm((prev) => ({ ...prev, staffId: e.target.value }));
                  setEditStaffError("");
                }}
                autoComplete="off"
                required
              />
              <label className="edit-course-modal-label" htmlFor="edit-staff-email">Email</label>
              <input
                id="edit-staff-email"
                type="email"
                className="edit-course-modal-input"
                placeholder="Email (optional)"
                value={editStaffForm.email}
                onChange={(e) => {
                  setEditStaffForm((prev) => ({ ...prev, email: e.target.value }));
                  setEditStaffError("");
                }}
                autoComplete="email"
              />
              <label className="edit-course-modal-label" htmlFor="edit-staff-role">Role</label>
              <select
                id="edit-staff-role"
                className="edit-course-modal-input"
                value={editStaffForm.role}
                onChange={(e) => {
                  setEditStaffForm((prev) => ({ ...prev, role: e.target.value }));
                  setEditStaffError("");
                }}
                required
              >
                {!staffRoles.includes(editStaffForm.role) && editStaffForm.role ? (
                  <option value={editStaffForm.role}>{editStaffForm.role}</option>
                ) : null}
                {staffRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <p className="edit-course-modal-label">Assigned courses</p>
              <div className="assign-courses-list">
                {courses.length === 0 ? (
                  <p className="list-empty">No courses available.</p>
                ) : (
                  courses.map((course) => {
                    const checked = editStaffForm.assignedCourseCodes.includes(course.code);
                    return (
                      <label key={course.code} className="assign-courses-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setEditStaffForm((prev) => ({
                              ...prev,
                              assignedCourseCodes: checked
                                ? prev.assignedCourseCodes.filter((c) => c !== course.code)
                                : [...prev.assignedCourseCodes, course.code],
                            }));
                            setEditStaffError("");
                          }}
                        />
                        <span className="assign-courses-name">{course.name}</span>
                        <span className="assign-courses-code">{course.code}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {editStaffError && (
                <p className="edit-course-modal-error" role="alert">{editStaffError}</p>
              )}
              <div className="edit-course-modal-actions">
                <button type="button" className="btn-edit-ghost" onClick={closeEditStaffModal}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="edit-course-modal-save-btn"
                  disabled={busyAction === "editStaff"}
                >
                  {busyAction === "editStaff" ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Saving…
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
              </form>
            </div>
          </div>
        )}

        {staffToDelete && (
          <div className="delete-course-modal-overlay" onClick={closeDeleteStaffModal}>
            <div className="delete-course-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="delete-course-modal-title">Delete staff member</h3>
              <p className="delete-course-modal-desc">
                Delete this staff member? This cannot be undone.
              </p>
              <div className="delete-course-modal-actions">
                <button type="button" className="btn-edit-ghost" onClick={closeDeleteStaffModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="delete-course-modal-delete-btn"
                  onClick={handleConfirmDeleteStaff}
                  disabled={busyAction === "deleteStaff"}
                >
                  {busyAction === "deleteStaff" ? <><span className="btn-spinner" aria-hidden="true" />Deleting…</> : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {staffToAssignCourses && (
          <div className="edit-course-modal-overlay" onClick={closeAssignCoursesModal}>
            <div className="edit-course-modal assign-courses-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="edit-course-modal-title">Assign courses</h3>
              <p className="edit-course-modal-label">Select courses for {staffToAssignCourses.fullName || staffToAssignCourses.staffId}.</p>
              <div className="assign-courses-list">
                {courses.length === 0 ? (
                  <p className="list-empty">No courses available.</p>
                ) : (
                  courses.map((course) => {
                    const checked = assignCoursesSelectedCodes.includes(course.code);
                    return (
                      <label key={course.code} className="assign-courses-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setAssignCoursesSelectedCodes((prev) =>
                              prev.includes(course.code)
                                ? prev.filter((c) => c !== course.code)
                                : [...prev, course.code]
                            );
                            setAssignCoursesError("");
                          }}
                        />
                        <span className="assign-courses-name">{course.name}</span>
                        <span className="assign-courses-code">{course.code}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {assignCoursesError && (
                <p className="edit-course-modal-error" role="alert">{assignCoursesError}</p>
              )}
              <div className="edit-course-modal-actions">
                <button type="button" className="btn-edit-ghost" onClick={closeAssignCoursesModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="edit-course-modal-save-btn"
                  onClick={handleConfirmAssignCourses}
                  disabled={busyAction === "assignCourses"}
                >
                  {busyAction === "assignCourses" ? <><span className="btn-spinner" aria-hidden="true" />Saving…</> : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
        </main>
      </div>
    </div>
  );
}

function Stat({ title, value, details = [] }) {
  return (
    <div className="stat-card">
      <p>{title}</p>
      <h3>{value}</h3>
      {details.length > 0 ? (
        <div className="stat-details">
          {details.map((detail) => (
            <small key={detail}>{detail}</small>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default App;
