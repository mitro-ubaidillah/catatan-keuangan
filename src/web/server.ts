import express from "express";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { createSessionToken, verifySessionToken } from "./auth.js";
import { escapeHtml, layout } from "./templates.js";
import {
  ensureBootstrapSuperadmin,
  getAdminDashboardData,
  getUserDashboardData,
  loginWebUser,
  registerWebUser,
  toggleUserActive,
  updateUserRole
} from "./service.js";

type ReqWithSession = express.Request & {
  session?: { userId: string; role: string };
  cookies?: { session_token?: string };
};

function formatIdr(value: number): string {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function authMiddleware(req: ReqWithSession, res: express.Response, next: express.NextFunction) {
  const token = req.cookies?.session_token as string | undefined;
  const parsed = verifySessionToken(token);
  if (!parsed) return res.redirect("/login");
  req.session = { userId: parsed.userId, role: parsed.role };
  next();
}

function superadminOnly(req: ReqWithSession, res: express.Response, next: express.NextFunction) {
  if (!req.session || req.session.role !== "superadmin") return res.status(403).send("Forbidden");
  next();
}

function authLayout(params: {
  title: string;
  subtitle: string;
  formHtml: string;
  error?: string;
  footerHtml: string;
  formScript: string;
}) {
  return layout(
    params.title,
    `<div class="mx-auto max-w-md pt-8 sm:pt-14">
      <div class="rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-soft backdrop-blur">
        <p class="mb-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Bot Catat Keuangan</p>
        <h1 class="text-2xl font-bold tracking-tight text-ink">${escapeHtml(params.title)}</h1>
        <p class="mt-2 text-sm text-mist">${escapeHtml(params.subtitle)}</p>
        <p id="form-error" class="mt-3 text-sm font-medium text-red-600">${params.error ? escapeHtml(params.error) : ""}</p>
        ${params.formHtml}
        <div class="mt-4 text-sm text-slate-600">${params.footerHtml}</div>
      </div>
    </div>
    <script>${params.formScript}</script>`
  );
}

function loginPage(error?: string) {
  const formHtml = `<form id="auth-form" method="post" action="/login" class="mt-4 space-y-3">
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input class="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="email" name="email" required />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700">Password</label>
        <input class="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="password" name="password" required minlength="6" />
      </div>
      <button class="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700" type="submit">Masuk</button>
    </form>`;

  const script = `
    (() => {
      const form = document.getElementById('auth-form');
      const error = document.getElementById('form-error');
      form?.addEventListener('submit', (e) => {
        const email = form.querySelector('input[name="email"]').value.trim();
        const password = form.querySelector('input[name="password"]').value;
        if (!email || !password) {
          e.preventDefault();
          error.textContent = 'Email dan password wajib diisi.';
          return;
        }
        if (password.length < 6) {
          e.preventDefault();
          error.textContent = 'Password minimal 6 karakter.';
        }
      });
    })();
  `;

  return authLayout({
    title: "Login",
    subtitle: "Masuk ke dashboard keuangan personal kamu.",
    formHtml,
    error,
    footerHtml: `Belum punya akun? <a class="font-semibold text-blue-700 hover:underline" href="/register">Daftar</a>`,
    formScript: script
  });
}

function registerPage(error?: string) {
  const formHtml = `<form id="auth-form" method="post" action="/register" class="mt-4 space-y-3">
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700">Nama</label>
        <input class="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="text" name="displayName" required minlength="2" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input class="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="email" name="email" required />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700">Password</label>
        <input class="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="password" name="password" required minlength="6" />
      </div>
      <button class="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500" type="submit">Buat Akun</button>
    </form>`;

  const script = `
    (() => {
      const form = document.getElementById('auth-form');
      const error = document.getElementById('form-error');
      form?.addEventListener('submit', (e) => {
        const name = form.querySelector('input[name="displayName"]').value.trim();
        const email = form.querySelector('input[name="email"]').value.trim();
        const password = form.querySelector('input[name="password"]').value;
        if (name.length < 2) {
          e.preventDefault();
          error.textContent = 'Nama minimal 2 karakter.';
          return;
        }
        if (!email.includes('@')) {
          e.preventDefault();
          error.textContent = 'Format email tidak valid.';
          return;
        }
        if (password.length < 6) {
          e.preventDefault();
          error.textContent = 'Password minimal 6 karakter.';
        }
      });
    })();
  `;

  return authLayout({
    title: "Register",
    subtitle: "Daftar akun untuk mengakses dashboard keuangan.",
    formHtml,
    error,
    footerHtml: `Sudah punya akun? <a class="font-semibold text-blue-700 hover:underline" href="/login">Login</a>`,
    formScript: script
  });
}

export async function startWebServer() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(express.static("public"));
  app.use((req, _res, next) => {
    const cookie = req.headers.cookie ?? "";
    const match = cookie.match(/(?:^|;\s*)session_token=([^;]+)/);
    (req as ReqWithSession).cookies = { session_token: match?.[1] };
    next();
  });

  await ensureBootstrapSuperadmin(config.SUPERADMIN_EMAIL, config.SUPERADMIN_PASSWORD);

  app.get("/", (req: ReqWithSession, res) => {
    const token = req.cookies?.session_token as string | undefined;
    const parsed = verifySessionToken(token);
    if (!parsed) return res.redirect("/login");
    return res.redirect(parsed.role === "superadmin" ? "/admin" : "/dashboard");
  });

  app.get("/login", (_req, res) => res.send(loginPage()));
  app.post("/login", async (req, res) => {
    const email = String(req.body.email ?? "");
    const password = String(req.body.password ?? "");
    const user = await loginWebUser(email, password);

    if (!user) return res.status(401).send(loginPage("Email atau password salah."));
    if (user === "INACTIVE") return res.status(403).send(loginPage("Akun nonaktif. Hubungi admin."));

    const token = createSessionToken(user.id, user.role);
    res.setHeader("Set-Cookie", `session_token=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 14}; SameSite=Lax`);
    return res.redirect(user.role === "superadmin" ? "/admin" : "/dashboard");
  });

  app.get("/register", (_req, res) => res.send(registerPage()));
  app.post("/register", async (req, res) => {
    const displayName = String(req.body.displayName ?? "");
    const email = String(req.body.email ?? "");
    const password = String(req.body.password ?? "");

    if (displayName.length < 2) return res.status(400).send(registerPage("Nama minimal 2 karakter."));
    if (password.length < 6) return res.status(400).send(registerPage("Password minimal 6 karakter."));

    try {
      const user = await registerWebUser({ displayName, email, password });
      const token = createSessionToken(user.id, user.role);
      res.setHeader("Set-Cookie", `session_token=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 14}; SameSite=Lax`);
      return res.redirect("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "EMAIL_ALREADY_USED") return res.status(409).send(registerPage("Email sudah terdaftar."));
      return res.status(500).send(registerPage("Gagal mendaftarkan user."));
    }
  });

  app.post("/logout", (_req, res) => {
    res.setHeader("Set-Cookie", "session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    return res.redirect("/login");
  });

  app.get("/dashboard", authMiddleware, async (req: ReqWithSession, res) => {
    const data = await getUserDashboardData(req.session!.userId);
    if (!data) return res.redirect("/login");

    const txRows = data.monthTx.map((t) => `<tr class="border-b border-slate-100 text-sm">
      <td class="px-3 py-3">${new Date(t.date).toLocaleDateString("id-ID")}</td>
      <td class="px-3 py-3"><span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">${escapeHtml(t.type)}</span></td>
      <td class="px-3 py-3">${escapeHtml(t.category)}</td>
      <td class="px-3 py-3">${escapeHtml(t.description)}</td>
      <td class="px-3 py-3 font-semibold">${formatIdr(t.amount)}</td>
    </tr>`).join("");

    const assetRows = data.recentAssets.map((a) => `<tr class="border-b border-slate-100 text-sm">
      <td class="px-3 py-3">${new Date(a.lastUpdated).toLocaleDateString("id-ID")}</td>
      <td class="px-3 py-3 font-medium">${escapeHtml(a.name)}</td>
      <td class="px-3 py-3">${a.quantity} ${escapeHtml(a.unit)}</td>
      <td class="px-3 py-3 font-semibold">${formatIdr(a.currentPrice ?? a.buyPrice ?? 0)}</td>
    </tr>`).join("");

    const script = `
      (() => {
        const btn = document.getElementById('logout-btn');
        btn?.addEventListener('click', async () => {
          await fetch('/logout', { method: 'POST' });
          window.location.href = '/login';
        });
      })();
    `;

    return res.send(layout(
      "Dashboard User",
      `<div class="space-y-6">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-blue-700">User Dashboard</p>
              <h1 class="mt-1 text-2xl font-bold text-ink">Halo, ${escapeHtml(data.user.displayName)}</h1>
              <p class="mt-1 text-sm text-mist">${escapeHtml(data.user.email ?? "-")}</p>
            </div>
            <button id="logout-btn" class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">Logout</button>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Total transaksi</p><p class="mt-1 text-2xl font-bold">${data.stats.allTxCount}</p></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Total aset</p><p class="mt-1 text-2xl font-bold">${data.stats.allAssetCount}</p></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Pemasukan bulan ini</p><p class="mt-1 text-xl font-bold text-emerald-700">${formatIdr(data.stats.monthIncome)}</p></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Pengeluaran bulan ini</p><p class="mt-1 text-xl font-bold text-rose-700">${formatIdr(data.stats.monthExpense)}</p></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Saldo bulan ini</p><p class="mt-1 text-xl font-bold text-blue-700">${formatIdr(data.stats.monthBalance)}</p></div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 class="text-lg font-semibold">Transaksi Bulan Ini</h2>
          <div class="mt-3 overflow-x-auto">
            <table class="min-w-full">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th class="px-3 py-2">Tanggal</th><th class="px-3 py-2">Tipe</th><th class="px-3 py-2">Kategori</th><th class="px-3 py-2">Deskripsi</th><th class="px-3 py-2">Amount</th></tr></thead>
              <tbody>${txRows || '<tr><td colspan="5" class="px-3 py-4 text-sm text-slate-500">Belum ada data.</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 class="text-lg font-semibold">Aset Terbaru</h2>
          <div class="mt-3 overflow-x-auto">
            <table class="min-w-full">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th class="px-3 py-2">Update</th><th class="px-3 py-2">Nama</th><th class="px-3 py-2">Qty</th><th class="px-3 py-2">Harga</th></tr></thead>
              <tbody>${assetRows || '<tr><td colspan="4" class="px-3 py-4 text-sm text-slate-500">Belum ada data.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
      <script>${script}</script>`
    ));
  });

  app.get("/admin", authMiddleware, superadminOnly, async (_req, res) => {
    const data = await getAdminDashboardData();

    const userRows = data.users.map((u) => `<tr class="border-b border-slate-100 text-sm" data-name="${escapeHtml((u.displayName + ' ' + (u.email ?? '')).toLowerCase())}">
      <td class="px-3 py-3">${escapeHtml(u.displayName)}</td>
      <td class="px-3 py-3">${escapeHtml(u.email ?? "-")}</td>
      <td class="px-3 py-3">${escapeHtml(u.role)}</td>
      <td class="px-3 py-3">${u.isActive ? '<span class="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">active</span>' : '<span class="rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">inactive</span>'}</td>
      <td class="px-3 py-3">${u._count.transactions}</td>
      <td class="px-3 py-3">${u._count.assets}</td>
      <td class="px-3 py-3">
        <div class="flex flex-wrap gap-2">
          <button class="js-toggle rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400" data-id="${u.id}">${u.isActive ? "Disable" : "Enable"}</button>
          <button class="js-role rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700" data-id="${u.id}" data-role="${u.role === "superadmin" ? "user" : "superadmin"}">${u.role === "superadmin" ? "Make User" : "Make Admin"}</button>
        </div>
      </td>
    </tr>`).join("");

    const script = `
      (() => {
        const logoutBtn = document.getElementById('logout-btn');
        logoutBtn?.addEventListener('click', async () => {
          await fetch('/logout', { method: 'POST' });
          window.location.href = '/login';
        });

        const search = document.getElementById('user-search');
        const rows = Array.from(document.querySelectorAll('tbody tr[data-name]'));
        search?.addEventListener('input', () => {
          const q = (search.value || '').trim().toLowerCase();
          rows.forEach((row) => {
            row.style.display = row.dataset.name.includes(q) ? '' : 'none';
          });
        });

        async function post(url, body) {
          await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body
          });
          window.location.reload();
        }

        document.querySelectorAll('.js-toggle').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!id) return;
            if (!window.confirm('Ubah status user ini?')) return;
            await post('/admin/users/' + id + '/toggle-active', '');
          });
        });

        document.querySelectorAll('.js-role').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const role = btn.dataset.role;
            if (!id || !role) return;
            if (!window.confirm('Ubah role user ini?')) return;
            await post('/admin/users/' + id + '/role', 'role=' + encodeURIComponent(role));
          });
        });
      })();
    `;

    return res.send(layout(
      "Dashboard Superadmin",
      `<div class="space-y-6">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-blue-700">Superadmin</p>
              <h1 class="mt-1 text-2xl font-bold text-ink">Control Center</h1>
              <p class="mt-1 text-sm text-mist">Kelola user, role, dan kesehatan data.</p>
            </div>
            <button id="logout-btn" class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">Logout</button>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Total users</p><p class="mt-1 text-2xl font-bold">${data.users.length}</p></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Total transaksi</p><p class="mt-1 text-2xl font-bold">${data.txCount}</p></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Total aset</p><p class="mt-1 text-2xl font-bold">${data.assetCount}</p></div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-semibold">Manajemen User</h2>
            <input id="user-search" class="w-full max-w-xs rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Cari nama/email" />
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th class="px-3 py-2">Nama</th><th class="px-3 py-2">Email</th><th class="px-3 py-2">Role</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Tx</th><th class="px-3 py-2">Aset</th><th class="px-3 py-2">Aksi</th></tr></thead>
              <tbody>${userRows || '<tr><td colspan="7" class="px-3 py-4 text-sm text-slate-500">Belum ada user.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
      <script>${script}</script>`
    ));
  });

  app.post("/admin/users/:id/toggle-active", authMiddleware, superadminOnly, async (req, res) => {
    await toggleUserActive(String(req.params.id));
    if (req.headers["x-requested-with"] === "XMLHttpRequest") return res.json({ ok: true });
    return res.redirect("/admin");
  });

  app.post("/admin/users/:id/role", authMiddleware, superadminOnly, async (req, res) => {
    const role = String(req.body.role) === "superadmin" ? "superadmin" : "user";
    await updateUserRole(String(req.params.id), role);
    if (req.headers["x-requested-with"] === "XMLHttpRequest") return res.json({ ok: true });
    return res.redirect("/admin");
  });

  app.listen(config.WEB_PORT, () => {
    logger.info({ port: config.WEB_PORT }, "Web dashboard started");
  });
}
