import { NextResponse } from "next/server";
import { getSessionToken, getUserForSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

type AdminUserRow = {
  id: string;
  email: string;
  role: string;
  plan: string;
  link_limit: number | null;
  created_at: string;
  link_count: number;
};

function requireAdmin(request: Request) {
  const user = getUserForSession(getSessionToken(request));
  if (!user || user.role !== "admin") {
    return null;
  }
  return user;
}

function serializeUser(row: AdminUserRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    plan: row.plan,
    linkLimit: row.link_limit,
    linkCount: Number(row.link_count),
    created_at: row.created_at,
  };
}

// GET /api/admin/users -> list all users with plan, link limit and usage.
export async function GET(request: Request) {
  try {
    if (!requireAdmin(request)) {
      return NextResponse.json({ error: "Only administrators can manage users." }, { status: 403 });
    }
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT Users.id, Users.email, Users.role, Users.plan, Users.link_limit, Users.created_at,
                (SELECT COUNT(*) FROM Links WHERE Links.user_id = Users.id) AS link_count
         FROM Users ORDER BY Users.created_at DESC`
      )
      .all() as AdminUserRow[];
    return NextResponse.json({ users: rows.map(serializeUser) });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH /api/admin/users -> change a user's plan (free/plus) and/or per-user link limit.
export async function PATCH(request: Request) {
  try {
    if (!requireAdmin(request)) {
      return NextResponse.json({ error: "Only administrators can manage users." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.userId === "string" ? body.userId : null;
    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

    const db = getDb();
    const target = db.prepare("SELECT id, email, role, plan, link_limit FROM Users WHERE id = ?").get(userId) as
      | (AdminUserRow & { password_hash?: string })
      | undefined;
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.plan !== undefined) {
      const plan = body.plan === "plus" ? "plus" : "free";
      // Switching to Plus clears the per-user link override (Plus has no link limit).
      if (plan === "plus") {
        updates.push("plan = ?", "link_limit = NULL");
        values.push(plan);
      } else {
        updates.push("plan = ?");
        values.push(plan);
      }
    }

    if (body.linkLimit !== undefined && body.linkLimit !== null && target.plan !== "plus") {
      const parsed = Number(body.linkLimit);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return NextResponse.json({ error: "linkLimit must be a positive number." }, { status: 400 });
      }
      updates.push("link_limit = ?");
      values.push(Math.floor(parsed));
    }

    if (updates.length > 0) {
      values.push(userId);
      db.prepare(`UPDATE Users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }

    const row = db
      .prepare(
        `SELECT Users.id, Users.email, Users.role, Users.plan, Users.link_limit, Users.created_at,
                (SELECT COUNT(*) FROM Links WHERE Links.user_id = Users.id) AS link_count
         FROM Users WHERE Users.id = ?`
      )
      .get(userId) as AdminUserRow;
    return NextResponse.json({ user: serializeUser(row) });
  } catch (error) {
    return errorResponse(error);
  }
}
