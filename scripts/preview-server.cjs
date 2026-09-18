// Isolated development preview. Never points at the user's Docker database.
if (process.env.POSTGRES_DATABASE !== 'control_gastos_test')
  throw new Error('Preview requires the isolated test database');
process.env.SEED_ENABLED = 'true';
process.env.SEED_ORGANIZATION_SLUG = 'demo';
process.env.SEED_ORGANIZATION_NAME = 'Mi hogar';
process.env.SEED_ADMIN_NAME = 'Valentina Rossi';
process.env.SEED_ADMIN_EMAIL = 'demo@saturno.local';
process.env.SEED_ADMIN_PASSWORD = 'Saturno.demo2026';
const { DataSource } = require('typeorm');
const { NestFactory } = require('@nestjs/core');
const { databaseOptions } = require('../dist/budget/database');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/budget/configure-app');
const { User, Category } = require('../dist/budget/entities');
const { FinanceService } = require('../dist/budget/finance.service');
const { ExpensesService } = require('../dist/budget/expenses.service');
const { GoalsService } = require('../dist/budget/goals.service');
const { WorkspaceService } = require('../dist/budget/workspace.service');
const { today } = require('../dist/budget/calculations');
const { randomUUID } = require('node:crypto');
(async () => {
  const setup = new DataSource(databaseOptions());
  await setup.initialize();
  await setup.runMigrations();
  await setup.destroy();
  const app = await NestFactory.create(AppModule, {
    logger: ['warn', 'error'],
  });
  configureApp(app);
  await app.init();
  const db = app.get(DataSource),
    actor = await db.manager.findOneByOrFail(User, {
      email: 'demo@saturno.local',
    });
  const finance = app.get(FinanceService),
    expenses = app.get(ExpensesService),
    goals = app.get(GoalsService),
    workspace = app.get(WorkspaceService);
  const categories = await db.manager.findBy(Category, {
    organizationId: actor.organizationId,
  });
  const category = (name) => categories.find((c) => c.name === name).id;
  const month = today().slice(0, 7);
  const day = (n) =>
    month +
    '-' +
    String(Math.min(Number(today().slice(8)), n)).padStart(2, '0');
  const money = (amount, date) => ({
    amount,
    date,
    idempotencyKey: randomUUID(),
  });
  await finance.income(actor, {
    ...money(1350000, day(1)),
    source: 'Sueldo · Septiembre',
  });
  await finance.income(actor, {
    ...money(250000, day(5)),
    source: 'Proyecto freelance',
  });
  await finance.income(actor, {
    ...money(70000, day(8)),
    source: 'Transferencia de mamá',
  });
  const records = [
    {
      description: 'Alquiler del departamento',
      amount: 460000,
      categoryId: category('Vivienda'),
      kind: 'extra',
      dueDate: day(5),
      pay: true,
    },
    {
      description: 'Compra de supermercado',
      amount: 72500,
      categoryId: category('Alimentación'),
      kind: 'daily',
      dueDate: day(9),
      pay: true,
    },
    {
      description: 'Internet de casa',
      amount: 28500,
      categoryId: category('Servicios'),
      kind: 'extra',
      dueDate: day(10),
      pay: true,
    },
    {
      description: 'Una merienda con amigos',
      amount: 18500,
      categoryId: category('Gastos varios'),
      kind: 'daily',
      dueDate: day(12),
      pay: true,
    },
    {
      description: 'Servicios y expensas',
      amount: 132000,
      categoryId: category('Servicios'),
      kind: 'extra',
      dueDate: month + '-24',
      pay: false,
    },
    {
      description: 'Transporte del mes',
      amount: 45000,
      categoryId: category('Transporte'),
      kind: 'extra',
      dueDate: month + '-28',
      pay: false,
    },
  ];
  for (const { pay, ...dto } of records) {
    const e = await expenses.create(actor, dto);
    if (pay) await finance.pay(actor, e.id, money(dto.amount, dto.dueDate));
  }
  const iphone = await goals.create(actor, {
    name: 'Mi próximo iPhone',
    currency: 'USD',
    targetAmount: 700,
  });
  await goals.create(actor, {
    name: 'Mi primer auto',
    currency: 'USD',
    targetAmount: 15000,
  });
  const viaje = await goals.create(actor, {
    name: 'Una escapada al sur',
    currency: 'ARS',
    targetAmount: 600000,
    targetDate: '2027-01-15',
  });
  await finance.saving(actor, {
    ...money(300, day(11)),
    currency: 'USD',
    direction: 'deposit',
    exchangeRate: 1250,
    goalId: iphone.id,
    description: 'Un paso más para el iPhone',
  });
  await finance.saving(actor, {
    ...money(150000, day(13)),
    currency: 'ARS',
    direction: 'deposit',
    goalId: viaje.id,
    description: 'Fondo para el próximo viaje',
  });
  await expenses.createTemplate(actor, {
    description: 'Alquiler mensual',
    amount: 460000,
    categoryId: category('Vivienda'),
    dueDay: 5,
    startMonth: month,
  });
  await workspace.saveGroup(actor, { name: 'Casa · Valen y Juli' });
  await app.listen(3000, '127.0.0.1');
  console.log(
    'Preview API ready on http://127.0.0.1:3000 (isolated demo database)',
  );
  async function stop() {
    await app.close();
    process.exit(0);
  }
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
