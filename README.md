# Saturno · Control de gastos

Backend NestJS para finanzas personales y grupos de una misma organización. El frontend está en ../frontend.

## Arranque con la base nueva

Requiere Node.js 22 y Docker. La configuración local .env conserva las credenciales existentes; el seed también reconoce SEED_USER_EMAIL / SEED_USER_PASSWORD del proyecto copiado. Para instalaciones nuevas, copiar .env.example a .env y configurar los secretos.

```powershell
npm ci
docker compose up -d
npm run migration:run
npm run start:dev
```

API: http://localhost:3000/api/v1 · Swagger: http://localhost:3000/docs

La base está aislada: **control_gastos**, contenedor **saturno_gastos_postgres**, puerto local **5437**, volumen **saturno_control_gastos_data**, proyecto Compose **saturno-control-gastos**. No se monta la antigua carpeta postgres ni se usa db_crud. El backend rechaza nombres de base ajenos a control_gastos / control_gastos_<entorno>.

El seed crea una organización, su administrador y seis categorías. Es idempotente, se serializa entre réplicas y no cambia credenciales, roles ni valores existentes. Todas sus inserciones se auditan. SEED_ENABLED=false lo desactiva.

## Arquitectura y patrones

- **Servicios de dominio:** WorkspaceService, ExpensesService, FinanceService, GoalsService, StatsService.
- **Policy / autorización:** AccessService resuelve el ámbito permitido. La organización proviene del usuario autenticado; los grupos requieren membresía. La sesión relee al usuario, por lo que una desactivación bloquea tokens ya emitidos.
- **Unit of Work:** transacciones con un bloqueo por organización. Cambios, saldos y auditoría se confirman juntos o se revierten juntos. Esta serialización prioriza consistencia; para volúmenes grandes se puede sustituir por bloqueos más específicos conservando el contrato.
- **Command / idempotencia:** FinanceService.command centraliza deduplicación, hash de payload, transacción, asiento y auditoría. Repetir una clave con otros datos devuelve 409.
- **Repository / Data Mapper:** repositorios TypeORM y entidades persistentes separados de los DTOs.
- **Políticas puras:** reparto por centavos, asignación por prioridades y recomendación de metas en calculations.ts.
- **Snapshots:** cada gasto mensual guarda precio, categoría, prioridad y reparto independientes de la plantilla.
- **Journal compensatorio:** cartera y ahorro son inmutables; las correcciones agregan movimientos. PostgreSQL protege también contra UPDATE/DELETE directos.
- **Read models:** estadísticas consultan una instantánea transaccional consistente, separadas de los comandos.

Los módulos antiguos se retiraron después de validar sus reemplazos. legacy-source-backup.zip conserva una copia local ignorada de los módulos migrados; no participa del build.

## Reglas de dinero

La cartera opera en ARS. Los importes API son números con hasta 2 decimales; los cálculos usan centavos enteros. Un gasto planificado reserva una obligación, pero el saldo cambia solo al registrar el pago. Los pagos parciales no pueden superar la parte del usuario. Los miembros de un grupo ven sus gastos compartidos, pero no las carteras o ingresos personales de otros miembros.

Los ingresos y pagos se corrigen mediante reverse, con fecha y motivo. El historial anterior a la reversión conserva el efecto original. No se admiten movimientos reales futuros ni saldos negativos al cierre de un día, incluyendo días posteriores a una inserción retroactiva.

Los ahorros se registran en ARS o USD:
- deposit: descuenta amount × exchangeRate de la cartera y aumenta el ahorro.
- withdraw: reduce el ahorro y suma a la cartera el valor a la tasa de venta informada.
- spend: compra de una meta desde el ahorro; no vuelve a descontar la cartera.
- Para ARS la tasa es 1. Para USD exchangeRate es obligatoria, manual y expresa ARS por USD. En una compra de meta expresa la valoración registrada.
- Cada usuario solo puede retirar o gastar su propia contribución, incluso en metas compartidas.
- El objetivo se elige al registrar cada movimiento. El ahorro sin objetivo se mantiene en una bolsa separada. Para trasladarlo a una meta se retira y se registra nuevamente con esa meta; no existe reasignación directa entre bolsas.
- Los saldos ARS y USD se muestran separados. No se aplica una cotización externa.

La recomendación cubre gastos pendientes del mes (incluidos vencidos) por prioridad descendente y vencimiento ascendente. El excedente se divide por defecto en 60% ahorro, 20% reserva y 20% libre, configurable por usuario. Las sugerencias no ejecutan movimientos.

## Metas

Cada meta tiene moneda, importe, propietario y grupo opcional. El progreso cuenta el ahorro asignado y lo ya gastado en esa meta, sin duplicar dinero entre objetivos.

Para recomendar la compra, el ahorro asignado debe alcanzar. Además, debe quedar el mayor entre:
1. lo asignado a otras metas del mismo ámbito y moneda;
2. el valor de la meta × porcentaje de margen × número de otras metas activas del mismo ámbito.

Margen inicial: 25% por otra meta, configurable. Una meta de USD 700 sin otras metas puede recomendarse al tener USD 700 asignados. Con otra meta requiere al menos USD 875 de ahorro en ese ámbito; con dos, USD 1.050. Tener USD 1.300 puede habilitar la compra si no compromete asignaciones mayores a otros objetivos. Las metas compartidas usan el ámbito del grupo y la política de su creador. No se mezclan monedas.

Llegar al 100% **no** marca la meta comprada. Se registra spend y luego se confirma complete; el backend exige compras por el valor de la meta. Cancelar conserva historial y permite retirar aportes restantes.

## API principal

Todas las rutas salvo login requieren Bearer JWT. Prefijo /api/v1. El usuario y la organización se deducen de la sesión; no se aceptan IDs de organización desde el cliente.

| Recurso | Operaciones |
|---|---|
| auth | POST login, GET profile |
| organizations | GET/PATCH me |
| users | GET, POST (admin), GET/PATCH me, PATCH :id (admin) |
| groups | GET/POST, PATCH :id, GET :id/members, POST :id/invitations |
| group-invitations | GET propias, POST :id/respond |
| categories, tags | GET; POST/PATCH :id para administradores |
| expense-templates | GET/POST/PATCH :id, POST :id/generate con month |
| expenses | GET/POST, GET :id, POST :id/payments, POST :id/cancel |
| payments | POST :id/reverse |
| incomes | GET/POST, POST :id/reverse |
| wallet | GET movements |
| savings | GET/POST movements |
| goals | GET/POST, GET/PATCH :id, POST :id/complete o :id/cancel |
| stats | GET dashboard |
| audit-logs | GET, solo lectura |

Listados: page y limit (máximo 100). Movimientos: dateFrom/dateTo o month. Gastos: month, rango de vencimientos, groupId; userId requiere un grupo compartido cuando apunta a otro integrante. Metas: groupId y userId (propietario); las fechas filtran la fecha objetivo. Directorio de usuarios siempre dentro de la organización. Ingresos, cartera y ahorros individuales rechazan groupId y userId ajenos. Estadísticas de grupo exponen solo obligaciones y pagos del grupo. Auditoría: usuarios ven sus propias acciones; administradores, las de su organización, con filtros userId, resource y fechas.

### Ejemplo de ahorro

```json
{
  "amount": 100,
  "currency": "USD",
  "direction": "deposit",
  "exchangeRate": 1250,
  "goalId": 1,
  "date": "2026-09-15",
  "description": "Aporte para el viaje",
  "idempotencyKey": "7318a862-fac8-4809-9224-1f5b06d44f71"
}
```

La clave UUID v4 debe conservarse al reintentar la misma operación. Todos los ingresos, pagos, reversiones y movimientos de ahorro la requieren.

## Pruebas y vista de ejemplo

```powershell
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e
npm run preview
```

Las pruebas levantan PostgreSQL embebido en una carpeta .test-postgres, independiente del Docker. El preview usa datos ficticios en una base temporal e inicia la API en 3000. Cuenta exclusiva del preview: demo@saturno.local / Saturno.demo2026. No ejecutar el preview si ya hay otro backend en 3000.

No son credenciales del seed de trabajo. Los datos de preview se descartan al cambiar de base temporal. El seed normal crea solo organización, administrador y categorías, sin gastos o ingresos ficticios.

