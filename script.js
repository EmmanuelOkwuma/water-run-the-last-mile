"use strict";

const LEVELS = [
  {
    number: 1,
    name: "THE FIRST CONNECTION",
    village: "Kijani Village",
    story: "Bring clean water to a village for the first time.",
    target: 150,
    budget: 600,
    duration: 90,
    sites: 3,
    stability: 6,
    emergencies: false,
    emergencyInterval: 0,
    buildings: ["pump", "filter", "pipes"],
    intro: "Build a pump, filtration system and pipe network to supply 150 residents.",
    steps: [
      "Click a construction site marked +.",
      "Build one pump, one filter and one pipe network.",
      "Keep full water access for 6 seconds."
    ],
    warning: "All three river components are required. Each site holds one building.",
    win: "Serve 150 residents and hold the system stable for 6 seconds."
  },
  {
    number: 2,
    name: "EXPANDING THE NETWORK",
    village: "Nuru Village",
    story: "Expand water access and respond to emergencies.",
    target: 250,
    budget: 850,
    duration: 120,
    sites: 4,
    stability: 12,
    emergencies: true,
    emergencyInterval: 28,
    buildings: ["well", "pump", "filter", "pipes"],
    intro: "Add a community well to the river system and supply 250 residents.",
    steps: [
      "Build pump, filter and pipes.",
      "Build a community well.",
      "Respond to emergencies and hold water access for 12 seconds."
    ],
    warning: "Repairs cost $75; safe shutdown costs 8 seconds.",
    win: "Serve 250 residents and hold the system stable for 12 seconds."
  },
  {
    number: 3,
    name: "THE LAST MILE",
    village: "Tumaini Valley",
    story: "Connect the valley with a complete resilient water system.",
    target: 350,
    budget: 1000,
    duration: 120,
    sites: 5,
    stability: 18,
    emergencies: true,
    emergencyInterval: 24,
    buildings: ["well", "pump", "filter", "pipes", "tank"],
    intro: "Combine the river network, well and storage tank to reach 350 residents.",
    steps: [
      "Build pump, filter and pipes.",
      "Add a community well and storage tank.",
      "Respond to emergencies and hold water access for 18 seconds."
    ],
    warning: "Stability resets if water access falls below the target.",
    win: "Serve 350 residents and hold the system stable for 18 seconds."
  }
];

const BUILDINGS = {
  well: {
    name: "Community Well",
    shortName: "WELL",
    cost: 200,
    capacity: 90,
    description: "Independently serves 90 residents."
  },
  pump: {
    name: "Water Pump",
    shortName: "PUMP",
    cost: 150,
    description: "Draws water from the river."
  },
  filter: {
    name: "Filtration System",
    shortName: "FILTER",
    cost: 180,
    description: "Makes river water safe."
  },
  pipes: {
    name: "Pipe Network",
    shortName: "PIPES",
    cost: 100,
    description: "Connects the water system."
  },
  tank: {
    name: "Storage Tank",
    shortName: "TANK",
    cost: 220,
    capacity: 60,
    description: "Adds 60 residents when the river system works."
  }
};

const BONUSES = [
  { type: "well", discount: 60 },
  { type: "pipes", discount: 40 },
  { type: "pump", discount: 50 },
  { type: "filter", discount: 30 },
  { type: "tank", discount: 70 }
];

const game = {
  levelIndex: 0,
  difficulty: "normal",
  budget: 0,
  timeLeft: 0,
  population: 0,
  buildings: {},
  selectedSite: null,
  running: false,
  paused: false,
  finished: false,
  timer: null,
  lastTick: 0,
  stableSeconds: 0,
  emergency: null,
  emergencyTimer: 0,
  nextEmergencyAt: 0,
  elapsed: 0,
  events: [],
  unlockedLevel: 1
};

// SOUND EFFECTS — Uses the browser's built-in audio system.
let audioContext;

function playSound(type) {
  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const sounds = {
      build: [
        [440, 0],
        [660, 0.12]
      ],
      emergency: [
        [330, 0],
        [220, 0.18]
      ],
      win: [
        [523, 0],
        [659, 0.12],
        [784, 0.24],
        [1047, 0.36]
      ]
    };

    const notes = sounds[type];
    if (!notes) return;

    notes.forEach(([frequency, delay]) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      const start = audioContext.currentTime + delay;

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start(start);
      oscillator.stop(start + 0.17);
    });
  } catch (error) {
    console.warn("Audio unavailable:", error);
  }
}
const id = x => document.getElementById(x);

const all = s => [...document.querySelectorAll(s)];

const set = (x, v) => {
  if (id(x)) id(x).textContent = v;
};

const show = x => id(x)?.classList.remove("hidden");

const hide = x => id(x)?.classList.add("hidden");

const money = x => "$" + Math.round(x).toLocaleString();

const time = x =>
  `${Math.floor(Math.max(0, Math.ceil(x)) / 60)}:${String(
    Math.max(0, Math.ceil(x)) % 60
  ).padStart(2, "0")}`;

const level = () => LEVELS[game.levelIndex];

const types = () => Object.values(game.buildings);

const has = x => types().includes(x);

const cost = (type, site) =>
  BUILDINGS[type].cost -
  (BONUSES[site]?.type === type ? BONUSES[site].discount : 0);

const complete = () =>
  ["pump", "filter", "pipes"].every(has);

const operational = () => complete() && !game.emergency;

function loadProgress() {
  try {
    game.unlockedLevel = Math.min(
      3,
      Math.max(
        1,
        Number(localStorage.getItem("waterRunUnlockedLevel")) || 1
      )
    );
  } catch { }
}

function saveProgress() {
  try {
    localStorage.setItem(
      "waterRunUnlockedLevel",
      game.unlockedLevel
    );
  } catch { }
}

function stopTimer() {
  if (game.timer !== null) {
    clearInterval(game.timer);
    game.timer = null;
  }
}

function prepareLevel(index) {
  stopTimer();

  game.levelIndex = index;

  const l = level();

  Object.assign(game, {
    budget: l.budget,
    timeLeft: l.duration,
    population: 0,
    buildings: {},
    selectedSite: null,
    running: false,
    paused: false,
    finished: false,
    stableSeconds: 0,
    emergency: null,
    emergencyTimer: 0,
    nextEmergencyAt: l.emergencyInterval,
    elapsed: 0,
    events: []
  });

  all(".house").forEach((h, i) => {
    h.style.display = i < l.sites ? "" : "none";
    h.disabled = i >= l.sites;

    h.classList.remove("constructed", "connected");

    h.querySelector(".house-marker").textContent = "+";
    h.querySelector(".structure-slot").innerHTML = "";
  });

  id("pipe-network").innerHTML = "";

  [
    "construction-menu",
    "contamination-alert",
    "history-overlay",
    "end-screen"
  ].forEach(hide);

  set("level-name", `LEVEL ${l.number} — ${l.name}`);
  set("level-objective", `GOAL: ${l.target} RESIDENTS`);

  document.querySelector(".village-label strong").textContent =
    l.village;

  set("village-pop", `${l.target} RESIDENTS`);

  renderBriefing();
  updatePopulation();
  updateStability();
  renderEvents();

  setGuide(
    "MISSION READY",
    "Read your briefing, then begin building."
  );

  renderLevelCards();
}

function renderLevelCards() {
  id("level-cards").innerHTML = LEVELS.map(
    (l, i) => `
      <button
        class="level-card ${i === game.levelIndex ? "selected" : ""}"
        data-level="${i}"
        ${l.number > game.unlockedLevel ? "disabled" : ""}
      >
        <small>LEVEL ${l.number}</small>
        <strong>${l.name}</strong>
        <span>${l.target} residents</span>
        <em>
          ${l.number > game.unlockedLevel
        ? "LOCKED"
        : i === game.levelIndex
          ? "SELECTED"
          : "PLAY"
      }
        </em>
      </button>
    `
  ).join("");

  all("[data-level]").forEach(b => {
    b.onclick = () => {
      prepareLevel(Number(b.dataset.level));

      id("start-action").scrollIntoView({
        block: "nearest",
        behavior: "smooth"
      });
    };
  });
}

function renderBriefing() {
  const l = level();

  set("briefing-intro", l.intro);
  set("briefing-target", `${l.target} people`);
  set("briefing-budget", money(l.budget));
  set("briefing-time", time(l.duration));
  set("briefing-warning", l.warning);
  set("briefing-win", l.win);
  set("level-story", l.story);

  id("briefing-steps").innerHTML = l.steps
    .map(s => `<li>${s}</li>`)
    .join("");

  id("briefing-buildings").innerHTML = l.buildings
    .map(
      t => `
        <div class="briefing-building">
          <strong>
            ${BUILDINGS[t].name} — ${money(BUILDINGS[t].cost)}
          </strong>
          <span>${BUILDINGS[t].description}</span>
        </div>
      `
    )
    .join("");
}

function startLevel() {
  if (game.running) return;

  hide("start-screen");
  hide("end-screen");

  game.running = true;
  game.finished = false;
  game.lastTick = performance.now();

  addEvent(`Level ${level().number} started.`);

  setGuide(
    "START BUILDING",
    "Click a + on any construction site."
  );

  stopTimer();

  game.timer = setInterval(tick, 100);
}

function tick() {
  if (!game.running || game.paused || game.finished) return;

  const now = performance.now();
  const dt = Math.min(0.25, (now - game.lastTick) / 1000);

  game.lastTick = now;
  game.elapsed += dt;
  game.timeLeft = Math.max(0, game.timeLeft - dt);

  updateEmergency(dt);
  updatePopulation();

  game.stableSeconds =
    game.population >= level().target
      ? game.stableSeconds + dt
      : 0;

  updateStability();

  if (game.stableSeconds >= level().stability) {
    endLevel(true);
    return;
  }

  if (game.timeLeft <= 0) {
    endLevel(
      false,
      "Time ran out before the water supply stabilized."
    );
    return;
  }

  updateStats();
}

function updatePopulation() {
  let served = has("well") ? 90 : 0;

  if (operational()) {
    served += 220 + (has("tank") ? 60 : 0);
  }

  game.population = Math.min(level().target, served);

  updateStats();
  updateAccessRing();
  updateMilestones();
  updateSystemStatus();

  all(".house").forEach((h, i) => {
    const t = game.buildings[i];

    h.classList.toggle(
      "connected",
      !!t && (t === "well" || operational())
    );
  });
}

function updateStats() {
  set("budget", money(game.budget));

  set(
    "served",
    `${game.population} / ${level().target}`
  );

  set("timer", time(game.timeLeft));

  set(
    "reserve-warning",
    game.budget < 75
      ? "LOW FUNDS — SAFE SHUTDOWN AVAILABLE"
      : "Repair reserve: $75"
  );

  id("reserve-warning").classList.toggle(
    "low-reserve",
    game.budget < 75
  );
}

function updateAccessRing() {
  const pct = Math.min(
    100,
    Math.round(
      (game.population / level().target) * 100
    )
  );

  const ring = id("access-ring");

  ring.style.setProperty("--progress", pct);

  ring.setAttribute("aria-valuenow", pct);

  ring.classList.toggle("complete", pct === 100);

  set("progress-percent", `${pct}%`);

  set(
    "progress-count",
    `${game.population} / ${level().target}`
  );

  set(
    "progress-description",
    pct === 100
      ? "Full clean-water access achieved"
      : `${game.population} residents supplied`
  );
}

function updateSystemStatus() {
  const el = id("system-status");

  el.className = "";

  if (game.emergency) {
    el.textContent = "EMERGENCY";
    el.classList.add("status-warning");
  } else if (operational()) {
    el.textContent = "OPERATIONAL";
    el.classList.add("status-good");
  } else if (types().length) {
    el.textContent = "UNDER CONSTRUCTION";
    el.classList.add("status-warning");
  } else {
    el.textContent = "OFFLINE";
    el.classList.add("status-offline");
  }
}

function updateMilestones() {
  id("milestones").innerHTML = [
    ...level().buildings.map(t => ({
      text: `Build ${BUILDINGS[t].name}`,
      done: has(t)
    })),
    {
      text: `Serve ${level().target} residents`,
      done: game.population >= level().target
    }
  ]
    .map(
      m => `
        <div class="milestone ${m.done ? "done" : ""}">
          ${m.done ? "✓" : "○"} ${m.text}
        </div>
      `
    )
    .join("");
}

function updateStability() {
  set(
    "stability",
    game.population < level().target
      ? "STABILITY: Waiting for full water access"
      : `STABILITY: ${Math.max(
        0,
        level().stability - game.stableSeconds
      ).toFixed(1)}s remaining`
  );
}

function selectSite(i) {
  if (
    !game.running ||
    game.finished ||
    game.paused ||
    game.buildings[i] ||
    i >= level().sites
  ) {
    return;
  }

  game.selectedSite = i;

  set("selected-house-title", `BUILD AT SITE ${i + 1}`);
  set("menu-budget", money(game.budget));

  id("construction-options").innerHTML = level().buildings
    .map(t => {
      const c = cost(t, i);
      const discount = BUILDINGS[t].cost - c;

      const disabled = has(t) || c > game.budget;

      return `
        <button
          class="construction-option ${discount ? "recommended" : ""
        }"
          data-building="${t}"
          ${disabled ? "disabled" : ""}
        >
          <span class="option-name">
            <strong>${BUILDINGS[t].name}</strong>
            <small>
              ${has(t)
          ? "Already built"
          : c > game.budget
            ? "Insufficient funds"
            : BUILDINGS[t].description +
            (discount
              ? ` — SAVE ${money(discount)} HERE`
              : "")
        }
            </small>
          </span>

          <span class="option-cost">
            ${money(c)}
          </span>
        </button>
      `;
    })
    .join("");

  all("[data-building]").forEach(b => {
    b.onclick = () =>
      constructBuilding(b.dataset.building, i);
  });

  show("construction-menu");
}

function constructBuilding(t, i) {
  if (
    !game.running ||
    game.finished ||
    game.paused ||
    game.buildings[i] ||
    has(t) ||
    !level().buildings.includes(t) ||
    game.budget < cost(t, i)
  ) {
    return;
  }

  const c = cost(t, i);

  game.budget -= c;
  game.buildings[i] = t;
  checkConstructionMilestones();

  playSound("build");

  hide("construction-menu");

  const h = all(".house")[i];

  h.classList.add("constructed");

  h.querySelector(".house-marker").textContent = "✓";

  h.querySelector(".structure-slot").innerHTML = `
    ${buildingSVG(t)}
    <span class="structure-label">
      ${BUILDINGS[t].shortName}
    </span>
  `;

  updatePopulation();
  updatePipeNetwork();

  addEvent(
    `${BUILDINGS[t].name} built for ${money(c)}.`,
    "success"
  );

  floating(`-${money(c)}`, h);

  setGuide(
    game.population >= level().target
      ? "WATER ACCESS COMPLETE"
      : "CONSTRUCTION COMPLETE",
    game.population >= level().target
      ? `Hold full access for ${level().stability} seconds.`
      : `${BUILDINGS[t].name} installed. Continue building.`
  );

  if (!canStillReachTarget()) {
    setGuide(
      "LAYOUT WARNING",
      "This layout cannot complete all required buildings with your remaining budget. Restart and try different sites."
    );
  }
}

function buildingSVG(type) {
  const icons = {
    well: `
      <ellipse cx="40" cy="48" rx="24" ry="14" fill="#a9a9a9"/>
      <ellipse cx="40" cy="43" rx="18" ry="9" fill="#2faed3"/>
      <path
        d="M18 25 L40 10 L62 25"
        fill="none"
        stroke="#905a35"
        stroke-width="8"
      />
    `,

    pump: `
      <rect
        x="15" y="34" width="50" height="29"
        rx="5" fill="#7e9da8"
      />
      <circle cx="40" cy="46" r="13" fill="#226f92"/>
      <circle cx="40" cy="46" r="7" fill="#6fd9ef"/>
      <path
        d="M40 34 V15 H65"
        stroke="#657d86"
        stroke-width="9"
        fill="none"
      />
    `,

    filter: `
      <rect
        x="12" y="18" width="24" height="47"
        rx="8" fill="#b2c9d0"
      />
      <rect
        x="44" y="11" width="24" height="54"
        rx="8" fill="#829da8"
      />
      <rect
        x="17" y="37" width="14" height="19"
        fill="#38a5d0"
      />
      <rect
        x="49" y="30" width="14" height="26"
        fill="#38a5d0"
      />
      <path
        d="M36 44 H44"
        stroke="#4a6976"
        stroke-width="7"
      />
    `,

    pipes: `
      <path
        d="M12 57 H34 V27 H67"
        stroke="#506e7b"
        stroke-width="17"
        fill="none"
        stroke-linejoin="round"
      />
      <path
        d="M12 57 H34 V27 H67"
        stroke="#7dd7f3"
        stroke-width="7"
        fill="none"
        stroke-linejoin="round"
      />
    `,

    tank: `
      <rect
        x="20" y="15" width="40" height="48"
        rx="10" fill="#92b3c0"
      />
      <ellipse
        cx="40" cy="15" rx="20" ry="8"
        fill="#d3e3e8"
      />
      <rect
        x="25" y="35" width="30" height="18"
        rx="4" fill="#41afd5"
      />
    `
  };

  return `
    <svg viewBox="0 0 80 80" aria-hidden="true">
      ${icons[type]}
    </svg>
  `;
}

function updatePipeNetwork() {
  const svg = id("pipe-network");
  const world = id("game-world");

  svg.innerHTML = "";

  const w = world.clientWidth;
  const h = world.clientHeight;

  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const wr = world.getBoundingClientRect();
  const rr = id("river").getBoundingClientRect();

  const origin = {
    x: rr.left - wr.left + rr.width * 0.48,
    y: rr.top - wr.top + rr.height * 0.48
  };

  const point = t => {
    const index = Object.keys(game.buildings).find(
      i => game.buildings[i] === t
    );

    if (index === undefined) return null;

    const rect = all(".house")[Number(index)]
      .querySelector(".structure-slot")
      .getBoundingClientRect();

    return {
      x: rect.left - wr.left + rect.width / 2,
      y: rect.top - wr.top + rect.height / 2
    };
  };

  const nodes = [
    origin,
    ...["pump", "filter", "pipes", "tank"]
      .map(point)
      .filter(Boolean)
  ];

  if (nodes.length < 2) return;

  const ns = "http://www.w3.org/2000/svg";

  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];

    const d = `
      M ${a.x} ${a.y}
      L ${b.x} ${a.y}
      L ${b.x} ${b.y}
    `;

    const classes = [
      "pipe-shadow",
      "pipe-body",
      ...(operational() ? ["pipe-flow"] : [])
    ];

    for (const cls of classes) {
      const path = document.createElementNS(ns, "path");

      path.setAttribute("d", d);
      path.setAttribute("class", cls);

      svg.appendChild(path);
    }
  }
}

function canStillReachTarget() {
  const missing = level().buildings.filter(t => !has(t));

  const sites = Array.from(
    { length: level().sites },
    (_, i) => i
  ).filter(i => !game.buildings[i]);

  if (missing.length > sites.length) return false;

  function search(i, budget, free) {
    if (i === missing.length) return true;

    return free.some(
      s =>
        cost(missing[i], s) <= budget &&
        search(
          i + 1,
          budget - cost(missing[i], s),
          free.filter(x => x !== s)
        )
    );
  }

  return search(0, game.budget, sites);
}

function updateEmergency(dt) {
  if (!level().emergencies) return;

  if (game.emergency) {
    game.emergencyTimer -= dt;

    id("contamination-progress").style.width = `${Math.max(0, (game.emergencyTimer / 15) * 100)
      }%`;

    if (game.emergencyTimer <= 0) {
      endLevel(
        false,
        "Contamination was not resolved in time."
      );
    }

    return;
  }

  if (
    complete() &&
    game.population < level().target &&
    game.elapsed >= game.nextEmergencyAt
  ) {
    triggerEmergency();
  }
}

function triggerEmergency() {
  if (game.emergency || game.finished) return;

  game.emergency = {
    type: "contamination"
  };

  playSound("emergency");

  game.emergencyTimer = 15;
  game.stableSeconds = 0;

  set(
    "contamination-text",
    "Contamination interrupted river water. Repair for $75 or safely shut down for an 8-second time penalty."
  );

  id("fix-contamination").disabled = game.budget < 75;

  show("contamination-alert");

  addEvent(
    "EMERGENCY: Water contamination detected.",
    "warning"
  );

  updatePopulation();
  updatePipeNetwork();
}

function resolveEmergency() {
  game.emergency = null;
  game.emergencyTimer = 0;

  game.nextEmergencyAt =
    game.elapsed + level().emergencyInterval;

  game.stableSeconds = 0;

  hide("contamination-alert");

  updatePopulation();
  updatePipeNetwork();
  updateStability();
}

function repairEmergency() {
  if (!game.emergency || game.budget < 75) return;

  game.budget -= 75;

  resolveEmergency();

  addEvent(
    "Emergency repaired for $75.",
    "success"
  );
}

function safeShutdown() {
  if (!game.emergency) return;

  game.timeLeft = Math.max(0, game.timeLeft - 8);

  resolveEmergency();

  addEvent(
    "Safe shutdown: 8 seconds deducted.",
    "warning"
  );
}

function addEvent(message, type = "info") {
  game.events.unshift({
    time: time(game.elapsed),
    message,
    type
  });

  renderEvents();
}

function renderEvents() {
  const html = e => `
    <div class="log-entry ${e.type}">
      <span class="log-time">${e.time}</span>
      <p>${e.message}</p>
    </div>
  `;

  id("recent-events").innerHTML = game.events
    .slice(0, 4)
    .map(html)
    .join("");

  id("mission-log").innerHTML = game.events
    .map(html)
    .join("");
}

function setGuide(title, message) {
  set("guide-title", title);
  set("guide-text", message);
}

function floating(message, house) {
  const rect = house.getBoundingClientRect();

  const world = id("game-world").getBoundingClientRect();

  const el = document.createElement("div");

  el.className = "float-notification";
  el.textContent = message;

  el.style.left = `${rect.left - world.left + 20}px`;
  el.style.top = `${rect.top - world.top}px`;

  id("floating-notifications").appendChild(el);

  setTimeout(() => el.remove(), 1800);
}

function endLevel(success, reason = "") {
  if (game.finished) return;

  game.finished = true;
  game.running = false;

  stopTimer();

  hide("contamination-alert");
  hide("construction-menu");

  if (success && game.levelIndex < 2) {
    game.unlockedLevel = Math.max(
      game.unlockedLevel,
      game.levelIndex + 2
    );

    saveProgress();
  }

  set(
    "end-badge",
    success ? "MISSION COMPLETE" : "MISSION FAILED"
  );

  set(
    "end-title",
    success ? "VILLAGE SUPPLIED" : "MISSION FAILED"
  );

  set(
    "end-message",
    success
      ? `You supplied ${level().target} residents in ${level().village} and passed the stability test.`
      : reason
  );

  set(
    "final-score",
    `${game.population} / ${level().target} RESIDENTS`
  );

  set(
    "play-again-btn",
    success && game.levelIndex < 2
      ? "CONTINUE TO NEXT LEVEL →"
      : success
        ? "PLAY AGAIN →"
        : "RETRY MISSION →"
  );

  addEvent(
    success
      ? "MISSION COMPLETE"
      : `MISSION FAILED: ${reason}`,
    success ? "success" : "warning"
  );

  show("end-screen");

  if (success) {
    playSound("win");
    confetti();
  }
}

function handleEndAction() {
  const next =
    game.population >= level().target &&
      game.stableSeconds >= level().stability &&
      game.levelIndex < 2
      ? game.levelIndex + 1
      : game.levelIndex;

  prepareLevel(next);

  hide("end-screen");
  show("start-screen");
}

function confetti() {
  const c = id("confetti-container");

  c.innerHTML = "";

  for (let i = 0; i < 60; i++) {
    const p = document.createElement("div");

    p.className = "confetti";
    p.style.left = `${Math.random() * 100}%`;

    p.style.background = [
      "#ffc907",
      "#159bd5",
      "#ffffff",
      "#54c46b"
    ][i % 4];

    p.style.animationDelay = `${Math.random() * 0.8}s`;

    c.appendChild(p);
  }

  setTimeout(() => {
    c.innerHTML = "";
  }, 5000);
}

function restart() {
  if (
    game.running &&
    !confirm("Restart this mission?")
  ) {
    return;
  }

  prepareLevel(game.levelIndex);

  show("start-screen");
}

function togglePanel(name, button) {
  id(name).classList.toggle("collapsed");

  const collapsed = id(name).classList.contains("collapsed");

  button.textContent = collapsed ? "+" : "−";

  button.setAttribute(
    "aria-expanded",
    String(!collapsed)
  );
}

function initializeGame() {
  loadProgress();
  all(".difficulty-btn").forEach(button => {
    button.addEventListener("click", () => {
      game.difficulty = button.dataset.difficulty;

      all(".difficulty-btn").forEach(btn => {
        btn.classList.toggle(
          "selected",
          btn === button
        );
      });
    });
  });

  all(".house").forEach((h, i) => {
    h.addEventListener("click", () => selectSite(i));
  });

  id("start-btn").onclick = startLevel;

  id("close-menu").onclick = () =>
    hide("construction-menu");

  id("reset-btn").onclick = restart;

  id("levels-btn").onclick = restart;

  id("play-again-btn").onclick = handleEndAction;

  id("fix-contamination").onclick = repairEmergency;

  id("safe-shutdown").onclick = safeShutdown;

  id("history-btn").onclick = () =>
    show("history-overlay");

  id("close-history").onclick = () =>
    hide("history-overlay");

  id("objectives-toggle").onclick = e =>
    togglePanel("objectives-panel", e.currentTarget);

  id("events-toggle").onclick = e =>
    togglePanel("events-panel", e.currentTarget);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      hide("construction-menu");
      hide("history-overlay");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (game.running) {
      game.paused = document.hidden;
      game.lastTick = performance.now();
    }
  });

  window.addEventListener("resize", () => {
    if (types().length) {
      updatePipeNetwork();
    }
  });

  prepareLevel(0);

  show("start-screen");

  addEvent("Welcome to Water Run.");
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeGame
  );
} else {
  initializeGame();
}

// Project 6 LevelUp: construction milestone notifications
const constructionMilestones = [
  "First construction complete!",
  "Second construction complete!",
  "Third construction complete!",
  "Fourth construction complete!",
  "Fifth construction complete!"
];

let lastConstructionLevel = null;
let lastConstructionCount = 0;
let constructionMilestoneTimer = null;

function checkConstructionMilestones() {
  const currentLevel = game.level;
  const count = Object.values(game.buildings).filter(Boolean).length;
  const required = level().sites;

  if (
    lastConstructionLevel !== currentLevel ||
    count < lastConstructionCount
  ) {
    lastConstructionLevel = currentLevel;
    lastConstructionCount = 0;
  }

  if (count <= lastConstructionCount) return;

  lastConstructionCount = count;

  const message = count >= required
    ? `All ${required} construction sites completed!`
    : constructionMilestones[count - 1] + ` ${required - count} remaining.`;

  const existing = document.getElementById("construction-milestone");
  if (existing) existing.remove();

  if (constructionMilestoneTimer) {
    clearTimeout(constructionMilestoneTimer);
  }

  const notification = document.createElement("div");
  notification.id = "construction-milestone";
  notification.textContent = message;

  Object.assign(notification.style, {
    position: "fixed",
    top: "90px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#FFC907",
    color: "#111",
    padding: "14px 24px",
    borderRadius: "12px",
    fontWeight: "700",
    fontSize: "15px",
    zIndex: "99999",
    boxShadow: "0 8px 24px rgba(0,0,0,0.25)"
  });

  document.body.appendChild(notification);

  constructionMilestoneTimer = setTimeout(() => {
    notification.remove();
  }, 2200);
}
