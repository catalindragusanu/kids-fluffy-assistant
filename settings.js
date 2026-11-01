import {
  BADGES,
  DEFAULT_SETTINGS,
  THEMES,
  createProfile,
  loadProfileState,
  saveProfileState,
  setActiveProfile,
  loadAppSettings,
  saveAppSettings,
  STORAGE_KEY,
  OLLAMA_CLOUD_URL,
  buildApiHeaders,
  hasParentPin,
  setParentPin,
  verifyParentPin,
} from "./shared.js?v=8";

const apiKeyInput = document.getElementById("apiKey");
const modelNameInput =document.getElementById("modelName");
const temperatureInput = document.getElementById("temperature");
const temperatureValue = document.getElementById("temperatureValue");
const maxTokensInput = document.getElementById("maxTokens");
const systemPromptInput = document.getElementById("systemPrompt");
const kidModeDefault = document.getElementById("kidModeDefault");
const speakDefault = document.getElementById("speakDefault");
const voiceInputDefault = document.getElementById("voiceInputDefault");
const voiceSelect = document.getElementById("voiceSelect");
const testConnectionButton = document.getElementById("testConnection");
const connTestStatus = document.getElementById("connTestStatus");
const connTestOutput = document.getElementById("connTestOutput");

const systemCard = document.getElementById("systemCard");
const parentControlsMessage = document.getElementById("parentControlsMessage");
const parentLock = document.getElementById("parentLock");
const parentLockMessage = document.getElementById("parentLockMessage");
const parentLockForm = document.getElementById("parentLockForm");
const parentSetupForm = document.getElementById("parentSetupForm");
const parentPinInput = document.getElementById("parentPinInput");
const unlockParentButton = document.getElementById("unlockParent");
const parentPinCreate = document.getElementById("parentPinCreate");
const parentPinConfirm = document.getElementById("parentPinConfirm");
const setParentPinButton = document.getElementById("setParentPin");
const parentControls = document.getElementById("parentControls");
const parentPinChange = document.getElementById("parentPinChange");
const parentPinChangeConfirm = document.getElementById("parentPinChangeConfirm");
const changeParentPinButton = document.getElementById("changeParentPin");
const lockParentButton = document.getElementById("lockParent");

const profileSelect = document.getElementById("profileSelect");
const readingLevelSelect = document.getElementById("readingLevel");
const blockedTopicsInput = document.getElementById("blockedTopics");
const resetProgressButton = document.getElementById("resetProgress");
const clearHistoryButton = document.getElementById("clearHistory");
const profileNameInput = document.getElementById("profileNameInput");
const addProfileButton = document.getElementById("addProfile");
const renameProfileButton = document.getElementById("renameProfile");
const deleteProfileButton = document.getElementById("deleteProfile");
const stickerThemeSelect = document.getElementById("stickerTheme");
const stickerUploadGrid = document.getElementById("stickerUploadGrid");
const clearStickerArtButton = document.getElementById("clearStickerArt");
const parentReport = document.getElementById("parentReport");
const downloadReportCsv = document.getElementById("downloadReportCsv");
const printReportPdf = document.getElementById("printReportPdf");

const MAX_STICKER_BYTES = 300 * 1024;
const PIN_PATTERN = /^\d{4,8}$/;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30000;
let failedAttempts = 0;
let lockedUntil = 0;

let appSettings = loadAppSettings();
let profileState = loadProfileState();
let activeProfile = profileState.profiles[profileState.activeId];
let parentUnlocked = false;

function updateTemperature() {
  temperatureValue.textContent = temperatureInput.value;
}

function populateVoiceList() {
  if (!window.speechSynthesis) {
    voiceSelect.innerHTML = "<option value=\"\">Voice not supported</option>";
    voiceSelect.disabled = true;
    return;
  }
  const voices = window.speechSynthesis.getVoices();
  voiceSelect.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Auto (best available)";
  voiceSelect.appendChild(defaultOption);
  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });
  voiceSelect.value = appSettings.voiceName || "";
}

function setTestStatus(label, state) {
  connTestStatus.textContent = label;
  connTestStatus.classList.remove("active", "disabled", "speaking");
  if (state) {
    connTestStatus.classList.add(state);
  }
}

async function testConnection() {
  const url = OLLAMA_CLOUD_URL;
  const model = modelNameInput.value.trim();

  if (!model) {
    setTestStatus("Missing model", "disabled");
    connTestOutput.textContent = "Please enter a model name.";
    return;
  }

  testConnectionButton.disabled = true;
  setTestStatus("Testing...", "active");
  connTestOutput.textContent = "Sending request...";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: buildApiHeaders(apiKeyInput.value),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Say hello in one short sentence." }],
        temperature: 0.2,
        max_tokens: 32,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      setTestStatus(`Error ${response.status}`, "disabled");
      connTestOutput.textContent =
        "Ollama returned an error.\n\n" +
        `Status: ${response.status}\n` +
        `URL: ${url}\n` +
        `Model: ${model}\n\n` +
        text;
      return;
    }

    setTestStatus("Success", "speaking");
    connTestOutput.textContent =
      "Ollama connection OK.\n\n" +
      `URL: ${url}\n` +
      `Model: ${model}\n\n` +
      text;
  } catch (error) {
    const reason =
      error.name === "AbortError"
        ? "Request timed out."
        : "Network error. Is the app server running?";
    setTestStatus("Failed", "disabled");
    connTestOutput.textContent =
      `${reason}\n\n` +
      `URL: ${url}\n` +
      `Model: ${model}\n\n` +
      `${error}`;
  } finally {
    clearTimeout(timeout);
    testConnectionButton.disabled = false;
  }
}

function saveSystemSettings() {
  const temperature = Number(temperatureInput.value);
  const maxTokens = Math.round(Number(maxTokensInput.value));
  appSettings = {
    ...appSettings,
    apiUrl: OLLAMA_CLOUD_URL,
    apiKey: apiKeyInput.value.trim(),
    model: modelNameInput.value.trim(),
    temperature: Number.isFinite(temperature) ? Math.min(Math.max(temperature, 0), 1) : DEFAULT_SETTINGS.temperature,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(Math.max(maxTokens, 64), 512) : DEFAULT_SETTINGS.maxTokens,
    systemPrompt: systemPromptInput.value.trim(),
    kidMode: kidModeDefault.checked,
    speak: speakDefault.checked,
    voiceInput: voiceInputDefault.checked,
    voiceName: voiceSelect.value || "",
  };
  saveAppSettings(appSettings);
}

function loadSystemSettings() {
  apiKeyInput.value = appSettings.apiKey || "";
  modelNameInput.value = appSettings.model;
  temperatureInput.value = appSettings.temperature;
  maxTokensInput.value = appSettings.maxTokens;
  systemPromptInput.value = appSettings.systemPrompt || "";
  kidModeDefault.checked = Boolean(appSettings.kidMode);
  speakDefault.checked = Boolean(appSettings.speak);
  voiceInputDefault.checked = Boolean(appSettings.voiceInput);
  voiceSelect.value = appSettings.voiceName || "";
  updateTemperature();
}

function setParentMessage(text) {
  parentLockMessage.textContent = text;
}

function updateParentLockUI() {
  const hasPin = hasParentPin();
  parentSetupForm.classList.toggle("is-hidden", hasPin);
  parentLockForm.classList.toggle("is-hidden", !hasPin);
  parentControls.classList.toggle("active", parentUnlocked);
  parentLock.classList.toggle("is-hidden", parentUnlocked);
  // Safety-critical system settings stay hidden until a parent unlocks.
  systemCard.classList.toggle("is-hidden", !parentUnlocked);
  if (!hasPin) {
    setParentMessage("Create a PIN to lock these settings on this device.");
  } else {
    setParentMessage("Parent settings are locked.");
  }
}

async function handleUnlock() {
  if (!hasParentPin()) {
    setParentMessage("Create a PIN first.");
    return;
  }
  const waitMs = lockedUntil - Date.now();
  if (waitMs > 0) {
    setParentMessage(`Too many tries. Wait ${Math.ceil(waitMs / 1000)}s and try again.`);
    return;
  }
  if (await verifyParentPin(parentPinInput.value.trim())) {
    failedAttempts = 0;
    parentUnlocked = true;
    parentPinInput.value = "";
    updateParentLockUI();
  } else {
    failedAttempts += 1;
    if (failedAttempts >= MAX_PIN_ATTEMPTS) {
      failedAttempts = 0;
      lockedUntil = Date.now() + PIN_LOCKOUT_MS;
      setParentMessage("Too many tries. Wait 30s and try again.");
    } else {
      setParentMessage("Incorrect PIN. Try again.");
    }
  }
}

async function handleSetPin() {
  const newPin = parentPinCreate.value.trim();
  const confirmPin = parentPinConfirm.value.trim();
  if (!PIN_PATTERN.test(newPin)) {
    setParentMessage("PIN must be 4 to 8 digits.");
    return;
  }
  if (newPin !== confirmPin) {
    setParentMessage("PINs do not match.");
    return;
  }
  await setParentPin(newPin);
  parentPinCreate.value = "";
  parentPinConfirm.value = "";
  parentUnlocked = true;
  updateParentLockUI();
}

async function handleChangePin() {
  if (!parentUnlocked) return;
  const newPin = parentPinChange.value.trim();
  const confirmPin = parentPinChangeConfirm.value.trim();
  if (!PIN_PATTERN.test(newPin)) {
    parentControlsMessage.textContent = "PIN must be 4 to 8 digits.";
    return;
  }
  if (newPin !== confirmPin) {
    parentControlsMessage.textContent = "PINs do not match.";
    return;
  }
  await setParentPin(newPin);
  parentPinChange.value = "";
  parentPinChangeConfirm.value = "";
  parentControlsMessage.textContent = "PIN updated.";
}

function lockParentSettings() {
  parentUnlocked = false;
  updateParentLockUI();
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

function setActiveProfileById(profileId) {
  const updated = setActiveProfile(profileState, profileId);
  if (updated) {
    activeProfile = updated;
  }
  populateProfileSelect();
  syncProfileToUI();
  renderParentReport();
}

function syncProfileToUI() {
  if (!activeProfile) return;
  readingLevelSelect.value = activeProfile.readingLevel;
  blockedTopicsInput.value = activeProfile.blockedTopics;
  profileNameInput.value = activeProfile.name;
  stickerThemeSelect.value = activeProfile.stickerTheme || "candy";
  renderStickerUploads();
}

function saveProfileSettings() {
  if (!activeProfile) return;
  activeProfile.readingLevel = readingLevelSelect.value;
  activeProfile.blockedTopics = blockedTopicsInput.value;
  activeProfile.stickerTheme = stickerThemeSelect.value;
  saveProfileState(profileState);
  renderStickerUploads();
  renderParentReport();
}

function handleAddProfile() {
  const name = profileNameInput.value.trim() || window.prompt("New profile name?");
  if (!name) return;
  const newProfile = createProfile(name, {
    readingLevel: activeProfile?.readingLevel || "growing",
    blockedTopics: activeProfile?.blockedTopics || "",
    stickerTheme: activeProfile?.stickerTheme || "candy",
  });
  profileState.profiles[newProfile.id] = newProfile;
  setActiveProfileById(newProfile.id);
  profileNameInput.value = "";
  saveProfileState(profileState);
}

function handleRenameProfile() {
  if (!activeProfile) return;
  const name = profileNameInput.value.trim();
  if (!name) return;
  activeProfile.name = name;
  saveProfileState(profileState);
  populateProfileSelect();
  renderParentReport();
}

function handleDeleteProfile() {
  if (!activeProfile) return;
  if (Object.keys(profileState.profiles).length <= 1) {
    window.alert("At least one profile is required.");
    return;
  }
  const confirmDelete = window.confirm(`Delete profile ${activeProfile.name}?`);
  if (!confirmDelete) return;
  delete profileState.profiles[activeProfile.id];
  const nextId = Object.keys(profileState.profiles)[0];
  setActiveProfileById(nextId);
  saveProfileState(profileState);
}

function renderThemeOptions() {
  stickerThemeSelect.innerHTML = "";
  Object.entries(THEMES).forEach(([themeId, theme]) => {
    const option = document.createElement("option");
    option.value = themeId;
    option.textContent = theme.label;
    stickerThemeSelect.appendChild(option);
  });
}

function renderStickerUploads() {
  if (!activeProfile) return;
  stickerUploadGrid.innerHTML = "";
  const theme = THEMES[activeProfile.stickerTheme] || THEMES.candy;

  BADGES.forEach((badge, index) => {
    const card = document.createElement("div");
    card.className = "sticker-upload-card";

    const preview = document.createElement("div");
    preview.className = "sticker-preview";
    const customArt = activeProfile.stickerArt?.[badge.id];
    if (customArt) {
      preview.style.backgroundImage = `url("${customArt}")`;
      preview.classList.add("custom-art");
    } else {
      preview.style.backgroundImage = theme.gradients[index % theme.gradients.length];
    }

    const title = document.createElement("div");
    title.className = "sticker-title";
    title.textContent = badge.title;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_STICKER_BYTES) {
        window.alert("That image is too big. Please choose one under 300 KB.");
        event.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (!activeProfile) return;
        activeProfile.stickerArt = activeProfile.stickerArt || {};
        activeProfile.stickerArt[badge.id] = reader.result;
        if (!saveProfileState(profileState)) {
          delete activeProfile.stickerArt[badge.id];
          window.alert("Not enough browser storage to save this sticker.");
        }
        renderStickerUploads();
      };
      reader.readAsDataURL(file);
    });

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.textContent = "Clear";
    clearButton.addEventListener("click", () => {
      if (!activeProfile || !activeProfile.stickerArt) return;
      delete activeProfile.stickerArt[badge.id];
      saveProfileState(profileState);
      renderStickerUploads();
    });

    const actions = document.createElement("div");
    actions.className = "sticker-upload-actions";
    actions.appendChild(input);
    actions.appendChild(clearButton);

    card.appendChild(preview);
    card.appendChild(title);
    card.appendChild(actions);
    stickerUploadGrid.appendChild(card);
  });
}

function clearStickerArt() {
  if (!activeProfile) return;
  activeProfile.stickerArt = {};
  saveProfileState(profileState);
  renderStickerUploads();
}

function formatDate(timestamp) {
  if (!timestamp) return "Never";
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function renderParentReport() {
  parentReport.innerHTML = "";
  Object.values(profileState.profiles).forEach((profile) => {
    const card = document.createElement("div");
    card.className = "report-card";

    const title = document.createElement("h4");
    title.textContent = profile.name;

    const meta = document.createElement("p");
    meta.className = "report-meta";
    meta.textContent = `Level ${profile.level} · ${profile.questionCount} questions · ${profile.badges.length}/${BADGES.length} stickers`;

    const lastAsked = document.createElement("p");
    lastAsked.className = "report-muted";
    lastAsked.textContent = `Last question: ${formatDate(profile.lastAskedAt)}`;

    const list = document.createElement("ul");
    list.className = "report-list";
    const recentQuestions = (profile.history || [])
      .filter((entry) => entry.role === "user")
      .slice(-3)
      .reverse();
    if (recentQuestions.length === 0) {
      const item = document.createElement("li");
      item.textContent = "No questions yet.";
      list.appendChild(item);
    } else {
      recentQuestions.forEach((entry) => {
        const item = document.createElement("li");
        item.textContent = entry.content;
        list.appendChild(item);
      });
    }

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(lastAsked);
    card.appendChild(list);
    parentReport.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeCsv(value) {
  let text = value == null ? "" : String(value);
  // Neutralise spreadsheet formulas ("=", "+", "-", "@") coming from kid-typed text.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (text.includes("\"") || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/\"/g, "\"\"")}"`;
  }
  return text;
}

function getRecentQuestions(profile) {
  return (profile.history || [])
    .filter((entry) => entry.role === "user")
    .slice(-3)
    .map((entry) => entry.content)
    .join(" | ");
}

function downloadCsv() {
  const rows = [
    [
      "Profile",
      "Level",
      "Question Count",
      "Stickers",
      "Reading Level",
      "Last Asked",
      "Recent Questions",
    ],
  ];
  Object.values(profileState.profiles).forEach((profile) => {
    rows.push([
      profile.name,
      profile.level,
      profile.questionCount,
      `${profile.badges.length}/${BADGES.length}`,
      profile.readingLevel,
      formatDate(profile.lastAskedAt),
      getRecentQuestions(profile),
    ]);
  });
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fluffy-parent-report.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function printPdf() {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) return;
  const rows = Object.values(profileState.profiles)
    .map((profile) => {
      return `
        <div class="card">
          <h3>${escapeHtml(profile.name)}</h3>
          <p><strong>Level:</strong> ${profile.level}</p>
          <p><strong>Questions:</strong> ${profile.questionCount}</p>
          <p><strong>Stickers:</strong> ${profile.badges.length}/${BADGES.length}</p>
          <p><strong>Reading level:</strong> ${escapeHtml(profile.readingLevel)}</p>
          <p><strong>Last asked:</strong> ${escapeHtml(formatDate(profile.lastAskedAt))}</p>
          <p><strong>Recent questions:</strong> ${escapeHtml(getRecentQuestions(profile)) || "None"}</p>
        </div>
      `;
    })
    .join("");

  reportWindow.document.write(`
    <html>
      <head>
        <title>Fluffy Parent Report</title>
        <style>
          body { font-family: "Nunito", Arial, sans-serif; padding: 24px; color: #2b2b2b; }
          h1 { margin-bottom: 8px; }
          .card { border: 1px solid #eee; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
          p { margin: 6px 0; }
        </style>
      </head>
      <body>
        <h1>Fluffy Parent Report</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
        ${rows}
      </body>
    </html>
  `);
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}

modelNameInput.addEventListener("change", saveSystemSettings);
apiKeyInput.addEventListener("change", saveSystemSettings);
maxTokensInput.addEventListener("change", saveSystemSettings);
systemPromptInput.addEventListener("input", saveSystemSettings);

kidModeDefault.addEventListener("change", saveSystemSettings);
speakDefault.addEventListener("change", saveSystemSettings);
voiceInputDefault.addEventListener("change", saveSystemSettings);
voiceSelect.addEventListener("change", saveSystemSettings);
testConnectionButton.addEventListener("click", testConnection);

temperatureInput.addEventListener("input", () => {
  updateTemperature();
  saveSystemSettings();
});

// Surface unexpected failures instead of failing silently.
function guarded(handler) {
  return async () => {
    try {
      await handler();
    } catch (error) {
      console.error(error);
      setParentMessage(`Something went wrong: ${error.message}`);
    }
  };
}

const unlockHandler = guarded(handleUnlock);
const setPinHandler = guarded(handleSetPin);
const changePinHandler = guarded(handleChangePin);

function onEnter(input, handler) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handler();
    }
  });
}

unlockParentButton.addEventListener("click", unlockHandler);
setParentPinButton.addEventListener("click", setPinHandler);
changeParentPinButton.addEventListener("click", changePinHandler);
onEnter(parentPinInput, unlockHandler);
onEnter(parentPinConfirm, setPinHandler);
onEnter(parentPinChangeConfirm, changePinHandler);
lockParentButton.addEventListener("click", lockParentSettings);

profileSelect.addEventListener("change", (event) => {
  setActiveProfileById(event.target.value);
});

readingLevelSelect.addEventListener("change", () => {
  saveProfileSettings();
});
blockedTopicsInput.addEventListener("input", saveProfileSettings);

resetProgressButton.addEventListener("click", () => {
  if (!activeProfile) return;
  const confirmReset = window.confirm(
    "Reset progress and clear chat history for this profile?"
  );
  if (!confirmReset) return;
  activeProfile.questionCount = 0;
  activeProfile.level = 1;
  activeProfile.badges = [];
  activeProfile.history = [];
  activeProfile.lastAskedAt = null;
  saveProfileState(profileState);
  renderParentReport();
  syncProfileToUI();
});

clearHistoryButton.addEventListener("click", () => {
  if (!activeProfile) return;
  const confirmClear = window.confirm("Clear chat history for this profile only?");
  if (!confirmClear) return;
  activeProfile.history = [];
  activeProfile.lastAskedAt = null;
  saveProfileState(profileState);
  renderParentReport();
});

addProfileButton.addEventListener("click", handleAddProfile);
renameProfileButton.addEventListener("click", handleRenameProfile);
deleteProfileButton.addEventListener("click", handleDeleteProfile);

stickerThemeSelect.addEventListener("change", saveProfileSettings);
clearStickerArtButton.addEventListener("click", clearStickerArt);
downloadReportCsv.addEventListener("click", downloadCsv);
printReportPdf.addEventListener("click", printPdf);

// Pick up changes made in another tab (e.g. new chats) instead of overwriting them.
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  profileState = loadProfileState();
  activeProfile = profileState.profiles[profileState.activeId];
  populateProfileSelect();
  syncProfileToUI();
  renderParentReport();
});

loadSystemSettings();
renderThemeOptions();
populateProfileSelect();
setActiveProfileById(profileState.activeId);
updateParentLockUI();
populateVoiceList();
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    populateVoiceList();
  };
}
