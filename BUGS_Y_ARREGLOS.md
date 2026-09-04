# Bugs encontrados y arreglados

Bitácora de esta reparación. Cada entrada dice **qué estaba mal**, **por qué
pasaba** y **cómo quedó**. Al final está lo que quedó pendiente, sin adornos.

---

## 1. La patrulla te arrestaba de un roce (el bug que rompía el juego)

**Qué pasaba.** En cuanto una patrulla te tocaba, pantalla de separos. No había
pelea, no había forma de escapar a pie, no había nada. El juego se acababa al
primer contacto.

**Por qué.** En `updateWanted()` había esto:

```js
if (dist < 35 && Math.abs(state.inVehicle ? activeVehicle().speed : 0) < 95) {
  arrestEve("La patrulla alcanzó a Eve");
  return;
}
```

Distancia menor a 35 y velocidad baja = arresto inmediato. A pie tu velocidad
siempre cuenta como 0, así que **cualquier** contacto a pie te mandaba a los
separos.

**Cómo quedó.** El contacto ahora es un atropellón: hace daño según la
velocidad de la patrulla, te avienta hacia atrás, abolla tu vehículo y suelta
partículas. Ya no arresta. A los separos se llega **solo** con la vida en cero,
por `recoverEve()`.

Hay una prueba de regresión que pone una patrulla encima de Eve y falla si el
juego la arresta.

---

## 2. El retén también era un game over instantáneo

**Qué pasaba.** Chocar contra un retén a menos de 105 de velocidad = arresto.

**Por qué.** Mismo patrón: `if (Math.abs(vehicle.speed) < 105) arrestEve(...)`.

**Cómo quedó.** El retén siempre estrella: te frena en seco, te quita vida y
daña el vehículo. Si vas lento te frena más y te sugiere bajarte a correr. Nunca
arresta.

---

## 3. La policía casi no peleaba

**Qué pasaba.** Los policías solo disparaban a partir de 3 estrellas. Con 1 y 2
estrellas su única mecánica era acercarse y arrestarte (ver bug 1). No existían
policías a pie: eran patrullas flotando.

**Cómo quedó.**

- Disparan desde 1 estrella. La puntería, el daño, el alcance y la cadencia
  escalan con las estrellas (`policeSkill()`), así que a 1 estrella son torpes a
  propósito y a 5 son un problema real.
- Los disparos que fallan pegan en el piso, no se los come el aire.
- **Policías a pie**: cuando Eve va a pie y una patrulla se acerca, bajan uno o
  dos oficiales. Te persiguen, se plantan a distancia de tiro, gritan y se
  pueden noquear o matar como cualquier otro NPC.
- Las patrullas frenan al acercarse en vez de empotrarse encima de ti.

---

## 4. Las patrullas se apilaban en el mismo pixel

**Qué pasaba.** Todas las unidades perseguían la misma coordenada, así que
terminaban una encima de otra y parecían un solo carro.

**Cómo quedó.** Se les agregó separación entre unidades: si dos quedan a menos
de 82 de distancia, se empujan al elegir rumbo.

---

## 5. Después de sobornar, los policías a pie te seguían balaceando

**Qué pasaba.** `bribePolice()` vaciaba `policeUnits` pero no los oficiales a
pie ni los retenes. Pagabas y te seguían disparando.

**Cómo quedó.** El soborno limpia patrullas, oficiales y retenes. Y ahora
también se puede sobornar estando junto a un policía a pie, no solo junto a una
patrulla.

---

## 6. Los NPC atravesaban paredes en vertical

**Qué pasaba.** Civiles, enemigos y policías se metían por dentro de los
edificios al moverse en diagonal.

**Por qué.** En `moveTowardWithAvoidance()` la colisión se probaba en un solo
eje pero se aplicaba en los dos:

```js
if (!cityBlocked(entity.x + dx, entity.y, radius, true)) {
  entity.x += dx;
  entity.y += dy;   // <- nadie verificó este eje
}
```

**Cómo quedó.** Cada eje se prueba y se aplica por separado, como ya lo hacía
`moveCircle()` para Eve.

---

## 7. Veintidós edificios estaban plantados encima de las avenidas

**Qué pasaba.** El tráfico "pasaba por dentro" de la Casa de Eve, del Pelícano y
de otros. Se veían carros circulando sobre las azoteas. La ciudad estaba
construida encima de sí misma.

**Por qué.** Las coordenadas de los edificios y las de las calles se escribieron
a mano por separado y nadie verificó que no se cruzaran. Estaban encimados
`soriana`, `cityclub`, `kfc`, `little`, `eve-house`, `barbacoa`, `local-b`,
`local-c`, `pelicano`, `jardin`, `empeno`, `marina`, `arrancones`, `agronomia` y
más.

**Cómo quedó.** Un pase de reacomodo al arrancar que, para cada edificio
encimado, busca en 16 direcciones el desplazamiento más chico que lo deja fuera
de la calle **y** sin encimarse con otro edificio. Si el edificio es tan grande
que no cabe entre dos avenidas (Soriana, City Club, Agronomía), se le permite
encoger hasta un 30%.

Hay una prueba de regresión que falla si cualquier edificio con nombre queda
sobre una calle.

---

## 8. Las calles residenciales se trazaban encima de los edificios

**Qué pasaba.** Las calles chicas se generaban con coordenadas fijas en bucle,
sin revisar nada, y varias cruzaban edificios.

**Cómo quedó (primera pasada).** Se descartaban al arrancar las que cruzaban un
edificio con nombre.

**Cómo quedó (definitivo).** Al rehacer la red vial esto se invirtió: ahora la
cuadrícula es el diseño y los edificios son los que se acomodan. Borrar calles
dejaba la ciudad sin trazado (llegó a quedarse con 2 calles secundarias de 16).
Solo un edificio grande que no cabe de ninguna forma se come las callecitas que
le queden debajo, y jamás una avenida con nombre.

---

## 9. Los lugares de las misiones apuntaban a coordenadas huérfanas

**Qué pasaba.** Consecuencia de los bugs 7 y 8: los puntos de interés (`POI`)
están escritos aparte de los edificios. Al mover un edificio, su puerta, su
mostrador y su marcador de misión se quedaban donde estaban.

**Cómo quedó.** El reacomodo guarda el desplazamiento de cada edificio y se lo
aplica a sus `POI` ligados, al punto donde aparece Eve, a su troca y a Stif,
Rochi y Fede.

---

## 10. Las válvulas de la misión de Agronomía quedaban fuera del campus

**Qué pasaba.** `startAgronomiaMission()` creaba las cuatro muestras en
coordenadas fijas escritas a mano. Si el campus se movía, las válvulas se
quedaban en el aire y la misión no se podía terminar.

**Cómo quedó.** Las cuatro salen de las esquinas del propio campus.

---

## 11. Atacar a puñetazos desde el vehículo (corrección de una nota anterior)

**Aviso.** Una versión anterior de este documento decía que `attack()` disparaba
desde una posición vieja de Eve al ir manejando. **Eso era falso** y queda
corregido aquí: `updateTruck()` termina con `state.player.x = vehicle.x`, así
que la posición sí está sincronizada cuadro a cuadro. No había tal bug.

**Lo que sí estaba mal.** Se podía pulsar PEGAR manejando y el juego intentaba
resolver un puñetazo con alcance de 40 desde dentro de la troca, que nunca
llega a nadie: gastaba el enfriamiento del ataque sin avisar por qué no pasaba
nada.

**Cómo quedó.** A puñetazos desde el carro te dice que te bajes. Con arma de
fuego sí se dispara, tomando explícitamente el vehículo como origen y el rumbo
del cofre como dirección, en vez de depender de que la sincronización de
`state.player` ocurra antes.

---

## 12. La barra de vida se veía vacía

**Qué pasaba.** Las tres barras del HUD aparecían como una rayita.

**Por qué.** `.bar-track` medía 9px de alto con 2px de relleno y borde, y con
`box-sizing: border-box` el relleno se quedaba en 3px. Al engrosar el borde para
el estilo de pixeles se quedó en 1px.

**Cómo quedó.** Pista de 15px sin relleno interno.

---

## 13. El teléfono tenía texto negro sobre fondo negro

**Qué pasaba.** Al oscurecer la carcasa del celular, todo el menú quedó
ilegible.

**Por qué.** La regla original traía `background: #e8e4d8; color: #111318` (un
celular claro con letra oscura). Se cambió el fondo y se olvidó el color.

**Cómo quedó.** Color de texto claro sobre la carcasa oscura, la app
seleccionada en ácido con texto negro, y el botón de reiniciar historia con
fondo propio en vez de transparente.

---

## 14. `state.shake` era código muerto

**Qué pasaba.** La sacudida de cámara estaba programada pero nadie la activaba
nunca.

**Cómo quedó.** Se dispara al recibir daño, al disparar un arma de fuego, al
destruir un vehículo y al llevarse un retén.

---

## 15. Las partidas viejas podían dejarte atorado dentro de una pared

**Qué pasaba.** Consecuencia del bug 7: una partida guardada antes del
reacomodo tiene coordenadas de la ciudad anterior, y al cargarla Eve podía
aparecer dentro de un edificio que se movió.

**Cómo quedó.** Al cargar se revisa a Eve, la troca, el carro robado y los
personajes; a quien quede dentro de geometría se le busca el hueco libre más
cercano en espiral. Si movió a Eve, te lo dice.

---

## 16. Las pruebas fijaban coordenadas del mundo a mano

**Qué pasaba.** `tests/runtime-smoke.mjs` teletransportaba al jugador a
coordenadas escritas a mano (`2828, 1418` para el Pelícano, etc.). Cualquier
cambio de trazado rompía las pruebas aunque el juego estuviera bien.

**Cómo quedó.** Las pruebas leen los `POI` vivos desde el hook de depuración.
Se agregaron regresiones para: ningún edificio sobre una calle, la patrulla no
arresta de un roce, y morir sí manda a los separos.

---

# Lo que cambió de aspecto

No eran bugs, era que se veía mal. Queda anotado por si quieres saber qué se
tocó.

- **El juego no era de pixeles.** Se dibujaba con vectores suavizados a
  resolución completa. Ahora el canvas trabaja a 300px de alto y el CSS lo
  estira sin suavizado. De ahí sale el pixel gordo de verdad.
- **El texto era Arial estirado.** Se escribió una fuente de mapa de bits de
  5x7 dentro del juego. Los letreros del mundo se pintan al final, en espacio de
  pantalla, y solo cuando estás cerca: antes tapaban medio mapa.
- **Las calles eran una raya gris.** Ahora traen banqueta con losetas,
  guarnición, desgaste de carril, raya central, orilla, mugre, parches y topes.
- **Los edificios eran rectángulos planos.** Ahora traen bisel, pretil,
  ventanas que se prenden de noche, tinacos, antenas, tendederos con ropa,
  domos, cajas de escalera y tres estilos distintos de fachada.
- **La banqueta estaba vacía.** Se agregaron puestos de tacos, tienditas,
  bardas con grafiti, bancas, botes y carros estacionados, todos filtrados para
  que no caigan encima de un edificio.
- **Todos los personajes eran el mismo rectángulo de distinto color.** Ahora
  cada quien trae complexión, peinado, tono de piel, ropa y accesorios. Eve
  tiene pelo largo café oscuro y playera gris; Rochi, pelo negro alborotado,
  playera verde arena con estampado y complexión más ancha.
- **La cámara estaba lejísimos.** Más zoom, con adelanto según hacia dónde vas.
- **La portada era negro vacío.** Cielo de atardecer en bandas planas y dos
  capas de silueta de ciudad.
- **La interfaz se sentía plana.** Bordes gruesos, bisel y sombra dura en
  paneles, botones, minimapa, joystick y teléfono.
- **Todo abría menús.** Rifas El Aferrado, Empeño Volcán y la tienda de la
  gasolinera ahora son lugares donde se entra caminando. Cada interior tiene
  dependiente con nombre y frase atrás del mostrador, mercancía en las repisas y
  la salida marcada en el piso.
- **La ciudad estaba despoblada.** De 93 a 179 construcciones y de 64 a 120
  civiles.

---

# Lo que NO se hizo

Para que no haya sorpresas:

- **Los arrancones siguen abriendo un panel** para la inscripción y la apuesta.
  No tiene caseta con interior. Se puede hacer, no se hizo.
- **Didi, banco por celular, cámara y ajustes siguen siendo pantallas de
  teléfono.** Ahí un menú es lo correcto, no se tocó la estructura.
- **El audio no se tocó.** Sigue siendo la música procedural de 8 bits que ya
  estaba.
- **El minimapa sigue siendo simple.** Funciona, pero no recibió el mismo pase
  de arte que el mundo.
- **No hay animación de caminado por cuadros.** Las piernas se mueven con una
  onda, no con una hoja de sprites.
- **Los interiores comparten un mismo cuarto de 900x650.** Cambian piso,
  muebles y dependiente, pero la planta es la misma.
- **No hay multijugador ni sincronización entre dispositivos.** Igual que antes:
  se exporta e importa el JSON desde Ajustes.

---

# Segunda ronda: la ciudad no se podía manejar

El trazado seguía sin servir para correr, perseguir ni trasladarse. Estas son
las entradas de esa ronda.

---

## 17. El trazado de calles no estaba pensado para el volante

**Qué pasaba.** Las 19 vialidades eran polilíneas dibujadas a ojo. Se cruzaban
en ángulos rasantes (donde dos calles casi paralelas se encimaban por cientos
de unidades), se cortaban a media cuadra sin conectar con nada, y no había un
solo tramo recto largo. Manejar era chocar contra esquinas raras.

**Cómo quedó.** Red generada con tres piezas, cada una para una cosa concreta:

- **Tercer Anillo Periférico**: un circuito cerrado de 196 de ancho. Se le da
  la vuelta completa sin frenar. Sirve para las carreras y para huir a fondo.
- **Cinco ejes horizontales y cinco verticales** que van de lado a lado del
  mapa y se cruzan casi a escuadra. Rectas largas para rebasar, esquinas
  limpias para derrapar.
- **Av. Tecnológico** en diagonal, cruzando a unos 35 grados, para tener una
  línea de carrera que una cuadrícula pura no da.
- **Cuadrícula secundaria** de calles angostas a media cuadra, para meterse y
  perder a la patrulla.

Cada eje lleva una ondulación de ±22 para no parecer trazado con regla, sin
perder el cruce a escuadra.

---

## 18. Los índices de calles estaban escritos a mano

**Qué pasaba.** El tráfico se repartía con la lista `[0, 0, 1, 1, 2, 4, 13, 14,
15, 17, 18, 5, ...]` y las patrullas con `[0, 1, 4, 13, 14, 15]`. Son índices
crudos al arreglo de calles. Al cambiar el trazado apuntaban a calles
inexistentes.

**Cómo quedó.** Ambos se derivan del tamaño del arreglo.

---

## 19. La ruta de arrancones no seguía ninguna calle

**Qué pasaba.** `raceRoute` eran siete puntos sueltos por el mapa. La "carrera"
te mandaba a cruzar terreno y edificios.

**Cómo quedó.** Doce metas repartidas sobre el anillo periférico: una vuelta
completa al circuito.

---

## 20. `pathPosition()` recalculaba el largo de cada calle en cada llamada

**Qué pasaba.** La función que ubica un punto sobre una calle recorría todos los
tramos midiendo distancias **cada vez**. Se llama miles de veces por cuadro:
tráfico, patrullas, dibujo del asfalto, mugre, banquetas y props.

**Cómo quedó.** Las longitudes se calculan una vez por calle y se guardan en el
propio objeto.

---

## 21. `updateTraffic()` creaba 64 arreglos por cuadro

**Qué pasaba.** Para saber a qué distancia iba el carro de adelante hacía
`Math.min(...traffic.map(...))`, o sea un arreglo nuevo por cada carro, por cada
cuadro.

**Cómo quedó.** Un bucle simple sin asignar memoria.

---

## 22. Los edificios se sembraban sin saber dónde estaban las calles

**Qué pasaba.** Las construcciones urbanas se colocaban sobre una retícula fija
por barrio y luego se descartaban las que caían sobre asfalto. Con el trazado
nuevo se descartaba casi todo: quedaban baldíos enormes y solo 63
construcciones.

**Cómo quedó.** Las manzanas se derivan del propio trazado (se toman las líneas
de calle y se arma el rectángulo entre dos consecutivas), y cada manzana se
llena de lotes hacia adentro. De 63 a 159 construcciones, todas de frente a una
calle.

Además el grano cambia por manzana: unas de casitas apretadas, otras de bodegas
grandes. Antes todas salían del mismo tamaño y la ciudad se veía fotocopiada.

---

## 23. El margen de las manzanas era fijo aunque las calles no

**Qué pasaba.** Al armar las manzanas se dejaba una separación fija de 46
unidades a cada lado. Pero una avenida mide 196 de ancho: su media anchura sola
son 98. Las manzanas quedaban encima del asfalto y se rechazaban.

**Cómo quedó.** Cada línea de calle guarda su media anchura real y la manzana se
recorta con ella.

---

## 24. El tráfico circulaba sobre el camellón

**Qué pasaba.** Los carros se colocaban justo sobre el eje de la calle, o sea
por el centro exacto, encima de la línea divisoria.

**Cómo quedó.** Cada carro toma su carril según el sentido en el que va.

---

## 25. Nunca te topabas un carro

**Qué pasaba.** 34 vehículos repartidos parejo en un mapa de 6400x4200 daban un
carro cada varios cientos de metros. Las avenidas se veían desiertas.

**Cómo quedó.** 64 vehículos y, sobre todo, reciclado: el que se aleja más de
1250 unidades reaparece en una calle a 340-900 de Eve. Siempre hay tráfico
donde estás sin simular cientos de carros.

---

## 26. Los cruces se pintaban como una cuadrícula blanca

**Qué pasaba.** En cada intersección se dibujaban dos cebras del ancho completo,
una encima de la otra. El resultado era un tablero de ajedrez blanco sobre la
esquina, con el camellón y las rayas de carril atravesándolo.

**Cómo quedó.** El cruce se dibuja como plancha de asfalto que tapa camellón y
rayas, más una cebra y su raya de alto por cada acceso, y semáforo en dos
esquinas.

---

# Lo que cambió de aspecto en la segunda ronda

- **Más pixeles.** La resolución interna subió de 300 a 432 de alto. Mismo borde
  duro, bastante más detalle.
- **El asfalto ahora se lee.** Antes era una banda gris con una raya. Ahora
  lleva orilla blanca continua, divisiones de carril discontinuas (una, dos o
  tres por sentido según el ancho), desgaste donde pasan las llantas, y las
  avenidas anchas traen camellón con pasto.
- **La cámara se abre al acelerar.** A pie se ven 470 unidades de alto; a fondo
  llega a 760, para ver la curva que viene. Era imposible correr viendo tan
  poco.
