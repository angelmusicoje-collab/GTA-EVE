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

const poi = sandbox.window.__EVE_GTA_DEBUG__.POI;
sandbox.window.__EVE_GTA_DEBUG__.state.player.x = poi.pelicano.x;
sandbox.window.__EVE_GTA_DEBUG__.state.player.y = poi.pelicano.y;
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
debug.state.player.x = poi.bank.x;
debug.state.player.y = poi.bank.y;
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
debug.state.player.x = poi.raffle.x;
debug.state.player.y = poi.raffle.y;
use.listeners.get("pointerdown")({ preventDefault() {} });
if (debug.state.scene !== "raffle") throw new Error("Usar en Rifas El Aferrado no metió a Eve al local");
debug.state.player.x = 450;
debug.state.player.y = 205;
use.listeners.get("pointerdown")({ preventDefault() {} });
elementFor("#panel-actions").children[0].click();
if (!elementFor("#objective-text").textContent.includes("EMPEÑO")) throw new Error("La rifa de prueba no entregó premio vendible");

closePanel();
debug.state.player.x = 450;
debug.state.player.y = 595;
use.listeners.get("pointerdown")({ preventDefault() {} });
if (debug.state.scene !== "city") throw new Error("La salida de Rifas no devolvió a Eve a la calle");
debug.state.player.x = poi.pawn.x;
debug.state.player.y = poi.pawn.y;
use.listeners.get("pointerdown")({ preventDefault() {} });
if (debug.state.scene !== "pawn") throw new Error("Usar en el Empeño no metió a Eve al local");
debug.state.player.x = 450;
debug.state.player.y = 205;
use.listeners.get("pointerdown")({ preventDefault() {} });
elementFor("#panel-actions").children[0].click();
if (!elementFor("#objective-text").textContent.includes("TUNEAR")) throw new Error("Empeñar el premio no activó el taller");

closePanel();
debug.state.player.x = 450;
debug.state.player.y = 595;
use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.player.x = poi.garage.x;
debug.state.player.y = poi.garage.y;
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
debug.state.truck.x = poi.race.x;
debug.state.truck.y = poi.race.y;
debug.state.player.x = poi.race.x;
debug.state.player.y = poi.race.y;
use.listeners.get("pointerdown")({ preventDefault() {} });
elementFor("#panel-actions").children[0].click();
let simulatedNow = performance.now() + 100;
// La carrera arranca con cuenta regresiva: hay que dejarla correr antes de
// empezar a cruzar aros, si no el jugador "gana" antes del banderazo.
for (let tick = 0; tick < 90; tick += 1) {
  simulatedNow += 50;
  nextFrame(simulatedNow);
}
if (debug.state.race.countdown > 0) throw new Error("La cuenta regresiva de la carrera no terminó");
if (!debug.racers.length) throw new Error("La carrera arrancó sin rivales");
for (const point of debug.raceRoute.slice(1)) {
  debug.state.truck.x = point.x;
  debug.state.truck.y = point.y;
  simulatedNow += 50;
  nextFrame(simulatedNow);
}
if (!elementFor("#objective-text").textContent.includes("JARDÍN DEL PISTO")) throw new Error("Terminar la carrera no activó el regreso al Jardín");

debug.state.truck.x = poi.garden.x;
debug.state.truck.y = poi.garden.y;
debug.state.player.x = poi.garden.x;
debug.state.player.y = poi.garden.y;
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
debug.state.truck.x = poi.escape.x;
debug.state.truck.y = poi.escape.y;
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

debug.state.player.x = poi.fedeLot.x;
debug.state.player.y = poi.fedeLot.y;
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
debug.state.story.fedeCar.x = poi.fedeDelivery.x;
debug.state.story.fedeCar.y = poi.fedeDelivery.y;
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

debug.state.player.x = poi.cbtis.x;
debug.state.player.y = poi.cbtis.y;
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

debug.state.player.x = poi.agronomia.x;
debug.state.player.y = poi.agronomia.y;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 3; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
for (const valve of debug.state.story.valves) {
  debug.state.player.x = valve.x;
  debug.state.player.y = valve.y;
  use.listeners.get("pointerdown")({ preventDefault() {} });
}
debug.state.player.x = poi.agronomia.x;
debug.state.player.y = poi.agronomia.y;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 3; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
if (!debug.state.story.completed.agronomia || debug.state.story.mission !== "rochiTruth") throw new Error("La misión de agronomía no completó sus cuatro muestras");

debug.state.player.x = poi.marina.x;
debug.state.player.y = poi.marina.y;
use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.player.x = 450;
debug.state.player.y = 205;
use.listeners.get("pointerdown")({ preventDefault() {} });
for (let index = 0; index < 2; index += 1) use.listeners.get("pointerdown")({ preventDefault() {} });
debug.state.story.step = 2;
debug.state.player.x = poi.bank.x;
debug.state.player.y = poi.bank.y;
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
debug.state.player.x = poi.corralon.x;
debug.state.player.y = poi.corralon.y;
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

// Regresión: ningún edificio con nombre puede quedar plantado encima de una
// calle. Antes había 22 así y el tráfico atravesaba la Casa de Eve.
const sobrepuestos = debug.buildings.filter((b) => debug.rectTouchesRoad(b, 4)).map((b) => b.id);
if (sobrepuestos.length) throw new Error(`Edificios encima de la calle: ${sobrepuestos.join(", ")}`);

// Regresión: tocar una patrulla NO puede mandarte a los separos. Solo morir.
debug.state.jail.active = false;
debug.state.health = 100;
debug.state.armor = 0;
debug.state.wanted = 3;
debug.state.scene = "city";
debug.state.inVehicle = false;
debug.policeOfficers.length = 0;
debug.policeUnits.length = 0;
debug.policeUnits.push({ x: debug.state.player.x, y: debug.state.player.y, angle: 0, heading: 0, shotTimer: 99, health: 100, status: "active", police: true, cash: 0, dropped: false, deployed: true, deployTimer: 99, speech: "", speechTimer: 0 });
debug.updateWanted(1 / 60);
if (debug.state.jail.active) throw new Error("La patrulla sigue arrestando de un roce");
if (debug.state.health >= 100) throw new Error("El choque con la patrulla debería quitar vida");

// Regresión: al llegar a cero de vida sí caes en los separos.
debug.state.health = 0;
debug.state.lastDeathCause = "prueba";
debug.recoverEve();
if (!debug.state.jail.active) throw new Error("Morir debería mandar a Eve a los separos");
debug.state.jail.active = false;
debug.state.health = 100;
debug.state.wanted = 0;

// Regresión de trazado: la red vial tiene que servir para manejar.
const ring = debug.roads.find((road) => road.ring);
if (!ring) throw new Error("No hay anillo periférico: se pierde el circuito de carreras");
const ringStart = ring.points[0];
const ringEnd = ring.points[ring.points.length - 1];
if (Math.hypot(ringStart[0] - ringEnd[0], ringStart[1] - ringEnd[1]) > 1) throw new Error("El anillo no cierra: no se puede dar la vuelta completa");
if (debug.residentialRoads.length < 8) throw new Error(`Quedaron muy pocas calles secundarias (${debug.residentialRoads.length})`);
if (debug.roadIntersections.length < 20) throw new Error("Faltan cruces: la cuadrícula no está conectada");
if (debug.urbanBuildings.length < 120) throw new Error(`La ciudad quedó despoblada (${debug.urbanBuildings.length} construcciones)`);

// La carrera debe correr sobre el anillo, no por terreno suelto.
for (const point of debug.raceRoute) {
  if (!debug.pointOnRoad(point.x, point.y, 30)) throw new Error("Una meta de la carrera quedó fuera de la calle");
}

// Regresión de manejo: el freno de mano tiene que producir derrape de verdad.
// La primera versión del modelo rotaba el vector de velocidad junto con el
// volante, así que el deslizamiento lateral siempre daba cero.
debug.state.scene = "city";
debug.state.jail.active = false;
debug.state.wanted = 0;
debug.state.inVehicle = true;
debug.state.vehicleKind = "truck";
debug.state.truck.destroyed = false;
debug.state.truck.fuel = 100;
debug.state.truck.health = 100;
const ringRoad = debug.roads.find((road) => road.ring);
const straight = ringRoad.points[0];
debug.state.truck.x = straight[0] + 600;
debug.state.truck.y = straight[1];
debug.state.truck.angle = Math.PI / 2;
debug.state.truck.vx = 300;
debug.state.truck.vy = 0;
debug.state.truck.speed = 300;
debug.skidMarks.length = 0;

// Volantazo con freno de mano puesto.
debug.input.handbrake = true;
debug.input.joystick.x = 1;
debug.input.joystick.y = 0;
// Se mide el pico del deslizamiento durante la maniobra: el valor final varía
// según en qué cuadro se lea, porque el agarre lo va comiendo.
let peakSlip = 0;
for (let tick = 0; tick < 40; tick += 1) {
  simulatedNow += 16;
  nextFrame(simulatedNow);
  peakSlip = Math.max(peakSlip, debug.state.truck.slip || 0);
}
debug.input.handbrake = false;
debug.input.joystick.x = 0;
if (!(peakSlip > 40)) throw new Error(`El freno de mano no produce derrape (pico de deslizamiento ${Math.round(peakSlip)})`);
if (!debug.skidMarks.length) throw new Error("Derrapar no dejó marcas de llanta");
debug.state.inVehicle = false;

// Regresión: el atropellón de la patrulla hacía daño en CADA cuadro, o sea
// hasta 600 por segundo. Un segundo pegado a una patrulla no puede matarte.
debug.state.scene = "city";
debug.state.jail.active = false;
debug.state.inVehicle = false;
debug.state.health = 100;
debug.state.armor = 0;
debug.state.wanted = 2;
debug.policeOfficers.length = 0;
debug.policeUnits.length = 0;
debug.policeUnits.push({ x: debug.state.player.x, y: debug.state.player.y, angle: 0, heading: 0, shotTimer: 999, health: 100, status: "active", police: true, model: "patrulla", cash: 0, dropped: false, deployed: true, deployTimer: 999, ramCooldown: 0, speech: "", speechTimer: 0 });
for (let tick = 0; tick < 60; tick += 1) debug.updateWanted(1 / 60);
if (debug.state.jail.active) throw new Error("Un segundo de roce con la patrulla mandó a Eve a los separos");
if (debug.state.health < 88) throw new Error(`El atropellón sigue haciendo daño por cuadro (vida ${Math.round(debug.state.health)} tras un segundo)`);

// Regresión: perder una estrella tiene que ser posible al evadir.
debug.state.health = 100;
debug.state.wanted = 1;
debug.state.wantedTimer = 4;
debug.policeUnits.length = 0;
debug.policeOfficers.length = 0;
for (let tick = 0; tick < 60 * 40; tick += 1) debug.updateWanted(1 / 60);
if (debug.state.wanted !== 0) throw new Error("Evadiendo 40 segundos sin una sola patrulla cerca, la estrella no baja");

// Regresión: los carros del tráfico son sólidos, Eve no los atraviesa.
const solidCar = debug.traffic.find((car) => Number.isFinite(car.x) && !car.stolen && !car.hidden);
if (!solidCar) throw new Error("No hay ningún carro de tráfico colocado");
if (!debug.cityBlocked(solidCar.x, solidCar.y, 14)) throw new Error("Eve puede atravesar los carros del tráfico");

// Regresión: hay paquetes escondidos y ninguno cae sobre el asfalto.
if (debug.hiddenPackages.length < 30) throw new Error(`Muy pocos paquetes escondidos (${debug.hiddenPackages.length})`);
for (const bundle of debug.hiddenPackages) {
  if (debug.pointOnRoad(bundle.x, bundle.y, 10)) throw new Error("Un paquete escondido quedó en media calle");
}

// Regresión: los vehículos tienen modelos distintos, no todos la misma caja.
const modelosUsados = new Set(debug.traffic.map((car) => car.model));
if (modelosUsados.size < 4) throw new Error(`Muy poca variedad de vehículos (${modelosUsados.size} modelos)`);
debug.state.wanted = 0;

console.log(`Prueba de ejecución terminada: historia completa, ${debug.urbanBuildings.length} edificios urbanos, ${debug.traffic.length} vehículos, rutinas civiles y colisiones correctas.`);
