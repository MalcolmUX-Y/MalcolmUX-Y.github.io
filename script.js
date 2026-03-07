const db = window.db;

const SUPABASE_ANON_KEY =
  window.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsZWNpbWJwZnV6bGZseXZnanJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4Mjg4MTksImV4cCI6MjA4ODQwNDgxOX0.Wcifm_Wjjm1olJefkzOhP2_ZBuDVkqMIB2gGIGpYpZQ";

const ANALYZE_COURSE_URL =
  "https://flecimbpfuzlflyvgjrk.supabase.co/functions/v1/analyze-course";

if (!db) {
  console.error("Supabase client not found on window.db");
}

const state = {
  course: null,
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

const resetAllBtn = document.getElementById("resetAllBtn");
const clearWeekFormBtn = document.getElementById("clearWeekFormBtn");

const fileUpload = document.getElementById("fileUpload");
const uploadBtn = document.getElementById("uploadBtn");
const clearFilesBtn = document.getElementById("clearFilesBtn");
const fileList = document.getElementById("fileList");
const filePreviewEmpty = document.getElementById("filePreviewEmpty");
const filePreviewBox = document.getElementById("filePreviewBox");
const filePreviewTitle = document.getElementById("filePreviewTitle");
const filePreviewInfo = document.getElementById("filePreviewInfo");
const filePreviewContent = document.getElementById("filePreviewContent");

const dashboardCourseTitle = document.getElementById("dashboardCourseTitle");
const dashboardCourseMeta = document.getElementById("dashboardCourseMeta");
const nextTaskTitle = document.getElementById("nextTaskTitle");
const nextTaskMeta = document.getElementById("nextTaskMeta");
const nearestDeadlineTitle = document.getElementById("nearestDeadlineTitle");
const nearestDeadlineMeta = document.getElementById("nearestDeadlineMeta");
const totalWorkloadTitle = document.getElementById("totalWorkloadTitle");
const totalWorkloadMeta = document.getElementById("totalWorkloadMeta");
const weeksPlannedTitle = document.getElementById("weeksPlannedTitle");
const weeksPlannedMeta = document.getElementById("weeksPlannedMeta");

const weeksContainer = document.getElementById("weeksContainer");
const weekCardTemplate = document.getElementById("weekCardTemplate");

function assertDb() {
  if (!db) {
    alert("Database connection not found.");
    throw new Error("Supabase client not found on window.db");
  }
}

function formatDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function safeText(value, fallback = "Not set") {
  return value && String(value).trim() ? value : fallback;
}

function setWeekSubmitLabel(label) {
  const submitBtn = weekForm?.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = label;
}

function showFilePreview(title, info, content) {
  filePreviewTitle.textContent = title;
  filePreviewInfo.textContent = info;
  filePreviewContent.textContent = content;
  filePreviewEmpty.classList.add("hidden");
  filePreviewBox.classList.remove("hidden");
}

function hideFilePreview() {
  filePreviewBox.classList.add("hidden");
  filePreviewEmpty.classList.remove("hidden");
}

function handleError(context, error, userMessage) {
  console.error(context, error);
  if (userMessage) alert(userMessage);
}

async function analyzeCourseText(text) {
  if (!text || !String(text).trim()) {
    throw new Error("No text provided for AI analysis.");
  }

  const response = await fetch(ANALYZE_COURSE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ text }),
  });

  let data = null;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error("Could not parse AI response.");
  }

  if (!response.ok) {
    throw new Error(data?.error || "AI request failed");
  }

  return data?.result ?? data;
}

function resetWeekForm() {
  weekForm.reset();
  state.editingWeekId = null;
  setWeekSubmitLabel("Add week");
}

function populateWeekForm(week) {
  weekNumberInput.value = week.week_number ?? "";
  weekDateInput.value = week.week_date ?? "";
  weekReadingInput.value = week.reading ?? "";
  weekLectureInput.value = week.lecture ?? "";
  weekTaskInput.value = week.task ?? "";
  weekDeadlineInput.value = week.deadline ?? "";
  weekHoursInput.value = week.hours ?? "";
  weekPriorityInput.value = week.priority ?? "Normal";

  state.editingWeekId = week.id;
  setWeekSubmitLabel("Update week");
}

function setCourseForm(course) {
  courseTitleInput.value = course?.title ?? "";
  semesterStartInput.value = course?.semester_start ?? "";
  semesterEndInput.value = course?.semester_end ?? "";
  lectureScheduleInput.value = course?.lecture_schedule ?? "";
  courseNoteInput.value = course?.note ?? "";
}

function renderCourseHeader() {
  if (!state.course) {
    dashboardCourseTitle.textContent = "No course selected";
    dashboardCourseMeta.textContent =
      "Save a course setup to populate the dashboard.";
    return;
  }

  dashboardCourseTitle.textContent =
    safeText(state.course.title, "Untitled course");

  const parts = [];

  if (state.course.semester_start || state.course.semester_end) {
    parts.push(
      `${state.course.semester_start || "?"} → ${state.course.semester_end || "?"}`
    );
  }

  if (state.course.lecture_schedule) {
    parts.push(state.course.lecture_schedule);
  }

  dashboardCourseMeta.textContent =
    parts.join(" • ") || "Course saved in database.";
}

function renderSummary() {
  if (!state.weeks.length) {
    nextTaskTitle.textContent = "No tasks yet";
    nextTaskMeta.textContent = "Add a week to generate structure.";

    nearestDeadlineTitle.textContent = "No deadlines yet";
    nearestDeadlineMeta.textContent = "Deadlines will appear here.";

    totalWorkloadTitle.textContent = "0 hours";
    totalWorkloadMeta.textContent = "Across all added weeks.";

    weeksPlannedTitle.textContent = "0";
    weeksPlannedMeta.textContent = "Structured course units created.";
    return;
  }

  const sortedByWeek = [...state.weeks].sort((a, b) => {
    const aNum = a.week_number ?? 9999;
    const bNum = b.week_number ?? 9999;
    return aNum - bNum;
  });

  const nextWeek = sortedByWeek[0];
  nextTaskTitle.textContent =
    safeText(nextWeek.task) !== "Not set"
      ? nextWeek.task
      : `Week ${nextWeek.week_number ?? "-"}`;
  nextTaskMeta.textContent =
    nextWeek.reading || nextWeek.lecture || "No details";

  const weeksWithDeadline = state.weeks
    .filter((week) => week.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  if (weeksWithDeadline.length) {
    nearestDeadlineTitle.textContent = `Week ${weeksWithDeadline[0].week_number ?? "-"}`;
    nearestDeadlineMeta.textContent = formatDate(weeksWithDeadline[0].deadline);
  } else {
    nearestDeadlineTitle.textContent = "No deadlines yet";
    nearestDeadlineMeta.textContent = "Deadlines will appear here.";
  }

  const totalHours = state.weeks.reduce(
    (sum, week) => sum + (Number(week.hours) || 0),
    0
  );

  totalWorkloadTitle.textContent = `${totalHours} hours`;
  totalWorkloadMeta.textContent = "Across all added weeks.";

  weeksPlannedTitle.textContent = String(state.weeks.length);
  weeksPlannedMeta.textContent = "Structured course units created.";
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

  const sortedWeeks = [...state.weeks].sort((a, b) => {
    const aNum = a.week_number ?? 9999;
    const bNum = b.week_number ?? 9999;
    return aNum - bNum;
  });

  for (const week of sortedWeeks) {
    const fragment = weekCardTemplate.content.cloneNode(true);

    fragment.querySelector(".week-label").textContent = `Week ${week.week_number ?? "-"}`;
    fragment.querySelector(".week-title").textContent =
      week.task || week.lecture || "Planned week";
    fragment.querySelector(".priority-badge").textContent =
      week.priority || "Normal";

    fragment.querySelector(".week-date").textContent = formatDate(week.week_date);
    fragment.querySelector(".week-deadline").textContent = formatDate(week.deadline);
    fragment.querySelector(".week-hours").textContent =
      week.hours ? `${week.hours}h` : "Not set";
    fragment.querySelector(".week-lecture").textContent =
      week.lecture || "Not set";
    fragment.querySelector(".week-reading").textContent =
      week.reading || "Not set";
    fragment.querySelector(".week-task").textContent =
      week.task || "Not set";

    const editBtn = fragment.querySelector(".edit-week-btn");
    const deleteBtn = fragment.querySelector(".delete-week-btn");

    editBtn.addEventListener("click", () => populateWeekForm(week));

    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Delete this week?")) return;
      await deleteWeek(week.id);
    });

    weeksContainer.appendChild(fragment);
  }
}

function renderFileList() {
  if (!state.files.length) {
    fileList.innerHTML = `
      <div class="empty-file-state">
        <p class="muted">No files uploaded yet.</p>
      </div>
    `;
    return;
  }

  fileList.innerHTML = "";

  state.files.forEach((file) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "file-list-item btn btn-secondary";
    item.textContent = `${file.name} (${file.file_type || "unknown"})`;

    item.addEventListener("click", () => {
      showFilePreview(
        file.name,
        file.file_url || "Stored in db",
        "Preview not implemented for db storage files yet."
      );
    });

    fileList.appendChild(item);
  });
}

async function loadCourse() {
  assertDb();

  const { data, error } = await db
    .from("Courses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    handleError("loadCourse error", error);
    return;
  }

  state.course = data || null;
  setCourseForm(state.course);
  renderCourseHeader();
}

async function loadWeeks() {
  assertDb();

  if (!state.course?.id) {
    state.weeks = [];
    renderWeeks();
    renderSummary();
    return;
  }

  const { data, error } = await db
    .from("study_plan")
    .select("*")
    .eq("course_id", state.course.id)
    .order("week_number", { ascending: true });

  if (error) {
    handleError("loadWeeks error", error);
    return;
  }

  state.weeks = data || [];
  renderWeeks();
  renderSummary();
}

async function loadFiles() {
  assertDb();

  if (!state.course?.id) {
    state.files = [];
    renderFileList();
    return;
  }

  const { data, error } = await db
    .from("course_documents")
    .select("*")
    .eq("course_id", state.course.id)
    .order("created_at", { ascending: false });

  if (error) {
    handleError("loadFiles error", error);
    return;
  }

  state.files = data || [];
  renderFileList();
}

async function saveCourse() {
  assertDb();

  const payload = {
    title: courseTitleInput.value.trim(),
    semester:
      semesterStartInput.value && semesterEndInput.value
        ? `${semesterStartInput.value} → ${semesterEndInput.value}`
        : "",
    semester_start: semesterStartInput.value || null,
    semester_end: semesterEndInput.value || null,
    lecture_schedule: lectureScheduleInput.value.trim() || null,
    note: courseNoteInput.value.trim() || null,
  };

  if (!payload.title) {
    alert("Course title is required.");
    return;
  }

  if (state.course?.id) {
    const { data, error } = await db
      .from("Courses")
      .update(payload)
      .eq("id", state.course.id)
      .select()
      .single();

    if (error) {
      handleError("update course error", error, "Could not update course.");
      return;
    }

    state.course = data;
  } else {
    const { data, error } = await db
      .from("Courses")
      .insert(payload)
      .select()
      .single();

    if (error) {
      handleError("insert course error", error, "Could not save course.");
      return;
    }

    state.course = data;
  }

  renderCourseHeader();
  await loadWeeks();
  await loadFiles();
}

async function saveWeek() {
  assertDb();

  if (!state.course?.id) {
    alert("Save course first.");
    return;
  }

  const payload = {
    course_id: state.course.id,
    week_number: numberOrNull(weekNumberInput.value),
    week_date: weekDateInput.value || null,
    reading: weekReadingInput.value.trim() || null,
    lecture: weekLectureInput.value.trim() || null,
    task: weekTaskInput.value.trim() || null,
    deadline: weekDeadlineInput.value || null,
    hours: numberOrNull(weekHoursInput.value),
    priority: weekPriorityInput.value || "Normal",
    status: "pending",
    scheduled_date: weekDateInput.value || null,
  };

  if (!payload.week_number) {
    alert("Week number is required.");
    return;
  }

  if (state.editingWeekId) {
    const { error } = await db
      .from("study_plan")
      .update(payload)
      .eq("id", state.editingWeekId);

    if (error) {
      handleError("update week error", error, "Could not update week.");
      return;
    }
  } else {
    const { error } = await db.from("study_plan").insert(payload);

    if (error) {
      handleError("insert week error", error, "Could not save week.");
      return;
    }
  }

  resetWeekForm();
  await loadWeeks();
}

async function deleteWeek(id) {
  assertDb();

  const { error } = await db.from("study_plan").delete().eq("id", id);

  if (error) {
    handleError("deleteWeek error", error, "Could not delete week.");
    return;
  }

  if (state.editingWeekId === id) {
    resetWeekForm();
  }

  await loadWeeks();
}

async function resetAllData() {
  assertDb();

  if (
    !confirm("This will delete the current course, weeks and file metadata. Continue?")
  ) {
    return;
  }

  try {
    if (state.course?.id) {
      await db.from("course_documents").delete().eq("course_id", state.course.id);
      await db.from("study_plan").delete().eq("course_id", state.course.id);
      await db.from("Courses").delete().eq("id", state.course.id);
    }

    state.course = null;
    state.weeks = [];
    state.files = [];
    state.editingWeekId = null;

    courseForm.reset();
    resetWeekForm();
    renderCourseHeader();
    renderWeeks();
    renderSummary();
    renderFileList();
    hideFilePreview();
  } catch (error) {
    handleError("resetAllData error", error, "Could not reset all data.");
  }
}

async function uploadFiles(files) {
  assertDb();

  if (!state.course?.id) {
    alert("Save course first.");
    return;
  }

  for (const file of files) {
    const filePath = `${state.course.id}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await db.storage
      .from("course-files")
      .upload(filePath, file, { upsert: false });

    if (uploadError) {
      handleError("upload error", uploadError, `Could not upload ${file.name}`);
      continue;
    }

    const { data: publicData } = db.storage
      .from("course-files")
      .getPublicUrl(filePath);

    const { error: insertError } = await db.from("course_documents").insert({
      course_id: state.course.id,
      name: file.name,
      file_url: publicData.publicUrl,
      file_type: file.type || "unknown",
      ai_processed: false,
    });

    if (insertError) {
      handleError(
        "course_documents insert error",
        insertError,
        `Could not save metadata for ${file.name}`
      );
    }
  }

  await loadFiles();
}

function clearFilesUI() {
  state.files = [];
  renderFileList();
  hideFilePreview();
}

courseForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveCourse();
});

weekForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveWeek();
});

resetAllBtn?.addEventListener("click", async () => {
  await resetAllData();
});

clearWeekFormBtn?.addEventListener("click", () => {
  resetWeekForm();
});

uploadBtn?.addEventListener("click", () => {
  fileUpload?.click();
});

fileUpload?.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  await uploadFiles(files);
  fileUpload.value = "";
});

clearFilesBtn?.addEventListener("click", () => {
  clearFilesUI();
});

async function boot() {
  renderCourseHeader();
  renderWeeks();
  renderSummary();
  renderFileList();
  hideFilePreview();

  try {
    await loadCourse();
    await loadWeeks();
    await loadFiles();
  } catch (error) {
    handleError("boot error", error, "Could not load app data.");
  }
}

boot();
