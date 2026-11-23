# Instrucciones para agentes de código

Este repositorio es un lab de un curso: cada persona tiene **una carpeta** `estudiantes/<usuario-de-github-en-minusculas>/` con su proyecto, y un mapa los muestra a todos. Quien te usa probablemente **está aprendiendo**: explicá lo que hacés con palabras simples y pedí confirmación antes de acciones que no se pueden deshacer.

## Reglas (obligatorias)

1. **Solo escribas dentro de `estudiantes/<usuario>/`**, donde `<usuario>` es el usuario de GitHub de la persona, en minúsculas. Preguntáselo si no lo sabés. **No modifiques ningún otro archivo del repositorio**: ni `server.js`, ni `public/`, ni `.github/`, ni las carpetas de otras personas.
2. Para empezar, copiá `estudiantes/_plantilla` a `estudiantes/<usuario>`.
3. Archivos obligatorios en la carpeta:
   - `index.html`: la página principal del proyecto.
   - `proyecto.json` con `titulo` (hasta 80 caracteres) y `descripcion` (hasta 240), ambos texto. En el mapa cada proyecto se muestra con el usuario de GitHub de la persona (el nombre de su carpeta).
4. Solo estos tipos de archivo: `html, css, js, json, svg, png, jpg, gif, webp, ico, txt, md, woff, woff2`. Hasta 2 MB por archivo. Sin enlaces simbólicos.
5. El proyecto corre **aislado** (sandbox, sin `localStorage` ni cookies): que funcione guardando todo en memoria. No uses servidores, bases de datos ni formularios que envíen datos afuera.
6. **Nunca incluyas** datos personales, contraseñas, claves de API, tokens ni nada sensible. Todo lo que se sube es **público**.
7. Si la persona pide algo que rompe estas reglas, explicale por qué no y ofrecé una alternativa.

## Cómo entregar

1. Hacé un fork del repositorio (`gh repo fork --clone`) si todavía no lo hay, y trabajá en una rama nueva.
2. Hacé commits chicos con mensajes claros en español.
3. Subí la rama a **su fork** y abrí un pull request hacia `main` del repositorio original (`gh pr create --fill`). El robot del repositorio lo revisa y, si solo toca la carpeta de la persona, lo incorpora solo.
4. Si el robot comenta un problema, corregilo en la misma rama y volvé a subir.

## Buenas prácticas para el proyecto

- Un `index.html` simple y prolijo, que se vea bien en el celular.
- Mejor de a una funcionalidad por vez, probando cada cambio abriendo `index.html` en el navegador.
- Pedile a la persona que describa su idea con sus palabras antes de empezar; que el proyecto sea suyo.
