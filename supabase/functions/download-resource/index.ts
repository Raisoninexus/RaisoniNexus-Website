import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.10';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('SITE_URL') || 'https://raisoninexus-website.vercel.app';
const corsHeaders = {
  'Access-Control-Allow-Origin': siteUrl,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for this edge function.');
}
const projectOrigin = new URL(supabaseUrl).origin;

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return null;
  return authorization.slice('Bearer '.length).trim();
}

async function getSignedStorageUrl(supabase: SupabaseClient<any>, fileUrl: string) {
  if (!fileUrl) return null;

  let objectPath = fileUrl.trim();

  if (/^https?:\/\//i.test(objectPath)) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(objectPath);
    } catch {
      return null;
    }

    if (parsedUrl.origin !== projectOrigin) return null;
    const objectMatch = parsedUrl.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/resources\/(.+)$/);
    if (!objectMatch) return null;
    objectPath = objectMatch[1];
  } else {
    const rawStorageMatch = objectPath.match(/^\/?storage\/v1\/object\/(?:public|sign)\/resources\/(.+)$/);
    if (rawStorageMatch) {
      objectPath = rawStorageMatch[1];
    }
  }

  try {
    objectPath = decodeURIComponent(objectPath.replace(/^\/+/, ''));
  } catch {
    return null;
  }

  if (!objectPath || objectPath.split('/').some((segment) => segment === '.' || segment === '..')) return null;

  const { data, error } = await supabase.storage.from('resources').createSignedUrl(objectPath, 300);
  if (error || !data?.signedUrl) {
    console.error('Protected resource signed URL could not be created:', error?.message || 'Missing URL');
    return null;
  }
  return data.signedUrl;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Authentication required to download study materials.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const authClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Your session has expired. Please sign in again.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json().catch(() => ({}));
  const resourceId = String(body.resource_id ?? body.resourceId ?? '').trim();

  if (!resourceId) {
    return new Response(JSON.stringify({ error: 'A resource identifier is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { data: resource, error: resourceError } = await authClient
    .from('resources')
    .select('id, title, file_url, file_name, file_type, status')
    .eq('id', resourceId)
    .eq('status', 'published')
    .maybeSingle();

  if (resourceError || !resource) {
    return new Response(JSON.stringify({ error: 'The requested resource is unavailable.' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const downloadUrl = await getSignedStorageUrl(authClient, resource.file_url ?? '');
  if (!downloadUrl) {
    return new Response(JSON.stringify({ error: 'This study material is not available for download.' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { error: insertError } = await authClient.from('downloads').insert({
    user_id: user.id,
    resource_id: resource.id
  });

  if (insertError) {
    console.error('Failed to persist resource download:', insertError.message);
  }

  return new Response(JSON.stringify({
    ok: true,
    url: downloadUrl,
    fileName: resource.file_name || `${resource.title}.${resource.file_type || 'pdf'}`
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
