import {
  BADGES,
  THEMES,
  APP_THEMES,
  LEVEL_STEP,
  STORAGE_KEY,
  buildApiHeaders,
  computeLevel,
  getBadgeForLevel,
  addHistoryEntry,
  getPromptHistory,
  loadProfileState,
  saveProfileState,
  setActiveProfile,
  loadAppSettings,
  saveAppSettings,
  addMemory,
  removeMemory,
  getMemoriesText,
} from "./shared.js?v=8";

function sanitizeHistoryForLM(history) {
  if (!history || history.length === 0) return [];
  const sanitized = [];
  for (const msg of history) {
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    if (sanitized.length === 0) {
      if (msg.role === "assistant") continue;
      sanitized.push(msg);
    } else {
      const last = sanitized[sanitized.length - 1];
      if (msg.role === last.role) {
        last.content += "\n" + msg.content;
      } else {
        sanitized.push(msg);
      }
    }
  }
  if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === "user") {
    sanitized.pop();
  }
  return sanitized;
}

const chat = document.getElementById("chat");
const composer = document.getElementById("composer");
const userInput = document.getElementById("userInput");
const micButton = document.getElementById("micButton");
const sendButton = composer.querySelector(".send");
const fluffy = document.getElementById("fluffy");
const fluffyPrompt = document.getElementById("fluffyPrompt");
const levelLabel = document.getElementById("levelLabel");
const levelProgressText = document.getElementById("levelProgressText");
const levelFill = document.getElementById("levelFill");
const levelReward = document.getElementById("levelReward");
const rewardBurst = document.getElementById("rewardBurst");
const profileSelect = document.getElementById("profileSelect");
const profileHint = document.getElementById("profileHint");
const stickerGrid = document.getElementById("stickerGrid");
const stickerCount = document.getElementById("stickerCount");
const listenStatus = document.getElementById("listenStatus");
const speakStatus = document.getElementById("speakStatus");
const appThemeButton = document.getElementById("appThemeButton");
const memoriesList = document.getElementById("memoriesList");
const memoryCount = document.getElementById("memoryCount");

const blockedPatterns = [
  /\bsex\b/i,
  /\bporn\b/i,
  /\bnude\b/i,
  /\bdrugs?\b/i,
  /\bheroin\b/i,
  /\bcocaine\b/i,
  /\bmeth\b/i,
  /\bsuicide\b/i,
  /\bself[\s-]?harm\b/i,
  /\bkill(?:s|ed|ing)?\b/i,
  /\bmurder(?:s|ed|ing)?\b/i,
  /\bweapons?\b/i,
  /\bguns?\b/i,
  /\bbombs?\b/i,
];

const REQUEST_TIMEOUT_MS = 60000;
const MAX_MEMORY_LENGTH = 120;
const MAX_ERROR_DETAIL_LENGTH = 300;

const safetyReply =
  "That topic is not for kids. Please ask a parent or trusted grown-up for help. Want to ask me something else?";

let recognition = null;
let speaking = false;
let isListening = false;
let pendingLevelUp = null;
let appSettings = loadAppSettings();
let profileState = loadProfileState();
let activeProfile = profileState.profiles[profileState.activeId];
let longPressTimer = null;
let preferredVoice = null;
let requestInFlight = false;

function refreshSettings() {
  appSettings = loadAppSettings();
}

function setListenStatus(label, stateClass = "") {
  listenStatus.textContent = label;
  listenStatus.classList.remove("active", "disabled");
  if (stateClass) {
    listenStatus.classList.add(stateClass);
  }
}

function setSpeakStatus(label, stateClass = "") {
  speakStatus.textContent = label;
  speakStatus.classList.remove("speaking", "disabled");
  if (stateClass) {
    speakStatus.classList.add(stateClass);
  }
}

function pickKidVoice(voices) {
  if (!voices || voices.length === 0) return null;
  const preferredName = appSettings.voiceName;
  if (preferredName) {
    const exact = voices.find((voice) => voice.name === preferredName);
    if (exact) return exact;
  }
  const preferredNames = [
    "Samantha",
    "Victoria",
    "Karen",
    "Moira",
    "Tessa",
    "Serena",
    "Ava",
    "Allison",
    "Google US English",
    "Google UK English Female",
    "Microsoft Zira",
  ];
  const englishVoices = voices.filter((voice) => voice.lang && voice.lang.startsWith("en"));
  const preferred = englishVoices.find((voice) =>
    preferredNames.some((name) => voice.name.includes(name))
  );
  if (preferred) return preferred;
  const femaleHint = englishVoices.find((voice) =>
    /female|woman|girl|zira|samantha|victoria|ava|allison/i.test(voice.name)
  );
  return femaleHint || englishVoices[0] || voices[0];
}

function loadVoices() {
  if (!window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  preferredVoice = pickKidVoice(voices);
}

function addMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
}

function pushMessage(role, text, store = true) {
  addMessage(role, text);
  if (store && activeProfile) {
    addHistoryEntry(activeProfile, role, text);
    saveProfileState(profileState);
  }
}

function setFluffyState(state) {
  fluffy.classList.remove("is-thinking", "is-listening", "is-speaking", "is-happy");
  if (state) {
    fluffy.classList.add(state);
  }
}

function setPrompt(text) {
  fluffyPrompt.textContent = text;
}

function populateProfileSelect() {
  profileSelect.innerHTML = "";
  Object.values(profileState.profiles).forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    profileSelect.appendChild(option);
  });
  profileSelect.value = profileState.activeId;
}

function resetChatView() {
  chat.innerHTML = "";
}

function renderChatHistory() {
  resetChatView();
  const history = activeProfile?.history || [];
  if (history.length === 0) {
    addMessage("assistant", getGreeting());
    return;
  }
  history.forEach((entry) => {
    if (!entry || !entry.role || !entry.content) return;
    addMessage(entry.role, entry.content);
  });
}

function getGreeting() {
  const name = activeProfile ? activeProfile.name : "friend";
  return `Hi ${name}! I’m Fluffy. Ask me a question about animals, space, science, or anything you’re curious about!`;
}

function setActiveProfileById(profileId, resetChat = true) {
  const updated = setActiveProfile(profileState, profileId);
  if (updated) {
    activeProfile = updated;
  }
  populateProfileSelect();
  syncProfileUI();
  if (resetChat) {
    renderChatHistory();
  }
}

function getReadingLevelGuidance() {
  const level = activeProfile?.readingLevel || "growing";
  switch (level) {
    case "early":
      return "Use very simple words, one short sentence, and friendly examples.";
    case "confident":
      return "Use 2-3 short sentences and include a tiny fun fact.";
    default:
      return "Use 1-2 short sentences with clear, simple words.";
  }
}

function buildSystemPrompt() {
  refreshSettings();
  if (!appSettings.kidMode) {
    return "You are a friendly assistant who answers questions clearly in a concise way.";
  }
  const base = appSettings.systemPrompt?.trim() || "";
  const readingGuide = getReadingLevelGuidance();
  const memories = getMemoriesText(activeProfile);
  const childName = activeProfile?.name || "this child";

  let prompt = base || `You are a cheerful, kid-safe assistant for children ages 3 to 10.`;
  prompt += `\n\nReading level guidance: ${readingGuide}`;
  prompt += `\n\nThe child's name is "${childName}". Use their name occasionally to make it personal.`;

  if (memories) {
    prompt += `\n\nThings you remember about ${childName}: ${memories}`;
    prompt += `\nUse these memories naturally in conversation when relevant. Reference their interests and favorites.`;
  }

  prompt += `\n\nIMPORTANT: If the child shares personal info (favorite color, pet's name, hobby, age, favorite animal, favorite food, etc.), end your response with a line starting with "[REMEMBER]:" followed by what to remember. Example: "[REMEMBER]: Favorite color is blue". Only add this for NEW facts, not things already remembered.`;

  return prompt;
}

function getCustomBlockedTopics() {
  return (activeProfile?.blockedTopics || "")
    .split(/,|\n/)
    .map((topic) => topic.trim())
    .filter(Boolean);
}

function isBlocked(text) {
  if (blockedPatterns.some((pattern) => pattern.test(text))) {
    return true;
  }
  const lower = text.toLowerCase();
  return getCustomBlockedTopics().some((topic) => lower.includes(topic.toLowerCase()));
}

function getThemeGradients() {
  const themeId = appSettings.uiTheme || "candy";
  return THEMES[themeId]?.gradients || THEMES.candy.gradients;
}

function cycleAppTheme() {
  const themeKeys = Object.keys(APP_THEMES);
  const currentIndex = themeKeys.indexOf(appSettings.uiTheme || "candy");
  const nextIndex = (currentIndex + 1) % themeKeys.length;
  appSettings.uiTheme = themeKeys[nextIndex];
  saveAppSettings(appSettings);
  applyAppTheme();
  updateAppThemeButton();
  renderStickers();
}

function applyAppTheme() {
  const themeId = appSettings.uiTheme || "candy";
  document.body.className = document.body.className.replace(/theme-\w+/g, "").trim();
  if (themeId !== "candy") {
    document.body.classList.add(`theme-${themeId}`);
  }
}

function updateAppThemeButton() {
  if (!appThemeButton) return;
  const themeId = appSettings.uiTheme || "candy";
  const themeName = APP_THEMES[themeId]?.label || "Candy Pop";
  appThemeButton.textContent = `🎨 ${themeName}`;
}

function updateLevelUI() {
  if (!activeProfile) return;
  levelLabel.textContent = `Level ${activeProfile.level}`;
  const progressIntoLevel = Math.max(
    activeProfile.questionCount - (activeProfile.level - 1) * LEVEL_STEP,
    0
  );
  const progress = Math.min(progressIntoLevel, LEVEL_STEP);
  levelProgressText.textContent = `${progress}/${LEVEL_STEP} questions`;
  levelFill.style.width = `${Math.min((progress / LEVEL_STEP) * 100, 100)}%`;
  const remaining = Math.max(LEVEL_STEP - progress, 0);
  const nextLevel = activeProfile.level + 1;
  const nextBadge = getBadgeForLevel(nextLevel);
  if (nextBadge) {
    levelReward.textContent = `Ask ${remaining} more question${remaining === 1 ? "" : "s"} to reach Level ${nextLevel} and unlock ${nextBadge.title}.`;
  } else {
    levelReward.textContent = `Ask ${remaining} more question${remaining === 1 ? "" : "s"} to reach Level ${nextLevel}.`;
  }
}

function renderStickers() {
  if (!activeProfile) return;
  stickerGrid.innerHTML = "";
  const earned = new Set(activeProfile.badges || []);
  const gradients = getThemeGradients();

  BADGES.forEach((badge, index) => {
    const card = document.createElement("div");
    card.className = `sticker-card ${earned.has(badge.id) ? "earned" : "locked"}`;

    const icon = document.createElement("div");
    icon.className = "sticker-icon";
    const customArt = activeProfile.stickerArt?.[badge.id];
    const artUrl = customArt || badge.image;
    const gradient = gradients[index % gradients.length];
    if (artUrl) {
      // Gradient sits behind the art so a missing image never leaves an empty tile.
      icon.style.backgroundImage = `url("${artUrl}"), ${gradient}`;
      icon.style.backgroundSize = "contain, cover";
      icon.style.backgroundPosition = "center";
      icon.style.backgroundRepeat = "no-repeat";
    } else {
      icon.style.backgroundImage = gradient;
    }

    const title = document.createElement("div");
    title.className = "sticker-title";
    title.textContent = badge.title;

    const blurb = document.createElement("div");
    blurb.className = "sticker-blurb";
    blurb.textContent = earned.has(badge.id)
      ? badge.blurb
      : "Ask more questions to unlock this sticker.";

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(blurb);
    stickerGrid.appendChild(card);
  });

  stickerCount.textContent = `${earned.size}/${BADGES.length} stickers collected`;
}

function renderMemories() {
  if (!activeProfile || !memoriesList) return;
  const memories = activeProfile.memories || [];

  if (memories.length === 0) {
    memoriesList.innerHTML = `<p class="no-memories">Fluffy doesn't know much about you yet. Chat more and share your favorite things!</p>`;
    memoryCount.textContent = "0 things remembered";
    return;
  }

  memoriesList.innerHTML = "";
  memories.forEach((memory, index) => {
    const chip = document.createElement("div");
    chip.className = "memory-chip";

    const text = document.createElement("span");
    text.textContent = memory;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-memory";
    removeBtn.textContent = "×";
    removeBtn.title = "Forget this";
    removeBtn.onclick = () => {
      removeMemory(activeProfile, index);
      saveProfileState(profileState);
      renderMemories();
    };

    chip.appendChild(text);
    chip.appendChild(removeBtn);
    memoriesList.appendChild(chip);
  });

  memoryCount.textContent = `${memories.length} thing${memories.length === 1 ? "" : "s"} remembered`;
}

function updateProfileHint() {
  if (!activeProfile) return;
  profileHint.textContent = `Level ${activeProfile.level} · ${activeProfile.badges.length}/${BADGES.length} stickers`;
}

function syncProfileUI() {
  updateLevelUI();
  renderStickers();
  renderMemories();
  updateProfileHint();
  applyAppTheme();
  updateAppThemeButton();
}

function unlockBadgeForLevel(levelValue) {
  if (!activeProfile) return null;
  const badge = getBadgeForLevel(levelValue);
  if (!badge) return null;
  if (!activeProfile.badges.includes(badge.id)) {
    activeProfile.badges.push(badge.id);
    return badge;
  }
  return null;
}

function registerQuestion() {
  if (!activeProfile) return;
  activeProfile.questionCount += 1;
  activeProfile.lastAskedAt = Date.now();
  const newLevel = computeLevel(activeProfile.questionCount);
  if (newLevel > activeProfile.level) {
    activeProfile.level = newLevel;
    const newBadge = unlockBadgeForLevel(newLevel);
    pendingLevelUp = { level: newLevel, badge: newBadge };
  }
  saveProfileState(profileState);
  updateLevelUI();
  renderStickers();
  updateProfileHint();
}

function showLevelUp(levelInfo) {
  if (!levelInfo) return;
  const { level, badge } = levelInfo;
  rewardBurst.textContent = badge
    ? `Level ${level} unlocked - ${badge.title} sticker!`
    : `Level ${level} unlocked!`;
  rewardBurst.classList.add("show");
  fluffy.classList.add("level-up");
  setPrompt("Level up! Ask another question to keep going.");
  const badgeText = badge ? ` You unlocked the ${badge.title} sticker.` : "";
  addMessage("assistant", `Awesome! You reached Level ${level}!${badgeText} Want to ask another question?`);
  setTimeout(() => rewardBurst.classList.remove("show"), 1800);
  setTimeout(() => fluffy.classList.remove("level-up"), 900);
}

function speak(text) {
  refreshSettings();
  if (!appSettings.speak || !window.speechSynthesis) {
    setSpeakStatus(appSettings.speak ? "Voice unavailable" : "Voice off", "disabled");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  utterance.pitch = 1.1;
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }
  utterance.onstart = () => {
    speaking = true;
    setFluffyState("is-speaking");
    setSpeakStatus("Speaking", "speaking");
  };
  const finishSpeaking = () => {
    speaking = false;
    setFluffyState("is-happy");
    setSpeakStatus("Voice ready");
    setTimeout(() => setFluffyState(""), 900);
  };
  utterance.onend = finishSpeaking;
  utterance.onerror = finishSpeaking;
  window.speechSynthesis.speak(utterance);
}

async function askAssistant(question) {
  refreshSettings();
  if (appSettings.kidMode && isBlocked(question)) {
    pushMessage("assistant", safetyReply, true);
    speak(safetyReply);
    setPrompt("Try a science or animal question next!");
    if (pendingLevelUp) {
      showLevelUp(pendingLevelUp);
      pendingLevelUp = null;
    }
    return;
  }

  if (!appSettings.model) {
    const errorMessage = "I can't answer yet because the model name is missing. Open Settings to fix it.";
    pushMessage("assistant", errorMessage, true);
    setPrompt("Open Settings to update the connection.");
    setFluffyState("");
    return;
  }

  const rawHistory = getPromptHistory(activeProfile);
  const history = sanitizeHistoryForLM(rawHistory);
  const messages = [{ role: "system", content: buildSystemPrompt() }, ...history];
  messages.push({ role: "user", content: question });

  setFluffyState("is-thinking");
  setPrompt("Thinking...");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(appSettings.apiUrl, {
      method: "POST",
      headers: buildApiHeaders(appSettings.apiKey),
      body: JSON.stringify({
        model: appSettings.model,
        messages,
        temperature: Number(appSettings.temperature),
        max_tokens: Number(appSettings.maxTokens),
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, MAX_ERROR_DETAIL_LENGTH);
      let hint = "Please check the URL and model name in Settings.";
      if (response.status === 400) {
        hint = "Bad request. Check that the model name in Settings is correct.";
      } else if (response.status === 404) {
        hint = "Model or endpoint not found. Check the model name in Settings.";
      } else if (response.status === 401 || response.status === 403) {
        hint = "Access denied. Check the Ollama API key in Settings.";
      }
      const errorMessage =
        `Ollama error ${response.status}. ${hint}` +
        (body ? `\n\nDetails:\n${body}` : "");
      // Errors are shown but not stored, so they never leak into later prompts.
      pushMessage("assistant", errorMessage, false);
      setPrompt("Let’s fix the connection and try again.");
      setFluffyState("");
      if (pendingLevelUp) {
        showLevelUp(pendingLevelUp);
        pendingLevelUp = null;
      }
      return;
    }

    const data = await response.json();
    let answer =
      data.choices?.[0]?.message?.content?.trim() ||
      "Hmm, I need a moment to think. Try asking in a different way!";

    // Extract and save memories
    const memoryMatch = answer.match(/\[REMEMBER\]:\s*(.+?)(?:\n|$)/i);
    if (memoryMatch && activeProfile) {
      const newMemory = memoryMatch[1].trim().slice(0, MAX_MEMORY_LENGTH);
      if (newMemory) {
        addMemory(activeProfile, newMemory);
        saveProfileState(profileState);
        renderMemories();
      }
      answer = answer.replace(/\[REMEMBER\]:\s*.+?(?:\n|$)/gi, "").trim();
    }

    pushMessage("assistant", answer, true);
    setFluffyState("is-happy");
    setPrompt("Want to ask another question?");
    speak(answer);
    if (pendingLevelUp) {
      showLevelUp(pendingLevelUp);
      pendingLevelUp = null;
    }
  } catch (error) {
    const isAbort = error && error.name === "AbortError";
    const errorMessage = isAbort
      ? "The request to Ollama timed out. Please try again."
      : `I couldn't reach Ollama. Check that the app server is running and your internet works.

Details: ${error}`;
    pushMessage("assistant", errorMessage, false);
    setPrompt("Let’s try again in a bit.");
    setFluffyState("");
    if (pendingLevelUp) {
      showLevelUp(pendingLevelUp);
      pendingLevelUp = null;
    }
  } finally {
    clearTimeout(timeout);
  }
}

function setBusy(busy) {
  requestInFlight = busy;
  sendButton.disabled = busy;
  // Switching profiles mid-request would file the reply under the wrong child.
  profileSelect.disabled = busy;
  composer.setAttribute("aria-busy", String(busy));
}

async function submitQuestion(question) {
  if (requestInFlight) return;
  setBusy(true);
  try {
    pushMessage("user", question, true);
    registerQuestion();
    await askAssistant(question);
  } finally {
    setBusy(false);
  }
}

function handleSubmit(event) {
  event.preventDefault();
  const question = userInput.value.trim();
  if (!question || requestInFlight) return;
  userInput.value = "";
  submitQuestion(question);
}

function setupSpeechRecognition() {
  refreshSettings();
  if (!appSettings.voiceInput) {
    if (recognition) {
      recognition.abort();
      isListening = false;
    }
    micButton.disabled = true;
    micButton.title = "Voice input is turned off in settings";
    setListenStatus("Mic off", "disabled");
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micButton.disabled = true;
    micButton.title = "Voice input not supported in this browser";
    setListenStatus("Mic unavailable", "disabled");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    isListening = true;
    micButton.classList.add("active");
    setFluffyState("is-listening");
    setPrompt("I'm listening!");
    setListenStatus("Listening", "active");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    if (!transcript) return;
    submitQuestion(transcript);
  };

  recognition.onerror = () => {
    isListening = false;
    micButton.classList.remove("active");
    setFluffyState("");
    setPrompt("I didn't catch that. Try again.");
  };

  recognition.onend = () => {
    isListening = false;
    micButton.classList.remove("active");
    if (!speaking) {
      setFluffyState("");
    }
    setListenStatus("Mic ready");
  };
}

composer.addEventListener("submit", handleSubmit);
micButton.addEventListener("click", () => {
  if (!recognition) return;
  if (isListening || requestInFlight) return;
  try {
    recognition.start();
  } catch {
    setPrompt("Microphone is already listening.");
  }
});

profileSelect.addEventListener("change", (event) => {
  setActiveProfileById(event.target.value);
});

appThemeButton.addEventListener("click", cycleAppTheme);

function applySettingsToUI() {
  refreshSettings();
  loadVoices();
  if (appSettings.voiceInput) {
    micButton.disabled = false;
    micButton.title = "Ask by voice";
    if (!recognition) {
      setupSpeechRecognition();
    } else {
      setListenStatus("Mic ready");
    }
  } else {
    if (recognition) {
      recognition.abort();
      isListening = false;
    }
    micButton.disabled = true;
    setListenStatus("Mic off", "disabled");
  }

  if (appSettings.speak) {
    setSpeakStatus(
      window.speechSynthesis ? "Voice ready" : "Voice unavailable",
      window.speechSynthesis ? "" : "disabled"
    );
  } else {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeakStatus("Voice off", "disabled");
  }
}

function startLongPress() {
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    window.location.href = "settings.html";
  }, 1200);
}

function cancelLongPress() {
  clearTimeout(longPressTimer);
}

fluffy.addEventListener("mousedown", startLongPress);
fluffy.addEventListener("mouseup", cancelLongPress);
fluffy.addEventListener("mouseleave", cancelLongPress);
fluffy.addEventListener("touchstart", startLongPress, { passive: true });
fluffy.addEventListener("touchend", cancelLongPress);
fluffy.addEventListener("touchcancel", cancelLongPress);

setupSpeechRecognition();
loadVoices();
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    loadVoices();
  };
}
populateProfileSelect();
setActiveProfileById(profileState.activeId, false);
renderChatHistory();
applySettingsToUI();
window.addEventListener("focus", applySettingsToUI);

// Pick up changes made in another tab (e.g. Settings edits) instead of overwriting them.
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  profileState = loadProfileState();
  activeProfile = profileState.profiles[profileState.activeId];
  populateProfileSelect();
  syncProfileUI();
  if (!requestInFlight) renderChatHistory();
});
