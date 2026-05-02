# Plan: Paridad Funcional SPA React/Vite con Legacy Vanilla

## Summary

El `index.html` actual es el entrypoint de Vite; la referencia funcional real del backend legacy está en `public/editor.html` + `public/app.js`. El objetivo será mantener una SPA React limpia, escalable y mejor diseñada, pero recuperar todas las capacidades útiles del legacy. El plan se documentará en `PLAN.md` con checklist ejecutable.

## Auditoría paridad SPA React/Vite vs legacy

Esta auditoría sirve como mapa de referencia entre la implementación React/Vite actual y el comportamiento funcional del editor legacy en `public/editor.html` + `public/app.js`.

### Objetivo

- Identificar qué capacidades del legacy ya existen, cuáles están degradadas y cuáles faltan por completo en la SPA actual.
- Priorizar el trabajo de recuperación funcional sin perder la base de UX moderna de React.
- Mantener este documento como fuente viva para ir tachando diferencias reales a medida que se implementan.

### Alcance

- Editor principal y su layout.
- Navegación por secciones y comportamiento de bloques.
- Paneles auxiliares como `Design Suggestions`, preview PDF y comparador.
- Flujo de biblioteca, autenticación y persistencia de estado.
- Paridad visual y funcional mínima con el editor legacy, no clon literal de la interfaz.

### Criterio de cierre

- Cada diferencia detectada debe terminar como tarea concreta o como decisión explícita de descarte.
- No se considera cerrada la auditoría hasta que el checklist refleje el estado real de la SPA y el legacy.

## Checklist De Problemas Detectados

- [ ] Añadir en `PLAN.md` una sección nueva: “Auditoría paridad SPA React/Vite vs legacy”.
- [x] El editor tiene márgenes laterales blancos sin sentido por mezcla entre `Shell max-width` y `editor-shell -m-4`.
- [x] El editor fuerza 3 columnas fijas y provoca overflow horizontal en desktop.
- [x] `Section Navigator` navega, refleja sección activa, cuenta bloques y soporta desktop/móvil sin duplicar títulos.
- [x] Botón cerrar de `Design Suggestions` no hace nada.
- [x] `Design Suggestions` no tiene botón de reapertura ni estado persistido como el legacy.
- [x] Miniaturas de diseño solo muestran 4 plantillas; falta `swiss`.
- [x] Panel de diseño tiene acción visible de “Personalizar” y abre `Design Suggestions` en la pestaña correcta.
- [ ] El editor visual React pierde estructura avanzada del markdown legacy: contactos, `###`, separadores, bloques entry/list/paragraph.
- [ ] El editor visual no soporta colapsar secciones, auto-resize cómodo ni drag & drop.
- [ ] El toolbar de formato solo funciona parcialmente y no comunica bien cuándo aplica a Markdown.
- [ ] La carga de ejemplos falla si no existe `*-example.md`; necesita fallback y aviso claro.
- [ ] Preview PDF puede quedar con scroll interno raro y controles de página sin validar páginas reales.
- [ ] La comparación de CV existe parcialmente, pero no tiene UX completa ni manejo cuando no hay CVs.
- [ ] Falta resizer entre editor y preview que sí existía en legacy.
- [ ] Falta guía interactiva/tour o sustituto React.
- [ ] Falta dark mode global o decisión explícita de retirarlo.
- [ ] Falta sincronización de estado local con `/api/auth/state` tras login como hacía el legacy.
- [ ] `/library` solo permite abrir CV al click; no hay acciones visibles.
- [ ] `/library` no permite editar metadata: nombre, estado, fecha, URL, descripción.
- [ ] `/library` no permite actualizar un CV guardado con el borrador actual.
- [ ] `/library` no permite eliminar CV con confirmación.
- [ ] `/library` no permite guardar nueva versión desde el flujo de biblioteca.
- [ ] `/library` no tiene vista kanban/lista equivalente ni paginación visible.
- [ ] `/library` muestra URLs largas rompiendo tarjetas y diseño.
- [ ] `/library` necesita mejor jerarquía visual, estados vacíos/loading/error y acciones por tarjeta.
- [ ] `/tracker` funciona, pero conviene verificar que estados coinciden con biblioteca y CVs.
- [x] Login React incluye “Continuar con Google”.
- [x] Callback `?auth=google_success/error` se procesa en React tras volver de Google.
- [ ] Botón cuenta no muestra email/estado con la riqueza del legacy.
- [ ] No hay tests de integración/componentes para editor, biblioteca, login Google ni preview.

## Key Changes

- [ ] Actualizar `PLAN.md` con este checklist y separar tareas por fase: layout, editor, biblioteca, auth, QA.
- [x] Ajustar layout React: quitar gutters externos, dejar editor full-width dentro del shell, hacer sidebars colapsables y evitar overflow horizontal.
- [x] Implementar `Section Navigator` con refs por sección, scroll/focus, active state por `IntersectionObserver`, conteo de bloques y soporte móvil.
- [x] Completar `Design Suggestions`: cerrar/reabrir, persistencia local, 5 plantillas, click sincronizado con `design.template`, y controles visibles de plantilla/color/fuente/tamaño/margen/iconos.
- [ ] Portar el modelo visual del legacy a un módulo React testable: parsear contactos, secciones, entries, listas y párrafos sin perder markdown al serializar.
- [ ] Rehacer `/library` como gestor real: tarjetas limpias, menú de acciones, abrir/cargar, editar metadata, actualizar contenido, eliminar, guardar nueva versión, filtros y vista lista/kanban si se mantiene separada del tracker.
- [x] Restaurar Google login en `AuthDialog`: botón “Continuar con Google”, redirigir a `/auth/google`, y procesar `auth=google_success/error` al volver.
- [ ] Añadir sync de estado autenticado usando `/api/auth/state` para que draft/diseño/modo sobrevivan como en legacy.
- [ ] Mantener `/tracker` sin reescritura grande; solo alinear estados, diseño y links con biblioteca.

## Public Interfaces / Types

- [ ] No se requieren endpoints backend nuevos: usar `/api/cvs`, `/api/auth/*`, `/auth/google`, `/api/auth/state`, `/api/preview.pdf`.
- [ ] Extender el API client con helpers para guardar estado remoto y, opcionalmente, una función `startGoogleLogin()` que redirija a `/auth/google`.
- [ ] Añadir tipos de editor visual: `VisualCvState`, `VisualSection`, `VisualBlock`, `VisualContact`.
- [ ] Mantener `CvSummary/Cv` actuales; solo usar todos sus campos en UI (`jobUrl`, `lastUsedDate`, `template`, `description`, `status`).

## Test Plan

- [ ] Unit tests del parser/serializer visual: contactos, `###`, listas, párrafos, separadores y roundtrip sin pérdida grave.
- [ ] Tests de `LibraryPage`: abrir CV, editar metadata, actualizar contenido, eliminar, filtros, estados vacíos.
- [ ] Tests de auth: botón Google construye redirección, callback success invalida sesión, callback error muestra aviso.
- [ ] Tests de editor: navigator hace scroll, design suggestions cambia plantilla, toolbar modifica selección, importar/descargar Markdown.
- [ ] Verificación manual/browser en 1440px, 1024px, 768px y móvil: sin márgenes laterales absurdos, sin overflow, preview usable.
- [ ] Ejecutar `npm run typecheck`, `npm run build`, `npm test` al final.

## Assumptions

- Se actualizará `PLAN.md`, no un archivo nuevo separado.
- El objetivo visual será “React limpio”: misma capacidad funcional que el legacy, sin copiar literalmente toda la UI vanilla.
- El legacy de referencia será `public/editor.html` + `public/app.js`, porque `index.html` ya pertenece a Vite.
- `/tracker` queda fuera de una refactorización profunda salvo ajustes de consistencia.
