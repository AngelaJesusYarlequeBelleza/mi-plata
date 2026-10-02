# Mi Plata

App web personal para registrar ingresos, gastos y ahorro en soles, con presupuestos por categoría, seguimiento de deudas y meta de ahorro.

## Stack

| Capa | Tecnología |
|---|---|
| Front | HTML, CSS y JavaScript sin frameworks (PWA instalable en el celular) |
| Back | Supabase: API REST automática y autenticación con correo y contraseña |
| Base de datos | PostgreSQL con Row Level Security: cada usuaria solo ve sus propios datos |
| Hosting | GitHub Pages, que publica automáticamente con cada cambio en `main` |

## Modelo de datos

- `categorias`: categorías de gasto con su presupuesto mensual
- `movimientos`: cada ingreso, gasto o ahorro (tipo, monto, categoría o fuente, nota, fecha)
- `deudas`: el monto pagado se calcula sumando los gastos de la categoría asociada
- `metas`: la meta de ahorro
- `v_movimientos`: vista lista para Power BI, con el mes y el monto con signo

## Archivos

- `index.html`: estructura y estilos
- `app.js`: lógica de la app y conexión a Supabase
- `config.js`: URL del proyecto y clave pública (anon) de Supabase
