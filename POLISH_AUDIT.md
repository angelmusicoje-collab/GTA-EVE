# Auditoría de pulido — EVE GTA

Fecha: **3 de septiembre de 2026**  
Versión evaluada: **0.5.1**

## Resultado ejecutivo

El tamaño del mundo ya es suficiente para esta etapa. El problema principal de la versión 0.3.0 no era la cantidad de metros, sino que muchos espacios entre puntos de interés funcionaban como explanadas: había calles y edificios importantes, pero faltaban lotes, frentes urbanos, obstáculos congruentes, tráfico físico y motivos visibles para que los peatones estuvieran ahí.

La versión 0.5.0 cierra los objetivos principales de esta auditoría: radio procedural publicable, variedad no centrada en combate, cuatro interiores nuevos, GPS vial, semáforos funcionales, controles configurables y respaldo portátil de partidas.

## Qué se cerró en 0.5.0

- Tres estaciones originales generadas con Web Audio y volúmenes separados de radio/efectos.
- Misiones de muestreo agrícola y seguimiento con sospecha, además de la campaña previa.
- Interiores reutilizables de La Marina, CBTis 19, banco y taller.
- Ruta A* con preferencia por calles, obstáculos y recálculo al desviarse.
- Tráfico que frena en rojo usando el mismo ciclo que las luces dibujadas.
- Remapeo de teclado, sensibilidades y exportación/importación JSON con migración de guardados.

## Qué se corrigió en 0.4.0

- Se generó una trama determinista de **75 edificios urbanos adicionales** sin invadir calles, estacionamientos, La Campana, el río, misiones ni accesos importantes.
- El suelo se organizó en Villa Norte, Centro, San Fernando y Periferia, con distintas mezclas de vivienda, departamentos, comercio, talleres y bodegas.
- Los edificios ahora tienen lote, banqueta o patio, acceso, sombras, azoteas, tinacos, equipos de aire, cortinas de taller, rótulos y distintas alturas visuales.
- Soriana, City Club, La Marina, CBTis 19, Agronomía y la gasolinera recibieron estacionamientos legibles; CBTis y Agronomía incluyen patios/canchas.
- Se añadieron cruces peatonales, semáforos visuales, flechas de carril, paradas de camión, alumbrado y halos nocturnos.
- El minimapa representa construcciones y el HUD anuncia el barrio al entrar.
- Hay 24 vehículos civiles con separación y frenado; ya chocan con Eve y afectan daño, salud y calificación de Didi.
- Los civiles tienen casa, trabajo, ocio, horario, ocupación, reacción al tráfico, separación de multitudes, memoria y conducta de huida.
- Las patrullas de búsqueda aparecen sobre vialidades, respetan edificios, no disparan a través de muros y colocan retenes sobre calles.
- Los disparos del jugador tampoco atraviesan construcciones.
- La dirección se estabilizó a alta velocidad y el terreno fuera del asfalto reduce agarre, aceleración y velocidad sin relacionarlo con el alcohol.
- Se añadió descarte por cámara para no dibujar toda la ciudad fuera de pantalla en cada cuadro.

## Criterio técnico usado

La estructura se basó en cuatro ideas verificables:

1. Un modelo urbano coherente parte de calles y deriva lotes y edificios, en vez de repartir cajas sin relación espacial. Es el principio central de [Procedural Modeling of Cities, Parish y Müller (SIGGRAPH)](https://dl.acm.org/doi/10.1145/383259.383292).
2. Una calle creíble no es solo una línea central: también contiene superficie, topología y objetos urbanos. [StreetGen](https://arxiv.org/abs/1801.05741) formula explícitamente esa combinación.
3. Los agentes parecen vivos cuando combinan metas con seguimiento, separación, huida y evasión de obstáculos. Esa composición proviene de [Steering Behaviors for Autonomous Characters, Craig Reynolds](https://www.red3d.com/cwr/steer/gdc99/).
4. Añadir detalle a un canvas exige limitar trabajo repetido y separar lo estático de lo dinámico. La guía oficial de [optimización de Canvas de MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) recomienda precalcular elementos repetidos, usar coordenadas enteras y trabajar por capas; en esta versión se aplicó descarte por cámara y se dejó la precocción por sectores como siguiente optimización si la densidad aumenta.

Para futuras ubicaciones se debe contrastar el mapa de referencia del proyecto con los [Programas de Desarrollo Urbano de Colima](https://www.col.gob.mx/seidum/contenido/NjYzOA%3D%3D), que distinguen reservas, usos y destinos, y con el [DENUE de INEGI](https://www.inegi.org.mx/app/mapa/denue/), que permite comprobar actividad económica y concentración de establecimientos. El objetivo sigue siendo una compresión jugable, no una reproducción catastral.

## Mejoras posteriores opcionales

| Prioridad | Sistema | Estado actual | Siguiente criterio de aceptación |
| --- | --- | --- | --- |
| P1 | Identidad sonora | Radio y efectos procedurales terminados. | Añadir ambiente por barrio, motor continuo ligado a RPM y sirenas estéreo. |
| P1 | Variedad de misiones | Muestreo y seguimiento ya rompen el patrón conducción/pelea. | Añadir rescate, defensa y decisiones con consecuencias persistentes. |
| P1 | Interiores sistémicos | Seis interiores transitables. | Sumar empeño y separos con NPC y horarios propios. |
| P1 | GPS vial | A* vial y recálculo terminados. | Ofrecer ruta rápida o discreta según nivel de búsqueda. |
| P0 | Combate legible | Hay daño, noqueo, muerte y cobertura por edificios; faltan animaciones y señales. | Anticipación de ataques, retroceso claro, recuperación visible, audio por material y mejor lectura de arma/rango. |
| P1 | Tráfico completo | Ya es físico, frena entre vehículos y obedece semáforos. | Ceder al peatón y reaccionar colectivamente a choques. |
| P1 | Percepción policial | Existe escalamiento, testigo nocturno y evasión de obstáculos. | Separar visión, audición, última posición conocida, descripción de vehículo y búsqueda por cuadrantes; conservar ubicación perfecta solo a cinco estrellas. |
| P1 | Eventos emergentes | Noticias, carreras y Didi dan actividad, pero el mundo cambia poco sin el jugador. | Choques civiles, tianguis, retenes aleatorios, fiestas, obras, vendedores y eventos por hora/barrio con límites para no estorbar la historia. |
| P1 | Progresión y balance | La economía tiene buenas reglas, pero falta telemetría de sesiones reales. | Registrar de forma local ingresos/gastos por fuente, tiempo para cada mejora y pérdidas; ajustar rifas/carreras sin tocar el canon. |
| P1 | Accesibilidad y controles | Remapeo y sensibilidad terminados. | Gamepad, escala de texto, alto contraste e intensidad de flash. |
| P1 | Partidas y respaldo | Guardado automático y exportación/importación terminados. | Ranuras y confirmación detallada antes de sobrescribir. |
| P2 | Clima y superficie | Existe ciclo de luz; no hay lluvia ni variación ambiental. | Lluvia ocasional con agarre distinto, charcos visuales y audio, sin convertir el clima en castigo constante. |
| P2 | Profundidad social | Rochi ya tiene economía, horario y deuda; los civiles no construyen relaciones. | Afinidad con personajes, llamadas contextuales, pequeños favores y memoria persistente solo para NPC relevantes. |

## Lo que no conviene priorizar todavía

- Agrandar el mapa antes de darle contenido a cada barrio.
- Multijugador o mundo compartido antes de estabilizar la simulación individual.
- Cientos de autos o peatones sin interacción, porque solo elevan el costo de renderizado.
- Decenas de armas con el mismo comportamiento; cada categoría nueva debe cambiar distancia, riesgo o estrategia.
- Clima, mascotas o coleccionables masivos antes de cerrar audio, interiores y variedad de misión.

## Riesgos de publicación

Antes de una distribución pública amplia o monetizada deben revisarse permisos de imagen/nombre de las personas reales, música, marcas de comercios y el uso público del nombre “GTA”. Esto no cambia el canon interno, pero sí necesita una decisión explícita antes de presentar el juego como producto comercial.

## Próximo corte recomendado: 0.5.0

Una versión 0.5.0 coherente debería incluir:

1. Grafo vial y GPS real.
2. Interior reutilizable de La Marina y CBTis 19.
3. Primera misión sin combate ligada a Agronomía.
4. Motor, ambiente urbano, sirenas y prototipo de radio sin material sin licencia.
5. Exportación e importación de partida.

Ese corte ampliaría la identidad del juego y su rejugabilidad más que otro crecimiento bruto del mapa.
