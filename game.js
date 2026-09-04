(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const shell = $("#game-shell");
  const canvas = $("#game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const minimap = $("#minimap");
  const mini = minimap.getContext("2d");

  const WORLD = { width: 6400, height: 4200 };
  // Resolución interna del juego. Todo se dibuja aquí y el CSS lo estira.
  // Más alto = más pixeles y más detalle, sin perder el borde duro.
  const RENDER_HEIGHT = 432;
  // Unidades de mundo visibles en vertical. Menos = más zoom.
  // Mundo visible en vertical. A pie se juega cerca; al manejar la cámara se
  // abre para ver la curva que viene, que es lo que hacía imposible correr.
  const WORLD_VIEW_HEIGHT = 470;
  const WORLD_VIEW_HEIGHT_FAST = 760;
  const INTERIOR = { width: 900, height: 650 };
  const SAVE_KEY = "eve-gta-save-v4";
  const LEGACY_SAVE_KEYS = ["eve-gta-save-v3", "eve-gta-save-v2"];
  const TAU = Math.PI * 2;
  const palette = {
    ink: "#0b0d12",
    outline: "#14171e",
    asphalt: "#2b3038",
    asphaltDark: "#232830",
    asphalt2: "#353b45",
    concrete: "#9d9585",
    concreteLight: "#b3ab99",
    walk: "#9d9585",
    walkDark: "#7f7869",
    curb: "#c2b9a4",
    line: "#d8cf9a",
    dirt: "#6d6553",
    acid: "#e7ff1f",
    cyan: "#2bd9d5",
    pink: "#ff2f91",
    park: "#3c6b47",
    parkDark: "#2a4d34",
    water: "#2f8fa8",
    waterLight: "#4bb7cc",
    cream: "#f3ead1",
    night: "#ffd36a",
  };
  const defaultBindings = {
    up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD",
    run: "ShiftLeft", use: "KeyE", attack: "Space", weapon: "KeyQ", radio: "KeyR", phone: "KeyP",
  };
  const keyLabels = {
    KeyW: "W", KeyA: "A", KeyS: "S", KeyD: "D", KeyE: "E", KeyQ: "Q", KeyR: "R", KeyP: "P",
    ShiftLeft: "Shift", ShiftRight: "Shift der.", Space: "Espacio",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  };
  const radioStations = [
    { id: "off", name: "RADIO APAGADA", track: "Sin señal", bpm: 100, wave: "square", bass: [0], lead: [0] },
    { id: "quebradora", name: "LA QUEBRADORA 94.1", track: "Cumbia de la Banqueta", tracks: ["Cumbia de la Banqueta", "Dos Caguamas y un Semáforo", "Calor de Villa"], bpm: 112, wave: "square", bass: [45,45,52,45,57,52,45,40], lead: [69,72,76,72,69,67,64,67] },
    { id: "banqueta", name: "BANQUETA FM 88.9", track: "Rochi No Trae (instrumental)", tracks: ["Rochi No Trae", "Saldo Protegido", "Tacos de Calificación"], bpm: 86, wave: "sawtooth", bass: [38,38,0,41,38,0,45,41], lead: [62,0,65,0,69,67,65,0] },
    { id: "volcan", name: "VOLCÁN STEREO 101.7", track: "Última Vuelta por Colima", tracks: ["Última Vuelta por Colima", "Volcán en el Retrovisor", "San Fernando de Noche"], bpm: 132, wave: "triangle", bass: [43,50,47,50,43,50,55,50], lead: [67,71,74,71,67,71,76,74] },
  ];
  const radioDjLines = [
    "Tráfico lento en Tecnológico: o sea, jueves.",
    "Patrocina Rochi: no puso un peso, pero quiso crédito.",
    "Si ve una patrulla, baje la caguama y súbale a la radio.",
  ];

  function seededValue(seed) {
    const value = Math.sin(seed * 9283.17 + 17.23) * 43758.5453;
    return value - Math.floor(value);
  }

  // ---------------------------------------------------------------------------
  // RED VIAL
  // El trazado anterior era un montón de líneas dibujadas a ojo que se cruzaban
  // en ángulos rasantes, se cortaban a media cuadra y no dejaban manejar. Esta
  // se genera con tres piezas pensadas para el volante:
  //   1. Un anillo periférico cerrado: vueltas completas sin frenar, para
  //      carreras y para perder a la policía a fondo.
  //   2. Ejes rectos largos que se cruzan casi a escuadra: rebases, derrapes en
  //      esquina y traslados rápidos de punta a punta.
  //   3. Una cuadrícula secundaria conectada para escaparse por dentro.
  // ---------------------------------------------------------------------------
  const GRID = {
    left: 380,
    right: 6020,
    top: 380,
    bottom: 3820,
    corner: 430,
    // Ejes horizontales: y y nombre.
    across: [
      [900, "P.° MIGUEL DE LA MADRID", 150],
      [1500, "AV. DE LOS MAESTROS", 138],
      [2160, "AV. FELIPE SEVILLA DEL RÍO", 150],
      [2820, "AV. BENITO JUÁREZ", 138],
      [3380, "AV. MARÍA AHUMADA DE GÓMEZ", 150],
    ],
    // Ejes verticales.
    down: [
      [1180, "CORONA MORFÍN", 138],
      [2200, "C. HIDALGO", 126],
      [3260, "CALZADA GALVÁN", 138],
      [4340, "AV. CONSTITUCIÓN", 150],
      [5300, "CARRETERA A TECOMÁN", 138],
    ],
  };

  // Ondulación chica para que no parezcan trazadas con regla, sin perder el
  // cruce a escuadra que hace legibles las esquinas al manejar.
  function wobble(seed, amount = 22) {
    return (seededValue(seed) - 0.5) * 2 * amount;
  }

  function buildRoadNetwork() {
    const list = [];
    const { left, right, top, bottom, corner } = GRID;

    // 1. Anillo periférico. Cierra sobre sí mismo: se puede dar vuelta entera.
    list.push({
      name: "TERCER ANILLO PERIFÉRICO",
      width: 196,
      ring: true,
      points: [
        [left + corner, top], [right - corner, top],
        [right, top + corner], [right, bottom - corner],
        [right - corner, bottom], [left + corner, bottom],
        [left, bottom - corner], [left, top + corner],
        [left + corner, top],
      ],
    });

    // 2. Ejes largos de lado a lado.
    GRID.across.forEach(([y, name, width], index) => {
      const points = [];
      for (let i = 0; i <= 6; i += 1) {
        const x = left + ((right - left) * i) / 6;
        const off = i === 0 || i === 6 ? 0 : wobble(index * 97 + i * 13);
        points.push([Math.round(x), Math.round(y + off)]);
      }
      list.push({ name, width, points });
    });

    GRID.down.forEach(([x, name, width], index) => {
      const points = [];
      for (let i = 0; i <= 5; i += 1) {
        const y = top + ((bottom - top) * i) / 5;
        const off = i === 0 || i === 5 ? 0 : wobble(index * 131 + i * 29);
        points.push([Math.round(x + off), Math.round(y)]);
      }
      list.push({ name, width, points });
    });

    // 3. Diagonal. Da la línea de carrera larga que una cuadrícula pura no
    //    tiene, y cruza a unos 35 grados, no rasante.
    list.push({
      name: "AV. TECNOLÓGICO",
      width: 156,
      points: [[1180, 2820], [2200, 2200], [3260, 1620], [4340, 900]],
    });

    return list;
  }

  const roads = buildRoadNetwork();

  // Cuadrícula secundaria: calles angostas a media cuadra, para meterse y
  // perder a la patrulla. Se generan entre ejes, no encima de ellos.
  function buildLocalStreets() {
    const list = [];
    const { left, right, top, bottom } = GRID;
    const acrossY = [top, ...GRID.across.map((entry) => entry[0]), bottom];
    const downX = [left, ...GRID.down.map((entry) => entry[0]), bottom > 0 ? right : right];

    for (let i = 0; i < acrossY.length - 1; i += 1) {
      const gap = acrossY[i + 1] - acrossY[i];
      const cuts = Math.max(1, Math.round(gap / 330) - 1);
      for (let c = 1; c <= cuts; c += 1) {
        const y = Math.round(acrossY[i] + (gap * c) / (cuts + 1));
        list.push({
          name: "",
          width: 58,
          points: [[left + 40, y], [Math.round((left + right) / 2), y + Math.round(wobble(i * 17 + c, 14))], [right - 40, y]],
        });
      }
    }
    for (let i = 0; i < downX.length - 1; i += 1) {
      const gap = downX[i + 1] - downX[i];
      const cuts = Math.max(1, Math.round(gap / 350) - 1);
      for (let c = 1; c <= cuts; c += 1) {
        const x = Math.round(downX[i] + (gap * c) / (cuts + 1));
        list.push({
          name: "",
          width: 56,
          points: [[x, top + 40], [x + Math.round(wobble(i * 23 + c, 14)), Math.round((top + bottom) / 2)], [x, bottom - 40]],
        });
      }
    }
    return list;
  }

  const residentialRoads = buildLocalStreets();

  const buildings = [
    { id: "soriana", x: 40, y: 1125, w: 640, h: 390, label: "SORIANA HIPER COLIMA", roof: "#c8443f", accent: "#2878cd" },
    { id: "cityclub", x: 760, y: 1390, w: 490, h: 330, label: "CITY CLUB", roof: "#3f6fa8", accent: "#277bd2" },
    { id: "kfc", x: 1440, y: 1160, w: 220, h: 145, label: "KFC VILLA DE ÁLVAREZ", roof: "#d6544a", accent: "#e43c35" },
    { id: "little", x: 1960, y: 1470, w: 255, h: 150, label: "LITTLE CAESARS", roof: "#e08a3c", accent: "#f17e27" },
    { id: "eve-house", x: 1610, y: 810, w: 180, h: 150, label: "CASA DE EVE", roof: "#b0708a", accent: "#ff2f91", special: true },
    { id: "barbacoa", x: 1930, y: 360, w: 225, h: 135, label: "BARBACOA LA HIGUERA", roof: "#b5613a", accent: "#e6692b" },
    { id: "local-a", x: 95, y: 440, w: 240, h: 160, roof: "#8f8172", accent: "#56514c" },
    { id: "local-b", x: 1010, y: 1070, w: 245, h: 140, roof: "#a09582", accent: "#686056" },
    { id: "local-c", x: 1815, y: 1010, w: 250, h: 135, roof: "#8e8b82", accent: "#4b4c4d" },
    { id: "local-d", x: 2070, y: 650, w: 150, h: 175, roof: "#9c917d", accent: "#6d6355" },
    { id: "pelicano", x: 2700, y: 1240, w: 255, h: 150, label: "EL PELÍCANO", roof: "#b8843f", accent: "#e7ff1f", interactable: true },
    { id: "jardin", x: 3180, y: 610, w: 360, h: 230, label: "JARDÍN DEL PISTO", roof: "#315a45", accent: "#ff2f91", garden: true },
    { id: "rifa", x: 3300, y: 1850, w: 175, h: 125, label: "RIFAS EL AFERRADO", roof: "#7f4f96", accent: "#2bd9d5", interactable: true },
    { id: "empeno", x: 3780, y: 2070, w: 245, h: 145, label: "EMPEÑO VOLCÁN", roof: "#c2a04e", accent: "#e7c447", interactable: true },
    { id: "marina", x: 4300, y: 650, w: 560, h: 310, label: "LA MARINA SAN FERNANDO", roof: "#5b93c4", accent: "#3e75bb", interactable: true },
    { id: "banco", x: 4320, y: 1900, w: 290, h: 175, label: "BANCO / CAJERO", roof: "#4f9aa4", accent: "#2bd9d5", interactable: true },
    { id: "taller", x: 4630, y: 2450, w: 360, h: 210, label: "TALLER EL VOLCÁN", roof: "#a05070", accent: "#ff2f91", interactable: true },
    { id: "gasolinera", x: 3330, y: 2520, w: 310, h: 185, label: "GASOLINERA", roof: "#4fa05f", accent: "#44b964", interactable: true },
    { id: "separos", x: 5300, y: 500, w: 410, h: 265, label: "SEPAROS", roof: "#5d6b86", accent: "#e54857" },
    { id: "arrancones", x: 5050, y: 3180, w: 640, h: 220, label: "ARRANCONES TERCER ANILLO", roof: "#343940", accent: "#e7ff1f", track: true },
    { id: "agronomia", x: 5650, y: 3750, w: 520, h: 290, label: "CAMPUS AGRONOMÍA", roof: "#879178", accent: "#6ecb75" },
    { id: "rochi-home", x: 4750, y: 1450, w: 180, h: 150, label: "CASA DE ROCHI", roof: "#7fa8b0", accent: "#d7d3c6" },
    { id: "cbtis19", x: 5140, y: 1250, w: 480, h: 270, label: "CBTIS 19", roof: "#6f9a72", accent: "#3a7048", interactable: true },
    { id: "fede-lot", x: 910, y: 3110, w: 620, h: 285, label: "LOTE DONDE ‘PRESTARON’ EL SENTRA", roof: "#4d4a45", accent: "#ff2f91", yard: true },
    { id: "corralon", x: 5740, y: 500, w: 500, h: 300, label: "CORRALÓN DE SEPAROS", roof: "#5a5d60", accent: "#e54857", yard: true },
  ];

  // Antes aquí se borraban las calles secundarias que cruzaban un edificio.
  // Con el trazado nuevo eso está al revés: la cuadrícula es el diseño y los
  // edificios son los que se acomodan, así que el pase de abajo los mueve a
  // ellos y las calles se quedan completas.

  const buildingShifts = new Map();
  (() => {
    const directions = [];
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      directions.push([Math.cos(angle), Math.sin(angle)]);
    }
    const touchesAny = (rect, roadList, extra) => roadList.some((road) => {
      for (let i = 0; i < road.points.length - 1; i += 1) {
        const a = road.points[i];
        const b = road.points[i + 1];
        if (segmentIntersectsExpandedRect(a[0], a[1], b[0], b[1], rect, road.width / 2 + extra)) return true;
      }
      return false;
    });
    const clearOfBuildings = (rect, self) => {
      for (const other of buildings) {
        if (other === self) continue;
        if (rectanglesOverlap(rect, other, 24)) return false;
      }
      return true;
    };
    // Un sitio es válido si no pisa calle y no se encima con otro edificio.
    const spotFree = (rect, self) => !rectTouchesRoad(rect, 10) && clearOfBuildings(rect, self);
    // Versión indulgente: ignora las calles secundarias. Una tienda grande
    // ocupa la manzana entera y se come las callecitas, pero jamás una
    // avenida con nombre.
    const spotFreeMajor = (rect, self) => !touchesAny(rect, roads, 10) && clearOfBuildings(rect, self);
    for (const building of buildings) {
      if (spotFree(building, building)) continue;
      let best = null;
      // Primero se intenta solo mover. Si el edificio es tan grande que no cabe
      // entre dos avenidas (Soriana, City Club, Agronomía), se le permite
      // encoger hasta un 30% antes de rendirse.
      const scales = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.62, 0.55];
      for (const scale of scales) {
        const w = Math.round(building.w * scale);
        const h = Math.round(building.h * scale);
        for (let step = 0; step <= 900 && !best; step += 20) {
          for (const [dx, dy] of directions) {
            const moved = { x: building.x + dx * step, y: building.y + dy * step, w, h };
            if (moved.x < 30 || moved.y < 30 || moved.x + moved.w > WORLD.width - 30 || moved.y + moved.h > WORLD.height - 30) continue;
            if (!spotFree(moved, building)) continue;
            best = { dx: dx * step, dy: dy * step, w, h };
            break;
          }
          if (step === 0) continue;
        }
        if (best) break;
      }
      if (!best) {
        // No cupo entre las callecitas: se le busca lugar respetando solo las
        // avenidas y se borran las secundarias que le queden debajo.
        for (const scale of scales) {
          const w = Math.round(building.w * scale);
          const h = Math.round(building.h * scale);
          for (let step = 0; step <= 900 && !best; step += 20) {
            for (const [dx, dy] of directions) {
              const moved = { x: building.x + dx * step, y: building.y + dy * step, w, h };
              if (moved.x < 30 || moved.y < 30 || moved.x + moved.w > WORLD.width - 30 || moved.y + moved.h > WORLD.height - 30) continue;
              if (!spotFreeMajor(moved, building)) continue;
              best = { dx: dx * step, dy: dy * step, w, h };
              break;
            }
          }
          if (best) break;
        }
        if (!best) continue;
        const placed = { x: building.x + best.dx, y: building.y + best.dy, w: best.w, h: best.h };
        for (let i = residentialRoads.length - 1; i >= 0; i -= 1) {
          if (touchesAny(placed, [residentialRoads[i]], 10)) residentialRoads.splice(i, 1);
        }
      }
      building.x += best.dx;
      building.y += best.dy;
      building.w = best.w;
      building.h = best.h;
      buildingShifts.set(building.id, best);
    }
  })();

  const districts = [
    { id: "villa-norte", label: "VILLA NORTE", x: 0, y: 0, w: 2520, h: 2580, cellX: 158, cellY: 138, tint: "#8a8069", uses: ["house", "house", "shop", "apartments"] },
    { id: "centro", label: "CENTRO DE COLIMA", x: 2500, y: 1450, w: 2580, h: 1700, cellX: 166, cellY: 144, tint: "#877665", uses: ["shop", "apartments", "shop", "house"] },
    { id: "san-fernando", label: "SAN FERNANDO", x: 4020, y: 260, w: 2250, h: 1760, cellX: 170, cellY: 146, tint: "#7d7b6b", uses: ["apartments", "house", "shop", "house"] },
    { id: "periferia", label: "PERIFERIA · LIBRAMIENTO", x: 80, y: 2900, w: 5000, h: 1220, cellX: 186, cellY: 156, tint: "#6f6e5c", uses: ["workshop", "house", "warehouse", "shop"] },
  ];

  const parkingLots = [
    { x: 18, y: 1055, w: 705, h: 520, angle: 0, tone: "#454a4f" },
    { x: 720, y: 1335, w: 590, h: 445, angle: 0, tone: "#484d51" },
    { x: 4240, y: 580, w: 690, h: 450, angle: 0, tone: "#474c51" },
    { x: 5070, y: 1185, w: 610, h: 405, angle: 0, tone: "#686961", school: true },
    { x: 5575, y: 3670, w: 660, h: 420, angle: 0, tone: "#61675b", school: true },
    { x: 3270, y: 2460, w: 430, h: 315, angle: 0, tone: "#4a4f4f" },
  ];

  const busStops = [
    { x: 1320, y: 1322, angle: 0.35, label: "RUTA 3" },
    { x: 3035, y: 1960, angle: 0.28, label: "CENTRO" },
    { x: 3985, y: 1075, angle: -0.04, label: "SAN FER" },
    { x: 5108, y: 2870, angle: 0.04, label: "TECOMÁN" },
  ];

  const riverTrace = [
    [2605, 20], [2670, 300], [2545, 620], [2700, 900], [2670, 1210], [2780, 1570], [2865, 1850], [2960, 2160],
  ];
  const urbanClearings = [
    { x: 1700, y: 1000, r: 105 }, { x: 3360, y: 865, r: 150 }, { x: 2828, y: 1418, r: 120 },
    { x: 3388, y: 1995, r: 115 }, { x: 3905, y: 2235, r: 115 }, { x: 4465, y: 2092, r: 115 },
    { x: 4810, y: 2685, r: 145 }, { x: 3485, y: 2725, r: 125 }, { x: 5365, y: 3455, r: 150 },
    { x: 5505, y: 790, r: 125 }, { x: 4580, y: 985, r: 125 }, { x: 4840, y: 1625, r: 120 },
    { x: 4950, y: 1035, r: 115 }, { x: 1210, y: 3260, r: 160 }, { x: 5380, y: 1565, r: 150 },
    { x: 5985, y: 835, r: 155 }, { x: 2240, y: 3150, r: 145 }, { x: 4200, y: 3540, r: 110 },
    { x: 3320, y: 2820, r: 110 }, { x: 4140, y: 2050, r: 110 }, { x: 5080, y: 2450, r: 110 },
    { x: 5800, y: 3650, r: 110 },
  ];

  function rectanglesOverlap(a, b, padding = 0) {
    return a.x < b.x + b.w + padding
      && a.x + a.w > b.x - padding
      && a.y < b.y + b.h + padding
      && a.y + a.h > b.y - padding;
  }

  function lineSegmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const denominator = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(denominator) < 0.0001) return false;
    const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / denominator;
    const ub = ((bx - ax) * (ay - cy) - (by - ay) * (ax - cx)) / denominator;
    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }

  function segmentIntersectsExpandedRect(ax, ay, bx, by, rect, padding) {
    const left = rect.x - padding;
    const right = rect.x + rect.w + padding;
    const top = rect.y - padding;
    const bottom = rect.y + rect.h + padding;
    if ((ax >= left && ax <= right && ay >= top && ay <= bottom)
      || (bx >= left && bx <= right && by >= top && by <= bottom)) return true;
    return lineSegmentsIntersect(ax, ay, bx, by, left, top, right, top)
      || lineSegmentsIntersect(ax, ay, bx, by, right, top, right, bottom)
      || lineSegmentsIntersect(ax, ay, bx, by, right, bottom, left, bottom)
      || lineSegmentsIntersect(ax, ay, bx, by, left, bottom, left, top);
  }

  function rectTouchesRoad(rect, extra = 7) {
    for (const road of [...residentialRoads, ...roads]) {
      for (let index = 0; index < road.points.length - 1; index += 1) {
        const a = road.points[index];
        const b = road.points[index + 1];
        if (segmentIntersectsExpandedRect(a[0], a[1], b[0], b[1], rect, road.width / 2 + extra)) return true;
      }
    }
    return false;
  }

  function inProtectedLandscape(x, y, radius = 0) {
    const reserveX = (x - 3370) / (850 + radius);
    const reserveY = (y - 790) / (735 + radius);
    if (reserveX * reserveX + reserveY * reserveY < 1) return true;
    for (let index = 0; index < riverTrace.length - 1; index += 1) {
      const a = riverTrace[index];
      const b = riverTrace[index + 1];
      if (pointToSegmentDistance(x, y, a[0], a[1], b[0], b[1]) < 62 + radius) return true;
    }
    return false;
  }

  // Las manzanas salen del propio trazado: se toman las líneas de calle, se
  // arma el rectángulo entre dos consecutivas y se llena de lotes hacia
  // adentro. Antes los edificios se sembraban en una retícula suelta que no
  // sabía dónde estaban las calles, así que la mitad caía sobre el asfalto y
  // se descartaba: quedaban baldíos enormes.
  function cityBlocks() {
    // Cada línea guarda su media anchura: una avenida mide 196 y una calle
    // local 58, así que un margen fijo dejaba las manzanas encima del asfalto.
    const ringHalf = 196 / 2;
    const xLines = [{ at: GRID.left, half: ringHalf }, { at: GRID.right, half: ringHalf }];
    const yLines = [{ at: GRID.top, half: ringHalf }, { at: GRID.bottom, half: ringHalf }];
    for (const [y, , width] of GRID.across) yLines.push({ at: y, half: width / 2 });
    for (const [x, , width] of GRID.down) xLines.push({ at: x, half: width / 2 });
    for (const road of residentialRoads) {
      const first = road.points[0];
      const last = road.points[road.points.length - 1];
      const half = road.width / 2 + 16; // el bamboleo del trazo local
      if (Math.abs(first[1] - last[1]) < 60) yLines.push({ at: first[1], half });
      else if (Math.abs(first[0] - last[0]) < 60) xLines.push({ at: first[0], half });
    }
    xLines.sort((a, b) => a.at - b.at);
    yLines.sort((a, b) => a.at - b.at);

    const margin = 18;
    const blocks = [];
    for (let i = 0; i < xLines.length - 1; i += 1) {
      for (let j = 0; j < yLines.length - 1; j += 1) {
        const x = xLines[i].at + xLines[i].half + margin;
        const y = yLines[j].at + yLines[j].half + margin;
        const w = xLines[i + 1].at - xLines[i + 1].half - margin - x;
        const h = yLines[j + 1].at - yLines[j + 1].half - margin - y;
        if (w < 86 || h < 76) continue;
        blocks.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
      }
    }
    return blocks;
  }

  // Se guardan para poder pintarlas: el hueco entre la calle y las casas era
  // una plancha de tierra plana del color del barrio.
  const blockRects = cityBlocks();

  function generateUrbanBuildings() {
    const generated = [];
    // Antes todo era beige y gris ratón, y la ciudad se veía lavada. Estas son
    // las que se ven de verdad en una colonia: rosa mexicano, verde limón,
    // turquesa, terracota y amarillo.
    const roofSets = {
      "villa-norte": ["#c98b7a", "#d9b06a", "#8fae8a", "#c9a2ae", "#9fb8c4", "#d7c391", "#b0806e"],
      centro: ["#c4705f", "#d8a24f", "#7fa4a8", "#b5657e", "#c9b17a", "#8f9c6b", "#a8635a"],
      "san-fernando": ["#cbb79a", "#9dbcc6", "#c58f8a", "#a9c095", "#d5c07e", "#8fa0b4", "#bfa07f"],
      periferia: ["#8d8577", "#a8825f", "#7f8f7a", "#9c6f60", "#b09a6d", "#6f8189"],
    };
    const signs = ["ABARROTES", "TACOS", "PAPELERÍA", "LLANTERA", "ESTÉTICA", "REFACCIONES", "COPIAS", "FERRETERÍA"];
    let sequence = 0;

    for (const block of blockRects) {
      const centerX = block.x + block.w / 2;
      const centerY = block.y + block.h / 2;
      const district = districts.find((entry) => centerX >= entry.x && centerX <= entry.x + entry.w && centerY >= entry.y && centerY <= entry.y + entry.h)
        || districts[0];
      const roofSet = roofSets[district.id] || roofSets.centro;

      // El grano cambia por manzana: unas de casitas apretadas, otras de
      // bodegas grandes. Antes todas salían del mismo tamaño y la ciudad
      // entera se veía fotocopiada.
      const grain = seededValue(Math.round(block.x) * 31 + Math.round(block.y) * 17);
      const lotSize = grain < 0.3 ? 104 : grain < 0.72 ? 138 : 196;
      const cols = Math.max(1, Math.round(block.w / lotSize));
      const rows = Math.max(1, Math.round(block.h / (lotSize * 0.88)));
      const lotW = block.w / cols;
      const lotH = block.h / rows;

      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          sequence += 1;
          const seed = sequence * 13 + Math.round(block.x) * 7 + Math.round(block.y) * 3;
          if (seededValue(seed + 20) < 0.1) continue; // uno que otro baldío

          const lot = {
            x: Math.round(block.x + c * lotW + 3),
            y: Math.round(block.y + r * lotH + 3),
            w: Math.round(lotW - 6),
            h: Math.round(lotH - 6),
          };
          const inset = 12 + Math.floor(seededValue(seed + 3) * 10);
          const candidate = {
            x: lot.x + inset,
            y: lot.y + inset,
            w: Math.max(30, lot.w - inset * 2),
            h: Math.max(26, lot.h - inset * 2),
          };
          const radius = Math.hypot(candidate.w, candidate.h) * 0.42;
          const overlapsLandmark = buildings.some((building) => rectanglesOverlap(lot, building, 22));
          const overlapsParking = parkingLots.some((parking) => rectanglesOverlap(lot, parking, 8));
          const blocksActivity = urbanClearings.some((clearing) => circleHitsRect(clearing.x, clearing.y, clearing.r, lot));
          if (overlapsLandmark || overlapsParking || blocksActivity
            || rectTouchesRoad(lot, 2)
            || inProtectedLandscape(candidate.x + candidate.w / 2, candidate.y + candidate.h / 2, radius)) continue;

          const use = district.uses[Math.floor(seededValue(seed + 5) * district.uses.length)];
          generated.push({
            id: `urban-${Math.round(block.x)}-${Math.round(block.y)}-${c}-${r}`,
            district: district.id,
            x: candidate.x,
            y: candidate.y,
            w: candidate.w,
            h: candidate.h,
            lot,
            use,
            floors: use === "apartments" ? 2 + Math.floor(seededValue(seed + 6) * 3) : 1,
            roof: roofSet[Math.floor(seededValue(seed + 7) * roofSet.length)],
            accent: ["#d8983d", "#3a8aa1", "#b05774", "#697b49"][Math.floor(seededValue(seed + 8) * 4)],
            detailSeed: seed,
            sign: use === "shop" ? signs[Math.floor(seededValue(seed + 9) * signs.length)] : "",
          });
        }
      }
    }
    return generated;
  }

  const urbanBuildings = generateUrbanBuildings();
  const solidBuildings = [...buildings.filter((building) => !building.garden && !building.track && !building.yard), ...urbanBuildings];

  const trees = [];
  for (let i = 0; i < 110; i += 1) {
    const x = 3000 + ((i * 137) % 1500);
    const y = 80 + ((i * 211) % 1350);
    trees.push({ x, y, r: 10 + ((i * 7) % 12) });
  }
  for (let i = 0; i < 64; i += 1) {
    trees.push({ x: 170 + ((i * 613) % 5900), y: 160 + ((i * 877) % 3700), r: 8 + ((i * 5) % 8) });
  }

  const npcColors = ["#df8c35", "#62c4d7", "#c67ad8", "#d5bd46", "#66b777", "#e46d6d"];
  const workSpots = [
    { x: 360, y: 1552, activity: "comprando mandado" },
    { x: 1005, y: 1760, activity: "saliendo del City Club" },
    { x: 1545, y: 1338, activity: "esperando comida" },
    { x: 2080, y: 1648, activity: "recogiendo una pizza" },
    { x: 2828, y: 1422, activity: "comprando en El Pelícano" },
    { x: 3905, y: 2240, activity: "viendo qué empeñar" },
    { x: 4465, y: 2095, activity: "haciendo fila en el cajero" },
    { x: 4575, y: 1002, activity: "saliendo de La Marina" },
    { x: 4810, y: 2690, activity: "esperando en el taller" },
    { x: 5380, y: 1580, activity: "haciéndose que estudia" },
    { x: 5505, y: 805, activity: "preguntando por un detenido" },
    { x: 5905, y: 3708, activity: "yendo a Agronomía" },
  ];
  const leisureSpots = [
    { x: 3370, y: 875, activity: "cayendo al jardín" },
    { x: 3100, y: 2250, activity: "dando la vuelta por el centro" },
    { x: 4200, y: 1775, activity: "buscando dónde cenar" },
    { x: 5365, y: 3460, activity: "viendo los arrancones" },
    { x: 2010, y: 1810, activity: "esperando a alguien que dijo ahorita" },
    { x: 1220, y: 2460, activity: "sacando el fresco" },
  ];
  const npcRoles = ["empleado", "estudiante", "cliente", "repartidor", "vecino", "trabajador"];

  function sidewalkPoint(road, t, side = 1, extra = 19) {
    const position = pathPosition(road, t);
    const offset = road.width / 2 + extra;
    return {
      x: clamp(position.x - Math.sin(position.angle) * offset * side, 20, WORLD.width - 20),
      y: clamp(position.y + Math.cos(position.angle) * offset * side, 20, WORLD.height - 20),
      angle: position.angle,
    };
  }

  function createCivilian(index) {
    const homeRoad = residentialRoads[(index * 5 + 3) % residentialRoads.length];
    const commuteRoad = roads[(index * 7 + 2) % roads.length];
    const home = sidewalkPoint(homeRoad, 0.12 + ((index * 0.173) % 0.74), index % 2 ? 1 : -1, 17);
    const start = sidewalkPoint(commuteRoad, 0.08 + ((index * 0.137) % 0.84), index % 3 ? 1 : -1, 18);
    const work = workSpots[index % workSpots.length];
    const leisure = leisureSpots[(index * 3 + 1) % leisureSpots.length];
    return {
      id: `npc-${index}`,
      x: start.x,
      y: start.y,
      angle: start.angle,
      speed: 24 + (index % 4) * 5,
      baseSpeed: 24 + (index % 4) * 5,
      timer: 1 + (index % 5),
      color: npcColors[index % npcColors.length],
      stunned: 0,
      health: 100,
      status: "active",
      cash: 4 + ((index * 13) % 48),
      courage: (index % 5) / 4,
      memory: 0,
      speech: "",
      speechTimer: 0,
      enemy: false,
      role: npcRoles[index % npcRoles.length],
      home,
      work: { x: work.x + (index % 4) * 14 - 21, y: work.y + (index % 3) * 14 - 14, activity: work.activity },
      leisure: { x: leisure.x + (index % 5) * 13 - 26, y: leisure.y + (index % 4) * 13 - 20, activity: leisure.activity },
      activity: "caminando por la ciudad",
      routineKey: "",
      waitTimer: 0,
      nightOwl: index % 9 === 0,
      hidden: false,
    };
  }

  const npcs = Array.from({ length: 120 }, (_, index) => createCivilian(index));
  for (let index = 0; index < 12; index += 1) {
    npcs.push({
      id: `jardin-${index}`,
      x: 3220 + (index % 4) * 85,
      y: 660 + Math.floor(index / 4) * 62,
      angle: (index / 12) * TAU,
      speed: 10 + (index % 3) * 4,
      timer: 1 + index * 0.17,
      color: npcColors[index % npcColors.length],
      stunned: 0,
      health: 100,
      status: "active",
      cash: 6 + ((index * 9) % 30),
      courage: (index % 4) / 4,
      memory: 0,
      speech: "",
      speechTimer: 0,
      enemy: false,
      gardenRegular: true,
      hidden: false,
    });
  }

  const trafficColors = ["#cc4c48", "#e6c852", "#3e86b8", "#d7d3c6", "#b860a7", "#75a75a", "#e29c42", "#7e65ad", "#4f827c", "#b94a4a"];
  // Se reparte el tráfico entre todas las vialidades existentes en vez de una
  // lista de índices a mano, que apuntaba a calles que ya no existen.
  // ---------------------------------------------------------------------------
  // MODELOS DE VEHÍCULO
  // Todos los carros eran el mismo rectángulo con distinto color. Aquí cada
  // tipo tiene silueta, proporciones y detalles propios, como en la calle:
  // el vocho, la combi, el taxi, la pickup y el camión de refrescos.
  // ---------------------------------------------------------------------------
  const VEHICLE_MODELS = {
    sedan:    { w: 30, l: 60, cabin: 0.34, roofAt: 0.30, wheel: 16, name: "sedán" },
    compacto: { w: 28, l: 52, cabin: 0.38, roofAt: 0.28, wheel: 14, name: "compacto" },
    vocho:    { w: 28, l: 48, cabin: 0.42, roofAt: 0.26, wheel: 14, name: "vocho", round: true },
    pickup:   { w: 32, l: 68, cabin: 0.26, roofAt: 0.20, wheel: 17, name: "pickup", bed: true },
    combi:    { w: 32, l: 66, cabin: 0.5, roofAt: 0.16, wheel: 16, name: "combi", tall: true },
    taxi:     { w: 30, l: 60, cabin: 0.34, roofAt: 0.30, wheel: 16, name: "taxi", taxi: true },
    camion:   { w: 38, l: 96, cabin: 0.2, roofAt: 0.12, wheel: 20, name: "camión", box: true },
    patrulla: { w: 31, l: 62, cabin: 0.32, roofAt: 0.30, wheel: 16, name: "patrulla" },
    troca:    { w: 34, l: 82, cabin: 0.28, roofAt: 0.22, wheel: 18, name: "troca", bed: true },
  };

  const CIVIL_MODELS = ["sedan", "compacto", "vocho", "pickup", "combi", "taxi", "sedan", "compacto", "camion"];

  const trafficRoads = Array.from({ length: 48 }, (_, index) => index % roads.length);
  const traffic = trafficRoads.map((road, index) => {
    const cruiseSpeed = 0.0105 + (index % 6) * 0.00165;
    return {
      id: `traffic-${index}`,
      road,
      t: (0.045 + index * 0.163) % 1,
      speed: cruiseSpeed,
      cruiseSpeed,
      color: trafficColors[index % trafficColors.length],
      model: CIVIL_MODELS[index % CIVIL_MODELS.length],
      reverse: index % 3 === 1,
      collisionCooldown: 0,
      braking: false,
      hidden: false,
    };
  });

  function segmentIntersectionPoint(a, b, c, d) {
    const denominator = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
    if (Math.abs(denominator) < 0.0001) return null;
    const ua = ((d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0])) / denominator;
    const ub = ((b[0] - a[0]) * (a[1] - c[1]) - (b[1] - a[1]) * (a[0] - c[0])) / denominator;
    if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
    return { x: a[0] + ua * (b[0] - a[0]), y: a[1] + ua * (b[1] - a[1]) };
  }

  function buildRoadIntersections() {
    const found = [];
    const major = roads.filter((road) => road.width >= 104);
    for (let first = 0; first < major.length; first += 1) {
      for (let second = first + 1; second < major.length; second += 1) {
        for (let aIndex = 0; aIndex < major[first].points.length - 1; aIndex += 1) {
          const a = major[first].points[aIndex];
          const b = major[first].points[aIndex + 1];
          for (let cIndex = 0; cIndex < major[second].points.length - 1; cIndex += 1) {
            const c = major[second].points[cIndex];
            const d = major[second].points[cIndex + 1];
            const point = segmentIntersectionPoint(a, b, c, d);
            if (!point || point.x < 70 || point.y < 70 || point.x > WORLD.width - 70 || point.y > WORLD.height - 70) continue;
            if (found.some((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) < 230)) continue;
            found.push({
              x: point.x,
              y: point.y,
              angleA: Math.atan2(b[1] - a[1], b[0] - a[0]),
              angleB: Math.atan2(d[1] - c[1], d[0] - c[0]),
              widthA: major[first].width,
              widthB: major[second].width,
              phase: found.length % 2,
            });
          }
        }
      }
    }
    return found;
  }

  function buildStreetLights() {
    const lights = [];
    roads.forEach((road, roadIndex) => {
      if (road.width < 112) return;
      for (let marker = 1; marker <= 5; marker += 1) {
        const t = marker / 6;
        const side = (roadIndex + marker) % 2 ? 1 : -1;
        const position = sidewalkPoint(road, t, side, 10);
        lights.push({ x: position.x, y: position.y, angle: position.angle, side });
      }
    });
    return lights;
  }

  const roadIntersections = buildRoadIntersections();
  const streetLights = buildStreetLights();

  const pickups = [];
  const policeUnits = [];
  const policeOfficers = [];
  const policeShouts = [
    "¡Al suelo, Eve!",
    "¡Ya valiste!",
    "¡No te muevas!",
    "¡Unidad 12, la tengo!",
    "¡Tírate o disparo!",
  ];
  const patrols = [];
  const roadblocks = [];
  const projectiles = [];
  const tutorialCholos = [];
  const storyEnemies = [];

  const weapons = {
    fists: { name: "PUÑOS", damage: 42, range: 40, cooldown: 0.38, lethal: false, ammo: Infinity },
    rock: { name: "PIEDRA", damage: 58, range: 48, cooldown: 0.52, lethal: false, ammo: Infinity },
    knuckles: { name: "MANOPLA", damage: 72, range: 42, cooldown: 0.34, lethal: false, ammo: Infinity },
    bottle: { name: "BOTELLA QUEBRADA", damage: 105, range: 44, cooldown: 0.46, lethal: true, ammo: Infinity },
    pistol: { name: "PISTOLA", damage: 120, range: 620, cooldown: 0.48, lethal: true, ammo: 0 },
    smg: { name: "METRALLETA", damage: 120, range: 540, cooldown: 0.11, lethal: true, ammo: 0 },
  };

  const state = {
    started: false,
    paused: false,
    scene: "city",
    stage: 0,
    money: 25,
    bank: 500,
    health: 100,
    armor: 0,
    energy: 100,
    wanted: 0,
    wantedTimer: 0,
    hurtFlash: 0,
    regenDelay: 0,
    evading: false,
    packages: 0,
    shake: 0,
    lastDeathCause: "",
    time: 12 * 60 + 10,
    day: 0,
    player: { x: 1700, y: 1005, angle: -Math.PI / 2, radius: 15, punch: 0, invulnerable: 0, caguamaVisible: 0 },
    truck: { x: 1840, y: 900, angle: 0, speed: 0, radius: 31, health: 100, fuel: 100, destroyed: false, engine: 0, handling: 0, armor: 0, paint: "#194c38", model: "troca" },
    inVehicle: false,
    vehicleKind: "truck",
    stolenCar: null,
    stifFollowing: false,
    stif: { x: 3375, y: 760, angle: Math.PI / 2, protected: true, health: 100, status: "active", stunned: 0, color: "#d7a82d" },
    rochi: { x: 3420, y: 790, angle: Math.PI / 2, available: false, following: false, cash: 18450, asleep: false, askedRide: false, rideRequest: false, loan: null, loanOffer: false, lastLoanAskDay: -1, protected: true, health: 100, status: "active", stunned: 0, color: "#ded3bd" },
    fede: { x: 4950, y: 1035, angle: Math.PI, available: false, protected: true, health: 100, status: "active", stunned: 0, color: "#4e83a8" },
    inventory: { caguama: 0, takis: 0, raffleItems: [] },
    ownedWeapons: ["fists"],
    equippedWeapon: "fists",
    ammo: { pistol: 0, smg: 0 },
    energyBuff: 0,
    raffleUnlocked: false,
    didiUnlocked: false,
    didi: { active: false, phase: "idle", rating: 5, commission: 0.1, completed: 0, timer: 0, crashes: 0, pickup: null, dropoff: null, pay: 0 },
    race: { active: false, checkpoint: 0, elapsed: 0, fee: 0, bet: 0, targetPlace: 0 },
    jail: { active: false, remaining: 0 },
    news: ["Vecinos reportan otro día sospechosamente tranquilo en la Villa."],
    newsClock: 38,
    tutorialPrize: null,
    tutorialFlags: {},
    freeRoam: false,
    story: {
      mission: "locked",
      step: 0,
      completed: { fede: false, cbtis: false, corralon: false, agronomia: false, rochiTruth: false },
      corralonUnlocked: false,
      fedeRewardGross: 4000,
      fedeRewardPhase: "idle",
      fedeCar: null,
      bike: null,
      valves: [],
      tail: null,
    },
    settings: {
      muted: false,
      sfxVolume: 0.75,
      radioVolume: 0.42,
      station: "quebradora",
      steeringSensitivity: 1,
      touchSensitivity: 1,
      bindings: { ...defaultBindings },
    },
    dialogue: null,
    completedShown: false,
  };

  const defaultState = JSON.parse(JSON.stringify(state));
  const camera = { x: 0, y: 0, zoom: 1 };
  const view = { width: 800, height: 600, dpr: 1, bufferWidth: 480, bufferHeight: RENDER_HEIGHT, pixelScale: 2 };
  const input = { keys: new Set(), joystick: { x: 0, y: 0 }, run: false, handbrake: false };
  const particles = [];
  let joystickPointer = null;
  let lastTime = performance.now();
  let saveAccumulator = 0;
  let audioContext = null;
  let masterGain = null;
  let engineOscillator = null;
  let engineGain = null;
  let radioClock = 0;
  let radioStep = -1;
  let radioHudTimer = 0;
  let sirenClock = 0;
  let sirenPhase = false;
  let ambientClock = 3;
  let pendingBinding = null;
  let gpsCache = { key: "", fromX: 0, fromY: 0, path: [], age: 99 };
  let panelHandlers = [];
  let lastAreaName = "";
  let areaBannerTimer = 0;

  const missionCopy = [
    { objective: "IR AL JARDÍN DEL PISTO", phone: "Busca a Stif en el Jardín del Pisto" },
    { objective: "HABLAR CON STIF", phone: "Stif está esperando en el jardín" },
    { objective: "VISITAR EL PELÍCANO CON STIF", phone: "Enséñale a Stif dónde se compran las caguamas" },
    { objective: "COMPRAR CAGUAMA Y TAKIS FUEGO", phone: "Compra una caguama y Takis Fuego dentro de El Pelícano" },
    { objective: "RETIRAR EFECTIVO EN EL CAJERO", phone: "El banco está protegido; para comprar necesitas sacar efectivo" },
    { objective: "PROBAR LA RIFA DE STIF", phone: "Stif dejó dinero para una tirada en Rifas El Aferrado" },
    { objective: "VENDER EL PREMIO EN EL EMPEÑO", phone: "Vende el premio de prueba en Empeño Volcán" },
    { objective: "TUNEAR LA CAMIONETA DE EVE", phone: "Lleva la camioneta al Taller El Volcán" },
    { objective: "PROBAR UN ARRANCÓN", phone: "Ve a los arrancones del Tercer Anillo" },
    { objective: "VOLVER AL JARDÍN DEL PISTO", phone: "Regresa con Stif al Jardín del Pisto" },
    { objective: "ACABAR CON LOS CHOLOS", phone: "Defiende a Stif de los cholos" },
    { objective: "HUIR DE SUS COMPAS EN MOTO", phone: "Sube a la camioneta y pierde a los motociclistas" },
    { objective: "CONOCER A ROCHI EN EL JARDÍN", phone: "Rochi salió de La Marina y cayó al jardín" },
    { objective: "MUNDO LIBRE · COLIMA ES TUYO", phone: "Explora, trabaja, corre, pistea o arma un desmadre" },
  ];

  const storyCopy = {
    fede: [
      { objective: "HABLAR CON FEDE", phone: "Fede necesita ayuda con el Nissan Sentra 2000 que volvió a prestar" },
      { objective: "BUSCAR EL SENTRA EN EL LOTE", phone: "Rochi consiguió la ubicación. Ve al lote junto al Libramiento" },
      { objective: "PELEAR CONTRA LOS CHOLOS", phone: "Recupera las llaves del Sentra. Los enemigos de esta pelea no generan estrellas" },
      { objective: "ROBAR EL NISSAN SENTRA 2000", phone: "Súbete al Sentra de Fede antes de que lleguen más" },
      { objective: "ENTREGAR EL SENTRA · 2 ESTRELLAS", phone: "Lleva el auto con Fede sin destruirlo. La búsqueda no bajará de dos estrellas" },
    ],
    cbtis: [
      { objective: "IR AL CBTIS 19", phone: "Pregunta a un maestro por el proyecto de tesis" },
      { objective: "DEFIENDE TU CERTIFICADO DE PREPA", phone: "Los profes quieren quitarles el certificado a Eve y Rochi por ‘faltistas’" },
    ],
    corralon: [
      { objective: "IR AL CORRALÓN DE SEPAROS", phone: "La moto de Rochi sigue encerrada junto a los separos" },
      { objective: "ROBAR LA MOTO DE ROCHI", phone: "Entra al corralón y súbete a la moto" },
      { objective: "PIERDE LAS 4 ESTRELLAS", phone: "Escapa en la moto. Cuatro estrellas se pueden perder; cinco ya conocen tu posición" },
    ],
    agronomia: [
      { objective: "IR AL CAMPUS DE AGRONOMÍA", phone: "La tesis por fin necesita algo más útil que una pelea: revisar el riego" },
      { objective: "REVISAR 4 VÁLVULAS DE RIEGO", phone: "Recorre las parcelas y activa cada punto de muestreo. Es trabajo legal, increíblemente" },
      { objective: "ENTREGAR LAS MUESTRAS", phone: "Vuelve al acceso del campus con las cuatro mediciones" },
    ],
    rochiTruth: [
      { objective: "BUSCAR A ROCHI EN LA MARINA", phone: "Rochi dice que salió sin un peso. Síguelo sin que te vea" },
      { objective: "SEGUIR A ROCHI SIN QUEMARTE", phone: "Mantente entre 110 y 430 metros. Muy cerca sospecha; muy lejos se pierde" },
      { objective: "ENTRAR AL BANCO", phone: "El pobre sin dinero acaba de entrar al banco. Qué misterio tan cabrón" },
    ],
  };

  const POI = {
    houseDoor: { x: 1700, y: 982 },
    garden: { x: 3360, y: 865 },
    pelicano: { x: 2828, y: 1418 },
    raffle: { x: 3388, y: 1995 },
    pawn: { x: 3905, y: 2235 },
    bank: { x: 4465, y: 2092 },
    garage: { x: 4810, y: 2685 },
    gas: { x: 3485, y: 2725 },
    race: { x: 5365, y: 3455 },
    separos: { x: 5505, y: 790 },
    marina: { x: 4580, y: 985 },
    rochiHome: { x: 4840, y: 1625 },
    escape: { x: 2240, y: 3150 },
    fede: { x: 4950, y: 1035 },
    fedeLot: { x: 1210, y: 3260 },
    fedeCar: { x: 1325, y: 3250 },
    fedeDelivery: { x: 5005, y: 1050 },
    cbtis: { x: 5380, y: 1565 },
    agronomia: { x: 5910, y: 3715 },
    corralon: { x: 5985, y: 835 },
    rochiBike: { x: 6010, y: 650 },
  };

  // Los puntos de interés viven aparte de los edificios, así que se mueven con
  // el mismo desplazamiento; si no, las misiones apuntarían a un lote vacío.
  (() => {
    const links = {
      "eve-house": ["houseDoor"],
      jardin: ["garden"],
      pelicano: ["pelicano"],
      rifa: ["raffle"],
      empeno: ["pawn"],
      banco: ["bank"],
      taller: ["garage"],
      gasolinera: ["gas"],
      arrancones: ["race"],
      separos: ["separos"],
      marina: ["marina"],
      "rochi-home": ["rochiHome"],
      cbtis19: ["cbtis"],
      agronomia: ["agronomia"],
      corralon: ["corralon", "rochiBike"],
      "fede-lot": ["fedeLot", "fedeCar"],
    };
    for (const [id, keys] of Object.entries(links)) {
      const shift = buildingShifts.get(id);
      if (!shift) continue;
      for (const key of keys) {
        if (!POI[key]) continue;
        POI[key].x += shift.dx;
        POI[key].y += shift.dy;
      }
    }
    // Eve, su troca y los personajes arrancan pegados a su lugar, no en la
    // coordenada vieja que se quedó a media avenida.
    const houseShift = buildingShifts.get("eve-house");
    if (houseShift) {
      state.player.x += houseShift.dx;
      state.player.y += houseShift.dy;
      state.truck.x += houseShift.dx;
      state.truck.y += houseShift.dy;
    }
    const gardenShift = buildingShifts.get("jardin");
    if (gardenShift) {
      for (const person of [state.stif, state.rochi]) {
        person.x += gardenShift.dx;
        person.y += gardenShift.dy;
      }
    }
    const marinaShift = buildingShifts.get("marina");
    if (marinaShift) {
      state.fede.x += marinaShift.dx;
      state.fede.y += marinaShift.dy;
      POI.fede.x += marinaShift.dx;
      POI.fede.y += marinaShift.dy;
      POI.fedeDelivery.x += marinaShift.dx;
      POI.fedeDelivery.y += marinaShift.dy;
    }
  })();

  const interiors = {
    house: {
      label: "CASA DE EVE", floor: "#aa9b82", exit: POI.houseDoor,
      furniture: [
        { x: 70, y: 90, w: 235, h: 95, color: "#624a45", label: "COCINA" },
        { x: 650, y: 78, w: 170, h: 115, color: "#595e6c", label: "TV" },
        { x: 95, y: 375, w: 165, h: 90, color: "#315863", label: "SILLÓN" },
        { x: 630, y: 370, w: 185, h: 105, color: "#315863", label: "SILLÓN" },
        { x: 365, y: 315, w: 175, h: 90, color: "#6a4f40", label: "MESA" },
      ],
    },
    pelicano: {
      label: "EL PELÍCANO", floor: "#b5aa8c", exit: POI.pelicano, service: { type: "pelicano-shop", x: 450, y: 205 },
      clerk: { name: "DOÑA MARU", shirt: "#a8555f", hair: "#3d2a1c", skin: "#c98d63", longHair: true, line: "Fría o al tiempo, mija." },
      furniture: [
        { x: 80, y: 80, w: 115, h: 350, color: "#604a34", label: "CAGUAMAS" },
        { x: 705, y: 80, w: 115, h: 350, color: "#604a34", label: "BOTANA" },
        { x: 300, y: 75, w: 300, h: 95, color: "#384149", label: "MOSTRADOR" },
      ],
    },
    marina: {
      label: "LA MARINA · SAN FERNANDO", floor: "#d6d2c6", exit: POI.marina, service: { type: "marina-counter", x: 450, y: 205 },
      clerk: { name: "CAJERA", shirt: "#3e75bb", hair: "#241a14", skin: "#d59a70", longHair: true, line: "¿Con tarjeta o efectivo?" },
      furniture: [
        { x: 65, y: 80, w: 155, h: 390, color: "#607b9c", label: "ROPA" },
        { x: 680, y: 80, w: 155, h: 390, color: "#607b9c", label: "HOGAR" },
        { x: 300, y: 75, w: 300, h: 100, color: "#334e73", label: "CAJAS" },
      ],
    },
    cbtis: {
      label: "CBTIS 19 · CONTROL ESCOLAR", floor: "#bbbda9", exit: POI.cbtis, service: { type: "cbtis-teacher", x: 450, y: 200 },
      clerk: { name: "PREFECTO", shirt: "#4a6b52", hair: "#1a1512", skin: "#a06a45", line: "Sin certificado no hay trámite." },
      furniture: [
        { x: 70, y: 80, w: 150, h: 360, color: "#68755e", label: "ARCHIVO" },
        { x: 680, y: 80, w: 150, h: 360, color: "#68755e", label: "ARCHIVO" },
        { x: 300, y: 70, w: 300, h: 95, color: "#5c493c", label: "ESCRITORIO" },
      ],
    },
    bank: {
      label: "BANCO COLIMA", floor: "#a9b6b8", exit: POI.bank, service: { type: "bank-counter", x: 450, y: 200 },
      clerk: { name: "EJECUTIVO", shirt: "#5b6470", hair: "#120f0e", skin: "#b87c53", line: "Pase a la ventanilla cuatro." },
      furniture: [
        { x: 70, y: 85, w: 145, h: 345, color: "#566970", label: "CAJEROS" },
        { x: 685, y: 85, w: 145, h: 345, color: "#566970", label: "VENTANILLAS" },
        { x: 290, y: 70, w: 320, h: 100, color: "#33464c", label: "CAJA" },
      ],
    },
    garage: {
      label: "TALLER EL VOLCÁN", floor: "#777b79", exit: POI.garage, service: { type: "garage-counter", x: 450, y: 205 },
      clerk: { name: "DON CHELO", shirt: "#6d5a3f", hair: "#3a3128", skin: "#a06a45", line: "Déjala y no preguntes." },
      furniture: [
        { x: 65, y: 80, w: 150, h: 365, color: "#494d50", label: "HERRAMIENTA" },
        { x: 685, y: 80, w: 150, h: 365, color: "#494d50", label: "REFACCIONES" },
        { x: 300, y: 75, w: 300, h: 95, color: "#682d4b", label: "MOSTRADOR" },
      ],
    },
    raffle: {
      label: "RIFAS EL AFERRADO", floor: "#8f7f9c", exit: POI.raffle, service: { type: "raffle-counter", x: 450, y: 205 },
      clerk: { name: "LA GÜERA", shirt: "#b0475f", hair: "#5a3a22", skin: "#d59a70", longHair: true, line: "Hoy sí cae, mija." },
      furniture: [
        { x: 70, y: 80, w: 150, h: 360, color: "#5d4670", label: "PREMIOS" },
        { x: 680, y: 80, w: 150, h: 360, color: "#5d4670", label: "BOLETOS" },
        { x: 300, y: 75, w: 300, h: 95, color: "#3d2f4c", label: "MOSTRADOR" },
      ],
    },
    pawn: {
      label: "EMPEÑO VOLCÁN", floor: "#a2916d", exit: POI.pawn, service: { type: "pawn-counter", x: 450, y: 205 },
      clerk: { name: "EL LIC", shirt: "#8a7652", hair: "#1f1a15", skin: "#b87c53", cap: true, line: "Te doy la mitad y ya." },
      furniture: [
        { x: 68, y: 80, w: 152, h: 360, color: "#6d5a35", label: "VITRINA" },
        { x: 680, y: 80, w: 152, h: 360, color: "#6d5a35", label: "BODEGA" },
        { x: 300, y: 75, w: 300, h: 95, color: "#4a3d24", label: "MOSTRADOR" },
      ],
    },
    gas: {
      label: "TIENDA DE LA GASOLINERA", floor: "#b8b5a4", exit: POI.gas, service: { type: "gas-counter", x: 450, y: 205 },
      clerk: { name: "MIRE", shirt: "#3f8a52", hair: "#241a14", skin: "#c98d63", longHair: true, line: "¿Le cargo o qué?" },
      furniture: [
        { x: 66, y: 80, w: 150, h: 360, color: "#4a6b52", label: "REFRIS" },
        { x: 682, y: 80, w: 150, h: 360, color: "#7a6b45", label: "SABRITAS" },
        { x: 300, y: 75, w: 300, h: 95, color: "#35473a", label: "CAJA" },
      ],
    },
  };

  // Circuito de arrancones: una vuelta completa al anillo periférico. Antes
  // eran siete puntos sueltos por el mapa que ni seguían una calle.
  const raceRoute = (() => {
    const ring = roads.find((road) => road.ring) || roads[0];
    const points = [];
    const checkpoints = 12;
    for (let i = 0; i < checkpoints; i += 1) {
      const position = pathPosition(ring, i / checkpoints);
      points.push({ x: Math.round(position.x), y: Math.round(position.y) });
    }
    points.push({ ...points[0] });
    return points;
  })();

  const didiStops = [
    { name: "KFC Villa de Álvarez", x: 1550, y: 1335 },
    { name: "Little Caesars", x: 2090, y: 1645 },
    { name: "Barbacoa La Higuera", x: 2045, y: 520 },
    { name: "El Pelícano", x: 2828, y: 1418 },
    { name: "La Marina San Fernando", x: 4580, y: 985 },
    { name: "Campus Agronomía", x: 5910, y: 3715 },
  ];

  const weaponOrder = ["fists", "rock", "knuckles", "bottle", "pistol", "smg"];
  const civilianLines = [
    "¿Qué traes, pues?",
    "Pinche tráfico, como siempre.",
    "Yo nomás venía por tortillas.",
    "No mames, ahí viene Eve.",
    "Ahorita no, joven.",
    "Con este calor ni ganas dan.",
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function gameHour() {
    return Math.floor((state.time / 60) % 24);
  }

  function isNight() {
    const hour = gameHour();
    return hour >= 19 || hour < 6;
  }

  function currentAreaName() {
    if (state.scene !== "city") return interiors[state.scene]?.label || "Interior";
    const focus = getFocus();
    if (distance(focus, POI.garden) < 260) return "Jardín del Pisto · La Campana";
    if (focus.x > 5350 && focus.y > 3470) return "Zona de Agronomía";
    if (distance(focus, POI.race) < 420) return "Arrancones · Tercer Anillo";
    if (inProtectedLandscape(focus.x, focus.y, 0)) return "Área Natural Protegida La Campana";
    const district = districts.find((entry) => focus.x >= entry.x && focus.x <= entry.x + entry.w && focus.y >= entry.y && focus.y <= entry.y + entry.h);
    return district ? district.label.replace(" · ", " — ") : "Colima · Villa de Álvarez";
  }

  function updateAreaBanner(dt) {
    const areaName = currentAreaName();
    const banner = $("#area-banner");
    if (areaName !== lastAreaName) {
      lastAreaName = areaName;
      areaBannerTimer = 3.4;
      banner.textContent = areaName;
      banner.classList.add("visible");
    } else if (areaBannerTimer > 0) {
      areaBannerTimer = Math.max(0, areaBannerTimer - dt);
      if (areaBannerTimer === 0) banner.classList.remove("visible");
    }
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function smoothAngle(current, target, amount) {
    let diff = ((target - current + Math.PI * 3) % TAU) - Math.PI;
    return current + diff * amount;
  }

  // El canvas trabaja a resolución de consola vieja y el CSS lo estira con
  // image-rendering: pixelated. De ahí sale el pixel gordo de verdad, no un
  // vector suavizado fingiendo ser 8 bits.
  function resize() {
    const bounds = shell.getBoundingClientRect();
    view.width = Math.max(320, Math.floor(bounds.width));
    view.height = Math.max(400, Math.floor(bounds.height));
    const aspect = view.width / view.height;
    view.bufferHeight = RENDER_HEIGHT;
    view.bufferWidth = clamp(Math.round(RENDER_HEIGHT * aspect), 180, 900);
    view.pixelScale = view.height / view.bufferHeight;
    canvas.width = view.bufferWidth;
    canvas.height = view.bufferHeight;
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // Zoom en pixeles de buffer por unidad de mundo: fija cuánto mundo se ve
    // en vertical, así que Eve se ve igual de grande en cualquier pantalla.
    camera.zoom = desiredZoom();
  }

  function getMapBounds() {
    return state.scene === "city" ? WORLD : INTERIOR;
  }

  function activeVehicle() {
    if (state.vehicleKind === "stolen" && state.stolenCar) return state.stolenCar;
    if (state.vehicleKind === "fede" && state.story.fedeCar) return state.story.fedeCar;
    if (state.vehicleKind === "bike" && state.story.bike) return state.story.bike;
    return state.truck;
  }

  function getFocus() {
    return state.inVehicle ? activeVehicle() : state.player;
  }

  // El zoom de calle no sirve dentro de un local: el cuarto mide 900x650 y
  // se veía solo un pedazo. Adentro se encuadra el cuarto completo.
  function desiredZoom() {
    if (state.scene !== "city") {
      return clamp(Math.min(view.bufferWidth / (INTERIOR.width + 40), view.bufferHeight / (INTERIOR.height + 40)), 0.22, 1.1);
    }
    const speed = state.inVehicle ? Math.abs(activeVehicle().speed || 0) : 0;
    const openness = clamp(speed / 300, 0, 1);
    const worldHeight = lerp(WORLD_VIEW_HEIGHT, WORLD_VIEW_HEIGHT_FAST, openness);
    return clamp(view.bufferHeight / worldHeight, 0.3, 1.3);
  }

  function updateCamera(dt) {
    camera.zoom = lerp(camera.zoom, desiredZoom(), clamp(dt * (state.scene === "city" ? 2.2 : 7), 0, 1));
    const focus = getFocus();
    const bounds = getMapBounds();
    // Mira un poco hacia donde vas, para no ir siempre pegado al borde.
    const lead = state.inVehicle ? clamp(Math.abs(focus.speed || 0) * 0.42, 0, 130) : 34;
    const heading = state.inVehicle ? (focus.angle || 0) - Math.PI / 2 : (focus.angle || 0);
    const targetX = focus.x + Math.cos(heading) * lead - view.bufferWidth / camera.zoom / 2;
    const targetY = focus.y + Math.sin(heading) * lead - view.bufferHeight / camera.zoom / 2;
    const maxX = Math.max(0, bounds.width - view.bufferWidth / camera.zoom);
    const maxY = Math.max(0, bounds.height - view.bufferHeight / camera.zoom);
    camera.x = clamp(lerp(camera.x, targetX, 1 - Math.pow(0.0016, dt)), 0, maxX);
    camera.y = clamp(lerp(camera.y, targetY, 1 - Math.pow(0.0016, dt)), 0, maxY);
    if (state.shake > 0) {
      state.shake = Math.max(0, state.shake - dt * 2.6);
      camera.x += (Math.random() - 0.5) * state.shake * 9;
      camera.y += (Math.random() - 0.5) * state.shake * 9;
    }
  }

  function pointToSegmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    if (!lengthSq) return Math.hypot(px - ax, py - ay);
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function circleHitsRect(x, y, radius, rect) {
    const nearX = clamp(x, rect.x, rect.x + rect.w);
    const nearY = clamp(y, rect.y, rect.y + rect.h);
    const dx = x - nearX;
    const dy = y - nearY;
    return dx * dx + dy * dy < radius * radius;
  }

  function pointOnRoad(x, y, padding = 0) {
    for (const road of [...residentialRoads, ...roads]) {
      for (let i = 0; i < road.points.length - 1; i += 1) {
        const a = road.points[i];
        const b = road.points[i + 1];
        if (pointToSegmentDistance(x, y, a[0], a[1], b[0], b[1]) < road.width / 2 + padding) return true;
      }
    }
    return false;
  }

  function cityBlocked(x, y, radius, ignoreTruck = false) {
    if (x < radius || y < radius || x > WORLD.width - radius || y > WORLD.height - radius) return true;
    for (const building of solidBuildings) {
      if (circleHitsRect(x, y, radius + 3, building)) return true;
    }
    if (!ignoreTruck && !state.inVehicle && !state.truck.destroyed && Math.hypot(x - state.truck.x, y - state.truck.y) < radius + state.truck.radius) return true;
    if (!ignoreTruck && !state.inVehicle && state.stolenCar && Math.hypot(x - state.stolenCar.x, y - state.stolenCar.y) < radius + state.stolenCar.radius) return true;
    if (!ignoreTruck && !state.inVehicle && state.story.fedeCar && !state.story.fedeCar.destroyed && Math.hypot(x - state.story.fedeCar.x, y - state.story.fedeCar.y) < radius + state.story.fedeCar.radius) return true;
    if (!ignoreTruck && !state.inVehicle && state.story.bike && !state.story.bike.destroyed && Math.hypot(x - state.story.bike.x, y - state.story.bike.y) < radius + state.story.bike.radius) return true;
    // Los carros del tráfico no estaban en la colisión: Eve los atravesaba
    // como si fueran calcomanías del piso.
    if (!ignoreTruck && !state.inVehicle) {
      for (const car of traffic) {
        if (car.stolen || car.hidden || !Number.isFinite(car.x)) continue;
        if (Math.hypot(x - car.x, y - car.y) < radius + 24) return true;
      }
    }
    return false;
  }

  function lineOfSightBlocked(ax, ay, bx, by, padding = 3) {
    const distanceToTarget = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(distanceToTarget / 18));
    for (let index = 1; index < steps; index += 1) {
      const progress = index / steps;
      const x = lerp(ax, bx, progress);
      const y = lerp(ay, by, progress);
      if (solidBuildings.some((building) => circleHitsRect(x, y, padding, building))) return true;
    }
    return false;
  }

  function traceShotEndpoint(x, y, angle, range) {
    let last = { x, y };
    for (let distanceAlong = 14; distanceAlong <= range; distanceAlong += 14) {
      const point = { x: x + Math.cos(angle) * distanceAlong, y: y + Math.sin(angle) * distanceAlong };
      if (solidBuildings.some((building) => circleHitsRect(point.x, point.y, 2, building))) return last;
      last = point;
    }
    return last;
  }

  function interiorBlocked(x, y, radius) {
    if (x < 45 + radius || x > INTERIOR.width - 45 - radius || y < 45 + radius || y > INTERIOR.height - 22 - radius) return true;
    const furniture = interiors[state.scene]?.furniture || interiors.house.furniture;
    return furniture.some((rect) => circleHitsRect(x, y, radius, rect));
  }

  function moveCircle(entity, dx, dy, radius) {
    const blocked = state.scene !== "city" ? interiorBlocked : cityBlocked;
    if (!blocked(entity.x + dx, entity.y, radius)) entity.x += dx;
    if (!blocked(entity.x, entity.y + dy, radius)) entity.y += dy;
  }

  function inputVector() {
    const touch = state.settings.touchSensitivity;
    let x = input.joystick.x * touch;
    let y = input.joystick.y * touch;
    if (actionPressed("left") || input.keys.has("ArrowLeft")) x -= 1;
    if (actionPressed("right") || input.keys.has("ArrowRight")) x += 1;
    if (actionPressed("up") || input.keys.has("ArrowUp")) y -= 1;
    if (actionPressed("down") || input.keys.has("ArrowDown")) y += 1;
    const length = Math.hypot(x, y);
    if (length > 1) return { x: x / length, y: y / length, magnitude: 1 };
    return { x, y, magnitude: length };
  }

  function actionPressed(action) {
    return input.keys.has(state.settings.bindings[action] || defaultBindings[action]);
  }

  function updatePlayer(dt) {
    state.player.caguamaVisible = Math.max(0, state.player.caguamaVisible - dt);
    if (state.inVehicle) {
      updateTruck(dt);
      return;
    }

    const move = inputVector();
    const wantsRun = input.run || actionPressed("run") || input.keys.has("ShiftRight");
    const canRun = wantsRun && (state.energy > 1 || state.energyBuff > 0) && move.magnitude > 0.05;
    const speed = canRun ? 235 : 135;
    if (canRun && state.energyBuff <= 0) state.energy = clamp(state.energy - 19 * dt, 0, 100);
    else state.energy = clamp(state.energy + 10 * dt, 0, 100);
    state.energyBuff = Math.max(0, state.energyBuff - dt);

    if (move.magnitude > 0.05) {
      state.player.angle = Math.atan2(move.y, move.x);
      moveCircle(state.player, move.x * speed * dt, move.y * speed * dt, state.player.radius);
    }

    state.player.punch = Math.max(0, state.player.punch - dt);
    state.player.invulnerable = Math.max(0, state.player.invulnerable - dt);

    if (state.stifFollowing) updateFollower(state.stif, state.player, dt, 48);
    if (state.rochi.following && !state.rochi.asleep) updateFollower(state.rochi, state.player, dt, 62);
  }

  function updateFollower(person, target, dt, spacing) {
    if (person.status === "knocked") return;
    const dx = target.x - person.x;
    const dy = target.y - person.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > spacing) {
      person.angle = Math.atan2(dy, dx);
      const followSpeed = dist > 240 ? 260 : 125;
      const nextX = person.x + (dx / dist) * followSpeed * dt;
      const nextY = person.y + (dy / dist) * followSpeed * dt;
      if (!cityBlocked(nextX, nextY, 13, true)) {
        person.x = nextX;
        person.y = nextY;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // MANEJO
  // El modelo anterior era de tanque: el carro apuntaba y se movía en línea
  // recta hacia donde apuntaba. No había inercia, no había derrape y las
  // curvas se tomaban girando en el sitio. Este guarda la velocidad como
  // vector y la separa en avance y deslizamiento lateral, que es lo que
  // permite derrapar, contravolantear y sentir el peso del carro.
  // ---------------------------------------------------------------------------
  const skidMarks = [];

  // ---------------------------------------------------------------------------
  // PAQUETES ESCONDIDOS
  // No había ninguna razón para meterse por la ciudad: manejabas de un objetivo
  // al siguiente y lo de en medio daba igual. Estos son 40 bultos repartidos en
  // callejones, azoteas de un piso y rincones, con premio cada diez.
  // ---------------------------------------------------------------------------
  const HIDDEN_PACKAGE_TOTAL = 40;

  const hiddenPackages = (() => {
    const list = [];
    let attempts = 0;
    while (list.length < HIDDEN_PACKAGE_TOTAL && attempts < 4000) {
      attempts += 1;
      const seed = attempts * 37;
      const x = 200 + seededValue(seed) * (WORLD.width - 400);
      const y = 200 + seededValue(seed + 1) * (WORLD.height - 400);
      // Escondido de verdad: fuera del asfalto pero alcanzable a pie.
      if (pointOnRoad(x, y, 26)) continue;
      if (cityBlocked(x, y, 20, true)) continue;
      if (inProtectedLandscape(x, y, 20)) continue;
      if (list.some((entry) => Math.hypot(entry.x - x, entry.y - y) < 420)) continue;
      list.push({ x: Math.round(x), y: Math.round(y), taken: false });
    }
    return list;
  })();

  function packagesFound() {
    return hiddenPackages.filter((entry) => entry.taken).length;
  }

  function updateHiddenPackages() {
    if (state.scene !== "city" || state.inVehicle) return;
    for (const bundle of hiddenPackages) {
      if (bundle.taken) continue;
      if (distance(state.player, bundle) > 42) continue;
      bundle.taken = true;
      state.packages = packagesFound();
      state.money += 120;
      sound("pickup");
      impactParticles(bundle.x, bundle.y, palette.acid);
      const total = state.packages;
      // Premio cada diez, para que valga la pena seguir buscando.
      if (total % 10 === 0) {
        if (total === 10) {
          state.armor = 100;
          showHint(`PAQUETE ${total}/${HIDDEN_PACKAGE_TOTAL} · blindaje completo`, 2600);
        } else if (total === 20) {
          grantWeapon("pistol", 24);
          showHint(`PAQUETE ${total}/${HIDDEN_PACKAGE_TOTAL} · pistola con parque`, 2600);
        } else if (total === 30) {
          state.truck.engine = clamp(state.truck.engine + 1, 0, 3);
          state.truck.handling = clamp(state.truck.handling + 1, 0, 3);
          showHint(`PAQUETE ${total}/${HIDDEN_PACKAGE_TOTAL} · la troca quedó más perra`, 2600);
        } else {
          state.money += 5000;
          grantWeapon("smg", 60);
          showHint(`PAQUETE ${total}/${HIDDEN_PACKAGE_TOTAL} · los encontraste todos: $5,000 y metralleta`, 3400);
          addNews("Alguien anda vaciando los escondites de media Colima. Nadie sospecha de Eve.");
        }
        sound("phone");
      } else {
        showHint(`Paquete escondido ${total}/${HIDDEN_PACKAGE_TOTAL} · $120`, 1500);
      }
      saveGame();
      return;
    }
  }

  function drawHiddenPackages() {
    const focus = getFocus();
    for (const bundle of hiddenPackages) {
      if (bundle.taken || !visiblePoint(bundle, 60)) continue;
      // Solo brillan de cerca: si se vieran desde lejos no habría que buscar.
      const near = distance(focus, bundle) < 340;
      const bob = Math.round(Math.sin(performance.now() / 320 + bundle.x) * 3);
      ctx.save();
      ctx.translate(px(bundle.x), px(bundle.y + bob));
      ctx.fillStyle = "rgba(6,8,12,.4)";
      ctx.fillRect(-9, 7, 20, 5);
      bevelRect(-10, -9, 20, 17, "#9a7645", "#c09a5f", "#6a4f2c", 2);
      ctx.fillStyle = "#c8b070";
      ctx.fillRect(-10, -3, 20, 4);
      ctx.fillRect(-2, -9, 4, 17);
      outlineRect(-10, -9, 20, 17, palette.outline, 2);
      if (near) {
        ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 240) * 0.2;
        ctx.fillStyle = palette.acid;
        ctx.fillRect(-13, -12, 26, 3);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }


  function pushSkid(vehicle, strength) {
    const heading = vehicle.angle - Math.PI / 2;
    const side = heading + Math.PI / 2;
    const halfTrack = 17;
    for (const sign of [-1, 1]) {
      skidMarks.push({
        x: vehicle.x + Math.cos(side) * halfTrack * sign - Math.cos(heading) * 22,
        y: vehicle.y + Math.sin(side) * halfTrack * sign - Math.sin(heading) * 22,
        angle: heading,
        life: 9,
        strength: clamp(strength, 0.2, 1),
      });
    }
    while (skidMarks.length > 420) skidMarks.shift();
  }

  function updateSkidMarks(dt) {
    for (let i = skidMarks.length - 1; i >= 0; i -= 1) {
      skidMarks[i].life -= dt;
      if (skidMarks[i].life <= 0) skidMarks.splice(i, 1);
    }
  }

  function updateTruck(dt) {
    const vehicle = activeVehicle();
    if (vehicle.destroyed) {
      state.inVehicle = false;
      vehicle.speed = 0;
      vehicle.vx = 0;
      vehicle.vy = 0;
      showHint(state.vehicleKind === "truck" ? "La troca quedó hecha mierda. Sigue marcada para repararla." : "Ese carro ya dio lo que tenía que dar.", 1400);
      return;
    }
    const move = inputVector();
    const requestedThrottle = Math.abs(move.y) > 0.05 ? -move.y : input.run ? 1 : 0;
    const throttle = vehicle.fuel > 0 ? requestedThrottle : 0;
    const steer = move.x;
    const boost = actionPressed("run") || input.keys.has("ShiftRight");
    const handbrake = Boolean(input.handbrake);
    const tunePower = state.vehicleKind === "truck" ? 1 + state.truck.engine * 0.1 : 0.92;
    const handlingPower = state.vehicleKind === "truck" ? 1 + state.truck.handling * 0.12 : 0.92;
    const onRoad = pointOnRoad(vehicle.x, vehicle.y, -6);
    const acceleration = (boost ? 300 : 205) * tunePower * (onRoad ? 1 : 0.7);
    const maxSpeed = (boost ? 415 : 300) * tunePower * (onRoad ? 1 : 0.68);

    if (!Number.isFinite(vehicle.vx)) {
      const h0 = vehicle.angle - Math.PI / 2;
      vehicle.vx = Math.cos(h0) * (vehicle.speed || 0);
      vehicle.vy = Math.sin(h0) * (vehicle.speed || 0);
    }

    // ORDEN IMPORTANTE: primero se gira el volante, y solo después se mide
    // cuánto del movimiento quedó de lado respecto al nuevo rumbo. Si se mide
    // antes y se recompone después, el vector de velocidad gira pegado al
    // carro y nunca se despega: no hay derrape posible.
    const previousSpeed = vehicle.vx * Math.cos(vehicle.angle - Math.PI / 2) + vehicle.vy * Math.sin(vehicle.angle - Math.PI / 2);
    const speedRatio = clamp(Math.abs(previousSpeed) / Math.max(1, maxSpeed), 0, 1);
    if (Math.abs(previousSpeed) > 5) {
      // Se gira menos a alta velocidad, salvo con el freno de mano puesto.
      const turnRate = (handbrake ? 2.9 : lerp(2.4, 1.05, speedRatio)) * handlingPower * state.settings.steeringSensitivity;
      vehicle.angle += steer * Math.sign(previousSpeed) * turnRate * dt;
    }

    const fx = Math.cos(vehicle.angle - Math.PI / 2);
    const fy = Math.sin(vehicle.angle - Math.PI / 2);
    let forward = vehicle.vx * fx + vehicle.vy * fy;
    let lateral = vehicle.vx * -fy + vehicle.vy * fx;

    if (Math.abs(throttle) > 0.05) forward += throttle * acceleration * dt;
    else forward *= Math.pow(onRoad ? 0.34 : 0.14, dt);
    if (handbrake) forward *= Math.pow(0.3, dt);
    forward = clamp(forward, -125, maxSpeed);

    // Agarre lateral. Con freno de mano casi se pierde y el carro se va de
    // atrás; fuera del asfalto también agarra menos.
    const gripPerSecond = handbrake ? 0.55 : onRoad ? 0.0012 : 0.03;
    lateral *= Math.pow(gripPerSecond, dt);

    vehicle.vx = fx * forward + -fy * lateral;
    vehicle.vy = fy * forward + fx * lateral;
    vehicle.speed = forward;
    vehicle.slip = Math.abs(lateral);

    // Llanta quemada: marca en el piso y humo.
    vehicle.skidTimer = (vehicle.skidTimer || 0) - dt;
    const slipping = vehicle.slip > 46 || (handbrake && Math.abs(forward) > 70);
    if (slipping && vehicle.skidTimer <= 0) {
      vehicle.skidTimer = 0.03;
      pushSkid(vehicle, clamp(vehicle.slip / 180, 0.25, 1));
      if (Math.random() < 0.4) {
        particles.push({
          x: vehicle.x - fx * 24 + (Math.random() - 0.5) * 22,
          y: vehicle.y - fy * 24 + (Math.random() - 0.5) * 22,
          vx: (Math.random() - 0.5) * 40,
          vy: (Math.random() - 0.5) * 40,
          life: 0.5 + Math.random() * 0.4,
          color: "rgba(196,190,178,.55)",
        });
      }
    }
    // Vibra la cámara al ir a fondo: se siente la velocidad.
    if (Math.abs(forward) > maxSpeed * 0.82) state.shake = Math.max(state.shake, 0.16);

    const dx = vehicle.vx * dt;
    const dy = vehicle.vy * dt;
    let crashed = false;
    if (!cityBlocked(vehicle.x + dx, vehicle.y, vehicle.radius, true)) vehicle.x += dx;
    else crashed = true;
    if (!cityBlocked(vehicle.x, vehicle.y + dy, vehicle.radius, true)) vehicle.y += dy;
    else crashed = true;

    if (crashed) {
      const impact = Math.hypot(vehicle.vx, vehicle.vy);
      vehicle.vx *= -0.14;
      vehicle.vy *= -0.14;
      vehicle.speed *= -0.14;
      if (impact > 60) {
        damageEve(Math.min(8, impact * 0.02), "un putazo con la troca");
        vehicle.health = clamp(vehicle.health - Math.min(18, impact * 0.05) / (1 + (vehicle.armor || 0) * 0.18), 0, 100);
        impactParticles(vehicle.x, vehicle.y, "#e9d9ab");
        shakeCamera(clamp(impact / 260, 0.15, 1));
        sound("crash");
        state.didi.crashes += state.didi.active ? 1 : 0;
        if (state.didi.active) state.didi.rating = clamp(state.didi.rating - 0.7, 1, 5);
        if (vehicle.health <= 0) destroyVehicle(vehicle);
      }
    } else if (Math.abs(forward) > 6) {
      vehicle.fuel = clamp(vehicle.fuel - Math.abs(forward) * dt * 0.00013, 0, 100);
      ramNpcs(vehicle);
    }

    state.player.x = vehicle.x;
    state.player.y = vehicle.y;
    state.player.angle = vehicle.angle - Math.PI / 2;
  }

  function ramNpcs(vehicle) {
    if (Math.abs(vehicle.speed) < 55) return;
    for (const npc of [...tutorialCholos, ...storyEnemies, ...npcs]) {
      if (npc.status !== "active" || (npc.gardenRegular && isNight())) continue;
      if (distance(vehicle, npc) > vehicle.radius + 15) continue;
      const lethal = Math.abs(vehicle.speed) > 150;
      hitNpc(npc, { name: "VEHÍCULO", damage: lethal ? 130 : 70, lethal });
      vehicle.speed *= 0.72;
      vehicle.health = clamp(vehicle.health - 3, 0, 100);
      break;
    }
  }

  function damageEve(amount, source = "") {
    if (state.jail.active || state.health <= 0) return;
    let remaining = Math.max(0, amount);
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, remaining);
      state.armor -= absorbed;
      remaining -= absorbed;
    }
    const before = state.health;
    state.health = clamp(state.health - remaining, 0, 100);
    if (state.health < before) {
      state.regenDelay = 9;
      state.shake = Math.min(1.6, (state.shake || 0) + remaining / 26);
      state.hurtFlash = Math.min(0.55, (state.hurtFlash || 0) + 0.12 + remaining / 130);
      const focus = getFocus();
      impactParticles(focus.x, focus.y, "#c8324a");
      if (state.health <= 0 && !state.jail.active) {
        state.lastDeathCause = source || "los putazos";
      }
    }
  }

  function updateEveVitals(dt) {
    state.hurtFlash = Math.max(0, (state.hurtFlash || 0) - dt * 1.8);
    state.regenDelay = Math.max(0, (state.regenDelay || 0) - dt);
    // Regeneración lenta fuera de combate: hasta 45 de vida, para no dejarte muerto en vida.
    if (state.regenDelay <= 0 && state.wanted <= 0 && state.health > 0 && state.health < 45) {
      state.health = clamp(state.health + 3.2 * dt, 0, 45);
    }
  }

  function destroyVehicle(vehicle = activeVehicle()) {
    if (vehicle.destroyed) return;
    shakeCamera(1.2);
    vehicle.destroyed = true;
    vehicle.health = 0;
    vehicle.speed = 0;
    if (state.inVehicle) {
      state.inVehicle = false;
      state.player.x = clamp(vehicle.x + 58, 20, WORLD.width - 20);
      state.player.y = clamp(vehicle.y + 20, 20, WORLD.height - 20);
      damageEve(28);
    }
    if (vehicle === state.truck) {
      addNews("La camioneta de Eve quedó como monumento al mal manejo.");
      showHint("La camioneta quedó destruida, pero no desaparecerá del mapa.", 2100);
    } else if (vehicle === state.story.fedeCar && state.story.mission === "fede" && !state.story.completed.fede) {
      addNews("El Sentra de Fede duró menos recuperado que prestado.");
      failFedeMission("Destruiste el Sentra. Fede encontró la manera de prestártelo otra vez.");
    } else if (vehicle === state.story.bike && state.story.mission === "corralon" && !state.story.completed.corralon) {
      addNews("La moto de Rochi volvió al corralón por motivos que él atribuye a Eve.");
      failCorralonMission("La moto quedó destruida. Volvió misteriosamente al corralón.");
    } else {
      addNews("Vehículo ajeno queda tieso; nadie admite haberle dado las llaves a Eve.");
      showHint("El carro robado quedó destruido. Ese no tiene garantía de Eve.", 1900);
    }
  }

  function chooseOpenHeading(entity, desiredAngle, radius, lookAhead = 44) {
    const options = [0, 0.42, -0.42, 0.82, -0.82, 1.28, -1.28, Math.PI];
    for (const offset of options) {
      const angle = desiredAngle + offset;
      const nextX = entity.x + Math.cos(angle) * lookAhead;
      const nextY = entity.y + Math.sin(angle) * lookAhead;
      if (!cityBlocked(nextX, nextY, radius, true)) return angle;
    }
    return desiredAngle + Math.PI;
  }

  function moveTowardWithAvoidance(entity, target, dt, speed, radius, avoidCrowd = false) {
    let desiredX = target.x - entity.x;
    let desiredY = target.y - entity.y;
    if (avoidCrowd) {
      for (const other of npcs) {
        if (other === entity || other.hidden || other.status !== "active") continue;
        const dx = entity.x - other.x;
        const dy = entity.y - other.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < 44) {
          const weight = (44 - dist) / 44;
          desiredX += (dx / dist) * weight * 85;
          desiredY += (dy / dist) * weight * 85;
        }
      }
    }
    const desiredAngle = Math.atan2(desiredY, desiredX);
    const openAngle = chooseOpenHeading(entity, desiredAngle, radius, Math.max(34, speed * 0.38));
    entity.angle = smoothAngle(entity.angle || openAngle, openAngle, clamp(dt * 5.5, 0, 1));
    const dx = Math.cos(entity.angle) * speed * dt;
    const dy = Math.sin(entity.angle) * speed * dt;
    // Se prueba cada eje por separado: antes solo se probaba X y se movía en X e Y,
    // así que los NPC se metían por las paredes en vertical.
    let moved = false;
    if (!cityBlocked(entity.x + dx, entity.y, radius, true)) {
      entity.x += dx;
      moved = true;
    }
    if (!cityBlocked(entity.x, entity.y + dy, radius, true)) {
      entity.y += dy;
      moved = true;
    }
    return moved;
  }

  function routineTargetFor(npc) {
    const hour = (state.time / 60) % 24;
    if (hour < 5.5 && !npc.nightOwl) return { key: "sleep", target: npc.home, activity: "durmiendo" };
    if (hour < 9) return { key: "commute", target: npc.work, activity: "yendo al trabajo" };
    if (hour < 17.5) return { key: "work", target: npc.work, activity: npc.work.activity };
    if (hour < 22.5) return { key: "leisure", target: npc.leisure, activity: npc.leisure.activity };
    return { key: "home", target: npc.home, activity: "regresando a su casa" };
  }

  function nearestTrafficThreat(npc) {
    let nearest = null;
    let best = 78;
    for (const car of traffic) {
      if (car.hidden || car.stolen || !Number.isFinite(car.x)) continue;
      const dist = distance(npc, car);
      if (dist < best) {
        best = dist;
        nearest = car;
      }
    }
    return nearest;
  }

  function updateNpcs(dt) {
    if (state.scene === "cbtis") {
      for (const npc of storyEnemies) {
        if (npc.status !== "active") continue;
        npc.speechTimer = Math.max(0, (npc.speechTimer || 0) - dt);
        npc.stunned = Math.max(0, (npc.stunned || 0) - dt);
        if (npc.stunned > 0) continue;
        const dx = state.player.x - npc.x;
        const dy = state.player.y - npc.y;
        const dist = Math.hypot(dx, dy) || 1;
        npc.angle = Math.atan2(dy, dx);
        if (dist > 34) {
          const nx = npc.x + (dx / dist) * npc.speed * dt;
          const ny = npc.y + (dy / dist) * npc.speed * dt;
          if (!interiorBlocked(nx, npc.y, 11)) npc.x = nx;
          if (!interiorBlocked(npc.x, ny, 11)) npc.y = ny;
        } else if ((npc.timer -= dt) <= 0) {
          npc.timer = 0.85;
          damageEve(5);
        }
      }
      return;
    }
    if (state.scene !== "city") return;
    const focus = getFocus();
    for (const npc of [...npcs, ...tutorialCholos, ...storyEnemies]) {
      if (npc.status === "dead") continue;
      if (npc.gardenRegular && isNight()) {
        npc.hidden = true;
        continue;
      }
      npc.speechTimer = Math.max(0, (npc.speechTimer || 0) - dt);
      npc.memory = Math.max(0, (npc.memory || 0) - dt * 11);
      npc.stunned = Math.max(0, npc.stunned - dt);
      if (npc.status === "knocked") {
        npc.hidden = false;
        if (npc.stunned <= 0) {
          npc.status = "active";
          npc.health = 45;
          npc.angle = Math.atan2(npc.y - focus.y, npc.x - focus.x);
          npc.memory = Math.max(npc.memory, 35);
          sayNpc(npc, "No mames, esta vieja está loca.", 2.4);
        }
        continue;
      }
      if (npc.stunned > 0) continue;

      const distToEve = distance(npc, focus);
      let target = null;
      let speed = npc.baseSpeed || npc.speed || 28;
      if (npc.enemy && distToEve < 520) {
        npc.hidden = false;
        target = focus;
        speed = npc.motorcycle ? 175 : 76;
        if (distToEve < 42 && state.player.invulnerable <= 0) {
          damageEve(npc.motorcycle ? 11 : 7);
          state.player.invulnerable = 0.65;
          sayNpc(npc, "¡Órale, pues!", 1.1);
        }
      } else if ((npc.memory > 0 || state.wanted > 0) && distToEve < 310 && npc.courage < 0.75) {
        npc.hidden = false;
        const fleeDistance = 180 + (1 - npc.courage) * 90;
        const away = Math.atan2(npc.y - focus.y, npc.x - focus.x);
        target = { x: npc.x + Math.cos(away) * fleeDistance, y: npc.y + Math.sin(away) * fleeDistance };
        speed = 104;
        npc.activity = "huyendo del desmadre";
        if (!npc.speechTimer && Math.random() < dt * 0.55) sayNpc(npc, "¡Yo no vi nada, mamón!", 1.8);
      } else if (npc.gardenRegular) {
        npc.hidden = false;
        npc.timer -= dt;
        if (!npc.gardenTarget || npc.timer <= 0 || distance(npc, npc.gardenTarget) < 18) {
          npc.gardenTarget = { x: 3225 + Math.random() * 270, y: 650 + Math.random() * 150 };
          npc.timer = 3 + Math.random() * 6;
        }
        target = npc.gardenTarget;
        speed = 13;
        npc.activity = "cotorreando en el jardín";
      } else if (!npc.enemy) {
        const routine = routineTargetFor(npc);
        npc.routineKey = routine.key;
        npc.activity = routine.activity;
        npc.hidden = routine.key === "sleep" && distance(npc, npc.home) < 42 && npc.memory <= 0;
        if (npc.hidden) continue;
        const trafficThreat = nearestTrafficThreat(npc);
        if (trafficThreat) {
          const away = Math.atan2(npc.y - trafficThreat.y, npc.x - trafficThreat.x);
          target = { x: npc.x + Math.cos(away) * 130, y: npc.y + Math.sin(away) * 130 };
          speed = 118;
          npc.activity = "quitándose de un carro";
        } else {
          target = routine.target;
          if (distance(npc, target) < 38) {
            npc.waitTimer = Math.max(0, (npc.waitTimer || 0) - dt);
            speed = 0;
            if (!npc.speechTimer && npc.waitTimer <= 0 && Math.random() < dt * 0.08) {
              sayNpc(npc, Math.random() < 0.55 ? npc.activity : civilianLines[Math.floor(Math.random() * civilianLines.length)], 2.1);
              npc.waitTimer = 5 + Math.random() * 8;
            }
          }
        }
      } else {
        target = { x: npc.x + Math.cos(npc.angle) * 90, y: npc.y + Math.sin(npc.angle) * 90 };
      }

      if (target && speed > 0) {
        const moved = moveTowardWithAvoidance(npc, target, dt, speed, npc.motorcycle ? 16 : 10, !npc.enemy && !npc.gardenRegular);
        if (!moved) npc.angle += Math.PI * (0.5 + Math.random() * 0.5);
      }
    }
  }

  function updateNamedCharacters(dt) {
    for (const person of [state.stif, state.rochi, state.fede]) {
      person.speechTimer = Math.max(0, (person.speechTimer || 0) - dt);
      if (person.status !== "knocked") continue;
      person.stunned = Math.max(0, person.stunned - dt);
      if (person.stunned <= 0) {
        person.status = "active";
        person.health = 100;
        person.speech = person === state.rochi
          ? "Esto también fue culpa de Eve."
          : person === state.fede
            ? "No mames, por eso ya no presto nada… bueno, casi."
            : "Jajaja… no estuvo tan chido.";
        person.speechTimer = 2.4;
      }
    }
  }

  function sayNpc(npc, text, seconds = 2) {
    npc.speech = text;
    npc.speechTimer = seconds;
  }

  function updatePickups(dt) {
    if (state.scene !== "city") return;
    const focus = getFocus();
    for (let index = pickups.length - 1; index >= 0; index -= 1) {
      const pickup = pickups[index];
      pickup.life -= dt;
      if (distance(focus, pickup) < 36) {
        if (pickup.type === "cash") {
          state.money += pickup.amount;
          showHint(`Recogiste $${pickup.amount} en efectivo`, 850);
          sound("pickup");
        } else if (pickup.type === "weapon") {
          grantWeapon(pickup.weapon, pickup.ammo || 0);
          if (pickup.police) raiseWanted(3, "Recogió un arma policial");
        }
        pickups.splice(index, 1);
      } else if (pickup.life <= 0) {
        pickups.splice(index, 1);
      }
    }
  }

  function trafficGap(car, other) {
    if (car.road !== other.road || car.reverse !== other.reverse || car === other || other.stolen || other.hidden) return Infinity;
    const own = ((car.t % 1) + 1) % 1;
    const theirs = ((other.t % 1) + 1) % 1;
    return car.reverse ? (own - theirs + 1) % 1 : (theirs - own + 1) % 1;
  }

  function collideWithTraffic(car) {
    if (!state.inVehicle || car.stolen || car.hidden || car.collisionCooldown > 0) return;
    const vehicle = activeVehicle();
    if (vehicle.destroyed || distance(vehicle, car) > vehicle.radius + 27) return;
    car.collisionCooldown = 1.15;
    const impact = Math.max(45, Math.abs(vehicle.speed));
    vehicle.speed *= -0.22;
    vehicle.health = clamp(vehicle.health - Math.min(16, impact * 0.047) / (1 + (vehicle.armor || 0) * 0.18), 0, 100);
    damageEve(Math.min(7, impact * 0.018));
    state.didi.crashes += state.didi.active ? 1 : 0;
    if (state.didi.active) state.didi.rating = clamp(state.didi.rating - 0.7, 1, 5);
    impactParticles(vehicle.x, vehicle.y, "#f0c46d");
    showHint("Choque con tráfico real. Ese carro ya no era decoración.", 1200);
    sound("crash");
    if (vehicle.health <= 0) destroyVehicle(vehicle);
  }

  // Los carros iban justo sobre el eje de la calle, encima del camellón. Ahora
  // cada uno circula por su carril, según el sentido en el que va.
  function trafficLaneOffset(car) {
    const road = roads[car.road];
    const lanes = road.width >= 150 ? 3 : road.width >= 120 ? 2 : 1;
    const laneWidth = (road.width / 2 - 16) / lanes;
    const lane = (Number(car.id.split("-").pop()) % lanes) + 0.5;
    return (car.reverse ? -1 : 1) * lane * laneWidth;
  }

  function placeTrafficCar(car) {
    const road = roads[car.road];
    const position = pathPosition(road, car.t);
    const offset = trafficLaneOffset(car);
    const nx = Math.cos(position.angle + Math.PI / 2) * offset;
    const ny = Math.sin(position.angle + Math.PI / 2) * offset;
    car.x = position.x + nx;
    car.y = position.y + ny;
    car.angle = position.angle + Math.PI / 2 + (car.reverse ? Math.PI : 0);
    return position;
  }

  // Un mapa de 6400x4200 con 64 carros repartidos parejo se siente desierto:
  // casi nunca coincides con uno. Los que quedan lejos se reciclan cerca de
  // Eve, así que siempre hay tráfico donde estás sin simular cientos.
  function recycleTrafficCar(car, focus) {
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const roadIndex = Math.floor(Math.random() * roads.length);
      const t = Math.random();
      const position = pathPosition(roads[roadIndex], t);
      const dist = Math.hypot(position.x - focus.x, position.y - focus.y);
      if (dist < 380 || dist > 1050) continue;
      let occupied = false;
      for (const other of traffic) {
        if (other === car || !Number.isFinite(other.x)) continue;
        if (Math.hypot(other.x - position.x, other.y - position.y) < 96) { occupied = true; break; }
      }
      if (occupied) continue;
      car.road = roadIndex;
      car.t = t;
      car.speed = car.cruiseSpeed;
      car.collisionCooldown = 0;
      placeTrafficCar(car);
      return true;
    }
    return false;
  }

  function updateTraffic(dt) {
    const hour = (state.time / 60) % 24;
    const veryLate = hour >= 2 && hour < 5.5;
    const focus = getFocus();
    for (const car of traffic) {
      car.collisionCooldown = Math.max(0, (car.collisionCooldown || 0) - dt);
      car.hidden = veryLate && Number(car.id.split("-").pop()) % 3 !== 0;
      if (car.stolen) continue;

      car.recycleTimer = (car.recycleTimer || 0) + dt;
      if (car.recycleTimer > 0.7) {
        car.recycleTimer = 0;
        if (!Number.isFinite(car.x) || Math.hypot(car.x - focus.x, car.y - focus.y) > 1250) recycleTrafficCar(car, focus);
      }

      // Bucle simple en vez de Math.min(...traffic.map(...)): eran 64 arreglos
      // nuevos por cuadro nada más para sacar la distancia al de adelante.
      let gap = Infinity;
      for (const other of traffic) {
        const value = trafficGap(car, other);
        if (value < gap) gap = value;
      }
      const beforeMove = pathPosition(roads[car.road], car.t);
      car.stoppedAtLight = trafficMustStop(car, beforeMove);
      car.braking = gap < 0.052 || car.stoppedAtLight;
      const targetSpeed = car.stoppedAtLight ? 0 : car.braking ? car.cruiseSpeed * clamp(gap / 0.052, 0.08, 0.72) : car.cruiseSpeed;
      car.speed = lerp(car.speed, targetSpeed, clamp(dt * 2.8, 0, 1));
      car.t += car.speed * dt * (car.reverse ? -1 : 1);
      if (car.t > 1.08) car.t = -0.08;
      if (car.t < -0.08) car.t = 1.08;
      placeTrafficCar(car);
      if (!car.hidden) collideWithTraffic(car);
    }
    separateTraffic();
  }

  // Los carros solo miraban al de adelante de su MISMA calle y sentido. En un
  // cruce se juntan cuatro calles, así que se encimaban en un montón. Esto los
  // empuja para que nunca queden uno sobre otro.
  function separateTraffic() {
    for (let i = 0; i < traffic.length; i += 1) {
      const a = traffic[i];
      if (a.stolen || a.hidden || !Number.isFinite(a.x)) continue;
      for (let j = i + 1; j < traffic.length; j += 1) {
        const b = traffic[j];
        if (b.stolen || b.hidden || !Number.isFinite(b.x)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const gap = Math.hypot(dx, dy);
        if (gap >= 54 || gap === 0) continue;
        const push = (54 - gap) / 2;
        const nx = dx / gap;
        const ny = dy / gap;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        // El de atrás cede el paso en vez de empujar eternamente.
        if (a.speed > b.speed) a.speed *= 0.7;
        else b.speed *= 0.7;
      }
    }
  }

  function axisAngleDifference(a, b) {
    let diff = Math.abs(((a - b + Math.PI) % TAU) - Math.PI);
    if (diff > Math.PI / 2) diff = Math.PI - diff;
    return Math.abs(diff);
  }

  function trafficMustStop(car, position = pathPosition(roads[car.road], car.t)) {
    const heading = position.angle + (car.reverse ? Math.PI : 0);
    const hx = Math.cos(heading);
    const hy = Math.sin(heading);
    const cycle = Math.floor(state.time / 8) % 2;
    for (const crossing of roadIntersections) {
      const dx = crossing.x - position.x;
      const dy = crossing.y - position.y;
      const ahead = dx * hx + dy * hy;
      const lateral = Math.abs(dx * -hy + dy * hx);
      if (ahead < 24 || ahead > 82 || lateral > 46) continue;
      const usesA = axisAngleDifference(heading, crossing.angleA) <= axisAngleDifference(heading, crossing.angleB);
      const green = usesA ? cycle === crossing.phase : cycle !== crossing.phase;
      if (!green) return true;
    }
    return false;
  }

  function policeSkill() {
    // Escala por estrellas: a 1 estrella la policía es torpe a propósito.
    const stars = clamp(state.wanted, 1, 5);
    return {
      fireRange: 210 + stars * 62,
      fireDelay: clamp(3.4 - stars * 0.42, 1.1, 3.4),
      damage: 4 + stars * 1.6,
      accuracy: 0.34 + stars * 0.1,
      carSpeed: 128 + stars * 26,
      footSpeed: 96 + stars * 9,
      deployRange: 250 + stars * 40,
    };
  }

  function spawnFootCop(x, y, angle) {
    if (policeOfficers.length >= 10) return null;
    const officer = {
      x,
      y,
      angle: angle ?? 0,
      radius: 14,
      health: 100,
      status: "active",
      stunned: 0,
      police: true,
      onFoot: true,
      color: "#2c3e63",
      cash: 30 + Math.floor(Math.random() * 60),
      dropped: false,
      shotTimer: 0.6 + Math.random() * 1.1,
      speech: "",
      speechTimer: 0,
      memory: 99,
    };
    policeOfficers.push(officer);
    return officer;
  }

  function policeShootAt(shooter, focus, skill) {
    const endpoint = traceShotEndpoint(shooter.x, shooter.y, Math.atan2(focus.y - shooter.y, focus.x - shooter.x), skill.fireRange);
    projectiles.push({ x1: shooter.x, y1: shooter.y, x2: endpoint.x, y2: endpoint.y, life: 0.09, hostile: true });
    sound("shot");
    if (Math.random() < skill.accuracy) {
      damageEve(skill.damage, "policía");
      impactParticles(focus.x, focus.y, "#e34e62");
    } else {
      impactParticles(endpoint.x, endpoint.y, "#cfd4d8");
    }
  }

  function updatePoliceOfficers(dt) {
    const focus = getFocus();
    const skill = policeSkill();
    for (let index = policeOfficers.length - 1; index >= 0; index -= 1) {
      const officer = policeOfficers[index];
      if (distance(officer, focus) > 1400) {
        policeOfficers.splice(index, 1);
        continue;
      }
      if (officer.status === "dead") continue;
      officer.stunned = Math.max(0, (officer.stunned || 0) - dt);
      officer.speechTimer = Math.max(0, (officer.speechTimer || 0) - dt);
      if (officer.status === "knocked") {
        if (officer.stunned <= 0) {
          officer.status = "active";
          officer.health = 60;
        }
        continue;
      }
      if (officer.stunned > 0) continue;

      const dist = distance(officer, focus);
      officer.shotTimer = Math.max(0, officer.shotTimer - dt);
      officer.angle = Math.atan2(focus.y - officer.y, focus.x - officer.x);

      // Se acerca hasta distancia de tiro y ahí se planta.
      if (dist > 120 || state.inVehicle) {
        moveTowardWithAvoidance(officer, focus, dt, skill.footSpeed, officer.radius, true);
      } else if (dist < 62) {
        moveTowardWithAvoidance(officer, { x: officer.x * 2 - focus.x, y: officer.y * 2 - focus.y }, dt, skill.footSpeed * 0.6, officer.radius, false);
      }

      if (dist < skill.fireRange && officer.shotTimer <= 0 && !lineOfSightBlocked(officer.x, officer.y, focus.x, focus.y, 6)) {
        policeShootAt(officer, focus, skill);
        officer.shotTimer = skill.fireDelay * (0.8 + Math.random() * 0.5);
        if (Math.random() < 0.25) sayNpc(officer, policeShouts[Math.floor(Math.random() * policeShouts.length)], 1.6);
      }
    }
  }

  function updateWanted(dt) {
    if (state.scene !== "city") return;
    if (state.story.mission === "fede" && state.story.step === 4 && state.wanted < 2) {
      state.wanted = 2;
      state.wantedTimer = Math.max(state.wantedTimer, 10);
    }
    if (state.wanted <= 0) {
      policeUnits.length = 0;
      roadblocks.length = 0;
      updatePoliceOfficers(dt);
      return;
    }

    for (let index = policeUnits.length - 1; index >= 0; index -= 1) {
      if (policeUnits[index].status === "dead") policeUnits.splice(index, 1);
    }
    const focus = getFocus();
    const skill = policeSkill();
    const targetUnits = state.wanted === 5 ? 6 : Math.max(1, state.wanted);
    // Mientras estés evadiendo no se generan unidades nuevas. Antes aparecían
    // a 480-920 de distancia y el decaimiento exigía que la más cercana
    // estuviera a más de 780, así que una patrulla recién aparecida reiniciaba
    // el contador para siempre: perder una estrella era imposible.
    if (!state.evading) {
      while (policeUnits.length < targetUnits) spawnPoliceUnit(focus);
    }
    while (policeUnits.length > targetUnits) policeUnits.pop();

    let closest = Infinity;
    for (const unit of policeUnits) {
      if (unit.status === "dead") continue;
      const dx = focus.x - unit.x;
      const dy = focus.y - unit.y;
      const dist = Math.hypot(dx, dy) || 1;
      closest = Math.min(closest, dist);
      // Separación entre unidades: sin esto las patrullas se apilan en el
      // mismo pixel encima de Eve y parecen una sola.
      let steerX = dx;
      let steerY = dy;
      for (const other of policeUnits) {
        if (other === unit || other.status === "dead") continue;
        const ox = unit.x - other.x;
        const oy = unit.y - other.y;
        const gap = Math.hypot(ox, oy);
        if (gap > 0 && gap < 82) {
          const push = (82 - gap) / 82;
          steerX += (ox / gap) * push * 200;
          steerY += (oy / gap) * push * 200;
        }
      }
      const desiredHeading = Math.atan2(steerY, steerX);
      const openHeading = chooseOpenHeading(unit, desiredHeading, 24, 62 + state.wanted * 7);
      unit.heading = smoothAngle(unit.heading ?? unit.angle - Math.PI / 2, openHeading, clamp(dt * 3.4, 0, 1));
      unit.angle = unit.heading + Math.PI / 2;
      // Frena al acercarse en vez de empotrarse encima de Eve.
      const brake = dist < 90 ? clamp(dist / 90, 0.15, 1) : 1;
      const unitSpeed = skill.carSpeed * brake;
      const nextX = unit.x + Math.cos(unit.heading) * unitSpeed * dt;
      const nextY = unit.y + Math.sin(unit.heading) * unitSpeed * dt;
      if (!cityBlocked(nextX, nextY, 24, true)) {
        unit.x = nextX;
        unit.y = nextY;
      }
      unit.shotTimer = Math.max(0, unit.shotTimer - dt);

      // Bajan a pie cuando Eve va a pie y ya están cerca.
      unit.deployTimer = Math.max(0, (unit.deployTimer || 0) - dt);
      if (!state.inVehicle && dist < skill.deployRange && !unit.deployed && unit.deployTimer <= 0) {
        unit.deployed = true;
        const officers = state.wanted >= 3 ? 2 : 1;
        for (let i = 0; i < officers; i += 1) {
          spawnFootCop(unit.x + Math.cos(unit.heading + Math.PI / 2) * (18 + i * 14), unit.y + Math.sin(unit.heading + Math.PI / 2) * (18 + i * 14), unit.heading);
        }
        sayNpc(unit, "¡Bájate, Eve!", 1.6);
      }
      if (state.inVehicle) unit.deployed = false;

      // Disparan desde la patrulla, desde una estrella, con puntería mala al inicio.
      if (dist < skill.fireRange && unit.shotTimer <= 0 && !lineOfSightBlocked(unit.x, unit.y, focus.x, focus.y, 7)) {
        policeShootAt(unit, focus, skill);
        unit.shotTimer = skill.fireDelay * (0.9 + Math.random() * 0.6);
      }

      // Atropellón: pega y avienta, NO arresta.
      // El atropellón hacía daño en cada cuadro: a 60 fps eran hasta 600 de
      // daño por segundo y morías en menos de un segundo de tocarte.
      unit.ramCooldown = Math.max(0, (unit.ramCooldown || 0) - dt);
      if (dist < 34 && unit.ramCooldown <= 0) {
        unit.ramCooldown = 1.2;
        const impact = clamp(unitSpeed / 34, 2, 7);
        damageEve(impact, "patrulla");
        const push = state.inVehicle ? activeVehicle() : state.player;
        const away = Math.atan2(push.y - unit.y, push.x - unit.x);
        const nextPx = push.x + Math.cos(away) * 26;
        const nextPy = push.y + Math.sin(away) * 26;
        if (!cityBlocked(nextPx, nextPy, state.inVehicle ? 28 : 15, true)) {
          push.x = nextPx;
          push.y = nextPy;
        }
        if (state.inVehicle) {
          const vehicle = activeVehicle();
          vehicle.health = clamp(vehicle.health - 6, 0, 100);
          vehicle.speed *= 0.86;
          if (vehicle.health <= 0) destroyVehicle(vehicle);
        }
        impactParticles(unit.x + Math.cos(away) * 20, unit.y + Math.sin(away) * 20, "#e7ff1f");
        unit.x -= Math.cos(away) * 12;
        unit.y -= Math.sin(away) * 12;
      }
    }

    updatePoliceOfficers(dt);

    // Estás evadiendo cuando ninguna unidad te ve ni te tiene cerca. Es lo que
    // hace que esconderse funcione.
    let spotted = false;
    for (const unit of policeUnits) {
      if (unit.status === "dead") continue;
      const seen = distance(focus, unit) < 520 && !lineOfSightBlocked(unit.x, unit.y, focus.x, focus.y, 6);
      if (seen || distance(focus, unit) < 260) { spotted = true; break; }
    }
    if (!spotted) {
      for (const cop of policeOfficers) {
        if (cop.status !== "active") continue;
        if (distance(focus, cop) < 420 && !lineOfSightBlocked(cop.x, cop.y, focus.x, focus.y, 6)) { spotted = true; break; }
      }
    }
    state.evading = !spotted;

    if (state.wanted === 5) {
      state.wantedTimer = 30;
      showFiveStarNews();
      state.evading = false;
    } else if (state.evading) {
      state.wantedTimer -= dt;
      // Cuanto más lejos, más rápido se enfría.
      if (closest > 900) state.wantedTimer -= dt * 1.4;
      if (state.wantedTimer <= 0) {
        state.wanted -= 1;
        state.wantedTimer = state.wanted > 0 ? 11 : 0;
        showHint(state.wanted > 0 ? `Bajaste a ${state.wanted} ${state.wanted === 1 ? "estrella" : "estrellas"}` : "Los perdiste", 1500);
        if (state.wanted === 0) {
          policeUnits.length = 0;
          policeOfficers.length = 0;
          roadblocks.length = 0;
          addNews("La policía perdió a Eve. Dicen que casi la tenían, cómo no.");
        }
      }
    } else {
      state.wantedTimer = Math.max(state.wantedTimer, 9);
    }

    const requiredBlocks = state.wanted >= 5 ? 3 : state.wanted >= 4 ? 1 : 0;
    while (roadblocks.length < requiredBlocks) spawnRoadblock(focus);
    if (!requiredBlocks) roadblocks.length = 0;
    updateRoadblocks();
  }

  function roadSpawnNear(focus, minimum = 760, maximum = 1500) {
    let best = null;
    let bestScore = Infinity;
    for (let attempt = 0; attempt < 42; attempt += 1) {
      const road = roads[Math.floor(Math.random() * roads.length)];
      const position = pathPosition(road, Math.random());
      const dist = distance(position, focus);
      const score = dist < minimum ? minimum - dist : dist > maximum ? dist - maximum : 0;
      if (score < bestScore && !cityBlocked(position.x, position.y, 24, true)) {
        best = position;
        bestScore = score;
        if (score === 0) break;
      }
    }
    return best || { x: clamp(focus.x + 600, 50, WORLD.width - 50), y: clamp(focus.y + 100, 50, WORLD.height - 50), angle: 0 };
  }

  function spawnPoliceUnit(focus) {
    const spawn = roadSpawnNear(focus);
    policeUnits.push({
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle + Math.PI / 2,
      heading: spawn.angle,
      shotTimer: 0.7 + Math.random(),
      health: 100,
      status: "active",
      police: true,
      model: "patrulla",
      cash: 0,
      dropped: false,
      deployed: false,
      deployTimer: 0,
      speech: "",
      speechTimer: 0,
    });
  }

  function spawnRoadblock(focus) {
    const vehicle = getFocus();
    const forward = state.inVehicle ? vehicle.angle - Math.PI / 2 : state.player.angle;
    const spread = (roadblocks.length - 1) * 0.5;
    const angle = forward + spread;
    const desired = {
      x: clamp(focus.x + Math.cos(angle) * (430 + roadblocks.length * 130), 80, WORLD.width - 80),
      y: clamp(focus.y + Math.sin(angle) * (430 + roadblocks.length * 130), 80, WORLD.height - 80),
    };
    const snapped = closestRoadPoint(desired);
    roadblocks.push({
      x: snapped.x,
      y: snapped.y,
      angle: snapped.angle + Math.PI / 2,
      triggered: false,
    });
  }

  function closestRoadPoint(point) {
    let closest = { x: point.x, y: point.y, angle: 0 };
    let best = Infinity;
    for (const road of roads) {
      for (let marker = 0; marker <= 40; marker += 1) {
        const position = pathPosition(road, marker / 40);
        const dist = distance(position, point);
        if (dist < best) {
          best = dist;
          closest = position;
        }
      }
    }
    return closest;
  }

  function updateRoadblocks() {
    if (!state.inVehicle) return;
    const vehicle = activeVehicle();
    for (const block of roadblocks) {
      if (block.triggered || distance(vehicle, block) > 54) continue;
      block.triggered = true;
      // El retén ya no es un game over instantáneo: te estrella y te deja seguir.
      const fast = Math.abs(vehicle.speed) >= 105;
      vehicle.speed *= fast ? -0.22 : -0.55;
      vehicle.health = clamp(vehicle.health - (fast ? 22 : 34), 0, 100);
      damageEve(fast ? 12 : 20, "un retén");
      impactParticles(block.x, block.y, "#e7ff1f");
      shakeCamera(0.9);
      showHint(fast ? "Te llevaste el retén de corbata." : "Te frenó el retén. Písale o bájate y córrele.", 1900);
      if (vehicle.health <= 0) destroyVehicle(vehicle);
    }
  }

  function updatePatrols(dt) {
    if (state.scene !== "city") return;
    const targetCount = isNight() ? 6 : 2;
    while (patrols.length < targetCount) {
      const index = patrols.length;
      patrols.push({ road: (index * 3 + 1) % roads.length, t: (index * 0.19) % 1, speed: 0.012 + index * 0.001, reverse: index % 2 === 1 });
    }
    while (patrols.length > targetCount) patrols.pop();
    const focus = getFocus();
    for (const patrol of patrols) {
      patrol.t += patrol.speed * dt * (patrol.reverse ? -1 : 1);
      if (patrol.t > 1.03) patrol.t = -0.03;
      if (patrol.t < -0.03) patrol.t = 1.03;
      const position = pathPosition(roads[patrol.road], patrol.t);
      patrol.x = position.x;
      patrol.y = position.y;
      patrol.angle = position.angle + Math.PI / 2;
      const inGarden = distance(position, POI.garden) < 330;
      if (!inGarden && !state.inVehicle && state.wanted === 0 && isNight() && state.player.caguamaVisible > 0 && distance(position, focus) < 210) {
        policeUnits.length = 0;
        policeUnits.push({
          x: position.x,
          y: position.y,
          angle: position.angle + Math.PI / 2,
          heading: position.angle,
          shotTimer: 1.4,
          health: 100,
          status: "active",
          police: true,
          witness: true,
          cash: 0,
          dropped: false,
        });
        raiseWanted(1, "Caguama abierta en vía pública");
        showHint("Una patrulla vio la caguama. Puedes sobornarla o perderla.", 2200);
      }
    }
  }

  function raiseWanted(severity = 1, reason = "Desmadre reportado") {
    const previous = state.wanted;
    state.wanted = clamp(Math.max(severity, previous > 0 ? previous + 1 : severity), 1, 5);
    state.wantedTimer = state.wanted === 5 ? 30 : 18;
    const focus = getFocus();
    for (const npc of npcs) {
      if (npc.status === "active" && distance(npc, focus) < 420) {
        npc.memory = Math.max(npc.memory, 55);
        if (!npc.speechTimer) sayNpc(npc, state.wanted >= 3 ? "¡Graben, graben!" : "Yo mejor me voy.", 1.8);
      }
    }
    if (previous < 5 && state.wanted === 5) addNews(`EN VIVO: ${reason}. Eve trae a medio Colima detrás.`);
    sound("alert");
    updateUi();
  }

  function showFiveStarNews() {
    const flash = $("#news-flash");
    if (!flash.classList.contains("hidden")) return;
    $("#news-flash-text").textContent = "Eve convierte las calles de Colima en pista y la policía asegura que ahora sí casi la alcanza.";
    flash.classList.remove("hidden");
    window.setTimeout(() => flash.classList.add("hidden"), 4200);
  }

  function addNews(headline) {
    if (!headline || state.news[0] === headline) return;
    state.news.unshift(headline);
    state.news = state.news.slice(0, 12);
  }

  function updateNews(dt) {
    state.newsClock -= dt;
    if (state.newsClock > 0) return;
    const headlines = [
      "Calor en Colima rompe récord que nadie pidió romper.",
      "Conductor asegura que la glorieta sí tenía carriles; testigos no están convencidos.",
      "Joven llega temprano a La Marina y provoca sospechas entre compañeros.",
      "El volcán sigue ahí. Autoridades celebran operativo exitoso.",
      "Se reporta tráfico en María Ahumada; expertos confirman que es un día terminado en ‘a’.",
      "Rochi afirma no traer dinero mientras revisa el saldo por quinta vez.",
    ];
    addNews(headlines[Math.floor(Math.random() * headlines.length)]);
    state.newsClock = 42 + Math.random() * 54;
  }

  function arrestEve(reason = "Eve terminó en los separos") {
    if (state.jail.active) return;
    state.jail.active = true;
    state.jail.remaining = 10;
    state.money = Math.floor(state.money / 2);
    state.ownedWeapons = ["fists"];
    state.equippedWeapon = "fists";
    state.ammo = { pistol: 0, smg: 0 };
    state.wanted = 0;
    state.wantedTimer = 0;
    policeUnits.length = 0;
    policeOfficers.length = 0;
    roadblocks.length = 0;
    state.hurtFlash = 0;
    state.regenDelay = 0;
    const vehicle = activeVehicle();
    state.inVehicle = false;
    vehicle.speed = 0;
    prepareStoryRetryAfterArrest();
    state.dialogue = null;
    closePanel();
    closePhone();
    $("#dialogue").classList.add("hidden");
    $("#jail-countdown").textContent = "10";
    $("#separos").classList.remove("hidden");
    addNews(`${reason}. Perdió media feria y hasta las piedras le quitaron.`);
    sound("deny");
    saveGame();
  }

  function updateJail(dt) {
    if (!state.jail.active) return false;
    state.jail.remaining = Math.max(0, state.jail.remaining - dt);
    $("#jail-countdown").textContent = String(Math.ceil(state.jail.remaining));
    if (state.jail.remaining <= 0) {
      state.jail.active = false;
      state.paused = false;
      state.scene = "city";
      state.player.x = POI.separos.x;
      state.player.y = POI.separos.y;
      state.player.angle = Math.PI / 2;
      state.health = 100;
      state.armor = 0;
      state.energy = 75;
      $("#separos").classList.add("hidden");
      showHint("Libre otra vez. La troca sigue donde la dejaste.", 2300);
      saveGame();
    }
    return true;
  }

  function recoverEve() {
    if (state.health > 0) return;
    const cause = state.lastDeathCause || "los putazos";
    state.lastDeathCause = "";
    arrestEve(`Eve cayó por ${cause} y despertó en los separos`);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(0.08, dt);
      particle.vy *= Math.pow(0.08, dt);
      if (particle.life <= 0) particles.splice(i, 1);
    }
  }

  function shakeCamera(amount) {
    state.shake = Math.min(1.8, (state.shake || 0) + amount);
  }

  function impactParticles(x, y, color) {
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * TAU + Math.random() * 0.3;
      const speed = 40 + Math.random() * 75;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.28 + Math.random() * 0.35, color });
    }
  }

  function currentStoryCopy() {
    const entries = storyCopy[state.story.mission];
    if (!entries) return null;
    return entries[clamp(state.story.step, 0, entries.length - 1)];
  }

  function currentStoryTarget() {
    if (state.scene !== "city") return null;
    if (state.story.mission === "fede") {
      if (state.story.step === 0) return { type: "fede", ...POI.fede, range: 90 };
      if (state.story.step === 1) return { type: "fede-lot", ...POI.fedeLot, range: 135 };
      if (state.story.step === 2) {
        const enemy = storyEnemies.find((npc) => npc.status === "active");
        return enemy ? { type: "story-enemy", x: enemy.x, y: enemy.y, range: 90 } : { type: "fede-car", ...POI.fedeCar, range: 90 };
      }
      if (state.story.step === 3 && state.story.fedeCar) return { type: "fede-car", x: state.story.fedeCar.x, y: state.story.fedeCar.y, range: 90 };
      if (state.story.step === 4) return { type: "fede-delivery", ...POI.fedeDelivery, range: 145 };
    }
    if (state.story.mission === "cbtis") {
      if (state.story.step === 0) return { type: "cbtis", ...POI.cbtis, range: 130 };
      if (state.story.step === 1) {
        const enemy = storyEnemies.find((npc) => npc.status === "active");
        return enemy ? { type: "story-enemy", x: enemy.x, y: enemy.y, range: 90 } : { type: "cbtis", ...POI.cbtis, range: 130 };
      }
    }
    if (state.story.mission === "corralon") {
      if (state.story.step === 0) return { type: "corralon", ...POI.corralon, range: 135 };
      if (state.story.step === 1 && state.story.bike) return { type: "rochi-bike", x: state.story.bike.x, y: state.story.bike.y, range: 85 };
    }
    if (state.story.mission === "agronomia") {
      if (state.story.step === 0 || state.story.step === 2) return { type: "agronomia", ...POI.agronomia, range: 140 };
      const valve = state.story.valves.find((entry) => !entry.done);
      return valve ? { type: "valve", x: valve.x, y: valve.y, range: 72 } : { type: "agronomia", ...POI.agronomia, range: 140 };
    }
    if (state.story.mission === "rochiTruth") {
      if (state.story.step === 0) return { type: "marina", ...POI.marina, range: 130 };
      if (state.story.step === 1 && state.story.tail) return { type: "tail", x: state.story.tail.x, y: state.story.tail.y, range: 100 };
      if (state.story.step === 2) return { type: "bank", ...POI.bank, range: 120 };
    }
    return null;
  }

  function currentTarget() {
    if (state.race.active && state.scene === "city") {
      const point = raceRoute[state.race.checkpoint];
      return point ? { type: "checkpoint", ...point, range: 82 } : null;
    }
    if (state.didi.active && state.scene === "city") {
      const stop = state.didi.phase === "pickup" ? state.didi.pickup : state.didi.dropoff;
      return stop ? { type: "didi", x: stop.x, y: stop.y, range: 92 } : null;
    }
    if (state.freeRoam && state.rochi.rideRequest && state.scene === "city") return { type: "rochi-home", ...POI.rochiHome, range: 115 };
    const storyTarget = currentStoryTarget();
    if (storyTarget) return storyTarget;
    if (state.stage === 0 && state.scene === "city") return { type: "garden", ...POI.garden, range: 100 };
    if (state.stage === 1 && state.scene === "city") return { type: "stif", x: state.stif.x, y: state.stif.y, range: 76 };
    if (state.stage === 2 && state.scene === "city") return { type: "pelicano", ...POI.pelicano, range: 105 };
    if (state.stage === 3) return state.scene === "pelicano" ? { type: "shop", x: 450, y: 205, range: 92 } : { type: "pelicano", ...POI.pelicano, range: 105 };
    if (state.stage === 4 && state.scene === "city") return { type: "bank", ...POI.bank, range: 105 };
    if (state.stage === 5 && state.scene === "city") return { type: "raffle", ...POI.raffle, range: 105 };
    if (state.stage === 6 && state.scene === "city") return { type: "pawn", ...POI.pawn, range: 105 };
    if (state.stage === 7 && state.scene === "city") return { type: "garage", ...POI.garage, range: 125 };
    if (state.stage === 8 && state.scene === "city") return { type: "race", ...POI.race, range: 135 };
    if (state.stage === 9 && state.scene === "city") return { type: "garden", ...POI.garden, range: 115 };
    if (state.stage === 10 && state.scene === "city") {
      const enemy = tutorialCholos.find((npc) => npc.status === "active");
      return enemy ? { type: "enemy", x: enemy.x, y: enemy.y, range: 90 } : { type: "garden", ...POI.garden, range: 115 };
    }
    if (state.stage === 11 && state.scene === "city") return { type: "escape", ...POI.escape, range: 135 };
    if (state.stage === 12 && state.scene === "city" && state.rochi.available) return { type: "rochi", x: state.rochi.x, y: state.rochi.y, range: 82 };
    return null;
  }

  function nearbyInteraction() {
    if (state.dialogue) return "dialogue";
    const player = state.player;
    if (state.scene !== "city") {
      const service = interiors[state.scene]?.service;
      if (service && distance(player, service) < 105) return service.type;
      if (player.y > 512 && Math.abs(player.x - 450) < 100) return "interior-exit";
      return null;
    }

    const focus = getFocus();
    if (state.wanted === 1 && state.money >= 75
      && (policeUnits.some((unit) => distance(focus, unit) < 105)
        || policeOfficers.some((cop) => cop.status === "active" && distance(focus, cop) < 95))) return "bribe";
    if (state.didi.active) {
      const stop = state.didi.phase === "pickup" ? state.didi.pickup : state.didi.dropoff;
      if (stop && distance(focus, stop) < 105) return "didi-stop";
    }
    if (state.rochi.rideRequest && distance(focus, POI.rochiHome) < 125) return "rochi-home";
    if (state.race.active) return "race-abandon";
    if (state.story.mission === "fede" && state.story.step === 0 && !state.inVehicle && distance(player, POI.fede) < 105) return "fede";
    if (state.story.mission === "fede" && state.story.step === 1 && distance(focus, POI.fedeLot) < 150) return "fede-lot";
    if (state.story.mission === "fede" && state.story.step === 3 && !state.inVehicle && state.story.fedeCar && distance(player, state.story.fedeCar) < 92) return "fede-car";
    if (state.story.mission === "agronomia") {
      if (state.story.step === 0 && distance(focus, POI.agronomia) < 150) return "agronomia-start";
      if (state.story.step === 1) {
        const valve = state.story.valves.find((entry) => !entry.done && distance(focus, entry) < 80);
        if (valve) return "agronomia-valve";
      }
      if (state.story.step === 2 && distance(focus, POI.agronomia) < 150) return "agronomia-finish";
    }
    if (state.story.mission === "rochiTruth" && state.story.step === 0 && distance(focus, POI.marina) < 145) return "marina";
    if (state.story.mission === "rochiTruth" && state.story.step === 2 && distance(focus, POI.bank) < 130) return "bank";
    if (state.story.mission === "corralon" && state.story.step === 0 && distance(focus, POI.corralon) < 150) return "corralon";
    if (state.story.mission === "corralon" && state.story.step === 1 && !state.inVehicle && state.story.bike && distance(player, state.story.bike) < 88) return "rochi-bike";
    if ((state.stage === 0 || state.stage === 1) && state.stif.status === "active" && distance(player, state.stif) < 145) return "stif";
    if (state.stage === 9 && distance(focus, POI.garden) < 145) return "garden-showdown";
    if (state.stage === 12 && state.rochi.available && state.rochi.status === "active" && distance(player, state.rochi) < 92) return "rochi";
    if (state.freeRoam && state.rochi.available && !state.rochi.asleep && state.rochi.status === "active" && distance(player, state.rochi) < 92) return "rochi-chat";

    const points = [
      ["pelicano", POI.pelicano, 115],
      ["raffle", POI.raffle, 115],
      ["pawn", POI.pawn, 115],
      ["bank", POI.bank, 115],
      ["garage", POI.garage, 145],
      ["marina", POI.marina, 135],
      ["cbtis", POI.cbtis, 145],
      ["gas", POI.gas, 130],
      ["race", POI.race, 150],
      ["house", POI.houseDoor, 88],
    ];
    for (const [type, point, range] of points) {
      if (distance(focus, point) < range) return type;
    }

    if (!state.inVehicle && !state.truck.destroyed && distance(player, state.truck) < 92) return "truck";
    if (!state.inVehicle && state.story.completed.corralon && state.story.bike && !state.story.bike.destroyed && distance(player, state.story.bike) < 88) return "rochi-bike";
    if (!state.inVehicle && state.stolenCar && !state.stolenCar.destroyed && distance(player, state.stolenCar) < 82) return "stolen-car";
    if (!state.inVehicle && nearestTrafficCar(player, 72)) return "steal-traffic";
    if (state.inVehicle) return "truck-exit";
    return null;
  }

  function interact() {
    if (!state.started || state.jail.active) return;
    if (state.dialogue) {
      advanceDialogue();
      return;
    }
    if (state.paused) return;
    const target = nearbyInteraction();
    if (target === "house") enterInterior("house");
    else if (target === "pelicano") enterInterior("pelicano");
    else if (target === "marina") enterInterior("marina");
    else if (target === "cbtis") enterInterior("cbtis");
    else if (target === "bank") enterInterior("bank");
    else if (target === "garage") enterInterior("garage");
    else if (target === "interior-exit") leaveInterior();
    else if (target === "pelicano-shop") openPelicano();
    else if (target === "marina-counter") handleMarinaCounter();
    else if (target === "cbtis-teacher") startCbtisFight();
    else if (target === "bank-counter") {
      if (state.story.mission === "rochiTruth" && state.story.step === 2) completeRochiTruth();
      else openBank();
    }
    else if (target === "garage-counter") openGarage();
    else if (target === "stif") startStifDialogue();
    else if (target === "rochi" || target === "rochi-chat") startRochiDialogue();
    else if (target === "fede") startFedeBriefing();
    else if (target === "fede-lot") startFedeLotFight();
    else if (target === "fede-car") enterVehicle("fede");
    else if (target === "corralon") enterCorralon();
    else if (target === "rochi-bike") enterVehicle("bike");
    else if (target === "truck") enterVehicle("truck");
    else if (target === "stolen-car") enterVehicle("stolen");
    else if (target === "steal-traffic") stealTrafficCar();
    else if (target === "truck-exit") leaveTruck();
    else if (target === "raffle") enterInterior("raffle");
    else if (target === "pawn") enterInterior("pawn");
    else if (target === "gas") enterInterior("gas");
    else if (target === "raffle-counter") openRaffle();
    else if (target === "pawn-counter") openPawnshop();
    else if (target === "gas-counter") openGasStation();
    else if (target === "race") openRacePanel();
    else if (target === "garden-showdown") startGardenShowdown();
    else if (target === "didi-stop") handleDidiStop();
    else if (target === "rochi-home") dropRochiHome();
    else if (target === "bribe") bribePolice();
    else if (target === "race-abandon") abandonRace();
    else if (target === "agronomia-start") startAgronomiaMission();
    else if (target === "agronomia-valve") inspectAgronomiaValve();
    else if (target === "agronomia-finish") completeAgronomiaMission();
    else {
      showHint("No hay nada que usar aquí", 900);
      sound("deny");
    }
  }

  function enterInterior(place) {
    if (state.inVehicle) activeVehicle().speed = 0;
    state.scene = place;
    state.inVehicle = false;
    state.player.x = 450;
    state.player.y = 555;
    state.player.angle = -Math.PI / 2;
    if (place === "pelicano" && state.stage === 2) state.stage = 3;
    if (state.stifFollowing) {
      state.stif.x = 390;
      state.stif.y = 520;
    }
    camera.x = 0;
    camera.y = 0;
    sound("door");
    updateUi();
    saveGame();
  }

  function leaveInterior() {
    const from = state.scene;
    state.scene = "city";
    const exit = interiors[from]?.exit || POI.houseDoor;
    state.player.x = exit.x;
    state.player.y = exit.y + 34;
    state.player.angle = Math.PI / 2;
    if (state.stifFollowing) {
      state.stif.x = state.player.x - 38;
      state.stif.y = state.player.y + 20;
    }
    sound("door");
    updateUi();
    saveGame();
  }

  function startStifDialogue() {
    if (state.stage > 1) return;
    state.stage = 1;
    setDialogue([
      { name: "EVE", portrait: "E", text: "¿Qué, mamón? ¿Sí querías conocer Colima o nomás viniste a estarte riendo?" },
      { name: "STIF", portrait: "S", text: "Yo invito. Tú enséñame." },
      { name: "EVE", portrait: "E", text: "Ah, pues así sí. Primero El Pelícano. Y guarda feria en efectivo: aquí hasta respirar lo quieren cobrar." },
      { name: "STIF", portrait: "S", text: "Toma $800. Hoy no vas a decir que no traigo." },
    ], () => {
      state.money += 800;
      state.stage = 2;
      state.stifFollowing = true;
      state.stif.x = state.player.x - 45;
      state.stif.y = state.player.y + 20;
      addNews("Stif llegó al Jardín del Pisto y, contra toda lógica local, sí trajo dinero.");
      showHint("Stif puso $800 para probar la ciudad", 2200);
      saveGame();
    });
  }

  function advanceDialogue() {
    state.dialogue.index += 1;
    if (state.dialogue.index < state.dialogue.lines.length) {
      renderDialogueLine();
      sound("dialogue");
      return;
    }
    const complete = state.dialogue.onComplete;
    state.dialogue = null;
    $("#dialogue").classList.add("hidden");
    if (complete) complete();
    updateUi();
  }

  function setDialogue(lines, onComplete) {
    state.dialogue = { lines, index: 0, onComplete };
    renderDialogueLine();
    $("#dialogue").classList.remove("hidden");
    sound("dialogue");
  }

  function renderDialogueLine() {
    const line = state.dialogue.lines[state.dialogue.index];
    const normalized = typeof line === "string" ? { name: "EVE", portrait: "E", text: line } : line;
    $("#dialogue-name").textContent = normalized.name;
    $("#dialogue-text").textContent = normalized.text;
    $("#dialogue-portrait").textContent = normalized.portrait || normalized.name[0];
  }

  function startRochiDialogue() {
    if (state.stage === 12) {
      setDialogue([
        { name: "ROCHI", portrait: "R", text: "Qué bueno que llegaste. Salí de La Marina y no traigo nada, ¿me das chance? Yo siempre he pagado." },
        { name: "EVE", portrait: "E", text: "Tienes más feria escondida que un cajero, pinche vato. Pero súbete." },
        { name: "ROCHI", portrait: "R", text: "Te presto mi Didi Comida. Nomás mi comisión y si algo sale mal fue por cómo manejas." },
      ], () => {
        state.stage = 13;
        state.freeRoam = true;
        state.didiUnlocked = true;
        state.raffleUnlocked = true;
        state.rochi.following = true;
        state.rochi.available = true;
        showMissionComplete("QUE STIF SE DIVIERTA", "MUNDO LIBRE DESBLOQUEADO");
        beginFedeMission();
        saveGame();
      });
      return;
    }
    const line = state.rochi.loan
      ? "Ahorita no traigo. Lo del préstamo está trabajando, no me presiones."
      : "No traigo feria, pero si ocupas apoyo moral sí te puedo criticar.";
    setDialogue([
      { name: "ROCHI", portrait: "R", text: line },
      { name: "EVE", portrait: "E", text: "Qué útil eres, mamón." },
    ]);
  }

  function beginFedeMission() {
    if (state.story.completed.fede) return;
    state.story.mission = "fede";
    state.story.step = 0;
    state.fede.available = true;
    state.fede.x = POI.fede.x;
    state.fede.y = POI.fede.y;
    setDialogue([
      { name: "TELÉFONO · FEDE", portrait: "F", text: "Oigan, ¿no han visto mi Sentra? Se lo presté a un vato y nomás dejó de contestar." },
      { name: "EVE", portrait: "E", text: "¿Otra vez prestaste el carro, mamón? Te vamos a poner una biblioteca de llaves." },
      { name: "ROCHI", portrait: "R", text: "Vamos a verlo. Yo he hecho el paro un chingo de veces en estas cosas." },
      { name: "EVE", portrait: "E", text: "Tú nomás vienes sentado y ya te estás cobrando." },
    ], () => {
      showHint("MISIÓN 2 · Recupera el auto de Fede", 2400);
      saveGame();
    });
  }

  function startFedeBriefing() {
    if (state.story.mission !== "fede" || state.story.step !== 0) return;
    setDialogue([
      { name: "FEDE", portrait: "F", text: "Es un Nissan Sentra 2000. Se lo presté a un compa que se lo prestó a otro compa." },
      { name: "EVE", portrait: "E", text: "Pinche Fede, tu carro tiene más usuarios que el transporte público." },
      { name: "ROCHI", portrait: "R", text: "Ya conseguí la ubicación. Está en un lote por el Libramiento. Ese dato mínimo vale comisión." },
      { name: "FEDE", portrait: "F", text: "Tráiganlo entero y les doy una feria buena. Pero entero, por favor." },
    ], () => {
      state.story.step = 1;
      showHint("Ve al lote y busca el Sentra de Fede", 2100);
      saveGame();
    });
  }

  function spawnStoryEnemies(kind, count) {
    storyEnemies.length = 0;
    const teachers = kind === "teachers";
    const origin = teachers && state.scene === "cbtis" ? { x: 450, y: 300 } : teachers ? POI.cbtis : POI.fedeLot;
    for (let index = 0; index < count; index += 1) {
      storyEnemies.push({
        id: `${kind}-${state.day}-${index}`,
        x: origin.x - 110 + (index % 4) * 72,
        y: origin.y - 75 + Math.floor(index / 4) * 86,
        angle: Math.PI / 2,
        speed: teachers ? 62 : 76,
        timer: 0.6 + index * 0.13,
        color: teachers ? ["#d8d2c5", "#8794a0", "#756a5c"][index % 3] : ["#6d49a3", "#a34b52", "#3f7161"][index % 3],
        stunned: 0,
        health: teachers ? 82 : 96,
        status: "active",
        cash: teachers ? 0 : 28 + index * 9,
        courage: 1,
        memory: 99,
        speech: teachers ? "¡Entreguen esos certificados!" : "¡Ese Sentra ya cambió de dueño!",
        speechTimer: 2.5,
        enemy: true,
        dropped: false,
        role: teachers ? "teacher" : "cholo",
      });
    }
  }

  function createFedeCar() {
    state.story.fedeCar = {
      x: POI.fedeCar.x,
      y: POI.fedeCar.y,
      angle: Math.PI / 2,
      speed: 0,
      radius: 27,
      health: 100,
      fuel: 72,
      destroyed: false,
      color: "#a8adb2",
      paint: "#a8adb2",
      model: "NISSAN SENTRA 2000",
    };
  }

  function startFedeLotFight() {
    if (state.story.mission !== "fede" || state.story.step !== 1) return;
    if (state.inVehicle) {
      showHint("Bájate para buscar las llaves, pinche cómoda", 1500);
      return;
    }
    setDialogue([
      { name: "ROCHI", portrait: "R", text: "Ahí está. Fede dijo que lo prestó; técnicamente ellos creen que fue regalo." },
      { name: "CHOLO", portrait: "?", text: "El carro ya es de la colonia. Váyanse antes de que también prestemos la camioneta." },
      { name: "EVE", portrait: "E", text: "Pues van entregando las llaves, pinches vatos." },
    ], () => {
      spawnStoryEnemies("sentra-cholos", 5);
      state.story.step = 2;
      showHint("RECUPERA LAS LLAVES · No generan estrellas en esta pelea", 2200);
      saveGame();
    });
  }

  function completeFedeMission() {
    if (state.story.mission !== "fede" || state.story.step !== 4 || !state.story.fedeCar || state.story.fedeCar.destroyed) return;
    const gross = state.story.fedeRewardGross;
    state.story.fedeCar.speed = 0;
    state.inVehicle = false;
    state.vehicleKind = "truck";
    state.player.x = POI.fedeDelivery.x + 65;
    state.player.y = POI.fedeDelivery.y;
    state.wanted = 0;
    state.wantedTimer = 0;
    policeUnits.length = 0;
    roadblocks.length = 0;
    state.money += gross;
    state.story.step = 5;
    state.story.fedeRewardPhase = "gross";
    updateUi();
    saveGame();
    showFedeRewardDialogue();
  }

  function showFedeRewardDialogue() {
    const gross = state.story.fedeRewardGross;
    setDialogue([
      { name: "FEDE", portrait: "F", text: `Está entero. Van $${gross}; neta sí pensé que iban a regresar caminando.` },
      { name: "EVE", portrait: "E", text: "Dos patrullas, cinco cholos y tu pinche costumbre de prestar todo. Más te vale." },
      { name: "ROCHI", portrait: "R", text: `De esos $${gross}, la mitad es mía. Yo he hecho el paro un chingo de veces.` },
      { name: "EVE", portrait: "E", text: "¿Cuál paro, mamón? Si hasta en la pelea estabas cuidando tu saldo." },
    ], settleFedeReward);
  }

  function settleFedeReward() {
    if (state.story.fedeRewardPhase !== "gross") return false;
    const gross = state.story.fedeRewardGross;
    const rochiCut = Math.floor(gross / 2);
    const eveCut = gross - rochiCut;
    state.money = Math.max(0, state.money - rochiCut);
    state.rochi.cash += rochiCut;
    state.story.fedeRewardPhase = "settled";
    state.story.completed.fede = true;
    state.story.fedeCar = null;
    state.story.mission = "cbtis";
    state.story.step = 0;
    storyEnemies.length = 0;
    addNews(`Fede recuperó su Sentra 2000 y promete no volverlo a prestar durante al menos quince minutos.`);
    showMissionComplete("RECUPERA EL AUTO DE FEDE", `EVE +$${eveCut} · ROCHI +$${rochiCut}`);
    showHint("MISIÓN 3 · Ve al CBTis 19 por el proyecto de tesis", 2800);
    saveGame();
    return true;
  }

  function failFedeMission(message) {
    if (state.story.mission !== "fede" || state.story.completed.fede) return;
    state.inVehicle = false;
    state.vehicleKind = "truck";
    state.story.fedeCar = null;
    state.story.step = 1;
    state.wanted = 0;
    state.wantedTimer = 0;
    policeUnits.length = 0;
    roadblocks.length = 0;
    storyEnemies.length = 0;
    showHint(message, 2600);
    saveGame();
  }

  function startCbtisFight() {
    if (state.story.mission !== "cbtis" || state.story.step !== 0) return;
    if (state.inVehicle) {
      showHint("Bájate. El proyecto de tesis todavía no acepta drive-thru.", 1600);
      return;
    }
    setDialogue([
      { name: "EVE", portrait: "E", text: "Profe, venimos a preguntar por lo del proyecto de tesis. Nomás una duda y nos vamos." },
      { name: "MAESTRO", portrait: "M", text: "Antes de eso: aparecen como faltistas. Tendremos que retirarles el certificado de prepa." },
      { name: "ROCHI", portrait: "R", text: "Yo sí venía. A veces llegaba después de que todos se iban, pero venía." },
      { name: "PROFES", portrait: "!", text: "¡Entreguen los certificados!" },
      { name: "EVE", portrait: "E", text: "No mamen, ya hasta estamos viendo tesis. Vengan por ellos, pues." },
    ], () => {
      spawnStoryEnemies("teachers", 7);
      state.story.step = 1;
      showHint("PELEA CONTRA LOS PROFES · Protege los certificados", 2300);
      saveGame();
    });
  }

  function completeCbtisMission() {
    if (state.story.mission !== "cbtis" || state.story.step !== 1) return;
    state.story.step = 2;
    setDialogue([
      { name: "MAESTRO", portrait: "M", text: "Está bien. Conservarán sus certificados. Pero la duda de tesis quedó exactamente igual." },
      { name: "EVE", portrait: "E", text: "Pinche vuelta inútil. Al menos quedó claro el argumento." },
      { name: "ROCHI", portrait: "R", text: "Ya que andamos resolviendo pendientes: mi moto sigue en el corralón de los separos." },
      { name: "EVE", portrait: "E", text: "Claro, porque preguntar por una tesis tenía que terminar robándole algo a la policía." },
    ], () => {
      state.story.completed.cbtis = true;
      state.story.corralonUnlocked = true;
      state.story.mission = "agronomia";
      state.story.step = 0;
      storyEnemies.length = 0;
      if (state.scene === "cbtis") leaveInterior();
      addNews("Riña académica termina con siete profesores noqueados y ninguna observación útil para la tesis.");
      showMissionComplete("FALTISTAS", "MISIÓN DE AGRONOMÍA DESBLOQUEADA");
      showHint("MISIÓN 4 · La tesis no se riega sola", 2700);
      saveGame();
    });
  }

  function startAgronomiaMission() {
    if (state.story.mission !== "agronomia" || state.story.step !== 0) return;
    if (state.inVehicle) { showHint("Bájate de la troca. Las plantas todavía no atienden por ventanilla.", 1600); return; }
    // Antes eran coordenadas fijas y quedaban fuera del campus si el terreno
    // se reacomodaba. Ahora salen de las esquinas del propio campus.
    const campus = buildings.find((entry) => entry.id === "agronomia");
    const pad = 46;
    state.story.valves = [
      { x: campus.x - pad, y: campus.y - pad, done: false },
      { x: campus.x + campus.w + pad, y: campus.y - pad, done: false },
      { x: campus.x + campus.w + pad, y: campus.y + campus.h + pad, done: false },
      { x: campus.x - pad, y: campus.y + campus.h + pad, done: false },
    ].map((valve) => ({
      x: clamp(valve.x, 60, WORLD.width - 60),
      y: clamp(valve.y, 60, WORLD.height - 60),
      done: false,
    }));
    setDialogue([
      { name: "ASESOR", portrait: "A", text: "Antes de hablar de tesis, revisen las cuatro válvulas de riego de la parcela." },
      { name: "EVE", portrait: "E", text: "Al fin una misión de agronomía que no acaba a madrazos. Qué concepto tan novedoso." },
      { name: "ROCHI", portrait: "R", text: "Yo documento desde aquí para no contaminar la muestra con mis tenis." },
    ], () => { state.story.step = 1; saveGame(); });
  }

  function inspectAgronomiaValve() {
    if (state.inVehicle) { showHint("La muestra se toma a pie, mamona.", 1200); return; }
    const valve = state.story.valves.find((entry) => !entry.done && distance(getFocus(), entry) < 85);
    if (!valve) return;
    valve.done = true;
    sound("pickup");
    const remaining = state.story.valves.filter((entry) => !entry.done).length;
    showHint(remaining ? `Válvula revisada · faltan ${remaining}` : "Muestras completas · vuelve con el asesor", 1500);
    if (!remaining) state.story.step = 2;
    saveGame();
  }

  function completeAgronomiaMission() {
    if (state.story.mission !== "agronomia" || state.story.step !== 2) return;
    setDialogue([
      { name: "ASESOR", portrait: "A", text: "Las mediciones sirven. Aquí tienen $650 para materiales." },
      { name: "ROCHI", portrait: "R", text: "Yo administraría ese dinero, pero ahorita no traigo." },
      { name: "EVE", portrait: "E", text: "Ni madres, mamón. Esta vez sí cargué yo hasta el pinche lodo." },
    ], () => {
      state.money += 650;
      state.story.completed.agronomia = true;
      state.story.mission = "rochiTruth";
      state.story.step = 0;
      addNews("Estudiantes de agronomía concluyen que el agua moja; asesor pide tres cuartillas más.");
      showMissionComplete("LA TESIS NO SE RIEGA SOLA", "+$650 · MISIÓN 5 DESBLOQUEADA");
      saveGame();
    });
  }

  function handleMarinaCounter() {
    if (state.story.mission !== "rochiTruth" || state.story.step !== 0) {
      showHint("La Marina está abierta. Rochi asegura que trabajar aquí no cuenta como traer feria.", 1600);
      return;
    }
    setDialogue([
      { name: "ROCHI", portrait: "R", text: "Ya salí. No traigo nada, así que tú pon la gasolina." },
      { name: "EVE", portrait: "E", text: "Sí, cómo no. Camínale, pinche magnate sin efectivo." },
    ], () => {
      leaveInterior();
      state.story.step = 1;
      state.story.tail = { x: POI.marina.x, y: POI.marina.y, waypoint: 0, suspicion: 0 };
      showHint("SIGUE A ROCHI · 110–430 m sin que te detecte", 2200);
      saveGame();
    });
  }

  const rochiTailRoute = [POI.marina, { x: 4700, y: 1160 }, { x: 4760, y: 1510 }, { x: 4630, y: 1840 }, POI.bank];

  function updateRochiTail(dt) {
    const tail = state.story.tail;
    if (state.story.mission !== "rochiTruth" || state.story.step !== 1 || !tail) return;
    const target = rochiTailRoute[Math.min(tail.waypoint + 1, rochiTailRoute.length - 1)];
    const dx = target.x - tail.x;
    const dy = target.y - tail.y;
    const dist = Math.hypot(dx, dy) || 1;
    tail.x += (dx / dist) * 72 * dt;
    tail.y += (dy / dist) * 72 * dt;
    if (dist < 22) tail.waypoint += 1;
    const separation = distance(getFocus(), tail);
    tail.suspicion = clamp(tail.suspicion + (separation < 110 ? dt * 34 : -dt * 18), 0, 100);
    if (separation > 520 || tail.suspicion >= 100) {
      state.story.step = 0;
      state.story.tail = null;
      showHint(separation > 520 ? "Perdiste a Rochi. Vuelve a La Marina." : "Rochi te vio. Finge demencia y vuelve a intentar.", 2400);
    } else if (tail.waypoint >= rochiTailRoute.length - 1) {
      state.story.step = 2;
      showHint("Rochi entró al banco · ve a comprobar que ‘no trae’", 2200);
    }
  }

  function completeRochiTruth() {
    if (state.story.mission !== "rochiTruth" || state.story.step !== 2) return;
    setDialogue([
      { name: "EVE", portrait: "E", text: `¿No que no traías? Tu cuenta tiene $${Math.floor(state.rochi.cash)}, pinche vato.` },
      { name: "ROCHI", portrait: "R", text: "Eso no es traer. Eso es tener guardado. Y yo ya invité antes." },
      { name: "EVE", portrait: "E", text: "Nunca has invitado, mamón." },
      { name: "ROCHI", portrait: "R", text: "Por eso lo tengo guardado." },
    ], () => {
      state.story.completed.rochiTruth = true;
      state.story.mission = "free";
      state.story.step = 0;
      state.story.tail = null;
      addNews("Joven sin efectivo es visto retirando una cantidad que definitivamente no piensa compartir.");
      showMissionComplete("ROCHI SÍ TRAE", "MUNDO LIBRE · CORRALÓN DISPONIBLE");
      saveGame();
    });
  }

  function startCorralonMission() {
    if (!state.story.corralonUnlocked || state.story.completed.corralon || state.story.mission !== "free") return;
    closePhone();
    state.story.mission = "corralon";
    state.story.step = 0;
    state.story.bike = null;
    setDialogue([
      { name: "ROCHI", portrait: "R", text: "Mi moto sigue en el corralón. Si la recuperas, te presto la app de Didi con la misma comisión." },
      { name: "EVE", portrait: "E", text: "O sea, arriesgo el pellejo y tú conservas tu negocio. Qué ofertón, pinche vato." },
      { name: "ROCHI", portrait: "R", text: "Yo te diría cómo entré la otra vez, pero legalmente nunca he estado ahí." },
    ], () => {
      showHint("ENCARGO · Recupera la moto de Rochi", 2200);
      saveGame();
    });
  }

  function createRochiBike() {
    state.story.bike = {
      x: POI.rochiBike.x,
      y: POI.rochiBike.y,
      angle: Math.PI / 2,
      speed: 0,
      radius: 18,
      health: 78,
      fuel: 88,
      destroyed: false,
      color: "#e33f83",
      paint: "#e33f83",
      motorcycle: true,
      model: "MOTO DE ROCHI",
    };
  }

  function enterCorralon() {
    if (state.story.mission !== "corralon" || state.story.step !== 0) return;
    if (state.inVehicle) {
      showHint("Bájate para colarte al corralón", 1300);
      return;
    }
    createRochiBike();
    setDialogue([
      { name: "ROCHI", portrait: "R", text: "Ahí está. Ni la movieron. Eso demuestra que siempre fue prácticamente nuestra." },
      { name: "EVE", portrait: "E", text: "Está dentro de un corralón policial, mamón. Eso demuestra exactamente lo contrario." },
      { name: "ROCHI", portrait: "R", text: "Súbete rápido. Yo vigilo desde una distancia donde no me relacionen." },
    ], () => {
      state.story.step = 1;
      showHint("Sube a la moto · al sacarla tendrás cuatro estrellas", 2200);
      saveGame();
    });
  }

  function completeCorralonMission() {
    if (state.story.mission !== "corralon" || state.story.step !== 2 || state.wanted !== 0 || !state.story.bike || state.story.bike.destroyed) return;
    state.story.step = 3;
    setDialogue([
      { name: "ROCHI", portrait: "R", text: "Sabía que podías. Yo hice la parte difícil: acordarme de dónde estaba." },
      { name: "EVE", portrait: "E", text: "Cuatro estrellas por tu moto y todavía te adjudicas el paro, pinche vato." },
      { name: "ROCHI", portrait: "R", text: "Entonces quedamos tablas." },
    ], () => {
      state.story.completed.corralon = true;
      state.story.mission = "free";
      state.story.step = 0;
      addNews("Moto sale del corralón sin trámite; separos culpa a una ráfaga con casco.");
      showMissionComplete("RECUPERA LA MOTO DE ROCHI", "MOTO RECUPERADA");
      showHint("La moto de Rochi quedó disponible en el mundo", 2300);
      saveGame();
    });
  }

  function failCorralonMission(message) {
    if (state.story.mission !== "corralon" || state.story.completed.corralon) return;
    state.inVehicle = false;
    state.vehicleKind = "truck";
    state.story.bike = null;
    state.story.step = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    policeUnits.length = 0;
    roadblocks.length = 0;
    showHint(message, 2600);
    saveGame();
  }

  function prepareStoryRetryAfterArrest() {
    if (state.story.mission === "fede" && state.story.step >= 2 && !state.story.completed.fede) {
      state.story.fedeCar = null;
      state.story.step = 1;
      storyEnemies.length = 0;
    } else if (state.story.mission === "cbtis" && state.story.step === 1 && !state.story.completed.cbtis) {
      state.story.step = 0;
      storyEnemies.length = 0;
    } else if (state.story.mission === "corralon" && !state.story.completed.corralon) {
      state.story.bike = null;
      state.story.step = 0;
    }
    state.vehicleKind = "truck";
  }

  function updateStory(dt = 1 / 60) {
    updateRochiTail(dt);
    if (state.story.mission === "fede") {
      if (state.story.step === 2 && storyEnemies.length && storyEnemies.every((npc) => npc.status !== "active")) {
        storyEnemies.length = 0;
        createFedeCar();
        state.story.step = 3;
        showHint("LLAVES RECUPERADAS · Sube al Nissan Sentra 2000", 2200);
        saveGame();
      } else if (state.story.step === 4 && state.inVehicle && state.vehicleKind === "fede" && distance(getFocus(), POI.fedeDelivery) < 155) {
        completeFedeMission();
      }
    } else if (state.story.mission === "cbtis" && state.story.step === 1 && storyEnemies.length && storyEnemies.every((npc) => npc.status !== "active")) {
      completeCbtisMission();
    } else if (state.story.mission === "corralon" && state.story.step === 2 && state.wanted === 0) {
      completeCorralonMission();
    }
  }

  function enterVehicle(kind) {
    const vehicle = kind === "stolen"
      ? state.stolenCar
      : kind === "fede"
        ? state.story.fedeCar
        : kind === "bike"
          ? state.story.bike
          : state.truck;
    if (!vehicle || vehicle.destroyed) {
      showHint(kind === "truck" ? "La camioneta necesita reparación" : "Ese carro ya no prende", 1200);
      sound("deny");
      return;
    }
    state.inVehicle = true;
    state.vehicleKind = kind;
    state.player.x = vehicle.x;
    state.player.y = vehicle.y;
    if (kind === "fede" && state.story.mission === "fede" && state.story.step === 3) {
      state.story.step = 4;
      state.wanted = 2;
      state.wantedTimer = 18;
      addNews("Reportan el Sentra 2000 de Fede huyendo otra vez; esta vez sí lo manejaba alguien que conoce.");
      showHint("DOS ESTRELLAS · Lleva el Sentra con Fede sin destruirlo", 2400);
      sound("alert");
    }
    if (kind === "bike" && state.story.mission === "corralon" && state.story.step === 1) {
      state.story.step = 2;
      raiseWanted(4, "Robo de una moto dentro del corralón de separos");
      showHint("CUATRO ESTRELLAS · Piérdelas sin subir a cinco", 2500);
    }
    $("#run-label").textContent = "ACELERAR";
    sound("engine");
    showRadioHud(true);
    updateUi();
    saveGame();
  }

  function leaveTruck() {
    const vehicle = activeVehicle();
    const sideAngle = vehicle.angle;
    const candidate = {
      x: vehicle.x + Math.cos(sideAngle) * 55,
      y: vehicle.y + Math.sin(sideAngle) * 55,
    };
    if (cityBlocked(candidate.x, candidate.y, state.player.radius, true)) {
      showHint("No hay espacio para bajar", 1000);
      return;
    }
    state.inVehicle = false;
    state.player.x = candidate.x;
    state.player.y = candidate.y;
    vehicle.speed = 0;
    $("#run-label").textContent = "CORRER";
    sound("door");
    saveGame();
  }

  function nearestTrafficCar(point, range) {
    let nearest = null;
    let best = range;
    for (const car of traffic) {
      if (car.stolen || car.hidden) continue;
      const position = Number.isFinite(car.x) ? car : pathPosition(roads[car.road], car.t);
      const d = distance(point, position);
      if (d < best) {
        nearest = { car, position };
        best = d;
      }
    }
    return nearest;
  }

  function stealTrafficCar() {
    const found = nearestTrafficCar(state.player, 76);
    if (!found) return;
    found.car.stolen = true;
    state.stolenCar = {
      x: found.position.x,
      y: found.position.y,
      angle: found.position.angle + Math.PI / 2,
      speed: 0,
      radius: 27,
      health: 70,
      fuel: 45 + Math.random() * 40,
      destroyed: false,
      color: found.car.color,
      model: found.car.model || "sedan",
    };
    enterVehicle("stolen");
    raiseWanted(1, "Robo de vehículo");
    showHint("Vehículo robado: no aparece ni se recupera como la troca", 1800);
  }

  function grantWeapon(id, ammo = 0) {
    if (!weapons[id]) return;
    if (!state.ownedWeapons.includes(id)) state.ownedWeapons.push(id);
    if (Number.isFinite(weapons[id].ammo) && state.ammo[id] !== undefined) state.ammo[id] += ammo;
    state.equippedWeapon = id;
    showHint(`${weapons[id].name}${ammo ? ` · ${ammo} balas` : ""}`, 1300);
    sound("pickup");
    updateUi();
  }

  function cycleWeapon() {
    if (!state.ownedWeapons.length) return;
    const current = state.ownedWeapons.indexOf(state.equippedWeapon);
    state.equippedWeapon = state.ownedWeapons[(current + 1) % state.ownedWeapons.length];
    updateUi();
  }

  function cycleRadio() {
    const current = radioStations.findIndex((entry) => entry.id === state.settings.station);
    const next = radioStations[(current + 1 + radioStations.length) % radioStations.length];
    state.settings.station = next.id;
    radioStep = -1;
    showRadioHud(true);
    sound("phone");
    saveGame();
  }

  function punch() {
    if (!state.started || state.paused || state.dialogue || state.inVehicle || !["city", "cbtis"].includes(state.scene)) return;
    if (state.player.punch > 0) return;
    attack();
  }

  function completeMission() {
    if (state.stage !== 11) return;
    state.stage = 12;
    state.wanted = 0;
    policeUnits.length = 0;
    tutorialCholos.length = 0;
    state.stifFollowing = false;
    state.rochi.available = true;
    state.rochi.asleep = false;
    state.rochi.x = 3415;
    state.rochi.y = 790;
    state.truck.speed = 0;
    setDialogue([
      { name: "STIF", portrait: "S", text: "Sí me divertí." },
      { name: "EVE", portrait: "E", text: "Qué bueno, porque casi nos parten la madre por tu tour, mamón." },
      { name: "STIF", portrait: "S", text: "Rochi dijo que cayó al jardín saliendo de La Marina. Ve por él." },
    ], () => {
      showHint("Tutorial superado · Rochi está en el Jardín del Pisto", 2500);
      saveGame();
    });
  }

  function showMissionComplete(title = "QUE STIF SE DIVIERTA", subtitle = "MUNDO LIBRE DESBLOQUEADO") {
    state.completedShown = true;
    $("#mission-complete-title").textContent = title;
    $("#mission-complete-subtitle").textContent = subtitle;
    $("#mission-complete").classList.remove("hidden");
    sound("complete");
    updateUi();
    window.setTimeout(() => $("#mission-complete").classList.add("hidden"), 4300);
  }

  function openPanel(title, copy, actions, kicker = "EVE GTA") {
    state.paused = true;
    panelHandlers = actions;
    $("#panel-kicker").textContent = kicker;
    $("#panel-title").textContent = title;
    $("#panel-copy").textContent = copy;
    const container = $("#panel-actions");
    container.innerHTML = "";
    actions.forEach((action, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.disabled = typeof action.disabled === "function" ? action.disabled() : Boolean(action.disabled);
      if (action.danger) button.classList.add("danger");
      button.textContent = action.label;
      if (action.price !== undefined) {
        const price = document.createElement("span");
        price.textContent = action.price;
        button.appendChild(price);
      }
      button.addEventListener("click", () => {
        if (!button.disabled && panelHandlers[index]?.run) panelHandlers[index].run();
      });
      container.appendChild(button);
    });
    $("#action-panel").classList.remove("hidden");
  }

  function closePanel() {
    $("#action-panel").classList.add("hidden");
    panelHandlers = [];
    if ($("#phone").classList.contains("hidden") && !state.jail.active) state.paused = false;
    lastTime = performance.now();
  }

  function spendCash(amount) {
    if (state.money < amount) {
      showHint(`Te faltan $${Math.ceil(amount - state.money)} en efectivo`, 1500);
      sound("deny");
      return false;
    }
    state.money -= amount;
    return true;
  }

  function buyPelicanoItem(item) {
    const catalog = {
      caguama: { price: 45, name: "Caguama", message: "Salud y blindaje cuando la uses" },
      takis: { price: 30, name: "Takis Fuego", message: "Energía infinita durante 55 segundos" },
    };
    const product = catalog[item];
    if (!product || !spendCash(product.price)) return;
    state.inventory[item] += 1;
    showHint(`${product.name}: ${product.message}`, 1700);
    sound("pickup");
    if (state.stage === 3 && state.inventory.caguama > 0 && state.inventory.takis > 0) {
      state.stage = 4;
      showHint("Stif: “Va. Enséñame lo del banco antes de que te gastes todo.”", 2200);
    }
    openPelicano();
    updateUi();
    saveGame();
  }

  function openPelicano() {
    openPanel(
      "EL PELÍCANO",
      "Todo se paga en efectivo. El dependiente te juzga gratis.",
      [
        { label: "Comprar caguama", price: "$45", run: () => buyPelicanoItem("caguama") },
        { label: "Comprar Takis Fuego", price: "$30", run: () => buyPelicanoItem("takis") },
        { label: "Usar una caguama", price: `x${state.inventory.caguama}`, disabled: state.inventory.caguama < 1, run: consumeCaguama },
        { label: "Comer Takis Fuego", price: `x${state.inventory.takis}`, disabled: state.inventory.takis < 1, run: consumeTakis },
        { label: "Salir del mostrador", run: closePanel },
      ],
      "ABARROTES · SIN FIADO"
    );
  }

  function consumeCaguama() {
    if (state.inventory.caguama < 1) return;
    state.inventory.caguama -= 1;
    state.health = clamp(state.health + 38, 0, 100);
    state.armor = clamp(state.armor + 28, 0, 100);
    state.player.caguamaVisible = 28;
    showHint("Caguama usada: +vida, +blindaje. De noche no la presumas frente a patrullas.", 2300);
    closePanel();
    updateUi();
    saveGame();
  }

  function consumeTakis() {
    if (state.inventory.takis < 1) return;
    state.inventory.takis -= 1;
    state.energyBuff = Math.max(state.energyBuff, 55);
    state.energy = 100;
    showHint("Takis Fuego: energía infinita durante 55 segundos", 1800);
    closePanel();
    updateUi();
    saveGame();
  }

  function rafflePrize(tutorial = false) {
    if (tutorial) return { id: `tutorial-${Date.now()}`, name: "Manopla Rosa ‘Volcán Mood’", value: 220, kind: "weapon", weapon: "knuckles" };
    const roll = Math.random();
    if (roll < 0.34) return { id: `cash-${Date.now()}`, name: "Premio de consolación", value: 28, kind: "cash" };
    if (roll < 0.62) return { id: `shirt-${Date.now()}`, name: "Playera ‘Hace calor o qué’", value: 75, kind: "clothes" };
    if (roll < 0.81) return { id: `rock-${Date.now()}`, name: "Piedra edición Jardín", value: 60, kind: "weapon", weapon: "rock" };
    if (roll < 0.93) return { id: `knuckle-${Date.now()}`, name: "Manopla Volcánica", value: 145, kind: "weapon", weapon: "knuckles" };
    if (roll < 0.992) return { id: `pistol-${Date.now()}`, name: "Pistola rosa, 4 balas", value: 430, kind: "weapon", weapon: "pistol", ammo: 4 };
    return { id: `smg-${Date.now()}`, name: "Metralleta ‘Rey Colimán’, 9 balas", value: 1100, kind: "weapon", weapon: "smg", ammo: 9 };
  }

  function playRaffle() {
    const tutorial = state.stage === 5 && !state.tutorialFlags.raffle;
    const cost = tutorial ? 100 : 120;
    if (!spendCash(cost)) return;
    const prize = rafflePrize(tutorial);
    if (prize.kind === "cash") {
      state.money += prize.value;
    } else {
      state.inventory.raffleItems.push(prize);
      if (prize.weapon) grantWeapon(prize.weapon, prize.ammo || 0);
    }
    if (tutorial) {
      state.tutorialPrize = prize.id;
      state.tutorialFlags.raffle = true;
      state.stage = 6;
    }
    addNews(`Rifas El Aferrado entregó “${prize.name}”. Rochi dice que a él le salió una troca.`);
    showHint(`Ganaste: ${prize.name}`, 2300);
    openRaffle();
    updateUi();
    saveGame();
  }

  function openRaffle() {
    const tutorial = state.stage === 5 && !state.tutorialFlags.raffle;
    openPanel(
      "RIFAS EL AFERRADO",
      "Siempre cae algo, casi nunca vale lo que metiste. Rochi jura que él siempre gana premios grandes.",
      [
        { label: tutorial ? "Tirada de prueba de Stif" : "Comprar número", price: tutorial ? "$100" : "$120", run: playRaffle },
        { label: "Cerrar", run: closePanel },
      ],
      "RIFA · SIN DINERO REAL"
    );
  }

  function sellRaffleItem(id) {
    const index = state.inventory.raffleItems.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [item] = state.inventory.raffleItems.splice(index, 1);
    const payout = Math.max(1, Math.floor(item.value * 0.45));
    state.money += payout;
    if (item.id === state.tutorialPrize && state.stage === 6) {
      state.stage = 7;
      state.tutorialFlags.pawn = true;
      showHint("Eve: “Nos dieron una madre y ya la malbaratamos. Qué economía tan bonita.”", 2500);
    } else {
      showHint(`Vendiste ${item.name} por $${payout}`, 1500);
    }
    openPawnshop();
    updateUi();
    saveGame();
  }

  function openPawnshop() {
    const sellable = state.inventory.raffleItems;
    const actions = sellable.map((item) => ({
      label: `Vender: ${item.name}`,
      price: `$${Math.floor(item.value * 0.45)}`,
      run: () => sellRaffleItem(item.id),
    }));
    actions.push({ label: "Cerrar", run: closePanel });
    openPanel(
      "EMPEÑO VOLCÁN",
      sellable.length ? "Aquí compran premios por menos de la mitad y todavía hacen cara de favor." : "No traes ningún premio vendible. Ni Rochi te presta uno.",
      actions,
      "COMPRA · VENTA · ARREPENTIMIENTO"
    );
  }

  function openBank() {
    if (state.stage === 4 && state.bank < 50 && !state.tutorialFlags.bankRescue) {
      state.bank += 50;
      state.tutorialFlags.bankRescue = true;
      showHint("Stif depositó otros $50 para que no rompas el tutorial, mamona.", 2100);
    }
    const withdraw = (amount) => {
      if (state.bank < amount) {
        showHint("No tienes tanto en el banco", 1200);
        sound("deny");
        return;
      }
      state.bank -= amount;
      state.money += amount;
      if (state.stage === 4) {
        state.stage = 5;
        state.tutorialFlags.atm = true;
        showHint("Retiraste efectivo. Eso sí te lo pueden bajar en separos; el banco queda intacto.", 2400);
      } else {
        showHint(`Retiraste $${amount}. Ahora sí te lo pueden quitar en separos.`, 1900);
      }
      openBank();
      updateUi();
      saveGame();
    };
    const deposit = (amount) => {
      if (!spendCash(amount)) return;
      state.bank += amount;
      showHint(`Depositaste $${amount}. Esa feria queda protegida.`, 1600);
      openBank();
      updateUi();
      saveGame();
    };
    openPanel(
      "CAJERO",
      `Banco: $${Math.floor(state.bank)} · Efectivo: $${Math.floor(state.money)}. Las tiendas no aceptan pagos electrónicos.`,
      [
        { label: "Retirar $50", disabled: state.bank < 50, run: () => withdraw(50) },
        { label: "Retirar $100", disabled: state.bank < 100, run: () => withdraw(100) },
        { label: "Retirar $250", disabled: state.bank < 250, run: () => withdraw(250) },
        { label: "Depositar $50", disabled: state.money < 50, run: () => deposit(50) },
        { label: "Depositar $100", disabled: state.money < 100, run: () => deposit(100) },
        { label: "Cerrar", run: closePanel },
      ],
      "BANCO · SOLO CONSULTA Y RETIRO"
    );
  }

  function tuneTruck(kind, price) {
    if (!spendCash(price)) return;
    if (kind === "engine") state.truck.engine = clamp(state.truck.engine + 1, 0, 3);
    if (kind === "handling") state.truck.handling = clamp(state.truck.handling + 1, 0, 3);
    if (kind === "armor") state.truck.armor = clamp(state.truck.armor + 1, 0, 3);
    if (kind === "paint") {
      const colors = ["#194c38", "#a12c6d", "#276d7a", "#6d45a3", "#b34e2d"];
      state.truck.paint = colors[(colors.indexOf(state.truck.paint) + 1) % colors.length];
    }
    if (state.stage === 7) {
      state.stage = 8;
      state.tutorialFlags.tuned = true;
      showHint("Tuning instalado. Stif nomás se ríe porque elegiste primero el color.", 2200);
    }
    openGarage();
    updateUi();
    saveGame();
  }

  function repairTruck() {
    const tow = distance(getFocus(), state.truck) > 220 || state.truck.destroyed;
    const price = tow ? 160 : Math.max(30, Math.ceil((100 - state.truck.health) * 1.2));
    if (!spendCash(price)) return;
    if (tow) {
      state.truck.x = POI.garage.x - 90;
      state.truck.y = POI.garage.y + 20;
      state.truck.angle = 0;
    }
    state.truck.destroyed = false;
    state.truck.health = 100;
    showHint(tow ? "La troca fue recuperada y reparada" : "Camioneta reparada", 1500);
    openGarage();
    saveGame();
  }

  function openGarage() {
    const repairPrice = distance(getFocus(), state.truck) > 220 || state.truck.destroyed
      ? 160
      : Math.max(30, Math.ceil((100 - state.truck.health) * 1.2));
    openPanel(
      "TALLER EL VOLCÁN",
      `Troca ${Math.round(state.truck.health)}% · motor ${state.truck.engine}/3 · manejo ${state.truck.handling}/3 · blindaje ${state.truck.armor}/3. Solo esta camioneta es recuperable.`,
      [
        { label: "Reparar / recuperar camioneta", price: `$${repairPrice}`, disabled: state.truck.health >= 100 && !state.truck.destroyed, run: repairTruck },
        { label: "Pintura ‘se ve desde Comala’", price: "$80", run: () => tuneTruck("paint", 80) },
        { label: "Motor preparado", price: "$250", disabled: state.truck.engine >= 3, run: () => tuneTruck("engine", 250) },
        { label: "Manejo anti-bache", price: "$210", disabled: state.truck.handling >= 3, run: () => tuneTruck("handling", 210) },
        { label: "Blindaje discreto (según ellos)", price: "$230", disabled: state.truck.armor >= 3, run: () => tuneTruck("armor", 230) },
        { label: "Cerrar", run: closePanel },
      ],
      "REPARACIÓN · TUNING · CHISTES MALOS"
    );
  }

  function openGasStation() {
    const vehicle = activeVehicle();
    const fill = () => {
      if (!spendCash(40)) return;
      vehicle.fuel = 100;
      showHint("Tanque lleno. No hace falta regresar cada cinco minutos.", 1700);
      closePanel();
      saveGame();
    };
    openPanel(
      "GASOLINERA",
      `${state.vehicleKind === "truck" ? "Camioneta de Eve" : "Vehículo prestado sin permiso"}: ${Math.round(vehicle.fuel)}% de gasolina.`,
      [
        { label: "Llenar tanque", price: "$40", disabled: vehicle.fuel > 96, run: fill },
        { label: "Cerrar", run: closePanel },
      ],
      "COMBUSTIBLE"
    );
  }

  function openRacePanel() {
    if (!state.inVehicle) {
      showHint("Necesitas llegar en un vehículo, pinche peatona", 1500);
      sound("deny");
      return;
    }
    const tutorial = state.stage === 8 && !state.tutorialFlags.race;
    const actions = tutorial
      ? [{ label: "Carrera de prueba pagada por Stif", price: "$0", run: () => startRace(0, 0, 0) }]
      : [
          { label: "Correr sin apuesta", price: "$75", run: () => startRace(75, 0, 0) },
          { label: "Apostar $100 a 3.º o mejor", price: "$175", run: () => startRace(75, 100, 3) },
          { label: "Apostar $100 a 2.º o mejor", price: "$175", run: () => startRace(75, 100, 2) },
          { label: "Apostar $100 a 1.º", price: "$175", run: () => startRace(75, 100, 1) },
        ];
    actions.push({ label: "Cerrar", run: closePanel });
    openPanel(
      "ARRANCONES",
      tutorial ? "Prueba el circuito. Los aros convierten Colima en pista." : "Premio base por podio. Si la patrulla llega, la carrera sigue; abandonar pierde inscripción y apuesta.",
      actions,
      "TERCER ANILLO"
    );
  }

  // ---------------------------------------------------------------------------
  // ARRANCONES
  // Antes no había rivales: el lugar salía de comparar tu tiempo contra unos
  // umbrales fijos. Corrías solo por el mapa y el juego te inventaba un puesto.
  // Ahora hay cuatro contrincantes que recorren el circuito de verdad, se les
  // ve, se les rebasa y se les puede estorbar.
  // ---------------------------------------------------------------------------
  const racers = [];
  const racerNames = ["EL CHAPARRO", "LA GÜERA", "MEMO TURBO", "RAMÓN"];
  const racerColors = ["#c8433f", "#3f6fa8", "#c9973c", "#7a4d96"];

  function raceTotalCheckpoints() {
    return raceRoute.length - 1;
  }

  function spawnRacers() {
    racers.length = 0;
    const ring = roads.find((road) => road.ring) || roads[0];
    for (let i = 0; i < 4; i += 1) {
      const t = 1 - (i + 1) * 0.004;
      const position = pathPosition(ring, ((t % 1) + 1) % 1);
      racers.push({
        id: `racer-${i}`,
        name: racerNames[i],
        color: racerColors[i],
        x: position.x + Math.cos(position.angle + Math.PI / 2) * ((i - 1.5) * 26),
        y: position.y + Math.sin(position.angle + Math.PI / 2) * ((i - 1.5) * 26),
        angle: position.angle + Math.PI / 2,
        speed: 0,
        checkpoint: 1,
        finished: false,
        finishTime: 0,
        // Cada quien corre distinto: el más lento se puede rebasar, el más
        // rápido te obliga a usar el freno de mano en las curvas.
        model: ["compacto", "sedan", "vocho", "pickup"][i],
        topSpeed: 236 + i * 21 + Math.random() * 16,
        skill: 0.72 + i * 0.06,
      });
    }
  }

  function updateRacers(dt) {
    for (const racer of racers) {
      if (racer.finished) continue;
      const target = raceRoute[racer.checkpoint];
      if (!target) {
        racer.finished = true;
        racer.finishTime = state.race.elapsed;
        continue;
      }
      const desired = Math.atan2(target.y - racer.y, target.x - racer.x);
      const heading = racer.angle - Math.PI / 2;
      racer.angle = smoothAngle(heading, desired, clamp(dt * 2.6 * racer.skill, 0, 1)) + Math.PI / 2;
      const drive = racer.angle - Math.PI / 2;
      racer.speed = lerp(racer.speed, racer.topSpeed, clamp(dt * 1.1, 0, 1));
      const nx = racer.x + Math.cos(drive) * racer.speed * dt;
      const ny = racer.y + Math.sin(drive) * racer.speed * dt;
      if (!cityBlocked(nx, ny, 24, true)) {
        racer.x = nx;
        racer.y = ny;
      } else {
        // Se raspa un muro y pierde ritmo, como cualquiera.
        racer.speed *= 0.55;
        racer.angle += 0.35;
      }
      if (distance(racer, target) < 120) {
        racer.checkpoint += 1;
        if (racer.checkpoint >= raceRoute.length) {
          racer.finished = true;
          racer.finishTime = state.race.elapsed;
        }
      }
    }
  }

  function racePosition() {
    // Se ordena por metas cruzadas y, a igualdad, por quién va más cerca de la
    // siguiente. Así el puesto en pantalla cambia al rebasar.
    const focus = getFocus();
    const mine = { checkpoint: state.race.checkpoint, x: focus.x, y: focus.y, finished: false, finishTime: Infinity };
    const field = [mine, ...racers];
    const progress = (entry) => {
      const target = raceRoute[entry.checkpoint];
      const gap = target ? distance(entry, target) : 0;
      return entry.checkpoint * 10000 - gap;
    };
    field.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      return progress(b) - progress(a);
    });
    return field.indexOf(mine) + 1;
  }

  function startRace(fee, bet, targetPlace) {
    if (!spendCash(fee + bet)) return;
    state.race = { active: true, checkpoint: 1, elapsed: 0, fee, bet, targetPlace, countdown: 3.2, place: 1 };
    spawnRacers();
    closePanel();
    showHint("¡PREPÁRATE!", 900);
    if (Math.random() < (isNight() ? 0.48 : 0.24)) raiseWanted(1, "Arrancones clandestinos");
    saveGame();
  }

  function updateRace(dt) {
    if (!state.race.active || state.scene !== "city") return;

    // Cuenta regresiva: los rivales tampoco arrancan antes.
    if (state.race.countdown > 0) {
      const before = Math.ceil(state.race.countdown);
      state.race.countdown -= dt;
      const now = Math.ceil(state.race.countdown);
      if (now !== before) {
        if (now > 0) { showHint(String(now), 600); sound("deny"); }
        else { showHint("¡ARRE!", 900); sound("pickup"); }
      }
      return;
    }

    state.race.elapsed += dt;
    updateRacers(dt);
    state.race.place = racePosition();

    const point = raceRoute[state.race.checkpoint];
    if (point && distance(getFocus(), point) < 110) {
      state.race.checkpoint += 1;
      sound("pickup");
      if (state.race.checkpoint >= raceRoute.length) finishRace();
      else showHint(`ARO ${state.race.checkpoint - 1}/${raceTotalCheckpoints()} · ${state.race.place}º`, 700);
    }
  }

  function finishRace() {
    const tutorial = state.stage === 8 && !state.tutorialFlags.race;
    // El lugar es el real: cuántos rivales cruzaron antes que tú.
    const ahead = racers.filter((racer) => racer.finished).length;
    const place = ahead + 1;
    let payout = place === 1 ? 420 : place === 2 ? 240 : place === 3 ? 130 : 0;
    if (state.race.bet > 0 && place <= state.race.targetPlace) {
      const multiplier = state.race.targetPlace === 3 ? 1.25 : state.race.targetPlace === 2 ? 1.5 : 2;
      payout += Math.floor(state.race.bet * multiplier);
    }
    state.money += payout;
    state.race.active = false;
    racers.length = 0;
    if (tutorial) {
      state.tutorialFlags.race = true;
      state.stage = 9;
      showHint(`Prueba terminada · lugar ${place}. Vuelve al Jardín del Pisto.`, 2400);
    } else {
      showHint(payout ? `Lugar ${place} · cobraste $${payout}` : `Lugar ${place} · hoy nomás pagaste por pasear`, 2200);
    }
    addNews(`Arrancones del Tercer Anillo: Eve terminó en lugar ${place}. Tránsito finge sorpresa.`);
    updateUi();
    saveGame();
  }

  function abandonRace() {
    if (!state.race.active) return;
    state.race.active = false;
    racers.length = 0;
    showHint("Abandonaste: inscripción y apuesta perdidas", 1800);
    saveGame();
  }

  function startGardenShowdown() {
    if (state.stage !== 9) return;
    setDialogue([
      { name: "EVE", portrait: "E", text: "Ya viste todo: pistear, perder feria y tunear una troca. Colima educativo." },
      { name: "STIF", portrait: "S", text: "Jajaja." },
      { name: "CHOLO", portrait: "?", text: "¿Y ustedes qué tanto se ríen?" },
      { name: "EVE", portrait: "E", text: "De tu entrada dramática, pinche vato." },
    ], () => {
      spawnTutorialEnemies(4, false);
      state.stage = 10;
      showHint("ACABA CON LOS CHOLOS · No generan estrellas en esta pelea", 2200);
      saveGame();
    });
  }

  function spawnTutorialEnemies(count, motorcycles) {
    for (let index = 0; index < count; index += 1) {
      tutorialCholos.push({
        id: `cholo-${Date.now()}-${index}`,
        x: POI.garden.x + 120 + index * 38,
        y: POI.garden.y + 70 + (index % 2) * 55,
        angle: Math.PI,
        speed: motorcycles ? 160 : 72,
        timer: 1,
        color: motorcycles ? "#d84343" : "#6d49a3",
        stunned: 0,
        health: motorcycles ? 140 : 86,
        status: "active",
        cash: 22 + index * 7,
        courage: 1,
        memory: 99,
        speech: motorcycles ? "¡No se van a ir!" : "¡Qué traes!",
        speechTimer: 2,
        enemy: true,
        motorcycle: motorcycles,
        dropped: false,
      });
    }
  }

  function updateTutorial() {
    if (state.stage === 10 && tutorialCholos.length && tutorialCholos.every((npc) => npc.status !== "active")) {
      state.stage = 11;
      spawnTutorialEnemies(3, true);
      showHint("Llegaron sus compas en moto · súbete a la troca y huye", 2300);
      saveGame();
    }
    if (state.stage === 11 && state.inVehicle && state.vehicleKind === "truck" && distance(getFocus(), POI.escape) < 150) completeMission();
  }

  function acceptDidiOrder() {
    if (!state.didiUnlocked || state.didi.active) return;
    let fromIndex = Math.floor(Math.random() * didiStops.length);
    let toIndex = Math.floor(Math.random() * didiStops.length);
    if (toIndex === fromIndex) toIndex = (toIndex + 2) % didiStops.length;
    state.didi.active = true;
    state.didi.phase = "pickup";
    state.didi.pickup = didiStops[fromIndex];
    state.didi.dropoff = didiStops[toIndex];
    state.didi.pay = 78 + Math.floor(Math.random() * 38);
    state.didi.timer = 110;
    state.didi.crashes = 0;
    closePhone();
    showHint(`Didi: recoge en ${state.didi.pickup.name}`, 2200);
    saveGame();
  }

  function handleDidiStop() {
    if (!state.didi.active) return;
    if (state.didi.phase === "pickup") {
      state.didi.phase = "dropoff";
      state.didi.timer = 145;
      showHint(`Pedido recogido · lleva a ${state.didi.dropoff.name}`, 2100);
      sound("pickup");
      return;
    }
    const speedBonus = state.didi.timer > 65 ? 10 : 0;
    const tip = state.didi.crashes === 0 && state.didi.timer > 55 ? 8 + Math.floor(Math.random() * 11) : 0;
    const gross = state.didi.pay + speedBonus + tip;
    const commission = Math.ceil(gross * state.didi.commission);
    const net = gross - commission;
    state.money += net;
    state.rochi.cash += commission;
    state.didi.completed += 1;
    state.didi.rating = clamp(state.didi.rating + (state.didi.crashes === 0 ? 0.08 : -0.12), 1, 5);
    state.didi.active = false;
    state.didi.phase = "idle";
    showHint(`Entrega lista: $${net}${tip ? ` con $${tip} de propina` : ""}. Rochi guardó $${commission}.`, 2600);
    saveGame();
  }

  function updateDidi(dt) {
    if (!state.didi.active) return;
    state.didi.timer -= dt;
    state.didi.rating = clamp(state.didi.rating - dt * 0.0018, 1, 5);
    if (state.didi.timer <= 0) {
      state.didi.active = false;
      state.didi.phase = "idle";
      state.didi.rating = clamp(state.didi.rating - 0.45, 1, 5);
      state.rochi.cash += 5;
      showHint("Pedido cancelado. Rochi: “Te dije que te apuraras; ahora me debes la comisión.”", 2700);
      addNews("Una orden de comida recorrió medio Colima y jamás llegó. Investigación apunta a Eve.");
    }
  }

  function updateRochi() {
    if (!state.freeRoam) return;
    const hour = (state.time / 60) % 24;
    const shouldSleep = hour >= 2 && hour < 11;
    if (shouldSleep && !state.rochi.asleep) {
      state.rochi.asleep = true;
      state.rochi.available = false;
      state.rochi.following = false;
      state.rochi.rideRequest = false;
      showHint("Rochi se fue a dormir. Reaparece después de las 11:00.", 2100);
    } else if (!shouldSleep && state.rochi.asleep) {
      state.rochi.asleep = false;
      state.rochi.available = true;
      state.rochi.x = POI.marina.x;
      state.rochi.y = POI.marina.y;
      state.rochi.askedRide = false;
      addNews("Rochi salió de La Marina diciendo que otra vez no trae nada.");
    }
    if (!shouldSleep && hour >= 1 && hour < 2 && state.rochi.following && !state.rochi.askedRide) {
      state.rochi.askedRide = true;
      state.rochi.rideRequest = true;
      showHint("Rochi: “Ya me dio sueño. ¿Me llevas a mi casa o qué?”", 2600);
    }
    if (state.rochi.following && hour >= 18 && state.rochi.lastLoanAskDay < state.day && (!state.rochi.loan || state.rochi.loan.resolved)) {
      state.rochi.lastLoanAskDay = state.day;
      state.rochi.loanOffer = (state.day + Math.floor(state.rochi.cash)) % 3 !== 0;
      if (state.rochi.loanOffer) showHint("Rochi: “¿Me prestas $100? En dos días te pago; yo siempre pago.”", 2900);
    }
    if (state.rochi.loan && !state.rochi.loan.resolved && state.day >= state.rochi.loan.dueDay) {
      state.rochi.loan.resolved = true;
      if (Math.random() < 0.68) {
        const repayment = Math.ceil(state.rochi.loan.amount * 1.2);
        state.money += repayment;
        state.rochi.cash -= repayment;
        showHint(`Rochi sí pagó: $${repayment}. Nadie en Colima lo puede creer.`, 2600);
        addNews("Hecho histórico: Rochi pagó un préstamo e incluso dejó extra.");
      } else {
        showHint("Rochi no pagó. Dice que ya había invitado antes. Tampoco es cierto.", 2600);
        addNews("Rochi vence otro plazo y culpa a la inflación, a Eve y al calor.");
      }
    }
  }

  function dropRochiHome() {
    if (!state.rochi.rideRequest) return;
    state.rochi.rideRequest = false;
    state.rochi.following = false;
    state.rochi.available = false;
    state.rochi.asleep = true;
    state.rochi.x = POI.rochiHome.x;
    state.rochi.y = POI.rochiHome.y;
    state.rochi.cash += 1;
    showHint("Rochi llegó a su casa y te dio las gracias sin cooperar para la gasolina.", 2500);
    saveGame();
  }

  function lendToRochi(amount) {
    if (!state.freeRoam || state.rochi.loan && !state.rochi.loan.resolved) return;
    if (!spendCash(amount)) return;
    state.rochi.cash += amount;
    state.rochi.loan = { amount, dueDay: state.day + 2, resolved: false };
    state.rochi.loanOffer = false;
    state.rochi.lastLoanAskDay = state.day;
    showHint(`Le prestaste $${amount}. Vence en dos días del juego.`, 1900);
    closePhone();
    saveGame();
  }

  function bribePolice() {
    if (state.wanted !== 1 || !spendCash(75)) return;
    state.wanted = 0;
    state.wantedTimer = 0;
    policeUnits.length = 0;
    // Antes solo se iban las patrullas y los policías a pie te seguían
    // balaceando después de haber pagado.
    policeOfficers.length = 0;
    roadblocks.length = 0;
    showHint("Soborno aceptado. Esta unidad decidió no haber visto nada.", 1900);
    addNews("Una patrulla olvidó repentinamente por qué seguía a Eve.");
    saveGame();
  }

  function attack() {
    const weapon = weapons[state.equippedWeapon] || weapons.fists;
    if (state.player.punch > 0) return;
    const firearmEquipped = state.equippedWeapon === "pistol" || state.equippedWeapon === "smg";
    // A puñetazos desde la troca no se llega a nadie; con arma sí, pero
    // disparando desde el carro y no desde donde Eve se bajó la última vez.
    if (state.inVehicle && !firearmEquipped) {
      showHint("Bájate para repartir. Desde aquí no alcanzas.", 1000);
      sound("deny");
      return;
    }
    if ((state.equippedWeapon === "pistol" || state.equippedWeapon === "smg") && (state.ammo[state.equippedWeapon] || 0) <= 0) {
      showHint("Sin balas. Cambia de arma con Q.", 1100);
      sound("deny");
      return;
    }
    state.player.punch = weapon.cooldown;
    const firearm = state.equippedWeapon === "pistol" || state.equippedWeapon === "smg";
    if (firearm) {
      state.ammo[state.equippedWeapon] -= 1;
      sound("shot");
    } else {
      sound("punch");
    }
    const namedTargets = [state.stif];
    if (state.rochi.available && !state.rochi.asleep) namedTargets.push(state.rochi);
    if (state.fede.available) namedTargets.push(state.fede);
    const targets = [...tutorialCholos, ...storyEnemies, ...npcs, ...policeUnits, ...policeOfficers, ...namedTargets].filter((npc) => npc.status === "active" && !(npc.gardenRegular && isNight()));
    // Origen y dirección del ataque: a pie sale de Eve, manejando sale del
    // vehículo y apunta hacia donde va el cofre.
    const shooter = state.inVehicle ? activeVehicle() : state.player;
    const aim = state.inVehicle ? (activeVehicle().angle || 0) - Math.PI / 2 : state.player.angle;
    let victim = null;
    let best = weapon.range + 1;
    for (const npc of targets) {
      const dx = npc.x - shooter.x;
      const dy = npc.y - shooter.y;
      const dist = Math.hypot(dx, dy);
      if (dist > weapon.range) continue;
      const alignment = (dx * Math.cos(aim) + dy * Math.sin(aim)) / (dist || 1);
      if (alignment < (firearm ? 0.88 : 0.3)) continue;
      if (firearm && lineOfSightBlocked(shooter.x, shooter.y, npc.x, npc.y, 4)) continue;
      if (dist < best) {
        victim = npc;
        best = dist;
      }
    }
    if (firearm) {
      const endpoint = victim ? victim : traceShotEndpoint(shooter.x, shooter.y, aim, weapon.range);
      projectiles.push({ x1: shooter.x, y1: shooter.y, x2: endpoint.x, y2: endpoint.y, life: 0.09 });
      state.shake = Math.max(state.shake, 0.35);
    }
    if (!victim) return;
    hitNpc(victim, weapon);
    updateUi();
  }

  function hitNpc(npc, weapon) {
    npc.health -= weapon.damage;
    npc.memory = 99;
    npc.stunned = weapon.lethal ? 0.3 : 1.1;
    const shove = state.inVehicle ? (activeVehicle().angle || 0) - Math.PI / 2 : state.player.angle;
    npc.x += Math.cos(shove) * (weapon.lethal ? 15 : 28);
    npc.y += Math.sin(shove) * (weapon.lethal ? 15 : 28);
    impactParticles(npc.x, npc.y, weapon.lethal ? "#e34e62" : "#ffd0a8");

    if (npc.health > 0) {
      if (npc.police) raiseWanted(4, "Ataque a policía");
      else if (!npc.enemy) raiseWanted(1, `Agresión con ${weapon.name.toLowerCase()}`);
      sayNpc(npc, npc.enemy ? "¡Eso qué, pues!" : "¡No mames, Eve!", 1.5);
      return;
    }

    npc.status = weapon.lethal ? "dead" : "knocked";
    npc.stunned = weapon.lethal ? 0 : 18;
    if (npc.protected) {
      npc.status = "knocked";
      npc.stunned = 8;
      npc.health = 0;
      raiseWanted(2, "Agresión a personaje protegido");
      const protectedName = npc === state.rochi ? "Rochi" : npc === state.fede ? "Fede" : "Stif";
      showHint(`${protectedName} quedó noqueado, pero no puede morir`, 1700);
      return;
    }
    if (!npc.dropped) {
      if (npc.cash > 0) pickups.push({ type: "cash", x: npc.x + 14, y: npc.y, amount: npc.cash, life: 60 });
      npc.dropped = true;
      if (npc.police) pickups.push({ type: "weapon", weapon: "pistol", ammo: 3, x: npc.x - 15, y: npc.y, life: 60, police: true });
      else if (npc.enemy && Math.random() < 0.16) pickups.push({ type: "weapon", weapon: "pistol", ammo: 2, x: npc.x - 15, y: npc.y, life: 60, police: false });
    }
    if (npc.police) raiseWanted(weapon.lethal ? 5 : 4, weapon.lethal ? "Policía abatido" : "Policía noqueado");
    else if (!npc.enemy) raiseWanted(weapon.lethal ? 3 : 2, weapon.lethal ? "Civil muerto" : "Civil noqueado");
    if (npc.enemy) showHint(weapon.lethal ? "Enemigo abatido" : "Enemigo noqueado", 700);
  }

  function showHint(message, duration = 0) {
    const hint = $("#hint");
    hint.textContent = message;
    hint.classList.add("visible");
    if (duration) {
      window.clearTimeout(showHint.timer);
      showHint.timer = window.setTimeout(() => {
        hint.classList.remove("visible");
        showHint.timer = null;
      }, duration);
    }
  }

  function updateContextHint() {
    const target = nearbyInteraction();
    const hint = $("#hint");
    if (state.dialogue) {
      hint.classList.remove("visible");
      return;
    }
    const copy = {
      house: "USAR: entrar a casa de Eve",
      pelicano: "USAR: entrar a El Pelícano",
      "pelicano-shop": "USAR: comprar en El Pelícano",
      marina: "USAR: entrar a La Marina San Fernando",
      "marina-counter": "USAR: preguntar por Rochi",
      "cbtis-teacher": "USAR: hablar con el maestro",
      "bank-counter": "USAR: usar ventanilla y cajero",
      "garage-counter": "USAR: reparar o tunear la troca",
      "interior-exit": "USAR: salir a la calle",
      stif: "USAR: hablar con Stif",
      rochi: "USAR: hablar con Rochi",
      "rochi-chat": "USAR: escuchar otra excusa de Rochi",
      fede: "USAR: preguntarle a Fede por el Sentra",
      "fede-lot": "USAR: buscar las llaves del Sentra",
      "fede-car": "USAR: robar el Nissan Sentra 2000",
      cbtis: "USAR: preguntar por el proyecto de tesis",
      corralon: "USAR: colarte al corralón",
      "rochi-bike": "USAR: subir a la moto de Rochi",
      truck: "USAR: subir a la camioneta",
      "stolen-car": "USAR: subir al carro robado",
      "steal-traffic": "USAR: robar vehículo",
      "truck-exit": "USAR: bajar de la camioneta",
      raffle: "USAR: jugar la rifa",
      pawn: "USAR: vender premios",
      bank: "USAR: retirar efectivo",
      garage: "USAR: reparar o tunear la troca",
      gas: "USAR: cargar gasolina",
      race: "USAR: entrar a los arrancones",
      "garden-showdown": "USAR: volver a pistear con Stif",
      "didi-stop": state.didi.phase === "pickup" ? "USAR: recoger pedido" : "USAR: entregar pedido",
      "rochi-home": "USAR: dejar a Rochi en su casa",
      bribe: "USAR: sobornar esta unidad por $75",
      "race-abandon": "USAR: abandonar carrera y perder la feria",
      raffle: "USAR: entrar a Rifas El Aferrado",
      "raffle-counter": "USAR: jugar una rifa",
      pawn: "USAR: entrar al Empeño Volcán",
      "pawn-counter": "USAR: empeñar o vender",
      gas: "USAR: entrar a la tienda",
      "gas-counter": "USAR: cargar gasolina y comprar",
      "agronomia-start": "USAR: recibir trabajo de campo",
      "agronomia-valve": "USAR: revisar válvula y tomar muestra",
      "agronomia-finish": "USAR: entregar las mediciones",
    };
    if (copy[target]) {
      hint.textContent = copy[target];
      hint.classList.add("visible");
    } else if (!showHint.timer) {
      hint.classList.remove("visible");
    }
  }

  // Las longitudes de cada tramo se recalculaban en CADA llamada, y esto se
  // llama miles de veces por cuadro (tráfico, patrullas, dibujo de calles,
  // mugre, banquetas). Ahora se calculan una vez por calle.
  function roadMetrics(road) {
    if (road._lengths) return road;
    const lengths = [];
    let total = 0;
    for (let i = 0; i < road.points.length - 1; i += 1) {
      const length = Math.hypot(road.points[i + 1][0] - road.points[i][0], road.points[i + 1][1] - road.points[i][1]);
      lengths.push(length);
      total += length;
    }
    road._lengths = lengths;
    road._total = total;
    return road;
  }

  function pathPosition(road, t) {
    const points = road.points;
    const { _lengths: segmentLengths, _total: total } = roadMetrics(road);
    let target = clamp(t, 0, 1) * total;
    for (let i = 0; i < segmentLengths.length; i += 1) {
      if (target <= segmentLengths[i]) {
        const local = segmentLengths[i] ? target / segmentLengths[i] : 0;
        const a = points[i];
        const b = points[i + 1];
        return { x: lerp(a[0], b[0], local), y: lerp(a[1], b[1], local), angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
      }
      target -= segmentLengths[i];
    }
    const a = points[points.length - 2];
    const b = points[points.length - 1];
    return { x: b[0], y: b[1], angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }

  // ---------------------------------------------------------------------------
  // Fuente de mapa de bits 5x7. Sin esto el texto es Arial escalado y se ve
  // como sopa; con esto el juego entero queda en el mismo idioma visual.
  // ---------------------------------------------------------------------------
  const GLYPHS = {
    A: "01110|10001|10001|11111|10001|10001|10001",
    B: "11110|10001|11110|10001|10001|10001|11110",
    C: "01110|10001|10000|10000|10000|10001|01110",
    D: "11110|10001|10001|10001|10001|10001|11110",
    E: "11111|10000|11110|10000|10000|10000|11111",
    F: "11111|10000|11110|10000|10000|10000|10000",
    G: "01110|10001|10000|10111|10001|10001|01111",
    H: "10001|10001|11111|10001|10001|10001|10001",
    I: "11111|00100|00100|00100|00100|00100|11111",
    J: "00111|00010|00010|00010|00010|10010|01100",
    K: "10001|10010|11100|10100|10010|10010|10001",
    L: "10000|10000|10000|10000|10000|10000|11111",
    M: "10001|11011|10101|10101|10001|10001|10001",
    N: "10001|11001|10101|10011|10001|10001|10001",
    O: "01110|10001|10001|10001|10001|10001|01110",
    P: "11110|10001|10001|11110|10000|10000|10000",
    Q: "01110|10001|10001|10001|10101|10010|01101",
    R: "11110|10001|10001|11110|10100|10010|10001",
    S: "01111|10000|10000|01110|00001|00001|11110",
    T: "11111|00100|00100|00100|00100|00100|00100",
    U: "10001|10001|10001|10001|10001|10001|01110",
    V: "10001|10001|10001|10001|10001|01010|00100",
    W: "10001|10001|10001|10101|10101|11011|10001",
    X: "10001|10001|01010|00100|01010|10001|10001",
    Y: "10001|10001|01010|00100|00100|00100|00100",
    Z: "11111|00001|00010|00100|01000|10000|11111",
    "0": "01110|10011|10101|10101|11001|10001|01110",
    "1": "00100|01100|00100|00100|00100|00100|01110",
    "2": "01110|10001|00001|00110|01000|10000|11111",
    "3": "11110|00001|00001|01110|00001|00001|11110",
    "4": "00010|00110|01010|10010|11111|00010|00010",
    "5": "11111|10000|11110|00001|00001|10001|01110",
    "6": "00110|01000|10000|11110|10001|10001|01110",
    "7": "11111|00001|00010|00100|01000|01000|01000",
    "8": "01110|10001|10001|01110|10001|10001|01110",
    "9": "01110|10001|10001|01111|00001|00010|01100",
    " ": "00000|00000|00000|00000|00000|00000|00000",
    ".": "00000|00000|00000|00000|00000|01100|01100",
    ",": "00000|00000|00000|00000|01100|01100|11000",
    ":": "00000|01100|01100|00000|01100|01100|00000",
    ";": "00000|01100|01100|00000|01100|01100|11000",
    "!": "00100|00100|00100|00100|00100|00000|00100",
    "?": "01110|10001|00001|00110|00100|00000|00100",
    "'": "00100|00100|01000|00000|00000|00000|00000",
    "\"": "01010|01010|01010|00000|00000|00000|00000",
    "-": "00000|00000|00000|11111|00000|00000|00000",
    "+": "00000|00100|00100|11111|00100|00100|00000",
    "=": "00000|00000|11111|00000|11111|00000|00000",
    "/": "00001|00010|00010|00100|01000|01000|10000",
    "\\": "10000|01000|01000|00100|00010|00010|00001",
    "$": "00100|01111|10100|01110|00101|11110|00100",
    "%": "11001|11010|00010|00100|01000|01011|10011",
    "*": "00000|10101|01110|11111|01110|10101|00000",
    "(": "00010|00100|01000|01000|01000|00100|00010",
    ")": "01000|00100|00010|00010|00010|00100|01000",
    "[": "01110|01000|01000|01000|01000|01000|01110",
    "]": "01110|00010|00010|00010|00010|00010|01110",
    "<": "00010|00100|01000|10000|01000|00100|00010",
    ">": "01000|00100|00010|00001|00010|00100|01000",
    "#": "01010|01010|11111|01010|11111|01010|01010",
    "@": "01110|10001|10111|10101|10111|10000|01110",
    "&": "01100|10010|10010|01100|10101|10010|01101",
    "_": "00000|00000|00000|00000|00000|00000|11111",
    "°": "01100|10010|01100|00000|00000|00000|00000",
    "Á": "00100|01110|10001|11111|10001|10001|10001",
    "É": "00100|11111|10000|11110|10000|10000|11111",
    "Í": "00100|11111|00100|00100|00100|00100|11111",
    "Ó": "00100|01110|10001|10001|10001|10001|01110",
    "Ú": "00100|10001|10001|10001|10001|10001|01110",
    "Ñ": "01110|00000|10001|11001|10101|10011|10001",
    "Ü": "01010|00000|10001|10001|10001|10001|01110",
    "¿": "00100|00000|00100|01000|10001|10001|01110",
    "¡": "00100|00000|00100|00100|00100|00100|00100",
    "★": "00100|00100|11111|01110|01110|01010|10001",
    "☆": "00100|01010|10101|01110|01010|01010|10001",
    "✦": "00100|00100|01110|11111|01110|00100|00100",
    "→": "00000|00100|00010|11111|00010|00100|00000",
    "←": "00000|00100|01000|11111|01000|00100|00000",
    "∞": "00000|00000|01010|10101|10101|01010|00000",
  };

  const glyphCache = new Map();

  function glyphRows(char) {
    const key = char.toUpperCase();
    if (glyphCache.has(key)) return glyphCache.get(key);
    const raw = GLYPHS[key] || GLYPHS[char] || null;
    const rows = raw ? raw.split("|") : null;
    glyphCache.set(key, rows);
    return rows;
  }

  function pixelTextWidth(text, scale = 1, tracking = 1) {
    return text.length * (5 + tracking) * scale - tracking * scale;
  }

  // align: "left" | "center" | "right". shadow pinta un contorno duro detrás.
  function drawPixelText(text, x, y, options = {}) {
    const {
      color = "#f3ead1",
      scale = 1,
      align = "left",
      shadow = "#0a0c10",
      tracking = 1,
      target = ctx,
    } = options;
    const copy = String(text ?? "");
    const width = pixelTextWidth(copy, scale, tracking);
    let cursor = align === "center" ? Math.round(x - width / 2) : align === "right" ? Math.round(x - width) : Math.round(x);
    const top = Math.round(y);
    const step = (5 + tracking) * scale;

    for (const char of copy) {
      const rows = glyphRows(char);
      if (rows) {
        if (shadow) {
          target.fillStyle = shadow;
          for (let ry = 0; ry < rows.length; ry += 1) {
            for (let rx = 0; rx < 5; rx += 1) {
              if (rows[ry][rx] !== "1") continue;
              target.fillRect(cursor + rx * scale, top + ry * scale + scale, scale, scale);
              target.fillRect(cursor + rx * scale + scale, top + ry * scale, scale, scale);
            }
          }
        }
        target.fillStyle = color;
        for (let ry = 0; ry < rows.length; ry += 1) {
          for (let rx = 0; rx < 5; rx += 1) {
            if (rows[ry][rx] === "1") target.fillRect(cursor + rx * scale, top + ry * scale, scale, scale);
          }
        }
      }
      cursor += step;
    }
    return width;
  }

  // Etiquetas del mundo: se juntan durante el dibujado y se pintan al final,
  // en espacio de pantalla, para que no se deformen con el zoom ni se encimen.
  const labelQueue = [];

  function queueWorldLabel(worldX, worldY, text, options = {}) {
    if (!text) return;
    // Sin esto la pantalla se llena de letreros y no se ve el juego.
    const near = options.range ?? 340;
    if (near > 0) {
      const focus = getFocus();
      if (Math.hypot(focus.x - worldX, focus.y - worldY) > near) return;
    }
    const point = worldToScreen(worldX, worldY);
    if (point.x < -80 || point.y < -40 || point.x > view.bufferWidth + 80 || point.y > view.bufferHeight + 40) return;
    labelQueue.push({ x: point.x, y: point.y, text: String(text), options });
  }

  function flushWorldLabels() {
    for (const label of labelQueue) {
      const { scale = 1, align = "center", color = "#efe7d2", shadow = "#0a0c10", plate = null } = label.options;
      if (plate) {
        const width = pixelTextWidth(label.text, scale) + 6;
        ctx.fillStyle = plate;
        ctx.fillRect(Math.round(label.x - width / 2), Math.round(label.y - 2), width, 7 * scale + 4);
        ctx.fillStyle = "rgba(0,0,0,.45)";
        ctx.fillRect(Math.round(label.x - width / 2), Math.round(label.y + 7 * scale + 2), width, 1);
      }
      drawPixelText(label.text, label.x, label.y, { scale, align, color, shadow });
    }
    labelQueue.length = 0;
  }

  function beginWorldTransform() {
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    // Redondear al pixel del buffer evita el temblor de los bordes al moverse.
    ctx.translate(-Math.round(camera.x * camera.zoom) / camera.zoom, -Math.round(camera.y * camera.zoom) / camera.zoom);
  }

  function worldToScreen(x, y) {
    return {
      x: (x - Math.round(camera.x * camera.zoom) / camera.zoom) * camera.zoom,
      y: (y - Math.round(camera.y * camera.zoom) / camera.zoom) * camera.zoom,
    };
  }

  function endWorldTransform() {
    ctx.restore();
  }

  function viewportBounds(margin = 0) {
    return {
      left: camera.x - margin,
      top: camera.y - margin,
      right: camera.x + view.bufferWidth / camera.zoom + margin,
      bottom: camera.y + view.bufferHeight / camera.zoom + margin,
    };
  }

  function visiblePoint(point, margin = 80) {
    const bounds = viewportBounds(margin);
    return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
  }

  function visibleRect(rect, margin = 80) {
    const bounds = viewportBounds(margin);
    return rect.x + rect.w >= bounds.left && rect.x <= bounds.right && rect.y + rect.h >= bounds.top && rect.y <= bounds.bottom;
  }

  function px(value) {
    return Math.round(value);
  }

  // Rectángulo con bisel duro: luz arriba-izquierda, sombra abajo-derecha.
  // Es lo que hace que un cuadro plano parezca un bloque con volumen.
  function bevelRect(x, y, w, h, base, light, dark, edge = 2) {
    ctx.fillStyle = base;
    ctx.fillRect(px(x), px(y), px(w), px(h));
    ctx.fillStyle = light;
    ctx.fillRect(px(x), px(y), px(w), edge);
    ctx.fillRect(px(x), px(y), edge, px(h));
    ctx.fillStyle = dark;
    ctx.fillRect(px(x), px(y + h - edge), px(w), edge);
    ctx.fillRect(px(x + w - edge), px(y), edge, px(h));
  }

  function outlineRect(x, y, w, h, color = palette.outline, weight = 2) {
    ctx.fillStyle = color;
    ctx.fillRect(px(x), px(y), px(w), weight);
    ctx.fillRect(px(x), px(y + h - weight), px(w), weight);
    ctx.fillRect(px(x), px(y), weight, px(h));
    ctx.fillRect(px(x + w - weight), px(y), weight, px(h));
  }

  // Sombra proyectada dura, sin degradado. El degradado es lo que hacía que
  // todo se viera de plástico.
  function castShadow(x, y, w, h, offset = 10) {
    ctx.fillStyle = "rgba(6,8,12,.42)";
    ctx.fillRect(px(x + offset), px(y + offset), px(w), px(h));
  }

  function drawParkingLot(lot) {
    if (!visibleRect(lot, 40)) return;
    ctx.save();
    bevelRect(lot.x, lot.y, lot.w, lot.h, lot.tone, "#565c61", "#33383c", 3);
    // Manchas de aceite y parches de asfalto remendado.
    for (let i = 0; i < 14; i += 1) {
      const s = idSeed(`${lot.x}-${lot.y}-${i}`);
      const bx = lot.x + 14 + seededValue(s) * (lot.w - 34);
      const by = lot.y + 14 + seededValue(s + 7) * (lot.h - 30);
      ctx.fillStyle = seededValue(s + 3) > 0.5 ? "rgba(12,14,18,.35)" : "rgba(255,255,255,.05)";
      ctx.fillRect(px(bx), px(by), px(10 + seededValue(s + 4) * 16), px(7 + seededValue(s + 5) * 9));
    }
    ctx.fillStyle = lot.school ? "rgba(226,216,180,.55)" : "rgba(232,228,205,.4)";
    const rows = Math.max(2, Math.floor(lot.h / 120));
    for (let row = 1; row <= rows; row += 1) {
      const y = lot.y + (row * lot.h) / (rows + 1);
      for (let x = lot.x + 28; x < lot.x + lot.w - 22; x += 48) ctx.fillRect(px(x), px(y - 22), 2, 44);
    }
    outlineRect(lot.x, lot.y, lot.w, lot.h, "#1b1f23", 2);
    ctx.restore();
  }

  // Un cruce se dibuja como plancha de asfalto que tapa camellón y rayas, más
  // una cebra por cada acceso. Antes se pintaban dos cebras del ancho completo,
  // una encima de otra, y quedaba una cuadrícula blanca sobre la esquina.
  function drawJunctionPad(intersection) {
    const size = Math.max(intersection.widthA, intersection.widthB);
    ctx.save();
    ctx.translate(px(intersection.x), px(intersection.y));
    ctx.rotate(intersection.angleA);
    ctx.fillStyle = palette.asphalt;
    ctx.fillRect(px(-intersection.widthB / 2 - 4), px(-intersection.widthA / 2), px(intersection.widthB + 8), px(intersection.widthA));
    ctx.restore();
    ctx.save();
    ctx.translate(px(intersection.x), px(intersection.y));
    ctx.rotate(intersection.angleB);
    ctx.fillStyle = palette.asphalt;
    ctx.fillRect(px(-intersection.widthA / 2 - 4), px(-intersection.widthB / 2), px(intersection.widthA + 8), px(intersection.widthB));
    ctx.restore();
    return size;
  }

  function drawZebra(intersection, angle, roadWidth, crossWidth, green) {
    ctx.save();
    ctx.translate(px(intersection.x), px(intersection.y));
    ctx.rotate(angle);
    // Las cebras van en los dos accesos, fuera de la plancha del cruce.
    for (const side of [-1, 1]) {
      const at = side * (crossWidth / 2 + 13);
      ctx.fillStyle = "#d9d6c4";
      for (let offset = -roadWidth * 0.44; offset < roadWidth * 0.44; offset += 15) {
        ctx.fillRect(px(at - 9), px(offset), 18, 9);
      }
      ctx.fillStyle = "rgba(10,12,16,.28)";
      for (let offset = -roadWidth * 0.44; offset < roadWidth * 0.44; offset += 15) {
        ctx.fillRect(px(at - 9), px(offset + 9), 18, 2);
      }
      // Raya de alto.
      ctx.fillStyle = "rgba(226,222,204,.55)";
      ctx.fillRect(px(at + side * 13), px(-roadWidth * 0.44), 4, px(roadWidth * 0.88));
    }
    // Semáforo en dos esquinas.
    const lightColor = green ? "#5fd167" : "#e2434f";
    for (const corner of [[-1, -1], [1, 1]]) {
      const cx = corner[0] * (crossWidth / 2 + 22);
      const cy = corner[1] * (roadWidth / 2 + 16);
      ctx.fillStyle = "rgba(6,8,12,.42)";
      ctx.fillRect(px(cx - 3), px(cy - 3), 13, 13);
      ctx.fillStyle = "#191d22";
      ctx.fillRect(px(cx - 6), px(cy - 6), 12, 12);
      ctx.fillStyle = lightColor;
      ctx.fillRect(px(cx - 4), px(cy - 4), 8, 8);
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.fillRect(px(cx - 4), px(cy - 4), 3, 3);
    }
    ctx.restore();
  }

  function drawCrosswalk(intersection, angle, roadWidth, green) {
    drawZebra(intersection, angle, roadWidth, roadWidth, green);
  }

  function drawRoadIntersections() {
    const lightPhase = Math.floor(state.time / 8) % 2;
    for (const intersection of roadIntersections) {
      if (!visiblePoint(intersection, 160)) continue;
      drawJunctionPad(intersection);
      drawZebra(intersection, intersection.angleA, intersection.widthA, intersection.widthB, lightPhase === intersection.phase);
      drawZebra(intersection, intersection.angleB, intersection.widthB, intersection.widthA, lightPhase !== intersection.phase);
    }
  }

  function drawLaneArrows(road) {
    if (road.width < 118) return;
    for (const t of [0.22, 0.55, 0.86]) {
      const position = pathPosition(road, t);
      if (!visiblePoint(position, 100)) continue;
      ctx.save();
      ctx.translate(px(position.x), px(position.y));
      ctx.rotate(position.angle);
      ctx.fillStyle = "rgba(226,222,198,.5)";
      ctx.fillRect(-16, -2, 26, 5);
      ctx.fillRect(8, -6, 5, 13);
      ctx.fillRect(12, -3, 5, 7);
      ctx.restore();
    }
  }

  // Mugre, parches y grietas siguiendo el trazo de la calle. Va por la ruta y
  // no por la pantalla, así que queda recortado dentro del asfalto solo.
  function drawRoadGrime(road, residential) {
    const steps = residential ? 14 : 26;
    const half = road.width * 0.36;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const position = pathPosition(road, t);
      if (!visiblePoint(position, 90)) continue;
      const seed = idSeed(`${road.name || "res"}-${road.width}-${i}`);
      const across = (seededValue(seed) - 0.5) * half * 2;
      const nx = Math.cos(position.angle + Math.PI / 2) * across;
      const ny = Math.sin(position.angle + Math.PI / 2) * across;
      const w = 12 + seededValue(seed + 2) * 26;
      const h = 7 + seededValue(seed + 3) * 12;
      ctx.fillStyle = seededValue(seed + 4) > 0.55 ? "rgba(255,255,255,.045)" : "rgba(8,10,14,.3)";
      ctx.fillRect(px(position.x + nx - w / 2), px(position.y + ny - h / 2), px(w), px(h));
    }
  }

  // Losetas de banqueta: rayitas perpendiculares al borde de la calle.
  function drawSidewalkTiles(road) {
    const steps = Math.max(10, Math.round(road.points.length * 9));
    const offset = road.width / 2 + 8;
    for (let i = 0; i <= steps; i += 1) {
      const position = pathPosition(road, i / steps);
      if (!visiblePoint(position, 90)) continue;
      const nx = Math.cos(position.angle + Math.PI / 2);
      const ny = Math.sin(position.angle + Math.PI / 2);
      ctx.fillStyle = "rgba(96,90,78,.5)";
      for (const side of [-1, 1]) {
        const bx = position.x + nx * offset * side;
        const by = position.y + ny * offset * side;
        ctx.fillRect(px(bx - Math.cos(position.angle + Math.PI / 2) * 9), px(by - Math.sin(position.angle + Math.PI / 2) * 9), 2, 2);
        ctx.save();
        ctx.translate(px(bx), px(by));
        ctx.rotate(position.angle);
        ctx.fillRect(-1, -11, 2, 22);
        ctx.restore();
      }
    }
  }

  function strokePath(road, width, color, dash = null) {
    const points = road.points;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  function drawRoadBase(road, residential) {
    // Banqueta primero, luego guarnición, luego asfalto. Da el escalón de
    // altura que antes no existía: la calle era una raya gris y ya.
    strokePath(road, road.width + (residential ? 20 : 34), palette.walk);
    strokePath(road, road.width + (residential ? 15 : 26), palette.walkDark);
    strokePath(road, road.width + (residential ? 11 : 17), palette.curb);
    strokePath(road, road.width + 5, "#191d22");
    strokePath(road, road.width, residential ? palette.asphaltDark : palette.asphalt);
  }

  // Trazo paralelo a la calle, para pintar carriles de verdad en vez de
  // simular con anillos de grosor.
  function offsetPath(road, offset) {
    const key = `_off${Math.round(offset)}`;
    if (road[key]) return road[key];
    const points = road.points;
    const result = [];
    for (let i = 0; i < points.length; i += 1) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const angle = Math.atan2(next[1] - prev[1], next[0] - prev[0]) + Math.PI / 2;
      result.push([points[i][0] + Math.cos(angle) * offset, points[i][1] + Math.sin(angle) * offset]);
    }
    road[key] = { points: result, width: 0 };
    return road[key];
  }

  function drawRoadMarkings(road, residential) {
    const w = road.width;
    if (residential) {
      // Callecita: una sola raya tenue al centro.
      strokePath(road, 2, "rgba(214,210,190,.16)", [16, 20]);
      return;
    }
    // Desgaste donde pasan las llantas.
    strokePath(offsetPath(road, -w * 0.3), 26, "rgba(255,255,255,.03)");
    strokePath(offsetPath(road, w * 0.3), 26, "rgba(255,255,255,.03)");

    // Orilla blanca continua de cada lado.
    strokePath(offsetPath(road, -(w / 2 - 11)), 3, "rgba(222,218,198,.5)");
    strokePath(offsetPath(road, w / 2 - 11), 3, "rgba(222,218,198,.5)");

    const lanes = w >= 150 ? 3 : w >= 120 ? 2 : 1;
    // Divisiones de carril discontinuas.
    if (lanes > 1) {
      for (let i = 1; i < lanes; i += 1) {
        const off = (w / 2 - 14) * (i / lanes);
        strokePath(offsetPath(road, -off), 3, "rgba(226,222,204,.4)", [26, 30]);
        strokePath(offsetPath(road, off), 3, "rgba(226,222,204,.4)", [26, 30]);
      }
    }

    if (w >= 150) {
      // Camellón: la avenida ancha se lee como avenida y no como pista vacía.
      strokePath(road, 22, "#7f7869");
      strokePath(road, 16, "#4f6b45");
      strokePath(road, 5, "#5f7f52", [22, 26]);
      strokePath(road, 26, "rgba(0,0,0,.22)", [2, 46]);
    } else {
      // Doble raya amarilla continua.
      strokePath(offsetPath(road, -3), 3, palette.line);
      strokePath(offsetPath(road, 3), 3, palette.line);
    }
  }

  function drawRoad(road, residential = false) {
    ctx.save();
    drawRoadBase(road, residential);
    drawRoadMarkings(road, residential);
    drawRoadGrime(road, residential);
    if (!residential) drawSidewalkTiles(road);
    ctx.restore();
    if (!residential) drawLaneArrows(road);
  }

  function drawRoadLabel(road) {
    if (!road.name) return;
    const position = pathPosition(road, 0.52);
    queueWorldLabel(position.x, position.y - 4, road.name, { scale: 1, color: "#9c9686", shadow: "#101318", range: 300 });
  }

  // Terreno: manchones de tierra y pasto por cuadrícula visible. Barato y
  // rompe el color plano que se veía como cartulina.
  function drawGroundNoise(bounds) {
    const tile = 72;
    const startX = Math.max(0, Math.floor(bounds.left / tile) * tile);
    const startY = Math.max(0, Math.floor(bounds.top / tile) * tile);
    for (let x = startX; x < bounds.right; x += tile) {
      for (let y = startY; y < bounds.bottom; y += tile) {
        const seed = idSeed(`g${x}-${y}`);
        const roll = seededValue(seed);
        if (roll < 0.2) continue;
        const bx = x + seededValue(seed + 3) * 40;
        const by = y + seededValue(seed + 4) * 40;
        if (roll > 0.86) {
          // Matorral seco.
          ctx.fillStyle = "rgba(78,96,56,.42)";
          ctx.fillRect(px(bx), px(by), px(16 + seededValue(seed + 1) * 20), px(11 + seededValue(seed + 2) * 14));
          ctx.fillStyle = "rgba(52,70,42,.4)";
          ctx.fillRect(px(bx + 4), px(by + 4), 8, 6);
        } else if (roll > 0.68) {
          // Tierra pelona: manchas irregulares, no cajas.
          ctx.fillStyle = "rgba(104,90,66,.3)";
          const w = 20 + seededValue(seed + 1) * 30;
          const h = 12 + seededValue(seed + 2) * 18;
          ctx.fillRect(px(bx), px(by), px(w), px(h));
          ctx.fillRect(px(bx + w * 0.3), px(by - 5), px(w * 0.55), 6);
          ctx.fillRect(px(bx - 6), px(by + h * 0.35), 7, px(h * 0.5));
        } else if (roll > 0.46) {
          ctx.fillStyle = "rgba(0,0,0,.1)";
          ctx.fillRect(px(bx), px(by), px(14 + seededValue(seed + 1) * 22), px(9 + seededValue(seed + 2) * 13));
        } else {
          // Grieta.
          ctx.fillStyle = "rgba(0,0,0,.2)";
          const long = 14 + seededValue(seed + 5) * 30;
          if (seededValue(seed + 6) > 0.5) ctx.fillRect(px(bx), px(by), px(long), 2);
          else ctx.fillRect(px(bx), px(by), 2, px(long));
        }
      }
    }
  }

  function drawCityGround() {
    ctx.fillStyle = palette.dirt;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    for (const district of districts) {
      ctx.fillStyle = district.tint;
      ctx.fillRect(district.x, district.y, district.w, district.h);
    }
    drawGroundNoise(viewportBounds(120));

    // Cerro y campo de Agronomía.
    ctx.fillStyle = "#5d6b4c";
    ctx.fillRect(5200, 3450, 1200, 750);
    ctx.fillStyle = "rgba(40,56,36,.4)";
    for (let x = 5200; x < 6400; x += 74) ctx.fillRect(px(x), 3450, 30, 750);

    // La Campana: parque con borde marcado en vez de una mancha suave.
    ctx.fillStyle = palette.parkDark;
    ctx.beginPath();
    ctx.moveTo(2680, 120);
    ctx.bezierCurveTo(3050, 20, 3790, 100, 4020, 410);
    ctx.bezierCurveTo(4180, 720, 3960, 1250, 3570, 1490);
    ctx.bezierCurveTo(3240, 1630, 2820, 1430, 2680, 1110);
    ctx.bezierCurveTo(2530, 790, 2580, 390, 2680, 120);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = palette.park;
    ctx.fillRect(2500, 0, 1700, 1560);
    ctx.fillStyle = "rgba(24,44,30,.42)";
    for (let y = 60; y < 1520; y += 58) ctx.fillRect(2500, px(y), 1700, 20);
    ctx.restore();

    // Río con orilla y brillo, no una línea celeste.
    const river = { points: riverTrace, width: 54 };
    strokePath(river, 66, "#4d5a46");
    strokePath(river, 52, palette.water);
    strokePath(river, 22, palette.waterLight);
    strokePath(river, 8, "rgba(226,252,255,.4)");

    // Banqueta perimetral de cada manzana, con guarnición y losetas.
    const bounds = viewportBounds(160);
    for (const block of blockRects) {
      if (block.x + block.w < bounds.left || block.x > bounds.right
        || block.y + block.h < bounds.top || block.y > bounds.bottom) continue;
      const pad = 16;
      ctx.fillStyle = "#8f8878";
      ctx.fillRect(px(block.x - pad), px(block.y - pad), px(block.w + pad * 2), px(block.h + pad * 2));
      ctx.fillStyle = "#a39b88";
      ctx.fillRect(px(block.x - pad), px(block.y - pad), px(block.w + pad * 2), 4);
      ctx.fillStyle = "#7a7466";
      ctx.fillRect(px(block.x - pad), px(block.y + block.h + pad - 4), px(block.w + pad * 2), 4);
      // Losetas.
      ctx.fillStyle = "rgba(90,84,72,.4)";
      for (let x = block.x - pad; x < block.x + block.w + pad; x += 26) ctx.fillRect(px(x), px(block.y - pad), 1, px(block.h + pad * 2));
      for (let y = block.y - pad; y < block.y + block.h + pad; y += 26) ctx.fillRect(px(block.x - pad), px(y), px(block.w + pad * 2), 1);
    }

    for (const lot of parkingLots) drawParkingLot(lot);
    for (const road of residentialRoads) drawRoad(road, true);
    for (const road of roads) drawRoad(road, false);
    drawRoadIntersections();

    for (const road of roads) {
      const midpoint = pathPosition(road, 0.52);
      if (visiblePoint(midpoint, 220)) drawRoadLabel(road);
    }
  }

  function idSeed(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    return Math.abs(hash) + 1;
  }

  // Tinacos, antenas y aire acondicionado. Es lo que hace que una azotea
  // mexicana se lea como azotea y no como un rectángulo.
  function drawRoofEquipment(building) {
    const seed = building.detailSeed || idSeed(building.id || "edificio");
    if (building.w > 105 && building.h > 78) {
      const cx = building.x + building.w * (0.24 + seededValue(seed + 41) * 0.4);
      const cy = building.y + building.h * (0.3 + seededValue(seed + 42) * 0.36);
      ctx.fillStyle = "rgba(6,8,12,.35)";
      ctx.fillRect(px(cx + 3), px(cy + 3), 26, 19);
      bevelRect(cx, cy, 26, 19, "#6b706e", "#8b918e", "#414644", 2);
      ctx.fillStyle = "#2f3432";
      ctx.fillRect(px(cx + 4), px(cy + 4), 18, 11);
      ctx.fillStyle = "#9aa09c";
      ctx.fillRect(px(cx + 11), px(cy + 4), 3, 11);
    }
    if (building.w > 82 && seededValue(seed + 44) > 0.36) {
      const tx = building.x + building.w - 32;
      const ty = building.y + 16;
      ctx.fillStyle = "rgba(6,8,12,.35)";
      ctx.fillRect(px(tx + 3), px(ty + 3), 20, 20);
      // Tinaco negro con tapa.
      bevelRect(tx, ty, 20, 20, "#23272c", "#3a4046", "#14171a", 2);
      ctx.fillStyle = "#4d5359";
      ctx.fillRect(px(tx + 5), px(ty + 5), 10, 10);
    }
    if (seededValue(seed + 46) > 0.62 && building.w > 70) {
      // Antena.
      const ax = building.x + 14;
      const ay = building.y + building.h - 26;
      ctx.fillStyle = "#1c2024";
      ctx.fillRect(px(ax), px(ay), 2, 20);
      ctx.fillRect(px(ax - 6), px(ay), 14, 2);
      ctx.fillRect(px(ax - 4), px(ay + 5), 10, 2);
    }
    if (building.w > 120 && building.h > 90 && seededValue(seed + 48) > 0.45) {
      // Caja de escalera: el cubo que sube a la azotea.
      const sx = building.x + building.w * 0.62;
      const sy = building.y + building.h * 0.58;
      ctx.fillStyle = "rgba(6,8,12,.34)";
      ctx.fillRect(px(sx + 3), px(sy + 3), 30, 26);
      const tone = shade(building.roof, -22);
      bevelRect(sx, sy, 30, 26, tone, shade(tone, 26), shade(tone, -26), 2);
      ctx.fillStyle = "#1b2026";
      ctx.fillRect(px(sx + 9), px(sy + 16), 12, 10);
    }
    if (building.w > 90 && seededValue(seed + 50) > 0.6) {
      // Tendedero con ropa.
      const lx = building.x + building.w * 0.2;
      const ly = building.y + building.h * 0.72;
      ctx.fillStyle = "#4a4238";
      ctx.fillRect(px(lx), px(ly), px(building.w * 0.45), 1);
      const colors = ["#d8d2c2", "#c8433f", "#3f6fa8", "#c9973c"];
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = colors[(Math.floor(seededValue(seed + 51 + i) * 4)) % 4];
        ctx.fillRect(px(lx + 8 + i * (building.w * 0.11)), px(ly), 7, 9);
      }
    }
    if (seededValue(seed + 54) > 0.72 && building.w > 100) {
      // Domo de lámina.
      const dx = building.x + building.w * 0.36;
      const dy = building.y + building.h * 0.3;
      ctx.fillStyle = "rgba(210,226,232,.5)";
      ctx.fillRect(px(dx), px(dy), 22, 16);
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.fillRect(px(dx), px(dy), 22, 4);
      outlineRect(dx, dy, 22, 16, "#5a6166", 1);
    }
  }

  // Rejilla de ventanas. De noche se prenden unas sí y otras no: es el detalle
  // que hace que la ciudad se sienta habitada.
  function drawWindows(building, wallTop, cols, rows, tone) {
    const marginX = 10;
    const marginY = 8;
    const usableW = building.w - marginX * 2;
    const usableH = building.h - wallTop - marginY;
    if (usableW < 18 || usableH < 12) return;
    const stepX = usableW / cols;
    const stepY = usableH / rows;
    const winW = Math.max(4, Math.min(11, stepX - 7));
    const winH = Math.max(4, Math.min(9, stepY - 6));
    const night = isNight();
    const seed = building.detailSeed || idSeed(building.id || "w");
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const wx = building.x + marginX + c * stepX + (stepX - winW) / 2;
        const wy = building.y + wallTop + r * stepY + (stepY - winH) / 2;
        const lit = night && seededValue(seed + c * 13 + r * 7) > 0.52;
        ctx.fillStyle = lit ? palette.night : tone;
        ctx.fillRect(px(wx), px(wy), px(winW), px(winH));
        ctx.fillStyle = lit ? "rgba(255,240,180,.55)" : "rgba(255,255,255,.12)";
        ctx.fillRect(px(wx), px(wy), px(winW), 1);
      }
    }
  }

  function shade(hex, amount) {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
    const num = parseInt(full, 16);
    const r = clamp(((num >> 16) & 255) + amount, 0, 255);
    const g = clamp(((num >> 8) & 255) + amount, 0, 255);
    const b = clamp((num & 255) + amount, 0, 255);
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }

  function drawUrbanBuilding(building) {
    if (!visibleRect(building, 70)) return;
    const lot = building.lot;
    ctx.save();
    // Predio: patio, pasto y cochera.
    const lotTone = building.use === "house" ? "#7b7461" : building.use === "shop" ? "#6e6a60" : "#5f635f";
    ctx.fillStyle = lotTone;
    ctx.fillRect(px(lot.x), px(lot.y), px(lot.w), px(lot.h));
    ctx.fillStyle = "rgba(0,0,0,.14)";
    ctx.fillRect(px(lot.x), px(lot.y + lot.h - 4), px(lot.w), 4);
    if (building.use === "house") {
      ctx.fillStyle = "#3c5f3f";
      ctx.fillRect(px(lot.x + 5), px(lot.y + 5), px(Math.max(12, building.x - lot.x - 8)), px(lot.h - 10));
      ctx.fillStyle = "#4a4a44";
      ctx.fillRect(px(building.x + building.w * 0.58), px(building.y + building.h), 32, px(lot.y + lot.h - building.y - building.h));
    }
    outlineRect(lot.x, lot.y, lot.w, lot.h, "rgba(30,33,33,.5)", 1);

    const floors = building.floors || 1;
    const lift = 4 + floors * 3;
    castShadow(building.x, building.y, building.w, building.h, lift);

    const wall = building.roof;
    bevelRect(building.x, building.y, building.w, building.h, wall, shade(wall, 26), shade(wall, -34), 3);

    // Techo hundido: el borde superior más claro simula el pretil.
    const wallTop = Math.min(26, 12 + floors * 4);
    ctx.fillStyle = shade(wall, -16);
    ctx.fillRect(px(building.x + 4), px(building.y + wallTop), px(building.w - 8), px(building.h - wallTop - 4));
    ctx.fillStyle = shade(wall, 12);
    ctx.fillRect(px(building.x + 4), px(building.y + wallTop), px(building.w - 8), 2);

    if (building.use === "warehouse" || building.use === "workshop") {
      // Lámina acanalada.
      ctx.fillStyle = "rgba(30,32,34,.24)";
      for (let x = building.x + 10; x < building.x + building.w - 6; x += 12) ctx.fillRect(px(x), px(building.y + wallTop + 2), 4, px(building.h - wallTop - 8));
      ctx.fillStyle = "#2c2f32";
      ctx.fillRect(px(building.x + building.w * 0.28), px(building.y + building.h - 14), px(building.w * 0.44), 14);
      ctx.fillStyle = "#43474a";
      ctx.fillRect(px(building.x + building.w * 0.28), px(building.y + building.h - 14), px(building.w * 0.44), 3);
    } else {
      const cols = clamp(Math.floor(building.w / 26), 2, 6);
      const rows = clamp(Math.floor((building.h - wallTop) / 24), 1, 4);
      drawWindows(building, wallTop + 4, cols, rows, "#2b333c");
    }

    if (building.use === "shop") {
      // Toldo de color y puerta.
      ctx.fillStyle = building.accent;
      ctx.fillRect(px(building.x), px(building.y + building.h - 16), px(building.w), 16);
      ctx.fillStyle = "rgba(0,0,0,.28)";
      for (let x = building.x; x < building.x + building.w; x += 16) ctx.fillRect(px(x + 8), px(building.y + building.h - 16), 8, 16);
      ctx.fillStyle = "#15181d";
      ctx.fillRect(px(building.x + building.w / 2 - 14), px(building.y + building.h - 10), 28, 12);
      if (building.sign && camera.zoom > 0.5) queueWorldLabel(building.x + building.w / 2, building.y - 12, building.sign, { scale: 1, color: "#efe7d2", range: 240 });
    } else if (building.use === "apartments") {
      ctx.fillStyle = building.accent;
      ctx.fillRect(px(building.x + 9), px(building.y + 6), 16, 6);
      ctx.fillRect(px(building.x + 31), px(building.y + 6), 16, 6);
    }
    drawFacade(building);
    drawRoofEquipment(building);
    outlineRect(building.x, building.y, building.w, building.h, palette.outline, 2);
    ctx.restore();
  }

  // Frente de la casa: puerta, marco, balcón y macetas. Es lo que hace que un
  // bloque de color se lea como una casa donde vive alguien.
  function drawFacade(building) {
    const seed = building.detailSeed || idSeed(building.id || "f");
    const w = building.w;
    const h = building.h;
    if (w < 46 || h < 40) return;
    const baseY = building.y + h - 4;

    // Puerta al frente, del lado de la calle.
    const doorW = clamp(Math.round(w * 0.2), 12, 26);
    const doorX = building.x + w * (0.22 + seededValue(seed + 60) * 0.5);
    ctx.fillStyle = "#3b2d24";
    ctx.fillRect(px(doorX), px(baseY - 12), doorW, 14);
    ctx.fillStyle = shade(building.roof, -44);
    ctx.fillRect(px(doorX - 2), px(baseY - 14), doorW + 4, 3);
    ctx.fillStyle = "#d8c98f";
    ctx.fillRect(px(doorX + doorW - 5), px(baseY - 7), 2, 2);

    // Toldo o marquesina de color.
    if (seededValue(seed + 62) > 0.45) {
      const awning = ["#c8433f", "#3f8a86", "#c9973c", "#5b7f4a"][Math.floor(seededValue(seed + 63) * 4)];
      ctx.fillStyle = awning;
      ctx.fillRect(px(doorX - 6), px(baseY - 20), doorW + 12, 7);
      ctx.fillStyle = "rgba(255,255,255,.45)";
      for (let x = doorX - 6; x < doorX + doorW + 6; x += 8) ctx.fillRect(px(x), px(baseY - 20), 4, 7);
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.fillRect(px(doorX - 6), px(baseY - 13), doorW + 12, 2);
    }

    // Barandal de balcón en las de dos pisos.
    if ((building.floors || 1) > 1 && w > 70) {
      const by = building.y + Math.round(h * 0.42);
      ctx.fillStyle = shade(building.roof, -34);
      ctx.fillRect(px(building.x + 8), px(by), px(w - 16), 3);
      ctx.fillStyle = shade(building.roof, -22);
      for (let x = building.x + 10; x < building.x + w - 10; x += 7) ctx.fillRect(px(x), px(by - 5), 2, 6);
    }

    // Macetas junto a la puerta.
    if (seededValue(seed + 65) > 0.5) {
      for (const side of [-1, 1]) {
        const mx = doorX + (side < 0 ? -10 : doorW + 4);
        if (mx < building.x + 3 || mx > building.x + w - 8) continue;
        ctx.fillStyle = "#8a5a3e";
        ctx.fillRect(px(mx), px(baseY - 7), 6, 7);
        ctx.fillStyle = "#4f8a52";
        ctx.fillRect(px(mx - 1), px(baseY - 12), 8, 6);
      }
    }
  }

  function drawBusStop(stop) {
    if (!visiblePoint(stop, 80)) return;
    ctx.save();
    ctx.translate(px(stop.x), px(stop.y));
    ctx.rotate(stop.angle);
    ctx.fillStyle = "rgba(6,8,12,.4)";
    ctx.fillRect(-30, -9, 68, 24);
    bevelRect(-34, -14, 68, 21, "#8d9a9c", "#b3bfc0", "#5d686a", 2);
    ctx.fillStyle = "#3f7288";
    ctx.fillRect(-27, -10, 54, 12);
    ctx.fillStyle = "rgba(190,232,240,.4)";
    ctx.fillRect(-27, -10, 54, 4);
    ctx.fillStyle = palette.acid;
    ctx.fillRect(26, -22, 6, 26);
    ctx.fillStyle = "#15181d";
    ctx.fillRect(26, -22, 6, 3);
    ctx.restore();
    queueWorldLabel(stop.x, stop.y - 24, stop.label, { scale: 1, color: "#1a1d22", plate: palette.acid, range: 220 });
  }

  function drawStreetLights() {
    for (const light of streetLights) {
      if (!visiblePoint(light, 60)) continue;
      ctx.fillStyle = "rgba(6,8,12,.4)";
      ctx.fillRect(px(light.x + 2), px(light.y + 3), 8, 8);
      ctx.fillStyle = "#20252a";
      ctx.fillRect(px(light.x - 4), px(light.y - 4), 8, 9);
      ctx.fillStyle = isNight() ? "#ffe9a4" : "#9fa398";
      ctx.fillRect(px(light.x - 6), px(light.y - 6), 6, 6);
      if (isNight()) {
        ctx.fillStyle = "rgba(255,220,140,.5)";
        ctx.fillRect(px(light.x - 7), px(light.y - 7), 2, 2);
      }
    }
  }

  function drawStreetLightGlows() {
    if (!isNight()) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const light of streetLights) {
      if (!visiblePoint(light, 110)) continue;
      // Halo en escalones, no degradado: se ve encendido y sigue siendo pixel.
      ctx.fillStyle = "rgba(255,214,120,.07)";
      ctx.fillRect(px(light.x - 46), px(light.y - 46), 92, 92);
      ctx.fillStyle = "rgba(255,222,140,.09)";
      ctx.fillRect(px(light.x - 28), px(light.y - 28), 56, 56);
      ctx.fillStyle = "rgba(255,236,180,.12)";
      ctx.fillRect(px(light.x - 14), px(light.y - 14), 28, 28);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Mobiliario urbano. Sin esto las banquetas son una franja gris vacía y el
  // mapa se siente maqueta en vez de ciudad.
  // ---------------------------------------------------------------------------
  const streetProps = (() => {
    const list = [];
    const kinds = ["puesto", "bote", "carro", "tope", "barda", "tienda", "banca", "poste", "palmera", "palmera", "jardinera"];
    for (const road of roads) {
      const steps = Math.max(6, road.points.length * 5);
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        const seed = idSeed(`${road.name}-prop-${i}`);
        if (seededValue(seed) > 0.46) continue;
        const side = seededValue(seed + 1) > 0.5 ? 1 : -1;
        const kind = kinds[Math.floor(seededValue(seed + 2) * kinds.length)];
        const position = pathPosition(road, t);
        const offset = kind === "tope" ? 0 : road.width / 2 + (kind === "carro" ? 6 : 16);
        const nx = Math.cos(position.angle + Math.PI / 2) * offset * side;
        const ny = Math.sin(position.angle + Math.PI / 2) * offset * side;
        const x = position.x + nx;
        const y = position.y + ny;
        if (x < 40 || y < 40 || x > WORLD.width - 40 || y > WORLD.height - 40) continue;
        // Nada de puestos encima de una casa ni carros estacionados en la azotea.
        if (kind !== "tope") {
          const box = { x: x - 24, y: y - 24, w: 48, h: 48 };
          if (buildings.some((b) => rectanglesOverlap(box, b, 10))) continue;
          if (urbanBuildings.some((b) => rectanglesOverlap(box, b.lot, 6))) continue;
          if (parkingLots.some((lot) => rectanglesOverlap(box, lot, 0))) continue;
          if (kind !== "carro" && pointOnRoad(x, y, 6)) continue;
        }
        list.push({ kind, x, y, angle: position.angle, seed, roadWidth: road.width });
      }
    }
    return list;
  })();

  function drawProp(prop) {
    ctx.save();
    ctx.translate(px(prop.x), px(prop.y));
    ctx.rotate(prop.angle);
    const s = prop.seed;
    switch (prop.kind) {
      case "puesto": {
        // Puesto de tacos con lona de rayas.
        ctx.fillStyle = "rgba(6,8,12,.4)";
        ctx.fillRect(-16, -10, 38, 26);
        bevelRect(-20, -14, 38, 26, "#c8c2ac", "#e6e0c8", "#8a8574", 2);
        const lona = ["#c8433f", "#2f7f86", "#c9973c"][Math.floor(seededValue(s + 4) * 3)];
        ctx.fillStyle = lona;
        ctx.fillRect(-20, -14, 38, 8);
        ctx.fillStyle = "rgba(255,255,255,.55)";
        for (let x = -20; x < 18; x += 10) ctx.fillRect(px(x), -14, 5, 8);
        ctx.fillStyle = "#3a3128";
        ctx.fillRect(-14, -2, 26, 7);
        outlineRect(-20, -14, 38, 26, palette.outline, 2);
        break;
      }
      case "bote": {
        ctx.fillStyle = "rgba(6,8,12,.4)";
        ctx.fillRect(-6, -5, 15, 15);
        bevelRect(-8, -8, 15, 15, "#3f5b46", "#5b7a60", "#25382b", 2);
        ctx.fillStyle = "#1c2a20";
        ctx.fillRect(-6, -6, 11, 4);
        break;
      }
      case "carro": {
        // Carro estacionado pegado a la banqueta.
        const tone = ["#7a3f3f", "#3f5a7a", "#6d6a3f", "#8a8378", "#4a5a4a", "#7a5a3f"][Math.floor(seededValue(s + 6) * 6)];
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = "rgba(6,8,12,.4)";
        ctx.fillRect(-12, -25, 28, 54);
        ctx.fillStyle = "#101318";
        ctx.fillRect(-17, -18, 5, 15);
        ctx.fillRect(13, -18, 5, 15);
        ctx.fillRect(-17, 6, 5, 15);
        ctx.fillRect(13, 6, 5, 15);
        bevelRect(-15, -28, 30, 56, tone, shade(tone, 30), shade(tone, -34), 2);
        ctx.fillStyle = "#131c22";
        ctx.fillRect(-11, -16, 22, 13);
        ctx.fillStyle = "#3f6b79";
        ctx.fillRect(-10, -15, 20, 7);
        ctx.fillStyle = "#131c22";
        ctx.fillRect(-11, 8, 22, 10);
        outlineRect(-15, -28, 30, 56, palette.outline, 2);
        break;
      }
      case "tope": {
        // Tope pintado. Muy de aquí.
        const w = prop.roadWidth * 0.9;
        ctx.fillStyle = "#20252b";
        ctx.fillRect(px(-w / 2), -7, px(w), 14);
        for (let x = -w / 2; x < w / 2; x += 16) {
          ctx.fillStyle = Math.floor((x + w) / 16) % 2 ? "#d8cf9a" : "#3a3f46";
          ctx.fillRect(px(x), -6, 16, 12);
        }
        ctx.fillStyle = "rgba(255,255,255,.18)";
        ctx.fillRect(px(-w / 2), -7, px(w), 2);
        break;
      }
      case "barda": {
        // Barda de block con grafiti.
        const w = 46 + seededValue(s + 8) * 40;
        ctx.fillStyle = "rgba(6,8,12,.38)";
        ctx.fillRect(px(-w / 2 + 3), -5, px(w), 14);
        bevelRect(-w / 2, -8, w, 14, "#9a9182", "#b6ad9b", "#736c60", 2);
        ctx.fillStyle = "rgba(0,0,0,.18)";
        for (let x = -w / 2; x < w / 2; x += 13) ctx.fillRect(px(x), -8, 1, 14);
        if (seededValue(s + 9) > 0.6) {
          ctx.fillStyle = ["#ff2f91", "#2bd9d5", "#e7ff1f"][Math.floor(seededValue(s + 10) * 3)];
          ctx.fillRect(px(-w / 2 + 6), -4, px(w * 0.5), 4);
        }
        break;
      }
      case "tienda": {
        // Tiendita de la esquina con refrigerador afuera.
        ctx.fillStyle = "rgba(6,8,12,.4)";
        ctx.fillRect(-14, -10, 34, 26);
        bevelRect(-18, -14, 34, 26, "#b7ae98", "#d6ccb2", "#7f7869", 2);
        ctx.fillStyle = "#c8433f";
        ctx.fillRect(-18, -14, 34, 7);
        ctx.fillStyle = "#e8e3d2";
        ctx.fillRect(-14, -5, 12, 14);
        ctx.fillStyle = "#2f7f86";
        ctx.fillRect(2, -5, 11, 14);
        outlineRect(-18, -14, 34, 26, palette.outline, 2);
        break;
      }
      case "palmera": {
        // Palmera vista desde arriba: tronco al centro y hojas en aspa.
        ctx.fillStyle = "rgba(6,8,12,.34)";
        ctx.fillRect(-14, -12, 34, 34);
        const frond = ["#3f7a44", "#4d8a4f", "#356b3c"][Math.floor(seededValue(s + 12) * 3)];
        ctx.fillStyle = frond;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * TAU + seededValue(s + 13);
          ctx.save();
          ctx.rotate(a);
          ctx.fillRect(4, -3, 16, 6);
          ctx.fillRect(16, -2, 6, 4);
          ctx.restore();
        }
        ctx.fillStyle = shade(frond, 26);
        for (let i = 0; i < 3; i += 1) {
          const a = (i / 3) * TAU + 0.6;
          ctx.save();
          ctx.rotate(a);
          ctx.fillRect(5, -2, 11, 4);
          ctx.restore();
        }
        ctx.fillStyle = "#6b5133";
        ctx.fillRect(-4, -4, 9, 9);
        ctx.fillStyle = "#8a6a44";
        ctx.fillRect(-4, -4, 9, 3);
        break;
      }
      case "jardinera": {
        // Jardinera de concreto con arbustos.
        const w = 34 + seededValue(s + 14) * 26;
        ctx.fillStyle = "rgba(6,8,12,.34)";
        ctx.fillRect(px(-w / 2 + 3), -8, px(w), 22);
        bevelRect(-w / 2, -11, w, 22, "#a8a08c", "#c2baa4", "#7d7768", 2);
        ctx.fillStyle = "#4a7a4d";
        for (let x = -w / 2 + 4; x < w / 2 - 6; x += 11) ctx.fillRect(px(x), -7, 9, 14);
        ctx.fillStyle = "#5f9460";
        for (let x = -w / 2 + 5; x < w / 2 - 8; x += 11) ctx.fillRect(px(x), -7, 5, 6);
        break;
      }
      case "banca": {
        ctx.fillStyle = "rgba(6,8,12,.35)";
        ctx.fillRect(-13, -3, 30, 11);
        bevelRect(-16, -6, 30, 11, "#6b4f34", "#8a6742", "#3f2e1f", 2);
        break;
      }
      default: {
        // Poste de luz con cables.
        ctx.fillStyle = "rgba(6,8,12,.4)";
        ctx.fillRect(-2, -2, 8, 8);
        ctx.fillStyle = "#3a3229";
        ctx.fillRect(-4, -4, 8, 9);
        ctx.fillStyle = "#524638";
        ctx.fillRect(-4, -4, 8, 3);
        break;
      }
    }
    ctx.restore();
  }

  function drawStreetProps() {
    for (const prop of streetProps) {
      if (!visiblePoint(prop, 90)) continue;
      drawProp(prop);
    }
  }

  function drawBuilding(building) {
    ctx.save();
    if (building.garden) {
      castShadow(building.x, building.y, building.w, building.h, 10);
      ctx.fillStyle = palette.parkDark;
      ctx.fillRect(px(building.x), px(building.y), px(building.w), px(building.h));
      ctx.fillStyle = palette.park;
      ctx.fillRect(px(building.x + 4), px(building.y + 4), px(building.w - 8), px(building.h - 8));
      // Andadores en cruz y jardineras.
      ctx.fillStyle = "#a89c80";
      ctx.fillRect(px(building.x), px(building.y + building.h / 2 - 16), px(building.w), 32);
      ctx.fillRect(px(building.x + building.w / 2 - 16), px(building.y), 32, px(building.h));
      ctx.fillStyle = "rgba(0,0,0,.16)";
      for (let x = building.x; x < building.x + building.w; x += 22) ctx.fillRect(px(x), px(building.y + building.h / 2 - 16), 2, 32);
      // Bancas.
      for (let index = 0; index < 6; index += 1) {
        const bx = building.x + 38 + (index % 3) * 125;
        const by = building.y + 42 + Math.floor(index / 3) * 130;
        ctx.fillStyle = "rgba(6,8,12,.35)";
        ctx.fillRect(px(bx + 3), px(by + 3), 52, 12);
        bevelRect(bx, by, 52, 12, "#6b4f34", "#8a6742", "#3f2e1f", 2);
      }
      // Kiosco.
      const kx = building.x + building.w / 2;
      const ky = building.y + building.h / 2;
      ctx.fillStyle = "rgba(6,8,12,.4)";
      ctx.fillRect(px(kx - 24), px(ky - 20), 52, 48);
      bevelRect(kx - 28, ky - 24, 52, 48, "#b0475f", "#d4667e", "#6d2637", 3);
      ctx.fillStyle = palette.cream;
      ctx.fillRect(px(kx - 20), px(ky - 16), 36, 32);
      outlineRect(building.x, building.y, building.w, building.h, "#1b2b21", 3);
      drawBuildingLabel(building);
      ctx.restore();
      return;
    }
    if (building.yard) {
      castShadow(building.x, building.y, building.w, building.h, 8);
      bevelRect(building.x, building.y, building.w, building.h, building.roof, shade(building.roof, 22), shade(building.roof, -30), 3);
      // Carros amontonados en el corralón / lote.
      const seed = idSeed(building.id || "yard");
      for (let i = 0; i < 10; i += 1) {
        const cx = building.x + 26 + seededValue(seed + i) * (building.w - 70);
        const cy = building.y + 24 + seededValue(seed + i + 30) * (building.h - 60);
        const tone = ["#7a3f3f", "#3f5a7a", "#6d6a3f", "#5a5a5f"][Math.floor(seededValue(seed + i + 60) * 4)];
        ctx.fillStyle = "rgba(6,8,12,.35)";
        ctx.fillRect(px(cx + 2), px(cy + 3), 26, 44);
        bevelRect(cx, cy, 26, 44, tone, shade(tone, 24), shade(tone, -28), 2);
        ctx.fillStyle = "#1d252b";
        ctx.fillRect(px(cx + 4), px(cy + 12), 18, 14);
      }
      // Malla ciclónica.
      ctx.strokeStyle = building.accent;
      ctx.lineWidth = 4;
      ctx.setLineDash([16, 11]);
      ctx.strokeRect(px(building.x), px(building.y), px(building.w), px(building.h));
      ctx.setLineDash([]);
      ctx.fillStyle = palette.ink;
      ctx.fillRect(px(building.x + building.w / 2 - 50), px(building.y + building.h - 8), 100, 16);
      drawBuildingLabel(building);
      ctx.restore();
      return;
    }
    if (building.track) {
      ctx.fillStyle = "#1b2026";
      ctx.fillRect(px(building.x), px(building.y), px(building.w), px(building.h));
      ctx.fillStyle = "#252b32";
      ctx.fillRect(px(building.x + 6), px(building.y + 6), px(building.w - 12), px(building.h - 12));
      // Línea de salida a cuadros.
      for (let x = building.x + 20; x < building.x + building.w - 20; x += 18) {
        for (let r = 0; r < 2; r += 1) {
          ctx.fillStyle = (Math.floor(x / 18) + r) % 2 ? "#e6e2d4" : "#1b1f24";
          ctx.fillRect(px(x), px(building.y + 22 + r * 9), 18, 9);
        }
      }
      ctx.fillStyle = "rgba(231,255,31,.5)";
      for (let y = building.y + 62; y < building.y + building.h - 14; y += 46) {
        for (let x = building.x + 26; x < building.x + building.w - 26; x += 52) ctx.fillRect(px(x), px(y), 26, 3);
      }
      outlineRect(building.x, building.y, building.w, building.h, "#0c0e11", 3);
      drawBuildingLabel(building);
      ctx.restore();
      return;
    }

    const floors = building.floors || (building.special ? 1 : 2);
    castShadow(building.x, building.y, building.w, building.h, 9 + floors * 2);
    const wall = building.roof;
    bevelRect(building.x, building.y, building.w, building.h, wall, shade(wall, 28), shade(wall, -36), 3);

    // Pretil y azotea hundida.
    const wallTop = 18;
    ctx.fillStyle = shade(wall, -18);
    ctx.fillRect(px(building.x + 5), px(building.y + wallTop), px(building.w - 10), px(building.h - wallTop - 5));
    ctx.fillStyle = shade(wall, 14);
    ctx.fillRect(px(building.x + 5), px(building.y + wallTop), px(building.w - 10), 2);

    // Franja del color del negocio arriba, como marquesina.
    ctx.fillStyle = building.accent;
    ctx.fillRect(px(building.x), px(building.y), px(building.w), 12);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(px(building.x), px(building.y), px(building.w), 2);

    const seed = building.detailSeed || idSeed(building.id || "b");
    const style = Math.floor(seededValue(seed + 70) * 3);
    if (style === 0) {
      const cols = clamp(Math.floor(building.w / 34), 2, 8);
      const rows = clamp(Math.floor((building.h - wallTop) / 30), 1, 4);
      drawWindows(building, wallTop + 6, cols, rows, "#28323d");
    } else if (style === 1) {
      // Nave con lámina acanalada y tragaluces.
      ctx.fillStyle = "rgba(28,32,36,.22)";
      for (let x = building.x + 12; x < building.x + building.w - 8; x += 16) {
        ctx.fillRect(px(x), px(building.y + wallTop + 4), 5, px(building.h - wallTop - 12));
      }
      ctx.fillStyle = "rgba(214,232,238,.4)";
      for (let x = building.x + 26; x < building.x + building.w - 26; x += 62) {
        ctx.fillRect(px(x), px(building.y + building.h * 0.42), 34, 12);
      }
    } else {
      // Losa con bloques de concreto y una hilera de ventanas al frente.
      ctx.fillStyle = "rgba(0,0,0,.12)";
      for (let y = building.y + wallTop + 8; y < building.y + building.h - 10; y += 26) {
        ctx.fillRect(px(building.x + 8), px(y), px(building.w - 16), 2);
      }
      const cols = clamp(Math.floor(building.w / 30), 2, 8);
      drawWindows(building, building.h - 30, cols, 1, "#28323d");
    }

    // Entrada marcada, para que se vea por dónde se entra.
    if (building.interactable || building.special) {
      const doorW = building.special ? 34 : 42;
      ctx.fillStyle = "#15181d";
      ctx.fillRect(px(building.x + building.w / 2 - doorW / 2), px(building.y + building.h - 14), doorW, 16);
      ctx.fillStyle = building.special ? palette.pink : palette.acid;
      ctx.fillRect(px(building.x + building.w / 2 - doorW / 2), px(building.y + building.h - 16), doorW, 3);
    }
    drawRoofEquipment(building);
    outlineRect(building.x, building.y, building.w, building.h, palette.outline, 2);
    if (building.special) {
      // Marca discreta: esquinas rosas en vez de un marco completo.
      ctx.fillStyle = palette.pink;
      const c = 14;
      for (const [ox, oy] of [[0, 0], [building.w - c, 0], [0, building.h - 2], [building.w - c, building.h - 2]]) {
        ctx.fillRect(px(building.x + ox), px(building.y + oy), c, 2);
      }
      for (const [ox, oy] of [[0, 0], [building.w - 2, 0], [0, building.h - c], [building.w - 2, building.h - c]]) {
        ctx.fillRect(px(building.x + ox), px(building.y + oy), 2, c);
      }
    }
    drawBuildingLabel(building);
    ctx.restore();
  }

  function drawBuildingLabel(building) {
    if (!building.label) return;
    queueWorldLabel(building.x + building.w / 2, building.y - 13, building.label, {
      scale: 1,
      color: building.special ? palette.acid : "#e4dcc8",
      shadow: "#0a0c10",
      range: building.special || building.interactable ? 430 : 300,
    });
  }

  function drawTree(tree) {
    const r = tree.r;
    ctx.fillStyle = "rgba(6,8,12,.34)";
    ctx.fillRect(px(tree.x - r + 5), px(tree.y - r + 7), px(r * 2), px(r * 2));
    // Copa en escalones: un círculo suave se ve fuera de lugar en pixel.
    const dark = tree.x > 2400 ? "#1c3a2a" : "#254a31";
    const mid = tree.x > 2400 ? "#2c5740" : "#356b45";
    const lit = "#4d8a55";
    ctx.fillStyle = dark;
    ctx.fillRect(px(tree.x - r), px(tree.y - r * 0.72), px(r * 2), px(r * 1.44));
    ctx.fillRect(px(tree.x - r * 0.72), px(tree.y - r), px(r * 1.44), px(r * 2));
    ctx.fillStyle = mid;
    ctx.fillRect(px(tree.x - r * 0.8), px(tree.y - r * 0.58), px(r * 1.6), px(r * 1.16));
    ctx.fillRect(px(tree.x - r * 0.58), px(tree.y - r * 0.8), px(r * 1.16), px(r * 1.6));
    ctx.fillStyle = lit;
    ctx.fillRect(px(tree.x - r * 0.62), px(tree.y - r * 0.62), px(r * 0.6), px(r * 0.6));
    ctx.fillStyle = "rgba(10,16,12,.3)";
    ctx.fillRect(px(tree.x + r * 0.1), px(tree.y + r * 0.2), px(r * 0.6), px(r * 0.5));
  }

  // ---------------------------------------------------------------------------
  // Personajes. Antes todos eran el mismo rectángulo con distinto color; ahora
  // cada quien trae complexión, peinado, tono de piel y ropa propios.
  // ---------------------------------------------------------------------------
  const SKIN_TONES = ["#c98d63", "#b87c53", "#e0a878", "#a06a45", "#d59a70", "#8e5c3c"];
  const HAIR_TONES = ["#1a1512", "#2b1e16", "#3d2a1c", "#120f0e", "#4a3524", "#6b5136"];
  const SHIRT_TONES = ["#b8443f", "#3f6fa8", "#4f9163", "#c9973c", "#7a4d96", "#c4c0b4", "#2f7f86", "#b5623c", "#5b6470", "#a8384f"];
  const PANTS_TONES = ["#2a3140", "#1f242c", "#3b3227", "#43485a", "#2d3a33"];

  function personLook(person) {
    if (person.look) return person.look;
    const seed = idSeed(`${Math.round(person.homeX ?? person.x)}-${Math.round(person.homeY ?? person.y)}-${person.color || ""}`);
    person.look = {
      skin: SKIN_TONES[Math.floor(seededValue(seed) * SKIN_TONES.length)],
      hair: HAIR_TONES[Math.floor(seededValue(seed + 3) * HAIR_TONES.length)],
      shirt: person.color || SHIRT_TONES[Math.floor(seededValue(seed + 5) * SHIRT_TONES.length)],
      pants: PANTS_TONES[Math.floor(seededValue(seed + 7) * PANTS_TONES.length)],
      build: seededValue(seed + 9) > 0.72 ? 1.16 : seededValue(seed + 9) < 0.24 ? 0.86 : 1,
      longHair: seededValue(seed + 11) > 0.58,
      cap: seededValue(seed + 13) > 0.78,
      backpack: seededValue(seed + 15) > 0.82,
    };
    return person.look;
  }

  // Eve: pelo largo café oscuro, playera gris, su rosa de siempre.
  const EVE_LOOK = { skin: "#c98d63", hair: "#241a14", shirt: "#8b8f95", pants: "#2b3038", build: 0.94, longHair: true, cap: false, backpack: false, accent: palette.pink };
  // Rochi: pelo negro alborotado, playera verde arena con estampado oscuro.
  const ROCHI_LOOK = { skin: "#c08355", hair: "#15110f", shirt: "#b9bb9a", pants: "#33383f", build: 1.14, longHair: false, cap: false, backpack: false, print: "#2b3325" };
  const STIF_LOOK = { skin: "#b87c53", hair: "#2b1e16", shirt: "#d7a82d", pants: "#39332a", build: 1, longHair: false, cap: true, backpack: false };
  const FEDE_LOOK = { skin: "#a06a45", hair: "#1a1512", shirt: "#4e83a8", pants: "#252b33", build: 1.08, longHair: false, cap: false, backpack: false };
  const COP_LOOK = { skin: "#b87c53", hair: "#161311", shirt: "#2c3e63", pants: "#1b2436", build: 1.06, longHair: false, cap: true, capColor: "#1b2436", backpack: false };

  function drawPerson(person, isEve = false, isStif = false, isRochi = false) {
    const angle = person.angle || 0;
    const look = isEve ? EVE_LOOK : isStif ? STIF_LOOK : isRochi ? ROCHI_LOOK : person === state.fede ? FEDE_LOOK : person.onFoot && person.police ? COP_LOOK : personLook(person);
    const moving = person.moving !== false;
    const walking = moving ? Math.round(Math.sin(performance.now() / 115 + person.x) * 2) : 0;
    const b = look.build;

    ctx.save();
    ctx.translate(px(person.x), px(person.y));

    if (person.motorcycle && person.status === "active") {
      ctx.save();
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = "rgba(6,8,12,.4)";
      ctx.fillRect(-9, -32, 20, 66);
      ctx.fillStyle = "#15171b";
      ctx.fillRect(-10, -34, 20, 68);
      bevelRect(-13, -17, 26, 37, "#b8403f", "#d76a63", "#6d2320", 2);
      ctx.restore();
    }

    if (person.status === "dead" || person.status === "knocked") {
      // Tirado boca abajo: cuerpo, cabeza y charco si está muerto.
      ctx.rotate(angle);
      ctx.fillStyle = "rgba(6,8,12,.34)";
      ctx.fillRect(-28, -9, 62, 22);
      if (person.status === "dead") {
        ctx.fillStyle = "rgba(122,26,38,.55)";
        ctx.fillRect(-32, -14, 70, 30);
      }
      bevelRect(-26, -12, 42, 25, look.shirt, shade(look.shirt, 22), shade(look.shirt, -30), 2);
      ctx.fillStyle = look.skin;
      ctx.fillRect(16, -9, 16, 19);
      ctx.fillStyle = look.hair;
      ctx.fillRect(24, -9, 8, 19);
      outlineRect(-26, -12, 42, 25, palette.outline, 2);
      ctx.restore();
      return;
    }

    ctx.rotate(angle + Math.PI / 2);
    // Sombra al suelo.
    ctx.fillStyle = "rgba(6,8,12,.36)";
    ctx.fillRect(px(-11 * b), 8, px(22 * b), 9);

    // Piernas.
    ctx.fillStyle = look.pants;
    ctx.fillRect(px(-9 * b), -6 + walking, px(7 * b), 18);
    ctx.fillRect(px(2 * b), -6 - walking, px(7 * b), 18);
    ctx.fillStyle = "#14171c";
    ctx.fillRect(px(-9 * b), 9 + walking, px(7 * b), 4);
    ctx.fillRect(px(2 * b), 9 - walking, px(7 * b), 4);

    // Pelo largo cae por la espalda: se dibuja antes del torso.
    if (look.longHair) {
      ctx.fillStyle = look.hair;
      ctx.fillRect(px(-13 * b), -26, px(26 * b), 26);
      ctx.fillStyle = shade(look.hair, 16);
      ctx.fillRect(px(-13 * b), -26, 3, 26);
    }

    // Torso.
    const bodyW = 26 * b;
    bevelRect(-bodyW / 2, -20, bodyW, 24, look.shirt, shade(look.shirt, 26), shade(look.shirt, -32), 2);
    if (look.print) {
      ctx.fillStyle = look.print;
      ctx.fillRect(px(-6 * b), -14, px(12 * b), 11);
    }
    if (look.accent) {
      ctx.fillStyle = look.accent;
      ctx.fillRect(px(-bodyW / 2), -20, 4, 24);
    }
    if (look.backpack) {
      ctx.fillStyle = "#3a4450";
      ctx.fillRect(px(-8 * b), -8, px(16 * b), 13);
      ctx.fillStyle = "#4c5866";
      ctx.fillRect(px(-8 * b), -8, px(16 * b), 3);
    }

    // Brazos.
    ctx.fillStyle = look.skin;
    ctx.fillRect(px(-bodyW / 2 - 4), -17, 5, 16);
    ctx.fillRect(px(bodyW / 2 - 1), -17, 5, 16);

    // Cabeza y cara.
    ctx.fillStyle = look.skin;
    ctx.fillRect(px(-9 * b), -30, px(18 * b), 14);
    ctx.fillStyle = shade(look.skin, -30);
    ctx.fillRect(px(-9 * b), -18, px(18 * b), 2);
    // Pelo encima.
    ctx.fillStyle = look.hair;
    ctx.fillRect(px(-10 * b), -34, px(20 * b), 8);
    if (look.longHair) {
      ctx.fillRect(px(-12 * b), -32, 3, 14);
      ctx.fillRect(px(9 * b), -32, 3, 14);
    } else {
      // Mechones desordenados.
      ctx.fillRect(px(-10 * b), -35, px(6 * b), 3);
      ctx.fillRect(px(2 * b), -36, px(6 * b), 4);
    }
    if (look.cap) {
      ctx.fillStyle = look.capColor || "#2f3a49";
      ctx.fillRect(px(-10 * b), -35, px(20 * b), 8);
      ctx.fillStyle = shade(look.capColor || "#2f3a49", -26);
      ctx.fillRect(px(-10 * b), -38, px(20 * b), 4);
    }
    outlineRect(-bodyW / 2, -20, bodyW, 24, palette.outline, 2);

    // Puñetazo / arma en la mano.
    if (isEve && state.player.punch > 0) {
      const cooldown = weapons[state.equippedWeapon]?.cooldown || 0.38;
      const progress = 1 - state.player.punch / cooldown;
      const swing = Math.round(Math.sin(progress * Math.PI) * 18);
      ctx.fillStyle = look.skin;
      ctx.fillRect(10, -18 - swing, 17, 8);
      ctx.fillStyle = palette.outline;
      ctx.fillRect(10, -18 - swing, 17, 2);
    }
    if (isEve && state.player.caguamaVisible > 0) {
      ctx.fillStyle = "#6b4a1c";
      ctx.fillRect(-24, -15, 7, 20);
      ctx.fillStyle = "#d7c767";
      ctx.fillRect(-24, -17, 7, 5);
    }
    ctx.restore();
    if (person.speechTimer > 0 && person.speech) drawSpeech(person.x, person.y - 44, person.speech);
  }

  function drawSpeech(x, y, text) {
    const copy = text.length > 30 ? `${text.slice(0, 28)}…` : text;
    queueWorldLabel(x, y, copy.toUpperCase(), { scale: 1, color: "#f1eddf", plate: "rgba(9,12,16,.88)", range: 0 });
  }


  function modelFor(vehicle, fallback = "sedan") {
    if (vehicle.model && VEHICLE_MODELS[vehicle.model]) return VEHICLE_MODELS[vehicle.model];
    return VEHICLE_MODELS[fallback] || VEHICLE_MODELS.sedan;
  }

  function drawWheels(model, length) {
    ctx.fillStyle = "#0d1014";
    const half = model.w / 2;
    const wheelH = model.wheel;
    for (const along of [-length * 0.31, length * 0.22]) {
      ctx.fillRect(px(-half - 4), px(along), 6, wheelH);
      ctx.fillRect(px(half - 2), px(along), 6, wheelH);
    }
    ctx.fillStyle = "#242a30";
    for (const along of [-length * 0.31, length * 0.22]) {
      ctx.fillRect(px(-half - 4), px(along + 2), 6, 3);
      ctx.fillRect(px(half - 2), px(along + 2), 6, 3);
    }
  }

  function drawVehicle(vehicle, options = {}) {
    const { police = false, color = "#1f513f", small = false } = options;
    const paint = vehicle.destroyed ? "#3b3b3a" : police ? "#e4e6e2" : (vehicle.paint || color);

    if (vehicle.motorcycle) {
      ctx.save();
      ctx.translate(px(vehicle.x), px(vehicle.y));
      ctx.rotate(vehicle.angle || 0);
      ctx.fillStyle = "rgba(6,8,12,.42)";
      ctx.fillRect(-9, -32, 22, 70);
      ctx.fillStyle = "#101318";
      ctx.fillRect(-9, -36, 18, 19);
      ctx.fillRect(-9, 17, 18, 19);
      bevelRect(-12, -20, 24, 42, paint, shade(paint, 30), shade(paint, -34), 2);
      ctx.fillStyle = "#1a2228";
      ctx.fillRect(-8, -12, 16, 14);
      ctx.fillStyle = palette.acid;
      ctx.fillRect(-5, -28, 10, 6);
      outlineRect(-12, -20, 24, 42, palette.outline, 2);
      if (vehicle.destroyed) {
        ctx.fillStyle = "#d3513f";
        ctx.fillRect(-12, -2, 24, 3);
      }
      ctx.restore();
      return;
    }

    const model = modelFor(vehicle, police ? "patrulla" : small ? "sedan" : "troca");
    const width = model.w;
    const length = model.l;
    const half = width / 2;

    ctx.save();
    ctx.translate(px(vehicle.x), px(vehicle.y));
    ctx.rotate(vehicle.angle || 0);

    ctx.fillStyle = "rgba(6,8,12,.42)";
    ctx.fillRect(px(-half + 5), px(-length / 2 + 6), px(width), px(length));

    drawWheels(model, length);

    // Carrocería. El vocho y la combi llevan las esquinas recortadas para que
    // la silueta se reconozca desde arriba.
    bevelRect(-half, -length / 2, width, length, paint, shade(paint, 32), shade(paint, -38), 2);
    if (model.round) {
      ctx.fillStyle = palette.asphalt;
      ctx.fillRect(px(-half), px(-length / 2), 3, 3);
      ctx.fillRect(px(half - 3), px(-length / 2), 3, 3);
      ctx.fillRect(px(-half), px(length / 2 - 3), 3, 3);
      ctx.fillRect(px(half - 3), px(length / 2 - 3), 3, 3);
    }

    // Cofre y cajuela más oscuros que el techo.
    ctx.fillStyle = shade(paint, -16);
    ctx.fillRect(px(-half + 3), px(-length / 2 + 3), px(width - 6), px(length * model.roofAt * 0.55));
    if (!model.bed && !model.box) {
      ctx.fillStyle = shade(paint, -16);
      ctx.fillRect(px(-half + 3), px(length / 2 - length * 0.19), px(width - 6), px(length * 0.15));
    }

    // Cabina.
    const cabinTop = -length / 2 + length * model.roofAt;
    const cabinLen = length * model.cabin;
    ctx.fillStyle = "#121a20";
    ctx.fillRect(px(-half + 4), px(cabinTop), px(width - 8), px(cabinLen));
    ctx.fillStyle = model.tall ? "#5a8a99" : "#3f6b79";
    ctx.fillRect(px(-half + 5), px(cabinTop + 2), px(width - 10), px(cabinLen * 0.42));
    ctx.fillStyle = "rgba(198,238,246,.4)";
    ctx.fillRect(px(-half + 5), px(cabinTop + 2), px(width * 0.34), 3);
    ctx.fillStyle = model.tall ? "#5a8a99" : "#3f6b79";
    ctx.fillRect(px(-half + 5), px(cabinTop + cabinLen * 0.6), px(width - 10), px(cabinLen * 0.3));
    // Techo entre parabrisas y medallón.
    ctx.fillStyle = shade(paint, 18);
    ctx.fillRect(px(-half + 4), px(cabinTop + cabinLen * 0.44), px(width - 8), px(cabinLen * 0.14));

    if (model.bed) {
      // Caja de la pickup con tablones.
      const bedTop = cabinTop + cabinLen + 3;
      const bedLen = length / 2 - bedTop - 3;
      ctx.fillStyle = "#8d7a5c";
      ctx.fillRect(px(-half + 3), px(bedTop), px(width - 6), px(bedLen));
      ctx.fillStyle = "#6e5d43";
      for (let y = bedTop + 2; y < bedTop + bedLen; y += 7) ctx.fillRect(px(-half + 3), px(y), px(width - 6), 2);
      ctx.fillStyle = shade(paint, -26);
      ctx.fillRect(px(-half + 1), px(bedTop - 2), 3, px(bedLen + 4));
      ctx.fillRect(px(half - 4), px(bedTop - 2), 3, px(bedLen + 4));
    }

    if (model.box) {
      // Caja del camión, con puerta trasera y franja.
      const boxTop = cabinTop + cabinLen + 4;
      const boxLen = length / 2 - boxTop - 2;
      bevelRect(-half - 2, boxTop, width + 4, boxLen, "#d6d1c2", "#efeade", "#94907f", 2);
      ctx.fillStyle = vehicle.paint || color;
      ctx.fillRect(px(-half - 2), px(boxTop + boxLen * 0.36), px(width + 4), px(boxLen * 0.2));
      ctx.fillStyle = "#8e8a7c";
      ctx.fillRect(px(-half + 2), px(boxTop + boxLen - 7), px(width - 4), 6);
      outlineRect(-half - 2, boxTop, width + 4, boxLen, palette.outline, 2);
    }

    if (model.taxi) {
      // Cajita de taxi en el techo y franja lateral.
      ctx.fillStyle = "#1b1f24";
      ctx.fillRect(px(-7), px(cabinTop + cabinLen * 0.4), 15, 8);
      ctx.fillStyle = "#f0e27a";
      ctx.fillRect(px(-6), px(cabinTop + cabinLen * 0.4 + 1), 13, 5);
      ctx.fillStyle = "#1b1f24";
      ctx.fillRect(px(-half), px(-length * 0.04), px(width), 5);
    }

    // Faros y calaveras.
    ctx.fillStyle = police ? "#cfe3f2" : "#efdf83";
    ctx.fillRect(px(-half + 3), px(-length / 2 - 1), 8, 5);
    ctx.fillRect(px(half - 11), px(-length / 2 - 1), 8, 5);
    ctx.fillStyle = "#b8353f";
    ctx.fillRect(px(-half + 3), px(length / 2 - 4), 8, 5);
    ctx.fillRect(px(half - 11), px(length / 2 - 4), 8, 5);

    if (police) {
      const flash = Math.floor(performance.now() / 130) % 2;
      ctx.fillStyle = "#1a1d22";
      ctx.fillRect(-15, -5, 30, 9);
      ctx.fillStyle = flash ? "#ff3b48" : "#5a1c22";
      ctx.fillRect(-14, -4, 13, 7);
      ctx.fillStyle = flash ? "#2a4a6e" : "#3f9dff";
      ctx.fillRect(1, -4, 13, 7);
      ctx.fillStyle = "#1e3f6b";
      ctx.fillRect(px(-half), px(-length * 0.05), px(width), 5);
    }

    outlineRect(-half, -length / 2, width, length, palette.outline, 2);

    if (vehicle.destroyed) {
      ctx.fillStyle = "rgba(20,22,26,.6)";
      ctx.fillRect(px(-half), px(-length / 2), px(width), px(length));
      ctx.fillStyle = "#d3513f";
      ctx.fillRect(px(-half + 4), px(-4), px(width - 8), 3);
      ctx.fillRect(px(-3), px(-length / 2 + 6), 4, px(length - 12));
    }
    ctx.restore();
  }

  function calculateGpsRoute(start, goal) {
    const cell = 100;
    const cols = Math.ceil(WORLD.width / cell);
    const rows = Math.ceil(WORLD.height / cell);
    const toCell = (point) => ({ c: clamp(Math.floor(point.x / cell), 0, cols - 1), r: clamp(Math.floor(point.y / cell), 0, rows - 1) });
    const center = (c, r) => ({ x: c * cell + cell / 2, y: r * cell + cell / 2 });
    const startCell = toCell(start);
    const goalCell = toCell(goal);
    const keyFor = (c, r) => `${c},${r}`;
    const open = [{ ...startCell, g: 0, f: 0 }];
    const cameFrom = new Map();
    const scores = new Map([[keyFor(startCell.c, startCell.r), 0]]);
    const closed = new Set();
    const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    let reached = null;
    let iterations = 0;
    while (open.length && iterations < 5000) {
      iterations += 1;
      open.sort((a, b) => a.f - b.f);
      const current = open.shift();
      const currentKey = keyFor(current.c, current.r);
      if (closed.has(currentKey)) continue;
      closed.add(currentKey);
      if (Math.abs(current.c - goalCell.c) <= 1 && Math.abs(current.r - goalCell.r) <= 1) { reached = current; break; }
      for (const [dc, dr] of directions) {
        const c = current.c + dc;
        const r = current.r + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const point = center(c, r);
        if (cityBlocked(point.x, point.y, 22, true)) continue;
        const nextKey = keyFor(c, r);
        if (closed.has(nextKey)) continue;
        const roadCost = pointOnRoad(point.x, point.y, -9) ? 0.42 : 2.15;
        const stepCost = (dc && dr ? 1.414 : 1) * roadCost;
        const g = current.g + stepCost;
        if (g >= (scores.get(nextKey) ?? Infinity)) continue;
        scores.set(nextKey, g);
        cameFrom.set(nextKey, currentKey);
        const h = Math.hypot(c - goalCell.c, r - goalCell.r) * 0.42;
        open.push({ c, r, g, f: g + h });
      }
    }
    if (!reached) return [start, goal];
    const reversed = [];
    let cursor = keyFor(reached.c, reached.r);
    while (cursor) {
      const [c, r] = cursor.split(",").map(Number);
      reversed.push(center(c, r));
      cursor = cameFrom.get(cursor);
    }
    const raw = [start, ...reversed.reverse(), goal];
    return raw.filter((point, index) => {
      if (index === 0 || index === raw.length - 1) return true;
      const previous = raw[index - 1];
      const next = raw[index + 1];
      return Math.abs((point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x)) > 1;
    });
  }

  function gpsRouteFor(target) {
    const focus = getFocus();
    const key = `${target.type}:${Math.round(target.x / 40)}:${Math.round(target.y / 40)}`;
    if (gpsCache.key !== key || distance(focus, { x: gpsCache.fromX, y: gpsCache.fromY }) > 320 || gpsCache.age > 2) {
      gpsCache = { key, fromX: focus.x, fromY: focus.y, path: calculateGpsRoute(focus, target), age: 0 };
    }
    return gpsCache.path;
  }

  function nearestNamedRoad(point) {
    let best = { name: "CALLE LOCAL", distance: Infinity };
    for (const road of roads) {
      for (let index = 0; index < road.points.length - 1; index += 1) {
        const a = road.points[index];
        const b = road.points[index + 1];
        const separation = pointToSegmentDistance(point.x, point.y, a[0], a[1], b[0], b[1]);
        if (separation < best.distance) best = { name: road.name || "CALLE LOCAL", distance: separation };
      }
    }
    return best.name;
  }

  function updateGpsHud() {
    const target = currentTarget();
    const hud = $("#gps-hud");
    if (!target || state.scene !== "city" || target.type === "stif") {
      hud.classList.add("hidden");
      return;
    }
    const focus = getFocus();
    const route = gpsRouteFor(target);
    const guidance = route.find((point) => distance(focus, point) > 180) || target;
    const meters = Math.max(10, Math.round(distance(focus, target) / 10) * 10);
    $("#gps-street").textContent = `SIGUE POR ${nearestNamedRoad(guidance)}`;
    $("#gps-distance").textContent = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km al objetivo` : `${meters} m al objetivo`;
    hud.classList.remove("hidden");
  }

  function drawMissionRoute() {
    const target = currentTarget();
    if (!target || state.scene !== "city" || target.type === "stif" || target.type === "exit") return;
    const path = gpsRouteFor(target);
    ctx.save();
    ctx.strokeStyle = palette.cyan;
    ctx.lineWidth = 7;
    ctx.setLineDash([26, 24]);
    ctx.lineDashOffset = -(performance.now() / 25) % 50;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let index = 1; index < path.length; index += 1) ctx.lineTo(path[index].x, path[index].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawTargetMarker() {
    const target = currentTarget();
    if (!target) return;
    const bob = Math.round(Math.sin(performance.now() / 260) * 6);
    const tone = target.type === "cityclub" ? palette.cyan : palette.acid;
    ctx.save();
    ctx.translate(px(target.x), px(target.y));
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = tone;
    ctx.fillRect(-26, -26, 52, 52);
    ctx.globalAlpha = 1;
    // Flecha apuntando al piso, se lee de inmediato.
    ctx.fillStyle = tone;
    for (let i = 0; i < 9; i += 1) ctx.fillRect(-9 + i, -46 + bob - i, 18 - i * 2, 3);
    ctx.fillRect(-4, -56 + bob, 8, 12);
    ctx.fillStyle = palette.outline;
    ctx.fillRect(-4, -58 + bob, 8, 2);
    ctx.restore();
  }

  function drawTraffic() {
    for (const car of traffic) {
      if (car.stolen || car.hidden) continue;
      const position = Number.isFinite(car.x)
        ? car
        : (() => {
            const initial = pathPosition(roads[car.road], car.t);
            initial.angle += Math.PI / 2;
            return initial;
          })();
      if (!visiblePoint(position, 100)) continue;
      drawVehicle(position, { color: car.color, small: true });
      if (car.braking) {
        ctx.save();
        ctx.translate(position.x, position.y);
        ctx.rotate(position.angle);
        ctx.fillStyle = "#ff4d55";
        ctx.fillRect(-10, 25, 6, 4);
        ctx.fillRect(4, 25, 6, 4);
        ctx.restore();
      }
    }
  }

  function drawRaceCheckpoints() {
    if (!state.race.active) return;
    raceRoute.forEach((point, index) => {
      if (index < state.race.checkpoint) return;
      const pulse = index === state.race.checkpoint ? 1 + Math.sin(performance.now() / 150) * 0.15 : 0.72;
      ctx.save();
      ctx.translate(px(point.x), px(point.y));
      const size = Math.round(54 * pulse);
      ctx.fillStyle = index === state.race.checkpoint ? palette.acid : "rgba(231,255,31,.3)";
      ctx.fillRect(-size, -size, size * 2, 5);
      ctx.fillRect(-size, size - 5, size * 2, 5);
      ctx.fillRect(-size, -size, 5, size * 2);
      ctx.fillRect(size - 5, -size, 5, size * 2);
      ctx.restore();
    });
  }

  function drawPickups() {
    for (const pickup of pickups) {
      if (!visiblePoint(pickup, 70)) continue;
      const bob = Math.sin(performance.now() / 180 + pickup.x) * 4;
      ctx.save();
      ctx.translate(px(pickup.x), px(pickup.y + bob));
      ctx.fillStyle = "rgba(6,8,12,.4)";
      ctx.fillRect(-10, 6, 22, 6);
      const tone = pickup.type === "cash" ? palette.acid : palette.pink;
      bevelRect(-12, -9, 24, 18, tone, shade(tone, 40), shade(tone, -50), 2);
      outlineRect(-12, -9, 24, 18, palette.outline, 2);
      drawPixelText(pickup.type === "cash" ? "$" : "!", 0, -4, { scale: 2, align: "center", color: "#0b0d12", shadow: null });
      ctx.restore();
    }
  }

  function drawRoadblocks() {
    for (const block of roadblocks) {
      if (!visiblePoint(block, 120)) continue;
      ctx.save();
      ctx.translate(px(block.x), px(block.y));
      ctx.rotate(block.angle);
      ctx.fillStyle = "rgba(6,8,12,.42)";
      ctx.fillRect(-66, -8, 140, 24);
      bevelRect(-70, -12, 140, 24, "#e0ded4", "#f6f3e8", "#9a978c", 2);
      ctx.fillStyle = "#d84a4a";
      for (let x = -65; x < 70; x += 28) ctx.fillRect(px(x), -12, 14, 24);
      outlineRect(-70, -12, 140, 24, palette.outline, 2);
      ctx.restore();
    }
  }

  function drawProjectiles() {
    for (const shot of projectiles) {
      ctx.globalAlpha = clamp(shot.life * 11, 0, 1);
      // Trazo punteado: se lee como ráfaga y no como una línea vectorial.
      const dx = shot.x2 - shot.x1;
      const dy = shot.y2 - shot.y1;
      const steps = Math.max(2, Math.round(Math.hypot(dx, dy) / 9));
      for (let i = 0; i < steps; i += 1) {
        const t = i / steps;
        ctx.fillStyle = shot.hostile ? (i % 2 ? "#ff8b6a" : "#ffd9a3") : (i % 2 ? "#fff2a3" : "#ffd257");
        ctx.fillRect(px(shot.x1 + dx * t) - 1, px(shot.y1 + dy * t) - 1, 3, 3);
      }
      ctx.fillStyle = "#fffbe6";
      ctx.fillRect(px(shot.x1) - 2, px(shot.y1) - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life * 2.5, 0, 1);
      const size = particle.life > 0.28 ? 6 : 4;
      ctx.fillStyle = particle.color;
      ctx.fillRect(px(particle.x - size / 2), px(particle.y - size / 2), size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawSkidMarks() {
    for (const mark of skidMarks) {
      if (!visiblePoint(mark, 60)) continue;
      ctx.save();
      ctx.globalAlpha = clamp(mark.life / 9, 0, 1) * 0.8 * mark.strength;
      ctx.translate(px(mark.x), px(mark.y));
      ctx.rotate(mark.angle);
      ctx.fillStyle = "#101216";
      ctx.fillRect(-5, -3, 11, 5);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawCity() {
    drawCityGround();
    drawSkidMarks();
    drawMissionRoute();
    drawRaceCheckpoints();
    for (const tree of trees) {
      if (!visiblePoint(tree, 45)) continue;
      const overlapsBuilding = solidBuildings.some((building) => circleHitsRect(tree.x, tree.y, tree.r, building));
      if (!pointOnRoad(tree.x, tree.y, tree.r) && !overlapsBuilding) drawTree(tree);
    }
    for (const building of urbanBuildings) drawUrbanBuilding(building);
    for (const building of buildings) {
      if (visibleRect(building, 100)) drawBuilding(building);
    }
    for (const stop of busStops) drawBusStop(stop);
    drawStreetProps();
    drawStreetLights();

    queueWorldLabel(3450, 1350, "LA CAMPANA", { scale: 1, color: "#8fd79c", range: 480 });
    queueWorldLabel(3630, 960, "PIEDRA DEL SACRIFICIO", { scale: 1, color: "#bd83ff", range: 380 });

    drawTraffic();
    for (const racer of racers) {
      if (!visiblePoint(racer, 120)) continue;
      drawVehicle(racer, { color: racer.color, small: true });
      queueWorldLabel(racer.x, racer.y - 44, racer.name, { scale: 1, color: racer.color, range: 420 });
    }
    for (const patrol of patrols) {
      if (visiblePoint(patrol, 100)) drawVehicle(patrol, { police: true, small: true });
    }
    drawRoadblocks();
    for (const npc of npcs) {
      if (npc.hidden || (npc.gardenRegular && isNight()) || !visiblePoint(npc, 80)) continue;
      drawPerson(npc);
    }
    for (const npc of tutorialCholos) if (visiblePoint(npc, 80)) drawPerson(npc);
    for (const npc of storyEnemies) if (visiblePoint(npc, 80)) drawPerson(npc);
    if (state.story.mission === "rochiTruth" && state.story.step === 1 && state.story.tail && visiblePoint(state.story.tail, 80)) {
      drawPerson({ ...state.story.tail, angle: Math.PI / 2, color: "#ded3bd" }, false, false, true);
    }
    for (const unit of policeUnits) {
      if (unit.status !== "dead" && visiblePoint(unit, 110)) drawVehicle(unit, { police: true, small: true });
    }
    for (const officer of policeOfficers) {
      if (visiblePoint(officer, 80)) drawPerson(officer);
    }
    drawPickups();
    drawHiddenPackages();
    if (visiblePoint(state.truck, 120)) drawVehicle(state.truck, { color: state.truck.paint });
    if (state.stolenCar && visiblePoint(state.stolenCar, 100)) drawVehicle(state.stolenCar, { color: state.stolenCar.color, small: true });
    if (state.story.fedeCar && visiblePoint(state.story.fedeCar, 100)) drawVehicle(state.story.fedeCar, { color: state.story.fedeCar.color, small: true });
    if (state.story.bike && visiblePoint(state.story.bike, 100)) drawVehicle(state.story.bike, { color: state.story.bike.color, small: true });

    if (!state.inVehicle) drawPerson(state.player, true, false);
    if (!state.inVehicle && (state.stage <= 1 || state.stifFollowing)) drawPerson(state.stif, false, true);
    if (state.rochi.available && !state.rochi.asleep && !state.inVehicle) drawPerson(state.rochi, false, false, true);
    if (state.fede.available && !state.inVehicle) drawPerson(state.fede);
    drawTargetMarker();
    drawProjectiles();
    drawParticles();
  }

  function drawInterior() {
    const room = interiors[state.scene] || interiors.house;
    const W = INTERIOR.width;
    const H = INTERIOR.height;

    // Muro con grosor: antes el interior era un rectángulo de color y ya.
    ctx.fillStyle = "#14161b";
    ctx.fillRect(0, 0, W, H);
    bevelRect(20, 20, W - 40, H - 40, "#3a3d45", "#585c66", "#232630", 4);
    ctx.fillStyle = "#1b1e24";
    ctx.fillRect(px(42), px(42), px(W - 84), px(H - 84));

    // Piso a cuadros, alternando tono.
    const tile = 36;
    const floorDark = shade(room.floor, -22);
    for (let x = 44; x < W - 44; x += tile) {
      for (let y = 44; y < H - 44; y += tile) {
        const even = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0;
        ctx.fillStyle = even ? room.floor : floorDark;
        ctx.fillRect(px(x), px(y), Math.min(tile, W - 44 - x), Math.min(tile, H - 44 - y));
      }
    }
    // Junta y desgaste.
    ctx.fillStyle = "rgba(0,0,0,.16)";
    for (let x = 44; x < W - 44; x += tile) ctx.fillRect(px(x), 44, 1, px(H - 88));
    for (let y = 44; y < H - 44; y += tile) ctx.fillRect(44, px(y), px(W - 88), 1);

    // Zoclo.
    ctx.fillStyle = shade(room.floor, -46);
    ctx.fillRect(px(42), px(42), px(W - 84), 8);
    ctx.fillStyle = "rgba(255,255,255,.08)";
    ctx.fillRect(px(42), px(50), px(W - 84), 2);

    // Lámparas de techo.
    for (const lx of [W * 0.28, W * 0.72]) {
      ctx.fillStyle = "rgba(255,240,190,.09)";
      ctx.fillRect(px(lx - 90), 52, 180, px(H - 120));
      ctx.fillStyle = "#d8d3c0";
      ctx.fillRect(px(lx - 34), 58, 68, 9);
      ctx.fillStyle = "#fff6cf";
      ctx.fillRect(px(lx - 31), 60, 62, 4);
    }

    // Muebles con volumen y etiqueta legible.
    for (const item of room.furniture) {
      ctx.fillStyle = "rgba(6,8,12,.42)";
      ctx.fillRect(px(item.x + 7), px(item.y + 8), px(item.w), px(item.h));
      bevelRect(item.x, item.y, item.w, item.h, item.color, shade(item.color, 30), shade(item.color, -34), 3);
      // Contenido de repisa: cajas apiladas.
      const cols = Math.max(1, Math.floor(item.w / 34));
      const rows = Math.max(1, Math.floor(item.h / 40));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          const s = idSeed(`${state.scene}-${item.label}-${c}-${r}`);
          if (seededValue(s) < 0.3) continue;
          const bx = item.x + 8 + c * (item.w - 12) / cols;
          const by = item.y + 8 + r * (item.h - 12) / rows;
          const tone = ["#c8433f", "#3f6fa8", "#c9973c", "#4f9163", "#b7ae98"][Math.floor(seededValue(s + 3) * 5)];
          ctx.fillStyle = tone;
          ctx.fillRect(px(bx), px(by), px((item.w - 12) / cols - 6), px((item.h - 12) / rows - 8));
          ctx.fillStyle = "rgba(0,0,0,.28)";
          ctx.fillRect(px(bx), px(by + (item.h - 12) / rows - 10), px((item.w - 12) / cols - 6), 2);
        }
      }
      outlineRect(item.x, item.y, item.w, item.h, palette.outline, 3);
      queueWorldLabel(item.x + item.w / 2, item.y + item.h / 2 - 3, item.label, { scale: 1, color: "#efe7d2", range: 0 });
    }
    drawInteriorDetails();

    // Salida marcada en el piso, con flechas.
    ctx.fillStyle = "#1b1e24";
    ctx.fillRect(px(386), px(H - 128), 128, 78);
    ctx.fillStyle = shade(room.floor, -34);
    ctx.fillRect(px(390), px(H - 124), 120, 70);
    ctx.fillStyle = palette.pink;
    ctx.fillRect(px(395), px(H - 120), 110, 14);
    ctx.fillStyle = "#0b0d12";
    for (let i = 0; i < 3; i += 1) ctx.fillRect(px(420 + i * 30), px(H - 117), 8, 8);
    queueWorldLabel(450, H - 100, "SALIDA", { scale: 1, color: palette.pink, range: 0 });

    if (room.service) {
      const clerk = room.clerk || {};
      const person = {
        x: 450,
        y: 118,
        angle: Math.PI / 2,
        status: "active",
        moving: false,
        speech: clerk.line || "",
        speechTimer: distance(state.player, { x: 450, y: 205 }) < 118 ? 1 : 0,
        look: {
          skin: clerk.skin || "#c98d63",
          hair: clerk.hair || "#241a14",
          shirt: clerk.shirt || "#4f78a4",
          pants: "#2b3038",
          build: 1,
          longHair: !!clerk.longHair,
          cap: !!clerk.cap,
          capColor: "#2f3a49",
          backpack: false,
        },
      };
      drawPerson(person);
      if (clerk.name) queueWorldLabel(450, 78, clerk.name, { scale: 1, color: "#cfd4d8", range: 0 });
    }
    if (state.scene === "cbtis") for (const npc of storyEnemies) drawPerson(npc);
    if (state.stifFollowing) drawPerson(state.stif, false, true);
    if (state.rochi.following && !state.rochi.asleep) drawPerson(state.rochi, false, false, true);
    drawPerson(state.player, true, false);
    drawTargetMarker();
    drawParticles();
  }

  function drawInteriorDetails() {
    ctx.save();
    if (state.scene === "marina") {
      ctx.strokeStyle = "#37485b";
      ctx.lineWidth = 5;
      for (const x of [285, 450, 615]) {
        ctx.beginPath();
        ctx.moveTo(x - 48, 330);
        ctx.lineTo(x + 48, 330);
        ctx.stroke();
        for (let offset = -38; offset <= 38; offset += 19) {
          ctx.fillStyle = ["#d15372", "#e5c34f", "#4d83ae", "#4a815e"][Math.abs(offset / 19) % 4];
          ctx.fillRect(x + offset - 7, 336, 14, 48);
        }
      }
      bevelRect(335, 455, 230, 40, "#244c7a", "#3a6ea6", "#152c48", 3);
      queueWorldLabel(450, 468, "OFERTA QUE NO APLICA EN NADA", { scale: 1, color: "#eef4ff", range: 0 });
    } else if (state.scene === "cbtis") {
      bevelRect(300, 185, 300, 72, "#294f3b", "#3d7355", "#17301f", 3);
      outlineRect(306, 191, 288, 60, "#e8e4cf", 2);
      queueWorldLabel(450, 214, "TESIS NO ES EXCUSA", { scale: 1, color: "#e8e4cf", range: 0 });
      for (const y of [340, 430]) for (const x of [320, 450, 580]) {
        ctx.fillStyle = "#735944";
        ctx.fillRect(x - 42, y - 18, 84, 36);
        ctx.fillStyle = "#30343a";
        ctx.fillRect(x - 35, y + 18, 8, 28);
        ctx.fillRect(x + 27, y + 18, 8, 28);
      }
    } else if (state.scene === "bank") {
      ctx.strokeStyle = "#b6d4d8";
      ctx.lineWidth = 4;
      for (const x of [300, 450, 600]) {
        ctx.beginPath();
        ctx.moveTo(x, 285);
        ctx.lineTo(x, 455);
        ctx.stroke();
        ctx.fillStyle = "#233238";
        ctx.beginPath();
        ctx.arc(x, 280, 9, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = "#d9b84e";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(300, 315);
      ctx.lineTo(600, 315);
      ctx.lineTo(300, 395);
      ctx.lineTo(600, 395);
      ctx.stroke();
      ctx.fillStyle = "#102a31";
      ctx.fillRect(88, 130, 108, 64);
      ctx.fillStyle = palette.cyan;
      ctx.fillRect(101, 143, 82, 29);
    } else if (state.scene === "garage") {
      ctx.fillStyle = "#292d30";
      ctx.fillRect(280, 275, 340, 170);
      ctx.strokeStyle = "#d8c83f";
      ctx.lineWidth = 8;
      ctx.strokeRect(280, 275, 340, 170);
      ctx.fillStyle = "rgba(20,18,18,.45)";
      ctx.beginPath();
      ctx.ellipse(450, 365, 95, 40, -0.2, 0, TAU);
      ctx.fill();
      for (const x of [250, 650]) for (let y = 310; y <= 420; y += 42) {
        ctx.fillStyle = "#17191b";
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#555b5f";
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    } else if (state.scene === "pelicano") {
      bevelRect(315, 320, 270, 58, "#ad2c35", "#d9525c", "#6b171f", 3);
      queueWorldLabel(450, 342, "NO HAY FIADO NI A ROCHI", { scale: 1, color: "#fff2cf", range: 0 });
    } else if (state.scene === "house") {
      ctx.fillStyle = "#87446b";
      ctx.fillRect(320, 455, 260, 92);
      ctx.strokeStyle = "#e3b8cd";
      ctx.lineWidth = 7;
      ctx.strokeRect(330, 465, 240, 72);
    }
    ctx.restore();
  }

  function drawLighting() {
    if (state.scene !== "city") return;
    const hour = (state.time / 60) % 24;
    let alpha = 0;
    let color = "#061329";
    if (hour >= 18 && hour < 20) {
      alpha = (hour - 18) * 0.09;
      color = "#1d1234";
    } else if (hour >= 20 || hour < 5.5) {
      alpha = 0.26;
    } else if (hour < 7) {
      alpha = (7 - hour) * 0.08;
    }
    if (alpha > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, view.bufferWidth, view.bufferHeight);
      ctx.restore();
    }
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#12151a";
    ctx.fillRect(0, 0, view.bufferWidth, view.bufferHeight);
    beginWorldTransform();
    if (state.scene !== "city") drawInterior();
    else drawCity();
    endWorldTransform();
    drawLighting();
    if (state.scene === "city" && isNight()) {
      beginWorldTransform();
      drawStreetLightGlows();
      endWorldTransform();
    }
    // Las etiquetas van al final y en espacio de pantalla: siempre legibles.
    flushWorldLabels();
    if (state.hurtFlash > 0) {
      // Marco rojo en la orilla en vez de teñir todo: se entiende que te
      // están pegando y se sigue viendo el juego.
      ctx.fillStyle = `rgba(190,32,52,${clamp(state.hurtFlash * 0.16, 0, 0.14)})`;
      ctx.fillRect(0, 0, view.bufferWidth, view.bufferHeight);
      ctx.fillStyle = `rgba(230,70,90,${clamp(state.hurtFlash * 1.1, 0, 0.75)})`;
      const edge = 4;
      ctx.fillRect(0, 0, view.bufferWidth, edge);
      ctx.fillRect(0, view.bufferHeight - edge, view.bufferWidth, edge);
      ctx.fillRect(0, 0, edge, view.bufferHeight);
      ctx.fillRect(view.bufferWidth - edge, 0, edge, view.bufferHeight);
    }
    drawMinimap();
  }

  function drawMinimap() {
    const w = minimap.width;
    const h = minimap.height;
    mini.clearRect(0, 0, w, h);
    if (state.scene !== "city") {
      mini.fillStyle = "#9c8d77";
      mini.fillRect(0, 0, w, h);
      mini.strokeStyle = "#22252a";
      mini.lineWidth = 7;
      mini.strokeRect(4, 4, w - 8, h - 8);
      mini.fillStyle = palette.pink;
      mini.fillRect(w / 2 - 12, h - 14, 24, 8);
      mini.fillStyle = palette.acid;
      mini.beginPath();
      mini.arc((state.player.x / INTERIOR.width) * w, (state.player.y / INTERIOR.height) * h, 5, 0, TAU);
      mini.fill();
      return;
    }

    const sx = w / WORLD.width;
    const sy = h / WORLD.height;
    mini.fillStyle = "#6f6d65";
    mini.fillRect(0, 0, w, h);
    mini.fillStyle = "#315a45";
    mini.fillRect(94, 5, 48, 43);
    mini.strokeStyle = palette.water;
    mini.lineWidth = 5;
    mini.beginPath();
    mini.moveTo(91, 0);
    mini.bezierCurveTo(98, 22, 88, 42, 98, 61);
    mini.bezierCurveTo(104, 78, 98, 91, 105, 103);
    mini.stroke();

    mini.fillStyle = "rgba(35,37,38,.52)";
    for (const building of urbanBuildings) {
      mini.fillRect(building.x * sx, building.y * sy, Math.max(1, building.w * sx), Math.max(1, building.h * sy));
    }
    mini.fillStyle = "rgba(220,215,200,.55)";
    for (const building of buildings) {
      if (building.garden || building.track || building.yard) continue;
      mini.fillRect(building.x * sx, building.y * sy, Math.max(1, building.w * sx), Math.max(1, building.h * sy));
    }

    for (const road of [...residentialRoads, ...roads]) {
      mini.beginPath();
      mini.moveTo(road.points[0][0] * sx, road.points[0][1] * sy);
      for (let i = 1; i < road.points.length; i += 1) mini.lineTo(road.points[i][0] * sx, road.points[i][1] * sy);
      mini.strokeStyle = roads.includes(road) ? "#c0c3c4" : "#8f969c";
      mini.lineWidth = clamp(road.width * sx, 1, 5);
      mini.stroke();
    }

    const focus = getFocus();
    mini.fillStyle = palette.cyan;
    mini.fillRect(state.truck.x * sx - 2, state.truck.y * sy - 2, 5, 5);
    if (state.wanted > 0) {
      mini.fillStyle = "#e84d5c";
      for (const unit of policeUnits) mini.fillRect(unit.x * sx - 1, unit.y * sy - 1, 3, 3);
    }
    mini.fillStyle = state.inVehicle ? palette.cyan : palette.pink;
    mini.beginPath();
    mini.arc(focus.x * sx, focus.y * sy, 5.5, 0, TAU);
    mini.fill();
    const target = currentTarget();
    if (target && state.scene === "city") {
      mini.fillStyle = palette.acid;
      mini.fillRect(target.x * sx - 3, target.y * sy - 3, 7, 7);
    }
  }

  function updateUi() {
    $("#health-fill").style.width = `${state.health}%`;
    $("#energy-fill").style.width = `${state.energy}%`;
    $("#armor-fill").style.width = `${state.armor}%`;
    $("#money").textContent = `$${Math.floor(state.money)}`;
    const hour = Math.floor((state.time / 60) % 24);
    const minute = Math.floor(state.time % 60);
    $("#clock").textContent = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    $("#phone-clock").textContent = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    $("#period").textContent = hour >= 19 || hour < 5 ? "NOCHE" : hour >= 17 ? "ATARDECER" : hour < 8 ? "AMANECER" : "DÍA";
    let copy = missionCopy[state.stage] || missionCopy[missionCopy.length - 1];
    let missionTitle = state.freeRoam ? "Vida libre en Colima" : "Que Stif se divierta";
    let missionIndex = state.stage < 13 ? "MISIÓN 1 · TUTORIAL" : "MUNDO LIBRE";
    const activeStory = currentStoryCopy();
    if (activeStory) {
      copy = activeStory;
      missionTitle = state.story.mission === "fede"
        ? "Recupera el auto de Fede"
        : state.story.mission === "cbtis"
          ? "Faltistas"
          : state.story.mission === "agronomia"
            ? "La tesis no se riega sola"
            : state.story.mission === "rochiTruth"
              ? "Rochi sí trae"
              : "Recupera la moto de Rochi";
      missionIndex = state.story.mission === "fede" ? "MISIÓN 2" : state.story.mission === "cbtis" ? "MISIÓN 3" : state.story.mission === "agronomia" ? "MISIÓN 4" : state.story.mission === "rochiTruth" ? "MISIÓN 5" : "ENCARGO";
    }
    if (state.race.active) {
      copy = { objective: `ARRANCÓN · ARO ${state.race.checkpoint}/${raceRoute.length - 1}`, phone: `Tiempo: ${state.race.elapsed.toFixed(1)} s` };
      missionTitle = "Arrancones Tercer Anillo";
    } else if (state.didi.active) {
      const stop = state.didi.phase === "pickup" ? state.didi.pickup : state.didi.dropoff;
      copy = { objective: `${state.didi.phase === "pickup" ? "RECOGER" : "ENTREGAR"} · ${stop.name.toUpperCase()}`, phone: `${Math.ceil(state.didi.timer)} s · pago estimado $${state.didi.pay}` };
      missionTitle = "Didi Comida de Rochi";
    } else if (state.rochi.rideRequest) {
      copy = { objective: "LLEVAR A ROCHI A SU CASA", phone: "También puedes ignorarlo; a las 02:00 se irá solo" };
      missionTitle = "Ya le dio sueño";
    }
    $("#mission-index").textContent = missionIndex;
    $("#mission-title").textContent = missionTitle;
    $("#objective-text").textContent = copy.objective;
    $("#phone-objective").textContent = copy.phone;
    $("#wanted").textContent = `${"★ ".repeat(state.wanted)}${"☆ ".repeat(5 - state.wanted)}`.trim();
    $("#wanted").classList.toggle("active", state.wanted > 0);
    $("#run-label").textContent = state.inVehicle ? "ACELERAR" : "CORRER";
    const weapon = weapons[state.equippedWeapon] || weapons.fists;
    $("#weapon-name").textContent = weapon.name;
    $("#ammo-count").textContent = Number.isFinite(weapon.ammo) ? String(state.ammo[state.equippedWeapon] || 0) : "∞";
    $("#attack-label").textContent = state.inVehicle ? "FRENO" : state.equippedWeapon === "fists" ? "PEGAR" : "ATACAR";
    // Velocímetro: sin él no se siente la diferencia entre ir rápido y volar.
    const speedTag = $("#speed-status");
    if (state.inVehicle) {
      const vehicle = activeVehicle();
      const kmh = Math.round(Math.abs(vehicle.speed || 0) * 0.62);
      speedTag.textContent = `${kmh} KM/H`;
      speedTag.classList.remove("hidden");
      speedTag.classList.toggle("fast", kmh > 150);
      speedTag.classList.toggle("drift", (vehicle.slip || 0) > 46);
    } else {
      speedTag.classList.add("hidden");
    }
    const vehicle = activeVehicle();
    const vehicleLabel = state.vehicleKind === "fede" ? "SENTRA" : state.vehicleKind === "bike" ? "MOTO" : "GAS";
    $("#fuel-status").textContent = state.inVehicle ? `${vehicleLabel} ${Math.round(vehicle.fuel)}%` : `TROCA ${Math.round(state.truck.health)}%`;
    updateGpsHud();
  }

  function update(dt) {
    if (!state.started) {
      updateCamera(dt);
      return;
    }
    updateAudio(dt);
    gpsCache.age += dt;
    if (updateJail(dt)) {
      updateCamera(dt);
      updateUi();
      return;
    }
    if (state.paused || state.dialogue) {
      updateCamera(dt);
      return;
    }
    const previousTime = state.time;
    state.time = (state.time + dt * 1.2) % (24 * 60);
    if (state.time < previousTime) state.day += 1;
    updatePlayer(dt);
    updateNpcs(dt);
    updateNamedCharacters(dt);
    updateTraffic(dt);
    updatePatrols(dt);
    updateWanted(dt);
    updatePickups(dt);
    updateRace(dt);
    updateDidi(dt);
    updateRochi();
    updateNews(dt);
    updateTutorial();
    updateStory(dt);
    updateEveVitals(dt);
    updateSkidMarks(dt);
    updateHiddenPackages();
    recoverEve();
    updateParticles(dt);
    updateProjectiles(dt);
    updateCamera(dt);
    updateAreaBanner(dt);
    updateContextHint();
    updateUi();
    saveAccumulator += dt;
    if (saveAccumulator > 5) {
      saveAccumulator = 0;
      saveGame();
    }
  }

  function updateProjectiles(dt) {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      projectiles[index].life -= dt;
      if (projectiles[index].life <= 0) projectiles.splice(index, 1);
    }
  }

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function buildSaveData() {
    return {
      game: "EVE GTA",
      version: 4,
      scene: state.scene,
      stage: state.stage,
      money: state.money,
      bank: state.bank,
      health: state.health,
      armor: state.armor,
      packages: hiddenPackages.map((entry) => (entry.taken ? 1 : 0)),
      energy: state.energy,
      time: state.time,
      day: state.day,
      player: state.player,
      truck: state.truck,
      inVehicle: state.inVehicle,
      vehicleKind: state.vehicleKind,
      stolenCar: state.stolenCar,
      stifFollowing: state.stifFollowing,
      stif: state.stif,
      rochi: state.rochi,
      fede: state.fede,
      inventory: state.inventory,
      ownedWeapons: state.ownedWeapons,
      equippedWeapon: state.equippedWeapon,
      ammo: state.ammo,
      energyBuff: state.energyBuff,
      raffleUnlocked: state.raffleUnlocked,
      didiUnlocked: state.didiUnlocked,
      didi: state.didi,
      race: state.race,
      jail: state.jail,
      news: state.news,
      newsClock: state.newsClock,
      tutorialPrize: state.tutorialPrize,
      tutorialFlags: state.tutorialFlags,
      freeRoam: state.freeRoam,
      story: state.story,
      settings: state.settings,
      npcState: [...npcs, ...tutorialCholos, ...storyEnemies].map((npc) => ({ id: npc.id, health: npc.health, status: npc.status, dropped: npc.dropped })),
    };
  }

  function saveGame() {
    const data = buildSaveData();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (_) {
      // El juego sigue funcionando si el navegador bloquea almacenamiento local.
    }
  }

  // La ciudad se reacomodó (edificios que estaban sobre avenidas), así que una
  // partida vieja puede dejar a Eve o a la troca dentro de una pared. Se busca
  // el hueco libre más cercano en espiral en vez de dejarla atorada.
  function unstick(entity, radius) {
    if (!cityBlocked(entity.x, entity.y, radius, true)) return false;
    for (let ring = 24; ring <= 900; ring += 24) {
      for (let i = 0; i < 24; i += 1) {
        const angle = (i / 24) * TAU;
        const x = clamp(entity.x + Math.cos(angle) * ring, 40, WORLD.width - 40);
        const y = clamp(entity.y + Math.sin(angle) * ring, 40, WORLD.height - 40);
        if (!cityBlocked(x, y, radius, true)) {
          entity.x = x;
          entity.y = y;
          return true;
        }
      }
    }
    return false;
  }

  // Los civiles y sus destinos (casa, trabajo, ocio) son puntos calculados
  // sobre las banquetas. Después del reacomodo de la ciudad alguno puede caer
  // dentro de un edificio y el NPC se queda empujando la pared para siempre.
  function unstickCrowd() {
    for (const npc of npcs) {
      unstick(npc, 12);
      for (const spot of [npc.home, npc.work, npc.leisure]) {
        if (spot) unstick(spot, 12);
      }
    }
  }

  function loadGame() {
    try {
      let raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        for (const legacyKey of LEGACY_SAVE_KEYS) {
          raw = localStorage.getItem(legacyKey);
          if (raw) break;
        }
      }
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (![2, 3, 4].includes(data.version)) return false;
      state.scene = ["city", ...Object.keys(interiors)].includes(data.scene) ? data.scene : "city";
      state.stage = clamp(Number(data.stage) || 0, 0, missionCopy.length - 1);
      state.money = Math.max(0, Number(data.money) || 0);
      state.bank = Math.max(0, Number(data.bank) || 0);
      state.health = clamp(Number(data.health) || 100, 0, 100);
      state.armor = clamp(Number(data.armor) || 0, 0, 100);
      if (Array.isArray(data.packages)) {
        data.packages.forEach((flag, index) => {
          if (hiddenPackages[index]) hiddenPackages[index].taken = Boolean(flag);
        });
        state.packages = packagesFound();
      }
      state.energy = clamp(Number(data.energy) || 100, 0, 100);
      state.time = Number.isFinite(Number(data.time)) ? Number(data.time) : 12 * 60 + 10;
      state.day = Math.max(0, Number(data.day) || 0);
      Object.assign(state.player, data.player || {});
      Object.assign(state.truck, data.truck || {});
      state.inVehicle = Boolean(data.inVehicle) && state.scene === "city";
      state.vehicleKind = ["stolen", "fede", "bike"].includes(data.vehicleKind) ? data.vehicleKind : "truck";
      state.stolenCar = data.stolenCar || null;
      state.stifFollowing = Boolean(data.stifFollowing);
      Object.assign(state.stif, data.stif || {});
      Object.assign(state.rochi, data.rochi || {});
      Object.assign(state.fede, data.fede || {});
      if (data.inventory) Object.assign(state.inventory, data.inventory);
      state.ownedWeapons = Array.isArray(data.ownedWeapons) && data.ownedWeapons.length ? data.ownedWeapons.filter((id) => weapons[id]) : ["fists"];
      state.equippedWeapon = state.ownedWeapons.includes(data.equippedWeapon) ? data.equippedWeapon : "fists";
      Object.assign(state.ammo, data.ammo || {});
      state.energyBuff = Math.max(0, Number(data.energyBuff) || 0);
      state.raffleUnlocked = Boolean(data.raffleUnlocked);
      state.didiUnlocked = Boolean(data.didiUnlocked);
      Object.assign(state.didi, data.didi || {});
      Object.assign(state.race, data.race || {});
      Object.assign(state.jail, data.jail || {});
      state.news = Array.isArray(data.news) ? data.news.slice(0, 12) : state.news;
      state.newsClock = Math.max(1, Number(data.newsClock) || 38);
      state.tutorialPrize = data.tutorialPrize || null;
      state.tutorialFlags = data.tutorialFlags || {};
      state.freeRoam = Boolean(data.freeRoam);
      if (data.version >= 3 && data.story) {
        Object.assign(state.story, data.story);
        state.story.completed = { ...defaultState.story.completed, ...(data.story.completed || {}) };
      } else if (state.freeRoam && state.stage >= 13) {
        state.story.mission = "fede";
        state.story.step = 0;
        state.fede.available = true;
      }
      if (data.version >= 4 && data.settings) {
        Object.assign(state.settings, data.settings);
        state.settings.bindings = { ...defaultBindings, ...(data.settings.bindings || {}) };
        state.settings.sfxVolume = clamp(Number(state.settings.sfxVolume) || 0.75, 0.1, 1);
        state.settings.radioVolume = clamp(Number(state.settings.radioVolume) || 0.42, 0.1, 1);
        state.settings.steeringSensitivity = clamp(Number(state.settings.steeringSensitivity) || 1, 0.75, 1.25);
        state.settings.touchSensitivity = clamp(Number(state.settings.touchSensitivity) || 1, 0.75, 1.25);
        if (!radioStations.some((entry) => entry.id === state.settings.station)) state.settings.station = "quebradora";
      }
      if (data.version < 4 && state.story.completed.cbtis && !state.story.completed.agronomia && state.story.mission === "free") {
        state.story.mission = "agronomia";
        state.story.step = 0;
      }
      state.story.fedeRewardGross = Math.max(4000, Number(state.story.fedeRewardGross) || 4000);
      if (state.stage === 10) spawnTutorialEnemies(4, false);
      if (state.stage === 11) spawnTutorialEnemies(3, true);
      if (state.story.mission === "fede" && state.story.step === 2) spawnStoryEnemies("sentra-cholos", 5);
      if (state.story.mission === "fede" && state.story.step >= 3 && !state.story.fedeCar) createFedeCar();
      if (state.story.mission === "cbtis" && state.story.step === 1) spawnStoryEnemies("teachers", 7);
      if (state.story.mission === "corralon" && state.story.step >= 1 && !state.story.bike) createRochiBike();
      if (state.vehicleKind === "stolen" && !state.stolenCar) state.vehicleKind = "truck";
      if (state.vehicleKind === "fede" && !state.story.fedeCar) state.vehicleKind = "truck";
      if (state.vehicleKind === "bike" && !state.story.bike) state.vehicleKind = "truck";
      if (Array.isArray(data.npcState)) {
        for (const saved of data.npcState) {
          const npc = [...npcs, ...tutorialCholos, ...storyEnemies].find((entry) => entry.id === saved.id);
          if (npc) Object.assign(npc, saved);
        }
      }
      if (state.jail.active) $("#separos").classList.remove("hidden");
      // Rescatar de la geometría a quien haya quedado atrapado por el
      // reacomodo de la ciudad.
      if (state.scene === "city") {
        if (unstick(state.player, state.player.radius || 15)) {
          showHint("Te sacamos de una pared. La ciudad se reacomodó tantito.", 2400);
        }
        unstick(state.truck, state.truck.radius || 31);
        if (state.stolenCar) unstick(state.stolenCar, 28);
        for (const person of [state.stif, state.rochi, state.fede]) unstick(person, 13);
        unstickCrowd();
      }
      if (state.story.mission === "fede" && state.story.fedeRewardPhase === "gross") showFedeRewardDialogue();
      $("#start-btn").textContent = "CONTINUAR";
      return true;
    } catch (_) {
      return false;
    }
  }

  function resetMission() {
    const keepStarted = state.started;
    const keepSettings = JSON.parse(JSON.stringify(state.settings));
    const clean = JSON.parse(JSON.stringify(defaultState));
    Object.assign(state, clean);
    state.settings = keepSettings;
    pickups.length = 0;
    policeUnits.length = 0;
    patrols.length = 0;
    roadblocks.length = 0;
    projectiles.length = 0;
    tutorialCholos.length = 0;
    storyEnemies.length = 0;
    for (const car of traffic) car.stolen = false;
    for (const npc of npcs) {
      npc.health = 100;
      npc.status = "active";
      npc.dropped = false;
      npc.stunned = 0;
    }
    state.started = keepStarted;
    lastAreaName = "";
    areaBannerTimer = 0;
    $("#area-banner").classList.remove("visible");
    input.keys.clear();
    input.joystick.x = 0;
    input.joystick.y = 0;
    input.run = false;
    updateKeyboardHelp();
    $("#joystick-knob").style.transform = "translate(-50%, -50%)";
    $("#dialogue").classList.add("hidden");
    $("#mission-complete").classList.add("hidden");
    $("#separos").classList.add("hidden");
    closePanel();
    closePhone();
    try {
      localStorage.removeItem(SAVE_KEY);
      for (const legacyKey of LEGACY_SAVE_KEYS) localStorage.removeItem(legacyKey);
    } catch (_) {}
    updateUi();
    saveGame();
  }

  function openPhone() {
    if (!state.started || state.jail.active || state.dialogue || !$("#action-panel").classList.contains("hidden")) return;
    state.paused = true;
    $("#phone").classList.remove("hidden");
    showPhoneApp("mission");
    sound("phone");
  }

  function closePhone() {
    $("#phone").classList.add("hidden");
    if ($("#action-panel").classList.contains("hidden") && !state.jail.active) state.paused = false;
    lastTime = performance.now();
  }

  function showPhoneApp(app) {
    const view = $("#phone-app-view");
    const copy = missionCopy[state.stage] || missionCopy[missionCopy.length - 1];
    const activeStory = currentStoryCopy();
    const tacos = `${"🌮".repeat(Math.max(1, Math.round(state.didi.rating)))}${"▫".repeat(5 - Math.max(1, Math.round(state.didi.rating)))}`;
    if (app === "mission") {
      if (activeStory) {
        const titles = { fede: "Misión 2 · Recupera el auto de Fede", cbtis: "Misión 3 · Faltistas", agronomia: "Misión 4 · La tesis no se riega sola", rochiTruth: "Misión 5 · Rochi sí trae", corralon: "Encargo · Recupera la moto de Rochi" };
        const title = titles[state.story.mission] || "Historia de Eve";
        view.innerHTML = `<strong>${title}</strong><p>${activeStory.phone}</p><p class="muted">Las cinemáticas ocurren dentro del mapa y congelan la acción.</p>`;
      } else if (state.story.corralonUnlocked && !state.story.completed.corralon) {
        view.innerHTML = '<strong>Mundo libre</strong><p>El pendiente de la moto de Rochi ya está disponible.</p><button data-phone-action="start-corralon">Recuperar la moto de Rochi</button><p class="muted">Inicia una persecución perdible de cuatro estrellas.</p>';
      } else {
        view.innerHTML = `<strong>${state.freeRoam ? "Mundo libre" : "Que Stif se divierta"}</strong><p>${copy.phone}</p><p class="muted">Progreso del tutorial: ${Math.min(state.stage, 13)}/13</p>`;
      }
    } else if (app === "map") {
      const target = currentTarget();
      view.innerHTML = `<strong>Mapa y GPS vial</strong><p>Zona actual: <b>${currentAreaName()}</b></p><p>${target ? `Ruta calculada por calles: ${Math.max(0, gpsRouteFor(target).length - 1)} tramos. Se recalcula si te desvías.` : "Sin ruta activa. Colima queda libre para que te pierdas."}</p><p>Camioneta de Eve: ${state.truck.destroyed ? "destruida, pero localizada" : "marcada en turquesa"}.</p><p class="muted">El GPS prioriza avenidas y evita edificios; en interiores vuelve a activarse al salir.</p>`;
    } else if (app === "inventory") {
      const physical = state.ownedWeapons.map((id) => weapons[id].name).join(", ");
      const weaponButtons = state.ownedWeapons.map((id) => `<button data-phone-action="equip-${id}">${state.equippedWeapon === id ? "✓ " : ""}Equipar ${weapons[id].name}</button>`).join("");
      const secret = state.rochi.available || state.rochi.following ? `<div class="inventory-row"><span>Cuenta secreta de Rochi</span><b>$${Math.floor(state.rochi.cash)}</b></div><p class="muted">Él insiste en que no trae nada y que ya invitó antes.</p>` : "";
      const loan = state.freeRoam && state.rochi.loanOffer && (!state.rochi.loan || state.rochi.loan.resolved)
        ? '<button data-phone-action="lend-rochi">Prestarle $100 a Rochi</button><button data-phone-action="decline-rochi">Decirle que no</button>'
        : state.rochi.loan ? `<p>Préstamo a Rochi: $${state.rochi.loan.amount} · ${state.rochi.loan.resolved ? "resuelto" : `vence el día ${state.rochi.loan.dueDay}`}</p>` : "";
      view.innerHTML = `<strong>Mochila</strong><div class="inventory-row"><span>Caguamas</span><b>${state.inventory.caguama}</b></div><div class="inventory-row"><span>Takis Fuego</span><b>${state.inventory.takis}</b></div><div class="inventory-row"><span>Armas físicas</span><b>${physical}</b></div>${weaponButtons}<button data-phone-action="drink" ${state.inventory.caguama < 1 ? "disabled" : ""}>Usar caguama</button><button data-phone-action="takis" ${state.inventory.takis < 1 ? "disabled" : ""}>Comer Takis</button>${secret}${loan}`;
    } else if (app === "didi") {
      const status = !state.didiUnlocked
        ? "Rochi todavía no te presta su cuenta. Termina el tutorial."
        : state.didi.active
          ? `${state.didi.phase === "pickup" ? "Recoge en" : "Entrega en"} ${(state.didi.phase === "pickup" ? state.didi.pickup : state.didi.dropoff).name}. Quedan ${Math.ceil(state.didi.timer)} s.`
          : "Pedidos fáciles, paga modesta y comisión nada modesta para Rochi.";
      view.innerHTML = `<strong>Didi Comida · ${tacos}</strong><p>${status}</p><p>Entregas: ${state.didi.completed} · Comisión: ${Math.round(state.didi.commission * 100)}%</p>${state.didiUnlocked && !state.didi.active ? '<button data-phone-action="didi">Aceptar pedido</button>' : ""}<p class="muted">Didi es legal; chocar o cometer delitos sigue teniendo consecuencias.</p>`;
    } else if (app === "raffle") {
      view.innerHTML = `<strong>Rifas El Aferrado</strong><p>${state.raffleUnlocked || state.stage >= 5 ? "La rifa está marcada en el mapa. Cada tirada da algo, pero normalmente recuperas menos de lo apostado." : "Se desbloquea durante el paseo con Stif."}</p><p>Premios guardados: ${state.inventory.raffleItems.length}</p><p class="muted">Las armas de fuego solo salen aquí o de enemigos. No existe armería legal.</p>`;
    } else if (app === "bank") {
      view.innerHTML = `<strong>Banco</strong><div class="inventory-row"><span>Saldo protegido</span><b>$${Math.floor(state.bank)}</b></div><div class="inventory-row"><span>Efectivo expuesto</span><b>$${Math.floor(state.money)}</b></div><p>Retira dinero únicamente en un cajero del mapa. Toda compra exige efectivo.</p><p class="muted">Separos quita la mitad del efectivo; el banco no se toca.</p>`;
    } else if (app === "news") {
      view.innerHTML = `<strong>Paquetes escondidos</strong><div class="inventory-row"><span>Encontrados</span><b>${packagesFound()} / ${HIDDEN_PACKAGE_TOTAL}</b></div><p class="muted">Están fuera de la calle: callejones, patios y rincones. Brillan cuando andas cerca. Cada diez hay premio.</p><strong>Colima Noticias Más o Menos</strong>${state.news.map((item) => `<div class="news-item">${item}</div>`).join("")}`;
    } else if (app === "camera") {
      view.innerHTML = '<strong>Cámara</strong><p>La cámara solo guarda una captura del juego. No abre misiones ni vigila NPC.</p><button data-phone-action="camera">Guardar captura PNG</button>';
    } else if (app === "radio") {
      const active = radioStations.find((entry) => entry.id === state.settings.station) || radioStations[0];
      view.innerHTML = `<strong>Radio de la troca</strong><p><b>${active.name}</b><br>${active.track}</p>${radioStations.map((station) => `<button data-phone-action="station-${station.id}">${station.id === active.id ? "✓ " : ""}${station.name}</button>`).join("")}<p class="muted">Música original procedural de 8 bits: cumbia, barrio y pop-rock. Funciona sin descargar pistas ni depender de internet.</p>`;
    } else {
      const bindings = Object.entries(state.settings.bindings).map(([action, code]) => `<div class="setting-row"><span>${action.toUpperCase()}</span><button data-phone-action="bind-${action}">${pendingBinding === action ? "Pulsa una tecla…" : keyLabels[code] || code}</button></div>`).join("");
      view.innerHTML = `<strong>Ajustes y partida</strong><p>Sonido: ${state.settings.muted ? "apagado" : "encendido"} · SFX ${Math.round(state.settings.sfxVolume * 100)}% · Radio ${Math.round(state.settings.radioVolume * 100)}%</p><button data-phone-action="sound">${state.settings.muted ? "Activar" : "Silenciar"} sonido</button><button data-phone-action="sfx-volume">Volumen efectos +</button><button data-phone-action="radio-volume">Volumen radio +</button><p>Sensibilidad volante ${Math.round(state.settings.steeringSensitivity * 100)}% · táctil ${Math.round(state.settings.touchSensitivity * 100)}%</p><button data-phone-action="steering">Cambiar sensibilidad volante</button><button data-phone-action="touch">Cambiar sensibilidad táctil</button>${bindings}<button data-phone-action="reset-controls">Restaurar controles</button><button data-phone-action="export-save">Exportar partida JSON</button><button data-phone-action="import-save">Importar partida JSON</button><p class="muted">Escape siempre cierra menús. Flechas siempre funcionan como movimiento de respaldo.</p>`;
    }
    view.dataset.app = app;
  }

  function phoneAction(action) {
    if (action.startsWith("equip-")) {
      const id = action.slice(6);
      if (state.ownedWeapons.includes(id)) state.equippedWeapon = id;
      updateUi();
      showPhoneApp("inventory");
      saveGame();
    } else if (action === "drink") {
      consumeCaguama();
      showPhoneApp("inventory");
    } else if (action === "takis") {
      consumeTakis();
      showPhoneApp("inventory");
    } else if (action === "didi") {
      acceptDidiOrder();
    } else if (action === "lend-rochi") {
      lendToRochi(100);
    } else if (action === "decline-rochi") {
      state.rochi.loanOffer = false;
      showHint("Eve: “No, mamón. Tú traes más que yo.”", 1700);
      showPhoneApp("inventory");
      saveGame();
    } else if (action === "start-corralon") {
      startCorralonMission();
    } else if (action === "sound") {
      state.settings.muted = !state.settings.muted;
      $("#sound-btn").textContent = state.settings.muted ? "×" : "♪";
      showPhoneApp("settings");
      saveGame();
    } else if (action.startsWith("station-")) {
      state.settings.station = action.slice(8);
      radioStep = -1;
      showRadioHud(true);
      showPhoneApp("radio");
      saveGame();
    } else if (action.startsWith("bind-")) {
      pendingBinding = action.slice(5);
      showPhoneApp("settings");
    } else if (action === "reset-controls") {
      state.settings.bindings = { ...defaultBindings };
      pendingBinding = null;
      updateKeyboardHelp();
      showPhoneApp("settings");
      saveGame();
    } else if (action === "steering") {
      state.settings.steeringSensitivity = state.settings.steeringSensitivity >= 1.25 ? 0.75 : state.settings.steeringSensitivity + 0.25;
      showPhoneApp("settings"); saveGame();
    } else if (action === "touch") {
      state.settings.touchSensitivity = state.settings.touchSensitivity >= 1.25 ? 0.75 : state.settings.touchSensitivity + 0.25;
      showPhoneApp("settings"); saveGame();
    } else if (action === "sfx-volume") {
      state.settings.sfxVolume = state.settings.sfxVolume >= 1 ? 0.25 : state.settings.sfxVolume + 0.25;
      showPhoneApp("settings"); saveGame();
    } else if (action === "radio-volume") {
      state.settings.radioVolume = state.settings.radioVolume >= 1 ? 0.25 : state.settings.radioVolume + 0.25;
      showPhoneApp("settings"); saveGame();
    } else if (action === "export-save") {
      exportSave();
    } else if (action === "import-save") {
      $("#save-import").click();
    } else if (action === "camera") {
      captureScreenshot();
    }
  }

  function captureScreenshot() {
    closePhone();
    window.setTimeout(() => {
      if (!canvas.toBlob) {
        showHint("Este navegador no permite guardar la captura", 1500);
        return;
      }
      canvas.toBlob((blob) => {
        if (!blob) return;
        const link = document.createElement("a");
        link.download = `eve-gta-${Date.now()}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        showHint("Captura guardada", 1200);
      }, "image/png");
    }, 120);
  }

  function validateImportedSave(data) {
    if (!data || typeof data !== "object" || ![2, 3, 4].includes(Number(data.version))) return false;
    if (data.game && data.game !== "EVE GTA") return false;
    return Number.isFinite(Number(data.money))
      && Number.isFinite(Number(data.bank))
      && data.player && Number.isFinite(Number(data.player.x)) && Number.isFinite(Number(data.player.y));
  }

  function exportSave() {
    saveGame();
    const payload = { ...buildSaveData(), exportedAt: new Date().toISOString() };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.download = `eve-gta-partida-dia-${state.day}.json`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      showHint("Partida exportada. Guárdala como si Rochi te debiera feria.", 1800);
    } catch (_) {
      showHint("Este navegador no permitió exportar la partida", 1600);
    }
  }

  async function importSaveFile(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!validateImportedSave(data)) throw new Error("invalid");
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      showHint("Partida importada · recargando Colima", 1200);
      window.setTimeout(() => window.location?.reload?.(), 300);
    } catch (_) {
      showHint("Archivo inválido: no es una partida compatible de EVE GTA", 2200);
    }
  }

  function updateKeyboardHelp() {
    const b = state.settings.bindings;
    $("#keyboard-help").textContent = `${keyLabels[b.up] || b.up}/${keyLabels[b.left] || b.left}/${keyLabels[b.down] || b.down}/${keyLabels[b.right] || b.right} mover · ${keyLabels[b.use] || b.use} usar · ${keyLabels[b.run] || b.run} correr · ${keyLabels[b.attack] || b.attack} atacar · ${keyLabels[b.weapon] || b.weapon} arma · ${keyLabels[b.radio] || b.radio} radio`;
  }

  function ensureAudio() {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume?.();
      if (!masterGain) {
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
      }
      if (!engineOscillator) {
        engineOscillator = audioContext.createOscillator();
        engineGain = audioContext.createGain();
        engineOscillator.type = "sawtooth";
        engineOscillator.frequency.setValueAtTime(54, audioContext.currentTime);
        engineGain.gain.setValueAtTime(0.001, audioContext.currentTime);
        engineOscillator.connect(engineGain).connect(masterGain);
        engineOscillator.start();
      }
      return audioContext;
    } catch (_) {
      return null;
    }
  }

  function playTone(frequency, duration, type = "square", volume = 0.08, delay = 0) {
    if (state.settings.muted || !state.started || !frequency) return;
    const audio = ensureAudio();
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const when = audio.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(Math.max(0.001, volume), when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain).connect(masterGain);
    osc.start(when);
    osc.stop(when + duration);
  }

  function sound(kind) {
    if (state.settings.muted || !state.started) return;
    try {
      const audio = ensureAudio();
      if (!audio) return;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const settings = {
        punch: [120, 0.06, "square"],
        door: [240, 0.09, "square"],
        engine: [90, 0.14, "sawtooth"],
        dialogue: [480, 0.04, "square"],
        alert: [720, 0.2, "sawtooth"],
        complete: [620, 0.55, "square"],
        crash: [75, 0.18, "sawtooth"],
        deny: [105, 0.08, "square"],
        phone: [820, 0.07, "sine"],
        pickup: [540, 0.08, "square"],
        shot: [82, 0.07, "sawtooth"],
      };
      const [frequency, duration, type] = settings[kind] || [300, 0.05, "square"];
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
      if (kind === "complete") osc.frequency.exponentialRampToValueAtTime(980, audioContext.currentTime + duration);
      if (kind === "crash") osc.frequency.exponentialRampToValueAtTime(35, audioContext.currentTime + duration);
      gain.gain.setValueAtTime(0.08 * state.settings.sfxVolume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      osc.connect(gain).connect(masterGain);
      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (_) {
      // El navegador puede negar audio hasta que exista un gesto del usuario.
    }
  }

  function midiFrequency(note) {
    return note ? 440 * Math.pow(2, (note - 69) / 12) : 0;
  }

  function showRadioHud(force = false) {
    const station = radioStations.find((entry) => entry.id === state.settings.station) || radioStations[0];
    $("#radio-station").textContent = station.name;
    $("#radio-track").textContent = station.track;
    $("#radio-hud").classList.toggle("hidden", station.id === "off");
    if (force) radioHudTimer = 4;
  }

  function updateAudio(dt) {
    const station = radioStations.find((entry) => entry.id === state.settings.station) || radioStations[0];
    radioHudTimer = Math.max(0, radioHudTimer - dt);
    if (station.id !== "off" && radioHudTimer > 0) showRadioHud();
    else if (radioHudTimer <= 0) $("#radio-hud").classList.add("hidden");
    const audio = audioContext;
    if (engineGain && audio) {
      const vehicle = activeVehicle();
      const audible = !state.settings.muted && state.inVehicle && !vehicle.destroyed;
      const level = audible ? (0.008 + Math.min(0.026, Math.abs(vehicle.speed) * 0.00007)) * state.settings.sfxVolume : 0.001;
      engineGain.gain.setTargetAtTime(level, audio.currentTime, 0.08);
      engineOscillator.frequency.setTargetAtTime(52 + Math.abs(vehicle.speed) * 0.38, audio.currentTime, 0.06);
    }
    if (state.settings.muted) return;
    ambientClock -= dt;
    if (ambientClock <= 0 && state.scene === "city") {
      ambientClock = 4.5 + Math.random() * 5;
      const hour = gameHour();
      if (hour >= 6 && hour < 18) {
        playTone(1280 + Math.random() * 520, 0.05, "sine", 0.006 * state.settings.sfxVolume);
        playTone(1540 + Math.random() * 380, 0.04, "sine", 0.004 * state.settings.sfxVolume, 0.09);
      } else {
        playTone(420 + Math.random() * 90, 0.12, "triangle", 0.005 * state.settings.sfxVolume);
      }
    }
    sirenClock -= dt;
    if (state.wanted > 0 && state.scene === "city" && sirenClock <= 0) {
      // Sirena de dos tonos que aprieta con las estrellas y suena más fuerte
      // cuando la patrulla ya te respira encima.
      const focus = getFocus();
      let closest = Infinity;
      for (const unit of policeUnits) closest = Math.min(closest, distance(focus, unit));
      for (const cop of policeOfficers) closest = Math.min(closest, distance(focus, cop));
      const nearness = Number.isFinite(closest) ? clamp(1 - closest / 900, 0.15, 1) : 0.2;
      sirenClock = clamp(0.46 - state.wanted * 0.04, 0.22, 0.46);
      sirenPhase = !sirenPhase;
      const volume = (0.008 + nearness * 0.016) * state.settings.sfxVolume;
      playTone(sirenPhase ? 690 : 930, sirenClock * 0.92, "square", volume);
      playTone(sirenPhase ? 346 : 466, sirenClock * 0.9, "sawtooth", volume * 0.35, 0.02);
    }
    if (!state.inVehicle || station.id === "off") return;
    radioClock += dt;
    const beatLength = 60 / station.bpm / 2;
    const nextStep = Math.floor(radioClock / beatLength);
    if (nextStep === radioStep) return;
    radioStep = nextStep;
    const index = nextStep % station.lead.length;
    if (nextStep % 64 === 0 && station.tracks) {
      station.track = station.tracks[(nextStep / 64) % station.tracks.length];
      $("#radio-track").textContent = `${station.track} · ${radioDjLines[(nextStep / 64) % radioDjLines.length]}`;
      radioHudTimer = 4;
    }
    const volume = state.settings.radioVolume;
    playTone(midiFrequency(station.bass[index]), beatLength * 0.85, "square", 0.025 * volume);
    playTone(midiFrequency(station.lead[index]), beatLength * 0.62, station.wave, 0.018 * volume, beatLength * 0.08);
    if (index % 4 === 0) playTone(62, 0.045, "sawtooth", 0.018 * volume);
  }

  function updateJoystick(event) {
    const base = $("#joystick").getBoundingClientRect();
    const centerX = base.left + base.width / 2;
    const centerY = base.top + base.height / 2;
    const max = base.width * 0.28;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy);
    if (length > max) {
      dx = (dx / length) * max;
      dy = (dy / length) * max;
    }
    input.joystick.x = dx / max;
    input.joystick.y = dy / max;
    $("#joystick-knob").style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  function releaseJoystick(event) {
    if (event && joystickPointer !== null && event.pointerId !== joystickPointer) return;
    joystickPointer = null;
    input.joystick.x = 0;
    input.joystick.y = 0;
    $("#joystick-knob").style.transform = "translate(-50%, -50%)";
  }

  $("#joystick").addEventListener("pointerdown", (event) => {
    joystickPointer = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });
  $("#joystick").addEventListener("pointermove", (event) => {
    if (event.pointerId === joystickPointer) updateJoystick(event);
  });
  $("#joystick").addEventListener("pointerup", releaseJoystick);
  $("#joystick").addEventListener("pointercancel", releaseJoystick);

  const runButton = $("#run-btn");
  runButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    input.run = true;
    runButton.classList.add("pressed");
    runButton.setPointerCapture(event.pointerId);
  });
  const releaseRun = () => {
    input.run = false;
    runButton.classList.remove("pressed");
  };
  runButton.addEventListener("pointerup", releaseRun);
  runButton.addEventListener("pointercancel", releaseRun);
  $("#use-btn").addEventListener("pointerdown", (event) => { event.preventDefault(); interact(); });
  const punchButton = $("#punch-btn");
  punchButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    // Manejando este botón es el freno de mano; a pie, el madrazo.
    if (state.inVehicle) {
      input.handbrake = true;
      punchButton.classList.add("pressed");
    } else punch();
  });
  const releaseHandbrake = () => {
    input.handbrake = false;
    punchButton.classList.remove("pressed");
  };
  punchButton.addEventListener("pointerup", releaseHandbrake);
  punchButton.addEventListener("pointercancel", releaseHandbrake);

  window.addEventListener("keydown", (event) => {
    if (pendingBinding) {
      event.preventDefault();
      if (event.code !== "Escape") {
        state.settings.bindings[pendingBinding] = event.code;
        showHint(`${pendingBinding.toUpperCase()} ahora usa ${keyLabels[event.code] || event.code}`, 1400);
      }
      pendingBinding = null;
      updateKeyboardHelp();
      showPhoneApp("settings");
      saveGame();
      return;
    }
    const controlled = [...Object.values(state.settings.bindings), "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftRight"];
    if (controlled.includes(event.code)) event.preventDefault();
    if (event.repeat) {
      input.keys.add(event.code);
      return;
    }
    input.keys.add(event.code);
    if (event.code === state.settings.bindings.use) interact();
    if (event.code === state.settings.bindings.attack) {
      if (state.inVehicle) input.handbrake = true;
      else punch();
    }
    if (event.code === state.settings.bindings.weapon) cycleWeapon();
    if (event.code === state.settings.bindings.radio) cycleRadio();
    if (event.code === state.settings.bindings.phone || event.code === "Escape") {
      if (!$("#action-panel").classList.contains("hidden")) closePanel();
      else if ($("#phone").classList.contains("hidden")) openPhone();
      else closePhone();
    }
  });
  window.addEventListener("keyup", (event) => {
    input.keys.delete(event.code);
    if (event.code === state.settings.bindings.attack) input.handbrake = false;
  });
  window.addEventListener("blur", () => {
    input.keys.clear();
    input.run = false;
    input.handbrake = false;
    releaseJoystick();
  });

  $("#start-btn").addEventListener("click", () => {
    unstickCrowd();
    state.started = true;
    $("#start-screen").classList.add("dismissed");
    lastTime = performance.now();
    sound("phone");
  });
  $("#phone-btn").addEventListener("click", openPhone);
  $("#phone-close").addEventListener("click", closePhone);
  $("#resume-btn").addEventListener("click", closePhone);
  $("#panel-close").addEventListener("click", closePanel);
  $("#phone-apps").addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-phone-app]");
    if (!button) return;
    showPhoneApp(button.dataset.phoneApp);
  });
  $("#phone-app-view").addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-phone-action]");
    if (!button || button.disabled) return;
    phoneAction(button.dataset.phoneAction);
  });
  $("#restart-btn").addEventListener("click", () => {
    const confirmed = window.confirm("¿Reiniciar toda la historia de EVE GTA desde Que Stif se divierta?");
    if (confirmed) resetMission();
  });
  $("#sound-btn").addEventListener("click", () => {
    state.settings.muted = !state.settings.muted;
    $("#sound-btn").textContent = state.settings.muted ? "×" : "♪";
    $("#sound-btn").setAttribute("aria-label", state.settings.muted ? "Activar sonido" : "Silenciar sonido");
    if (!state.settings.muted) sound("phone");
    saveGame();
  });

  $("#save-import").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importSaveFile(file);
    event.target.value = "";
  });

  window.addEventListener("resize", resize);
  window.addEventListener("beforeunload", saveGame);

  if (window.__EVE_GTA_TESTING__) {
    window.__EVE_GTA_DEBUG__ = {
      state,
      POI,
      buildings,
      roads,
      residentialRoads,
      raceRoute,
      racers,
      skidMarks,
      hiddenPackages,
      input,
      pointOnRoad,
      rectTouchesRoad,
      policeOfficers,
      policeUnits,
      damageEve,
      recoverEve,
      currentTarget,
      nearbyInteraction,
      tutorialCholos,
      storyEnemies,
      npcs,
      raceRoute,
      urbanBuildings,
      roadIntersections,
      streetLights,
      traffic,
      acceptDidiOrder,
      handleDidiStop,
      grantWeapon,
      arrestEve,
      updateJail,
      updateStory,
      startCorralonMission,
      settleFedeReward,
      cityBlocked,
      lineOfSightBlocked,
      updateTraffic,
      updateNpcs,
      calculateGpsRoute,
      trafficMustStop,
      validateImportedSave,
      buildSaveData,
      updateWanted,
      raiseWanted,
      saveGame,
    };
  }
  loadGame();
  resize();
  updateKeyboardHelp();
  $("#sound-btn").textContent = state.settings.muted ? "×" : "♪";
  updateUi();
  updateCamera(1);
  requestAnimationFrame(loop);
})();
