# Oficina virtual de Green Interlink

Un equipo de agentes de IA con jerarquía, departamentos, tareas y comunicación interna.
Lo ves y lo diriges desde una oficina visual en el navegador.

## Qué hay dentro

| Pieza | Qué hace |
|---|---|
| **Oficina** | Planta con una sala por departamento y un puesto por agente, con su cara, cargo, extensión y estado (libre o trabajando). La centralita muestra la actividad en directo. |
| **Tareas** | Tablero con las columnas Pendiente → En curso → Esperando tu aprobación → Bloqueada → Hecha. |
| **CRM** | El CRM propio de Green Interlink: negocios, empresas, contactos e historial. |
| **Tu bandeja** | Lo que necesita tu decisión: aprobaciones, borradores listos para enviar desde tus cuentas y mensajes del equipo. |
| **Actividad** | Conversaciones internas entre agentes y registro completo. |

## El equipo inicial

```
Raúl Jiménez · CEO
└── Elena Ríos · Directora General
    ├── Marco Salinas · Director Comercial
    │   └── Sofía Navarro · Prospección comercial
    ├── Lucía Ferrer · Directora de Marketing
    │   ├── Diego Ortega · Contenido y redes sociales
    │   └── Andrés Vidal · Web y SEO
    ├── Carmen Molina · Operaciones y sostenibilidad
    ├── Isabel Montero · Asesora legal y cumplimiento
    ├── Javier Castro · Director Financiero
    └── Pablo Herrera · Analista de mejora continua
```

## Cómo trabajan

- Cada agente tiene un rol, unas responsabilidades, una personalidad y un responsable.
- **Jerarquía real:** un agente solo asigna tareas a quien le reporta. Para pedir algo a otro departamento, escribe a su responsable.
- **Comunicación interna:** se escriben mensajes entre ellos. Cada agente los lee en su siguiente turno de trabajo.
- **Tú decides:** precios, ofertas, publicaciones, contactos externos y contrataciones pasan por tu bandeja. Nada sale de la empresa sin tu aprobación.
- **Tus cuentas, tu voz:** los mensajes de LinkedIn, las publicaciones de Instagram y los emails llegan como borradores. Tú los copias y los envías. Así no infringes las condiciones de LinkedIn ni de Instagram, que prohíben las cuentas falsas y la automatización de perfiles personales.
- **Búsqueda web:** los agentes investigan empresas, normativa y palabras clave con fuentes citadas.
- **Control de gasto:** hay un límite de turnos al día y un botón para pausar la oficina.

## El CRM

Diseñado para una sola cosa: **crear negocios y cerrarlos**.

- **Negocios:** un tablero por etapas (Nuevo → Contactado → Reunión → Propuesta → Negociación → Ganado / Perdido). Arrastra las tarjetas para moverlas de etapa. Cada tarjeta muestra el valor, el responsable y el **próximo paso**, en rojo si está vencido o falta.
- **Cifras clave arriba:** negocios abiertos, previsión ponderada según la etapa, ganado este mes, tasa de cierre y próximos pasos vencidos.
- **Cerrar un negocio:** en su ficha, «Marcar como ganado» o «Marcar como perdido». Al perderlo se elige un motivo, que sirve después para aprender por qué se pierden ventas.
- **Empresas y contactos:** buscador rápido, filtro por tipo (cliente, prospecto…) y por **tiempo sin actividad** para encontrar clientes dormidos que reactivar.
- **Historial:** cada llamada, email, reunión o nota queda en la ficha de la empresa y del negocio.
- **Bajas respetadas:** los contactos que se dieron de baja aparecen como «No contactar» y los agentes no les escriben.

Los agentes trabajan sobre el mismo CRM: buscan antes de crear, abren negocios, anotan cada contacto y mantienen los próximos pasos. **Solo tú marcas un negocio como ganado o perdido.**

Los datos se guardan en `data/crm.db` (SQLite), que aguanta decenas de miles de registros sin instalar nada más. Haz copia de seguridad de la carpeta `data/`.

### Traer tu base de HubSpot

Se hace una vez y funciona con el plan gratuito de HubSpot. Trae empresas, contactos (con su estado de baja), negocios y notas.

1. En HubSpot: **Configuración → Integraciones → Aplicaciones privadas**, y al crear elige **«Use Service Keys instead»** (clave de servicio). Es la opción que HubSpot recomienda; las «legacy private apps» también funcionan, pero ya no reciben mejoras.
2. Ponle un nombre (por ejemplo «Oficina Green Interlink») y marca solo permisos de lectura: `crm.objects.companies.read`, `crm.objects.contacts.read` y `crm.objects.deals.read`.
3. Copia la clave y pégala en `.env` como `HUBSPOT_TOKEN=...`. Trátala como una contraseña: no la compartas ni la subas a GitHub (el archivo `.env` ya está excluido).
4. Ejecuta `npm run importar-hubspot`, o pulsa «Importar desde HubSpot» en la pestaña CRM.

Repetir la importación no duplica nada: actualiza lo que ya existe. Las etapas de los negocios de HubSpot se traducen a las nuestras según su probabilidad. Una vez importada la base, el CRM de la oficina pasa a ser el de referencia: borra la clave de servicio en HubSpot y quítala del `.env`.

## Hacer crecer el equipo

El equipo no es fijo. Puedes ampliarlo de dos formas:

1. **Tú mismo:** pulsa **Incorporar agente**. Eliges nombre, cargo, departamento (existente o nuevo), responsable, responsabilidades, nivel de esfuerzo y aspecto de su cara. Empieza a trabajar en el siguiente ciclo.
2. **A propuesta del equipo:** cualquier agente que detecte trabajo sin cubrir puede proponer una contratación. Te llega a la bandeja con el motivo y, si la apruebas, el agente se crea automáticamente.

Desde la ficha de cada agente también puedes editarlo o darlo de baja. Al darlo de baja se conserva su historial y su equipo pasa a depender de su responsable.

Todo el equipo se guarda en `config/equipo.json`, que también puedes editar a mano.

## Puesta en marcha

Necesitas [Node.js 22.13 o superior](https://nodejs.org) y una clave de la API de Claude ([platform.claude.com](https://platform.claude.com)).

```bash
cd green-interlink-agents
npm install
cp .env.example .env      # y pega tu clave en ANTHROPIC_API_KEY
npm start
```

Abre http://localhost:4000. Sin clave, la oficina se abre en **modo vista**: puedes recorrerla y preparar tareas, pero los agentes no trabajan.

### Primeros pasos recomendados

1. Completa `config/empresa.md`, sobre todo los apartados marcados con **[COMPLETAR]**. Es la memoria de empresa que leen todos los agentes.
2. Asigna a Elena una primera tarea, por ejemplo: *"Prepara el plan de las próximas 4 semanas para conseguir 10 reuniones con instaladores y operadores"*.
3. Importa tu base de HubSpot y pide a Marco: *"Revisa los clientes sin actividad en 6 meses y propón un plan de reactivación"*.
4. Revisa **Tu bandeja** un par de veces al día: aprueba, rechaza con comentario y envía los borradores.

## Demostración sin servidor

`node scripts/construir-demo.mjs` genera `demo/oficina-demo.html`, una versión de la oficina con datos de ejemplo que funciona sin servidor. Sirve para enseñarla.

## Estructura

```
config/equipo.json     organigrama, roles y aspecto de cada agente
config/empresa.md      memoria de empresa compartida
src/server.js          servidor web y API de la oficina
src/agentes.js         turno de trabajo de un agente y sus herramientas
src/orquestador.js     decide quién trabaja y cuándo
src/equipo.js          altas, cambios y bajas de agentes y departamentos
src/store.js           estado de la oficina (tareas, mensajes, aprobaciones…) en data/estado.json
src/crm.js             CRM: empresas, contactos, negocios y actividades en data/crm.db
src/hubspot.js         importación desde HubSpot
public/                interfaz de la oficina
```

## Próximas fases

- **Publicación directa con APIs oficiales:** la página de empresa de LinkedIn y una cuenta de empresa de Instagram (Meta Graph API), siempre tras tu aprobación.
- **Email y calendario:** enviar desde la cuenta de la empresa y proponer reuniones.
- **Fotos realistas:** añade `"foto": "avatares/elena.png"` a un agente en `config/equipo.json` y guarda la imagen en `public/avatares/`.
- **Informes automáticos:** resumen semanal de Elena y retrospectiva de Pablo programados.
