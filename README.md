# Lab del curso

Un repositorio público donde cada persona del curso tiene **su propia carpeta** con **su proyecto**. Un mapa muestra todos los proyectos y **late cuando alguien cambia el suyo**.

- Mapa en vivo: https://lab.puaj.club
- Tu carpeta: `estudiantes/<tu-usuario-de-github>/` (en minúsculas)

## Cómo participar

Todos los caminos terminan igual: **un pull request** (una propuesta de cambio) con tu carpeta. Elegí el que te resulte más cómodo.

### Camino A: con un agente (el recomendado)

1. Creá tu cuenta gratis en https://github.com.
2. Abrí el agente que tengas (Antigravity, Codex, Claude Code u otro) en una carpeta vacía.
3. Pegale este pedido (cambiá `TU-USUARIO` por tu usuario de GitHub):

   > Quiero participar en el repositorio `3-ppp/lab`. Leé el archivo `AGENTS.md` y seguí sus reglas. Mi usuario de GitHub es `TU-USUARIO`. Hacé un fork, copiá `estudiantes/_plantilla` a `estudiantes/tu-usuario` (en minúsculas), ayudame a armar mi proyecto ahí y abrí un pull request.

4. Revisá lo que hizo el agente antes de aceptar cada paso. Vos decidís qué proyecto armar.

### Camino B: desde el navegador, sin instalar nada

1. Entrá a tu cuenta de GitHub y abrí `https://github.com/3-ppp/lab`.
2. Tocá **Add file → Create new file** (o **Upload files**).
3. Escribí el nombre del archivo con tu carpeta incluida, por ejemplo `estudiantes/tu-usuario/index.html`, y pegá el código que te dio tu chat. Repetí para `proyecto.json` (copiá el de `estudiantes/_plantilla`).
4. GitHub te va a ofrecer crear un *fork* y un *pull request*: aceptá y completá el título.

### Camino C: con git en tu compu

```bash
gh repo fork 3-ppp/lab --clone && cd lab
cp -r estudiantes/_plantilla estudiantes/tu-usuario
# armá tu proyecto, y después:
git add estudiantes/tu-usuario && git commit -m "Mi proyecto"
git push && gh pr create --fill
```

## Qué va en tu carpeta

| Archivo | Para qué |
|---|---|
| `index.html` | **Obligatorio.** La página principal de tu proyecto. |
| `proyecto.json` | Título, tu nombre y una descripción corta: es lo que se ve en el mapa. |
| otros `.css`, `.js`, imágenes | Lo que necesite tu proyecto. |

Tipos de archivo permitidos: `html`, `css`, `js`, `json`, `svg`, `png`, `jpg`, `gif`, `webp`, `ico`, `txt`, `md`, `woff`, `woff2`. Cada archivo, hasta 2 MB.

## Reglas

1. **Solo tocás tu carpeta.** Un pull request que modifique cualquier otra cosa se rechaza solo.
2. **Todo es público.** Cualquiera en internet puede ver, copiar y reutilizar lo que subas (licencia MIT). No subas datos personales tuyos ni de otras personas, contraseñas, claves de API, fotos ajenas ni nada que no quieras que se vea.
3. **Tu proyecto corre aislado.** Tu página se muestra dentro de una "caja" sin acceso a nada del sitio ni a datos del navegador. No puede guardar datos entre visitas.
4. **Convivencia.** Nada ofensivo ni engañoso. Si algo no corresponde, se saca.

## Qué pasa cuando abrís el pull request

Un robot revisa que solo hayas tocado `estudiantes/<tu-usuario>/` y que los tipos de archivo sean los permitidos. Si todo está bien, **se incorpora solo en un minuto** y tu cuadrado aparece (o late) en el mapa. Si algo está mal, el robot te deja un comentario explicando qué cambiar.

## Para el docente

- **Aplicación:** `server.js` + `public/` (sin dependencias, solo Node 20+). Lee `estudiantes/`, arma el mapa y avisa en vivo.
- **Local:** `node server.js` abre http://localhost:3000 con los proyectos de la carpeta. `POLL_MS=2000` para probar cambios rápido.
- **Producción:** `docker compose up -d --build` con `REPO_URL` definido. El contenedor clona el repo y trae los cambios cada 20 s (o al instante con el webhook de GitHub hacia `/hook`, con `WEBHOOK_SECRET`). Escucha solo en `127.0.0.1:3300`; un proxy publica el subdominio.
- **Seguridad:** los proyectos son código no confiable. Se sirven bajo `/p/<usuario>/` con `Content-Security-Policy: sandbox` (sin `allow-same-origin`), tipos de archivo permitidos, sin enlaces simbólicos y con tope de tamaño.
- **Robot de revisión:** `.github/workflows/revisar.yml`. Usa `pull_request_target` y **no descarga ni ejecuta el código del pull request**: solo lee la lista de archivos por la API.
