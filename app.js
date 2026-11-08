const DATA_PATH = "data/tests.json";
const QUESTION_COUNT = 40;

const statusBox = document.getElementById("status");
const testList = document.getElementById("test-list");
const quiz = document.getElementById("quiz");
const questionsBox = document.getElementById("questions");
const submitButton = document.getElementById("submit-button");
const resetButton = document.getElementById("reset-button");
const resultBox = document.getElementById("result");

let tests = [];
let currentTest = null;
let answers = Object.create(null);
let submitted = false;

async function loadTests() {
  try {
    const response = await fetch(DATA_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Không tải được ${DATA_PATH} (HTTP ${response.status}).`);
    }

    const payload = await response.json();
    tests = Array.isArray(payload) ? payload : payload.tests;

    const errors = validateTests(tests);
    if (errors.length) {
      throw new Error(errors.join(" "));
    }

    statusBox.textContent = "Đã tải đủ 6 đề. Chọn một đề để bắt đầu.";
    statusBox.classList.add("status-success");
    renderTestList();
  } catch (error) {
    statusBox.textContent = `Không thể tải đề: ${error.message}`;
    statusBox.classList.add("status-error");
    console.error(error);
  }
}

function validateTests(list) {
  const errors = [];

  if (!Array.isArray(list) || list.length !== 6) {
    return ["Dữ liệu phải có đủ 6 đề."];
  }

  for (const test of list) {
    const questions = test.items?.filter(item => item.type === "question") ?? [];

    if (questions.length !== QUESTION_COUNT) {
      errors.push(`${test.title}: có ${questions.length}/40 câu.`);
      continue;
    }

    const numbers = questions.map(item => Number(item.data.number));
    if (numbers.some((number, index) => number !== index + 1)) {
      errors.push(`${test.title}: số thứ tự câu hỏi không liên tục.`);
    }

    for (const item of questions) {
      const question = item.data;
      const options = question.options || {};
      const hasAllOptions = ["A", "B", "C", "D"].every(letter =>
        typeof options[letter] === "string" && options[letter].trim().length > 0
      );

      if (!hasAllOptions) {
        errors.push(`${test.title} – câu ${question.number}: thiếu lựa chọn.`);
      }

      const key = getAnswerKey(test.id, question.number);
      if (!["A", "B", "C", "D"].includes(key)) {
        errors.push(`${test.title} – câu ${question.number}: thiếu đáp án đúng.`);
      }
    }
  }

  return errors;
}

function getAnswerKey(testId, questionNumber) {
  return window.ANSWER_KEYS?.[testId]?.[questionNumber - 1] || "";
}

function renderTestList() {
  testList.replaceChildren();

  tests.forEach(test => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "test-card";
    button.dataset.testId = String(test.id);

    const title = document.createElement("strong");
    title.textContent = test.title;

    const subtitle = document.createElement("span");
    subtitle.textContent = "40 câu hỏi";

    button.append(title, subtitle);
    button.addEventListener("click", () => openTest(test.id));
    testList.appendChild(button);
  });
}

function openTest(testId) {
  currentTest = tests.find(test => test.id === testId);
  if (!currentTest) return;

  answers = Object.create(null);
  submitted = false;

  document.querySelectorAll(".test-card").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.testId) === testId);
  });

  quiz.hidden = false;
  document.getElementById("test-label").textContent = currentTest.title;
  document.getElementById("test-title").textContent = "Luyện tập";
  resultBox.hidden = true;
  resultBox.replaceChildren();

  submitButton.disabled = false;
  submitButton.textContent = "Nộp bài và xem kết quả";

  renderQuestions();

  window.scrollTo({
    top: quiz.getBoundingClientRect().top + window.scrollY - 20,
    behavior: "smooth"
  });
}

function renderQuestions() {
  questionsBox.replaceChildren();

  for (const item of currentTest.items) {
    if (item.type === "passage") {
      const passage = document.createElement("section");
      passage.className = "passage";
      passage.setAttribute("aria-label", "Đoạn đọc hoặc nội dung câu hỏi");
      passage.textContent = item.data;
      questionsBox.appendChild(passage);
      continue;
    }

    const question = item.data;
    const card = document.createElement("article");
    card.className = "question";
    card.id = `question-${question.number}`;

    const heading = document.createElement("div");
    heading.className = "question-title";

    const number = document.createElement("span");
    number.className = "question-number";
    number.textContent = `Câu ${question.number}.`;
    heading.appendChild(number);

    const stem = document.createElement("div");
    stem.className = "question-stem";
    stem.textContent = question.stem;
    heading.appendChild(stem);
    card.appendChild(heading);

    const options = document.createElement("div");
    options.className = "options";
    options.setAttribute("role", "group");
    options.setAttribute("aria-label", `Các lựa chọn câu ${question.number}`);

    for (const letter of ["A", "B", "C", "D"]) {
      const label = document.createElement("label");
      label.className = "option";
      label.dataset.choice = letter;

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `test-${currentTest.id}-q-${question.number}`;
      radio.value = letter;
      radio.checked = answers[question.number] === letter;
      radio.disabled = submitted;
      radio.setAttribute("aria-label", `Đáp án ${letter}`);

      const text = document.createElement("span");
      text.className = "option-text";
      text.textContent = `${letter}. ${question.options[letter]}`;

      radio.addEventListener("change", () => {
        if (submitted || !radio.checked) return;
        answers[question.number] = letter;
        updateQuestionFeedback(card, question);
        updateProgress();
      });

      label.append(radio, text);
      options.appendChild(label);
    }

    card.appendChild(options);

    const feedback = document.createElement("div");
    feedback.className = "feedback";
    feedback.hidden = true;
    feedback.setAttribute("aria-live", "polite");
    card.appendChild(feedback);

    questionsBox.appendChild(card);
  }

  updateProgress();
}

function updateQuestionFeedback(card, question) {
  const selected = answers[question.number];
  const correct = getAnswerKey(currentTest.id, question.number);
  const feedback = card.querySelector(".feedback");

  card.querySelectorAll(".option").forEach(option => {
    const choice = option.dataset.choice;
    option.classList.remove("correct", "wrong", "selected");

    if ((selected || submitted) && choice === correct) {
      option.classList.add("correct");
    }

    if (selected === choice) {
      option.classList.add("selected");
      if (selected !== correct) option.classList.add("wrong");
    }
  });

  if (!selected && !submitted) {
    feedback.hidden = true;
    feedback.textContent = "";
    return;
  }

  feedback.hidden = false;
  feedback.replaceChildren();

  const answerText = question.options[correct] || "Không có nội dung đáp án.";
  const answerLine = document.createElement("span");

  if (selected === correct) {
    feedback.className = "feedback correct";
    answerLine.textContent = `✓ Chính xác! Đáp án: ${correct}. ${answerText}`;
  } else if (selected) {
    feedback.className = "feedback wrong";
    answerLine.textContent = `✗ Chưa chính xác. Đáp án đúng: ${correct}. ${answerText}`;
  } else {
    feedback.className = "feedback unanswered";
    answerLine.textContent = `Chưa trả lời. Đáp án đúng: ${correct}. ${answerText}`;
  }

  feedback.appendChild(answerLine);
}

function updateProgress() {
  if (!currentTest) return;

  const answered = Object.keys(answers).length;
  const total = currentTest.items.filter(item => item.type === "question").length;
  const score = Object.entries(answers).filter(([number, answer]) =>
    answer === getAnswerKey(currentTest.id, Number(number))
  ).length;

  document.getElementById("progress-text").textContent =
    `${answered}/${total} câu đã trả lời`;
  document.getElementById("score-text").textContent =
    `${score}/${total} câu đúng`;
  document.getElementById("progress-bar").style.width =
    `${total ? (answered / total) * 100 : 0}%`;
}

function submitTest() {
  if (!currentTest || submitted) return;

  submitted = true;
  const questionItems = currentTest.items.filter(item => item.type === "question");

  for (const item of questionItems) {
    const card = document.getElementById(`question-${item.data.number}`);
    card.querySelectorAll("input[type=radio]").forEach(radio => {
      radio.disabled = true;
    });
    updateQuestionFeedback(card, item.data);
  }

  const total = questionItems.length;
  const answered = Object.keys(answers).length;
  const score = Object.entries(answers).filter(([number, answer]) =>
    answer === getAnswerKey(currentTest.id, Number(number))
  ).length;
  const wrong = answered - score;
  const unanswered = total - answered;
  const percent = Math.round((score / total) * 100);

  resultBox.hidden = false;
  resultBox.replaceChildren();

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "KẾT QUẢ BÀI LÀM";

  const scoreText = document.createElement("div");
  scoreText.className = "result-score";
  scoreText.textContent = `${score}/${total}`;

  const details = document.createElement("p");
  details.textContent =
    `Đúng ${score} câu · Sai ${wrong} câu · Chưa làm ${unanswered} câu · ${percent}%`;

  resultBox.append(eyebrow, scoreText, details);
  submitButton.disabled = true;
  submitButton.textContent = "Đã nộp bài";
  updateProgress();

  resultBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetTest() {
  if (currentTest) openTest(currentTest.id);
}

submitButton.addEventListener("click", submitTest);
resetButton.addEventListener("click", resetTest);

loadTests();
