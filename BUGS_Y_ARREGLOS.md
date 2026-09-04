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

**Cómo quedó.** Se descartan al arrancar las que cruzan un edificio con nombre.

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

## 11. Disparar desde el vehículo salía del lugar equivocado

**Qué pasaba.** `attack()` usaba siempre `state.player.x/y` y
`state.player.angle`. Manejando, la posición de Eve a pie no se actualiza: se
queda donde te subiste. Así que los balazos salían de donde te habías subido al
carro, a veces manzanas atrás.

**Cómo quedó.** Manejando, el disparo sale del vehículo y apunta hacia donde va
el cofre. A puñetazos desde el carro ya no se intenta nada: te dice que te
bajes. El empujón de `hitNpc()` usa el mismo ángulo corregido.

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
