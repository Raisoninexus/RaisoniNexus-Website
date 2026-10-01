ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

DROP POLICY IF EXISTS "Profiles are readable by owner or admin" ON public.profiles;
CREATE POLICY "Profiles are readable by owner or admin"
ON public.profiles FOR SELECT
USING (
  auth.uid() = id
  OR public.is_admin()
);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING ((auth.uid() = id AND role = 'student') OR public.is_admin())
WITH CHECK ((auth.uid() = id AND role = 'student') OR public.is_admin());

DROP POLICY IF EXISTS "Anyone can read published resources" ON public.resources;
CREATE POLICY "Anyone can read published resources"
ON public.resources FOR SELECT
USING (status = 'published');

DROP POLICY IF EXISTS "Admins can manage all resources" ON public.resources;
CREATE POLICY "Admins can manage all resources"
ON public.resources FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can manage their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can manage their own bookmarks"
ON public.bookmarks FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can record their own downloads" ON public.downloads;
CREATE POLICY "Users can record their own downloads"
ON public.downloads FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read their own download history" ON public.downloads;
CREATE POLICY "Users can read their own download history"
ON public.downloads FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all downloads" ON public.downloads;
CREATE POLICY "Admins can read all downloads"
ON public.downloads FOR SELECT
USING (public.is_admin());

DROP POLICY IF EXISTS "Anyone can read published notices" ON public.notices;
CREATE POLICY "Anyone can read published notices"
ON public.notices FOR SELECT
USING (published = TRUE);

DROP POLICY IF EXISTS "Admins can manage notices" ON public.notices;
CREATE POLICY "Admins can manage notices"
ON public.notices FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can read taxonomy tables" ON public.branches;
DROP POLICY IF EXISTS "Public can read branches" ON public.branches;
CREATE POLICY "Public can read branches"
ON public.branches FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "Admins can manage branches" ON public.branches;
CREATE POLICY "Admins can manage branches"
ON public.branches FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins can read semester data" ON public.semesters;
DROP POLICY IF EXISTS "Public can read semesters" ON public.semesters;
CREATE POLICY "Public can read semesters"
ON public.semesters FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "Admins can manage semesters" ON public.semesters;
CREATE POLICY "Admins can manage semesters"
ON public.semesters FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins can read subject data" ON public.subjects;
DROP POLICY IF EXISTS "Public can read subjects" ON public.subjects;
CREATE POLICY "Public can read subjects"
ON public.subjects FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "Admins can manage subjects" ON public.subjects;
CREATE POLICY "Admins can manage subjects"
ON public.subjects FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Storage buckets for app assets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('resources', 'resources', true),
  ('thumbnails', 'thumbnails', true),
  ('avatars', 'avatars', true),
  ('notices', 'notices', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can read uploaded files" ON storage.objects;
CREATE POLICY "Public can read uploaded files"
ON storage.objects FOR SELECT
USING (bucket_id IN ('resources', 'thumbnails', 'avatars', 'notices'));

DROP POLICY IF EXISTS "Admins can upload files" ON storage.objects;
CREATE POLICY "Admins can upload files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id IN ('resources', 'thumbnails', 'avatars', 'notices')
  AND public.is_admin()
);

DROP POLICY IF EXISTS "Admins can update or delete files" ON storage.objects;
CREATE POLICY "Admins can update or delete files"
ON storage.objects FOR UPDATE USING (
  public.is_admin()
);

DROP POLICY IF EXISTS "Admins can delete files" ON storage.objects;
CREATE POLICY "Admins can delete files"
ON storage.objects FOR DELETE USING (
  public.is_admin()
);

-- Ensure you create admin users in Supabase Auth first, then assign them role='admin' in public.profiles.
-- Never expose the service-role key in frontend code.
