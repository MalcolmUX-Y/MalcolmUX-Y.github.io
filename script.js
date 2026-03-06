const supabase = window.supabase;

const courseForm = document.getElementById("courseForm");
const weekForm = document.getElementById("weekForm");

const courseTitleInput = document.getElementById("courseTitle");
const semesterStartInput = document.getElementById("semesterStart");
const semesterEndInput = document.getElementById("semesterEnd");
const lectureScheduleInput = document.getElementById("lectureSchedule");
const courseNoteInput = document.getElementById("courseNote");

const weeksContainer = document.getElementById("weeksContainer");

let currentCourseId = null;



/* -----------------------------
LOAD COURSE + WEEKS
----------------------------- */

async function init() {

  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .limit(1);

  if (courses && courses.length > 0) {

    const course = courses[0];

    currentCourseId = course.id;

    courseTitleInput.value = course.title || "";
    semesterStartInput.value = course.semester_start || "";
    semesterEndInput.value = course.semester_end || "";
    lectureScheduleInput.value = course.lecture_schedule || "";
    courseNoteInput.value = course.note || "";

    loadWeeks();

  }

}

init();



/* -----------------------------
SAVE COURSE
----------------------------- */

courseForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  const courseData = {
    title: courseTitleInput.value,
    semester_start: semesterStartInput.value,
    semester_end: semesterEndInput.value,
    lecture_schedule: lectureScheduleInput.value,
    note: courseNoteInput.value
  };

  if (currentCourseId) {

    await supabase
      .from("courses")
      .update(courseData)
      .eq("id", currentCourseId);

  } else {

    const { data } = await supabase
      .from("courses")
      .insert(courseData)
      .select()
      .single();

    currentCourseId = data.id;

  }

});



/* -----------------------------
ADD WEEK
----------------------------- */

weekForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  if (!currentCourseId) {
    alert("Save course first");
    return;
  }

  const weekNumber = document.getElementById("weekNumber").value;
  const weekDate = document.getElementById("weekDate").value;
  const reading = document.getElementById("weekReading").value;
  const lecture = document.getElementById("weekLecture").value;
  const task = document.getElementById("weekTask").value;
  const deadline = document.getElementById("weekDeadline").value;
  const hours = document.getElementById("weekHours").value;
  const priority = document.getElementById("weekPriority").value;

  await supabase
    .from("study_plan")
    .insert({
      course_id: currentCourseId,
      week_number: weekNumber,
      date: weekDate,
      reading,
      lecture,
      task,
      deadline,
      hours,
      priority
    });

  weekForm.reset();

  loadWeeks();

});



/* -----------------------------
LOAD WEEKS
----------------------------- */

async function loadWeeks() {

  const { data: weeks } = await supabase
    .from("study_plan")
    .select("*")
    .eq("course_id", currentCourseId)
    .order("week_number");

  renderWeeks(weeks);

}



/* -----------------------------
RENDER WEEKS
----------------------------- */

function renderWeeks(weeks) {

  weeksContainer.innerHTML = "";

  if (!weeks || weeks.length === 0) {

    weeksContainer.innerHTML =
      `<div class="empty-state">
        <h3>No weeks added yet</h3>
      </div>`;

    return;
  }

  weeks.forEach(week => {

    const card = document.createElement("div");
    card.className = "week-card";

    card.innerHTML = `
      <h3>Week ${week.week_number}</h3>
      <p><b>Date:</b> ${week.date || ""}</p>
      <p><b>Reading:</b> ${week.reading || ""}</p>
      <p><b>Lecture:</b> ${week.lecture || ""}</p>
      <p><b>Task:</b> ${week.task || ""}</p>
      <p><b>Deadline:</b> ${week.deadline || ""}</p>
      <p><b>Hours:</b> ${week.hours || ""}</p>
      <p><b>Priority:</b> ${week.priority || ""}</p>
    `;

    weeksContainer.appendChild(card);

  });

}
