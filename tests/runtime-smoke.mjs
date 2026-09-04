import { readFileSync } from "node:fs";
import vm from "node:vm";

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  toggle(name, force) {
    if (force === true) this.values.add(name);
    else if (force === false) this.values.delete(name);
    else if (this.values.has(name)) this.values.delete(name);
    else this.values.add(name);
    return this.values.has(name);
  }
  contains(name) { return this.values.has(name); }
}

const context2d = new Proxy({}, {
  get(target, property) {
    if (!(property in target)) target[property] = () => {};
    return target[property];
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
});

class FakeElement {
  constructor(id) {
    this.id = id;
    this.style = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.textContent = "";
    this.children = [];
    this.dataset = {};
    this.disabled = false;
    this._innerHTML = "";
    this.width = id === "minimap" ? 224 : 800;
    this.height = id === "minimap" ? 132 : 600;
  }
  getContext() { return context2d; }
  getBoundingClientRect() {
    if (this.id === "joystick") return { left: 10, top: 450, width: 138, height: 138 };
    return { left: 0, top: 0, width: 800, height: 600 };
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  appendChild(child) { this.children.push(child); return child; }
  click() { this.listeners.get("click")?.({ target: this, preventDefault() {} }); }
  set innerHTML(value) { this._innerHTML = value; this.children = []; }
  get innerHTML() { return this._innerHTML; }
  setAttribute() {}
  setPointerCapture() {}
}

const elements = new Map();
const initiallyHidden = new Set(["dialogue", "phone", "mission-complete", "action-panel", "separos", "news-flash"]);
const elementFor = (selector) => {
  const id = selector.startsWith("#") ? selector.slice(1) : selector;
  if (!elements.has(id)) {
    const element = new FakeElement(id);
    if (initiallyHidden.has(id)) element.classList.add("hidden");
    elements.set(id, element);
  }
  return elements.get(id);
};

let nextFrame = null;
const windowListeners = new Map();
const localStore = new Map();
localStore.set("eve-gta-save-v2", JSON.stringify({
  version: 2,
  scene: "city",
  stage: 0,
  money: 25,
  bank: 500,
  health: 100,
  armor: 0,
  energy: 100,
  time: 730,
  day: 0,
  player: { x: 3375, y: 760, angle: 0, radius: 15, punch: 0, invulnerable: 0, caguamaVisible: 0 },
  truck: { x: 1840, y: 900, angle: 0, speed: 0, radius: 31, health: 100, fuel: 100, destroyed: false, engine: 0, handling: 0, armor: 0, paint: "#194c38" },
  stif: { x: 3375, y: 760, angle: 0 },
}));
const sandbox = {
  console,
  Math,
  JSON,
  Date,
  performance,
  document: { querySelector: elementFor, createElement: (tag) => new FakeElement(tag) },
  localStorage: {
    getItem: (key) => localStore.get(key) ?? null,
    setItem: (key, value) => localStore.set(key, value),
    removeItem: (key) => localStore.delete(key),
  },
  window: {
    __EVE_GTA_TESTING__: true,
    devicePixelRatio: 1,
    addEventListener: (type, callback) => windowListeners.set(type, callback),
    setTimeout,
    clearTimeout,
    confirm: () => true,
  },
  requestAnimationFrame: (callback) => { nextFrame = callback; return 1; },
  setTimeout,
  clearTimeout,
};
sandbox.window.window = sandbox.window;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.performance = performance;
sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;

const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");
vm.runInNewContext(source, sandbox, { filename: "game.js" });

if (typeof nextFrame !== "function") throw new Error("El juego no inició su ciclo de animación");
const firstFrame = nextFrame;
firstFrame(performance.now() + 16);

const start = elementFor("#start-btn");
if (typeof start.listeners.get("click") !== "function") throw new Error("El botón JUGAR no quedó conectado");
start.listeners.get("click")();

const secondFrame = nextFrame;
secondFrame(performance.now() + 32);

if (!elementFor("#start-screen").classList.contains("dismissed")) throw new Error("El botón JUGAR no cerró la portada");
if (!elementFor("#objective-text").textContent.includes("JARDÍN DEL PISTO")) throw new Error("No apareció el objetivo inicial del Jardín del Pisto");

const use = elementFor("#use-btn");
if (typeof use.listeners.get("pointerdown") !== "function") throw new Error("El botón USAR no quedó conectado");
use.listeners.get("pointerdown")({ preventDefault() {} });
if (!elementFor("#dialogue-text").textContent.includes("Colima")) throw new Error("Stif no activó el diálogo del tutorial");
for (let index = 0; index < 4; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (!elementFor("#objective-text").textContent.includes("PELÍCANO")) throw new Error("El diálogo de Stif no abrió el recorrido del tutorial");
if (elementFor("#money").textContent !== "$825") throw new Error("Stif no entregó los $800 de prueba");

sandbox.window.__EVE_GTA_DEBUG__.state.player.x = 2828;
sandbox.window.__EVE_GTA_DEBUG__.state.player.y = 1418;
use.listeners.get("pointerdown")({ preventDefault() {} });
if (!elementFor("#objective-text").textContent.includes("CAGUAMA")) throw new Error("Entrar a El Pelícano no activó la compra del tutorial");

sandbox.window.__EVE_GTA_DEBUG__.state.player.x = 450;
sandbox.window.__EVE_GTA_DEBUG__.state.player.y = 205;
use.listeners.get("pointerdown")({ preventDefault() {} });
const panelActions = elementFor("#panel-actions");
if (panelActions.children.length < 4) throw new Error("El mostrador de El Pelícano no abrió sus compras");
panelActions.children[0].click();
elementFor("#panel-actions").children[1].click();
if (!elementFor("#objective-text").textContent.includes("CAJERO")) throw new Error("Comprar caguama y Takis no activó el tutorial bancario");

const debug = sandbox.window.__EVE_GTA_DEBUG__;
if (debug.urbanBuildings.length < 24) throw new Error(`La trama urbana quedó demasiado vacía: ${debug.urbanBuildings.length} edificios`);
if (debug.roadIntersections.length < 4) throw new Error("El mapa no generó suficientes cruces viales legibles");
if (debug.streetLights.length < 30) throw new Error("El alumbrado público no cubre las avenidas principales");
if (debug.traffic.length < 20) throw new Error("La densidad de tráfico quedó por debajo del objetivo");
if (!debug.npcs.slice(0, 20).every((npc) => npc.home && npc.work && npc.leisure && npc.role)) throw new Error("Los civiles no recibieron rutinas completas");
const sampleBuilding = debug.urbanBuildings[0];
const sampleCenter = { x: sampleBuilding.x + sampleBuilding.w / 2, y: sampleBuilding.y + sampleBuilding.h / 2 };
if (!debug.cityBlocked(sampleCenter.x, sampleCenter.y, 5, true)) throw new Error("Los nuevos edificios no tienen colisión");
if (!debug.lineOfSightBlocked(sampleBuilding.x - 20, sampleCenter.y, sampleBuilding.x + sampleBuilding.w + 20, sampleCenter.y)) throw new Error("Los edificios no bloquean disparos");
const closePanel = () => elementFor("#panel-close").click();
closePanel();
debug.state.player.x = 450;
debug.state.player.y = 595;
use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.player.x = 4465;
debug.state.player.y = 2092;
use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.player.x = 450;
debug.state.player.y = 205;
use.listeners.get("pointerdown")({ preventDefault() {} });
elementFor("#panel-actions").children[0].click();
if (!elementFor("#objective-text").textContent.includes("RIFA")) throw new Error(`Retirar efectivo no activó la rifa (stage ${debug.state.stage}, scene ${debug.state.scene}, objetivo ${elementFor("#objective-text").textContent}, panel ${elementFor("#panel-title").textContent})`);

closePanel();
debug.state.player.x = 450;
debug.state.player.y = 595;
use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.player.x = 3388;
debug.state.player.y = 1995;
use.listeners.get("pointerdown")({ preventDefault() {} });
elementFor("#panel-actions").children[0].click();
if (!elementFor("#objective-text").textContent.includes("EMPEÑO")) throw new Error("La rifa de prueba no entregó premio vendible");

closePanel();
debug.state.player.x = 3905;
debug.state.player.y = 2235;
use.listeners.get("pointerdown")({ preventDefault() {} });
elementFor("#panel-actions").children[0].click();
if (!elementFor("#objective-text").textContent.includes("TUNEAR")) throw new Error("Empeñar el premio no activó el taller");

closePanel();
debug.state.player.x = 4810;
debug.state.player.y = 2685;
use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.player.x = 450;
debug.state.player.y = 205;
use.listeners.get("pointerdown")({ preventDefault() {} });
elementFor("#panel-actions").children[1].click();
if (!elementFor("#objective-text").textContent.includes("ARRANCÓN")) throw new Error("Tunear la troca no activó los arrancones");

closePanel();
debug.state.player.x = 450;
debug.state.player.y = 595;
use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.inVehicle = true;
debug.state.vehicleKind = "truck";
debug.state.truck.x = 5365;
debug.state.truck.y = 3455;
debug.state.player.x = 5365;
debug.state.player.y = 3455;
use.listeners.get("pointerdown")({ preventDefault() {} });
elementFor("#panel-actions").children[0].click();
let simulatedNow = performance.now() + 100;
for (const point of debug.raceRoute.slice(1)) {
  debug.state.truck.x = point.x;
  debug.state.truck.y = point.y;
  simulatedNow += 50;
  nextFrame(simulatedNow);
}
if (!elementFor("#objective-text").textContent.includes("JARDÍN DEL PISTO")) throw new Error("Terminar la carrera no activó el regreso al Jardín");

debug.state.truck.x = 3360;
debug.state.truck.y = 865;
debug.state.player.x = 3360;
debug.state.player.y = 865;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 4; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (!elementFor("#objective-text").textContent.includes("CHOLOS")) throw new Error("El regreso al Jardín no inició la pelea");

for (const npc of debug.tutorialCholos) {
  npc.status = "knocked";
  npc.stunned = 18;
}
simulatedNow += 50;
nextFrame(simulatedNow);
if (!elementFor("#objective-text").textContent.includes("HUIR")) throw new Error("Noquear a los cholos no inició la huida");

debug.state.inVehicle = true;
debug.state.vehicleKind = "truck";
debug.state.truck.x = 2240;
debug.state.truck.y = 3150;
simulatedNow += 50;
nextFrame(simulatedNow);
for (let index = 0; index < 3; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (!elementFor("#objective-text").textContent.includes("ROCHI")) throw new Error("La huida no cerró el tutorial con Stif");

debug.state.inVehicle = false;
debug.state.player.x = debug.state.rochi.x;
debug.state.player.y = debug.state.rochi.y;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 3; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (!elementFor("#objective-text").textContent.includes("FEDE")) throw new Error("Rochi no abrió la misión del Sentra de Fede");
if (!debug.state.didiUnlocked) throw new Error("Rochi no desbloqueó Didi Comida");

for (let index = 0; index < 4; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.player.x = debug.state.fede.x;
debug.state.player.y = debug.state.fede.y;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 4; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (!elementFor("#objective-text").textContent.includes("LOTE")) throw new Error("Fede no reveló la ubicación del Sentra");

debug.state.player.x = 1210;
debug.state.player.y = 3260;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 3; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (debug.storyEnemies.length !== 5 || !elementFor("#objective-text").textContent.includes("CHOLOS")) throw new Error("El lote no inició la pelea por el Sentra");
for (const npc of debug.storyEnemies) {
  npc.status = "knocked";
  npc.stunned = 18;
}
simulatedNow += 50;
nextFrame(simulatedNow);
if (!debug.state.story.fedeCar || !elementFor("#objective-text").textContent.includes("NISSAN SENTRA")) throw new Error("La pelea no liberó el Nissan Sentra 2000");

debug.state.player.x = debug.state.story.fedeCar.x;
debug.state.player.y = debug.state.story.fedeCar.y;
use.listeners.get("pointerdown")({ preventDefault() {} });
if (debug.state.vehicleKind !== "fede" || debug.state.wanted !== 2) throw new Error("Robar el Sentra no activó las dos estrellas obligatorias");
debug.state.wanted = 0;
simulatedNow += 50;
nextFrame(simulatedNow);
if (debug.state.wanted !== 2) throw new Error("La búsqueda del Sentra bajó de las dos estrellas obligatorias antes de entregarlo");
const moneyBeforeFede = debug.state.money;
const rochiBeforeFede = debug.state.rochi.cash;
debug.state.story.fedeCar.x = 5005;
debug.state.story.fedeCar.y = 1050;
simulatedNow += 50;
nextFrame(simulatedNow);
if (debug.state.money !== moneyBeforeFede + 4000) throw new Error("Fede no mostró el pago bruto de $4,000 durante la cinemática");
for (let index = 0; index < 4; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (debug.state.money !== moneyBeforeFede + 2000) throw new Error("Rochi no descontó exactamente la mitad de la recompensa de Fede");
if (debug.state.rochi.cash !== rochiBeforeFede + 2000) throw new Error("La mitad de la recompensa no llegó a la cuenta secreta de Rochi");
const moneyAfterFede = debug.state.money;
const rochiAfterFede = debug.state.rochi.cash;
if (debug.settleFedeReward() !== false || debug.state.money !== moneyAfterFede || debug.state.rochi.cash !== rochiAfterFede) throw new Error("La recompensa de Fede puede cobrarse dos veces");
if (!elementFor("#objective-text").textContent.includes("CBTIS 19")) throw new Error("Devolver el Sentra no abrió la misión Faltistas");

debug.state.player.x = 5380;
debug.state.player.y = 1565;
use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.player.x = 450;
debug.state.player.y = 205;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 5; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (debug.storyEnemies.length !== 7 || !elementFor("#objective-text").textContent.includes("CERTIFICADO")) throw new Error("El CBTis 19 no inició la pelea contra los profesores");
for (const npc of debug.storyEnemies) {
  npc.status = "knocked";
  npc.stunned = 18;
}
simulatedNow += 50;
nextFrame(simulatedNow);
for (let index = 0; index < 4; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (!debug.state.story.completed.cbtis || !debug.state.story.corralonUnlocked) throw new Error("Faltistas no desbloqueó la moto de Rochi");

debug.state.player.x = 5910;
debug.state.player.y = 3715;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 3; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
for (const valve of debug.state.story.valves) {
  debug.state.player.x = valve.x;
  debug.state.player.y = valve.y;
  use.listeners.get("pointerdown")({ preventDefault() {} });
}
debug.state.player.x = 5910;
debug.state.player.y = 3715;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 3; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (!debug.state.story.completed.agronomia || debug.state.story.mission !== "rochiTruth") throw new Error("La misión de agronomía no completó sus cuatro muestras");

debug.state.player.x = 4580;
debug.state.player.y = 985;
use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.player.x = 450;
debug.state.player.y = 205;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 2; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.story.step = 2;
debug.state.player.x = 4465;
debug.state.player.y = 2092;
use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.player.x = 450;
debug.state.player.y = 205;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 4; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (!debug.state.story.completed.rochiTruth || debug.state.story.mission !== "free") throw new Error("La misión de seguimiento de Rochi no cerró en el banco");
debug.state.player.x = 450;
debug.state.player.y = 595;
use.listeners.get("pointerdown")({ preventDefault() {} });

debug.startCorralonMission();
for (let index = 0; index < 3; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.player.x = 5985;
debug.state.player.y = 835;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 3; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (!debug.state.story.bike || !elementFor("#objective-text").textContent.includes("MOTO")) throw new Error("Entrar al corralón no reveló la moto de Rochi");
debug.state.player.x = debug.state.story.bike.x;
debug.state.player.y = debug.state.story.bike.y;
use.listeners.get("pointerdown")({ preventDefault() {} });
if (debug.state.vehicleKind !== "bike" || debug.state.wanted !== 4) throw new Error("Robar la moto no activó cuatro estrellas");
debug.state.wanted = 0;
simulatedNow += 50;
nextFrame(simulatedNow);
for (let index = 0; index < 3; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (!debug.state.story.completed.corralon || !debug.state.story.bike) throw new Error("Perder las cuatro estrellas no recuperó la moto de Rochi");

const rochiBefore = debug.state.rochi.cash;
const deliveriesBefore = debug.state.didi.completed;
debug.acceptDidiOrder();
if (!debug.state.didi.active || debug.state.didi.phase !== "pickup") throw new Error("Didi no creó un pedido de comida");
debug.handleDidiStop();
if (debug.state.didi.phase !== "dropoff") throw new Error("Recoger comida no activó la entrega");
debug.handleDidiStop();
if (debug.state.didi.completed !== deliveriesBefore + 1) throw new Error("Didi no liquidó la entrega");
if (debug.state.rochi.cash <= rochiBefore) throw new Error("Rochi no cobró su comisión de Didi");

debug.state.money = 201;
debug.state.bank = 321;
debug.grantWeapon("pistol", 4);
debug.arrestEve("Prueba de separos");
if (debug.state.money !== 100 || debug.state.bank !== 321) throw new Error("Separos no respetó la regla efectivo/banco");
if (debug.state.ownedWeapons.join(",") !== "fists") throw new Error("Separos no confiscó las armas físicas");
debug.updateJail(10);
if (debug.state.jail.active || elementFor("#separos").classList.contains("hidden") === false) throw new Error("La condena de 10 segundos no terminó correctamente");
const persisted = JSON.parse(localStore.get("eve-gta-save-v4"));
if (persisted.version !== 4 || persisted.bank !== 321 || !persisted.story.completed.corralon || !persisted.settings.bindings) throw new Error("El guardado v4 no persistió historia, ajustes y partida individual");

const route = debug.calculateGpsRoute({ x: 1700, y: 1005 }, { x: 5365, y: 3455 });
if (route.length < 3) throw new Error("El GPS no calculó una ruta vial con tramos intermedios");
if (!debug.validateImportedSave(debug.buildSaveData())) throw new Error("La exportación no produce una partida importable");
const crossing = debug.roadIntersections[0];
debug.state.time = crossing.phase === 0 ? 8 : 0;
const probePosition = { x: crossing.x - Math.cos(crossing.angleA) * 70, y: crossing.y - Math.sin(crossing.angleA) * 70, angle: crossing.angleA };
if (!debug.trafficMustStop({ reverse: false }, probePosition)) throw new Error("El tráfico no reconoce la luz roja antes del cruce");

debug.state.inVehicle = true;
debug.state.vehicleKind = "truck";
debug.state.truck.health = 100;
debug.state.truck.speed = 120;
const trafficCar = debug.traffic.find((car) => !car.stolen && !car.hidden);
debug.state.truck.x = trafficCar.x;
debug.state.truck.y = trafficCar.y;
trafficCar.collisionCooldown = 0;
debug.updateTraffic(0);
if (debug.state.truck.health >= 100) throw new Error("El tráfico sigue siendo decorativo y no causa colisiones");

console.log(`Prueba de ejecución terminada: historia completa, ${debug.urbanBuildings.length} edificios urbanos, ${debug.traffic.length} vehículos, rutinas civiles y colisiones correctas.`);
