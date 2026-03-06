const STORAGE_KEY = "studyflow-dashboard-v1";

const state = {
  course: {
    title: "",
    semesterStart: "",
    semesterEnd: "",
    lectureSchedule: "",
    courseNote: "",
  },
  weeks: [],
  editingWeekId: null,
};

const courseForm = document.getElementById("courseForm");
const weekForm = document.getElementById("weekForm");

const courseTitleInput = document.getElementById("courseTitle");
const semesterStartInput = document.getElementById("semesterStart");
const semesterEndInput = document.getElementById("semesterEnd");
const lectureScheduleInput = document.getElementById("lectureSchedule");
const courseNoteInput = document.getElementById("courseNote");

const weekNumberInput = document.getElementById("weekNumber");
const weekDateInput = document.getElementById("weekDate");
const weekReadingInput = document.getElementById("weekReading");
const weekLectureInput = document.getElementById("weekLecture");
const weekTaskInput = document.getElementById("weekTask");
const weekDeadlineInput = document.getElementById("weekDeadline");
const weekHoursInput = document.getElementById("weekHours");
const weekPriorityInput = document.getElementById("weekPriority");

const dashboardCourseTitle = document.getElementById("dashboardCourseTitle");
const dashboardCourseMeta = document.getElementById("dashboardCourseMeta");

const nextTaskTitle = document.getElementById("nextTaskTitle");
const nextTaskMeta = document.getElementById("nextTaskMeta");
const nearestDeadlineTitle = document.getElementById("nearestDeadlineTitle");
const nearestDeadlineMeta = document.getElementById("nearestDeadlineMeta");
const totalWorkloadTitle = document.getElementById("totalWorkloadTitle");
const weeksPlannedTitle = document.getElementById("weeksPlannedTitle");

const weeksContainer = document.getElementById("weeksContainer");
const weekCardTemplate = document.getElementById("weekCardTemplate");

const clearWeekFormBtn = document.getElementById("clearWeekFormBtn");
const resetAllBtn = document.getElementById("resetAllBtn");

init();

function init() {
  loadState();
  hydrateForms();
  bindEvents();
  render();
}

function bindEvents() {
  courseForm.addEventListener("submit", handleCourseSubmit);
  weekForm.addEventListener("submit", handleWeekSubmit);
  clearWeekFormBtn.addEventListener("click", clearWeekForm);
  resetAllBtn.addEventListener("click", resetAllData);
}

function handleCourseSubmit(event) {
  event.preventDefault();

  state.course = {
    title: courseTitleInput.value.trim(),
    semesterStart: semesterStartInput.value,
    semesterEnd: semesterEndInput.value,
    lectureSchedule: lectureScheduleInput.value.trim(),
    courseNote: courseNoteInput.value.trim(),
  };

  saveState();
  render();
}

function handleWeekSubmit(event) {
  event.preventDefault();

  const week = {
    id: state.editingWeekId || crypto.randomUUID(),
    number: Number(weekNumberInput.value),
    date: weekDateInput.value,
    reading: weekReadingInput.value.trim(),
    lecture: weekLectureInput.value.trim(),
    task: weekTaskInput.value.trim(),
    deadline: weekDeadlineInput.value,
    hours: Number(weekHoursInput.value || 0),
    priority: weekPriorityInput.value,
  };

  if (!week.number) {
    alert("Week number is required.");
    return;
  }

  if (state.editingWeekId) {
    const index = state.weeks.findIndex((item) => item.id === state.editingWeekId);
    if (index !== -1) state.weeks[index] = week;
    state.editingWeekId = null;
  } else {
    state.weeks.push(week);
  }

  sortWeeks();
  saveState();
  clearWeekForm();
  render();
}

function clearWeekForm() {
  weekForm.reset();
  state.editingWeekId = null;
}

function resetAllData() {
  const confirmed = window.confirm("Delete all course data and weeks?");
  if (!confirmed) return;

  state.course = {
    title: "",
    semesterStart: "",
    semesterEnd: "",
    lectureSchedule: "",
    courseNote: "",
  };
  state.weeks = [];
  state.editingWeekId = null;

  localStorage.removeItem(STORAGE_KEY);
  courseForm.reset();
  weekForm.reset();
  render();
}

function hydrateForms() {
  courseTitleInput.value = state.course.title;
  semesterStartInput.value = state.course.semesterStart;
  semesterEndInput.value = state.course.semesterEnd;
  lectureScheduleInput.value = state.course.lectureSchedule;
  courseNoteInput.value = state.course.courseNote;
}

function render() {
  renderCourseHeader();
  renderSummary();
  renderWeeks();
}

function renderCourseHeader() {
  const { title, semesterStart, semesterEnd, lectureSchedule, courseNote } = state.course;

  dashboardCourseTitle.textContent = title || "No course selected";

  const metaParts = [];
  if (semesterStart || semesterEnd) {
    metaParts.push(`${formatDate(semesterStart)} → ${formatDate(semesterEnd)}`);
  }
  if (lectureSchedule) {
    metaParts.push(`Lecture: ${lectureSchedule}`);
  }
  if (courseNote) {
    metaParts.push(courseNote);
  }

  dashboardCourseMeta.textContent = metaParts.length
    ? metaParts.join(" • ")
    : "Save a course setup to populate the dashboard.";
}

function renderSummary() {
  const sortedByDeadline = [...state.weeks]
    .filter((week) => week.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  const urgentWeek = getUrgentWeek();
  const nearestDeadlineWeek = sortedByDeadline[0];
  const totalHours = state.weeks.reduce((sum, week) => sum + (week.hours || 0), 0);

  if (urgentWeek) {
    nextTaskTitle.textContent = urgentWeek.task || `Week ${urgentWeek.number} needs attention`;
    nextTaskMeta.textContent =
      `${urgentWeek.priority} priority • ${urgentWeek.reading ? "Reading prepared" : "No reading specified"}${
        urgentWeek.deadline ? ` • Deadline ${formatDate(urgentWeek.deadline)}` : ""
      }`;
  } else {
    nextTaskTitle.textContent = "No tasks yet";
    nextTaskMeta.textContent = "Add a week to generate structure.";
  }

  if (nearestDeadlineWeek) {
    nearestDeadlineTitle.textContent =
      nearestDeadlineWeek.task || `Week ${nearestDeadlineWeek.number}`;
    nearestDeadlineMeta.textContent =
      `${formatDate(nearestDeadlineWeek.deadline)} • ${daysUntilLabel(nearestDeadlineWeek.deadline)}`;
  } else {
    nearestDeadlineTitle.textContent = "No deadlines yet";
    nearestDeadlineMeta.textContent = "Deadlines will appear here.";
  }

  totalWorkloadTitle.textContent = `${trimTrailingZero(totalHours)} hours`;
  weeksPlannedTitle.textContent = String(state.weeks.length);
}

function renderWeeks() {
  weeksContainer.innerHTML = "";

  if (!state.weeks.length) {
    weeksContainer.innerHTML = `
      <div class="empty-state">
        <h3>No weeks added yet</h3>
        <p>Use the form on the left to build the semester structure.</p>
      </div>
    `;
    return;
  }

  state.weeks.forEach((week) => {
    const fragment = weekCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".week-card");

    fragment.querySelector(".week-label").textContent = `Week ${week.number}`;
    fragment.querySelector(".week-title").textContent =
      week.task || `Structured course unit`;

    const badge = fragment.querySelector(".priority-badge");
    badge.textContent = week.priority;
    if (week.priority === "High") badge.classList.add("priority-high");
    if (week.priority === "Critical") badge.classList.add("priority-critical");

    fragment.querySelector(".week-date").textContent = formatDate(week.date) || "Not set";
    fragment.querySelector(".week-deadline").textContent = formatDate(week.deadline) || "Not set";
    fragment.querySelector(".week-hours").textContent = `${trimTrailingZero(week.hours || 0)} h`;
    fragment.querySelector(".week-lecture").textContent = week.lecture || "Not set";
    fragment.querySelector(".week-reading").textContent = week.reading || "No reading added";
    fragment.querySelector(".week-task").textContent = week.task || "No task added";

    fragment.querySelector(".edit-week-btn").addEventListener("click", () => {
      populateWeekFormForEdit(week);
    });

    fragment.querySelector(".delete-week-btn").addEventListener("click", () => {
      deleteWeek(week.id);
    });

    weeksContainer.appendChild(fragment);
  });
}

function populateWeekFormForEdit(week) {
  state.editingWeekId = week.id;

  weekNumberInput.value = week.number;
  weekDateInput.value = week.date;
  weekReadingInput.value = week.reading;
  weekLectureInput.value = week.lecture;
  weekTaskInput.value = week.task;
  weekDeadlineInput.value = week.deadline;
  weekHoursInput.value = week.hours;
  weekPriorityInput.value = week.priority;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteWeek(id) {
  const confirmed = window.confirm("Delete this week?");
  if (!confirmed) return;

  state.weeks = state.weeks.filter((week) => week.id !== id);
  saveState();
  render();
}

function getUrgentWeek() {
  const priorityRank = {
    Critical: 3,
    High: 2,
    Normal: 1,
  };

  return [...state.weeks].sort((a, b) => {
    const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    const deadlineDifference = aDeadline - bDeadline;
    if (deadlineDifference !== 0) return deadlineDifference;

    const priorityDifference = priorityRank[b.priority] - priorityRank[a.priority];
    if (priorityDifference !== 0) return priorityDifference;

    return a.number - b.number;
  })[0];
}

function sortWeeks() {
  state.weeks.sort((a, b) => {
    if (a.date && b.date) {
      return new Date(a.date) - new Date(b.date);
    }
    return a.number - b.number;
  });
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntilLabel(value) {
  if (!value) return "No date";
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const target = new Date(value);
  target.setHours(0, 0, 0, 0);

  const diffMs = target - now;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `Due in ${diffDays} days`;
}

function trimTrailingZero(number) {
  return Number.isInteger(number) ? String(number) : String(number);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (parsed.course) state.course = parsed.course;
    if (Array.isArray(parsed.weeks)) state.weeks = parsed.weeks;
    if (typeof parsed.editingWeekId !== "undefined") {
      state.editingWeekId = parsed.editingWeekId;
    }
    sortWeeks();
  } catch (error) {
    console.error("Failed to load StudyFlow state:", error);
  }
}
