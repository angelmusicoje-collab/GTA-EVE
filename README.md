# EVE GTA

Sandbox urbano 2D cenital para navegador, ambientado en una versión comprimida y jugable de Colima/Villa de Álvarez. Conserva la lectura visual de los primeros GTA, controles móviles y humor local.

**Versión actual:** 0.6.0. Incluye el tutorial completo, cinco misiones de historia, el encargo del corralón, interiores jugables, radio procedural y navegación vial.

## Novedades de la 0.6.0

- **La policía ya no te arresta de un roce.** Ahora te dispara y te embiste; a
  los separos se llega solo con la vida en cero. Bajan oficiales a pie de las
  patrullas.
- **Se ve de pixeles de verdad.** El canvas trabaja a baja resolución y se
  estira sin suavizado, con fuente de mapa de bits propia.
- **Calles, edificios y banquetas redibujados** con volumen, textura, ventanas
  que se prenden de noche, tinacos, puestos y carros estacionados.
- **Los personajes se distinguen.** Eve y Rochi tienen complexión, peinado y
  ropa propios; los civiles se generan con variantes.
- **Rifas, empeño y la tienda de la gasolinera** dejaron de ser menús: se entra
  caminando y hay dependiente atrás del mostrador.
- **Se reacomodó la ciudad.** Había 22 edificios plantados encima de avenidas.

`BUGS_Y_ARREGLOS.md` tiene la bitácora completa de qué estaba roto, por qué y
cómo quedó, además de lo que quedó pendiente.

## Lo que ya funciona

- Mapa de 6400 × 4200 con vialidades conectadas, La Campana, Jardín del Pisto, El Pelícano, La Marina San Fernando, CBTis 19, Agronomía, separos, corralón, banco, taller, gasolinera, empeño y arrancones.
- Trama urbana por barrios con 75 construcciones adicionales, usos de suelo diferenciados, lotes, banquetas, estacionamientos, azoteas, comercios, talleres, cruces, paradas de camión y alumbrado nocturno.
- Tutorial de Stif: Jardín → Pelícano → cajero → rifa → empeño → tuning → carrera → pelea → huida → Rochi.
- Misión 2 “Recupera el auto de Fede”: pelea por el Nissan Sentra 2000, entrega bajo persecución obligatoria de dos estrellas y reparto visible de la recompensa con Rochi.
- Misión 3 “Faltistas”: visita al interior del CBTis 19 y pelea contra los profesores que quieren confiscar los certificados de Eve y Rochi.
- Misión 4 “La tesis no se riega sola”: trabajo de agronomía sin combate, con cuatro muestras de riego distribuidas por el campus.
- Misión 5 “Rochi sí trae”: seguimiento con distancia y sospecha desde La Marina hasta el banco.
- Encargo “Recupera la moto de Rochi”: robo dentro del corralón y huida perdible de cuatro estrellas.
- Cinemáticas dentro del mapa: la acción se congela y el diálogo avanza con retratos y cajas de texto.
- Eve a pie, camioneta persistente verde/beige, tuning, combustible, daño, reparación y vehículos civiles robables.
- Combate con noqueo y muerte diferenciados; puños, piedra, manopla, botella, pistola y metralleta. Las armas de fuego solo aparecen en rifas o enemigos/policías.
- NPC con casa, trabajo, ocio, horario, memoria, separación de multitudes, reacción al tráfico, frases, huida, defensa y dinero recuperable al noquearlos.
- Tráfico físico de 24 vehículos con semáforos sincronizados, frenado entre autos, colisiones y consecuencias para daño, manejo y calificación de Didi.
- Policía de cinco estrellas que dispara desde la primera, con oficiales a pie que bajan de la patrulla, puntería y cadencia que escalan por estrella, soborno a una estrella, patrullaje nocturno reforzado, retenes que estrellan sin arrestar, y separos durante 10 segundos solo al morir, con confiscación de armas y pérdida de la mitad del efectivo.
- Economía separada entre efectivo y banco, cajeros, rifas con valor esperado negativo, empeño y premios vendibles.
- Arrancones con inscripción, apuestas de podio, ruta por aros y persecuciones que no cancelan la carrera.
- Didi Comida mediante la cuenta de Rochi, calificación con tacos, propinas pequeñas, comisión y penalizaciones por retrasos/choques.
- Horario de Rochi, préstamos con posible impago, saldo secreto y viaje opcional a su casa antes de dormir.
- Caguamas para vida/blindaje, Takis Fuego para energía temporal y riesgo policial al mostrar alcohol de noche.
- Interiores propios para La Marina, CBTis 19, banco y Taller El Volcán, además de Casa de Eve y El Pelícano.
- GPS A* que prioriza calles, evita edificios, recalcula la ruta cuando Eve se desvía y muestra calle/distancia en el HUD.
- Radio en la camioneta con tres estaciones y música original procedural de 8 bits: cumbia/banda, barrio y pop-rock. Incluye motor continuo, ambiente por hora y cambio rápido de estación; no usa pistas comerciales ni requiere internet.
- Controles reasignables, sensibilidad táctil y de dirección, volumen separado para efectos y radio.
- Teléfono con misión, GPS, mochila, Didi, rifas, banco, noticias falsas, cámara, radio y ajustes.
- Día completo de 24 horas en 20 minutos reales, guardado automático independiente por navegador, exportación/importación JSON y migración de partidas 0.2–0.4.

La campaña y los sistemas principales ya forman una versión completa y autocontenida. No hay multijugador ni sincronización automática entre dispositivos; para mover el avance se exporta el JSON desde Ajustes y se importa en el otro navegador.

## Ejecutar localmente

```bash
npm start
```

Abre `http://localhost:8080`.

## Controles

| Acción | Teclado | Pantalla táctil |
| --- | --- | --- |
| Mover / conducir | WASD o flechas | Palanca rosa |
| Usar / entrar / salir | E | USAR |
| Correr / acelerar | Shift | CORRER / ACELERAR |
| Atacar | Espacio | ATACAR |
| Cambiar arma | Q | Mochila del celular |
| Cambiar estación | R | Aplicación Radio |
| Celular | P o Escape | Botón amarillo |

## GitHub y EasyPanel

```bash
git init
git add .
git commit -m "EVE GTA v0.5.1"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/eve-gta.git
git push -u origin main
```

En EasyPanel crea una **App**, conecta el repositorio, elige la rama `main`, usa el método **Dockerfile** y expón el puerto interno `80`. Después asigna el dominio y activa HTTPS.

Para levantarlo manualmente en un VPS:

```bash
git clone URL-DE-TU-REPOSITORIO
cd eve-gta
docker compose up -d --build
```

El `docker-compose.yml` publica el juego en el puerto `8080`.

## Verificación

```bash
npm test
```

`GAME_BIBLE.md` es la fuente de verdad del canon. `BUGS_Y_ARREGLOS.md` lleva la bitácora de bugs. `POLISH_AUDIT.md` conserva la investigación, los problemas detectados y el orden recomendado de desarrollo para que el proyecto no vuelva a depender de un chat.
