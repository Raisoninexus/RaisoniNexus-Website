ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'admin', 'content_manager', 'student_support', 'admin_readonly'));

CREATE OR REPLACE FUNCTION public.admin_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = (SELECT auth.uid())
    AND role IN ('admin', 'content_manager', 'student_support', 'admin_readonly')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(public.admin_role() = 'admin', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_content()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(public.admin_role() IN ('admin', 'content_manager'), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.can_support_students()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(public.admin_role() IN ('admin', 'student_support'), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.can_view_admin_data()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.admin_role() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_content() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_support_students() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_admin_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_content() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_support_students() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_admin_data() TO anon, authenticated;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, branch_id, semester_id, avatar_url) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Profiles are readable by owner or admin" ON public.profiles;
CREATE POLICY "Profiles are readable by owner or authorized admin"
ON public.profiles FOR SELECT
USING (
  auth.uid() = id
  OR public.is_admin()
  OR public.can_support_students()
  OR public.admin_role() = 'admin_readonly'
);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Students and support admins can update student profiles"
ON public.profiles FOR UPDATE
USING (
  (auth.uid() = id AND role = 'student')
  OR (public.can_support_students() AND role = 'student')
)
WITH CHECK (
  (auth.uid() = id AND role = 'student')
  OR (public.can_support_students() AND role = 'student')
);

DROP POLICY IF EXISTS "Admins can manage all resources" ON public.resources;
CREATE POLICY "Admins and content managers can manage resources"
ON public.resources FOR ALL
USING (public.can_manage_content())
WITH CHECK (public.can_manage_content());

DROP POLICY IF EXISTS "Admins can read all downloads" ON public.downloads;
CREATE POLICY "Authorized admins can read download analytics"
ON public.downloads FOR SELECT
USING (
  public.is_admin()
  OR public.can_manage_content()
  OR public.admin_role() = 'admin_readonly'
);

DROP POLICY IF EXISTS "Admins can manage notices" ON public.notices;
CREATE POLICY "Admins and content managers can manage notices"
ON public.notices FOR ALL
USING (public.can_manage_content())
WITH CHECK (public.can_manage_content());
DROP POLICY IF EXISTS "Read-only admins can read all notices" ON public.notices;
CREATE POLICY "Read-only admins can read all notices"
ON public.notices FOR SELECT
USING (public.admin_role() = 'admin_readonly');

DROP POLICY IF EXISTS "Admins can manage material requests" ON public.material_requests;
CREATE POLICY "Support admins can manage material requests"
ON public.material_requests FOR ALL TO authenticated
USING (public.can_support_students())
WITH CHECK (public.can_support_students());
DROP POLICY IF EXISTS "Read-only admins can view material requests" ON public.material_requests;
CREATE POLICY "Read-only admins can view material requests"
ON public.material_requests FOR SELECT TO authenticated
USING (public.admin_role() = 'admin_readonly');

DROP POLICY IF EXISTS "Admins can manage branches" ON public.branches;
CREATE POLICY "Content admins can manage branches"
ON public.branches FOR ALL
USING (public.can_manage_content())
WITH CHECK (public.can_manage_content());

DROP POLICY IF EXISTS "Admins can manage semesters" ON public.semesters;
CREATE POLICY "Content admins can manage semesters"
ON public.semesters FOR ALL
USING (public.can_manage_content())
WITH CHECK (public.can_manage_content());

DROP POLICY IF EXISTS "Admins can manage subjects" ON public.subjects;
CREATE POLICY "Content admins can manage subjects"
ON public.subjects FOR ALL
USING (public.can_manage_content())
WITH CHECK (public.can_manage_content());

DROP POLICY IF EXISTS "Admins can read all resources" ON public.resources;
CREATE POLICY "Admin roles can read unpublished resources"
ON public.resources FOR SELECT
USING (
  public.can_manage_content()
  OR public.admin_role() = 'admin_readonly'
);

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

DROP POLICY IF EXISTS "Admins can read all material requests" ON public.material_requests;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.admin_role() IS NULL THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN jsonb_build_object(
    'resources', (SELECT COUNT(*) FROM public.resources),
    'downloads', (SELECT COUNT(*) FROM public.downloads),
    'students', (SELECT COUNT(*) FROM public.profiles WHERE role = 'student'),
    'new_students_30_days', (
      SELECT COUNT(*)
      FROM public.profiles
      WHERE role = 'student'
        AND created_at >= NOW() - INTERVAL '30 days'
    ),
    'branches', (SELECT COUNT(*) FROM public.branches WHERE is_active = TRUE),
    'subjects', (SELECT COUNT(*) FROM public.subjects WHERE is_active = TRUE)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;

DROP POLICY IF EXISTS "Admins can upload files" ON storage.objects;
CREATE POLICY "Content admins can upload files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id IN ('resources', 'thumbnails', 'avatars', 'notices')
  AND public.can_manage_content()
);

DROP POLICY IF EXISTS "Admins can update or delete files" ON storage.objects;
CREATE POLICY "Content admins can update files"
ON storage.objects FOR UPDATE
USING (
  bucket_id IN ('resources', 'thumbnails', 'avatars', 'notices')
  AND public.can_manage_content()
)
WITH CHECK (
  bucket_id IN ('resources', 'thumbnails', 'avatars', 'notices')
  AND public.can_manage_content()
);

DROP POLICY IF EXISTS "Admins can delete files" ON storage.objects;
CREATE POLICY "Content admins can delete files"
ON storage.objects FOR DELETE
USING (
  bucket_id IN ('resources', 'thumbnails', 'avatars', 'notices')
  AND public.can_manage_content()
);
