const db = window.db;

if (!db) {
  console.error("db client not found on window.db");
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
const analyzePdfBtn = document.getElementById("analyzePdfBtn");

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

const SUPABASE_ANON_KEY =
  window.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsZWNpbWJwZnV6bGZseXZnanJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4Mjg4MTksImV4cCI6MjA4ODQwNDgxOX0.Wcifm_Wjjm1olJefkzOhP2_ZBuDVkqMIB2gGIGpYpZQ";

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

async function analyzeCourseText(text) {
  const functionUrl = "https://flecimbpfuzlflyvgjrk.supabase.co/functions/v1/analyze-course";

  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ text }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "AI request failed");
  }

  return data.result;
}

function resetWeekForm() {
  weekForm.reset();
  state.editingWeekId = null;
  const submitBtn = weekForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Add week";
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

  const submitBtn = weekForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Update week";
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
    dashboardCourseMeta.textContent = "Save a course setup to populate the dashboard.";
    return;
  }

  dashboardCourseTitle.textContent = state.course.title || "Untitled course";

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
  nextTaskTitle.textContent = nextWeek.task || `Week ${nextWeek.week_number}`;
  nextTaskMeta.textContent = nextWeek.reading || nextWeek.lecture || "No details";

  const weeksWithDeadline = state.weeks
    .filter((w) => w.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  if (weeksWithDeadline.length) {
    nearestDeadlineTitle.textContent = `Week ${weeksWithDeadline[0].week_number}`;
    nearestDeadlineMeta.textContent = formatDate(weeksWithDeadline[0].deadline);
  } else {
    nearestDeadlineTitle.textContent = "No deadlines yet";
    nearestDeadlineMeta.textContent = "Deadlines will appear here.";
  }

  const totalHours = state.weeks.reduce((sum, week) => sum + (Number(week.hours) || 0), 0);
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

  const sorted = [...state.weeks].sort((a, b) => {
    const aNum = a.week_number ?? 9999;
    const bNum = b.week_number ?? 9999;
    return aNum - bNum;
  });

  for (const week of sorted) {
    const fragment = weekCardTemplate.content.cloneNode(true);

    fragment.querySelector(".week-label").textContent = `Week ${week.week_number ?? "-"}`;
    fragment.querySelector(".week-title").textContent = week.task || week.lecture || "Planned week";
    fragment.querySelector(".priority-badge").textContent = week.priority || "Normal";

    fragment.querySelector(".week-date").textContent = formatDate(week.week_date);
    fragment.querySelector(".week-deadline").textContent = formatDate(week.deadline);
    fragment.querySelector(".week-hours").textContent = week.hours ? `${week.hours}h` : "Not set";
    fragment.querySelector(".week-lecture").textContent = week.lecture || "Not set";
    fragment.querySelector(".week-reading").textContent = week.reading || "Not set";
    fragment.querySelector(".week-task").textContent = week.task || "Not set";

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

    item.addEventListener("click", async () => {
      filePreviewTitle.textContent = file.name;
      filePreviewInfo.textContent = file.file_url || "Stored in db";
      filePreviewContent.textContent = "Document uploaded. Ready for analysis.";
      filePreviewEmpty.classList.add("hidden");
      filePreviewBox.classList.remove("hidden");
    });

    fileList.appendChild(item);
  });
}

async function loadCourse() {
  const { data, error } = await db
    .from("Courses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("loadCourse error", error);
    return;
  }

  state.course = data || null;
  setCourseForm(state.course);
  renderCourseHeader();
}

async function loadWeeks() {
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
    console.error("loadWeeks error", error);
    return;
  }

  state.weeks = data || [];
  renderWeeks();
  renderSummary();
}

async function loadFiles() {
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
    console.error("loadFiles error", error);
    return;
  }

  state.files = data || [];
  renderFileList();
}

async function saveCourse() {
  const payload = {
    title: courseTitleInput.value.trim(),
    semester: semesterStartInput.value && semesterEndInput.value
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
      console.error("update course error", error);
      alert("Could not update course.");
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
      console.error("insert course error", error);
      alert("Could not save course.");
      return;
    }

    state.course = data;
  }

  renderCourseHeader();
  await loadWeeks();
  await loadFiles();
}

async function saveWeek() {
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
      console.error("update week error", error);
      alert("Could not update week.");
      return;
    }
  } else {
    const { error } = await db
      .from("study_plan")
      .insert(payload);

    if (error) {
      console.error("insert week error", error);
      alert("Could not save week.");
      return;
    }
  }

  resetWeekForm();
  await loadWeeks();
}

async function deleteWeek(id) {
  const { error } = await db
    .from("study_plan")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteWeek error", error);
    alert("Could not delete week.");
    return;
  }

  if (state.editingWeekId === id) {
    resetWeekForm();
  }

  await loadWeeks();
}

async function resetAllData() {
  if (!confirm("This will delete the current course, weeks and file metadata. Continue?")) {
    return;
  }

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

  filePreviewBox.classList.add("hidden");
  filePreviewEmpty.classList.remove("hidden");
}

async function uploadFiles(files) {
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
      console.error("upload error", uploadError);
      alert(`Could not upload ${file.name}`);
      continue;
    }

    const { data: publicData } = db.storage
      .from("course-files")
      .getPublicUrl(filePath);

    const { error: insertError } = await db
      .from("course_documents")
      .insert({
        course_id: state.course.id,
        name: file.name,
        file_url: publicData.publicUrl,
        file_type: file.type || "unknown",
        ai_processed: false,
      });

    if (insertError) {
      console.error("course_documents insert error", insertError);
      alert(`Could not save metadata for ${file.name}`);
    }
  }

  await loadFiles();
}

async function extractTextFromPdfUrl(pdfUrl) {
  if (!window.pdfjsLib) {
    throw new Error("pdf.js is not loaded.");
  }

  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js";

  const loadingTask = pdfjsLib.getDocument(pdfUrl);
  const pdf = await loadingTask.promise;

  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(" ");
    fullText += `\n\n${pageText}`;
  }

  return fullText.trim();
}

function mapAiItemToStudyPlanRow(item, index, courseId) {
  const rawDate = typeof item.date === "string" ? item.date : "";
  const weekMatch = rawDate.match(/week\s*(\d+)/i);
  const weekNumber = weekMatch ? Number(weekMatch[1]) : index + 1;

  const readings = Array.isArray(item.readings) ? item.readings.join(" | ") : null;

  if (item.type === "event") {
    return {
      course_id: courseId,
      week_number: weekNumber,
      week_date: null,
      reading: null,
      lecture: item.title || item.topic || "Event",
      task: item.title || item.assignment || "Event",
      deadline: null,
      hours: null,
      priority: "High",
      status: "pending",
      scheduled_date: null,
    };
  }

  return {
    course_id: courseId,
    week_number: weekNumber,
    week_date: null,
    reading: readings,
    lecture: item.topic || null,
    task: item.assignment || null,
    deadline: null,
    hours: null,
    priority: "Normal",
    status: "pending",
    scheduled_date: null,
  };
}

async function analyzeLatestPdfAndPopulateStudyPlan() {
  if (!state.course?.id) {
    alert("Save course first.");
    return;
  }

  const pdfFiles = state.files.filter(
    (file) =>
      file.file_type === "application/pdf" ||
      String(file.name || "").toLowerCase().endsWith(".pdf")
  );

  if (!pdfFiles.length) {
    alert("No PDF uploaded yet.");
    return;
  }

  const latestPdf = pdfFiles[0];

  const confirmed = confirm(
    `Analyze this document and generate study plan items?\n\n${latestPdf.name}`
  );

  if (!confirmed) {
    return;
  }

  try {
    analyzePdfBtn.disabled = true;
    analyzePdfBtn.textContent = "Analyzing...";

    filePreviewTitle.textContent = latestPdf.name;
    filePreviewInfo.textContent = latestPdf.file_url || "PDF selected";
    filePreviewContent.textContent = "Extracting text from PDF...";
    filePreviewEmpty.classList.add("hidden");
    filePreviewBox.classList.remove("hidden");

    const extractedText = await extractTextFromPdfUrl(latestPdf.file_url);

    if (!extractedText || extractedText.length < 20) {
      throw new Error("Very little text was extracted from the PDF.");
    }

    filePreviewContent.textContent = "Sending extracted text to AI...";

    const aiResult = await analyzeCourseText(extractedText);

    if (!aiResult?.items?.length) {
      alert("AI found no usable study items in this PDF.");
      return;
    }

    const secondConfirm = confirm(
      `AI found ${aiResult.items.length} items. Insert them into your study plan?`
    );

    if (!secondConfirm) {
      filePreviewContent.textContent = "Analysis completed, but insertion was cancelled.";
      return;
    }

    const rows = aiResult.items.map((item, index) =>
      mapAiItemToStudyPlanRow(item, index, state.course.id)
    );

    const { error: deleteError } = await db
      .from("study_plan")
      .delete()
      .eq("course_id", state.course.id);

    if (deleteError) {
      throw deleteError;
    }

    const { error: insertError } = await db
      .from("study_plan")
      .insert(rows);

    if (insertError) {
      throw insertError;
    }

    const { error: updateError } = await db
      .from("course_documents")
      .update({ ai_processed: true })
      .eq("id", latestPdf.id);

    if (updateError) {
      console.error("course_documents update error", updateError);
    }

    filePreviewContent.textContent =
      `Analysis complete. ${rows.length} study plan items were created.`;

    await loadWeeks();
    await loadFiles();
  } catch (error) {
    console.error("analyzeLatestPdfAndPopulateStudyPlan error", error);
    alert(error.message || "Could not analyze PDF.");
    filePreviewContent.textContent =
      `Analysis failed: ${error.message || "Unknown error"}`;
  } finally {
    analyzePdfBtn.disabled = false;
    analyzePdfBtn.textContent = "Analyze document";
  }
}

function clearFilesUI() {
  state.files = [];
  renderFileList();
  filePreviewBox.classList.add("hidden");
  filePreviewEmpty.classList.remove("hidden");
}

courseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveCourse();
});

weekForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveWeek();
});

resetAllBtn.addEventListener("click", async () => {
  await resetAllData();
});

clearWeekFormBtn.addEventListener("click", () => {
  resetWeekForm();
});

uploadBtn.addEventListener("click", () => {
  fileUpload.click();
});

fileUpload.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  await uploadFiles(files);
  fileUpload.value = "";
});

clearFilesBtn.addEventListener("click", () => {
  clearFilesUI();
});

analyzePdfBtn?.addEventListener("click", async () => {
  await analyzeLatestPdfAndPopulateStudyPlan();
});

async function boot() {
  renderCourseHeader();
  renderWeeks();
  renderSummary();
  renderFileList();

  await loadCourse();
  await loadWeeks();
  await loadFiles();
}

boot();
