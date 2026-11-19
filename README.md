# DCYM — Dron Control y Monitoreo

Plataforma de monitoreo de ganado con drones e inteligencia artificial: detecta y cuenta cada res en tiempo real y permite gestionar las fincas monitoreadas.

**Demo en vivo:** https://dcym.conectamunicipio.com

Proyecto integrador de la asignatura **Electiva Profesional II** — Programa de Ingeniería de Sistemas, Universidad del Sinú (Montería, Córdoba).

**Integrantes:** Sebastián Montalvo · Jesús Arévalo Martínez · Jhonatan Gómez · Juan Pablo Restrepo

---

## Problema

Córdoba tiene más de 2,4 millones de cabezas de ganado bovino (UPRA, 2023), y en la mayoría de fincas el conteo se hace a caballo y a ojo. Los potreros son extensos, revisarlos toma horas y el inventario nunca está al día; cuando un animal se pierde o es hurtado, el ganadero se entera días después. DCYM busca que el ganadero sepa cuántas reses tiene y dónde están, sin recorrer la finca.

## Módulos

### Módulo 1 — Gestión de fincas (CRUD)
Registro de las fincas monitoreadas: nombre, municipio, hectáreas, reses declaradas y propietario.

- Crear, consultar (listado, detalle y búsqueda), actualizar y eliminar con confirmación.
- Totales del hato registrado: fincas, reses y hectáreas.
- Validaciones en el navegador y en el servidor (respuesta `422` con el error de cada campo).
- Persistencia en **SQLite**. Todas las operaciones exigen sesión (`401` sin ella).

| Método | Ruta | Operación |
|---|---|---|
| `GET` | `/api/fincas?q=` | Listar y buscar |
| `GET` | `/api/fincas/{id}` | Consultar una finca |
| `POST` | `/api/fincas` | Crear |
| `PUT` | `/api/fincas/{id}` | Actualizar |
| `DELETE` | `/api/fincas/{id}` | Eliminar |

### Módulo 2 — Monitoreo en vivo con IA
- **Autenticación** con sesión cifrada en cookie; rutas y API protegidas.
- **API externa (Roboflow):** el celular que hace de dron envía fotogramas al servidor, que los pasa por el modelo de visión por computador y devuelve las detecciones. La llave nunca llega al navegador.
- **Tiempo real (WebSocket):** imagen y detecciones se reenvían a todos los paneles conectados.
- **Panel de estadísticas:** conteo total del hato, drones activos, eventos y cambio en vivo del modelo y la sensibilidad.
- Fusión de detecciones superpuestas (IoU) para no contar dos veces el mismo animal.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Diseño | Figma |
| Frontend | HTML5, CSS3, JavaScript (Fetch API, WebSocket) |
| Backend | Python 3, FastAPI, Uvicorn |
| Base de datos | SQLite |
| Inteligencia artificial | Roboflow (modelo propio DCYM v2 y COCO) |
| Servidor | Ubuntu, Apache (proxy inverso + TLS), systemd |

## Estructura

```
├── app.py            Aplicación FastAPI: rutas, sesión, WebSocket y detección
├── fincas.py         Módulo 1: CRUD de fincas (SQLite + validaciones)
├── static/
│   ├── index.html    Portada e inicio de sesión
│   ├── app.html      Centro de control
│   ├── fincas.html   Gestión de fincas
│   ├── dron.html     Modo dron (cámara del celular)
│   ├── panel.html    Centro de monitoreo
│   ├── modelo.html   Información del modelo
│   ├── evidencias.html
│   ├── css/          Sistema de diseño
│   └── js/
├── deploy/           Publicación en subdominio con HTTPS
├── requirements.txt
└── .env.example
```

## Instalación

```bash
git clone https://github.com/montalvo3435-hub/dcym.git
cd dcym
python3 -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env          # completar ROBOFLOW_API_KEY, usuario y contraseña
set -a && . ./.env && set +a
venv/bin/uvicorn app:app --port 8100
```

Abrir `http://localhost:8100`. La base de datos se crea sola en `data/dcym.db`.

> El **modo dron** usa la cámara del celular, y los navegadores solo la permiten en **HTTPS**. Para probarlo desde un teléfono hay que desplegar con certificado (ver `deploy/setup_subdominio.sh`).

## Despliegue

En producción la app corre como servicio **systemd** con usuario sin privilegios y sistema de archivos en solo lectura salvo `data/`. **Apache** hace de proxy inverso (incluido el WebSocket en `/ws/`) con certificado de **Let's Encrypt**.
