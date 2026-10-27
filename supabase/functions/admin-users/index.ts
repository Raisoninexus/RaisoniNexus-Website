import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'https://raisoninexus-website.vercel.app',
  'http://127.0.0.1:8765',
  'http://localhost:8765'
]);

const adminRoles = new Set(['admin', 'content_manager', 'student_support', 'admin_readonly']);
const headersFor = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin)
    ? origin
    : 'https://raisoninexus-website.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Vary': 'Origin'
});

const response = (body: Record<string, unknown>, status: number, headers: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  const headers = headersFor(request.headers.get('origin'));
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405, headers);

  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return response({ error: 'Authentication required.' }, 401, headers);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Admin user function is missing Supabase environment settings.');
    return response({ error: 'User management is not configured.' }, 500, headers);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return response({ error: 'Invalid or expired session.' }, 401, headers);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: caller, error: callerError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (callerError) {
    console.error('Admin caller lookup failed:', callerError.message);
    return response({ error: 'Unable to verify administrator access.' }, 500, headers);
  }
  if (!caller || !adminRoles.has(caller.role)) return response({ error: 'Administrator access required.' }, 403, headers);

  let payload: { action?: string; email?: string; role?: string; userId?: string };
  try {
    payload = await request.json();
  } catch {
    return response({ error: 'Invalid request body.' }, 400, headers);
  }

  if (payload.action === 'list_auth') {
    if (!['admin', 'student_support', 'admin_readonly'].includes(caller.role)) {
      return response({ error: 'You do not have permission to view student verification details.' }, 403, headers);
    }

    const authUsers = [];
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error('Auth user list failed:', error.message);
        return response({ error: 'Unable to load account verification details.' }, 500, headers);
      }
      authUsers.push(...data.users);
      if (data.users.length < 1000) break;
    }

    const statuses = Object.fromEntries(authUsers.map((user) => {
      const providers = Array.isArray(user.app_metadata?.providers)
        ? user.app_metadata.providers.filter((provider): provider is string => typeof provider === 'string')
        : typeof user.app_metadata?.provider === 'string'
          ? [user.app_metadata.provider]
          : [];
      return [user.id, {
        verified: Boolean(user.email_confirmed_at),
        providers: [...new Set(providers)]
      }];
    }));
    return response({ authStatus: statuses }, 200, headers);
  }

  if (payload.action === 'invite_admin') {
    if (caller.role !== 'admin') return response({ error: 'Only a full administrator can invite admins.' }, 403, headers);
    const email = payload.email?.trim().toLowerCase();
    const role = payload.role;
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response({ error: 'Enter a valid email address.' }, 400, headers);
    }
    if (!role || !adminRoles.has(role)) return response({ error: 'Choose a valid admin access level.' }, 400, headers);

    const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://raisoninexus-website.vercel.app/admin/login.html'
    });
    if (error || !data.user) {
      return response({ error: error?.message || 'Unable to create the invitation.' }, 400, headers);
    }

    const { error: profileError } = await serviceClient
      .from('profiles')
      .update({ role })
      .eq('id', data.user.id);
    if (profileError) {
      const { error: rollbackError } = await serviceClient.auth.admin.deleteUser(data.user.id);
      console.error('Admin role assignment failed:', profileError.message);
      if (rollbackError) console.error('Failed to remove partially-created invited user:', rollbackError.message);
      return response({ error: 'Invitation could not be assigned the selected role. No invitation was kept.' }, 500, headers);
    }

    return response({ invited: true, role }, 200, headers);
  }

  if (payload.action === 'delete_student') {
    if (!['admin', 'student_support'].includes(caller.role)) {
      return response({ error: 'You do not have permission to remove students.' }, 403, headers);
    }
    const userId = payload.userId;
    if (!userId || userId === authData.user.id) return response({ error: 'Invalid student account.' }, 400, headers);

    const { data: target, error: targetError } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (targetError) {
      console.error('Student removal lookup failed:', targetError.message);
      return response({ error: 'Unable to verify the selected student account.' }, 500, headers);
    }
    if (!target || target.role !== 'student') {
      return response({ error: 'Only student accounts can be removed here.' }, 404, headers);
    }

    const { error } = await serviceClient.auth.admin.deleteUser(userId);
    if (error) {
      console.error('Student account removal failed:', error.message);
      return response({ error: 'Unable to remove the student account.' }, 500, headers);
    }
    return response({ deleted: true }, 200, headers);
  }

  return response({ error: 'Unsupported user-management action.' }, 400, headers);
});
