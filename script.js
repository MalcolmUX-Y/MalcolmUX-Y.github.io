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
  files: [],
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

const uploadBtn = document.getElementById("uploadBtn");
const clearFilesBtn = document.getElementById("clearFilesBtn");
const fileUploadInput = document.getElementById("fileUpload");
const fileList = document.getElementById("fileList");

const filePreviewEmpty = document.getElementById("filePreviewEmpty");
const filePreviewBox = document.getElementById("filePreviewBox");
const filePreviewTitle = document.getElementById("filePreviewTitle");
const filePreviewInfo = document.getElementById("filePreviewInfo");
const filePreviewContent = document.getElementById("filePreviewContent");

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

  if (uploadBtn) {
    uploadBtn.addEventListener("click", () => {
      fileUploadInput.click();
    });
  }

  if (clearFilesBtn) {
    clearFilesBtn.addEventListener("click", clearAllFiles);
  }

  if (fileUploadInput) {
    fileUploadInput.addEventListener("change", handleFileUpload);
  }
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

function handleFileUpload(event) {
  const selectedFiles = Array.from(event.target.files || []);
  if (!selectedFiles.length) return;

  const fileReadPromises = selectedFiles.map(readSelectedFile);

  Promise.all(fileReadPromises)
    .then((mappedFiles) => {
      state.files.push(...mappedFiles);
      saveState();
      renderFiles();
      fileUploadInput.value = "";
    })
    .catch((error) => {
      console.error("Failed to read uploaded files:", error);
      alert("One or more files could not be read.");
    });
}

function readSelectedFile(file) {
  return new Promise((resolve) => {
    const extension = getFileExtension(file.name);
    const previewable = isPreviewableTextFile(file, extension);

    if (!previewable) {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type || "Unknown type",
        lastModified: file.lastModified || null,
        addedAt: new Date().toISOString(),
        previewable: false,
        content: "",
        extension,
      });
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type || "Text file",
        lastModified: file.lastModified || null,
        addedAt: new Date().toISOString(),
        previewable: true,
        content: typeof reader.result === "string" ? reader.result : "",
        extension,
      });
    };

    reader.onerror = () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type || "Unknown type",
        lastModified: file.lastModified || null,
        addedAt: new Date().toISOString(),
        previewable: false,
        content: "",
        extension,
      });
    };

    reader.readAsText(file);
  });
}

function clearWeekForm() {
  weekForm.reset();
  state.editingWeekId = null;
}

function clearAllFiles() {
  if (!state.files.length) return;

  const confirmed = window.confirm("Delete all uploaded file entries?");
  if (!confirmed) return;

  state.files = [];
  saveState();
  renderFiles();
  clearPreview();
}

function resetAllData() {
  const confirmed = window.confirm("Delete all course data, weeks and file entries?");
  if (!confirmed) return;

  state.course = {
    title: "",
    semesterStart: "",
    semesterEnd: "",
    lectureSchedule: "",
    courseNote: "",
  };
  state.weeks = [];
  state.files = [];
  state.editingWeekId = null;

  localStorage.removeItem(STORAGE_KEY);
  courseForm.reset();
  weekForm.reset();

  if (fileUploadInput) {
    fileUploadInput.value = "";
  }

  clearPreview();
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
  renderFiles();
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

    fragment.querySelector(".week-label").textContent = `Week ${week.number}`;
    fragment.querySelector(".week-title").textContent =
      week.task || "Structured course unit";

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

function renderFiles() {
  if (!fileList) return;

  if (!state.files.length) {
    fileList.innerHTML = `
      <div class="empty-file-state">
        <p class="muted">No files uploaded yet.</p>
      </div>
    `;
    return;
  }

  fileList.innerHTML = state.files
    .map(
      (file) => `
        <div class="file-item">
          <div class="file-item-main">
            <p class="file-name">${escapeHtml(file.name)}</p>
            <p class="file-meta">
              ${formatFileSize(file.size)} • ${escapeHtml(file.type || "Unknown type")}
            </p>
          </div>
          <div class="file-actions">
            <button
              type="button"
              class="btn btn-secondary btn-small open-file-btn"
              data-file-id="${file.id}"
            >
              Open
            </button>
            <button
              type="button"
              class="btn btn-danger btn-small remove-file-btn"
              data-file-id="${file.id}"
            >
              Remove
            </button>
          </div>
        </div>
      `
    )
    .join("");

  fileList.querySelectorAll(".remove-file-btn").forEach((button) => {
    button.addEventListener("click", () => {
      deleteFile(button.dataset.fileId);
    });
  });

  fileList.querySelectorAll(".open-file-btn").forEach((button) => {
    button.addEventListener("click", () => {
      openFilePreview(button.dataset.fileId);
    });
  });
}

function openFilePreview(id) {
  const file = state.files.find((item) => item.id === id);
  if (!file) return;

  filePreviewTitle.textContent = file.name;
  filePreviewInfo.textContent = `${formatFileSize(file.size)} • ${file.type || "Unknown type"}`;

  if (file.previewable && file.content) {
    filePreviewContent.textContent = file.content;
  } else {
    filePreviewContent.textContent =
      "This file type cannot be previewed as text in the browser yet. The file is listed as metadata only.";
  }

  filePreviewEmpty.classList.add("hidden");
  filePreviewBox.classList.remove("hidden");
}

function clearPreview() {
  filePreviewTitle.textContent = "Preview";
  filePreviewInfo.textContent = "";
  filePreviewContent.textContent = "";
  filePreviewBox.classList.add("hidden");
  filePreviewEmpty.classList.remove("hidden");
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

function deleteFile(id) {
  const confirmed = window.confirm("Delete this file entry?");
  if (!confirmed) return;

  state.files = state.files.filter((file) => file.id !== id);
  saveState();
  renderFiles();
  clearPreview();
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

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const roundedValue = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${roundedValue} ${units[unitIndex]}`;
}

function getFileExtension(filename) {
  const parts = String(filename).split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function isPreviewableTextFile(file, extension) {
  const previewableExtensions = ["txt", "md", "json", "csv", "js", "html", "css", "xml"];
  const typeStartsWithText = file.type && file.type.startsWith("text/");
  return typeStartsWithText || previewableExtensions.includes(extension);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);

    if (parsed.course) {
      state.course = parsed.course;
    }

    if (Array.isArray(parsed.weeks)) {
      state.weeks = parsed.weeks;
    }

    if (Array.isArray(parsed.files)) {
      state.files = parsed.files;
    }

    if (typeof parsed.editingWeekId !== "undefined") {
      state.editingWeekId = parsed.editingWeekId;
    }

    sortWeeks();
  } catch (error) {
    console.error("Failed to load StudyFlow state:", error);
  }
}
