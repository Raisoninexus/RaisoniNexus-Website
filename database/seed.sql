INSERT INTO public.branches (name, short_name, description)
SELECT seed.name, seed.short_name, seed.description
FROM (
  VALUES
    ('Computer Science and Engineering - Computer Science', 'CSE CS', 'Computer science foundations, programming, algorithms and systems.'),
    ('Computer Science and Engineering - Data Science', 'CSE DS', 'Data science, statistics, machine learning and analytics.'),
    ('Computer Engineering', 'COE', 'Computer engineering, software systems and hardware foundations.'),
    ('Computer Science and Engineering - Artificial Intelligence', 'CSE AI', 'Artificial intelligence, intelligent systems and applied computing.'),
    ('Computer Science and Engineering - Artificial Intelligence and Machine Learning', 'CSE AIML', 'Artificial intelligence, machine learning and data-driven systems.'),
    ('Electrical Engineering', 'Electrical', 'Electrical power, circuits, machines and control systems.'),
    ('Electronics and Telecommunication Engineering', 'ENTC', 'Electronics, communication systems and signal processing.'),
    ('Civil Engineering', 'Civil', 'Civil engineering, structural design and infrastructure.'),
    ('Mechanical Engineering', 'Mechanical', 'Mechanical design, manufacturing and thermal engineering.')
) AS seed(name, short_name, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.branches existing
  WHERE lower(existing.short_name) = lower(seed.short_name)
);

INSERT INTO public.semesters (name, number)
SELECT 'Semester ' || semester_number, semester_number
FROM generate_series(1, 8) AS sequence(semester_number)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.semesters existing
  WHERE existing.number = semester_number
);

INSERT INTO public.branches (name, short_name, description)
SELECT 'Information Technology', 'IT', 'Information technology, software systems and computing.'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.branches existing
  WHERE lower(existing.short_name) = 'it'
);

WITH target_branches AS (
  SELECT id
  FROM public.branches
  WHERE short_name IN ('CSE AIML', 'CSE AI', 'COE', 'IT')
),
target_semester AS (
  SELECT id
  FROM public.semesters
  WHERE number = 2
),
seed_subjects (name) AS (
  VALUES
    ('Engineering Physics'),
    ('M&DC'),
    ('IKS'),
    ('Digital Fabrication'),
    ('FDA'),
    ('English')
)
INSERT INTO public.subjects (name, branch_id, semester_id)
SELECT seed_subjects.name, target_branches.id, target_semester.id
FROM target_branches
CROSS JOIN target_semester
CROSS JOIN seed_subjects
WHERE NOT EXISTS (
  SELECT 1
  FROM public.subjects existing
  WHERE existing.branch_id = target_branches.id
    AND existing.semester_id = target_semester.id
    AND lower(existing.name) = lower(seed_subjects.name)
);
