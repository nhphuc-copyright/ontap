const DOCX_PATH = "data/de-on.docx";

const statusBox = document.getElementById("status");
const testList = document.getElementById("test-list");
const quiz = document.getElementById("quiz");
const questionsBox = document.getElementById("questions");

let tests = [];
let currentTest = null;
let answers = {};
let submitted = false;

async function loadDocument() {
  try {
    const response = await fetch(DOCX_PATH);

    if (!response.ok) {
      throw new Error("Không tìm thấy file data/de-on.docx");
    }

    const buffer = await response.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });

    tests = parseDocument(result.value);

    if (tests.length !== 6) {
      throw new Error(`Đọc được ${tests.length}/6 đề. Cần kiểm tra lại cấu trúc file Word.`);
    }

    statusBox.textContent =
      "Đã tải dữ liệu. Chọn một đề để bắt đầu luyện tập.";

    renderTestList();
  } catch (error) {
    statusBox.textContent =
      "Không thể tải đề: " + error.message +
      ". Hãy kiểm tra file Word và kết nối Internet.";
    console.error(error);
  }
}

function parseDocument(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const paragraphs = [...doc.body.querySelectorAll("p, h1, h2, h3")];

  const result = [];
  let test = null;
  let passage = [];
  let question = null;

  function finishQuestion() {
    if (!question) return;
    test.items.push({
      type: "question",
      data: question
    });
    question = null;
  }

  function flushPassage() {
    if (!passage.length || !test) return;

    test.items.push({
      type: "passage",
      data: passage.join("\n\n")
    });

    passage = [];
  }

  function finishTest() {
    finishQuestion();
    flushPassage();

    if (test) result.push(test);
    test = null;
  }

  function splitOptions(text) {
    const regex = /(?:^|\s)([A-D])[\.\)]\s*/g;
    const matches = [...text.matchAll(regex)];

    if (matches.length < 2) return null;

    const options = {};
    const first = matches[0].index;
    const stem = text.slice(0, first).trim();

    matches.forEach((match, index) => {
      const start = match.index + match[0].length;
      const end = index + 1 < matches.length
        ? matches[index + 1].index
        : text.length;

      options[match[1]] = text.slice(start, end).trim();
    });

    return { stem, options };
  }

  for (const element of paragraphs) {
    const text = element.textContent.trim();
    if (!text) continue;

    const testMatch = text.match(/^TEST\s+([1-6])\b/i);

    if (testMatch) {
      finishTest();

      test = {
        id: Number(testMatch[1]),
        title: `TEST ${testMatch[1]}`,
        items: []
      };

      continue;
    }

    if (!test) continue;

    const qMatch = text.match(/^Question\s+(\d+)\s*[:.]\s*(.*)$/i);

    if (qMatch) {
      finishQuestion();
      flushPassage();

      const parsed = splitOptions(qMatch[2]);

      question = {
        number: Number(qMatch[1]),
        stem: parsed ? parsed.stem : qMatch[2],
        options: parsed ? parsed.options : {}
      };

      continue;
    }

    if (question) {
      const parsed = splitOptions(text);

      if (parsed) {
        Object.assign(question.options, parsed.options);

        if (parsed.stem) {
          question.stem += " " + parsed.stem;
        }

        continue;
      }

      const optionStart = text.match(/^([A-D])[\.\)]\s*(.*)$/);

      if (optionStart) {
        question.options[optionStart[1]] = optionStart[2].trim();
        continue;
      }

      if (Object.keys(question.options).length < 4) {
        question.stem += "\n" + text;
        continue;
      }

      finishQuestion();
    }

    passage.push(text);
  }

  finishTest();
  return result;
}

function renderTestList() {
  testList.innerHTML = "";

  tests.forEach(test => {
    const button = document.createElement("button");
    button.className = "test-card";
    button.innerHTML = `
      <strong>${test.title}</strong>
      <span>${test.items.filter(x => x.type === "question").length} câu hỏi</span>
    `;

    button.addEventListener("click", () => openTest(test.id));
    testList.appendChild(button);
  });
}

function openTest(id) {
  currentTest = tests.find(test => test.id === id);
  if (!currentTest) return;

  answers = {};
  submitted = false;

  quiz.hidden = false;
  document.getElementById("test-label").textContent = currentTest.title;
  document.getElementById("test-title").textContent = "Luyện tập";
  document.getElementById("result").hidden = true;

  renderQuestions();

  window.scrollTo({
    top: quiz.offsetTop - 20,
    behavior: "smooth"
  });
}

function renderQuestions() {
  questionsBox.innerHTML = "";

  currentTest.items.forEach(item => {
    if (item.type === "passage") {
      const passage = document.createElement("div");
      passage.className = "passage";
      passage.textContent = item.data;
      questionsBox.appendChild(passage);
      return;
    }

    const q = item.data;
    const card = document.createElement("article");
    card.className = "question";
    card.id = `question-${q.number}`;

    const title = document.createElement("div");
    title.className = "question-title";
    title.innerHTML =
      `<span class="question-number">Câu ${q.number}.</span>`;

    title.append(document.createTextNode(q.stem));
    card.appendChild(title);

    const options = document.createElement("div");
    options.className = "options";

    ["A", "B", "C", "D"].forEach(letter => {
      const label = document.createElement("label");
      label.className = "option";
      label.dataset.choice = letter;

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `q-${q.number}`;
      radio.value = letter;

      const text = document.createElement("span");
      text.textContent =
        `${letter}. ${q.options[letter] || "(Không đọc được lựa chọn)"}`;

      radio.addEventListener("change", () => {
        if (submitted) return;

        answers[q.number] = letter;
        updateQuestionFeedback(card, q.number);
        updateProgress();
      });

      label.append(radio, text);
      options.appendChild(label);
    });

    card.appendChild(options);

    const feedback = document.createElement("div");
    feedback.className = "feedback";
    feedback.hidden = true;
    card.appendChild(feedback);

    questionsBox.appendChild(card);
  });

  updateProgress();
}

function getCorrectAnswer(number) {
  return window.ANSWER_KEYS[currentTest.id]?.[number - 1];
}

function updateQuestionFeedback(card, number) {
  const selected = answers[number];
  const correct = getCorrectAnswer(number);
  const feedback = card.querySelector(".feedback");

  card.querySelectorAll(".option").forEach(option => {
    const choice = option.dataset.choice;

    option.classList.remove("correct", "wrong");

    if (choice === correct) {
      option.classList.add("correct");
    }

    if (selected === choice && selected !== correct) {
      option.classList.add("wrong");
    }
  });

  feedback.hidden = false;

  if (selected === correct) {
    feedback.textContent = "✓ Chính xác!";
    feedback.className = "feedback correct";
  } else {
    feedback.textContent = `✗ Chưa chính xác. Đáp án đúng: ${correct || "Chưa có đáp án"}`;
    feedback.className = "feedback wrong";
  }
}

function updateProgress() {
  const total = currentTest.items.filter(x => x.type === "question").length;
  const answered = Object.keys(answers).length;

  let score = 0;

  Object.entries(answers).forEach(([number, answer]) => {
    if (answer === getCorrectAnswer(Number(number))) score++;
  });

  document.getElementById("progress-text").textContent =
    `${answered}/${total} câu đã trả lời`;

  document.getElementById("score-text").textContent =
    `${score}/${total} câu đúng`;

  document.getElementById("progress-bar").style.width =
    `${total ? answered / total * 100 : 0}%`;
}

document.getElementById("submit-button").addEventListener("click", () => {
  if (!currentTest) return;

  submitted = true;

  const total = currentTest.items.filter(x => x.type === "question").length;
  const answered = Object.keys(answers).length;

  let score = 0;

  Object.entries(answers).forEach(([number, answer]) => {
    if (answer === getCorrectAnswer(Number(number))) score++;
  });

  const result = document.getElementById("result");
  result.hidden = false;

  result.innerHTML = `
    <p class="eyebrow">KẾT QUẢ BÀI LÀM</p>
    <div class="result-score">${score}/${total}</div>
    <p>Đúng ${score} câu · Sai ${answered - score} câu · Chưa làm ${total - answered} câu</p>
  `;

  currentTest.items
    .filter(item => item.type === "question")
    .forEach(item => {
      const card = document.getElementById(`question-${item.data.number}`);
      const correct = getCorrectAnswer(item.data.number);

      card.querySelectorAll(".option").forEach(option => {
        option.querySelector("input").disabled = true;

        if (option.dataset.choice === correct) {
          option.classList.add("correct");
        }
      });
    });

  document.getElementById("submit-button").disabled = true;
  document.getElementById("submit-button").textContent = "Đã nộp bài";
});

document.getElementById("reset-button").addEventListener("click", () => {
  if (currentTest) openTest(currentTest.id);
  document.getElementById("submit-button").disabled = false;
  document.getElementById("submit-button").textContent =
    "Nộp bài và xem kết quả";
});

loadDocument();
