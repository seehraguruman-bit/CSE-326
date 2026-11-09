/* FEST.EXE — local-first festival manager
   Sections: data/state, conflict engine, renderers, editors, events, arcade polish. */
(() => {
  "use strict";

  const STORAGE_KEY = "fest-exe-data-v1";
  const TECH_OPTIONS = ["DJ decks", "Live drums", "Pyro", "Full backline", "Wireless mics", "LED wall", "Turntables", "Piano", "In-ear monitors", "Haze"];
  const HOURS_START = 10;
  const HOURS_END = 24;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const seedData = () => ({
    score: 0,
    artists: [
      { id: "a1", name: "Neon Palms", genre: "Electronic", country: "USA", setLength: 60, fee: 4200, contact: "booking@neonpalms.example", bio: "Synth-heavy sunset sets with a live visual show.", tech: ["DJ decks", "LED wall"] },
      { id: "a2", name: "The Paper Moons", genre: "Indie Rock", country: "UK", setLength: 60, fee: 3500, contact: "hello@papermoons.example", bio: "Bright guitar hooks and big festival choruses.", tech: ["Live drums", "Full backline", "Wireless mics"] },
      { id: "a3", name: "Mira Sol", genre: "Pop", country: "Spain", setLength: 45, fee: 2800, contact: "mira@sol.example", bio: "A bold pop set built for the main-stage crowd.", tech: ["Wireless mics", "LED wall"] },
      { id: "a4", name: "Bassline Ritual", genre: "Electronic", country: "Germany", setLength: 60, fee: 3900, contact: "booking@bassline.example", bio: "Deep bass, hardware synths, and late-night energy.", tech: ["DJ decks", "Turntables", "Haze"] },
      { id: "a5", name: "Juniper & The Wild", genre: "Folk", country: "Canada", setLength: 50, fee: 2100, contact: "wild@juniper.example", bio: "Folk storytelling with a full-band festival sound.", tech: ["Live drums", "Full backline", "Piano"] },
      { id: "a6", name: "Static Bloom", genre: "Alternative", country: "Japan", setLength: 45, fee: 2600, contact: "team@staticbloom.example", bio: "Dreamy alternative rock with a luminous stage look.", tech: ["Live drums", "LED wall", "Wireless mics"] }
    ],
    stages: [
      { id: "s1", name: "Pixel Mainstage", capacity: 12000, tech: ["DJ decks", "Live drums", "Full backline", "Wireless mics", "LED wall", "Turntables", "Piano", "In-ear monitors", "Haze"], open: "12:00", close: "23:00", buffer: 20 },
      { id: "s2", name: "Chiptune Grove", capacity: 4500, tech: ["DJ decks", "Live drums", "Wireless mics", "Turntables", "Haze"], open: "13:00", close: "23:30", buffer: 15 },
      { id: "s3", name: "Indie Arcade", capacity: 2500, tech: ["Live drums", "Full backline", "Wireless mics", "Piano"], open: "12:00", close: "22:00", buffer: 15 }
    ],
    slots: [
      { id: "p1", artistId: "a1", stageId: "s1", day: 1, start: "16:00", end: "17:00" },
      { id: "p2", artistId: "a2", stageId: "s3", day: 1, start: "16:30", end: "17:30" },
      { id: "p3", artistId: "a3", stageId: "s1", day: 1, start: "17:15", end: "18:00" },
      { id: "p4", artistId: "a4", stageId: "s2", day: 1, start: "20:00", end: "21:00" },
      { id: "p5", artistId: "a5", stageId: "s3", day: 2, start: "15:00", end: "15:50" },
      { id: "p6", artistId: "a6", stageId: "s1", day: 2, start: "19:00", end: "19:45" }
    ]
  });

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return seedData();
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed.artists) || !Array.isArray(parsed.stages) || !Array.isArray(parsed.slots)) throw new Error("Stored festival data has an invalid shape.");
      return { ...seedData(), ...parsed };
    } catch (error) {
      console.error("Could not load FEST.EXE data:", error);
      return seedData();
    }
  }

  const state = { data: loadState(), day: 1, dialogKind: null, editingId: null, soundOn: false, lastConflictCount: 0, toastTimer: null, gameOverShown: false, unlocked: new Set(), firstArtistAdded: false, firstSlotScheduled: false };
  const saveState = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data)); }
    catch (error) { console.error("Could not save FEST.EXE data:", error); showToast("SAVE FAILED — CHECK BROWSER STORAGE"); }
  };
  const artistById = id => state.data.artists.find(item => item.id === id);
  const stageById = id => state.data.stages.find(item => item.id === id);
  const timeToMinutes = value => {
    const [hours, minutes] = String(value).split(":").map(Number);
    return hours * 60 + minutes;
  };
  const formatMoney = amount => amount ? `$${Number(amount).toLocaleString()}` : "FEE TBD";
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const genreClass = genre => /electronic|edm|dj/i.test(genre) ? "genre-blue" : /rock|indie|alternative/i.test(genre) ? "genre-green" : /folk|pop|jazz/i.test(genre) ? "genre-yellow" : "genre-violet";

  /* Conflict engine: return one issue per affected slot/pair, with jump targets. */
  function detectConflicts(slots = state.data.slots) {
    const conflicts = [];
    const slotIds = new Set(slots.map(slot => slot.id));
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const artist = artistById(slot.artistId);
      const stage = stageById(slot.stageId);
      if (!artist || !stage) continue;
      const start = timeToMinutes(slot.start);
      const end = timeToMinutes(slot.end);
      const opens = timeToMinutes(stage.open);
      const closes = timeToMinutes(stage.close);
      if (start < opens || end > closes || end <= start) {
        conflicts.push({ id: `hours-${slot.id}`, type: "Outside operating hours", severity: "high", slotIds: [slot.id], detail: `${artist.name} is scheduled ${slot.start}–${slot.end}, outside ${stage.name}'s ${stage.open}–${stage.close} hours.` });
      }
      const missing = artist.tech.filter(item => !stage.tech.includes(item));
      if (missing.length) {
        conflicts.push({ id: `tech-${slot.id}`, type: "Tech mismatch", severity: "medium", slotIds: [slot.id], detail: `${artist.name} needs ${missing.join(", ")} — unsupported at ${stage.name}.` });
      }
      for (let otherIndex = index + 1; otherIndex < slots.length; otherIndex += 1) {
        const other = slots[otherIndex];
        if (slot.day !== other.day) continue;
        const otherStart = timeToMinutes(other.start);
        const otherEnd = timeToMinutes(other.end);
        const overlaps = start < otherEnd && otherStart < end;
        if (slot.stageId === other.stageId) {
          if (overlaps) conflicts.push({ id: `stage-${slot.id}-${other.id}`, type: "Stage overlap", severity: "high", slotIds: [slot.id, other.id], detail: `${stage.name} has overlapping sets: ${artist.name} (${slot.start}–${slot.end}) and ${artistById(other.artistId)?.name || "Unknown artist"} (${other.start}–${other.end}).` });
          else {
            const gap = start >= otherEnd ? start - otherEnd : otherStart - end;
            if (gap >= 0 && gap < Number(stage.buffer)) conflicts.push({ id: `buffer-${slot.id}-${other.id}`, type: "Changeover buffer", severity: "medium", slotIds: [slot.id, other.id], detail: `${stage.name} has only ${gap} minutes between sets; ${stage.buffer} minutes are required.` });
          }
        }
        if (slot.stageId !== other.stageId && slot.artistId === other.artistId && overlaps) {
          conflicts.push({ id: `artist-${slot.id}-${other.id}`, type: "Artist double-booking", severity: "high", slotIds: [slot.id, other.id], detail: `${artist.name} is booked on multiple stages at overlapping times.` });
        }
      }
    }
    return conflicts.filter(conflict => conflict.slotIds.every(id => slotIds.has(id)));
  }

  function calculateUtilization(stage) {
    const available = timeToMinutes(stage.close) - timeToMinutes(stage.open);
    const booked = state.data.slots.filter(slot => slot.stageId === stage.id).reduce((total, slot) => total + Math.max(0, timeToMinutes(slot.end) - timeToMinutes(slot.start)), 0);
    return available > 0 ? Math.min(100, Math.round(booked / (available * 3) * 100)) : 0;
  }

  function renderHUD(conflicts) {
    $("#score").textContent = String(state.data.score || 0).padStart(6, "0");
    const hearts = Math.max(0, 3 - conflicts.length);
    $("#hearts").textContent = "♥".repeat(hearts) + "♡".repeat(3 - hearts);
    $("#hearts").setAttribute("aria-label", `${hearts} of 3 lives remaining`);
    if (conflicts.length > state.lastConflictCount) {
      $("#hearts").classList.remove("hearts-hit");
      void $("#hearts").offsetWidth;
      $("#hearts").classList.add("hearts-hit");
    }
    state.lastConflictCount = conflicts.length;
    if (hearts === 0 && conflicts.length && !state.gameOverShown) {
      state.gameOverShown = true;
      $("#game-over").hidden = false;
      $("#continue-game").focus();
    }
    if (hearts > 0) {
      state.gameOverShown = false;
      $("#game-over").hidden = true;
    }
  }

  function renderArtists() {
    const query = $("#artist-search").value.trim().toLowerCase();
    const genre = $("#genre-filter").value;
    const sort = $("#artist-sort").value;
    const artists = [...state.data.artists]
      .filter(artist => (!genre || artist.genre === genre) && (!query || `${artist.name} ${artist.genre} ${artist.country}`.toLowerCase().includes(query)))
      .sort((a, b) => String(a[sort]).localeCompare(String(b[sort])));
    $("#artist-grid").innerHTML = artists.length ? artists.map(artist => `
      <article class="artist-card">
        <header class="card-header"><canvas class="avatar" width="54" height="54" data-avatar="${escapeHTML(artist.name)}" aria-label="Pixel avatar for ${escapeHTML(artist.name)}"></canvas><div><h3>${escapeHTML(artist.name)}</h3><p>${escapeHTML(artist.genre)} · ${escapeHTML(artist.country)}</p></div></header>
        <div class="card-content"><p><strong>SET:</strong> ${Number(artist.setLength)} MIN</p><p><strong>FEE:</strong> ${escapeHTML(formatMoney(artist.fee))}</p><p class="bio">${escapeHTML(artist.bio || "No bio added yet.")}</p><div class="tag-list">${artist.tech.map(tag => `<span class="tag">${escapeHTML(tag)}</span>`).join("") || '<span class="tag">NO TECH TAGS</span>'}</div></div>
        <footer class="card-footer"><strong>${escapeHTML(artist.contact || "CONTACT TBD")}</strong><div class="small-actions"><button class="small-button" data-action="edit-artist" data-id="${artist.id}" type="button">EDIT</button><button class="small-button delete" data-action="delete-artist" data-id="${artist.id}" type="button">DEL</button></div></footer>
      </article>`).join("") : '<div class="empty-state">NO ARTISTS YET — INSERT COIN</div>';
    drawAvatars();
    const genres = [...new Set(state.data.artists.map(artist => artist.genre).filter(Boolean))].sort();
    const filter = $("#genre-filter");
    const selected = filter.value;
    filter.innerHTML = '<option value="">ALL GENRES</option>' + genres.map(item => `<option value="${escapeHTML(item)}">${escapeHTML(item.toUpperCase())}</option>`).join("");
    filter.value = genres.includes(selected) ? selected : "";
  }

  function drawAvatars() {
    $$(".avatar").forEach(canvas => {
      const context = canvas.getContext("2d");
      if (!context) return;
      let seed = [...canvas.dataset.avatar].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
      const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const colors = ["#3aa9f0", "#6be36b", "#8b5cf6", "#ff5a4d", "#ffc857", "#f3e5b5"];
      context.fillStyle = "#19122f"; context.fillRect(0, 0, 54, 54);
      for (let y = 0; y < 9; y += 1) for (let x = 0; x < 5; x += 1) {
        if (random() > .47) {
          context.fillStyle = colors[Math.floor(random() * colors.length)];
          context.fillRect(x * 6, y * 6, 6, 6); context.fillRect((8 - x) * 6, y * 6, 6, 6);
        }
      }
      context.fillStyle = "#f3e5b5"; context.fillRect(12, 18, 6, 6); context.fillRect(36, 18, 6, 6);
      context.fillStyle = "#17112d"; context.fillRect(12, 24, 6, 6); context.fillRect(36, 24, 6, 6);
    });
  }

  function renderStages() {
    $("#stage-grid").innerHTML = state.data.stages.length ? state.data.stages.map(stage => {
      const percent = calculateUtilization(stage);
      return `<article class="stage-card"><header class="card-header"><div><h3>${escapeHTML(stage.name)}</h3><p>${escapeHTML(stage.open)} – ${escapeHTML(stage.close)}</p></div><span class="stage-icon" aria-hidden="true">▤</span></header>
        <div class="card-content"><div class="stage-metrics"><div><span>CAPACITY</span><strong>${Number(stage.capacity).toLocaleString()}</strong></div><div><span>CHANGEOVER</span><strong>${Number(stage.buffer)} MIN</strong></div></div><div class="tag-list">${stage.tech.map(tag => `<span class="tag">${escapeHTML(tag)}</span>`).join("") || '<span class="tag">NO EQUIPMENT</span>'}</div><div class="utilization"><div class="utilization-label"><span>STAGE UTILIZATION</span><strong>${percent}%</strong></div><div class="healthbar">${Array.from({ length: 10 }, (_, index) => `<i class="${percent >= (index + 1) * 10 ? "filled" : ""}"></i>`).join("")}</div></div></div>
        <footer class="card-footer"><strong>STAGE ${String(state.data.stages.indexOf(stage) + 1).padStart(2, "0")}</strong><div class="small-actions"><button class="small-button" data-action="edit-stage" data-id="${stage.id}" type="button">EDIT</button><button class="small-button delete" data-action="delete-stage" data-id="${stage.id}" type="button">DEL</button></div></footer></article>`;
    }).join("") : '<div class="empty-state">NO STAGES LOADED — BUILD YOUR FIRST STAGE</div>';
    const select = $("#stage-filter");
    const selected = select.value;
    select.innerHTML = '<option value="">ALL STAGES</option>' + state.data.stages.map(stage => `<option value="${stage.id}">${escapeHTML(stage.name)}</option>`).join("");
    select.value = state.data.stages.some(stage => stage.id === selected) ? selected : "";
  }

  function renderSchedule(conflicts) {
    const daySlots = state.data.slots.filter(slot => slot.day === state.day && (!$("#stage-filter").value || slot.stageId === $("#stage-filter").value));
    const conflictSlots = new Set(conflicts.flatMap(item => item.slotIds));
    const hours = Array.from({ length: HOURS_END - HOURS_START }, (_, index) => HOURS_START + index);
    $("#timeline").innerHTML = `<div class="timeline-grid"><div class="timeline-header"><div class="lane-name">STAGE / TIME</div><div class="hour-labels">${hours.map(hour => `<span>${String(hour).padStart(2, "0")}:00</span>`).join("")}</div></div>
      ${state.data.stages.filter(stage => !$("#stage-filter").value || stage.id === $("#stage-filter").value).map(stage => `<div class="timeline-lane"><div class="lane-name">${escapeHTML(stage.name)}</div><div class="lane-track" data-stage="${stage.id}" role="button" tabindex="0" aria-label="Add performance at ${escapeHTML(stage.name)} on day ${state.day}">${daySlots.filter(slot => slot.stageId === stage.id).map(slot => {
        const left = Math.max(0, (timeToMinutes(slot.start) - HOURS_START * 60) / ((HOURS_END - HOURS_START) * 60) * 100);
        const width = Math.max(2, (timeToMinutes(slot.end) - timeToMinutes(slot.start)) / ((HOURS_END - HOURS_START) * 60) * 100);
        const artist = artistById(slot.artistId);
        return `<button class="slot-block ${genreClass(artist?.genre || "")} ${conflictSlots.has(slot.id) ? "has-conflict" : ""}" style="left:${left}%;width:${width}%" data-slot="${slot.id}" draggable="true" type="button" aria-label="${escapeHTML(artist?.name || "Unknown artist")}, ${slot.start} to ${slot.end}, ${escapeHTML(stage.name)}"><strong>${escapeHTML(artist?.name || "Unknown artist")}</strong><span>${escapeHTML(slot.start)}–${escapeHTML(slot.end)}</span></button>`;
      }).join("")}</div></div>`).join("")}${state.data.stages.length ? "" : '<div class="empty-state">ADD A STAGE TO UNLOCK THE SCHEDULE</div>'}</div>`;
  }

  function renderConflicts(conflicts) {
    $("#conflict-counter").textContent = `${conflicts.length} ACTIVE`;
    $("#conflict-list").innerHTML = conflicts.length ? conflicts.map(conflict => {
      const names = conflict.slotIds.map(id => {
        const slot = state.data.slots.find(item => item.id === id);
        return slot ? `${artistById(slot.artistId)?.name || "Artist"} · Day ${slot.day} ${slot.start}` : "Schedule slot";
      }).join(" / ");
      return `<article class="conflict-item severity-${conflict.severity}"><div class="conflict-type">${escapeHTML(conflict.type)}</div><div class="conflict-details"><strong>${escapeHTML(conflict.detail)}</strong><span class="conflict-slots">${escapeHTML(names)}</span></div><button class="button button-danger jump-conflict" data-slot="${conflict.slotIds[0]}" type="button">▶ FIX IT</button></article>`;
    }).join("") : '<div class="all-clear">★ ALL CLEAR ★<br><span>NO ACTIVE CONFLICTS — NICE WORK, PLAYER!</span></div>';
    $("#stats-grid").innerHTML = [
      ["ARTISTS", state.data.artists.length], ["STAGES", state.data.stages.length], ["SLOTS SCHEDULED", state.data.slots.length], ["ACTIVE CONFLICTS", conflicts.length],
      ["STAGE UTILIZATION", state.data.stages.length ? `${Math.round(state.data.stages.reduce((sum, stage) => sum + calculateUtilization(stage), 0) / state.data.stages.length)}%` : "0%"]
    ].map(([label, value]) => `<div class="stat-card"><strong>${escapeHTML(value)}</strong><span>${label}</span></div>`).join("");
  }

  function render() {
    const conflicts = detectConflicts();
    renderHUD(conflicts);
    renderArtists();
    renderStages();
    renderSchedule(conflicts);
    renderConflicts(conflicts);
  }

  function updateScore(amount) {
    const before = Number(state.data.score) || 0;
    state.data.score = Math.max(0, before + amount);
    saveState();
    const target = state.data.score;
    const start = performance.now();
    const duration = 450;
    const tick = now => {
      const progress = Math.min(1, (now - start) / duration);
      $("#score").textContent = String(Math.round(before + (target - before) * progress)).padStart(6, "0");
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = `★ ACHIEVEMENT UNLOCKED: ${message}`;
    toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 3300);
    playTone("level");
  }

  function unlock(key, message, condition = true) {
    if (condition && !state.unlocked.has(key)) {
      state.unlocked.add(key);
      showToast(message);
    }
  }

  function checkAchievements(conflictCount, events = {}) {
    unlock("first-artist", "FIRST ARTIST ADDED", events.artistAdded === true && !state.firstArtistAdded);
    unlock("first-slot", "FIRST SLOT SCHEDULED", events.slotAdded === true && !state.firstSlotScheduled);
    if (events.artistAdded) state.firstArtistAdded = true;
    if (events.slotAdded) state.firstSlotScheduled = true;
    unlock("zero-conflicts", "ZERO CONFLICTS", conflictCount === 0 && state.data.slots.length > 0);
    unlock("ten-artists", "10 ARTISTS", state.data.artists.length >= 10);
  }

  function refreshAfterMutation(oldConflicts, scoreForClear = false, events = {}) {
    saveState();
    render();
    const nextConflicts = detectConflicts();
    if (scoreForClear && nextConflicts.length < oldConflicts) {
      updateScore(250);
      playTone("coin");
    }
    checkAchievements(nextConflicts.length, events);
  }

  function playTone(type) {
    if (!state.soundOn) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = type === "error" ? 115 : type === "level" ? 880 : 660;
      gain.gain.setValueAtTime(.035, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .13);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + .13);
      oscillator.onended = () => audio.close();
    } catch (error) { console.error("Audio playback failed:", error); }
  }

  function field(label, name, value = "", type = "text", options = {}) {
    const full = options.full ? " full" : "";
    const required = options.required ? " required" : "";
    if (type === "select") return `<div class="field${full}"><label for="field-${name}">${label}</label><select id="field-${name}" name="${name}"${required}>${(options.choices || []).map(item => `<option value="${escapeHTML(item.value)}" ${String(item.value) === String(value) ? "selected" : ""}>${escapeHTML(item.label)}</option>`).join("")}</select></div>`;
    if (type === "tags") return `<fieldset class="field full" style="border:0;padding:0;margin:0"><legend class="field-label">${label}</legend><div class="tag-picker">${TECH_OPTIONS.map(tag => `<label class="tag-option"><input type="checkbox" name="tech" value="${escapeHTML(tag)}" ${value.includes(tag) ? "checked" : ""}>${escapeHTML(tag)}</label>`).join("")}</div></fieldset>`;
    if (type === "textarea") return `<div class="field${full}"><label for="field-${name}">${label}</label><textarea id="field-${name}" name="${name}" placeholder="${escapeHTML(options.placeholder || "")}">${escapeHTML(value)}</textarea></div>`;
    return `<div class="field${full}"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" value="${escapeHTML(value)}" ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.max !== undefined ? `max="${options.max}"` : ""} ${required} ${options.step ? `step="${options.step}"` : ""} placeholder="${escapeHTML(options.placeholder || "")}"></div>`;
  }

  function openEditor(kind, id = null, defaults = {}) {
    state.dialogKind = kind; state.editingId = id;
    const existing = id ? (kind === "artist" ? artistById(id) : kind === "stage" ? stageById(id) : state.data.slots.find(slot => slot.id === id)) : {};
    const item = { ...(existing || {}), ...defaults };
    const titles = { artist: id ? "EDIT ARTIST" : "ADD ARTIST", stage: id ? "EDIT STAGE" : "ADD STAGE", slot: id ? "EDIT SLOT" : "ADD PERFORMANCE SLOT" };
    $("#dialog-title").textContent = titles[kind];
    $("#dialog-eyebrow").textContent = kind === "slot" ? "◆ SCHEDULE SETUP" : "◆ PLAYER SETUP";
    $("#form-error").textContent = "";
    $("#slot-preview").hidden = kind !== "slot";
    if (kind === "artist") {
      $("#form-fields").innerHTML = field("ARTIST NAME *", "name", item.name, "text", { required: true }) + field("GENRE *", "genre", item.genre, "text", { required: true }) +
        field("COUNTRY", "country", item.country) + field("SET LENGTH (MIN) *", "setLength", item.setLength || 45, "number", { required: true, min: 1, max: 360 }) +
        field("FEE (OPTIONAL)", "fee", item.fee || "", "number", { min: 0, step: "1", placeholder: "e.g. 2500" }) + field("CONTACT", "contact", item.contact) +
        field("SHORT BIO", "bio", item.bio, "textarea", { full: true, placeholder: "A quick intro for the festival crew..." }) + field("TECH REQUIREMENTS", "tech", item.tech || [], "tags");
    } else if (kind === "stage") {
      $("#form-fields").innerHTML = field("STAGE NAME *", "name", item.name, "text", { required: true }) + field("CAPACITY *", "capacity", item.capacity || 1000, "number", { required: true, min: 1 }) +
        field("OPENS *", "open", item.open || "12:00", "time", { required: true }) + field("CLOSES *", "close", item.close || "23:00", "time", { required: true }) +
        field("CHANGEOVER BUFFER (MIN) *", "buffer", item.buffer ?? 15, "number", { required: true, min: 0, max: 240 }) + field("SUPPORTED EQUIPMENT", "tech", item.tech || [], "tags");
    } else {
      const artistChoices = state.data.artists.map(artist => ({ value: artist.id, label: artist.name }));
      const stageChoices = state.data.stages.map(stage => ({ value: stage.id, label: stage.name }));
      $("#form-fields").innerHTML = field("ARTIST *", "artistId", item.artistId || artistChoices[0]?.value || "", "select", { required: true, choices: artistChoices }) +
        field("STAGE *", "stageId", item.stageId || defaults.stageId || stageChoices[0]?.value || "", "select", { required: true, choices: stageChoices }) +
        field("FESTIVAL DAY *", "day", item.day || state.day, "select", { required: true, choices: [1, 2, 3].map(day => ({ value: day, label: `DAY ${day}` })) }) +
        field("START TIME *", "start", item.start || "16:00", "time", { required: true }) + field("END TIME *", "end", item.end || "17:00", "time", { required: true }) +
        '<div class="field full"><small>Conflict checks run live when you save. You can override a warning to keep the draft slot.</small></div>';
    }
    const hasChoices = kind !== "slot" || (state.data.artists.length && state.data.stages.length);
    $("#save-dialog").disabled = !hasChoices;
    if (!hasChoices) $("#form-error").textContent = "ADD AN ARTIST AND STAGE BEFORE SCHEDULING.";
    const dialog = $("#editor-dialog");
    if (!dialog.open) dialog.showModal();
    const first = $("input, select, textarea", $("#form-fields"));
    if (first) first.focus();
    if (kind === "slot") updateSlotPreview();
  }

  function updateSlotPreview() {
    const preview = $("#slot-preview");
    if (state.dialogKind !== "slot" || preview.hidden) return;
    const formData = new FormData($("#editor-form"));
    const candidate = readForm("slot", formData);
    if (!candidate.artistId || !candidate.stageId || !candidate.start || !candidate.end || timeToMinutes(candidate.end) <= timeToMinutes(candidate.start)) {
      preview.classList.add("has-issues");
      preview.innerHTML = "<strong>◆ CHECK YOUR SLOT</strong>Choose an artist and stage, then set a valid time range.";
      return;
    }
    const draft = { ...candidate, id: state.editingId || "__draft-slot__" };
    const slots = state.data.slots.filter(slot => slot.id !== state.editingId).concat(draft);
    const issues = detectConflicts(slots).filter(issue => issue.slotIds.includes(draft.id));
    if (issues.length) {
      preview.classList.add("has-issues");
      preview.innerHTML = `<strong>◆ ${issues.length} CONFLICT${issues.length === 1 ? "" : "S"} DETECTED — OVERRIDE AVAILABLE</strong><ul>${issues.map(issue => `<li>${escapeHTML(issue.type)}: ${escapeHTML(issue.detail)}</li>`).join("")}</ul>`;
    } else {
      preview.classList.remove("has-issues");
      preview.innerHTML = "<strong>★ NO CONFLICTS DETECTED</strong>This slot is clear to save.";
    }
  }

  function readForm(kind, formData) {
    if (kind === "artist") return {
      name: formData.get("name").trim(), genre: formData.get("genre").trim(), country: formData.get("country").trim(),
      setLength: Number(formData.get("setLength")), fee: formData.get("fee") ? Number(formData.get("fee")) : null,
      contact: formData.get("contact").trim(), bio: formData.get("bio").trim(), tech: formData.getAll("tech")
    };
    if (kind === "stage") return {
      name: formData.get("name").trim(), capacity: Number(formData.get("capacity")), open: formData.get("open"),
      close: formData.get("close"), buffer: Number(formData.get("buffer")), tech: formData.getAll("tech")
    };
    return { artistId: formData.get("artistId"), stageId: formData.get("stageId"), day: Number(formData.get("day")), start: formData.get("start"), end: formData.get("end") };
  }

  function validate(kind, item) {
    if (!item.name && kind !== "slot") return "INVALID INPUT! NAME IS REQUIRED.";
    if (kind === "artist" && (!item.genre || !Number.isFinite(item.setLength) || item.setLength < 1 || item.setLength > 360 || (item.fee !== null && (!Number.isFinite(item.fee) || item.fee < 0)))) return "INVALID INPUT! CHECK GENRE, SET LENGTH, AND FEE.";
    if (kind === "stage" && (!item.open || !item.close || !Number.isFinite(item.capacity) || item.capacity < 1 || !Number.isFinite(item.buffer) || item.buffer < 0 || timeToMinutes(item.close) <= timeToMinutes(item.open))) return "INVALID INPUT! CHECK CAPACITY, HOURS, AND BUFFER.";
    if (kind === "slot" && (!item.artistId || !item.stageId || !item.start || !item.end || timeToMinutes(item.end) <= timeToMinutes(item.start))) return "INVALID INPUT! END TIME MUST BE AFTER START TIME.";
    return "";
  }

  function saveEditor(event) {
    event.preventDefault();
    const kind = state.dialogKind;
    const item = readForm(kind, new FormData(event.currentTarget));
    const error = validate(kind, item);
    if (error) { $("#form-error").textContent = error; playTone("error"); return; }
    const previousConflicts = detectConflicts().length;
    let candidateSlots = state.data.slots;
    let events = {};
    if (kind === "slot") {
      const slot = { ...item, id: state.editingId || uid() };
      candidateSlots = state.editingId ? state.data.slots.map(current => current.id === slot.id ? slot : current) : [...state.data.slots, slot];
      const conflicts = detectConflicts(candidateSlots).filter(conflict => conflict.slotIds.includes(slot.id));
      if (conflicts.length) {
        const summary = conflicts.slice(0, 5).map(conflict => `• ${conflict.type}: ${conflict.detail}`).join("\n");
        if (!window.confirm(`CONFLICT WARNING!\n\n${summary}${conflicts.length > 5 ? `\n• And ${conflicts.length - 5} more...` : ""}\n\nSave this slot anyway?`)) {
          $("#form-error").textContent = "SLOT NOT SAVED — FIX THE BOSS FIGHT FIRST.";
          playTone("error");
          return;
        }
      }
      state.data.slots = candidateSlots;
      state.day = item.day;
      if (!state.editingId) events.slotAdded = true;
      if (!state.editingId && conflicts.length === 0) { updateScore(100); playTone("coin"); }
    } else if (kind === "artist") {
      const wasNew = !state.editingId;
      const artist = { ...item, id: state.editingId || uid() };
      state.data.artists = state.editingId ? state.data.artists.map(current => current.id === artist.id ? artist : current) : [...state.data.artists, artist];
      if (wasNew) events.artistAdded = true;
      if (wasNew) { updateScore(50); playTone("coin"); }
    } else {
      const stage = { ...item, id: state.editingId || uid() };
      state.data.stages = state.editingId ? state.data.stages.map(current => current.id === stage.id ? stage : current) : [...state.data.stages, stage];
    }
    $("#editor-dialog").close();
    refreshAfterMutation(previousConflicts, true, events);
  }

  function deleteEntity(kind, id) {
    const labels = { artist: "artist and their performance slots", stage: "stage and its performance slots" };
    if (!window.confirm(`DELETE THIS ${labels[kind].toUpperCase()}? THIS CANNOT BE UNDONE.`)) return;
    const oldCount = detectConflicts().length;
    if (kind === "artist") {
      state.data.artists = state.data.artists.filter(item => item.id !== id);
      state.data.slots = state.data.slots.filter(slot => slot.artistId !== id);
    } else {
      state.data.stages = state.data.stages.filter(item => item.id !== id);
      state.data.slots = state.data.slots.filter(slot => slot.stageId !== id);
    }
    refreshAfterMutation(oldCount, true);
  }

  function jumpToSlot(id) {
    const slot = state.data.slots.find(item => item.id === id);
    if (!slot) return;
    state.day = slot.day;
    $$(".day-tab").forEach(tab => {
      const active = Number(tab.dataset.day) === state.day;
      tab.classList.toggle("is-active", active); tab.setAttribute("aria-selected", String(active));
    });
    $("#stage-filter").value = "";
    renderSchedule(detectConflicts());
    $("#schedule").scrollIntoView({ behavior: "smooth" });
    setTimeout(() => {
      const button = $(`[data-slot="${CSS.escape(id)}"]`);
      if (button) { button.focus(); button.scrollIntoView({ block: "nearest", inline: "center" }); }
    }, 350);
  }

  function setLevelFromScroll() {
    const sections = $$(".level-section");
    const marker = window.scrollY + window.innerHeight * .42;
    let current = sections[0];
    sections.forEach(section => { if (section.offsetTop <= marker) current = section; });
    $("#level").textContent = `${current.dataset.level}/6`;
    const progress = window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    document.documentElement.style.setProperty("--walker-x", `${Math.min(96, Math.max(2, progress * 96))}%`);
    $$(".main-nav a").forEach(link => link.classList.toggle("active", link.hash === `#${current.id}`));
    unlock("final-stage", "FINAL STAGE REACHED", current.id === "final");
  }

  function exportSchedule() {
    const payload = { exportedAt: new Date().toISOString(), ...state.data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = "fest-exe-schedule.json"; link.click();
    URL.revokeObjectURL(link.href);
  }

  function confetti() {
    const layer = $("#confetti-layer");
    const colors = ["#6be36b", "#ff5a4d", "#3aa9f0", "#ffc857", "#8b5cf6", "#f3e5b5"];
    for (let index = 0; index < 90; index += 1) {
      const bit = document.createElement("i");
      bit.className = "confetti-bit"; bit.style.left = `${Math.random() * 100}%`;
      bit.style.top = `${Math.random() * -30}%`; bit.style.background = colors[index % colors.length];
      bit.style.animationDelay = `${Math.random() * .8}s`;
      layer.append(bit); setTimeout(() => bit.remove(), 2800);
    }
    playTone("level");
  }

  function bindArtistEvents() {
    $("#add-artist").addEventListener("click", () => openEditor("artist"));
    $("#artist-grid").addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const { action, id } = button.dataset;
      if (action === "edit-artist") openEditor("artist", id);
      if (action === "delete-artist") deleteEntity("artist", id);
    });
    $("#artist-search").addEventListener("input", renderArtists);
    $("#genre-filter").addEventListener("change", renderArtists);
    $("#artist-sort").addEventListener("change", renderArtists);
  }

  function bindStageEvents() {
    $("#add-stage").addEventListener("click", () => openEditor("stage"));
    $("#stage-grid").addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      if (button.dataset.action === "edit-stage") openEditor("stage", button.dataset.id);
      if (button.dataset.action === "delete-stage") deleteEntity("stage", button.dataset.id);
    });
  }

  function changeDay(day) {
    state.day = day;
    $$(".day-tab").forEach(tab => {
      const active = Number(tab.dataset.day) === day;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    renderSchedule(detectConflicts());
  }

  function getTimeAtPosition(event, lane) {
    const rect = lane.getBoundingClientRect();
    return HOURS_START * 60
      + Math.round(((event.clientX - rect.left) / rect.width * (HOURS_END - HOURS_START) * 60) / 15) * 15;
  }

  function formatTime(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  function handleTimelineClick(event) {
    const slotButton = event.target.closest("[data-slot]");
    if (slotButton) {
      openEditor("slot", slotButton.dataset.slot);
      return;
    }

    const lane = event.target.closest(".lane-track");
    if (!lane) return;

    const minute = getTimeAtPosition(event, lane);
    const start = Math.max(HOURS_START * 60, Math.min(HOURS_END * 60 - 60, minute));
    openEditor("slot", null, {
      day: state.day,
      stageId: lane.dataset.stage,
      start: formatTime(start),
      end: formatTime(start + 60)
    });
  }

  function bindTimelineEvents() {
    const timeline = $("#timeline");
    let draggedId = null;

    timeline.addEventListener("click", handleTimelineClick);
    timeline.addEventListener("keydown", event => {
      if ((event.key !== "Enter" && event.key !== " ") || !event.target.classList.contains("lane-track")) return;
      event.preventDefault();
      openEditor("slot", null, { day: state.day, stageId: event.target.dataset.stage });
    });
    timeline.addEventListener("dragstart", event => {
      const button = event.target.closest("[data-slot]");
      if (!button) return;

      draggedId = button.dataset.slot;
      button.classList.add("is-dragging");
      event.dataTransfer.setData("text/plain", draggedId);
      event.dataTransfer.effectAllowed = "move";
    });
    timeline.addEventListener("dragend", event => {
      const button = event.target.closest("[data-slot]");
      if (button) button.classList.remove("is-dragging");
    });
    timeline.addEventListener("dragover", event => {
      if (event.target.closest(".lane-track")) event.preventDefault();
    });
    timeline.addEventListener("drop", event => {
      const lane = event.target.closest(".lane-track");
      if (!lane) return;

      event.preventDefault();
      const id = event.dataTransfer.getData("text/plain") || draggedId;
      const slot = state.data.slots.find(item => item.id === id);
      if (!slot) return;

      const duration = timeToMinutes(slot.end) - timeToMinutes(slot.start);
      const minute = getTimeAtPosition(event, lane);
      const start = Math.max(HOURS_START * 60, Math.min(HOURS_END * 60 - duration, minute));
      openEditor("slot", id, {
        stageId: lane.dataset.stage,
        day: state.day,
        start: formatTime(start),
        end: formatTime(start + duration)
      });
    });
  }

  function bindScheduleEvents() {
    $("#add-slot").addEventListener("click", () => openEditor("slot", null, { day: state.day }));
    $("#stage-filter").addEventListener("change", () => renderSchedule(detectConflicts()));
    $$(".day-tab").forEach(tab => tab.addEventListener("click", () => changeDay(Number(tab.dataset.day))));
    bindTimelineEvents();
    $("#conflict-list").addEventListener("click", event => {
      const button = event.target.closest(".jump-conflict");
      if (button) jumpToSlot(button.dataset.slot);
    });
  }

  function bindDialogEvents() {
    $("#editor-form").addEventListener("submit", saveEditor);
    $("#editor-form").addEventListener("input", updateSlotPreview);
    $("#editor-form").addEventListener("change", updateSlotPreview);
    $("#close-dialog").addEventListener("click", () => $("#editor-dialog").close());
    $("#cancel-dialog").addEventListener("click", () => $("#editor-dialog").close());
    $("#editor-dialog").addEventListener("click", event => {
      if (event.target === $("#editor-dialog")) $("#editor-dialog").close();
    });
  }

  function bindArcadeEvents() {
    $("#continue-game").addEventListener("click", () => {
      $("#game-over").hidden = true;
      $("#conflicts").scrollIntoView({ behavior: "smooth" });
      setTimeout(() => $(".jump-conflict")?.focus(), 400);
    });
    $("#sound-toggle").addEventListener("click", event => {
      state.soundOn = !state.soundOn;
      event.currentTarget.textContent = state.soundOn ? "SOUND" : "MUTE";
      event.currentTarget.setAttribute("aria-label", state.soundOn ? "Turn sound off" : "Turn sound on");
      event.currentTarget.title = state.soundOn ? "Sound on" : "Sound off";
      if (state.soundOn) playTone("coin");
    });
  }

  function resetDemoData() {
    if (!window.confirm("RESET ALL FESTIVAL DATA TO THE ORIGINAL DEMO LINEUP?")) return;

    state.data = seedData();
    state.day = 1;
    state.lastConflictCount = 0;
    state.unlocked.clear();
    saveState();
    render();
    showToast("DEMO DATA RESTORED");
  }

  function bindUtilityEvents() {
    $("#export-json").addEventListener("click", exportSchedule);
    $("#print-schedule").addEventListener("click", () => window.print());
    $("#reset-data").addEventListener("click", resetDemoData);
  }

  function bindKeyboardEvents() {
    const sequence = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
    let keyBuffer = [];

    document.addEventListener("keydown", event => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || $("#editor-dialog").open) return;

      keyBuffer = [...keyBuffer, event.key].slice(-sequence.length);
      const matches = sequence.every((key, index) => key.toLowerCase() === keyBuffer[index]?.toLowerCase());
      if (!matches) return;

      keyBuffer = [];
      confetti();
      showToast("KONAMI CODE — PIXEL PARTY!");
    });
  }

  function bindScrollEvents() {
    let scrollPending = false;
    window.addEventListener("scroll", () => {
      if (scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(() => { setLevelFromScroll(); scrollPending = false; });
    }, { passive: true });
    window.addEventListener("resize", setLevelFromScroll);
  }

  function bindEvents() {
    bindArtistEvents();
    bindStageEvents();
    bindScheduleEvents();
    bindDialogEvents();
    bindArcadeEvents();
    bindUtilityEvents();
    bindKeyboardEvents();
    bindScrollEvents();
  }

  function init() {
    saveState();
    bindEvents();
    render();
    setLevelFromScroll();
    const initialConflicts = detectConflicts().length;
    unlock("zero-conflicts", "ZERO CONFLICTS", state.data.slots.length > 0 && initialConflicts === 0);
  }
  init();
})();
