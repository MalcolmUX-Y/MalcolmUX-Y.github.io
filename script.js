const generateBtn = document.getElementById("generateBtn");
const semesterInput = document.getElementById("semesterInput");
const output = document.getElementById("output");

generateBtn.addEventListener("click", () => {
  const text = semesterInput.value.trim();

  if (!text) {
    output.innerHTML = `
      <div class="placeholder">
        <p>Please paste your semester information first.</p>
      </div>
    `;
    return;
  }

  const structuredText = `Week Overview

${text}

Suggested Structure
- Reading
- Lecture
- Assignment
- Deadline
- Next task

Next task
Review the closest deadline and begin the most urgent reading first.`;

  output.innerHTML = `<div class="output-block">${structuredText}</div>`;
});
