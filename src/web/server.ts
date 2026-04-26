import express from "express";
import dayjs from "dayjs";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../services/db.js";
import { createSessionToken, verifySessionToken } from "./auth.js";
import { escapeHtml, layout } from "./templates.js";
import {
  completeOnboarding,
  ensureBootstrapSuperadmin,
  getAdminDashboardData,
  getOnboardingTokenData,
  getUserDashboardData,
  hasActiveSubscription,
  loginWebUser,
  registerWebUser,
  restoreSoftDeletedUserByAdmin,
  softDeleteUserByAdmin,
  toggleUserActive,
  updateUserRole,
  updateUserSubscription
} from "./service.js";

type ReqWithSession = express.Request & {
  session?: { userId: string; role: string };
  cookies?: { session_token?: string };
};

function formatIdr(value: number): string {
  return `Rp${value.toLocaleString("id-ID")}`;
}

async function authMiddleware(req: ReqWithSession, res: express.Response, next: express.NextFunction) {
  const token = req.cookies?.session_token as string | undefined;
  const parsed = verifySessionToken(token);
  if (!parsed) return res.redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
  if (!user || user.deletedAt || !user.isActive) {
    res.setHeader("Set-Cookie", "session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    return res.redirect("/login");
  }
  req.session = { userId: parsed.userId, role: user.role };
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
        <p class="mb-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Finance Dashboard</p>
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

function onboardingPage(params: {
  token: string;
  displayName: string;
  telegramId?: string | null;
  error?: string;
}) {
  const formHtml = `<form id="onboard-form" method="post" action="/onboarding/${escapeHtml(params.token)}" class="mt-4 space-y-3">
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700">Nama</label>
        <input class="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="text" name="displayName" value="${escapeHtml(params.displayName)}" required minlength="2" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input class="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="email" name="email" required />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700">Password</label>
        <input class="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="password" name="password" required minlength="6" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700">Konfirmasi Password</label>
        <input class="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="password" name="confirmPassword" required minlength="6" />
      </div>
      <button class="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500" type="submit">Selesaikan Registrasi</button>
    </form>`;

  const script = `
    (() => {
      const form = document.getElementById('onboard-form');
      const error = document.getElementById('form-error');
      form?.addEventListener('submit', (e) => {
        const email = form.querySelector('input[name="email"]').value.trim();
        const password = form.querySelector('input[name="password"]').value;
        const confirm = form.querySelector('input[name="confirmPassword"]').value;
        if (!email.includes('@')) {
          e.preventDefault();
          error.textContent = 'Email tidak valid.';
          return;
        }
        if (password.length < 6) {
          e.preventDefault();
          error.textContent = 'Password minimal 6 karakter.';
          return;
        }
        if (password !== confirm) {
          e.preventDefault();
          error.textContent = 'Konfirmasi password tidak sama.';
        }
      });
    })();
  `;

  return authLayout({
    title: "Konfirmasi Registrasi",
    subtitle: params.telegramId
      ? `Akun Telegram: ${params.telegramId}. Lengkapi data berikut untuk aktivasi web dashboard.`
      : "Lengkapi data berikut untuk aktivasi web dashboard.",
    formHtml,
    error: params.error,
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
    if (user === "DELETED") return res.status(403).send(loginPage("Akun sudah dihapus. Hubungi superadmin."));

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

  app.get("/onboarding/:token", async (req, res) => {
    const token = String(req.params.token);
    const tokenData = await getOnboardingTokenData(token);
    if (!tokenData) return res.status(404).send(loginPage("Link onboarding tidak ditemukan."));
    if (tokenData.usedAt) return res.status(400).send(loginPage("Link onboarding sudah digunakan. Silakan login."));
    if (tokenData.expiresAt.getTime() < Date.now()) return res.status(400).send(loginPage("Link onboarding sudah expired. Minta link baru lewat Telegram."));

    return res.send(onboardingPage({
      token,
      displayName: tokenData.user.displayName,
      telegramId: tokenData.user.telegramId
    }));
  });

  app.post("/onboarding/:token", async (req, res) => {
    const token = String(req.params.token);
    const displayName = String(req.body.displayName ?? "");
    const email = String(req.body.email ?? "");
    const password = String(req.body.password ?? "");
    const confirmPassword = String(req.body.confirmPassword ?? "");

    if (displayName.trim().length < 2) {
      return res.status(400).send(onboardingPage({ token, displayName, error: "Nama minimal 2 karakter." }));
    }
    if (password.length < 6) {
      return res.status(400).send(onboardingPage({ token, displayName, error: "Password minimal 6 karakter." }));
    }
    if (password !== confirmPassword) {
      return res.status(400).send(onboardingPage({ token, displayName, error: "Konfirmasi password tidak sama." }));
    }

    try {
      const user = await completeOnboarding({ token, displayName, email, password });
      const session = createSessionToken(user.id, user.role);
      res.setHeader("Set-Cookie", `session_token=${session}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 14}; SameSite=Lax`);
      return res.redirect(user.role === "superadmin" ? "/admin" : "/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "EMAIL_ALREADY_USED") {
        return res.status(409).send(onboardingPage({ token, displayName, error: "Email sudah digunakan." }));
      }
      if (message === "ONBOARDING_TOKEN_EXPIRED") {
        return res.status(400).send(loginPage("Link onboarding expired. Minta link baru lewat Telegram."));
      }
      if (message === "ONBOARDING_TOKEN_USED") {
        return res.status(400).send(loginPage("Link onboarding sudah dipakai. Silakan login."));
      }
      return res.status(500).send(onboardingPage({ token, displayName, error: "Gagal menyelesaikan onboarding." }));
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
              <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span class="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">Plan: ${escapeHtml(data.user.subscriptionPlan)}</span>
                <span class="rounded-full ${data.subscriptionActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"} px-2.5 py-1 font-semibold">
                  ${data.subscriptionActive ? "Subscription Active" : "Subscription Inactive"}
                </span>
                <span class="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                  Exp: ${data.user.subscriptionEndsAt ? dayjs(data.user.subscriptionEndsAt).format("DD MMM YYYY") : "No expiry"}
                </span>
              </div>
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

    const monthBuckets: { key: string; label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const m = dayjs().subtract(i, "month");
      monthBuckets.push({
        key: m.format("YYYY-MM"),
        label: m.format("MMM YY"),
        count: 0
      });
    }
    for (const u of data.users) {
      const key = dayjs(u.createdAt).format("YYYY-MM");
      const bucket = monthBuckets.find((b) => b.key === key);
      if (bucket) bucket.count += 1;
    }

    const activities = [
      ...data.lastUsers.map((u) => ({
        at: u.createdAt,
        actor: u.displayName,
        type: "register_user",
        detail: `User baru terdaftar (${u.email ?? "-"})`
      })),
      ...data.lastTx.map((t) => ({
        at: t.createdAt,
        actor: t.user.displayName,
        type: "create_transaction",
        detail: `${t.type} ${formatIdr(t.amount)} - ${t.description}`
      })),
      ...data.lastAssets.map((a) => ({
        at: a.createdAt,
        actor: a.user.displayName,
        type: "create_asset",
        detail: `Aset ${a.name} (${a.quantity} ${a.unit})`
      }))
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 20);
    const deletedUsersCount = data.users.filter((u) => Boolean(u.deletedAt)).length;

    const userRows = data.users.map((u) => `<tr class="border-b border-slate-100 text-sm" data-name="${escapeHtml((u.displayName + ' ' + (u.email ?? '')).toLowerCase())}">
      <td class="px-3 py-3">${escapeHtml(u.displayName)}</td>
      <td class="px-3 py-3">${escapeHtml(u.email ?? "-")}</td>
      <td class="px-3 py-3">${escapeHtml(u.role)}</td>
      <td class="px-3 py-3">
        ${
          u.role === "superadmin"
            ? '<span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">N/A (superadmin)</span>'
            : `<div class="flex flex-col gap-1">
                <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 w-fit">${escapeHtml(u.subscriptionPlan)}</span>
                <span class="rounded-full ${hasActiveSubscription(u) ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"} px-2 py-1 text-xs font-semibold w-fit">${escapeHtml(u.subscriptionStatus)}</span>
                <span class="text-xs text-mist">${u.subscriptionEndsAt ? dayjs(u.subscriptionEndsAt).format("DD MMM YYYY") : "No expiry"}</span>
              </div>`
        }
      </td>
      <td class="px-3 py-3">${
        u.deletedAt
          ? `<div class="flex flex-col gap-1">
              <span class="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 w-fit">deleted</span>
              <span class="text-xs text-mist">${dayjs(u.deletedAt).format("DD MMM YYYY HH:mm")}</span>
            </div>`
          : u.isActive
            ? '<span class="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">active</span>'
            : '<span class="rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">inactive</span>'
      }</td>
      <td class="px-3 py-3">${u._count.transactions}</td>
      <td class="px-3 py-3">${u._count.assets}</td>
      <td class="px-3 py-3">
        <div class="flex flex-wrap gap-2">
          ${
            u.deletedAt
              ? `<button class="js-restore rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500" data-id="${u.id}">Restore</button>`
              : `<button class="js-toggle rounded-lg ${u.isActive ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"} px-3 py-1.5 text-xs font-semibold text-white" data-id="${u.id}">${u.isActive ? "Disable" : "Enable"}</button>
                 <button class="js-role rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700" data-id="${u.id}" data-role="${u.role === "superadmin" ? "user" : "superadmin"}">${u.role === "superadmin" ? "Make User" : "Make Admin"}</button>
                 ${u.role === "superadmin" ? "" : `<button class="js-sub rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500" data-id="${u.id}">Set Subscription</button>`}
                 ${u.role === "superadmin" ? "" : `<button class="js-delete rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600" data-id="${u.id}">Delete</button>`}`
          }
        </div>
      </td>
    </tr>`).join("");

    const activityRows = activities.map((item) => `<tr class="border-b border-slate-100 text-sm">
      <td class="px-3 py-3 whitespace-nowrap">${dayjs(item.at).format("DD MMM YYYY HH:mm")}</td>
      <td class="px-3 py-3">${escapeHtml(item.actor)}</td>
      <td class="px-3 py-3"><span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">${escapeHtml(item.type)}</span></td>
      <td class="px-3 py-3">${escapeHtml(item.detail)}</td>
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
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body
          });
          if (!res.ok) {
            let msg = 'Request gagal';
            try {
              const json = await res.json();
              if (json?.message) msg = json.message;
            } catch {}
            window.alert(msg);
            return;
          }
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

        document.querySelectorAll('.js-sub').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!id) return;
            const plan = window.prompt('Plan (contoh: free_trial/basic/pro/enterprise):', 'basic');
            if (!plan) return;
            const status = window.prompt('Status (active/past_due/suspended/canceled):', 'active');
            if (!status) return;
            const durationDays = window.prompt('Duration days (angka, kosong = no expiry):', '30');
            const body = 'plan=' + encodeURIComponent(plan)
              + '&status=' + encodeURIComponent(status)
              + '&durationDays=' + encodeURIComponent(durationDays || '');
            await post('/admin/users/' + id + '/subscription', body);
          });
        });

        document.querySelectorAll('.js-delete').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!id) return;
            if (!window.confirm('Delete user ini? User tidak bisa login/bot sampai di-restore.')) return;
            await post('/admin/users/' + id + '/delete', '');
          });
        });

        document.querySelectorAll('.js-restore').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!id) return;
            if (!window.confirm('Restore user ini?')) return;
            await post('/admin/users/' + id + '/restore', '');
          });
        });

        const labels = ${JSON.stringify(monthBuckets.map((m) => m.label))};
        const values = ${JSON.stringify(monthBuckets.map((m) => m.count))};
        const chartEl = document.getElementById('users-chart');
        if (chartEl && window.Chart) {
          new window.Chart(chartEl, {
            type: 'line',
            data: {
              labels,
              datasets: [{
                label: 'New Users',
                data: values,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37,99,235,0.15)',
                tension: 0.35,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 5
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { grid: { display: false } }
              }
            }
          });
        }
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

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Total users</p><p class="mt-1 text-2xl font-bold">${data.users.length}</p></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Deleted users</p><p class="mt-1 text-2xl font-bold">${deletedUsersCount}</p></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Total transaksi</p><p class="mt-1 text-2xl font-bold">${data.txCount}</p></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><p class="text-xs text-mist">Total aset</p><p class="mt-1 text-2xl font-bold">${data.assetCount}</p></div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 class="text-lg font-semibold">User Growth (6 Bulan)</h2>
          <p class="mt-1 text-sm text-mist">Pertumbuhan pendaftaran user per bulan.</p>
          <div class="mt-4 h-64">
            <canvas id="users-chart"></canvas>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-semibold">Manajemen User</h2>
            <input id="user-search" class="w-full max-w-xs rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Cari nama/email" />
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th class="px-3 py-2">Nama</th><th class="px-3 py-2">Email</th><th class="px-3 py-2">Role</th><th class="px-3 py-2">Subscription</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Tx</th><th class="px-3 py-2">Aset</th><th class="px-3 py-2">Aksi</th></tr></thead>
              <tbody>${userRows || '<tr><td colspan="8" class="px-3 py-4 text-sm text-slate-500">Belum ada user.</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 class="text-lg font-semibold">Log Aktivitas Terbaru</h2>
          <div class="mt-3 overflow-x-auto">
            <table class="min-w-full">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th class="px-3 py-2">Waktu</th><th class="px-3 py-2">Actor</th><th class="px-3 py-2">Aksi</th><th class="px-3 py-2">Detail</th></tr></thead>
              <tbody>${activityRows || '<tr><td colspan="4" class="px-3 py-4 text-sm text-slate-500">Belum ada aktivitas.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script>${script}</script>`
    ));
  });

  app.post("/admin/users/:id/toggle-active", authMiddleware, superadminOnly, async (req, res) => {
    try {
      await toggleUserActive(String(req.params.id));
      if (req.headers["x-requested-with"] === "XMLHttpRequest") return res.json({ ok: true });
      return res.redirect("/admin");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (req.headers["x-requested-with"] === "XMLHttpRequest") {
        return res.status(400).json({ ok: false, message });
      }
      return res.redirect("/admin");
    }
  });

  app.post("/admin/users/:id/role", authMiddleware, superadminOnly, async (req, res) => {
    try {
      const role = String(req.body.role) === "superadmin" ? "superadmin" : "user";
      await updateUserRole(String(req.params.id), role);
      if (req.headers["x-requested-with"] === "XMLHttpRequest") return res.json({ ok: true });
      return res.redirect("/admin");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (req.headers["x-requested-with"] === "XMLHttpRequest") {
        return res.status(400).json({ ok: false, message });
      }
      return res.redirect("/admin");
    }
  });

  app.post("/admin/users/:id/delete", authMiddleware, superadminOnly, async (req: ReqWithSession, res) => {
    try {
      await softDeleteUserByAdmin(String(req.params.id), req.session?.userId);
      if (req.headers["x-requested-with"] === "XMLHttpRequest") return res.json({ ok: true });
      return res.redirect("/admin");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (req.headers["x-requested-with"] === "XMLHttpRequest") {
        return res.status(400).json({ ok: false, message });
      }
      return res.redirect("/admin");
    }
  });

  app.post("/admin/users/:id/soft-delete", authMiddleware, superadminOnly, async (req: ReqWithSession, res) => {
    try {
      await softDeleteUserByAdmin(String(req.params.id), req.session?.userId);
      if (req.headers["x-requested-with"] === "XMLHttpRequest") return res.json({ ok: true });
      return res.redirect("/admin");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (req.headers["x-requested-with"] === "XMLHttpRequest") {
        return res.status(400).json({ ok: false, message });
      }
      return res.redirect("/admin");
    }
  });

  app.post("/admin/users/:id/restore", authMiddleware, superadminOnly, async (req, res) => {
    try {
      await restoreSoftDeletedUserByAdmin(String(req.params.id));
      if (req.headers["x-requested-with"] === "XMLHttpRequest") return res.json({ ok: true });
      return res.redirect("/admin");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (req.headers["x-requested-with"] === "XMLHttpRequest") {
        return res.status(400).json({ ok: false, message });
      }
      return res.redirect("/admin");
    }
  });

  app.post("/admin/users/:id/subscription", authMiddleware, superadminOnly, async (req, res) => {
    try {
      const statusRaw = String(req.body.status ?? "active");
      const status = (["active", "past_due", "suspended", "canceled"] as const).includes(statusRaw as any)
        ? (statusRaw as "active" | "past_due" | "suspended" | "canceled")
        : "active";
      const durationDaysRaw = String(req.body.durationDays ?? "").trim();
      const durationDays = durationDaysRaw ? Number(durationDaysRaw) : undefined;

      await updateUserSubscription({
        userId: String(req.params.id),
        plan: String(req.body.plan ?? "basic"),
        status,
        durationDays: Number.isFinite(durationDays) ? durationDays : undefined
      });

      if (req.headers["x-requested-with"] === "XMLHttpRequest") return res.json({ ok: true });
      return res.redirect("/admin");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (req.headers["x-requested-with"] === "XMLHttpRequest") {
        return res.status(400).json({ ok: false, message });
      }
      return res.redirect("/admin");
    }
  });

  app.listen(config.WEB_PORT, () => {
    logger.info({ port: config.WEB_PORT }, "Web dashboard started");
  });
}
